// Stickers and voice messages.
const { io } = require('socket.io-client')
const { makeUser: mkUser, sleep, befriend } = require('./users')
const BASE = process.env.TEST_API || 'http://localhost:5055'

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const uid = 'm' + Date.now().toString(36)
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

const NOTO = 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f602/512.webp'
const MINE = 'https://res.cloudinary.com/demo/image/upload/my-sticker.webp'
const VOICE = 'https://res.cloudinary.com/demo/video/upload/voice.webm'

;(async () => {
  const A = await makeUser('Ankit'), B = await makeUser('Bela'), C = await makeUser('Charu')
  await befriend(A, B, C)
  const a = await connect(A.token), b = await connect(B.token)
  await sleep(300)

  // ---------- stickers ----------
  const st = await call(a, 'send-message', { receiver: B.id, stickerUrl: NOTO, text: 'ignored caption' })
  check('send an animated sticker', st.ok && st.message.stickerUrl === NOTO && st.message.text === '', JSON.stringify(st))
  check('receiver gets the sticker', !!(await waitFor(b, 'message-new', (d) => d.message.stickerUrl === NOTO)))
  check('send your own sticker (Cloudinary)', (await call(a, 'send-message', { receiver: B.id, stickerUrl: MINE })).ok)
  check('stickers from other websites are refused', !(await call(a, 'send-message', { receiver: B.id, stickerUrl: 'https://evil.example.com/x.webp' })).ok)
  check('tampered Noto address is refused', !(await call(a, 'send-message', { receiver: B.id, stickerUrl: NOTO + '?x=1' })).ok)
  check("stickers can't be edited", !(await call(a, 'edit-message', { messageId: st.message._id, text: 'hi' })).ok)

  const rep = await call(b, 'send-message', { receiver: A.id, text: 'haha', replyTo: st.message._id })
  check('reply to a sticker shows it in the quote', rep.ok && rep.message.replyTo.stickerUrl === NOTO)

  // ---------- voice ----------
  const wave = Array.from({ length: 80 }, (_, i) => (i % 2 ? 1.7 : -0.2))
  const v = await call(a, 'send-message', { receiver: B.id, audioUrl: VOICE, audioDuration: 7.26, audioWaveform: wave, text: 'x' })
  check('send a voice message', v.ok && v.message.audioUrl === VOICE && v.message.audioDuration === 7.3 && v.message.text === '', JSON.stringify(v))
  check('waveform limited to 64 bars between 0 and 1', v.message.audioWaveform.length === 64 && v.message.audioWaveform.every((x) => x >= 0 && x <= 1))
  check('voice message needs a duration', !(await call(a, 'send-message', { receiver: B.id, audioUrl: VOICE })).ok)
  check('voice longer than 1 hour refused', !(await call(a, 'send-message', { receiver: B.id, audioUrl: VOICE, audioDuration: 4000 })).ok)
  check('audio from other websites refused', !(await call(a, 'send-message', { receiver: B.id, audioUrl: 'https://evil.example.com/a.mp3', audioDuration: 3 })).ok)
  check("voice messages can't be edited", !(await call(a, 'edit-message', { messageId: v.message._id, text: 'hi' })).ok)

  // ---------- forward ----------
  const fwd = await call(a, 'forward-messages', { messageIds: [st.message._id, v.message._id], toUserIds: [C.id] })
  check('forward a sticker and a voice message', fwd.ok && fwd.sent === 2)
  const c = await connect(C.token)
  const page = await call(c, 'message-page', A.id)
  check('forwarded copies keep the sticker / audio', page.ok && page.messages.some((m) => m.stickerUrl === NOTO && m.forwarded) && page.messages.some((m) => m.audioUrl === VOICE && m.audioDuration === 7.3 && m.audioWaveform.length === 64))

  // ---------- delete for everyone ----------
  await call(a, 'delete-messages', { messageIds: [v.message._id], scope: 'everyone' })
  const after = await call(b, 'message-page', A.id)
  const gone = after.messages.find((m) => m._id === v.message._id)
  check('delete for everyone removes the audio', gone && gone.deletedForEveryone && !gone.audioUrl && !gone.audioWaveform)

  ;[a, b, c].forEach((s) => s.disconnect())
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error('TEST CRASH', e); console.log(results.join('\n')); process.exit(2) })
