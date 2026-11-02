<?php
/**
 * Модульные проверки сервера (без браузера и без боевых данных): php tools/test-units.php <папка-данных> <адрес-макета-ЮKassa> <папка-макета>
 * Запускается из tools/test-brigady.mjs (шаг 17). Печатает строки «  ✓ …» / «  ✗ …», код выхода 1 при ошибке.
 * Что проверяет: linea_ip (X-Forwarded-For не читается, X-Real-IP — только от доверенного прокси), linea_base без Host запроса,
 * чистку rate/, условия бригад из config (brig_terms), фильтр контактов, телефон и tax_system_code в чеке 54-ФЗ,
 * платёж на отменённый заказ (не успех, пометка один раз) и обычную оплату через макет API.
 */
declare(strict_types=1);
[$priv, $mock, $mockDir] = [$argv[1] ?? '', $argv[2] ?? '', $argv[3] ?? ''];
if ($priv === '' || $mock === '' || $mockDir === '') { fwrite(STDERR, "usage: php tools/test-units.php <private> <mock-url> <mock-dir>\n"); exit(2); }
@mkdir($priv, 0700, true);
file_put_contents($priv . '/config.php', "<?php return ['mode' => 'yookassa', 'yk_shop_id' => 'test-shop', 'yk_secret' => 'test-secret', 'yk_api' => " . var_export($mock, true)
    . ", 'yk_receipt' => true, 'yk_tax_system' => 2, 'notify_enabled' => false, 'brig_terms' => ['rate' => 0.05, 'sheets_free_limit' => 15]];");
putenv('LINEA_PRIVATE=' . $priv);
putenv('LINEA_MAIL_DRY=1');
$_SERVER['SCRIPT_FILENAME'] = __FILE__;
require __DIR__ . '/../server/api/lib/boot.php';
require __DIR__ . '/../server/api/lib/yookassa.php';
require __DIR__ . '/../server/api/lib/brig.php';

$fail = 0;
$ok = function (bool $c, string $m) use (&$fail) { echo ($c ? '  ✓ ' : '  ✗ ') . $m . "\n"; if (!$c) { $fail++; } };

// ── адрес клиента
$_SERVER['REMOTE_ADDR'] = '203.0.113.5'; $_SERVER['HTTP_X_REAL_IP'] = '1.2.3.4'; $_SERVER['HTTP_X_FORWARDED_FOR'] = '5.6.7.8';
$ok(linea_ip() === '203.0.113.5', 'linea_ip: прямой запрос — REMOTE_ADDR, подставные X-Real-IP и X-Forwarded-For не читаются');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
$ok(linea_ip() === '1.2.3.4', 'linea_ip: от доверенного прокси (локальный nginx) — X-Real-IP');
unset($_SERVER['HTTP_X_REAL_IP']);
$ok(linea_ip() === '127.0.0.1', 'linea_ip: X-Forwarded-For не используется даже от прокси');
// ── адрес сайта в письмах
$_SERVER['REMOTE_ADDR'] = '203.0.113.5'; $_SERVER['HTTP_HOST'] = 'evil.example';
$ok(linea_base() === LINEA_BASE_DEFAULT && !str_contains(brig_link('brigada/#reset=x'), 'evil'), 'ссылки в письмах — не из заголовка Host (адрес домена по умолчанию)');
// ── чистка счётчиков частоты
linea_mkdir($priv . '/rate');
touch($priv . '/rate/old-x', time() - 3 * 86400); touch($priv . '/rate/new-x');
linea_rate_gc();
$ok(!is_file($priv . '/rate/old-x') && is_file($priv . '/rate/new-x'), 'rate/: файлы старше суток удаляются, свежие остаются');
// ── условия бригад: config поверх значений по умолчанию
$ok(brig_rate_text() === '5 %' && brig_commission(10000000) === 500000 && brig_terms()['contacts_after'] === 'signed', 'brig_terms: ставка из config (5 %), контакты — после подтверждения договора');
$ok(str_contains(brig_terms_public()['sheetsText'], 'до 15 листов'), 'лимит листов по запросу — из того же источника');
// ── фильтр контактов
$cases = ['Звоните 8 (925) 733-86-40' => true, '+7 925 7338640' => true, 'пишите в вотсап' => true, 'ivan@mail.ru' => true, 't.me/remont' => true, 'сайт ремонт.рф' => true,
    '@remont_pro' => true, 'в личку' => true, 'Итого 150 000 – 200 000 ₽' => false, 'по СП 71.13330.2017, п. 4.6' => false, 'Плитка 60х120, шов 2 мм' => false, 'Вывоз мусора включён' => false];
$bad = [];
foreach ($cases as $t => $want) { if ((bool)brig_contact_scan($t)[1] !== $want) { $bad[] = $t; } }
$ok(!$bad, 'фильтр контактов: ' . count($cases) . ' примеров (телефоны, почта, ссылки, мессенджеры; суммы и нормы не задеваются)' . ($bad ? ' — ошибки: ' . implode(' | ', $bad) : ''));
// ── чек 54-ФЗ
$ok(yk_phone('8 (925) 733-86-40') === '79257338640' && yk_phone('+7 925 733 86 40') === '79257338640' && yk_phone('9257338640') === '79257338640' && yk_phone('12345') === '', 'телефон для чека: 7XXXXXXXXXX');
$rc = yk_receipt(['email' => 'a@example.test', 'phone' => '8 925 733-86-40', 'kind' => 'kvartira', 'number' => 'LN-1'], 10000);
$ok(($rc['tax_system_code'] ?? null) === 2 && $rc['customer']['phone'] === '79257338640', 'чек: tax_system_code из config, телефон нормализован');
// ── оплата через макет API
$db = linea_db();
$mk = function (string $num, string $status, ?string $pid) use ($db): array {
    $db->prepare("INSERT INTO orders(number, token, status, kind, created_at, updated_at, amount_kop, payment_id, test) VALUES(?,?,?,?,?,?,?,?,1)")
        ->execute([$num, bin2hex(random_bytes(16)), $status, 'kvartira', linea_now(), linea_now(), 8000000, $pid]);
    return linea_order_by_number($num);
};
$pay = fn(string $id, string $num) => file_put_contents($mockDir . '/' . $id . '.json', json_encode(['id' => $id, 'status' => 'succeeded', 'paid' => true,
    'amount' => ['value' => '80000.00', 'currency' => 'RUB'], 'metadata' => ['order' => $num]]));
@mkdir($mockDir, 0700, true);
$c = $mk('LN-TEST-0001', 'cancelled', null);
$pay('2f1b0c3e-000f-5000-8000-000000000001', 'LN-TEST-0001');
$r1 = yk_settle('2f1b0c3e-000f-5000-8000-000000000001');
$r2 = yk_settle('2f1b0c3e-000f-5000-8000-000000000001');
$ev = (int)$db->query("SELECT COUNT(*) FROM events WHERE order_id = " . (int)$c['id'] . " AND text LIKE 'ВНИМАНИЕ%'")->fetchColumn();
$ok($r1['ok'] && !$r1['paid'] && linea_order_by_number('LN-TEST-0001')['status'] === 'cancelled' && $ev === 1 && !$r2['paid'],
    'платёж на отменённый заказ — не «успех»: заказ не меняется, пометка в истории один раз, письмо Александру');
$a = $mk('LN-TEST-0002', 'awaiting_payment', null);
$pay('2f1b0c3e-000f-5000-8000-000000000002', 'LN-TEST-0002');
$r3 = yk_settle('2f1b0c3e-000f-5000-8000-000000000002');
$r4 = yk_settle('2f1b0c3e-000f-5000-8000-000000000002');
$ok($r3['paid'] && $r4['paid'] && linea_order_by_number('LN-TEST-0002')['status'] === 'paid', 'обычная оплата: заказ оплачен, повтор уведомления — без изменений');
$ok(!yk_settle('2f1b0c3e-000f-5000-8000-0000000000ff')['paid'], 'неизвестный платёж (404 у API) — ничего не меняется');
// ── ревью кода сделки 01.11.2026 (docs/reviews/2026-11-01-kod-sdelka.md)
// К-2: обходы фильтра контактов из ревью — все должны ловиться; суммы, нормы и обычные слова — нет
$yes = ['Мой номер 8 900 123 45 67.', 'мой тел:89001234567.', 'Пишите 89001234567.', 'тел.89001234567', '+79001234567.', '8.900.123.45.67', '8/900/123/45/67',
    '8 - 9 - 0 - 0 - 1 - 2 - 3 - 4 - 5 - 6 - 7', 'восемь девятьсот сто двадцать три сорок пять шестьдесят семь', '8 9OO 123 45 67', '８９００１２３４５６７', '٨٩٠٠١٢٣٤٥٦٧',
    'ivan(at)gmail(dot)com', 'ivan [at] mail [dot] ru', 'Ivan @ gmail . com', 'ivan собака mail точка ru', 'тeлегрaм', 'т е л е г р а м', 'w h a t s a p p', 'wh@tsapp',
    'вк id12345', 'тг ivan_painter', 'телега ivan_painter', 'вайбер: remont77', 'tme/ivan', 't . me / ivan', 'vk com/ivan', 'wa.me/79001234567'];
$no = ['Итого 150 000 – 200 000 ₽', 'Итого 850 000 – 900 000 ₽', 'по СП 71.13330.2017, п. 4.6', 'ГОСТ 21.501-2018', 'Плитка 60х120, шов 2 мм', 'Срок 45 дней, старт 15.11.2026',
    'Два санузла и одна кухня, восемь розеток', 'Смета 1 250 000 ₽, аванс 30 %', 'Стяжка 50 мм, площадь 64,5 м²', 'Максимальная нагрузка', 'телевизор на стене'];
$miss = []; $fp = [];
foreach ($yes as $t) { [$c, $k] = brig_contact_scan($t); if (!$k || preg_match('/\d{2}\D{0,3}\d{2}\D{0,3}\d{2}/', str_replace(BRIG_MASK, '', $c))) { $miss[] = $t; } }
foreach ($no as $t) { if (brig_contact_scan($t)[1]) { $fp[] = $t; } }
$ok(!$miss, 'К-2: ' . count($yes) . ' обходов из ревью пойманы (точка в конце, разделители, прописью, O вместо 0, полноширинные и арабские цифры, (at)/собака, двойники, разрядка, ники без @, t.me с пробелами)' . ($miss ? ' — пропущены: ' . implode(' | ', $miss) : ''));
$ok(!$fp, 'К-2: ' . count($no) . ' обычных фраз (суммы, нормы, размеры, даты, числа прописью) не задеты' . ($fp ? ' — ложные: ' . implode(' | ', $fp) : ''));
// С-4: тестовый режим — только на маке или при allow_test; регистрация бригад test — только на маке
$_SERVER['REMOTE_ADDR'] = '203.0.113.5'; $_SERVER['HTTP_HOST'] = 'example.ru';
$ok(!linea_test_req(true) && !linea_test_req(true, true), 'С-4: ?test=1 с боевого адреса без allow_test — не тест');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1'; $_SERVER['HTTP_HOST'] = '127.0.0.1:8143'; unset($_SERVER['HTTP_X_REAL_IP'], $_SERVER['HTTP_X_FORWARDED_FOR']);
$ok(linea_test_req(true) && linea_test_req(true, true) && !linea_test_req(false), 'С-4: на маке (php -S) тестовый режим работает');
// В-3: онлайн-оплата по заявленной площади — только при подтверждённой сумме или площади ≥ порога вида
$ins = function (string $num, float $area, int $mismatch = 0, ?string $conf = null) use ($db): array {
    $db->prepare("INSERT INTO orders(number, token, status, kind, created_at, updated_at, amount_kop, area, area_mismatch, amount_confirmed_at, test) VALUES(?,?,?,?,?,?,?,?,?,?,1)")
        ->execute([$num, bin2hex(random_bytes(16)), 'awaiting_payment', 'kvartira', linea_now(), linea_now(), 9000000, $area, $mismatch, $conf]);
    return linea_order_by_number($num);
};
$small = $ins('LN-TEST-0101', 45.0);
$ok(!linea_public_order($small)['canPay'] && !yk_payment_for($small)['ok'] && str_contains(yk_payment_for($small)['why'], 'подтвердим'), 'В-3: площадь 45 м² (ниже порога) — оплата закрыта до подтверждения суммы');
$ok(linea_public_order($ins('LN-TEST-0102', 45.0, 0, linea_now()))['canPay'], 'В-3: сумма подтверждена администратором — оплата открыта');
$ok(linea_public_order($ins('LN-TEST-0103', 120.0))['canPay'] && !linea_public_order($ins('LN-TEST-0104', 120.0, 1))['canPay'], 'В-3: площадь ≥ порога — сразу; но если помещения брифа больше заявленной площади — только после подтверждения');
// В-4: платёж по старой сумме — тревога «нужна проверка» и письмо, один раз
$st = $ins('LN-TEST-0105', 120.0, 0, linea_now());
$db->prepare('UPDATE orders SET payment_ids_old = ? WHERE id = ?')->execute(['2f1b0c3e-000f-5000-8000-000000000105', $st['id']]);
file_put_contents($mockDir . '/2f1b0c3e-000f-5000-8000-000000000105.json', json_encode(['id' => '2f1b0c3e-000f-5000-8000-000000000105', 'status' => 'succeeded', 'paid' => true,
    'amount' => ['value' => '60000.00', 'currency' => 'RUB'], 'metadata' => ['order' => 'LN-TEST-0105']]));
$ok(yk_known_payment('2f1b0c3e-000f-5000-8000-000000000105') && !yk_known_payment('2f1b0c3e-000f-5000-8000-0000000009ff'), 'В-5: свой платёж (в т. ч. прежний после смены суммы) узнаётся по базе, чужой — нет');
yk_settle('2f1b0c3e-000f-5000-8000-000000000105'); yk_settle('2f1b0c3e-000f-5000-8000-000000000105');
$st2 = linea_order_by_number('LN-TEST-0105');
$nAl = (int)$db->query("SELECT COUNT(*) FROM events WHERE order_id = " . (int)$st['id'] . " AND text LIKE 'ВНИМАНИЕ%'")->fetchColumn();
$ok($st2['status'] === 'awaiting_payment' && !empty($st2['pay_alert_at']) && $nAl === 1, 'В-4: оплата по старой сумме — заказ не оплачен, пометка «нужна проверка», тревога один раз');
// В-5: подсети ЮKassa
$ok(yk_ip_in('185.71.76.5', linea_cfg()['yk_ips']) && yk_ip_in('77.75.156.11', linea_cfg()['yk_ips']) && !yk_ip_in('203.0.113.5', linea_cfg()['yk_ips']) && yk_ip_in('2a02:5180::1', linea_cfg()['yk_ips']), 'В-5: проверка адреса по подсетям ЮKassa (IPv4/IPv6)');
// юрист п. 1: автоприёмки этапа молчанием нет и из config не включается
$ok(brig_terms()['stage_autoaccept'] === false && brig_terms()['bypass_penalty']['enabled'] === false, 'автоприёмка молчанием выключена (нельзя для потребителей), неустойка за обход выключена');

// ── 02.11.2026: второй чек «полный расчёт» и возвраты через API (макет ЮKassa; всё — только при yk_receipt)
$po = function (string $num, string $pid) use ($db): array {
    $db->prepare("INSERT INTO orders(number, token, status, kind, created_at, updated_at, amount_kop, payment_id, paid_at, paid_by, email, phone, test) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1)")
        ->execute([$num, bin2hex(random_bytes(16)), 'paid', 'kvartira', linea_now(), linea_now(), 10000000, $pid, linea_now(), 'yookassa ' . $pid, 'c@example.test', '8 900 000-00-01']);
    return linea_order_by_number($num);
};
$req = fn(string $what) => array_map(fn($f) => json_decode((string)file_get_contents($f), true), glob($mockDir . '/req-' . $what . '-*.json') ?: []);
$o5 = $po('LN-TEST-0201', '2f1b0c3e-000f-5000-8000-000000000201');
$ok(yk_receipts_on() && !yk_full_receipt($o5)['done'] && !$req('receipts'), 'чек 2: до выдачи альбома не отправляется');
$db->prepare("UPDATE orders SET status = 'delivered', delivered_at = ? WHERE id = ?")->execute([linea_now(), $o5['id']]);
$rc1 = yk_full_receipt(linea_order_by_number('LN-TEST-0201'));
$rc2 = yk_full_receipt(linea_order_by_number('LN-TEST-0201'));
$rq = $req('receipts');
$b0 = $rq[0]['body'] ?? [];
$ok($rc1['done'] && $rc2['done'] && count($rq) === 1 && $rq[0]['idem'] === 'rcpt2-LN-TEST-0201', 'чек 2: при выдаче альбома — один запрос, ключ идемпотентности по заказу, повтор не шлёт второй');
$ok(($b0['payment_id'] ?? '') === '2f1b0c3e-000f-5000-8000-000000000201' && ($b0['type'] ?? '') === 'payment' && ($b0['items'][0]['payment_mode'] ?? '') === 'full_payment'
    && ($b0['settlement'][0]['type'] ?? '') === 'prepayment' && ($b0['settlement'][0]['amount']['value'] ?? '') === '100000.00' && ($b0['tax_system_code'] ?? 0) === 2 && ($b0['customer']['email'] ?? '') === 'c@example.test',
    'чек 2: признак расчёта «полный расчёт», зачёт предоплаты на всю сумму, платёж, система налогообложения, покупатель');
$ok((string)linea_order_by_number('LN-TEST-0201')['receipt2_id'] !== '' && (int)$db->query("SELECT COUNT(*) FROM pay_ops WHERE kind = 'receipt' AND order_id = " . (int)$o5['id'])->fetchColumn() === 1, 'чек 2: id чека в заказе, операция в журнале pay_ops');
$ok(yk_receipt($o5, 100)['items'][0]['payment_mode'] === 'full_prepayment', 'чек 1 (оплата до выдачи альбома) — предоплата 100 %');
// частичный возврат после выдачи: признак расчёта — полный расчёт; проведён сразу
$r1 = yk_refund(linea_order_by_number('LN-TEST-0201'), 3000000, 'клиент отказался от визуализаций', 'admin');
$rf = $req('refunds'); $rb = $rf[0]['body'] ?? [];
$o6 = linea_order_by_number('LN-TEST-0201');
$ok($r1['ok'] && $r1['status'] === 'succeeded' && (int)$o6['refunded_kop'] === 3000000 && $o6['status'] === 'delivered', 'возврат частичный: проведён, сумма возвращённого 30 000 ₽, статус заказа не меняется');
$ok(($rb['amount']['value'] ?? '') === '30000.00' && ($rb['receipt']['items'][0]['payment_mode'] ?? '') === 'full_payment' && ($rb['receipt']['items'][0]['amount']['value'] ?? '') === '30000.00'
    && ($rb['payment_id'] ?? '') === '2f1b0c3e-000f-5000-8000-000000000201', 'чек возврата: сумма возврата, признак расчёта как у последнего чека прихода (полный расчёт)');
$ok(!yk_refund($o6, 8000000, 'больше остатка', 'admin')['ok'] && !yk_refund($o6, 1000, '', 'admin')['ok'] && count($req('refunds')) === 1, 'возврат: больше остатка и без причины — отказ, запросов к API нет');
// сбой связи → повтор с тем же ключом (второй возврат не создаётся)
touch($mockDir . '/fail-refunds');
$r2 = yk_refund($o6, 2000000, 'сбой', 'admin');
unlink($mockDir . '/fail-refunds');
file_put_contents($mockDir . '/refund-status', 'pending');
$r3 = yk_refund(linea_order_by_number('LN-TEST-0201'), 2000000, 'повтор', 'admin');
$rf = $req('refunds');
$ok(!$r2['ok'] && $r3['ok'] && $r3['status'] === 'pending' && count($rf) === 2 && $rf[1]['idem'] === 'rf-LN-TEST-0201-2', 'возврат после сбоя связи — повтор с тем же ключом идемпотентности');
$ok((int)linea_order_by_number('LN-TEST-0201')['refunded_kop'] === 3000000 && yk_refund_left(linea_order_by_number('LN-TEST-0201')) === 5000000, 'возврат в пути (pending) не считается проведённым, но резервирует сумму');
// уведомление refund.succeeded: статус из API, один раз
$rid = $r3['id'];
$ok(yk_known_refund($rid) && !yk_known_refund('2f1b0c3e-000f-5000-8000-0000000009aa'), 'свой возврат узнаётся по журналу pay_ops, чужой — нет');
$obj = json_decode((string)file_get_contents($mockDir . '/' . $rid . '.json'), true); $obj['status'] = 'succeeded';
file_put_contents($mockDir . '/' . $rid . '.json', json_encode($obj));
yk_refund_settle($rid); yk_refund_settle($rid);
$ok((int)linea_order_by_number('LN-TEST-0201')['refunded_kop'] === 5000000, 'refund.succeeded: проведён один раз (повтор уведомления не удваивает)');
unlink($mockDir . '/refund-status');
yk_refund(linea_order_by_number('LN-TEST-0201'), 5000000, 'остаток', 'admin');
$o7 = linea_order_by_number('LN-TEST-0201');
$ok($o7['status'] === 'refunded' && (int)$o7['refunded_kop'] === 10000000 && yk_refund_left($o7) === 0, 'полный возврат остатка → статус «Возврат оплаты»');
$ok((int)$db->query("SELECT COUNT(*) FROM events WHERE order_id = " . (int)$o5['id'] . " AND text LIKE 'Возврат%проведён%'")->fetchColumn() === 3, 'журнал заказа: каждое проведение возврата — событие');
// оплата не через онлайн-кассу — API не трогаем
$m = $po('LN-TEST-0202', '2f1b0c3e-000f-5000-8000-000000000202');
$db->prepare("UPDATE orders SET paid_by = 'вручную: Александр', status = 'delivered' WHERE id = ?")->execute([$m['id']]);
$n0 = count($req('receipts'));
$ok(!yk_full_receipt(linea_order_by_number('LN-TEST-0202'))['done'] && !yk_refund(linea_order_by_number('LN-TEST-0202'), 100, 'x', 'admin')['ok'] && count($req('receipts')) === $n0, 'оплата счётом: второй чек и возврат через API не делаются (пометка «выбить вручную»)');
// флаг yk_receipt выключен — ни чеков, ни возвратов через API
$off = $priv . '-off'; @mkdir($off, 0700, true);
file_put_contents($off . '/config.php', "<?php return ['mode' => 'yookassa', 'yk_shop_id' => 's', 'yk_secret' => 'k', 'yk_api' => " . var_export($mock, true) . "];");
$outOff = shell_exec('LINEA_PRIVATE=' . escapeshellarg($off) . ' php -r ' . escapeshellarg('$_SERVER["SCRIPT_FILENAME"]="x"; require ' . var_export(__DIR__ . '/../server/api/lib/boot.php', true) . '; require ' . var_export(__DIR__ . '/../server/api/lib/yookassa.php', true)
    . '; $o = ["id"=>1,"number"=>"N","status"=>"delivered","paid_by"=>"yookassa x","payment_id"=>"x","amount_kop"=>100,"refunded_kop"=>0]; echo json_encode([yk_receipts_on(), yk_full_receipt($o)["done"], yk_refund($o, 10, "r", "a")["ok"]]);'));
$ok(trim((string)$outOff) === '[false,false,false]', 'yk_receipt выключен (по умолчанию): второй чек и возврат через API не работают' . (trim((string)$outOff) === '[false,false,false]' ? '' : ' — ' . $outOff));
exit($fail ? 1 : 0);
