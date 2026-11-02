#!/usr/bin/env bash
# LINEA · проверка восстановления последнего бэкапа (на маке, во временной папке, с удалением в конце).
#
#   ./tools/ops/restore-check.sh                         последний архив с SmartApe (расшифровывается там, по ssh приходит tar.gz)
#   ./tools/ops/restore-check.sh --tgz=<файл.tgz>        готовый tar.gz (макет)
#   ./tools/ops/restore-check.sh --local                 последний архив из LINEA_OPS_HOME на этом маке (макет)
#   ключи: --remote-home=<папка на SmartApe> (C:\\linea-ops), --work=<папка> (по умолчанию $LINEA_SCRATCH или $TMPDIR), --keep (не удалять), --port=33918
#
# Что проверяется:
#   1. архив читается, есть _dump/manifest.json;
#   2. дамп MySQL разворачивается во временную MariaDB (Homebrew), число строк КАЖДОЙ таблицы сверяется с manifest
#      (меньше, чем было при дампе, — ошибка; больше — предупреждение: дамп снят чуть позже подсчёта);
#      ключевые таблицы orders, accounts, events, consents, signatures, br_contracts обязаны быть;
#   3. копия SQLite (если есть) открывается и сходится по строкам;
#   4. config.php открывается PHP и возвращает массив с ключом mode (значения не печатаются);
#   5. каждый orders/*/brief.zip открывается как zip.
# Пароль архива с сервера на мак не попадает: расшифровка идёт на SmartApe, по ssh — уже tar.gz (канал шифрован).
# Размер: архив — сотни МБ максимум; на маке мало места — скрипт проверяет свободное место и всё удаляет за собой.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
TGZ=""; LOCAL=0; RHOME="C:\\linea-ops"; KEEP=0; PORT=33918; WORKBASE="${LINEA_SCRATCH:-${TMPDIR:-/tmp}}"
for a in "$@"; do case "$a" in
  --tgz=*) TGZ="${a#*=}";; --remote-home=*) RHOME="${a#*=}";; --local) LOCAL=1;; --keep) KEEP=1;; --port=*) PORT="${a#*=}";; --work=*) WORKBASE="${a#*=}";;
  *) echo "неизвестный ключ $a"; exit 2;; esac; done
W="$(mktemp -d "$WORKBASE/linea-restore.XXXXXX")"
ERR=0; WARN=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; ERR=$((ERR+1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; WARN=$((WARN+1)); }
SQL() { mariadb --protocol=tcp -h 127.0.0.1 -P "$PORT" -uroot --skip-ssl "$@"; }
cleanup() {
  SQL -e 'SHUTDOWN' >/dev/null 2>&1 || true
  sleep 1
  if [ "$KEEP" = 1 ]; then echo "папка оставлена: $W"; else rm -rf "$W"; fi
}
trap cleanup EXIT

FREE_MB=$(df -m "$WORKBASE" | awk 'NR==2{print $4}')
[ "$FREE_MB" -gt 800 ] || { echo "на диске $FREE_MB МБ — мало для проверки (нужно > 800)"; exit 3; }

echo "» 1. Архив"
if [ -n "$TGZ" ]; then cp "$TGZ" "$W/b.tgz"
elif [ "$LOCAL" = 1 ]; then node "$REPO/tools/ops/bk.mjs" cat-latest > "$W/b.tgz"
else ssh -o BatchMode=yes smartape-win "set LINEA_OPS_HOME=$RHOME&& node C:\\linea-ops\\tools\\bk.mjs cat-latest" > "$W/b.tgz"; fi
[ -s "$W/b.tgz" ] || { bad "архив пустой"; exit 1; }
mkdir "$W/x"; tar -xzf "$W/b.tgz" -C "$W/x" && rm -f "$W/b.tgz"
[ -f "$W/x/_dump/manifest.json" ] && ok "распакован, manifest есть ($(du -sh "$W/x" | cut -f1))" || { bad "нет manifest.json"; exit 1; }
MAN="$W/x/_dump/manifest.json"
DRIVER=$(php -r 'echo json_decode(file_get_contents($argv[1]), true)["driver"];' "$MAN")
echo "    снят: $(php -r 'echo json_decode(file_get_contents($argv[1]), true)["created"];' "$MAN"), база: $DRIVER"

# сверка «таблица → строк» из файла TSV с manifest; $1 — TSV, $2 — ключ manifest
compare() {
  php -r '
    $m = json_decode(file_get_contents($argv[1]), true)[$argv[3]] ?? [];
    $got = [];
    foreach (file($argv[2], FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $l) { [$t, $n] = explode("\t", $l); $got[$t] = (int)$n; }
    $e = 0; $w = 0;
    foreach ($m as $t => $n) {
      if (!array_key_exists($t, $got)) { echo "ERR таблицы $t нет после восстановления\n"; $e++; continue; }
      if ($got[$t] < $n) { echo "ERR $t: было $n, восстановлено {$got[$t]}\n"; $e++; }
      elseif ($got[$t] > $n) { echo "WARN $t: было $n, в дампе {$got[$t]} (записи появились во время дампа)\n"; $w++; }
    }
    $keys = $argv[3] === "tables" ? ["orders", "accounts", "events", "consents", "signatures", "br_contracts"] : ["orders"];
    foreach ($keys as $k) if (!array_key_exists($k, $got)) { echo "ERR нет ключевой таблицы $k\n"; $e++; }
    $show = array_intersect_key($got, array_flip(["orders","accounts","events","br_brigades","br_contracts","consents","signatures"]));
    echo "OK таблиц " . count($got) . ", строк " . array_sum($got) . "; " . implode(", ", array_map(fn($k, $v) => "$k $v", array_keys($show), $show)) . "\n";
  ' "$MAN" "$1" "$2" | while IFS= read -r l; do case "$l" in ERR*) echo "E ${l#ERR }";; WARN*) echo "W ${l#WARN }";; OK*) echo "O ${l#OK }";; esac; done
}
tally() { while IFS= read -r l; do case "$l" in E*) bad "${l#E }";; W*) warn "${l#W }";; O*) ok "${l#O }";; esac; done; }

if [ -f "$W/x/_dump/mysql.sql" ]; then
  echo "» 2. Дамп MySQL → временная MariaDB"
  mariadb-install-db --datadir="$W/db" --auth-root-authentication-method=normal --skip-test-db >/dev/null 2>&1
  mariadbd --datadir="$W/db" --socket=m.sock --bind-address=127.0.0.1 --port="$PORT" --pid-file="$W/db.pid" \
           --innodb-buffer-pool-size=32M --performance-schema=0 >"$W/db.log" 2>&1 &
  for _ in $(seq 1 60); do SQL -e 'select 1' >/dev/null 2>&1 && break; sleep 0.5; done
  SQL -e 'select 1' >/dev/null 2>&1 || { bad "MariaDB не поднялась (порт $PORT занят?)"; exit 1; }
  SQL -e 'CREATE DATABASE restore_check CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  if SQL restore_check < "$W/x/_dump/mysql.sql" 2>"$W/import.err"; then ok "дамп загружен ($(du -h "$W/x/_dump/mysql.sql" | cut -f1))"
  else bad "импорт упал: $(head -c 300 "$W/import.err")"; fi
  SQL -N -e "SELECT table_name FROM information_schema.tables WHERE table_schema='restore_check' AND table_type='BASE TABLE'" | while read -r t; do
    printf '%s\t%s\n' "$t" "$(SQL -N restore_check -e "SELECT COUNT(*) FROM \`$t\`")"; done > "$W/counts.tsv"
  compare "$W/counts.tsv" tables > "$W/cmp.txt"; tally < "$W/cmp.txt"
elif [ "$DRIVER" = mysql ]; then bad "драйвер mysql, а mysql.sql в архиве нет"; fi

if [ -f "$W/x/_dump/linea.sqlite" ]; then
  echo "» 3. Копия SQLite"
  if sqlite3 "$W/x/_dump/linea.sqlite" 'PRAGMA integrity_check' | grep -qx ok; then ok "integrity_check = ok"; else bad "SQLite битая"; fi
  sqlite3 "$W/x/_dump/linea.sqlite" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'" | while read -r t; do
    printf '%s\t%s\n' "$t" "$(sqlite3 "$W/x/_dump/linea.sqlite" "SELECT COUNT(*) FROM \"$t\"")"; done > "$W/scounts.tsv"
  compare "$W/scounts.tsv" sqlite_tables > "$W/scmp.txt"; tally < "$W/scmp.txt"
fi

echo "» 4. config.php"
CFGR=$(php -r '$c = @include $argv[1]; if (!is_array($c)) { echo "NOARRAY"; exit; } echo "keys=" . count($c) . " mode=" . (isset($c["mode"]) ? "есть" : "НЕТ") . " db=" . (is_array($c["db"] ?? null) ? "mysql" : "sqlite/нет") . " notify=" . (!empty($c["notify_enabled"]) ? "вкл" : "выкл");' "$W/x/linea-private/config.php" 2>&1 || true)
case "$CFGR" in keys=*"mode=есть"*) ok "открывается: $CFGR";; *) bad "config.php не открывается: $CFGR";; esac

echo "» 5. Файлы заказов"
NZ=0; BADZ=0
while IFS= read -r -d '' z; do NZ=$((NZ+1)); php -r '$z = new ZipArchive; exit($z->open($argv[1], ZipArchive::CHECKCONS) === true ? 0 : 1);' "$z" || { BADZ=$((BADZ+1)); bad "битый ${z#$W/x/}"; }; done \
  < <(find "$W/x/linea-private/orders" -name 'brief.zip' -print0 2>/dev/null)
NF=$(find "$W/x/linea-private" -type f | wc -l | tr -d ' ')
[ "$BADZ" = 0 ] && ok "файлов linea-private: $NF; brief.zip: $NZ, все открываются"

echo
if [ "$ERR" = 0 ]; then echo "ИТОГ: восстановление проходит (предупреждений: $WARN)"; else echo "ИТОГ: ОШИБОК $ERR, предупреждений $WARN"; fi
exit $([ "$ERR" = 0 ] && echo 0 || echo 1)
