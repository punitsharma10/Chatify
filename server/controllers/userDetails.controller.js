const getUserDetailsFromToken = require("../helpers/getUserDetailsFromToken")
const { getToken } = require("../helpers/requireAuth")

const userDetails = async (req, res)=>{
    try {
        const token = getToken(req)

        const user = await getUserDetailsFromToken(token)

        return res.status(200).json({
            message : "user details",
            data : user
        })
        
    } catch (error) {
        return res.status(500).json({
            message : error.message || error,
            error : true
        })
    }
}

module.exports = userDetails