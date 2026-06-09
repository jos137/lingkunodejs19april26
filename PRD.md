# Product Requirements Document (PRD)
## Lingku.xyz — SaaS Platform for Digital Creators

**Versi:** 1.0  
**Tanggal:** 8 Juni 2026  
**Status:** Final  

---

## 1. Ringkasan Produk (Executive Summary)

Lingku.xyz adalah platform SaaS (Software as a Service) yang memungkinkan kreator digital di Indonesia untuk membuat toko online, menjual produk digital, mengelola pesanan, dan menerima pembayaran tanpa perlu keahlian coding. Platform ini menggunakan model bisnis freemium dengan paket FREE dan PRO.

**Target Pengguna:**
- Kreator digital (penulis ebook, pembuat template, desainer)
- Pelatih/mentor online
- Penyelenggara webinar/event
- Affiliate marketer
- UMKM digital

**Tech Stack:**
- Backend: Node.js + Express.js
- Database: MySQL (MariaDB via Hostinger)
- Template Engine: EJS + express-ejs-layouts
- Payment Gateway: iPaymu (QRIS & Virtual Account)
- Email: Nodemailer via SMTP
- Session: express-mysql-session
- Deployment: GitHub Actions → SSH ke Hostinger

---

## 2. Fitur-Fitur (Feature List)

### 2.1 Manajemen Pengguna & Autentikasi

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| AUTH-01 | Registrasi akun baru (nama, email, password, WhatsApp) | P0 | ✅ |
| AUTH-02 | Login dengan email & password | P0 | ✅ |
| AUTH-03 | Logout | P0 | ✅ |
| AUTH-04 | Lupa password (reset via email) | P1 | ✅ |
| AUTH-05 | Session management dengan MySQL store | P0 | ✅ |
| AUTH-06 | Role-based access: admin, pro, free | P0 | ✅ |
| AUTH-07 | Rate limiting pada route auth (100 req/15 menit) | P1 | ✅ |

### 2.2 Dashboard

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| DASH-01 | Kartu statistik: Total Revenue, Saldo, Total Sales, Jumlah Produk | P0 | ✅ |
| DASH-02 | Grafik penjualan 7 hari terakhir (Chart.js) | P0 | ✅ |
| DASH-03 | Filter tanggal pada grafik (bar/line chart) | P1 | ✅ |
| DASH-04 | Pengaturan slug bio link (lingku.xyz/[slug]) | P0 | ✅ |
| DASH-05 | Tombol copy dan buka link bio | P1 | ✅ |
| DASH-06 | Kartu "Penjualan Hari Ini" (dikontrol feature flag) | P2 | ✅ |

### 2.3 Manajemen Produk

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| PROD-01 | CRUD produk digital | P0 | ✅ |
| PROD-02 | 4 tipe produk: Digital, Tiket, Webinar, Mentoring | P0 | ✅ |
| PROD-03 | Upload gambar thumbnail (1:1, 5MB max via multer) | P0 | ✅ |
| PROD-04 | Rich text editor untuk deskripsi (bold, italic, list, link, image, video) | P0 | ✅ |
| PROD-05 | 3 mode harga: Fixed Price, Free, Pay-What-You-Want | P1 | ✅ |
| PROD-06 | Promo timer dengan durasi customizable | P1 | ✅ |
| PROD-07 | Sale scheduling (start date/time, end date/time) | P2 | ✅ |
| PROD-08 | Atur stok (unlimited toggle) | P1 | ✅ |
| PROD-09 | Access link / download URL untuk customer | P0 | ✅ |
| PROD-10 | Affiliate settings per produk (enable/disable, commission %) | P2 | ✅ |
| PROD-11 | 3 tema tampilan produk: Light, Dark, Sky Blue | P1 | ✅ |
| PROD-12 | 3 style thumbnail: Button, Callout, Preview | P1 | ✅ |
| PROD-13 | Layout switcher: Grid, List, Glass | P1 | ✅ |
| PROD-14 | Live preview produk di mockup HP | P1 | ✅ |
| PROD-15 | Normal price (strikethrough) display | P1 | ✅ |
| PROD-16 | Pilihan warna tombol (5 warna: Green, Red, Orange, Blue, Purple) | P2 | ✅ |
| PROD-17 | Simpan sebagai draft | P2 | ✅ |
| PROD-18 | Halaman detail produk publik | P0 | ✅ |
| PROD-19 | Kategori produk dengan badge warna | P1 | ✅ |

### 2.4 Page Builder (Landing Page Creator)

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| PB-01 | Multi-page support (home, custom pages) | P0 | ✅ |
| PB-02 | Blok produk (pilih produk dari dropdown) | P0 | ✅ |
| PB-03 | Blok gambar (upload langsung) | P1 | ✅ |
| PB-04 | Auto-generated tables: pages, page_blocks, page_backups | P0 | ✅ |
| PB-05 | Backup & restore per halaman | P1 | ✅ |
| PB-06 | Drag & drop susunan blok | P1 | ✅ |
| PB-07 | Visibilitas blok (show/hide) | P2 | ✅ |
| PB-08 | Multiple halaman dengan slug unik per user | P0 | ✅ |
| PB-09 | Halaman home tidak bisa dihapus | P1 | ✅ |
| PB-10 | Mobile phone live preview | P1 | ✅ |

### 2.5 Manajemen Pesanan

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| ORD-01 | Daftar pesanan dengan search & filter (nama, email, WA, status, bulan) | P0 | ✅ |
| ORD-02 | Panel detail pesanan (invoice, info pembeli) | P0 | ✅ |
| ORD-03 | Countdown timer untuk pending order | P1 | ✅ |
| ORD-04 | Tombol "Kirim Akses" (completed order) | P0 | ✅ |
| ORD-05 | Tombol "Follow Up" (pending order) | P1 | ✅ |
| ORD-06 | Timeline status email (Sistem → Terkirim → Dibuka) | P1 | ✅ |
| ORD-07 | Pagination | P1 | ✅ |
| ORD-08 | Thumbnail produk di kartu order | P1 | ✅ |
| ORD-09 | Responsive mobile layout | P1 | ✅ |

### 2.6 Sistem Pembayaran (iPaymu)

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| PAY-01 | Integrasi iPaymu API v2 (QRIS & Virtual Account) | P0 | ✅ |
| PAY-02 | Mode Sandbox & Live (toggle di settings) | P0 | ✅ |
| PAY-03 | Webhook callback dengan signature validation | P0 | ✅ |
| PAY-04 | Reference ID unik per transaksi | P0 | ✅ |
| PAY-05 | Batas waktu pembayaran customizable (default 60 menit) | P1 | ✅ |
| PAY-06 | Auto-fallback jika order tidak ditemukan di callback | P1 | ✅ |

### 2.7 Sistem Email (Nodemailer)

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| ML-01 | Email akses produk setelah pembayaran (dengan tracking pixel) | P0 | ✅ |
| ML-02 | Email follow-up untuk pending payment | P1 | ✅ |
| ML-03 | Email instruksi pembayaran (QRIS/VA) | P1 | ✅ |
| ML-04 | Email aktivasi PRO setelah upgrade | P1 | ✅ |
| ML-05 | Email reset password | P0 | ✅ |
| ML-06 | Email notifikasi balasan admin (help/ticket) | P2 | ✅ |
| ML-07 | Konfigurasi SMTP dari database | P1 | ✅ |
| ML-08 | Email tracking (proses, terkirim, dibuka) | P1 | ✅ |
| ML-09 | Email logs di database | P1 | ✅ |

### 2.8 Penarikan Dana (Withdrawal)

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| WD-01 | Form penarikan dana (jumlah, bank/ewallet, nama, no rekening) | P0 | ✅ |
| WD-02 | Perhitungan fee otomatis (3% FREE, 2% PRO) | P0 | ✅ |
| WD-03 | Minimal penarikan: Rp100.000 (FREE), bebas (PRO) | P1 | ✅ |
| WD-04 | 8 metode pembayaran: BCA, BNI, BRI, Mandiri, DANA, OVO, GoPay, ShopeePay | P0 | ✅ |
| WD-05 | History penarikan (cair, pending, ditolak) | P0 | ✅ |
| WD-06 | Summary cards (saldo, komisi affiliate, total cair/pending/ditolak) | P1 | ✅ |
| WD-07 | Success modal dengan confetti animation | P1 | ✅ |

### 2.9 Admin: Queue Penarikan

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| ADM-WD-01 | Daftar semua permintaan WD (pending/completed/rejected) | P0 | ✅ |
| ADM-WD-02 | Tombol approve & reject per item | P0 | ✅ |
| ADM-WD-03 | Summary cards (jumlah pending/disetujui/ditolak) | P1 | ✅ |
| ADM-WD-04 | Copy nomor rekening ke clipboard | P2 | ✅ |
| ADM-WD-05 | Mobile responsive card layout | P1 | ✅ |

### 2.10 Admin: Manajemen User

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| ADM-USR-01 | Daftar semua user dengan detail modal | P0 | ✅ |
| ADM-USR-02 | Halaman detail user (profil, stats, order history, produk) | P0 | ✅ |
| ADM-USR-03 | Suspend user (UI only, backend forthcoming) | P2 | ✅ |
| ADM-USR-04 | Filter status order di detail user | P1 | ✅ |
| ADM-USR-05 | Link landing page user | P1 | ✅ |

### 2.11 Admin: Global Analytics

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| ADM-ANL-01 | 8 kartu statistik: Gross Sales, Platform Sales, Admin Omset, Dana Mengendap, Total WD, Pending Payouts, Members, Stock Alerts | P0 | ✅ |
| ADM-ANL-02 | Grafik 7 hari (orders & revenue) | P0 | ✅ |
| ADM-ANL-03 | Quick actions | P2 | ✅ |

### 2.12 Admin: Feature Flags

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| ADM-FF-01 | Toggle ON/OFF per fitur | P0 | ✅ |
| ADM-FF-02 | Tambah feature flag baru (key + deskripsi) | P1 | ✅ |
| ADM-FF-03 | Hapus feature flag | P1 | ✅ |
| ADM-FF-04 | 4 default flags: enable_announcement, enable_affiliate, show_today_sales, enable_pro_upgrade | P0 | ✅ |

### 2.13 Admin: Global Settings

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| SET-01 | Profil akun (foto, nama, bio, WhatsApp) | P0 | ✅ |
| SET-02 | Tampilan toko (warna tema, header profile, font size, shape) | P1 | ✅ |
| SET-03 | Rekening pembayaran (bank, nomor, nama) | P0 | ✅ |
| SET-04 | Preferensi notifikasi (WA, email) | P2 | ✅ |
| SET-05 | Keamanan (ganti password) | P1 | ✅ |
| SET-06 | Tema sidebar dashboard (4 tema: Klasik, Modern Gelap, Light Glass, Stan) | P1 | ✅ |
| SET-07 | iPaymu gateway mode (sandbox/live) & expiry time | P0 | ✅ |
| SET-08 | SMTP server configuration | P1 | ✅ |
| SET-09 | Pengumuman global (teks + warna, dikontrol feature flag) | P1 | ✅ |
| SET-10 | Fee & harga PRO (FREE fee %, PRO fee %, harga PRO) | P0 | ✅ |
| SET-11 | Affiliate settings (commission %, cookie duration) | P2 | ✅ |
| SET-12 | Upload foto profil ke /uploads/profiles/ | P0 | ✅ |

### 2.14 Panduan (Guides)

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| GUI-01 | Tampilan grid kartu panduan | P1 | ✅ |
| GUI-02 | Admin: tambah panduan (title, desc, link, icon, warna) | P1 | ✅ |
| GUI-03 | Admin: hapus panduan | P1 | ✅ |

### 2.15 Upgrade PRO

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| PRO-01 | Halaman perbandingan FREE vs PRO | P0 | ✅ |
| PRO-02 | Tombol aktivasi PRO → checkout iPaymu | P0 | ✅ |
| PRO-03 | Harga PRO dinamis dari settings (default Rp99.000/tahun) | P1 | ✅ |
| PRO-04 | FAQ section | P1 | ✅ |
| PRO-05 | Halaman checkout, payment, dan order history PRO | P1 | ✅ |

### 2.16 Affiliate System

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| AFF-01 | Auto-generate kode affiliate saat registrasi | P0 | ✅ |
| AFF-02 | Tracking via cookie (?ref= or ?aff=) | P0 | ✅ |
| AFF-03 | Link referral platform (lingku.xyz/ref/[kode]) | P1 | ✅ |
| AFF-04 | Link affiliate per produk (?ref= di URL produk) | P1 | ✅ |
| AFF-05 | Komisi per produk (default 20%) | P1 | ✅ |
| AFF-06 | Statistik: total referrals, estimasi komisi | P2 | ✅ |
| AFF-07 | Copy-to-clipboard untuk semua link | P1 | ✅ |
| AFF-08 | Marketplace produk dengan komisi tampil | P2 | ✅ |

### 2.17 Marketplace

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| MKT-01 | Grid produk dengan thumbnail, harga, komisi | P2 | ✅ |
| MKT-02 | Search produk | P2 | ✅ |
| MKT-03 | Pagination | P2 | ✅ |
| MKT-04 | Link preview produk | P2 | ✅ |

### 2.18 Landing Page Publik

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| LP-01 | Hero section dengan ilustrasi | P0 | ✅ |
| LP-02 | 6 fitur cards: Instan Setup, Sistem Otomatis, Desain Premium, Lebih Murah, Fee Rendah 2.5%, Ramah Pemula | P0 | ✅ |
| LP-03 | Pricing section (FREE vs PRO) | P0 | ✅ |
| LP-04 | Call-to-action section | P0 | ✅ |
| LP-05 | Footer dengan links | P0 | ✅ |
| LP-06 | Responsive design | P0 | ✅ |

### 2.19 Infrastructure & DevOps

| ID | Fitur | Prioritas | Status |
|----|-------|-----------|--------|
| INFRA-01 | Auto-heal DB migration saat startup (buat kolom yang hilang) | P0 | ✅ |
| INFRA-02 | Session store di MySQL | P0 | ✅ |
| INFRA-03 | Rate limiting (express-rate-limit) | P1 | ✅ |
| INFRA-04 | Security headers (helmet) | P1 | ✅ |
| INFRA-05 | CORS enabled | P1 | ✅ |
| INFRA-06 | Deploy via GitHub Actions ke Hostinger | P0 | ✅ |
| INFRA-07 | Git sync script (sync.sh) untuk dev → production | P2 | ✅ |
| INFRA-08 | Notifikasi registrasi baru ke admin | P1 | ✅ |
| INFRA-09 | Emergency ping endpoint (/ping) sebelum middleware | P1 | ✅ |
| INFRA-10 | Refresh data user dari DB setiap request | P1 | ✅ |
| INFRA-11 | Smart image helper (fallback local → production) | P1 | ✅ |

---

## 3. Arsitektur Sistem

### 3.1 Diagram Alur Request

```
Client (Browser)
    ↓
Nginx/Proxy (Hostinger)
    ↓
Express Server (Node.js, Port 3000/3001)
    ↓
Middleware:
    ├── Helmet (security headers)
    ├── Rate Limiter (/auth/*)
    ├── CORS
    ├── Body Parser (JSON + URL-encoded)
    ├── Cookie Parser
    ├── Session (MySQL store)
    ├── Express-ejs-layouts
    └── Global Locals (user data, notifications, features)
    ↓
Routes:
    ├── / (index routes → landing page)
    ├── /auth/* (login, register, forgot/reset password)
    └── /admin/* (all admin features, with isAuth middleware)
    ↓
Controllers → MySQL Database
    ↓
EJS Views (server-side rendered)
    ↓
Client (Browser)
```

### 3.2 Struktur Database (Tabel Utama)

| Tabel | Fungsi |
|-------|--------|
| `users` | Akun pengguna (role, plan, slug, affiliate_code, ipaymu settings, dll) |
| `products` | Produk digital (price, stock, promo, thumbnail, commission, dll) |
| `orders` | Pesanan (reference_id, customer info, total_price, payment_channel, status) |
| `withdrawals` | Penarikan dana (amount, bank, status, user_id) |
| `pages` | Halaman builder (slug, title, user_id) |
| `page_blocks` | Blok konten per halaman (type, content, visible, order) |
| `page_backups` | Backup JSON blok per halaman |
| `feature_flags` | Toggle fitur (key, description, is_enabled, text_value, color_value) |
| `notifications` | Notifikasi user (title, message, type, is_read) |
| `settings` | Pengaturan sistem (key-value) |
| `email_logs` | Log pengiriman email (order_id, event, timestamps) |
| `ai_reports` | Laporan TikTok audit |
| `blocked_ips` | IP yang diblokir |

### 3.3 Alur Pembayaran (iPaymu)

```
User klik "Bayar" → System buat order PENDING
    ↓
Request ke API iPaymu /payment/direct
    ↓
iPaymu return QRIS/VA info → Tampilkan ke user
    ↓
User bayar via QRIS/VA
    ↓
iPaymu kirim callback POST ke /api/callback/ipaymu
    ↓
Validasi signature HMAC-SHA256
    ↓
Update order status = completed
    ↓
Kirim email akses produk ke customer
    ↓
Update user plan jika ini upgrade PRO
```

---

## 4. User Roles & Permissions

| Fitur | Guest | Free User | Pro User | Admin |
|-------|-------|-----------|----------|-------|
| Landing Page | ✅ | ✅ | ✅ | ✅ |
| Login/Register | ✅ | - | - | - |
| Dashboard | - | ✅ | ✅ | ✅ |
| Products (CRUD) | - | ✅ | ✅ | ✅ |
| Page Builder | - | ✅ | ✅ | ✅ |
| Orders | - | ✅ | ✅ | ✅ |
| Withdrawal | - | ✅ (fee 3%) | ✅ (fee 2%) | - |
| Global Analytics | - | - | - | ✅ |
| WD Queue | - | - | - | ✅ |
| Feature Flags | - | - | - | ✅ |
| Settings (iPaymu, SMTP, Pengumuman, Fee) | - | - | - | ✅ |
| User Management | - | - | - | ✅ |
| Upgrade PRO | - | ✅ | - | - |
| Affiliate | - | ✅ | ✅ | ✅ |
| Marketplace | - | ✅ | ✅ | ✅ |
| Guides | - | ✅ | ✅ | ✅ (CRUD) |
| Settings (Profil, Toko, dll) | - | ✅ | ✅ | ✅ |

---

## 5. Halaman / Routes

### 5.1 Public Routes
| Route | Method | View | Deskripsi |
|-------|--------|------|-----------|
| `/` | GET | `index.ejs` | Landing page |
| `/ping` | GET | - | Health check |
| `/p/:id` | GET | `product-detail.ejs` | Detail produk publik |
| `/ref/:code` | GET | - | Redirect affiliate |

### 5.2 Auth Routes
| Route | Method | View | Deskripsi |
|-------|--------|------|-----------|
| `/auth/login` | GET/POST | `login.ejs` | Login |
| `/auth/register` | GET/POST | `register.ejs` | Register |
| `/auth/logout` | GET | - | Logout |
| `/auth/forgot-password` | GET/POST | `forgot-password.ejs` | Lupa password |
| `/auth/reset-password/:token` | GET/POST | `reset-password.ejs` | Reset password |

### 5.3 Admin Routes (Protected)
| Route | Method | View | Deskripsi |
|-------|--------|------|-----------|
| `/admin` | GET | `dashboard.ejs` | Dashboard utama |
| `/admin/update-slug` | POST | - | Update slug bio |
| `/admin/builder` | GET | `builder.ejs` | Page builder |
| `/admin/builder/save` | POST | - | Simpan blok |
| `/admin/builder/create` | POST | - | Buat halaman baru |
| `/admin/builder/delete` | POST | - | Hapus halaman |
| `/admin/builder/restore` | POST | - | Restore backup |
| `/admin/builder/upload-image` | POST | - | Upload gambar builder |
| `/admin/products` | GET | `products.ejs` | Daftar produk |
| `/admin/products/create` | GET/POST | `product-edit.ejs` | Buat produk |
| `/admin/products/:id/edit` | GET | `product-edit.ejs` | Edit produk |
| `/admin/products/:id/update` | POST | - | Update produk |
| `/admin/products/:id/delete` | POST | - | Hapus produk |
| `/admin/orders` | GET | `orders.ejs` | Daftar pesanan |
| `/admin/statistics` | GET | `statistics.ejs` | Statistik |
| `/admin/withdrawal` | GET | `withdrawal.ejs` | Tarik dana |
| `/admin/withdrawal/request` | POST | - | Request WD |
| `/admin/guides` | GET | `guides.ejs` | Panduan |
| `/admin/users` | GET | `users.ejs` | Manajemen user |
| `/admin/users/detail/:id` | GET | `user-detail.ejs` | Detail user |
| `/admin/analytics` | GET | `analytics.ejs` | Global analytics |
| `/admin/withdrawal-queue` | GET | `withdrawal-queue.ejs` | Antrian WD |
| `/admin/withdrawal-queue/:id/approve` | POST | - | Setujui WD |
| `/admin/withdrawal-queue/:id/reject` | POST | - | Tolak WD |
| `/admin/features` | GET | `features.ejs` | Feature flags |
| `/admin/features/create` | POST | - | Tambah flag |
| `/admin/features/:id/toggle` | POST | - | Toggle flag |
| `/admin/features/:id/delete` | POST | - | Hapus flag |
| `/admin/settings` | GET | `settings.ejs` | Pengaturan |
| `/admin/settings/upload-photo` | POST | - | Upload foto profil |
| `/admin/upgrade` | GET | `upgrade.ejs` | Upgrade PRO |
| `/admin/affiliate` | GET | `affiliate.ejs` | Program affiliate |
| `/admin/marketplace` | GET | `marketplace.ejs` | Marketplace |
| `/api/callback/ipaymu` | POST | - | Webhook iPaymu |

---

## 6. API Endpoints (Internal)

| Endpoint | Method | Deskripsi |
|----------|--------|-----------|
| `/admin/update-slug` | POST | Update slug user |
| `/admin/orders/send-access/:id` | POST | Kirim email akses |
| `/admin/orders/send-followup/:id` | POST | Kirim follow-up email |
| `/admin/builder/save` | POST | Simpan page builder |
| `/admin/builder/create` | POST | Buat halaman baru |
| `/admin/builder/delete` | POST | Hapus halaman |
| `/admin/builder/restore` | POST | Restore backup |
| `/admin/builder/upload-image` | POST | Upload gambar |
| `/api/callback/ipaymu` | POST | Webhook pembayaran |

---

## 7. Non-Functional Requirements

### 7.1 Performance
- Server: Node.js on Hostinger shared hosting
- Database connection pool: max 10 connections
- Timeout koneksi DB: 10 detik
- Upload file: max 5MB (products), 2MB (profile)
- Rate limit: 100 request/15 menit untuk auth routes

### 7.2 Security
- Password hashing: bcrypt (10 rounds)
- Session: encrypted, stored in MySQL
- iPaymu: HMAC-SHA256 signature validation
- Helmet security headers (CSP disabled for FontAwesome)
- Input sanitization via express-validator (available)
- SQL injection prevention via parameterized queries (mysql2)
- .env file for secrets (gitignored)
- Rate limiting untuk mencegah brute force

### 7.3 Reliability
- Auto-heal migration saat startup (buat kolom/tabel yang hilang)
- Fallback queries jika JOIN gagal (table compatibility)
- Error rendering tidak menyebabkan crash (try-catch di setiap controller)
- Port conflict handling (EADDRINUSE dengan instruksi jelas)

### 7.4 Scalability
- Arsitektur monolithic (saat ini cukup untuk skala kecil)
- Session di MySQL (bisa di-scale ke multi-instance)
- Static files via Express (bisa dipindah ke CDN)

---

## 8. Daftar File Repository

```
lingkuxyz/
├── server.js                        # Entry point, middleware, routes
├── package.json                     # Dependencies & scripts
├── nodemon.json                     # Nodemon config
│
├── config/
│   └── db.js                        # MySQL connection pool
│
├── controllers/
│   ├── authController.js            # Auth logic (login, register, reset password)
│   ├── adminController.js           # Admin CRUD (products, orders, users, etc.)
│   ├── builderController.js         # Page builder + iPaymu callback
│   └── dashboardController.js       # Dashboard data & slug management
│
├── routes/
│   ├── index.js                     # Home & logout
│   ├── auth.js                      # Auth routes
│   └── admin.js                     # All admin routes
│
├── utils/
│   ├── autoHeal.js                  # DB auto-migration on startup
│   └── mailer.js                    # Email sending (access, payment, reset, etc.)
│
├── views/
│   ├── index.ejs                    # Landing page
│   ├── login.ejs                    # Login page
│   ├── product-detail.ejs           # Public product page
│   ├── layouts/
│   │   └── admin.ejs                # Admin layout (sidebar, topbar)
│   └── admin/
│       ├── dashboard.ejs            # Dashboard (stats, chart, slug)
│       ├── builder.ejs              # Page builder (drag & drop)
│       ├── products.ejs             # Product grid/list
│       ├── product-edit.ejs         # Product editor with live preview
│       ├── orders.ejs               # Order list with detail panel
│       ├── statistics.ejs           # Simple stats cards
│       ├── withdrawal.ejs           # Withdrawal form & history
│       ├── withdrawal-queue.ejs     # Admin WD queue
│       ├── users.ejs                # User list
│       ├── user-detail.ejs          # User detail with orders/products
│       ├── analytics.ejs            # Global analytics dashboard
│       ├── features.ejs             # Feature flags control
│       ├── settings.ejs             # All settings panels
│       ├── guides.ejs               # Help guides
│       ├── upgrade.ejs              # PRO upgrade page
│       ├── affiliate.ejs            # Affiliate program page
│       ├── marketplace.ejs          # Product marketplace
│       └── [upgrade-checkout.ejs, upgrade-orders.ejs, ...]  # Upgrade flow
│
├── public/
│   ├── css/style.css                # Global admin CSS
│   ├── images/                      # Logo, favicon
│   └── uploads/                     # Uploaded files (products, profiles, builder)
│
├── .github/workflows/deploy.yml     # CI/CD deploy to Hostinger
├── .env                             # Environment variables
├── .env.example                     # Template env
├── .gitignore                       # Git ignore rules
│
├── fix.js                           # One-time bug fix script
├── sync.sh                          # Dev → Production sync script
├── system_upgrade_pro_final.md      # Documentation for PRO upgrade system
│
├── schema.sql                       # Initial database schema
├── products.sql                     # Product data dump
├── 6mei26_u427900331_josling.sql    # Full database dump
│
└── scratch_*.js / scratch/          # Debug & testing scripts
```

---

## 9. Model Bisnis

### Paket FREE
- Unlimited produk & link
- Fee withdrawal: 3%
- Tema dashboard standar
- Minimal WD: Rp100.000
- Label "Powered by Lingku"

### Paket PRO (Rp99.000/tahun)
- Fee withdrawal: 1%
- Hapus label "Powered by Lingku"
- Semua tema eksklusif
- Prioritas support 24/7
- Minimal WD: bebas
- Biaya efektif ~Rp8.250/bulan

### Biaya Platform
- Fee withdrawal: 3% (FREE) / 2% (PRO) — dari total penarikan
- Biaya aktivasi PRO: Rp99.000/tahun (dapat diubah via settings)

---

## 10. Roadmap & Pengembangan Selanjutnya

### Versi 1.0 (Saat Ini) ✅
- Semua fitur inti sudah berfungsi

### Versi 1.1 (Prioritas Tinggi)
- [ ] Auth Controller terpisah (sudah ada route, perlu penyempurnaan)
- [ ] Fitur suspend user (backend)
- [ ] Manajemen help/ticket (backend reply)
- [ ] Validasi form lengkap (express-validator)
- [ ] Webhook endpoint yang sudah teruji penuh

### Versi 1.2 (Peningkatan UX)
- [ ] Dark mode untuk semua halaman admin
- [ ] Notifikasi real-time (WebSocket/Socket.io)
- [ ] Export laporan (CSV/PDF)
- [ ] Multiple language support (EN/ID)

### Versi 2.0 (Fitur Baru)
- [ ] Mobile app (React Native / Flutter)
- [ ] API publik untuk integrasi pihak ketiga
- [ ] Sistem subscription bulanan (bukan hanya tahunan)
- [ ] Integrasi payment gateway lain (Midtrans, Xendit)
- [ ] AI-powered product description generator
- [ ] Analitik lanjutan (konversi, sumber traffic)
- [ ] Multi-tenant architecture improvement

---

## 11. Catatan Teknis

### Environment Variables (.env)
```
PORT=3001
DB_HOST=153.92.15.37
DB_USER=u427900331_lingku
DB_PASS=***
DB_NAME=u427900331_josling

IPAYMU_MODE=sandbox
IPAYMU_VA_LIVE=1179001316083605
IPAYMU_APIKEY_LIVE=***
IPAYMU_URL_LIVE=https://my.ipaymu.com
IPAYMU_VA_SANDBOX=0000001316083605
IPAYMU_APIKEY_SANDBOX=***
IPAYMU_URL_SANDBOX=https://sandbox.ipaymu.com

FONNTE_TOKEN=***
SESSION_SECRET=lingkusessions
JWT_SECRET=supersecretlingku
```

### Dependencies Utama
```json
{
  "express": "^4.19.2",
  "mysql2": "^3.9.3",
  "ejs": "^3.1.9",
  "express-ejs-layouts": "^2.5.1",
  "express-session": "^1.18.0",
  "express-mysql-session": "^3.0.3",
  "multer": "^1.4.5-lts.1",
  "bcrypt": "^5.1.1",
  "nodemailer": "^6.9.13",
  "jsonwebtoken": "^9.0.2",
  "dotenv": "^16.4.5",
  "helmet": "^8.1.0",
  "express-rate-limit": "^8.4.1",
  "express-validator": "^7.3.2",
  "axios": "^1.6.8",
  "cookie-parser": "^1.4.6",
  "cors": "^2.8.5"
}
```

---

*Dokumen ini dibuat berdasarkan analisis kode sumber Lingku.xyz versi produksi.*
*Gunakan sebagai referensi untuk pengembangan, dokumentasi, dan onboarding developer baru.*
