const { hasBlocked } = require('./chat')

const STATUS_TTL_MS = 24 * 60 * 60 * 1000
const STATUS_BACKGROUNDS = ['#00a884', '#5796ff', '#7e57c2', '#ff8a65', '#e53935', '#c0ca33', '#26a69a', '#8d6e63', '#54656f', '#ec407a']
const STATUS_FONTS = 5

// people who will see a new status: my contacts, my contacts except..., or only share with...
const audienceFor = (owner) => {
    const contacts = (owner.contacts || []).map((c) => String(c.userId))
    const p = owner.privacy || {}
    const blocked = new Set((owner.blocked || []).map(String))
    let list = contacts
    if (p.status === 'except') {
        const except = new Set((p.statusExcept || []).map(String))
        list = contacts.filter((id) => !except.has(id))
    } else if (p.status === 'only') {
        const only = new Set((p.statusOnly || []).map(String))
        list = contacts.filter((id) => only.has(id))
    }
    return [...new Set(list)].filter((id) => !blocked.has(id))
}

// may `viewerId` see this status of `owner`?
const canSeeStatus = (owner, status, viewerId) => {
    if (String(owner._id) === String(viewerId)) return true
    if (hasBlocked(owner, viewerId)) return false
    return (status.audience || []).some((id) => String(id) === String(viewerId))
}

module.exports = { STATUS_TTL_MS, STATUS_BACKGROUNDS, STATUS_FONTS, audienceFor, canSeeStatus }
