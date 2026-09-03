const db = require('../config/db');

exports.getDashboardData = async (req, res) => {
    try {
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);
        const filterDate = req.query.date || null;
        const filterMonth = req.query.month || null;

        // Base Query Condition
        let dateCondition = "WHERE user_id = ?";
        let queryParams = [userId];
        
        if (filterDate) {
            dateCondition += " AND DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) = ?";
            queryParams.push(filterDate);
        } else if (filterMonth) {
            dateCondition += " AND DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) BETWEEN ? AND LAST_DAY(?)";
            queryParams.push(filterMonth + '-01', filterMonth + '-01');
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

        // Today's Sales (Fixed for GMT+7 WIB)
        let todaySales = 0;
        try {
            const [todayRow] = await db.execute(
                "SELECT COALESCE(SUM(total_price), 0) as total FROM orders WHERE user_id = ? AND status = 'completed' AND DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))",
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
                userName = userRow[0].fullname || userRow[0].name || 'Admin';
                slug = userRow[0].slug || userRow[0].username || 'username';
            }
        } catch(e) { console.log('User query note:', e.message); }

        // Chart data (Fixed for GMT+7 WIB)
        let chartData = [];
        try {
            let chartQuery = "SELECT DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) as date, COALESCE(SUM(total_price), 0) as revenue, COUNT(*) as orders FROM orders WHERE user_id = ? AND status = 'completed'";
            let chartParams = [userId];

            if (filterDate) {
                chartQuery += " AND DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) = ?";
                chartParams.push(filterDate);
            } else if (filterMonth) {
                chartQuery += " AND DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) BETWEEN ? AND LAST_DAY(?)";
                chartParams.push(filterMonth + '-01', filterMonth + '-01');
            } else {
                chartQuery += " AND CONVERT_TZ(created_at, '+00:00', '+07:00') >= DATE_SUB(DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00')), INTERVAL 30 DAY)";
            }

            chartQuery += " GROUP BY date ORDER BY date ASC";
            
            const [rows] = await db.execute(chartQuery, chartParams);
            chartData = rows;
        } catch(e) { console.log('Chart query error:', e.message); }

        // Visitor data: unique IPs per day (GMT+7 WIB), same range as revenue chart
        let visitMap = {};
        try {
            let visitQuery = "SELECT DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) as date, COUNT(*) as visitors FROM profile_visits WHERE user_id = ?";
            let visitParams = [userId];

            if (filterDate) {
                visitQuery += " AND DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) = ?";
                visitParams.push(filterDate);
            } else if (filterMonth) {
                visitQuery += " AND DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) BETWEEN ? AND LAST_DAY(?)";
                visitParams.push(filterMonth + '-01', filterMonth + '-01');
            } else {
                visitQuery += " AND CONVERT_TZ(created_at, '+00:00', '+07:00') >= DATE_SUB(DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00')), INTERVAL 30 DAY)";
            }

            visitQuery += " GROUP BY date";
            const [vRows] = await db.execute(visitQuery, visitParams);
            const normDay = (d) => {
                if (!d) return '';
                if (d instanceof Date) return d.toISOString().slice(0, 10);
                return String(d).slice(0, 10);
            };
            vRows.forEach(r => { visitMap[normDay(r.date)] = parseInt(r.visitors || 0, 10); });
        } catch(e) { console.log('Visit query error:', e.message); }

        // Merge revenue + visitors into one date series (days with visits but no sales still show)
        try {
            const normDay = (d) => {
                if (!d) return '';
                if (d instanceof Date) return d.toISOString().slice(0, 10);
                return String(d).slice(0, 10);
            };
            const merged = {};
            chartData.forEach(d => {
                const k = normDay(d.date);
                merged[k] = { date: k, revenue: parseFloat(d.revenue || 0), orders: parseInt(d.orders || 0, 10), visitors: 0 };
            });
            Object.entries(visitMap).forEach(([k, v]) => {
                if (merged[k]) merged[k].visitors = v;
                else merged[k] = { date: k, revenue: 0, orders: 0, visitors: v };
            });
            chartData = Object.keys(merged).sort().map(k => merged[k]);
        } catch(e) { console.log('Chart merge error:', e.message); }

        const chartTotal = chartData.reduce((sum, d) => sum + parseFloat(d.revenue || 0), 0);

        res.render('admin/dashboard', {
            title: 'Dashboard',
            layout: './layouts/admin',
            stats: {
                total_revenue: totalRevenue,
                balance: balance,
                total_sales: totalSales,
                total_products: totalProducts,
                today_sales: todaySales,
                platform_sales: await (async () => {
                    try {
                        // 1. Get from recorded orders (most accurate for future)
                        const [psRow] = await db.execute("SELECT COALESCE(SUM(total_price), 0) as total FROM orders WHERE product_id = 0 AND status = 'completed'");
                        let total = parseFloat(psRow[0].total);

                        // 2. Fallback for historical data (Count PRO users not in orders)
                        const [priceRow] = await db.execute("SELECT setting_value FROM settings WHERE setting_key = 'price_pro'");
                        const currentPrice = parseFloat(priceRow[0] ? priceRow[0].setting_value : '99000');
                        
                        const [orderCountRow] = await db.execute("SELECT COUNT(*) as count FROM orders WHERE product_id = 0 AND status = 'completed'");
                        const recordedCount = orderCountRow[0].count;

                        const [proUserRow] = await db.execute("SELECT COUNT(*) as count FROM users WHERE plan = 'pro'");
                        const totalProUsers = proUserRow[0].count;

                        const unrecordedProCount = Math.max(0, totalProUsers - recordedCount);
                        total += (unrecordedProCount * currentPrice);

                        return total;
                    } catch(e) { return 0; }
                })(),
                slug: slug
            },
            chartData,
            chartTotal,
            filterDate,
            filterMonth,
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
