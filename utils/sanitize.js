// Output sanitization untuk mencegah Stored XSS di halaman publik.
// Dipakai di controller SEBELUM data dikirim ke view.
const sanitizeHtml = require('sanitize-html');

const cleanHtml = (dirty) => {
    if (dirty === null || dirty === undefined) return '';
    return sanitizeHtml(String(dirty), {
        allowedTags: ['b', 'i', 'em', 'strong', 'u', 'p', 'br', 'ul', 'ol', 'li', 'span', 'a', 'img'],
        allowedAttributes: {
            a: ['href', 'title', 'target', 'rel'],
            img: ['src', 'alt', 'title'],
            span: ['style']
        },
        allowedSchemes: ['http', 'https', 'mailto', 'tel'],
        // Paksa link eksternal aman
        transformTags: {
            a: (tagName, attribs) => ({
                tagName: 'a',
                attribs: { ...attribs, rel: 'noopener noreferrer nofollow', target: '_blank' }
            })
        }
    });
};

// URL aman untuk src/href yang bukan HTML (video, tombol, gambar).
// Tolak javascript:, data:, vbscript:, dan scheme aneh lainnya.
function safeUrl(url, fallback = '#') {
    if (url === null || url === undefined) return fallback;
    const s = String(url).trim();
    if (s === '' || s.startsWith('#') || s.startsWith('/')) return s || fallback;
    try {
        const u = new URL(s);
        if (['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol)) return s;
        return fallback;
    } catch (e) {
        return fallback;
    }
}

module.exports = { cleanHtml, safeUrl };
