const mongoose = require('mongoose')

// One signed-in browser / device ("Linked devices"). The login token carries the session id,
// so a session can be logged out remotely: its token stops working and its sockets are disconnected.
const sessionSchema = new mongoose.Schema({
    userId : { type : mongoose.Schema.ObjectId, ref : 'User', required : true, index : true },
    userAgent : { type : String, default : '', maxlength : 400 },
    ip : { type : String, default : '' },
    lastActiveAt : { type : Date, default : Date.now },
    revokedAt : { type : Date },
    // same as the token lifetime; MongoDB removes old sessions automatically
    expiresAt : { type : Date, required : true }
},{
    timestamps : true
})

sessionSchema.index({ expiresAt : 1 }, { expireAfterSeconds : 0 })

module.exports = mongoose.model('Session', sessionSchema)
