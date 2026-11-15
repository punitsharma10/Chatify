// Connectify Pages (Facebook-style): create / edit / delete, follow, admins, posting as the Page, the Page's posts
// in followers' Home feed, notifications, blocks and account deletion.
const { makeUser: mkUser, sleep } = require('./users')
const API = process.env.TEST_API || 'http://localhost:5055'

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const uid = 'g' + Date.now().toString(36)
const req = async (method, url, token, body) => {
  const res = await fetch(API + '/api/social' + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: res.status, body: await res.json() }
}
const get = (url, t) => req('GET', url, t)
const post = (url, t, b = {}) => req('POST', url, t, b)
const patch = (url, t, b = {}) => req('PATCH', url, t, b)
const del = (url, t) => req('DELETE', url, t)
const IMG = 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg'

;(async () => {
  const [A, B, C, D] = await Promise.all(['Ana', 'Bea', 'Cal', 'Dov'].map((n) => mkUser(n, uid)))
  // Connectify: A–B friends (B can become an admin); C and D are strangers
  await post('/friends/' + B.id, A.token, { action: 'request' }); await post('/friends/' + A.id, B.token, { action: 'accept' })

  /* ---------- create ---------- */
  check('name is required', (await post('/pages', A.token, { name: ' ', category: 'Brand' })).status === 400)
  check('name up to 75 characters', (await post('/pages', A.token, { name: 'x'.repeat(76), category: 'Brand' })).status === 400)
  check('category must be from the list', (await post('/pages', A.token, { name: 'Bad', category: 'Spaceship' })).status === 400)
  check('bio up to 255 characters', (await post('/pages', A.token, { name: 'Bio', category: 'Brand', bio: 'b'.repeat(256) })).status === 400)
  check('only allowed media URLs for the picture', (await post('/pages', A.token, { name: 'Pic', category: 'Brand', avatar: 'https://evil.example.com/x.jpg' })).status === 400)
  check('website must be valid', (await post('/pages', A.token, { name: 'Web', category: 'Brand', website: 'not a site' })).status === 400)
  check('email must be valid', (await post('/pages', A.token, { name: 'Mail', category: 'Brand', email: 'nope' })).status === 400)
  const made = await post('/pages', A.token, { name: `Ana's Bakery ${uid}`, category: 'Restaurant', bio: 'Fresh bread daily', avatar: IMG, cover: IMG, website: 'anabakery.example.com', location: 'Pune', email: 'Hello@AnaBakery.example.com', phone: '+91 98765 43210' })
  check('create a Page', made.status === 200 && made.body.page.isAdmin && made.body.page.followerCount === 0, JSON.stringify(made.body))
  const pg = made.body.page
  check('website gets https://', pg.website === 'https://anabakery.example.com/')
  check('email stored lower-case', pg.email === 'hello@anabakery.example.com')
  check('categories listed', (await get('/pages/categories', A.token)).body.categories.includes('Musician/band'))
  check("creator's Your Pages lists it", (await get('/pages?tab=yours', A.token)).body.pages.some((p) => p._id === pg._id))

  /* ---------- posting as the Page ---------- */
  check("non-admins can't post as the Page", (await post('/posts', C.token, { app: 'connectify', page: pg._id, text: 'hijack' })).status === 403)
  check("Page posts can't go in groups", (await post('/posts', A.token, { app: 'connectify', page: pg._id, text: 'x', group: pg._id })).status === 400)
  const pp = await post('/posts', A.token, { app: 'connectify', page: pg._id, text: 'Croissants are out of the oven!', media: [{ url: IMG, kind: 'image' }], audience: 'only_me', feeling: '😊 feeling happy', crossPost: ['pixify'] })
  check('admin posts as the Page', pp.status === 200 && pp.body.post.page?._id === pg._id && pp.body.post.page.name === pg.name, JSON.stringify(pp.body))
  check('Page posts are always public', pp.body.post.audience === 'public' && !pp.body.post.feeling)
  check('no Pixify cross-post for Page posts', !(pp.body.crossPosted || []).length)
  const pid = pp.body.post._id
  check("Page post isn't on the admin's personal profile", !(await get(`/users/${A.id}/posts?app=connectify`, B.token)).body.posts.some((p) => p._id === pid))
  check('Page posts tab shows it to anyone', (await get(`/pages/${pg._id}/posts`, C.token)).body.posts.some((p) => p._id === pid && p.page._id === pg._id && !p.mine))
  check("friend of the admin doesn't get it in Home before following", !(await get('/feed?app=connectify', B.token)).body.posts.some((p) => p._id === pid))

  /* ---------- follow ---------- */
  const f = await post(`/pages/${pg._id}/follow`, C.token, { follow: true })
  check('follow a Page', f.status === 200 && f.body.page.following && f.body.page.followerCount === 1)
  check('following twice counts once', (await post(`/pages/${pg._id}/follow`, C.token, { follow: true })).body.page.followerCount === 1)
  check('followed Pages tab', (await get('/pages?tab=followed', C.token)).body.pages.some((p) => p._id === pg._id))
  const home = (await get('/feed?app=connectify', C.token)).body.posts
  check("follower sees the Page's post in Home, with the Page as author", home.some((p) => p._id === pid && p.page?.name === pg.name))
  await sleep(150)
  const an = (await get('/notifications?app=connectify', A.token)).body.notifications
  check('admins are notified of new followers', an.some((n) => n.type === 'page_follow' && n.page?._id === pg._id && n.actor._id === C.id))
  // reactions, comments, save and share work like any post
  check('react to a Page post', (await post(`/posts/${pid}/react`, C.token, { type: 'love' })).body.reactionCount === 1)
  const cm = await post(`/posts/${pid}/comments`, C.token, { text: 'Yum!' })
  check('comment on a Page post (stays personal)', cm.status === 200 && cm.body.comment.author._id === C.id)
  check('save a Page post', (await post(`/posts/${pid}/save`, C.token, { save: true })).body.saved === true)
  const sh = await post('/posts', C.token, { app: 'connectify', text: 'look', sharedPost: pid, audience: 'public' })
  check('share a Page post', sh.status === 200 && sh.body.post.sharedPost?.page?._id === pg._id)

  /* ---------- discover ---------- */
  const disc = (await get(`/pages?tab=discover&q=${encodeURIComponent("Ana's Bakery " + uid)}`, D.token)).body.pages
  check('discover finds it by name', disc.some((p) => p._id === pg._id && !p.following))
  check('discover by category', (await get('/pages?tab=discover&q=restaurant', D.token)).body.pages.some((p) => p._id === pg._id))
  check("discover doesn't list Pages you manage", !(await get('/pages?tab=discover&q=' + uid, A.token)).body.pages.some((p) => p._id === pg._id))

  /* ---------- edit ---------- */
  check("non-admins can't edit", (await patch(`/pages/${pg._id}`, C.token, { name: 'Mine now' })).status === 403)
  const ed = await patch(`/pages/${pg._id}`, A.token, { bio: 'Bread & cakes', category: 'Local business' })
  check('admin edits the Page', ed.status === 200 && ed.body.page.bio === 'Bread & cakes' && ed.body.page.category === 'Local business')

  /* ---------- admins ---------- */
  check("strangers can't be added as admins", (await post(`/pages/${pg._id}/admins`, A.token, { userId: D.id })).status === 400)
  check("non-admins can't see admins", (await get(`/pages/${pg._id}/admins`, C.token)).status === 403)
  const add = await post(`/pages/${pg._id}/admins`, A.token, { userId: B.id })
  check('add a friend as admin', add.status === 200 && add.body.page.adminCount === 2)
  check('new admin manages it', (await get('/pages?tab=yours', B.token)).body.pages.some((p) => p._id === pg._id))
  const bp = await post('/posts', B.token, { app: 'connectify', page: pg._id, text: 'Hello from the other admin' })
  check('second admin posts as the Page', bp.status === 200 && bp.body.post.page._id === pg._id)
  check('admins can edit each other\'s Page posts', (await patch(`/posts/${bp.body.post._id}`, A.token, { text: 'Edited by Ana' })).body.post?.text === 'Edited by Ana')
  check("Page post audience can't change", (await patch(`/posts/${pid}`, A.token, { audience: 'friends' })).status === 400)
  check("Page posts can't be pinned to a profile", (await post(`/posts/${pid}/pin`, A.token, { pin: true })).status === 400)
  check('admins list', (await get(`/pages/${pg._id}/admins`, B.token)).body.people.length === 2)
  check('remove an admin', (await del(`/pages/${pg._id}/admins/${B.id}`, A.token)).body.page?.adminCount === 1)
  check('the last admin cannot be removed', (await del(`/pages/${pg._id}/admins/${A.id}`, A.token)).status === 400)
  check('removed admin can no longer post as the Page', (await post('/posts', B.token, { app: 'connectify', page: pg._id, text: 'x' })).status === 403)

  /* ---------- unfollow ---------- */
  const uf = await post(`/pages/${pg._id}/follow`, C.token, { follow: false })
  check('unfollow', uf.body.page.following === false && uf.body.page.followerCount === 0)
  check('unfollowing removes the posts from Home', !(await get('/feed?app=connectify', C.token)).body.posts.some((p) => p._id === pid))
  await sleep(150)
  check('…and the follow notification', !(await get('/notifications?app=connectify', A.token)).body.notifications.some((n) => n.type === 'page_follow' && n.actor._id === C.id))

  /* ---------- blocks ---------- */
  await post(`/pages/${pg._id}/follow`, D.token, { follow: true })
  const { io } = require('socket.io-client')
  const sd = io(API, { transports: ['websocket'], auth: { token: D.token, client: 'v2' }, forceNew: true, reconnection: false })
  await new Promise((r) => sd.on('connect', r))
  await new Promise((r) => sd.emit('block-user', { userId: A.id, block: true }, r))
  check('a Page is hidden from people who blocked its creator', (await get(`/pages/${pg._id}`, D.token)).status === 404)
  check('…and its posts', (await get(`/posts/${pid}`, D.token)).status === 404 && !(await get('/feed?app=connectify', D.token)).body.posts.some((p) => p.page?._id === pg._id))
  check('…and from Discover', !(await get('/pages?tab=discover&q=' + uid, D.token)).body.pages.some((p) => p._id === pg._id))
  await new Promise((r) => sd.emit('block-user', { userId: A.id, block: false }, r))
  sd.disconnect()
  check('unblocking shows it again', (await get(`/pages/${pg._id}`, D.token)).status === 200)

  /* ---------- limits ---------- */
  let last
  for (let i = 0; i < 20; i++) last = await post('/pages', C.token, { name: `C page ${i}`, category: 'Other' })
  check('up to 20 Pages each', last.status === 200 && (await post('/pages', C.token, { name: 'C page 21', category: 'Other' })).status === 400)

  /* ---------- account deletion ---------- */
  await post(`/pages/${pg._id}/admins`, A.token, { userId: B.id })
  const bp2 = await post('/posts', B.token, { app: 'connectify', page: pg._id, text: 'B wrote this' })
  const delB = await fetch(API + '/api/delete-account', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + B.token }, body: JSON.stringify({ password: 'secret123' }) })
  if (delB.status === 200) {
    const left = (await get(`/pages/${pg._id}`, A.token)).body.page
    check('deleted account leaves the Page admins', left.adminCount === 1)
    const kept = await get(`/posts/${bp2.body.post._id}`, A.token)
    check("their Page posts stay on the Page", kept.status === 200 && kept.body.post.page._id === pg._id)
  } else check('delete-account endpoint', false, `status ${delB.status}`)
  const solo = await post('/pages', D.token, { name: 'Dov solo', category: 'Artist' })
  const soloPost = await post('/posts', D.token, { app: 'connectify', page: solo.body.page._id, text: 'only admin' })
  const delD = await fetch(API + '/api/delete-account', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + D.token }, body: JSON.stringify({ password: 'secret123' }) })
  if (delD.status === 200) {
    check('a Page left with no admins is deleted', (await get(`/pages/${solo.body.page._id}`, A.token)).status === 404)
    check('…with its posts', (await get(`/posts/${soloPost.body.post._id}`, A.token)).status === 404)
  } else check('delete-account endpoint', false, `status ${delD.status}`)

  /* ---------- delete ---------- */
  check("non-admins can't delete", (await del(`/pages/${pg._id}`, C.token)).status === 403)
  check('admin deletes the Page', (await del(`/pages/${pg._id}`, A.token)).status === 200)
  check('the Page is gone', (await get(`/pages/${pg._id}`, A.token)).status === 404)
  check('its posts are gone', (await get(`/posts/${pid}`, A.token)).status === 404)
  check('shares of its posts show as unavailable', (await get(`/posts/${sh.body.post._id}`, C.token)).body.post?.sharedPost?.unavailable === true)

  console.log(results.join('\n'))
  console.log(`\npages: ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
