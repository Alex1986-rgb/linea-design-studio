<?php
/**
 * Локальная проверка сайта вместе с api (как на Beget после site-rebase.js), только для мака:
 *   LINEA_PRIVATE=<папка данных> php -S 127.0.0.1:8143 -t site tools/dev-router.php
 * /api/* → server/api/* (белый список, как .htaccess), /brigady/… → api/katalog.php (как rewrite), в страницы с отправкой
 * (order.html, brigada/) вставляется <meta name="linea-api">. Боевых данных здесь нет: LINEA_PRIVATE — папка проверки.
 */
declare(strict_types=1);
$root = dirname(__DIR__);
$path = rawurldecode(parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/');
$run = function (string $rel) use ($root) {
    $f = $root . '/server/api/' . $rel;
    $_SERVER['SCRIPT_NAME'] = '/api/' . $rel;
    $_SERVER['PHP_SELF'] = '/api/' . $rel;
    chdir(dirname($f));
    require $f;
    exit;
};
if (preg_match('#^/brigady/?$#', $path)) { $run('katalog.php'); }
if ($path === '/brigady/sitemap.xml') { $_GET['sitemap'] = '1'; $run('katalog.php'); }
if (preg_match('#^/brigady/([a-z0-9-]+)/?$#', $path, $m)) { $_GET['slug'] = $m[1]; $run('katalog.php'); }
if (preg_match('#^/api/((?:brigade/)?[a-z-]+\.php)$#', $path, $m)) {
    $ok = preg_match('#^(brief|brief-add|order|pay|pay-notify|ping|prices|review|admin|survey|admin-brigady|remont|remont-dogovor|katalog|vhod|kabinet|panel|brigada)\.php$#', $m[1])
        || preg_match('#^brigade/(auth|profile|file|feed|offer|jobs|finance|sheets|sheet-request)\.php$#', $m[1]);
    if (!$ok || !is_file($root . '/server/api/' . $m[1])) { http_response_code(403); exit('403'); }
    $run($m[1]);
}
if (str_starts_with($path, '/api/')) { http_response_code(403); exit('403'); }
$file = $root . '/site' . $path . (str_ends_with($path, '/') ? 'index.html' : '');
foreach (['order.html' => 'api/', 'brigada/index.html' => '../api/', 'kabinet/index.html' => '../api/', 'vhod/index.html' => '../api/'] as $page => $api) {
    if ($file === $root . '/site/' . $page && is_file($file)) {
        header('Content-Type: text/html; charset=utf-8');
        echo str_replace('</head>', '<meta name="linea-api" content="' . $api . '">' . "\n</head>", (string)file_get_contents($file));
        exit;
    }
}
return false;
