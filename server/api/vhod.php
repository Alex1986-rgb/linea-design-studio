<?php
/**
 * api/vhod.php — единый вход кодом на почту для всех ролей (клиент, бригада, админ), спецификация 3.0 и 4А.1.
 *   GET  ?a=me                         — состояние сессии: роль, роли почты, свежесть кода, гостевой заказ, csrf
 *   POST ?a=code   {email}             — отправить код (ответ всегда одинаковый); {guest:true} — на почту гостевого заказа
 *   POST ?a=verify {email, code, remember} — войти: одна роль → сразу; несколько → {choose:[…]}
 *   POST ?a=role   {role}              — выбрать/переключить роль без повторного кода (client | brigade | admin)
 *   POST ?a=link   {t}                 — старая ссылка order.html?t=: кабинет своего заказа или гостевая сессия на 12 часов
 *   POST ?a=logout {all?}              — выйти (all — на всех устройствах аккаунта)
 * Только https (кроме проверки на маке). CSRF — заголовок X-CSRF из ?a=me.
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/kabinet.php';

brig_https();
brig_db();
acc_session();
$a = (string)($_GET['a'] ?? 'me');

function vh_state(): array
{
    $c = kab_client();
    $g = kab_guest_order();
    $roles = array_keys($_SESSION['roles'] ?? []);
    $role = (string)($_SESSION['role'] ?? '');
    $email = (string)($_SESSION['email'] ?? '');
    return ['ok' => true, 'csrf' => acc_csrf_token(), 'auth' => (bool)($c || $role === 'brigade'), 'role' => $role ?: null, 'roles' => $roles,
        'email' => $email !== '' ? preg_replace('/^(.).*(@.*)$/u', '$1•••$2', $email) : null, 'fresh' => kab_fresh(),
        'guest' => $g ? ['number' => $g['number'], 'hasEmail' => kab_email_ok((string)$g['email']), 'email' => kab_email_ok((string)$g['email']) ? preg_replace('/^(.).*(@.*)$/u', '$1•••$2', (string)$g['email']) : null] : null,
        'name' => $c ? (string)$c['name'] : null];
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') { linea_json(vh_state()); }
brig_method('POST');
acc_csrf_check();
$in = brig_input();

switch ($a) {
    case 'code': {
        $g = kab_guest_order();
        $email = mb_strtolower(trim((string)($in['email'] ?? '')));
        $allowUnknown = false;
        if (!empty($in['guest']) && $g) {
            if (kab_email_ok((string)$g['email'])) { $email = mb_strtolower((string)$g['email']); $allowUnknown = true; }
            elseif (kab_email_ok($email)) { $_SESSION['guest_email'] = $email; $allowUnknown = true; }   // заказ без почты: привязка после кода
        }
        $dev = kab_code_send($email, $allowUnknown);
        linea_json(['ok' => true, 'sent' => true, 'text' => 'Если эта почта есть у нас, код уже в письме. Проверьте «Спам», если письма нет 2 минуты.'] + ($dev !== '' ? ['devCode' => $dev] : []));
    }
    case 'verify': {
        $g = kab_guest_order();
        $email = mb_strtolower(trim((string)($in['email'] ?? '')));
        if (!empty($in['guest']) && $g) { $email = kab_email_ok((string)$g['email']) ? mb_strtolower((string)$g['email']) : (string)($_SESSION['guest_email'] ?? $email); }
        if (!kab_email_ok($email)) { linea_fail('Проверьте адрес почты'); }
        $r = kab_code_check($email, (string)($in['code'] ?? ''));
        if ($r !== true) { linea_fail($r, 400); }
        // гостевой заказ без почты: подтверждённая почта становится почтой заказа
        if ($g && !kab_email_ok((string)$g['email']) && ($_SESSION['guest_email'] ?? '') === $email) {
            db_update('orders', ['email' => $email, 'updated_at' => linea_now()], 'id = ? AND (email IS NULL OR email = \'\')', [(int)$g['id']]);
            linea_event((int)$g['id'], 'client', 'Почта заказа подтверждена кодом в кабинете');
        }
        if ($g && mb_strtolower((string)db_val('SELECT email FROM orders WHERE id = ?', [(int)$g['id']])) === $email) { kab_client_account($email, (bool)$g['test'], (string)$g['name'], (string)$g['phone']); }
        $roles = kab_roles_for($email);
        if (!$roles) { linea_fail('Для этой почты нет ни заказов, ни кабинета бригады. Заполните бриф — кабинет появится сам', 404); }
        kab_login($email, $roles, !empty($in['remember']));
        brig_audit('client:' . substr(hash('sha256', $email), 0, 10), 'login-code', '', implode(',', array_keys($roles)));
        if (count($roles) === 1) {
            $role = array_key_first($roles);
            kab_set_role($role);
            linea_json(vh_state() + ['go' => $role]);
        }
        linea_json(vh_state() + ['choose' => array_keys($roles)]);
    }
    case 'role': {
        $role = (string)($in['role'] ?? '');
        if (empty($_SESSION['roles'])) { linea_fail('Войдите кодом из письма', 401); }
        if ($e = kab_set_role($role)) { linea_fail($e, 403); }
        linea_json(vh_state() + ['go' => $role]);
    }
    case 'link': {
        $t = (string)($in['t'] ?? '');
        $o = linea_order_by_token($t);
        if (!$o) { linea_fail('Ссылка устарела — войдите по почте', 404); }
        $c = kab_client();
        if ($c && (int)$o['account_id'] === (int)$c['id']) { linea_json(vh_state() + ['number' => $o['number']]); }
        // гостевая сессия: один заказ на 12 часов; видеть можно всё, значимые действия — после кода
        if (!$c) { session_regenerate_id(true); }
        $_SESSION['guest_order'] = (int)$o['id']; $_SESSION['guest_at'] = time();
        linea_json(vh_state() + ['number' => $o['number']]);
    }
    case 'logout': {
        $c = kab_client();
        if (!empty($in['all']) && $c) {
            db_exec('UPDATE acc_devices SET ended_at = ? WHERE account_id = ? AND ended_at IS NULL', [linea_now(), (int)$c['id']]);
            brig_audit('client#' . $c['id'], 'logout-all');
        }
        acc_logout();
        linea_json(['ok' => true]);
    }
}
linea_fail('Неизвестное действие', 404);
