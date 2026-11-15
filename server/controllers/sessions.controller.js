const SessionModel = require("../models/session.model");
const UserModel = require("../models/user.model");
const { describeAgent } = require("../helpers/sessions");

// "Linked devices": every browser signed in to this account (requires requireAuth)
const listSessions = async (req, res) => {
  try {
    const current = req.user.$locals.sid;
    const sessions = await SessionModel.find({ userId: req.user._id, revokedAt: null, expiresAt: { $gt: new Date() } })
      .sort({ lastActiveAt: -1 }).limit(50).lean();
    return res.json({
      success: true,
      data: sessions.map((s) => ({
        _id: s._id,
        device: describeAgent(s.userAgent),
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        current: String(s._id) === String(current),
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || error, error: true });
  }
};

// log out one device ({ id }) or every other device ({ others: true })
const revokeSessions = async (req, res) => {
  try {
    const current = req.user.$locals.sid;
    const { id, others } = req.body || {};
    const filter = { userId: req.user._id, revokedAt: null };
    if (others) {
      if (current) filter._id = { $ne: current };
    } else if (typeof id === "string" && /^[a-f0-9]{24}$/.test(id)) {
      filter._id = id;
    } else {
      return res.status(400).json({ message: "Choose a device to log out", error: true });
    }
    const ids = (await SessionModel.find(filter).select("_id").lean()).map((s) => String(s._id));
    await SessionModel.updateMany({ _id: { $in: ids } }, { $set: { revokedAt: new Date() } });
    // those browsers stop receiving end-to-end encrypted messages
    await UserModel.updateOne({ _id: req.user._id }, { $set: { 'devices.$[d].removedAt': new Date() } },
      { arrayFilters: [{ 'd.sid': { $in: ids.map(String) }, 'd.removedAt': null }] }).catch(() => {});
    require("../socket/index").disconnectSessions(ids);
    return res.json({ success: true, loggedOut: ids.length });
  } catch (error) {
    return res.status(500).json({ message: error.message || error, error: true });
  }
};

module.exports = { listSessions, revokeSessions };
