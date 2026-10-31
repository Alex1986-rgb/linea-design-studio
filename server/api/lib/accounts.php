<?php
/**
 * LINEA · общие аккаунты (роль: brigade сейчас; client и admin — при переезде на MySQL и единый вход).
 * Пароль — password_hash; вход — сессия linea_acc (httponly, secure на https, SameSite=Strict), CSRF в сессии;
 * после 5 неудачных входов аккаунт закрыт на 15 минут (плюс лимит попыток с адреса — в вызывающем коде);
 * восстановление — одноразовая ссылка с токеном на 1 час (в базе только sha256 токена; в журналах токена нет).
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

const ACC_ROLES = ['brigade', 'client', 'admin'];

function acc_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) { return; }
    linea_mkdir(linea_private() . '/sessions');
    ini_set('session.save_handler', 'files');      // на Beget свой обработчик по умолчанию — см. admin.php
    ini_set('session.use_strict_mode', '1');
    session_save_path(linea_private() . '/sessions');
    session_name('linea_acc');
    // кука на всю папку api/ (api/brigade/*.php и api/*.php — одна сессия)
    $path = preg_replace('#/brigade$#', '', rtrim(dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/api/x.php')), '/')) . '/';
    session_set_cookie_params(['lifetime' => 0, 'path' => $path, 'httponly' => true, 'samesite' => 'Strict', 'secure' => linea_https()]);
    session_start();
    if (empty($_SESSION['csrf'])) { $_SESSION['csrf'] = bin2hex(random_bytes(16)); }
}

function acc_csrf_token(): string { acc_session(); return (string)$_SESSION['csrf']; }

/** CSRF для сессии: заголовок X-CSRF или поле csrf. Без него — 403. */
function acc_csrf_check(): void
{
    acc_session();
    $t = (string)($_SERVER['HTTP_X_CSRF'] ?? $_POST['csrf'] ?? '');
    if ($t === '' || !hash_equals((string)$_SESSION['csrf'], $t)) { linea_fail('Форма устарела — обновите страницу', 403); }
}

function acc_create(string $role, string $email, string $password, bool $test): int
{
    if (!in_array($role, ACC_ROLES, true)) { throw new InvalidArgumentException('role'); }
    return db_insert('accounts', ['role' => $role, 'email' => mb_strtolower($email), 'pass_hash' => password_hash($password, PASSWORD_DEFAULT),
        'status' => 'active', 'fail_n' => 0, 'lock_until' => 0, 'created_at' => linea_now(), 'test' => $test ? 1 : 0]);
}

function acc_by_email(string $role, string $email): ?array
{
    return db_one('SELECT * FROM accounts WHERE role = ? AND email = ?', [$role, mb_strtolower(trim($email))]);
}

function acc_password_ok(string $p): ?string
{
    if (mb_strlen($p) < 8) { return 'Пароль — не короче 8 знаков'; }
    if (mb_strlen($p) > 200) { return 'Пароль слишком длинный'; }
    if (!preg_match('/\d/', $p) || !preg_match('/\pL/u', $p)) { return 'В пароле нужны и буквы, и цифры'; }
    return null;
}

/** Вход. @return аккаунт или строка-ошибка (одинаковая для «нет такого» и «не тот пароль»). */
function acc_login(string $role, string $email, string $password)
{
    $a = acc_by_email($role, $email);
    $bad = 'Неверная почта или пароль';
    if (!$a) { password_verify($password, password_hash('linea-timing', PASSWORD_DEFAULT)); usleep(300000); return $bad; }   // время ответа как у настоящей проверки
    if ((int)$a['lock_until'] > time()) { return 'Слишком много неудачных попыток — подождите 15 минут'; }
    if ($a['status'] !== 'active') { return 'Вход закрыт'; }
    if (!password_verify($password, (string)$a['pass_hash'])) {
        $n = (int)$a['fail_n'] + 1;
        db_update('accounts', ['fail_n' => $n >= 5 ? 0 : $n, 'lock_until' => $n >= 5 ? time() + 900 : 0], 'id = ?', [(int)$a['id']]);
        usleep(300000);
        return $bad;
    }
    if (password_needs_rehash((string)$a['pass_hash'], PASSWORD_DEFAULT)) { db_update('accounts', ['pass_hash' => password_hash($password, PASSWORD_DEFAULT)], 'id = ?', [(int)$a['id']]); }
    db_update('accounts', ['fail_n' => 0, 'lock_until' => 0, 'last_login_at' => linea_now()], 'id = ?', [(int)$a['id']]);
    acc_start((int)$a['id'], $role);
    return $a;
}

function acc_start(int $id, string $role): void
{
    acc_session();
    session_regenerate_id(true);
    $_SESSION['acc'] = $id; $_SESSION['role'] = $role; $_SESSION['csrf'] = bin2hex(random_bytes(16));
}

function acc_logout(): void
{
    acc_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'httponly' => true, 'samesite' => 'Strict', 'secure' => $p['secure']]);
    }
    session_destroy();
}

/** Текущий аккаунт нужной роли или null. */
function acc_current(string $role): ?array
{
    acc_session();
    if (($_SESSION['role'] ?? '') !== $role || empty($_SESSION['acc'])) { return null; }
    $a = db_one('SELECT * FROM accounts WHERE id = ? AND role = ?', [(int)$_SESSION['acc'], $role]);
    return $a && $a['status'] === 'active' ? $a : null;
}

/** Токен восстановления пароля (1 час, одноразовый). Возвращает сам токен — только для письма. */
function acc_reset_token(int $accountId): string
{
    $t = bin2hex(random_bytes(24));
    db_exec('UPDATE account_tokens SET used_at = ? WHERE account_id = ? AND purpose = ? AND used_at IS NULL', [linea_now(), $accountId, 'reset']);
    db_insert('account_tokens', ['account_id' => $accountId, 'hash' => hash('sha256', $t), 'purpose' => 'reset', 'expires_at' => time() + 3600]);
    return $t;
}

/** Новый пароль по токену. @return id аккаунта или строка-ошибка. */
function acc_reset_apply(string $token, string $password)
{
    if (!preg_match('/^[0-9a-f]{48}$/', $token)) { return 'Ссылка устарела — запросите новую'; }
    $r = db_one('SELECT * FROM account_tokens WHERE hash = ? AND purpose = ?', [hash('sha256', $token), 'reset']);
    if (!$r || $r['used_at'] || (int)$r['expires_at'] < time()) { return 'Ссылка устарела — запросите новую'; }
    if ($e = acc_password_ok($password)) { return $e; }
    db_tx(function () use ($r, $password) {
        db_update('account_tokens', ['used_at' => linea_now()], 'id = ?', [(int)$r['id']]);
        db_update('accounts', ['pass_hash' => password_hash($password, PASSWORD_DEFAULT), 'fail_n' => 0, 'lock_until' => 0], 'id = ?', [(int)$r['account_id']]);
    });
    return (int)$r['account_id'];
}
