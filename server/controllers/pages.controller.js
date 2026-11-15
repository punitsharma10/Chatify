const UserModel = require('../models/user.model')
const { PostModel, CommentModel, NotificationModel } = require('../models/social.model')
const { CxPageModel, PAGE_CATEGORIES } = require('../models/cxPage.model')
const { isAllowedMediaUrl, isValidId, escapeRegex } = require('../helpers/chat')
const S = require('../helpers/social')
const { handle } = require('./posts.controller')

// Connectify (Facebook-style) Pages: create / edit / delete, follow, admins and the Page's posts.
// Posting as a Page goes through POST /posts with { page } (see posts.controller createPost).

const PAGE = 12
const MAX_OWNED = 20
const MAX_ADMINS = 20
const fail = (m, status = 400) => new S.SocialError(m, status)
const beforeFilter = (before) => (before && !Number.isNaN(Date.parse(before)) ? { createdAt : { $lt : new Date(before) } } : {})
const str = (v, max, label, required = false) => {
    const s = typeof v === 'string' ? v.trim() : ''
    if (required && !s) throw fail(`Add a ${label}`)
    if (s.length > max) throw fail(`${label[0].toUpperCase() + label.slice(1)} is too long`)
    return s
}
const photo = (url, label) => {
    if (!url) return ''
    if (typeof url !== 'string' || !isAllowedMediaUrl(url)) throw fail(`Invalid ${label}`)
    return url
}
const website = (v) => {
    let s = str(v, 200, 'website')
    if (!s) return ''
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`
    try {
        const u = new URL(s)
        if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) throw new Error()
        return u.href
    } catch { throw fail('Enter a valid website') }
}
const email = (v) => {
    const s = str(v, 120, 'email')
    if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw fail('Enter a valid email')
    return s.toLowerCase()
}
const phone = (v) => {
    const s = str(v, 30, 'phone number')
    if (s && !/^\+?[0-9][0-9 ()-]{3,28}$/.test(s)) throw fail('Enter a valid phone number')
    return s
}

// the editable fields from a request body (all of them when creating)
const cleanPage = (body, isNew) => {
    const out = {}
    if (body.name !== undefined || isNew) out.name = str(body.name, 75, 'Page name', true)
    if (body.category !== undefined || isNew) {
        if (!PAGE_CATEGORIES.includes(body.category)) throw fail('Choose a category')
        out.category = body.category
    }
    if (body.bio !== undefined) out.bio = str(body.bio, 255, 'bio')
    if (body.avatar !== undefined) out.avatar = photo(body.avatar, 'profile picture')
    if (body.cover !== undefined) out.cover = photo(body.cover, 'cover photo')
    if (body.website !== undefined) out.website = website(body.website)
    if (body.location !== undefined) out.location = str(body.location, 120, 'location')
    if (body.email !== undefined) out.email = email(body.email)
    if (body.phone !== undefined) out.phone = phone(body.phone)
    return out
}

const isAdmin = (p, id) => S.isPageAdmin(p, id)
const isFollower = (p, id) => (p.followers || []).some((x) => String(x) === String(id))

const pageCard = (p, me) => ({
    _id : String(p._id),
    name : p.name,
    category : p.category,
    bio : p.bio || '',
    avatar : p.avatar || '',
    cover : p.cover || '',
    website : p.website || '',
    location : p.location || '',
    email : p.email || '',
    phone : p.phone || '',
    followerCount : p.followerCount || 0,
    following : isFollower(p, me._id),
    isAdmin : isAdmin(p, me._id),
    adminCount : (p.admins || []).length,
    lastPostAt : p.lastPostAt || null,
    createdAt : p.createdAt
})

// hide Pages whose creator and the viewer blocked each other (admins always see their Page)
const visibleTo = async (pages, me) => {
    const creators = await S.loadUsers(pages.map((p) => p.createdBy))
    return pages.filter((p) => isAdmin(p, me._id) || !creators[String(p.createdBy)] || !S.blockedEitherWay(me, creators[String(p.createdBy)]))
}

const loadPage = async (req) => {
    if (!isValidId(String(req.params.id))) throw fail('Page not found', 404)
    const p = await CxPageModel.findById(req.params.id).lean()
    if (!p || !(await visibleTo([p], req.user)).length) throw fail('Page not found', 404)
    return p
}
const adminPage = async (req, what = 'do this') => {
    const p = await loadPage(req)
    if (!isAdmin(p, req.user._id)) throw fail(`Only Page admins can ${what}`, 403)
    return p
}

// GET /pages?tab=yours|followed|discover&q=
const listPages = handle(async (req) => {
    const me = req.user
    const tab = ['followed', 'discover'].includes(req.query.tab) ? req.query.tab : 'yours'
    let pages
    if (tab === 'yours') pages = await CxPageModel.find({ admins : me._id }).sort({ lastPostAt : -1, createdAt : -1 }).limit(100).lean()
    else if (tab === 'followed') pages = await CxPageModel.find({ followers : me._id }).sort({ lastPostAt : -1, createdAt : -1 }).limit(200).lean()
    else {
        const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : ''
        const filter = { admins : { $ne : me._id } }
        if (q) filter.$or = [{ name : new RegExp(escapeRegex(q), 'i') }, { category : new RegExp(escapeRegex(q), 'i') }]
        pages = await CxPageModel.find(filter).sort({ followerCount : -1, createdAt : -1 }).limit(60).lean()
    }
    return { pages : (await visibleTo(pages, me)).map((p) => pageCard(p, me)), categories : PAGE_CATEGORIES }
})

// GET /pages/categories
const categories = handle(async () => ({ categories : PAGE_CATEGORIES }))

// POST /pages { name, category, bio, avatar, cover, website, location, email, phone }
const createPage = handle(async (req) => {
    const me = req.user
    const doc = cleanPage(req.body, true)
    if ((await CxPageModel.countDocuments({ admins : me._id })) >= MAX_OWNED) throw fail(`You can manage up to ${MAX_OWNED} Pages`)
    const p = await CxPageModel.create({ ...doc, createdBy : me._id, admins : [me._id] })
    return { page : pageCard(p.toObject(), me) }
})

// GET /pages/:id
const getPage = handle(async (req) => ({ page : pageCard(await loadPage(req), req.user) }))

// PATCH /pages/:id (admins)
const updatePage = handle(async (req) => {
    const p = await adminPage(req, 'edit the Page')
    const updated = await CxPageModel.findByIdAndUpdate(p._id, { $set : cleanPage(req.body, false) }, { new : true }).lean()
    return { page : pageCard(updated, req.user) }
})

// removes a Page with its posts, their comments and the notifications about them
const removePage = async (pageId) => {
    const posts = (await PostModel.find({ page : pageId }).select('_id').lean()).map((p) => p._id)
    await Promise.all([
        CxPageModel.deleteOne({ _id : pageId }),
        PostModel.deleteMany({ page : pageId }),
        CommentModel.deleteMany({ post : { $in : posts } }),
        NotificationModel.deleteMany({ $or : [{ page : pageId }, { post : { $in : posts } }] })
    ])
}

// DELETE /pages/:id (admins)
const deletePage = handle(async (req) => {
    const p = await adminPage(req, 'delete the Page')
    await removePage(p._id)
    return {}
})

// POST /pages/:id/follow { follow }
const followPage = handle(async (req) => {
    const p = await loadPage(req)
    const me = req.user._id
    if (req.body.follow === false) {
        const r = await CxPageModel.updateOne({ _id : p._id, followers : me }, { $pull : { followers : me }, $inc : { followerCount : -1 } })
        if (r.modifiedCount) for (const a of p.admins) await S.unnotify({ user : a, actor : me, app : 'connectify', type : 'page_follow', page : p._id })
    } else {
        const r = await CxPageModel.updateOne({ _id : p._id, followers : { $ne : me } }, { $push : { followers : me }, $inc : { followerCount : 1 } })
        if (r.modifiedCount) for (const a of p.admins) await S.notify({ user : a, actor : me, app : 'connectify', type : 'page_follow', page : p._id })
    }
    return { page : pageCard(await CxPageModel.findById(p._id).lean(), req.user) }
})

// GET /pages/:id/posts?before=
const pagePosts = handle(async (req) => {
    const p = await loadPage(req)
    const raw = await PostModel.find({ page : p._id, scheduledFor : { $exists : false }, ...beforeFilter(req.query.before) }).sort({ createdAt : -1 }).limit(PAGE).lean()
    const posts = await S.serializePosts(raw, await S.viewerContext(req.user, 'connectify'))
    return { posts, next : raw.length === PAGE ? raw[raw.length - 1].createdAt : null }
})

// GET /pages/:id/admins (admins)
const listAdmins = handle(async (req) => {
    const p = await adminPage(req, 'see the admins')
    const users = await S.loadUsers(p.admins)
    return { people : p.admins.map((id) => users[String(id)]).filter((u) => u && !u.deletedAt).map((u) => ({ ...S.personCard(u, req.user), creator : String(u._id) === String(p.createdBy) })) }
})

// POST /pages/:id/admins { userId } -> add one of my friends as an admin
const addAdmin = handle(async (req) => {
    const p = await adminPage(req, 'add admins')
    const id = String(req.body.userId || '')
    if (!isValidId(id)) throw fail('Choose a friend')
    if (isAdmin(p, id)) throw fail('Already an admin')
    if (!(await S.friendIds(req.user._id)).includes(id)) throw fail('You can only add your friends as admins')
    const u = await UserModel.findById(id).select('blocked deletedAt').lean()
    if (!u || u.deletedAt || S.blockedEitherWay(req.user, u)) throw fail('Choose a friend')
    if (p.admins.length >= MAX_ADMINS) throw fail(`A Page can have up to ${MAX_ADMINS} admins`)
    if ((await CxPageModel.countDocuments({ admins : id })) >= MAX_OWNED) throw fail(`They already manage ${MAX_OWNED} Pages`)
    const updated = await CxPageModel.findOneAndUpdate({ _id : p._id, admins : { $ne : id } }, { $push : { admins : id } }, { new : true }).lean()
    return { page : pageCard(updated || p, req.user) }
})

// DELETE /pages/:id/admins/:userId -> remove an admin (or step down yourself); a Page always keeps one admin
const removeAdmin = handle(async (req) => {
    const p = await adminPage(req, 'remove admins')
    const id = String(req.params.userId)
    if (!isAdmin(p, id)) throw fail('Not an admin of this Page', 404)
    const updated = await CxPageModel.findOneAndUpdate({ _id : p._id, admins : id, 'admins.1' : { $exists : true } }, { $pull : { admins : S.oid(id) } }, { new : true }).lean()
    if (!updated) throw fail('A Page needs at least one admin')
    return { page : pageCard(updated, req.user) }
})

// account deletion: leave every Page (as follower and admin); a Page left with no admins is deleted,
// and Page posts the person wrote move to another admin so they stay on the Page
const cleanupUser = async (userId) => {
    for (const p of await CxPageModel.find({ followers : userId }).select('_id').lean()) {
        await CxPageModel.updateOne({ _id : p._id, followers : userId }, { $pull : { followers : userId }, $inc : { followerCount : -1 } })
    }
    for (const p of await CxPageModel.find({ admins : userId }).lean()) {
        const rest = p.admins.filter((a) => String(a) !== String(userId))
        if (!rest.length) { await removePage(p._id); continue }
        await CxPageModel.updateOne({ _id : p._id }, { $pull : { admins : userId } })
        await PostModel.updateMany({ page : p._id, author : userId }, { $set : { author : rest[0] } })
    }
}

module.exports = {
    listPages, categories, createPage, getPage, updatePage, deletePage, followPage, pagePosts, listAdmins, addAdmin, removeAdmin, cleanupUser
}
