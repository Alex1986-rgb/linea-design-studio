#!/usr/bin/env node
'use strict';
/**
 * Страницы-переходы для GitHub Pages: старый адрес → тот же путь на дизайн-студия-квартир.рф.
 *
 *   node tools/gen-pages-redirect.js                 # → .deploy/pages-redirect/ (только собрать, ничего не применяет)
 *   node tools/gen-pages-redirect.js --out=/путь
 *
 * Зачем: у GitHub Pages нет серверного 301. Остаётся страница с мгновенным <meta http-equiv="refresh" content="0; url=…">
 * и <link rel="canonical"> на тот же путь на домене:
 *   • Google считает мгновенный meta refresh постоянным редиректом, межсайтовый canonical тоже учитывает;
 *   • Яндекс обрабатывает meta refresh как редирект (302), межхостовый canonical не учитывает — для него работает
 *     только переход. Подробно — docs/kb/pereezd-domena-vebmaster.md.
 *
 * Что собирает:
 *   • на каждую HTML-страницу site/ — страницу с тем же именем: <script> location.replace (сохраняет ?query и #якорь —
 *     ссылки «Правка к этому листу» из PDF альбомов идут на review.html?p=…&s=…), за ним meta refresh и canonical
 *     (для роботов), и видимая ссылка для тех, у кого не сработало;
 *   • …/index.html → адрес папки «…/» (как canonical сайта); служебное, которого на домене нет (_release.html,
 *     _dev-*.html), → папка, в которой оно лежало;
 *   • 404.html — переход для всего остального (PDF, листы SVG, картинки, удалённые страницы): Pages отдаёт её на любой
 *     неизвестный путь, скрипт снимает префикс /linea-design-studio и уводит на тот же путь домена;
 *   • .nojekyll (иначе Pages не отдаст файлы на «_»), redirects.tsv — таблица «старый → новый» для проверки.
 * Адреса — Punycode (SITE_BASES.domain), путь — percent-encoding по RFC 3986. Кириллица — только в видимом тексте.
 *
 * Как применить (после того как домен открылся по https) — НЕ этим скриптом: заменить содержимое site/ в ветке Pages
 * (или path в .github/workflows/pages.yml) на эту папку, push. Порядок — docs/kb/pereezd-domena-vebmaster.md.
 */

const fs = require('fs');
const path = require('path');
const SHELL = require('./site-shell.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'site');
const arg = k => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const OUT = path.resolve(arg('out') || path.join(ROOT, '.deploy', 'pages-redirect'));
const OLD = SHELL.SITE_BASES.pages;                         // https://alex1986-rgb.github.io/linea-design-studio
const NEW = SHELL.SITE_BASES.domain;                        // https://xn--…xn--p1ai
const PREFIX = new URL(OLD + '/').pathname.replace(/\/$/, ''); // /linea-design-studio
const RU = SHELL.SITE_DOMAIN_RU;

if (!/^https:\/\/[a-z0-9.-]+$/.test(NEW) || !NEW.includes('xn--')) { console.error(`адрес домена не Punycode: ${NEW}`); process.exit(2); }

// служебное, которое site-rebase на домен не выкладывает — переход в папку
const NOT_ON_DOMAIN = /(^|\/)(_dev-[^/]*\.html|_release\.html)$/;

const enc = rel => rel.split('/').map(s => encodeURIComponent(s)).join('/');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** site/<rel> → путь на домене (с ведущим «/»). */
function target(rel) {
  let r = rel;
  if (NOT_ON_DOMAIN.test(r)) r = r.replace(/[^/]*$/, '');
  else if (/(^|\/)index\.html$/.test(r)) r = r.replace(/index\.html$/, '');
  return '/' + enc(r);
}

function page(url, title) {
  const u = esc(url);
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — сайт переехал</title>
<script>location.replace(${JSON.stringify(url)} + location.search + location.hash)</script>
<meta http-equiv="refresh" content="0; url=${u}">
<link rel="canonical" href="${u}">
<style>body{font:17px/1.5 system-ui,sans-serif;max-width:36em;margin:15vh auto;padding:0 16px;color:#1a1a1a}a{color:#8f6b33}</style>
</head>
<body>
<p>Студия LINEA переехала на <b>${esc(RU)}</b>.</p>
<p><a href="${u}">Открыть эту страницу на новом адресе</a></p>
</body>
</html>
`;
}

function notFound() {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Сайт переехал — LINEA</title>
<meta name="robots" content="noindex">
<script>
(function () {
  var p = location.pathname.replace(/^${PREFIX.replace(/\//g, '\\/')}(?=\\/|$)/, '') || '/';
  location.replace(${JSON.stringify(NEW)} + p + location.search + location.hash);
})();
</script>
<style>body{font:17px/1.5 system-ui,sans-serif;max-width:36em;margin:15vh auto;padding:0 16px;color:#1a1a1a}a{color:#8f6b33}</style>
</head>
<body>
<p>Студия LINEA переехала на <b>${esc(RU)}</b>.</p>
<p><a href="${esc(NEW)}/">Перейти на главную</a></p>
</body>
</html>
`;
}

// 1. Список страниц
const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.html?$/i.test(e.name)) pages.push(path.relative(SRC, p).split(path.sep).join('/'));
  }
})(SRC);
pages.sort();

// 2. Сборка в чистую папку
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const rows = [['old', 'new']];
for (const rel of pages) {
  if (rel === '404.html') continue;                         // 404 — свой переход для любого пути
  const src = fs.readFileSync(path.join(SRC, rel), 'utf8');
  const m = src.match(/<title>([^<]*)<\/title>/i);
  const title = (m ? m[1] : 'LINEA').replace(/&[a-z#0-9]+;/gi, ' ').trim() || 'LINEA';
  const url = NEW + target(rel);
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, page(url, title));
  rows.push([OLD + '/' + enc(rel).replace(/(^|\/)index\.html$/, '$1'), url]);
}
fs.writeFileSync(path.join(OUT, '404.html'), notFound());
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
fs.writeFileSync(path.join(OUT, 'redirects.tsv'), rows.map(r => r.join('\t')).join('\n') + '\n');

// 3. Самопроверка: у каждой страницы переход и canonical на домен, ни одного старого адреса и кириллицы в href
const bad = [];
let n = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.html$/.test(e.name)) continue;
    const s = fs.readFileSync(p, 'utf8');
    const rel = path.relative(OUT, p);
    if (/github\.io|beget\.tech/.test(s)) bad.push(`${rel}: старый адрес`);
    for (const h of s.match(/(?:href|url)=["']?[^"'\s>]+/g) || []) if (/[^\x00-\x7f]/.test(h)) bad.push(`${rel}: не-ASCII в адресе ${h}`);
    if (e.name === '404.html' && rel === '404.html') { if (!s.includes(NEW)) bad.push('404.html: нет адреса домена'); continue; }
    n++;
    const ref = s.match(/<meta http-equiv="refresh" content="0; url=([^"]+)">/);
    const can = s.match(/<link rel="canonical" href="([^"]+)">/);
    if (!ref || !can) { bad.push(`${rel}: нет refresh или canonical`); continue; }
    if (!ref[1].startsWith(NEW + '/') || ref[1] !== can[1]) bad.push(`${rel}: refresh ${ref[1]} ≠ canonical ${can[1]}`);
  }
})(OUT);
const expect = pages.length - (pages.includes('404.html') ? 1 : 0);
if (n !== expect) bad.push(`страниц-переходов ${n}, а HTML в site/ ${expect}`);

console.log(`gen-pages-redirect: ${OLD} → ${NEW}\n  папка: ${OUT}\n  страниц-переходов: ${n} (+ 404.html на любой другой путь, .nojekyll, redirects.tsv)`);
if (bad.length) { console.error(`  ✗ ${bad.length} ошибок:\n    ` + bad.slice(0, 20).join('\n    ')); process.exit(1); }
console.log('  ✓ у каждой страницы refresh = canonical = тот же путь на домене; github.io / beget.tech — 0; адреса только ASCII');
