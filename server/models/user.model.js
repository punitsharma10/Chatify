const mongoose = require('mongoose');

const visibility = {
    type : String,
    enum : ['everyone', 'contacts', 'nobody'],
    default : 'everyone'
}

// someone this user saved, optionally under their own name for them (like a phone's address book)
const contactSchema = new mongoose.Schema({
    userId : { type : mongoose.Schema.ObjectId, ref : 'User', required : true },
    name : { type : String, trim : true, maxlength : 50, default : '' },
    addedAt : { type : Date, default : Date.now }
},{ _id : false })

const userSchema = new mongoose.Schema({
    name : {
        type : String,
        required : true
    },
    // an account has an email, a phone number, or both (unique when present; see indexes below)
    email : {
        type : String,
        trim : true
    },
    // E.164 format, e.g. +919876543210
    phone : {
        type : String,
        trim : true
    },
    password : {
        type : String,
        required : true,
    },
    profile_pic : {
        type : String,
        default : ""
    },
    about : {
        type : String,
        default : "Hey there! I am using Chatify.",
        maxlength : 140
    },
    lastSeen : {
        type : Date
    },
    // set on password reset; tokens issued before this are no longer accepted
    passwordChangedAt : {
        type : Date
    },
    privacy : {
        lastSeen : visibility,
        online : visibility,
        profilePhoto : visibility,
        about : visibility,
        readReceipts : { type : Boolean, default : true },
        // who can add this user to groups
        groups : { type : String, enum : ['everyone', 'contacts'], default : 'everyone' }
    },
    contacts : [contactSchema],
    // existing accounts get the people they already chat with as contacts once (see helpers/migrate.js)
    contactsMigrated : { type : Boolean, default : true },
    // users this user has blocked
    blocked : [
        {
            type : mongoose.Schema.ObjectId,
            ref : 'User'
        }
    ]
},{
    timestamps : true
})

// unique only when the field exists, so phone-only and email-only accounts can coexist
userSchema.index({ email : 1 }, { unique : true, partialFilterExpression : { email : { $type : 'string' } } })
userSchema.index({ phone : 1 }, { unique : true, partialFilterExpression : { phone : { $type : 'string' } } })

const UserModel = mongoose.model('User',userSchema)

module.exports = UserModel
