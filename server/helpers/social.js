const mongoose = require('mongoose')
const UserModel = require('../models/user.model')
const { PostModel, FollowModel, FriendshipModel, NotificationModel } = require('../models/social.model')
const { publicUser, hasBlocked, isValidId } = require('./chat')

// Shared rules for Pixify (Instagram-style) and Connectify (Facebook-style).

class SocialError extends Error {
    constructor(message, status = 400) { super(message); this.status = status }
}

const oid = (id) => new mongoose.Types.ObjectId(String(id))
const SOCIAL_APPS = ['pixify', 'connectify']
const POST_BACKGROUNDS = ['#1877f2', '#e4405f', '#7e57c2', '#00a884', '#ff8a65', '#263238', 'linear-gradient(135deg,#ff6a88,#ff99ac)', 'linear-gradient(135deg,#5b8cff,#8a3ffc)', 'linear-gradient(135deg,#f7971e,#ffd200)']

// either block direction hides people from each other everywhere
const blockedEitherWay = (a, b) => hasBlocked(a, b._id) || hasBlocked(b, a._id)

// the small person shape every social screen uses
const personCard = (user, viewer) => {
    if (!user) return null
    const p = publicUser(user, viewer)
    return {
        _id : String(p._id),
        name : p.name,
        profileName : p.profileName || p.name,
        username : p.username || '',
        profile_pic : p.profile_pic || '',
        isContact : !!p.isContact,
        ...(p.self ? { self : true } : {}),
        ...(p.deleted ? { deleted : true } : {})
    }
}

const loadUsers = async (ids) => {
    const unique = [...new Set(ids.filter(Boolean).map(String))]
    if (!unique.length) return {}
    const users = await UserModel.find({ _id : { $in : unique } }).select('-password -devices -chatLockCode').lean()
    return Object.fromEntries(users.map((u) => [String(u._id), u]))
}

// find someone by @username or id
const findUserByHandle = async (handle) => {
    const h = String(handle || '').trim().replace(/^@/, '').toLowerCase()
    if (!h) return null
    const user = isValidId(h)
        ? await UserModel.findById(h).select('-password -devices -chatLockCode').lean()
        : await UserModel.findOne({ username : h }).select('-password -devices -chatLockCode').lean()
    return user && !user.deletedAt ? user : null
}

/* ---------- relationships ---------- */

// ids `userId` follows in Pixify (active only)
const followingIds = async (userId) => (await FollowModel.find({ follower : userId, status : 'active' }).select('following').lean()).map((f) => String(f.following))
const followerIds = async (userId) => (await FollowModel.find({ following : userId, status : 'active' }).select('follower').lean()).map((f) => String(f.follower))

// Connectify friends of `userId`
const friendIds = async (userId) => {
    const list = await FriendshipModel.find({ status : 'accepted', $or : [{ from : userId }, { to : userId }] }).select('from to').lean()
    return list.map((f) => (String(f.from) === String(userId) ? String(f.to) : String(f.from)))
}

// 'friends' | 'sent' | 'received' | 'none'
const friendStatus = async (meId, otherId) => {
    if (String(meId) === String(otherId)) return 'self'
    const f = await FriendshipModel.findOne({ $or : [{ from : meId, to : otherId }, { from : otherId, to : meId }] }).lean()
    if (!f) return 'none'
    if (f.status === 'accepted') return 'friends'
    return String(f.from) === String(meId) ? 'sent' : 'received'
}

// 'active' | 'pending' | null
const followStatus = async (meId, otherId) => (await FollowModel.findOne({ follower : meId, following : otherId }).select('status').lean())?.status || null

// everything needed to decide visibility for one viewer, loaded once per request
const viewerContext = async (viewer, app) => {
    const ctx = {
        viewer, me : String(viewer._id), app, following : new Set(), friends : new Set(),
        saved : new Set([...(viewer.savedPosts || []), ...(viewer.connectify?.saved || [])].map(String)),
        groups : new Set()
    }
    if (app === 'pixify') ctx.following = new Set(await followingIds(viewer._id))
    if (app === 'connectify') {
        ctx.friends = new Set(await friendIds(viewer._id))
        // groups I'm a member of (to see posts in private groups)
        const { CxGroupModel } = require('../models/cxGroup.model')
        ctx.groups = new Set((await CxGroupModel.find({ 'members.userId' : viewer._id }).select('_id').lean()).map((g) => String(g._id)))
    }
    return ctx
}

// may the viewer see this account's Pixify posts? (public, or I follow them, or it's me)
const canViewPixifyProfile = (author, ctx) => String(author._id) === ctx.me || !author.pixify?.private || ctx.following.has(String(author._id))

// a YouTube Short's "author" is its channel (not a Chatify account)
const externalAuthor = (p) => ({ _id : p.external.source === 'YouTube' ? 'youtube' : 'external', name : p.external.by || p.external.source, profileName : p.external.by || p.external.source, username : '', profile_pic : '', external : true })

const canSeePost = (post, author, ctx) => {
    if (post?.external?.key) return true
    if (!post || !author || author.deletedAt) return false
    // scheduled: nobody sees it until it's published (the author sees it in their "Scheduled" list)
    if (post.scheduledFor) return !!ctx.includeScheduled && String(author._id) === ctx.me
    // Page posts: public, hidden when the Page is gone or its creator and the viewer blocked each other (see pageInfo)
    if (post.page && post.pageHidden) return false
    if (String(author._id) === ctx.me) return true
    if (post.page && post.pageHidden === false) return true
    if (blockedEitherWay(ctx.viewer, author)) return false
    if (post.archived) return false
    // a collab post's invited / accepted co-authors always see it
    if ((post.collaborators || []).some((c) => String(c.userId) === ctx.me)) return true
    // group posts: public groups are open to everyone, private ones to members (checked by the caller via ctx.groups)
    if (post.group) return !post.groupPrivate || ctx.groups.has(String(post.group))
    if (post.app === 'pixify') return canViewPixifyProfile(author, ctx)
    if (post.audience === 'only_me') return false
    if (post.audience === 'friends') return ctx.friends.has(String(author._id))
    const listed = (post.audienceList || []).some((id) => String(id) === ctx.me)
    if (post.audience === 'specific') return listed && ctx.friends.has(String(author._id))
    if (post.audience === 'except') return !listed && ctx.friends.has(String(author._id))
    return true
}

/* ---------- posts ---------- */

const reactionSummary = (post, me) => {
    const counts = {}
    for (const r of post.reactions || []) counts[r.type] = (counts[r.type] || 0) + 1
    const mine = (post.reactions || []).find((r) => String(r.userId) === String(me))
    return {
        reactionCount : (post.reactions || []).length,
        reactionCounts : counts,
        topReactions : Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t),
        myReaction : mine?.type || null
    }
}

// Connectify Pages behind these posts: { [pageId]: page + hidden (gone, or its creator and the viewer blocked each other) }
const pageInfo = async (posts, viewer) => {
    const ids = [...new Set(posts.filter((p) => p?.page).map((p) => String(p.page)))]
    if (!ids.length) return {}
    const pages = await require('../models/cxPage.model').CxPageModel.find({ _id : { $in : ids } }).select('name avatar category createdBy admins').lean()
    const creators = await loadUsers(pages.map((p) => p.createdBy))
    return Object.fromEntries(pages.map((p) => [String(p._id), { ...p, hidden : !!creators[String(p.createdBy)] && blockedEitherWay(viewer, creators[String(p.createdBy)]) }]))
}
// the post as canSeePost wants it (pageHidden: true / false for Page posts)
const withPage = (post, pages) => (post?.page ? { ...post, pageHidden : !pages[String(post.page)] || pages[String(post.page)].hidden } : post)
const isPageAdmin = (page, userId) => !!page && (page.admins || []).some((id) => String(id) === String(userId))

// turn post documents into what the apps show; posts the viewer may not see are dropped
const serializePosts = async (posts, ctx) => {
    if (!posts.length) return []
    const shared = posts.filter((p) => p.sharedPost).map((p) => p.sharedPost)
    const sharedPosts = shared.length ? await PostModel.find({ _id : { $in : shared } }).lean() : []
    const sharedById = Object.fromEntries(sharedPosts.map((p) => [String(p._id), p]))
    // a friend's name among the people who reacted ("Liked by neha and 12 others")
    const reactorIds = posts.flatMap((p) => (p.reactions || []).slice(-20).map((r) => String(r.userId)))
    const taggedIds = posts.flatMap((p) => [...(p.tagged || []), ...(p.collaborators || []).map((c) => c.userId)].map(String))
    const users = await loadUsers([...posts.map((p) => p.author), ...sharedPosts.map((p) => p.author), ...reactorIds, ...taggedIds])
    const groupIds = [...posts, ...sharedPosts].filter((p) => p.group).map((p) => p.group)
    const groups = groupIds.length ? Object.fromEntries((await require('../models/cxGroup.model').CxGroupModel.find({ _id : { $in : groupIds } }).select('name privacy cover').lean()).map((g) => [String(g._id), g])) : {}
    const pages = await pageInfo([...posts, ...sharedPosts], ctx.viewer)

    const one = (p, depth = 0) => {
        const author = p.external?.key ? externalAuthor(p) : users[String(p.author)]
        const group = p.group ? groups[String(p.group)] : null
        if (p.group && !group) return null
        const pg = p.page ? pages[String(p.page)] : null
        if (!canSeePost(withPage(group ? { ...p, groupPrivate : group.privacy === 'private' } : p, pages), author, ctx)) return null
        // a Page post is "mine" for every admin of the Page (they can edit / delete it)
        const mine = String(p.author) === ctx.me || isPageAdmin(pg, ctx.me)
        const hidden = p.hideLikes && !mine
        const known = ctx.app === 'pixify' ? ctx.following : ctx.friends
        const by = [...(p.reactions || [])].reverse().find((r) => String(r.userId) !== ctx.me && (known.has(String(r.userId))) && users[String(r.userId)])
        const out = {
            _id : String(p._id),
            app : p.app,
            author : p.external?.key ? author : personCard(author, ctx.viewer),
            ...(p.external?.key ? { external : { source : p.external.source, by : p.external.by, byUrl : p.external.byUrl, link : p.external.link } } : {}),
            // Reels show "Follow" next to accounts you don't follow yet
            ...(ctx.app === 'pixify' && !p.external?.key ? { followingAuthor : ctx.following.has(String(p.author)), favoriteAuthor : (ctx.viewer.pixify?.favorites || []).some((id) => String(id) === String(p.author)) } : {}),
            text : p.text || '',
            media : p.media || [],
            audience : p.audience,
            background : p.background || '',
            isReel : !!p.isReel,
            commentsOff : !!p.commentsOff,
            commentCount : p.commentCount || 0,
            shareCount : p.shareCount || 0,
            createdAt : p.createdAt,
            editedAt : p.editedAt,
            mine,
            saved : ctx.saved.has(String(p._id)),
            ...reactionSummary(p, ctx.me),
            // "Hide like count": others see "Liked by neha and others" without numbers
            ...(hidden ? { hideLikes : true, reactionCount : (p.reactions || []).length ? 1 : 0, reactionCounts : {} } : p.hideLikes ? { hideLikes : true } : {}),
            location : p.location || '',
            feeling : p.feeling || '',
            tagged : (p.tagged || []).map((id) => users[String(id)]).filter((u) => u && !u.deletedAt && !blockedEitherWay(ctx.viewer, u)).map((u) => personCard(u, ctx.viewer)),
            ...(p.pinnedAt ? { pinned : true } : {}),
            ...(p.archived ? { archived : true } : {}),
            ...(p.isReel ? { views : p.views || 0 } : {}),
            ...(p.pinnedComment ? { pinnedComment : String(p.pinnedComment) } : {}),
            ...(group ? { group : { _id : String(group._id), name : group.name, privacy : group.privacy } } : {}),
            ...(pg ? { page : { _id : String(pg._id), name : pg.name, avatar : pg.avatar || '', category : pg.category } } : {}),
            ...(by ? { reactedBy : personCard(users[String(by.userId)], ctx.viewer) } : {}),
            // Pixify collab: accepted co-authors (the author also sees pending invites); myCollab = my invite's status
            ...(p.collaborators?.length ? {
                collaborators : p.collaborators
                    .filter((c) => (c.status === 'accepted' || mine) && users[String(c.userId)] && !users[String(c.userId)].deletedAt && !blockedEitherWay(ctx.viewer, users[String(c.userId)]))
                    .map((c) => ({ ...personCard(users[String(c.userId)], ctx.viewer), status : c.status })),
                ...((p.collaborators.find((c) => String(c.userId) === ctx.me)) ? { myCollab : p.collaborators.find((c) => String(c.userId) === ctx.me).status } : {})
            } : {}),
            // Connectify poll: counts per option and what I picked
            ...(p.poll?.options?.length ? {
                poll : {
                    multiple : !!p.poll.multiple,
                    total : new Set(p.poll.options.flatMap((o) => (o.votes || []).map(String))).size,
                    options : p.poll.options.map((o) => ({ text : o.text, count : (o.votes || []).length, voted : (o.votes || []).some((id) => String(id) === ctx.me) }))
                }
            } : {}),
            ...(p.scheduledFor ? { scheduledFor : p.scheduledFor } : {}),
            ...(mine && p.audienceList?.length ? { audienceList : p.audienceList.map(String) } : {})
        }
        if (p.sharedPost && depth === 0) {
            const inner = sharedById[String(p.sharedPost)]
            out.sharedPost = inner ? one(inner, 1) || { unavailable : true } : { unavailable : true }
        }
        return out
    }
    return posts.map((p) => one(p)).filter(Boolean)
}

// how many posts matching `filter` the viewer can see (up to 2000 checked)
const countVisible = async (filter, ctx) => {
    const raw = await PostModel.find(filter).select('app author archived audience group page external').limit(2000).lean()
    const users = await loadUsers(raw.map((p) => p.author))
    const groupIds = raw.filter((p) => p.group).map((p) => p.group)
    const groups = groupIds.length ? Object.fromEntries((await require('../models/cxGroup.model').CxGroupModel.find({ _id : { $in : groupIds } }).select('privacy').lean()).map((g) => [String(g._id), g])) : {}
    const pages = await pageInfo(raw, ctx.viewer)
    return raw.filter((p) => {
        if (p.group && !groups[String(p.group)]) return false
        return canSeePost(withPage(p.group ? { ...p, groupPrivate : groups[String(p.group)].privacy === 'private' } : p, pages), users[String(p.author)], ctx)
    }).length
}

const loadVisiblePost = async (postId, ctx) => {
    if (!isValidId(String(postId))) throw new SocialError('Post not found', 404)
    const post = await PostModel.findById(postId).lean()
    if (!post) throw new SocialError('This post is no longer available', 404)
    const author = post.external?.key ? externalAuthor(post) : (await loadUsers([post.author]))[String(post.author)]
    let check = post
    if (post.group) {
        const g = await require('../models/cxGroup.model').CxGroupModel.findById(post.group).select('privacy').lean()
        if (!g) throw new SocialError('This post is no longer available', 404)
        check = { ...post, groupPrivate : g.privacy === 'private' }
    }
    if (post.page) check = withPage(check, await pageInfo([post], ctx.viewer))
    if (!canSeePost(check, author, ctx)) throw new SocialError('This post is no longer available', 404)
    return { post, author }
}

/* ---------- notifications ---------- */

const emitTo = (userId, event, data) => {
    try { require('../socket/index').io.to(String(userId)).emit(event, data) } catch { /* socket not ready (tests) */ }
}

// create a notification and tell the person's open tabs (never notifies yourself or blocked people)
const notify = async ({ user, actor, app, type, post, comment, reaction, group, event, page, text = '' }) => {
    if (!user || String(user) === String(actor)) return
    const [u, a] = await Promise.all([UserModel.findById(user).select('blocked deletedAt').lean(), UserModel.findById(actor).select('blocked').lean()])
    if (!u || u.deletedAt || !a || hasBlocked(u, actor) || hasBlocked(a, user)) return
    // one like / reaction / follow notice per person and post (re-liking doesn't stack)
    if (['like', 'react', 'follow', 'follow_request', 'friend_request', 'comment_like', 'poke', 'tag', 'group_invite', 'group_join_request', 'event_invite', 'event_going', 'page_follow'].includes(type)) {
        await NotificationModel.deleteMany({ user, actor, app, type, ...(post ? { post } : {}), ...(comment ? { comment } : {}), ...(group ? { group } : {}), ...(event ? { event } : {}), ...(page ? { page } : {}) })
    }
    await NotificationModel.create({ user, actor, app, type, post, comment, reaction, group, event, page, text : String(text).slice(0, 200) })
    emitTo(user, 'social-notification', { app, type })
}

const unnotify = async (filter) => {
    const removed = await NotificationModel.deleteMany(filter)
    if (removed.deletedCount && filter.user) emitTo(filter.user, 'social-notification', { app : filter.app, removed : true })
}

// "@neha_k nice!" -> notify neha_k (if she exists and can see the post)
const MENTION = /(^|[^a-z0-9._])@([a-z0-9._]{3,30})/gi
const mentionedUsernames = (text) => [...new Set([...String(text || '').matchAll(MENTION)].map((m) => m[2].toLowerCase().replace(/\.+$/, '')))].slice(0, 10)

const notifyMentions = async ({ text, actor, app, post, comment }) => {
    const names = mentionedUsernames(text)
    if (!names.length) return
    const users = await UserModel.find({ username : { $in : names }, deletedAt : { $exists : false } }).select('-password -devices').lean()
    let check = post
    if (post.group) {
        const g = await require('../models/cxGroup.model').CxGroupModel.findById(post.group).select('privacy').lean()
        if (!g) return
        check = { ...post, groupPrivate : g.privacy === 'private' }
    }
    for (const u of users) {
        const ctx = await viewerContext(u, app)
        const author = await UserModel.findById(post.author).select('-password -devices').lean()
        if (canSeePost(post.page ? withPage(check, await pageInfo([post], u)) : check, author, ctx)) await notify({ user : u._id, actor, app, type : 'mention', post : post._id, comment, text })
    }
}

module.exports = {
    SocialError, oid, SOCIAL_APPS, POST_BACKGROUNDS,
    blockedEitherWay, personCard, loadUsers, findUserByHandle,
    followingIds, followerIds, friendIds, friendStatus, followStatus,
    viewerContext, canViewPixifyProfile, canSeePost, pageInfo, withPage, isPageAdmin, serializePosts, loadVisiblePost, reactionSummary, countVisible,
    emitTo, notify, unnotify, notifyMentions, mentionedUsernames
}
