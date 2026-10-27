<?php
/**
 * GET api/order.php?t=<токен> — состояние заказа для страницы order.html. Без телефона, почты, адреса и IP.
 * Номер заказа без токена доступа не даёт. Если по заказу висит платёж ЮKassa — перед ответом сверяемся с API
 * (на техническом адресе без HTTPS вебхука нет: оплату подтверждает эта перепроверка при возврате с оплаты).
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/yookassa.php';

$o = linea_order_by_token((string)($_GET['t'] ?? ''));
if (!$o) { linea_fail('Заказ не найден — проверьте ссылку', 404); }
if ($o['payment_id'] && $o['status'] === 'awaiting_payment' && yk_ready()) {
    try { yk_settle((string)$o['payment_id']); } catch (Throwable $e) { linea_log('error.log', 'order settle: ' . $e->getMessage()); }
    $o = linea_order_by_token((string)$o['token']);
}
linea_json(['ok' => true, 'order' => linea_public_order($o)]);
