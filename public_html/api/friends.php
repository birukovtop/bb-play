<?php
/**
 * BlackBears Play — API друзей
 * После перехода на внешний API клуба (минимальная БД: без name, balance, email, phone)
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

set_error_handler(function($severity, $message, $file, $line) {
    logMsg('PHP_ERROR', "$message in $file:$line");
    return false;
});

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

$jsonBody = $method === 'POST' ? getJSONBody() : [];
logRequest($action, array_merge($_GET, $jsonBody));

try {
    switch ($action) {
        case 'list':       handleList(); break;
        case 'add':        handleAdd(); break;
        case 'accept':     handleAccept(); break;
        case 'reject':     handleReject(); break;
        case 'remove':     handleRemove(); break;
        case 'search':     handleSearch(); break;
        case 'pending':    handlePending(); break;
        case 'outgoing':   handleOutgoing(); break;
        case 'cancel':     handleCancel(); break;
        case 'invitations': handleSentInvitations(); break;
        case 'revoke-invite': handleRevokeInvite(); break;
        case 'count':      handleCount(); break;
        case 'bookings':   handleFriendBookings(); break;
        default:
            logMsg('WARN', "Unknown action: $action");
            jsonResponse(1, 'Unknown action. Allowed: list, add, accept, reject, remove, search, pending, count, bookings');
    }
} catch (Throwable $e) {
    logError("Unhandled error in friends.php (action=$action)", $e);
    jsonResponse(1, 'Внутренняя ошибка: ' . $e->getMessage());
}

// ============================================
// Список друзей (accepted)
// ============================================
function handleList() {
    $login = trim($_GET['login'] ?? '');
    if (empty($login)) jsonResponse(413, 'Empty login');

    $pdo = getDB();

    $stmt = $pdo->prepare("SELECT id FROM users WHERE login = ? LIMIT 1");
    $stmt->execute([$login]);
    $userId = $stmt->fetchColumn();

    if (!$userId) {
        logMsg('WARN', "User not found: $login");
        jsonResponse(1, 'Пользователь не найден');
    }

    $stmt = $pdo->prepare("
        SELECT CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END AS friend_user_id
        FROM friendships f WHERE f.status = 'accepted' AND (f.user_id = ? OR f.friend_id = ?)
    ");
    $stmt->execute([$userId, $userId, $userId]);
    $friendIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (empty($friendIds)) {
        jsonResponse(0, 'Success', []);
    }

    $placeholders = implode(',', array_fill(0, count($friendIds), '?'));
    $stmt = $pdo->prepare("SELECT id, login, member_id, icafe_id, discount, avatar, avatar_type FROM users WHERE id IN ($placeholders) ORDER BY login");
    $stmt->execute($friendIds);
    $friends = $stmt->fetchAll();

    foreach ($friends as &$friend) {
        // Баланс теперь только через внешний API клуба
        $friend['balance'] = 0;
        $friend['discount'] = (float)$friend['discount'];
        $friend['active_bookings'] = loadFriendBookings($friend['login']);
    }

    jsonResponse(0, 'Success', $friends);
}

// ============================================
// Добавить друга
// ============================================
function handleAdd() {
    $body = getJSONBody();
    $login = trim($body['login'] ?? '');
    $friendLogin = trim($body['friend_login'] ?? '');

    if (empty($login) || empty($friendLogin)) jsonResponse(413, 'Empty login or friend_login');
    if ($login === $friendLogin) jsonResponse(454, 'Нельзя добавить себя в друзья');

    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT id FROM users WHERE login = ? LIMIT 1");
    $stmt->execute([$login]);
    $user = $stmt->fetch();
    if (!$user) jsonResponse(1, 'Пользователь не найден');

    $stmt = $pdo->prepare("SELECT id FROM users WHERE login = ? LIMIT 1");
    $stmt->execute([$friendLogin]);
    $friend = $stmt->fetch();
    if (!$friend) jsonResponse(1, 'Друг не найден в системе');

    $stmt = $pdo->prepare("SELECT id, status FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?) LIMIT 1");
    $stmt->execute([$user['id'], $friend['id'], $friend['id'], $user['id']]);
    $existing = $stmt->fetch();

    if ($existing) {
        if ($existing['status'] === 'accepted') jsonResponse(1, 'Уже в друзьях');
        if ($existing['status'] === 'pending') jsonResponse(1, 'Запрос уже отправлен');
        if ($existing['status'] === 'blocked') $pdo->prepare("DELETE FROM friendships WHERE id = ?")->execute([$existing['id']]);
    }

    $pdo->prepare("INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'pending')")->execute([$user['id'], $friend['id']]);
    jsonResponse(0, 'Запрос в друзья отправлен');
}

// ============================================
// Принять запрос
// ============================================
function handleAccept() {
    $body = getJSONBody();
    $login = trim($body['login'] ?? '');
    $friendLogin = trim($body['friend_login'] ?? '');
    if (empty($login) || empty($friendLogin)) jsonResponse(413, 'Empty login or friend_login');

    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT id FROM users WHERE login = ? LIMIT 1");
    $stmt->execute([$login]);
    $user = $stmt->fetch();
    $stmt = $pdo->prepare("SELECT id FROM users WHERE login = ? LIMIT 1");
    $stmt->execute([$friendLogin]);
    $friend = $stmt->fetch();
    if (!$user || !$friend) jsonResponse(1, 'Пользователь не найден');

    $updateStmt = $pdo->prepare("UPDATE friendships SET status = 'accepted' WHERE status = 'pending' AND ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))");
    $updateStmt->execute([$user['id'], $friend['id'], $friend['id'], $user['id']]);

    if ($updateStmt->rowCount() === 0) {
        $pdo->prepare("INSERT IGNORE INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'accepted')")->execute([$user['id'], $friend['id']]);
    }
    jsonResponse(0, 'Друг добавлен! 🤝');
}

// ============================================
// Отклонить запрос
// ============================================
function handleReject() {
    $body = getJSONBody();
    $login = trim($body['login'] ?? '');
    $friendLogin = trim($body['friend_login'] ?? '');
    if (empty($login) || empty($friendLogin)) jsonResponse(413, 'Empty login or friend_login');

    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT id FROM users WHERE login = ? LIMIT 1");
    $stmt->execute([$login]);
    $user = $stmt->fetch();
    $stmt = $pdo->prepare("SELECT id FROM users WHERE login = ? LIMIT 1");
    $stmt->execute([$friendLogin]);
    $friend = $stmt->fetch();
    if (!$user || !$friend) jsonResponse(1, 'Пользователь не найден');

    $pdo->prepare("DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)")->execute([$user['id'], $friend['id'], $friend['id'], $user['id']]);
    jsonResponse(0, 'Запрос отклонён');
}

// ============================================
// Удалить друга
// ============================================
function handleRemove() {
    $body = getJSONBody();
    $login = trim($body['login'] ?? '');
    $friendLogin = trim($body['friend_login'] ?? '');
    if (empty($login) || empty($friendLogin)) jsonResponse(413, 'Empty login or friend_login');

    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT id FROM users WHERE login = ? LIMIT 1");
    $stmt->execute([$login]);
    $user = $stmt->fetch();
    $stmt = $pdo->prepare("SELECT id FROM users WHERE login = ? LIMIT 1");
    $stmt->execute([$friendLogin]);
    $friend = $stmt->fetch();
    if (!$user || !$friend) jsonResponse(1, 'Пользователь не найден');

    $pdo->prepare("DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)")->execute([$user['id'], $friend['id'], $friend['id'], $user['id']]);
    jsonResponse(0, 'Друг удалён');
}

// ============================================
// Поиск пользователя
// ============================================
function handleSearch() {
    $query = trim($_GET['q'] ?? '');
    if (empty($query)) jsonResponse(413, 'Empty search query');

    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT id, login, member_id, icafe_id, discount, avatar, avatar_type FROM users WHERE login LIKE ? LIMIT 10");
    $stmt->execute([$query . '%']);
    $users = $stmt->fetchAll();

    foreach ($users as &$u) {
        $u['balance'] = 0; // Теперь только через внешний API клуба
        $u['discount'] = (float)$u['discount'];
    }

    jsonResponse(0, 'Success (' . count($users) . ' results)', $users);
}

// ============================================
// Входящие запросы
// ============================================
function handlePending() {
    $login = trim($_GET['login'] ?? '');
    if (empty($login)) jsonResponse(413, 'Empty login');

    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT id FROM users WHERE login = ? LIMIT 1");
    $stmt->execute([$login]);
    $userId = $stmt->fetchColumn();
    if (!$userId) jsonResponse(1, 'Пользователь не найден');

    $stmt = $pdo->prepare("
        SELECT u.id, u.login, u.avatar, u.avatar_type, f.created_at
        FROM friendships f
        JOIN users u ON f.user_id = u.id
        WHERE f.friend_id = ? AND f.status = 'pending'
        ORDER BY f.created_at DESC
    ");
    $stmt->execute([$userId]);
    $pending = $stmt->fetchAll();

    foreach ($pending as &$p) {
        $p['balance'] = 0;
    }

    jsonResponse(0, 'Success', $pending);
}

// ============================================
// Количество друзей
// ============================================
function handleCount() {
    $login = trim($_GET['login'] ?? '');
    if (empty($login)) jsonResponse(413, 'Empty login');

    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT id FROM users WHERE login = ? LIMIT 1");
    $stmt->execute([$login]);
    $userId = $stmt->fetchColumn();
    if (!$userId) jsonResponse(1, 'Пользователь не найден');

    $stmt = $pdo->prepare("SELECT COUNT(*) FROM friendships WHERE status = 'accepted' AND (user_id = ? OR friend_id = ?)");
    $stmt->execute([$userId, $userId]);
    $count = (int)$stmt->fetchColumn();

    $stmt = $pdo->prepare("SELECT COUNT(*) FROM friendships WHERE friend_id = ? AND status = 'pending'");
    $stmt->execute([$userId]);
    $pending = (int)$stmt->fetchColumn();

    jsonResponse(0, 'Success', ['friends' => $count, 'pending' => $pending]);
}

// ============================================
// Брони друга (для подсветки на сетке ПК)
// ============================================
function handleFriendBookings() {
    $login = trim($_GET['login'] ?? '');
    $friendLogin = trim($_GET['friend_login'] ?? '');
    $cafeId = trim($_GET['cafe_id'] ?? '');
    $date = trim($_GET['date'] ?? '');

    if (empty($login) || empty($friendLogin)) jsonResponse(413, 'Empty login or friend_login');

    // Брони теперь только через внешний API клуба — возвращаем пустой массив
    // Клиент должен сам запросить брони через all-books-cafes
    jsonResponse(0, 'Success', []);
}

// ============================================
// Исходящие заявки
// ============================================
function handleOutgoing() {
    $login = trim($_GET['login'] ?? '');
    if (empty($login)) jsonResponse(413, 'Empty login');

    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT id FROM users WHERE login = ? LIMIT 1");
    $stmt->execute([$login]);
    $userId = $stmt->fetchColumn();
    if (!$userId) jsonResponse(1, 'Пользователь не найден');

    $stmt = $pdo->prepare("
        SELECT u.id, u.login, u.avatar, u.avatar_type, f.created_at
        FROM friendships f
        JOIN users u ON f.friend_id = u.id
        WHERE f.user_id = ? AND f.status = 'pending'
        ORDER BY f.created_at DESC
    ");
    $stmt->execute([$userId]);
    $outgoing = $stmt->fetchAll();

    foreach ($outgoing as &$o) {
        $o['balance'] = 0;
    }

    jsonResponse(0, 'Success', $outgoing);
}

// ============================================
// Отменить заявку
// ============================================
function handleCancel() {
    $body = getJSONBody();
    $login = trim($body['login'] ?? '');
    $friendLogin = trim($body['friend_login'] ?? '');
    if (empty($login) || empty($friendLogin)) jsonResponse(413, 'Empty login or friend_login');

    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT id FROM users WHERE login = ? LIMIT 1");
    $stmt->execute([$login]);
    $user = $stmt->fetch();
    $stmt = $pdo->prepare("SELECT id FROM users WHERE login = ? LIMIT 1");
    $stmt->execute([$friendLogin]);
    $friend = $stmt->fetch();
    if (!$user || !$friend) jsonResponse(1, 'Пользователь не найден');

    $pdo->prepare("DELETE FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'pending'")->execute([$user['id'], $friend['id']]);
    jsonResponse(0, 'Заявка отменена');
}

// ============================================
// Отправленные приглашения
// ============================================
function handleSentInvitations() {
    $login = trim($_GET['login'] ?? '');
    if (empty($login)) jsonResponse(413, 'Empty login');

    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT id FROM users WHERE login = ? LIMIT 1");
    $stmt->execute([$login]);
    $userId = $stmt->fetchColumn();
    if (!$userId) jsonResponse(1, 'Пользователь не найден');

    $stmt = $pdo->prepare("
        SELECT i.token, i.expires_at, i.used_at, i.friend_login, i.created_at,
               u.avatar, u.avatar_type
        FROM invitations i
        LEFT JOIN users u ON u.login = i.friend_login
        WHERE i.sender_id = ? AND i.used_at IS NULL
        ORDER BY i.created_at DESC
    ");
    $stmt->execute([$userId]);
    $invites = $stmt->fetchAll();

    $baseUrl = getBaseUrl();
    foreach ($invites as &$inv) {
        $inv['invite_url'] = $baseUrl . '/invite.html?token=' . $inv['token'];
        $inv['is_used'] = (bool)$inv['used_at'];
        $inv['is_expired'] = strtotime($inv['expires_at']) < time();
    }

    jsonResponse(0, 'Success', $invites);
}

// ============================================
// Отозвать приглашение
// ============================================
function handleRevokeInvite() {
    $body = getJSONBody();
    $token = trim($body['token'] ?? '');
    if (empty($token)) jsonResponse(413, 'Empty token');

    $pdo = getDB();
    $pdo->prepare("DELETE FROM invitations WHERE token = ?")->execute([$token]);
    jsonResponse(0, 'Приглашение отозвано');
}

// ============================================
// Базовый URL
// ============================================
function getBaseUrl(): string {
    if (defined('APP_HOST')) {
        return rtrim(APP_HOST, '/');
    }
    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'];
    return $protocol . '://' . $host;
}

function loadFriendBookings(string $login): array {
    $result = remoteGet('/all-books-cafes', ['memberAccount' => $login]);
    if (($result['code'] ?? 1) !== 0 || !is_array($result['data'] ?? null)) {
        return [];
    }

    $items = [];
    foreach ($result['data'] as $cafeId => $bookings) {
        if (!is_array($bookings)) continue;
        foreach ($bookings as $booking) {
            $from = trim((string)($booking['product_available_date_local_from'] ?? ''));
            $to = trim((string)($booking['product_available_date_local_to'] ?? ''));
            [$date, $time] = array_pad(explode(' ', $from, 2), 2, '');
            [, $toTime] = array_pad(explode(' ', $to, 2), 2, '');

            $items[] = [
                'icafe_id' => (string)$cafeId,
                'pc_name' => $booking['product_pc_name'] ?? '',
                'start_date' => $date,
                'start_time' => $time,
                'end_time' => $toTime,
                'duration_min' => (int)($booking['product_mins'] ?? 0),
                'cafe_address' => $booking['cafe_address'] ?? '',
                'member_offer_id' => $booking['member_offer_id'] ?? null,
                'status' => 'active',
            ];
        }
    }

    return $items;
}
