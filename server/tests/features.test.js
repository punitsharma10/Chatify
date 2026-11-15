// WhatsApp-parity features: polls, mentions, view once, contact / location cards, link previews, timed mute,
// favourites, chat lock, invite links, call history, export, report, reply privately, linked devices.
const http = require('http')
const { io } = require('socket.io-client')
const { makeUser: mkUser, befriend, sleep, post } = require('./users')
const BASE = process.env.TEST_API || 'http://localhost:5055'

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const uid = 'f' + Date.now().toString(36)
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
const get = async (url, token) => {
  const res = await fetch(BASE + url, { headers: { Authorization: 'Bearer ' + token } })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
const IMG = 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg'

;(async () => {
  const A = await makeUser('Alice'), B = await makeUser('Bob'), C = await makeUser('Carol'), D = await makeUser('Dave')
  await befriend(A, B, C)
  const a = await connect(A.token), b = await connect(B.token), c = await connect(C.token), d = await connect(D.token)
  await sleep(300)

  // ---------- polls ----------
  check('poll needs 2 options', !(await call(a, 'send-message', { receiver: B.id, poll: { question: 'Lunch?', options: ['Pizza'] } })).ok)
  check('poll options must differ', !(await call(a, 'send-message', { receiver: B.id, poll: { question: 'Lunch?', options: ['Pizza', 'pizza'] } })).ok)
  const p1 = await call(a, 'send-message', { receiver: B.id, poll: { question: 'Lunch?', options: ['Pizza', 'Sushi', 'Tacos'], multiple: false } })
  check('send single-answer poll', p1.ok && p1.message.poll.question === 'Lunch?' && p1.message.poll.options.length === 3 && !p1.message.poll.multiple && p1.message.text === '')
  check('single-answer poll refuses two choices', !(await call(b, 'poll-vote', { messageId: p1.message._id, options: [0, 1] })).ok)
  b.events = []; a.events = []
  check('vote', (await call(b, 'poll-vote', { messageId: p1.message._id, options: [1] })).ok)
  const upd = await waitFor(a, 'message-updated', (x) => x.messages?.[0]?.poll)
  check('sender sees the vote live', upd && upd.messages[0].poll.votes.length === 1 && upd.messages[0].poll.votes[0].options[0] === 1 && upd.messages[0].poll.votes[0].userId === B.id)
  await call(b, 'poll-vote', { messageId: p1.message._id, options: [2] })
  await call(b, 'poll-vote', { messageId: p1.message._id, options: [] })
  const page = await call(a, 'message-page', B.id)
  const pollNow = page.messages.find((m) => m._id === p1.message._id)
  check('changing and removing a vote', pollNow.poll.votes.length === 0)
  check('outsider cannot vote', !(await call(d, 'poll-vote', { messageId: p1.message._id, options: [0] })).ok)
  check('poll cannot be edited', !(await call(a, 'edit-message', { messageId: p1.message._id, text: 'hack' })).ok)
  check('invalid option index rejected', !(await call(b, 'poll-vote', { messageId: p1.message._id, options: [9] })).ok)

  // ---------- groups: mentions, invite links ----------
  const g = await call(a, 'create-group', { name: 'Team', memberIds: [B.id, C.id] })
  const G = g.groupId
  c.events = []
  const m1 = await call(b, 'send-message', { receiver: G, text: '@Alice @Carol look', mentions: [A.id, C.id, D.id, B.id] })
  check('mentions keep only other members', m1.ok && m1.message.mentions.length === 2 && !m1.message.mentions.includes(D.id) && !m1.message.mentions.includes(B.id))
  const cItem = await waitFor(c, 'conversation-item', (x) => x.item && String(x.item._id) === G && x.item.mentioned)
  check('mentioned member sees @ in chat list', !!cItem)
  const m2 = await call(a, 'send-message', { receiver: B.id, text: 'hi', mentions: [B.id] })
  check('mentions are ignored in 1:1 chats', m2.ok && !m2.message.mentions)

  check('member cannot get invite link when only admins add', !(await call(b, 'group-invite-link', { groupId: G })).ok)
  const link = await call(a, 'group-invite-link', { groupId: G })
  check('admin gets invite link', link.ok && /^[A-Za-z0-9_-]{16,40}$/.test(link.code))
  const again = await call(a, 'group-invite-link', { groupId: G })
  check('same link until reset', again.code === link.code)
  const info = await call(d, 'group-invite-info', { code: link.code })
  check('anyone with the link sees the group preview', info.ok && info.group.name === 'Team' && info.group.memberCount === 3 && !info.group.isMember)
  const joined = await call(d, 'group-join', { code: link.code })
  check('join with the link', joined.ok && joined.groupId === G)
  const gp = await call(d, 'message-page', G)
  check('joined member is in the group and sees the join notice', gp.ok && gp.group.isMember && gp.messages.some((m) => m.system?.action === 'join'))
  check('joined member does not see older messages', !gp.messages.some((m) => m.text === '@Alice @Carol look'))
  const reset = await call(a, 'group-invite-link', { groupId: G, reset: true })
  check('reset gives a new link', reset.ok && reset.code !== link.code)
  check('old link stops working', !(await call(d, 'group-invite-info', { code: link.code })).ok)
  check('garbage invite code rejected', !(await call(d, 'group-invite-info', { code: '../../etc' })).ok)

  // ---------- reply privately ----------
  const groupMsg = await call(b, 'send-message', { receiver: G, text: 'group secret plan' })
  const priv = await call(a, 'send-message', { receiver: B.id, text: 'about this…', replyTo: groupMsg.message._id })
  check('reply privately quotes the group message', priv.ok && priv.message.replyTo?.text === 'group secret plan')
  const cMsg = await call(c, 'send-message', { receiver: G, text: 'carol only' })
  const priv2 = await call(a, 'send-message', { receiver: B.id, text: 'x', replyTo: cMsg.message._id })
  check("can't quote someone else's group message to a third person", priv2.ok && !priv2.message.replyTo)
  const dPriv = await call(d, 'send-message', { receiver: B.id, text: 'y', replyTo: m1.message._id }) // sent before D joined
  check("can't quote a group message you can't see", dPriv.ok && !dPriv.message.replyTo)

  // ---------- view once ----------
  check('view once needs a photo or video', !(await call(a, 'send-message', { receiver: B.id, text: 'x', viewOnce: true })).ok)
  const vo = await call(a, 'send-message', { receiver: B.id, imageUrl: IMG, viewOnce: true })
  check('view once message hides the media address', vo.ok && vo.message.viewOnce === 'image' && vo.message.imageUrl === '' && vo.message.opened === false)
  const bPage = await call(b, 'message-page', A.id)
  const voB = bPage.messages.find((m) => m._id === vo.message._id)
  check('recipient copy hides the address too', voB && voB.imageUrl === '' && voB.viewOnce === 'image')
  check('sender cannot open it', !(await call(a, 'view-once-open', { messageId: vo.message._id })).ok)
  a.events = []
  const open1 = await call(b, 'view-once-open', { messageId: vo.message._id })
  check('recipient opens it once', open1.ok && open1.url === IMG)
  check('second open refused', !(await call(b, 'view-once-open', { messageId: vo.message._id })).ok)
  const openedUpd = await waitFor(a, 'message-updated', (x) => x.messages?.[0]?._id === vo.message._id)
  check('sender sees "Opened"', openedUpd && openedUpd.messages[0].opened === true)
  check('view once cannot be forwarded', !(await call(b, 'forward-messages', { messageIds: [vo.message._id], toUserIds: [C.id] })).ok)

  // ---------- contact card + location ----------
  const card = await call(a, 'send-message', { receiver: B.id, contact: { userId: C.id } })
  check('share a contact card', card.ok && card.message.contact.name === 'Carol' && card.message.contact.userId === C.id)
  check('unknown contact rejected', !(await call(a, 'send-message', { receiver: B.id, contact: { userId: '0123456789abcdef01234567' } })).ok)
  const loc = await call(a, 'send-message', { receiver: B.id, location: { lat: 28.6139, lng: 77.209, name: 'India Gate' } })
  check('share a location', loc.ok && loc.message.location.lat === 28.6139 && loc.message.location.name === 'India Gate')
  check('invalid location rejected', !(await call(a, 'send-message', { receiver: B.id, location: { lat: 200, lng: 0 } })).ok)
  const fw = await call(b, 'forward-messages', { messageIds: [card.message._id, loc.message._id, p1.message._id], toUserIds: [C.id] })
  check('cards, locations and polls can be forwarded', fw.ok && fw.sent === 3)

  // ---------- timed mute, favourites ----------
  // fresh chat list (wait for refreshes from earlier actions to settle first)
  const sidebar = async (s) => { await sleep(300); s.events = []; s.emit('sidebar'); return (await waitFor(s, 'conversation')) }
  check('invalid mute duration rejected', !(await call(a, 'chat-action', { peerId: B.id, action: 'mute', seconds: 5 })).ok)
  await call(a, 'chat-action', { peerId: B.id, action: 'mute', seconds: 8 * 3600 })
  let list = await sidebar(a)
  let row = list.find((r) => r.userDetails._id === B.id)
  check('mute for 8 hours', row.muted && row.mutedUntil && Math.abs(new Date(row.mutedUntil) - Date.now() - 8 * 3600e3) < 60e3)
  await call(a, 'chat-action', { peerId: B.id, action: 'mute', seconds: 0 })
  list = await sidebar(a); row = list.find((r) => r.userDetails._id === B.id)
  check('mute always', row.muted && !row.mutedUntil)
  await call(a, 'chat-action', { peerId: B.id, action: 'unmute' })
  await call(a, 'chat-action', { peerId: B.id, action: 'favorite' })
  list = await sidebar(a); row = list.find((r) => r.userDetails._id === B.id)
  check('unmute + add to favourites', !row.muted && row.favorite)

  // ---------- chat lock ----------
  check('cannot lock a chat without a secret code', !(await call(a, 'chat-action', { peerId: B.id, action: 'lock' })).ok)
  check('code must be 4+ characters', !(await call(a, 'chat-lock-set', { code: '12' })).ok)
  check('set secret code', (await call(a, 'chat-lock-set', { code: 'tiger42' })).ok)
  const det = await get('/api/userdetails', A.token)
  check('profile says a code is set, never the code', det.body.data.hasChatLock === true && !('chatLockCode' in det.body.data))
  check('lock a chat', (await call(a, 'chat-action', { peerId: B.id, action: 'lock' })).ok)
  list = await sidebar(a); row = list.find((r) => r.userDetails._id === B.id)
  check('chat list marks it locked', row.locked)
  check('wrong code refused', !(await call(a, 'chat-lock-verify', { code: 'nope1' })).ok)
  check('right code opens locked chats', (await call(a, 'chat-lock-verify', { code: 'tiger42' })).ok)
  check('changing the code needs the current one', !(await call(a, 'chat-lock-set', { code: 'lion1234', current: 'bad' })).ok)
  check('remove code unlocks all chats', (await call(a, 'chat-lock-remove', { code: 'tiger42' })).ok)
  list = await sidebar(a); row = list.find((r) => r.userDetails._id === B.id)
  check('chat is unlocked again', !row.locked)

  // ---------- call history, export, report ----------
  const ch = await call(a, 'call-history')
  check('call history loads', ch.ok && Array.isArray(ch.calls))
  const ex = await call(a, 'export-chat', { peerId: B.id })
  check('export chat as text', ex.ok && ex.text.includes('POLL: Lunch?') && ex.text.includes('Alice: hi') && ex.text.includes('Contact card: Carol') && ex.text.includes('<View once media omitted>'))
  check('cannot export a chat that does not exist', !(await call(c, 'export-chat', { peerId: '0123456789abcdef01234567' })).ok)
  const rep = await call(d, 'report', { peerId: A.id, reason: 'spam', block: true })
  check('report and block', rep.ok && rep.blocked.includes(A.id))

  // ---------- link previews (local page; private addresses are only allowed in tests) ----------
  const page2 = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end('<html><head><title>Fallback</title><meta property="og:title" content="Chatify &amp; Friends"><meta property="og:description" content="A test page"><meta property="og:image" content="/img.png"></head><body>hi</body></html>')
  })
  await new Promise((r) => page2.listen(0, r))
  const url = `http://127.0.0.1:${page2.address().port}/post`
  a.events = []
  const lp = await call(a, 'send-message', { receiver: B.id, text: `see ${url} now` })
  const lpUpd = await waitFor(a, 'message-updated', (x) => x.messages?.[0]?._id === lp.message._id && x.messages[0].linkPreview, 6000)
  check('link preview added after sending', lpUpd && lpUpd.messages[0].linkPreview.title === 'Chatify & Friends' && lpUpd.messages[0].linkPreview.description === 'A test page')
  const lpApi = await post('/api/link-preview', { url }, A.token)
  check('composer preview endpoint', lpApi.body.data?.title === 'Chatify & Friends')
  page2.close()
  const { privateIp } = require('../helpers/linkPreview')
  check('private / local addresses are blocked in production', ['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.20.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fd00::1'].every(privateIp) && !privateIp('93.184.216.34'))

  // ---------- linked devices ----------
  const second = await post('/api/password', { userId: A.id, password: 'secret123' })
  const sessions = await get('/api/sessions', A.token)
  check('linked devices lists sessions', sessions.status === 200 && sessions.body.data.length >= 2 && sessions.body.data.filter((s) => s.current).length === 1)
  const a2 = await connect(second.body.token)
  const out = await post('/api/sessions/logout', { others: true }, A.token)
  check('log out all other devices', out.body.success && out.body.loggedOut >= 1)
  const revoked = await waitFor(a2, 'session-revoked', () => true, 3000)
  check('other device is disconnected right away', !!revoked)
  const stale = await get('/api/sessions', second.body.token)
  check("logged-out device's token stops working", stale.status === 401)
  check('this device still works', (await get('/api/sessions', A.token)).status === 200)

  // ---------- delete account ----------
  const E = await makeUser('Erin')
  await befriend(E, B)
  const e = await connect(E.token)
  const eg = await call(e, 'create-group', { name: 'Erin club', memberIds: [B.id] })
  await call(e, 'send-message', { receiver: B.id, text: 'bye soon' })
  await call(e, 'status-post', { kind: 'text', text: 'last status' })
  check('delete account needs the right password', (await post('/api/delete-account', { password: 'nope' }, E.token)).status === 400)
  b.events = []
  const del = await post('/api/delete-account', { password: 'secret123' }, E.token)
  check('delete account', del.body.success === true)
  check('deleted account is logged out everywhere', !!(await waitFor(e, 'session-revoked', () => true, 3000)) && (await get('/api/sessions', E.token)).status === 401)
  check("can't log in with the old email", !(await post('/api/email', { email: E.email })).body.success)
  const bPage2 = await call(b, 'message-page', E.id)
  check('chat shows "Deleted account" and keeps old messages', bPage2.peer.name === 'Deleted account' && bPage2.messages.some((m) => m.text === 'bye soon'))
  check("can't message a deleted account", !(await call(b, 'send-message', { receiver: E.id, text: 'hello?' })).ok)
  const gp2 = await call(b, 'message-page', eg.groupId)
  check('deleted account left its groups (and someone else is admin)', gp2.group.members.length === 1 && gp2.group.isAdmin && gp2.messages.some((m) => m.system?.action === 'leave'))
  check('their status updates are gone', !(await call(b, 'status-list')).updates.some((u) => u.user._id === E.id))

  ;[a, b, c, d, a2, e].forEach((s) => s.disconnect())
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
