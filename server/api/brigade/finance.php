<?php
/**
 * api/brigade/finance.php — финансы бригады (только свои): начисленное вознаграждение по объектам (ставка — brig_terms()), счета
 * и их оплата, рейтинг и отзывы. Вознаграждение фиксируется в момент открытия контактов сторон (brig_open_contacts). Оплата ремонта — вне сайта.
 */
declare(strict_types=1);
require __DIR__ . '/../lib/boot.php';
require __DIR__ . '/../lib/brig.php';

brig_https();
$b = brig_me();
$bid = (int)$b['id'];
$rows = [];
$acc = 0; $paid = 0; $due = 0;   // начислено (при подтверждении договора) / к оплате (после первых денег бригаде) / оплачено
foreach (brig_all('SELECT j.id, j.status, j.commission_kop, j.commission_rate, j.commission_at, j.commission_due_at, r.object_title, o.total_kop, i.number, i.amount_kop, i.issued_at, i.due_at, i.paid_at
        FROM br_jobs j JOIN br_requests r ON r.id = j.request_id JOIN br_offers o ON o.id = j.offer_id LEFT JOIN br_invoices i ON i.job_id = j.id
        WHERE j.brigade_id = ? ORDER BY j.id DESC', [$bid]) as $r) {
    $acc += (int)$r['commission_kop'];
    if ($r['commission_due_at']) { $due += (int)$r['commission_kop']; }
    if ($r['paid_at']) { $paid += (int)$r['amount_kop']; }
    $rows[] = ['job' => (int)$r['id'], 'object' => (string)$r['object_title'], 'status' => BRIG_JOB_STATUS[$r['status']] ?? $r['status'], 'total' => (int)$r['total_kop'] / 100,
        'commission' => $r['commission_kop'] !== null ? (int)$r['commission_kop'] / 100 : null, 'rate' => $r['commission_rate'] !== null ? brig_rate_text((float)$r['commission_rate']) : null, 'commissionAt' => $r['commission_at'], 'dueAt' => $r['commission_due_at'],
        'invoice' => $r['number'] ? ['number' => $r['number'], 'amount' => (int)$r['amount_kop'] / 100, 'issued' => $r['issued_at'], 'due' => $r['due_at'], 'paid' => $r['paid_at']] : null];
}
linea_json(['ok' => true, 'rate' => brig_rate_text(brig_rate_for($bid)), 'terms' => brig_terms_public(), 'accrued' => $acc / 100, 'paid' => $paid / 100, 'due' => $due / 100, 'debt' => max(0, $due - $paid) / 100, 'jobs' => $rows,
    'rating' => brig_rating($bid), 'reviews' => brig_reviews_public($bid), 'requisites' => (string)brig_cfg('brig_requisites', ''),
    'safeDeal' => (bool)brig_terms()['safe_deal']]);   // «безопасная сделка» ЮKassa — не включена (решение владельца)
