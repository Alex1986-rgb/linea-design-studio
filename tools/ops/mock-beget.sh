#!/usr/bin/env bash
# LINEA · макет боевого Beget для проверки бэкапа, пока сервер недоступен (только мак, всё во временной папке).
#
#   ./tools/ops/mock-beget.sh <папка> [--keep]
#
# Поднимает временную MariaDB (сокет в <папка>), создаёт базу по настоящим миграциям server/api/lib/migrations.php,
# кладёт тестовые строки, собирает <папка>/root/dizain-studiya-kvartir/linea-private (config.php с 'db' → эта MariaDB,
# заказы, журналы, sessions/ для проверки исключений) и прогоняет tools/ops/beget-dump.sh ровно так, как его гоняет ssh:
# результат — <папка>/mock-backup.tgz. Без --keep MariaDB останавливается в конце.
set -euo pipefail
W="${1:?папка для макета}"; KEEP="${2:-}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$W"; W="$(cd "$W" && pwd)"
DATA="$W/mariadb"; PORT="${MOCK_PORT:-33917}"; SOCK="m.sock"   # сокет относительный (в datadir): полный путь scratchpad длиннее 104 байт, клиент ходит по TCP
ROOT="$W/root/dizain-studiya-kvartir"; PRIV="$ROOT/linea-private"
say() { printf '\033[1m» %s\033[0m\n' "$*"; }

say "1/4 Временная MariaDB в $DATA"
if [ ! -d "$DATA/mysql" ]; then
  mariadb-install-db --datadir="$DATA" --auth-root-authentication-method=normal --skip-test-db >/dev/null 2>&1
fi
if ! mariadb --protocol=tcp -h 127.0.0.1 -P "$PORT" -uroot --skip-ssl -e 'select 1' >/dev/null 2>&1; then
  mariadbd --datadir="$DATA" --socket="$SOCK" --bind-address=127.0.0.1 --port="$PORT" --pid-file="$W/mariadb.pid" \
           --innodb-buffer-pool-size=16M --performance-schema=0 >"$W/mariadb.log" 2>&1 &
  for _ in $(seq 1 40); do mariadb --protocol=tcp -h 127.0.0.1 -P "$PORT" -uroot --skip-ssl -e 'select 1' >/dev/null 2>&1 && break; sleep 0.5; done
fi
mariadb --protocol=tcp -h 127.0.0.1 -P "$PORT" -uroot --skip-ssl -e "DROP DATABASE IF EXISTS mock_linea; CREATE DATABASE mock_linea CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS 'mock_linea'@'localhost' IDENTIFIED BY 'mock-pass-not-secret'; GRANT ALL ON mock_linea.* TO 'mock_linea'@'localhost';"

say "2/4 linea-private с config.php → эта база"
rm -rf "$ROOT"; mkdir -p "$PRIV"/{orders/LN-2611-0001,orders/LN-2611-0002,reviews,sessions,rate,exports,brigady}
cat > "$PRIV/config.php" <<PHP
<?php
return ['mode' => 'manual', 'notify_enabled' => false, 'notify_to' => '', 'mail_from' => '', 'tg_enabled' => false,
  'db' => ['dsn' => 'mysql:host=127.0.0.1;port=$PORT;dbname=mock_linea;charset=utf8mb4', 'user' => 'mock_linea', 'pass' => 'mock-pass-not-secret']];
PHP
php -r '$z = new ZipArchive; $z->open($argv[1], ZipArchive::CREATE); $z->addFromString("brief.json", "{\"test\":1}"); $z->addFromString("foto.bin", random_bytes(300000)); $z->close();' "$PRIV/orders/LN-2611-0001/brief.zip"
echo '{"order":"LN-2611-0002"}' > "$PRIV/orders/LN-2611-0002/brief.json"
echo 'review' > "$PRIV/reviews/r1.txt"; echo 'sess' > "$PRIV/sessions/s1"; echo 'rate' > "$PRIV/rate/x"; echo 'tmp' > "$PRIV/orders/x.tmp"
echo "$(date) журнал" > "$PRIV/brief.log"; touch "$PRIV/.migrate.lock"

say "3/4 Схема по migrations.php + тестовые строки"
LINEA_PRIVATE="$PRIV" php -r '
require $argv[1] . "/server/api/lib/boot.php"; require_once $argv[1] . "/server/api/lib/db.php";
db_migrate();
$now = date("Y-m-d H:i:s");
foreach (["orders","events","accounts","consents","settings"] as $t) {
  $cols = db()->query("SHOW COLUMNS FROM `$t`")->fetchAll(PDO::FETCH_ASSOC);
  for ($i = 1; $i <= 3; $i++) {
    $row = [];
    foreach ($cols as $c) {
      if (str_contains((string)$c["Extra"], "auto_increment")) continue;
      if ($c["Null"] === "YES" && $c["Key"] !== "PRI") continue;
      $ty = strtolower($c["Type"]);
      $row[$c["Field"]] = preg_match("/int|decimal|double|float/", $ty) ? $i : ($c["Key"] === "PRI" || $c["Key"] === "UNI" ? "$t-$i" : "тест $i $now");
    }
    db_insert($t, $row);
  }
}
echo "схема: " . db_val("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()") . " таблиц\n";
' "$REPO"

say "4/4 Прогон beget-dump.sh (как через ssh: bash -s со stdin)"
LINEA_ROOT="$ROOT" LINEA_PHP="$(command -v php)" bash -s < "$REPO/tools/ops/beget-dump.sh" > "$W/mock-backup.tgz"
ls -l "$W/mock-backup.tgz"
tar -tzf "$W/mock-backup.tgz" | sed 's/^/   /'

if [ "$KEEP" != "--keep" ]; then
  mariadb --protocol=tcp -h 127.0.0.1 -P "$PORT" -uroot --skip-ssl -e 'SHUTDOWN' 2>/dev/null || kill "$(cat "$W/mariadb.pid")" 2>/dev/null || true
  say "MariaDB макета остановлена (данные в $DATA — удаляются вместе с папкой)"
fi
