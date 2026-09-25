#!/bin/bash
# Переносит выпуски движка GOST-DRAFT на сайт: листы и служебную листалку выпуска.
# Код движка не копируется — только результат, по которому генератор собирает страницы.
#   ./tools/sync-gost-releases.sh [путь-к-репозиторию-движка]
set -euo pipefail
G="${1:-$HOME/projects/gost-draft}"
SITE="$(cd "$(dirname "$0")/.." && pwd)/site"
sync_one() {          # $1 — папка объекта в движке, $2 — слаг на сайте
  local src="$G/projects/$1/out" dst="$SITE/portfolio/$2"
  [ -d "$src/sheets" ] || { echo "нет выпуска: $src/sheets" >&2; return 1; }
  mkdir -p "$dst"
  rsync -a --delete "$src/sheets/" "$dst/sheets/"
  cp "$src/index.html" "$dst/_release.html"      # состав выпуска для генератора страниц
  echo "  $2: листов $(ls "$dst/sheets" | wc -l | tr -d ' ')"
}
echo "Синхронизация выпусков из $G"
sync_one proekt-2 gost-proekt2
sync_one kv-3k gost-kv3k
echo "Теперь: node tools/gen-gost-pages.js"
