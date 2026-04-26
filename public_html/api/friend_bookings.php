<?php
/**
 * BlackBears Play — Бронирования для друзей
 *
 * GET ?login=test1 — получить все брони для друзей от пользователя
 * POST {"login":"test1","id":5} — отменить бронь для друга
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($method === 'GET') {
    // Проверяем авторизацию пользователя через сессию
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    
    $currentUserId = $_SESSION['user_id'] ?? null;
    $currentLogin = $_SESSION['login'] ?? null;
    
    if (!$currentUserId || !$currentLogin) {
        jsonResponse(401, 'Необходима авторизация');
    }
    
    $login = trim($_GET['login'] ?? '');
    $received = isset($_GET['received']); // Брони полученные от других

    if (empty($login)) jsonResponse(413, 'Empty login');
    
    // Пользователь может просматривать только свои брони или брони где он участвует
    if ($login !== $currentLogin) {
        jsonResponse(403, 'Доступ запрещён. Вы можете просматривать только свои бронирования');
    }

    try {
        $pdo = getDB();

        if ($received) {
            // Брони которые сделали ДЛЯ этого пользователя
            $stmt = $pdo->prepare("
                SELECT * FROM friend_bookings
                WHERE friend_login = :login AND status = 'active'
                ORDER BY start_date ASC, start_time ASC
            ");
            $stmt->execute([':login' => $login]);
        } else {
            // Брони которые этот пользователь сделал для других
            $stmt = $pdo->prepare("
                SELECT * FROM friend_bookings
                WHERE booker_login = :login AND status = 'active'
                ORDER BY start_date ASC, start_time ASC
            ");
            $stmt->execute([':login' => $login]);
        }

        $bookings = $stmt->fetchAll(PDO::FETCH_ASSOC);

        logResponse(0, "Friend bookings OK: {$login} (" . count($bookings) . ", received=" . ($received ? '1' : '0') . ")");
        jsonResponse(0, 'Success', $bookings);
    } catch (PDOException $e) {
        logError('Friend bookings error', $e);
        jsonResponse(1, 'Ошибка сервера: ' . $e->getMessage());
    }

} elseif ($method === 'POST') {
    // Проверяем авторизацию
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    
    $currentUserId = $_SESSION['user_id'] ?? null;
    $currentLogin = $_SESSION['login'] ?? null;
    
    if (!$currentUserId || !$currentLogin) {
        jsonResponse(401, 'Необходима авторизация');
    }
    
    $body = getJSONBody();
    $login = trim($body['login'] ?? '');
    $bookingId = intval($body['id'] ?? 0);

    if (empty($login)) jsonResponse(413, 'Empty login');
    if ($bookingId <= 0) jsonResponse(414, 'Empty booking id');
    
    // Проверка: пользователь может отменять только свои бронирования
    if ($login !== $currentLogin) {
        jsonResponse(403, 'Доступ запрещён');
    }

    try {
        $pdo = getDB();

        // Получаем данные брони
        $stmt = $pdo->prepare("SELECT * FROM friend_bookings WHERE id = ? LIMIT 1");
        $stmt->execute([$bookingId]);
        $booking = $stmt->fetch();

        // Проверка: отменить может либо тот кто забронировал, либо тот для кого
        if (!$booking || ($booking['booker_login'] !== $login && $booking['friend_login'] !== $login)) {
            jsonResponse(1, 'Бронь не найдена');
        }

        // Обновляем статус
        $updStmt = $pdo->prepare("UPDATE friend_bookings SET status = 'cancelled' WHERE id = ?");
        $updStmt->execute([$bookingId]);

        logMsg('FRIEND_BOOKING_CANCEL', "Cancelled: {$login}, booking id: {$bookingId}");
        jsonResponse(0, 'Success');
    } catch (PDOException $e) {
        logError('Cancel friend booking error', $e);
        jsonResponse(1, 'Ошибка сервера: ' . $e->getMessage());
    }
}
