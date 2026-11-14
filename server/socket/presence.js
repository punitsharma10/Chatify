// In-memory presence store.
// A user can have several sockets (tabs / devices). They are "online" while at least one is connected,
// so closing one tab no longer marks them offline. Socket.IO's heartbeat (pingInterval/pingTimeout)
// removes dead connections, which keeps this list from going stale when a network drops.

const entries = new Map() // userId -> { count, mode:'everyone'|'contacts'|'nobody', contacts:Set<string>, blocked:Set<string> }

const toSet = (list) => new Set((list || []).map(String))
const contactSet = (user) => new Set((user?.contacts || []).map((c) => String(c.userId)))
const modeOf = (user) => user?.privacy?.online || 'everyone'

const add = (user) => {
    const id = String(user._id)
    const entry = entries.get(id)
    if (entry) {
        entry.count += 1
        return false
    }
    entries.set(id, {
        count : 1,
        mode : modeOf(user),
        contacts : contactSet(user),
        blocked : toSet(user.blocked)
    })
    return true
}

// returns true when the user's last connection closed
const remove = (userId) => {
    const id = String(userId)
    const entry = entries.get(id)
    if (!entry) return false
    entry.count -= 1
    if (entry.count <= 0) {
        entries.delete(id)
        return true
    }
    return false
}

// refresh cached privacy / block list after the user changes settings
const update = (user) => {
    const entry = entries.get(String(user._id))
    if (!entry) return
    entry.mode = modeOf(user)
    entry.contacts = contactSet(user)
    entry.blocked = toSet(user.blocked)
}

const isOnline = (userId) => entries.has(String(userId))

// is `userId` shown as online to `viewerId`? (privacy + blocking aware)
const isVisiblyOnline = (userId, viewerId) => {
    const entry = entries.get(String(userId))
    if (!entry) return false
    if (String(userId) === String(viewerId)) return true
    if (entry.mode === 'nobody') return false
    if (entry.mode === 'contacts' && !entry.contacts.has(String(viewerId))) return false
    if (entry.blocked.has(String(viewerId))) return false
    const viewer = entries.get(String(viewerId))
    if (viewer && viewer.blocked.has(String(userId))) return false
    return true
}

// list of online user ids that `viewerId` is allowed to see
const visibleOnlineFor = (viewerId) => {
    const list = []
    for (const id of entries.keys()) {
        if (isVisiblyOnline(id, viewerId)) list.push(id)
    }
    return list
}

const onlineIds = () => Array.from(entries.keys())

module.exports = { add, remove, update, isOnline, isVisiblyOnline, visibleOnlineFor, onlineIds }
