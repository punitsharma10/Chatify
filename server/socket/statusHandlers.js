const mongoose = require('mongoose')
const UserModel = require('../models/user.model')
const StatusModel = require('../models/status.model')
const { isValidId, isAllowedMediaUrl, publicUser, hasBlocked } = require('../helpers/chat')
const { cleanEnvelope, viewEnvelope, keysOnlyFor, publicDevice } = require('../helpers/e2ee')
const { STATUS_TTL_MS, STATUS_BACKGROUNDS, STATUS_FONTS, audienceFor, canSeeStatus } = require('../helpers/status')

class UserError extends Error {}

const serialize = (st, viewerId) => {
    const mine = String(st.userId) === String(viewerId)
    return {
        _id : st._id,
        userId : st.userId,
        kind : st.kind,
        text : st.text || '',
        background : st.background || '',
        font : st.font || 0,
        mediaUrl : st.mediaUrl || '',
        caption : st.caption || '',
        ...(st.e2ee ? { e2ee : viewEnvelope(st.e2ee, viewerId) } : {}),
        createdAt : st.createdAt,
        expiresAt : st.expiresAt,
        viewed : mine || (st.viewers || []).some((v) => String(v.userId) === String(viewerId)),
        // the owner sees how many people viewed it (people with read receipts off aren't counted)
        ...(mine ? { viewCount : (st.viewers || []).filter((v) => !v.hidden).length } : {})
    }
}

// Status updates (WhatsApp "Updates" tab): post, list, view, viewers, delete, mute.
module.exports = function registerStatusHandlers(io, socket) {
    const me = socket.data.userId
    const meId = new mongoose.Types.ObjectId(me)
    const loadUser = (id) => UserModel.findById(id).select('-password').lean()

    const on = (event, fn) => {
        socket.on(event, async (...args) => {
            const ack = typeof args[args.length - 1] === 'function' ? args.pop() : null
            // socket.io sends a missing payload as null; treat it as missing so `= {}` defaults apply
            args = args.map((x) => (x === null ? undefined : x))
            try {
                const result = await fn(...args)
                if (ack) ack({ ok : true, ...(result || {}) })
            } catch (error) {
                if (!(error instanceof UserError)) console.error(`[socket:${event}]`, error)
                if (ack) ack({ ok : false, error : error instanceof UserError ? error.message : 'Something went wrong. Please try again.' })
            }
        })
    }

    const liveNow = () => ({ expiresAt : { $gt : new Date() } })

    // who my next status goes to (and their device keys), so the device can encrypt it for exactly them
    on('status-audience', async () => {
        const owner = await loadUser(me)
        const ids = [...audienceFor(owner).map(String), me]
        const users = await UserModel.find({ _id : { $in : ids } }).select('devices deletedAt').lean()
        return { users : Object.fromEntries(users.filter((u) => !u.deletedAt).map((u) => [String(u._id), (u.devices || []).map(publicDevice)])) }
    })

    on('status-post', async ({ kind, text, background, font, mediaUrl, caption, e2ee } = {}) => {
        if (!['text', 'image', 'video'].includes(kind)) throw new UserError('Invalid status')
        const owner = await loadUser(me)
        const doc = { userId : meId, kind, expiresAt : new Date(Date.now() + STATUS_TTL_MS), audience : audienceFor(owner) }
        if (e2ee) {
            // encrypted on the device for the audience (people the status is shared with) + my own devices
            const env = cleanEnvelope(e2ee, me)
            if (!env || env.to !== me || !keysOnlyFor(env, [...doc.audience.map(String), me])) throw new UserError('Invalid encrypted status')
            doc.e2ee = env
            doc.background = STATUS_BACKGROUNDS.includes(background) ? background : STATUS_BACKGROUNDS[0]
            doc.font = Number.isInteger(font) && font >= 0 && font < STATUS_FONTS ? font : 0
        } else if (kind === 'text') {
            const t = typeof text === 'string' ? text.trim() : ''
            if (!t) throw new UserError('Type a status')
            if (t.length > 700) throw new UserError('Status is too long (max 700 characters)')
            doc.text = t
            doc.background = STATUS_BACKGROUNDS.includes(background) ? background : STATUS_BACKGROUNDS[0]
            doc.font = Number.isInteger(font) && font >= 0 && font < STATUS_FONTS ? font : 0
        } else {
            if (!mediaUrl || !isAllowedMediaUrl(mediaUrl)) throw new UserError('Invalid photo or video')
            const c = typeof caption === 'string' ? caption.trim() : ''
            if (c.length > 700) throw new UserError('Caption is too long (max 700 characters)')
            doc.mediaUrl = mediaUrl
            doc.caption = c
        }
        const st = await StatusModel.create(doc)
        // people who can see it refresh their Updates list; my other tabs too
        for (const uid of [...doc.audience, me]) io.to(String(uid)).emit('status-changed', { userId : me })
        return { status : serialize(st.toObject(), me) }
    })

    on('status-list', async () => {
        const meUser = await loadUser(me)
        const [mine, others] = await Promise.all([
            StatusModel.find({ userId : meId, ...liveNow() }).sort({ createdAt : 1 }).lean(),
            StatusModel.find({ audience : meId, ...liveNow() }).sort({ createdAt : 1 }).limit(1000).lean()
        ])
        const ownerIds = [...new Set(others.map((s) => String(s.userId)))]
        const owners = await UserModel.find({ _id : { $in : ownerIds } }).select('-password').lean()
        const byId = Object.fromEntries(owners.map((u) => [String(u._id), u]))
        const muted = new Set((meUser.mutedStatuses || []).map(String))

        const groups = {}
        for (const st of others) {
            const owner = byId[String(st.userId)]
            // statuses of people I blocked (or who blocked me) are hidden
            if (!owner || hasBlocked(meUser, owner._id) || !canSeeStatus(owner, st, me)) continue
            const key = String(owner._id)
            groups[key] = groups[key] || { user : publicUser(owner, meUser), statuses : [], muted : muted.has(key) }
            groups[key].statuses.push(serialize(st, me))
        }
        const updates = Object.values(groups).map((g) => ({
            ...g,
            allViewed : g.statuses.every((s) => s.viewed),
            lastAt : g.statuses[g.statuses.length - 1].createdAt
        })).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt))

        return { mine : mine.map((s) => serialize(s, me)), updates }
    })

    on('status-view', async ({ statusId } = {}) => {
        if (!isValidId(String(statusId))) throw new UserError('Status not found')
        const st = await StatusModel.findOne({ _id : statusId, ...liveNow() }).lean()
        if (!st) throw new UserError('This status is no longer available')
        if (String(st.userId) === me) return {}
        const [owner, meUser] = await Promise.all([loadUser(st.userId), loadUser(me)])
        if (!owner || !canSeeStatus(owner, st, me)) throw new UserError('This status is no longer available')
        if ((st.viewers || []).some((v) => String(v.userId) === me)) return {}
        // like WhatsApp: with read receipts off, the owner doesn't learn that you viewed it
        const hidden = meUser?.privacy?.readReceipts === false
        await StatusModel.updateOne({ _id : st._id, 'viewers.userId' : { $ne : meId } }, { $push : { viewers : { userId : meId, at : new Date(), hidden } } })
        if (!hidden) io.to(String(st.userId)).emit('status-viewed', { statusId : String(st._id) })
        return {}
    })

    on('status-viewers', async ({ statusId } = {}) => {
        if (!isValidId(String(statusId))) throw new UserError('Status not found')
        const st = await StatusModel.findOne({ _id : statusId, userId : meId }).lean()
        if (!st) throw new UserError('Status not found')
        const meUser = await loadUser(me)
        const shown = (st.viewers || []).filter((v) => !v.hidden)
        const users = await UserModel.find({ _id : { $in : shown.map((v) => v.userId) } }).select('-password').lean()
        const byId = Object.fromEntries(users.map((u) => [String(u._id), u]))
        return {
            viewers : shown
                .filter((v) => byId[String(v.userId)])
                .sort((a, b) => new Date(b.at) - new Date(a.at))
                .map((v) => ({ ...publicUser(byId[String(v.userId)], meUser), at : v.at }))
        }
    })

    on('status-delete', async ({ statusId } = {}) => {
        if (!isValidId(String(statusId))) throw new UserError('Status not found')
        const st = await StatusModel.findOneAndDelete({ _id : statusId, userId : meId }).lean()
        if (!st) throw new UserError('Status not found')
        for (const uid of [...(st.audience || []), me]) io.to(String(uid)).emit('status-changed', { userId : me, removed : String(st._id) })
        return {}
    })

    on('status-mute', async ({ userId, mute } = {}) => {
        if (!isValidId(String(userId)) || String(userId) === me) throw new UserError('Invalid user')
        const oid = new mongoose.Types.ObjectId(String(userId))
        await UserModel.updateOne({ _id : meId }, mute ? { $addToSet : { mutedStatuses : oid } } : { $pull : { mutedStatuses : oid } })
        return {}
    })
}
