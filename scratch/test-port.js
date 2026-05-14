const net = require('net');

const host = '153.92.15.37';
const port = 3306;

console.log(`🔎 Mengetes koneksi ke ${host}:${port}...`);

const socket = new net.Socket();
const start = Date.now();

socket.setTimeout(5000);

socket.on('connect', () => {
    console.log(`✅ BERHASIL! Laptop Anda bisa terhubung ke server Hostinger dalam ${Date.now() - start}ms.`);
    socket.destroy();
    process.exit(0);
});

socket.on('timeout', () => {
    console.log('❌ GAGAL: Koneksi Timeout (Server tidak merespon). Ini berarti Port 3306 diblokir oleh Internet Anda atau Hostinger belum memasukkan IP Anda ke Whitelist.');
    socket.destroy();
    process.exit(1);
});

socket.on('error', (err) => {
    console.log('❌ ERROR:', err.message);
    process.exit(1);
});

socket.connect(port, host);
