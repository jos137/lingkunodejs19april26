const mysql = require('mysql2/promise');
require('dotenv').config();

async function debug() {
    console.log('Attempting to connect to DB...');
    console.log('Host:', process.env.DB_HOST);
    console.log('User:', process.env.DB_USER);
    
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            connectTimeout: 5000
        });
        
        console.log('✔ Connected successfully!');
        const [rows] = await connection.execute('SELECT 1 + 1 AS result');
        console.log('Query result:', rows[0].result);
        await connection.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ Connection failed!');
        console.error('Error Code:', err.code);
        console.error('Error Message:', err.message);
        console.error('Full Error:', err);
        process.exit(1);
    }
}

debug();
