<?php
/**
 * LINEA · ядро кабинета бригады (спецификация docs/brigady/spec-kabinety-adminka.md, раздел 4 и блок II):
 * люди бригады и права (владелец · бригадир · сотрудник), «Сейчас от вас нужно», реестр оплат по сделке (br_payments),
 * документы, уведомления и показатели бригады.
 *
 * 🔴 Правила:
 *   · Сторона договора — бригада (один ИНН). Подписывает, отправляет предложение, видит деньги и команду — только владелец
 *     (br_brigades.account_id). Бригадир и сотрудник — свои аккаунты (вход кодом), записи br_members; права — brig_can().
 *   · Бригадир/сотрудник с непустым br_members.objects видит только эти сделки (brig_job_allowed); у сотрудника по умолчанию — ни одной.
 *   · Оплаты ремонта идут ВНЕ сайта: реестр хранит отметки сторон. Отметила одна сторона → «declared», подтвердила вторая → «confirmed»,
 *     не согласилась → «contested» (сигнал LINEA). Поля provider_* и method = 'safe_deal' — для Безопасной сделки ЮKassa (потом, тот же реестр).
 *   · Статус сделки меняет только deal_transition() (lib/kabinet.php).
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

require_once __DIR__ . '/brig.php';
require_once __DIR__ . '/kabinet.php';

const BRIG_ROLES = ['owner' => 'Владелец', 'foreman' => 'Бригадир', 'worker' => 'Сотрудник'];
// права людей бригады (спецификация 1.2); владелец может всё
const BRIG_PERMS = [
    'foreman' => ['feed', 'offer_draft', 'jobs', 'msg', 'photo', 'stage', 'remark', 'sheets', 'sign_ask'],
    'worker' => ['jobs', 'photo', 'sheets'],
];
const BRIG_PERM_DENY = [
    'sign' => 'Договор и допсоглашения подписывает владелец бригады. Нажмите «Попросить владельца подписать»',
    'offer_send' => 'Отправить предложение клиенту может только владелец бригады — черновик сохранён, владелец получил уведомление',
    'money' => 'Деньги бригады видит только владелец',
    'team' => 'Команду ведёт владелец бригады',
    'profile' => 'Анкету меняет владелец бригады',
    'msg' => 'Писать клиенту в ленту сотрудникам не разрешено владельцем бригады',
    'feed' => 'Лента заказов — у владельца и бригадира',
];
const BRIG_HIDDEN_KEYS = ['elektrika', 'santehnika', 'gidro', 'styazhka'];   // скрытые работы (спецификация 2.5)
const BRIG_START_PHOTOS = 3;    // «Начать работу» по этапу 1 и этапам со скрытыми работами — не меньше N фото «до»
const BRIG_READY_PHOTOS = 3;    // «Готов к приёмке» — не меньше N фото этапа
const BRIG_PAY_KIND = ['advance' => 'Аванс', 'stage' => 'Оплата этапа', 'extra' => 'Доплата', 'refund' => 'Возврат'];
const BRIG_PAY_STATUS = [
    'planned' => 'По плану', 'declared' => 'Отмечено одной стороной', 'confirmed' => 'Подтверждено обеими сторонами',
    'contested' => 'Расхождение — разбирает LINEA', 'funding' => 'Ожидает внесения', 'held' => 'Деньги на сделке',
    'released' => 'Выплачено бригаде', 'refunded' => 'Возвращено заказчику', 'cancelled' => 'Отменено',
];
const BRIG_CARD_ED = '01.11.2026';   // редакция согласия на распространение данных в публичной карточке бригады (ст. 10.1 152-ФЗ)

function brig_role(array $b): string { return (string)($b['_role'] ?? 'owner'); }

function brig_can(array $b, string $perm): bool
{
    $r = brig_role($b);
    if ($r === 'owner') { return true; }
    if ($perm === 'msg' && $r === 'worker') { return (bool)($b['worker_msg'] ?? 0); }
    return in_array($perm, BRIG_PERMS[$r] ?? [], true);
}

function brig_need(array $b, string $perm): void
{
    if (!brig_can($b, $perm)) { linea_fail(BRIG_PERM_DENY[$perm] ?? 'Это может только владелец бригады', 403); }
}

/** Кто действует — для журнала: владелец «brigade#N», человек бригады «brigade#N/foreman#acc». */
function brig_who(array $b): string
{
    return 'brigade#' . (int)$b['id'] . (brig_role($b) !== 'owner' ? '/' . brig_role($b) . '#' . (int)($b['_acc'] ?? 0) : '');
}

/** Сделка видна этому человеку бригады. */
function brig_job_allowed(array $b, int $jobId): bool
{
    $o = $b['_objects'] ?? null;
    return brig_role($b) === 'owner' || $o === null || in_array($jobId, $o, true);
}

/** Скрытые работы этапа (по ключу чек-листа). */
function brig_stage_hidden(array $s): bool { return in_array((string)$s['checklist'], BRIG_HIDDEN_KEYS, true); }

// ───────────────────────── реестр оплат (br_payments)

/** План оплат из договора: аванс (процент из предложения) и оплата каждого этапа после приёмки — равными долями остатка. */
function brig_pay_plan(int $jobId): void
{
    if (db_val("SELECT COUNT(*) FROM br_payments WHERE job_id = ? AND kind = 'stage'", [$jobId])) { return; }
    $j = brig_one('SELECT j.*, o.total_kop, o.advance_pct FROM br_jobs j JOIN br_offers o ON o.id = j.offer_id WHERE j.id = ?', [$jobId]);
    if (!$j) { return; }
    $plan = brig_pay_plan_calc((int)($j['deal_total_kop'] ?? $j['total_kop']), (int)$j['advance_pct'], brig_all('SELECT id, idx, plan_end FROM br_stages WHERE job_id = ? ORDER BY idx', [$jobId]));
    $now = linea_now();
    foreach ($plan as $p) {
        if ($p['kind'] === 'advance') {
            $have = brig_one("SELECT * FROM br_payments WHERE job_id = ? AND kind = 'advance' ORDER BY id LIMIT 1", [$jobId]);
            if ($have) { if ((int)$have['amount_kop'] === 0) { db_update('br_payments', ['amount_kop' => $p['amount']], 'id = ?', [(int)$have['id']]); } continue; }
        }
        db_insert('br_payments', ['job_id' => $jobId, 'stage_id' => $p['stage'], 'kind' => $p['kind'], 'amount_kop' => $p['amount'], 'due_at' => $p['due'],
            'method' => 'offsite', 'status' => 'planned', 'note' => 'по договору', 'created_at' => $now]);
    }
}

/** Расчёт плана (для договора и реестра): [{kind, stage, amount, due}]. */
function brig_pay_plan_calc(int $totalKop, int $advancePct, array $stages): array
{
    $adv = $advancePct > 0 ? (int)round($totalKop * min(50, $advancePct) / 100) : 0;
    $out = $adv > 0 ? [['kind' => 'advance', 'stage' => null, 'amount' => $adv, 'due' => null]] : [];
    $n = count($stages);
    if (!$n) { return $out; }
    $rest = $totalKop - $adv; $per = intdiv($rest, $n);
    foreach (array_values($stages) as $i => $s) {
        $out[] = ['kind' => 'stage', 'stage' => isset($s['id']) ? (int)$s['id'] : null, 'amount' => $i === $n - 1 ? $rest - $per * ($n - 1) : $per, 'due' => $s['plan_end'] ?? null];
    }
    return $out;
}

function brig_pay_public(array $p): array
{
    $st = $p['stage_id'] ? brig_one('SELECT idx, name, status FROM br_stages WHERE id = ?', [(int)$p['stage_id']]) : null;
    return ['id' => (int)$p['id'], 'kind' => $p['kind'], 'kindText' => BRIG_PAY_KIND[$p['kind']] ?? $p['kind'], 'amount' => (int)$p['amount_kop'] / 100,
        'stage' => $st ? ['idx' => (int)$st['idx'], 'name' => $st['name'], 'status' => $st['status']] : null, 'due' => $p['due_at'],
        'method' => $p['method'], 'status' => $p['status'], 'statusText' => BRIG_PAY_STATUS[$p['status']] ?? $p['status'],
        'declaredBy' => $p['declared_by'], 'declaredAt' => $p['declared_at'], 'confirmedBy' => $p['confirmed_by'], 'confirmedAt' => $p['confirmed_at'],
        'contestNote' => (string)$p['contest_note'], 'note' => (string)$p['note']];
}

function brig_pay_list(int $jobId): array
{
    return array_map('brig_pay_public', brig_all('SELECT * FROM br_payments WHERE job_id = ? ORDER BY (kind = \'advance\') DESC, (stage_id IS NULL), stage_id, id', [$jobId]));
}

/** Сводка оплат сделки: по плану, отмечено, подтверждено, расхождения. */
function brig_pay_summary(int $jobId): array
{
    $s = ['plan' => 0, 'declared' => 0, 'confirmed' => 0, 'contested' => 0];
    foreach (brig_all('SELECT status, amount_kop FROM br_payments WHERE job_id = ? AND kind <> \'refund\'', [$jobId]) as $p) {
        $s['plan'] += (int)$p['amount_kop'];
        if (isset($s[$p['status']])) { $s[$p['status']] += (int)$p['amount_kop']; }
    }
    return array_map(fn($v) => $v / 100, $s);
}

/**
 * Отметка оплаты стороной ('client' | 'brigade'): по строке плана (p) — «я передал / я получил»; без строки — новая (kind, amount, stage).
 * Отметка второй стороной той же строки = подтверждение. @return строка реестра
 */
function brig_pay_mark(array $j, string $side, array $in, string $who): array
{
    deal_require_not_frozen($j);
    if (!in_array($j['status'], ['work', 'done'], true)) { linea_fail('Оплаты отмечаются, когда договор подписан обеими сторонами на сайте'); }
    $now = linea_now();
    $pid = (int)($in['p'] ?? 0);
    if ($pid) {
        $p = brig_one('SELECT * FROM br_payments WHERE id = ? AND job_id = ?', [$pid, (int)$j['id']]);
        if (!$p) { linea_fail('Нет такой оплаты', 404); }
    } else {
        $kind = (string)($in['kind'] ?? 'extra');
        if (!in_array($kind, ['advance', 'stage', 'extra'], true)) { linea_fail('Вид оплаты: аванс, этап или доплата'); }
        $amount = (int)round((float)($in['amount'] ?? 0) * 100);
        // прежняя кнопка «аванс внесён» без суммы (zeroOk): строка с нулём, сумму стороны уточнят в ленте
        if (($amount <= 0 && !($kind === 'advance' && !empty($in['zeroOk']))) || $amount < 0 || $amount > 10000000000) { linea_fail('Укажите сумму'); }
        if ($kind === 'advance' && ($ex = brig_one("SELECT * FROM br_payments WHERE job_id = ? AND kind = 'advance' AND status IN ('planned','declared') ORDER BY id LIMIT 1", [(int)$j['id']]))) {
            $p = $ex;   // аванс по плану уже есть — отмечаем его
        } else {
            $sid = (int)($in['stage'] ?? 0);
            if ($sid && !brig_one('SELECT 1 FROM br_stages WHERE id = ? AND job_id = ?', [$sid, (int)$j['id']])) { linea_fail('Нет такого этапа'); }
            $id = db_insert('br_payments', ['job_id' => (int)$j['id'], 'stage_id' => $sid ?: null, 'kind' => $kind, 'amount_kop' => $amount, 'method' => 'offsite',
                'status' => 'planned', 'note' => linea_str($in['note'] ?? '', 200) ?: null, 'created_at' => $now]);
            $p = brig_one('SELECT * FROM br_payments WHERE id = ?', [$id]);
        }
    }
    if ($p['method'] !== 'offsite') { linea_fail('Эта оплата идёт через Безопасную сделку — отметка не нужна'); }
    $other = $side === 'client' ? 'brigade' : 'client';
    $sideText = $side === 'client' ? 'Заказчик' : 'Бригада';
    $what = (BRIG_PAY_KIND[$p['kind']] ?? 'Оплата') . ' ' . brig_rub((int)$p['amount_kop']);
    if ($p['status'] === 'planned') {
        if ((int)$p['amount_kop'] <= 0 && empty($in['zeroOk'])) {   // перенесённая строка аванса без суммы
            $amount = (int)round((float)($in['amount'] ?? 0) * 100);
            if ($amount <= 0) { linea_fail('Укажите сумму аванса'); }
            db_update('br_payments', ['amount_kop' => $amount], 'id = ?', [(int)$p['id']]); $p['amount_kop'] = $amount; $what = 'Аванс ' . brig_rub($amount);
        }
        if (db_exec("UPDATE br_payments SET status = 'declared', declared_by = ?, declared_at = ? WHERE id = ? AND status = 'planned'", [$side, $now, (int)$p['id']]) !== 1) { linea_fail('Оплату уже отметили — обновите страницу', 409); }
        $text = $sideText . ' отметил(а): ' . mb_strtolower($what) . ($side === 'client' ? ' — передано' : ' — получено') . '. Ждём подтверждения ' . ($other === 'client' ? 'заказчика' : 'бригады') . '.';
    } elseif ($p['status'] === 'declared' || $p['status'] === 'contested') {
        if ($p['declared_by'] === $side) { linea_fail('Вы уже отметили эту оплату — ждём подтверждения второй стороны'); }
        if (db_exec("UPDATE br_payments SET status = 'confirmed', confirmed_by = ?, confirmed_at = ? WHERE id = ? AND status IN ('declared','contested')", [$side, $now, (int)$p['id']]) !== 1) { linea_fail('Оплату уже подтвердили — обновите страницу', 409); }
        $text = $sideText . ' подтвердил(а): ' . mb_strtolower($what) . '. Оплата подтверждена обеими сторонами.';
    } else {
        linea_fail('Оплата уже ' . mb_strtolower(BRIG_PAY_STATUS[$p['status']] ?? $p['status']), 409);
    }
    // аванс — и в колонках сделки (по ним считаются даты «к оплате» вознаграждения, ревью кода В-2)
    if ($p['kind'] === 'advance') {
        $st = (string)db_val('SELECT status FROM br_payments WHERE id = ?', [(int)$p['id']]);
        if ($st === 'confirmed' || $side === 'brigade') {
            brig_exec("UPDATE br_jobs SET advance_at = COALESCE(advance_at, ?), advance_by = COALESCE(advance_by, ?), advance_state = 'confirmed', updated_at = ? WHERE id = ?", [$now, $side, $now, (int)$j['id']]);
        } else {
            brig_exec("UPDATE br_jobs SET advance_at = ?, advance_by = 'client', advance_state = 'declared', updated_at = ? WHERE id = ? AND advance_at IS NULL", [$now, $now, (int)$j['id']]);
        }
    }
    db_insert('br_messages', ['job_id' => (int)$j['id'], 'who' => 'system', 'text' => $text, 'masked' => 0, 'at' => $now]);
    brig_audit($who, 'payment', 'job#' . $j['id'], $text);
    brig_commission_due_check((int)$j['id'], $who);
    brig_pay_notify($j, $other, $text);
    return brig_pay_public(brig_one('SELECT * FROM br_payments WHERE id = ?', [(int)$p['id']]));
}

/** «Не получал / не передавал»: отметка второй стороны оспорена → расхождение, сигнал LINEA. */
function brig_pay_contest(array $j, string $side, int $pid, string $note, string $who): void
{
    $p = brig_one('SELECT * FROM br_payments WHERE id = ? AND job_id = ?', [$pid, (int)$j['id']]);
    if (!$p || $p['status'] !== 'declared' || $p['declared_by'] === $side) { linea_fail('Оспорить можно только отметку второй стороны, которую ещё не подтвердили'); }
    $note = brig_guard(linea_str($note, 500), brig_contacts_open($j), ['who' => $who, 'field' => 'оплата', 'job_id' => (int)$j['id'], 'brigade_id' => (int)$j['brigade_id']]);
    if ($note === '') { linea_fail('Напишите, что не так с оплатой'); }
    $now = linea_now();
    db_update('br_payments', ['status' => 'contested', 'contest_note' => $note], 'id = ?', [$pid]);
    if ($p['kind'] === 'advance') { brig_exec("UPDATE br_jobs SET advance_state = 'disputed', advance_note = ?, updated_at = ? WHERE id = ? AND advance_state = 'declared'", [$note, $now, (int)$j['id']]); }
    $text = ($side === 'client' ? 'Заказчик' : 'Бригада') . ' не подтверждает: ' . mb_strtolower(BRIG_PAY_KIND[$p['kind']] ?? 'оплата') . ' ' . brig_rub((int)$p['amount_kop']) . ' — «' . $note . '». LINEA разберёт расхождение.';
    db_insert('br_messages', ['job_id' => (int)$j['id'], 'who' => 'system', 'text' => $text, 'masked' => 0, 'at' => $now]);
    brig_audit($who, 'payment-contest', 'job#' . $j['id'], $text);
    brig_signal('payment', $who, ['job_id' => (int)$j['id'], 'brigade_id' => (int)$j['brigade_id']], 'Расхождение по оплате: ' . $note);
    brig_admin_notify('расхождение по оплате', 'Сделка #' . $j['id'] . ': ' . $text, brig_link('api/panel.php?s=deals'), false);
    brig_pay_notify($j, $side === 'client' ? 'brigade' : 'client', $text);
}

/** Уведомить другую сторону об отметке оплаты (кабинет; письмо — по обязательным событиям). */
function brig_pay_notify(array $j, string $to, string $text): void
{
    if ($to === 'brigade') { brig_notice((int)$j['brigade_id'], (int)$j['id'], 'dengi', $text, '#/obekt/' . $j['id'] . '/oplaty'); return; }
    $o = db_one('SELECT o.* FROM orders o JOIN br_requests r ON r.order_id = o.id WHERE r.id = ?', [(int)$j['request_id']]);
    if ($o) { kab_notice_order($o, 'remont', $text, '#/o/' . $o['number'] . '/remont'); }
}

// ───────────────────────── «Сейчас от вас нужно» и плитки главной

/** Сделки, видные этому человеку бригады. */
function brig_jobs_for(array $b): array
{
    $rows = brig_all('SELECT j.*, r.object_title, r.order_id, r.district, r.area FROM br_jobs j JOIN br_requests r ON r.id = j.request_id WHERE j.brigade_id = ? ORDER BY j.id DESC', [(int)$b['id']]);
    return array_values(array_filter($rows, fn($j) => brig_job_allowed($b, (int)$j['id'])));
}

function brig_portfolio_missing(int $bid): array
{
    $full = 0;
    foreach (brig_all('SELECT id FROM br_portfolio WHERE brigade_id = ?', [$bid]) as $p) {
        $k = brig_all("SELECT DISTINCT kind FROM br_files WHERE owner_kind = 'portfolio' AND owner_id = ?", [(int)$p['id']]);
        if (count($k) >= 2) { $full++; }
    }
    return $full >= 3 ? [] : ['портфолио ' . $full . ' из 3 (у каждого объекта фото «до» и «после»)'];
}

/** Список дел бригады по срочности + плитки. */
function brig_home(array $b): array
{
    $bid = (int)$b['id']; $own = brig_role($b) === 'owner'; $today = date('Y-m-d');
    $todo = [];
    $add = function (int $prio, string $text, string $btn = '', string $href = '') use (&$todo) { $todo[] = ['prio' => $prio, 'text' => $text, 'btn' => $btn, 'href' => $href]; };
    if ($own && $b['status'] === 'draft') { $miss = brig_portfolio_missing($bid); $add(10, 'Заполните анкету и отправьте на проверку' . ($miss ? ': не хватает — ' . implode(', ', $miss) : ''), 'Заполнить', '#/profil'); }
    if ($b['status'] === 'review') { $add(60, 'Анкета на проверке. ' . ($b['call_at'] ? 'Видеозвонок — ' . date('d.m.Y H:i', strtotime((string)$b['call_at'])) : 'О видеозвонке напишем на почту') . '.'); }
    if (in_array($b['status'], ['suspended', 'blocked'], true)) { $add(1, 'Анкета: ' . mb_strtolower(BRIG_STATUS[$b['status']] ?? $b['status']) . ($b['status_reason'] ? ' — ' . $b['status_reason'] : '') . '. Начатые объекты ведите как обычно.'); }
    $debt = brig_debt($bid);
    if ($own && $debt['text'] !== '') { $add(2, $debt['text'], 'К деньгам', '#/dengi'); }
    if ($w = brig_warn_block($bid)) { $add(3, $w); }
    if (brig_can($b, 'feed') && $b['status'] === 'active') {
        foreach (brig_all("SELECT r.id, r.object_title, r.district, r.deadline_at FROM br_invites i JOIN br_requests r ON r.id = i.request_id
                LEFT JOIN br_offers o ON o.request_id = r.id AND o.brigade_id = i.brigade_id
                WHERE i.brigade_id = ? AND i.sent_at IS NOT NULL AND i.declined_at IS NULL AND r.status = 'sent' AND r.deadline_at > ? AND (o.id IS NULL OR o.status = 'draft')", [$bid, linea_now()]) as $r) {
            $add(20, 'Новый заказ: ' . $r['object_title'] . ', ' . (BRIG_DISTRICTS[$r['district']] ?? $r['district']) . ' — ответ до ' . date('d.m.Y', strtotime((string)$r['deadline_at'])), 'Посмотреть', '#/zakaz/' . $r['id']);
        }
    }
    foreach (brig_jobs_for($b) as $j) {
        $jid = (int)$j['id']; $obj = '«' . $j['object_title'] . '»'; $h = '#/obekt/' . $jid;
        if ($j['status'] === 'cancelled') { continue; }
        if ($j['frozen_at']) { $add(4, 'Сделка ' . $obj . ' приостановлена LINEA: ' . $j['frozen_reason'] . '. Лента и разногласия работают', 'Открыть', $h); continue; }
        if ($j['status'] === 'contract') {
            $c = brig_one("SELECT * FROM br_contracts WHERE job_id = ? AND kind = 'main' ORDER BY id DESC LIMIT 1", [$jid]);
            if (!$c || !$c['brigade_signed_at']) { $add(12, $own ? 'Вас выбрали на объекте ' . $obj . ' — проверьте и подпишите договор' : 'Договор по объекту ' . $obj . ' ждёт подписи владельца бригады', $own ? 'Подписать' : 'К договору', $h . '/dogovor'); }
            else { $add(70, 'Договор по объекту ' . $obj . ' подписан вами — ждём подписи заказчика'); }
        }
        foreach (brig_all("SELECT * FROM br_contracts WHERE job_id = ? AND kind = 'addendum' AND status = 'draft' AND brigade_signed_at IS NULL", [$jid]) as $c) {
            $add(13, 'Допсоглашение № ' . $c['num'] . ' по объекту ' . $obj . ' ждёт подписи' . ($own ? '' : ' владельца'), 'Открыть', $h . '/dogovor');
        }
        if ($own) {
            foreach (brig_all("SELECT * FROM br_payments WHERE job_id = ? AND status = 'declared' AND declared_by = 'client'", [$jid]) as $p) {
                $add(11, 'Клиент отметил ' . mb_strtolower(BRIG_PAY_KIND[$p['kind']] ?? 'оплату') . ' ' . brig_rub((int)$p['amount_kop']) . ' по объекту ' . $obj . ' — подтвердите', 'Подтвердить', $h . '/oplaty');
            }
        }
        if ($j['status'] === 'work') {
            foreach (brig_all('SELECT * FROM br_stages WHERE job_id = ? ORDER BY idx', [$jid]) as $s) {
                $nrem = (int)db_val('SELECT COUNT(*) FROM br_remarks WHERE stage_id = ? AND closed_at IS NULL', [(int)$s['id']]);
                if ($s['status'] === 'returned') { $add(14, 'Этап «' . $s['name'] . '» (' . $obj . ') вернули: ' . $nrem . ' ' . kab_plural($nrem, 'замечание', 'замечания', 'замечаний'), 'Открыть замечания', $h . '/etap/' . $s['id']); }
                elseif ($s['status'] === 'work' && !$s['started_at']) { $add(25, 'Начните работу по этапу «' . $s['name'] . '» (' . $obj . ')' . ((int)$s['idx'] === 1 || brig_stage_hidden($s) ? ' — нужны фото «до»' : ''), 'Начать', $h . '/etap/' . $s['id']); }
                elseif ($s['status'] === 'work' && $s['plan_end'] && $s['plan_end'] < $today) { $late = (int)floor((strtotime($today) - strtotime((string)$s['plan_end'])) / 86400); $add(15, 'Этап «' . $s['name'] . '» (' . $obj . ') просрочен на ' . $late . ' дн. — сдайте или предложите новый срок допсоглашением', 'Сдать этап', $h . '/etap/' . $s['id']); }
                elseif ($s['status'] === 'ready') { $add(80, 'Этап «' . $s['name'] . '» (' . $obj . ') ждёт приёмки заказчиком'); }
            }
        }
        foreach (brig_all("SELECT id, status, text FROM br_sheet_reqs WHERE job_id = ? AND status IN ('ready','question') AND updated_at > ?", [$jid, date('Y-m-d H:i:s', time() - 14 * 86400)]) as $s) {
            $add($s['status'] === 'question' ? 16 : 40, ($s['status'] === 'question' ? 'Вопрос по листу: ' : 'Лист готов: ') . mb_substr((string)$s['text'], 0, 60) . ' (' . $obj . ')', 'Открыть', $h . '/listy');
        }
        foreach (brig_all("SELECT * FROM br_disputes WHERE job_id = ? AND status = 'open' AND opened_by = 'client'", [$jid]) as $d) {
            $add(5, 'Заказчик открыл разногласие по объекту ' . $obj . ': ' . $d['subject'] . ($d['reply_due_at'] ? ' — ответ до ' . date('d.m.Y', strtotime((string)$d['reply_due_at'])) : ''), 'Ответить', $h . '/spor');
        }
    }
    if ($own) {
        foreach (brig_all('SELECT * FROM br_invoices WHERE brigade_id = ? AND paid_at IS NULL', [$bid]) as $i) {
            $add(18, 'Счёт ' . $i['number'] . ' на ' . brig_rub((int)$i['amount_kop']) . ($i['due_at'] ? ' — до ' . date('d.m.Y', strtotime((string)$i['due_at'])) : ''), 'Оплатить', '#/dengi');
        }
    }
    usort($todo, fn($a, $c) => $a['prio'] <=> $c['prio']);
    $jobs = brig_jobs_for($b);
    $tiles = [
        ['n' => brig_can($b, 'feed') ? (int)db_val("SELECT COUNT(*) FROM br_invites i JOIN br_requests r ON r.id = i.request_id WHERE i.brigade_id = ? AND i.sent_at IS NOT NULL AND i.declined_at IS NULL AND r.status = 'sent' AND r.deadline_at > ?", [$bid, linea_now()]) : null, 't' => 'заказов в ленте', 'href' => '#/zakazy'],
        ['n' => count(array_filter($jobs, fn($j) => $j['status'] === 'work')), 't' => 'объектов в работе', 'href' => '#/obekty'],
    ];
    if ($own) { $tiles[] = ['n' => brig_rub((int)db_val('SELECT SUM(amount_kop) FROM br_invoices WHERE brigade_id = ? AND paid_at IS NULL', [$bid])), 't' => 'к оплате площадке', 'href' => '#/dengi']; }
    $r = brig_rating($bid);
    $tiles[] = ['n' => $r['avg'] !== null ? number_format($r['avg'], 1, ',', '') . ' (' . $r['n'] . ')' : '—', 't' => 'рейтинг', 'href' => '#/reiting'];
    return ['todo' => array_map(fn($x) => ['text' => $x['text'], 'btn' => $x['btn'], 'href' => $x['href']], $todo), 'tiles' => $tiles];
}

// ───────────────────────── показатели (рейтинг, спецификация 4.9)

function brig_stats(int $bid): array
{
    $acc = brig_all("SELECT s.id FROM br_stages s JOIN br_jobs j ON j.id = s.job_id WHERE j.brigade_id = ? AND s.accepted_at IS NOT NULL", [$bid]);
    $first = 0;
    foreach ($acc as $s) { if (!db_val('SELECT 1 FROM br_remarks WHERE stage_id = ? LIMIT 1', [(int)$s['id']])) { $first++; } }
    $late = (int)db_val("SELECT COUNT(*) FROM br_stages s JOIN br_jobs j ON j.id = s.job_id WHERE j.brigade_id = ? AND s.plan_end IS NOT NULL
        AND ((s.ready_at IS NOT NULL AND SUBSTR(s.ready_at, 1, 10) > s.plan_end) OR (s.ready_at IS NULL AND s.status IN ('work','returned') AND s.plan_end < ?))", [$bid, date('Y-m-d')]);
    return ['rating' => brig_rating($bid), 'deals' => brig_jobs_done($bid),
        'firstTime' => $acc ? (int)round($first * 100 / count($acc)) : null, 'stagesAccepted' => count($acc),
        'responseHours' => brig_response_hours($bid), 'late' => $late,
        'disputes' => (int)db_val("SELECT COUNT(*) FROM br_disputes d JOIN br_jobs j ON j.id = d.job_id WHERE j.brigade_id = ?", [$bid]),
        'warnings' => array_map(fn($w) => ['rule' => $w['rule'], 'step' => (int)$w['step'], 'at' => $w['at'], 'until' => $w['until_at']],
            brig_all('SELECT * FROM br_warnings WHERE brigade_id = ? ORDER BY id DESC LIMIT 10', [$bid]))];
}
