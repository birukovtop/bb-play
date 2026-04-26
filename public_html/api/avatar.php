<?php
/**
 * BlackBears Play — API аватарок
 */
error_reporting(0);
ini_set('display_errors', 0);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

// Используем кэшированный getJSONBody() для избежания повторного чтения php://input
$reqBody = getJSONBody();

$action = $_GET['action'] ?? $_POST['action'] ?? '';
logRequest('avatar_' . $action, $reqBody);

$avatarDir = __DIR__ . '/../avatars';

switch ($action) {
    case 'save_preset': handleSavePreset(); break;
    case 'upload': handleUpload(); break;
    case 'delete': handleDelete(); break;
    case 'get': handleGet(); break;
    default: jsonResponse(1, 'Unknown action. Allowed: save_preset, upload, delete, get');
}

// ============================================
// Сохранить пресет-эмодзи
// ============================================
function handleSavePreset() {
    global $reqBody;
    $body = $reqBody;
    $login = trim($body['login'] ?? '');
    $emoji = trim($body['emoji'] ?? '');

    if (empty($login)) jsonResponse(413, 'Empty login');
    if (empty($emoji)) jsonResponse(414, 'Empty emoji');

    // Валидация login для защиты от directory traversal
    if (!preg_match('/^[a-zA-Z0-9_\-@.]+$/', $login)) {
        jsonResponse(454, 'Invalid login format');
    }

    $pdo = getDB();
    $stmt = $pdo->prepare("UPDATE users SET avatar = ?, avatar_type = 'preset' WHERE login = ?");
    $stmt->execute([$emoji, $login]);

    if ($stmt->rowCount() === 0) jsonResponse(1, 'Пользователь не найден');

    logResponse(0, 'Preset saved');
    jsonResponse(0, 'Success', ['avatar' => $emoji, 'avatar_type' => 'preset']);
}

// ============================================
// Загрузить кастомную аватарку (base64, сжатие на сервере через GD)
// ============================================
function handleUpload() {
    global $reqBody, $avatarDir;
    $body = $reqBody;
    $login = trim($body['login'] ?? '');
    $base64 = trim($body['image'] ?? '');

    if (empty($login)) jsonResponse(413, 'Empty login');
    if (empty($base64)) jsonResponse(414, 'Empty image');

    // Валидация login для защиты от directory traversal
    if (!preg_match('/^[a-zA-Z0-9_\-@.]+$/', $login)) {
        jsonResponse(454, 'Invalid login format');
    }

    // Проверяем что GD установлен
    if (!function_exists('imagecreatefromstring')) {
        logMsg('AVATAR_ERR', 'PHP GD extension not available');
        jsonResponse(501, 'GD extension not available on server');
    }

    // Проверяем/создаём директорию
    if (!is_dir($avatarDir)) {
        if (!@mkdir($avatarDir, 0755, true)) {
            logMsg('AVATAR_ERR', "Cannot create avatar directory: {$avatarDir}");
            jsonResponse(500, 'Failed to create avatar directory');
        }
    }

    if (!is_writable($avatarDir)) {
        logMsg('AVATAR_ERR', "Avatar directory not writable: {$avatarDir}");
        jsonResponse(500, 'Avatar directory is not writable');
    }

    // Парсим base64
    if (!preg_match('/^data:image\/(\w+);base64,/', $base64, $matches)) {
        jsonResponse(454, 'Invalid image format. Expected: data:image/jpeg;base64,...');
    }

    $ext = strtolower($matches[1]);
    if (!in_array($ext, ['jpeg', 'jpg', 'png', 'gif', 'webp'])) {
        jsonResponse(454, 'Unsupported image type. Use JPG, PNG, GIF or WebP');
    }

    if ($ext === 'jpeg') $ext = 'jpg';

    // Удаляем префикс data:image/...
    $base64Data = preg_replace('/^data:image\/\w+;base64,/', '', $base64);
    $imageData = base64_decode($base64Data);

    if ($imageData === false) jsonResponse(454, 'Invalid base64 data');

    // Создаём изображение из строки (GD)
    $source = @imagecreatefromstring($imageData);
    if (!$source) {
        logMsg('AVATAR_ERR', 'imagecreatefromstring failed for login=' . $login . ', ext=' . $ext . ', size=' . strlen($imageData));
        jsonResponse(454, 'Failed to decode image. File may be corrupted.');
    }

    // Получаем оригинальные размеры
    $origWidth = imagesx($source);
    $origHeight = imagesy($source);

    if ($origWidth <= 0 || $origHeight <= 0) {
        imagedestroy($source);
        jsonResponse(454, 'Invalid image dimensions');
    }

    // Сжимаем до 200x200 максимум
    $maxSize = 200;
    $ratio = min($maxSize / $origWidth, $maxSize / $origHeight, 1);
    $newWidth = (int)($origWidth * $ratio);
    $newHeight = (int)($origHeight * $ratio);

    // Создаём новое изображение с нужными размерами
    $thumb = imagecreatetruecolor($newWidth, $newHeight);

    // Для PNG сохраняем прозрачность
    if ($ext === 'png') {
        imagealphablending($thumb, false);
        imagesavealpha($thumb, true);
        $transparent = imagecolorallocatealpha($thumb, 255, 255, 255, 127);
        imagefilledrectangle($thumb, 0, 0, $newWidth, $newHeight, $transparent);
    }

    imagecopyresampled($thumb, $source, 0, 0, 0, 0, $newWidth, $newHeight, $origWidth, $origHeight);
    imagedestroy($source);

    // Генерируем уникальное имя файла
    $filename = 'avatar_' . $login . '_' . uniqid() . '.jpg';
    $filepath = $avatarDir . '/' . $filename;

    // Удаляем старые кастомные аватарки пользователя
    $oldFiles = glob($avatarDir . '/avatar_' . $login . '_*.{jpg,jpeg,png,gif,webp}', GLOB_BRACE);
    foreach ($oldFiles as $oldFile) {
        @unlink($oldFile);
    }

    // Сохраняем как JPEG с качеством 80%
    $saved = @imagejpeg($thumb, $filepath, 80);
    imagedestroy($thumb);

    if (!$saved) {
        logMsg('AVATAR_ERR', 'imagejpeg failed for login=' . $login);
        jsonResponse(500, 'Failed to save image');
    }

    // Проверяем размер файла (макс 100KB)
    $fileSize = filesize($filepath);
    if ($fileSize === false || $fileSize > 100 * 1024) {
        @unlink($filepath);
        jsonResponse(454, 'Image too large after compression (max 100KB)');
    }

    // Сохраняем в БД
    $basePath = preg_replace('#/api$#', '', rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/avatar.php'), '/'));
    $avatarUrl = $basePath . '/avatars/' . $filename;
    try {
        $pdo = getDB();
        $stmt = $pdo->prepare("UPDATE users SET avatar = ?, avatar_type = 'custom' WHERE login = ?");
        $stmt->execute([$avatarUrl, $login]);

        if ($stmt->rowCount() === 0) {
            @unlink($filepath);
            jsonResponse(1, 'Пользователь не найден');
        }
    } catch (PDOException $e) {
        @unlink($filepath);
        logMsg('AVATAR_ERR', 'DB error: ' . $e->getMessage());
        jsonResponse(500, 'Database error while saving avatar');
    }

    logResponse(0, 'Custom avatar uploaded');
    jsonResponse(0, 'Success', [
        'avatar' => $avatarUrl,
        'avatar_type' => 'custom',
        'size' => "{$newWidth}x{$newHeight}",
        'file_size' => round($fileSize / 1024, 1) . 'KB'
    ]);
}

// ============================================
// Удалить кастомную аватарку
// ============================================
function handleDelete() {
    global $reqBody, $avatarDir;
    $body = $reqBody;
    $login = trim($body['login'] ?? '');
    if (empty($login)) jsonResponse(413, 'Empty login');

    // Валидация login для защиты от directory traversal
    if (!preg_match('/^[a-zA-Z0-9_\-@.]+$/', $login)) {
        jsonResponse(454, 'Invalid login format');
    }

    // Удаляем файлы
    $oldFiles = glob($avatarDir . '/avatar_' . $login . '_*.{jpg,jpeg,png,gif,webp}', GLOB_BRACE);
    foreach ($oldFiles as $oldFile) {
        @unlink($oldFile);
    }

    // Сбрасываем на пресет по умолчанию
    $pdo = getDB();
    $pdo->prepare("UPDATE users SET avatar = '🐻', avatar_type = 'preset' WHERE login = ?")
        ->execute([$login]);

    logResponse(0, 'Custom avatar deleted');
    jsonResponse(0, 'Success');
}

// ============================================
// Получить аватарку пользователя
// ============================================
function handleGet() {
    $login = trim($_GET['login'] ?? '');
    if (empty($login)) jsonResponse(413, 'Empty login');

    // Валидация login для защиты от directory traversal
    if (!preg_match('/^[a-zA-Z0-9_\-@.]+$/', $login)) {
        jsonResponse(454, 'Invalid login format');
    }

    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT avatar, avatar_type FROM users WHERE login = ? LIMIT 1");
    $stmt->execute([$login]);
    $user = $stmt->fetch();

    if (!$user) jsonResponse(1, 'Пользователь не найден');

    jsonResponse(0, 'Success', [
        'avatar' => $user['avatar'] ?? '🐻',
        'avatar_type' => $user['avatar_type'] ?? 'preset',
    ]);
}
