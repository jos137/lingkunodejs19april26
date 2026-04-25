const db = require('./config/db');

async function checkSchema() {
    try {
        const [users] = await db.execute('DESCRIBE users');
        console.log('--- USERS TABLE ---');
        console.table(users);

        const [settings] = await db.execute('DESCRIBE settings');
        console.log('--- SETTINGS TABLE ---');
        console.table(settings);

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

checkSchema();
