require('dotenv').config();
const db = require('../config/db');

async function test() {
    console.log('Testing DB connection...');
    try {
        const [rows] = await db.execute('SELECT 1 + 1 AS result');
        console.log('DB Connection Successful. Result:', rows[0].result);
        process.exit(0);
    } catch (err) {
        console.error('DB Connection Failed:', err.message);
        process.exit(1);
    }
}

test();
