SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `users` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `login` VARCHAR(50) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `name` VARCHAR(100) DEFAULT NULL,
    `phone` VARCHAR(20) DEFAULT NULL,
    `email` VARCHAR(100) DEFAULT NULL,
    `member_id` VARCHAR(50) NOT NULL,
    `icafe_id` VARCHAR(20) DEFAULT '87375',
    `balance` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `discount` DECIMAL(5,4) NOT NULL DEFAULT 0.1500,
    `is_verified` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `avatar` VARCHAR(500) DEFAULT NULL,
    `avatar_type` ENUM('preset','custom') DEFAULT 'preset',
    `is_guest` TINYINT(1) NOT NULL DEFAULT 0,
    `invited_by` INT UNSIGNED DEFAULT NULL,
    `guest_registered` TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uniq_users_login` (`login`),
    UNIQUE KEY `uniq_users_member_id` (`member_id`),
    KEY `idx_users_login` (`login`),
    KEY `idx_users_member_id` (`member_id`),
    KEY `idx_users_is_verified` (`is_verified`),
    KEY `idx_users_invited_by` (`invited_by`),
    CONSTRAINT `fk_users_invited_by` FOREIGN KEY (`invited_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cafes` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `icafe_id` VARCHAR(20) NOT NULL,
    `address` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(30) DEFAULT NULL,
    `vk_link` VARCHAR(255) DEFAULT NULL,
    `description` TEXT DEFAULT NULL,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uniq_cafes_icafe_id` (`icafe_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bookings` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `icafe_id` VARCHAR(20) NOT NULL,
    `cafe_address` VARCHAR(255) DEFAULT NULL,
    `pc_name` VARCHAR(50) NOT NULL,
    `pc_area` VARCHAR(100) DEFAULT NULL,
    `start_date` DATE NOT NULL,
    `start_time` TIME NOT NULL,
    `duration_min` INT UNSIGNED NOT NULL,
    `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `status` ENUM('active','cancelled','completed') NOT NULL DEFAULT 'active',
    `member_offer_id` BIGINT UNSIGNED DEFAULT NULL,
    `booking_password` VARCHAR(64) DEFAULT NULL,
    `description` VARCHAR(255) DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_bookings_user_id` (`user_id`),
    KEY `idx_bookings_status` (`status`),
    KEY `idx_bookings_start_date` (`start_date`),
    CONSTRAINT `fk_bookings_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `balance_history` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `amount` DECIMAL(10,2) NOT NULL,
    `type` ENUM('topup','booking','refund') NOT NULL,
    `description` VARCHAR(255) DEFAULT NULL,
    `booking_id` INT UNSIGNED DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_balance_history_user_id` (`user_id`),
    KEY `idx_balance_history_booking_id` (`booking_id`),
    CONSTRAINT `fk_balance_history_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_balance_history_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `friendships` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `friend_id` INT UNSIGNED NOT NULL,
    `status` ENUM('pending','accepted','blocked') NOT NULL DEFAULT 'pending',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uniq_friendships_pair` (`user_id`, `friend_id`),
    KEY `idx_friendships_friend_id` (`friend_id`),
    CONSTRAINT `fk_friendships_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_friendships_friend` FOREIGN KEY (`friend_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `invitations` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `sender_id` INT UNSIGNED NOT NULL,
    `token` VARCHAR(32) NOT NULL,
    `friend_login` VARCHAR(50) DEFAULT NULL,
    `expires_at` DATETIME NOT NULL,
    `used_at` DATETIME DEFAULT NULL,
    `used_by_user_id` INT UNSIGNED DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uniq_invitations_token` (`token`),
    KEY `idx_invitations_sender_id` (`sender_id`),
    KEY `idx_invitations_used_by_user_id` (`used_by_user_id`),
    CONSTRAINT `fk_invitations_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_invitations_used_by` FOREIGN KEY (`used_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `friend_bookings` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `booker_login` VARCHAR(50) DEFAULT NULL,
    `booker_member_id` VARCHAR(20) DEFAULT NULL,
    `friend_login` VARCHAR(50) DEFAULT NULL,
    `friend_member_id` VARCHAR(20) DEFAULT NULL,
    `icafe_id` VARCHAR(20) DEFAULT NULL,
    `pc_name` VARCHAR(20) DEFAULT NULL,
    `start_date` DATE DEFAULT NULL,
    `start_time` TIME DEFAULT NULL,
    `duration_min` INT DEFAULT NULL,
    `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `booking_password` VARCHAR(50) DEFAULT NULL,
    `member_offer_id` VARCHAR(50) DEFAULT NULL,
    `status` ENUM('active','cancelled','completed') NOT NULL DEFAULT 'active',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_friend_bookings_booker` (`booker_login`, `status`),
    KEY `idx_friend_bookings_friend` (`friend_login`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `food_orders` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `user_login` VARCHAR(100) NOT NULL,
    `member_id` VARCHAR(64) DEFAULT NULL,
    `cafe_id` VARCHAR(64) DEFAULT NULL,
    `cafe_name` VARCHAR(160) DEFAULT NULL,
    `cafe_address` VARCHAR(255) DEFAULT NULL,
    `session_source` ENUM('active_session','nearest_booking','manual','default') NOT NULL DEFAULT 'default',
    `table_name` VARCHAR(64) DEFAULT NULL,
    `fulfillment_type` ENUM('pickup','delivery') NOT NULL DEFAULT 'pickup',
    `payment_method` ENUM('balance','card_app','sbp_app','cash','terminal_card','terminal_qr') NOT NULL DEFAULT 'balance',
    `payment_status` ENUM('pending','paid','pay_on_pickup') NOT NULL DEFAULT 'pending',
    `status` ENUM('new','awaiting_pickup','delivering','completed','cancelled') NOT NULL DEFAULT 'new',
    `subtotal` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `delivery_fee` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `total` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `tip_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `confirmation_code` VARCHAR(12) NOT NULL,
    `qr_token` VARCHAR(64) NOT NULL,
    `client_comment` TEXT DEFAULT NULL,
    `admin_note` TEXT DEFAULT NULL,
    `payment_payload` JSON DEFAULT NULL,
    `verified_at` DATETIME DEFAULT NULL,
    `completed_at` DATETIME DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uniq_food_orders_qr` (`qr_token`),
    KEY `idx_food_orders_login` (`user_login`),
    KEY `idx_food_orders_status` (`status`),
    KEY `idx_food_orders_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `food_order_items` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `order_id` INT NOT NULL,
    `item_id` VARCHAR(64) NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `size` VARCHAR(64) DEFAULT NULL,
    `price` DECIMAL(10,2) NOT NULL,
    `qty` INT NOT NULL,
    `total` DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_food_order_items_order` (`order_id`),
    CONSTRAINT `fk_food_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `food_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
