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

// feeds
router.get('/feed', P.feed)               // ?app=pixify|connectify&before=
router.get('/explore', P.explore)         // Pixify; ?reels=1 for Reels
router.get('/saved', P.savedPosts)        // Pixify bookmarks

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
