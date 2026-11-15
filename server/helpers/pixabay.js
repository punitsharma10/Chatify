// Optional: free stock photos and videos from Pixabay (https://pixabay.com/api/docs/) for Pixify Explore and Reels.
// Free: create a Pixabay account (email only, no card); the key is shown on the API docs page once logged in.
// Add PIXABAY_API_KEY=... to server/.env. Pixabay asks apps to cache results for 24 hours and to show where the
// photos and videos come from; the app shows "Video by X on Pixabay" on each item.

const { TOPICS } = require('./pexels')

const CACHE_MS = 24 * 60 * 60 * 1000
const cache = new Map()
const key = () => (process.env.PIXABAY_API_KEY || '').trim()
const base = () => (process.env.PIXABAY_API_BASE || 'https://pixabay.com').replace(/\/$/, '')
const enabled = () => !!key()

const get = async (path, params) => {
    const qs = new URLSearchParams({ ...params, key : key(), safesearch : 'true' })
    const id = path + '?' + new URLSearchParams(params)
    const hit = cache.get(id)
    if (hit && hit.until > Date.now()) return hit.data
    const res = await fetch(`${base()}${path}?${qs}`, { signal : AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`Pixabay ${res.status}`)
    const data = await res.json()
    cache.set(id, { data, until : Date.now() + CACHE_MS })
    if (cache.size > 1000) cache.delete(cache.keys().next().value)
    return data
}

const userUrl = (h) => (h.user && h.user_id ? `https://pixabay.com/users/${encodeURIComponent(h.user)}-${h.user_id}/` : 'https://pixabay.com')

const card = (id, h, media, isReel) => ({
    _id : id,
    app : 'pixify',
    external : { source : 'Pixabay', by : h.user || 'Pixabay', byUrl : userUrl(h), link : h.pageURL || 'https://pixabay.com' },
    author : { _id : 'pixabay', name : h.user || 'Pixabay', username : '', profile_pic : '' },
    text : '',
    media : [media],
    isReel,
    reactionCount : 0, commentCount : 0, reactionCounts : {}, topReactions : [], myReaction : null,
    commentsOff : true, saved : false, mine : false, tagged : [], location : '', feeling : '',
    createdAt : new Date().toISOString()
})

// the lightest file that still looks sharp on a phone (960px+ on the long side, under 20 MB), else the smallest;
// clips longer than a minute are skipped (reels are short, and long files are heavy)
const MAX_BYTES = 20 * 1024 * 1024
const videoCard = (h) => {
    if (h.duration && h.duration > 60) return null
    const v = h.videos || {}
    const files = [v.tiny, v.small, v.medium, v.large].filter((x) => x?.url)
    if (!files.length) return null
    const sharp = files.filter((x) => Math.max(x.width || 0, x.height || 0) >= 960 && (!x.size || x.size <= MAX_BYTES))
    const f = sharp.length ? sharp.reduce((a, b) => ((a.size || Infinity) <= (b.size || Infinity) ? a : b)) : files.reduce((a, b) => ((a.size || Infinity) <= (b.size || Infinity) ? a : b))
    const poster = f.thumbnail || v.medium?.thumbnail || v.small?.thumbnail || (h.picture_id ? `https://i.vimeocdn.com/video/${h.picture_id}_640x360.jpg` : undefined)
    return card(`pixabay-v-${h.id}`, h, { url : f.url, kind : 'video', width : f.width, height : f.height, ...(poster ? { poster } : {}) }, true)
}
const photoCard = (h) => card(`pixabay-p-${h.id}`, h,
    { url : h.largeImageURL || h.webformatURL, kind : 'image', width : h.imageWidth, height : h.imageHeight, poster : h.webformatURL }, false)

// Pixabay serves at most 500 results per search: cycle topics, then go deeper into each
const topicFor = (k, per) => {
    const pagesPerTopic = Math.max(1, Math.floor(500 / per))
    const round = Math.floor((k - 1) / TOPICS.length)
    return { topic : TOPICS[(k - 1) % TOPICS.length], page : (round % pagesPerTopic) + 1 }
}

// Reels: videos, tall ones first (Pixabay can't filter videos by orientation)
const reels = async (k, per = 8) => {
    if (!enabled()) return []
    const { topic, page } = topicFor(k, 30)
    const data = await get('/api/videos/', { q : topic, per_page : '30', page : String(page) })
    const cards = (data.hits || []).map(videoCard).filter(Boolean)
    cards.sort((a, b) => (b.media[0].height > b.media[0].width) - (a.media[0].height > a.media[0].width))
    return cards.slice(0, per)
}

// Explore: tall photos with a video every 5 tiles
const explore = async (k, per = 24) => {
    if (!enabled()) return []
    const videos = Math.round(per / 5)
    const { topic, page } = topicFor(k, per)
    const [p, v] = await Promise.all([
        get('/api/', { q : topic, image_type : 'photo', orientation : 'vertical', per_page : String(per - videos), page : String(page) }),
        get('/api/videos/', { q : topic, per_page : String(Math.max(3, videos)), page : String(page) })
    ])
    const photos = (p.hits || []).map(photoCard)
    const clips = (v.hits || []).map(videoCard).filter(Boolean).slice(0, videos)
    const out = []
    while (photos.length || clips.length) {
        if (clips.length) out.push(clips.shift())
        out.push(...photos.splice(0, 4))
    }
    return out
}

module.exports = { enabled, reels, explore }
