const UserModel = require('../models/user.model')
const { DmThreadModel, DmMessageModel } = require('../models/dm.model')
const { FollowModel } = require('../models/social.model')
const { isAllowedMediaUrl, isValidId, hasBlocked, publicUser, receiptsAllowed, LIMITS } = require('../helpers/chat')
const S = require('../helpers/social')

// Pixify Direct: Instagram-style messages, separate from Chats.
// Threads are one-to-one (one per pair) or groups. People you don't follow land in Requests until you accept.

const PAGE = 40
const THREAD_PAGE = 25
const MAX_GROUP = 64
const USER_FIELDS = '-password -devices -chatLockCode'

const handle = (fn) => async (req, res) => {
    try {
        const out = await fn(req, res)
        if (!res.headersSent) res.json({ success : true, ...(out || {}) })
    } catch (error) {
        if (error instanceof S.SocialError) return res.status(error.status).json({ message : error.message, error : true })
        if (error?.code === 11000) return res.status(409).json({ message : 'Please try again.', error : true })
        console.error('[dm]', error)
        return res.status(500).json({ message : 'Something went wrong. Please try again.', error : true })
    }
}

const fail = (message, status = 400) => new S.SocialError(message, status)
const loadMe = async (req) => {
    const me = await UserModel.findById(req.user._id).select(USER_FIELDS).lean()
    if (!me || me.deletedAt) throw fail('session out', 401)
    return me
}
const pairKeyOf = (a, b) => [String(a), String(b)].sort().join('_')
const memberOf = (thread, id) => thread.members.find((m) => String(m.userId) === String(id))
const others = (thread, id) => thread.members.filter((m) => String(m.userId) !== String(id))
const follows = async (follower, following) => !!(await FollowModel.exists({ follower, following, status : 'active' }))
// Instagram rule: messages from people you follow go to your inbox, everyone else's to Requests
const folderFor = async (recipient, sender) => ((await follows(recipient, sender)) ? 'inbox' : 'request')

const loadThread = async (id, meId) => {
    if (!isValidId(String(id))) throw fail('Conversation not found', 404)
    const thread = await DmThreadModel.findById(id).lean()
    if (!thread || !memberOf(thread, meId)) throw fail('Conversation not found', 404)
    return thread
}

/* ---------- shapes sent to the app ---------- */

const plural = (n, one, many) => (n === 1 ? one : many)
// short description of a message, from nobody's point of view (the app adds "You" / the name)
const previewOf = (m) => {
    if (m.kind === 'text') return String(m.text || '').slice(0, 120)
    if (m.kind === 'media') {
        const videos = (m.media || []).filter((x) => x.kind === 'video').length
        const n = (m.media || []).length
        if (videos === n) return n === 1 ? 'sent a video' : `sent ${n} videos`
        return n === 1 ? 'sent a photo' : `sent ${n} ${videos ? 'attachments' : 'photos'}`
    }
    if (m.kind === 'voice') return 'sent a voice message'
    if (m.kind === 'post') return 'sent a post'
    if (m.kind === 'profile') return 'sent a profile'
    if (m.kind === 'system') {
        const n = m.system?.targets?.length || 0
        return ({
            created : 'created the group',
            named : `named the group ${m.system?.value || ''}`.trim(),
            unnamed : 'removed the group name',
            photo : 'changed the group photo',
            photo_removed : 'removed the group photo',
            added : `added ${n} ${plural(n, 'person', 'people')}`,
            removed : 'removed someone from the group',
            left : 'left the group'
        })[m.system?.action] || ''
    }
    return ''
}

const activity = (user, viewer) => {
    const p = publicUser(user, viewer)
    return { online : !!p.online, ...(p.lastSeen && !p.online ? { lastSeen : p.lastSeen } : {}) }
}

const loadThreadUsers = (threads, extra = []) => S.loadUsers([...threads.flatMap((t) => t.members.map((m) => m.userId)), ...extra])

// default group name: "Asha, Bilal and 2 others"
const groupTitle = (people) => {
    const names = people.map((p) => p.username || p.name.split(' ')[0])
    if (names.length <= 3) return names.join(', ')
    return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`
}

const serializeThread = (t, viewer, users) => {
    const me = String(viewer._id)
    const mine = memberOf(t, me) || {}
    const people = others(t, me).map((m) => {
        const u = users[String(m.userId)]
        if (!u) return null
        // "Seen" only when both allow read receipts and they've accepted the conversation
        const showRead = m.status === 'inbox' && receiptsAllowed(viewer, u)
        return { ...S.personCard(u, viewer), ...activity(u, viewer), role : m.role, ...(showRead && m.lastReadAt ? { lastReadAt : m.lastReadAt } : {}) }
    }).filter(Boolean)
    const peer = t.isGroup ? null : people[0] || null
    const last = t.lastMessage?._id && (!mine.clearedAt || t.lastMessageAt > mine.clearedAt) ? t.lastMessage : null
    const fromUser = last && users[String(last.from)]
    const peerUser = peer && users[peer._id]
    return {
        _id : String(t._id),
        isGroup : !!t.isGroup,
        title : t.isGroup ? (t.name || groupTitle(people) || 'Just you') : peer?.profileName || peer?.name || 'Pixify user',
        name : t.name || '',
        avatar : t.avatar || '',
        peer,
        members : people,
        memberCount : t.members.length,
        admin : mine.role === 'admin',
        status : mine.status || 'inbox',
        muted : !!mine.muted,
        lastReadAt : mine.lastReadAt || null,
        lastMessageAt : last ? t.lastMessageAt : null,
        lastMessage : last ? { _id : String(last._id), kind : last.kind, preview : last.preview, mine : String(last.from) === me, fromName : fromUser ? S.personCard(fromUser, viewer).name.split(' ')[0] : '' } : null,
        unread : !!(last && String(last.from) !== me && (!mine.lastReadAt || t.lastMessageAt > mine.lastReadAt)),
        // can't send in a one-to-one chat when either person blocked the other
        ...(peerUser && hasBlocked(viewer, peerUser._id) ? { blockedByMe : true } : {}),
        ...(peerUser && (hasBlocked(peerUser, viewer._id) || peerUser.deletedAt) ? { unavailable : true } : {}),
        createdAt : t.createdAt
    }
}

const replyShape = (r, viewer, users) => {
    if (!r) return { deleted : true }
    const u = users[String(r.from)]
    return { _id : String(r._id), from : String(r.from), fromName : u ? S.personCard(u, viewer).name : '', kind : r.kind, preview : r.kind === 'text' ? String(r.text).slice(0, 140) : previewOf(r), ...(r.media?.[0] ? { thumb : r.media[0] } : {}) }
}

// messages -> what the app shows (reply quotes, shared profiles and group notices filled in)
const serializeMessages = async (msgs, viewer, preUsers = null) => {
    if (!msgs.length) return []
    const replyIds = msgs.map((m) => m.replyTo).filter(Boolean)
    const replies = replyIds.length ? await DmMessageModel.find({ _id : { $in : replyIds } }).lean() : []
    const repliesById = Object.fromEntries(replies.map((r) => [String(r._id), r]))
    const ids = msgs.flatMap((m) => [m.from, m.profile, m.system?.actor, ...(m.system?.targets || [])]).concat(replies.map((r) => r.from))
    const users = preUsers ? { ...preUsers } : {}
    const missing = ids.filter((id) => id && !users[String(id)])
    if (missing.length) Object.assign(users, await S.loadUsers(missing))
    const card = (id) => (users[String(id)] ? S.personCard(users[String(id)], viewer) : { _id : String(id), name : 'Pixify user', username : '' })
    return msgs.map((m) => ({
        _id : String(m._id),
        thread : String(m.thread),
        from : String(m.from),
        ...(m.clientId ? { clientId : m.clientId } : {}),
        kind : m.kind,
        text : m.text || '',
        ...(m.media?.length ? { media : m.media } : {}),
        ...(m.audio?.url ? { audio : m.audio } : {}),
        ...(m.post ? { post : String(m.post) } : {}),
        ...(m.profile ? { profile : users[String(m.profile)] && !users[String(m.profile)].deletedAt ? card(m.profile) : { unavailable : true } } : {}),
        ...(m.replyTo ? { replyTo : replyShape(repliesById[String(m.replyTo)], viewer, users) } : {}),
        reactions : (m.reactions || []).map((r) => ({ userId : String(r.userId), emoji : r.emoji })),
        ...(m.editedAt ? { editedAt : m.editedAt } : {}),
        ...(m.system?.action ? { system : { action : m.system.action, actor : card(m.system.actor), targets : (m.system.targets || []).map(card), value : m.system.value || '' } } : {}),
        createdAt : m.createdAt
    }))
}

/* ---------- live updates ---------- */

const emitDm = (userId, data) => S.emitTo(userId, 'px-dm', data)

// send each member their own copy of a new / changed message
const broadcastMessage = async (thread, msg, type = 'message') => {
    const users = await loadThreadUsers([thread], [msg.from, msg.profile])
    for (const m of thread.members) {
        const viewer = users[String(m.userId)]
        if (!viewer) continue
        if (m.clearedAt && msg.createdAt <= m.clearedAt) continue
        const [message] = await serializeMessages([msg], viewer, users)
        emitDm(m.userId, { type, threadId : String(thread._id), message, thread : serializeThread(thread, viewer, users) })
    }
}

const broadcastThread = async (thread, extraUserIds = []) => {
    const users = await loadThreadUsers([thread])
    for (const m of thread.members) {
        const viewer = users[String(m.userId)]
        if (viewer) emitDm(m.userId, { type : 'thread', threadId : String(thread._id), thread : serializeThread(thread, viewer, users) })
    }
    for (const id of extraUserIds) emitDm(id, { type : 'thread-remove', threadId : String(thread._id) })
}

/* ---------- sending ---------- */

const cleanMedia = (media) => {
    if (!Array.isArray(media) || !media.length || media.length > 10) throw fail('Send up to 10 photos or videos at a time')
    return media.map((m) => {
        if (!m || !['image', 'video'].includes(m.kind) || !m.url || !isAllowedMediaUrl(m.url)) throw fail('Invalid photo or video')
        const out = { url : m.url, kind : m.kind }
        if (Number.isFinite(m.width) && Number.isFinite(m.height) && m.width > 0 && m.height > 0) { out.width = Math.round(m.width); out.height = Math.round(m.height) }
        return out
    })
}

const cleanAudio = (a) => {
    if (!a?.url || !isAllowedMediaUrl(a.url)) throw fail('Invalid voice message')
    const duration = Number(a.duration)
    if (!Number.isFinite(duration) || duration <= 0 || duration > 15 * 60) throw fail('Invalid voice message')
    const waveform = Array.isArray(a.waveform) ? a.waveform.slice(0, 60).map((v) => Math.max(0, Math.min(1, Number(v) || 0))) : undefined
    return { url : a.url, duration, ...(waveform ? { waveform } : {}) }
}

// may `me` send into this thread right now?
const assertCanSend = async (thread, me) => {
    if (thread.isGroup) return
    const peerId = others(thread, me._id)[0]?.userId
    const peer = peerId && await UserModel.findById(peerId).select('blocked deletedAt username name').lean()
    if (!peer || peer.deletedAt) throw fail("This account isn't available")
    if (hasBlocked(me, peer._id)) throw fail(`Unblock ${peer.username || peer.name} to send a message`)
    if (hasBlocked(peer, me._id)) throw fail("You can't message this account")
}

// creates the message, updates the thread and tells everyone. `body` is already validated.
const createMessage = async (threadId, me, body) => {
    if (body.clientId) {
        const existing = await DmMessageModel.findOne({ from : me._id, clientId : body.clientId }).lean()
        if (existing) return existing
    }
    const msg = (await DmMessageModel.create({ thread : threadId, from : me._id, ...body })).toObject()
    const now = msg.createdAt
    // replying moves a request to the inbox; a person who now follows the sender gets it in their inbox too
    const thread = await DmThreadModel.findById(threadId).lean()
    const set = {
        lastMessageAt : now,
        lastMessage : { _id : msg._id, from : me._id, kind : msg.kind, preview : previewOf(msg) }
    }
    const members = await Promise.all(thread.members.map(async (m) => {
        const out = { ...m }
        if (String(m.userId) === String(me._id)) {
            out.lastReadAt = now
            if (body.kind !== 'system') out.status = 'inbox'
        } else if (m.status === 'request' && await follows(m.userId, me._id)) {
            out.status = 'inbox'
        }
        return out
    }))
    const updated = await DmThreadModel.findByIdAndUpdate(threadId, { $set : { ...set, members } }, { new : true }).lean()
    await broadcastMessage(updated, msg)
    return msg
}

const systemMessage = (thread, me, action, { targets, value } = {}) =>
    createMessage(thread._id, me, { kind : 'system', system : { action, actor : me._id, ...(targets ? { targets } : {}), ...(value ? { value } : {}) } })

// validates what the app sent and turns it into a message body
const buildBody = async (body, me) => {
    const out = {}
    if (typeof body.clientId === 'string' && body.clientId.length <= 64) out.clientId = body.clientId
    if (body.replyTo !== undefined && body.replyTo !== null) {
        if (!isValidId(String(body.replyTo))) throw fail('Invalid reply')
        out.replyTo = body.replyTo
    }
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (body.postId) {
        const ctx = await S.viewerContext(me, 'pixify')
        const { post } = await S.loadVisiblePost(body.postId, ctx)
        return { ...out, kind : 'post', post : post._id }
    }
    if (body.profileId) {
        const u = await S.findUserByHandle(body.profileId)
        if (!u || S.blockedEitherWay(me, u)) throw fail("This account isn't available")
        return { ...out, kind : 'profile', profile : u._id }
    }
    if (body.audio) return { ...out, kind : 'voice', audio : cleanAudio(body.audio) }
    if (body.media) return { ...out, kind : 'media', media : cleanMedia(body.media) }
    if (!text) throw fail('Write a message')
    if (text.length > LIMITS.TEXT_MAX) throw fail('Message is too long')
    return { ...out, kind : 'text', text }
}

/* ---------- threads ---------- */

const visibleTo = (t, me) => {
    const m = memberOf(t, me)
    return !!(m && t.lastMessageAt && (!m.clearedAt || t.lastMessageAt > m.clearedAt))
}

// GET /dm/threads?folder=inbox|requests&before=
const listThreads = handle(async (req) => {
    const me = await loadMe(req)
    const status = req.query.folder === 'requests' ? 'request' : 'inbox'
    const filter = { members : { $elemMatch : { userId : me._id, status } }, lastMessageAt : { $exists : true } }
    if (req.query.before && !Number.isNaN(Date.parse(req.query.before))) filter.lastMessageAt = { $lt : new Date(req.query.before) }
    const threads = await DmThreadModel.find(filter).sort({ lastMessageAt : -1 }).limit(THREAD_PAGE).lean()
    const users = await loadThreadUsers(threads, threads.map((t) => t.lastMessage?.from))
    const list = threads.filter((t) => visibleTo(t, me._id)).map((t) => serializeThread(t, me, users))
    return { threads : list, next : threads.length === THREAD_PAGE ? threads[threads.length - 1].lastMessageAt : null }
})

// GET /dm/unread -> { inbox: threads with new messages, requests: waiting requests }
const unreadCounts = async (meId) => {
    const threads = await DmThreadModel.find({ 'members.userId' : meId, lastMessageAt : { $exists : true } }).select('members lastMessage lastMessageAt').lean()
    let inbox = 0, requests = 0
    for (const t of threads) {
        if (!visibleTo(t, meId)) continue
        const m = memberOf(t, meId)
        if (m.status === 'request') requests++
        else if (!m.muted && String(t.lastMessage?.from) !== String(meId) && (!m.lastReadAt || t.lastMessageAt > m.lastReadAt)) inbox++
    }
    return { inbox, requests }
}
const unread = handle(async (req) => unreadCounts(req.user._id))

const threadOut = async (thread, me) => serializeThread(thread, me, await loadThreadUsers([thread], [thread.lastMessage?.from]))

// one-to-one thread with someone (made when first opened; shows in lists after the first message)
const openWith = async (me, other) => {
    if (String(other._id) === String(me._id)) throw fail("You can't message yourself")
    if (hasBlocked(other, me._id)) throw fail("This account isn't available", 404)
    const pairKey = pairKeyOf(me._id, other._id)
    let thread = await DmThreadModel.findOne({ pairKey }).lean()
    if (!thread) {
        const status = await folderFor(other._id, me._id)
        try {
            thread = (await DmThreadModel.create({ pairKey, createdBy : me._id, members : [{ userId : me._id, status : 'inbox' }, { userId : other._id, status }] })).toObject()
        } catch (error) {
            if (error?.code !== 11000) throw error
            thread = await DmThreadModel.findOne({ pairKey }).lean()
        }
    }
    return thread
}

// GET /dm/with/:handle
const withUser = handle(async (req) => {
    const me = await loadMe(req)
    const other = await S.findUserByHandle(req.params.handle)
    if (!other) throw fail("This account isn't available", 404)
    return { thread : await threadOut(await openWith(me, other), me) }
})

const peopleFrom = async (ids, me) => {
    const unique = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter((id) => id !== String(me._id))
    if (unique.some((id) => !isValidId(id))) throw fail('Invalid people')
    const users = await UserModel.find({ _id : { $in : unique }, deletedAt : { $exists : false } }).select(USER_FIELDS).lean()
    if (users.length !== unique.length) throw fail("Some of these accounts aren't available")
    if (users.some((u) => S.blockedEitherWay(me, u))) throw fail("Some of these accounts aren't available")
    return users
}

// POST /dm/threads { userIds, name } -> one person: their one-to-one chat; more: a new group
const createThread = handle(async (req) => {
    const me = await loadMe(req)
    const people = await peopleFrom(req.body.userIds, me)
    if (!people.length) throw fail('Choose who to message')
    if (people.length === 1 && !req.body.group) return { thread : await threadOut(await openWith(me, people[0]), me) }
    if (people.length + 1 > MAX_GROUP) throw fail(`Groups can have up to ${MAX_GROUP} people`)
    const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 100) : ''
    const members = [{ userId : me._id, role : 'admin', status : 'inbox' }]
    for (const p of people) members.push({ userId : p._id, role : 'member', status : await folderFor(p._id, me._id) })
    const thread = await DmThreadModel.create({ isGroup : true, name, createdBy : me._id, members })
    await systemMessage(thread, me, 'created')
    return { thread : await threadOut(await DmThreadModel.findById(thread._id).lean(), me) }
})

// GET /dm/threads/:id
const getThread = handle(async (req) => {
    const me = await loadMe(req)
    return { thread : await threadOut(await loadThread(req.params.id, me._id), me) }
})

// GET /dm/threads/:id/messages?before=  (oldest first)
const listMessages = handle(async (req) => {
    const me = await loadMe(req)
    const thread = await loadThread(req.params.id, me._id)
    const mine = memberOf(thread, me._id)
    const createdAt = {}
    if (mine.clearedAt) createdAt.$gt = mine.clearedAt
    if (req.query.before && !Number.isNaN(Date.parse(req.query.before))) createdAt.$lt = new Date(req.query.before)
    const msgs = await DmMessageModel.find({ thread : thread._id, ...(Object.keys(createdAt).length ? { createdAt } : {}) }).sort({ createdAt : -1 }).limit(PAGE).lean()
    msgs.reverse()
    return { messages : await serializeMessages(msgs, me), next : msgs.length === PAGE ? msgs[0].createdAt : null }
})

// POST /dm/threads/:id/messages
const sendMessage = handle(async (req) => {
    const me = await loadMe(req)
    const thread = await loadThread(req.params.id, me._id)
    await assertCanSend(thread, me)
    const body = await buildBody(req.body || {}, me)
    if (body.replyTo && !(await DmMessageModel.exists({ _id : body.replyTo, thread : thread._id }))) throw fail('Invalid reply')
    const msg = await createMessage(thread._id, me, body)
    const [message] = await serializeMessages([msg], me)
    return { message }
})

// POST /dm/share { postId | profileId, threadIds, userIds, text } (the paper-plane share sheet)
const share = handle(async (req) => {
    const me = await loadMe(req)
    const threadIds = [...new Set((Array.isArray(req.body.threadIds) ? req.body.threadIds : []).map(String))]
    const userIds = [...new Set((Array.isArray(req.body.userIds) ? req.body.userIds : []).map(String))]
    if (!threadIds.length && !userIds.length) throw fail('Choose who to send to')
    if (threadIds.length + userIds.length > 20) throw fail('Send to up to 20 at a time')
    const body = await buildBody({ postId : req.body.postId, profileId : req.body.profileId }, me)
    if (body.kind !== 'post' && body.kind !== 'profile') throw fail('Nothing to share')
    const text = typeof req.body.text === 'string' ? req.body.text.trim().slice(0, LIMITS.TEXT_MAX) : ''
    const targets = []
    for (const id of threadIds) targets.push(await loadThread(id, me._id))
    for (const u of await peopleFrom(userIds, me)) targets.push(await openWith(me, u))
    const seen = new Set()
    let sent = 0
    const failed = []
    for (const t of targets) {
        if (seen.has(String(t._id))) continue
        seen.add(String(t._id))
        try {
            await assertCanSend(t, me)
            await createMessage(t._id, me, { ...body })
            if (text) await createMessage(t._id, me, { kind : 'text', text })
            sent++
        } catch (error) {
            if (!(error instanceof S.SocialError)) throw error
            failed.push(error.message)
        }
    }
    if (!sent && failed.length) throw fail(failed[0])
    return { sent, failed }
})

// GET /dm/suggested -> recent conversations + people you follow (for "New message" and the share sheet)
const suggested = handle(async (req) => {
    const me = await loadMe(req)
    const threads = (await DmThreadModel.find({ 'members.userId' : me._id, lastMessageAt : { $exists : true } }).sort({ lastMessageAt : -1 }).limit(30).lean())
        .filter((t) => visibleTo(t, me._id))
    const following = await S.followingIds(me._id)
    const users = await loadThreadUsers(threads, following.slice(0, 60))
    const inThreads = new Set(threads.filter((t) => !t.isGroup).flatMap((t) => t.members.map((m) => String(m.userId))))
    const people = following.filter((id) => !inThreads.has(id)).map((id) => users[id]).filter((u) => u && !u.deletedAt && !S.blockedEitherWay(me, u)).slice(0, 30).map((u) => S.personCard(u, me))
    return { threads : threads.map((t) => serializeThread(t, me, users)).filter((t) => !t.unavailable && !t.blockedByMe), people }
})

/* ---------- reading, requests, settings ---------- */

const setMine = async (thread, meId, patch) => {
    const set = Object.fromEntries(Object.entries(patch).map(([k, v]) => [`members.$.${k}`, v]))
    return DmThreadModel.findOneAndUpdate({ _id : thread._id, 'members.userId' : meId }, { $set : set }, { new : true }).lean()
}

// POST /dm/threads/:id/read
const markRead = handle(async (req) => {
    const me = await loadMe(req)
    const thread = await loadThread(req.params.id, me._id)
    const at = new Date()
    const updated = await setMine(thread, me._id, { lastReadAt : at })
    const mine = memberOf(updated, me._id)
    emitDm(me._id, { type : 'read', threadId : String(thread._id), userId : String(me._id), at, self : true })
    // people you haven't accepted don't learn that you've read their messages
    if (mine.status === 'inbox') {
        const users = await S.loadUsers(others(thread, me._id).map((m) => m.userId))
        for (const m of others(thread, me._id)) {
            if (users[String(m.userId)] && receiptsAllowed(me, users[String(m.userId)])) emitDm(m.userId, { type : 'read', threadId : String(thread._id), userId : String(me._id), at })
        }
    }
    return { at }
})

// POST /dm/threads/:id/accept
const accept = handle(async (req) => {
    const me = await loadMe(req)
    const thread = await loadThread(req.params.id, me._id)
    const updated = await setMine(thread, me._id, { status : 'inbox', lastReadAt : new Date() })
    await broadcastThread(updated)
    return { thread : await threadOut(updated, me) }
})

// POST /dm/threads/:id/delete -> "Delete" a request or "Delete chat": hidden for you until someone writes again
const hide = handle(async (req) => {
    const me = await loadMe(req)
    const thread = await loadThread(req.params.id, me._id)
    await setMine(thread, me._id, { clearedAt : new Date(), lastReadAt : new Date() })
    emitDm(me._id, { type : 'thread-remove', threadId : String(thread._id) })
    return {}
})

// POST /dm/threads/:id/mute { muted }
const mute = handle(async (req) => {
    const me = await loadMe(req)
    const thread = await loadThread(req.params.id, me._id)
    const updated = await setMine(thread, me._id, { muted : !!req.body.muted })
    emitDm(me._id, { type : 'thread', threadId : String(thread._id), thread : await threadOut(updated, me) })
    return { muted : !!req.body.muted }
})

/* ---------- groups ---------- */

const loadGroup = async (id, me) => {
    const thread = await loadThread(id, me._id)
    if (!thread.isGroup) throw fail('This is not a group')
    return thread
}

// PATCH /dm/threads/:id { name, avatar } (anyone in the group, like Instagram)
const updateGroup = handle(async (req) => {
    const me = await loadMe(req)
    const thread = await loadGroup(req.params.id, me)
    const set = {}
    if (typeof req.body.name === 'string' && req.body.name.trim() !== thread.name) set.name = req.body.name.trim().slice(0, 100)
    if (req.body.avatar !== undefined && req.body.avatar !== thread.avatar) {
        if (req.body.avatar && !isAllowedMediaUrl(req.body.avatar)) throw fail('Invalid photo')
        set.avatar = req.body.avatar || ''
    }
    if (!Object.keys(set).length) return { thread : await threadOut(thread, me) }
    await DmThreadModel.updateOne({ _id : thread._id }, { $set : set })
    if (set.name !== undefined) await systemMessage(thread, me, set.name ? 'named' : 'unnamed', { value : set.name })
    if (set.avatar !== undefined) await systemMessage(thread, me, set.avatar ? 'photo' : 'photo_removed')
    return { thread : await threadOut(await DmThreadModel.findById(thread._id).lean(), me) }
})

// POST /dm/threads/:id/members { userIds }
const addMembers = handle(async (req) => {
    const me = await loadMe(req)
    const thread = await loadGroup(req.params.id, me)
    const already = new Set(thread.members.map((m) => String(m.userId)))
    const people = (await peopleFrom(req.body.userIds, me)).filter((p) => !already.has(String(p._id)))
    if (!people.length) throw fail('Choose people to add')
    if (thread.members.length + people.length > MAX_GROUP) throw fail(`Groups can have up to ${MAX_GROUP} people`)
    const added = []
    for (const p of people) added.push({ userId : p._id, role : 'member', status : await folderFor(p._id, me._id), joinedAt : new Date() })
    await DmThreadModel.updateOne({ _id : thread._id }, { $push : { members : { $each : added } } })
    await systemMessage(thread, me, 'added', { targets : people.map((p) => p._id) })
    return { thread : await threadOut(await DmThreadModel.findById(thread._id).lean(), me) }
})

// removes someone; the last admin leaving makes the longest-standing member admin
const dropMember = async (thread, userId) => {
    const rest = thread.members.filter((m) => String(m.userId) !== String(userId))
    if (!rest.length) {
        await Promise.all([DmThreadModel.deleteOne({ _id : thread._id }), DmMessageModel.deleteMany({ thread : thread._id })])
        return null
    }
    if (!rest.some((m) => m.role === 'admin')) rest.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))[0].role = 'admin'
    return DmThreadModel.findByIdAndUpdate(thread._id, { $set : { members : rest } }, { new : true }).lean()
}

// DELETE /dm/threads/:id/members/:userId (admins)
const removeMember = handle(async (req) => {
    const me = await loadMe(req)
    const thread = await loadGroup(req.params.id, me)
    if (memberOf(thread, me._id).role !== 'admin') throw fail('Only admins can remove people', 403)
    const target = memberOf(thread, req.params.userId)
    if (!target || String(target.userId) === String(me._id)) throw fail('Not in this group')
    const updated = await dropMember(thread, target.userId)
    emitDm(target.userId, { type : 'thread-remove', threadId : String(thread._id) })
    await systemMessage(updated, me, 'removed', { targets : [target.userId] })
    return { thread : await threadOut(await DmThreadModel.findById(thread._id).lean(), me) }
})

// POST /dm/threads/:id/admins/:userId { admin }
const setAdmin = handle(async (req) => {
    const me = await loadMe(req)
    const thread = await loadGroup(req.params.id, me)
    if (memberOf(thread, me._id).role !== 'admin') throw fail('Only admins can do this', 403)
    if (!memberOf(thread, req.params.userId) || String(req.params.userId) === String(me._id)) throw fail('Not in this group')
    const updated = await DmThreadModel.findOneAndUpdate({ _id : thread._id, 'members.userId' : req.params.userId }, { $set : { 'members.$.role' : req.body.admin ? 'admin' : 'member' } }, { new : true }).lean()
    await broadcastThread(updated)
    return { thread : await threadOut(updated, me) }
})

// POST /dm/threads/:id/leave
const leave = handle(async (req) => {
    const me = await loadMe(req)
    const thread = await loadGroup(req.params.id, me)
    const updated = await dropMember(thread, me._id)
    emitDm(me._id, { type : 'thread-remove', threadId : String(thread._id) })
    if (updated) await systemMessage(updated, me, 'left')
    return {}
})

/* ---------- one message ---------- */

const loadOwnable = async (id, me) => {
    if (!isValidId(String(id))) throw fail('Message not found', 404)
    const msg = await DmMessageModel.findById(id).lean()
    if (!msg) throw fail('Message not found', 404)
    const thread = await loadThread(msg.thread, me._id)
    const mine = memberOf(thread, me._id)
    if (mine.clearedAt && msg.createdAt <= mine.clearedAt) throw fail('Message not found', 404)
    return { msg, thread }
}

// PATCH /dm/messages/:id { text } (your own text, within 15 minutes)
const editMessage = handle(async (req) => {
    const me = await loadMe(req)
    const { msg, thread } = await loadOwnable(req.params.id, me)
    if (String(msg.from) !== String(me._id) || msg.kind !== 'text') throw fail("You can't edit this message", 403)
    if (Date.now() - new Date(msg.createdAt) > LIMITS.EDIT_WINDOW_MS) throw fail('Messages can only be edited for 15 minutes')
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : ''
    if (!text) throw fail('Write a message')
    if (text.length > LIMITS.TEXT_MAX) throw fail('Message is too long')
    const updated = await DmMessageModel.findByIdAndUpdate(msg._id, { $set : { text, editedAt : new Date() } }, { new : true }).lean()
    if (String(thread.lastMessage?._id) === String(msg._id)) {
        await DmThreadModel.updateOne({ _id : thread._id }, { $set : { 'lastMessage.preview' : previewOf(updated) } })
    }
    await broadcastMessage(await DmThreadModel.findById(thread._id).lean(), updated, 'message-update')
    return { message : (await serializeMessages([updated], me))[0] }
})

// DELETE /dm/messages/:id -> "Unsend": removed for everyone
const unsend = handle(async (req) => {
    const me = await loadMe(req)
    const { msg, thread } = await loadOwnable(req.params.id, me)
    if (String(msg.from) !== String(me._id) || msg.kind === 'system') throw fail("You can't unsend this message", 403)
    await DmMessageModel.deleteOne({ _id : msg._id })
    let updated = thread
    if (String(thread.lastMessage?._id) === String(msg._id)) {
        const prev = await DmMessageModel.findOne({ thread : thread._id }).sort({ createdAt : -1 }).lean()
        updated = await DmThreadModel.findByIdAndUpdate(thread._id, prev
            ? { $set : { lastMessage : { _id : prev._id, from : prev.from, kind : prev.kind, preview : previewOf(prev) } } }
            : { $unset : { lastMessage : 1 } }, { new : true }).lean()
    }
    const users = await loadThreadUsers([updated])
    for (const m of updated.members) {
        const viewer = users[String(m.userId)]
        if (viewer) emitDm(m.userId, { type : 'message-remove', threadId : String(thread._id), messageId : String(msg._id), thread : serializeThread(updated, viewer, users) })
    }
    return {}
})

// POST /dm/messages/:id/react { emoji } (null / '' removes yours). Double-tap = ❤️
const react = handle(async (req) => {
    const me = await loadMe(req)
    const { msg, thread } = await loadOwnable(req.params.id, me)
    if (msg.kind === 'system') throw fail("You can't react to this")
    const emoji = typeof req.body.emoji === 'string' ? req.body.emoji.trim() : ''
    if (emoji.length > 16) throw fail('Invalid reaction')
    const reactions = (msg.reactions || []).filter((r) => String(r.userId) !== String(me._id))
    if (emoji) reactions.push({ userId : me._id, emoji })
    const updated = await DmMessageModel.findByIdAndUpdate(msg._id, { $set : { reactions } }, { new : true }).lean()
    await broadcastMessage(thread, updated, 'message-update')
    return { message : (await serializeMessages([updated], me))[0] }
})

// is there an accepted Pixify conversation between these two? (lets them call each other)
const acceptedBetween = async (a, b) => {
    const t = await DmThreadModel.findOne({ pairKey : pairKeyOf(a, b) }).select('members lastMessageAt').lean()
    return !!(t && t.lastMessageAt && t.members.every((m) => m.status === 'inbox'))
}

module.exports = {
    listThreads, unread, withUser, createThread, getThread, listMessages, sendMessage, share, suggested,
    markRead, accept, hide, mute, updateGroup, addMembers, removeMember, setAdmin, leave,
    editMessage, unsend, react,
    // used elsewhere
    unreadCounts, acceptedBetween, loadThread, memberOf
}
