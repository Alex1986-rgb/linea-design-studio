#!/usr/bin/env bash
# LINEA · снять бэкап данных с VPS SmartApe одной командой с мака (переезд с Beget, ноябрь 2026).
#
#   ./tools/ops/vps-dump.sh                      → .deploy/backups/linea-vps-ГГГГММДД-ЧЧММ.tar.gz
#   ./tools/ops/vps-dump.sh --out <файл.tar.gz>  → куда положить
#   ./tools/ops/vps-dump.sh --check              только готовность на VPS (php, mysqldump, config, сокет root) — без данных
#
# Как: tools/ops/beget-dump.sh уходит на VPS по stdin (ssh sm-vps, root; при VPN — в обход через en0) и выполняется там
# с LINEA_ROOT=/srv/beget/dizain-studiya-kvartir: дамп MariaDB aleks2si_linea под root через unix-сокет (без пароля сайта)
# + файлы linea-private → один tar.gz в stdout → файл на маке. На VPS ничего не остаётся (временная папка удаляется).
# Это ручной путь; ночной бэкап на SmartApe переключается на VPS через after-beget-up.sh --target=vps (ops.json source=vps).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="${VPS_SSH_HOST:-sm-vps}"
LROOT="${VPS_ROOT:-/srv/beget}/dizain-studiya-kvartir"
MODE=dump; OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE=check ;;
    --out) OUT="$2"; shift ;;
    --out=*) OUT="${1#--out=}" ;;
    -h|--help) awk 'NR>1 { if (/^#/) { sub(/^# ?/, ""); print } else exit }' "$0"; exit 0 ;;
    *) echo "Неизвестный ключ: $1 (см. --help)" >&2; exit 2 ;;
  esac
  shift
done
# VPN (маршрут через utun) рвёт соединение с SmartApe — идём напрямую через en0
BIND=()
case "$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')" in
  utun*|ppp*|ipsec*|tun*) ip=$(ipconfig getifaddr "${BEGET_BIND:-en0}" 2>/dev/null || true); [ -n "$ip" ] && BIND=(-b "$ip") ;;
esac
SSH=(ssh "${BIND[@]}" -o BatchMode=yes -o ConnectTimeout=25 -o ServerAliveInterval=15 -o ServerAliveCountMax=8 "$HOST")

if [ "$MODE" = check ]; then
  "${SSH[@]}" "LINEA_ROOT=$LROOT bash -s check" < "$REPO/tools/ops/beget-dump.sh"
  exit $?
fi

[ -n "$OUT" ] || { mkdir -p "$REPO/.deploy/backups"; OUT="$REPO/.deploy/backups/linea-vps-$(date +%Y%m%d-%H%M).tar.gz"; }
TMP="$OUT.part"; trap 'rm -f "$TMP"' EXIT
echo "VPS → $OUT (ssh $HOST, корень $LROOT)" >&2
"${SSH[@]}" "LINEA_ROOT=$LROOT nice -n 19 bash -s dump" < "$REPO/tools/ops/beget-dump.sh" > "$TMP"
# архив читается и в нём есть manifest и config.php — иначе это не бэкап
tar -tzf "$TMP" > /dev/null
tar -tzf "$TMP" | grep -q '^_dump/manifest.json$' || { echo "в архиве нет _dump/manifest.json" >&2; exit 1; }
tar -tzf "$TMP" | grep -q 'linea-private/config.php$' || { echo "в архиве нет linea-private/config.php" >&2; exit 1; }
mv -f "$TMP" "$OUT"; trap - EXIT
echo "готово: $OUT ($(du -h "$OUT" | cut -f1 | tr -d ' ')); база: $(tar -xzOf "$OUT" _dump/manifest.json | python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(d.get("driver"), d.get("method"), "таблиц", len(d.get("tables",{})), "строк", sum(d.get("tables",{}).values()))')" >&2
echo "в архиве — config.php с паролями базы и ключами: хранить как секрет, в репозиторий не класть (.deploy/ в .gitignore)" >&2
