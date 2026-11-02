<?php
/**
 * Закрытая страница «Ремонт по проекту»: api/admin-brigady.php — тот же вход, что admin.php (сессия linea_adm, пароль admin_hash,
 * только https, CSRF на каждое действие). Без входа — на admin.php.
 *   Бригады: анкета, фото, ИНН (контрольная сумма, ссылки ФНС, открытый API статуса НПД), видеозвонок, допуск/приостановка/блок с причиной
 *   Запросы: пакет проекта (pack.json + ведомости/листы), автоподбор бригад, ручная правка, срок, рассылка; все предложения
 *   Объекты и этапы; споры (переписка, решение); комиссия (счёт, оплата, CSV); отзывы (скрыть только по правилам, с причиной);
 *   очередь «лист по запросу»; журнал действий.
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/brig.php';
require __DIR__ . '/lib/sheets.php';
require __DIR__ . '/lib/kabinet.php';
require __DIR__ . '/lib/adm-brigady-act.php';

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:");
header('Referrer-Policy: no-referrer');
$https = linea_https();
if (!$https && !linea_local()) { http_response_code(403); header('Content-Type: text/plain; charset=utf-8'); exit('Только по https'); }
linea_mkdir(linea_private() . '/sessions');
ini_set('session.save_handler', 'files');
session_save_path(linea_private() . '/sessions');
session_name('linea_adm');
session_set_cookie_params(['lifetime' => 0, 'path' => dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/api/admin-brigady.php')) . '/', 'httponly' => true, 'samesite' => 'Strict', 'secure' => $https]);
session_start();
if (empty($_SESSION['adm'])) { header('Location: admin.php'); exit; }
brig_db();
$csrf = (string)$_SESSION['csrf'];
$self = basename(__FILE__);
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
$now = linea_now();
$WHO = 'admin';

function apage(string $title, string $body): never
{
    echo '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">'
        . '<title>' . htmlspecialchars($title) . ' — LINEA · бригады</title><style>'
        . 'body{font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f4f2ee;color:#1d1b18}main{max-width:1240px;margin:0 auto;padding:16px}'
        . 'h1{font-size:21px;margin:0 0 10px}h2{font-size:17px;margin:0 0 8px}table{width:100%;border-collapse:collapse;background:#fff}th,td{padding:7px 9px;border-bottom:1px solid #e3ded4;text-align:left;vertical-align:top;font-size:14px}'
        . 'th{background:#ebe6dc;font-weight:600}a{color:#8a5a12}.st{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;background:#eee}'
        . '.st-review,.st-new,.st-open{background:#fbe7c4}.st-active,.st-work,.st-sent,.st-ready{background:#cfe9d5}.st-done,.st-chosen,.st-accepted{background:#d6e4f5}.st-suspended,.st-question{background:#f6d6b8}.st-blocked,.st-cancelled{background:#e6e6e6;color:#777}'
        . '.box{background:#fff;padding:12px 14px;margin:0 0 12px;border:1px solid #e3ded4}form.inl{display:inline-flex;gap:6px;margin:3px 6px 3px 0;align-items:center;flex-wrap:wrap}'
        . 'input,select,button,textarea{font:inherit;padding:5px 8px;max-width:100%}button{cursor:pointer;background:#1d1b18;color:#fff;border:0;border-radius:3px}button.lt{background:#ddd;color:#222}button.bad{background:#a33b22}'
        . '.test{color:#b4462b;font-weight:600}.mut{color:#777;font-size:13px}.top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}.nav a{margin-right:10px;white-space:nowrap}'
        . '.msg{background:#fff6d8;padding:8px 12px;margin:0 0 12px}.ph{display:flex;flex-wrap:wrap;gap:6px}.ph img{width:140px;height:105px;object-fit:cover;border:1px solid #ddd}'
        . '.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ok{color:#2c7a4b}.no{color:#a33b22}.scroll{overflow-x:auto}'
        . '@media(max-width:760px){.grid{grid-template-columns:1fr}.hide-m{display:none}th,td{padding:6px;font-size:13px}}</style></head><body><main>' . $body . '</main></body></html>';
    exit;
}

// ── файл (админ видит все файлы сервиса)
if (isset($_GET['file'])) {
    $f = brig_one('SELECT * FROM br_files WHERE id = ?', [(int)$_GET['file']]);
    if (!$f) { http_response_code(404); exit; }
    brig_send_file($f);
}
// ── выгрузка CSV комиссии
if (($_GET['csv'] ?? '') === 'money') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="linea-komissiya-' . date('Y-m-d') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    // ячейки, начинающиеся с = + - @ (и табуляции/перевода строки), Excel исполняет как формулу — префикс «'» (ревью кода, низкий)
    $cell = fn($v) => is_string($v) && $v !== '' && strpbrk($v[0], "=+-@\t\r") !== false ? "'" . $v : $v;
    fputcsv($out, ['Объект', 'Заказ', 'Бригада', 'ИНН', 'Цена договора, ₽', 'Вознаграждение ' . brig_rate_text() . ', ₽', 'Начислена', 'Счёт', 'Выставлен', 'Оплачен', 'Тест'], ';', '"', '');
    foreach (brig_all('SELECT j.id, j.commission_kop, j.commission_at, r.object_title, r.test, o2.number onum, b.name, b.inn, COALESCE(j.deal_total_kop, ofr.total_kop) total_kop, i.number inum, i.issued_at, i.paid_at
            FROM br_jobs j JOIN br_requests r ON r.id = j.request_id JOIN orders o2 ON o2.id = r.order_id JOIN br_brigades b ON b.id = j.brigade_id JOIN br_offers ofr ON ofr.id = j.offer_id
            LEFT JOIN br_invoices i ON i.job_id = j.id ORDER BY j.id', []) as $x) {
        fputcsv($out, [$cell((string)$x['object_title']), $x['onum'], $cell((string)$x['name']), $x['inn'], number_format((int)$x['total_kop'] / 100, 2, ',', ''), $x['commission_kop'] !== null ? number_format((int)$x['commission_kop'] / 100, 2, ',', '') : '',
            $x['commission_at'], $x['inum'], $x['issued_at'], $x['paid_at'], $x['test'] ? 'да' : ''], ';', '"', '');
    }
    brig_audit($WHO, 'csv-export', 'money');
    exit;
}

// ── действия
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if (!hash_equals($csrf, (string)($_POST['csrf'] ?? ''))) { http_response_code(403); apage('Ошибка', '<p>Форма устарела — обновите страницу.</p>'); }
    $act = (string)($_POST['act'] ?? '');
    $id = (int)($_POST['id'] ?? 0);
    $reason = linea_str($_POST['reason'] ?? '', 500);
    $back = $self;
    $msg = '';
    if ($act === 'logout') { session_destroy(); header('Location: admin.php'); exit; }
    [$msg, $back] = adm_brig_act($act, $id, $reason, $WHO, $self);
    $_SESSION['bmsg'] = $msg;
    header('Location: ' . $back); exit;
}
$msg = (string)($_SESSION['bmsg'] ?? ''); unset($_SESSION['bmsg']);

$form = fn(string $act, int $id, string $inner, string $btn, string $cls = '', string $extra = '') =>
    '<form method="post" class="inl"' . $extra . '><input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="act" value="' . $act . '"><input type="hidden" name="id" value="' . $id . '">'
    . $inner . '<button' . ($cls ? ' class="' . $cls . '"' : '') . '>' . $btn . '</button></form>';
$st = fn(string $k, array $map) => '<span class="st st-' . $h($k) . '">' . $h($map[$k] ?? $k) . '</span>';
$cnt = fn(string $sql) => (int)db_val($sql);
$top = '<div class="top"><h1>LINEA · ремонт по проекту</h1><div><a href="admin.php">← заказы проектов</a> '
    . '<form method="post" class="inl"><input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="act" value="logout"><button class="lt">Выйти</button></form></div></div>'
    . '<p class="nav"><a href="' . $self . '">Бригады (' . $cnt("SELECT COUNT(*) FROM br_brigades WHERE status = 'review'") . ' на проверке)</a>'
    . '<a href="' . $self . '?view=requests">Запросы (' . $cnt("SELECT COUNT(*) FROM br_requests WHERE status = 'new'") . ' новых)</a>'
    . '<a href="' . $self . '?view=offers">Предложения</a><a href="' . $self . '?view=jobs">Объекты</a>'
    . '<a href="' . $self . '?view=disputes">Споры (' . $cnt("SELECT COUNT(*) FROM br_disputes WHERE status = 'open'") . ')</a>'
    . '<a href="' . $self . '?view=signals">Сигналы обхода (' . $cnt("SELECT COUNT(*) FROM br_signals WHERE at > '" . date('Y-m-d H:i:s', time() - 7 * 86400) . "'") . ' за неделю)</a>'
    . '<a href="' . $self . '?view=money">Комиссия</a><a href="' . $self . '?view=reviews">Отзывы</a><a href="' . $self . '?view=sheets">Листы по запросу</a><a href="' . $self . '?view=audit">Журнал</a></p>'
    . ($msg ? '<p class="msg">' . $h($msg) . '</p>' : '');
$img = fn(int $fid) => '<a href="' . $self . '?file=' . $fid . '" target="_blank" rel="noopener"><img src="' . $self . '?file=' . $fid . '" alt="" loading="lazy"></a>';
$view = (string)($_GET['view'] ?? '');

// ── карточка бригады
if (isset($_GET['b']) && ($b = brig_one('SELECT * FROM br_brigades WHERE id = ?', [(int)$_GET['b']]))) {
    $bid = (int)$b['id'];
    $port = '';
    foreach (brig_all('SELECT * FROM br_portfolio WHERE brigade_id = ? ORDER BY id', [$bid]) as $p) {
        $fs = brig_all("SELECT id, kind FROM br_files WHERE owner_kind = 'portfolio' AND owner_id = ? ORDER BY kind DESC, id", [(int)$p['id']]);
        $port .= '<div class="box"><b>' . $h($p['title']) . '</b> <span class="mut">' . $h(BRIG_DISTRICTS[$p['district']] ?? '') . ($p['area'] ? ', ' . $h($p['area']) . ' м²' : '') . ($p['year'] ? ', ' . (int)$p['year'] : '') . '</span><p>' . nl2br($h($p['works'])) . '</p>'
            . '<div class="mut">до</div><div class="ph">' . implode('', array_map(fn($f) => $img((int)$f['id']), array_filter($fs, fn($f) => $f['kind'] === 'before'))) . '</div>'
            . '<div class="mut">после</div><div class="ph">' . implode('', array_map(fn($f) => $img((int)$f['id']), array_filter($fs, fn($f) => $f['kind'] === 'after'))) . '</div></div>';
    }
    $innOk = brig_inn_ok((string)$b['inn']);
    $links = '<a href="https://npd.nalog.ru/check-status/" target="_blank" rel="noopener noreferrer">ФНС: статус самозанятого</a> · <a href="https://egrul.nalog.ru/" target="_blank" rel="noopener noreferrer">ЕГРЮЛ/ЕГРИП</a> · '
        . '<a href="https://pb.nalog.ru/" target="_blank" rel="noopener noreferrer">Прозрачный бизнес</a> · <a href="https://fedresurs.ru/" target="_blank" rel="noopener noreferrer">Федресурс (банкротство)</a>';
    $checks = $form('b_check', $bid, '<label><input type="checkbox" name="inn_ok" value="1"' . ($b['inn_checked_at'] ? ' checked' : '') . '> ИНН проверен</label> <input name="inn_note" size="28" placeholder="что проверили" value="' . $h($b['inn_check_note']) . '">'
        . '<label><input type="checkbox" name="call_ok" value="1"' . ($b['call_at'] ? ' checked' : '') . '> видеозвонок проведён</label>', 'Сохранить отметки', 'lt');
    $sts = '';
    foreach (['active' => 'Допустить', 'suspended' => 'Приостановить', 'blocked' => 'Заблокировать', 'review' => 'Вернуть на проверку'] as $to => $lbl) {
        if ($to === $b['status']) { continue; }
        $sts .= $form('b_status', $bid, '<input type="hidden" name="to" value="' . $to . '">' . ($to !== 'active' ? '<input name="reason" size="26" placeholder="причина (увидит бригада)">' : ''), $lbl, $to === 'blocked' ? 'bad' : ($to === 'active' ? '' : 'lt'));
    }
    $logo = $b['logo_file'] ? '<div class="ph">' . $img((int)$b['logo_file']) . '</div>' : '';
    $pend = brig_all("SELECT id, owner_kind, mime FROM br_files WHERE brigade_id = ? AND owner_kind IN ('portfolio','logo') AND moderated_at IS NULL ORDER BY id", [$bid]);
    $pendHtml = $pend ? '<div class="box"><h2>Файлы на модерации (' . count($pend) . ')</h2><p class="mut">В каталоге не видны, пока не одобрены: на фото и в PDF может быть телефон или ссылка — фильтр текста их не видит.</p><div class="ph">'
        . implode('', array_map(fn($f) => '<div>' . ($f['mime'] === 'application/pdf' ? '<a href="' . $self . '?file=' . (int)$f['id'] . '" target="_blank" rel="noopener">PDF #' . (int)$f['id'] . '</a>' : $img((int)$f['id'])) . '<br>'
            . $form('f_ok', (int)$f['id'], '', 'Одобрить', 'lt') . $form('f_del', (int)$f['id'], '', 'Удалить', 'bad') . '</div>', $pend)) . '</div></div>' : '';
    $innRel = !in_array($b['status'], ['active', 'blocked'], true) && $b['inn_key'] !== null ? $form('b_inn_release', $bid, '<input name="reason" size="26" placeholder="причина (спор за ИНН)">', 'Освободить ИНН', 'lt') : '';
    $rt = brig_rating($bid);
    apage($b['name'], $top . '<div class="box"><h2>' . $h($b['name']) . ' ' . $st($b['status'], BRIG_STATUS) . ($b['test'] ? ' <span class="test">ТЕСТ</span>' : '') . '</h2>' . $logo
        . ($b['status_reason'] ? '<p>Причина статуса: ' . $h($b['status_reason']) . '</p>' : '')
        . '<div class="grid"><div><p>' . $h($b['contact_name']) . ' · ' . $h($b['phone']) . ' · ' . $h($b['email']) . '<br>' . $h(BRIG_LEGAL[$b['legal']] ?? '') . ' · ИНН <b>' . $h($b['inn']) . '</b> '
        . ($innOk ? '<span class="ok">контрольная сумма верна</span>' : '<span class="no">контрольная сумма НЕ сходится</span>') . ($b['company'] ? '<br>' . $h($b['company']) : '') . '</p>'
        . '<p>Специализации: ' . $h(implode(', ', array_map(fn($k) => BRIG_SPECS[$k] ?? $k, json_decode($b['specs'], true) ?: []))) . '<br>Районы: ' . $h(implode(', ', array_map(fn($k) => BRIG_DISTRICTS[$k] ?? $k, json_decode($b['districts'], true) ?: [])))
        . '<br>Бригада: ' . (int)$b['team_size'] . ' чел., опыт ' . (int)$b['experience'] . ' лет, гарантия ' . (int)$b['warranty_months'] . ' мес.' . ($b['price_from'] ? ', от ' . (int)$b['price_from'] . ' ₽/м²' : '')
        . '<br>Рейтинг: ' . ($rt['n'] ? $rt['avg'] . ' (' . $rt['n'] . ')' : 'отзывов нет') . ' · объектов по LINEA: ' . brig_jobs_done($bid) . '</p></div>'
        . '<div><p><b>Рекомендатели:</b><br>' . nl2br($h($b['referees'] ?: '—')) . '</p><p><b>О бригаде:</b><br>' . nl2br($h($b['about'] ?: '—')) . '</p>'
        . '<p class="mut">Регистрация ' . $h($b['created_at']) . ' · на проверку ' . $h($b['submitted_at'] ?: '—') . ' · согласия: ПДн ред. ' . $h($b['consent_pd_ed']) . ', правила ред. ' . $h($b['rules_ed']) . ', агентский договор ред. ' . $h($b['agency_ed']) . ' (' . $h($b['accepted_at']) . ')'
        . ' · имя на публичной странице: ' . ($b['public_name'] ? 'да' : 'нет') . ' · <a href="../brigady/' . $h($b['slug']) . '/" target="_blank" rel="noopener">публичная карточка</a></p></div></div></div>'
        . '<div class="box"><h2>Проверка</h2><p>' . $links . '</p>' . ($b['legal'] === 'npd' ? $form('b_npd', $bid, '', 'Проверить НПД через API ФНС', 'lt') : '')
        . ($b['inn_check_note'] ? '<p class="mut">' . $h($b['inn_check_note']) . '</p>' : '')
        . '<p>' . $checks . '</p><p class="mut">ИНН проверен: ' . $h($b['inn_checked_at'] ?: '—') . ' · видеозвонок: ' . $h($b['call_at'] ?: '—') . ' (' . $h($b['verified_by'] ?: '') . '). Сканы паспортов не запрашиваем и не храним (152-ФЗ).</p>'
        . '<p>' . $sts . $innRel . '</p><p class="mut">Пилот: ' . ($b['pilot_slot'] !== null ? 'место ' . (int)$b['pilot_slot'] . ', использовано ' . (int)$b['pilot_used'] . ' из ' . brig_terms()['pilot']['deals'] : 'нет места') . '</p></div>' . $pendHtml . '<h2>Портфолио</h2>' . ($port ?: '<p>Объектов нет.</p>'));
}

// ── карточка запроса
if (isset($_GET['r']) && ($r = brig_one('SELECT r.*, o.number, o.name oname, o.status ostatus, o.token FROM br_requests r JOIN orders o ON o.id = r.order_id WHERE r.id = ?', [(int)$_GET['r']]))) {
    $rid = (int)$r['id'];
    $pack = json_decode((string)$r['pack'], true) ?: [];
    $files = brig_all("SELECT * FROM br_files WHERE owner_kind = 'pack' AND owner_id = ?", [$rid]);
    $flist = implode('', array_map(fn($f) => '<li><a href="' . $self . '?file=' . (int)$f['id'] . '">' . $h($f['title'] ?: 'файл') . '</a> <span class="mut">' . $h($f['mime']) . ', ' . round($f['bytes'] / 1024) . ' КБ</span> '
        . $form('r_file_del', (int)$f['id'], '', 'удалить', 'lt') . '</li>', $files));
    $invited = [];
    foreach (brig_all('SELECT * FROM br_invites WHERE request_id = ?', [$rid]) as $i) { $invited[(int)$i['brigade_id']] = $i; }
    $cand = candidates($r);
    $candIds = array_map(fn($c) => (int)$c['b']['id'], $cand);
    // приглашённые клиентом из каталога — в списке всегда
    foreach ($invited as $bid => $i) { if (!in_array($bid, $candIds, true) && ($bb = brig_one('SELECT * FROM br_brigades WHERE id = ?', [$bid]))) { $cand[] = ['b' => $bb, 'cover' => 0, 'rating' => brig_rating($bid), 'done' => brig_jobs_done($bid), 'score' => 0]; } }
    $rows = '';
    foreach ($cand as $k => $c) {
        $bid = (int)$c['b']['id']; $i = $invited[$bid] ?? null;
        $pre = $i ? ($i['sent_at'] ? ' checked disabled' : ' checked') : ($k < 5 ? ' checked' : '');
        $rows .= '<tr><td><input type="checkbox" name="bid[]" value="' . $bid . '"' . $pre . '><input type="hidden" name="src[' . $bid . ']" value="' . ($i ? $h($i['source']) : 'auto') . '"></td><td><a href="' . $self . '?b=' . $bid . '">' . $h($c['b']['name']) . '</a>'
            . ($c['b']['status'] !== 'active' ? ' ' . $st($c['b']['status'], BRIG_STATUS) : '') . '</td><td>' . round($c['cover'] * 100) . ' %</td><td>' . ($c['rating']['n'] ? $c['rating']['avg'] . ' (' . $c['rating']['n'] . ')' : '—') . '</td><td>' . $c['done'] . '</td><td>' . $c['score'] . '</td>'
            . '<td>' . ($i ? ($i['source'] === 'client' ? 'пригласил клиент' : 'в запросе') . ($i['sent_at'] ? ', отправлено ' . $h(substr($i['sent_at'], 0, 16)) : ', ждёт рассылки') . ($i['seen_at'] ? ', открыто' : '') . ($i['declined_at'] ? ', <b>отказ</b>' : '') : '') . '</td></tr>';
    }
    $dl = $r['deadline_at'] ? str_replace(' ', 'T', substr($r['deadline_at'], 0, 16)) : date('Y-m-d\TH:i', strtotime('+3 days 18:00', strtotime('today')));
    $send = '<form method="post"><input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="act" value="r_send"><input type="hidden" name="id" value="' . $rid . '">'
        . '<div class="scroll"><table><tr><th></th><th>Бригада</th><th>Покрытие работ</th><th>Рейтинг</th><th>Объектов LINEA</th><th>Балл</th><th>Состояние</th></tr>' . ($rows ?: '<tr><td colspan="7">Подходящих допущенных бригад нет (район + специализации' . ($r['test'] ? ', тестовый запрос — только тестовые бригады' : '') . ').</td></tr>') . '</table></div>'
        . '<p>Срок ответа: <input type="datetime-local" name="deadline" value="' . $h($dl) . '"> <button>' . ($r['status'] === 'sent' ? 'Дослать отмеченным' : 'Разослать отмеченным') . '</button></p></form>';
    $offers = '';
    foreach (brig_all('SELECT o.*, b.name FROM br_offers o JOIN br_brigades b ON b.id = o.brigade_id WHERE o.request_id = ? ORDER BY o.total_kop', [$rid]) as $x) {
        $offers .= '<tr><td>' . $h($x['name']) . '</td><td>' . $st($x['status'], ['submitted' => 'подано', 'withdrawn' => 'отозвано', 'chosen' => 'выбрано', 'rejected' => 'не выбрано']) . '</td><td>' . brig_rub((int)$x['total_kop']) . '</td><td>' . (int)$x['days'] . ' дн.</td><td>' . (int)$x['warranty_months'] . ' мес.</td><td>' . $h(BRIG_MATERIALS[$x['materials']] ?? '') . '</td><td class="mut">' . $h($x['updated_at']) . '</td></tr>';
    }
    $job = brig_job_for_request($rid) ?? brig_one('SELECT id FROM br_jobs WHERE request_id = ? ORDER BY id DESC LIMIT 1', [$rid]);
    apage('Запрос ' . $r['number'], $top . '<div class="box"><h2>Запрос по заказу <a href="admin.php?o=' . $h(rawurlencode($r['number'])) . '">' . $h($r['number']) . '</a> ' . $st($r['status'], BRIG_REQ_STATUS) . ($r['test'] ? ' <span class="test">ТЕСТ</span>' : '') . '</h2>'
        . '<p>' . $h($r['object_title']) . ' · ' . $h(BRIG_DISTRICTS[$r['district']] ?? '') . ' · старт: ' . $h($r['start_wish'] ?: 'не указан') . ' · клиент: ' . $h($r['oname']) . '</p>'
        . '<p class="mut">Согласие клиента: ' . $h($r['consent_text']) . ', ' . $h($r['consent_at']) . '</p>'
        . ($job ? '<p><a href="' . $self . '?j=' . (int)$job['id'] . '">→ объект в работе</a></p>' : '')
        . ($r['status'] === 'new' || $r['status'] === 'sent' ? $form('r_cancel', $rid, '<input name="reason" placeholder="причина" size="20">', 'Отменить запрос', 'lt') : '') . '</div>'
        . '<div class="box"><h2>Пакет проекта (обезличенный)</h2><p>' . (empty($pack['positions']) ? '<b>Не загружен.</b> ' : count($pack['positions']) . ' позиций, работы: ' . $h(implode(', ', array_map(fn($k) => BRIG_SPECS[$k] ?? $k, json_decode($r['works'], true) ?: []))) . '. ')
        . 'Собрать: <code>node tools/brigady-pack.mjs &lt;project.json&gt; &lt;папка&gt;</code> — без ФИО, адреса и телефона клиента.</p><ul>' . $flist . '</ul>'
        . '<form method="post" enctype="multipart/form-data" class="inl"><input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="act" value="r_pack"><input type="hidden" name="id" value="' . $rid . '">'
        . '<label>pack.json <input type="file" name="pack" accept=".json,application/json"></label> <label>ведомости / листы <input type="file" name="f1" accept=".xlsx,.pdf"></label> <input type="file" name="f2" accept=".xlsx,.pdf"> <input type="file" name="f3" accept=".xlsx,.pdf"> <button>Загрузить</button></form></div>'
        . '<div class="box"><h2>Бригады: автоподбор и рассылка</h2>' . $send . '</div>'
        . '<div class="box"><h2>Предложения</h2><div class="scroll"><table><tr><th>Бригада</th><th>Статус</th><th>Сумма</th><th>Срок</th><th>Гарантия</th><th>Материалы</th><th>Обновлено</th></tr>' . ($offers ?: '<tr><td colspan="7">Пока нет.</td></tr>') . '</table></div></div>');
}

// ── карточка объекта
if (isset($_GET['j']) && ($j = brig_one('SELECT j.*, r.object_title, r.test, o.number, b.name bname, ofr.total_kop FROM br_jobs j JOIN br_requests r ON r.id = j.request_id JOIN orders o ON o.id = r.order_id JOIN br_brigades b ON b.id = j.brigade_id JOIN br_offers ofr ON ofr.id = j.offer_id WHERE j.id = ?', [(int)$_GET['j']]))) {
    $jid = (int)$j['id'];
    $stg = '';
    foreach (brig_job_stages($jid) as $s) {
        $stg .= '<tr><td>' . $s['idx'] . '. ' . $h($s['name']) . '<div class="mut">' . $h($s['checklist']['title']) . '</div></td><td>' . $st($s['status'], BRIG_STAGE_STATUS) . '</td><td>' . $h($s['planStart'] . ' — ' . $s['planEnd']) . '</td>'
            . '<td><div class="ph">' . implode('', array_map($img, array_slice($s['photos'], 0, 6))) . '</div></td><td>' . implode('<br>', array_map(fn($m) => ($m['closedAt'] ? '✓ ' : '• ') . $h($m['text']) . ($m['closeNote'] ? ' <span class="mut">— ' . $h($m['closeNote']) . '</span>' : ''), $s['remarks'])) . '</td></tr>';
    }
    $sign = '';
    $cdocs = '';
    foreach (brig_all('SELECT * FROM br_contracts WHERE job_id = ? ORDER BY id', [$jid]) as $c) {
        $cdocs .= '<tr><td>' . $h($c['kind'] === 'main' ? 'Договор' : 'Допсоглашение № ' . $c['num']) . '</td><td>' . $h($c['status']) . '</td><td>' . brig_rub((int)$c['total_kop']) . ($c['delta_kop'] ? ' (' . ($c['delta_kop'] > 0 ? '+' : '') . brig_rub((int)$c['delta_kop']) . ')' : '') . '</td>'
            . '<td>' . $h($c['client_signed_at'] ?: '—') . ' <span class="mut">' . $h($c['client_ip'] ?: '') . '</span></td><td>' . $h($c['brigade_signed_at'] ?: '—') . ' <span class="mut">' . $h($c['brigade_ip'] ?: '') . '</span></td><td class="mut" style="word-break:break-all">' . $h($c['hash']) . '</td></tr>';
    }
    $dlog = implode('', array_map(fn($l) => '<tr><td class="mut">' . $h($l['at']) . '</td><td>' . $h($l['who']) . '</td><td>' . $h($l['text']) . '</td></tr>', brig_deal_log($jid)));
    apage('Объект ' . $j['number'], $top . '<div class="box"><h2>Объект по заказу ' . $h($j['number']) . ' ' . $st($j['status'], BRIG_JOB_STATUS) . ($j['test'] ? ' <span class="test">ТЕСТ</span>' : '') . '</h2>'
        . '<p>' . $h($j['object_title']) . ' · бригада <a href="' . $self . '?b=' . (int)$j['brigade_id'] . '">' . $h($j['bname']) . '</a> · смета ' . brig_rub((int)$j['total_kop']) . ' · комиссия ' . brig_rub($j['commission_kop'] !== null ? (int)$j['commission_kop'] : null) . '</p>'
        . '<p class="mut">Договор: клиент ' . $h($j['client_signed_at'] ?: '—') . ', бригада ' . $h($j['brigade_signed_at'] ?: '—') . ' · согласие клиента на передачу контактов ' . $h($j['contacts_consent_at']) . ' · контакты открыты: ' . $h($j['contacts_open_at'] ?: 'нет') . '</p>' . $sign
        . '<p class="mut">Аванс: ' . ($j['advance_at'] ? $h($j['advance_at']) . ' (' . $h(['client' => 'отметил заказчик', 'brigade' => 'отметила бригада', 'admin' => 'LINEA'][$j['advance_by']] ?? '') . ', ' . $h(['declared' => 'ждёт подтверждения бригады', 'confirmed' => 'подтверждён', 'disputed' => 'ОСПОРЕН бригадой'][$j['advance_state']] ?? '') . ')' . ($j['advance_note'] ? ': ' . $h($j['advance_note']) : '') : 'нет')
        . ' · к оплате: ' . $h($j['commission_due_at'] ? $j['commission_due_at'] . ' — ' . $j['commission_due_why'] : 'ещё нет') . '</p>'
        . $form('j_advance', $jid, '<select name="to"><option value="confirmed">подтвердить аванс</option><option value="clear">снять отметку</option></select><input name="reason" size="24" placeholder="причина (в журнал)">', 'Исправить аванс', 'lt')
        . ($j['commission_kop'] !== null && !brig_one('SELECT 1 FROM br_invoices WHERE job_id = ?', [$jid])
            ? ($j['commission_due_at'] ? $form('j_invoice', $jid, '', 'Выставить счёт на комиссию') : $form('j_invoice', $jid, '<input type="hidden" name="manual" value="1"><input name="reason" size="24" placeholder="причина счёта вручную">', 'Выставить вручную', 'lt')) : '')
        . implode('', array_map(fn($c) => '<p class="msg">Допсоглашение № ' . (int)$c['num'] . ' уменьшает цену на ' . brig_rub(-(int)$c['delta_kop']) . ' — ждёт подтверждения LINEA. '
            . $form('c_approve', (int)$c['id'], '<input name="reason" size="20" placeholder="комментарий">', 'Подтвердить') . $form('c_reject', (int)$c['id'], '<input name="reason" size="20" placeholder="причина">', 'Отклонить', 'bad') . '</p>',
            brig_all("SELECT * FROM br_contracts WHERE job_id = ? AND kind = 'addendum' AND status = 'draft' AND needs_admin = 1 AND admin_ok_at IS NULL", [$jid]))) . '</div>'
        . '<div class="box scroll"><table><tr><th>Этап</th><th>Статус</th><th>План</th><th>Фото</th><th>Замечания</th></tr>' . $stg . '</table></div>'
        . '<div class="box scroll"><h2>Документы сделки (ПЭП)</h2><table><tr><th>Документ</th><th>Статус</th><th>Сумма</th><th>Заказчик</th><th>Подрядчик</th><th>SHA-256</th></tr>' . ($cdocs ?: '<tr><td colspan="6">Нет.</td></tr>') . '</table></div>'
        . '<div class="box scroll"><h2>Журнал сделки (видят обе стороны)</h2><table>' . ($dlog ?: '<tr><td>Пусто.</td></tr>') . '</table></div>'
        . '<div class="box"><h2>Переписка по сделке</h2>' . (implode('', array_map(fn($m) => '<p><b>' . $h(['client' => 'Клиент', 'brigade' => 'Бригада', 'admin' => 'LINEA'][$m['who']] ?? $m['who']) . '</b> <span class="mut">' . $h($m['at']) . ($m['masked'] ? ' · контакты скрыты фильтром' : '') . '</span><br>' . nl2br($h($m['text'])) . '</p>', brig_messages($jid))) ?: '<p class="mut">Сообщений нет.</p>') . '</div>');
}

// ── списки
switch ($view) {
    case 'requests':
        $rows = '';
        foreach (brig_all('SELECT r.*, o.number, (SELECT COUNT(*) FROM br_offers x WHERE x.request_id = r.id AND x.status IN (\'submitted\',\'chosen\')) offers, (SELECT COUNT(*) FROM br_invites i WHERE i.request_id = r.id AND i.sent_at IS NOT NULL) inv FROM br_requests r JOIN orders o ON o.id = r.order_id ORDER BY r.id DESC LIMIT 300') as $r) {
            $rows .= '<tr><td><a href="' . $self . '?r=' . (int)$r['id'] . '">' . $h($r['number']) . '</a>' . ($r['test'] ? ' <span class="test">тест</span>' : '') . '</td><td>' . $h($r['object_title']) . '</td><td>' . $h(BRIG_DISTRICTS[$r['district']] ?? '') . '</td><td>' . $st($r['status'], BRIG_REQ_STATUS) . '</td>'
                . '<td>' . (int)$r['inv'] . '</td><td>' . (int)$r['offers'] . '</td><td class="hide-m">' . $h($r['deadline_at'] ?: '—') . '</td></tr>';
        }
        apage('Запросы', $top . '<div class="scroll"><table><tr><th>Заказ</th><th>Объект</th><th>Район</th><th>Статус</th><th>Разослано</th><th>Предложений</th><th class="hide-m">Срок</th></tr>' . ($rows ?: '<tr><td colspan="7">Запросов нет.</td></tr>') . '</table></div>');
    case 'offers':
        $rows = '';
        foreach (brig_all('SELECT x.*, b.name, o.number, r.id rid FROM br_offers x JOIN br_brigades b ON b.id = x.brigade_id JOIN br_requests r ON r.id = x.request_id JOIN orders o ON o.id = r.order_id ORDER BY x.id DESC LIMIT 300') as $x) {
            $rows .= '<tr><td><a href="' . $self . '?r=' . (int)$x['rid'] . '">' . $h($x['number']) . '</a></td><td>' . $h($x['name']) . '</td><td>' . $h($x['status']) . '</td><td>' . brig_rub((int)$x['total_kop']) . '</td><td>' . (int)$x['days'] . ' дн.</td><td>' . (int)$x['warranty_months'] . ' мес.</td><td class="mut">' . $h($x['updated_at']) . '</td></tr>';
        }
        apage('Предложения', $top . '<div class="scroll"><table><tr><th>Заказ</th><th>Бригада</th><th>Статус</th><th>Сумма</th><th>Срок</th><th>Гарантия</th><th>Обновлено</th></tr>' . ($rows ?: '<tr><td colspan="7">Нет.</td></tr>') . '</table></div>');
    case 'jobs':
        $rows = '';
        foreach (brig_all("SELECT j.*, o.number, b.name, r.object_title, (SELECT COUNT(*) FROM br_stages s WHERE s.job_id = j.id AND s.status = 'accepted') acc, (SELECT COUNT(*) FROM br_stages s WHERE s.job_id = j.id) total FROM br_jobs j JOIN br_requests r ON r.id = j.request_id JOIN orders o ON o.id = r.order_id JOIN br_brigades b ON b.id = j.brigade_id ORDER BY j.id DESC LIMIT 300") as $x) {
            $rows .= '<tr><td><a href="' . $self . '?j=' . (int)$x['id'] . '">' . $h($x['number']) . '</a></td><td>' . $h($x['object_title']) . '</td><td>' . $h($x['name']) . '</td><td>' . $st($x['status'], BRIG_JOB_STATUS) . '</td><td>' . (int)$x['acc'] . ' / ' . (int)$x['total'] . '</td><td>' . brig_rub($x['commission_kop'] !== null ? (int)$x['commission_kop'] : null) . '</td></tr>';
        }
        apage('Объекты', $top . '<div class="scroll"><table><tr><th>Заказ</th><th>Объект</th><th>Бригада</th><th>Статус</th><th>Этапов принято</th><th>Комиссия</th></tr>' . ($rows ?: '<tr><td colspan="6">Нет.</td></tr>') . '</table></div>');
    case 'disputes':
        $out = '';
        foreach (brig_all('SELECT d.*, o.number, b.name FROM br_disputes d JOIN br_jobs j ON j.id = d.job_id JOIN br_requests r ON r.id = j.request_id JOIN orders o ON o.id = r.order_id JOIN br_brigades b ON b.id = j.brigade_id ORDER BY d.status, d.id DESC') as $d) {
            $msgs = implode('', array_map(fn($m) => '<p><b>' . $h(['client' => 'Клиент', 'brigade' => 'Бригада', 'admin' => 'LINEA'][$m['who']] ?? $m['who']) . '</b> <span class="mut">' . $h($m['at']) . '</span><br>' . nl2br($h($m['text'])) . '</p>', brig_all('SELECT * FROM br_dispute_msgs WHERE dispute_id = ? ORDER BY id', [(int)$d['id']])));
            $out .= '<div class="box"><h2>' . $h($d['subject']) . ' ' . $st($d['status'], ['open' => 'открыт', 'resolved' => 'решён']) . '</h2><p class="mut">Заказ <a href="' . $self . '?j=' . (int)$d['job_id'] . '">' . $h($d['number']) . '</a> · бригада ' . $h($d['name']) . ' · открыл: ' . $h($d['opened_by']) . '</p>' . $msgs
                . ($d['status'] === 'open' ? $form('d_msg', (int)$d['id'], '<textarea name="text" rows="2" cols="50" placeholder="сообщение сторонам"></textarea>', 'Написать', 'lt') . $form('d_resolve', (int)$d['id'], '<input name="reason" size="40" placeholder="решение (увидят обе стороны)">', 'Закрыть спор') : '<p><b>Решение:</b> ' . $h($d['resolution']) . '</p>') . '</div>';
        }
        apage('Споры', $top . ($out ?: '<p>Споров нет.</p>'));
    case 'money':
        brig_commission_sweep();
        $rows = ''; $sum = ['acc' => 0, 'paid' => 0];
        foreach (brig_all('SELECT j.id, j.commission_kop, j.commission_at, j.commission_due_at, j.commission_due_why, r.object_title, r.test, b.name, i.id iid, i.number, i.amount_kop, i.issued_at, i.due_at, i.paid_at FROM br_jobs j JOIN br_requests r ON r.id = j.request_id JOIN br_brigades b ON b.id = j.brigade_id LEFT JOIN br_invoices i ON i.job_id = j.id WHERE j.commission_kop IS NOT NULL ORDER BY j.id DESC') as $x) {
            $sum['acc'] += (int)$x['commission_kop']; if ($x['paid_at']) { $sum['paid'] += (int)$x['amount_kop']; }
            $rows .= '<tr><td><a href="' . $self . '?j=' . (int)$x['id'] . '">' . $h($x['object_title']) . '</a>' . ($x['test'] ? ' <span class="test">тест</span>' : '') . '</td><td>' . $h($x['name']) . '</td><td>' . brig_rub((int)$x['commission_kop']) . '</td><td class="mut">' . $h($x['commission_at']) . '</td>'
                . '<td>' . ($x['number'] ? $h($x['number']) . ' от ' . $h(substr($x['issued_at'], 0, 10)) . (!$x['paid_at'] && $x['due_at'] && $x['due_at'] < date('Y-m-d') ? ' <span class="no">просрочен с ' . $h($x['due_at']) . '</span>' : '')
                    : ($x['commission_due_at'] ? '<span class="mut">к оплате с ' . $h(substr($x['commission_due_at'], 0, 10)) . ': ' . $h($x['commission_due_why']) . '</span><br>' . $form('j_invoice', (int)$x['id'], '', 'Выставить счёт', 'lt')
                        : '<span class="mut">ещё не к оплате</span><br>' . $form('j_invoice', (int)$x['id'], '<input type="hidden" name="manual" value="1"><input name="reason" size="14" placeholder="причина">', 'Вручную', 'lt'))) . '</td>'
                . '<td>' . ($x['paid_at'] ? '<span class="ok">оплачен ' . $h(substr($x['paid_at'], 0, 10)) . '</span>' : ($x['iid'] ? $form('i_paid', (int)$x['iid'], '<input name="note" size="12" placeholder="как (п/п №)">', 'Оплачен') : '—')) . '</td></tr>';
        }
        apage('Комиссия', $top . '<p>Начислено <b>' . brig_rub($sum['acc']) . '</b> · оплачено <b>' . brig_rub($sum['paid']) . '</b> · долг <b>' . brig_rub($sum['acc'] - $sum['paid']) . '</b> · <a href="' . $self . '?csv=money">CSV</a></p>'
            . '<p class="mut">' . $h(brig_rate_text()) . ' от сметы бригады (brig_terms в config); фиксируется в момент открытия контактов сторон — ' . (brig_terms()['contacts_after'] === 'chosen' ? 'при выборе бригады' : 'когда договор подтвердили обе стороны на сайте')
            . '. К оплате — по самой ранней из дат: аванс (бригада отметила или не оспорила отметку заказчика за ' . brig_terms()['advance_confirm_days'] . ' дн.), дата начала работ по договору, «Начать работу» по этапу 1, принятый этап'
            . (brig_terms()['commission_due_after_sign_days'] ? ', ' . brig_terms()['commission_due_after_sign_days'] . ' дн. после подписания' : '') . '; счёт вручную — всегда. Долг: просрочка ≥ ' . brig_terms()['debt_feed_close_days'] . ' дн. закрывает бригаде ленту новых заказов. '
            . 'Оплата ремонта — вне сайта; оплата через ЮKassa с удержанием ' . (brig_terms()['safe_deal'] ? 'включена' : 'не включена') . '.</p>'
            . '<div class="scroll"><table><tr><th>Объект</th><th>Бригада</th><th>Комиссия</th><th>Начислена</th><th>Счёт</th><th>Оплата</th></tr>' . ($rows ?: '<tr><td colspan="6">Начислений нет.</td></tr>') . '</table></div>');
    case 'signals':
        // сигналы обхода: выбрана, но договор не подтверждён N дней; фильтр контактов; отмена после выбора; повторная регистрация
        $days = (int)brig_terms()['signal_unsigned_days'];
        $stale = '';
        foreach (brig_all("SELECT j.*, b.name, r.object_title, o.number FROM br_jobs j JOIN br_brigades b ON b.id = j.brigade_id JOIN br_requests r ON r.id = j.request_id JOIN orders o ON o.id = r.order_id WHERE j.status = 'contract' AND j.created_at < ? ORDER BY j.created_at", [date('Y-m-d H:i:s', time() - $days * 86400)]) as $x) {
            $stale .= '<tr><td><a href="' . $self . '?j=' . (int)$x['id'] . '">' . $h($x['number']) . '</a></td><td>' . $h($x['object_title']) . '</td><td><a href="' . $self . '?b=' . (int)$x['brigade_id'] . '">' . $h($x['name']) . '</a></td><td>' . $h(substr((string)$x['created_at'], 0, 10)) . '</td>'
                . '<td>клиент ' . ($x['client_signed_at'] ? '✓' : '—') . ', бригада ' . ($x['brigade_signed_at'] ? '✓' : '—') . '</td><td>' . (int)db_val('SELECT COUNT(*) FROM br_messages WHERE job_id = ?', [(int)$x['id']]) . '</td></tr>';
        }
        $nm = (int)brig_terms()['signal_no_money_days'];
        $nomoney = '';
        foreach (brig_all("SELECT j.*, b.name, r.object_title, o.number FROM br_jobs j JOIN br_brigades b ON b.id = j.brigade_id JOIN br_requests r ON r.id = j.request_id JOIN orders o ON o.id = r.order_id WHERE j.status IN ('work','done') AND j.commission_due_at IS NULL AND j.contacts_open_at < ? ORDER BY j.contacts_open_at", [date('Y-m-d H:i:s', time() - $nm * 86400)]) as $x) {
            $nomoney .= '<tr><td><a href="' . $self . '?j=' . (int)$x['id'] . '">' . $h($x['number']) . '</a></td><td>' . $h($x['object_title']) . '</td><td><a href="' . $self . '?b=' . (int)$x['brigade_id'] . '">' . $h($x['name']) . '</a></td><td>' . $h(substr((string)$x['contacts_open_at'], 0, 10)) . '</td></tr>';
        }
        $kinds = ['contact' => 'контакты в тексте (скрыты)', 'cancel' => 'отказ после выбора', 'reregister' => 'повторная регистрация заблокированной'];
        $byB = '';
        foreach (brig_all("SELECT s.brigade_id, b.name, SUM(CASE WHEN s.kind = 'contact' THEN 1 ELSE 0 END) nc, SUM(CASE WHEN s.kind = 'cancel' THEN 1 ELSE 0 END) nx, COUNT(*) n FROM br_signals s JOIN br_brigades b ON b.id = s.brigade_id GROUP BY s.brigade_id, b.name ORDER BY n DESC LIMIT 50") as $x) {
            $byB .= '<tr><td><a href="' . $self . '?b=' . (int)$x['brigade_id'] . '">' . $h($x['name']) . '</a></td><td>' . (int)$x['nc'] . '</td><td>' . (int)$x['nx'] . '</td><td>' . (int)$x['n'] . '</td></tr>';
        }
        $log = '';
        foreach (brig_all('SELECT s.*, b.name FROM br_signals s LEFT JOIN br_brigades b ON b.id = s.brigade_id ORDER BY s.id DESC LIMIT 300') as $x) {
            $log .= '<tr><td class="mut">' . $h($x['at']) . '</td><td>' . $h($kinds[$x['kind']] ?? $x['kind']) . '</td><td>' . $h($x['who']) . '</td><td>' . ($x['brigade_id'] ? '<a href="' . $self . '?b=' . (int)$x['brigade_id'] . '">' . $h($x['name'] ?: '#' . $x['brigade_id']) . '</a>' : '—') . '</td>'
                . '<td>' . $h($x['field']) . ($x['job_id'] ? ' · <a href="' . $self . '?j=' . (int)$x['job_id'] . '">объект</a>' : '') . ($x['request_id'] ? ' · <a href="' . $self . '?r=' . (int)$x['request_id'] . '">запрос</a>' : '') . '</td><td>' . $h($x['detail']) . '</td></tr>';
        }
        apage('Сигналы обхода', $top . '<p class="mut">Признаки того, что сделку уводят мимо платформы. Это повод для звонка, а не наказание: решение — по правилам площадки. Контакты в текстах уже скрыты фильтром; сами контакты в журнал не пишутся.</p>'
            . '<div class="box"><h2>Выбрана, договор не подтверждён ' . $days . '+ дн.</h2><div class="scroll"><table><tr><th>Заказ</th><th>Объект</th><th>Бригада</th><th>Выбрана</th><th>Подтверждение</th><th>Сообщений</th></tr>' . ($stale ?: '<tr><td colspan="6">Нет.</td></tr>') . '</table></div></div>'
            . '<div class="box"><h2>Договор подтверждён, а за ' . $nm . '+ дн. ни аванса, ни принятого этапа</h2><div class="scroll"><table><tr><th>Заказ</th><th>Объект</th><th>Бригада</th><th>Договор подтверждён</th></tr>' . ($nomoney ?: '<tr><td colspan="4">Нет.</td></tr>') . '</table></div></div>'
            . '<div class="box"><h2>По бригадам</h2><div class="scroll"><table><tr><th>Бригада</th><th>Контакты в тексте</th><th>Отказы после выбора</th><th>Всего</th></tr>' . ($byB ?: '<tr><td colspan="4">Нет.</td></tr>') . '</table></div></div>'
            . '<div class="box"><h2>Журнал сигналов</h2><div class="scroll"><table><tr><th>Когда</th><th>Что</th><th>Кто</th><th>Бригада</th><th>Где</th><th>Подробно</th></tr>' . ($log ?: '<tr><td colspan="6">Сигналов нет.</td></tr>') . '</table></div></div>');
    case 'reviews':
        $opts = implode('', array_map(fn($k, $t) => '<option value="' . $k . '">' . $h($t) . '</option>', array_keys(BRIG_REVIEW_HIDE), BRIG_REVIEW_HIDE));
        $rows = '';
        foreach (brig_all('SELECT v.*, b.name FROM br_reviews v JOIN br_brigades b ON b.id = v.brigade_id ORDER BY v.id DESC LIMIT 300') as $v) {
            $rows .= '<tr><td>' . $h($v['name']) . '</td><td>' . str_repeat('★', (int)$v['rating']) . '</td><td>' . nl2br($h($v['text'])) . '<div class="mut">' . $h($v['created_at']) . '</div></td><td>'
                . ($v['hidden'] ? '<span class="no">скрыт:</span> ' . $h($v['hidden_reason']) . $form('rv_show', (int)$v['id'], '<input name="reason" placeholder="основание" size="14">', 'Вернуть', 'lt')
                    : $form('rv_hide', (int)$v['id'], '<select name="why">' . $opts . '</select><input name="reason" placeholder="пояснение" size="14">', 'Скрыть', 'lt')) . '</td></tr>';
        }
        apage('Отзывы', $top . '<p class="mut">Отзыв оставляет только клиент завершённого объекта. Скрыть — только по причине из правил площадки (раздел 7), с пояснением; всё пишется в журнал.</p><div class="scroll"><table><tr><th>Бригада</th><th>Оценка</th><th>Текст</th><th>Модерация</th></tr>' . ($rows ?: '<tr><td colspan="4">Отзывов нет.</td></tr>') . '</table></div>');
    case 'sheets':
        $rows = '';
        foreach (brig_all('SELECT s.*, b.name, r.object_title FROM br_sheet_reqs s JOIN br_brigades b ON b.id = s.brigade_id JOIN br_jobs j ON j.id = s.job_id JOIN br_requests r ON r.id = j.request_id ORDER BY s.id DESC LIMIT 300') as $s) {
            $rows .= '<tr><td>' . (int)$s['id'] . '</td><td>' . $h($s['object_title']) . '<div class="mut">' . $h($s['name']) . '</div></td><td>' . nl2br($h($s['text'])) . ($s['room'] ? '<div class="mut">' . $h($s['room'] . ($s['wall'] ? ', стена ' . $s['wall'] : '')) . '</div>' : '') . '</td><td>' . $st($s['status'], BRIG_SHEET_STATUS) . '</td>'
                . '<td>' . ($s['result_file'] ? '<a href="' . $self . '?file=' . (int)$s['result_file'] . '">PDF</a>' : '') . ($s['audio_file'] ? ' <a href="' . $self . '?file=' . (int)$s['audio_file'] . '">запись</a>' : '') . '</td><td class="mut">' . $h($s['created_at']) . '</td></tr>';
        }
        apage('Листы по запросу', $top . '<p class="mut">Очередь для воркера GOST-DRAFT (api/brigade/sheet-request.php, Authorization: Bearer — sheet_worker_token в config.php' . ((string)brig_cfg('sheet_worker_token', '') === '' ? ', <b>сейчас пуст — воркер выключен</b>' : '') . '). Протокол — docs/brigady/sheet-request-api.md.</p>'
            . '<div class="scroll"><table><tr><th>№</th><th>Объект</th><th>Запрос</th><th>Статус</th><th>Файлы</th><th>Создан</th></tr>' . ($rows ?: '<tr><td colspan="6">Запросов нет.</td></tr>') . '</table></div>');
    case 'audit':
        $rows = '';
        $only = (string)($_GET['who'] ?? '') === 'admin';
        foreach (brig_all('SELECT * FROM br_audit' . ($only ? " WHERE who = 'admin'" : '') . ' ORDER BY id DESC LIMIT 500') as $x) {
            $rows .= '<tr><td class="mut">' . $h($x['at']) . '</td><td>' . $h($x['who']) . '</td><td>' . $h($x['action']) . '</td><td>' . $h($x['target']) . '</td><td>' . $h($x['detail']) . '</td></tr>';
        }
        apage('Журнал', $top . '<p><a href="' . $self . '?view=audit">все</a> · <a href="' . $self . '?view=audit&who=admin">только действия администратора</a></p><div class="scroll"><table><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Подробно</th></tr>' . $rows . '</table></div>');
}

// ── бригады (по умолчанию)
$f = (string)($_GET['f'] ?? '');
$where = isset(BRIG_STATUS[$f]) ? 'WHERE status = ?' : '';
$rows = '';
foreach (brig_all("SELECT * FROM br_brigades $where ORDER BY CASE status WHEN 'review' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, id DESC LIMIT 500", $where ? [$f] : []) as $b) {
    $rt = brig_rating((int)$b['id']);
    $rows .= '<tr><td><a href="' . $self . '?b=' . (int)$b['id'] . '">' . $h($b['name']) . '</a>' . ($b['test'] ? ' <span class="test">тест</span>' : '') . '<div class="mut">' . $h($b['contact_name']) . '</div></td><td>' . $st($b['status'], BRIG_STATUS) . '</td>'
        . '<td class="hide-m">' . $h(BRIG_LEGAL[$b['legal']] ?? '') . ' ' . $h($b['inn']) . '</td><td class="hide-m">' . $h(implode(', ', array_map(fn($k) => BRIG_SPECS[$k] ?? $k, json_decode($b['specs'], true) ?: []))) . '</td>'
        . '<td>' . ($b['inn_checked_at'] ? '<span class="ok">ИНН ✓</span>' : 'ИНН —') . ' · ' . ($b['call_at'] ? '<span class="ok">звонок ✓</span>' : 'звонок —') . '</td><td>' . ($rt['n'] ? $rt['avg'] . ' (' . $rt['n'] . ')' : '—') . '</td></tr>';
}
$filters = '<p>' . implode(' · ', array_merge(['<a href="' . $self . '">все</a>'], array_map(fn($k, $t) => '<a href="' . $self . '?f=' . $k . '">' . $h($t) . '</a>', array_keys(BRIG_STATUS), BRIG_STATUS))) . '</p>';
apage('Бригады', $top . $filters . '<div class="scroll"><table><tr><th>Бригада</th><th>Статус</th><th class="hide-m">ИНН</th><th class="hide-m">Специализации</th><th>Проверка</th><th>Рейтинг</th></tr>' . ($rows ?: '<tr><td colspan="6">Бригад пока нет.</td></tr>') . '</table></div>');
