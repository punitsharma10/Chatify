// Pixify (posts, likes, comments, follows, private accounts, explore, saved) and
// Connectify (friends, audiences, reactions, shares, suggestions), search and notifications.
const { makeUser: mkUser, befriend, sleep } = require('./users')
const API = process.env.TEST_API || 'http://localhost:5055'

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const uid = 'q' + Date.now().toString(36)
const makeUser = (name) => mkUser(name, uid)
const req = async (method, url, token, body) => {
  const res = await fetch(API + '/api/social' + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: res.status, body: await res.json() }
}
const get = (url, t) => req('GET', url, t)
const post = (url, t, b = {}) => req('POST', url, t, b)
const IMG = 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg'
const VID = 'https://res.cloudinary.com/demo/video/upload/v1/dog.mp4'

;(async () => {
  const A = await makeUser('Asha'), B = await makeUser('Bilal'), C = await makeUser('Chen'), D = await makeUser('Dora')
  await befriend(A, B) // Chats contacts (used for Connectify suggestions)
  // usernames
  for (const [X, h] of [[A, 'asha'], [B, 'bilal'], [C, 'chen'], [D, 'dora']]) {
    X.handle = `${h}_${uid}`.slice(0, 30)
    await fetch(API + '/api/updateuser', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + X.token }, body: JSON.stringify({ username: X.handle }) })
  }

  check('needs login', (await req('GET', '/feed?app=pixify', 'nope')).status === 401)

  /* ================= Pixify ================= */
  check('Pixify post needs a photo', (await post('/posts', A.token, { app: 'pixify', text: 'no photo' })).status === 400)
  check('media must be Cloudinary', (await post('/posts', A.token, { app: 'pixify', media: [{ url: 'https://evil.example/x.jpg', kind: 'image' }] })).status === 400)
  check('at most 10 photos', (await post('/posts', A.token, { app: 'pixify', media: Array(11).fill({ url: IMG, kind: 'image' }) })).status === 400)
  const p1 = await post('/posts', A.token, { app: 'pixify', text: 'Sunset with @' + B.handle, media: [{ url: IMG, kind: 'image', width: 1080, height: 1350 }, { url: IMG, kind: 'image' }] })
  check('post photos with a caption', p1.status === 200 && p1.body.post.media.length === 2 && p1.body.post.media[0].width === 1080 && p1.body.post.mine)
  const reel = await post('/posts', A.token, { app: 'pixify', text: 'My reel', media: [{ url: VID, kind: 'video' }] })
  check('a single video is a reel', reel.body.post.isReel === true)

  // follow (public account)
  check("can't follow yourself", (await post('/follow/' + A.id, A.token, { follow: true })).status === 400)
  const f = await post('/follow/' + A.handle, B.token, { follow: true })
  check('follow by @username', f.body.followStatus === 'active')
  check('following twice is fine', (await post('/follow/' + A.id, B.token, { follow: true })).body.followStatus === 'active')
  const feedB = await get('/feed?app=pixify', B.token)
  check('followed posts are in my feed', feedB.body.posts.some((p) => p._id === p1.body.post._id))
  check('stranger feed is empty', (await get('/feed?app=pixify', D.token)).body.posts.length === 0)
  check('public posts are in Explore', (await get('/explore', D.token)).body.posts.some((p) => p._id === p1.body.post._id))
  check('reels list videos', (await get('/explore?reels=1', B.token)).body.posts.every((p) => p.isReel) && (await get('/explore?reels=1', B.token)).body.posts.some((p) => p._id === reel.body.post._id))

  // profile
  const prof = await get(`/users/${A.handle}?app=pixify`, B.token)
  check('profile counts', prof.body.profile.posts === 2 && prof.body.profile.followers === 1 && prof.body.profile.followStatus === 'active' && prof.body.profile.canView)
  check('my following count', (await get(`/users/${B.id}?app=pixify`, B.token)).body.profile.following === 1)
  check('followers list', (await get(`/users/${A.id}/follows?type=followers`, D.token)).body.people.some((p) => p._id === B.id))
  check('unknown profile is 404', (await get('/users/nobody_' + uid + '?app=pixify', B.token)).status === 404)

  // likes + comments + mention
  const like = await post(`/posts/${p1.body.post._id}/react`, B.token, { type: 'like' })
  check('like a post', like.body.reactionCount === 1 && like.body.myReaction === 'like')
  check('Pixify only has likes', (await post(`/posts/${p1.body.post._id}/react`, B.token, { type: 'haha' })).status === 400)
  const cm = await post(`/posts/${p1.body.post._id}/comments`, B.token, { text: 'Beautiful 😍' })
  check('comment on a post', cm.status === 200 && cm.body.comment.text === 'Beautiful 😍' && !cm.body.comment.byAuthor)
  const rp = await post(`/posts/${p1.body.post._id}/comments`, A.token, { text: 'Thanks!', parent: cm.body.comment._id })
  check('reply to a comment', rp.body.comment.parent === cm.body.comment._id && rp.body.comment.byAuthor)
  check('like a comment', (await post(`/comments/${cm.body.comment._id}/like`, A.token, { like: true })).body.likeCount === 1)
  const one = await get(`/posts/${p1.body.post._id}`, B.token)
  check('counts on the post', one.body.post.commentCount === 2 && one.body.post.myReaction === 'like')
  const list = await get(`/posts/${p1.body.post._id}/comments`, D.token)
  check('anyone can read comments on a public post', list.body.comments.length === 2)
  check('empty comment rejected', (await post(`/posts/${p1.body.post._id}/comments`, B.token, { text: '  ' })).status === 400)

  const nA = await get('/notifications?app=pixify', A.token)
  const types = nA.body.notifications.map((n) => n.type)
  check('owner notified of follow, like and comment', types.includes('follow') && types.includes('like') && types.includes('comment'))
  check('mentioned person notified', (await get('/notifications?app=pixify', B.token)).body.notifications.some((n) => n.type === 'mention'))
  check('comment author notified of reply and like', (await get('/notifications?app=pixify', B.token)).body.notifications.some((n) => n.type === 'comment_like'))
  check('unread count', (await get('/notifications/unread', A.token)).body.pixify >= 3)
  await post('/notifications/read', A.token, { app: 'pixify' })
  check('mark all read', (await get('/notifications/unread', A.token)).body.pixify === 0)
  // unlike removes the notification, re-like doesn't stack
  await post(`/posts/${p1.body.post._id}/react`, B.token, { type: null })
  check('unlike', (await get(`/posts/${p1.body.post._id}`, B.token)).body.post.reactionCount === 0)
  check('unlike removes the like notification', !(await get('/notifications?app=pixify', A.token)).body.notifications.some((n) => n.type === 'like'))
  await post(`/posts/${p1.body.post._id}/react`, B.token, { type: 'like' })
  await post(`/posts/${p1.body.post._id}/react`, B.token, { type: 'like' })
  check('likes count once per person', (await get(`/posts/${p1.body.post._id}`, B.token)).body.post.reactionCount === 1)
  check('who liked', (await get(`/posts/${p1.body.post._id}/reactions`, A.token)).body.people[0]._id === B.id)

  // delete comment: only author or post owner
  check("others can't delete a comment", (await req('DELETE', `/comments/${cm.body.comment._id}`, D.token)).status === 403)
  const delC = await req('DELETE', `/comments/${cm.body.comment._id}`, A.token)
  check('post owner deletes a comment (and its replies)', delC.status === 200 && delC.body.removed.length === 2)
  check('comment count goes down', (await get(`/posts/${p1.body.post._id}`, A.token)).body.post.commentCount === 0)

  // save
  check('save a post', (await post(`/posts/${p1.body.post._id}/save`, B.token, { save: true })).body.saved === true)
  check('saved posts list', (await get('/saved', B.token)).body.posts[0]._id === p1.body.post._id)
  check('post shows saved', (await get(`/posts/${p1.body.post._id}`, B.token)).body.post.saved)

  // edit + comments off
  const ed = await req('PATCH', `/posts/${p1.body.post._id}`, A.token, { text: 'Edited caption', commentsOff: true })
  check('edit caption', ed.body.post.text === 'Edited caption' && !!ed.body.post.editedAt)
  check("others can't edit", (await req('PATCH', `/posts/${p1.body.post._id}`, B.token, { text: 'x' })).status === 404)
  check('comments off blocks new comments', (await post(`/posts/${p1.body.post._id}/comments`, B.token, { text: 'hi' })).status === 400)

  // private account
  await post('/profile', C.token, { app: 'pixify', private: true, bio: 'Just me', website: 'chen.dev' })
  const cp = await post('/posts', C.token, { app: 'pixify', media: [{ url: IMG, kind: 'image' }] })
  const cProf = await get(`/users/${C.id}?app=pixify`, D.token)
  check('private profile: bio shown, posts hidden', cProf.body.profile.private && !cProf.body.profile.canView && cProf.body.profile.bio === 'Just me' && cProf.body.profile.website === 'https://chen.dev')
  check('private posts list hidden', (await get(`/users/${C.id}/posts?app=pixify`, D.token)).body.private === true)
  check('private post hidden by id', (await get(`/posts/${cp.body.post._id}`, D.token)).status === 404)
  check('private posts not in Explore', !(await get('/explore', D.token)).body.posts.some((p) => p._id === cp.body.post._id))
  check('follow a private account = request', (await post('/follow/' + C.id, D.token, { follow: true })).body.followStatus === 'pending')
  check('request listed', (await get('/follow-requests', C.token)).body.requests.some((p) => p._id === D.id))
  check('still hidden while pending', (await get(`/posts/${cp.body.post._id}`, D.token)).status === 404)
  check('approve request', (await post('/follow-requests/' + D.id, C.token, { accept: true })).body.accepted)
  check('approved follower sees posts', (await get(`/posts/${cp.body.post._id}`, D.token)).status === 200)
  check('requester told it was accepted', (await get('/notifications?app=pixify', D.token)).body.notifications.some((n) => n.type === 'follow_accept'))
  await post('/follow/' + C.id, B.token, { follow: true })
  await post('/follow-requests/' + B.id, C.token, { accept: false })
  check('declined request removed', (await get(`/users/${C.id}?app=pixify`, B.token)).body.profile.followStatus === null)
  await post('/follow/' + C.id, A.token, { follow: true })
  await post('/profile', C.token, { app: 'pixify', private: false })
  check('going public approves waiting requests', (await get(`/users/${C.id}?app=pixify`, A.token)).body.profile.followStatus === 'active')
  check('remove a follower', (await post('/followers/' + D.id + '/remove', C.token)).status === 200 && (await get(`/users/${C.id}?app=pixify`, D.token)).body.profile.followStatus === null)
  check('unfollow', (await post('/follow/' + A.id, B.token, { follow: false })).body.followStatus === null && !(await get('/feed?app=pixify', B.token)).body.posts.some((p) => p._id === p1.body.post._id))

  // blocking hides everything
  const { io } = require('socket.io-client')
  const sa = io(API, { transports: ['websocket'], auth: { token: A.token, client: 'v2' }, forceNew: true, reconnection: false })
  await new Promise((r) => sa.on('connect', r))
  await new Promise((r) => sa.emit('block-user', { userId: D.id, block: true }, r))
  check('blocked: profile not found', (await get(`/users/${A.id}?app=pixify`, D.token)).status === 404)
  check('blocked: post not found', (await get(`/posts/${p1.body.post._id}`, D.token)).status === 404)
  check("blocked: can't follow", (await post('/follow/' + A.id, D.token, { follow: true })).status === 404)
  await new Promise((r) => sa.emit('block-user', { userId: D.id, block: false }, r))

  /* ================= Connectify ================= */
  check('empty post rejected', (await post('/posts', A.token, { app: 'connectify', text: '  ' })).status === 400)
  const fr = await post('/friends/' + B.id, A.token, { action: 'request' })
  check('send a friend request', fr.body.friendStatus === 'sent')
  check('they see it', (await get('/friends/requests', B.token)).body.received.some((p) => p._id === A.id))
  check('I see it as sent', (await get('/friends/requests', A.token)).body.sent.some((p) => p._id === B.id))
  check('request notification', (await get('/notifications?app=connectify', B.token)).body.notifications.some((n) => n.type === 'friend_request' && n.friendStatus === 'received'))
  check('accept', (await post('/friends/' + A.id, B.token, { action: 'accept' })).body.friendStatus === 'friends')
  check('both are friends', (await get(`/users/${B.id}?app=connectify`, A.token)).body.profile.friendStatus === 'friends' && (await get(`/users/${A.id}?app=connectify`, B.token)).body.profile.friendCount === 1)
  check('accept notification', (await get('/notifications?app=connectify', A.token)).body.notifications.some((n) => n.type === 'friend_accept'))
  // C sends to A, A sends back = accepted
  await post('/friends/' + A.id, C.token, { action: 'request' })
  check('sending back accepts', (await post('/friends/' + C.id, A.token, { action: 'request' })).body.friendStatus === 'friends')
  await post('/friends/' + A.id, D.token, { action: 'request' })
  check('decline', (await post('/friends/' + D.id, A.token, { action: 'decline' })).body.friendStatus === 'none' && (await get(`/users/${A.id}?app=connectify`, D.token)).body.profile.friendStatus === 'none')
  await post('/friends/' + A.id, D.token, { action: 'request' })
  check('cancel my request', (await post('/friends/' + A.id, D.token, { action: 'cancel' })).body.friendStatus === 'none')
  check('friends list', (await get(`/users/${A.id}/friends`, B.token)).body.people.length === 2)
  check('mutual friends', (await get(`/users/${C.id}?app=connectify`, B.token)).body.profile.mutualFriends === 1)
  const sug = await get('/friends/suggestions', B.token)
  check('suggestions: friends of friends', sug.body.people.some((p) => p._id === C.id && p.mutualFriends === 1))
  check('suggestions skip friends', !sug.body.people.some((p) => p._id === A.id))

  const pub = await post('/posts', A.token, { app: 'connectify', text: 'Hello world', audience: 'public', background: '#1877f2' })
  const fri = await post('/posts', A.token, { app: 'connectify', text: 'Friends only' })
  const me = await post('/posts', A.token, { app: 'connectify', text: 'Note to self', audience: 'only_me' })
  check('audience defaults to friends', fri.body.post.audience === 'friends')
  check('coloured text post', pub.body.post.background === '#1877f2')
  const feedC = await get('/feed?app=connectify', B.token)
  check("friends' feed has public + friends posts", feedC.body.posts.some((p) => p._id === pub.body.post._id) && feedC.body.posts.some((p) => p._id === fri.body.post._id))
  check('"only me" hidden from friends', !feedC.body.posts.some((p) => p._id === me.body.post._id) && (await get(`/posts/${me.body.post._id}`, B.token)).status === 404)
  check('"only me" visible to me', (await get(`/posts/${me.body.post._id}`, A.token)).status === 200)
  check('friends post hidden from strangers', (await get(`/posts/${fri.body.post._id}`, D.token)).status === 404)
  check('public post visible to strangers', (await get(`/posts/${pub.body.post._id}`, D.token)).status === 200)
  const rx = await post(`/posts/${pub.body.post._id}/react`, B.token, { type: 'love' })
  await post(`/posts/${pub.body.post._id}/react`, C.token, { type: 'haha' })
  check('reactions', rx.body.myReaction === 'love')
  const pr = (await get(`/posts/${pub.body.post._id}`, A.token)).body.post
  check('reaction summary', pr.reactionCount === 2 && pr.reactionCounts.love === 1 && pr.reactionCounts.haha === 1 && pr.topReactions.length === 2)
  check('invalid reaction', (await post(`/posts/${pub.body.post._id}/react`, B.token, { type: 'meh' })).status === 400)
  const sh = await post('/posts', B.token, { app: 'connectify', text: 'Look at this', sharedPost: pub.body.post._id, audience: 'public' })
  check('share a public post', sh.status === 200 && sh.body.post.sharedPost._id === pub.body.post._id)
  check('share count + notification', (await get(`/posts/${pub.body.post._id}`, A.token)).body.post.shareCount === 1 && (await get('/notifications?app=connectify', A.token)).body.notifications.some((n) => n.type === 'share'))
  check("can't share a friends-only post", (await post('/posts', B.token, { app: 'connectify', sharedPost: fri.body.post._id })).status === 400)
  check('audience change', (await req('PATCH', `/posts/${fri.body.post._id}`, A.token, { audience: 'public' })).body.post.audience === 'public' && (await get(`/posts/${fri.body.post._id}`, D.token)).status === 200)

  // cross-posting
  const cross = await post('/posts', A.token, { app: 'pixify', text: 'Both apps', media: [{ url: IMG, kind: 'image' }], crossPost: ['connectify'] })
  check('Pixify post also shared to Connectify', cross.body.crossPosted.length === 1 && cross.body.crossPosted[0].app === 'connectify')
  check('…and it is in friends\' Connectify feed', (await get('/feed?app=connectify', B.token)).body.posts.some((p) => p._id === cross.body.crossPosted[0]._id && p.text === 'Both apps'))

  // remove friend
  check('unfriend', (await post('/friends/' + C.id, A.token, { action: 'remove' })).body.friendStatus === 'none' && (await get(`/users/${C.id}?app=connectify`, A.token)).body.profile.friendStatus === 'none')

  // delete post cleans up
  check("others can't delete", (await req('DELETE', `/posts/${pub.body.post._id}`, B.token)).status === 404)
  check('delete post', (await req('DELETE', `/posts/${pub.body.post._id}`, A.token)).status === 200 && (await get(`/posts/${pub.body.post._id}`, A.token)).status === 404)
  check('a share of a deleted post shows it as unavailable', (await get(`/posts/${sh.body.post._id}`, B.token)).body.post.sharedPost.unavailable === true)

  /* ================= suggestions + badges ================= */
  // Dora follows Asha; Bilal follows Asha -> Dora sees Bilal? (followed by people Dora follows: no). Contacts/followers rank first.
  await post('/follow/' + A.id, D.token, { follow: true })
  const fsA = await get('/follow-suggestions', A.token)
  check('follow suggestions: people who follow me', fsA.body.people.some((p) => p._id === D.id && p.reason === 'Follows you'))
  check('follow suggestions skip people I follow', !fsA.body.people.some((p) => p._id === C.id))
  const unreadB = await get('/notifications/unread', B.token)
  check('unread counts per app', typeof unreadB.body.pixify === 'number' && typeof unreadB.body.connectify === 'number' && typeof unreadB.body.friendRequests === 'number')
  await post('/friends/' + B.id, D.token, { action: 'request' })
  check('pending friend requests counted', (await get('/notifications/unread', B.token)).body.friendRequests === 1)

  /* ================= search + profile ================= */
  const s1 = await get('/search?app=pixify&q=' + encodeURIComponent('@' + A.handle.slice(0, 6)), D.token)
  check('search by username prefix', s1.body.people.some((p) => p._id === A.id))
  check('search by name', (await get('/search?app=connectify&q=Bil', D.token)).body.people.some((p) => p._id === B.id))
  check('empty search', (await get('/search?app=pixify&q=', D.token)).body.people.length === 0)
  check('bad app rejected', (await get('/search?app=facebook&q=a', D.token)).status === 400)
  const up = await post('/profile', A.token, { app: 'connectify', bio: 'Hi there', city: 'Pune', cover_pic: IMG })
  check('Connectify profile update', up.body.data.connectify.city === 'Pune')
  check('bad cover rejected', (await post('/profile', A.token, { app: 'connectify', cover_pic: 'https://evil.example/c.jpg' })).status === 400)
  check('long bio rejected', (await post('/profile', A.token, { app: 'pixify', bio: 'x'.repeat(151) })).status === 400)

  sa.disconnect()
  await sleep(100)
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
