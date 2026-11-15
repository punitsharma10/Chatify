const UserModel = require("../models/user.model");
const { isAllowedMediaUrl } = require("../helpers/chat");

const VISIBILITY = ['everyone', 'contacts', 'nobody'];

// requires requireAuth middleware (req.user)
const updateUserDetails = async (req, res) => {
  try {
    const { name, profile_pic, about, privacy } = req.body;
    const update = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 50) {
        return res.status(400).json({ message: "Name must be 1-50 characters", error: true });
      }
      update.name = name.trim();
    }

    if (profile_pic !== undefined) {
      // existing http:// cloudinary URLs are kept as-is; new ones must be https cloudinary URLs
      if (profile_pic !== req.user.profile_pic && !isAllowedMediaUrl(profile_pic)) {
        return res.status(400).json({ message: "Invalid profile photo", error: true });
      }
      update.profile_pic = profile_pic || "";
    }

    if (about !== undefined) {
      if (typeof about !== 'string' || about.length > 140) {
        return res.status(400).json({ message: "About must be at most 140 characters", error: true });
      }
      update.about = about.trim();
    }

    if (privacy && typeof privacy === 'object') {
      for (const key of ['lastSeen', 'online', 'profilePhoto', 'about']) {
        if (privacy[key] !== undefined) {
          if (!VISIBILITY.includes(privacy[key])) {
            return res.status(400).json({ message: "Invalid privacy setting", error: true });
          }
          update[`privacy.${key}`] = privacy[key];
        }
      }
      if (privacy.groups !== undefined) {
        if (!['everyone', 'contacts'].includes(privacy.groups)) {
          return res.status(400).json({ message: "Invalid privacy setting", error: true });
        }
        update['privacy.groups'] = privacy.groups;
      }
      if (privacy.readReceipts !== undefined) {
        update['privacy.readReceipts'] = !!privacy.readReceipts;
      }
      if (privacy.linkPreviews !== undefined) {
        update['privacy.linkPreviews'] = !!privacy.linkPreviews;
      }
      // status privacy: my contacts / my contacts except... / only share with...
      if (privacy.status !== undefined) {
        if (!['contacts', 'except', 'only'].includes(privacy.status)) {
          return res.status(400).json({ message: "Invalid privacy setting", error: true });
        }
        update['privacy.status'] = privacy.status;
      }
      for (const key of ['statusExcept', 'statusOnly']) {
        if (privacy[key] !== undefined) {
          const list = Array.isArray(privacy[key]) ? [...new Set(privacy[key].map(String))] : null;
          if (!list || list.length > 1000 || !list.every((id) => /^[a-f0-9]{24}$/.test(id))) {
            return res.status(400).json({ message: "Invalid privacy setting", error: true });
          }
          update[`privacy.${key}`] = list;
        }
      }
    }

    const userInfomation = await UserModel.findByIdAndUpdate(
      req.user._id,
      { $set: update },
      { new: true }
    ).select('-password');

    // privacy affects who sees this user online
    const presence = require('../socket/presence');
    presence.update(userInfomation);
    require('../socket/index').broadcastOnline();

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
