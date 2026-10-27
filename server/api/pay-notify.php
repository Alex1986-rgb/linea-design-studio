<?php
/**
 * Вебхук ЮKassa (payment.succeeded / payment.canceled). Адрес в кабинете ЮKassa: https://<домен>/api/pay-notify.php
 * ЮKassa шлёт уведомления только на HTTPS — включать после домена и SSL.
 *
 * Телу запроса не верим: берём только object.id и спрашиваем статус у API. Подделка (чужой или выдуманный id) → 200
 * без изменений. Сбой у нас или у API → 500, ЮKassa повторит уведомление.
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/yookassa.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); exit; }
if (!linea_https() && !linea_local()) { http_response_code(403); exit; }   // ЮKassa шлёт только на https; по http — не наше
$raw = (string)file_get_contents('php://input', false, null, 0, 65536);
$in = json_decode($raw, true);
$id = is_array($in) ? (string)($in['object']['id'] ?? '') : '';
if ($id === '') { http_response_code(200); exit; }
try {
    $r = yk_settle($id);
} catch (Throwable $e) {
    linea_log('error.log', 'notify: ' . $e->getMessage());
    http_response_code(500); exit;
}
linea_log('pay.log', 'notify ' . substr(preg_replace('/[^0-9a-f-]/i', '', $id) ?? '', 0, 64) . ' → ' . ($r['ok'] ? ($r['paid'] ? 'paid' : $r['why']) : 'error ' . $r['why']));
http_response_code($r['ok'] ? 200 : 500);
