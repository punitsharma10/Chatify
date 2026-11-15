const jwt = require("jsonwebtoken");
const SessionModel = require("../models/session.model");
const { getToken } = require("../helpers/requireAuth");

const logout = async (req, res) => {
  try {
    // end this device's session so the token can't be reused
    try {
      const decode = jwt.verify(getToken(req), process.env.JWT_SECRET_KEY);
      if (decode.sid) {
        await SessionModel.updateOne({ _id: decode.sid, revokedAt: null }, { $set: { revokedAt: new Date() } });
        require("../socket/index").disconnectSessions([decode.sid]);
      }
    } catch { /* no or invalid token: nothing to end */ }

    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    };

    return res.cookie("token", "", cookieOptions).status(200).json({
      message: "session out",
      success: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || error,
      error: true,
    });
  }
};

module.exports = logout;
