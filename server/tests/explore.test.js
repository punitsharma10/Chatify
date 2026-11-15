// Pixify Explore / Reels: everyone's public posts, ranked by engagement, paged with "p:N" cursors, and endless with
// YouTube Shorts after our own posts run out (a fake YouTube server stands in for the real one).
const http = require('http')
const { makeUser: mkUser } = require('./users')
const API = process.env.TEST_API || 'http://localhost:5055'
const FAKE_PORT = Number(new URL(process.env.YOUTUBE_API_BASE || 'http://localhost:5099/youtube/v3').port)

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

// fake YouTube Data API search: 50 Shorts per page, page tokens r0, r1, ...
const seen = []
const fake = http.createServer((rq, rs) => {
  const u = new URL(rq.url, 'http://x')
  rs.setHeader('Content-Type', 'application/json')
  if (u.pathname !== '/youtube/v3/search') { rs.statusCode = 404; return rs.end('{}') }
  seen.push([u.searchParams.get('key'), u.searchParams.get('videoDuration'), u.searchParams.get('videoEmbeddable'), u.searchParams.get('type')].join(':'))
  if (u.searchParams.get('key') === 'over-quota') { rs.statusCode = 403; return rs.end('{"error":{"errors":[{"reason":"quotaExceeded"}]}}') }
  const r = Number((u.searchParams.get('pageToken') || 'r0').slice(1))
  const topic = u.searchParams.get('q').split(' ')[0]
  rs.end(JSON.stringify({ nextPageToken: 'r' + (r + 1), items: Array.from({ length: Number(u.searchParams.get('maxResults')) }, (_, i) => ({
    id: { videoId: `${topic}-${r}-${i}` },
    snippet: { title: 'Fun &amp; games #shorts', channelTitle: 'Cool Channel', channelId: 'UC123', publishedAt: '2026-01-01T00:00:00Z', thumbnails: { high: { url: `https://i.ytimg.com/vi/x${i}/hqdefault.jpg` } } }
  })) }))
})

;(async () => {
  await new Promise((r) => fake.listen(FAKE_PORT, r))
  const [A, B, C] = await Promise.all(['Ela', 'Fin', 'Gus'].map((n) => mkUser(n, uid)))
  // A: a popular post and a quiet one; B (private) posts too; C looks at Explore without following anyone
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
  check('after our posts, YouTube Shorts continue', ex.next === 'x:1')
  check('your own posts are not in your Explore', !(await walk('/explore', A.token)).all.some((p) => p.author._id === A.id))

  const rl = await walk('/explore?reels=1', C.token)
  check('Reels from everyone (public)', rl.all.some((p) => p._id === reel._id) && rl.all.every((p) => p.isReel))
  check('Reels continue with Shorts', rl.next === 'x:1')

  const y1 = await req('GET', '/explore?reels=1&before=x:1', C.token)
  const s1 = y1.body.posts
  check('Shorts page', s1.length === 8 && y1.body.next === 'x:2' && s1.every((p) => p.media[0].youtube && p.isReel && p.external.source === 'YouTube'))
  check('only short, embeddable videos are asked for', seen.includes('test-key:short:true:video'))
  check('channel credited, link to the Short, title decoded, preview image', s1[0].external.by === 'Cool Channel' && s1[0].external.link.startsWith('https://www.youtube.com/shorts/') && s1[0].text === 'Fun & games #shorts' && s1[0].media[0].poster)
  const y7 = (await req('GET', '/explore?reels=1&before=x:7', C.token)).body.posts // positions 48..55
  check('Shorts pages continue across searches', y7.length === 8 && y7[0].media[0].youtube === 'nature-0-48' && y7[2].media[0].youtube === 'travel-0-0')
  const deep = (await req('GET', `/explore?reels=1&before=x:${1 + (20 * 50) / 8}`, C.token)).body.posts
  check('later rounds use YouTube page tokens', deep.length === 8 && deep[0].media[0].youtube.startsWith('nature-1-'))
  const two = [...(await req('GET', '/explore?reels=1&before=x:2', C.token)).body.posts, ...(await req('GET', '/explore?reels=1&before=x:3', C.token)).body.posts]
  check('no repeats between Shorts pages', new Set([...s1, ...two].map((p) => p._id)).size === 24)

  // Shorts work like any reel: like, comment, save, share; each is stored once
  const short = s1[0]
  check('a Short has a real post id', /^[a-f0-9]{24}$/.test(short._id) && short.author.external && short.author.name === 'Cool Channel')
  check('like a Short', (await req('POST', `/posts/${short._id}/react`, C.token, { type: 'like' })).body.reactionCount === 1)
  check('comment on a Short', (await req('POST', `/posts/${short._id}/comments`, A.token, { text: 'So good!' })).status === 200)
  check('save a Short', (await req('POST', `/posts/${short._id}/save`, C.token)).body.saved === true)
  const again = (await req('GET', '/explore?reels=1&before=x:1', B.token)).body.posts[0]
  check('same Short, same post (counts kept)', again._id === short._id && again.reactionCount === 1 && again.commentCount === 1)
  check('open a Short on its own', (await req('GET', '/posts/' + short._id, B.token)).body.post.media[0].youtube === short.media[0].youtube)
  check('share a Short in Direct', (await req('POST', '/dm/share', A.token, { postId: short._id, userIds: [C.id] })).body.sent === 1)
  check("can't delete a Short", (await req('DELETE', '/posts/' + short._id, A.token)).status === 404)
  check('Shorts stay out of hashtag pages', !(await req('GET', '/hashtags/shorts?app=pixify', C.token)).body.posts.length)

  const e1 = await req('GET', '/explore?before=x:1', C.token)
  check('Explore page of Shorts', e1.body.posts.length === 24 && e1.body.posts.every((p) => p.media[0].youtube) && e1.body.next === 'x:2')
  check("Explore doesn't open with the same Shorts as Reels", !s1.some((p) => p._id === e1.body.posts[0]._id))
  check('bad cursor is safe', (await req('GET', '/explore?before=zzz', C.token)).status === 200)

  // the helper on its own: no key = off, quota exceeded = reported
  process.env.YOUTUBE_API_BASE = `http://localhost:${FAKE_PORT}/youtube/v3`
  const youtube = require('../helpers/youtube')
  process.env.YOUTUBE_API_KEY = ''
  check('no key: off', !youtube.enabled() && (await youtube.reels(1, 8)).length === 0)
  process.env.YOUTUBE_API_KEY = 'over-quota'
  let quota = null
  try { await youtube.reels(30, 8) } catch (e) { quota = e.message }
  check('quota exceeded is reported', /quota/i.test(quota || ''))

  fake.close()
  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
