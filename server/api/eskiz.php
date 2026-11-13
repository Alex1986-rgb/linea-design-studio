<?php
/**
 * Закрытая страница «Эскиз по плану» (api/eskiz.php): тот же вход, что admin.php (сессия linea_adm, только https, CSRF).
 * Новый эскиз: план (картинка), бриф словами, референсы (до 5; нет — образ стиля сгенерируется), ответ «перепланировка».
 * Порядок: черновик описания комнат (модель) → дизайнер проверяет и правит → генерация (вид сверху ×3, сверка с планом, 5 интерьеров)
 * → правки заказчика словами → согласование (имя, дата). Логика и промпты — lib/eskiz.php, фон — eskiz-worker.php.
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/eskiz.php';

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
session_set_cookie_params(['lifetime' => 0, 'path' => dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/api/eskiz.php')) . '/', 'httponly' => true, 'samesite' => 'Strict', 'secure' => $https]);
session_start();
if (empty($_SESSION['adm'])) { header('Location: admin.php'); exit; }
$csrf = (string)$_SESSION['csrf'];
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
$self = basename(__FILE__);

// ── картинка эскиза (только из папки эскиза, только картинки)
if (isset($_GET['img'], $_GET['id'])) {
    $f = basename((string)$_GET['img']); $p = eskiz_dir((string)$_GET['id']) . '/' . $f;
    if (!preg_match('/^[a-z0-9.-]+\.(png|jpg)$/', $f) || !is_file($p)) { http_response_code(404); exit; }
    header('Content-Type: ' . (str_ends_with($f, '.png') ? 'image/png' : 'image/jpeg'));
    if (!empty($_GET['dl'])) { header('Content-Disposition: attachment; filename="' . $f . '"'); }
    header('Content-Length: ' . filesize($p)); readfile($p); exit;
}

$err = ''; $id = preg_replace('/[^a-z0-9-]/', '', (string)($_GET['id'] ?? $_POST['id'] ?? ''));
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($csrf, (string)($_POST['csrf'] ?? ''))) { http_response_code(400); exit('Сессия устарела — обновите страницу.'); }
    $act = (string)($_POST['act'] ?? '');
    try {
        if ($act === 'create') {
            if (empty($_FILES['plan']['tmp_name']) || !is_uploaded_file($_FILES['plan']['tmp_name'])) { throw new RuntimeException('Загрузите план картинкой (JPG, PNG, WebP).'); }
            $id = date('ymd-His') . '-' . substr(bin2hex(random_bytes(3)), 0, 4);
            $d = eskiz_dir($id); linea_mkdir($d);
            eskiz_png($_FILES['plan']['tmp_name'], $d . '/plan.png', 2400);
            $n = 0;
            foreach ((array)($_FILES['refs']['tmp_name'] ?? []) as $k => $tmp) { if ($tmp && is_uploaded_file($tmp) && $n < 5) { eskiz_png($tmp, $d . '/ref-' . (++$n) . '.png', 1600); eskiz_preview($d . "/ref-$n.png"); } }
            $b = []; foreach (['household', 'story', 'style', 'colors', 'avoid', 'rooms'] as $k) { $b[$k] = mb_substr(trim((string)($_POST[$k] ?? '')), 0, 2000); }
            $b['replan'] = in_array($_POST['replan'] ?? '', ['keep', 'replan'], true) ? $_POST['replan'] : '';
            $m = ['id' => $id, 'title' => mb_substr(trim((string)($_POST['title'] ?? '')) ?: 'Эскиз ' . date('d.m H:i'), 0, 120), 'created' => linea_now(),
                'by' => 'admin', 'test' => !empty($_POST['test']), 'brief' => $b, 'status' => 'new', 'log' => [], 'fixes' => [], 'rooms' => [], 'tops' => []];
            eskiz_log($m, 'создан: план' . ($n ? ", референсов $n" : ', без референсов'));
            eskiz_save($m); eskiz_spawn($id, 'scene');
            header("Location: $self?id=$id"); exit;
        }
        $m = eskiz_load($id); if (!$m) { throw new RuntimeException('Эскиз не найден.'); }
        if ($act === 'scene') {
            $rooms = [];
            foreach ((array)($_POST['r'] ?? []) as $r) {
                if (!empty($r['del']) || trim((string)($r['type'] ?? '')) === '') { continue; }
                $rooms[] = ['type' => (string)$r['type'], 'name' => mb_substr((string)($r['name'] ?? ''), 0, 60), 'place' => mb_substr((string)($r['place'] ?? ''), 0, 30),
                    'typeFrom' => 'designer', 'scene' => mb_substr((string)($r['scene'] ?? ''), 0, 600), 'note' => mb_substr((string)($r['note'] ?? ''), 0, 900)];
            }
            if (!$rooms) { throw new RuntimeException('Нет ни одной комнаты.'); }
            $m['scene']['rooms'] = $rooms; $m['scene']['extWall'] = (float)($_POST['extWall'] ?? 0.5); $m['scene']['intWall'] = (float)($_POST['intWall'] ?? 0.1);
            $m['scene']['diagonal'] = !empty($_POST['diagonal']); $m['scene']['confirmed'] = linea_now();
            $m['status'] = 'rendering'; eskiz_log($m, 'описание подтверждено дизайнером — генерация'); eskiz_save($m); eskiz_spawn($id, 'render');
        } elseif ($act === 'fix') {
            $t = trim((string)($_POST['text'] ?? '')); if ($t === '') { throw new RuntimeException('Пустая правка.'); }
            $rounds = (int)(linea_cfg()['rounds'] ?? 3);
            if (count($m['fixes']) >= $rounds && empty($_POST['over'])) { throw new RuntimeException("Кругов правок в цене — $rounds; отметьте «сверх», чтобы продолжить."); }
            $m['fixes'][] = ['text' => mb_substr($t, 0, 2000), 'date' => linea_now()]; $m['status'] = 'rendering';
            eskiz_log($m, 'правка заказчика №' . count($m['fixes'])); eskiz_save($m); eskiz_spawn($id, 'fix');
        } elseif ($act === 'approve') {
            $by = trim((string)($_POST['by'] ?? '')); if ($by === '') { throw new RuntimeException('Кто согласовал — имя заказчика.'); }
            if (($m['brief']['replan'] ?? '') === '') { throw new RuntimeException('Заказчик не ответил, менять ли планировку, — эскиз держится до ответа (решение 12.11.2026).'); }
            if (($m['tops'][0]['score'] ?? 0) < 70 && empty($_POST['force'])) { throw new RuntimeException('Лучший вид сверху ниже порога сверки 70 — перегенерировать или отметить «согласовать всё равно».'); }
            $m['approved'] = ['by' => mb_substr($by, 0, 100), 'date' => linea_now(), 'version' => $m['scene']['version'] ?? 1, 'top' => $m['best'] ?? null, 'rooms' => $m['rooms']];
            eskiz_log($m, 'согласовано: ' . $by); eskiz_save($m);
        } elseif ($act === 'replan') {
            $m['brief']['replan'] = in_array($_POST['replan'] ?? '', ['keep', 'replan'], true) ? $_POST['replan'] : '';
            eskiz_log($m, 'перепланировка: ' . ($m['brief']['replan'] ?: 'нет ответа')); eskiz_save($m);
        } elseif ($act === 'rescene') {
            $m['status'] = 'new'; eskiz_log($m, 'описание комнат — заново'); eskiz_save($m); eskiz_spawn($id, 'scene');
        }
        header("Location: $self?id=$id"); exit;
    } catch (Throwable $e) { $err = $e->getMessage(); }
}

// ── вывод
$busy = false; $body = '';
$img = fn($id, $f, $cls = '') => '<a href="' . $self . '?id=' . $id . '&img=' . $h($f) . '" target="_blank"><img class="' . $cls . '" src="' . $self . '?id=' . $id . '&img=' . $h(preg_replace('/\.png$/', '.jpg', $f)) . '" alt=""></a>';
if ($id !== '' && ($m = eskiz_load($id))) {
    $busy = in_array($m['status'], ['new', 'scene-run', 'rendering', 'render'], true);
    $ST = ['new' => 'описание комнат…', 'scene-run' => 'описание комнат…', 'scene-check' => 'проверьте описание комнат', 'rendering' => 'генерация…', 'render' => 'генерация…', 'ready' => 'готово', 'error' => 'ошибка'];
    $body .= '<p><a href="' . $self . '">← все эскизы</a></p><h1>' . $h($m['title']) . '</h1><p class="st">Статус: <b>' . $h($ST[$m['status']] ?? $m['status']) . '</b>'
        . ($busy ? ' · страница обновится сама' : '') . (!empty($m['approved']) ? ' · <span class="ok">согласовано: ' . $h($m['approved']['by']) . ', ' . $h($m['approved']['date']) . '</span>' : '') . '</p>';
    $body .= '<div class="row"><div><h3>План заказчика</h3>' . $img($id, 'plan.png') . '</div>';
    foreach (glob(eskiz_dir($id) . '/ref-*.jpg') ?: [] as $r) { if (!str_ends_with($r, '.v.jpg')) { $body .= '<div><h3>Референс</h3>' . $img($id, basename($r, '.jpg') . '.png') . '</div>'; } }
    $body .= '</div>';
    $rp = $m['brief']['replan'] ?? '';
    $body .= '<form method="post" class="inl"><input type="hidden" name="csrf" value="' . $h($csrf) . '"><input type="hidden" name="id" value="' . $h($id) . '"><input type="hidden" name="act" value="replan">'
        . 'Перепланировка: <select name="replan"><option value="">нет ответа (эскиз держится)</option><option value="keep"' . ($rp === 'keep' ? ' selected' : '') . '>планировку оставляем</option>'
        . '<option value="replan"' . ($rp === 'replan' ? ' selected' : '') . '>можно менять</option></select> <button>Сохранить</button></form>';
    if (!empty($m['scene']['rooms'])) {
        $sc = $m['scene'];
        $body .= '<h2>Описание комнат' . (empty($sc['confirmed']) ? ' — черновик модели, проверьте по плану' : ' (версия ' . (int)($sc['version'] ?? 1) . ')') . '</h2>';
        if (!empty($m['questions'])) { $body .= '<p class="q">Вопросы заказчику: ' . $h(implode(' · ', $m['questions'])) . '</p>'; }
        $body .= '<form method="post"><input type="hidden" name="csrf" value="' . $h($csrf) . '"><input type="hidden" name="id" value="' . $h($id) . '"><input type="hidden" name="act" value="scene">'
            . '<p>Стены: наружные <input name="extWall" size="4" value="' . $h($sc['extWall']) . '"> м, перегородки <input name="intWall" size="4" value="' . $h($sc['intWall']) . '"> м · '
            . '<label><input type="checkbox" name="diagonal" value="1"' . (!empty($sc['diagonal']) ? ' checked' : '') . '> есть косые стены</label></p><table><tr><th>Комната</th><th>Где на плане</th><th>Что в ней (для вида сверху, англ.)</th><th>Кадр интерьера (англ.)</th><th></th></tr>';
        $rows = $sc['rooms']; $rows[] = ['type' => '', 'name' => '', 'place' => '', 'scene' => '', 'note' => ''];
        foreach ($rows as $i => $r) {
            $sel = '<select name="r[' . $i . '][type]"><option value="">—</option>'; foreach (ESKIZ_ROOM_RU as $k => $t) { $sel .= '<option value="' . $k . '"' . (($r['type'] ?? '') === $k ? ' selected' : '') . '>' . $h($t) . '</option>'; } $sel .= '</select>';
            $guess = ($r['typeFrom'] ?? '') === 'guess' ? '<br><small class="q">догадка — спросить</small>' : '';
            $body .= '<tr><td>' . $sel . '<br><input name="r[' . $i . '][name]" value="' . $h($r['name'] ?? '') . '" placeholder="название">' . $guess . '</td><td><input name="r[' . $i . '][place]" size="11" value="' . $h($r['place'] ?? '') . '"></td>'
                . '<td><textarea name="r[' . $i . '][scene]" rows="3">' . $h($r['scene'] ?? '') . '</textarea></td><td><textarea name="r[' . $i . '][note]" rows="3">' . $h($r['note'] ?? '') . '</textarea></td>'
                . '<td>' . (($r['type'] ?? '') !== '' ? '<label><input type="checkbox" name="r[' . $i . '][del]" value="1"> убрать</label>' : 'новая') . '</td></tr>';
        }
        $body .= '</table><p><button' . ($busy ? ' disabled' : '') . '>Подтвердить описание и сгенерировать</button></p></form>'
            . '<form method="post" class="inl"><input type="hidden" name="csrf" value="' . $h($csrf) . '"><input type="hidden" name="id" value="' . $h($id) . '"><input type="hidden" name="act" value="rescene"><button class="sec"' . ($busy ? ' disabled' : '') . '>Описание заново моделью</button></form>';
    }
    if (!empty($m['tops'])) {
        $body .= '<h2>Вид сверху</h2><div class="row">';
        foreach ($m['tops'] as $t) { $body .= '<div class="' . ($t['file'] === ($m['best'] ?? '') ? 'best' : '') . '">' . $img($id, $t['file']) . '<p><b>' . (int)$t['score'] . '/100</b>' . ($t['file'] === ($m['best'] ?? '') ? ' · лучший' : '') . ' · <a href="' . $self . '?id=' . $id . '&img=' . $h($t['file']) . '&dl=1">4K</a></p>' . ($t['issues'] ? '<ul><li>' . implode('</li><li>', array_map($h, array_slice($t['issues'], 0, 4))) . '</li></ul>' : '') . '</div>'; }
        $body .= '</div>';
    }
    if (!empty($m['rooms'])) {
        $body .= '<h2>Интерьеры</h2><div class="row">';
        foreach ($m['rooms'] as $t => $f) { $body .= '<div>' . $img($id, $f) . '<p>' . $h(ESKIZ_ROOM_RU[$t] ?? $t) . ' · <a href="' . $self . '?id=' . $id . '&img=' . $h($f) . '&dl=1">4K</a></p></div>'; }
        $body .= '</div>';
    }
    if (in_array($m['status'], ['ready', 'error'], true) && !empty($m['tops'])) {
        $body .= '<h2>Правка заказчика словами</h2><p>Кругов правок в цене: ' . (int)(linea_cfg()['rounds'] ?? 3) . ', использовано: ' . count($m['fixes']) . '. Перерисовываются только задетые кадры; стены при «оставляем» не двигаются — уходят вопросом.</p>'
            . '<form method="post"><input type="hidden" name="csrf" value="' . $h($csrf) . '"><input type="hidden" name="id" value="' . $h($id) . '"><input type="hidden" name="act" value="fix">'
            . '<textarea name="text" rows="3" placeholder="например: в гостиной диван зелёный бархат, кухню светлее, в детской кровать-домик"></textarea><label><input type="checkbox" name="over" value="1"> сверх кругов</label> <button>Применить правку</button></form>';
        foreach (array_reverse($m['fixes']) as $i => $fx) { $body .= '<p class="fx">№' . (count($m['fixes']) - $i) . ' ' . $h($fx['date']) . ': «' . $h($fx['text']) . '»' . (!empty($fx['summary']) ? ' → ' . $h($fx['summary']) : '') . (!empty($fx['geometry']) ? ' <span class="q">планировка: ' . $h(implode('; ', $fx['geometry'])) . '</span>' : '') . '</p>'; }
        if (empty($m['approved'])) {
            $body .= '<h2>Согласование</h2><form method="post" class="inl"><input type="hidden" name="csrf" value="' . $h($csrf) . '"><input type="hidden" name="id" value="' . $h($id) . '"><input type="hidden" name="act" value="approve">'
                . '<input name="by" placeholder="кто согласовал (имя заказчика)"> <label><input type="checkbox" name="force" value="1"> согласовать всё равно (ниже порога сверки)</label> <button>Эскиз согласован</button></form>';
        }
    }
    $body .= '<details><summary>Журнал</summary><pre>' . $h(implode("\n", $m['log'] ?? [])) . '</pre></details>';
} else {
    $body .= '<h1>Эскиз по плану</h1><p>План заказчика + бриф + референсы → 3D-вид сверху (3 варианта, сверка с планом) и 5 интерьеров в 4K. Шлюз arionhub, ≈ $0,03 за эскиз.</p>'
        . '<form method="post" enctype="multipart/form-data" class="new"><input type="hidden" name="csrf" value="' . $h($csrf) . '"><input type="hidden" name="act" value="create">'
        . '<label>Название<input name="title" placeholder="например: Иванова, 3-к на Ленинском"></label>'
        . '<label>План квартиры (картинка: JPG, PNG, WebP; PDF — сохранить страницу картинкой)<input type="file" name="plan" accept="image/*" required></label>'
        . '<label>Референсы, до 5 (необязательно; нет — образ стиля сгенерируется)<input type="file" name="refs[]" accept="image/*" multiple></label>'
        . '<label>Кто живёт<input name="household" placeholder="пара и сын 6 лет, муж работает из дома"></label>'
        . '<label>Рассказ заказчика<textarea name="story" rows="3"></textarea></label>'
        . '<label>Стиль<input name="style" placeholder="тёплая эклектика / современная классика / сканди…"></label>'
        . '<label>Цвета, которые любит<input name="colors" placeholder="бордо, шалфей, пыльный синий, латунь"></label>'
        . '<label>Чего избегать<input name="avoid" placeholder="холодный белый, глянец"></label>'
        . '<label>Комнаты (если известно, что где)<input name="rooms" placeholder="слева сверху спальня, справа кухня-гостиная…"></label>'
        . '<label>Перепланировка<select name="replan"><option value="">нет ответа (эскиз не согласовать до ответа)</option><option value="keep">планировку оставляем</option><option value="replan">можно менять</option></select></label>'
        . '<label class="cb"><input type="checkbox" name="test" value="1" checked> служебный (без заказа и оплаты)</label>'
        . '<button>Создать эскиз</button></form><h2>Эскизы</h2><table><tr><th>Дата</th><th>Название</th><th>Статус</th><th></th></tr>';
    foreach (eskiz_list() as $e) { $body .= '<tr><td>' . $h($e['created']) . '</td><td>' . $h($e['title']) . '</td><td>' . $h($e['status']) . (!empty($e['approved']) ? ' · согласован' : '') . '</td><td><a href="' . $self . '?id=' . $h($e['id']) . '">открыть</a></td></tr>'; }
    $body .= '</table>';
}

echo '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">'
    . ($busy ? '<meta http-equiv="refresh" content="15">' : '') . '<title>Эскиз по плану — LINEA</title><style>'
    . 'body{font:15px/1.5 -apple-system,Segoe UI,sans-serif;background:#f6f3ee;color:#1d1b18;margin:0}main{max-width:1280px;margin:0 auto;padding:16px}a{color:#7a3b2a}'
    . 'h1{font:600 26px Georgia,serif}h2{font:600 20px Georgia,serif;margin-top:28px}.top{background:#1d1b18;color:#e8dcc4;padding:10px 16px}.top a{color:#e8dcc4;margin-right:16px}'
    . '.row{display:flex;flex-wrap:wrap;gap:14px}.row>div{flex:1 1 300px;max-width:620px}.row img{width:100%;border-radius:6px;display:block}.best{outline:3px solid #2f7d4a;border-radius:8px}'
    . 'table{border-collapse:collapse;width:100%;background:#fff}th,td{border:1px solid #e3ddd2;padding:6px;vertical-align:top;text-align:left}textarea,input,select{font:inherit;padding:6px;border:1px solid #cfc8ba;border-radius:5px;box-sizing:border-box}'
    . 'td textarea{width:100%}form.new{display:grid;gap:10px;max-width:720px;background:#fff;padding:16px;border-radius:8px}form.new label{display:grid;gap:4px}form.new label.cb{display:block}'
    . 'button{background:#1d1b18;color:#fff;border:0;border-radius:6px;padding:9px 16px;font:inherit;cursor:pointer}button.sec{background:#8a8170}button[disabled]{opacity:.5}'
    . '.err{background:#fbe3dc;border:1px solid #b4462b;padding:10px;border-radius:6px}.q{color:#9a5a00}.ok{color:#2f7d4a}.st{font-size:16px}form.inl{margin:10px 0}.fx{margin:4px 0}pre{white-space:pre-wrap;background:#fff;padding:10px}'
    . 'main>form textarea{width:100%}@media(max-width:700px){table,thead,tbody,tr,td,th{display:block}}'
    . '</style></head><body><div class="top"><a href="panel.php">← админка</a><a href="' . $self . '">Эскиз по плану</a></div><main>'
    . ($err !== '' ? '<p class="err">' . $h($err) . '</p>' : '') . $body . '</main></body></html>';
