const db = require('../config/db');

exports.getDashboardData = async (req, res) => {
    try {
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);
        const filterDate = req.query.date || null; // Ambil parameter tanggal dari URL

        // Base Query Condition
        let dateCondition = "WHERE user_id = ?";
        let queryParams = [userId];
        
        if (filterDate) {
            dateCondition += " AND DATE(created_at) = ?";
            queryParams.push(filterDate);
        }

        // Total revenue (completed orders)
        let totalRevenue = 0, totalSales = 0;
        try {
            const [revRow] = await db.execute(
                `SELECT COALESCE(SUM(total_price), 0) as total_revenue, COUNT(*) as total_sales FROM orders ${dateCondition} AND status = 'completed'`,
                queryParams
            );
            totalRevenue = revRow[0].total_revenue;
            totalSales = revRow[0].total_sales;
        } catch(e) { console.log('Revenue query skipped:', e.message); }

        // Balance (Always Cumulative - Saldo tidak dipicu per tanggal)
        let balance = 0;
        try {
            const [allRevRow] = await db.execute(
                "SELECT COALESCE(SUM(total_price), 0) as total_revenue FROM orders WHERE user_id = ? AND status = 'completed'",
                [userId]
            );
            const [wdRow] = await db.execute(
                "SELECT COALESCE(SUM(amount), 0) as total_wd FROM withdrawals WHERE user_id = ? AND status IN ('completed','pending')",
                [userId]
            );
            balance = parseFloat(allRevRow[0].total_revenue) - parseFloat(wdRow[0].total_wd);
        } catch(e) { balance = 0; }

        // Total products
        let totalProducts = 0;
        try {
            const [prodRow] = await db.execute('SELECT COUNT(*) as total FROM products WHERE user_id = ?', [userId]);
            totalProducts = prodRow[0].total;
        } catch(e) {}

        // Today's Sales
        let todaySales = 0;
        try {
            const [todayRow] = await db.execute(
                "SELECT COALESCE(SUM(total_price), 0) as total FROM orders WHERE user_id = ? AND status = 'completed' AND DATE(created_at) = CURDATE()",
                [userId]
            );
            todaySales = todayRow[0].total;
        } catch(e) { todaySales = 0; }

        // User info (handle missing slug column gracefully)
        let slug = 'username';
        let userName = 'Admin';
        try {
            const [userRow] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
            if (userRow[0]) {
                userName = userRow[0].name || 'Admin';
                slug = userRow[0].slug || userRow[0].username || 'username';
            }
        } catch(e) { console.log('User query note:', e.message); }

        // Chart data
        let chartData = [];
        try {
            let chartQuery = "SELECT DATE(created_at) as date, COALESCE(SUM(total_price), 0) as revenue, COUNT(*) as orders FROM orders WHERE user_id = ? AND status = 'completed'";
            let chartParams = [userId];

            if (filterDate) {
                chartQuery += " AND DATE(created_at) = ?";
                chartParams.push(filterDate);
            } else {
                chartQuery += " AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
            }

            chartQuery += " GROUP BY DATE(created_at) ORDER BY date ASC";
            
            const [rows] = await db.execute(chartQuery, chartParams);
            chartData = rows;
        } catch(e) { console.log('Chart query error:', e.message); }

        res.render('admin/dashboard', {
            title: 'Dashboard',
            layout: './layouts/admin',
            stats: {
                total_revenue: totalRevenue,
                balance: balance,
                total_sales: totalSales,
                total_products: totalProducts,
                today_sales: todaySales,
                platform_sales: 0,
                slug: slug
            },
            chartData,
            filterDate,
            user: req.session.user || { name: userName, role: 'admin', roleDisplay: 'Administrator' }
        });
    } catch (err) {
        console.error('Dashboard Error:', err.message);
        res.render('admin/dashboard', {
            title: 'Dashboard',
            layout: './layouts/admin',
            stats: {},
            chartData: [],
            user: req.session.user || { name: 'Admin', role: 'admin', roleDisplay: 'Administrator' }
        });
    }
};

exports.updateSlug = async (req, res) => {
    try {
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);
        const { slug } = req.body;

        if (!slug || slug.length < 3) {
            return res.json({ success: false, message: 'Slug minimal 3 karakter.' });
        }

        // Try to add slug column if not exists
        try {
            await db.execute("ALTER TABLE users ADD COLUMN slug VARCHAR(100) DEFAULT NULL");
        } catch(e) {} // column already exists, ignore

        // Check duplicate
        const [existing] = await db.execute('SELECT id FROM users WHERE slug = ? AND id != ?', [slug, userId]);
        if (existing.length > 0) {
            return res.json({ success: false, message: 'Slug sudah dipakai user lain.' });
        }

        await db.execute('UPDATE users SET slug = ? WHERE id = ?', [slug, userId]);
        
        // Update session
        if (req.session.user) req.session.user.slug = slug;
        
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
};
