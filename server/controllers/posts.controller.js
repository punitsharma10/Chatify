const UserModel = require('../models/user.model')
const { PostModel, CommentModel, NotificationModel, SocialReportModel, REACTIONS } = require('../models/social.model')
const { CxGroupModel } = require('../models/cxGroup.model')
const { isAllowedMediaUrl, isValidId, escapeRegex } = require('../helpers/chat')
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

const cleanString = (v, max, label) => {
    if (v === undefined || v === null) return ''
    if (typeof v !== 'string' || v.trim().length > max) throw new S.SocialError(`${label} is too long`)
    return v.trim()
}

// tagged people: up to 20 existing accounts that haven't blocked each other with me
const cleanTagged = async (ids, me) => {
    if (ids === undefined) return undefined
    if (!Array.isArray(ids) || ids.length > 20) throw new S.SocialError('Tag up to 20 people')
    const unique = [...new Set(ids.map(String))].filter((id) => id !== String(me._id))
    if (unique.some((id) => !isValidId(id))) throw new S.SocialError('Invalid people')
    const users = await UserModel.find({ _id : { $in : unique }, deletedAt : { $exists : false } }).select('blocked').lean()
    return users.filter((u) => !S.blockedEitherWay(me, u)).map((u) => u._id)
}

const buildPost = (app, body, me) => {
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    const media = cleanMedia(body.media)
    const doc = { app, author : me._id, text, media, location : cleanString(body.location, 100, 'Location') }
    if (app === 'pixify') doc.hideLikes = !!body.hideLikes
    if (app === 'connectify') doc.feeling = cleanString(body.feeling, 60, 'Feeling')
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

    const tagged = await cleanTagged(req.body.tagged, me)
    if (tagged?.length) doc.tagged = tagged

    // Connectify: posting in a group (members only)
    let group = null
    if (req.body.group) {
        if (app !== 'connectify') throw new S.SocialError('Only Connectify posts can go in groups')
        group = isValidId(String(req.body.group)) ? await CxGroupModel.findById(req.body.group).lean() : null
        if (!group || !group.members.some((m) => String(m.userId) === String(me._id))) throw new S.SocialError('Join the group to post in it', 403)
        doc.group = group._id
        doc.audience = 'public'
    }

    const post = await PostModel.create(doc)
    const created = [post]
    if (group) await CxGroupModel.updateOne({ _id : group._id }, { $set : { lastPostAt : new Date() } })
    for (const id of tagged || []) await S.notify({ user : id, actor : me._id, app, type : 'tag', post : post._id })

    // "Also share to Connectify / Pixify": the same photos and caption as a post in the other app
    const cross = Array.isArray(req.body.crossPost) && !group ? req.body.crossPost.filter((a) => S.SOCIAL_APPS.includes(a) && a !== app) : []
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
    if (req.body.hideLikes !== undefined && post.app === 'pixify') post.hideLikes = !!req.body.hideLikes
    if (req.body.location !== undefined) post.location = cleanString(req.body.location, 100, 'Location')
    if (req.body.feeling !== undefined && post.app === 'connectify') post.feeling = cleanString(req.body.feeling, 60, 'Feeling')
    if (req.body.tagged !== undefined) {
        const before = new Set((post.tagged || []).map(String))
        post.tagged = await cleanTagged(req.body.tagged, req.user)
        for (const id of post.tagged) if (!before.has(String(id))) await S.notify({ user : id, actor : req.user._id, app : post.app, type : 'tag', post : post._id })
    }
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
    const v = req.user
    let ids = [...(app === 'pixify' ? ctx.following : ctx.friends)]
    const filter = { app, archived : { $ne : true }, ...beforeFilter(req.query.before) }
    if (app === 'pixify') {
        const muted = new Set((v.pixify?.muted || []).map(String))
        ids = ids.filter((id) => !muted.has(id))
        // Instagram's "Favorites" feed
        if (req.query.filter === 'favorites') ids = (v.pixify?.favorites || []).map(String).filter((id) => ctx.following.has(id))
        else ids.push(ctx.me)
        filter.author = { $in : ids.map(S.oid) }
    } else {
        const now = Date.now()
        const off = new Set([...(v.connectify?.unfollowed || []).map(String), ...(v.connectify?.snoozed || []).filter((s) => new Date(s.until) > now).map((s) => String(s.userId))])
        ids = [...ids.filter((id) => !off.has(id)), ctx.me]
        const hidden = v.connectify?.hiddenPosts || []
        // friends' posts (outside groups) + posts in my groups
        filter.$or = [{ author : { $in : ids.map(S.oid) }, group : { $exists : false } }, { group : { $in : [...ctx.groups].map(S.oid) } }]
        if (hidden.length) filter._id = { $nin : hidden }
    }
    const raw = await PostModel.find(filter).sort({ createdAt : -1 }).limit(PAGE).lean()
    // keep paging past posts the viewer can't see (e.g. "only me" posts of friends)
    const posts = await S.serializePosts(raw, ctx)
    return { posts, next : raw.length === PAGE ? raw[raw.length - 1].createdAt : null }
})

// Pixify Explore (photos + reels) and Reels (videos), Instagram-style: posts from everyone with a public account
// (plus people you follow), ranked by likes, comments and plays with newer posts first, and endless: when everyone's
// posts have been shown, YouTube Shorts continue (only if YOUTUBE_API_KEY is set).
// Paging cursor (?before=): "p:N" = page N of our posts, "x:K" = page K of YouTube Shorts.
const youtube = require('../helpers/youtube')

// each YouTube Short is kept as a post (once) so it can be liked, commented on, saved and shared like any reel
// (Pixify and Connectify keep their own copy: their likes / reactions and comments stay separate)
const mirrorShorts = async (shorts, ctx, app = 'pixify') => {
    if (!shorts.length) return []
    const keyOf = (s) => (app === 'connectify' ? `cx:${s._id}` : s._id)
    await PostModel.bulkWrite(shorts.map((s) => ({
        updateOne : {
            filter : { 'external.key' : keyOf(s) },
            update : {
                $setOnInsert : { app, isReel : app === 'pixify', audience : 'public', commentsOff : false, createdAt : new Date(s.createdAt || Date.now()) },
                $set : { text : String(s.text || '').slice(0, app === 'pixify' ? 2200 : 5000), media : s.media, external : { source : 'YouTube', key : keyOf(s), by : s.external.by, byUrl : s.external.byUrl, link : s.external.link } }
            },
            upsert : true
        }
    })), { ordered : false })
    const docs = await PostModel.find({ 'external.key' : { $in : shorts.map(keyOf) } }).lean()
    const byKey = Object.fromEntries(docs.map((d) => [d.external.key, d]))
    return S.serializePosts(shorts.map((s) => byKey[keyOf(s)]).filter(Boolean), ctx)
}
const explore = handle(async (req) => {
    const ctx = await S.viewerContext(req.user, 'pixify')
    const reels = req.query.reels === '1'
    const per = reels ? 8 : 24
    const cursor = String(req.query.before || 'p:0')

    if (cursor.startsWith('x:')) {
        const k = Math.max(1, parseInt(cursor.slice(2), 10) || 1)
        try {
            const shorts = reels ? await youtube.reels(k, per) : await youtube.explore(k, per)
            const posts = await mirrorShorts(shorts, ctx)
            return { posts, next : shorts.length && k < 500 ? `x:${k + 1}` : null }
        } catch (error) {
            console.error('[youtube]', error.message)
            return { posts : [], next : null }
        }
    }

    const page = Math.max(0, parseInt(cursor.slice(2), 10) || 0)
    const publicIds = (await UserModel.find({ 'pixify.private' : { $ne : true }, deletedAt : { $exists : false } }).select('_id').limit(20000).lean()).map((u) => u._id)
    const muted = new Set((req.user.pixify?.muted || []).map(String))
    const authors = [...publicIds, ...[...ctx.following].map(S.oid)].filter((id) => String(id) !== ctx.me && !muted.has(String(id)))
    const skip = req.user.pixify?.notInterested || []
    const now = new Date()
    const raw = await PostModel.aggregate([
        { $match : { app : 'pixify', author : { $in : authors }, archived : { $ne : true }, ...(skip.length ? { _id : { $nin : skip } } : {}), ...(reels ? { isReel : true } : {}) } },
        { $addFields : {
            _score : { $divide : [
                { $add : [{ $size : { $ifNull : ['$reactions', []] } }, { $multiply : [2, { $ifNull : ['$commentCount', 0] }] }, { $multiply : [0.05, { $ifNull : ['$views', 0] }] }, 1] },
                { $pow : [{ $add : [{ $divide : [{ $subtract : [now, '$createdAt'] }, 3600000] }, 2] }, 1.2] }
            ] }
        } },
        { $sort : { _score : -1, _id : -1 } },
        { $skip : page * per },
        { $limit : per },
        { $project : { _score : 0 } }
    ])
    const posts = await S.serializePosts(raw, ctx)
    const next = raw.length === per ? `p:${page + 1}` : youtube.enabled() ? 'x:1' : null
    return { posts, next,  }
})

// GET /api/social/users/:id/posts?app=
const userPosts = handle(async (req) => {
    const app = appOf(req.query.app)
    const author = await S.findUserByHandle(req.params.id)
    if (!author) throw new S.SocialError('User not found', 404)
    const ctx = await S.viewerContext(req.user, app)
    if (S.blockedEitherWay(req.user, author)) throw new S.SocialError('User not found', 404)
    if (app === 'pixify' && !S.canViewPixifyProfile(author, ctx)) return { posts : [], next : null, private : true }
    // ?tab=tagged: posts other people tagged them in
    if (req.query.tab === 'tagged') {
        const raw = await PostModel.find({ app, tagged : author._id, archived : { $ne : true }, ...beforeFilter(req.query.before) }).sort({ createdAt : -1 }).limit(PAGE).lean()
        return { posts : await S.serializePosts(raw, ctx), next : raw.length === PAGE ? raw[raw.length - 1].createdAt : null }
    }
    const base = { app, author : author._id, archived : { $ne : true }, group : { $exists : false } }
    // pinned posts come first (on the first page)
    const pinned = req.query.before ? [] : await PostModel.find({ ...base, pinnedAt : { $exists : true } }).sort({ pinnedAt : -1 }).limit(3).lean()
    const raw = await PostModel.find({ ...base, ...(pinned.length ? { _id : { $nin : pinned.map((p) => p._id) } } : {}), ...beforeFilter(req.query.before) }).sort({ createdAt : -1 }).limit(PAGE).lean()
    const posts = await S.serializePosts([...pinned, ...raw], ctx)
    return { posts, next : raw.length === PAGE ? raw[raw.length - 1].createdAt : null }
})

// my saved (bookmarked) posts, newest saved first (?app=connectify for Connectify)
const savedPosts = handle(async (req) => {
    const app = req.query.app === 'connectify' ? 'connectify' : 'pixify'
    const ids = [...((app === 'pixify' ? req.user.savedPosts : req.user.connectify?.saved) || [])].reverse().slice(0, 60)
    const raw = await PostModel.find({ _id : { $in : ids } }).lean()
    const order = Object.fromEntries(ids.map((id, i) => [String(id), i]))
    raw.sort((a, b) => order[String(a._id)] - order[String(b._id)])
    const ctx = await S.viewerContext(req.user, app)
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
    const raw = await PostModel.findById(isValidId(String(req.params.id)) ? req.params.id : null).select('app').lean()
    if (!raw) throw new S.SocialError('This post is no longer available', 404)
    const ctx = await S.viewerContext(req.user, raw.app)
    const { post } = await S.loadVisiblePost(req.params.id, ctx)
    const save = req.body.save !== false
    const field = post.app === 'pixify' ? 'savedPosts' : 'connectify.saved'
    await UserModel.updateOne({ _id : req.user._id }, { $pull : { [field] : post._id } })
    if (save) await UserModel.updateOne({ _id : req.user._id }, { $push : { [field] : { $each : [post._id], $slice : -500 } } })
    return { saved : save }
})

/* ---------- more post tools ---------- */

const ownPost = async (req) => {
    if (!isValidId(String(req.params.id))) throw new S.SocialError('Post not found', 404)
    const post = await PostModel.findOne({ _id : req.params.id, author : req.user._id })
    if (!post) throw new S.SocialError('Post not found', 404)
    return post
}
const postOut = async (req, post) => ({ post : (await S.serializePosts([post.toObject()], await S.viewerContext(req.user, post.app)))[0] })

// POST /posts/:id/pin { pin } -> up to 3 pinned posts on your profile
const pinPost = handle(async (req) => {
    const post = await ownPost(req)
    if (req.body.pin === false) post.pinnedAt = undefined
    else {
        if (post.group) throw new S.SocialError("Group posts can't be pinned to your profile")
        if (post.archived) throw new S.SocialError('Unarchive the post first')
        const count = await PostModel.countDocuments({ app : post.app, author : req.user._id, pinnedAt : { $exists : true }, _id : { $ne : post._id } })
        if (count >= 3) throw new S.SocialError('You can pin up to 3 posts. Unpin one first.')
        post.pinnedAt = new Date()
    }
    await post.save()
    return postOut(req, post)
})

// POST /posts/:id/archive { archive } (Pixify): hidden from everyone else, kept in your Archive
const archivePost = handle(async (req) => {
    const post = await ownPost(req)
    if (post.app !== 'pixify') throw new S.SocialError('Only Pixify posts can be archived')
    post.archived = req.body.archive !== false
    if (post.archived) post.pinnedAt = undefined
    await post.save()
    return postOut(req, post)
})

const pageOf = (raw, size) => ({ next : raw.length === size ? raw[raw.length - 1].createdAt : null })

// GET /archive -> my archived Pixify posts
const archived = handle(async (req) => {
    const raw = await PostModel.find({ app : 'pixify', author : req.user._id, archived : true, ...beforeFilter(req.query.before) }).sort({ createdAt : -1 }).limit(PAGE * 2).lean()
    return { posts : await S.serializePosts(raw, await S.viewerContext(req.user, 'pixify')), ...pageOf(raw, PAGE * 2) }
})

// GET /liked?app= -> posts I liked / reacted to ("Your activity")
const liked = handle(async (req) => {
    const app = appOf(req.query.app)
    const raw = await PostModel.find({ app, 'reactions.userId' : req.user._id, ...beforeFilter(req.query.before) }).sort({ createdAt : -1 }).limit(PAGE * 2).lean()
    return { posts : await S.serializePosts(raw, await S.viewerContext(req.user, app)), ...pageOf(raw, PAGE * 2) }
})

// GET /hashtags/:tag?app= -> posts with #tag, newest first
const HASHTAG = /^[\p{L}\p{N}_]{1,60}$/u
const hashtag = handle(async (req) => {
    const app = appOf(req.query.app)
    const tag = String(req.params.tag || '').replace(/^#/, '')
    if (!HASHTAG.test(tag)) throw new S.SocialError('Invalid hashtag')
    const filter = { app, archived : { $ne : true }, 'external.key' : { $exists : false }, text : { $regex : `#${escapeRegex(tag)}(?![\\p{L}\\p{N}_])`, $options : 'i' } }
    const ctx = await S.viewerContext(req.user, app)
    const [raw, count] = await Promise.all([
        PostModel.find({ ...filter, ...beforeFilter(req.query.before) }).sort({ createdAt : -1 }).limit(PAGE * 2).lean(),
        req.query.before ? null : PostModel.countDocuments(filter)
    ])
    return { tag, ...(count !== null ? { count } : {}), posts : await S.serializePosts(raw, ctx), ...pageOf(raw, PAGE * 2) }
})

// POST /posts/:id/view -> a Reel was played (not counted for the author)
const viewPost = handle(async (req) => {
    if (!isValidId(String(req.params.id))) throw new S.SocialError('Post not found', 404)
    await PostModel.updateOne({ _id : req.params.id, isReel : true, author : { $ne : req.user._id } }, { $inc : { views : 1 } })
    return {}
})

// POST /posts/:id/hide { hide }: Connectify "Hide post" / Pixify Explore "Not interested"
const hidePost = handle(async (req) => {
    const raw = await PostModel.findById(isValidId(String(req.params.id)) ? req.params.id : null).select('app').lean()
    if (!raw) throw new S.SocialError('Post not found', 404)
    const field = raw.app === 'pixify' ? 'pixify.notInterested' : 'connectify.hiddenPosts'
    if (req.body.hide === false) await UserModel.updateOne({ _id : req.user._id }, { $pull : { [field] : raw._id } })
    else await UserModel.updateOne({ _id : req.user._id }, { $push : { [field] : { $each : [raw._id], $slice : -1000 } } })
    return { hidden : req.body.hide !== false }
})

// POST /report { app, post | comment | user, reason }
const REPORT_REASONS = ["It's spam", 'Nudity or sexual activity', 'Hate speech or symbols', 'Violence or dangerous organizations', 'Bullying or harassment', 'Scam or fraud', 'False information', 'Intellectual property violation', 'Suicide or self-injury', 'Something else']
const report = handle(async (req) => {
    const app = appOf(req.body.app)
    const reason = REPORT_REASONS.includes(req.body.reason) ? req.body.reason : 'Something else'
    const doc = { reporter : req.user._id, app, reason }
    for (const k of ['post', 'comment', 'user']) {
        if (req.body[k] !== undefined) {
            if (!isValidId(String(req.body[k]))) throw new S.SocialError('Invalid report')
            doc[k] = req.body[k]
        }
    }
    if (!doc.post && !doc.comment && !doc.user) throw new S.SocialError('Nothing to report')
    await SocialReportModel.create(doc)
    return {}
})
const reportReasons = handle(async () => ({ reasons : REPORT_REASONS }))

// GET /memories -> Connectify "On this day": my posts from today's date in earlier years
const memories = handle(async (req) => {
    const now = new Date()
    const raw = await PostModel.find({ app : 'connectify', author : req.user._id, createdAt : { $lt : new Date(now.getFullYear(), 0, 1) } }).sort({ createdAt : -1 }).limit(3000).select('_id createdAt').lean()
    const ids = raw.filter((p) => { const d = new Date(p.createdAt); return d.getMonth() === now.getMonth() && d.getDate() === now.getDate() }).map((p) => p._id)
    const posts = ids.length ? await PostModel.find({ _id : { $in : ids } }).sort({ createdAt : -1 }).lean() : []
    return { posts : await S.serializePosts(posts, await S.viewerContext(req.user, 'connectify')) }
})

// GET /watch -> Connectify videos (public, friends', my groups')
// GET /watch -> Connectify videos (public, friends', my groups'), then YouTube Shorts (cursor "x:K") when they run out
const watch = handle(async (req) => {
    const ctx = await S.viewerContext(req.user, 'connectify')
    const cursor = String(req.query.before || '')
    if (cursor.startsWith('x:')) {
        const k = Math.max(1, parseInt(cursor.slice(2), 10) || 1)
        try {
            const shorts = await youtube.reels(k, 6)
            return { posts : await mirrorShorts(shorts, ctx, 'connectify'), next : shorts.length && k < 500 ? `x:${k + 1}` : null }
        } catch (error) {
            console.error('[youtube]', error.message)
            return { posts : [], next : null }
        }
    }
    const raw = await PostModel.find({ app : 'connectify', 'media.kind' : 'video', 'external.key' : { $exists : false }, ...beforeFilter(cursor),
        $or : [{ audience : 'public', group : { $exists : false } }, { author : { $in : [...ctx.friends, ctx.me].map(S.oid) }, group : { $exists : false } }, { group : { $in : [...ctx.groups].map(S.oid) } }] })
        .sort({ createdAt : -1 }).limit(PAGE).lean()
    const next = raw.length === PAGE ? raw[raw.length - 1].createdAt : youtube.enabled() ? 'x:1' : null
    return { posts : await S.serializePosts(raw, ctx), next }
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
        byAuthor : String(c.author) === String(post.author),
        ...(post.pinnedComment && String(post.pinnedComment) === String(c._id) ? { pinned : true } : {}),
        canPin : !c.parent && String(post.author) === String(viewer._id)
    }))

const listComments = handle(async (req) => {
    const raw = await PostModel.findById(isValidId(String(req.params.id)) ? req.params.id : null).select('app').lean()
    if (!raw) throw new S.SocialError('This post is no longer available', 404)
    const ctx = await S.viewerContext(req.user, raw.app)
    const { post } = await S.loadVisiblePost(req.params.id, ctx)
    const list = await CommentModel.find({ post : post._id }).sort({ createdAt : 1 }).limit(500).lean()
    const users = await S.loadUsers(list.map((c) => c.author))
    const comments = serializeComments(list, users, req.user, post)
    // the pinned comment goes first
    comments.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
    return { comments }
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

// POST /comments/:id/pin { pin } (the post's author; one pinned comment per post)
const pinComment = handle(async (req) => {
    if (!isValidId(String(req.params.id))) throw new S.SocialError('Comment not found', 404)
    const c = await CommentModel.findById(req.params.id).lean()
    if (!c || c.parent) throw new S.SocialError('Comment not found', 404)
    const post = await PostModel.findOne({ _id : c.post, author : req.user._id })
    if (!post) throw new S.SocialError('Only the post author can pin comments', 403)
    post.pinnedComment = req.body.pin === false ? undefined : c._id
    await post.save()
    return { pinned : req.body.pin !== false }
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

module.exports = {
    handle, appOf, createPost, editPost, deletePost, getPost, feed, explore, userPosts, savedPosts, react, reactions, savePost,
    listComments, addComment, deleteComment, likeComment, pinComment,
    pinPost, archivePost, archived, liked, hashtag, viewPost, hidePost, report, reportReasons, memories, watch
}
