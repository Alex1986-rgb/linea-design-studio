<?php
/**
 * api/remont-dogovor.php — шаблон договора подряда клиент ↔ бригада (HTML для печати в PDF: «Печать → Сохранить как PDF»).
 *   ?t=<токен заказа>      — клиент своего заказа;   ?j=<объект> — бригада по своей сессии (только свой объект)
 * Приложения: 1 — проект (альбом LINEA), 2 — смета по позициям бригады, 3 — график этапов, 4 — порядок приёмки (чек-листы).
 * LINEA стороной договора подряда не является (агент бригады по агентскому договору). Шаблон — черновик до проверки юристом.
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/brig.php';

brig_https();
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src 'self'");
header('Referrer-Policy: no-referrer');

$j = null;
if (isset($_GET['t'])) {
    $o = linea_order_by_token((string)$_GET['t']);
    if ($o) { $j = brig_one('SELECT j.* FROM br_jobs j JOIN br_requests r ON r.id = j.request_id WHERE r.order_id = ?', [(int)$o['id']]); }
} else {
    $b = brig_me();
    $j = brig_one('SELECT * FROM br_jobs WHERE id = ?', [(int)($_GET['j'] ?? 0)]);
    if ($j && (int)$j['brigade_id'] !== (int)$b['id']) { http_response_code(403); exit('Нет доступа'); }
}
if (!$j) { http_response_code(404); exit('Договор появится после выбора бригады'); }
$r = brig_one('SELECT * FROM br_requests WHERE id = ?', [(int)$j['request_id']]);
$o = db_one('SELECT * FROM orders WHERE id = ?', [(int)$r['order_id']]);
$of = brig_one('SELECT * FROM br_offers WHERE id = ?', [(int)$j['offer_id']]);
$b = brig_one('SELECT * FROM br_brigades WHERE id = ?', [(int)$j['brigade_id']]);
$bf = linea_private() . '/orders/' . $o['number'] . '/brief.json';
$brief = is_file($bf) ? (json_decode((string)file_get_contents($bf), true) ?: []) : [];
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
$rub = fn($kop) => number_format($kop / 100, 2, ',', ' ') . ' ₽';
$pack = json_decode((string)$r['pack'], true) ?: ['positions' => []];
$items = json_decode($of['items'], true) ?: [];
$stages = brig_all('SELECT * FROM br_stages WHERE job_id = ? ORDER BY idx', [(int)$j['id']]);
$addr = linea_str($brief['object']['address'] ?? '', 200) ?: '______________________________';
$line = '______________________';
$rows = ''; $n = 0;
foreach ($pack['positions'] as $p) {
    $it = $items[$p['id']] ?? null;
    if (!$it || $it['skip']) { continue; }
    $rows .= '<tr><td>' . (++$n) . '</td><td>' . $h($p['name']) . '</td><td>' . $h($p['unit']) . '</td><td class="r">' . ($p['qty'] !== null ? $h($p['qty']) : 'объём работ') . '</td><td class="r">'
        . $rub((int)round($it['price'] * 100)) . '</td><td class="r">' . $rub((int)$it['sum']) . '</td></tr>';
}
$skipped = array_filter($pack['positions'], fn($p) => !isset($items[$p['id']]) || $items[$p['id']]['skip']);
$st = ''; $acc = '';
foreach ($stages as $s) {
    $st .= '<tr><td>' . (int)$s['idx'] . '</td><td>' . $h($s['name']) . '</td><td>' . $h(date('d.m.Y', strtotime((string)$s['plan_start']))) . '</td><td>' . $h(date('d.m.Y', strtotime((string)$s['plan_end']))) . '</td></tr>';
    $c = brig_checklist($s['checklist']);
    $acc .= '<h4>' . (int)$s['idx'] . '. ' . $h($s['name']) . '</h4><ul>' . implode('', array_map(fn($i) => '<li>' . $h($i['text']) . ' <span class="src">(' . $h($i['src']) . ')</span></li>', $c['items'])) . '</ul>';
}
$date = date('d.m.Y');
echo '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">'
    . '<title>Договор подряда — ' . $h($o['number']) . '</title><style>'
    . 'body{font:14px/1.55 "Times New Roman",Georgia,serif;color:#111;max-width:820px;margin:24px auto;padding:0 18px}h1{font-size:20px;text-align:center;margin:0 0 4px}'
    . 'h2{font-size:16px;margin:22px 0 6px}h3{font-size:15px;margin:26px 0 6px;page-break-before:always}h4{font-size:14px;margin:12px 0 4px}'
    . 'table{width:100%;border-collapse:collapse;font-size:12.5px;margin:6px 0}td,th{border:1px solid #999;padding:4px 6px;vertical-align:top}.r{text-align:right;white-space:nowrap}'
    . '.draft{border:2px solid #b4462b;color:#b4462b;padding:8px 12px;margin:0 0 16px;font:13px/1.4 sans-serif}.src{color:#666;font-size:12px}.sig{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:30px}'
    . '.noprint{font:14px sans-serif;margin:0 0 16px}@media print{.noprint{display:none}body{margin:0}}</style></head><body>'
    . '<p class="noprint"><button onclick="window.print()">Печать / сохранить в PDF</button></p>'
    . '<div class="draft">ШАБЛОН, редакция от 31.10.2026, проект. Перед подписанием стороны сверяют реквизиты и условия; рекомендуем показать договор юристу. '
    . 'Студия LINEA стороной договора не является — договор заключается напрямую между Заказчиком и Подрядчиком.</div>'
    . '<h1>Договор подряда на ремонт квартиры № ' . $h($o['number']) . '-Р</h1><p style="text-align:center">г. Москва, «___» __________ 20__ г.</p>'
    . '<p><b>Заказчик:</b> ' . $h($o['name'] ?: $line) . ', паспорт ' . $line . ' (данные вносятся при подписании), тел. ' . $h($o['phone'] ?: $line) . ', e-mail ' . $h($o['email'] ?: $line) . '.</p>'
    . '<p><b>Подрядчик:</b> ' . $h($b['company'] ?: $b['name']) . ' (' . $h(BRIG_LEGAL[$b['legal']] ?? '') . '), ИНН ' . $h($b['inn']) . ', в лице ' . $h($b['contact_name']) . ', тел. ' . $h($b['phone']) . ', e-mail ' . $h($b['email']) . '.</p>'
    . '<h2>1. Предмет</h2><p>1.1. Подрядчик выполняет ремонтные работы на объекте: ' . $h($r['object_title']) . ', адрес: ' . $h($addr) . ' — по дизайн-проекту LINEA (Приложение 1) в объёме позиций Приложения 2, в сроки Приложения 3, и сдаёт результат Заказчику по Приложению 4.</p>'
    . '<p>1.2. Позиции, которые Подрядчик не выполняет (' . count($skipped) . '), перечислены в Приложении 2; Заказчик поручает их другим исполнителям.</p>'
    . '<h2>2. Цена и оплата</h2><p>2.1. Цена работ — <b>' . $rub((int)$of['total_kop']) . '</b> по позициям Приложения 2. Цена твёрдая; изменение объёма — дополнительным соглашением с подписанной сметой.</p>'
    . '<p>2.2. Материалы: ' . $h(BRIG_MATERIALS[$of['materials']] ?? '') . ($of['materials_note'] ? ' — ' . $h($of['materials_note']) : '') . '.</p>'
    . '<p>2.3. Оплата — поэтапно после приёмки каждого этапа (Приложение 3), безналично или иным согласованным способом, напрямую Подрядчику. Аванс — не более ____ % цены первого этапа.</p>'
    . '<h2>3. Сроки</h2><p>3.1. Начало работ — ' . $h(date('d.m.Y', strtotime((string)$of['start_date']))) . ', продолжительность — ' . (int)$of['days'] . ' календарных дней по графику Приложения 3.</p>'
    . '<h2>4. Приёмка</h2><p>4.1. Каждый этап сдаётся по чек-листу Приложения 4. Скрытые работы (электрика, сантехника, гидроизоляция, каркасы) закрываются только после подписанного акта освидетельствования скрытых работ (СП 71.13330.2017, п. 4.6).</p>'
    . '<p>4.2. Заказчик принимает этап или возвращает его с перечнем замечаний; Подрядчик устраняет замечания и сдаёт этап повторно. Ход приёмки и фото этапов фиксируются на странице заказа на сайте LINEA.</p>'
    . '<h2>5. Гарантия</h2><p>5.1. Гарантийный срок на работы — ' . (int)$of['warranty_months'] . ' мес. со дня подписания акта финальной приёмки (ст. 29 Закона РФ «О защите прав потребителей», ст. 724, 737, 756 ГК РФ).</p>'
    . '<h2>6. Ответственность и споры</h2><p>6.1. За нарушение сроков этапа по вине Подрядчика — неустойка по ст. 28 Закона РФ «О защите прав потребителей». 6.2. Споры решаются переговорами; LINEA по просьбе любой из сторон помогает в переписке и сверке с проектом, но решений за стороны не принимает. Иначе — в суде по закону.</p>'
    . '<h2>7. Персональные данные</h2><p>7.1. Стороны обрабатывают персональные данные друг друга только для исполнения договора (ст. 6 ч. 1 п. 5 152-ФЗ).</p>'
    . ((string)$of['comment'] !== '' ? '<h2>8. Особые условия Подрядчика</h2><p>' . nl2br($h($of['comment'])) . '</p>' : '')
    . '<div class="sig"><div><b>Заказчик</b><br><br>________________ / ' . $h($o['name']) . '</div><div><b>Подрядчик</b><br><br>________________ / ' . $h($b['contact_name']) . '</div></div>'
    . '<h3>Приложение 1. Проект</h3><p>Дизайн-проект LINEA по заказу ' . $h($o['number']) . ($o['delivered_url'] ? ', альбом: ' . $h($o['delivered_url']) : '') . '. При расхождении сметы и чертежей стороны руководствуются чертежами и согласуют уточнение письменно.</p>'
    . '<h3>Приложение 2. Смета по позициям Подрядчика</h3><table><tr><th>№</th><th>Работа</th><th>Ед.</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr>' . $rows
    . '<tr><td colspan="5" class="r"><b>Итого</b></td><td class="r"><b>' . $rub((int)$of['total_kop']) . '</b></td></tr></table>'
    . ($skipped ? '<p><b>Не выполняет Подрядчик:</b> ' . $h(implode('; ', array_map(fn($p) => $p['name'], $skipped))) . '.</p>' : '')
    . '<h3>Приложение 3. График этапов</h3><table><tr><th>№</th><th>Этап</th><th>Начало</th><th>Окончание</th></tr>' . $st . '</table>'
    . '<h3>Приложение 4. Порядок приёмки</h3><p>Этап принимается, когда выполнены пункты чек-листа; значения допусков — по указанным нормам. Акты скрытых работ — по форме приказа Минстроя № 344/пр.</p>' . $acc
    . '<p class="src">Сформировано ' . $h($date) . ' на сайте LINEA. Шаблон договора, редакция от 31.10.2026 (проект).</p></body></html>';
