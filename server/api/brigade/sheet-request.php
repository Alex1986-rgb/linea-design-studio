<?php
/**
 * api/brigade/sheet-request.php — очередь «лист по запросу» для воркера GOST-DRAFT (SmartApe, tools/sheet-worker.mjs).
 * Протокол — общий с движком: ~/projects/gost-draft-sheetreq/docs/kb/sheet-request-api.md и docs/brigady/sheet-request-api.md.
 *   GET  ?action=next&worker=<имя>   → 204 (пусто) | 200 {id, project_slug, text, room, wall, lang, brigade_id, issue, audio_url}
 *   GET  ?action=audio&id=<id>       → запись надиктовки задания
 *   POST ?action=result (multipart: id, status=done|question|failed, note, meta JSON, question JSON, pdf) → {ok:true}
 * Доступ: Authorization: Bearer <sheet_worker_token> (на Beget заголовок пробрасывается правилом в brigade/.htaccess) или
 * X-Worker-Token — запасной путь. Пустой токен в config — API выключен (503). Только https (кроме php -S на маке).
 * В задании нет ПДн клиента. Задание выдаётся одному воркеру и блокируется на 15 минут; нет ответа — выдаётся снова.
 */
declare(strict_types=1);
require __DIR__ . '/../lib/boot.php';
require __DIR__ . '/../lib/brig.php';
require __DIR__ . '/../lib/sheets.php';

if (!linea_https() && !linea_local()) { linea_fail('Только https', 403); }
$tok = (string)brig_cfg('sheet_worker_token', '');
if ($tok === '') { linea_fail('Очередь листов выключена (sheet_worker_token пуст)', 503); }
if (strlen($tok) < 32) { linea_fail('Очередь листов выключена: sheet_worker_token короче 32 знаков', 503); }
// перебор токена: не больше 20 неверных попыток в час с адреса (критик техники 01.11.2026, Н-6)
if (!linea_rate('sheet-worker-bad', 20, false)) { linea_fail('Слишком много неверных попыток — подождите час', 429); }
$auth = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
$given = preg_match('/^Bearer\s+(\S+)$/i', $auth, $m) ? $m[1] : (string)($_SERVER['HTTP_X_WORKER_TOKEN'] ?? '');
if ($given === '' || !hash_equals($tok, $given)) { linea_rate_add('sheet-worker-bad'); linea_fail('Нет доступа', 403); }
if (!linea_rate('sheet-worker', 2000)) { linea_fail('Слишком часто', 429); }
brig_db();
$a = (string)($_GET['action'] ?? '');
$now = linea_now();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    if ($a === 'next') {
        // блокировка 15 минут: взятое и не возвращённое задание снова уходит в очередь
        db_exec("UPDATE br_sheet_reqs SET status = 'new' WHERE status = 'work' AND claimed_at < ?", [date('Y-m-d H:i:s', time() - 900)]);
        // в работу — только запросы активной сделки (объект «в работе») и оплаченные вне сделки (source = 'outside')
        foreach (brig_all("SELECT s.* FROM br_sheet_reqs s JOIN br_jobs j ON j.id = s.job_id WHERE s.status = 'new' AND (j.status = 'work' OR s.source = 'outside') ORDER BY s.id LIMIT 5") as $s) {
            if (db_exec("UPDATE br_sheet_reqs SET status = 'work', claimed_at = ?, updated_at = ?, worker_note = ? WHERE id = ? AND status = 'new'",
                [$now, $now, 'воркер: ' . linea_str($_GET['worker'] ?? '', 40), (int)$s['id']]) !== 1) { continue; }
            $s['status'] = 'work';
            sheets_mirror((int)$s['id']);
            sheets_notify((int)$s['id']);
            linea_json(sheets_task($s));
        }
        http_response_code(204); exit;
    }
    if ($a === 'audio') {
        $s = brig_one('SELECT * FROM br_sheet_reqs WHERE id = ?', [(int)($_GET['id'] ?? 0)]);
        $f = $s && $s['audio_file'] ? brig_one('SELECT * FROM br_files WHERE id = ?', [(int)$s['audio_file']]) : null;
        if (!$f) { linea_fail('Записи нет', 404); }
        brig_send_file($f);
    }
    linea_fail('Неизвестное действие', 404);
}
if ($a !== 'result') { linea_fail('Неизвестное действие', 404); }
$id = (int)($_POST['id'] ?? 0);
$s = brig_one('SELECT * FROM br_sheet_reqs WHERE id = ?', [$id]);
if (!$s) { linea_fail('Нет такого задания', 404); }
if (!in_array($s['status'], ['work', 'new'], true)) { linea_fail('Задание уже закрыто: ' . $s['status'], 409); }
$st = (string)($_POST['status'] ?? '');
if (!in_array($st, ['done', 'question', 'failed'], true)) { linea_fail('status: done | question | failed'); }
$note = linea_str($_POST['note'] ?? '', 1000);
$row = ['worker_note' => $note, 'updated_at' => $now, 'worker_meta' => mb_substr((string)($_POST['meta'] ?? ''), 0, 20000)];
if ($st !== 'failed') {
    $pdf = $_FILES['pdf'] ?? null;
    if (!$pdf || ($pdf['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) { linea_fail('Нужен pdf'); }
    $row['result_file'] = brig_store_upload($pdf, ['pdf'], ['brigade_id' => (int)$s['brigade_id'], 'kind' => 'sheet', 'id' => $id, 'sub' => 'result'], 'worker');
    $row['ready_at'] = $now;
}
if ($st === 'done') { $row['status'] = 'ready'; }
if ($st === 'question') {
    $q = json_decode((string)($_POST['question'] ?? ''), true);
    $row['status'] = 'question';
    $row['question'] = linea_str(is_array($q) ? (($q['id'] ?? '') !== '' ? $q['id'] . ': ' : '') . ($q['text'] ?? '') : ($note ?: 'Нужен уточняющий вопрос'), 1000) ?: $note;
}
if ($st === 'failed') { $row['status'] = 'failed'; }
db_update('br_sheet_reqs', $row, 'id = ?', [$id]);
sheets_mirror($id);
brig_audit('worker', 'sheet-' . $st, 'sheet#' . $id, $note);
sheets_notify($id);
if ($st === 'failed') { brig_admin_notify('лист по запросу не собран', 'Запрос листа #' . $id . ': ' . $note, brig_link('api/admin-brigady.php?view=sheets'), false); }
linea_json(['ok' => true]);
