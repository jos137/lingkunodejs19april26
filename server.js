console.log('>>> DEBUG: STARTING SERVER.JS');
require('dotenv').config(); console.log('>>> DEBUG: DOTENV LOADED');
const express = require('express'); console.log('>>> DEBUG: EXPRESS LOADED');
const expressLayouts = require('express-ejs-layouts'); console.log('>>> DEBUG: LAYOUTS LOADED');
const path = require('path');
const session = require('express-session'); console.log('>>> DEBUG: SESSION LOADED');
const MySQLStore = require('express-mysql-session')(session); console.log('>>> DEBUG: SESSION STORE LOADED');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit'); console.log('>>> DEBUG: RATE LIMIT LOADED');

const app = express(); console.log('>>> DEBUG: APP INITIALIZED');
const port = process.env.PORT || 3000;

if (!process.env.SESSION_SECRET) {
    throw new Error('Missing SESSION_SECRET environment variable.');
}

// EMERGENCY PING (Must be before ANY middleware)
app.get('/ping', (req, res) => {
    res.send(`
        <div style="font-family:sans-serif; text-align:center; padding:50px;">
            <h1 style="color:#10b981;">🚀 LINGKU SERVER IS ALIVE!</h1>
            <p>Berhasil diakses tanpa middleware.</p>
        </div>
    `);
});

console.log('--- LINGKU SERVER INITIALIZATION ---');
const db = require('./config/db');

// Database initialized in config/db.js

// Security Hardening
app.use(helmet({
    contentSecurityPolicy: false, // Disabling CSP for now to prevent breaking existing FontAwesome/external scripts
}));

// Rate Limiting (Prevent brute force & spam)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per window
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Terlalu banyak permintaan dari IP ini, silakan coba lagi nanti.'
});
app.use('/auth/', limiter); // Stricter limit for auth routes

// Middlewares
app.use(cors());
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));

console.log('🚀 Connecting to Session Store...');
const sessionStore = new MySQLStore({
    clearExpired: true,
    checkExpirationInterval: 900000,
    expiration: 86400000,
    createDatabaseTable: false // Matikan ini biar gak macet pas startup
}, db.pool);
console.log('✔ Session Store Configured.');

app.set('trust proxy', 1);

app.use(session({
    key: 'lingku_session',
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, 
        maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
}));

// Set Templating Engine
app.use(expressLayouts);
app.set('layout', './layouts/main');
app.set('view engine', 'ejs');


const fs = require('fs');

const builderController = require('./controllers/builderController');

// IPAYMU CALLBACK (Placed before global middleware to avoid any DB/Session blocks)
app.post('/api/callback/ipaymu', builderController.ipaymuCallback);

// Global Locals Middleware
app.use(async (req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
    
    // FRESH USER DATA (Refresh from DB every request to ensure role/plan changes reflect immediately)
    if (req.session.userId) {
        try {
            const [uRows] = await db.execute('SELECT * FROM users WHERE id = ?', [req.session.userId]);
            if (uRows[0]) {
                const u = uRows[0];
                req.session.user = {
                    id: u.id,
                    name: u.fullname || u.name || 'Admin',
                    role: u.role,
                    plan: u.plan,
                    expired_at: u.expired_at,
                    profile_photo: u.profile_photo,
                    slug: u.slug,
                    whatsapp: u.whatsapp || u.phone,
                    bio: u.bio,
                    sidebar_theme: u.sidebar_theme || 'default',
                    ipaymu_sandbox: u.ipaymu_sandbox,
                    ipaymu_expiry: u.ipaymu_expiry
                };
            }
        } catch(e) { console.error('Session refresh error:', e.message); }
    }

    res.locals.user = req.session.user || { role: 'guest', name: 'Guest', plan: 'free' };

    res.locals.user = req.session.user || { role: 'guest', name: 'Guest', plan: 'free' };

    // SMART IMAGE HELPER
    res.locals.img = (filename, folder = 'products') => {
        const placeholder = 'https://placehold.co/600x400?text=No+Image';
        if (!filename || filename === 'null' || filename === 'undefined' || filename === '') return placeholder;
        
        let target = String(filename).trim();
        
        // Handle JSON array format ["image.jpg"]
        if (target.startsWith('[') && target.endsWith(']')) {
            try { 
                const arr = JSON.parse(target);
                if (Array.isArray(arr) && arr.length > 0) target = arr[0];
            } catch(e) {}
        }

        if (target.startsWith('http')) return target;

        // Ensure it starts with /uploads/
        if (!target.startsWith('/uploads/') && !target.startsWith('uploads/')) {
            target = `/uploads/${folder}/${target.startsWith('/') ? target.substring(1) : target}`;
        }
        
        // Normalize leading slash for target
        if (!target.startsWith('/')) target = '/' + target;
        
        // Local check & Production Fallback
        let result = target;
        try {
            // Normalize path for fs.existsSync (remove leading slash for join)
            const cleanTarget = target.startsWith('/') ? target.substring(1) : target;
            const localFile = path.join(__dirname, 'public', cleanTarget);
            
            if (!fs.existsSync(localFile)) {
                // FUZZY CHECK 1: Maybe it's in the root /uploads/ instead of /uploads/products/ (or vice versa)
                const fileNameOnly = path.basename(target);
                const rootUploadsFile = path.join(__dirname, 'public/uploads', fileNameOnly);
                const productsUploadsFile = path.join(__dirname, 'public/uploads/products', fileNameOnly);
                
                if (fs.existsSync(rootUploadsFile)) {
                    result = `/uploads/${fileNameOnly}`;
                } else if (fs.existsSync(productsUploadsFile)) {
                    result = `/uploads/products/${fileNameOnly}`;
                } else {
                    // FUZZY CHECK 2: Check for timestamp prefix in public/uploads/
                    const uploadsDir = path.join(__dirname, 'public/uploads');
                    if (fs.existsSync(uploadsDir)) {
                        const files = fs.readdirSync(uploadsDir);
                        const found = files.find(f => f.endsWith(fileNameOnly));
                        if (found) {
                            result = `/uploads/${found}`;
                        } else {
                            result = `https://lingku.xyz${target}`;
                        }
                    } else {
                        result = `https://lingku.xyz${target}`;
                    }
                }
            }
        } catch (e) {
            console.error('Image helper error:', e.message);
        }
        return result;
    };

    // Fetch notifications and WD count
    try {

        // Fetch unread notifications for current user
        let notifs = [];
        if (req.session.user) {
            const [rows] = await db.execute(
                "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 5",
                [req.session.user.id]
            );
            notifs = rows;
        }
        res.locals.notifications = notifs;
        res.locals.unreadNotifCount = notifs.filter(n => !n.is_read).length;

        const [rows] = await db.execute("SELECT COUNT(*) as count FROM withdrawals WHERE status = 'pending'");
        res.locals.pendingWDCount = rows[0].count || 0;

        // ===== AFFILIATE SYSTEM =====
        let cookieDays = 30; // Default
        try {
            // Fetch cookie duration from settings
            const [check] = await db.execute("SELECT setting_value FROM settings WHERE setting_key = 'aff_cookie_duration'");
            if (check.length > 0) {
                cookieDays = parseInt(check[0].setting_value) || 30;
            }
        } catch (affErr) {
            console.error('Affiliate Fetch Error:', affErr.message);
        }

        // ===== GLOBAL AFFILIATE SENSOR (via Query Param ?ref= or ?aff=) =====
        const refCode = req.query.ref || req.query.aff;
        if (refCode) {
            res.cookie('ref_by', refCode, { 
                maxAge: 1000 * 60 * 60 * 24 * (typeof cookieDays !== 'undefined' ? cookieDays : 30), 
                httpOnly: true, 
                path: '/' 
            });
        }
        // ===== FEATURE FLAGS =====

        // Fetch all feature flags
        const [featureRows] = await db.execute("SELECT feature_key, is_enabled, text_value, color_value FROM feature_flags");
        const features = {};
        featureRows.forEach(f => {
            features[f.feature_key] = f.is_enabled === 1;
            if (f.feature_key === 'enable_announcement') {
                res.locals.announcementData = { 
                    text: f.text_value || 'PENGUMUMAN: Fitur Kontrol Sekarang Aktif! Coba matikan flag "enable_announcement" di menu Kontrol Fitur.', 
                    color: f.color_value || 'blue' 
                };
            }
        });
        res.locals.features = features;
        
        // Skip withdrawal schema checks (handled by startup auto-heal)

    } catch (e) {
        res.locals.notifications = [];
        res.locals.unreadNotifCount = 0;
        res.locals.pendingWDCount = 0;
        res.locals.features = {};
    }

    next();
});

// App Routes
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

app.use('/admin', adminRoutes);
app.use('/auth', authRoutes);
app.use('/login', (req, res) => res.redirect('/auth/login'));
app.use('/register', (req, res) => res.redirect('/auth/register'));
app.use('/', indexRoutes);
console.log('✔ Routes Registered.');

// 404 Route
app.get('*', (req, res) => {
    res.status(404).send('Page not found');
});


// Start Server with Error Handling
const server = app.listen(port, () => {
    console.log(`🚀 Lingku Server Berjalan di Port ${port}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ ERROR: Port ${port} sudah terpakai!`);
        console.error(`👉 Silakan jalankan perintah ini untuk mematikan proses lama: kill -9 $(lsof -t -i:${port})`);
        console.error(`Lalu jalankan ulang: npm run dev\n`);
        process.exit(1);
    } else {
        console.error('❌ Server Error:', err.message);
    }
});
