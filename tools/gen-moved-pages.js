#!/usr/bin/env node
'use strict';
/**
 * Заглушки на старых адресах страниц про дома (решение 06.11.2026: на сайте только квартиры).
 *   node tools/gen-moved-pages.js
 * Список «старый адрес → куда вести» — ТОЛЬКО site-shell.js → TERMS.moved. Пока TERMS.houses = true, ничего не делает.
 * Страница-заглушка: noindex (touch-sitemap.js выкинет её из sitemap), мгновенный переход и видимая ссылка.
 * Папки альбомов домов (листы, PDF) из site/ убираются — их можно вернуть из git или перевыпуском (sync-gost-releases.sh).
 */
const fs = require('fs');
const path = require('path');
const SHELL = require('./site-shell.js');

const SITE = path.join(__dirname, '..', 'site');
if (SHELL.TERMS.houses) { console.log('TERMS.houses = true — заглушки не нужны'); process.exit(0); }

const TITLES = {
  'catalog/dizayn-proekt-kvartiry.html': 'Дизайн-проект квартиры',
  'cases/': 'Кейсы',
  'portfolio-hub/': 'Портфолио',
};
// содержимое этих папок — альбомы домов; на сайте остаётся только заглушка index.html
const DROP_DIRS = ['portfolio/gost-dom331', 'portfolio/gost-dom120', 'portfolio/dom-120'];
for (const d of DROP_DIRS) {
  const abs = path.join(SITE, d);
  if (!fs.existsSync(abs)) continue;
  const rest = fs.readdirSync(abs, { recursive: true }).filter(f => !fs.statSync(path.join(abs, f)).isDirectory())
    .filter(f => !SHELL.TERMS.moved[`${d}/${f}`]);
  if (rest.length) { fs.rmSync(abs, { recursive: true, force: true }); console.log(`  убрана папка ${d}/ (${rest.length} файлов)`); }
}
let n = 0;
for (const [from, to] of Object.entries(SHELL.TERMS.moved)) {
  const depth = from.split('/').length - 1;
  const u = depth ? '../'.repeat(depth) : './';
  const f = path.join(SITE, from);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, SHELL.movedPage(u, to, TITLES[to] || 'LINEA'));
  n++;
}
// листы и картинки домов в общих папках ассетов больше не нужны страницам — не трогаем: на них могут ссылаться архивные отчёты
console.log(`заглушек: ${n}`);
