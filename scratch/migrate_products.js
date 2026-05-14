const db = require('../config/db');

async function migrate() {
    try {
        console.log('Starting migration...');
        
        // Add thumbnail_style
        try {
            await db.execute("ALTER TABLE products ADD COLUMN thumbnail_style VARCHAR(50) DEFAULT 'callout'");
            console.log('Added thumbnail_style column');
        } catch (e) { console.log('thumbnail_style already exists or error:', e.message); }

        // Add subtitle
        try {
            await db.execute("ALTER TABLE products ADD COLUMN subtitle VARCHAR(255) DEFAULT ''");
            console.log('Added subtitle column');
        } catch (e) { console.log('subtitle already exists or error:', e.message); }

        // Add button_text
        try {
            await db.execute("ALTER TABLE products ADD COLUMN button_text VARCHAR(100) DEFAULT 'Ambil Sekarang'");
            console.log('Added button_text column');
        } catch (e) { console.log('button_text already exists or error:', e.message); }

        console.log('Migration completed successfully');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
