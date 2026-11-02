<?php
/**
 * Закрытая страница заказов LINEA: api/admin.php
 *   список заказов, карточка заказа с брифом и историей, скачать архив брифа, выставить сумму и вид,
 *   отметить «счёт выставлен» / «оплачен» (кто и когда) / «выдан» (ссылка на альбом), отменить, удалить тестовый.
 *
 * Вход — пароль (password_verify с admin_hash из linea-private/config.php; сам пароль — у Александра в
 * ~/.claude/secrets/linea-admin.env). Basic Auth не используем: на Beget CGI заголовок Authorization до PHP не доходит.
 * Сессия — cookie HttpOnly + SameSite=Strict (+ Secure на https), CSRF-токен на каждое действие,
 * после 5 неудачных входов с адреса — пауза 15 минут.
 * 🔴 Проект в конвейер (clients/<slug>) брать только из заказов со статусом «оплачен».
 *
 * Второй фактор (02.11.2026): после верного пароля — код на почту владельца (config admin_emails), 10 минут, 5 попыток, не больше 5 кодов в час.
 * «Доверять этому устройству 30 дней» — кука linea_adm_dev (в базе только sha256, таблица adm_devices). Аварийный вход без кода — только
 * с адресов config admin_emergency_ips (запись в журнал). Режим — config admin_2fa: 'auto' (по умолчанию: включён, когда заданы admin_emails
 * и письма работают — brig_mail_enabled), true — всегда, false — выключен (только пароль).
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:");

$cfg = linea_cfg();
$https = linea_https();
// Пароль и сессионная кука по открытому каналу не ходят (второй круг критиков 27.10.2026): по http страница заказов закрыта
// целиком — до session_start, чтобы кука даже не выдавалась. Исключение — проверка на маке (php -S 127.0.0.1).
if (!$https && !linea_local()) {
    http_response_code(403);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Только https — LINEA</title></head>'
        . '<body style="font:16px/1.5 sans-serif;max-width:640px;margin:40px auto;padding:0 16px"><h1>Страница заказов — только по https</h1>'
        . '<p>По незащищённому адресу пароль и данные заказов не передаём. Откройте страницу на домене с SSL.</p></body></html>';
    exit;
}
linea_mkdir(linea_private() . '/sessions');
// На Beget по умолчанию свой обработчик сессий (save_handler=beget, путь tcp://127.0.0.1:6380): с путём-папкой он молча
// ничего не сохраняет, и вход по паролю зацикливается. Сессии — файлами в linea-private/sessions (вне веб-корня).
ini_set('session.save_handler', 'files');
session_save_path(linea_private() . '/sessions');
session_name('linea_adm');
session_set_cookie_params(['lifetime' => 0, 'path' => dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/api/admin.php')) . '/', 'httponly' => true, 'samesite' => 'Strict', 'secure' => $https]);
session_start();

$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
$rub = fn($kop) => $kop === null || $kop === '' ? '—' : number_format((int)$kop / 100, 0, ',', ' ') . ' ₽';
$self = basename(__FILE__);

/**
 * Неудачные входы: файл с отметками времени за 15 минут. $global = true — общий счётчик со всех адресов
 * (перебор пароля с множества адресов: после admin_fail_global неудач за 15 минут вход закрыт для всех).
 */
function adm_fails(bool $add = false, bool $global = false): int
{
    $dir = linea_private() . '/rate';
    linea_mkdir($dir);
    $f = $dir . '/login-' . ($global ? 'all' : substr(hash('sha256', linea_ip() . '|adm'), 0, 24));
    $list = is_file($f) ? array_filter(array_map('intval', explode("\n", (string)file_get_contents($f))), fn($t) => $t > time() - 900) : [];
    if ($add) { $list[] = time(); }
    file_put_contents($f, implode("\n", $list), LOCK_EX);
    return count($list);
}

function page(string $title, string $body): never
{
    echo '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<meta name="robots" content="noindex,nofollow"><title>' . htmlspecialchars($title) . ' — LINEA</title><style>'
        . 'body{font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f4f2ee;color:#1d1b18}main{max-width:1180px;margin:0 auto;padding:20px 16px}'
        . 'h1{font-size:22px;margin:0 0 14px}table{width:100%;border-collapse:collapse;background:#fff}th,td{padding:8px 10px;border-bottom:1px solid #e3ded4;text-align:left;vertical-align:top;font-size:14px}'
        . 'th{background:#ebe6dc;font-weight:600}a{color:#8a5a12}.st{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;background:#eee}'
        . '.st-awaiting_payment{background:#fbe7c4}.st-paid{background:#cfe9d5}.st-delivered{background:#d6e4f5}.st-cancelled{background:#e6e6e6;color:#777}'
        . '.box{background:#fff;padding:14px 16px;margin:0 0 14px;border:1px solid #e3ded4}form.inl{display:inline-flex;gap:6px;margin:4px 8px 4px 0;align-items:center;flex-wrap:wrap}'
        . 'input,select,button{font:inherit;padding:5px 8px}button{cursor:pointer;background:#1d1b18;color:#fff;border:0;border-radius:3px}button.lt{background:#ddd;color:#222}'
        . '.test{color:#b4462b;font-weight:600}.mut{color:#777;font-size:13px}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}'
        . 'pre{white-space:pre-wrap;background:#faf8f4;padding:10px;font-size:13px;max-height:420px;overflow:auto}.msg{background:#fff6d8;padding:8px 12px;margin:0 0 12px}'
        . '@media(max-width:760px){.hide-m{display:none}}</style></head><body><main>' . $body . '</main></body></html>';
    exit;
}

// ── второй фактор: код на почту владельца после пароля; доверенное устройство 30 дней; аварийный вход — белый список IP
const ADM_DEV_COOKIE = 'linea_adm_dev';
const ADM_DEV_DAYS = 30;

/** Нужен ли код после пароля: режим admin_2fa, аварийный адрес, доверенное устройство. @return [нужен, почему нет] */
function adm_2fa_need(array $cfg): array
{
    $mode = $cfg['admin_2fa'] ?? 'auto';
    $emails = array_values(array_filter(array_map('trim', (array)($cfg['admin_emails'] ?? [])), fn($e) => filter_var($e, FILTER_VALIDATE_EMAIL)));
    if ($mode === false || $mode === 'off') { return [false, 'выключен (admin_2fa = false)']; }
    if ($mode === 'auto' && (!$emails || empty($cfg['brig_mail_enabled']))) { return [false, 'выключен: нет admin_emails или писем (brig_mail_enabled)']; }
    if (in_array(linea_ip(), (array)($cfg['admin_emergency_ips'] ?? []), true)) { return [false, 'аварийный вход с адреса из admin_emergency_ips']; }
    $tok = (string)($_COOKIE[ADM_DEV_COOKIE] ?? '');
    // С6: доверенное устройство привязано к текущему паролю (pw_tag) — смена admin_hash гасит все запомненные устройства
    if (preg_match('/^[0-9a-f]{64}$/', $tok) && db_val('SELECT 1 FROM adm_devices WHERE token_hash = ? AND ended_at IS NULL AND expires_at > ? AND pw_tag = ?', [hash('sha256', $tok), time(), adm_pw_tag($cfg)])) {
        return [false, 'доверенное устройство'];
    }
    return [true, ''];
}

/** Метка текущего пароля админки для доверенных устройств (С6). */
function adm_pw_tag(array $cfg): string { return substr(hash('sha256', 'adm-dev|' . (string)($cfg['admin_hash'] ?? '')), 0, 16); }

/**
 * Отправить код (каждому адресу admin_emails). С6: результат отправки проверяется — если ни одно письмо не ушло, вход не «зависает»
 * на экране кода без кода: страница говорит об этом прямо и показывает аварийный путь.
 * @return array{dev:string, sent:bool}  dev — код только для проверки на маке
 */
function adm_2fa_send(array $cfg): array
{
    $code = (string)random_int(100000, 999999);
    $_SESSION['adm_code'] = ['h' => hash_hmac('sha256', $code, (string)$_SESSION['adm_salt']), 'exp' => time() + 600, 'tries' => 0];
    require_once __DIR__ . '/lib/brig-notify.php';
    $sent = 0;
    foreach ((array)($cfg['admin_emails'] ?? []) as $e) {
        $r = brig_mail(trim((string)$e), 'admin_code', ['code' => $code, 'ip' => linea_ip()], false);
        // 'dry' — письма выключены (brig_mail_enabled) или адрес негодный: доставкой не считается, кроме проверки на маке
        if ($r === 'sent' || ($r === 'dry' && linea_local() && getenv('LINEA_MAIL_DRY') && filter_var(trim((string)$e), FILTER_VALIDATE_EMAIL))) { $sent++; }
    }
    linea_log('admin.log', 'код второго шага: ' . ($sent ? 'отправлен на ' . $sent . ' адрес(а)' : 'НЕ ОТПРАВЛЕН — почта не приняла письмо') . ' (' . substr(hash('sha256', linea_ip()), 0, 10) . ')');
    if (!$sent) {
        linea_log('error.log', 'admin 2fa: письмо с кодом не ушло ни на один адрес admin_emails');
        try { brig_tg('LINEA: письмо с кодом входа в админку не ушло — проверьте почту сервера', false); } catch (Throwable $e) { }
    }
    return ['dev' => linea_local() && getenv('LINEA_MAIL_DRY') && $sent ? $code : '', 'sent' => $sent > 0];
}

function adm_enter(string $how): never
{
    session_regenerate_id(true);
    unset($_SESSION['adm_pending'], $_SESSION['adm_code'], $_SESSION['adm_salt'], $_SESSION['adm_sent'], $_SESSION['adm_dev']);
    $_SESSION['adm'] = 1; $_SESSION['csrf'] = bin2hex(random_bytes(16));
    linea_log('admin.log', 'вход: ' . $how . ' (' . substr(hash('sha256', linea_ip()), 0, 10) . ')');
    header('Location: panel.php'); exit;   // после входа — новая админка (дашборд «Требует действия»)
}

// ── вход
// С-6: адреса владельца (config admin_ip_allow) не блокируются счётчиками неудач; общий счётчик со всех адресов вход не закрывает,
// а замедляет ответ (иначе 30 запросов с разных адресов выключали вход и владельцу)
$ownerIp = in_array(linea_ip(), (array)($cfg['admin_ip_allow'] ?? []), true);
if (($_GET['step'] ?? '') === 'restart' && empty($_SESSION['adm'])) { session_destroy(); header('Location: ' . $self); exit; }
if (empty($_SESSION['adm']) && !empty($_SESSION['adm_pending'])) {
    $err = '';
    linea_schema();
    if (time() - (int)$_SESSION['adm_pending'] > 900) { session_destroy(); header('Location: ' . $self); exit; }   // 15 минут на второй шаг
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && isset($_POST['code'])) {
        $c = $_SESSION['adm_code'] ?? null;
        if (!$c || $c['exp'] < time()) { $err = 'Код устарел — войдите заново.'; session_destroy(); session_start(); }
        elseif ($c['tries'] >= 5) { $err = 'Попытки закончились — войдите заново.'; session_destroy(); session_start(); }
        else {
            $_SESSION['adm_code']['tries']++;
            if (hash_equals((string)$c['h'], hash_hmac('sha256', preg_replace('/\D/', '', (string)$_POST['code']) ?? '', (string)$_SESSION['adm_salt']))) {
                if (!empty($_POST['trust'])) {   // доверенное устройство: в куке — случайный токен, в базе — его sha256
                    $tok = bin2hex(random_bytes(32));
                    db_insert('adm_devices', ['token_hash' => hash('sha256', $tok), 'created_at' => linea_now(), 'expires_at' => time() + ADM_DEV_DAYS * 86400, 'ip' => linea_ip(), 'pw_tag' => adm_pw_tag($cfg),
                        'ua' => mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 180)]);
                    setcookie(ADM_DEV_COOKIE, $tok, ['expires' => time() + ADM_DEV_DAYS * 86400, 'path' => dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/api/admin.php')) . '/', 'httponly' => true, 'samesite' => 'Strict', 'secure' => $https]);
                }
                adm_enter('пароль + код на почту' . (!empty($_POST['trust']) ? ', устройство запомнено на ' . ADM_DEV_DAYS . ' дней' : ''));
            }
            adm_fails(true); usleep(300000);
            $err = 'Неверный код.';
        }
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && isset($_POST['resend'])) {
        if (!linea_rate('adm2fa-send', 5)) { $err = 'Слишком много кодов за час — подождите.'; }
        else { $r = adm_2fa_send($cfg); $_SESSION['adm_dev'] = $r['dev']; $_SESSION['adm_sent'] = $r['sent']; $err = $r['sent'] ? 'Новый код отправлен.' : ''; }
    }
    $dev = (string)($_SESSION['adm_dev'] ?? '');
    if (empty($_SESSION['adm_sent'])) {
        // С6: письмо не ушло — не держим владельца на экране кода без кода: прямо говорим и показываем аварийный путь
        page('Вход: код не отправлен', '<h1>LINEA · второй шаг входа</h1>' . ($err ? '<p class="msg">' . $h($err) . '</p>' : '')
            . '<p class="msg" id="mailfail">Письмо с кодом не ушло: почта сервера не приняла его. Пароль верный, вход не заблокирован.</p>'
            . '<div class="box"><p><b>Как войти сейчас:</b></p><ol>'
            . '<li>Повторить отправку через минуту (кнопка ниже) — если сбой почты разовый.</li>'
            . '<li>Войти с аварийного адреса (config <code>admin_emergency_ips</code>) или с доверенного устройства — код не нужен.</li>'
            . '<li>Временно выключить второй шаг: в <code>linea-private/config.php</code> поставить <code>\'admin_2fa\' => false</code> по SSH (копия config — <code>tools/otkat-config.sh</code> возвращает прежнюю). После починки почты — вернуть.</li>'
            . '</ol><form method="post" class="inl"><button name="resend" value="1">Отправить код ещё раз</button></form></div>'
            . '<p class="mut"><a href="' . $self . '?step=restart">Начать вход заново</a></p>');
    }
    page('Вход: код', '<h1>LINEA · второй шаг входа</h1><p>Код отправлен на почту владельца (' . count((array)($cfg['admin_emails'] ?? [])) . ' адрес). Действует 10 минут.</p>'
        . ($err ? '<p class="msg">' . $h($err) . '</p>' : '') . ($dev !== '' ? '<p class="mut" id="devcode">проверка на маке: ' . $h($dev) . '</p>' : '')
        . '<form method="post" class="box"><label>Код <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,8}" autofocus required></label> '
        . '<label><input type="checkbox" name="trust" value="1"> доверять этому устройству ' . ADM_DEV_DAYS . ' дней</label> <button>Войти</button></form>'
        . '<p class="mut"><a href="' . $self . '?step=restart">Начать вход заново</a></p>');
}
if (empty($_SESSION['adm'])) {
    $err = '';
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && isset($_POST['password'])) {
        if ((string)$cfg['admin_hash'] === '') { $err = 'Пароль не настроен: admin_hash в linea-private/config.php пуст.'; }
        elseif (!$ownerIp && adm_fails() >= 5) { $err = 'Слишком много неудачных попыток — подождите 15 минут.'; }
        elseif (password_verify((string)$_POST['password'], (string)$cfg['admin_hash'])) {
            linea_schema();
            [$need2, $why2] = adm_2fa_need($cfg);
            if (!$need2) { adm_enter('пароль; второй шаг: ' . $why2); }
            session_regenerate_id(true);
            $_SESSION = ['adm_pending' => time(), 'adm_salt' => bin2hex(random_bytes(16))];
            if (!linea_rate('adm2fa-send', 5)) { $err = 'Слишком много кодов за час — подождите.'; }
            else { $r = adm_2fa_send($cfg); $_SESSION['adm_dev'] = $r['dev']; $_SESSION['adm_sent'] = $r['sent']; header('Location: ' . $self . '?step=code'); exit; }
        } else {
            adm_fails(true);
            $g = adm_fails(true, true);
            if ($g >= (int)$cfg['admin_fail_global']) { linea_log('error.log', 'admin: много неудачных входов со всех адресов (' . $g . ' за 15 мин) — ответы замедлены'); sleep(2); }
            usleep(400000); $err = 'Неверный пароль.';
        }
    }
    page('Вход', '<h1>LINEA · заказы</h1>' . ($err ? '<p class="msg">' . $h($err) . '</p>' : '')
        . '<form method="post" class="box"><label>Пароль <input type="password" name="password" autocomplete="current-password" autofocus required></label> <button>Войти</button></form>');
}

$db = linea_db();
linea_schema();
require_once __DIR__ . '/lib/yookassa.php';
$csrf = (string)$_SESSION['csrf'];
$msg = '';

// ── скачать архив брифа (из linea-private, не из веб-корня)
if (isset($_GET['dl'])) {
    $o = linea_order_by_number((string)$_GET['dl']);
    $f = $o ? linea_private() . '/orders/' . $o['number'] . '/brief.zip' : '';
    if (!$o || !is_file($f)) { http_response_code(404); page('Нет файла', '<p>Архив не найден.</p><p><a href="' . $self . '">← заказы</a></p>'); }
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="LINEA-' . $o['number'] . '.zip"');
    header('Content-Length: ' . filesize($f));
    readfile($f); exit;
}

// ── действия
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if (!hash_equals($csrf, (string)($_POST['csrf'] ?? ''))) { http_response_code(400); page('Ошибка', '<p>Форма устарела — обновите страницу.</p>'); }
    $act = (string)($_POST['act'] ?? '');
    if ($act === 'logout') { session_destroy(); header('Location: ' . $self); exit; }
    $o = linea_order_by_number((string)($_POST['number'] ?? ''));
    $who = linea_str($_POST['who'] ?? '', 60) ?: 'Александр';
    $now = linea_now();
    $upd = function (string $sql, array $args) use ($db, $o, $now) { $db->prepare('UPDATE orders SET ' . $sql . ', updated_at = ? WHERE id = ?')->execute(array_merge($args, [$now, $o['id']])); };
    if ($o) {
        switch ($act) {
            case 'amount':
                $kop = (int)round((float)str_replace([' ', ','], ['', '.'], (string)$_POST['rub']) * 100);
                $kind = isset(LINEA_KINDS[$_POST['kind'] ?? '']) ? (string)$_POST['kind'] : $o['kind'];
                // сумму выставил администратор — она подтверждена по плану: онлайн-оплата открыта (В-3)
                $upd('amount_kop = ?, kind = ?, amount_confirmed_at = ?', [$kop > 0 ? $kop : null, $kind, $kop > 0 ? $now : null]);
                linea_event((int)$o['id'], $who, 'Сумма: ' . $rub($kop > 0 ? $kop : null) . ', вид: ' . LINEA_KINDS[$kind] . ($kop > 0 ? ' — подтверждена' : ''));
                // сумма изменилась — старая ссылка на оплату больше не выдаётся; платёж по ней отменяется в ЮKassa, если это возможно (В-4),
                // а его id запоминается: если клиент всё же оплатит по старой ссылке, вебхук узнает платёж и поднимет тревогу
                if ((int)$o['amount_kop'] !== $kop && $o['payment_id']) {
                    $why = yk_cancel_stale((string)$o['payment_id']);
                    $upd('payment_ids_old = ?, payment_id = NULL, payment_url = NULL, payment_created_at = NULL', [trim((string)$o['payment_ids_old'] . ' ' . $o['payment_id'])]);
                    linea_event((int)$o['id'], $who, 'Ссылка на оплату по прежней сумме сброшена (платёж ' . $o['payment_id'] . ': ' . $why . ')');
                }
                $msg = 'Сумма сохранена.'; break;
            case 'confirm_amount':   // В-3: сумма сверена с планом — онлайн-оплата открыта
                if ((int)$o['amount_kop'] <= 0) { $msg = 'Сначала выставьте сумму.'; break; }
                $upd('amount_confirmed_at = ?, area_mismatch = 0', [$now]);
                linea_event((int)$o['id'], $who, 'Сумма подтверждена по плану: ' . $rub($o['amount_kop']));
                $msg = 'Сумма подтверждена — клиент может оплатить онлайн.'; break;
            case 'pay_checked':   // В-4: тревога по оплате разобрана
                $upd('pay_alert_at = NULL', []);
                linea_event((int)$o['id'], $who, 'Тревога по оплате разобрана: ' . (linea_str($_POST['note'] ?? '', 200) ?: 'без комментария'));
                $msg = 'Отметка «нужна проверка» снята.'; break;
            case 'invoice':
                $upd("invoice_at = ?, status = CASE WHEN status = 'new' THEN 'awaiting_payment' ELSE status END", [$now]);
                linea_event((int)$o['id'], $who, 'Счёт выставлен');
                $msg = 'Отмечено: счёт выставлен.'; break;
            case 'paid':
                if ((int)$o['amount_kop'] <= 0) { $msg = 'Сначала выставьте сумму.'; break; }
                $upd("status = 'paid', paid_at = ?, paid_by = ?", [$now, 'вручную: ' . $who . ' ' . date('d.m.Y H:i')]);
                linea_event((int)$o['id'], $who, 'Оплата отмечена вручную: ' . $rub($o['amount_kop']));
                $msg = 'Заказ оплачен — срок отсчитывается с этого момента.'; break;
            case 'delivered':
                $url = linea_str($_POST['url'] ?? '', 300);
                if ($o['status'] !== 'paid' && $o['status'] !== 'delivered') { $msg = 'Выдать можно только оплаченный заказ.'; break; }
                $upd("status = 'delivered', delivered_at = ?, delivered_url = ?", [$now, $url]);
                linea_event((int)$o['id'], $who, 'Альбом выдан: ' . $url);
                $msg = 'Отмечено: выдан.';
                $rc = yk_full_receipt(linea_order_by_number((string)$o['number']), $who);   // 54-ФЗ: чек «полный расчёт» (при yk_receipt)
                if ($rc['done']) { $msg .= ' Второй чек «полный расчёт» отправлен.'; } elseif (!$rc['ok']) { $msg .= ' Второй чек не ушёл: ' . $rc['why']; }
                break;
            case 'cancel':
                $upd("status = 'cancelled'", []);
                linea_event((int)$o['id'], $who, 'Заказ отменён');
                $msg = 'Заказ отменён.'; break;
            case 'reopen':
                $upd("status = 'awaiting_payment'", []);
                linea_event((int)$o['id'], $who, 'Заказ снова ждёт оплаты');
                $msg = 'Заказ снова ждёт оплаты.'; break;
            case 'delete_test':
                if (!$o['test']) { $msg = 'Удалять можно только тестовые заказы.'; break; }
                $dir = linea_private() . '/orders/' . $o['number'];
                foreach (glob($dir . '/*') ?: [] as $f) { @unlink($f); }
                @rmdir($dir);
                $db->prepare('DELETE FROM orders WHERE id = ?')->execute([$o['id']]);
                linea_log('orders.log', 'deleted test ' . $o['number']);
                $msg = 'Тестовый заказ ' . $o['number'] . ' удалён.'; $o = null; break;
        }
    }
    $_SESSION['msg'] = $msg;
    header('Location: ' . $self . ($o && $act !== 'delete_test' ? '?o=' . rawurlencode($o['number']) : '')); exit;
}
if (!empty($_SESSION['msg'])) { $msg = (string)$_SESSION['msg']; unset($_SESSION['msg']); }

$form = fn(string $act, string $num, string $inner, string $btn, string $cls = '') =>
    '<form method="post" class="inl"><input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="act" value="' . $act . '">'
    . '<input type="hidden" name="number" value="' . $h($num) . '">' . $inner . '<button' . ($cls ? ' class="' . $cls . '"' : '') . '>' . $btn . '</button></form>';
$top = '<div class="top"><h1>LINEA · заказы</h1><div><a href="' . $self . '">Заказы</a> · <a href="' . $self . '?view=reviews">Правки</a> · <a href="admin-brigady.php">Ремонт и бригады</a> · режим оплаты: <b>'
    . $h($cfg['mode']) . '</b> <form method="post" class="inl"><input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="act" value="logout"><button class="lt">Выйти</button></form></div></div>'
    . ($msg ? '<p class="msg">' . $h($msg) . '</p>' : '');

// ── правки к листам
if (($_GET['view'] ?? '') === 'reviews') {
    $files = glob(linea_private() . '/reviews/*/*.json') ?: [];
    usort($files, fn($a, $b) => filemtime($b) <=> filemtime($a));
    $rows = '';
    foreach (array_slice($files, 0, 100) as $f) {
        $r = json_decode((string)file_get_contents($f), true) ?: [];
        $txt = implode("\n", array_map(fn($n) => ($n['file'] ?? '') . ' · ' . ($n['n'] ?? '') . ') ' . ($n['text'] ?? ''), $r['notes'] ?? []));
        $rows .= '<tr><td>' . $h($r['number'] ?? '') . ($r['test'] ?? false ? ' <span class="test">тест</span>' : '') . '<div class="mut">' . $h($r['at'] ?? '') . '</div></td><td>' . $h($r['project'] ?? '')
            . '<div class="mut">' . $h($r['order'] ?? '') . '</div></td><td>' . $h(($r['from'] ?? '') . ' ' . ($r['phone'] ?? '')) . '</td><td><pre>' . $h($txt) . '</pre></td></tr>';
    }
    page('Правки', $top . '<table><tr><th>Номер</th><th>Проект</th><th>От кого</th><th>Правки</th></tr>' . ($rows ?: '<tr><td colspan="4">Правок пока нет.</td></tr>') . '</table>');
}

// ── карточка заказа
if (isset($_GET['o']) && ($o = linea_order_by_number((string)$_GET['o']))) {
    $bf = linea_private() . '/orders/' . $o['number'] . '/brief.json';
    $b = is_file($bf) ? (json_decode((string)file_get_contents($bf), true) ?: []) : [];
    $ev = $db->prepare('SELECT at, who, text FROM events WHERE order_id = ? ORDER BY id');
    $ev->execute([$o['id']]);
    $events = implode('', array_map(fn($e) => '<tr><td class="mut">' . $h($e['at']) . '</td><td>' . $h($e['who']) . '</td><td>' . $h($e['text']) . '</td></tr>', $ev->fetchAll()));
    $kinds = implode('', array_map(fn($k, $t) => '<option value="' . $k . '"' . ($k === $o['kind'] ? ' selected' : '') . '>' . $h($t) . '</option>', array_keys(LINEA_KINDS), LINEA_KINDS));
    $who = '<input name="who" value="Александр" size="10" title="Кто отмечает">';
    $acts = $form('amount', $o['number'], '<select name="kind">' . $kinds . '</select><input name="rub" size="8" placeholder="сумма, ₽" value="' . ($o['amount_kop'] ? (int)$o['amount_kop'] / 100 : '') . '">' . $who, 'Сохранить сумму')
        . ($o['amount_kop'] && !$o['amount_confirmed_at'] && $o['status'] === 'awaiting_payment' ? $form('confirm_amount', $o['number'], $who, 'Сумма подтверждена по плану') : '')
        . ($o['pay_alert_at'] ? $form('pay_checked', $o['number'], '<input name="note" size="24" placeholder="что сделано (возврат, доплата…)">' . $who, 'Проверено') : '')
        . $form('invoice', $o['number'], $who, 'Счёт выставлен', 'lt')
        . ($o['status'] === 'awaiting_payment' || $o['status'] === 'new' ? $form('paid', $o['number'], $who, 'Оплачен') : '')
        . ($o['status'] === 'paid' || $o['status'] === 'delivered' ? $form('delivered', $o['number'], '<input name="url" size="30" placeholder="ссылка на альбом" value="' . $h($o['delivered_url']) . '">' . $who, 'Выдан') : '')
        . ($o['status'] !== 'cancelled' ? $form('cancel', $o['number'], $who, 'Отменить', 'lt') : $form('reopen', $o['number'], $who, 'Вернуть в «ждёт оплаты»', 'lt'))
        . ($o['test'] ? $form('delete_test', $o['number'], '', 'Удалить тестовый заказ', 'lt') : '');
    $base = linea_base();
    page($o['number'], $top . '<div class="box"><h2 style="margin:0 0 6px">' . $h($o['number']) . ' <span class="st st-' . $h($o['status']) . '">' . $h(LINEA_STATUS[$o['status']] ?? $o['status']) . '</span>'
        . ($o['test'] ? ' <span class="test">ТЕСТ</span>' : '') . ($o['pay_alert_at'] ? ' <span class="test">НУЖНА ПРОВЕРКА ОПЛАТЫ</span>' : '') . '</h2>'
        . ($o['status'] === 'awaiting_payment' && !linea_amount_ok($o) ? '<p class="msg">Онлайн-оплата закрыта, пока сумма не подтверждена по плану' . ($o['area_mismatch'] ? ' (площадь в брифе расходится с суммой площадей помещений)' : '') . '. Клиент видит: «сумму подтвердим по плану в течение рабочего дня».</p>' : '')
        . '<p>' . $h(LINEA_KINDS[$o['kind']] ?? $o['kind']) . ' · ' . $h($o['object_type']) . ($o['area'] ? ', ' . $h($o['area']) . ' м²' : '') . ' · сумма <b>' . $rub($o['amount_kop']) . '</b>'
        . ($o['paid_at'] ? ' · оплачен ' . $h($o['paid_at']) . ' (' . $h($o['paid_by']) . ')' : '') . '</p>'
        . '<p>' . $h($o['name']) . ' · ' . $h($o['phone']) . ' · ' . $h($o['email']) . ($o['contact'] ? ' · связь: ' . $h($o['contact']) : '') . '</p>'
        . '<p class="mut">Создан ' . $h($o['created_at']) . ' · согласие на обработку данных ' . $h($o['consent_at']) . ' · файлов ' . (int)$o['files_count'] . ', ' . round((int)$o['files_bytes'] / 1048576, 1) . ' МБ · '
        . '<a href="' . $self . '?dl=' . rawurlencode($o['number']) . '">скачать архив брифа</a> · <a href="' . $h($base . '/order.html?t=' . $o['token']) . '" target="_blank" rel="noopener">страница клиента</a></p>'
        . $acts . '</div>'
        . '<div class="box"><b>Бриф</b><pre>' . $h(json_encode($b, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)) . '</pre></div>'
        . '<div class="box"><b>История</b><table>' . $events . '</table></div>');
}

// ── список
$f = (string)($_GET['f'] ?? '');
$where = isset(LINEA_STATUS[$f]) ? 'WHERE status = ' . $db->quote($f) : '';
$rows = '';
foreach ($db->query('SELECT * FROM orders ' . $where . ' ORDER BY id DESC LIMIT 300') as $o) {
    $rows .= '<tr><td><a href="' . $self . '?o=' . rawurlencode($o['number']) . '">' . $h($o['number']) . '</a>' . ($o['test'] ? ' <span class="test">тест</span>' : '') . '</td>'
        . '<td class="hide-m">' . $h(substr((string)$o['created_at'], 0, 16)) . '</td><td>' . $h($o['name']) . '<div class="mut">' . $h($o['phone']) . ' ' . $h($o['email']) . '</div></td>'
        . '<td class="hide-m">' . $h(LINEA_KINDS[$o['kind']] ?? $o['kind']) . ($o['area'] ? ', ' . $h($o['area']) . ' м²' : '') . '</td>'
        . '<td><span class="st st-' . $h($o['status']) . '">' . $h(LINEA_STATUS[$o['status']] ?? $o['status']) . '</span>' . (!empty($o['pay_alert_at']) ? ' <span class="test">проверить оплату</span>' : '') . '</td><td>' . $rub($o['amount_kop']) . '</td>'
        . '<td><a href="' . $self . '?dl=' . rawurlencode($o['number']) . '">архив</a></td></tr>';
}
$filters = '<p>' . implode(' · ', array_merge(['<a href="' . $self . '">все</a>'], array_map(fn($k, $t) => '<a href="' . $self . '?f=' . $k . '">' . $h($t) . '</a>', array_keys(LINEA_STATUS), LINEA_STATUS))) . '</p>';
page('Заказы', $top . $filters . '<table><tr><th>Номер</th><th class="hide-m">Дата</th><th>Клиент</th><th class="hide-m">Вид</th><th>Статус</th><th>Сумма</th><th></th></tr>'
    . ($rows ?: '<tr><td colspan="7">Заказов пока нет.</td></tr>') . '</table><p class="mut">В работу (clients/&lt;slug&gt;) — только заказы со статусом «Оплачен».</p>');
