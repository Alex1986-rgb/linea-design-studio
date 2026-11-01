<?php
/**
 * api/brigade/feed.php — лента запросов бригады. Только допущенным (status = active), только разосланные ей запросы.
 *   GET            — список: объект, район, площадь, состав работ, срок ответа, моё предложение
 *   GET ?r=<id>    — обезличенный пакет проекта: позиции сметы, помещения, файлы (ведомости xlsx, листы PDF), моё предложение
 * Контактов, ФИО и адреса клиента здесь нет и быть не может: в br_requests их нет, пакет чистится brig_pack_clean().
 */
declare(strict_types=1);
require __DIR__ . '/../lib/boot.php';
require __DIR__ . '/../lib/brig.php';

brig_https();
$b = brig_me();
brig_require_active($b);
brig_require_no_debt($b);   // лестница долга: просрочка счёта сверх debt_feed_close_days — новые заказы и предложения закрыты (начатые сделки доводятся)
$bid = (int)$b['id'];

function feed_offer(?array $o): ?array
{
    if (!$o) { return null; }
    return ['id' => (int)$o['id'], 'status' => $o['status'], 'items' => json_decode($o['items'], true) ?: [], 'total' => (int)$o['total_kop'] / 100,
        'materials' => $o['materials'], 'materialsNote' => (string)$o['materials_note'], 'stages' => json_decode($o['stages'], true) ?: [],
        'startDate' => $o['start_date'], 'days' => (int)$o['days'], 'warrantyMonths' => (int)$o['warranty_months'], 'comment' => (string)$o['comment'],
        'updated' => $o['updated_at']];
}

$rid = (int)($_GET['r'] ?? 0);
if ($rid) {
    $r = brig_one('SELECT r.*, i.id inv_id, i.seen_at, i.declined_at FROM br_requests r JOIN br_invites i ON i.request_id = r.id AND i.brigade_id = ? WHERE r.id = ? AND i.sent_at IS NOT NULL', [$bid, $rid]);
    if (!$r) { linea_fail('Этот запрос вам не направлялся', 403); }
    if (!$r['seen_at']) { db_update('br_invites', ['seen_at' => linea_now()], 'id = ?', [(int)$r['inv_id']]); }
    $pack = json_decode((string)$r['pack'], true) ?: ['positions' => []];
    $files = array_map(fn($f) => ['id' => (int)$f['id'], 'title' => (string)$f['title'], 'mime' => $f['mime'], 'bytes' => (int)$f['bytes']],
        brig_all("SELECT id, title, mime, bytes FROM br_files WHERE owner_kind = 'pack' AND owner_id = ? ORDER BY id", [$rid]));
    $offer = brig_one('SELECT * FROM br_offers WHERE request_id = ? AND brigade_id = ?', [$rid, $bid]);
    $open = $r['status'] === 'sent' && $r['deadline_at'] && $r['deadline_at'] > linea_now() && !$r['declined_at'];
    linea_json(['ok' => true, 'request' => [
        'id' => $rid, 'status' => $r['status'], 'statusText' => BRIG_REQ_STATUS[$r['status']] ?? $r['status'],
        'object' => (string)$r['object_title'], 'district' => BRIG_DISTRICTS[$r['district']] ?? $r['district'], 'area' => $r['area'] !== null ? (float)$r['area'] : null,
        'startWish' => (string)$r['start_wish'], 'works' => array_map(fn($k) => BRIG_SPECS[$k] ?? $k, json_decode($r['works'], true) ?: []),
        'deadline' => $r['deadline_at'], 'open' => $open, 'declined' => (bool)$r['declined_at'],
        'rooms' => $pack['rooms'] ?? [], 'positions' => $pack['positions'] ?? [], 'files' => $files,
        'defaultStages' => brig_default_stages(json_decode($r['works'], true) ?: []), 'warrantyDefault' => (int)($b['warranty_months'] ?? 12),
    ], 'offer' => feed_offer($offer), 'specs' => BRIG_SPECS, 'materials' => BRIG_MATERIALS]);
}

$list = [];
foreach (brig_all('SELECT r.id, r.status, r.object_title, r.district, r.area, r.works, r.deadline_at, i.seen_at, i.declined_at, o.status ostatus, o.total_kop
        FROM br_invites i JOIN br_requests r ON r.id = i.request_id LEFT JOIN br_offers o ON o.request_id = r.id AND o.brigade_id = i.brigade_id
        WHERE i.brigade_id = ? AND i.sent_at IS NOT NULL ORDER BY r.id DESC LIMIT 200', [$bid]) as $r) {
    $list[] = ['id' => (int)$r['id'], 'status' => $r['status'], 'statusText' => BRIG_REQ_STATUS[$r['status']] ?? $r['status'], 'object' => (string)$r['object_title'],
        'district' => BRIG_DISTRICTS[$r['district']] ?? $r['district'], 'area' => $r['area'] !== null ? (float)$r['area'] : null,
        'works' => array_map(fn($k) => BRIG_SPECS[$k] ?? $k, json_decode($r['works'], true) ?: []), 'deadline' => $r['deadline_at'],
        'open' => $r['status'] === 'sent' && $r['deadline_at'] > linea_now() && !$r['declined_at'], 'seen' => (bool)$r['seen_at'], 'declined' => (bool)$r['declined_at'],
        'offerStatus' => $r['ostatus'], 'offerTotal' => $r['total_kop'] !== null ? (int)$r['total_kop'] / 100 : null];
}
linea_json(['ok' => true, 'requests' => $list]);
