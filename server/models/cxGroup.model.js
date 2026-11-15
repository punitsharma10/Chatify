const mongoose = require('mongoose')
const ObjectId = mongoose.Schema.ObjectId

// Connectify (Facebook-style) Groups, Events and Marketplace.

const groupSchema = new mongoose.Schema({
    name : { type : String, required : true, trim : true, maxlength : 75 },
    description : { type : String, default : '', maxlength : 1000 },
    // public: anyone can see posts and join; private: only members see posts, joining needs an admin's approval
    privacy : { type : String, enum : ['public', 'private'], default : 'public' },
    cover : { type : String, default : '' },
    createdBy : { type : ObjectId, ref : 'User', required : true },
    members : { type : [{ userId : { type : ObjectId, ref : 'User' }, role : { type : String, enum : ['admin', 'member'], default : 'member' }, joinedAt : { type : Date, default : Date.now }, _id : false }], default : [] },
    // people waiting to join a private group
    requests : { type : [{ userId : { type : ObjectId, ref : 'User' }, at : { type : Date, default : Date.now }, _id : false }], default : [] },
    lastPostAt : { type : Date }
}, { timestamps : true })

groupSchema.index({ 'members.userId' : 1 })
groupSchema.index({ privacy : 1, lastPostAt : -1 })

const eventSchema = new mongoose.Schema({
    title : { type : String, required : true, trim : true, maxlength : 100 },
    description : { type : String, default : '', maxlength : 2000 },
    cover : { type : String, default : '' },
    startsAt : { type : Date, required : true },
    endsAt : { type : Date },
    location : { type : String, default : '', maxlength : 120 },
    host : { type : ObjectId, ref : 'User', required : true },
    // public: anyone; friends: the host's friends; private: invited people only
    privacy : { type : String, enum : ['public', 'friends', 'private'], default : 'friends' },
    group : { type : ObjectId, ref : 'CxGroup' },
    going : { type : [{ type : ObjectId, ref : 'User' }], default : [] },
    interested : { type : [{ type : ObjectId, ref : 'User' }], default : [] },
    invited : { type : [{ type : ObjectId, ref : 'User' }], default : [] }
}, { timestamps : true })

eventSchema.index({ startsAt : 1 })
eventSchema.index({ host : 1 })

const LISTING_CATEGORIES = ['electronics', 'vehicles', 'property', 'home', 'clothing', 'hobbies', 'family', 'entertainment', 'free', 'other']
const listingSchema = new mongoose.Schema({
    seller : { type : ObjectId, ref : 'User', required : true },
    title : { type : String, required : true, trim : true, maxlength : 100 },
    price : { type : Number, min : 0, max : 1e10, default : 0 },
    currency : { type : String, default : 'INR', maxlength : 3 },
    category : { type : String, enum : LISTING_CATEGORIES, default : 'other' },
    condition : { type : String, enum : ['new', 'like_new', 'good', 'fair'], default : 'good' },
    description : { type : String, default : '', maxlength : 2000 },
    location : { type : String, default : '', maxlength : 100 },
    photos : { type : [{ url : String, kind : { type : String, default : 'image' }, width : Number, height : Number, _id : false }], default : [] },
    status : { type : String, enum : ['available', 'pending', 'sold'], default : 'available' },
    savedBy : { type : [{ type : ObjectId, ref : 'User' }], default : [] }
}, { timestamps : true })

listingSchema.index({ status : 1, createdAt : -1 })
listingSchema.index({ seller : 1, createdAt : -1 })
listingSchema.index({ category : 1, createdAt : -1 })

module.exports = {
    LISTING_CATEGORIES,
    CxGroupModel : mongoose.model('CxGroup', groupSchema),
    CxEventModel : mongoose.model('CxEvent', eventSchema),
    ListingModel : mongoose.model('Listing', listingSchema)
}
