const getUserDetailsFromToken = require("../helpers/getUserDetailsFromToken");
const UserModel = require("../models/user.model");

const updateUserDetails = async (req, res) => {
  try {
    const token = req.cookies.token || "";

    const user = await getUserDetailsFromToken(token);

    const { name, profile_pic } = req.body;

    const updateUser = await UserModel.updateOne(
      { _id: user._id },
      {
        name,
        profile_pic,
      }
    );

    const userInfomation = await UserModel.findById(user._id);

    return res.json({
      message: "User Update Successfully",
      data: userInfomation,
      success: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || error,
      error: true,
    });
  }
};

module.exports = updateUserDetails;
