const express = require('express');
const registerUser = require('../controllers/registerUser.controller');
const checkEmail = require('../controllers/checkEmail.controller');
const checkPassword = require('../controllers/checkPassword.controller');
const updateUserDetails = require('../controllers/updateUserDetails.controller');
const userDetails = require('../controllers/userDetails.controller');
const logout = require('../controllers/logout.controller');
const SearchUser = require('../controllers/searchUser.controller');
const requireAuth = require('../helpers/requireAuth');
const { sendOtp, verifyOtp } = require('../controllers/otp.controller');
const resetPassword = require('../controllers/resetPassword.controller');

const router = express.Router();


// email verification codes (register + forgot password)
router.post('/otp/send', sendOtp)
router.post('/otp/verify', verifyOtp)
router.post('/reset-password', resetPassword)

router.post('/register', registerUser)
router.post('/email', checkEmail)
router.post('/password', checkPassword)
router.post('/updateuser',requireAuth,updateUserDetails)
router.get('/userdetails', userDetails)
router.get('/logout',logout)
router.post("/searchuser",requireAuth,SearchUser)


module.exports = router