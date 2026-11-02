<?php
/**
 * api/kabinet.php — кабинет клиента (site/kabinet/, js/kabinet.js). Доступ: сессия клиента (свои заказы) или гостевая сессия заказа
 * по старой ссылке (только этот заказ, только просмотр). Значимые действия — kab_require_fresh_for_order() (код не старше 12 часов).
 *   GET  ?a=objects                     — мои объекты: шаг, «сейчас от вас нужно»
 *   GET  ?a=object&o=<номер>            — объект: заказ, оплата, сроки, альбом и версии, вопросы К-N, правки, ремонт, лента
 *   GET  ?a=docs | notices | profile
 *   GET  ?a=file&o=&v=&f=album.pdf|registry.json · ?a=file&pd=<id> (выгрузка) · ?a=doc&o=&kind=protocol
 *   POST ?a=pay {o} · answer {o,id,option,text} · decide {o,id,decision,text} · accept_album {o,ver} · msg {o,text}
 *        profile {name,phone} · prefs {groups,digest} · consent_revoke {id} · pd {kind,note} · device_end {id} · notices_read
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/kabinet.php';

brig_https();
brig_db();
acc_session();
header('Referrer-Policy: no-referrer');
$a = (string)($_GET['a'] ?? 'objects');
$c = kab_client();
$g = kab_guest_order();
if (!$c && !$g) { linea_json(['ok' => false, 'auth' => false, 'error' => 'Войдите кодом из письма'], 401); }
$acc = $c;

/** Заказы сессии: клиент — все свои, гость — один. */
function kb_orders(?array $c, ?array $g): array
{
    if ($c) { return brig_all('SELECT * FROM orders WHERE account_id = ? ORDER BY id DESC', [(int)$c['id']]); }
    return $g ? [$g] : [];
}

function kb_order(string $num): array
{
    $o = kab_order_access($num);
    if (!$o) { linea_fail('Заказ не найден', 404); }
    return $o;
}

function kb_obj_title(array $o): string
{
    $t = mb_convert_case((string)($o['object_type'] ?: 'объект'), MB_CASE_TITLE);
    return $t . ($o['area'] ? ' ' . str_replace('.', ',', (string)(float)$o['area']) . ' м²' : '');
}

function kb_brief(array $o): array
{
    $f = kab_order_dir($o) . '/brief.json';
    $b = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
    $rooms = array_values(array_filter(array_map(fn($r) => is_array($r) ? linea_str($r['name'] ?? $r['title'] ?? '', 60) : '', (array)($b['rooms'] ?? []))));
    return ['objectType' => (string)$o['object_type'], 'area' => $o['area'] !== null ? (float)$o['area'] : null, 'rooms' => $rooms,
        'style' => linea_str($b['style']['name'] ?? $b['style'] ?? '', 60), 'wishes' => linea_str($b['wishes'] ?? $b['notes'] ?? '', 600),
        'files' => (int)$o['files_count'], 'sent' => (string)$o['created_at']];
}

function kb_lenta(array $o): array
{
    return array_map(fn($e) => ['who' => $e['who'] === 'kab:client' ? 'Вы' : 'LINEA', 'mine' => $e['who'] === 'kab:client', 'text' => $e['text'], 'at' => $e['at']],
        brig_all("SELECT who, text, at FROM events WHERE order_id = ? AND who IN ('kab:client','kab:linea') ORDER BY id DESC LIMIT 100", [(int)$o['id']]));
}

function kb_object(array $o, ?array $c): array
{
    $reg = kab_registry($o);
    $ans = kab_answers($o)['items'];
    $items = $reg ? array_map(fn($i) => $i + ['answer' => $ans[$i['id']] ?? null], $reg['items']) : [];
    $rel = array_map(fn($r) => ['ver' => $r['ver'], 'title' => (string)($r['title'] ?? $r['ver']), 'date' => (string)($r['date'] ?? ''), 'final' => !empty($r['final']),
        'prelim' => !empty($r['prelim']), 'url' => (string)($r['url'] ?? ''), 'project' => (string)($r['project'] ?? ''), 'pdf' => $r['hasPdf'], 'changes' => array_values((array)($r['changes'] ?? [])),
        'accepted' => (bool)db_val("SELECT 1 FROM signatures WHERE order_id = ? AND doc_kind = 'album_accept' AND version = ?", [(int)$o['id'], $r['ver']])], kab_releases($o));
    $rv = array_map(fn($r) => array_diff_key($r, ['_f' => 1]), kab_reviews($o));
    $rounds = linea_cfg()['rounds'] ?? null;
    $rm = kab_remont($o);
    return ['ok' => true, 'order' => linea_public_order($o) + ['objectTitle' => kb_obj_title($o), 'confirmedEmail' => $c !== null],
        'next' => kab_next_action($o), 'step' => kab_step($o), 'brief' => kb_brief($o), 'releases' => $rel,
        'registry' => $reg ? ['ver' => $reg['ver'], 'items' => $items] : null, 'reviews' => $rv, 'rounds' => is_int($rounds) ? ['used' => count($rv), 'max' => $rounds] : null,
        'remont' => ['eligible' => kab_remont_eligible($o), 'chooseAfter' => brig_terms()['choose_after'], 'hasRequest' => (bool)$rm['request'],
            'jobStatus' => $rm['job']['status'] ?? null, 'rt' => $o['token']],
        'lenta' => kb_lenta($o), 'guest' => $c === null, 'fresh' => kab_fresh()];
}

/** Согласия аккаунта без дублей: по виду + заказу + сделке — последняя запись; с номером заказа и тем, можно ли отозвать сейчас (и почему нет). */
function kb_consents(array $c): array
{
    kab_consents_sync($c);
    $out = [];
    foreach (brig_all('SELECT * FROM consents WHERE account_id = ? ORDER BY id', [(int)$c['id']]) as $x) { $out[$x['kind'] . '|' . (int)$x['order_id'] . '|' . (int)$x['job_id']] = $x; }
    return array_values(array_map(function ($x) use ($c) {
        $o = $x['order_id'] ? brig_one('SELECT * FROM orders WHERE id = ?', [(int)$x['order_id']]) : null;
        return ['id' => (int)$x['id'], 'kind' => $x['kind'], 'title' => KAB_LEGAL[$x['kind']]['title'] ?? $x['kind'], 'edition' => $x['edition'], 'given' => $x['given_at'], 'revoked' => $x['revoked_at'],
            'order' => $o['number'] ?? null, 'object' => $o ? (string)($o['object_type'] ?: '') : '', 'whyNot' => $x['revoked_at'] ? null : kab_consent_why_not($c, $x)];
    }, $out));
}

function kb_docs(array $orders): array
{
    $out = [];
    foreach ($orders as $o) {
        $n = $o['number'];
        if ($o['consent_at']) { $out[] = ['o' => $n, 'kind' => 'Согласие', 'title' => 'На обработку персональных данных', 'at' => $o['consent_at'], 'note' => 'дано при отправке брифа']; }
        if ($o['invoice_at']) { $out[] = ['o' => $n, 'kind' => 'Счёт', 'title' => 'Счёт на оплату проекта', 'at' => $o['invoice_at'], 'note' => 'Отправлен на почту']; }
        if ($o['paid_at']) { $out[] = ['o' => $n, 'kind' => 'Оплата', 'title' => 'Оплата проекта ' . brig_rub((int)$o['amount_kop']), 'at' => $o['paid_at'], 'note' => 'Чек — в письме сервиса онлайн-оплаты, копия — у LINEA по запросу']; }
        foreach (kab_releases($o) as $r) {
            if ($r['hasPdf']) { $out[] = ['o' => $n, 'kind' => 'Альбом', 'title' => 'Альбом ' . ($r['title'] ?? $r['ver']) . ' (PDF)', 'at' => (string)($r['date'] ?? ''), 'href' => 'file&o=' . rawurlencode($n) . '&v=' . rawurlencode($r['ver']) . '&f=album.pdf']; }
        }
        if (db_val('SELECT 1 FROM signatures WHERE order_id = ?', [(int)$o['id']]) || is_file(kab_order_dir($o) . '/answers.json')) {
            $out[] = ['o' => $n, 'kind' => 'Протокол', 'title' => 'Протокол ответов и согласованных решений', 'at' => '', 'href' => 'doc&o=' . rawurlencode($n) . '&kind=protocol'];
        }
        $rm = kab_remont($o);
        if ($rm['job']) {
            foreach (brig_all('SELECT kind, num, status, client_signed_at, brigade_signed_at, hash FROM br_contracts WHERE job_id = ? ORDER BY id', [(int)$rm['job']['id']]) as $d) {
                $out[] = ['o' => $n, 'kind' => 'Ремонт', 'title' => ($d['kind'] === 'main' ? 'Договор подряда с бригадой' : 'Допсоглашение № ' . (int)$d['num']) . ($d['client_signed_at'] && $d['brigade_signed_at'] ? ' — подписан обеими сторонами' : ' — не подписан'),
                    'at' => (string)($d['brigade_signed_at'] ?: $d['client_signed_at']), 'note' => 'отпечаток документа ' . substr((string)$d['hash'], 0, 12) . '…', 'ext' => 'remont-dogovor.php?t=' . $o['token']];
            }
        }
    }
    return $out;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    switch ($a) {
        case 'objects': {
            $list = [];
            foreach (kb_orders($c, $g) as $o) {
                $nx = kab_next_action($o);
                $list[] = ['number' => $o['number'], 'kindTitle' => LINEA_KINDS[$o['kind']] ?? $o['kind'], 'objectTitle' => kb_obj_title($o), 'status' => $o['status'],
                    'statusText' => LINEA_STATUS[$o['status']] ?? $o['status'], 'step' => kab_step($o), 'next' => $nx, 'archived' => in_array($o['status'], ['cancelled', 'refunded'], true),
                    'test' => (bool)$o['test']];
            }
            usort($list, fn($x, $y) => [($x['archived'] ? 2 : ($x['next']['who'] === 'client' ? 0 : 1))] <=> [($y['archived'] ? 2 : ($y['next']['who'] === 'client' ? 0 : 1))]);
            $unread = $c ? (int)db_val('SELECT COUNT(*) FROM notices WHERE account_id = ? AND read_at IS NULL', [(int)$c['id']]) : 0;
            linea_json(['ok' => true, 'objects' => $list, 'unread' => $unread, 'guest' => $c === null, 'name' => $c['name'] ?? null]);
        }
        case 'object': linea_json(kb_object(kb_order((string)($_GET['o'] ?? '')), $c));
        case 'docs': {
            $orders = kb_orders($c, $g);
            if (isset($_GET['o'])) { $orders = [kb_order((string)$_GET['o'])]; }
            $cons = $c ? kb_consents($c) : [];
            if (isset($_GET['o'])) { $cons = array_values(array_filter($cons, fn($x) => $x['order'] === null || $x['order'] === $orders[0]['number'])); }
            linea_json(['ok' => true, 'docs' => kb_docs($orders), 'consents' => $cons]);
        }
        case 'notices': {
            if (!$c) { linea_json(['ok' => true, 'notices' => [], 'guest' => true]); }
            linea_json(['ok' => true, 'notices' => array_map(fn($n) => ['id' => (int)$n['id'], 'grp' => $n['grp'], 'text' => $n['text'], 'link' => $n['link'], 'at' => $n['at'], 'unread' => !$n['read_at']],
                // одинаковые напоминания (несколько таймеров с тем же текстом) — одной строкой, самой свежей
                (function ($rows) { $seen = []; return array_values(array_filter($rows, function ($n) use (&$seen) { $k = $n['grp'] . '|' . preg_replace('/\d+/', '#', (string)$n['text']); if (isset($seen[$k])) { return false; } return $seen[$k] = true; })); })(brig_all('SELECT * FROM notices WHERE account_id = ? ORDER BY id DESC LIMIT 200', [(int)$c['id']]))),
                'prefs' => json_decode((string)$c['prefs'], true) ?: ['groups' => array_fill_keys(array_keys(KAB_GROUPS), ['mail' => true]), 'digest' => 'now'], 'groups' => KAB_GROUPS]);
        }
        case 'profile': {
            if (!$c) { linea_json(['ok' => false, 'needCode' => true, 'error' => 'Профиль — после входа кодом'], 401); }
            kab_consents_sync($c);
            linea_json(['ok' => true, 'profile' => ['name' => (string)$c['name'], 'phone' => (string)$c['phone'], 'email' => (string)$c['email']],
                // устройства без дублей: одно и то же устройство (браузер + адрес) — одной строкой, текущее — всегда отдельно
                'devices' => array_values(array_reduce(brig_all('SELECT * FROM acc_devices WHERE account_id = ? AND ended_at IS NULL ORDER BY last_at DESC', [(int)$c['id']]), function ($acc, $d) {
                    $cur = $d['dev'] === ($_SESSION['dev'] ?? ''); $k = $cur ? 'cur' : md5((string)$d['ua'] . '|' . (string)$d['ip']);
                    if (!isset($acc[$k])) { $acc[$k] = ['id' => (int)$d['id'], 'ua' => (string)$d['ua'], 'ip' => (string)$d['ip'], 'created' => $d['created_at'], 'last' => $d['last_at'], 'current' => $cur]; }
                    return $acc; }, [])),
                'consents' => kb_consents($c),
                'pd' => array_map(fn($p) => ['id' => (int)$p['id'], 'kind' => $p['kind'], 'title' => KAB_PD_KINDS[$p['kind']] ?? $p['kind'], 'status' => $p['status'], 'created' => $p['created_at'], 'due' => $p['due_at'],
                    'done' => $p['done_at'], 'reply' => (string)$p['reply'], 'file' => $p['file'] ? true : false], brig_all('SELECT * FROM pd_requests WHERE account_id = ? ORDER BY id DESC', [(int)$c['id']])),
                'blockers' => kab_pd_blockers($c), 'pdDays' => brig_terms()['pd_days'], 'retentionYears' => brig_terms()['retention_years'], 'fresh' => kab_fresh()]);
        }
        case 'file': {
            if (isset($_GET['pd'])) {
                if (!$c) { linea_fail('Нет доступа', 403); }
                $p = brig_one("SELECT * FROM pd_requests WHERE id = ? AND account_id = ? AND kind = 'export' AND file IS NOT NULL", [(int)$_GET['pd'], (int)$c['id']]);
                $f = $p ? linea_private() . '/exports/' . basename((string)$p['file']) : '';
                if (!$p || !is_file($f)) { linea_fail('Файл не найден', 404); }
                kab_require_fresh();
                header('Content-Type: application/zip'); header('Content-Disposition: attachment; filename="LINEA-moi-dannye.zip"'); header('Content-Length: ' . filesize($f)); header('Cache-Control: no-store');
                readfile($f); exit;
            }
            $o = kb_order((string)($_GET['o'] ?? ''));
            $v = preg_replace('/[^A-Za-z0-9._-]/', '', (string)($_GET['v'] ?? '')) ?? '';
            $fn = in_array($_GET['f'] ?? '', ['album.pdf', 'registry.json'], true) ? (string)$_GET['f'] : '';
            $rel = array_filter(kab_releases($o), fn($r) => $r['ver'] === $v);
            $f = kab_order_dir($o) . '/releases/' . $v . '/' . $fn;
            if (!$rel || $fn === '' || $v === '' || !is_file($f)) { linea_fail('Файл не найден', 404); }
            header('Content-Type: ' . ($fn === 'album.pdf' ? 'application/pdf' : 'application/json'));
            header('Content-Disposition: ' . ($fn === 'album.pdf' ? 'inline' : 'attachment') . '; filename="LINEA-' . $o['number'] . '-' . $v . '-' . $fn . '"');
            header('Content-Length: ' . filesize($f)); header('Cache-Control: private, no-store'); header('X-Content-Type-Options: nosniff');
            readfile($f); exit;
        }
        case 'doc': {
            $o = kb_order((string)($_GET['o'] ?? ''));
            $h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
            $rows = '';
            foreach (kab_answers($o)['items'] as $id => $x) {
                $rows .= '<tr><td>' . $h($id) . '</td><td>' . $h(($x['decision'] ?? '') === 'agree' ? 'Согласовано' : (($x['decision'] ?? '') === 'disagree' ? 'Не согласен: ' . ($x['text'] ?? '') : trim(($x['option'] ?? '') . ' ' . ($x['text'] ?? ''))))
                    . '</td><td>' . $h($x['at'] ?? '') . '</td><td>' . $h($x['ver'] ?? '') . '</td><td><code>' . $h(substr((string)($x['sha'] ?? ''), 0, 16)) . '</code></td></tr>';
            }
            $sig = '';
            foreach (brig_all('SELECT * FROM signatures WHERE order_id = ? ORDER BY id', [(int)$o['id']]) as $s) {
                $sig .= '<tr><td>' . $h($s['doc_kind']) . ' ' . $h($s['doc_id']) . '</td><td>' . $h($s['decision']) . '</td><td>' . $h($s['at']) . ' МСК</td><td>' . $h($s['ip']) . '</td><td><code>' . $h(substr((string)$s['sha256'], 0, 16)) . '</code></td><td>вход кодом на почту</td></tr>';
            }
            header('Content-Type: text/html; charset=utf-8'); header('X-Robots-Tag: noindex'); header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'");
            echo '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Протокол — ' . $h($o['number']) . '</title>'
                . '<style>body{font:14px/1.5 sans-serif;max-width:900px;margin:24px auto;padding:0 16px}table{border-collapse:collapse;width:100%;margin:0 0 20px}td,th{border:1px solid #ccc;padding:5px 7px;text-align:left;vertical-align:top}</style></head><body>'
                . '<h1>Протокол ответов и согласованных решений</h1><p>Заказ ' . $h($o['number']) . ' · сформирован ' . $h(linea_now()) . ' МСК</p>'
                . '<h2>Ответы и решения</h2><table><tr><th>№</th><th>Ответ</th><th>Когда</th><th>Версия</th><th>Реестр отпечаток документа</th></tr>' . ($rows ?: '<tr><td colspan="5">Ответов нет</td></tr>') . '</table>'
                . '<h2>Подписи (вход кодом на почту)</h2><table><tr><th>Документ</th><th>Решение</th><th>Время</th><th>IP</th><th>отпечаток документа</th><th>Способ</th></tr>' . ($sig ?: '<tr><td colspan="6">Подписей нет</td></tr>') . '</table></body></html>';
            exit;
        }
    }
    linea_fail('Неизвестный запрос', 404);
}

// ── действия
brig_method('POST');
acc_csrf_check();
$in = brig_input();
$num = (string)($in['o'] ?? '');

switch ($a) {
    case 'pay': {
        $o = kb_order($num);
        kab_require_fresh_for_order($o);
        require_once __DIR__ . '/lib/yookassa.php';
        if (!linea_rate('pay', 30)) { linea_fail('Слишком много попыток — подождите немного', 429); }
        $r = yk_payment_for($o);
        if (!$r['ok']) { linea_fail($r['why'], 409); }
        linea_json(['ok' => true, 'url' => $r['url']]);
    }
    case 'answer':
    case 'decide': {
        $o = kb_order($num);
        kab_require_fresh_for_order($o);
        $reg = kab_registry($o);
        $id = linea_str($in['id'] ?? '', 20);
        $item = $reg ? (array_values(array_filter($reg['items'], fn($i) => $i['id'] === $id))[0] ?? null) : null;
        if (!$item || $item['closed']) { linea_fail('Вопрос не найден или уже закрыт', 404); }
        $text = linea_str($in['text'] ?? '', 2000);
        $rec = ['at' => linea_now(), 'ver' => $reg['ver'], 'sha' => $reg['sha256'], 'by' => 'client:' . (int)($_SESSION['roles']['client'] ?? 0)];
        if ($a === 'answer') {
            if ($item['kind'] !== 'question' && $item['kind'] !== 'conflict') { linea_fail('Это решение — его согласуют, а не отвечают'); }
            $opt = linea_str($in['option'] ?? '', 120);
            if ($opt !== '' && !in_array($opt, $item['options'], true)) { linea_fail('Такого варианта нет'); }
            if ($opt === '' && $text === '') { linea_fail('Выберите вариант или напишите ответ'); }
            $rec += ['option' => $opt, 'text' => $text];
            linea_event((int)$o['id'], 'client', 'Ответ на ' . $id . ': ' . trim($opt . ' ' . $text));
        } else {
            $dec = (string)($in['decision'] ?? '');
            if (!in_array($dec, ['agree', 'disagree'], true)) { linea_fail('Выберите: согласовать или предложить своё'); }
            if ($dec === 'disagree' && $text === '') { linea_fail('Напишите, что предлагаете вместо этого'); }
            $rec += ['decision' => $dec, 'text' => $text];
            kab_sign('client', (int)($_SESSION['roles']['client'] ?? 0), 'decision', $id, $reg['ver'], $reg['sha256'], $dec, $text, (int)$o['id']);
            linea_event((int)$o['id'], 'client', ($dec === 'agree' ? 'Согласовано решение ' : 'Не согласен с решением ') . $id . ($text !== '' ? ': ' . $text : ''));
        }
        kab_answers_put($o, $id, $rec);
        brig_admin_notify('Клиент ответил: ' . $o['number'], $id . ' — ' . ($a === 'answer' ? 'ответ' : 'решение'), brig_link('api/panel.php?s=order&o=' . rawurlencode($o['number']) . '&tab=voprosy'), (bool)$o['test']);
        linea_json(kb_object(linea_order_by_number($o['number']), $c));
    }
    case 'accept_album': {
        $o = kb_order($num);
        kab_require_fresh_for_order($o);
        $v = preg_replace('/[^A-Za-z0-9._-]/', '', (string)($in['ver'] ?? '')) ?? '';
        $r = array_values(array_filter(kab_releases($o), fn($x) => $x['ver'] === $v && !empty($x['final'])))[0] ?? null;
        if (!$r) { linea_fail('Финальная версия не найдена', 404); }
        if (db_val("SELECT 1 FROM signatures WHERE order_id = ? AND doc_kind = 'album_accept' AND version = ?", [(int)$o['id'], $v])) { linea_fail('Альбом уже принят', 409); }
        $meta = (string)file_get_contents(kab_order_dir($o) . '/releases/' . $v . '/meta.json');
        $pdf = kab_order_dir($o) . '/releases/' . $v . '/album.pdf';
        kab_sign('client', (int)($_SESSION['roles']['client'] ?? 0), 'album_accept', $o['number'], $v, is_file($pdf) ? hash_file('sha256', $pdf) : hash('sha256', $meta), 'agree', '', (int)$o['id']);
        linea_event((int)$o['id'], 'client', 'Альбом версии ' . $v . ' принят в кабинете (акт сдачи-приёмки)');
        linea_json(kb_object(linea_order_by_number($o['number']), $c));
    }
    case 'msg': {
        $o = kb_order($num);
        kab_require_fresh_for_order($o);
        $text = linea_str($in['text'] ?? '', 2000);
        if ($text === '') { linea_fail('Пустое сообщение'); }
        if (!linea_rate('kabmsg', 30)) { linea_fail('Слишком много сообщений — подождите', 429); }
        linea_event((int)$o['id'], 'kab:client', $text);
        brig_admin_notify('Сообщение клиента: ' . $o['number'], mb_substr($text, 0, 300), brig_link('api/panel.php?s=order&o=' . rawurlencode($o['number']) . '&tab=lenta'), (bool)$o['test']);
        linea_json(kb_object(linea_order_by_number($o['number']), $c));
    }
    case 'notices_read': {
        if ($c) { db_exec('UPDATE notices SET read_at = ? WHERE account_id = ? AND read_at IS NULL', [linea_now(), (int)$c['id']]); }
        linea_json(['ok' => true]);
    }
}

// ── дальше — только для клиента с аккаунтом
if (!$c) { linea_json(['ok' => false, 'needCode' => true, 'error' => 'Подтвердите почту кодом из письма'], 401); }
switch ($a) {
    case 'profile': {
        kab_require_fresh();
        db_update('accounts', ['name' => linea_str($in['name'] ?? '', 120) ?: null, 'phone' => linea_str($in['phone'] ?? '', 40) ?: null], 'id = ?', [(int)$c['id']]);
        linea_json(['ok' => true]);
    }
    case 'prefs': {
        $groups = [];
        foreach (KAB_GROUPS as $k => $_) { $groups[$k] = ['mail' => !empty($in['groups'][$k]['mail'])]; }
        db_update('accounts', ['prefs' => json_encode(['groups' => $groups, 'digest' => ($in['digest'] ?? '') === 'day' ? 'day' : 'now'])], 'id = ?', [(int)$c['id']]);
        linea_json(['ok' => true]);
    }
    case 'device_end': {
        db_exec('UPDATE acc_devices SET ended_at = ? WHERE id = ? AND account_id = ?', [linea_now(), (int)($in['id'] ?? 0), (int)$c['id']]);
        linea_json(['ok' => true]);
    }
    case 'consent_revoke': {
        kab_require_fresh();
        $x = brig_one('SELECT * FROM consents WHERE id = ? AND account_id = ?', [(int)($in['id'] ?? 0), (int)$c['id']]);
        if (!$x) { linea_fail('Согласие не найдено', 404); }
        if ($x['revoked_at']) { linea_fail('Согласие уже отозвано', 409); }
        $o = $x['order_id'] ? brig_one('SELECT * FROM orders WHERE id = ?', [(int)$x['order_id']]) : null;
        $msg = 'Согласие отозвано.';
        switch ($x['kind']) {
            case 'pd':
                // ПДн целиком = заявка на удаление (с проверкой, что сейчас мешает)
                if ($b = kab_pd_blockers($c)) { linea_fail('Сейчас отозвать нельзя: ' . implode('; ', $b) . '. Удалить можно после завершения; новые цели обработки остановим по заявке «Исправить данные»', 409); }
                $msg = 'Согласие отозвано. Заявка на удаление данных создана — выполним за ' . brig_terms()['pd_days'] . ' рабочих дней.';
                db_insert('pd_requests', ['account_id' => (int)$c['id'], 'kind' => 'delete', 'status' => 'new', 'note' => 'Отзыв согласия на обработку ПДн', 'created_at' => linea_now(), 'due_at' => kab_wd_add(linea_now(), brig_terms()['pd_days'])]);
                break;
            case 'portfolio':
                $msg = 'Согласие на показ в портфолио отозвано — снимем проект с сайта при ближайшей пересборке.';
                break;
            case 'project_to_brigades':
                $rm = $o ? kab_remont($o) : ['request' => null, 'job' => null];
                if ($rm['job'] && $rm['job']['status'] !== 'cancelled') { linea_fail('Договор с бригадой уже заключается или исполняется — отозвать нельзя: проект нужен для исполнения договора', 409); }
                if ($rm['request'] && in_array($rm['request']['status'], ['new', 'sent'], true)) {
                    db_update('br_requests', ['status' => 'cancelled', 'updated_at' => linea_now()], 'id = ?', [(int)$rm['request']['id']]);
                    $msg = 'Согласие отозвано: подбор бригады закрыт, пакет проекта бригадам больше не доступен.';
                }
                break;
            case 'transfer_brigade':
                $j = $x['job_id'] ? brig_one('SELECT * FROM br_jobs WHERE id = ?', [(int)$x['job_id']]) : null;
                if ($j && $j['contacts_open_at'] && $j['status'] !== 'cancelled') { linea_fail('Договор подписан и исполняется — контакты нужны бригаде для работы. Отозвать можно после завершения или расторжения', 409); }
                break;
            case 'public_review':
                if ($x['job_id']) { db_exec('UPDATE br_reviews SET hidden = 1, hidden_reason = ?, hidden_at = ? WHERE job_id = ?', ['отзыв согласия автора', linea_now(), (int)$x['job_id']]); }
                $msg = 'Отзыв снят с публичной карточки бригады.';
                break;
        }
        db_update('consents', ['revoked_at' => linea_now(), 'ip' => linea_ip()], 'id = ?', [(int)$x['id']]);
        if ($o) { linea_event((int)$o['id'], 'client', 'Отозвано согласие: ' . (KAB_LEGAL[$x['kind']]['title'] ?? $x['kind'])); }
        brig_audit('client#' . $c['id'], 'consent-revoke', $o ? 'order ' . $o['number'] : '', $x['kind']);
        brig_admin_notify('Отзыв согласия: ' . (KAB_LEGAL[$x['kind']]['title'] ?? $x['kind']), $msg, brig_link('api/panel.php?s=pd'), (bool)$c['test']);
        linea_json(['ok' => true, 'message' => $msg]);
    }
    case 'pd': {
        kab_require_fresh();
        $kind = (string)($in['kind'] ?? '');
        if (!in_array($kind, ['delete', 'export', 'fix'], true)) { linea_fail('Неизвестная заявка'); }
        if (brig_one("SELECT 1 FROM pd_requests WHERE account_id = ? AND kind = ? AND status = 'new'", [(int)$c['id'], $kind])) { linea_fail('Такая заявка уже принята — мы её выполняем', 409); }
        $blk = $kind === 'delete' ? kab_pd_blockers($c) : [];
        if ($blk && !empty($in['later'])) {   // заявка на удаление после завершения работ — принимается сразу, выполняется, когда помехи уйдут
            $id = db_insert('pd_requests', ['account_id' => (int)$c['id'], 'kind' => 'delete', 'status' => 'new', 'note' => 'Удалить после завершения: ' . implode('; ', $blk) . (($n = linea_str($in['note'] ?? '', 500)) !== '' ? '. ' . $n : ''),
                'blockers' => implode('; ', $blk), 'created_at' => linea_now(), 'due_at' => kab_wd_add(linea_now(), brig_terms()['pd_days'])]);
            brig_audit('client#' . $c['id'], 'pd-request', 'pd#' . $id, 'delete-later');
            brig_admin_notify('Заявка: удалить персональные данные после завершения', implode('; ', $blk), brig_link('api/panel.php?s=pd'), (bool)$c['test']);
            linea_json(['ok' => true, 'message' => 'Заявка принята: удалим данные, как только закончится ' . implode('; ', $blk) . '. Напишем на почту.']);
        }
        if ($blk) { linea_fail('Удалить данные сейчас нельзя: ' . implode('; ', $blk) . '. Удалим после завершения — или оставьте заявку «Исправить данные», чтобы остановить обработку для новых целей', 409); }
        $id = db_insert('pd_requests', ['account_id' => (int)$c['id'], 'kind' => $kind, 'status' => 'new', 'note' => linea_str($in['note'] ?? '', 1000) ?: null,
            'created_at' => linea_now(), 'due_at' => kab_wd_add(linea_now(), brig_terms()['pd_days'])]);
        brig_audit('client#' . $c['id'], 'pd-request', 'pd#' . $id, $kind);
        brig_admin_notify('Заявка по персональным данным: ' . (KAB_PD_KINDS[$kind] ?? $kind), 'Срок — ' . brig_terms()['pd_days'] . ' рабочих дней', brig_link('api/panel.php?s=pd'), (bool)$c['test']);
        linea_json(['ok' => true, 'message' => 'Заявка принята. Выполним до ' . date('d.m.Y', strtotime(kab_wd_add(linea_now(), brig_terms()['pd_days']))) . ' и напишем на почту.']);
    }
}
linea_fail('Неизвестное действие', 404);
