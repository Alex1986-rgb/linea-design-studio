<?php
/**
 * api/sheets-worker.php — API воркера «лист по запросу» (GOST-DRAFT на SmartApe). Протокол v1 — docs/brigady/sheet-request-api.md.
 * Доступ: заголовок X-Worker-Token = config 'sheet_worker_token' (не Authorization: на Beget CGI он до PHP не доходит); пустой
 * токен в конфиге — API выключен (503). Только https (кроме php -S на маке). В заданиях нет ПДн клиента.
 *   GET  ?a=next[&limit=1..10] — взять задания (new → work); зависшие в work дольше 2 ч возвращаются в очередь
 *   GET  ?a=audio&id=          — запись надиктовки задания
 *   GET  ?a=get&id=            — задание целиком (статус)
 *   POST ?a=result   (multipart: id, file=PDF, note?)  — готовый лист → ready, уведомление бригаде
 *   POST ?a=question (JSON {id, question})             — нужен уточняющий вопрос → question
 *   POST ?a=reject   (JSON {id, reason})               — не лист (например, вопрос к договору) → rejected
 *   POST ?a=requeue  (JSON {id})                       — вернуть в очередь (воркер упал)
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/brig.php';
require __DIR__ . '/lib/sheets.php';

if (!linea_https() && !linea_local()) { linea_fail('Только https', 403); }
$tok = (string)brig_cfg('sheet_worker_token', '');
if ($tok === '') { linea_fail('API воркера выключен (sheet_worker_token пуст)', 503); }
if (!hash_equals($tok, (string)($_SERVER['HTTP_X_WORKER_TOKEN'] ?? ''))) { linea_rate('sheet-worker-bad', 1000); linea_fail('Нет доступа', 403); }
if (!linea_rate('sheet-worker', 2000)) { linea_fail('Слишком часто', 429); }
brig_db();
$a = (string)($_GET['a'] ?? '');
$now = linea_now();
$get = function (int $id): array { $s = brig_one('SELECT * FROM br_sheet_reqs WHERE id = ?', [$id]); if (!$s) { linea_fail('Нет такого задания', 404); } return $s; };
$set = function (int $id, array $row) use ($now) { db_update('br_sheet_reqs', $row + ['updated_at' => $now], 'id = ?', [$id]); sheets_mirror($id); };

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    if ($a === 'next') {
        db_exec("UPDATE br_sheet_reqs SET status = 'new' WHERE status = 'work' AND claimed_at < ?", [date('Y-m-d H:i:s', time() - 7200)]);
        $limit = max(1, min(10, (int)($_GET['limit'] ?? 1)));
        $tasks = [];
        foreach (brig_all("SELECT * FROM br_sheet_reqs WHERE status = 'new' ORDER BY id LIMIT " . $limit) as $s) {
            if (db_exec("UPDATE br_sheet_reqs SET status = 'work', claimed_at = ?, updated_at = ? WHERE id = ? AND status = 'new'", [$now, $now, (int)$s['id']]) !== 1) { continue; }
            $s['status'] = 'work';
            sheets_mirror((int)$s['id']);
            sheets_notify((int)$s['id']);
            $tasks[] = sheets_task($s);
        }
        linea_json(['ok' => true, 'tasks' => $tasks]);
    }
    if ($a === 'get') { linea_json(['ok' => true, 'task' => sheets_task($get((int)($_GET['id'] ?? 0)))]); }
    if ($a === 'audio') {
        $s = $get((int)($_GET['id'] ?? 0));
        $f = $s['audio_file'] ? brig_one('SELECT * FROM br_files WHERE id = ?', [(int)$s['audio_file']]) : null;
        if (!$f) { linea_fail('Записи нет', 404); }
        brig_send_file($f);
    }
    linea_fail('Неизвестное действие', 404);
}
$in = brig_input();
$id = (int)($in['id'] ?? $_POST['id'] ?? 0);
$s = $get($id);
switch ($a) {
    case 'result':
        if (!in_array($s['status'], ['work', 'new'], true)) { linea_fail('Задание не в работе: ' . $s['status'], 409); }
        $fid = brig_store_upload($_FILES['file'] ?? [], ['pdf'], ['brigade_id' => (int)$s['brigade_id'], 'kind' => 'sheet', 'id' => $id, 'sub' => 'result'], 'worker');
        $set($id, ['status' => 'ready', 'result_file' => $fid, 'ready_at' => $now, 'worker_note' => linea_str($_POST['note'] ?? '', 1000)]);
        brig_audit('worker', 'sheet-ready', 'sheet#' . $id);
        sheets_notify($id);
        linea_json(['ok' => true]);
    case 'question':
        $q = linea_str($in['question'] ?? '', 1000);
        if ($q === '') { linea_fail('Пустой вопрос'); }
        $set($id, ['status' => 'question', 'question' => $q]);
        sheets_notify($id);
        linea_json(['ok' => true]);
    case 'reject':
        $set($id, ['status' => 'rejected', 'worker_note' => linea_str($in['reason'] ?? '', 1000)]);
        sheets_notify($id);
        linea_json(['ok' => true]);
    case 'requeue':
        $set($id, ['status' => 'new', 'claimed_at' => null]);
        linea_json(['ok' => true]);
}
linea_fail('Неизвестное действие', 404);
