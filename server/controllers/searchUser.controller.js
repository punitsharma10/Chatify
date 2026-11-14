const UserModel = require('../models/user.model')
const { escapeRegex, publicUser } = require('../helpers/chat')

// Turns what someone typed into the phone numbers it could mean (E.164).
// "+91 98765-43210" -> ["+919876543210"];  "9876543210" -> ["+919876543210", "+9876543210"] (India by default)
const phoneCandidates = (text) => {
    const raw = text.replace(/[\s\-().]/g, '')
    if (!/^\+?\d{7,15}$/.test(raw)) return []
    if (raw.startsWith('+')) return [raw]
    const digits = raw.replace(/^0+/, '')
    const list = []
    if (digits.length === 10) list.push('+91' + digits)
    list.push('+' + digits)
    return list
}

const looksLikeEmail = (text) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)

// Privacy-first people search (requires requireAuth: req.user)
//  - your contacts: listed when the search is empty, and filtered by name / saved name / number / email
//  - anyone else: only an EXACT full phone number or email finds them, so nobody can browse who uses Chatify
const searchUser = async (req, res) => {
    try {
        const search = typeof req.body.search === 'string' ? req.body.search.trim().slice(0, 100) : ""
        const me = req.user

        const savedIds = (me.contacts || []).map((c) => c.userId)
        const contactUsers = savedIds.length
            ? await UserModel.find({ _id : { $in : savedIds } }).select('-password').lean()
            : []
        let contacts = contactUsers.map((u) => publicUser(u, me))

        if (search) {
            const q = search.toLowerCase()
            const digits = search.replace(/[\s\-().+]/g, '')
            contacts = contacts.filter((c) =>
                c.name.toLowerCase().includes(q) ||
                (c.profileName || '').toLowerCase().includes(q) ||
                (c.email || '').toLowerCase().includes(q) ||
                (digits.length >= 3 && (c.phone || '').includes(digits)))
        }
        contacts.sort((a, b) => a.name.localeCompare(b.name))

        // exact match for someone new (or yourself)
        let others = []
        if (search) {
            const or = []
            if (looksLikeEmail(search)) or.push({ email : new RegExp(`^${escapeRegex(search)}$`, 'i') })
            const phones = phoneCandidates(search)
            if (phones.length) or.push({ phone : { $in : phones } })
            if (or.length) {
                const found = await UserModel.find({ $or : or }).select('-password').limit(3).lean()
                const shown = new Set(contacts.map((c) => String(c._id)))
                others = found.filter((u) => !shown.has(String(u._id))).map((u) => publicUser(u, me))
            }
        }

        return res.json({
            message : 'search results',
            data : [...contacts, ...others],
            // tells the app whether to show the "type a full number or email" hint
            exactOnly : true,
            success : true
        })
    } catch (error) {
        return res.status(500).json({
            message : error.message || error,
            error : true
        })
    }
}

module.exports = searchUser
module.exports.phoneCandidates = phoneCandidates
