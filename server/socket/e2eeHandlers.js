const mongoose = require('mongoose')
const UserModel = require('../models/user.model')
const { ConversationModel, MessageModel } = require('../models/conversation.model')
const { isValidId, memberIds, memberOf, isParticipant, chatsOf } = require('../helpers/chat')
const { activeDevices, publicDevice, MAX_DEVICES, DEVICE_ID, B64 } = require('../helpers/e2ee')

class UserError extends Error {}

const keyString = (v) => typeof v === 'string' && v.length >= 40 && v.length <= 200 && B64.test(v)

// End-to-end encryption: device public-key directory and device-to-device history sync.
// Private keys and plaintext never reach the server.
module.exports = function registerE2eeHandlers(io, socket) {
    const me = socket.data.userId
    const meId = new mongoose.Types.ObjectId(me)

    const on = (event, fn) => {
        socket.on(event, async (...args) => {
            const ack = typeof args[args.length - 1] === 'function' ? args.pop() : null
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

    const directory = (users) => Object.fromEntries(users.map((u) => [String(u._id), (u.devices || []).map(publicDevice)]))

    // this browser announces its public keys (first run, or every time it connects)
    on('e2ee-register', async ({ id, ecdh, sign, name } = {}) => {
        if (typeof id !== 'string' || !DEVICE_ID.test(id) || !keyString(ecdh) || !keyString(sign)) throw new UserError('Invalid device keys')
        const label = typeof name === 'string' ? name.slice(0, 60) : ''
        const user = await UserModel.findById(me).select('devices').lean()
        const devices = user?.devices || []
        const existing = devices.find((d) => d.id === id)
        const now = new Date()
        let isNew = false
        if (existing) {
            // a device id is bound to its keys forever: new keys need a new device id
            if (existing.ecdh !== ecdh || existing.sign !== sign) throw new UserError('Device keys mismatch')
            isNew = !!existing.removedAt
            await UserModel.updateOne({ _id : meId, 'devices.id' : id }, {
                $set : { 'devices.$.lastSeen' : now, 'devices.$.sid' : String(socket.data.sid || ''), 'devices.$.name' : label || existing.name },
                $unset : { 'devices.$.removedAt' : 1 }
            })
        } else {
            isNew = true
            await UserModel.updateOne({ _id : meId }, { $push : { devices : { id, ecdh, sign, name : label, sid : String(socket.data.sid || ''), createdAt : now, lastSeen : now } } })
        }
        // too many devices: the least recently used ones stop receiving new messages
        const fresh = await UserModel.findById(me).select('devices').lean()
        const active = activeDevices(fresh).sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0))
        if (active.length > MAX_DEVICES) {
            const drop = active.slice(MAX_DEVICES).map((d) => d.id)
            await UserModel.updateOne({ _id : meId }, { $set : { 'devices.$[d].removedAt' : now } }, { arrayFilters : [{ 'd.id' : { $in : drop } }] })
        }
        socket.data.deviceId = id
        socket.join(`device:${me}:${id}`)
        if (isNew) {
            // my other devices can offer to share message history with this one
            socket.to(me).emit('e2ee-new-device', { device : publicDevice({ id, ecdh, sign, name : label, createdAt : now }) })
        }
        const mine = await UserModel.findById(me).select('devices').lean()
        return { isNew, devices : (mine.devices || []).map(publicDevice) }
    })

    // public keys of some users (removed devices included, so old signatures can still be checked)
    on('e2ee-devices', async ({ userIds } = {}) => {
        const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(String))].filter(isValidId).slice(0, 300)
        const users = await UserModel.find({ _id : { $in : ids } }).select('devices deletedAt').lean()
        return { users : directory(users.filter((u) => !u.deletedAt)) }
    })

    // everyone a message to `receiver` must be encrypted for: the person (or every group member) + my own devices
    on('e2ee-chat-devices', async ({ receiver } = {}) => {
        const id = String(receiver || '')
        if (!isValidId(id)) throw new UserError('Invalid chat')
        let ids
        const group = await ConversationModel.findOne({ _id : id, isGroup : true }).select('members pastMembers isGroup').lean()
        if (group) {
            if (!isParticipant(group, me)) throw new UserError('Group not found')
            if (!memberOf(group, me)) throw new UserError("You're no longer a member of this group")
            ids = memberIds(group)
        } else {
            ids = [me, id]
        }
        const users = await UserModel.find({ _id : { $in : [...new Set([...ids, me])] } }).select('devices deletedAt').lean()
        const usable = users.filter((u) => !u.deletedAt)
        // a person who never opened an encryption-capable Chatify has no keys yet
        const withoutKeys = usable.filter((u) => String(u._id) !== me && !activeDevices(u).length).map((u) => String(u._id))
        return { users : directory(usable), isGroup : !!group, withoutKeys }
    })

    /* ---------- history sync to a new device (WhatsApp-style "linked device history") ---------- */

    // an older device asks: which encrypted messages can I open that `device` (my new one) can't yet?
    on('e2ee-sync-batch', async ({ device, before } = {}) => {
        const mine = await UserModel.findById(me).select('devices').lean()
        const target = activeDevices(mine).find((d) => d.id === device)
        const from = socket.data.deviceId
        if (!target || !from || target.id === from) throw new UserError('Device not found')
        const convs = await ConversationModel.find(chatsOf(me)).select('_id').lean()
        const filter = {
            conversationId : { $in : convs.map((c) => c._id) },
            deletedFor : { $ne : meId },
            $and : [
                { 'e2ee.keys' : { $elemMatch : { u : me, d : from } } },
                { 'e2ee.keys' : { $not : { $elemMatch : { u : me, d : target.id } } } }
            ]
        }
        const d = before ? new Date(before) : null
        if (d && !isNaN(d)) filter.createdAt = { $lt : d }
        const docs = await MessageModel.find(filter).select('createdAt e2ee').sort({ createdAt : -1 }).limit(200).lean()
        return {
            items : docs.map((m) => ({ _id : m._id, createdAt : m.createdAt, key : m.e2ee.keys.find((k) => k.u === me && k.d === from), header : { from : m.e2ee.from } }))
        }
    })

    // ...then re-wraps those message keys for the new device (the server only stores them)
    on('e2ee-add-keys', async ({ device, entries } = {}) => {
        const mine = await UserModel.findById(me).select('devices').lean()
        const target = activeDevices(mine).find((d) => d.id === device)
        if (!target || !socket.data.deviceId) throw new UserError('Device not found')
        const list = (Array.isArray(entries) ? entries : []).slice(0, 200)
            .filter((e) => e && isValidId(String(e.id)) && keyString(e.epk) && typeof e.iv === 'string' && e.iv.length <= 32 && B64.test(e.iv) && keyString(e.wk))
        if (!list.length) return { added : 0 }
        const res = await MessageModel.bulkWrite(list.map((e) => ({
            updateOne : {
                filter : {
                    _id : new mongoose.Types.ObjectId(String(e.id)),
                    $and : [
                        { 'e2ee.keys' : { $elemMatch : { u : me, d : socket.data.deviceId } } },
                        { 'e2ee.keys' : { $not : { $elemMatch : { u : me, d : target.id } } } }
                    ]
                },
                update : { $push : { 'e2ee.keys' : { u : me, d : target.id, epk : e.epk, iv : e.iv, wk : e.wk } } }
            }
        })))
        return { added : res.modifiedCount || 0 }
    })

    on('e2ee-sync-done', async ({ device, count } = {}) => {
        if (typeof device !== 'string' || !DEVICE_ID.test(device)) throw new UserError('Device not found')
        io.to(`device:${me}:${device}`).emit('e2ee-history-synced', { count : Number(count) || 0 })
        return {}
    })

    // a new device asks my other (online) devices to offer a history sync again
    on('e2ee-request-history', async () => {
        if (!socket.data.deviceId) throw new UserError('Device not registered')
        const mine = await UserModel.findById(me).select('devices').lean()
        const d = activeDevices(mine).find((x) => x.id === socket.data.deviceId)
        if (d) socket.to(me).emit('e2ee-new-device', { device : publicDevice(d), requested : true })
        return {}
    })
}
