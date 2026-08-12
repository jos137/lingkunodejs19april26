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
    connectTimeout: 10000,
    debug: false
});

// Tambahan log manual untuk setiap kejadian
pool.on('acquire', (connection) => console.log('  [DEBUG] Connection %d acquired', connection.threadId));
pool.on('connection', (connection) => console.log('  [DEBUG] New connection established'));
pool.on('enqueue', () => console.log('  [DEBUG] Waiting for available connection slot...'));

const promisePool = pool.promise();
promisePool.pool = pool;

module.exports = promisePool;
