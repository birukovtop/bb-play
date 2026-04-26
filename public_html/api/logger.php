<?php
/**
 * BlackBears Play — Логирование
 */

if (!defined('LOG_FILE')) {
    $logBase = defined('STORAGE_PATH') ? STORAGE_PATH . '/logs' : __DIR__ . '/../logs';
    define('LOG_FILE', $logBase . '/app.log');
}
define('LOG_ENABLED', true);

// Поля которые НИКОГДА не должны попадать в лог
define('SENSITIVE_FIELDS', ['password', 'passwd', 'pass', 'token', 'secret', 'api_key', 'apikey']);

/**
 * Удалить чувствительные данные из массива перед логированием
 */
function sanitizeForLog(array $data): array {
    $sanitized = [];
    foreach ($data as $key => $value) {
        if (in_array(strtolower($key), SENSITIVE_FIELDS, true)) {
            $sanitized[$key] = '***REDACTED***';
        } elseif (is_array($value)) {
            $sanitized[$key] = sanitizeForLog($value);
        } else {
            $sanitized[$key] = $value;
        }
    }
    return $sanitized;
}

/**
 * Записать в лог
 */
function logMsg(string $level, string $message, array $context = []): void {
    if (!LOG_ENABLED) return;

    $dir = dirname(LOG_FILE);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    $context = sanitizeForLog($context);
    $timestamp = date('Y-m-d H:i:s');
    $contextStr = !empty($context) ? ' ' . json_encode($context, JSON_UNESCAPED_UNICODE) : '';
    $line = "[$timestamp] [$level] $message$contextStr" . PHP_EOL;

    file_put_contents(LOG_FILE, $line, FILE_APPEND | LOCK_EX);
}

/**
 * Лог запроса
 */
function logRequest(string $action, array $data = []): void {
    logMsg('INFO', "REQUEST: $action", $data);
}

/**
 * Лог ответа
 */
function logResponse(int $code, string $message): void {
    logMsg('INFO', "RESPONSE: [$code] $message");
}

/**
 * Лог ошибки
 */
function logError(string $message, Throwable $e = null): void {
    $trace = $e ? $e->getMessage() : '';
    logMsg('ERROR', $message, ['exception' => $trace]);
}

/**
 * Лог SQL
 */
function logSQL(string $sql, array $params = []): void {
    logMsg('SQL', $sql, $params);
}
