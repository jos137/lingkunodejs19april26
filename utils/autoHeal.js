const db = require('../config/db');

async function runAutoHeal() {
    console.log('🛡 Starting Permanent Auto-Heal...');
    try {
        // 1. USERS TABLE
        try {
            await db.execute("SELECT expired_at FROM users LIMIT 1");
        } catch (e) {
            if (e.message.includes('Unknown column')) {
                await db.execute("ALTER TABLE users ADD COLUMN expired_at DATETIME DEFAULT NULL AFTER plan");
            }
        }
        try { await db.execute("ALTER TABLE users ADD COLUMN sidebar_theme VARCHAR(50) DEFAULT 'default' AFTER bio"); } catch(e){}
        try { await db.execute("ALTER TABLE users ADD COLUMN affiliate_code VARCHAR(50) UNIQUE DEFAULT NULL AFTER email"); } catch(e){}
        try { await db.execute("ALTER TABLE users ADD COLUMN referred_by INT DEFAULT NULL AFTER affiliate_code"); } catch(e){}
        try { await db.execute("ALTER TABLE users ADD COLUMN ipaymu_sandbox TINYINT(1) DEFAULT 0"); } catch(e){}
        try { await db.execute("ALTER TABLE users ADD COLUMN ipaymu_expiry INT DEFAULT 15"); } catch(e){}

        // 2. PRODUCTS TABLE (Image Columns)
        const productCols = [
            'thumbnail VARCHAR(255) DEFAULT NULL',
            'image_url TEXT DEFAULT NULL',
            'image_small VARCHAR(255) DEFAULT NULL',
            'cover_image VARCHAR(255) DEFAULT NULL',
            'photo VARCHAR(255) DEFAULT NULL',
            'stock INT DEFAULT 999',
            'download_url TEXT',
            'is_affiliate TINYINT(1) DEFAULT 1',
            'commission_percent DECIMAL(5,2) DEFAULT 20.00'
        ];
        for (const colDef of productCols) {
            const colName = colDef.split(' ')[0];
            try {
                await db.execute(`SELECT ${colName} FROM products LIMIT 1`);
            } catch (e) {
                if (e.message.includes('Unknown column')) {
                    await db.execute(`ALTER TABLE products ADD COLUMN ${colDef}`);
                }
            }
        }

        // 3. NOTIFICATIONS TABLE
        await db.execute(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(255),
                message TEXT,
                type VARCHAR(50) DEFAULT 'info',
                link VARCHAR(255),
                is_read TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        try { await db.execute("ALTER TABLE notifications ADD COLUMN link VARCHAR(255) AFTER type"); } catch(e){}

        // 4. FEATURE FLAGS
        await db.execute(`
            CREATE TABLE IF NOT EXISTS feature_flags (
                id INT AUTO_INCREMENT PRIMARY KEY,
                feature_key VARCHAR(50) UNIQUE NOT NULL,
                feature_name VARCHAR(100) NOT NULL,
                flag_key VARCHAR(100) UNIQUE,
                description TEXT,
                is_enabled TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        try { await db.execute("ALTER TABLE feature_flags ADD COLUMN is_enabled TINYINT(1) DEFAULT 0 AFTER description"); } catch(e){}
        try { await db.execute("ALTER TABLE feature_flags ADD COLUMN text_value TEXT AFTER is_enabled"); } catch(err){}
        try { await db.execute("ALTER TABLE feature_flags ADD COLUMN color_value VARCHAR(50) AFTER text_value"); } catch(err){}

        // Ensure default flags
        const defaultFlags = [
            { key: 'enable_announcement', desc: 'Menampilkan pengumuman di dashboard', val: 1 },
            { key: 'enable_affiliate', desc: 'Menampilkan menu affiliate di sidebar', val: 1 },
            { key: 'show_today_sales', desc: 'Menampilkan statistik penjualan hari ini', val: 1 },
            { key: 'enable_pro_upgrade', desc: 'Menampilkan penawaran Upgrade ke Paket PRO', val: 1 }
        ];
        for (const f of defaultFlags) {
            try {
                await db.execute(`
                    INSERT IGNORE INTO feature_flags (feature_key, feature_name, flag_key, description, is_enabled) 
                    VALUES (?, ?, ?, ?, ?)`, 
                    [f.key, f.desc, f.key, f.desc, f.val]
                );
            } catch (err) {}
        }

        // 5. WITHDRAWALS TABLE
        await db.execute(`
            CREATE TABLE IF NOT EXISTS withdrawals (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                amount DECIMAL(15,2) NOT NULL,
                bank_name VARCHAR(100),
                account_number VARCHAR(100),
                account_name VARCHAR(100),
                status ENUM('pending', 'completed', 'rejected') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        try { await db.execute("ALTER TABLE withdrawals ADD COLUMN bank_name VARCHAR(100) AFTER amount"); } catch(e){}
        try { await db.execute("ALTER TABLE withdrawals ADD COLUMN account_name VARCHAR(100) AFTER account_number"); } catch(e){}

        // 6. ORDERS TABLE
        const orderCols = [
            'user_id INT',
            'reference_id VARCHAR(100)',
            'customer_name VARCHAR(255)',
            'customer_email VARCHAR(255)',
            'customer_whatsapp VARCHAR(50)',
            'total_price DECIMAL(15,2)',
            'payment_channel VARCHAR(50)',
            'customer_ip VARCHAR(50)'
        ];
        for (const colDef of orderCols) {
            const colName = colDef.split(' ')[0];
            try {
                await db.execute(`SELECT ${colName} FROM orders LIMIT 1`);
            } catch (e) {
                if (e.message.includes('Unknown column')) {
                    await db.execute(`ALTER TABLE orders ADD COLUMN ${colDef}`);
                }
            }
        }

        console.log('✔ Permanent Auto-Heal Completed.');
    } catch (err) {
        console.error('❌ Auto-Heal Critical Error:', err.message);
    }
}

module.exports = { runAutoHeal };
