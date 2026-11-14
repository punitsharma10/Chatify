// Contacts & privacy: exact-match search, saved names, "My contacts" privacy, group-add privacy, message requests.
const { io } = require('socket.io-client')
const { makeUser: mkUser, post, sleep } = require('./users')
const BASE = process.env.TEST_API || 'http://localhost:5055'

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const uid = 'c' + Date.now().toString(36)
const makeUser = (name) => mkUser(name, uid, 'https://res.cloudinary.com/demo/image/upload/sample.jpg')

const connect = (token) => new Promise((resolve, reject) => {
  const s = io(BASE, { transports: ['websocket'], auth: { token, client: 'v2' }, forceNew: true, reconnection: false })
  s.events = []
  s.onAny((ev, data) => s.events.push({ ev, data }))
  s.on('connect', () => resolve(s))
  s.on('connect_error', reject)
})
const call = (s, ev, payload) => new Promise((r) => s.emit(ev, payload, r))
const waitFor = async (s, ev, pred = () => true, ms = 4000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const hit = s.events.find((e) => e.ev === ev && pred(e.data))
    if (hit) return hit.data
    await sleep(50)
  }
  return null
}
const clear = (...ss) => ss.forEach((s) => (s.events = []))
const lastList = (s) => [...s.events].reverse().find((e) => e.ev === 'conversation')?.data
const search = (token, q) => post('/api/searchuser', { search: q }, token)
const privacy = (token, p) => post('/api/updateuser', { privacy: p }, token)

;(async () => {
  const A = await makeUser('Asha'), F = await makeUser('Farhan'), S = await makeUser('Sara')
  const a = await connect(A.token), f = await connect(F.token), s = await connect(S.token)
  await sleep(300)

  // ---------- 1. nobody can browse who uses Chatify ----------
  const empty = await search(A.token, '')
  check('empty search shows no strangers (new account has no contacts)', empty.status === 200 && empty.body.data.length === 0)
  check('a name does not find strangers', (await search(A.token, 'Sara')).body.data.length === 0)
  check('part of an email does not find strangers', (await search(A.token, 'sara_' + uid)).body.data.length === 0)
  const exact = await search(A.token, S.email.toUpperCase())
  check('the exact email (any case) finds them', exact.body.data.length === 1 && exact.body.data[0]._id === S.id && !exact.body.data[0].isContact)

  // ---------- 2. contacts ----------
  check('add contact with a custom name', (await call(a, 'add-contact', { userId: F.id, name: 'Farhan School' })).ok)
  check('my other tabs learn about it', !!(await waitFor(a, 'contacts-updated', (d) => d.contacts.some((c) => c.userId === F.id && c.name === 'Farhan School'))))
  const mine = await search(A.token, '')
  check('empty search now lists my contacts only', mine.body.data.length === 1 && mine.body.data[0]._id === F.id && mine.body.data[0].isContact)
  check('contacts show under the name I saved', mine.body.data[0].name === 'Farhan School' && mine.body.data[0].profileName === 'Farhan')
  check('contacts can be searched by my saved name', (await search(A.token, 'school')).body.data.length === 1)
  check('cannot add yourself', !(await call(a, 'add-contact', { userId: A.id })).ok)
  check('saved name max 50 characters', !(await call(a, 'add-contact', { userId: F.id, name: 'x'.repeat(51) })).ok)

  // ---------- 3. "My contacts" privacy ----------
  await privacy(F.token, { profilePhoto: 'contacts', about: 'contacts', lastSeen: 'contacts', online: 'contacts' })
  await sleep(300)
  // Farhan saved nobody: Asha (not in Farhan's contacts) can't see his photo
  let seen = await call(a, 'get-peer', F.id)
  check('photo hidden from people the owner has not saved', seen.ok && seen.peer.profile_pic === '' && seen.peer.about === '')
  check('online hidden from people the owner has not saved', !seen.peer.online)
  await call(f, 'add-contact', { userId: A.id })
  await sleep(300)
  seen = await call(a, 'get-peer', F.id)
  check('photo + about visible once the owner saves you', seen.peer.profile_pic !== '' && seen.peer.about !== '')
  check('online visible once the owner saves you', seen.peer.online === true)
  const sSees = await call(s, 'get-peer', F.id)
  check('still hidden from others', sSees.peer.profile_pic === '' && !sSees.peer.online)

  // ---------- 3b. who can add me to groups ----------
  await privacy(S.token, { groups: 'contacts' })
  const g1 = await call(a, 'create-group', { name: 'Only Sara', memberIds: [S.id] })
  check('cannot add someone whose privacy allows contacts only', !g1.ok && /privacy/.test(g1.error), JSON.stringify(g1))
  const g2 = await call(a, 'create-group', { name: 'Mixed', memberIds: [S.id, F.id] })
  check('the others are added, she is skipped and reported', g2.ok && g2.skipped.length === 1)
  await call(s, 'add-contact', { userId: A.id })
  const g3 = await call(a, 'group-add-members', { groupId: g2.groupId, userIds: [S.id] })
  check('once she saves you, you can add her', g3.ok && g3.added === 1 && g3.skipped.length === 0)
  check('invalid groups setting is rejected', (await privacy(S.token, { groups: 'nobody' })).status === 400)

  // ---------- 4. message requests ----------
  const R = await makeUser('Ravi')
  const r = await connect(R.token)
  clear(s)
  // Sara doesn't have Ravi saved -> Ravi's first message is a request for her
  const first = await call(r, 'send-message', { receiver: S.id, text: 'Hi, I got your number from the class group' })
  check('stranger can send a first message', first.ok)
  const incoming = await waitFor(s, 'message-new', (d) => d.peerId === R.id)
  check('it arrives flagged as a request', incoming && incoming.request === true)
  await call(s, 'sidebar')
  const list = await waitFor(s, 'conversation', (d) => d.some((c) => String(c.userDetails._id) === R.id))
  const row = list && list.find((c) => String(c.userDetails._id) === R.id)
  check('chat list marks it as a request', row && row.request === true)
  check('stranger shows by number / profile name, not as a contact', row && !row.userDetails.isContact)
  const page = await call(s, 'message-page', R.id)
  check('opening it says it is a request', page.ok && page.conversation.request === true)
  clear(r)
  await call(s, 'seen', R.id)
  check('reading a request sends no blue ticks', !(await waitFor(r, 'messages-status', (d) => d.seen, 800)))
  check('sender\'s own chat is not a request for him', (await call(r, 'message-page', S.id)).conversation.request === false)

  check('accept the request', (await call(s, 'chat-action', { peerId: R.id, action: 'accept' })).ok)
  check('accepting sends the blue ticks', !!(await waitFor(r, 'messages-status', (d) => d.seen && d.ids.includes(first.message._id))))
  check('no longer a request', (await call(s, 'message-page', R.id)).conversation.request === false)

  // replying accepts too
  const T = await makeUser('Tina')
  const t = await connect(T.token)
  await call(t, 'send-message', { receiver: F.id, text: 'hello' })
  check('request for Farhan', (await call(f, 'message-page', T.id)).conversation.request === true)
  await call(f, 'send-message', { receiver: T.id, text: 'hi, who is this?' })
  check('replying accepts the request', (await call(f, 'message-page', T.id)).conversation.request === false)

  // saving the person accepts too
  const U = await makeUser('Uma')
  const u = await connect(U.token)
  await call(u, 'send-message', { receiver: A.id, text: 'hey' })
  check('request for Asha', (await call(a, 'message-page', U.id)).conversation.request === true)
  await call(a, 'add-contact', { userId: U.id })
  check('saving the contact accepts the request', (await call(a, 'message-page', U.id)).conversation.request === false)

  // messaging a contact is never a request; Farhan saved Asha
  const toContact = await call(a, 'send-message', { receiver: F.id, text: 'hi from a saved contact' })
  check('first message to someone who saved you is not a request', toContact.ok && (await call(f, 'message-page', A.id)).conversation.request === false)

  // ---------- remove ----------
  check('remove contact', (await call(a, 'remove-contact', { userId: U.id })).ok)
  const after = await search(A.token, '')
  check('removed contact no longer listed', !after.body.data.some((x) => x._id === U.id))

  ;[a, f, s, r, t, u].forEach((x) => x.disconnect())
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error('TEST CRASH', e); console.log(results.join('\n')); process.exit(2) })
