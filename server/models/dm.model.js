const mongoose = require('mongoose')
const ObjectId = mongoose.Schema.ObjectId

// Messages inside Pixify (Instagram-style Direct) and Connectify (Facebook-style Messenger). Each app has its own inbox,
// separate from each other and from Chatify: `app` says which one a conversation belongs to (missing = Pixify).

// one person in a thread, with their own view of it
const memberSchema = new mongoose.Schema({
    userId : { type : ObjectId, ref : 'User', required : true },
    role : { type : String, enum : ['admin', 'member'], default : 'member' },
    // 'request' = shown under Requests until accepted (the sender isn't someone they follow)
    status : { type : String, enum : ['inbox', 'request'], default : 'inbox' },
    joinedAt : { type : Date, default : Date.now },
    lastReadAt : { type : Date },
    muted : { type : Boolean, default : false },
    // "Delete chat": hidden until a newer message arrives, and older messages stay hidden for them
    clearedAt : { type : Date }
}, { _id : false })

const threadSchema = new mongoose.Schema({
    app : { type : String, enum : ['pixify', 'connectify'], default : 'pixify' },
    isGroup : { type : Boolean, default : false },
    // one-to-one threads: the two ids sorted and joined, so each pair has one thread
    pairKey : { type : String },
    name : { type : String, trim : true, maxlength : 100, default : '' },
    avatar : { type : String, default : '' },
    createdBy : { type : ObjectId, ref : 'User' },
    members : { type : [memberSchema], default : [] },
    lastMessageAt : { type : Date },
    lastMessage : {
        _id : ObjectId,
        from : ObjectId,
        kind : String,
        preview : String
    }
}, { timestamps : true })

threadSchema.index({ pairKey : 1 }, { unique : true, partialFilterExpression : { pairKey : { $type : 'string' } } })
threadSchema.index({ 'members.userId' : 1, lastMessageAt : -1 })
threadSchema.index({ app : 1, 'members.userId' : 1, lastMessageAt : -1 })

const KINDS = ['text', 'media', 'voice', 'post', 'profile', 'system']

const messageSchema = new mongoose.Schema({
    thread : { type : ObjectId, ref : 'DmThread', required : true },
    from : { type : ObjectId, ref : 'User', required : true },
    // id made by the sending tab; a retry with the same id isn't sent twice
    clientId : { type : String },
    kind : { type : String, enum : KINDS, required : true },
    text : { type : String, default : '', maxlength : 4000 },
    media : { type : [{ url : String, kind : { type : String, enum : ['image', 'video'] }, width : Number, height : Number, _id : false }], default : undefined },
    audio : { url : String, duration : Number, waveform : { type : [Number], default : undefined } },
    post : { type : ObjectId, ref : 'Post' },      // a shared post or reel
    profile : { type : ObjectId, ref : 'User' },   // a shared profile
    replyTo : { type : ObjectId, ref : 'DmMessage' },
    reactions : { type : [{ userId : ObjectId, emoji : String, _id : false }], default : [] },
    editedAt : { type : Date },
    // grey line in the thread: "Asha named the group Trip", "Asha added Bilal"
    system : { action : String, actor : ObjectId, targets : { type : [ObjectId], default : undefined }, value : String }
}, { timestamps : true })

messageSchema.index({ thread : 1, createdAt : -1 })
messageSchema.index({ from : 1, clientId : 1 }, { unique : true, partialFilterExpression : { clientId : { $type : 'string' } } })

module.exports = {
    DM_KINDS : KINDS,
    DmThreadModel : mongoose.model('DmThread', threadSchema),
    DmMessageModel : mongoose.model('DmMessage', messageSchema)
}
