const UserModel = require('../models/user.model')
const { PostModel, FollowModel, FriendshipModel, NotificationModel, PokeModel } = require('../models/social.model')

const RELATIONSHIPS = ['', 'single', 'in_a_relationship', 'engaged', 'married', 'its_complicated', 'separated', 'divorced', 'widowed']
const { isAllowedMediaUrl, isValidId, escapeRegex } = require('../helpers/chat')
const S = require('../helpers/social')
const { handle, appOf } = require('./posts.controller')

const findOther = async (req) => {
    const user = await S.findUserByHandle(req.params.id)
    if (!user || S.blockedEitherWay(req.user, user)) throw new S.SocialError('User not found', 404)
    return user
}

/* ---------- profiles ---------- */

// GET /api/social/users/:id?app=  (:id = @username or user id)
const profile = handle(async (req) => {
    const app = appOf(req.query.app)
    const user = await findOther(req)
    const me = String(req.user._id)
    const isMe = String(user._id) === me
    const base = {
        ...S.personCard(user, req.user),
        posts : await PostModel.countDocuments({ app, author : user._id, archived : { $ne : true }, group : { $exists : false } })
    }
    const has = (list) => (list || []).some((id) => String(id) === String(user._id))
    if (app === 'pixify') {
        const [followers, following, status, followsMe] = await Promise.all([
            FollowModel.countDocuments({ following : user._id, status : 'active' }),
            FollowModel.countDocuments({ follower : user._id, status : 'active' }),
            isMe ? null : S.followStatus(me, user._id),
            isMe ? null : S.followStatus(user._id, me)
        ])
        const ctx = await S.viewerContext(req.user, 'pixify')
        // people I follow who follow them ("Followed by neha_k + 3 more")
        const mutual = isMe ? [] : (await FollowModel.find({ following : user._id, status : 'active', follower : { $in : [...ctx.following].map(S.oid) } }).limit(3).lean()).map((f) => String(f.follower))
        const mutualUsers = await S.loadUsers(mutual)
        return {
            profile : {
                ...base,
                bio : user.pixify?.bio || '',
                website : user.pixify?.website || '',
                pronouns : user.pixify?.pronouns || '',
                private : !!user.pixify?.private,
                ...(isMe ? {} : { muted : has(req.user.pixify?.muted), favorite : has(req.user.pixify?.favorites) }),
                followers, following,
                followStatus : status,              // 'active' | 'pending' | null
                followsMe : followsMe === 'active',
                canView : S.canViewPixifyProfile(user, ctx),
                followedBy : mutual.map((id) => S.personCard(mutualUsers[id], req.user)).filter(Boolean)
            }
        }
    }
    const [friends, status, mine] = await Promise.all([S.friendIds(user._id), isMe ? 'self' : S.friendStatus(me, user._id), isMe ? [] : S.friendIds(me)])
    const mutualIds = friends.filter((id) => mine.includes(id))
    const preview = await S.loadUsers(friends.slice(0, 9))
    return {
        profile : {
            ...base,
            bio : user.connectify?.bio || '',
            cover_pic : user.connectify?.cover_pic || '',
            city : user.connectify?.city || '',
            work : user.connectify?.work || '',
            education : user.connectify?.education || '',
            hometown : user.connectify?.hometown || '',
            relationship : user.connectify?.relationship || '',
            website : user.connectify?.website || '',
            // birthday is shown to friends (day and month only)
            ...((isMe || status === 'friends') && user.connectify?.birthday?.month ? { birthday : { month : user.connectify.birthday.month, day : user.connectify.birthday.day, ...(isMe && user.connectify.birthday.year ? { year : user.connectify.birthday.year } : {}) } } : {}),
            ...(isMe ? {} : {
                unfollowed : has(req.user.connectify?.unfollowed),
                snoozedUntil : (req.user.connectify?.snoozed || []).find((s) => String(s.userId) === String(user._id) && new Date(s.until) > Date.now())?.until || null,
                pokedByMe : !!(await PokeModel.exists({ from : req.user._id, to : user._id })),
                pokedMe : !!(await PokeModel.exists({ from : user._id, to : req.user._id }))
            }),
            friendCount : friends.length,
            mutualFriends : mutualIds.length,
            friendStatus : status,
            friendsPreview : friends.slice(0, 9).map((id) => S.personCard(preview[id], req.user)).filter(Boolean),
            joinedAt : user.createdAt
        }
    }
})

// POST /api/social/profile  { app, bio?, website?, private?, cover_pic?, city?, work? }
const updateProfile = handle(async (req) => {
    const app = appOf(req.body.app)
    const set = {}
    const str = (key, max, path) => {
        if (req.body[key] === undefined) return
        if (typeof req.body[key] !== 'string' || req.body[key].length > max) throw new S.SocialError(`${key[0].toUpperCase() + key.slice(1)} is too long (max ${max} characters)`)
        set[path] = req.body[key].trim()
    }
    if (app === 'pixify') {
        str('bio', 150, 'pixify.bio')
        str('website', 200, 'pixify.website')
        if (set['pixify.website'] && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(set['pixify.website'])) {
            if (/^[^\s]+\.[^\s]+$/.test(set['pixify.website'])) set['pixify.website'] = 'https://' + set['pixify.website']
            else throw new S.SocialError('Enter a valid website link')
        }
        if (req.body.private !== undefined) set['pixify.private'] = !!req.body.private
        str('pronouns', 30, 'pixify.pronouns')
    } else {
        str('bio', 101, 'connectify.bio')
        str('city', 60, 'connectify.city')
        str('work', 80, 'connectify.work')
        str('education', 80, 'connectify.education')
        str('hometown', 60, 'connectify.hometown')
        str('website', 200, 'connectify.website')
        if (set['connectify.website'] && !/^https?:\/\//i.test(set['connectify.website'])) {
            if (/^[^\s]+\.[^\s]+$/.test(set['connectify.website'])) set['connectify.website'] = 'https://' + set['connectify.website']
            else throw new S.SocialError('Enter a valid website link')
        }
        if (req.body.relationship !== undefined) {
            if (!RELATIONSHIPS.includes(req.body.relationship)) throw new S.SocialError('Invalid relationship status')
            set['connectify.relationship'] = req.body.relationship
        }
        if (req.body.birthday !== undefined) {
            const b = req.body.birthday
            if (b === null) set['connectify.birthday'] = {}
            else {
                const month = Number(b?.month), day = Number(b?.day), year = b?.year ? Number(b.year) : undefined
                const valid = Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(day) && day >= 1 && day <= new Date(2024, month, 0).getDate() &&
                    (year === undefined || (Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear()))
                if (!valid) throw new S.SocialError('Enter a valid birthday')
                set['connectify.birthday'] = { month, day, ...(year ? { year } : {}) }
            }
        }
        if (req.body.cover_pic !== undefined) {
            if (req.body.cover_pic && !isAllowedMediaUrl(req.body.cover_pic)) throw new S.SocialError('Invalid cover photo')
            set['connectify.cover_pic'] = req.body.cover_pic || ''
        }
    }
    const user = await UserModel.findByIdAndUpdate(req.user._id, { $set : set }, { new : true }).select('-password -devices -chatLockCode').lean()
    // going public approves everyone who was waiting
    if (set['pixify.private'] === false) {
        const pending = await FollowModel.find({ following : req.user._id, status : 'pending' }).select('follower').lean()
        await FollowModel.updateMany({ following : req.user._id, status : 'pending' }, { $set : { status : 'active' } })
        await NotificationModel.deleteMany({ user : req.user._id, app : 'pixify', type : 'follow_request' })
        for (const p of pending) await S.notify({ user : p.follower, actor : req.user._id, app : 'pixify', type : 'follow_accept' })
    }
    return { data : user }
})

/* ---------- Pixify: follow ---------- */

// POST /api/social/follow/:id  { follow: true | false }  (false also cancels a request)
const follow = handle(async (req) => {
    const user = await findOther(req)
    const me = req.user._id
    if (String(user._id) === String(me)) throw new S.SocialError("You can't follow yourself")
    if (req.body.follow === false) {
        await FollowModel.deleteOne({ follower : me, following : user._id })
        await S.unnotify({ user : user._id, actor : me, app : 'pixify', type : { $in : ['follow', 'follow_request'] } })
        return { followStatus : null }
    }
    const existing = await FollowModel.findOne({ follower : me, following : user._id }).lean()
    if (existing) return { followStatus : existing.status }
    const status = user.pixify?.private ? 'pending' : 'active'
    try {
        await FollowModel.create({ follower : me, following : user._id, status })
    } catch (e) {
        if (e?.code !== 11000) throw e
    }
    await S.notify({ user : user._id, actor : me, app : 'pixify', type : status === 'pending' ? 'follow_request' : 'follow' })
    return { followStatus : status }
})

// people waiting for me to approve their follow request
const followRequests = handle(async (req) => {
    const list = await FollowModel.find({ following : req.user._id, status : 'pending' }).sort({ createdAt : -1 }).limit(200).lean()
    const users = await S.loadUsers(list.map((f) => f.follower))
    return { requests : list.map((f) => users[String(f.follower)]).filter((u) => u && !u.deletedAt && !S.blockedEitherWay(req.user, u)).map((u) => S.personCard(u, req.user)) }
})

// POST /api/social/follow-requests/:id  { accept }
const answerFollowRequest = handle(async (req) => {
    const user = await findOther(req)
    const accept = !!req.body.accept
    const f = accept
        ? await FollowModel.findOneAndUpdate({ follower : user._id, following : req.user._id, status : 'pending' }, { $set : { status : 'active' } })
        : await FollowModel.findOneAndDelete({ follower : user._id, following : req.user._id, status : 'pending' })
    if (!f) throw new S.SocialError('This request is no longer available', 404)
    await NotificationModel.deleteMany({ user : req.user._id, actor : user._id, app : 'pixify', type : 'follow_request' })
    if (accept) {
        await S.notify({ user : user._id, actor : req.user._id, app : 'pixify', type : 'follow_accept' })
        await S.notify({ user : req.user._id, actor : user._id, app : 'pixify', type : 'follow' })
    }
    return { accepted : accept }
})

const removeFollower = handle(async (req) => {
    const user = await findOther(req)
    await FollowModel.deleteOne({ follower : user._id, following : req.user._id })
    return {}
})

// GET /api/social/users/:id/follows?type=followers|following
const followList = handle(async (req) => {
    const user = await findOther(req)
    const ctx = await S.viewerContext(req.user, 'pixify')
    if (!S.canViewPixifyProfile(user, ctx)) throw new S.SocialError('This account is private', 403)
    const followers = req.query.type !== 'following'
    const list = await FollowModel.find(followers ? { following : user._id, status : 'active' } : { follower : user._id, status : 'active' }).sort({ createdAt : -1 }).limit(500).lean()
    const ids = list.map((f) => String(followers ? f.follower : f.following))
    const users = await S.loadUsers(ids)
    const mine = new Set(await FollowModel.find({ follower : req.user._id, following : { $in : ids.map(S.oid) } }).select('following status').lean().then((r) => r.map((f) => `${f.following}:${f.status}`)))
    return {
        people : ids.map((id) => users[id]).filter((u) => u && !u.deletedAt && !S.blockedEitherWay(req.user, u)).map((u) => ({
            ...S.personCard(u, req.user),
            followStatus : mine.has(`${u._id}:active`) ? 'active' : mine.has(`${u._id}:pending`) ? 'pending' : null
        }))
    }
})

// Pixify "Suggested for you": my Chats contacts and people followed by people I follow (not followed yet)
const followSuggestions = handle(async (req) => {
    const me = String(req.user._id)
    const following = await S.followingIds(me)
    const pending = (await FollowModel.find({ follower : me, status : 'pending' }).select('following').lean()).map((f) => String(f.following))
    const skip = new Set([me, ...following, ...pending])
    const score = {}
    for (const c of req.user.contacts || []) if (!skip.has(String(c.userId))) score[String(c.userId)] = { contact : true, via : 0 }
    // people who follow me
    for (const id of await S.followerIds(me)) if (!skip.has(id)) score[id] = { ...(score[id] || { via : 0 }), followsMe : true, contact : score[id]?.contact || false }
    const second = await FollowModel.find({ follower : { $in : following.map(S.oid) }, status : 'active' }).select('following').limit(3000).lean()
    for (const f of second) {
        const id = String(f.following)
        if (skip.has(id)) continue
        score[id] = score[id] || { contact : false, via : 0 }
        score[id].via++
    }
    const rank = (s) => (s.followsMe ? 4 : 0) + (s.contact ? 2 : 0) + Math.min(s.via, 5) * 0.5
    const ids = Object.keys(score).sort((a, b) => rank(score[b]) - rank(score[a])).slice(0, 30)
    const users = await S.loadUsers(ids)
    return {
        people : ids.map((id) => users[id]).filter((u) => u && !u.deletedAt && u.username && !S.blockedEitherWay(req.user, u)).map((u) => {
            const s = score[String(u._id)]
            return { ...S.personCard(u, req.user), reason : s.followsMe ? 'Follows you' : s.contact ? 'In your contacts' : `Followed by ${s.via} you follow`, private : !!u.pixify?.private }
        })
    }
})

/* ---------- Connectify: friends ---------- */

// POST /api/social/friends/:id  { action: 'request' | 'cancel' | 'accept' | 'decline' | 'remove' }
const friendAction = handle(async (req) => {
    const user = await findOther(req)
    const me = req.user._id
    if (String(user._id) === String(me)) throw new S.SocialError("That's you!")
    const action = req.body.action
    const pair = { $or : [{ from : me, to : user._id }, { from : user._id, to : me }] }
    const f = await FriendshipModel.findOne(pair).lean()

    if (action === 'request') {
        if (f?.status === 'accepted') return { friendStatus : 'friends' }
        // they already asked me: sending a request accepts theirs
        if (f && String(f.from) === String(user._id)) return accept(f, user, me)
        if (f) return { friendStatus : 'sent' }
        try { await FriendshipModel.create({ from : me, to : user._id }) } catch (e) { if (e?.code !== 11000) throw e }
        await S.notify({ user : user._id, actor : me, app : 'connectify', type : 'friend_request' })
        return { friendStatus : 'sent' }
    }
    if (action === 'accept') {
        if (!f || f.status !== 'pending' || String(f.to) !== String(me)) throw new S.SocialError('This request is no longer available', 404)
        return accept(f, user, me)
    }
    if (action === 'cancel' || action === 'decline' || action === 'remove') {
        if (f) {
            if (action === 'cancel' && !(f.status === 'pending' && String(f.from) === String(me))) throw new S.SocialError('Nothing to cancel')
            if (action === 'decline' && !(f.status === 'pending' && String(f.to) === String(me))) throw new S.SocialError('Nothing to decline')
            if (action === 'remove' && f.status !== 'accepted') throw new S.SocialError('You aren\'t friends')
            await FriendshipModel.deleteOne({ _id : f._id })
            await NotificationModel.deleteMany({ app : 'connectify', type : { $in : ['friend_request', 'friend_accept'] }, $or : [{ user : me, actor : user._id }, { user : user._id, actor : me }] })
            S.emitTo(user._id, 'social-notification', { app : 'connectify', removed : true })
        }
        return { friendStatus : 'none' }
    }
    throw new S.SocialError('Invalid action')
})

const accept = async (f, user, me) => {
    await FriendshipModel.updateOne({ _id : f._id }, { $set : { status : 'accepted', acceptedAt : new Date() } })
    await NotificationModel.deleteMany({ user : me, actor : user._id, app : 'connectify', type : 'friend_request' })
    await S.notify({ user : user._id, actor : me, app : 'connectify', type : 'friend_accept' })
    return { friendStatus : 'friends' }
}

// GET /api/social/friends/requests -> { received, sent }
const friendRequests = handle(async (req) => {
    const me = req.user._id
    const list = await FriendshipModel.find({ status : 'pending', $or : [{ from : me }, { to : me }] }).sort({ createdAt : -1 }).limit(300).lean()
    const users = await S.loadUsers(list.flatMap((f) => [f.from, f.to]))
    const myFriends = await S.friendIds(me)
    const card = async (id, at) => {
        const u = users[String(id)]
        if (!u || u.deletedAt || S.blockedEitherWay(req.user, u)) return null
        const theirs = await S.friendIds(u._id)
        return { ...S.personCard(u, req.user), mutualFriends : theirs.filter((x) => myFriends.includes(x)).length, at }
    }
    const received = (await Promise.all(list.filter((f) => String(f.to) === String(me)).map((f) => card(f.from, f.createdAt)))).filter(Boolean)
    const sent = (await Promise.all(list.filter((f) => String(f.from) === String(me)).map((f) => card(f.to, f.createdAt)))).filter(Boolean)
    return { received, sent }
})

const friendList = handle(async (req) => {
    const user = await findOther(req)
    const ids = await S.friendIds(user._id)
    const mine = new Set(await S.friendIds(req.user._id))
    const users = await S.loadUsers(ids)
    return {
        people : ids.map((id) => users[id]).filter((u) => u && !u.deletedAt && !S.blockedEitherWay(req.user, u))
            .map((u) => ({ ...S.personCard(u, req.user), isFriend : mine.has(String(u._id)) || String(u._id) === String(req.user._id) }))
            .sort((a, b) => a.name.localeCompare(b.name))
    }
})

// "People you may know": my Chats contacts and friends of friends who aren't friends yet
const friendSuggestions = handle(async (req) => {
    const me = String(req.user._id)
    const [friends, pending] = await Promise.all([
        S.friendIds(me),
        FriendshipModel.find({ status : 'pending', $or : [{ from : me }, { to : me }] }).select('from to').lean()
    ])
    const skip = new Set([me, ...friends, ...pending.flatMap((f) => [String(f.from), String(f.to)])])
    const score = {}
    for (const c of req.user.contacts || []) if (!skip.has(String(c.userId))) score[String(c.userId)] = { contact : true, mutual : 0 }
    // people who saved me as a contact
    for (const u of await UserModel.find({ 'contacts.userId' : req.user._id }).select('_id').limit(300).lean()) {
        const id = String(u._id)
        if (!skip.has(id)) score[id] = { ...(score[id] || { mutual : 0 }), contact : true }
    }
    const fof = await FriendshipModel.find({ status : 'accepted', $or : [{ from : { $in : friends.map(S.oid) } }, { to : { $in : friends.map(S.oid) } }] }).select('from to').limit(3000).lean()
    for (const f of fof) {
        for (const id of [String(f.from), String(f.to)]) {
            if (skip.has(id)) continue
            score[id] = score[id] || { contact : false, mutual : 0 }
            score[id].mutual++
        }
    }
    const ids = Object.keys(score).sort((a, b) => (score[b].contact - score[a].contact) || (score[b].mutual - score[a].mutual)).slice(0, 30)
    const users = await S.loadUsers(ids)
    return {
        people : ids.map((id) => users[id]).filter((u) => u && !u.deletedAt && !S.blockedEitherWay(req.user, u))
            .map((u) => ({ ...S.personCard(u, req.user), mutualFriends : score[String(u._id)].mutual, fromContacts : score[String(u._id)].contact }))
    }
})

/* ---------- search ---------- */

// GET /api/social/search?q=&app=  people with an @username, by username or name (starts with)
const search = handle(async (req) => {
    const app = appOf(req.query.app)
    const q = typeof req.query.q === 'string' ? req.query.q.trim().replace(/^@/, '').slice(0, 50) : ''
    if (!q) return { people : [] }
    const re = new RegExp('^' + escapeRegex(q), 'i')
    const word = new RegExp('(^|\\s)' + escapeRegex(q), 'i')
    const found = await UserModel.find({ username : { $type : 'string' }, deletedAt : { $exists : false }, $or : [{ username : re }, { name : word }] })
        .select('-password -devices -chatLockCode').limit(40).lean()
    const ctx = await S.viewerContext(req.user, app)
    const people = found.filter((u) => !S.blockedEitherWay(req.user, u)).map((u) => ({
        ...S.personCard(u, req.user),
        ...(app === 'pixify' ? { following : ctx.following.has(String(u._id)), private : !!u.pixify?.private } : { isFriend : ctx.friends.has(String(u._id)) })
    }))
    // people I know first, then exact username match, then the rest
    const rank = (p) => (p.username === q.toLowerCase() ? 0 : 2) - (p.following || p.isFriend ? 1 : 0) - (p.isContact ? 0.5 : 0)
    return { people : people.sort((a, b) => rank(a) - rank(b)).slice(0, 20), tags : await hashtagsLike(app, q.replace(/^#/, '')) }
})

// hashtags used in recent posts that start with `q`, most used first
const hashtagsLike = async (app, q) => {
    if (!/^[\p{L}\p{N}_]{1,60}$/u.test(q)) return []
    const posts = await PostModel.find({ app, archived : { $ne : true }, 'external.key' : { $exists : false }, text : { $regex : `#${escapeRegex(q)}`, $options : 'i' } }).sort({ createdAt : -1 }).limit(300).select('text').lean()
    const counts = {}
    const prefix = q.toLowerCase()
    for (const p of posts) {
        for (const m of p.text.matchAll(/#([\p{L}\p{N}_]{1,60})/gu)) {
            const t = m[1].toLowerCase()
            if (t.startsWith(prefix)) counts[t] = (counts[t] || 0) + 1
        }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag, count]) => ({ tag, count }))
}

/* ---------- Pixify: mute, favorites ---------- */

const toggleIn = async (req, field, on) => {
    const user = await findOther(req)
    if (String(user._id) === String(req.user._id)) throw new S.SocialError("That's you!")
    await UserModel.updateOne({ _id : req.user._id }, on ? { $addToSet : { [field] : user._id } } : { $pull : { [field] : user._id } })
    return user
}

// POST /mute/:id { mute } -> their posts leave my feed (they aren't told)
const mute = handle(async (req) => { await toggleIn(req, 'pixify.muted', req.body.mute !== false); return { muted : req.body.mute !== false } })

// POST /favorites/:id { favorite }  (up to 50)
const favorite = handle(async (req) => {
    const on = req.body.favorite !== false
    if (on && (req.user.pixify?.favorites || []).length >= 50) throw new S.SocialError('You can add up to 50 favorites')
    await toggleIn(req, 'pixify.favorites', on)
    return { favorite : on }
})

// GET /favorites | /muted -> people in that list
const listOf = (field) => handle(async (req) => {
    const ids = (field === 'favorites' ? req.user.pixify?.favorites : field === 'muted' ? req.user.pixify?.muted : req.user.connectify?.unfollowed) || []
    const users = await S.loadUsers(ids)
    return { people : ids.map((id) => users[String(id)]).filter((u) => u && !u.deletedAt && !S.blockedEitherWay(req.user, u)).map((u) => S.personCard(u, req.user)) }
})

/* ---------- Connectify: unfollow, snooze, pokes, birthdays ---------- */

// POST /cx/unfollow/:id { unfollow } -> stay friends, stop seeing their posts
const cxUnfollow = handle(async (req) => { await toggleIn(req, 'connectify.unfollowed', req.body.unfollow !== false); return { unfollowed : req.body.unfollow !== false } })

// POST /cx/snooze/:id { snooze } -> hide their posts for 30 days
const snooze = handle(async (req) => {
    const user = await findOther(req)
    await UserModel.updateOne({ _id : req.user._id }, { $pull : { 'connectify.snoozed' : { userId : user._id } } })
    if (req.body.snooze === false) return { snoozedUntil : null }
    const until = new Date(Date.now() + 30 * 24 * 3600 * 1000)
    await UserModel.updateOne({ _id : req.user._id }, { $push : { 'connectify.snoozed' : { userId : user._id, until } } })
    return { snoozedUntil : until }
})

// POST /pokes/:id -> poke a friend (poking back clears their poke)
const poke = handle(async (req) => {
    const user = await findOther(req)
    if (String(user._id) === String(req.user._id)) throw new S.SocialError("You can't poke yourself")
    if (!(await S.friendIds(req.user._id)).includes(String(user._id))) throw new S.SocialError('You can only poke friends')
    if (await PokeModel.exists({ from : req.user._id, to : user._id })) throw new S.SocialError(`You already poked ${user.name.split(' ')[0]}`)
    await PokeModel.deleteOne({ from : user._id, to : req.user._id })
    await PokeModel.create({ from : req.user._id, to : user._id })
    await S.notify({ user : user._id, actor : req.user._id, app : 'connectify', type : 'poke' })
    return { poked : true }
})

// GET /pokes -> friends who poked me (newest first)
const pokes = handle(async (req) => {
    const list = await PokeModel.find({ to : req.user._id }).sort({ createdAt : -1 }).limit(50).lean()
    const users = await S.loadUsers(list.map((p) => p.from))
    return { people : list.map((p) => users[String(p.from)] && !S.blockedEitherWay(req.user, users[String(p.from)]) ? { ...S.personCard(users[String(p.from)], req.user), at : p.createdAt } : null).filter(Boolean) }
})

// GET /birthdays -> friends' birthdays today and in the next 30 days
const birthdays = handle(async (req) => {
    const ids = await S.friendIds(req.user._id)
    const users = await UserModel.find({ _id : { $in : ids.map(S.oid) }, 'connectify.birthday.month' : { $exists : true }, deletedAt : { $exists : false } }).select('-password -devices -chatLockCode').lean()
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const list = users.filter((u) => !S.blockedEitherWay(req.user, u)).map((u) => {
        const { month, day } = u.connectify.birthday
        let next = new Date(today.getFullYear(), month - 1, day)
        if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day)
        return { ...S.personCard(u, req.user), month, day, inDays : Math.round((next - today) / 86400000) }
    }).filter((b) => b.inDays <= 30).sort((a, b) => a.inDays - b.inDays)
    return { today : list.filter((b) => b.inDays === 0), upcoming : list.filter((b) => b.inDays > 0) }
})

/* ---------- notifications ---------- */

const notifications = handle(async (req) => {
    const app = appOf(req.query.app)
    const list = await NotificationModel.find({ user : req.user._id, app }).sort({ createdAt : -1 }).limit(100).lean()
    const [users, posts] = await Promise.all([
        S.loadUsers(list.map((n) => n.actor)),
        PostModel.find({ _id : { $in : list.filter((n) => n.post).map((n) => n.post) } }).select('media text background app').lean()
    ])
    const postById = Object.fromEntries(posts.map((p) => [String(p._id), p]))
    const { CxGroupModel, CxEventModel } = require('../models/cxGroup.model')
    const [groups, events] = await Promise.all([
        CxGroupModel.find({ _id : { $in : list.filter((n) => n.group).map((n) => n.group) } }).select('name cover').lean(),
        CxEventModel.find({ _id : { $in : list.filter((n) => n.event).map((n) => n.event) } }).select('title cover startsAt').lean()
    ])
    const groupById = Object.fromEntries(groups.map((g) => [String(g._id), g]))
    const eventById = Object.fromEntries(events.map((e) => [String(e._id), e]))
    // current state for follow / friend notices (so the right button shows)
    const actorIds = [...new Set(list.map((n) => String(n.actor)))]
    const ctx = await S.viewerContext(req.user, app)
    const sentFriend = app === 'connectify' ? new Set((await FriendshipModel.find({ from : req.user._id, status : 'pending' }).select('to').lean()).map((f) => String(f.to))) : new Set()
    const pendingFollow = app === 'pixify' ? new Set((await FollowModel.find({ follower : req.user._id, status : 'pending', following : { $in : actorIds.map(S.oid) } }).select('following').lean()).map((f) => String(f.following))) : new Set()
    return {
        notifications : list.filter((n) => users[String(n.actor)] && !users[String(n.actor)].deletedAt && !S.blockedEitherWay(req.user, users[String(n.actor)])).map((n) => {
            const p = n.post ? postById[String(n.post)] : null
            const actor = String(n.actor)
            return {
                _id : String(n._id),
                type : n.type,
                actor : S.personCard(users[actor], req.user),
                post : p ? { _id : String(p._id), thumb : p.media?.[0] || null, text : (p.text || '').slice(0, 80), background : p.background || '' } : null,
                comment : n.comment ? String(n.comment) : null,
                ...(n.group && groupById[String(n.group)] ? { group : { _id : String(n.group), name : groupById[String(n.group)].name, cover : groupById[String(n.group)].cover || '' } } : {}),
                ...(n.event && eventById[String(n.event)] ? { event : { _id : String(n.event), title : eventById[String(n.event)].title, startsAt : eventById[String(n.event)].startsAt } } : {}),
                reaction : n.reaction || null,
                text : n.text || '',
                read : n.read,
                createdAt : n.createdAt,
                ...(app === 'pixify'
                    ? { followStatus : ctx.following.has(actor) ? 'active' : pendingFollow.has(actor) ? 'pending' : null }
                    : { friendStatus : ctx.friends.has(actor) ? 'friends' : sentFriend.has(actor) ? 'sent' : n.type === 'friend_request' ? 'received' : 'none' })
            }
        }),
        ...(app === 'pixify' ? { followRequests : await FollowModel.countDocuments({ following : req.user._id, status : 'pending' }) } : {})
    }
})

const markRead = handle(async (req) => {
    const app = appOf(req.body.app)
    await NotificationModel.updateMany({ user : req.user._id, app, read : false }, { $set : { read : true } })
    S.emitTo(req.user._id, 'social-notification', { app, read : true })
    return {}
})

const unread = handle(async (req) => {
    const [pixify, connectify, friendReqs, dm] = await Promise.all([
        NotificationModel.countDocuments({ user : req.user._id, app : 'pixify', read : false }),
        NotificationModel.countDocuments({ user : req.user._id, app : 'connectify', read : false }),
        FriendshipModel.countDocuments({ to : req.user._id, status : 'pending' }),
        require('./dm.controller').unreadCounts(req.user._id)
    ])
    // dm: Pixify Direct conversations with new messages / waiting message requests
    return { pixify, connectify, friendRequests : friendReqs, dm : dm.inbox, dmRequests : dm.requests }
})

module.exports = {
    profile, updateProfile,
    follow, followRequests, answerFollowRequest, removeFollower, followList, followSuggestions,
    friendAction, friendRequests, friendList, friendSuggestions,
    search, notifications, markRead, unread,
    mute, favorite, favorites : listOf('favorites'), mutedList : listOf('muted'), unfollowedList : listOf('unfollowed'),
    cxUnfollow, snooze, poke, pokes, birthdays,
    isValidId
}
