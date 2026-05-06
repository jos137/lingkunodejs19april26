const db = require('../config/db');

async function checkDatabase() {
    try {
        console.log('--- Mengecek Database Hostinger ---');
        
        // 1. Cek semua order upgrade (product_id = 0)
        const [orders] = await db.execute("SELECT * FROM orders WHERE product_id = 0 ORDER BY id DESC LIMIT 10");
        console.log(`Ditemukan ${orders.length} pesanan upgrade PRO.`);
        
        if (orders.length > 0) {
            console.table(orders.map(o => ({
                id: o.id,
                email: o.buyer_email,
                status: o.status,
                ref: o.reference_id,
                tgl: o.created_at
            })));
        } else {
            console.log('TIDAK ADA data di tabel orders dengan product_id = 0.');
        }

        // 2. Cek user yang sudah PRO
        const [proUsers] = await db.execute("SELECT id, email, plan FROM users WHERE plan = 'pro' LIMIT 5");
        console.log(`\nContoh User PRO di tabel users:`);
        console.table(proUsers);

        process.exit(0);
    } catch (err) {
        console.error('Koneksi Gagal:', err.message);
        process.exit(1);
    }
}

checkDatabase();
