const crypto = require('crypto');
const axios = require('axios');
const db = require('../config/db');

function sha256(value) {
    if (value === undefined || value === null || value === '') return undefined;
    return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

function normalizePhone(phone) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('0')) digits = '62' + digits.slice(1);
    return digits;
}

// Kirim event Purchase ke Meta Conversions API (server-side).
async function sendPurchaseToMeta({ sellerId, order }) {
    try {
        const [rows] = await db.execute('SELECT fb_pixel_id, fb_capi_token FROM users WHERE id = ?', [sellerId]);
        const seller = rows[0];
        if (!seller || !seller.fb_pixel_id || !seller.fb_capi_token) return;

        const pixelId = String(seller.fb_pixel_id).replace(/[^0-9]/g, '');
        if (!pixelId) return;

        const userData = {};
        if (order.customer_email) userData.em = [sha256(order.customer_email)];
        const phone = normalizePhone(order.customer_whatsapp);
        if (phone) userData.ph = [sha256(phone)];
        if (order.customer_ip) userData.client_ip_address = order.customer_ip;
        if (order.fbclid) {
            userData.fbc = String(order.fbclid).startsWith('fb.')
                ? String(order.fbclid)
                : `fb.1.${Date.now()}.${order.fbclid}`;
        }
        if (order.fbp) userData.fbp = String(order.fbp);

        const event = {
            event_name: 'Purchase',
            event_time: Math.floor(Date.now() / 1000),
            event_id: String(order.reference_id || order.id),
            action_source: 'website',
            user_data: userData,
            custom_data: {
                value: Number(order.total_price) || 0,
                currency: 'IDR',
                order_id: String(order.id),
                content_ids: [String(order.product_id)]
            }
        };

        const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(seller.fb_capi_token)}`;
        await axios.post(url, { data: [event] }, { timeout: 8000 });
        console.log(`[META CAPI] Purchase terkirim untuk order ${order.reference_id || order.id}`);
    } catch (e) {
        const detail = e.response && e.response.data ? JSON.stringify(e.response.data) : e.message;
        console.error('Meta CAPI error:', detail);
    }
}

module.exports = { sendPurchaseToMeta };
