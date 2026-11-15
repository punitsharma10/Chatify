// Instagram / Facebook features added in the QA parity round: alt text, collab posts, scheduled posts, insights,
// hidden words, places, Connectify polls and custom audiences — plus regression checks for the bugs fixed in that round.
const { makeUser: mkUser, sleep } = require('./users')
const API = process.env.TEST_API || 'http://localhost:5055'

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const uid = 'x' + Date.now().toString(36)
const req = async (method, url, token, body) => {
  const res = await fetch(API + '/api/social' + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: res.status, body: await res.json() }
}
const get = (url, t) => req('GET', url, t)
const post = (url, t, b = {}) => req('POST', url, t, b)
const patch = (url, t, b = {}) => req('PATCH', url, t, b)
const del = (url, t) => req('DELETE', url, t)
const IMG = 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg'
const inMin = (m) => new Date(Date.now() + m * 60 * 1000).toISOString()

;(async () => {
  const [A, B, C, D] = await Promise.all(['Ana', 'Bea', 'Cal', 'Dov'].map((n) => mkUser(n, uid)))
  for (const [X, h] of [[A, 'ana'], [B, 'bea'], [C, 'cal'], [D, 'dov']]) {
    X.handle = `${h}_${uid}`.slice(0, 30)
    await fetch(API + '/api/updateuser', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + X.token }, body: JSON.stringify({ username: X.handle }) })
  }
  // Pixify: C follows B, D follows A. Connectify: A–B and A–C friends.
  await post('/follow/' + B.id, C.token)
  await post('/follow/' + A.id, D.token)
  for (const X of [B, C]) { await post('/friends/' + X.id, A.token, { action: 'request' }); await post('/friends/' + A.id, X.token, { action: 'accept' }) }

  /* ---------- alt text ---------- */
  const alt = await post('/posts', A.token, { app: 'pixify', text: 'alt', media: [{ url: IMG, kind: 'image', alt: 'A red bicycle by the sea' }] })
  check('alt text saved on the photo', alt.body.post.media[0].alt === 'A red bicycle by the sea')

  /* ---------- collab posts ---------- */
  const co = await post('/posts', A.token, { app: 'pixify', text: 'our collab', media: [{ url: IMG, kind: 'image' }], collaborators: [B.id] })
  const cid = co.body.post._id
  check('collab invite stored (author sees it pending)', co.body.post.collaborators?.[0]?.status === 'pending')
  await sleep(150)
  check('invitee is notified', (await get('/notifications?app=pixify', B.token)).body.notifications.some((n) => n.type === 'collab_invite' && n.post._id === cid))
  check("pending collab isn't on the invitee's profile", !(await get(`/users/${B.id}/posts?app=pixify`, C.token)).body.posts.some((p) => p._id === cid))
  check('only the invitee can answer', (await post(`/posts/${cid}/collab`, C.token, { accept: true })).status === 404)
  const acc = await post(`/posts/${cid}/collab`, B.token, { accept: true })
  check('invitee accepts', acc.status === 200 && acc.body.post.myCollab === 'accepted')
  check("accepted collab shows on the collaborator's profile", (await get(`/users/${B.id}/posts?app=pixify`, C.token)).body.posts.some((p) => p._id === cid))
  check("…and in their followers' feed", (await get('/feed?app=pixify', C.token)).body.posts.some((p) => p._id === cid && p.collaborators.some((x) => x._id === B.id)))
  await sleep(150)
  check('author is told the invite was accepted', (await get('/notifications?app=pixify', A.token)).body.notifications.some((n) => n.type === 'collab_accept'))
  check('up to 3 collaborators', (await post('/posts', A.token, { app: 'pixify', media: [{ url: IMG, kind: 'image' }], collaborators: [B.id, C.id, D.id, A.id, '0123456789abcdef01234567'] })).status === 400)

  /* ---------- insights ---------- */
  await post(`/posts/${cid}/react`, C.token, { type: 'like' })
  await post(`/posts/${cid}/save`, D.token, { save: true })
  await post(`/posts/${cid}/comments`, D.token, { text: 'nice' })
  const ins = await get(`/posts/${cid}/insights`, A.token)
  check('insights: likes, comments, saves, reach', ins.status === 200 && ins.body.insights.likes === 1 && ins.body.insights.comments === 1 && ins.body.insights.saves === 1 && ins.body.insights.accountsReached === 2)
  check('only the author sees insights', (await get(`/posts/${cid}/insights`, B.token)).status === 403)

  /* ---------- scheduled posts ---------- */
  check('schedule must be 5+ minutes ahead', (await post('/posts', A.token, { app: 'pixify', media: [{ url: IMG, kind: 'image' }], scheduledFor: inMin(1) })).status === 400)
  const sch = await post('/posts', A.token, { app: 'pixify', text: 'later #soon', media: [{ url: IMG, kind: 'image' }], scheduledFor: inMin(30), tagged: [B.id] })
  const sid = sch.body.post?._id
  check('scheduled post created', sch.status === 200 && !!sch.body.post.scheduledFor)
  check('hidden from followers until published', !(await get('/feed?app=pixify', D.token)).body.posts.some((p) => p._id === sid) && (await get(`/posts/${sid}`, D.token)).status === 404)
  check('hidden from the author\'s own feed and profile', !(await get('/feed?app=pixify', A.token)).body.posts.some((p) => p._id === sid) && !(await get(`/users/${A.id}/posts?app=pixify`, A.token)).body.posts.some((p) => p._id === sid))
  check('listed under Scheduled', (await get('/scheduled?app=pixify', A.token)).body.posts.some((p) => p._id === sid))
  await sleep(150)
  check('tagged people are told only at publishing', !(await get('/notifications?app=pixify', B.token)).body.notifications.some((n) => n.type === 'tag' && n.post?._id === sid))
  check('someone else can\'t publish it', (await post(`/posts/${sid}/publish`, B.token)).status === 404)
  check('move the time', (await post(`/posts/${sid}/publish`, A.token, { at: inMin(60) })).status === 200)
  check('publish now', (await post(`/posts/${sid}/publish`, A.token)).body.published === true)
  await sleep(200)
  check('published post reaches followers', (await get('/feed?app=pixify', D.token)).body.posts.some((p) => p._id === sid))
  check('…and tagged people are notified', (await get('/notifications?app=pixify', B.token)).body.notifications.some((n) => n.type === 'tag' && n.post?._id === sid))
  const cxSch = await post('/posts', A.token, { app: 'connectify', text: 'cx later', audience: 'friends', scheduledFor: inMin(10) })
  check('Connectify posts can be scheduled too', cxSch.status === 200 && (await get('/scheduled?app=connectify', A.token)).body.posts.length === 1 && !(await get('/feed?app=connectify', B.token)).body.posts.some((p) => p._id === cxSch.body.post._id))

  /* ---------- hidden words ---------- */
  check('set hidden words', (await post('/hidden-words', A.token, { words: ['Spam', 'scam'] })).body.words.join() === 'spam,scam')
  await post(`/posts/${cid}/comments`, C.token, { text: 'buy SPAM now' })
  const forD = (await get(`/posts/${cid}/comments`, D.token)).body.comments
  const forC = (await get(`/posts/${cid}/comments`, C.token)).body.comments
  const forA = (await get(`/posts/${cid}/comments`, A.token)).body.comments
  check('comment with a hidden word is hidden from others', !forD.some((c) => c.text === 'buy SPAM now'))
  check('…but its writer still sees it', forC.some((c) => c.text === 'buy SPAM now'))
  check('…and the post author sees it marked', forA.some((c) => c.text === 'buy SPAM now' && c.hiddenByWords))
  check('hidden words are limited', (await post('/hidden-words', A.token, { words: ['x'.repeat(31)] })).status === 400)

  /* ---------- places ---------- */
  await post('/posts', A.token, { app: 'pixify', media: [{ url: IMG, kind: 'image' }], location: 'Pune, India' })
  const pl = await get('/places/' + encodeURIComponent('pune, india') + '?app=pixify', D.token)
  check('place page lists posts from that location (any case)', pl.body.count === 1 && pl.body.posts.length === 1)

  /* ---------- Connectify polls ---------- */
  check('poll needs 2+ different options', (await post('/posts', A.token, { app: 'connectify', text: 'q?', poll: { options: ['yes', 'YES'] } })).status === 400)
  const poll = await post('/posts', A.token, { app: 'connectify', text: 'Lunch?', audience: 'friends', poll: { options: ['Pizza', 'Sushi', 'Thali'] } })
  const pollId = poll.body.post._id
  check('poll created', poll.body.post.poll.options.length === 3 && poll.body.post.poll.total === 0)
  const v1 = await post(`/posts/${pollId}/poll`, B.token, { options: [1] })
  check('vote', v1.body.post.poll.options[1].count === 1 && v1.body.post.poll.options[1].voted)
  check('one choice unless multiple', (await post(`/posts/${pollId}/poll`, B.token, { options: [0, 1] })).status === 400)
  const v2 = await post(`/posts/${pollId}/poll`, B.token, { options: [2] })
  check('change vote', v2.body.post.poll.options[1].count === 0 && v2.body.post.poll.options[2].count === 1 && v2.body.post.poll.total === 1)
  check('non-friends can\'t vote on a friends-only poll', (await post(`/posts/${pollId}/poll`, D.token, { options: [0] })).status === 404)
  check('see who voted', (await get(`/posts/${pollId}/poll/voters`, A.token)).body.options[2].people[0]._id === B.id)

  /* ---------- custom audiences ---------- */
  const spec = await post('/posts', A.token, { app: 'connectify', text: 'only for Bea', audience: 'specific', audienceList: [B.id] })
  check('"Specific friends" post', spec.status === 200 && spec.body.post.audience === 'specific')
  check('…visible to the chosen friend', (await get(`/posts/${spec.body.post._id}`, B.token)).status === 200)
  check('…not to other friends', (await get(`/posts/${spec.body.post._id}`, C.token)).status === 404)
  const exc = await post('/posts', A.token, { app: 'connectify', text: 'not for Bea', audience: 'except', audienceList: [B.id] })
  check('"Friends except" hides it from the excluded friend', (await get(`/posts/${exc.body.post._id}`, B.token)).status === 404 && (await get(`/posts/${exc.body.post._id}`, C.token)).status === 200)
  check('…and from non-friends', (await get(`/posts/${exc.body.post._id}`, D.token)).status === 404)
  check('custom audience needs friends', (await post('/posts', A.token, { app: 'connectify', text: 'x', audience: 'specific', audienceList: [D.id] })).status === 400)

  /* ---------- regressions from the QA round ---------- */
  const hidden = await post('/posts', A.token, { app: 'pixify', media: [{ url: IMG, kind: 'image' }], hideLikes: true })
  await post(`/posts/${hidden.body.post._id}/react`, D.token, { type: 'like' })
  const r = await post(`/posts/${hidden.body.post._id}/react`, C.token, { type: 'like' })
  check('hidden like counts never leak through the like API', r.body.reactionCount <= 1 && r.body.hideLikes)
  const race = await post('/posts', A.token, { app: 'connectify', text: 'race', audience: 'friends' })
  await Promise.all([0, 1, 2, 3, 4].map(() => post(`/posts/${race.body.post._id}/react`, B.token, { type: 'love' })))
  check('simultaneous reactions never duplicate', (await get(`/posts/${race.body.post._id}`, A.token)).body.post.reactionCount === 1)
  const c1 = await post(`/posts/${race.body.post._id}/comments`, B.token, { text: 'hey' })
  await Promise.all([del(`/comments/${c1.body.comment._id}`, B.token), del(`/comments/${c1.body.comment._id}`, B.token)])
  check('comment count never goes negative', (await get(`/posts/${race.body.post._id}`, A.token)).body.post.commentCount === 0)

  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
