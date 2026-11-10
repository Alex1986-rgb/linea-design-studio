<?php
/**
 * LINEA · письма клиенту по событиям заказа проекта (09.11.2026, критика кабинета: «клиент не знает, что происходит»).
 *
 * Что здесь:
 *   · kab_mail_build()   — единый шаблон письма: простая вёрстка (HTML + текстовая версия), тема с номером заказа, одна главная кнопка.
 *   · kab_ev()           — тексты событий заказа: бриф получен, сумма, счёт, оплата, этап, выпуск, правки, сообщение, выдача, отмена, возврат.
 *   · kab_notify_order() — событие = уведомление в кабинете + письмо, с учётом настроек клиента (письма по группам, сводка раз в день).
 *   · kab_digest_send()  — сводка за сутки для тех, кто выбрал «сводкой раз в день» (вызывает cron.php).
 *   · kab_pay_info()     — расшифровка суммы (площадь × ставка, минимум), условия — из lib/terms-client.json (TERMS сайта).
 *
 * 🔴 Правила: письма не уходят, пока в config brig_mail_enabled = false, у тестовых заказов (test=1) и при LINEA_MAIL_DRY — тогда пишется
 *    только строка в brig-mail.log (а при env LINEA_MAIL_OUTBOX=1 — полное письмо в linea-private/mail-outbox.jsonl, для проверок).
 *    Юридически значимые письма (деньги, отмена, возврат) приходят всегда и настройками не отключаются. Условия и суммы — только из
 *    terms-client.json (генерирует tools/gen-kabinet-page.js из TERMS) и config; слов «бесплатно», «0 ₽», «без предоплаты» нет.
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

/** Условия сервиса для писем и карточки оплаты — из tools/gen-kabinet-page.js (TERMS сайта). */
function kab_terms_client(): array
{
    static $t = null;
    if ($t === null) {
        $f = __DIR__ . '/terms-client.json';
        $t = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
    }
    return $t;
}

const KAB_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
/** «2026-11-14 …» → «14 ноября». */
function kab_date_ru(?string $d, bool $withYear = false): string
{
    $ts = $d ? strtotime(substr($d, 0, 10) . ' 12:00') : false;
    if (!$ts) { return ''; }
    return (int)date('j', $ts) . ' ' . KAB_MONTHS[(int)date('n', $ts) - 1] . ($withYear ? ' ' . date('Y', $ts) : '');
}

/** Строка про плановую дату следующего шага (orders.expected_at, ставит админка). */
function kab_expected_line(array $o): string
{
    if (empty($o['expected_at'])) { return ''; }
    $d = kab_date_ru((string)$o['expected_at']);
    return 'Плановая дата следующего шага — ' . ($o['expected_note'] ? $o['expected_note'] . ': ' : '') . 'до ' . $d . '.';
}

/**
 * Расшифровка суммы: площадь × ставка, минимум, что входит и условия. Все числа — из config prices (боевые) или terms-client.json (TERMS).
 * @return array{amount:?int,formula:string,rate:?int,min:?int,area:?float,minApplied:bool,matches:bool,includes:array,rounds:?int,roundsText:string,refund:string,offer:string,requisites:string,requisitesSet:bool,notIncluded:array}
 */
function kab_pay_info(array $o): array
{
    $tc = kab_terms_client();
    $cfgP = linea_cfg()['prices'][$o['kind']] ?? null;
    $solo = ($o['kind'] ?? '') === 'smeta';   // заказ «только смета»: ставка и минимум — сметы, не проекта
    $ta = $solo ? (array)($tc['addons']['smeta'] ?? []) : [];
    $rateKop = is_array($cfgP) && (int)($cfgP['per_m2'] ?? 0) > 0 ? (int)$cfgP['per_m2'] : ($solo ? (isset($ta['rate']) ? (int)$ta['rate'] * 100 : null) : (isset($tc['rate']) ? (int)$tc['rate'] * 100 : null));
    $minKop = is_array($cfgP) && isset($cfgP['min']) ? (int)$cfgP['min'] : ($solo ? (isset($ta['min']) ? (int)$ta['min'] * 100 : null) : (isset($tc['min']) ? (int)$tc['min'] * 100 : null));
    $area = $o['area'] !== null ? (float)$o['area'] : null;
    $amount = $o['amount_kop'] !== null ? (int)$o['amount_kop'] : null;
    $formula = ''; $minApplied = false; $matches = false;
    if ($amount && $area && $rateKop) {
        $byArea = (int)round($area * $rateKop);
        $calc = max((int)$minKop, $byArea);
        $matches = $calc === $amount;
        $minApplied = $minKop && $byArea < $minKop;
        $ar = str_replace('.', ',', (string)$area);
        if ($matches) {
            $formula = $minApplied
                ? 'Минимальный заказ — как за ' . ($solo ? ($ta['minArea'] ?? 50) : ($tc['minArea'] ?? 40)) . ' м²: ' . brig_rub($minKop) . ' (по вашей площади, ' . $ar . ' м² × ' . brig_rub($rateKop) . ', вышло бы ' . brig_rub($byArea) . ')'
                : $ar . ' м² × ' . brig_rub($rateKop) . ' = ' . brig_rub($amount);
        } else {
            $formula = 'Сумма уточнена по плану и согласована: ' . brig_rub($amount) . ' (ставка ' . brig_rub($rateKop) . ' за м², минимальный заказ ' . brig_rub($minKop) . ')';
        }
    }
    $req = linea_requisites();
    $reqSet = $req !== null || !empty($tc['requisites']);
    // опции заказа («Смета на материалы»): отдельные строки оплаты; в платёж проекта входят неоплаченные, пока проект ждёт оплаты (lib/options.php)
    require_once __DIR__ . '/options.php';
    $opts = array_map(fn($r) => opt_public($o, $r), opt_list((int)$o['id']));
    $optDue = array_sum(array_map(fn($r) => (int)$r['amount_kop'], array_filter(opt_list((int)$o['id']), fn($r) => $r['status'] === 'awaiting_payment' && (int)$r['amount_kop'] > 0)));
    $projDue = in_array($o['status'], ['new', 'awaiting_payment'], true) && $amount ? $amount : 0;
    return [
        'amount' => $amount, 'formula' => $formula, 'rate' => $rateKop, 'min' => $minKop, 'area' => $area, 'minApplied' => $minApplied, 'matches' => $matches,
        'includes' => $solo ? array_values(array_filter([(string)($ta['line'] ?? ''), (string)($ta['solo']['termLine'] ?? ''), 'Смета начинается после оплаты', (string)($ta['solo']['accuracy'] ?? '')]))
            : array_values(array_filter([(string)($tc['line'] ?? ''), (string)($tc['roundsText'] ?? ''), (string)($tc['start'] ?? '')])),
        'notIncluded' => $solo ? array_values((array)($ta['excludes'] ?? [])) : (array)($tc['notIncluded'] ?? []),
        'rounds' => $solo ? null : (isset($tc['rounds']) ? (int)$tc['rounds'] : null), 'roundsText' => $solo ? '' : (string)($tc['roundsText'] ?? ''),
        'refund' => (string)(($tc['pages']['refund'] ?? 'oplata/')), 'offer' => (string)(($tc['pages']['offer'] ?? 'oferta/')),
        'requisitesSet' => $reqSet,
        'options' => $opts, 'optionsDue' => $optDue, 'totalDue' => $projDue + $optDue, 'projectAmount' => $amount,
        'addons' => (array)($tc['addons'] ?? []),
        'requisites' => $req !== null ? trim((string)$req['name'] . ', ИНН ' . (string)$req['inn']) : (!empty($tc['requisites']) ? (string)$tc['reqLine'] : (string)($tc['reqLine'] ?? '')),
    ];
}

// ───────────────────────── шаблон письма

/**
 * @param array{title:string,lead:string,rows?:array,note?:string,btn?:string,url?:string,legal?:bool,footer?:string} $p
 * @return array{0:string,1:string} [текст, html]
 */
function kab_mail_build(array $p): array
{
    $h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    $rows = array_values(array_filter((array)($p['rows'] ?? []), fn($r) => trim((string)($r[1] ?? '')) !== ''));
    $foot = $p['footer'] ?? (!empty($p['legal'])
        ? 'Это письмо о платеже или статусе заказа — оно приходит всегда.'
        : 'Письма по темам можно отключить или собрать в одну сводку раз в день: кабинет → Уведомления.');
    // текстовая версия
    $t = [(string)$p['title'], str_repeat('-', min(60, mb_strlen((string)$p['title']))), '', (string)$p['lead']];
    foreach ($rows as $r) { $t[] = $r[0] . ': ' . $r[1]; }
    if (!empty($p['note'])) { $t[] = ''; $t[] = (string)$p['note']; }
    if (!empty($p['url'])) { $t[] = ''; $t[] = ($p['btn'] ?? 'Открыть кабинет') . ': ' . $p['url']; $t[] = 'Войти в кабинет — кодом на эту почту, пароль не нужен.'; }
    $t[] = ''; $t[] = $foot; $t[] = 'LINEA · дизайн-проекты квартир';
    $text = implode("\n", $t);
    // HTML: таблицы и встроенные стили — так письмо читается в любой почте; тёмной темы нет
    $rowsH = '';
    foreach ($rows as $r) { $rowsH .= '<tr><td style="padding:6px 12px 6px 0;color:#6b665c;font-size:14px;vertical-align:top;white-space:nowrap">' . $h($r[0]) . '</td><td style="padding:6px 0;font-size:15px;color:#1d1b18">' . $h($r[1]) . '</td></tr>'; }
    $html = '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . $h($p['title']) . '</title></head>'
        . '<body style="margin:0;padding:0;background:#f4f2ee"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee"><tr><td align="center" style="padding:24px 12px">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3ded4"><tr><td style="padding:28px 28px 8px;font:600 15px Georgia,serif;letter-spacing:5px;color:#8a5a12">LINEA</td></tr>'
        . '<tr><td style="padding:4px 28px 0;font:600 21px/1.3 Georgia,serif;color:#1d1b18">' . $h($p['title']) . '</td></tr>'
        . '<tr><td style="padding:14px 28px 4px;font:16px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1d1b18">' . nl2br($h($p['lead'])) . '</td></tr>'
        . ($rowsH ? '<tr><td style="padding:6px 28px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif"><table role="presentation" cellpadding="0" cellspacing="0">' . $rowsH . '</table></td></tr>' : '')
        . (!empty($p['note']) ? '<tr><td style="padding:6px 28px;font:14px/1.55 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#6b665c">' . nl2br($h($p['note'])) . '</td></tr>' : '')
        . (!empty($p['url']) ? '<tr><td style="padding:18px 28px 6px"><a href="' . $h($p['url']) . '" style="display:inline-block;background:#8a5a12;color:#ffffff;text-decoration:none;font:600 16px -apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:13px 26px;border-radius:3px">' . $h($p['btn'] ?? 'Открыть кабинет') . '</a></td></tr>'
            . '<tr><td style="padding:6px 28px 0;font:13px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#6b665c">Войти в кабинет — кодом на эту почту, пароль не нужен.</td></tr>' : '')
        . '<tr><td style="padding:22px 28px 26px;font:12.5px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#8a8579;border-top:0">' . $h($foot) . '<br>LINEA · дизайн-проекты квартир</td></tr></table></td></tr></table></body></html>';
    return [$text, $html];
}

/** Отправка письма «текст + HTML». Правила «сухого» режима — как у brig_mail(). @return 'sent'|'dry'|'failed' */
function kab_mail_send(string $to, string $key, string $subject, string $text, string $html, bool $test): string
{
    $cfg = linea_cfg();
    $subject = str_replace(["\r", "\n"], ' ', $subject);
    $dry = $test || empty($cfg['brig_mail_enabled']) || getenv('LINEA_MAIL_DRY') || !filter_var($to, FILTER_VALIDATE_EMAIL);
    if ($dry) {
        linea_log('brig-mail.log', 'DRY ' . ($test ? '[test] ' : '') . $key . ' · ' . $subject);
        linea_mail_outbox($to, $key, $subject, $text, $html);
        return 'dry';
    }
    $from = trim((string)$cfg['mail_from']) ?: 'no-reply@' . (string)parse_url(linea_base(), PHP_URL_HOST);
    $b = 'linea_' . bin2hex(random_bytes(8));
    $body = "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text))
        . "--$b\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html)) . "--$b--\r\n";
    $headers = implode("\r\n", ['From: LINEA <' . $from . '>', 'MIME-Version: 1.0', 'Content-Type: multipart/alternative; boundary="' . $b . '"']);
    $ok = @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers, '-f' . $from);
    linea_log('brig-mail.log', ($ok ? 'SENT ' : 'FAILED ') . $key . ' · ' . $subject);
    return $ok ? 'sent' : 'failed';
}

// ───────────────────────── события заказа

/** Ссылка на кабинет заказа для письма. */
function kab_order_url(array $o, string $tab = ''): string { return brig_link('kabinet/#/o/' . $o['number'] . ($tab !== '' ? '/' . $tab : '')); }

/**
 * Событие заказа → ['grp','subject','text','lead','rows','note','btn','tab','legal','ukey'].
 * $x — параметры события (title, ver, final, count, deadline, reason, text, status, reply…).
 */
function kab_ev_proekt(string $name, array $o, array $x = []): array
{
    $rub = fn($kop) => $kop === null || $kop === '' ? '' : brig_rub((int)$kop);
    $num = (string)$o['number'];
    $exp = kab_expected_line($o);
    $pi = kab_pay_info($o);
    $tc = kab_terms_client();
    switch ($name) {
        case 'brief': {
            $sum = (int)$o['amount_kop'] > 0 && linea_amount_ok($o);
            $rows = [['Номер заказа', $num], ['Объект', trim((string)$o['object_type'] . ($o['area'] ? ', ' . str_replace('.', ',', (string)$o['area']) . ' м²' : ''))],
                ['Сумма', $sum ? $rub($o['amount_kop']) : 'подтвердим в течение рабочего дня']];
            if ($sum && $pi['formula'] !== '') { $rows[] = ['Как посчитано', $pi['formula']]; }
            foreach ($pi['options'] as $op) {   // опции заказа отдельной строкой («Смета на материалы»)
                $rows[] = [$op['title'], $op['amountKnown'] ? $rub((int)round($op['amount'] * 100)) . ' — отдельной строкой' : 'сумму подтвердим'];
            }
            if ($sum && $pi['optionsDue'] > 0) { $rows[] = ['Итого к оплате', $rub($o['amount_kop'] + $pi['optionsDue'])]; }
            $next = $sum ? 'Дальше: оплатите проект в кабинете (картой или СБП) — или мы пришлём счёт на эту почту. Работа начинается после оплаты.'
                : 'Дальше: мы проверим бриф и план, подтвердим сумму и напишем вам. Работа начинается после оплаты.';
            return ['grp' => 'proekt', 'subject' => 'бриф получен', 'text' => 'Бриф ' . $num . ' получен. ' . ($sum ? 'Сумма — ' . $rub($o['amount_kop']) . '.' : 'Сумму подтвердим в течение рабочего дня.'),
                'title' => 'Бриф получен — заказ ' . $num, 'lead' => 'Спасибо! Мы получили ваш бриф и план. ' . $next, 'rows' => $rows,
                'note' => trim(($exp ? $exp . "\n" : '') . (($tc['term'] ?? '') !== '' ? mb_strtoupper(mb_substr((string)$tc['term'], 0, 1)) . mb_substr((string)$tc['term'], 1) . '.' : '') . "\n" . 'Сохраните номер заказа — по нему мы находим ваш проект.'),
                'btn' => 'Открыть кабинет заказа', 'tab' => 'proekt', 'legal' => true];
        }
        case 'amount': {
            $rows = [['Заказ', $num], ['Сумма проекта', $rub($o['amount_kop'])], ['Как посчитано', $pi['formula']]];
            return ['grp' => 'dengi', 'subject' => 'сумма подтверждена: ' . $rub($o['amount_kop']), 'text' => 'Сумма проекта подтверждена: ' . $rub($o['amount_kop']) . '. Можно оплачивать.',
                'title' => 'Сумма проекта подтверждена', 'lead' => 'Мы проверили бриф и план: сумма проекта ' . $rub($o['amount_kop']) . '. Оплатите в кабинете картой или СБП — работа начнётся сразу после оплаты.',
                'rows' => $rows, 'note' => trim(($pi['roundsText'] !== '' ? $pi['roundsText'] . '. ' : '') . 'Условия возврата — на странице «Оплата и возврат».' . ($exp ? "\n" . $exp : '')),
                'btn' => 'Перейти к оплате', 'tab' => 'proekt', 'legal' => true];
        }
        case 'invoice':
            return ['grp' => 'dengi', 'subject' => 'счёт на оплату ' . $rub($o['amount_kop']), 'text' => 'Счёт на оплату ' . $rub($o['amount_kop']) . ' отправлен на почту.',
                'title' => 'Счёт на оплату проекта', 'lead' => 'Выставили счёт на ' . $rub($o['amount_kop']) . ' по заказу ' . $num . '. Реквизиты и назначение платежа — в счёте. Как только оплата придёт, мы напишем и начнём работу.',
                'rows' => [['Заказ', $num], ['Сумма', $rub($o['amount_kop'])], ['Исполнитель', $pi['requisites']]], 'note' => 'Условия возврата — на странице «Оплата и возврат».',
                'btn' => 'Открыть кабинет заказа', 'tab' => 'proekt', 'legal' => true];
        case 'paid':
            return ['grp' => 'dengi', 'subject' => 'оплата получена, работа начата', 'text' => 'Оплата получена — работа над проектом началась.' . ($exp ? ' ' . $exp : ''),
                'title' => 'Оплата получена — работа начата', 'lead' => 'Спасибо! Оплата по заказу ' . $num . ' получена, мы начали работу над проектом. Когда первый вариант будет готов, напишем сюда, на почту.',
                'rows' => [['Заказ', $num], ['Оплачено', $rub($o['amount_kop'])], ['Срок', $tc['term'] ?? '']],
                'note' => trim($exp . ($exp ? "\n" : '') . 'Если нужны размеры или фото, которых вы не присылали, мы спросим в кабинете — так быстрее.'),
                'btn' => 'Открыть кабинет заказа', 'tab' => 'proekt', 'legal' => true];
        case 'stage': {
            $t = trim((string)($x['text'] ?? ''));
            return ['grp' => 'proekt', 'subject' => (string)($x['title'] ?? 'этап проекта'), 'text' => (string)($x['title'] ?? 'Этап проекта') . ($t !== '' ? ': ' . mb_substr($t, 0, 200) : ''),
                'title' => (string)($x['title'] ?? 'Этап проекта'), 'lead' => $t !== '' ? $t : 'Работа над проектом идёт по плану.', 'rows' => [['Заказ', $num]],
                'note' => $exp, 'btn' => 'Открыть кабинет заказа', 'tab' => (string)($x['tab'] ?? 'proekt'), 'legal' => false];
        }
        case 'release': {
            $q = (int)($x['questions'] ?? 0);
            $title = (string)($x['title'] ?? 'Новая версия альбома');
            $rows = [['Заказ', $num], ['Версия', $title . (!empty($x['final']) ? ' — финальная' : (!empty($x['prelim']) ? ' — предварительная, для обсуждения' : ''))]];
            if ($q) { $rows[] = ['Вопросы к вам', $q . ' ' . kab_plural($q, 'вопрос', 'вопроса', 'вопросов') . ($x['deadline'] ?? '' ? ' — ответьте до ' . kab_date_ru((string)$x['deadline']) : '')]; }
            $left = $x['roundsLeft'] ?? null;
            return ['grp' => 'proekt', 'subject' => 'вышла версия альбома «' . $title . '»', 'text' => 'Вышла версия альбома «' . $title . '»' . (!empty($x['final']) ? ' — финальная' : '') . '. Откройте и посмотрите.',
                'title' => !empty($x['final']) ? 'Финальный альбом готов' : 'Вышла новая версия альбома',
                'lead' => (!empty($x['final']) ? 'Финальная версия альбома готова — можно открыть и скачать.' : 'Мы выпустили версию альбома: откройте и посмотрите. Если что-то хочется изменить, отметьте это прямо на листе.')
                    . ($q ? ' К альбому есть вопросы — без ваших ответов финальную версию мы выпустить не можем.' : ''),
                'rows' => $rows, 'note' => trim(($left !== null ? 'Кругов правок осталось: ' . $left . ' из ' . ($pi['rounds'] ?? $left) . '. ' : '') . ($x['changes'] ?? '')),
                'btn' => $q ? 'Посмотреть и ответить' : 'Открыть альбом', 'tab' => $q ? 'voprosy' : 'proekt', 'legal' => false];
        }
        case 'review': {
            $st = (string)($x['status'] ?? 'В работе'); $rp = trim((string)($x['reply'] ?? ''));
            return ['grp' => 'voprosy', 'subject' => 'ответ на ваши правки', 'text' => 'Правки ' . ($x['number'] ?? '') . ': ' . $st . ($rp !== '' ? ' — ' . mb_substr($rp, 0, 200) : ''),
                'title' => 'Ответ на ваши правки', 'lead' => 'Мы разобрали правки ' . ($x['number'] ?? '') . ' по заказу ' . $num . '.', 'rows' => [['Статус', $st], ['Ответ студии', $rp]],
                'note' => $exp, 'btn' => 'Открыть правки', 'tab' => 'pravki', 'legal' => false];
        }
        case 'questions': {
            $n = (int)($x['count'] ?? 0);
            return ['grp' => 'voprosy', 'subject' => 'вопросы по проекту', 'text' => 'К альбому есть вопросы и решения на согласование — ответьте в кабинете.',
                'title' => 'Нужны ваши ответы', 'lead' => 'По проекту есть ' . $n . ' ' . kab_plural($n, 'вопрос', 'вопроса', 'вопросов') . ' к вам. Ответить можно в пару нажатий — в кабинете у каждого вопроса есть варианты.',
                'rows' => [['Заказ', $num], ['Ответить до', ($x['deadline'] ?? '') ? kab_date_ru((string)$x['deadline']) : '']], 'note' => 'Вопросы, отмеченные «нужно для финала», блокируют выпуск финального альбома.',
                'btn' => 'Ответить на вопросы', 'tab' => 'voprosy', 'legal' => false];
        }
        case 'message': {
            $t = trim((string)($x['text'] ?? ''));
            return ['grp' => 'proekt', 'subject' => 'сообщение по заказу ' . $num, 'text' => 'Сообщение от LINEA: ' . mb_substr($t, 0, 300),
                'title' => 'Сообщение от студии', 'lead' => $t, 'rows' => [['Заказ', $num]], 'note' => 'Ответить можно в кабинете — в ленте заказа.',
                'btn' => 'Открыть переписку', 'tab' => 'proekt', 'legal' => false];
        }
        case 'opt_added':
        case 'opt_paid':
        case 'opt_delivered': {
            $opt = (string)($x['opt'] ?? 'smeta');
            require_once __DIR__ . '/options.php';
            $ttl = opt_title($opt);
            $term = (string)($tc['addons'][$opt]['termLine'] ?? '');
            $sum = isset($x['sum']) ? $rub($x['sum']) : '';
            if ($name === 'opt_added') {
                return ['grp' => 'dengi', 'subject' => 'добавлена опция «' . mb_strtolower($ttl) . '»', 'text' => 'К заказу добавлена опция «' . $ttl . '»' . ($sum !== '' ? ': ' . $sum : '') . '. Оплачивается отдельной строкой.',
                    'title' => $ttl . ' добавлена', 'lead' => 'К заказу ' . $num . ' добавлена опция «' . $ttl . '»: ' . (string)($tc['addons'][$opt]['what'] ?? 'список покупок на весь ремонт с количеством') . '. Оплачивается отдельной строкой, дизайн-проект в эту сумму не входит.',
                    'rows' => [['Заказ', $num], ['Опция', $ttl], ['Сумма опции', $sum !== '' ? $sum : 'подтвердим в течение рабочего дня'], ['Срок', $term]],
                    'note' => (string)($tc['addons'][$opt]['priceNote'] ?? ''), 'btn' => 'Открыть кабинет заказа', 'tab' => 'proekt', 'legal' => true];
            }
            if ($name === 'opt_paid') {
                return ['grp' => 'dengi', 'subject' => 'оплата «' . mb_strtolower($ttl) . '» получена', 'text' => 'Оплата опции «' . $ttl . '» получена' . ($sum !== '' ? ': ' . $sum : '') . ' — мы начали работу.',
                    'title' => 'Оплата получена — ' . mb_strtolower($ttl) . ' в работе', 'lead' => 'Спасибо! Оплата опции «' . $ttl . '» по заказу ' . $num . ' получена. Готовые файлы (PDF и таблица) появятся в кабинете, на почту придёт письмо.',
                    'rows' => [['Заказ', $num], ['Оплачено', $sum], ['Срок', $term]], 'note' => $exp, 'btn' => 'Открыть кабинет заказа', 'tab' => 'proekt', 'legal' => true];
            }
            $names = implode(', ', array_map(fn($f) => (string)$f, (array)($x['files'] ?? [])));
            return ['grp' => 'proekt', 'subject' => mb_strtolower($ttl) . ' готова', 'text' => $ttl . ' готова — файлы в кабинете.',
                'title' => $ttl . ' готова', 'lead' => $ttl . ' по заказу ' . $num . ' готова. Файлы лежат в кабинете, в разделе «Проект»: скачайте PDF и таблицу. '
                    . (string)($tc['addons'][$opt]['priceNote'] ?? 'Цены ориентировочные, на дату расчёта.') . '.',
                'rows' => [['Заказ', $num], ['Файлы', $names]], 'note' => 'Закупку и доставку мы не делаем; работы бригады в смету материалов не входят.',
                'btn' => 'Открыть файлы', 'tab' => 'proekt', 'legal' => true];
        }
        case 'delivered':
            return ['grp' => 'proekt', 'subject' => 'финальный альбом выдан', 'text' => 'Финальный альбом выдан. Теперь можно подобрать бригаду на ремонт — это необязательно.',
                'title' => 'Финальный альбом выдан', 'lead' => 'Проект по заказу ' . $num . ' выдан. Альбом и документы лежат в кабинете. Подобрать бригаду на ремонт по проекту можно там же — это необязательно.',
                'rows' => [['Заказ', $num]], 'btn' => 'Открыть кабинет заказа', 'tab' => 'proekt', 'legal' => true];
        case 'cancelled':
            return ['grp' => 'dengi', 'subject' => 'заказ отменён', 'text' => 'Заказ отменён: ' . ($x['reason'] ?? ''),
                'title' => 'Заказ отменён', 'lead' => 'Заказ ' . $num . ' отменён. Причина: ' . ($x['reason'] ?? '—') . '. Если это неожиданно — ответьте на это письмо или напишите нам.',
                'rows' => [['Заказ', $num]], 'btn' => 'Открыть кабинет', 'tab' => 'proekt', 'legal' => true];
        case 'refund':
            return ['grp' => 'dengi', 'subject' => 'возврат оформлен', 'text' => 'Оформлен возврат ' . ($x['sum'] ?? '') . '. Деньги вернутся тем же способом, каким вы платили.',
                'title' => 'Возврат оформлен', 'lead' => 'По заказу ' . $num . ' оформлен возврат ' . ($x['sum'] ?? '') . '. Деньги вернутся тем же способом, каким вы платили; срок зависит от банка.',
                'rows' => [['Заказ', $num], ['Сумма возврата', (string)($x['sum'] ?? '')]], 'btn' => 'Открыть кабинет', 'tab' => 'proekt', 'legal' => true];
    }
    return ['grp' => 'proekt', 'subject' => 'заказ ' . $num, 'text' => (string)($x['text'] ?? ''), 'title' => 'Заказ ' . $num, 'lead' => (string)($x['text'] ?? ''), 'rows' => [], 'btn' => 'Открыть кабинет', 'tab' => 'proekt', 'legal' => false];
}

/**
 * Событие заказа с учётом вида: заказ «только смета» (kind = smeta, 09.11.2026) получает свои формулировки — в нём нет проекта, альбома, правок и ремонта.
 * Условия и суммы — из kab_pay_info() (она для сметы берёт ставку сметы). Остальные события (сообщение, отмена, возврат, выдача файлов) общие.
 */
function kab_ev(string $name, array $o, array $x = []): array
{
    $ev = kab_ev_proekt($name, $o, $x);
    if (($o['kind'] ?? '') !== 'smeta') { return $ev; }
    $rub = fn($kop) => $kop === null || $kop === '' ? '' : brig_rub((int)$kop);
    $num = (string)$o['number'];
    $pi = kab_pay_info($o);
    $tc = kab_terms_client();
    $solo = (array)($tc['addons']['smeta']['solo'] ?? []);
    $term = (string)($solo['term'] ?? '');
    $exp = kab_expected_line($o);
    $area = $o['area'] ? str_replace('.', ',', (string)$o['area']) . ' м²' : '';
    switch ($name) {
        case 'brief': {
            $sum = (int)$o['amount_kop'] > 0 && linea_amount_ok($o);
            $rows = [['Номер заказа', $num], ['Квартира', $area], ['Сумма', $sum ? $rub($o['amount_kop']) : 'подтвердим в течение рабочего дня']];
            if ($sum && $pi['formula'] !== '') { $rows[] = ['Как посчитано', $pi['formula']]; }
            $rows[] = ['Срок', $term !== '' ? $term : (string)($solo['termLine'] ?? '')];
            return ['grp' => 'proekt', 'subject' => 'заказ сметы получен', 'text' => 'Заказ сметы ' . $num . ' получен. ' . ($sum ? 'Сумма — ' . $rub($o['amount_kop']) . '.' : 'Сумму подтвердим в течение рабочего дня.'),
                'title' => 'Заказ сметы получен — ' . $num, 'lead' => 'Спасибо! Мы получили план и исходные данные для сметы на материалы. '
                    . ($sum ? 'Дальше: оплатите смету в кабинете (картой или СБП) — или мы пришлём счёт на эту почту.' : 'Дальше: мы проверим план, подтвердим сумму и напишем вам.') . ' Расчёт начинается после оплаты.',
                'rows' => $rows, 'note' => trim((string)($solo['accuracy'] ?? '') . ($solo['accuracy'] ?? '' ? '.' : '') . "\n" . 'Сохраните номер заказа.'), 'btn' => 'Открыть кабинет заказа', 'tab' => 'proekt', 'legal' => true];
        }
        case 'amount':
            $ev['subject'] = 'сумма сметы подтверждена: ' . $rub($o['amount_kop']);
            $ev['text'] = 'Сумма сметы подтверждена: ' . $rub($o['amount_kop']) . '. Можно оплачивать.';
            $ev['title'] = 'Сумма сметы подтверждена';
            $ev['lead'] = 'Мы проверили план: сумма сметы на материалы ' . $rub($o['amount_kop']) . '. Оплатите в кабинете картой или СБП — расчёт начнётся сразу после оплаты.';
            $ev['rows'] = [['Заказ', $num], ['Сумма сметы', $rub($o['amount_kop'])], ['Как посчитано', $pi['formula']]];
            $ev['note'] = trim('Условия возврата — на странице «Оплата и возврат».' . ($exp ? "\n" . $exp : ''));
            return $ev;
        case 'invoice':
            $ev['title'] = 'Счёт на оплату сметы';
            $ev['lead'] = 'Выставили счёт на ' . $rub($o['amount_kop']) . ' по заказу ' . $num . ' (смета на материалы). Реквизиты и назначение платежа — в счёте. Как только оплата придёт, мы напишем и начнём расчёт.';
            return $ev;
        case 'paid':
            return ['grp' => 'dengi', 'subject' => 'оплата получена, смета в работе', 'text' => 'Оплата получена — смета в работе.' . ($exp ? ' ' . $exp : ''),
                'title' => 'Оплата получена — смета в работе', 'lead' => 'Спасибо! Оплата по заказу ' . $num . ' получена, мы начали считать смету. Готовые файлы (PDF и таблица) появятся в кабинете, на почту придёт письмо.',
                'rows' => [['Заказ', $num], ['Оплачено', $rub($o['amount_kop'])], ['Срок', $term]],
                'note' => trim($exp . ($exp ? "\n" : '') . 'Если для расчёта чего-то не хватает, мы спросим в кабинете.'), 'btn' => 'Открыть кабинет заказа', 'tab' => 'proekt', 'legal' => true];
        case 'stage':
            if (trim((string)($x['text'] ?? '')) === '') { $ev['lead'] = 'Расчёт сметы идёт по плану.'; }
            return $ev;
        case 'delivered':
            return ['grp' => 'proekt', 'subject' => 'смета выдана', 'text' => 'Смета на материалы выдана — файлы в кабинете.',
                'title' => 'Смета выдана', 'lead' => 'Смета на материалы по заказу ' . $num . ' готова. Файлы лежат в кабинете: PDF для чтения и таблица для расчёта и закупки.',
                'rows' => [['Заказ', $num]], 'note' => (string)($tc['addons']['smeta']['priceNote'] ?? ''), 'btn' => 'Открыть кабинет заказа', 'tab' => 'proekt', 'legal' => true];
    }
    return $ev;
}

/** Готовое письмо по событию: [тема, текст, html]. Можно показать админу до отправки (предпросмотр). */
function kab_ev_render(array $o, array $ev): array
{
    [$text, $html] = kab_mail_build(['title' => $ev['title'], 'lead' => $ev['lead'], 'rows' => $ev['rows'] ?? [], 'note' => $ev['note'] ?? '', 'btn' => $ev['btn'] ?? 'Открыть кабинет',
        'url' => kab_order_url($o, (string)($ev['tab'] ?? '')), 'legal' => !empty($ev['legal'])]);
    return ['LINEA · ' . $o['number'] . ' · ' . $ev['subject'], $text, $html];
}

/** Настройки клиента: письма по группам и сводка. Нет аккаунта или настроек — всё включено, сразу. */
function kab_prefs(int $accountId): array
{
    $def = ['groups' => array_fill_keys(array_keys(KAB_GROUPS), ['mail' => true]), 'digest' => 'now'];
    if ($accountId <= 0) { return $def; }
    $raw = db_val('SELECT prefs FROM accounts WHERE id = ?', [$accountId]);
    $p = $raw ? json_decode((string)$raw, true) : null;
    if (!is_array($p)) { return $def; }
    foreach (KAB_GROUPS as $k => $_) { if (!isset($p['groups'][$k]) || !is_array($p['groups'][$k])) { $p['groups'][$k] = ['mail' => true]; } }
    $p['digest'] = ($p['digest'] ?? '') === 'day' ? 'day' : 'now';
    return $p;
}

/**
 * Событие заказа: уведомление в кабинете (если у заказа есть аккаунт) + письмо клиенту с учётом его настроек.
 * Не бросает исключений: сбой почты не должен ломать действие админа.
 * @return array{notice:int,mail:string} mail: sent | dry | queued | skipped | none | failed
 */
function kab_notify_order(array $o, array $ev, string $ukey = ''): array
{
    $res = ['notice' => 0, 'mail' => 'none'];
    try {
        $acc = (int)($o['account_id'] ?? 0);
        $to = trim((string)$o['email']);
        $canMail = kab_email_ok($to);
        $mode = 'send';
        if (!$canMail) { $mode = 'none'; }
        elseif (empty($ev['legal'])) {
            $p = kab_prefs($acc);
            if (($p['groups'][$ev['grp']]['mail'] ?? true) === false) { $mode = 'skipped'; }
            elseif ($acc > 0 && $p['digest'] === 'day') { $mode = 'queue'; }
        }
        $link = '#/o/' . $o['number'] . ($ev['tab'] ?? '' ? '/' . $ev['tab'] : '');
        $res['notice'] = kab_notice($acc, (int)$o['id'], $ev['grp'], $ev['text'], $link, $ukey, $mode === 'queue' ? 1 : 0);
        if ($mode === 'send') {
            [$subj, $text, $html] = kab_ev_render($o, $ev);
            $res['mail'] = kab_mail_send($to, 'ev_' . ($ev['grp'] ?? 'x'), $subj, $text, $html, (bool)$o['test']);
        } else { $res['mail'] = $mode === 'queue' ? 'queued' : $mode; }
    } catch (Throwable $e) {
        linea_log('error.log', 'kab_notify_order: ' . $e->getMessage());
        $res['mail'] = 'failed';
    }
    return $res;
}

/**
 * Сводка за сутки: клиентам с настройкой «сводкой раз в день» уходит одно письмо со всем накопленным (notices.mail_state = 1).
 * Вызывает cron.php; повторно за день не шлёт (kab_once). @return int сколько сводок отправлено
 */
function kab_digest_send(int $now, bool $force = false): int
{
    if (!$force && (int)date('G', $now) < 9) { return 0; }   // раньше 9 утра сводки не шлём
    $sent = 0;
    foreach (db_all('SELECT DISTINCT n.account_id FROM notices n WHERE n.mail_state = 1') as $r) {
        $aid = (int)$r['account_id'];
        $a = db_one('SELECT * FROM accounts WHERE id = ?', [$aid]);
        $key = 'digest-' . $aid . '-' . date('Ymd', $now);
        if (!$a || !kab_email_ok((string)$a['email']) || !kab_once($key)) { continue; }
        $rows = db_all('SELECT n.*, o.number, o.test FROM notices n LEFT JOIN orders o ON o.id = n.order_id WHERE n.account_id = ? AND n.mail_state = 1 ORDER BY n.id', [$aid]);
        if (!$rows) { continue; }
        $lines = []; $test = true;
        foreach ($rows as $n) { $lines[] = [($n['number'] ? $n['number'] . ' · ' : '') . date('d.m H:i', strtotime((string)$n['at'])), (string)$n['text']]; if (!$n['test']) { $test = false; } }
        $first = $rows[0];
        [$text, $html] = kab_mail_build(['title' => 'Что нового за сутки', 'lead' => 'Собрали события по вашим проектам в одно письмо.', 'rows' => $lines,
            'btn' => 'Открыть кабинет', 'url' => brig_link('kabinet/' . ($first['link'] ?: '#/uvedomleniya'))]);
        $st = kab_mail_send((string)$a['email'], 'digest', 'LINEA · сводка за сутки (' . count($rows) . ')', $text, $html, $test);
        if ($st !== 'failed') { db_exec('UPDATE notices SET mail_state = 2 WHERE account_id = ? AND mail_state = 1', [$aid]); $sent++; }
    }
    return $sent;
}
