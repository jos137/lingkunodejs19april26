const db = require('../config/db');
const axios = require('axios');
const crypto = require('crypto');
const { exec } = require('child_process');
const { sendAccessEmail, sendFollowUpEmail, sendReplyNotificationEmail } = require('../utils/mailer');

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
        const query = `UPDATE products SET 
            name = ?, description = ?, price = ?, stock = ?, download_url = ?, 
            normal_price = ?, promo_enabled = ?, promo_duration = ?, 
            min_price = ?, sale_start_date = ?, sale_start_time = ?, 
            sale_end_date = ?, sale_end_time = ?, show_forever = ?,
            is_affiliate = ?, commission_percent = ?, product_type = ?
            ${thumbUpdate} WHERE id = ?`;
            
        params.push(req.body.is_affiliate === 'on' ? 1 : 0);
        params.push(req.body.commission_percent || 20);
        params.push(req.body.type || 'digital');
        params.push(req.params.id);

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
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS show_forever TINYINT(1) DEFAULT 0',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS is_affiliate TINYINT(1) DEFAULT 1',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS commission_percent DECIMAL(5,2) DEFAULT 20.00'
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
            user_id, name, description, price, stock, product_type, download_url, 
            normal_price, promo_enabled, promo_duration, min_price, 
            sale_start_date, sale_start_time, sale_end_date, sale_end_time, 
            show_forever, is_affiliate, commission_percent, thumbnail
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

        const params = [
            userId, name, description || '', price || 0, stock || 999, type || 'digital', 
            download_url || '', normal_price || null, promo_enabled === 'on' ? 1 : 0, 
            promo_duration || 0, min_price || null, sale_start_date || null, 
            sale_start_time || null, sale_end_date || null, sale_end_time || null, 
            show_forever === 'on' ? 1 : 0, req.body.is_affiliate === 'on' ? 1 : 0, 
            req.body.commission_percent || 20, thumbnail
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
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS show_forever TINYINT(1) DEFAULT 0',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS is_affiliate TINYINT(1) DEFAULT 1',
                    'ALTER TABLE products ADD COLUMN IF NOT EXISTS commission_percent DECIMAL(5,2) DEFAULT 20.00'
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
            await db.execute("SELECT id FROM email_logs LIMIT 1");
        } catch (e) {
            await db.execute(`
                CREATE TABLE IF NOT EXISTS email_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    order_id INT NOT NULL,
                    event_name VARCHAR(50) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        }

        // Auto-Heal Orders table columns if missing
        try {
            const [oCols] = await db.execute("SHOW COLUMNS FROM orders LIKE 'user_id'");
            if (oCols.length === 0) {
                const addCols = [
                    'ALTER TABLE orders ADD COLUMN user_id INT',
                    'ALTER TABLE orders ADD COLUMN reference_id VARCHAR(100)',
                    'ALTER TABLE orders ADD COLUMN customer_name VARCHAR(255)',
                    'ALTER TABLE orders ADD COLUMN customer_email VARCHAR(255)',
                    'ALTER TABLE orders ADD COLUMN customer_whatsapp VARCHAR(50)',
                    'ALTER TABLE orders ADD COLUMN total_price DECIMAL(15,2)',
                    'ALTER TABLE orders ADD COLUMN payment_channel VARCHAR(50)',
                    'ALTER TABLE orders ADD COLUMN customer_ip VARCHAR(50)'
                ];
                for (let sql of addCols) { try { await db.execute(sql); } catch(err) {} }
            }
        } catch (e) {}

        // Auto-Heal: Ensure all possible product image columns exist to avoid SQL crashes
        const colsToHeal = [
            'thumbnail VARCHAR(255) DEFAULT NULL',
            'image_url TEXT DEFAULT NULL',
            'image_small VARCHAR(255) DEFAULT NULL',
            'cover_image VARCHAR(255) DEFAULT NULL',
            'photo VARCHAR(255) DEFAULT NULL'
        ];
        for (const colDef of colsToHeal) {
            const colName = colDef.split(' ')[0];
            try {
                await db.execute(`SELECT ${colName} FROM products LIMIT 1`);
            } catch (e) {
                if (e.message.includes('Unknown column')) {
                    try { await db.execute(`ALTER TABLE products ADD COLUMN ${colDef}`); } catch(err) {}
                }
            }
        }

        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        // Auto-expire pending orders for THIS MERCHANT
        let expiryMins = 15;
        try {
            const [userRows] = await db.execute('SELECT ipaymu_expiry FROM users WHERE id = ?', [userId]);
            if (userRows.length > 0) expiryMins = parseInt(userRows[0].ipaymu_expiry) || 15;
            
            // Independent Timer Logic: Check each order's created_at against its seller's expiry
            const [expiredOrders] = await db.execute(`
                SELECT id, product_id 
                FROM orders 
                WHERE status = 'pending' 
                AND user_id = ? 
                AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
            `, [userId, expiryMins]);

            if (expiredOrders.length > 0) {
                // Update status to expired
                await db.execute(`
                    UPDATE orders 
                    SET status = 'expired' 
                    WHERE status = 'pending' 
                    AND user_id = ? 
                    AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
                `, [userId, expiryMins]);

                // Restore stock
                const productCounts = {};
                expiredOrders.forEach(o => {
                    productCounts[o.product_id] = (productCounts[o.product_id] || 0) + 1;
                });
                
                for (let pid in productCounts) {
                    await db.execute('UPDATE products SET stock = stock + ? WHERE id = ? AND stock >= 0', [productCounts[pid], pid]);
                }
            }
        } catch(e) { console.error('Auto-expire err:', e.message); }

        // Get total count for pagination
        const [countRow] = await db.execute('SELECT COUNT(*) as total FROM orders WHERE user_id = ?', [userId]);
        const totalItems = countRow[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // Safe query for Hostinger & Local DB
        const [orders] = await db.execute(
            `SELECT o.*, 
                    COALESCE(o.status, 'pending') as status,
                    COALESCE(p.name, 'Produk Tidak Terdeteksi') as product_name, 
                    p.price as product_price, 
                    p.thumbnail, p.image_url, p.image_small, p.cover_image, p.photo,
                    p.access_link,
                    (SELECT MAX(created_at) FROM email_logs WHERE order_id = o.id AND event_name = 'Delivered') as delivered_at,
                    (SELECT MAX(created_at) FROM email_logs WHERE order_id = o.id AND event_name IN ('Opened', 'Clicked')) as last_opened_at
             FROM orders o
             LEFT JOIN products p ON o.product_id = p.id
             WHERE o.user_id = ?
             ORDER BY o.id DESC
             LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );

        // Clean up data (handle multiple image columns and JSON prefixing)
        const cleanedOrders = orders.map(o => {
            // Find the first non-empty image column
            let thumb = o.thumbnail || o.image_url || o.image_small || o.cover_image || o.photo || '';
            // Handle JSON Array format
            if (typeof thumb === 'string' && thumb.startsWith('[')) {
                try {
                    const arr = JSON.parse(thumb);
                    if (Array.isArray(arr) && arr.length > 0) thumb = arr[0];
                } catch(e) {}
            }
            
            // Add path prefix if not an absolute URL
            if (thumb && !thumb.startsWith('http') && !thumb.startsWith('/')) {
                thumb = '/uploads/products/' + thumb;
            }

            // PRE-CALCULATE TIME LEFT FOR TIMER
            const createdAt = new Date(o.created_at);
            const expiryDate = new Date(createdAt.getTime() + (expiryMins * 60000));
            const timeLeft = Math.floor((expiryDate - new Date()) / 1000);
            
            return { 
                ...o, 
                product_thumbnail: thumb, 
                time_left: timeLeft,
                is_sent: !!o.delivered_at,
                is_opened: !!o.last_opened_at
            };
        });

        res.render('admin/orders', {
            title: 'Pesanan',
            layout: './layouts/admin',
            user: req.session.user || res.locals.user,
            orders: cleanedOrders,
            currentPage: page,
            totalPages: totalPages,
            merchantUsername: req.session.user ? req.session.user.username : "",
            expiryMins: expiryMins
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
        const filterDate = req.query.date || new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).split(' ')[0];

        // Overall Stats (All Time)
        const [overall] = await db.execute(`
            SELECT 
                COALESCE(SUM(CASE WHEN o.status='completed' THEN o.total_price ELSE 0 END), 0) as total_rev,
                COUNT(o.id) as total_cnt,
                SUM(CASE WHEN o.status='completed' THEN 1 ELSE 0 END) as comp_cnt,
                SUM(CASE WHEN o.status='pending' THEN 1 ELSE 0 END) as pend_cnt
            FROM orders o
            JOIN products p ON o.product_id = p.id
            WHERE p.user_id = ?
        `, [userId]);

        const o = overall[0];

        // Filtered Stats for Chart (Specific Date)
        const [filtered] = await db.execute(`
            SELECT 
                SUM(CASE WHEN o.status='completed' THEN 1 ELSE 0 END) as comp,
                SUM(CASE WHEN o.status='pending' THEN 1 ELSE 0 END) as pend,
                SUM(CASE WHEN o.status='completed' THEN o.total_price ELSE 0 END) as daily_rev
            FROM orders o
            JOIN products p ON o.product_id = p.id
            WHERE p.user_id = ? AND DATE(CONVERT_TZ(o.created_at, '+00:00', '+07:00')) = ?
        `, [userId, filterDate]);

        const f = filtered[0];

        // Best Sellers for this Seller (All Time)
        const [bestSellers] = await db.execute(`
            SELECT p.name, COUNT(o.id) as total_sold, SUM(o.total_price) as revenue
            FROM orders o
            JOIN products p ON o.product_id = p.id
            WHERE p.user_id = ? AND o.status = 'completed'
            GROUP BY p.id
            ORDER BY total_sold DESC
            LIMIT 5
        `, [userId]);

        res.render('admin/statistics', {
            title: 'Statistik',
            layout: './layouts/admin',
            total_revenue: o.total_rev,
            total_orders: o.total_cnt,
            completed_orders: o.comp_cnt,
            pending_orders: o.pend_cnt,
            chartData: {
                completed: f.comp || 0,
                pending: f.pend || 0,
                daily_revenue: f.daily_rev || 0,
                date: filterDate
            },
            bestSellers,
            user: req.session.user || res.locals.user
        });
    } catch (err) {
        console.error('Stats Error:', err.message);
        res.render('admin/statistics', { title: 'Statistik', layout: './layouts/admin', total_revenue: 0, total_orders: 0, completed_orders: 0, pending_orders: 0, chartData: {completed:0, pending:0, date:''}, bestSellers: [], user: req.session.user || res.locals.user });
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

        // Affiliate Commission Calculation
        let affiliate_commission = 0;
        try {
            const [commStats] = await db.execute(`
                SELECT 
                    COALESCE(SUM(o.total_price * (p.commission_percent / 100)), 0) as total_commissions
                FROM orders o
                JOIN products p ON o.product_id = p.id
                JOIN users u ON o.user_id = u.id
                WHERE o.status = 'completed' AND u.referred_by = ?
            `, [userId]);
            affiliate_commission = parseFloat(commStats[0].total_commissions);
        } catch(e) {
            console.error('Affiliate Commission Calc Error:', e);
        }

        // Fresh User Data for Plan
        try {
            const [uCols] = await db.execute("SHOW COLUMNS FROM users LIKE 'plan'");
            if (uCols.length === 0) await db.execute('ALTER TABLE users ADD COLUMN plan VARCHAR(20) DEFAULT "free"');
            
            const [wCols] = await db.execute("SHOW COLUMNS FROM withdrawals LIKE 'fee_amount'");
            if (wCols.length === 0) {
                await db.execute('ALTER TABLE withdrawals ADD COLUMN fee_amount DECIMAL(15,2) DEFAULT 0');
                await db.execute('ALTER TABLE withdrawals ADD COLUMN net_amount DECIMAL(15,2) DEFAULT 0');
            }
        } catch(e) {}
        
        const [uRowsFresh] = await db.execute("SELECT * FROM users WHERE id = ?", [userId]);
        const freshUser = uRowsFresh[0] || req.session.user;

        res.render('admin/withdrawal', {
            title: 'Tarik Dana',
            layout: './layouts/admin',
            balance,
            affiliate_commission,
            withdrawals,
            user: freshUser
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
        const requestedAmount = parseFloat(amount);

        // 1. Auto-Heal & Get User Info (Plan)
        try {
            const [cols] = await db.execute("SHOW COLUMNS FROM users LIKE 'plan'");
            if (cols.length === 0) await db.execute('ALTER TABLE users ADD COLUMN plan VARCHAR(20) DEFAULT "free"');
        } catch(e) {}

        const [userRows] = await db.execute("SELECT plan, fullname FROM users WHERE id = ?", [userId]);
        const user = userRows[0];
        const plan = user.plan || 'free';

        // 2. Calculate Balance
        const [rev] = await db.execute("SELECT COALESCE(SUM(total_price),0) as r FROM orders WHERE user_id = ? AND status='completed'", [userId]);
        const [wd] = await db.execute("SELECT COALESCE(SUM(amount),0) as w FROM withdrawals WHERE user_id = ? AND status IN ('completed','pending')", [userId]);
        const balance = parseFloat(rev[0].r) - parseFloat(wd[0].w);

        if (requestedAmount > balance) {
            return res.redirect('/admin/withdrawal?error=' + encodeURIComponent('Saldo tidak mencukupi.'));
        }

        // 3. Apply PRO / FREE Rules (Updated Strategy - Dynamic from DB)
        const [feeSettings] = await db.execute("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('fee_free', 'fee_pro')");
        const fees = {};
        feeSettings.forEach(s => fees[s.setting_key] = s.setting_value);
        
        const minWd = 100000; // Minimal 100rb for everyone
        const feePercent = plan === 'pro' ? parseFloat(fees.fee_pro || 1) : parseFloat(fees.fee_free || 3);

        if (requestedAmount < minWd) {
            return res.redirect('/admin/withdrawal?error=' + encodeURIComponent(`Minimal penarikan dana adalah Rp ${minWd.toLocaleString('id-ID')}. Kumpulkan saldo Anda dulu ya!`));
        }

        const feeAmount = (feePercent / 100) * requestedAmount;
        const finalAmount = requestedAmount - feeAmount;

        // 4. Ensure Withdrawal columns exist before insert
        try {
            const [wCols] = await db.execute("SHOW COLUMNS FROM withdrawals LIKE 'fee_amount'");
            if (wCols.length === 0) {
                await db.execute('ALTER TABLE withdrawals ADD COLUMN fee_amount DECIMAL(15,2) DEFAULT 0');
                await db.execute('ALTER TABLE withdrawals ADD COLUMN net_amount DECIMAL(15,2) DEFAULT 0');
            }
        } catch(e) {}

        // 5. Save Withdrawal
        await db.execute(
            'INSERT INTO withdrawals (user_id, amount, fee_amount, net_amount, bank_name, account_number, account_name, status) VALUES (?,?,?,?,?,?,?,?)',
            [userId, requestedAmount, feeAmount, finalAmount, bank_name, account_number, account_name, 'pending']
        );

        // Notify Admin
        try {
            const requesterName = user.fullname || 'User';
            await db.execute(
                "INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)",
                [1, '🚀 WD ' + plan.toUpperCase() + ' Masuk', `${requesterName} meminta Rp ${requestedAmount.toLocaleString('id-ID')} (Potongan ${feePercent}%)`, 'withdrawal', '/admin/withdrawal-queue']
            );
        } catch (notifErr) { console.error('Notif Error:', notifErr.message); }

        res.redirect(`/admin/withdrawal?success=true&amount=${requestedAmount}`);
    } catch (err) {
        console.error('Withdrawal Request Error:', err.message);
        res.redirect('/admin/withdrawal');
    }
};

// ===================== GUIDES =====================
exports.getGuides = async (req, res) => {
    try {
        // Auto-Heal: Ensure guides table exists and has correct columns
        try {
            await db.execute('SELECT description, icon, icon_bg, icon_color, link FROM guides LIMIT 1');
        } catch (e) {
            // If table doesn't exist, create it
            if (e.message.includes("doesn't exist")) {
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS guides (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        title VARCHAR(255) NOT NULL,
                        description TEXT,
                        icon VARCHAR(50) DEFAULT 'fa-rocket',
                        icon_bg VARCHAR(20) DEFAULT '#f0fdf4',
                        icon_color VARCHAR(20) DEFAULT '#10b981',
                        link VARCHAR(255),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
            } else if (e.message.includes("Unknown column")) {
                // If table exists but columns are missing, add them
                const cols = [
                    'ALTER TABLE guides ADD COLUMN IF NOT EXISTS description TEXT',
                    'ALTER TABLE guides ADD COLUMN IF NOT EXISTS icon VARCHAR(50) DEFAULT "fa-rocket"',
                    'ALTER TABLE guides ADD COLUMN IF NOT EXISTS icon_bg VARCHAR(20) DEFAULT "#f0fdf4"',
                    'ALTER TABLE guides ADD COLUMN IF NOT EXISTS icon_color VARCHAR(20) DEFAULT "#10b981"',
                    'ALTER TABLE guides ADD COLUMN IF NOT EXISTS link VARCHAR(255)'
                ];
                for (let sql of cols) {
                    try { await db.execute(sql.replace('IF NOT EXISTS ', '')); } catch(err) {}
                }
            }
        }

        const [guides] = await db.execute('SELECT * FROM guides ORDER BY id DESC');
        // Fresh User Data for Admin Check
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 0);
        const [uRows] = await db.execute("SELECT * FROM users WHERE id = ?", [userId]);
        const freshUser = uRows[0] || req.session.user || { role: 'user' };

        res.render('admin/guides', { 
            title: 'Pusat Panduan', 
            layout: './layouts/admin', 
            guides, 
            user: freshUser 
        });
    } catch (err) {
        console.error('Guides Error:', err.message);
        res.render('admin/guides', { title: 'Pusat Panduan', layout: './layouts/admin', guides: [], user: req.session.user || res.locals.user });
    }
};

exports.addGuide = async (req, res) => {
    try {
        const { title, description, icon, icon_bg, icon_color, link } = req.body;
        await db.execute(
            'INSERT INTO guides (title, description, icon, icon_bg, icon_color, link) VALUES (?, ?, ?, ?, ?, ?)',
            [title, description, icon || 'fa-rocket', icon_bg || '#f0fdf4', icon_color || '#10b981', link || '#']
        );
        res.redirect('/admin/guides?success=1');
    } catch (err) {
        res.redirect('/admin/guides?error=' + encodeURIComponent(err.message));
    }
};

exports.deleteGuide = async (req, res) => {
    try {
        const { id } = req.params;
        await db.execute('DELETE FROM guides WHERE id = ?', [id]);
        res.redirect('/admin/guides?deleted=1');
    } catch (err) {
        res.redirect('/admin/guides?error=' + encodeURIComponent(err.message));
    }
};

// ===================== USERS (Admin) =====================
exports.getUsers = async (req, res) => {
    try {
        const [users] = await db.execute('SELECT * FROM users ORDER BY id DESC');
        res.render('admin/users', { 
            title: 'Manajemen User', 
            layout: './layouts/admin', 
            users, 
            user: req.session.user || res.locals.user 
        });
    } catch (err) {
        console.error(err.message);
        res.render('admin/users', { title: 'Manajemen User', layout: './layouts/admin', users: [], user: req.session.user || res.locals.user });
    }
};

exports.getUserBuyers = async (req, res) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page) || 1;
        const status = req.query.status || 'all';
        const limit = 10;
        const offset = (page - 1) * limit;
        
        // Fetch target user info
        const [uRows] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
        if (uRows.length === 0) return res.redirect('/admin/users');
        const targetUser = uRows[0];

        // Build filtering query
        let query = `
            FROM orders o
            JOIN products p ON o.product_id = p.id
            WHERE p.user_id = ?
        `;
        let params = [id];

        if (status !== 'all') {
            query += ` AND o.status = ?`;
            params.push(status);
        }

        // Count total for pagination
        const [countRow] = await db.execute(`SELECT COUNT(*) as total ${query}`, params);
        const totalItems = countRow[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // Fetch paginated orders
        const [orders] = await db.execute(`
            SELECT o.*, p.name as product_name
            ${query}
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        const pageTitle = targetUser.name || targetUser.username || targetUser.email || 'User';

        res.render('admin/user-detail', { 
            title: 'Member',
            layout: './layouts/admin',
            targetUser,
            orders,
            currentPage: page,
            totalPages,
            currentStatus: status,
            totalItems,
            user: req.session.user || res.locals.user
        });
    } catch (err) {
        console.error('User Detail Error:', err.message);
        res.redirect('/admin/users');
    }
};

exports.updateUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        
        // Safety check
        if (!['user', 'pro', 'admin'].includes(role)) {
            return res.status(400).json({ success: false, message: 'Role tidak valid' });
        }

        // To keep it consistent with the UI (Paket column & Badge), 
        // we update both 'role' and 'plan' columns.
        const planValue = (role === 'pro') ? 'pro' : 'free';
        await db.execute('UPDATE users SET role = ?, plan = ? WHERE id = ?', [role, planValue, id]);
        
        // Update current session if the admin is updating themselves
        if (req.session.user && req.session.user.id == id) {
            req.session.user.role = role;
            req.session.user.plan = planValue;
        }

        res.json({ success: true, newRole: role, newPlan: planValue });
    } catch (err) {
        console.error('Update Role Error:', err);
        res.status(500).json({ success: false, message: err.message });
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

        // 7-day chart (Fixed for GMT+7 WIB)
        try {
            const [rows] = await db.execute("SELECT DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) as date, COUNT(*) as orders, COALESCE(SUM(total_price),0) as revenue FROM orders WHERE CONVERT_TZ(created_at, '+00:00', '+07:00') >= DATE_SUB(DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00')), INTERVAL 7 DAY) GROUP BY date ORDER BY date ASC");
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
            `SELECT w.*, u.fullname as user_name, u.email as user_email 
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
            query: req.query,
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
        await db.execute(`
            INSERT INTO feature_flags (feature_key, feature_name, flag_key, description, is_enabled) 
            VALUES (?, ?, ?, ?, ?)`, 
            [flag_key, flag_key, flag_key, description || '', 0]
        );
        res.redirect('/admin/features?success=1');
    } catch (err) {
        console.error('Create Feature Error:', err.message);
        res.redirect('/admin/features?error=' + encodeURIComponent(err.message));
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
        const userId = req.session.userId || (req.session.user ? req.session.user.id : null);
        
        // Always fetch LATEST user data from DB for settings
        const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
        const user = users.length > 0 ? users[0] : (req.session.user || res.locals.user);

        const [rows] = await db.execute("SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE 'smtp_%' OR setting_key LIKE 'aff_%' OR setting_key LIKE 'fee_%' OR setting_key = 'price_pro'");
        const smtp = {};
        const affiliate = {};
        let fee_free = '3', fee_pro = '1', price_pro = '99000';

        rows.forEach(r => { 
            if (r.setting_key.startsWith('smtp_')) smtp[r.setting_key] = r.setting_value;
            if (r.setting_key.startsWith('aff_')) affiliate[r.setting_key] = r.setting_value;
            if (r.setting_key === 'fee_free') fee_free = r.setting_value;
            if (r.setting_key === 'fee_pro') fee_pro = r.setting_value;
            if (r.setting_key === 'price_pro') price_pro = r.setting_value;
        });

        res.render('admin/settings', { 
            title: 'Pengaturan', 
            layout: './layouts/admin', 
            user: user,
            smtp: smtp,
            affiliate: affiliate,
            fee_free,
            fee_pro,
            price_pro,
            success: req.query.success,
            tab: req.query.tab || 'profil'
        });
    } catch (err) {
        console.error('Get Settings Error:', err);
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

exports.updateFeeSettings = async (req, res) => {
    try {
        const { fee_free, fee_pro, price_pro } = req.body;
        const keys = { fee_free, fee_pro, price_pro };

        for (const [key, val] of Object.entries(keys)) {
            await db.execute(
                "INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?",
                [key, val, val]
            );
        }
        res.redirect('/admin/settings?tab=fee&success=true');
    } catch (err) {
        console.error('Fee update error:', err.message);
        res.redirect('/admin/settings?tab=fee&error=true');
    }
};

exports.updateAffiliateSettings = async (req, res) => {
    try {
        const { aff_commission_percent, aff_cookie_duration } = req.body;
        const keys = { aff_commission_percent, aff_cookie_duration };

        for (const [key, val] of Object.entries(keys)) {
            await db.execute(
                "INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?",
                [key, val || '', val || '']
            );
        }
        res.redirect('/admin/settings?tab=affiliate&success=true');
    } catch (err) {
        console.error('Affiliate settings update error:', err.message);
        res.redirect('/admin/settings?tab=affiliate&error=true');
    }
};

exports.getAffiliate = async (req, res) => {
    try {
        const user = req.session.user || res.locals.user;
        const userId = req.session.userId || (user ? user.id : null);
        if (!userId) return res.redirect('/auth/login');

        // Feature Toggle Check: Only Admin can bypass
        if (user.role !== 'admin' && res.locals.features && !res.locals.features.enable_affiliate) {
            return res.redirect('/admin');
        }

        // 1. Get User Affiliate Info
        const [users] = await db.execute("SELECT affiliate_code FROM users WHERE id = ?", [userId]);
        const affCode = users[0].affiliate_code;

        // 2. Count Total Referrals
        const [referrals] = await db.execute("SELECT COUNT(*) as count FROM users WHERE referred_by = ?", [userId]);
        const totalReferrals = referrals[0].count;

        // 3. Get OWN Products (Affiliate Produk)
        let myProducts = [];
        const myProductsQuery = "SELECT id, name, price, thumbnail, product_type, is_affiliate, commission_percent FROM products WHERE user_id = ? ORDER BY id DESC";
        try {
            const [myProductsRaw] = await db.execute(myProductsQuery, [userId]);
            myProducts = myProductsRaw.map(p => {
                let thumb = p.thumbnail || '';
                if (thumb && thumb.startsWith('[')) { try { thumb = JSON.parse(thumb)[0]; } catch(e) {} }
                return { 
                    ...p, 
                    thumb,
                    commission_value: (p.price * (p.commission_percent || 20)) / 100
                };
            });
        } catch (dbErr) {
            if (dbErr.message.includes('Unknown column')) {
                await db.execute('ALTER TABLE products ADD COLUMN IF NOT EXISTS commission_percent DECIMAL(5,2) DEFAULT 20.00');
                const [myProductsRaw] = await db.execute(myProductsQuery, [userId]);
                myProducts = myProductsRaw.map(p => {
                    let thumb = p.thumbnail || '';
                    if (thumb && thumb.startsWith('[')) { try { thumb = JSON.parse(thumb)[0]; } catch(e) {} }
                    return { 
                        ...p, 
                        thumb,
                        commission_value: (p.price * (p.commission_percent || 20)) / 100
                    };
                });
            } else throw dbErr;
        }

        // 4. Get Commission Settings
        const [settings] = await db.execute("SELECT setting_value FROM settings WHERE setting_key = 'aff_commission_percent'");
        const commPercent = settings.length > 0 ? settings[0].setting_value : '20';

        res.render('admin/affiliate', {
            title: 'Affiliate',
            layout: './layouts/admin',
            user: req.session.user || res.locals.user,
            affCode,
            totalReferrals,
            myProducts,
            commPercent,
            host: req.get('host'),
            protocol: req.protocol
        });
    } catch (err) {
        console.error('Get Affiliate Error:', err);
        res.redirect('/admin');
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
            req.session.user.name = name;
            req.session.user.phone = phone;
            req.session.user.whatsapp = phone;
            req.session.user.bio = bio;
        }
        res.redirect('/admin/settings?tab=profil&success=1');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/settings?error=1');
    }
};

exports.updateAdminTheme = async (req, res) => {
    try {
        const { sidebar_theme } = req.body;
        await db.execute('UPDATE users SET sidebar_theme = ? WHERE id = ?', [sidebar_theme, req.session.user.id]);
        req.session.user.sidebar_theme = sidebar_theme;
        res.redirect('/admin/settings?success=Tema%20Dasbor%20berhasil%20diperbarui');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/settings?error=Gagal%20memperbarui%20tema%20dasbor');
    }
};

exports.updateAnnouncement = async (req, res) => {
    try {
        if (req.session.user.role !== 'admin') return res.redirect('/admin/dashboard');
        const { text_value, color_value } = req.body;
        await db.execute('UPDATE feature_flags SET text_value = ?, color_value = ? WHERE feature_key = "enable_announcement"', [text_value, color_value]);
        res.redirect('/admin/settings?success=Pengumuman%20Global%20berhasil%20diperbarui');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/settings?error=Gagal%20memperbarui%20pengumuman');
    }
};

exports.updateStoreSettings = async (req, res) => {
    try {
        const { theme_color, profile_box_color, show_header, header_type, profile_text_color, name_font_size, bio_font_size } = req.body;
        const userId = req.session.userId || (req.session.user ? req.session.user.id : null);
        if (!userId) return res.redirect('/admin/settings');

        const isShowHeader = show_header === 'on' ? 1 : 0;
        const query = 'UPDATE users SET theme_color = ?, profile_box_color = ?, show_header = ?, header_type = ?, profile_text_color = ?, name_font_size = ?, bio_font_size = ? WHERE id = ?';
        const params = [
            theme_color || '#10b981', 
            profile_box_color || '#ffffff', 
            isShowHeader, 
            header_type || 'rounded', 
            profile_text_color || '#111827',
            parseInt(name_font_size) || 18,
            parseInt(bio_font_size) || 12,
            userId
        ];

        try {
            await db.execute(query, params);
        } catch(e) {
            if (e.message.includes('Unknown column')) {
                const cols = [
                    'ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_color VARCHAR(20) DEFAULT "#10b981"',
                    'ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_box_color VARCHAR(20) DEFAULT "#ffffff"',
                    'ALTER TABLE users ADD COLUMN IF NOT EXISTS show_header TINYINT(1) DEFAULT 1',
                    'ALTER TABLE users ADD COLUMN IF NOT EXISTS header_type VARCHAR(20) DEFAULT "rounded"',
                    'ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_text_color VARCHAR(20) DEFAULT "#111827"',
                    'ALTER TABLE users ADD COLUMN IF NOT EXISTS name_font_size INT DEFAULT 18',
                    'ALTER TABLE users ADD COLUMN IF NOT EXISTS bio_font_size INT DEFAULT 12'
                ];
                for (let sql of cols) {
                    try { await db.execute(sql.replace('IF NOT EXISTS ', '')); } catch(err) {}
                }
                await db.execute(query, params);
            } else throw e;
        }

        if (req.session.user) {
            req.session.user.theme_color = theme_color;
            req.session.user.profile_box_color = profile_box_color;
            req.session.user.show_header = isShowHeader;
            req.session.user.header_type = header_type;
            req.session.user.profile_text_color = profile_text_color;
            req.session.user.name_font_size = name_font_size;
            req.session.user.bio_font_size = bio_font_size;
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

        const sandboxVal = parseInt(ipaymu_sandbox) || 0;
        const expiryVal = parseInt(ipaymu_expiry) || 60;

        const query = 'UPDATE users SET ipaymu_sandbox = ?, ipaymu_expiry = ? WHERE id = ?';
        const params = [sandboxVal, expiryVal, userId];

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

// ===================== ADMIN: MARKETPLACE =====================
exports.getMarketplace = async (req, res) => {
    try {
        const user = req.session.user || res.locals.user;
        
        // Feature Toggle Check: Only Admin can bypass
        if (user.role !== 'admin' && res.locals.features && !res.locals.features.enable_affiliate) {
            return res.redirect('/admin');
        }
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        let whereClause = "WHERE is_affiliate = 1";
        let params = [];

        if (search) {
            whereClause += " AND name LIKE ?";
            params.push(`%${search}%`);
        }

        const [countRow] = await db.execute(`SELECT COUNT(*) as total FROM products ${whereClause}`, params);
        const totalItems = countRow[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        const [products] = await db.execute(
            `SELECT p.*, u.fullname as seller_name, u.slug as seller_slug 
             FROM products p 
             LEFT JOIN users u ON p.user_id = u.id 
             ${whereClause} 
             ORDER BY p.id DESC 
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        const cleanedProducts = products.map(p => {
            let thumb = p.thumbnail || p.image_url || '';
            if (thumb && thumb.startsWith('[')) { try { thumb = JSON.parse(thumb)[0]; } catch(e) {} }
            return { ...p, thumb };
        });

        res.render('admin/marketplace', {
            title: 'Marketplace',
            layout: './layouts/admin',
            products: cleanedProducts,
            pagination: { page, totalPages, totalItems, search },
            user: req.session.user || res.locals.user
        });
    } catch (err) {
        console.error('Marketplace Error:', err);
        res.redirect('/admin');
    }
};

// ===================== ADMIN/USER: AFFILIATE STATS =====================
exports.getAffiliateStats = async (req, res) => {
    try {
        const user = req.session.user || res.locals.user;

        // Feature Toggle Check: Only Admin can bypass
        if (user.role !== 'admin' && res.locals.features && !res.locals.features.enable_affiliate) {
            return res.redirect('/admin');
        }

        const isAdmin = user.role === 'admin';

        if (isAdmin) {
            // GLOBAL STATS for Admin
            const [stats] = await db.execute(`SELECT COUNT(*) as total_affiliates FROM users WHERE role = 'pro' OR role = 'admin'`);
            
            const [commStats] = await db.execute(`
                SELECT 
                    COALESCE(SUM(commission_amount), 0) as total_commissions,
                    COUNT(*) as total_affiliate_orders
                FROM orders 
                WHERE status IN ('paid', 'completed', 'success') AND affiliate_id IS NOT NULL
            `);

            const [topAffiliates] = await db.execute(`
                SELECT u.fullname as partner_name, u.slug, 
                       COUNT(o.id) as total_referrals, 
                       COALESCE(SUM(o.commission_amount), 0) as total_earnings
                FROM users u
                JOIN orders o ON u.id = o.affiliate_id
                WHERE o.status IN ('paid', 'completed', 'success')
                GROUP BY u.id
                ORDER BY total_earnings DESC
                LIMIT 10
            `);

            res.render('admin/affiliate-stats', {
                title: 'Statistik Affiliate',
                layout: './layouts/admin',
                isAdmin: true,
                stats: {
                    total_affiliates: stats[0].total_affiliates,
                    total_commissions: commStats[0].total_commissions,
                    total_affiliate_orders: commStats[0].total_affiliate_orders
                },
                topAffiliates,
                user
            });
        } else {
            // PERSONAL STATS for regular users
            const [commStats] = await db.execute(`
                SELECT 
                    COALESCE(SUM(commission_amount), 0) as total_commissions,
                    COUNT(*) as total_affiliate_orders
                FROM orders 
                WHERE status IN ('paid', 'completed', 'success') AND affiliate_id = ?
            `, [user.id]);

            res.render('admin/affiliate-stats', {
                title: 'Statistik Affiliate Saya',
                layout: './layouts/admin',
                isAdmin: false,
                stats: {
                    total_referrals: commStats[0].total_affiliate_orders, // We use orders as referrals now
                    total_commissions: commStats[0].total_commissions,
                    total_affiliate_orders: commStats[0].total_affiliate_orders
                },
                topAffiliates: [],
                user
            });
        }
    } catch (err) {
        console.error('Affiliate Stats Error:', err);
        res.redirect('/admin');
    }
};

// ===================== DEV TOOLS (LOCAL ONLY) =====================
exports.autoDeploy = async (req, res) => {
    const { exec } = require('child_process');
    try {
        console.log('--- AGGRESSIVE AUTO DEPLOY STARTED ---');
        
        // Langsung hajar: add, commit (abaikan error jika kosong), dan push
        const commitMsg = "Auto-update from Dashboard: " + new Date().toLocaleString();
        const command = `git add . && (git commit -m "${commitMsg}" || true) && git push origin master 2>&1`;
        
        exec(command, { 
            timeout: 180000, // 3 menit
            maxBuffer: 1024 * 1024 * 20 // 20MB buffer
        }, (error, stdout, stderr) => {
            const output = stdout + (stderr || '');
            console.log('Git Output:', output);

            if (error && !output.includes('Everything up-to-date')) {
                console.error(`Git Push Error: ${output}`);
                return res.json({ success: false, message: 'Gagal Push: ' + output });
            }

            console.log('--- AUTO DEPLOY SUCCESS ---');
            res.json({ success: true, message: 'BERHASIL! Perubahan sudah dipaksa push ke Git dan siap ditarik hosting.' });
        });
    } catch (globalErr) {
        console.error('Auto Deploy Global Error:', globalErr);
        res.json({ success: false, message: 'Kesalahan Sistem: ' + globalErr.message });
    }
};

exports.readNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.execute("SELECT link FROM notifications WHERE id = ?", [id]);
        
        await db.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", [id]);
        
        if (rows.length > 0 && rows[0].link) {
            return res.redirect(rows[0].link);
        }
        res.redirect('/admin');
    } catch (err) {
        console.error('Read Notification Error:', err.message);
        res.redirect('/admin');
    }
};

// ===== HELP & BUG REPORTS =====
exports.getHelpCenter = async (req, res) => {
    try {
        const user = req.session.user || res.locals.user;
        
        // Jika Admin, langsung lempar ke halaman list laporan
        if (user && user.role === 'admin') {
            return res.redirect('/admin/reports');
        }

        // Jika User biasa, ambil riwayat laporan miliknya
        let myTickets = [];
        try {
            const [rows] = await db.execute('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC', [user.id || 0]);
            myTickets = rows;
        } catch (dbErr) {
            // Jika tabel belum ada, biarkan kosong (nanti dibuat saat submit pertama kali)
            myTickets = [];
        }

        res.render('admin/help/index', {
            title: 'Pusat Bantuan',
            layout: './layouts/admin',
            user: user,
            query: req.query,
            myTickets
        });
    } catch (err) {
        console.error('Help Center Error:', err);
        res.redirect('/admin');
    }
};

exports.getReportForm = async (req, res) => {
    try {
        const type = req.query.type || 'bug';
        res.render('admin/help/form', {
            title: type === 'bug' ? 'Lapor Bug / Error' : 'Masalah Tarik Dana',
            layout: './layouts/admin',
            user: req.session.user || res.locals.user,
            type
        });
    } catch (err) {
        console.error('Report Form Error:', err);
        res.redirect('/admin/help');
    }
};

exports.submitReport = async (req, res) => {
    try {
        const { type, subject, description } = req.body;
        const userId = req.session.userId || (req.session.user ? req.session.user.id : null);
        const screenshot = req.file ? '/uploads/tickets/' + req.file.filename : null;

        // Validasi input minimal
        if (!type || !subject || !description) {
            return res.redirect('/admin/help?error=' + encodeURIComponent('Mohon isi semua kolom wajib.'));
        }

        try {
            // New logic: Insert into tickets then messages
            const [ticketResult] = await db.execute('INSERT INTO support_tickets (user_id, type, subject) VALUES (?, ?, ?)', [userId || 0, type, subject]);
            const ticketId = ticketResult.insertId;
            await db.execute('INSERT INTO support_messages (ticket_id, sender_id, message, attachment) VALUES (?, ?, ?, ?)', [ticketId, userId || 0, description, screenshot]);
        } catch (dbErr) {
            // Jika tabel belum ada (Auto-Heal)
            if (dbErr.message.includes('Table') && dbErr.message.includes('doesn\'t exist')) {
                // Create support_tickets if not exists
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS support_tickets (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT,
                        type ENUM('bug', 'withdrawal') NOT NULL,
                        subject VARCHAR(255),
                        status ENUM('open', 'resolved') DEFAULT 'open',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                // Create support_messages if not exists
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS support_messages (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        ticket_id INT,
                        sender_id INT,
                        message TEXT,
                        attachment VARCHAR(255),
                        is_admin TINYINT(1) DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                
                const [ticketResult] = await db.execute('INSERT INTO support_tickets (user_id, type, subject) VALUES (?, ?, ?)', [userId || 0, type, subject]);
                const ticketId = ticketResult.insertId;
                await db.execute('INSERT INTO support_messages (ticket_id, sender_id, message, attachment) VALUES (?, ?, ?, ?)', [ticketId, userId || 0, description, screenshot]);
            } else {
                throw dbErr;
            }
        }

        res.redirect('/admin/help?success=1');

        // Notify Admin (User ID 1)
        try {
            const [userRows] = await db.execute("SELECT fullname FROM users WHERE id = ?", [userId || 0]);
            const requesterName = userRows.length > 0 ? userRows[0].fullname : 'User';
            const notifType = type === 'bug' ? 'bug' : 'withdrawal';
            const notifTitle = type === 'bug' ? 'Laporan Bug Baru' : 'Masalah Tarik Dana';
            
            await db.execute(
                "INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)",
                [1, notifTitle, `${requesterName}: ${subject}`, notifType, '/admin/reports']
            );
        } catch (notifErr) {
            console.error('Failed to create ticket notification:', notifErr.message);
        }
    } catch (err) {
        console.error('Submit Report Error:', err);
        // Tangani error khusus dari Multer (File too large)
        let errorMsg = err.message;
        if (err.code === 'LIMIT_FILE_SIZE') {
            errorMsg = 'File terlalu besar! Maksimal 2MB bro.';
        }
        res.redirect('/admin/help?error=' + encodeURIComponent(errorMsg));
    }
};

exports.getAdminReports = async (req, res) => {
    try {
        // Auto-heal: Ensure both tables exist for chat system
        try {
            await db.execute(`CREATE TABLE IF NOT EXISTS support_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ticket_id INT,
                sender_id INT,
                message TEXT,
                attachment VARCHAR(255),
                is_admin TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            // Check if tickets table needs update (remove old columns if possible or just ignore)
        } catch (e) {}

        const [tickets] = await db.execute(`
            SELECT t.*, u.fullname, u.email, 
                   (SELECT message FROM support_messages WHERE ticket_id = t.id ORDER BY id DESC LIMIT 1) as last_message,
                   (SELECT created_at FROM support_messages WHERE ticket_id = t.id ORDER BY id DESC LIMIT 1) as last_activity
            FROM support_tickets t
            JOIN users u ON t.user_id = u.id
            ORDER BY last_activity DESC
        `);

        res.render('admin/help/admin-list', {
            title: 'Laporan User',
            layout: './layouts/admin',
            user: req.session.user || res.locals.user,
            tickets
        });
    } catch (err) {
        if (err.message.includes('doesn\'t exist')) {
            return res.render('admin/help/admin-list', {
                title: 'Laporan User',
                layout: './layouts/admin',
                user: req.session.user || res.locals.user,
                tickets: []
            });
        }
        console.error('Get Admin Reports Error:', err);
        res.redirect('/admin');
    }
};

exports.resolveTicket = async (req, res) => {
    try {
        const { id } = req.params;
        await db.execute('UPDATE support_tickets SET status = \'resolved\' WHERE id = ?', [id]);
        res.redirect('/admin/reports?resolved=1');
    } catch (err) {
        console.error('Resolve Ticket Error:', err);
        res.redirect('/admin/reports?error=1');
    }
};

exports.getTicketChat = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.session.user || res.locals.user;
        const isAdmin = user.role === 'admin';

        // Auto-heal support_messages table check
        try { await db.execute('SELECT 1 FROM support_messages LIMIT 1'); } 
        catch(e) { await db.execute(`CREATE TABLE IF NOT EXISTS support_messages (id INT AUTO_INCREMENT PRIMARY KEY, ticket_id INT, sender_id INT, message TEXT, attachment VARCHAR(255), is_admin TINYINT(1) DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`); }

        // Get ticket info
        const [tickets] = await db.execute(`
            SELECT t.*, u.fullname, u.email 
            FROM support_tickets t 
            JOIN users u ON t.user_id = u.id 
            WHERE t.id = ?
        `, [id]);

        if (tickets.length === 0) return res.redirect('/admin/help');
        const ticket = tickets[0];

        // Security check for non-admins
        if (!isAdmin && ticket.user_id !== user.id) return res.redirect('/admin/help');

        // Get messages
        const [messages] = await db.execute('SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY id ASC', [id]);

        res.render('admin/help/chat', {
            title: `Chat: ${ticket.subject}`,
            layout: './layouts/admin',
            user,
            ticket,
            messages,
            isAdmin
        });
    } catch (err) {
        console.error('Chat View Error:', err);
        res.redirect('/admin/help');
    }
};

exports.postTicketMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;
        const user = req.session.user || res.locals.user;
        const isAdmin = user.role === 'admin';
        const screenshot = req.file ? '/uploads/tickets/' + req.file.filename : null;

        if (!message && !screenshot) return res.redirect(`/admin/help/ticket/${id}`);

        // Insert message
        await db.execute(
            'INSERT INTO support_messages (ticket_id, sender_id, message, attachment, is_admin) VALUES (?, ?, ?, ?, ?)',
            [id, user.id || 0, message, screenshot, isAdmin ? 1 : 0]
        );

        // Get ticket info for notifications
        const [tickets] = await db.execute(`
            SELECT t.*, u.email, u.fullname 
            FROM support_tickets t 
            JOIN users u ON t.user_id = u.id 
            WHERE t.id = ?
        `, [id]);
        
        if (tickets.length > 0) {
            const ticket = tickets[0];
            if (isAdmin) {
                // Notify User
                await db.execute(
                    "INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)",
                    [ticket.user_id, 'Pesan Baru dari Admin', `Admin membalas chat: ${ticket.subject}`, 'info', `/admin/help/ticket/${id}`]
                );
                // Send Email in background (No await for speed)
                const baseUrl = `${req.protocol}://${req.get('host')}`;
                sendReplyNotificationEmail(ticket.email, ticket.fullname, ticket.subject, message, baseUrl);
            } else {
                // Notify Admin (ID 1)
                await db.execute(
                    "INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)",
                    [1, 'Pesan Chat Baru', `${ticket.fullname}: ${message.substring(0, 50)}...`, 'bug', `/admin/help/ticket/${id}`]
                );
            }
        }

        res.redirect(`/admin/help/ticket/${id}`);
    } catch (err) {
        console.error('Post Message Error:', err);
        res.redirect('/admin/help');
    }
};
exports.blockIp = async (req, res) => {
    try {
        const { ip } = req.body;
        if (!ip) return res.status(400).json({ success: false, message: 'IP tidak valid' });

        // Block for 24 hours
        await db.execute(
            'INSERT INTO blocked_ips (ip_address, reason, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY)) ON DUPLICATE KEY UPDATE expires_at = DATE_ADD(NOW(), INTERVAL 1 DAY), reason = ?', 
            [ip, 'Blocked manually by admin', 'Blocked manually by admin']
        );

        res.json({ success: true, message: `IP ${ip} berhasil diblokir selama 24 jam.` });
    } catch (err) {
        console.error('Manual Block Error:', err.message);
        res.status(500).json({ success: false, message: 'Gagal memblokir IP.' });
    }
};

// ===================== UPGRADE PRO =====================
exports.getUpgradePage = async (req, res) => {
    try {
        const userId = req.session.userId || (req.session.user ? req.session.user.id : null);
        const [users] = await db.execute('SELECT plan FROM users WHERE id = ?', [userId]);
        const user = users[0];

        if (user.plan === 'pro') {
            return res.redirect('/admin?info=already_pro');
        }

        const [priceRow] = await db.execute("SELECT setting_value FROM settings WHERE setting_key = 'price_pro'");
        const price_pro = priceRow[0] ? priceRow[0].setting_value : '99000';

        res.render('admin/upgrade', { 
            title: 'Upgrade Pro', 
            layout: './layouts/admin', 
            user: req.session.user || res.locals.user,
            price_pro
        });
    } catch (err) {
        console.error('Get Upgrade Page Error:', err.message);
        res.redirect('/admin');
    }
};

exports.getUpgradeCheckout = async (req, res) => {
    try {
        const userId = req.session.userId || (req.session.user ? req.session.user.id : null);
        const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
        const user = users[0];

        if (user.plan === 'pro') return res.redirect('/admin');

        const [priceRow] = await db.execute("SELECT setting_value FROM settings WHERE setting_key = 'price_pro'");
        const price_pro = priceRow[0] ? priceRow[0].setting_value : '99000';

        res.render('admin/upgrade-checkout', { 
            layout: false, // Clean page, no sidebar
            user: user,
            price_pro
        });
    } catch (err) {
        console.error('Get Upgrade Checkout Error:', err.message);
        res.redirect('/admin/upgrade');
    }
};

exports.processUpgrade = async (req, res) => {
    try {
        const userId = req.session.userId || (req.session.user ? req.session.user.id : null);
        const { name, email, phone, payment_method, payment_channel } = req.body;
        const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
        const user = users[0];

        if (user.plan === 'pro') return res.redirect('/admin');

        // iPaymu Config (Using Admin Credentials)
        const [adminRows] = await db.execute('SELECT ipaymu_sandbox, ipaymu_va, ipaymu_apikey FROM users WHERE role = "admin" LIMIT 1');
        const adminConfig = adminRows[0] || {};
        const isSandbox = adminConfig.ipaymu_sandbox == 1;
        const va = adminConfig.ipaymu_va || (isSandbox ? process.env.IPAYMU_VA_SANDBOX : process.env.IPAYMU_VA_LIVE);
        const apiKey = adminConfig.ipaymu_apikey || (isSandbox ? process.env.IPAYMU_APIKEY_SANDBOX : process.env.IPAYMU_APIKEY_LIVE);
        const url = isSandbox ? 'https://sandbox.ipaymu.com/api/v2/payment/direct' : 'https://my.ipaymu.com/api/v2/payment/direct';

        if (!va || !apiKey) {
            return res.send('Maaf, sistem pembayaran belum siap (VA/ApiKey Admin kosong).');
        }

        const [priceRow] = await db.execute("SELECT setting_value FROM settings WHERE setting_key = 'price_pro'");
        const price = Math.floor(parseFloat(priceRow[0] ? priceRow[0].setting_value : '99000'));
        const referenceId = `UPGRADE-PRO-${userId}-${Date.now()}`;

        // Robust Phone Formatting
        let cleanPhone = (phone || user.whatsapp || user.phone || '081234567890').replace(/[^0-9]/g, '');
        if (cleanPhone.startsWith('0')) {
            cleanPhone = '62' + cleanPhone.substring(1);
        } else if (!cleanPhone.startsWith('62') && cleanPhone.length > 5) {
            cleanPhone = '62' + cleanPhone;
        }

        // Use DIRECT Payment Endpoint to target specific method selected by user
        const directUrl = isSandbox ? 'https://sandbox.ipaymu.com/api/v2/payment/direct' : 'https://my.ipaymu.com/api/v2/payment/direct';

        // Create Payment Link
        const body = {
            name: (name || user.fullname || user.name || 'User').replace(/[^a-zA-Z0-9 ]/g, ''),
            phone: cleanPhone,
            email: email || user.email,
            amount: price,
            referenceId: referenceId,
            notifyUrl: `${req.protocol}://${req.get('host')}/api/callback/ipaymu`,
            returnUrl: `${req.protocol}://${req.get('host')}/admin?success_upgrade=true`,
            cancelUrl: `${req.protocol}://${req.get('host')}/admin/upgrade`,
            paymentMethod: payment_method || 'qr',
            paymentChannel: payment_channel || 'qris',
            product: ['Upgrade PRO Lingku'],
            qty: [1],
            price: [price]
        };

        const bodyString = JSON.stringify(body);
        const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex').toLowerCase();
        const stringToSign = `POST:${va}:${bodyHash}:${apiKey}`;
        const signature = crypto.createHmac('sha256', apiKey).update(stringToSign).digest('hex').toLowerCase();

        const response = await axios.post(directUrl, bodyString, {
            headers: {
                'Content-Type': 'application/json',
                'va': va,
                'signature': signature,
                'timestamp': new Date().toISOString().replace(/[-:T]/g, '').split('.')[0]
            }
        });

        if (response.data && response.data.Data && (response.data.Data.Url || response.data.Data.PaymentUrl)) {
            res.redirect(response.data.Data.Url || response.data.Data.PaymentUrl);
        } else {
            const errorMsg = response.data ? (response.data.Message || JSON.stringify(response.data)) : 'Unknown iPaymu Error';
            console.error('iPaymu Error:', errorMsg);
            res.send(`Gagal membuat tagihan: ${errorMsg}. Response: ${JSON.stringify(response.data)}`);
        }

    } catch (err) {
        console.error('Process Upgrade Error:', err.message);
        res.redirect('/admin/upgrade?error=system');
    }
};
