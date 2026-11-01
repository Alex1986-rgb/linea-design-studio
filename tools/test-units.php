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
exit($fail ? 1 : 0);
