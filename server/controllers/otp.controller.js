const crypto = require('crypto')
const bcryptjs = require('bcryptjs')
const EmailOtpModel = require('../models/emailOtp.model')
const UserModel = require('../models/user.model')
const { sendOtpEmail } = require('../helpers/mailer')
const { sendOtpSms } = require('../helpers/sms')
const { escapeRegex } = require('../helpers/chat')

const OTP_TTL_MIN = 10
const RESEND_SECONDS = 60
const MAX_SENDS_PER_HOUR = 5
const MAX_ATTEMPTS = 5

// Email codes are always 6 digits. SMS codes can be shortened with SMS_OTP_LENGTH (2-8) for personal
// learning setups; short codes are easy to guess, so they also get fewer attempts.
const codeLengthFor = (channel) => {
    if (channel !== 'sms') return 6
    const n = Number(process.env.SMS_OTP_LENGTH)
    return Number.isInteger(n) && n >= 2 && n <= 8 ? n : 6
}
const maxAttemptsFor = (length) => (length >= 6 ? MAX_ATTEMPTS : 3)
const TOKEN_TTL_MIN = 15
const PURPOSES = ['register', 'reset']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE_RE = /^\+[1-9]\d{7,14}$/ // E.164

const normEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '')
// "+91 98765-43210" -> "+919876543210"
const normPhone = (phone) => (typeof phone === 'string' ? phone.replace(/[\s\-().]/g, '') : '')
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')
const fail = (res, status, message, extra = {}) => res.status(status).json({ message, error : true, ...extra })

// existing accounts may have been saved with different letter case
const findUserByEmail = (email) =>
    UserModel.findOne({ email : new RegExp(`^${escapeRegex(email)}$`, 'i') })
const findUserByPhone = (phone) => UserModel.findOne({ phone })
const findUser = ({ channel, target }) => (channel === 'sms' ? findUserByPhone(target) : findUserByEmail(target))

// reads { email } or { phone } from a request body -> { channel, target } or an error message
const readIdentifier = (body = {}) => {
    if (body.phone !== undefined && body.phone !== '') {
        const target = normPhone(body.phone)
        if (!PHONE_RE.test(target)) return { error : 'Please enter a valid phone number with country code.' }
        return { channel : 'sms', target }
    }
    const target = normEmail(body.email)
    if (!target || target.length > 254 || !EMAIL_RE.test(target)) return { error : 'Please enter a valid email address.' }
    return { channel : 'email', target }
}

const validate = (req, res) => {
    const purpose = req.body.purpose
    if (!PURPOSES.includes(purpose)) { fail(res, 400, 'Invalid request'); return null }
    const id = readIdentifier(req.body)
    if (id.error) { fail(res, 400, id.error); return null }
    return { ...id, purpose }
}

const label = (channel) => (channel === 'sms' ? 'phone number' : 'email')

// POST /api/otp/send { email | phone, purpose : 'register' | 'reset' }
const sendOtp = async (req, res) => {
    try {
        const input = validate(req, res)
        if (!input) return
        const { channel, target, purpose } = input
        const key = { target, channel, purpose }

        const user = await findUser(input)
        if (purpose === 'register' && user) return fail(res, 400, `An account with this ${label(channel)} already exists. Please log in.`)
        if (purpose === 'reset' && !user) return fail(res, 400, `No account found with this ${label(channel)}.`)

        const now = new Date()
        const doc = await EmailOtpModel.findOne(key)

        if (doc?.lastSentAt) {
            const wait = RESEND_SECONDS - Math.floor((now - doc.lastSentAt) / 1000)
            if (wait > 0) return fail(res, 429, `Please wait ${wait} seconds before requesting a new code.`, { retryIn : wait })
        }
        const windowFresh = doc?.sendWindowStart && now - doc.sendWindowStart < 60 * 60 * 1000
        const sendCount = windowFresh ? doc.sendCount : 0
        if (sendCount >= MAX_SENDS_PER_HOUR) return fail(res, 429, 'Too many codes requested. Please try again in an hour.')

        const length = codeLengthFor(channel)
        const code = crypto.randomInt(0, 10 ** length).toString().padStart(length, '0')
        const otpHash = await bcryptjs.hash(code, 10)

        await EmailOtpModel.updateOne(key, {
            $set : {
                otpHash,
                otpLength : length,
                otpExpiresAt : new Date(now.getTime() + OTP_TTL_MIN * 60 * 1000),
                attempts : 0,
                lastSentAt : now,
                sendCount : sendCount + 1,
                sendWindowStart : windowFresh ? doc.sendWindowStart : now,
                expireAt : new Date(now.getTime() + 60 * 60 * 1000)
            },
            $unset : { tokenHash : '', tokenExpiresAt : '' }
        }, { upsert : true })

        let result
        try {
            result = channel === 'sms'
                ? await sendOtpSms(target, code, purpose, OTP_TTL_MIN)
                : await sendOtpEmail(target, code, purpose, OTP_TTL_MIN)
        } catch (error) {
            console.error(`[${channel}] failed to send code:`, error.message)
            // let the user try again straight away
            await EmailOtpModel.updateOne(key, { $unset : { lastSentAt : '' }, $inc : { sendCount : -1 } })
            return fail(res, 500, error.userMessage || `We couldn't send the code right now. Please check the ${label(channel)} and try again.`)
        }

        return res.json({
            success : true,
            message : `We sent a 6-digit code to ${target}`,
            channel,
            codeLength : length,
            expiresIn : OTP_TTL_MIN * 60,
            resendIn : RESEND_SECONDS,
            devMode : !!result.dev
        })
    } catch (error) {
        return fail(res, 500, error.message || 'Something went wrong')
    }
}

// POST /api/otp/verify { email | phone, purpose, otp } -> { token }
const verifyOtp = async (req, res) => {
    try {
        const input = validate(req, res)
        if (!input) return
        const { channel, target, purpose } = input
        const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : ''

        const doc = await EmailOtpModel.findOne({ target, channel, purpose })
        if (!doc || !doc.otpHash) return fail(res, 400, 'Please request a new code.', { code : 'request_new' })
        if (doc.otpExpiresAt < new Date()) return fail(res, 400, 'This code has expired. Please request a new one.', { code : 'expired' })
        const length = doc.otpLength || 6
        const maxAttempts = maxAttemptsFor(length)
        if (doc.attempts >= maxAttempts) return fail(res, 429, 'Too many wrong attempts. Please request a new code.', { code : 'locked' })
        if (!new RegExp(`^\\d{${length}}$`).test(otp)) return fail(res, 400, `Please enter the ${length}-digit code.`)

        const match = await bcryptjs.compare(otp, doc.otpHash)
        if (!match) {
            const attempts = doc.attempts + 1
            await EmailOtpModel.updateOne({ _id : doc._id }, { $set : { attempts } })
            const left = maxAttempts - attempts
            return left > 0
                ? fail(res, 400, `Incorrect OTP. Please enter the correct OTP. ${left} attempt${left > 1 ? 's' : ''} left.`, { code : 'wrong', attemptsLeft : left })
                : fail(res, 429, 'Too many wrong attempts. Please request a new code.', { code : 'locked', attemptsLeft : 0 })
        }

        // code is single-use: replace it with a short-lived token for the next step
        const token = crypto.randomBytes(32).toString('hex')
        await EmailOtpModel.updateOne({ _id : doc._id }, {
            $set : { tokenHash : sha256(token), tokenExpiresAt : new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000) },
            $unset : { otpHash : '', otpExpiresAt : '' }
        })
        return res.json({ success : true, message : channel === 'sms' ? 'Phone number verified' : 'Email verified', token })
    } catch (error) {
        return fail(res, 500, error.message || 'Something went wrong')
    }
}

// used by register / reset-password: true once, then the token is gone
const consumeVerifiedToken = async ({ channel, target }, purpose, token) => {
    if (typeof token !== 'string' || token.length !== 64) return false
    const doc = await EmailOtpModel.findOne({ target, channel, purpose })
    if (!doc?.tokenHash || !doc.tokenExpiresAt || doc.tokenExpiresAt < new Date()) return false
    const a = Buffer.from(doc.tokenHash, 'hex')
    const b = Buffer.from(sha256(token), 'hex')
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false
    const removed = await EmailOtpModel.deleteOne({ _id : doc._id, tokenHash : doc.tokenHash })
    return removed.deletedCount === 1
}

const checkPasswords = (password, confirmPassword) => {
    if (typeof password !== 'string' || password.length < 6) return 'Password must be at least 6 characters.'
    if (password.length > 128) return 'Password is too long.'
    if (password !== confirmPassword) return "Passwords don't match."
    return null
}

module.exports = {
    sendOtp, verifyOtp, consumeVerifiedToken, checkPasswords,
    findUser, findUserByEmail, findUserByPhone, readIdentifier, normEmail, normPhone, label
}
