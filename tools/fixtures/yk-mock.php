<?php
/**
 * Макет API ЮKassa для tools/test-units.php (только мак, php -S). Боевой API не вызывается никогда.
 *   GET  /payments/<id>, /refunds/<id> → объект из файла $LINEA_YK_MOCK/<id>.json; нет файла — 404 (как у ЮKassa на чужой id).
 *   POST /receipts, /refunds → тело запроса пишется в $LINEA_YK_MOCK/req-<receipts|refunds>-<N>.json, ответ — созданный объект
 *        (статус возврата — из файла refund-status, по умолчанию succeeded; файл fail-<receipts|refunds> — ответ 500).
 *        Повтор с тем же Idempotence-Key возвращает тот же объект (как у ЮKassa) — второй возврат не создаётся.
 */
declare(strict_types=1);
$dir = rtrim((string)getenv('LINEA_YK_MOCK'), '/');
$path = (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
header('Content-Type: application/json');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $what = basename($path);
    if (!in_array($what, ['receipts', 'refunds'], true)) { http_response_code(404); echo '{"type":"error","code":"not_found"}'; exit; }
    $idem = preg_replace('/[^0-9A-Za-z._-]/', '', (string)($_SERVER['HTTP_IDEMPOTENCE_KEY'] ?? '')) ?? '';
    if ($idem === '') { http_response_code(400); echo '{"type":"error","code":"invalid_request","description":"Idempotence-Key"}'; exit; }
    if (is_file("$dir/idem-$idem.json")) { readfile("$dir/idem-$idem.json"); exit; }
    if (is_file("$dir/fail-$what")) { http_response_code(500); echo '{"type":"error","code":"internal_server_error"}'; exit; }
    $body = json_decode((string)file_get_contents('php://input'), true) ?: [];
    $n = count(glob("$dir/req-$what-*.json") ?: []) + 1;
    file_put_contents("$dir/req-$what-$n.json", json_encode(['idem' => $idem, 'body' => $body], JSON_UNESCAPED_UNICODE));
    $id = sprintf('%08x-000f-5000-%04x-%012x', crc32($what), $n, crc32($idem));
    $obj = $what === 'refunds'
        ? ['id' => $id, 'payment_id' => $body['payment_id'] ?? '', 'status' => is_file("$dir/refund-status") ? trim((string)file_get_contents("$dir/refund-status")) : 'succeeded', 'amount' => $body['amount'] ?? []]
        : ['id' => $id, 'type' => $body['type'] ?? 'payment', 'payment_id' => $body['payment_id'] ?? '', 'status' => 'pending'];
    file_put_contents("$dir/idem-$idem.json", json_encode($obj));
    file_put_contents("$dir/$id.json", json_encode($obj));
    echo json_encode($obj);
    exit;
}
$id = preg_replace('/[^0-9a-z-]/i', '', basename($path)) ?? '';
$f = $dir . '/' . $id . '.json';
if ($id === '' || !is_file($f)) { http_response_code(404); echo '{"type":"error","code":"not_found"}'; exit; }
readfile($f);
