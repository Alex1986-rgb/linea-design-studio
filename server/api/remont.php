<?php
/**
 * api/remont.php?t=<токен заказа> — «Ремонт по проекту» для клиента (страница заказа order.html, js/remont.js).
 * Доступ — только по токену своего заказа (без пароля); CSRF — HMAC от токена (выдаётся в GET, заголовок X-CSRF).
 *   GET                         — состояние: можно ли подобрать, запрос, сравнение предложений, выбранная бригада, этапы, отзыв
 *   POST ?a=request  {district, startWish, consent:true}  — подобрать бригаду (согласие на передачу ОБЕЗЛИЧЕННОГО проекта)
 *   POST ?a=invite   {slug}      — пригласить бригаду из каталога в свой запрос (до 5)
 *   POST ?a=cancel               — отказаться от подбора (до выбора)
 *   POST ?a=choose   {offer, consentContacts:true} — выбрать предложение (согласие передать контакты выбранной бригаде)
 *   POST ?a=sign                 — «договор подряда подписан»
 *   POST ?a=stage_accept {stage, checks:[…]} / ?a=stage_return {stage, remarks}
 *   POST ?a=review {rating 1–5, text} — только после завершения объекта, один раз
 *   POST ?a=dispute {subject, text} / ?a=dispute_msg {d, text}
 * Проект без бригады — нормальный путь: подбор необязателен.
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/brig.php';

brig_https();
$token = (string)($_GET['t'] ?? '');
$o = linea_order_by_token($token);
if (!$o) { linea_fail('Заказ не найден — проверьте ссылку', 404); }
brig_db();
$oid = (int)$o['id'];
$test = (bool)$o['test'];

function rm_state(array $o, string $token): array
{
    $oid = (int)$o['id'];
    $r = brig_one('SELECT * FROM br_requests WHERE order_id = ?', [$oid]);
    $out = ['ok' => true, 'csrf' => brig_client_csrf($token), 'eligible' => in_array($o['status'], ['paid', 'delivered'], true),
        'districts' => BRIG_DISTRICTS, 'terms' => BRIG_CLIENT_TERMS, 'request' => null, 'offers' => [], 'job' => null];
    if (!$r) { return $out; }
    $pack = json_decode((string)$r['pack'], true) ?: ['positions' => []];
    $out['request'] = ['status' => $r['status'], 'statusText' => BRIG_REQ_STATUS[$r['status']] ?? $r['status'], 'district' => BRIG_DISTRICTS[$r['district']] ?? $r['district'],
        'works' => array_map(fn($k) => BRIG_SPECS[$k] ?? $k, json_decode($r['works'], true) ?: []), 'deadline' => $r['deadline_at'], 'sent' => (bool)$r['sent_at'],
        'positions' => $pack['positions'] ?? [], 'hasPack' => !empty($pack['positions']),
        'invited' => array_map(fn($i) => ['name' => $i['name'], 'slug' => $i['slug'], 'source' => $i['source']],
            brig_all("SELECT b.name, b.slug, i.source FROM br_invites i JOIN br_brigades b ON b.id = i.brigade_id WHERE i.request_id = ? AND i.source = 'client'", [(int)$r['id']])),
        'invitedCount' => (int)db_val('SELECT COUNT(*) FROM br_invites WHERE request_id = ? AND sent_at IS NOT NULL', [(int)$r['id']]),
        'packFiles' => array_map(fn($f) => ['id' => (int)$f['id'], 'title' => (string)$f['title'], 'mime' => $f['mime']], brig_all("SELECT id, title, mime FROM br_files WHERE owner_kind = 'pack' AND owner_id = ?", [(int)$r['id']]))];
    // сравнение: предложения показываются, когда их ≥ 1; контактов бригад здесь нет — они открываются после выбора
    foreach (brig_all("SELECT b.*, o.id oid, o.status ostatus, o.items, o.total_kop, o.days, o.start_date, o.warranty_months owarranty, o.materials, o.materials_note, o.stages, o.comment FROM br_offers o JOIN br_brigades b ON b.id = o.brigade_id WHERE o.request_id = ? AND o.status IN ('submitted','chosen','rejected') ORDER BY o.total_kop", [(int)$r['id']]) as $x) {
        $out['offers'][] = ['id' => (int)$x['oid'], 'status' => $x['ostatus'], 'brigade' => brig_public_card($x), 'items' => json_decode($x['items'], true) ?: [], 'total' => (int)$x['total_kop'] / 100,
            'days' => (int)$x['days'], 'startDate' => $x['start_date'], 'warrantyMonths' => (int)$x['owarranty'], 'materials' => BRIG_MATERIALS[$x['materials']] ?? $x['materials'],
            'materialsNote' => (string)$x['materials_note'], 'stages' => json_decode($x['stages'], true) ?: [], 'comment' => (string)$x['comment']];
    }
    $j = brig_one('SELECT * FROM br_jobs WHERE request_id = ?', [(int)$r['id']]);
    if ($j) {
        $b = brig_one('SELECT * FROM br_brigades WHERE id = ?', [(int)$j['brigade_id']]);
        $rev = brig_one('SELECT rating, text, hidden FROM br_reviews WHERE job_id = ?', [(int)$j['id']]);
        $out['job'] = ['id' => (int)$j['id'], 'status' => $j['status'], 'statusText' => BRIG_JOB_STATUS[$j['status']] ?? $j['status'],
            'brigade' => brig_public_card($b) + ['phone' => $b['phone'], 'email' => $b['email'], 'contact' => $b['contact_name'], 'legalFull' => (BRIG_LEGAL[$b['legal']] ?? '') . ', ИНН ' . $b['inn']],
            'clientSigned' => $j['client_signed_at'], 'brigadeSigned' => $j['brigade_signed_at'], 'stages' => brig_job_stages((int)$j['id']),
            'review' => $rev ? ['rating' => (int)$rev['rating'], 'text' => (string)$rev['text'], 'hidden' => (bool)$rev['hidden']] : null,
            'canReview' => $j['status'] === 'done' && !$rev,
            'disputes' => array_map(fn($d) => ['id' => (int)$d['id'], 'subject' => $d['subject'], 'status' => $d['status'], 'resolution' => (string)$d['resolution'],
                'messages' => array_map(fn($m) => ['who' => $m['who'], 'text' => $m['text'], 'at' => $m['at']], brig_all('SELECT * FROM br_dispute_msgs WHERE dispute_id = ? ORDER BY id', [(int)$d['id']]))],
                brig_all('SELECT * FROM br_disputes WHERE job_id = ? ORDER BY id', [(int)$j['id']]))];
    }
    return $out;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') { linea_json(rm_state($o, $token)); }
brig_method('POST');
brig_client_csrf_check($token);
if (!linea_rate('remont', 200)) { linea_fail('Слишком много действий — подождите', 429); }
$in = brig_input();
$a = (string)($_GET['a'] ?? '');
$now = linea_now();
$r = brig_one('SELECT * FROM br_requests WHERE order_id = ?', [$oid]);
$j = $r ? brig_one('SELECT * FROM br_jobs WHERE request_id = ?', [(int)$r['id']]) : null;
$who = 'client:' . $o['number'];

/** Этап своего объекта (клиент). */
$stage = function (int $sid) use ($j): array {
    $s = $j ? brig_one('SELECT * FROM br_stages WHERE id = ? AND job_id = ?', [$sid, (int)$j['id']]) : null;
    if (!$s) { linea_fail('Это не ваш объект', 403); }
    if ($j['status'] !== 'work') { linea_fail('Объект не в работе'); }
    return $s;
};
$brig = fn() => brig_one('SELECT * FROM br_brigades WHERE id = ?', [(int)$j['brigade_id']]);

switch ($a) {
    case 'request':
        if (!in_array($o['status'], ['paid', 'delivered'], true)) { linea_fail('Подбор бригады — после оплаты проекта'); }
        if ($r && $r['status'] !== 'cancelled') { linea_fail('Подбор уже идёт'); }
        if (($in['consent'] ?? false) !== true) { linea_fail('Отметьте согласие на передачу обезличенного проекта бригадам'); }
        $dist = (string)($in['district'] ?? '');
        if (!isset(BRIG_DISTRICTS[$dist])) { linea_fail('Выберите район объекта (Москва или МО)'); }
        $row = ['status' => 'new', 'consent_at' => $now, 'district' => $dist, 'area' => $o['area'] !== null ? (float)$o['area'] : null,
            'consent_text' => 'Согласие на передачу обезличенного проекта (без ФИО, адреса и телефона) бригадам площадки; условия сервиса, редакция ' . BRIG_CLIENT_TERMS['ed'] . ' (' . BRIG_CLIENT_TERMS['href'] . ')',
            'start_wish' => linea_str($in['startWish'] ?? '', 60), 'works' => '[]', 'object_title' => trim(($o['object_type'] ?: 'Объект') . ($o['area'] ? ' ' . rtrim(rtrim(number_format((float)$o['area'], 1, '.', ''), '0'), '.') . ' м²' : '')),
            'updated_at' => $now, 'test' => $test ? 1 : 0, 'chosen_offer_id' => null, 'sent_at' => null, 'deadline_at' => null];
        if ($r) { db_update('br_requests', $row, 'id = ?', [(int)$r['id']]); $rid = (int)$r['id']; brig_exec('DELETE FROM br_invites WHERE request_id = ?', [$rid]); }
        else { $rid = db_insert('br_requests', $row + ['order_id' => $oid, 'created_at' => $now]); }
        brig_audit($who, 'request', 'request#' . $rid, 'Клиент запросил подбор бригады');
        brig_admin_notify('запрос на бригаду ' . $o['number'], 'Клиент запросил подбор бригады: ' . $row['object_title'] . ', ' . BRIG_DISTRICTS[$dist], brig_link('api/admin-brigady.php?r=' . $rid), $test);
        break;
    case 'invite':
        if (!$r || in_array($r['status'], ['chosen', 'cancelled'], true)) { linea_fail('Сначала нажмите «Подобрать бригаду» — приглашение добавится в ваш запрос'); }
        $b = brig_one("SELECT * FROM br_brigades WHERE slug = ? AND status = 'active' AND demo = 0", [(string)($in['slug'] ?? '')]);
        if (!$b) { linea_fail('Бригада не найдена или сейчас не принимает запросы', 404); }
        if ((int)db_val("SELECT COUNT(*) FROM br_invites WHERE request_id = ? AND source = 'client'", [(int)$r['id']]) >= 5) { linea_fail('Можно пригласить до 5 бригад'); }
        if (brig_one('SELECT 1 FROM br_invites WHERE request_id = ? AND brigade_id = ?', [(int)$r['id'], (int)$b['id']])) { linea_fail('Эта бригада уже в вашем запросе'); }
        $sent = $r['status'] === 'sent' && $r['deadline_at'] > $now ? $now : null;     // запрос уже разослан — приглашение уходит сразу
        db_insert('br_invites', ['request_id' => (int)$r['id'], 'brigade_id' => (int)$b['id'], 'source' => 'client', 'created_at' => $now, 'sent_at' => $sent]);
        if ($sent) { brig_mail((string)$b['email'], 'brig_invite', ['name' => $b['contact_name'], 'object' => $r['object_title'], 'district' => BRIG_DISTRICTS[$r['district']] ?? '', 'deadline' => $r['deadline_at'], 'link' => brig_link('brigada/')], $test || (bool)$b['test']); }
        brig_audit($who, 'invite', 'request#' . $r['id'], 'Клиент пригласил бригаду #' . $b['id'] . ' из каталога');
        break;
    case 'cancel':
        if (!$r || $r['status'] === 'chosen') { linea_fail('Отменить можно только до выбора бригады'); }
        db_update('br_requests', ['status' => 'cancelled', 'updated_at' => $now], 'id = ?', [(int)$r['id']]);
        brig_audit($who, 'request-cancel', 'request#' . $r['id']);
        break;
    case 'choose':
        if (!$r || $r['status'] !== 'sent') { linea_fail('Выбор доступен, когда бригады прислали предложения'); }
        if (($in['consentContacts'] ?? false) !== true) { linea_fail('Отметьте согласие передать ваши контакты и адрес выбранной бригаде'); }
        $of = brig_one("SELECT o.*, b.status bstatus FROM br_offers o JOIN br_brigades b ON b.id = o.brigade_id WHERE o.id = ? AND o.request_id = ? AND o.status = 'submitted'", [(int)($in['offer'] ?? 0), (int)$r['id']]);
        if (!$of) { linea_fail('Это предложение недоступно', 404); }
        if ($of['bstatus'] !== 'active') { linea_fail('Бригада сейчас приостановлена — выберите другое предложение'); }
        $jid = db_tx(function () use ($r, $of, $now) {
            db_update('br_requests', ['status' => 'chosen', 'chosen_offer_id' => (int)$of['id'], 'updated_at' => $now], 'id = ?', [(int)$r['id']]);
            db_update('br_offers', ['status' => 'chosen', 'updated_at' => $now], 'id = ?', [(int)$of['id']]);
            db_exec("UPDATE br_offers SET status = 'rejected', updated_at = ? WHERE request_id = ? AND id <> ? AND status = 'submitted'", [$now, (int)$r['id'], (int)$of['id']]);
            $jid = db_insert('br_jobs', ['request_id' => (int)$r['id'], 'offer_id' => (int)$of['id'], 'brigade_id' => (int)$of['brigade_id'], 'status' => 'contract',
                'contacts_consent_at' => $now, 'created_at' => $now, 'updated_at' => $now]);
            foreach (brig_plan_dates((string)$of['start_date'], json_decode($of['stages'], true) ?: []) as $i => $s) {
                db_insert('br_stages', ['job_id' => $jid, 'idx' => $i + 1, 'name' => $s['name'], 'checklist' => brig_checklist_key($s['name']), 'plan_start' => $s['start'], 'plan_end' => $s['end'], 'status' => 'plan']);
            }
            return $jid;
        });
        brig_audit($who, 'choose', 'job#' . $jid, 'Выбрано предложение #' . $of['id'] . ' на ' . brig_rub((int)$of['total_kop']) . '; согласие на передачу контактов');
        foreach (brig_all('SELECT b.*, o.status ostatus FROM br_offers o JOIN br_brigades b ON b.id = o.brigade_id WHERE o.request_id = ?', [(int)$r['id']]) as $b) {
            brig_mail((string)$b['email'], $b['ostatus'] === 'chosen' ? 'brig_chosen' : 'brig_not_chosen', ['name' => $b['contact_name'], 'object' => $r['object_title'], 'link' => brig_link('brigada/')], $test || (bool)$b['test']);
        }
        break;
    case 'sign':
        if (!$j || $j['status'] !== 'contract') { linea_fail('Подписывать нечего'); }
        db_update('br_jobs', ['client_signed_at' => $now, 'updated_at' => $now], 'id = ?', [(int)$j['id']]);
        brig_audit($who, 'contract-signed', 'job#' . $j['id'], 'Клиент: договор подряда подписан');
        brig_maybe_start((int)$j['id'], $who);
        break;
    case 'stage_accept':
        $s = $stage((int)($in['stage'] ?? 0));
        if ($s['status'] !== 'ready') { linea_fail('Этап ещё не готов к приёмке'); }
        $checks = array_slice(array_map(fn($v) => (bool)$v, is_array($in['checks'] ?? null) ? $in['checks'] : []), 0, 20);
        db_tx(function () use ($s, $j, $now, $checks) {
            db_update('br_stages', ['status' => 'accepted', 'accepted_at' => $now, 'checks' => json_encode($checks)], 'id = ?', [(int)$s['id']]);
            db_exec("UPDATE br_stages SET status = 'work' WHERE job_id = ? AND idx = ? AND status = 'plan'", [(int)$j['id'], (int)$s['idx'] + 1]);
            if ((int)db_val("SELECT COUNT(*) FROM br_stages WHERE job_id = ? AND status <> 'accepted'", [(int)$j['id']]) === 0) {
                db_update('br_jobs', ['status' => 'done', 'done_at' => $now, 'updated_at' => $now], 'id = ?', [(int)$j['id']]);
            }
        });
        brig_audit($who, 'stage-accept', 'stage#' . $s['id'], $s['name']);
        $b = $brig(); brig_mail((string)$b['email'], 'brig_stage_accepted', ['name' => $b['contact_name'], 'stage' => $s['name'], 'object' => $r['object_title']], $test || (bool)$b['test']);
        break;
    case 'stage_return':
        $s = $stage((int)($in['stage'] ?? 0));
        if ($s['status'] !== 'ready') { linea_fail('Вернуть можно этап, отмеченный готовым к приёмке'); }
        $lines = array_values(array_filter(array_map(fn($x) => linea_str($x, 1000), preg_split('/\R/u', (string)($in['remarks'] ?? '')) ?: [])));
        if (!$lines) { linea_fail('Напишите замечания — по одному в строке'); }
        foreach (array_slice($lines, 0, 30) as $t) { db_insert('br_remarks', ['stage_id' => (int)$s['id'], 'text' => $t, 'created_at' => $now]); }
        db_update('br_stages', ['status' => 'returned'], 'id = ?', [(int)$s['id']]);
        brig_audit($who, 'stage-return', 'stage#' . $s['id'], count($lines) . ' замечаний');
        $b = $brig(); brig_mail((string)$b['email'], 'brig_stage_returned', ['name' => $b['contact_name'], 'stage' => $s['name'], 'object' => $r['object_title'], 'link' => brig_link('brigada/')], $test || (bool)$b['test']);
        break;
    case 'review':
        if (!$j || $j['status'] !== 'done') { linea_fail('Отзыв — после завершения объекта'); }
        if (brig_one('SELECT 1 FROM br_reviews WHERE job_id = ?', [(int)$j['id']])) { linea_fail('Отзыв по объекту уже есть'); }
        $rating = (int)($in['rating'] ?? 0);
        if ($rating < 1 || $rating > 5) { linea_fail('Оценка — от 1 до 5'); }
        db_insert('br_reviews', ['job_id' => (int)$j['id'], 'brigade_id' => (int)$j['brigade_id'], 'rating' => $rating, 'text' => linea_str($in['text'] ?? '', 3000), 'created_at' => $now, 'hidden' => 0]);
        brig_audit($who, 'review', 'job#' . $j['id'], 'Оценка ' . $rating);
        break;
    case 'dispute':
        if (!$j) { linea_fail('Спор — по объекту с выбранной бригадой'); }
        $subj = linea_str($in['subject'] ?? '', 120); $text = linea_str($in['text'] ?? '', 3000);
        if ($subj === '' || $text === '') { linea_fail('Опишите суть спора'); }
        $d = db_insert('br_disputes', ['job_id' => (int)$j['id'], 'opened_by' => 'client', 'subject' => $subj, 'status' => 'open', 'created_at' => $now]);
        db_insert('br_dispute_msgs', ['dispute_id' => $d, 'who' => 'client', 'text' => $text, 'at' => $now]);
        brig_audit($who, 'dispute-open', 'job#' . $j['id'], $subj);
        brig_admin_notify('спор по объекту', 'Клиент открыл спор: ' . $subj, brig_link('api/admin-brigady.php?view=disputes'), $test);
        break;
    case 'dispute_msg':
        $d = $j ? brig_one("SELECT * FROM br_disputes WHERE id = ? AND job_id = ? AND status = 'open'", [(int)($in['d'] ?? 0), (int)$j['id']]) : null;
        if (!$d) { linea_fail('Спор не найден или закрыт', 404); }
        $text = linea_str($in['text'] ?? '', 3000);
        if ($text === '') { linea_fail('Пустое сообщение'); }
        db_insert('br_dispute_msgs', ['dispute_id' => (int)$d['id'], 'who' => 'client', 'text' => $text, 'at' => $now]);
        break;
    default:
        linea_fail('Неизвестное действие', 404);
}
linea_json(rm_state(linea_order_by_token($token), $token));
