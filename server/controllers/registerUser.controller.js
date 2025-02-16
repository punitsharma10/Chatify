const bcryptjs = require('bcryptjs')
const UserModel = require("../models/user.model")


const registerUser = async (req,res) => {
    try {
        const {name, email, password, profile_pic} = req.body
        const checkEmail = await UserModel.findOne({email: email})
        if(checkEmail){
            return res.status(400).json({
                message : "User Already Registered",
                error : true,
            })
        }

        //hash the password
        const salt = await bcryptjs.genSalt(10)
        const hashpassword = await bcryptjs.hash(password,salt)

        const newUser = {
            name,
            email,
            profile_pic,
            password: hashpassword
        }

        const user = new UserModel(newUser)
        const newUserSave = await user.save()
        return res.status(201).json({
            message : "User Created Successfully",
            data : newUserSave,
            success : true
        })
    } catch (error) {
        return res.status(500).json({
            message : error.message || error,
            error : true
        })
    }
}

module.exports = registerUser;