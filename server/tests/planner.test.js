// Chatify extras: scheduled messages, message reminders, private chat notes, silent messages.
const { io } = require('socket.io-client')
const { makeUser: mkUser, befriend, sleep } = require('./users')
const BASE = process.env.TEST_API || 'http://localhost:5055'

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const uid = 'p' + Date.now().toString(36)
const makeUser = (name) => mkUser(name, uid)
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(BASE, { transports: ['websocket'], auth: { token, client: 'v2' }, forceNew: true, reconnection: false })
  s.events = []
  s.onAny((ev, data) => s.events.push({ ev, data: data === undefined ? {} : data }))
  s.on('connect', () => resolve(s))
  s.on('connect_error', reject)
})
const call = (s, ev, payload) => new Promise((r) => s.emit(ev, payload, r))
const waitFor = async (s, ev, pred = () => true, ms = 6000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const hit = s.events.find((e) => e.ev === ev && pred(e.data))
    if (hit) return hit.data
    await sleep(100)
  }
  return null
}
const inSec = (s) => new Date(Date.now() + s * 1000).toISOString()

;(async () => {
  const A = await makeUser('Alice'), B = await makeUser('Bob'), C = await makeUser('Carol')
  await befriend(A, B)
  const a = await connect(A.token), b = await connect(B.token), c = await connect(C.token)
  await sleep(300)

  // ---------- scheduled messages ----------
  check('time must be in the future', !(await call(a, 'schedule-message', { receiver: B.id, text: 'x', sendAt: inSec(-60) })).ok)
  check('empty text refused', !(await call(a, 'schedule-message', { receiver: B.id, text: '  ', sendAt: inSec(30) })).ok)
  check("can't schedule into a group you're not in", !(await call(c, 'schedule-message', { receiver: '0123456789abcdef01234567', text: 'x', sendAt: inSec(30) })).ok)
  const s1 = await call(a, 'schedule-message', { receiver: B.id, text: 'Happy birthday! 🎂', sendAt: inSec(6) })
  check('schedule a message', s1.ok && s1.scheduled.status === 'pending')
  const list = await call(a, 'scheduled-list', { receiver: B.id })
  check('listed as pending', list.scheduled.length === 1)
  check("other people can't cancel it", !(await call(b, 'scheduled-cancel', { id: s1.scheduled._id })).ok)
  b.events = []
  const got = await waitFor(b, 'message-new', (x) => x.message?.text === 'Happy birthday! 🎂', 15000)
  check('sent automatically at the chosen time', !!got && got.peerId === A.id)
  check('arrives once, from the author', got && String(got.message.msgByUserId) === A.id && b.events.filter((e) => e.ev === 'message-new' && e.data.message?.text === 'Happy birthday! 🎂').length === 1)
  check('no longer pending', (await call(a, 'scheduled-list', { receiver: B.id })).scheduled.length === 0)
  const s2 = await call(a, 'schedule-message', { receiver: B.id, text: 'cancel me', sendAt: inSec(600) })
  check('cancel a scheduled message', (await call(a, 'scheduled-cancel', { id: s2.scheduled._id })).ok)
  const s3 = await call(a, 'schedule-message', { receiver: B.id, text: 'send now please', sendAt: inSec(600) })
  b.events = []
  await call(a, 'scheduled-update', { id: s3.scheduled._id, now: true })
  check('send a scheduled message now', !!(await waitFor(b, 'message-new', (x) => x.message?.text === 'send now please', 8000)))
  // blocked by the time it's due → it fails instead of being delivered
  const s4 = await call(c, 'schedule-message', { receiver: B.id, text: 'hi from carol', sendAt: inSec(8) })
  await call(b, 'block-user', { userId: C.id, block: true })
  await call(c, 'block-user', { userId: B.id, block: true })
  let s4list = {}
  for (let i = 0; i < 30; i++) { // wait for the scheduler (1 s in tests, 10 s by default)
    await sleep(1000)
    s4list = await call(c, 'scheduled-list')
    if ((s4list.scheduled || []).some((x) => x._id === s4.scheduled?._id && x.status === 'failed')) break
  }
  check('a scheduled message that can no longer be sent is marked failed', s4.ok && (s4list.scheduled || []).some((x) => x._id === s4.scheduled._id && x.status === 'failed'), JSON.stringify(s4) + JSON.stringify(s4list))

  // ---------- silent messages ----------
  b.events = []
  const silent = await call(a, 'send-message', { receiver: B.id, text: 'shh', silent: true })
  const sgot = await waitFor(b, 'message-new', (x) => x.message?.text === 'shh')
  check('silent message flagged for the receiver', silent.ok && sgot?.message.silent === true)

  // ---------- reminders ----------
  const target = await call(b, 'send-message', { receiver: A.id, text: 'Send me the report by Friday' })
  check("can't set a reminder on someone else's chat", !(await call(c, 'reminder-set', { messageId: target.message._id, remindAt: inSec(30) })).ok)
  const r1 = await call(a, 'reminder-set', { messageId: target.message._id, remindAt: inSec(4) })
  check('remind me about a message', r1.ok && r1.reminder.chatId === B.id && r1.reminder.preview === 'Send me the report by Friday')
  const r1b = await call(a, 'reminder-set', { messageId: target.message._id, remindAt: inSec(3) })
  check('setting it again moves the same reminder', r1b.reminder._id === r1.reminder._id)
  a.events = []
  const due = await waitFor(a, 'reminder-due', (x) => String(x.reminder?._id) === String(r1.reminder._id), 15000)
  check('reminder fires at the chosen time', !!due)
  check('fired reminders stay listed until done', ((await call(a, 'reminder-list')).reminders || []).some((x) => x._id === r1.reminder._id && x.firedAt))
  await call(a, 'reminder-done', { id: r1.reminder._id })
  check('mark reminder done', !((await call(a, 'reminder-list')).reminders || []).some((x) => x._id === r1.reminder._id))

  // ---------- private notes ----------
  const n = await call(a, 'chat-note', { peerId: B.id, note: 'Owes me lunch 🍕' })
  check('save a private note', n.ok && n.note === 'Owes me lunch 🍕')
  check('note comes back with the chat', (await call(a, 'message-page', B.id)).conversation.note === 'Owes me lunch 🍕')
  check('the other person never sees it', (await call(b, 'message-page', A.id)).conversation.note === '')
  check('notes have a length limit', !(await call(a, 'chat-note', { peerId: B.id, note: 'x'.repeat(2001) })).ok)

  ;[a, b, c].forEach((s) => s.disconnect())
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
