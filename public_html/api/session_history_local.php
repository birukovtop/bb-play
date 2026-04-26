<?php
/**
 * BlackBears Play — локальная история броней/сессий
 * GET /api/session_history_local.php?login=testapi
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(1, 'Метод не поддерживается');
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$currentUserId = $_SESSION['user_id'] ?? null;
$currentLogin = $_SESSION['login'] ?? null;

if (!$currentUserId || !$currentLogin) {
    jsonResponse(401, 'Необходима авторизация');
}

$login = trim($_GET['login'] ?? '');
if ($login === '') {
    jsonResponse(413, 'Empty login');
}

if ($login !== $currentLogin) {
    jsonResponse(403, 'Доступ запрещён');
}

try {
    $pdo = getDB();

    $userStmt = $pdo->prepare("SELECT id FROM users WHERE login = :login LIMIT 1");
    $userStmt->execute([':login' => $login]);
    $user = $userStmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        jsonResponse(1, 'Пользователь не найден');
    }

    $ownStmt = $pdo->prepare("
        SELECT
            id,
            icafe_id,
            pc_name,
            start_date,
            start_time,
            duration_min,
            price,
            status,
            member_offer_id,
            booking_password,
            description,
            created_at
        FROM bookings
        WHERE user_id = :user_id
        ORDER BY start_date DESC, start_time DESC, id DESC
    ");
    $ownStmt->execute([':user_id' => intval($user['id'])]);
    $ownRows = $ownStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $friendStmt = $pdo->prepare("
        SELECT
            id,
            booker_login,
            friend_login,
            icafe_id,
            pc_name,
            start_date,
            start_time,
            duration_min,
            price,
            status,
            booking_password,
            member_offer_id,
            created_at
        FROM friend_bookings
        WHERE booker_login = :booker_login OR friend_login = :friend_login
        ORDER BY start_date DESC, start_time DESC, id DESC
    ");
    $friendStmt->execute([
        ':booker_login' => $login,
        ':friend_login' => $login,
    ]);
    $friendRows = $friendStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $items = [];

    foreach ($ownRows as $row) {
        $items[] = [
            'kind' => 'self',
            'id' => intval($row['id']),
            'title' => $row['pc_name'] ?: '—',
            'subtitle' => 'Своя бронь',
            'icafe_id' => $row['icafe_id'] ?? '',
            'pc_name' => $row['pc_name'] ?? '',
            'start_date' => $row['start_date'] ?? '',
            'start_time' => $row['start_time'] ?? '',
            'duration_min' => intval($row['duration_min'] ?? 0),
            'price' => floatval($row['price'] ?? 0),
            'status' => $row['status'] ?? 'active',
            'booking_password' => $row['booking_password'] ?? '',
            'member_offer_id' => intval($row['member_offer_id'] ?? 0),
            'description' => $row['description'] ?? '',
            'sort_key' => trim(($row['start_date'] ?? '') . ' ' . ($row['start_time'] ?? '')),
        ];
    }

    foreach ($friendRows as $row) {
        $isOutgoing = ($row['booker_login'] ?? '') === $login;
        $items[] = [
            'kind' => $isOutgoing ? 'friend_outgoing' : 'friend_incoming',
            'id' => intval($row['id']),
            'title' => $row['pc_name'] ?: '—',
            'subtitle' => $isOutgoing
                ? ('Для друга: ' . ($row['friend_login'] ?? '—'))
                : ('Получена от: ' . ($row['booker_login'] ?? '—')),
            'icafe_id' => $row['icafe_id'] ?? '',
            'pc_name' => $row['pc_name'] ?? '',
            'start_date' => $row['start_date'] ?? '',
            'start_time' => $row['start_time'] ?? '',
            'duration_min' => intval($row['duration_min'] ?? 0),
            'price' => floatval($row['price'] ?? 0),
            'status' => $row['status'] ?? 'active',
            'booking_password' => $row['booking_password'] ?? '',
            'member_offer_id' => intval($row['member_offer_id'] ?? 0),
            'description' => '',
            'sort_key' => trim(($row['start_date'] ?? '') . ' ' . ($row['start_time'] ?? '')),
        ];
    }

    usort($items, static function ($a, $b) {
        return strcmp($b['sort_key'] ?? '', $a['sort_key'] ?? '');
    });

    jsonResponse(0, 'Success', $items);
} catch (Throwable $e) {
    logError('Local session history error', $e);
    jsonResponse(1, 'Ошибка сервера: ' . $e->getMessage());
}
