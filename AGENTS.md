# Lingku.xyz — Catatan Proyek

## Sumber utama (source of truth)
- Folder: `/Users/jossiant/Coding/lingkuxyz`
- Repo: `https://github.com/jos137/lingkunodejs19april26` (branch `master`, private)
- Production: `https://lingku.xyz` (auto-deploy saat push ke `master`)

## Menjalankan lokal
```bash
cd /Users/jossiant/Coding/lingkuxyz
node server.js
```
- Port lokal: **3002** (`.env` → `PORT=3002`)
- App: http://localhost:3002
- Health: http://localhost:3002/ping
- Login: http://localhost:3002/auth/login
- Admin: http://localhost:3002/admin

## Penting (hindari kebingungan)
- **Port 3001** dipakai oleh aplikasi **Lingku Local** di
  `~/Library/Application Support/Lingku Local/runtime` (kode lama, bukan repo ini).
- Ada salinan repo lama di
  `/Users/jossiant/Documents/Documents - Jos’s MacBook Pro/Jos Data/Coding/nodejs/lingkuxyz`
  (commit lama, tanpa fitur terbaru). Jangan dipakai.
- Selalu edit & jalankan dari `/Users/jossiant/Coding/lingkuxyz`.
