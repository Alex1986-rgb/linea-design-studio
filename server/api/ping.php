<?php
/** GET api/ping.php — прозвон выкладки: PHP жив, папка данных доступна на запись, конфиг на месте. Без секретов. */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
$p = linea_private();
linea_json([
    'ok' => true,
    'php' => version_compare(PHP_VERSION, '8.2', '>='),   // только «версия годится» — номер версии наружу не отдаём
    'private' => is_dir($p) && is_writable($p),
    'config' => is_file($p . '/config.php'),
    'mode' => linea_cfg()['mode'],
    'sqlite' => extension_loaded('pdo_sqlite'),
    'zip' => class_exists('ZipArchive'),
    // какие признаки https видит PHP за nginx Beget — чтобы linea_https() доверял только неподделываемому
    'tls' => ['https' => $_SERVER['HTTPS'] ?? null, 'port' => $_SERVER['SERVER_PORT'] ?? null,
              'scheme' => $_SERVER['REQUEST_SCHEME'] ?? null, 'xfp' => $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? null],
]);
