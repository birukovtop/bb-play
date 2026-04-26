<?php
/**
 * BlackBears Play — Авторизация (POST /api/login.php)
 *
 * Флоу авторизации через внешний API vibe.blackbearsplay.ru:
 *
 * Способ 1: POST /login {member_name, password} → member_id + private_key
 * Способ 2 (fallback): Поиск через /members → member_id
 *
 * После получения member_id:
 * 1. POST /request-sms {member_id} → SMS на телефон
 * 2. POST /verify {member_id} → подтверждение входа (SMS-верификация)
 * 3. Сохранение в локальную БД
 * 4. Установка сессии
 *
 * Тело запроса (JSON):
 * { "login": "test1", "password": "test1" }
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(1, 'Метод не поддерживается');
}

$body = getJSONBody();
$action = $body['action'] ?? '';

function findRemoteMemberByLogin(string $login, ?string $preferredCafeId = null): ?array {
    $cafeIds = [];

    if (!empty($preferredCafeId)) {
        $cafeIds[] = strval($preferredCafeId);
    }

    foreach (['87375', '74922', '76301'] as $fallbackCafeId) {
        if (!in_array($fallbackCafeId, $cafeIds, true)) {
            $cafeIds[] = $fallbackCafeId;
        }
    }

    foreach ($cafeIds as $cafeId) {
        $membersResult = remoteGet('/api/v2/cafe/' . $cafeId . '/members');
        if (!in_array($membersResult['code'] ?? 1, [0, 200, 201], true) || empty($membersResult['data']['members'])) {
            continue;
        }

        foreach ($membersResult['data']['members'] as $member) {
            if (strtolower($member['member_account'] ?? '') === strtolower($login)) {
                return [
                    'cafe_id' => $cafeId,
                    'member' => $member,
                ];
            }
        }
    }

    return null;
}

// Действие: получить бонус баланс
if ($action === 'get_bonus') {
    $login = trim($body['login'] ?? '');
    if (empty($login)) {
        jsonResponse(413, 'Empty login');
    }

    try {
        $pdo = getDB();
        $stmt = $pdo->prepare("SELECT icafe_id, member_id FROM users WHERE login = :login LIMIT 1");
        $stmt->execute([':login' => $login]);
        $user = $stmt->fetch();

        if ($user) {
            $cafeId = $user['icafe_id'] ?: '87375';
            $membersResult = remoteGet('/api/v2/cafe/' . $cafeId . '/members');

            if (in_array($membersResult['code'], [0, 200, 201], true) && !empty($membersResult['data']['members'])) {
                foreach ($membersResult['data']['members'] as $m) {
                    if (strtolower($m['member_account'] ?? '') === strtolower($login)) {
                        jsonResponse(0, 'Success', [
                            'balance' => floatval($m['member_balance'] ?? 0),
                            'bonus_balance' => floatval($m['member_balance_bonus'] ?? 0),
                            'points' => floatval($m['member_points'] ?? 0),
                            'discount' => floatval($m['member_discount'] ?? 0),
                        ]);
                    }
                }
            }
        }
    } catch (PDOException $e) {
        // ignore
    }

    jsonResponse(1, 'User not found');
}

// Действие: получить полный профиль из vibe
if ($action === 'get_vibe_profile') {
    $login = trim($body['login'] ?? '');
    if (empty($login)) {
        jsonResponse(413, 'Empty login');
    }

    $preferredCafeId = null;

    try {
        $pdo = getDB();
        $stmt = $pdo->prepare("SELECT icafe_id, member_id FROM users WHERE login = :login LIMIT 1");
        $stmt->execute([':login' => $login]);
        $user = $stmt->fetch();

        if ($user) {
            $preferredCafeId = $user['icafe_id'] ?: '87375';
        }
    } catch (PDOException $e) {
        $preferredCafeId = null;
    }

    $remoteUser = findRemoteMemberByLogin($login, $preferredCafeId);
    if ($remoteUser) {
        $member = $remoteUser['member'];
        jsonResponse(0, 'Success', [
            'balance' => floatval($member['member_balance'] ?? 0),
            'bonus_balance' => floatval($member['member_balance_bonus'] ?? 0),
            'points' => floatval($member['member_points'] ?? 0),
            'discount' => floatval($member['member_discount'] ?? 0),
        ]);
    }

    jsonResponse(1, 'User not found');
}

$login    = trim($body['login'] ?? '');
$password = $body['password'] ?? '';

logRequest('login', ['login' => $login]);

if (empty($login)) {
    jsonResponse(413, 'Укажи позывной, воин!');
}

if (empty($password)) {
    jsonResponse(414, 'Укажи пароль!');
}

$localAuthUser = null;
$localPasswordOk = false;
try {
    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT id, password, is_verified FROM users WHERE login = :login LIMIT 1");
    $stmt->execute([':login' => $login]);
    $localAuthUser = $stmt->fetch() ?: null;
    if ($localAuthUser && password_verify($password, $localAuthUser['password'])) {
        $localPasswordOk = true;
    }
} catch (PDOException $e) {
    $localAuthUser = null;
}

$memberData = [];
$memberId   = null;
$privateKey = '';
$icafeId    = '87375';
$loginMethod = '';

// ============================================================
// 1. Попытка: POST /login {member_name, password}
// ============================================================
$loginResult = remotePost('/login', [
    'member_name' => $login,
    'password'    => $password,
]);

logMsg('LOGIN', "POST /login response: code={$loginResult['code']}, msg={$loginResult['message']}");

if ($loginResult['code'] === 3 && !empty($loginResult['member'])) {
    // Успех через /login
    $memberData = $loginResult['member'];
    $memberId   = strval($memberData['member_id'] ?? '');
    $privateKey = $loginResult['private_key'] ?? '';
    $loginMethod = '/login';
    logMsg('LOGIN', "✅ POST /login OK: {$login}, member_id: {$memberId}");
}

// ============================================================
// 2. Fallback: поиск через /members
// Разрешаем только если пароль совпал с локальным хешем. Иначе внешний
// ответ "Password or login is incorrect" превращался в вход без пароля.
// ============================================================
if (empty($memberId) && $localPasswordOk) {
    logMsg('LOGIN', "POST /login failed, trying /members fallback...");

    foreach (['87375', '74922', '76301'] as $cafeId) {
        $membersResult = remoteGet('/api/v2/cafe/' . $cafeId . '/members');

        if (in_array($membersResult['code'], [0, 200, 201], true) && !empty($membersResult['data']['members'])) {
            foreach ($membersResult['data']['members'] as $m) {
                // Ищем по логину
                if (strtolower($m['member_account'] ?? '') === strtolower($login)) {
                    $memberData = $m;
                    $memberId   = strval($m['member_id']);
                    $icafeId    = $cafeId;
                    $loginMethod = '/members_fallback';
                    logMsg('LOGIN', "✅ Found via /members: {$login}, member_id: {$memberId} (cafe: {$cafeId})");
                    break 2;
                }
            }
        }
    }
} elseif (empty($memberId)) {
    logMsg('LOGIN_FAIL', "Remote login failed and local password did not match: {$login}");
}

if (empty($memberId)) {
    logMsg('LOGIN_FAIL', "User not found: {$login}");
    jsonResponse(401, 'Неверный позывной или пароль!');
}

// ============================================================
// 3. Проверяем is_verified в локальной БД
// ============================================================
$isVerified = false;
$userId = 0;

try {
    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT id, is_verified FROM users WHERE login = :login LIMIT 1");
    $stmt->execute([':login' => $login]);
    $row = $stmt->fetch();
    if ($row) {
        $isVerified = (bool)$row['is_verified'];
        $userId = (int)$row['id'];
    }
} catch (PDOException $e) {
    // Если БД недоступна — считаем что не верифицирован
}

$smsSent = false;
$needsVerify = false;

// Если уже верифицирован — пробуем проверить что учётка всё ещё работает
if ($isVerified) {
    logMsg('LOGIN', "User is_verified=1, checking if account still valid: {$login}");
    
    // Проверяем что пользователь существует во внешнем API
    $accountValid = false;
    foreach (['87375', '74922', '76301'] as $checkCafeId) {
        $checkResult = remoteGet('/api/v2/cafe/' . $checkCafeId . '/members');
        if (in_array($checkResult['code'], [0, 200, 201], true) && !empty($checkResult['data']['members'])) {
            foreach ($checkResult['data']['members'] as $m) {
                if (strtolower($m['member_account'] ?? '') === strtolower($login)) {
                    $accountValid = true;
                    $memberData = $m;
                    $memberId = strval($m['member_id']);
                    $icafeId = $checkCafeId;
                    logMsg('LOGIN', "✅ Account still valid in external API (cafe: {$checkCafeId})");
                    break 2;
                }
            }
        }
    }
    
    if (!$accountValid) {
        // Учётка не найдена — сбрасываем is_verified, запускаем SMS-флоу
        logMsg('LOGIN', "Account no longer valid, resetting is_verified: {$login}");
        try {
            $pdo = getDB();
            $pdo->prepare("UPDATE users SET is_verified = 0 WHERE id = :id")
                ->execute([':id' => $userId]);
        } catch (PDOException $e) { /* ignore */ }
        $isVerified = false;
        $needsVerify = true;
    }
}

// Если не верифицирован — запускаем SMS-флоу
if (!$isVerified && $memberId) {
    // POST /request-sms
    $smsResult = remotePost('/request-sms', ['member_id' => $memberId]);
    $smsSent = in_array($smsResult['code'], [0, 200, 201], true);
    $needsVerify = true;
    logMsg('LOGIN', "request-sms: code={$smsResult['code']}, sent=" . ($smsSent ? 'yes' : 'no') . ", needs_verify=yes");
}

// ============================================================
// 4. Извлекаем данные пользователя
// ============================================================
$name     = $memberData['member_first_name'] ?? $login;
$phone    = $memberData['member_phone'] ?? '';
$email    = $memberData['member_email'] ?? '';
$balance  = floatval($memberData['member_balance'] ?? 0);
$discount = floatval($memberData['member_discount'] ?? 0.15);
$icafeId  = $memberData['member_icafe_id'] ?? $icafeId;

// ============================================================
// 5. Синхронизация с локальной БД
// ============================================================
$userId = 0;

try {
    $pdo = getDB();

    // Проверяем, есть ли уже пользователь с таким login
    $stmt = $pdo->prepare("SELECT id FROM users WHERE login = :login LIMIT 1");
    $stmt->execute([':login' => $login]);
    $existingUser = $stmt->fetch();

    if ($existingUser) {
        // Обновляем данные
        $userId = (int)$existingUser['id'];

        $pdo->prepare("
            UPDATE users SET
                password  = :password,
                member_id = :member_id,
                icafe_id  = :icafe_id,
                name      = :name,
                phone     = :phone,
                email     = :email,
                balance   = :balance,
                discount  = :discount
            WHERE id = :id
        ")->execute([
            ':password'  => password_hash($password, PASSWORD_BCRYPT),
            ':member_id' => $memberId,
            ':icafe_id'  => $icafeId,
            ':name'      => $name,
            ':phone'     => $phone,
            ':email'     => $email,
            ':balance'   => $balance,
            ':discount'  => $discount,
            ':id'        => $userId,
        ]);

        logMsg('LOGIN', "Local DB updated: {$login} (id: {$userId})");

    } else {
        // Создаём нового пользователя
        $pdo->prepare("
            INSERT INTO users (login, password, name, phone, email, member_id, icafe_id, balance, discount)
            VALUES (:login, :password, :name, :phone, :email, :member_id, :icafe_id, :balance, :discount)
        ")->execute([
            ':login'     => $login,
            ':password'  => password_hash($password, PASSWORD_BCRYPT),
            ':name'      => $name,
            ':phone'     => $phone,
            ':email'     => $email,
            ':member_id' => $memberId,
            ':icafe_id'  => $icafeId,
            ':balance'   => $balance,
            ':discount'  => $discount,
        ]);

        $userId = (int)$pdo->lastInsertId();
        logMsg('LOGIN', "Local DB created: {$login} (id: {$userId})");
    }

} catch (PDOException $e) {
    logMsg('LOGIN_NO_DB', "User auth via external API only: {$login}");
}

// ============================================================
// 6. Устанавливаем сессию
// ============================================================
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
$_SESSION['user_id'] = $userId;
$_SESSION['login'] = $login;
@session_regenerate_id(true);

// ============================================================
// 7. Ответ
// ============================================================
$response = [
    'user_id'     => $userId,
    'login'       => $login,
    'member_id'   => $memberId,
    'icafe_id'    => $icafeId,
    'balance'     => $balance,
    'name'        => $name,
    'phone'       => $phone,
    'email'       => $email,
    'discount'    => $discount,
    'private_key' => $privateKey,
    'is_verified' => $isVerified,
    'needs_verify'=> $needsVerify,
    'sms_sent'    => $smsSent,
    'source'      => 'external_api',
    'login_method'=> $loginMethod,
];

logResponse(0, "Login OK: {$login} (member_id: {$memberId}, method: {$loginMethod})");
jsonResponse(0, 'Success', $response);
