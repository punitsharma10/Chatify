// Pixify Explore / Reels: everyone's public posts, ranked by engagement, paged with "p:N" cursors, and endless
// with Pexels stock photos / videos after our own posts run out (a fake Pexels server stands in for the real one).
const http = require('http')
const { makeUser: mkUser } = require('./users')
const API = process.env.TEST_API || 'http://localhost:5055'
const FAKE_PORT = Number((process.env.PEXELS_API_BASE || 'http://localhost:5099').split(':').pop())

let passed = 0, failed = 0
const results = []
const check = (name, cond, extra = '') => {
  if (cond) { passed++; results.push(`PASS  ${name}`) }
  else { failed++; results.push(`FAIL  ${name} ${extra}`) }
}
const uid = 'e' + Date.now().toString(36)
const req = async (method, url, token, body) => {
  const res = await fetch(API + '/api/social' + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: res.status, body: await res.json() }
}
const IMG = 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg'
const VID = 'https://res.cloudinary.com/demo/video/upload/v1/dog.mp4'

// fake Pexels: checks the key and returns a few portrait photos / videos per page
const seenAuth = []
const fake = http.createServer((rq, rs) => {
  seenAuth.push(rq.headers.authorization)
  const u = new URL(rq.url, 'http://x')
  const page = Number(u.searchParams.get('page') || 1)
  const per = Number(u.searchParams.get('per_page') || 10)
  const q = u.searchParams.get('query')
  rs.setHeader('Content-Type', 'application/json')
  if (u.pathname === '/videos/search') {
    rs.end(JSON.stringify({ videos: Array.from({ length: per }, (_, i) => ({
      id: `${q}${page}${i}`, url: 'https://www.pexels.com/video/x', image: 'https://images.pexels.com/v.jpg', width: 1080, height: 1920,
      user: { name: 'Jane Doe', url: 'https://www.pexels.com/@jane' },
      video_files: [{ file_type: 'video/mp4', link: `https://videos.pexels.com/${q}-${page}-${i}-hd.mp4`, width: 720, height: 1280 }, { file_type: 'video/mp4', link: 'https://videos.pexels.com/sd.mp4', width: 360, height: 640 }]
    })) }))
  } else if (u.pathname === '/v1/search') {
    rs.end(JSON.stringify({ photos: Array.from({ length: per }, (_, i) => ({ id: `${q}${page}${i}`, url: 'https://www.pexels.com/photo/x', photographer: 'Sam Lee', photographer_url: 'https://www.pexels.com/@sam', src: { portrait: `https://images.pexels.com/${q}-${page}-${i}.jpg`, medium: 'https://images.pexels.com/m.jpg' } })) }))
  } else if (u.pathname === '/pixabay/api/videos/') {
    seenAuth.push('pixabay:' + u.searchParams.get('key'))
    rs.end(JSON.stringify({ hits: Array.from({ length: per }, (_, i) => ({
      id: Number(`${page}${i}`), pageURL: 'https://pixabay.com/videos/x', user: 'Ravi', user_id: 7,
      videos: { medium: { url: `https://cdn.pixabay.com/${q}-${page}-${i}-m.mp4`, width: i % 2 ? 720 : 1280, height: i % 2 ? 1280 : 720, thumbnail: 'https://cdn.pixabay.com/t.jpg' }, small: { url: `https://cdn.pixabay.com/${q}-${page}-${i}-s.mp4`, width: i % 2 ? 720 : 1280, height: i % 2 ? 1280 : 720, thumbnail: 'https://cdn.pixabay.com/t.jpg' } }
    })) }))
  } else if (u.pathname === '/pixabay/api/') {
    rs.end(JSON.stringify({ hits: Array.from({ length: per }, (_, i) => ({ id: Number(`${page}${i}`), pageURL: 'https://pixabay.com/photos/x', user: 'Mia', user_id: 9, webformatURL: 'https://cdn.pixabay.com/w.jpg', largeImageURL: `https://cdn.pixabay.com/${q}-${page}-${i}-l.jpg`, imageWidth: 800, imageHeight: 1200 })) }))
  } else { rs.statusCode = 404; rs.end('{}') }
})

;(async () => {
  await new Promise((r) => fake.listen(FAKE_PORT, r))
  const [A, B, C] = await Promise.all(['Ela', 'Fin', 'Gus'].map((n) => mkUser(n, uid)))
  // A: one popular post and one quiet post; B (private) posts too; C views Explore without following anyone
  const quiet = (await req('POST', '/posts', A.token, { app: 'pixify', text: 'quiet', media: [{ url: IMG, kind: 'image' }] })).body.post
  const popular = (await req('POST', '/posts', A.token, { app: 'pixify', text: 'popular', media: [{ url: IMG, kind: 'image' }] })).body.post
  await req('POST', '/profile', B.token, { app: 'pixify', private: true })
  const hidden = (await req('POST', '/posts', B.token, { app: 'pixify', text: 'private', media: [{ url: IMG, kind: 'image' }] })).body.post
  const reel = (await req('POST', '/posts', A.token, { app: 'pixify', text: 'reel', media: [{ url: VID, kind: 'video' }] })).body.post
  for (const X of [B, C]) await req('POST', `/posts/${popular._id}/react`, X.token, { type: 'like' })
  await req('POST', `/posts/${popular._id}/comments`, B.token, { text: 'nice' })

  // walk every page of our own posts
  const walk = async (url, token) => {
    const all = []
    let next = null, pages = 0
    do {
      const r = await req('GET', url + (next ? `${url.includes('?') ? '&' : '?'}before=${encodeURIComponent(next)}` : ''), token)
      all.push(...r.body.posts)
      next = r.body.next
      pages++
    } while (next && next.startsWith('p:') && pages < 200)
    return { all, next }
  }
  const ex = await walk('/explore', C.token)
  const ids = ex.all.map((p) => p._id)
  check("Explore shows people you don't follow", ids.includes(popular._id) && ids.includes(quiet._id))
  check('ranked: more likes and comments first', ids.indexOf(popular._id) < ids.indexOf(quiet._id))
  check('private accounts stay out', !ids.includes(hidden._id))
  check('no repeats across pages', new Set(ids).size === ids.length)
  check('after our posts, Pexels continues', ex.next === 'x:1')
  check('your own posts are not in your Explore', !(await walk('/explore', A.token)).all.some((p) => p.author._id === A.id))

  const x1 = await req('GET', '/explore?before=x:1', C.token)
  check('Pexels page: photos and videos', x1.body.posts.length === 24 && x1.body.posts.some((p) => p.media[0].kind === 'video') && x1.body.posts.some((p) => p.media[0].kind === 'image'))
  check('one video every 5 tiles', x1.body.posts[0].media[0].kind === 'video' && x1.body.posts[5].media[0].kind === 'video')
  check('credit for the photographer', x1.body.posts.every((p) => p.external && p.external.source === 'Pexels' && p.external.by && p.external.link))
  check('Pexels key sent', seenAuth.includes('test-key'))
  const x2 = await req('GET', '/explore?before=x:2', C.token)
  check('endless: next page differs', x2.body.next === 'x:3' && x2.body.posts[1].media[0].url !== x1.body.posts[1].media[0].url)

  const rl = await walk('/explore?reels=1', C.token)
  check('Reels from everyone (public)', rl.all.some((p) => p._id === reel._id) && rl.all.every((p) => p.isReel))
  check('Reels continue with Pexels', rl.next === 'x:1')
  const rx = await req('GET', '/explore?reels=1&before=x:1', C.token)
  check('Pexels reels: portrait videos, best file', rx.body.posts.length === 8 && rx.body.posts.every((p) => p.isReel && p.media[0].kind === 'video' && p.media[0].url.endsWith('-hd.mp4') && p.media[0].poster))
  check('bad cursor is safe', (await req('GET', '/explore?before=zzz', C.token)).status === 200)

  // Pixabay (used when PIXABAY_API_KEY is set; tested directly against the fake server)
  process.env.PIXABAY_API_KEY = 'pix-key'
  process.env.PIXABAY_API_BASE = `http://localhost:${FAKE_PORT}/pixabay`
  const pixabay = require('../helpers/pixabay')
  const stock = require('../helpers/stock')
  check('Pixabay is preferred when its key is set', stock.enabled() && pixabay.enabled())
  const pr = await stock.reels(1, 8)
  check('Pixabay reels: videos, tall ones first', pr.length === 8 && pr.every((p) => p.isReel && p.media[0].kind === 'video') && pr[0].media[0].height > pr[0].media[0].width)
  check('Pixabay credit + poster', pr.every((p) => p.external.source === 'Pixabay' && p.external.by === 'Ravi' && p.external.byUrl.includes('/users/Ravi-7/') && p.media[0].poster))
  const pe = await stock.explore(2, 24)
  check('Pixabay explore: tall photos + a video every 5', pe.length === 24 && pe[0].media[0].kind === 'video' && pe[1].media[0].url.endsWith('-l.jpg') && pe[5].media[0].kind === 'video')
  check('Pixabay key sent', seenAuth.includes('pixabay:pix-key'))

  fake.close()
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
