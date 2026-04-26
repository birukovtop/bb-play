<?php
/**
 * BlackBears Play — Создание бронирования (POST /api/booking.php)
 *
 * Бронирование через внешний API клуба (vibe.blackbearsplay.ru).
 * Без локальной записи в bookings.
 *
 * Тело запроса (JSON):
 * {
 *   "login": "test1",
 *   "icafe_id": "87375",
 *   "pc_name": "PC09",
 *   "start_date": "2026-04-08",
 *   "start_time": "18:00",
 *   "duration_min": 60
 * }
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

function saveLocalOwnBooking(PDO $pdo, array $payload): void {
    try {
        $stmt = $pdo->prepare("
            INSERT INTO bookings
            (user_id, icafe_id, cafe_address, pc_name, pc_area, start_date, start_time, duration_min, price, status, member_offer_id, booking_password, description)
            VALUES
            (:user_id, :icafe_id, :cafe_address, :pc_name, :pc_area, :start_date, :start_time, :duration_min, :price, :status, :member_offer_id, :booking_password, :description)
        ");
        $stmt->execute([
            ':user_id' => $payload['user_id'],
            ':icafe_id' => $payload['icafe_id'],
            ':cafe_address' => $payload['cafe_address'] ?? null,
            ':pc_name' => $payload['pc_name'],
            ':pc_area' => $payload['pc_area'] ?? null,
            ':start_date' => $payload['start_date'],
            ':start_time' => $payload['start_time'],
            ':duration_min' => $payload['duration_min'],
            ':price' => $payload['price'] ?? 0,
            ':status' => $payload['status'] ?? 'active',
            ':member_offer_id' => $payload['member_offer_id'] ?: null,
            ':booking_password' => $payload['booking_password'] ?: null,
            ':description' => $payload['description'] ?? null,
        ]);
    } catch (Throwable $e) {
        logMsg('BOOKING_LOCAL_WARN', 'Local booking save failed: ' . $e->getMessage());
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(1, 'Метод не поддерживается');
}

$body = getJSONBody();
$login = trim($body['login'] ?? '');

logRequest('booking', $body);

if (empty($login)) {
    jsonResponse(413, 'Empty login');
}

try {
    $pdo = getDB();

    // Находим пользователя (только для member_id)
    $stmt = $pdo->prepare("SELECT id, member_id, icafe_id FROM users WHERE login = :login LIMIT 1");
    $stmt->execute([':login' => $login]);
    $user = $stmt->fetch();

    if (!$user) {
        jsonResponse(1, 'Пользователь не найден');
    }

    $userId = intval($user['id'] ?? 0);
    $memberId = $user['member_id'];
    $icafeId = $body['icafe_id'] ?: $user['icafe_id'] ?: '87375';
    $pcName = trim($body['pc_name'] ?? '');
    $startDate = trim($body['start_date'] ?? '');
    $startTime = trim($body['start_time'] ?? '');
    $mins = intval($body['duration_min'] ?? 60);
    $productId = $body['product_id'] ?? null;
    $productName = trim($body['product_name'] ?? '');
    $productPrice = floatval($body['price'] ?? $body['product_price'] ?? 0);

    if (empty($pcName)) jsonResponse(414, 'Empty pc_name');
    if (empty($startDate)) jsonResponse(417, 'Empty dateStart');
    if (empty($startTime)) jsonResponse(418, 'Empty timeStart');
    if ($mins <= 0) jsonResponse(419, 'Empty mins');

    // Проверяем бронирование для друга
    $forFriendId = intval($body['for_friend_id'] ?? 0);
    $friend = null;

    if ($forFriendId > 0) {
        $fStmt = $pdo->prepare("SELECT id, login, member_id, name FROM users WHERE id = ? LIMIT 1");
        $fStmt->execute([$forFriendId]);
        $friend = $fStmt->fetch();
        if (!$friend) {
            jsonResponse(1, 'Друг не найден в системе (ID: ' . $forFriendId . ')');
        }
        // Броним на СВОЙ аккаунт (деньги с НАС), записываем для кого в friend_bookings
        logMsg('BOOKING_FRIEND', "Booking for friend: {$login} (payer) -> {$friend['login']} (recipient)");
    }

    // ============================================================
    // Получаем актуальный баланс ДО бронирования
    // ============================================================
    $balanceResult = remoteGet('/api/v2/cafe/' . $icafeId . '/members', []);
    $currentBalance = 0;

    if (($balanceResult['code'] === 200 || $balanceResult['code'] === 0) && !empty($balanceResult['data']['members'])) {
        foreach ($balanceResult['data']['members'] as $m) {
            if (strval($m['member_id']) === strval($memberId)) {
                $currentBalance = floatval($m['member_balance'] ?? 0);
                break;
            }
        }
    }

    // ============================================================
    // БРОНИРОВАНИЕ: Batch API для друга, обычное для себя
    // ============================================================
    $pdo->beginTransaction();

    try {
        // Блокируем строку пользователя для предотвращения race condition
        $stmt = $pdo->prepare("SELECT member_id, icafe_id FROM users WHERE login = :login FOR UPDATE");
        $stmt->execute([':login' => $login]);

        $bookingResult = null;
        $bookingResponse = [];

        // -------------------------------------------------------
        // ВАРИАНТ A: Для друга — бронируем 2 раза (себе + другу)
        // -------------------------------------------------------
        if ($forFriendId > 0 && $friend) {
            logMsg('DOUBLE_BOOKING', "Creating double booking: {$login} -> self ({$pcName}) + friend {$friend['login']}");

            // Определяем параметры для второй брони (другу)
            $friendPcName = trim($body['friend_pc_name'] ?? '');
            if (empty($friendPcName)) {
                $pdo->rollBack();
                jsonResponse(1, 'Укажи friend_pc_name — ПК для друга (например, PC10)');
            }

            $friendLoginForBooking = $friend['login'];
            $friendMemberIdForBooking = $friend['member_id'] ?: null;
            $friendGuestBooking = $friend['member_id'] ? 0 : 1;

            // -------------------------------------------------------
            // Проверяем и пополняем баланс друга перед бронью
            // -------------------------------------------------------
            if ($friendMemberIdForBooking) {
                $friendBalanceCheck = remoteGet('/api/v2/cafe/' . $icafeId . '/members', []);
                $friendCurrentBalance = 0;
                if (($friendBalanceCheck['code'] === 200 || $friendBalanceCheck['code'] === 0) && !empty($friendBalanceCheck['data']['members'])) {
                    foreach ($friendBalanceCheck['data']['members'] as $fm) {
                        if (strval($fm['member_id']) === strval($friendMemberIdForBooking)) {
                            $friendCurrentBalance = floatval($fm['member_balance'] ?? 0);
                            break;
                        }
                    }
                }

                // Если баланс друга < 2₽ → пополняем на 100₽
                if ($friendCurrentBalance < 2) {
                    $topupAmount = 100.0;
                    logMsg('FRIEND_BALANCE_LOW', "Friend {$friend['login']} balance: {$friendCurrentBalance}₽. Topup {$topupAmount}₽");
                    $friendTopupResult = remotePost('/api/v2/cafe/' . $icafeId . '/members/action/topup', [
                        'topup_ids' => $friendMemberIdForBooking,
                        'topup_value' => $topupAmount,
                    ]);
                    if (($friendTopupResult['code'] ?? -1) >= 200) {
                        logMsg('FRIEND_TOPUP', "Topup OK for {$friend['login']}: ".json_encode($friendTopupResult));
                    } else {
                        logMsg('FRIEND_TOPUP_WARN', "Topup failed for {$friend['login']}: ".json_encode($friendTopupResult));
                    }
                    // Небольшая задержка чтобы баланс обновился
                    usleep(200000);
                } else {
                    logMsg('FRIEND_BALANCE_OK', "Friend {$friend['login']} balance: {$friendCurrentBalance}₽ — достаточный");
                }
            }

            // --- Бронь 1: для себя ---
            $randKey1 = random_int(10000000000, 99999999999);
            $key1 = md5($icafeId . $pcName . $login . $memberId . $startDate . $startTime . $mins . $randKey1);

            $bookingBody1 = [
                'pc_name' => $pcName,
                'member_account' => $login,
                'member_id' => $memberId,
                'start_date' => $startDate,
                'start_time' => $startTime,
                'mins' => (int)$mins,
                'rand_key' => $randKey1,
                'key' => $key1,
            ];

            // Если выбран пакет — передаём product_id
            if ($productId) {
                $bookingBody1['product_id'] = $productId;
                $bookingBody1['product_name'] = $productName ?: null;
                if ($productPrice > 0) {
                    $bookingBody1['price'] = $productPrice;
                    $bookingBody1['product_price'] = $productPrice;
                }
            }

            logMsg('BOOKING_1_REQUEST', json_encode($bookingBody1));

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, REMOTE_API_BASE . '/booking');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($bookingBody1));
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'Accept: application/json']);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

            $response1 = curl_exec($ch);
            $httpCode1 = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            $result1 = json_decode($response1, true);
            logMsg('BOOKING_1_RESPONSE', json_encode(['http' => $httpCode1, 'result' => $result1]));

            $code1 = $result1['code'] ?? -1;
            $error1 = null;
            if ($code1 === 0) {
                foreach ($result1 as $k => $v) {
                    if (!in_array($k, ['code', 'message', 'data', 'iCafe_response']) && is_string($v)) {
                        $error1 = $v; break;
                    }
                }
            }

            $success1 = ($httpCode1 === 200) && ($code1 === 3 || ($code1 === 0 && !$error1));

            if (!$success1) {
                $pdo->rollBack();
                $msg1 = $error1 ?? $result1['message'] ?? 'HTTP ' . $httpCode1;
                logMsg('BOOKING_1_ERROR', $msg1);
                jsonResponse(1, 'Не удалось забронировать себе: ' . $msg1);
            }

            // Извлекаем данные первой брони
            $data1 = $result1['iCafe_response'] ?? $result1['data'] ?? [];
            $selfPassword = $data1['data']['booking_password'] ?? $data1['booking_password'] ?? '';
            $selfOfferId = $data1['data']['member_offer_id'] ?? $data1['member_offer_id'] ?? '';
            $selfCost = $result1['booking_cost'] ?? $data1['booking_cost'] ?? $data1['data']['cost'] ?? 0;

            logMsg('BOOKING_1_OK', "PC={$pcName}, password={$selfPassword}, offer_id={$selfOfferId}");

            // Небольшая задержка перед второй бронью
            usleep(200000); // 200ms

            // --- Бронь 2: для друга ---
            $randKey2 = random_int(10000000000, 99999999999);
            $key2 = md5($icafeId . $friendPcName . $friendLoginForBooking . ($friendMemberIdForBooking ?: $memberId) . $startDate . $startTime . $mins . $randKey2);

            $bookingBody2 = [
                'pc_name' => $friendPcName,
                'member_account' => $friendLoginForBooking,
                'member_id' => $friendMemberIdForBooking,
                'start_date' => $startDate,
                'start_time' => $startTime,
                'mins' => (int)$mins,
                'rand_key' => $randKey2,
                'key' => $key2,
                'guest_booking' => $friendGuestBooking,
            ];

            // Если выбран пакет — передаём product_id
            if ($productId) {
                $bookingBody2['product_id'] = $productId;
                $bookingBody2['product_name'] = $productName ?: null;
                if ($productPrice > 0) {
                    $bookingBody2['price'] = $productPrice;
                    $bookingBody2['product_price'] = $productPrice;
                }
            }

            logMsg('BOOKING_2_REQUEST', json_encode($bookingBody2));

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, REMOTE_API_BASE . '/booking');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($bookingBody2));
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'Accept: application/json']);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

            $response2 = curl_exec($ch);
            $httpCode2 = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            $result2 = json_decode($response2, true);
            logMsg('BOOKING_2_RESPONSE', json_encode(['http' => $httpCode2, 'result' => $result2]));

            $code2 = $result2['code'] ?? -1;
            $error2 = null;
            if ($code2 === 0) {
                foreach ($result2 as $k => $v) {
                    if (!in_array($k, ['code', 'message', 'data', 'iCafe_response']) && is_string($v)) {
                        $error2 = $v; break;
                    }
                }
            }

            $success2 = ($httpCode2 === 200) && ($code2 === 3 || ($code2 === 0 && !$error2));

            if (!$success2) {
                $pdo->rollBack();
                $msg2 = $error2 ?? $result2['message'] ?? 'HTTP ' . $httpCode2;
                logMsg('BOOKING_2_ERROR', $msg2);
                jsonResponse(1, 'Не удалось забронировать другу: ' . $msg2);
            }

            // Извлекаем данные второй брони
            $data2 = $result2['iCafe_response'] ?? $result2['data'] ?? [];
            $friendPassword = $data2['data']['booking_password'] ?? $data2['booking_password'] ?? '';
            $friendOfferId = $data2['data']['member_offer_id'] ?? $data2['member_offer_id'] ?? '';
            $friendCost = $result2['booking_cost'] ?? $data2['booking_cost'] ?? $data2['data']['cost'] ?? 0;

            logMsg('BOOKING_2_OK', "PC={$friendPcName}, password={$friendPassword}, offer_id={$friendOfferId}");

            $bookingResponse = [
                'booking_id' => $selfOfferId,
                'pc_name' => $pcName,
                'start_date' => $startDate,
                'start_time' => $startTime,
                'duration' => $mins,
                'price' => $selfCost,
                'booking_password' => $selfPassword,
                'push_status' => 'not_needed',
                'balance_before' => $currentBalance,
                'for_friend' => [
                    'id' => $friend['id'],
                    'login' => $friend['login'],
                    'name' => $friend['name'] ?? $friend['login'],
                    'pc_name' => $friendPcName,
                    'booking_id' => $friendOfferId,
                    'booking_password' => $friendPassword,
                    'price' => $friendCost,
                    'member_offer_id' => $friendOfferId,
                ],
            ];

            saveLocalOwnBooking($pdo, [
                'user_id' => $userId,
                'icafe_id' => $icafeId,
                'pc_name' => $pcName,
                'start_date' => $startDate,
                'start_time' => $startTime,
                'duration_min' => $mins,
                'price' => $selfCost,
                'status' => 'active',
                'member_offer_id' => $selfOfferId,
                'booking_password' => $selfPassword,
                'description' => $productName ?: null,
            ]);

            // Сохраняем бронь для друга в БД
            try {
                $insStmt = $pdo->prepare("
                    INSERT INTO friend_bookings
                    (booker_login, booker_member_id, friend_login, friend_member_id, icafe_id,
                     pc_name, start_date, start_time, duration_min, price, booking_password, member_offer_id)
                    VALUES
                    (:booker_login, :booker_member_id, :friend_login, :friend_member_id, :icafe_id,
                     :pc_name, :start_date, :start_time, :duration_min, :price, :booking_password, :member_offer_id)
                ");
                $insStmt->execute([
                    ':booker_login' => $login,
                    ':booker_member_id' => $memberId,
                    ':friend_login' => $friend['login'],
                    ':friend_member_id' => $friend['member_id'],
                    ':icafe_id' => $icafeId,
                    ':pc_name' => $friendPcName,
                    ':start_date' => $startDate,
                    ':start_time' => $startTime,
                    ':duration_min' => $mins,
                    ':price' => $friendCost,
                    ':booking_password' => $friendPassword,
                    ':member_offer_id' => $friendOfferId,
                ]);
                logMsg('FRIEND_BOOKING', "Saved double: {$login} -> {$friend['login']} (pc: {$friendPcName})");
            } catch (Exception $e) {
                logMsg('FRIEND_BOOKING_ERR', "Error: {$e->getMessage()}");
            }

        // -------------------------------------------------------
        // ВАРИАНТ B: Обычное бронирование (только для себя)
        // -------------------------------------------------------
        } else {
            $randKey = random_int(10000000000, 99999999999);
            $keyString = $icafeId . $pcName . $login . $memberId . $startDate . $startTime . $mins . $randKey;
            $signKey = md5($keyString);

            $bookingBody = [
                'pc_name' => $pcName,
                'member_account' => $login,
                'member_id' => $memberId,
                'start_date' => $startDate,
                'start_time' => $startTime,
                'mins' => (int)$mins,
                'rand_key' => $randKey,
                'key' => $signKey,
            ];

            // Если выбран пакет — передаём product_id и цену,
            // после бронирования списываем разницу через отрицательный topup
            if ($productId) {
                $bookingBody['product_id'] = $productId;
                $bookingBody['product_name'] = $productName ?: null;
                if ($productPrice > 0) {
                    $bookingBody['price'] = $productPrice;
                    $bookingBody['product_price'] = $productPrice;
                }
            }

            logMsg('BOOKING_REQUEST', json_encode($bookingBody));

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, REMOTE_API_BASE . '/booking');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($bookingBody));
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'Accept: application/json',
            ]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            $bookingResult = json_decode($response, true);
            logMsg('BOOKING_RESPONSE', json_encode(['http' => $httpCode, 'result' => $bookingResult]));

            $resultCode = $bookingResult['code'] ?? -1;
            $errorMsg = null;

            if ($resultCode === 0) {
                foreach ($bookingResult as $k => $v) {
                    if (!in_array($k, ['code', 'message', 'data', 'iCafe_response']) && is_string($v)) {
                        $errorMsg = $v;
                        break;
                    }
                }
            }

            $isSuccess = ($httpCode === 200) && ($resultCode === 3 || ($resultCode === 0 && !$errorMsg));

            if (!$isSuccess) {
                $pdo->rollBack();
                $msg = $errorMsg ?? $bookingResult['message'] ?? 'HTTP Error ' . $httpCode;
                if (strpos($msg, 'occupied') !== false || strpos($msg, '600') !== false) {
                    jsonResponse(600, 'Booking is occupied');
                }
                jsonResponse(1, 'Не удалось забронировать: ' . $msg);
            }

            $iCafeData = $bookingResult['iCafe_response'] ?? $bookingResult['data'] ?? [];
            $bookingPassword = $iCafeData['data']['booking_password'] ?? $iCafeData['booking_password'] ?? '';
            $bookingCost = $bookingResult['booking_cost'] ?? $iCafeData['booking_cost'] ?? $iCafeData['data']['cost'] ?? 0;

            // Получаем member_offer_id из списка бронирований
            $memberOfferId = $iCafeData['data']['member_offer_id'] ?? $iCafeData['member_offer_id'] ?? 0;
            if (!$memberOfferId) {
                // Небольшая задержка чтобы бронь появилась в списке
                usleep(500000); // 500ms

                $booksUrl = REMOTE_API_BASE . '/all-books-cafes?memberAccount=' . urlencode($login);
                $ch2 = curl_init();
                curl_setopt($ch2, CURLOPT_URL, $booksUrl);
                curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch2, CURLOPT_TIMEOUT, 10);
                curl_setopt($ch2, CURLOPT_HTTPHEADER, ['Accept: application/json']);
                curl_setopt($ch2, CURLOPT_SSL_VERIFYPEER, true);
                $booksResp = curl_exec($ch2);
                curl_close($ch2);

                $booksData = json_decode($booksResp, true);
                if (!empty($booksData['data'][$icafeId])) {
                    // Ищем бронь по PC + дате + времени
                    foreach ($booksData['data'][$icafeId] as $b) {
                        if ($b['product_pc_name'] === $pcName && strpos($b['product_available_date_local_from'] ?? '', "$startDate $startTime") === 0) {
                            $memberOfferId = intval($b['member_offer_id'] ?? 0);
                            break;
                        }
                    }
                    // Fallback: последняя бронь
                    if (!$memberOfferId) {
                        $last = end($booksData['data'][$icafeId]);
                        $memberOfferId = intval($last['member_offer_id'] ?? 0);
                    }
                }
            }

            $bookingResponse = [
                'booking_id' => $memberOfferId,
                'pc_name' => $pcName,
                'start_date' => $startDate,
                'start_time' => $startTime,
                'duration' => $mins,
                'price' => $bookingCost,
                'booking_password' => $bookingPassword,
                'push_status' => 'not_needed',
                'balance_before' => $currentBalance,
            ];

            saveLocalOwnBooking($pdo, [
                'user_id' => $userId,
                'icafe_id' => $icafeId,
                'pc_name' => $pcName,
                'start_date' => $startDate,
                'start_time' => $startTime,
                'duration_min' => $mins,
                'price' => $bookingCost,
                'status' => 'active',
                'member_offer_id' => $memberOfferId,
                'booking_password' => $bookingPassword,
                'description' => $productName ?: null,
            ]);

            // Если выбран пакет — списываем цену пакета минус то что vibe уже списал
            if ($productId) {
                $clientPrice = $productPrice;
                $vibeCost = floatval($bookingCost);

                if ($clientPrice > 0) {
                    // vibe уже списал $vibeCost с бонуса, поэтому списываем разницу
                    $toDeduct = $clientPrice - $vibeCost;
                    if ($toDeduct > 0) {
                        logMsg('PACKAGE_DEDUCT', "Списываем пакет: {$clientPrice}₽ (vibe уже списал {$vibeCost}₽ с бонуса, доплачиваем {$toDeduct}₽)");

                        $deductResult = remotePost('/api/v2/cafe/' . $icafeId . '/members/action/topup', [
                            'topup_ids' => (string)$memberId,
                            'topup_value' => -$toDeduct,
                            'topup_balance_bonus' => 0,
                            'comment' => "Бронь пакета: {$productName} (@{$pcName} {$startDate} {$startTime})",
                        ]);

                        $deductCode = $deductResult['code'] ?? -1;
                        if ($deductCode === 200) {
                            logMsg('PACKAGE_DEDUCT_OK', "Списано {$toDeduct}₽: " . json_encode($deductResult));
                            $bookingResponse['price'] = $clientPrice;
                            $bookingResponse['package_deducted'] = $toDeduct;
                        } else {
                            logMsg('PACKAGE_DEDUCT_WARN', "Не удалось списать {$toDeduct}₽: " . json_encode($deductResult));
                        }
                    }
                }
            }
        }

        // Фиксируем транзакцию
        $pdo->commit();
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        logMsg('BOOKING_TRANSACTION_ERR', "Error: {$e->getMessage()}");
        jsonResponse(1, 'Ошибка сервера при бронировании: ' . $e->getMessage());
    }

    // ============================================================
    // Получаем актуальный баланс (через GET members)
    // ============================================================
    // Небольшая задержка чтобы vibe успел обновить баланс
    usleep(500000); // 500ms

    $balanceResult = remoteGet('/api/v2/cafe/' . $icafeId . '/members', []);
    logMsg('BALANCE_CHECK', "memberId={$memberId}, response=" . json_encode(['code' => $balanceResult['code'], 'members_count' => count($balanceResult['data']['members'] ?? [])]));

    if (($balanceResult['code'] === 200 || $balanceResult['code'] === 0) && !empty($balanceResult['data']['members'])) {
        foreach ($balanceResult['data']['members'] as $m) {
            if (strval($m['member_id']) === strval($memberId)) {
                $bookingResponse['balance'] = floatval($m['member_balance'] ?? 0);
                $bookingResponse['balance_after'] = $bookingResponse['balance'];
                logMsg('BALANCE_FOUND', "Found balance for memberId={$memberId}: {$bookingResponse['balance']}");
                break;
            }
        }
    }

    logResponse(0, "Booking created: {$login} -> {$pcName}");
    jsonResponse(0, 'Success', $bookingResponse);

} catch (PDOException $e) {
    logError('Booking error', $e);
    jsonResponse(1, 'Ошибка сервера: ' . $e->getMessage());
}
