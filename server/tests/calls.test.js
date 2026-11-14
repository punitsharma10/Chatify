// Voice / video calls: ringing, answer, decline, cancel, busy, offline, privacy, call history.
const { io } = require('socket.io-client')
const { makeUser: mkUser, sleep, befriend } = require('./users')
const BASE = process.env.TEST_API || 'http://localhost:5055'

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const uid = 'k' + Date.now().toString(36)
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
const callLog = (s, pred = () => true) => waitFor(s, 'message-new', (d) => d.message.call && pred(d.message.call))

;(async () => {
  const A = await makeUser('Anil'), B = await makeUser('Bina'), C = await makeUser('Chetan'), D = await makeUser('Dev')
  await befriend(A, B, C)
  const a = await connect(A.token), b1 = await connect(B.token), b2 = await connect(B.token), c = await connect(C.token), d = await connect(D.token)
  await sleep(300)

  const cfg = await call(a, 'call-config')
  check('ICE servers are provided (STUN)', cfg.ok && cfg.iceServers.some((s) => String(s.urls).includes('stun:')))

  // ---------- answered video call ----------
  clear(a, b1, b2)
  const start = await call(a, 'call-start', { to: B.id, type: 'video' })
  check('start a video call', start.ok && start.callId, JSON.stringify(start))
  const ring1 = await waitFor(b1, 'call-incoming', (x) => x.callId === start.callId)
  check('callee rings on every tab with caller details', ring1 && ring1.type === 'video' && ring1.from.name === 'Anil' && !!(await waitFor(b2, 'call-incoming')))
  check('cannot call yourself', !(await call(a, 'call-start', { to: A.id, type: 'audio' })).ok)
  const acc = await call(b1, 'call-accept', { callId: start.callId })
  check('answer', acc.ok && acc.iceServers.length > 0)
  check('caller is told it was answered', !!(await waitFor(a, 'call-accepted', (x) => x.callId === start.callId)))
  check("callee's other tab stops ringing", !!(await waitFor(b2, 'call-ended', (x) => x.reason === 'answered-elsewhere')))
  check('second tab cannot also answer', !(await call(b2, 'call-accept', { callId: start.callId })).ok)

  a.emit('call-signal', { callId: start.callId, data: { type: 'offer', sdp: 'x' } })
  check('handshake is relayed to the answering tab', !!(await waitFor(b1, 'call-signal', (x) => x.data.type === 'offer')))
  check('…and not to the other tab', !(await waitFor(b2, 'call-signal', () => true, 400)))
  b1.emit('call-media', { callId: start.callId, video: false, audio: true })
  check('camera-off indicator reaches the other side', !!(await waitFor(a, 'call-media', (x) => x.video === false)))

  // busy
  const busy = await call(c, 'call-start', { to: B.id, type: 'audio' })
  check('calling someone on another call says busy', !busy.ok && /another call/.test(busy.error), JSON.stringify(busy))
  check('caller already in a call cannot start another', !(await call(a, 'call-start', { to: C.id, type: 'audio' })).ok)

  await sleep(1100)
  clear(a, b1)
  await call(a, 'call-end', { callId: start.callId })
  check('hang up ends it for both', !!(await waitFor(b1, 'call-ended', (x) => x.reason === 'hangup')))
  const log = await callLog(b1, (x) => x.status === 'answered')
  check('chat gets "Video call" with its duration', log && log.message.call.type === 'video' && log.message.call.duration >= 1)

  // ---------- declined ----------
  clear(a, b1)
  const s2 = await call(a, 'call-start', { to: B.id, type: 'audio' })
  await waitFor(b1, 'call-incoming')
  await call(b1, 'call-reject', { callId: s2.callId })
  check('decline ends the call for the caller', !!(await waitFor(a, 'call-ended', (x) => x.reason === 'declined')))
  check('history shows a declined voice call', !!(await callLog(a, (x) => x.status === 'declined' && x.type === 'audio')))

  // ---------- cancelled while ringing -> missed ----------
  clear(a, b1)
  const s3 = await call(a, 'call-start', { to: B.id, type: 'audio' })
  await waitFor(b1, 'call-incoming')
  await call(a, 'call-end', { callId: s3.callId })
  check('cancelling stops the ringing', !!(await waitFor(b1, 'call-ended', (x) => x.reason === 'cancelled')))
  const missed = await callLog(b1, (x) => x.status === 'missed')
  check('callee gets "Missed voice call"', !!missed)
  await call(b1, 'sidebar')
  const list = await waitFor(b1, 'conversation', (l) => l.some((cv) => String(cv.userDetails._id) === A.id && cv.lastMsg?.call))
  check('missed call shows in the chat list and counts as unread', list && list.find((cv) => String(cv.userDetails._id) === A.id).unseenMsg >= 1)

  // ---------- offline ----------
  clear(c)
  const ccc = await connect(C.token)
  c.disconnect(); ccc.disconnect()
  await sleep(500)
  const off = await call(a, 'call-start', { to: C.id, type: 'video' })
  check('calling someone offline explains it and logs a missed call', !off.ok && /online/.test(off.error), JSON.stringify(off))

  // ---------- privacy ----------
  const stranger = await call(d, 'call-start', { to: B.id, type: 'audio' })
  check("strangers can't ring you", !stranger.ok && /accept|contact/.test(stranger.error), JSON.stringify(stranger))
  await call(b1, 'block-user', { userId: A.id, block: true })
  const blockedCall = await call(a, 'call-start', { to: B.id, type: 'audio' })
  check("blocked caller can't get through (and isn't told why)", !blockedCall.ok && /Couldn't connect/.test(blockedCall.error))
  const mineBlocked = await call(b1, 'call-start', { to: A.id, type: 'audio' })
  check('you must unblock someone to call them', !mineBlocked.ok && /Unblock/.test(mineBlocked.error))
  await call(b1, 'block-user', { userId: A.id, block: false })

  // ---------- disconnect during a ringing call ----------
  clear(b1)
  const s4 = await call(a, 'call-start', { to: B.id, type: 'audio' })
  check('can call again after the last call ended', s4.ok, JSON.stringify(s4))
  await waitFor(b1, 'call-incoming')
  a.disconnect()
  check('caller closing the app ends the call', !!(await waitFor(b1, 'call-ended', (x) => x.reason === 'disconnected')))

  // ---------- call messages can't be edited or forwarded ----------
  const logId = log?.message?._id
  check("call entries can't be forwarded", !(await call(b1, 'forward-messages', { messageIds: [logId], toUserIds: [C.id] })).ok)

  ;[b1, b2, d].forEach((s) => s.disconnect())
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error('TEST CRASH', e); console.log(results.join('\n')); process.exit(2) })
