<?php
/**
 * POST api/pay.php {t} — перейти к оплате заказа в ЮKassa. Работает только в режиме mode = 'yookassa'.
 * Сумма — из заказа (выставлена по прайсу config.php или Александром в закрытой странице), не из запроса.
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/yookassa.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST'); linea_fail('Только POST', 405); }
$in = json_decode((string)file_get_contents('php://input'), true);
$o = linea_order_by_token((string)($in['t'] ?? $_POST['t'] ?? ''));
if (!$o) { linea_fail('Заказ не найден — проверьте ссылку', 404); }
if (!linea_rate('pay', 30)) { linea_fail('Слишком много попыток — подождите немного', 429); }
$r = yk_payment_for($o);
if (!$r['ok']) { linea_fail($r['why'], 409); }
linea_json(['ok' => true, 'url' => $r['url']]);
