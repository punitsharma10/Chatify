// Group chat tests: create, messaging, per-member ticks, typing, admins & permissions, join/leave history.
const { io } = require('socket.io-client')
const { makeUser: mkUser, sleep } = require('./users')
const BASE = process.env.TEST_API || 'http://localhost:5055'

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const uid = 'g' + Date.now().toString(36)
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
const item = (s, gid) => [...s.events].reverse().find((e) => e.ev === 'conversation-item' && e.data.item && String(e.data.item._id) === gid)?.data.item

;(async () => {
  const A = await makeUser('Alice'), B = await makeUser('Bob'), C = await makeUser('Carol'), D = await makeUser('Dave')
  const a = await connect(A.token), b = await connect(B.token), c = await connect(C.token), d = await connect(D.token)
  await sleep(300)

  // ---------- create ----------
  check('group needs a name', !(await call(a, 'create-group', { name: '  ', memberIds: [B.id] })).ok)
  check('group needs at least one other person', !(await call(a, 'create-group', { name: 'Solo', memberIds: [] })).ok)
  check('group icon must be a Cloudinary URL', !(await call(a, 'create-group', { name: 'X', memberIds: [B.id], avatar: 'https://evil.example.com/x.png' })).ok)

  clear(a, b, c, d)
  const created = await call(a, 'create-group', { name: 'Family', description: 'Our family', memberIds: [B.id, C.id] })
  check('create group', created.ok && created.groupId, JSON.stringify(created))
  const G = created.groupId
  const bItem = await waitFor(b, 'conversation-item', (x) => x.item && String(x.item._id) === G)
  check('members get the group in their chat list', bItem && bItem.item.isGroup && bItem.item.userDetails.name === 'Family' && bItem.item.isMember)
  check('chat list preview is the "added" notice', bItem && bItem.item.lastMsg?.system?.action === 'add')
  check('non-members do not get it', !(await waitFor(d, 'conversation-item', () => true, 600)))

  const page = await call(b, 'message-page', G)
  check('member opens group: details + notices', page.ok && page.group.members.length === 3 && page.peer.isGroup && page.messages.length === 2 && page.messages[0].system.action === 'create')
  check('creator is admin, others members', page.group.members.find((m) => m._id === A.id)?.role === 'admin' && page.group.members.find((m) => m._id === B.id)?.role === 'member' && !page.group.isAdmin)
  check('non-member cannot open the group', !(await call(d, 'message-page', G)).ok)

  // ---------- messaging + ticks ----------
  clear(a, b, c)
  const sent = await call(a, 'send-message', { receiver: G, text: 'Hello family', clientId: uid + '-1' })
  check('send to group', sent.ok && sent.message._id)
  const M = sent.message._id
  const bNew = await waitFor(b, 'message-new', (x) => x.message._id === M)
  check('every member receives it with the group id and author name', bNew && bNew.peerId === G && bNew.authorName === 'Alice' && !!(await waitFor(c, 'message-new', (x) => x.message._id === M)))
  check('outsider does not receive it', !(await waitFor(d, 'message-new', () => true, 500)))
  const dup = await call(a, 'send-message', { receiver: G, text: 'Hello family', clientId: uid + '-1' })
  check('group send is de-duplicated by clientId', dup.ok && dup.duplicate && dup.message._id === M)
  check('outsider cannot send to the group', !(await call(d, 'send-message', { receiver: G, text: 'hi' })).ok)

  await sleep(400)
  check('unread count for Bob = 1', item(b, G)?.unseenMsg === 1, JSON.stringify(item(b, G)))
  check('chat list shows the author name', item(b, G)?.lastMsg?.authorName === 'Alice')

  clear(a)
  await call(b, 'mark-delivered', { ids: [M] })
  check('not "delivered" until every member has it', !(await waitFor(a, 'messages-status', (x) => x.ids.includes(M), 700)))
  await call(c, 'mark-delivered', { ids: [M] })
  const delivered = await waitFor(a, 'messages-status', (x) => x.ids.includes(M) && x.deliveredAt && !x.seen)
  check('delivered to all -> double grey tick', !!delivered && delivered.peerId === G)
  clear(a)
  await call(b, 'seen', G)
  check('not blue until everyone read it', !(await waitFor(a, 'messages-status', (x) => x.seen, 700)))
  await call(c, 'seen', G)
  check('read by all -> blue ticks', !!(await waitFor(a, 'messages-status', (x) => x.ids.includes(M) && x.seen)))
  const info = await call(a, 'message-info', { messageId: M })
  check('message info lists who read it', info.ok && info.info.group && info.info.readBy.length === 2 && info.info.readBy.some((p) => p.name === 'Bob'))
  await sleep(300)
  check("Bob's unread count back to 0", item(b, G)?.unseenMsg === 0)

  // ---------- typing, reply, react, edit ----------
  clear(a, c)
  await call(b, 'typing', { to: G, isTyping: true })
  const typing = await waitFor(a, 'typing', (x) => x.chat === G)
  check('typing shows who is typing in the group', typing && typing.name === 'Bob' && typing.isTyping && !!(await waitFor(c, 'typing', (x) => x.chat === G)))
  const reply = await call(b, 'send-message', { receiver: G, text: 'Hi mom', replyTo: M })
  check('reply inside group', reply.ok && reply.message.replyTo?._id === M)
  clear(a, c)
  check('react in group', (await call(c, 'react-message', { messageId: M, emoji: '❤️' })).ok)
  check('reaction reaches everyone', !!(await waitFor(a, 'message-updated', (x) => x.peerId === G && x.messages[0].reactions.length === 1)))
  check('edit own group message', (await call(b, 'edit-message', { messageId: reply.message._id, text: 'Hi mom!' })).ok)
  check('cannot edit someone else\'s message', !(await call(a, 'edit-message', { messageId: reply.message._id, text: 'x' })).ok)

  // ---------- permissions ----------
  check('member cannot remove people', !(await call(b, 'group-remove-member', { groupId: G, userId: C.id })).ok)
  check('member cannot add people (admins only by default)', !(await call(b, 'group-add-members', { groupId: G, userIds: [D.id] })).ok)
  clear(a, c)
  check('member can rename (edit info: all members)', (await call(b, 'group-update', { groupId: G, name: 'Family ❤️' })).ok)
  const renamed = await waitFor(a, 'message-new', (x) => x.message.system?.action === 'subject')
  check('rename shows a notice to everyone', renamed && renamed.message.system.value === 'Family ❤️' && renamed.message.system.actor.name === 'Bob')
  check('everyone gets the updated details', !!(await waitFor(c, 'group-updated', (x) => x.group.name === 'Family ❤️')))

  check('admin limits sending to admins', (await call(a, 'group-settings', { groupId: G, settings: { sendMessages: 'admins' } })).ok)
  check('then members cannot send', !(await call(b, 'send-message', { receiver: G, text: 'blocked?' })).ok)
  check('admin still can', (await call(a, 'send-message', { receiver: G, text: 'Admins only for now' })).ok)
  await call(a, 'group-settings', { groupId: G, settings: { sendMessages: 'all' } })
  check('member can send again', (await call(b, 'send-message', { receiver: G, text: 'Yay' })).ok)
  check('only admins change settings', !(await call(b, 'group-settings', { groupId: G, settings: { editInfo: 'admins' } })).ok)

  // ---------- add: new members don't see older messages ----------
  clear(d)
  check('admin adds Dave', (await call(a, 'group-add-members', { groupId: G, userIds: [D.id] })).ok)
  check('Dave gets the group in his list', !!(await waitFor(d, 'conversation-item', (x) => x.item && String(x.item._id) === G)))
  const dPage = await call(d, 'message-page', G)
  check('Dave sees only messages from after he joined', dPage.ok && dPage.messages.every((m) => m._id !== M) && dPage.messages.some((m) => m.system?.action === 'add'))
  check('adding someone twice is refused', !(await call(a, 'group-add-members', { groupId: G, userIds: [D.id] })).ok)

  // ---------- admins ----------
  check('admin makes Bob admin', (await call(a, 'group-set-admin', { groupId: G, userId: B.id, admin: true })).ok)
  check("creator can't be dismissed by another admin", !(await call(b, 'group-set-admin', { groupId: G, userId: A.id, admin: false })).ok)
  const dMsg = await call(d, 'send-message', { receiver: G, text: 'Dave here' })
  check('new admin can delete anyone\'s message for everyone', (await call(b, 'delete-messages', { messageIds: [dMsg.message._id], scope: 'everyone' })).ok)
  const dAfter = await call(a, 'load-range', { peerId: G, from: dMsg.message.createdAt })
  const deletedByAdmin = dAfter.messages.find((m) => m._id === dMsg.message._id)
  check('shown as deleted by admin', deletedByAdmin?.deletedForEveryone && deletedByAdmin.deletedByAdmin)

  // ---------- remove: read-only history ----------
  clear(d)
  check('new admin removes Dave', (await call(b, 'group-remove-member', { groupId: G, userId: D.id })).ok)
  check('Dave sees "removed you" notice', !!(await waitFor(d, 'message-new', (x) => x.message.system?.action === 'remove')))
  check('Dave can no longer send', !(await call(d, 'send-message', { receiver: G, text: 'still here?' })).ok)
  const later = await call(a, 'send-message', { receiver: G, text: 'After Dave left' })
  const dOld = await call(d, 'message-page', G)
  check('Dave keeps read-only history up to removal', dOld.ok && !dOld.group.isMember && dOld.messages.some((m) => m.text === 'Dave here' || m.deletedForEveryone) && !dOld.messages.some((m) => m._id === later.message._id))
  check('removed member cannot react', !(await call(d, 'react-message', { messageId: later.message._id, emoji: '👍' })).ok)
  check("can't delete a group you're still in", !(await call(b, 'chat-action', { peerId: G, action: 'delete' })).ok)
  check('removed member can delete the group chat', (await call(d, 'chat-action', { peerId: G, action: 'delete' })).ok)

  // ---------- forward + search ----------
  const direct = await call(c, 'send-message', { receiver: A.id, text: 'pineapple recipe ' + uid })
  const fwd = await call(c, 'forward-messages', { messageIds: [direct.message._id], toUserIds: [G] })
  check('forward a message into a group', fwd.ok && fwd.sent === 1 && fwd.failed.length === 0)
  const found = await call(b, 'search-messages', { q: 'pineapple recipe ' + uid })
  check('search finds group messages with the group as chat', found.ok && found.results.length === 1 && found.results[0].peer.isGroup && found.results[0].authorName === 'Carol')

  // ---------- disappearing ----------
  clear(a)
  check('member turns on disappearing messages', (await call(c, 'set-disappearing', { peerId: G, seconds: 86400 })).ok)
  const dis = await waitFor(a, 'conversation-updated', (x) => x.peerId === G)
  check('everyone is told who changed it', dis && dis.disappearAfter === 86400 && dis.byName === 'Carol')

  // ---------- leave: admin hand-over ----------
  const g2 = await call(a, 'create-group', { name: 'Pair', memberIds: [C.id] })
  check('last admin leaves', (await call(a, 'group-leave', { groupId: g2.groupId })).ok)
  const pair = await call(c, 'group-info', { groupId: g2.groupId })
  check('remaining member becomes admin', pair.ok && pair.group.isAdmin && pair.group.members.length === 1)
  check('left member can still open history read-only', (await call(a, 'message-page', g2.groupId)).ok)
  check('leaving twice is refused', !(await call(a, 'group-leave', { groupId: g2.groupId })).ok)

  // ---------- 1:1 still fine ----------
  const one = await call(a, 'send-message', { receiver: B.id, text: 'private' })
  check('one-to-one chat unaffected', one.ok && !one.message.system)
  const bDirect = await call(b, 'message-page', A.id)
  check('one-to-one page loads', bDirect.ok && !bDirect.group && bDirect.messages.some((m) => m.text === 'private'))

  ;[a, b, c, d].forEach((s) => s.disconnect())
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error('TEST CRASH', e); console.log(results.join('\n')); process.exit(2) })
