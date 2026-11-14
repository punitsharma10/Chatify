const mongoose = require('mongoose')
const { ConversationModel, MessageModel } = require('../models/conversation.model')
const presence = require('../socket/presence')

const LIMITS = {
    PAGE_SIZE : 40,
    TEXT_MAX : 4096,
    EDIT_WINDOW_MS : 15 * 60 * 1000,                 // edit within 15 minutes
    DELETE_EVERYONE_WINDOW_MS : 48 * 60 * 60 * 1000, // delete for everyone within 48 hours
    MAX_PINNED_MESSAGES : 3,
    MAX_PINNED_CHATS : 3,
    MAX_FORWARD_TARGETS : 5,
    MAX_BULK : 100,
    DISAPPEAR_OPTIONS : [0, 24 * 60 * 60, 7 * 24 * 60 * 60, 90 * 24 * 60 * 60],
    MAX_GROUP_MEMBERS : 256,
    GROUP_NAME_MAX : 100,
    GROUP_DESC_MAX : 512
}

const REPLY_FIELDS = 'text imageUrl videoUrl fileName stickerUrl audioUrl audioDuration msgByUserId deletedForEveryone createdAt'

const isValidId = (id) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id
const idOf = (v) => (v && v._id ? String(v._id) : String(v))
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// only https Cloudinary URLs are accepted for media so clients can't inject arbitrary links/scripts
const isAllowedMediaUrl = (url) => {
    if (!url) return true
    if (typeof url !== 'string' || url.length > 2048) return false
    try {
        const u = new URL(url)
        return u.protocol === 'https:' && u.hostname === 'res.cloudinary.com'
    } catch {
        return false
    }
}

// stickers: our Cloudinary uploads, or Google's animated Noto emoji
const NOTO_STICKER = /^https:\/\/fonts\.gstatic\.com\/s\/e\/notoemoji\/latest\/[0-9a-f_]{2,60}\/512\.webp$/
const isAllowedStickerUrl = (url) => !url || (typeof url === 'string' && (NOTO_STICKER.test(url) || isAllowedMediaUrl(url)))

/* ---------------- users ---------------- */

const hasBlocked = (user, otherId) => (user?.blocked || []).some((b) => String(b) === String(otherId))

// the entry for `otherId` in `owner`'s contacts (undefined if not saved)
const contactOf = (owner, otherId) => (owner?.contacts || []).find((c) => String(c.userId) === String(otherId))

// may `viewerId` see something `owner` set to everyone / contacts / nobody?
const visibleTo = (owner, setting, viewerId) => {
    if (setting === 'nobody') return false
    if (setting === 'contacts') return !!contactOf(owner, viewerId)
    return true
}

const receiptsAllowed = (a, b) => a?.privacy?.readReceipts !== false && b?.privacy?.readReceipts !== false

// user object as seen by `viewer`, respecting privacy settings and blocks
const publicUser = (user, viewer) => {
    if (!user) return null
    const u = user.toObject ? user.toObject() : user
    const id = String(u._id)
    const viewerId = viewer ? String(viewer._id) : null

    if (id === viewerId) {
        return {
            _id : u._id,
            name : u.name,
            email : u.email,
            phone : u.phone,
            profile_pic : u.profile_pic,
            about : u.about,
            lastSeen : u.lastSeen,
            online : presence.isOnline(id),
            self : true
        }
    }

    const blockedMe = hasBlocked(u, viewerId)
    const blockedByMe = hasBlocked(viewer, id)
    const p = u.privacy || {}
    const saved = contactOf(viewer, id)

    return {
        _id : u._id,
        // the name the viewer saved them under, else their own profile name
        name : saved?.name || u.name,
        profileName : u.name,
        isContact : !!saved,
        email : u.email,
        phone : u.phone,
        profile_pic : !blockedMe && visibleTo(u, p.profilePhoto, viewerId) ? u.profile_pic : "",
        about : !blockedMe && visibleTo(u, p.about, viewerId) ? u.about : "",
        lastSeen : !blockedMe && !blockedByMe && visibleTo(u, p.lastSeen, viewerId) ? u.lastSeen : undefined,
        online : presence.isVisiblyOnline(id, viewerId),
        blockedByMe
    }
}

/* ---------------- conversations ---------------- */

const isGroup = (conv) => !!conv?.isGroup
const memberOf = (conv, userId) => (conv?.members || []).find((m) => idOf(m.userId) === String(userId))
const pastMemberOf = (conv, userId) => (conv?.pastMembers || []).find((m) => idOf(m.userId) === String(userId))
const memberIds = (conv) => (conv?.members || []).map((m) => idOf(m.userId))
const isAdmin = (conv, userId) => memberOf(conv, userId)?.role === 'admin'
// group permission check: 'all' members, or 'admins' only
const allowed = (conv, userId, setting) => !!memberOf(conv, userId) && (conv.settings?.[setting] !== 'admins' || isAdmin(conv, userId))

// people who take part: the two users of a 1:1 chat, or the current members of a group
const participants = (conv) => (isGroup(conv) ? memberIds(conv) : [idOf(conv.sender), idOf(conv.receiver)])
// can read the chat: 1:1 participants, current group members, and former members (read-only, their period only)
const isParticipant = (conv, userId) => (isGroup(conv)
    ? !!(memberOf(conv, userId) || pastMemberOf(conv, userId))
    : participants(conv).includes(String(userId)))
// can write to the chat
const isActiveMember = (conv, userId) => (isGroup(conv) ? !!memberOf(conv, userId) : isParticipant(conv, userId))
const peerOf = (conv, userId) => {
    const [a, b] = [idOf(conv.sender), idOf(conv.receiver)]
    return a === String(userId) ? b : a
}
// the id the client uses for a chat: the other person's id, or the group's own id
const chatKeyOf = (conv, userId) => (isGroup(conv) ? String(conv._id) : peerOf(conv, userId))

// filter for every chat a user can see (1:1, groups, groups they left)
const chatsOf = (userId) => ({
    $or : [
        { sender : userId },
        { receiver : userId },
        { 'members.userId' : userId },
        { 'pastMembers.userId' : userId }
    ]
})

// the period of a group a user may read: from joining until leaving (if they left)
const membershipWindow = (conv, userId) => {
    if (!isGroup(conv)) return {}
    const m = memberOf(conv, userId)
    if (m) return { from : m.joinedAt }
    const p = pastMemberOf(conv, userId)
    if (p) return { from : p.joinedAt, to : p.leftAt }
    return { none : true }
}

// group as it appears where a person would (chat list, header, forward list)
const groupAsPeer = (conv) => ({
    _id : conv._id,
    name : conv.name,
    profile_pic : conv.avatar || '',
    about : conv.description || '',
    isGroup : true
})

const getState = (conv, userId) =>
    (conv?.userState || []).find((s) => String(s.userId) === String(userId)) || {}

const setState = async (convId, userId, patch) => {
    const set = {}
    for (const [k, v] of Object.entries(patch)) set[`userState.$.${k}`] = v
    const res = await ConversationModel.updateOne({ _id : convId, 'userState.userId' : userId }, { $set : set })
    if (res.matchedCount === 0) {
        await ConversationModel.updateOne(
            { _id : convId, 'userState.userId' : { $ne : userId } },
            { $push : { userState : { userId, ...patch } } }
        )
    }
}

const findConversation = (a, b) => ConversationModel.findOne({
    $or : [
        { sender : a, receiver : b },
        { sender : b, receiver : a }
    ]
})

const getOrCreateConversation = async (a, b) => {
    let conv = await findConversation(a, b)
    if (!conv) conv = await new ConversationModel({ sender : a, receiver : b }).save()
    return conv
}

// filter for the messages a user can see in a conversation
const visibleFilter = (conv, userId) => {
    const state = getState(conv, userId)
    const filter = {
        conversationId : conv._id,
        deletedFor : { $ne : new mongoose.Types.ObjectId(String(userId)) },
        $or : [{ expiresAt : null }, { expiresAt : { $gt : new Date() } }]
    }
    const createdAt = {}
    if (state.clearedAt) createdAt.$gt = state.clearedAt
    const win = membershipWindow(conv, userId)
    if (win.none) createdAt.$lt = new Date(0)
    if (win.from) createdAt.$gte = win.from
    if (win.to) createdAt.$lte = win.to
    if (Object.keys(createdAt).length) filter.createdAt = createdAt
    return filter
}

// same rules as visibleFilter, for a message already loaded
const canSeeMessage = (conv, userId, m) => {
    if ((m.deletedFor || []).some((x) => String(x) === String(userId))) return false
    const state = getState(conv, userId)
    if (state.clearedAt && m.createdAt <= state.clearedAt) return false
    const win = membershipWindow(conv, userId)
    if (win.none) return false
    if (win.from && m.createdAt < win.from) return false
    if (win.to && m.createdAt > win.to) return false
    return true
}

/* ---------------- messages ---------------- */

const serializeReply = (r) => {
    if (!r) return null
    if (!r.msgByUserId) return { _id : idOf(r) }
    const deleted = !!r.deletedForEveryone
    return {
        _id : r._id,
        msgByUserId : r.msgByUserId,
        createdAt : r.createdAt,
        text : deleted ? "" : (r.text || "").slice(0, 300),
        imageUrl : deleted ? "" : r.imageUrl,
        videoUrl : deleted ? "" : r.videoUrl,
        fileName : deleted ? "" : r.fileName,
        stickerUrl : deleted ? "" : r.stickerUrl,
        audioUrl : deleted ? "" : r.audioUrl,
        audioDuration : deleted ? 0 : r.audioDuration,
        deleted
    }
}

// message as seen by `viewerId`. `receipts` = whether read receipts may be shown between the two users.
// Group messages (they have recipients or a system notice) always show receipts, like WhatsApp.
const serializeMessage = (m, viewerId, { receipts = true } = {}) => {
    const o = m.toObject ? m.toObject() : m
    const mine = String(o.msgByUserId) === String(viewerId)
    const deleted = !!o.deletedForEveryone

    const out = {
        _id : o._id,
        conversationId : o.conversationId,
        msgByUserId : o.msgByUserId,
        createdAt : o.createdAt,
        updatedAt : o.updatedAt,
        text : deleted ? "" : o.text,
        imageUrl : deleted ? "" : o.imageUrl,
        videoUrl : deleted ? "" : o.videoUrl,
        fileUrl : deleted ? "" : o.fileUrl,
        fileName : deleted ? "" : o.fileName,
        fileSize : deleted ? 0 : o.fileSize,
        fileType : deleted ? "" : o.fileType,
        stickerUrl : deleted ? "" : (o.stickerUrl || ""),
        audioUrl : deleted ? "" : (o.audioUrl || ""),
        audioDuration : deleted ? 0 : (o.audioDuration || 0),
        audioWaveform : deleted ? undefined : o.audioWaveform,
        forwarded : !deleted && !!o.forwarded,
        editedAt : deleted ? undefined : o.editedAt,
        deletedForEveryone : deleted,
        pinned : !deleted && !!o.pinned,
        starred : (o.starredBy || []).some((id) => String(id) === String(viewerId)),
        reactions : deleted ? [] : (o.reactions || []).map((r) => ({ userId : String(r.userId), emoji : r.emoji })),
        replyTo : deleted ? null : serializeReply(o.replyTo),
        expiresAt : o.expiresAt
    }

    if (o.call?.media) out.call = { type : o.call.media, status : o.call.status, duration : o.call.duration || 0, ...(o.call.participants !== undefined ? { group : true, participants : o.call.participants } : {}) }

    const group = Array.isArray(o.recipients) || !!o.system?.action
    if (o.system?.action) out.system = { action : o.system.action, actor : o.system.actor, targets : o.system.targets || [], value : o.system.value }
    if (deleted && o.deletedByAdmin) out.deletedByAdmin = true

    if (group) {
        const readByMe = (o.readBy || []).some((r) => String(r.userId) === String(viewerId))
        if (mine) {
            out.clientId = o.clientId
            out.deliveredAt = o.deliveredAt
            out.seen = !!o.seen
            out.seenAt = o.seenAt
        } else {
            out.seen = readByMe || !!o.system?.action
        }
        return out
    }

    if (mine) {
        out.clientId = o.clientId
        out.deliveredAt = o.deliveredAt || (o.seen ? (o.seenAt || o.updatedAt) : undefined)
        out.seen = receipts ? !!o.seen : false
        out.seenAt = receipts ? o.seenAt : undefined
    } else {
        // for incoming messages "seen" means "I have read it" (used for unread counts / divider)
        out.seen = !!o.seen
    }
    return out
}

const loadMessages = async (conv, userId, { before, limit = LIMITS.PAGE_SIZE } = {}) => {
    const filter = visibleFilter(conv, userId)
    if (before) {
        const d = new Date(before)
        if (!isNaN(d)) filter.createdAt = { ...(filter.createdAt || {}), $lt : d }
    }
    const docs = await MessageModel.find(filter)
        .sort({ createdAt : -1, _id : -1 })
        .limit(limit + 1)
        .populate('replyTo', REPLY_FIELDS)
        .lean()
    return { messages : docs.slice(0, limit).reverse(), hasMore : docs.length > limit }
}

module.exports = {
    LIMITS,
    REPLY_FIELDS,
    isValidId,
    idOf,
    escapeRegex,
    isAllowedMediaUrl,
    isAllowedStickerUrl,
    hasBlocked,
    contactOf,
    visibleTo,
    receiptsAllowed,
    publicUser,
    participants,
    isParticipant,
    isActiveMember,
    peerOf,
    isGroup,
    memberOf,
    pastMemberOf,
    memberIds,
    isAdmin,
    allowed,
    chatKeyOf,
    chatsOf,
    membershipWindow,
    groupAsPeer,
    canSeeMessage,
    getState,
    setState,
    findConversation,
    getOrCreateConversation,
    visibleFilter,
    serializeReply,
    serializeMessage,
    loadMessages
}
