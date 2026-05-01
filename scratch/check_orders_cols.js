require('dotenv').config();
const db = require('../config/db');

async function checkOrdersCols() {
    try {
        const [rows] = await db.execute('SHOW COLUMNS FROM orders');
        console.log('Columns in orders table:');
        rows.forEach(row => {
            console.log(`- ${row.Field} (${row.Type})`);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkOrdersCols();
