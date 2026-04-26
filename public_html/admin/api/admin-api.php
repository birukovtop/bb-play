<?php
/**
 * BlackBears Play — Admin API
 * 
 * Полный API для административной панели.
 * Все эндпоинты доступны через этот файл.
 * 
 * Действия:
 * - get_users: Список всех пользователей (по клубам)
 * - get_user: Информация о конкретном пользователе
 * - update_user: Обновление данных пользователя
 * - topup_user: Пополнение баланса пользователя
 * - get_user_bookings: Бронирования пользователя
 * - get_all_bookings: Все бронирования (по клубам)
 * - cancel_booking: Отмена бронирования
 * - get_cafes: Список клубов
 * - get_cafe_stats: Статистика клуба
 * - get_pc_status: Статус ПК (онлайн/оффлайн)
 * - get_prices: Тарифы и пакеты
 * - get_ranking: Рейтинг игроков
 * - get_analytics: Аналитика клуба
 * - get_balance_history: История баланса пользователя
 * - get_orders: История заказов пользователя
 * - create_user: Создание пользователя
 * - delete_user: Удаление пользователя (локальная БД)
 * - export_users: Экспорт пользователей в CSV
 */

// Убедимся что заголовки ещё не отправлены
if (!headers_sent()) {
    // Отключаем вывод ошибок
    ini_set('display_errors', 0);
    error_reporting(E_ALL);
    
    // Очищаем буфер
    while (ob_get_level()) ob_end_clean();
}

require_once __DIR__ . '/../../api/config.php';

// Если action не передан - отдаём приветствие
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

if (empty($action)) {
    jsonResponse(0, 'Admin API works! Available actions: ' . implode(', ', [
        'get_users', 'get_user', 'update_user', 'topup_user', 'create_user', 'delete_user', 'export_users',
        'get_user_bookings', 'get_all_bookings', 'cancel_booking', 'create_booking',
        'get_cafes', 'get_cafe_stats', 'get_pc_status', 'get_available_pcs',
        'get_prices', 'get_ranking', 'get_analytics', 'get_balance_history', 'get_orders'
    ]));
}

try {
    switch ($action) {
        // ==================== ПОЛЬЗОВАТЕЛИ ====================
        
        case 'get_users':
            handleGetUsers();
            break;
            
        case 'get_user':
            handleGetUser();
            break;
            
        case 'update_user':
            handleUpdateUser();
            break;
            
        case 'topup_user':
            handleTopupUser();
            break;
            
        case 'create_user':
            handleCreateUser();
            break;
            
        case 'delete_user':
            handleDeleteUser();
            break;
            
        case 'export_users':
            handleExportUsers();
            break;
            
        // ==================== БРОНИРОВАНИЯ ====================
        
        case 'get_user_bookings':
            handleGetUserBookings();
            break;
            
        case 'get_all_bookings':
            handleGetAllBookings();
            break;
            
        case 'cancel_booking':
            handleCancelBooking();
            break;

        case 'create_booking':
            handleCreateBooking();
            break;
            
        // ==================== КЛУБЫ ====================
        
        case 'get_cafes':
            handleGetCafes();
            break;
            
        case 'get_cafe_stats':
            handleGetCafeStats();
            break;
            
        // ==================== ПК ====================
        
        case 'get_pc_status':
            handleGetPcStatus();
            break;
            
        case 'get_available_pcs':
            handleGetAvailablePcs();
            break;
            
        // ==================== ТАРИФЫ ====================
        
        case 'get_prices':
            handleGetPrices();
            break;
            
        // ==================== РЕЙТИНГ ====================
        
        case 'get_ranking':
            handleGetRanking();
            break;
            
        // ==================== АНАЛИТИКА ====================
        
        case 'get_analytics':
            handleGetAnalytics();
            break;
            
        case 'get_balance_history':
            handleGetBalanceHistory();
            break;
            
        case 'get_orders':
            handleGetOrders();
            break;

        case 'get_food_orders':
            handleGetFoodOrders();
            break;

        case 'get_food_order':
            handleGetFoodOrder();
            break;

        case 'update_food_order_status':
            handleUpdateFoodOrderStatus();
            break;

        case 'verify_food_order_code':
            handleVerifyFoodOrderCode();
            break;

        case 'complete_food_order':
            handleCompleteFoodOrder();
            break;

        case 'cancel_food_order':
            handleCancelFoodOrder();
            break;
            
        default:
            jsonResponse(416, "Unknown action: {$action}");
    }
} catch (Exception $e) {
    jsonResponse(500, "Server error: " . $e->getMessage());
}

// ==================== ОБРАБОТЧИКИ ====================

/**
 * Получить список всех пользователей клуба
 */
function handleGetUsers() {
    $cafeId = $_GET['cafe_id'] ?? $_POST['cafe_id'] ?? ICAFE_CLUB_ID;
    $search = $_GET['search'] ?? $_POST['search'] ?? '';
    
    $result = remoteGet("/api/v2/cafe/{$cafeId}/members");
    
    if ($result['code'] !== 200 || empty($result['data']['members'])) {
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'No users found', ['users' => []]);
    }
    
    $members = $result['data']['members'];
    
    // Фильтрация по поиску
    if (!empty($search)) {
        $search = strtolower($search);
        $members = array_filter($members, function($m) use ($search) {
            return stripos($m['member_account'] ?? '', $search) !== false ||
                   stripos($m['member_first_name'] ?? '', $search) !== false ||
                   stripos($m['member_id'] ?? '', $search) !== false ||
                   stripos($m['member_phone'] ?? '', $search) !== false ||
                   stripos($m['member_email'] ?? '', $search) !== false;
        });
        $members = array_values($members);
    }
    
    // Добавляем информацию из локальной БД
    $pdo = getDB();
    foreach ($members as &$member) {
        $stmt = $pdo->prepare("SELECT is_verified, avatar, avatar_type, created_at FROM users WHERE member_id = ? LIMIT 1");
        $stmt->execute([$member['member_id']]);
        $localUser = $stmt->fetch();
        
        $member['is_verified'] = $localUser ? (bool)$localUser['is_verified'] : false;
        $member['avatar'] = $localUser ? $localUser['avatar'] : null;
        $member['avatar_type'] = $localUser ? $localUser['avatar_type'] : null;
        $member['local_created'] = $localUser ? $localUser['created_at'] : null;
    }
    
    jsonResponse(0, 'Success', [
        'users' => $members,
        'total' => count($members),
        'cafe_id' => $cafeId
    ]);
}

/**
 * Получить информацию о конкретном пользователе
 */
function handleGetUser() {
    $memberId = $_GET['member_id'] ?? $_POST['member_id'] ?? '';
    $cafeId = $_GET['cafe_id'] ?? ICAFE_CLUB_ID;
    
    if (empty($memberId)) {
        jsonResponse(413, 'Missing member_id');
    }
    
    // Получаем из внешнего API
    $result = remoteGet("/api/v2/cafe/{$cafeId}/members");
    
    if ($result['code'] !== 200 || empty($result['data']['members'])) {
        jsonResponse(1, 'User not found');
    }
    
    $user = null;
    foreach ($result['data']['members'] as $m) {
        if ($m['member_id'] == $memberId) {
            $user = $m;
            break;
        }
    }
    
    if (!$user) {
        jsonResponse(1, 'User not found');
    }
    
    // Получаем из локальной БД
    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT * FROM users WHERE member_id = ? LIMIT 1");
    $stmt->execute([$memberId]);
    $localUser = $stmt->fetch();
    
    $user['local_data'] = $localUser;
    
    jsonResponse(0, 'Success', $user);
}

/**
 * Обновить данные пользователя
 */
function handleUpdateUser() {
    $body = getJSONBody();
    $memberId = $body['member_id'] ?? '';
    $cafeId = $body['cafe_id'] ?? ICAFE_CLUB_ID;
    
    if (empty($memberId)) {
        jsonResponse(413, 'Missing member_id');
    }
    
    $pdo = getDB();
    
    // Обновляем локальную БД
    $updates = [];
    $params = [];
    
    if (isset($body['name'])) {
        $updates[] = "name = ?";
        $params[] = $body['name'];
    }
    if (isset($body['phone'])) {
        $updates[] = "phone = ?";
        $params[] = $body['phone'];
    }
    if (isset($body['email'])) {
        $updates[] = "email = ?";
        $params[] = $body['email'];
    }
    if (isset($body['discount'])) {
        $updates[] = "discount = ?";
        $params[] = $body['discount'];
    }
    if (isset($body['is_verified'])) {
        $updates[] = "is_verified = ?";
        $params[] = (int)$body['is_verified'];
    }
    
    if (!empty($updates)) {
        $params[] = $memberId;
        $sql = "UPDATE users SET " . implode(', ', $updates) . " WHERE member_id = ?";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
    }
    
    jsonResponse(0, 'User updated successfully');
}

/**
 * Пополнить баланс пользователя
 */
function handleTopupUser() {
    $body = getJSONBody();
    $memberId = $body['member_id'] ?? '';
    $amount = floatval($body['amount'] ?? 0);
    $cafeId = $body['cafe_id'] ?? ICAFE_CLUB_ID;
    
    if (empty($memberId)) {
        jsonResponse(413, 'Missing member_id');
    }
    
    if ($amount <= 0) {
        jsonResponse(454, 'Invalid amount');
    }
    
    if ($amount < 10) {
        jsonResponse(454, 'Minimum topup amount is 10');
    }
    
    if ($amount > 100000) {
        jsonResponse(454, 'Maximum topup amount is 100000');
    }
    
    // Получаем бонус
    $bonusResult = remotePost("/api/v2/cafe/{$cafeId}/members/action/fetchBonus", [
        'member_id' => $memberId
    ]);
    
    $bonus = 0;
    if ($bonusResult['code'] === 200 && !empty($bonusResult['data']['bonus'])) {
        $bonus = floatval($bonusResult['data']['bonus']);
    }
    
    // Пополняем баланс
    $topupResult = remotePost("/api/v2/cafe/{$cafeId}/members/action/topup", [
        'topup_ids' => $memberId,
        'topup_value' => $amount,
        'topup_balance_bonus' => $bonus
    ]);
    
    if ($topupResult['code'] !== 200 && $topupResult['code'] !== 201) {
        jsonResponse($topupResult['code'] ?? 1, $topupResult['message'] ?? 'Topup failed');
    }
    
    // Получаем новый баланс
    $balanceResult = remoteGet("/api/v2/cafe/{$cafeId}/members");
    $newBalance = 0;
    if ($balanceResult['code'] === 200 && !empty($balanceResult['data']['members'])) {
        foreach ($balanceResult['data']['members'] as $m) {
            if ($m['member_id'] == $memberId) {
                $newBalance = floatval($m['member_balance']);
                break;
            }
        }
    }
    
    jsonResponse(0, 'Success', [
        'member_id' => $memberId,
        'added' => $amount + $bonus,
        'base_amount' => $amount,
        'bonus' => $bonus,
        'new_balance' => $newBalance
    ]);
}

/**
 * Создать пользователя
 */
function handleCreateUser() {
    $body = getJSONBody();
    $cafeId = $body['cafe_id'] ?? ICAFE_CLUB_ID;
    
    $account = $body['login'] ?? $body['member_account'] ?? '';
    $name = $body['name'] ?? $body['member_first_name'] ?? '';
    $phone = $body['phone'] ?? $body['member_phone'] ?? '';
    $email = $body['email'] ?? $body['member_email'] ?? '';
    $password = $body['password'] ?? $body['member_password'] ?? '';
    
    if (empty($account) || empty($name) || empty($phone) || empty($email) || empty($password)) {
        jsonResponse(413, 'Missing required fields');
    }
    
    if (strlen($account) < 2) {
        jsonResponse(454, 'Login must be at least 2 characters');
    }
    
    if (strlen($password) < 6) {
        jsonResponse(454, 'Password must be at least 6 characters');
    }
    
    if (!isValidPhone($phone)) {
        jsonResponse(451, 'Invalid phone number');
    }
    
    if (!isValidEmail($email)) {
        jsonResponse(452, 'Invalid email address');
    }
    
    // Создаем во внешнем API
    $result = remotePost("/api/v2/cafe/{$cafeId}/members", [
        'member_account' => $account,
        'member_first_name' => $name,
        'member_phone' => $phone,
        'member_email' => $email,
        'member_password' => $password
    ]);
    
    if ($result['code'] !== 200 && $result['code'] !== 201) {
        if (stripos($result['message'] ?? '', 'already exists') !== false) {
            jsonResponse(200, 'User already exists');
        }
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Registration failed');
    }
    
    // Получаем member_id
    $memberId = $result['data']['member_id'] ?? generateMemberId($account);
    
    // Создаем в локальной БД
    try {
        $pdo = getDB();
        $stmt = $pdo->prepare("
            INSERT INTO users (login, password, name, phone, email, member_id, icafe_id, discount, is_verified)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        ");
        $stmt->execute([
            $account,
            password_hash($password, PASSWORD_BCRYPT),
            $name,
            $phone,
            $email,
            $memberId,
            $cafeId,
            0.15
        ]);
    } catch (Exception $e) {
        // Пользователь уже есть в локальной БД - не критично
    }
    
    jsonResponse(0, 'User created successfully', [
        'member_id' => $memberId,
        'login' => $account,
        'cafe_id' => $cafeId
    ]);
}

/**
 * Удалить пользователя (локальная БД)
 */
function handleDeleteUser() {
    $body = getJSONBody();
    $memberId = $body['member_id'] ?? '';
    
    if (empty($memberId)) {
        jsonResponse(413, 'Missing member_id');
    }
    
    $pdo = getDB();
    $stmt = $pdo->prepare("DELETE FROM users WHERE member_id = ?");
    $stmt->execute([$memberId]);
    
    jsonResponse(0, 'User deleted from local database');
}

/**
 * Экспорт пользователей в CSV
 */
function handleExportUsers() {
    $cafeId = $_GET['cafe_id'] ?? ICAFE_CLUB_ID;
    
    $result = remoteGet("/api/v2/cafe/{$cafeId}/members");
    
    if ($result['code'] !== 200 || empty($result['data']['members'])) {
        jsonResponse(1, 'No users to export');
    }
    
    $members = $result['data']['members'];
    
    $csv = "\uFEFF"; // BOM для Excel
    $csv .= "ID;Логин;Имя;Телефон;Email;Баланс;Бонусы;Очки;Скидка;Club ID\n";
    
    foreach ($members as $m) {
        $csv .= implode(';', [
            $m['member_id'] ?? '',
            $m['member_account'] ?? '',
            $m['member_first_name'] ?? '',
            $m['member_phone'] ?? '',
            $m['member_email'] ?? '',
            $m['member_balance'] ?? 0,
            $m['member_balance_bonus'] ?? 0,
            $m['member_points'] ?? 0,
            $m['member_discount'] ?? 0,
            $m['member_icafe_id'] ?? ''
        ]) . "\n";
    }
    
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="users_' . $cafeId . '_' . date('Y-m-d') . '.csv"');
    echo $csv;
    exit;
}

/**
 * Получить бронирования пользователя
 */
function handleGetUserBookings() {
    $memberAccount = $_GET['login'] ?? $_POST['login'] ?? '';
    
    if (empty($memberAccount)) {
        jsonResponse(413, 'Missing login parameter');
    }
    
    $result = remoteGet('/all-books-cafes', ['memberAccount' => $memberAccount]);
    
    if ($result['code'] !== 0) {
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Failed to get bookings');
    }
    
    jsonResponse(0, 'Success', $result['data'] ?? []);
}

/**
 * Получить все бронирования (по клубам)
 */
function handleGetAllBookings() {
    $cafeId = $_GET['cafe_id'] ?? ICAFE_CLUB_ID;
    $date = $_GET['date'] ?? date('Y-m-d');
    
    // Получаем все клубы
    $cafesResult = remoteGet('/cafes');
    $cafes = $cafesResult['code'] === 0 ? ($cafesResult['data'] ?? []) : [];
    
    $allBookings = [];
    
    foreach ($cafes as $cafe) {
        $cid = $cafe['icafe_id'];
        $bookingsResult = remoteGet('/all-books-cafes');
        
        if ($bookingsResult['code'] === 0 && !empty($bookingsResult['data'])) {
            $allBookings[$cid] = $bookingsResult['data'][$cid] ?? [];
        } else {
            $allBookings[$cid] = [];
        }
    }
    
    jsonResponse(0, 'Success', [
        'bookings' => $allBookings,
        'total' => array_sum(array_map('count', $allBookings)),
        'date' => $date
    ]);
}

/**
 * Отменить бронирование
 */
function handleCancelBooking() {
    $body = getJSONBody();
    $pcName = $body['pc_name'] ?? '';
    $memberOfferId = $body['member_offer_id'] ?? '';
    $cafeId = $body['cafe_id'] ?? ICAFE_CLUB_ID;

    if (empty($pcName) || empty($memberOfferId)) {
        jsonResponse(413, 'Missing pc_name or member_offer_id');
    }

    // Используем DELETE /api/v2/cafe/{icafeId}/bookings (эндпоинт /booking-cancel заблокирован)
    $result = remoteDelete('/api/v2/cafe/' . $cafeId . '/bookings', [
        'pc_name' => $pcName,
        'member_offer_id' => intval($memberOfferId)
    ]);

    $cancelCode = $result['code'] ?? -1;
    $cancelSuccess = ($cancelCode === 200 || $cancelCode === 0);
    
    // Проверяем data.results[0].status === "success"
    if ($cancelSuccess && !empty($result['data']['results'])) {
        foreach ($result['data']['results'] as $r) {
            if (($r['status'] ?? '') !== 'success') {
                $cancelSuccess = false;
                break;
            }
        }
    }

    if (!$cancelSuccess) {
        $msg = $result['message'] ?? 'Неизвестная ошибка';
        jsonResponse($result['code'] ?? 1, 'Не удалось отменить бронь: ' . $msg);
    }

    jsonResponse(0, 'Booking cancelled successfully', $result['data']);
}

/**
 * Создать бронирование
 */
function handleCreateBooking() {
    $body = getJSONBody();
    $cafeId = $body['cafe_id'] ?? ICAFE_CLUB_ID;
    $pcName = $body['pc_name'] ?? '';
    $login = $body['login'] ?? '';
    $memberId = $body['member_id'] ?? '';
    $startDate = $body['start_date'] ?? '';
    $startTime = $body['start_time'] ?? '';
    $durationMin = intval($body['duration_min'] ?? 60);

    if (empty($pcName) || empty($login) || empty($startDate) || empty($startTime)) {
        jsonResponse(413, 'Missing required fields');
    }

    $pdo = getDB();

    // Если member_id не указан — находим по логину
    if (empty($memberId)) {
        $stmt = $pdo->prepare("SELECT member_id FROM users WHERE login = ? LIMIT 1");
        $stmt->execute([$login]);
        $user = $stmt->fetch();

        if ($user) {
            $memberId = $user['member_id'];
        }
    }

    // Генерируем подпись для бронирования
    $randKey = random_int(10000000000, 99999999999);
    $keyString = $cafeId . $pcName . $login . $memberId . $startDate . $startTime . $durationMin . $randKey;
    $key = md5($keyString);

    // Создаём бронь
    $bookingData = [
        'pc_name' => $pcName,
        'member_account' => $login,
        'member_id' => $memberId,
        'start_date' => $startDate,
        'start_time' => $startTime,
        'mins' => $durationMin,
        'rand_key' => $randKey,
        'key' => $key
    ];

    $result = remotePost('/booking', $bookingData);

    if ($result['code'] !== 3) {
        $errorMsg = $result['message'] ?? 'Failed to create booking';
        // Проверяем iCafe_response
        if (!empty($result['iCafe_response']['message'])) {
            $errorMsg = $result['iCafe_response']['message'];
        }
        jsonResponse($result['code'] ?? 1, $errorMsg);
    }

    $iCafeData = $result['iCafe_response']['data'] ?? $result['data'] ?? [];
    $bookingPassword = $iCafeData['booking_password'] ?? '';
    $memberOfferId = $iCafeData['member_offer_id'] ?? '';
    $cost = $iCafeData['cost'] ?? 0;

    jsonResponse(0, 'Booking created successfully', [
        'booking_password' => $bookingPassword,
        'member_offer_id' => $memberOfferId,
        'cost' => $cost,
        'pc_name' => $pcName,
        'login' => $login,
        'start_date' => $startDate,
        'start_time' => $startTime,
        'duration_min' => $durationMin
    ]);
}

/**
 * Получить список клубов
 */
function handleGetCafes() {
    syncCafes();
    
    $pdo = getDB();
    $stmt = $pdo->query("SELECT * FROM cafes WHERE is_active = 1 ORDER BY icafe_id");
    $cafes = $stmt->fetchAll();
    
    // Добавляем статистику по каждому клубу
    foreach ($cafes as &$cafe) {
        $cid = $cafe['icafe_id'];
        
        // Количество пользователей
        $stmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM users WHERE icafe_id = ?");
        $stmt->execute([$cid]);
        $cafe['users_count'] = $stmt->fetchColumn();
        
        // Количество бронирований
        $bookingsResult = remoteGet('/all-books-cafes');
        if ($bookingsResult['code'] === 0 && !empty($bookingsResult['data'][$cid])) {
            $cafe['active_bookings'] = count($bookingsResult['data'][$cid]);
        } else {
            $cafe['active_bookings'] = 0;
        }
    }
    
    jsonResponse(0, 'Success', $cafes);
}

/**
 * Получить статистику клуба
 */
function handleGetCafeStats() {
    $cafeId = $_GET['cafe_id'] ?? ICAFE_CLUB_ID;
    
    // Пользователи
    $usersResult = remoteGet("/api/v2/cafe/{$cafeId}/members");
    $users = $usersResult['code'] === 200 ? ($usersResult['data']['members'] ?? []) : [];
    
    $totalUsers = count($users);
    $totalBalance = array_sum(array_column($users, 'member_balance'));
    $totalBonus = array_sum(array_column($users, 'member_balance_bonus'));
    $totalPoints = array_sum(array_column($users, 'member_points'));
    
    // Бронирования
    $bookingsResult = remoteGet('/all-books-cafes');
    $bookings = [];
    if ($bookingsResult['code'] === 0 && !empty($bookingsResult['data'][$cafeId])) {
        $bookings = $bookingsResult['data'][$cafeId];
    }
    
    $activeBookings = 0;
    $now = time();
    foreach ($bookings as $b) {
        $endTime = strtotime($b['product_available_date_local_to'] ?? '');
        if ($endTime && ($endTime + 1800) > $now) { // +30 мин доигрывания
            $activeBookings++;
        }
    }
    
    // ПК
    $pcsResult = remoteGet("/api/v2/cafe/{$cafeId}/pcs");
    $pcs = $pcsResult['code'] === 200 ? ($pcsResult['data'] ?? []) : [];
    
    $onlinePcs = 0;
    $offlinePcs = 0;
    foreach ($pcs as $pc) {
        if (!empty($pc['pc_enabled'])) {
            $onlinePcs++;
        } else {
            $offlinePcs++;
        }
    }
    
    // Структура залов
    $roomsResult = remoteGet('/struct-rooms-icafe', ['cafeId' => $cafeId]);
    $rooms = $roomsResult['code'] === 0 ? ($roomsResult['data']['rooms'] ?? []) : [];
    
    jsonResponse(0, 'Success', [
        'cafe_id' => $cafeId,
        'users' => [
            'total' => $totalUsers,
            'total_balance' => $totalBalance,
            'total_bonus' => $totalBonus,
            'total_points' => $totalPoints
        ],
        'bookings' => [
            'total' => count($bookings),
            'active' => $activeBookings
        ],
        'pcs' => [
            'total' => count($pcs),
            'online' => $onlinePcs,
            'offline' => $offlinePcs
        ],
        'rooms' => count($rooms)
    ]);
}

/**
 * Получить статус ПК
 */
function handleGetPcStatus() {
    $cafeId = $_GET['cafe_id'] ?? ICAFE_CLUB_ID;
    
    // Онлайн список
    $onlineResult = remoteGet("/api/v2/cafe/{$cafeId}/pcs");
    $onlinePcs = $onlineResult['code'] === 200 ? ($onlineResult['data'] ?? []) : [];
    
    // Структура залов
    $roomsResult = remoteGet('/struct-rooms-icafe', ['cafeId' => $cafeId]);
    $rooms = $roomsResult['code'] === 0 ? ($roomsResult['data']['rooms'] ?? []) : [];
    
    jsonResponse(0, 'Success', [
        'rooms' => $rooms,
        'online_pcs' => $onlinePcs
    ]);
}

/**
 * Получить доступные ПК для бронирования
 */
function handleGetAvailablePcs() {
    $cafeId = $_GET['cafe_id'] ?? ICAFE_CLUB_ID;
    $date = $_GET['date'] ?? date('Y-m-d');
    $time = $_GET['time'] ?? date('H:i');
    $mins = intval($_GET['mins'] ?? 60);
    
    $result = remoteGet('/available-pcs-for-booking', [
        'cafeId' => $cafeId,
        'dateStart' => $date,
        'timeStart' => $time,
        'mins' => $mins
    ]);
    
    if ($result['code'] !== 0) {
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Failed to get available PCs');
    }
    
    jsonResponse(0, 'Success', $result['data']);
}

/**
 * Получить тарифы и пакеты
 */
function handleGetPrices() {
    $cafeId = $_GET['cafe_id'] ?? ICAFE_CLUB_ID;
    $memberId = $_GET['member_id'] ?? '';
    $mins = intval($_GET['mins'] ?? 60);
    $date = $_GET['date'] ?? date('Y-m-d');

    $params = [
        'cafeId' => $cafeId,
        'mins' => $mins,
        'bookingDate' => $date
    ];

    if (!empty($memberId)) {
        $params['memberId'] = $memberId;
    }

    // Получаем тарифы
    $result = remoteGet('/all-prices-icafe', $params);

    if ($result['code'] !== 0) {
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Failed to get prices');
    }

    $data = $result['data'] ?? [];

    // Получаем структуру залов для сопоставления с группами
    $roomsResult = remoteGet('/struct-rooms-icafe', ['cafeId' => $cafeId]);
    $rooms = $roomsResult['code'] === 0 ? ($roomsResult['data']['rooms'] ?? []) : [];

    // Собираем информацию о зонах
    $zoneInfo = [];
    foreach ($rooms as $room) {
        $zoneName = $room['area_name'] ?? '';
        if ($zoneName) {
            $zoneInfo[$zoneName] = [
                'pcs_count' => count($room['pcs_list'] ?? []),
                'pcs_list' => $room['pcs_list'] ?? [],
                'color_border' => $room['color_border'] ?? '',
                'color_text' => $room['color_text'] ?? ''
            ];
        }
    }

    // Добавляем информацию о зонах к тарифам
    if (!empty($data['prices'])) {
        foreach ($data['prices'] as &$price) {
            $groupName = $price['group_name'] ?? 'Default';
            // Если group_name = 'Default', показываем все зоны
            if ($groupName === 'Default' && !empty($zoneInfo)) {
                $price['zone_info'] = [
                    'pcs_count' => array_sum(array_column($zoneInfo, 'pcs_count')),
                    'is_all_zones' => true,
                    'all_zones' => array_keys($zoneInfo)
                ];
            } else {
                $price['zone_info'] = $zoneInfo[$groupName] ?? null;
            }
        }
    }

    // Добавляем информацию о зонах к пакетам
    if (!empty($data['products'])) {
        foreach ($data['products'] as &$product) {
            $groupName = $product['group_name'] ?? 'Default';
            // Если group_name = 'Default' или 'Booking', показываем все зоны
            if (($groupName === 'Default' || $groupName === 'Booking') && !empty($zoneInfo)) {
                $product['zone_info'] = [
                    'pcs_count' => array_sum(array_column($zoneInfo, 'pcs_count')),
                    'is_all_zones' => true,
                    'all_zones' => array_keys($zoneInfo)
                ];
            } else {
                $product['zone_info'] = $zoneInfo[$groupName] ?? null;
            }
        }
    }

    // Добавляем список всех зон
    $data['zones'] = $zoneInfo;
    $data['zones_list'] = array_keys($zoneInfo);

    jsonResponse(0, 'Success', $data);
}

/**
 * Получить рейтинг игроков
 */
function handleGetRanking() {
    $cafeId = $_GET['cafe_id'] ?? ICAFE_CLUB_ID;
    $page = intval($_GET['page'] ?? 1);
    $pageSize = intval($_GET['pageSize'] ?? 20);
    
    // Рейтинг через members/list с сортировкой по points
    $result = remoteGet("/api/v2/cafe/{$cafeId}/members");
    
    if ($result['code'] !== 200 || empty($result['data']['members'])) {
        jsonResponse(0, 'Success', [
            'rankings' => [],
            'total' => 0,
            'page' => $page,
            'pageSize' => $pageSize
        ]);
    }
    
    $members = $result['data']['members'];
    
    // Сортируем по очкам
    usort($members, function($a, $b) {
        return floatval($b['member_points'] ?? 0) <=> floatval($a['member_points'] ?? 0);
    });
    
    // Пагинация
    $total = count($members);
    $offset = ($page - 1) * $pageSize;
    $paged = array_slice($members, $offset, $pageSize);
    
    $rankings = [];
    $rank = $offset + 1;
    foreach ($paged as $m) {
        $rankings[] = [
            'rank' => $rank++,
            'member_id' => $m['member_id'],
            'member_account' => $m['member_account'] ?? '',
            'member_first_name' => $m['member_first_name'] ?? '',
            'total_hours' => round(floatval($m['member_points'] ?? 0) / 60, 1),
            'total_spent' => floatval($m['member_balance'] ?? 0),
            'points' => floatval($m['member_points'] ?? 0)
        ];
    }
    
    jsonResponse(0, 'Success', [
        'rankings' => $rankings,
        'total' => $total,
        'page' => $page,
        'pageSize' => $pageSize
    ]);
}

/**
 * Получить аналитику клиента
 */
function handleGetAnalytics() {
    $cafeId = $_GET['cafe_id'] ?? ICAFE_CLUB_ID;
    $memberId = $_GET['member_id'] ?? '';
    
    if (empty($memberId)) {
        jsonResponse(413, 'Missing member_id');
    }
    
    $result = remoteGet('/customer-analysis', [
        'cafeId' => $cafeId,
        'memberId' => $memberId
    ]);
    
    if ($result['code'] !== 0) {
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Failed to get analytics');
    }
    
    jsonResponse(0, 'Success', $result['data']);
}

/**
 * Получить историю баланса пользователя
 */
function handleGetBalanceHistory() {
    $cafeId = $_GET['cafe_id'] ?? ICAFE_CLUB_ID;
    $memberId = $_GET['member_id'] ?? '';
    
    if (empty($memberId)) {
        jsonResponse(413, 'Missing member_id');
    }
    
    $result = remoteGet("/api/v2/cafe/{$cafeId}/memberBalanceHistory", [
        'member_id' => $memberId
    ]);
    
    if ($result['code'] !== 200) {
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Failed to get balance history');
    }
    
    jsonResponse(0, 'Success', $result['data']);
}

/**
 * Получить историю заказов пользователя
 */
function handleGetOrders() {
    $cafeId = $_GET['cafe_id'] ?? ICAFE_CLUB_ID;
    $memberId = $_GET['member_id'] ?? '';
    
    if (empty($memberId)) {
        jsonResponse(413, 'Missing member_id');
    }
    
    $result = remoteGet("/api/v2/cafe/{$cafeId}/memberOrders", [
        'member_id' => $memberId
    ]);
    
    if ($result['code'] !== 200) {
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Failed to get orders');
    }

    jsonResponse(0, 'Success', $result['data']);
}

function handleGetFoodOrders() {
    $pdo = getDB();
    ensureAdminFoodOrderTables($pdo);
    $status = $_GET['status'] ?? '';
    $group = $_GET['status_group'] ?? '';
    $params = [];
    if ($status !== '') {
        $where = 'WHERE o.status = ?';
        $params[] = $status;
    } elseif ($group === 'active') {
        $where = "WHERE o.status IN ('new','awaiting_pickup','delivering')";
    } elseif ($group === 'history') {
        $where = "WHERE o.status IN ('completed','cancelled')";
    } else {
        $where = '';
    }
    $stmt = $pdo->prepare("
        SELECT o.*, GROUP_CONCAT(CONCAT(i.name, ' × ', i.qty) ORDER BY i.id SEPARATOR ', ') AS items_summary
        FROM food_orders o
        LEFT JOIN food_order_items i ON i.order_id = o.id
        $where
        GROUP BY o.id
        ORDER BY FIELD(o.status, 'new','awaiting_pickup','delivering','completed','cancelled'), o.created_at DESC
        LIMIT 100
    ");
    $stmt->execute($params);
    jsonResponse(0, 'Success', $stmt->fetchAll());
}

function handleGetFoodOrder() {
    $pdo = getDB();
    ensureAdminFoodOrderTables($pdo);
    $order = fetchAdminFoodOrder($pdo, (int)($_GET['id'] ?? 0));
    if (!$order) jsonResponse(404, 'Заказ не найден');
    jsonResponse(0, 'Success', $order);
}

function handleUpdateFoodOrderStatus() {
    $body = getJSONBody();
    $id = (int)($body['id'] ?? 0);
    $status = $body['status'] ?? '';
    if (!in_array($status, ['new','awaiting_pickup','delivering','completed','cancelled'], true)) {
        jsonResponse(413, 'Некорректный статус');
    }
    $pdo = getDB();
    ensureAdminFoodOrderTables($pdo);
    $completed = $status === 'completed' ? ', completed_at = NOW()' : '';
    $stmt = $pdo->prepare("UPDATE food_orders SET status = ? $completed WHERE id = ?");
    $stmt->execute([$status, $id]);
    jsonResponse(0, 'Status updated', fetchAdminFoodOrder($pdo, $id));
}

function handleVerifyFoodOrderCode() {
    $body = getJSONBody();
    $id = (int)($body['id'] ?? 0);
    $code = trim($body['code'] ?? '');
    $pdo = getDB();
    ensureAdminFoodOrderTables($pdo);
    $stmt = $pdo->prepare("SELECT id FROM food_orders WHERE id = ? AND (confirmation_code = ? OR qr_token = ?) LIMIT 1");
    $stmt->execute([$id, $code, $code]);
    if (!$stmt->fetch()) jsonResponse(1, 'Код не совпал');
    $stmt = $pdo->prepare("UPDATE food_orders SET verified_at = NOW() WHERE id = ?");
    $stmt->execute([$id]);
    jsonResponse(0, 'Код подтвержден', fetchAdminFoodOrder($pdo, $id));
}

function handleCompleteFoodOrder() {
    $body = getJSONBody();
    $id = (int)($body['id'] ?? 0);
    $pdo = getDB();
    ensureAdminFoodOrderTables($pdo);
    $order = fetchAdminFoodOrder($pdo, $id);
    if (!$order) jsonResponse(404, 'Заказ не найден');
    if ($order['fulfillment_type'] !== 'delivery' && empty($order['verified_at'])) {
        jsonResponse(1, 'Сначала подтвердите код или QR');
    }
    $stmt = $pdo->prepare("UPDATE food_orders SET status = 'completed', payment_status = IF(payment_status = 'pay_on_pickup', 'paid', payment_status), completed_at = NOW() WHERE id = ?");
    $stmt->execute([$id]);
    jsonResponse(0, 'Order completed', fetchAdminFoodOrder($pdo, $id));
}

function handleCancelFoodOrder() {
    $body = getJSONBody();
    $id = (int)($body['id'] ?? 0);
    $pdo = getDB();
    ensureAdminFoodOrderTables($pdo);
    $stmt = $pdo->prepare("UPDATE food_orders SET status = 'cancelled', admin_note = ? WHERE id = ?");
    $stmt->execute([trim($body['note'] ?? ''), $id]);
    jsonResponse(0, 'Order cancelled', fetchAdminFoodOrder($pdo, $id));
}

function fetchAdminFoodOrder(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare("SELECT * FROM food_orders WHERE id = ? LIMIT 1");
    $stmt->execute([$id]);
    $order = $stmt->fetch();
    if (!$order) return null;
    $stmt = $pdo->prepare("SELECT * FROM food_order_items WHERE order_id = ? ORDER BY id");
    $stmt->execute([$id]);
    $order['items'] = $stmt->fetchAll();
    return $order;
}

function ensureAdminFoodOrderTables(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS food_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_login VARCHAR(100) NOT NULL,
        member_id VARCHAR(64) NULL,
        cafe_id VARCHAR(64) NULL,
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $stmt = $pdo->query("SHOW COLUMNS FROM food_orders LIKE 'verified_at'");
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE food_orders ADD COLUMN verified_at DATETIME NULL AFTER admin_note");
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS food_order_items (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}
