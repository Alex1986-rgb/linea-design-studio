<?php
/**
 * api/remont.php?t=<токен заказа> — «Ремонт по проекту» для клиента (страница заказа order.html, js/remont.js).
 * Доступ — только по токену своего заказа (без пароля); CSRF — HMAC от токена (выдаётся в GET, заголовок X-CSRF).
 *   GET                         — состояние: можно ли подобрать, запрос, сравнение предложений, выбранная бригада, этапы, отзыв
 *   POST ?a=request  {district, startWish, consent:true}  — подобрать бригаду (согласие на передачу ОБЕЗЛИЧЕННОГО проекта)
 *   POST ?a=invite   {slug}      — пригласить бригаду из каталога в свой запрос (до 5)
 *   POST ?a=cancel               — отказаться от подбора (до выбора)
 *   POST ?a=choose   {offer, consentContacts:true} — выбрать предложение (согласие передать контакты выбранной бригаде;
 *                                 сами контакты открываются по brig_terms()['contacts_after'], по умолчанию — после подтверждения договора обеими сторонами)
 *   POST ?a=sign {doc?, code?, pep:true} — подпись договора/допсоглашения на сайте (ПЭП): без кода — код уходит на почту заказчика,
 *                                 с кодом — подпись (время, IP, хеш версии). Обе подписи договора → контакты, вознаграждение, объект в работе
 *   POST ?a=addendum {items:[{name,unit,qty,price}], daysAdd, note} / ?a=addendum_cancel {doc} — допсоглашение (изменения — только так)
 *   POST ?a=msg {text}           — сообщение бригаде в ленте сделки (до открытия контактов контакты в тексте скрываются)
 *   POST ?a=advance              — «аванс бригаде внесён» (первые деньги по сделке: с этого момента вознаграждение LINEA к оплате)
 *   POST ?a=job_cancel {reason}  — отказаться от выбранной бригады до подтверждения договора (сигнал обхода в админке)
 *   POST ?a=stage_accept {stage, checks:[…]} / ?a=stage_return {stage, remarks}
 *   POST ?a=review {rating 1–5, text} — только после завершения объекта, один раз
 *   POST ?a=dispute {subject, text} / ?a=dispute_msg {d, text}
 * Проект без бригады — нормальный путь: подбор необязателен.
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/brig.php';
require __DIR__ . '/lib/kabinet.php';
require __DIR__ . '/lib/brigada.php';

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
    $out = ['ok' => true, 'csrf' => brig_client_csrf($token), 'eligible' => kab_remont_eligible($o), 'chooseAfter' => brig_terms()['choose_after'],
        'districts' => BRIG_DISTRICTS, 'terms' => BRIG_CLIENT_TERMS, 'brigTerms' => brig_terms_public(), 'request' => null, 'offers' => [], 'job' => null];
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
    foreach (brig_all("SELECT b.*, o.id oid, o.status ostatus, o.items, o.total_kop, o.days, o.start_date, o.warranty_months owarranty, o.materials, o.materials_note, o.stages, o.comment, o.mode, o.sections, o.advance_pct FROM br_offers o JOIN br_brigades b ON b.id = o.brigade_id WHERE o.request_id = ? AND o.status IN ('submitted','chosen','rejected') ORDER BY o.total_kop", [(int)$r['id']]) as $x) {
        $out['offers'][] = ['id' => (int)$x['oid'], 'status' => $x['ostatus'], 'brigade' => brig_public_card($x), 'items' => json_decode($x['items'], true) ?: [], 'total' => (int)$x['total_kop'] / 100,
            'days' => (int)$x['days'], 'startDate' => $x['start_date'], 'warrantyMonths' => (int)$x['owarranty'], 'materials' => BRIG_MATERIALS[$x['materials']] ?? $x['materials'],
            'materialsNote' => (string)$x['materials_note'], 'stages' => json_decode($x['stages'], true) ?: [], 'comment' => (string)$x['comment'],
            'mode' => $x['mode'] ?: 'items', 'sections' => array_map(fn($k) => $k / 100, json_decode((string)$x['sections'], true) ?: []), 'advancePct' => (int)$x['advance_pct']];
    }
    $j = brig_job_for_request((int)$r['id']);
    if ($j) { brig_commission_due_check((int)$j['id']); $j = brig_one('SELECT * FROM br_jobs WHERE id = ?', [(int)$j['id']]); }
    if ($j) {
        $b = brig_one('SELECT * FROM br_brigades WHERE id = ?', [(int)$j['brigade_id']]);
        $rev = brig_one('SELECT rating, text, hidden FROM br_reviews WHERE job_id = ?', [(int)$j['id']]);
        $open = brig_contacts_open($j);
        // телефон, почта, ИНН бригады — только когда контакты открыты (до этого — лента сообщений сделки)
        $out['job'] = ['id' => (int)$j['id'], 'status' => $j['status'], 'statusText' => BRIG_JOB_STATUS[$j['status']] ?? $j['status'],
            'brigade' => brig_public_card($b) + ['legalFull' => trim(($b['company'] ?: $b['name']) . ', ' . (BRIG_LEGAL[$b['legal']] ?? '') . ', ИНН ' . $b['inn']
                    . ($b['inn_checked_at'] ? ' (документы проверены LINEA ' . date('d.m.Y', strtotime((string)$b['inn_checked_at'])) . ')' : ''))]
                + ($open ? ['phone' => $b['phone'], 'email' => $b['email'], 'contact' => $b['contact_name']] : ['phone' => null, 'email' => null, 'contact' => null]),
            'contactsOpen' => $open, 'contactsText' => brig_terms_public()['contactsText'], 'messages' => brig_messages((int)$j['id']),
            'canCancel' => $j['status'] === 'contract' && !$open,
            'advanceAt' => $j['advance_at'], 'advanceState' => $j['advance_state'], 'canAdvance' => $j['status'] === 'work' && !$j['advance_at'],
            'payments' => brig_pay_list((int)$j['id']), 'paySummary' => brig_pay_summary((int)$j['id']), 'frozen' => $j['frozen_at'] ? (string)$j['frozen_reason'] : null,
            'stageItems' => array_map(fn($f) => ['id' => (int)$f['id'], 'stage' => (int)$f['owner_id'], 'item' => (int)substr((string)$f['title'], 5)], brig_all("SELECT f.id, f.owner_id, f.title FROM br_files f JOIN br_stages s ON s.id = f.owner_id WHERE f.owner_kind = 'stage' AND f.title LIKE 'item:%' AND s.job_id = ?", [(int)$j['id']])),
            'beforePhotos' => array_map(fn($f) => ['id' => (int)$f['id'], 'stage' => (int)$f['owner_id']], brig_all("SELECT f.id, f.owner_id FROM br_files f JOIN br_stages s ON s.id = f.owner_id WHERE f.owner_kind = 'stage_before' AND s.job_id = ? ORDER BY f.id", [(int)$j['id']])),
            'docs' => brig_deal_docs($j),
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
// значимые действия (выбор, подписи, отметки оплат, приёмка, разногласие, отзыв, отказ) — только после входа кодом на почту заказа
// не старше fresh_code_hours (спецификация 3.0 п. 6, ревью техники В-5): одной ссылки с токеном мало
if (in_array($a, ['request', 'choose', 'sign', 'addendum', 'addendum_cancel', 'advance', 'pay', 'pay_contest', 'job_cancel', 'stage_accept', 'stage_return', 'review', 'dispute', 'cancel'], true)) {
    kab_require_fresh_for_order($o);
}
$jf = ($rq = brig_one('SELECT id FROM br_requests WHERE order_id = ?', [$oid])) ? brig_job_for_request((int)$rq['id']) : null;
if ($jf && !in_array($a, ['msg', 'dispute', 'dispute_msg'], true)) { deal_require_not_frozen($jf); }
$now = linea_now();
$r = brig_one('SELECT * FROM br_requests WHERE order_id = ?', [$oid]);
$j = $r ? brig_job_for_request((int)$r['id']) : null;   // действующая сделка; отменённые остаются в базе (С-3)
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
        if (!kab_remont_eligible($o)) { linea_fail(brig_terms()['choose_after'] === 'final' ? 'Подбор бригады — по финальному альбому, после выдачи проекта' : 'Подбор бригады — после оплаты проекта и первого варианта альбома'); }
        if ($r && $r['status'] !== 'cancelled') { linea_fail('Подбор уже идёт'); }
        if (($in['consent'] ?? false) !== true) { linea_fail('Отметьте согласие на передачу обезличенного проекта бригадам'); }
        $dist = (string)($in['district'] ?? '');
        if (!isset(BRIG_DISTRICTS[$dist])) { linea_fail('Выберите район объекта (Москва или МО)'); }
        $row = ['status' => 'new', 'consent_at' => $now, 'district' => $dist, 'area' => $o['area'] !== null ? (float)$o['area'] : null,
            'consent_text' => 'Согласие на передачу обезличенного проекта (без ФИО, адреса и телефона) бригадам площадки; условия сервиса, редакция ' . BRIG_CLIENT_TERMS['ed'] . ' (' . BRIG_CLIENT_TERMS['href'] . ')',
            'start_wish' => brig_guard(linea_str($in['startWish'] ?? '', 60), false, ['who' => $who, 'field' => 'когда начать']), 'works' => '[]', 'object_title' => trim(($o['object_type'] ?: 'Объект') . ($o['area'] ? ' ' . rtrim(rtrim(number_format((float)$o['area'], 1, '.', ''), '0'), '.') . ' м²' : '')),
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
        if ($j) { linea_fail('Бригада уже выбрана', 409); }
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
        brig_contract_main(brig_one('SELECT * FROM br_jobs WHERE id = ?', [$jid]));   // версия договора для подписи на сайте — сразу после выбора
        if (brig_terms()['contacts_after'] === 'chosen') { brig_open_contacts($jid, $who); }
        foreach (brig_all('SELECT b.*, o.status ostatus FROM br_offers o JOIN br_brigades b ON b.id = o.brigade_id WHERE o.request_id = ?', [(int)$r['id']]) as $b) {
            brig_mail((string)$b['email'], $b['ostatus'] === 'chosen' ? 'brig_chosen' : 'brig_not_chosen', ['name' => $b['contact_name'], 'object' => $r['object_title'], 'link' => brig_link('brigada/'), 'rate' => brig_rate_text(), 'contacts' => brig_terms_public()['contactsText']], $test || (bool)$b['test']);
        }
        break;
    case 'sign':
        if (!$j || $j['status'] === 'cancelled') { linea_fail('Подписывать нечего'); }
        $c = brig_sign_doc($j, (int)($in['doc'] ?? 0));
        if (trim((string)($in['code'] ?? '')) === '') {
            $dev = brig_sign_send($c, 'client', (string)$o['email'], $test);
            linea_json(rm_state(linea_order_by_token($token), $token) + ['codeSent' => true, 'doc' => (int)$c['id']] + ($dev !== '' ? ['devCode' => $dev] : []));
        }
        brig_sign_confirm($c, 'client', (string)$in['code'], ($in['pep'] ?? false) === true, $who);
        break;
    case 'addendum':
        if (!$j) { linea_fail('Допсоглашение — по объекту с выбранной бригадой'); }
        brig_addendum_propose($j, $in, $who, ['who' => $who, 'job_id' => (int)$j['id'], 'brigade_id' => (int)$j['brigade_id']]);
        brig_audit($who, 'addendum-propose', 'job#' . $j['id'], 'Заказчик предложил допсоглашение');
        break;
    case 'addendum_cancel':
        if (!$j) { linea_fail('Нет объекта'); }
        brig_addendum_cancel($j, (int)($in['doc'] ?? 0), $who);
        break;
    case 'msg':
        if (!$j || $j['status'] === 'cancelled') { linea_fail('Переписка — по объекту с выбранной бригадой'); }
        brig_message_add($j, 'client', (string)($in['text'] ?? ''), ['who' => $who, 'request_id' => (int)$r['id']]);
        break;
    case 'advance':   // прежняя кнопка «аванс внесён» — теперь строка реестра оплат (аванс по плану или с суммой)
        if (!$j || $j['status'] !== 'work') { linea_fail('Отметить аванс можно, когда договор подтверждён и объект в работе'); }
        if ($j['advance_at']) { linea_fail('Аванс уже отмечен'); }
        $adv = brig_one("SELECT * FROM br_payments WHERE job_id = ? AND kind = 'advance' AND status = 'planned' ORDER BY id LIMIT 1", [(int)$j['id']]);
        brig_pay_mark($j, 'client', $adv ? ['p' => (int)$adv['id']] : ['kind' => 'advance', 'amount' => (float)($in['amount'] ?? 0), 'zeroOk' => true], $who);
        brig_audit($who, 'advance', 'job#' . $j['id'], 'Заказчик: аванс бригаде внесён (бригада подтверждает или оспаривает за ' . brig_terms()['advance_confirm_days'] . ' дн.)');
        $b = $brig(); brig_mail((string)$b['email'], 'brig_advance_declared', ['name' => $b['contact_name'], 'object' => $r['object_title'], 'days' => (string)brig_terms()['advance_confirm_days'], 'link' => brig_link('brigada/#/obekt/' . $j['id'] . '/oplaty')], $test || (bool)$b['test']);
        break;
    case 'pay':   // реестр оплат: «я передал» по строке плана (p) или новая отметка {kind, amount, stage}; по отметке бригады — подтверждение
        if (!$j) { linea_fail('Бригада не выбрана'); }
        brig_pay_mark($j, 'client', $in, $who);
        break;
    case 'pay_contest':
        if (!$j) { linea_fail('Бригада не выбрана'); }
        brig_pay_contest($j, 'client', (int)($in['p'] ?? 0), (string)($in['note'] ?? ''), $who);
        break;
    case 'job_cancel':
        if (!$j) { linea_fail('Бригада не выбрана'); }
        brig_job_cancel($j, 'client', $who, (string)($in['reason'] ?? ''));
        $b = $brig();
        brig_mail((string)$b['email'], 'brig_not_chosen', ['name' => $b['contact_name'], 'object' => $r['object_title']], $test || (bool)$b['test']);
        break;
    case 'stage_accept':
        $s = $stage((int)($in['stage'] ?? 0));
        if ($s['status'] !== 'ready') { linea_fail('Этап ещё не готов к приёмке'); }
        $checks = array_slice(array_map(fn($v) => $v === true, is_array($in['checks'] ?? null) ? $in['checks'] : []), 0, 20);
        // приёмка — только когда отмечены ВСЕ пункты чек-листа этапа; не выполнено — этап возвращают с замечаниями
        $need = count(brig_checklist((string)$s['checklist'])['items']);
        $done = count(array_filter(array_slice($checks, 0, $need)));
        if ($done < $need) { linea_fail('Отметьте все пункты чек-листа приёмки (отмечено ' . $done . ' из ' . $need . '). Если пункт не выполнен — верните этап с замечаниями'); }
        db_tx(function () use ($s, $j, $now, $checks) {
            db_update('br_stages', ['status' => 'accepted', 'accepted_at' => $now, 'checks' => json_encode($checks)], 'id = ?', [(int)$s['id']]);
            db_exec("UPDATE br_stages SET status = 'work' WHERE job_id = ? AND idx = ? AND status = 'plan'", [(int)$j['id'], (int)$s['idx'] + 1]);
        });
        brig_audit($who, 'stage-accept', 'stage#' . $s['id'], $s['name']);
        db_insert('br_messages', ['job_id' => (int)$j['id'], 'who' => 'system', 'text' => 'Заказчик принял этап ' . (int)$s['idx'] . ' «' . $s['name'] . '» по чек-листу.', 'masked' => 0, 'at' => $now]);
        brig_notice((int)$j['brigade_id'], (int)$j['id'], 'obekty', 'Заказчик принял этап «' . $s['name'] . '» (' . $r['object_title'] . ')', '#/obekt/' . $j['id'] . '/etapy');
        if ((int)db_val("SELECT COUNT(*) FROM br_stages WHERE job_id = ? AND status <> 'accepted'", [(int)$j['id']]) === 0) {
            deal_transition((int)$j['id'], 'done', $who, 'все этапы приняты заказчиком');   // единая точка смены статуса сделки
        }
        brig_commission_due_check((int)$j['id'], $who);   // первый принятый этап — одна из дат «к оплате»
        $b = $brig(); brig_mail((string)$b['email'], 'brig_stage_accepted', ['name' => $b['contact_name'], 'stage' => $s['name'], 'object' => $r['object_title']], $test || (bool)$b['test']);
        break;
    case 'stage_return':
        $s = $stage((int)($in['stage'] ?? 0));
        if ($s['status'] !== 'ready') { linea_fail('Вернуть можно этап, отмеченный готовым к приёмке'); }
        $lines = array_values(array_filter(array_map(fn($x) => brig_guard(linea_str($x, 1000), brig_contacts_open($j), ['who' => $who, 'field' => 'замечание', 'job_id' => (int)$j['id'], 'brigade_id' => (int)$j['brigade_id']]),
            preg_split('/\R/u', (string)($in['remarks'] ?? '')) ?: [])));
        if (!$lines) { linea_fail('Напишите замечания — по одному в строке'); }
        foreach (array_slice($lines, 0, 30) as $t) { db_insert('br_remarks', ['stage_id' => (int)$s['id'], 'text' => $t, 'created_at' => $now]); }
        db_update('br_stages', ['status' => 'returned'], 'id = ?', [(int)$s['id']]);
        brig_audit($who, 'stage-return', 'stage#' . $s['id'], count($lines) . ' замечаний');
        db_insert('br_messages', ['job_id' => (int)$j['id'], 'who' => 'system', 'text' => 'Заказчик вернул этап ' . (int)$s['idx'] . ' «' . $s['name'] . '» на доработку: замечаний — ' . count($lines) . '.', 'masked' => 0, 'at' => $now]);
        brig_notice((int)$j['brigade_id'], (int)$j['id'], 'obekty', 'Этап «' . $s['name'] . '» вернули: ' . count($lines) . ' замеч.', '#/obekt/' . $j['id'] . '/etap/' . $s['id']);
        $b = $brig(); brig_mail((string)$b['email'], 'brig_stage_returned', ['name' => $b['contact_name'], 'stage' => $s['name'], 'object' => $r['object_title'], 'link' => brig_link('brigada/#/obekt/' . $j['id'] . '/etap/' . $s['id'])], $test || (bool)$b['test']);
        break;
    case 'review':
        if (!$j || $j['status'] !== 'done') { linea_fail('Отзыв — после завершения объекта'); }
        if (brig_one('SELECT 1 FROM br_reviews WHERE job_id = ?', [(int)$j['id']])) { linea_fail('Отзыв по объекту уже есть'); }
        $rating = (int)($in['rating'] ?? 0);
        if ($rating < 1 || $rating > 5) { linea_fail('Оценка — от 1 до 5'); }
        // отзыв публичный — контакты в нём скрываются всегда
        $rtext = brig_guard(linea_str($in['text'] ?? '', 3000), false, ['who' => $who, 'field' => 'отзыв', 'job_id' => (int)$j['id'], 'brigade_id' => (int)$j['brigade_id']]);
        db_insert('br_reviews', ['job_id' => (int)$j['id'], 'brigade_id' => (int)$j['brigade_id'], 'rating' => $rating, 'text' => $rtext, 'created_at' => $now, 'hidden' => 0]);
        brig_audit($who, 'review', 'job#' . $j['id'], 'Оценка ' . $rating);
        break;
    case 'dispute':
        if (!$j) { linea_fail('Спор — по объекту с выбранной бригадой'); }
        $gctx = ['who' => $who, 'field' => 'спор', 'job_id' => (int)$j['id'], 'brigade_id' => (int)$j['brigade_id']];
        $subj = brig_guard(linea_str($in['subject'] ?? '', 120), brig_contacts_open($j), $gctx); $text = brig_guard(linea_str($in['text'] ?? '', 3000), brig_contacts_open($j), $gctx);
        if ($subj === '' || $text === '') { linea_fail('Опишите суть спора'); }
        $d = db_insert('br_disputes', ['job_id' => (int)$j['id'], 'opened_by' => 'client', 'subject' => $subj, 'status' => 'open', 'created_at' => $now]);
        db_insert('br_dispute_msgs', ['dispute_id' => $d, 'who' => 'client', 'text' => $text, 'at' => $now]);
        brig_audit($who, 'dispute-open', 'job#' . $j['id'], $subj);
        brig_admin_notify('спор по объекту', 'Клиент открыл спор: ' . $subj, brig_link('api/admin-brigady.php?view=disputes'), $test);
        break;
    case 'dispute_msg':
        $d = $j ? brig_one("SELECT * FROM br_disputes WHERE id = ? AND job_id = ? AND status = 'open'", [(int)($in['d'] ?? 0), (int)$j['id']]) : null;
        if (!$d) { linea_fail('Спор не найден или закрыт', 404); }
        $text = brig_guard(linea_str($in['text'] ?? '', 3000), brig_contacts_open($j), ['who' => $who, 'field' => 'спор', 'job_id' => (int)$j['id'], 'brigade_id' => (int)$j['brigade_id']]);
        if ($text === '') { linea_fail('Пустое сообщение'); }
        db_insert('br_dispute_msgs', ['dispute_id' => (int)$d['id'], 'who' => 'client', 'text' => $text, 'at' => $now]);
        break;
    default:
        linea_fail('Неизвестное действие', 404);
}
linea_json(rm_state(linea_order_by_token($token), $token));
