<?php
/**
 * BlackBears Play — Отмена бронирования (POST /api/booking_cancel.php)
 *
 * Отмена через внешний API клуба (vibe.blackbearsplay.ru).
 * Без локального UPDATE bookings.
 *
 * Тело запроса (JSON):
 * { "login": "test1", "icafe_id": "87375", "member_offer_id": 73795276913 }
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(1, 'Метод не поддерживается');
}

$body = getJSONBody();
$login = trim($body['login'] ?? '');
$memberOfferId = intval($body['member_offer_id'] ?? 0);
$icafeId = trim($body['icafe_id'] ?? '87375');
$packageDeducted = floatval($body['package_deducted'] ?? 0); // Сумма доп. списания за пакет

logRequest('booking_cancel', $body);

if (empty($login)) {
    jsonResponse(413, 'Empty login');
}

if ($memberOfferId <= 0) {
    jsonResponse(414, 'Empty member_offer_id');
}

try {
    $pdo = getDB();

    // Находим пользователя (только для member_id)
    $stmt = $pdo->prepare("SELECT id, member_id FROM users WHERE login = :login LIMIT 1");
    $stmt->execute([':login' => $login]);
    $user = $stmt->fetch();

    if (!$user) {
        jsonResponse(1, 'Пользователь не найден');
    }

    // ============================================================
    // Отмена через внешний API клуба
    // DELETE /api/v2/cafe/{cafeId}/bookings
    // ============================================================
    $cancelResult = remoteDelete('/api/v2/cafe/' . $icafeId . '/bookings', [
        'pc_name' => $body['pc_name'] ?? '',
        'member_offer_id' => $memberOfferId,
    ]);

    $cancelCode = $cancelResult['code'] ?? -1;

    // Проверяем успех: code:200 или code:0
    // Также проверяем data.results[0].status === "success"
    $cancelSuccess = ($cancelCode === 200 || $cancelCode === 0);
    if ($cancelSuccess && !empty($cancelResult['data']['results'])) {
        foreach ($cancelResult['data']['results'] as $r) {
            if (($r['status'] ?? '') !== 'success') {
                $cancelSuccess = false;
                break;
            }
        }
    }

    if (!$cancelSuccess) {
        $msg = $cancelResult['message'] ?? 'Неизвестная ошибка';
        logMsg('CANCEL_ERROR', "Booking cancel failed: {$msg}");
        jsonResponse(1, 'Не удалось отменить бронь: ' . $msg);
    }

    // ============================================================
    // Возврат средств
    // ============================================================
    $refundAmount = 0;

    // 1. Если был пакет — возвращаем доп. списанную разницу
    if ($packageDeducted > 0) {
        $refundAmount += $packageDeducted;
        logMsg('REFUND_PACKAGE', "Возвращаем доп. списание пакета: {$packageDeducted}₽");
    }

    // 2. Пробуем получить стоимость из ответа vibe (почасовая часть)
    if (!empty($cancelResult['data']['results'])) {
        foreach ($cancelResult['data']['results'] as $r) {
            $refundAmount += floatval($r['cost'] ?? $r['price'] ?? $r['total_price'] ?? 0);
        }
    }

    // Если есть что возвращать — делаем topup
    if ($refundAmount > 0) {
        logMsg('REFUND', "Возвращаем {$refundAmount}₽ за отмену брони #{$memberOfferId}");

        $refundResult = remotePost('/api/v2/cafe/' . $icafeId . '/members/action/topup', [
            'topup_ids' => (string)$user['member_id'],
            'topup_value' => $refundAmount,
            'topup_balance_bonus' => 0,
            'comment' => "Возврат за отмену брони #{$memberOfferId}",
        ]);

        $refundCode = $refundResult['code'] ?? -1;
        if ($refundCode === 200) {
            logMsg('REFUND_OK', "Возвращено {$refundAmount}₽");
        } else {
            logMsg('REFUND_WARN', "Не удалось вернуть {$refundAmount}₽: " . json_encode($refundResult));
        }
    }

    logMsg('CANCEL', "Booking cancelled: {$login}, member_offer_id: {$memberOfferId}");

    try {
        $upd = $pdo->prepare("
            UPDATE bookings
            SET status = 'cancelled'
            WHERE user_id = :user_id
              AND member_offer_id = :member_offer_id
              AND status = 'active'
        ");
        $upd->execute([
            ':user_id' => $user['id'] ?? 0,
            ':member_offer_id' => $memberOfferId,
        ]);
    } catch (Throwable $e) {
        logMsg('CANCEL_LOCAL_WARN', 'Local booking cancel sync failed: ' . $e->getMessage());
    }

    // ============================================================
    // Получаем актуальный баланс
    // ============================================================
    $balanceResult = remoteGet('/api/v2/cafe/' . $icafeId . '/members', []);

    $balance = 0;
    if (($balanceResult['code'] === 200 || $balanceResult['code'] === 0) && !empty($balanceResult['data']['members'])) {
        foreach ($balanceResult['data']['members'] as $m) {
            if (strval($m['member_id']) === strval($user['member_id'])) {
                $balance = floatval($m['member_balance'] ?? 0);
                break;
            }
        }
    }

    $response = [
        'member_offer_id' => $memberOfferId,
        'status' => 'cancelled',
        'balance' => $balance,
        'icafe_cancelled' => true,
    ];

    logResponse(0, "Booking cancelled OK: {$login}, new balance: {$balance}");
    jsonResponse(0, 'Success', $response);

} catch (PDOException $e) {
    logError('Cancel error', $e);
    jsonResponse(1, 'Ошибка сервера: ' . $e->getMessage());
}
