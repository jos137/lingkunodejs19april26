require('dotenv').config();
const db = require('../config/db');

async function test() {
    const userId = 1;
    const searchQuery = 'Jaenudin udin';
    const searchType = 'all';
    const limit = 20;
    const offset = 0;

    console.log('Testing search query with:', { searchQuery, searchType, userId });

    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) as total FROM orders o WHERE o.user_id = ?';
    let countParams = [userId];
    
    let searchCond = '';
    let searchParams = [];
    if (searchQuery) {
        if (searchType === 'name') {
            searchCond = ' AND o.customer_name LIKE ?';
            searchParams.push(`%${searchQuery}%`);
        } else if (searchType === 'email') {
            searchCond = ' AND o.customer_email LIKE ?';
            searchParams.push(`%${searchQuery}%`);
        } else if (searchType === 'phone') {
            searchCond = ' AND o.customer_whatsapp LIKE ?';
            searchParams.push(`%${searchQuery}%`);
        } else {
            searchCond = ' AND (o.customer_name LIKE ? OR o.customer_email LIKE ? OR o.customer_whatsapp LIKE ? OR o.reference_id LIKE ?)';
            searchParams.push(`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`);
        }
    }

    if (searchCond) {
        countSql += searchCond;
        countParams.push(...searchParams);
    }

    try {
        const [countRow] = await db.execute(countSql, countParams);
        console.log('COUNT SQL RESULTS:', countRow);

        let orderSql = `SELECT o.*, 
                    COALESCE(o.status, 'pending') as status,
                    COALESCE(p.name, 'Produk Tidak Terdeteksi') as product_name, 
                    p.price as product_price
             FROM orders o
             LEFT JOIN products p ON o.product_id = p.id
             WHERE o.user_id = ?`;
        let orderParams = [userId];
        
        if (searchCond) {
            orderSql += searchCond;
            orderParams.push(...searchParams);
        }
        
        orderSql += ' ORDER BY o.id DESC LIMIT ? OFFSET ?';
        orderParams.push(limit, offset);

        console.log('Executing ORDER SQL...');
        const [orders] = await db.execute(orderSql, orderParams);
        console.log('ORDERS RETURNED COUNT:', orders.length);
        if (orders.length > 0) {
            console.log('ORDERS DETAILS:', orders.map(o => ({ id: o.id, customer_name: o.customer_name, customer_email: o.customer_email })));
        } else {
            console.log('No orders matched.');
        }

    } catch (e) {
        console.error('SQL Execution Error:', e.message);
    } finally {
        process.exit();
    }
}

test();
