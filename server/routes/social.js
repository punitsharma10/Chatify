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

// notifications
router.get('/notifications', U.notifications)   // ?app=
router.get('/notifications/unread', U.unread)
router.post('/notifications/read', U.markRead)

module.exports = router
