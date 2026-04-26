require('dotenv').config();
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Set Templating Engine
app.use(expressLayouts);
app.set('layout', './layouts/main');
app.set('view engine', 'ejs');

const db = require('./config/db');
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
                    ipaymu_sandbox: u.ipaymu_sandbox,
                    ipaymu_expiry: u.ipaymu_expiry
                };
            }
        } catch(e) { console.error('Session refresh error:', e.message); }
    }

    // AUTO-HEAL: Ensure expired_at exists
    try {
        await db.execute("SELECT expired_at FROM users LIMIT 1");
    } catch (e) {
        if (e.message.includes('Unknown column')) {
            await db.execute("ALTER TABLE users ADD COLUMN expired_at DATETIME DEFAULT NULL AFTER plan");
        }
    }

    res.locals.user = req.session.user || {
        role: 'admin',
        name: 'Admin JOS',
        roleDisplay: 'Administrator',
        slug: 'admin',
        avatar: '/images/avatar.png'
    };

    // SMART IMAGE HELPER
    res.locals.img = (filename, folder = 'products') => {
        if (!filename || filename === 'null' || filename === 'undefined') return '/images/placeholder.png';
        if (typeof filename !== 'string') return '/images/placeholder.png';
        if (filename.startsWith('http')) return filename;
        
        let cleanFile = filename.trim();
        
        // Handle JSON array format ["image.jpg"]
        if (cleanFile.startsWith('[') && cleanFile.endsWith(']')) {
            try { 
                const arr = JSON.parse(cleanFile);
                if (Array.isArray(arr) && arr.length > 0) cleanFile = arr[0];
            } catch(e) {}
        }

        // If filename ALREADY contains /uploads/, extract just the filename
        // Example: /uploads/products/foto.png -> foto.png
        if (cleanFile.includes('/uploads/')) {
            const parts = cleanFile.split('/');
            cleanFile = parts[parts.length - 1];
        }

        const relativePath = `/uploads/${folder}/${cleanFile}`;

        // If on PRODUCTION (Live Site), always use local path
        if (!res.locals.isLocal) {
            return relativePath;
        }
        
        // If on LOCALHOST, check if file exists, else fallback to Live
        try {
            const localPath = path.join(__dirname, 'public', 'uploads', folder, cleanFile);
            if (fs.existsSync(localPath)) {
                return relativePath;
            }
        } catch(e) {}

        return `https://lingku.xyz/uploads/${folder}/${cleanFile}`;
    };

    // Fetch notifications and WD count
    try {
        // Auto-Heal: Ensure notifications table exists
        try {
            await db.execute("SELECT id FROM notifications LIMIT 1");
        } catch (e) {
            if (e.message.includes('Unknown table') || e.message.includes('doesn\'t exist')) {
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS notifications (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT NOT NULL,
                        title VARCHAR(255),
                        message TEXT,
                        type VARCHAR(50) DEFAULT 'info',
                        is_read TINYINT(1) DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
            }
        }

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

        // ===== AUTO-HEAL: AFFILIATE SYSTEM =====
        let cookieDays = 30; // Default
        try {
            const [cols] = await db.execute("SHOW COLUMNS FROM users LIKE 'affiliate_code'");
            if (cols.length === 0) {
                await db.execute("ALTER TABLE users ADD COLUMN affiliate_code VARCHAR(50) UNIQUE DEFAULT NULL AFTER email");
                await db.execute("ALTER TABLE users ADD COLUMN referred_by INT DEFAULT NULL AFTER affiliate_code");
            }
            
            // Ensure every user has an affiliate_code (for existing users)
            const [usersNoCode] = await db.execute("SELECT id, fullname FROM users WHERE affiliate_code IS NULL OR affiliate_code = '' LIMIT 50");
            for (const u of usersNoCode) {
                const cleanName = (u.fullname || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8);
                const randomCode = cleanName + Math.floor(1000 + Math.random() * 9000);
                await db.execute("UPDATE users SET affiliate_code = ? WHERE id = ?", [randomCode, u.id]);
            }

            // Ensure basic settings exist & fetch cookie duration
            const affSettings = [
                { key: 'aff_commission_percent', val: '20' },
                { key: 'aff_cookie_duration', val: '30' }
            ];
            for (const s of affSettings) {
                const [check] = await db.execute("SELECT setting_key, setting_value FROM settings WHERE setting_key = ?", [s.key]);
                if (check.length === 0) {
                    await db.execute("INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)", [s.key, s.val]);
                } else if (s.key === 'aff_cookie_duration') {
                    cookieDays = parseInt(check[0].setting_value) || 30;
                }
            }
        } catch (affErr) {
            console.error('Affiliate Auto-Heal Error:', affErr.message);
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
        // ===== AUTO-HEAL: FEATURE FLAGS =====
        try {
            // Check if table and essential columns exist
            await db.execute("SELECT is_enabled FROM feature_flags LIMIT 1");
        } catch (e) {
            if (e.message.includes("doesn't exist")) {
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS feature_flags (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        flag_key VARCHAR(100) UNIQUE NOT NULL,
                        description TEXT,
                        is_enabled TINYINT(1) DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                await db.execute("INSERT IGNORE INTO feature_flags (flag_key, description, is_enabled) VALUES (?, ?, ?)", 
                    ['enable_announcement', 'Menampilkan pengumuman di dashboard', 1]);
                await db.execute("INSERT IGNORE INTO feature_flags (flag_key, description, is_enabled) VALUES (?, ?, ?)", 
                    ['show_today_sales', 'Menampilkan statistik penjualan hari ini', 1]);
            } else if (e.message.includes("Unknown column 'is_enabled'")) {
                await db.execute("ALTER TABLE feature_flags ADD COLUMN is_enabled TINYINT(1) DEFAULT 0 AFTER description");
            }
        }

        // Fetch all feature flags
        const [featureRows] = await db.execute("SELECT flag_key, is_enabled FROM feature_flags");
        const features = {};
        featureRows.forEach(f => {
            features[f.flag_key] = f.is_enabled === 1;
        });
        res.locals.features = features;

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

// 404 Route
app.get('*', (req, res) => {
    res.status(404).send('Page not found');
});

// Start Server
app.listen(port, () => {
    console.log(`App running on port ${port}`);
});
