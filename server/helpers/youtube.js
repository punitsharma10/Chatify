// YouTube Shorts keep Pixify Reels and Explore going after your users' posts run out (real short videos with sound),
// via the free YouTube Data API. Without a key, Reels and Explore end when your users' posts run out.
// Free, no card: create a Google Cloud project, enable "YouTube Data API v3", create an API key, and add
// YOUTUBE_API_KEY=... to server/.env. The free quota is 10,000 units a day and one search costs 100, so results
// are cached for 24 hours and each search returns 50 Shorts (one search fills ~6 pages of Reels).
// YouTube's terms: Shorts play in YouTube's own embedded player, with the channel credited.

// topics take turns so every page is different
const TOPICS = ['nature', 'travel', 'food', 'city', 'ocean', 'mountains', 'animals', 'dance', 'sports', 'fashion', 'cars', 'art', 'coffee', 'sunset', 'beach', 'music', 'fitness', 'flowers', 'street', 'architecture']

const PER_SEARCH = 50
const CACHE_MS = 24 * 60 * 60 * 1000
const cache = new Map()
let quotaHitUntil = 0 // after "quota exceeded", stop asking until tomorrow

const key = () => (process.env.YOUTUBE_API_KEY || '').trim()
const base = () => (process.env.YOUTUBE_API_BASE || 'https://www.googleapis.com/youtube/v3').replace(/\/$/, '')
const enabled = () => !!key()

const decode = (s = '') => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

const search = async (topic, pageToken = '') => {
    const id = `${topic}|${pageToken}`
    const hit = cache.get(id)
    if (hit && hit.until > Date.now()) return hit.data
    if (quotaHitUntil > Date.now()) return { items : [] }
    const qs = new URLSearchParams({
        part : 'snippet', type : 'video', videoDuration : 'short', videoEmbeddable : 'true', safeSearch : 'strict',
        q : `${topic} #shorts`, maxResults : String(PER_SEARCH), key : key(), ...(pageToken ? { pageToken } : {})
    })
    const res = await fetch(`${base()}/search?${qs}`, { signal : AbortSignal.timeout(8000) })
    if (res.status === 403) {
        quotaHitUntil = Date.now() + 60 * 60 * 1000
        throw new Error('YouTube quota exceeded or key not allowed')
    }
    if (!res.ok) throw new Error(`YouTube ${res.status}`)
    const data = await res.json()
    cache.set(id, { data, until : Date.now() + CACHE_MS })
    if (cache.size > 500) cache.delete(cache.keys().next().value)
    return data
}

// round r of a topic needs the page token from round r-1 (all cached after the first time)
const roundOf = async (topic, round) => {
    let token = ''
    let data = null
    for (let r = 0; r <= round; r++) {
        data = await search(topic, token)
        if (r < round) {
            token = data.nextPageToken || ''
            if (!token) return { items : [] }
        }
    }
    return data
}

const card = (item) => {
    const id = item.id?.videoId
    const s = item.snippet || {}
    if (!id) return null
    const thumbs = s.thumbnails || {}
    return {
        _id : `yt-${id}`,
        app : 'pixify',
        external : { source : 'YouTube', by : decode(s.channelTitle) || 'YouTube', byUrl : s.channelId ? `https://www.youtube.com/channel/${s.channelId}` : 'https://www.youtube.com', link : `https://www.youtube.com/shorts/${id}` },
        author : { _id : 'youtube', name : decode(s.channelTitle) || 'YouTube', username : '', profile_pic : '' },
        text : decode(s.title),
        media : [{ kind : 'video', youtube : id, url : `https://www.youtube.com/shorts/${id}`, width : 1080, height : 1920, poster : (thumbs.high || thumbs.medium || thumbs.default || {}).url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }],
        isReel : true,
        reactionCount : 0, commentCount : 0, reactionCounts : {}, topReactions : [], myReaction : null,
        commentsOff : true, saved : false, mine : false, tagged : [], location : '', feeling : '',
        createdAt : s.publishedAt || new Date().toISOString()
    }
}

// `count` Shorts starting at overall position `offset` (topics take turns, 50 per search)
const shorts = async (offset, count) => {
    if (!enabled()) return []
    const out = []
    let pos = offset
    // at most 3 searches per page (a search can return fewer than 50 results)
    for (let tries = 0; tries < 3 && out.length < count; tries++) {
        const chunk = Math.floor(pos / PER_SEARCH)
        const round = Math.floor(chunk / TOPICS.length)
        if (round > 9) break
        const data = await roundOf(TOPICS[chunk % TOPICS.length], round)
        const cards = (data.items || []).map(card).filter(Boolean)
        const start = pos % PER_SEARCH
        out.push(...cards.slice(start, start + (count - out.length)))
        pos = (chunk + 1) * PER_SEARCH
    }
    return out
}

// Reels page k (1, 2, ...): `per` Shorts. Explore page k: `per` Shorts, starting halfway into the first search so
// Explore doesn't open with the same videos as Reels (both reuse the same cached searches, saving quota).
const reels = (k, per = 8) => shorts((k - 1) * per, per)
const explore = (k, per = 24) => shorts(25 + (k - 1) * per, per)

module.exports = { enabled, reels, explore, PER_SEARCH, TOPICS }
