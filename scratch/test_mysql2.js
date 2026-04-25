console.log('Requiring mysql2...');
try {
    const mysql = require('mysql2');
    console.log('mysql2 required successfully.');
} catch (e) {
    console.error('Error requiring mysql2:', e.message);
}
process.exit(0);
