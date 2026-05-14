const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
    console.log('--- DB CONNECTION TEST ---');
    console.log('Host:', process.env.DB_HOST || '153.92.15.37');
    console.log('User:', process.env.DB_USER || 'u427900331_lingku');
    
    try {
        const connection = await mysql.createConnection({
            host: '153.92.15.37',
            user: process.env.DB_USER || 'u427900331_lingku',
            password: process.env.DB_PASS || 'LingkuBaru2026@',
            database: process.env.DB_NAME || 'u427900331_josling',
            connectTimeout: 10000,
            family: 4 // FORCE IPv4
        });
        
        console.log('✅ SUCCESS: Berhasil terhubung ke MySQL Hostinger!');
        const [rows] = await connection.execute('SELECT COUNT(*) as userCount FROM users');
        console.log('📊 Data Check: Jumlah user di DB =', rows[0].userCount);
        
        await connection.end();
    } catch (err) {
        console.error('❌ FAILED: Gagal koneksi ke DB.');
        console.error('Error Code:', err.code);
        console.error('Error Message:', err.message);
        
        if (err.code === 'ETIMEDOUT') {
            console.log('\n👉 ANALISA: Ini fiks masalah Jaringan atau IP belum di-whitelist di Hostinger.');
        } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('\n👉 ANALISA: Username atau Password salah.');
        }
    }
}

testConnection();
