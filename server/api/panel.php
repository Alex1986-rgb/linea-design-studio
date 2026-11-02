<?php
/**
 * api/panel.php — админка LINEA одним рабочим местом (спецификация, раздел 5): левое меню, дашборд «Требует действия», заказы проектов
 * (полная карточка: деньги, выпуски, вопросы К-N, правки, лента, документы, служебное), клиенты, заявки по ПДн, сделки (заморозка,
 * отмена), бригады (лестница предупреждений), договоры и подписи (проверка хешей), разногласия (рекомендация со сроком), вознаграждение
 * (проводки, «отложено до ИП»), листы, сигналы, журнал администратора, настройки (brig_terms, реквизиты, праздники).
 * Вход — как admin.php (пароль admin_hash, сессия linea_adm, только https, CSRF). Каждое действие — в журнал br_audit с IP.
 * Модерация анкет и файлов, пакеты и рассылка запросов (лимит invite_max), переписка и итог разногласий — здесь же (действия общие с
 * admin-brigady.php: lib/adm-brigady-act.php). CSV-экспорт (сделки, оплаты, проводки, счета, бригады без ПДн клиентов, сигналы) — с защитой от CSV-инъекций.
 * Права — adm_can($action): сейчас вошедший = администратор; роль «модератор» добавляется без переделки.
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/kabinet.php';
require __DIR__ . '/lib/brigada.php';
require __DIR__ . '/lib/adm-brigady-act.php';

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:");
header('Referrer-Policy: no-referrer');
if (!linea_https() && !linea_local()) { http_response_code(403); header('Content-Type: text/plain; charset=utf-8'); exit('Только по https'); }
linea_mkdir(linea_private() . '/sessions');
ini_set('session.save_handler', 'files');
session_save_path(linea_private() . '/sessions');
session_name('linea_adm');
session_set_cookie_params(['lifetime' => 0, 'path' => dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/api/panel.php')) . '/', 'httponly' => true, 'samesite' => 'Strict', 'secure' => linea_https()]);
session_start();
if (empty($_SESSION['adm'])) { header('Location: admin.php'); exit; }
brig_db();

const ADM_ROLE_RIGHTS = ['moderator' => ['brigade-check', 'brigade-warn', 'signal-mark', 'dispute-msg', 'review-hide']];
/** Право на действие: админ — всё; модератор (будущее) — список ADM_ROLE_RIGHTS. */
function adm_can(string $action): bool
{
    $role = (string)($_SESSION['adm_role'] ?? 'admin');
    return $role === 'admin' || in_array($action, ADM_ROLE_RIGHTS[$role] ?? [], true);
}

$csrf = (string)$_SESSION['csrf'];
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
$rub = fn($kop) => $kop === null || $kop === '' ? '—' : number_format((int)$kop / 100, 0, ',', ' ') . ' ₽';
$d = fn($s) => $s ? date('d.m.Y H:i', strtotime((string)$s)) : '—';
$now = linea_now();
$WHO = 'admin';
$s = (string)($_GET['s'] ?? 'dash');

const ADM_MENU = ['dash' => 'Дашборд', 'orders' => 'Заказы проектов', 'clients' => 'Клиенты', 'pd' => 'Заявки по ПДн', 'deals' => 'Сделки', 'brigades' => 'Бригады', 'requests' => 'Запросы бригадам',
    'contracts' => 'Договоры и подписи', 'disputes' => 'Разногласия', 'money' => 'Деньги и вознаграждение', 'sheets' => 'Листы по запросу', 'signals' => 'Сигналы обхода',
    'audit' => 'Журнал', 'export' => 'Экспорт CSV', 'settings' => 'Настройки'];

function adm_page(string $title, string $body, string $s, string $msg = ''): never
{
    $h = fn($x) => htmlspecialchars((string)$x, ENT_QUOTES, 'UTF-8');
    $cnt = fn(string $q) => (int)db_val($q);
    $badge = ['dash' => 0, 'pd' => $cnt("SELECT COUNT(*) FROM pd_requests WHERE status = 'new'"), 'disputes' => $cnt("SELECT COUNT(*) FROM br_disputes WHERE status <> 'resolved'"),
        'brigades' => $cnt("SELECT COUNT(*) FROM br_brigades WHERE status = 'review'")];
    $menu = '';
    foreach (ADM_MENU as $k => $t) { $menu .= '<a href="panel.php?s=' . $k . '"' . ($k === $s ? ' class="on"' : '') . '>' . $h($t) . (!empty($badge[$k]) ? ' <b>' . $badge[$k] . '</b>' : '') . '</a>'; }
    echo '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">'
        . '<title>' . $h($title) . ' — LINEA · админка</title><style>'
        . ':root{--bg:#f4f2ee;--ink:#1d1b18;--line:#e3ded4;--mut:#777;--acc:#8a5a12}*{box-sizing:border-box}'
        . 'body{font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:var(--bg);color:var(--ink)}a{color:var(--acc)}'
        . '.lay{display:grid;grid-template-columns:230px 1fr;min-height:100vh}nav.side{background:#1d1b18;padding:14px 0;position:sticky;top:0;height:100vh;overflow:auto}'
        . 'nav.side .lg{color:#e8dcc4;font:600 17px/1 Georgia,serif;letter-spacing:4px;padding:6px 18px 16px}nav.side a{display:block;color:#cfc8ba;padding:8px 18px;text-decoration:none;font-size:14px}'
        . 'nav.side a.on,nav.side a:hover{background:#2e2a23;color:#fff}nav.side a b{background:#b4462b;color:#fff;border-radius:9px;padding:0 7px;font-size:12px}'
        . 'main{padding:18px 22px;min-width:0}h1{font-size:21px;margin:0 0 12px}h2{font-size:17px;margin:18px 0 8px}'
        . 'table{width:100%;border-collapse:collapse;background:#fff}th,td{padding:7px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:14px}th{background:#ebe6dc;font-weight:600}'
        . '.box{background:#fff;padding:12px 14px;margin:0 0 12px;border:1px solid var(--line)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:0 0 14px}'
        . '.kpi{background:#fff;border:1px solid var(--line);padding:10px 12px}.kpi b{display:block;font-size:22px}.kpi span{color:var(--mut);font-size:13px}'
        . 'form.inl{display:inline-flex;gap:6px;margin:3px 6px 3px 0;align-items:center;flex-wrap:wrap}input,select,button,textarea{font:inherit;padding:5px 8px;max-width:100%}'
        . 'button{cursor:pointer;background:#1d1b18;color:#fff;border:0;border-radius:3px}button.lt{background:#ddd;color:#222}button.bad{background:#a33b22}'
        . '.st{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;background:#eee}.st.w{background:#fbe7c4}.st.g{background:#cfe9d5}.st.r{background:#f3c9bd}'
        . '.mut{color:var(--mut);font-size:13px}.msg{background:#fff6d8;padding:8px 12px;margin:0 0 12px;border:1px solid #efd98f}.warn{background:#fbe1d8;padding:8px 12px;margin:0 0 12px;border:1px solid #e4a68f}'
        . '.tabs{display:flex;gap:4px;flex-wrap:wrap;margin:0 0 12px}.tabs a{padding:6px 12px;background:#fff;border:1px solid var(--line);text-decoration:none;color:var(--ink);font-size:14px}.tabs a.on{background:#1d1b18;color:#fff}'
        . '.scroll{overflow-x:auto}pre{white-space:pre-wrap;background:#faf8f4;padding:10px;font-size:13px;max-height:420px;overflow:auto}.test{color:#b4462b;font-weight:600}'
        . 'ul.todo{list-style:none;padding:0;margin:0}ul.todo li{background:#fff;border:1px solid var(--line);border-left:4px solid #c29a5b;padding:8px 12px;margin:0 0 6px}ul.todo li.hot{border-left-color:#b4462b}'
        . '@media(max-width:820px){.lay{grid-template-columns:1fr}nav.side{position:static;height:auto;display:flex;overflow-x:auto;white-space:nowrap;padding:6px}nav.side .lg{display:none}nav.side a{padding:8px 10px}'
        . 'main{padding:12px}main table{display:block;overflow-x:auto}.hide-m{display:none}form.inl{display:flex;width:100%}form.inl input:not([type=checkbox]):not([type=hidden]),form.inl textarea,form.inl select{width:100%}th,td{padding:6px;font-size:13px}}</style></head><body><div class="lay"><nav class="side" aria-label="Разделы админки"><div class="lg">LINEA</div>' . $menu
        . '<a href="admin-brigady.php">Ремонт: модерация и запросы →</a><a href="admin.php">Старый список заказов →</a></nav><main>'
        . ($msg !== '' ? '<p class="msg">' . $h($msg) . '</p>' : '') . $body . '</main></div></body></html>';
    exit;
}

// ── файл (анкеты, портфолио, этапы, пакеты — админ видит все файлы сервиса)
if (isset($_GET['file'])) {
    $f = brig_one('SELECT * FROM br_files WHERE id = ?', [(int)$_GET['file']]);
    if (!$f) { http_response_code(404); exit; }
    brig_send_file($f);
}
// ── CSV-экспорт (спецификация 5.12): без паспортных данных и без контактов клиентов; ячейки «= + - @ таб CR» — с префиксом «'» (CSV-инъекции)
const ADM_CSV = ['deals' => 'Сделки', 'payments' => 'Оплаты по сделкам (реестр)', 'ledger' => 'Проводки вознаграждения', 'invoices' => 'Счета', 'brigades' => 'Бригады', 'signals' => 'Сигналы обхода'];
function adm_csv_cell($v) { return is_string($v) && $v !== '' && !is_numeric($v) && strpbrk($v[0], "=+-@\t\r") !== false ? "'" . $v : $v; }
if (isset($_GET['csv']) && isset(ADM_CSV[$_GET['csv']])) {
    $k = (string)$_GET['csv'];
    $q = [
        'deals' => ['SELECT j.id, o.number, r.object_title, b.name brigade, j.status, j.deal_total_kop, j.commission_rate, j.commission_kop, j.contacts_open_at, j.done_at, j.frozen_at, r.test FROM br_jobs j JOIN br_requests r ON r.id = j.request_id JOIN orders o ON o.id = r.order_id JOIN br_brigades b ON b.id = j.brigade_id ORDER BY j.id', ['Сделка', 'Заказ', 'Объект', 'Бригада', 'Статус', 'Сумма, коп', 'Ставка', 'Вознаграждение, коп', 'Договор подписан', 'Завершена', 'Приостановлена', 'Тест']],
        'payments' => ['SELECT p.id, p.job_id, p.kind, p.amount_kop, p.status, p.declared_by, p.declared_at, p.confirmed_by, p.confirmed_at, p.method, p.contest_note FROM br_payments p ORDER BY p.id', ['#', 'Сделка', 'Вид', 'Сумма, коп', 'Статус', 'Отметил', 'Когда', 'Подтвердил', 'Когда', 'Способ', 'Расхождение']],
        'ledger' => ['SELECT l.id, l.job_id, b.name, l.kind, l.amount_kop, l.status, l.note, l.at, l.by_who FROM br_ledger l JOIN br_brigades b ON b.id = l.brigade_id ORDER BY l.id', ['#', 'Сделка', 'Бригада', 'Проводка', 'Сумма, коп', 'Статус', 'Пояснение', 'Когда', 'Кто']],
        'invoices' => ['SELECT i.number, b.name, b.inn, i.job_id, i.amount_kop, i.issued_at, i.due_at, i.paid_at, i.paid_note FROM br_invoices i JOIN br_brigades b ON b.id = i.brigade_id ORDER BY i.id', ['Счёт', 'Бригада', 'ИНН', 'Сделка', 'Сумма, коп', 'Выставлен', 'Срок', 'Оплачен', 'Основание']],
        'brigades' => ['SELECT id, name, legal, inn, status, specs, districts, admitted_at, pilot_slot, pilot_used, test FROM br_brigades WHERE demo = 0 ORDER BY id', ['#', 'Название', 'Форма', 'ИНН', 'Статус', 'Специализации', 'Районы', 'Допущена', 'Место в пилоте', 'Пилотных сделок', 'Тест']],
        'signals' => ['SELECT id, at, kind, who, brigade_id, job_id, request_id, field, detail FROM br_signals ORDER BY id', ['#', 'Когда', 'Вид', 'Кто', 'Бригада', 'Сделка', 'Запрос', 'Поле', 'Что']],
    ][$k];
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="linea-' . $k . '-' . date('Y-m-d') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, $q[1], ';', '"', '');
    foreach (brig_all($q[0]) as $row) { fputcsv($out, array_map('adm_csv_cell', array_values($row)), ';', '"', ''); }
    brig_audit('admin', 'csv-export', $k, ADM_CSV[$k]);
    exit;
}

$form = fn(string $act, array $hidden, string $inner, string $btn, string $cls = '', bool $multipart = false) =>
    '<form method="post" class="inl"' . ($multipart ? ' enctype="multipart/form-data"' : '') . '><input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="act" value="' . $act . '">'
    . implode('', array_map(fn($k, $v) => '<input type="hidden" name="' . $k . '" value="' . htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8') . '">', array_keys($hidden), $hidden))
    . $inner . '<button' . ($cls ? ' class="' . $cls . '"' : '') . '>' . $btn . '</button></form>';
$reasonIn = '<input name="reason" size="22" placeholder="причина (в журнал)">';

// ───────────────────────── действия
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if (!hash_equals($csrf, (string)($_POST['csrf'] ?? ''))) { http_response_code(403); adm_page('Ошибка', '<p>Форма устарела — обновите страницу.</p>', $s); }
    $act = (string)($_POST['act'] ?? '');
    $reason = linea_str($_POST['reason'] ?? '', 500);
    $back = 'panel.php?' . http_build_query(array_filter(['s' => $_POST['s_back'] ?? $s, 'o' => $_POST['o_back'] ?? null, 'tab' => $_POST['tab_back'] ?? null, 'id' => $_POST['id_back'] ?? null]));
    $msg = '';
    $o = isset($_POST['o']) ? linea_order_by_number((string)$_POST['o']) : null;
    $oupd = function (array $set) use (&$o, $now) { db_update('orders', $set + ['updated_at' => $now], 'id = ?', [(int)$o['id']]); $o = linea_order_by_number($o['number']); };
    $need = function (bool $cond, string $why) use (&$msg): bool { if (!$cond) { $msg = $why; } return $cond; };
    try {
        switch ($act) {
            // ── заказ проекта
            case 'o_status': {
                $to = (string)($_POST['to'] ?? '');
                $allowed = ['new' => ['awaiting_payment', 'cancelled'], 'awaiting_payment' => ['paid', 'cancelled'], 'paid' => ['delivered', 'refunded', 'cancelled'],
                    'delivered' => ['paid', 'refunded'], 'cancelled' => ['awaiting_payment'], 'refunded' => []];
                if (!$o || !$need(in_array($to, $allowed[$o['status']] ?? [], true), 'Переход «' . ($o['status'] ?? '') . ' → ' . $to . '» недопустим')) { break; }
                if ($to === 'paid' && !$need((int)$o['amount_kop'] > 0, 'Сначала задайте сумму')) { break; }
                if (in_array($to, ['cancelled', 'refunded'], true) && !$need($reason !== '', 'Укажите причину')) { break; }
                $set = ['status' => $to] + ($to === 'paid' && !$o['paid_at'] ? ['paid_at' => $now, 'paid_by' => 'вручную: ' . ($reason ?: 'админка')] : []) + ($to === 'delivered' ? ['delivered_at' => $now] : []);
                $oupd($set);
                linea_event((int)$o['id'], 'admin', 'Статус: ' . (LINEA_STATUS[$to] ?? $to) . ($reason ? ' — ' . $reason : ''));
                $txt = ['paid' => 'Оплата получена — работа над проектом началась.', 'delivered' => 'Финальный альбом выдан. Теперь можно подобрать бригаду на ремонт — это необязательно.',
                    'cancelled' => 'Заказ отменён: ' . $reason, 'refunded' => 'Оплата возвращена: ' . $reason, 'awaiting_payment' => 'Заказ ждёт оплаты.'][$to] ?? '';
                kab_notice_order($o, $to === 'refunded' || $to === 'paid' ? 'dengi' : 'proekt', $txt);
                brig_audit($WHO, 'order-status', 'order ' . $o['number'], $to . ($reason ? ': ' . $reason : ''));
                $msg = 'Статус изменён.'; break;
            }
            case 'o_amount': {
                if (!$o) { break; }
                $kop = (int)round((float)str_replace([' ', ','], ['', '.'], (string)($_POST['rub'] ?? '')) * 100);
                if (!$need($kop > 0 && $kop < 10000000000, 'Сумма — больше нуля')) { break; }
                $old = $o['amount_kop'];
                $oupd(['amount_kop' => $kop, 'amount_confirmed_at' => $now] + ($o['status'] === 'new' ? ['status' => 'awaiting_payment'] : []) + ((int)$old !== $kop && $o['payment_url'] ? ['payment_url' => null, 'payment_created_at' => null] : []));
                linea_event((int)$o['id'], 'admin', 'Сумма подтверждена по плану: ' . $rub($kop));
                kab_notice_order($o, 'dengi', 'Сумма проекта подтверждена: ' . $rub($kop) . '. Можно оплачивать.');
                brig_audit($WHO, 'order-amount', 'order ' . $o['number'], $rub($old) . ' → ' . $rub($kop));
                $msg = 'Сумма сохранена и подтверждена.'; break;
            }
            case 'o_invoice': {
                if (!$o || !$need((int)$o['amount_kop'] > 0, 'Сначала сумма')) { break; }
                $oupd(['invoice_at' => $now]);
                linea_event((int)$o['id'], 'admin', 'Счёт выставлен');
                kab_notice_order($o, 'dengi', 'Счёт на оплату ' . $rub($o['amount_kop']) . ' отправлен на почту.');
                brig_audit($WHO, 'order-invoice', 'order ' . $o['number']);
                $msg = 'Отмечено: счёт выставлен.'; break;
            }
            case 'o_refund': {
                if (!$o) { break; }
                $kop = (int)round((float)str_replace([' ', ','], ['', '.'], (string)($_POST['rub'] ?? '')) * 100);
                if (!$need($kop > 0 && $kop <= (int)$o['amount_kop'] && $reason !== '', 'Возврат: сумма не больше оплаченной и причина')) { break; }
                $full = $kop === (int)$o['amount_kop'];
                if ($full) { $oupd(['status' => 'refunded']); }
                linea_event((int)$o['id'], 'admin', 'Возврат ' . $rub($kop) . ($full ? ' (полный)' : ' (частичный)') . ': ' . $reason . '. Провести в ЮKassa / банке и выбить чек возврата');
                kab_notice_order($o, 'dengi', 'Оформлен возврат ' . $rub($kop) . '. Деньги вернутся тем же способом, каким вы платили.');
                brig_audit($WHO, 'order-refund', 'order ' . $o['number'], $rub($kop) . ': ' . $reason);
                $msg = 'Возврат отмечен. Деньги — через ЮKassa (личный кабинет) или банк, чек возврата — там же.'; break;
            }
            case 'o_release': {
                if (!$o) { break; }
                $ver = preg_replace('/[^A-Za-z0-9._-]/', '', (string)($_POST['ver'] ?? '')) ?? '';
                if (!$need($ver !== '' && strlen($ver) <= 20, 'Версия — латиница/цифры, например v1')) { break; }
                $dir = kab_order_dir($o) . '/releases/' . $ver;
                linea_mkdir($dir);
                $meta = ['title' => linea_str($_POST['title'] ?? '', 120) ?: $ver, 'date' => date('Y-m-d'), 'final' => !empty($_POST['final']), 'prelim' => !empty($_POST['prelim']),
                    'url' => linea_str($_POST['url'] ?? '', 300), 'project' => preg_replace('/[^a-z0-9-]/', '', strtolower((string)($_POST['project'] ?? ''))) ?: null, 'changes' => array_values(array_filter(array_map(fn($x) => linea_str($x, 300), explode("\n", (string)($_POST['changes'] ?? ''))))), 'hidden' => false,
                    'published_at' => $now];
                if (!empty($_FILES['pdf']['tmp_name']) && is_uploaded_file_or_test((string)$_FILES['pdf']['tmp_name'])) {
                    if (!$need(str_starts_with((string)file_get_contents((string)$_FILES['pdf']['tmp_name'], false, null, 0, 5), '%PDF'), 'Файл альбома — не PDF')) { break; }
                    move_uploaded_file((string)$_FILES['pdf']['tmp_name'], $dir . '/album.pdf') || copy((string)$_FILES['pdf']['tmp_name'], $dir . '/album.pdf');
                }
                if (!empty($_FILES['registry']['tmp_name']) && is_uploaded_file_or_test((string)$_FILES['registry']['tmp_name'])) {
                    $raw = (string)file_get_contents((string)$_FILES['registry']['tmp_name'], false, null, 0, 2097152);
                    if (!$need(is_array(json_decode($raw, true)['items'] ?? null), 'registry.json: нужен объект {items:[…]}')) { break; }
                    file_put_contents($dir . '/registry.json', $raw);
                }
                file_put_contents($dir . '/meta.json', json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
                linea_event((int)$o['id'], 'admin', 'Опубликована версия альбома ' . $ver . ($meta['final'] ? ' (финальная)' : ''));
                kab_notice_order($o, 'proekt', 'Вышла версия альбома «' . $meta['title'] . '»' . ($meta['final'] ? ' — финальная' : '') . '. Откройте и посмотрите.', '#/o/' . $o['number'] . '/proekt');
                if (is_file($dir . '/registry.json')) { kab_notice_order($o, 'voprosy', 'К альбому есть вопросы и решения на согласование — ответьте в кабинете.', '#/o/' . $o['number'] . '/voprosy', 'reg-' . $o['number'] . '-' . $ver); }
                brig_audit($WHO, 'release', 'order ' . $o['number'], $ver . ($meta['final'] ? ' final' : ''));
                $msg = 'Версия ' . $ver . ' опубликована клиенту.'; break;
            }
            case 'o_release_hide': {
                if (!$o) { break; }
                $ver = preg_replace('/[^A-Za-z0-9._-]/', '', (string)($_POST['ver'] ?? '')) ?? '';
                $f = kab_order_dir($o) . '/releases/' . $ver . '/meta.json';
                if (!$need($ver !== '' && is_file($f), 'Нет такой версии')) { break; }
                $m = json_decode((string)file_get_contents($f), true) ?: [];
                $m['hidden'] = empty($m['hidden']);
                file_put_contents($f, json_encode($m, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
                brig_audit($WHO, 'release-' . ($m['hidden'] ? 'hide' : 'show'), 'order ' . $o['number'], $ver . ($reason ? ': ' . $reason : ''));
                $msg = $m['hidden'] ? 'Версия скрыта от клиента.' : 'Версия снова видна.'; break;
            }
            case 'o_q_close': {
                if (!$o) { break; }
                $reg = kab_registry($o);
                $id = linea_str($_POST['qid'] ?? '', 20);
                if (!$need((bool)$reg, 'Нет реестра')) { break; }
                $f = kab_order_dir($o) . '/releases/' . $reg['ver'] . '/registry.json';
                $j = json_decode((string)file_get_contents($f), true);
                foreach ($j['items'] as &$it) { if (($it['id'] ?? '') === $id) { $it['closed'] = true; $it['closed_note'] = $reason; } }
                unset($it);
                file_put_contents($f, json_encode($j, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
                linea_event((int)$o['id'], 'admin', 'Вопрос ' . $id . ' закрыт: ' . $reason);
                brig_audit($WHO, 'question-close', 'order ' . $o['number'], $id . ': ' . $reason);
                $msg = 'Вопрос ' . $id . ' отмечен «учтено».'; break;
            }
            case 'o_review': {
                if (!$o) { break; }
                $num = linea_str($_POST['rn'] ?? '', 40);
                $rv = array_values(array_filter(kab_reviews($o), fn($r) => $r['number'] === $num))[0] ?? null;
                if (!$need((bool)$rv, 'Нет таких правок')) { break; }
                $j = json_decode((string)file_get_contents($rv['_f']), true);
                $j['status'] = linea_str($_POST['status'] ?? '', 60) ?: 'В работе';
                $j['reply'] = linea_str($_POST['reply'] ?? '', 2000);
                file_put_contents($rv['_f'], json_encode($j, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
                kab_notice_order($o, 'voprosy', 'Правки ' . $num . ': ' . $j['status'] . ($j['reply'] !== '' ? ' — ' . mb_substr($j['reply'], 0, 200) : ''), '#/o/' . $o['number'] . '/pravki');
                brig_audit($WHO, 'review-status', 'order ' . $o['number'], $num . ': ' . $j['status']);
                $msg = 'Статус правок сохранён.'; break;
            }
            case 'o_msg': {
                if (!$o) { break; }
                $t = linea_str($_POST['text'] ?? '', 3000);
                if (!$need($t !== '', 'Пустое сообщение')) { break; }
                linea_event((int)$o['id'], !empty($_POST['private']) ? 'admin-note' : 'kab:linea', $t);
                if (empty($_POST['private'])) {
                    kab_notice_order($o, 'proekt', 'Сообщение от LINEA: ' . mb_substr($t, 0, 300));
                    if (kab_email_ok((string)$o['email'])) { brig_mail((string)$o['email'], 'kab_notice', ['subject' => 'сообщение по заказу ' . $o['number'], 'text' => $t, 'link' => brig_link('kabinet/#/o/' . $o['number'])], (bool)$o['test']); }
                }
                brig_audit($WHO, !empty($_POST['private']) ? 'order-note' : 'order-msg', 'order ' . $o['number']);
                $msg = !empty($_POST['private']) ? 'Заметка сохранена (клиент её не видит).' : 'Сообщение отправлено в кабинет и на почту.'; break;
            }
            case 'o_token': {
                if (!$o || !$need($reason !== '', 'Укажите причину перевыпуска')) { break; }
                $oupd(['token' => bin2hex(random_bytes(16))]);
                linea_event((int)$o['id'], 'admin', 'Ссылка заказа перевыпущена: ' . $reason);
                brig_audit($WHO, 'order-token', 'order ' . $o['number'], $reason);
                $msg = 'Старая ссылка больше не работает. Кабинет по почте — работает.'; break;
            }
            case 'o_rebind': {
                $e = mb_strtolower(trim((string)($_POST['email'] ?? '')));
                if (!$o || !$need(kab_email_ok($e) && $reason !== '', 'Почта и причина (заявление владельца заказа)')) { break; }
                $aid = kab_client_account($e, (bool)$o['test']);
                $oupd(['account_id' => $aid, 'email' => $e]);
                linea_event((int)$o['id'], 'admin', 'Заказ перепривязан к другой почте: ' . $reason);
                brig_audit($WHO, 'order-rebind', 'order ' . $o['number'], 'account#' . $aid . ': ' . $reason);
                $msg = 'Заказ перепривязан.'; break;
            }
            case 'o_delete_test': {
                if (!$o || !$need((bool)$o['test'], 'Удалять можно только тестовые')) { break; }
                brig_audit($WHO, 'order-delete-test', 'order ' . $o['number']);
                db_exec('DELETE FROM orders WHERE id = ?', [(int)$o['id']]);
                $msg = 'Тестовый заказ удалён.'; $back = 'panel.php?s=orders'; break;
            }
            // ── клиенты и ПДн
            case 'c_logout_all': {
                $id = (int)($_POST['id'] ?? 0);
                db_exec('UPDATE acc_devices SET ended_at = ? WHERE account_id = ? AND ended_at IS NULL', [$now, $id]);
                brig_audit($WHO, 'client-logout-all', 'account#' . $id, $reason);
                $msg = 'Все сеансы клиента завершены.'; break;
            }
            case 'pd_do': case 'pd_reject': {
                $p = brig_one("SELECT * FROM pd_requests WHERE id = ? AND status = 'new'", [(int)($_POST['id'] ?? 0)]);
                if (!$need((bool)$p, 'Заявка не найдена или уже закрыта')) { break; }
                if (!$need(adm_can('pd'), 'Нет прав')) { break; }
                $acc = brig_one('SELECT * FROM accounts WHERE id = ?', [(int)$p['account_id']]);
                if ($act === 'pd_reject') {
                    if (!$need($reason !== '', 'Отказ — только с причиной и основанием')) { break; }
                    db_update('pd_requests', ['status' => 'rejected', 'reply' => $reason, 'done_at' => $now, 'done_by' => $WHO], 'id = ?', [(int)$p['id']]);
                    kab_notice((int)$acc['id'], null, 'proekt', 'Заявка «' . (KAB_PD_KINDS[$p['kind']] ?? $p['kind']) . '» выполнена частично / отклонена: ' . $reason, '#/profil');
                    brig_audit($WHO, 'pd-reject', 'pd#' . $p['id'], $reason);
                    $msg = 'Заявка закрыта с ответом.'; break;
                }
                $file = null; $reply = linea_str($_POST['reply'] ?? '', 1000);
                if ($p['kind'] === 'delete') {
                    if ($b = kab_pd_blockers($acc)) { $msg = 'Сейчас удалить нельзя: ' . implode('; ', $b); break; }
                    $gone = kab_pd_destroy($acc, $WHO);
                    $reply = $reply ?: 'Данные обезличены: контакты, бриф, фото и ответы удалены. Договоры, подписи и чеки храним ' . brig_terms()['retention_years'] . ' лет по закону, доступ к ним закрыт.';
                    brig_audit($WHO, 'pd-destroy', 'account#' . $acc['id'], 'Уничтожено: ' . implode(', ', $gone));
                } elseif ($p['kind'] === 'export') {
                    $file = kab_pd_export($acc);
                    $reply = $reply ?: 'Выгрузка готова — скачайте в профиле (после входа кодом).';
                    brig_audit($WHO, 'pd-export', 'account#' . $acc['id']);
                } else { $reply = $reply ?: 'Выполнено.'; brig_audit($WHO, 'pd-' . $p['kind'], 'account#' . $acc['id'], $reply); }
                db_update('pd_requests', ['status' => 'done', 'reply' => $reply, 'file' => $file, 'done_at' => $now, 'done_by' => $WHO], 'id = ?', [(int)$p['id']]);
                if ($p['kind'] !== 'delete') { kab_notice((int)$acc['id'], null, 'proekt', 'Заявка «' . (KAB_PD_KINDS[$p['kind']] ?? $p['kind']) . '» выполнена. ' . $reply, '#/profil'); }
                $msg = 'Заявка выполнена.'; break;
            }
            // ── сделки
            case 'd_freeze': case 'd_unfreeze': case 'd_cancel': {
                $jid = (int)($_POST['id'] ?? 0);
                if (!$need($reason !== '', 'Укажите причину')) { break; }
                $to = ['d_freeze' => 'freeze', 'd_unfreeze' => 'unfreeze', 'd_cancel' => 'cancelled'][$act];
                deal_transition($jid, $to, $WHO, $reason, true);
                $msg = 'Готово: ' . ['freeze' => 'сделка приостановлена', 'unfreeze' => 'сделка возобновлена', 'cancelled' => 'сделка отменена LINEA'][$to] . '.'; break;
            }
            // ── бригады
            case 'b_warn': {
                $bid = (int)($_POST['id'] ?? 0);
                $rule = linea_str($_POST['rule'] ?? '', 180);
                if (!$need(adm_can('brigade-warn') && $rule !== '' && brig_one('SELECT 1 FROM br_brigades WHERE id = ?', [$bid]), 'Укажите пункт правил')) { break; }
                $w = brig_warn($bid, $rule, linea_str($_POST['quote'] ?? '', 1000), $WHO);
                $msg = 'Шаг ' . $w['step'] . ': ' . $w['text'] . '.'; break;
            }
            // ── договоры
            case 'c_verify': {
                $c = brig_one('SELECT * FROM br_contracts WHERE id = ?', [(int)($_POST['id'] ?? 0)]);
                if (!$need((bool)$c, 'Нет документа')) { break; }
                $ok = hash_equals((string)$c['hash'], brig_contract_hash((string)$c['body']));
                brig_audit($WHO, 'contract-verify', 'job#' . $c['job_id'], 'doc#' . $c['id'] . ': ' . ($ok ? 'совпадает' : 'НЕ совпадает'));
                $msg = $ok ? 'SHA-256 текста совпадает с подписанной версией.' : 'ВНИМАНИЕ: текст не совпадает с хешем подписанной версии!'; break;
            }
            // ── разногласия
            case 'ds_propose': {
                $ds = brig_one('SELECT * FROM br_disputes WHERE id = ?', [(int)($_POST['id'] ?? 0)]);
                $t = linea_str($_POST['text'] ?? '', 3000);
                if (!$need($ds && $t !== '', 'Текст рекомендации')) { break; }
                $due = kab_wd_add($now, brig_terms()['dispute_proposal_days']);
                db_update('br_disputes', ['proposal' => $t, 'proposal_due_at' => $due, 'status' => 'proposal'], 'id = ?', [(int)$ds['id']]);
                db_insert('br_dispute_msgs', ['dispute_id' => (int)$ds['id'], 'who' => 'admin', 'text' => 'Рекомендация LINEA (необязательна, право на суд сохраняется). Согласиться — до ' . date('d.m.Y', strtotime($due)) . ': ' . $t, 'at' => $now]);
                brig_audit($WHO, 'dispute-proposal', 'dispute#' . $ds['id'], mb_substr($t, 0, 200));
                $msg = 'Рекомендация отправлена сторонам.'; break;
            }
            // ── деньги
            case 'm_invoice': {
                $r = ledger_invoice((int)($_POST['id'] ?? 0), $WHO, $reason, !empty($_POST['manual']));
                $msg = str_starts_with((string)$r, 'LB-') ? 'Счёт ' . $r . ' выставлен.' : (string)$r; break;
            }
            case 'm_invoice_deferred': {
                ledger_sync_all();
                if (!$need((bool)linea_requisites(), 'Сначала реквизиты ИП/ООО LINEA в «Настройках»')) { break; }
                $n = 0; $err = [];
                foreach (brig_all("SELECT job_id FROM br_ledger WHERE kind = 'accrual' AND status IN ('deferred','due')") as $x) {
                    $r = ledger_invoice((int)$x['job_id'], $WHO, 'выставление отложенных после регистрации ИП');
                    if (str_starts_with((string)$r, 'LB-')) { $n++; } else { $err[] = $r; }
                }
                $msg = 'Выставлено счетов: ' . $n . ($err ? '. Не выставлено: ' . implode('; ', array_unique($err)) : ''); break;
            }
            case 'm_paid': {
                $i = brig_one('SELECT * FROM br_invoices WHERE id = ? AND paid_at IS NULL', [(int)($_POST['id'] ?? 0)]);
                if (!$need($i && $reason !== '', 'Основание: № платёжки и дата')) { break; }
                db_update('br_invoices', ['paid_at' => $now, 'paid_note' => mb_substr($reason, 0, 120)], 'id = ?', [(int)$i['id']]);
                db_insert('br_ledger', ['brigade_id' => (int)$i['brigade_id'], 'job_id' => (int)$i['job_id'], 'kind' => 'payment', 'amount_kop' => -(int)$i['amount_kop'], 'status' => 'done', 'note' => $reason, 'invoice_id' => (int)$i['id'], 'at' => $now, 'by_who' => $WHO]);
                ledger_sync((int)$i['job_id']);
                brig_audit($WHO, 'invoice-paid', $i['number'], $reason);
                $msg = 'Оплата счёта отмечена.'; break;
            }
            case 'm_writeoff': {
                $jid = (int)($_POST['id'] ?? 0);
                $acc = brig_one("SELECT * FROM br_ledger WHERE job_id = ? AND kind = 'accrual'", [$jid]);
                if (!$need($acc && $reason !== '' && !in_array($acc['status'], ['paid', 'void'], true), 'Списать можно неоплаченное начисление, с причиной')) { break; }
                db_insert('br_ledger', ['brigade_id' => (int)$acc['brigade_id'], 'job_id' => $jid, 'kind' => 'writeoff', 'amount_kop' => -(int)$acc['amount_kop'], 'status' => 'done', 'note' => $reason, 'at' => $now, 'by_who' => $WHO]);
                db_update('br_ledger', ['status' => 'void'], 'id = ?', [(int)$acc['id']]);
                brig_audit($WHO, 'commission-writeoff', 'job#' . $jid, $reason);
                $msg = 'Вознаграждение списано.'; break;
            }
            // ── настройки
            case 'set_terms': {
                if (!$need(adm_can('settings'), 'Нет прав')) { break; }
                $in = [];
                foreach (BRIG_TERMS_DEFAULT as $k => $def) {
                    if (!array_key_exists($k, $_POST['t'] ?? [])) { continue; }
                    $v = $_POST['t'][$k];
                    if (is_array($def)) { $j = json_decode((string)$v, true); if (!is_array($j)) { $msg = 'Поле ' . $k . ': нужен JSON'; break 2; } $in[$k] = $j; }
                    elseif (is_bool($def)) { $in[$k] = $v === '1'; }
                    elseif (is_float($def)) { $in[$k] = (float)str_replace(',', '.', (string)$v); }
                    elseif (is_int($def)) { $in[$k] = (int)$v; }
                    elseif ($def === null) { $in[$k] = $v === '' ? null : (int)$v; }
                    else { $in[$k] = linea_str($v, 40); }
                }
                $before = brig_terms();
                $diff = array_filter($in, fn($v, $k) => json_encode($v) !== json_encode(BRIG_TERMS_DEFAULT[$k]), ARRAY_FILTER_USE_BOTH);
                $raw = json_encode($diff, JSON_UNESCAPED_UNICODE);
                if (db_one("SELECT 1 FROM settings WHERE k = 'brig_terms'")) { db_update('settings', ['v' => $raw, 'updated_at' => $now, 'updated_by' => $WHO], "k = 'brig_terms'"); }
                else { db_insert('settings', ['k' => 'brig_terms', 'v' => $raw, 'updated_at' => $now, 'updated_by' => $WHO]); }
                $after = brig_terms(true);
                $ch = [];
                foreach ($after as $k => $v) { if (json_encode($v) !== json_encode($before[$k] ?? null)) { $ch[] = $k . ': ' . json_encode($before[$k] ?? null, JSON_UNESCAPED_UNICODE) . ' → ' . json_encode($v, JSON_UNESCAPED_UNICODE); } }
                brig_audit($WHO, 'settings', 'brig_terms', mb_substr(implode('; ', $ch) ?: 'без изменений', 0, 480));
                $msg = $ch ? 'Сохранено: ' . count($ch) . ' изм. Подписанные сделки не меняются. Тексты на сайте — после пересборки страниц (gen-brigady-pages.js) и выкладки.' : 'Изменений нет.'; break;
            }
            case 'set_requisites': {
                $r = ['name' => linea_str($_POST['name'] ?? '', 160), 'inn' => preg_replace('/\D/', '', (string)($_POST['inn'] ?? '')), 'ogrn' => preg_replace('/\D/', '', (string)($_POST['ogrn'] ?? '')),
                    'bank' => linea_str($_POST['bank'] ?? '', 300), 'address' => linea_str($_POST['address'] ?? '', 300)];
                if (!$need($r['name'] === '' || preg_match('/^\d{10,12}$/', $r['inn']), 'ИНН — 10 или 12 цифр')) { break; }
                $raw = json_encode($r['name'] === '' ? [] : $r, JSON_UNESCAPED_UNICODE);
                if (db_one("SELECT 1 FROM settings WHERE k = 'requisites'")) { db_update('settings', ['v' => $raw, 'updated_at' => $now, 'updated_by' => $WHO], "k = 'requisites'"); }
                else { db_insert('settings', ['k' => 'requisites', 'v' => $raw, 'updated_at' => $now, 'updated_by' => $WHO]); }
                linea_settings('requisites', true);
                brig_audit($WHO, 'settings', 'requisites', $r['name'] === '' ? 'реквизиты очищены' : $r['name'] . ', ИНН ' . $r['inn']);
                $msg = $r['name'] === '' ? 'Реквизиты очищены — вознаграждение снова «отложено».' : 'Реквизиты сохранены — счета на вознаграждение можно выставлять.'; break;
            }
            case 'set_holiday': {
                $day = (string)($_POST['d'] ?? '');
                if (!$need((bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', $day), 'Дата ГГГГ-ММ-ДД')) { break; }
                if (!empty($_POST['del'])) { db_exec('DELETE FROM holidays WHERE d = ?', [$day]); }
                elseif (!db_one('SELECT 1 FROM holidays WHERE d = ?', [$day])) { db_insert('holidays', ['d' => $day, 'note' => linea_str($_POST['note'] ?? '', 80) ?: null]); }
                brig_audit($WHO, 'settings', 'holidays', (!empty($_POST['del']) ? '−' : '+') . $day);
                $msg = 'Календарь обновлён.'; break;
            }
            case 'logout': session_destroy(); header('Location: admin.php'); exit;
            // модерация ремонта — общие действия с admin-brigady.php (lib/adm-brigady-act.php)
            case 'b_check': case 'b_npd': case 'b_status': case 'b_inn_release': case 'f_ok': case 'f_del': case 'r_pack': case 'r_file_del': case 'r_send': case 'r_cancel':
            case 'd_msg': case 'd_resolve': case 'c_approve': case 'c_reject': case 'i_paid': case 'rv_hide': case 'rv_show': case 'j_advance': {
                if (!adm_can(in_array($act, ['b_check', 'b_npd', 'f_ok', 'f_del'], true) ? 'brigade-check' : ($act === 'd_msg' ? 'dispute-msg' : 'admin'))) { $msg = 'Нет прав на это действие'; break; }
                [$msg] = adm_brig_act($act, (int)($_POST['id'] ?? 0), $reason, $WHO, 'panel.php');
                $msg = $msg !== '' ? $msg : 'Готово.';
                break;
            }
            default: $msg = 'Неизвестное действие';
        }
    } catch (Throwable $e) {
        $msg = $e instanceof DomainException ? $e->getMessage() : 'Ошибка: ' . ($e instanceof PDOException ? 'база' : $e->getMessage());
        linea_log('error.log', 'panel ' . $act . ': ' . $e->getMessage());
    }
    $_SESSION['pmsg'] = $msg;
    header('Location: ' . $back); exit;
}
$msg = (string)($_SESSION['pmsg'] ?? ''); unset($_SESSION['pmsg']);
$hid = fn(array $extra = []) => ['s_back' => $s] + $extra;

// ───────────────────────── «Требует действия»
function adm_todo(): array
{
    $t = brig_terms(); $now = time(); $out = [];
    $add = function (string $text, string $href, bool $hot = false, string $grp = 'proekt') use (&$out) { $out[] = compact('text', 'href', 'hot', 'grp'); };
    foreach (brig_all("SELECT * FROM orders WHERE test = 0 AND (status = 'new' OR (status = 'awaiting_payment' AND amount_confirmed_at IS NULL)) ORDER BY id") as $o) {
        $add('Бриф ' . $o['number'] . ' без подтверждённой суммы (с ' . date('d.m H:i', strtotime((string)$o['created_at'])) . ')', 'panel.php?s=order&o=' . rawurlencode($o['number']) . '&tab=dengi', strtotime((string)$o['created_at']) < $now - 4 * 3600);
    }
    foreach (brig_all("SELECT * FROM orders WHERE test = 0 AND status = 'awaiting_payment' AND amount_confirmed_at IS NOT NULL AND updated_at < ?", [date('Y-m-d H:i:s', $now - 86400)]) as $o) {
        $add('Не оплачен ' . $o['number'] . ' — ' . (int)floor(($now - strtotime((string)$o['updated_at'])) / 86400) . ' дн.: напомнить', 'panel.php?s=order&o=' . rawurlencode($o['number']) . '&tab=lenta', false, 'dengi');
    }
    foreach (brig_all("SELECT * FROM orders WHERE test = 0 AND status = 'paid'") as $o) {
        $rel = kab_releases($o, true);
        if (!$rel) { $add('Оплачен ' . $o['number'] . ' — первого варианта ещё нет', 'panel.php?s=order&o=' . rawurlencode($o['number']) . '&tab=vypuski', strtotime((string)$o['paid_at']) < $now - 7 * 86400); continue; }
        $af = kab_order_dir($o) . '/answers.json';
        $lastRel = max(array_map(fn($r) => strtotime((string)($r['published_at'] ?? $r['date'] ?? '')), $rel));
        if (is_file($af) && filemtime($af) > $lastRel) { $add('Клиент ответил на вопросы ' . $o['number'] . ' → выпустить версию', 'panel.php?s=order&o=' . rawurlencode($o['number']) . '&tab=voprosy', false, 'voprosy'); }
    }
    foreach (glob(linea_private() . '/reviews/*/*.json') ?: [] as $f) {
        $r = json_decode((string)file_get_contents($f), true);
        if (is_array($r) && empty($r['test']) && empty($r['status']) && !empty($r['order'])) { $add('Новые правки ' . $r['number'] . ' (заказ ' . $r['order'] . ')', 'panel.php?s=order&o=' . rawurlencode((string)$r['order']) . '&tab=pravki', false, 'voprosy'); }
    }
    foreach (brig_all("SELECT * FROM pd_requests WHERE status = 'new' ORDER BY due_at") as $p) {
        $add('Заявка по ПДн: ' . (KAB_PD_KINDS[$p['kind']] ?? $p['kind']) . ' — срок до ' . date('d.m', strtotime((string)$p['due_at'])), 'panel.php?s=pd', strtotime((string)$p['due_at']) < $now + 3 * 86400, 'pd');
    }
    foreach (brig_all("SELECT id, name FROM br_brigades WHERE status = 'review' AND demo = 0") as $b) { $add('Анкета бригады «' . $b['name'] . '» на проверке', 'admin-brigady.php?b=' . $b['id'], false, 'remont'); }
    foreach (brig_all("SELECT id, object_title FROM br_requests WHERE status = 'new' AND test = 0") as $r) { $add('Запрос на бригаду: ' . $r['object_title'] . ' — собрать пакет и разослать', 'admin-brigady.php?r=' . $r['id'], false, 'remont'); }
    foreach (brig_all("SELECT j.id, j.created_at FROM br_jobs j JOIN br_requests r ON r.id = j.request_id WHERE j.status = 'contract' AND r.test = 0 AND j.created_at < ?", [date('Y-m-d H:i:s', $now - $t['signal_unsigned_days'] * 86400)]) as $j) {
        $add('Сделка #' . $j['id'] . ': договор не подписан больше ' . $t['signal_unsigned_days'] . ' дн.', 'panel.php?s=deals', true, 'remont');
    }
    foreach (brig_all("SELECT s.*, j.id jid FROM br_stages s JOIN br_jobs j ON j.id = s.job_id JOIN br_requests r ON r.id = j.request_id WHERE s.status = 'ready' AND r.test = 0") as $st) {
        $wd = kab_wd_between((string)$st['ready_at'], $now);
        if ($wd >= $t['stage_silence_days']) { $add('Этап «' . $st['name'] . '» (сделка #' . $st['jid'] . ') ждёт приёмки ' . $wd . ' р.дн — связаться с заказчиком, предложить рассмотрение разногласий', 'panel.php?s=deals', true, 'remont'); }
    }
    foreach (brig_all("SELECT * FROM br_disputes WHERE status <> 'resolved'") as $ds) {
        $due = kab_wd_add((string)$ds['created_at'], $t['dispute_reply_days']);
        $add('Разногласие #' . $ds['id'] . ' («' . $ds['subject'] . '») — ответ стороны до ' . date('d.m', strtotime($due)), 'panel.php?s=disputes', strtotime($due) < $now, 'remont');
    }
    foreach (brig_all("SELECT id, status FROM br_sheet_reqs WHERE status = 'question'") as $x) { $add('Лист по запросу #' . $x['id'] . ' — вопрос без ответа', 'admin-brigady.php?view=sheets', false, 'remont'); }
    foreach (brig_all("SELECT number, due_at FROM br_invoices WHERE paid_at IS NULL AND due_at < ?", [date('Y-m-d')]) as $i) { $add('Счёт ' . $i['number'] . ' просрочен (срок ' . $i['due_at'] . ')', 'panel.php?s=money', true, 'dengi'); }
    $sig = (int)db_val('SELECT COUNT(*) FROM br_signals WHERE at > ?', [date('Y-m-d H:i:s', $now - 7 * 86400)]);
    if ($sig) { $add('Сигналы обхода за неделю: ' . $sig, 'admin-brigady.php?view=signals', $sig >= 5, 'remont'); }
    usort($out, fn($a, $b) => $b['hot'] <=> $a['hot']);
    return $out;
}

// ───────────────────────── разделы
switch ($s) {
    case 'dash': {
        ledger_sync_all();
        $sum = fn(int $days) => (int)db_val("SELECT SUM(amount_kop) FROM orders WHERE test = 0 AND paid_at > ? AND status IN ('paid','delivered')", [date('Y-m-d H:i:s', time() - $days * 86400)]);
        $led = fn(string $st) => (int)db_val("SELECT SUM(amount_kop) FROM br_ledger WHERE kind = 'accrual' AND status = ?", [$st]);
        $cnt = fn(string $q, array $a = []) => (int)db_val($q, $a);
        $todo = adm_todo();
        $kp = fn($v, $t, $href = '') => '<div class="kpi">' . ($href ? '<a href="' . $href . '">' : '') . '<b>' . $v . '</b><span>' . $t . '</span>' . ($href ? '</a>' : '') . '</div>';
        $body = '<h1>Требует действия</h1>' . ($todo ? '<ul class="todo">' . implode('', array_map(fn($x) => '<li' . ($x['hot'] ? ' class="hot"' : '') . '><a href="' . $h($x['href']) . '">' . $h($x['text']) . '</a></li>', $todo)) . '</ul>' : '<p class="box">Всё сделано — срочного нет.</p>')
            . '<h2>Проекты</h2><div class="grid">'
            . $kp($cnt("SELECT COUNT(*) FROM orders WHERE test = 0 AND created_at > ?", [date('Y-m-d H:i:s', time() - 7 * 86400)]), 'новых брифов за 7 дней', 'panel.php?s=orders')
            . $kp($cnt("SELECT COUNT(*) FROM orders WHERE test = 0 AND status = 'awaiting_payment'"), 'ждут оплаты', 'panel.php?s=orders&st=awaiting_payment')
            . $kp($cnt("SELECT COUNT(*) FROM orders WHERE test = 0 AND status = 'paid'"), 'оплачены, в работе', 'panel.php?s=orders&st=paid')
            . $kp($cnt("SELECT COUNT(*) FROM orders WHERE test = 0 AND status = 'delivered' AND delivered_at > ?", [date('Y-m-d H:i:s', time() - 30 * 86400)]), 'выданы за 30 дней', 'panel.php?s=orders&st=delivered')
            . '</div><h2>Деньги</h2><div class="grid">' . $kp($rub($sum(7)), 'оплачено проектов за 7 дней') . $kp($rub($sum(30)), 'за 30 дней')
            . $kp($rub($led('accrued') + $led('due') + $led('deferred') + $led('invoiced')), 'вознаграждение начислено, не оплачено', 'panel.php?s=money')
            . $kp($rub($led('deferred')), 'отложено до ИП LINEA', 'panel.php?s=money') . $kp($rub($led('paid')), 'вознаграждение оплачено', 'panel.php?s=money')
            . '</div><h2>Ремонт</h2><div class="grid">'
            . $kp($cnt("SELECT COUNT(*) FROM br_requests WHERE test = 0 AND status IN ('new','sent')"), 'подборов идёт', 'admin-brigady.php?view=requests')
            . $kp($cnt("SELECT COUNT(*) FROM br_jobs j JOIN br_requests r ON r.id = j.request_id WHERE r.test = 0 AND j.status IN ('contract','work')"), 'сделок в работе', 'panel.php?s=deals')
            . $kp($cnt("SELECT COUNT(*) FROM br_disputes WHERE status <> 'resolved'"), 'разногласий открыто', 'panel.php?s=disputes')
            . $kp($cnt("SELECT COUNT(*) FROM br_signals WHERE at > ?", [date('Y-m-d H:i:s', time() - 7 * 86400)]), 'сигналов обхода за неделю', 'admin-brigady.php?view=signals') . '</div>'
            . (empty(linea_cfg()['brig_mail_enabled']) ? '<p class="warn">Письма людям выключены (config brig_mail_enabled = false): коды входа и уведомления клиентам не уходят.</p>' : '')
            . '<p>' . $form('logout', [], '', 'Выйти', 'lt') . '</p>';
        adm_page('Дашборд', $body, $s, $msg);
    }
    case 'orders': {
        $st = (string)($_GET['st'] ?? ''); $q = trim((string)($_GET['q'] ?? ''));
        $w = []; $args = [];
        if (isset(LINEA_STATUS[$st])) { $w[] = 'status = ?'; $args[] = $st; }
        if ($q !== '') { $w[] = '(number LIKE ? OR LOWER(email) LIKE ? OR phone LIKE ? OR name LIKE ?)'; array_push($args, "%$q%", '%' . mb_strtolower($q) . '%', "%$q%", "%$q%"); }
        $rows = '';
        foreach (brig_all('SELECT * FROM orders ' . ($w ? 'WHERE ' . implode(' AND ', $w) : '') . ' ORDER BY id DESC LIMIT 300', $args) as $o) {
            $nx = kab_next_action($o); $rm = kab_remont($o);
            $rows .= '<tr><td><a href="panel.php?s=order&o=' . rawurlencode($o['number']) . '">' . $h($o['number']) . '</a>' . ($o['test'] ? ' <span class="test">тест</span>' : '') . '<div class="mut">' . $h(substr((string)$o['created_at'], 0, 16)) . '</div></td>'
                . '<td>' . $h($o['name']) . '<div class="mut hide-m">' . $h($o['email']) . '</div></td><td class="hide-m">' . $h(LINEA_KINDS[$o['kind']] ?? $o['kind']) . ($o['area'] ? ', ' . $h($o['area']) . ' м²' : '') . '</td>'
                . '<td>' . $rub($o['amount_kop']) . '</td><td><span class="st">' . $h(LINEA_STATUS[$o['status']] ?? $o['status']) . '</span><div class="mut">ждём: ' . ['client' => 'клиента', 'studio' => 'студию', 'brigade' => 'бригаду', 'none' => '—'][$nx['who']] . '</div></td>'
                . '<td class="hide-m">' . ($rm['job'] ? 'сделка: ' . $h(BRIG_JOB_STATUS[$rm['job']['status']] ?? '') : ($rm['request'] ? 'подбор' : '—')) . '</td></tr>';
        }
        $flt = '<form method="get" class="inl"><input type="hidden" name="s" value="orders"><select name="st"><option value="">все статусы</option>' . implode('', array_map(fn($k, $t) => '<option value="' . $k . '"' . ($k === $st ? ' selected' : '') . '>' . $h($t) . '</option>', array_keys(LINEA_STATUS), LINEA_STATUS))
            . '</select><input name="q" value="' . $h($q) . '" placeholder="номер, почта, телефон"><button>Найти</button></form>';
        adm_page('Заказы', '<h1>Заказы проектов</h1>' . $flt . '<div class="scroll"><table><tr><th>Номер</th><th>Клиент</th><th class="hide-m">Вид</th><th>Сумма</th><th>Статус</th><th class="hide-m">Ремонт</th></tr>' . ($rows ?: '<tr><td colspan="6">Пусто</td></tr>') . '</table></div>', 'orders', $msg);
    }
    case 'order': {
        $o = linea_order_by_number((string)($_GET['o'] ?? ''));
        if (!$o) { adm_page('Нет заказа', '<p>Заказ не найден.</p>', 'orders', $msg); }
        $tab = (string)($_GET['tab'] ?? 'obzor');
        $TABS = ['obzor' => 'Обзор', 'brif' => 'Бриф', 'dengi' => 'Деньги', 'vypuski' => 'Выпуски', 'voprosy' => 'Вопросы и решения', 'pravki' => 'Правки', 'lenta' => 'Лента', 'docs' => 'Документы', 'remont' => 'Ремонт', 'sluzh' => 'Служебное'];
        $num = $o['number'];
        $H = ['o' => $num, 's_back' => 'order', 'o_back' => $num, 'tab_back' => $tab];
        $tabs = '<div class="tabs">' . implode('', array_map(fn($k, $t) => '<a href="panel.php?s=order&o=' . rawurlencode($num) . '&tab=' . $k . '"' . ($k === $tab ? ' class="on"' : '') . '>' . $t . '</a>', array_keys($TABS), $TABS)) . '</div>';
        $nx = kab_next_action($o);
        $head = '<h1>' . $h($num) . ' <span class="st">' . $h(LINEA_STATUS[$o['status']] ?? $o['status']) . '</span>' . ($o['test'] ? ' <span class="test">ТЕСТ</span>' : '') . '</h1>'
            . '<p class="box">Клиенту сейчас: «' . $h($nx['text']) . '» · ждём: <b>' . ['client' => 'клиента', 'studio' => 'студию', 'brigade' => 'бригаду', 'none' => '—'][$nx['who']] . '</b></p>' . $tabs;
        $b = '';
        switch ($tab) {
            case 'obzor': {
                $tos = ['new' => ['awaiting_payment', 'cancelled'], 'awaiting_payment' => ['paid', 'cancelled'], 'paid' => ['delivered', 'refunded', 'cancelled'], 'delivered' => ['paid', 'refunded'], 'cancelled' => ['awaiting_payment'], 'refunded' => []][$o['status']] ?? [];
                $b = '<div class="box"><p>' . $h(LINEA_KINDS[$o['kind']] ?? $o['kind']) . ' · ' . $h($o['object_type']) . ($o['area'] ? ', ' . $h($o['area']) . ' м²' : '') . ' · сумма <b>' . $rub($o['amount_kop']) . '</b>' . ($o['amount_confirmed_at'] ? ' (подтверждена)' : ' (не подтверждена)') . '</p>'
                    . '<p>' . $h($o['name']) . ' · ' . $h($o['phone']) . ' · ' . $h($o['email']) . ($o['contact'] ? ' · связь: ' . $h($o['contact']) : '') . '</p>'
                    . '<p class="mut">Создан ' . $d($o['created_at']) . ' · оплачен ' . $d($o['paid_at']) . ' · выдан ' . $d($o['delivered_at']) . ' · аккаунт клиента: ' . ($o['account_id'] ? '<a href="panel.php?s=client&id=' . (int)$o['account_id'] . '">#' . (int)$o['account_id'] . '</a>' : 'нет') . '</p>'
                    . implode('', array_map(fn($to) => $form('o_status', $H + ['to' => $to], in_array($to, ['cancelled', 'refunded', 'paid'], true) ? $reasonIn : '', '→ ' . (LINEA_STATUS[$to] ?? $to), in_array($to, ['cancelled', 'refunded'], true) ? 'lt' : ''), $tos)) . '</div>';
                break;
            }
            case 'brif': {
                $bf = kab_order_dir($o) . '/brief.json';
                $b = '<div class="box"><a href="admin.php?dl=' . rawurlencode($num) . '">Скачать архив брифа</a><pre>' . $h(is_file($bf) ? json_encode(json_decode((string)file_get_contents($bf), true), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) : 'нет brief.json') . '</pre>'
                    . '<p class="mut">Папку клиента (clients/&lt;slug&gt;) создаём на маке: <code>/new-client</code> с этим брифом — сервер проект не собирает.</p></div>';
                break;
            }
            case 'dengi': {
                $b = '<div class="box"><p>Сумма: <b>' . $rub($o['amount_kop']) . '</b> · подтверждена: ' . $d($o['amount_confirmed_at']) . ' · счёт: ' . $d($o['invoice_at']) . ' · оплачен: ' . $d($o['paid_at']) . ' (' . $h($o['paid_by']) . ')</p>'
                    . '<p class="mut">Платёж ЮKassa: ' . $h($o['payment_id'] ?: '—') . ' · попыток ' . (int)$o['payment_tries'] . ($o['pay_alert_at'] ? ' · <b>нужна проверка оплаты</b>' : '') . '</p>'
                    . $form('o_amount', $H, '<input name="rub" size="9" placeholder="сумма, ₽" value="' . ($o['amount_kop'] ? (int)$o['amount_kop'] / 100 : '') . '">', 'Сохранить и подтвердить сумму')
                    . $form('o_invoice', $H, '', 'Счёт выставлен', 'lt')
                    . (in_array($o['status'], ['paid', 'delivered'], true) ? '<h2>Возврат</h2>' . $form('o_refund', $H, '<input name="rub" size="9" placeholder="сумма, ₽">' . $reasonIn, 'Отметить возврат', 'bad') . '<p class="mut">Сам возврат — в личном кабинете ЮKassa или банком; чек возврата — там же (API возврата ещё не подключён).</p>' : '') . '</div>';
                break;
            }
            case 'vypuski': {
                $rows = '';
                foreach (kab_releases($o, true) as $r) {
                    $rows .= '<tr><td>' . $h($r['ver']) . '</td><td>' . $h($r['title'] ?? '') . (!empty($r['final']) ? ' <span class="st g">финальная</span>' : '') . (!empty($r['prelim']) ? ' <span class="st w">предварительная</span>' : '') . (!empty($r['hidden']) ? ' <span class="st r">скрыта</span>' : '') . '</td>'
                        . '<td>' . $h($r['date'] ?? '') . '</td><td>' . ($r['hasPdf'] ? 'PDF' : '—') . ' · ' . ($r['hasRegistry'] ? 'реестр' : '—') . '</td><td>' . $form('o_release_hide', $H + ['ver' => $r['ver']], '', !empty($r['hidden']) ? 'Показать' : 'Скрыть', 'lt') . '</td></tr>';
                }
                $b = '<table><tr><th>Версия</th><th>Название</th><th>Дата</th><th>Файлы</th><th></th></tr>' . ($rows ?: '<tr><td colspan="5">Выпусков нет</td></tr>') . '</table>'
                    . '<h2>Опубликовать версию клиенту</h2><div class="box">' . $form('o_release', $H, '<input name="ver" size="5" placeholder="v1" required><input name="title" size="24" placeholder="Первый вариант"><input name="url" size="30" placeholder="ссылка на presentation.html (необязательно)"><input name="project" size="14" placeholder="слаг для правок (review.html?p=)">'
                    . '<label><input type="checkbox" name="prelim" value="1"> предварительная</label><label><input type="checkbox" name="final" value="1"> финальная</label><br><textarea name="changes" rows="3" cols="50" placeholder="что изменилось — по строке"></textarea>'
                    . '<br>PDF альбома <input type="file" name="pdf" accept="application/pdf"> registry.json <input type="file" name="registry" accept="application/json"><br>', 'Опубликовать', '', true) . '</div>';
                break;
            }
            case 'voprosy': {
                $reg = kab_registry($o); $ans = kab_answers($o)['items'];
                $rows = '';
                foreach ($reg['items'] ?? [] as $i) {
                    $a = $ans[$i['id']] ?? null;
                    $rows .= '<tr><td>' . $h($i['id']) . ($i['blocker'] ? ' <span class="st r">для финала</span>' : '') . '<div class="mut">' . $h($i['kind']) . '</div></td><td>' . $h($i['text']) . ($i['why'] ? '<div class="mut">' . $h($i['why']) . '</div>' : '') . '</td>'
                        . '<td>' . ($a ? $h(($a['decision'] ?? '') === 'agree' ? 'Согласовано' : trim(($a['decision'] ?? '') === 'disagree' ? 'Не согласен: ' . ($a['text'] ?? '') : ($a['option'] ?? '') . ' ' . ($a['text'] ?? ''))) . '<div class="mut">' . $d($a['at']) . ', версия ' . $h($a['ver']) . '</div>' : '—') . '</td>'
                        . '<td>' . ($i['closed'] ? 'учтено' : $form('o_q_close', $H + ['qid' => $i['id']], '<input name="reason" size="14" placeholder="учтено в v2">', 'Учтено', 'lt')) . '</td></tr>';
                }
                $b = $reg ? '<p class="mut">Реестр версии ' . $h($reg['ver']) . ' · SHA-256 ' . $h(substr($reg['sha256'], 0, 16)) . '…</p><div class="scroll"><table><tr><th>№</th><th>Вопрос/решение</th><th>Ответ клиента</th><th></th></tr>' . $rows . '</table></div>'
                    . '<p>Ответы для движка: <code>' . $h(kab_order_dir($o) . '/answers.json') . '</code> (перенос в project.json — tools/answers-to-project.mjs в GOST-DRAFT)</p>'
                    : '<p class="box">Реестра нет: опубликуйте версию с registry.json во вкладке «Выпуски».</p>';
                break;
            }
            case 'pravki': {
                foreach (kab_reviews($o) as $r) {
                    $b .= '<div class="box"><b>' . $h($r['number']) . '</b> · ' . $d($r['at']) . ' · ' . (int)$r['count'] . ' меток · ' . $h($r['status']) . '<pre>' . $h(implode("\n", array_map(fn($n) => $n['file'] . ' · ' . $n['n'] . ') ' . $n['text'], $r['notes']))) . '</pre>'
                        . $form('o_review', $H + ['rn' => $r['number']], '<select name="status"><option>В работе</option><option>Учтены в следующей версии</option><option>Не приняты</option></select><input name="reply" size="40" placeholder="ответ клиенту">', 'Сохранить') . '</div>';
                }
                $b = $b ?: '<p class="box">Правок нет.</p>';
                break;
            }
            case 'lenta': {
                $rows = implode('', array_map(fn($e) => '<tr><td class="mut">' . $d($e['at']) . '</td><td>' . $h(['kab:client' => 'Клиент', 'kab:linea' => 'LINEA → клиенту', 'admin-note' => 'Заметка (не видна клиенту)'][$e['who']] ?? $e['who']) . '</td><td>' . $h($e['text']) . '</td></tr>',
                    brig_all('SELECT * FROM events WHERE order_id = ? ORDER BY id DESC LIMIT 300', [(int)$o['id']])));
                $b = '<div class="box">' . $form('o_msg', $H, '<textarea name="text" rows="2" cols="50" placeholder="сообщение клиенту — уйдёт в кабинет и на почту"></textarea><label><input type="checkbox" name="private" value="1"> приватная заметка</label>', 'Отправить') . '</div><table>' . $rows . '</table>';
                break;
            }
            case 'docs': {
                $rows = implode('', array_map(fn($x) => '<tr><td>' . $h($x['doc_kind']) . ' ' . $h($x['doc_id']) . '</td><td>' . $h($x['decision']) . '</td><td>' . $h($x['version']) . '</td><td>' . $d($x['at']) . '</td><td>' . $h($x['ip']) . '</td><td><code>' . $h(substr((string)$x['sha256'], 0, 16)) . '</code></td></tr>',
                    brig_all('SELECT * FROM signatures WHERE order_id = ? ORDER BY id', [(int)$o['id']])));
                $b = '<p>Согласие при брифе: ' . $d($o['consent_at']) . '<br><span class="mut">' . $h($o['consent_text']) . '</span></p><h2>Подписи кабинета</h2><table><tr><th>Документ</th><th>Решение</th><th>Версия</th><th>Время</th><th>IP</th><th>SHA-256</th></tr>' . ($rows ?: '<tr><td colspan="6">Нет</td></tr>') . '</table>';
                break;
            }
            case 'remont': {
                $rm = kab_remont($o);
                $b = '<div class="box">' . ($rm['request'] ? 'Запрос #' . (int)$rm['request']['id'] . ': ' . $h(BRIG_REQ_STATUS[$rm['request']['status']] ?? $rm['request']['status']) . ' · <a href="admin-brigady.php?r=' . (int)$rm['request']['id'] . '">открыть</a>' : 'Подбора нет')
                    . ($rm['job'] ? '<br>Сделка #' . (int)$rm['job']['id'] . ': ' . $h(BRIG_JOB_STATUS[$rm['job']['status']] ?? '') . ' · <a href="panel.php?s=deals">в разделе «Сделки»</a> · <a href="admin-brigady.php?j=' . (int)$rm['job']['id'] . '">карточка</a>' : '') . '</div>';
                break;
            }
            case 'sluzh': {
                $b = '<div class="box"><p>Ссылка заказа (старые письма): перевыпуск делает её недействительной, кабинет по почте работает.</p>' . $form('o_token', $H, $reasonIn, 'Перевыпустить ссылку', 'bad')
                    . '<p>Перепривязать заказ к другой почте (по заявлению владельца):</p>' . $form('o_rebind', $H, '<input name="email" type="email" placeholder="новая почта" required>' . $reasonIn, 'Перепривязать', 'bad')
                    . ($o['test'] ? '<p>' . $form('o_delete_test', $H, '', 'Удалить тестовый заказ', 'lt') . '</p>' : '') . '</div>';
                break;
            }
        }
        adm_page($num, $head . $b, 'orders', $msg);
    }
    case 'clients': {
        $rows = '';
        foreach (brig_all("SELECT a.*, (SELECT COUNT(*) FROM orders o WHERE o.account_id = a.id) n FROM accounts a WHERE a.role = 'client' ORDER BY a.id DESC LIMIT 300") as $a) {
            $rows .= '<tr><td><a href="panel.php?s=client&id=' . (int)$a['id'] . '">#' . (int)$a['id'] . '</a>' . ($a['test'] ? ' <span class="test">тест</span>' : '') . '</td><td>' . $h($a['email']) . '<div class="mut">' . $h($a['name']) . '</div></td><td>' . (int)$a['n'] . '</td><td>' . $d($a['last_login_at']) . '</td><td>' . $h($a['status']) . '</td></tr>';
        }
        adm_page('Клиенты', '<h1>Клиенты</h1><div class="scroll"><table><tr><th>#</th><th>Почта</th><th>Объектов</th><th>Последний вход</th><th>Статус</th></tr>' . ($rows ?: '<tr><td colspan="5">Пусто</td></tr>') . '</table></div>', 'clients', $msg);
    }
    case 'client': {
        $a = brig_one("SELECT * FROM accounts WHERE id = ? AND role = 'client'", [(int)($_GET['id'] ?? 0)]);
        if (!$a) { adm_page('Нет клиента', '<p>Не найден.</p>', 'clients', $msg); }
        kab_consents_sync($a);
        $ord = implode('', array_map(fn($o) => '<li><a href="panel.php?s=order&o=' . rawurlencode($o['number']) . '">' . $h($o['number']) . '</a> — ' . $h(LINEA_STATUS[$o['status']] ?? $o['status']) . '</li>', brig_all('SELECT * FROM orders WHERE account_id = ?', [(int)$a['id']])));
        $dev = implode('', array_map(fn($x) => '<li>' . $h(mb_substr((string)$x['ua'], 0, 60)) . ' · ' . $h($x['ip']) . ' · ' . $d($x['last_at']) . ($x['ended_at'] ? ' (завершён)' : '') . '</li>', brig_all('SELECT * FROM acc_devices WHERE account_id = ? ORDER BY id DESC LIMIT 20', [(int)$a['id']])));
        $con = implode('', array_map(fn($x) => '<li>' . $h(KAB_LEGAL[$x['kind']]['title'] ?? $x['kind']) . ' · ред. ' . $h($x['edition']) . ' · ' . $d($x['given_at']) . ($x['revoked_at'] ? ' · <b>отозвано ' . $d($x['revoked_at']) . '</b>' : '') . '</li>', brig_all('SELECT * FROM consents WHERE account_id = ?', [(int)$a['id']])));
        adm_page('Клиент', '<h1>Клиент #' . (int)$a['id'] . '</h1><div class="box">' . $h($a['email']) . ' · ' . $h($a['name']) . ' · ' . $h($a['phone']) . ' · создан ' . $d($a['created_at']) . '</div><h2>Объекты</h2><ul>' . ($ord ?: '<li>нет</li>') . '</ul>'
            . '<h2>Устройства</h2><ul>' . ($dev ?: '<li>нет</li>') . '</ul>' . $form('c_logout_all', ['id' => $a['id'], 's_back' => 'client', 'id_back' => $a['id']], $reasonIn, 'Завершить все сеансы', 'lt')
            . '<h2>Согласия</h2><ul>' . ($con ?: '<li>нет</li>') . '</ul>', 'clients', $msg);
    }
    case 'pd': {
        $rows = '';
        foreach (brig_all('SELECT p.*, a.email FROM pd_requests p JOIN accounts a ON a.id = p.account_id ORDER BY p.status = \'new\' DESC, p.due_at') as $p) {
            $late = $p['status'] === 'new' && strtotime((string)$p['due_at']) < time() + 3 * 86400;
            $acc = brig_one('SELECT * FROM accounts WHERE id = ?', [(int)$p['account_id']]);
            $blk = $p['status'] === 'new' && $p['kind'] === 'delete' ? kab_pd_blockers($acc) : [];
            $rows .= '<tr><td>#' . (int)$p['id'] . '<div class="mut">' . $d($p['created_at']) . '</div></td><td>' . $h(KAB_PD_KINDS[$p['kind']] ?? $p['kind']) . '<div class="mut">' . $h($p['note']) . '</div></td><td><a href="panel.php?s=client&id=' . (int)$p['account_id'] . '">' . $h($p['email']) . '</a></td>'
                . '<td' . ($late ? ' style="color:#b4462b;font-weight:600"' : '') . '>' . $d($p['due_at']) . '</td><td>' . $h($p['status']) . ($p['reply'] ? '<div class="mut">' . $h($p['reply']) . '</div>' : '') . ($blk ? '<div class="mut">Мешает: ' . $h(implode('; ', $blk)) . '</div>' : '') . '</td>'
                . '<td>' . ($p['status'] === 'new' ? $form('pd_do', ['id' => $p['id']], '<input name="reply" size="16" placeholder="ответ (необяз.)">', $p['kind'] === 'delete' ? 'Обезличить' : 'Выполнить', $p['kind'] === 'delete' ? 'bad' : '') . $form('pd_reject', ['id' => $p['id']], $reasonIn, 'Отказать частично', 'lt') : '') . '</td></tr>';
        }
        adm_page('Заявки по ПДн', '<h1>Заявки по ПДн (152-ФЗ)</h1><p class="mut">Наш срок — ' . brig_terms()['pd_days'] . ' рабочих дней (закон — 30 дней). Удаление: контакты, бриф, фото, ответы — удаляются; договоры, подписи, чеки — хранятся ' . brig_terms()['retention_years'] . ' лет с закрытым доступом.</p><div class="scroll"><table><tr><th>#</th><th>Вид</th><th>Клиент</th><th>Срок</th><th>Статус</th><th></th></tr>' . ($rows ?: '<tr><td colspan="6">Заявок нет</td></tr>') . '</table></div>', 'pd', $msg);
    }
    case 'deals': {
        $rows = '';
        foreach (brig_all('SELECT j.*, b.name bname, r.object_title, r.test, o.number FROM br_jobs j JOIN br_brigades b ON b.id = j.brigade_id JOIN br_requests r ON r.id = j.request_id JOIN orders o ON o.id = r.order_id ORDER BY j.id DESC LIMIT 200') as $j) {
            $fl = ($j['frozen_at'] ? '<span class="st r">приостановлена</span> ' : '') . (brig_one("SELECT 1 FROM br_disputes WHERE job_id = ? AND status <> 'resolved'", [(int)$j['id']]) ? '<span class="st w">разногласие</span>' : '');
            $acts = in_array($j['status'], ['contract', 'work'], true) ? ($j['frozen_at'] ? $form('d_unfreeze', ['id' => $j['id']], $reasonIn, 'Возобновить') : $form('d_freeze', ['id' => $j['id']], $reasonIn, 'Приостановить', 'lt')) . $form('d_cancel', ['id' => $j['id']], $reasonIn, 'Отменить (LINEA)', 'bad') : '';
            $rows .= '<tr><td>#' . (int)$j['id'] . ($j['test'] ? ' <span class="test">тест</span>' : '') . '<div class="mut"><a href="panel.php?s=order&o=' . rawurlencode($j['number']) . '">' . $h($j['number']) . '</a></div></td><td>' . $h($j['object_title']) . '<div class="mut">' . $h($j['bname']) . '</div></td>'
                . '<td>' . $h(BRIG_JOB_STATUS[$j['status']] ?? $j['status']) . ' ' . $fl . '</td><td>' . $rub($j['deal_total_kop']) . '</td><td><a href="admin-brigady.php?j=' . (int)$j['id'] . '">карточка</a> ' . $acts . '</td></tr>';
        }
        adm_page('Сделки', '<h1>Сделки</h1><div class="scroll"><table><tr><th>#</th><th>Объект</th><th>Статус</th><th>Сумма</th><th>Действия (с причиной)</th></tr>' . ($rows ?: '<tr><td colspan="5">Сделок нет</td></tr>') . '</table></div>', 'deals', $msg);
    }
    case 'brigades': {
        $rows = '';
        foreach (brig_all('SELECT * FROM br_brigades WHERE demo = 0 ORDER BY id DESC LIMIT 300') as $b) {
            $ws = brig_all('SELECT * FROM br_warnings WHERE brigade_id = ? ORDER BY id DESC', [(int)$b['id']]);
            $rows .= '<tr><td><a href="panel.php?s=brigade&id=' . (int)$b['id'] . '">' . $h($b['name']) . '</a>' . ($b['test'] ? ' <span class="test">тест</span>' : '') . '<div class="mut">' . $h(BRIG_LEGAL[$b['legal']] ?? $b['legal']) . ' · ИНН ' . $h($b['inn']) . '</div></td>'
                . '<td>' . $h(BRIG_STATUS[$b['status']] ?? $b['status']) . '</td><td>' . ($ws ? implode('<br>', array_map(fn($w) => 'шаг ' . (int)$w['step'] . ': ' . $h($w['rule']) . ' <span class="mut">' . $d($w['at']) . ($w['until_at'] ? ', до ' . $d($w['until_at']) : '') . '</span>', array_slice($ws, 0, 3))) : '—') . '</td>'
                . '<td>' . $form('b_warn', ['id' => $b['id']], '<input name="rule" size="18" placeholder="пункт правил" required><input name="quote" size="18" placeholder="цитата нарушения">', 'Предупредить', 'lt') . '</td></tr>';
        }
        adm_page('Бригады', '<h1>Бригады</h1><p class="mut">Лестница: 1-е — предупреждение; 2-е — ниже в подборе на 14 дней; 3-е за 90 дней — лента новых заказов закрыта на 14 дней; дальше — приостановка или блок решением LINEA (в карточке бригады). Модерация анкет — в «Ремонт: модерация».</p><div class="scroll"><table><tr><th>Бригада</th><th>Статус</th><th>Предупреждения</th><th></th></tr>' . ($rows ?: '<tr><td colspan="4">Нет бригад</td></tr>') . '</table></div>', 'brigades', $msg);
    }
    case 'brigade': {   // анкета бригады: модерация (отметки проверки, ФНС, статус), файлы портфолио, команда, оплаты, предупреждения
        $b = brig_one('SELECT * FROM br_brigades WHERE id = ?', [(int)($_GET['id'] ?? 0)]);
        if (!$b) { adm_page('Бригада', '<p>Нет такой бригады.</p>', 'brigades'); }
        $bid = (int)$b['id']; $back = ['s_back' => 'brigade', 'id_back' => $bid];
        $img = fn(array $f) => '<span style="display:inline-block;margin:0 6px 6px 0;vertical-align:top"><a href="panel.php?file=' . (int)$f['id'] . '" target="_blank" rel="noopener">' . ($f['mime'] === 'image/jpeg' ? '<img src="panel.php?file=' . (int)$f['id'] . '" alt="" style="width:130px;height:96px;object-fit:cover;border:1px solid #ddd">' : 'файл #' . (int)$f['id']) . '</a><br>'
            . ($f['moderated_at'] ? '<span class="st g">в каталоге</span>' : '<span class="st w">на модерации</span> ' . $form('f_ok', ['id' => $f['id']] + $back, '', 'Одобрить', 'lt')) . $form('f_del', ['id' => $f['id']] + $back, '', 'Удалить', 'bad') . '</span>';
        $port = '';
        foreach (brig_all('SELECT * FROM br_portfolio WHERE brigade_id = ? ORDER BY id', [$bid]) as $pf) {
            $port .= '<div class="box"><b>' . $h($pf['title']) . '</b> <span class="mut">' . $h(BRIG_DISTRICTS[$pf['district']] ?? $pf['district']) . ', ' . $h($pf['area']) . ' м², ' . $h($pf['year']) . '</span><div>'
                . implode('', array_map($img, brig_all("SELECT * FROM br_files WHERE owner_kind = 'portfolio' AND owner_id = ? ORDER BY id", [(int)$pf['id']]))) . '</div></div>';
        }
        $logo = brig_all("SELECT * FROM br_files WHERE owner_kind = 'logo' AND brigade_id = ?", [$bid]);
        $team = implode('', array_map(fn($m) => '<li>' . $h($m['name']) . ' — ' . $h(BRIG_ROLES[$m['role']] ?? $m['role']) . ($m['removed_at'] ? ' <span class="mut">удалён ' . $d($m['removed_at']) . '</span>' : '') . '</li>', brig_all('SELECT * FROM br_members WHERE brigade_id = ? ORDER BY id', [$bid])));
        $fields = [['Форма', BRIG_LEGAL[$b['legal']] ?? $b['legal']], ['ИНН', $b['inn'] . (brig_inn_ok((string)$b['inn']) ? ' (контрольная сумма верна)' : ' (контрольная сумма НЕ сходится)')], ['Компания', $b['company']], ['Бригадир', $b['contact_name']],
            ['Телефон / почта', $b['phone'] . ' · ' . $b['email']], ['Специализации', implode(', ', array_map(fn($k) => BRIG_SPECS[$k] ?? $k, json_decode($b['specs'], true) ?: []))],
            ['Районы', implode(', ', array_map(fn($k) => BRIG_DISTRICTS[$k] ?? $k, json_decode($b['districts'], true) ?: []))], ['Состав / опыт', $b['team_size'] . ' чел. · ' . $b['experience'] . ' лет'],
            ['Рекомендатели (видит только LINEA)', $b['referees']], ['О бригаде', $b['about']], ['Гарантия', $b['warranty_months'] . ' мес.'], ['Принятые документы', 'ПДн ' . $b['consent_pd_ed'] . ', правила ' . $b['rules_ed'] . ', агентский ' . $b['agency_ed'] . ' — ' . $d($b['accepted_at']) . ', IP ' . $b['ip_reg']],
            ['Публичная карточка', $b['card_consent_ed'] === 'revoked' ? 'согласие отозвано — карточка снята' : 'согласие действует'], ['Проверка ФНС', $b['inn_check_note']]];
        $flds = implode('', array_map(fn($x) => '<tr><th style="width:220px">' . $h($x[0]) . '</th><td>' . nl2br($h($x[1])) . '</td></tr>', $fields));
        $inn = rawurlencode((string)$b['inn']);
        $acts = $form('b_check', ['id' => $bid] + $back, '<label><input type="checkbox" name="inn_ok" value="1"' . ($b['inn_checked_at'] ? ' checked' : '') . '> ИНН проверен</label><input name="inn_note" size="24" placeholder="что проверено" value="' . $h($b['inn_check_note']) . '"><label><input type="checkbox" name="call_ok" value="1"' . ($b['call_at'] ? ' checked' : '') . '> видеозвонок проведён</label>', 'Сохранить отметки')
            . $form('b_npd', ['id' => $bid] + $back, '', 'Статус НПД в ФНС', 'lt')
            . '<p class="mut">Проверить вручную: <a href="https://egrul.nalog.ru/" target="_blank" rel="noopener">ЕГРЮЛ/ЕГРИП</a> · <a href="https://pb.nalog.ru/search.html#t=' . $inn . '" target="_blank" rel="noopener">Прозрачный бизнес</a> · <a href="https://bankrot.fedresurs.ru/" target="_blank" rel="noopener">Федресурс</a> · <a href="https://fssp.gov.ru/" target="_blank" rel="noopener">ФССП</a></p>'
            . $form('b_status', ['id' => $bid, 'to' => 'active'] + $back, '', 'Допустить') . $form('b_status', ['id' => $bid, 'to' => 'draft'] + $back, '<input name="reason" size="26" placeholder="что доработать (увидит бригада)" required>', 'Вернуть на доработку', 'lt')
            . $form('b_status', ['id' => $bid, 'to' => 'suspended'] + $back, $reasonIn, 'Приостановить', 'lt') . $form('b_status', ['id' => $bid, 'to' => 'blocked'] + $back, '<input name="reason" size="26" placeholder="пункт правил и причина" required>', 'Заблокировать', 'bad');
        $jobs = implode('', array_map(fn($j) => '<tr><td>#' . (int)$j['id'] . '</td><td>' . $h($j['object_title']) . '</td><td>' . $h(BRIG_JOB_STATUS[$j['status']] ?? $j['status']) . '</td><td>' . $h(implode(', ', array_map(fn($p) => (BRIG_PAY_KIND[$p['kind']] ?? $p['kind']) . ' ' . brig_rub((int)$p['amount_kop']) . ' — ' . mb_strtolower(BRIG_PAY_STATUS[$p['status']] ?? $p['status']), brig_all("SELECT * FROM br_payments WHERE job_id = ? AND status <> 'planned'", [(int)$j['id']])))) . '</td></tr>',
            brig_all('SELECT j.id, j.status, r.object_title FROM br_jobs j JOIN br_requests r ON r.id = j.request_id WHERE j.brigade_id = ? ORDER BY j.id DESC', [$bid])));
        adm_page('Бригада', '<h1>' . $h($b['name']) . ' <span class="st ' . ($b['status'] === 'active' ? 'g' : ($b['status'] === 'review' ? 'w' : '')) . '">' . $h(BRIG_STATUS[$b['status']] ?? $b['status']) . '</span>' . ($b['test'] ? ' <span class="test">тест</span>' : '') . '</h1>'
            . ($b['status_reason'] ? '<p class="mut">Причина статуса: ' . $h($b['status_reason']) . '</p>' : '') . '<div class="box">' . $acts . '</div><table>' . $flds . '</table>'
            . '<h2>Портфолио (новые файлы — в каталоге после одобрения)</h2>' . ($port ?: '<p class="mut">Нет объектов.</p>') . ($logo ? '<h2>Логотип</h2>' . implode('', array_map($img, $logo)) : '')
            . '<h2>Команда</h2>' . ($team ? '<ul>' . $team . '</ul>' : '<p class="mut">Только владелец.</p>') . '<h2>Сделки и оплаты (реестр)</h2><div class="scroll"><table><tr><th>#</th><th>Объект</th><th>Статус</th><th>Отметки оплат</th></tr>' . ($jobs ?: '<tr><td colspan="4">Нет</td></tr>') . '</table></div>', 'brigades', $msg);
    }
    case 'requests': {   // запросы бригадам: пакет проекта, кандидаты, рассылка с лимитом invite_max
        $rid = (int)($_GET['id'] ?? 0);
        if ($rid && ($r = brig_one('SELECT r.*, o.number FROM br_requests r JOIN orders o ON o.id = r.order_id WHERE r.id = ?', [$rid]))) {
            $back = ['s_back' => 'requests', 'id_back' => $rid];
            $pack = json_decode((string)$r['pack'], true) ?: [];
            $sent = (int)db_val('SELECT COUNT(*) FROM br_invites WHERE request_id = ? AND sent_at IS NOT NULL', [$rid]);
            $max = brig_terms()['invite_max'];
            $cand = '';
            foreach (candidates($r) as $c) {
                $inv = brig_one('SELECT * FROM br_invites WHERE request_id = ? AND brigade_id = ?', [$rid, (int)$c['b']['id']]);
                $cand .= '<li><label><input type="checkbox" name="bid[]" value="' . (int)$c['b']['id'] . '"' . ($inv && $inv['sent_at'] ? ' disabled checked' : '') . '> ' . $h($c['b']['name']) . '</label> <span class="mut">покрытие ' . round($c['cover'] * 100) . ' %, балл ' . $c['score'] . ($inv && $inv['sent_at'] ? ', отправлено ' . $d($inv['sent_at']) : '') . '</span></li>';
            }
            foreach (brig_all("SELECT b.id, b.name FROM br_invites i JOIN br_brigades b ON b.id = i.brigade_id WHERE i.request_id = ? AND i.sent_at IS NULL AND i.source = 'client'", [$rid]) as $x) {
                $cand .= '<li><label><input type="checkbox" name="bid[]" value="' . (int)$x['id'] . '" checked> ' . $h($x['name']) . '</label> <span class="mut">пригласил заказчик</span><input type="hidden" name="src[' . (int)$x['id'] . ']" value="client"></li>';
            }
            $files = implode('', array_map(fn($f) => '<li><a href="panel.php?file=' . (int)$f['id'] . '">' . $h($f['title'] ?: 'файл #' . $f['id']) . '</a> ' . $form('r_file_del', ['id' => $f['id']] + $back, '', 'удалить', 'lt') . '</li>', brig_all("SELECT * FROM br_files WHERE owner_kind = 'pack' AND owner_id = ?", [$rid])));
            $offers = implode('', array_map(fn($o) => '<tr><td>' . $h($o['name']) . '</td><td>' . $h($o['status']) . ($o['mode'] === 'sections' ? ' · по разделам' : '') . '</td><td>' . $rub($o['total_kop']) . '</td><td>' . (int)$o['days'] . ' дн., аванс ' . (int)$o['advance_pct'] . ' %</td></tr>',
                brig_all('SELECT o.*, b.name FROM br_offers o JOIN br_brigades b ON b.id = o.brigade_id WHERE o.request_id = ? ORDER BY o.total_kop', [$rid])));
            adm_page('Запрос', '<h1>Запрос #' . $rid . ' · ' . $h($r['object_title']) . '</h1><p class="mut">Заказ <a href="panel.php?s=order&o=' . rawurlencode($r['number']) . '">' . $h($r['number']) . '</a> · ' . $h(BRIG_DISTRICTS[$r['district']] ?? $r['district']) . ' · ' . $h(BRIG_REQ_STATUS[$r['status']] ?? $r['status']) . ($r['deadline_at'] ? ', ответ до ' . $d($r['deadline_at']) : '') . '</p>'
                . '<div class="box"><h2>Пакет проекта</h2><p>' . (empty($pack['positions']) ? '<b>Пакета нет.</b> Соберите tools/brigady-pack.mjs и загрузите pack.json.' : count($pack['positions']) . ' позиций, ' . count($pack['rooms'] ?? []) . ' помещений') . '</p>'
                . $form('r_pack', ['id' => $rid] + $back, 'pack.json <input type="file" name="pack" accept=".json"> файлы (PDF/xlsx) <input type="file" name="f1"><input type="file" name="f2">', 'Загрузить', '', true) . ($files ? '<ul>' . $files . '</ul>' : '') . '</div>'
                . '<div class="box"><h2>Рассылка — отправлено ' . $sent . ' из ' . $max . '</h2><form method="post"><input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="act" value="r_send"><input type="hidden" name="id" value="' . $rid . '"><input type="hidden" name="s_back" value="requests"><input type="hidden" name="id_back" value="' . $rid . '">'
                . '<ul style="list-style:none;padding:0">' . ($cand ?: '<li class="mut">Нет допущенных бригад с этим районом и специализациями.</li>') . '</ul>Срок ответа <input type="datetime-local" name="deadline" value="' . $h(date('Y-m-d\TH:i', strtotime(kab_wd_add(linea_now(), brig_terms()['offer_deadline_wd'])))) . '"> <button>Разослать</button></form></div>'
                . ($offers ? '<h2>Предложения</h2><table><tr><th>Бригада</th><th>Статус</th><th>Сумма</th><th>Срок</th></tr>' . $offers . '</table>' : '')
                . ($r['status'] !== 'cancelled' && $r['status'] !== 'chosen' ? '<p>' . $form('r_cancel', ['id' => $rid] + $back, $reasonIn, 'Отменить запрос', 'bad') . '</p>' : ''), 'requests', $msg);
        }
        $rows = implode('', array_map(fn($r) => '<tr><td><a href="panel.php?s=requests&id=' . (int)$r['id'] . '">#' . (int)$r['id'] . '</a>' . ($r['test'] ? ' <span class="test">тест</span>' : '') . '</td><td>' . $h($r['object_title']) . '</td><td>' . $h(BRIG_DISTRICTS[$r['district']] ?? $r['district']) . '</td><td>' . $h(BRIG_REQ_STATUS[$r['status']] ?? $r['status']) . '</td><td>'
            . (int)db_val('SELECT COUNT(*) FROM br_invites WHERE request_id = ? AND sent_at IS NOT NULL', [(int)$r['id']]) . ' / ' . (int)db_val("SELECT COUNT(*) FROM br_offers WHERE request_id = ? AND status <> 'draft'", [(int)$r['id']]) . '</td><td>' . $d($r['deadline_at']) . '</td></tr>', brig_all('SELECT * FROM br_requests ORDER BY id DESC LIMIT 200')));
        adm_page('Запросы бригадам', '<h1>Запросы бригадам</h1><p class="mut">Пакет получают не больше ' . brig_terms()['invite_max'] . ' бригад, заказчик видит не больше ' . brig_terms()['offers_show_max'] . ' предложений.</p><div class="scroll"><table><tr><th>#</th><th>Объект</th><th>Район</th><th>Статус</th><th>Разослано / предложений</th><th>Срок</th></tr>' . ($rows ?: '<tr><td colspan="6">Запросов нет</td></tr>') . '</table></div>', 'requests', $msg);
    }
    case 'export': {
        $l = implode('', array_map(fn($k, $t) => '<li><a href="panel.php?csv=' . $k . '">' . $h($t) . '</a></li>', array_keys(ADM_CSV), ADM_CSV));
        adm_page('Экспорт', '<h1>Экспорт CSV</h1><p class="mut">Разделитель «;», UTF-8 с BOM (открывается в Excel). Ячейки, начинающиеся с «=», «+», «−», «@», выгружаются с апострофом — Excel не исполнит их как формулу. Контактов и ПДн клиентов в выгрузках нет; каждая выгрузка — в журнале.</p><ul>' . $l . '</ul>', 'export', $msg);
    }
    case 'contracts': {
        $rows = '';
        foreach (brig_all('SELECT * FROM br_contracts ORDER BY id DESC LIMIT 300') as $c) {
            $rows .= '<tr><td>сделка #' . (int)$c['job_id'] . '</td><td>' . ($c['kind'] === 'main' ? 'Договор' : 'Допсоглашение № ' . (int)$c['num']) . ' · ' . $h($c['status']) . '</td><td><code>' . $h(substr((string)$c['hash'], 0, 16)) . '</code></td>'
                . '<td>заказчик: ' . $d($c['client_signed_at']) . ' ' . $h($c['client_ip']) . '<br>бригада: ' . $d($c['brigade_signed_at']) . ' ' . $h($c['brigade_ip']) . '</td><td>' . $form('c_verify', ['id' => $c['id']], '', 'Проверить хеш', 'lt') . '</td></tr>';
        }
        $sig = implode('', array_map(fn($x) => '<tr><td>' . $h($x['doc_kind']) . ' ' . $h($x['doc_id']) . '</td><td>' . $h($x['who_role']) . '#' . (int)$x['who_id'] . '</td><td>' . $d($x['at']) . ' МСК</td><td>' . $h($x['ip']) . '</td><td><code>' . $h(substr((string)$x['sha256'], 0, 16)) . '</code></td><td>' . $h($x['method']) . '</td></tr>', brig_all('SELECT * FROM signatures ORDER BY id DESC LIMIT 300')));
        adm_page('Договоры и подписи', '<h1>Договоры и подписи</h1><h2>Договоры подряда (ПЭП кодом на почту)</h2><div class="scroll"><table><tr><th>Сделка</th><th>Документ</th><th>SHA-256</th><th>Подписи (время, IP)</th><th></th></tr>' . ($rows ?: '<tr><td colspan="5">Нет</td></tr>') . '</table></div>'
            . '<h2>Подписи кабинета (решения проекта, принятие альбома)</h2><div class="scroll"><table><tr><th>Документ</th><th>Кто</th><th>Время</th><th>IP</th><th>SHA-256</th><th>Способ</th></tr>' . ($sig ?: '<tr><td colspan="6">Нет</td></tr>') . '</table></div>', 'contracts', $msg);
    }
    case 'disputes': {
        $rows = '';
        $thread = '';
        foreach (brig_all("SELECT * FROM br_disputes WHERE status <> 'resolved' ORDER BY id DESC LIMIT 30") as $ds) {
            $ms = implode('', array_map(fn($m) => '<li><b>' . $h(['client' => 'Заказчик', 'brigade' => 'Бригада', 'admin' => 'LINEA'][$m['who']] ?? $m['who']) . '</b> <span class="mut">' . $d($m['at']) . '</span><br>' . nl2br($h($m['text'])) . '</li>',
                brig_all('SELECT * FROM br_dispute_msgs WHERE dispute_id = ? ORDER BY id', [(int)$ds['id']])));
            $thread .= '<div class="box"><h2>#' . (int)$ds['id'] . ' · ' . $h($ds['subject']) . ' <span class="mut">сделка #' . (int)$ds['job_id'] . '</span></h2><ul>' . $ms . '</ul>'
                . $form('d_msg', ['id' => $ds['id'], 's_back' => 'disputes'], '<textarea name="text" rows="2" cols="50" placeholder="сообщение LINEA — видят обе стороны"></textarea>', 'Написать')
                . $form('d_resolve', ['id' => $ds['id'], 's_back' => 'disputes'], '<input name="reason" size="40" placeholder="итоговая рекомендация (право на суд сохраняется)" required>', 'Закрыть с рекомендацией', 'lt') . '</div>';
        }
        foreach (brig_all('SELECT * FROM br_disputes ORDER BY status = \'resolved\', id DESC LIMIT 200') as $ds) {
            $due = kab_wd_add((string)$ds['created_at'], brig_terms()['dispute_reply_days']);
            $rows .= '<tr><td>#' . (int)$ds['id'] . ' · сделка #' . (int)$ds['job_id'] . '<div class="mut">открыл: ' . $h($ds['opened_by']) . ', ' . $d($ds['created_at']) . '</div></td><td>' . $h($ds['subject']) . '</td><td>' . $h($ds['status']) . '<div class="mut">ответ стороны до ' . $d($due) . ($ds['proposal_due_at'] ? '; согласиться с рекомендацией до ' . $d($ds['proposal_due_at']) : '') . '</div></td>'
                . '<td>' . ($ds['status'] !== 'resolved' ? $form('ds_propose', ['id' => $ds['id']], '<input name="text" size="28" placeholder="рекомендация LINEA">', 'Предложить решение') : $h($ds['resolution'])) . '</td></tr>';
        }
        adm_page('Разногласия', '<h1>Рассмотрение разногласий</h1><p class="mut">Порядок: ответ второй стороны — ' . brig_terms()['dispute_reply_days'] . ' р.дн; рекомендация LINEA — стороны соглашаются за ' . brig_terms()['dispute_proposal_days'] . ' р.дн. Рекомендация необязательна, право на суд сохраняется. Выезд практика оплачивает сторона, чья позиция не подтвердилась.</p><div class="scroll"><table><tr><th>#</th><th>Тема</th><th>Сроки</th><th></th></tr>' . ($rows ?: '<tr><td colspan="4">Разногласий нет</td></tr>') . '</table></div><h2>Переписка по открытым разногласиям</h2>' . ($thread ?: '<p class="mut">Открытых разногласий нет.</p>'), 'disputes', $msg);
    }
    case 'money': {
        ledger_sync_all();
        $req = linea_requisites();
        $rows = '';
        $ST = ['accrued' => 'начислено, ещё не к оплате', 'deferred' => 'отложено до ИП LINEA', 'due' => 'к оплате — выставить счёт', 'invoiced' => 'счёт выставлен', 'paid' => 'оплачено', 'waived' => 'самозанятая — без вознаграждения', 'void' => 'списано/отменено'];
        foreach (brig_all("SELECT l.*, b.name, j.commission_due_why, j.commission_rate FROM br_ledger l JOIN br_brigades b ON b.id = l.brigade_id JOIN br_jobs j ON j.id = l.job_id WHERE l.kind = 'accrual' ORDER BY l.id DESC") as $l) {
            $inv = $l['invoice_id'] ? brig_one('SELECT * FROM br_invoices WHERE id = ?', [(int)$l['invoice_id']]) : null;
            $acts = in_array($l['status'], ['due', 'accrued'], true) && $req ? $form('m_invoice', ['id' => $l['job_id']], $l['status'] === 'accrued' ? '<input type="hidden" name="manual" value="1">' . $reasonIn : '', $l['status'] === 'accrued' ? 'Счёт вручную' : 'Выставить счёт') : '';
            if ($inv && !$inv['paid_at']) { $acts .= $form('m_paid', ['id' => $inv['id']], '<input name="reason" size="16" placeholder="№ платёжки, дата">', 'Оплачен'); }
            if (!in_array($l['status'], ['paid', 'void'], true)) { $acts .= $form('m_writeoff', ['id' => $l['job_id']], $reasonIn, 'Списать', 'lt'); }
            $rows .= '<tr><td>сделка #' . (int)$l['job_id'] . '<div class="mut">' . $h($l['name']) . '</div></td><td>' . $rub($l['amount_kop']) . '<div class="mut">' . brig_rate_text((float)$l['commission_rate']) . '</div></td><td>' . $h($ST[$l['status']] ?? $l['status']) . ($l['commission_due_why'] ? '<div class="mut">' . $h($l['commission_due_why']) . '</div>' : '') . '</td><td>' . ($inv ? $h($inv['number']) . ', до ' . $h($inv['due_at']) : '—') . '</td><td>' . $acts . '</td></tr>';
        }
        $def = (int)db_val("SELECT COUNT(*) FROM br_ledger WHERE kind = 'accrual' AND status = 'deferred'");
        adm_page('Деньги', '<h1>Вознаграждение площадки</h1>' . (!$req ? '<p class="warn">Реквизитов ИП/ООО LINEA нет — вознаграждение «отложено»: счета не выставляются (агентская деятельность на НПД запрещена — ⚠ проверить у юриста). Заполните реквизиты в «Настройках».</p>' : '')
            . '<p>' . $form('m_invoice_deferred', [], '', 'Выставить все отложенные (' . $def . ')', $req ? '' : 'lt') . '</p>'
            . '<div class="scroll"><table><tr><th>Сделка</th><th>Сумма</th><th>Состояние</th><th>Счёт</th><th>Действия</th></tr>' . ($rows ?: '<tr><td colspan="5">Начислений нет</td></tr>') . '</table></div>'
            . '<p class="mut">Проводки (начисление, пересчёт, оплата, списание) — br_ledger; CSV — <a href="admin-brigady.php?view=money">в старой вкладке «Комиссия»</a>.</p>', 'money', $msg);
    }
    case 'sheets': {
        $rows = implode('', array_map(fn($x) => '<tr><td>#' . (int)$x['id'] . '</td><td>сделка #' . (int)$x['job_id'] . '</td><td>' . $h($x['status']) . '</td><td>' . $h(mb_substr((string)$x['text'], 0, 120)) . '</td><td>' . $d($x['created_at']) . '</td></tr>', brig_all('SELECT * FROM br_sheet_reqs ORDER BY id DESC LIMIT 100')));
        adm_page('Листы', '<h1>Листы по запросу</h1><p><a href="admin-brigady.php?view=sheets">Очередь с действиями →</a></p><table><tr><th>#</th><th>Сделка</th><th>Статус</th><th>Что нужно</th><th>Когда</th></tr>' . ($rows ?: '<tr><td colspan="5">Нет</td></tr>') . '</table>', 'sheets', $msg);
    }
    case 'signals': {
        $rows = implode('', array_map(fn($x) => '<tr><td>' . $d($x['at']) . '</td><td>' . $h($x['kind']) . '</td><td>' . $h($x['who']) . '</td><td>' . $h($x['field']) . '</td><td>' . ($x['job_id'] ? 'сделка #' . (int)$x['job_id'] : '') . '</td></tr>', brig_all('SELECT * FROM br_signals ORDER BY id DESC LIMIT 200')));
        adm_page('Сигналы', '<h1>Сигналы обхода</h1><p><a href="admin-brigady.php?view=signals">Сводка по бригадам →</a></p><div class="scroll"><table><tr><th>Когда</th><th>Вид</th><th>Кто</th><th>Где</th><th>Сделка</th></tr>' . ($rows ?: '<tr><td colspan="5">Нет</td></tr>') . '</table></div>', 'signals', $msg);
    }
    case 'audit': {
        $who = (string)($_GET['who'] ?? 'admin'); $q = trim((string)($_GET['q'] ?? ''));
        $w = []; $args = [];
        if ($who === 'admin') { $w[] = "who = 'admin'"; }
        if ($q !== '') { $w[] = '(action LIKE ? OR target LIKE ? OR detail LIKE ?)'; array_push($args, "%$q%", "%$q%", "%$q%"); }
        $rows = implode('', array_map(fn($x) => '<tr><td class="mut">' . $d($x['at']) . '</td><td>' . $h($x['who']) . '</td><td>' . $h($x['action']) . '</td><td>' . $h($x['target']) . '</td><td>' . $h($x['detail']) . '</td><td class="mut">' . $h($x['ip']) . '</td></tr>',
            brig_all('SELECT * FROM br_audit ' . ($w ? 'WHERE ' . implode(' AND ', $w) : '') . ' ORDER BY id DESC LIMIT 500', $args)));
        adm_page('Журнал', '<h1>Журнал действий</h1><p><a href="panel.php?s=audit&who=admin">только администратор</a> · <a href="panel.php?s=audit&who=all">все (клиенты, бригады, система)</a></p>'
            . '<form method="get" class="inl"><input type="hidden" name="s" value="audit"><input type="hidden" name="who" value="' . $h($who) . '"><input name="q" value="' . $h($q) . '" placeholder="действие, объект"><button>Найти</button></form>'
            . '<p class="mut">Записи только добавляются — ни удалить, ни исправить из админки нельзя.</p><div class="scroll"><table><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Подробно</th><th>IP</th></tr>' . ($rows ?: '<tr><td colspan="6">Пусто</td></tr>') . '</table></div>', 'audit', $msg);
    }
    case 'settings': {
        $t = brig_terms();
        $LBL = ['rate' => 'Ставка вознаграждения (доля)', 'pilot' => 'Пилот', 'stage_remind_days' => 'Напоминания о приёмке, р.дн', 'stage_silence_days' => 'Молчание заказчика → сигнал и предложение разногласий, р.дн',
            'stage_silence_days_hidden' => 'То же для скрытых работ, р.дн', 'stage_autoaccept' => 'Автоприёмка молчанием (нельзя для потребителей — не включается)', 'protect_months' => 'Защита связи заказчик–бригада, мес.',
            'exit_fee' => '«Работать напрямую» за плату', 'invite_max' => 'Пакет получают бригад', 'offers_show_max' => 'Заказчик видит предложений', 'dispute_reply_days' => 'Ответ в разногласии, р.дн',
            'dispute_proposal_days' => 'Согласие с рекомендацией, р.дн', 'fee_base' => 'База вознаграждения (works — только работы)', 'npd' => 'Самозанятые бригады', 'retention_years' => 'Хранение договоров, лет (⚠ юрист)',
            'expert_visit_payer' => 'Выезд практика оплачивает', 'choose_after' => 'Подбор бригады после (final — финальный альбом)', 'bypass_penalty' => 'Неустойка за обход (только бригаде; выкл. до юриста)',
            'termination_fee_base' => 'Вознаграждение при расторжении — от', 'pd_days' => 'Заявки по ПДн, р.дн', 'fresh_code_hours' => 'Свежесть кода для значимых действий, ч'];
        $rows = '';
        foreach (BRIG_TERMS_DEFAULT as $k => $def) {
            $v = $t[$k] ?? $def;
            $inp = is_array($def) ? '<input name="t[' . $k . ']" size="50" value="' . $h(json_encode($v, JSON_UNESCAPED_UNICODE)) . '">'
                : (is_bool($def) ? '<select name="t[' . $k . ']"' . ($k === 'stage_autoaccept' ? ' disabled' : '') . '><option value="1"' . ($v ? ' selected' : '') . '>да</option><option value="0"' . (!$v ? ' selected' : '') . '>нет</option></select>'
                : '<input name="t[' . $k . ']" size="14" value="' . $h((string)$v) . '">');
            $rows .= '<tr><td>' . $h($LBL[$k] ?? $k) . '<div class="mut">' . $h($k) . '</div></td><td>' . $inp . '</td></tr>';
        }
        $req = linea_requisites() ?? (linea_settings('requisites') ?: []);
        $hol = implode(' ', array_map(fn($x) => '<span class="st">' . $h($x['d']) . '</span>', brig_all('SELECT d FROM holidays ORDER BY d')));
        $body = '<h1>Настройки</h1><p class="warn">Тексты условий на сайте (/brigadam/, /remont/, договоры) берутся из BRIG_TERMS в tools/site-shell.js: после изменения ставки, сроков или правил — пересобрать страницы (node tools/gen-brigady-pages.js) и выложить. Подписанные сделки не меняются: условия зафиксированы в договоре.</p>'
            . '<form method="post"><input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="act" value="set_terms"><div class="scroll"><table><tr><th>Параметр</th><th>Значение</th></tr>' . $rows . '</table></div><p><button>Сохранить условия</button></p></form>'
            . '<h2>Реквизиты LINEA (ИП/ООО)</h2><div class="box">' . $form('set_requisites', [], '<input name="name" size="26" placeholder="ИП Фамилия И. О." value="' . $h($req['name'] ?? '') . '"><input name="inn" size="13" placeholder="ИНН" value="' . $h($req['inn'] ?? '') . '"><input name="ogrn" size="15" placeholder="ОГРНИП" value="' . $h($req['ogrn'] ?? '') . '"><input name="bank" size="30" placeholder="банк, р/с, БИК" value="' . $h($req['bank'] ?? '') . '">', 'Сохранить реквизиты')
            . '<p class="mut">Пусто — вознаграждение «отложено до ИП»: начисляется, но счёт не выставляется.</p></div>'
            . '<h2>Производственный календарь (праздники)</h2><div class="box">' . ($hol ?: '<span class="mut">праздников не задано — считаются только субботы и воскресенья</span>') . '<br>'
            . $form('set_holiday', [], '<input name="d" placeholder="2027-01-01" size="11"><input name="note" placeholder="Новый год" size="14"><label><input type="checkbox" name="del" value="1"> удалить</label>', 'Сохранить день') . '</div>';
        adm_page('Настройки', $body, 'settings', $msg);
    }
}
adm_page('Нет раздела', '<p>Раздел не найден.</p>', 'dash', $msg);
