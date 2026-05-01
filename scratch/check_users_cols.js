require('dotenv').config();
const db = require('../config/db');

async function checkColumns() {
    try {
        const [rows] = await db.execute('SHOW COLUMNS FROM users');
        console.log('Columns in users table:');
        rows.forEach(row => {
            console.log(`- ${row.Field} (${row.Type})`);
        });
        process.exit(0);
    } catch (err) {
        console.error('Error checking columns:', err);
        process.exit(1);
    }
}

checkColumns();
