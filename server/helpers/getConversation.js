const { ConversationModel, MessageModel } = require("../models/conversation.model")
const UserModel = require("../models/user.model")
const {
    getState, visibleFilter, publicUser, serializeMessage, receiptsAllowed, idOf,
    isGroup, memberOf, groupAsPeer, chatsOf, contactOf
} = require("./chat")

// One row of a user's chat list: last visible message + unread count (null = hidden from the list).
const listItem = async (conv, meUser) => {
    const me = String(meUser._id)
    const group = isGroup(conv)
    if (!group && (!conv.sender || !conv.receiver)) return null

    const state = getState(conv, me)
    const filter = visibleFilter(conv, me)
    const unreadFilter = group
        ? { ...filter, msgByUserId : { $ne : meUser._id }, 'readBy.userId' : { $ne : meUser._id }, 'system.action' : { $exists : false } }
        : { ...filter, msgByUserId : { $ne : meUser._id }, seen : false }

    const [lastMsg, unseenMsg] = await Promise.all([
        MessageModel.findOne(filter).sort({ createdAt : -1, _id : -1 }).lean(),
        MessageModel.countDocuments(unreadFilter)
    ])

    // "deleted for me" chats stay hidden until a newer message arrives
    if (state.hiddenAt && (!lastMsg || lastMsg.createdAt <= state.hiddenAt)) return null

    const common = {
        _id : conv._id,
        unseenMsg,
        archived : !!state.archived,
        pinned : !!state.pinned,
        pinnedAt : state.pinnedAt,
        muted : !!state.muted,
        markedUnread : !!state.markedUnread,
        disappearAfter : conv.disappearAfter || 0,
        lastActivity : lastMsg?.createdAt || conv.updatedAt
    }

    if (group) {
        let last
        if (lastMsg) {
            last = serializeMessage(lastMsg, me)
            if (!lastMsg.system?.action && String(lastMsg.msgByUserId) !== me) {
                const author = await UserModel.findById(lastMsg.msgByUserId).select('name phone').lean()
                if (author) {
                    const saved = contactOf(meUser, author._id)
                    last.authorName = saved?.name || author.name
                    last.author = { _id : author._id, name : saved?.name || author.name, profileName : author.name, phone : author.phone, isContact : !!saved }
                }
            }
        }
        return {
            ...common,
            isGroup : true,
            isMember : !!memberOf(conv, me),
            userDetails : groupAsPeer(conv),
            lastMsg : last
        }
    }

    const peer = idOf(conv.sender) === me ? conv.receiver : conv.sender
    return {
        ...common,
        // someone who isn't in my contacts started this chat and I haven't accepted yet
        request : String(conv.requestFor || '') === me,
        sender : publicUser(conv.sender, meUser),
        receiver : publicUser(conv.receiver, meUser),
        userDetails : publicUser(peer, meUser),
        lastMsg : lastMsg ? serializeMessage(lastMsg, me, { receipts : receiptsAllowed(meUser, peer) }) : undefined
    }
}

const sortList = (list) => list
    .filter(Boolean)
    .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return new Date(b.lastActivity) - new Date(a.lastActivity)
    })

// Chat list for a user: only the last visible message + unread count per conversation.
const getConversation = async (currentUserId) => {
    if (!currentUserId) return []
    const me = String(currentUserId)
    const meUser = await UserModel.findById(me).select('-password').lean()
    if (!meUser) return []

    const conversations = await ConversationModel.find(chatsOf(me))
        .select('-messages')
        .populate('sender', '-password')
        .populate('receiver', '-password')
        .lean()

    return sortList(await Promise.all(conversations.map((conv) => listItem(conv, meUser))))
}

// a single row (used to update one group chat for many members without rebuilding everyone's whole list)
const getConversationItem = async (convId, userId) => {
    const [conv, meUser] = await Promise.all([
        ConversationModel.findById(convId).select('-messages').lean(),
        UserModel.findById(userId).select('-password').lean()
    ])
    if (!conv || !meUser) return null
    return listItem(conv, meUser)
}

module.exports = getConversation
module.exports.getConversationItem = getConversationItem
