const UserModel = require('../models/user.model')
const { PostModel, CommentModel, NotificationModel, REACTIONS } = require('../models/social.model')
const { isAllowedMediaUrl, isValidId } = require('../helpers/chat')
const S = require('../helpers/social')

const PAGE = 12

// wraps a handler: req.user is set by requireAuth; SocialError -> its status, anything else -> 500
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

const appOf = (v) => {
    if (!S.SOCIAL_APPS.includes(v)) throw new S.SocialError('Invalid app')
    return v
}
const beforeFilter = (before) => (before && !Number.isNaN(Date.parse(before)) ? { createdAt : { $lt : new Date(before) } } : {})
const page = (posts) => ({ posts, next : posts.length ? posts[posts.length - 1].createdAt : null })

/* ---------- create / edit / delete ---------- */

const cleanMedia = (media) => {
    if (media === undefined) return []
    if (!Array.isArray(media) || media.length > 10) throw new S.SocialError('Add up to 10 photos or videos')
    return media.map((m) => {
        if (!m || !['image', 'video'].includes(m.kind) || !m.url || !isAllowedMediaUrl(m.url)) throw new S.SocialError('Invalid photo or video')
        const out = { url : m.url, kind : m.kind }
        if (Number.isFinite(m.width) && Number.isFinite(m.height) && m.width > 0 && m.height > 0) { out.width = Math.round(m.width); out.height = Math.round(m.height) }
        return out
    })
}

const buildPost = (app, body, me) => {
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    const media = cleanMedia(body.media)
    const doc = { app, author : me._id, text, media }
    if (app === 'pixify') {
        if (!media.length) throw new S.SocialError('Add a photo or video')
        if (text.length > 2200) throw new S.SocialError('Captions can have up to 2,200 characters')
        doc.isReel = media.length === 1 && media[0].kind === 'video'
        doc.commentsOff = !!body.commentsOff
    } else {
        if (!text && !media.length && !body.sharedPost) throw new S.SocialError("Write something or add a photo")
        if (text.length > 5000) throw new S.SocialError('Posts can have up to 5,000 characters')
        doc.audience = ['public', 'friends', 'only_me'].includes(body.audience) ? body.audience : 'friends'
        if (body.background && !media.length && text.length <= 130 && S.POST_BACKGROUNDS.includes(body.background)) doc.background = body.background
    }
    return doc
}

// POST /api/social/posts  { app, text, media[], audience?, background?, sharedPost?, crossPost?: ['connectify'|'pixify'] }
const createPost = handle(async (req) => {
    const app = appOf(req.body.app)
    const me = req.user
    const doc = buildPost(app, req.body, me)

    // Connectify share of another post
    let shared = null
    if (req.body.sharedPost) {
        if (app !== 'connectify') throw new S.SocialError('Only Connectify posts can be shared')
        const ctx = await S.viewerContext(me, 'connectify')
        shared = (await S.loadVisiblePost(req.body.sharedPost, ctx)).post
        if (shared.app !== 'connectify') throw new S.SocialError('This post can\'t be shared')
        if (shared.audience !== 'public' && String(shared.author) !== String(me._id)) throw new S.SocialError('Only public posts can be shared')
        // sharing a share shares the original
        if (shared.sharedPost) shared = await PostModel.findById(shared.sharedPost).lean() || shared
        doc.sharedPost = shared._id
    }

    const post = await PostModel.create(doc)
    const created = [post]

    // "Also share to Connectify / Pixify": the same photos and caption as a post in the other app
    const cross = Array.isArray(req.body.crossPost) ? req.body.crossPost.filter((a) => S.SOCIAL_APPS.includes(a) && a !== app) : []
    for (const other of cross) {
        if (other === 'pixify' && !doc.media.length) continue
        created.push(await PostModel.create(buildPost(other, { text : doc.text, media : doc.media, audience : 'friends' }, me)))
    }

    if (shared) {
        await PostModel.updateOne({ _id : shared._id }, { $inc : { shareCount : 1 } })
        await S.notify({ user : shared.author, actor : me._id, app, type : 'share', post : shared._id })
    }
    for (const p of created) await S.notifyMentions({ text : p.text, actor : me._id, app : p.app, post : p.toObject() })

    const ctx = await S.viewerContext(me, app)
    const [out] = await S.serializePosts([post.toObject()], ctx)
    return { post : out, crossPosted : created.slice(1).map((p) => ({ app : p.app, _id : String(p._id) })) }
})

// PATCH /api/social/posts/:id  { text?, audience?, commentsOff? }
const editPost = handle(async (req) => {
    if (!isValidId(String(req.params.id))) throw new S.SocialError('Post not found', 404)
    const post = await PostModel.findOne({ _id : req.params.id, author : req.user._id })
    if (!post) throw new S.SocialError('Post not found', 404)
    if (req.body.text !== undefined) {
        const text = typeof req.body.text === 'string' ? req.body.text.trim() : ''
        const max = post.app === 'pixify' ? 2200 : 5000
        if (text.length > max) throw new S.SocialError('That\'s too long')
        if (post.app === 'connectify' && !text && !post.media.length && !post.sharedPost) throw new S.SocialError('Write something')
        if (text !== post.text) { post.text = text; post.editedAt = new Date() }
    }
    if (req.body.audience !== undefined && post.app === 'connectify') {
        if (!['public', 'friends', 'only_me'].includes(req.body.audience)) throw new S.SocialError('Invalid audience')
        post.audience = req.body.audience
    }
    if (req.body.commentsOff !== undefined) post.commentsOff = !!req.body.commentsOff
    await post.save()
    const ctx = await S.viewerContext(req.user, post.app)
    const [out] = await S.serializePosts([post.toObject()], ctx)
    return { post : out }
})

const deletePost = handle(async (req) => {
    if (!isValidId(String(req.params.id))) throw new S.SocialError('Post not found', 404)
    const post = await PostModel.findOneAndDelete({ _id : req.params.id, author : req.user._id }).lean()
    if (!post) throw new S.SocialError('Post not found', 404)
    await Promise.all([
        CommentModel.deleteMany({ post : post._id }),
        NotificationModel.deleteMany({ post : post._id }),
        post.sharedPost ? PostModel.updateOne({ _id : post.sharedPost, shareCount : { $gt : 0 } }, { $inc : { shareCount : -1 } }) : null
    ])
    return {}
})

/* ---------- reading ---------- */

const getPost = handle(async (req) => {
    if (!isValidId(String(req.params.id))) throw new S.SocialError('Post not found', 404)
    const raw = await PostModel.findById(req.params.id).lean()
    if (!raw) throw new S.SocialError('This post is no longer available', 404)
    const ctx = await S.viewerContext(req.user, raw.app)
    const [post] = await S.serializePosts([raw], ctx)
    if (!post) throw new S.SocialError('This post is no longer available', 404)
    return { post }
})

// home feed: people I follow (Pixify) / my friends (Connectify), plus my own posts
const feed = handle(async (req) => {
    const app = appOf(req.query.app)
    const ctx = await S.viewerContext(req.user, app)
    const people = [...(app === 'pixify' ? ctx.following : ctx.friends), ctx.me].map(S.oid)
    const raw = await PostModel.find({ app, author : { $in : people }, ...beforeFilter(req.query.before) }).sort({ createdAt : -1 }).limit(PAGE).lean()
    // keep paging past posts the viewer can't see (e.g. "only me" posts of friends)
    const posts = await S.serializePosts(raw, ctx)
    return { posts, next : raw.length === PAGE ? raw[raw.length - 1].createdAt : null }
})

// Pixify Explore: recent posts from public accounts; Reels: videos
const explore = handle(async (req) => {
    const ctx = await S.viewerContext(req.user, 'pixify')
    const reels = req.query.reels === '1'
    const publicIds = (await UserModel.find({ 'pixify.private' : { $ne : true }, deletedAt : { $exists : false } }).select('_id').limit(5000).lean()).map((u) => u._id)
    const authors = reels ? [...publicIds, ...[...ctx.following].map(S.oid), S.oid(ctx.me)] : publicIds.filter((id) => String(id) !== ctx.me)
    const raw = await PostModel.find({ app : 'pixify', author : { $in : authors }, ...(reels ? { isReel : true } : {}), ...beforeFilter(req.query.before) })
        .sort({ createdAt : -1 }).limit(reels ? 8 : 24).lean()
    const posts = await S.serializePosts(raw, ctx)
    return { posts, next : raw.length ? raw[raw.length - 1].createdAt : null }
})

// GET /api/social/users/:id/posts?app=
const userPosts = handle(async (req) => {
    const app = appOf(req.query.app)
    const author = await S.findUserByHandle(req.params.id)
    if (!author) throw new S.SocialError('User not found', 404)
    const ctx = await S.viewerContext(req.user, app)
    if (S.blockedEitherWay(req.user, author)) throw new S.SocialError('User not found', 404)
    if (app === 'pixify' && !S.canViewPixifyProfile(author, ctx)) return { posts : [], next : null, private : true }
    const raw = await PostModel.find({ app, author : author._id, ...beforeFilter(req.query.before) }).sort({ createdAt : -1 }).limit(PAGE).lean()
    const posts = await S.serializePosts(raw, ctx)
    return { posts, next : raw.length === PAGE ? raw[raw.length - 1].createdAt : null }
})

// my saved (bookmarked) Pixify posts, newest saved first
const savedPosts = handle(async (req) => {
    const ids = [...(req.user.savedPosts || [])].reverse().slice(0, 60)
    const raw = await PostModel.find({ _id : { $in : ids } }).lean()
    const order = Object.fromEntries(ids.map((id, i) => [String(id), i]))
    raw.sort((a, b) => order[String(a._id)] - order[String(b._id)])
    const ctx = await S.viewerContext(req.user, 'pixify')
    return { posts : await S.serializePosts(raw, ctx), next : null }
})

/* ---------- reactions, saves ---------- */

// POST /api/social/posts/:id/react  { type: 'like' | 'love' | ... | null }
const react = handle(async (req) => {
    const type = req.body.type === null || req.body.type === undefined ? null : req.body.type
    if (type !== null && !REACTIONS.includes(type)) throw new S.SocialError('Invalid reaction')
    const raw = await PostModel.findById(isValidId(String(req.params.id)) ? req.params.id : null).lean()
    if (!raw) throw new S.SocialError('This post is no longer available', 404)
    const ctx = await S.viewerContext(req.user, raw.app)
    const { post } = await S.loadVisiblePost(req.params.id, ctx)
    if (post.app === 'pixify' && type && type !== 'like') throw new S.SocialError('Invalid reaction')
    const me = req.user._id
    await PostModel.updateOne({ _id : post._id }, { $pull : { reactions : { userId : me } } })
    if (type) await PostModel.updateOne({ _id : post._id }, { $push : { reactions : { userId : me, type, at : new Date() } } })
    const nType = post.app === 'pixify' ? 'like' : 'react'
    if (type) await S.notify({ user : post.author, actor : me, app : post.app, type : nType, post : post._id, reaction : type })
    else await S.unnotify({ user : post.author, actor : me, app : post.app, type : nType, post : post._id })
    const fresh = await PostModel.findById(post._id).select('reactions').lean()
    return S.reactionSummary(fresh, me)
})

// people who reacted (with their reaction), newest first
const reactions = handle(async (req) => {
    const raw = await PostModel.findById(isValidId(String(req.params.id)) ? req.params.id : null).select('app').lean()
    if (!raw) throw new S.SocialError('This post is no longer available', 404)
    const ctx = await S.viewerContext(req.user, raw.app)
    const { post } = await S.loadVisiblePost(req.params.id, ctx)
    const list = [...(post.reactions || [])].reverse().slice(0, 200)
    const users = await S.loadUsers(list.map((r) => r.userId))
    return {
        people : list.filter((r) => users[String(r.userId)] && !users[String(r.userId)].deletedAt && !S.blockedEitherWay(req.user, users[String(r.userId)]))
            .map((r) => ({ ...S.personCard(users[String(r.userId)], req.user), reaction : r.type }))
    }
})

const savePost = handle(async (req) => {
    const ctx = await S.viewerContext(req.user, 'pixify')
    const { post } = await S.loadVisiblePost(req.params.id, ctx)
    if (post.app !== 'pixify') throw new S.SocialError('Only Pixify posts can be saved')
    const save = req.body.save !== false
    await UserModel.updateOne({ _id : req.user._id }, { $pull : { savedPosts : post._id } })
    if (save) await UserModel.updateOne({ _id : req.user._id }, { $push : { savedPosts : { $each : [post._id], $slice : -500 } } })
    return { saved : save }
})

/* ---------- comments ---------- */

const serializeComments = (list, users, viewer, post) => list
    .filter((c) => users[String(c.author)] && !S.blockedEitherWay(viewer, users[String(c.author)]))
    .map((c) => ({
        _id : String(c._id),
        author : S.personCard(users[String(c.author)], viewer),
        text : c.text,
        parent : c.parent ? String(c.parent) : null,
        createdAt : c.createdAt,
        likeCount : (c.likes || []).length,
        liked : (c.likes || []).some((id) => String(id) === String(viewer._id)),
        canDelete : String(c.author) === String(viewer._id) || String(post.author) === String(viewer._id),
        byAuthor : String(c.author) === String(post.author)
    }))

const listComments = handle(async (req) => {
    const raw = await PostModel.findById(isValidId(String(req.params.id)) ? req.params.id : null).select('app').lean()
    if (!raw) throw new S.SocialError('This post is no longer available', 404)
    const ctx = await S.viewerContext(req.user, raw.app)
    const { post } = await S.loadVisiblePost(req.params.id, ctx)
    const list = await CommentModel.find({ post : post._id }).sort({ createdAt : 1 }).limit(500).lean()
    const users = await S.loadUsers(list.map((c) => c.author))
    return { comments : serializeComments(list, users, req.user, post) }
})

// POST /api/social/posts/:id/comments  { text, parent? }
const addComment = handle(async (req) => {
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : ''
    if (!text) throw new S.SocialError('Write a comment')
    if (text.length > 2200) throw new S.SocialError('Comments can have up to 2,200 characters')
    const raw = await PostModel.findById(isValidId(String(req.params.id)) ? req.params.id : null).select('app').lean()
    if (!raw) throw new S.SocialError('This post is no longer available', 404)
    const ctx = await S.viewerContext(req.user, raw.app)
    const { post } = await S.loadVisiblePost(req.params.id, ctx)
    if (post.commentsOff && String(post.author) !== ctx.me) throw new S.SocialError('Commenting is turned off for this post')
    let parent = null
    if (req.body.parent) {
        parent = isValidId(String(req.body.parent)) ? await CommentModel.findOne({ _id : req.body.parent, post : post._id }).lean() : null
        if (!parent) throw new S.SocialError('That comment was deleted')
        if (parent.parent) parent = await CommentModel.findById(parent.parent).lean() || parent // replies stay one level deep
    }
    const comment = await CommentModel.create({ post : post._id, author : req.user._id, text, ...(parent ? { parent : parent._id } : {}) })
    await PostModel.updateOne({ _id : post._id }, { $inc : { commentCount : 1 } })
    await S.notify({ user : post.author, actor : req.user._id, app : post.app, type : 'comment', post : post._id, comment : comment._id, text })
    if (parent && String(parent.author) !== String(post.author)) await S.notify({ user : parent.author, actor : req.user._id, app : post.app, type : 'reply', post : post._id, comment : comment._id, text })
    await S.notifyMentions({ text, actor : req.user._id, app : post.app, post, comment : comment._id })
    const users = await S.loadUsers([req.user._id])
    return { comment : serializeComments([comment.toObject()], users, req.user, post)[0] }
})

const deleteComment = handle(async (req) => {
    if (!isValidId(String(req.params.id))) throw new S.SocialError('Comment not found', 404)
    const c = await CommentModel.findById(req.params.id).lean()
    if (!c) throw new S.SocialError('Comment not found', 404)
    const post = await PostModel.findById(c.post).select('author').lean()
    if (String(c.author) !== String(req.user._id) && String(post?.author) !== String(req.user._id)) throw new S.SocialError("You can't delete this comment", 403)
    const ids = [c._id, ...(await CommentModel.find({ parent : c._id }).select('_id').lean()).map((r) => r._id)]
    await CommentModel.deleteMany({ _id : { $in : ids } })
    await NotificationModel.deleteMany({ comment : { $in : ids } })
    if (post) await PostModel.updateOne({ _id : post._id }, { $inc : { commentCount : -ids.length } })
    return { removed : ids.map(String) }
})

const likeComment = handle(async (req) => {
    if (!isValidId(String(req.params.id))) throw new S.SocialError('Comment not found', 404)
    const c = await CommentModel.findById(req.params.id).lean()
    if (!c) throw new S.SocialError('Comment not found', 404)
    const raw = await PostModel.findById(c.post).select('app').lean()
    if (!raw) throw new S.SocialError('Comment not found', 404)
    const ctx = await S.viewerContext(req.user, raw.app)
    await S.loadVisiblePost(c.post, ctx)
    const like = req.body.like !== false
    await CommentModel.updateOne({ _id : c._id }, like ? { $addToSet : { likes : req.user._id } } : { $pull : { likes : req.user._id } })
    if (like) await S.notify({ user : c.author, actor : req.user._id, app : raw.app, type : 'comment_like', post : c.post, comment : c._id, text : c.text })
    else await S.unnotify({ user : c.author, actor : req.user._id, app : raw.app, type : 'comment_like', comment : c._id })
    const fresh = await CommentModel.findById(c._id).select('likes').lean()
    return { liked : like, likeCount : (fresh?.likes || []).length }
})

module.exports = { handle, appOf, createPost, editPost, deletePost, getPost, feed, explore, userPosts, savedPosts, react, reactions, savePost, listComments, addComment, deleteComment, likeComment }
