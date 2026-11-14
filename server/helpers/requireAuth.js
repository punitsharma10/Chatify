const getUserDetailsFromToken = require('./getUserDetailsFromToken')

// Express middleware: accepts the auth cookie or an "Authorization: Bearer <token>" header.
const getToken = (req) => {
    const header = req.headers.authorization || ""
    if (header.startsWith('Bearer ')) return header.slice(7)
    return req.cookies?.token || ""
}

const requireAuth = async (req, res, next) => {
    const user = await getUserDetailsFromToken(getToken(req))
    if (!user || user.logout) {
        return res.status(401).json({ message : "session out", logout : true, error : true })
    }
    req.user = user
    next()
}

module.exports = requireAuth
module.exports.getToken = getToken
