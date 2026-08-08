#!/usr/bin/env node
'use strict';
/**
 * Синхронизация статических страниц с общим каркасом.
 *
 *   node tools/sync-static-nav.js            — переписать шапку и подвал
 *   node tools/sync-static-nav.js --check    — только проверить расхождения (код 1)
 *
 * index.html и brief.html не проходят через генераторы, поэтому их меню
 * разъезжалось с остальным сайтом. Здесь оно берётся из tools/site-shell.js —
 * того же источника, что и у генераторов.
 */

const fs = require('fs');
const path = require('path');
const SHELL = require('./site-shell.js');

const SITE = path.join(__dirname, '..', 'site');
const CHECK = process.argv.includes('--check');

// у главной в подвале дополнительно ссылка на альбом — она уместна и остаётся
const EXTRA = { 'index.html': ' · <a href="portfolio/demo/presentation.html">Альбом</a>' };

let drift = 0;
for (const file of ['index.html', 'brief.html']) {
  const p = path.join(SITE, file);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  let out = src;

  // шапку переносим целиком (вместе с бургером и мобильным оверлеем)
  const fullHeader = SHELL.header('', null);
  out = out.replace(/<header class="site">[\s\S]*?<\/header>(\n<div class="mnav"[\s\S]*?<\/div>)?/, fullHeader);
  // скрипт меню — перед </body>, если ещё не вставлен
  const menuJs = SHELL.footer('', null).match(/<script>[\s\S]*<\/script>/)[0];
  if (!/querySelector\('\.burger'\)/.test(out)) out = out.replace('</body>', menuJs + '\n</body>');

  // подвал: колонка ссылок (вторая), контакты автора не трогаем
  const links = SHELL.SECTIONS.map(s => `<a href="${s.href}">${s.title}</a>`)
    .concat(SHELL.FOOTER_EXTRA.map(s => `<a href="${s.href}">${s.title}</a>`)).join(' · ');
  const line = `<p><a href="brief.html">Бриф</a> · ${links}${EXTRA[file] || ''}</p>`;
  if (/<p><a href="brief\.html">Бриф<\/a>/.test(out)) {
    out = out.replace(/<p><a href="brief\.html">Бриф<\/a>[\s\S]*?<\/p>/, line);
  } else {
    // на брифе колонки ссылок не было вовсе — вставляем перед копирайтом
    out = out.replace(/<div>©\s*LINEA studio, 2026<\/div>/, `<div>${line}<p>© LINEA studio, 2026</p></div>`);
  }

  if (out !== src) {
    drift++;
    if (CHECK) console.log(`✖ ${file}: шапка или подвал разошлись с site-shell.js`);
    else { fs.writeFileSync(p, out); console.log(`↻ ${file}: шапка и подвал синхронизированы`); }
  } else {
    console.log(`✔ ${file}: совпадает с каркасом`);
  }
}

if (CHECK && drift) process.exit(1);
