const db = require('../config/db');
const bcrypt = require('bcrypt');

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
            bio: user.bio
        };

        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.render('login', { error: 'Terjadi kesalahan sistem', layout: false });
    }
};

exports.register = async (req, res) => {
    const { fullname, email, password, whatsapp } = req.body;
    try {
        const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.render('register', { error: 'Email sudah terdaftar', layout: false });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.execute(
            'INSERT INTO users (fullname, email, password, whatsapp, role, plan) VALUES (?, ?, ?, ?, ?, ?)',
            [fullname, email, hashedPassword, whatsapp || '628123456789', 'user', 'free']
        );

        req.session.userId = result.insertId;
        req.session.user = {
            id: result.insertId,
            name: fullname,
            role: 'user',
            plan: 'free',
            profile_photo: null,
            slug: null,
            whatsapp: whatsapp,
            bio: null
        };

        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.render('register', { error: 'Gagal mendaftar', layout: false });
    }
};

exports.logout = (req, res) => {
    req.session.destroy();
    res.redirect('/login');
};
