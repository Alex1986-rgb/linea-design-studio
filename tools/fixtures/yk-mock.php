<?php
/**
 * Макет API ЮKassa для tools/test-units.php (только мак, php -S). Боевой API не вызывается никогда.
 *   GET  /payments/<id>, /refunds/<id> → объект из файла $LINEA_YK_MOCK/<id>.json; нет файла — 404 (как у ЮKassa на чужой id).
 *   POST /receipts, /refunds → тело запроса пишется в $LINEA_YK_MOCK/req-<receipts|refunds>-<N>.json, ответ — созданный объект
 *        (статус возврата — из файла refund-status, по умолчанию succeeded; файл fail-<receipts|refunds> — ответ 500).
 *        Повтор с тем же Idempotence-Key возвращает тот же объект (как у ЮKassa) — второй возврат не создаётся.
 *        Файл lose-<receipts|refunds> — объект СОЗДАЁТСЯ, но ответ теряется (500): обрыв связи после создания у ЮKassa.
 *   POST /payments (09.11.2026, опции заказа) → создаётся платёж pending с metadata/amount из тела и confirmation_url; тело — в req-payments-<N>.json.
 *        Оплату «проводит» тест: перезаписывает <id>.json со статусом succeeded.
 *   GET  /refunds?payment_id=<id> → {items: [...]} — возвраты по платежу (сверка висящих возвратов).
 */
declare(strict_types=1);
$dir = rtrim((string)getenv('LINEA_YK_MOCK'), '/');
$path = (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
header('Content-Type: application/json');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $what = basename($path);
    if (!in_array($what, ['receipts', 'refunds', 'payments'], true)) { http_response_code(404); echo '{"type":"error","code":"not_found"}'; exit; }
    $idem = preg_replace('/[^0-9A-Za-z._-]/', '', (string)($_SERVER['HTTP_IDEMPOTENCE_KEY'] ?? '')) ?? '';
    if ($idem === '') { http_response_code(400); echo '{"type":"error","code":"invalid_request","description":"Idempotence-Key"}'; exit; }
    if (is_file("$dir/idem-$idem.json")) { readfile("$dir/idem-$idem.json"); exit; }
    if (is_file("$dir/fail-$what")) { http_response_code(500); echo '{"type":"error","code":"internal_server_error"}'; exit; }
    $body = json_decode((string)file_get_contents('php://input'), true) ?: [];
    $n = count(glob("$dir/req-$what-*.json") ?: []) + 1;
    file_put_contents("$dir/req-$what-$n.json", json_encode(['idem' => $idem, 'body' => $body], JSON_UNESCAPED_UNICODE));
    $id = sprintf('%08x-000f-5000-%04x-%012x', crc32($what), $n, crc32($idem));
    if ($what === 'payments') {
        $obj = ['id' => $id, 'status' => 'pending', 'paid' => false, 'amount' => $body['amount'] ?? [], 'metadata' => $body['metadata'] ?? [],
            'confirmation' => ['type' => 'redirect', 'confirmation_url' => 'https://yookassa.test/pay/' . $id], 'receipt_registration' => isset($body['receipt']) ? 'pending' : null];
        file_put_contents("$dir/idem-$idem.json", json_encode($obj));
        file_put_contents("$dir/$id.json", json_encode($obj));
        echo json_encode($obj);
        exit;
    }
    $obj = $what === 'refunds'
        ? ['id' => $id, 'payment_id' => $body['payment_id'] ?? '', 'status' => is_file("$dir/refund-status") ? trim((string)file_get_contents("$dir/refund-status")) : 'succeeded', 'amount' => $body['amount'] ?? []]
        : ['id' => $id, 'type' => $body['type'] ?? 'payment', 'payment_id' => $body['payment_id'] ?? '', 'status' => 'pending'];
    file_put_contents("$dir/idem-$idem.json", json_encode($obj));
    file_put_contents("$dir/$id.json", json_encode($obj));
    if (is_file("$dir/lose-$what")) { http_response_code(500); echo '{"type":"error","code":"internal_server_error"}'; exit; }
    echo json_encode($obj);
    exit;
}
if (basename($path) === 'refunds') {
    $pid = (string)($_GET['payment_id'] ?? '');
    $items = [];
    foreach (glob($dir . '/*.json') ?: [] as $f) {
        if (str_starts_with(basename($f), 'req-') || str_starts_with(basename($f), 'idem-')) { continue; }
        $x = json_decode((string)file_get_contents($f), true);
        if (is_array($x) && isset($x['amount']) && array_key_exists('payment_id', $x) && !isset($x['type']) && ($x['payment_id'] ?? '') === $pid && !isset($x['paid'])) { $items[] = $x; }
    }
    echo json_encode(['type' => 'list', 'items' => $items]); exit;
}
$id = preg_replace('/[^0-9a-z-]/i', '', basename($path)) ?? '';
$f = $dir . '/' . $id . '.json';
if ($id === '' || !is_file($f)) { http_response_code(404); echo '{"type":"error","code":"not_found"}'; exit; }
readfile($f);
