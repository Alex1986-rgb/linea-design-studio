#!/usr/bin/env node
'use strict';
/**
 * Битые локальные ссылки и картинки по всему сайту (src / href / srcset / poster).
 *   node tools/check-links.js            # код 1, если есть битые
 *   node tools/check-links.js --quiet    # только итог
 * Не смотрит внутрь листов (portfolio/<slug>/sheets/*.svg), служебных листалок _release.html и dev-страниц.
 * Запускать после генераторов, перед touch-sitemap.js и коммитом. Появилось 06.11.2026: перевыпуск альбомов
 * сменил номера листов, а ~30 ссылок на них, вписанных в генераторы руками, тихо ушли в 404.
 */
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..', 'site');
const quiet = process.argv.includes('--quiet');
const SKIP_DIR = /(^|\/)(sheets|assets|node_modules)(\/|$)/;
const SKIP_FILE = /(^|\/)(_release|_dev-[^/]*)\.html$/;

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const abs = path.join(d, e.name), rel = path.relative(SITE, abs);
    if (e.isDirectory()) { if (!SKIP_DIR.test(rel)) walk(abs); }
    else if (e.name.endsWith('.html') && !SKIP_FILE.test(rel)) files.push(abs);
  }
})(SITE);

const exists = t => {
  try { const st = fs.statSync(t); return st.isDirectory() ? fs.existsSync(path.join(t, 'index.html')) : true; } catch { return false; }
};
const local = u => u && !/^(https?:|mailto:|tel:|#|data:|javascript:|\/\/|\$\{)/.test(u);
const target = (file, u) => {
  let p = u.split('#')[0].split('?')[0];
  try { p = decodeURIComponent(p); } catch { /* оставить как есть */ }
  if (!p) return null;
  return p.startsWith('/') ? path.join(SITE, p) : path.join(path.dirname(file), p);
};

let bad = 0;
const out = [];
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8').replace(/<script\b(?![^>]*\bsrc=)[\s\S]*?<\/script>/g, '');   // ссылки внутри кода скриптов не проверяем
  const urls = new Set();
  for (const m of s.matchAll(/\s(?:src|href|poster)=["']([^"']+)["']/g)) urls.add(m[1]);
  for (const m of s.matchAll(/\ssrcset=["']([^"']+)["']/g)) for (const part of m[1].split(',')) urls.add(part.trim().split(/\s+/)[0]);
  const broken = [...urls].filter(local).filter(u => { const t = target(f, u); return t && !exists(t); });
  if (broken.length) { bad += broken.length; out.push(`  ${path.relative(SITE, f)}: ${broken.length}\n${broken.slice(0, 8).map(u => `      ${u}`).join('\n')}`); }
}
if (!quiet && out.length) console.log(out.join('\n'));
console.log(`check-links: страниц ${files.length}, битых ссылок ${bad}`);
process.exit(bad ? 1 : 0);
