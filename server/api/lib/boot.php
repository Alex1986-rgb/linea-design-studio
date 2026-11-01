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
        'base' => '',                  // адрес сайта без «/» (для ссылок в письмах и return_url); пусто — LINEA_BASE_DEFAULT (Host запроса не используется)
        'trusted_proxies' => ['127.0.0.1', '::1'],   // X-Real-IP читается, только если запрос пришёл от этих адресов (nginx Beget перед Apache)
        'admin_fail_global' => 30,     // неудачных входов в admin за 15 минут со всех адресов вместе — дальше вход закрыт для всех
        'yk_tax_system' => null,       // чек 54-ФЗ: tax_system_code (1 ОСН, 2 УСН доход, 3 УСН доход−расход, 6 ПСН); null — не передавать
        'brig_terms' => [],            // условия «Ремонта по проекту» поверх BRIG_TERMS_DEFAULT (ставка, когда открываются контакты, листы)
        'db' => null,                  // MySQL: ['dsn' => 'mysql:host=localhost;dbname=…;charset=utf8mb4', 'user' => …, 'pass' => …]; null — SQLite
        // ревью кода сделки 01.11.2026:
        'allow_test' => false,         // С-4: ?test=1 на боевом принимается только при этом флаге (на маке — всегда); регистрация бригад test — только на маке
        'admin_ip_allow' => [],        // С-6: адреса владельца — их вход в admin не блокируется ни своим, ни общим счётчиком неудач
        'pay_area_min' => ['kvartira' => 80, 'dom' => 150],   // В-3: онлайн-оплата без подтверждения суммы — только если площадь ≥ порога вида
                                       // (занизить площадь невыгодно крупным объектам); иначе — после «сумма подтверждена» в admin. [] — всегда подтверждать
        'yk_notify_per_hour' => 120,   // В-5: уведомлений ЮKassa с одного адреса в час
        'yk_ip_check' => false,        // В-5: принимать уведомления только с адресов ЮKassa (yk_ips)
        'yk_ips' => ['185.71.76.0/27', '185.71.77.0/27', '77.75.153.0/25', '77.75.156.11/32', '77.75.156.35/32', '77.75.154.128/25', '2a02:5180::/32'],
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

/**
 * Условия «Ремонта по проекту» — ЕДИНСТВЕННОЕ место на сервере (страницы сайта — tools/site-shell.js → BRIG_TERMS, держать
 * одинаковыми). Поверх — config 'brig_terms'. Решение 01.11.2026: платы за отклик/лид нет; удержание сделки — сервис «Сделка через LINEA» и листы
 * по запросу только внутри сделки. Решения 01.11.2026: ставка 10 % («10 % с бригады»), пилот 5 % для первых 5 бригад на первые 3 сделки,
 * листы в сделке бесплатно до 15 на объект, вне сделки — 2 500 ₽, но продажа выключена до ИП. Оплата ремонта через ЮKassa с удержанием — не включена.
 */
const BRIG_TERMS_DEFAULT = [
    'rate' => 0.10,                 // агентское вознаграждение — доля от сметы выбранного предложения (Александр 01.11.2026: «10 % с бригады»; до этого 7 %)
    // пилот: первым N допущенным бригадам первые M сделок — по пониженной ставке (учёт по бригаде: порядок допуска и число сделок
    // с открытыми контактами; ставка сделки сохраняется в br_jobs.commission_rate)
    'pilot' => ['enabled' => true, 'rate' => 0.05, 'brigades' => 5, 'deals' => 3],
    // когда начисленное вознаграждение становится К ОПЛАТЕ (Александр 01.11.2026: «оплата после первого этапа работ или аванса»):
    // 'first_money' — после первых денег бригаде: клиент отметил аванс или принял первый этап (что раньше); 'signed' — сразу при подтверждении
    // договора. Начисление (сумма, ставка) создаётся при подтверждении договора обеими сторонами, когда открываются контакты.
    'commission_due' => 'first_money',
    'signal_no_money_days' => 14,   // «договор подтверждён, а за N дней ни аванса, ни принятого этапа» — сигнал в админке
    'contacts_after' => 'signed',   // когда открываются контакты сторон и фиксируется комиссия: 'signed' — договор подряда отмечен
                                    // подписанным обеими сторонами на сайте; 'chosen' — сразу при выборе (как было до 01.11.2026)
    'sheets_free_limit' => 15,      // листов по запросу на объект бесплатно внутри сделки; null — без лимита
    'sheets_per_day_job' => 10, 'sheets_per_day_brigade' => 30, 'sheets_open_max' => 5,
    'sheets_outside_paid' => false, // листы вне активной сделки — платно (выключено: цену не утвердили)
    'sheet_price_kop' => 250000,    // цена листа вне сделки, копейки (2 500 ₽); продаётся, только когда sheets_outside_paid = true
    'signal_unsigned_days' => 5,    // «выбрана, договор не подписан N дней» — сигнал в админке
    'invoice_days' => 10,           // срок оплаты счёта на вознаграждение
    'safe_deal' => false,           // оплата ремонта через ЮKassa с удержанием до приёмки — не включена (нужны ИП, договор и юрист)
    // ревью кода сделки 01.11.2026 (К-1) + разбор юриста п. 1: вознаграждение К ОПЛАТЕ — по самой ранней из дат: аванс отмечен бригадой
    // (или отметка заказчика, не оспоренная бригадой за advance_confirm_days), дата начала работ по договору, «Начать работу» по этапу 1,
    // первый принятый этап, N дней после подписания договора. Админ может выставить счёт вручную всегда.
    'commission_due_after_sign_days' => 14,   // 0 — правило «N дней после подписания» выключено
    'advance_confirm_days' => 5,    // В-2: отметку заказчика «аванс внесён» бригада подтверждает или оспаривает за N дней; молчание — подтверждение
    'debt_warn_days' => 1,          // лестница долга по счёту на вознаграждение: просрочка ≥ N дней — предупреждение в кабинете бригады
    'debt_feed_close_days' => 14,   // просрочка ≥ N дней — закрыта лента новых заказов и новые предложения (начатые сделки доводятся)
    'addendum_cut_admin_pct' => 20, // В-1: допсоглашение уменьшает цену больше чем на N % — подписать можно только после подтверждения LINEA
    'addendum_max_qty' => 100000, 'addendum_max_price_kop' => 10000000000,   // В-1: границы позиции допсоглашения (кол-во, цена 100 млн ₽)
    'stage_autoaccept' => false,    // юрист 01.11.2026: молчание заказчика-потребителя ≠ приёмка (ст. 720, 753 ГК, ЗоЗПП) — НЕЛЬЗЯ включать для потребителей
    'termination_fee_base' => 'accepted',   // юрист п. 6: при расторжении база вознаграждения — фактически выполненное и принятое
    'bypass_penalty' => ['enabled' => false, 'mult' => 2],   // юрист п. 7: неустойка за обход — только бригаде, выключено до юриста; клиенту штрафов нет
    'files_premoderation' => true,  // К-2: новые фото/PDF портфолио и логотип видны в каталоге только после модерации LINEA
];

/** Условия бригад: значения по умолчанию + config 'brig_terms', с проверкой границ. */
function brig_terms(): array
{
    static $t = null;
    if ($t !== null) { return $t; }
    $t = array_replace(BRIG_TERMS_DEFAULT, is_array(linea_cfg()['brig_terms'] ?? null) ? linea_cfg()['brig_terms'] : []);
    $t['rate'] = max(0.0, min(0.5, (float)$t['rate']));
    $p = is_array($t['pilot'] ?? null) ? $t['pilot'] : [];
    $t['pilot'] = ['enabled' => !empty($p['enabled']), 'rate' => max(0.0, min(0.5, (float)($p['rate'] ?? $t['rate']))),
        'brigades' => max(0, (int)($p['brigades'] ?? 0)), 'deals' => max(0, (int)($p['deals'] ?? 0))];
    if (!$t['pilot']['brigades'] || !$t['pilot']['deals']) { $t['pilot']['enabled'] = false; }
    if (!in_array($t['contacts_after'], ['signed', 'chosen'], true)) { $t['contacts_after'] = 'signed'; }
    if (!in_array($t['commission_due'], ['first_money', 'signed'], true)) { $t['commission_due'] = 'first_money'; }
    $t['sheet_price_kop'] = $t['sheet_price_kop'] !== null && (int)$t['sheet_price_kop'] > 0 ? (int)$t['sheet_price_kop'] : null;
    $t['sheets_outside_paid'] = (bool)$t['sheets_outside_paid'] && $t['sheet_price_kop'] !== null;
    $t['commission_due_after_sign_days'] = max(0, min(90, (int)$t['commission_due_after_sign_days']));
    $t['advance_confirm_days'] = max(1, min(30, (int)$t['advance_confirm_days']));
    $t['debt_warn_days'] = max(0, min(60, (int)$t['debt_warn_days']));
    $t['debt_feed_close_days'] = max($t['debt_warn_days'], min(120, (int)$t['debt_feed_close_days']));
    $t['addendum_cut_admin_pct'] = max(0, min(100, (int)$t['addendum_cut_admin_pct']));
    $t['addendum_max_qty'] = max(1, min(1000000, (int)$t['addendum_max_qty']));
    $t['addendum_max_price_kop'] = max(100, min(100000000000, (int)$t['addendum_max_price_kop']));
    $t['stage_autoaccept'] = false;   // для потребителей нельзя (юрист 01.11.2026) — не включается из config
    if (!in_array($t['termination_fee_base'], ['accepted', 'paid'], true)) { $t['termination_fee_base'] = 'accepted'; }
    $bp = is_array($t['bypass_penalty'] ?? null) ? $t['bypass_penalty'] : [];
    $t['bypass_penalty'] = ['enabled' => !empty($bp['enabled']), 'mult' => max(1, min(5, (int)($bp['mult'] ?? 2)))];
    $t['files_premoderation'] = (bool)$t['files_premoderation'];
    return $t;
}

/** Ставка словами: 0.05 → «5 %», 0.055 → «5,5 %». Без аргумента — основная ставка из brig_terms(). */
function brig_rate_text(?float $rate = null): string
{
    $p = round(($rate ?? brig_terms()['rate']) * 100, 1);
    return str_replace('.', ',', (string)($p == (int)$p ? (int)$p : $p)) . ' %';
}

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
    // MySQL (config 'db'): то же соединение, что у слоя lib/db.php; схема — lib/migrations.php (orders, events и таблицы сервиса бригад)
    if (is_array(linea_cfg()['db'] ?? null) && (string)(linea_cfg()['db']['dsn'] ?? '') !== '') {
        require_once __DIR__ . '/db.php';
        $db = db();
        db_migrate();
        return $db;
    }
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

/** Схема базы актуальна (миграции lib/migrations.php): для страниц, которые читают новые колонки orders напрямую через linea_db(). */
function linea_schema(): void
{
    static $done = false;
    if ($done) { return; }
    $done = true;
    require_once __DIR__ . '/db.php';
    db_migrate();
}

function linea_event(int $orderId, string $who, string $text): void
{
    linea_db()->prepare('INSERT INTO events(order_id, at, who, text) VALUES(?,?,?,?)')->execute([$orderId, linea_now(), $who, $text]);
}

function linea_order_by_token(string $t): ?array
{
    if (!preg_match('/^[0-9a-f]{32}$/', $t)) { return null; }
    linea_schema();
    $q = linea_db()->prepare('SELECT * FROM orders WHERE token = ?');
    $q->execute([$t]);
    $r = $q->fetch();
    return $r ?: null;
}

function linea_order_by_number(string $n): ?array
{
    linea_schema();
    $q = linea_db()->prepare('SELECT * FROM orders WHERE number = ?');
    $q->execute([$n]);
    $r = $q->fetch();
    return $r ?: null;
}

/**
 * Тестовый режим запроса (?test=1 / test в теле): только на маке (php -S 127.0.0.1) или при config allow_test (ревью кода С-4) —
 * иначе аноним на боевом обходил https-требование и запрет повторной регистрации. Регистрация тестовых бригад — только на маке.
 */
function linea_test_req(bool $requested, bool $localOnly = false): bool
{
    if (!$requested) { return false; }
    return linea_local() || (!$localOnly && !empty(linea_cfg()['allow_test']));
}

/**
 * Онлайн-оплата по сумме из заказа разрешена? (ревью кода В-3: площадь в брифе можно занизить.) Да, если сумму подтвердил
 * администратор (amount_confirmed_at — по плану) или площадь не меньше порога вида (config pay_area_min). Иначе — «сумму подтвердим по плану».
 */
function linea_amount_ok(array $o): bool
{
    if (!empty($o['amount_confirmed_at'])) { return true; }
    $min = linea_cfg()['pay_area_min'][$o['kind']] ?? (linea_cfg()['pay_area_min'][str_replace('_viz', '', (string)$o['kind'])] ?? null);
    return $min !== null && $o['area'] !== null && (float)$o['area'] >= (float)$min && empty($o['area_mismatch']);
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

/** Адрес сайта по умолчанию (домен в Punycode, как в tools/site-shell.js → SITE_BASES.domain). */
const LINEA_BASE_DEFAULT = 'https://xn-----6kccjicviedfr1b2cbishm8w.xn--p1ai';

/**
 * Адрес сайта для ссылок (return_url, письма, сброс пароля). Только из config 'base' (или адрес домена по умолчанию):
 * заголовок Host запроса не используется — иначе подставной Host уводит ссылку сброса пароля и оплаты на чужой домен
 * (критик техники 01.11.2026, С-3). Исключение — проверка на маке (php -S 127.0.0.1).
 */
function linea_base(): string
{
    $b = rtrim((string)linea_cfg()['base'], '/');
    if ($b !== '') { return $b; }
    if (linea_local()) { return 'http://' . (string)($_SERVER['HTTP_HOST'] ?? '127.0.0.1'); }
    return LINEA_BASE_DEFAULT;
}

/**
 * Адрес клиента для лимитов частоты. Только REMOTE_ADDR; X-Real-IP — лишь когда запрос пришёл от доверенного прокси
 * (config 'trusted_proxies', по умолчанию локальный nginx). X-Forwarded-For не читается: его подделывает кто угодно (T5, В-4).
 */
function linea_ip(): string
{
    $ra = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    if (!filter_var($ra, FILTER_VALIDATE_IP)) { return '0.0.0.0'; }
    if (in_array($ra, (array)(linea_cfg()['trusted_proxies'] ?? []), true)) {
        $x = trim((string)($_SERVER['HTTP_X_REAL_IP'] ?? ''));
        if ($x !== '' && filter_var($x, FILTER_VALIDATE_IP)) { return $x; }
    }
    return $ra;
}

/** Чистка счётчиков частоты: файлы linea-private/rate/* старше суток (иначе каждый новый адрес оставляет файл навсегда). */
function linea_rate_gc(int $maxAge = 86400): int
{
    $n = 0;
    foreach (glob(linea_private() . '/rate/*') ?: [] as $f) {
        if (is_file($f) && filemtime($f) < time() - $maxAge && @unlink($f)) { $n++; }
    }
    return $n;
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
    if (random_int(1, 200) === 1) { linea_rate_gc(); }
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

/** Вид заказа по брифу: дом → dom, остальное → kvartira (точнее — Александр в закрытой странице); *_viz — только у заказов до 31.10.2026. */
function linea_kind_from_brief(array $b): string
{
    $k = (string)($b['meta']['service'] ?? '');
    if (isset(LINEA_KINDS[$k])) { return $k; }
    $base = (string)($b['object']['type'] ?? '') === 'дом' ? 'dom' : 'kvartira';
    // пакет один с 31.10.2026 (визуализации входят в цену): старое meta.package из черновика клиента вид не меняет
    return $base;
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
        'area' => $o['area'] !== null ? (float)$o['area'] : null,
        'invoiced' => (bool)$o['invoice_at'],
        'paidAt' => $o['paid_at'],
        'deliveredUrl' => $o['status'] === 'delivered' ? (string)$o['delivered_url'] : '',
        'mode' => $cfg['mode'],
        'canPay' => $cfg['mode'] === 'yookassa' && $o['status'] === 'awaiting_payment' && $amount !== null && $amount > 0 && linea_amount_ok($o),
        'amountConfirmed' => linea_amount_ok($o),   // false — «сумму подтвердим по плану в течение рабочего дня» (В-3)
        'test' => (bool)$o['test'],
    ];
}

/** Журнал без персональных данных. */
function linea_log(string $file, string $line): void
{
    @file_put_contents(linea_private() . '/' . $file, date('c') . ' ' . $line . "\n", FILE_APPEND | LOCK_EX);
}
