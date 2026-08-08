#!/bin/bash
# WebP-версии всех контентных JPG (рендеры проектов + hero).
# Кладёт .webp рядом с .jpg; вёрстка подключает их через SHELL.pic().
set -e
n=0
for f in site/portfolio/*/06-koncept/renders/*.jpg site/portfolio/*/06-koncept/renders/thumbs/*.jpg site/assets/hero.jpg; do
  [ -f "$f" ] || continue
  out="${f%.jpg}.webp"
  if [ ! -f "$out" ] || [ "$f" -nt "$out" ]; then
    cwebp -quiet -q 74 -m 6 "$f" -o "$out"
    n=$((n+1))
  fi
done
echo "webp обновлено: $n"
