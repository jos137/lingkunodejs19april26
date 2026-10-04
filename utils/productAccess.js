function validUrl(value) {
    try { return ['http:', 'https:'].includes(new URL(value).protocol); }
    catch { return false; }
}

function getAccessLinks(product) {
    let links = product.access_links;
    if (typeof links === 'string') {
        try { links = JSON.parse(links); } catch { links = null; }
    }
    if (Array.isArray(links)) return links.filter(link => link && validUrl(link.url));
    const url = product.download_url || product.access_url || product.access_link;
    return validUrl(url) ? [{ name: 'Akses Produk', url }] : [];
}

function accessUpdates(body) {
    if (body.access_links_present !== '1') return { download_url: body.download_url || '' };
    const names = [].concat(body.access_link_name ?? []);
    const urls = [].concat(body.access_link_url ?? []);
    if (urls.length > 20) throw new Error('Maksimal 20 link akses per produk.');
    const links = urls.map((value, i) => {
        const url = String(value || '').trim();
        const name = String(names[i] || '').trim();
        if (!url && !name) return null;
        if (!validUrl(url)) throw new Error('Link akses harus berupa URL http:// atau https:// yang valid.');
        if (name.length > 100 || url.length > 2048) throw new Error('Nama atau URL link akses terlalu panjang.');
        return { name: name || 'Akses Produk', url };
    }).filter(Boolean);
    return { access_links: JSON.stringify(links), download_url: links[0]?.url || '', access_link: links[0]?.url || '' };
}
module.exports = { getAccessLinks, accessUpdates };
