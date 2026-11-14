const jwt = require('jsonwebtoken')
const UserModel = require('../models/user.model')

const sessionOut = {
    message : "session out",
    logout : true,
}

// Returns the user for a valid token, or { logout : true } for a missing / invalid / expired token
// (previously an invalid token threw and crashed the caller).
const getUserDetailsFromToken = async(token)=>{
    if(!token){
        return sessionOut
    }

    try {
        const decode = jwt.verify(token,process.env.JWT_SECRET_KEY)
        const user = await UserModel.findById(decode.id).select('-password')
        if (!user) return sessionOut
        // a password reset signs out sessions created before it
        if (user.passwordChangedAt && decode.iat * 1000 < user.passwordChangedAt.getTime() - 1000) return sessionOut
        return user
    } catch (error) {
        return sessionOut
    }
}

module.exports = getUserDetailsFromToken;
