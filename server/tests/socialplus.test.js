// Instagram / Facebook parity: locations, tags, pins, archive, hidden likes, hashtags, mute, favorites, reports,
// Connectify intro, birthdays, pokes, snooze / unfollow / hide, memories, watch, groups, events, marketplace,
// Direct notes and forwarding.
const { makeUser: mkUser, sleep } = require('./users')
const API = process.env.TEST_API || 'http://localhost:5055'

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const uid = 'p' + Date.now().toString(36)
const req = async (method, url, token, body) => {
  const res = await fetch(API + '/api/social' + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: res.status, body: await res.json() }
}
const get = (url, t) => req('GET', url, t)
const post = (url, t, b = {}) => req('POST', url, t, b)
const patch = (url, t, b = {}) => req('PATCH', url, t, b)
const del = (url, t) => req('DELETE', url, t)
const IMG = 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg'
const VID = 'https://res.cloudinary.com/demo/video/upload/v1/dog.mp4'

;(async () => {
  const [A, B, C, D] = await Promise.all(['Ava', 'Bo', 'Cy', 'Di'].map((n) => mkUser(n, uid)))
  for (const [X, h] of [[A, 'ava'], [B, 'bo'], [C, 'cy'], [D, 'di']]) {
    X.handle = `${h}_${uid}`.slice(0, 30)
    await fetch(API + '/api/updateuser', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + X.token }, body: JSON.stringify({ username: X.handle }) })
  }
  await post('/follow/' + A.id, B.token)
  await post('/follow/' + A.id, C.token)
  await post('/follow/' + B.id, A.token)

  /* ---------- Pixify post tools ---------- */
  const p1 = await post('/posts', A.token, { app: 'pixify', text: 'Sunset at the #Beach #goa2026', media: [{ url: IMG, kind: 'image' }], location: 'Goa, India', tagged: [B.id, C.id], hideLikes: true })
  check('post with location, tags and hidden likes', p1.status === 200 && p1.body.post.location === 'Goa, India' && p1.body.post.tagged.length === 2 && p1.body.post.hideLikes)
  const pid = p1.body.post._id
  await sleep(100)
  check('tagged people are notified', (await get('/notifications?app=pixify', B.token)).body.notifications.some((n) => n.type === 'tag' && n.post._id === pid))
  check('Tagged tab on profile', (await get(`/users/${B.handle}/posts?app=pixify&tab=tagged`, C.token)).body.posts.some((p) => p._id === pid))
  check('long location rejected', (await post('/posts', A.token, { app: 'pixify', media: [{ url: IMG, kind: 'image' }], location: 'x'.repeat(101) })).status === 400)
  await post(`/posts/${pid}/react`, B.token, { type: 'like' })
  await post(`/posts/${pid}/react`, C.token, { type: 'like' })
  const seenByB = (await get('/posts/' + pid, B.token)).body.post
  check('hidden like count for others', seenByB.hideLikes && seenByB.reactionCount === 1)
  check('author still sees the count', (await get('/posts/' + pid, A.token)).body.post.reactionCount === 2)
  const ed = await patch('/posts/' + pid, A.token, { location: 'Panaji', hideLikes: false, tagged: [B.id] })
  check('edit location, likes, tags', ed.body.post.location === 'Panaji' && !ed.body.post.hideLikes && ed.body.post.tagged.length === 1)

  // hashtags
  const tagPage = await get('/hashtags/beach?app=pixify', D.token)
  check('hashtag page (case-insensitive)', tagPage.status === 200 && tagPage.body.count === 1 && tagPage.body.posts[0]._id === pid)
  check('hashtag must match whole tag', (await get('/hashtags/bea?app=pixify', D.token)).body.count === 0)
  check('bad hashtag rejected', (await get('/hashtags/no%20way?app=pixify', D.token)).status === 400)
  const s = await get('/search?app=pixify&q=%23go', D.token)
  check('hashtags in search', s.body.tags.some((t) => t.tag === 'goa2026'))

  // pin / archive
  const p2 = (await post('/posts', A.token, { app: 'pixify', text: 'second', media: [{ url: IMG, kind: 'image' }] })).body.post
  const p3 = (await post('/posts', A.token, { app: 'pixify', text: 'third', media: [{ url: IMG, kind: 'image' }] })).body.post
  const p4 = (await post('/posts', A.token, { app: 'pixify', text: 'fourth', media: [{ url: IMG, kind: 'image' }] })).body.post
  check('pin a post', (await post(`/posts/${pid}/pin`, A.token)).body.post.pinned)
  const prof = await get(`/users/${A.handle}/posts?app=pixify`, B.token)
  check('pinned post comes first', prof.body.posts[0]._id === pid && prof.body.posts[0].pinned)
  await post(`/posts/${p2._id}/pin`, A.token); await post(`/posts/${p3._id}/pin`, A.token)
  check('at most 3 pins', (await post(`/posts/${p4._id}/pin`, A.token)).status === 400)
  check("can't pin someone else's post", (await post(`/posts/${pid}/pin`, B.token)).status === 404)
  await post(`/posts/${p3._id}/pin`, A.token, { pin: false })
  check('unpin', !(await get('/posts/' + p3._id, A.token)).body.post.pinned)
  check('archive', (await post(`/posts/${p4._id}/archive`, A.token)).body.post.archived)
  check('archived post hidden from others', (await get('/posts/' + p4._id, B.token)).status === 404)
  check('archived post not in feed', !(await get('/feed?app=pixify', B.token)).body.posts.some((p) => p._id === p4._id))
  check('archive list', (await get('/archive', A.token)).body.posts.some((p) => p._id === p4._id))
  check('archived not counted on profile', (await get(`/users/${A.handle}?app=pixify`, B.token)).body.profile.posts === 3)
  await post(`/posts/${p4._id}/archive`, A.token, { archive: false })
  check('unarchive', (await get('/posts/' + p4._id, B.token)).status === 200)

  // liked posts
  check('posts you liked', (await get('/liked?app=pixify', B.token)).body.posts.some((p) => p._id === pid))

  // pin comment
  const c1 = (await post(`/posts/${pid}/comments`, B.token, { text: 'first!' })).body.comment
  const c2 = (await post(`/posts/${pid}/comments`, C.token, { text: 'Gorgeous' })).body.comment
  check('only the author pins comments', (await post(`/comments/${c2._id}/pin`, B.token)).status === 403)
  await post(`/comments/${c2._id}/pin`, A.token)
  const cl = (await get(`/posts/${pid}/comments`, D.token)).body.comments
  check('pinned comment comes first', cl[0]._id === c2._id && cl[0].pinned && cl[1]._id === c1._id)

  // reels views
  const reel = (await post('/posts', A.token, { app: 'pixify', text: 'reel', media: [{ url: VID, kind: 'video' }] })).body.post
  await post(`/posts/${reel._id}/view`, B.token); await post(`/posts/${reel._id}/view`, C.token); await post(`/posts/${reel._id}/view`, A.token)
  check('reel plays counted (not the author)', (await get('/posts/' + reel._id, A.token)).body.post.views === 2)

  // mute / favorites
  check('mute', (await post('/mute/' + A.id, B.token)).body.muted)
  check('muted account leaves the feed', !(await get('/feed?app=pixify', B.token)).body.posts.some((p) => p.author._id === A.id))
  check('muted shown on profile', (await get(`/users/${A.handle}?app=pixify`, B.token)).body.profile.muted)
  check('muted list', (await get('/muted', B.token)).body.people.some((p) => p._id === A.id))
  await post('/mute/' + A.id, B.token, { mute: false })
  check('unmute', (await get('/feed?app=pixify', B.token)).body.posts.some((p) => p.author._id === A.id))
  await post('/favorites/' + A.id, B.token)
  const fav = await get('/feed?app=pixify&filter=favorites', B.token)
  check('Favorites feed', fav.body.posts.length > 0 && fav.body.posts.every((p) => p.author._id === A.id))
  check('favorites list', (await get('/favorites', B.token)).body.people.some((p) => p._id === A.id))

  // not interested
  const exploreBefore = (await get('/explore', D.token)).body.posts
  await post(`/posts/${exploreBefore[0]._id}/hide`, D.token)
  check('Not interested removes it from Explore', !(await get('/explore', D.token)).body.posts.some((p) => p._id === exploreBefore[0]._id))

  // reports, pronouns
  check('report a post', (await post('/report', D.token, { app: 'pixify', post: pid, reason: "It's spam" })).status === 200)
  check('report needs a target', (await post('/report', D.token, { app: 'pixify', reason: "It's spam" })).status === 400)
  check('report reasons', (await get('/report/reasons', D.token)).body.reasons.length >= 5)
  await post('/profile', A.token, { app: 'pixify', pronouns: 'she/her' })
  check('pronouns', (await get(`/users/${A.handle}?app=pixify`, B.token)).body.profile.pronouns === 'she/her')

  /* ---------- Connectify ---------- */
  const befriend = async (X, Y) => { await post('/friends/' + Y.id, X.token, { action: 'request' }); await post('/friends/' + X.id, Y.token, { action: 'accept' }) }
  await befriend(A, B); await befriend(A, C)
  const cx1 = await post('/posts', A.token, { app: 'connectify', text: 'Great day', audience: 'friends', feeling: '😊 feeling happy', location: 'Pune', tagged: [B.id] })
  check('feeling, check-in, with friends', cx1.body.post.feeling === '😊 feeling happy' && cx1.body.post.location === 'Pune' && cx1.body.post.tagged[0]._id === B.id)
  const cxid = cx1.body.post._id
  check('save a Connectify post', (await post(`/posts/${cxid}/save`, B.token)).body.saved)
  check('Connectify saved list', (await get('/saved?app=connectify', B.token)).body.posts.some((p) => p._id === cxid))
  await post(`/posts/${cxid}/hide`, B.token)
  check('hide post from feed', !(await get('/feed?app=connectify', B.token)).body.posts.some((p) => p._id === cxid))
  const cx2 = (await post('/posts', A.token, { app: 'connectify', text: 'Another', audience: 'friends' })).body.post
  await post('/cx/snooze/' + A.id, B.token)
  check('snooze for 30 days', !(await get('/feed?app=connectify', B.token)).body.posts.some((p) => p._id === cx2._id))
  check('snooze shown on profile', !!(await get(`/users/${A.handle}?app=connectify`, B.token)).body.profile.snoozedUntil)
  await post('/cx/snooze/' + A.id, B.token, { snooze: false })
  check('unsnooze', (await get('/feed?app=connectify', B.token)).body.posts.some((p) => p._id === cx2._id))
  await post('/cx/unfollow/' + A.id, C.token)
  check('unfollow a friend (stay friends)', !(await get('/feed?app=connectify', C.token)).body.posts.some((p) => p.author._id === A.id))
  check('still friends after unfollow', (await get(`/users/${A.handle}?app=connectify`, C.token)).body.profile.friendStatus === 'friends')

  // intro + birthdays
  const today = new Date()
  const up = await post('/profile', A.token, { app: 'connectify', education: 'IIT Bombay', hometown: 'Nagpur', relationship: 'married', website: 'ava.dev', birthday: { month: today.getMonth() + 1, day: today.getDate(), year: 1995 } })
  check('intro fields', up.status === 200)
  const ap = (await get(`/users/${A.handle}?app=connectify`, B.token)).body.profile
  check('intro shown', ap.education === 'IIT Bombay' && ap.hometown === 'Nagpur' && ap.relationship === 'married' && ap.website === 'https://ava.dev')
  check('birthday shown to friends without the year', ap.birthday && ap.birthday.day === today.getDate() && !ap.birthday.year)
  check('birthday hidden from non-friends', !(await get(`/users/${A.handle}?app=connectify`, D.token)).body.profile.birthday)
  check('bad birthday rejected', (await post('/profile', A.token, { app: 'connectify', birthday: { month: 2, day: 31 } })).status === 400)
  check('bad relationship rejected', (await post('/profile', A.token, { app: 'connectify', relationship: 'whatever' })).status === 400)
  check("friends' birthdays today", (await get('/birthdays', B.token)).body.today.some((p) => p._id === A.id))

  // pokes
  check('poke a friend', (await post('/pokes/' + A.id, B.token)).body.poked)
  check("can't poke twice", (await post('/pokes/' + A.id, B.token)).status === 400)
  check('only friends can be poked', (await post('/pokes/' + D.id, B.token)).status === 400)
  check('pokes list', (await get('/pokes', A.token)).body.people.some((p) => p._id === B.id))
  await post('/pokes/' + B.id, A.token)
  check('poking back clears their poke', !(await get('/pokes', A.token)).body.people.some((p) => p._id === B.id) && (await get('/pokes', B.token)).body.people.some((p) => p._id === A.id))

  // watch, memories
  const vid = (await post('/posts', A.token, { app: 'connectify', text: 'clip', audience: 'public', media: [{ url: VID, kind: 'video' }] })).body.post
  check('Watch shows videos', (await get('/watch', D.token)).body.posts.some((p) => p._id === vid._id))
  check('Memories (none yet)', Array.isArray((await get('/memories', A.token)).body.posts))

  /* ---------- Groups ---------- */
  const g = await post('/groups', A.token, { name: 'Pune Hikers', description: 'Weekend treks', privacy: 'private', invite: [B.id, D.id] })
  check('create a private group', g.status === 200 && g.body.group.role === 'admin' && g.body.group.privacy === 'private')
  const gid = g.body.group._id
  await sleep(100)
  check('friends get the invite (not strangers)', (await get('/notifications?app=connectify', B.token)).body.notifications.some((n) => n.type === 'group_invite' && n.group?._id === gid) &&
    !(await get('/notifications?app=connectify', D.token)).body.notifications.some((n) => n.type === 'group_invite'))
  const gp = await post('/posts', A.token, { app: 'connectify', text: 'First trek Sunday!', group: gid })
  check('post in a group', gp.status === 200 && gp.body.post.group.name === 'Pune Hikers')
  check("non-members can't post", (await post('/posts', B.token, { app: 'connectify', text: 'hi', group: gid })).status === 403)
  check('private group posts hidden from non-members', (await get(`/groups/${gid}/posts`, B.token)).body.private === true && (await get('/posts/' + gp.body.post._id, B.token)).status === 404)
  const j = await post(`/groups/${gid}/join`, B.token)
  check('joining a private group sends a request', j.body.group.requested && !j.body.group.role)
  check('admin sees the request', (await get(`/groups/${gid}/requests`, A.token)).body.people.some((p) => p._id === B.id))
  check('members can\'t see requests', (await get(`/groups/${gid}/requests`, B.token)).status === 403)
  await post(`/groups/${gid}/requests/${B.id}`, A.token, { approve: true })
  check('approved member sees posts', (await get(`/groups/${gid}/posts`, B.token)).body.posts.length === 1)
  check('group posts in members\' feed', (await get('/feed?app=connectify', B.token)).body.posts.some((p) => p._id === gp.body.post._id))
  check('your groups', (await get('/groups', B.token)).body.groups.some((x) => x._id === gid))
  check('discover groups', (await get('/groups?tab=discover', D.token)).body.groups.some((x) => x._id === gid))
  check('members list', (await get(`/groups/${gid}/members`, B.token)).body.people.length === 2)
  const pub = (await post('/groups', C.token, { name: 'Open Group', privacy: 'public' })).body.group
  check('public group: join at once', (await post(`/groups/${pub._id}/join`, D.token)).body.group.role === 'member')
  check('edit group (admin only)', (await patch(`/groups/${gid}`, B.token, { name: 'x' })).status === 403 && (await patch(`/groups/${gid}`, A.token, { name: 'Pune Trekkers' })).body.group.name === 'Pune Trekkers')
  const bp = (await post('/posts', B.token, { app: 'connectify', text: 'spam', group: gid })).body.post
  check('admin removes a post', (await del(`/groups/${gid}/posts/${bp._id}`, A.token)).status === 200)
  await post(`/groups/${gid}/members/${B.id}`, A.token, { action: 'admin' })
  await post(`/groups/${gid}/leave`, A.token)
  check('leaving keeps the group with the other admin', (await get(`/groups/${gid}`, B.token)).body.group.role === 'admin' && (await get(`/groups/${gid}`, B.token)).body.group.memberCount === 1)

  /* ---------- Events ---------- */
  const start = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
  check('event must start in the future', (await post('/events', A.token, { title: 'Old', startsAt: '2020-01-01' })).status === 400)
  const ev = await post('/events', A.token, { title: 'Birthday party', startsAt: start, location: 'Pune', privacy: 'friends', invite: [B.id] })
  check('create an event', ev.status === 200 && ev.body.event.isHost && ev.body.event.myStatus === 'going')
  const eid = ev.body.event._id
  check('friends see friends-only events', (await get('/events', C.token)).body.events.some((e) => e._id === eid))
  check('strangers don\'t', (await get('/events/' + eid, D.token)).status === 404)
  const r = await post(`/events/${eid}/rsvp`, B.token, { status: 'interested' })
  check('interested', r.body.event.myStatus === 'interested' && r.body.event.interestedCount === 1)
  const r2 = await post(`/events/${eid}/rsvp`, B.token, { status: 'going' })
  check('going', r2.body.event.myStatus === 'going' && r2.body.event.goingCount === 2 && r2.body.event.interestedCount === 0)
  check('going list', (await get('/events?tab=going', B.token)).body.events.some((e) => e._id === eid))
  check('guests', (await get(`/events/${eid}/guests`, A.token)).body.going.length === 2)
  check('only the host edits', (await patch('/events/' + eid, B.token, { title: 'x' })).status === 403)
  check('host edits', (await patch('/events/' + eid, A.token, { title: 'Ava turns 31' })).body.event.title === 'Ava turns 31')
  check('end before start rejected', (await patch('/events/' + eid, A.token, { endsAt: '2020-01-01' })).status === 400)
  const priv = (await post('/events', A.token, { title: 'Secret', startsAt: start, privacy: 'private' })).body.event
  check('private events need an invite', (await get('/events/' + priv._id, B.token)).status === 404)
  await post(`/events/${priv._id}/invite`, A.token, { userIds: [B.id] })
  check('invited guests can see it', (await get('/events/' + priv._id, B.token)).status === 200)
  check('cancel an event', (await del('/events/' + priv._id, A.token)).status === 200)

  /* ---------- Marketplace ---------- */
  check('listing needs photos', (await post('/market', A.token, { title: 'Bike', price: 5000 })).status === 400)
  check('bad price rejected', (await post('/market', A.token, { title: 'Bike', price: -1, photos: [{ url: IMG }] })).status === 400)
  const li = await post('/market', A.token, { title: 'Road bike', price: 15000, category: 'vehicles', condition: 'like_new', location: 'Pune', photos: [{ url: IMG }] })
  check('create a listing', li.status === 200 && li.body.listing.mine && li.body.listing.price === 15000)
  const lid = li.body.listing._id
  check('browse by category', (await get('/market?category=vehicles', D.token)).body.listings.some((l) => l._id === lid))
  check('search listings', (await get('/market?q=road', D.token)).body.listings.some((l) => l._id === lid))
  check('save a listing', (await post(`/market/${lid}/save`, D.token)).body.saved && (await get('/market?tab=saved', D.token)).body.listings.some((l) => l._id === lid))
  check('only the seller edits', (await patch('/market/' + lid, D.token, { price: 1 })).status === 403)
  await patch('/market/' + lid, A.token, { status: 'sold' })
  check('sold items leave browse', !(await get('/market', D.token)).body.listings.some((l) => l._id === lid))
  check('your listings', (await get('/market?tab=mine', A.token)).body.listings.some((l) => l._id === lid && l.status === 'sold'))
  check('delete a listing', (await del('/market/' + lid, A.token)).status === 200)

  /* ---------- Direct notes + forward ---------- */
  check('note too long', (await post('/dm/note', A.token, { text: 'x'.repeat(61) })).status === 400)
  await post('/dm/note', A.token, { text: 'At the beach 🏖️' })
  const nb = await get('/dm/notes', B.token) // A and B follow each other
  check('mutual followers see your note', nb.body.notes.some((n) => n.person._id === A.id && n.text === 'At the beach 🏖️'))
  check("others don't", !(await get('/dm/notes', C.token)).body.notes.some((n) => n.person._id === A.id))
  check('your own note', (await get('/dm/notes', A.token)).body.mine.text === 'At the beach 🏖️')
  const t = (await get('/dm/with/' + B.handle, A.token)).body.thread._id
  const m = (await post(`/dm/threads/${t}/messages`, A.token, { text: 'forward me' })).body.message
  const fw = await post(`/dm/messages/${m._id}/forward`, A.token, { userIds: [C.id] })
  check('forward a message', fw.status === 200 && fw.body.sent === 1)
  const tc = (await get('/dm/with/' + C.handle, A.token)).body.thread._id
  check('forwarded copy arrives', (await get(`/dm/threads/${tc}/messages`, C.token)).body.messages.some((x) => x.text === 'forward me'))
  check("can't forward others' chats", (await post(`/dm/messages/${m._id}/forward`, D.token, { userIds: [C.id] })).status === 404)

  await sleep(100)
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
