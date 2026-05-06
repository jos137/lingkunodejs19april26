const db = require('./config/db');

async function backfillProOrders() {
    try {
        console.log('--- Memulai Backfill User PRO ---');
        
        // 1. Ambil semua user yang statusnya PRO
        const [proUsers] = await db.execute("SELECT * FROM users WHERE plan = 'pro'");
        console.log(`Ditemukan ${proUsers.length} user PRO.`);

        // 2. Ambil harga PRO saat ini
        const [priceRow] = await db.execute("SELECT setting_value FROM settings WHERE setting_key = 'price_pro'");
        const price = parseFloat(priceRow[0] ? priceRow[0].setting_value : '99000');

        let count = 0;
        for (const user of proUsers) {
            // Cek apakah sudah ada catatan order untuk user ini (berdasarkan email)
            const [existing] = await db.execute("SELECT id FROM orders WHERE product_id = 0 AND buyer_email = ?", [user.email]);
            
            if (existing.length === 0) {
                const refId = `LEGACY-PRO-${user.id}-${Date.now()}`;
                const name = user.fullname || user.name || 'User';
                const phone = user.whatsapp || user.phone || '0';

                await db.execute(
                    "INSERT INTO orders (user_id, product_id, reference_id, total_price, status, buyer_name, buyer_email, buyer_phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [1, 0, refId, price, 'completed', name, user.email, phone, user.created_at]
                );
                count++;
                console.log(`Berhasil menyuntik data PRO: ${user.email}`);
            }
        }

        console.log(`--- Selesai! ${count} data baru disuntikkan ke list Upgrade PRO. ---`);
        process.exit(0);
    } catch (err) {
        console.error('Backfill Error:', err.message);
        process.exit(1);
    }
}

backfillProOrders();
