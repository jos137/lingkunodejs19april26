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
    connectTimeout: 10000, // gagal cepat agar bisa retry
    enableKeepAlive: true,
    keepAliveInitialDelay: 5000,
    // Tahan koneksi lebih lama untuk mengurangi lonjakan koneksi baru
    maxIdle: 10,
    idleTimeout: 300000
});

pool.on('connection', (connection) => console.log('  [DEBUG] New connection established'));
pool.on('enqueue', () => console.log('  [DEBUG] Waiting for available connection slot...'));
pool.on('error', (err) => console.error('  [DB POOL ERROR - server tetap hidup]:', err.code || err.message));

// Error yang terjadi SAAT KONEK (query belum terkirim) -> aman di-retry,
// termasuk untuk query tulis.
const CONNECT_ERRORS = new Set(['ETIMEDOUT', 'ECONNREFUSED']);
// Error lain yang transien -> hanya di-retry untuk query baca.
const TRANSIENT_ERRORS = new Set(['ETIMEDOUT', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ECONNREFUSED', 'EPIPE']);
const READ_SQL = /^\s*(select|show|describe|desc|explain|with)\b/i;

// Retry untuk pool.query (dipakai session store & sebagian kode app).
// PromisePool.query juga memakai pool.query ini, jadi ikut terlindungi.
const _rawQuery = pool.query.bind(pool);
pool.query = function (sql, values, cb) {
    if (typeof values === 'function') { cb = values; values = undefined; }
    const maxAttempts = 3;
    let attempt = 0;
    const run = () => {
        _rawQuery(sql, values, (err, results, fields) => {
            if (err && CONNECT_ERRORS.has(err.code) && attempt < maxAttempts - 1) {
                attempt += 1;
                console.log(`  [DB] retry ${attempt} setelah ${err.code}...`);
                setTimeout(run, 300 * attempt);
                return;
            }
            if (typeof cb === 'function') cb(err, results, fields);
        });
    };
    run();
};

const promisePool = pool.promise();
promisePool.pool = pool;

function wrapExecute(method) {
    return async function (sql, params) {
        const maxAttempts = 3;
        let attempt = 0;
        while (true) {
            try {
                return await method.call(promisePool, sql, params);
            } catch (err) {
                const connectFail = CONNECT_ERRORS.has(err && err.code);
                const readFail = TRANSIENT_ERRORS.has(err && err.code) && READ_SQL.test(String(sql || ''));
                const canRetry = (connectFail || readFail) && attempt < maxAttempts - 1;
                if (!canRetry) throw err;
                attempt += 1;
                console.log(`  [DB] retry ${attempt} setelah ${err.code}...`);
                await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
            }
        }
    };
}

const _execute = promisePool.execute.bind(promisePool);
promisePool.execute = wrapExecute(_execute);

module.exports = promisePool;
