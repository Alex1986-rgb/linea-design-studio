#!/usr/bin/env node
'use strict';
/**
 * Копия сайта под другой адрес — для выкладки на Beget.
 *
 *   node tools/site-rebase.js --site=preview            # → .deploy/preview  (http://linea.aleks2si.beget.tech)
 *   node tools/site-rebase.js --site=domain             # → .deploy/domain   (https://дизайн-студия-квартир.рф)
 *   node tools/site-rebase.js --base=https://x.ru --out=/путь
 *
 * Зачем: папка site/ собрана под один адрес (сейчас GitHub Pages, сайт в подпапке /linea-design-studio/),
 * а адрес вшит в canonical, og:url, sitemap, robots и schema.org — и не только генераторами: статические
 * index.html / brief.html / review.html и старые демо-альбомы движка тоже несут его в разметке. Пересобирать
 * все генераторы ради каждой площадки долго и не воспроизводимо (они читают выпуски GOST-DRAFT), поэтому
 * выкладка берёт site/ как есть и в копии меняет адрес: любой из известных (SITE_BASES в site-shell.js) → целевой.
 *
 * Что ещё делает с копией:
 *   • robots.txt — у preview «Disallow: /» (технический адрес не должен попасть в индекс дублем);
 *     у остальных пути Disallow без подпапки /linea-design-studio/ (на своём домене сайт лежит в корне);
 *   • .htaccess для Apache на Beget — индекс index.html, своя 404, кодировка, кэш статики; preview — X-Robots-Tag
 *     noindex; домен — 301 на https и без www;
 *   • служебное GitHub Pages и стенды разработчика (.nojekyll, README-nojekyll.txt, _dev-*.html) не копирует.
 *
 * Сами site/ и git не трогает (кроме --in-place — переезд насовсем, его делает tools/switch-to-domain.sh). PDF не переписываются (бинарные): ссылки «Правка к этому листу» в альбомах
 * задаёт движок GOST-DRAFT — engine/work.js, REVIEW_BASE или meta.reviewBase в project.json.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const SHELL = require('./site-shell.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'site');

const arg = k => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const site = arg('site') || (arg('base') ? 'custom' : 'preview');
const base = String(arg('base') || SHELL.SITE_BASES[site] || '').replace(/\/+$/, '');
if (!base) { console.error(`Не знаю адрес для --site=${site} (есть: ${Object.keys(SHELL.SITE_BASES).join(', ')}) — или задайте --base=`); process.exit(2); }
// --in-place: переписать саму site/ (переезд насовсем: тогда и копия на GitHub Pages несёт canonical нового домена)
const inPlace = process.argv.includes('--in-place');
const out = inPlace ? SRC : path.resolve(arg('out') || path.join(ROOT, '.deploy', site));
if (inPlace && site === 'preview') { console.error('--in-place для технического адреса не нужен: site/ должна смотреть на основной адрес'); process.exit(2); }
const noindex = site === 'preview' || process.argv.includes('--noindex');
const httpsRedirect = /^https:/.test(base) && !process.argv.includes('--no-https-redirect');

// 1. Копия: rsync сам решает, что изменилось; --delete убирает из копии то, что ушло из site/.
// Служебное выпусков (_release.html, _rules.txt, _card.json, _renders.json) читают только генераторы при сборке — наружу не отдаём.
// /api/ — приёмник брифа и заказов из server/api (PHP только на Beget; в site/ его нет, чтобы GitHub Pages не публиковал исходники).
const EXCL = ['.DS_Store', '.nojekyll', 'README-nojekyll.txt', '_dev-*.html', '.htaccess', '.linea-deploy',
  '_release.html', '_rules.txt', '_card.json', '_renders.json', '/api/'];
const API_SRC = path.join(ROOT, 'server', 'api');
const withApi = !inPlace && site !== 'pages' && fs.existsSync(API_SRC) && !process.argv.includes('--no-api');
if (!inPlace) {
  fs.mkdirSync(out, { recursive: true });
  execFileSync('rsync', ['-a', '--delete', '--delete-excluded', ...EXCL.flatMap(e => ['--exclude', e]), SRC + '/', out + '/'], { stdio: 'inherit' });
  if (withApi) execFileSync('rsync', ['-a', '--delete', '--exclude', '.DS_Store', API_SRC + '/', path.join(out, 'api') + '/'], { stdio: 'inherit' });
}

// 2. Адрес: все известные площадки → целевая. Длинные первыми, чтобы не задеть префикс другой.
const from = [...new Set(Object.values(SHELL.SITE_BASES).concat(SHELL.BASE))].filter(b => b !== base).sort((a, b) => b.length - a.length);
const TEXT = /\.(html?|xml|txt|json|js|css|webmanifest)$/i;
let files = 0, hits = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!TEXT.test(e.name)) continue;
    const s = fs.readFileSync(p, 'utf8');
    if (!from.some(b => s.includes(b))) continue;
    let t = s, n = 0;
    for (const b of from) { const parts = t.split(b); n += parts.length - 1; t = parts.join(base); }
    // rsync -a сохранил время исходника; оставляем его, чтобы заливка не считала файл изменённым без причины
    const st = fs.statSync(p);
    fs.writeFileSync(p, t);
    fs.utimesSync(p, st.atime, st.mtime);
    files++; hits += n;
  }
})(out);

// 2б. Приёмник: страницам с отправкой говорим, где api (brief.js / review.js / order.js без меты работают по-старому — WhatsApp/почта)
const API_PAGES = ['brief.html', 'review.html', 'order.html'];
let apiPages = 0;
if (withApi) for (const f of API_PAGES) {
  const p = path.join(out, f);
  if (!fs.existsSync(p)) continue;
  const s = fs.readFileSync(p, 'utf8');
  if (s.includes('name="linea-api"')) continue;
  const st = fs.statSync(p);
  fs.writeFileSync(p, s.replace('</head>', '<meta name="linea-api" content="api/">\n</head>'));
  fs.utimesSync(p, st.atime, st.mtime);
  apiPages++;
}

// 3. robots.txt
const robotsPath = path.join(out, 'robots.txt');
let robots;
if (noindex) {
  robots = `# Технический адрес LINEA на Beget — закрыт от индекса (дубль основного сайта)\nUser-agent: *\nDisallow: /\n`;
} else {
  robots = fs.readFileSync(robotsPath, 'utf8');
  const sub = new URL(base + '/').pathname;                 // '/' на своём домене, '/linea-design-studio/' на Pages
  if (sub === '/') robots = robots.replace(/^(\s*(?:Dis)?allow:\s*)\/linea-design-studio\//gmi, '$1/')
    .replace(/^#.*github\.io.*$/gmi, '# csv-выгрузки смет — не для индекса');
}
fs.writeFileSync(robotsPath, robots);

// 4. .htaccess
const ht = [
  '# Собрано tools/site-rebase.js — руками на сервере не править, перезапишется при выкладке',
  'AddDefaultCharset UTF-8',
  'DirectoryIndex index.html',
  'ErrorDocument 404 /404.html',
  'Options -Indexes',
  'AddType image/svg+xml .svg',
  'AddType application/json .json',
  'AddType image/webp .webp',
  '',
  '# служебное выкладки и выпусков — не отдавать (данных заказов здесь нет: они в ../linea-private)',
  '<FilesMatch "^(\\.linea-deploy|_release\\.html|_rules\\.txt|_card\\.json|_renders\\.json)$">',
  '  <IfModule mod_authz_core.c>\n    Require all denied\n  </IfModule>',
  '</FilesMatch>',
  '',
  '<IfModule mod_rewrite.c>',
  '  RewriteEngine On',
  // Pages отдавал /index.html и /; одинаковые страницы под двумя адресами Apache тоже отдаст, это норма — canonical решает
  httpsRedirect ? '  RewriteCond %{HTTPS} off\n  RewriteCond %{HTTP:X-Forwarded-Proto} !https\n  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]' : '  # без SSL — редиректа на https нет',
  '  RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]',
  `  RewriteRule ^ ${httpsRedirect ? 'https' : 'http'}://%1%{REQUEST_URI} [R=301,L]`,
  // папка без слеша → со слешем; схему пишем сами: за nginx Apache считает соединение http (урок gorina.site)
  '  RewriteCond %{REQUEST_FILENAME} -d',
  '  RewriteCond %{REQUEST_URI} !/$',
  `  RewriteRule ^(.*)$ ${httpsRedirect ? 'https' : 'http'}://%{HTTP_HOST}/$1/ [R=301,L]`,
  '  DirectorySlash Off',
  '</IfModule>',
  '',
  '<IfModule mod_expires.c>',
  '  ExpiresActive On',
  '  ExpiresByType text/html "access plus 0 seconds"',
  '  ExpiresByType text/css "access plus 30 days"',
  '  ExpiresByType application/javascript "access plus 30 days"',
  '  ExpiresByType image/jpeg "access plus 30 days"',
  '  ExpiresByType image/png "access plus 30 days"',
  '  ExpiresByType image/webp "access plus 30 days"',
  '  ExpiresByType image/svg+xml "access plus 7 days"',
  '  ExpiresByType application/pdf "access plus 7 days"',
  '  ExpiresByType application/json "access plus 1 hours"',
  '</IfModule>',
  noindex ? '\n<IfModule mod_headers.c>\n  Header set X-Robots-Tag "noindex, nofollow"\n</IfModule>' : '',
  '',
].join('\n');
if (!inPlace) fs.writeFileSync(path.join(out, '.htaccess'), ht);

// 5. Итог и контроль: в текстах не должно остаться чужого адреса
const left = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (TEXT.test(e.name) && from.some(b => fs.readFileSync(p, 'utf8').includes(b))) left.push(path.relative(out, p));
  }
})(out);
console.log(`site-rebase: ${site} → ${base}\n  копия: ${out}\n  адрес заменён в ${files} файлах (${hits} вхождений), robots ${noindex ? 'закрыт' : 'открыт'}, .htaccess${httpsRedirect ? ' с 301 на https' : ''}`
  + (withApi ? `\n  приёмник: api/ из server/api, мета linea-api на ${apiPages} стр.` : ''));
if (left.length) { console.error(`  ✗ старый адрес остался в ${left.length} файлах: ${left.slice(0, 5).join(', ')}`); process.exit(1); }
