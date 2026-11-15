// 3-in-1: one story shared to Chats / Pixify / Connectify, and the account-wide @username.
const { io } = require('socket.io-client')
const { makeUser: mkUser, befriend, sleep, post } = require('./users')
const BASE = process.env.TEST_API || 'http://localhost:5055'

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const uid = 'x' + Date.now().toString(36)
const makeUser = (name) => mkUser(name, uid)
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(BASE, { transports: ['websocket'], auth: { token, client: 'v2' }, forceNew: true, reconnection: false })
  s.events = []
  s.onAny((ev, data) => s.events.push({ ev, data }))
  s.on('connect', () => resolve(s))
  s.on('connect_error', reject)
})
const call = (s, ev, payload) => new Promise((r) => s.emit(ev, payload, r))
const ids = (list, ownerId) => (list.updates.find((u) => u.user._id === ownerId)?.statuses || []).map((s) => s._id)

;(async () => {
  const A = await makeUser('Ann'), B = await makeUser('Ben'), C = await makeUser('Cat'), D = await makeUser('Dan')
  await befriend(A, B, C) // D is a stranger
  const a = await connect(A.token), b = await connect(B.token), c = await connect(C.token), d = await connect(D.token)
  await sleep(300)

  /* ---------- stories across apps ---------- */
  check('invalid app list rejected', !(await call(a, 'status-post', { kind: 'text', text: 'x', apps: ['chats', 'instagram'] })).ok)
  check('empty app list rejected', !(await call(a, 'status-post', { kind: 'text', text: 'x', apps: [] })).ok)

  const chatsOnly = await call(a, 'status-post', { kind: 'text', text: 'Chats only' })
  check('no apps given = Chats only (older clients)', chatsOnly.ok && JSON.stringify(chatsOnly.status.apps) === '["chats"]')

  const all = await call(a, 'status-post', { kind: 'text', text: 'Everywhere', apps: ['connectify', 'chats', 'pixify'] })
  check('shared to all three apps (stored in a fixed order)', all.ok && JSON.stringify(all.status.apps) === '["chats","pixify","connectify"]')

  const pxOnly = await call(a, 'status-post', { kind: 'image', mediaUrl: 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg', apps: ['pixify'] })
  check('Pixify-only photo story', pxOnly.ok && JSON.stringify(pxOnly.status.apps) === '["pixify"]')

  const bChats = await call(b, 'status-list')
  check('Chats lists Chats stories (default app)', ids(bChats, A.id).includes(chatsOnly.status._id) && ids(bChats, A.id).includes(all.status._id))
  check('Chats hides Pixify-only stories', !ids(bChats, A.id).includes(pxOnly.status._id))

  const bPx = await call(b, 'status-list', { app: 'pixify' })
  check('Pixify lists its stories', ids(bPx, A.id).includes(pxOnly.status._id) && ids(bPx, A.id).includes(all.status._id))
  check('Pixify hides Chats-only stories', !ids(bPx, A.id).includes(chatsOnly.status._id))

  const bCx = await call(b, 'status-list', { app: 'connectify' })
  check('Connectify lists only stories shared to it', ids(bCx, A.id).length === 1 && ids(bCx, A.id)[0] === all.status._id)

  const mineCx = await call(a, 'status-list', { app: 'connectify' })
  check('my stories are listed per app', mineCx.mine.length === 1 && mineCx.mine[0]._id === all.status._id)
  check('unknown app rejected', !(await call(a, 'status-list', { app: 'facebook' })).ok)

  check("stranger doesn't see Pixify stories", !ids(await call(d, 'status-list', { app: 'pixify' }), A.id).length)
  check("stranger can't view a Pixify story by id", !(await call(d, 'status-view', { statusId: pxOnly.status._id })).ok)

  // viewed once, everywhere: one record behind all three apps
  check('view a story in Pixify', (await call(b, 'status-view', { statusId: all.status._id })).ok)
  const bChats2 = await call(b, 'status-list')
  check('…it shows as seen in Chats too', bChats2.updates.find((u) => u.user._id === A.id).statuses.find((s) => s._id === all.status._id).viewed)
  const viewers = await call(a, 'status-viewers', { statusId: all.status._id })
  check('owner sees one viewer', viewers.ok && viewers.viewers.length === 1)

  // reply from Pixify arrives in Chats
  const reply = await call(b, 'send-message', { receiver: A.id, text: 'Nice pic!', statusId: pxOnly.status._id })
  check('reply to a Pixify story goes to Chats', reply.ok && reply.message.statusReply?.kind === 'image')

  // Chats status privacy ("only share with") doesn't limit Pixify / Connectify
  await post('/api/updateuser', { privacy: { status: 'only', statusOnly: [C.id] } }, A.token)
  const both = await call(a, 'status-post', { kind: 'text', text: 'Privacy test', apps: ['chats', 'pixify'] })
  check('"Only share with" applies to Chats', !ids(await call(b, 'status-list'), A.id).includes(both.status._id))
  check('…but Pixify shows it to contacts', ids(await call(b, 'status-list', { app: 'pixify' }), A.id).includes(both.status._id))
  await post('/api/updateuser', { privacy: { status: 'contacts' } }, A.token)

  // stories shared outside Chats can't be end-to-end encrypted
  const enc = await call(a, 'status-post', { kind: 'text', apps: ['chats', 'pixify'], e2ee: { v: 1, to: A.id, from: 'x', iv: 'x', ct: 'x', keys: {} } })
  check('encrypted story to Pixify rejected', !enc.ok && /encrypted/i.test(enc.error))

  // blocking hides Pixify stories too
  await call(a, 'block-user', { userId: B.id, block: true })
  check('blocked people do not see Pixify stories', !ids(await call(b, 'status-list', { app: 'pixify' }), A.id).length)
  await call(a, 'block-user', { userId: B.id, block: false })

  // delete once = gone from every app
  check('delete a shared story', (await call(a, 'status-delete', { statusId: all.status._id })).ok)
  check('…gone from Chats', !ids(await call(c, 'status-list'), A.id).includes(all.status._id))
  check('…gone from Connectify', !ids(await call(c, 'status-list', { app: 'connectify' }), A.id).includes(all.status._id))

  /* ---------- @username ---------- */
  const handle = ('ann.' + uid).slice(0, 30)
  const chk = async (username, token) => (await post('/api/username/check', { username }, token)).body
  check('bad username rejected', (await chk('a')).available === false && (await chk('a..b')).available === false && (await chk('.ann')).available === false && (await chk('12345')).available === false)
  check('reserved username rejected', (await chk('pixify')).available === false)
  check('free username available', (await chk(handle)).available === true)
  const set = await post('/api/updateuser', { username: '@' + handle.toUpperCase() }, A.token)
  check('set my username (lowercased, @ removed)', set.status === 200 && set.body.data.username === handle)
  check('my own username counts as available for me', (await chk(handle, A.token)).available === true)
  const taken = await chk(handle, B.token)
  check('taken for others, with suggestions', taken.available === false && Array.isArray(taken.suggestions) && taken.suggestions.length > 0)
  check("can't take someone's username", (await post('/api/updateuser', { username: handle }, B.token)).status === 400)
  check('invalid username update rejected', (await post('/api/updateuser', { username: 'no spaces' }, B.token)).status === 400)

  const found = await post('/api/searchuser', { search: '@' + handle }, D.token)
  check('exact @username finds someone new', found.body.data.some((u) => u._id === A.id && u.username === handle))
  const partial = await post('/api/searchuser', { search: handle.slice(0, 5) }, D.token)
  check('partial username does not (no browsing)', !partial.body.data.some((u) => u._id === A.id))
  const contactsHit = await post('/api/searchuser', { search: handle.slice(0, 6) }, B.token)
  check('contacts can be filtered by username', contactsHit.body.data.some((u) => u._id === A.id))

  const st = await call(b, 'status-list', { app: 'pixify' })
  check('story owners carry their @username', st.updates.find((u) => u.user._id === A.id)?.user.username === handle)

  ;[a, b, c, d].forEach((s) => s.disconnect())
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
