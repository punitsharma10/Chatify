const getUserDetailsFromToken = require("../helpers/getUserDetailsFromToken")
const { getToken } = require("../helpers/requireAuth")
const UserModel = require("../models/user.model")

const userDetails = async (req, res)=>{
    try {
        const token = getToken(req)

        const user = await getUserDetailsFromToken(token)
        if (!user || user.logout) {
            return res.status(200).json({ message : "user details", data : user })
        }

        // whether a chat lock secret code is set (the code itself never leaves the server)
        const lock = await UserModel.findById(user._id).select('+chatLockCode').lean()
        return res.status(200).json({
            message : "user details",
            data : { ...user.toObject(), hasChatLock : !!lock?.chatLockCode }
        })
        
    } catch (error) {
        return res.status(500).json({
            message : error.message || error,
            error : true
        })
    }
}

module.exports = userDetails
