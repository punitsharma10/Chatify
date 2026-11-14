const { ConversationModel, MessageModel } = require("../models/conversation.model")
const UserModel = require("../models/user.model")
const { getState, visibleFilter, publicUser, serializeMessage, receiptsAllowed, idOf } = require("./chat")

// Chat list for a user. Previously this populated every message of every conversation;
// now it fetches only the last visible message + unread count per conversation.
const getConversation = async(currentUserId)=>{
    if(!currentUserId){
        return []
    }
    const me = String(currentUserId)
    const meUser = await UserModel.findById(me).select('-password').lean()
    if(!meUser) return []

    const conversations = await ConversationModel.find({
        "$or" : [
            { sender : me },
            { receiver : me }
        ]
    }).select('-messages').populate('sender', '-password').populate('receiver', '-password').lean()

    const list = await Promise.all(conversations.map(async(conv)=>{
        if(!conv.sender || !conv.receiver) return null

        const state = getState(conv, me)
        const filter = visibleFilter(conv, me)

        const [lastMsg, unseenMsg] = await Promise.all([
            MessageModel.findOne(filter).sort({ createdAt : -1, _id : -1 }).lean(),
            MessageModel.countDocuments({ ...filter, msgByUserId : { $ne : meUser._id }, seen : false })
        ])

        // "deleted for me" chats stay hidden until a newer message arrives
        if(state.hiddenAt && (!lastMsg || lastMsg.createdAt <= state.hiddenAt)) return null

        const peer = idOf(conv.sender) === me ? conv.receiver : conv.sender

        return {
            _id : conv._id,
            sender : publicUser(conv.sender, meUser),
            receiver : publicUser(conv.receiver, meUser),
            userDetails : publicUser(peer, meUser),
            unseenMsg,
            lastMsg : lastMsg ? serializeMessage(lastMsg, me, { receipts : receiptsAllowed(meUser, peer) }) : undefined,
            archived : !!state.archived,
            pinned : !!state.pinned,
            pinnedAt : state.pinnedAt,
            muted : !!state.muted,
            markedUnread : !!state.markedUnread,
            disappearAfter : conv.disappearAfter || 0,
            lastActivity : lastMsg?.createdAt || conv.updatedAt
        }
    }))

    return list
        .filter(Boolean)
        .sort((a, b) => {
            if(a.pinned !== b.pinned) return a.pinned ? -1 : 1
            return new Date(b.lastActivity) - new Date(a.lastActivity)
        })
}

module.exports = getConversation
