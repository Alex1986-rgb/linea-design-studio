<?php
/**
 * Макет API ЮKassa для tools/test-units.php (только мак, php -S): GET /payments/<id> → платёж из файла $LINEA_YK_MOCK/<id>.json,
 * нет файла — 404 (как у ЮKassa на чужой id). Боевой API не вызывается никогда.
 */
declare(strict_types=1);
$id = preg_replace('/[^0-9a-z-]/i', '', basename((string)parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH))) ?? '';
$f = rtrim((string)getenv('LINEA_YK_MOCK'), '/') . '/' . $id . '.json';
header('Content-Type: application/json');
if ($id === '' || !is_file($f)) { http_response_code(404); echo '{"type":"error","code":"not_found"}'; exit; }
readfile($f);
