<?php
/**
 * POST api/brief.php — приём брифа с сайта (js/brief.js), multipart:
 *   brief   — ZIP-архив, собранный в браузере (brief.json, brief.txt, план, фото); не распаковывается и не исполняется
 *   json    — тот же brief.json отдельным полем, чтобы разбирать без распаковки
 *   website — поле-ловушка для ботов (у людей пустое)
 *   test    — 1 для наших проверок (заказ помечается тестовым, писем нет)
 * Ответ: {ok, number, token, orderUrl}. Архив — linea-private/orders/<номер>/brief.zip, заказ — строка в linea.sqlite.
 *
 * Бриф сметы (09.11.2026, site/smeta/zakaz/, js/smeta-brief.js): тот же приём с meta.service = 'smeta' → заказ вида «smeta» без дизайн-проекта.
 *   brief.smeta = {mode: project|answers, rooms[], electric, plumbing, height, state, note, thick{plaster,screed,level — мм, только заданные}}; в архиве plan/ обязателен, proekt/ — при mode = project.
 *   Цена — config prices.smeta (та же, что у опции к проекту); опции к такому заказу не принимаются.
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/notify.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST'); linea_fail('Только POST', 405); }
// бриф с ПДн — только по https; по http — только наши проверки (test=1, заказ тестовый)
linea_require_https(linea_test_req((string)($_POST['test'] ?? $_GET['test'] ?? '') === '1'));   // test — только на маке или при allow_test (С-4)
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
// Согласие на обработку ПДн — отдельной неотмеченной галочкой в брифе (152-ФЗ, ст. 9; текст — soglasie/). Без него бриф не принимаем.
$consent = is_array($client['consent'] ?? null) ? $client['consent'] : [];
if (($consent['personalData'] ?? false) !== true) { linea_fail('Отметьте согласие на обработку персональных данных — без него бриф отправить нельзя'); }
$consentText = 'Согласие на обработку персональных данных, редакция ' . linea_str((string)($consent['edition'] ?? '?'), 20)
    . ' (soglasie/), отмечено в брифе ' . linea_str((string)($consent['at'] ?? ''), 30)
    . '; показ в портфолио: ' . (($consent['portfolio'] ?? false) === true ? 'да' : 'нет');

$isSmeta = ((string)($brief['meta']['service'] ?? '') === 'smeta');
if ($isSmeta) {
    // бриф сметы: либо готовый проект, либо опрос «что где»; без этого считать нечего
    $sm = is_array($brief['smeta'] ?? null) ? $brief['smeta'] : [];
    $smMode = (string)($sm['mode'] ?? '');
    if (!in_array($smMode, ['project', 'answers'], true)) { linea_fail('Выберите: у вас есть готовый проект или проекта нет — и мы пришлём вопросы «что где»'); }
    // толщины черновых слоёв, мм (необязательно): только заданные, диапазоны как в TERMS.addons.smeta.solo.thick (штукатурка 5–80, стяжка 20–150, наливной 2–30)
    $thickIn = is_array($sm['thick'] ?? null) ? $sm['thick'] : [];
    $thickOut = [];
    foreach (['plaster' => ['Штукатурка стен', 5, 80], 'screed' => ['Стяжка пола', 20, 150], 'level' => ['Наливной пол', 2, 30]] as $tk => [$tn, $tmin, $tmax]) {
        if (!isset($thickIn[$tk]) || $thickIn[$tk] === '' || $thickIn[$tk] === null) { continue; }
        if (!is_numeric($thickIn[$tk]) || (float)$thickIn[$tk] < $tmin || (float)$thickIn[$tk] > $tmax) { linea_fail($tn . ': толщина слоя от ' . $tmin . ' до ' . $tmax . ' мм. Не знаете — оставьте поле пустым'); }
        $thickOut[$tk] = round((float)$thickIn[$tk], 1);
    }
    if ($thickOut) { $brief['smeta']['thick'] = $thickOut; } else { unset($brief['smeta']['thick']); }
    if ($smMode === 'answers' && !array_filter((array)($sm['rooms'] ?? []), 'is_array')) { linea_fail('Отметьте хотя бы один тип помещений и чем он отделан — иначе считать нечего'); }
}
$test = linea_test_req((string)($_POST['test'] ?? '') === '1' || !empty($brief['meta']['test']));
// Площадь обязательна (01.11.2026): по ней сумма видна сразу на странице заказа (критик продукта, п. 3). Можно примерно —
// расхождение с планом пересчитывается по той же ставке (TERMS.areaRecalc в tools/site-shell.js).
$areaIn = $brief['object']['area'] ?? null;
if (!is_numeric($areaIn) || (float)$areaIn < 10 || (float)$areaIn > 3000) { linea_fail('Укажите площадь объекта, м² (от 10 до 3000) — по ней считается сумма. Точно не знаете — напишите примерно, уточним по плану'); }

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
$unpacked = 0; $nPlan = 0; $nProj = 0;
for ($i = 0; $i < $count; $i++) {
    $st = $zip->statIndex($i);
    $name = (string)($st['name'] ?? '');
    if ($name === '' || str_contains($name, '..') || $name[0] === '/' || str_contains($name, '\\') || !preg_match($allowed, $name)) {
        $zip->close(); linea_fail('В архиве файл неподходящего типа: ' . mb_substr(basename($name), 0, 60) . '. Можно фото, PDF, DWG');
    }
    $unpacked += (int)($st['size'] ?? 0);
    if (str_starts_with($name, 'plan/')) { $nPlan++; } elseif (str_starts_with($name, 'proekt/')) { $nProj++; }
}
$zip->close();
if ($isSmeta) {
    if ($nPlan < 1) { linea_fail('Приложите план квартиры с размерами — без него смету не посчитать'); }
    if ($smMode === 'project' && $nProj < 1) { linea_fail('Приложите файлы вашего проекта (PDF или изображения листов) — или выберите «проекта нет»'); }
}
if ($unpacked > $maxBytes * 2) { linea_fail('Архив слишком большой после распаковки'); }

// Заказ
$db = linea_db();
linea_schema();
$o = $brief['object'] ?? [];
$area = is_numeric($o['area'] ?? null) ? (float)$o['area'] : null;
$kind = $isSmeta ? 'smeta' : linea_kind_from_brief($brief);
$amount = linea_price($kind, $area);
// В-3: площадь можно занизить. Σ площадей помещений брифа заметно больше заявленной — онлайн-оплата только после подтверждения суммы
$roomsArea = 0.0;
foreach ((array)($brief['rooms'] ?? []) as $rm) {
    if (!is_array($rm)) { continue; }
    if (is_numeric($rm['area'] ?? null)) { $roomsArea += (float)$rm['area']; }
    elseif (is_numeric($rm['width'] ?? null) && is_numeric($rm['length'] ?? null)) { $roomsArea += (float)$rm['width'] * (float)$rm['length']; }   // схема брифа: width × length, м
}
$areaMismatch = !$isSmeta && $area && $roomsArea > $area * 1.1;
$token = bin2hex(random_bytes(16));
$now = linea_now();

// номер заказа — следующий за последним; блокировка от параллельного брифа: SQLite — BEGIN IMMEDIATE, MySQL — FOR UPDATE
$mysql = $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
if ($mysql) { $db->beginTransaction(); } else { $db->exec('BEGIN IMMEDIATE'); }
try {
    $pref = 'LN-' . date('ym') . '-';
    $q = $db->prepare('SELECT number FROM orders WHERE number LIKE ? ORDER BY number DESC LIMIT 1' . ($mysql ? ' FOR UPDATE' : ''));
    $q->execute([$pref . '%']);
    $last = (string)($q->fetchColumn() ?: '');
    $number = $pref . str_pad((string)((int)substr($last, -4) + 1), 4, '0', STR_PAD_LEFT);
    $db->prepare('INSERT INTO orders(number, token, status, kind, created_at, updated_at, ip, consent_at, consent_text, name, phone, email, contact,
            object_type, area, files_bytes, files_count, amount_kop, test, area_mismatch) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([$number, $token, 'awaiting_payment', $kind, $now, $now, linea_ip(), $now,
            $consentText,
            linea_str($client['name'] ?? '', 80), $phone, $email, linea_str($client['contact'] ?? '', 60),
            $isSmeta ? 'квартира' : linea_str($o['type'] ?? '', 30), $area, (int)$f['size'], $count, $amount, $test ? 1 : 0, $areaMismatch ? 1 : 0]);
    $id = (int)$db->lastInsertId();

    $dir = linea_private() . '/orders/' . $number;
    linea_mkdir($dir);
    if (!move_uploaded_file((string)$f['tmp_name'], $dir . '/brief.zip') && !rename((string)$f['tmp_name'], $dir . '/brief.zip')) {
        throw new RuntimeException('архив не сохранился');
    }
    chmod($dir . '/brief.zip', 0600);
    file_put_contents($dir . '/brief.json', json_encode($brief, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    chmod($dir . '/brief.json', 0600);
    if ($mysql) { $db->commit(); } else { $db->exec('COMMIT'); }
} catch (Throwable $e) {
    if ($mysql) { if ($db->inTransaction()) { $db->rollBack(); } } else { $db->exec('ROLLBACK'); }
    if (isset($dir) && is_dir($dir)) { @unlink($dir . '/brief.zip'); @unlink($dir . '/brief.json'); @rmdir($dir); }
    linea_log('error.log', 'brief: ' . $e->getMessage());
    linea_fail('Не получилось сохранить бриф — попробуйте ещё раз или пришлите архив в WhatsApp', 500);
}

linea_rate_add('brief');
// опции заказа (необязательные, отдельная строка оплаты): brief.options.smeta = true → «Смета на материалы». Цена — config prices.smeta (копейки);
// нет цены — опция записана, сумма «уточняется», сервис не падает. Сумму клиент видел на сайте, но верна серверная.
$optLine = '';
try {
    if (!$isSmeta && is_array($brief['options'] ?? null) && ($brief['options']['smeta'] ?? false) === true) {
        require_once __DIR__ . '/lib/options.php';
        $oOpt = linea_order_by_number($number);
        $ra = $oOpt ? opt_add($oOpt, 'smeta', 'brief') : null;
        if ($ra && $ra['ok']) { $optLine = 'Опция: ' . opt_title('smeta') . ' — ' . ($ra['row']['amount_kop'] ? number_format((int)$ra['row']['amount_kop'] / 100, 0, ',', ' ') . ' ₽' : 'сумма уточняется'); }
    }
} catch (Throwable $e) { linea_log('error.log', 'brief option: ' . $e->getMessage()); }
// кабинет клиента (С-2): до подтверждения почты кодом аккаунт не создаётся и заказ ни к кому не привязывается — согласия пишутся без аккаунта
// (account_id = 0) и переходят к аккаунту при первом входе кодом (kab_client_account); бриф на чужую почту не попадает в чужой кабинет сам
if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
    try {
        require_once __DIR__ . '/lib/kabinet.php';
        brig_db();
        $accId = 0;
        foreach (['pd' => 'Обработка персональных данных'] + (str_contains($consentText, 'портфолио: да') ? ['portfolio' => 'Показ в портфолио'] : []) as $k => $_) {
            db_insert('consents', ['account_id' => $accId, 'order_id' => $id, 'kind' => $k, 'edition' => (string)($consent['edition'] ?? '—'), 'given_at' => $now, 'ip' => linea_ip(), 'text' => $consentText]);
        }
        // письмо-подтверждение сразу: номер, сумма (или «подтвердим»), что дальше, ссылка в кабинет. Аккаунта ещё нет (account_id = 0) —
        // колокольчика нет, но письмо уходит на почту из брифа (критик кабинета 09.11.2026, находка 2)
        $oNew = linea_order_by_number($number);
        if ($oNew) { kab_notify_order($oNew, kab_ev('brief', $oNew)); }
    } catch (Throwable $e) { linea_log('error.log', 'brief kabinet: ' . $e->getMessage()); }
}
linea_event($id, 'site', ($isSmeta ? 'Заказ сметы получен с сайта (' . ($smMode === 'project' ? 'есть проект' : 'проекта нет, ответы «что где»') . '): ' : 'Бриф получен с сайта: ') . $count . ' файлов, ' . round((int)$f['size'] / 1048576, 1) . ' МБ' . ($test ? ' (тест)' : ''));
linea_log('orders.log', 'new ' . $number . ($test ? ' test' : '') . ' ' . $kind . ' ' . (int)$f['size']);
linea_notify($isSmeta ? 'LINEA: новый заказ сметы ' . $number : 'LINEA: новый бриф ' . $number, implode("\n", [
    ($isSmeta ? 'Новый заказ сметы ' : 'Новый бриф ') . $number . ' — ' . (LINEA_KINDS[$kind] ?? $kind) . ($area ? ', ' . $area . ' м²' : ''),
    'Клиент: ' . linea_str($client['name'] ?? '', 80) . ' ' . $phone . ' ' . $email,
    'Сумма: ' . ($amount ? number_format($amount / 100, 0, ',', ' ') . ' ₽' : 'уточняется — выставьте в закрытой странице'),
    $optLine,
    'Заказы: ' . linea_base() . '/api/admin.php',
]), $test);

linea_json(['ok' => true, 'number' => $number, 'token' => $token, 'orderUrl' => 'order.html?t=' . $token]);
