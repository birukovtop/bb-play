<?php
/**
 * BlackBears Play — Получение списка клубов (GET /api/cafes.php)
 * Возвращает клубы ТОЛЬКО из внешнего API vibe.blackbearsplay.ru
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(1, 'Метод не поддерживается');
}

try {
    // Получаем клубы из внешнего API
    $apiResult = remoteGet('/cafes');

    if ($apiResult['code'] === 0 && !empty($apiResult['data'])) {
        $cafes = [];
        foreach ($apiResult['data'] as $cafe) {
            $cafes[] = [
                'icafe_id'    => $cafe['icafe_id'],
                'address'     => $cafe['address'] ?? '',
                'phone'       => $cafe['phone'] ?? null,
                'vk_link'     => $cafe['vk_link'] ?? null,
                'description' => $cafe['description'] ?? null,
            ];
        }

        jsonResponse(0, 'Success', $cafes);
    }

    // API вернул пустой ответ или ошибку
    jsonResponse(0, 'No clubs available', []);

} catch (Exception $e) {
    // API недоступен
    jsonResponse(0, 'No clubs available', []);
}
