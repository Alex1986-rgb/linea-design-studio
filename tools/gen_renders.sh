#!/bin/bash
# LINEA · серия консистентных рендеров демо-проекта (джапанди) через router-gen
set -e
OUT="$HOME/projects/linea-design-studio/site/portfolio/demo/06-koncept/renders"
mkdir -p "$OUT"
RG="$HOME/projects/router-gen/rgen.py"
BASE="photorealistic interior photograph, japandi style, warm white walls Little Greene Slaked Lime, oak herringbone engineered floor, warm hidden LED 3000K accents, soft morning daylight, sheer linen curtains in ceiling niche, shot on 28mm lens, eye level, premium interior design studio portfolio, 8k, no people, no text, no watermark"

gen () { # $1=file $2=prompt
  if [ ! -f "$OUT/$1.png" ]; then
    python3 "$RG" image "$2, $BASE" --size 1536x1024 --out "$OUT/$1.png" && echo "OK $1"
  else echo "SKIP $1"; fi
}

gen "02-spalnya" "bedroom 3.8x3.2 m, oak platform bed 1600 with beige linen bedding, full-width plaster niche behind headboard with warm LED backlight, floating oak nightstands with small lamps, built-in wardrobe with flush doors, two-level ceiling with hidden cove lighting"
gen "03-detskaya" "kids room for a 6 year old, single bed 900 with linen bedding, oak desk by the window, sage green and oak accents, open shelf niche with warm backlight, soft wool rug, playful but calm japandi mood"
gen "04-sanuzel" "compact bathroom 2.2x1.8 m, large-format warm stone-look porcelain tiles, built-in bathtub 1700, long wall niche shelf with LED backlight above bathtub, wall-hung oak vanity with stone basin, round backlit mirror, warm spa atmosphere, two-level moisture-proof ceiling"
gen "05-prihozhaya" "entry hallway 3.0x1.6 m, built-in floor-to-ceiling wardrobe with oak slat doors, bench in illuminated niche, large round backlit mirror, hidden ceiling light line, stone-look porcelain floor transitioning to oak herringbone"
gen "01b-gostinaya-stolovaya" "open plan living kitchen 5.2x4.0 m, view from the sofa towards light oak dining table with four chairs and minimalist kitchen with stone island, pendant light over the table, three-level ceiling with floating backlit island above living zone"

# ── аэровид: квартира сверху без потолка, square 1:1 ──
gen_sq () { # $1=filename-with-ext  $2=prompt
  if [ ! -f "$OUT/$1" ]; then
    python3 "$RG" image "$2" --size 1024x1024 --out "$OUT/$1" && echo "OK $1"
  else echo "SKIP $1"; fi
}
gen_sq "00-aerial-view.jpg" "Фотореалистичная 3D-визуализация с высоты птичьего полёта: квартира вид сверху без потолка, меблированная, стиль джапанди. Видно все комнаты: гостиная-кухня с кухонным гарнитуром и обеденным столом, спальня с кроватью, детская, ванная. Пол — паркет ёлкой, мебель светлая натуральная, освещение — тёплое скрытое. Фотографический реализм, широкоугольная перспектива сверху 60°, квадратный формат 1:1, japandi style, warm LED 3000K, no people, no text, no watermark, 8k"
echo "ALL_DONE"
