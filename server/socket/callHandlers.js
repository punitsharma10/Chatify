// One-to-one voice & video calls (WebRTC).
// The server only rings, connects and relays the WebRTC handshake between the two browsers;
// the audio/video itself flows directly between them (or through a TURN server if one is configured).
const mongoose = require('mongoose')
const crypto = require('crypto')
const UserModel = require('../models/user.model')
const { ConversationModel, MessageModel } = require('../models/conversation.model')
const getConversation = require('../helpers/getConversation')
const presence = require('./presence')
const { isValidId, publicUser, hasBlocked, contactOf, findConversation, getOrCreateConversation, serializeMessage, receiptsAllowed, memberOf, memberIds } = require('../helpers/chat')
const { getConversationItem } = require('../helpers/getConversation')

const RING_TIMEOUT_MS = 45 * 1000
// group calls connect everyone to everyone (mesh), which stays smooth up to about 4 people
const MAX_GROUP_CALL = 4

// in-memory call registry (calls don't survive a server restart, like any live call)
const calls = new Map()   // callId -> call
const inCall = new Map()  // userId -> callId (one call at a time per person, 1:1 or group)
const groupCalls = new Map() // callId -> { id, groupId, type, startedBy, participants: Map<userId, socketId>, everJoined: Set, connectedAt }
const groupCallOf = new Map() // groupId -> callId

const { getIceServers : iceServers, turnConfigured } = require('../helpers/iceServers')
if (!turnConfigured()) console.log('[calls] no TURN server configured: calls between different networks (e.g. mobile data) may fail to connect')

const loadUser = (id) => UserModel.findById(id).select('-password').lean()

module.exports = function registerCallHandlers(io, socket) {
    const me = socket.data.userId

    const on = (event, fn) => {
        socket.on(event, async (payload, ack) => {
            if (typeof payload === 'function') { ack = payload; payload = {} }
            try {
                const result = await fn(payload || {})
                if (typeof ack === 'function') ack({ ok : true, ...(result || {}) })
            } catch (error) {
                if (!error.userMessage) console.error(`[call:${event}]`, error)
                if (typeof ack === 'function') ack({ ok : false, error : error.userMessage || 'Something went wrong. Please try again.' })
            }
        })
    }
    const fail = (message) => Object.assign(new Error(message), { userMessage : message })

    // writes "Missed voice call" / "Video call 2:31" into the chat and refreshes both chat lists
    const logCall = async (call, status, duration = 0) => {
        try {
            const conv = await getOrCreateConversation(call.caller, call.callee)
            const msg = await new MessageModel({
                conversationId : conv._id,
                msgByUserId : new mongoose.Types.ObjectId(call.caller),
                call : { media : call.type, status, duration }
            }).save()
            await ConversationModel.updateOne({ _id : conv._id }, { $set : { lastMessageAt : msg.createdAt } })
            const [a, b] = await Promise.all([loadUser(call.caller), loadUser(call.callee)])
            const receipts = receiptsAllowed(a, b)
            io.to(call.caller).emit('message-new', { peerId : call.callee, message : serializeMessage(msg, call.caller, { receipts }) })
            io.to(call.callee).emit('message-new', { peerId : call.caller, message : serializeMessage(msg, call.callee, { receipts }) })
            for (const uid of [call.caller, call.callee]) io.to(uid).emit('conversation', await getConversation(uid))
        } catch (error) {
            console.error('[call] log failed', error.message)
        }
    }

    const finish = (call, reason) => {
        if (!calls.has(call.id)) return
        clearTimeout(call.timer)
        calls.delete(call.id)
        if (inCall.get(call.caller) === call.id) inCall.delete(call.caller)
        if (inCall.get(call.callee) === call.id) inCall.delete(call.callee)

        // both people, on every tab (stops ringing everywhere)
        io.to(call.caller).to(call.callee).emit('call-ended', { callId : call.id, reason })

        if (call.answeredAt) {
            logCall(call, 'answered', Math.max(1, Math.round((Date.now() - call.answeredAt) / 1000)))
        } else {
            logCall(call, reason === 'declined' ? 'declined' : 'missed')
        }
    }

    const partyOf = (callId) => {
        const call = calls.get(String(callId || ''))
        if (!call || (call.caller !== me && call.callee !== me)) throw fail('This call has ended')
        return call
    }

    on('call-config', async () => ({ iceServers : await iceServers() }))

    /* ================= group calls ================= */

    const loadGroup = async (groupId) => {
        if (!isValidId(String(groupId))) throw fail('Group not found')
        const group = await ConversationModel.findOne({ _id : groupId, isGroup : true }).select('-messages').lean()
        if (!group) throw fail('Group not found')
        return group
    }

    const describe = (gc) => ({ callId : gc.id, groupId : gc.groupId, type : gc.type, participants : [...gc.participants.keys()], startedBy : gc.startedBy })

    // everyone in the group sees whether a call is running (the "Join" button)
    const broadcastState = (group, gc) => {
        const state = gc ? describe(gc) : { groupId : String(group._id), callId : null }
        for (const uid of memberIds(group)) io.to(uid).emit('group-call-state', state)
    }

    const person = async (userId, viewerId) => {
        const [u, viewer] = await Promise.all([loadUser(userId), loadUser(viewerId)])
        return u ? publicUser(u, viewer) : { _id : userId, name : 'Someone' }
    }

    const logGroupCall = async (gc) => {
        try {
            const group = await ConversationModel.findById(gc.groupId).select('-messages').lean()
            if (!group) return
            const joined = gc.everJoined.size
            const msg = await new MessageModel({
                conversationId : group._id,
                msgByUserId : new mongoose.Types.ObjectId(gc.startedBy),
                recipients : [],
                call : {
                    media : gc.type,
                    status : joined > 1 ? 'answered' : 'missed',
                    duration : gc.connectedAt ? Math.max(1, Math.round((Date.now() - gc.connectedAt) / 1000)) : 0,
                    participants : joined
                }
            }).save()
            await ConversationModel.updateOne({ _id : group._id }, { $set : { lastMessageAt : msg.createdAt } })
            for (const uid of memberIds(group)) {
                io.to(uid).emit('message-new', { peerId : String(group._id), message : serializeMessage(msg, uid), isGroup : true })
                const item = await getConversationItem(group._id, uid)
                if (item) io.to(uid).emit('conversation-item', { item })
            }
        } catch (error) {
            console.error('[group call] log failed', error.message)
        }
    }

    const endGroupCall = async (gc) => {
        if (!groupCalls.has(gc.id)) return
        clearTimeout(gc.timer)
        groupCalls.delete(gc.id)
        if (groupCallOf.get(gc.groupId) === gc.id) groupCallOf.delete(gc.groupId)
        for (const uid of gc.participants.keys()) if (inCall.get(uid) === gc.id) inCall.delete(uid)
        const group = await ConversationModel.findById(gc.groupId).select('members').lean()
        // stop ringing for everyone and close the call screens
        if (group) for (const uid of memberIds(group)) io.to(uid).emit('group-call-ended', { callId : gc.id, groupId : gc.groupId })
        if (group) broadcastState(group, null)
        logGroupCall(gc)
    }

    const leaveGroupCall = async (gc, userId, socketId) => {
        if (!gc.participants.has(userId)) return
        if (socketId && gc.participants.get(userId) !== socketId) return
        gc.participants.delete(userId)
        if (inCall.get(userId) === gc.id) inCall.delete(userId)
        for (const [, sid] of gc.participants) io.to(sid).emit('group-call-left', { callId : gc.id, userId })
        // the call ends when nobody is left, or one person is left alone after others had joined
        if (gc.participants.size === 0 || (gc.participants.size === 1 && gc.everJoined.size > 1)) return endGroupCall(gc)
        const group = await ConversationModel.findById(gc.groupId).select('members').lean()
        if (group) broadcastState(group, gc)
    }

    const joinGroupCall = async (gc, group) => {
        if (gc.participants.has(me)) throw fail("You're already in this call")
        if (inCall.has(me)) throw fail("You're already on a call")
        if (gc.participants.size >= MAX_GROUP_CALL) throw fail(`This call is full (max ${MAX_GROUP_CALL} people)`)
        const others = [...gc.participants.entries()]
        gc.participants.set(me, socket.id)
        gc.everJoined.add(me)
        inCall.set(me, gc.id)
        if (gc.participants.size >= 2) {
            if (!gc.connectedAt) gc.connectedAt = Date.now()
            clearTimeout(gc.timer)
        }
        // stop ringing on my other tabs
        socket.to(me).emit('group-call-dismiss', { callId : gc.id })
        for (const [uid, sid] of others) io.to(sid).emit('group-call-joined', { callId : gc.id, user : await person(me, uid) })
        broadcastState(group, gc)
        // the newcomer connects to everyone already there
        return {
            callId : gc.id,
            groupId : gc.groupId,
            type : gc.type,
            participants : await Promise.all(others.map(([uid]) => person(uid, me))),
            iceServers : await iceServers()
        }
    }

    on('group-call-start', async ({ groupId, type }) => {
        if (!['audio', 'video'].includes(type)) throw fail('Invalid call type')
        const group = await loadGroup(groupId)
        if (!memberOf(group, me)) throw fail("You're no longer a member of this group")
        const existing = groupCalls.get(groupCallOf.get(String(group._id)))
        if (existing) return { ...(await joinGroupCall(existing, group)), joinedExisting : true }
        if (inCall.has(me)) throw fail("You're already on a call")

        const gc = {
            id : crypto.randomUUID(), groupId : String(group._id), type, startedBy : me,
            participants : new Map(), everJoined : new Set(), connectedAt : null
        }
        groupCalls.set(gc.id, gc)
        groupCallOf.set(gc.groupId, gc.id)
        const result = await joinGroupCall(gc, group)
        // nobody joined in time -> end it
        gc.timer = setTimeout(() => { if (gc.participants.size <= 1) endGroupCall(gc) }, RING_TIMEOUT_MS)

        const caller = await loadUser(me)
        for (const uid of memberIds(group)) {
            if (uid === me || !presence.isOnline(uid) || inCall.has(uid)) continue
            const viewer = await loadUser(uid)
            io.to(uid).emit('group-call-incoming', {
                callId : gc.id, groupId : gc.groupId, type,
                group : { _id : group._id, name : group.name, avatar : group.avatar || '' },
                from : publicUser(caller, viewer)
            })
        }
        return result
    })

    on('group-call-join', async ({ callId }) => {
        const gc = groupCalls.get(String(callId || ''))
        if (!gc) throw fail('This call has ended')
        const group = await loadGroup(gc.groupId)
        if (!memberOf(group, me)) throw fail("You're no longer a member of this group")
        return joinGroupCall(gc, group)
    })

    // "Decline": stop ringing on all my tabs (the others keep talking)
    on('group-call-decline', async ({ callId }) => {
        io.to(me).emit('group-call-dismiss', { callId : String(callId || '') })
    })

    on('group-call-leave', async ({ callId }) => {
        const gc = groupCalls.get(String(callId || ''))
        if (gc) await leaveGroupCall(gc, me)
    })

    // is a call running in this group? (when opening the chat)
    on('group-call-status', async ({ groupId }) => {
        const group = await loadGroup(groupId)
        if (!memberOf(group, me)) return { call : null }
        const gc = groupCalls.get(groupCallOf.get(String(group._id)))
        return { call : gc ? describe(gc) : null }
    })

    // WebRTC handshake between two participants of the same group call
    socket.on('group-call-signal', ({ callId, to, data } = {}) => {
        const gc = groupCalls.get(String(callId || ''))
        if (!gc || !data || gc.participants.get(me) !== socket.id) return
        const target = gc.participants.get(String(to || ''))
        if (target) io.to(target).emit('group-call-signal', { callId : gc.id, from : me, data })
    })

    socket.on('group-call-media', ({ callId, video, audio } = {}) => {
        const gc = groupCalls.get(String(callId || ''))
        if (!gc || gc.participants.get(me) !== socket.id) return
        for (const [uid, sid] of gc.participants) if (uid !== me) io.to(sid).emit('group-call-media', { callId : gc.id, userId : me, video : !!video, audio : !!audio })
    })

    on('call-start', async ({ to, type }) => {
        if (!isValidId(String(to)) || String(to) === me) throw fail('Invalid contact')
        if (!['audio', 'video'].includes(type)) throw fail('Invalid call type')
        const [caller, callee] = await Promise.all([loadUser(me), loadUser(to)])
        if (!callee) throw fail('User not found')
        const calleeName = publicUser(callee, caller).name

        if (hasBlocked(caller, callee._id)) throw fail(`Unblock ${calleeName} to call them`)
        // like a blocked number: the call just can't be connected (the caller isn't told they're blocked)
        if (hasBlocked(callee, me)) throw fail("Couldn't connect the call. Try again later.")

        // privacy: you can call people who saved you, or who you already chat with (not an unaccepted request)
        const conv = await findConversation(me, String(to))
        const consented = !!contactOf(callee, me) || (conv && String(conv.requestFor || '') !== String(to))
        if (!consented) throw fail(`You can call ${calleeName} after they accept your message or save you as a contact`)

        if (inCall.has(me)) throw fail("You're already on a call")

        const call = { id : crypto.randomUUID(), caller : me, callee : String(to), type, callerSocket : socket.id, calleeSocket : null, createdAt : Date.now() }

        if (inCall.has(call.callee)) {
            logCall(call, 'missed')
            throw fail(`${calleeName} is on another call`)
        }
        if (!presence.isOnline(call.callee)) {
            logCall(call, 'missed')
            throw fail(`${calleeName} isn't online right now. They'll see a missed call.`)
        }

        calls.set(call.id, call)
        inCall.set(me, call.id)
        inCall.set(call.callee, call.id)
        call.timer = setTimeout(() => finish(call, 'no-answer'), RING_TIMEOUT_MS)

        io.to(call.callee).emit('call-incoming', { callId : call.id, type, from : publicUser(caller, callee) })
        return { callId : call.id, iceServers : await iceServers() }
    })

    on('call-accept', async ({ callId }) => {
        const call = partyOf(callId)
        if (call.callee !== me) throw fail('Only the person being called can answer')
        if (call.calleeSocket) throw fail('This call was answered on another device')
        call.calleeSocket = socket.id
        call.answeredAt = Date.now()
        clearTimeout(call.timer)
        io.to(call.callerSocket).emit('call-accepted', { callId : call.id })
        // stop ringing on the callee's other tabs / devices
        socket.to(me).emit('call-ended', { callId : call.id, reason : 'answered-elsewhere' })
        return { iceServers : await iceServers() }
    })

    on('call-reject', async ({ callId }) => {
        const call = partyOf(callId)
        if (call.callee !== me || call.calleeSocket) throw fail('This call has ended')
        finish(call, 'declined')
    })

    // hang up (either side) or cancel while it's still ringing
    on('call-end', async ({ callId }) => {
        const call = calls.get(String(callId || ''))
        if (!call || (call.caller !== me && call.callee !== me)) return
        finish(call, call.answeredAt ? 'hangup' : (call.caller === me ? 'cancelled' : 'declined'))
    })

    // WebRTC handshake (offer / answer / ICE candidates), relayed only between the two devices in the call
    socket.on('call-signal', ({ callId, data } = {}) => {
        const call = calls.get(String(callId || ''))
        if (!call || !data) return
        const target = socket.id === call.callerSocket ? call.calleeSocket : socket.id === call.calleeSocket ? call.callerSocket : null
        if (target) io.to(target).emit('call-signal', { callId : call.id, data })
    })

    // "camera off" / "muted" indicators for the other side
    socket.on('call-media', ({ callId, video, audio } = {}) => {
        const call = calls.get(String(callId || ''))
        if (!call) return
        const target = socket.id === call.callerSocket ? call.calleeSocket : socket.id === call.calleeSocket ? call.callerSocket : null
        if (target) io.to(target).emit('call-media', { callId : call.id, video : !!video, audio : !!audio })
    })

    // a device in a call went away (closed tab, lost network): end that call
    socket.on('disconnect', () => {
        for (const call of calls.values()) {
            if (call.callerSocket === socket.id || call.calleeSocket === socket.id) finish(call, 'disconnected')
        }
        for (const gc of groupCalls.values()) {
            if (gc.participants.get(me) === socket.id) leaveGroupCall(gc, me, socket.id).catch(() => {})
        }
    })
}

module.exports.iceServers = iceServers
module.exports.turnConfigured = turnConfigured
