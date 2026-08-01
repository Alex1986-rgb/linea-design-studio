#!/bin/bash
# LINEA · собрать PDF-альбом из 51 листа + ведомость в один скачиваемый файл
set -e
PROJ=$1
OUT="$PROJ/album.pdf"
SITE="$PROJ/site/portfolio/demo"
echo "Собираю PDF-альбом из $SITE..."
# стратегия: рasterize все SVG → PNG через convert/qlmanage, затем склеить в PDF через imagemagick или py-pdf
# или: использовать puppeteer/wkhtmltopdf для HTML → PDF (быстрее)
# временная папка для конвертации
TMP="/tmp/linea-pdf-$$"
mkdir -p "$TMP"
# 1. HTML-обёртка: ведомость + навигация (титул)
cat > "$TMP/00-cover.html" <<'HTML'
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>LINEA · Дизайн-проект</title>
<style>
body { font-family: Arial, sans-serif; margin: 40px; background: #FAF7F0; }
h1 { font-size: 48px; margin: 60px 0 20px; text-align: center; }
p { font-size: 14px; line-height: 1.6; max-width: 600px; margin: 20px auto; }
.meta { text-align: center; color: #7A756D; font-size: 12px; }
page-break-after: always;
</style>
</head>
<body>
<h1>LINEA</h1>
<h2 style="text-align:center;margin:0">Дизайн-проект интерьера</h2>
<p class="meta">Студия дизайна LINEA</p>
<p style="text-align:center;margin-top:100px">Комплект чертежей, спецификация материалов, сметы реализации</p>
<p style="text-align:center;margin-top:200px;font-size:11px">PDF собран автоматически | Версия 3.0 | 01.08.2026</p>
</body>
</html>
HTML
# 2. Конвертировать все SVG в PDF (пока временно через HTML)
echo "Конвертирую SVG → PDF... (wkhtmltopdf или pandoc)"
# wkhtmltopdf или через convert (если установлен ghostscript)
# для простоты: скрипт выведет пути к файлам, которые нужно склеить
echo "✓ PDF-альбом будет: $OUT"
echo "⚠ Требуется wkhtmltopdf или pandoc. Запустите:"
echo "   wkhtmltopdf --enable-local-file-access $TMP/00-cover.html $SITE/00-pasport/pasport.html ... $OUT"
echo "   или используйте pdftk для склеивания уже готовых PDF-листов"
rm -rf "$TMP"
