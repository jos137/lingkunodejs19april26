const db = require('../config/db');
async function check() {
    try {
        const [orders] = await db.execute('DESCRIBE orders');
        console.log('--- ORDERS TABLE ---');
        console.table(orders);
        
        const [products] = await db.execute('DESCRIBE products');
        console.log('--- PRODUCTS TABLE ---');
        console.table(products);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
