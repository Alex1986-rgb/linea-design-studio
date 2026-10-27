#!/usr/bin/env node
'use strict';
/**
 * Проставляет <lastmod> каждому адресу sitemap.xml по mtime соответствующего
 * файла. Запускать последним, после всех генераторов:
 *
 *   node tools/touch-sitemap.js
 *
 * Генераторы дописывают свои адреса без дат — так проще держать один формат;
 * дату честнее брать из файла, а не из момента генерации всего сайта.
 */

const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..', 'site');
// адрес сайта — только из site-shell.js; в sitemap могут остаться адреса прошлой площадки — снимаем любой из известных
const SHELL = require('./site-shell.js');
const BASES = [...new Set([SHELL.BASE, ...Object.values(SHELL.SITE_BASES)])].map(b => b + '/');
const smPath = path.join(SITE, 'sitemap.xml');

let sm = fs.readFileSync(smPath, 'utf8');
let touched = 0, missing = 0;
const dropped = [];

sm = sm.replace(/<url>([\s\S]*?)<\/url>/g, (block, inner) => {
  const loc = (inner.match(/<loc>([^<]+)<\/loc>/) || [])[1];
  if (!loc) return block;
  const b = BASES.find(x => loc.startsWith(x));
  if (!b) { missing++; return block; }
  let rel = loc.slice(b.length);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = path.join(SITE, rel);
  if (!fs.existsSync(file)) { missing++; return block; }
  // страница закрыта от индекса (архив первой версии, черновик оферты) — в sitemap ей не место
  if (/\.html?$/.test(rel) && /<meta name="robots" content="[^"]*noindex/i.test(fs.readFileSync(file, 'utf8'))) { dropped.push(rel); return ''; }
  const d = fs.statSync(file).mtime.toISOString().slice(0, 10);
  const cleaned = inner.replace(/<lastmod>[^<]*<\/lastmod>/, '');
  touched++;
  return `<url>${cleaned.replace('</loc>', `</loc><lastmod>${d}</lastmod>`)}</url>`;
});

sm = sm.replace(/\n[ \t]*(?=\n)/g, '');
fs.writeFileSync(smPath, sm);
console.log(`lastmod проставлен: ${touched} адресов${missing ? `, без файла: ${missing}` : ''}${dropped.length ? `; убраны страницы с noindex: ${dropped.join(', ')}` : ''}`);
