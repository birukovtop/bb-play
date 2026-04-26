<?php
/**
 * BlackBears Play — API приглашений
 *
 * POST   ?action=create       — Создать приглашение (ссылка + токен)
 * GET    ?action=validate&token=xxx  — Проверить токен приглашения
 * POST   ?action=register     — Регистрация по приглашению
 * GET    ?action=list&login=xxx      — Список активных приглашений
 * POST   ?action=guest_create — Создать гостевой аккаунт для друга
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {
    case 'create':
        handleCreate();
        break;
    case 'validate':
        handleValidate();
        break;
    case 'register':
        handleRegister();
        break;
    case 'list':
        handleList();
        break;
    case 'guest_create':
        handleGuestCreate();
        break;
    default:
        jsonResponse(1, 'Unknown action. Allowed: create, validate, register, list, guest_create');
}

// ============================================
// Создать приглашение
// ============================================
function handleCreate() {
    $body = getJSONBody();
    $login = trim($body['login'] ?? '');

    if (empty($login)) jsonResponse(413, 'Empty login');

    try {
        $pdo = getDB();

        $userStmt = $pdo->prepare("SELECT id FROM users WHERE login = :login LIMIT 1");
        $userStmt->execute([':login' => $login]);
        $user = $userStmt->fetch();
        if (!$user) jsonResponse(1, 'Пользователь не найден');

        // Генерируем токен
        $token = bin2hex(random_bytes(16)); // 32 символа
        $expiresAt = date('Y-m-d H:i:s', strtotime('+7 days'));

        $stmt = $pdo->prepare("
            INSERT INTO invitations (sender_id, token, expires_at)
            VALUES (:sender_id, :token, :expires_at)
        ");
        $stmt->execute([
            ':sender_id' => $user['id'],
            ':token'     => $token,
            ':expires_at' => $expiresAt,
        ]);

        $inviteUrl = getBaseUrl() . '/invite.html?token=' . $token;

        jsonResponse(0, 'Success', [
            'token'       => $token,
            'invite_url'  => $inviteUrl,
            'expires_at'  => $expiresAt,
        ]);
    } catch (PDOException $e) {
        jsonResponse(1, 'Ошибка: ' . $e->getMessage());
    }
}

// ============================================
// Проверить токен приглашения
// ============================================
function handleValidate() {
    $token = trim($_GET['token'] ?? '');
    if (empty($token)) jsonResponse(413, 'Empty token');

    try {
        $pdo = getDB();

        $stmt = $pdo->prepare("
            SELECT i.*, u.login as sender_login, u.name as sender_name
            FROM invitations i
            JOIN users u ON i.sender_id = u.id
            WHERE i.token = :token
            LIMIT 1
        ");
        $stmt->execute([':token' => $token]);
        $invite = $stmt->fetch();

        if (!$invite) {
            jsonResponse(1, 'Приглашение не найдено');
        }

        if ($invite['used_at']) {
            jsonResponse(1, 'Приглашение уже использовано');
        }

        if (strtotime($invite['expires_at']) < time()) {
            jsonResponse(1, 'Приглашение истекло');
        }

        jsonResponse(0, 'Success', [
            'sender_login' => $invite['sender_login'],
            'sender_name'  => $invite['sender_name'] ?? $invite['sender_login'],
            'expires_at'   => $invite['expires_at'],
            'token'        => $invite['token'],
        ]);
    } catch (PDOException $e) {
        jsonResponse(1, 'Ошибка: ' . $e->getMessage());
    }
}

// ============================================
// Регистрация по приглашению
// ============================================
function handleRegister() {
    $body = getJSONBody();
    $token    = trim($body['token'] ?? '');
    $login    = trim($body['login'] ?? '');
    $password = $body['password'] ?? '';
    $phone    = trim($body['phone'] ?? '');
    $email    = trim($body['email'] ?? '');
    $name     = trim($body['name'] ?? '');

    if (empty($token)) jsonResponse(413, 'Empty token');
    if (empty($login) || strlen($login) < 2) jsonResponse(414, 'Логин минимум 2 символа');
    if (empty($password) || strlen($password) < 6) jsonResponse(415, 'Пароль минимум 6 символов');
    if (empty($phone) || !isValidPhone($phone)) jsonResponse(451, 'Некорректный телефон');
    if (empty($email) || !isValidEmail($email)) jsonResponse(452, 'Некорректный email');

    try {
        $pdo = getDB();

        // Проверяем токен
        $invStmt = $pdo->prepare("
            SELECT * FROM invitations WHERE token = :token AND used_at IS NULL AND expires_at > NOW() LIMIT 1
        ");
        $invStmt->execute([':token' => $token]);
        $invite = $invStmt->fetch();

        if (!$invite) {
            jsonResponse(1, 'Приглашение недействительно');
        }

        // Проверяем логин
        $checkLogin = $pdo->prepare("SELECT id FROM users WHERE login = :login LIMIT 1");
        $checkLogin->execute([':login' => $login]);
        if ($checkLogin->fetch()) {
            jsonResponse(1, 'Этот логин уже занят');
        }

        // ============================================================
        // Регистрируем во внешнем API (пробуем 3 клуба)
        // ============================================================
        $allCafes = ['87375', '74922', '76301'];
        $memberId = null;
        $icafeSuccess = false;
        $registeredCafeId = '87375';

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
                logMsg('INVITE_REGISTER', "Внешний API OK (cafe: {$icafeId}): {$login} (member_id: {$memberId})");
                break;
            } else {
                logMsg('INVITE_REGISTER_WARN', "Внешний API failed (cafe: {$icafeId}): {$registerResult['message']}");
            }
        }

        if ($memberId === null) {
            $memberId = generateMemberId($login);
            logMsg('INVITE_REGISTER_WARN', "All clubs failed, fallback member_id: {$memberId}");
        }

        $passwordHash = password_hash($password, PASSWORD_BCRYPT);

        // Создаём пользователя в локальной БД
        $stmt = $pdo->prepare("
            INSERT INTO users (login, password, name, phone, email, member_id, icafe_id, balance, discount, invited_by, is_verified)
            VALUES (:login, :password, :name, :phone, :email, :member_id, :icafe_id, 0.00, 0.15, :invited_by, 0)
        ");
        $stmt->execute([
            ':login'     => $login,
            ':password'  => $passwordHash,
            ':name'      => $name ?: $login,
            ':phone'     => $phone,
            ':email'     => $email,
            ':member_id' => $memberId,
            ':icafe_id'  => $registeredCafeId,
            ':invited_by' => $invite['sender_id'],
        ]);

        $newUserId = (int)$pdo->lastInsertId();

        // Отмечаем приглашение использованным
        $pdo->prepare("UPDATE invitations SET used_at = NOW(), used_by_user_id = :uid WHERE token = :token")
            ->execute([':uid' => $newUserId, ':token' => $token]);

        // Автоматически добавляем в друзья (accepted)
        $pdo->prepare("
            INSERT IGNORE INTO friendships (user_id, friend_id, status)
            VALUES (:sender_id, :new_uid, 'accepted')
        ")->execute([':sender_id' => $invite['sender_id'], ':new_uid' => $newUserId]);

        // Начисляем бонус 50₽ через внешний API
        $topupResult = remotePost('/api/v2/cafe/' . $registeredCafeId . '/members/action/topup', [
            'topup_ids' => $memberId,
            'topup_value' => 50.00,
        ]);

        $bonusApplied = in_array($topupResult['code'] ?? -1, [0, 200, 201], true);
        if (!$bonusApplied) {
            logMsg('INVITE_BONUS_WARN', "Bonus topup failed for {$login} (member_id: {$memberId}): " . json_encode($topupResult));
        }

        // Получаем данные нового пользователя
        $userStmt = $pdo->prepare("SELECT * FROM users WHERE id = :id LIMIT 1");
        $userStmt->execute([':id' => $newUserId]);
        $user = $userStmt->fetch();

        jsonResponse(0, 'Success', [
            'user_id'   => (int)$user['id'],
            'login'     => $user['login'],
            'member_id' => $user['member_id'],
            'icafe_id'  => $user['icafe_id'],
            'balance'   => (float)$user['balance'],
            'name'      => $user['name'],
            'phone'     => $user['phone'],
            'email'     => $user['email'],
            'discount'  => (float)$user['discount'],
            'invited_by_login' => $invite['sender_login'],
            'bonus'     => 50,
            'bonus_applied' => $bonusApplied,
            'icafe_registered' => $icafeSuccess,
            'needs_verify' => true,
        ]);
    } catch (PDOException $e) {
        jsonResponse(1, 'Ошибка: ' . $e->getMessage());
    }
}

// ============================================
// Список активных приглашений
// ============================================
function handleList() {
    $login = trim($_GET['login'] ?? '');
    if (empty($login)) jsonResponse(413, 'Empty login');

    try {
        $pdo = getDB();
        $stmt = $pdo->prepare("
            SELECT token, expires_at, used_at, friend_login, created_at
            FROM invitations
            WHERE sender_id = (SELECT id FROM users WHERE login = :login)
              AND expires_at > NOW()
            ORDER BY created_at DESC
        ");
        $stmt->execute([':login' => $login]);
        $invites = $stmt->fetchAll();

        // Формируем URL для каждого
        $baseUrl = getBaseUrl();
        foreach ($invites as &$inv) {
            $inv['invite_url'] = $baseUrl . '/invite.html?token=' . $inv['token'];
            $inv['is_used'] = (bool)$inv['used_at'];
            $inv['is_expired'] = strtotime($inv['expires_at']) < time();
        }

        jsonResponse(0, 'Success', $invites);
    } catch (PDOException $e) {
        jsonResponse(1, 'Ошибка: ' . $e->getMessage());
    }
}

// ============================================
// Создать гостевой аккаунт для друга
// ============================================
function handleGuestCreate() {
    $body = getJSONBody();
    $login = trim($body['login'] ?? '');          // Кто создаёт
    $guestLogin = trim($body['guest_login'] ?? ''); // Логин гостя
    $guestName = trim($body['guest_name'] ?? '');
    $guestPhone = trim($body['guest_phone'] ?? '');
    $guestEmail = trim($body['guest_email'] ?? '');
    $guestPassword = (string)($body['guest_password'] ?? '');

    if (empty($login) || empty($guestLogin)) {
        jsonResponse(413, 'Empty login or guest_login');
    }

    if (strlen($guestLogin) < 2) {
        jsonResponse(454, 'Логин гостя минимум 2 символа');
    }
    if (empty($guestName)) {
        jsonResponse(455, 'Укажи имя друга');
    }
    if (empty($guestPhone) || !isValidPhone($guestPhone)) {
        jsonResponse(451, 'Некорректный телефон');
    }
    if (empty($guestEmail) || !isValidEmail($guestEmail)) {
        jsonResponse(452, 'Некорректный email');
    }
    if (strlen($guestPassword) < 6) {
        jsonResponse(415, 'Пароль минимум 6 символов');
    }
    try {
        $pdo = getDB();
        $pdo->beginTransaction();

        // Находим создателя
        $userStmt = $pdo->prepare("SELECT id FROM users WHERE login = :login LIMIT 1");
        $userStmt->execute([':login' => $login]);
        $user = $userStmt->fetch();
        if (!$user) {
            $pdo->rollBack();
            jsonResponse(1, 'Пользователь не найден');
        }

        // Проверяем что логин гостя свободен
        $checkStmt = $pdo->prepare("SELECT id FROM users WHERE login = :login LIMIT 1");
        $checkStmt->execute([':login' => $guestLogin]);
        if ($checkStmt->fetch()) {
            $pdo->rollBack();
            jsonResponse(1, 'Этот позывной уже занят');
        }

        // Сначала создаём гостя во внешней системе. Пока это не подтверждено,
        // локальную запись не сохраняем.
        $guestPhoneNormalized = preg_replace('/\D+/', '', $guestPhone);

        $remoteCreate = remotePost('/api/v2/cafe/' . ICAFE_CLUB_ID . '/members', [
            'member_account'    => $guestLogin,
            'member_first_name' => $guestName,
            'member_phone'      => $guestPhoneNormalized ?: '',
            'member_email'      => $guestEmail,
            'member_password'   => $guestPassword,
        ]);

        $remoteCode = intval($remoteCreate['code'] ?? 1);
        $remoteMessage = trim((string)($remoteCreate['message'] ?? ''));
        $remoteCreated = in_array($remoteCode, [0, 200, 201], true)
            || stripos($remoteMessage, 'exists') !== false
            || stripos($remoteMessage, 'already') !== false;

        if (!$remoteCreated) {
            $pdo->rollBack();
            jsonResponse(1, $remoteMessage !== '' ? $remoteMessage : 'Не удалось создать гостевой аккаунт во внешней системе');
        }

        $memberId = (string)($remoteCreate['data']['member_id'] ?? '');
        $remoteAccount = trim((string)($remoteCreate['data']['member_account'] ?? $guestLogin));

        if ($memberId === '') {
            $membersResult = remoteGet('/api/v2/cafe/' . ICAFE_CLUB_ID . '/members', [
                'sort_name' => 'created_at',
                'sort' => 'desc',
            ]);
            $members = $membersResult['data']['members'] ?? [];
            if (is_array($members)) {
                foreach ($members as $member) {
                    $account = trim((string)($member['member_account'] ?? ''));
                    if (mb_strtolower($account) === mb_strtolower($guestLogin)) {
                        $memberId = (string)($member['member_id'] ?? '');
                        $remoteAccount = $account ?: $remoteAccount;
                        break;
                    }
                }
            }
        }

        if ($memberId === '') {
            $pdo->rollBack();
            jsonResponse(1, 'Гость создан во внешней системе, но не удалось подтвердить его member_id');
        }

        $passwordHash = password_hash($guestPassword, PASSWORD_BCRYPT);

        // Создаём локальную запись только после подтверждённого внешнего успеха.
        $stmt = $pdo->prepare("
            INSERT INTO users (login, password, name, phone, member_id, icafe_id, balance, discount, is_guest, invited_by, guest_registered)
            VALUES (:login, :password, :name, :phone, :member_id, '87375', 0.00, 0.15, 1, :invited_by, 0)
        ");
        $stmt->execute([
            ':login'     => $guestLogin,
            ':password'  => $passwordHash,
            ':name'      => $guestName,
            ':phone'     => $guestPhone,
            ':member_id' => $memberId,
            ':invited_by' => $user['id'],
        ]);

        $guestId = (int)$pdo->lastInsertId();

        // Автоматически в друзья (accepted)
        $pdo->prepare("
            INSERT IGNORE INTO friendships (user_id, friend_id, status)
            VALUES (:uid, :gid, 'accepted')
        ")->execute([':uid' => $user['id'], ':gid' => $guestId]);

        $pdo->commit();

        jsonResponse(0, 'Success', [
            'login'     => $guestLogin,
            'name'      => $guestName,
            'member_id' => $memberId,
            'balance'   => 0.00,
            'is_guest'  => true,
            'remote_account' => $remoteAccount,
            'remote_confirmed' => true,
        ]);
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        jsonResponse(1, 'Ошибка: ' . $e->getMessage());
    }
}

// ============================================
// Вспомогательная: базовый URL приложения
// ============================================
function getBaseUrl(): string {
    if (defined('APP_HOST')) {
        return rtrim(APP_HOST, '/');
    }
    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'];
    return $protocol . '://' . $host;
}
