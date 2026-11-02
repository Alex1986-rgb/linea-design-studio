<?php
/**
 * api/brigade/offer.php — предложение бригады по запросу (CSRF, только допущенным и только по разосланному им запросу).
 *   POST ?a=save     {r, items:{p1:{price, skip}}, materials, materialsNote, stages:[{name,days}], startDate, warrantyMonths, comment}
 *                    — создать или поправить до срока ответа; сумма считается на сервере по количествам из пакета проекта
 *                    mode: items (по строкам сметы) | sections (цена за раздел целиком: sections:{demontazh: 120000, …});
 *                    advancePct — аванс, % (0–50; из него и этапов собирается план оплат договора);
 *                    draft:true — черновик (бригадир готовит, клиент не видит); отправляет клиенту только владелец, после входа кодом
 *   POST ?a=withdraw {r} — отозвать до срока;  POST ?a=decline {r} — «не возьмёмся» (запрос уходит из активных)
 */
declare(strict_types=1);
if (!defined('LINEA_BRIGADA')) { http_response_code(404); exit; }   // модуль api/brigada.php?m=…, напрямую не открывается
require_once __DIR__ . '/../boot.php';
require_once __DIR__ . '/../brigada.php';

brig_https();
$b = brig_me();
brig_method('POST');
brig_csrf();
brig_need($b, 'feed');
brig_require_active($b);
brig_require_no_debt($b);   // лестница долга: просрочка счёта сверх debt_feed_close_days — новые заказы и предложения закрыты (начатые сделки доводятся)
$bid = (int)$b['id'];
$in = brig_input();
$rid = (int)($in['r'] ?? 0);
$r = brig_one('SELECT r.*, i.id inv_id, i.sent_at inv_sent, i.declined_at FROM br_requests r JOIN br_invites i ON i.request_id = r.id AND i.brigade_id = ? WHERE r.id = ? AND i.sent_at IS NOT NULL', [$bid, $rid]);
if (!$r) { linea_fail('Этот запрос вам не направлялся', 403); }
$now = linea_now();
$open = $r['status'] === 'sent' && $r['deadline_at'] && $r['deadline_at'] > $now;
$a = (string)($_GET['a'] ?? '');
$WHO = brig_who($b);
if ($a === 'save' && !brig_can($b, 'offer_send')) { $in['draft'] = true; }   // бригадир готовит черновик, отправляет владелец
if (in_array($a, ['decline', 'withdraw'], true) || ($a === 'save' && empty($in['draft']))) { brig_need($b, 'offer_send'); kab_require_fresh(); }
$offer = brig_one('SELECT * FROM br_offers WHERE request_id = ? AND brigade_id = ?', [$rid, $bid]);

if ($a === 'decline') {
    if ($offer && $offer['status'] === 'submitted') { linea_fail('Сначала отзовите предложение'); }
    db_update('br_invites', ['declined_at' => $now], 'id = ?', [(int)$r['inv_id']]);
    brig_audit($WHO, 'decline', 'request#' . $rid);
    linea_json(['ok' => true]);
}
if (!$open) { linea_fail('Срок ответа по запросу прошёл или клиент уже выбрал бригаду — предложение не меняется', 409); }
if ($a === 'withdraw') {
    if (!$offer) { linea_fail('Предложения нет'); }
    db_update('br_offers', ['status' => 'withdrawn', 'updated_at' => $now], 'id = ?', [(int)$offer['id']]);
    brig_audit($WHO, 'offer-withdraw', 'request#' . $rid);
    linea_json(['ok' => true]);
}
if ($a !== 'save') { linea_fail('Неизвестное действие', 404); }
if ($r['declined_at']) { db_update('br_invites', ['declined_at' => null], 'id = ?', [(int)$r['inv_id']]); }

$pack = json_decode((string)$r['pack'], true) ?: ['positions' => []];
$mode = ($in['mode'] ?? '') === 'sections' ? 'sections' : 'items';
$sections = null;
if ($mode === 'sections') {   // цена за раздел целиком (демонтаж, электрика…): позиции внутри не заполняются, клиент видит раздел
    $sections = []; $total = 0; $items = [];
    foreach (brig_works_of($pack) as $spec) {
        $v = $in['sections'][$spec] ?? null;
        if (is_numeric($v) && (float)$v > 0) { $sections[$spec] = (int)round((float)$v * 100); $total += $sections[$spec]; }
    }
    if ($total <= 0) { linea_fail('Укажите цену хотя бы по одному разделу'); }
} else {
    [$items, $total] = brig_offer_calc($pack, is_array($in['items'] ?? null) ? $in['items'] : []);
    if ($total <= 0) { linea_fail('Укажите цену хотя бы по одной позиции'); }
}
$draft = !empty($in['draft']);
if ($offer && in_array($offer['status'], ['submitted'], true) && $draft) { linea_fail('Предложение уже отправлено клиенту — правит и переотправляет владелец'); }
$adv = max(0, min(50, (int)($in['advancePct'] ?? 0)));
// самозанятые (НПД): лимит дохода и крупные объекты — только ИП/ООО (спецификация 4.1, brig_terms npd)
$npd = brig_terms()['npd'];
if (!$draft && $b['legal'] === 'npd') {
    if ($npd['max_deal_kop'] > 0 && $total > $npd['max_deal_kop']) { linea_fail('Сумма больше лимита дохода самозанятого (' . brig_rub($npd['max_deal_kop']) . ' в год). Чтобы подать предложение, нужен статус ИП'); }
    if ($npd['big_object_m2'] > 0 && (float)$r['area'] >= $npd['big_object_m2']) { linea_fail('Объекты от ' . $npd['big_object_m2'] . ' м² — только для бригад-ИП и ООО'); }
}
$materials = isset(BRIG_MATERIALS[$in['materials'] ?? '']) ? (string)$in['materials'] : null;
if (!$materials) { linea_fail('Укажите, чьи материалы'); }
// свободные тексты предложения видит клиент до выбора: контакты в них скрываются, срабатывание — в сигналы обхода
$gctx = ['who' => $WHO, 'brigade_id' => $bid, 'request_id' => $rid];
$stages = array_map(fn($s) => ['name' => brig_guard($s['name'], false, $gctx + ['field' => 'этап']), 'days' => $s['days']], brig_stages_clean($in['stages'] ?? []));
if (!$stages) { linea_fail('Добавьте график: этапы и их длительность в днях'); }
$start = (string)($in['startDate'] ?? '');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start) || $start < date('Y-m-d')) { linea_fail('Укажите дату, с которой бригада может начать (не раньше сегодняшней)'); }
$warranty = (int)($in['warrantyMonths'] ?? 0);
if ($warranty < 1 || $warranty > 120) { linea_fail('Укажите гарантию в месяцах (рекомендуем не меньше 24)'); }
$row = ['status' => $draft ? 'draft' : 'submitted', 'mode' => $mode, 'sections' => $sections !== null ? json_encode($sections) : null, 'advance_pct' => $adv,
    'drafted_by' => $draft ? $WHO : null, 'items' => json_encode($items), 'total_kop' => $total, 'materials' => $materials,
    'materials_note' => brig_guard(linea_str($in['materialsNote'] ?? '', 500), false, $gctx + ['field' => 'материалы']), 'stages' => json_encode($stages, JSON_UNESCAPED_UNICODE), 'start_date' => $start,
    'days' => array_sum(array_column($stages, 'days')), 'warranty_months' => $warranty, 'comment' => brig_guard(linea_str($in['comment'] ?? '', 2000), false, $gctx + ['field' => 'комментарий']), 'updated_at' => $now];
if ($draft) {
    if ($offer) { db_update('br_offers', $row, 'id = ?', [(int)$offer['id']]); } else { db_insert('br_offers', $row + ['request_id' => $rid, 'brigade_id' => $bid, 'created_at' => $now]); }
    brig_audit($WHO, 'offer-draft', 'request#' . $rid, brig_rub($total));
    if (brig_role($b) !== 'owner') { brig_notice($bid, null, 'zakazy', ($b['_name'] ?: 'Бригадир') . ' подготовил черновик предложения «' . $r['object_title'] . '» на ' . brig_rub($total) . ' — проверьте и отправьте', '#/zakaz/' . $rid); }
    linea_json(['ok' => true, 'total' => $total / 100, 'draft' => true, 'message' => 'Черновик сохранён. Клиент его не видит' . (brig_role($b) !== 'owner' ? ' — отправит владелец бригады' : '')]);
}
$wasDraft = $offer && $offer['status'] === 'draft';
if ($offer && !$wasDraft) {
    db_update('br_offers', $row, 'id = ?', [(int)$offer['id']]);
    brig_audit($WHO, 'offer-update', 'request#' . $rid, brig_rub($total));
} else {
    $row += ['response_hours' => brig_hours_between($r['inv_sent'], $now)];
    if ($wasDraft) { db_update('br_offers', $row, 'id = ?', [(int)$offer['id']]); }
    else { db_insert('br_offers', $row + ['request_id' => $rid, 'brigade_id' => $bid, 'created_at' => $now]); }
    brig_audit($WHO, 'offer-create', 'request#' . $rid, brig_rub($total));
    $o = db_one('SELECT o.email, o.test, o.number, o.token FROM orders o WHERE o.id = ?', [(int)$r['order_id']]);
    $cnt = (int)db_val("SELECT COUNT(*) FROM br_offers WHERE request_id = ? AND status = 'submitted'", [$rid]);
    if ($o && $o['email'] && $cnt === 2) {           // клиенту — одно письмо, когда есть что сравнивать
        brig_mail((string)$o['email'], 'client_offers', ['number' => $o['number'], 'count' => $cnt, 'link' => brig_link('kabinet/#t=' . $o['token'])], (bool)$o['test'] || (bool)$r['test']);
    }
}
linea_json(['ok' => true, 'total' => $total / 100, 'message' => 'Предложение отправлено. Править можно до ' . date('d.m.Y H:i', strtotime((string)$r['deadline_at']))]);
