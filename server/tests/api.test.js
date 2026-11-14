// End-to-end backend tests: real server on :5055 + test database, three users, several sockets.
const { io } = require('socket.io-client')
const BASE = 'http://localhost:5055'
const MEDIA = 'https://res.cloudinary.com/demo/image/upload/sample.jpg'

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const uid = Date.now().toString(36)

const post = async (url, body, token) => {
  const res = await fetch(BASE + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body)
  })
  return { status: res.status, body: await res.json() }
}

const { makeUser: mkUser } = require('./users')
const makeUser = (name) => mkUser(name, uid)

// socket that records every event it receives
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
const lastConversation = (s) => [...s.events].reverse().find((e) => e.ev === 'conversation')?.data

;(async () => {
  // ---------- auth ----------
  const bad = await connect('not-a-token').then(() => 'connected', (e) => e.message)
  check('socket with invalid token is rejected', bad === 'unauthorized', bad)
  const anonSearch = await post('/api/searchuser', { search: 'a' })
  check('search requires login (401)', anonSearch.status === 401)
  const badLogin = await post('/api/password', { userId: '64b000000000000000000000', password: 'x' })
  check('login with unknown user id returns 400 instead of crashing', badLogin.status === 400)

  const A = await makeUser('Alice'), B = await makeUser('Bob'), C = await makeUser('Carol')
  check('three users registered and logged in', A.token && B.token && C.token)

  const regexSearch = await post('/api/searchuser', { search: '(a+)+$' }, A.token)
  check('search escapes regex input', regexSearch.status === 200)
  const partial = await post('/api/searchuser', { search: 'bob_' + uid }, A.token)
  check('partial search does not reveal strangers', partial.status === 200 && partial.body.data.length === 0)
  const search = await post('/api/searchuser', { search: B.email }, A.token)
  check('exact email finds the user', search.body.data.length === 1 && search.body.data[0]._id === B.id)

  // ---------- presence ----------
  const a1 = await connect(A.token), a2 = await connect(A.token), b1 = await connect(B.token), c1 = await connect(C.token)
  await sleep(300)
  // friends: everyone has saved everyone (otherwise first messages would be message requests)
  for (const [s, others] of [[a1, [B, C]], [b1, [A, C]], [c1, [A, B]]]) for (const o of others) await call(s, 'add-contact', { userId: o.id })
  const bOnline = [...b1.events].reverse().find((e) => e.ev === 'onlineUser')?.data || []
  check('online list contains Alice for Bob', bOnline.includes(A.id))

  // ---------- send / dedupe / spoofing ----------
  clear(a1, a2, b1)
  const r1 = await call(a1, 'send-message', { receiver: B.id, text: 'Hello *Bob*', clientId: 'c-1' })
  check('send-message ack ok', r1.ok && r1.message?._id, JSON.stringify(r1))
  const m1 = r1.message
  check('receiver gets message-new in real time', !!(await waitFor(b1, 'message-new', (d) => d.message._id === m1._id && d.peerId === A.id)))
  check("sender's other tab gets the message", !!(await waitFor(a2, 'message-new', (d) => d.message._id === m1._id)))
  const dup = await call(a1, 'send-message', { receiver: B.id, text: 'Hello *Bob*', clientId: 'c-1' })
  check('retry with same clientId is de-duplicated', dup.ok && dup.duplicate && dup.message._id === m1._id)
  const bad1 = await call(a1, 'send-message', { receiver: B.id, imageUrl: 'https://evil.example.com/x.png' })
  check('non-cloudinary media url rejected', !bad1.ok)
  const empty = await call(a1, 'send-message', { receiver: B.id, text: '   ' })
  check('empty message rejected', !empty.ok)

  clear(b1)
  a1.emit('new message', { sender: C.id, msgByUserId: C.id, receiver: B.id, text: 'spoof attempt' })
  const spoof = await waitFor(b1, 'message-new', (d) => d.message.text === 'spoof attempt')
  check('legacy event ignores forged sender (identity from token)', spoof && String(spoof.message.msgByUserId) === A.id)

  // ---------- delivery & read receipts ----------
  check('new message starts undelivered (single tick)', !m1.deliveredAt && !m1.seen)
  clear(a1)
  await call(b1, 'mark-delivered', { ids: [m1._id] })
  const st1 = await waitFor(a1, 'messages-status', (d) => d.ids.includes(m1._id) && d.deliveredAt)
  check('delivered status reaches sender (double grey tick)', !!st1 && !st1.seenAt)
  clear(a1)
  await call(b1, 'seen', A.id)
  const st2 = await waitFor(a1, 'messages-status', (d) => d.ids.includes(m1._id) && d.seenAt)
  check('read status reaches sender (blue ticks)', !!st2)
  const info = await call(a1, 'message-info', { messageId: m1._id })
  check('message info has sent/delivered/read times', info.ok && info.info.sentAt && info.info.deliveredAt && info.info.seenAt)
  const infoB = await call(b1, 'message-info', { messageId: m1._id })
  check('message info denied for messages you did not send', !infoB.ok)

  // read receipts off
  const priv = await post('/api/updateuser', { privacy: { readReceipts: false } }, B.token)
  check('privacy settings saved', priv.body.data?.privacy?.readReceipts === false)
  const r2 = await call(a1, 'send-message', { receiver: B.id, text: 'second' })
  clear(a1)
  await call(b1, 'seen', A.id)
  const st3 = await waitFor(a1, 'messages-status', (d) => d.ids.includes(r2.message._id))
  check('read receipts off: sender sees delivered but not read', !!st3 && st3.deliveredAt && !st3.seenAt)
  await post('/api/updateuser', { privacy: { readReceipts: true } }, B.token)

  // ---------- edit ----------
  clear(b1)
  const e1 = await call(a1, 'edit-message', { messageId: m1._id, text: 'Hello Bob (edited)' })
  check('owner can edit', e1.ok)
  const upd = await waitFor(b1, 'message-updated', (d) => d.messages.some((m) => m._id === m1._id && m.editedAt))
  check('edit synced to recipient', upd && upd.messages[0].text === 'Hello Bob (edited)')
  const e2 = await call(b1, 'edit-message', { messageId: m1._id, text: 'hacked' })
  check('non-owner cannot edit', !e2.ok)
  const e3 = await call(c1, 'edit-message', { messageId: m1._id, text: 'hacked' })
  check('outsider cannot touch the message', !e3.ok)

  // ---------- reply / react / star / pin ----------
  const rep = await call(b1, 'send-message', { receiver: A.id, text: 'replying', replyTo: m1._id })
  check('reply carries quoted message', rep.ok && rep.message.replyTo?._id === m1._id && rep.message.replyTo.text)
  clear(a1)
  const re = await call(b1, 'react-message', { messageId: m1._id, emoji: '👍' })
  const reU = await waitFor(a1, 'message-updated', (d) => d.messages.some((m) => m.reactions?.length === 1))
  check('reaction synced to other user', re.ok && !!reU)
  await call(b1, 'react-message', { messageId: m1._id, emoji: '👍' })
  const reU2 = await waitFor(a1, 'message-updated', (d) => d.messages.some((m) => m._id === m1._id && m.reactions.length === 0))
  check('same reaction again removes it', !!reU2)
  clear(b1)
  const star = await call(a1, 'star-messages', { messageIds: [m1._id], star: true })
  await sleep(300)
  check('star is private to the user', star.ok && !b1.events.some((e) => e.ev === 'message-updated'))
  const starred = await call(a1, 'get-starred')
  check('starred list returns message', starred.ok && starred.messages.some((x) => x.message._id === m1._id))
  clear(b1)
  const pin = await call(a1, 'pin-message', { messageId: m1._id, pin: true })
  check('pin synced to both', pin.ok && !!(await waitFor(b1, 'message-updated', (d) => d.messages.some((m) => m.pinned))))

  // ---------- delete ----------
  const d1 = await call(b1, 'delete-messages', { messageIds: [m1._id], scope: 'everyone' })
  check("can't delete someone else's message for everyone", !d1.ok)
  clear(b1)
  const d2 = await call(a1, 'delete-messages', { messageIds: [r2.message._id], scope: 'everyone' })
  const dU = await waitFor(b1, 'message-updated', (d) => d.messages.some((m) => m._id === r2.message._id && m.deletedForEveryone && !m.text))
  check('delete for everyone syncs and strips content', d2.ok && !!dU)
  const d3 = await call(b1, 'delete-messages', { messageIds: [rep.message._id], scope: 'me' })
  check('delete for me ok', d3.ok && !!(await waitFor(b1, 'messages-removed')))
  const pageA = await call(a1, 'message-page', B.id)
  check('delete for me does not affect the other user', pageA.messages.some((m) => m._id === rep.message._id))
  const pageB = await call(b1, 'message-page', A.id)
  check('deleted-for-me message hidden for that user', !pageB.messages.some((m) => m._id === rep.message._id))
  const undo = await call(b1, 'undo-delete-for-me', { messageIds: [rep.message._id] })
  const pageB2 = await call(b1, 'message-page', A.id)
  check('undo delete for me restores it', undo.ok && pageB2.messages.some((m) => m._id === rep.message._id))
  const d4 = await call(c1, 'delete-messages', { messageIds: [m1._id], scope: 'me' })
  check("outsider can't delete messages in others' chats", !d4.ok)

  // ---------- forward ----------
  clear(c1)
  const fw = await call(a1, 'forward-messages', { messageIds: [m1._id], toUserIds: [C.id] })
  const fwd = await waitFor(c1, 'message-new', (d) => d.message.forwarded)
  check('forward delivers copy marked forwarded', fw.ok && fw.sent === 1 && !!fwd)
  const fw2 = await call(c1, 'forward-messages', { messageIds: [r2.message._id], toUserIds: [A.id] })
  check("can't forward from a chat you're not in", !fw2.ok)

  // ---------- media ----------
  const media = await call(a1, 'send-message', { receiver: B.id, imageUrl: MEDIA })
  const doc = await call(a1, 'send-message', { receiver: B.id, fileUrl: 'https://res.cloudinary.com/demo/raw/upload/report.pdf', fileName: 'report.pdf', fileSize: 12345, fileType: 'application/pdf' })
  await call(a1, 'send-message', { receiver: B.id, text: 'see https://example.com/page' })
  const shared = await call(b1, 'get-shared', { peerId: A.id })
  check('shared media / docs / links listed', shared.ok && shared.media.length >= 1 && shared.docs[0]?.fileName === 'report.pdf' && shared.links.length >= 1)
  check('image and document messages sent', media.ok && doc.ok)

  // ---------- search ----------
  const s1 = await call(b1, 'search-messages', { peerId: A.id, q: 'edited' })
  check('search within chat', s1.ok && s1.results.length === 1)
  const s2 = await call(c1, 'search-messages', { q: 'edited' })
  check('global search returns only own chats', s2.ok && s2.results.length === 1 && s2.results[0].peer._id === A.id)

  // ---------- pagination ----------
  for (let i = 0; i < 45; i++) await call(c1, 'send-message', { receiver: B.id, text: 'bulk ' + i })
  const pg = await call(b1, 'message-page', C.id)
  check('first page limited to 40 with hasMore', pg.messages.length === 40 && pg.hasMore)
  const older = await call(b1, 'load-older', { peerId: C.id, before: pg.messages[0].createdAt })
  check('load-older returns the rest', older.ok && older.messages.length === 5 && !older.hasMore)

  // ---------- chat list actions (only affect me) ----------
  for (const action of ['archive', 'mute', 'mark-unread']) await call(b1, 'chat-action', { peerId: A.id, action })
  await call(b1, 'sidebar')
  await sleep(300)
  let convB = lastConversation(b1).find((c) => c.sender._id === A.id || c.receiver._id === A.id)
  check('archive / mute / mark unread saved for me', convB.archived && convB.muted && convB.markedUnread)
  clear(a1); await call(a1, 'sidebar'); await sleep(300)
  let convA = lastConversation(a1).find((c) => c.sender._id === B.id || c.receiver._id === B.id)
  check("other user's chat list unaffected", !convA.archived && !convA.muted)
  await call(b1, 'chat-action', { peerId: A.id, action: 'unarchive' })
  const pinRes = await call(b1, 'chat-action', { peerId: A.id, action: 'pin' })
  check('pin chat', pinRes.ok)
  const clr = await call(b1, 'chat-action', { peerId: A.id, action: 'clear' })
  const afterClear = await call(b1, 'message-page', A.id)
  const aStill = await call(a1, 'message-page', B.id)
  check('clear chat empties my view only', clr.ok && afterClear.messages.length === 0 && aStill.messages.length > 0)
  await call(b1, 'chat-action', { peerId: A.id, action: 'delete' })
  await call(b1, 'sidebar'); await sleep(300)
  check('delete chat hides it from my list', !lastConversation(b1).some((c) => c.sender._id === A.id || c.receiver._id === A.id))
  clear(b1)
  await call(a1, 'send-message', { receiver: B.id, text: 'are you there?' })
  check('deleted chat reappears on new message', !!(await waitFor(b1, 'conversation', (list) => list.some((c) => (c.sender._id === A.id || c.receiver._id === A.id) && c.lastMsg?.text === 'are you there?'))))

  // ---------- disappearing ----------
  const dis = await call(a1, 'set-disappearing', { peerId: B.id, seconds: 86400 })
  const disU = await waitFor(b1, 'conversation-updated', (d) => d.disappearAfter === 86400)
  const dm = await call(a1, 'send-message', { receiver: B.id, text: 'vanishing' })
  check('disappearing timer syncs and sets expiry', dis.ok && !!disU && !!dm.message.expiresAt)
  const disBad = await call(a1, 'set-disappearing', { peerId: B.id, seconds: 5 })
  check('invalid timer rejected', !disBad.ok)
  await call(a1, 'set-disappearing', { peerId: B.id, seconds: 0 })

  // ---------- typing ----------
  clear(b1)
  a1.emit('typing', { to: B.id, isTyping: true })
  check('typing indicator forwarded', !!(await waitFor(b1, 'typing', (d) => d.from === A.id && d.isTyping)))

  // ---------- blocking ----------
  const blk = await call(b1, 'block-user', { userId: A.id, block: true })
  check('block user', blk.ok && blk.blocked.includes(A.id))
  await sleep(300)
  const aOnline = [...a1.events].reverse().find((e) => e.ev === 'onlineUser')?.data || []
  check('blocked user no longer sees my online status', !aOnline.includes(B.id))
  clear(b1)
  const toBlocker = await call(a1, 'send-message', { receiver: B.id, text: 'can you see this?' })
  await sleep(400)
  check('messages from a blocked user are not delivered', toBlocker.ok && !b1.events.some((e) => e.ev === 'message-new'))
  const fromBlocker = await call(b1, 'send-message', { receiver: A.id, text: 'hi' })
  check('you cannot message someone you blocked', !fromBlocker.ok)
  const peerView = await call(a1, 'get-peer', B.id)
  check('blocked: last seen hidden from blocked user', peerView.ok && !peerView.peer.lastSeen && !peerView.peer.online)
  await call(b1, 'block-user', { userId: A.id, block: false })

  // ---------- privacy: online / last seen ----------
  await post('/api/updateuser', { privacy: { online: 'nobody', lastSeen: 'nobody' } }, B.token)
  await sleep(300)
  const aOnline2 = [...a1.events].reverse().find((e) => e.ev === 'onlineUser')?.data || []
  check('online visibility "nobody" hides online status', !aOnline2.includes(B.id))
  await post('/api/updateuser', { privacy: { online: 'everyone', lastSeen: 'everyone' } }, B.token)

  // ---------- multi-tab presence ----------
  clear(b1)
  a2.disconnect()
  await sleep(600)
  const afterOneTab = [...b1.events].reverse().find((e) => e.ev === 'onlineUser')?.data
  check('closing one tab keeps user online', !afterOneTab || afterOneTab.includes(A.id))
  a1.disconnect()
  const offline = await waitFor(b1, 'onlineUser', (d) => !d.includes(A.id))
  check('closing last tab broadcasts offline', !!offline)
  await sleep(300)
  const lastSeen = await call(b1, 'get-peer', A.id)
  check('last seen recorded', lastSeen.ok && !!lastSeen.peer.lastSeen && !lastSeen.peer.online)

  // ---------- offline delivery ----------
  const offMsg = await call(b1, 'send-message', { receiver: A.id, text: 'while you were away' })
  check('message to offline user stays undelivered', offMsg.ok && !offMsg.message.deliveredAt)
  clear(b1)
  const a3 = await connect(A.token)
  await call(a3, 'delivered-all')
  check('reconnect marks pending messages delivered', !!(await waitFor(b1, 'messages-status', (d) => d.ids.includes(offMsg.message._id) && d.deliveredAt)))

  ;[a3, b1, c1].forEach((s) => s.disconnect())
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error('TEST CRASH', e); console.log(results.join('\n')); process.exit(2) })
