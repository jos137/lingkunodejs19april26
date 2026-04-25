const nodemailer = require('nodemailer');
const db = require('../config/db');

async function getTransporter() {
    const [settings] = await db.execute('SELECT * FROM settings WHERE setting_key IN ("smtp_host", "smtp_port", "smtp_user", "smtp_pass")');
    const map = {};
    settings.forEach(s => map[s.setting_key] = s.setting_value);
    
    return nodemailer.createTransport({
        host: map.smtp_host || 'smtp.hostinger.com',
        port: parseInt(map.smtp_port) || 465,
        secure: parseInt(map.smtp_port) === 465, // true for 465, false for 587
        auth: {
            user: map.smtp_user || process.env.SMTP_USER,
            pass: map.smtp_pass || process.env.SMTP_PASS
        }
    });
}

exports.sendAccessEmail = async (orderId, customerEmail, customerName, productName, accessLink, baseUrl) => {
    try {
        const host = baseUrl || 'https://lingku.xyz';
        const transporter = await getTransporter();
        const trackingPixel = `${host}/track/email/${orderId}.png`;
        const redirectLink = `${host}/access/go/${orderId}`;
        
        const html = `
            <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                    <div style="padding: 40px 30px; text-align: center;">
                        <div style="width: 50px; height: 50px; background: #6366f1; border-radius: 12px; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;">📦</div>
                        <h2 style="margin: 0 0 12px; color: #1e293b; font-size: 24px; font-weight: 700;">Pesanan Berhasil!</h2>
                        <p style="margin: 0 0 32px; color: #64748b; line-height: 1.6;">Halo <strong>${customerName}</strong>, terima kasih telah membeli <strong>${productName}</strong>. Produk Anda siap diakses.</p>
                        
                        <div style="margin-bottom: 32px;">
                            <a href="${redirectLink}" style="display: inline-block; background-color: #6366f1; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; transition: background 0.2s;">AKSES SEKARANG</a>
                        </div>
                        
                        <div style="text-align: left; background: #f1f5f9; padding: 20px; border-radius: 12px;">
                            <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Tautan Akses Alternatif</p>
                            <a href="${redirectLink}" style="color: #6366f1; font-size: 14px; word-break: break-all; text-decoration: none;">${redirectLink}</a>
                        </div>
                    </div>
                    <div style="padding: 24px; background: #f8fafc; text-align: center; border-top: 1px solid #f1f5f9;">
                        <p style="margin: 0; color: #94a3b8; font-size: 13px;">Lingku.xyz — Kelola Link Anda dengan Mudah</p>
                    </div>
                </div>
                <img src="${trackingPixel}" width="1" height="1" style="display:none;" alt="" />
            </div>
        `;
        
        const opt = transporter.options;
        const fromEmail = opt.auth ? opt.auth.user : 'admin@lingku.xyz';

        const info = await transporter.sendMail({
            from: `"Lingku" <${fromEmail}>`,
            to: customerEmail,
            subject: `Akses Produk: ${productName}`,
            html: html
        });

        console.log(`Email terkirim ke ${customerEmail}: ${info.messageId}`);
        await db.execute("INSERT INTO email_logs (order_id, event_name, created_at) VALUES (?, 'Delivered', NOW())", [orderId]);
        return true;
    } catch (err) {
        console.error("Gagal mengirim email:", err);
        return false;
    }
};

exports.sendFollowUpEmail = async (orderId, customerEmail, customerName, productName, paymentLink, baseUrl) => {
    try {
        const host = baseUrl || 'https://lingku.xyz';
        const transporter = await getTransporter();
        const trackingPixel = `${host}/track/email/${orderId}.png`;
        
        const html = `
            <div style="background-color: #fffbeb; padding: 40px 20px; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                    <div style="padding: 40px 30px; text-align: center;">
                        <div style="width: 50px; height: 50px; background: #f59e0b; border-radius: 12px; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;">⏳</div>
                        <h2 style="margin: 0 0 12px; color: #1e293b; font-size: 24px; font-weight: 700;">Daftar Ulang Yuk?</h2>
                        <p style="margin: 0 0 32px; color: #64748b; line-height: 1.6;">Halo <strong>${customerName}</strong>, pendaftaran Anda untuk <strong>${productName}</strong> belum selesai. Klik tombol di bawah untuk lanjut.</p>
                        
                        <div style="margin-bottom: 8px;">
                            <a href="${paymentLink}" style="display: inline-block; background-color: #f59e0b; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px;">DAFTAR ULANG</a>
                        </div>
                    </div>
                    <div style="padding: 24px; background: #fdfaf2; text-align: center; border-top: 1px solid #fef3c7;">
                        <p style="margin: 0; color: #b45309; font-size: 13px;">Ada kendala? Balas email ini ya!</p>
                    </div>
                </div>
                <img src="${trackingPixel}" width="1" height="1" style="display:none;" alt="" />
            </div>
        `;
        
        const opt = transporter.options;
        const fromEmail = opt.auth ? opt.auth.user : 'admin@lingku.xyz';

        const info = await transporter.sendMail({
            from: `"Lingku" <${fromEmail}>`,
            to: customerEmail,
            subject: `Selesaikan Pembayaran Anda untuk: ${productName}`,
            html: html
        });

        console.log(`Follow-up email terkirim ke ${customerEmail}: ${info.messageId}`);
        await db.execute("INSERT INTO email_logs (order_id, event_name, created_at) VALUES (?, 'Delivered', NOW())", [orderId]);
        return true;
    } catch (err) {
        console.error("Gagal mengirim follow-up:", err);
        return false;
    }
};
exports.sendPaymentInstructionEmail = async (orderData) => {
    try {
        const { id, customerEmail, customerName, productName, totalPrice, channel, paymentNo, qrUrl } = orderData;
        const transporter = await getTransporter();
        
        let paymentInfoHtml = '';
        if (channel.toLowerCase() === 'qris' && paymentNo) {
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentNo)}`;
            paymentInfoHtml = `
                <div style="margin: 20px 0; padding: 25px; background: #f0fdf4; border: 1.5px dashed #10b981; border-radius: 24px; text-align: center;">
                    <p style="margin: 0 0 15px; font-size: 11px; font-weight: 900; color: #065f46; text-transform: uppercase; letter-spacing: 1.5px;">Pindai QRIS di bawah ini</p>
                    <img src="${qrImageUrl}" alt="QRIS Code" style="width: 200px; height: 200px; display: block; margin: 0 auto; border-radius: 12px; background: #ffffff; padding: 10px;">
                    <div style="margin-top: 20px;">
                        <a href="${qrImageUrl}" target="_blank" style="display: inline-block; padding: 10px 20px; background: #10b981; color: #ffffff; text-decoration: none; border-radius: 10px; font-size: 12px; font-weight: 700;">SIMPAN QRIS</a>
                    </div>
                </div>
            `;
        } else if (paymentNo) {
            paymentInfoHtml = `
                <div style="margin: 20px 0; padding: 30px 20px; background: #f0fdf4; border-radius: 16px; text-align: center;">
                    <p style="margin: 0 0 10px; font-size: 11px; font-weight: 800; color: #065f46; text-transform: uppercase; letter-spacing: 1.5px;">Nomor VA / Kode Bayar (${channel.toUpperCase()})</p>
                    <h1 style="margin: 0; font-size: 32px; font-weight: 900; color: #065f46; letter-spacing: 1px;">${paymentNo}</h1>
                </div>
            `;
        }

        const html = `
            <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Inter', system-ui, -apple-system, sans-serif;">
                <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.05);">
                    <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 40px 30px; text-align: center;">
                        <h2 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Instruksi Pembayaran</h2>
                    </div>
                    <div style="padding: 40px 30px;">
                        <p style="margin: 0 0 24px; color: #475569; line-height: 1.6; font-size: 15px;">Halo <strong>${customerName}</strong>,<br>Terima kasih telah memesan <strong>${productName}</strong>. Harap segera selesaikan pembayaran Anda agar akses produk segera kami kirim.</p>
                        
                        ${paymentInfoHtml}

                        <table style="width: 100%; border-top: 1px solid #f1f5f9; padding-top: 24px; margin-top: 24px; font-size: 14px; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Total Tagihan</td>
                                <td style="padding: 8px 0; text-align: right; font-weight: 800; color: #1e293b; font-size: 18px;">Rp ${parseFloat(totalPrice).toLocaleString('id-ID')}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Channel</td>
                                <td style="padding: 8px 0; text-align: right; font-weight: 800; color: #1e293b;">${channel.toUpperCase()}</td>
                            </tr>
                        </table>

                        <div style="margin-top: 32px; padding: 16px; background: #fffbeb; border-radius: 12px; color: #92400e; font-size: 13px; font-weight: 600; text-align: center;">
                            <i class="far fa-clock"></i> Harap bayar tepat waktu agar transaksi tidak hangus.
                        </div>
                    </div>
                    <div style="padding: 24px; background: #f8fafc; text-align: center; border-top: 1px solid #f1f5f9;">
                        <p style="margin: 0; color: #94a3b8; font-size: 12px; font-weight: 600;">Lingku.xyz — Checkout Aman & Cepat</p>
                    </div>
                </div>
            </div>
        `;
        
        const opt = transporter.options;
        const fromEmail = opt.auth ? opt.auth.user : 'admin@lingku.xyz';

        await transporter.sendMail({
            from: `"Lingku" <${fromEmail}>`,
            to: customerEmail,
            subject: `Instruksi Pembayaran: ${productName}`,
            html: html
        });

        console.log(`Email instruksi terkirim ke ${customerEmail}`);
        return true;
    } catch (err) {
        console.error("Gagal mengirim email instruksi:", err);
        return false;
    }
};

exports.sendResetPasswordEmail = async (email, fullname, resetLink) => {
    try {
        const transporter = await getTransporter();
        const html = `
            <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Inter', system-ui, -apple-system, sans-serif;">
                <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.05);">
                    <div style="background: #111827; padding: 40px 30px; text-align: center;">
                        <h2 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Atur Ulang Password</h2>
                    </div>
                    <div style="padding: 40px 30px; text-align: center;">
                        <p style="margin: 0 0 24px; color: #475569; line-height: 1.6; font-size: 15px;">Halo <strong>${fullname}</strong>,<br>Kami menerima permintaan untuk mengatur ulang password akun Lingku Anda. Klik tombol di bawah ini untuk melanjutkan:</p>
                        
                        <div style="margin: 32px 0;">
                            <a href="${resetLink}" style="display: inline-block; background-color: #111827; color: #ffffff; padding: 18px 36px; text-decoration: none; border-radius: 14px; font-weight: 800; font-size: 16px;">ATUR ULANG PASSWORD</a>
                        </div>

                        <p style="margin: 32px 0 0; color: #94a3b8; font-size: 13px; line-height: 1.6;">Link ini hanya berlaku selama 1 jam. Jika Anda tidak merasa melakukan permintaan ini, abaikan saja email ini.</p>
                    </div>
                    <div style="padding: 24px; background: #f8fafc; text-align: center; border-top: 1px solid #f1f5f9;">
                        <p style="margin: 0; color: #94a3b8; font-size: 12px; font-weight: 600;">Lingku.xyz — Kelola Link dengan Percaya Diri</p>
                    </div>
                </div>
            </div>
        `;

        const opt = transporter.options;
        const fromEmail = opt.auth ? opt.auth.user : 'admin@lingku.xyz';

        await transporter.sendMail({
            from: `"Lingku" <${fromEmail}>`,
            to: email,
            subject: 'Permintaan Atur Ulang Password - Lingku.xyz',
            html: html
        });

        return true;
    } catch (err) {
        console.error("Gagal mengirim email reset:", err);
        return false;
    }
};
