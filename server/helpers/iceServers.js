// ICE servers for calls.
//  - STUN (free, Google): lets two browsers find each other's public address. Enough on the same Wi-Fi.
//  - TURN: relays the audio/video when a direct connection is impossible, which is the normal case on
//    Indian mobile data (Jio / Airtel use carrier-grade NAT) and many home routers. Without TURN those
//    calls fail with "Couldn't connect".
//
// Two ways to add TURN (set on Render → Environment):
//  1. Cloudflare TURN (recommended, 1,000 GB/month free):
//       CLOUDFLARE_TURN_KEY_ID, CLOUDFLARE_TURN_API_TOKEN
//     Short-lived credentials are generated here and refreshed automatically.
//  2. Any other TURN provider with fixed credentials (e.g. Metered):
//       TURN_URLS (comma separated), TURN_USERNAME, TURN_CREDENTIAL

const STUN = { urls : ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
const TTL_SECONDS = 24 * 60 * 60

let cache = { servers : null, expiresAt : 0 }
let inFlight = null

const staticTurn = () => {
    const urls = (process.env.TURN_URLS || '').split(',').map((u) => u.trim()).filter(Boolean)
    return urls.length ? [{ urls, username : process.env.TURN_USERNAME || '', credential : process.env.TURN_CREDENTIAL || '' }] : []
}

// Browsers refuse port 53 for TURN; Cloudflare's own docs say to drop those addresses.
const dropPort53 = (server) => {
    const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((u) => !/:53(\?|$)/.test(u))
    return urls.length ? { ...server, urls } : null
}

const fetchCloudflare = async () => {
    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID
    const token = process.env.CLOUDFLARE_TURN_API_TOKEN
    if (!keyId || !token) return null
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
        method : 'POST',
        headers : { Authorization : `Bearer ${token}`, 'Content-Type' : 'application/json' },
        body : JSON.stringify({ ttl : TTL_SECONDS }),
        signal : AbortSignal.timeout(5000)
    })
    if (!res.ok) throw new Error(`Cloudflare TURN responded ${res.status}`)
    const data = await res.json()
    // newer API: { iceServers: [ ... ] }   older API: { iceServers: { urls, username, credential } }
    const list = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : []
    return list.map(dropPort53).filter(Boolean)
}

// Always resolves (falls back to STUN + any fixed TURN if Cloudflare is unreachable).
const getIceServers = async () => {
    if (cache.servers && Date.now() < cache.expiresAt) return cache.servers
    if (!inFlight) {
        inFlight = (async () => {
            let turn = staticTurn()
            try {
                const cf = await fetchCloudflare()
                if (cf && cf.length) {
                    turn = [...cf, ...turn]
                    // reuse for half the credential lifetime, then fetch fresh ones
                    cache = { servers : [STUN, ...turn], expiresAt : Date.now() + (TTL_SECONDS / 2) * 1000 }
                    return cache.servers
                }
            } catch (error) {
                console.error('[calls] could not get Cloudflare TURN credentials:', error.message)
            }
            const servers = [STUN, ...turn]
            // without Cloudflare: cache briefly so a fixed config is cheap, and a Cloudflare outage is retried soon
            cache = { servers, expiresAt : Date.now() + 60 * 1000 }
            return servers
        })().finally(() => { inFlight = null })
    }
    return inFlight
}

const turnConfigured = () => !!((process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN) || process.env.TURN_URLS)

module.exports = { getIceServers, turnConfigured, _reset : () => { cache = { servers : null, expiresAt : 0 } } }
