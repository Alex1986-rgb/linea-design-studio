<?php
/**
 * api/brigade/auth.php — аккаунт бригады (общий модуль accounts, роль brigade).
 *   GET  ?a=me                     — кто вошёл, статус, CSRF-токен, справочники
 *   POST ?a=register  (JSON)       — анкета + пароль + согласия (ПДн, правила, агентский договор — с редакциями)
 *   POST ?a=login     (JSON)       — вход {email, password}
 *   POST ?a=logout                 — выход (CSRF)
 *   POST ?a=forgot    (JSON)       — письмо со ссылкой {email}; ответ одинаковый, есть такой адрес или нет
 *   POST ?a=reset     (JSON)       — новый пароль {token, password}
 * Регистрация, вход и восстановление — без сессии (CSRF не нужен: нет куки, которую можно подставить), но с лимитами частоты.
 */
declare(strict_types=1);
require __DIR__ . '/../lib/boot.php';
require __DIR__ . '/../lib/brig.php';

brig_https();
brig_session();
$a = (string)($_GET['a'] ?? 'me');
$in = brig_input();

if ($a === 'me') {
    $b = brig_me(false);
    linea_json(['ok' => true, 'brigade' => $b ? brig_public_self($b) : null, 'csrf' => acc_csrf_token(),
        'specs' => BRIG_SPECS, 'districts' => BRIG_DISTRICTS, 'legal' => BRIG_LEGAL, 'docs' => BRIG_DOCS]);
}
brig_method('POST');

switch ($a) {
    case 'register':
        if (trim((string)($in['website'] ?? '')) !== '') { linea_json(['ok' => true]); }        // ловушка для ботов
        if (!linea_rate('brg-reg', (int)brig_cfg('brig_reg_per_hour', 5), false)) { linea_fail('С этого адреса уже было несколько регистраций за час — попробуйте позже', 429); }
        $test = (string)($_GET['test'] ?? '') === '1' || !empty($in['test']);
        $email = mb_strtolower(linea_str($in['email'] ?? '', 120));
        $phone = linea_str($in['phone'] ?? '', 40);
        $name = linea_str($in['name'] ?? '', 80);
        $contact = linea_str($in['contactName'] ?? '', 80);
        $legal = (string)($in['legal'] ?? '');
        $inn = preg_replace('/\D/', '', (string)($in['inn'] ?? '')) ?? '';
        $specs = brig_json_list($in['specs'] ?? [], BRIG_SPECS);
        $dist = brig_json_list($in['districts'] ?? [], BRIG_DISTRICTS);
        $err = [];
        if ($name === '') { $err[] = 'название бригады'; }
        if ($contact === '') { $err[] = 'имя бригадира'; }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { $err[] = 'e-mail'; }
        if (strlen(preg_replace('/\D/', '', $phone) ?? '') < 10) { $err[] = 'телефон (10+ цифр)'; }
        if (!isset(BRIG_LEGAL[$legal])) { $err[] = 'форма работы (самозанятый / ИП / ООО)'; }
        if (!brig_inn_ok($inn) || ($legal === 'ooo') !== (strlen($inn) === 10)) { $err[] = 'ИНН (у ООО — 10 цифр, у ИП и самозанятого — 12, с верной контрольной суммой)'; }
        if (!$specs) { $err[] = 'специализации'; }
        if (!$dist) { $err[] = 'районы работы'; }
        if ($err) { linea_fail('Проверьте: ' . implode(', ', $err)); }
        if ($e = acc_password_ok((string)($in['password'] ?? ''))) { linea_fail($e); }
        $c = is_array($in['consents'] ?? null) ? $in['consents'] : [];
        foreach (BRIG_DOCS as $k => $d) {
            if (($c[$k] ?? null) !== $d['ed']) { linea_fail('Отметьте: ' . $d['title'] . ' (редакция от ' . $d['ed'] . ')'); }
        }
        if (acc_by_email('brigade', $email)) { linea_fail('Бригада с такой почтой уже зарегистрирована — войдите или восстановите пароль', 409); }
        // один ИНН — одна бригада (UNIQUE inn_key, миграция 2); заблокированная бригада заново не регистрируется ни по ИНН, ни по телефону
        $innKey = $inn . ($test ? ':test' : '');
        $same = brig_one('SELECT id, status FROM br_brigades WHERE inn_key = ?', [$innKey]);
        $phoneTail = substr(preg_replace('/\D/', '', $phone) ?? '', -10);
        $blockedPhone = false;
        foreach (brig_all("SELECT phone FROM br_brigades WHERE status = 'blocked'") as $x) { if (substr(preg_replace('/\D/', '', (string)$x['phone']) ?? '', -10) === $phoneTail) { $blockedPhone = true; break; } }
        if (($same && $same['status'] === 'blocked') || $blockedPhone) {
            brig_signal('reregister', 'anon', ['brigade_id' => $same ? (int)$same['id'] : null, 'field' => $same ? 'ИНН' : 'телефон'], 'Попытка повторной регистрации заблокированной бригады');
            linea_fail('Регистрация недоступна: бригада с этим ИНН или телефоном заблокирована по правилам площадки. Обжаловать — письмом в LINEA', 403);
        }
        if ($same) { linea_fail('Бригада с таким ИНН уже зарегистрирована — войдите в её кабинет или восстановите пароль', 409); }
        $gctx = ['who' => 'register', 'field' => 'анкета'];
        $name = brig_guard($name, false, $gctx);
        $contact = brig_guard($contact, false, $gctx);
        $now = linea_now();
        $about = brig_guard(linea_str($in['about'] ?? '', 2000), false, $gctx);
        $id = db_tx(function () use ($email, $in, $test, $name, $contact, $phone, $legal, $inn, $innKey, $about, $specs, $dist, $now) {
            $acc = acc_create('brigade', $email, (string)$in['password'], $test);
            $id = db_insert('br_brigades', [
                'account_id' => $acc, 'status' => 'draft', 'created_at' => $now, 'updated_at' => $now,
                'name' => $name, 'contact_name' => $contact, 'phone' => $phone, 'email' => $email, 'legal' => $legal, 'inn' => $inn, 'inn_key' => $innKey,
                'company' => linea_str($in['company'] ?? '', 120), 'specs' => json_encode($specs), 'districts' => json_encode($dist),
                'team_size' => max(1, min(200, (int)($in['teamSize'] ?? 1))), 'experience' => max(0, min(60, (int)($in['experience'] ?? 0))),
                'referees' => linea_str($in['referees'] ?? '', 1000), 'about' => $about,
                'warranty_months' => max(0, min(120, (int)($in['warrantyMonths'] ?? 12))), 'price_from' => ($pf = (int)($in['priceFrom'] ?? 0)) > 0 ? $pf : null,
                'public_name' => !empty($in['publicName']) ? 1 : 0,
                'consent_pd_ed' => BRIG_DOCS['pd']['ed'], 'rules_ed' => BRIG_DOCS['rules']['ed'], 'agency_ed' => BRIG_DOCS['agency']['ed'],
                'accepted_at' => $now, 'ip_reg' => linea_ip(), 'test' => $test ? 1 : 0,
            ]);
            db_update('br_brigades', ['slug' => brig_slugify($name, $id)], 'id = ?', [$id]);
            return $id;
        });
        linea_rate_add('brg-reg');
        acc_start((int)db_val('SELECT account_id FROM br_brigades WHERE id = ?', [$id]), 'brigade');
        brig_audit('brigade#' . $id, 'register', 'brigade#' . $id, 'Регистрация' . ($test ? ' (тест)' : '') . '; согласия: ПДн, правила, агентский договор — ред. ' . BRIG_DOCS['agency']['ed']);
        brig_mail($email, 'brig_registered', ['name' => $contact, 'link' => brig_link('brigada/')], $test);
        $b = brig_me();
        linea_json(['ok' => true, 'brigade' => brig_public_self($b), 'csrf' => acc_csrf_token()]);

    case 'login':
        if (!linea_rate('brg-login', (int)brig_cfg('brig_login_per_hour', 20))) { linea_fail('Слишком много попыток входа с этого адреса — подождите час', 429); }
        $r = acc_login('brigade', (string)($in['email'] ?? ''), (string)($in['password'] ?? ''));
        if (is_string($r)) { linea_fail($r, 401); }
        $b = brig_me();
        brig_audit('brigade#' . $b['id'], 'login', 'brigade#' . $b['id']);
        linea_json(['ok' => true, 'brigade' => brig_public_self($b), 'csrf' => acc_csrf_token()]);

    case 'logout':
        brig_csrf();
        acc_logout();
        linea_json(['ok' => true]);

    case 'forgot':
        if (!linea_rate('brg-forgot', (int)brig_cfg('brig_forgot_per_hour', 5))) { linea_fail('Слишком много запросов — подождите час', 429); }
        $acc = acc_by_email('brigade', (string)($in['email'] ?? ''));
        $out = ['ok' => true, 'message' => 'Если такая почта зарегистрирована, ссылка для нового пароля уже в пути. Ссылка действует 1 час.'];
        if ($acc) {
            $t = acc_reset_token((int)$acc['id']);
            $link = brig_link('brigada/#reset=' . $t);          // токен — во фрагменте: не уходит на сервер в Referer и в журналы
            brig_mail((string)$acc['email'], 'brig_reset', ['link' => $link], (bool)$acc['test']);
            // проверки на маке: ссылка возвращается в ответе только тестовому аккаунту и только на php -S 127.0.0.1
            if ($acc['test'] && linea_local()) { $out['devLink'] = $link; }
            brig_audit('account#' . $acc['id'], 'reset-request', 'account#' . $acc['id']);
        }
        linea_json($out);

    case 'reset':
        if (!linea_rate('brg-reset', 10)) { linea_fail('Слишком много попыток — подождите час', 429); }
        $r = acc_reset_apply((string)($in['token'] ?? ''), (string)($in['password'] ?? ''));
        if (is_string($r)) { linea_fail($r); }
        brig_audit('account#' . $r, 'reset-done', 'account#' . $r);
        linea_json(['ok' => true, 'message' => 'Пароль изменён — войдите с новым паролем']);
}
linea_fail('Неизвестное действие', 404);
