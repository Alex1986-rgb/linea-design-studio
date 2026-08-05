#!/bin/bash
# ================================================================
# LINEA · единый PDF-альбом из папки проекта
#   ./tools/album.sh site/portfolio/demo [album.pdf]
# Печатает print.html (титул → оглавление → документы → все листы A3)
# headless-браузером. Ревизия одна, файл один — бригаде нечего терять.
# ================================================================
set -euo pipefail

PROJ="${1:-}"
if [ -z "$PROJ" ] || [ ! -f "$PROJ/print.html" ]; then
  echo "Использование: ./tools/album.sh <папка-проекта> [выходной.pdf]" >&2
  echo "В папке должен быть print.html (создаётся движком: node engine/generate.js <brief> <папка>)" >&2
  exit 1
fi
OUT="${2:-$PROJ/album.pdf}"

CHROME=""
for c in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
  "$(command -v google-chrome || true)" \
  "$(command -v chromium || true)"; do
  if [ -n "$c" ] && [ -x "$c" ]; then CHROME="$c"; break; fi
done

if [ -z "$CHROME" ]; then
  echo "Не нашёл headless-браузер (Chrome/Chromium/Edge/Brave)." >&2
  echo "Открой $PROJ/print.html вручную и напечатай в PDF: A3, ландшафт, без полей, «Фон» включить." >&2
  exit 2
fi

ABS="$(cd "$(dirname "$PROJ/print.html")" && pwd)/print.html"
TMPDIR_C="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_C"' EXIT

echo "Печатаю альбом: $ABS"
"$CHROME" --headless=new --disable-gpu --no-sandbox \
  --user-data-dir="$TMPDIR_C" \
  --allow-file-access-from-files \
  --no-pdf-header-footer \
  --print-to-pdf-no-header \
  --virtual-time-budget=60000 \
  --print-to-pdf="$OUT" "file://$ABS" 2>/dev/null

if [ ! -s "$OUT" ]; then echo "PDF не собрался — проверь print.html в браузере." >&2; exit 3; fi

SIZE=$(du -h "$OUT" | cut -f1)
PAGES=$(python3 - "$OUT" <<'PY' 2>/dev/null || echo '?'
import re, sys
d = open(sys.argv[1], 'rb').read()
c = [int(x) for x in re.findall(rb'/Count\s+(\d+)', d)]
print(max(c) if c else len(re.findall(rb'/Type\s*/Page[^s]', d)))
PY
)
echo "✔ Альбом: $OUT · $SIZE · страниц $PAGES"
