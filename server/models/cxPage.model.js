const mongoose = require('mongoose')
const ObjectId = mongoose.Schema.ObjectId

// Connectify (Facebook-style) Pages: a public presence for a brand, artist, business or community.
// Admins post as the Page; anyone can follow it and gets its posts in their Feed.

const PAGE_CATEGORIES = [
    'Personal blog', 'Artist', 'Musician/band', 'Community', 'Brand', 'Restaurant', 'Shopping & retail', 'Education',
    'Sports', 'Health & wellness', 'News & media', 'Entertainment', 'Nonprofit', 'Local business', 'Other'
]

const pageSchema = new mongoose.Schema({
    name : { type : String, required : true, trim : true, maxlength : 75 },
    category : { type : String, enum : PAGE_CATEGORIES, default : 'Other' },
    bio : { type : String, default : '', maxlength : 255 },
    avatar : { type : String, default : '' },
    cover : { type : String, default : '' },
    website : { type : String, default : '', maxlength : 200 },
    location : { type : String, default : '', maxlength : 120 },
    email : { type : String, default : '', maxlength : 120 },
    phone : { type : String, default : '', maxlength : 30 },
    createdBy : { type : ObjectId, ref : 'User', required : true },
    // people who manage the Page (always at least one)
    admins : { type : [{ type : ObjectId, ref : 'User' }], default : [] },
    followers : { type : [{ type : ObjectId, ref : 'User' }], default : [] },
    followerCount : { type : Number, default : 0 },
    lastPostAt : { type : Date }
}, { timestamps : true })

pageSchema.index({ admins : 1 })
pageSchema.index({ followers : 1 })
pageSchema.index({ followerCount : -1, createdAt : -1 })

module.exports = {
    PAGE_CATEGORIES,
    CxPageModel : mongoose.model('CxPage', pageSchema)
}
