<?php
/**
 * Эскиз для заказчика (12.11.2026): план + бриф + референсы → 3D-вид сверху (3 варианта, сверка с планом, лучший) → 5 интерьеров.
 * Рецепт — «21.09» движка GOST-DRAFT (tools/eskiz.mjs, tools/eskiz-ai.mjs; docs/plans/2026-11-12-eskiz-etap.md): основа — картинка
 * плана, без глины; промпт позитивный по комнатам; толщина стен как на чертеже; референс стиля второй картинкой; 4K.
 * Описание комнат пишет модель, но это ЧЕРНОВИК — дизайнер проверяет и правит его в админке до генерации (модель путает стороны плана).
 * Планировку эскиз не меняет: правка стен при «оставляем» не применяется, а уходит вопросом. Согласование — с именем и датой,
 * эскиз держится, пока заказчик не ответил, менять ли планировку (решение Александра 12.11.2026).
 * Шлюз arionhub: config.php → eskiz_key, eskiz_base (вне веб-корня). gpt-image-2 по подписке — $0,0025 за кадр.
 * Хранение: linea-private/eskiz/<id>/ (meta.json, plan.png, ref-*.png, top-*.png, room-*.png, превью *.jpg).
 */
declare(strict_types=1);

const ESKIZ_ROOMS = ['living-kitchen', 'living', 'kitchen', 'bedroom', 'kids', 'cabinet', 'bathroom', 'hall'];
const ESKIZ_ROOM_EN = ['living-kitchen' => 'open kitchen-living room', 'living' => 'living room', 'kitchen' => 'kitchen-dining room', 'bedroom' => 'bedroom',
    'kids' => "child's room", 'cabinet' => 'study', 'bathroom' => 'bathroom', 'wc' => 'WC', 'hall' => 'entrance hall', 'wardrobe' => 'walk-in wardrobe',
    'storage' => 'storage room', 'balcony' => 'balcony', 'loggia' => 'loggia'];
const ESKIZ_ROOM_RU = ['living-kitchen' => 'Кухня-гостиная', 'living' => 'Гостиная', 'kitchen' => 'Кухня', 'bedroom' => 'Спальня', 'kids' => 'Детская',
    'cabinet' => 'Кабинет', 'bathroom' => 'Ванная', 'wc' => 'Туалет', 'hall' => 'Прихожая / холл', 'wardrobe' => 'Гардеробная', 'storage' => 'Кладовая',
    'balcony' => 'Балкон', 'loggia' => 'Лоджия'];

function eskiz_root(): string { $d = linea_private() . '/eskiz'; linea_mkdir($d); return $d; }
function eskiz_dir(string $id): string
{
    if (!preg_match('/^[a-z0-9-]{6,40}$/', $id)) { throw new RuntimeException('неверный номер эскиза'); }
    return eskiz_root() . '/' . $id;
}
function eskiz_load(string $id): ?array { $f = eskiz_dir($id) . '/meta.json'; return is_file($f) ? json_decode((string)file_get_contents($f), true) : null; }
function eskiz_save(array $m): void
{
    $d = eskiz_dir($m['id']); linea_mkdir($d);
    $tmp = $d . '/meta.json.tmp'; file_put_contents($tmp, json_encode($m, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)); rename($tmp, $d . '/meta.json');
}
function eskiz_list(): array
{
    $out = [];
    foreach (glob(eskiz_root() . '/*/meta.json') ?: [] as $f) { $m = json_decode((string)file_get_contents($f), true); if ($m) { $out[] = $m; } }
    usort($out, fn($a, $b) => strcmp($b['created'] ?? '', $a['created'] ?? ''));
    return $out;
}
function eskiz_log(array &$m, string $line): void { $m['log'][] = date('H:i:s') . ' ' . $line; $m['log'] = array_slice($m['log'], -60); }

/** Картинка → PNG ≤ $max по длинной стороне (GD; EXIF и лишнее отбрасываются). */
function eskiz_png(string $src, string $dst, int $max = 2048): void
{
    $raw = (string)file_get_contents($src);
    $im = @imagecreatefromstring($raw);
    if (!$im) { throw new RuntimeException('картинка не читается (нужен JPG, PNG или WebP)'); }
    $w = imagesx($im); $h = imagesy($im); $k = min(1, $max / max($w, $h));
    if ($k < 1) { $n = imagecreatetruecolor((int)round($w * $k), (int)round($h * $k)); imagecopyresampled($n, $im, 0, 0, 0, 0, imagesx($n), imagesy($n), $w, $h); $im = $n; }
    imagepng($im, $dst, 6);
}
/** Превью JPG 1600 px — в браузер не тянуть PNG по 15 МБ. */
function eskiz_preview(string $png): string
{
    $jpg = preg_replace('/\.png$/', '.jpg', $png);
    $im = @imagecreatefrompng($png); if (!$im) { return ''; }
    $w = imagesx($im); $h = imagesy($im); $k = min(1, 1600 / max($w, $h));
    $n = imagecreatetruecolor((int)round($w * $k), (int)round($h * $k)); imagecopyresampled($n, $im, 0, 0, 0, 0, imagesx($n), imagesy($n), $w, $h);
    imagejpeg($n, $jpg, 86);
    return $jpg;
}

// ── шлюз ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function eskiz_gw(): array
{
    $c = linea_cfg(); $key = (string)($c['eskiz_key'] ?? ''); $base = rtrim((string)($c['eskiz_base'] ?? ''), '/');
    if ($key === '' || !str_starts_with($base, 'https://')) { throw new RuntimeException('шлюз картинок не настроен: eskiz_key / eskiz_base в linea-private/config.php'); }
    return [$key, $base];
}
/** Один запрос images/edits (картинки: основа, затем референсы) → curl-хэндл для curl_multi. */
function eskiz_edit_handle(array $images, string $prompt, string $size = '3840x2560')
{
    [$key, $base] = eskiz_gw();
    $f = ['model' => 'gpt-image-2', 'prompt' => $prompt, 'size' => $size, 'quality' => 'high', 'n' => '1'];
    foreach (array_values($images) as $i => $p) { $f[count($images) > 1 ? "image[$i]" : 'image'] = new CURLFile($p, 'image/png', basename($p)); }
    $ch = curl_init($base . '/images/edits');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $f, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 900,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key]]);
    return $ch;
}
/** Пакет картинок параллельно: [[images, prompt, out.png], …] → [out => ошибка|null]. Повтор один раз при сбое. */
function eskiz_edit_batch(array $jobs): array
{
    $res = [];
    for ($try = 1; $try <= 2 && $jobs; $try++) {
        $mh = curl_multi_init(); $hs = [];
        foreach ($jobs as $k => [$imgs, $prompt, $out]) { $hs[$k] = eskiz_edit_handle($imgs, $prompt); curl_multi_add_handle($mh, $hs[$k]); file_put_contents(preg_replace('/\.png$/', '.prompt.txt', $out), $prompt); }
        do { $st = curl_multi_exec($mh, $run); if ($run) { curl_multi_select($mh, 5); } } while ($run && $st === CURLM_OK);
        $left = [];
        foreach ($hs as $k => $ch) {
            $out = $jobs[$k][2]; $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); $body = (string)curl_multi_getcontent($ch);
            $j = json_decode($body, true); $b64 = $j['data'][0]['b64_json'] ?? null;
            if ($code === 200 && $b64) { file_put_contents($out, base64_decode($b64)); eskiz_preview($out); $res[$out] = null; }
            else { $res[$out] = "HTTP $code " . mb_substr($body !== '' ? $body : curl_error($ch), 0, 200); $left[$k] = $jobs[$k]; }
            curl_multi_remove_handle($mh, $ch);
        }
        curl_multi_close($mh); $jobs = $left;
    }
    return $res;
}
/** Генерация без основы (образ стиля, когда референсов нет). */
function eskiz_generate(string $prompt, string $out, string $size = '1536x1024'): void
{
    [$key, $base] = eskiz_gw();
    $ch = curl_init($base . '/images/generations');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 600,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key, 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode(['model' => 'gpt-image-2', 'prompt' => $prompt, 'size' => $size, 'quality' => 'high', 'n' => 1])]);
    $j = json_decode((string)curl_exec($ch), true); $b64 = $j['data'][0]['b64_json'] ?? null;
    if (!$b64) { throw new RuntimeException('образ стиля не сгенерирован: ' . mb_substr(json_encode($j, JSON_UNESCAPED_UNICODE), 0, 200)); }
    file_put_contents($out, base64_decode($b64)); eskiz_preview($out);
}
/** Vision → строгий JSON; модели по очереди (claude, затем gemini). */
function eskiz_vision(string $system, string $text, array $images, int $maxTokens = 6000): array
{
    [$key, $base] = eskiz_gw(); $last = '';
    foreach (['claude-sonnet-5-5', 'gemini-3.8-flash'] as $model) {
        $content = [['type' => 'text', 'text' => $text]];
        foreach ($images as $p) { $content[] = ['type' => 'image_url', 'image_url' => ['url' => 'data:image/jpeg;base64,' . base64_encode((string)file_get_contents(eskiz_small($p))), 'detail' => 'high']]; }
        $ch = curl_init($base . '/chat/completions');
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 300,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key, 'Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode(['model' => $model, 'max_tokens' => $maxTokens, 'temperature' => 0,
                'messages' => [['role' => 'system', 'content' => $system . "\nОтвет — только JSON, без пояснений."], ['role' => 'user', 'content' => $content]]])]);
        $body = (string)curl_exec($ch); $j = json_decode($body, true);
        $msg = (string)($j['choices'][0]['message']['content'] ?? '');
        $a = strpos($msg, '{'); $b = strrpos($msg, '}');
        if ($a !== false && $b !== false) { $d = json_decode(substr($msg, $a, $b - $a + 1), true); if (is_array($d)) { return $d + ['_model' => $model]; } }
        $last = $model . ': ' . mb_substr($body, 0, 160);
    }
    throw new RuntimeException('модели не ответили: ' . $last);
}
/** JPEG ≤ 1600 px для vision (меньше трафика, без EXIF). */
function eskiz_small(string $p): string
{
    $o = preg_replace('/\.(png|jpe?g|webp)$/i', '', $p) . '.v.jpg';
    if (!is_file($o) || filemtime($o) < filemtime($p)) {
        $im = imagecreatefromstring((string)file_get_contents($p)); $w = imagesx($im); $h = imagesy($im); $k = min(1, 1600 / max($w, $h));
        $n = imagecreatetruecolor((int)round($w * $k), (int)round($h * $k)); imagecopyresampled($n, $im, 0, 0, 0, 0, imagesx($n), imagesy($n), $w, $h); imagejpeg($n, $o, 85);
    }
    return $o;
}

// ── описание комнат (черновик) ─────────────────────────────────────────────────────────────────────────────────────────────
function eskiz_brief_text(array $b): string
{
    return implode("\n", array_filter([
        'Кто живёт: ' . ($b['household'] ?? ''), 'Рассказ: ' . ($b['story'] ?? ''), 'Стиль: ' . ($b['style'] ?? ''), 'Цвета: ' . ($b['colors'] ?? ''),
        'Избегать: ' . ($b['avoid'] ?? ''), 'Комнаты по словам заказчика: ' . ($b['rooms'] ?? ''),
        'Перепланировка: ' . (($b['replan'] ?? '') === 'replan' ? 'можно менять' : (($b['replan'] ?? '') === 'keep' ? 'планировку оставляем' : 'нет ответа')),
    ]));
}
function eskiz_scene(array $m): array
{
    $d = eskiz_dir($m['id']);
    $sys = 'Ты — дизайнер интерьера студии. По архитектурному плану квартиры и брифу опиши комнаты для визуализатора. Не выдумывай планировку. '
        . 'Назначение: typeFrom "label" — только если название комнаты написано словами внутри комнаты на плане (марки дверей, размеры, «Вид А» — не подписи); '
        . '"brief" — только если бриф прямо говорит, какая комната где; иначе "guess". Толщины стен — по чертежу в метрах (толстые наружные, тонкие перегородки). '
        . 'Привязывай комнату к тому, что видно: окна на какой стене, входная дверь, лоджия/балкон, косые стены, вентканалы. Верх картинки = верх плана. '
        . 'Мебель — под бриф (кто живёт, возраст детей, стиль). JSON: {"extWall": м, "intWall": м, "diagonalWalls": bool, "rooms": [{"type": один из '
        . implode('|', array_keys(ESKIZ_ROOM_EN)) . ', "name": "по-русски", "place": "top left|top|top right|left|centre|right|bottom left|bottom|bottom right", '
        . '"typeFrom": "label|brief|guess", "scene": "одна строка на английском для 3D-плана: место — комната и что в ней", '
        . '"note": "1–3 предложения на английском для кадра интерьера: мебель с размерами где важно, текстиль, свет"}], "questions": ["вопрос заказчику по-русски"]}';
    $r = eskiz_vision($sys, "Бриф:\n" . eskiz_brief_text($m['brief']), [$d . '/plan.png']);
    $rooms = array_values(array_filter($r['rooms'] ?? [], fn($x) => is_array($x) && !empty($x['type'])));
    if (!$rooms) { throw new RuntimeException('модель не описала комнаты'); }
    return ['extWall' => (float)($r['extWall'] ?? 0.5) ?: 0.5, 'intWall' => (float)($r['intWall'] ?? 0.1) ?: 0.1, 'diagonal' => !empty($r['diagonalWalls']),
        'rooms' => $rooms, 'questions' => array_values(array_filter($r['questions'] ?? [], 'is_string')), 'model' => $r['_model'] ?? ''];
}

// ── промпты (рецепт 21.09) ─────────────────────────────────────────────────────────────────────────────────────────────────
function eskiz_common(): string
{
    return "RENDER QUALITY:\nProfessional architectural visualization from a high-end studio: physically based rendering, global illumination, soft ambient occlusion in corners and under furniture, accurate contact shadows, 4K material textures with visible grain and weave, subtle chromatic richness, filmic colour grading, sharp focus.\n\n"
        . "LIGHT:\nLate-afternoon daylight raking through the windows, soft pools of light and long gentle shadows on the floor; interior lamps at warm 2700K glowing against the cooler daylight — a real photograph at that hour, not an evenly lit CG model.\n\n"
        . "MATERIALS:\nMatte walls with subtle tonal variation, wide-plank wood floor with visible grain, stone with natural veining, brushed metal, upholstery with real fabric weave, ceramic and glass with correct reflections — every surface physical, never flat colour.\n\n"
        . "LIVED-IN DETAIL:\nSmall imperfections of a real home that fit each room's purpose: a throw casually draped, an open book, cushions not perfectly aligned, a cup on the table, towels with soft creases, plants with uneven leaves. A storage room, closet or WC gets no sofa, TV or armchair.\n\n"
        . "DO NOT INCLUDE:\nNo people, pets, text, numbers, dimension lines, room labels or watermark. No warped geometry, duplicated or floating furniture, no doors opening into walls.";
}
function eskiz_style(array $b): string
{
    return trim('STYLE — ' . mb_strtoupper(trim((string)($b['style'] ?? '')) ?: 'WARM CONTEMPORARY') . ": warm, lived-in, not sterile, not all-beige.\n"
        . (($b['colors'] ?? '') !== '' ? "Client's colours: {$b['colors']}.\n" : '') . (($b['avoid'] ?? '') !== '' ? "Avoid: {$b['avoid']}.\n" : '')
        . 'Add depth with real wood, metal, linen and wool textures, ceramic lamps, large plants and art in the palette.');
}
function eskiz_top_prompt(array $m, bool $hasRef): string
{
    $sc = $m['scene']; $lines = implode("\n", array_map(fn($r) => '- ' . ltrim((string)($r['scene'] ?? ''), '- '), $sc['rooms']));
    return "TASK:\nImage 1 is the client's architectural floor plan. Convert it into a photorealistic 3D dollhouse render of the same apartment, finished and furnished."
        . ($hasRef ? "\nImage 2 is the client's mood reference: match its level of luxury, colour richness, materials and light — take nothing of its layout." : '')
        . "\n\nGEOMETRY — THE PART THAT MUST NOT CHANGE:\nReproduce the drawing exactly. Every wall keeps its drawn position, THICKNESS and angle: the thick walls of the drawing (outer and load-bearing, hatched bands about {$sc['extWall']} m) stay thick, the interior partitions (thin double lines, about {$sc['intWall']} m) stay THIN — never draw a partition as thick as an outer wall, never even out the walls"
        . ($sc['diagonal'] ? '; the diagonal (angled) walls stay diagonal at the same angle' : '')
        . ". Every door and window stays in its opening; loggias and balconies as drawn. Every room keeps its exact shape, proportion and relative area. Do not straighten the outline, merge rooms, invent rooms or move partitions. Dimension lines, axis bubbles, text, hatching and the title block are drawing notation — not objects."
        . "\n\nVIEW:\nAerial dollhouse view, camera tilted about 35 degrees from vertical, ceiling fully removed, walls cut at about 1.6 m; the cut tops of the walls are graphite and show each wall's true thickness. The apartment sits as one solid block on a plain light neutral background with a soft contact shadow."
        . "\n\nSCENE — ROOM BY ROOM (top of the image = top of the plan):\n$lines\n\n" . eskiz_style($m['brief']) . "\n\n" . eskiz_common();
}
function eskiz_room_prompt(array $m, array $r, bool $hasRef): string
{
    $what = ESKIZ_ROOM_EN[$r['type']] ?? $r['type'];
    return "TASK:\nPhotorealistic interior photograph of one room of this apartment — the $what ({$r['place']} of image 1), taken at eye level, about 1.5 m above the floor, with a 24 mm wide-angle lens held perfectly level so vertical lines stay vertical.\n"
        . "Image 1 is the 3D plan of the finished apartment: this room must have the same furniture, layout, materials and colours as there." . ($hasRef ? ' Image 2 is the mood reference for richness and light only.' : '')
        . "\n\nCOMPOSITION:\nThe camera stands at the room entrance or in a corner looking into the room, so the viewer reads the whole space: floor, two walls and the main furniture group. Foreground, middle ground and background all present.\n\n"
        . "ROOM: $what: " . trim((string)($r['note'] ?? '')) . "; rug, plants, art and lamps that suit it.\n\n" . eskiz_style($m['brief']) . "\n\n" . eskiz_common();
}

/** Сверка вида сверху с планом → [score, issues]. */
function eskiz_check(string $plan, string $top, array $sc): array
{
    $sys = 'Ты — проверяющий архитектор. Картинка 1 — план заказчика, картинка 2 — 3D-вид сверху той же квартиры. Сравни ГЕОМЕТРИЮ, не стиль: число и форма комнат, '
        . 'косые стены, входная дверь, проёмы, окна по стенам, лоджия и балкон, толщина стен (толстые наружные, тонкие перегородки), нет ли лишних, слитых комнат или снесённых стен. '
        . 'JSON: {"score": 0..100, "issues": ["конкретное замечание по-русски"]}';
    $r = eskiz_vision($sys, 'Комнаты: ' . implode('; ', array_map(fn($x) => ($x['place'] ?? '') . ': ' . ($x['name'] ?? ''), $sc['rooms'])), [$plan, $top], 3000);
    return ['score' => max(0, min(100, (int)($r['score'] ?? 0))), 'issues' => array_values(array_filter($r['issues'] ?? [], 'is_string'))];
}

/** Правка заказчика словами → новое описание; планировка при keep — вопрос, не правка. */
function eskiz_fix_scene(array $m, string $text): array
{
    $keep = ($m['brief']['replan'] ?? '') !== 'replan';
    $sys = 'Ты — дизайнер студии. Заказчик прислал правку к эскизу. Перепиши описание комнат с учётом правки, остальное сохрани дословно. '
        . 'Если правка касается планировки (снести/передвинуть стену, перенести дверь или окно, объединить комнаты) — '
        . ($keep ? 'НЕ применяй её: заказчик выбрал «планировку оставляем»; верни её в "geometry" вопросом. ' : 'примени и отметь в "geometry". ')
        . 'JSON: {"rooms": [тот же формат], "redraw": ["type комнат к перерисовке"], "top": true|false, "geometry": ["по-русски"], "summary": "что изменено, одной строкой"}';
    $r = eskiz_vision($sys, "Описание комнат:\n" . json_encode($m['scene']['rooms'], JSON_UNESCAPED_UNICODE) . "\n\nПравка заказчика: «" . $text . '»', []);
    if (empty($r['rooms']) || !is_array($r['rooms'])) { throw new RuntimeException('правка не разобрана'); }
    return $r;
}

/** Порядок работы фонового процесса: scene → (дизайнер подтверждает) → render (вид сверху ×3 → сверка → 5 комнат) | fix. */
function eskiz_spawn(string $id, string $step): void
{
    $php = PHP_BINARY && str_contains(PHP_BINARY, 'fpm') ? '/usr/bin/php' : (PHP_BINARY ?: 'php');
    if (!is_executable($php)) { $php = 'php'; }
    $cmd = escapeshellarg($php) . ' ' . escapeshellarg(__DIR__ . '/../eskiz-worker.php') . ' ' . escapeshellarg($id) . ' ' . escapeshellarg($step)
        . ' >> ' . escapeshellarg(eskiz_dir($id) . '/worker.log') . ' 2>&1 &';
    exec('nohup ' . $cmd);
}

// ── эскиз заказа (бриф с сайта → эскиз → кабинет клиента) ──────────────────────────────────────────────────────────────────
// Связь: orders/<номер>/eskiz.json = {"id": "<id эскиза>"}; в meta эскиза — order_id, order_number. Клиент видит эскиз, только когда
// дизайнер нажал «показать клиенту» (meta.shown) — после проверки описания и сверки вида сверху с планом.
function eskiz_of_order(array $o): ?array
{
    $f = linea_private() . '/orders/' . preg_replace('/[^A-Za-z0-9-]/', '', (string)$o['number']) . '/eskiz.json';
    if (!is_file($f)) { return null; }
    $id = (string)(json_decode((string)file_get_contents($f), true)['id'] ?? '');
    return $id !== '' ? eskiz_load($id) : null;
}
/** Ответ брифа «перепланировка» (home.works.replan / answers.replan) → keep | replan | '' (нет ответа). */
function eskiz_replan_of(array $b): string
{
    $raw = $b['home']['works']['replan'] ?? null;
    $list = array_values(array_filter(is_array($raw) ? $raw : ($raw !== null ? [$raw] : []), fn($x) => is_string($x) && $x !== '' && $x !== 'unknown'));
    if ($list) { return $list === ['none'] ? 'keep' : 'replan'; }
    $t = mb_strtolower(trim((string)($b['answers']['replan'] ?? '')));
    if ($t === '') { return ''; }
    return preg_match('/^(нет|не\s|оставля|не менять|без перепланир)/u', $t) ? 'keep' : 'replan';
}
/** Создать эскиз из заказа: план и референсы — из архива брифа, бриф — из brief.json. Плана картинкой нет — null (эскиз вручную). */
function eskiz_from_order(array $o, bool $spawn = true): ?array
{
    if ($m = eskiz_of_order($o)) { return $m; }
    $dir = linea_private() . '/orders/' . preg_replace('/[^A-Za-z0-9-]/', '', (string)$o['number']);
    $zf = $dir . '/brief.zip'; if (!is_file($zf)) { return null; }
    $b = is_file($dir . '/brief.json') ? (json_decode((string)file_get_contents($dir . '/brief.json'), true) ?: []) : [];
    $z = new ZipArchive(); if ($z->open($zf, ZipArchive::RDONLY) !== true) { return null; }
    $plans = []; $refs = [];
    for ($i = 0; $i < $z->numFiles; $i++) {
        $n = (string)($z->statIndex($i)['name'] ?? '');
        if (!preg_match('/\.(jpe?g|png|webp)$/i', $n)) { continue; }
        if (str_starts_with($n, 'plan/')) { $plans[] = $n; } elseif (str_starts_with($n, 'referensy/')) { $refs[] = $n; }
    }
    if (!$plans) { $z->close(); return null; }
    sort($plans); sort($refs);
    $id = date('ymd-His') . '-' . substr(bin2hex(random_bytes(3)), 0, 4);
    $d = eskiz_dir($id); linea_mkdir($d);
    $tmp = $d . '/in.bin';
    file_put_contents($tmp, (string)$z->getFromName($plans[0])); eskiz_png($tmp, $d . '/plan.png', 2400);
    $k = 0; foreach (array_slice($refs, 0, 5) as $r) { file_put_contents($tmp, (string)$z->getFromName($r)); try { eskiz_png($tmp, $d . '/ref-' . (++$k) . '.png', 1600); eskiz_preview($d . "/ref-$k.png"); } catch (Throwable $e) { $k--; } }
    @unlink($tmp); $z->close();
    $s = $b['style'] ?? []; $a = $b['answers'] ?? [];
    $brief = ['household' => mb_substr((string)($a['household'] ?? ''), 0, 500), 'story' => mb_substr((string)($b['story'] ?? ''), 0, 2000),
        'style' => mb_substr((string)($s['title'] ?? $s['key'] ?? ''), 0, 120), 'colors' => mb_substr((string)($s['colors'] ?? ''), 0, 300),
        'avoid' => mb_substr((string)($s['avoidColors'] ?? ''), 0, 300),
        'rooms' => mb_substr(implode(', ', array_filter(array_map(fn($r) => is_array($r) ? (string)($r['name'] ?? $r['type'] ?? '') : (string)$r, (array)($b['rooms'] ?? [])))), 0, 500),
        'replan' => eskiz_replan_of($b)];
    $m = ['id' => $id, 'title' => 'Заказ ' . $o['number'], 'created' => linea_now(), 'by' => 'brief', 'test' => !empty($o['test']), 'order_id' => (int)$o['id'],
        'order_number' => (string)$o['number'], 'brief' => $brief, 'status' => 'new', 'log' => [], 'fixes' => [], 'rooms' => [], 'tops' => [], 'shown' => false];
    eskiz_log($m, 'из заказа ' . $o['number'] . ': план ' . basename($plans[0]) . ($k ? ", референсов $k" : ', без референсов') . ', перепланировка: ' . ($brief['replan'] ?: 'нет ответа'));
    eskiz_save($m);
    file_put_contents($dir . '/eskiz.json', json_encode(['id' => $id]));
    if ($spawn) { eskiz_spawn($id, 'scene'); }
    return $m;
}
/** Что клиент видит в кабинете. null — эскиза нет или дизайнер ещё не показал. */
function eskiz_public(array $o): ?array
{
    $m = eskiz_of_order($o);
    if (!$m) { return null; }
    if (empty($m['shown'])) { return ['state' => 'work', 'text' => 'Готовим эскиз: 3D-вид квартиры сверху и пять интерьеров. Покажем здесь, как только дизайнер проверит его по вашему плану.']; }
    $rounds = (int)(linea_cfg()['rounds'] ?? 3);
    $img = fn($f) => 'eskiz_img&o=' . rawurlencode((string)$o['number']) . '&f=' . rawurlencode((string)$f);
    $rooms = []; foreach ((array)$m['rooms'] as $t => $f) { $rooms[] = ['title' => ESKIZ_ROOM_RU[$t] ?? $t, 'img' => $img(preg_replace('/\.png$/', '.jpg', $f)), 'full' => $img($f)]; }
    $busy = in_array($m['status'], ['new', 'scene-run', 'rendering', 'render'], true);
    return ['state' => $busy ? 'redraw' : 'ready', 'version' => (int)($m['scene']['version'] ?? 1),
        'top' => !empty($m['best']) ? ['img' => $img(preg_replace('/\.png$/', '.jpg', $m['best'])), 'full' => $img($m['best'])] : null, 'rooms' => $rooms,
        'fixes' => array_map(fn($f) => ['text' => $f['text'], 'date' => $f['date'], 'summary' => $f['summary'] ?? '', 'geometry' => $f['geometry'] ?? []], (array)$m['fixes']),
        'roundsLeft' => max(0, $rounds - count((array)$m['fixes'])), 'rounds' => $rounds,
        'replanAnswered' => ($m['brief']['replan'] ?? '') !== '', 'approved' => $m['approved'] ?? null];
}
