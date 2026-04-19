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

const builderController = require('./controllers/builderController');

// IPAYMU CALLBACK (Placed before global middleware to avoid any DB/Session blocks)
app.post('/api/callback/ipaymu', builderController.ipaymuCallback);

// Global Locals Middleware
app.use(async (req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.user = req.session.user || {
        role: 'admin',
        name: 'Admin JOS',
        roleDisplay: 'Administrator',
        slug: 'admin',
        avatar: '/images/avatar.png'
    };

    // Fetch Pending WD Count for Red Badge
    try {
        const [rows] = await db.execute("SELECT COUNT(*) as count FROM withdrawals WHERE status = 'pending'");
        res.locals.pendingWDCount = rows[0].count || 0;
    } catch (e) {
        res.locals.pendingWDCount = 0;
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
