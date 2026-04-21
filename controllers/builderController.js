const db = require('../config/db');
const axios = require('axios');
const crypto = require('crypto');
const { sendPaymentInstructionEmail, sendAccessEmail } = require('../utils/mailer');

// Ensure tables exist
async function ensureTables() {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS pages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                slug VARCHAR(100) NOT NULL DEFAULT 'home',
                title VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_page (user_id, slug)
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS page_blocks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                page_id INT NOT NULL,
                type VARCHAR(50) DEFAULT 'product',
                content TEXT,
                visible TINYINT(1) DEFAULT 1,
                block_order INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS page_backups (
                id INT AUTO_INCREMENT PRIMARY KEY,
                page_id INT NOT NULL,
                blocks_json LONGTEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } catch(e) { /* tables already exist */ }
}

exports.getBuilder = async (req, res) => {
    try {
        await ensureTables();
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);
        const activeSlug = req.query.page || 'home';

        // Ensure user has at least a 'home' page
        const [existingPages] = await db.execute('SELECT * FROM pages WHERE user_id = ?', [userId]);
        if (existingPages.length === 0) {
            await db.execute('INSERT INTO pages (user_id, slug, title) VALUES (?, ?, ?)', [userId, 'home', 'Home']);
        }

        // Get all pages
        const [pages] = await db.execute('SELECT * FROM pages WHERE user_id = ? ORDER BY id ASC', [userId]);

        // Find current page
        const currentPage = pages.find(p => p.slug === activeSlug) || pages[0];

        // Get blocks for current page - safe query without p.image
        let rawBlocks = [];
        try {
            const [rows] = await db.execute(`
                SELECT pb.*, p.name as product_name, p.price as product_price
                FROM page_blocks pb
                LEFT JOIN products p ON pb.type = 'product' AND pb.content = p.id
                WHERE pb.page_id = ?
                ORDER BY pb.block_order ASC
            `, [currentPage.id]);
            rawBlocks = rows;
        } catch(e) {
            // Fallback without JOIN
            const [rows] = await db.execute('SELECT * FROM page_blocks WHERE page_id = ? ORDER BY block_order ASC', [currentPage.id]);
            rawBlocks = rows;
        }

        // Get all user products for dropdown - safe query
        let products = [];
        try {
            const [rows] = await db.execute('SELECT id, name, price FROM products WHERE user_id = ? ORDER BY name ASC', [userId]);
            products = rows;
        } catch(e) {}

        // Get user info
        let userSlug = 'username';
        try {
            const [userRows] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
            if (userRows[0]) userSlug = userRows[0].slug || userRows[0].username || 'username';
        } catch(e) {}

        res.render('admin/builder', {
            title: 'Builder',
            layout: './layouts/admin',
            pages,
            blocks: rawBlocks,
            products,
            activeSlug: currentPage.slug,
            user: req.session.user || { name: 'Admin', slug: userSlug, role: 'admin', roleDisplay: 'Administrator' }
        });
    } catch (err) {
        console.error('Builder Error:', err.message);
        res.render('admin/builder', {
            title: 'Builder',
            layout: './layouts/admin',
            pages: [],
            blocks: [],
            products: [],
            activeSlug: 'home',
            user: req.session.user || { name: 'Admin', slug: 'username', role: 'admin', roleDisplay: 'Administrator' }
        });
    }
};

exports.savePageData = async (req, res) => {
    let connection;
    try {
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);
        const { page_slug, blocks } = req.body;

        const [pageRows] = await db.execute('SELECT id FROM pages WHERE user_id = ? AND slug = ?', [userId, page_slug]);
        if (pageRows.length === 0) return res.json({ success: false, message: 'Halaman tidak ditemukan.' });

        const pageId = pageRows[0].id;
        
        // Use a transaction for maximum speed and safety
        connection = await db.getConnection();
        await connection.beginTransaction();

        // 1. Save backup (Silent)
        try {
            const [currentBlocks] = await connection.execute('SELECT type, content, visible, block_order FROM page_blocks WHERE page_id = ? ORDER BY block_order ASC', [pageId]);
            if (currentBlocks.length > 0) {
                await connection.execute('INSERT INTO page_backups (page_id, blocks_json) VALUES (?, ?)', [pageId, JSON.stringify(currentBlocks)]);
            }
        } catch(e) {}

        // 2. Delete old blocks
        await connection.execute('DELETE FROM page_blocks WHERE page_id = ?', [pageId]);

        // 3. BULK INSERT new blocks (THE SPEED BOOSTER)
        if (blocks && Array.isArray(blocks) && blocks.length > 0) {
            const values = [];
            const placeholders = [];
            
            blocks.forEach((b, i) => {
                let content = b.content || '';
                if (typeof content === 'object') content = JSON.stringify(content);
                
                placeholders.push('(?, ?, ?, ?, ?)');
                values.push(pageId, b.type, content, (b.visible == 1 || b.visible === true) ? 1 : 0, i);
            });

            const sql = `INSERT INTO page_blocks (page_id, type, content, visible, block_order) VALUES ${placeholders.join(', ')}`;
            await connection.execute(sql, values);
        }

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Save Page Error:', err.message);
        res.json({ success: false, message: 'Gagal menyimpan cepat.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.createPage = async (req, res) => {
    try {
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);
        const { slug } = req.body;
        if (!slug || slug.length < 2) return res.json({ success: false, message: 'Slug minimal 2 karakter.' });

        const [existing] = await db.execute('SELECT id FROM pages WHERE user_id = ? AND slug = ?', [userId, slug]);
        if (existing.length > 0) return res.json({ success: false, message: 'Halaman sudah ada.' });

        await db.execute('INSERT INTO pages (user_id, slug, title) VALUES (?, ?, ?)', [userId, slug, slug]);
        res.json({ success: true });
    } catch (err) {
        console.error(err.message);
        res.json({ success: false, message: 'Gagal.' });
    }
};

exports.deletePage = async (req, res) => {
    try {
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);
        const { slug } = req.body;
        if (slug === 'home') return res.json({ success: false, message: 'Halaman home tidak bisa dihapus.' });

        const [pageRows] = await db.execute('SELECT id FROM pages WHERE user_id = ? AND slug = ?', [userId, slug]);
        if (pageRows.length === 0) return res.json({ success: false });

        const pageId = pageRows[0].id;
        await db.execute('DELETE FROM page_blocks WHERE page_id = ?', [pageId]);
        try { await db.execute('DELETE FROM page_backups WHERE page_id = ?', [pageId]); } catch(e) {}
        await db.execute('DELETE FROM pages WHERE id = ?', [pageId]);

        res.json({ success: true });
    } catch (err) {
        console.error(err.message);
        res.json({ success: false });
    }
};

exports.restoreBackup = async (req, res) => {
    try {
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);
        const { page_slug } = req.body;

        const [pageRows] = await db.execute('SELECT id FROM pages WHERE user_id = ? AND slug = ?', [userId, page_slug]);
        if (pageRows.length === 0) return res.json({ success: false, message: 'Halaman tidak ditemukan.' });

        const pageId = pageRows[0].id;
        const [backups] = await db.execute('SELECT * FROM page_backups WHERE page_id = ? ORDER BY created_at DESC LIMIT 1', [pageId]);
        if (backups.length === 0) return res.json({ success: false, message: 'Tidak ada backup tersedia.' });

        const blocks = JSON.parse(backups[0].blocks_json);
        await db.execute('DELETE FROM page_blocks WHERE page_id = ?', [pageId]);

        for (const b of blocks) {
            await db.execute(
                'INSERT INTO page_blocks (page_id, type, content, visible, block_order) VALUES (?, ?, ?, ?, ?)',
                [pageId, b.type, b.content || '', b.visible !== undefined ? b.visible : 1, b.block_order || 0]
            );
        }

        await db.execute('DELETE FROM page_backups WHERE id = ?', [backups[0].id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err.message);
        res.json({ success: false, message: 'Gagal restore.' });
    }
};

exports.updatePageInfo = async (req, res) => {
    try {
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);
        const { old_slug, new_slug, title } = req.body;
        if (old_slug === 'home' && new_slug !== 'home') return res.json({ success: false, message: 'Slug home tidak bisa diubah.' });

        if (new_slug) {
            await db.execute('UPDATE pages SET slug = ?, title = ? WHERE user_id = ? AND slug = ?', [new_slug, title || new_slug, userId, old_slug]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err.message);
        res.json({ success: false });
    }
};

exports.renderUserPage = async (req, res) => {
    try {
        const { username, pageSlug } = req.params;
        const targetSlug = pageSlug || 'home';

        // Find User by Slug
        const [users] = await db.execute('SELECT * FROM users WHERE slug = ?', [username]);
        if (users.length === 0) {
            // Fallback to searching by fullname or id if needed, but slug is primary
            const [users2] = await db.execute('SELECT * FROM users WHERE id = ?', [username]).catch(() => [[]]);
            if (users2.length === 0) return res.status(404).send('User not found');
            var user = users2[0];
        } else {
            var user = users[0];
        }

        // Find Page
        const [pages] = await db.execute('SELECT * FROM pages WHERE user_id = ? AND slug = ?', [user.id, targetSlug]);
        if (pages.length === 0) return res.status(404).send('Page not found');
        const page = pages[0];

        // Get Blocks
        const [blocks] = await db.execute('SELECT * FROM page_blocks WHERE page_id = ? AND visible = 1 ORDER BY block_order ASC', [page.id]);

        // Map blocks to template format
        const mappedBlocks = blocks.map(b => {
            const mapped = { type: b.type, id: b.id };
            if (b.type === 'image') {
                try {
                    const imgData = typeof b.content === 'object' ? b.content : JSON.parse(b.content);
                    mapped.url = imgData.url || b.content;
                } catch(e) { mapped.url = b.content; }
            }
            if (b.type === 'product') mapped.pid = b.content;
            if (b.type === 'button') {
                try {
                    const btnData = typeof b.content === 'object' ? b.content : JSON.parse(b.content);
                    mapped.label = btnData.label || btnData.text || b.content;
                    mapped.link = btnData.link || btnData.url || '#';
                    mapped.color = btnData.color || 'default';
                } catch(e) {
                    mapped.label = b.content || 'Button';
                    mapped.link = '#';
                }
            }
            if (b.type === 'text') mapped.text = b.content;
            if (b.type === 'video') {
                try {
                    const vidData = typeof b.content === 'object' ? b.content : JSON.parse(b.content);
                    mapped.url = vidData.url || b.content;
                } catch(e) { mapped.url = b.content; }
            }
            if (b.type === 'divider') {
                try {
                    const divData = JSON.parse(b.content);
                    mapped.style = divData.style;
                    mapped.size = divData.size;
                } catch(e) {
                    mapped.style = b.content; // Legacy simple string
                    mapped.size = 'thin';
                }
            }
            return mapped;
        });

        // Get Products for blocks - Parse JSON image_url
        let products = [];
        try {
            const [rows] = await db.execute('SELECT * FROM products WHERE user_id = ?', [user.id]);
            products = rows.map(p => {
                // Find the first non-empty image column
                let thumbValue = p.thumbnail || p.image_url || p.image_small || p.cover_image || p.photo || '';
                let thumb = '';
                
                // Handle JSON format if exists
                if (typeof thumbValue === 'string' && thumbValue.startsWith('[')) {
                    try {
                        const imgs = JSON.parse(thumbValue);
                        if (Array.isArray(imgs) && imgs.length > 0) thumb = imgs[0];
                    } catch(e) { thumb = thumbValue; }
                } else {
                    thumb = thumbValue;
                }
                
                return { ...p, processed_thumb: thumb };
            });
        } catch(e) {}

        // Get social proof data (20 recent orders)
        let recentOrders = [];
        try {
            const [oRows] = await db.execute(`
                SELECT o.customer_name, o.status, o.created_at, p.name as product_name
                FROM orders o
                JOIN products p ON o.product_id = p.id
                WHERE p.user_id = ?
                ORDER BY o.created_at DESC
                LIMIT 20
            `, [user.id]);
            recentOrders = oRows;
        } catch(e) {}

        res.render('user-page', {
            title: page.title || user.fullname || 'Landing Page',
            layout: false, 
            user: {
                fullname: user.fullname,
                slug: user.slug,
                profile_photo: user.profile_photo,
                bio: user.bio,
                profile_box_color: user.profile_box_color,
                show_header: user.show_header,
                header_type: user.header_type,
                profile_text_color: user.profile_text_color,
                name_font_size: user.name_font_size,
                bio_font_size: user.bio_font_size
            },
            blocks: mappedBlocks,
            products,
            recentOrders
        });
    } catch (err) {
        console.error('Render Page Error:', err.message);
        res.status(500).send('Internal Server Error: ' + err.message);
    }
};

exports.renderProductPage = async (req, res) => {
    try {
        const { productId } = req.params;

        // Get Product
        const [products] = await db.execute(`
            SELECT p.*, u.fullname as seller_name, u.slug as seller_slug, u.profile_photo as seller_photo
            FROM products p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = ?
        `, [productId]);

        if (products.length === 0) return res.status(404).send('Product not found');
        const product = products[0];

        // Process image (Robust detection)
        let thumbValue = product.thumbnail || product.image_url || product.image_small || product.cover_image || product.photo || '';
        let thumb = '';
        
        if (typeof thumbValue === 'string' && thumbValue.startsWith('[')) {
            try {
                const imgs = JSON.parse(thumbValue);
                if (Array.isArray(imgs) && imgs.length > 0) thumb = imgs[0];
            } catch(e) { thumb = thumbValue; }
        } else {
            thumb = thumbValue;
        }
        product.processed_thumb = thumb;

        res.render('product-detail', {
            title: product.name,
            layout: false,
            product
        });
    } catch (err) {
        console.error('Render Product Error:', err.message);
        res.status(500).send('Error loading product');
    }
};

exports.renderCheckoutPage = async (req, res) => {
    try {
        const { productId } = req.params;
        const [products] = await db.execute('SELECT * FROM products WHERE id = ?', [productId]);
        if (products.length === 0) return res.status(404).send('Product not found');
        
        const product = products[0];

        // Process image (Robust detection)
        let thumbValue = product.thumbnail || product.image_url || product.image_small || product.cover_image || product.photo || '';
        let thumb = '';
        
        if (typeof thumbValue === 'string' && thumbValue.startsWith('[')) {
            try {
                const imgs = JSON.parse(thumbValue);
                if (Array.isArray(imgs) && imgs.length > 0) thumb = imgs[0];
            } catch(e) { thumb = thumbValue; }
        } else {
            thumb = thumbValue;
        }
        product.processed_thumb = thumb;

        res.render('checkout', { title: 'Checkout', product, layout: false });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading checkout');
    }
};

exports.processCheckout = async (req, res) => {
    try {
        const { product_id, name, email, phone, payment_method, payment_channel } = req.body;

        // 0. Ensure Users Table has iPaymu columns
        try {
            await db.execute('SELECT ipaymu_va, ipaymu_apikey, ipaymu_sandbox, ipaymu_expiry FROM users LIMIT 1');
        } catch (e) {
            if (e.message.includes('Unknown column')) {
                const cols = [
                    'ALTER TABLE users ADD COLUMN IF NOT EXISTS ipaymu_va VARCHAR(255)',
                    'ALTER TABLE users ADD COLUMN IF NOT EXISTS ipaymu_apikey VARCHAR(255)',
                    'ALTER TABLE users ADD COLUMN IF NOT EXISTS ipaymu_sandbox TINYINT(1) DEFAULT 1',
                    'ALTER TABLE users ADD COLUMN IF NOT EXISTS ipaymu_expiry INT DEFAULT 60'
                ];
                for (let sql of cols) {
                    try { await db.execute(sql.replace('IF NOT EXISTS ', '')); } catch(err) {}
                }
            }
        }

        // Get Product & Seller Details
        const [products] = await db.execute(`
            SELECT p.*, u.ipaymu_va, u.ipaymu_apikey, u.ipaymu_sandbox, u.ipaymu_expiry 
            FROM products p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = ?
        `, [product_id]);

        if (products.length === 0) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
        const product = products[0];

        if (product.stock <= 0) return res.status(400).send('Stok produk habis.');

        // 1. Decrease Stock (Balance with DB)
        await db.execute('UPDATE products SET stock = stock - 1 WHERE id = ? AND stock > 0', [product_id]);

        // 2. Generate Reference ID
        const refId = 'INV-' + Date.now();

        // 3. Create Order (With Auto-Fix for Columns)
        const orderParams = [product.user_id, product.id, refId, name, email, phone, product.price, payment_channel];
        const insertQuery = `
            INSERT INTO orders (user_id, product_id, reference_id, customer_name, customer_email, customer_whatsapp, total_price, payment_channel, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `;

        try {
            const [orderRes] = await db.execute(insertQuery, orderParams);
            
            // Notify Merchant about NEW PENDING ORDER
            try {
                await db.execute(
                    "INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)",
                    [product.user_id, '🛒 Pesanan Baru Masuk', `${name} sedang memesan ${product.name}`, 'info']
                );
            } catch (notifErr) { console.error('Notif Error:', notifErr.message); }

        } catch (dbErr) {
            console.error('Initial DB Error:', dbErr.message);
            // Auto-Heal: Add missing columns if they don't exist
            if (dbErr.message.includes('Unknown column')) {
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
                    try { await db.execute(sql.replace('IF NOT EXISTS ', '')); } catch(e) {}
                }
                // Try again after healing
                await db.execute(insertQuery, orderParams);
            } else {
                throw dbErr;
            }
        }

        // 4. iPaymu Integration
        const isSandbox = product.ipaymu_sandbox == 1;
        const va = product.ipaymu_va || (isSandbox ? process.env.IPAYMU_VA_SANDBOX : process.env.IPAYMU_VA_LIVE); 
        const apiKey = product.ipaymu_apikey || (isSandbox ? process.env.IPAYMU_APIKEY_SANDBOX : process.env.IPAYMU_APIKEY_LIVE);
        const url = isSandbox ? 'https://sandbox.ipaymu.com/api/v2/payment/direct' : 'https://my.ipaymu.com/api/v2/payment/direct';
        const expiryMins = product.ipaymu_expiry || 60; 

        if (!va || !apiKey) {
            return res.status(500).send('Konfigurasi iPaymu (VA/APIKey) belum disetting di database atau .env (' + (isSandbox ? 'SANDBOX' : 'LIVE') + ')');
        }

        // Logic fix for paymentMethod/Channel mapping based on official iPaymu sample
        let method = (payment_method || 'va').toLowerCase();
        let chan = (payment_channel || 'qris').toLowerCase();
        
        if (chan === 'bca' || chan === 'mandiri' || chan === 'bni' || chan === 'bri') {
            method = 'va';
        } else if (chan === 'qris') {
            method = 'qris'; // Sample uses qris for both
            chan = 'qris';
        } else if (chan === 'alfamart' || chan === 'indomaret') {
            method = 'cstore';
        }

        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
        const finalAmount = Math.floor(product.price);

        // Official Direct Payment Body Structure
        const body = {
            name: name.replace(/[^a-zA-Z0-9 ]/g, '') || 'Customer',
            phone: (phone || '081234567890').replace(/[^0-9]/g, ''), 
            email: email,
            amount: finalAmount, // Must be NUMBER
            notifyUrl: `https://lingku.xyz/api/callback/ipaymu`,
            returnUrl: `https://lingku.xyz/`,
            cancelUrl: `https://lingku.xyz/`,
            referenceId: refId,
            paymentMethod: method,
            paymentChannel: chan,
            comments: `Pembelian ${product.name}`
        };

        const jsonBody = JSON.stringify(body);
        const bodyHash = crypto.createHash('sha256').update(jsonBody).digest('hex').toLowerCase();
        const stringToSign = `POST:${va}:${bodyHash}:${apiKey}`;
        const signature = crypto.createHmac('sha256', apiKey).update(stringToSign).digest('hex').toLowerCase();

        try {
            const response = await axios.post(url, jsonBody, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'va': va,
                    'signature': signature,
                    'timestamp': timestamp
                },
                timeout: 15000 
            });

            if (response.data && response.data.Status === 200) {
                const ipayData = response.data.Data || {};
                
                // 5. Send Payment Instruction Email
                sendPaymentInstructionEmail({
                    customerEmail: email,
                    customerName: name,
                    productName: product.name,
                    totalPrice: product.price,
                    channel: chan,
                    paymentNo: ipayData.PaymentNo || '',
                    qrUrl: ipayData.QrUrl || ipayData.Url || ''
                }).catch(e => console.error('Email Error:', e));

                // Handle Redirect for QRIS
                if (ipayData.Url && method === 'qris') {
                    return res.redirect(ipayData.Url);
                } 
                
                // Handle Direct Instruction Page (VA/CStore)
                if (ipayData.PaymentNo || ipayData.QrUrl) {
                    const isQR = chan === 'qris';
                    const payNo = ipayData.PaymentNo || ipayData.SessionID;
                    const qrImageUrl = ipayData.QrUrl || (isQR ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payNo)}` : '');
                    
                    return res.send(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>Instruksi Pembayaran</title>
                            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
                            <style>
                                body { font-family: 'Inter', sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 20px; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
                                .card { background: white; width: 100%; max-width: 450px; border-radius: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.05); overflow: hidden; }
                                .header { background: #10b981; height: 5px; }
                                .content { padding: 40px 30px; }
                                .info-box { background: #f0fdf4; border: 1.5px dashed #10b981; border-radius: 24px; padding: 25px; text-align: center; margin-bottom: 30px; }
                                .pay-label { font-size: 11px; font-weight: 900; color: #065f46; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 15px; }
                                .pay-no { font-size: ${isQR ? '12px' : '28px'}; font-weight: 900; color: #065f46; word-break: break-all; }
                                .qr-img { width: 220px; height: 220px; margin: 0 auto; display: block; border-radius: 12px; background: white; padding: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
                                .details { border-top: 1px solid #f1f5f9; padding-top: 25px; }
                                .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; }
                                .detail-label { color: #64748b; font-weight: 600; }
                                .detail-val { font-weight: 800; color: #1e293b; }
                                .footer { padding: 0 30px 40px; text-align: center; }
                                .back-btn { display: block; background: #1e293b; color: white; text-decoration: none; padding: 16px; border-radius: 14px; font-weight: 700; transition: 0.2s; }
                                .back-btn:hover { background: #000; transform: translateY(-2px); }
                            </style>
                        </head>
                        <body>
                            <div class="card">
                                <div class="header"></div>
                                <div class="content">
                                    <div class="info-box">
                                        <div class="pay-label">${isQR ? 'SILAKAN SCAN QRIS' : 'NOMOR VA ' + chan.toUpperCase()}</div>
                                        ${isQR ? `<img src="${qrImageUrl}" class="qr-img">` : `<h1 class="pay-no">${payNo}</h1>`}
                                    </div>
                                    <div class="details">
                                        <div class="detail-row"><span class="detail-label">Produk</span><span class="detail-val">${product.name}</span></div>
                                        <div class="detail-row"><span class="detail-label">Total</span><span class="detail-val" style="color:#10b981; font-size:18px;">Rp ${Number(product.price).toLocaleString('id-ID')}</span></div>
                                    </div>
                                </div>
                                <div class="footer">
                                    <a href="/" class="back-btn">Selesai & Ke Beranda</a>
                                </div>
                            </div>
                            <script>
                                const rid = '${refId}';
                                setInterval(async () => {
                                    try {
                                        const r = await fetch('/api/order/status/' + rid);
                                        const d = await r.json();
                                        if (d.status === 'completed') window.location.href = '/access/go/' + d.orderId;
                                    } catch(e) {}
                                }, 5000);
                            </script>
                        </body>
                        </html>
                    `);
                }

                // If somehow nothing matched but Status was 200
                return res.redirect(ipayData.Url || '/');

            } else {
                console.error('iPaymu Error:', response.data);
                return res.status(500).send('Gagal memproses pembayaran: ' + (response.data.Message || 'Kesalahan iPaymu'));
            }

        } catch (err) {
            console.error('Checkout Critical Error:', err.message);
            res.status(500).send('Terjadi kesalahan pada sistem: ' + (err.response ? JSON.stringify(err.response.data) : err.message));
        }
    } catch (globalErr) {
        console.error('Global Error:', globalErr);
        res.status(500).send('Sistem Error: ' + globalErr.message);
    }
};

exports.ipaymuCallback = async (req, res) => {
    try {
        console.log('--- IPAYMU CALLBACK DEBUG ---');
        const { trx_id, sid, status, status_code } = req.body;
        
        // Success condition: status 'berhasil' or status_code '1'
        const isSuccess = status === 'berhasil' || String(status_code) === '1';

        if (isSuccess && sid) {
            // Auto-Heal: Ensure trx_id column exists
            try {
                await db.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS trx_id VARCHAR(100) AFTER reference_id");
            } catch(e) {
                try { await db.execute("ALTER TABLE orders ADD COLUMN trx_id VARCHAR(100) AFTER reference_id"); } catch(err2) {}
            }

            const [orders] = await db.execute(`
                SELECT o.*, p.name as product_name, p.access_link 
                FROM orders o 
                JOIN products p ON o.product_id = p.id 
                WHERE o.reference_id = ?
            `, [sid]);
            
            if (orders.length > 0) {
                const order = orders[0];
                
                if (order.status === 'pending') {
                    // 1. Update Order Status
                    await db.execute(
                        'UPDATE orders SET status = ?, trx_id = ? WHERE id = ?',
                        ['completed', trx_id || null, order.id]
                    );

                    // 2. Add Balance to Merchant
                    await db.execute(
                        'UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE id = ?',
                        [parseFloat(order.total_price || 0), order.user_id]
                    );


                    // 3. Send Access Email Automatically
                    if (order.customer_email && order.access_link) {
                        const baseUrl = `https://${req.get('host')}`;
                        const { sendAccessEmail } = require('../utils/mailer'); // Fixed path: mailer.js
                        sendAccessEmail(
                            order.id, 
                            order.customer_email, 
                            order.customer_name, 
                            order.product_name, 
                            order.access_link,
                            baseUrl
                        ).catch(e => console.error('Error sending access email on callback:', e));
                    }

                    // 4. Send Admin/Merchant Notification
                    try {
                        const formattedPrice = parseFloat(order.total_price || 0).toLocaleString('id-ID');
                        await db.execute(
                            "INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)",
                            [order.user_id, '💰 Pembayaran Berhasil!', `Rp ${formattedPrice} masuk dari ${order.customer_name}`, 'pay']
                        );
                    } catch (e) {
                        console.error('Notification Error:', e.message);
                    }

                    console.log(`[SUCCESS] Order ${sid} completed & Email/Notif sent.`);
                }
            }
        }
        res.send('OK');
    } catch (err) {
        console.error('--- CALLBACK FATAL ERROR ---');
        console.error(err);
        res.status(500).send('Error');
    }
};

// Check Order Status for Auto-Redirect
exports.checkOrderStatus = async (req, res) => {
    try {
        const { refId } = req.params;
        const [orders] = await db.execute('SELECT id, status FROM orders WHERE reference_id = ?', [refId]);
        if (orders.length === 0) return res.json({ status: 'not_found' });
        
        res.json({ 
            status: orders[0].status,
            orderId: orders[0].id
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Email Tracking & Link Events
exports.trackEmailOpen = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        // Insert 'Opened' log if not already opened
        await db.execute("INSERT INTO email_logs (order_id, event_name, created_at) VALUES (?, 'Opened', NOW())", [orderId]);
        
        // Return 1x1 transparent PNG
        const buf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': buf.length,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(buf);
    } catch (err) {
        console.error('Track Email Open Error:', err);
        res.status(404).end();
    }
};

exports.handleAccessLink = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        
        // Fetch product access link
        const [rows] = await db.execute(`
            SELECT p.access_link 
            FROM orders o 
            LEFT JOIN products p ON o.product_id = p.id 
            WHERE o.id = ?
        `, [orderId]);

        if (rows.length === 0) return res.redirect('/');

        // Log the click
        await db.execute("INSERT INTO email_logs (order_id, event_name, created_at) VALUES (?, 'Clicked', NOW())", [orderId]);

        // Redirect to actual access link
        res.redirect(rows[0].access_link || '/');
    } catch (err) {
        console.error('Handle Access Link Error:', err);
        res.redirect('/');
    }
};
