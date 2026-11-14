const { ConversationModel, MessageModel } = require('../models/conversation.model')
const UserModel = require('../models/user.model')
const EmailOtpModel = require('../models/emailOtp.model')

// Idempotent data migrations, run once at startup.

// 1) link messages created before conversationId existed to their conversation
const linkMessages = async () => {
    const pending = await MessageModel.countDocuments({ conversationId : { $exists : false } })
    if (!pending) return

    const conversations = await ConversationModel.find({}).select('_id messages updatedAt').lean()
    let updated = 0
    for (const conv of conversations) {
        if (!conv.messages?.length) continue
        const res = await MessageModel.updateMany(
            { _id : { $in : conv.messages }, conversationId : { $exists : false } },
            { $set : { conversationId : conv._id } }
        )
        updated += res.modifiedCount
        const last = await MessageModel.findOne({ conversationId : conv._id }).sort({ createdAt : -1 }).select('createdAt').lean()
        if (last) await ConversationModel.updateOne({ _id : conv._id }, { $set : { lastMessageAt : last.createdAt } })
    }
    console.log(`migration: linked ${updated} messages to their conversations`)
}

// 2) email used to be required + unique for every user. Accounts can now be phone-only, so the
//    unique index must only apply when an email exists (otherwise only one phone-only user could exist).
const fixUserIndexes = async () => {
    const indexes = await UserModel.collection.indexes()
    const old = indexes.find((i) => i.name === 'email_1' && !i.partialFilterExpression)
    if (old) {
        await UserModel.collection.dropIndex('email_1')
        console.log('migration: replaced strict email index with "unique when present"')
    }
    await UserModel.syncIndexes()
}

// 3) OTP codes used to be keyed by email only; old codes are short-lived, so just clear them
const fixOtpIndexes = async () => {
    const indexes = await EmailOtpModel.collection.indexes().catch(() => [])
    if (indexes.some((i) => i.name === 'email_1_purpose_1')) {
        await EmailOtpModel.collection.dropIndex('email_1_purpose_1')
        await EmailOtpModel.deleteMany({ target : { $exists : false } })
        console.log('migration: upgraded verification codes to support phone numbers')
    }
    await EmailOtpModel.syncIndexes()
}

// 4) contacts were added later: existing accounts get everyone they have already written to,
//    so their chats keep showing names instead of phone numbers. Runs once per account.
const seedContacts = async () => {
    const users = await UserModel.find({ contactsMigrated : { $ne : true } }).select('_id contacts').lean()
    let seeded = 0
    for (const user of users) {
        const convIds = await MessageModel.distinct('conversationId', { msgByUserId : user._id })
        const convs = await ConversationModel.find({ _id : { $in : convIds }, isGroup : { $ne : true } }).select('sender receiver').lean()
        const have = new Set((user.contacts || []).map((c) => String(c.userId)))
        const add = []
        for (const c of convs) {
            const peer = String(c.sender) === String(user._id) ? c.receiver : c.sender
            if (!peer || String(peer) === String(user._id) || have.has(String(peer))) continue
            have.add(String(peer))
            add.push({ userId : peer, name : '', addedAt : new Date() })
        }
        await UserModel.updateOne({ _id : user._id }, { $push : { contacts : { $each : add } }, $set : { contactsMigrated : true } })
        seeded += add.length
    }
    if (users.length) console.log(`migration: added ${seeded} contacts for ${users.length} existing accounts`)
}

const migrate = async () => {
    await linkMessages()
    await fixUserIndexes()
    await fixOtpIndexes()
    await seedContacts()
}

module.exports = migrate
