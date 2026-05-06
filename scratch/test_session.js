const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const db = require('../config/db');

try {
    const sessionStore = new MySQLStore({
        clearExpired: true,
        checkExpirationInterval: 900000,
        expiration: 86400000
    }, db);
    console.log('Session store created successfully');
    process.exit(0);
} catch (err) {
    console.error('Session store creation failed:', err.message);
    process.exit(1);
}
