const bcryptjs = require('bcryptjs')
const UserModel = require("../models/user.model")
const { consumeVerifiedToken, checkPasswords, findUser, readIdentifier, label } = require('./otp.controller')
const { isAllowedMediaUrl } = require('../helpers/chat')

// Final registration step. Requires the token returned by /api/otp/verify (purpose "register"),
// so an account can only be created for an email / phone number the person actually controls.
// Body: { name, email | phone, password, confirmPassword, profile_pic?, verifyToken }
const registerUser = async (req,res) => {
    try {
        const { name, password, confirmPassword, profile_pic, verifyToken } = req.body

        const id = readIdentifier(req.body)
        if(id.error){
            return res.status(400).json({ message : id.error, error : true })
        }
        if(typeof name !== 'string' || !name.trim() || name.trim().length > 50){
            return res.status(400).json({ message : "Please enter your name (up to 50 characters).", error : true })
        }
        const passwordError = checkPasswords(password, confirmPassword)
        if(passwordError){
            return res.status(400).json({ message : passwordError, error : true })
        }
        if(profile_pic && !isAllowedMediaUrl(profile_pic)){
            return res.status(400).json({ message : "Invalid profile photo", error : true })
        }

        const existing = await findUser(id)
        if(existing){
            return res.status(400).json({
                message : `An account with this ${label(id.channel)} already exists. Please log in.`,
                error : true,
            })
        }

        const verified = await consumeVerifiedToken(id, 'register', verifyToken)
        if(!verified){
            return res.status(400).json({
                message : `Please verify your ${label(id.channel)} with the code we sent you.`,
                error : true,
                code : 'not_verified'
            })
        }

        //hash the password
        const salt = await bcryptjs.genSalt(10)
        const hashpassword = await bcryptjs.hash(password,salt)

        const user = new UserModel({
            name : name.trim(),
            [id.channel === 'sms' ? 'phone' : 'email'] : id.target,
            profile_pic : profile_pic || "",
            password: hashpassword
        })
        const newUserSave = await user.save()
        const data = newUserSave.toObject()
        delete data.password  // never send the password hash back

        return res.status(201).json({
            message : "User Created Successfully",
            data,
            success : true
        })
    } catch (error) {
        if(error?.code === 11000){
            return res.status(400).json({ message : "An account with these details already exists. Please log in.", error : true })
        }
        return res.status(500).json({
            message : error.message || error,
            error : true
        })
    }
}

module.exports = registerUser;
