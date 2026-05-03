const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

// Controllers
const adminController = require('../controllers/adminController');
const dashboardController = require('../controllers/dashboardController');

// Builder controller (safe import)
let builderController;
try {
    builderController = require('../controllers/builderController');
} catch(e) {
    console.log('Builder controller not found, using placeholder');
    builderController = null;
}

// Auth middleware
function isAuth(req, res, next) {
    if (req.session && (req.session.user || req.session.userId)) {
        return next();
    }
    res.redirect('/auth/login');
}

function isAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    res.status(403).send('Akses dilarang: Hanya Admin yang bisa mengakses halaman ini.');
}

// Multer setup for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../public/uploads'));
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// Apply auth to all admin routes
router.use(isAuth);

// ===== DASHBOARD =====
router.get('/', dashboardController.getDashboardData);
router.post('/update-slug', dashboardController.updateSlug);

// ===== BUILDER =====
if (builderController) {
    router.get('/builder', builderController.getBuilder);
    router.post('/builder/save', builderController.savePageData);
    router.post('/builder/create', builderController.createPage);
    router.post('/builder/delete', builderController.deletePage);
    router.post('/builder/restore', builderController.restoreBackup);
    router.post('/builder/update-info', builderController.updatePageInfo);
    router.post('/builder/upload-image', upload.single('image'), (req, res) => {
        if (!req.file) return res.json({ success: false, message: 'No file uploaded' });
        res.json({ success: true, url: '/uploads/' + req.file.filename });
    });
}

// ===== PRODUCTS =====
// Product image upload storage
const productStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const fs = require('fs');
        const dir = path.join(__dirname, '../public/uploads/products');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, 'prod-' + Date.now() + path.extname(file.originalname));
    }
});
const uploadProduct = multer({ storage: productStorage, limits: { fileSize: 2 * 1024 * 1024 } });

router.get('/products', adminController.getProducts);
router.get('/products/create', adminController.getProductCreate);
router.post('/products/create', uploadProduct.single('thumbnail'), adminController.createProductPost);
router.get('/products/:id/edit', adminController.getProductEdit);
router.post('/products/:id/update', uploadProduct.single('thumbnail'), adminController.updateProduct);
router.post('/products/:id/delete', adminController.deleteProduct);

// ===== ORDERS =====
router.get('/orders', adminController.getOrders);
router.post('/orders/send-followup/:id', isAuth, adminController.sendFollowUpAction);
router.post('/orders/send-access/:id', isAuth, adminController.sendAccessAction);

// ===== STATISTICS =====
router.get('/statistics', adminController.getStatistics);

// ===== WITHDRAWAL =====
router.get('/withdrawal', adminController.getWithdrawal);
router.post('/withdrawal/request', adminController.requestWithdrawal);

// ===== GUIDES =====
router.get('/guides', adminController.getGuides);
router.post('/guides/add', adminController.addGuide);
router.get('/guides/delete/:id', adminController.deleteGuide);

// ===== USERS (Admin) =====
router.get('/users', isAdmin, adminController.getUsers);
router.get('/users/detail/:id', isAdmin, adminController.getUserBuyers);
router.post('/users/:id/update-role', isAdmin, adminController.updateUserRole);

// ===== GLOBAL ANALYTICS =====
router.get('/analytics', isAdmin, adminController.getGlobalAnalytics);

// ===== WITHDRAWAL QUEUE (Admin) =====
router.get('/withdrawal-queue', isAdmin, adminController.getWithdrawalQueue);
router.post('/withdrawal-queue/:id/approve', isAdmin, adminController.approveWD);
router.post('/withdrawal-queue/:id/reject', isAdmin, adminController.rejectWD);

// ===== FEATURE FLAGS =====
router.get('/features', isAdmin, adminController.getFeatureControl);
router.post('/features/create', isAdmin, adminController.createFeature);
router.post('/features/:id/toggle', isAdmin, adminController.toggleFeature);
router.post('/features/:id/delete', isAdmin, adminController.deleteFeature);
// ===== AFFILIATE =====
router.get('/affiliate', adminController.getAffiliate);
router.get('/marketplace', adminController.getMarketplace);
router.get('/affiliate-stats', adminController.getAffiliateStats);
router.post('/dev/push', adminController.autoDeploy);



// ===== HELP & BUG REPORTS =====
const ticketStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const fs = require('fs');
        const dir = path.join(__dirname, '../public/uploads/tickets');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, 'ticket-' + Date.now() + path.extname(file.originalname));
    }
});
const uploadTicket = multer({ storage: ticketStorage, limits: { fileSize: 2 * 1024 * 1024 } });

router.get('/help', adminController.getHelpCenter);
router.get('/help/report', adminController.getReportForm);
router.post('/help/report', (req, res, next) => {
    uploadTicket.single('screenshot')(req, res, (err) => {
        if (err) {
            console.error('Multer Help Error:', err);
            let msg = err.message;
            if (err.code === 'LIMIT_FILE_SIZE') msg = 'File terlalu besar! Maksimal 2MB bro.';
            return res.redirect('/admin/help?error=' + encodeURIComponent(msg));
        }
        next();
    });
}, adminController.submitReport);
router.get('/reports', isAdmin, adminController.getAdminReports);
router.post('/reports/:id/resolve', isAdmin, adminController.resolveTicket);

// New Chat System Routes
router.get('/help/ticket/:id', adminController.getTicketChat);
router.post('/help/ticket/:id/message', (req, res, next) => {
    uploadTicket.single('screenshot')(req, res, (err) => {
        if (err) {
            let msg = err.message;
            if (err.code === 'LIMIT_FILE_SIZE') msg = 'File terlalu besar! Maksimal 2MB.';
            return res.redirect(`/admin/help/ticket/${req.params.id}?error=` + encodeURIComponent(msg));
        }
        next();
    });
}, adminController.postTicketMessage);

// ===== SETTINGS =====
router.get('/settings', adminController.getSettings);

// Profile photo upload (separate multer for profiles dir)
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const fs = require('fs');
        const dir = path.join(__dirname, '../public/uploads/profiles');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, 'profile-' + Date.now() + path.extname(file.originalname));
    }
});
const uploadProfile = multer({ storage: profileStorage, limits: { fileSize: 2 * 1024 * 1024 } });
router.post('/settings/update-profile', uploadProfile.single('profile_photo'), adminController.updateProfile);
router.post('/settings/update-store', adminController.updateStoreSettings);
router.post('/settings/update-admin-theme', adminController.updateAdminTheme);
router.post('/settings/update-announcement', adminController.updateAnnouncement);
router.post('/settings/update-smtp', adminController.updateSMTPSettings);
router.post('/settings/update-ipaymu', adminController.updateIpaymuSettings);
router.post('/settings/update-affiliate', adminController.updateAffiliateSettings);
router.post('/settings/upload-photo', uploadProfile.single('profile_photo'), adminController.uploadProfilePhoto);

router.get('/notifications/:id/read', adminController.readNotification);
module.exports = router;
