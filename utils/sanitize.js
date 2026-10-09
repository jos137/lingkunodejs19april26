// Output sanitization untuk mencegah Stored XSS di halaman publik.
// Dipakai di controller SEBELUM data dikirim ke view.
const sanitizeHtml = require('sanitize-html');

const cleanHtml = (dirty) => {
    if (dirty === null || dirty === undefined) return '';
    return sanitizeHtml(String(dirty), {
        allowedTags: ['b', 'i', 'em', 'strong', 'u', 'p', 'br', 'hr', 'ul', 'ol', 'li', 'span', 'div', 'font', 'a', 'img'],
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
            font: (tagName, attribs) => {
                const sizeMap = { '1': '10px', '2': '12px', '3': '14px', '4': '16px', '5': '20px', '6': '24px', '7': '32px' };
                const styles = [];
                if (attribs.color) styles.push(`color:${attribs.color}`);
                if (attribs.face) styles.push(`font-family:${attribs.face}`);
                if (attribs.size && sizeMap[attribs.size]) styles.push(`font-size:${sizeMap[attribs.size]}`);
                if (attribs.style) styles.push(attribs.style);
                return {
                    tagName: 'span',
                    attribs: { style: styles.join(';') }
                };
            },
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
