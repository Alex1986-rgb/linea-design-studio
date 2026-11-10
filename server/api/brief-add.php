<?php
/**
 * api/brief-add.php — «ответить на дополнительные вопросы» к уже отправленному брифу (brief.html?add=<токен заказа>).
 *   GET  ?t=<токен>          → {ok, number, life, tech, home} — уже сохранённые ответы, чтобы форма их показала
 *   POST json {t, life?, tech?, home?} → дополняет brief.json ТОЛЬКО необязательными шагами; прежняя версия брифа остаётся в
 *        orders/<номер>/dopolnenie/brief-до-<время>.json. Контакты, площадь, помещения, согласия не меняются.
 * Токен — тот же, что у ссылки на заказ; ПДн в адрес не кладём. Писем клиенту не шлём (он сам только что отправил), студии — уведомление.
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require_once __DIR__ . '/lib/brig.php';
require_once __DIR__ . '/lib/kabinet.php';
require_once __DIR__ . '/lib/brief-view.php';
require_once __DIR__ . '/lib/brig-notify.php';

const BRIEF_ADD_KEYS = ['life', 'tech', 'home'];

$in = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' ? brig_input() : $_GET;
$o = linea_order_by_token(trim((string)($in['t'] ?? '')));
if (!$o) { linea_fail('Заказ не найден — проверьте ссылку', 404); }
if (!linea_rate('briefadd', 60)) { linea_fail('Слишком много запросов — подождите немного', 429); }
if (in_array($o['status'], ['cancelled', 'refunded'], true)) { linea_fail('Заказ закрыт — напишите нам, если нужно что-то добавить', 409); }

$b = brief_load($o);
if (!$b) { linea_fail('Бриф этого заказа не найден — напишите нам', 404); }

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    $out = ['ok' => true, 'number' => $o['number']];
    foreach (BRIEF_ADD_KEYS as $k) { $out[$k] = is_array($b[$k] ?? null) ? $b[$k] : null; }
    $out['hasRooms'] = !empty($b['rooms']);
    linea_json($out);
}

$new = []; 
foreach (BRIEF_ADD_KEYS as $k) {
    $v = $in[$k] ?? null;
    if (!is_array($v) || !empty($v['skipped'])) { continue; }
    if ((int)($v['answered'] ?? 0) < 1 && empty($v['text'])) { continue; }
    if (strlen((string)json_encode($v, JSON_UNESCAPED_UNICODE)) > 150000) { linea_fail('Слишком большой ответ — сократите свободные заметки'); }
    $new[$k] = $v;
}
if (!$new) { linea_fail('Нет ответов, которые можно добавить — отметьте хотя бы один вариант'); }

$dir = kab_order_dir($o) . '/dopolnenie';
linea_mkdir($dir);
$f = kab_order_dir($o) . '/brief.json';
$stamp = date('Ymd-His');
@file_put_contents($dir . '/brief-до-' . $stamp . '.json', (string)file_get_contents($f), LOCK_EX); @chmod($dir . '/brief-до-' . $stamp . '.json', 0600);
$names = ['life' => 'Жизнь в квартире', 'tech' => 'Двери, свет и электрика', 'home' => 'Дом и ремонт'];
foreach ($new as $k => $v) { $b[$k] = $v; }
$b['addedAt'] = array_merge(is_array($b['addedAt'] ?? null) ? $b['addedAt'] : [], [$stamp => array_keys($new)]);
file_put_contents($f, json_encode($b, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX); @chmod($f, 0600);

$list = implode(', ', array_map(fn($k) => '«' . $names[$k] . '»', array_keys($new)));
linea_event((int)$o['id'], 'client', 'Бриф дополнен ответами: ' . $list);
brig_admin_notify('Клиент дополнил бриф: ' . $o['number'], 'Добавлены шаги: ' . $list, brig_link('api/panel.php?s=order&o=' . rawurlencode($o['number']) . '&tab=brif'), (bool)$o['test']);
linea_json(['ok' => true, 'saved' => array_keys($new)]);
