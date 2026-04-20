const db = require('../config/db');
const axios = require('axios');
const { exec } = require('child_process');
const { sendAccessEmail, sendFollowUpEmail } = require('../utils/mailer');

// ===================== DASHBOARD =====================
exports.getDashboard = async (req, res) => {
    try {
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.send('Error');
    }
};

// ===================== PRODUCTS =====================
exports.getProducts = async (req, res) => {
    try {
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);
        let products = [];
        
        // Try JOIN with orders for sold count
        try {
            const [rows] = await db.execute(`
                SELECT p.*, 
                    COALESCE((SELECT COUNT(*) FROM orders o WHERE o.product_id = p.id AND o.status = 'completed'), 0) as sold
                FROM products p 
                WHERE p.user_id = ? 
                ORDER BY p.id DESC`, [userId]);
            products = rows;
        } catch(e) {
            // Fallback: simple query
            console.log('Products JOIN fallback:', e.message);
            const [rows] = await db.execute('SELECT * FROM products WHERE user_id = ? ORDER BY id DESC', [userId]);
            products = rows.map(p => ({ ...p, sold: 0 }));
        }

        // Detect thumbnail column name and handle JSON array format
        products = products.map(p => {
            let raw = p.thumbnail || p.cover_image || p.image || p.image_url || p.photo || '';
            let thumb = '';
            
            if (raw) {
                if (Array.isArray(raw)) {
                    // Already an array from DB driver
                    if (raw.length > 0) thumb = raw[0];
                } else if (typeof raw === 'string') {
                    if (raw.startsWith('[')) {
                        // Stringified JSON array
                        try {
                            const arr = JSON.parse(raw);
                            if (Array.isArray(arr) && arr.length > 0) thumb = arr[0];
                        } catch(e) {
                            thumb = raw;
                        }
                    } else {
                        thumb = raw;
                    }
                } else if (typeof raw === 'object' && raw !== null) {
                   // Some other object, stringify or fallback
                   thumb = Object.values(raw)[0] || '';
                }
            }
            
            // Add prefix if needed
            if (thumb && !thumb.startsWith('http') && !thumb.startsWith('/')) {
                thumb = '/uploads/products/' + thumb;
            }
            return { ...p, thumb };
        });

        res.render('admin/products', {
            title: 'Produk Digital',
            layout: './layouts/admin',
            products,
            user: req.session.user || res.locals.user
        });
    } catch (err) {
        console.error('Products Error:', err.message);
        res.render('admin/products', { title: 'Produk Digital', layout: './layouts/admin', products: [], user: req.session.user || res.locals.user });
    }
};

exports.getProductEdit = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM products WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.redirect('/admin/products');
        res.render('admin/product-edit', {
            title: 'Edit Produk',
            layout: './layouts/admin',
            product: rows[0],
            user: req.session.user || res.locals.user
        });
    } catch (err) {
        console.error(err.message);
        res.redirect('/admin/products');
    }
};

// Render create page (empty editor)
exports.getProductCreate = async (req, res) => {
    const type = req.query.type || 'digital';
    res.render('admin/product-edit', {
        title: 'Tambah Produk',
        layout: './layouts/admin',
        product: { type },
        user: req.session.user || res.locals.user
    });
};

exports.updateProduct = async (req, res) => {
    try {
        const { 
            name, description, price, stock, download_url, normal_price,
            promo_enabled, promo_duration, min_price, 
            sale_start_date, sale_start_time, sale_end_date, sale_end_time,
            show_forever
        } = req.body;
        
        let thumbUpdate = '';
        let params = [
            name, description, price || 0, stock || 0, download_url || '', 
            normal_price || null, promo_enabled === 'on' ? 1 : 0, promo_duration || 0, 
            min_price || null, sale_start_date || null, sale_start_time || null, 
            sale_end_date || null, sale_end_time || null, show_forever === 'on' ? 1 : 0
        ];
        
        if (req.file) {
            thumbUpdate = ', thumbnail = ?';
            params.push('/uploads/products/' + req.file.filename);
        }
        params.push(req.params.id);
        
        const query = `UPDATE products SET 
            name = ?, description = ?, price = ?, stock = ?, download_url = ?, 
            normal_price = ?, promo_enabled = ?, promo_duration = ?, 
            min_price = ?, sale_start_date = ?, sale_start_time = ?, 
            sale_end_date = ?, sale_end_time = ?, show_forever = ?
            ${thumbUpdate} WHERE id = ?`;
            
        try {
            await db.execute(query, params);
        } catch (dbErr) {
            if (dbErr.message.includes('Unknown column')) {
                const addCols = [
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INT DEFAULT 0',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS download_url TEXT',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS normal_price DECIMAL(15,2)',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_enabled TINYINT(1) DEFAULT 0',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_duration INT DEFAULT 0',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS min_price DECIMAL(15,2)',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_start_date DATE',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_start_time TIME',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_end_date DATE',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_end_time TIME',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS show_forever TINYINT(1) DEFAULT 0'
                ];
                for (let sql of addCols) {
                    try { await db.execute(sql.replace('IF NOT EXISTS ', '')); } catch(e) {}
                }
                await db.execute(query, params);
            } else throw dbErr;
        }

        res.redirect('/admin/products');
    } catch (err) {
        console.error('Update product error:', err.message);
        res.status(500).send('Gagal update produk: ' + err.message);
    }
};

exports.createProductPost = async (req, res) => {
    try {
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);
        const { 
            name, description, price, stock, type, download_url, normal_price,
            promo_enabled, promo_duration, min_price, 
            sale_start_date, sale_start_time, sale_end_date, sale_end_time,
            show_forever
        } = req.body;

        let thumbnail = '';
        if (req.file) thumbnail = '/uploads/products/' + req.file.filename;
        
        const query = `INSERT INTO products (
            user_id, name, description, price, stock, type, download_url, 
            normal_price, promo_enabled, promo_duration, min_price, 
            sale_start_date, sale_start_time, sale_end_date, sale_end_time, 
            show_forever, thumbnail
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

        const params = [
            userId, name, description || '', price || 0, stock || 999, type || 'digital', 
            download_url || '', normal_price || null, promo_enabled === 'on' ? 1 : 0, 
            promo_duration || 0, min_price || null, sale_start_date || null, 
            sale_start_time || null, sale_end_date || null, sale_end_time || null, 
            show_forever === 'on' ? 1 : 0, thumbnail
        ];

        try {
            await db.execute(query, params);
        } catch (dbErr) {
            if (dbErr.message.includes('Unknown column')) {
                const addCols = [
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INT DEFAULT 0',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS download_url TEXT',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS normal_price DECIMAL(15,2)',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_enabled TINYINT(1) DEFAULT 0',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_duration INT DEFAULT 0',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS min_price DECIMAL(15,2)',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_start_date DATE',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_start_time TIME',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_end_date DATE',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_end_time TIME',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS show_forever TINYINT(1) DEFAULT 0'
                ];
                for (let sql of addCols) {
                    try { await db.execute(sql.replace('IF NOT EXISTS ', '')); } catch(e) {}
                }
                await db.execute(query, params);
            } else throw dbErr;
        }

        res.redirect('/admin/products');
    } catch (err) {
        console.error('Create product error:', err.message);
        res.status(500).send('Gagal membuat produk: ' + err.message);
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        await db.execute('DELETE FROM products WHERE id = ?', [req.params.id]);
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err.message);
        res.redirect('/admin/products');
    }
};

// ===================== ORDERS =====================
exports.getOrders = async (req, res) => {
    try {
        // Auto-Heal Email Logs table if missing
        try {
            await db.execute("SELECT 1 FROM email_logs LIMIT 1");
        } catch (e) {
            if (e.message.includes("Table") && e.message.includes("doesn't exist")) {
                await db.execute(`
                    CREATE TABLE email_logs (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        order_id INT NOT NULL,
                        event_name VARCHAR(50) NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
            }
        }

        // Auto-Heal Orders table columns if missing
        try {
            await db.execute("SELECT user_id, reference_id, customer_name, customer_email, total_price, payment_channel FROM orders LIMIT 1");
        } catch (e) {
            if (e.message.includes('Unknown column')) {
                const cols = [
                    'ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id INT',
                    'ALTER TABLE orders ADD COLUMN IF NOT EXISTS reference_id VARCHAR(100)',
                    'ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255)',
                    'ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255)',
                    'ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_whatsapp VARCHAR(50)',
                    'ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_price DECIMAL(15,2)',
                    'ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_channel VARCHAR(50)'
                ];
                for (let sql of cols) {
                    try { await db.execute(sql.replace('IF NOT EXISTS ', '')); } catch(err) {}
                }
            }
        }

        // Auto-Heal: Ensure products.thumbnail column exists
        try {
            await db.execute("SELECT thumbnail FROM products LIMIT 1");
        } catch (e) {
            if (e.message.includes('Unknown column')) {
                try { await db.execute("ALTER TABLE products ADD COLUMN thumbnail VARCHAR(255) DEFAULT NULL"); } catch(err) {}
            }
        }

        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        // Get total count for pagination
        const [countRow] = await db.execute('SELECT COUNT(*) as total FROM orders WHERE user_id = ?', [userId]);
        const totalItems = countRow[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // Safe query for Hostinger DB
        const [orders] = await db.execute(
            `SELECT o.*, 
                    COALESCE(p.name, 'Produk Tidak Terdeteksi') as product_name, 
                    p.price as product_price, 
                    COALESCE(p.thumbnail, p.image_url, p.image_small) as product_thumbnail,
                    p.access_link,
                    (SELECT MAX(created_at) FROM email_logs WHERE order_id = o.id AND event_name IN ('Opened', 'Clicked')) as last_opened_at
             FROM orders o
             LEFT JOIN products p ON o.product_id = p.id
             WHERE o.user_id = ?
             ORDER BY o.id DESC
             LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );

        // Clean up data (handle JSON product_thumbnail)
        const cleanedOrders = orders.map(o => {
            let thumb = o.product_thumbnail || '';
            if (typeof thumb === 'string' && thumb.startsWith('[')) {
                try {
                    const arr = JSON.parse(thumb);
                    if (Array.isArray(arr) && arr.length > 0) thumb = arr[0];
                } catch(e) {}
            }
            return { ...o, product_thumbnail: thumb };
        });

        res.render('admin/orders', {
            title: 'Manajemen Pesanan',
            layout: './layouts/admin',
            user: req.session.user || res.locals.user,
            orders: cleanedOrders,
            currentPage: page,
            totalPages: totalPages,
            merchantUsername: req.session.user ? req.session.user.username : ""
        });
    } catch (err) {
        console.error('Orders Error:', err.message);
        res.status(500).send('Terjadi kesalahan pada sistem: ' + err.message);
    }
};

exports.sendFollowUpAction = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);
        
        // Fetch order with product and merchant info (using slug instead of username)
        const [rows] = await db.execute(`
            SELECT o.*, 
                   COALESCE(p.name, 'Produk') as product_name, 
                   u.slug as merchant_username 
            FROM orders o 
            LEFT JOIN products p ON o.product_id = p.id
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.id = ? AND o.user_id = ?
        `, [orderId, userId]);

        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' });
        
        const o = rows[0];
        const merchantUsername = o.merchant_username || (req.session.user ? req.session.user.username : '');
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const merchantLink = `${baseUrl}/${merchantUsername}`;
        
        const success = await sendFollowUpEmail(o.id, o.customer_email || o.buyer_email, o.customer_name || o.buyer_name, o.product_name, merchantLink, baseUrl);
        
        if (success) {
            res.json({ success: true, message: 'Email follow-up berhasil dikirim' });
        } else {
            res.status(500).json({ success: false, message: 'Gagal mengirim email, periksa SMTP' });
        }
    } catch (err) {
        console.error('Followup Error:', err.message);
        res.status(500).json({ success: false, message: 'Gagal: ' + err.message });
    }
};

exports.sendAccessAction = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);
        
        // Ensure email_logs exists
        try { await db.execute("SELECT 1 FROM email_logs LIMIT 1"); } catch (e) {
            if (e.message.includes("Table") && e.message.includes("doesn't exist")) {
                await db.execute("CREATE TABLE email_logs (id INT AUTO_INCREMENT PRIMARY KEY, order_id INT NOT NULL, event_name VARCHAR(50) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
            }
        }
        
        const [rows] = await db.execute(`
            SELECT o.*, p.name as product_name, p.access_link 
            FROM orders o 
            LEFT JOIN products p ON o.product_id = p.id 
            WHERE o.id = ? AND o.user_id = ?
        `, [orderId, userId]);

        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' });
        
        const o = rows[0];
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const success = await sendAccessEmail(o.id, o.customer_email || o.buyer_email, o.customer_name || o.buyer_name, o.product_name, o.access_link, baseUrl);
        
        if (success) {
            res.json({ success: true, message: 'Email akses produk berhasil dikirim' });
        } else {
            res.status(500).json({ success: false, message: 'Gagal mengirim email, periksa SMTP' });
        }
    } catch (err) {
        console.error('Access Email Error:', err.message);
        res.status(500).json({ success: false, message: 'Gagal: ' + err.message });
    }
};

// ===================== STATISTICS =====================
exports.getStatistics = async (req, res) => {
    try {
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);

        let totalRevenue = 0, totalOrders = 0, completedOrders = 0, pendingOrders = 0;
        try {
            const [rev] = await db.execute("SELECT COALESCE(SUM(total_price),0) as rev, COUNT(*) as cnt FROM orders WHERE user_id = ? AND status='completed'", [userId]);
            totalRevenue = rev[0].rev;
            completedOrders = rev[0].cnt;
        } catch(e) {}
        try {
            const [all] = await db.execute("SELECT COUNT(*) as cnt FROM orders WHERE user_id = ?", [userId]);
            totalOrders = all[0].cnt;
        } catch(e) {}
        try {
            const [pend] = await db.execute("SELECT COUNT(*) as cnt FROM orders WHERE user_id = ? AND status='pending'", [userId]);
            pendingOrders = pend[0].cnt;
        } catch(e) {}

        res.render('admin/statistics', {
            title: 'Statistik',
            layout: './layouts/admin',
            total_revenue: totalRevenue,
            total_orders: totalOrders,
            completed_orders: completedOrders,
            pending_orders: pendingOrders,
            user: req.session.user || res.locals.user
        });
    } catch (err) {
        console.error(err.message);
        res.render('admin/statistics', { title: 'Statistik', layout: './layouts/admin', total_revenue: 0, total_orders: 0, completed_orders: 0, pending_orders: 0, user: req.session.user || res.locals.user });
    }
};

// ===================== WITHDRAWAL =====================
exports.getWithdrawal = async (req, res) => {
    try {
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);

        let balance = 0;
        try {
            const [rev] = await db.execute("SELECT COALESCE(SUM(total_price),0) as r FROM orders WHERE user_id = ? AND status='completed'", [userId]);
            const [wd] = await db.execute("SELECT COALESCE(SUM(amount),0) as w FROM withdrawals WHERE user_id = ? AND status IN ('completed','pending')", [userId]);
            balance = parseFloat(rev[0].r) - parseFloat(wd[0].w);
        } catch(e) {}

        let withdrawals = [];
        try {
            const [rows] = await db.execute('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY id DESC', [userId]);
            withdrawals = rows;
        } catch(e) {}

        res.render('admin/withdrawal', {
            title: 'Tarik Dana',
            layout: './layouts/admin',
            balance,
            withdrawals,
            user: req.session.user || res.locals.user
        });
    } catch (err) {
        console.error(err.message);
        res.render('admin/withdrawal', { title: 'Tarik Dana', layout: './layouts/admin', balance: 0, withdrawals: [], user: req.session.user || res.locals.user });
    }
};

exports.requestWithdrawal = async (req, res) => {
    try {
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);
        const { amount, bank_name, account_number, account_name } = req.body;
        await db.execute(
            'INSERT INTO withdrawals (user_id, amount, bank_name, account_number, account_name, status) VALUES (?,?,?,?,?,?)',
            [userId, amount, bank_name, account_number, account_name, 'pending']
        );
        res.redirect('/admin/withdrawal');
    } catch (err) {
        console.error(err.message);
        res.redirect('/admin/withdrawal');
    }
};

// ===================== GUIDES =====================
exports.getGuides = async (req, res) => {
    try {
        let guides = [];
        try {
            const [rows] = await db.execute('SELECT * FROM guides ORDER BY id DESC');
            guides = rows;
        } catch(e) {}
        res.render('admin/guides', { title: 'Pusat Panduan', layout: './layouts/admin', guides, user: req.session.user || res.locals.user });
    } catch (err) {
        res.render('admin/guides', { title: 'Pusat Panduan', layout: './layouts/admin', guides: [], user: req.session.user || res.locals.user });
    }
};

// ===================== USERS (Admin) =====================
exports.getUsers = async (req, res) => {
    try {
        const [users] = await db.execute('SELECT * FROM users ORDER BY id DESC');
        res.render('admin/users', { title: 'Manajemen User', layout: './layouts/admin', users, user: req.session.user || res.locals.user });
    } catch (err) {
        console.error(err.message);
        res.render('admin/users', { title: 'Manajemen User', layout: './layouts/admin', users: [], user: req.session.user || res.locals.user });
    }
};

// ===================== GLOBAL ANALYTICS =====================
exports.getGlobalAnalytics = async (req, res) => {
    const defaults = { title: 'Analisa Global', layout: './layouts/admin', customer_count: 0, total_income: 0, total_orders: 0, total_products: 0, platform_income: 0, dana_mengendap: 0, total_wd: 0, pending_payouts: 0, stock_alerts: 0, chartData: [], user: req.session.user || res.locals.user };
    try {
        let customer_count = 0, total_income = 0, total_orders = 0, total_products = 0;
        let platform_income = 0, dana_mengendap = 0, total_wd = 0, pending_payouts = 0, stock_alerts = 0;
        let chartData = [];

        try { const [r] = await db.execute("SELECT COUNT(*) as c FROM users"); customer_count = r[0].c; } catch(e) {}
        try { const [r] = await db.execute("SELECT COALESCE(SUM(total_price),0) as c FROM orders WHERE status='completed'"); total_income = r[0].c; } catch(e) {}
        try { const [r] = await db.execute("SELECT COUNT(*) as c FROM orders"); total_orders = r[0].c; } catch(e) {}
        try { const [r] = await db.execute("SELECT COUNT(*) as c FROM products"); total_products = r[0].c; } catch(e) {}

        // WD totals
        try { const [r] = await db.execute("SELECT COALESCE(SUM(amount),0) as c FROM withdrawals WHERE status='completed'"); total_wd = r[0].c; } catch(e) {}
        try { const [r] = await db.execute("SELECT COALESCE(SUM(amount),0) as c FROM withdrawals WHERE status='pending'"); pending_payouts = r[0].c; } catch(e) {}

        // Stock alerts (products with stock = 0)
        try { const [r] = await db.execute("SELECT COUNT(*) as c FROM products WHERE stock = 0"); stock_alerts = r[0].c; } catch(e) {}

        // 7-day chart
        try {
            const [rows] = await db.execute("SELECT DATE(created_at) as date, COUNT(*) as orders, COALESCE(SUM(total_price),0) as revenue FROM orders WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) GROUP BY DATE(created_at) ORDER BY date ASC");
            chartData = rows;
        } catch(e) {}

        res.render('admin/analytics', {
            ...defaults,
            customer_count, total_income, total_orders, total_products,
            platform_income, dana_mengendap, total_wd, pending_payouts, stock_alerts,
            chartData
        });
    } catch (err) {
        console.error(err.message);
        res.render('admin/analytics', defaults);
    }
};

// ===================== WITHDRAWAL QUEUE =====================
exports.getWithdrawalQueue = async (req, res) => {
    try {
        const [withdrawals] = await db.execute(
            `SELECT w.*, u.name as user_name, u.email as user_email 
             FROM withdrawals w 
             LEFT JOIN users u ON w.user_id = u.id 
             ORDER BY w.id DESC`
        );
        res.render('admin/withdrawal-queue', {
            title: 'WD Antrian',
            layout: './layouts/admin',
            withdrawals,
            user: req.session.user || res.locals.user
        });
    } catch (err) {
        console.error(err.message);
        res.render('admin/withdrawal-queue', { title: 'WD Antrian', layout: './layouts/admin', withdrawals: [], user: req.session.user || res.locals.user });
    }
};

exports.approveWD = async (req, res) => {
    try {
        await db.execute("UPDATE withdrawals SET status = 'completed' WHERE id = ?", [req.params.id]);
        res.redirect('/admin/withdrawal-queue');
    } catch (err) {
        console.error(err.message);
        res.redirect('/admin/withdrawal-queue');
    }
};

exports.rejectWD = async (req, res) => {
    try {
        await db.execute("UPDATE withdrawals SET status = 'rejected' WHERE id = ?", [req.params.id]);
        res.redirect('/admin/withdrawal-queue');
    } catch (err) {
        console.error(err.message);
        res.redirect('/admin/withdrawal-queue');
    }
};

// ===================== FEATURE FLAGS =====================
exports.getFeatureControl = async (req, res) => {
    try {
        let features = [];
        try {
            const [rows] = await db.execute('SELECT * FROM feature_flags ORDER BY id DESC');
            features = rows;
        } catch(e) {}
        res.render('admin/features', {
            title: 'Kontrol Fitur',
            layout: './layouts/admin',
            features,
            user: req.session.user || res.locals.user
        });
    } catch (err) {
        res.render('admin/features', { title: 'Kontrol Fitur', layout: './layouts/admin', features: [], user: req.session.user || res.locals.user });
    }
};

exports.toggleFeature = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.execute('SELECT * FROM feature_flags WHERE id = ?', [id]);
        if (rows.length > 0) {
            const newVal = rows[0].is_enabled ? 0 : 1;
            await db.execute('UPDATE feature_flags SET is_enabled = ? WHERE id = ?', [newVal, id]);
        }
        res.redirect('/admin/features');
    } catch (err) {
        console.error(err.message);
        res.redirect('/admin/features');
    }
};

exports.createFeature = async (req, res) => {
    try {
        const { flag_key, description } = req.body;
        await db.execute('INSERT INTO feature_flags (flag_key, description, is_enabled) VALUES (?,?,?)', [flag_key, description, 0]);
        res.redirect('/admin/features');
    } catch (err) {
        console.error(err.message);
        res.redirect('/admin/features');
    }
};

exports.deleteFeature = async (req, res) => {
    try {
        await db.execute('DELETE FROM feature_flags WHERE id = ?', [req.params.id]);
        res.redirect('/admin/features');
    } catch (err) {
        console.error(err.message);
        res.redirect('/admin/features');
    }
};

// ===================== SETTINGS =====================
exports.getSettings = async (req, res) => {
    try {
        const [rows] = await db.execute("SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE 'smtp_%'");
        const smtp = {};
        rows.forEach(r => { smtp[r.setting_key] = r.setting_value; });

        res.render('admin/settings', { 
            title: 'Pengaturan', 
            layout: './layouts/admin', 
            user: req.session.user || res.locals.user,
            smtp: smtp
        });
    } catch (err) {
        res.render('admin/settings', { title: 'Pengaturan', layout: './layouts/admin', user: req.session.user || res.locals.user, smtp: {} });
    }
};

exports.updateSMTPSettings = async (req, res) => {
    try {
        const { smtp_host, smtp_port, smtp_user, smtp_pass } = req.body;
        const keys = { smtp_host, smtp_port, smtp_user, smtp_pass };

        for (const [key, val] of Object.entries(keys)) {
            await db.execute(
                "INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?",
                [key, val, val]
            );
        }
        res.redirect('/admin/settings?tab=smtp&success=true');
    } catch (err) {
        console.error('SMTP update error:', err.message);
        res.redirect('/admin/settings?tab=smtp&error=true');
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { name, phone, bio } = req.body;
        const userId = req.session.userId || (req.session.user ? req.session.user.id : null);
        if (!userId) return res.redirect('/admin/settings');

        let photoUpdate = '';
        let params = [name, phone || '', bio || ''];

        if (req.file) {
            const photoPath = '/uploads/profiles/' + req.file.filename;
            photoUpdate = ', profile_photo = ?';
            params.push(photoPath);
            if (req.session.user) req.session.user.profile_photo = photoPath;
        }

        params.push(userId);
        const query = `UPDATE users SET fullname = ?, phone = ?, bio = ? ${photoUpdate} WHERE id = ?`;
        
        try {
            await db.execute(query, params);
        } catch(e) {
            if (e.message.includes('Unknown column \'profile_photo\'')) {
                await db.execute('ALTER TABLE users ADD COLUMN profile_photo VARCHAR(255) DEFAULT NULL');
                await db.execute(query, params);
            } else if (e.message.includes('Unknown column \'phone\'')) {
                await db.execute('ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT NULL');
                await db.execute(query, params);
            } else if (e.message.includes('Unknown column \'bio\'')) {
                await db.execute('ALTER TABLE users ADD COLUMN bio TEXT DEFAULT NULL');
                await db.execute(query, params);
            } else throw e;
        }

        if (req.session.user) {
            req.session.user.fullname = name;
            req.session.user.phone = phone;
            req.session.user.bio = bio;
        }
        res.redirect('/admin/settings?tab=profil&success=1');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/settings?error=1');
    }
};

exports.updateStoreSettings = async (req, res) => {
    try {
        const { theme_color, profile_box_color } = req.body;
        const userId = req.session.userId || (req.session.user ? req.session.user.id : null);
        if (!userId) return res.redirect('/admin/settings');

        const query = 'UPDATE users SET theme_color = ?, profile_box_color = ? WHERE id = ?';
        const params = [theme_color || '#10b981', profile_box_color || '#ffffff', userId];

        try {
            await db.execute(query, params);
        } catch(e) {
            if (e.message.includes('Unknown column \'theme_color\'')) {
                await db.execute('ALTER TABLE users ADD COLUMN theme_color VARCHAR(20) DEFAULT "#10b981"');
                await db.execute('ALTER TABLE users ADD COLUMN profile_box_color VARCHAR(20) DEFAULT "#ffffff"');
                await db.execute(query, params);
            } else if (e.message.includes('Unknown column \'profile_box_color\'')) {
                await db.execute('ALTER TABLE users ADD COLUMN profile_box_color VARCHAR(20) DEFAULT "#ffffff"');
                await db.execute(query, params);
            } else throw e;
        }

        if (req.session.user) {
            req.session.user.theme_color = theme_color;
            req.session.user.profile_box_color = profile_box_color;
        }
        res.redirect('/admin/settings?tab=toko&success=1');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/settings?error=1');
    }
};

exports.updateIpaymuSettings = async (req, res) => {
    try {
        const { ipaymu_sandbox, ipaymu_expiry } = req.body;
        const userId = req.session.userId || (req.session.user ? req.session.user.id : null);
        if (!userId) return res.redirect('/admin/settings');

        const query = 'UPDATE users SET ipaymu_sandbox = ?, ipaymu_expiry = ? WHERE id = ?';
        const params = [ipaymu_sandbox || 0, ipaymu_expiry || 60, userId];

        try {
            await db.execute(query, params);
        } catch(e) {
            if (e.message.includes('Unknown column')) {
                await db.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS ipaymu_sandbox TINYINT(1) DEFAULT 1');
                await db.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS ipaymu_expiry INT DEFAULT 60');
                await db.execute(query.replace(/IF NOT EXISTS /g, ''), params);
            } else throw e;
        }

        if (req.session.user) {
            req.session.user.ipaymu_sandbox = ipaymu_sandbox;
            req.session.user.ipaymu_expiry = ipaymu_expiry;
        }
        res.redirect('/admin/settings?tab=ipaymu&success=1');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/settings?error=1');
    }
};

exports.uploadProfilePhoto = async (req, res) => {
    // This is now integrated into updateProfile
    res.redirect('/admin/settings');
};

// ===================== AFFILIATE =====================
exports.getAffiliate = async (req, res) => {
    try {
        res.render('admin/affiliate', {
            title: 'Affiliate',
            layout: './layouts/admin',
            user: req.session.user || res.locals.user,
            affiliateLink: 'https://lingku.xyz/ref/bangjos'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
};

// ===================== DEV TOOLS (LOCAL ONLY) =====================
exports.autoDeploy = (req, res) => {
    // Safety check: Only allow if hostname is localhost
    if (req.hostname !== 'localhost' && req.hostname !== '127.0.0.1') {
        return res.status(403).json({ success: false, message: 'Fitur ini hanya untuk Local Dev!' });
    }

    console.log('--- AUTO DEPLOY STARTED ---');
    
    // 1. Check if there are any changes first
    exec('git status --porcelain', (err, stdout) => {
        if (!stdout.trim()) {
            return res.json({ success: true, message: 'Kodingan di Local sudah paling update (Nothing to push).' });
        }

        const commitMsg = `Auto Deploy: ${new Date().toLocaleString()}`;
        const command = `git add . && git commit -m "${commitMsg}" && git push origin master`;
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Git Error: ${stderr || error.message}`);
                return res.json({ success: false, message: stderr || error.message });
            }
            res.json({ success: true, message: 'Kodingan berhasil diterbangkan ke Live!', log: stdout });
        });
    });
};
