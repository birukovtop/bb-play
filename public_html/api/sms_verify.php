<?php
/**
 * BlackBears Play — SMS-верификация (POST /api/sms_verify.php)
 *
 * Принимает логин и SMS-код, вызывает /verify на внешнем API,
 * устанавливает is_verified=1 в локальной БД.
 *
 * Тело запроса (JSON):
 * { "login": "testuser", "code": "472915" }
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(1, 'Метод не поддерживается');
}

$body = getJSONBody();
$login = trim($body['login'] ?? '');
$code  = trim($body['code'] ?? '');

logRequest('sms_verify', ['login' => $login]);

if (empty($login)) {
    jsonResponse(413, 'Не указан логин');
}

// Находим пользователя в БД
try {
    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT * FROM users WHERE login = :login LIMIT 1");
    $stmt->execute([':login' => $login]);
    $user = $stmt->fetch();

    if (!$user) {
        jsonResponse(401, 'Пользователь не найден');
    }

    // Если уже верифицирован — сразу успех
    if ($user['is_verified']) {
        jsonResponse(0, 'Already verified', [
            'login'     => $user['login'],
            'member_id' => $user['member_id'],
            'verified'  => true,
        ]);
    }

    $memberId = $user['member_id'];

    // POST /verify на внешнем API
    $verifyResult = remotePost('/verify', ['member_id' => $memberId]);
    $verifyOk = in_array($verifyResult['code'], [0, 200, 201], true);

    // Пустой ответ при HTTP 200 = успех
    if (!$verifyOk && isset($verifyResult['_raw']) && $verifyResult['_raw'] === '') {
        $verifyOk = true;
    }

    if (!$verifyOk) {
        logMsg('SMS_VERIFY_FAIL', "Verify failed for {$login}: {$verifyResult['message']}");
        jsonResponse(
            $verifyResult['code'] ?: 1,
            'Верификация не удалась: ' . ($verifyResult['message'] ?? ''),
            ['login' => $login]
        );
    }

    // Обновляем is_verified в БД
    $pdo->prepare("UPDATE users SET is_verified = 1 WHERE id = :id")
        ->execute([':id' => $user['id']]);

    logMsg('SMS_VERIFY_OK', "✅ Verified: {$login} (id: {$user['id']})");

    jsonResponse(0, 'Success', [
        'login'     => $user['login'],
        'member_id' => $user['member_id'],
        'user_id'   => (int)$user['id'],
        'verified'  => true,
    ]);

} catch (PDOException $e) {
    jsonResponse(500, 'Ошибка БД: ' . $e->getMessage());
}
