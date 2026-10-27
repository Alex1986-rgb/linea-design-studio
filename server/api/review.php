<?php
/**
 * POST api/review.php — правки к листам с review.html (JSON до 1 МБ, без файлов):
 *   {project: '<слаг>', t: '<токен заказа, если есть>', from: 'имя', phone: '…', notes: [{file, n, text, x, y}], test: 1}
 * Сохраняет linea-private/reviews/<слаг>/<дата>-<код>.json; если токен совпал с заказом — пишет событие в заказ.
 * Ответ: {ok, number} — номер правок R-… для подтверждения клиенту.
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/notify.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST'); linea_fail('Только POST', 405); }
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 1048576) { linea_fail('Слишком много текста — отправьте частями', 413); }
$in = json_decode((string)file_get_contents('php://input', false, null, 0, 1048577), true);
if (!is_array($in)) { linea_fail('Правки не прочитались — нажмите «Отправить» ещё раз'); }
if (trim((string)($in['website'] ?? '')) !== '') { linea_json(['ok' => true, 'number' => 'R-0000']); }
$slug = preg_replace('/[^a-z0-9-]/i', '', (string)($in['project'] ?? '')) ?? '';
$notes = array_values(array_filter(is_array($in['notes'] ?? null) ? $in['notes'] : [], fn($n) => is_array($n) && trim((string)($n['text'] ?? '')) !== ''));
if ($slug === '' || !$notes) { linea_fail('Нет правок для отправки'); }
if (count($notes) > 500) { linea_fail('Правок больше 500 — отправьте частями'); }
if (!linea_rate('review', (int)linea_cfg()['reviews_per_hour'])) { linea_fail('Слишком много отправок за час — напишите нам в WhatsApp', 429); }

$order = linea_order_by_token((string)($in['t'] ?? ''));
$test = !empty($in['test']) || ($order && $order['test']);
$clean = array_map(fn($n) => [
    'file' => linea_str($n['file'] ?? '', 160), 'n' => (int)($n['n'] ?? 0), 'text' => linea_str($n['text'] ?? '', 4000),
    'x' => is_numeric($n['x'] ?? null) ? round((float)$n['x'], 1) : null, 'y' => is_numeric($n['y'] ?? null) ? round((float)$n['y'], 1) : null,
], $notes);
$number = 'R-' . date('ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 5));
$dir = linea_private() . '/reviews/' . $slug;
linea_mkdir($dir);
$rec = ['number' => $number, 'project' => $slug, 'order' => $order['number'] ?? null, 'from' => linea_str($in['from'] ?? '', 80),
    'phone' => linea_str($in['phone'] ?? '', 40), 'at' => linea_now(), 'test' => $test, 'notes' => $clean];
file_put_contents($dir . '/' . date('Ymd-His') . '-' . $number . '.json', json_encode($rec, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
if ($order) { linea_event((int)$order['id'], 'site', 'Правки ' . $number . ' к альбому: ' . count($clean) . ' шт.'); }
linea_log('orders.log', 'review ' . $number . ' ' . $slug . ($test ? ' test' : '') . ' ' . count($clean));
linea_notify('LINEA: правки ' . $number . ' к ' . $slug, count($clean) . ' правок к проекту ' . $slug . ($order ? ' (заказ ' . $order['number'] . ')' : '')
    . "\nОт: " . $rec['from'] . ' ' . $rec['phone'] . "\n" . linea_base() . '/api/admin.php?view=reviews', $test);
linea_json(['ok' => true, 'number' => $number]);
