require('dotenv').config();
const db = require('../config/db');

async function test() {
    try {
        const [orderRows] = await db.execute("SELECT * FROM orders WHERE reference_id = 'INV-1779186783183'");
        if (orderRows.length > 0) {
            console.log('ORDER DETAILS:', orderRows[0]);
            
            const userId = orderRows[0].user_id;
            const [sett] = await db.execute('SELECT * FROM settings WHERE user_id = ? LIMIT 1', [userId]);
            console.log('SETTINGS FOR USER:', sett[0]);
        } else {
            console.log('Order not found');
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
test();
