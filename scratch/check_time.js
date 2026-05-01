require('dotenv').config();
const db = require('../config/db');

async function checkTime() {
    try {
        const [rows] = await db.execute('SELECT NOW() as now, UTC_TIMESTAMP() as utc, @@system_time_zone as sys_tz, @@time_zone as tz');
        console.log('MySQL Time Info:');
        console.log(rows[0]);
        
        const [orders] = await db.execute('SELECT id, created_at, status FROM orders WHERE status != "completed" ORDER BY id DESC LIMIT 5');
        console.log('\nLatest Non-Completed Orders:');
        orders.forEach(o => {
            console.log(`ID: ${o.id}, created_at: ${o.created_at}, status: ${o.status}`);
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkTime();
