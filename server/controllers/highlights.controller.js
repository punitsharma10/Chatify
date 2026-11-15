const UserModel = require('../models/user.model')
const StatusModel = require('../models/status.model')
const { FollowModel } = require('../models/social.model')
const { StoryArchiveModel, HighlightModel } = require('../models/highlight.model')
const { isValidId, escapeRegex } = require('../helpers/chat')
const S = require('../helpers/social')
const { handle } = require('./posts.controller')

// Pixify story archive, highlights and Close friends (Instagram parity).

const MAX_HIGHLIGHTS = 100
const MAX_ITEMS = 100
const MAX_TITLE = 30
const MAX_CLOSE_FRIENDS = 500

const isCloseFriendOf = (owner, viewerId) => (owner.pixify?.closeFriends || []).some((id) => String(id) === String(viewerId))

/* ---------- story archive ---------- */

// keep a private copy of a story shared to Pixify (never an end-to-end encrypted one)
const archiveStory = async (st) => {
    if (!st || st.e2ee || !(st.apps || []).includes('pixify')) return
    await StoryArchiveModel.updateOne({ statusId : st._id }, {
        $setOnInsert : {
            userId : st.userId, statusId : st._id, kind : st.kind,
            text : st.text || '', background : st.background || '', font : st.font || 0,
            mediaUrl : st.mediaUrl || '', caption : st.caption || '',
            ...(st.closeFriends ? { closeFriends : true } : {}),
            createdAt : st.createdAt || new Date()
        }
    }, { upsert : true })
}

// deleting a story also removes it from the archive and every highlight (like Instagram)
const unarchiveStory = async (userId, statusId) => {
    const item = await StoryArchiveModel.findOneAndDelete({ userId, statusId }).lean()
    if (item) await dropItems(userId, [item._id])
}

// take items out of my highlights; a highlight left empty is deleted
const dropItems = async (userId, ids) => {
    await HighlightModel.updateMany({ userId, items : { $in : ids } }, { $pull : { items : { $in : ids } } })
    await HighlightModel.deleteMany({ userId, items : { $size : 0 } })
}

const serializeItem = (a) => ({
    _id : String(a._id), kind : a.kind, text : a.text || '', background : a.background || '', font : a.font || 0,
    mediaUrl : a.mediaUrl || '', caption : a.caption || '', createdAt : a.createdAt,
    ...(a.closeFriends ? { closeFriends : true } : {})
})

// GET /stories/archive?before=  my archived stories, newest first
const archive = handle(async (req) => {
    const me = req.user._id
    // stories posted before the archive existed (or while a copy failed) are picked up here while they're live
    const live = await StatusModel.find({ userId : me, apps : 'pixify', e2ee : { $exists : false }, expiresAt : { $gt : new Date() } }).lean()
    for (const st of live) await archiveStory(st).catch(() => {})
    const before = req.query.before && !Number.isNaN(Date.parse(req.query.before)) ? { createdAt : { $lt : new Date(req.query.before) } } : {}
    const items = await StoryArchiveModel.find({ userId : me, ...before }).sort({ createdAt : -1 }).limit(60).lean()
    return { items : items.map(serializeItem), next : items.length === 60 ? items[items.length - 1].createdAt : null }
})

// DELETE /stories/archive/:id
const deleteArchived = handle(async (req) => {
    if (!isValidId(String(req.params.id))) throw new S.SocialError('Story not found', 404)
    const item = await StoryArchiveModel.findOneAndDelete({ _id : req.params.id, userId : req.user._id }).lean()
    if (!item) throw new S.SocialError('Story not found', 404)
    await dropItems(req.user._id, [item._id])
    return {}
})

/* ---------- highlights ---------- */

// what a viewer may see: Close-friends stories only for the owner's close friends; empty highlights are hidden
const serializeHighlights = async (owner, list, viewer) => {
    const mine = String(owner._id) === String(viewer._id)
    const ids = [...new Set(list.flatMap((h) => h.items.map(String)))]
    const items = await StoryArchiveModel.find({ _id : { $in : ids }, userId : owner._id }).lean()
    const byId = Object.fromEntries(items.map((a) => [String(a._id), a]))
    const closeFriend = mine || isCloseFriendOf(owner, viewer._id)
    return list.map((h) => {
        const visible = h.items.map((id) => byId[String(id)]).filter((a) => a && (closeFriend || !a.closeFriends))
        return { _id : String(h._id), title : h.title, items : visible.map(serializeItem), ...(mine ? { total : h.items.length } : {}) }
    }).filter((h) => h.items.length || mine)
}

// GET /users/:id/highlights  (anyone who can see the Pixify profile)
const userHighlights = handle(async (req) => {
    const owner = await S.findUserByHandle(req.params.id)
    if (!owner || S.blockedEitherWay(req.user, owner)) throw new S.SocialError('User not found', 404)
    const ctx = await S.viewerContext(req.user, 'pixify')
    if (!S.canViewPixifyProfile(owner, ctx)) return { highlights : [] }
    const list = await HighlightModel.find({ userId : owner._id }).sort({ createdAt : 1 }).lean()
    return { highlights : await serializeHighlights(owner, list, req.user) }
})

const cleanTitle = (title) => {
    const t = typeof title === 'string' ? title.trim().replace(/\s+/g, ' ') : ''
    if (!t) throw new S.SocialError('Give your highlight a name')
    if (t.length > MAX_TITLE) throw new S.SocialError(`Highlight names can be up to ${MAX_TITLE} characters`)
    return t
}

// a list of my own archived stories (order kept, duplicates removed)
const cleanItems = async (userId, items) => {
    if (!Array.isArray(items) || !items.length) throw new S.SocialError('Choose at least one story')
    const ids = [...new Set(items.map(String))]
    if (ids.length > MAX_ITEMS) throw new S.SocialError(`A highlight can have up to ${MAX_ITEMS} stories`)
    if (!ids.every((id) => isValidId(id))) throw new S.SocialError('Story not found', 404)
    const found = await StoryArchiveModel.countDocuments({ _id : { $in : ids }, userId })
    if (found !== ids.length) throw new S.SocialError('Story not found', 404)
    return ids.map(S.oid)
}

const myHighlight = async (req) => {
    if (!isValidId(String(req.params.id))) throw new S.SocialError('Highlight not found', 404)
    const h = await HighlightModel.findOne({ _id : req.params.id, userId : req.user._id }).lean()
    if (!h) throw new S.SocialError('Highlight not found', 404)
    return h
}

// POST /highlights  { title, items: [archive ids] }
const createHighlight = handle(async (req) => {
    const title = cleanTitle(req.body?.title)
    const items = await cleanItems(req.user._id, req.body?.items)
    if (await HighlightModel.countDocuments({ userId : req.user._id }) >= MAX_HIGHLIGHTS) throw new S.SocialError(`You can have up to ${MAX_HIGHLIGHTS} highlights`)
    const h = await HighlightModel.create({ userId : req.user._id, title, items })
    return { highlight : (await serializeHighlights(req.user, [h.toObject()], req.user))[0] }
})

// PATCH /highlights/:id  { title?, items? (the full new list, first = cover) }
const updateHighlight = handle(async (req) => {
    const h = await myHighlight(req)
    const set = {}
    if (req.body?.title !== undefined) set.title = cleanTitle(req.body.title)
    if (req.body?.items !== undefined) set.items = await cleanItems(req.user._id, req.body.items)
    if (!Object.keys(set).length) throw new S.SocialError('Nothing to change')
    const updated = await HighlightModel.findOneAndUpdate({ _id : h._id }, { $set : set }, { new : true }).lean()
    return { highlight : (await serializeHighlights(req.user, [updated], req.user))[0] }
})

// DELETE /highlights/:id
const deleteHighlight = handle(async (req) => {
    const h = await myHighlight(req)
    await HighlightModel.deleteOne({ _id : h._id })
    return {}
})

/* ---------- close friends ---------- */

const emitStories = (userId) => {
    try { require('../socket/index').io?.to(String(userId)).emit('status-changed', { apps : ['pixify'] }) } catch { /* socket server not ready */ }
}

// GET /close-friends?q=  my close friends + my followers I can add (with a flag)
const closeFriends = handle(async (req) => {
    const me = await UserModel.findById(req.user._id).select('pixify.closeFriends blocked').lean()
    const cf = (me.pixify?.closeFriends || []).map(String)
    const followers = await FollowModel.find({ following : req.user._id, status : 'active' }).sort({ createdAt : -1 }).limit(2000).select('follower').lean()
    const followerIdsList = followers.map((f) => String(f.follower))
    const users = await S.loadUsers([...cf, ...followerIdsList])
    const ok = (u) => u && !u.deletedAt && !S.blockedEitherWay(req.user, u)
    const q = String(req.query.q || '').trim().replace(/^@/, '')
    const re = q ? new RegExp(escapeRegex(q), 'i') : null
    const match = (u) => !re || re.test(u.username || '') || re.test(u.name || '')
    const set = new Set(cf)
    return {
        count : cf.filter((id) => ok(users[id])).length,
        max : MAX_CLOSE_FRIENDS,
        closeFriends : cf.slice().reverse().map((id) => users[id]).filter((u) => ok(u) && match(u)).map((u) => ({ ...S.personCard(u, req.user), closeFriend : true })),
        followers : followerIdsList.map((id) => users[id]).filter((u) => ok(u) && match(u)).slice(0, 300).map((u) => ({ ...S.personCard(u, req.user), closeFriend : set.has(String(u._id)) }))
    }
})

// POST /close-friends/:id  { add: true|false }
const setCloseFriend = handle(async (req) => {
    if (!isValidId(String(req.params.id)) || String(req.params.id) === String(req.user._id)) throw new S.SocialError('User not found', 404)
    const add = req.body?.add !== false
    const other = await UserModel.findById(req.params.id).select('blocked deletedAt').lean()
    const id = S.oid(req.params.id)
    if (!add) {
        await UserModel.updateOne({ _id : req.user._id }, { $pull : { 'pixify.closeFriends' : id } })
        emitStories(id) // their stories bar drops my close-friends stories at once
        return { closeFriend : false }
    }
    if (!other || other.deletedAt || S.blockedEitherWay(req.user, other)) throw new S.SocialError('User not found', 404)
    if (!(await FollowModel.exists({ follower : id, following : req.user._id, status : 'active' }))) throw new S.SocialError('Only people who follow you can be added to Close friends')
    const me = await UserModel.findById(req.user._id).select('pixify.closeFriends').lean()
    const cf = (me.pixify?.closeFriends || []).map(String)
    if (!cf.includes(String(id)) && cf.length >= MAX_CLOSE_FRIENDS) throw new S.SocialError(`Close friends can have up to ${MAX_CLOSE_FRIENDS} people`)
    await UserModel.updateOne({ _id : req.user._id }, { $addToSet : { 'pixify.closeFriends' : id } })
    emitStories(id)
    return { closeFriend : true }
})

// account deletion: my archive and highlights go, and I leave everyone's Close friends
const deleteHighlightsFor = async (userId) => {
    await Promise.all([
        StoryArchiveModel.deleteMany({ userId }),
        HighlightModel.deleteMany({ userId }),
        UserModel.updateMany({ 'pixify.closeFriends' : userId }, { $pull : { 'pixify.closeFriends' : userId } })
    ])
}

module.exports = {
    MAX_HIGHLIGHTS, MAX_ITEMS, MAX_CLOSE_FRIENDS, isCloseFriendOf,
    archiveStory, unarchiveStory, deleteHighlightsFor,
    archive, deleteArchived, userHighlights, createHighlight, updateHighlight, deleteHighlight, closeFriends, setCloseFriend
}
