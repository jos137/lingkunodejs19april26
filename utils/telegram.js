const axios = require('axios');

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Send an admin-only Telegram notification. Configuration is read from hosting env. */
async function notifyTelegram(message) {
    const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const chatId = String(process.env.TELEGRAM_ADMIN_CHAT_ID || '').trim();
    if (!token || !chatId) return false;

    try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        }, { timeout: 8000 });
        return true;
    } catch (err) {
        console.error('Telegram notification error:', err.response?.data?.description || err.message);
        return false;
    }
}

module.exports = { notifyTelegram, escapeHtml };
