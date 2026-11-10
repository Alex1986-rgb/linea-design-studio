<?php
/**
 * LINEA · читаемый вид брифа: разделы основного брифа, «Жизнь в квартире» (life) и «Дом и ремонт» (home) человеческими словами.
 * Подписи вопросов и вариантов — lib/brief-dict.json (его генерирует tools/gen-brief-dict.js из site/js/brief-life.js, чтобы каталог
 * брифа и админка не расходились). Для кабинета клиента и вкладки «Бриф» в админке.
 *   brief_view(array $brief): ['sections' => [['id','title','rows' => [[подпись, значение], …], 'text' => '…'?], …], 'life' => ['answered'=>, 'skipped'=>], 'home' => […]]
 */
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

function brief_dict(): array
{
    static $d = null;
    if ($d === null) {
        $f = __DIR__ . '/brief-dict.json';
        $d = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
    }
    return $d;
}

/** Ответ на вопрос каталога → слова. */
function brief_answer_text(array $q, $v): string
{
    if ($v === null || $v === '' || $v === []) { return ''; }
    $o = $q['o'] ?? [];
    $one = function ($x) use ($o) {
        $x = (string)$x;
        if (isset($o[$x])) { return (string)$o[$x]; }
        return $x === 'unknown' ? 'не знаю — решит дизайнер' : ($x === 'none' ? 'нет' : $x);
    };
    if (is_array($v)) { return implode(', ', array_map($one, $v)); }
    if (($q['ask'] ?? '') === 'num' || ($q['ask'] ?? '') === 'text') { return $v === 'unknown' ? 'не знаю — решит дизайнер' : (string)$v; }
    return $one($v);
}

/** Раздел «Жизнь в квартире» / «Дом и ремонт»: строки по группам. */
function brief_set_view(string $key, $data): array
{
    $dict = brief_dict()[$key] ?? null;
    $info = ['answered' => 0, 'skipped' => false, 'total' => (int)($dict['total'] ?? 0)];
    $groups = [];
    if (!is_array($data)) { return ['info' => $info, 'groups' => $groups, 'present' => false]; }
    $info['answered'] = (int)($data['answered'] ?? 0);
    $info['skipped'] = !empty($data['skipped']);
    foreach ($dict['groups'] ?? [] as $g) {
        $gd = $data[$g['k']] ?? null;
        if (!is_array($gd)) { continue; }
        $rows = [];
        foreach ($g['q'] as $q) {
            if (!array_key_exists($q['k'], $gd)) { continue; }
            $t = brief_answer_text($q, $gd[$q['k']]);
            if ($t !== '') { $rows[] = [$q['l'], $t, ($gd[$q['k']] === 'unknown' || $gd[$q['k']] === ['unknown']) ? 'unknown' : '']; }
        }
        if (!empty($gd['note'])) { $rows[] = ['Свободная заметка', (string)$gd['note'], '']; }
        if ($rows) { $groups[] = ['title' => $g['t'], 'rows' => $rows]; }
    }
    // выжимка sum — запасной путь, если каталог ушёл вперёд словаря и вопрос не нашёлся
    if (!$groups && is_array($data['sum'] ?? null)) {
        foreach ($data['sum'] as $g) {
            $rows = [];
            foreach ((array)($g['a'] ?? []) as $a) { $rows[] = [(string)$a, '', '']; }
            if ($rows) { $groups[] = ['title' => (string)($g['t'] ?? ''), 'rows' => $rows]; }
        }
    }
    return ['info' => $info, 'groups' => $groups, 'present' => true];
}

const BRIEF_ANSWER_LABELS = ['household' => 'Кто живёт', 'pets' => 'Животные', 'wfh' => 'Работа из дома', 'storage' => 'Хранение', 'kitchen' => 'Кухня', 'sport' => 'Спорт и хобби',
    'dislikes' => 'Что не нравится', 'timeline' => 'Сроки', 'budget' => 'Бюджет', 'wishes' => 'Пожелания'];
/** Бриф сметы (meta.service = smeta, site/smeta/zakaz/): подписи значений опроса «что где». */
const BRIEF_SMETA_ROOMS = ['living' => 'Жилая комната / гостиная', 'bedroom' => 'Спальня', 'kids' => 'Детская', 'kitchen' => 'Кухня', 'bathroom' => 'Ванная / санузел', 'hall' => 'Прихожая / коридор', 'balcony' => 'Балкон / лоджия', 'storage' => 'Кладовая / гардеробная'];
const BRIEF_SMETA_WALLS = ['paint' => 'краска', 'wallpaper' => 'обои', 'tile-full' => 'плитка до потолка', 'tile-part' => 'плитка частично (фартук / до 1,5 м), остальное — краска', 'panels' => 'панели', 'unknown' => 'не знаю'];
const BRIEF_SMETA_FLOOR = ['laminate' => 'ламинат', 'parquet' => 'паркет / паркетная доска', 'tile' => 'плитка / керамогранит', 'vinyl' => 'кварцвинил', 'linoleum' => 'линолеум', 'unknown' => 'не знаю'];
const BRIEF_SMETA_CEIL = ['paint' => 'окраска', 'stretch' => 'натяжной', 'gkl' => 'гипсокартон', 'unknown' => 'не знаю'];
const BRIEF_SMETA_YN = ['yes' => 'да', 'no' => 'нет', 'unknown' => 'не знаю'];
const BRIEF_SMETA_STATE = ['new' => 'новостройка без отделки', 'old' => 'вторичка, отделку снимаем', 'part' => 'частичный ремонт', 'unknown' => 'не знаю'];
const BRIEF_BUDGET = ['econom' => 'эконом', 'business' => 'бизнес', 'premium' => 'премиум'];

function brief_view(array $b): array
{
    $s = [];
    $add = function (string $id, string $title, array $rows, string $text = '') use (&$s) {
        $rows = array_values(array_filter($rows, fn($r) => trim((string)$r[1]) !== ''));
        if ($rows || $text !== '') { $s[] = ['id' => $id, 'title' => $title, 'rows' => $rows, 'text' => $text]; }
    };
    $c = is_array($b['client'] ?? null) ? $b['client'] : [];
    $o = is_array($b['object'] ?? null) ? $b['object'] : [];
    $add('client', 'Контакты', [['Имя', (string)($c['name'] ?? '')], ['Телефон', (string)($c['phone'] ?? '')], ['Почта', (string)($c['email'] ?? '')], ['Как связаться', (string)($c['contact'] ?? '')],
        ['Показ в портфолио', !empty($c['consent']['portfolio']) ? 'да, без имени и адреса' : 'нет']]);
    $add('object', 'Объект', [['Вид', (string)($o['type'] ?? '')], ['Адрес', (string)($o['address'] ?? '')], ['Площадь', isset($o['area']) && $o['area'] !== '' ? str_replace('.', ',', (string)$o['area']) . ' м²' : ''],
        ['Высота потолков', isset($o['ceilingHeight']) && $o['ceilingHeight'] ? str_replace('.', ',', (string)$o['ceilingHeight']) . ' м' : ''], ['Состояние', (string)($o['state'] ?? '')],
        ['Нужен обмер', !empty($o['needSurvey']) ? 'да, плана с размерами нет' : '']]);
    // бриф сметы: режим, опрос «что где», допущения — вместо стиля, рассказа и шагов «жизнь / двери и свет / дом и ремонт»
    $sm = is_array($b['smeta'] ?? null) ? $b['smeta'] : null;
    if ((string)($b['meta']['service'] ?? '') === 'smeta' && $sm) {
        $s = array_values(array_filter($s, fn($x) => $x['id'] !== 'object'));
        $add('object', 'Квартира', [['Площадь', isset($o['area']) && $o['area'] !== '' ? str_replace('.', ',', (string)$o['area']) . ' м²' : ''], ['Высота потолков', !empty($sm['height']) ? str_replace('.', ',', (string)$sm['height']) . ' м' : ''],
            ['Состояние', BRIEF_SMETA_STATE[(string)($sm['state'] ?? '')] ?? (string)($sm['state'] ?? '')]]);
        $add('smeta-mode', 'Исходные данные для сметы', [['Что есть', ($sm['mode'] ?? '') === 'project' ? 'готовый проект — считаем по его листам' : 'проекта нет — считаем по плану и ответам «что где» (типовые решения, допущения помечаем)'],
            ['Электрика', BRIEF_SMETA_YN[(string)($sm['electric'] ?? '')] ?? ''], ['Сантехника', BRIEF_SMETA_YN[(string)($sm['plumbing'] ?? '')] ?? '']], trim((string)($sm['note'] ?? '')));
        $rr = [];
        foreach ((array)($sm['rooms'] ?? []) as $r) {
            if (!is_array($r)) { continue; }
            $rr[] = [(BRIEF_SMETA_ROOMS[(string)($r['type'] ?? '')] ?? (string)($r['type'] ?? 'Помещение')) . (!empty($r['count']) && (int)$r['count'] > 1 ? ' × ' . (int)$r['count'] : ''),
                'стены — ' . (BRIEF_SMETA_WALLS[(string)($r['walls'] ?? '')] ?? (string)($r['walls'] ?? '—')) . '; пол — ' . (BRIEF_SMETA_FLOOR[(string)($r['floor'] ?? '')] ?? (string)($r['floor'] ?? '—'))
                . '; потолок — ' . (BRIEF_SMETA_CEIL[(string)($r['ceiling'] ?? '')] ?? (string)($r['ceiling'] ?? '—'))];
        }
        $add('smeta-rooms', 'Что где отделано (' . count($rr) . ')', $rr);
        $f = is_array($b['files'] ?? null) ? $b['files'] : [];
        $add('files', 'Файлы по списку брифа', [['План', implode(', ', (array)($f['plans'] ?? []))], ['Проект клиента', implode(', ', (array)($f['project'] ?? []))]]);
        return ['sections' => $s, 'life' => ['present' => false], 'tech' => ['present' => false], 'home' => ['present' => false], 'kind' => 'smeta'];
    }
    $rooms = [];
    foreach ((array)($b['rooms'] ?? []) as $r) {
        if (!is_array($r)) { continue; }
        $dim = (isset($r['width'], $r['length']) && $r['width'] && $r['length']) ? str_replace('.', ',', (string)$r['width']) . ' × ' . str_replace('.', ',', (string)$r['length']) . ' м' : '';
        $rooms[] = [(string)($r['name'] ?? $r['title'] ?? 'Помещение'), $dim ?: 'размеры не указаны'];
    }
    $add('rooms', 'Помещения (' . count($rooms) . ')', $rooms);
    $st = is_array($b['style'] ?? null) ? $b['style'] : (isset($b['style']) ? ['title' => (string)$b['style']] : []);
    $add('style', 'Стиль и бюджет', [['Стиль', (string)($st['title'] ?? $st['name'] ?? '') . (!empty($st['byStudio']) ? ' (выбор за студией)' : '')], ['Цвета', is_array($st['colors'] ?? null) ? implode(', ', $st['colors']) : (string)($st['colors'] ?? '')],
        ['Цвета, которых не должно быть', (string)($st['avoidColors'] ?? '')], ['Нравится', is_array($st['liked'] ?? null) ? implode(', ', $st['liked']) : ''], ['Не нравится', is_array($st['disliked'] ?? null) ? implode(', ', $st['disliked']) : ''],
        ['Ссылки на примеры', is_array($st['links'] ?? null) ? implode(', ', $st['links']) : ''], ['Класс материалов', BRIEF_BUDGET[(string)($b['budget'] ?? '')] ?? (string)($b['budget'] ?? '')]]);
    $add('story', 'Рассказ словами', [], trim((string)($b['story'] ?? '')));
    $ans = [];
    foreach ((array)($b['answers'] ?? []) as $k => $v) { $ans[] = [BRIEF_ANSWER_LABELS[$k] ?? (string)$k, is_array($v) ? implode(', ', array_map('strval', $v)) : (string)$v]; }
    $add('answers', 'Короткие ответы', $ans);
    $f = is_array($b['files'] ?? null) ? $b['files'] : [];
    $add('files', 'Файлы по списку брифа', [['План', implode(', ', (array)($f['plans'] ?? []))], ['Фото квартиры', implode(', ', (array)($f['photos'] ?? []))], ['Фото «как сейчас» (шаг «Дом и ремонт»)', implode(', ', (array)($f['now'] ?? []))]]);
    $life = brief_set_view('life', $b['life'] ?? null);
    $tech = brief_set_view('tech', $b['tech'] ?? null);
    $home = brief_set_view('home', $b['home'] ?? null);
    return ['sections' => $s, 'life' => $life, 'tech' => $tech, 'home' => $home];
}

/** Плоский текст сводки (для письма студии и order-pull). */
function brief_view_text(array $v): string
{
    $out = [];
    foreach ($v['sections'] as $s) {
        $out[] = "== " . $s['title'];
        if ($s['text'] !== '') { $out[] = $s['text']; }
        foreach ($s['rows'] as $r) { $out[] = $r[0] . ': ' . $r[1]; }
    }
    foreach (['life' => 'Жизнь в квартире', 'tech' => 'Двери, свет и электрика', 'home' => 'Дом и ремонт'] as $k => $t) {
        if (empty($v[$k]['present'])) { continue; }
        $out[] = "== " . $t . ($v[$k]['info']['skipped'] ? ' (пропущен клиентом)' : ' — ответов: ' . $v[$k]['info']['answered']);
        foreach ($v[$k]['groups'] as $g) { $out[] = '-- ' . $g['title']; foreach ($g['rows'] as $r) { $out[] = $r[0] . ': ' . $r[1]; } }
    }
    return implode("\n", $out);
}

/** Прочитать brief.json заказа. */
function brief_load(array $o): array
{
    $f = kab_order_dir($o) . '/brief.json';
    return is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
}

/**
 * Файлы заказа: из архива брифа (brief.zip) и догруженные из кабинета (dopolnenie/). Имя файла — безопасное, путь наружу не отдаём.
 * @return list<array{src:string,name:string,size:int,at:string,img:bool}>
 */
function brief_files(array $o): array
{
    $out = [];
    $zf = kab_order_dir($o) . '/brief.zip';
    if (is_file($zf)) {
        $z = new ZipArchive();
        if ($z->open($zf, ZipArchive::RDONLY) === true) {
            for ($i = 0; $i < $z->numFiles; $i++) {
                $st = $z->statIndex($i);
                $n = (string)($st['name'] ?? '');
                if ($n === '' || str_ends_with($n, '/') || in_array($n, ['brief.json', 'brief.txt'], true)) { continue; }
                $out[] = ['src' => 'zip', 'name' => $n, 'size' => (int)($st['size'] ?? 0), 'at' => (string)$o['created_at'], 'img' => (bool)preg_match('/\.(jpe?g|png|webp|gif)$/i', $n)];
            }
            $z->close();
        }
    }
    $meta = [];
    foreach (brief_extra_index($o) as $r) { $meta[(string)($r['name'] ?? '')] = $r; }
    foreach (glob(kab_order_dir($o) . '/dopolnenie/*') ?: [] as $f) {
        if (!is_file($f) || str_ends_with($f, '.json')) { continue; }
        $n = basename($f);
        $out[] = ['src' => 'extra', 'name' => $n, 'orig' => (string)($meta[$n]['orig'] ?? $n), 'q' => $meta[$n]['q'] ?? null, 'size' => (int)filesize($f),
            'at' => (string)($meta[$n]['at'] ?? date('Y-m-d H:i:s', (int)filemtime($f))), 'img' => (bool)preg_match('/\.(jpe?g|png|webp|gif)$/i', $n)];
    }
    return $out;
}

/** Отдать файл заказа (из архива или догруженный) — клиенту и админу; расширение из белого списка, nosniff. */
function brief_file_send(array $o, string $src, string $name, bool $inline): never
{
    $ct = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif', 'pdf' => 'application/pdf'];
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $type = $ct[$ext] ?? 'application/octet-stream';
    $inline = $inline && isset($ct[$ext]);
    $safe = preg_replace('/[^A-Za-z0-9._-]+/', '_', basename($name)) ?: 'file';
    $data = null; $path = null;
    if ($src === 'zip') {
        $z = new ZipArchive();
        if ($z->open(kab_order_dir($o) . '/brief.zip', ZipArchive::RDONLY) === true) {
            $idx = $z->locateName($name);
            if ($idx !== false && !str_contains($name, '..')) { $data = $z->getFromIndex($idx); }
            $z->close();
        }
    } elseif ($src === 'extra') {
        $p = kab_order_dir($o) . '/dopolnenie/' . basename($name);
        if (is_file($p)) { $path = $p; }
    }
    if ($data === null && $path === null) { linea_fail('Файл не найден', 404); }
    header('Content-Type: ' . $type);
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $safe . '"');
    header('X-Content-Type-Options: nosniff'); header('Cache-Control: private, no-store');
    header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    if ($path !== null) { header('Content-Length: ' . filesize($path)); readfile($path); } else { header('Content-Length: ' . strlen((string)$data)); echo $data; }
    exit;
}

// ───────────────────────── догрузка файлов из кабинета (обмеры, фото, ответы на вопросы К-N)

const BRIEF_EXTRA_EXT = '/\.(jpe?g|png|webp|heic|heif|gif|pdf|dwg|dxf|tiff?|bmp)$/i';   // как в brief.php, без json/txt
const BRIEF_EXTRA_MAX_FILES = 10;      // за один раз
const BRIEF_EXTRA_MAX_TOTAL = 60;      // всего догруженных файлов на заказ

function brief_extra_dir(array $o): string { return kab_order_dir($o) . '/dopolnenie'; }

/** Журнал догрузок: [{name, orig, q, at, size}] — q — номер вопроса К-N, если файл прикреплён к ответу. */
function brief_extra_index(array $o): array
{
    $f = brief_extra_dir($o) . '/index.json';
    $j = is_file($f) ? json_decode((string)file_get_contents($f), true) : null;
    return is_array($j) ? $j : [];
}

/**
 * Принять файлы из $_FILES['files'] (multipart): тип по расширению и по началу файла (для фото и PDF), размер ≤ max_upload_mb на файл,
 * имя на диске — своё (время + случайность), путь наружу невозможен. Фото не перекодируются — это материалы заказа, а не публичная картинка.
 * @return array{saved:array,errors:array}
 */
function brief_extra_save(array $o, ?string $q = null): array
{
    $cfg = linea_cfg();
    $maxBytes = max(1, (int)$cfg['max_upload_mb']) * 1048576;
    $F = $_FILES['files'] ?? null;
    $list = [];
    if (is_array($F) && is_array($F['name'] ?? null)) { foreach ($F['name'] as $i => $n) { $list[] = ['name' => $n, 'tmp_name' => $F['tmp_name'][$i], 'error' => $F['error'][$i], 'size' => $F['size'][$i]]; } }
    elseif (is_array($F) && isset($F['name'])) { $list[] = $F; }
    $res = ['saved' => [], 'errors' => []];
    if (!$list) { $res['errors'][] = 'Файл не выбран'; return $res; }
    if (count($list) > BRIEF_EXTRA_MAX_FILES) { $res['errors'][] = 'За один раз — не больше ' . BRIEF_EXTRA_MAX_FILES . ' файлов'; return $res; }
    $idx = brief_extra_index($o);
    if (count($idx) + count($list) > BRIEF_EXTRA_MAX_TOTAL) { $res['errors'][] = 'Больше ' . BRIEF_EXTRA_MAX_TOTAL . ' догруженных файлов принять не можем — пришлите остальное архивом в WhatsApp'; return $res; }
    $dir = brief_extra_dir($o);
    linea_mkdir($dir);
    foreach ($list as $f) {
        $orig = mb_substr(basename((string)$f['name']), 0, 80);
        if (($f['error'] ?? 4) !== UPLOAD_ERR_OK || !is_uploaded_file_or_test((string)$f['tmp_name'])) { $res['errors'][] = $orig . ': файл не дошёл, загрузите ещё раз'; continue; }
        if (!preg_match(BRIEF_EXTRA_EXT, $orig)) { $res['errors'][] = $orig . ': такой тип не принимаем (можно фото, PDF, DWG/DXF)'; continue; }
        $size = (int)filesize((string)$f['tmp_name']);
        if ($size < 1) { $res['errors'][] = $orig . ': файл пустой'; continue; }
        if ($size > $maxBytes) { $res['errors'][] = $orig . ': больше ' . (int)$cfg['max_upload_mb'] . ' МБ'; continue; }
        $head = (string)file_get_contents((string)$f['tmp_name'], false, null, 0, 12);
        $ext = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
        $okHead = match (true) {
            in_array($ext, ['jpg', 'jpeg'], true) => str_starts_with($head, "\xFF\xD8\xFF"),
            $ext === 'png' => str_starts_with($head, "\x89PNG"),
            $ext === 'gif' => str_starts_with($head, 'GIF8'),
            $ext === 'pdf' => str_starts_with($head, '%PDF'),
            $ext === 'webp' => substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WEBP',
            default => true,
        };
        if (!$okHead) { $res['errors'][] = $orig . ': содержимое не похоже на ' . strtoupper($ext); continue; }
        $stored = ($q !== null && $q !== '' ? preg_replace('/[^A-Za-zА-Яа-я0-9-]/u', '', $q) . '_' : '') . date('Ymd-His') . '-' . bin2hex(random_bytes(3)) . '.' . $ext;
        if (!move_uploaded_file((string)$f['tmp_name'], $dir . '/' . $stored) && !@copy((string)$f['tmp_name'], $dir . '/' . $stored)) { $res['errors'][] = $orig . ': не сохранился'; continue; }
        @chmod($dir . '/' . $stored, 0600);
        $rec = ['name' => $stored, 'orig' => $orig, 'q' => $q ?: null, 'at' => linea_now(), 'size' => $size];
        $idx[] = $rec; $res['saved'][] = $rec;
    }
    if ($res['saved']) { file_put_contents($dir . '/index.json', json_encode($idx, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX); @chmod($dir . '/index.json', 0600); }
    return $res;
}
