const UserModel = require("../models/user.model");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");

const mongoose = require("mongoose");
const { createSession, TOKEN_DAYS } = require("../helpers/sessions");

const checkPassword = async (req, res) => {
  try {
    const { password, userId } = req.body;
    if (!password || typeof userId !== "string" || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        message: "Please enter your password",
        error: true,
      });
    }
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(400).json({
        message: "user not exit",
        error: true,
      });
    }
    const verifyPassword = await bcryptjs.compare(password, user.password);

    if (!verifyPassword) {
      return res.status(400).json({
        message: "wrong password",
        error: true,
      });
    }

    // each login is a session ("Linked devices") that can be logged out from another device
    const session = await createSession(user._id, req);
    const tokenData = {
      id: user._id,
      email: user.email,
      sid: String(session._id),
    };
    const token = await jwt.sign(tokenData, process.env.JWT_SECRET_KEY, {
      expiresIn: `${TOKEN_DAYS}d`,
    });

    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: TOKEN_DAYS * 24 * 60 * 60 * 1000,
    };

    return res.cookie("token", token, cookieOptions).status(200).json({
      message: "Login Successfully",
      token: token,
      success: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || error,
      error: true,
    });
  }
};

module.exports = checkPassword;
