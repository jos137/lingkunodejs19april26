CREATE DATABASE IF NOT EXISTS lingku_db;
USE lingku_db;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'pro', 'free') DEFAULT 'free',
    slug VARCHAR(100) UNIQUE,
    avatar VARCHAR(255) DEFAULT NULL,
    address TEXT,
    balance DECIMAL(15,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    type ENUM('digital', 'webinar', 'ticket', 'mentoring', 'donation') NOT NULL,
    price DECIMAL(15,2) NOT NULL,
    price_stage_1 DECIMAL(15,2),
    price_stage_2 DECIMAL(15,2),
    price_stage_3 DECIMAL(15,2),
    stock_stage_1 INT DEFAULT 0,
    stock_stage_2 INT DEFAULT 0,
    stock_stage_3 INT DEFAULT 0,
    pricing_stage TINYINT DEFAULT 1,
    image_url VARCHAR(255),
    description TEXT,
    access_links TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    buyer_name VARCHAR(255) NOT NULL,
    buyer_email VARCHAR(255) NOT NULL,
    buyer_phone VARCHAR(50),
    product_id INT NOT NULL,
    seller_id INT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
    payment_method VARCHAR(50),
    payment_url VARCHAR(255),
    trx_id VARCHAR(100),
    email_sent_at TIMESTAMP NULL,
    email_opened_at TIMESTAMP NULL,
    email_clicked_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (seller_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS product_price_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    user_id INT NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    stage TINYINT,
    price DECIMAL(15,2),
    stock INT,
    note VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_product_history (product_id, created_at)
);

CREATE TABLE IF NOT EXISTS pages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    is_home BOOLEAN DEFAULT FALSE,
    content JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS withdrawals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    fee DECIMAL(15,2) DEFAULT 2500.00,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS system_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT
);

-- Insert global settings configuration
INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES 
('withdrawal_fee', '2500'),
('pro_price', '150000'),
('ipaymu_mode', 'sandbox'),
('checkout_timer_minutes', '15');
