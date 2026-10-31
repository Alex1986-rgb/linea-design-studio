<?php
/**
 * api/brigade/sheets.php — «Нужен лист»: бригада на своём объекте просит лист/узел/уточнение к проекту (текстом или голосом).
 *   GET ?j=<объект>           — история запросов листов по объекту, статусы, готовые PDF
 *   POST ?a=create (multipart, CSRF): j, text, room?, wall?, lang?, audio? (webm/ogg/m4a/mp3 до 10 МБ)
 *   POST ?a=answer (JSON, CSRF): {s, answer} — ответ на уточняющий вопрос (запрос возвращается в очередь)
 * Очередь — таблица br_sheet_reqs + зеркало заданий в linea-private/sheet-requests/<id>.json; листы делает воркер GOST-DRAFT
 * на SmartApe через api/sheets-worker.php (протокол — docs/brigady/sheet-request-api.md). Без ПДн клиента в задании.
 * Лимиты: 10 запросов на объект в сутки, 30 на бригаду в сутки, 5 открытых на объект одновременно.
 */
declare(strict_types=1);
require __DIR__ . '/../lib/boot.php';
require __DIR__ . '/../lib/brig.php';
require __DIR__ . '/../lib/sheets.php';

brig_https();
$b = brig_me();
$bid = (int)$b['id'];

function sh_job(int $jid, int $bid): array
{
    $j = brig_one('SELECT j.*, r.object_title, r.test rtest FROM br_jobs j JOIN br_requests r ON r.id = j.request_id WHERE j.id = ?', [$jid]);
    if (!$j || (int)$j['brigade_id'] !== $bid) { linea_fail('Это не ваш объект', 403); }
    return $j;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $j = sh_job((int)($_GET['j'] ?? 0), $bid);
    linea_json(['ok' => true, 'sheets' => sheets_list((int)$j['id']), 'rooms' => sheets_rooms((int)$j['request_id'])]);
}
brig_method('POST');
brig_csrf();
$a = (string)($_GET['a'] ?? '');
$now = linea_now();
if ($a === 'create') {
    $j = sh_job((int)($_POST['j'] ?? 0), $bid);
    if (!in_array($j['status'], ['contract', 'work'], true)) { linea_fail('Листы по запросу — пока объект в работе'); }
    $day = date('Y-m-d H:i:s', time() - 86400);
    if ((int)db_val('SELECT COUNT(*) FROM br_sheet_reqs WHERE job_id = ? AND created_at > ?', [(int)$j['id'], $day]) >= 10
        || (int)db_val('SELECT COUNT(*) FROM br_sheet_reqs WHERE brigade_id = ? AND created_at > ?', [$bid, $day]) >= 30) { linea_fail('Лимит: 10 запросов листов на объект и 30 на бригаду в сутки', 429); }
    if ((int)db_val("SELECT COUNT(*) FROM br_sheet_reqs WHERE job_id = ? AND status IN ('new','work','question')", [(int)$j['id']]) >= 5) { linea_fail('По объекту уже 5 открытых запросов — дождитесь готовых листов', 429); }
    $text = linea_str($_POST['text'] ?? '', 3000);
    $hasAudio = isset($_FILES['audio']) && ($_FILES['audio']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK;
    if ($text === '' && !$hasAudio) { linea_fail('Напишите или надиктуйте, какой лист нужен'); }
    $id = db_insert('br_sheet_reqs', ['job_id' => (int)$j['id'], 'brigade_id' => $bid, 'status' => 'new', 'text' => $text !== '' ? $text : '(голосом, см. запись)',
        'room' => linea_str($_POST['room'] ?? '', 60), 'wall' => preg_match('/^[A-DА-Г]?$/u', (string)($_POST['wall'] ?? '')) ? (string)($_POST['wall'] ?? '') : '',
        'lang' => preg_match('/^[a-z]{2}$/', (string)($_POST['lang'] ?? 'ru')) ? (string)$_POST['lang'] : 'ru', 'created_at' => $now, 'updated_at' => $now]);
    if ($hasAudio) {
        $fid = brig_store_upload($_FILES['audio'], ['audio'], ['brigade_id' => $bid, 'kind' => 'sheet-audio', 'id' => $id, 'sub' => 'audio'], 'brigade#' . $bid);
        db_update('br_sheet_reqs', ['audio_file' => $fid], 'id = ?', [$id]);
    }
    sheets_mirror($id);
    brig_audit('brigade#' . $bid, 'sheet-request', 'sheet#' . $id, mb_substr($text, 0, 120));
    linea_json(['ok' => true, 'id' => $id, 'sheets' => sheets_list((int)$j['id'])]);
}
if ($a === 'answer') {
    $in = brig_input();
    $s = brig_one('SELECT * FROM br_sheet_reqs WHERE id = ? AND brigade_id = ?', [(int)($in['s'] ?? 0), $bid]);
    if (!$s) { linea_fail('Это не ваш запрос', 403); }
    if ($s['status'] !== 'question') { linea_fail('Вопроса по запросу нет'); }
    $ans = linea_str($in['answer'] ?? '', 2000);
    if ($ans === '') { linea_fail('Пустой ответ'); }
    db_update('br_sheet_reqs', ['answer' => $ans, 'status' => 'new', 'updated_at' => $now], 'id = ?', [(int)$s['id']]);
    sheets_mirror((int)$s['id']);
    linea_json(['ok' => true, 'sheets' => sheets_list((int)$s['job_id'])]);
}
linea_fail('Неизвестное действие', 404);
