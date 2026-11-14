const UserModel = require("../models/user.model");
const { escapeRegex } = require("../helpers/chat");

const PUBLIC_FIELDS = "-password -blocked -privacy -passwordChangedAt";

// Login step 1: find the account by email ({ email }) or phone number ({ phone }, E.164).
const checkEmail = async (req, res) => {
  try {
    const { email, phone } = req.body;
    let user = null;

    if (phone) {
      const normalized = String(phone).replace(/[\s\-().]/g, "");
      user = await UserModel.findOne({ phone: normalized }).select(PUBLIC_FIELDS);
      if (!user) {
        return res.status(400).json({ message: "No account found with this phone number.", error: true });
      }
    } else {
      // case-insensitive so "Name@Gmail.com" and "name@gmail.com" find the same account
      user = await UserModel.findOne({
        email: new RegExp("^" + escapeRegex(String(email || "").trim()) + "$", "i"),
      }).select(PUBLIC_FIELDS);
      if (!user) {
        return res.status(400).json({ message: "user not exit", error: true });
      }
    }

    return res.status(200).json({
      message: "email verify",
      success: true,
      data: user,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || error,
      error: true,
    });
  }
};

module.exports = checkEmail;
