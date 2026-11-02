const express = require('express');
const router = express.Router();

const indexController = require('../controllers/builderController');
const ticketController = require('../controllers/ticketController');
const tracking = require('../utils/tracking');
const db = require('../config/db');

// First-party client events (klik, scroll, dsb.)
router.post('/track', async (req, res) => {
    try {
        const b = req.body || {};
        const sellerId = Number(b.seller_id);
        if (!sellerId) return res.json({ ok: false });
        const allowed = ['click', 'page_leave', 'scroll_50', 'scroll_90', 'custom'];
        const name = allowed.includes(b.event_name) ? b.event_name : 'click';
        await tracking.logEvent(req, {
            sellerId,
            eventName: name,
            productId: b.product_id,
            pageUrl: b.page,
            metadata: {
                label: String(b.label || '').slice(0, 150),
                page: String(b.page || '').slice(0, 300)
            }
        });
        res.json({ ok: true });
    } catch (e) {
        res.json({ ok: false });
    }
});

// Landing Page
router.get('/', async (req, res) => {
    // If user is logged in, redirect to dashboard
    if (req.session && req.session.user) {
        return res.redirect('/admin');
    }
    try {
        const [settingRows] = await db.execute("SELECT setting_value FROM settings WHERE setting_key = 'free_quota_limit' LIMIT 1");
        const quotaTotal = Math.max(0, parseInt(settingRows[0]?.setting_value || '100', 10) || 0);
        const [countRows] = await db.execute("SELECT COUNT(*) AS used FROM users WHERE role <> 'admin'");
        const quotaUsed = Number(countRows[0]?.used || 0);
        let platformPixelId = '';
        try {
            const [pRows] = await db.execute("SELECT setting_value FROM settings WHERE setting_key = 'fb_pixel_id_platform' LIMIT 1");
            platformPixelId = pRows[0]?.setting_value || '';
        } catch (e) {}
        res.render('index', {
            layout: false,
            freeQuotaTotal: quotaTotal,
            freeQuotaRemaining: Math.max(0, quotaTotal - quotaUsed),
            platformPixelId
        });
    } catch (err) {
        console.error('Landing quota error:', err.message);
        res.render('index', { layout: false, freeQuotaTotal: 100, freeQuotaRemaining: null, platformPixelId: '' });
    }
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
router.get('/checkout/payment/:referenceId', indexController.getPaymentPage);
router.post('/api/callback/ipaymu', indexController.ipaymuCallback);
router.get('/api/order/status/:refId', indexController.checkOrderStatus);
router.get('/api/realtime-stats', indexController.getRealtimeStats);

// Tracking & Email Events
router.get('/track/email/:orderId.png', indexController.trackEmailOpen);
router.get('/access/go/:orderId', indexController.handleAccessLink);

// Ticket Routes
router.get('/tiket/:code', ticketController.displayTicket);
router.post('/api/tiket/validate/:code', ticketController.validateTicket);

// Dynamic User Landing Pages (MUST BE LAST)
router.get('/:username', indexController.renderUserPage);
router.get('/:username/produk', indexController.renderUserProducts);
router.get('/:username/:pageSlug', indexController.renderUserPage);

module.exports = router;
