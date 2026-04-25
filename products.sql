-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1:3306
-- Generation Time: Apr 22, 2026 at 10:56 AM
-- Server version: 11.8.6-MariaDB-log
-- PHP Version: 7.2.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `u427900331_josling`
--

-- --------------------------------------------------------

--
-- Table structure for table `products`
--

CREATE TABLE `products` (
  `id` int(11) UNSIGNED NOT NULL,
  `user_id` int(11) UNSIGNED NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `price` decimal(15,2) NOT NULL,
  `discount_price` decimal(15,2) DEFAULT 0.00,
  `promo_timer` int(11) DEFAULT 0,
  `is_promo_active` tinyint(1) DEFAULT 0,
  `promo_ends_at` datetime DEFAULT NULL,
  `stock` int(11) DEFAULT 0,
  `max_purchase` int(11) DEFAULT 1,
  `voucher_code` varchar(50) DEFAULT NULL,
  `access_link` text DEFAULT NULL,
  `product_type` varchar(50) DEFAULT 'digital',
  `button_text` varchar(50) DEFAULT 'Beli Sekarang',
  `image_url` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `is_pay_as_you_wish` tinyint(1) DEFAULT 0,
  `min_price` int(11) DEFAULT 0,
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `image_small` longtext DEFAULT NULL,
  `require_tiktok_audit` tinyint(1) DEFAULT 0,
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `download_url` text DEFAULT NULL,
  `normal_price` decimal(15,2) DEFAULT NULL,
  `promo_enabled` tinyint(1) DEFAULT 0,
  `promo_duration` int(11) DEFAULT 0,
  `sale_start_date` date DEFAULT NULL,
  `sale_start_time` time DEFAULT NULL,
  `sale_end_date` date DEFAULT NULL,
  `sale_end_time` time DEFAULT NULL,
  `show_forever` tinyint(1) DEFAULT 0,
  `thumbnail` varchar(255) DEFAULT NULL,
  `cover_image` varchar(255) DEFAULT NULL,
  `photo` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Dumping data for table `products`
--

INSERT INTO `products` (`id`, `user_id`, `name`, `description`, `price`, `discount_price`, `promo_timer`, `is_promo_active`, `promo_ends_at`, `stock`, `max_purchase`, `voucher_code`, `access_link`, `product_type`, `button_text`, `image_url`, `created_at`, `is_pay_as_you_wish`, `min_price`, `start_date`, `end_date`, `image_small`, `require_tiktok_audit`, `updated_at`, `download_url`, `normal_price`, `promo_enabled`, `promo_duration`, `sale_start_date`, `sale_start_time`, `sale_end_date`, `sale_end_time`, `show_forever`, `thumbnail`, `cover_image`, `photo`) VALUES
(24, 1, 'Webinar 1 Mei 2026 [GRUP WhatsApp 2 Arah]', '<p><strong>GAK IKLAN GAK MAKAN!</strong></p><p><br></p><p>Belajar Tiktok Promote dengan 5 strategi POLA iklan yang sangat sederhana , tapi sudah <strong>TERBUKTI</strong> banyak yang <strong>BERHASIL</strong> menerapkan pola iklan sederhana ini.</p><p><br></p><p>Apa yang Anda dapatkan:</p><p>1. Webinar di tanggal <strong>1 Mei 2026</strong> (3 Jam)</p><p>2. Grup WA 2 Arah yang bisa untuk konsultasi</p><p>3. Grup Telegram <strong style=\"color: rgb(230, 0, 0);\">GRATIS</strong><span style=\"color: rgb(230, 0, 0);\">!</span></p><p>4. Mendapatkan Rekaman Webinar</p><p><br></p><p>Kamu yang masih belum gabung,</p><p>bisa GABUNG SEKARANG dengan mengklik tombol di bawah ini:</p>', 99000.00, 199000.00, 10, 0, NULL, 5, 0, '', 'https://chat.whatsapp.com/I2DLStH6fbt1NPGFFb91NG', 'digital', 'Beli Sekarang', '[\"prod_1_69d123de8d82e.png\"]', '2026-02-07 12:37:21', 0, NULL, '2026-04-13 00:00:00', '2026-04-28 00:00:00', NULL, 0, '2026-04-22 09:58:42', 'https://chat.whatsapp.com/I2DLStH6fbt1NPGFFb91NG', 199000.00, 0, 10, NULL, '00:00:00', NULL, '23:59:00', 0, '/uploads/products/prod-1776725866661.png', NULL, NULL),
(28, 1, 'Rekaman Webinar TIktok Affiliate Promote', '<p>Buat teman-teman yang belum bisa ikutan webinar, silahkan akses rekaman Webinar berikut ini.</p><p><br></p><p><br></p><p><br></p><p>Caranya sangat mudah, cukup membayar seikhlasnya,&nbsp;</p><p><br></p><p>Sukses untuk kita semua.</p>', 29000.00, 0.00, 0, 0, NULL, 0, 0, NULL, 'https://drive.google.com/file/d/1987dbY6ccKBqIutUkcrGirzpvBZIK5Qu/view?uuspsharing', 'digital', 'Beli Sekarang', '[\"prod_1_69cc8cbf62887.png\"]', '2026-02-09 11:04:28', 1, 29000, NULL, NULL, NULL, 0, '2026-04-21 08:36:17', '', NULL, 0, 10, NULL, '00:00:00', NULL, '23:59:00', 0, '/uploads/products/prod-1776725886395.png', NULL, NULL),
(59, 1, 'Join Us : Belajar Tiktok Affiliate Klik Disini!', '<p><span style=\"background-color: rgba(0, 0, 0, 0);\">Untuk akses Grup&nbsp;Cek email anda pengirim dari lingku&nbsp;</span></p><p>Cek juga di folder Promotion / spam&nbsp;</p><p>Cek juga WA anda pengirim dari&nbsp;lingku&nbsp;</p><p><br></p><p>* Notes : ini Grup 1 Arah yah... , Tak ada tanya jawab , Namun anda bisa dapat update terus berupa gambar , tulisan , video hasil Riset LANGSUNG dari Bang Jos</p><p>Produk apa yang laku dan trending, serta update strategi hasil study case Bang Jos secara LANGSUNG!</p><p><br></p><p>Anda tinggal contek boleh contek PLEK ketiPLEK!&nbsp;</p><p><br></p><p>Tunggu apa lagi.. bergabung sekarang juga sebelum ketinggalan dengan orang lain.</p>', 75000.00, 99000.00, 0, 0, NULL, 12, 0, NULL, 'https://t.me/+owXX66owu-ZlYjg1', 'digital', 'Beli Sekarang', '[\"prod_1_69cc914d97c68.png\"]', '2026-04-01 03:30:22', 0, NULL, NULL, NULL, NULL, 0, '2026-04-21 02:51:47', '', NULL, 0, 10, NULL, '00:00:00', NULL, '23:59:00', 0, '/uploads/products/prod-1776725901637.jpg', NULL, NULL),
(60, 1, 'Mentoring SHOPEE Affiliate [GRUP WhatsApp 2 Arah]', '<p><span style=\"color: rgb(34, 34, 34);\">Belajar Shopee ADS dengan strategi&nbsp;</span><strong style=\"color: rgb(34, 34, 34);\">POLA</strong><span style=\"color: rgb(34, 34, 34);\">&nbsp;iklan yang sangat sederhana , tapi sudah&nbsp;</span><strong style=\"color: rgb(34, 34, 34);\">TERBUKTI</strong><span style=\"color: rgb(34, 34, 34);\">&nbsp;Meningkatkan Penjualan dan&nbsp;</span><strong style=\"color: rgb(34, 34, 34);\">BERHASIL</strong><span style=\"color: rgb(34, 34, 34);\">&nbsp;menerapkan pola iklan sederhana ini.</span></p><p><br></p><p>Apa yang Anda dapatkan:</p><p><br></p><p>1. Mentoring SHOPEE Affiliate [GRUP WhatsApp 2 Arah]</p><p>2. Grup&nbsp;<strong>WA 2 Arah</strong>&nbsp;yang bisa untuk konsultasi</p><p>3. Grup Telegram&nbsp;<strong>GRATIS</strong>!</p><p>4. Mendapatkan&nbsp;<strong>Rekaman Webinar</strong></p><p><br></p><p>Kamu yang masih belum gabung, bisa&nbsp;<strong>GABUNG SEKARANG</strong>&nbsp;dengan mengklik tombol di bawah ini:</p>', 499000.00, 999000.00, 0, 0, NULL, 4, 0, NULL, 'https://chat.whatsapp.com/FUBnvPCJ2i56SwelNTJzS8', 'digital', 'Beli Sekarang', '[\"prod_1_69cc92380b53e.webp\"]', '2026-04-01 03:34:34', 0, NULL, NULL, NULL, NULL, 0, '2026-04-21 05:12:01', 'https://chat.whatsapp.com/FUBnvPCJ2i56SwelNTJzS8', NULL, 0, 10, NULL, '00:00:00', NULL, '23:59:00', 0, '/uploads/products/prod-1776725912122.webp', NULL, NULL);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `products`
--
ALTER TABLE `products`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_user_products_new` (`user_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `products`
--
ALTER TABLE `products`
  MODIFY `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=62;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `products`
--
ALTER TABLE `products`
  ADD CONSTRAINT `fk_user_products_new` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
