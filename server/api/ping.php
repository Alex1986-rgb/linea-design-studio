<?php
/**
 * GET api/ping.php — прозвон выкладки и мониторинга: PHP жив, папка данных доступна на запись, конфиг на месте. Без секретов.
 * Публично — только «да/нет» (ревизия 02.11.2026: режим оплаты и признаки TLS наружу не отдаём).
 * С токеном мониторинга (config 'monitor_token', не короче 24 знаков; заголовок X-Monitor-Token или ?token=) — подробности для выкладки
 * и внешнего мониторинга: режим оплаты, признаки https, какой REMOTE_ADDR и X-Real-IP видит PHP (проверка trusted_proxies), какой адрес
 * клиента получился у linea_ip(), версия схемы базы, последний прогон cron. Неверный токен — 403 и лимит частоты.
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
header('Cache-Control: no-store');
$p = linea_private();
$out = [
    'ok' => true,
    'php' => version_compare(PHP_VERSION, '8.2', '>='),   // только «версия годится» — номер версии наружу не отдаём
    'private' => is_dir($p) && is_writable($p),
    'config' => is_file($p . '/config.php'),
    'sqlite' => extension_loaded('pdo_sqlite'),
    'zip' => class_exists('ZipArchive'),
];
$tok = (string)($_SERVER['HTTP_X_MONITOR_TOKEN'] ?? $_GET['token'] ?? '');
if ($tok === '') { linea_json($out); }
$want = (string)(linea_cfg()['monitor_token'] ?? '');
if (!linea_rate('ping-token', 30, false)) { linea_fail('Слишком много запросов', 429); }
if (strlen($want) < 24 || !hash_equals($want, $tok)) { linea_rate_add('ping-token'); usleep(300000); linea_fail('Неверный токен мониторинга', 403); }
$ra = (string)($_SERVER['REMOTE_ADDR'] ?? '');
$trusted = (array)(linea_cfg()['trusted_proxies'] ?? []);
$ver = null; $driver = null;
try { linea_schema(); $driver = db_driver(); $ver = (int)db_val("SELECT version FROM schema_version WHERE name = 'linea'"); } catch (Throwable $e) { $out['db_error'] = true; }
$last = is_file($p . '/cron.last') ? (string)file_get_contents($p . '/cron.last') : '';
linea_json($out + [
    'mode' => linea_cfg()['mode'],
    'receipts' => !empty(linea_cfg()['yk_receipt']),
    'https' => linea_https(),
    'tls' => ['https' => $_SERVER['HTTPS'] ?? null, 'port' => $_SERVER['SERVER_PORT'] ?? null, 'scheme' => $_SERVER['REQUEST_SCHEME'] ?? null, 'xfp' => $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? null],
    // проверка trusted_proxies: если REMOTE_ADDR — адрес nginx Beget, а он не в списке, лимиты частоты считаются на один адрес для всех
    'proxy' => ['remote_addr' => $ra, 'x_real_ip' => $_SERVER['HTTP_X_REAL_IP'] ?? null, 'x_forwarded_for' => $_SERVER['HTTP_X_FORWARDED_FOR'] ?? null,
        'trusted_proxies' => array_values($trusted), 'remote_is_trusted' => in_array($ra, $trusted, true), 'linea_ip' => linea_ip()],
    'db' => ['driver' => $driver, 'schema' => $ver],
    'cron_last' => $last !== '' ? substr($last, 0, 19) : null,
]);
