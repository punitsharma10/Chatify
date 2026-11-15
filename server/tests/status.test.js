// Status updates: posting, audience (contacts / except / only), viewing, viewers, read receipts, mute, delete, replies.
const { io } = require('socket.io-client')
const { makeUser: mkUser, befriend, sleep, post } = require('./users')
const BASE = process.env.TEST_API || 'http://localhost:5055'

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const uid = 's' + Date.now().toString(36)
const makeUser = (name) => mkUser(name, uid)
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(BASE, { transports: ['websocket'], auth: { token, client: 'v2' }, forceNew: true, reconnection: false })
  s.events = []
  s.onAny((ev, data) => s.events.push({ ev, data }))
  s.on('connect', () => resolve(s))
  s.on('connect_error', reject)
})
const call = (s, ev, payload) => new Promise((r) => s.emit(ev, payload, r))
const waitFor = async (s, ev, pred = () => true, ms = 3000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const hit = s.events.find((e) => e.ev === ev && pred(e.data))
    if (hit) return hit.data
    await sleep(50)
  }
  return null
}
const update = (token, body) => post('/api/updateuser', body, token)

;(async () => {
  const A = await makeUser('Alice'), B = await makeUser('Bob'), C = await makeUser('Carol'), D = await makeUser('Dave')
  await befriend(A, B, C) // D is a stranger
  const a = await connect(A.token), b = await connect(B.token), c = await connect(C.token), d = await connect(D.token)
  await sleep(300)

  check('empty text status rejected', !(await call(a, 'status-post', { kind: 'text', text: '   ' })).ok)
  check('media status must be a Cloudinary URL', !(await call(a, 'status-post', { kind: 'image', mediaUrl: 'https://evil.example.com/x.jpg' })).ok)
  b.events = []
  const s1 = await call(a, 'status-post', { kind: 'text', text: 'Good morning ☀️', background: '#7e57c2', font: 2 })
  check('post a text status', s1.ok && s1.status.text === 'Good morning ☀️' && s1.status.background === '#7e57c2' && s1.status.font === 2)
  check('expires after 24 hours', Math.abs(new Date(s1.status.expiresAt) - Date.now() - 24 * 3600e3) < 60e3)
  check('contacts are told to refresh', !!(await waitFor(b, 'status-changed', (x) => x.userId === A.id)))
  const s2 = await call(a, 'status-post', { kind: 'image', mediaUrl: 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg', caption: 'Beach' })
  check('post a photo status with caption', s2.ok && s2.status.kind === 'image' && s2.status.caption === 'Beach')

  const mine = await call(a, 'status-list')
  check('my updates listed, oldest first', mine.ok && mine.mine.length === 2 && mine.mine[0]._id === s1.status._id && mine.mine[0].viewCount === 0)
  const bl = await call(b, 'status-list')
  const fromA = bl.updates.find((u) => u.user._id === A.id)
  check('contact sees the updates, unviewed', fromA && fromA.statuses.length === 2 && !fromA.allViewed)
  const dl = await call(d, 'status-list')
  check("stranger doesn't see them", !dl.updates.some((u) => u.user._id === A.id))
  check("stranger can't view by id", !(await call(d, 'status-view', { statusId: s1.status._id })).ok)

  a.events = []
  check('view a status', (await call(b, 'status-view', { statusId: s1.status._id })).ok)
  check('owner is told about the view', !!(await waitFor(a, 'status-viewed', (x) => x.statusId === s1.status._id)))
  await call(b, 'status-view', { statusId: s1.status._id })
  const viewers = await call(a, 'status-viewers', { statusId: s1.status._id })
  check('viewers list (once per person)', viewers.ok && viewers.viewers.length === 1 && viewers.viewers[0]._id === B.id)
  check("only the owner sees viewers", !(await call(b, 'status-viewers', { statusId: s1.status._id })).ok)

  // read receipts off: counts as seen for Carol, but Alice doesn't learn it
  await update(C.token, { privacy: { readReceipts: false } })
  await call(c, 'status-view', { statusId: s1.status._id })
  const v2 = await call(a, 'status-viewers', { statusId: s1.status._id })
  check('viewers with read receipts off stay hidden', v2.viewers.length === 1)
  const cl = await call(c, 'status-list')
  check('…but it is marked seen for them', cl.updates.find((u) => u.user._id === A.id).statuses.find((s) => s._id === s1.status._id).viewed)

  // reply to a status: arrives as a 1:1 message quoting it
  const reply = await call(b, 'send-message', { receiver: A.id, text: 'Morning!', statusId: s1.status._id })
  check('reply to a status', reply.ok && reply.message.statusReply?.text === 'Good morning ☀️' && reply.message.statusReply.kind === 'text')
  check("stranger can't reply to a status they can't see", !(await call(d, 'send-message', { receiver: A.id, text: 'hi', statusId: s1.status._id })).ok)

  // privacy: my contacts except Bob (applies to new updates only)
  check('invalid status privacy rejected', (await update(A.token, { privacy: { status: 'everyone' } })).status === 400)
  await update(A.token, { privacy: { status: 'except', statusExcept: [B.id] } })
  const s3 = await call(a, 'status-post', { kind: 'text', text: 'Not for Bob' })
  const bl2 = await call(b, 'status-list')
  check('"My contacts except" hides new updates', !bl2.updates.find((u) => u.user._id === A.id).statuses.some((s) => s._id === s3.status._id))
  check('older updates stay visible', bl2.updates.find((u) => u.user._id === A.id).statuses.some((s) => s._id === s1.status._id))
  await update(A.token, { privacy: { status: 'only', statusOnly: [C.id] } })
  const s4 = await call(a, 'status-post', { kind: 'text', text: 'Only Carol' })
  check('"Only share with" works', (await call(c, 'status-list')).updates.find((u) => u.user._id === A.id).statuses.some((s) => s._id === s4.status._id) &&
    !(await call(b, 'status-list')).updates.find((u) => u.user._id === A.id).statuses.some((s) => s._id === s4.status._id))

  // mute
  await call(b, 'status-mute', { userId: A.id, mute: true })
  check('mute someone\'s updates', (await call(b, 'status-list')).updates.find((u) => u.user._id === A.id).muted)

  // blocking hides statuses both ways
  await call(a, 'block-user', { userId: C.id, block: true })
  check('blocked people do not see statuses', !(await call(c, 'status-list')).updates.some((u) => u.user._id === A.id))
  await call(a, 'block-user', { userId: C.id, block: false })

  // delete
  check("can't delete someone else's status", !(await call(b, 'status-delete', { statusId: s1.status._id })).ok)
  check('delete my status', (await call(a, 'status-delete', { statusId: s1.status._id })).ok)
  check('deleted status is gone', !(await call(a, 'status-list')).mine.some((s) => s._id === s1.status._id))

  ;[a, b, c, d].forEach((s) => s.disconnect())
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
