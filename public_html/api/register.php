<?php
/**
 * BlackBears Play — Регистрация с SMS-верификацией (POST /api/register.php)
 *
 * Пошаговый режим:
 *   Step 1: { "step": "register", "login": "...", "password": "...", "phone": "...", "email": "...", "name": "..." }
 *   Step 2: { "step": "request_sms", "member_id": "..." }
 *   Step 3: { "step": "verify", "member_id": "..." }
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(1, 'Метод не поддерживается');
}

$body = getJSONBody();
$step = trim($body['step'] ?? '');

logRequest('register', ['step' => $step, 'login' => $body['login'] ?? '']);

// ============================================================
// Шаг 2: Запрос SMS
// ============================================================
if ($step === 'request_sms') {
    $memberId = trim($body['member_id'] ?? '');
    $phone    = trim($body['phone'] ?? '');

    if (empty($memberId)) {
        jsonResponse(413, 'Не указан member_id');
    }

    logMsg('REGISTER', "Request SMS: member_id={$memberId}, phone={$phone}");

    $smsBody = ['member_id' => $memberId];
    if (!empty($phone)) {
        $smsBody['phone'] = $phone;
    }

    $result = remotePost('/request-sms', $smsBody);

    if (in_array($result['code'], [0, 200, 201], true)) {
        jsonResponse(0, 'SMS sent', ['member_id' => $memberId]);
    } else {
        // Не блокируем — SMS может не отправиться, но верификация всё равно возможна
        logMsg('REGISTER_WARN', "SMS request: {$result['message']}");
        jsonResponse(0, 'SMS request completed', [
            'member_id' => $memberId,
            'message' => $result['message'] ?? '',
        ]);
    }
}

// ============================================================
// Шаг 3: Верификация SMS
// ============================================================
if ($step === 'verify') {
    $memberId = trim($body['member_id'] ?? '');

    if (empty($memberId)) {
        jsonResponse(413, 'Не указан member_id');
    }

    logMsg('REGISTER', "Verify: member_id={$memberId}");

    $verifyResult = remotePost('/verify', ['member_id' => $memberId]);

    if (!in_array($verifyResult['code'], [0, 200, 201], true)) {
        jsonResponse(
            $verifyResult['code'] ?: 1,
            'Верификация не удалась: ' . ($verifyResult['message'] ?? ''),
            ['member_id' => $memberId]
        );
    }

    logMsg('REGISTER', "✅ Verified: {$memberId}");

    // Обновляем статус в локальной БД
    try {
        $pdo = getDB();
        $pdo->prepare("UPDATE users SET is_verified = 1 WHERE member_id = :mid")
            ->execute([':mid' => $memberId]);

        $stmt = $pdo->prepare("SELECT id, login FROM users WHERE member_id = :mid LIMIT 1");
        $stmt->execute([':mid' => $memberId]);
        $user = $stmt->fetch();

        if ($user) {
            jsonResponse(0, 'Verified', [
                'user_id' => (int)$user['id'],
                'login' => $user['login'],
                'member_id' => $memberId,
                'verified' => true,
            ]);
        } else {
            jsonResponse(0, 'Verified (no local user)', [
                'member_id' => $memberId,
                'verified' => true,
            ]);
        }
    } catch (PDOException $e) {
        jsonResponse(0, 'Verified (DB unavailable)', [
            'member_id' => $memberId,
            'verified' => true,
        ]);
    }
}

// ============================================================
// Шаг 1: Создание аккаунта
// ============================================================
$login    = trim($body['login'] ?? '');
$password = $body['password'] ?? '';
$phone    = trim($body['phone'] ?? '');
$email    = trim($body['email'] ?? '');
$name     = trim($body['name'] ?? '');

// Валидация
if (empty($login) || strlen($login) < 2) {
    jsonResponse(413, 'Логин должен быть минимум 2 символа');
}
if (empty($password) || strlen($password) < 6) {
    jsonResponse(414, 'Пароль должен быть минимум 6 символов');
}
if (empty($phone) || !isValidPhone($phone)) {
    jsonResponse(451, 'Некорректный номер телефона');
}
if (empty($email) || !isValidEmail($email)) {
    jsonResponse(452, 'Некорректный email');
}

try {
    $pdo = getDB();
    $checkStmt = $pdo->prepare("SELECT id FROM users WHERE login = :login LIMIT 1");
    $checkStmt->execute([':login' => $login]);
    if ($checkStmt->fetch()) {
        jsonResponse(1, 'Этот логин уже занят');
    }
} catch (PDOException $e) {
    logMsg('REGISTER_WARN', "Local duplicate check skipped: {$e->getMessage()}");
}

// Все 3 клуба — пробуем каждый
$allCafes = ['87375', '74922', '76301'];
$memberId = null;
$icafeSuccess = false;
$registeredCafeId = null;

// Регистрация во внешнем API (пробуем все клубы)
foreach ($allCafes as $icafeId) {
    $registerResult = remotePost('/api/v2/cafe/' . $icafeId . '/members', [
        'member_account'    => $login,
        'member_first_name' => $name ?: $login,
        'member_phone'      => $phone,
        'member_email'      => $email,
        'member_password'   => $password,
    ]);

    $code = $registerResult['code'];
    if (in_array($code, [0, 200, 201, '200', '201'], true) ||
        stripos($registerResult['message'] ?? '', 'exists') !== false ||
        stripos($registerResult['message'] ?? '', 'verification') !== false) {
        $icafeSuccess = true;
        $memberId = $registerResult['data']['member_id'] ?? null;
        $registeredCafeId = $icafeId;
        logMsg('REGISTER', "Внешний API OK (cafe: {$icafeId}): {$login} (member_id: {$memberId})");
        break;
    } else {
        logMsg('REGISTER_WARN', "Внешний API failed (cafe: {$icafeId}): {$registerResult['message']}");
    }
}

// Fallback: если ни один клуб не отдал member_id — ищем по телефону
if ($memberId === null) {
    foreach ($allCafes as $cafeId) {
        $membersResult = remoteGet('/api/v2/cafe/' . $cafeId . '/members');
        if (in_array($membersResult['code'], [0, 200, 201], true) && !empty($membersResult['data']['members'])) {
            foreach ($membersResult['data']['members'] as $m) {
                if (($m['member_phone'] ?? '') === $phone || ($m['member_account'] ?? '') === $login) {
                    $memberId = strval($m['member_id']);
                    $registeredCafeId = $cafeId;
                    $icafeSuccess = true;
                    logMsg('REGISTER', "Found existing user by phone/account: {$memberId} (cafe: {$cafeId})");
                    break 2;
                }
            }
        }
    }
}

if ($memberId === null) {
    $memberId = generateMemberId($login);
    $registeredCafeId = '87375';
    logMsg('REGISTER_WARN', "All clubs failed, fallback member_id: {$memberId}");
} else {
    $icafeId = $registeredCafeId;
}

// Запись в локальную БД
$userId = 0;
$dbSuccess = false;

try {
    $pdo = getDB();

    $midCheck = $pdo->prepare("SELECT id FROM users WHERE member_id = :member_id LIMIT 1");
    $midCheck->execute([':member_id' => $memberId]);
    if ($midCheck->fetch()) {
        $memberId = generateMemberId($login . time());
    }

    $passwordHash = password_hash($password, PASSWORD_BCRYPT);

    $stmt = $pdo->prepare("
        INSERT INTO users (login, password, name, phone, email, member_id, icafe_id, discount, is_verified)
        VALUES (:login, :password, :name, :phone, :email, :member_id, :icafe_id, 0.15, 0)
    ");

    $stmt->execute([
        ':login'     => $login,
        ':password'  => $passwordHash,
        ':name'      => $name ?: $login,
        ':phone'     => $phone,
        ':email'     => $email,
        ':member_id' => $memberId,
        ':icafe_id'  => $icafeId,
    ]);

    $userId = (int)$pdo->lastInsertId();
    $dbSuccess = true;

    logMsg('REGISTER', "Local DB: {$login} (id: {$userId})");

} catch (PDOException $e) {
    logMsg('REGISTER_NO_DB', "External API only: {$login}");
}

// ============================================================
// Обработка приглашения — бонус 50₽ + дружба
// ============================================================
$inviteToken = trim($body['invite_token'] ?? '');
$inviteBonusApplied = false;
$inviteSenderLogin = null;

if (!empty($inviteToken) && $userId > 0 && $memberId) {
    try {
        $pdo = getDB();

        // Проверяем токен
        $invStmt = $pdo->prepare("
            SELECT * FROM invitations WHERE token = :token AND used_at IS NULL AND expires_at > NOW() LIMIT 1
        ");
        $invStmt->execute([':token' => $inviteToken]);
        $invite = $invStmt->fetch();

        if ($invite) {
            // Отмечаем приглашение использованным
            $pdo->prepare("UPDATE invitations SET used_at = NOW(), used_by_user_id = :uid WHERE token = :token")
                ->execute([':uid' => $userId, ':token' => $inviteToken]);

            // Автоматически добавляем в друзья (accepted)
            $pdo->prepare("
                INSERT IGNORE INTO friendships (user_id, friend_id, status)
                VALUES (:sender_id, :new_uid, 'accepted')
            ")->execute([':sender_id' => $invite['sender_id'], ':new_uid' => $userId]);

            // Обновляем invited_by в users
            $pdo->prepare("UPDATE users SET invited_by = :sender_id WHERE id = :uid")
                ->execute([':sender_id' => $invite['sender_id'], ':uid' => $userId]);

            // Получаем логин отправителя
            $senderStmt = $pdo->prepare("SELECT login FROM users WHERE id = :id LIMIT 1");
            $senderStmt->execute([':id' => $invite['sender_id']]);
            $sender = $senderStmt->fetch();
            $inviteSenderLogin = $sender['login'] ?? null;

            // Начисляем бонус 50₽ через внешний API
            $topupResult = remotePost('/api/v2/cafe/' . $icafeId . '/members/action/topup', [
                'topup_ids' => strval($memberId),
                'topup_value' => 50.00,
            ]);

            logMsg('INVITE_BONUS_DEBUG', "Topup result for {$login}: " . json_encode($topupResult));

            $inviteBonusApplied = in_array($topupResult['code'] ?? -1, [0, 200, 201], true);
            if ($inviteBonusApplied) {
                logMsg('INVITE_BONUS', "Bonus 50₽ applied for {$login} via invite from {$inviteSenderLogin}");
            } else {
                logMsg('INVITE_BONUS_WARN', "Bonus topup failed for {$login}: " . json_encode($topupResult));
            }
        }
    } catch (PDOException $e) {
        logMsg('INVITE_ERR', "Error processing invite: {$e->getMessage()}");
    }
}

// Ответ — фронтенд сам покажет SMS-модалку и вызовет request_sms → verify
$response = [
    'user_id'       => $userId,
    'login'         => $login,
    'member_id'     => $memberId,
    'icafe_id'      => $icafeId,
    'balance'       => 0,
    'name'          => $name ?: $login,
    'discount'      => 0.15,
    'icafe_registered' => $icafeSuccess,
    'db_registered'    => $dbSuccess,
    'sms_sent'      => false,
    'needs_verify'  => true,
    'source'        => $icafeSuccess ? 'external_api' : 'local',
    'invite_bonus'  => $inviteBonusApplied ? 50 : 0,
    'invite_sender' => $inviteSenderLogin,
];

logResponse(0, "Register step=register OK: {$login} (member_id: {$memberId})");
jsonResponse(0, 'Success', $response);
