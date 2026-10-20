#!/bin/bash
# ================================================================
# LINEA · раскадровка hero главной из визуализаций проектов GOST-DRAFT
#   ./tools/make-frames.sh [путь-к-gost-draft] [ширина] [качество]
# По умолчанию: ~/projects/gost-draft, 1280 px, качество 55 (jpg) / 68 (webp).
# 11 кадров — история «дом изнутри»: прихожая → гостиные → кухня → лестница →
# кабинет → спальня → детская → ванная → весь дом сверху. Кадры взяты из пяти
# проектов нового формата, подпись называет проект. manifest.json читает скрипт
# hero на index.html (frames — webp, при ошибке он сам берёт jpg).
# ================================================================
set -euo pipefail
GD="${1:-$HOME/projects/gost-draft}"
W="${2:-1280}"
Q="${3:-55}"
OUT="site/assets/frames"
P="$GD/projects"
[ -d "$P" ] || { echo "Нет папки проектов $P" >&2; exit 1; }
command -v sips >/dev/null || { echo "Нужен sips (macOS)" >&2; exit 2; }
command -v cwebp >/dev/null || { echo "Нужен cwebp (brew install webp)" >&2; exit 2; }

# файл визуализации | помещение | подпись (проект)
LIST=(
  "modern-4k/renders/room-hall-wB.jpg|Прихожая|— квартира с кабинетом, модерн"
  "dom-331/renders/room-living-wC.jpg|Гостиная|— дом 331 м², шале"
  "linea-dom-120/renders/room-living-wA.jpg|Кухня-гостиная|— дом 120 м², средиземноморье"
  "retro-103/renders/room-living-wA.jpg|Гостиная со столовой|— квартира 103 м², ретро"
  "retro-103/renders/room-kitchen-wC.jpg|Кухня|— квартира 103 м², ретро"
  "linea-dom-120/renders/room-corridor1-wB.jpg|Лестница|— дом 120 м², средиземноморье"
  "retro-103/renders/room-study-wA.jpg|Кабинет|— квартира 103 м², ретро"
  "linea-demo/renders/room-bedroom-wD.jpg|Спальня|— квартира 56 м², джапанди"
  "linea-demo/renders/room-kids-wB.jpg|Детская|— квартира 56 м², джапанди"
  "modern-4k/renders/room-bath1-wB.jpg|Ванная|— квартира с кабинетом, модерн"
  "dom-331/renders/3d-top-et1.jpg|Весь дом|— первый этаж сверху: так он лежит в альбоме"
)

mkdir -p "$OUT"; rm -f "$OUT"/*.jpg "$OUT"/*.webp
i=0; frames=""; caps=""
for row in "${LIST[@]}"; do
  IFS='|' read -r rel room note <<< "$row"
  f="$P/$rel"
  [ -f "$f" ] || { echo "пропуск: нет $rel"; continue; }
  i=$((i+1)); nn=$(printf "%02d" $i)
  sips -Z "$W" -s format jpeg -s formatOptions "$Q" "$f" --out "$OUT/$nn.jpg" >/dev/null
  cwebp -quiet -q 68 -resize "$W" 0 "$f" -o "$OUT/$nn.webp"
  frames="$frames${frames:+,}\"$nn.webp\""
  caps="$caps${caps:+,}{\"room\":\"$room\",\"note\":\"$note\"}"
done

cat > "$OUT/manifest.json" <<JSON
{
  "base": "assets/frames/",
  "note": "Раскадровка hero: $i кадров ${W}px, качество $Q, визуализации проектов GOST-DRAFT. Пересобрать: ./tools/make-frames.sh",
  "frames": [$frames],
  "captions": [$caps]
}
JSON
echo "✔ кадров: $i · $(du -sh "$OUT" | cut -f1) · $OUT/manifest.json"
