<?php
/**
 * Фоновый процесс эскиза (запускает api/eskiz.php через eskiz_spawn; из браузера не открывается — только CLI).
 *   php eskiz-worker.php <id> scene    — описание комнат по плану и брифу (черновик для дизайнера) + образ стиля, если референсов нет
 *   php eskiz-worker.php <id> render   — вид сверху ×3 → сверка с планом → лучший → 5 интерьеров
 *   php eskiz-worker.php <id> fix      — последняя правка заказчика → новое описание → перерисовка задетого
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/eskiz.php';
set_time_limit(0);
ini_set('memory_limit', '1024M');               // ответы шлюза с картинками 4K в base64 по 20–25 МБ, пачкой до 5
[$id, $step] = [$argv[1] ?? '', $argv[2] ?? ''];
$m = eskiz_load($id);
if (!$m) { fwrite(STDERR, "нет эскиза $id\n"); exit(1); }
$d = eskiz_dir($id);
$lock = fopen($d . '/worker.lock', 'c'); if (!flock($lock, LOCK_EX | LOCK_NB)) { fwrite(STDERR, "уже идёт\n"); exit(0); }

$set = function (string $status, string $line = '') use (&$m) { $m = eskiz_load($m['id']) ?? $m; $m['status'] = $status; if ($line !== '') { eskiz_log($m, $line); } eskiz_save($m); };
$refs = fn() => array_values(array_filter(glob($d . '/ref-*.png') ?: [], fn($f) => !str_ends_with($f, '.v.jpg')));

try {
    if ($step === 'scene') {
        $set('scene-run', 'описание комнат по плану…');
        if (!$refs()) {
            eskiz_generate('Editorial interior photograph for a mood board, magazine quality: a living room in the style "' . ($m['brief']['style'] ?: 'warm contemporary')
                . '", colours: ' . ($m['brief']['colors'] ?: 'warm natural palette') . '. Warm late-afternoon sunlight, rich layered materials, crisp detail. No people, no text.', $d . '/ref-gen.png');
            $set('scene-run', 'референсов нет — сгенерирован образ стиля');
        }
        $sc = eskiz_scene($m);
        $m = eskiz_load($id); $m['scene'] = $sc; $m['scene']['version'] = 1;
        $m['questions'] = $sc['questions'];
        eskiz_save($m);
        $set('scene-check', 'черновик описания готов (' . count($sc['rooms']) . ' комнат) — проверить по плану и подтвердить');
    } elseif ($step === 'render' || $step === 'fix' || $step === 'rooms') {
        $only = null; $top = $step !== 'rooms';                     // rooms — только интерьеры по уже выбранному виду сверху (повтор после сбоя)
        if ($step === 'fix') {
            $fx = end($m['fixes']);
            $set('render', 'правка: разбор…');
            $r = eskiz_fix_scene($m, (string)$fx['text']);
            $m = eskiz_load($id);
            $m['scene']['rooms'] = $r['rooms']; $m['scene']['version'] = ($m['scene']['version'] ?? 1) + 1;
            $k = array_key_last($m['fixes']); $m['fixes'][$k] += ['summary' => (string)($r['summary'] ?? ''), 'geometry' => $r['geometry'] ?? [], 'redraw' => $r['redraw'] ?? [], 'top' => !empty($r['top'])];
            eskiz_save($m);
            $only = $r['redraw'] ?? []; $top = !empty($r['top']);
            $set('render', 'правка → версия ' . $m['scene']['version'] . ': ' . ($r['summary'] ?? '') . (!empty($r['geometry']) ? ' · планировка: ' . implode('; ', $r['geometry']) . ' — вопрос заказчику' : ''));
        }
        $ref = $refs()[0] ?? null; $v = $m['scene']['version'] ?? 1;
        if ($top) {
            $set('render', 'вид сверху: 3 варианта…');
            $jobs = []; for ($k = 1; $k <= 3; $k++) { $jobs[] = [array_filter([$d . '/plan.png', $ref]), eskiz_top_prompt($m, (bool)$ref), "$d/top-v$v-$k.png"]; }
            $err = eskiz_edit_batch($jobs);
            $ok = array_keys(array_filter($err, fn($e) => $e === null));
            if (!$ok) { throw new RuntimeException('вид сверху не сгенерирован: ' . implode('; ', array_filter($err))); }
            $set('render', 'сверка вида сверху с планом…');
            $res = [];
            foreach ($ok as $f) { try { $c = eskiz_check($d . '/plan.png', $f, $m['scene']); } catch (Throwable $e) { $c = ['score' => 0, 'issues' => ['сверка не прошла: ' . $e->getMessage()]]; } $res[] = ['file' => basename($f)] + $c; }
            usort($res, fn($a, $b) => $b['score'] <=> $a['score']);
            $m = eskiz_load($id); $m['tops'] = $res; $m['best'] = $res[0]['file']; eskiz_save($m);
            $set('render', 'лучший вид сверху: ' . $res[0]['file'] . ' (' . $res[0]['score'] . '/100)' . ($res[0]['score'] < 70 ? ' — НИЖЕ ПОРОГА 70, заказчику не показывать' : ''));
        }
        $m = eskiz_load($id); $best = $d . '/' . $m['best'];
        $pick = [];
        foreach (ESKIZ_ROOMS as $t) { foreach ($m['scene']['rooms'] as $r) { if (($r['type'] ?? '') === $t && count($pick) < 5 && ($only === null || in_array($t, $only, true))) { $pick[] = $r; break; } } }
        if ($pick) {
            $set('render', 'интерьеры: ' . count($pick) . '…');
            $jobs = []; foreach ($pick as $r) { $jobs[] = [array_filter([$best, $ref]), eskiz_room_prompt($m, $r, (bool)$ref), "$d/room-v$v-{$r['type']}.png"]; }
            $err = eskiz_edit_batch($jobs);
            $m = eskiz_load($id);
            foreach ($err as $f => $e) { if ($e === null) { $m['rooms'][explode('-', basename($f, '.png'), 3)[2]] = basename($f); } }
            eskiz_save($m);
            $bad = array_filter($err); if ($bad) { $set('render', 'не получились: ' . implode('; ', array_map('basename', array_keys($bad)))); }
        }
        $set('ready', 'готово');
    }
} catch (Throwable $e) {
    $set('error', 'ошибка: ' . $e->getMessage());
    exit(1);
}
