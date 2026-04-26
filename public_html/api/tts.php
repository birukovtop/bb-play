<?php
/**
 * BlackBears Play — TTS (Text-to-Speech) через edge-tts
 * 
 * POST { "text": "Привет, воин!" }
 * Возвращает URL MP3 файла (кэшируется на сервере)
 * 
 * Голос: ru-RU-DmitryNeural (мужской, Барни)
 * Кэш: api/tts_audio/ — файлы старше 7 дней удаляются автоматически
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$audioDir = __DIR__ . '/tts_audio/';
if (!is_dir($audioDir)) {
    mkdir($audioDir, 0755, true);
}

// Автоочистка старых файлов (>7 дней)
$cacheMaxAge = 7 * 86400; // 7 дней в секундах
if (is_dir($audioDir) && rand(1, 10) === 1) { // ~10% шанс при каждом запросе
    foreach (scandir($audioDir) as $file) {
        if ($file === '.' || $file === '..') continue;
        $path = $audioDir . $file;
        if (filemtime($path) < time() - $cacheMaxAge) {
            @unlink($path);
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['code' => 1, 'message' => 'POST only']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
$text = trim($body['text'] ?? '');

if (empty($text)) {
    echo json_encode(['code' => 1, 'message' => 'Empty text']);
    exit;
}

// MD5 хеш текста для имени файла
$hash = md5($text);
$mp3File = $audioDir . $hash . '.mp3';
$basePath = preg_replace('#/api$#', '', rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/tts.php'), '/'));
$mp3Url = $basePath . '/api/tts_audio/' . $hash . '.mp3';

// Если уже есть в кэше
if (file_exists($mp3File) && filesize($mp3File) > 100) {
    echo json_encode(['code' => 0, 'url' => $mp3Url, 'cached' => true]);
    exit;
}

// Генерируем через edge-tts
$tmpPy = $audioDir . '_gen_' . $hash . '.py';
$escapedText = addcslashes($text, "'\\\n\r\t");
$escapedFile = str_replace('\\', '/', $mp3File);

$scriptContent = "import asyncio\nimport edge_tts\nasync def main():\n    await edge_tts.Communicate('{$escapedText}', 'ru-RU-DmitryNeural').save('{$escapedFile}')\nasyncio.run(main())\n";
file_put_contents($tmpPy, $scriptContent);

// Запускаем python через proc_open (надёжнее чем shell_exec)
$descriptors = [
    0 => ['pipe', 'r'],
    1 => ['pipe', 'w'],
    2 => ['pipe', 'w'],
];
$pythonBin = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN' ? 'python' : 'python3.11';
$process = proc_open($pythonBin . ' "' . str_replace('\\', '/', $tmpPy) . '"', $descriptors, $pipes, null, null, ['bypass_shell' => true]);
if (is_resource($process)) {
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($process);
}

@unlink($tmpPy);

if (file_exists($mp3File) && filesize($mp3File) > 100) {
    echo json_encode(['code' => 0, 'url' => $mp3Url, 'cached' => false]);
} else {
    echo json_encode(['code' => 1, 'message' => 'TTS generation failed']);
}
