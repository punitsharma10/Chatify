const UserModel = require('../models/user.model')
const { PostModel, CommentModel, NotificationModel } = require('../models/social.model')
const { CxGroupModel, CxEventModel, ListingModel, LISTING_CATEGORIES } = require('../models/cxGroup.model')
const { isAllowedMediaUrl, isValidId, escapeRegex } = require('../helpers/chat')
const S = require('../helpers/social')
const { handle } = require('./posts.controller')

// Connectify (Facebook-style) Groups, Events and Marketplace.

const PAGE = 12
const fail = (m, status = 400) => new S.SocialError(m, status)
const beforeFilter = (before, field = 'createdAt') => (before && !Number.isNaN(Date.parse(before)) ? { [field] : { $lt : new Date(before) } } : {})
const str = (v, max, label, required = false) => {
    const s = typeof v === 'string' ? v.trim() : ''
    if (required && !s) throw fail(`Add a ${label}`)
    if (s.length > max) throw fail(`${label[0].toUpperCase() + label.slice(1)} is too long`)
    return s
}
const photo = (url, label = 'photo') => {
    if (!url) return ''
    if (!isAllowedMediaUrl(url)) throw fail(`Invalid ${label}`)
    return url
}
const loadDoc = async (Model, id, what) => {
    if (!isValidId(String(id))) throw fail(`${what} not found`, 404)
    const doc = await Model.findById(id).lean()
    if (!doc) throw fail(`${what} not found`, 404)
    return doc
}
// friends I can invite (only friends, never blocked)
const friendsAmong = async (me, ids) => {
    const friends = new Set(await S.friendIds(me._id))
    return [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter((id) => friends.has(id)).slice(0, 100)
}

/* ================= Groups ================= */

const memberOf = (g, id) => g.members.find((m) => String(m.userId) === String(id))
const isAdmin = (g, id) => memberOf(g, id)?.role === 'admin'

const groupCard = (g, me, users = {}) => {
    const mine = memberOf(g, me._id)
    return {
        _id : String(g._id),
        name : g.name,
        description : g.description || '',
        privacy : g.privacy,
        cover : g.cover || '',
        memberCount : g.members.length,
        role : mine?.role || null,
        requested : (g.requests || []).some((r) => String(r.userId) === String(me._id)),
        canSeePosts : g.privacy === 'public' || !!mine,
        lastPostAt : g.lastPostAt || null,
        createdAt : g.createdAt,
        membersPreview : g.members.slice(0, 6).map((m) => users[String(m.userId)]).filter(Boolean).map((u) => S.personCard(u, me)),
        ...(mine?.role === 'admin' ? { requestCount : (g.requests || []).length } : {})
    }
}

// GET /groups?tab=yours|discover&q=
const listGroups = handle(async (req) => {
    const me = req.user
    let groups
    if (req.query.tab === 'discover') {
        const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 50) : ''
        groups = await CxGroupModel.find({ 'members.userId' : { $ne : me._id }, ...(q ? { name : new RegExp(escapeRegex(q), 'i') } : {}) }).sort({ lastPostAt : -1, createdAt : -1 }).limit(40).lean()
        // friends in the group rank it higher
        const friends = new Set(await S.friendIds(me._id))
        groups.sort((a, b) => b.members.filter((m) => friends.has(String(m.userId))).length - a.members.filter((m) => friends.has(String(m.userId))).length)
    } else {
        groups = await CxGroupModel.find({ 'members.userId' : me._id }).sort({ lastPostAt : -1, createdAt : -1 }).limit(100).lean()
    }
    const users = await S.loadUsers(groups.flatMap((g) => g.members.slice(0, 6).map((m) => m.userId)))
    return { groups : groups.map((g) => groupCard(g, me, users)) }
})

// POST /groups { name, description, privacy, cover, invite: [friendIds] }
const createGroup = handle(async (req) => {
    const me = req.user
    const doc = {
        name : str(req.body.name, 75, 'group name', true),
        description : str(req.body.description, 1000, 'description'),
        privacy : req.body.privacy === 'private' ? 'private' : 'public',
        cover : photo(req.body.cover, 'cover photo'),
        createdBy : me._id,
        members : [{ userId : me._id, role : 'admin' }]
    }
    if ((await CxGroupModel.countDocuments({ createdBy : me._id })) >= 50) throw fail('You can create up to 50 groups')
    const g = await CxGroupModel.create(doc)
    for (const id of await friendsAmong(me, req.body.invite)) await S.notify({ user : id, actor : me._id, app : 'connectify', type : 'group_invite', group : g._id })
    return { group : groupCard(g.toObject(), me) }
})

const loadGroup = (id) => loadDoc(CxGroupModel, id, 'Group')

// GET /groups/:id
const getGroup = handle(async (req) => {
    const g = await loadGroup(req.params.id)
    const users = await S.loadUsers(g.members.slice(0, 6).map((m) => m.userId))
    return { group : groupCard(g, req.user, users) }
})

// PATCH /groups/:id (admins) { name, description, privacy, cover }
const updateGroup = handle(async (req) => {
    const g = await loadGroup(req.params.id)
    if (!isAdmin(g, req.user._id)) throw fail('Only admins can edit the group', 403)
    const set = {}
    if (req.body.name !== undefined) set.name = str(req.body.name, 75, 'group name', true)
    if (req.body.description !== undefined) set.description = str(req.body.description, 1000, 'description')
    if (req.body.privacy !== undefined) set.privacy = req.body.privacy === 'private' ? 'private' : 'public'
    if (req.body.cover !== undefined) set.cover = photo(req.body.cover, 'cover photo')
    // a group that goes public lets everyone who was waiting in
    const unset = set.privacy === 'public' && g.requests?.length ? { $push : { members : { $each : g.requests.map((r) => ({ userId : r.userId, role : 'member' })) } }, $set : { ...set, requests : [] } } : { $set : set }
    const updated = await CxGroupModel.findByIdAndUpdate(g._id, unset, { new : true }).lean()
    return { group : groupCard(updated, req.user) }
})

// DELETE /groups/:id (admins): removes the group and its posts
const deleteGroup = handle(async (req) => {
    const g = await loadGroup(req.params.id)
    if (!isAdmin(g, req.user._id)) throw fail('Only admins can delete the group', 403)
    const posts = (await PostModel.find({ group : g._id }).select('_id').lean()).map((p) => p._id)
    await Promise.all([
        CxGroupModel.deleteOne({ _id : g._id }),
        PostModel.deleteMany({ group : g._id }),
        CommentModel.deleteMany({ post : { $in : posts } }),
        NotificationModel.deleteMany({ $or : [{ group : g._id }, { post : { $in : posts } }] })
    ])
    return {}
})

// POST /groups/:id/join -> public: joined; private: request sent to the admins
const joinGroup = handle(async (req) => {
    const g = await loadGroup(req.params.id)
    const me = req.user
    if (memberOf(g, me._id)) return { group : groupCard(g, me) }
    let updated
    if (g.privacy === 'public') {
        updated = await CxGroupModel.findOneAndUpdate({ _id : g._id, 'members.userId' : { $ne : me._id } }, { $push : { members : { userId : me._id, role : 'member' } }, $pull : { requests : { userId : me._id } } }, { new : true }).lean() || g
    } else {
        updated = await CxGroupModel.findOneAndUpdate({ _id : g._id, 'requests.userId' : { $ne : me._id } }, { $push : { requests : { userId : me._id } } }, { new : true }).lean() || g
        for (const a of g.members.filter((m) => m.role === 'admin')) await S.notify({ user : a.userId, actor : me._id, app : 'connectify', type : 'group_join_request', group : g._id })
    }
    await NotificationModel.deleteMany({ user : me._id, group : g._id, type : 'group_invite' })
    return { group : groupCard(updated, me) }
})

// POST /groups/:id/cancel -> withdraw my join request
const cancelRequest = handle(async (req) => {
    const g = await CxGroupModel.findByIdAndUpdate(isValidId(String(req.params.id)) ? req.params.id : null, { $pull : { requests : { userId : req.user._id } } }, { new : true }).lean()
    if (!g) throw fail('Group not found', 404)
    return { group : groupCard(g, req.user) }
})

// removes a member; the last admin leaving makes the longest-standing member admin; an empty group is deleted
const dropMember = async (g, userId) => {
    const rest = g.members.filter((m) => String(m.userId) !== String(userId))
    if (!rest.length) {
        await CxGroupModel.deleteOne({ _id : g._id })
        await PostModel.deleteMany({ group : g._id })
        return null
    }
    if (!rest.some((m) => m.role === 'admin')) rest.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))[0].role = 'admin'
    return CxGroupModel.findByIdAndUpdate(g._id, { $set : { members : rest } }, { new : true }).lean()
}

// POST /groups/:id/leave
const leaveGroup = handle(async (req) => {
    const g = await loadGroup(req.params.id)
    if (!memberOf(g, req.user._id)) throw fail("You're not in this group")
    await dropMember(g, req.user._id)
    return {}
})

// GET /groups/:id/members
const groupMembers = handle(async (req) => {
    const g = await loadGroup(req.params.id)
    if (g.privacy === 'private' && !memberOf(g, req.user._id)) throw fail('Join the group to see its members', 403)
    const users = await S.loadUsers(g.members.map((m) => m.userId))
    return {
        people : g.members.map((m) => (users[String(m.userId)] && !S.blockedEitherWay(req.user, users[String(m.userId)]) ? { ...S.personCard(users[String(m.userId)], req.user), role : m.role, joinedAt : m.joinedAt } : null))
            .filter(Boolean).sort((a, b) => (a.role === 'admin' ? -1 : 0) - (b.role === 'admin' ? -1 : 0))
    }
})

// GET /groups/:id/requests (admins)
const groupRequests = handle(async (req) => {
    const g = await loadGroup(req.params.id)
    if (!isAdmin(g, req.user._id)) throw fail('Only admins can see requests', 403)
    const users = await S.loadUsers(g.requests.map((r) => r.userId))
    return { people : g.requests.map((r) => (users[String(r.userId)] ? { ...S.personCard(users[String(r.userId)], req.user), at : r.at } : null)).filter(Boolean) }
})

// POST /groups/:id/requests/:userId { approve }
const answerRequest = handle(async (req) => {
    const g = await loadGroup(req.params.id)
    if (!isAdmin(g, req.user._id)) throw fail('Only admins can answer requests', 403)
    const r = (g.requests || []).find((x) => String(x.userId) === String(req.params.userId))
    if (!r) throw fail('This request is no longer available', 404)
    const update = { $pull : { requests : { userId : r.userId } } }
    if (req.body.approve !== false) update.$push = { members : { userId : r.userId, role : 'member' } }
    const updated = await CxGroupModel.findByIdAndUpdate(g._id, update, { new : true }).lean()
    await NotificationModel.deleteMany({ group : g._id, actor : r.userId, type : 'group_join_request' })
    if (req.body.approve !== false) await S.notify({ user : r.userId, actor : req.user._id, app : 'connectify', type : 'group_join_accept', group : g._id })
    return { group : groupCard(updated, req.user) }
})

// POST /groups/:id/members/:userId { action: 'remove' | 'admin' | 'member' } (admins)
const manageMember = handle(async (req) => {
    const g = await loadGroup(req.params.id)
    if (!isAdmin(g, req.user._id)) throw fail('Only admins can do this', 403)
    const m = memberOf(g, req.params.userId)
    if (!m || String(m.userId) === String(req.user._id)) throw fail('Not in this group')
    if (req.body.action === 'remove') await dropMember(g, m.userId)
    else if (['admin', 'member'].includes(req.body.action)) await CxGroupModel.updateOne({ _id : g._id, 'members.userId' : m.userId }, { $set : { 'members.$.role' : req.body.action } })
    else throw fail('Invalid action')
    return {}
})

// POST /groups/:id/invite { userIds } (members invite friends)
const inviteToGroup = handle(async (req) => {
    const g = await loadGroup(req.params.id)
    if (!memberOf(g, req.user._id)) throw fail('Join the group to invite people', 403)
    const ids = (await friendsAmong(req.user, req.body.userIds)).filter((id) => !memberOf(g, id))
    for (const id of ids) await S.notify({ user : id, actor : req.user._id, app : 'connectify', type : 'group_invite', group : g._id })
    return { invited : ids.length }
})

// GET /groups/:id/posts?before=
const groupPosts = handle(async (req) => {
    const g = await loadGroup(req.params.id)
    if (g.privacy === 'private' && !memberOf(g, req.user._id)) return { posts : [], next : null, private : true }
    const raw = await PostModel.find({ group : g._id, ...beforeFilter(req.query.before) }).sort({ createdAt : -1 }).limit(PAGE).lean()
    const ctx = await S.viewerContext(req.user, 'connectify')
    const posts = (await S.serializePosts(raw, ctx)).map((p) => ({ ...p, canModerate : isAdmin(g, req.user._id) }))
    return { posts, next : raw.length === PAGE ? raw[raw.length - 1].createdAt : null }
})

// DELETE /groups/:id/posts/:postId (admins remove a post)
const removeGroupPost = handle(async (req) => {
    const g = await loadGroup(req.params.id)
    if (!isAdmin(g, req.user._id)) throw fail('Only admins can remove posts', 403)
    if (!isValidId(String(req.params.postId))) throw fail('Post not found', 404)
    const post = await PostModel.findOneAndDelete({ _id : req.params.postId, group : g._id }).lean()
    if (!post) throw fail('Post not found', 404)
    await Promise.all([CommentModel.deleteMany({ post : post._id }), NotificationModel.deleteMany({ post : post._id })])
    return {}
})

/* ================= Events ================= */

// can `me` see this event?
const canSeeEvent = (e, me, friends) => {
    const id = String(me._id)
    if (String(e.host) === id || e.going.some((x) => String(x) === id) || e.interested.some((x) => String(x) === id) || e.invited.some((x) => String(x) === id)) return true
    if (e.privacy === 'public') return true
    if (e.privacy === 'friends') return friends.has(String(e.host))
    return false
}

const eventCard = (e, me, users = {}) => {
    const id = String(me._id)
    const host = users[String(e.host)]
    return {
        _id : String(e._id),
        title : e.title,
        description : e.description || '',
        cover : e.cover || '',
        startsAt : e.startsAt,
        endsAt : e.endsAt || null,
        location : e.location || '',
        privacy : e.privacy,
        host : host ? S.personCard(host, me) : null,
        isHost : String(e.host) === id,
        goingCount : e.going.length,
        interestedCount : e.interested.length,
        myStatus : e.going.some((x) => String(x) === id) ? 'going' : e.interested.some((x) => String(x) === id) ? 'interested' : null,
        invited : e.invited.some((x) => String(x) === id),
        goingPreview : e.going.slice(0, 5).map((x) => users[String(x)]).filter(Boolean).map((u) => S.personCard(u, me))
    }
}

const eventUsers = (events) => S.loadUsers(events.flatMap((e) => [e.host, ...e.going.slice(0, 5)]))

// GET /events?tab=upcoming|hosting|going|past
const listEvents = handle(async (req) => {
    const me = req.user
    const now = new Date()
    const friends = new Set(await S.friendIds(me._id))
    const tab = req.query.tab || 'upcoming'
    let filter
    if (tab === 'hosting') filter = { host : me._id }
    else if (tab === 'going') filter = { $or : [{ going : me._id }, { interested : me._id }], startsAt : { $gte : new Date(now - 12 * 3600 * 1000) } }
    else if (tab === 'past') filter = { $or : [{ host : me._id }, { going : me._id }, { interested : me._id }], startsAt : { $lt : now } }
    else filter = { startsAt : { $gte : new Date(now - 12 * 3600 * 1000) }, $or : [{ privacy : 'public' }, { host : { $in : [...friends, String(me._id)].map(S.oid) } }, { invited : me._id }] }
    const list = (await CxEventModel.find(filter).sort({ startsAt : tab === 'past' ? -1 : 1 }).limit(60).lean()).filter((e) => canSeeEvent(e, me, friends))
    const users = await eventUsers(list)
    return { events : list.filter((e) => !users[String(e.host)] || !S.blockedEitherWay(me, users[String(e.host)])).map((e) => eventCard(e, me, users)) }
})

const cleanEvent = (body, existing = {}) => {
    const out = {}
    if (body.title !== undefined || !existing._id) out.title = str(body.title, 100, 'event name', true)
    if (body.description !== undefined) out.description = str(body.description, 2000, 'description')
    if (body.location !== undefined) out.location = str(body.location, 120, 'location')
    if (body.cover !== undefined) out.cover = photo(body.cover, 'cover photo')
    if (body.privacy !== undefined) out.privacy = ['public', 'friends', 'private'].includes(body.privacy) ? body.privacy : 'friends'
    if (body.startsAt !== undefined || !existing._id) {
        const d = new Date(body.startsAt)
        if (Number.isNaN(d.getTime())) throw fail('Choose when the event starts')
        if (!existing._id && d < new Date(Date.now() - 3600 * 1000)) throw fail('The event must start in the future')
        out.startsAt = d
    }
    if (body.endsAt === undefined && out.startsAt && existing.endsAt && new Date(existing.endsAt) <= out.startsAt) throw fail('The event must end after it starts')
    if (body.endsAt !== undefined) {
        if (!body.endsAt) out.endsAt = null
        else {
            const d = new Date(body.endsAt)
            if (Number.isNaN(d.getTime()) || d <= (out.startsAt || existing.startsAt)) throw fail('The event must end after it starts')
            out.endsAt = d
        }
    }
    return out
}

// POST /events { title, description, startsAt, endsAt, location, privacy, cover, invite }
const createEvent = handle(async (req) => {
    const me = req.user
    const e = await CxEventModel.create({ ...cleanEvent(req.body), host : me._id, going : [me._id] })
    const invite = await friendsAmong(me, req.body.invite)
    if (invite.length) await CxEventModel.updateOne({ _id : e._id }, { $addToSet : { invited : { $each : invite.map(S.oid) } } })
    for (const id of invite) await S.notify({ user : id, actor : me._id, app : 'connectify', type : 'event_invite', event : e._id })
    const fresh = await CxEventModel.findById(e._id).lean()
    return { event : eventCard(fresh, me, await eventUsers([fresh])) }
})

const loadVisibleEvent = async (req) => {
    const e = await loadDoc(CxEventModel, req.params.id, 'Event')
    const friends = new Set(await S.friendIds(req.user._id))
    const host = await UserModel.findById(e.host).select('blocked deletedAt').lean()
    if (!canSeeEvent(e, req.user, friends) || !host || S.blockedEitherWay(req.user, host)) throw fail('Event not found', 404)
    return e
}

// GET /events/:id
const getEvent = handle(async (req) => {
    const e = await loadVisibleEvent(req)
    return { event : eventCard(e, req.user, await eventUsers([e])) }
})

// PATCH /events/:id (host)
const updateEvent = handle(async (req) => {
    const e = await loadDoc(CxEventModel, req.params.id, 'Event')
    if (String(e.host) !== String(req.user._id)) throw fail('Only the host can edit the event', 403)
    const updated = await CxEventModel.findByIdAndUpdate(e._id, { $set : cleanEvent(req.body, e) }, { new : true }).lean()
    return { event : eventCard(updated, req.user, await eventUsers([updated])) }
})

// DELETE /events/:id (host)
const deleteEvent = handle(async (req) => {
    const e = await loadDoc(CxEventModel, req.params.id, 'Event')
    if (String(e.host) !== String(req.user._id)) throw fail('Only the host can cancel the event', 403)
    await Promise.all([CxEventModel.deleteOne({ _id : e._id }), NotificationModel.deleteMany({ event : e._id })])
    return {}
})

// POST /events/:id/rsvp { status: 'going' | 'interested' | null }
const rsvp = handle(async (req) => {
    const e = await loadVisibleEvent(req)
    const me = req.user._id
    const status = ['going', 'interested'].includes(req.body.status) ? req.body.status : null
    const update = { $pull : { going : me, interested : me } }
    await CxEventModel.updateOne({ _id : e._id }, update)
    if (status) await CxEventModel.updateOne({ _id : e._id }, { $addToSet : { [status] : me } })
    if (status === 'going') await S.notify({ user : e.host, actor : me, app : 'connectify', type : 'event_going', event : e._id })
    const fresh = await CxEventModel.findById(e._id).lean()
    return { event : eventCard(fresh, req.user, await eventUsers([fresh])) }
})

// POST /events/:id/invite { userIds } (host or anyone going)
const inviteToEvent = handle(async (req) => {
    const e = await loadVisibleEvent(req)
    const me = String(req.user._id)
    if (String(e.host) !== me && !e.going.some((x) => String(x) === me)) throw fail('Only the host and guests can invite people', 403)
    const ids = await friendsAmong(req.user, req.body.userIds)
    await CxEventModel.updateOne({ _id : e._id }, { $addToSet : { invited : { $each : ids.map(S.oid) } } })
    for (const id of ids) await S.notify({ user : id, actor : req.user._id, app : 'connectify', type : 'event_invite', event : e._id })
    return { invited : ids.length }
})

// GET /events/:id/guests -> { going, interested }
const eventGuests = handle(async (req) => {
    const e = await loadVisibleEvent(req)
    const users = await S.loadUsers([...e.going, ...e.interested])
    const card = (id) => (users[String(id)] && !S.blockedEitherWay(req.user, users[String(id)]) ? S.personCard(users[String(id)], req.user) : null)
    return { going : e.going.map(card).filter(Boolean), interested : e.interested.map(card).filter(Boolean) }
})

/* ================= Marketplace ================= */

const listingCard = (l, me, users = {}) => {
    const seller = users[String(l.seller)]
    return {
        _id : String(l._id),
        title : l.title,
        price : l.price,
        currency : l.currency,
        category : l.category,
        condition : l.condition,
        description : l.description || '',
        location : l.location || '',
        photos : l.photos || [],
        status : l.status,
        seller : seller ? S.personCard(seller, me) : null,
        mine : String(l.seller) === String(me._id),
        saved : (l.savedBy || []).some((x) => String(x) === String(me._id)),
        createdAt : l.createdAt
    }
}

const cleanListing = (body, isNew) => {
    const out = {}
    if (body.title !== undefined || isNew) out.title = str(body.title, 100, 'title', true)
    if (body.price !== undefined || isNew) {
        const p = Number(body.price)
        if (!Number.isFinite(p) || p < 0 || p > 1e10) throw fail('Enter a valid price')
        out.price = Math.round(p * 100) / 100
    }
    if (body.category !== undefined) out.category = LISTING_CATEGORIES.includes(body.category) ? body.category : 'other'
    if (body.condition !== undefined) out.condition = ['new', 'like_new', 'good', 'fair'].includes(body.condition) ? body.condition : 'good'
    if (body.description !== undefined) out.description = str(body.description, 2000, 'description')
    if (body.location !== undefined) out.location = str(body.location, 100, 'location')
    if (body.status !== undefined) out.status = ['available', 'pending', 'sold'].includes(body.status) ? body.status : 'available'
    if (body.photos !== undefined || isNew) {
        if (!Array.isArray(body.photos) || !body.photos.length || body.photos.length > 10) throw fail('Add 1 to 10 photos')
        out.photos = body.photos.map((m) => {
            if (!m?.url || !isAllowedMediaUrl(m.url)) throw fail('Invalid photo')
            return { url : m.url, kind : 'image', ...(m.width && m.height ? { width : Math.round(m.width), height : Math.round(m.height) } : {}) }
        })
    }
    return out
}

// GET /market?category=&q=&tab=browse|mine|saved&before=
const listListings = handle(async (req) => {
    const me = req.user
    const tab = req.query.tab || 'browse'
    let filter
    if (tab === 'mine') filter = { seller : me._id }
    else if (tab === 'saved') filter = { savedBy : me._id }
    else {
        filter = { status : { $ne : 'sold' } }
        if (LISTING_CATEGORIES.includes(req.query.category)) filter.category = req.query.category
        const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : ''
        if (q) filter.title = new RegExp(escapeRegex(q), 'i')
    }
    const raw = await ListingModel.find({ ...filter, ...beforeFilter(req.query.before) }).sort({ createdAt : -1 }).limit(24).lean()
    const users = await S.loadUsers(raw.map((l) => l.seller))
    const listings = raw.filter((l) => users[String(l.seller)] && !users[String(l.seller)].deletedAt && !S.blockedEitherWay(me, users[String(l.seller)])).map((l) => listingCard(l, me, users))
    return { listings, next : raw.length === 24 ? raw[raw.length - 1].createdAt : null, categories : LISTING_CATEGORIES }
})

// POST /market
const createListing = handle(async (req) => {
    if ((await ListingModel.countDocuments({ seller : req.user._id, status : { $ne : 'sold' } })) >= 100) throw fail('You can have up to 100 active listings')
    const l = await ListingModel.create({ ...cleanListing(req.body, true), seller : req.user._id })
    return { listing : listingCard(l.toObject(), req.user, await S.loadUsers([req.user._id])) }
})

const loadListing = async (req) => {
    const l = await loadDoc(ListingModel, req.params.id, 'Listing')
    const seller = await UserModel.findById(l.seller).select('-password -devices -chatLockCode').lean()
    if (!seller || seller.deletedAt || S.blockedEitherWay(req.user, seller)) throw fail('Listing not found', 404)
    return { l, users : { [String(seller._id)] : seller } }
}

const getListing = handle(async (req) => {
    const { l, users } = await loadListing(req)
    return { listing : listingCard(l, req.user, users) }
})

// PATCH /market/:id (seller) -> edit, or mark pending / sold / available
const updateListing = handle(async (req) => {
    const { l, users } = await loadListing(req)
    if (String(l.seller) !== String(req.user._id)) throw fail('Only the seller can edit this listing', 403)
    const updated = await ListingModel.findByIdAndUpdate(l._id, { $set : cleanListing(req.body, false) }, { new : true }).lean()
    return { listing : listingCard(updated, req.user, users) }
})

const deleteListing = handle(async (req) => {
    const { l } = await loadListing(req)
    if (String(l.seller) !== String(req.user._id)) throw fail('Only the seller can delete this listing', 403)
    await ListingModel.deleteOne({ _id : l._id })
    return {}
})

// POST /market/:id/save { save }
const saveListing = handle(async (req) => {
    const { l } = await loadListing(req)
    const save = req.body.save !== false
    await ListingModel.updateOne({ _id : l._id }, save ? { $addToSet : { savedBy : req.user._id } } : { $pull : { savedBy : req.user._id } })
    return { saved : save }
})

module.exports = {
    listGroups, createGroup, getGroup, updateGroup, deleteGroup, joinGroup, cancelRequest, leaveGroup, groupMembers, groupRequests, answerRequest,
    manageMember, inviteToGroup, groupPosts, removeGroupPost,
    listEvents, createEvent, getEvent, updateEvent, deleteEvent, rsvp, inviteToEvent, eventGuests,
    listListings, createListing, getListing, updateListing, deleteListing, saveListing
}
