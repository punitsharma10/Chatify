const express = require('express')
const requireAuth = require('../helpers/requireAuth')
const P = require('../controllers/posts.controller')
const U = require('../controllers/people.controller')

// Pixify (Instagram-style) and Connectify (Facebook-style). Everything needs a signed-in account.
const router = express.Router()
router.use(requireAuth)

// posts
router.post('/posts', P.createPost)
router.get('/posts/:id', P.getPost)
router.patch('/posts/:id', P.editPost)
router.delete('/posts/:id', P.deletePost)
router.post('/posts/:id/react', P.react)
router.get('/posts/:id/reactions', P.reactions)
router.post('/posts/:id/save', P.savePost)
router.get('/posts/:id/comments', P.listComments)
router.post('/posts/:id/comments', P.addComment)
router.delete('/comments/:id', P.deleteComment)
router.post('/comments/:id/like', P.likeComment)

router.post('/posts/:id/pin', P.pinPost)            // pin to profile (up to 3)
router.post('/posts/:id/archive', P.archivePost)    // Pixify archive
router.post('/posts/:id/view', P.viewPost)          // Reel plays
router.post('/posts/:id/hide', P.hidePost)          // Connectify hide / Pixify not interested
router.post('/comments/:id/pin', P.pinComment)
router.post('/report', P.report)
router.get('/report/reasons', P.reportReasons)

// feeds
router.get('/feed', P.feed)               // ?app=pixify|connectify&before=&filter=favorites
router.get('/explore', P.explore)         // Pixify; ?reels=1 for Reels
router.get('/saved', P.savedPosts)        // ?app=pixify|connectify
router.get('/archive', P.archived)        // my archived Pixify posts
router.get('/liked', P.liked)             // ?app= posts I liked
router.get('/hashtags/:tag', P.hashtag)   // ?app=
router.get('/memories', P.memories)       // Connectify "On this day"
router.get('/watch', P.watch)             // Connectify videos

// Pixify mute / favorites, Connectify unfollow / snooze / pokes / birthdays
router.post('/mute/:id', U.mute)
router.get('/muted', U.mutedList)
router.post('/favorites/:id', U.favorite)
router.get('/favorites', U.favorites)
router.post('/cx/unfollow/:id', U.cxUnfollow)
router.get('/cx/unfollowed', U.unfollowedList)
router.post('/cx/snooze/:id', U.snooze)
router.post('/pokes/:id', U.poke)
router.get('/pokes', U.pokes)
router.get('/birthdays', U.birthdays)

// Connectify groups, events, marketplace
const C = require('../controllers/cx.controller')
router.get('/groups', C.listGroups)                 // ?tab=yours|discover&q=
router.post('/groups', C.createGroup)
router.get('/groups/:id', C.getGroup)
router.patch('/groups/:id', C.updateGroup)
router.delete('/groups/:id', C.deleteGroup)
router.post('/groups/:id/join', C.joinGroup)
router.post('/groups/:id/cancel', C.cancelRequest)
router.post('/groups/:id/leave', C.leaveGroup)
router.get('/groups/:id/members', C.groupMembers)
router.post('/groups/:id/members/:userId', C.manageMember)
router.get('/groups/:id/requests', C.groupRequests)
router.post('/groups/:id/requests/:userId', C.answerRequest)
router.post('/groups/:id/invite', C.inviteToGroup)
router.get('/groups/:id/posts', C.groupPosts)
router.delete('/groups/:id/posts/:postId', C.removeGroupPost)
router.get('/events', C.listEvents)                 // ?tab=upcoming|going|hosting|past
router.post('/events', C.createEvent)
router.get('/events/:id', C.getEvent)
router.patch('/events/:id', C.updateEvent)
router.delete('/events/:id', C.deleteEvent)
router.post('/events/:id/rsvp', C.rsvp)
router.post('/events/:id/invite', C.inviteToEvent)
router.get('/events/:id/guests', C.eventGuests)
router.get('/market', C.listListings)               // ?tab=browse|mine|saved&category=&q=
router.post('/market', C.createListing)
router.get('/market/:id', C.getListing)
router.patch('/market/:id', C.updateListing)
router.delete('/market/:id', C.deleteListing)
router.post('/market/:id/save', C.saveListing)

// people
router.get('/search', U.search)           // ?app=&q=
router.post('/profile', U.updateProfile)
router.get('/users/:id', U.profile)       // ?app=
router.get('/users/:id/posts', P.userPosts)
router.get('/users/:id/follows', U.followList) // ?type=followers|following
router.get('/users/:id/friends', U.friendList)

// Pixify follows
router.post('/follow/:id', U.follow)
router.get('/follow-requests', U.followRequests)
router.get('/follow-suggestions', U.followSuggestions)
router.post('/follow-requests/:id', U.answerFollowRequest)
router.post('/followers/:id/remove', U.removeFollower)

// Connectify friends
router.get('/friends/requests', U.friendRequests)
router.get('/friends/suggestions', U.friendSuggestions)
router.post('/friends/:id', U.friendAction)

// Pixify Direct (Instagram-style messages, separate from Chats)
const D = require('../controllers/dm.controller')
router.get('/dm/threads', D.listThreads)            // ?folder=inbox|requests&before=
router.post('/dm/threads', D.createThread)          // { userIds, name, group }
router.get('/dm/unread', D.unread)
router.get('/dm/suggested', D.suggested)
router.get('/dm/with/:handle', D.withUser)
router.get('/dm/notes', D.notes)
router.post('/dm/note', D.setNote)
router.post('/dm/messages/:id/forward', D.forward)
router.post('/dm/share', D.share)
router.get('/dm/threads/:id', D.getThread)
router.patch('/dm/threads/:id', D.updateGroup)
router.get('/dm/threads/:id/messages', D.listMessages)
router.post('/dm/threads/:id/messages', D.sendMessage)
router.post('/dm/threads/:id/read', D.markRead)
router.post('/dm/threads/:id/accept', D.accept)
router.post('/dm/threads/:id/delete', D.hide)
router.post('/dm/threads/:id/mute', D.mute)
router.post('/dm/threads/:id/members', D.addMembers)
router.delete('/dm/threads/:id/members/:userId', D.removeMember)
router.post('/dm/threads/:id/admins/:userId', D.setAdmin)
router.post('/dm/threads/:id/leave', D.leave)
router.patch('/dm/messages/:id', D.editMessage)
router.delete('/dm/messages/:id', D.unsend)
router.post('/dm/messages/:id/react', D.react)

// notifications
router.get('/notifications', U.notifications)   // ?app=
router.get('/notifications/unread', U.unread)
router.post('/notifications/read', U.markRead)

module.exports = router
