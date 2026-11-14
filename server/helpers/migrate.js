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

const migrate = async () => {
    await linkMessages()
    await fixUserIndexes()
    await fixOtpIndexes()
}

module.exports = migrate
