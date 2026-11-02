<?php
/**
 * api/brigada.php?m=kab — каркас кабинета бригады (спецификация 4.0–4.11): кто вошёл, главная «Сейчас от вас нужно», команда,
 * документы, уведомления, рейтинг и отзывы, согласие на публичную карточку, подписант ООО.
 *   GET  ?a=me | home | team | docs | notices | rating
 *   POST (CSRF) ?a=team_invite {email, name, role: foreman|worker, objects:[jobId]|null} · team_update {id, role, objects} · team_remove {id}
 *               · worker_msg {on} · notices_read {all|id} · prefs {groups:{zakazy:bool,…}} · review_reply {id, text}
 *               · card_consent {give} · signer {name, position, basis}
 * Команда, согласие и подписант — только владелец; приглашение — после входа кодом (значимое действие).
 */
declare(strict_types=1);
if (!defined('LINEA_BRIGADA')) { http_response_code(404); exit; }   // модуль api/brigada.php?m=…, напрямую не открывается
require_once __DIR__ . '/../boot.php';
require_once __DIR__ . '/../brigada.php';

brig_https();
$a = (string)($_GET['a'] ?? 'me');
if ($a === 'me') {
    $b = brig_me(false);
    acc_session();
    linea_json(['ok' => true, 'csrf' => acc_csrf_token(), 'fresh' => kab_fresh(), 'email' => isset($_SESSION['email']) ? preg_replace('/^(.).*(@.*)$/u', '$1•••$2', (string)$_SESSION['email']) : null,
        'roles' => array_keys($_SESSION['roles'] ?? []), 'passwordLogin' => (bool)(linea_cfg()['acc_password_login'] ?? true),
        'brigade' => $b ? brig_public_self($b) + ['role' => brig_role($b), 'roleText' => BRIG_ROLES[brig_role($b)] ?? '', 'me' => (string)($b['_name'] ?? ''),
            'can' => array_combine($p = ['feed', 'offer_send', 'sign', 'money', 'team', 'profile', 'msg', 'stage', 'photo', 'sheets'], array_map(fn($x) => brig_can($b, $x), $p)),
            'cardConsent' => $b['card_consent_ed'] !== 'revoked', 'workerMsg' => (bool)$b['worker_msg'],
            'signer' => json_decode((string)$b['signer'], true) ?: null] : null,
        'specs' => BRIG_SPECS, 'districts' => BRIG_DISTRICTS, 'legal' => BRIG_LEGAL, 'docs' => BRIG_DOCS, 'terms' => brig_terms_public(), 'npd' => brig_terms()['npd'], 'cardEd' => BRIG_CARD_ED]);
}
$b = brig_me();
$bid = (int)$b['id'];
$own = brig_role($b) === 'owner';
$WHO = brig_who($b);

function kb_member(array $m): array
{
    $acc = db_one('SELECT email, last_login_at FROM accounts WHERE id = ?', [(int)$m['account_id']]);
    return ['id' => (int)$m['id'], 'name' => (string)$m['name'], 'email' => (string)($acc['email'] ?? ''), 'role' => $m['role'], 'roleText' => BRIG_ROLES[$m['role']] ?? $m['role'],
        'objects' => $m['objects'] !== null ? array_map('intval', json_decode((string)$m['objects'], true) ?: []) : null, 'invitedAt' => $m['invited_at'], 'lastLogin' => $acc['last_login_at'] ?? null];
}

/** Объекты из списка — только свои сделки бригады; null — все объекты (только бригадиру). */
function kb_objects($v, int $bid, string $role): ?array
{
    if ($v === null && $role === 'foreman') { return null; }
    $ids = array_values(array_unique(array_map('intval', is_array($v) ? $v : [])));
    return array_values(array_filter($ids, fn($id) => (bool)db_val('SELECT 1 FROM br_jobs WHERE id = ? AND brigade_id = ?', [$id, $bid])));
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    switch ($a) {
        case 'home':
            if ($own) { brig_commission_sweep($bid); }
            linea_json(['ok' => true] + brig_home($b));
        case 'team':
            brig_need($b, 'team');
            linea_json(['ok' => true, 'owner' => ['name' => $b['contact_name'], 'email' => $b['email']], 'workerMsg' => (bool)$b['worker_msg'],
                'members' => array_map('kb_member', brig_all('SELECT * FROM br_members WHERE brigade_id = ? AND removed_at IS NULL ORDER BY id', [$bid])),
                'jobs' => array_map(fn($j) => ['id' => (int)$j['id'], 'object' => (string)$j['object_title'], 'status' => BRIG_JOB_STATUS[$j['status']] ?? $j['status']],
                    brig_all("SELECT j.id, j.status, r.object_title FROM br_jobs j JOIN br_requests r ON r.id = j.request_id WHERE j.brigade_id = ? AND j.status <> 'cancelled' ORDER BY j.id DESC", [$bid])),
                'roles' => BRIG_ROLES]);
        case 'docs': {
            // документы бригады (4.0б): принятые редакции правил и агентского договора, договоры и допсоглашения по объектам, счета, листы
            $acc = [];
            foreach (BRIG_DOCS as $k => $d) { $acc[] = ['title' => $d['title'], 'ed' => $b[['pd' => 'consent_pd_ed', 'rules' => 'rules_ed', 'agency' => 'agency_ed'][$k] ?? ''] ?? $d['ed'], 'at' => $b['accepted_at'], 'ip' => $b['ip_reg'], 'href' => $d['href'] ?? '']; }
            $acc[] = ['title' => 'Согласие на распространение данных в публичной карточке бригады (ст. 10.1 152-ФЗ)', 'ed' => $b['card_consent_ed'] === 'revoked' ? 'отозвано' : ($b['card_consent_ed'] ?: 'в составе агентского договора, п. 7'), 'at' => $b['card_consent_at'], 'ip' => null, 'href' => ''];
            $jobs = [];
            foreach (brig_jobs_for($b) as $j) {
                $jobs[] = ['id' => (int)$j['id'], 'object' => (string)$j['object_title'], 'status' => BRIG_JOB_STATUS[$j['status']] ?? $j['status'],
                    'contracts' => array_map(fn($c) => ['id' => (int)$c['id'], 'kind' => $c['kind'], 'num' => (int)$c['num'], 'status' => $c['status'], 'hash' => $c['hash'],
                        'clientSigned' => $c['client_signed_at'], 'brigadeSigned' => $c['brigade_signed_at']], brig_all("SELECT * FROM br_contracts WHERE job_id = ? AND status <> 'void' ORDER BY id", [(int)$j['id']])),
                    'acts' => array_map(fn($s) => ['idx' => (int)$s['idx'], 'name' => $s['name'], 'accepted' => $s['accepted_at']], brig_all('SELECT idx, name, accepted_at FROM br_stages WHERE job_id = ? AND accepted_at IS NOT NULL ORDER BY idx', [(int)$j['id']])),
                    'sheets' => array_map(fn($s) => ['id' => (int)$s['id'], 'text' => mb_substr((string)$s['text'], 0, 80), 'file' => $s['result_file'] ? (int)$s['result_file'] : null], brig_all("SELECT id, text, result_file FROM br_sheet_reqs WHERE job_id = ? AND status = 'ready'", [(int)$j['id']]))];
            }
            $inv = $own ? array_map(fn($i) => ['number' => $i['number'], 'amount' => (int)$i['amount_kop'] / 100, 'issued' => $i['issued_at'], 'due' => $i['due_at'], 'paid' => $i['paid_at']], brig_all('SELECT * FROM br_invoices WHERE brigade_id = ? ORDER BY id DESC', [$bid])) : [];
            linea_json(['ok' => true, 'accepted' => $acc, 'jobs' => $jobs, 'invoices' => $inv]);
        }
        case 'notices': {
            $acc = (int)$b['_acc'];
            $list = brig_all('SELECT * FROM notices WHERE account_id = ? ORDER BY id DESC LIMIT 100', [$acc]);
            $prefs = json_decode((string)db_val('SELECT prefs FROM accounts WHERE id = ?', [$acc]), true) ?: [];
            linea_json(['ok' => true, 'unread' => (int)db_val('SELECT COUNT(*) FROM notices WHERE account_id = ? AND read_at IS NULL', [$acc]),
                'list' => array_map(fn($n) => ['id' => (int)$n['id'], 'grp' => $n['grp'], 'text' => $n['text'], 'link' => (string)$n['link'], 'at' => $n['at'], 'read' => (bool)$n['read_at']], $list),
                'groups' => ['zakazy' => 'Заказы', 'obekty' => 'Объекты', 'dengi' => 'Деньги', 'listy' => 'Листы'], 'prefs' => $prefs['groups'] ?? [],
                'must' => 'Подпись договора, счета и долг, разногласия, блокировка — приходят на почту всегда']);
        }
        case 'rating':
            linea_json(['ok' => true, 'stats' => brig_stats($bid), 'formula' => 'Порядок в подборе: рейтинг по отзывам завершённых сделок, число сделок через LINEA, время ответа на запросы, район. Платного поднятия нет.',
                'reviews' => array_map(fn($r) => ['id' => (int)$r['id'], 'rating' => (int)$r['rating'], 'text' => (string)$r['text'], 'at' => $r['created_at'], 'hidden' => (bool)$r['hidden'], 'reply' => (string)$r['reply'], 'replyAt' => $r['reply_at']],
                    brig_all('SELECT * FROM br_reviews WHERE brigade_id = ? ORDER BY id DESC LIMIT 100', [$bid]))]);
    }
    linea_fail('Неизвестный раздел', 404);
}

brig_method('POST');
brig_csrf();
$in = brig_input();
$now = linea_now();
switch ($a) {
    case 'team_invite': {
        brig_need($b, 'team');
        kab_require_fresh();
        $email = mb_strtolower(trim((string)($in['email'] ?? '')));
        $role = (string)($in['role'] ?? '');
        $name = brig_guard(linea_str($in['name'] ?? '', 80), false, ['who' => $WHO, 'field' => 'команда', 'brigade_id' => $bid]);
        if (!kab_email_ok($email)) { linea_fail('Проверьте почту'); }
        if (!in_array($role, ['foreman', 'worker'], true)) { linea_fail('Роль — бригадир или сотрудник'); }
        if ($name === '') { linea_fail('Как зовут человека'); }
        if ((int)db_val('SELECT COUNT(*) FROM br_members WHERE brigade_id = ? AND removed_at IS NULL', [$bid]) >= 30) { linea_fail('Не больше 30 человек в команде'); }
        if ($email === mb_strtolower((string)$b['email'])) { linea_fail('Это почта владельца бригады'); }
        $acc = acc_by_email('brigade', $email);
        if ($acc && brig_one('SELECT 1 FROM br_brigades WHERE account_id = ?', [(int)$acc['id']])) { linea_fail('С этой почтой зарегистрирована другая бригада — пригласите на другую почту', 409); }
        if ($acc && ($m = brig_one('SELECT * FROM br_members WHERE account_id = ?', [(int)$acc['id']])) && !$m['removed_at']) { linea_fail((int)$m['brigade_id'] === $bid ? 'Человек уже в команде' : 'Человек уже в команде другой бригады', 409); }
        $objects = kb_objects(array_key_exists('objects', $in) ? $in['objects'] : ($role === 'foreman' ? null : []), $bid, $role);
        db_tx(function () use ($acc, $email, $b, $bid, $role, $name, $objects, $now, $WHO) {
            if ($acc) { db_update('accounts', ['status' => 'active'], 'id = ?', [(int)$acc['id']]); $aid = (int)$acc['id']; }
            else { $aid = db_insert('accounts', ['role' => 'brigade', 'email' => $email, 'pass_hash' => '', 'status' => 'active', 'fail_n' => 0, 'lock_until' => 0, 'created_at' => $now, 'test' => (int)$b['test'], 'name' => $name]); }
            $row = ['brigade_id' => $bid, 'role' => $role, 'name' => $name, 'objects' => $objects !== null ? json_encode($objects) : null, 'invited_at' => $now, 'invited_by' => $WHO, 'removed_at' => null];
            if (db_one('SELECT 1 FROM br_members WHERE account_id = ?', [$aid])) { db_update('br_members', $row, 'account_id = ?', [$aid]); } else { db_insert('br_members', $row + ['account_id' => $aid]); }
        });
        brig_audit($WHO, 'team-invite', 'brigade#' . $bid, BRIG_ROLES[$role] . ': ' . $name);
        brig_mail($email, 'brig_team_invite', ['name' => $name, 'brigade' => $b['name'], 'role' => BRIG_ROLES[$role], 'link' => brig_link('brigada/')], (bool)$b['test']);
        linea_json(['ok' => true, 'message' => $name . ' получит письмо: вход в кабинет — кодом на эту почту']);
    }
    case 'team_update': {
        brig_need($b, 'team');
        $m = brig_one('SELECT * FROM br_members WHERE id = ? AND brigade_id = ? AND removed_at IS NULL', [(int)($in['id'] ?? 0), $bid]);
        if (!$m) { linea_fail('Нет такого человека в команде', 404); }
        $role = in_array($in['role'] ?? '', ['foreman', 'worker'], true) ? (string)$in['role'] : $m['role'];
        $objects = kb_objects(array_key_exists('objects', $in) ? $in['objects'] : ($m['objects'] !== null ? json_decode((string)$m['objects'], true) : null), $bid, $role);
        db_update('br_members', ['role' => $role, 'objects' => $objects !== null ? json_encode($objects) : null], 'id = ?', [(int)$m['id']]);
        brig_audit($WHO, 'team-update', 'brigade#' . $bid, $m['name'] . ': ' . BRIG_ROLES[$role] . ', объекты: ' . ($objects === null ? 'все' : implode(',', $objects)));
        linea_json(['ok' => true]);
    }
    case 'team_remove': {
        brig_need($b, 'team');
        $m = brig_one('SELECT * FROM br_members WHERE id = ? AND brigade_id = ? AND removed_at IS NULL', [(int)($in['id'] ?? 0), $bid]);
        if (!$m) { linea_fail('Нет такого человека в команде', 404); }
        // доступ теряется сразу: запись снята, аккаунт закрыт, устройства завершены; фото и сообщения остаются в сделках с подписью
        db_update('br_members', ['removed_at' => $now], 'id = ?', [(int)$m['id']]);
        db_update('accounts', ['status' => 'removed'], 'id = ?', [(int)$m['account_id']]);
        db_exec('UPDATE acc_devices SET ended_at = ? WHERE account_id = ? AND ended_at IS NULL', [$now, (int)$m['account_id']]);
        brig_audit($WHO, 'team-remove', 'brigade#' . $bid, (string)$m['name']);
        linea_json(['ok' => true]);
    }
    case 'worker_msg':
        brig_need($b, 'team');
        db_update('br_brigades', ['worker_msg' => !empty($in['on']) ? 1 : 0, 'updated_at' => $now], 'id = ?', [$bid]);
        brig_audit($WHO, 'team-worker-msg', 'brigade#' . $bid, !empty($in['on']) ? 'сотрудники пишут в ленту' : 'сотрудники только читают ленту');
        linea_json(['ok' => true]);
    case 'notices_read':
        if (!empty($in['all'])) { db_exec('UPDATE notices SET read_at = ? WHERE account_id = ? AND read_at IS NULL', [$now, (int)$b['_acc']]); }
        else { db_exec('UPDATE notices SET read_at = ? WHERE id = ? AND account_id = ?', [$now, (int)($in['id'] ?? 0), (int)$b['_acc']]); }
        linea_json(['ok' => true]);
    case 'prefs': {
        $acc = (int)$b['_acc'];
        $p = json_decode((string)db_val('SELECT prefs FROM accounts WHERE id = ?', [$acc]), true) ?: [];
        $g = [];
        foreach (['zakazy', 'obekty', 'dengi', 'listy'] as $k) { $g[$k] = !isset($in['groups'][$k]) || (bool)$in['groups'][$k]; }
        $p['groups'] = $g;
        db_update('accounts', ['prefs' => json_encode($p)], 'id = ?', [$acc]);
        linea_json(['ok' => true]);
    }
    case 'review_reply': {   // ответ на отзыв — один раз, публично (4.9); фильтр контактов
        brig_need($b, 'profile');
        $r = brig_one('SELECT * FROM br_reviews WHERE id = ? AND brigade_id = ?', [(int)($in['id'] ?? 0), $bid]);
        if (!$r) { linea_fail('Нет такого отзыва', 404); }
        if ($r['reply']) { linea_fail('Ответ на отзыв уже дан — ответить можно один раз'); }
        $t = brig_guard(linea_str($in['text'] ?? '', 1500), false, ['who' => $WHO, 'field' => 'ответ на отзыв', 'brigade_id' => $bid, 'job_id' => (int)$r['job_id']]);
        if ($t === '') { linea_fail('Пустой ответ'); }
        db_update('br_reviews', ['reply' => $t, 'reply_at' => $now], 'id = ? AND reply IS NULL', [(int)$r['id']]);
        brig_audit($WHO, 'review-reply', 'review#' . $r['id']);
        linea_json(['ok' => true]);
    }
    case 'card_consent': {   // согласие на распространение (публичная карточка): отзыв снимает карточку из каталога
        brig_need($b, 'profile');
        $give = !empty($in['give']);
        db_update('br_brigades', $give ? ['card_consent_at' => $now, 'card_consent_ed' => BRIG_CARD_ED, 'updated_at' => $now] : ['card_consent_at' => $now, 'card_consent_ed' => 'revoked', 'updated_at' => $now], 'id = ?', [$bid]);
        brig_audit($WHO, 'card-consent', 'brigade#' . $bid, $give ? 'дано, ред. ' . BRIG_CARD_ED : 'отозвано — карточка снята из каталога');
        linea_json(['ok' => true, 'message' => $give ? 'Карточка снова видна в каталоге (если анкета допущена)' : 'Карточка снята из каталога. Начатые объекты ведите как обычно; новые заказы из каталога не придут']);
    }
    case 'signer': {   // подписант ООО (не владелец аккаунта): ФИО, должность, основание
        brig_need($b, 'profile');
        $sg = ['name' => linea_str($in['name'] ?? '', 120), 'position' => linea_str($in['position'] ?? '', 120), 'basis' => linea_str($in['basis'] ?? '', 200)];
        db_update('br_brigades', ['signer' => $sg['name'] !== '' ? json_encode($sg, JSON_UNESCAPED_UNICODE) : null, 'updated_at' => $now], 'id = ?', [$bid]);
        brig_audit($WHO, 'signer', 'brigade#' . $bid, $sg['name'] . ', ' . $sg['position']);
        linea_json(['ok' => true]);
    }
}
linea_fail('Неизвестное действие', 404);
