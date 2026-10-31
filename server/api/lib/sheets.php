<?php
/**
 * «Лист по запросу»: общие функции очереди (кабинет бригады и воркер). Протокол — docs/brigady/sheet-request-api.md.
 * Задание для воркера НЕ содержит ПДн клиента: номер заказа, слаг объекта (папка проекта GOST-DRAFT), текст бригады,
 * помещение/стена, язык, ссылка на аудио (только через воркер-токен).
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

function sheets_dir(): string { $d = linea_private() . '/sheet-requests'; linea_mkdir($d); return $d; }

/** Задание в формате протокола (v1). */
function sheets_task(array $s): array
{
    $r = brig_one('SELECT r.id rid, r.pack, r.object_title, o.number FROM br_jobs j JOIN br_requests r ON r.id = j.request_id JOIN orders o ON o.id = r.order_id WHERE j.id = ?', [(int)$s['job_id']]);
    $pack = json_decode((string)($r['pack'] ?? ''), true) ?: [];
    return [
        'v' => 1, 'id' => (int)$s['id'], 'status' => $s['status'], 'order' => (string)($r['number'] ?? ''), 'objectSlug' => (string)($pack['slug'] ?? ''),
        'object' => (string)($r['object_title'] ?? ''), 'text' => (string)$s['text'], 'room' => (string)$s['room'], 'wall' => (string)$s['wall'], 'lang' => (string)$s['lang'],
        'audio' => $s['audio_file'] ? ['id' => (int)$s['audio_file'], 'url' => 'sheets-worker.php?a=audio&id=' . (int)$s['id']] : null,
        'question' => (string)$s['question'], 'answer' => (string)$s['answer'], 'createdAt' => $s['created_at'],
        'history' => array_map(fn($h) => ['id' => (int)$h['id'], 'text' => $h['text'], 'status' => $h['status']],
            brig_all('SELECT id, text, status FROM br_sheet_reqs WHERE job_id = ? AND id <> ? ORDER BY id DESC LIMIT 10', [(int)$s['job_id'], (int)$s['id']])),
    ];
}

/** Зеркало очереди: linea-private/sheet-requests/<id>.json (база — источник истины). */
function sheets_mirror(int $id): void
{
    $s = brig_one('SELECT * FROM br_sheet_reqs WHERE id = ?', [$id]);
    if (!$s) { return; }
    $f = sheets_dir() . '/' . $id . '.json';
    file_put_contents($f, json_encode(sheets_task($s), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
    chmod($f, 0600);
}

function sheets_list(int $jobId): array
{
    return array_map(fn($s) => ['id' => (int)$s['id'], 'status' => $s['status'], 'statusText' => BRIG_SHEET_STATUS[$s['status']] ?? $s['status'], 'text' => $s['text'],
        'room' => (string)$s['room'], 'wall' => (string)$s['wall'], 'audio' => $s['audio_file'] ? (int)$s['audio_file'] : null, 'result' => $s['result_file'] ? (int)$s['result_file'] : null,
        'question' => (string)$s['question'], 'answer' => (string)$s['answer'], 'note' => (string)$s['worker_note'], 'created' => $s['created_at'], 'ready' => $s['ready_at']],
        brig_all('SELECT * FROM br_sheet_reqs WHERE job_id = ? ORDER BY id DESC', [$jobId]));
}

function sheets_rooms(int $requestId): array
{
    $pack = json_decode((string)db_val('SELECT pack FROM br_requests WHERE id = ?', [$requestId]), true) ?: [];
    return array_values(array_filter(array_map(fn($r) => (string)($r['name'] ?? ''), $pack['rooms'] ?? [])));
}

/** Сообщить бригаде о смене статуса листа. */
function sheets_notify(int $id): void
{
    $s = brig_one('SELECT s.status, b.email, b.contact_name, b.test, r.object_title, r.test rtest FROM br_sheet_reqs s JOIN br_brigades b ON b.id = s.brigade_id JOIN br_jobs j ON j.id = s.job_id JOIN br_requests r ON r.id = j.request_id WHERE s.id = ?', [$id]);
    if ($s) { brig_mail((string)$s['email'], 'brig_sheet', ['name' => $s['contact_name'], 'object' => $s['object_title'], 'status' => BRIG_SHEET_STATUS[$s['status']] ?? $s['status'], 'link' => brig_link('brigada/')], (bool)$s['test'] || (bool)$s['rtest']); }
}
