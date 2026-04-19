const db = require('./config/db');
async function check() {
    try {
        const [cols] = await db.execute('SHOW COLUMNS FROM users');
        console.log(JSON.stringify(cols, null, 2));
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
check();
