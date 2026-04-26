<?php
/**
 * BlackBears Play — Получение бронирований (GET /api/bookings.php?login=test1)
 *
 * Брони через внешний API клуба (vibe.blackbearsplay.ru).
 * Без локального SELECT FROM bookings.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(1, 'Метод не поддерживается');
}

$login = trim($_GET['login'] ?? '');

logRequest('bookings', ['login' => $login]);

if (empty($login)) {
    jsonResponse(413, 'Empty login');
}

try {
    $pdo = getDB();

    // Находим пользователя (только для member_id)
    $stmt = $pdo->prepare("SELECT member_id, icafe_id FROM users WHERE login = :login LIMIT 1");
    $stmt->execute([':login' => $login]);
    $user = $stmt->fetch();

    if (!$user) {
        jsonResponse(1, 'Пользователь не найден');
    }

    // ============================================================
    // Получаем брони из внешнего API клуба
    // ============================================================
    $bookingsResult = remoteGet('/all-books-cafes', [
        'memberAccount' => $login,
    ]);

    if ($bookingsResult['code'] !== 0) {
        logMsg('BOOKINGS_WARN', "all-books-cafes failed: {$bookingsResult['message']}");
        jsonResponse(0, 'Success', []); // Пустой результат, не ошибка
    }

    $rawBookings = $bookingsResult['data'] ?? [];

    // ============================================================
    // Форматируем ответ + определяем статус по дате
    // ============================================================
    $now = time();
    $formatted = [];

    foreach ($rawBookings as $cafeId => $bookings) {
        if (!is_array($bookings)) continue;

        $formatted[$cafeId] = [];

        foreach ($bookings as $b) {
            $fromParts = explode(' ', $b['product_available_date_local_from'] ?? '');
            $toParts = explode(' ', $b['product_available_date_local_to'] ?? '');

            // Определяем статус по дате окончания + 30 мин доигрывания
            $status = 'active';
            if (!empty($toParts[0]) && !empty($toParts[1])) {
                $endTime = strtotime($toParts[0] . ' ' . $toParts[1]);
                if ($endTime) {
                    $endTime += 30 * 60; // +30 мин доигрывание
                    if ($endTime < $now) {
                        $status = 'completed';
                    }
                }
            }

            $formatted[$cafeId][] = [
                'product_pc_name' => $b['product_pc_name'] ?? '—',
                'product_available_date_local_from' => $b['product_available_date_local_from'] ?? '',
                'product_available_date_local_to' => $b['product_available_date_local_to'] ?? '',
                'product_mins' => intval($b['product_mins'] ?? 0),
                'price' => 0, // Цена не приходит в all-books-cafes
                'status' => $status,
                'pc_area' => '',
                'cafe_address' => '',
                'member_account' => $b['member_account'] ?? '',
                'member_offer_id' => $b['member_offer_id'] ?? 0,
                'product_description' => $b['product_description'] ?? '',
            ];
        }
    }

    logResponse(0, "Bookings OK: {$login} (" . array_sum(array_map('count', $formatted)) . " bookings)");
    jsonResponse(0, 'Success', $formatted);

} catch (PDOException $e) {
    logError('Bookings error', $e);
    jsonResponse(1, 'Ошибка сервера: ' . $e->getMessage());
}
