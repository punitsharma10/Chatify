// What keeps Pixify Explore and Reels going after your users' posts run out (all optional, keys in server/.env):
//   YOUTUBE_API_KEY  -> YouTube Shorts (real short videos with sound) for Reels and the tall Explore tiles
//   PIXABAY_API_KEY  -> free stock photos (and silent videos) for Explore; Reels too if there's no YouTube key
//   PEXELS_API_KEY   -> same as Pixabay (used if there's no Pixabay key)
// None set = off: Explore and Reels end when your users' posts run out.
const youtube = require('./youtube')
const pixabay = require('./pixabay')
const pexels = require('./pexels')

const photoProvider = () => (pixabay.enabled() ? pixabay : pexels.enabled() ? pexels : null)

const enabled = () => youtube.enabled() || !!photoProvider()

const reels = async (k, per) => {
    if (youtube.enabled()) {
        const shorts = await youtube.reels(k, per).catch((e) => { console.error('[youtube]', e.message); return [] })
        if (shorts.length || !photoProvider()) return shorts
    }
    return photoProvider() ? photoProvider().reels(k, per) : []
}

// Explore: Shorts in the tall tiles (one in every 5), photos around them
const explore = async (k, per) => {
    const photos = photoProvider()
    if (!youtube.enabled()) return photos ? photos.explore(k, per) : []
    const tall = Math.round(per / 5)
    const [shorts, stock] = await Promise.all([
        youtube.exploreShorts(k, tall),
        photos ? photos.explore(k, per).catch(() => []) : []
    ])
    const pics = stock.filter((p) => p.media[0].kind === 'image')
    // no stock photos: a page of Shorts only (from later searches, so they differ from Reels)
    if (!pics.length) return youtube.shorts(5000 + (k - 1) * per, per).catch(() => [])
    const out = []
    while (shorts.length || pics.length) {
        if (shorts.length) out.push(shorts.shift())
        out.push(...pics.splice(0, 4))
    }
    return out
}

module.exports = { enabled, reels, explore }
