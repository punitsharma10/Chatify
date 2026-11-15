const bcryptjs = require("bcryptjs");
const crypto = require("crypto");
const UserModel = require("../models/user.model");
const SessionModel = require("../models/session.model");
const StatusModel = require("../models/status.model");
const { ConversationModel, MessageModel } = require("../models/conversation.model");
const { getConversationItem } = require("../helpers/getConversation");
const { serializeMessage } = require("../helpers/chat");

// "Delete my account" (requires requireAuth). Like WhatsApp: the account and profile are erased, you leave
// all your groups, your status updates are deleted and every device is logged out. Messages other people
// already received stay in their chats, shown as coming from "Deleted account".
const deleteAccount = async (req, res) => {
  try {
    const { password } = req.body || {};
    const user = await UserModel.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "Account not found", error: true });
    if (typeof password !== "string" || !(await bcryptjs.compare(password, user.password))) {
      return res.status(400).json({ message: "Incorrect password", error: true });
    }
    const io = require("../socket/index").io;
    const me = user._id;
    const now = new Date();

    // leave every group (with the usual "left" notice); a group never loses its last admin
    const groups = await ConversationModel.find({ isGroup: true, "members.userId": me }).select("-messages").lean();
    for (const g of groups) {
      const member = g.members.find((m) => String(m.userId) === String(me));
      const notice = await new MessageModel({
        conversationId: g._id, msgByUserId: me,
        system: { action: "leave", actor: { id: String(me), name: user.name } },
      }).save();
      await ConversationModel.updateOne({ _id: g._id }, {
        $pull: { members: { userId: me } },
        $push: { pastMembers: { userId: me, joinedAt: member.joinedAt, leftAt: now, removed: false } },
        $set: { lastMessageAt: notice.createdAt },
      });
      const rest = g.members.filter((m) => String(m.userId) !== String(me));
      if (rest.length && !rest.some((m) => m.role === "admin")) {
        const next = [...rest].sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))[0];
        await ConversationModel.updateOne({ _id: g._id, "members.userId": next.userId }, { $set: { "members.$.role": "admin" } });
      }
      // nobody waits for my blue ticks any more
      await MessageModel.updateMany({ conversationId: g._id, recipients: me }, { $pull: { recipients: me } });
      for (const m of rest) {
        const uid = String(m.userId);
        io.to(uid).emit("message-new", { peerId: String(g._id), message: serializeMessage(notice, uid), isGroup: true });
        getConversationItem(g._id, uid).then((item) => item && io.to(uid).emit("conversation-item", { item })).catch(() => {});
      }
    }

    await StatusModel.deleteMany({ userId: me });

    // Pixify + Connectify: posts, comments, follows, friendships, notifications
    await require("../helpers/socialCleanup")(me);
    // Pixify story archive + highlights; I leave everyone's Close friends list
    await require("./highlights.controller").deleteHighlightsFor(me);

    // erase the profile; the document stays so existing chats still have a sender ("Deleted account")
    await UserModel.updateOne({ _id: me }, {
      $set: {
        name: "Deleted account", profile_pic: "", about: "", contacts: [], blocked: [], mutedStatuses: [],
        password: await bcryptjs.hash(crypto.randomBytes(32).toString("hex"), 10),
        "privacy.lastSeen": "nobody", "privacy.online": "nobody", "privacy.profilePhoto": "nobody", "privacy.about": "nobody",
        deletedAt: now, passwordChangedAt: now,
      },
      $unset: { email: 1, phone: 1, chatLockCode: 1, lastSeen: 1, devices: 1, username: 1, savedPosts: 1, pixify: 1, connectify: 1 },
    });

    const sessions = await SessionModel.find({ userId: me, revokedAt: null }).select("_id").lean();
    await SessionModel.updateMany({ userId: me, revokedAt: null }, { $set: { revokedAt: now } });
    require("../socket/index").disconnectSessions(sessions.map((s) => s._id));
    // tabs logged in with tokens from before sessions existed
    for (const s of await io.in(String(me)).fetchSockets()) { s.emit("session-revoked", { reason: "deleted" }); setTimeout(() => s.disconnect(true), 250); }

    return res.cookie("token", "", { httpOnly: true, secure: true, sameSite: "none" }).json({ success: true, message: "Account deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message || error, error: true });
  }
};

module.exports = deleteAccount;
