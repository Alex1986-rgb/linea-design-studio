<?php
/**
 * LINEA · ядро кабинетов (спецификация docs/brigady/spec-kabinety-adminka.md, блок 0 и I): единый вход кодом на почту для всех ролей,
 * гостевая сессия по старой ссылке заказа, свежесть кода для значимых действий, устройства, «Сейчас от вас нужно», выпуски альбома и
 * вопросы К-N, подписи кабинета, согласия и заявки по ПДн (152-ФЗ), уведомления в кабинете, рабочие дни, переходы сделки, проводки.
 *
 * 🔴 Правила:
 *   · Код входа в базе — только HMAC (auth_codes.code_hash), 6 цифр, 10 минут, 5 попыток (атомарно), 5 кодов в час на адрес, 20 — с IP.
 *     Ответ на запрос кода одинаковый — есть такая почта или нет.
 *   · Сессия общая с кабинетом бригады (кука linea_acc, acc_session()); роль в сессии — активная, права проверяются по ней.
 *   · Гость по ссылке order.html?t= видит один заказ 12 часов; значимые действия — только после кода (kab_require_fresh()).
 *   · Клиент видит только свои заказы (orders.account_id), гость — только заказ из ссылки.
 *   · Всё — через lib/db.php; схема — migrations.php (v4).
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

require_once __DIR__ . '/brig.php';

const KAB_GUEST_HOURS = 12;
const KAB_REMEMBER_DAYS = 30;
const KAB_LEGAL = [   // редакции согласий кабинета клиента (тексты — страницы soglasie/ и remont/usloviya/)
    'pd' => ['title' => 'Обработка персональных данных', 'href' => 'soglasie/'],
    'portfolio' => ['title' => 'Показ проекта в портфолио студии (без имени и адреса)', 'href' => 'soglasie/'],
    'project_to_brigades' => ['title' => 'Передача обезличенного проекта бригадам для расчёта', 'href' => 'remont/usloviya/'],
    'transfer_brigade' => ['title' => 'Передача моих контактов и адреса выбранной бригаде', 'href' => 'remont/usloviya/'],
    'public_review' => ['title' => 'Публикация моего отзыва и имени в карточке бригады', 'href' => 'remont/usloviya/'],
];
const KAB_PD_KINDS = ['delete' => 'Удалить мои данные', 'export' => 'Выгрузить мои данные', 'revoke' => 'Отозвать согласие', 'fix' => 'Исправить данные'];
const KAB_GROUPS = ['proekt' => 'Проект', 'voprosy' => 'Вопросы и правки', 'remont' => 'Ремонт', 'dengi' => 'Деньги'];

/** Время «сейчас» для таймеров (в проверках можно сдвинуть: env LINEA_NOW=«ГГГГ-ММ-ДД ЧЧ:ММ:СС», только CLI и локальный сервер). */
function kab_time(): int
{
    $n = getenv('LINEA_NOW');
    if ($n !== false && $n !== '' && (PHP_SAPI === 'cli' || linea_local())) { $t = strtotime($n); if ($t) { return $t; } }
    return time();
}

function kab_secret(): string { return brig_secret(); }

function kab_email_ok(string $e): bool { return (bool)filter_var($e, FILTER_VALIDATE_EMAIL) && mb_strlen($e) <= 150; }

// ───────────────────────── рабочие дни (производственный календарь: выходные + таблица holidays)

function kab_is_workday(int $ts): bool
{
    static $h = null;
    if ($h === null) { $h = []; foreach (brig_all('SELECT d FROM holidays') as $r) { $h[$r['d']] = true; } }
    $w = (int)date('N', $ts);
    return $w < 6 && !isset($h[date('Y-m-d', $ts)]);
}

/** Сколько полных рабочих дней прошло между датами (день начала не считается). */
function kab_wd_between(string $from, int $to): int
{
    $d = strtotime(substr($from, 0, 10) . ' 12:00:00');
    $end = strtotime(date('Y-m-d', $to) . ' 12:00:00');
    $n = 0;
    for ($i = 0; $i < 400 && ($d += 86400) <= $end; $i++) { if (kab_is_workday($d)) { $n++; } }
    return $n;
}

/** Дата через N рабочих дней (конец дня МСК). */
function kab_wd_add(string $from, int $days): string
{
    $d = strtotime(substr($from, 0, 10) . ' 12:00:00');
    for ($i = 0; $days > 0 && $i < 400; $i++) { $d += 86400; if (kab_is_workday($d)) { $days--; } }
    return date('Y-m-d', $d) . ' 23:59:59';
}

// ───────────────────────── аккаунты по почте, роли

/** Все роли этой почты: client (аккаунт или заказы), brigade (аккаунт бригады), admin (config admin_emails). */
function kab_roles_for(string $email): array
{
    $e = mb_strtolower(trim($email));
    $roles = [];
    $c = acc_by_email('client', $e);
    if ($c && $c['status'] === 'active') { $roles['client'] = (int)$c['id']; }
    elseif (!$c && db_val('SELECT 1 FROM orders WHERE LOWER(email) = ? LIMIT 1', [$e])) { $roles['client'] = 0; }   // аккаунт создастся при входе
    $b = acc_by_email('brigade', $e);
    if ($b && $b['status'] === 'active' && !$b['demo']) { $roles['brigade'] = (int)$b['id']; }
    $adm = array_map('mb_strtolower', (array)(linea_cfg()['admin_emails'] ?? []));
    if (in_array($e, $adm, true)) { $roles['admin'] = 0; }
    return $roles;
}

/** Аккаунт клиента по почте: найти или создать (без пароля — вход кодом). Заказы с этой почтой привязываются. */
function kab_client_account(string $email, bool $test = false, string $name = '', string $phone = '', bool $bind = true): int
{
    $e = mb_strtolower(trim($email));
    $a = acc_by_email('client', $e);
    if (!$a) {
        try {
            $id = db_insert('accounts', ['role' => 'client', 'email' => $e, 'pass_hash' => '', 'status' => 'active', 'fail_n' => 0, 'lock_until' => 0,
                'created_at' => linea_now(), 'test' => $test ? 1 : 0, 'name' => linea_str($name, 120) ?: null, 'phone' => linea_str($phone, 40) ?: null]);
        } catch (PDOException $ex) { $id = (int)(acc_by_email('client', $e)['id'] ?? 0); }   // параллельный запрос успел создать
    } else { $id = (int)$a['id']; }
    if ($id && $bind) {
        db_exec('UPDATE orders SET account_id = ? WHERE account_id IS NULL AND LOWER(email) = ?', [$id, $e]);
        // согласия из брифа (до подтверждения почты записаны без аккаунта) — к аккаунту
        db_exec('UPDATE consents SET account_id = ? WHERE account_id = 0 AND order_id IN (SELECT id FROM orders WHERE account_id = ?)', [$id, $id]);
    }
    return $id;
}

/** Журнал «уже сделано» для таймеров: true — ключ записан сейчас (делаем), false — уже был (не повторяем). Не зависит от аккаунта. */
function kab_once(string $key): bool
{
    try { db_insert('sent_marks', ['k' => mb_substr($key, 0, 180), 'at' => linea_now()]); return true; } catch (PDOException $e) { return false; }
}

// ───────────────────────── коды входа

function kab_code_hmac(string $email, string $code): string { return hash_hmac('sha256', mb_strtolower($email) . '|' . $code, kab_secret()); }

/**
 * Отправить код на почту (если у почты есть роль или это почта гостевого заказа). Ответ вызывающему — всегда одинаковый.
 * @return devCode (только локальная проверка: php -S + LINEA_MAIL_DRY) или ''
 */
function kab_code_send(string $email, bool $allowUnknown = false): string
{
    $e = mb_strtolower(trim($email));
    if (!kab_email_ok($e)) { linea_fail('Проверьте адрес почты'); }
    if (!linea_rate('authcode', (int)(linea_cfg()['auth_codes_per_hour_ip'] ?? 20))) { linea_fail('Слишком много запросов кода — подождите немного', 429); }
    // С-1: лимит — по паре «адрес + IP» (чужие запросы с других IP не лишают владельца входа) и мягкий общий на адрес;
    // действующий код младше минуты не заменяется новым (иначе каждый чужой запрос «гасит» код, который уже пришёл владельцу)
    $hour = date('Y-m-d H:i:s', time() - 3600);
    if ((int)db_val('SELECT COUNT(*) FROM auth_codes WHERE email = ? AND ip = ? AND created_at > ?', [$e, linea_ip(), $hour]) >= 5
        || (int)db_val('SELECT COUNT(*) FROM auth_codes WHERE email = ? AND created_at > ?', [$e, $hour]) >= 15) {
        return '';   // тот же ответ, чтобы не раскрывать, есть ли почта
    }
    if (db_val('SELECT 1 FROM auth_codes WHERE email = ? AND used_at IS NULL AND tries < 5 AND created_at > ? AND expires_at > ?', [$e, date('Y-m-d H:i:s', time() - 60), time()])) { return ''; }
    if (!$allowUnknown && !kab_roles_for($e)) { usleep(200000); return ''; }
    $code = (string)random_int(100000, 999999);
    db_exec('UPDATE auth_codes SET used_at = ? WHERE email = ? AND used_at IS NULL', [linea_now(), $e]);   // прежние коды больше не действуют
    db_insert('auth_codes', ['email' => $e, 'purpose' => 'login', 'code_hash' => kab_code_hmac($e, $code), 'expires_at' => time() + 600, 'tries' => 0,
        'created_at' => linea_now(), 'ip' => linea_ip()]);
    brig_mail($e, 'login_code', ['code' => $code], false);
    linea_log('auth.log', 'code ' . substr(hash('sha256', $e), 0, 12));
    return linea_local() && getenv('LINEA_MAIL_DRY') ? $code : '';
}

/** Проверка кода: попытка засчитывается атомарно до сверки, код одноразовый. @return true или текст ошибки. */
function kab_code_check(string $email, string $code)
{
    $e = mb_strtolower(trim($email));
    $bad = 'Код не подошёл или устарел — запросите новый';
    if (!preg_match('/^\d{6}$/', $code)) { return $bad; }
    $r = db_one('SELECT * FROM auth_codes WHERE email = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1', [$e]);
    if (!$r || (int)$r['expires_at'] < time()) { usleep(200000); return $bad; }
    if (db_exec('UPDATE auth_codes SET tries = tries + 1 WHERE id = ? AND tries < 5 AND used_at IS NULL', [(int)$r['id']]) !== 1) { return 'Попытки закончились — запросите новый код'; }
    if (!hash_equals((string)$r['code_hash'], kab_code_hmac($e, $code))) { usleep(300000); return $bad; }
    if (db_exec('UPDATE auth_codes SET used_at = ? WHERE id = ? AND used_at IS NULL', [linea_now(), (int)$r['id']]) !== 1) { return $bad; }
    return true;
}

// ───────────────────────── сессия кабинета

/** Начать сессию после кода: роли почты, активная роль, свежесть кода, устройство. */
function kab_login(string $email, array $roles, bool $remember): void
{
    acc_session();
    $guest = $_SESSION['guest_order'] ?? null;
    session_regenerate_id(true);
    $dev = bin2hex(random_bytes(16));
    $_SESSION = ['csrf' => bin2hex(random_bytes(16)), 'email' => mb_strtolower($email), 'roles' => $roles, 'code_at' => time(), 'dev' => $dev];
    if ($guest) { $_SESSION['guest_order'] = $guest; $_SESSION['guest_at'] = time(); }
    if ($remember) {
        $p = session_get_cookie_params();
        setcookie(session_name(), session_id(), ['expires' => time() + KAB_REMEMBER_DAYS * 86400, 'path' => $p['path'], 'httponly' => true, 'samesite' => 'Strict', 'secure' => $p['secure']]);
    }
    $_SESSION['remember'] = $remember;
}

/** Сделать роль активной (клиент/бригада — свой аккаунт; админ — переход в admin.php по паролю). */
function kab_set_role(string $role): ?string
{
    acc_session();
    $roles = $_SESSION['roles'] ?? [];
    if (!array_key_exists($role, $roles)) { return 'Эта роль недоступна для вашей почты'; }
    if ($role === 'admin') { return null; }
    $id = (int)$roles[$role];
    if ($role === 'client' && !$id) { $id = kab_client_account((string)$_SESSION['email']); $_SESSION['roles']['client'] = $id; }
    $_SESSION['acc'] = $id; $_SESSION['role'] = $role;
    if ($id) {
        // почта подтверждена кодом. С-3: бригадный аккаунт, заведённый с паролем на чужую почту, — пароль и прежние сессии гасим
        $acc = db_one('SELECT * FROM accounts WHERE id = ?', [$id]);
        if ($acc && !$acc['verified_at']) {
            $reset = $role === 'brigade' && (string)$acc['pass_hash'] !== '';
            db_update('accounts', ['verified_at' => linea_now()] + ($reset ? ['pass_hash' => '', 'sess_epoch' => (int)$acc['sess_epoch'] + 1] : []), 'id = ?', [$id]);
            if ($reset) {
                db_exec('UPDATE acc_devices SET ended_at = ? WHERE account_id = ? AND ended_at IS NULL', [linea_now(), $id]);
                $_SESSION['pass_reset'] = true;
                brig_audit('account#' . $id, 'verify-reset', 'account#' . $id, 'первый вход кодом: пароль и прежние сессии сброшены');
            }
        }
        $_SESSION['epoch'] = (int)db_val('SELECT sess_epoch FROM accounts WHERE id = ?', [$id]);
        db_update('accounts', ['last_login_at' => linea_now()], 'id = ?', [$id]);
        if (!db_one('SELECT 1 FROM acc_devices WHERE dev = ?', [(string)$_SESSION['dev']])) {
            db_insert('acc_devices', ['account_id' => $id, 'dev' => (string)$_SESSION['dev'], 'ua' => mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 180),
                'ip' => linea_ip(), 'created_at' => linea_now(), 'last_at' => linea_now()]);
        }
    }
    return null;
}

/** Текущий клиент (активная роль client, устройство не завершено) или null. */
function kab_client(): ?array
{
    acc_session();
    if (($_SESSION['role'] ?? '') !== 'client' || empty($_SESSION['acc'])) { return null; }
    $a = db_one("SELECT * FROM accounts WHERE id = ? AND role = 'client'", [(int)$_SESSION['acc']]);
    if (!$a || $a['status'] !== 'active') { return null; }
    $d = db_one('SELECT * FROM acc_devices WHERE dev = ?', [(string)($_SESSION['dev'] ?? '')]);
    if ($d && $d['ended_at']) { acc_logout(); return null; }
    if ($d && strtotime((string)$d['last_at']) < time() - 300) { db_update('acc_devices', ['last_at' => linea_now(), 'ip' => linea_ip()], 'id = ?', [(int)$d['id']]); }
    return $a;
}

/** Гостевой заказ (ссылка с токеном, 12 часов) или null. */
function kab_guest_order(): ?array
{
    acc_session();
    $id = (int)($_SESSION['guest_order'] ?? 0);
    if (!$id || (int)($_SESSION['guest_at'] ?? 0) < time() - KAB_GUEST_HOURS * 3600) { return null; }
    return db_one('SELECT * FROM orders WHERE id = ?', [$id]);
}

/** Код подтверждён недавно (значимые действия). */
function kab_fresh(): bool
{
    acc_session();
    return (int)($_SESSION['code_at'] ?? 0) > time() - brig_terms()['fresh_code_hours'] * 3600;
}

/** Значимое действие: нужен вход кодом не старше fresh_code_hours. Иначе 401 {needCode}. */
function kab_require_fresh(): void
{
    if (!kab_fresh()) { linea_json(['ok' => false, 'needCode' => true, 'error' => 'Подтвердите действие кодом из письма'], 401); }
}

/** Значимое действие по конкретному заказу: свежий код И заказ принадлежит аккаунту сессии (или почта сессии — почта заказа). */
function kab_require_fresh_for_order(array $o): void
{
    kab_require_fresh();
    acc_session();
    $acc = (int)($_SESSION['roles']['client'] ?? 0);
    $mine = ($acc && (int)($o['account_id'] ?? 0) === $acc) || (mb_strtolower((string)$o['email']) !== '' && mb_strtolower((string)$o['email']) === (string)($_SESSION['email'] ?? ''));
    if (!$mine) { linea_json(['ok' => false, 'needCode' => true, 'error' => 'Подтвердите почту заказа кодом из письма'], 401); }
}

/** Заказ, доступный текущей сессии (клиент — свои, гость — один). */
function kab_order_access(string $number): ?array
{
    $o = linea_order_by_number($number);
    if (!$o) { return null; }
    $c = kab_client();
    if ($c && (int)$o['account_id'] === (int)$c['id']) { return $o; }
    $g = kab_guest_order();
    if ($g && (int)$g['id'] === (int)$o['id']) { return $o; }
    return null;
}

// ───────────────────────── уведомления в кабинете

/** Уведомление клиенту заказа (колокольчик). $ukey — защита от повторов таймеров. */
function kab_notice(int $accountId, ?int $orderId, string $grp, string $text, string $link = '', string $ukey = ''): void
{
    if ($accountId <= 0) { return; }
    try {
        db_insert('notices', ['account_id' => $accountId, 'order_id' => $orderId, 'grp' => isset(KAB_GROUPS[$grp]) ? $grp : 'proekt', 'text' => mb_substr($text, 0, 1000),
            'link' => mb_substr($link, 0, 180) ?: null, 'at' => date('Y-m-d H:i:s', kab_time()), 'ukey' => $ukey !== '' ? mb_substr($ukey, 0, 180) : null]);
    } catch (PDOException $e) { /* уже есть с этим ukey */ }
}

function kab_notice_order(array $o, string $grp, string $text, string $link = '', string $ukey = ''): void
{
    kab_notice((int)($o['account_id'] ?? 0), (int)$o['id'], $grp, $text, $link ?: '#/o/' . $o['number'], $ukey);
}

// ───────────────────────── выпуски альбома и реестр вопросов (GOST-DRAFT кладёт registry.json рядом с листами)

function kab_order_dir(array $o): string { return linea_private() . '/orders/' . preg_replace('/[^A-Za-z0-9-]/', '', (string)$o['number']); }

/** Выпуски заказа: orders/<номер>/releases/<версия>/meta.json. Скрытые — только для админки. */
function kab_releases(array $o, bool $withHidden = false): array
{
    $out = [];
    foreach (glob(kab_order_dir($o) . '/releases/*/meta.json') ?: [] as $f) {
        $m = json_decode((string)file_get_contents($f), true);
        if (!is_array($m) || (!$withHidden && !empty($m['hidden']))) { continue; }
        $dir = dirname($f);
        $m['ver'] = basename($dir);
        $m['hasPdf'] = is_file($dir . '/album.pdf');
        $m['hasRegistry'] = is_file($dir . '/registry.json');
        $out[] = $m;
    }
    usort($out, fn($a, $b) => strcmp((string)($a['date'] ?? ''), (string)($b['date'] ?? '')) ?: strnatcmp($a['ver'], $b['ver']));
    return $out;
}

/** Реестр последней видимой версии с реестром: [ver, sha256, items[]] или null. */
function kab_registry(array $o): ?array
{
    $rel = array_values(array_filter(kab_releases($o), fn($r) => $r['hasRegistry']));
    if (!$rel) { return null; }
    $r = end($rel);
    $raw = (string)file_get_contents(kab_order_dir($o) . '/releases/' . $r['ver'] . '/registry.json');
    $j = json_decode($raw, true);
    $items = [];
    foreach ((array)($j['items'] ?? []) as $it) {
        if (!is_array($it) || !isset($it['id'])) { continue; }
        $kind = in_array($it['kind'] ?? '', ['question', 'decision', 'change', 'conflict'], true) ? $it['kind'] : 'question';
        if (!empty($it['proposed']) && $kind === 'question') { $kind = 'decision'; }
        $items[] = ['id' => linea_str($it['id'], 20), 'kind' => $kind, 'text' => linea_str($it['client_text'] ?? $it['text'] ?? '', 2000),
            'why' => linea_str($it['why'] ?? '', 2000), 'options' => array_values(array_map(fn($x) => linea_str($x, 120), array_slice((array)($it['options'] ?? []), 0, 6))),
            'sheet' => linea_str($it['sheet'] ?? '', 160), 'blocker' => !empty($it['blocker']), 'cost' => linea_str($it['cost'] ?? '', 120),
            'closed' => !empty($it['closed'])];
    }
    return ['ver' => $r['ver'], 'sha256' => hash('sha256', $raw), 'items' => $items];
}

function kab_answers(array $o): array
{
    $f = kab_order_dir($o) . '/answers.json';
    $j = is_file($f) ? json_decode((string)file_get_contents($f), true) : null;
    return is_array($j) ? $j + ['items' => []] : ['items' => []];
}

function kab_answers_save(array $o, array $a): void
{
    linea_mkdir(kab_order_dir($o));
    $f = kab_order_dir($o) . '/answers.json';
    file_put_contents($f, json_encode($a, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
    @chmod($f, 0600);
}

/** Почему согласие сейчас нельзя отозвать (null — можно). Те же правила, что в consent_revoke. */
function kab_consent_why_not(array $c, array $x): ?string
{
    $o = $x['order_id'] ? brig_one('SELECT * FROM orders WHERE id = ?', [(int)$x['order_id']]) : null;
    switch ($x['kind']) {
        case 'pd':
            $b = kab_pd_blockers($c);
            return $b ? 'Пока идёт работа (' . implode('; ', $b) . '), отозвать нельзя — можно подать заявку на удаление после завершения' : null;
        case 'project_to_brigades':
            $rm = $o ? kab_remont($o) : ['job' => null];
            return $rm['job'] && $rm['job']['status'] !== 'cancelled' ? 'Договор с бригадой заключается или исполняется — проект нужен для работы' : null;
        case 'transfer_brigade':
            $j = $x['job_id'] ? brig_one('SELECT * FROM br_jobs WHERE id = ?', [(int)$x['job_id']]) : null;
            return $j && $j['contacts_open_at'] && $j['status'] !== 'cancelled' ? 'Договор подписан и исполняется — контакты нужны бригаде для работы' : null;
    }
    return null;
}

/** Ответ К-N под блокировкой файла: два одновременных ответа не теряют друг друга; прежний ответ уходит в историю (ревью кода, низкий). */
function kab_answers_put(array $o, string $id, array $rec): void
{
    linea_mkdir(kab_order_dir($o));
    $f = kab_order_dir($o) . '/answers.json';
    $h = fopen($f, 'c+');
    if (!$h) { linea_fail('Ответ не сохранился — повторите', 500); }
    flock($h, LOCK_EX);
    $a = json_decode((string)stream_get_contents($h), true);
    $a = is_array($a) ? $a + ['items' => []] : ['items' => []];
    if (isset($a['items'][$id])) { $a['history'][] = ['id' => $id] + $a['items'][$id]; }
    $a['items'][$id] = $rec;
    ftruncate($h, 0); rewind($h); fwrite($h, json_encode($a, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)); fflush($h);
    flock($h, LOCK_UN); fclose($h);
    @chmod($f, 0600);
}

/** Подпись кабинета в общий реестр signatures. */
function kab_sign(string $role, int $whoId, string $kind, string $docId, ?string $version, string $sha, string $decision = '', string $note = '', ?int $orderId = null, ?int $jobId = null): int
{
    return db_insert('signatures', ['who_role' => $role, 'who_id' => $whoId, 'doc_kind' => $kind, 'doc_id' => mb_substr($docId, 0, 180), 'version' => $version,
        'sha256' => $sha, 'method' => 'session_code', 'decision' => $decision ?: null, 'note' => $note !== '' ? mb_substr($note, 0, 2000) : null,
        'order_id' => $orderId, 'job_id' => $jobId, 'at' => linea_now(), 'ip' => linea_ip(), 'ua' => mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 180)]);
}

/** Правки R-… по заказу (review.php пишет reviews/<слаг>/*.json с номером заказа). */
function kab_reviews(array $o): array
{
    $out = [];
    foreach (glob(linea_private() . '/reviews/*/*.json') ?: [] as $f) {
        $r = json_decode((string)file_get_contents($f), true);
        if (!is_array($r) || ($r['order'] ?? '') !== $o['number']) { continue; }
        $out[] = ['number' => (string)$r['number'], 'at' => (string)$r['at'], 'count' => count($r['notes'] ?? []), 'status' => (string)($r['status'] ?? 'Получены'),
            'reply' => (string)($r['reply'] ?? ''), 'notes' => array_map(fn($n) => ['file' => (string)($n['file'] ?? ''), 'n' => (int)($n['n'] ?? 0), 'text' => (string)($n['text'] ?? '')], $r['notes'] ?? []),
            'project' => (string)($r['project'] ?? ''), '_f' => $f];
    }
    usort($out, fn($a, $b) => strcmp($b['at'], $a['at']));
    return $out;
}

// ───────────────────────── ремонт по заказу (для «Сейчас нужно» и списка)

function kab_remont(array $o): array
{
    $r = brig_one('SELECT * FROM br_requests WHERE order_id = ?', [(int)$o['id']]);
    if (!$r) { return ['request' => null, 'job' => null]; }
    $j = brig_job_for_request((int)$r['id']);
    return ['request' => $r, 'job' => $j];
}

/** Можно ли подбирать бригаду (choose_after: final — только по финальному альбому, т. е. заказ «выдан»). */
function kab_remont_eligible(array $o): bool
{
    if (brig_terms()['choose_after'] === 'first') { return in_array($o['status'], ['paid', 'delivered'], true) && ($o['status'] === 'delivered' || kab_releases($o)); }
    return $o['status'] === 'delivered';
}

/** «Сейчас от вас нужно»: одна строка и одна кнопка (спецификация 3.5). Порядок: оплата → блокирующие вопросы → решения → правки → ремонт. */
function kab_next_action(array $o): array
{
    $pub = linea_public_order($o);
    $num = $o['number'];
    $base = '#/o/' . $num;
    if ($o['status'] === 'cancelled') { return ['text' => 'Заказ отменён', 'btn' => null, 'href' => null, 'who' => 'none']; }
    if ($o['status'] === 'refunded') { return ['text' => 'Оплата возвращена. Если остались вопросы — напишите нам', 'btn' => null, 'href' => null, 'who' => 'none']; }
    if ($o['status'] === 'new' || ($o['status'] === 'awaiting_payment' && !$pub['amount'])) {
        return ['text' => 'Проверяем бриф — сумму подтвердим в течение рабочего дня', 'btn' => null, 'href' => null, 'who' => 'studio'];
    }
    if ($o['status'] === 'awaiting_payment') {
        if (!empty($pub['canPay'])) { return ['text' => 'Оплатите проект — работа начнётся сразу после оплаты', 'btn' => 'Оплатить ' . brig_rub((int)$o['amount_kop']), 'href' => $base . '/proekt', 'act' => 'pay', 'who' => 'client']; }
        if ($o['invoice_at']) { return ['text' => 'Счёт отправлен на почту — оплатите по реквизитам из счёта', 'btn' => 'Подробнее', 'href' => $base . '/proekt', 'who' => 'client']; }
        return ['text' => 'Сумма ' . brig_rub((int)$o['amount_kop']) . '. Счёт на оплату пришлём на почту', 'btn' => null, 'href' => null, 'who' => 'studio'];
    }
    $reg = kab_registry($o);
    $ans = kab_answers($o)['items'];
    if ($reg) {
        $open = array_filter($reg['items'], fn($i) => !$i['closed'] && $i['kind'] === 'question' && empty($ans[$i['id']]));
        if ($open) { return ['text' => 'Ответьте на ' . count($open) . ' ' . kab_plural(count($open), 'вопрос', 'вопроса', 'вопросов') . ' по проекту', 'btn' => 'Ответить', 'href' => $base . '/voprosy', 'who' => 'client', 'blocker' => (bool)array_filter($open, fn($i) => $i['blocker'])]; }
        $dec = array_filter($reg['items'], fn($i) => !$i['closed'] && in_array($i['kind'], ['decision', 'change'], true) && empty($ans[$i['id']]));
        if ($dec) { return ['text' => 'Согласуйте ' . count($dec) . ' ' . kab_plural(count($dec), 'решение', 'решения', 'решений') . ' проектировщика', 'btn' => 'Посмотреть решения', 'href' => $base . '/voprosy', 'who' => 'client']; }
    }
    $rel = kab_releases($o);
    if ($o['status'] === 'paid' && !$rel) { return ['text' => 'Делаем первый вариант проекта. Как будет готов — напишем на почту', 'btn' => null, 'href' => null, 'who' => 'studio']; }
    if ($o['status'] === 'paid') {
        $last = end($rel);
        return ['text' => 'Посмотрите альбом и отметьте правки, если что-то хотите изменить', 'btn' => 'Открыть альбом', 'href' => $base . '/proekt', 'act' => 'album', 'who' => 'client', 'ver' => $last['ver']];
    }
    // выдан — ремонт
    $rm = kab_remont($o);
    $r = $rm['request']; $j = $rm['job'];
    if ($j) {
        if (!empty($j['frozen_at'])) { return ['text' => 'Сделка приостановлена LINEA: ' . (string)$j['frozen_reason'] . '. Мы на связи', 'btn' => 'Открыть ремонт', 'href' => $base . '/remont', 'who' => 'studio']; }
        if (brig_one("SELECT 1 FROM br_disputes WHERE job_id = ? AND status <> 'resolved'", [(int)$j['id']])) { return ['text' => 'Идёт рассмотрение разногласия — ответ LINEA придёт в кабинет и на почту', 'btn' => 'Открыть ремонт', 'href' => $base . '/remont', 'who' => 'studio']; }
        if ($j['status'] === 'contract') {
            if (!$j['client_signed_at']) { return ['text' => 'Договор с бригадой готов. Проверьте условия и подпишите кодом из письма', 'btn' => 'Посмотреть договор', 'href' => $base . '/remont', 'who' => 'client']; }
            return ['text' => 'Вы подписали договор. Ждём подпись бригады', 'btn' => null, 'href' => $base . '/remont', 'who' => 'brigade'];
        }
        if ($j['status'] === 'work') {
            $st = brig_one("SELECT * FROM br_stages WHERE job_id = ? AND status = 'ready' ORDER BY idx LIMIT 1", [(int)$j['id']]);
            if ($st) { return ['text' => 'Бригада сдаёт этап «' . $st['name'] . '». Проверьте по чек-листу', 'btn' => 'Проверить и принять', 'href' => $base . '/remont', 'who' => 'client']; }
            if (!$j['advance_at']) { return ['text' => 'Договор подписан. Когда передадите аванс бригаде — отметьте здесь', 'btn' => 'Открыть ремонт', 'href' => $base . '/remont', 'who' => 'client']; }
            $cur = brig_one("SELECT * FROM br_stages WHERE job_id = ? AND status IN ('work','returned','plan') ORDER BY idx LIMIT 1", [(int)$j['id']]);
            return ['text' => $cur ? 'Идёт этап «' . $cur['name'] . '»' . ($cur['plan_end'] ? ', план до ' . date('d.m', strtotime((string)$cur['plan_end'])) : '') : 'Ремонт идёт', 'btn' => 'Написать бригаде', 'href' => $base . '/remont', 'who' => 'brigade'];
        }
        if ($j['status'] === 'done') {
            $rev = brig_one('SELECT 1 FROM br_reviews WHERE job_id = ?', [(int)$j['id']]);
            return $rev ? ['text' => 'Ремонт завершён. Спасибо за отзыв!', 'btn' => null, 'href' => null, 'who' => 'none']
                : ['text' => 'Ремонт завершён. Расскажите, как прошла работа бригады', 'btn' => 'Оставить отзыв', 'href' => $base . '/remont', 'who' => 'client'];
        }
    }
    if ($r && $r['status'] === 'new') { return ['text' => 'Готовим проект для бригад — обычно до 1 рабочего дня', 'btn' => null, 'href' => $base . '/remont', 'who' => 'studio']; }
    if ($r && $r['status'] === 'sent') {
        $n = (int)db_val("SELECT COUNT(*) FROM br_offers WHERE request_id = ? AND status = 'submitted'", [(int)$r['id']]);
        return $n ? ['text' => 'Пришло ' . $n . ' ' . kab_plural($n, 'предложение', 'предложения', 'предложений') . '. Сравните и выберите', 'btn' => 'Сравнить предложения', 'href' => $base . '/remont', 'who' => 'client']
            : ['text' => 'Бригады считают ваш проект' . ($r['deadline_at'] ? '. Ответы — до ' . date('d.m', strtotime((string)$r['deadline_at'])) : ''), 'btn' => null, 'href' => $base . '/remont', 'who' => 'brigade'];
    }
    return ['text' => 'Финальный альбом готов. Можно подобрать бригаду на ремонт — это необязательно', 'btn' => 'Подобрать бригаду', 'href' => $base . '/remont', 'who' => 'client'];
}

function kab_plural(int $n, string $one, string $few, string $many): string
{
    $m10 = $n % 10; $m100 = $n % 100;
    return $m10 === 1 && $m100 !== 11 ? $one : ($m10 >= 2 && $m10 <= 4 && ($m100 < 10 || $m100 >= 20) ? $few : $many);
}

/** Шаг заказа для полосы: brief → pay → work → first → answers → final → remont. */
function kab_step(array $o): int
{
    if (in_array($o['status'], ['new', 'awaiting_payment'], true)) { return $o['amount_kop'] ? 1 : 0; }
    if ($o['status'] === 'paid') {
        $rel = kab_releases($o);
        if (!$rel) { return 2; }
        return kab_registry($o) ? 4 : 3;
    }
    if ($o['status'] === 'delivered') { return kab_remont($o)['request'] ? 6 : 5; }
    return 0;
}

// ───────────────────────── согласия (152-ФЗ)

/** Согласия клиента: из заказов (ПДн, портфолио), подбора (проект бригадам), сделок (контакты бригаде), отзывов (публикация). */
function kab_consents_sync(array $acc): void
{
    $aid = (int)$acc['id'];
    $have = [];
    foreach (brig_all('SELECT kind, order_id, job_id FROM consents WHERE account_id = ?', [$aid]) as $c) { $have[$c['kind'] . '|' . (int)$c['order_id'] . '|' . (int)$c['job_id']] = true; }
    $add = function (string $kind, ?int $oid, ?int $jid, string $ed, string $at, string $text) use ($aid, &$have) {
        $k = $kind . '|' . (int)$oid . '|' . (int)$jid;
        if (isset($have[$k]) || $at === '') { return; }
        db_insert('consents', ['account_id' => $aid, 'order_id' => $oid, 'job_id' => $jid, 'kind' => $kind, 'edition' => $ed ?: '—', 'given_at' => $at, 'text' => mb_substr($text, 0, 2000)]);
        $have[$k] = true;
    };
    foreach (brig_all('SELECT * FROM orders WHERE account_id = ?', [$aid]) as $o) {
        $txt = (string)$o['consent_text'];
        $ed = preg_match('/редакция ([0-9.]+)/u', $txt, $m) ? $m[1] : '—';
        $add('pd', (int)$o['id'], null, $ed, (string)$o['consent_at'], $txt);
        if (preg_match('/показ в портфолио: да/u', $txt)) { $add('portfolio', (int)$o['id'], null, $ed, (string)$o['consent_at'], 'Показ проекта в портфолио (из брифа)'); }
        $r = brig_one('SELECT * FROM br_requests WHERE order_id = ?', [(int)$o['id']]);
        if ($r) {
            $add('project_to_brigades', (int)$o['id'], null, BRIG_CLIENT_TERMS['ed'], (string)$r['consent_at'], (string)$r['consent_text']);
            foreach (brig_all("SELECT * FROM br_jobs WHERE request_id = ?", [(int)$r['id']]) as $j) {
                $add('transfer_brigade', (int)$o['id'], (int)$j['id'], BRIG_CLIENT_TERMS['ed'], (string)$j['contacts_consent_at'], 'Передача контактов и адреса выбранной бригаде');
                $rv = brig_one('SELECT created_at FROM br_reviews WHERE job_id = ?', [(int)$j['id']]);
                if ($rv) { $add('public_review', (int)$o['id'], (int)$j['id'], BRIG_CLIENT_TERMS['ed'], (string)$rv['created_at'], 'Отзыв и имя в публичной карточке бригады'); }
            }
        }
    }
}

/** Что мешает удалить данные сейчас: оплаченная работа над проектом, действующая сделка ремонта. */
function kab_pd_blockers(array $acc): array
{
    $out = [];
    foreach (brig_all('SELECT * FROM orders WHERE account_id = ?', [(int)$acc['id']]) as $o) {
        if ($o['status'] === 'paid') { $out[] = 'Идёт работа над оплаченным проектом ' . $o['number']; }
        $rm = kab_remont($o);
        if ($rm['job'] && in_array($rm['job']['status'], ['contract', 'work'], true)) { $out[] = 'Действует договор с бригадой по объекту ' . $o['number']; }
        elseif ($rm['request'] && in_array($rm['request']['status'], ['new', 'sent'], true)) { $out[] = 'Идёт подбор бригады по объекту ' . $o['number']; }
    }
    return $out;
}

/** Обезличивание по заявке (152-ФЗ): контакты, бриф, фото — удаляются; договоры, подписи, чеки — остаются на срок хранения. */
function kab_pd_destroy(array $acc, string $who): array
{
    $done = [];
    foreach (brig_all('SELECT * FROM orders WHERE account_id = ?', [(int)$acc['id']]) as $o) {
        db_update('orders', ['name' => 'удалено', 'phone' => null, 'email' => null, 'contact' => null, 'updated_at' => linea_now()], 'id = ?', [(int)$o['id']]);
        foreach (['brief.zip', 'brief.json', 'answers.json'] as $f) { $p = kab_order_dir($o) . '/' . $f; if (is_file($p)) { @unlink($p); $done[] = $o['number'] . '/' . $f; } }
        linea_event((int)$o['id'], $who, 'Персональные данные обезличены по заявке клиента (152-ФЗ); договоры и подписи хранятся до конца срока');
    }
    db_exec("UPDATE consents SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL", [linea_now(), (int)$acc['id']]);
    db_update('accounts', ['email' => 'deleted-' . (int)$acc['id'] . '@invalid', 'name' => null, 'phone' => null, 'status' => 'deleted', 'prefs' => null], 'id = ?', [(int)$acc['id']]);
    db_exec('UPDATE acc_devices SET ended_at = ? WHERE account_id = ? AND ended_at IS NULL', [linea_now(), (int)$acc['id']]);
    db_exec('DELETE FROM notices WHERE account_id = ?', [(int)$acc['id']]);
    return $done;
}

/** Выгрузка сведений (ст. 14 152-ФЗ): ZIP с брифами, ответами, согласиями, подписями. @return имя файла в linea-private/exports */
function kab_pd_export(array $acc): string
{
    $dir = linea_private() . '/exports';
    linea_mkdir($dir);
    $name = 'acc' . (int)$acc['id'] . '-' . date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.zip';
    $z = new ZipArchive();
    if ($z->open($dir . '/' . $name, ZipArchive::CREATE) !== true) { throw new RuntimeException('zip'); }
    $z->addFromString('account.json', json_encode(['email' => $acc['email'], 'name' => $acc['name'], 'phone' => $acc['phone'], 'created' => $acc['created_at']], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    foreach (brig_all('SELECT * FROM orders WHERE account_id = ?', [(int)$acc['id']]) as $o) {
        $d = kab_order_dir($o);
        $z->addFromString($o['number'] . '/order.json', json_encode(array_intersect_key($o, array_flip(['number', 'status', 'kind', 'created_at', 'name', 'phone', 'email', 'contact', 'object_type', 'area', 'amount_kop', 'paid_at', 'consent_at', 'consent_text'])), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        foreach (['brief.json', 'answers.json'] as $f) { if (is_file($d . '/' . $f)) { $z->addFile($d . '/' . $f, $o['number'] . '/' . $f); } }
        $z->addFromString($o['number'] . '/signatures.json', json_encode(brig_all('SELECT doc_kind, doc_id, version, sha256, decision, at, ip FROM signatures WHERE order_id = ?', [(int)$o['id']]), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    }
    $z->addFromString('consents.json', json_encode(brig_all('SELECT kind, edition, given_at, revoked_at, text FROM consents WHERE account_id = ?', [(int)$acc['id']]), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    $z->close();
    @chmod($dir . '/' . $name, 0600);
    return $name;
}

// ───────────────────────── переходы сделки (одна точка: таблица разрешённых переходов, журнал сделки, аудит)

const DEAL_TRANSITIONS = [
    'contract' => ['work', 'cancelled'],
    'work' => ['done', 'cancelled'],
    'done' => [],
    'cancelled' => [],
];

/**
 * Переход сделки или флаг: $to — статус из DEAL_TRANSITIONS либо 'freeze' / 'unfreeze'. Недопустимый — 409.
 * Пишет системную запись в ленту сделки (одинаковую для обеих сторон) и журнал аудита.
 */
function deal_transition(int $jobId, string $to, string $who, string $why, bool $throw = false, array $extra = []): array
{
    $fail = function (string $m, int $c = 400) use ($throw) { if ($throw) { throw new DomainException($m); } linea_fail($m, $c); };
    $j = brig_one('SELECT * FROM br_jobs WHERE id = ?', [$jobId]);
    if (!$j) { $fail('Сделка не найдена', 404); }
    $now = linea_now();
    if ($to === 'freeze' || $to === 'unfreeze') {
        if (in_array($j['status'], ['done', 'cancelled'], true)) { $fail('Сделка завершена — приостанавливать нечего', 409); }
        if ($to === 'freeze' && $j['frozen_at']) { $fail('Сделка уже приостановлена', 409); }
        if ($to === 'unfreeze' && !$j['frozen_at']) { $fail('Сделка не приостановлена', 409); }
        if (trim($why) === '') { $fail('Укажите причину'); }
        db_update('br_jobs', $to === 'freeze' ? ['frozen_at' => $now, 'frozen_reason' => mb_substr($why, 0, 500), 'updated_at' => $now] : ['frozen_at' => null, 'frozen_reason' => null, 'updated_at' => $now], 'id = ?', [$jobId]);
        $text = $to === 'freeze' ? 'LINEA приостановила сделку: ' . $why . '. Все действия, кроме ленты и разногласий, на паузе.' : 'LINEA возобновила сделку: ' . $why;
    } else {
        if (!in_array($to, DEAL_TRANSITIONS[$j['status']] ?? [], true)) { $fail('Переход «' . $j['status'] . ' → ' . $to . '» недопустим', 409); }
        db_update('br_jobs', ['status' => $to, 'updated_at' => $now] + ($to === 'done' ? ['done_at' => $now] : []) + ($to === 'cancelled' ? ['cancelled_at' => $now, 'cancel_by' => $who, 'cancel_reason' => mb_substr($why, 0, 500)] : []), 'id = ? AND status = ?', [$jobId, $j['status']]);
        if ($extra) { db_update('br_jobs', array_intersect_key($extra, array_flip(['cancel_by', 'cancel_reason'])), 'id = ?', [$jobId]); }
        $text = 'Статус сделки: ' . (BRIG_JOB_STATUS[$to] ?? $to) . ($why !== '' ? ' — ' . $why : '');
    }
    db_insert('br_messages', ['job_id' => $jobId, 'who' => 'system', 'text' => $text, 'masked' => 0, 'at' => $now]);
    brig_audit($who, 'deal-' . $to, 'job#' . $jobId, $why);
    $o = db_one('SELECT o.* FROM orders o JOIN br_requests r ON r.order_id = o.id WHERE r.id = ?', [(int)$j['request_id']]);
    if ($o) { kab_notice_order($o, 'remont', $text, '#/o/' . $o['number'] . '/remont'); }
    brig_notice((int)$j['brigade_id'], $jobId, 'obekty', $text, '#/obekt/' . $jobId);
    return brig_one('SELECT * FROM br_jobs WHERE id = ?', [$jobId]);
}

/** Сделка приостановлена LINEA — действия сторон (кроме ленты и разногласий) закрыты. */
function deal_require_not_frozen(array $j): void
{
    if (!empty($j['frozen_at'])) { linea_fail('Сделка приостановлена LINEA: ' . (string)$j['frozen_reason'] . '. Лента и разногласия работают', 423); }
}

// ───────────────────────── проводки вознаграждения (br_ledger) и режим «отложено до ИП»

/**
 * Синхронизация начисления по сделке: одна строка accrual на сделку (сумма = commission_kop), статус:
 *   accrued (начислено, ещё не к оплате) → due (к оплате, у LINEA есть реквизиты) | deferred (к оплате, но ИП ещё нет — счёт не выставляется)
 *   → invoiced → paid; waived — самозанятая бригада без вознаграждения (brig_terms npd.no_fee). Изменение суммы — проводка adjust.
 */
function ledger_sync(int $jobId): ?array
{
    $j = brig_one('SELECT j.*, b.legal, r.test FROM br_jobs j JOIN br_brigades b ON b.id = j.brigade_id JOIN br_requests r ON r.id = j.request_id WHERE j.id = ?', [$jobId]);
    if (!$j || $j['commission_kop'] === null) { return null; }
    $inv = brig_one('SELECT * FROM br_invoices WHERE job_id = ?', [$jobId]);
    $t = brig_terms();
    $status = $inv ? ($inv['paid_at'] ? 'paid' : 'invoiced')
        : ($j['legal'] === 'npd' && $t['npd']['no_fee'] ? 'waived'
        : ($j['status'] === 'cancelled' ? 'void' : ($j['commission_due_at'] ? (linea_requisites() ? 'due' : 'deferred') : 'accrued')));
    $acc = brig_one("SELECT * FROM br_ledger WHERE job_id = ? AND kind = 'accrual'", [$jobId]);
    $kop = (int)$j['commission_kop'];
    if (!$acc) {
        db_insert('br_ledger', ['brigade_id' => (int)$j['brigade_id'], 'job_id' => $jobId, 'kind' => 'accrual', 'amount_kop' => $kop, 'status' => $status,
            'note' => 'Начислено при подписании договора (' . brig_rate_text((float)$j['commission_rate']) . ')', 'invoice_id' => $inv ? (int)$inv['id'] : null, 'at' => linea_now(), 'by_who' => 'system']);
    } else {
        $sum = (int)db_val("SELECT SUM(amount_kop) FROM br_ledger WHERE job_id = ? AND kind IN ('accrual','adjust')", [$jobId]);
        if ($sum !== $kop) {
            db_insert('br_ledger', ['brigade_id' => (int)$j['brigade_id'], 'job_id' => $jobId, 'kind' => 'adjust', 'amount_kop' => $kop - $sum, 'status' => 'done',
                'note' => 'Пересчёт по допсоглашению', 'at' => linea_now(), 'by_who' => 'system']);
        }
        if ($acc['status'] !== $status) { db_update('br_ledger', ['status' => $status, 'invoice_id' => $inv ? (int)$inv['id'] : null], 'id = ?', [(int)$acc['id']]); }
    }
    return brig_one("SELECT * FROM br_ledger WHERE job_id = ? AND kind = 'accrual'", [$jobId]);
}

function ledger_sync_all(): void
{
    brig_commission_sweep();
    foreach (brig_all('SELECT id FROM br_jobs WHERE commission_kop IS NOT NULL') as $x) { ledger_sync((int)$x['id']); }
}

/** Выставить счёт по сделке (общая точка для админки): только при реквизитах LINEA; вручную — с причиной. @return номер или текст ошибки */
function ledger_invoice(int $jobId, string $who, string $reason = '', bool $manual = false)
{
    if (!linea_requisites()) { return 'Счёт не выставляется: у LINEA ещё нет реквизитов ИП/ООО (вознаграждение «отложено»). Заполните реквизиты в «Настройках»'; }
    $j = brig_one('SELECT j.*, r.object_title, r.test FROM br_jobs j JOIN br_requests r ON r.id = j.request_id WHERE j.id = ?', [$jobId]);
    if (!$j || $j['commission_kop'] === null) { return 'Вознаграждение ещё не начислено'; }
    brig_commission_due_check($jobId, $who);
    $j = brig_one('SELECT j.*, r.object_title, r.test FROM br_jobs j JOIN br_requests r ON r.id = j.request_id WHERE j.id = ?', [$jobId]);
    if (!$j['commission_due_at'] && (!$manual || $reason === '')) { return 'Вознаграждение ещё не к оплате ни по одной дате (вручную — с причиной)'; }
    if (brig_one('SELECT 1 FROM br_invoices WHERE job_id = ?', [$jobId])) { return 'Счёт уже выставлен'; }
    $b = brig_one('SELECT * FROM br_brigades WHERE id = ?', [(int)$j['brigade_id']]);
    if ($b['legal'] === 'npd' && brig_terms()['npd']['no_fee']) { return 'Самозанятая бригада — без вознаграждения до перехода в ИП (настройка «npd.no_fee»)'; }
    $now = linea_now();
    $iid = db_insert('br_invoices', ['number' => 'tmp-' . bin2hex(random_bytes(4)), 'brigade_id' => (int)$j['brigade_id'], 'job_id' => $jobId, 'amount_kop' => (int)$j['commission_kop'],
        'issued_at' => $now, 'due_at' => date('Y-m-d', strtotime('+' . (int)brig_terms()['invoice_days'] . ' days'))]);
    $num = 'LB-' . date('ym') . '-' . str_pad((string)$iid, 4, '0', STR_PAD_LEFT);
    db_update('br_invoices', ['number' => $num], 'id = ?', [$iid]);
    if (!$j['commission_due_at']) { brig_exec('UPDATE br_jobs SET commission_due_at = ?, commission_due_why = ? WHERE id = ? AND commission_due_at IS NULL', [$now, 'счёт выставлен LINEA вручную', $jobId]); }
    brig_mail((string)$b['email'], 'brig_invoice', ['name' => $b['contact_name'], 'number' => $num, 'amount' => brig_rub((int)$j['commission_kop']), 'object' => $j['object_title'], 'link' => brig_link('brigada/')], (bool)$j['test'] || (bool)$b['test']);
    brig_audit($who, 'invoice', 'job#' . $jobId, $num . ' на ' . brig_rub((int)$j['commission_kop']) . ($reason !== '' ? ' — ' . $reason : ''));
    ledger_sync($jobId);
    return $num;
}

// ───────────────────────── лестница предупреждений бригады (warn_ladder)

/**
 * Предупреждение бригаде: 1-е — предупреждение с цитатой правила; 2-е — ниже в подборе на 14 дней; 3-е за 90 дней — лента новых заказов
 * закрыта на 14 дней; дальше — приостановка/блок решением админа (здесь только рекомендация).
 */
function brig_warn(int $brigadeId, string $rule, string $quote, string $who): array
{
    $n = (int)db_val('SELECT COUNT(*) FROM br_warnings WHERE brigade_id = ? AND at > ?', [$brigadeId, date('Y-m-d H:i:s', time() - 90 * 86400)]) + 1;
    $until = $n >= 2 ? date('Y-m-d H:i:s', time() + 14 * 86400) : null;
    db_insert('br_warnings', ['brigade_id' => $brigadeId, 'rule' => mb_substr($rule, 0, 180), 'quote' => mb_substr($quote, 0, 1000), 'step' => min($n, 4), 'at' => linea_now(), 'by_who' => $who, 'until_at' => $until]);
    $text = [1 => 'Предупреждение', 2 => 'Предупреждение и ниже в подборе на 14 дней', 3 => 'Лента новых заказов закрыта на 14 дней'][$n] ?? 'Рекомендуется приостановка или блокировка решением LINEA';
    brig_audit($who, 'brigade-warn', 'brigade#' . $brigadeId, 'шаг ' . $n . ': ' . $rule);
    $b = brig_one('SELECT * FROM br_brigades WHERE id = ?', [$brigadeId]);
    if ($b) { brig_mail((string)$b['email'], 'brig_status', ['name' => $b['contact_name'], 'status' => $text, 'reason' => $rule . ($quote !== '' ? ' («' . mb_substr($quote, 0, 200) . '»)' : ''), 'link' => brig_link('brigada/')], (bool)$b['test']); }
    return ['step' => $n, 'text' => $text, 'until' => $until];
}

/** Действующее ограничение ленты по лестнице предупреждений (3-й шаг за 90 дней) или null. */
function brig_warn_block(int $brigadeId): ?string
{
    $w = brig_one('SELECT * FROM br_warnings WHERE brigade_id = ? AND step >= 3 AND until_at > ? ORDER BY id DESC LIMIT 1', [$brigadeId, linea_now()]);
    return $w ? 'Лента новых заказов закрыта до ' . date('d.m.Y', strtotime((string)$w['until_at'])) . ' (третье предупреждение за 90 дней: ' . $w['rule'] . '). Начатые объекты ведите как обычно.' : null;
}
