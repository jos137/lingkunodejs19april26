const db = require('../config/db');

exports.displayTicket = async (req, res) => {
    try {
        const { code } = req.params;
        
        let orders = [];
        try {
            [orders] = await db.execute(`
                SELECT o.*, p.name as product_name, u.name as seller_name,
                       p.event_date, p.event_time, p.event_location
                FROM orders o
                LEFT JOIN products p ON o.product_id = p.id
                LEFT JOIN users u ON o.user_id = u.id
                WHERE o.ticket_code = ?
            `, [code]);
        } catch(e1) {
            console.error('Ticket query v1:', e1.message);
            try {
                [orders] = await db.execute(`
                    SELECT o.*, p.name as product_name, u.name as seller_name
                    FROM orders o
                    LEFT JOIN products p ON o.product_id = p.id
                    LEFT JOIN users u ON o.user_id = u.id
                    WHERE o.ticket_code = ?
                `, [code]);
            } catch(e2) {
                console.error('Ticket query v2:', e2.message);
                try {
                    [orders] = await db.execute(
                        'SELECT * FROM orders WHERE ticket_code = ?',
                        [code]
                    );
                } catch(e3) {
                    console.error('Ticket query v3:', e3.message);
                    orders = [];
                }
            }
        }

        if (!orders || orders.length === 0) {
            return res.send(renderTicketHTML(null, code));
        }

        const ticket = orders[0];
        const ticketUrl = `https://lingku.xyz/tiket/${code}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(ticketUrl)}`;

        res.render('ticket-display', {
            layout: false,
            ticket: {
                code: code,
                customer_name: ticket.customer_name,
                product_name: ticket.product_name,
                seller_name: ticket.seller_name,
                status: ticket.scanned_at ? 'used' : 'active',
                scanned_at: ticket.scanned_at,
                created_at: ticket.created_at,
                event_date: ticket.event_date,
                event_time: ticket.event_time,
                event_location: ticket.event_location,
                qr_url: qrUrl,
                ticket_url: ticketUrl
            }
        });
    } catch (err) {
        console.error('Display ticket error:', err.message, err.stack);
        res.status(500).send('Gagal memuat tiket: ' + err.message);
    }
};

exports.validateTicket = async (req, res) => {
    try {
        const { code } = req.params;
        const [orders] = await db.execute(
            'SELECT id, ticket_code, scanned_at, customer_name, product_id FROM orders WHERE ticket_code = ?',
            [code]
        );

        if (orders.length === 0) {
            return res.json({ success: false, message: 'Tiket tidak ditemukan' });
        }

        const ticket = orders[0];

        if (ticket.scanned_at) {
            return res.json({
                success: false,
                message: 'Tiket sudah dipakai',
                scanned_at: ticket.scanned_at
            });
        }

        await db.execute(
            'UPDATE orders SET scanned_at = NOW() WHERE id = ?',
            [ticket.id]
        );

        return res.json({
            success: true,
            message: 'Tiket valid!',
            customer_name: ticket.customer_name,
            ticket_code: ticket.ticket_code,
            scanned_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('Validate ticket error:', err.message);
        res.status(500).json({ success: false, message: 'Gagal validasi tiket' });
    }
};

exports.scannerPage = async (req, res) => {
    try {
        const userId = req.session.userId || (req.session.user ? req.session.user.id : 1);
        const [tickets] = await db.execute(`
            SELECT o.id, o.ticket_code, o.customer_name, o.customer_email, o.customer_whatsapp,
                   o.total_price, o.scanned_at, o.created_at, p.name as product_name
            FROM orders o
            JOIN products p ON o.product_id = p.id
            WHERE o.ticket_code IS NOT NULL AND o.user_id = ?
            ORDER BY o.created_at DESC
            LIMIT 100
        `, [userId]);
        
        res.render('admin/ticket-scanner', {
            title: 'Scan Tiket',
            layout: './layouts/admin',
            tickets,
            user: req.session.user || res.locals.user
        });
    } catch (err) {
        console.error('Scanner page error:', err.message);
        res.status(500).send('Gagal memuat scanner');
    }
};

function renderTicketHTML(ticket, code) {
    if (!ticket) {
        return `
        <!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Tiket Tidak Ditemukan</title>
        <style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc;margin:0}.box{background:#fff;border-radius:20px;padding:40px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.06);max-width:400px}.icon{font-size:48px;margin-bottom:16px}h2{color:#1e293b;margin:0 0 8px}p{color:#64748b}</style></head>
        <body><div class="box"><div class="icon">🔍</div><h2>Tiket Tidak Ditemukan</h2><p>Kode: ${code}</p></div></body></html>`;
    }
}
