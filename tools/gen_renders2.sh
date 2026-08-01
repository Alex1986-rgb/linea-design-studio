#!/bin/bash
# LINEA · второй пакет рендеров: 2–3 ракурса на каждую комнату (демо, джапанди)
set -e
OUT="$HOME/projects/linea-design-studio/site/portfolio/demo/06-koncept/renders"
mkdir -p "$OUT"
RG="$HOME/projects/router-gen/rgen.py"
BASE="photorealistic interior photograph, japandi style, warm white walls Little Greene Slaked Lime, oak herringbone engineered floor, warm hidden LED 3000K accents, soft diffused morning light through sheer linen curtains, shot on 28mm lens, eye level, two-point perspective, perfectly vertical lines, premium interior design studio portfolio, 8k, no people, no text, no watermark"

gen () {
  if [ ! -f "$OUT/$1.png" ] && [ ! -f "$OUT/$1.jpg" ]; then
    python3 "$RG" image "$2, $BASE" --size 1536x1024 --out "$OUT/$1.png" && echo "OK $1"
  else echo "SKIP $1"; fi
}

gen "01c-kuhnya-detail" "close detail view of minimalist oak kitchen with stone countertop and island, integrated appliances, backlit stone backsplash, bar stools, pendant light, two-level ceiling with hidden cove light"
gen "02b-spalnya-vid-ot-krovati" "bedroom 3.8x3.2 m seen from the bed towards built-in wardrobe with flush oak doors and window with sheer linen curtains in ceiling niche, floating dresser, soft wool rug"
gen "03b-detskaya-stol" "kids room detail: oak desk by the window with warm task lamp, open shelf niche with LED backlight and toys, sage green accents, single bed with linen bedding in background"
gen "04b-sanuzel-zerkalo" "bathroom detail: wall-hung oak vanity with stone basin, large round backlit mirror, warm stone-look porcelain tiles, LED niche shelf, spa towels"
gen "05b-prihozhaya-vhod" "entry hallway seen from the front door: oak slat wardrobe doors, illuminated bench niche, round backlit mirror, hidden ceiling light line, stone floor transitioning to oak herringbone"
echo "ALL_DONE"
