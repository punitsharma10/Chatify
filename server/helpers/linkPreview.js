// Link previews (title / description / image of the first link in a message), fetched by the server.
// Free: reads the page's own Open Graph / <title> tags, no third-party API.
// Safe: only public http(s) addresses are fetched (no localhost / private networks), with size, time and redirect limits.
const dns = require('dns').promises
const net = require('net')

const LINK = /https?:\/\/[^\s<]+[^\s<.,:;"')\]!?]/i
const MAX_BYTES = 512 * 1024
const TIMEOUT_MS = 5000
const MAX_REDIRECTS = 3
const cache = new Map() // url -> { at, data }
const CACHE_MS = 60 * 60 * 1000

const firstLink = (text) => {
    const m = typeof text === 'string' ? LINK.exec(text) : null
    return m ? m[0] : null
}

const privateV4 = (ip) => {
    const [a, b] = ip.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}
const privateIp = (ip) => {
    if (net.isIPv4(ip)) return privateV4(ip)
    const v = ip.toLowerCase()
    if (v.startsWith('::ffff:')) return privateV4(v.slice(7))
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')
}

// tests run a local page; production never allows private addresses
const allowPrivate = () => process.env.LINK_PREVIEW_ALLOW_PRIVATE === '1' && process.env.NODE_ENV !== 'production'

const checkUrl = async (raw) => {
    let u
    try { u = new URL(raw) } catch { return null }
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null
    if (u.port && !['80', '443'].includes(u.port) && !allowPrivate()) return null
    if (allowPrivate()) return u
    const host = u.hostname.replace(/^\[|\]$/g, '')
    const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all : true }).catch(() => [])).map((a) => a.address)
    if (!addresses.length || addresses.some(privateIp)) return null
    return u
}

const decode = (s = '') => s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n) || 32))
    .replace(/\s+/g, ' ').trim()

const meta = (html, names) => {
    for (const name of names) {
        const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i')
        const tag = re.exec(html)?.[0]
        const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1]
        if (content) return decode(content)
    }
    return ''
}

const readLimited = async (res) => {
    const reader = res.body.getReader()
    const chunks = []
    let size = 0
    while (size < MAX_BYTES) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        size += value.length
    }
    reader.cancel().catch(() => {})
    return Buffer.concat(chunks).toString('utf8')
}

const fetchPreview = async (rawUrl) => {
    const cached = cache.get(rawUrl)
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.data

    let url = rawUrl
    let res
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
        const safe = await checkUrl(url)
        if (!safe) return null
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
        try {
            res = await fetch(safe, { redirect : 'manual', signal : ctrl.signal, headers : { 'User-Agent' : 'ChatifyLinkPreview/1.0', Accept : 'text/html' } })
        } catch {
            return null
        } finally {
            clearTimeout(timer)
        }
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
            url = new URL(res.headers.get('location'), safe).toString()
            continue
        }
        break
    }
    if (!res || !res.ok || !/text\/html/i.test(res.headers.get('content-type') || '')) return null

    const html = await readLimited(res)
    const title = (meta(html, ['og:title', 'twitter:title']) || decode(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] || '')).slice(0, 200)
    if (!title) return null
    const description = meta(html, ['og:description', 'twitter:description', 'description']).slice(0, 300)
    let image = meta(html, ['og:image', 'og:image:url', 'twitter:image'])
    try { image = image ? new URL(image, url).toString() : '' } catch { image = '' }
    // images are loaded by the reader's browser: only https, never data:/javascript:
    if (!/^https:\/\//i.test(image) && !allowPrivate()) image = ''
    const siteName = (meta(html, ['og:site_name']) || new URL(url).hostname.replace(/^www\./, '')).slice(0, 80)

    const data = { url : rawUrl, title, description, image : image.slice(0, 1000), siteName }
    cache.set(rawUrl, { at : Date.now(), data })
    if (cache.size > 500) cache.delete(cache.keys().next().value)
    return data
}

module.exports = { firstLink, fetchPreview, privateIp }
