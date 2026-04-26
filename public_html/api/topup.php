<?php
/**
 * BlackBears Play — Пополнение баланса (POST /api/topup.php)
 *
 * Демо-пополнение через локальную БД.
 *
 * Тело запроса (JSON):
 * { "login": "test1", "amount": 500, "payment_method": "card" }
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(1, 'Метод не поддерживается');
}

$body = getJSONBody();
$login  = trim($body['login'] ?? '');
$amount = floatval($body['amount'] ?? 0);
$paymentMethod = trim($body['payment_method'] ?? 'card');
$currentBalance = isset($body['current_balance']) ? floatval($body['current_balance']) : null;

logRequest('topup', $body);

if (empty($login)) {
    jsonResponse(413, 'Empty login');
}

if ($amount < 10) {
    jsonResponse(454, 'Минимальная сумма — 10');
}

if ($amount > 100000) {
    jsonResponse(454, 'Максимальная сумма — 100000');
}

try {
    $pdo = getDB();

    $stmt = $pdo->prepare("SELECT id, balance FROM users WHERE login = :login LIMIT 1");
    $stmt->execute([':login' => $login]);
    $user = $stmt->fetch();

    if (!$user) {
        jsonResponse(1, 'Пользователь не найден');
    }

    $methodLabels = [
        'card' => 'карта',
        'sbp' => 'СБП',
    ];
    $methodLabel = $methodLabels[$paymentMethod] ?? 'карта';

    $pdo->beginTransaction();

    $baseBalance = max(floatval($user['balance'] ?? 0), $currentBalance ?? 0);
    $newBalance = $baseBalance + $amount;
    $updateStmt = $pdo->prepare("UPDATE users SET balance = :balance WHERE id = :id");
    $updateStmt->execute([
        ':balance' => $newBalance,
        ':id' => intval($user['id']),
    ]);

    try {
        $historyStmt = $pdo->prepare("
            INSERT INTO balance_history (user_id, amount, type, description)
            VALUES (:user_id, :amount, 'topup', :description)
        ");
        $historyStmt->execute([
            ':user_id' => intval($user['id']),
            ':amount' => $amount,
            ':description' => 'Демо-пополнение: ' . $methodLabel,
        ]);
    } catch (Throwable $historyError) {
        logError('Topup history write failed', $historyError);
    }

    $pdo->commit();

    $response = [
        'balance' => $newBalance,
        'added' => $amount,
        'base_amount' => $amount,
        'bonus' => 0,
        'payment_method' => $paymentMethod,
        'simulated' => true,
    ];

    logResponse(0, "Topup simulated: {$login} +{$amount} via {$paymentMethod}, new balance: {$newBalance}");
    jsonResponse(0, 'Success', $response);

} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    logError('Topup error', $e);
    jsonResponse(1, 'Ошибка сервера: ' . $e->getMessage());
}
