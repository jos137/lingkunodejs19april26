const mysql = require('mysql2');

console.log('  [DB] Starting Deep Debugger Connection...');
const pool = mysql.createPool({
    host: process.env.DB_HOST || '153.92.15.37',
    user: process.env.DB_USER || 'u427900331_lingku',
    password: process.env.DB_PASS || 'JospX~5WxA2k#i2',
    database: process.env.DB_NAME || 'u427900331_josling',
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 10000,
    debug: false,
    family: 4 // PAKSA PAKAI IPv4
});

// Tambahan log manual untuk setiap kejadian
pool.on('acquire', (connection) => console.log('  [DEBUG] Connection %d acquired', connection.threadId));
pool.on('connection', (connection) => console.log('  [DEBUG] New connection established'));
pool.on('enqueue', () => console.log('  [DEBUG] Waiting for available connection slot...'));

const promisePool = pool.promise();
promisePool.pool = pool;

module.exports = promisePool;
