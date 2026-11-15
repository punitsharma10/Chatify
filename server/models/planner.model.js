const mongoose = require('mongoose')
const ObjectId = mongoose.Schema.ObjectId

// A message written now and sent later (Telegram-style "Schedule message").
const scheduledSchema = new mongoose.Schema({
    userId : { type : ObjectId, ref : 'User', required : true, index : true },
    receiver : { type : String, required : true },          // person id or group id (same as send-message)
    text : { type : String, default : '', maxlength : 4096 },
    // end-to-end encrypted message prepared on the device (sent as-is when due)
    e2ee : { type : mongoose.Schema.Types.Mixed },
    e2eeKind : { type : String },
    mentions : { type : [String], default : undefined },
    silent : { type : Boolean, default : false },
    sendAt : { type : Date, required : true },
    status : { type : String, enum : ['pending', 'sent', 'failed'], default : 'pending' },
    error : { type : String, default : '' },
    messageId : { type : ObjectId, ref : 'Message' }
},{ timestamps : true })
scheduledSchema.index({ status : 1, sendAt : 1 })

// "Remind me about this message" (Slack-style): a private nudge about a message at a chosen time.
const reminderSchema = new mongoose.Schema({
    userId : { type : ObjectId, ref : 'User', required : true, index : true },
    messageId : { type : ObjectId, ref : 'Message', required : true },
    chatId : { type : String, required : true },             // where the message is (person id or group id)
    preview : { type : String, default : '', maxlength : 300 },
    // encrypted preview (only my own devices can read it)
    e2ee : { type : mongoose.Schema.Types.Mixed },
    messageAt : { type : Date },                             // when the message was sent (to jump to it)
    remindAt : { type : Date, required : true },
    firedAt : { type : Date },
    done : { type : Boolean, default : false }
},{ timestamps : true })
reminderSchema.index({ firedAt : 1, remindAt : 1 })

module.exports = {
    ScheduledModel : mongoose.model('ScheduledMessage', scheduledSchema),
    ReminderModel : mongoose.model('Reminder', reminderSchema)
}
