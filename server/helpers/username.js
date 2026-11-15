const UserModel = require('../models/user.model')

// One public @username per account, shared by Chats, Pixify and Connectify.
// Rules (like Instagram): 3-30 characters, lowercase letters, numbers, dots and underscores,
// no dot at the start or end, and no two dots in a row.
const USERNAME_RE = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{3,30}$/

// names that would look official or clash with app pages
const RESERVED = new Set([
    'chatify', 'pixify', 'connectify', 'admin', 'administrator', 'support', 'help', 'official', 'root',
    'system', 'security', 'moderator', 'staff', 'team', 'about', 'settings', 'login', 'logout', 'register',
    'explore', 'reels', 'stories', 'story', 'profile', 'friends', 'groups', 'api', 'www', 'me', 'you'
])

const normalizeUsername = (value) => (typeof value === 'string' ? value.trim().replace(/^@/, '').toLowerCase() : '')

// returns an error message, or '' when the username is well formed
const usernameProblem = (name) => {
    if (!name) return 'Choose a username.'
    if (name.length < 3) return 'Usernames need at least 3 characters.'
    if (name.length > 30) return 'Usernames can have at most 30 characters.'
    if (!/^[a-z0-9._]+$/.test(name)) return 'Usernames can only use letters, numbers, dots and underscores.'
    if (!USERNAME_RE.test(name)) return "Usernames can't start or end with a dot, or have two dots in a row."
    if (/^[0-9._]+$/.test(name)) return 'Usernames need at least one letter.'
    if (RESERVED.has(name)) return 'This username isn\'t available.'
    return ''
}

// is `name` free (ignoring the account `exceptId`, so keeping your own name counts as available)?
const usernameAvailable = async (name, exceptId) => {
    const taken = await UserModel.findOne({ username : name, ...(exceptId ? { _id : { $ne : exceptId } } : {}) }).select('_id').lean()
    return !taken
}

// a few free usernames close to `base`, e.g. after "punit" is taken: punit.10, punit_07, ...
const suggestUsernames = async (base, exceptId) => {
    let root = normalizeUsername(base).replace(/[^a-z0-9._]/g, '').replace(/\.{2,}/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 24)
    if (root.length < 3 || /^[0-9._]+$/.test(root)) root = 'user'
    const candidates = [root, `${root}_`, `${root}.${Math.floor(Math.random() * 90) + 10}`, `${root}_${Math.floor(Math.random() * 900) + 100}`, `the.${root}`, `${root}${new Date().getFullYear() % 100}`]
        .filter((c, i, all) => all.indexOf(c) === i && !usernameProblem(c))
    const taken = new Set((await UserModel.find({ username : { $in : candidates }, ...(exceptId ? { _id : { $ne : exceptId } } : {}) }).select('username').lean()).map((u) => u.username))
    return candidates.filter((c) => !taken.has(c)).slice(0, 3)
}

module.exports = { USERNAME_RE, normalizeUsername, usernameProblem, usernameAvailable, suggestUsernames }
