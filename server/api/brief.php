<?php
/**
 * POST api/brief.php — приём брифа с сайта (js/brief.js), multipart:
 *   brief   — ZIP-архив, собранный в браузере (brief.json, brief.txt, план, фото); не распаковывается и не исполняется
 *   json    — тот же brief.json отдельным полем, чтобы разбирать без распаковки
 *   website — поле-ловушка для ботов (у людей пустое)
 *   test    — 1 для наших проверок (заказ помечается тестовым, писем нет)
 * Ответ: {ok, number, token, orderUrl}. Архив — linea-private/orders/<номер>/brief.zip, заказ — строка в linea.sqlite.
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/notify.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST'); linea_fail('Только POST', 405); }
$cfg = linea_cfg();
$maxBytes = (int)$cfg['max_upload_mb'] * 1048576;

// Запрос больше post_max_size PHP молча обнуляет $_POST и $_FILES — говорим об этом прямо
$len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($len > $maxBytes + 2097152) { linea_fail('Файлы больше ' . $cfg['max_upload_mb'] . ' МБ — уберите часть фото или пришлите их в WhatsApp', 413); }
if ($len > 0 && empty($_POST) && empty($_FILES)) { linea_fail('Сервер не принял такой большой запрос — уменьшите число фото', 413); }

// Ловушка: бот заполнил скрытое поле — отвечаем как будто всё хорошо, но ничего не храним
if (trim((string)($_POST['website'] ?? '')) !== '') { linea_json(['ok' => true, 'number' => 'LN-0000-0000', 'token' => '', 'orderUrl' => 'thanks/']); }

$brief = json_decode((string)($_POST['json'] ?? ''), true);
if (!is_array($brief)) { linea_fail('Бриф не прочитался — обновите страницу и отправьте ещё раз'); }
$client = is_array($brief['client'] ?? null) ? $brief['client'] : [];
$phone = linea_str($client['phone'] ?? '', 40);
$email = linea_str($client['email'] ?? '', 120);
if ($phone === '' && $email === '') { linea_fail('Оставьте телефон или e-mail — иначе мы не сможем прислать проект'); }
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) { linea_fail('Проверьте e-mail — в нём ошибка'); }
if ($phone !== '' && strlen(preg_replace('/\D/', '', $phone) ?? '') < 10) { linea_fail('Проверьте телефон — в нём меньше 10 цифр'); }

$test = (string)($_POST['test'] ?? '') === '1' || !empty($brief['meta']['test']);

if (!linea_rate('brief', (int)$cfg['briefs_per_hour'], false)) { linea_fail('С этого адреса уже отправлено несколько брифов за час. Напишите нам в WhatsApp: +7 925 733-86-40', 429); }

// Архив: размер, что это ZIP, что внутри только ожидаемые файлы без путей наружу
$f = $_FILES['brief'] ?? null;
if (!$f || !is_array($f) || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    $e = (int)($f['error'] ?? UPLOAD_ERR_NO_FILE);
    linea_fail(in_array($e, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 'Архив слишком большой для сервера — уберите часть фото' : 'Архив не дошёл — отправьте ещё раз', $e === UPLOAD_ERR_INI_SIZE ? 413 : 400);
}
if ((int)$f['size'] > $maxBytes) { linea_fail('Архив больше ' . $cfg['max_upload_mb'] . ' МБ — уберите часть фото или пришлите их в WhatsApp', 413); }
$zip = new ZipArchive();
if ($zip->open((string)$f['tmp_name'], ZipArchive::RDONLY) !== true) { linea_fail('Это не архив брифа — обновите страницу и отправьте ещё раз'); }
$allowed = '/\.(json|txt|jpe?g|png|webp|heic|heif|gif|pdf|dwg|dxf|tiff?|bmp)$/i';
$count = $zip->numFiles;
if ($count < 1 || $count > 300) { $zip->close(); linea_fail('В архиве ' . $count . ' файлов — так много не принимаем'); }
$unpacked = 0;
for ($i = 0; $i < $count; $i++) {
    $st = $zip->statIndex($i);
    $name = (string)($st['name'] ?? '');
    if ($name === '' || str_contains($name, '..') || $name[0] === '/' || str_contains($name, '\\') || !preg_match($allowed, $name)) {
        $zip->close(); linea_fail('В архиве файл неподходящего типа: ' . mb_substr(basename($name), 0, 60) . '. Можно фото, PDF, DWG');
    }
    $unpacked += (int)($st['size'] ?? 0);
}
$zip->close();
if ($unpacked > $maxBytes * 2) { linea_fail('Архив слишком большой после распаковки'); }

// Заказ
$db = linea_db();
$o = $brief['object'] ?? [];
$area = is_numeric($o['area'] ?? null) ? (float)$o['area'] : null;
$kind = linea_kind_from_brief($brief);
$amount = linea_price($kind, $area);
$token = bin2hex(random_bytes(16));
$now = linea_now();

$db->exec('BEGIN IMMEDIATE');
try {
    $pref = 'LN-' . date('ym') . '-';
    $q = $db->prepare('SELECT number FROM orders WHERE number LIKE ? ORDER BY number DESC LIMIT 1');
    $q->execute([$pref . '%']);
    $last = (string)($q->fetchColumn() ?: '');
    $number = $pref . str_pad((string)((int)substr($last, -4) + 1), 4, '0', STR_PAD_LEFT);
    $db->prepare('INSERT INTO orders(number, token, status, kind, created_at, updated_at, ip, consent_at, consent_text, name, phone, email, contact,
            object_type, area, files_bytes, files_count, amount_kop, test) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([$number, $token, 'awaiting_payment', $kind, $now, $now, linea_ip(), $now,
            'Отправляя бриф, вы соглашаетесь на обработку данных для подготовки проекта (brief.html, policy/)',
            linea_str($client['name'] ?? '', 80), $phone, $email, linea_str($client['contact'] ?? '', 60),
            linea_str($o['type'] ?? '', 30), $area, (int)$f['size'], $count, $amount, $test ? 1 : 0]);
    $id = (int)$db->lastInsertId();

    $dir = linea_private() . '/orders/' . $number;
    linea_mkdir($dir);
    if (!move_uploaded_file((string)$f['tmp_name'], $dir . '/brief.zip') && !rename((string)$f['tmp_name'], $dir . '/brief.zip')) {
        throw new RuntimeException('архив не сохранился');
    }
    chmod($dir . '/brief.zip', 0600);
    file_put_contents($dir . '/brief.json', json_encode($brief, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    chmod($dir . '/brief.json', 0600);
    $db->exec('COMMIT');
} catch (Throwable $e) {
    $db->exec('ROLLBACK');
    if (isset($dir) && is_dir($dir)) { @unlink($dir . '/brief.zip'); @unlink($dir . '/brief.json'); @rmdir($dir); }
    linea_log('error.log', 'brief: ' . $e->getMessage());
    linea_fail('Не получилось сохранить бриф — попробуйте ещё раз или пришлите архив в WhatsApp', 500);
}

linea_rate_add('brief');
linea_event($id, 'site', 'Бриф получен с сайта: ' . $count . ' файлов, ' . round((int)$f['size'] / 1048576, 1) . ' МБ' . ($test ? ' (тест)' : ''));
linea_log('orders.log', 'new ' . $number . ($test ? ' test' : '') . ' ' . $kind . ' ' . (int)$f['size']);
linea_notify('LINEA: новый бриф ' . $number, implode("\n", [
    'Новый бриф ' . $number . ' — ' . (LINEA_KINDS[$kind] ?? $kind) . ($area ? ', ' . $area . ' м²' : ''),
    'Клиент: ' . linea_str($client['name'] ?? '', 80) . ' ' . $phone . ' ' . $email,
    'Сумма: ' . ($amount ? number_format($amount / 100, 0, ',', ' ') . ' ₽' : 'уточняется — выставьте в закрытой странице'),
    'Заказы: ' . linea_base() . '/api/admin.php',
]), $test);

linea_json(['ok' => true, 'number' => $number, 'token' => $token, 'orderUrl' => 'order.html?t=' . $token]);
