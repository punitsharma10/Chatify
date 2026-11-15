const SessionModel = require('../models/session.model')

const TOKEN_DAYS = 7

// short, human readable device name from a user-agent string ("Chrome on Windows")
const describeAgent = (ua = '') => {
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
        : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
    const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
    return os ? `${browser} on ${os}` : browser
}

const createSession = async (userId, req) => SessionModel.create({
    userId,
    userAgent : String(req.headers['user-agent'] || '').slice(0, 400),
    ip : String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64),
    expiresAt : new Date(Date.now() + TOKEN_DAYS * 24 * 60 * 60 * 1000)
})

// is the session in this token still signed in? (tokens issued before sessions existed have no sid and stay valid until they expire)
const sessionActive = async (sid) => {
    if (!sid) return true
    const s = await SessionModel.findById(sid).select('revokedAt').lean()
    return !!s && !s.revokedAt
}

// remember when a device was last used (at most once a minute per session)
const touched = new Map()
const touchSession = (sid) => {
    if (!sid) return
    const now = Date.now()
    if (now - (touched.get(sid) || 0) < 60 * 1000) return
    touched.set(sid, now)
    SessionModel.updateOne({ _id : sid }, { $set : { lastActiveAt : new Date() } }).catch(() => {})
}

module.exports = { TOKEN_DAYS, describeAgent, createSession, sessionActive, touchSession }
