<?php
/**
 * LINEA · ядро приёма брифа и заказов (Beget, PHP 8.2+).
 *
 * 🔴 Правила этого каталога:
 *   · Данные и настоящий конфиг — ТОЛЬКО в папке linea-private рядом с public_html (не внутри!).
 *     nginx на Beget отдаёт статику из public_html напрямую, поэтому защита данных правилами .htaccess
 *     не работает — их просто нет в веб-корне. Путь задаётся здесь, в одном месте: linea_private().
 *   · В репозитории — только server/config.example.php без ключей и паролей.
 *   · Сумма к оплате берётся из заказа/конфига, никогда из запроса браузера.
 *   · Тестовые заказы (test=1) не рассылают писем и удаляются после проверки.
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }
date_default_timezone_set('Europe/Moscow');
ini_set('display_errors', '0');   // предупреждения PHP не должны ломать JSON-ответ; ошибки — в журнал сервера

/** Папка данных: <папка сайта>/linea-private (public_html/api/lib → три уровня вверх). Для проверок — env LINEA_PRIVATE. */
function linea_private(): string
{
    static $p = null;
    if ($p === null) {
        $env = getenv('LINEA_PRIVATE');
        $p = rtrim($env !== false && $env !== '' ? $env : dirname(__DIR__, 3) . '/linea-private', '/');
    }
    return $p;
}

/** Конфиг: linea-private/config.php (образец — server/config.example.php). Без него — безопасные значения по умолчанию. */
function linea_cfg(): array
{
    static $cfg = null;
    if ($cfg !== null) { return $cfg; }
    $def = [
        'mode' => 'manual',            // manual — счёт вручную; yookassa — кнопка «Оплатить» на странице заказа
        'yk_shop_id' => '', 'yk_secret' => '', 'yk_receipt' => false, 'yk_vat_code' => 1,
        'prices' => [],                // вид заказа → null («уточняется») | копейки | ['per_m2' => коп, 'min' => коп]
        'notify_enabled' => false, 'notify_to' => '', 'mail_from' => '',
        'admin_hash' => '',
        'max_upload_mb' => 100, 'briefs_per_hour' => 5, 'reviews_per_hour' => 20, 'surveys_per_hour' => 20,
        'base' => '',                  // адрес сайта без «/» (для ссылок в письмах и return_url); пусто — из запроса
    ];
    $f = linea_private() . '/config.php';
    $user = is_file($f) ? (require $f) : [];
    $cfg = array_replace($def, is_array($user) ? $user : []);
    // Без ключей магазина ЮKassa не включается, как бы ни был выставлен режим
    if ($cfg['mode'] === 'yookassa' && ((string)$cfg['yk_shop_id'] === '' || (string)$cfg['yk_secret'] === '')) { $cfg['mode'] = 'manual'; }
    return $cfg;
}

/** Виды заказа: ключ → название для людей. Цены — в config.php под теми же ключами. */
const LINEA_KINDS = [
    'kvartira'   => 'Дизайн-проект квартиры',
    'dom'        => 'Дизайн-проект дома',
    'kvartira_viz' => 'Дизайн-проект квартиры + визуализации',
    'dom_viz'      => 'Дизайн-проект дома + визуализации',
    'rd'         => 'Рабочая документация',
    'planirovka' => 'Планировочное решение',
    'vizual'     => 'Визуализации',
];

const LINEA_STATUS = [
    'new'              => 'Принят',
    'awaiting_payment' => 'Ждёт оплаты',
    'paid'             => 'Оплачен — проект в работе',
    'delivered'        => 'Альбом выдан',
    'cancelled'        => 'Отменён',
];

function linea_now(): string { return date('Y-m-d H:i:s'); }

function linea_mkdir(string $dir): void
{
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) { throw new RuntimeException('не создаётся папка данных'); }
}

/** База заказов: linea-private/linea.sqlite (WAL). Таблицы создаются при первом обращении. */
function linea_db(): PDO
{
    static $db = null;
    if ($db) { return $db; }
    linea_mkdir(linea_private());
    $db = new PDO('sqlite:' . linea_private() . '/linea.sqlite', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $db->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    $db->exec("CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number TEXT NOT NULL UNIQUE,
        token TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'new',
        kind TEXT NOT NULL DEFAULT 'kvartira',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        ip TEXT, consent_at TEXT, consent_text TEXT,
        name TEXT, phone TEXT, email TEXT, contact TEXT,
        object_type TEXT, area REAL,
        files_bytes INTEGER DEFAULT 0, files_count INTEGER DEFAULT 0,
        amount_kop INTEGER,
        invoice_at TEXT,
        payment_id TEXT, payment_url TEXT, payment_created_at TEXT, payment_tries INTEGER DEFAULT 0,
        paid_at TEXT, paid_by TEXT,
        delivered_at TEXT, delivered_url TEXT,
        test INTEGER NOT NULL DEFAULT 0
    )");
    $db->exec("CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        at TEXT NOT NULL, who TEXT NOT NULL, text TEXT NOT NULL
    )");
    return $db;
}

function linea_event(int $orderId, string $who, string $text): void
{
    linea_db()->prepare('INSERT INTO events(order_id, at, who, text) VALUES(?,?,?,?)')->execute([$orderId, linea_now(), $who, $text]);
}

function linea_order_by_token(string $t): ?array
{
    if (!preg_match('/^[0-9a-f]{32}$/', $t)) { return null; }
    $q = linea_db()->prepare('SELECT * FROM orders WHERE token = ?');
    $q->execute([$t]);
    $r = $q->fetch();
    return $r ?: null;
}

function linea_order_by_number(string $n): ?array
{
    $q = linea_db()->prepare('SELECT * FROM orders WHERE number = ?');
    $q->execute([$n]);
    $r = $q->fetch();
    return $r ?: null;
}

/** Сумма по прайсу конфига в копейках; null — «уточняется» (цену назовём по брифу). */
function linea_price(string $kind, ?float $area): ?int
{
    $p = linea_cfg()['prices'][$kind] ?? null;
    if (is_int($p) && $p > 0) { return $p; }
    if (is_array($p) && (int)($p['per_m2'] ?? 0) > 0 && $area && $area > 0) {
        return max((int)($p['min'] ?? 0), (int)round($area * (int)$p['per_m2']));
    }
    return null;
}

/** Соединение защищено? Beget: nginx перед Apache — признак в HTTPS или X-Forwarded-Proto. */
function linea_https(): bool
{
    return ($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

/** Проверка на маке: php -S 127.0.0.1:<порт>. Нужны оба признака — на Beget Apache тоже видит 127.0.0.1 (запрос от nginx). */
function linea_local(): bool
{
    $host = (string)($_SERVER['HTTP_HOST'] ?? '');
    return in_array((string)($_SERVER['REMOTE_ADDR'] ?? ''), ['127.0.0.1', '::1'], true)
        && preg_match('/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/', $host) === 1
        && empty($_SERVER['HTTP_X_FORWARDED_FOR']) && empty($_SERVER['HTTP_X_REAL_IP']);
}

/**
 * Персональные данные (бриф, правки с телефоном, оплата) — только по https (второй круг критиков 27.10.2026: технический
 * адрес Beget без SSL). Исключения: наши проверки (test=1, заказ помечается тестовым, писем нет) и запуск на маке.
 * Боевой приём включается сам, когда сайт откроется по https (домен + Let's Encrypt в панели Beget).
 */
function linea_require_https(bool $test = false): void
{
    if ($test || linea_https() || linea_local()) { return; }
    linea_fail('Приём через сайт работает только по защищённому адресу (https). Пришлите архив брифа или правки в WhatsApp: +7 925 733-86-40 или на optteem@mail.ru', 403);
}

/** Адрес сайта для ссылок (return_url, письма). */
function linea_base(): string
{
    $b = rtrim((string)linea_cfg()['base'], '/');
    if ($b !== '') { return $b; }
    $https = ($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    return ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
}

function linea_ip(): string
{
    // На Beget nginx стоит перед Apache: настоящий адрес — в X-Real-IP / X-Forwarded-For
    foreach (['HTTP_X_REAL_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $k) {
        $v = trim(explode(',', (string)($_SERVER[$k] ?? ''))[0]);
        if ($v !== '' && filter_var($v, FILTER_VALIDATE_IP)) { return $v; }
    }
    return '0.0.0.0';
}

/**
 * Лимит частоты: не больше $max событий $bucket за час с одного адреса (файловый счётчик). true — можно.
 * $add = false — только проверить (событие засчитывается потом linea_rate_add, например после успешного приёма,
 * чтобы клиент с оборвавшейся загрузкой не упёрся в лимит своими же повторами).
 */
function linea_rate(string $bucket, int $max, bool $add = true): bool
{
    $dir = linea_private() . '/rate';
    linea_mkdir($dir);
    $f = $dir . '/' . $bucket . '-' . substr(hash('sha256', linea_ip() . '|linea'), 0, 24);
    $now = time();
    $fh = fopen($f, 'c+');
    if (!$fh) { return true; }
    flock($fh, LOCK_EX);
    $list = array_filter(array_map('intval', explode("\n", (string)stream_get_contents($fh))), fn($t) => $t > $now - 3600);
    $ok = count($list) < $max;
    if ($ok && $add) { $list[] = $now; }
    ftruncate($fh, 0); rewind($fh); fwrite($fh, implode("\n", $list));
    flock($fh, LOCK_UN); fclose($fh);
    return $ok;
}

function linea_rate_add(string $bucket): void { linea_rate($bucket, PHP_INT_MAX, true); }

/** Ответ JSON и выход. */
function linea_json(array $data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function linea_fail(string $why, int $code = 400): never { linea_json(['ok' => false, 'error' => $why], $code); }

/** Строка из пользовательских данных: обрезать, убрать управляющие символы. */
function linea_str($v, int $max = 200): string
{
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', trim((string)$v)) ?? '';
    return mb_substr($s, 0, $max, 'UTF-8');
}

/** Вид заказа по брифу: дом → dom, остальное → kvartira; пакет vizual → суффикс _viz (точнее — Александр в закрытой странице). */
function linea_kind_from_brief(array $b): string
{
    $k = (string)($b['meta']['service'] ?? '');
    if (isset(LINEA_KINDS[$k])) { return $k; }
    $base = (string)($b['object']['type'] ?? '') === 'дом' ? 'dom' : 'kvartira';
    // пакет из брифа: «Проект + визуализации» → суффикс _viz (цена по своей ставке)
    return (string)($b['meta']['package'] ?? '') === 'vizual' ? $base . '_viz' : $base;
}

/** Публичное состояние заказа — без телефона, почты, адреса и IP. */
function linea_public_order(array $o): array
{
    $cfg = linea_cfg();
    $amount = $o['amount_kop'] !== null ? (int)$o['amount_kop'] : null;
    return [
        'number' => $o['number'],
        'status' => $o['status'],
        'statusText' => LINEA_STATUS[$o['status']] ?? $o['status'],
        'kind' => $o['kind'],
        'kindTitle' => LINEA_KINDS[$o['kind']] ?? $o['kind'],
        'name' => (string)$o['name'],
        'created' => $o['created_at'],
        'amount' => $amount !== null ? $amount / 100 : null,
        'invoiced' => (bool)$o['invoice_at'],
        'paidAt' => $o['paid_at'],
        'deliveredUrl' => $o['status'] === 'delivered' ? (string)$o['delivered_url'] : '',
        'mode' => $cfg['mode'],
        'canPay' => $cfg['mode'] === 'yookassa' && $o['status'] === 'awaiting_payment' && $amount !== null && $amount > 0,
        'test' => (bool)$o['test'],
    ];
}

/** Журнал без персональных данных. */
function linea_log(string $file, string $line): void
{
    @file_put_contents(linea_private() . '/' . $file, date('c') . ' ' . $line . "\n", FILE_APPEND | LOCK_EX);
}
