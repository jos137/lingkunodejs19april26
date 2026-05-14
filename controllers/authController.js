const db = require('../config/db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const mailer = require('../utils/mailer');

exports.login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.render('login', { error: 'User tidak ditemukan', layout: false });
        }
        
        const user = users[0];
        
        // Fix for PHP/Hostinger bcrypt compatibility ($2y$ to $2a$)
        const dbHash = user.password.replace(/^\$2y\$/, '$2a$');
        const isMatch = await bcrypt.compare(password, dbHash);
        
        if (!isMatch) {
            return res.render('login', { error: 'Password salah', layout: false });
        }

        req.session.userId = user.id;
        req.session.user = {
            id: user.id,
            name: user.fullname || user.name || 'Admin',
            role: user.role,
            plan: user.plan,
            profile_photo: user.profile_photo,
            slug: user.slug,
            whatsapp: user.whatsapp || user.phone,
            bio: user.bio,
            ipaymu_sandbox: user.ipaymu_sandbox,
            ipaymu_expiry: user.ipaymu_expiry
        };

        res.redirect('/admin');
    } catch (err) {
        console.error('❌ LOGIN ERROR:', err.message);
        console.error('Full Stack:', err.stack);
        res.render('login', { error: `Terjadi kesalahan sistem: ${err.message}`, layout: false });
    }
};

exports.register = async (req, res) => {
    const { fullname, email, password, whatsapp } = req.body;
    try {
        const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.render('register', { error: 'Email sudah terdaftar', layout: false });
        }

        // Check for referral cookie
        let referredBy = null;
        if (req.cookies.ref_by) {
            const [referrers] = await db.execute("SELECT id FROM users WHERE affiliate_code = ?", [req.cookies.ref_by]);
            if (referrers.length > 0) referredBy = referrers[0].id;
        }

        // Generate Affiliate Code for new user
        const cleanName = (fullname || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8);
        const affiliateCode = cleanName + Math.floor(1000 + Math.random() * 9000);

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.execute(
            'INSERT INTO users (fullname, email, password, whatsapp, role, plan, affiliate_code, referred_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [fullname, email, hashedPassword, whatsapp || '628123456789', 'user', 'free', affiliateCode, referredBy]
        );

        req.session.userId = result.insertId;
        req.session.user = {
            id: result.insertId,
            name: fullname,
            role: 'user',
            plan: 'free',
            affiliate_code: affiliateCode, // Add this to session
            profile_photo: null,
            slug: null,
            whatsapp: whatsapp,
            bio: null,
            ipaymu_sandbox: 1, // Default sandbox for new users
            ipaymu_expiry: 60
        };

        // Notify Admin about new registration
        try {
            await db.execute(
                "INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)",
                [1, '🆘 Registrasi Baru', `${fullname} baru saja mendaftar!`, 'reg']
            );
        } catch (e) {
            console.error('Notification Error:', e.message);
        }

        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.render('register', { error: 'Gagal mendaftar', layout: false });
    }
};

exports.logout = (req, res) => {
    req.session.destroy();
    res.redirect('/auth/login');
};

exports.getForgotPassword = (req, res) => {
    res.render('forgot-password', { layout: false, error: null, success: null });
};

exports.postForgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const [users] = await db.execute('SELECT id, fullname FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.render('forgot-password', { layout: false, error: 'Email tidak ditemukan', success: null });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 3600000); // 1 hour

        await db.execute('UPDATE users SET reset_token = ?, token_expiry = ? WHERE id = ?', [token, expiry, users[0].id]);

        const resetLink = `${req.protocol}://${req.get('host')}/auth/reset-password/${token}`;
        const sent = await mailer.sendResetPasswordEmail(email, users[0].fullname, resetLink);

        if (sent) {
            res.render('forgot-password', { layout: false, error: null, success: 'Link reset password telah dikirim ke email Anda' });
        } else {
            res.render('forgot-password', { layout: false, error: 'Gagal mengirim email. Pastikan SMTP sudah benar.', success: null });
        }
    } catch (err) {
        console.error(err);
        res.render('forgot-password', { layout: false, error: 'Terjadi kesalahan sistem', success: null });
    }
};

exports.getResetPassword = async (req, res) => {
    const { token } = req.params;
    try {
        const [users] = await db.execute('SELECT id FROM users WHERE reset_token = ? AND token_expiry > NOW()', [token]);
        if (users.length === 0) {
            return res.send('Token tidak valid atau sudah kadaluarsa.');
        }
        res.render('reset-password', { layout: false, token, error: null });
    } catch (err) {
        console.error(err);
        res.status(500).send('Kesalahan sistem');
    }
};

exports.postResetPassword = async (req, res) => {
    const { token, password } = req.body;
    try {
        const [users] = await db.execute('SELECT id FROM users WHERE reset_token = ? AND token_expiry > NOW()', [token]);
        if (users.length === 0) {
            return res.render('reset-password', { layout: false, token, error: 'Token tidak valid atau kadaluarsa' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.execute('UPDATE users SET password = ?, reset_token = NULL, token_expiry = NULL WHERE id = ?', [hashedPassword, users[0].id]);

        res.render('login', { error: null, success: 'Password berhasil diubah. Silakan login.', layout: false });
    } catch (err) {
        console.error(err);
        res.render('reset-password', { layout: false, token, error: 'Gagal mengubah password' });
    }
};
