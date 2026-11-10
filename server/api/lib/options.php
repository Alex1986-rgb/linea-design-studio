<?php
/**
 * LINEA · опции заказа проекта (09.11.2026): «Смета на материалы» — дополнение к дизайн-проекту, оплачивается отдельной строкой.
 *
 * Таблица order_options (миграция 10): одна строка на опцию заказа. Статусы: awaiting_payment → paid («смета в работе») → delivered, или cancelled.
 * Цена — config prices[<ключ опции>] (копейки, тот же формат, что у видов заказа: ['per_m2' => 10000, 'min' => 500000]); образец — server/config.example.php;
 * на сайте та же ставка — tools/site-shell.js → TERMS.addons. Нет ключа в config — сумма «уточняется» (amount_kop = NULL), сервис не падает.
 * Платёж: пока проект ждёт оплаты, неоплаченные опции входят в ЕГО платёж (одна оплата, в чеке — отдельная строка); после — отдельный платёж
 * (yk_option_payment_for в lib/yookassa.php). В режиме manual оплату опции отмечает админ в карточке заказа.
 * Файлы результата — linea-private/orders/<номер>/options/<ключ>/ (PDF и таблица xlsx/csv): админ загружает, клиент скачивает в кабинете.
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

require_once __DIR__ . '/kabinet.php';

/** Опции, которые умеет заказ: ключ → название, подпись состояний и допустимые типы файлов результата. */
const OPT_CATALOG = [
    'smeta' => ['title' => 'Смета на материалы', 'ready' => 'Смета на материалы готова', 'work' => 'Смета на материалы в работе', 'ext' => ['pdf', 'xlsx', 'csv']],
];
const OPT_STATUS = [
    'awaiting_payment' => 'Ждёт оплаты',
    'paid'             => 'Оплачена — в работе',
    'delivered'        => 'Готова — файлы в кабинете',
    'cancelled'        => 'Отменена',
];

function opt_title(string $opt): string { return OPT_CATALOG[$opt]['title'] ?? $opt; }

/** Цена опции в копейках по площади; null — «уточняется». */
function opt_price(string $opt, ?float $area): ?int
{
    return isset(OPT_CATALOG[$opt]) ? linea_price($opt, $area) : null;
}

/** Опции заказа (кроме отменённых — по умолчанию). */
function opt_list(int $orderId, bool $withCancelled = false): array
{
    linea_schema();
    return db_all('SELECT * FROM order_options WHERE order_id = ?' . ($withCancelled ? '' : " AND status <> 'cancelled'") . ' ORDER BY id', [$orderId]);
}

function opt_get(int $orderId, string $opt): ?array
{
    linea_schema();
    return db_one('SELECT * FROM order_options WHERE order_id = ? AND opt = ?', [$orderId, $opt]);
}

function opt_dir(array $o, string $opt): string
{
    return linea_private() . '/orders/' . preg_replace('/[^A-Za-z0-9-]/', '', (string)$o['number']) . '/options/' . preg_replace('/[^a-z0-9_-]/', '', $opt);
}

/**
 * Добавить опцию к заказу (бриф или кабинет). Если опция была отменена — возвращается в «ждёт оплаты». @return array{ok:bool,row:?array,why:string,created:bool}
 */
function opt_add(array $o, string $opt, string $source): array
{
    if (!isset(OPT_CATALOG[$opt])) { return ['ok' => false, 'row' => null, 'why' => 'Такой опции нет', 'created' => false]; }
    if (in_array($o['status'], ['cancelled', 'refunded'], true)) { return ['ok' => false, 'row' => null, 'why' => 'Заказ закрыт — опцию добавить нельзя', 'created' => false]; }
    $now = linea_now();
    $area = $o['area'] !== null ? (float)$o['area'] : null;
    $kop = opt_price($opt, $area);
    $cur = opt_get((int)$o['id'], $opt);
    if ($cur) {
        if ($cur['status'] !== 'cancelled') { return ['ok' => false, 'row' => $cur, 'why' => 'Опция уже добавлена', 'created' => false]; }
        db_update('order_options', ['status' => 'awaiting_payment', 'amount_kop' => $kop, 'area' => $area, 'source' => $source, 'payment_id' => null, 'payment_url' => null, 'payment_created_at' => null,
            'invoice_at' => null, 'updated_at' => $now], 'id = ?', [(int)$cur['id']]);
    } else {
        db_insert('order_options', ['order_id' => (int)$o['id'], 'opt' => $opt, 'status' => 'awaiting_payment', 'source' => $source, 'amount_kop' => $kop, 'area' => $area, 'created_at' => $now, 'updated_at' => $now]);
    }
    $row = opt_get((int)$o['id'], $opt);
    linea_event((int)$o['id'], $source === 'kabinet' ? 'client' : 'site', 'Добавлена опция «' . opt_title($opt) . '»' . ($kop ? ' — ' . brig_rub($kop) : ' — сумма уточняется') . ($source === 'kabinet' ? ' (из кабинета)' : ' (в брифе)'));
    return ['ok' => true, 'row' => $row, 'why' => '', 'created' => true];
}

/** Опции, входящие в платёж проекта: неоплаченные с суммой, пока сам проект ждёт оплаты. */
function opt_bundle(array $o): array
{
    if ($o['status'] !== 'awaiting_payment') { return []; }
    return array_values(array_filter(opt_list((int)$o['id']), fn($r) => $r['status'] === 'awaiting_payment' && (int)$r['amount_kop'] > 0));
}

function opt_bundle_kop(array $o): int { return array_sum(array_map(fn($r) => (int)$r['amount_kop'], opt_bundle($o))); }

/** Опцию можно оплатить онлайн сейчас? (сумма есть, режим yookassa; площадь проверена так же, как у проекта) */
function opt_can_pay(array $o, array $r): bool
{
    if (linea_cfg()['mode'] !== 'yookassa' || $r['status'] !== 'awaiting_payment' || (int)$r['amount_kop'] <= 0) { return false; }
    if (in_array($o['status'], ['cancelled', 'refunded'], true)) { return false; }
    // пока проект ждёт оплаты, опция идёт в его платёж — значит действует то же правило подтверждения суммы (В-3)
    return $o['status'] === 'awaiting_payment' ? linea_amount_ok($o) && (int)$o['amount_kop'] > 0 : in_array($o['status'], ['paid', 'delivered'], true);
}

/** Файлы результата: [{name, label, size}] — только те, что лежат на диске. */
function opt_files(array $o, array $r): array
{
    $list = json_decode((string)($r['files'] ?? ''), true);
    if (!is_array($list)) { return []; }
    $dir = opt_dir($o, (string)$r['opt']);
    return array_values(array_filter(array_map(function ($f) use ($dir) {
        $n = basename((string)($f['name'] ?? ''));
        return is_file($dir . '/' . $n) ? ['name' => $n, 'label' => (string)($f['label'] ?? $n), 'size' => (int)filesize($dir . '/' . $n)] : null;
    }, $list)));
}

/** Публичное состояние опции для кабинета: без внутренностей платежа. */
function opt_public(array $o, array $r): array
{
    $files = opt_files($o, $r);
    return ['key' => $r['opt'], 'title' => opt_title((string)$r['opt']), 'status' => $r['status'], 'statusText' => OPT_STATUS[$r['status']] ?? $r['status'],
        'amount' => $r['amount_kop'] !== null ? (int)$r['amount_kop'] / 100 : null, 'amountKnown' => (int)$r['amount_kop'] > 0,
        'canPay' => opt_can_pay($o, $r), 'bundled' => $o['status'] === 'awaiting_payment' && $r['status'] === 'awaiting_payment',
        'invoiced' => (bool)$r['invoice_at'], 'paidAt' => $r['paid_at'], 'deliveredAt' => $r['delivered_at'], 'files' => $files, 'source' => $r['source']];
}

/** Что ещё можно добавить к заказу (нет активной строки опции) — для кнопки в кабинете. Сумма — по площади заказа, null — «уточняется». */
function opt_available(array $o): array
{
    if (in_array($o['status'], ['cancelled', 'refunded'], true)) { return []; }
    $have = array_column(opt_list((int)$o['id']), 'opt');
    $area = $o['area'] !== null ? (float)$o['area'] : null;
    $out = [];
    foreach (OPT_CATALOG as $k => $c) {
        if (in_array($k, $have, true)) { continue; }
        $kop = opt_price($k, $area);
        $out[] = ['key' => $k, 'title' => $c['title'], 'amount' => $kop !== null ? $kop / 100 : null];
    }
    return $out;
}

/** Опция оплачена (деньги получены): отметка, событие, письмо и уведомление админу. $by — «yookassa <id>» или «вручную: …». */
function opt_mark_paid(array $o, array $r, string $by, bool $notify = true): bool
{
    if ($r['status'] !== 'awaiting_payment') { return false; }
    $n = db_exec("UPDATE order_options SET status = 'paid', paid_at = ?, paid_by = ?, updated_at = ? WHERE id = ? AND status = 'awaiting_payment'", [linea_now(), $by, linea_now(), (int)$r['id']]);
    if ($n !== 1) { return false; }
    linea_event((int)$o['id'], str_starts_with($by, 'yookassa') ? 'yookassa' : 'admin', 'Опция «' . opt_title((string)$r['opt']) . '» оплачена: ' . brig_rub((int)$r['amount_kop']) . ' (' . $by . ')');
    if ($notify) {
        $fresh = linea_order_by_number((string)$o['number']);
        kab_notify_order($fresh, kab_ev('opt_paid', $fresh, ['opt' => (string)$r['opt'], 'sum' => (int)$r['amount_kop']]));
        brig_admin_notify('Оплачена опция «' . opt_title((string)$r['opt']) . '»: ' . $o['number'], brig_rub((int)$r['amount_kop']) . ' — сделать и выдать файлы', brig_link('api/panel.php?s=order&o=' . rawurlencode((string)$o['number']) . '&tab=obzor'), (bool)$o['test']);
    }
    return true;
}
