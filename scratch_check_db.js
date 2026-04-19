const db = require('./config/db');

async function checkSchema() {
    try {
        console.log('Checking orders table...');
        const [ordersCols] = await db.execute('SHOW COLUMNS FROM orders');
        console.log('Orders Columns:', ordersCols.map(c => c.Field).join(', '));

        console.log('Checking products table...');
        const [productsCols] = await db.execute('SHOW COLUMNS FROM products');
        console.log('Products Columns:', productsCols.map(c => c.Field).join(', '));
        
        const [firstOrder] = await db.execute('SELECT * FROM orders LIMIT 1');
        console.log('Sample Order:', firstOrder[0]);

        process.exit(0);
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

checkSchema();
