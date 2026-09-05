const mysql = require('mysql2');
require('dotenv').config();

const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
    throw new Error(`Missing database environment variables: ${missingEnv.join(', ')}`);
}

console.log('  [DB] Starting Connection Pool...');
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 30000, // longgar untuk jaringan seluler/tethering
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    // reconnect otomatis saat koneksi idle diputus server
    maxIdle: 10,
    idleTimeout: 60000
});

// Tambahan log manual untuk setiap kejadian (acquire dimatikan: terlalu berisik)
pool.on('connection', (connection) => console.log('  [DEBUG] New connection established'));
pool.on('enqueue', () => console.log('  [DEBUG] Waiting for available connection slot...'));
// WAJIB: tanpa listener ini, 1x ETIMEDOUT membuat seluruh server crash
pool.on('error', (err) => console.error('  [DB POOL ERROR - server tetap hidup]:', err.code || err.message));

const promisePool = pool.promise();
promisePool.pool = pool;

module.exports = promisePool;
