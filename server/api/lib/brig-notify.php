<?php
/**
 * Уведомления «Ремонт по проекту»: письма бригадам и клиентам (mail(), как lib/notify.php) + Telegram-бот администратора (заготовка).
 *
 * 🔴 По умолчанию ВСЁ ВЫКЛЮЧЕНО: config 'brig_mail_enabled' = false, 'tg_enabled' = false — пишется только строка в
 *    linea-private/brig-mail.log (тема и ключ шаблона, без адресов, ссылок и токенов).
 *    Тестовые записи (test=1) и env LINEA_MAIL_DRY не отправляют ничего никогда.
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

/** Шаблоны: ключ → [тема, текст]. Подстановки {name}. Ссылки в письмах — на кабинет/страницу заказа, без данных клиента. */
const BRIG_MAIL = [
    'brig_registered' => ['LINEA · анкета бригады создана', "Здравствуйте, {name}!\n\nАнкета бригады создана. Добавьте не меньше трёх объектов с фото «до/после» и отправьте анкету на проверку: {link}\n\nПосле проверки ИНН и короткого видеозвонка бригада получает доступ к запросам клиентов."],
    'brig_reset' => ['LINEA · восстановление пароля', "Здравствуйте!\n\nЧтобы задать новый пароль кабинета бригады, откройте ссылку (действует 1 час, один раз):\n{link}\n\nЕсли вы не запрашивали восстановление — просто удалите письмо."],
    'brig_submitted_admin' => ['LINEA · бригада на проверке: {name}', "Анкета бригады «{name}» отправлена на проверку.\nМодерация: {link}"],
    'brig_admitted' => ['LINEA · бригада допущена', "Здравствуйте, {name}!\n\nПроверка пройдена — бригада допущена к запросам клиентов. Новые запросы появятся в ленте кабинета: {link}"],
    'brig_status' => ['LINEA · статус бригады: {status}', "Здравствуйте, {name}!\n\nСтатус бригады изменён: {status}.\nПричина: {reason}\n\nКабинет: {link}"],
    'brig_invite' => ['LINEA · новый запрос: {object}', "Здравствуйте, {name}!\n\nНовый запрос на ремонт по проекту LINEA: {object}, {district}.\nПредложение — до {deadline}. Позиции сметы и ведомости — в кабинете: {link}"],
    'brig_chosen' => ['LINEA · клиент выбрал вашу бригаду', "Здравствуйте, {name}!\n\nКлиент выбрал ваше предложение по объекту {object}. Переписка по сделке и шаблон договора подряда — в кабинете: {link}\n\n{contacts} Вознаграждение LINEA ({rate}) начисляется в момент, когда открываются контакты."],
    'brig_not_chosen' => ['LINEA · по запросу выбрана другая бригада', "Здравствуйте, {name}!\n\nПо запросу {object} клиент выбрал другое предложение. Спасибо за участие."],
    'brig_stage_returned' => ['LINEA · этап возвращён с замечаниями', "Здравствуйте, {name}!\n\nКлиент вернул этап «{stage}» по объекту {object} с замечаниями. Подробности — в кабинете: {link}"],
    'brig_stage_accepted' => ['LINEA · этап принят', "Здравствуйте, {name}!\n\nКлиент принял этап «{stage}» по объекту {object}."],
    'brig_invoice' => ['LINEA · счёт на комиссию {number}', "Здравствуйте, {name}!\n\nВыставлен счёт {number} на агентское вознаграждение {amount} по объекту {object}. Реквизиты и статус — в кабинете, раздел «Финансы»: {link}"],
    'brig_sheet' => ['LINEA · лист по запросу: {status}', "Здравствуйте, {name}!\n\nЗапрос листа по объекту {object}: {status}.\nКабинет: {link}"],
    'client_offers' => ['LINEA · предложения бригад по заказу {number}', "Здравствуйте!\n\nПо вашему проекту пришли предложения бригад ({count}). Сравнить и выбрать — на странице заказа: {link}"],
    'client_stage_ready' => ['LINEA · этап готов к приёмке', "Здравствуйте!\n\nБригада отметила этап «{stage}» готовым к приёмке. Чек-лист приёмки и фото — на странице заказа: {link}"],
    'admin_event' => ['LINEA · {subject}', "{text}\n\n{link}"],
];

/** @return 'sent' | 'dry' | 'failed' */
function brig_mail(string $to, string $key, array $vars, bool $test): string
{
    [$subj, $body] = BRIG_MAIL[$key] ?? ['LINEA', '{text}'];
    $rep = [];
    foreach ($vars as $k => $v) { $rep['{' . $k . '}'] = str_replace(["\r", "\n"], ' ', (string)$v); }
    $subj = strtr($subj, $rep); $body = strtr($body, $rep);
    $cfg = linea_cfg();
    $dry = $test || empty($cfg['brig_mail_enabled']) || getenv('LINEA_MAIL_DRY') || !filter_var($to, FILTER_VALIDATE_EMAIL);
    if ($dry) { linea_log('brig-mail.log', 'DRY ' . ($test ? '[test] ' : '') . $key . ' · ' . $subj); return 'dry'; }
    $from = trim((string)$cfg['mail_from']) ?: 'no-reply@' . (string)parse_url(linea_base(), PHP_URL_HOST);   // не из заголовка Host запроса
    $headers = implode("\r\n", ['From: LINEA <' . $from . '>', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit']);
    $ok = @mail($to, '=?UTF-8?B?' . base64_encode($subj) . '?=', $body, $headers, '-f' . $from);
    linea_log('brig-mail.log', ($ok ? 'SENT ' : 'FAILED ') . $key . ' · ' . $subj);
    return $ok ? 'sent' : 'failed';
}

/** Письмо администратору (адрес — notify_to) + Telegram, если включён. */
function brig_admin_notify(string $subject, string $text, string $link, bool $test): void
{
    brig_mail((string)(linea_cfg()['notify_to'] ?? ''), 'admin_event', ['subject' => $subject, 'text' => $text, 'link' => $link], $test);
    brig_tg($subject . "\n" . $text, $test);
}

/**
 * Telegram-бот администратора — ЗАГОТОВКА: config 'tg_enabled' (false), 'tg_token', 'tg_chat'. Только служебные события без ПДн.
 * На Beget исходящие на api.telegram.org могут быть закрыты — тогда событие остаётся в журнале.
 */
function brig_tg(string $text, bool $test): string
{
    $cfg = linea_cfg();
    if ($test || empty($cfg['tg_enabled']) || (string)($cfg['tg_token'] ?? '') === '' || (string)($cfg['tg_chat'] ?? '') === '' || getenv('LINEA_MAIL_DRY') || !function_exists('curl_init')) {
        linea_log('brig-mail.log', 'DRY tg · ' . mb_substr(str_replace("\n", ' ', $text), 0, 80));
        return 'dry';
    }
    $ch = curl_init('https://api.telegram.org/bot' . $cfg['tg_token'] . '/sendMessage');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8,
        CURLOPT_POSTFIELDS => http_build_query(['chat_id' => $cfg['tg_chat'], 'text' => mb_substr($text, 0, 3500), 'disable_web_page_preview' => 1])]);
    $ok = curl_exec($ch) !== false && curl_getinfo($ch, CURLINFO_RESPONSE_CODE) === 200;
    curl_close($ch);
    linea_log('brig-mail.log', ($ok ? 'SENT' : 'FAILED') . ' tg');
    return $ok ? 'sent' : 'failed';
}

/** Ссылка на раздел сайта для писем. */
function brig_link(string $path): string { return linea_base() . '/' . ltrim($path, '/'); }
