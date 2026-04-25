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

        // Get total count for pagination
        const [countRow] = await db.execute('SELECT COUNT(*) as total FROM orders WHERE user_id = ?', [userId]);
        const totalItems = countRow[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // Safe query for Hostinger & Local DB
        const [orders] = await db.execute(
            `SELECT o.*, 
                    COALESCE(p.name, 'Produk Tidak Terdeteksi') as product_name, 
                    p.price as product_price, 
                    p.thumbnail, p.image_url, p.image_small, p.cover_image, p.photo,
                    p.access_link,
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

        res.render('admin/withdrawal', {
            title: 'Tarik Dana',
            layout: './layouts/admin',
            balance,
            affiliate_commission,
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
        res.render('admin/guides', { 
            title: 'Pusat Panduan', 
            layout: './layouts/admin', 
            guides, 
            user: req.session.user || res.locals.user 
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
            title: 'Daftar Pembeli: ' + pageTitle,
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
        await db.execute('INSERT INTO feature_flags (flag_key, description, is_enabled) VALUES (?,?,?)', [flag_key, description, 0]);
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

        const [rows] = await db.execute("SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE 'smtp_%' OR setting_key LIKE 'aff_%'");
        const smtp = {};
        const affiliate = {};
        rows.forEach(r => { 
            if (r.setting_key.startsWith('smtp_')) smtp[r.setting_key] = r.setting_value;
            if (r.setting_key.startsWith('aff_')) affiliate[r.setting_key] = r.setting_value;
        });

        res.render('admin/settings', { 
            title: 'Pengaturan', 
            layout: './layouts/admin', 
            user: user,
            smtp: smtp,
            affiliate: affiliate,
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
        const userId = req.session.userId || (req.session.user ? req.session.user.id : null);
        if (!userId) return res.redirect('/auth/login');

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
        const isAdmin = user.role === 'admin';

        if (isAdmin) {
            // Platform wide affiliate stats
            const [stats] = await db.execute(`
                SELECT 
                    COUNT(DISTINCT referred_by) as total_affiliates,
                    COUNT(id) as total_users
                FROM users 
                WHERE referred_by IS NOT NULL
            `);

            const [commStats] = await db.execute(`
                SELECT 
                    COALESCE(SUM(o.total_price * (p.commission_percent / 100)), 0) as total_commissions,
                    COUNT(o.id) as total_affiliate_orders
                FROM orders o
                JOIN products p ON o.product_id = p.id
                JOIN users u ON o.user_id = u.id
                WHERE o.status = 'completed' AND u.referred_by IS NOT NULL
            `);

            const [topAffiliates] = await db.execute(`
                SELECT 
                    u.fullname, u.email, 
                    COUNT(ref.id) as total_referrals,
                    COALESCE(SUM(o.total_price * (p.commission_percent / 100)), 0) as earnings
                FROM users u
                LEFT JOIN users ref ON u.id = ref.referred_by
                LEFT JOIN orders o ON ref.id = o.user_id AND o.status = 'completed'
                LEFT JOIN products p ON o.product_id = p.id
                WHERE u.affiliate_code IS NOT NULL
                GROUP BY u.id
                HAVING total_referrals > 0 OR earnings > 0
                ORDER BY earnings DESC
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
            const [refCount] = await db.execute(`SELECT COUNT(*) as total FROM users WHERE referred_by = ?`, [user.id]);
            
            const [commStats] = await db.execute(`
                SELECT 
                    COALESCE(SUM(o.total_price * (p.commission_percent / 100)), 0) as total_commissions,
                    COUNT(o.id) as total_affiliate_orders
                FROM orders o
                JOIN products p ON o.product_id = p.id
                JOIN users u ON o.user_id = u.id
                WHERE o.status = 'completed' AND u.referred_by = ?
            `, [user.id]);

            res.render('admin/affiliate-stats', {
                title: 'Statistik Affiliate Saya',
                layout: './layouts/admin',
                isAdmin: false,
                stats: {
                    total_referrals: refCount[0].total,
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
    try {
        // Safety check: Only allow if hostname is localhost
        if (req.hostname !== 'localhost' && req.hostname !== '127.0.0.1') {
            return res.status(403).json({ success: false, message: 'Fitur ini hanya untuk Local Dev!' });
        }

        console.log('--- AUTO DEPLOY STARTED ---');
        
        // 1. Check if there are any changes first
        exec('git status --porcelain', (err, stdout) => {
            if (err) {
                console.error(`Git Status Error: ${err.message}`);
                return res.json({ success: false, message: 'Gagal cek status git: ' + err.message });
            }

            if (!stdout.trim()) {
                return res.json({ success: true, message: 'Kodingan di Local sudah paling update (Nothing to push).' });
            }

            const commitMsg = `Auto Deploy: ${new Date().toLocaleString()}`;
            // Use GIT_TERMINAL_PROMPT=0 to prevent hanging on password prompts
            const command = `export GIT_TERMINAL_PROMPT=0 && git add . && git commit -m "${commitMsg}" && git push origin master`;
            
            exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Git Push Error: ${stderr || error.message}`);
                    let msg = stderr || error.message;
                    if (msg.includes('terminal prompts disabled')) {
                        msg = 'Git butuh login/password. Pastikan SSH Key sudah terpasang atau gunakan Git Credential Manager.';
                    }
                    return res.json({ success: false, message: msg });
                }
                console.log('--- AUTO DEPLOY SUCCESS ---');
                res.json({ success: true, message: 'Kodingan berhasil diterbangkan ke Live!', log: stdout });
            });
        });
    } catch (globalErr) {
        console.error('Auto Deploy Global Error:', globalErr);
        res.json({ success: false, message: 'Kesalahan Sistem: ' + globalErr.message });
    }
};
