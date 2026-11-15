// Pixify story archive, highlights and Close friends (Instagram parity): archive copies, highlight CRUD and
// limits, who can see highlights (private accounts, blocks, close-friends items), Close friends list rules,
// close-friends-only stories (who sees them in Pixify, removal hides them at once, other apps unaffected),
// account deletion.
const mongoose = require('mongoose')
const { io } = require('socket.io-client')
const { makeUser: mkUser, befriend, sleep } = require('./users')
const API = process.env.TEST_API || 'http://localhost:5055'

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const uid = 'h' + Date.now().toString(36)
const req = async (method, url, token, body) => {
  const res = await fetch(API + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: res.status, body: await res.json() }
}
const get = (url, t) => req('GET', '/api/social' + url, t)
const post = (url, t, b = {}) => req('POST', '/api/social' + url, t, b)
const patch = (url, t, b = {}) => req('PATCH', '/api/social' + url, t, b)
const del = (url, t) => req('DELETE', '/api/social' + url, t)
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { transports: ['websocket'], auth: { token, client: 'v2' }, forceNew: true, reconnection: false })
  s.on('connect', () => resolve(s))
  s.on('connect_error', reject)
})
const call = (s, ev, payload) => new Promise((r) => s.emit(ev, payload, r))
const IMG = 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg'

;(async () => {
  const [A, B, C, D, E] = await Promise.all(['Ann', 'Ben', 'Cat', 'Dan', 'Eve'].map((n) => mkUser(n, uid)))
  for (const [X, h] of [[A, 'ann'], [B, 'ben'], [C, 'cat'], [D, 'dan'], [E, 'eve']]) {
    X.handle = `${h}_${uid}`.slice(0, 30)
    await req('POST', '/api/updateuser', X.token, { username: X.handle })
  }
  await befriend(A, C) // contacts: A's Chats status reaches C
  await post('/follow/' + A.id, B.token)
  await post('/follow/' + A.id, C.token)
  await post('/follow/' + A.id, E.token)
  const [a, b, c, d] = await Promise.all([A, B, C, D].map((u) => connect(u.token)))
  await sleep(200)

  /* ---------- Close friends list ---------- */
  check('add a follower to Close friends', (await post('/close-friends/' + B.id, A.token, { add: true })).body.closeFriend === true)
  check("can't add someone who doesn't follow you", (await post('/close-friends/' + D.id, A.token, { add: true })).status === 400)
  check("can't add yourself", (await post('/close-friends/' + A.id, A.token, { add: true })).status === 404)
  check('invalid id rejected', (await post('/close-friends/nope', A.token, { add: true })).status === 404)
  let cf = (await get('/close-friends', A.token)).body
  check('list: count and members', cf.count === 1 && cf.closeFriends.length === 1 && cf.closeFriends[0]._id === B.id && cf.max === 500)
  check('followers flagged', cf.followers.find((p) => p._id === B.id)?.closeFriend === true && cf.followers.find((p) => p._id === C.id)?.closeFriend === false)
  check('search followers', (await get('/close-friends?q=' + C.handle.slice(0, 6), A.token)).body.followers.every((p) => p._id === C.id))
  check("my list is my own", (await get('/close-friends', B.token)).body.count === 0)

  /* ---------- close-friends stories ---------- */
  check('close friends needs Pixify', !(await call(a, 'status-post', { kind: 'text', text: 'cf chats', apps: ['chats'], closeFriends: true })).ok)
  const s1 = await call(a, 'status-post', { kind: 'text', text: 'for everyone', background: '#5796ff', apps: ['pixify'] })
  const s2 = await call(a, 'status-post', { kind: 'image', mediaUrl: IMG, caption: 'just friends', apps: ['pixify'], closeFriends: true })
  const s3 = await call(a, 'status-post', { kind: 'text', text: 'cf + chats', apps: ['chats', 'pixify'], closeFriends: true })
  const s4 = await call(a, 'status-post', { kind: 'text', text: 'chats only', apps: ['chats'] })
  check('stories posted', s1.ok && s2.ok && s3.ok && s4.ok, JSON.stringify([s1, s2, s3, s4].map((x) => x.error)))
  check('owner sees the close friends flag', s2.status.closeFriends === true && !s1.status.closeFriends)
  const pxIds = async (s) => { const r = await call(s, 'status-list', { app: 'pixify' }); return (r.updates.find((u) => u.user._id === A.id)?.statuses || []) }
  let bList = await pxIds(b)
  check('close friend sees close-friends stories (flagged)', bList.some((x) => x._id === s2.status._id && x.closeFriends) && bList.some((x) => x._id === s1.status._id && !x.closeFriends))
  let cList = await pxIds(c)
  check("follower who isn't a close friend doesn't", cList.some((x) => x._id === s1.status._id) && !cList.some((x) => x._id === s2.status._id || x._id === s3.status._id))
  check("non-follower sees nothing", (await pxIds(d)).length === 0)
  check("can't view it directly", !(await call(c, 'status-view', { statusId: s2.status._id })).ok)
  check('close friend can view it', (await call(b, 'status-view', { statusId: s2.status._id })).ok)
  const cChats = await call(c, 'status-list', { app: 'chats' })
  const inChats = cChats.updates.find((u) => u.user._id === A.id)?.statuses || []
  check('Chats sharing is unaffected (no badge there)', inChats.some((x) => x._id === s3.status._id && !x.closeFriends))
  check('viewable through Chats', (await call(c, 'status-view', { statusId: s3.status._id })).ok)
  check('owner list keeps the flag', (await call(a, 'status-list', { app: 'pixify' })).mine.some((x) => x._id === s2.status._id && x.closeFriends))

  // removing someone hides the stories at once
  check('remove from Close friends', (await post('/close-friends/' + B.id, A.token, { add: false })).body.closeFriend === false)
  bList = await pxIds(b)
  check('removed friend no longer sees them', !bList.some((x) => x._id === s2.status._id) && bList.some((x) => x._id === s1.status._id))
  check('removed friend cannot view them', !(await call(b, 'status-view', { statusId: s2.status._id })).ok)
  await post('/close-friends/' + B.id, A.token, { add: true })
  check('added back: visible again', (await pxIds(b)).some((x) => x._id === s2.status._id))
  await post('/close-friends/' + C.id, A.token, { add: true })
  check('added after posting: visible', (await pxIds(c)).some((x) => x._id === s2.status._id))
  await post('/follow/' + A.id, C.token, { follow: false })
  check('close friend who unfollows loses them', !(await call(c, 'status-view', { statusId: s2.status._id })).ok && (await pxIds(c)).length === 0)
  await post('/follow/' + A.id, C.token)

  /* ---------- story archive ---------- */
  let arch = (await get('/stories/archive', A.token)).body
  const texts = arch.items.map((i) => i.text || i.caption)
  check('Pixify stories are archived', arch.items.length === 3 && texts.includes('for everyone') && texts.includes('just friends') && texts.includes('cf + chats'), JSON.stringify(texts))
  check('Chats-only stories are not', !texts.includes('chats only'))
  check('archive keeps the story', arch.items.find((i) => i.caption === 'just friends').mediaUrl === IMG && arch.items.find((i) => i.text === 'for everyone').background === '#5796ff')
  check('newest first', new Date(arch.items[0].createdAt) >= new Date(arch.items[2].createdAt))
  check('archive is private', (await get('/stories/archive', B.token)).body.items.length === 0)
  const item = (t) => arch.items.find((i) => i.text === t || i.caption === t)._id

  // the story expires (deleted by the TTL index): the archive copy stays
  await mongoose.connect(process.env.MONGODB_URI)
  await mongoose.connection.db.collection('statuses').deleteOne({ _id: new mongoose.Types.ObjectId(s1.status._id) })
  check('expired story still in the archive', (await get('/stories/archive', A.token)).body.items.some((i) => i.text === 'for everyone'))

  /* ---------- highlights ---------- */
  check('title required', (await post('/highlights', A.token, { title: '  ', items: [item('for everyone')] })).status === 400)
  check('title max 30', (await post('/highlights', A.token, { title: 'x'.repeat(31), items: [item('for everyone')] })).status === 400)
  check('needs a story', (await post('/highlights', A.token, { title: 'Trips', items: [] })).status === 400)
  const bArch = await call(b, 'status-post', { kind: 'text', text: 'ben story', apps: ['pixify'] })
  const benItem = (await get('/stories/archive', B.token)).body.items.find((i) => i.text === 'ben story')?._id
  check("can't use someone else's stories", bArch.ok && (await post('/highlights', A.token, { title: 'Trips', items: [benItem] })).status === 404)
  const h1 = await post('/highlights', A.token, { title: 'Trips', items: [item('for everyone'), item('just friends')] })
  check('create a highlight', h1.status === 200 && h1.body.highlight.title === 'Trips' && h1.body.highlight.items.length === 2 && h1.body.highlight.items[0].text === 'for everyone')
  const hid = h1.body.highlight._id
  const h2 = await post('/highlights', A.token, { title: 'Friends', items: [item('just friends')] })
  const hl = async (t, who = A.handle) => (await get(`/users/${who}/highlights`, t)).body.highlights
  check('owner sees all highlights', (await hl(A.token)).length === 2)
  let forC = await hl(C.token)
  check('followers see highlights (cover first)', forC.length === 2 && forC[0].title === 'Trips')
  await post('/close-friends/' + C.id, A.token, { add: false })
  forC = await hl(C.token)
  check('close-friends items hidden from others', forC.length === 1 && forC[0].items.length === 1 && forC[0].items[0].text === 'for everyone')
  check('close friend sees them', (await hl(B.token)).find((h) => h._id === h2.body.highlight._id)?.items.length === 1)
  check('public account: anyone sees highlights', (await hl(D.token)).length === 1)

  // edit: rename, reorder (cover), add / remove items
  const ed = await patch('/highlights/' + hid, A.token, { title: 'Goa 2026', items: [item('cf + chats'), item('for everyone')] })
  check('edit title and items', ed.status === 200 && ed.body.highlight.title === 'Goa 2026' && ed.body.highlight.items.length === 2 && ed.body.highlight.items[0].text === 'cf + chats')
  check('edit: empty list rejected', (await patch('/highlights/' + hid, A.token, { items: [] })).status === 400)
  check('edit: nothing to change', (await patch('/highlights/' + hid, A.token, {})).status === 400)
  check("can't edit someone else's", (await patch('/highlights/' + hid, B.token, { title: 'Mine' })).status === 404)
  check("can't delete someone else's", (await del('/highlights/' + hid, B.token)).status === 404)

  // private account: only followers
  await post('/profile', A.token, { app: 'pixify', private: true })
  check('private account hides highlights from non-followers', (await hl(D.token)).length === 0)
  check('followers still see them', (await hl(C.token)).length >= 1)
  await post('/profile', A.token, { app: 'pixify', private: false })
  // blocks
  await call(a, 'block-user', { userId: D.id, block: true })
  const blocked = await get(`/users/${A.handle}/highlights`, D.token)
  check('blocked people get nothing', blocked.status === 404 || (blocked.body.highlights || []).length === 0, JSON.stringify(blocked.body))

  // deleting an archived story takes it out of highlights; an empty highlight goes
  check('delete from archive', (await del('/stories/archive/' + item('just friends'), A.token)).status === 200)
  check('empty highlight removed', !(await hl(A.token)).some((h) => h._id === h2.body.highlight._id))
  check("can't delete someone else's archive", (await del('/stories/archive/' + benItem, A.token)).status === 404)
  // deleting a live story also removes it from the archive and highlights
  await call(a, 'status-delete', { statusId: s3.status._id })
  const after = (await hl(A.token)).find((h) => h._id === hid)
  check('deleted story leaves archive and highlight', after.items.length === 1 && !(await get('/stories/archive', A.token)).body.items.some((i) => i.text === 'cf + chats'))
  check('delete highlight', (await del('/highlights/' + hid, A.token)).status === 200 && (await hl(A.token)).length === 0)

  // limits: 100 items per highlight, 100 highlights
  const many = Array.from({ length: 101 }, () => new mongoose.Types.ObjectId())
  await mongoose.connection.db.collection('storyarchives').insertMany(many.map((_id, i) => ({ _id, userId: new mongoose.Types.ObjectId(A.id), kind: 'text', text: 't' + i, background: '#00a884', font: 0, mediaUrl: '', caption: '', createdAt: new Date(Date.now() - 86400000 * 3 - i * 1000) })))
  check('max 100 stories per highlight', (await post('/highlights', A.token, { title: 'Big', items: many.map(String) })).status === 400)
  check('100 stories ok', (await post('/highlights', A.token, { title: 'Big', items: many.slice(0, 100).map(String) })).status === 200)
  check('archive pages (60 per page)', (await get('/stories/archive', A.token)).body.items.length === 60 && !!(await get('/stories/archive', A.token)).body.next)
  await mongoose.connection.db.collection('highlights').insertMany(Array.from({ length: 99 }, (_, i) => ({ userId: new mongoose.Types.ObjectId(A.id), title: 'h' + i, items: [many[0]], createdAt: new Date(), updatedAt: new Date() })))
  check('max 100 highlights', (await post('/highlights', A.token, { title: 'One more', items: [String(many[1])] })).status === 400)

  /* ---------- account deletion ---------- */
  const del1 = await req('POST', '/api/delete-account', A.token, { password: 'secret123' })
  const left = await mongoose.connection.db.collection('highlights').countDocuments({ userId: new mongoose.Types.ObjectId(A.id) })
  const leftArch = await mongoose.connection.db.collection('storyarchives').countDocuments({ userId: new mongoose.Types.ObjectId(A.id) })
  check('account deletion removes highlights and archive', del1.status === 200 && left === 0 && leftArch === 0, JSON.stringify(del1.body))
  // B's close friends list loses a deleted account
  await post('/follow/' + B.id, C.token)
  await post('/close-friends/' + C.id, B.token, { add: true })
  await req('POST', '/api/delete-account', C.token, { password: 'secret123' })
  const bUser = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(B.id) })
  check('deleted account leaves Close friends lists', !(bUser.pixify?.closeFriends || []).some((x) => String(x) === C.id))

  for (const s of [a, b, c, d]) s.disconnect()
  await mongoose.disconnect()
  await sleep(100)
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
