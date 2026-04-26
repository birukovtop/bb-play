<?php
/**
 * BlackBears Play — Отмена всех бронирований
 * 
 * Скрипт отменяет все активные брони в таблице friend_bookings
 * и через внешний API клуба.
 * 
 * Если member_offer_id пустой — получает его через /all-books-cafes.
 * 
 * Запуск: php cancel_all_bookings.php
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

/**
 * Получает member_offer_id из all-books-cafes по совпадению pc_name + date + time
 */
function findMemberOfferId($login, $pcName, $startDate, $startTime, $icafeId) {
    echo "  → Поиск member_offer_id через all-books-cafes для {$login}...\n";
    
    $result = remoteGet('/all-books-cafes?memberAccount=' . urlencode($login), []);
    
    if (($result['code'] !== 200 && $result['code'] !== 0) || empty($result['data'])) {
        echo "  ✗ Не удалось получить брони из all-books-cafes\n";
        return null;
    }

    $data = $result['data'];
    
    // Данные могут быть в data[icafe_id] или просто data
    $bookingsList = [];
    if (isset($data[$icafeId]) && is_array($data[$icafeId])) {
        $bookingsList = $data[$icafeId];
    } elseif (isset($data['data'][$icafeId]) && is_array($data['data'][$icafeId])) {
        $bookingsList = $data['data'][$icafeId];
    } elseif (is_array($data)) {
        // Может быть массив во всех клубах
        foreach ($data as $clubId => $clubBookings) {
            if (is_array($clubBookings)) {
                $bookingsList = array_merge($bookingsList, $clubBookings);
            }
        }
    }

    if (empty($bookingsList)) {
        echo "  ✗ Нет бронирований в ответе\n";
        return null;
    }

    // Нормализуем дату/время для сравнения
    $targetDate = date('Y-m-d', strtotime($startDate));
    $targetTime = date('H:i', strtotime($startTime));

    foreach ($bookingsList as $booking) {
        $bPcName = $booking['product_pc_name'] ?? $booking['pc_name'] ?? '';
        $bDate = $booking['product_available_date_local_from'] ?? $booking['start_date'] ?? '';
        $bTime = $booking['product_available_time_from'] ?? $booking['start_time'] ?? '';
        
        // Нормализуем
        $bDateNorm = $bDate ? date('Y-m-d', strtotime($bDate)) : '';
        $bTimeNorm = $bTime ? date('H:i', strtotime($bTime)) : '';

        if ($bPcName === $pcName && $bDateNorm === $targetDate && $bTimeNorm === $targetTime) {
            $offerId = $booking['member_offer_id'] ?? null;
            if ($offerId) {
                echo "  ✓ Найден member_offer_id: {$offerId}\n";
                return $offerId;
            }
        }
    }

    echo "  ⚠ Бронь не найдена в all-books-cafes (возможно уже отменена)\n";
    return null;
}

echo "=== Отмена всех бронирований ===\n\n";

try {
    $pdo = getDB();

    // Получаем все активные брони
    $stmt = $pdo->prepare("SELECT * FROM friend_bookings WHERE status = 'active'");
    $stmt->execute();
    $bookings = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($bookings)) {
        echo "Нет активных бронирований.\n";
        exit(0);
    }

    echo "Найдено активных бронирований: " . count($bookings) . "\n\n";

    $successCount = 0;
    $errorCount = 0;

    foreach ($bookings as $booking) {
        $bookingId = $booking['id'];
        $bookerLogin = $booking['booker_login'];
        $friendLogin = $booking['friend_login'];
        $pcName = $booking['pc_name'];
        $startDate = $booking['start_date'];
        $startTime = $booking['start_time'];
        $memberOfferId = $booking['member_offer_id'];
        $icafeId = $booking['icafe_id'];

        echo "[{$bookingId}] Отмена: {$bookerLogin} -> {$friendLogin}, PC: {$pcName}, Дата: {$startDate} {$startTime}\n";

        // Если member_offer_id пустой — пытаемся получить
        if (empty($memberOfferId)) {
            // Пробуем получить для booker
            $memberOfferId = findMemberOfferId($bookerLogin, $pcName, $startDate, $startTime, $icafeId);
            
            // Если не нашли — пробуем для friend
            if (empty($memberOfferId)) {
                $memberOfferId = findMemberOfferId($friendLogin, $pcName, $startDate, $startTime, $icafeId);
            }
        }

        // Отмена через внешний API клуба
        if (!empty($memberOfferId)) {
            $cancelResult = remoteDelete('/api/v2/cafe/' . $icafeId . '/bookings', [
                'pc_name' => $pcName,
                'member_offer_id' => (int)$memberOfferId,
            ]);

            $cancelCode = $cancelResult['code'] ?? -1;
            $cancelSuccess = ($cancelCode === 200 || $cancelCode === 0);
            
            if ($cancelSuccess && !empty($cancelResult['data']['results'])) {
                foreach ($cancelResult['data']['results'] as $r) {
                    if (($r['status'] ?? '') !== 'success') {
                        $cancelSuccess = false;
                        break;
                    }
                }
            }

            if ($cancelSuccess) {
                echo "  ✓ Внешний API: успешно\n";
            } else {
                $msg = $cancelResult['message'] ?? 'Неизвестная ошибка';
                echo "  ✗ Внешний API: {$msg}\n";
                $errorCount++;
                
                // Всё равно обновляем локальную базу
                $updStmt = $pdo->prepare("UPDATE friend_bookings SET status = 'cancelled' WHERE id = ?");
                $updStmt->execute([$bookingId]);
                echo "  ✓ Локальная база: обновлено\n\n";
                continue;
            }
        } else {
            echo "  ⚠ Нет member_offer_id, пропускаем внешний API\n";
        }

        // Обновляем статус в локальной базе
        $updStmt = $pdo->prepare("UPDATE friend_bookings SET status = 'cancelled' WHERE id = ?");
        $updStmt->execute([$bookingId]);

        echo "  ✓ Локальная база: обновлено\n\n";
        $successCount++;
    }

    echo "\n=== Итог ===\n";
    echo "Успешно отменено: {$successCount}\n";
    echo "Ошибок: {$errorCount}\n";

} catch (PDOException $e) {
    echo "Ошибка базы данных: " . $e->getMessage() . "\n";
    exit(1);
} catch (Exception $e) {
    echo "Ошибка: " . $e->getMessage() . "\n";
    exit(1);
}
