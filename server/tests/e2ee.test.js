// End-to-end encryption, server side: device key directory, envelope checks, per-viewer key filtering,
// nothing readable stored, edit / delete / forward / polls / view once / statuses / planner / history sync rules.
// Real WebCrypto (Node) builds the envelopes, so these are the same shapes the browser sends.
const { webcrypto : wc } = require('crypto')
const { io } = require('socket.io-client')
const { makeUser : mkUser, befriend, sleep, post } = require('./users')
const BASE = process.env.TEST_API || 'http://localhost:5055'
const subtle = wc.subtle

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const uid = 'e' + Date.now().toString(36)
const makeUser = (name) => mkUser(name, uid)
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(BASE, { transports : ['websocket'], auth : { token, client : 'v2' }, forceNew : true, reconnection : false })
  s.events = []
  s.onAny((ev, data) => s.events.push({ ev, data : data === undefined ? {} : data }))
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

/* ---- minimal device + envelope builder (same format as client/src/helpers/e2ee/crypto.js) ---- */
const b64 = (buf) => Buffer.from(buf).toString('base64')
const device = async (id) => {
  const ecdh = await subtle.generateKey({ name : 'ECDH', namedCurve : 'P-256' }, true, ['deriveBits'])
  const sign = await subtle.generateKey({ name : 'ECDSA', namedCurve : 'P-256' }, true, ['sign', 'verify'])
  return { id, ecdh, sign, ecdhPub : b64(await subtle.exportKey('raw', ecdh.publicKey)), signPub : b64(await subtle.exportKey('raw', sign.publicKey)) }
}
const wrapFor = async (raw, u, d, pub) => {
  const eph = await subtle.generateKey({ name : 'ECDH', namedCurve : 'P-256' }, true, ['deriveBits'])
  const epk = b64(await subtle.exportKey('raw', eph.publicKey))
  const peer = await subtle.importKey('raw', Buffer.from(pub, 'base64'), { name : 'ECDH', namedCurve : 'P-256' }, true, [])
  const bits = await subtle.deriveBits({ name : 'ECDH', public : peer }, eph.privateKey, 256)
  const info = Buffer.from(`chatify-e2ee-v1|wrap|${u}|${d}|${epk}`)
  const ikm = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
  const kek = await subtle.deriveKey({ name : 'HKDF', hash : 'SHA-256', salt : Buffer.from('chatify-e2ee-v1-salt'), info }, ikm, { name : 'AES-GCM', length : 256 }, false, ['encrypt'])
  const iv = wc.getRandomValues(new Uint8Array(12))
  return { u : String(u), d, epk, iv : b64(iv), wk : b64(await subtle.encrypt({ name : 'AES-GCM', iv, additionalData : info }, kek, raw)) }
}
// recipients: [{ u, d, pub }]
const seal = async (body, from, dev, to, recipients) => {
  const raw = wc.getRandomValues(new Uint8Array(32))
  const key = await subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt'])
  const env = { v : 1, from, dev : dev.id, to, cid : 'c' + Math.random().toString(36).slice(2), t : Date.now() }
  const header = JSON.stringify(['chatify-e2ee-v1', env.from, env.dev, env.to, env.cid, env.t])
  const iv = wc.getRandomValues(new Uint8Array(12))
  env.iv = b64(iv)
  env.ct = b64(await subtle.encrypt({ name : 'AES-GCM', iv, additionalData : Buffer.from(header) }, key, Buffer.from(JSON.stringify(body))))
  env.sig = b64(await subtle.sign({ name : 'ECDSA', hash : 'SHA-256' }, dev.sign.privateKey, Buffer.from(`${header}|${env.iv}|${env.ct}`)))
  env.keys = await Promise.all(recipients.map((r) => wrapFor(raw, r.u, r.d, r.pub)))
  return env
}
const reg = (s, d) => call(s, 'e2ee-register', { id : d.id, ecdh : d.ecdhPub, sign : d.signPub, name : 'Test · Node' })

;(async () => {
  const A = await makeUser('Alice'), B = await makeUser('Bob'), C = await makeUser('Carol'), D = await makeUser('Dave')
  await befriend(A, B, C, D)
  const a = await connect(A.token), b = await connect(B.token), c = await connect(C.token), d = await connect(D.token)
  const dA = await device('devA1-' + uid), dB = await device('devB1-' + uid), dC = await device('devC1-' + uid)
  const to = (u, dev) => ({ u : u.id, d : dev.id, pub : dev.ecdhPub })

  // ---------- device directory ----------
  check('invalid device keys refused', !(await call(a, 'e2ee-register', { id : 'short', ecdh : 'x', sign : 'y' })).ok)
  const rA = await reg(a, dA)
  check('register a device (public keys only)', rA.ok && rA.isNew && rA.devices.length === 1 && rA.devices[0].ecdh === dA.ecdhPub)
  check('same device id with other keys refused', (await call(a, 'e2ee-register', { id : dA.id, ecdh : dB.ecdhPub, sign : dB.signPub })).error === 'Device keys mismatch')
  check('reconnecting the same device is not "new"', (await reg(a, dA)).isNew === false)
  await reg(b, dB); await reg(c, dC)
  const dir = await call(d, 'e2ee-devices', { userIds : [A.id, B.id] })
  check('anyone can fetch public keys', dir.ok && dir.users[A.id][0].sign === dA.signPub && dir.users[B.id].length === 1)
  check('directory never contains session ids', !JSON.stringify(dir).includes('"sid"'))
  const chatAB = await call(a, 'e2ee-chat-devices', { receiver : B.id })
  check('chat devices: peer + me, nobody without keys', chatAB.ok && Object.keys(chatAB.users).sort().join() === [A.id, B.id].sort().join() && chatAB.withoutKeys.length === 0)
  const chatAD = await call(a, 'e2ee-chat-devices', { receiver : D.id })
  check('reports a contact who has no keys yet', chatAD.withoutKeys.includes(D.id))

  // ---------- sending ----------
  const SECRET = 'meet at the old bridge'
  const envOk = await seal({ text : SECRET }, A.id, dA, B.id, [to(A, dA), to(B, dB)])
  check('envelope from someone else refused', !(await call(a, 'send-message', { receiver : B.id, e2ee : { ...envOk, from : B.id }, e2eeKind : 'text' })).ok)
  check('envelope addressed to another chat refused', !(await call(a, 'send-message', { receiver : B.id, e2ee : { ...envOk, to : C.id }, e2eeKind : 'text' })).ok)
  check('unknown kind refused', !(await call(a, 'send-message', { receiver : B.id, e2ee : envOk, e2eeKind : 'bogus' })).ok)
  const missing = await seal({ text : 'x' }, A.id, dA, B.id, [to(A, dA)])
  check('missing a recipient device → E2EE_KEYS_CHANGED', (await call(a, 'send-message', { receiver : B.id, e2ee : missing, e2eeKind : 'text' })).error === 'E2EE_KEYS_CHANGED')
  const leak = await seal({ text : 'x' }, A.id, dA, B.id, [to(A, dA), to(B, dB), to(C, dC)])
  check('keys for an outsider refused', !(await call(a, 'send-message', { receiver : B.id, e2ee : leak, e2eeKind : 'text' })).ok)
  b.events = []
  const sent = await call(a, 'send-message', { receiver : B.id, clientId : 'e2e-1', e2ee : envOk, e2eeKind : 'text' })
  check('encrypted message accepted', sent.ok && sent.message.text === '' && !!sent.message.e2ee)
  check('sender gets only their own wrapped keys', sent.message.e2ee.keys.length === 1 && sent.message.e2ee.keys[0].u === A.id)
  const got = await waitFor(b, 'message-new', (x) => x.message?.e2ee)
  check('recipient gets ciphertext + only their own key', !!got && got.message.e2ee.ct === envOk.ct && got.message.e2ee.keys.length === 1 && got.message.e2ee.keys[0].u === B.id)
  check('server never echoes plaintext', !JSON.stringify(got).includes(SECRET))
  check('sidebar preview carries the envelope (decrypted on the device)', !!(await call(b, 'message-page', A.id)).messages.find((m) => m.e2ee))
  check('a third person cannot open the chat', !(await call(c, 'message-page', A.id)).ok || (await call(c, 'message-page', A.id)).messages.length === 0)
  check('search on the server cannot find encrypted text', (await call(b, 'search-messages', { q : 'bridge' })).results.length === 0)
  const id1 = sent.message._id

  // ---------- reply quotes ----------
  const replyEnv = await seal({ text : 'ok' }, B.id, dB, A.id, [to(A, dA), to(B, dB)])
  const rep = await call(b, 'send-message', { receiver : A.id, e2ee : replyEnv, e2eeKind : 'text', replyTo : id1 })
  check('reply quote is an envelope filtered for the viewer', rep.ok && rep.message.replyTo?.e2ee?.keys.length === 1 && rep.message.replyTo.e2ee.keys[0].u === B.id && !rep.message.replyTo.text)

  // ---------- edit ----------
  check('plain-text edit of an encrypted message refused', !(await call(a, 'edit-message', { messageId : id1, text : 'hack' })).ok)
  const editEnv = await seal({ text : 'meet at the new bridge' }, A.id, dA, B.id, [to(A, dA), to(B, dB)])
  check("someone else can't edit it", !(await call(b, 'edit-message', { messageId : id1, e2ee : { ...editEnv, from : B.id }, e2eeKind : 'text' })).ok)
  const ed = await call(a, 'edit-message', { messageId : id1, e2ee : editEnv, e2eeKind : 'text' })
  check('encrypted edit accepted', ed.ok)
  const after = (await call(b, 'message-page', A.id)).messages.find((m) => m._id === id1)
  check('edited envelope delivered with "edited" mark', after.e2ee.ct === editEnv.ct && !!after.editedAt)

  // ---------- forward ----------
  check('server-side forward of encrypted messages refused (device re-encrypts)', !(await call(a, 'forward-messages', { messageIds : [id1], toUserIds : [C.id] })).ok)
  const fwEnv = await seal({ text : 'meet at the new bridge' }, A.id, dA, C.id, [to(A, dA), to(C, dC)])
  const fw = await call(a, 'send-message', { receiver : C.id, e2ee : fwEnv, e2eeKind : 'text', forwarded : true })
  check('device-side forward keeps the Forwarded label', fw.ok && fw.message.forwarded === true)

  // ---------- polls ----------
  const pollEnv = await seal({ poll : { question : 'Pizza?', options : ['Yes', 'No'] } }, A.id, dA, B.id, [to(A, dA), to(B, dB)])
  check('encrypted poll needs option count', !(await call(a, 'send-message', { receiver : B.id, e2ee : pollEnv, e2eeKind : 'poll' })).ok)
  const poll = await call(a, 'send-message', { receiver : B.id, e2ee : await seal({ poll : { question : 'Pizza?', options : ['Yes', 'No'] } }, A.id, dA, B.id, [to(A, dA), to(B, dB)]), e2eeKind : 'poll', pollMeta : { count : 2, multiple : false } })
  check('encrypted poll stored without its text', poll.ok && poll.message.poll.question === '🔒' && poll.message.poll.options.length === 2)
  check('vote by option number', (await call(b, 'poll-vote', { messageId : poll.message._id, options : [1] })).ok)
  check('out-of-range vote refused', !(await call(b, 'poll-vote', { messageId : poll.message._id, options : [2] })).ok)

  // ---------- media / shared ----------
  const img = await call(a, 'send-message', { receiver : B.id, e2ee : await seal({ text : '', media : { kind : 'image', url : 'https://res.cloudinary.com/demo/raw/upload/x.bin', key : 'k', iv : 'i', sha : 's' } }, A.id, dA, B.id, [to(A, dA), to(B, dB)]), e2eeKind : 'image' })
  const shared = await call(b, 'get-shared', { peerId : A.id })
  check('"Media" tab lists encrypted photos', img.ok && shared.media.some((m) => m._id === img.message._id))

  // ---------- view once ----------
  const vo = await call(a, 'send-message', { receiver : B.id, e2ee : await seal({ media : { kind : 'image', url : 'https://res.cloudinary.com/demo/raw/upload/y.bin', key : 'k', iv : 'i', sha : 's' } }, A.id, dA, B.id, [to(A, dA), to(B, dB)]), e2eeKind : 'image', viewOnce : true })
  check('view once envelope withheld from everyone', vo.ok && !vo.message.e2ee && !(await call(b, 'message-page', A.id)).messages.find((m) => m._id === vo.message._id).e2ee)
  const op = await call(b, 'view-once-open', { messageId : vo.message._id })
  check('opening hands out the envelope once', op.ok && op.e2ee?.keys.length === 1 && op.e2ee.keys[0].u === B.id && !(await call(b, 'view-once-open', { messageId : vo.message._id })).ok)
  check('view once only for photos/videos', !(await call(a, 'send-message', { receiver : B.id, e2ee : await seal({ text : 'x' }, A.id, dA, B.id, [to(A, dA), to(B, dB)]), e2eeKind : 'text', viewOnce : true })).ok)

  // ---------- delete for everyone ----------
  check('delete for everyone', (await call(a, 'delete-messages', { messageIds : [id1], scope : 'everyone' })).ok)
  const del = (await call(b, 'message-page', A.id)).messages.find((m) => m._id === id1)
  check('…removes the ciphertext', del.deletedForEveryone && !del.e2ee)

  // ---------- groups ----------
  const g = await call(a, 'create-group', { name : 'Crypto club', memberIds : [B.id, C.id] })
  const gEnv = await seal({ text : 'group secret' }, A.id, dA, g.groupId, [to(A, dA), to(B, dB), to(C, dC)])
  check('group devices = members', Object.keys((await call(a, 'e2ee-chat-devices', { receiver : g.groupId })).users).length === 3)
  check('non-members can\'t list group devices', !(await call(d, 'e2ee-chat-devices', { receiver : g.groupId })).ok)
  const gm = await call(a, 'send-message', { receiver : g.groupId, e2ee : gEnv, e2eeKind : 'text' })
  check('encrypted group message accepted', gm.ok && gm.message.e2ee.keys.length === 1)
  const gNoCarol = await seal({ text : 'x' }, A.id, dA, g.groupId, [to(A, dA), to(B, dB)])
  check('group message missing a member → E2EE_KEYS_CHANGED', (await call(a, 'send-message', { receiver : g.groupId, e2ee : gNoCarol, e2eeKind : 'text' })).error === 'E2EE_KEYS_CHANGED')
  const cPage = await call(c, 'message-page', g.groupId)
  check('each member gets only their own key', cPage.messages.find((m) => m._id === gm.message._id)?.e2ee.keys.every((k) => k.u === C.id))

  // ---------- statuses ----------
  const aud = await call(b, 'status-audience')
  check('status audience = contacts + me, with keys', aud.ok && Object.keys(aud.users).includes(A.id) && Object.keys(aud.users).includes(B.id))
  const stOut = await seal({ text : 'x' }, B.id, dB, B.id, [to(B, dB), { u : '0123456789abcdef01234567', d : 'devZZZZZZZZ', pub : dA.ecdhPub }])
  check('status keys for strangers refused', !(await call(b, 'status-post', { kind : 'text', e2ee : stOut })).ok)
  const stEnv = await seal({ text : 'status secret' }, B.id, dB, B.id, [to(B, dB), to(A, dA), to(C, dC)])
  const st = await call(b, 'status-post', { kind : 'text', e2ee : stEnv, background : '#000000' })
  check('encrypted status posted (no text on the server)', st.ok && st.status.text === '' && !!st.status.e2ee)
  const list = await call(a, 'status-list')
  const seen = list.updates.find((u) => String(u.user._id) === B.id)?.statuses[0]
  check('viewer gets the status with only their own key', !!seen?.e2ee && seen.e2ee.keys.length === 1 && seen.e2ee.keys[0].u === A.id)

  // ---------- planner ----------
  const schEnv = await seal({ text : 'later secret' }, A.id, dA, B.id, [to(A, dA), to(B, dB)])
  const sch = await call(a, 'schedule-message', { receiver : B.id, e2ee : schEnv, e2eeKind : 'text', sendAt : new Date(Date.now() + 6000).toISOString() })
  check('schedule an encrypted message (no text stored)', sch.ok && sch.scheduled.text === '' && sch.scheduled.e2ee.keys.length === 1)
  b.events = []
  const due = await waitFor(b, 'message-new', (x) => x.message?.e2ee?.ct === schEnv.ct, 15000)
  check('scheduler sends the envelope unchanged', !!due)
  const prevEnv = await seal({ preview : 'note to self' }, A.id, dA, A.id, [to(A, dA)])
  const remind = await call(a, 'reminder-set', { messageId : gm.message._id, remindAt : new Date(Date.now() + 3600e3).toISOString(), e2ee : prevEnv })
  check('reminder preview stored encrypted', remind.ok && remind.reminder.preview === '' && !!remind.reminder.e2ee)
  const badPrev = await seal({ preview : 'x' }, A.id, dA, A.id, [to(A, dA), to(B, dB)])
  check('reminder preview only for my own devices', !(await call(a, 'reminder-set', { messageId : gm.message._id, remindAt : new Date(Date.now() + 3600e3).toISOString(), e2ee : badPrev })).ok)

  // ---------- export ----------
  const exp = await call(b, 'export-chat', { peerId : A.id })
  check('export of an encrypted chat returns items for the device to fill in', exp.ok && Array.isArray(exp.items) && exp.items.some((i) => i.e2ee) && !JSON.stringify(exp).includes('bridge'))

  // ---------- second device + history sync ----------
  const login2 = await post('/api/password', { userId : A.id, password : 'secret123' })
  const a2 = await connect(login2.body.token)
  const dA2 = await device('devA2-' + uid)
  a.events = []
  const r2 = await reg(a2, dA2)
  check('second device registered', r2.ok && r2.isNew && r2.devices.filter((x) => !x.removedAt).length === 2)
  const offer = await waitFor(a, 'e2ee-new-device', (x) => x.device?.id === dA2.id)
  check('my other device is told about the new one', !!offer)
  check('new device has no keys for old messages yet', (await call(a2, 'message-page', B.id)).messages.filter((m) => m.e2ee).every((m) => !m.e2ee.keys.some((k) => k.d === dA2.id)))
  const batch = await call(a, 'e2ee-sync-batch', { device : dA2.id })
  check('old device lists messages to re-share (its own key entries only)', batch.ok && batch.items.length > 0 && batch.items.every((i) => i.key.u === A.id && i.key.d === dA.id))
  check("can't sync to another user's device", !(await call(a, 'e2ee-sync-batch', { device : dB.id })).ok)
  const fake = { epk : dA2.ecdhPub, iv : 'AAAAAAAAAAAAAAAA', wk : dA2.ecdhPub }
  const add = await call(a, 'e2ee-add-keys', { device : dA2.id, entries : batch.items.slice(0, 3).map((i) => ({ id : i._id, ...fake })) })
  check('re-wrapped keys stored for the new device', add.ok && add.added === Math.min(3, batch.items.length))
  check('adding the same keys twice does nothing', (await call(a, 'e2ee-add-keys', { device : dA2.id, entries : batch.items.slice(0, 3).map((i) => ({ id : i._id, ...fake })) })).added === 0)
  check("Bob can't add keys to Alice's device", !(await call(b, 'e2ee-add-keys', { device : dA2.id, entries : [{ id : batch.items[0]._id, ...fake }] })).ok)
  a2.events = []
  await call(a, 'e2ee-sync-done', { device : dA2.id, count : 3 })
  check('new device is told the history arrived', !!(await waitFor(a2, 'e2ee-history-synced')))
  const chat2 = await call(a, 'e2ee-chat-devices', { receiver : B.id })
  check('new messages are now encrypted for both of my devices', chat2.users[A.id].filter((x) => !x.removedAt).length === 2)

  // ---------- remote log out retires a device ----------
  const sessions = await fetch(BASE + '/api/sessions', { headers : { Authorization : 'Bearer ' + A.token } }).then((r) => r.json())
  const other = (sessions.data || sessions.sessions || []).find((s) => !s.current)
  const out = await post('/api/sessions/logout', { id : String(other?._id || other?.id) }, A.token)
  await sleep(300)
  const chat3 = await call(a, 'e2ee-chat-devices', { receiver : B.id })
  check('logging a device out remotely stops encrypting to it', out.status === 200 && chat3.users[A.id].filter((x) => !x.removedAt).length === 1, JSON.stringify(out.body))
  check('…but its public keys stay to verify old messages', chat3.users[A.id].length === 2)

  ;[a, b, c, d, a2].forEach((s) => s.disconnect())
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
