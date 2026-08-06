#!/bin/bash
# ================================================================
# LINEA · ч/б альбом для печати на офисном лазернике
#   ./tools/album-mono.sh <brief.json> [выходной.pdf]
# Собирает проект в ч/б режиме во временную папку и печатает единый PDF.
# Цветной выпуск при этом не затрагивается: ч/б — отдельный файл для бригады.
# ================================================================
set -euo pipefail
BRIEF="${1:-examples/demo-brief.json}"
OUT="${2:-album-mono.pdf}"
[ -f "$BRIEF" ] || { echo "Нет брифа: $BRIEF" >&2; exit 1; }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "Собираю ч/б выпуск из $BRIEF…"
node engine/generate.js "$BRIEF" "$TMP/project" --mono >/dev/null
# рендеры в ч/б альбоме не нужны: бригаде важны листы, а не картинки
./tools/album.sh "$TMP/project" "$TMP/album-mono.pdf" >/dev/null
cp "$TMP/album-mono.pdf" "$OUT"
SIZE=$(du -h "$OUT" | cut -f1)
echo "✔ Ч/б альбом: $OUT · $SIZE"
