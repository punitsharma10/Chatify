// Group calls: ringing members, joining, the 4-person limit, signalling, leaving, call history.
const { io } = require('socket.io-client')
const { makeUser: mkUser, sleep, befriend } = require('./users')
const BASE = process.env.TEST_API || 'http://localhost:5055'

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const uid = 'q' + Date.now().toString(36)
const makeUser = (name) => mkUser(name, uid)

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

;(async () => {
  const A = await makeUser('Amit'), B = await makeUser('Bhavna'), C = await makeUser('Chirag'), E = await makeUser('Esha'), F = await makeUser('Farah'), X = await makeUser('Xavier')
  await befriend(A, B, C, E, F)
  const a = await connect(A.token), b = await connect(B.token), c = await connect(C.token), e = await connect(E.token), f = await connect(F.token), x = await connect(X.token)
  const all = [a, b, c, e, f]
  await sleep(300)

  const g = await call(a, 'create-group', { name: 'Cousins', memberIds: [B.id, C.id, E.id, F.id] })
  const G = g.groupId
  check('group ready', g.ok)

  // ---------- start ----------
  clear(...all, x)
  const start = await call(a, 'group-call-start', { groupId: G, type: 'video' })
  check('start a group video call', start.ok && start.callId && start.participants.length === 0, JSON.stringify(start))
  const CALL = start.callId
  const ring = await waitFor(b, 'group-call-incoming', (d) => d.callId === CALL)
  check('members ring with group name and caller', ring && ring.group.name === 'Cousins' && ring.from.name === 'Amit' && ring.type === 'video')
  check('every online member rings', !!(await waitFor(c, 'group-call-incoming')) && !!(await waitFor(e, 'group-call-incoming')) && !!(await waitFor(f, 'group-call-incoming')))
  check('non-members do not ring', !(await waitFor(x, 'group-call-incoming', () => true, 500)))
  check('members see the call is running (Join button)', !!(await waitFor(f, 'group-call-state', (d) => d.callId === CALL && d.participants.includes(A.id))))
  check('non-member cannot start a call in the group', !(await call(x, 'group-call-start', { groupId: G, type: 'audio' })).ok)
  check('non-member cannot join', !(await call(x, 'group-call-join', { callId: CALL })).ok)
  const status = await call(f, 'group-call-status', { groupId: G })
  check('opening the chat shows the running call', status.ok && status.call && status.call.callId === CALL)

  // ---------- join ----------
  const jb = await call(b, 'group-call-join', { callId: CALL })
  check('Bhavna joins and gets who is already there', jb.ok && jb.participants.length === 1 && jb.participants[0]._id === A.id && jb.iceServers.length > 0)
  check('Amit is told Bhavna joined', !!(await waitFor(a, 'group-call-joined', (d) => d.user._id === B.id && d.user.name === 'Bhavna')))
  b.emit('group-call-signal', { callId: CALL, to: A.id, data: { type: 'offer', sdp: 'x' } })
  check('handshake goes to the right person', !!(await waitFor(a, 'group-call-signal', (d) => d.from === B.id && d.data.type === 'offer')))
  check('…and nobody else', !(await waitFor(c, 'group-call-signal', () => true, 400)))
  check('joining twice is refused', !(await call(b, 'group-call-join', { callId: CALL })).ok)

  // starting again while a call runs just joins it
  const jc = await call(c, 'group-call-start', { groupId: G, type: 'audio' })
  check('"call" in a group with a running call joins it', jc.ok && jc.joinedExisting && jc.callId === CALL && jc.participants.length === 2 && jc.type === 'video')
  const je = await call(e, 'group-call-join', { callId: CALL })
  check('fourth person joins', je.ok && je.participants.length === 3)
  const full = await call(f, 'group-call-join', { callId: CALL })
  check('fifth person is told the call is full', !full.ok && /full/.test(full.error))

  // busy for 1:1 calls
  const busy = await call(f, 'call-start', { to: A.id, type: 'audio' })
  check('people in a group call are busy for 1:1 calls', !busy.ok && /another call/.test(busy.error))

  clear(f)
  await call(f, 'group-call-decline', { callId: CALL })
  check('declining stops ringing on all my tabs', !!(await waitFor(f, 'group-call-dismiss', (d) => d.callId === CALL)))

  e.emit('group-call-media', { callId: CALL, video: false, audio: true })
  check('camera-off indicator reaches the others', !!(await waitFor(a, 'group-call-media', (d) => d.userId === E.id && d.video === false)))

  // ---------- leave ----------
  clear(...all)
  await call(b, 'group-call-leave', { callId: CALL })
  check('others are told who left', !!(await waitFor(a, 'group-call-left', (d) => d.userId === B.id)) && !!(await waitFor(c, 'group-call-left', (d) => d.userId === B.id)))
  check('there is room again for Farah', (await call(f, 'group-call-join', { callId: CALL })).ok)

  await sleep(1100)
  clear(...all)
  await call(a, 'group-call-leave', { callId: CALL })
  await call(c, 'group-call-leave', { callId: CALL })
  await call(e, 'group-call-leave', { callId: CALL })
  check('call ends when only one person is left', !!(await waitFor(f, 'group-call-ended', (d) => d.callId === CALL)))
  check('everyone sees the Join button disappear', !!(await waitFor(b, 'group-call-state', (d) => d.groupId === G && d.callId === null)))
  const log = await waitFor(b, 'message-new', (d) => d.peerId === G && d.message.call)
  check('group chat gets the call history', log && log.message.call.group && log.message.call.status === 'answered' && log.message.call.participants === 5 && log.message.call.duration >= 1, JSON.stringify(log?.message?.call))

  // ---------- nobody joins ----------
  clear(...all)
  const lonely = await call(a, 'group-call-start', { groupId: G, type: 'audio' })
  await waitFor(b, 'group-call-incoming')
  await call(a, 'group-call-leave', { callId: lonely.callId })
  check('caller hanging up stops the ringing', !!(await waitFor(b, 'group-call-ended', (d) => d.callId === lonely.callId)))
  const missed = await waitFor(b, 'message-new', (d) => d.peerId === G && d.message.call)
  check('…and logs a missed group call', missed && missed.message.call.status === 'missed' && missed.message.call.participants === 1)

  // ---------- disconnect ----------
  const s2 = await call(a, 'group-call-start', { groupId: G, type: 'audio' })
  await call(b, 'group-call-join', { callId: s2.callId })
  await call(c, 'group-call-join', { callId: s2.callId })
  clear(...all)
  b.disconnect()
  check('closing the app leaves the call', !!(await waitFor(a, 'group-call-left', (d) => d.userId === B.id)))
  await call(c, 'group-call-leave', { callId: s2.callId })
  check('…and the call ends when one person is left', !!(await waitFor(a, 'group-call-ended', (d) => d.callId === s2.callId)))

  ;[a, c, e, f, x].forEach((s) => s.disconnect())
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((err) => { console.error('TEST CRASH', err); console.log(results.join('\n')); process.exit(2) })
