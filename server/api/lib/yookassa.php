<?php
/**
 * ЮKassa API v3 для заказов LINEA (перенос из konsulcar/site/api/lib/yookassa.php, адаптирован к заказам).
 *
 * Включается только при config mode = 'yookassa' И заполненных yk_shop_id / yk_secret отдельного магазина LINEA.
 * 🔴 Ключи SeoMarket (~/.claude/secrets/payment.env) сюда не подставлять — это чужой магазин.
 *
 * 🔴 Правила:
 *   · Секретный ключ — только в linea-private/config.php (вне веб-корня и вне git).
 *   · Сумма — из заказа (amount_kop), не из запроса браузера.
 *   · Idempotence-Key обязателен: номер заказа + номер попытки — двойное нажатие не создаёт второй платёж.
 *   · Уведомлению не верим: из тела берём только id платежа и спрашиваем статус у API (GET /v3/payments/{id}).
 *   · Заказ помечается оплаченным один раз (UPDATE … WHERE status != 'paid'), только при succeeded + paid,
 *     совпадении суммы и номера заказа в metadata.
 *   · Чек 54-ФЗ: у самозанятого чек формируется в «Мой налог», поэтому receipt по умолчанию не передаём
 *     (config yk_receipt = true включает «Чеки от ЮKassa», ставка — yk_vat_code, по умолчанию 1 «без НДС»).
 *     С ним же (02.11.2026): второй чек «полный расчёт» при выдаче альбома (yk_full_receipt), возврат из админки через API с чеком
 *     возврата (yk_refund) и уведомления refund.succeeded / refund.canceled (yk_refund_settle). Журнал операций — таблица pay_ops.
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

const YK_API = 'https://api.yookassa.ru/v3/';

/** Адрес API; config yk_api — только для локальной проверки на макете API (боевой конфиг его не задаёт). */
function yk_api(): string { return rtrim((string)(linea_cfg()['yk_api'] ?? '') ?: YK_API, '/') . '/'; }

function yk_ready(): bool
{
    $c = linea_cfg();
    return $c['mode'] === 'yookassa' && (string)$c['yk_shop_id'] !== '' && (string)$c['yk_secret'] !== '';
}

/** @return array{ok:bool, code:int, data:array, why:string} */
function yk_call(string $method, string $path, ?array $body = null, string $idemKey = ''): array
{
    $c = linea_cfg();
    $ch = curl_init(yk_api() . ltrim($path, '/'));
    $headers = ['Content-Type: application/json'];
    if ($idemKey !== '') { $headers[] = 'Idempotence-Key: ' . $idemKey; }
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_USERPWD        => (string)$c['yk_shop_id'] . ':' . (string)$c['yk_secret'],   // Basic shopId:secretKey
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_CONNECTTIMEOUT => 8,
    ]);
    if ($body !== null) { curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE)); }
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    if ($raw === false) { return ['ok' => false, 'code' => 0, 'data' => [], 'why' => $err ?: 'нет ответа']; }
    $data = json_decode((string)$raw, true);
    if (!is_array($data)) { return ['ok' => false, 'code' => $code, 'data' => [], 'why' => 'ответ не разобран']; }
    if ($code >= 400) { return ['ok' => false, 'code' => $code, 'data' => $data, 'why' => (string)($data['description'] ?? $data['code'] ?? ('код ' . $code))]; }
    return ['ok' => true, 'code' => $code, 'data' => $data, 'why' => ''];
}

function yk_money(int $kop): array { return ['value' => number_format($kop / 100, 2, '.', ''), 'currency' => 'RUB']; }

/** Телефон для чека ЮKassa: 7XXXXXXXXXX (11 цифр без «+»); 8…/10 цифр с 9 приводятся, остальное — пустая строка (не передаём). */
function yk_phone(string $raw): string
{
    $d = preg_replace('/\D/', '', $raw) ?? '';
    if (strlen($d) === 11 && ($d[0] === '8' || $d[0] === '7')) { return '7' . substr($d, 1); }
    if (strlen($d) === 10 && $d[0] === '9') { return '7' . $d; }
    return '';
}

/** Покупатель для чека: почта и/или телефон 7XXXXXXXXXX (без них чек не уйдёт). */
function yk_customer(array $o): array
{
    $customer = [];
    if (filter_var(trim((string)$o['email']), FILTER_VALIDATE_EMAIL)) { $customer['email'] = trim((string)$o['email']); }
    $phone = yk_phone((string)$o['phone']);
    if ($phone !== '') { $customer['phone'] = $phone; }
    return $customer;
}

/** Позиция чека: услуга по заказу; $mode — признак способа расчёта (full_prepayment — предоплата 100 %, full_payment — полный расчёт). */
function yk_item(array $o, int $kop, string $mode): array
{
    return [
        'description' => mb_substr((LINEA_KINDS[$o['kind']] ?? 'Дизайн-проект') . ', заказ ' . $o['number'], 0, 128, 'UTF-8'),
        'quantity' => '1.00',
        'amount' => yk_money($kop),
        'vat_code' => (int)linea_cfg()['yk_vat_code'],
        'payment_mode' => $mode,
        'payment_subject' => 'service',
    ];
}

/** tax_system_code — config yk_tax_system (1 ОСН, 2 УСН «доходы», 3 УСН «доходы − расходы», 6 ПСН); не задан — не передаём. */
function yk_tax(): array
{
    $tax = linea_cfg()['yk_tax_system'] ?? null;
    return in_array((int)$tax, [1, 2, 3, 4, 5, 6], true) ? ['tax_system_code' => (int)$tax] : [];
}

/**
 * Чек 54-ФЗ к платежу (передаётся только при config yk_receipt = true; боевой режим этим не включается). Деньги за проект приходят до
 * выдачи альбома — это предоплата 100 % (full_prepayment); при выдаче альбома уходит второй чек «полный расчёт» (yk_full_receipt()).
 */
function yk_receipt(array $o, int $kop, array $extraItems = []): array
{
    return yk_tax() + ['customer' => yk_customer($o), 'items' => array_merge($kop > 0 ? [yk_item($o, $kop, 'full_prepayment')] : [], $extraItems)];
}

/** Строка чека для опции заказа («Смета на материалы» — отдельной позицией). */
function yk_item_opt(array $o, array $r, string $mode = 'full_prepayment'): array
{
    return [
        'description' => mb_substr(opt_title((string)$r['opt']) . ', заказ ' . $o['number'], 0, 128, 'UTF-8'),
        'quantity' => '1.00', 'amount' => yk_money((int)$r['amount_kop']), 'vat_code' => (int)linea_cfg()['yk_vat_code'],
        'payment_mode' => $mode, 'payment_subject' => 'service',
    ];
}

// ───────────────────────── второй чек и возвраты (54-ФЗ). Всё — только при yk_receipt = true (по умолчанию выключено).

/** Чеки и возвраты через API онлайн-кассы включены: онлайн-оплата включена и config yk_receipt = true. */
function yk_receipts_on(): bool { return yk_ready() && !empty(linea_cfg()['yk_receipt']); }

/** Заказ оплачен через ЮKassa (а не счётом/вручную) — только к такому платежу API даёт чек и возврат. */
function yk_paid_online(array $o): bool { return str_starts_with((string)($o['paid_by'] ?? ''), 'yookassa ') && (string)($o['payment_id'] ?? '') !== ''; }

/**
 * Первый платёж заказа прошёл С ЧЕКОМ 54-ФЗ через ЮKassa (ревью 02.11.2026, В2): только к такому заказу уходит второй чек
 * «полный расчёт» (settlement prepayment) и возврат через API с чеком возврата. Признак — orders.paid_receipt (ставится при оплате,
 * если платёж создавался с receipt или ЮKassa вернула receipt_registration), плюс config yk_receipts_since (ГГГГ-ММ-ДД[ ЧЧ:ММ:СС]):
 * заказы, оплаченные раньше этой даты, считаются старыми при любом флаге. Старые — «выбить вручную» (событие в заказе), не автоматически.
 */
function yk_receipt_chain(array $o): bool
{
    if (!yk_paid_online($o) || empty($o['paid_receipt'])) { return false; }
    $since = trim((string)(linea_cfg()['yk_receipts_since'] ?? ''));
    return $since === '' || (string)($o['paid_at'] ?? '') >= $since;
}

/** Пометка в заказе (один раз на текст-префикс): чек или возврат — вручную. */
function yk_manual_mark(array $o, string $who, string $text): void
{
    $pfx = mb_substr($text, 0, 40);
    if (!db_val('SELECT 1 FROM events WHERE order_id = ? AND text LIKE ?', [(int)$o['id'], $pfx . '%'])) { linea_event((int)$o['id'], $who, $text); }
}

/** Операция в журнале pay_ops: новая или обновление по ключу идемпотентности. @return id */
function yk_op_put(array $o, string $kind, string $idem, int $kop, string $status, string $reason, string $who, ?string $pid = null): int
{
    $now = linea_now();
    $have = db_one('SELECT id FROM pay_ops WHERE idem = ?', [$idem]);
    if ($have) {
        db_update('pay_ops', array_filter(['status' => $status, 'provider_id' => $pid, 'updated_at' => $now], fn($v) => $v !== null), 'id = ?', [(int)$have['id']]);
        return (int)$have['id'];
    }
    return db_insert('pay_ops', ['order_id' => (int)$o['id'], 'kind' => $kind, 'provider_id' => $pid, 'idem' => $idem, 'amount_kop' => $kop, 'status' => $status,
        'reason' => mb_substr($reason, 0, 500), 'by_who' => $who, 'created_at' => $now, 'updated_at' => $now]);
}

function yk_rub(int $kop): string { return number_format($kop / 100, 0, ',', ' ') . ' ₽'; }

/**
 * Второй чек «полный расчёт» при выдаче альбома: оказанная услуга закрывает ранее оплаченную предоплату (settlement prepayment).
 * Один раз на заказ (ключ идемпотентности rcpt2-<номер>); не ушёл — повторит cron. Оплата не через ЮKassa — чек вручную (событие).
 * @return array{ok:bool, done:bool, why:string}
 */
function yk_full_receipt(array $o, string $who = 'system'): array
{
    linea_schema();
    if (!yk_receipts_on()) { return ['ok' => true, 'done' => false, 'why' => 'чеки через онлайн-кассу выключены']; }
    if (!empty($o['receipt2_id'])) { return ['ok' => true, 'done' => true, 'why' => 'второй чек уже отправлен']; }
    if ($o['status'] !== 'delivered') { return ['ok' => true, 'done' => false, 'why' => 'альбом ещё не выдан']; }
    if (!yk_paid_online($o)) {
        yk_manual_mark($o, $who, 'Второй чек: оплата была не через онлайн-кассу — чек «полный расчёт» выбить вручную');
        return ['ok' => true, 'done' => false, 'why' => 'оплата не через онлайн-кассу'];
    }
    if (!yk_receipt_chain($o)) {   // В2: первый платёж прошёл без чека ЮKassa (самозанятый, «Мой налог») — второй чек по нему касса не примет
        yk_manual_mark($o, $who, 'Второй чек: первый платёж прошёл без чека онлайн-кассы (до включения чеков) — чек «полный расчёт» выбить вручную');
        return ['ok' => true, 'done' => false, 'why' => 'первый платёж без чека онлайн-кассы — выбить вручную'];
    }
    if (!empty($o['pd_purged_at'])) { return ['ok' => true, 'done' => false, 'why' => 'данные заказа обезличены — чек вручную']; }   // С5: нет почты покупателя
    $kop = (int)$o['amount_kop'] - (int)($o['refunded_kop'] ?? 0);
    if ($kop <= 0) { return ['ok' => true, 'done' => false, 'why' => 'оплата возвращена полностью — второй чек не нужен']; }
    // С4: пока возврат в пути, признак расчёта в его чеке уже выбран (предоплата) — второй чек ждёт проведения возврата
    if ((int)db_val("SELECT COUNT(*) FROM pay_ops WHERE order_id = ? AND kind = 'refund' AND status IN ('pending','sent')", [(int)$o['id']])) {
        return ['ok' => true, 'done' => false, 'why' => 'возврат в пути — второй чек после его проведения (повторим автоматически)'];
    }
    $idem = 'rcpt2-' . $o['number'];
    // повтор после сбоя: ЮKassa помнит ключ идемпотентности 24 часа — позже повтор создал бы второй чек; пауза час между попытками (С5)
    $prevOp = db_one('SELECT * FROM pay_ops WHERE idem = ?', [$idem]);
    if ($prevOp && $who === 'cron') {
        if (strtotime((string)$prevOp['created_at']) < time() - 20 * 3600) {
            yk_manual_mark($o, $who, 'Второй чек: онлайн-касса не приняла чек «полный расчёт» за сутки попыток — проверить в кабинете ЮKassa и выбить вручную');
            return ['ok' => true, 'done' => false, 'why' => 'попытки закончились — вручную'];
        }
        if (strtotime((string)$prevOp['updated_at']) > time() - 3600) { return ['ok' => true, 'done' => false, 'why' => 'пауза между попытками']; }
    }
    $body = yk_tax() + ['customer' => yk_customer($o), 'payment_id' => (string)$o['payment_id'], 'type' => 'payment', 'send' => true,
        'items' => [yk_item($o, $kop, 'full_payment')], 'settlement' => [['type' => 'prepayment', 'amount' => yk_money($kop)]]];
    $res = yk_call('POST', 'receipts', $body, $idem);
    if (!$res['ok'] || (string)($res['data']['id'] ?? '') === '') {
        yk_op_put($o, 'receipt', $idem, $kop, 'failed', 'второй чек: ' . ($res['why'] ?: 'нет id'), $who);
        linea_log('pay.log', 'receipt2 ' . $o['number'] . ' fail: ' . $res['why']);
        return ['ok' => false, 'done' => false, 'why' => 'онлайн-касса не приняла чек: ' . ($res['why'] ?: 'нет ответа') . ' — повторим автоматически'];
    }
    $rid = (string)$res['data']['id']; $st = (string)($res['data']['status'] ?? 'pending');
    yk_op_put($o, 'receipt', $idem, $kop, $st, 'чек «полный расчёт» при выдаче альбома', $who, $rid);
    db_update('orders', ['receipt2_id' => $rid, 'receipt2_at' => linea_now(), 'receipt2_status' => $st, 'updated_at' => linea_now()], 'id = ?', [(int)$o['id']]);
    linea_event((int)$o['id'], $who, 'Второй чек «полный расчёт» на ' . yk_rub($kop) . ' отправлен (' . $rid . ', ' . $st . ')');
    linea_log('pay.log', 'receipt2 ' . $o['number'] . ' ' . $rid . ' ' . $st);
    return ['ok' => true, 'done' => true, 'why' => ''];
}

/** Сколько ещё можно вернуть: оплачено − уже возвращено (refunded_kop) − возвраты в пути (созданы, но не проведены). */
function yk_refund_left(array $o): int
{
    $way = (int)(db_val("SELECT SUM(amount_kop) FROM pay_ops WHERE order_id = ? AND kind = 'refund' AND status IN ('pending','sent')", [(int)$o['id']]) ?? 0);
    return max(0, (int)$o['amount_kop'] - (int)($o['refunded_kop'] ?? 0) - $way);
}

/**
 * Возврат через API (частичный или полный) с чеком возврата. Признак расчёта в чеке возврата — как у последнего чека прихода:
 * до второго чека — предоплата 100 %, после — полный расчёт. succeeded — применяется сразу, pending — по уведомлению refund.succeeded.
 * Повтор после сбоя связи идёт с тем же ключом идемпотентности (ЮKassa вернёт тот же возврат, второго не будет).
 * @return array{ok:bool, status:string, why:string, id:string}
 */
function yk_refund(array $o, int $kop, string $reason, string $who): array
{
    linea_schema();
    $fail = fn(string $w) => ['ok' => false, 'status' => '', 'why' => $w, 'id' => ''];
    if (!yk_receipts_on()) { return $fail('возврат через API выключен (yk_receipt) — проведите в кабинете онлайн-оплаты и отметьте вручную'); }
    if (!yk_paid_online($o)) { return $fail('заказ оплачен не через онлайн-кассу — возврат банком, отметьте вручную'); }
    if (!yk_receipt_chain($o)) { return $fail('первый платёж прошёл без чека онлайн-кассы — возврат в кабинете ЮKassa, чек возврата вручную; затем отметьте возврат'); }
    if (!in_array($o['status'], ['paid', 'delivered'], true)) { return $fail('возврат — только по оплаченному заказу'); }
    if (trim($reason) === '') { return $fail('укажите причину'); }
    // С2: сначала свериться с ЮKassa по возвратам «в пути» и созданным без ответа — иначе повтор другой суммой мог бы создать второй возврат
    yk_refund_reconcile($o);
    $o = db_one('SELECT * FROM orders WHERE id = ?', [(int)$o['id']]) ?: $o;
    if (db_val("SELECT 1 FROM pay_ops WHERE order_id = ? AND kind = 'refund' AND status = 'sent'", [(int)$o['id']])) {
        return $fail('предыдущий возврат ещё не подтверждён онлайн-кассой — дождитесь сверки (каждые 15 минут) и проверьте журнал заказа');
    }
    $limbo = db_one("SELECT * FROM pay_ops WHERE order_id = ? AND kind = 'refund' AND status = 'failed' AND provider_id IS NULL AND created_at > ? ORDER BY id DESC LIMIT 1",
        [(int)$o['id'], date('Y-m-d H:i:s', time() - 24 * 3600)]);
    if ($limbo && (int)$limbo['amount_kop'] !== $kop) {
        return $fail('прошлый возврат на ' . yk_rub((int)$limbo['amount_kop']) . ' мог дойти до онлайн-кассы без ответа — повторите ту же сумму (повтор безопасен) или проверьте кабинет ЮKassa');
    }
    $left = yk_refund_left($o);
    if ($kop <= 0 || $kop > $left) { return $fail('сумма возврата — больше нуля и не больше ' . yk_rub(max(0, $left))); }
    $prev = db_one("SELECT * FROM pay_ops WHERE order_id = ? AND kind = 'refund' AND status = 'failed' AND amount_kop = ? ORDER BY id DESC LIMIT 1", [(int)$o['id'], $kop]);
    $idem = $prev ? (string)$prev['idem'] : 'rf-' . $o['number'] . '-' . (1 + (int)db_val("SELECT COUNT(*) FROM pay_ops WHERE order_id = ? AND kind = 'refund'", [(int)$o['id']]));
    $opId = yk_op_put($o, 'refund', $idem, $kop, 'sent', $reason, $who);
    $body = ['payment_id' => (string)$o['payment_id'], 'amount' => yk_money($kop), 'description' => mb_substr('Возврат по заказу ' . $o['number'], 0, 250, 'UTF-8'),
        'receipt' => yk_tax() + ['customer' => yk_customer($o), 'items' => [yk_item($o, $kop, !empty($o['receipt2_id']) ? 'full_payment' : 'full_prepayment')]]];
    $res = yk_call('POST', 'refunds', $body, $idem);
    $rid = (string)($res['data']['id'] ?? '');
    if (!$res['ok'] || $rid === '') {
        // 4xx — касса отказала явно (возврата нет); 5xx и обрыв — возврат мог создаться: «failed» без id, его ищет сверка (С2)
        db_update('pay_ops', ['status' => $res['code'] >= 400 && $res['code'] < 500 ? 'rejected' : 'failed', 'updated_at' => linea_now()], 'id = ?', [$opId]);
        linea_event((int)$o['id'], $who, 'Возврат ' . yk_rub($kop) . ' не создан: ' . ($res['why'] ?: 'нет ответа'));
        linea_log('pay.log', 'refund ' . $o['number'] . ' fail: ' . $res['why']);
        return $fail('онлайн-касса не приняла возврат: ' . ($res['why'] ?: 'нет ответа'));
    }
    $st = (string)($res['data']['status'] ?? 'pending');
    db_update('pay_ops', ['provider_id' => $rid, 'status' => $st === 'succeeded' ? 'pending' : $st, 'updated_at' => linea_now()], 'id = ?', [$opId]);
    linea_event((int)$o['id'], $who, 'Возврат ' . yk_rub($kop) . ' создан в онлайн-кассе (' . $rid . ', ' . $st . '): ' . $reason . '. Чек возврата — автоматически');
    linea_log('pay.log', 'refund ' . $o['number'] . ' ' . $rid . ' ' . $st . ' ' . $kop);
    if ($st === 'succeeded') { yk_refund_apply($opId, $who); }
    return ['ok' => $st !== 'canceled', 'status' => $st, 'why' => $st === 'canceled' ? 'онлайн-касса отклонила возврат' : '', 'id' => $rid];
}

/** Возврат проведён: один раз (UPDATE с условием) — сумма возвращённого, полный возврат → статус «Возврат оплаты», событие, письма. */
function yk_refund_apply(int $opId, string $who = 'yookassa'): bool
{
    if (db_exec("UPDATE pay_ops SET status = 'succeeded', updated_at = ? WHERE id = ? AND status <> 'succeeded'", [linea_now(), $opId]) !== 1) { return false; }
    $op = db_one('SELECT * FROM pay_ops WHERE id = ?', [$opId]);
    $o = db_one('SELECT * FROM orders WHERE id = ?', [(int)$op['order_id']]);
    db_exec('UPDATE orders SET refunded_kop = refunded_kop + ?, updated_at = ? WHERE id = ?', [(int)$op['amount_kop'], linea_now(), (int)$o['id']]);
    $o = db_one('SELECT * FROM orders WHERE id = ?', [(int)$o['id']]);
    $full = (int)$o['refunded_kop'] >= (int)$o['amount_kop'];
    if ($full) { db_exec("UPDATE orders SET status = 'refunded', updated_at = ? WHERE id = ? AND status IN ('paid','delivered')", [linea_now(), (int)$o['id']]); }
    $text = 'Возврат ' . yk_rub((int)$op['amount_kop']) . ' проведён' . ($full ? ' — оплата возвращена полностью' : ' (частичный; всего возвращено ' . yk_rub((int)$o['refunded_kop']) . ')') . '. Чек возврата отправлен онлайн-кассой';
    linea_event((int)$o['id'], $who, $text);
    linea_log('pay.log', 'refund-ok ' . $o['number'] . ' ' . $op['provider_id'] . ' ' . $op['amount_kop']);
    try {
        require_once __DIR__ . '/kabinet.php';
        kab_notice_order($o, 'dengi', 'Возврат ' . yk_rub((int)$op['amount_kop']) . ' проведён. Деньги вернутся тем же способом, каким вы платили; чек возврата придёт на почту.');
    } catch (Throwable $e) { linea_log('error.log', 'refund notice: ' . $e->getMessage()); }
    require_once __DIR__ . '/notify.php';
    linea_notify('LINEA: возврат по заказу ' . $o['number'], $text . "\n" . linea_base() . '/api/panel.php?s=order&o=' . rawurlencode((string)$o['number']), (bool)$o['test']);
    return true;
}

/**
 * Привязать возврат из ответа API к своей операции без id (С2): тот же платёж нашего заказа, та же сумма, операция «отправлена» или
 * «не создана» без ответа. @return привязан
 */
function yk_refund_link(array $r): bool
{
    $rid = (string)($r['id'] ?? ''); $pid = (string)($r['payment_id'] ?? '');
    if ($rid === '' || $pid === '' || yk_known_refund($rid)) { return yk_known_refund($rid); }
    $o = db_one('SELECT * FROM orders WHERE payment_id = ?', [$pid]);
    if (!$o) { return false; }
    $kop = (int)round(((float)($r['amount']['value'] ?? 0)) * 100);
    $op = db_one("SELECT * FROM pay_ops WHERE order_id = ? AND kind = 'refund' AND provider_id IS NULL AND status IN ('sent','failed') AND amount_kop = ? ORDER BY id LIMIT 1", [(int)$o['id'], $kop]);
    if (!$op) { return false; }
    $st = (string)($r['status'] ?? 'pending');
    if (db_exec("UPDATE pay_ops SET provider_id = ?, status = ?, updated_at = ? WHERE id = ? AND provider_id IS NULL", [$rid, $st === 'canceled' ? 'canceled' : 'pending', linea_now(), (int)$op['id']]) !== 1) { return yk_known_refund($rid); }
    linea_event((int)$o['id'], 'yookassa', 'Возврат ' . yk_rub($kop) . ' найден в онлайн-кассе при сверке (' . $rid . ', ' . $st . ')');
    linea_log('pay.log', 'refund-link ' . $o['number'] . ' ' . $rid . ' ' . $st);
    return true;
}

/**
 * Сверка возвратов заказа с ЮKassa (С2; cron и перед новым возвратом): операции «в пути» с id — GET /refunds/{id}; без id
 * (процесс упал или таймаут после создания) — GET /refunds?payment_id=… и привязка по сумме. Не найден за час — «не создан» (не держит сумму).
 * @return сколько операций изменилось
 */
function yk_refund_reconcile(array $o): int
{
    if (!yk_ready() || !yk_paid_online($o)) { return 0; }
    linea_schema();
    $n = 0;
    $ops = db_all("SELECT * FROM pay_ops WHERE order_id = ? AND kind = 'refund' AND (status IN ('pending','sent') OR (status = 'failed' AND provider_id IS NULL AND created_at > ?))",
        [(int)$o['id'], date('Y-m-d H:i:s', time() - 48 * 3600)]);
    if (!$ops) { return 0; }
    if (array_filter($ops, fn($x) => $x['provider_id'] === null || $x['provider_id'] === '')) {
        $list = yk_call('GET', 'refunds?payment_id=' . rawurlencode((string)$o['payment_id']));
        if ($list['ok']) { foreach ((array)($list['data']['items'] ?? []) as $r) { if (is_array($r) && !yk_known_refund((string)($r['id'] ?? '')) && yk_refund_link($r)) { $n++; } } }
        foreach (db_all("SELECT * FROM pay_ops WHERE order_id = ? AND kind = 'refund' AND status = 'sent' AND provider_id IS NULL AND updated_at < ?", [(int)$o['id'], date('Y-m-d H:i:s', time() - 3600)]) as $x) {
            if ($list['ok']) { db_exec("UPDATE pay_ops SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'sent'", [linea_now(), (int)$x['id']]); $n++; }
        }
    }
    foreach (db_all("SELECT * FROM pay_ops WHERE order_id = ? AND kind = 'refund' AND status IN ('pending','sent') AND provider_id IS NOT NULL", [(int)$o['id']]) as $x) {
        $before = (string)$x['status'];
        yk_refund_settle((string)$x['provider_id']);
        if ((string)db_val('SELECT status FROM pay_ops WHERE id = ?', [(int)$x['id']]) !== $before) { $n++; }
    }
    return $n;
}

/** Возврат наш? По своей базе (pay_ops), без запроса в API. */
function yk_known_refund(string $refundId): bool
{
    if (!preg_match('/^[0-9a-f-]{20,64}$/i', $refundId)) { return false; }
    linea_schema();
    return (bool)db_val("SELECT 1 FROM pay_ops WHERE kind = 'refund' AND provider_id = ?", [$refundId]);
}

/** Уведомление refund.succeeded / refund.canceled: статус — только из API (GET /v3/refunds/{id}). @return array{ok:bool, why:string} */
function yk_refund_settle(string $refundId): array
{
    if (!yk_ready() || !preg_match('/^[0-9a-f-]{20,64}$/i', $refundId)) { return ['ok' => true, 'why' => 'не наш возврат']; }
    $known = yk_known_refund($refundId);
    // С2: уведомление пришло раньше, чем мы записали id (или ответ API потерян) — ищем «свою» операцию без id только при наличии таких
    if (!$known && !db_val("SELECT 1 FROM pay_ops WHERE kind = 'refund' AND provider_id IS NULL AND status IN ('sent','failed')")) { return ['ok' => true, 'why' => 'не наш возврат']; }
    $res = yk_call('GET', 'refunds/' . rawurlencode($refundId));
    if (!$res['ok']) { return $res['code'] === 404 ? ['ok' => true, 'why' => 'возврат не найден'] : ['ok' => false, 'why' => $res['why']]; }
    if (!$known && !yk_refund_link($res['data'])) { return ['ok' => true, 'why' => 'не наш возврат']; }
    $op = db_one("SELECT * FROM pay_ops WHERE kind = 'refund' AND provider_id = ?", [$refundId]);
    $st = (string)($res['data']['status'] ?? '');
    $kop = (int)round(((float)($res['data']['amount']['value'] ?? 0)) * 100);
    if ($kop !== (int)$op['amount_kop']) { linea_log('pay.log', 'refund ' . $refundId . ' сумма не совпала'); return ['ok' => true, 'why' => 'сумма не совпала']; }
    if ($st === 'succeeded') { yk_refund_apply((int)$op['id']); return ['ok' => true, 'why' => 'succeeded']; }
    if ($st === 'canceled' && db_exec("UPDATE pay_ops SET status = 'canceled', updated_at = ? WHERE id = ? AND status NOT IN ('canceled','succeeded')", [linea_now(), (int)$op['id']]) === 1) {
        $o = db_one('SELECT * FROM orders WHERE id = ?', [(int)$op['order_id']]);
        yk_alert($o, $refundId, 'ВНИМАНИЕ: платёж ' . $refundId . ' — возврат ' . yk_rub($kop) . ' отклонён онлайн-кассой (' . (string)($res['data']['cancellation_details']['reason'] ?? '—') . ') — провести иначе',
            'LINEA: возврат по заказу ' . $o['number'] . ' отклонён');
    }
    return ['ok' => true, 'why' => $st];
}

/**
 * Платёж по заказу. Живой pending-платёж моложе часа переиспользуется — второй не создаётся.
 * @return array{ok:bool, url:string, why:string}
 */
function yk_payment_for(array $o): array
{
    if (!yk_ready()) { return ['ok' => false, 'url' => '', 'why' => 'онлайн-оплата не включена']; }
    if ($o['status'] !== 'awaiting_payment') { return ['ok' => false, 'url' => '', 'why' => 'заказ не ждёт оплаты']; }
    $kopProj = (int)($o['amount_kop'] ?? 0);
    if ($kopProj <= 0) { return ['ok' => false, 'url' => '', 'why' => 'сумма ещё не выставлена']; }
    if (!linea_amount_ok($o)) { return ['ok' => false, 'url' => '', 'why' => 'сумму подтвердим по плану в течение рабочего дня — после этого откроется оплата']; }   // В-3
    // опции заказа («Смета на материалы»), отмеченные в брифе или добавленные до оплаты, идут в этот же платёж отдельными строками
    require_once __DIR__ . '/options.php';
    $bundle = opt_bundle($o);
    $kop = $kopProj + array_sum(array_map(fn($r) => (int)$r['amount_kop'], $bundle));
    $optKeys = implode(',', array_map(fn($r) => (string)$r['opt'], $bundle));

    if ($o['payment_id'] && $o['payment_url'] && strtotime((string)$o['payment_created_at']) > time() - 3600) {
        $chk = yk_call('GET', 'payments/' . rawurlencode((string)$o['payment_id']));
        $st = (string)($chk['data']['status'] ?? '');
        // старую ссылку переиспользуем, только если сумма в ней равна текущей (опцию могли добавить после создания платежа)
        $sameSum = $chk['ok'] && (int)round(((float)($chk['data']['amount']['value'] ?? 0)) * 100) === $kop;
        if ($chk['ok'] && $st === 'pending' && $sameSum) { return ['ok' => true, 'url' => (string)$o['payment_url'], 'why' => '']; }
        if ($chk['ok'] && in_array($st, ['succeeded', 'waiting_for_capture'], true)) {
            yk_settle((string)$o['payment_id']);
            return ['ok' => false, 'url' => '', 'why' => 'платёж уже проведён — обновите страницу'];
        }
    }

    $try = (int)$o['payment_tries'] + 1;
    $body = [
        'amount' => yk_money($kop),
        'capture' => true,
        'description' => mb_substr('LINEA, заказ ' . $o['number'], 0, 128, 'UTF-8'),
        'confirmation' => ['type' => 'redirect', 'return_url' => linea_base() . '/order.html?t=' . $o['token'] . '&pay=back'],
        'metadata' => ['order' => $o['number']] + ($optKeys !== '' ? ['opts' => $optKeys] : []),
    ];
    if ($optKeys !== '') { $body['description'] = mb_substr('LINEA, заказ ' . $o['number'] . ' + ' . implode(', ', array_map(fn($r) => mb_strtolower(opt_title((string)$r['opt'])), $bundle)), 0, 128, 'UTF-8'); }
    if (linea_cfg()['yk_receipt']) { $body['receipt'] = yk_receipt($o, $kopProj, array_map(fn($r) => yk_item_opt($o, $r), $bundle)); }
    $res = yk_call('POST', 'payments', $body, $o['number'] . '-' . $try);
    if (!$res['ok']) { linea_log('pay.log', 'create ' . $o['number'] . ' fail: ' . $res['why']); return ['ok' => false, 'url' => '', 'why' => 'платёжный сервис не ответил, попробуйте через минуту']; }
    $url = (string)($res['data']['confirmation']['confirmation_url'] ?? '');
    $id = (string)($res['data']['id'] ?? '');
    if ($url === '' || $id === '') { return ['ok' => false, 'url' => '', 'why' => 'в ответе нет ссылки на оплату']; }
    linea_schema();
    linea_db()->prepare('UPDATE orders SET payment_id = ?, payment_url = ?, payment_created_at = ?, payment_tries = ?, payment_receipt = ?, updated_at = ? WHERE id = ?')
        ->execute([$id, $url, linea_now(), $try, isset($body['receipt']) ? 1 : 0, linea_now(), $o['id']]);
    linea_event((int)$o['id'], 'yookassa', 'Создан платёж на ' . number_format($kop / 100, 0, ',', ' ') . ' ₽ (' . $id . ')');
    linea_log('pay.log', 'create ' . $o['number'] . ' ' . $id . ' ' . $kop);
    return ['ok' => true, 'url' => $url, 'why' => ''];
}

/**
 * Отдельный платёж за опцию заказа (проект уже оплачен или оплачивается отдельно). Пока проект ждёт оплаты, опция идёт в платёж проекта (yk_payment_for).
 * Сумма — из строки order_options, не из запроса. Idempotence-Key: номер заказа + опция + попытка. @return array{ok:bool, url:string, why:string}
 */
function yk_option_payment_for(array $o, string $opt): array
{
    require_once __DIR__ . '/options.php';
    if (!yk_ready()) { return ['ok' => false, 'url' => '', 'why' => 'онлайн-оплата не включена']; }
    $r = opt_get((int)$o['id'], $opt);
    if (!$r || $r['status'] !== 'awaiting_payment') { return ['ok' => false, 'url' => '', 'why' => 'опция не ждёт оплаты']; }
    if ($o['status'] === 'awaiting_payment') { return ['ok' => false, 'url' => '', 'why' => 'опция оплачивается вместе с проектом']; }
    $kop = (int)($r['amount_kop'] ?? 0);
    if ($kop <= 0) { return ['ok' => false, 'url' => '', 'why' => 'сумма опции ещё не выставлена']; }
    if (!opt_can_pay($o, $r)) { return ['ok' => false, 'url' => '', 'why' => 'оплата этой опции сейчас недоступна']; }
    if ($r['payment_id'] && $r['payment_url'] && strtotime((string)$r['payment_created_at']) > time() - 3600) {
        $chk = yk_call('GET', 'payments/' . rawurlencode((string)$r['payment_id']));
        $st = (string)($chk['data']['status'] ?? '');
        if ($chk['ok'] && $st === 'pending') { return ['ok' => true, 'url' => (string)$r['payment_url'], 'why' => '']; }
        if ($chk['ok'] && in_array($st, ['succeeded', 'waiting_for_capture'], true)) {
            yk_settle((string)$r['payment_id']);
            return ['ok' => false, 'url' => '', 'why' => 'платёж уже проведён — обновите страницу'];
        }
    }
    $try = (int)$r['payment_tries'] + 1;
    $body = [
        'amount' => yk_money($kop), 'capture' => true,
        'description' => mb_substr('LINEA, заказ ' . $o['number'] . ' — ' . mb_strtolower(opt_title($opt)), 0, 128, 'UTF-8'),
        'confirmation' => ['type' => 'redirect', 'return_url' => linea_base() . '/kabinet/#/o/' . $o['number'] . '/proekt'],
        'metadata' => ['order' => $o['number'], 'opts' => $opt, 'proj' => '0'],
    ];
    if (linea_cfg()['yk_receipt']) { $body['receipt'] = yk_receipt($o, 0, [yk_item_opt($o, $r)]); }
    $res = yk_call('POST', 'payments', $body, $o['number'] . '-' . $opt . '-' . $try);
    if (!$res['ok']) { linea_log('pay.log', 'create-opt ' . $o['number'] . ' ' . $opt . ' fail: ' . $res['why']); return ['ok' => false, 'url' => '', 'why' => 'платёжный сервис не ответил, попробуйте через минуту']; }
    $url = (string)($res['data']['confirmation']['confirmation_url'] ?? '');
    $id = (string)($res['data']['id'] ?? '');
    if ($url === '' || $id === '') { return ['ok' => false, 'url' => '', 'why' => 'в ответе нет ссылки на оплату']; }
    db_update('order_options', ['payment_id' => $id, 'payment_url' => $url, 'payment_created_at' => linea_now(), 'payment_tries' => $try, 'payment_receipt' => isset($body['receipt']) ? 1 : 0, 'updated_at' => linea_now()], 'id = ?', [(int)$r['id']]);
    linea_event((int)$o['id'], 'yookassa', 'Создан платёж за «' . opt_title($opt) . '» на ' . number_format($kop / 100, 0, ',', ' ') . ' ₽ (' . $id . ')');
    linea_log('pay.log', 'create-opt ' . $o['number'] . ' ' . $opt . ' ' . $id . ' ' . $kop);
    return ['ok' => true, 'url' => $url, 'why' => ''];
}

/** Платёж наш? Текущий или прежний (после смены суммы) id платежа какого-либо заказа или опции — по своей базе, без запроса в API (В-5). */
function yk_known_payment(string $paymentId): bool
{
    if (!preg_match('/^[0-9a-f-]{20,64}$/i', $paymentId)) { return false; }
    linea_schema();
    $q = linea_db()->prepare('SELECT COUNT(*) FROM orders WHERE payment_id = ? OR payment_ids_old LIKE ?');
    $q->execute([$paymentId, '%' . $paymentId . '%']);
    if ((int)$q->fetchColumn() > 0) { return true; }
    return (int)db_val('SELECT COUNT(*) FROM order_options WHERE payment_id = ?', [$paymentId]) > 0;
}

/** Адрес в списке подсетей (IPv4/IPv6, «адрес/маска»). */
function yk_ip_in(string $ip, array $nets): bool
{
    $bin = @inet_pton($ip);
    if ($bin === false) { return false; }
    foreach ($nets as $net) {
        [$n, $m] = array_pad(explode('/', (string)$net, 2), 2, null);
        $nb = @inet_pton((string)$n);
        if ($nb === false || strlen($nb) !== strlen($bin)) { continue; }
        $bits = $m === null ? strlen($nb) * 8 : (int)$m;
        $bytes = intdiv($bits, 8); $rem = $bits % 8;
        if (substr($bin, 0, $bytes) !== substr($nb, 0, $bytes)) { continue; }
        if ($rem && ((ord($bin[$bytes]) ^ ord($nb[$bytes])) & (0xFF << (8 - $rem)) & 0xFF)) { continue; }
        return true;
    }
    return false;
}

/** Тревога по оплате: пометка «нужна проверка» в заказе, событие и письмо Александру — один раз на платёж. */
function yk_alert(array $o, string $paymentId, string $text, string $subject): void
{
    $mark = 'ВНИМАНИЕ: платёж ' . $paymentId;
    $q = linea_db()->prepare('SELECT COUNT(*) FROM events WHERE order_id = ? AND text LIKE ?');
    $q->execute([(int)$o['id'], $mark . '%']);
    if ((int)$q->fetchColumn()) { return; }
    linea_schema();
    linea_db()->prepare('UPDATE orders SET pay_alert_at = ?, updated_at = ? WHERE id = ?')->execute([linea_now(), linea_now(), (int)$o['id']]);
    linea_event((int)$o['id'], 'yookassa', $text);
    require_once __DIR__ . '/notify.php';
    linea_notify($subject, $text . "\n" . linea_base() . '/api/admin.php?o=' . rawurlencode((string)$o['number']), (bool)$o['test']);
}

/**
 * Старый платёж при смене суммы (В-4): ждёт подтверждения (capture=false) — отменяем; pending с capture=true ЮKassa отменить не даёт —
 * он истечёт сам, а если клиент всё же оплатит, вебхук узнает id (orders.payment_ids_old) и поднимет тревогу. @return что сделано (для истории)
 */
function yk_cancel_stale(string $paymentId): string
{
    if (!yk_ready() || !preg_match('/^[0-9a-f-]{20,64}$/i', $paymentId)) { return 'онлайн-оплата не включена'; }
    $chk = yk_call('GET', 'payments/' . rawurlencode($paymentId));
    $st = (string)($chk['data']['status'] ?? '');
    if (!$chk['ok']) { return 'ЮKassa не ответила — проверить в кабинете'; }
    if ($st === 'waiting_for_capture') {
        $c = yk_call('POST', 'payments/' . rawurlencode($paymentId) . '/cancel', [], 'cancel-' . $paymentId);
        return $c['ok'] ? 'отменён в ЮKassa' : 'отменить не удалось — проверить в кабинете';
    }
    if ($st === 'pending') { return 'ещё не оплачен, истечёт сам; если оплатят — придёт тревога'; }
    return 'статус в ЮKassa: ' . ($st ?: '?');
}

/**
 * Свериться с API по id платежа и отметить заказ. Тело уведомления доказательством не считается.
 * @return array{ok:bool, paid:bool, why:string}  ok=false — сбой у нас или у API (вебхук ответит 500, ЮKassa повторит)
 */
function yk_settle(string $paymentId): array
{
    if (!yk_ready() || !preg_match('/^[0-9a-f-]{20,64}$/i', $paymentId)) { return ['ok' => true, 'paid' => false, 'why' => 'не наш платёж']; }
    $res = yk_call('GET', 'payments/' . rawurlencode($paymentId));
    if (!$res['ok']) {
        // 404 — такого платежа у магазина нет: подделка, отвечаем 200 и ничего не меняем
        if ($res['code'] === 404) { return ['ok' => true, 'paid' => false, 'why' => 'платёж не найден']; }
        return ['ok' => false, 'paid' => false, 'why' => $res['why']];
    }
    $d = $res['data'];
    $o = linea_order_by_number((string)($d['metadata']['order'] ?? ''));
    if (!$o) { return ['ok' => true, 'paid' => false, 'why' => 'нет заказа']; }
    $status = (string)($d['status'] ?? '');
    $kop = (int)round(((float)($d['amount']['value'] ?? 0)) * 100);

    // платёж за опцию отдельно от проекта (metadata.proj = 0): помечаем только строку order_options, заказ не трогаем
    if ((string)($d['metadata']['proj'] ?? '1') === '0') { return yk_settle_option($o, $d, $paymentId, $status, $kop); }
    // платёж проекта вместе с опциями (metadata.opts): ждём сумму проекта + неоплаченные опции из метаданных
    require_once __DIR__ . '/options.php';
    $optNames = array_values(array_filter(explode(',', (string)($d['metadata']['opts'] ?? '')), fn($k) => isset(OPT_CATALOG[$k])));
    $optRows = [];
    $optAll = [];
    foreach ($optNames as $k) {
        $r = opt_get((int)$o['id'], $k);
        if (!$r || (int)$r['amount_kop'] <= 0) { continue; }
        if ($r['status'] === 'awaiting_payment') { $optRows[] = $r; $optAll[] = $r; }
        elseif (in_array($r['status'], ['paid', 'delivered'], true) && (string)$r['paid_by'] === 'yookassa ' . $paymentId) { $optAll[] = $r; }   // уже учтена этим платежом — повтор уведомления
    }
    $expect = (int)$o['amount_kop'] + array_sum(array_map(fn($r) => (int)$r['amount_kop'], $optAll));

    if ($status === 'succeeded' && !empty($d['paid'])) {
        if ($kop !== $expect || ($d['amount']['currency'] ?? '') !== 'RUB') {
            // В-4: деньги пришли по старой сумме (ссылка до смены суммы) — тревога: пометка «нужна проверка», письмо Александру (один раз на платёж)
            linea_log('pay.log', 'settle ' . $o['number'] . ' ' . $paymentId . ' сумма не совпала ' . $kop . ' != ' . $o['amount_kop']);
            yk_alert($o, $paymentId, 'ВНИМАНИЕ: платёж ' . $paymentId . ' на ' . number_format($kop / 100, 0, ',', ' ') . ' ₽ не совпал с суммой заказа ' . number_format((int)$o['amount_kop'] / 100, 0, ',', ' ')
                . ' ₽ — нужна проверка: доплата или возврат разницы', 'LINEA: оплата не совпала с суммой заказа ' . $o['number']);
            return ['ok' => true, 'paid' => false, 'why' => 'сумма не совпала'];
        }
        // В2: «первый платёж с чеком» — платёж создавался с receipt (текущий платёж заказа) или ЮKassa сообщила о регистрации чека
        linea_schema();
        $withRcpt = (!empty($d['receipt_registration']) || ((string)$o['payment_id'] === $paymentId && !empty($o['payment_receipt']))) ? 1 : 0;
        $q = linea_db()->prepare("UPDATE orders SET status = 'paid', paid_at = ?, paid_by = ?, payment_id = ?, paid_receipt = ?, updated_at = ? WHERE id = ? AND status IN ('new','awaiting_payment')");
        $q->execute([linea_now(), 'yookassa ' . $paymentId, $paymentId, $withRcpt, linea_now(), $o['id']]);
        if ($q->rowCount() === 1) {
            linea_event((int)$o['id'], 'yookassa', 'Оплата получена: ' . number_format($kop / 100, 0, ',', ' ') . ' ₽ (' . $paymentId . ')');
            linea_log('pay.log', 'paid ' . $o['number'] . ' ' . $paymentId . ' ' . $kop);
            $paidNow = linea_order_by_number((string)$o['number']);
            opt_main_sync($paidNow);   // заказ «только смета»: основная строка для выдачи файлов
            foreach ($optRows as $r) { opt_mark_paid($paidNow, $r, 'yookassa ' . $paymentId, true); }   // опции, оплаченные тем же платежом
            require_once __DIR__ . '/notify.php';
            linea_notify('LINEA: оплачен заказ ' . $o['number'], 'Заказ ' . $o['number'] . ' оплачен через ЮKassa: '
                . number_format($kop / 100, 0, ',', ' ') . " ₽.\nСтарт работы — сейчас.\n" . linea_base() . '/api/admin.php', (bool)$o['test']);
            return ['ok' => true, 'paid' => true, 'why' => ''];
        }
        $cur = linea_order_by_number((string)$o['number']);
        if ($cur && in_array($cur['status'], ['paid', 'delivered'], true) && (string)$cur['payment_id'] === $paymentId) {
            return ['ok' => true, 'paid' => true, 'why' => ''];          // повтор уведомления об уже учтённом платеже
        }
        // Деньги пришли на заказ, который оплаты не ждёт (отменён или уже оплачен другим платежом): это НЕ успех.
        // Пометка в истории заказа (один раз на платёж), журнал и письмо Александру — вернуть деньги или восстановить заказ вручную.
        $mark = 'ВНИМАНИЕ: платёж ' . $paymentId;
        $q2 = linea_db()->prepare('SELECT COUNT(*) FROM events WHERE order_id = ? AND text LIKE ?');
        $q2->execute([(int)$o['id'], $mark . '%']);
        if (!(int)$q2->fetchColumn()) {
            linea_schema();
            linea_db()->prepare('UPDATE orders SET pay_alert_at = ? WHERE id = ?')->execute([linea_now(), (int)$o['id']]);
            linea_event((int)$o['id'], 'yookassa', $mark . ' на ' . number_format($kop / 100, 0, ',', ' ') . ' ₽ пришёл на заказ в статусе «'
                . (LINEA_STATUS[$cur['status'] ?? ''] ?? ($cur['status'] ?? '?')) . '» — оформить возврат в кабинете ЮKassa или вернуть заказ в работу');
            linea_log('pay.log', 'unexpected ' . $o['number'] . ' ' . $paymentId . ' status=' . ($cur['status'] ?? '?') . ' ' . $kop);
            require_once __DIR__ . '/notify.php';
            linea_notify('LINEA: платёж по заказу ' . $o['number'] . ' вне статуса «ждёт оплаты»', 'Платёж ' . $paymentId . ' на '
                . number_format($kop / 100, 0, ',', ' ') . ' ₽ пришёл на заказ ' . $o['number'] . ' (статус: ' . ($cur['status'] ?? '?') . ").\nПроверьте и оформите возврат или верните заказ в работу.\n"
                . linea_base() . '/api/admin.php?o=' . rawurlencode((string)$o['number']), (bool)$o['test']);
        }
        return ['ok' => true, 'paid' => false, 'why' => 'заказ не ждёт оплаты — свяжемся и вернём деньги'];
    }
    if ($status === 'canceled' && $o['payment_id'] === $paymentId) {
        linea_db()->prepare('UPDATE orders SET payment_id = NULL, payment_url = NULL, payment_created_at = NULL, updated_at = ? WHERE id = ?')->execute([linea_now(), $o['id']]);
        linea_event((int)$o['id'], 'yookassa', 'Платёж ' . $paymentId . ' отменён (' . (string)($d['cancellation_details']['reason'] ?? '—') . ')');
        linea_log('pay.log', 'canceled ' . $o['number'] . ' ' . $paymentId);
    }
    return ['ok' => true, 'paid' => false, 'why' => $status];
}


/** Отдельный платёж за опцию заказа: проверка суммы по строке order_options и отметка «оплачена». @return array{ok:bool, paid:bool, why:string} */
function yk_settle_option(array $o, array $d, string $paymentId, string $status, int $kop): array
{
    require_once __DIR__ . '/options.php';
    $opt = (string)explode(',', (string)($d['metadata']['opts'] ?? ''))[0];
    $r = isset(OPT_CATALOG[$opt]) ? opt_get((int)$o['id'], $opt) : null;
    if (!$r) { return ['ok' => true, 'paid' => false, 'why' => 'нет опции']; }
    if ($status === 'succeeded' && !empty($d['paid'])) {
        if ($kop !== (int)$r['amount_kop'] || ($d['amount']['currency'] ?? '') !== 'RUB') {
            $mark = 'ВНИМАНИЕ: платёж ' . $paymentId;
            if (!(int)db_val('SELECT COUNT(*) FROM events WHERE order_id = ? AND text LIKE ?', [(int)$o['id'], $mark . '%'])) {
                linea_event((int)$o['id'], 'yookassa', $mark . ' на ' . number_format($kop / 100, 0, ',', ' ') . ' ₽ не совпал с суммой опции «' . opt_title($opt) . '» ' . number_format((int)$r['amount_kop'] / 100, 0, ',', ' ') . ' ₽ — нужна проверка');
                require_once __DIR__ . '/notify.php';
                linea_notify('LINEA: оплата опции не совпала с суммой, заказ ' . $o['number'], 'Платёж ' . $paymentId . ' на ' . number_format($kop / 100, 0, ',', ' ') . ' ₽ по опции «' . opt_title($opt) . '».' . "\n" . linea_base() . '/api/admin.php?o=' . rawurlencode((string)$o['number']), (bool)$o['test']);
            }
            return ['ok' => true, 'paid' => false, 'why' => 'сумма не совпала'];
        }
        if ($r['status'] === 'awaiting_payment' && (string)$r['payment_id'] === $paymentId) {
            opt_mark_paid($o, $r, 'yookassa ' . $paymentId, true);
            linea_log('pay.log', 'paid-opt ' . $o['number'] . ' ' . $opt . ' ' . $paymentId . ' ' . $kop);
            return ['ok' => true, 'paid' => true, 'why' => ''];
        }
        if (in_array($r['status'], ['paid', 'delivered'], true) && (string)$r['payment_id'] === $paymentId) { return ['ok' => true, 'paid' => true, 'why' => '']; }
        linea_log('pay.log', 'unexpected-opt ' . $o['number'] . ' ' . $opt . ' ' . $paymentId . ' status=' . $r['status']);
        return ['ok' => true, 'paid' => false, 'why' => 'опция не ждёт оплаты — свяжемся и вернём деньги'];
    }
    if ($status === 'canceled' && (string)$r['payment_id'] === $paymentId) {
        db_update('order_options', ['payment_id' => null, 'payment_url' => null, 'payment_created_at' => null, 'updated_at' => linea_now()], 'id = ?', [(int)$r['id']]);
        linea_event((int)$o['id'], 'yookassa', 'Платёж за «' . opt_title($opt) . '» ' . $paymentId . ' отменён (' . (string)($d['cancellation_details']['reason'] ?? '—') . ')');
    }
    return ['ok' => true, 'paid' => false, 'why' => $status];
}
