const crypto = require('crypto');
const db = require('../config/db');

function newVisitorId() {
    try {
        if (crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    return crypto.randomBytes(16).toString('hex');
}

function ensureVisitor(req, res) {
    let vid = req.cookies && req.cookies.lingku_vid;
    if (!vid) {
        vid = newVisitorId();
        try {
            res.cookie('lingku_vid', vid, {
                maxAge: 1000 * 60 * 60 * 24 * 365,
                httpOnly: false,
                sameSite: 'lax',
                path: '/'
            });
        } catch (e) {}
    }
    req.visitorId = vid;
}

// Middleware: pastikan visitor id + simpan atribusi (UTM/fbclid/ref) di cookie.
function trackVisitor(req, res, next) {
    try {
        ensureVisitor(req, res);

        let attr = {};
        try {
            if (req.cookies && req.cookies.lingku_attr) attr = JSON.parse(req.cookies.lingku_attr) || {};
        } catch (e) { attr = {}; }

        const q = req.query || {};
        let changed = false;
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'].forEach((k) => {
            if (q[k]) {
                attr[k] = String(q[k]).slice(0, 240);
                changed = true;
            }
        });
        if (q.ref || q.aff) {
            attr.ref = String(q.ref || q.aff).slice(0, 120);
            changed = true;
        }
        if (!attr.referrer && req.headers && req.headers.referer) {
            attr.referrer = String(req.headers.referer).slice(0, 480);
            changed = true;
        }

        if (changed) {
            try {
                res.cookie('lingku_attr', JSON.stringify(attr), {
                    maxAge: 1000 * 60 * 60 * 24 * 90,
                    httpOnly: false,
                    sameSite: 'lax',
                    path: '/'
                });
            } catch (e) {}
        }
        req.attribution = attr;
    } catch (e) {
        req.attribution = {};
    }
    next();
}

async function logEvent(req, opts = {}) {
    try {
        const sellerId = Number(opts.sellerId);
        if (!sellerId) return;

        const attr = (req && req.attribution) || {};
        const eventName = String(opts.eventName || 'event').slice(0, 64);

        const fwd = req.headers ? req.headers['x-forwarded-for'] : '';
        const rawIp = (Array.isArray(fwd) ? fwd[0] : (fwd || '')).split(',')[0].trim() || req.ip || '';
        const ip = String(rawIp).slice(0, 64);
        const ua = String((req.headers && req.headers['user-agent']) || '').slice(0, 512);

        await db.execute(
            `INSERT INTO analytics_events
             (seller_id, visitor_id, session_id, event_name, page_url, product_id, order_id, value, currency,
              utm_source, utm_medium, utm_campaign, fbclid, referrer, ip, user_agent, metadata)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                sellerId,
                req.visitorId || null,
                req.sessionID || null,
                eventName,
                String(opts.pageUrl || req.originalUrl || req.url || '').slice(0, 512),
                opts.productId ? Number(opts.productId) : null,
                opts.orderId ? Number(opts.orderId) : null,
                Number(opts.value) || 0,
                opts.currency || 'IDR',
                attr.utm_source || null,
                attr.utm_medium || null,
                attr.utm_campaign || null,
                attr.fbclid || null,
                attr.referrer || (req.headers && req.headers.referer) || null,
                ip,
                ua,
                opts.metadata ? JSON.stringify(opts.metadata).slice(0, 4000) : null
            ]
        );
    } catch (e) {
        console.error('Tracking logEvent error:', e.message);
    }
}

module.exports = { trackVisitor, logEvent };
