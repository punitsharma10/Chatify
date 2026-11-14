const mongoose = require('mongoose')
const UserModel = require('../models/user.model')
const { ConversationModel, MessageModel } = require('../models/conversation.model')
const getConversation = require('../helpers/getConversation')
const presence = require('./presence')
const {
    LIMITS, REPLY_FIELDS, isValidId, escapeRegex, isAllowedMediaUrl, hasBlocked, receiptsAllowed,
    publicUser, isParticipant, peerOf, getState, setState, findConversation, getOrCreateConversation,
    visibleFilter, serializeMessage, loadMessages
} = require('../helpers/chat')

// error whose message is safe to show to the user
class UserError extends Error {}

const oid = (id) => new mongoose.Types.ObjectId(String(id))
const loadUser = (id) => UserModel.findById(id).select('-password').lean()

const validIds = (ids, max = LIMITS.MAX_BULK) => {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > max) throw new UserError('Invalid selection')
    const unique = [...new Set(ids.map(String))]
    if (!unique.every(isValidId)) throw new UserError('Invalid selection')
    return unique
}

const cleanText = (text) => {
    if (text === undefined || text === null) return ""
    if (typeof text !== 'string') throw new UserError('Invalid message')
    const t = text.replace(/\r\n/g, '\n').trim()
    if (t.length > LIMITS.TEXT_MAX) throw new UserError(`Message is too long (max ${LIMITS.TEXT_MAX} characters)`)
    return t
}

module.exports = function registerChatHandlers(io, socket, { broadcastOnline }) {
    const me = socket.data.userId
    const meId = oid(me)

    /* ---------- helpers ---------- */

    // wraps a handler: catches errors and answers the client's ack callback with { ok, ...result } / { ok:false, error }
    const on = (event, fn) => {
        socket.on(event, async (...args) => {
            const ack = typeof args[args.length - 1] === 'function' ? args.pop() : null
            try {
                const result = await fn(...args, { hasAck : !!ack })
                if (ack) ack({ ok : true, ...(result || {}) })
            } catch (error) {
                if (!(error instanceof UserError)) console.error(`[socket:${event}]`, error)
                if (ack) ack({ ok : false, error : error instanceof UserError ? error.message : 'Something went wrong. Please try again.' })
            }
        })
    }

    const myConversationIds = () => ConversationModel.find({ $or : [{ sender : me }, { receiver : me }] }).distinct('_id')

    const emitSidebar = async (userIds) => {
        for (const uid of new Set(userIds.map(String))) {
            io.to(uid).emit('conversation', await getConversation(uid))
        }
    }

    // older clients expect the whole message list in a 'message' event
    const emitLegacyMessages = async (conv, userIds) => {
        for (const uid of new Set(userIds.map(String))) {
            const sockets = await io.in(uid).fetchSockets()
            const legacy = sockets.filter((s) => !s.data.v2)
            if (!legacy.length) continue
            const [u, peer] = await Promise.all([loadUser(uid), loadUser(peerOf(conv, uid))])
            const docs = await MessageModel.find(visibleFilter(conv, uid)).sort({ createdAt : 1 }).populate('replyTo', REPLY_FIELDS).lean()
            const list = docs.map((d) => serializeMessage(d, uid, { receipts : receiptsAllowed(u, peer) }))
            legacy.forEach((s) => s.emit('message', list))
        }
    }

    // sends updated messages to every participant who can still see them
    const emitMessageUpdate = async (conv, ids, { only } = {}) => {
        const docs = await MessageModel.find({ _id : { $in : ids } }).populate('replyTo', REPLY_FIELDS).lean()
        const people = only ? [only] : [String(conv.sender), String(conv.receiver)]
        const users = await UserModel.find({ _id : { $in : [String(conv.sender), String(conv.receiver)] } }).select('-password').lean()
        const byId = Object.fromEntries(users.map((u) => [String(u._id), u]))
        for (const uid of new Set(people)) {
            const visible = docs.filter((d) => !(d.deletedFor || []).some((x) => String(x) === uid))
            if (!visible.length) continue
            const receipts = receiptsAllowed(byId[uid], byId[peerOf(conv, uid)])
            io.to(uid).emit('message-updated', {
                peerId : peerOf(conv, uid),
                messages : visible.map((d) => serializeMessage(d, uid, { receipts }))
            })
        }
    }

    // fetch messages + their conversations and make sure the current user takes part in all of them
    const getOwnedContext = async (ids) => {
        const msgs = await MessageModel.find({ _id : { $in : ids } }).lean()
        if (msgs.length !== ids.length) throw new UserError('Some messages no longer exist')
        const convIds = [...new Set(msgs.map((m) => String(m.conversationId)))]
        const convs = await ConversationModel.find({ _id : { $in : convIds } }).select('-messages').lean()
        if (convs.length !== convIds.length || !convs.every((c) => isParticipant(c, me))) throw new UserError('Not allowed')
        const visible = msgs.filter((m) => {
            const conv = convs.find((c) => String(c._id) === String(m.conversationId))
            const state = getState(conv, me)
            const hiddenForMe = (m.deletedFor || []).some((x) => String(x) === me)
            const cleared = state.clearedAt && m.createdAt <= state.clearedAt
            return !hiddenForMe && !cleared
        })
        if (visible.length !== msgs.length) throw new UserError('Some messages no longer exist')
        return { msgs, convs }
    }

    const markDelivered = async (query) => {
        const msgs = await MessageModel.find({
            ...query,
            msgByUserId : { $ne : meId },
            deliveredAt : null,
            deletedFor : { $ne : meId }
        }).select('_id msgByUserId').lean()
        if (!msgs.length) return
        const now = new Date()
        await MessageModel.updateMany({ _id : { $in : msgs.map((m) => m._id) }, deliveredAt : null }, { $set : { deliveredAt : now } })
        const bySender = {}
        msgs.forEach((m) => { (bySender[String(m.msgByUserId)] = bySender[String(m.msgByUserId)] || []).push(String(m._id)) })
        for (const [sender, ids] of Object.entries(bySender)) {
            io.to(sender).emit('messages-status', { peerId : me, ids, deliveredAt : now })
        }
    }

    const getConvWith = async (peerId, { create = false } = {}) => {
        if (!isValidId(peerId)) throw new UserError('Invalid user')
        const conv = create ? await getOrCreateConversation(me, peerId) : await findConversation(me, peerId)
        if (!conv && !create) throw new UserError('Conversation not found')
        return conv
    }

    // creates and delivers one message from the current user to `peer`
    const createMessage = async (meUser, peer, content, { clientId, replyTo, forwarded = false } = {}) => {
        const peerId = String(peer._id)
        if (hasBlocked(meUser, peerId)) throw new UserError('You blocked this contact. Unblock them to send a message.')

        const receipts = receiptsAllowed(meUser, peer)

        if (clientId) {
            const existing = await MessageModel.findOne({ msgByUserId : meId, clientId }).populate('replyTo', REPLY_FIELDS).lean()
            if (existing) return { message : serializeMessage(existing, me, { receipts }), duplicate : true }
        }

        const conv = await getOrCreateConversation(me, peerId)

        let replyId
        if (replyTo) {
            if (!isValidId(String(replyTo))) throw new UserError('Invalid reply')
            const r = await MessageModel.findOne({ _id : replyTo, conversationId : conv._id }).select('_id').lean()
            if (r) replyId = r._id
        }

        // if the recipient blocked me, the message is stored for me only and never delivered (single tick)
        const blockedByPeer = hasBlocked(peer, me)

        const message = new MessageModel({
            conversationId : conv._id,
            clientId,
            ...content,
            msgByUserId : meId,
            replyTo : replyId,
            forwarded,
            deletedFor : blockedByPeer ? [peer._id] : [],
            expiresAt : conv.disappearAfter ? new Date(Date.now() + conv.disappearAfter * 1000) : undefined
        })

        try {
            await message.save()
        } catch (error) {
            if (error.code === 11000 && clientId) {
                const existing = await MessageModel.findOne({ msgByUserId : meId, clientId }).populate('replyTo', REPLY_FIELDS).lean()
                return { message : serializeMessage(existing, me, { receipts }), duplicate : true }
            }
            throw error
        }

        await ConversationModel.updateOne({ _id : conv._id }, {
            $push : { messages : message._id },
            $set : { lastMessageAt : message.createdAt }
        })
        await message.populate('replyTo', REPLY_FIELDS)

        const forMe = serializeMessage(message, me, { receipts })
        io.to(me).emit('message-new', { peerId, message : forMe })
        if (peerId !== me && !blockedByPeer) {
            io.to(peerId).emit('message-new', { peerId : me, message : serializeMessage(message, peerId, { receipts }) })
        }

        // chat lists are refreshed in the background so the sender's ack isn't delayed
        emitSidebar(blockedByPeer ? [me] : [me, peerId]).catch((e) => console.error('[sidebar]', e))
        emitLegacyMessages(conv, blockedByPeer ? [me] : [me, peerId]).catch(() => {})
        return { message : forMe }
    }

    const sendMessage = async (payload = {}) => {
        const receiverId = String(payload.receiver || '')
        if (!isValidId(receiverId)) throw new UserError('Invalid recipient')

        const text = cleanText(payload.text)
        const content = {
            text,
            imageUrl : payload.imageUrl || "",
            videoUrl : payload.videoUrl || "",
            fileUrl : payload.fileUrl || "",
            fileName : typeof payload.fileName === 'string' ? payload.fileName.slice(0, 255) : "",
            fileSize : Number.isFinite(Number(payload.fileSize)) && Number(payload.fileSize) > 0 ? Number(payload.fileSize) : 0,
            fileType : typeof payload.fileType === 'string' ? payload.fileType.slice(0, 100) : ""
        }
        if (![content.imageUrl, content.videoUrl, content.fileUrl].every(isAllowedMediaUrl)) throw new UserError('Invalid attachment')
        if (!content.text && !content.imageUrl && !content.videoUrl && !content.fileUrl) throw new UserError('Message is empty')
        if (content.fileUrl && !content.fileName) content.fileName = 'Document'

        const clientId = typeof payload.clientId === 'string' && payload.clientId.length <= 64 ? payload.clientId : undefined

        const [meUser, peer] = await Promise.all([loadUser(me), loadUser(receiverId)])
        if (!peer) throw new UserError('User not found')

        return createMessage(meUser, peer, content, { clientId, replyTo : payload.replyTo })
    }

    const markSeen = async (peerId) => {
        if (!isValidId(String(peerId))) return
        const conv = await findConversation(me, peerId)
        if (!conv) return
        const now = new Date()
        const ids = await MessageModel.find({
            conversationId : conv._id,
            msgByUserId : oid(peerId),
            seen : false,
            deletedFor : { $ne : meId }
        }).distinct('_id')

        const state = getState(conv, me)
        if (state.markedUnread) await setState(conv._id, meId, { markedUnread : false })
        if (!ids.length && !state.markedUnread) return

        if (ids.length) {
            await MessageModel.updateMany({ _id : { $in : ids }, deliveredAt : null }, { $set : { deliveredAt : now } })
            await MessageModel.updateMany({ _id : { $in : ids } }, { $set : { seen : true, seenAt : now } })
            const [meUser, peer] = await Promise.all([loadUser(me), loadUser(peerId)])
            const receipts = receiptsAllowed(meUser, peer)
            io.to(String(peerId)).emit('messages-status', {
                peerId : me,
                ids : ids.map(String),
                deliveredAt : now,
                ...(receipts ? { seenAt : now, seen : true } : {})
            })
        }
        emitSidebar([me, String(peerId)]).catch((e) => console.error('[sidebar]', e))
    }

    /* ---------- events ---------- */

    // open a chat: peer details + latest page of messages
    on('message-page', async (peerId, { hasAck } = {}) => {
        if (!isValidId(String(peerId))) throw new UserError('Invalid user')
        const [meUser, peer] = await Promise.all([loadUser(me), loadUser(peerId)])
        if (!peer) throw new UserError('User not found')

        const peerInfo = publicUser(peer, meUser)
        socket.emit('message-user', peerInfo)

        const conv = await findConversation(me, peerId)
        if (!conv) {
            if (!socket.data.v2) socket.emit('message', [])
            return { peer : peerInfo, messages : [], hasMore : false, pinned : [], conversation : null }
        }

        const receipts = receiptsAllowed(meUser, peer)
        const { messages, hasMore } = await loadMessages(conv, me)
        const pinned = await MessageModel.find({ ...visibleFilter(conv, me), pinned : true, deletedForEveryone : { $ne : true } })
            .sort({ pinnedAt : -1 }).limit(LIMITS.MAX_PINNED_MESSAGES).populate('replyTo', REPLY_FIELDS).lean()

        await markDelivered({ conversationId : conv._id })

        const serialized = messages.map((m) => serializeMessage(m, me, { receipts }))
        if (!socket.data.v2 && !hasAck) socket.emit('message', serialized)

        const state = getState(conv, me)
        return {
            peer : peerInfo,
            messages : serialized,
            hasMore,
            pinned : pinned.map((m) => serializeMessage(m, me, { receipts })),
            conversation : {
                _id : conv._id,
                disappearAfter : conv.disappearAfter || 0,
                muted : !!state.muted,
                archived : !!state.archived,
                pinned : !!state.pinned
            }
        }
    })

    on('get-peer', async (peerId) => {
        if (!isValidId(String(peerId))) throw new UserError('Invalid user')
        const [meUser, peer] = await Promise.all([loadUser(me), loadUser(peerId)])
        if (!peer) throw new UserError('User not found')
        return { peer : publicUser(peer, meUser) }
    })

    // pagination: older messages before a date
    on('load-older', async ({ peerId, before } = {}) => {
        const conv = await getConvWith(peerId)
        const [meUser, peer] = await Promise.all([loadUser(me), loadUser(peerId)])
        const receipts = receiptsAllowed(meUser, peer)
        const { messages, hasMore } = await loadMessages(conv, me, { before })
        return { messages : messages.map((m) => serializeMessage(m, me, { receipts })), hasMore }
    })

    // load everything between a date and the oldest loaded message (used to jump to a search result / replied message)
    on('load-range', async ({ peerId, from, before } = {}) => {
        const conv = await getConvWith(peerId)
        const fromDate = new Date(from)
        if (isNaN(fromDate)) throw new UserError('Invalid range')
        const filter = visibleFilter(conv, me)
        filter.createdAt = { ...(filter.createdAt || {}), $gte : fromDate }
        if (before && !isNaN(new Date(before))) filter.createdAt.$lt = new Date(before)
        const docs = await MessageModel.find(filter).sort({ createdAt : 1 }).limit(1000).populate('replyTo', REPLY_FIELDS).lean()
        const [meUser, peer] = await Promise.all([loadUser(me), loadUser(peerId)])
        const receipts = receiptsAllowed(meUser, peer)
        return { messages : docs.map((m) => serializeMessage(m, me, { receipts })) }
    })

    // new client: ack-based send with client id for de-duplication / retries
    on('send-message', (payload) => sendMessage(payload))

    // legacy event name (old client). Identity comes from the socket, not from data.sender / data.msgByUserId
    on('new message', (data = {}) => sendMessage({
        receiver : data.receiver,
        text : data.text,
        imageUrl : data.imageUrl,
        videoUrl : data.videoUrl
    }))

    on('mark-delivered', async ({ ids } = {}) => {
        const list = validIds(ids, 500)
        await markDelivered({ _id : { $in : list.map(oid) }, conversationId : { $in : await myConversationIds() } })
    })

    // client came online / reconnected: everything addressed to it has now reached the device
    on('delivered-all', async () => {
        await markDelivered({ conversationId : { $in : await myConversationIds() } })
    })

    on('seen', (peerId) => markSeen(peerId))

    on('sidebar', async () => {
        socket.emit('conversation', await getConversation(me))
    })

    on('edit-message', async ({ messageId, text } = {}) => {
        const [id] = validIds([messageId])
        const { msgs, convs } = await getOwnedContext([id])
        const msg = msgs[0]
        if (String(msg.msgByUserId) !== me) throw new UserError('You can only edit your own messages')
        if (msg.deletedForEveryone) throw new UserError('This message was deleted')
        if (msg.forwarded) throw new UserError('Forwarded messages cannot be edited')
        if (Date.now() - new Date(msg.createdAt).getTime() > LIMITS.EDIT_WINDOW_MS) throw new UserError('Messages can only be edited within 15 minutes')
        const newText = cleanText(text)
        const hasMedia = msg.imageUrl || msg.videoUrl || msg.fileUrl
        if (!newText && !hasMedia) throw new UserError('Message cannot be empty')
        if (newText === msg.text) return {}
        await MessageModel.updateOne({ _id : id }, { $set : { text : newText, editedAt : new Date() } })
        await emitMessageUpdate(convs[0], [id])
        emitSidebar([String(convs[0].sender), String(convs[0].receiver)]).catch((e) => console.error('[sidebar]', e))
    })

    on('delete-messages', async ({ messageIds, scope } = {}) => {
        const ids = validIds(messageIds)
        const { msgs, convs } = await getOwnedContext(ids)
        if (convs.length !== 1) throw new UserError('Select messages from one chat')
        const conv = convs[0]

        if (scope === 'everyone') {
            const now = Date.now()
            for (const m of msgs) {
                if (String(m.msgByUserId) !== me) throw new UserError('You can only delete your own messages for everyone')
                if (now - new Date(m.createdAt).getTime() > LIMITS.DELETE_EVERYONE_WINDOW_MS) throw new UserError('Messages older than 48 hours can only be deleted for you')
            }
            await MessageModel.updateMany({ _id : { $in : ids } }, {
                $set : {
                    deletedForEveryone : true, deletedAt : new Date(),
                    text : "", imageUrl : "", videoUrl : "", fileUrl : "", fileName : "", fileSize : 0, fileType : "",
                    reactions : [], pinned : false
                }
            })
            await emitMessageUpdate(conv, ids)
            emitSidebar([String(conv.sender), String(conv.receiver)]).catch((e) => console.error('[sidebar]', e))
            emitLegacyMessages(conv, [String(conv.sender), String(conv.receiver)]).catch(() => {})
            return {}
        }

        if (scope !== 'me') throw new UserError('Invalid option')
        await MessageModel.updateMany({ _id : { $in : ids } }, { $addToSet : { deletedFor : meId } })
        io.to(me).emit('messages-removed', { peerId : peerOf(conv, me), ids })
        emitSidebar([me]).catch((e) => console.error('[sidebar]', e))
        return {}
    })

    on('undo-delete-for-me', async ({ messageIds } = {}) => {
        const ids = validIds(messageIds)
        const msgs = await MessageModel.find({ _id : { $in : ids } }).select('conversationId').lean()
        const convIds = [...new Set(msgs.map((m) => String(m.conversationId)))]
        if (convIds.length !== 1) throw new UserError('Invalid selection')
        const conv = await ConversationModel.findById(convIds[0]).select('-messages').lean()
        if (!conv || !isParticipant(conv, me)) throw new UserError('Not allowed')
        await MessageModel.updateMany({ _id : { $in : ids } }, { $pull : { deletedFor : meId } })
        await emitMessageUpdate(conv, ids, { only : me })
        emitSidebar([me]).catch((e) => console.error('[sidebar]', e))
    })

    on('react-message', async ({ messageId, emoji } = {}) => {
        const [id] = validIds([messageId])
        if (emoji !== '' && (typeof emoji !== 'string' || emoji.length > 16)) throw new UserError('Invalid reaction')
        const { msgs, convs } = await getOwnedContext([id])
        if (msgs[0].deletedForEveryone) throw new UserError('This message was deleted')
        const previous = (msgs[0].reactions || []).find((r) => String(r.userId) === me)
        await MessageModel.updateOne({ _id : id }, { $pull : { reactions : { userId : meId } } })
        if (emoji && (!previous || previous.emoji !== emoji)) {
            await MessageModel.updateOne({ _id : id }, { $push : { reactions : { userId : meId, emoji } } })
        }
        await emitMessageUpdate(convs[0], [id])
    })

    on('star-messages', async ({ messageIds, star } = {}) => {
        const ids = validIds(messageIds)
        const { convs } = await getOwnedContext(ids)
        await MessageModel.updateMany({ _id : { $in : ids } }, star ? { $addToSet : { starredBy : meId } } : { $pull : { starredBy : meId } })
        for (const conv of convs) await emitMessageUpdate(conv, ids, { only : me })
    })

    on('pin-message', async ({ messageId, pin } = {}) => {
        const [id] = validIds([messageId])
        const { msgs, convs } = await getOwnedContext([id])
        const conv = convs[0]
        if (msgs[0].deletedForEveryone) throw new UserError('This message was deleted')
        const changed = [id]
        if (pin) {
            const pinned = await MessageModel.find({ conversationId : conv._id, pinned : true, _id : { $ne : id } }).sort({ pinnedAt : 1 }).select('_id').lean()
            const overflow = pinned.length - (LIMITS.MAX_PINNED_MESSAGES - 1)
            if (overflow > 0) {
                const unpinIds = pinned.slice(0, overflow).map((p) => p._id)
                await MessageModel.updateMany({ _id : { $in : unpinIds } }, { $set : { pinned : false } })
                changed.push(...unpinIds.map(String))
            }
            await MessageModel.updateOne({ _id : id }, { $set : { pinned : true, pinnedAt : new Date(), pinnedBy : meId } })
        } else {
            await MessageModel.updateOne({ _id : id }, { $set : { pinned : false } })
        }
        await emitMessageUpdate(conv, changed)
    })

    on('forward-messages', async ({ messageIds, toUserIds } = {}) => {
        const ids = validIds(messageIds, 30)
        const targets = validIds(toUserIds, LIMITS.MAX_FORWARD_TARGETS)
        const { msgs } = await getOwnedContext(ids)
        if (msgs.some((m) => m.deletedForEveryone)) throw new UserError('Deleted messages cannot be forwarded')
        msgs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

        const meUser = await loadUser(me)
        const peers = await UserModel.find({ _id : { $in : targets } }).select('-password').lean()
        if (peers.length !== targets.length) throw new UserError('User not found')

        let sent = 0
        const failed = []
        for (const peer of peers) {
            try {
                for (const m of msgs) {
                    await createMessage(meUser, peer, {
                        text : m.text, imageUrl : m.imageUrl, videoUrl : m.videoUrl,
                        fileUrl : m.fileUrl, fileName : m.fileName, fileSize : m.fileSize, fileType : m.fileType
                    }, { forwarded : true })
                    sent += 1
                }
            } catch (error) {
                failed.push(peer.name)
            }
        }
        return { sent, failed }
    })

    on('search-messages', async ({ peerId, q } = {}) => {
        const query = typeof q === 'string' ? q.trim() : ''
        if (query.length < 1 || query.length > 100) return { results : [] }
        const regex = new RegExp(escapeRegex(query), 'i')
        const meUser = await loadUser(me)

        let convs
        if (peerId) {
            const conv = await getConvWith(peerId)
            convs = [conv.toObject ? conv.toObject() : conv]
        } else {
            convs = await ConversationModel.find({ $or : [{ sender : me }, { receiver : me }] }).select('-messages').lean()
        }
        if (!convs.length) return { results : [] }

        const docs = await MessageModel.find({
            conversationId : { $in : convs.map((c) => c._id) },
            deletedFor : { $ne : meId },
            deletedForEveryone : { $ne : true },
            text : regex,
            $or : [{ expiresAt : null }, { expiresAt : { $gt : new Date() } }]
        }).sort({ createdAt : -1 }).limit(60).lean()

        const convById = Object.fromEntries(convs.map((c) => [String(c._id), c]))
        const peerIds = [...new Set(convs.map((c) => peerOf(c, me)))]
        const peers = await UserModel.find({ _id : { $in : peerIds } }).select('-password').lean()
        const peerById = Object.fromEntries(peers.map((p) => [String(p._id), p]))

        const results = docs.filter((d) => {
            const state = getState(convById[String(d.conversationId)], me)
            return !state.clearedAt || d.createdAt > state.clearedAt
        }).slice(0, 50).map((d) => {
            const pid = peerOf(convById[String(d.conversationId)], me)
            const peer = peerById[pid]
            return {
                message : serializeMessage(d, me, { receipts : receiptsAllowed(meUser, peer) }),
                peer : publicUser(peer, meUser)
            }
        })
        return { results }
    })

    on('get-starred', async () => {
        const meUser = await loadUser(me)
        const convs = await ConversationModel.find({ $or : [{ sender : me }, { receiver : me }] }).select('-messages').lean()
        const docs = await MessageModel.find({
            conversationId : { $in : convs.map((c) => c._id) },
            starredBy : meId,
            deletedFor : { $ne : meId },
            deletedForEveryone : { $ne : true },
            $or : [{ expiresAt : null }, { expiresAt : { $gt : new Date() } }]
        }).sort({ createdAt : -1 }).limit(200).populate('replyTo', REPLY_FIELDS).lean()

        const convById = Object.fromEntries(convs.map((c) => [String(c._id), c]))
        const peers = await UserModel.find({ _id : { $in : [...new Set(convs.map((c) => peerOf(c, me)))] } }).select('-password').lean()
        const peerById = Object.fromEntries(peers.map((p) => [String(p._id), p]))

        const messages = docs.filter((d) => {
            const state = getState(convById[String(d.conversationId)], me)
            return !state.clearedAt || d.createdAt > state.clearedAt
        }).map((d) => {
            const peer = peerById[peerOf(convById[String(d.conversationId)], me)]
            return {
                message : serializeMessage(d, me, { receipts : receiptsAllowed(meUser, peer) }),
                peer : publicUser(peer, meUser)
            }
        })
        return { messages }
    })

    // media, documents and links shared in a chat
    on('get-shared', async ({ peerId } = {}) => {
        const conv = await getConvWith(peerId)
        const base = { ...visibleFilter(conv, me), deletedForEveryone : { $ne : true } }
        const [media, docs, links] = await Promise.all([
            MessageModel.find({ ...base, $and : [{ $or : [{ imageUrl : { $nin : ['', null] } }, { videoUrl : { $nin : ['', null] } }] }] }).sort({ createdAt : -1 }).limit(300).lean(),
            MessageModel.find({ ...base, fileUrl : { $nin : ['', null] } }).sort({ createdAt : -1 }).limit(200).lean(),
            MessageModel.find({ ...base, text : /https?:\/\/\S+/i }).sort({ createdAt : -1 }).limit(200).lean()
        ])
        const ser = (m) => serializeMessage(m, me, { receipts : false })
        return { media : media.map(ser), docs : docs.map(ser), links : links.map(ser) }
    })

    on('message-info', async ({ messageId } = {}) => {
        const [id] = validIds([messageId])
        const { msgs, convs } = await getOwnedContext([id])
        const msg = msgs[0]
        if (String(msg.msgByUserId) !== me) throw new UserError('Message info is only available for your messages')
        const [meUser, peer] = await Promise.all([loadUser(me), loadUser(peerOf(convs[0], me))])
        const receipts = receiptsAllowed(meUser, peer)
        return {
            info : {
                sentAt : msg.createdAt,
                deliveredAt : msg.deliveredAt || (msg.seen ? msg.seenAt || msg.updatedAt : null),
                seenAt : receipts ? (msg.seen ? msg.seenAt || null : null) : null,
                receiptsHidden : !receipts
            }
        }
    })

    // per-user chat list actions; none of these affect the other participant
    on('chat-action', async ({ peerId, action } = {}) => {
        const conv = await getConvWith(peerId)
        const now = new Date()
        switch (action) {
            case 'archive': await setState(conv._id, meId, { archived : true, pinned : false }); break
            case 'unarchive': await setState(conv._id, meId, { archived : false }); break
            case 'pin': {
                const pinnedCount = await ConversationModel.countDocuments({
                    _id : { $ne : conv._id },
                    userState : { $elemMatch : { userId : meId, pinned : true } }
                })
                if (pinnedCount >= LIMITS.MAX_PINNED_CHATS) throw new UserError(`You can only pin up to ${LIMITS.MAX_PINNED_CHATS} chats`)
                await setState(conv._id, meId, { pinned : true, pinnedAt : now, archived : false })
                break
            }
            case 'unpin': await setState(conv._id, meId, { pinned : false }); break
            case 'mute': await setState(conv._id, meId, { muted : true }); break
            case 'unmute': await setState(conv._id, meId, { muted : false }); break
            case 'mark-unread': await setState(conv._id, meId, { markedUnread : true }); break
            case 'mark-read':
                await setState(conv._id, meId, { markedUnread : false })
                await markSeen(peerId)
                break
            case 'clear':
                await setState(conv._id, meId, { clearedAt : now })
                io.to(me).emit('chat-cleared', { peerId : String(peerId) })
                break
            case 'delete':
                await setState(conv._id, meId, { clearedAt : now, hiddenAt : now, archived : false, pinned : false, markedUnread : false })
                io.to(me).emit('chat-cleared', { peerId : String(peerId), deleted : true })
                break
            default:
                throw new UserError('Unknown action')
        }
        emitSidebar([me]).catch((e) => console.error('[sidebar]', e))
        return {}
    })

    on('set-disappearing', async ({ peerId, seconds } = {}) => {
        const value = Number(seconds)
        if (!LIMITS.DISAPPEAR_OPTIONS.includes(value)) throw new UserError('Invalid timer')
        const meUser = await loadUser(me)
        if (hasBlocked(meUser, peerId)) throw new UserError('Unblock this contact first')
        const conv = await getConvWith(peerId, { create : true })
        await ConversationModel.updateOne({ _id : conv._id }, { $set : { disappearAfter : value } })
        const payload = { disappearAfter : value, by : me }
        io.to(me).emit('conversation-updated', { peerId : String(peerId), ...payload })
        if (String(peerId) !== me) io.to(String(peerId)).emit('conversation-updated', { peerId : me, ...payload })
        emitSidebar([me, String(peerId)]).catch((e) => console.error('[sidebar]', e))
        return {}
    })

    on('typing', async ({ to, isTyping } = {}) => {
        if (!isValidId(String(to)) || String(to) === me) return
        const [meUser, peer] = await Promise.all([loadUser(me), loadUser(to)])
        if (!peer || hasBlocked(meUser, to) || hasBlocked(peer, me)) return
        io.to(String(to)).emit('typing', { from : me, isTyping : !!isTyping })
    })

    on('block-user', async ({ userId, block } = {}) => {
        if (!isValidId(String(userId)) || String(userId) === me) throw new UserError('Invalid user')
        const exists = await UserModel.exists({ _id : userId })
        if (!exists) throw new UserError('User not found')
        const updated = await UserModel.findByIdAndUpdate(
            me,
            block ? { $addToSet : { blocked : oid(userId) } } : { $pull : { blocked : oid(userId) } },
            { new : true }
        ).select('-password').lean()
        presence.update(updated)
        broadcastOnline()
        emitSidebar([me, String(userId)]).catch((e) => console.error('[sidebar]', e))
        return { blocked : (updated.blocked || []).map(String) }
    })

    on('get-blocked', async () => {
        const meUser = await loadUser(me)
        const users = await UserModel.find({ _id : { $in : meUser.blocked || [] } }).select('-password').lean()
        return { users : users.map((u) => publicUser(u, meUser)) }
    })
}
