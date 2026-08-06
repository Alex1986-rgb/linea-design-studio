#!/bin/bash
# ================================================================
# LINEA · раскадровка hero сайта из визуализаций проекта
#   ./tools/make-frames.sh [папка-проекта] [ширина] [качество]
# По умолчанию: site/portfolio/demo, 1280 px, качество 55 —
# 11 кадров примерно по 100–140 КБ вместо рендеров по 1,5 МБ.
# Порядок кадров = проход по квартире; подписи пишутся в manifest.json,
# его читает скрипт hero на index.html.
# ================================================================
set -euo pipefail
PROJ="${1:-site/portfolio/demo}"
W="${2:-1280}"
Q="${3:-55}"
SRC="$PROJ/06-koncept/renders"
OUT="site/assets/frames"
[ -d "$SRC" ] || { echo "Нет визуализаций в $SRC" >&2; exit 1; }
command -v sips >/dev/null || { echo "Нужен sips (macOS)" >&2; exit 2; }

# порядок тура: вход → общая зона → приватные → мокрая зона → финал
ORDER=(05-prihozhaya 01-gostinaya-kuhnya 01b-gostinaya-stolovaya 01c-kuhnya-detail \
       02-spalnya 02b-spalnya-vid-ot-krovati 03-detskaya 03b-detskaya-stol \
       04-sanuzel 04b-sanuzel-zerkalo 05b-prihozhaya-vhod)
CAPS=("Прихожая|— вход, зона хранения" \
      "Гостиная-кухня|— единое пространство" \
      "Обеденная зона|— граница зон держится светом" \
      "Кухня|— фронт гарнитура, фартук с подсветкой" \
      "Спальня|— изголовье к стене без окна" \
      "Спальня|— вид от кровати" \
      "Детская|— сон, работа, игра" \
      "Рабочее место|— у окна, свет слева" \
      "Санузел|— мокрая зона, отметка −0,020" \
      "Санузел|— зеркало с подсветкой" \
      "Готово|— альбом можно отдавать бригаде")

mkdir -p "$OUT"; rm -f "$OUT"/*.jpg
i=0; frames=""; caps=""
for name in "${ORDER[@]}"; do
  f="$SRC/$name.jpg"
  [ -f "$f" ] || { echo "пропуск: нет $name.jpg"; continue; }
  i=$((i+1)); nn=$(printf "%02d" $i)
  sips -Z "$W" -s format jpeg -s formatOptions "$Q" "$f" --out "$OUT/$nn.jpg" >/dev/null
  room="${CAPS[$((i-1))]%%|*}"; note="${CAPS[$((i-1))]#*|}"
  frames="$frames${frames:+,}\"$nn.jpg\""
  caps="$caps${caps:+,}{\"room\":\"$room\",\"note\":\"$note\"}"
done

cat > "$OUT/manifest.json" <<JSON
{
  "base": "assets/frames/",
  "note": "Раскадровка hero: $i кадров ${W}px, качество $Q. Пересобрать: ./tools/make-frames.sh",
  "frames": [$frames],
  "captions": [$caps]
}
JSON
echo "✔ кадров: $i · $(du -sh "$OUT" | cut -f1) · $OUT/manifest.json"
