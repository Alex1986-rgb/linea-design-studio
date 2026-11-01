<?php
/**
 * api/brigade/sheets.php — «Нужен лист»: бригада на своём объекте просит лист/узел/уточнение к проекту (текстом или голосом).
 *   GET ?j=<объект>           — история запросов листов по объекту, статусы, готовые PDF
 *   POST ?a=create (multipart, CSRF): j, text, room?, wall?, lang?, audio? (webm/ogg/m4a/mp3 до 10 МБ)
 *   POST ?a=answer (JSON, CSRF): {s, answer} — ответ на уточняющий вопрос (запрос возвращается в очередь)
 * Очередь — таблица br_sheet_reqs + зеркало заданий в linea-private/sheet-requests/<id>.json; листы делает воркер GOST-DRAFT
 * на SmartApe через api/brigade/sheet-request.php (протокол — docs/brigady/sheet-request-api.md). Без ПДн клиента в задании.
 * Бесплатно — только внутри активной сделки (договор подтверждён обеими сторонами на сайте, объект «в работе»): это одна из двух
 * опор удержания сделки на платформе (решение Александра 01.11.2026). Вне сделки — отказ с объяснением; платный режим —
 * brig_terms()['sheets_outside_paid'] + 'sheet_price_kop' (выключен). Лимиты — там же (sheets_per_day_job/_brigade, sheets_open_max, sheets_free_limit).
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
    linea_json(['ok' => true, 'sheets' => sheets_list((int)$j['id']), 'rooms' => sheets_rooms((int)$j['request_id']),
        'inDeal' => $j['status'] === 'work', 'terms' => brig_terms_public()]);
}
brig_method('POST');
brig_csrf();
$a = (string)($_GET['a'] ?? '');
$now = linea_now();
if ($a === 'create') {
    $j = sh_job((int)($_POST['j'] ?? 0), $bid);
    $T = brig_terms();
    $source = 'deal'; $bill = null;
    $inDeal = $j['status'] === 'work';
    $over = $inDeal && $T['sheets_free_limit'] !== null
        && (int)db_val("SELECT COUNT(*) FROM br_sheet_reqs WHERE job_id = ? AND (source IS NULL OR source = 'deal') AND status <> 'rejected'", [(int)$j['id']]) >= (int)$T['sheets_free_limit'];
    if (!$inDeal || $over) {
        $why = $over ? 'Бесплатные листы по этому объекту закончились (' . (int)$T['sheets_free_limit'] . ').'
            : ($j['status'] === 'contract' ? 'Листы по запросу бесплатно — только внутри сделки на LINEA: когда условия договора подряда подтвердят на сайте и вы, и заказчик (объект перейдёт в работу). Подтвердите договор в карточке объекта.'
            : 'Объект ' . mb_strtolower(BRIG_JOB_STATUS[$j['status']] ?? $j['status']) . ' — листы по запросу закрыты. Нужен лист по завершённому объекту — напишите в LINEA.');
        if (!$T['sheets_outside_paid']) { linea_fail($why, 403); }
        if (($_POST['paidOk'] ?? '') !== '1') { linea_fail($why . ' Вне сделки лист стоит ' . brig_rub($T['sheet_price_kop']) . ' — подтвердите заказ платного листа.', 402); }
        $source = 'outside'; $bill = $T['sheet_price_kop'];
    }
    $day = date('Y-m-d H:i:s', time() - 86400);
    if ((int)db_val('SELECT COUNT(*) FROM br_sheet_reqs WHERE job_id = ? AND created_at > ?', [(int)$j['id'], $day]) >= (int)$T['sheets_per_day_job']
        || (int)db_val('SELECT COUNT(*) FROM br_sheet_reqs WHERE brigade_id = ? AND created_at > ?', [$bid, $day]) >= (int)$T['sheets_per_day_brigade']) {
        linea_fail('Лимит: ' . (int)$T['sheets_per_day_job'] . ' запросов листов на объект и ' . (int)$T['sheets_per_day_brigade'] . ' на бригаду в сутки', 429);
    }
    if ((int)db_val("SELECT COUNT(*) FROM br_sheet_reqs WHERE job_id = ? AND status IN ('new','work','question')", [(int)$j['id']]) >= (int)$T['sheets_open_max']) { linea_fail('По объекту уже ' . (int)$T['sheets_open_max'] . ' открытых запросов — дождитесь готовых листов', 429); }
    $text = linea_str($_POST['text'] ?? '', 900);   // воркер принимает текст до 1000 знаков (с ответом на вопрос)
    $hasAudio = isset($_FILES['audio']) && ($_FILES['audio']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK;
    // голос на сервере листов пока не расшифровывается (нет whisper): текст обязателен; запись — приложение к тексту
    if ($text === '') { linea_fail($hasAudio ? 'Голосовую запись без текста сервер листов пока не расшифровывает. Нажмите «Надиктовать» — речь сразу станет текстом, — или напишите, что нужно' : 'Напишите или надиктуйте, какой лист нужен'); }
    $id = db_insert('br_sheet_reqs', ['job_id' => (int)$j['id'], 'brigade_id' => $bid, 'status' => 'new', 'text' => $text,
        'room' => linea_str($_POST['room'] ?? '', 60), 'wall' => preg_match('/^[A-DА-Г]?$/u', (string)($_POST['wall'] ?? '')) ? (string)($_POST['wall'] ?? '') : '',
        'lang' => preg_match('/^[a-z]{2}$/', (string)($_POST['lang'] ?? 'ru')) ? (string)$_POST['lang'] : 'ru', 'created_at' => $now, 'updated_at' => $now,
        'source' => $source, 'billable_kop' => $bill]);
    if ($bill) { brig_admin_notify('платный лист вне сделки', 'Бригада #' . $bid . ' заказала лист вне сделки на ' . brig_rub($bill) . ' (запрос #' . $id . ')', brig_link('api/admin-brigady.php?view=sheets'), (bool)$j['rtest']); }
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
    $ans = linea_str($in['answer'] ?? '', 300);
    if ($ans === '') { linea_fail('Пустой ответ'); }
    db_update('br_sheet_reqs', ['answer' => $ans, 'status' => 'new', 'updated_at' => $now], 'id = ?', [(int)$s['id']]);
    sheets_mirror((int)$s['id']);
    linea_json(['ok' => true, 'sheets' => sheets_list((int)$s['job_id'])]);
}
linea_fail('Неизвестное действие', 404);
