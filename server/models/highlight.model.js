const mongoose = require('mongoose')
const ObjectId = mongoose.Schema.ObjectId

// Pixify story archive: a private copy of every story shared to Pixify (stories themselves are deleted
// after 24 hours). Only the owner sees it; highlights are built from it.
const storyArchiveSchema = new mongoose.Schema({
    userId : { type : ObjectId, ref : 'User', required : true },
    statusId : { type : ObjectId },                                  // the story it was copied from
    kind : { type : String, enum : ['text', 'image', 'video'], required : true },
    text : { type : String, default : '' },
    background : { type : String, default : '' },
    font : { type : Number, default : 0 },
    mediaUrl : { type : String, default : '' },
    caption : { type : String, default : '' },
    closeFriends : { type : Boolean, default : undefined },          // was shared with Close friends only
    createdAt : { type : Date, required : true }                     // when the story was posted
})
storyArchiveSchema.index({ userId : 1, createdAt : -1 })
storyArchiveSchema.index({ statusId : 1 }, { unique : true, partialFilterExpression : { statusId : { $type : 'objectId' } } })

// Pixify highlight: a named set of archived stories shown on the profile. The cover is the first item.
const highlightSchema = new mongoose.Schema({
    userId : { type : ObjectId, ref : 'User', required : true },
    title : { type : String, required : true, maxlength : 30 },
    items : [{ type : ObjectId, ref : 'StoryArchive' }]
},{
    timestamps : true
})
highlightSchema.index({ userId : 1, createdAt : 1 })
highlightSchema.index({ items : 1 })

const StoryArchiveModel = mongoose.model('StoryArchive', storyArchiveSchema)
const HighlightModel = mongoose.model('Highlight', highlightSchema)

module.exports = { StoryArchiveModel, HighlightModel }
