const express = require('express');
const registerUser = require('../controllers/registerUser.controller');
const checkEmail = require('../controllers/checkEmail.controller');
const checkPassword = require('../controllers/checkPassword.controller');
const updateUserDetails = require('../controllers/updateUserDetails.controller');
const userDetails = require('../controllers/userDetails.controller');
const logout = require('../controllers/logout.controller');
const SearchUser = require('../controllers/searchUser.controller');

const router = express.Router();


router.post('/register', registerUser)
router.post('/email', checkEmail)
router.post('/password', checkPassword)
router.post('/updateuser',updateUserDetails)
router.get('/userdetails', userDetails)
router.get('/logout',logout)
router.post("/searchuser",SearchUser)


module.exports = router