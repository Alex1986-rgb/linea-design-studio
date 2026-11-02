<?php
/**
 * LINEA · безопасная правка боевого config.php (ревью 02.11.2026, С8). Запускается на сервере из скриптов выкладки:
 *   ssh beget 'cd ~/dizain-studiya-kvartir/linea-private && php8.2 -- <команда> [аргументы]' < tools/config-edit.php
 * или локально (тест): php tools/config-edit.php --dir=<папка> <команда> …
 *
 * Команды:
 *   defaults '<json>'   задать ТОЛЬКО незаданные ключи: {"ключ": значение} — если ключа нет (isset);
 *                       {"ключ": {"if_empty": значение}} — если ключ пуст (empty); {"ключ": {"if_short": N, "random_hex": M}} —
 *                       если строка короче N, записать случайные M байт в hex. Заданные владельцем значения не трогаются.
 *   add-proxy <ip>      дописать адрес в trusted_proxies (если его нет)
 *   list                копии config.php.bak-* (новые сверху), без содержимого
 *   rollback [--dry] [--file=<имя .bak>]  вернуть последнюю (или указанную) копию; текущий config сохраняется как .bak-…-before-otkat
 *
 * Запись атомарна: временный файл в той же папке (права 600) → php -l → отдельный процесс PHP делает require и проверяет,
 * что вернулся массив → rename поверх config.php. Сломанный результат рабочий config не подменяет.
 * Копия перед правкой — config.php.bak-ГГГГММДД-ЧЧММСС; существующая копия никогда не перезаписывается (суффикс -2, -3…).
 * Нет изменений — нет ни записи, ни копии. В config с выражениями (getenv, константы, переменные, __DIR__) скрипт не пишет:
 * var_export их потерял бы — печатает, что добавить руками. Значения (пароли, токены) не печатаются — только имена ключей.
 */
declare(strict_types=1);

$args = array_slice($argv, 1);
$dir = getcwd();
foreach ($args as $i => $a) { if (str_starts_with($a, '--dir=')) { $dir = substr($a, 6); unset($args[$i]); } }
$args = array_values($args);
$cmd = $args[0] ?? '';
$f = rtrim($dir, '/') . '/config.php';
$php = PHP_BINARY ?: 'php';

function out(string $s): void { fwrite(STDOUT, $s . PHP_EOL); }
function fail(string $s, int $code = 1): never { fwrite(STDERR, 'config-edit: ' . $s . PHP_EOL); exit($code); }

/** Проверка файла отдельным процессом: синтаксис и «require возвращает массив». */
function check_file(string $php, string $file): ?string {
    exec(escapeshellarg($php) . ' -l ' . escapeshellarg($file) . ' 2>&1', $o, $rc);
    if ($rc !== 0) { return 'php -l: ' . trim(implode(' ', $o)); }
    $o = [];
    exec(escapeshellarg($php) . ' -r ' . escapeshellarg('$c = require $argv[1]; exit(is_array($c) ? 0 : 3);') . ' ' . escapeshellarg($file) . ' 2>&1', $o, $rc);
    return $rc === 0 ? null : 'require не вернул массив (код ' . $rc . ')';
}
/** Копия рядом, без перезаписи существующей. */
function backup(string $f, string $tag = ''): string {
    $base = $f . '.bak-' . date('Ymd-His') . $tag; $b = $base; $n = 2;
    while (file_exists($b)) { $b = $base . '-' . $n++; }
    if (!copy($f, $b)) { fail('не удалось сделать копию ' . basename($b)); }
    @chmod($b, 0600);
    return $b;
}
/** Атомарная запись: tmp → проверка → rename. */
function atomic_write(string $php, string $f, string $code): void {
    $tmp = dirname($f) . '/.config.php.tmp-' . getmypid() . '-' . bin2hex(random_bytes(3));
    $old = umask(077);
    $ok = file_put_contents($tmp, $code) === strlen($code);
    umask($old);
    if (!$ok) { @unlink($tmp); fail('не удалось записать временный файл'); }
    @chmod($tmp, 0600);
    if (($e = check_file($php, $tmp)) !== null) { @unlink($tmp); fail('новый config не прошёл проверку, рабочий не тронут: ' . $e, 5); }
    if (!rename($tmp, $f)) { @unlink($tmp); fail('rename не удался, рабочий config не тронут'); }
    if (function_exists('opcache_invalidate')) { @opcache_invalidate($f, true); }
}
/** Есть ли в config выражения, которые var_export не сохранит. */
function has_expressions(string $src): array {
    $bad = [];
    foreach (token_get_all($src) as $t) {
        if (!is_array($t)) { continue; }
        [$id, $text] = $t;
        if (in_array($id, [T_VARIABLE, T_DIR, T_FILE, T_LINE, T_CLASS_C, T_FUNC_C, T_NS_C, T_INCLUDE, T_INCLUDE_ONCE, T_REQUIRE, T_REQUIRE_ONCE, T_DOUBLE_COLON, T_NEW], true)) { $bad[] = $text; }
        if ($id === T_STRING && !in_array(strtolower($text), ['true', 'false', 'null'], true)) { $bad[] = $text; }
        if (defined('T_NAME_FULLY_QUALIFIED') && in_array($id, [T_NAME_FULLY_QUALIFIED, T_NAME_QUALIFIED], true)) { $bad[] = $text; }
    }
    return array_values(array_unique($bad));
}
/** Копии config.php.bak-*, новые сверху: порядок по метке в имени (ГГГГММДД-ЧЧММ[СС][-N]), при равенстве — по mtime. */
function baks(string $f): array {
    $key = function (string $x): string {
        if (!preg_match('/\.bak-(\d{8})-(\d{4,6})(?:-(\d+))?/', basename($x), $m)) { return '0-' . filemtime($x); }
        return $m[1] . str_pad($m[2], 6, '0') . sprintf('%03d', (int)($m[3] ?? 0)) . '-' . filemtime($x);
    };
    $l = glob($f . '.bak-*') ?: [];
    usort($l, fn($a, $b) => strcmp($key($b), $key($a)));
    return $l;
}
function load(string $f): array {
    if (!is_file($f)) { fail('нет ' . $f); }
    $c = require $f;
    if (!is_array($c)) { fail('config.php не вернул массив — не трогаю'); }
    return $c;
}
function save(string $php, string $f, array $c, array $changed, string $why): void {
    $src = (string)file_get_contents($f);
    if ($bad = has_expressions($src)) {
        fail('в config.php есть выражения (' . implode(', ', array_slice($bad, 0, 5)) . ') — автоматическая правка их потеряла бы. Добавить руками ключи: ' . implode(', ', $changed), 6);
    }
    $b = backup($f);
    $code = "<?php\n// правлено tools/config-edit.php " . date('Y-m-d H:i:s') . " ($why), прежняя версия — " . basename($b) . "\nreturn " . var_export($c, true) . ";\n";
    atomic_write($php, $f, $code);
    out('изменено: ' . implode(', ', $changed) . '; копия ' . basename($b));
}

switch ($cmd) {
    case 'defaults': {
        $spec = json_decode((string)($args[1] ?? ''), true);
        if (!is_array($spec)) { fail('defaults: нужен JSON-объект'); }
        $c = load($f); $changed = [];
        foreach ($spec as $k => $v) {
            if (is_array($v) && isset($v['if_short'])) {
                if (strlen((string)($c[$k] ?? '')) < (int)$v['if_short']) { $c[$k] = bin2hex(random_bytes((int)($v['random_hex'] ?? 24))); $changed[] = $k; }
            } elseif (is_array($v) && array_key_exists('if_empty', $v)) {
                if (empty($c[$k])) { $c[$k] = $v['if_empty']; $changed[] = $k; }
            } elseif (!isset($c[$k])) { $c[$k] = $v; $changed[] = $k; }
        }
        if (!$changed) { out('без изменений: все ключи уже заданы, config не переписан'); break; }
        save($php, $f, $c, $changed, 'defaults');
        break;
    }
    case 'add-proxy': {
        $ip = (string)($args[1] ?? '');
        if (filter_var($ip, FILTER_VALIDATE_IP) === false) { fail('add-proxy: не IP-адрес'); }
        $c = load($f);
        $list = (array)($c['trusted_proxies'] ?? ['127.0.0.1', '::1']);
        if (in_array($ip, $list, true)) { out('без изменений: адрес уже в trusted_proxies'); break; }
        $c['trusted_proxies'] = array_values(array_unique(array_merge($list, [$ip])));
        save($php, $f, $c, ['trusted_proxies'], 'add-proxy');
        break;
    }
    case 'list': {
        $l = baks($f);
        foreach ($l as $x) { out(date('Y-m-d H:i:s', filemtime($x)) . '  ' . basename($x) . '  ' . filesize($x) . ' байт'); }
        if (!$l) { out('копий нет'); }
        break;
    }
    case 'rollback': {
        $dry = in_array('--dry', $args, true);
        $want = null; foreach ($args as $a) { if (str_starts_with($a, '--file=')) { $want = basename(substr($a, 7)); } }
        $l = baks($f);
        // по умолчанию — последняя копия, снятая ПЕРЕД правкой; копии «-before-otkat» (снятые самим откатом) — только по --file=,
        // иначе второй запуск отката вернул бы правку обратно
        // и пропускаются копии, совпадающие с текущим config (уже возвращённая): повторный откат идёт дальше назад
        $cur = is_file($f) ? (string)file_get_contents($f) : null;
        if ($want !== null) { $l = array_values(array_filter($l, fn($x) => basename($x) === $want)); }
        else {
            $l = array_values(array_filter($l, fn($x) => !str_contains(basename($x), '-before-otkat')));
            // текущий config совпадает с одной из копий (её уже вернули) — берём копию старше неё
            foreach ($l as $i => $x) { if (file_get_contents($x) === $cur) { $l = array_slice($l, $i + 1); break; } }
        }
        $src = $l[0] ?? null;
        if ($src === null) { fail($want ? "копии $want нет" : 'копий config.php.bak-*, отличных от текущего config, нет — откатывать нечего'); }
        if (($e = check_file($php, $src)) !== null) { fail(basename($src) . ' не годится: ' . $e, 5); }
        if ($dry) { out('вернул бы ' . basename($src) . ' (проверка пройдена); текущий config сохранился бы копией'); break; }
        $b = is_file($f) ? backup($f, '-before-otkat') : null;
        atomic_write($php, $f, (string)file_get_contents($src));
        out('возвращена ' . basename($src) . ($b ? '; прежний config — ' . basename($b) : ''));
        break;
    }
    default:
        fail('команды: defaults \'<json>\' | add-proxy <ip> | list | rollback [--dry] [--file=…]', 2);
}
