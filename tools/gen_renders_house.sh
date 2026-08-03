#!/bin/bash
# LINEA · рендеры демо-дома 120 м² (современный стиль)
set -e
OUT="$HOME/projects/linea-design-studio/site/portfolio/dom-120/06-koncept/renders"
mkdir -p "$OUT"
RG="$HOME/projects/router-gen/rgen.py"
BASE="photorealistic interior photograph of a two-storey private house interior, modern warm minimalism, warm graphite and smoked oak, brass details, matte finishes, track lighting and hidden LED 3000K, large windows with sheer curtains, soft daylight, 28mm lens, eye level, two-point perspective, premium interior design studio portfolio, 8k, no people, no text, no watermark"
gen () {
  if [ ! -f "$OUT/$1.png" ] && [ ! -f "$OUT/$1.jpg" ]; then
    python3 "$RG" image "$2, $BASE" --size 1536x1024 --out "$OUT/$1.png" && echo "OK $1"
  else echo "SKIP $1"; fi
}
gen "02-gostinaya-kuhnya" "open plan living room and kitchen 6.4x5 m in a house, smoked oak kitchen with island and stone worktop, deep sofa, dining table for six, panoramic window"
gen "03-kabinet" "home office 3.4x3 m, built-in oak desk and shelving, leather chair, warm task lighting, dark accent wall"
gen "01-prihozhaya" "entrance hall of a private house, built-in wardrobe with oak slat doors, bench with hidden lighting, large mirror, stone floor"
gen "05-holl-lestnica" "hall with a straight oak staircase, metal railing with vertical balusters, warm wall lighting along the flight, double-height space"
gen "06-spalnya" "master bedroom 4.4x4 m, upholstered headboard with backlit niche, bedside tables, wardrobe with flush doors, warm evening light"
gen "07-detskaya" "kids room 3.8x3.4 m, oak bed, desk by the window, open shelving with soft toys, sage accents"
gen "09-sanuzel" "bathroom of a private house, stone-look large format porcelain, wall-hung oak vanity, backlit round mirror, walk-in shower"
echo ALL_DONE
