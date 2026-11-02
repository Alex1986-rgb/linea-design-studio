#!/usr/bin/env bash
# LINEA · дамп данных на Beget → один tar.gz в stdout (журнал — в stderr).
#
# Запускается НЕ руками на сервере, а через ssh из бэкапера SmartApe:  ssh <beget> 'nice -n 19 bash -s' < beget-dump.sh
# Что попадает в архив:
#   linea-private/…            — заказы, правки, бриги, журналы, config.php (без sessions/, rate/, exports/, блокировок и временных)
#   _dump/mysql.sql            — дамп MySQL aleks2si_linea (mysqldump; нет его — PHP-дамп через PDO)
#   _dump/linea.sqlite         — согласованная копия SQLite (VACUUM INTO), если файл базы есть
#   _dump/manifest.json        — время, драйвер, ЧИСЛО СТРОК КАЖДОЙ ТАБЛИЦЫ на момент дампа, пропущенные большие файлы
# Пароль базы читается PHP из config.php на сервере и передаётся mysqldump через окружение — наружу не уходит.
# Трогает только ~/dizain-studiya-kvartir/linea-private (чужие сайты аккаунта — нет). Один поток, nice/ionice.
#
# Переменные (для макета на маке): LINEA_ROOT (по умолчанию ~/dizain-studiya-kvartir), LINEA_PHP, LINEA_BK_MAXMB (200).
set -euo pipefail
export COPYFILE_DISABLE=1   # макет на маке: bsdtar не добавляет ._-файлы

ROOT="${LINEA_ROOT:-$HOME/dizain-studiya-kvartir}"
PRIV_NAME="linea-private"
PRIV="$ROOT/$PRIV_NAME"
MAXMB="${LINEA_BK_MAXMB:-200}"
PHP="${LINEA_PHP:-/usr/local/bin/php8.2}"
[ -x "$PHP" ] || PHP="$(command -v php8.2 || command -v php || true)"
log() { printf '[beget-dump] %s\n' "$*" >&2; }
[ -n "$PHP" ] || { log "нет php"; exit 3; }
[ -d "$PRIV" ] || { log "нет папки $PRIV"; exit 3; }
[ -f "$PRIV/config.php" ] || { log "нет $PRIV/config.php"; exit 3; }

# временная папка — рядом с linea-private, ВНЕ веб-корня (public_html)
TMP="$(mktemp -d "$ROOT/.linea-bk.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/_dump"
IONICE=""; command -v ionice >/dev/null 2>&1 && IONICE="ionice -c3"

DUMPER="$(command -v mysqldump || command -v mariadb-dump || true)"
log "php: $PHP; mysqldump: ${DUMPER:-нет}"

# ---- база: PHP читает config.php, сам зовёт mysqldump (пароль — в окружении процесса) и пишет manifest ----
LINEA_PRIV="$PRIV" LINEA_OUT="$TMP/_dump" LINEA_DUMPER="$DUMPER" $IONICE "$PHP" -d display_errors=stderr -r '
$priv = getenv("LINEA_PRIV"); $out = getenv("LINEA_OUT"); $dumper = getenv("LINEA_DUMPER");
$cfg = include $priv . "/config.php";
if (!is_array($cfg)) { fwrite(STDERR, "config.php не вернул массив\n"); exit(4); }
$db = $cfg["db"] ?? null;
if ((!is_array($db) || ($db["dsn"] ?? "") === "") && ($cfg["db_dsn"] ?? "") !== "") { $db = ["dsn" => $cfg["db_dsn"], "user" => $cfg["db_user"] ?? "", "pass" => $cfg["db_pass"] ?? ""]; }
$man = ["format" => "linea-backup-1", "created" => date("c"), "driver" => "none", "tables" => [], "sqlite_tables" => [],
        "method" => null, "config_keys" => array_keys($cfg)];
$counts = function (PDO $p, string $drv): array {
    $t = [];
    $q = $drv === "mysql" ? "SHOW FULL TABLES WHERE Table_type = \"BASE TABLE\"" : "SELECT name FROM sqlite_master WHERE type=\"table\" AND name NOT LIKE \"sqlite_%\"";
    foreach ($p->query($q)->fetchAll(PDO::FETCH_NUM) as $r) {
        $n = $r[0]; $qn = $drv === "mysql" ? "`" . str_replace("`", "``", $n) . "`" : "\"" . str_replace("\"", "\"\"", $n) . "\"";
        $t[$n] = (int)$p->query("SELECT COUNT(*) FROM $qn")->fetchColumn();
    }
    ksort($t); return $t;
};
if (is_array($db) && str_starts_with((string)$db["dsn"], "mysql:")) {
    $man["driver"] = "mysql";
    $kv = []; foreach (explode(";", substr($db["dsn"], 6)) as $part) { if (str_contains($part, "=")) { [$k, $v] = explode("=", $part, 2); $kv[trim($k)] = trim($v); } }
    $pdo = new PDO($db["dsn"], (string)$db["user"], (string)$db["pass"], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec("SET NAMES utf8mb4");
    $man["tables"] = $counts($pdo, "mysql");
    $file = $out . "/mysql.sql";
    $ok = false;
    if ($dumper !== "") {
        $cmd = [$dumper, "--single-transaction", "--quick", "--no-tablespaces", "--skip-lock-tables", "--hex-blob",
                "--default-character-set=utf8mb4", "--skip-comments", "-u", (string)$db["user"]];
        if (isset($kv["host"]))   { $cmd[] = "-h"; $cmd[] = $kv["host"]; }
        if (isset($kv["port"]))   { $cmd[] = "-P"; $cmd[] = $kv["port"]; }
        if (isset($kv["unix_socket"])) { $cmd[] = "-S"; $cmd[] = $kv["unix_socket"]; }
        $cmd[] = $kv["dbname"];
        $env = getenv(); $env["MYSQL_PWD"] = (string)$db["pass"];
        $pr = proc_open($cmd, [0 => ["file", "/dev/null", "r"], 1 => ["file", $file, "w"], 2 => ["pipe", "w"]], $pipes, null, $env);
        $err = stream_get_contents($pipes[2]); fclose($pipes[2]);
        $rc = proc_close($pr);
        if ($rc === 0 && filesize($file) > 0) { $ok = true; $man["method"] = "mysqldump"; }
        else { fwrite(STDERR, "mysqldump код $rc: " . substr(preg_replace("/\s+/", " ", $err), 0, 300) . " — перехожу на PHP-дамп\n"); }
    }
    if (!$ok) {
        // запасной путь: SHOW CREATE TABLE + INSERT пачками по 200 строк
        $f = fopen($file, "w");
        fwrite($f, "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n");
        foreach (array_keys($man["tables"]) as $t) {
            $qt = "`" . str_replace("`", "``", $t) . "`";
            $ct = $pdo->query("SHOW CREATE TABLE $qt")->fetch(PDO::FETCH_NUM)[1];
            fwrite($f, "DROP TABLE IF EXISTS $qt;\n$ct;\n");
            $st = $pdo->query("SELECT * FROM $qt", PDO::FETCH_NUM); $buf = [];
            $cols = null;
            while ($r = $st->fetch(PDO::FETCH_NUM)) {
                $buf[] = "(" . implode(",", array_map(fn($v) => $v === null ? "NULL" : $pdo->quote((string)$v), $r)) . ")";
                if (count($buf) >= 200) { fwrite($f, "INSERT INTO $qt VALUES " . implode(",", $buf) . ";\n"); $buf = []; }
            }
            if ($buf) { fwrite($f, "INSERT INTO $qt VALUES " . implode(",", $buf) . ";\n"); }
        }
        fwrite($f, "SET FOREIGN_KEY_CHECKS=1;\n"); fclose($f);
        $man["method"] = "php-pdo";
    }
    $man["dump_bytes"] = filesize($file);
}
$sq = $priv . "/linea.sqlite";
if (is_file($sq) && extension_loaded("pdo_sqlite")) {
    if ($man["driver"] === "none") { $man["driver"] = "sqlite"; }
    $p = new PDO("sqlite:" . $sq, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $p->exec("VACUUM INTO " . $p->quote($out . "/linea.sqlite"));
    $man["sqlite_tables"] = $counts(new PDO("sqlite:" . $out . "/linea.sqlite"), "sqlite");
}
file_put_contents($out . "/manifest.json", json_encode($man, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
fwrite(STDERR, "база: " . $man["driver"] . " / " . ($man["method"] ?? "-") . ", таблиц " . count($man["tables"]) . ", строк " . array_sum($man["tables"]) . "\n");
'

# ---- файлы linea-private: список без служебного, большие файлы пропускаем и пишем в manifest ----
cd "$ROOT"
LIST="$TMP/files.lst"; BIG="$TMP/_dump/skipped-big.txt"
find "$PRIV_NAME" \( -path "$PRIV_NAME/sessions" -o -path "$PRIV_NAME/rate" -o -path "$PRIV_NAME/exports" -o -name '.linea-bk.*' \) -prune -o \
     -type f ! -name '*.lock' ! -name '*.tmp' ! -name '*.part' ! -name 'linea.sqlite' ! -name 'linea.sqlite-wal' ! -name 'linea.sqlite-shm' \
     -size -"$((MAXMB * 1024))"k -print0 > "$LIST"
find "$PRIV_NAME" \( -path "$PRIV_NAME/sessions" -o -path "$PRIV_NAME/rate" -o -path "$PRIV_NAME/exports" \) -prune -o -type f -size +"$((MAXMB * 1024 - 1))"k -print > "$BIG" || true
NF=$(tr -cd '\0' < "$LIST" | wc -c | tr -d ' ')
log "файлов linea-private: $NF; пропущено больших (>${MAXMB} МБ): $(wc -l < "$BIG" | tr -d ' ')"

# tar: один проход, имена «_dump/…» и «linea-private/…». Разные корни сводим ссылкой внутри временной папки
# (так работает и GNU tar Beget, и bsdtar мака): в списке только обычные файлы, рекурсии по ссылке нет.
ln -s "$PRIV" "$TMP/$PRIV_NAME"
ALL="$TMP/all.lst"
( cd "$TMP" && find _dump -type f -print0 ) > "$ALL"
cat "$LIST" >> "$ALL"
cd "$TMP"
$IONICE tar -czf - --null -T "$ALL"
log "готово"
