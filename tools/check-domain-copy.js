#!/usr/bin/env node
'use strict';
/**
 * Проверка копии сайта под домен перед переездом (ничего не меняет, сети не трогает).
 *
 *   node tools/check-domain-copy.js                              # .deploy/domain (собрать: node tools/site-rebase.js --site=domain)
 *   node tools/check-domain-copy.js <папка> [--redirects=<redirects.tsv>] [--json=<итог.json>]
 *
 * Что проверяет:
 *   1. Ни в одном текстовом файле (html/xml/txt/json/js/css/php/.htaccess) нет github.io, beget.tech, alex1986-rgb
 *      и своего домена по http://.
 *   2. Каждая HTML-страница: canonical / og:url / og:image / адреса schema.org — на домене (Punycode, https); canonical
 *      ведёт на страницу, которая есть в копии; в машинных адресах нет кириллицы.
 *   3. Все ссылки и ресурсы страниц (href / src / srcset / action), относительные и абсолютные на домен, — на существующий файл.
 *   4. robots.txt: Sitemap на домене, сайт не закрыт целиком, путей без /linea-design-studio/.
 *   5. sitemap.xml: каждый <loc> на домене, файл есть, страница не noindex, её canonical = этот <loc>.
 *   6. .htaccess: 301 на https, нет X-Robots-Tag noindex (он только у технического адреса); приёмник api/ на месте.
 *   7. --redirects: каждый адрес из таблицы страниц-переходов GitHub Pages ведёт на существующую страницу копии.
 */

const fs = require('fs');
const path = require('path');
const SHELL = require('./site-shell.js');

const ROOT = path.join(__dirname, '..');
const arg = k => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const DIR = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(ROOT, '.deploy', 'domain'));
const NEW = SHELL.SITE_BASES.domain;
const HOST = new URL(NEW).host;
if (!fs.existsSync(DIR)) { console.error(`нет папки ${DIR} — соберите: node tools/site-rebase.js --site=domain`); process.exit(2); }

const errors = [];
const err = (kind, msg) => errors.push({ kind, msg });
const stat = { files: 0, text: 0, html: 0, links: 0, linksExternal: 0, canonical: 0, sitemap: 0, redirects: 0 };
const extHosts = {};

const rel = p => path.relative(DIR, p).split(path.sep).join('/');
const all = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else all.push(p);
  }
})(DIR);
stat.files = all.length;

/** путь на сайте («/a/b.html», «/a/») → файл в копии или null */
function local(sitePath) {
  let p;
  try { p = decodeURIComponent(sitePath.split(/[?#]/)[0]); } catch { return null; }
  const f = path.join(DIR, p);
  if (!f.startsWith(DIR)) return null;
  if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  const idx = path.join(f, 'index.html');
  return fs.existsSync(idx) ? idx : null;
}
const sitePathOf = file => '/' + rel(file).replace(/(^|\/)index\.html$/, '$1');

// 1. Чужие адреса во всех текстах
const TEXT = /\.(html?|xml|txt|json|js|css|webmanifest|php|tsv)$|^\.htaccess$/i;
const BAD = [[/github\.io/, 'github.io'], [/beget\.tech/, 'beget.tech'], [/alex1986-rgb/, 'alex1986-rgb'],
  [new RegExp('http://' + HOST.replace(/\./g, '\\.')), 'свой домен по http://'], [/дизайн-студия-квартир\.рф\/[^\s"'<]*\.(?:html|xml)/, 'кириллический домен в адресе']];
for (const f of all) {
  if (!TEXT.test(path.basename(f))) continue;
  stat.text++;
  const s = fs.readFileSync(f, 'utf8');
  for (const [re, name] of BAD) if (re.test(s)) err('старый адрес', `${rel(f)}: ${name}`);
}

// 2–3. Страницы
const ATTR = /\s(href|src|srcset|action|content|data-src)\s*=\s*("([^"]*)"|'([^']*)')/gi;
const pageMeta = {};
// серверные шаблоны (api/brigade/tpl/*.html: метки %%CANON%% и т. п. заполняет PHP) — не страницы, проверяются после подстановки
for (const f of all.filter(f => /\.html?$/i.test(f) && !/(^|\/)api\/brigade\/tpl\//.test(rel(f)))) {
  stat.html++;
  const s = fs.readFileSync(f, 'utf8');
  const r = rel(f);
  const head = (s.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
  const noindex = /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(head);
  const can = (head.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i) || [])[1] || null;
  pageMeta[sitePathOf(f)] = { noindex, can, file: r };
  if (can) {
    stat.canonical++;
    if (!can.startsWith(NEW + '/')) err('canonical', `${r}: canonical ${can}`);
    else if (!local(can.slice(NEW.length))) err('canonical', `${r}: canonical на страницу, которой нет в копии — ${can}`);
  } else if (!noindex && !/(^|\/)(404|order|review)\.html$/.test(r) && !r.startsWith('api/')) err('canonical', `${r}: нет canonical у индексируемой страницы`);
  for (const prop of ['og:url', 'og:image', 'twitter:image']) {
    const m = head.match(new RegExp(`<meta\\s+(?:property|name)="${prop}"\\s+content="([^"]+)"`, 'i'));
    if (m && /^https?:/.test(m[1]) && !m[1].startsWith(NEW + '/')) err('og', `${r}: ${prop} ${m[1]}`);
  }
  // schema.org: все абсолютные адреса своего сайта
  for (const ld of s.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi) || []) {
    for (const u of ld.match(/https?:\/\/[^"\s]+/g) || []) {
      const h = (() => { try { return new URL(u).host; } catch { return ''; } })();
      if (/xn--|дизайн|github|beget/i.test(u) && h !== HOST) err('schema', `${r}: ${u}`);
      if (h === HOST && !u.startsWith('https://')) err('schema', `${r}: ${u}`);
    }
  }
  // ссылки и ресурсы
  let m;
  ATTR.lastIndex = 0;
  while ((m = ATTR.exec(s))) {
    const name = m[1].toLowerCase();
    let v = (m[3] ?? m[4] ?? '').trim();
    if (name === 'content' && !/^(https?:)?\/\//.test(v)) continue;          // content у meta — только адреса
    const vals = name === 'srcset' ? v.split(',').map(x => x.trim().split(/\s+/)[0]) : [v];
    for (v of vals) {
      if (!v || /^(#|mailto:|tel:|javascript:|data:|sms:|whatsapp:|tg:|blob:|\{|\$\{)/i.test(v) || v.includes('${') || v.includes('{{')) continue;
      v = v.replace(/&amp;/g, '&');
      if (/^(https?:)?\/\//i.test(v)) {
        let u; try { u = new URL(v, NEW + '/'); } catch { err('ссылка', `${r}: кривой адрес ${v}`); continue; }
        if (/[^\x00-\x7f]/.test(u.host) || /[^\x00-\x7f]/.test(v.split('/').slice(0, 3).join('/'))) err('punycode', `${r}: кириллица в адресе ${v}`);
        if (u.host === HOST) {
          stat.links++;
          if (u.protocol !== 'https:') err('ссылка', `${r}: свой домен по http — ${v}`);
          if (!local(u.pathname)) err('битая', `${r}: ${v}`);
        } else { stat.linksExternal++; extHosts[u.host] = (extHosts[u.host] || 0) + 1; }
        continue;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(v)) continue;                            // другие схемы
      stat.links++;
      const base = '/' + rel(f);
      const u = new URL(v, 'https://x' + base.split('/').map(encodeURIComponent).join('/'));
      if (!local(u.pathname)) err('битая', `${r}: ${v}`);
    }
  }
}

// 4. robots.txt
const robotsF = path.join(DIR, 'robots.txt');
if (!fs.existsSync(robotsF)) err('robots', 'нет robots.txt');
else {
  const rb = fs.readFileSync(robotsF, 'utf8');
  if (!rb.split('\n').some(l => l.trim() === `Sitemap: ${NEW}/sitemap.xml`)) err('robots', `нет строки «Sitemap: ${NEW}/sitemap.xml»`);
  if (/^\s*Disallow:\s*\/\s*$/mi.test(rb)) err('robots', 'сайт закрыт целиком (Disallow: /)');
  if (/linea-design-studio/.test(rb)) err('robots', 'пути с /linea-design-studio/');
  if (/[^\x00-\x7f]/.test(rb.replace(/^#.*$/gm, ''))) err('robots', 'не-ASCII вне комментариев');
}

// 5. sitemap.xml
const smF = path.join(DIR, 'sitemap.xml');
if (!fs.existsSync(smF)) err('sitemap', 'нет sitemap.xml');
else for (const [, loc] of fs.readFileSync(smF, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
  stat.sitemap++;
  if (!loc.startsWith(NEW + '/')) { err('sitemap', `не на домене: ${loc}`); continue; }
  const f = local(loc.slice(NEW.length));
  if (!f) { err('sitemap', `нет файла: ${loc}`); continue; }
  const pm = pageMeta[sitePathOf(f)];
  if (pm && pm.noindex) err('sitemap', `noindex-страница в sitemap: ${loc}`);
  if (pm && pm.can && pm.can !== loc) err('sitemap', `canonical ${pm.can} ≠ loc ${loc}`);
}
if (stat.sitemap === 0) err('sitemap', 'в sitemap.xml нет ни одного <loc>');

// 6. .htaccess и приёмник
const htF = path.join(DIR, '.htaccess');
if (!fs.existsSync(htF)) err('htaccess', 'нет .htaccess');
else {
  const ht = fs.readFileSync(htF, 'utf8');
  if (!/RewriteRule \^ https:\/\/%\{HTTP_HOST\}%\{REQUEST_URI\} \[R=301,L\]/.test(ht)) err('htaccess', 'нет 301 на https');
  if (/X-Robots-Tag/.test(ht)) err('htaccess', 'X-Robots-Tag (noindex) — так только у технического адреса');
}
if (!fs.existsSync(path.join(DIR, 'api', 'pay-notify.php'))) err('api', 'нет api/pay-notify.php (вебхук ЮKassa)');
for (const p of ['brief.html', 'review.html', 'order.html'])
  if (fs.existsSync(path.join(DIR, p)) && !fs.readFileSync(path.join(DIR, p), 'utf8').includes('name="linea-api" content="api/"')) err('api', `${p}: нет меты linea-api`);

// 7. Таблица страниц-переходов
const rdF = arg('redirects');
if (rdF) {
  for (const line of fs.readFileSync(rdF, 'utf8').trim().split('\n').slice(1)) {
    const [, to] = line.split('\t');
    stat.redirects++;
    if (!to || !to.startsWith(NEW + '/')) err('переход', `не на домен: ${line}`);
    else if (!local(new URL(to).pathname)) err('переход', `ведёт на несуществующую страницу: ${line}`);
  }
}

// Итог
const byKind = errors.reduce((a, e) => (a[e.kind] = (a[e.kind] || 0) + 1, a), {});
const top = Object.entries(extHosts).sort((a, b) => b[1] - a[1]);
console.log(`check-domain-copy: ${DIR}\n  домен: ${NEW}`);
console.log(`  файлов ${stat.files}, текстовых ${stat.text}, страниц ${stat.html}, canonical ${stat.canonical}, ссылок на свой сайт ${stat.links}, внешних ${stat.linksExternal}`);
console.log(`  sitemap: ${stat.sitemap} адресов` + (rdF ? `; переходов GitHub Pages проверено: ${stat.redirects}` : ''));
console.log(`  внешние хосты: ${top.map(([h, n]) => `${h} ${n}`).join(', ') || 'нет'}`);
const json = arg('json');
if (json) fs.writeFileSync(json, JSON.stringify({ dir: DIR, base: NEW, stat, extHosts, errors }, null, 1));
if (errors.length) {
  console.error(`  ✗ ошибок: ${errors.length} (${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ')})`);
  for (const e of errors.slice(0, 30)) console.error(`    [${e.kind}] ${e.msg}`);
  process.exit(1);
}
console.log('  ✓ 0 ошибок: все адреса на домене (https, Punycode), github.io / beget.tech — 0, битых ссылок нет, robots и sitemap в порядке');
