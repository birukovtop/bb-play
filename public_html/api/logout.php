<?php
/**
 * BlackBears Play — Выход из системы (POST /api/logout.php)
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(1, 'Метод не поддерживается');
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

session_destroy();
jsonResponse(0, 'Выход выполнен');
