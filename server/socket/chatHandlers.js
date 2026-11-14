const mongoose = require('mongoose')
const UserModel = require('../models/user.model')
const { ConversationModel, MessageModel } = require('../models/conversation.model')
const getConversation = require('../helpers/getConversation')
const { getConversationItem } = require('../helpers/getConversation')
const presence = require('./presence')
const {
    LIMITS, REPLY_FIELDS, isValidId, idOf, escapeRegex, isAllowedMediaUrl, isAllowedStickerUrl, hasBlocked, receiptsAllowed, contactOf,
    publicUser, isParticipant, isActiveMember, peerOf, getState, setState, findConversation, getOrCreateConversation,
    visibleFilter, serializeMessage, loadMessages,
    isGroup, memberOf, memberIds, isAdmin, allowed, chatKeyOf, chatsOf, groupAsPeer, canSeeMessage
} = require('../helpers/chat')

// error whose message is safe to show to the user
class UserError extends Error {}

const oid = (id) => new mongoose.Types.ObjectId(String(id))
const loadUser = (id) => UserModel.findById(id).select('-password').lean()
const findGroup = (id) => (isValidId(String(id)) ? ConversationModel.findOne({ _id : id, isGroup : true }).select('-messages').lean() : null)

const validIds = (ids, max = LIMITS.MAX_BULK) => {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > max) throw new UserError('Invalid selection')
    const unique = [...new Set(ids.map(String))]
    if (!unique.every(isValidId)) throw new UserError('Invalid selection')
    return unique
}

const cleanText = (text) => {
    if (text === undefined || text === null) return ""
    if (typeof text !== 'string') throw new UserError('Invalid message')
    const t = text.replace(/\r\n/g, '\n').trim()
    if (t.length > LIMITS.TEXT_MAX) throw new UserError(`Message is too long (max ${LIMITS.TEXT_MAX} characters)`)
    return t
}

const cleanGroupName = (name) => {
    if (typeof name !== 'string') throw new UserError('Enter a group name')
    const n = name.replace(/\s+/g, ' ').trim()
    if (!n) throw new UserError('Enter a group name')
    if (n.length > LIMITS.GROUP_NAME_MAX) throw new UserError(`Group name is too long (max ${LIMITS.GROUP_NAME_MAX} characters)`)
    return n
}

const cleanDescription = (text) => {
    if (text === undefined || text === null) return ''
    if (typeof text !== 'string') throw new UserError('Invalid description')
    const t = text.replace(/\r\n/g, '\n').trim()
    if (t.length > LIMITS.GROUP_DESC_MAX) throw new UserError(`Description is too long (max ${LIMITS.GROUP_DESC_MAX} characters)`)
    return t
}

const SETTING_KEYS = ['editInfo', 'sendMessages', 'addMembers']

// run async work for many users without opening hundreds of queries at once
const inBatches = async (items, size, fn) => {
    for (let i = 0; i < items.length; i += size) {
        await Promise.all(items.slice(i, i + size).map(fn))
    }
}

module.exports = function registerChatHandlers(io, socket, { broadcastOnline }) {
    const me = socket.data.userId
    const meId = oid(me)

    /* ---------- helpers ---------- */

    // wraps a handler: catches errors and answers the client's ack callback with { ok, ...result } / { ok:false, error }
    const on = (event, fn) => {
        socket.on(event, async (...args) => {
            const ack = typeof args[args.length - 1] === 'function' ? args.pop() : null
            try {
                const result = await fn(...args, { hasAck : !!ack })
                if (ack) ack({ ok : true, ...(result || {}) })
            } catch (error) {
                if (!(error instanceof UserError)) console.error(`[socket:${event}]`, error)
                if (ack) ack({ ok : false, error : error instanceof UserError ? error.message : 'Something went wrong. Please try again.' })
            }
        })
    }

    // chats whose new messages are addressed to me (1:1 + groups I'm currently in)
    const myActiveConversationIds = () => ConversationModel.find({
        $or : [{ sender : me }, { receiver : me }, { 'members.userId' : me }]
    }).distinct('_id')

    const emitSidebar = async (userIds) => {
        for (const uid of new Set(userIds.map(String))) {
            io.to(uid).emit('conversation', await getConversation(uid))
        }
    }

    // refresh one chat-list row for many people (groups can have hundreds of members)
    const emitItems = async (convId, userIds) => {
        await inBatches([...new Set(userIds.map(String))], 20, async (uid) => {
            const item = await getConversationItem(convId, uid)
            io.to(uid).emit('conversation-item', item ? { item } : { removeId : String(convId) })
        })
    }

    const refreshLists = (conv, userIds) => {
        const job = isGroup(conv) ? emitItems(conv._id, userIds) : emitSidebar(userIds)
        job.catch((e) => console.error('[sidebar]', e))
    }

    // everyone who can read a group: current members + former members (their own period only)
    const everyoneIn = (conv) => [...memberIds(conv), ...(conv.pastMembers || []).map((p) => idOf(p.userId))]

    // everyone who should see changes to a chat
    const participants = (conv) => (isGroup(conv) ? everyoneIn(conv) : [String(conv.sender), String(conv.receiver)])

    // older clients expect the whole message list in a 'message' event
    const emitLegacyMessages = async (conv, userIds) => {
        if (isGroup(conv)) return
        for (const uid of new Set(userIds.map(String))) {
            const sockets = await io.in(uid).fetchSockets()
            const legacy = sockets.filter((s) => !s.data.v2)
            if (!legacy.length) continue
            const [u, peer] = await Promise.all([loadUser(uid), loadUser(peerOf(conv, uid))])
            const docs = await MessageModel.find(visibleFilter(conv, uid)).sort({ createdAt : 1 }).populate('replyTo', REPLY_FIELDS).lean()
            const list = docs.map((d) => serializeMessage(d, uid, { receipts : receiptsAllowed(u, peer) }))
            legacy.forEach((s) => s.emit('message', list))
        }
    }

    // sends updated messages to every participant who can still see them
    const emitMessageUpdate = async (conv, ids, { only } = {}) => {
        const docs = await MessageModel.find({ _id : { $in : ids } }).populate('replyTo', REPLY_FIELDS).lean()

        if (isGroup(conv)) {
            const people = only ? [only] : everyoneIn(conv)
            for (const uid of new Set(people.map(String))) {
                const visible = docs.filter((d) => canSeeMessage(conv, uid, d))
                if (!visible.length) continue
                io.to(uid).emit('message-updated', { peerId : String(conv._id), messages : visible.map((d) => serializeMessage(d, uid)) })
            }
            return
        }

        const people = only ? [only] : [String(conv.sender), String(conv.receiver)]
        const users = await UserModel.find({ _id : { $in : [String(conv.sender), String(conv.receiver)] } }).select('-password').lean()
        const byId = Object.fromEntries(users.map((u) => [String(u._id), u]))
        for (const uid of new Set(people)) {
            const visible = docs.filter((d) => !(d.deletedFor || []).some((x) => String(x) === uid))
            if (!visible.length) continue
            const receipts = receiptsAllowed(byId[uid], byId[peerOf(conv, uid)])
            io.to(uid).emit('message-updated', {
                peerId : peerOf(conv, uid),
                messages : visible.map((d) => serializeMessage(d, uid, { receipts }))
            })
        }
    }

    // fetch messages + their conversations and make sure the current user can see all of them.
    // write = the action changes the chat for others (edit, react, pin, delete for everyone): former group members can't.
    const getOwnedContext = async (ids, { write = false } = {}) => {
        const msgs = await MessageModel.find({ _id : { $in : ids } }).lean()
        if (msgs.length !== ids.length) throw new UserError('Some messages no longer exist')
        const convIds = [...new Set(msgs.map((m) => String(m.conversationId)))]
        const convs = await ConversationModel.find({ _id : { $in : convIds } }).select('-messages').lean()
        if (convs.length !== convIds.length || !convs.every((c) => isParticipant(c, me))) throw new UserError('Not allowed')
        if (write && !convs.every((c) => isActiveMember(c, me))) throw new UserError("You're no longer a member of this group")
        const visible = msgs.filter((m) => canSeeMessage(convs.find((c) => String(c._id) === String(m.conversationId)), me, m))
        if (visible.length !== msgs.length) throw new UserError('Some messages no longer exist')
        return { msgs, convs }
    }

    // a group message turns grey-double-tick when every recipient has it, and blue when every recipient read it
    const settleGroupReceipts = async (ids) => {
        if (!ids.length) return
        const msgs = await MessageModel.find({ _id : { $in : ids } })
            .select('msgByUserId conversationId recipients deliveredTo readBy deliveredAt seen').lean()
        const has = (rec, list) => {
            const got = new Set((list || []).map((r) => String(r.userId)))
            return rec.every((id) => got.has(id))
        }
        const read = [], delivered = []
        for (const m of msgs) {
            const rec = (m.recipients || []).map(String)
            if (!rec.length) continue
            if (!m.seen && has(rec, m.readBy)) read.push(m)
            else if (!m.deliveredAt && has(rec, m.deliveredTo)) delivered.push(m)
        }
        if (!read.length && !delivered.length) return
        const now = new Date()
        if (read.length) {
            const rIds = read.map((m) => m._id)
            await MessageModel.updateMany({ _id : { $in : rIds }, deliveredAt : null }, { $set : { deliveredAt : now } })
            await MessageModel.updateMany({ _id : { $in : rIds } }, { $set : { seen : true, seenAt : now } })
        }
        if (delivered.length) {
            await MessageModel.updateMany({ _id : { $in : delivered.map((m) => m._id) } }, { $set : { deliveredAt : now } })
        }
        const groups = {}
        const add = (m, kind) => {
            const key = `${m.msgByUserId}|${m.conversationId}|${kind}`
            ;(groups[key] = groups[key] || { sender : String(m.msgByUserId), conv : String(m.conversationId), kind, ids : [] }).ids.push(String(m._id))
        }
        read.forEach((m) => add(m, 'read'))
        delivered.forEach((m) => add(m, 'delivered'))
        for (const g of Object.values(groups)) {
            io.to(g.sender).emit('messages-status', {
                peerId : g.conv, ids : g.ids, deliveredAt : now,
                ...(g.kind === 'read' ? { seen : true, seenAt : now } : {})
            })
        }
        // senders' chat lists show the tick of their last message
        const byConv = {}
        Object.values(groups).forEach((g) => { (byConv[g.conv] = byConv[g.conv] || new Set()).add(g.sender) })
        for (const [convId, senders] of Object.entries(byConv)) emitItems(convId, [...senders]).catch(() => {})
    }

    const markDelivered = async (query) => {
        const now = new Date()

        // one-to-one messages
        const msgs = await MessageModel.find({
            ...query,
            msgByUserId : { $ne : meId },
            deliveredAt : null,
            deletedFor : { $ne : meId },
            recipients : { $exists : false },
            'system.action' : { $exists : false }
        }).select('_id msgByUserId').lean()
        if (msgs.length) {
            await MessageModel.updateMany({ _id : { $in : msgs.map((m) => m._id) }, deliveredAt : null }, { $set : { deliveredAt : now } })
            const bySender = {}
            msgs.forEach((m) => { (bySender[String(m.msgByUserId)] = bySender[String(m.msgByUserId)] || []).push(String(m._id)) })
            for (const [sender, ids] of Object.entries(bySender)) {
                io.to(sender).emit('messages-status', { peerId : me, ids, deliveredAt : now })
            }
        }

        // group messages: record that this member has them
        const groupIds = await MessageModel.find({
            ...query,
            recipients : meId,
            'deliveredTo.userId' : { $ne : meId },
            deletedFor : { $ne : meId }
        }).distinct('_id')
        if (groupIds.length) {
            await MessageModel.updateMany({ _id : { $in : groupIds }, 'deliveredTo.userId' : { $ne : meId } }, { $push : { deliveredTo : { userId : meId, at : now } } })
            await settleGroupReceipts(groupIds)
        }
    }

    // a chat is addressed by the other person's id (1:1) or by the group's id
    const resolveChat = async (key, { create = false, required = true } = {}) => {
        if (!isValidId(String(key))) throw new UserError('Invalid chat')
        const group = await findGroup(key)
        if (group) {
            if (!isParticipant(group, me)) throw new UserError("You're not a member of this group")
            return { conv : group, group : true }
        }
        const conv = create ? await getOrCreateConversation(me, key) : await findConversation(me, key)
        if (!conv && required) throw new UserError('Conversation not found')
        return { conv, group : false, peerId : String(key) }
    }

    // receipts option for serializing messages of a chat
    const receiptsFor = async (ctx) => {
        if (ctx.group) return true
        const [meUser, peer] = await Promise.all([loadUser(me), loadUser(ctx.peerId)])
        return receiptsAllowed(meUser, peer)
    }

    const recordMessage = async (message, conv, { clientId, receipts }) => {
        try {
            await message.save()
        } catch (error) {
            if (error.code === 11000 && clientId) {
                const existing = await MessageModel.findOne({ msgByUserId : meId, clientId }).populate('replyTo', REPLY_FIELDS).lean()
                return { message : serializeMessage(existing, me, { receipts }), duplicate : true }
            }
            throw error
        }
        return null
    }

    const findDuplicate = async (clientId, receipts) => {
        if (!clientId) return null
        const existing = await MessageModel.findOne({ msgByUserId : meId, clientId }).populate('replyTo', REPLY_FIELDS).lean()
        return existing ? { message : serializeMessage(existing, me, { receipts }), duplicate : true } : null
    }

    const replyIdIn = async (conv, replyTo) => {
        if (!replyTo) return undefined
        if (!isValidId(String(replyTo))) throw new UserError('Invalid reply')
        const r = await MessageModel.findOne({ _id : replyTo, conversationId : conv._id }).select('_id createdAt deletedFor').lean()
        if (!r || !canSeeMessage(conv, me, r)) return undefined
        return r._id
    }

    // creates and delivers one message from the current user to `peer`
    const createMessage = async (meUser, peer, content, { clientId, replyTo, forwarded = false } = {}) => {
        const peerId = String(peer._id)
        if (hasBlocked(meUser, peerId)) throw new UserError('You blocked this contact. Unblock them to send a message.')

        const receipts = receiptsAllowed(meUser, peer)
        const dup = await findDuplicate(clientId, receipts)
        if (dup) return dup

        let conv = await findConversation(me, peerId)
        if (!conv) {
            // first message to someone who hasn't saved me: it lands in their "Message requests"
            const request = peerId !== me && !contactOf(peer, me)
            conv = await new ConversationModel({ sender : me, receiver : peerId, ...(request ? { requestFor : peer._id } : {}) }).save()
        } else if (String(conv.requestFor || '') === me) {
            // replying to a request accepts it
            await ConversationModel.updateOne({ _id : conv._id }, { $unset : { requestFor : 1 } })
            conv.requestFor = undefined
        }
        const isRequestForPeer = String(conv.requestFor || '') === peerId
        const replyId = await replyIdIn(conv, replyTo)

        // if the recipient blocked me, the message is stored for me only and never delivered (single tick)
        const blockedByPeer = hasBlocked(peer, me)

        const message = new MessageModel({
            conversationId : conv._id,
            clientId,
            ...content,
            msgByUserId : meId,
            replyTo : replyId,
            forwarded,
            deletedFor : blockedByPeer ? [peer._id] : [],
            expiresAt : conv.disappearAfter ? new Date(Date.now() + conv.disappearAfter * 1000) : undefined
        })

        const raced = await recordMessage(message, conv, { clientId, receipts })
        if (raced) return raced

        await ConversationModel.updateOne({ _id : conv._id }, {
            $push : { messages : message._id },
            $set : { lastMessageAt : message.createdAt }
        })
        await message.populate('replyTo', REPLY_FIELDS)

        const forMe = serializeMessage(message, me, { receipts })
        io.to(me).emit('message-new', { peerId, message : forMe })
        if (peerId !== me && !blockedByPeer) {
            io.to(peerId).emit('message-new', { peerId : me, message : serializeMessage(message, peerId, { receipts }), ...(isRequestForPeer ? { request : true } : {}) })
        }

        // chat lists are refreshed in the background so the sender's ack isn't delayed
        emitSidebar(blockedByPeer ? [me] : [me, peerId]).catch((e) => console.error('[sidebar]', e))
        emitLegacyMessages(conv, blockedByPeer ? [me] : [me, peerId]).catch(() => {})
        return { message : forMe }
    }

    // creates and delivers one message from the current user to every member of a group
    const createGroupMessage = async (meUser, conv, content, { clientId, replyTo, forwarded = false } = {}) => {
        if (!memberOf(conv, me)) throw new UserError("You can't send messages to this group because you're no longer a member.")
        if (!allowed(conv, me, 'sendMessages')) throw new UserError('Only admins can send messages to this group.')

        const dup = await findDuplicate(clientId, true)
        if (dup) return dup

        const replyId = await replyIdIn(conv, replyTo)
        const members = memberIds(conv)

        const message = new MessageModel({
            conversationId : conv._id,
            clientId,
            ...content,
            msgByUserId : meId,
            replyTo : replyId,
            forwarded,
            recipients : members.filter((id) => id !== me),
            deliveredTo : [],
            readBy : [],
            expiresAt : conv.disappearAfter ? new Date(Date.now() + conv.disappearAfter * 1000) : undefined
        })

        const raced = await recordMessage(message, conv, { clientId, receipts : true })
        if (raced) return raced

        await ConversationModel.updateOne({ _id : conv._id }, { $set : { lastMessageAt : message.createdAt } })
        await message.populate('replyTo', REPLY_FIELDS)

        const groupId = String(conv._id)
        for (const uid of members) {
            io.to(uid).emit('message-new', { peerId : groupId, message : serializeMessage(message, uid), authorName : meUser.name, author : { _id : me, name : meUser.name, phone : meUser.phone }, isGroup : true })
        }
        emitItems(conv._id, members).catch((e) => console.error('[sidebar]', e))
        return { message : serializeMessage(message, me) }
    }

    // grey notice inside a group ("Alice added Bob"). `extra` = people who should also see it live (e.g. someone just removed).
    const addSystemMessage = async (conv, action, { targets = [], value, extra = [] } = {}) => {
        const meUser = await loadUser(me)
        const message = await new MessageModel({
            conversationId : conv._id,
            msgByUserId : meId,
            system : {
                action,
                actor : { id : me, name : meUser?.name || '' },
                targets : targets.map((t) => ({ id : String(t._id), name : t.name })),
                value : value === undefined ? undefined : String(value)
            }
        }).save()
        await ConversationModel.updateOne({ _id : conv._id }, { $set : { lastMessageAt : message.createdAt } })
        for (const uid of new Set([...memberIds(conv), ...extra.map(String)])) {
            io.to(uid).emit('message-new', { peerId : String(conv._id), message : serializeMessage(message, uid), isGroup : true })
        }
        return message
    }

    // full group details as seen by one viewer (members with privacy-aware profiles, roles, settings)
    const groupDetails = (conv, viewer, usersById) => {
        const viewerId = String(viewer._id)
        const people = {}
        for (const id of [...memberIds(conv), ...(conv.pastMembers || []).map((p) => idOf(p.userId))]) {
            const u = usersById[id]
            if (u) {
                const pu = publicUser(u, viewer)
                people[id] = { name : pu.name, profileName : u.name, isContact : pu.isContact, profile_pic : pu.profile_pic, phone : u.phone }
            }
        }
        const members = (conv.members || [])
            .filter((m) => usersById[idOf(m.userId)])
            .map((m) => ({ ...publicUser(usersById[idOf(m.userId)], viewer), role : m.role, joinedAt : m.joinedAt }))
            // you first, then admins, then by name
            .sort((a, b) => (String(a._id) === viewerId ? -1 : String(b._id) === viewerId ? 1
                : a.role !== b.role ? (a.role === 'admin' ? -1 : 1) : a.name.localeCompare(b.name)))
        return {
            _id : conv._id,
            name : conv.name,
            description : conv.description || '',
            avatar : conv.avatar || '',
            createdBy : conv.createdBy,
            createdAt : conv.createdAt,
            settings : {
                editInfo : conv.settings?.editInfo || 'all',
                sendMessages : conv.settings?.sendMessages || 'all',
                addMembers : conv.settings?.addMembers || 'admins'
            },
            isMember : !!memberOf(conv, viewerId),
            isAdmin : isAdmin(conv, viewerId),
            members,
            people,
            maxMembers : LIMITS.MAX_GROUP_MEMBERS
        }
    }

    const loadGroupUsers = async (conv) => {
        const ids = [...memberIds(conv), ...(conv.pastMembers || []).map((p) => idOf(p.userId))]
        const users = await UserModel.find({ _id : { $in : ids } }).select('-password').lean()
        return Object.fromEntries(users.map((u) => [String(u._id), u]))
    }

    // tell everyone in a group (and anyone just removed) that its details changed
    const emitGroupUpdated = async (groupId, extra = []) => {
        const conv = await findGroup(groupId)
        if (!conv) return
        const usersById = await loadGroupUsers(conv)
        for (const uid of new Set([...everyoneIn(conv), ...extra.map(String)])) {
            const viewer = usersById[uid] || await loadUser(uid)
            if (!viewer) continue
            io.to(uid).emit('group-updated', { groupId : String(conv._id), group : groupDetails(conv, viewer, usersById) })
        }
        return conv
    }

    // someone left: they no longer hold back the blue ticks of messages they never read
    const releaseReceipts = async (conv, userId) => {
        const uid = oid(userId)
        const ids = await MessageModel.find({ conversationId : conv._id, recipients : uid, 'readBy.userId' : { $ne : uid } }).distinct('_id')
        if (!ids.length) return
        await MessageModel.updateMany({ _id : { $in : ids } }, { $pull : { recipients : uid } })
        await settleGroupReceipts(ids)
    }

    const requireGroup = async (groupId, { member = true } = {}) => {
        const conv = await findGroup(groupId)
        if (!conv) throw new UserError('Group not found')
        if (member && !memberOf(conv, me)) throw new UserError("You're no longer a member of this group")
        if (!member && !isParticipant(conv, me)) throw new UserError('Group not found')
        return conv
    }

    const sendMessage = async (payload = {}) => {
        const receiverId = String(payload.receiver || '')
        if (!isValidId(receiverId)) throw new UserError('Invalid recipient')

        const text = cleanText(payload.text)
        const content = {
            text,
            imageUrl : payload.imageUrl || "",
            videoUrl : payload.videoUrl || "",
            fileUrl : payload.fileUrl || "",
            fileName : typeof payload.fileName === 'string' ? payload.fileName.slice(0, 255) : "",
            fileSize : Number.isFinite(Number(payload.fileSize)) && Number(payload.fileSize) > 0 ? Number(payload.fileSize) : 0,
            fileType : typeof payload.fileType === 'string' ? payload.fileType.slice(0, 100) : "",
            stickerUrl : typeof payload.stickerUrl === 'string' ? payload.stickerUrl : "",
            audioUrl : typeof payload.audioUrl === 'string' ? payload.audioUrl : ""
        }
        if (![content.imageUrl, content.videoUrl, content.fileUrl, content.audioUrl].every(isAllowedMediaUrl)) throw new UserError('Invalid attachment')
        if (!isAllowedStickerUrl(content.stickerUrl)) throw new UserError('Invalid sticker')
        if (content.stickerUrl) {
            // a sticker is sent on its own, like WhatsApp
            Object.assign(content, { text : "", imageUrl : "", videoUrl : "", fileUrl : "", fileName : "", fileSize : 0, fileType : "", audioUrl : "" })
        }
        if (content.audioUrl) {
            const seconds = Number(payload.audioDuration)
            if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60 * 60) throw new UserError('Invalid voice message')
            content.audioDuration = Math.round(seconds * 10) / 10
            const wave = Array.isArray(payload.audioWaveform) ? payload.audioWaveform.slice(0, 64) : []
            content.audioWaveform = wave.map((v) => Math.round(Math.min(1, Math.max(0, Number(v) || 0)) * 100) / 100)
            Object.assign(content, { text : "", imageUrl : "", videoUrl : "", fileUrl : "", fileName : "", fileSize : 0, fileType : "" })
        }
        if (!content.text && !content.imageUrl && !content.videoUrl && !content.fileUrl && !content.stickerUrl && !content.audioUrl) throw new UserError('Message is empty')
        if (content.fileUrl && !content.fileName) content.fileName = 'Document'

        const clientId = typeof payload.clientId === 'string' && payload.clientId.length <= 64 ? payload.clientId : undefined

        const group = await findGroup(receiverId)
        if (group) {
            if (!isParticipant(group, me)) throw new UserError('Group not found')
            return createGroupMessage(await loadUser(me), group, content, { clientId, replyTo : payload.replyTo })
        }

        const [meUser, peer] = await Promise.all([loadUser(me), loadUser(receiverId)])
        if (!peer) throw new UserError('User not found')

        return createMessage(meUser, peer, content, { clientId, replyTo : payload.replyTo })
    }

    const markSeen = async (key) => {
        if (!isValidId(String(key))) return
        const group = await findGroup(key)

        if (group) {
            if (!isParticipant(group, me)) return
            const state = getState(group, me)
            if (state.markedUnread) await setState(group._id, meId, { markedUnread : false })
            const ids = await MessageModel.find({ ...visibleFilter(group, me), recipients : meId, 'readBy.userId' : { $ne : meId } }).distinct('_id')
            if (!ids.length && !state.markedUnread) return
            if (ids.length) {
                const now = new Date()
                await MessageModel.updateMany({ _id : { $in : ids }, 'deliveredTo.userId' : { $ne : meId } }, { $push : { deliveredTo : { userId : meId, at : now } } })
                await MessageModel.updateMany({ _id : { $in : ids }, 'readBy.userId' : { $ne : meId } }, { $push : { readBy : { userId : meId, at : now } } })
                await settleGroupReceipts(ids)
            }
            emitItems(group._id, [me]).catch((e) => console.error('[sidebar]', e))
            return
        }

        const peerId = key
        const conv = await findConversation(me, peerId)
        if (!conv) return
        const now = new Date()
        const ids = await MessageModel.find({
            conversationId : conv._id,
            msgByUserId : oid(peerId),
            seen : false,
            deletedFor : { $ne : meId }
        }).distinct('_id')

        const state = getState(conv, me)
        if (state.markedUnread) await setState(conv._id, meId, { markedUnread : false })
        // a message request: the sender doesn't learn you read it until you accept
        if (String(conv.requestFor || '') === me) return
        if (!ids.length && !state.markedUnread) return

        if (ids.length) {
            await MessageModel.updateMany({ _id : { $in : ids }, deliveredAt : null }, { $set : { deliveredAt : now } })
            await MessageModel.updateMany({ _id : { $in : ids } }, { $set : { seen : true, seenAt : now } })
            const [meUser, peer] = await Promise.all([loadUser(me), loadUser(peerId)])
            const receipts = receiptsAllowed(meUser, peer)
            io.to(String(peerId)).emit('messages-status', {
                peerId : me,
                ids : ids.map(String),
                deliveredAt : now,
                ...(receipts ? { seenAt : now, seen : true } : {})
            })
        }
        emitSidebar([me, String(peerId)]).catch((e) => console.error('[sidebar]', e))
    }

    /* ---------- events ---------- */

    // open a chat: peer (or group) details + latest page of messages
    on('message-page', async (key, { hasAck } = {}) => {
        if (!isValidId(String(key))) throw new UserError('Invalid user')
        const meUser = await loadUser(me)

        const group = await findGroup(key)
        if (group) {
            if (!isParticipant(group, me)) throw new UserError("You're not a member of this group")
            const { messages, hasMore } = await loadMessages(group, me)
            const pinned = await MessageModel.find({ ...visibleFilter(group, me), pinned : true, deletedForEveryone : { $ne : true } })
                .sort({ pinnedAt : -1 }).limit(LIMITS.MAX_PINNED_MESSAGES).populate('replyTo', REPLY_FIELDS).lean()
            await markDelivered({ conversationId : group._id })
            const state = getState(group, me)
            return {
                peer : groupAsPeer(group),
                group : groupDetails(group, meUser, await loadGroupUsers(group)),
                messages : messages.map((m) => serializeMessage(m, me)),
                hasMore,
                pinned : pinned.map((m) => serializeMessage(m, me)),
                conversation : {
                    _id : group._id,
                    disappearAfter : group.disappearAfter || 0,
                    muted : !!state.muted,
                    archived : !!state.archived,
                    pinned : !!state.pinned
                }
            }
        }

        const peerId = key
        const peer = await loadUser(peerId)
        if (!peer) throw new UserError('User not found')

        const peerInfo = publicUser(peer, meUser)
        socket.emit('message-user', peerInfo)

        const conv = await findConversation(me, peerId)
        if (!conv) {
            if (!socket.data.v2) socket.emit('message', [])
            return { peer : peerInfo, messages : [], hasMore : false, pinned : [], conversation : null }
        }

        const receipts = receiptsAllowed(meUser, peer)
        const { messages, hasMore } = await loadMessages(conv, me)
        const pinned = await MessageModel.find({ ...visibleFilter(conv, me), pinned : true, deletedForEveryone : { $ne : true } })
            .sort({ pinnedAt : -1 }).limit(LIMITS.MAX_PINNED_MESSAGES).populate('replyTo', REPLY_FIELDS).lean()

        await markDelivered({ conversationId : conv._id })

        const serialized = messages.map((m) => serializeMessage(m, me, { receipts }))
        if (!socket.data.v2 && !hasAck) socket.emit('message', serialized)

        const state = getState(conv, me)
        return {
            peer : peerInfo,
            messages : serialized,
            hasMore,
            pinned : pinned.map((m) => serializeMessage(m, me, { receipts })),
            conversation : {
                _id : conv._id,
                disappearAfter : conv.disappearAfter || 0,
                muted : !!state.muted,
                archived : !!state.archived,
                pinned : !!state.pinned,
                request : String(conv.requestFor || '') === me
            }
        }
    })

    on('get-peer', async (key) => {
        if (!isValidId(String(key))) throw new UserError('Invalid user')
        const group = await findGroup(key)
        if (group) {
            if (!isParticipant(group, me)) throw new UserError('Group not found')
            return { peer : groupAsPeer(group) }
        }
        const [meUser, peer] = await Promise.all([loadUser(me), loadUser(key)])
        if (!peer) throw new UserError('User not found')
        return { peer : publicUser(peer, meUser) }
    })

    // pagination: older messages before a date
    on('load-older', async ({ peerId, before } = {}) => {
        const ctx = await resolveChat(peerId)
        const receipts = await receiptsFor(ctx)
        const { messages, hasMore } = await loadMessages(ctx.conv, me, { before })
        return { messages : messages.map((m) => serializeMessage(m, me, { receipts })), hasMore }
    })

    // load everything between a date and the oldest loaded message (used to jump to a search result / replied message)
    on('load-range', async ({ peerId, from, before } = {}) => {
        const ctx = await resolveChat(peerId)
        const fromDate = new Date(from)
        if (isNaN(fromDate)) throw new UserError('Invalid range')
        const filter = visibleFilter(ctx.conv, me)
        const range = { ...(filter.createdAt || {}) }
        // never reach back before the user's own lower limit (cleared chat / joined the group)
        range.$gte = range.$gte && range.$gte > fromDate ? range.$gte : fromDate
        if (before && !isNaN(new Date(before))) range.$lt = range.$lt && range.$lt < new Date(before) ? range.$lt : new Date(before)
        filter.createdAt = range
        const docs = await MessageModel.find(filter).sort({ createdAt : 1 }).limit(1000).populate('replyTo', REPLY_FIELDS).lean()
        const receipts = await receiptsFor(ctx)
        return { messages : docs.map((m) => serializeMessage(m, me, { receipts })) }
    })

    // new client: ack-based send with client id for de-duplication / retries
    on('send-message', (payload) => sendMessage(payload))

    // legacy event name (old client). Identity comes from the socket, not from data.sender / data.msgByUserId
    on('new message', (data = {}) => sendMessage({
        receiver : data.receiver,
        text : data.text,
        imageUrl : data.imageUrl,
        videoUrl : data.videoUrl
    }))

    on('mark-delivered', async ({ ids } = {}) => {
        const list = validIds(ids, 500)
        await markDelivered({ _id : { $in : list.map(oid) }, conversationId : { $in : await myActiveConversationIds() } })
    })

    // client came online / reconnected: everything addressed to it has now reached the device
    on('delivered-all', async () => {
        await markDelivered({ conversationId : { $in : await myActiveConversationIds() } })
    })

    on('seen', (key) => markSeen(key))

    on('sidebar', async () => {
        socket.emit('conversation', await getConversation(me))
    })

    on('edit-message', async ({ messageId, text } = {}) => {
        const [id] = validIds([messageId])
        const { msgs, convs } = await getOwnedContext([id], { write : true })
        const msg = msgs[0]
        if (String(msg.msgByUserId) !== me || msg.system?.action || msg.call?.media) throw new UserError('You can only edit your own messages')
        if (msg.deletedForEveryone) throw new UserError('This message was deleted')
        if (msg.forwarded) throw new UserError('Forwarded messages cannot be edited')
        if (msg.stickerUrl || msg.audioUrl) throw new UserError('Stickers and voice messages cannot be edited')
        if (Date.now() - new Date(msg.createdAt).getTime() > LIMITS.EDIT_WINDOW_MS) throw new UserError('Messages can only be edited within 15 minutes')
        const newText = cleanText(text)
        const hasMedia = msg.imageUrl || msg.videoUrl || msg.fileUrl
        if (!newText && !hasMedia) throw new UserError('Message cannot be empty')
        if (newText === msg.text) return {}
        await MessageModel.updateOne({ _id : id }, { $set : { text : newText, editedAt : new Date() } })
        await emitMessageUpdate(convs[0], [id])
        refreshLists(convs[0], participants(convs[0]))
    })

    on('delete-messages', async ({ messageIds, scope } = {}) => {
        const ids = validIds(messageIds)
        const { msgs, convs } = await getOwnedContext(ids, { write : scope === 'everyone' })
        if (convs.length !== 1) throw new UserError('Select messages from one chat')
        const conv = convs[0]

        if (scope === 'everyone') {
            const now = Date.now()
            const byAdmin = []
            for (const m of msgs) {
                const own = String(m.msgByUserId) === me
                if (m.system?.action) throw new UserError("Group notices can't be deleted for everyone")
                // group admins can delete anyone's message for everyone, like WhatsApp
                if (!own && !(isGroup(conv) && isAdmin(conv, me))) throw new UserError('You can only delete your own messages for everyone')
                if (now - new Date(m.createdAt).getTime() > LIMITS.DELETE_EVERYONE_WINDOW_MS) throw new UserError('Messages older than 48 hours can only be deleted for you')
                if (!own) byAdmin.push(String(m._id))
            }
            await MessageModel.updateMany({ _id : { $in : ids } }, {
                $set : {
                    deletedForEveryone : true, deletedAt : new Date(),
                    text : "", imageUrl : "", videoUrl : "", fileUrl : "", fileName : "", fileSize : 0, fileType : "",
                    stickerUrl : "", audioUrl : "", audioDuration : 0, audioWaveform : [],
                    reactions : [], pinned : false
                }
            })
            if (byAdmin.length) await MessageModel.updateMany({ _id : { $in : byAdmin } }, { $set : { deletedByAdmin : true } })
            await emitMessageUpdate(conv, ids)
            refreshLists(conv, participants(conv))
            emitLegacyMessages(conv, participants(conv)).catch(() => {})
            return {}
        }

        if (scope !== 'me') throw new UserError('Invalid option')
        await MessageModel.updateMany({ _id : { $in : ids } }, { $addToSet : { deletedFor : meId } })
        io.to(me).emit('messages-removed', { peerId : chatKeyOf(conv, me), ids })
        refreshLists(conv, [me])
        return {}
    })

    on('undo-delete-for-me', async ({ messageIds } = {}) => {
        const ids = validIds(messageIds)
        const msgs = await MessageModel.find({ _id : { $in : ids } }).select('conversationId').lean()
        const convIds = [...new Set(msgs.map((m) => String(m.conversationId)))]
        if (convIds.length !== 1) throw new UserError('Invalid selection')
        const conv = await ConversationModel.findById(convIds[0]).select('-messages').lean()
        if (!conv || !isParticipant(conv, me)) throw new UserError('Not allowed')
        await MessageModel.updateMany({ _id : { $in : ids } }, { $pull : { deletedFor : meId } })
        await emitMessageUpdate(conv, ids, { only : me })
        refreshLists(conv, [me])
    })

    on('react-message', async ({ messageId, emoji } = {}) => {
        const [id] = validIds([messageId])
        if (emoji !== '' && (typeof emoji !== 'string' || emoji.length > 16)) throw new UserError('Invalid reaction')
        const { msgs, convs } = await getOwnedContext([id], { write : true })
        if (msgs[0].deletedForEveryone) throw new UserError('This message was deleted')
        if (msgs[0].system?.action) throw new UserError("You can't react to this")
        const previous = (msgs[0].reactions || []).find((r) => String(r.userId) === me)
        await MessageModel.updateOne({ _id : id }, { $pull : { reactions : { userId : meId } } })
        if (emoji && (!previous || previous.emoji !== emoji)) {
            await MessageModel.updateOne({ _id : id }, { $push : { reactions : { userId : meId, emoji } } })
        }
        await emitMessageUpdate(convs[0], [id])
    })

    on('star-messages', async ({ messageIds, star } = {}) => {
        const ids = validIds(messageIds)
        const { convs } = await getOwnedContext(ids)
        await MessageModel.updateMany({ _id : { $in : ids } }, star ? { $addToSet : { starredBy : meId } } : { $pull : { starredBy : meId } })
        for (const conv of convs) await emitMessageUpdate(conv, ids, { only : me })
    })

    on('pin-message', async ({ messageId, pin } = {}) => {
        const [id] = validIds([messageId])
        const { msgs, convs } = await getOwnedContext([id], { write : true })
        const conv = convs[0]
        if (msgs[0].deletedForEveryone) throw new UserError('This message was deleted')
        if (msgs[0].system?.action) throw new UserError("You can't pin this")
        if (isGroup(conv) && !allowed(conv, me, 'editInfo')) throw new UserError('Only admins can pin messages in this group')
        const changed = [id]
        if (pin) {
            const pinned = await MessageModel.find({ conversationId : conv._id, pinned : true, _id : { $ne : id } }).sort({ pinnedAt : 1 }).select('_id').lean()
            const overflow = pinned.length - (LIMITS.MAX_PINNED_MESSAGES - 1)
            if (overflow > 0) {
                const unpinIds = pinned.slice(0, overflow).map((p) => p._id)
                await MessageModel.updateMany({ _id : { $in : unpinIds } }, { $set : { pinned : false } })
                changed.push(...unpinIds.map(String))
            }
            await MessageModel.updateOne({ _id : id }, { $set : { pinned : true, pinnedAt : new Date(), pinnedBy : meId } })
        } else {
            await MessageModel.updateOne({ _id : id }, { $set : { pinned : false } })
        }
        await emitMessageUpdate(conv, changed)
    })

    // forward to people and/or groups
    on('forward-messages', async ({ messageIds, toUserIds } = {}) => {
        const ids = validIds(messageIds, 30)
        const targets = validIds(toUserIds, LIMITS.MAX_FORWARD_TARGETS)
        const { msgs } = await getOwnedContext(ids)
        if (msgs.some((m) => m.deletedForEveryone)) throw new UserError('Deleted messages cannot be forwarded')
        if (msgs.some((m) => m.system?.action)) throw new UserError("Group notices can't be forwarded")
        if (msgs.some((m) => m.call?.media)) throw new UserError("Calls can't be forwarded")
        msgs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

        const meUser = await loadUser(me)
        const groups = await ConversationModel.find({ _id : { $in : targets }, isGroup : true }).select('-messages').lean()
        const groupIds = new Set(groups.map((g) => String(g._id)))
        const userTargets = targets.filter((t) => !groupIds.has(t))
        const peers = await UserModel.find({ _id : { $in : userTargets } }).select('-password').lean()
        if (peers.length !== userTargets.length) throw new UserError('User not found')

        let sent = 0
        const failed = []
        const content = (m) => ({
            text : m.text, imageUrl : m.imageUrl, videoUrl : m.videoUrl,
            fileUrl : m.fileUrl, fileName : m.fileName, fileSize : m.fileSize, fileType : m.fileType,
            stickerUrl : m.stickerUrl || "", audioUrl : m.audioUrl || "", audioDuration : m.audioDuration || 0,
            ...(m.audioWaveform ? { audioWaveform : m.audioWaveform } : {})
        })
        for (const target of [...peers.map((p) => ({ peer : p })), ...groups.map((g) => ({ group : g }))]) {
            try {
                for (const m of msgs) {
                    if (target.group) await createGroupMessage(meUser, target.group, content(m), { forwarded : true })
                    else await createMessage(meUser, target.peer, content(m), { forwarded : true })
                    sent += 1
                }
            } catch (error) {
                failed.push(target.group ? target.group.name : target.peer.name)
            }
        }
        return { sent, failed }
    })

    // people + group names for search / starred results
    const resultContext = async (convs, docs) => {
        const meUser = await loadUser(me)
        const convById = Object.fromEntries(convs.map((c) => [String(c._id), c]))
        const peerIds = [...new Set(convs.filter((c) => !isGroup(c)).map((c) => peerOf(c, me)))]
        const authorIds = [...new Set(docs.filter((d) => isGroup(convById[String(d.conversationId)])).map((d) => String(d.msgByUserId)))]
        const users = await UserModel.find({ _id : { $in : [...new Set([...peerIds, ...authorIds])] } }).select('-password').lean()
        const userById = Object.fromEntries(users.map((u) => [String(u._id), u]))
        const describe = (d) => {
            const conv = convById[String(d.conversationId)]
            if (isGroup(conv)) {
                return {
                    message : serializeMessage(d, me),
                    peer : groupAsPeer(conv),
                    authorName : String(d.msgByUserId) === me ? 'You' : userById[String(d.msgByUserId)]?.name || '',
                    author : String(d.msgByUserId) === me ? null : userById[String(d.msgByUserId)] ? publicUser(userById[String(d.msgByUserId)], meUser) : null
                }
            }
            const peer = userById[peerOf(conv, me)]
            return {
                message : serializeMessage(d, me, { receipts : receiptsAllowed(meUser, peer) }),
                peer : publicUser(peer, meUser)
            }
        }
        return { convById, describe }
    }

    on('search-messages', async ({ peerId, q } = {}) => {
        const query = typeof q === 'string' ? q.trim() : ''
        if (query.length < 1 || query.length > 100) return { results : [] }
        const regex = new RegExp(escapeRegex(query), 'i')

        let convs
        if (peerId) {
            const ctx = await resolveChat(peerId)
            convs = [ctx.conv.toObject ? ctx.conv.toObject() : ctx.conv]
        } else {
            convs = await ConversationModel.find(chatsOf(me)).select('-messages').lean()
        }
        if (!convs.length) return { results : [] }

        const docs = await MessageModel.find({
            conversationId : { $in : convs.map((c) => c._id) },
            deletedFor : { $ne : meId },
            deletedForEveryone : { $ne : true },
            text : regex,
            $or : [{ expiresAt : null }, { expiresAt : { $gt : new Date() } }]
        }).sort({ createdAt : -1 }).limit(60).lean()

        const { convById, describe } = await resultContext(convs, docs)
        const results = docs
            .filter((d) => canSeeMessage(convById[String(d.conversationId)], me, d))
            .slice(0, 50)
            .map(describe)
        return { results }
    })

    on('get-starred', async () => {
        const convs = await ConversationModel.find(chatsOf(me)).select('-messages').lean()
        const docs = await MessageModel.find({
            conversationId : { $in : convs.map((c) => c._id) },
            starredBy : meId,
            deletedFor : { $ne : meId },
            deletedForEveryone : { $ne : true },
            $or : [{ expiresAt : null }, { expiresAt : { $gt : new Date() } }]
        }).sort({ createdAt : -1 }).limit(200).populate('replyTo', REPLY_FIELDS).lean()

        const { convById, describe } = await resultContext(convs, docs)
        const messages = docs.filter((d) => canSeeMessage(convById[String(d.conversationId)], me, d)).map(describe)
        return { messages }
    })

    // media, documents and links shared in a chat
    on('get-shared', async ({ peerId } = {}) => {
        const { conv } = await resolveChat(peerId)
        const base = { ...visibleFilter(conv, me), deletedForEveryone : { $ne : true } }
        const [media, docs, links] = await Promise.all([
            MessageModel.find({ ...base, $and : [{ $or : [{ imageUrl : { $nin : ['', null] } }, { videoUrl : { $nin : ['', null] } }] }] }).sort({ createdAt : -1 }).limit(300).lean(),
            MessageModel.find({ ...base, fileUrl : { $nin : ['', null] } }).sort({ createdAt : -1 }).limit(200).lean(),
            MessageModel.find({ ...base, text : /https?:\/\/\S+/i }).sort({ createdAt : -1 }).limit(200).lean()
        ])
        const ser = (m) => serializeMessage(m, me, { receipts : false })
        return { media : media.map(ser), docs : docs.map(ser), links : links.map(ser) }
    })

    on('message-info', async ({ messageId } = {}) => {
        const [id] = validIds([messageId])
        const { msgs, convs } = await getOwnedContext([id])
        const msg = msgs[0]
        if (String(msg.msgByUserId) !== me || msg.system?.action) throw new UserError('Message info is only available for your messages')

        if (isGroup(convs[0])) {
            const readIds = new Set((msg.readBy || []).map((r) => String(r.userId)))
            const ids = [...new Set([...(msg.readBy || []), ...(msg.deliveredTo || [])].map((r) => String(r.userId)))]
            const meUser = await loadUser(me)
            const users = await UserModel.find({ _id : { $in : ids } }).select('-password').lean()
            const person = (r) => {
                const u = users.find((x) => String(x._id) === String(r.userId))
                if (!u) return null
                const pu = publicUser(u, meUser)
                return { _id : u._id, name : pu.name, profileName : u.name, isContact : pu.isContact, phone : u.phone, profile_pic : pu.profile_pic, at : r.at }
            }
            const readBy = (msg.readBy || []).map(person).filter(Boolean)
            const deliveredTo = (msg.deliveredTo || []).filter((r) => !readIds.has(String(r.userId))).map(person).filter(Boolean)
            const recipients = (msg.recipients || []).length
            return {
                info : {
                    group : true,
                    sentAt : msg.createdAt,
                    readBy,
                    deliveredTo,
                    remaining : Math.max(0, recipients - readBy.length - deliveredTo.length)
                }
            }
        }

        const [meUser, peer] = await Promise.all([loadUser(me), loadUser(peerOf(convs[0], me))])
        const receipts = receiptsAllowed(meUser, peer)
        return {
            info : {
                sentAt : msg.createdAt,
                deliveredAt : msg.deliveredAt || (msg.seen ? msg.seenAt || msg.updatedAt : null),
                seenAt : receipts ? (msg.seen ? msg.seenAt || null : null) : null,
                receiptsHidden : !receipts
            }
        }
    })

    // per-user chat list actions; none of these affect the other participants
    on('chat-action', async ({ peerId, action } = {}) => {
        const { conv, group } = await resolveChat(peerId)
        const now = new Date()
        switch (action) {
            case 'archive': await setState(conv._id, meId, { archived : true, pinned : false }); break
            case 'unarchive': await setState(conv._id, meId, { archived : false }); break
            case 'pin': {
                const pinnedCount = await ConversationModel.countDocuments({
                    _id : { $ne : conv._id },
                    userState : { $elemMatch : { userId : meId, pinned : true } }
                })
                if (pinnedCount >= LIMITS.MAX_PINNED_CHATS) throw new UserError(`You can only pin up to ${LIMITS.MAX_PINNED_CHATS} chats`)
                await setState(conv._id, meId, { pinned : true, pinnedAt : now, archived : false })
                break
            }
            case 'unpin': await setState(conv._id, meId, { pinned : false }); break
            case 'mute': await setState(conv._id, meId, { muted : true }); break
            case 'unmute': await setState(conv._id, meId, { muted : false }); break
            case 'mark-unread': await setState(conv._id, meId, { markedUnread : true }); break
            case 'accept':
                if (String(conv.requestFor || '') === me) {
                    await ConversationModel.updateOne({ _id : conv._id }, { $unset : { requestFor : 1 } })
                    await markSeen(peerId)
                }
                break
            case 'mark-read':
                await setState(conv._id, meId, { markedUnread : false })
                await markSeen(peerId)
                break
            case 'clear':
                await setState(conv._id, meId, { clearedAt : now })
                io.to(me).emit('chat-cleared', { peerId : String(peerId) })
                break
            case 'delete':
                // like WhatsApp: exit a group before deleting it
                if (group && memberOf(conv, me)) throw new UserError('Exit the group before deleting it')
                await setState(conv._id, meId, { clearedAt : now, hiddenAt : now, archived : false, pinned : false, markedUnread : false })
                io.to(me).emit('chat-cleared', { peerId : String(peerId), deleted : true })
                break
            default:
                throw new UserError('Unknown action')
        }
        refreshLists(conv, [me])
        return {}
    })

    on('set-disappearing', async ({ peerId, seconds } = {}) => {
        const value = Number(seconds)
        if (!LIMITS.DISAPPEAR_OPTIONS.includes(value)) throw new UserError('Invalid timer')
        const meUser = await loadUser(me)

        const group = await findGroup(peerId)
        if (group) {
            if (!memberOf(group, me)) throw new UserError("You're no longer a member of this group")
            if (!allowed(group, me, 'editInfo')) throw new UserError('Only admins can change this setting')
            if ((group.disappearAfter || 0) === value) return {}
            await ConversationModel.updateOne({ _id : group._id }, { $set : { disappearAfter : value } })
            await addSystemMessage(group, 'disappear', { value })
            for (const uid of memberIds(group)) {
                io.to(uid).emit('conversation-updated', { peerId : String(group._id), disappearAfter : value, by : me, byName : meUser.name })
            }
            emitItems(group._id, memberIds(group)).catch((e) => console.error('[sidebar]', e))
            return {}
        }

        if (hasBlocked(meUser, peerId)) throw new UserError('Unblock this contact first')
        const { conv } = await resolveChat(peerId, { create : true })
        await ConversationModel.updateOne({ _id : conv._id }, { $set : { disappearAfter : value } })
        const payload = { disappearAfter : value, by : me }
        io.to(me).emit('conversation-updated', { peerId : String(peerId), ...payload })
        if (String(peerId) !== me) io.to(String(peerId)).emit('conversation-updated', { peerId : me, ...payload })
        emitSidebar([me, String(peerId)]).catch((e) => console.error('[sidebar]', e))
        return {}
    })

    on('typing', async ({ to, isTyping } = {}) => {
        if (!isValidId(String(to)) || String(to) === me) return
        const group = await findGroup(to)
        if (group) {
            if (!memberOf(group, me)) return
            const meUser = await loadUser(me)
            for (const uid of memberIds(group)) {
                if (uid !== me) io.to(uid).emit('typing', { from : me, chat : String(group._id), name : meUser.name, phone : meUser.phone, isTyping : !!isTyping })
            }
            return
        }
        const [meUser, peer] = await Promise.all([loadUser(me), loadUser(to)])
        if (!peer || hasBlocked(meUser, to) || hasBlocked(peer, me)) return
        io.to(String(to)).emit('typing', { from : me, isTyping : !!isTyping })
    })

    on('block-user', async ({ userId, block } = {}) => {
        if (!isValidId(String(userId)) || String(userId) === me) throw new UserError('Invalid user')
        const exists = await UserModel.exists({ _id : userId })
        if (!exists) throw new UserError('User not found')
        const updated = await UserModel.findByIdAndUpdate(
            me,
            block ? { $addToSet : { blocked : oid(userId) } } : { $pull : { blocked : oid(userId) } },
            { new : true }
        ).select('-password').lean()
        presence.update(updated)
        broadcastOnline()
        emitSidebar([me, String(userId)]).catch((e) => console.error('[sidebar]', e))
        return { blocked : (updated.blocked || []).map(String) }
    })

    on('get-blocked', async () => {
        const meUser = await loadUser(me)
        const users = await UserModel.find({ _id : { $in : meUser.blocked || [] } }).select('-password').lean()
        return { users : users.map((u) => publicUser(u, meUser)) }
    })

    /* ---------- contacts ---------- */

    const contactsOf = (user) => (user?.contacts || []).map((c) => ({ userId : String(c.userId), name : c.name || '' }))

    // after a contact change: refresh presence (online visibility), both chat lists, and my other tabs
    const afterContactChange = async (updated, otherId) => {
        presence.update(updated)
        broadcastOnline()
        io.to(me).emit('contacts-updated', { contacts : contactsOf(updated) })
        emitSidebar([me, String(otherId)]).catch((e) => console.error('[sidebar]', e))
    }

    on('add-contact', async ({ userId, name } = {}) => {
        if (!isValidId(String(userId)) || String(userId) === me) throw new UserError('Invalid contact')
        const savedName = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim() : ''
        if (savedName.length > 50) throw new UserError('Name must be at most 50 characters')
        const exists = await UserModel.exists({ _id : userId })
        if (!exists) throw new UserError('User not found')

        const res = await UserModel.updateOne({ _id : meId, 'contacts.userId' : oid(userId) }, { $set : { 'contacts.$.name' : savedName } })
        if (res.matchedCount === 0) {
            await UserModel.updateOne({ _id : meId, 'contacts.userId' : { $ne : oid(userId) } }, { $push : { contacts : { userId : oid(userId), name : savedName, addedAt : new Date() } } })
        }
        // saving someone accepts their pending message request
        await ConversationModel.updateMany({
            requestFor : meId,
            $or : [{ sender : me, receiver : String(userId) }, { sender : String(userId), receiver : me }]
        }, { $unset : { requestFor : 1 } })

        const updated = await loadUser(me)
        await afterContactChange(updated, userId)
        return { contacts : contactsOf(updated) }
    })

    on('remove-contact', async ({ userId } = {}) => {
        if (!isValidId(String(userId))) throw new UserError('Invalid contact')
        await UserModel.updateOne({ _id : meId }, { $pull : { contacts : { userId : oid(userId) } } })
        const updated = await loadUser(me)
        await afterContactChange(updated, userId)
        return { contacts : contactsOf(updated) }
    })

    /* ---------- groups ---------- */

    // load and check the people being added to a group.
    // People whose privacy says "only my contacts can add me" are skipped unless they saved you.
    const loadNewMembers = async (meUser, userIds, { max }) => {
        const ids = validIds(userIds, Math.max(1, max)).filter((id) => id !== me)
        if (!ids.length) throw new UserError('Select at least one person')
        const users = await UserModel.find({ _id : { $in : ids } }).select('-password').lean()
        if (users.length !== ids.length) throw new UserError('Some people could not be found')
        const blocked = users.find((u) => hasBlocked(meUser, u._id))
        if (blocked) throw new UserError(`Unblock ${publicUser(blocked, meUser).name} to add them to a group`)
        const allowedUsers = [], skipped = []
        for (const u of users) {
            if (u.privacy?.groups === 'contacts' && !contactOf(u, me)) skipped.push(publicUser(u, meUser).name)
            else allowedUsers.push(u)
        }
        if (!allowedUsers.length) {
            throw new UserError(`${skipped.join(', ')} can't be added: their privacy settings only allow their contacts to add them to groups.`)
        }
        return { users : allowedUsers, skipped }
    }

    on('create-group', async ({ name, description, avatar, memberIds : ids } = {}) => {
        const groupName = cleanGroupName(name)
        const desc = cleanDescription(description)
        if (avatar && !isAllowedMediaUrl(avatar)) throw new UserError('Invalid group icon')
        const meUser = await loadUser(me)
        if (Array.isArray(ids) && ids.length > LIMITS.MAX_GROUP_MEMBERS - 1) throw new UserError(`A group can have up to ${LIMITS.MAX_GROUP_MEMBERS} members`)
        const { users : people, skipped } = await loadNewMembers(meUser, ids, { max : LIMITS.MAX_GROUP_MEMBERS - 1 })

        const now = new Date()
        const conv = await new ConversationModel({
            isGroup : true,
            name : groupName,
            description : desc,
            avatar : avatar || '',
            createdBy : meId,
            members : [
                { userId : meId, role : 'admin', joinedAt : now },
                ...people.map((u) => ({ userId : u._id, role : 'member', joinedAt : now, addedBy : meId }))
            ],
            lastMessageAt : now
        }).save()
        const lean = conv.toObject()

        await addSystemMessage(lean, 'create', { value : groupName })
        await addSystemMessage(lean, 'add', { targets : people })
        await emitItems(conv._id, memberIds(lean))
        return { groupId : String(conv._id), skipped }
    })

    on('group-info', async ({ groupId } = {}) => {
        const conv = await requireGroup(groupId, { member : false })
        const meUser = await loadUser(me)
        return { group : groupDetails(conv, meUser, await loadGroupUsers(conv)) }
    })

    on('group-update', async ({ groupId, name, description, avatar } = {}) => {
        const conv = await requireGroup(groupId)
        if (!allowed(conv, me, 'editInfo')) throw new UserError("Only admins can edit this group's info")
        const set = {}
        const notices = []
        if (name !== undefined) {
            const n = cleanGroupName(name)
            if (n !== conv.name) { set.name = n; notices.push(['subject', n]) }
        }
        if (description !== undefined) {
            const d = cleanDescription(description)
            if (d !== (conv.description || '')) { set.description = d; notices.push(['description', d ? 'changed' : 'removed']) }
        }
        if (avatar !== undefined) {
            if (avatar && !isAllowedMediaUrl(avatar)) throw new UserError('Invalid group icon')
            if ((avatar || '') !== (conv.avatar || '')) { set.avatar = avatar || ''; notices.push(['icon', avatar ? 'changed' : 'removed']) }
        }
        if (!notices.length) return {}
        await ConversationModel.updateOne({ _id : conv._id }, { $set : set })
        for (const [action, value] of notices) await addSystemMessage(conv, action, { value })
        await emitGroupUpdated(conv._id)
        emitItems(conv._id, everyoneIn(conv)).catch((e) => console.error('[sidebar]', e))
        return {}
    })

    on('group-add-members', async ({ groupId, userIds } = {}) => {
        const conv = await requireGroup(groupId)
        if (!allowed(conv, me, 'addMembers')) throw new UserError('Only admins can add members to this group')
        const meUser = await loadUser(me)
        const current = new Set(memberIds(conv))
        const fresh = (Array.isArray(userIds) ? userIds : []).map(String).filter((id) => !current.has(id))
        if (!fresh.length) throw new UserError('Those people are already in the group')
        const room = LIMITS.MAX_GROUP_MEMBERS - current.size
        if (fresh.length > room) throw new UserError(room > 0 ? `You can add ${room} more ${room === 1 ? 'person' : 'people'} (max ${LIMITS.MAX_GROUP_MEMBERS} members)` : `This group is full (max ${LIMITS.MAX_GROUP_MEMBERS} members)`)
        const { users : people, skipped } = await loadNewMembers(meUser, fresh, { max : room })

        const now = new Date()
        // anyone re-joining starts fresh: they don't see what was said while they were out
        await ConversationModel.updateOne({ _id : conv._id }, {
            $pull : { pastMembers : { userId : { $in : people.map((u) => u._id) } } }
        })
        await ConversationModel.updateOne({ _id : conv._id }, {
            $push : { members : { $each : people.map((u) => ({ userId : u._id, role : 'member', joinedAt : now, addedBy : meId })) } }
        })
        // those people may have deleted the group earlier: show it again
        await ConversationModel.updateOne({ _id : conv._id }, { $pull : { userState : { userId : { $in : people.map((u) => u._id) } } } })
        const updated = await findGroup(conv._id)
        await addSystemMessage(updated, 'add', { targets : people })
        await emitGroupUpdated(conv._id)
        await emitItems(conv._id, everyoneIn(updated))
        return { added : people.length, skipped }
    })

    on('group-remove-member', async ({ groupId, userId } = {}) => {
        const conv = await requireGroup(groupId)
        if (!isAdmin(conv, me)) throw new UserError('Only admins can remove members')
        const target = String(userId || '')
        if (target === me) throw new UserError('Use "Exit group" to leave')
        const member = memberOf(conv, target)
        if (!member) throw new UserError("They're not in this group")
        if (idOf(conv.createdBy) === target && idOf(conv.createdBy) !== me) throw new UserError("The group's creator can't be removed")
        const user = await loadUser(target)

        await addSystemMessage(conv, 'remove', { targets : [user || { _id : target, name : 'Someone' }] })
        const leftAt = new Date()
        await ConversationModel.updateOne({ _id : conv._id }, {
            $pull : { members : { userId : oid(target) } },
            $push : { pastMembers : { userId : oid(target), joinedAt : member.joinedAt, leftAt, removed : true } }
        })
        const updated = await findGroup(conv._id)
        await releaseReceipts(updated, target)
        await emitGroupUpdated(conv._id, [target])
        await emitItems(conv._id, everyoneIn(updated))
        return {}
    })

    on('group-set-admin', async ({ groupId, userId, admin } = {}) => {
        const conv = await requireGroup(groupId)
        if (!isAdmin(conv, me)) throw new UserError('Only admins can change admins')
        const target = String(userId || '')
        if (!memberOf(conv, target)) throw new UserError("They're not in this group")
        if (target === me) throw new UserError("You can't change your own admin role")
        if (!admin && idOf(conv.createdBy) === target) throw new UserError("The group's creator can't be dismissed as admin")
        await ConversationModel.updateOne({ _id : conv._id, 'members.userId' : oid(target) }, { $set : { 'members.$.role' : admin ? 'admin' : 'member' } })
        await emitGroupUpdated(conv._id)
        return {}
    })

    on('group-leave', async ({ groupId } = {}) => {
        const conv = await requireGroup(groupId)
        const member = memberOf(conv, me)

        await addSystemMessage(conv, 'leave')
        const leftAt = new Date()
        await ConversationModel.updateOne({ _id : conv._id }, {
            $pull : { members : { userId : meId } },
            $push : { pastMembers : { userId : meId, joinedAt : member.joinedAt, leftAt, removed : false } }
        })

        // a group always keeps an admin: if the last one leaves, the longest-standing member takes over (like WhatsApp)
        let updated = await findGroup(conv._id)
        if (updated.members.length && !updated.members.some((m) => m.role === 'admin')) {
            const next = [...updated.members].sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))[0]
            await ConversationModel.updateOne({ _id : conv._id, 'members.userId' : next.userId }, { $set : { 'members.$.role' : 'admin' } })
            updated = await findGroup(conv._id)
        }
        await releaseReceipts(updated, me)
        await setState(conv._id, meId, { pinned : false })
        await emitGroupUpdated(conv._id, [me])
        await emitItems(conv._id, everyoneIn(updated))
        return {}
    })

    on('group-settings', async ({ groupId, settings } = {}) => {
        const conv = await requireGroup(groupId)
        if (!isAdmin(conv, me)) throw new UserError('Only admins can change group settings')
        if (!settings || typeof settings !== 'object') throw new UserError('Invalid settings')
        const set = {}
        for (const key of SETTING_KEYS) {
            if (settings[key] === undefined) continue
            if (!['all', 'admins'].includes(settings[key])) throw new UserError('Invalid settings')
            const current = conv.settings?.[key] || (key === 'addMembers' ? 'admins' : 'all')
            if (settings[key] !== current) set[`settings.${key}`] = settings[key]
        }
        if (!Object.keys(set).length) return {}
        await ConversationModel.updateOne({ _id : conv._id }, { $set : set })
        // only "who can send messages" is announced in the chat, like WhatsApp
        if (set['settings.sendMessages']) await addSystemMessage(conv, 'settings', { value : `sendMessages:${set['settings.sendMessages']}` })
        if (set['settings.editInfo']) await addSystemMessage(conv, 'settings', { value : `editInfo:${set['settings.editInfo']}` })
        await emitGroupUpdated(conv._id)
        emitItems(conv._id, memberIds(conv)).catch((e) => console.error('[sidebar]', e))
        return {}
    })
}
