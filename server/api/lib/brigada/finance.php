<?php
/**
 * api/brigade/finance.php — финансы бригады (только свои): начисленное вознаграждение по объектам (ставка — brig_terms()), счета
 * и их оплата, рейтинг и отзывы. Вознаграждение фиксируется в момент открытия контактов сторон (brig_open_contacts). Оплата ремонта — вне сайта.
 */
declare(strict_types=1);
if (!defined('LINEA_BRIGADA')) { http_response_code(404); exit; }   // модуль api/brigada.php?m=…, напрямую не открывается
require_once __DIR__ . '/../boot.php';
require_once __DIR__ . '/../brigada.php';

brig_https();
$b = brig_me();
brig_need($b, 'money');
$bid = (int)$b['id'];
brig_commission_sweep($bid);   // «к оплате» по наступившим датам (К-1)
$rows = [];
$acc = 0; $paid = 0; $due = 0;   // начислено (при подтверждении договора) / к оплате (после первых денег бригаде) / оплачено
foreach (brig_all('SELECT j.id, j.status, j.commission_kop, j.commission_rate, j.commission_at, j.commission_due_at, j.commission_due_why, r.object_title, o.total_kop, i.number, i.amount_kop, i.issued_at, i.due_at, i.paid_at
        FROM br_jobs j JOIN br_requests r ON r.id = j.request_id JOIN br_offers o ON o.id = j.offer_id LEFT JOIN br_invoices i ON i.job_id = j.id
        WHERE j.brigade_id = ? ORDER BY j.id DESC', [$bid]) as $r) {
    $acc += (int)$r['commission_kop'];
    if ($r['commission_due_at']) { $due += (int)$r['commission_kop']; }
    if ($r['paid_at']) { $paid += (int)$r['amount_kop']; }
    $rows[] = ['job' => (int)$r['id'], 'object' => (string)$r['object_title'], 'status' => BRIG_JOB_STATUS[$r['status']] ?? $r['status'], 'total' => (int)$r['total_kop'] / 100,
        'commission' => $r['commission_kop'] !== null ? (int)$r['commission_kop'] / 100 : null, 'rate' => $r['commission_rate'] !== null ? brig_rate_text((float)$r['commission_rate']) : null, 'commissionAt' => $r['commission_at'], 'dueAt' => $r['commission_due_at'], 'dueWhy' => (string)($r['commission_due_why'] ?? ''),
        'invoice' => $r['number'] ? ['number' => $r['number'], 'amount' => (int)$r['amount_kop'] / 100, 'issued' => $r['issued_at'], 'due' => $r['due_at'], 'paid' => $r['paid_at']] : null];
}
linea_json(['ok' => true, 'rate' => brig_rate_text(brig_rate_for($bid)), 'terms' => brig_terms_public(), 'accrued' => $acc / 100, 'paid' => $paid / 100, 'due' => $due / 100, 'debt' => max(0, $due - $paid) / 100, 'jobs' => $rows, 'debtLadder' => brig_debt($bid),
    'rating' => brig_rating($bid), 'reviews' => brig_reviews_public($bid), 'requisites' => (string)brig_cfg('brig_requisites', ''),
    'safeDeal' => (bool)brig_terms()['safe_deal'],
    // проводки простыми словами (спецификация 4.8): начислено, пересчёт по допсоглашению, оплачено, списано; «отложено до регистрации ИП LINEA»
    'ledger' => array_map(fn($l) => ['at' => $l['at'], 'kind' => $l['kind'], 'amount' => (int)$l['amount_kop'] / 100, 'status' => $l['status'], 'object' => (string)$l['object_title'],
        'text' => ['accrual' => 'Начислено', 'adjust' => 'Пересчёт', 'payment' => 'Оплачено', 'writeoff' => 'Списано'][$l['kind']] ?? $l['kind'], 'note' => (string)$l['note']],
        brig_all('SELECT l.*, r.object_title FROM br_ledger l JOIN br_jobs j ON j.id = l.job_id JOIN br_requests r ON r.id = j.request_id WHERE l.brigade_id = ? ORDER BY l.id DESC LIMIT 200', [$bid])),
    'deferred' => !linea_requisites(), 'deferredText' => 'Вознаграждение будет выставлено счётом после регистрации ИП LINEA. Сейчас — отложено, сумма ориентировочная.',
    'npd' => $b['legal'] === 'npd' && brig_terms()['npd']['no_fee'] ? 'Самозанятые бригады работают без вознаграждения LINEA до перехода в ИП.' : null,
    'pilotLeft' => ($p = brig_terms()['pilot'])['enabled'] && $b['pilot_slot'] !== null && (int)$b['pilot_slot'] <= $p['brigades'] ? max(0, $p['deals'] - (int)$b['pilot_used']) : null,
    'whenPay' => brig_terms_public()['dueText']]);   // «безопасная сделка» ЮKassa — не включена (решение владельца)
