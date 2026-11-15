const mongoose = require('mongoose')
const ObjectId = mongoose.Schema.ObjectId

// A status update (text, photo or video) that disappears after 24 hours, like WhatsApp Status.
const statusSchema = new mongoose.Schema({
    userId : { type : ObjectId, ref : 'User', required : true },
    kind : { type : String, enum : ['text', 'image', 'video'], required : true },
    text : { type : String, default : '', maxlength : 700 },       // text status
    background : { type : String, default : '' },                 // text status colour
    font : { type : Number, default : 0 },                         // text status font style
    mediaUrl : { type : String, default : '' },                    // photo / video status
    caption : { type : String, default : '', maxlength : 700 },
    // end-to-end encrypted text / caption / media (see helpers/e2ee.js); the plain fields above stay empty
    e2ee : { type : mongoose.Schema.Types.Mixed },
    // who may see it, resolved from the owner's status privacy when it was posted (like WhatsApp,
    // a privacy change only affects updates posted afterwards)
    audience : [{ type : ObjectId, ref : 'User' }],
    // which apps show it: 'chats' (Status), 'pixify' and/or 'connectify' (stories). One record, shown in each app.
    // Missing on updates posted before Pixify/Connectify existed, which means Chats only.
    apps : { type : [{ type : String, enum : ['chats', 'pixify', 'connectify'] }], default : undefined },
    // who sees it in Pixify (my followers) / Connectify (my friends), resolved when posted like `audience`.
    // shareAudience = everyone in either list. These stories are never end-to-end encrypted.
    appAudience : {
        pixify : { type : [{ type : ObjectId, ref : 'User' }], default : undefined },
        connectify : { type : [{ type : ObjectId, ref : 'User' }], default : undefined }
    },
    shareAudience : { type : [{ type : ObjectId, ref : 'User' }], default : undefined },
    // Pixify "Close friends" story: in Pixify only the owner's close friends (checked when listed / viewed) see it
    closeFriends : { type : Boolean, default : undefined },
    // hidden = the viewer has read receipts off: counts as seen for them, but isn't shown to the owner
    viewers : [{ userId : { type : ObjectId, ref : 'User' }, at : Date, hidden : Boolean, _id : false }],
    expiresAt : { type : Date, required : true }
},{
    timestamps : true
})

statusSchema.index({ expiresAt : 1 }, { expireAfterSeconds : 0 })
statusSchema.index({ userId : 1, createdAt : -1 })
statusSchema.index({ audience : 1, expiresAt : 1 })
// (MongoDB can't index two arrays together, so `apps` is filtered after this index)
statusSchema.index({ shareAudience : 1, expiresAt : 1 })
statusSchema.index({ 'appAudience.pixify' : 1, expiresAt : 1 })
statusSchema.index({ 'appAudience.connectify' : 1, expiresAt : 1 })

module.exports = mongoose.model('Status', statusSchema)
