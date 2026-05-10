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
        // AUTO-HEAL: Ensure 'type' is VARCHAR and can hold 'affiliate'
        try {
            await db.execute("ALTER TABLE page_blocks MODIFY COLUMN type VARCHAR(50) DEFAULT 'product'");
        } catch(e) {}
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
            const [rows] = await db.execute('SELECT id, name, price, thumbnail, image_url, image_small, cover_image, photo FROM products WHERE user_id = ? ORDER BY name ASC', [userId]);
            products = rows;
        } catch(e) {}

        // NEW: Get Marketplace Products (Affiliate Enabled Products from others)
        let marketplaceProducts = [];
        try {
            const [rows] = await db.execute(`
                SELECT p.id, p.name, p.price, p.commission_percent, u.fullname as seller_name, 
                       p.thumbnail, p.image_url, p.image_small, p.cover_image, p.photo
                FROM products p 
                JOIN users u ON p.user_id = u.id 
                WHERE p.is_affiliate = 1 AND p.user_id != ?
                ORDER BY p.id DESC
            `, [userId]);
            marketplaceProducts = rows;
        } catch(e) { console.error('Marketplace Fetch Error:', e.message); }

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
            marketplaceProducts,
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
            marketplaceProducts: [],
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
                
                // Whitelist allowed types to prevent database errors
                const allowed = ['image', 'text', 'video', 'product', 'button', 'divider', 'affiliate'];
                if (allowed.includes(b.type)) {
                    placeholders.push('(?, ?, ?, ?, ?)');
                    values.push(pageId, b.type, content, (b.visible == 1 || b.visible === true) ? 1 : 0, i);
                }
            });

            const sql = `INSERT INTO page_blocks (page_id, type, content, visible, block_order) VALUES ${placeholders.join(', ')}`;
            await connection.execute(sql, values);
        }

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Save Page Error:', err.message);
        res.json({ success: false, message: 'Gagal menyimpan: ' + err.message });
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
            if (b.type === 'product' || b.type === 'affiliate') mapped.pid = b.content;
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

        // Get Products for blocks (Including Affiliate products from marketplace)
        // Get Products for blocks (Including Affiliate products from marketplace)
        let products = [];
        try {
            // 1. Get all products owned by the page owner (Baseline)
            const [ownerRows] = await db.query('SELECT * FROM products WHERE user_id = ?', [user.id]);
            
            // 2. Get all unique product IDs from blocks
            const pids = blocks
                .filter(b => (b.type === 'product' || b.type === 'affiliate') && b.content)
                .map(b => parseInt(b.content))
                .filter(id => !isNaN(id)); 

            // 3. Get extra products from marketplace if referenced
            let extraRows = [];
            if (pids.length > 0) {
                const ownerPids = ownerRows.map(p => p.id);
                const marketplacePids = pids.filter(id => !ownerPids.includes(id));
                
                if (marketplacePids.length > 0) {
                    // Filter out duplicates and ensure numbers
                    const uniqueMarketplacePids = [...new Set(marketplacePids)];
                    const [rows] = await db.execute(
                        `SELECT * FROM products WHERE id IN (${uniqueMarketplacePids.map(() => '?').join(',')})`,
                        uniqueMarketplacePids
                    );
                    extraRows = rows;
                }
            }
            
            const allRows = [...ownerRows, ...extraRows];
            products = allRows.map(p => {
                const invalidStrings = ['digital', 'mentoring', 'webinar', 'tiket', 'tiket webinar', 'null', 'undefined'];
                const candidates = [p.thumbnail, p.image_url, p.image_small, p.cover_image, p.photo];
                let thumbValue = candidates.find(c => {
                    if (!c || typeof c !== 'string') return false;
                    return !invalidStrings.includes(c.toLowerCase().trim());
                }) || '';
                let thumb = '';
                if (typeof thumbValue === 'string' && thumbValue.startsWith('[')) {
                    try {
                        const imgs = JSON.parse(thumbValue);
                        if (Array.isArray(imgs) && imgs.length > 0) thumb = imgs[0];
                    } catch(e) { thumb = thumbValue; }
                } else { thumb = thumbValue; }
                return { ...p, processed_thumb: thumb };
            });
        } catch(e) { console.error('Render Page Products Error:', e.message); }

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
        const invalidStrings = ['digital', 'mentoring', 'webinar', 'tiket', 'tiket webinar', 'null', 'undefined'];
        const candidates = [product.thumbnail, product.image_url, product.image_small, product.cover_image, product.photo];
        let thumbValue = candidates.find(c => {
            if (!c || typeof c !== 'string') return false;
            return !invalidStrings.includes(c.toLowerCase().trim());
        }) || '';
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
        const invalidStrings = ['digital', 'mentoring', 'webinar', 'tiket', 'tiket webinar', 'null', 'undefined'];
        const candidates = [product.thumbnail, product.image_url, product.image_small, product.cover_image, product.photo];
        let thumbValue = candidates.find(c => {
            if (!c || typeof c !== 'string') return false;
            return !invalidStrings.includes(c.toLowerCase().trim());
        }) || '';
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
        const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0';

        // 0. Ensure Users Table has iPaymu columns
        try {
            const [cols] = await db.execute("SHOW COLUMNS FROM users LIKE 'ipaymu_va'");
            if (cols.length === 0) {
                await db.execute('ALTER TABLE users ADD COLUMN ipaymu_va VARCHAR(255)');
                await db.execute('ALTER TABLE users ADD COLUMN ipaymu_apikey VARCHAR(255)');
                await db.execute('ALTER TABLE users ADD COLUMN ipaymu_sandbox TINYINT(1) DEFAULT 1');
                await db.execute('ALTER TABLE users ADD COLUMN ipaymu_expiry INT DEFAULT 60');
            }
        } catch (e) {}

        // Get Product & Seller Details
        const [products] = await db.execute(`
            SELECT p.*, u.ipaymu_va, u.ipaymu_apikey, u.ipaymu_sandbox, u.ipaymu_expiry 
            FROM products p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = ?
        `, [product_id]);

        if (products.length === 0) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
        const product = products[0];

        // SMART RECOVERY: Check for existing pending order to prevent duplicates
        const [existingOrders] = await db.execute(
            'SELECT * FROM orders WHERE customer_email = ? AND product_id = ? AND status = "pending" AND created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE) LIMIT 1',
            [email, product_id]
        );

        if (existingOrders.length > 0 && existingOrders[0].payment_no) {
            console.log('Duplicate prevented: Found existing pending order', existingOrders[0].reference_id);
            return res.redirect(`/checkout/payment/${existingOrders[0].reference_id}`);
        }

        // Anti-Spam Removed as requested

        // 3. AFFILIATE TRACKING LOGIC
        let affiliateId = null;
        let commissionAmount = 0;
        const refSlug = req.cookies.ref_by;
        
        if (refSlug && refSlug !== product.user_id && refSlug !== product.user_slug) {
            try {
                const [refUsers] = await db.execute('SELECT id FROM users WHERE slug = ? OR id = ?', [refSlug, refSlug]);
                if (refUsers.length > 0 && refUsers[0].id !== product.user_id) {
                    affiliateId = refUsers[0].id;
                    const commPercent = parseFloat(product.commission_percent || 0);
                    commissionAmount = (commPercent / 100) * parseFloat(product.price || 0);
                }
            } catch (e) { console.error('Affiliate Lookup Error:', e.message); }
        }

        if (product.stock !== -1 && product.stock <= 0) return res.status(400).send('Stok produk habis.');

        // 1. Decrease Stock (Balance with DB) - Only if NOT unlimited
        if (product.stock !== -1) {
            await db.execute('UPDATE products SET stock = stock - 1 WHERE id = ? AND stock > 0', [product_id]);
        }

        // 2. Generate Reference ID
        const refId = 'INV-' + Date.now();

        // 4. Create Order (With Auto-Fix for Columns)
        const orderParams = [
            product.user_id, product.id, affiliateId, refId, 
            name, email, phone, product.price, commissionAmount, payment_channel, clientIp
        ];
        const insertQuery = `
            INSERT INTO orders (user_id, product_id, affiliate_id, reference_id, customer_name, customer_email, customer_whatsapp, total_price, commission_amount, payment_channel, status, customer_ip)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `;
        try {
            await db.execute(insertQuery, orderParams);
            
            // Notify Merchant about NEW PENDING ORDER
            try {
                await db.execute(
                    "INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)",
                    [product.user_id, '🛒 Pesanan Baru Masuk', `${name} sedang memesan ${product.name}`, 'info', '/admin/orders']
                );
            } catch (notifErr) { console.error('Notif Error:', notifErr.message); }

        } catch (dbErr) {
            console.error('Initial DB Error:', dbErr.message);
            // Try adding missing columns then try again
            try {
                await db.execute('ALTER TABLE orders ADD COLUMN IF NOT EXISTS affiliate_id INT DEFAULT NULL');
                await db.execute('ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(15,2) DEFAULT 0');
                await db.execute('ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_ip VARCHAR(50) DEFAULT NULL');
                await db.execute('ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_channel VARCHAR(50) DEFAULT NULL');
                await db.execute(insertQuery, orderParams);
            } catch (healErr) {
                console.error('Healing Error:', healErr.message);
                throw dbErr;
            }
        }

        // 4. iPaymu Integration (Global Config from Admin)
        const [adminRows] = await db.execute('SELECT ipaymu_sandbox, ipaymu_expiry, ipaymu_va, ipaymu_apikey FROM users WHERE role = "admin" LIMIT 1');
        const adminConfig = adminRows.length > 0 ? adminRows[0] : {};

        const isSandbox = adminConfig.ipaymu_sandbox == 1;
        
        const va = adminConfig.ipaymu_va || (isSandbox ? process.env.IPAYMU_VA_SANDBOX : process.env.IPAYMU_VA_LIVE); 
        const apiKey = adminConfig.ipaymu_apikey || (isSandbox ? process.env.IPAYMU_APIKEY_SANDBOX : process.env.IPAYMU_APIKEY_LIVE);
        
        const url = isSandbox ? 'https://sandbox.ipaymu.com/api/v2/payment/direct' : 'https://my.ipaymu.com/api/v2/payment/direct';
        const expiryMins = adminConfig.ipaymu_expiry || 60; 

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

        // Fixed: iPaymu anti-fraud often flags '6281234567890' or numbers starting with 0. 
        // We ensure it starts with 62 and is realistic.
        let cleanPhone = (phone || '').replace(/[^0-9]/g, '');
        if (cleanPhone.startsWith('0')) {
            cleanPhone = '62' + cleanPhone.substring(1);
        } else if (!cleanPhone.startsWith('62') && cleanPhone.length > 5) {
            cleanPhone = '62' + cleanPhone;
        }
        if (cleanPhone.length < 10) cleanPhone = '6281299990000'; // Better dummy

        // Official Direct Payment Body Structure
        const body = {
            name: name.replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Pembeli',
            phone: cleanPhone, 
            email: (email || 'customer@gmail.com').trim(),
            amount: finalAmount, 
            notifyUrl: `https://lingku.xyz/api/callback/ipaymu`,
            returnUrl: `https://lingku.xyz/`,
            cancelUrl: `https://lingku.xyz/`,
            referenceId: refId,
            paymentMethod: method,
            paymentChannel: chan,
            comments: `Order ${product.name}`,
            expired: expiryMins,
            expiredType: 'minutes'
        };

        const jsonBody = JSON.stringify(body);
        const bodyHash = crypto.createHash('sha256').update(jsonBody).digest('hex').toLowerCase();
        const stringToSign = `POST:${va}:${bodyHash}:${apiKey}`;
        const signature = crypto.createHmac('sha256', apiKey).update(stringToSign).digest('hex').toLowerCase();

        // Debug Payload (Will show in Terminal)
        console.log('--- IPAYMU REQUEST ---');
        console.log('URL:', url);
        console.log('Body:', jsonBody);
        console.log('Signature:', signature);
        console.log('VA:', va);

        try {
            const response = await axios.post(url, jsonBody, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'va': va,
                    'signature': signature,
                    'timestamp': timestamp
                },
                timeout: 30000 
            });

            console.log('--- IPAYMU RESPONSE ---');
            console.log(JSON.stringify(response.data, null, 2));

            if (response.data && response.data.Status === 200) {
                const ipayData = response.data.Data || {};
                
                // SAVE IPAYMU DATA TO DATABASE (Important for refresh recovery)
                const paymentNo = ipayData.PaymentNo || ipayData.SessionID || '';
                const qrUrl = ipayData.QrUrl || ipayData.Url || '';
                try {
                    await db.execute(
                        'UPDATE orders SET payment_no = ?, qr_url = ? WHERE reference_id = ?',
                        [paymentNo, qrUrl, refId]
                    );
                } catch (saveErr) { console.error('Error saving payment data:', saveErr.message); }

                // 5. Send Payment Instruction Email
                sendPaymentInstructionEmail({
                    customerEmail: email,
                    customerName: name,
                    productName: product.name,
                    totalPrice: product.price,
                    channel: chan,
                    paymentNo: paymentNo,
                    qrUrl: qrUrl
                }).catch(e => console.error('Email Error:', e));

                // Redirect to permanent payment page (PRG Pattern)
                return res.redirect(`/checkout/payment/${refId}`);

            } else {
                console.error('iPaymu Error:', response.data);
                try { await db.execute('UPDATE orders SET status = "rejected" WHERE reference_id = ?', [refId]); } catch(e){}
                return res.status(500).send(`
                    <html>
                    <head>
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Pembayaran Gagal</title>
                        <link rel="icon" type="image/x-icon" href="/images/fav.ico">
                        <style>body{font-family:sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;} .box{background:#fff;padding:30px;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.05);text-align:center;max-width:400px;width:90%;} h2{color:#ef4444;margin-top:0;} p{color:#64748b;line-height:1.5;} a{display:inline-block;margin-top:20px;padding:12px 24px;background:#1e293b;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;}</style>
                    </head>
                    <body><div class="box"><h2>Pembayaran Gagal</h2><p>Sistem pembayaran sedang sibuk atau menolak transaksi Anda. Silakan coba kembali beberapa saat lagi.</p><a href="javascript:history.back()">Kembali & Coba Lagi</a></div></body>
                    </html>
                `);
            }

        } catch (err) {
            console.error('--- IPAYMU CRITICAL ERROR ---');
            console.error('Message:', err.message);
            if (err.response) {
                console.error('iPaymu Response Data:', err.response.data);
                console.error('iPaymu Response Status:', err.response.status);
            }
            
            try { await db.execute('UPDATE orders SET status = "rejected" WHERE reference_id = ?', [refId]); } catch(e){}
            
            // Show more helpful error if in local/debug mode
            const isLocal = req.hostname === 'localhost';
            const errorDetail = (isLocal && err.response && err.response.data) ? JSON.stringify(err.response.data) : 'Terjadi kesalahan saat menghubungi gateway pembayaran.';

            res.status(500).send(`
                <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Koneksi Terputus</title>
                    <link rel="icon" type="image/x-icon" href="/images/fav.ico">
                    <style>body{font-family:sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;} .box{background:#fff;padding:30px;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.05);text-align:center;max-width:400px;width:90%;} h2{color:#f59e0b;margin-top:0;} p{color:#64748b;line-height:1.5;font-size:14px;} .err-code{background:#f1f5f9;padding:8px;border-radius:8px;font-family:monospace;font-size:12px;margin-top:10px;word-break:break-all;} a{display:inline-block;margin-top:20px;padding:12px 24px;background:#1e293b;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;}</style>
                </head>
                <body><div class="box"><h2>Koneksi Terputus</h2><p>${errorDetail}</p><a href="javascript:history.back()">Kembali</a></div></body>
                </html>
            `);
        }
    } catch (globalErr) {
        console.error('Global Error:', globalErr);
        res.status(500).send('Sistem Error: ' + globalErr.message);
    }
};

exports.getPaymentPage = async (req, res) => {
    try {
        const { referenceId } = req.params;
        const [orders] = await db.execute(`
            SELECT o.*, p.name as product_name, p.price as product_price 
            FROM orders o
            JOIN products p ON o.product_id = p.id
            WHERE o.reference_id = ?
        `, [referenceId]);

        if (orders.length === 0) return res.status(404).send('Pesanan tidak ditemukan.');
        const order = orders[0];

        if (order.status !== 'pending') {
            return res.redirect('/');
        }

        const chan = order.payment_channel || 'qris';
        const isQR = chan.toLowerCase() === 'qris';
        const payNo = order.payment_no;
        const qrImageUrl = order.qr_url;
        const expiryMins = 60; // Default

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Instruksi Pembayaran - Lingku</title>
                <link rel="icon" type="image/x-icon" href="/images/fav.ico">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
                <style>
                    body { font-family: 'Inter', sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 20px; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
                    .card { background: white; width: 100%; max-width: 450px; border-radius: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.05); overflow: hidden; }
                    .header { background: #10b981; height: 5px; }
                    .content { padding: 40px 30px; }
                    .timer-container { text-align: center; margin-bottom: 20px; background: #fff1f2; padding: 12px; border-radius: 12px; border: 1px solid #fecdd3; }
                    .timer-label { font-size: 11px; font-weight: 700; color: #e11d48; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
                    .timer-value { font-size: 20px; font-weight: 900; color: #be123c; font-variant-numeric: tabular-nums; }
                    .info-box { background: #f0fdf4; border: 1.5px dashed #10b981; border-radius: 24px; padding: 25px; text-align: center; margin-bottom: 30px; }
                    .pay-label { font-size: 11px; font-weight: 900; color: #065f46; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 15px; }
                    .pay-no { font-size: \${isQR ? '12px' : '28px'}; font-weight: 900; color: #065f46; word-break: break-all; }
                    .qr-container { display: flex; flex-direction: column; align-items: center; gap: 12px; }
                    .qr-img { width: 160px; height: 160px; margin: 0 auto; display: block; border-radius: 16px; background: white; padding: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
                    .download-qr { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background: #f0fdf4; color: #10b981; text-decoration: none; border-radius: 20px; font-size: 11px; font-weight: 800; border: 1px solid #10b98133; transition: 0.2s; margin-top: 5px; }
                    .download-qr:hover { background: #10b981; color: white; transform: translateY(-1px); }
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
                        <div class="timer-container">
                            <div class="timer-label">Selesaikan Pembayaran Dalam</div>
                            <div id="countdown" class="timer-value">--:--</div>
                        </div>
                        <div class="info-box">
                            <div class="pay-label">\${isQR ? 'SILAKAN SCAN QRIS' : 'NOMOR VA ' + chan.toUpperCase()}</div>
                            \${isQR ? \`
                                <div class="qr-container">
                                    <img src="\${qrImageUrl}" class="qr-img">
                                    <a href="\${qrImageUrl}" download="QRIS-Lingku.png" class="download-qr">
                                        <i class="fas fa-download"></i> SIMPAN QRIS
                                    </a>
                                </div>
                            \` : \`<h1 class="pay-no">\${payNo}</h1>\`}
                        </div>
                        <div class="details">
                            <div class="detail-row"><span class="detail-label">Produk</span><span class="detail-val">\${order.product_name}</span></div>
                            <div class="detail-row"><span class="detail-label">Total</span><span class="detail-val" style="color:#10b981; font-size:18px;">Rp \${Number(order.total_price).toLocaleString('id-ID')}</span></div>
                        </div>
                    </div>
                    <div class="footer">
                        <a href="/" class="back-btn">Selesai & Ke Beranda</a>
                    </div>
                </div>
                <script>
                    // Timer Logic
                    const createdAt = new Date('\${order.created_at}').getTime();
                    const now = new Date().getTime();
                    const diffSeconds = Math.floor((now - createdAt) / 1000);
                    let timeLeft = (\${expiryMins} * 60) - diffSeconds;
                    
                    const timerDisplay = document.getElementById('countdown');

                    function updateTimer() {
                        if (timeLeft <= 0) {
                            timerDisplay.innerHTML = "WAKTU HABIS";
                            return;
                        }
                        const m = Math.floor(timeLeft / 60);
                        const s = timeLeft % 60;
                        timerDisplay.innerHTML = \`\${m.toString().padStart(2, '0')}:\${s.toString().padStart(2, '0')}\`;
                        timeLeft--;
                    }
                    setInterval(updateTimer, 1000);
                    updateTimer();

                    // Status Check Logic
                    const rid = '\${referenceId}';
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

    } catch (err) {
        console.error('Payment Page Error:', err);
        res.status(500).send('Terjadi kesalahan saat memuat halaman pembayaran.');
    }
};

exports.ipaymuCallback = async (req, res) => {
    try {
        console.log('--- IPAYMU CALLBACK DEBUG ---');
        const { trx_id, sid, status, status_code } = req.body;
        const incomingSignature = req.headers.signature;
        
        // 1. Fetch Admin iPaymu Config for Verification
        const [adminRows] = await db.execute('SELECT ipaymu_sandbox, ipaymu_va, ipaymu_apikey FROM users WHERE role = "admin" LIMIT 1');
        if (adminRows.length === 0) return res.status(500).send('Admin config not found');
        
        const adminConfig = adminRows[0];
        const isSandbox = adminConfig.ipaymu_sandbox == 1;
        const va = adminConfig.ipaymu_va || (isSandbox ? process.env.IPAYMU_VA_SANDBOX : process.env.IPAYMU_VA_LIVE);
        const apiKey = adminConfig.ipaymu_apikey || (isSandbox ? process.env.IPAYMU_APIKEY_SANDBOX : process.env.IPAYMU_APIKEY_LIVE);

        // 2. Verify Signature (Security Hardening)
        // Note: iPaymu callback usually sends signature in headers. 
        // We verify by recreating the hash from the raw body.
        if (incomingSignature) {
            const jsonBody = JSON.stringify(req.body);
            const bodyHash = crypto.createHash('sha256').update(jsonBody).digest('hex').toLowerCase();
            const stringToSign = `POST:${va}:${bodyHash}:${apiKey}`; // Standard iPaymu v2 Sign Pattern
            const expectedSignature = crypto.createHmac('sha256', apiKey).update(stringToSign).digest('hex').toLowerCase();
            
            if (incomingSignature !== expectedSignature) {
                console.error('[SECURITY ALERT] Invalid iPaymu Callback Signature!');
                return res.status(403).send('Invalid Signature');
            }
        } else {
            // Optional: In production, you might want to reject if no signature is present
            console.warn('[WARNING] Callback received without signature header.');
        }

        // 3. Process Payment Logic
        const isSuccess = status === 'berhasil' || String(status_code) === '1';
        const isExpired = status === 'expired' || String(status_code) === '-2';

        if (isSuccess && sid) {
            // ===== AUTO-HEAL UPGRADE PRO =====
            if (sid.startsWith('UPGRADE-PRO-')) {
                try {
                    const parts = sid.split('-');
                    const targetUserId = parts[2]; // UPGRADE-PRO-{userId}-{timestamp}
                    
                    // 1. Ensure expired_at column exists
                    try { await db.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS expired_at DATETIME AFTER plan"); } catch(err2) {
                        try { await db.execute("ALTER TABLE users ADD COLUMN expired_at DATETIME AFTER plan"); } catch(err3) {}
                    }
                    
                    // 2. Update Plan
                    await db.execute(
                        "UPDATE users SET plan = 'pro', expired_at = DATE_ADD(NOW(), INTERVAL 1 YEAR) WHERE id = ?",
                        [targetUserId]
                    );

                    // 3. Record as Platform Order (Admin ID 1, Product ID 0)
                    try {
                        // Try to update existing pending order first
                        const [updateResult] = await db.execute(
                            "UPDATE orders SET status = 'completed' WHERE reference_id = ? AND product_id = 0",
                            [sid]
                        );

                        // If not found (maybe checkout log failed earlier), insert as fallback
                        if (updateResult.affectedRows === 0) {
                            const [userData] = await db.execute("SELECT fullname, name, email, whatsapp, phone FROM users WHERE id = ?", [targetUserId]);
                            const buyerName = userData[0] ? (userData[0].fullname || userData[0].name) : 'User';
                            const buyerEmail = userData[0] ? userData[0].email : '';
                            const buyerPhone = userData[0] ? (userData[0].whatsapp || userData[0].phone) : '';
                            
                            const [priceRow] = await db.execute("SELECT setting_value FROM settings WHERE setting_key = 'price_pro'");
                            const price = parseFloat(priceRow[0] ? priceRow[0].setting_value : '99000');
                            
                            await db.execute(
                                "INSERT INTO orders (user_id, product_id, reference_id, total_price, status, customer_name, customer_email, customer_whatsapp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                                [1, 0, sid, price, 'completed', buyerName, buyerEmail, buyerPhone]
                            );
                        }
                    } catch(orderErr) { console.error('Platform Order Update Error:', orderErr.message); }

                    console.log(`[UPGRADE] User ID ${targetUserId} has been upgraded to PRO.`);

                    // Run secondary tasks in background so they don't block the OK response
                    (async () => {
                        try {
                            // Fetch user details for email
                            const [userData] = await db.execute("SELECT fullname, name, email FROM users WHERE id = ?", [targetUserId]);
                            if (userData[0]) {
                                const { sendProActivationEmail } = require('../utils/mailer');
                                await sendProActivationEmail(userData[0].email, userData[0].fullname || userData[0].name);
                            }

                            // Add to Admin Notifications
                            await db.execute(
                                "INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)",
                                [1, '👑 Member PRO Baru!', `User ID ${targetUserId} baru saja upgrade ke paket PRO via iPaymu.`, 'system', '/admin/upgrade-orders']
                            );
                        } catch (bgErr) {
                            console.error('Secondary Upgrade Task Error:', bgErr.message);
                        }
                    })();

                    return res.send('OK');
                } catch (upgradeErr) {
                    console.error('Upgrade Process Error:', upgradeErr.message);
                    return res.status(500).send('Upgrade Processing Failed');
                }
            }

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
                
                if (order.status === 'pending' || order.status === 'expired') {
                    const commAmt = parseFloat(order.commission_amount || 0);
                    const totalPrice = parseFloat(order.total_price || 0);
                    const merchantNet = totalPrice - commAmt;

                    // 1. Update Order Status
                    await db.execute(
                        'UPDATE orders SET status = ?, trx_id = ? WHERE id = ?',
                        ['completed', trx_id || null, order.id]
                    );

                    // 2. Add Balance to Merchant (Net Amount)
                    await db.execute(
                        'UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE id = ?',
                        [merchantNet, order.user_id]
                    );

                    // 2b. Add Balance to Affiliate (if exists)
                    if (order.affiliate_id && commAmt > 0) {
                        await db.execute(
                            'UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE id = ?',
                            [commAmt, order.affiliate_id]
                        );
                        
                        // Notify Affiliate
                        try {
                            await db.execute(
                                "INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)",
                                [order.affiliate_id, '💸 Komisi Cair!', `Anda mendapat komisi Rp ${commAmt.toLocaleString('id-ID')} dari penjualan ${order.product_name}`, 'pay', '/admin/affiliate']
                            );
                        } catch (e) {}
                    }

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
                            "INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)",
                            [order.user_id, '💰 Pembayaran Berhasil!', `Rp ${formattedPrice} masuk dari ${order.customer_name}`, 'pay', '/admin/orders']
                        );
                    } catch (e) {
                        console.error('Notification Error:', e.message);
                    }

                    console.log(`[SUCCESS] Order ${sid} completed & Email/Notif sent.`);
                }
            }
        } else if (isExpired && sid) {
            const [orders] = await db.execute('SELECT id, product_id, status FROM orders WHERE reference_id = ?', [sid]);
            if (orders.length > 0) {
                const order = orders[0];
                if (order.status === 'pending') {
                    // Update order to expired
                    await db.execute('UPDATE orders SET status = ? WHERE id = ?', ['expired', order.id]);
                    // Return stock (Only if NOT unlimited)
                    await db.execute('UPDATE products SET stock = stock + 1 WHERE id = ? AND stock >= 0', [order.product_id]);
                    console.log(`[EXPIRED] Order ${sid} expired. Stock returned.`);
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

exports.handleReferral = async (req, res) => {
    try {
        const { affiliateCode } = req.params;
        
        // 1. Verify code exists
        const [users] = await db.execute("SELECT id FROM users WHERE affiliate_code = ?", [affiliateCode]);
        if (users.length === 0) return res.redirect('/');

        // 2. Get cookie duration
        const [settings] = await db.execute("SELECT setting_value FROM settings WHERE setting_key = 'aff_cookie_duration'");
        const days = settings.length > 0 ? parseInt(settings[0].setting_value) : 30;

        // 3. Set Cookie
        res.cookie('ref_by', affiliateCode, { 
            maxAge: 1000 * 60 * 60 * 24 * days, 
            httpOnly: true, 
            path: '/' 
        });

        // 4. Redirect to Home
        res.redirect('/');
    } catch (err) {
        console.error('Handle Referral Error:', err);
        res.redirect('/');
    }
};
