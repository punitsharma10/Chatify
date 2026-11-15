const mongoose = require('mongoose')
const ObjectId = mongoose.Schema.ObjectId

// Pixify (Instagram-style) and Connectify (Facebook-style) data. Chats keeps its own models.

const REACTIONS = ['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'] // Pixify only uses 'like' (the heart)

const mediaSchema = new mongoose.Schema({
    url : { type : String, required : true },
    kind : { type : String, enum : ['image', 'video'], required : true },
    width : Number,
    height : Number,
    // YouTube Short: video id (plays in YouTube's player) and its preview image
    youtube : String,
    poster : String,
    // alt text (describes the photo for screen readers)
    alt : { type : String, maxlength : 200 }
}, { _id : false })

// A post in one app. Pixify: photos / videos + caption (visibility follows the account: public, or followers if
// private). Connectify: text and / or photos, with its own audience (public / friends / only me), can share a post.
const postSchema = new mongoose.Schema({
    app : { type : String, enum : ['pixify', 'connectify'], required : true },
    // every post has an author, except a YouTube Short shown in Reels (see `external`)
    author : { type : ObjectId, ref : 'User', required : function () { return !this.external?.key } },
    text : { type : String, default : '', maxlength : 5000 },
    // a YouTube Short in Pixify Reels / Explore: stored so people can like, comment, save and share it here
    external : {
        source : String,   // 'YouTube'
        key : String,      // 'yt-<videoId>'
        by : String,       // channel name
        byUrl : String,
        link : String      // the Short on YouTube
    },
    media : { type : [mediaSchema], default : [] },
    // Connectify only; Pixify posts are 'public' and checked against the author's private-account setting
    audience : { type : String, enum : ['public', 'friends', 'only_me', 'specific', 'except'], default : 'public' },
    // Connectify custom audience: 'specific' = only these friends, 'except' = friends except these
    audienceList : { type : [{ type : ObjectId, ref : 'User' }], default : undefined },
    // Pixify collab post: invited co-authors; accepted ones show as authors and get it on their profile + followers' feeds
    collaborators : { type : [{ userId : { type : ObjectId, ref : 'User' }, status : { type : String, enum : ['pending', 'accepted'], default : 'pending' }, _id : false }], default : undefined },
    // scheduled post: hidden from everyone (shown in the author's "Scheduled" list) until it's published at this time
    scheduledFor : { type : Date },
    // Connectify poll: options with the people who chose each one
    poll : {
        options : { type : [{ text : { type : String, maxlength : 80 }, votes : { type : [{ type : ObjectId, ref : 'User' }], default : [] }, _id : false }], default : undefined },
        multiple : { type : Boolean }
    },
    // Connectify: a share of someone else's post
    sharedPost : { type : ObjectId, ref : 'Post' },
    // Connectify: coloured text post background
    background : { type : String, default : '' },
    // one reaction per person (Pixify: 'like')
    reactions : { type : [{ userId : { type : ObjectId, ref : 'User' }, type : { type : String, enum : REACTIONS }, at : Date, _id : false }], default : [] },
    commentCount : { type : Number, default : 0 },
    shareCount : { type : Number, default : 0 },
    // a video post in Pixify also shows in Reels
    isReel : { type : Boolean, default : false },
    // turn off comments (Pixify "Turn off commenting")
    commentsOff : { type : Boolean, default : false },
    editedAt : Date,
    // "Add location" (Pixify) / "Check in" (Connectify)
    location : { type : String, default : '', maxlength : 100 },
    // Connectify: "feeling happy 😊" / "celebrating 🎉"
    feeling : { type : String, default : '', maxlength : 60 },
    // people tagged in the photo (Pixify) / "with" friends (Connectify)
    tagged : { type : [{ type : ObjectId, ref : 'User' }], default : undefined },
    // Pixify: hide the like count from others
    hideLikes : { type : Boolean, default : false },
    // pinned to the top of the author's profile
    pinnedAt : { type : Date },
    // Pixify: archived posts are only visible to the author (Archive)
    archived : { type : Boolean, default : false },
    // the comment the author pinned to the top
    pinnedComment : { type : ObjectId, ref : 'Comment' },
    // Reels plays
    views : { type : Number, default : 0 },
    // Connectify: posted inside a group
    group : { type : ObjectId, ref : 'CxGroup' },
    // Connectify: posted by an admin as this Page (shown with the Page's name and picture, always public)
    page : { type : ObjectId, ref : 'CxPage' }
}, { timestamps : true })

postSchema.index({ app : 1, author : 1, createdAt : -1 })
postSchema.index({ 'external.key' : 1 }, { unique : true, partialFilterExpression : { 'external.key' : { $type : 'string' } } })
postSchema.index({ app : 1, createdAt : -1 })
postSchema.index({ app : 1, isReel : 1, createdAt : -1 })
postSchema.index({ tagged : 1, createdAt : -1 }, { partialFilterExpression : { 'tagged.0' : { $exists : true } } })
postSchema.index({ group : 1, createdAt : -1 }, { partialFilterExpression : { group : { $exists : true } } })
postSchema.index({ page : 1, createdAt : -1 }, { partialFilterExpression : { page : { $exists : true } } })
postSchema.index({ 'reactions.userId' : 1 })
postSchema.index({ scheduledFor : 1 }, { partialFilterExpression : { scheduledFor : { $exists : true } } })
postSchema.index({ 'collaborators.userId' : 1 }, { partialFilterExpression : { 'collaborators.0' : { $exists : true } } })

const commentSchema = new mongoose.Schema({
    post : { type : ObjectId, ref : 'Post', required : true },
    author : { type : ObjectId, ref : 'User', required : true },
    text : { type : String, required : true, maxlength : 2200 },
    // a reply to another comment (one level, like both apps show it)
    parent : { type : ObjectId, ref : 'Comment' },
    likes : { type : [{ type : ObjectId, ref : 'User' }], default : [] }
}, { timestamps : true })

commentSchema.index({ post : 1, createdAt : 1 })

// Pixify: one-way follow. 'pending' = a request to a private account.
const followSchema = new mongoose.Schema({
    follower : { type : ObjectId, ref : 'User', required : true },
    following : { type : ObjectId, ref : 'User', required : true },
    status : { type : String, enum : ['active', 'pending'], default : 'active' }
}, { timestamps : true })

followSchema.index({ follower : 1, following : 1 }, { unique : true })
followSchema.index({ following : 1, status : 1, createdAt : -1 })

// Connectify: friendship (request -> accepted). One document per pair.
const friendshipSchema = new mongoose.Schema({
    from : { type : ObjectId, ref : 'User', required : true },
    to : { type : ObjectId, ref : 'User', required : true },
    status : { type : String, enum : ['pending', 'accepted'], default : 'pending' },
    acceptedAt : Date
}, { timestamps : true })

friendshipSchema.index({ from : 1, to : 1 }, { unique : true })
friendshipSchema.index({ to : 1, status : 1 })
friendshipSchema.index({ from : 1, status : 1 })

// What happened to you in Pixify / Connectify (likes, comments, follows, friend requests, ...)
const NOTIFICATION_TYPES = ['like', 'react', 'comment', 'reply', 'comment_like', 'mention', 'follow', 'follow_request', 'follow_accept', 'friend_request', 'friend_accept', 'share', 'tag', 'poke', 'group_invite', 'group_post', 'group_join_request', 'group_join_accept', 'event_invite', 'event_going', 'listing_message', 'collab_invite', 'collab_accept', 'post_published', 'page_follow']
const notificationSchema = new mongoose.Schema({
    user : { type : ObjectId, ref : 'User', required : true },   // who it's for
    actor : { type : ObjectId, ref : 'User', required : true },  // who did it
    app : { type : String, enum : ['pixify', 'connectify'], required : true },
    type : { type : String, enum : NOTIFICATION_TYPES, required : true },
    post : { type : ObjectId, ref : 'Post' },
    comment : { type : ObjectId, ref : 'Comment' },
    reaction : { type : String },
    // Connectify groups / events
    group : { type : ObjectId, ref : 'CxGroup' },
    event : { type : ObjectId, ref : 'CxEvent' },
    page : { type : ObjectId, ref : 'CxPage' },
    text : { type : String, default : '', maxlength : 200 }, // comment preview
    read : { type : Boolean, default : false }
}, { timestamps : true })

notificationSchema.index({ user : 1, app : 1, createdAt : -1 })
// old notifications are cleaned up after 90 days
notificationSchema.index({ createdAt : 1 }, { expireAfterSeconds : 90 * 24 * 3600 })

// Connectify pokes: one per pair at a time (poking back clears yours)
const pokeSchema = new mongoose.Schema({
    from : { type : ObjectId, ref : 'User', required : true },
    to : { type : ObjectId, ref : 'User', required : true }
}, { timestamps : true })
pokeSchema.index({ from : 1, to : 1 }, { unique : true })
pokeSchema.index({ to : 1, createdAt : -1 })

// report of a post, comment or account in Pixify / Connectify (reviewed by the app owner)
const socialReportSchema = new mongoose.Schema({
    reporter : { type : ObjectId, ref : 'User', required : true },
    app : { type : String, enum : ['pixify', 'connectify'] },
    post : { type : ObjectId, ref : 'Post' },
    comment : { type : ObjectId, ref : 'Comment' },
    user : { type : ObjectId, ref : 'User' },
    reason : { type : String, default : '', maxlength : 200 }
}, { timestamps : true })

module.exports = {
    REACTIONS,
    NOTIFICATION_TYPES,
    PostModel : mongoose.model('Post', postSchema),
    CommentModel : mongoose.model('Comment', commentSchema),
    FollowModel : mongoose.model('Follow', followSchema),
    FriendshipModel : mongoose.model('Friendship', friendshipSchema),
    NotificationModel : mongoose.model('Notification', notificationSchema),
    PokeModel : mongoose.model('Poke', pokeSchema),
    SocialReportModel : mongoose.model('SocialReport', socialReportSchema)
}
