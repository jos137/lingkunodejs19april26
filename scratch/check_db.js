const db = require('./config/db');

async function checkTables() {
    try {
        const [rows] = await db.execute('SHOW TABLES');
        console.log('Tables in database:', rows);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkTables();
