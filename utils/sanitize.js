// Output sanitization untuk mencegah Stored XSS di halaman publik.
// Dipakai di controller SEBELUM data dikirim ke view.
const sanitizeHtml = require('sanitize-html');

const cleanHtml = (dirty) => {
    if (dirty === null || dirty === undefined) return '';
    return sanitizeHtml(String(dirty), {
        allowedTags: ['b', 'i', 'em', 'strong', 'u', 'p', 'br', 'hr', 'ul', 'ol', 'li', 'span', 'div', 'a', 'img'],
        allowedAttributes: {
            a: ['href', 'title', 'target', 'rel', 'style'],
            img: ['src', 'alt', 'title'],
            ...Object.fromEntries(['b', 'i', 'em', 'strong', 'u', 'p', 'ul', 'ol', 'li', 'span', 'div'].map(tag => [tag, ['style']]))
        },
        allowedStyles: {
            '*': {
                color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i],
                'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i],
                'font-family': [/^[a-z0-9\s,'"-]+$/i],
                'font-size': [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/i, /^(?:xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large)$/],
                'font-weight': [/^(?:normal|bold|bolder|lighter|[1-9]00)$/],
                'font-style': [/^(?:normal|italic|oblique)$/],
                'text-decoration': [/^(?:none|underline|line-through|overline)(?:\s+(?:underline|line-through|overline))*$/],
                'text-align': [/^(?:left|right|center|justify|start|end)$/],
                'line-height': [/^(?:normal|\d+(?:\.\d+)?(?:px|em|rem|%)?)$/]
            }
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
