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

exports.sendProActivationEmail = async (email, fullname) => {
    try {
        const transporter = await getTransporter();
        const html = `
            <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Inter', system-ui, -apple-system, sans-serif;">
                <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.05);">
                    <div style="background: linear-gradient(135deg, #8b5cf6, #6d28d9); padding: 40px 30px; text-align: center;">
                        <h2 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Selamat Datang di Lingku PRO!</h2>
                    </div>
                    <div style="padding: 40px 30px; text-align: center;">
                        <p style="margin: 0 0 24px; color: #475569; line-height: 1.6; font-size: 15px;">Halo <strong>${fullname}</strong>,<br>Pembayaran Anda telah kami terima. Sekarang akun Anda telah resmi menjadi <strong>PRO</strong> selama 1 tahun ke depan!</p>
                        
                        <div style="padding: 20px; background: #f5f3ff; border-radius: 16px; margin-bottom: 32px; text-align: left;">
                            <p style="margin: 0 0 12px; font-size: 13px; font-weight: 800; color: #7c3aed; text-transform: uppercase;">Keuntungan Anda:</p>
                            <ul style="margin: 0; padding: 0 0 0 20px; color: #1e293b; font-size: 14px; line-height: 1.8;">
                                <li>Fee Penarikan (Withdraw) hanya 1%</li>
                                <li>Masa aktif paket selama 1 tahun</li>
                                <li>Akses fitur eksklusif lainnya</li>
                            </ul>
                        </div>

                        <div style="text-align: center;">
                            <a href="https://lingku.xyz/admin" style="display: inline-block; background-color: #8b5cf6; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 14px; font-weight: 800; font-size: 14px;">MULAI EXPLORE DASHBOARD</a>
                        </div>
                    </div>
                    <div style="padding: 24px; background: #f8fafc; text-align: center; border-top: 1px solid #f1f5f9;">
                        <p style="margin: 0; color: #94a3b8; font-size: 12px; font-weight: 600;">Lingku.xyz — Partner Bisnis Digital Anda</p>
                    </div>
                </div>
            </div>
        `;

        const opt = transporter.options;
        const fromEmail = opt.auth ? opt.auth.user : 'admin@lingku.xyz';

        await transporter.sendMail({
            from: `"Lingku PRO" <${fromEmail}>`,
            to: email,
            subject: '🎉 Selamat! Akun Lingku PRO Anda Telah Aktif',
            html: html
        });

        return true;
    } catch (err) {
        console.error("Gagal mengirim email aktivasi PRO:", err);
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

exports.sendTicketEmail = async (orderId, customerEmail, customerName, productName, ticketCode, eventDate, eventTime, eventLocation, baseUrl) => {
    try {
        const host = baseUrl || 'https://lingku.xyz';
        const transporter = await getTransporter();
        const ticketUrl = `${host}/tiket/${ticketCode}`;
        const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(ticketUrl)}`;
        const trackingPixel = `${host}/track/email/${orderId}.png`;
        
        let eventInfoHtml = '';
        if (eventDate || eventTime || eventLocation) {
            eventInfoHtml = `
                <div style="text-align: left; background: #f0fdf4; padding: 20px; border-radius: 16px; margin-bottom: 20px; border: 1.5px solid #dcfce7;">
                    <p style="margin: 0 0 12px; font-size: 12px; font-weight: 800; color: #059669; text-transform: uppercase; letter-spacing: 0.5px;">📅 Detail Acara</p>`;
            if (eventDate) {
                const d = new Date(eventDate);
                if (!isNaN(d)) eventInfoHtml += `<p style="margin: 4px 0; font-size: 14px; font-weight: 700; color: #1e293b;">📆 ${d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>`;
            }
            if (eventTime) eventInfoHtml += `<p style="margin: 4px 0; font-size: 14px; font-weight: 700; color: #1e293b;">⏰ ${eventTime}</p>`;
            if (eventLocation) eventInfoHtml += `<p style="margin: 4px 0; font-size: 14px; font-weight: 700; color: #1e293b;">📍 ${eventLocation}</p>`;
            eventInfoHtml += `</div>`;
        }

        const html = `
            <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                    <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 40px 30px; text-align: center;">
                        <div style="font-size: 40px; margin-bottom: 8px;">🎟️</div>
                        <h2 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">${productName}</h2>
                        <p style="margin: 8px 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">Tiket kamu sudah siap!</p>
                    </div>
                    <div style="padding: 40px 30px; text-align: center;">
                        <p style="margin: 0 0 24px; color: #475569; line-height: 1.6; font-size: 15px;">Halo <strong>${customerName}</strong>, terima kasih telah membeli tiket. Berikut detailnya:</p>
                        
                        ${eventInfoHtml}
                        
                        <div style="margin: 24px auto; max-width: 280px; background: #f8fafc; border: 3px dashed #e2e8f0; border-radius: 20px; padding: 30px 20px;">
                            <img src="${qrImageUrl}" alt="QR Code" style="width: 220px; height: 220px; display: block; margin: 0 auto 20px; border-radius: 12px; background: #ffffff; padding: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <div style="font-size: 11px; font-weight: 800; color: #94a3b8; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 6px;">Kode Tiket</div>
                            <div style="font-size: 20px; font-weight: 900; color: #1e293b; letter-spacing: 1px; font-family: monospace;">${ticketCode}</div>
                        </div>

                        <div style="text-align: left; background: #f0fdf4; padding: 20px; border-radius: 16px; margin-top: 24px;">
                            <p style="margin: 0 0 12px; font-size: 13px; font-weight: 800; color: #059669;">📌 Cara Pakai Tiket:</p>
                            <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.8;">
                                <li>Simpan & tunjukkan QR code ini saat hadir di acara</li>
                                <li>Petugas kami akan scan QR untuk validasi</li>
                                <li>Tiket hanya berlaku untuk <strong>1 kali scan</strong></li>
                            </ol>
                        </div>
                        
                        <div style="margin-top: 24px;">
                            <a href="${ticketUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px;">LIHAT TIKET ONLINE</a>
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

        await transporter.sendMail({
            from: `"Lingku Tiket" <${fromEmail}>`,
            to: customerEmail,
            subject: `🎟️ Tiket Kamu: ${productName}`,
            html: html
        });

        console.log(`Ticket email terkirim ke ${customerEmail} (ticket: ${ticketCode})`);
        await db.execute("INSERT INTO email_logs (order_id, event_name, created_at) VALUES (?, 'Delivered', NOW())", [orderId]);
        return true;
    } catch (err) {
        console.error("Gagal mengirim email tiket:", err);
        return false;
    }
};

exports.sendReplyNotificationEmail = async (email, fullname, subject, replyText, baseUrl) => {
    try {
        const host = baseUrl || 'https://lingku.xyz';
        const transporter = await getTransporter();
        const html = `
            <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Inter', system-ui, -apple-system, sans-serif;">
                <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.05);">
                    <div style="background: #3b82f6; padding: 40px 30px; text-align: center;">
                        <h2 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Balasan Admin</h2>
                    </div>
                    <div style="padding: 40px 30px;">
                        <p style="margin: 0 0 24px; color: #475569; line-height: 1.6; font-size: 15px;">Halo <strong>${fullname}</strong>,<br>Admin telah memberikan balasan untuk laporan Anda mengenai: <strong>"${subject}"</strong>.</p>
                        
                        <div style="padding: 20px; background: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 12px; margin-bottom: 32px;">
                            <p style="margin: 0 0 8px; font-size: 11px; font-weight: 900; color: #3b82f6; text-transform: uppercase;">Pesan Admin:</p>
                            <p style="margin: 0; color: #1e293b; font-size: 14px; line-height: 1.6;">${replyText}</p>
                        </div>

                        <div style="text-align: center; margin-top: 32px;">
                            <a href="${host}/admin/help" style="display: inline-block; background-color: #111827; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 14px; font-weight: 800; font-size: 14px;">LIHAT DETAIL DI DASHBOARD</a>
                        </div>
                    </div>
                    <div style="padding: 24px; background: #f8fafc; text-align: center; border-top: 1px solid #f1f5f9;">
                        <p style="margin: 0; color: #94a3b8; font-size: 12px; font-weight: 600;">Lingku.xyz — Kami Siap Membantu Anda</p>
                    </div>
                </div>
            </div>
        `;

        const opt = transporter.options;
        const fromEmail = opt.auth ? opt.auth.user : 'admin@lingku.xyz';

        await transporter.sendMail({
            from: `"Lingku Support" <${fromEmail}>`,
            to: email,
            subject: `Balasan Admin: ${subject}`,
            html: html
        });

        return true;
    } catch (err) {
        console.error("Gagal mengirim email balasan:", err);
        return false;
    }
};
