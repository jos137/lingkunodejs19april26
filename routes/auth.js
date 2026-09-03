const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');

router.get('/captcha', authController.getCaptcha);

router.get('/login', authController.showLogin);

router.post('/login', authController.login);

router.get('/register', authController.showRegister);

router.post('/register', authController.register);

router.get('/logout', authController.logout);

// Forgot Password
router.get('/forgot-password', authController.getForgotPassword);
router.post('/forgot-password', authController.postForgotPassword);

// Reset Password
router.get('/reset-password/:token', authController.getResetPassword);
router.post('/reset-password', authController.postResetPassword);

module.exports = router;
