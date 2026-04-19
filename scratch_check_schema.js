const db = require('./config/db');
async function check() {
    try {
        const [p] = await db.execute('DESCRIBE products');
        console.log('PRODUCTS:', p.map(c => c.Field));
        const [o] = await db.execute('DESCRIBE orders');
        console.log('ORDERS:', o.map(c => c.Field));
        process.exit(0);
    } catch(e) { console.error(e); process.exit(1); }
}
check();
