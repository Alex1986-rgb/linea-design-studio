<?php
/**
 * Перенос данных LINEA из linea-private/linea.sqlite в MySQL (config 'db'). По умолчанию — СУХОЙ ПРОГОН: только считает и сверяет.
 *
 *   php server/tools/migrate-sqlite-to-mysql.php --private=<папка linea-private> [--sqlite=<файл>] [--apply]
 *
 * Что делает: создаёт схему в MySQL (lib/migrations.php), для каждой таблицы SQLite (orders, events, accounts, br_* …) сверяет
 * колонки и переносит строки с теми же id (ссылки между таблицами сохраняются; AUTO_INCREMENT встаёт за максимальный id).
 * Отказывается, если в целевой таблице MySQL уже есть строки (повторный перенос не задваивает данные).
 * Файлы (orders/<номер>/, brigady/files/) остаются на диске в linea-private — переносить их не нужно.
 * 🔴 На боевом запускать только после бэкапа linea.sqlite и с выключенным приёмом (или в тихое время); сначала без --apply.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$opt = getopt('', ['private:', 'sqlite:', 'apply']);
$priv = rtrim((string)($opt['private'] ?? ''), '/');
if ($priv === '' || !is_dir($priv)) { fwrite(STDERR, "--private=<папка linea-private> обязателен\n"); exit(2); }
putenv('LINEA_PRIVATE=' . $priv);
$apply = isset($opt['apply']);
require __DIR__ . '/../api/lib/boot.php';
require __DIR__ . '/../api/lib/db.php';

$sqliteFile = (string)($opt['sqlite'] ?? $priv . '/linea.sqlite');
if (!is_file($sqliteFile)) { fwrite(STDERR, "нет файла SQLite: $sqliteFile\n"); exit(2); }
if (!db_config() || !str_starts_with(db_config()['dsn'], 'mysql:')) { fwrite(STDERR, "в $priv/config.php нет 'db' с MySQL — переносить некуда\n"); exit(2); }

$src = new PDO('sqlite:' . $sqliteFile, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$dst = db();
echo ($apply ? 'ПЕРЕНОС' : 'СУХОЙ ПРОГОН (ничего не пишется; для переноса — --apply)') . "\n  из: $sqliteFile\n  в:  " . preg_replace('/;?password=[^;]*/', '', db_config()['dsn']) . "\n";
db_migrate();   // схема (создание таблиц — не данные; безопасно и в сухом прогоне)

$order = ['orders', 'events', 'accounts', 'account_tokens', 'br_brigades', 'br_portfolio', 'br_files', 'br_requests', 'br_invites', 'br_offers',
    'br_jobs', 'br_stages', 'br_remarks', 'br_reviews', 'br_invoices', 'br_disputes', 'br_dispute_msgs', 'br_sheet_reqs', 'br_audit'];
$have = $src->query("SELECT name FROM sqlite_master WHERE type = 'table'")->fetchAll(PDO::FETCH_COLUMN);
$plan = []; $bad = 0;
foreach ($order as $t) {
    if (!in_array($t, $have, true)) { continue; }
    $sCols = array_column($src->query("PRAGMA table_info($t)")->fetchAll(), 'name');
    $dCols = $dst->query("SHOW COLUMNS FROM `$t`")->fetchAll(PDO::FETCH_COLUMN);
    $cols = array_values(array_intersect($sCols, $dCols));
    $lost = array_diff($sCols, $dCols);
    $n = (int)$src->query("SELECT COUNT(*) FROM $t")->fetchColumn();
    $exist = (int)$dst->query("SELECT COUNT(*) FROM `$t`")->fetchColumn();
    printf("  %-16s строк %5d · в MySQL уже %5d%s\n", $t, $n, $exist, $lost ? ' · ✗ нет колонок в MySQL: ' . implode(', ', $lost) : '');
    if ($lost || ($exist > 0 && $n > 0)) { $bad++; }
    $plan[] = [$t, $cols, $n];
}
foreach (array_diff($have, $order, ['sqlite_sequence']) as $t) { echo "  ? таблица $t не в списке переноса — пропущена\n"; }
if ($bad) { echo "✗ перенос невозможен: см. отметки выше (непустые таблицы MySQL или расхождение колонок)\n"; exit(1); }
if (!$apply) { echo "✓ сухой прогон: расхождений нет. Для переноса добавьте --apply\n"; exit(0); }

$dst->exec('SET FOREIGN_KEY_CHECKS = 0');
$dst->beginTransaction();
try {
    foreach ($plan as [$t, $cols, $n]) {
        if (!$n) { continue; }
        $ins = $dst->prepare('INSERT INTO `' . $t . '` (' . implode(', ', array_map(fn($c) => "`$c`", $cols)) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')');
        $q = $src->query('SELECT ' . implode(', ', array_map(fn($c) => '"' . $c . '"', $cols)) . " FROM $t ORDER BY id");
        $k = 0;
        while ($r = $q->fetch()) { $ins->execute(array_values($r)); $k++; }
        echo "  → $t: $k\n";
    }
    $dst->commit();
} catch (Throwable $e) {
    if ($dst->inTransaction()) { $dst->rollBack(); }
    $dst->exec('SET FOREIGN_KEY_CHECKS = 1');
    fwrite(STDERR, '✗ откат: ' . $e->getMessage() . "\n"); exit(1);
}
$dst->exec('SET FOREIGN_KEY_CHECKS = 1');
foreach ($plan as [$t, , $n]) {
    $m = (int)$dst->query("SELECT COUNT(*) FROM `$t`")->fetchColumn();
    if ($m !== $n) { echo "  ✗ $t: в SQLite $n, в MySQL $m\n"; $bad++; }
}
echo $bad ? "✗ сверка не сошлась\n" : "✓ перенесено, количества сходятся. Дальше: linea.sqlite не удалять (резерв), проверить admin.php и страницу заказа.\n";
exit($bad ? 1 : 0);
