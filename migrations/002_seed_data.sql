SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

INSERT IGNORE INTO `cafes` (`id`, `icafe_id`, `address`, `phone`, `vk_link`, `description`, `is_active`) VALUES
(1, '87375', 'Тамбов, Медвежья, д.1', '+7 (4752) 00-00-03', 'https://vk.com/bbplay__tmb', 'BlackBears Play club', 1),
(4, '74922', 'Tambov, Sovetskaya, 121', '+7 (4752) 00-00-01', 'https://vk.com/bbplay__tmb', 'BlackBears Play club', 0),
(5, '76301', 'Tambov, Astrakhanskaya, 2a', '+7 (4752) 00-00-02', 'https://vk.com/bbplay__tmb', 'BlackBears Play club', 0);

INSERT IGNORE INTO `users` (`id`, `login`, `password`, `name`, `phone`, `email`, `member_id`, `icafe_id`, `balance`, `discount`, `is_verified`, `created_at`, `updated_at`, `avatar`, `avatar_type`, `is_guest`, `invited_by`, `guest_registered`) VALUES
(1, 'test1', '$2y$10$hw3ivCHhDozUW4g.5bxOEe57NUXXgvYICutOK1iuuKBxm0VPbVntS', 'Test1', '+79156797760', 'no@spam.ru', '312079494943', '87375', 88249.90, 0.1500, 0, '2026-04-22 10:18:53', '2026-04-22 10:21:49', NULL, 'preset', 0, NULL, 0),
(2, 'test2', '$2y$10$Du8DmkwQobaDAaEek5Tz.uwmfPNghLnj9CM6/qDm3Kdcc1hQtu58C', NULL, NULL, NULL, '312079494945', '87375', 0.00, 0.1500, 1, '2026-04-22 10:18:53', '2026-04-22 10:18:53', NULL, 'preset', 0, NULL, 0),
(3, 'test3', '$2y$10$web6AzZlHYEnnAMiaNp8/OGqkCycJuF5RoSre6ZmVLJG4MSsrgRyG', NULL, NULL, NULL, '312000000003', '76301', 0.00, 0.1500, 1, '2026-04-22 10:18:53', '2026-04-22 10:18:53', NULL, 'preset', 0, NULL, 0),
(10, 'birukov', '$2y$10$EraHIxaZnaXOpElhQGkhNu5/rLcSH2mxC4tcyNTYkBn1HFw9Ack/G', NULL, NULL, NULL, '312675719554', '87375', 0.00, 0.1500, 1, '2026-04-22 10:18:53', '2026-04-22 10:18:53', NULL, 'preset', 0, NULL, 0),
(11, 'testapi', '$2y$10$6NzqXQGBO/bOFyHIo5bRKupfNji.saM/6IqDp7HfIprf3xMyG0WIO', 'testapi', '+74356456456', 'testapi@m.ru', '312079505495', '87375', 97200.00, 0.1500, 1, '2026-04-22 10:19:07', '2026-04-25 14:07:53', '🐺', 'preset', 0, NULL, 0),
(12, 'testapiguts', '$2y$10$kHgCS.n3F.ccJAachEQ3QuGsthMLL4Rwk95M9c9YSE2F10ceMS1XC', 'Гость', '', NULL, '3122072371999', '87375', 0.00, 0.1500, 0, '2026-04-23 17:05:16', '2026-04-23 17:05:16', NULL, 'preset', 1, 11, 0),
(13, 'guestimpl0423b', '$2y$10$0ugKE4BbNI2beZDLLgtpsuGXrzJ/zRCeciYAMZn07P5jEL5hDy1FG', 'Guest Impl', '', NULL, '312079543227', '87375', 0.00, 0.1500, 0, '2026-04-23 17:22:16', '2026-04-23 17:22:16', NULL, 'preset', 1, 11, 0),
(14, 'guestimpl0423c', '$2y$10$Ht6zr3.C6RHLls44NgTENeAbYe4ysKCI1EsarxjD.me0nFNNQpJiO', 'Guest Impl 2', '', NULL, '312079543233', '87375', 0.00, 0.1500, 0, '2026-04-23 17:24:13', '2026-04-23 17:24:13', NULL, 'preset', 1, 11, 0),
(15, 'testapigust', '$2y$10$MqvFl70vDV4hcRzXNj.jHeIzKY4ef2WVkA3uXr6ijNeC3b73PyCzi', 'testapigust', '+79865432345', NULL, '312079543263', '87375', 0.00, 0.1500, 0, '2026-04-23 17:30:23', '2026-04-23 17:30:23', NULL, 'preset', 1, 11, 0);

INSERT IGNORE INTO `bookings` (`id`, `user_id`, `icafe_id`, `cafe_address`, `pc_name`, `pc_area`, `start_date`, `start_time`, `duration_min`, `price`, `status`, `member_offer_id`, `booking_password`, `description`, `created_at`) VALUES
(1, 11, '87375', NULL, 'PC09', NULL, '2026-04-24', '19:30:00', 60, 100.00, 'active', 73795331593, '272804', NULL, '2026-04-24 16:26:58');

INSERT IGNORE INTO `balance_history` (`id`, `user_id`, `amount`, `type`, `description`, `booking_id`, `created_at`) VALUES
(1, 11, 100.00, 'topup', 'Демо-пополнение: карта', NULL, '2026-04-25 14:07:53');

INSERT IGNORE INTO `friendships` (`id`, `user_id`, `friend_id`, `status`, `created_at`, `updated_at`) VALUES
(1, 1, 2, 'accepted', '2026-04-09 04:59:44', '2026-04-09 05:00:15'),
(2, 11, 1, 'pending', '2026-04-23 17:04:50', '2026-04-23 17:04:50'),
(3, 11, 12, 'accepted', '2026-04-23 17:05:16', '2026-04-23 17:05:16'),
(6, 11, 15, 'accepted', '2026-04-23 17:30:23', '2026-04-23 17:30:23');

INSERT IGNORE INTO `invitations` (`id`, `sender_id`, `token`, `friend_login`, `expires_at`, `used_at`, `used_by_user_id`, `created_at`) VALUES
(1, 1, '7ad3ea9d87dffca1860ab8f083a9ef85', NULL, '2026-04-16 07:08:27', NULL, NULL, '2026-04-09 05:08:27'),
(2, 11, '744559919101f499417a660e997c5bb9', NULL, '2026-04-30 19:06:55', NULL, NULL, '2026-04-23 17:06:55');

INSERT IGNORE INTO `food_orders` (`id`, `user_login`, `member_id`, `cafe_id`, `cafe_name`, `cafe_address`, `session_source`, `table_name`, `fulfillment_type`, `payment_method`, `payment_status`, `status`, `subtotal`, `delivery_fee`, `total`, `tip_amount`, `confirmation_code`, `qr_token`, `client_comment`, `admin_note`, `payment_payload`, `verified_at`, `completed_at`, `created_at`, `updated_at`) VALUES
(1, 'testapi', '312079505495', '87375', 'Тамбов, Медвежья, д.1', 'Тамбов, Медвежья, д.1', 'default', '', 'pickup', 'sbp_app', 'paid', 'awaiting_pickup', 80.00, 0.00, 80.00, 0.00, '561941', '6c7c3d70b215e67c6eb27a4ee9681025', '', NULL, '{\"bank\":\"СберБанк\"}', NULL, NULL, '2026-04-23 15:43:23', '2026-04-23 15:43:30'),
(2, 'testapi', '312079505495', '87375', 'Тамбов, Медвежья, д.1', 'Тамбов, Медвежья, д.1', 'default', '', 'pickup', 'balance', 'paid', 'awaiting_pickup', 65.00, 0.00, 65.00, 0.00, '186945', 'e57801c3d2020fb91ff9ff47cc40dc52', '', NULL, '[]', NULL, NULL, '2026-04-24 13:36:42', '2026-04-24 13:36:47');

INSERT IGNORE INTO `food_order_items` (`id`, `order_id`, `item_id`, `category`, `name`, `size`, `price`, `qty`, `total`) VALUES
(1, 1, 'cool-cola-033', 'Газ.вода', 'COOL COLA', '0,33 л', 80.00, 1, 80.00),
(2, 2, 'water-05', 'Газ.вода', 'ВОДА', '0,5 л', 65.00, 1, 65.00);

ALTER TABLE `users` AUTO_INCREMENT = 16;
ALTER TABLE `cafes` AUTO_INCREMENT = 11;
ALTER TABLE `bookings` AUTO_INCREMENT = 2;
ALTER TABLE `balance_history` AUTO_INCREMENT = 2;
ALTER TABLE `friendships` AUTO_INCREMENT = 7;
ALTER TABLE `invitations` AUTO_INCREMENT = 3;
ALTER TABLE `food_orders` AUTO_INCREMENT = 3;
ALTER TABLE `food_order_items` AUTO_INCREMENT = 3;

SET FOREIGN_KEY_CHECKS = 1;
