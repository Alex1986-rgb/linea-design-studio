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

  const nav = SHELL.header('', null).match(/<nav class="links">[\s\S]*?<\/nav>/)[0];
  out = out.replace(/<nav class="links">[\s\S]*?<\/nav>/, nav.replace(/\n\s{4}/g, '\n    '));

  // подвал: колонка ссылок (вторая), контакты автора не трогаем
  const links = SHELL.SECTIONS.map(s => `<a href="${s.href}">${s.title}</a>`).join(' · ');
  const line = `<p><a href="brief.html">Бриф</a> · ${links}${EXTRA[file] || ''}</p>`;
  out = out.replace(/<p><a href="brief\.html">Бриф<\/a>[\s\S]*?<\/p>/, line);

  if (out !== src) {
    drift++;
    if (CHECK) console.log(`✖ ${file}: шапка или подвал разошлись с site-shell.js`);
    else { fs.writeFileSync(p, out); console.log(`↻ ${file}: шапка и подвал синхронизированы`); }
  } else {
    console.log(`✔ ${file}: совпадает с каркасом`);
  }
}

if (CHECK && drift) process.exit(1);
