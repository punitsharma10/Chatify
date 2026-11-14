const mongoose = require('mongoose')

// One-time codes for verifying an email address or phone number (registration) and for password reset.
// Only hashes are stored; documents are removed automatically by MongoDB after `expireAt`.
const emailOtpSchema = new mongoose.Schema({
    // normalised email address (lowercase) or phone number in E.164 format (+919876543210)
    target : { type : String, required : true, trim : true },
    channel : { type : String, enum : ['email', 'sms'], required : true },
    purpose : { type : String, enum : ['register', 'reset'], required : true },

    otpHash : { type : String },
    otpLength : { type : Number, default : 6 },
    otpExpiresAt : { type : Date },
    attempts : { type : Number, default : 0 },

    // resend limits
    lastSentAt : { type : Date },
    sendCount : { type : Number, default : 0 },
    sendWindowStart : { type : Date },

    // issued after the correct code is entered; required to finish registration / reset
    tokenHash : { type : String },
    tokenExpiresAt : { type : Date },

    expireAt : { type : Date, required : true }
},{
    timestamps : true
})

emailOtpSchema.index({ target : 1, channel : 1, purpose : 1 }, { unique : true })
emailOtpSchema.index({ expireAt : 1 }, { expireAfterSeconds : 0 })

const EmailOtpModel = mongoose.model('EmailOtp', emailOtpSchema)

module.exports = EmailOtpModel
