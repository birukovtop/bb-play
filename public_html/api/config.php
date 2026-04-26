<?php
/**
 * BlackBears Play вЂ” РљРѕРЅС„РёРіСѓСЂР°С†РёСЏ Р±Р°Р·С‹ РґР°РЅРЅС‹С…
 */

// Р›РѕРєР°Р»СЊРЅС‹Р№ РєРѕРЅС„РёРі (РµСЃР»Рё СЃСѓС‰РµСЃС‚РІСѓРµС‚) вЂ” РїРµСЂРµРѕРїСЂРµРґРµР»СЏРµС‚ РєСЂРµРґС‹
$appConfigPath = dirname(__DIR__, 2) . '/config/app.php';
$hasAppConfig = false;
if (file_exists($appConfigPath)) {
    $appConfig = require $appConfigPath;
    if (is_array($appConfig)) {
        $dbConfig = $appConfig['db'] ?? [];
        if (!defined('DB_HOST')) define('DB_HOST', $dbConfig['host'] ?? '127.0.0.1');
        if (!defined('DB_PORT')) define('DB_PORT', (int)($dbConfig['port'] ?? 3308));
        if (!defined('DB_NAME')) define('DB_NAME', $dbConfig['name'] ?? 'swebrubir2');
        if (!defined('DB_USER')) define('DB_USER', $dbConfig['user'] ?? '');
        if (!defined('DB_PASS')) define('DB_PASS', $dbConfig['pass'] ?? '');
        if (!defined('DB_CHARSET')) define('DB_CHARSET', $dbConfig['charset'] ?? 'utf8mb4');
        if (!defined('APP_HOST')) define('APP_HOST', rtrim($appConfig['site_url'] ?? 'https://swebrubir2.temp.swtest.ru', '/'));
        if (!defined('REMOTE_API_BASE')) define('REMOTE_API_BASE', rtrim($appConfig['remote_api_base'] ?? 'https://vibe.blackbearsplay.ru', '/'));
        if (!defined('ALLOWED_ORIGIN')) define('ALLOWED_ORIGIN', $appConfig['allowed_origin'] ?? APP_HOST);
        if (!defined('APP_DISABLE_AUTO_MIGRATE')) define('APP_DISABLE_AUTO_MIGRATE', (bool)($appConfig['disable_auto_migrate'] ?? true));
        if (!defined('STORAGE_PATH')) define('STORAGE_PATH', $appConfig['storage_path'] ?? dirname(__DIR__, 2) . '/storage');
        $hasAppConfig = true;
    }
}

if (false && !$hasAppConfig && file_exists(__DIR__ . '/config.disabled.php')) {
    require_once __DIR__ . '/config.disabled.php';
}

// РџР°СЂР°РјРµС‚СЂС‹ Р‘Р”
if (!defined('DB_HOST')) define('DB_HOST', '127.0.0.1');
if (!defined('DB_PORT')) define('DB_PORT', 3308);
if (!defined('DB_NAME')) define('DB_NAME', 'swebrubir2');
// РљСЂРёС‚РёС‡РЅРѕ: РЅРµ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РґРµС„РѕР»С‚РЅС‹Рµ РєСЂРµРґС‹ РІ РїСЂРѕРґР°РєС€РµРЅРµ
if (!defined('DB_USER')) define('DB_USER', '');
if (!defined('DB_PASS')) define('DB_PASS', '');
if (!defined('DB_CHARSET')) define('DB_CHARSET', 'utf8mb4');

if (!defined('APP_DISABLE_AUTO_MIGRATE') || !APP_DISABLE_AUTO_MIGRATE) {
    require_once __DIR__ . '/auto_migrate.php';
}

// Р’РЅРµС€РЅРёР№ API РєР»СѓР±Р° (vibe.blackbearsplay.ru)
if (!defined('REMOTE_API_BASE')) define('REMOTE_API_BASE', 'https://vibe.blackbearsplay.ru');

// ID РєР»СѓР±Р° iCafeCloud (РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ)
if (!defined('ICAFE_CLUB_ID')) define('ICAFE_CLUB_ID', '87375');

// РҐРѕСЃС‚ РїСЂРёР»РѕР¶РµРЅРёСЏ (РґР»СЏ РіРµРЅРµСЂР°С†РёРё СЃСЃС‹Р»РѕРє)
if (!defined('APP_HOST')) define('APP_HOST', 'https://swebrubir2.temp.swtest.ru');

// CORS
if (!defined('ALLOWED_ORIGIN')) define('ALLOWED_ORIGIN', APP_HOST);

$allowedOrigin = ALLOWED_ORIGIN;
if ($allowedOrigin !== '*') {
    header('Access-Control-Allow-Origin: ' . $allowedOrigin);
} else {
    header('Access-Control-Allow-Origin: *');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept, Authorization');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=utf-8');

// Р—Р°РїСѓСЃРє СЃРµСЃСЃРёР№ РґР»СЏ Р°СѓС‚РµРЅС‚РёС„РёРєР°С†РёРё СЃ CSRF Р·Р°С‰РёС‚РѕР№
if (session_status() === PHP_SESSION_NONE) {
    // РЈСЃС‚Р°РЅР°РІР»РёРІР°РµРј SameSite cookie РґР»СЏ Р·Р°С‰РёС‚С‹ РѕС‚ CSRF
    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'domain' => '',
            'secure' => isset($_SERVER['HTTPS']),
            'httponly' => true,
            'samesite' => 'Strict'
        ]);
    } else {
        // Р”Р»СЏ СЃС‚Р°СЂС‹С… РІРµСЂСЃРёР№ PHP
        ini_set('session.cookie_samesite', 'Strict');
    }
    session_start();
}

// РћС‡РёС‰Р°РµРј Р±СѓС„РµСЂ С‡С‚РѕР±С‹ РЅРµ РїРѕСЂС‚РёС‚СЊ JSON-РѕС‚РІРµС‚
while (ob_get_level()) ob_end_clean();

// РџРѕРґР°РІР»СЏРµРј РІС‹РІРѕРґ РѕС€РёР±РѕРє РІ stdout (РѕРЅРё РїРёС€СѓС‚СЃСЏ РІ Р»РѕРіРё)
ini_set('display_errors', 0);
error_reporting(E_ALL);

// РћР±СЂР°Р±РѕС‚РєР° preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/**
 * РџСЂРѕРІРµСЂРёС‚СЊ Р°СѓС‚РµРЅС‚РёС„РёРєР°С†РёСЋ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РїРѕ СЃРµСЃСЃРёРё.
 * Р’РѕР·РІСЂР°С‰Р°РµС‚ РјР°СЃСЃРёРІ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РёР»Рё Р·Р°РІРµСЂС€Р°РµС‚ Р·Р°РїСЂРѕСЃ.
 */
function requireAuth(): array {
    $userId = $_SESSION['user_id'] ?? 0;
    if (!$userId) {
        jsonResponse(401, 'РќРµРѕР±С…РѕРґРёРјР° Р°РІС‚РѕСЂРёР·Р°С†РёСЏ');
    }

    try {
        $pdo = getDB();
        $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if (!$user) {
            session_destroy();
            jsonResponse(401, 'РЎРµСЃСЃРёСЏ РЅРµРґРµР№СЃС‚РІРёС‚РµР»СЊРЅР°');
        }

        return $user;
    } catch (Exception $e) {
        jsonResponse(500, 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°');
    }
}

/**
 * РџРѕР»СѓС‡РёС‚СЊ С‚РµРєСѓС‰РµРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РёР· СЃРµСЃСЃРёРё (РёР»Рё null).
 */
function getCurrentUser(): ?array {
    $userId = $_SESSION['user_id'] ?? 0;
    if (!$userId) return null;

    try {
        $pdo = getDB();
        $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([$userId]);
        return $stmt->fetch() ?: null;
    } catch (Exception $e) {
        return null;
    }
}

/**
 * РџРѕР»СѓС‡РёС‚СЊ PDO-РїРѕРґРєР»СЋС‡РµРЅРёРµ Рє Р‘Р”
 */
function getDB(): PDO {
    static $pdo = null;

    if ($pdo === null) {
        $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::ATTR_TIMEOUT            => 3,
        ];

        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    }

    return $pdo;
}

/**
 * РћС‚РїСЂР°РІРёС‚СЊ JSON-РѕС‚РІРµС‚
 */
function jsonResponse(int $code, string $message, $data = null): void {
    $response = [
        'code'    => $code,
        'message' => $message,
    ];

    if ($data !== null) {
        $response['data'] = $data;
    }

    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * РџРѕР»СѓС‡РёС‚СЊ JSON РёР· С‚РµР»Р° Р·Р°РїСЂРѕСЃР°
 * РљСЌС€РёСЂСѓРµС‚ СЂРµР·СѓР»СЊС‚Р°С‚ С‡С‚РѕР±С‹ РёР·Р±РµР¶Р°С‚СЊ РїРѕРІС‚РѕСЂРЅРѕРіРѕ С‡С‚РµРЅРёСЏ php://input
 */
function getJSONBody(): array {
    static $cachedBody = null;
    
    if ($cachedBody === null) {
        $body = file_get_contents('php://input');
        $data = json_decode($body, true);
        $cachedBody = is_array($data) ? $data : [];
    }
    
    return $cachedBody;
}

/**
 * Р’С‹РїРѕР»РЅРёС‚СЊ GET Р·Р°РїСЂРѕСЃ Рє РІРЅРµС€РЅРµРјСѓ API С‡РµСЂРµР· cURL
 */
function remoteGet(string $endpoint, array $params = []): array {
    $url = REMOTE_API_BASE . $endpoint;
    
    if (!empty($params)) {
        $url .= '?' . http_build_query($params);
    }

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 3);
    curl_setopt($ch, CURLOPT_USERAGENT, 'BlackBearsPlay/1.0');

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $errno = curl_errno($ch);
    $errmsg = curl_error($ch);
    curl_close($ch);

    if ($errno) {
        return ['code' => 2, 'message' => "cURL Error #{$errno}: {$errmsg}", 'data' => null];
    }

    if ($httpCode !== 200) {
        return ['code' => 1, 'message' => "HTTP {$httpCode}", 'data' => null];
    }

    $data = json_decode($response, true);
    if ($data === null) {
        return ['code' => 1, 'message' => 'Invalid JSON from upstream', 'data' => null];
    }

    return $data;
}

/**
 * Р’С‹РїРѕР»РЅРёС‚СЊ POST Р·Р°РїСЂРѕСЃ Рє РІРЅРµС€РЅРµРјСѓ API С‡РµСЂРµР· cURL
 */
function remotePost(string $endpoint, array $body = []): array {
    $url = REMOTE_API_BASE . $endpoint;

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Accept: application/json',
    ]);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 3);
    curl_setopt($ch, CURLOPT_USERAGENT, 'BlackBearsPlay/1.0');

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $errno = curl_errno($ch);
    $errmsg = curl_error($ch);
    curl_close($ch);

    if ($errno) {
        return ['code' => 2, 'message' => "cURL Error #{$errno}: {$errmsg}", 'data' => null, '_raw' => $response];
    }

    if ($httpCode !== 200) {
        return ['code' => 1, 'message' => "HTTP {$httpCode}", 'data' => null, '_raw' => $response];
    }

    // РџСѓСЃС‚РѕР№ РѕС‚РІРµС‚ РїСЂРё 200 = СѓСЃРїРµС… (РЅРµРєРѕС‚РѕСЂС‹Рµ СЌРЅРґРїРѕРёРЅС‚С‹ РЅРµ РІРѕР·РІСЂР°С‰Р°СЋС‚ JSON)
    if ($response === '' || $response === null) {
        return ['code' => 200, 'message' => 'OK (empty response)', 'data' => null];
    }

    $data = json_decode($response, true);
    if ($data === null) {
        // Р’РѕР·РІСЂР°С‰Р°РµРј СЃС‹СЂРѕР№ РѕС‚РІРµС‚ РґР»СЏ РѕС‚Р»Р°РґРєРё
        return ['code' => 1, 'message' => 'Invalid JSON from upstream', 'data' => null, '_raw' => $response];
    }

    return $data;
}

/**
 * Р’СЃРµ Р·Р°РїСЂРѕСЃС‹ Рє РІРЅРµС€РЅРµРјСѓ API РёРґСѓС‚ С‡РµСЂРµР· remoteGet/remotePost/remoteDelete
 * РїСЂРѕРєСЃРёСЂСѓСЋС‚СЃСЏ С‡РµСЂРµР· vibe.blackbearsplay.ru
 */

/**
 * Р’С‹РїРѕР»РЅРёС‚СЊ DELETE Р·Р°РїСЂРѕСЃ Рє РІРЅРµС€РЅРµРјСѓ API С‡РµСЂРµР· cURL
 */
function remoteDelete(string $endpoint, array $body = []): array {
    $url = REMOTE_API_BASE . $endpoint;

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'DELETE');
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Accept: application/json',
    ]);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_USERAGENT, 'BlackBearsPlay/1.0');

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $errno = curl_errno($ch);
    $errmsg = curl_error($ch);
    curl_close($ch);

    if ($errno) {
        return ['code' => 2, 'message' => "cURL Error #{$errno}: {$errmsg}", 'data' => null];
    }

    if ($httpCode !== 200) {
        return ['code' => 1, 'message' => "HTTP {$httpCode}", 'data' => null];
    }

    $data = json_decode($response, true);
    if ($data === null) {
        return ['code' => 1, 'message' => 'Invalid JSON from upstream', 'data' => null];
    }

    return $data;
}

/**
 * Р’Р°Р»РёРґР°С†РёСЏ: email
 */
function isValidEmail(string $email): bool {
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

/**
 * Р’Р°Р»РёРґР°С†РёСЏ: С‚РµР»РµС„РѕРЅ (РјРёРЅРёРјСѓРј 10 С†РёС„СЂ)
 */
function isValidPhone(string $phone): bool {
    $digits = preg_replace('/[^0-9]/', '', $phone);
    return strlen($digits) >= 10;
}

/**
 * Р“РµРЅРµСЂР°С†РёСЏ member_id РёР· Р»РѕРіРёРЅР°
 */
function generateMemberId(string $login): string {
    $hash = crc32('member_' . $login . '_blackbears');
    return '312' . str_pad((string)abs($hash), 9, '0', STR_PAD_LEFT);
}

/**
 * РџРѕР»СѓС‡РёС‚СЊ РІСЃРµ РєР»СѓР±С‹ РёР· РІРЅРµС€РЅРµРіРѕ API Рё СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°С‚СЊ СЃ Р‘Р”
 */
function syncCafes(): array {
    try {
        $pdo = getDB();
        $apiResult = remoteGet('/cafes');

        if ($apiResult['code'] === 0 && !empty($apiResult['data'])) {
            $stmt = $pdo->prepare("
                INSERT INTO cafes (icafe_id, address, is_active)
                VALUES (:icafe_id, :address, 1)
                ON DUPLICATE KEY UPDATE address = VALUES(address), is_active = 1
            ");

            foreach ($apiResult['data'] as $cafe) {
                $stmt->execute([
                    ':icafe_id' => $cafe['icafe_id'],
                    ':address'  => $cafe['address'],
                ]);
            }

            return $apiResult['data'];
        }
    } catch (Exception $e) {
        // РџСЂРѕРґРѕР»Р¶Р°РµРј СЃ Р»РѕРєР°Р»СЊРЅС‹РјРё РґР°РЅРЅС‹РјРё
    }

    // Fallback: Р»РѕРєР°Р»СЊРЅС‹Рµ РєР»СѓР±С‹
    try {
        $pdo = getDB();
        $stmt = $pdo->query("SELECT icafe_id, address FROM cafes WHERE is_active = 1 ORDER BY icafe_id");
        return $stmt->fetchAll();
    } catch (Exception $e) {
        return [];
    }
}

