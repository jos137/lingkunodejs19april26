require('dotenv').config();
const db = require('../config/db');

async function test() {
    try {
        const [timeRows] = await db.execute('SELECT NOW() as now_local, UTC_TIMESTAMP() as now_utc');
        console.log('DATABASE TIME:', timeRows[0]);

        console.log('SYSTEM NODE TIME:', new Date().toString());
        console.log('SYSTEM NODE ISO TIME:', new Date().toISOString());

        // Get details of order #INV-1779186783183
        const [orderRows] = await db.execute("SELECT id, reference_id, created_at, status FROM orders WHERE reference_id = 'INV-1779186783183'");
        if (orderRows.length > 0) {
            const order = orderRows[0];
            console.log('ORDER DETAILS IN DB:', {
                id: order.id,
                reference_id: order.reference_id,
                created_at_db_raw: order.created_at,
                created_at_node_date: new Date(order.created_at).toString(),
                created_at_node_iso: new Date(order.created_at).toISOString(),
                status: order.status
            });

            // Let's test the math
            const expiryMins = 15;
            const createdAt = new Date(order.created_at);
            const expiryDate = new Date(createdAt.getTime() + (expiryMins * 60000));
            const timeLeft = Math.floor((expiryDate - new Date()) / 1000);
            console.log('NODE CALCULATED TIME LEFT (secs):', timeLeft);
        } else {
            console.log('Order INV-1779186783183 not found.');
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit();
    }
}

test();
