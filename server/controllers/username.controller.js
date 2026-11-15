const { normalizeUsername, usernameProblem, usernameAvailable, suggestUsernames } = require('../helpers/username')
const { getToken } = require('../helpers/requireAuth')
const getUserDetailsFromToken = require('../helpers/getUserDetailsFromToken')

// POST /api/username/check  { username, name? }
// -> { available, problem?, suggestions? }. Works signed out (registration) and signed in (your own name counts as free).
const checkUsername = async (req, res) => {
    try {
        const username = normalizeUsername(req.body?.username)
        let meId = null
        const token = getToken(req)
        if (token) {
            const me = await getUserDetailsFromToken(token).catch(() => null)
            if (me && !me.logout) meId = me._id
        }
        const problem = usernameProblem(username)
        if (problem) return res.json({ success : true, username, available : false, problem })
        const available = await usernameAvailable(username, meId)
        const base = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name : username
        return res.json({
            success : true,
            username,
            available,
            ...(available ? {} : { problem : 'This username is taken.', suggestions : await suggestUsernames(base, meId) })
        })
    } catch (error) {
        return res.status(500).json({ message : error.message || error, error : true })
    }
}

module.exports = { checkUsername }
