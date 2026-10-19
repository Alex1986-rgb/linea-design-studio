#!/bin/bash
# Переносит выпуски движка GOST-DRAFT на сайт: листы, служебную листалку выпуска и два PDF.
# Код движка не копируется — только результат, по которому генератор собирает страницы.
#   ./tools/sync-gost-releases.sh [путь-к-репозиторию-движка] [папка-с-PDF]
# PDF: <папка>/<объект>-full.pdf — полный альбом (album.pdf на сайте); <папка>/<объект>-studio.pdf или
# projects/<объект>/*-pocket.pdf движка — выпуск «студия» для заказчика (studio.pdf на сайте).
set -euo pipefail
G="${1:-$HOME/projects/gost-draft}"
PDF="${2:-}"
SITE="$(cd "$(dirname "$0")/.." && pwd)/site"
sync_one() {          # $1 — папка объекта в движке, $2 — слаг на сайте
  local src="$G/projects/$1/out" dst="$SITE/portfolio/$2"
  [ -d "$src/sheets" ] || { echo "нет выпуска: $src/sheets" >&2; return 1; }
  mkdir -p "$dst"
  rsync -a --delete "$src/sheets/" "$dst/sheets/"
  cp "$src/index.html" "$dst/_release.html"      # состав выпуска для генератора страниц
  # число правил проверки — из отчёта проверки выпуска, руками не пишем
  grep -m1 -o 'правил: [0-9]*' "$src/check.md" | grep -o '[0-9]*$' > "$dst/_rules.txt" || true
  if [ -n "$PDF" ] && [ -f "$PDF/$1-full.pdf" ]; then cp "$PDF/$1-full.pdf" "$dst/album.pdf"; fi
  local studio=""
  if [ -n "$PDF" ] && [ -f "$PDF/$1-studio.pdf" ]; then studio="$PDF/$1-studio.pdf"
  else studio="$(ls "$G/projects/$1/"*-pocket.pdf 2>/dev/null | head -1 || true)"; fi
  if [ -n "$studio" ]; then cp "$studio" "$dst/studio.pdf"; fi
  echo "  $2: листов $(ls "$dst/sheets" | wc -l | tr -d ' ')$( [ -f "$dst/album.pdf" ] && echo ', album.pdf')$( [ -f "$dst/studio.pdf" ] && echo ', studio.pdf')"
}
echo "Синхронизация выпусков из $G"
sync_one proekt-2 gost-proekt2
sync_one kv-3k gost-kv3k
sync_one kv-65 gost-kv65
sync_one kv-58 gost-kv58
sync_one modern-4k gost-modern4k
sync_one retro-103 gost-retro103
echo "Теперь: node tools/gen-gost-pages.js"
