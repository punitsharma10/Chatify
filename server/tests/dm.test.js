// Pixify Direct: Instagram-style messages (separate inbox, message requests, groups, voice, reactions, sharing posts)
const { makeUser: mkUser, sleep } = require('./users')
const API = process.env.TEST_API || 'http://localhost:5055'

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const uid = 'd' + Date.now().toString(36)
const req = async (method, url, token, body) => {
  const res = await fetch(API + '/api/social' + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: res.status, body: await res.json() }
}
const get = (url, t) => req('GET', url, t)
const post = (url, t, b = {}) => req('POST', url, t, b)
const IMG = 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg'
const VID = 'https://res.cloudinary.com/demo/video/upload/v1/dog.mp4'
const AUD = 'https://res.cloudinary.com/demo/video/upload/v1/voice.webm'

;(async () => {
  const [A, B, C, D] = await Promise.all(['Ana', 'Ben', 'Cara', 'Dev'].map((n) => mkUser(n, uid)))
  for (const [X, h] of [[A, 'ana'], [B, 'ben'], [C, 'cara'], [D, 'dev']]) {
    X.handle = `${h}_${uid}`.slice(0, 30)
    await fetch(API + '/api/updateuser', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + X.token }, body: JSON.stringify({ username: X.handle }) })
  }
  const { io } = require('socket.io-client')
  const connect = async (U) => {
    const s = io(API, { transports: ['websocket'], auth: { token: U.token, client: 'v2' }, forceNew: true, reconnection: false })
    await new Promise((resolve, reject) => { s.on('connect', resolve); s.on('connect_error', reject) })
    s.events = []
    s.on('px-dm', (e) => s.events.push(e))
    s.on('px-dm-typing', (e) => s.events.push({ type: 'typing', ...e }))
    return s
  }
  const sa = await connect(A), sb = await connect(B)

  check('needs login', (await get('/dm/threads', 'nope')).status === 401)

  // B follows A, so A's messages land in B's inbox; C doesn't follow A, so A's message is a request for C
  await post('/follow/' + A.id, B.token)
  const openAB = await get('/dm/with/' + B.handle, A.token)
  check('open a chat by @username', openAB.status === 200 && openAB.body.thread.peer._id === B.id && !openAB.body.thread.isGroup)
  const tAB = openAB.body.thread._id
  check('same chat when opened again (by id, from the other side)', (await get('/dm/with/' + A.id, B.token)).body.thread._id === tAB)
  check("can't message yourself", (await get('/dm/with/' + A.handle, A.token)).status === 400)
  check('empty chat not listed yet', !(await get('/dm/threads', A.token)).body.threads.some((t) => t._id === tAB))

  check('empty message rejected', (await post(`/dm/threads/${tAB}/messages`, A.token, { text: '  ' })).status === 400)
  check('non-Cloudinary photo rejected', (await post(`/dm/threads/${tAB}/messages`, A.token, { media: [{ url: 'https://evil.example/a.jpg', kind: 'image' }] })).status === 400)
  const m1 = await post(`/dm/threads/${tAB}/messages`, A.token, { text: 'Hey Ben!', clientId: 'c-1' })
  check('send a text', m1.status === 200 && m1.body.message.text === 'Hey Ben!' && m1.body.message.kind === 'text')
  const again = await post(`/dm/threads/${tAB}/messages`, A.token, { text: 'Hey Ben!', clientId: 'c-1' })
  check('retry with the same id is not sent twice', again.body.message._id === m1.body.message._id)
  await sleep(150)
  check('live message reaches the other person', sb.events.some((e) => e.type === 'message' && e.message._id === m1.body.message._id && e.thread.unread))

  const bInbox = await get('/dm/threads', B.token)
  const rowB = bInbox.body.threads.find((t) => t._id === tAB)
  check('in inbox of someone who follows you', rowB && rowB.status === 'inbox' && rowB.unread && rowB.lastMessage.preview === 'Hey Ben!' && !rowB.lastMessage.mine)
  check('unread count', (await get('/dm/unread', B.token)).body.inbox === 1)
  check('unread in notification counts too', (await get('/notifications/unread', B.token)).body.dm === 1)

  const photo = await post(`/dm/threads/${tAB}/messages`, B.token, { media: [{ url: IMG, kind: 'image', width: 800, height: 600 }, { url: VID, kind: 'video' }] })
  check('send photos and videos', photo.status === 200 && photo.body.message.media.length === 2)
  check('preview for attachments', (await get('/dm/threads', A.token)).body.threads.find((t) => t._id === tAB).lastMessage.preview === 'sent 2 attachments')
  const voice = await post(`/dm/threads/${tAB}/messages`, A.token, { audio: { url: AUD, duration: 4.2, waveform: [0.1, 0.5, 1] } })
  check('send a voice message', voice.status === 200 && voice.body.message.kind === 'voice' && voice.body.message.audio.duration === 4.2)
  check('bad voice message rejected', (await post(`/dm/threads/${tAB}/messages`, A.token, { audio: { url: AUD, duration: -1 } })).status === 400)
  const reply = await post(`/dm/threads/${tAB}/messages`, B.token, { text: 'Hi!', replyTo: m1.body.message._id })
  check('reply quotes the message', reply.body.message.replyTo.preview === 'Hey Ben!' && reply.body.message.replyTo.from === A.id)

  // seen
  sa.events = []
  await post(`/dm/threads/${tAB}/read`, A.token)
  const r1 = await post(`/dm/threads/${tAB}/read`, B.token)
  await sleep(150)
  check('read receipt sent live', sa.events.some((e) => e.type === 'read' && e.userId === B.id))
  const aView = (await get('/dm/threads/' + tAB, A.token)).body.thread
  check('"Seen" time visible', aView.peer.lastReadAt && new Date(aView.peer.lastReadAt).getTime() === new Date(r1.body.at).getTime())
  check('no unread after reading', (await get('/dm/unread', B.token)).body.inbox === 0)

  // typing
  sb.events = []
  sa.emit('px-dm-typing', { threadId: tAB, typing: true })
  await sleep(200)
  check('typing indicator', sb.events.some((e) => e.type === 'typing' && e.userId === A.id && e.typing))

  // reactions / edit / unsend
  const rx = await post(`/dm/messages/${m1.body.message._id}/react`, B.token, { emoji: '❤️' })
  check('react to a message', rx.body.message.reactions.length === 1 && rx.body.message.reactions[0].emoji === '❤️')
  const rx2 = await post(`/dm/messages/${m1.body.message._id}/react`, B.token, { emoji: '😂' })
  check('one reaction per person', rx2.body.message.reactions.length === 1 && rx2.body.message.reactions[0].emoji === '😂')
  check('remove reaction', (await post(`/dm/messages/${m1.body.message._id}/react`, B.token, { emoji: '' })).body.message.reactions.length === 0)
  const ed = await req('PATCH', `/dm/messages/${m1.body.message._id}`, A.token, { text: 'Hey Ben!!' })
  check('edit your message', ed.status === 200 && ed.body.message.text === 'Hey Ben!!' && ed.body.message.editedAt)
  check("can't edit someone else's", (await req('PATCH', `/dm/messages/${m1.body.message._id}`, B.token, { text: 'x' })).status === 403)
  check("can't edit a photo", (await req('PATCH', `/dm/messages/${photo.body.message._id}`, B.token, { text: 'x' })).status === 403)
  const last = await post(`/dm/threads/${tAB}/messages`, A.token, { text: 'oops' })
  sb.events = []
  check("can't unsend someone else's", (await req('DELETE', `/dm/messages/${last.body.message._id}`, B.token)).status === 403)
  check('unsend', (await req('DELETE', `/dm/messages/${last.body.message._id}`, A.token)).status === 200)
  await sleep(150)
  check('unsend removes it live', sb.events.some((e) => e.type === 'message-remove' && e.messageId === last.body.message._id))
  check('list preview falls back to the previous message', (await get('/dm/threads', B.token)).body.threads.find((t) => t._id === tAB).lastMessage.preview === 'Hi!')
  const msgs = await get(`/dm/threads/${tAB}/messages`, B.token)
  check('messages oldest first, unsent gone', msgs.body.messages.length === 4 && msgs.body.messages[0]._id === m1.body.message._id && !msgs.body.messages.some((m) => m._id === last.body.message._id))

  // message requests
  const tAC = (await get('/dm/with/' + C.handle, A.token)).body.thread._id
  await post(`/dm/threads/${tAC}/messages`, A.token, { text: 'Hi Cara, saw your photos' })
  check('not in inbox of someone who does not follow you', !(await get('/dm/threads', C.token)).body.threads.some((t) => t._id === tAC))
  const cReq = await get('/dm/threads?folder=requests', C.token)
  check('shows in Requests', cReq.body.threads.some((t) => t._id === tAC && t.status === 'request'))
  check('request count', (await get('/dm/unread', C.token)).body.requests === 1)
  await post(`/dm/threads/${tAC}/read`, C.token)
  check('reading a request sends no "Seen"', !(await get('/dm/threads/' + tAC, A.token)).body.thread.peer.lastReadAt)
  const acc = await post(`/dm/threads/${tAC}/accept`, C.token)
  check('accept a request', acc.body.thread.status === 'inbox' && (await get('/dm/threads', C.token)).body.threads.some((t) => t._id === tAC))

  const tDA = (await get('/dm/with/' + A.handle, D.token)).body.thread._id
  await post(`/dm/threads/${tDA}/messages`, D.token, { text: 'hello?' })
  await post(`/dm/threads/${tDA}/delete`, A.token)
  check('delete a request', !(await get('/dm/threads?folder=requests', A.token)).body.threads.some((t) => t._id === tDA))
  await post(`/dm/threads/${tDA}/messages`, D.token, { text: 'hello again' })
  const reqAgain = await get('/dm/threads?folder=requests', A.token)
  check('a new message brings it back', reqAgain.body.threads.some((t) => t._id === tDA))
  check('older messages stay deleted for you', (await get(`/dm/threads/${tDA}/messages`, A.token)).body.messages.length === 1)
  await post('/follow/' + D.id, A.token)
  await post(`/dm/threads/${tDA}/messages`, D.token, { text: 'thanks for the follow' })
  check('following the sender moves it to your inbox', (await get('/dm/threads', A.token)).body.threads.some((t) => t._id === tDA))

  // mute
  await post(`/dm/threads/${tAB}/mute`, B.token, { muted: true })
  await post(`/dm/threads/${tAB}/messages`, A.token, { text: 'muted?' })
  check('muted chats are not counted', (await get('/dm/unread', B.token)).body.inbox === 0)
  check('mute shown', (await get('/dm/threads/' + tAB, B.token)).body.thread.muted === true)

  // blocking
  await fetch(API + '/api/social/follow/' + B.id, { method: 'POST', headers: { Authorization: 'Bearer ' + C.token } })
  const sc = await connect(C)
  await new Promise((r) => sc.emit('block-user', { userId: B.id, block: true }, r))
  const tBC = (await get('/dm/with/' + C.handle, B.token))
  check("blocked people can't open a chat with you", tBC.status === 404)
  const tCB = (await get('/dm/with/' + B.handle, C.token)).body.thread
  check('your block is shown', tCB.blockedByMe === true)
  check("can't send while you've blocked them", (await post(`/dm/threads/${tCB._id}/messages`, C.token, { text: 'x' })).status === 400)
  await new Promise((r) => sc.emit('block-user', { userId: B.id, block: false }, r))
  sc.disconnect()

  // share a post
  const myPost = await post('/posts', D.token, { app: 'pixify', text: 'Beach day', media: [{ url: IMG, kind: 'image' }] })
  const sh = await post('/dm/share', D.token, { postId: myPost.body.post._id, userIds: [A.id, C.id], text: 'look!' })
  check('share a post to several people with a note', sh.status === 200 && sh.body.sent === 2)
  const tDC = (await get('/dm/with/' + C.handle, D.token)).body.thread._id
  const dc = (await get(`/dm/threads/${tDC}/messages`, C.token)).body.messages
  check('post card then the note', dc.length === 2 && dc[0].kind === 'post' && dc[0].post === myPost.body.post._id && dc[1].text === 'look!')
  await post('/profile', B.token, { app: 'pixify', private: true })
  const bp = await post('/posts', B.token, { app: 'pixify', text: 'secret', media: [{ url: IMG, kind: 'image' }] })
  check("can't share a post you can't see", (await post('/dm/share', D.token, { postId: bp.body.post._id, userIds: [A.id] })).status === 404)
  const prof = await post('/dm/share', D.token, { profileId: B.handle, threadIds: [tDA] })
  const profMsg = (await get(`/dm/threads/${tDA}/messages`, A.token)).body.messages.pop()
  check('share a profile', prof.body.sent === 1 && profMsg.kind === 'profile' && profMsg.profile._id === B.id)
  check('share needs someone to send to', (await post('/dm/share', D.token, { postId: myPost.body.post._id })).status === 400)

  // groups
  const g = await post('/dm/threads', A.token, { userIds: [B.id, C.id, D.id], name: 'Weekend trip' })
  const gid = g.body.thread._id
  check('create a group', g.status === 200 && g.body.thread.isGroup && g.body.thread.title === 'Weekend trip' && g.body.thread.memberCount === 4 && g.body.thread.admin)
  check('group in creator inbox with a notice', (await get('/dm/threads', A.token)).body.threads.find((t) => t._id === gid).lastMessage.preview === 'created the group')
  check('group is a request for people who don\'t follow the creator', (await get('/dm/threads?folder=requests', C.token)).body.threads.some((t) => t._id === gid))
  check('group in inbox for people who follow the creator', (await get('/dm/threads', B.token)).body.threads.some((t) => t._id === gid))
  const gm = await post(`/dm/threads/${gid}/messages`, B.token, { text: 'Count me in' })
  check('send in a group', gm.status === 200)
  const rn = await req('PATCH', `/dm/threads/${gid}`, C.token, { name: 'Goa 2026' })
  check('anyone can rename the group', rn.body.thread.title === 'Goa 2026')
  const sys = (await get(`/dm/threads/${gid}/messages`, A.token)).body.messages.pop()
  check('rename notice', sys.kind === 'system' && sys.system.action === 'named' && sys.system.value === 'Goa 2026' && sys.system.actor._id === C.id)
  check('non-admin cannot remove', (await req('DELETE', `/dm/threads/${gid}/members/${D.id}`, B.token)).status === 403)
  const rm = await req('DELETE', `/dm/threads/${gid}/members/${D.id}`, A.token)
  check('admin removes someone', rm.status === 200 && rm.body.thread.memberCount === 3)
  check('removed person loses access', (await get(`/dm/threads/${gid}/messages`, D.token)).status === 404)
  const add = await post(`/dm/threads/${gid}/members`, B.token, { userIds: [D.id] })
  check('add people', add.status === 200 && add.body.thread.memberCount === 4)
  check('make admin', (await post(`/dm/threads/${gid}/admins/${B.id}`, A.token, { admin: true })).body.thread.members.find((m) => m._id === B.id).role === 'admin')
  await post(`/dm/threads/${gid}/leave`, A.token)
  check('leave a group', (await get(`/dm/threads/${gid}`, A.token)).status === 404)
  check('group goes on without you', (await get(`/dm/threads/${gid}`, B.token)).body.thread.memberCount === 3)
  check('one-person group needs another person', (await post('/dm/threads', A.token, { userIds: [] })).status === 400)
  check('one person = their one-to-one chat', (await post('/dm/threads', A.token, { userIds: [B.id] })).body.thread._id === tAB)

  // privacy of other people's chats
  check("can't read someone else's chat", (await get(`/dm/threads/${tAB}/messages`, C.token)).status === 404)
  check("can't react in someone else's chat", (await post(`/dm/messages/${m1.body.message._id}/react`, C.token, { emoji: '❤️' })).status === 404)

  // suggestions for "New message" / share sheet
  const sug = await get('/dm/suggested', A.token)
  check('suggested recent chats and people you follow', sug.status === 200 && sug.body.threads.length >= 2)

  // ---------- Connectify Messages: its own inbox; friends -> inbox, others -> requests ----------
  await post('/friends/' + B.id, A.token, { action: 'request' }); await post('/friends/' + A.id, B.token, { action: 'accept' })
  const cxAB = (await get('/dm/with/' + B.handle + '?app=connectify', A.token)).body.thread
  check('Connectify chat is separate from Pixify', cxAB.app === 'connectify' && cxAB._id !== tAB)
  check('opened again: same Connectify chat', (await get('/dm/with/' + A.id + '?app=connectify', B.token)).body.thread._id === cxAB._id)
  await post(`/dm/threads/${cxAB._id}/messages`, A.token, { text: 'Hi from Connectify' })
  const bCx = (await get('/dm/threads?app=connectify', B.token)).body.threads
  check("friend's message in the Connectify inbox", bCx.some((t) => t._id === cxAB._id && t.status === 'inbox' && t.unread))
  check('not in the Pixify inbox', !(await get('/dm/threads', B.token)).body.threads.some((t) => t._id === cxAB._id))
  check('Pixify chats not in Connectify', !bCx.some((t) => t._id === tAB))
  const counts = (await get('/notifications/unread', B.token)).body
  check('Connectify unread counted on its own', counts.cxDm === 1)
  const cxDA = (await get('/dm/with/' + A.handle + '?app=connectify', D.token)).body.thread // D follows nobody and isn't A's friend
  await post(`/dm/threads/${cxDA._id}/messages`, D.token, { text: 'hello stranger' })
  check('non-friend goes to Connectify requests', (await get('/dm/threads?app=connectify&folder=requests', A.token)).body.threads.some((t) => t._id === cxDA._id))
  check('Connectify request count', (await get('/dm/unread?app=connectify', A.token)).body.requests >= 1)
  const cxGroup = (await post('/dm/threads', A.token, { app: 'connectify', userIds: [B.id, C.id], name: 'Family' })).body.thread
  check('Connectify group', cxGroup.app === 'connectify' && cxGroup.isGroup && (await get('/dm/threads?app=connectify', B.token)).body.threads.some((t) => t._id === cxGroup._id))
  const cxPost = (await post('/posts', A.token, { app: 'connectify', text: 'Weekend!', audience: 'friends' })).body.post
  check('share a Connectify post in Connectify Messages', (await post('/dm/share', A.token, { app: 'connectify', postId: cxPost._id, userIds: [B.id] })).body.sent === 1)
  check('suggested = friends', (await get('/dm/suggested?app=connectify', A.token)).status === 200)

  sa.disconnect(); sb.disconnect()
  await sleep(100)
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
