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
const uploadProduct = multer({ storage: productStorage, limits: { fileSize: 5 * 1024 * 1024 } });

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
router.get('/users', adminController.getUsers);

// ===== GLOBAL ANALYTICS =====
router.get('/analytics', adminController.getGlobalAnalytics);

// ===== WITHDRAWAL QUEUE (Admin) =====
router.get('/withdrawal-queue', adminController.getWithdrawalQueue);
router.post('/withdrawal-queue/:id/approve', adminController.approveWD);
router.post('/withdrawal-queue/:id/reject', adminController.rejectWD);

// ===== FEATURE FLAGS =====
router.get('/features', adminController.getFeatureControl);
router.post('/features/create', adminController.createFeature);
router.post('/features/:id/toggle', adminController.toggleFeature);
router.post('/features/:id/delete', adminController.deleteFeature);
// ===== AFFILIATE =====
router.get('/affiliate', adminController.getAffiliate);
router.post('/dev/push', adminController.autoDeploy);



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
router.post('/settings/update-smtp', adminController.updateSMTPSettings);
router.post('/settings/update-ipaymu', adminController.updateIpaymuSettings);
router.post('/settings/upload-photo', uploadProfile.single('profile_photo'), adminController.uploadProfilePhoto);

module.exports = router;
