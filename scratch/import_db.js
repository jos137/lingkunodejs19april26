const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function importDatabase() {
    console.log('🚀 MEMULAI PROSES IMPORT DATABASE LOKAL...');
    
    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '',
    };

    const dbName = process.env.DB_NAME || 'u427900331_josling';
    const sqlFile = path.join(__dirname, '6mei26_u427900331_josling.sql');

    try {
        // 1. Koneksi tanpa database dulu untuk buat DB
        const connection = await mysql.createConnection(dbConfig);
        console.log(`✔ Terhubung ke MySQL Lokal.`);
        
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
        console.log(`✔ Database '${dbName}' siap.`);
        await connection.query(`USE ${dbName}`);

        // 2. Baca file SQL
        console.log(`📖 Membaca file SQL (ini mungkin butuh waktu)...`);
        const sql = fs.readFileSync(sqlFile, 'utf8');
        
        // 3. Pisahkan query berdasarkan titik koma (;)
        // Catatan: Ini cara sederhana, mungkin butuh penyesuaian jika ada trigger/stored procedure
        const queries = sql.split(/;\s*$/m);

        console.log(`⚡ Mengeksekusi ${queries.length} perintah SQL...`);
        for (let query of queries) {
            query = query.trim();
            if (query.length > 0) {
                try {
                    await connection.query(query);
                } catch (err) {
                    // Abaikan error tertentu yang tidak fatal
                    if (!err.message.includes('already exists')) {
                        console.warn('  ⚠️ Warning pada query:', query.substring(0, 50) + '...', err.message);
                    }
                }
            }
        }

        console.log('✅ SELESAI! Database lokal Anda sudah terisi data terbaru.');
        await connection.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ GAGAL IMPORT:', err.message);
        process.exit(1);
    }
}

importDatabase();
