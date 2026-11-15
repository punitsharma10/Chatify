const UserModel = require('../models/user.model')
const { PostModel, NotificationModel } = require('../models/social.model')
const { DmMessageModel } = require('../models/dm.model')
const { isValidId, escapeRegex } = require('../helpers/chat')
const S = require('../helpers/social')

// Instagram / Facebook features added on top of posts: collab posts, insights, polls, scheduled posts,
// places and hidden words. Same response shape as posts.controller ({ success, ... } or { message, error }).

const handle = (fn) => async (req, res) => {
    try {
        const out = await fn(req, res)
        if (!res.headersSent) res.json({ success : true, ...(out || {}) })
    } catch (error) {
        if (error instanceof S.SocialError) return res.status(error.status).json({ message : error.message, error : true })
        console.error('[social]', error)
        return res.status(500).json({ message : 'Something went wrong. Please try again.', error : true })
    }
}

const PAGE = 24
const appOf = (v) => {
    if (!S.SOCIAL_APPS.includes(v)) throw new S.SocialError('Invalid app')
    return v
}
const findPost = async (id) => {
    if (!isValidId(String(id))) throw new S.SocialError('Post not found', 404)
    const post = await PostModel.findById(id).lean()
    if (!post) throw new S.SocialError('This post is no longer available', 404)
    return post
}
const serializeOne = async (req, post, extra = {}) => {
    const ctx = Object.assign(await S.viewerContext(req.user, post.app), extra)
    return (await S.serializePosts([post], ctx))[0]
}

/* ---------- Pixify collab posts ---------- */

// POST /posts/:id/collab { accept }  (the invited person) — or { leave: true } to remove yourself later
const answerCollab = handle(async (req) => {
    const post = await findPost(req.params.id)
    const me = req.user._id
    const mine = (post.collaborators || []).find((c) => String(c.userId) === String(me))
    if (!mine) throw new S.SocialError('This invite is no longer available', 404)
    if (req.body.accept && !req.body.leave) {
        await PostModel.updateOne({ _id : post._id, 'collaborators.userId' : me }, { $set : { 'collaborators.$.status' : 'accepted' } })
        await NotificationModel.deleteMany({ user : me, post : post._id, type : 'collab_invite' })
        await S.notify({ user : post.author, actor : me, app : post.app, type : 'collab_accept', post : post._id })
    } else {
        await PostModel.updateOne({ _id : post._id }, { $pull : { collaborators : { userId : me } } })
        await NotificationModel.deleteMany({ user : me, post : post._id, type : 'collab_invite' })
    }
    const fresh = await PostModel.findById(post._id).lean()
    return { post : await serializeOne(req, fresh) }
})

/* ---------- insights (the author only) ---------- */

// GET /posts/:id/insights -> likes, comments, saves, shares, plays, reach (people who interacted)
const insights = handle(async (req) => {
    const post = await findPost(req.params.id)
    if (String(post.author) !== String(req.user._id)) throw new S.SocialError('Only the author can see insights', 403)
    const savedField = post.app === 'pixify' ? 'savedPosts' : 'connectify.saved'
    const [saves, dmShares] = await Promise.all([
        UserModel.countDocuments({ [savedField] : post._id }),
        DmMessageModel.countDocuments({ 'post' : post._id }).catch(() => 0)
    ])
    const { CommentModel } = require('../models/social.model')
    const commenters = await CommentModel.distinct('author', { post : post._id })
    const reach = new Set([...(post.reactions || []).map((r) => String(r.userId)), ...commenters.map(String)])
    reach.delete(String(post.author))
    const counts = {}
    for (const r of post.reactions || []) counts[r.type] = (counts[r.type] || 0) + 1
    return {
        insights : {
            likes : (post.reactions || []).length,
            reactions : counts,
            comments : post.commentCount || 0,
            saves,
            shares : (post.shareCount || 0) + dmShares,
            plays : post.isReel ? post.views || 0 : undefined,
            accountsReached : reach.size,
            createdAt : post.createdAt
        }
    }
})

/* ---------- Connectify polls ---------- */

// POST /posts/:id/poll { options: [index...] }  (empty = take my vote back)
const votePoll = handle(async (req) => {
    const raw = await findPost(req.params.id)
    const ctx = await S.viewerContext(req.user, raw.app)
    const { post } = await S.loadVisiblePost(req.params.id, ctx)
    if (!post.poll?.options?.length) throw new S.SocialError('This post has no poll')
    const picks = [...new Set((Array.isArray(req.body.options) ? req.body.options : []).map(Number))]
    if (!picks.every((i) => Number.isInteger(i) && i >= 0 && i < post.poll.options.length)) throw new S.SocialError('Invalid option')
    if (!post.poll.multiple && picks.length > 1) throw new S.SocialError('Choose one option')
    const me = req.user._id
    const pull = Object.fromEntries(post.poll.options.map((_, i) => [`poll.options.${i}.votes`, me]))
    await PostModel.updateOne({ _id : post._id }, { $pull : pull })
    if (picks.length) await PostModel.updateOne({ _id : post._id }, { $addToSet : Object.fromEntries(picks.map((i) => [`poll.options.${i}.votes`, me])) })
    const fresh = await PostModel.findById(post._id).lean()
    return { post : await serializeOne(req, fresh) }
})

// GET /posts/:id/poll/voters -> who chose what (like Facebook's "See votes")
const pollVoters = handle(async (req) => {
    const raw = await findPost(req.params.id)
    const ctx = await S.viewerContext(req.user, raw.app)
    const { post } = await S.loadVisiblePost(req.params.id, ctx)
    if (!post.poll?.options?.length) throw new S.SocialError('This post has no poll')
    const users = await S.loadUsers(post.poll.options.flatMap((o) => o.votes || []))
    return {
        options : post.poll.options.map((o) => ({
            text : o.text,
            people : (o.votes || []).map((id) => users[String(id)]).filter((u) => u && !u.deletedAt && !S.blockedEitherWay(req.user, u)).map((u) => S.personCard(u, req.user))
        }))
    }
})

/* ---------- scheduled posts ---------- */

// GET /scheduled?app= -> my posts waiting to be published
const scheduledList = handle(async (req) => {
    const app = appOf(req.query.app)
    const raw = await PostModel.find({ app, author : req.user._id, scheduledFor : { $exists : true } }).sort({ scheduledFor : 1 }).limit(100).lean()
    const ctx = Object.assign(await S.viewerContext(req.user, app), { includeScheduled : true })
    return { posts : await S.serializePosts(raw, ctx) }
})

// POST /posts/:id/publish { at? }  -> publish now (no `at`) or move the time
const reschedule = handle(async (req) => {
    const post = await findPost(req.params.id)
    if (String(post.author) !== String(req.user._id) || !post.scheduledFor) throw new S.SocialError('Post not found', 404)
    if (req.body.at) {
        const d = new Date(req.body.at)
        if (Number.isNaN(d.getTime()) || d.getTime() < Date.now() + 4 * 60 * 1000) throw new S.SocialError('Schedule at least 5 minutes from now')
        if (d.getTime() > Date.now() + 75 * 24 * 3600 * 1000) throw new S.SocialError('You can schedule up to 75 days ahead')
        await PostModel.updateOne({ _id : post._id }, { $set : { scheduledFor : d } })
        return { scheduledFor : d }
    }
    await publish(post)
    return { published : true }
})

// publish a scheduled post: it appears now, at the top of feeds, and tells tagged / mentioned people
const publish = async (post) => {
    const now = new Date()
    const res = await PostModel.collection.updateOne({ _id : post._id, scheduledFor : { $exists : true } }, { $set : { createdAt : now, updatedAt : now }, $unset : { scheduledFor : '' } })
    if (!res.modifiedCount) return false
    const fresh = await PostModel.findById(post._id).lean()
    for (const id of fresh.tagged || []) await S.notify({ user : id, actor : fresh.author, app : fresh.app, type : 'tag', post : fresh._id })
    for (const c of fresh.collaborators || []) await S.notify({ user : c.userId, actor : fresh.author, app : fresh.app, type : 'collab_invite', post : fresh._id })
    await S.notifyMentions({ text : fresh.text, actor : fresh.author, app : fresh.app, post : fresh })
    S.emitTo(fresh.author, 'social-notification', { app : fresh.app, type : 'post_published', post : String(fresh._id) })
    return true
}

// called by the background scheduler
const publishDue = async () => {
    const due = await PostModel.find({ scheduledFor : { $lte : new Date() } }).limit(50).lean()
    for (const p of due) await publish(p).catch((e) => console.error('[publish]', e.message))
}

/* ---------- Pixify places ---------- */

// GET /places/:name?app=pixify -> posts tagged with this location (newest first)
const place = handle(async (req) => {
    const app = req.query.app === 'connectify' ? 'connectify' : 'pixify'
    const name = String(req.params.name || '').trim().slice(0, 100)
    if (!name) throw new S.SocialError('Invalid place')
    const filter = { app, archived : { $ne : true }, scheduledFor : { $exists : false }, location : { $regex : `^${escapeRegex(name)}$`, $options : 'i' } }
    const before = req.query.before && !Number.isNaN(Date.parse(req.query.before)) ? { createdAt : { $lt : new Date(req.query.before) } } : {}
    const ctx = await S.viewerContext(req.user, app)
    const [raw, count] = await Promise.all([
        PostModel.find({ ...filter, ...before }).sort({ createdAt : -1 }).limit(PAGE).lean(),
        req.query.before ? null : S.countVisible(filter, ctx)
    ])
    return { place : name, ...(count !== null ? { count } : {}), posts : await S.serializePosts(raw, ctx), next : raw.length === PAGE ? raw[raw.length - 1].createdAt : null }
})

/* ---------- Pixify hidden words ---------- */

const hiddenWords = handle(async (req) => {
    if (req.method === 'GET') return { words : req.user.pixify?.hiddenWords || [] }
    const list = Array.isArray(req.body.words) ? req.body.words : []
    const words = [...new Set(list.map((w) => (typeof w === 'string' ? w.trim().toLowerCase() : '')).filter(Boolean))]
    if (words.length > 100) throw new S.SocialError('You can hide up to 100 words')
    if (words.some((w) => w.length > 30)) throw new S.SocialError('Words can have up to 30 characters')
    await UserModel.updateOne({ _id : req.user._id }, { $set : { 'pixify.hiddenWords' : words } })
    return { words }
})

module.exports = { answerCollab, insights, votePoll, pollVoters, scheduledList, reschedule, publishDue, place, hiddenWords }
