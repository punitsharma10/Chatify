const { PostModel, CommentModel, FollowModel, FriendshipModel, NotificationModel } = require('../models/social.model')

// Removes someone's Pixify and Connectify data when their account is deleted.
module.exports = async (userId) => {
    const posts = (await PostModel.find({ author : userId }).select('_id').lean()).map((p) => p._id)
    // comments they wrote: lower the comment counts on the posts they were on
    const comments = await CommentModel.find({ author : userId }).select('post').lean()
    const perPost = {}
    for (const c of comments) perPost[String(c.post)] = (perPost[String(c.post)] || 0) + 1
    for (const [post, n] of Object.entries(perPost)) await PostModel.updateOne({ _id : post }, { $inc : { commentCount : -n } })
    await Promise.all([
        PostModel.deleteMany({ author : userId }),
        CommentModel.deleteMany({ $or : [{ author : userId }, { post : { $in : posts } }] }),
        PostModel.updateMany({ 'reactions.userId' : userId }, { $pull : { reactions : { userId } } }),
        FollowModel.deleteMany({ $or : [{ follower : userId }, { following : userId }] }),
        FriendshipModel.deleteMany({ $or : [{ from : userId }, { to : userId }] }),
        NotificationModel.deleteMany({ $or : [{ user : userId }, { actor : userId }, { post : { $in : posts } }] })
    ])
    // Connectify groups / events / marketplace / pokes
    const { CxGroupModel, CxEventModel, ListingModel } = require('../models/cxGroup.model')
    const { PokeModel } = require('../models/social.model')
    await Promise.all([
        ListingModel.deleteMany({ seller : userId }),
        ListingModel.updateMany({ savedBy : userId }, { $pull : { savedBy : userId } }),
        CxEventModel.deleteMany({ host : userId }),
        CxEventModel.updateMany({}, { $pull : { going : userId, interested : userId, invited : userId } }),
        PokeModel.deleteMany({ $or : [{ from : userId }, { to : userId }] }),
        CxGroupModel.updateMany({ 'requests.userId' : userId }, { $pull : { requests : { userId } } })
    ])
    for (const g of await CxGroupModel.find({ 'members.userId' : userId }).lean()) {
        const rest = g.members.filter((m) => String(m.userId) !== String(userId))
        if (!rest.length) { await CxGroupModel.deleteOne({ _id : g._id }); await PostModel.deleteMany({ group : g._id }); continue }
        if (!rest.some((m) => m.role === 'admin')) rest[0].role = 'admin'
        await CxGroupModel.updateOne({ _id : g._id }, { $set : { members : rest } })
    }
    // Pixify Direct: their one-to-one threads go; they leave groups (an empty group is removed)
    const { DmThreadModel, DmMessageModel } = require('../models/dm.model')
    const pairs = (await DmThreadModel.find({ isGroup : false, 'members.userId' : userId }).select('_id').lean()).map((t) => t._id)
    await Promise.all([DmThreadModel.deleteMany({ _id : { $in : pairs } }), DmMessageModel.deleteMany({ $or : [{ thread : { $in : pairs } }, { from : userId }] })])
    for (const g of await DmThreadModel.find({ isGroup : true, 'members.userId' : userId }).lean()) {
        const rest = g.members.filter((m) => String(m.userId) !== String(userId))
        if (!rest.length) { await DmThreadModel.deleteOne({ _id : g._id }); await DmMessageModel.deleteMany({ thread : g._id }); continue }
        if (!rest.some((m) => m.role === 'admin')) rest[0].role = 'admin'
        await DmThreadModel.updateOne({ _id : g._id }, { $set : { members : rest } })
    }
}
