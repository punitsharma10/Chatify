// Free stock photos / videos that keep Pixify Explore and Reels going after your users' posts run out.
// Uses Pixabay (PIXABAY_API_KEY) or Pexels (PEXELS_API_KEY), whichever key is in server/.env; none = off.
const pixabay = require('./pixabay')
const pexels = require('./pexels')

const provider = () => (pixabay.enabled() ? pixabay : pexels.enabled() ? pexels : null)

module.exports = {
    enabled : () => !!provider(),
    reels : (k, per) => provider()?.reels(k, per) || [],
    explore : (k, per) => provider()?.explore(k, per) || []
}
