<?php
/**
 * BlackBears Play — локальный MVP заказов еды и напитков.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$body = $method === 'POST' ? getJSONBody() : [];

try {
    $pdo = getDB();
    ensureFoodOrderTables($pdo);

    switch ($action) {
        case 'create':
            createOrder($pdo, $body);
            break;
        case 'list':
            listOrders($pdo);
            break;
        case 'get':
            getOrder($pdo);
            break;
        case 'confirm_payment_simulated':
            confirmSimulatedPayment($pdo, $body);
            break;
        case 'add_tip':
            addTip($pdo, $body);
            break;
        default:
            jsonResponse(1, 'Unknown orders action');
    }
} catch (Throwable $e) {
    logError('orders.php error', $e);
    jsonResponse(1, 'Ошибка заказов: ' . $e->getMessage());
}

function ensureFoodOrderTables(PDO $pdo): void {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS food_orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_login VARCHAR(100) NOT NULL,
            member_id VARCHAR(64) NULL,
            cafe_id VARCHAR(64) NULL,
            cafe_name VARCHAR(160) NULL,
            cafe_address VARCHAR(255) NULL,
            session_source ENUM('active_session','nearest_booking','manual','default') NOT NULL DEFAULT 'default',
            table_name VARCHAR(64) NULL,
            fulfillment_type ENUM('pickup','delivery') NOT NULL DEFAULT 'pickup',
            payment_method ENUM('balance','card_app','sbp_app','cash','terminal_card','terminal_qr') NOT NULL DEFAULT 'balance',
            payment_status ENUM('pending','paid','pay_on_pickup') NOT NULL DEFAULT 'pending',
            status ENUM('new','awaiting_pickup','delivering','completed','cancelled') NOT NULL DEFAULT 'new',
            subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
            delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
            total DECIMAL(10,2) NOT NULL DEFAULT 0,
            tip_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
            confirmation_code VARCHAR(12) NOT NULL,
            qr_token VARCHAR(64) NOT NULL,
            client_comment TEXT NULL,
            admin_note TEXT NULL,
            verified_at DATETIME NULL,
            completed_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_food_orders_login (user_login),
            INDEX idx_food_orders_status (status),
            UNIQUE KEY uniq_food_orders_qr (qr_token)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS food_order_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id INT NOT NULL,
            item_id VARCHAR(64) NOT NULL,
            category VARCHAR(100) NOT NULL,
            name VARCHAR(160) NOT NULL,
            size VARCHAR(64) NULL,
            price DECIMAL(10,2) NOT NULL,
            qty INT NOT NULL,
            total DECIMAL(10,2) NOT NULL,
            FOREIGN KEY (order_id) REFERENCES food_orders(id) ON DELETE CASCADE,
            INDEX idx_food_order_items_order (order_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    ensureFoodOrderColumn($pdo, 'verified_at', "ALTER TABLE food_orders ADD COLUMN verified_at DATETIME NULL AFTER admin_note");
    ensureFoodOrderColumn($pdo, 'cafe_name', "ALTER TABLE food_orders ADD COLUMN cafe_name VARCHAR(160) NULL AFTER cafe_id");
    ensureFoodOrderColumn($pdo, 'cafe_address', "ALTER TABLE food_orders ADD COLUMN cafe_address VARCHAR(255) NULL AFTER cafe_name");
    ensureFoodOrderColumn($pdo, 'session_source', "ALTER TABLE food_orders ADD COLUMN session_source ENUM('active_session','nearest_booking','manual','default') NOT NULL DEFAULT 'default' AFTER cafe_address");
    ensureFoodOrderColumn($pdo, 'payment_payload', "ALTER TABLE food_orders ADD COLUMN payment_payload JSON NULL AFTER admin_note");
}

function createOrder(PDO $pdo, array $body): void {
    $login = trim($body['login'] ?? '');
    $items = $body['items'] ?? [];
    if ($login === '' || !is_array($items) || count($items) === 0) {
        jsonResponse(413, 'Нет пользователя или позиций заказа');
    }

    $cleanItems = [];
    $subtotal = 0.0;
    foreach ($items as $item) {
        $qty = max(0, (int)($item['qty'] ?? 0));
        $price = max(0, (float)($item['price'] ?? 0));
        if ($qty <= 0 || $price <= 0) continue;
        $total = $qty * $price;
        $subtotal += $total;
        $cleanItems[] = [
            'id' => substr((string)($item['id'] ?? ''), 0, 64),
            'category' => substr((string)($item['category'] ?? ''), 0, 100),
            'name' => substr((string)($item['name'] ?? ''), 0, 160),
            'size' => substr((string)($item['size'] ?? ''), 0, 64),
            'price' => $price,
            'qty' => $qty,
            'total' => $total,
        ];
    }

    if (!$cleanItems) jsonResponse(413, 'Корзина пустая');

    $fulfillment = ($body['fulfillment_type'] ?? 'pickup') === 'delivery' ? 'delivery' : 'pickup';
    $payment = in_array($body['payment_method'] ?? '', ['balance','card_app','sbp_app','cash','terminal_card','terminal_qr'], true)
        ? $body['payment_method']
        : 'balance';
    $deliveryFee = $fulfillment === 'delivery' ? 100.0 : 0.0;
    $total = $subtotal + $deliveryFee;
    $paymentStatus = in_array($payment, ['cash','terminal_card','terminal_qr'], true) ? 'pay_on_pickup' : 'pending';
    $status = $fulfillment === 'delivery' ? 'delivering' : 'awaiting_pickup';

    $sessionSource = in_array($body['session_source'] ?? '', ['active_session','nearest_booking','manual','default'], true)
        ? $body['session_source']
        : 'default';

    $pdo->beginTransaction();
    try {
        $code = (string)random_int(100000, 999999);
        $qrToken = bin2hex(random_bytes(16));
        $stmt = $pdo->prepare("
            INSERT INTO food_orders
                (user_login, member_id, cafe_id, cafe_name, cafe_address, session_source, table_name, fulfillment_type, payment_method, payment_status, status,
                 subtotal, delivery_fee, total, confirmation_code, qr_token, client_comment)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $login,
            $body['member_id'] ?? null,
            $body['cafe_id'] ?? null,
            trim($body['cafe_name'] ?? ''),
            trim($body['cafe_address'] ?? ''),
            $sessionSource,
            trim($body['table_name'] ?? ''),
            $fulfillment,
            $payment,
            $paymentStatus,
            $status,
            $subtotal,
            $deliveryFee,
            $total,
            $code,
            $qrToken,
            trim($body['comment'] ?? ''),
        ]);

        $orderId = (int)$pdo->lastInsertId();
        $itemStmt = $pdo->prepare("
            INSERT INTO food_order_items (order_id, item_id, category, name, size, price, qty, total)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        foreach ($cleanItems as $item) {
            $itemStmt->execute([$orderId, $item['id'], $item['category'], $item['name'], $item['size'], $item['price'], $item['qty'], $item['total']]);
        }
        $pdo->commit();
        jsonResponse(0, 'Order created', fetchOrder($pdo, $orderId));
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function debitLocalBalance(PDO $pdo, string $login, float $amount): bool {
    $stmt = $pdo->prepare("SELECT balance FROM users WHERE login = ? LIMIT 1");
    $stmt->execute([$login]);
    $balance = $stmt->fetchColumn();
    if ($balance === false || (float)$balance < $amount) return false;

    $stmt = $pdo->prepare("UPDATE users SET balance = balance - ? WHERE login = ? AND balance >= ?");
    $stmt->execute([$amount, $login, $amount]);
    return $stmt->rowCount() > 0;
}

function listOrders(PDO $pdo): void {
    $login = trim($_GET['login'] ?? '');
    if ($login === '') jsonResponse(413, 'Empty login');
    $group = $_GET['status_group'] ?? '';
    $statuses = $group === 'history'
        ? ['completed', 'cancelled']
        : ($group === 'active' ? ['new', 'awaiting_pickup', 'delivering'] : []);

    if ($statuses) {
        $placeholders = implode(',', array_fill(0, count($statuses), '?'));
        $stmt = $pdo->prepare("SELECT * FROM food_orders WHERE user_login = ? AND status IN ($placeholders) ORDER BY created_at DESC LIMIT 30");
        $stmt->execute(array_merge([$login], $statuses));
    } else {
        $stmt = $pdo->prepare("SELECT * FROM food_orders WHERE user_login = ? ORDER BY created_at DESC LIMIT 30");
        $stmt->execute([$login]);
    }

    $orders = $stmt->fetchAll();
    foreach ($orders as &$order) {
        $order['items'] = fetchOrderItems($pdo, (int)$order['id']);
    }
    jsonResponse(0, 'Success', $orders);
}

function getOrder(PDO $pdo): void {
    $id = (int)($_GET['id'] ?? 0);
    $login = trim($_GET['login'] ?? '');
    $order = fetchOrder($pdo, $id);
    if (!$order || ($login !== '' && $order['user_login'] !== $login)) jsonResponse(404, 'Заказ не найден');
    jsonResponse(0, 'Success', $order);
}

function confirmSimulatedPayment(PDO $pdo, array $body): void {
    $id = (int)($body['id'] ?? 0);
    $method = $body['payment_method'] ?? null;
    $payload = $body['payment_payload'] ?? [];
    $order = fetchOrder($pdo, $id);
    if (!$order) jsonResponse(404, 'Order not found');

    $paymentMethod = $method ?: ($order['payment_method'] ?? '');
    if (!in_array($paymentMethod, ['balance','card_app','sbp_app'], true)) {
        jsonResponse(413, 'Payment method cannot be simulated');
    }

    if ($paymentMethod === 'balance' && $order['payment_status'] !== 'paid') {
        if (!debitLocalBalance($pdo, $order['user_login'], (float)$order['total'])) {
            jsonResponse(402, 'Недостаточно средств на балансе');
        }
    }

    $stmt = $pdo->prepare("UPDATE food_orders SET payment_status = 'paid', payment_payload = ? WHERE id = ? AND payment_method = ?");
    $stmt->execute([json_encode($payload, JSON_UNESCAPED_UNICODE), $id, $paymentMethod]);
    $updated = fetchOrder($pdo, $id);
    if ($paymentMethod === 'balance') {
        $balanceStmt = $pdo->prepare("SELECT balance FROM users WHERE login = ? LIMIT 1");
        $balanceStmt->execute([$order['user_login']]);
        $updated['balance_after'] = (float)$balanceStmt->fetchColumn();
    }
    jsonResponse(0, 'Payment confirmed', $updated);
}

function addTip(PDO $pdo, array $body): void {
    $id = (int)($body['id'] ?? 0);
    $login = trim($body['login'] ?? '');
    $amount = max(0, (float)($body['amount'] ?? 0));
    $stmt = $pdo->prepare("UPDATE food_orders SET tip_amount = ? WHERE id = ? AND user_login = ? AND status = 'completed'");
    $stmt->execute([$amount, $id, $login]);
    jsonResponse(0, 'Tip saved', fetchOrder($pdo, $id));
}

function fetchOrder(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare("SELECT * FROM food_orders WHERE id = ? LIMIT 1");
    $stmt->execute([$id]);
    $order = $stmt->fetch();
    if (!$order) return null;

    $order['items'] = fetchOrderItems($pdo, $id);
    return $order;
}

function fetchOrderItems(PDO $pdo, int $id): array {
    $stmt = $pdo->prepare("SELECT item_id, category, name, size, price, qty, total FROM food_order_items WHERE order_id = ? ORDER BY id");
    $stmt->execute([$id]);
    return $stmt->fetchAll();
}

function ensureFoodOrderColumn(PDO $pdo, string $column, string $sql): void {
    $stmt = $pdo->query("SHOW COLUMNS FROM food_orders LIKE " . $pdo->quote($column));
    if (!$stmt->fetch()) {
        $pdo->exec($sql);
    }
}
