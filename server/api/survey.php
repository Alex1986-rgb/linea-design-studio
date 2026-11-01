<?php
/**
 * POST api/survey.php — приём обмера с формы site/obmer/ (JSON до 2 МБ, без фото):
 *   {survey: {format: 'linea-survey/1', survey: {by, date}, object, rooms[]}, t: '<токен заказа, если есть>', website: '', test: 1}
 * Сохраняет linea-private/surveys/<ГГГГММДД-ччммсс>-<номер>.json (права 0600); если токен совпал с заказом —
 * событие в заказе. Фото сюда не идут: на форме — только номера снимков, сами снимки замерщик присылает отдельно.
 * Ответ: {ok, number} — номер обмера O-… для подтверждения замерщику.
 * Перевод в проект движка — tools/survey-to-project.mjs (на маке, по сохранённому файлу).
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/notify.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST'); linea_fail('Только POST', 405); }
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 2097152) { linea_fail('Обмер больше 2 МБ — проверьте, не попали ли в него фото', 413); }
$in = json_decode((string)file_get_contents('php://input', false, null, 0, 2097153), true);
if (!is_array($in)) { linea_fail('Обмер не прочитался — нажмите «Отправить» ещё раз или скачайте файл'); }
// адрес объекта и имя замерщика — только по https (кроме наших проверок test=1 и запуска на маке)
linea_require_https(linea_test_req(!empty($in['test'])));
if (trim((string)($in['website'] ?? '')) !== '') { linea_json(['ok' => true, 'number' => 'O-0000']); }

$s = $in['survey'] ?? null;
if (!is_array($s) || ($s['format'] ?? '') !== 'linea-survey/1') { linea_fail('Это не файл обмера (format linea-survey/1)'); }
$by = linea_str($s['survey']['by'] ?? '', 80);
$date = (string)($s['survey']['date'] ?? '');
if ($by === '') { linea_fail('Укажите, кто мерил: обмер без автора в проект не идёт'); }
if (!preg_match('/^\d{2}\.\d{2}\.\d{4}$/', $date)) { linea_fail('Укажите дату обмера в виде ДД.ММ.ГГГГ'); }
$rooms = is_array($s['rooms'] ?? null) ? $s['rooms'] : [];
if (!$rooms) { linea_fail('В обмере нет ни одного помещения'); }
if (count($rooms) > 60) { linea_fail('Помещений больше 60 — отправьте файлом в WhatsApp'); }
if (!linea_rate('survey', (int)(linea_cfg()['surveys_per_hour'] ?? 20))) { linea_fail('Слишком много отправок за час — пришлите файл обмера в WhatsApp', 429); }

$order = linea_order_by_token((string)($in['t'] ?? ''));
$test = linea_test_req(!empty($in['test'])) || ($order && $order['test']) || !empty($s['meta']['example']);
$number = 'O-' . date('ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 5));
$dir = linea_private() . '/surveys';
linea_mkdir($dir);
$rec = ['number' => $number, 'order' => $order['number'] ?? null, 'at' => linea_now(), 'ip' => linea_ip(), 'test' => $test, 'survey' => $s];
$file = $dir . '/' . date('Ymd-His') . '-' . $number . '.json';
if (file_put_contents($file, json_encode($rec, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)) === false) {
    linea_log('error.log', 'survey: не записан ' . $file);
    linea_fail('Не получилось сохранить обмер — скачайте файл и пришлите его в WhatsApp', 500);
}
chmod($file, 0600);
if ($order) { linea_event((int)$order['id'], 'site', 'Обмер ' . $number . ' от ' . $by . ' (' . $date . '): помещений ' . count($rooms)); }
linea_log('orders.log', 'survey ' . $number . ($test ? ' test' : '') . ' ' . count($rooms));
linea_notify('LINEA: обмер ' . $number, 'Обмер ' . $number . ($order ? ' к заказу ' . $order['number'] : '') . "\nЗамерщик: " . $by . ', ' . $date
    . "\nОбъект: " . linea_str($s['meta']['address'] ?? '', 200) . "\nПомещений: " . count($rooms) . "\nФайл: linea-private/surveys/" . basename($file), $test);
linea_json(['ok' => true, 'number' => $number]);
