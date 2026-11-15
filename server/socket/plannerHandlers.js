const mongoose = require('mongoose')
const UserModel = require('../models/user.model')
const { ConversationModel, MessageModel } = require('../models/conversation.model')
const { ScheduledModel, ReminderModel } = require('../models/planner.model')
const { isValidId, isParticipant, canSeeMessage, chatKeyOf, memberOf, LIMITS } = require('../helpers/chat')
const { cleanEnvelope, viewEnvelope, keysOnlyFor, KINDS } = require('../helpers/e2ee')

class UserError extends Error {}

const MAX_PENDING = 100
const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000

// Chatify Planner: scheduled messages and message reminders (things WhatsApp doesn't have).
module.exports = function registerPlannerHandlers(io, socket) {
    const me = socket.data.userId
    const meId = new mongoose.Types.ObjectId(me)

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

    const futureDate = (value, { minMs = 0 } = {}) => {
        const d = new Date(value)
        if (isNaN(d)) throw new UserError('Choose a date and time')
        if (d.getTime() < Date.now() + minMs) throw new UserError('Choose a time in the future')
        if (d.getTime() > Date.now() + MAX_AHEAD_MS) throw new UserError('Choose a time within the next year')
        return d
    }

    // a chat I can currently write to: a person (not deleted) or a group I'm a member of
    const checkWritable = async (receiver) => {
        if (!isValidId(String(receiver)) || String(receiver) === '') throw new UserError('Invalid chat')
        const group = await ConversationModel.findOne({ _id : receiver, isGroup : true }).select('members').lean()
        if (group) {
            if (!memberOf(group, me)) throw new UserError("You're not a member of this group")
            return
        }
        const user = await UserModel.findById(receiver).select('_id deletedAt').lean()
        if (!user || user.deletedAt) throw new UserError('User not found')
    }

    /* ---------- scheduled messages ---------- */

    on('schedule-message', async ({ receiver, text, sendAt, silent, e2ee, e2eeKind, mentions } = {}) => {
        if (e2ee) {
            // encrypted on the device now, sent unchanged when it's due
            const env = cleanEnvelope(e2ee, me)
            if (!env || env.to !== String(receiver) || !['text', 'link'].includes(e2eeKind)) throw new UserError('Invalid encrypted message')
            const when = futureDate(sendAt, { minMs : 5 * 1000 })
            await checkWritable(receiver)
            if (await ScheduledModel.countDocuments({ userId : meId, status : 'pending' }) >= MAX_PENDING) throw new UserError(`You can have up to ${MAX_PENDING} scheduled messages`)
            const ids = Array.isArray(mentions) ? mentions.slice(0, 50).map(String).filter(isValidId) : undefined
            const job = await ScheduledModel.create({ userId : meId, receiver : String(receiver), text : '', e2ee : env, e2eeKind, mentions : ids?.length ? ids : undefined, silent : !!silent, sendAt : when })
            io.to(me).emit('scheduled-changed', { id : String(job._id), status : 'pending' })
            const o = job.toObject()
            return { scheduled : { ...o, e2ee : viewEnvelope(o.e2ee, me) } }
        }
        const body = typeof text === 'string' ? text.replace(/\r\n/g, '\n').trim() : ''
        if (!body) throw new UserError('Type a message to schedule')
        if (body.length > LIMITS.TEXT_MAX) throw new UserError(`Message is too long (max ${LIMITS.TEXT_MAX} characters)`)
        const when = futureDate(sendAt, { minMs : 5 * 1000 })
        await checkWritable(receiver)
        if (await ScheduledModel.countDocuments({ userId : meId, status : 'pending' }) >= MAX_PENDING) throw new UserError(`You can have up to ${MAX_PENDING} scheduled messages`)
        const job = await ScheduledModel.create({ userId : meId, receiver : String(receiver), text : body, silent : !!silent, sendAt : when })
        io.to(me).emit('scheduled-changed', { id : String(job._id), status : 'pending' })
        return { scheduled : job.toObject() }
    })

    on('scheduled-list', async ({ receiver } = {}) => {
        const filter = { userId : meId, status : { $in : ['pending', 'failed'] } }
        if (receiver) filter.receiver = String(receiver)
        const list = await ScheduledModel.find(filter).sort({ sendAt : 1 }).limit(200).lean()
        return { scheduled : list.map((s) => (s.e2ee ? { ...s, e2ee : viewEnvelope(s.e2ee, me) } : s)) }
    })

    on('scheduled-cancel', async ({ id } = {}) => {
        if (!isValidId(String(id))) throw new UserError('Not found')
        const res = await ScheduledModel.deleteOne({ _id : id, userId : meId, status : { $in : ['pending', 'failed'] } })
        if (!res.deletedCount) throw new UserError('This message was already sent')
        io.to(me).emit('scheduled-changed', { id : String(id), status : 'cancelled' })
        return {}
    })

    // send now / change the time
    on('scheduled-update', async ({ id, sendAt, now } = {}) => {
        if (!isValidId(String(id))) throw new UserError('Not found')
        const when = now ? new Date() : futureDate(sendAt, { minMs : 5 * 1000 })
        const res = await ScheduledModel.updateOne({ _id : id, userId : meId, status : { $in : ['pending', 'failed'] } }, { $set : { sendAt : when, status : 'pending', error : '' } })
        if (!res.matchedCount) throw new UserError('This message was already sent')
        if (now) require('../helpers/scheduler').tick(io)
        io.to(me).emit('scheduled-changed', { id : String(id), status : 'pending' })
        return {}
    })

    /* ---------- reminders ---------- */

    on('reminder-set', async ({ messageId, remindAt, e2ee } = {}) => {
        if (!isValidId(String(messageId))) throw new UserError('Message not found')
        const when = futureDate(remindAt, { minMs : 0 })
        const msg = await MessageModel.findById(messageId).lean()
        const conv = msg && await ConversationModel.findById(msg.conversationId).select('-messages').lean()
        if (!msg || !conv || !isParticipant(conv, me) || !canSeeMessage(conv, me, msg) || msg.deletedForEveryone) throw new UserError('Message not found')
        // encrypted messages: the device sends the preview encrypted for my own devices only
        let previewEnv
        if (e2ee) {
            previewEnv = cleanEnvelope(e2ee, me)
            if (!previewEnv || previewEnv.to !== me || !keysOnlyFor(previewEnv, [me])) throw new UserError('Invalid encrypted message')
        }
        const preview = msg.e2ee ? '' : (msg.text || (msg.poll?.question ? `📊 ${msg.poll.question}` : msg.imageUrl ? '📷 Photo' : msg.videoUrl ? '🎥 Video' : msg.fileName ? `📄 ${msg.fileName}` : msg.audioUrl ? '🎤 Voice message' : 'Message')).slice(0, 300)
        // one reminder per message: setting it again moves it
        const r = await ReminderModel.findOneAndUpdate(
            { userId : meId, messageId : msg._id },
            { $set : { chatId : chatKeyOf(conv, me), preview, messageAt : msg.createdAt, remindAt : when, firedAt : null, done : false, ...(previewEnv ? { e2ee : previewEnv } : {}) }, ...(previewEnv ? {} : { $unset : { e2ee : 1 } }) },
            { upsert : true, new : true }
        ).lean()
        io.to(me).emit('reminders-changed')
        return { reminder : r }
    })

    on('reminder-list', async () => {
        const list = await ReminderModel.find({ userId : meId, done : false }).sort({ remindAt : 1 }).limit(200).lean()
        return { reminders : list }
    })

    on('reminder-done', async ({ id } = {}) => {
        if (!isValidId(String(id))) throw new UserError('Not found')
        await ReminderModel.updateOne({ _id : id, userId : meId }, { $set : { done : true } })
        io.to(me).emit('reminders-changed')
        return {}
    })

    on('reminder-delete', async ({ id } = {}) => {
        if (!isValidId(String(id))) throw new UserError('Not found')
        await ReminderModel.deleteOne({ _id : id, userId : meId })
        io.to(me).emit('reminders-changed')
        return {}
    })

}
