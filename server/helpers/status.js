const { hasBlocked } = require('./chat')

const STATUS_TTL_MS = 24 * 60 * 60 * 1000
const STATUS_BACKGROUNDS = ['#00a884', '#5796ff', '#7e57c2', '#ff8a65', '#e53935', '#c0ca33', '#26a69a', '#8d6e63', '#54656f', '#ec407a']
const STATUS_FONTS = 5

// the three apps a story can be shared to: Chats (Status), Pixify and Connectify
const STATUS_APPS = ['chats', 'pixify', 'connectify']
const SHARED_APPS = ['pixify', 'connectify'] // shown outside Chats, so never end-to-end encrypted

// clean list of apps from the client; missing means Chats only (older clients). null = invalid.
const normalizeApps = (apps) => {
    if (apps === undefined || apps === null) return ['chats']
    if (!Array.isArray(apps)) return null
    const list = STATUS_APPS.filter((a) => apps.includes(a))
    if (!list.length || list.length !== new Set(apps).size || !apps.every((a) => STATUS_APPS.includes(a))) return null
    return list
}

// apps a stored status is shown in (older ones have no list: Chats only)
const appsOf = (status) => (status.apps && status.apps.length ? status.apps : ['chats'])

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

// people who see a story in Pixify (my followers) or Connectify (my friends), blocked people left out
const appAudienceFor = async (owner, app) => {
    const { followerIds, friendIds } = require('./social')
    const blocked = new Set((owner.blocked || []).map(String))
    const ids = app === 'pixify' ? await followerIds(owner._id) : await friendIds(owner._id)
    return [...new Set(ids)].filter((id) => !blocked.has(id))
}

// everyone who can see this status in any app
const viewersOf = (status) => [...new Set([...(status.audience || []), ...(status.shareAudience || [])].map(String))]

// may `viewerId` see this status of `owner` (in any app it's shared to)?
const canSeeStatus = (owner, status, viewerId) => {
    if (String(owner._id) === String(viewerId)) return true
    if (hasBlocked(owner, viewerId)) return false
    return viewersOf(status).includes(String(viewerId))
}

module.exports = { STATUS_TTL_MS, STATUS_BACKGROUNDS, STATUS_FONTS, STATUS_APPS, SHARED_APPS, normalizeApps, appsOf, audienceFor, appAudienceFor, viewersOf, canSeeStatus }
