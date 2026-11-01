<?php
/**
 * Уведомление Александру о новом заказе, оплате и правках.
 *
 * 🔴 По умолчанию ВЫКЛЮЧЕНО (config: notify_enabled = false) — письмо только пишется в linea-private/mail.log.
 *    Тестовые заказы (test=1) и переменная окружения LINEA_MAIL_DRY никогда не отправляют письма, даже при включённом флаге:
 *    проверки не должны попадать в боевые каналы.
 *    Отправка — mail() (на Beget это sendmail -t -i). Без вложений: архив брифа скачивается из закрытой страницы заказов.
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

/** @return string 'sent' | 'dry' | 'failed' */
function linea_notify(string $subject, string $body, bool $test): string
{
    $cfg = linea_cfg();
    $to = trim((string)$cfg['notify_to']);
    $dry = $test || !$cfg['notify_enabled'] || $to === '' || getenv('LINEA_MAIL_DRY');
    $line = ($dry ? 'DRY ' : 'SEND ') . ($test ? '[test] ' : '') . str_replace(["\r", "\n"], ' ', $subject);
    if ($dry) { linea_log('mail.log', $line); return 'dry'; }

    $from = trim((string)$cfg['mail_from']) ?: 'no-reply@' . (string)parse_url(linea_base(), PHP_URL_HOST);   // не из заголовка Host запроса
    $headers = implode("\r\n", [
        'From: LINEA <' . $from . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
    ]);
    $ok = @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers, '-f' . $from);
    linea_log('mail.log', ($ok ? 'SENT ' : 'FAILED ') . str_replace(["\r", "\n"], ' ', $subject));
    return $ok ? 'sent' : 'failed';
}
