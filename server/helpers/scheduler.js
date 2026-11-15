// Background jobs: sends scheduled messages and fires message reminders when they are due.
// Scheduled messages go through the very same send path as a live socket (permissions, blocks, groups,
// de-duplication), using a lightweight server-side "socket" that acts as the author.
const { ScheduledModel, ReminderModel } = require('../models/planner.model')

const TICK_MS = Number(process.env.SCHEDULER_TICK_MS) || 10 * 1000
let timer = null
let running = false

const senderFor = (io, userId) => {
    const registerChatHandlers = require('../socket/chatHandlers')
    const { broadcastOnline } = require('../socket/index')
    const handlers = {}
    const fake = { data : { userId : String(userId), v2 : true }, on : (ev, fn) => { handlers[ev] = fn }, emit : () => {} }
    registerChatHandlers(io, fake, { broadcastOnline })
    return (payload) => new Promise((resolve) => handlers['send-message'](payload, resolve))
}

const tick = async (io) => {
    if (running) return
    running = true
    try {
        const now = new Date()
        // scheduled messages (claim each one so two ticks never send it twice)
        for (let i = 0; i < 50; i++) {
            const job = await ScheduledModel.findOneAndUpdate({ status : 'pending', sendAt : { $lte : now } }, { $set : { status : 'sent' } }, { new : true }).lean()
            if (!job) break
            const send = senderFor(io, job.userId)
            const res = await send(job.e2ee
                ? { receiver : job.receiver, e2ee : job.e2ee, e2eeKind : job.e2eeKind, mentions : job.mentions, silent : job.silent, clientId : `sched-${job._id}`, scheduled : true }
                : { receiver : job.receiver, text : job.text, silent : job.silent, clientId : `sched-${job._id}` })
            await ScheduledModel.updateOne({ _id : job._id }, res.ok
                ? { $set : { messageId : res.message?._id } }
                : { $set : { status : 'failed', error : res.error || 'Could not send' } })
            io.to(String(job.userId)).emit('scheduled-changed', { id : String(job._id), status : res.ok ? 'sent' : 'failed', error : res.error })
        }
        // reminders
        const due = await ReminderModel.find({ firedAt : null, done : false, remindAt : { $lte : now } }).limit(100).lean()
        for (const r of due) {
            await ReminderModel.updateOne({ _id : r._id, firedAt : null }, { $set : { firedAt : now } })
            io.to(String(r.userId)).emit('reminder-due', { reminder : { ...r, firedAt : now } })
        }
    } catch (error) {
        console.error('[scheduler]', error.message)
    } finally {
        running = false
    }
}

const startScheduler = (io) => {
    if (timer) return
    timer = setInterval(() => tick(io), TICK_MS)
    timer.unref?.()
}

module.exports = { startScheduler, tick }
