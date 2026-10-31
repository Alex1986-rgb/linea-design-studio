<?php
/**
 * api/brigade/file.php?f=<id>[&t=<токен заказа>] — отдача файла сервиса бригад с проверкой прав (brig_file_allowed):
 * бригада по своей сессии, клиент по токену своего заказа; портфолио и логотип допущенных бригад — всем (каталог).
 * Файлы лежат вне веб-корня (linea-private/brigady/files). Чужой файл — 403.
 */
declare(strict_types=1);
require __DIR__ . '/../lib/boot.php';
require __DIR__ . '/../lib/brig.php';

$f = brig_one('SELECT * FROM br_files WHERE id = ?', [(int)($_GET['f'] ?? 0)]);
if (!$f) { http_response_code(404); exit; }
$ctx = [];
$t = (string)($_GET['t'] ?? '');
if ($t !== '') { $o = linea_order_by_token($t); if ($o) { $ctx['order'] = $o; } }
else { brig_session(); $b = brig_me(false); if ($b) { $ctx['brigade'] = $b; } }
if (!brig_file_allowed($f, $ctx)) { http_response_code(403); header('Content-Type: text/plain; charset=utf-8'); echo 'Нет доступа'; exit; }
brig_send_file($f);
