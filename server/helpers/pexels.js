// Optional: fills Pixify Explore and Reels with free stock photos and videos from Pexels (https://www.pexels.com/api/)
// once your own users' posts run out, so they never end, like Instagram.
// Free: sign up with an email, no card. Add PEXELS_API_KEY=... to server/.env. Without a key this does nothing.
// Pexels asks apps to credit the photographer and Pexels; the app shows "Video by X on Pexels" on each item.

const TOPICS = ['nature', 'travel', 'food', 'city', 'ocean', 'mountains', 'animals', 'dance', 'sports', 'fashion', 'cars', 'art', 'coffee', 'sunset', 'beach', 'music', 'fitness', 'flowers', 'street', 'architecture']
const CACHE_MS = 60 * 60 * 1000
const cache = new Map()

const key = () => (process.env.PEXELS_API_KEY || '').trim()
const base = () => (process.env.PEXELS_API_BASE || 'https://api.pexels.com').replace(/\/$/, '')
const enabled = () => !!key()

const get = async (path) => {
    const hit = cache.get(path)
    if (hit && hit.until > Date.now()) return hit.data
    const res = await fetch(base() + path, { headers : { Authorization : key() }, signal : AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`Pexels ${res.status}`)
    const data = await res.json()
    cache.set(path, { data, until : Date.now() + CACHE_MS })
    if (cache.size > 500) cache.delete(cache.keys().next().value)
    return data
}

// the mp4 closest to 720p wide (portrait reels: closest to 1280 tall)
const bestFile = (files = []) => {
    const mp4 = files.filter((f) => f.file_type === 'video/mp4' && f.link)
    if (!mp4.length) return null
    return mp4.sort((a, b) => Math.abs(Math.max(a.width, a.height) - 1280) - Math.abs(Math.max(b.width, b.height) - 1280))[0]
}

const card = (id, by, byUrl, link, media, isReel) => ({
    _id : id,
    app : 'pixify',
    external : { source : 'Pexels', by : by || 'Pexels', byUrl : byUrl || 'https://www.pexels.com', link : link || 'https://www.pexels.com' },
    author : { _id : 'pexels', name : by || 'Pexels', username : '', profile_pic : '' },
    text : '',
    media : [media],
    isReel,
    reactionCount : 0, commentCount : 0, reactionCounts : {}, topReactions : [], myReaction : null,
    commentsOff : true, saved : false, mine : false, tagged : [], location : '', feeling : '',
    createdAt : new Date().toISOString()
})

const videoCard = (v) => {
    const f = bestFile(v.video_files)
    if (!f) return null
    return card(`pexels-v-${v.id}`, v.user?.name, v.user?.url, v.url, { url : f.link, kind : 'video', width : f.width || v.width, height : f.height || v.height, poster : v.image }, true)
}
const photoCard = (p) => card(`pexels-p-${p.id}`, p.photographer, p.photographer_url, p.url,
    { url : p.src?.portrait || p.src?.large, kind : 'image', width : 800, height : 1200, poster : p.src?.medium }, false)

// page k (1, 2, 3, ...) cycles through topics so every page is different
const topicFor = (k) => ({ topic : TOPICS[(k - 1) % TOPICS.length], page : Math.floor((k - 1) / TOPICS.length) + 1 })

// Reels: portrait videos
const reels = async (k, per = 8) => {
    if (!enabled()) return []
    const { topic, page } = topicFor(k)
    const data = await get(`/videos/search?query=${encodeURIComponent(topic)}&orientation=portrait&size=medium&per_page=${per}&page=${page}`)
    return (data.videos || []).map(videoCard).filter(Boolean)
}

// Explore: mostly photos with some videos
const explore = async (k, per = 24) => {
    if (!enabled()) return []
    const { topic, page } = topicFor(k)
    const videos = Math.round(per / 5)
    const [p, v] = await Promise.all([
        get(`/v1/search?query=${encodeURIComponent(topic)}&orientation=portrait&per_page=${per - videos}&page=${page}`),
        get(`/videos/search?query=${encodeURIComponent(topic)}&orientation=portrait&size=medium&per_page=${videos}&page=${page}`)
    ])
    const photos = (p.photos || []).map(photoCard)
    const clips = (v.videos || []).map(videoCard).filter(Boolean)
    // one video every 5 tiles (Instagram's tall Explore tile)
    const out = []
    while (photos.length || clips.length) {
        if (clips.length) out.push(clips.shift())
        out.push(...photos.splice(0, 4))
    }
    return out
}

module.exports = { enabled, reels, explore, TOPICS }
