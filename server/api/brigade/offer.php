<?php
/**
 * api/brigade/offer.php — предложение бригады по запросу (CSRF, только допущенным и только по разосланному им запросу).
 *   POST ?a=save     {r, items:{p1:{price, skip}}, materials, materialsNote, stages:[{name,days}], startDate, warrantyMonths, comment}
 *                    — создать или поправить до срока ответа; сумма считается на сервере по количествам из пакета проекта
 *   POST ?a=withdraw {r} — отозвать до срока;  POST ?a=decline {r} — «не возьмёмся» (запрос уходит из активных)
 */
declare(strict_types=1);
require __DIR__ . '/../lib/boot.php';
require __DIR__ . '/../lib/brig.php';

brig_https();
$b = brig_me();
brig_method('POST');
brig_csrf();
brig_require_active($b);
$bid = (int)$b['id'];
$in = brig_input();
$rid = (int)($in['r'] ?? 0);
$r = brig_one('SELECT r.*, i.id inv_id, i.sent_at inv_sent, i.declined_at FROM br_requests r JOIN br_invites i ON i.request_id = r.id AND i.brigade_id = ? WHERE r.id = ? AND i.sent_at IS NOT NULL', [$bid, $rid]);
if (!$r) { linea_fail('Этот запрос вам не направлялся', 403); }
$now = linea_now();
$open = $r['status'] === 'sent' && $r['deadline_at'] && $r['deadline_at'] > $now;
$a = (string)($_GET['a'] ?? '');
$offer = brig_one('SELECT * FROM br_offers WHERE request_id = ? AND brigade_id = ?', [$rid, $bid]);

if ($a === 'decline') {
    if ($offer && $offer['status'] === 'submitted') { linea_fail('Сначала отзовите предложение'); }
    db_update('br_invites', ['declined_at' => $now], 'id = ?', [(int)$r['inv_id']]);
    brig_audit('brigade#' . $bid, 'decline', 'request#' . $rid);
    linea_json(['ok' => true]);
}
if (!$open) { linea_fail('Срок ответа по запросу прошёл или клиент уже выбрал бригаду — предложение не меняется', 409); }
if ($a === 'withdraw') {
    if (!$offer) { linea_fail('Предложения нет'); }
    db_update('br_offers', ['status' => 'withdrawn', 'updated_at' => $now], 'id = ?', [(int)$offer['id']]);
    brig_audit('brigade#' . $bid, 'offer-withdraw', 'request#' . $rid);
    linea_json(['ok' => true]);
}
if ($a !== 'save') { linea_fail('Неизвестное действие', 404); }
if ($r['declined_at']) { db_update('br_invites', ['declined_at' => null], 'id = ?', [(int)$r['inv_id']]); }

$pack = json_decode((string)$r['pack'], true) ?: ['positions' => []];
[$items, $total] = brig_offer_calc($pack, is_array($in['items'] ?? null) ? $in['items'] : []);
if ($total <= 0) { linea_fail('Укажите цену хотя бы по одной позиции'); }
$materials = isset(BRIG_MATERIALS[$in['materials'] ?? '']) ? (string)$in['materials'] : null;
if (!$materials) { linea_fail('Укажите, чьи материалы'); }
$stages = brig_stages_clean($in['stages'] ?? []);
if (!$stages) { linea_fail('Добавьте график: этапы и их длительность в днях'); }
$start = (string)($in['startDate'] ?? '');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start) || $start < date('Y-m-d')) { linea_fail('Укажите дату, с которой бригада может начать (не раньше сегодняшней)'); }
$warranty = (int)($in['warrantyMonths'] ?? 0);
if ($warranty < 1 || $warranty > 120) { linea_fail('Укажите гарантию в месяцах (рекомендуем не меньше 24)'); }
$row = ['status' => 'submitted', 'items' => json_encode($items), 'total_kop' => $total, 'materials' => $materials,
    'materials_note' => linea_str($in['materialsNote'] ?? '', 500), 'stages' => json_encode($stages, JSON_UNESCAPED_UNICODE), 'start_date' => $start,
    'days' => array_sum(array_column($stages, 'days')), 'warranty_months' => $warranty, 'comment' => linea_str($in['comment'] ?? '', 2000), 'updated_at' => $now];
if ($offer) {
    db_update('br_offers', $row, 'id = ?', [(int)$offer['id']]);
    brig_audit('brigade#' . $bid, 'offer-update', 'request#' . $rid, brig_rub($total));
} else {
    $row += ['request_id' => $rid, 'brigade_id' => $bid, 'created_at' => $now, 'response_hours' => brig_hours_between($r['inv_sent'], $now)];
    db_insert('br_offers', $row);
    brig_audit('brigade#' . $bid, 'offer-create', 'request#' . $rid, brig_rub($total));
    $o = db_one('SELECT o.email, o.test, o.number, o.token FROM orders o WHERE o.id = ?', [(int)$r['order_id']]);
    $cnt = (int)db_val("SELECT COUNT(*) FROM br_offers WHERE request_id = ? AND status = 'submitted'", [$rid]);
    if ($o && $o['email'] && $cnt === 2) {           // клиенту — одно письмо, когда есть что сравнивать
        brig_mail((string)$o['email'], 'client_offers', ['number' => $o['number'], 'count' => $cnt, 'link' => brig_link('order.html?t=' . $o['token'])], (bool)$o['test'] || (bool)$r['test']);
    }
}
linea_json(['ok' => true, 'total' => $total / 100]);
