require('dotenv').config();
const db = require('../config/db');

async function cleanup() {
    try {
        console.log("--- CLEANING UP feature_flags ---");
        
        // 1. Ambil data mentah buat analisa
        const [rows] = await db.execute("SELECT * FROM feature_flags");
        console.log(`Found ${rows.length} rows.`);

        // 2. Hapus semua baris yang feature_key-nya kosong atau aneh
        await db.execute("DELETE FROM feature_flags WHERE feature_key = '' OR feature_key IS NULL");

        // 3. Pastikan fitur utama cuma ada SATU tiap kuncinya
        const mainKeys = ['enable_announcement', 'enable_affiliate', 'show_today_sales'];
        
        for (const key of mainKeys) {
            const [existing] = await db.execute("SELECT id FROM feature_flags WHERE feature_key = ?", [key]);
            if (existing.length > 1) {
                console.log(`Found duplicate for ${key}, keeping only the first one...`);
                const keepId = existing[0].id;
                await db.execute("DELETE FROM feature_flags WHERE feature_key = ? AND id != ?", [key, keepId]);
            }
        }

        console.log("Cleanup Success!");
        process.exit(0);
    } catch (e) {
        console.error("Cleanup Failed:", e.message);
        process.exit(1);
    }
}

cleanup();
