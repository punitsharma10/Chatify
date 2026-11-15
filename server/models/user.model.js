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
    // one public @username for the whole account (Chats search, Pixify, Connectify); lowercase, see helpers/username.js
    username : {
        type : String,
        trim : true,
        lowercase : true
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
        groups : { type : String, enum : ['everyone', 'contacts'], default : 'everyone' },
        // who sees my status updates: my contacts / my contacts except... / only share with...
        status : { type : String, enum : ['contacts', 'except', 'only'], default : 'contacts' },
        statusExcept : [{ type : mongoose.Schema.ObjectId, ref : 'User' }],
        statusOnly : [{ type : mongoose.Schema.ObjectId, ref : 'User' }],
        // generate previews for links I send
        linkPreviews : { type : Boolean, default : true }
    },
    // set when the account was deleted (the profile is erased; chats keep a "Deleted account" sender)
    deletedAt : { type : Date },
    // people whose status updates I muted
    mutedStatuses : [{ type : mongoose.Schema.ObjectId, ref : 'User' }],
    // chat lock: hashed secret code that opens "Locked chats"
    chatLockCode : { type : String, select : false },
    // end-to-end encryption: one entry per browser/device. Only PUBLIC keys are stored here; private keys never
    // leave the device. Removed devices are kept (removedAt) so old messages they signed can still be verified.
    devices : {
        type : [{
            id : { type : String, required : true },           // random id created on the device
            ecdh : { type : String, required : true },         // P-256 ECDH public key (raw, base64)
            sign : { type : String, required : true },         // P-256 ECDSA public key (raw, base64)
            name : { type : String, default : '' },            // "Chrome · Windows"
            sid : { type : String, default : '' },             // session that registered it (remote log out removes it)
            createdAt : { type : Date },
            lastSeen : { type : Date },
            removedAt : { type : Date },
            _id : false
        }],
        default : undefined
    },
    contacts : [contactSchema],
    // Pixify profile: private account = only approved followers see posts and stories
    pixify : {
        private : { type : Boolean, default : false },
        bio : { type : String, default : '', maxlength : 150 },
        website : { type : String, default : '', maxlength : 200 },
        pronouns : { type : String, default : '', maxlength : 30 },
        // accounts whose posts / stories I don't want in my feed (they aren't told)
        muted : { type : [{ type : mongoose.Schema.ObjectId, ref : 'User' }], default : undefined },
        // "Favorites": their posts first, and a Favorites-only feed
        favorites : { type : [{ type : mongoose.Schema.ObjectId, ref : 'User' }], default : undefined },
        // "Not interested" on Explore
        notInterested : { type : [{ type : mongoose.Schema.ObjectId, ref : 'Post' }], default : undefined },
        // "Hidden words": comments on my posts containing these are hidden from everyone but their writer
        hiddenWords : { type : [String], default : undefined },
        // Direct "Note": a short line shown above the inbox for 24 hours
        note : { text : { type : String, maxlength : 60 }, at : Date },
        // "Close friends": followers who see my close-friends-only stories (green ring), up to 500
        closeFriends : { type : [{ type : mongoose.Schema.ObjectId, ref : 'User' }], default : undefined }
    },
    // Connectify profile
    connectify : {
        bio : { type : String, default : '', maxlength : 101 },
        cover_pic : { type : String, default : '' },
        city : { type : String, default : '', maxlength : 60 },
        work : { type : String, default : '', maxlength : 80 },
        education : { type : String, default : '', maxlength : 80 },
        hometown : { type : String, default : '', maxlength : 60 },
        relationship : { type : String, default : '' },
        website : { type : String, default : '', maxlength : 200 },
        // birthday month/day (year optional, never shown)
        birthday : { month : Number, day : Number, year : Number },
        // posts I hid from my feed, friends I unfollowed (still friends), people snoozed until a date
        hiddenPosts : { type : [{ type : mongoose.Schema.ObjectId, ref : 'Post' }], default : undefined },
        unfollowed : { type : [{ type : mongoose.Schema.ObjectId, ref : 'User' }], default : undefined },
        snoozed : { type : [{ userId : mongoose.Schema.ObjectId, until : Date, _id : false }], default : undefined },
        // saved Connectify posts (newest last)
        saved : { type : [{ type : mongoose.Schema.ObjectId, ref : 'Post' }], default : undefined }
    },
    // Pixify posts I bookmarked (newest last)
    savedPosts : { type : [{ type : mongoose.Schema.ObjectId, ref : 'Post' }], default : undefined },
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
userSchema.index({ username : 1 }, { unique : true, partialFilterExpression : { username : { $type : 'string' } } })

const UserModel = mongoose.model('User',userSchema)

module.exports = UserModel
