<?php
/**
 * api/brigade/profile.php — анкета и портфолио бригады (только своя).
 *   GET                         — анкета, объекты портфолио с фото, чего не хватает для отправки на проверку
 *   POST ?a=save (JSON)         — правка анкеты (почта и ИНН — только через администратора: их сверяли при допуске)
 *   POST ?a=portfolio_add (JSON {title, district, area, year, works}) / ?a=portfolio_del (JSON {id})
 *   POST ?a=photo (multipart: portfolio, kind=before|after, file) / ?a=photo_del (JSON {id}) / ?a=logo (multipart: file)
 *   POST ?a=submit              — отправить на проверку (нужно 3+ объекта, у каждого фото «до» и «после»)
 * Все POST — с CSRF (заголовок X-CSRF или поле csrf).
 */
declare(strict_types=1);
require __DIR__ . '/../lib/boot.php';
require __DIR__ . '/../lib/brig.php';

brig_https();
$b = brig_me();
$bid = (int)$b['id'];

function prof_state(array $b): array
{
    $port = [];
    foreach (brig_all('SELECT * FROM br_portfolio WHERE brigade_id = ? ORDER BY id', [(int)$b['id']]) as $p) {
        $files = brig_all("SELECT id, kind FROM br_files WHERE owner_kind = 'portfolio' AND owner_id = ? AND brigade_id = ? ORDER BY id", [(int)$p['id'], (int)$b['id']]);
        $port[] = ['id' => (int)$p['id'], 'title' => $p['title'], 'district' => (string)$p['district'], 'area' => $p['area'] !== null ? (float)$p['area'] : null,
            'year' => $p['year'] !== null ? (int)$p['year'] : null, 'works' => (string)$p['works'],
            'photos' => array_map(fn($f) => ['id' => (int)$f['id'], 'kind' => $f['kind']], $files)];
    }
    $full = array_filter($port, fn($p) => in_array('before', array_column($p['photos'], 'kind'), true) && in_array('after', array_column($p['photos'], 'kind'), true));
    $missing = [];
    if (count($full) < 3) { $missing[] = 'объекты с фото «до» и «после»: ' . count($full) . ' из 3'; }
    return ['brigade' => brig_public_self($b), 'portfolio' => $port, 'missing' => $missing, 'canSubmit' => !$missing && $b['status'] === 'draft'];
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') { linea_json(['ok' => true] + prof_state($b)); }
brig_method('POST');
brig_csrf();
$in = brig_input();
$a = (string)($_GET['a'] ?? '');
$now = linea_now();

switch ($a) {
    case 'save':
        $set = ['updated_at' => $now];
        foreach (['name' => 80, 'contactName' => 80, 'phone' => 40, 'company' => 120, 'referees' => 1000, 'about' => 2000] as $k => $max) {
            if (array_key_exists($k, $in)) { $set[$k === 'contactName' ? 'contact_name' : $k] = linea_str($in[$k], $max); }
        }
        if (isset($set['name']) && $set['name'] === '') { linea_fail('Название бригады не может быть пустым'); }
        if (isset($set['phone']) && strlen(preg_replace('/\D/', '', $set['phone']) ?? '') < 10) { linea_fail('Проверьте телефон'); }
        if (array_key_exists('specs', $in)) { $s = brig_json_list($in['specs'], BRIG_SPECS); if (!$s) { linea_fail('Выберите специализации'); } $set['specs'] = json_encode($s); }
        if (array_key_exists('districts', $in)) { $s = brig_json_list($in['districts'], BRIG_DISTRICTS); if (!$s) { linea_fail('Выберите районы'); } $set['districts'] = json_encode($s); }
        if (array_key_exists('teamSize', $in)) { $set['team_size'] = max(1, min(200, (int)$in['teamSize'])); }
        if (array_key_exists('experience', $in)) { $set['experience'] = max(0, min(60, (int)$in['experience'])); }
        if (array_key_exists('warrantyMonths', $in)) { $set['warranty_months'] = max(0, min(120, (int)$in['warrantyMonths'])); }
        if (array_key_exists('priceFrom', $in)) { $set['price_from'] = (int)$in['priceFrom'] > 0 ? (int)$in['priceFrom'] : null; }
        if (array_key_exists('publicName', $in)) { $set['public_name'] = $in['publicName'] ? 1 : 0; }
        db_update('br_brigades', $set, 'id = ?', [$bid]);
        brig_audit('brigade#' . $bid, 'profile-save', 'brigade#' . $bid, implode(',', array_keys($set)));
        break;
    case 'portfolio_add':
        if ((int)db_val('SELECT COUNT(*) FROM br_portfolio WHERE brigade_id = ?', [$bid]) >= 30) { linea_fail('Не больше 30 объектов в портфолио'); }
        $title = linea_str($in['title'] ?? '', 120);
        if ($title === '') { linea_fail('Назовите объект: например «Квартира 62 м², Хамовники»'); }
        db_insert('br_portfolio', ['brigade_id' => $bid, 'title' => $title, 'district' => isset(BRIG_DISTRICTS[$in['district'] ?? '']) ? $in['district'] : null,
            'area' => is_numeric($in['area'] ?? null) ? round((float)$in['area'], 1) : null, 'year' => ($y = (int)($in['year'] ?? 0)) >= 1990 && $y <= (int)date('Y') ? $y : null,
            'works' => linea_str($in['works'] ?? '', 1500), 'created_at' => $now]);
        break;
    case 'portfolio_del':
        $p = brig_one('SELECT id FROM br_portfolio WHERE id = ? AND brigade_id = ?', [(int)($in['id'] ?? 0), $bid]);
        if (!$p) { linea_fail('Это не ваш объект', 403); }
        foreach (brig_all("SELECT stored FROM br_files WHERE owner_kind = 'portfolio' AND owner_id = ?", [(int)$p['id']]) as $f) { @unlink(brig_dir() . '/files/' . $f['stored']); }
        brig_exec("DELETE FROM br_files WHERE owner_kind = 'portfolio' AND owner_id = ?", [(int)$p['id']]);
        brig_exec('DELETE FROM br_portfolio WHERE id = ?', [(int)$p['id']]);
        break;
    case 'photo':
        if (!linea_rate('brg-upload', (int)brig_cfg('brig_uploads_per_hour', 120))) { linea_fail('Слишком много загрузок за час — подождите', 429); }
        $p = brig_one('SELECT id FROM br_portfolio WHERE id = ? AND brigade_id = ?', [(int)($_POST['portfolio'] ?? 0), $bid]);
        if (!$p) { linea_fail('Это не ваш объект', 403); }
        $kind = (string)($_POST['kind'] ?? '') === 'before' ? 'before' : 'after';
        if ((int)db_val("SELECT COUNT(*) FROM br_files WHERE owner_kind = 'portfolio' AND owner_id = ?", [(int)$p['id']]) >= 16) { linea_fail('Не больше 16 фото на объект'); }
        $id = brig_store_upload($_FILES['file'] ?? [], ['img'], ['brigade_id' => $bid, 'kind' => 'portfolio', 'id' => (int)$p['id'], 'sub' => $kind], 'brigade#' . $bid);
        linea_json(['ok' => true, 'file' => $id] + prof_state(brig_me()));
    case 'photo_del':
        $f = brig_one("SELECT * FROM br_files WHERE id = ? AND brigade_id = ? AND owner_kind IN ('portfolio','logo')", [(int)($in['id'] ?? 0), $bid]);
        if (!$f) { linea_fail('Это не ваше фото', 403); }
        @unlink(brig_dir() . '/files/' . $f['stored']);
        brig_exec('DELETE FROM br_files WHERE id = ?', [(int)$f['id']]);
        if ((int)$b['logo_file'] === (int)$f['id']) { db_update('br_brigades', ['logo_file' => null], 'id = ?', [$bid]); }
        break;
    case 'logo':
        if (!linea_rate('brg-upload', (int)brig_cfg('brig_uploads_per_hour', 120))) { linea_fail('Слишком много загрузок за час — подождите', 429); }
        $id = brig_store_upload($_FILES['file'] ?? [], ['img'], ['brigade_id' => $bid, 'kind' => 'logo', 'id' => $bid, 'sub' => 'logo'], 'brigade#' . $bid);
        db_update('br_brigades', ['logo_file' => $id, 'updated_at' => $now], 'id = ?', [$bid]);
        break;
    case 'submit':
        $st = prof_state($b);
        if ($b['status'] !== 'draft') { linea_fail('Анкета уже отправлена: ' . (BRIG_STATUS[$b['status']] ?? $b['status'])); }
        if ($st['missing']) { linea_fail('Чтобы отправить анкету, не хватает: ' . implode('; ', $st['missing'])); }
        db_update('br_brigades', ['status' => 'review', 'submitted_at' => $now, 'updated_at' => $now], 'id = ?', [$bid]);
        brig_audit('brigade#' . $bid, 'submit', 'brigade#' . $bid, 'Анкета отправлена на проверку');
        brig_admin_notify('бригада на проверке', 'Анкета «' . $b['name'] . '» ждёт проверки ИНН и видеозвонка', brig_link('api/admin-brigady.php?b=' . $bid), (bool)$b['test']);
        break;
    default:
        linea_fail('Неизвестное действие', 404);
}
linea_json(['ok' => true] + prof_state(brig_me()));
