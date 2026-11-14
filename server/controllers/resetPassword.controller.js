const bcryptjs = require('bcryptjs')
const UserModel = require('../models/user.model')
const { consumeVerifiedToken, checkPasswords, findUser, readIdentifier, label } = require('./otp.controller')

// POST /api/reset-password { email | phone, password, confirmPassword, verifyToken }
// verifyToken comes from /api/otp/verify with purpose "reset".
const resetPassword = async (req, res) => {
    try {
        const { password, confirmPassword, verifyToken } = req.body

        const id = readIdentifier(req.body)
        if (id.error) return res.status(400).json({ message : id.error, error : true })

        const passwordError = checkPasswords(password, confirmPassword)
        if (passwordError) return res.status(400).json({ message : passwordError, error : true })

        const user = await findUser(id)
        if (!user) return res.status(400).json({ message : `No account found with this ${label(id.channel)}.`, error : true })

        const verified = await consumeVerifiedToken(id, 'reset', verifyToken)
        if (!verified) {
            return res.status(400).json({ message : `Please verify your ${label(id.channel)} with the code we sent you.`, error : true, code : 'not_verified' })
        }

        const hash = await bcryptjs.hash(password, await bcryptjs.genSalt(10))
        // passwordChangedAt signs out every session that logged in with the old password
        await UserModel.updateOne({ _id : user._id }, { $set : { password : hash, passwordChangedAt : new Date() } })

        return res.json({ success : true, message : 'Password updated. You can now log in with your new password.' })
    } catch (error) {
        return res.status(500).json({ message : error.message || error, error : true })
    }
}

module.exports = resetPassword
