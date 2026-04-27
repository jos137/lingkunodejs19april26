require('dotenv').config();
const db = require('../config/db');
async function check() {
    try {
        const [rows] = await db.execute("DESCRIBE feature_flags");
        console.log("STRUCTURE OF feature_flags:");
        console.table(rows);
        process.exit(0);
    } catch (e) {
        console.error("FULL ERROR:", e);
        process.exit(1);
    }
}
check();
