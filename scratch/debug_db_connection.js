const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
    console.log('--- TESTING DATABASE CONNECTION ---');
    console.log('Host:', process.env.DB_HOST);
    console.log('User:', process.env.DB_USER);
    
    const startTime = Date.now();
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            connectTimeout: 5000 // 5 seconds timeout
        });
        
        const [rows] = await connection.execute('SELECT 1 + 1 AS result');
        console.log('✅ BERHASIL! Koneksi ke Database Hostinger Lancar.');
        console.log('Hasil Test:', rows[0].result);
        await connection.end();
    } catch (err) {
        const duration = (Date.now() - startTime) / 1000;
        console.error('❌ GAGAL! Tidak bisa konek ke Database.');
        console.error('Waktu Tunggu:', duration, 'detik');
        console.error('Error Code:', err.code);
        console.error('Error Message:', err.message);
        
        if (err.code === 'ETIMEDOUT') {
            console.log('\nSARAN: IP Lokal Anda belum di-whitelist di Remote MySQL Hostinger.');
        }
    }
}

testConnection();
