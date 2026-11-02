<?php
/**
 * api/brigade/jobs.php — объекты бригады (выбранные клиентами предложения). Только свои: чужой объект — 403.
 *   GET              — список объектов
 *   GET ?j=<id>      — объект: контакты клиента (только когда открыты — brig_terms()['contacts_after'], по умолчанию после
 *                      подтверждения договора обеими сторонами), лента сообщений, предложение, этапы, фото, замечания, споры, вознаграждение
 *   POST (CSRF): ?a=sign {j} — «условия договора подтверждаю»; ?a=msg {j, text}; ?a=cancel {j, reason} — отказ до подтверждения;
 *                ?a=stage_photo (multipart: stage, file); ?a=stage_ready {stage};
 *                ?a=remark_close {remark, note}; ?a=dispute {j, subject, text}; ?a=dispute_msg {d, text}
 *                ?a=advance {j} — «аванс получен» (сразу «к оплате»); ?a=advance_dispute {j, reason} — оспорить отметку заказчика (В-2);
 *                ?a=terminate {j, reason, extra?, extraNote?} — предложить расторжение (акт о принятом объёме);
 *                ?a=stage_start {stage} — «Начать работу» по этапу (этап 1 — одна из дат «к оплате», К-1)
 */
declare(strict_types=1);
if (!defined('LINEA_BRIGADA')) { http_response_code(404); exit; }   // модуль api/brigada.php?m=…, напрямую не открывается
require_once __DIR__ . '/../boot.php';
require_once __DIR__ . '/../brigada.php';

brig_https();
$b = brig_me();
brig_need($b, 'jobs');
$bid = (int)$b['id'];

function job_own(int $jid, int $bid): array
{
    $j = brig_one('SELECT j.*, r.order_id, r.object_title, r.district, r.area, r.test rtest FROM br_jobs j JOIN br_requests r ON r.id = j.request_id WHERE j.id = ?', [$jid]);
    if (!$j || (int)$j['brigade_id'] !== $bid || !brig_job_allowed(brig_ctx(), $jid)) { linea_fail('Это не ваш объект', 403); }
    return $j;
}

function job_client(array $j): array
{
    // контакты клиента — только выбранной бригаде, после согласия клиента на передачу (отметка при выборе) и открытия контактов
    if (!$j['contacts_consent_at'] || !brig_contacts_open($j)) { return ['hidden' => true, 'order' => '']; }
    $o = db_one('SELECT number, name, phone, email, contact FROM orders WHERE id = ?', [(int)$j['order_id']]);
    $bf = linea_private() . '/orders/' . ($o['number'] ?? '') . '/brief.json';
    $brief = is_file($bf) ? (json_decode((string)file_get_contents($bf), true) ?: []) : [];
    return ['name' => (string)($o['name'] ?? ''), 'phone' => (string)($o['phone'] ?? ''), 'email' => (string)($o['email'] ?? ''), 'contact' => (string)($o['contact'] ?? ''),
        'address' => linea_str($brief['object']['address'] ?? '', 200), 'order' => (string)($o['number'] ?? '')];
}

function job_disputes(int $jid): array
{
    return array_map(fn($d) => ['id' => (int)$d['id'], 'subject' => $d['subject'], 'status' => $d['status'], 'openedBy' => $d['opened_by'], 'resolution' => (string)$d['resolution'],
        'messages' => array_map(fn($m) => ['who' => $m['who'], 'text' => $m['text'], 'at' => $m['at']], brig_all('SELECT * FROM br_dispute_msgs WHERE dispute_id = ? ORDER BY id', [(int)$d['id']]))],
        brig_all('SELECT * FROM br_disputes WHERE job_id = ? ORDER BY id', [$jid]));
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $jid = (int)($_GET['j'] ?? 0);
    if ($jid) {
        $j = job_own($jid, $bid);
        brig_commission_due_check($jid);
        $j = job_own($jid, $bid);
        $o = brig_one('SELECT * FROM br_offers WHERE id = ?', [(int)$j['offer_id']]);
        linea_json(['ok' => true, 'job' => [
            'id' => $jid, 'status' => $j['status'], 'statusText' => BRIG_JOB_STATUS[$j['status']] ?? $j['status'], 'object' => (string)$j['object_title'],
            'district' => BRIG_DISTRICTS[$j['district']] ?? $j['district'], 'area' => $j['area'] !== null ? (float)$j['area'] : null,
            'client' => job_client($j), 'contactsOpen' => brig_contacts_open($j), 'terms' => brig_terms_public(), 'rateText' => brig_rate_text($j['commission_rate'] !== null ? (float)$j['commission_rate'] : brig_rate_for($bid)), 'messages' => brig_messages($jid),
            'canCancel' => $j['status'] === 'contract' && !brig_contacts_open($j), 'docs' => brig_deal_docs($j),
            'clientSigned' => $j['client_signed_at'], 'brigadeSigned' => $j['brigade_signed_at'],
            'total' => (int)$o['total_kop'] / 100, 'commission' => $j['commission_kop'] !== null ? (int)$j['commission_kop'] / 100 : null,
            'commissionDueAt' => $j['commission_due_at'], 'commissionDueWhy' => (string)$j['commission_due_why'],
            'advanceAt' => $j['advance_at'], 'advanceBy' => $j['advance_by'], 'advanceState' => $j['advance_state'], 'debt' => brig_debt($bid),
            'stages' => brig_job_stages($jid), 'disputes' => job_disputes($jid), 'requestId' => (int)$j['request_id'],
            'payments' => brig_can($b, 'money') ? brig_pay_list($jid) : null, 'paySummary' => brig_can($b, 'money') ? brig_pay_summary($jid) : null,
            'frozen' => $j['frozen_at'] ? (string)$j['frozen_reason'] : null, 'role' => brig_role($b),
            'can' => ['sign' => brig_can($b, 'sign'), 'money' => brig_can($b, 'money'), 'msg' => brig_can($b, 'msg'), 'stage' => brig_can($b, 'stage'), 'photo' => brig_can($b, 'photo'), 'sheets' => brig_can($b, 'sheets')],
            'beforePhotos' => array_map(fn($f) => ['id' => (int)$f['id'], 'stage' => (int)$f['owner_id']], brig_all("SELECT f.id, f.owner_id FROM br_files f JOIN br_stages s ON s.id = f.owner_id WHERE f.owner_kind = 'stage_before' AND s.job_id = ? ORDER BY f.id", [$jid])),
            'stageItems' => array_map(fn($f) => ['id' => (int)$f['id'], 'stage' => (int)$f['owner_id'], 'item' => (int)substr((string)$f['title'], 5)], brig_all("SELECT f.id, f.owner_id, f.title FROM br_files f JOIN br_stages s ON s.id = f.owner_id WHERE f.owner_kind = 'stage' AND f.title LIKE 'item:%' AND s.job_id = ?", [$jid])),
            'hiddenStages' => array_values(array_map(fn($s) => (int)$s['id'], array_filter(brig_all('SELECT id, checklist FROM br_stages WHERE job_id = ?', [$jid]), 'brig_stage_hidden'))),
            'startPhotos' => BRIG_START_PHOTOS, 'readyPhotos' => BRIG_READY_PHOTOS,
        ]]);
    }
    $list = array_map(fn($j) => ['id' => (int)$j['id'], 'object' => (string)$j['object_title'], 'status' => $j['status'], 'statusText' => BRIG_JOB_STATUS[$j['status']] ?? $j['status'],
        'total' => (int)$j['total_kop'] / 100, 'created' => $j['created_at']],
        array_values(array_filter(brig_all('SELECT j.*, r.object_title, o.total_kop FROM br_jobs j JOIN br_requests r ON r.id = j.request_id JOIN br_offers o ON o.id = j.offer_id WHERE j.brigade_id = ? ORDER BY j.id DESC', [$bid]), fn($j) => brig_job_allowed($b, (int)$j['id']))));
    linea_json(['ok' => true, 'jobs' => $list]);
}

brig_method('POST');
brig_csrf();
$in = brig_input();
$a = (string)($_GET['a'] ?? '');
$now = linea_now();

/** Этап своего объекта. */
function stage_own(int $sid, int $bid): array
{
    $s = brig_one('SELECT s.*, j.brigade_id, j.status jstatus, r.order_id, j.id jid, r.object_title, r.test rtest FROM br_stages s JOIN br_jobs j ON j.id = s.job_id JOIN br_requests r ON r.id = j.request_id WHERE s.id = ?', [$sid]);
    if (!$s || (int)$s['brigade_id'] !== $bid || !brig_job_allowed(brig_ctx(), (int)$s['jid'])) { linea_fail('Это не ваш объект', 403); }
    if (db_val('SELECT frozen_at FROM br_jobs WHERE id = ?', [(int)$s['jid']])) { linea_fail('Сделка приостановлена LINEA — действия по этапам на паузе. Лента и разногласия работают', 423); }
    return $s;
}

// права людей бригады (спецификация 1.2) и значимые действия — после входа кодом не старше fresh_code_hours (4.0)
$need = ['sign' => 'sign', 'addendum' => 'sign', 'terminate' => 'sign', 'addendum_cancel' => 'sign', 'cancel' => 'sign', 'advance' => 'money', 'advance_dispute' => 'money', 'pay' => 'money', 'pay_contest' => 'money',
    'dispute' => 'sign', 'msg' => 'msg', 'stage_photo' => 'photo', 'stage_ready' => 'stage', 'stage_start' => 'stage', 'remark_close' => 'remark', 'sign_ask' => 'sign_ask'];
if (isset($need[$a])) { brig_need($b, $need[$a]); }
if (in_array($a, ['addendum', 'terminate', 'advance', 'advance_dispute', 'pay', 'pay_contest', 'dispute', 'stage_ready', 'cancel'], true)) { kab_require_fresh(); }
if (isset($in['j']) && !in_array($a, ['msg', 'dispute', 'dispute_msg', 'sign_ask'], true)) { deal_require_not_frozen(job_own((int)$in['j'], $bid)); }
$WHO = brig_who($b);

switch ($a) {
    case 'sign_ask':   // бригадир: «Попросить владельца подписать»
        $j = job_own((int)($in['j'] ?? 0), $bid);
        brig_notice($bid, (int)$j['id'], 'obekty', ($b['_name'] ?: 'Бригадир') . ' просит подписать документ по объекту «' . $j['object_title'] . '»', '#/obekt/' . $j['id'] . '/dogovor');
        brig_audit($WHO, 'sign-ask', 'job#' . $j['id']);
        linea_json(['ok' => true, 'message' => 'Владелец получил уведомление в кабинете']);
    case 'pay':   // реестр оплат: «получено» по строке плана (p) или новая отметка {kind, amount, stage}; по отметке заказчика — подтверждение
        $j = job_own((int)($in['j'] ?? 0), $bid);
        linea_json(['ok' => true, 'payment' => brig_pay_mark($j, 'brigade', $in, $WHO), 'payments' => brig_pay_list((int)$j['id'])]);
    case 'pay_contest':
        $j = job_own((int)($in['j'] ?? 0), $bid);
        brig_pay_contest($j, 'brigade', (int)($in['p'] ?? 0), (string)($in['note'] ?? ''), $WHO);
        linea_json(['ok' => true, 'payments' => brig_pay_list((int)$j['id'])]);
    case 'sign':   // подпись договора/допсоглашения на сайте (ПЭП): без кода — код на почту бригады, с кодом — подпись
        $j = job_own((int)($in['j'] ?? 0), $bid);
        if ($j['status'] === 'cancelled') { linea_fail('Объект отменён'); }
        $c = brig_sign_doc($j, (int)($in['doc'] ?? 0));
        if (trim((string)($in['code'] ?? '')) === '') {
            $dev = brig_sign_send($c, 'brigade', (string)$b['email'], (bool)$b['test'] || (bool)$j['rtest']);
            linea_json(['ok' => true, 'codeSent' => true, 'doc' => (int)$c['id']] + ($dev !== '' ? ['devCode' => $dev] : []));
        }
        brig_sign_confirm($c, 'brigade', (string)$in['code'], ($in['pep'] ?? false) === true, $WHO);
        linea_json(['ok' => true]);
    case 'addendum':
        $j = job_own((int)($in['j'] ?? 0), $bid);
        $id = brig_addendum_propose($j, $in, $WHO, ['who' => $WHO, 'job_id' => (int)$j['id'], 'brigade_id' => $bid]);
        brig_audit($WHO, 'addendum-propose', 'job#' . $j['id'], 'Подрядчик предложил допсоглашение');
        linea_json(['ok' => true, 'doc' => $id]);
    case 'terminate':   // предложить расторжение: соглашение и акт о выполненном и принятом объёме, подпись кодом обеих сторон
        $j = job_own((int)($in['j'] ?? 0), $bid);
        $id = brig_termination_propose($j, 'brigade', $in, $WHO, ['who' => $WHO, 'job_id' => (int)$j['id'], 'brigade_id' => $bid]);
        linea_json(['ok' => true, 'doc' => $id]);
    case 'addendum_cancel':
        $j = job_own((int)($in['j'] ?? 0), $bid);
        brig_addendum_cancel($j, (int)($in['doc'] ?? 0), $WHO);
        linea_json(['ok' => true]);
    case 'msg':
        $j = job_own((int)($in['j'] ?? 0), $bid);
        if ($j['status'] === 'cancelled') { linea_fail('Объект отменён'); }
        brig_message_add($j, 'brigade', (string)($in['text'] ?? ''), ['who' => $WHO, 'request_id' => (int)$j['request_id']]);
        linea_json(['ok' => true, 'messages' => brig_messages((int)$j['id'])]);
    case 'cancel':
        $j = job_own((int)($in['j'] ?? 0), $bid);
        brig_job_cancel($j, 'brigade', $WHO, (string)($in['reason'] ?? ''));
        brig_admin_notify('бригада отказалась после выбора', 'Бригада #' . $bid . ' отказалась от объекта до подтверждения договора', brig_link('api/admin-brigady.php?view=signals'), (bool)$j['rtest']);
        linea_json(['ok' => true]);
    case 'stage_photo':
        if (!linea_rate('brg-upload', (int)brig_cfg('brig_uploads_per_hour', 120))) { linea_fail('Слишком много загрузок за час — подождите', 429); }
        $s = stage_own((int)($_POST['stage'] ?? 0), $bid);
        if ($s['jstatus'] !== 'work') { linea_fail('Фото этапов — после подписания договора обеими сторонами'); }
        $kind = ($_POST['kind'] ?? '') === 'before' ? 'stage_before' : 'stage';   // «до» — снимки объекта перед стартом этапа
        if ($kind === 'stage_before' && $s['started_at']) { linea_fail('Работа по этапу уже начата — добавляйте фото этапа'); }
        if ((int)db_val('SELECT COUNT(*) FROM br_files WHERE owner_kind = ? AND owner_id = ?', [$kind, (int)$s['id']]) >= 40) { linea_fail('Не больше 40 фото на этап'); }
        $id = brig_store_upload($_FILES['file'] ?? [], ['img', 'pdf'], ['brigade_id' => $bid, 'kind' => $kind, 'id' => (int)$s['id'], 'sub' => 'stage'], $WHO);
        if (isset($_POST['item']) && $_POST['item'] !== '' && $kind === 'stage') { db_update('br_files', ['title' => 'item:' . max(0, min(30, (int)$_POST['item']))], 'id = ?', [$id]); }   // фото к пункту чек-листа
        linea_json(['ok' => true, 'file' => $id]);
    case 'stage_ready':
        $s = stage_own((int)($in['stage'] ?? 0), $bid);
        if ($s['jstatus'] !== 'work') { linea_fail('Объект не в работе'); }
        if (!in_array($s['status'], ['plan', 'work', 'returned'], true)) { linea_fail('Этап уже ' . mb_strtolower(BRIG_STAGE_STATUS[$s['status']])); }
        if ((int)db_val('SELECT COUNT(*) FROM br_remarks WHERE stage_id = ? AND closed_at IS NULL', [(int)$s['id']]) > 0) { linea_fail('Сначала закройте замечания клиента — с комментарием, что сделано'); }
        $np = (int)db_val("SELECT COUNT(*) FROM br_files WHERE owner_kind = 'stage' AND owner_id = ?", [(int)$s['id']]);
        if ($np < BRIG_READY_PHOTOS) { linea_fail('Добавьте фото этапа: нужно не меньше ' . BRIG_READY_PHOTOS . ' (сейчас ' . $np . ') — заказчик принимает по фото и на месте'); }
        if (brig_stage_hidden($s) && (int)db_val("SELECT COUNT(*) FROM br_files WHERE owner_kind = 'stage' AND owner_id = ? AND title LIKE 'item:%'", [(int)$s['id']]) < 1) { linea_fail('Скрытые работы: приложите фото к пунктам чек-листа до закрытия (трассы, опрессовка, пролив)'); }
        db_update('br_stages', ['status' => 'ready', 'ready_at' => $now], 'id = ?', [(int)$s['id']]);
        db_insert('br_messages', ['job_id' => (int)$s['jid'], 'who' => 'system', 'text' => 'Бригада сдала этап ' . (int)$s['idx'] . ' «' . $s['name'] . '» — ждёт приёмки заказчиком (фото — ' . $np . ').', 'masked' => 0, 'at' => $now]);
        brig_exec('UPDATE br_stages SET started_at = ? WHERE id = ? AND started_at IS NULL', [$now, (int)$s['id']]);
        brig_commission_due_check((int)$s['jid'], $WHO);
        brig_audit($WHO, 'stage-ready', 'stage#' . $s['id'], $s['name']);
        $o = db_one('SELECT email, token, test FROM orders WHERE id = ?', [(int)$s['order_id']]);
        if ($o) { kab_notice_order(db_one('SELECT * FROM orders WHERE id = ?', [(int)$s['order_id']]), 'remont', 'Бригада сдала этап «' . $s['name'] . '» — примите по чек-листу или верните с замечаниями', '', 'stage-ready-' . $s['id'] . '-' . $now); brig_mail((string)$o['email'], 'client_stage_ready', ['stage' => $s['name'], 'link' => brig_link('kabinet/#t=' . $o['token'])], (bool)$o['test'] || (bool)$s['rtest']); }
        linea_json(['ok' => true]);
    case 'advance':   // бригада: «аванс получен» — или подтверждение отметки заказчика (теперь строка реестра оплат)
        $j = job_own((int)($in['j'] ?? 0), $bid);
        if ($j['status'] !== 'work') { linea_fail('Аванс отмечается, когда договор подписан и объект в работе'); }
        if ($j['advance_state'] === 'confirmed') { linea_fail('Аванс уже подтверждён'); }
        $adv = brig_one("SELECT * FROM br_payments WHERE job_id = ? AND kind = 'advance' AND status IN ('planned','declared','contested') ORDER BY id LIMIT 1", [(int)$j['id']]);
        brig_pay_mark($j, 'brigade', $adv ? ['p' => (int)$adv['id'], 'zeroOk' => true] : ['kind' => 'advance', 'amount' => (float)($in['amount'] ?? 0), 'zeroOk' => true], $WHO);
        brig_audit($WHO, 'advance', 'job#' . $j['id'], $j['advance_at'] ? 'Подрядчик подтвердил получение аванса' : 'Подрядчик: аванс получен');
        linea_json(['ok' => true]);
    case 'advance_dispute':   // бригада: «аванс не получал» — отметка заказчика оспорена, в админку сигнал (В-2)
        $j = job_own((int)($in['j'] ?? 0), $bid);
        if ($j['advance_state'] !== 'declared') { linea_fail('Оспорить можно только неподтверждённую отметку заказчика'); }
        $adv = brig_one("SELECT * FROM br_payments WHERE job_id = ? AND kind = 'advance' AND status = 'declared' ORDER BY id LIMIT 1", [(int)$j['id']]);
        if (!$adv) { linea_fail('Нет отметки аванса'); }
        brig_pay_contest($j, 'brigade', (int)$adv['id'], (string)($in['reason'] ?? ''), $WHO);
        brig_audit($WHO, 'advance', 'job#' . $j['id'], 'Подрядчик оспорил отметку аванса');
        linea_json(['ok' => true]);
    case 'stage_start':   // «Начать работу» по этапу: этап 1 и скрытые работы — с фото «до» (доказательство для разногласий); скрытые — по порядку
        $s = stage_own((int)($in['stage'] ?? 0), $bid);
        if ($s['jstatus'] !== 'work') { linea_fail('Объект не в работе'); }
        if ($s['started_at']) { linea_fail('Работа по этапу уже начата'); }
        if (!in_array($s['status'], ['work', 'plan'], true)) { linea_fail('Этап уже ' . mb_strtolower(BRIG_STAGE_STATUS[$s['status']] ?? $s['status'])); }
        $nb = (int)db_val("SELECT COUNT(*) FROM br_files WHERE owner_kind = 'stage_before' AND owner_id = ?", [(int)$s['id']]);
        if (((int)$s['idx'] === 1 || brig_stage_hidden($s)) && $nb < BRIG_START_PHOTOS) { linea_fail('Сфотографируйте объект перед началом: нужно не меньше ' . BRIG_START_PHOTOS . ' фото «до» (сейчас ' . $nb . '). Снимки хранятся у LINEA и видны заказчику'); }
        foreach (brig_all('SELECT * FROM br_stages WHERE job_id = ? AND idx < ? ORDER BY idx', [(int)$s['jid'], (int)$s['idx']]) as $prev) {
            if (brig_stage_hidden($prev) && !in_array($prev['status'], ['accepted', 'paid'], true)) { linea_fail('Сначала заказчик принимает скрытые работы этапа «' . $prev['name'] . '» — потом их можно закрывать следующим этапом'); }
        }
        brig_exec("UPDATE br_stages SET started_at = ?, status = CASE WHEN status = 'plan' THEN 'work' ELSE status END WHERE id = ? AND started_at IS NULL", [$now, (int)$s['id']]);
        brig_audit($WHO, 'stage-start', 'job#' . $s['jid'], 'Начата работа: этап ' . (int)$s['idx'] . ' «' . $s['name'] . '»');
        db_insert('br_messages', ['job_id' => (int)$s['jid'], 'who' => 'system', 'text' => 'Бригада начала работу: этап ' . (int)$s['idx'] . ' «' . $s['name'] . '»' . ($nb ? ', фото «до» — ' . $nb : '') . '.', 'masked' => 0, 'at' => $now]);
        brig_commission_due_check((int)$s['jid'], $WHO);
        linea_json(['ok' => true]);
    case 'remark_close':
        $r = brig_one('SELECT * FROM br_remarks WHERE id = ?', [(int)($in['remark'] ?? 0)]);
        if (!$r) { linea_fail('Нет такого замечания', 404); }
        stage_own((int)$r['stage_id'], $bid);
        $sj = stage_own((int)$r['stage_id'], $bid);
        $note = brig_guard(linea_str($in['note'] ?? '', 1000), brig_contacts_open(brig_one('SELECT * FROM br_jobs WHERE id = ?', [(int)$sj['jid']]) ?? []), ['who' => $WHO, 'field' => 'замечание', 'job_id' => (int)$sj['jid'], 'brigade_id' => $bid]);
        if ($note === '') { linea_fail('Напишите, что сделано по замечанию'); }
        db_update('br_remarks', ['closed_at' => $now, 'close_note' => $note], 'id = ?', [(int)$r['id']]);
        brig_audit($WHO, 'remark-close', 'remark#' . $r['id']);
        linea_json(['ok' => true]);
    case 'dispute':
        $j = job_own((int)($in['j'] ?? 0), $bid);
        $gctx = ['who' => $WHO, 'field' => 'спор', 'job_id' => (int)$j['id'], 'brigade_id' => $bid];
        $subj = brig_guard(linea_str($in['subject'] ?? '', 120), brig_contacts_open($j), $gctx); $text = brig_guard(linea_str($in['text'] ?? '', 3000), brig_contacts_open($j), $gctx);
        if ($subj === '' || $text === '') { linea_fail('Опишите суть спора'); }
        $d = db_insert('br_disputes', ['job_id' => (int)$j['id'], 'opened_by' => 'brigade', 'subject' => $subj, 'status' => 'open', 'created_at' => $now]);
        db_insert('br_dispute_msgs', ['dispute_id' => $d, 'who' => 'brigade', 'text' => $text, 'at' => $now]);
        brig_audit($WHO, 'dispute-open', 'job#' . $j['id'], $subj);
        brig_admin_notify('спор по объекту', 'Бригада открыла спор: ' . $subj, brig_link('api/admin-brigady.php?view=disputes'), (bool)$j['rtest']);
        linea_json(['ok' => true]);
    case 'dispute_msg':
        $d = brig_one('SELECT * FROM br_disputes WHERE id = ?', [(int)($in['d'] ?? 0)]);
        if (!$d) { linea_fail('Нет такого спора', 404); }
        $dj = job_own((int)$d['job_id'], $bid);
        if ($d['status'] !== 'open') { linea_fail('Спор закрыт'); }
        $text = brig_guard(linea_str($in['text'] ?? '', 3000), brig_contacts_open($dj), ['who' => $WHO, 'field' => 'спор', 'job_id' => (int)$dj['id'], 'brigade_id' => $bid]);
        if ($text === '') { linea_fail('Пустое сообщение'); }
        db_insert('br_dispute_msgs', ['dispute_id' => (int)$d['id'], 'who' => 'brigade', 'text' => $text, 'at' => $now]);
        linea_json(['ok' => true]);
}
linea_fail('Неизвестное действие', 404);
