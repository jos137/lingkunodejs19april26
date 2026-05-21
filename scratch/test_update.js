require('dotenv').config();
const db = require('../config/db');

async function test() {
    const userId = 1;
    const expiryMins = 15;
    try {
        console.log('Running test UPDATE...');
        const [result] = await db.execute(
            `UPDATE orders 
             SET status = 'expired' 
             WHERE user_id = ? 
               AND status = 'pending' 
               AND created_at < NOW() - INTERVAL ? MINUTE`,
            [userId, expiryMins]
        );
        console.log('UPDATE RESULT:', result);
    } catch (e) {
        console.error('UPDATE ERROR:', e);
    } finally {
        process.exit();
    }
}
test();
