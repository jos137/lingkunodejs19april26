const db = require('./config/db');
const mailer = require('./utils/mailer');
const nodemailer = require('nodemailer');

async function testMailer() {
    try {
        const [settings] = await db.execute('SELECT * FROM settings WHERE setting_key IN ("smtp_host", "smtp_port", "smtp_user", "smtp_pass")');
        const map = {};
        settings.forEach(s => map[s.setting_key] = s.setting_value);
        console.log("Settings map:", map);

        const transporter = nodemailer.createTransport({
            host: map.smtp_host || 'smtp.hostinger.com',
            port: parseInt(map.smtp_port) || 465,
            secure: parseInt(map.smtp_port) === 465 || parseInt(map.smtp_port) === 465,
            auth: {
                user: map.smtp_user || process.env.SMTP_USER,
                pass: map.smtp_pass || process.env.SMTP_PASS
            }
        });
        
        console.log("Transporter opts:", transporter.options.host, transporter.options.port, transporter.options.secure, transporter.options.auth.user, transporter.options.auth.pass ? '***' : false);
        
        const success = await transporter.verify();
        console.log("Verify success:", success);

        if(success) {
            console.log("Triggering sendAccessEmail for testing...");
             // I shouldn't send real emails to random people.
        }

    } catch (e) {
        console.error("Test failed:", e);
    }
}
testMailer();
