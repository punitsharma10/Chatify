const mongoose = require('mongoose')
const ObjectId = mongoose.Schema.ObjectId

// A user's report of a contact or group (reviewed by the app owner; nothing is sent anywhere).
// Like WhatsApp, the most recent messages of the reported chat are attached for review.
const reportSchema = new mongoose.Schema({
    reporter : { type : ObjectId, ref : 'User', required : true },
    targetUser : { type : ObjectId, ref : 'User' },
    targetGroup : { type : ObjectId, ref : 'Conversation' },
    reason : { type : String, default : '', maxlength : 500 },
    messages : [{ type : ObjectId, ref : 'Message' }]
},{
    timestamps : true
})

module.exports = mongoose.model('Report', reportSchema)
