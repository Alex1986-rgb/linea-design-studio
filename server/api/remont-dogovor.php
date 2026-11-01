<?php
/**
 * api/remont-dogovor.php — договор подряда и допсоглашения сделки (HTML для печати в PDF: «Печать → Сохранить как PDF»).
 *   ?t=<токен заказа>      — заказчик своего заказа;   ?j=<объект> — бригада по своей сессии (только свой объект)
 * Обе стороны видят ОДНИ И ТЕ ЖЕ версии: текст из br_contracts (замороженный, lib/contract.php) с хешем SHA-256 и отметками подписи
 * (время; IP — только в админке). Реквизиты и контакты сторон — отдельным блоком, после подписания договора обеими сторонами.
 * LINEA стороной договора подряда не является (агент бригады по агентскому договору). Шаблон — проверить юристом.
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
brig_contract_main($j);
$r = brig_one('SELECT * FROM br_requests WHERE id = ?', [(int)$j['request_id']]);
$o = db_one('SELECT * FROM orders WHERE id = ?', [(int)$r['order_id']]);
$b = brig_one('SELECT * FROM br_brigades WHERE id = ?', [(int)$j['brigade_id']]);
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
$dt = fn($s) => $s ? date('d.m.Y H:i', strtotime((string)$s)) : 'не подписано';
$open = brig_contacts_open($j);
$docs = '';
foreach (brig_all("SELECT * FROM br_contracts WHERE job_id = ? AND status <> 'void' ORDER BY id", [(int)$j['id']]) as $c) {
    $docs .= '<section class="doc">' . $c['body']
        . '<div class="sig"><div><b>Заказчик</b><br>' . ($c['client_signed_at'] ? 'подписано ПЭП ' . $h($dt($c['client_signed_at'])) : 'не подписано') . '</div>'
        . '<div><b>Подрядчик</b><br>' . ($c['brigade_signed_at'] ? 'подписано ПЭП ' . $h($dt($c['brigade_signed_at'])) : 'не подписано') . '</div></div>'
        . '<p class="hash">Версия документа: SHA-256 <code>' . $h($c['hash']) . '</code> · создана ' . $h($dt($c['created_at'])) . ' · статус: ' . ($c['status'] === 'signed' ? 'подписан обеими сторонами' : 'ждёт подписи') . '</p></section>';
}
$bf = linea_private() . '/orders/' . $o['number'] . '/brief.json';
$brief = is_file($bf) ? (json_decode((string)file_get_contents($bf), true) ?: []) : [];
$req = $open
    ? '<section class="doc"><h2>Реквизиты и контакты сторон</h2><p><b>Заказчик:</b> ' . $h($o['name']) . ', тел. ' . $h($o['phone']) . ', e-mail ' . $h($o['email'])
        . ', адрес объекта: ' . $h(linea_str($brief['object']['address'] ?? '', 200) ?: '—') . ', паспорт — вносится при печати.</p>'
        . '<p><b>Подрядчик:</b> ' . $h($b['company'] ?: $b['name']) . ' (' . $h(BRIG_LEGAL[$b['legal']] ?? '') . '), ИНН ' . $h($b['inn']) . ', в лице ' . $h($b['contact_name']) . ', тел. ' . $h($b['phone']) . ', e-mail ' . $h($b['email']) . '.</p></section>'
    : '<div class="draft">Реквизиты и контакты сторон откроются здесь, когда договор подпишут на сайте и заказчик, и подрядчик. До этого — переписка в карточке сделки.</div>';
echo '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">'
    . '<title>Договор подряда — ' . $h($o['number']) . '</title><style>'
    . 'body{font:14px/1.55 "Times New Roman",Georgia,serif;color:#111;max-width:820px;margin:24px auto;padding:0 18px}h1{font-size:20px;text-align:center;margin:0 0 4px}'
    . 'h2{font-size:16px;margin:22px 0 6px}h3{font-size:15px;margin:26px 0 6px}h4{font-size:14px;margin:12px 0 4px}.doc{margin:0 0 40px;page-break-after:always}'
    . 'table{width:100%;border-collapse:collapse;font-size:12.5px;margin:6px 0}td,th{border:1px solid #999;padding:4px 6px;vertical-align:top}.r{text-align:right;white-space:nowrap}'
    . '.draft{border:2px solid #b4462b;color:#b4462b;padding:8px 12px;margin:0 0 16px;font:13px/1.4 sans-serif}.src{color:#666;font-size:12px}.sig{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:24px}'
    . '.hash{font:12px/1.4 sans-serif;color:#444;word-break:break-all}.noprint{font:14px sans-serif;margin:0 0 16px}@media print{.noprint{display:none}body{margin:0}}</style></head><body>'
    . '<p class="noprint"><button onclick="window.print()">Печать / сохранить в PDF</button></p>'
    . '<div class="draft">Договор и допсоглашения заключаются только на сайте LINEA и подписываются простой электронной подписью (код на почту стороны). '
    . 'Обе стороны видят одни и те же версии — сверить можно по хешу SHA-256. Шаблон договора — редакция ' . BRIG_CONTRACT_ED . '; рекомендуем показать его юристу.</div>'
    . $docs . $req . '</body></html>';
