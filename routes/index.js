const express = require('express');
const router = express.Router();

const indexController = require('../controllers/builderController');

// Landing Page
router.get('/', (req, res) => {
    // If user is logged in, redirect to dashboard
    if (req.session && req.session.user) {
        return res.redirect('/admin');
    }
    res.render('index', { layout: false });
});

// Legal & Contact Pages
router.get('/terms', (req, res) => {
    res.render('terms', { layout: false });
});

router.get('/privacy', (req, res) => {
    res.render('privacy', { layout: false });
});

router.get('/contact', (req, res) => {
    res.render('contact', { layout: false });
});

// Affiliate / Referral Tracking
router.get('/ref/:affiliateCode', indexController.handleReferral);

// Product Detail Page
router.get('/p/:productId', indexController.renderProductPage);

// Checkout Flow
router.get('/checkout/:productId', indexController.renderCheckoutPage);
router.post('/checkout/process', indexController.processCheckout);
router.post('/api/callback/ipaymu', indexController.ipaymuCallback);
router.get('/api/order/status/:refId', indexController.checkOrderStatus);

// Tracking & Email Events
router.get('/track/email/:orderId.png', indexController.trackEmailOpen);
router.get('/access/go/:orderId', indexController.handleAccessLink);

// Dynamic User Landing Pages (MUST BE LAST)
router.get('/:username', indexController.renderUserPage);
router.get('/:username/:pageSlug', indexController.renderUserPage);

module.exports = router;
