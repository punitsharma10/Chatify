const UserModel = require('../models/user.model')
const { escapeRegex, publicUser } = require('../helpers/chat')

// requires requireAuth middleware (req.user)
const searchUser = async (req,res)=>{
    try {
        const search = typeof req.body.search === 'string' ? req.body.search.trim().slice(0, 100) : ""

        // user input is escaped so it can't be used as a (slow / malicious) regular expression
        const query = new RegExp(escapeRegex(search),"i")

        // "+91 98765-43210" -> "+919876543210", so numbers typed with spaces/dashes still match
        const digits = search.replace(/[\s\-().]/g, "")

        const users = await UserModel.find({
            "$or" : [
                { name : query },
                { email : query },
                ...(digits.replace("+", "").length >= 3 ? [{ phone : new RegExp(escapeRegex(digits)) }] : [])
            ]
        }).select("-password").limit(30).lean()

        return res.json({
            message : 'all user',
            data : users.map((u) => publicUser(u, req.user)),
            success : true
        })
    } catch (error) {
        return res.status(500).json({
            message : error.message || error,
            error : true
        })
    }
}

module.exports = searchUser
