const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');

router.get('/captcha', authController.getCaptcha);

router.get('/login', (req, res) => {
    res.render('login', { title: 'Login - Lingku.xyz', layout: false, error: null });
});

router.post('/login', authController.login);

router.get('/register', (req, res) => {
    res.render('register', { title: 'Register - Lingku.xyz', layout: false, error: null });
});

router.post('/register', authController.register);

router.get('/logout', authController.logout);

// Forgot Password
router.get('/forgot-password', authController.getForgotPassword);
router.post('/forgot-password', authController.postForgotPassword);

// Reset Password
router.get('/reset-password/:token', authController.getResetPassword);
router.post('/reset-password', authController.postResetPassword);

module.exports = router;
