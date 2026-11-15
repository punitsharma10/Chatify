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
}
