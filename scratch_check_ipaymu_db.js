const db = require('./config/db');
async function check() {
    try {
        const [rows] = await db.execute('SELECT id, role, ipaymu_sandbox, ipaymu_va, ipaymu_apikey FROM users WHERE role = "admin" LIMIT 1');
        console.log(JSON.stringify(rows[0], null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
