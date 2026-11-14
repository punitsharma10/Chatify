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
    DISAPPEAR_OPTIONS : [0, 24 * 60 * 60, 7 * 24 * 60 * 60, 90 * 24 * 60 * 60]
}

const REPLY_FIELDS = 'text imageUrl videoUrl fileName msgByUserId deletedForEveryone createdAt'

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

/* ---------------- users ---------------- */

const hasBlocked = (user, otherId) => (user?.blocked || []).some((b) => String(b) === String(otherId))

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

    return {
        _id : u._id,
        name : u.name,
        email : u.email,
        phone : u.phone,
        profile_pic : !blockedMe && p.profilePhoto !== 'nobody' ? u.profile_pic : "",
        about : !blockedMe && p.about !== 'nobody' ? u.about : "",
        lastSeen : !blockedMe && !blockedByMe && p.lastSeen !== 'nobody' ? u.lastSeen : undefined,
        online : presence.isVisiblyOnline(id, viewerId),
        blockedByMe
    }
}

/* ---------------- conversations ---------------- */

const participants = (conv) => [idOf(conv.sender), idOf(conv.receiver)]
const isParticipant = (conv, userId) => participants(conv).includes(String(userId))
const peerOf = (conv, userId) => {
    const [a, b] = participants(conv)
    return a === String(userId) ? b : a
}

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
    if (state.clearedAt) filter.createdAt = { $gt : state.clearedAt }
    return filter
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
        deleted
    }
}

// message as seen by `viewerId`. `receipts` = whether read receipts may be shown between the two users.
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
        forwarded : !deleted && !!o.forwarded,
        editedAt : deleted ? undefined : o.editedAt,
        deletedForEveryone : deleted,
        pinned : !deleted && !!o.pinned,
        starred : (o.starredBy || []).some((id) => String(id) === String(viewerId)),
        reactions : deleted ? [] : (o.reactions || []).map((r) => ({ userId : String(r.userId), emoji : r.emoji })),
        replyTo : deleted ? null : serializeReply(o.replyTo),
        expiresAt : o.expiresAt
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
    hasBlocked,
    receiptsAllowed,
    publicUser,
    participants,
    isParticipant,
    peerOf,
    getState,
    setState,
    findConversation,
    getOrCreateConversation,
    visibleFilter,
    serializeReply,
    serializeMessage,
    loadMessages
}
