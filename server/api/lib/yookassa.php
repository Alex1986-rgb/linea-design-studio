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

/**
 * Чек 54-ФЗ (передаётся только при config yk_receipt = true; боевой режим этим не включается).
 * tax_system_code — config yk_tax_system (1 ОСН, 2 УСН «доходы», 3 УСН «доходы − расходы», 6 ПСН): обязателен, если у магазина
 * несколько систем налогообложения. Контакт покупателя — почта и/или телефон 7XXXXXXXXXX: без них чек не уйдёт.
 */
function yk_receipt(array $o, int $kop): array
{
    $c = linea_cfg();
    $customer = [];
    if (filter_var(trim((string)$o['email']), FILTER_VALIDATE_EMAIL)) { $customer['email'] = trim((string)$o['email']); }
    $phone = yk_phone((string)$o['phone']);
    if ($phone !== '') { $customer['phone'] = $phone; }
    $tax = $c['yk_tax_system'] ?? null;
    return (in_array((int)$tax, [1, 2, 3, 4, 5, 6], true) ? ['tax_system_code' => (int)$tax] : []) + [
        'customer' => $customer,
        'items' => [[
            'description' => mb_substr((LINEA_KINDS[$o['kind']] ?? 'Дизайн-проект') . ', заказ ' . $o['number'], 0, 128, 'UTF-8'),
            'quantity' => '1.00',
            'amount' => yk_money($kop),
            'vat_code' => (int)$c['yk_vat_code'],
            'payment_mode' => 'full_prepayment',
            'payment_subject' => 'service',
        ]],
    ];
}

/**
 * Платёж по заказу. Живой pending-платёж моложе часа переиспользуется — второй не создаётся.
 * @return array{ok:bool, url:string, why:string}
 */
function yk_payment_for(array $o): array
{
    if (!yk_ready()) { return ['ok' => false, 'url' => '', 'why' => 'онлайн-оплата не включена']; }
    if ($o['status'] !== 'awaiting_payment') { return ['ok' => false, 'url' => '', 'why' => 'заказ не ждёт оплаты']; }
    $kop = (int)($o['amount_kop'] ?? 0);
    if ($kop <= 0) { return ['ok' => false, 'url' => '', 'why' => 'сумма ещё не выставлена']; }
    if (!linea_amount_ok($o)) { return ['ok' => false, 'url' => '', 'why' => 'сумму подтвердим по плану в течение рабочего дня — после этого откроется оплата']; }   // В-3

    if ($o['payment_id'] && $o['payment_url'] && strtotime((string)$o['payment_created_at']) > time() - 3600) {
        $chk = yk_call('GET', 'payments/' . rawurlencode((string)$o['payment_id']));
        $st = (string)($chk['data']['status'] ?? '');
        if ($chk['ok'] && $st === 'pending') { return ['ok' => true, 'url' => (string)$o['payment_url'], 'why' => '']; }
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
        'metadata' => ['order' => $o['number']],
    ];
    if (linea_cfg()['yk_receipt']) { $body['receipt'] = yk_receipt($o, $kop); }
    $res = yk_call('POST', 'payments', $body, $o['number'] . '-' . $try);
    if (!$res['ok']) { linea_log('pay.log', 'create ' . $o['number'] . ' fail: ' . $res['why']); return ['ok' => false, 'url' => '', 'why' => 'платёжный сервис не ответил, попробуйте через минуту']; }
    $url = (string)($res['data']['confirmation']['confirmation_url'] ?? '');
    $id = (string)($res['data']['id'] ?? '');
    if ($url === '' || $id === '') { return ['ok' => false, 'url' => '', 'why' => 'в ответе нет ссылки на оплату']; }
    linea_db()->prepare('UPDATE orders SET payment_id = ?, payment_url = ?, payment_created_at = ?, payment_tries = ?, updated_at = ? WHERE id = ?')
        ->execute([$id, $url, linea_now(), $try, linea_now(), $o['id']]);
    linea_event((int)$o['id'], 'yookassa', 'Создан платёж на ' . number_format($kop / 100, 0, ',', ' ') . ' ₽ (' . $id . ')');
    linea_log('pay.log', 'create ' . $o['number'] . ' ' . $id . ' ' . $kop);
    return ['ok' => true, 'url' => $url, 'why' => ''];
}

/** Платёж наш? Текущий или прежний (после смены суммы) id платежа какого-либо заказа — по своей базе, без запроса в API (В-5). */
function yk_known_payment(string $paymentId): bool
{
    if (!preg_match('/^[0-9a-f-]{20,64}$/i', $paymentId)) { return false; }
    linea_schema();
    $q = linea_db()->prepare('SELECT COUNT(*) FROM orders WHERE payment_id = ? OR payment_ids_old LIKE ?');
    $q->execute([$paymentId, '%' . $paymentId . '%']);
    return (int)$q->fetchColumn() > 0;
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

    if ($status === 'succeeded' && !empty($d['paid'])) {
        if ($kop !== (int)$o['amount_kop'] || ($d['amount']['currency'] ?? '') !== 'RUB') {
            // В-4: деньги пришли по старой сумме (ссылка до смены суммы) — тревога: пометка «нужна проверка», письмо Александру (один раз на платёж)
            linea_log('pay.log', 'settle ' . $o['number'] . ' ' . $paymentId . ' сумма не совпала ' . $kop . ' != ' . $o['amount_kop']);
            yk_alert($o, $paymentId, 'ВНИМАНИЕ: платёж ' . $paymentId . ' на ' . number_format($kop / 100, 0, ',', ' ') . ' ₽ не совпал с суммой заказа ' . number_format((int)$o['amount_kop'] / 100, 0, ',', ' ')
                . ' ₽ — нужна проверка: доплата или возврат разницы', 'LINEA: оплата не совпала с суммой заказа ' . $o['number']);
            return ['ok' => true, 'paid' => false, 'why' => 'сумма не совпала'];
        }
        $q = linea_db()->prepare("UPDATE orders SET status = 'paid', paid_at = ?, paid_by = ?, payment_id = ?, updated_at = ? WHERE id = ? AND status IN ('new','awaiting_payment')");
        $q->execute([linea_now(), 'yookassa ' . $paymentId, $paymentId, linea_now(), $o['id']]);
        if ($q->rowCount() === 1) {
            linea_event((int)$o['id'], 'yookassa', 'Оплата получена: ' . number_format($kop / 100, 0, ',', ' ') . ' ₽ (' . $paymentId . ')');
            linea_log('pay.log', 'paid ' . $o['number'] . ' ' . $paymentId . ' ' . $kop);
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
