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
    connectTimeout: 10000, // lebih cepat gagal agar bisa retry
    enableKeepAlive: true,
    keepAliveInitialDelay: 5000,
    // Tahan koneksi lebih lama untuk mengurangi lonjakan koneksi baru
    // (jaringan ke DB kadang intermiten / timeout).
    maxIdle: 10,
    idleTimeout: 300000
});

// Tambahan log manual untuk setiap kejadian (acquire dimatikan: terlalu berisik)
pool.on('connection', (connection) => console.log('  [DEBUG] New connection established'));
pool.on('enqueue', () => console.log('  [DEBUG] Waiting for available connection slot...'));
// WAJIB: tanpa listener ini, 1x ETIMEDOUT membuat seluruh server crash
pool.on('error', (err) => console.error('  [DB POOL ERROR - server tetap hidup]:', err.code || err.message));

const promisePool = pool.promise();
promisePool.pool = pool;

// Retry khusus query BACA (SELECT/SHOW/...). Query tulis tidak di-retry
// agar tidak terjadi duplikasi data.
const READ_SQL = /^\s*(select|show|describe|desc|explain|with)\b/i;
const TRANSIENT = new Set(['ETIMEDOUT', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ECONNREFUSED', 'EPIPE']);

function wrapRead(method) {
    return async function (sql, params) {
        const maxAttempts = 3;
        let attempt = 0;
        while (true) {
            try {
                return await method.call(promisePool, sql, params);
            } catch (err) {
                const canRetry = TRANSIENT.has(err && err.code)
                    && READ_SQL.test(String(sql || ''))
                    && attempt < maxAttempts - 1;
                if (!canRetry) throw err;
                attempt += 1;
                console.log(`  [DB] retry ${attempt} setelah ${err.code}...`);
                await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
            }
        }
    };
}

const _execute = promisePool.execute.bind(promisePool);
const _query = promisePool.query.bind(promisePool);
promisePool.execute = wrapRead(_execute);
promisePool.query = wrapRead(_query);

module.exports = promisePool;
