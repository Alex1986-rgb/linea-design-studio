<?php
/**
 * Вебхук ЮKassa (payment.succeeded / payment.canceled; refund.succeeded / refund.canceled — возвраты из админки, 02.11.2026). Адрес в кабинете ЮKassa: https://<домен>/api/pay-notify.php
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
// В-5: подсети ЮKassa (по флагу config yk_ip_check) и лимит частоты с адреса — флуд не превращается в запросы к API ЮKassa
if (!empty(linea_cfg()['yk_ip_check']) && !linea_local() && !yk_ip_in(linea_ip(), (array)(linea_cfg()['yk_ips'] ?? []))) { linea_log('pay.log', 'notify: адрес не из подсетей ЮKassa'); http_response_code(403); exit; }
if (!linea_rate('yk-notify', max(10, (int)(linea_cfg()['yk_notify_per_hour'] ?? 120)))) { http_response_code(429); exit; }
$raw = (string)file_get_contents('php://input', false, null, 0, 65536);
$in = json_decode($raw, true);
$id = is_array($in) ? (string)($in['object']['id'] ?? '') : '';
$event = is_array($in) ? (string)($in['event'] ?? '') : '';
if ($id === '') { http_response_code(200); exit; }
// возврат: свой id ищем в журнале операций pay_ops, статус — только из API (GET /v3/refunds/{id})
if (str_starts_with($event, 'refund.')) {
    // неизвестный id: yk_refund_settle сам решает — чужой (200) или наш, ответ API о котором потерян (С2: привязка по платежу и сумме)
    try { $r = yk_refund_settle($id); } catch (Throwable $e) { linea_log('error.log', 'notify refund: ' . $e->getMessage()); http_response_code(500); exit; }
    linea_log('pay.log', 'notify refund ' . substr(preg_replace('/[^0-9a-f-]/i', '', $id) ?? '', 0, 64) . ' → ' . ($r['ok'] ? $r['why'] : 'error ' . $r['why']));
    http_response_code($r['ok'] ? 200 : 500); exit;
}
// сначала своя база: неизвестный id (не наш текущий и не прежний платёж) — 200 без обращения к API
if (!yk_known_payment($id)) { linea_log('pay.log', 'notify: неизвестный платёж — пропущен'); http_response_code(200); exit; }
try {
    $r = yk_settle($id);
} catch (Throwable $e) {
    linea_log('error.log', 'notify: ' . $e->getMessage());
    http_response_code(500); exit;
}
linea_log('pay.log', 'notify ' . substr(preg_replace('/[^0-9a-f-]/i', '', $id) ?? '', 0, 64) . ' → ' . ($r['ok'] ? ($r['paid'] ? 'paid' : $r['why']) : 'error ' . $r['why']));
http_response_code($r['ok'] ? 200 : 500);
