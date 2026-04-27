# SISTEM ANALISIS & DOKUMENTASI PROYEK: LINGKU.XYZ
**Status: Versi 1.0 - April 2026**

---

## 1. PENDAHULUAN
Lingku.xyz adalah platform Micro-SaaS berbasis **Node.js** yang dirancang sebagai solusi *All-in-One* bagi kreator digital untuk membuat landing page, menjual produk digital, dan membangun ekosistem pemasaran affiliate secara otomatis.

## 2. ARSITEKTUR TEKNOLOGI
*   **Backend**: Node.js (Express Framework)
*   **Frontend**: EJS (Embedded JavaScript) Templates dengan Vanilla CSS (Rich Aesthetics).
*   **Database**: MySQL (MariaDB) dengan pola *Raw Query* untuk performa maksimal.
*   **Integrasi**: 
    *   **iPaymu**: Gateway pembayaran otomatis (Direct Payment & Callback).
    *   **Nodemailer**: Pengiriman email instruksi bayar dan akses produk.
    *   **Git Automation**: Fitur "Push to Git" untuk sinkronisasi kode dari admin panel.

---

## 3. FITUR UNGGULAN & LOGIKA BISNIS

### A. Intelligent Page Builder
Sistem builder yang memungkinkan user membuat landing page dinamis menggunakan sistem blok:
- **Jenis Blok**: Teks, Gambar, Video, Produk (Milik sendiri), Affiliate (Produk orang lain), Tombol, dan Pembatas.
- **Auto-Backup**: Sistem otomatis menyimpan backup data blok sebelum melakukan perubahan besar.
- **Bulk Save**: Penggunaan *Transaction SQL* dan *Bulk Insert* untuk menjamin kecepatan simpan data meskipun jumlah blok sangat banyak.

### B. Affiliate Marketplace (Hybrid Model)
Fitur paling kompleks yang menghubungkan antar user:
1.  **Tracking**: Menggunakan *Cookie Sensor* global yang menangkap parameter `?ref=` atau `?aff=`.
2.  **Attribution**: Mengunci ID affiliate ke dalam data pesanan (`orders`) saat checkout.
3.  **Automatic Payout**: Pasca pembayaran lunas (callback), sistem secara otomatis membagi dana:
    *   **Saldo Penjual**: (Harga Produk - Komisi Affiliate).
    *   **Saldo Affiliate**: (Komisi yang dijanjikan).
    *   **Notifikasi**: Kedua belah pihak mendapat notifikasi real-time ("Komisi Cair!" / "Pesanan Berhasil!").

### C. Sistem "Auto-Heal" Database
Satu fitur unik di Lingku.xyz adalah kemampuannya mendeteksi struktur database yang usang:
- Jika kodingan baru membutuhkan kolom atau tabel baru, sistem akan mendeteksi `Unknown column` atau `Table doesn't exist` dan secara otomatis menjalankan perintah `ALTER TABLE` atau `CREATE TABLE` tanpa intervensi manual.

### D. Analytics & Tracking Mendalam
- **Timezone Correction**: Semua statistik (Daily Sales, Revenue) dipaksa menggunakan zona waktu Asia/Jakarta (GMT+7) melalui fungsi `CONVERT_TZ` di tingkat database.
- **Email Tracking**: Sistem mencatat kapan customer membuka atau mengklik link di dalam email akses produk melalui `email_logs`.

---

## 4. STRUKTUR DATABASE UTAMA

| Tabel | Fungsi Utama |
| :--- | :--- |
| `users` | Data profil, saldo, role (Free/Pro/Admin), dan API Key iPaymu. |
| `products` | Katalog produk digital, pengaturan stok, dan % komisi affiliate. |
| `pages` | Metadata landing page milik user (Home, Bio, dll). |
| `page_blocks` | Konten spesifik dari tiap blok di landing page. |
| `orders` | Rekaman transaksi, status bayar, data affiliate, dan link akses. |
| `withdrawals` | Antrian penarikan dana (WD) dari saldo user. |
| `feature_flags` | Kontrol on/off fitur dashboard secara dinamis. |

---

## 5. ALUR KERJA SISTEM (USER JOURNEY)

1.  **Pembuatan**: User membuat produk digital dan mengaktifkan centang "Affiliate" (jika ingin dijualkan orang lain).
2.  **Promosi**: Affiliate menyebarkan link dengan akhiran `?aff=username`.
3.  **Checkout**: Pembeli mengisi data. Sistem iPaymu membuat VA/QRIS secara direct.
4.  **Callback**: iPaymu mengirim data ke `/api/callback/ipaymu`.
    *   Status Order -> `completed`.
    *   Bagi Hasil Saldo (Seller vs Affiliate).
    *   Email akses produk dikirim otomatis ke Pembeli.
5.  **Monitoring**: Seller melihat grafik penjualan di Dashboard (yang sudah sinkron dengan jam Indonesia).

---

## 6. CATATAN PENGEMBANGAN (MAINTENANCE)
- **Deployment**: Gunakan tombol "Push to Git" di sidebar admin untuk melakukan deploy kode terbaru ke repository.
- **Timezone**: Jika ada perhitungan tanggal baru, pastikan menggunakan `CONVERT_TZ(..., '+00:00', '+07:00')` agar data sinkron dengan jam user di Indonesia.
- **Scaling**: Jika trafik melonjak, disarankan memindahkan `express-session` dari memori ke database (Store) agar sesi login tidak hilang saat server restart.

---
*Dokumen ini disusun secara otomatis oleh Antigravity AI Assistant.*
