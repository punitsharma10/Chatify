const { DmThreadModel } = require('../models/dm.model')
const { isValidId } = require('../helpers/chat')

// Pixify Direct live typing indicator ("typing..."). Messages themselves go through the REST API (controllers/dm.controller.js).
module.exports = function registerDmHandlers(io, socket) {
    const me = socket.data.userId
    // remember which threads this connection belongs to for a minute, so typing doesn't hit the database each key press
    const cache = new Map()
    const membersOf = async (threadId) => {
        const hit = cache.get(threadId)
        if (hit && hit.until > Date.now()) return hit.ids
        const t = await DmThreadModel.findOne({ _id : threadId, 'members.userId' : me }).select('members.userId').lean()
        const ids = t ? t.members.map((m) => String(m.userId)) : null
        cache.set(threadId, { ids, until : Date.now() + 60000 })
        return ids
    }
    socket.on('px-dm-typing', async ({ threadId, typing } = {}) => {
        try {
            if (!isValidId(String(threadId))) return
            const ids = await membersOf(String(threadId))
            if (!ids) return
            for (const id of ids) if (id !== me) io.to(id).emit('px-dm-typing', { threadId : String(threadId), userId : me, typing : !!typing })
        } catch { /* ignore */ }
    })
}
