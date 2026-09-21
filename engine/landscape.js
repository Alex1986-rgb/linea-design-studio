#!/usr/bin/env node
'use strict';
// ================================================================
// LINEA · генератор ландшафтного проекта
// Вход:  brief.json (метры) → Выход: папка альбома (SVG-листы A3 + документы)
// Запуск: node engine/landscape.js <brief.json> <папка-вывода> [--date=ДД.ММ.ГГГГ] [--mono]
//
// Система координат участка: X — поперёк (0 — северная граница), Y — вглубь от улицы.
// На листе: север сверху, улица справа, глубина участка влево.
// ================================================================
const fs = require('fs');
const path = require('path');
const P = require('./paper');
const draw = require('./land-draw');
const docs = require('./land-docs');

const FLAGS = {}, POS = [];
for (const a of process.argv.slice(2)) {
  const m = /^--([a-z][a-z-]*)(?:=(.*))?$/.exec(a);
  if (m) FLAGS[m[1]] = m[2] === undefined ? true : m[2]; else POS.push(a);
}
if (!POS[0]) { console.error('Использование: node engine/landscape.js <brief.json> <папка-вывода> [--date=ДД.ММ.ГГГГ] [--mono]'); process.exit(1); }
const brief = JSON.parse(fs.readFileSync(POS[0], 'utf8'));
const outDir = POS[1] || path.join('output', 'landscape');
const DATE = (typeof FLAGS.date === 'string' && FLAGS.date) || brief.meta.issueDate || new Date().toLocaleDateString('ru-RU');

const AUTHOR = {
  name: 'Кырлан Александр',
  short: 'Кырлан А.',
  role: 'ландшафтный архитектор',
  phone: '+7 925 733-86-40',
  tel: '+79257338640',
  email: 'optteem@mail.ru'
};

// ---------------- модель участка ----------------
const S = P.S;
const SITE = { w: brief.site.width, d: brief.site.depth, area: brief.site.area };

// координаты участка → координаты листа
const px = y => +((SITE.d - y) * S).toFixed(2);
const py = x => +(x * S).toFixed(2);
// прямоугольник участка {x, y, w, d} → бумажный {x, y, width, height}
function box(o) {
  return {
    x: px(o.y + (o.d || 0)), y: py(o.x),
    w: +((o.d || 0) * S).toFixed(2), h: +((o.w || 0) * S).toFixed(2)
  };
}
const M = {
  S, SITE, px, py, box,
  // центр прямоугольника на листе
  cen: o => [px(o.y + (o.d || 0) / 2), py(o.x + (o.w || 0) / 2)],
  pt: (x, y) => [px(y), py(x)],
  len: v => +(v * S).toFixed(2),
  brief
};

// ---------------- состав альбома ----------------
// Каждый лист: { file, name, type, render(sheetNo) } — папка и порядок фиксированы.
const SHEETS = draw.sheets(M, P);

P.setup({
  author: AUTHOR,
  object: {
    address: brief.meta.address,
    type: 'участок',
    area: SITE.area,
    sub: 'ландшафтный проект',
    stage: brief.meta.stage || 'РП'
  },
  date: DATE,
  total: SHEETS.length,
  mono: !!FLAGS.mono
});

// ---------------- выпуск ----------------
fs.rmSync(outDir, { recursive: true, force: true });
const files = [];
// первый проход: узнаём фактические масштабы, чтобы ведомость на титуле не врала
SHEETS.forEach((sh, i) => {
  if (sh.type === 'title') return;
  const r0 = sh.render(i + 1, SHEETS);
  const spec0 = typeof r0 === 'string' ? { body: r0 } : r0;
  const svg0 = P.sheet(Object.assign({ no: i + 1, name: sh.name, type: sh.type, series: sh.series, fixed: sh.fixed }, spec0));
  const m0 = /data-scale="1:(\d+)"/.exec(svg0);
  sh.scaleHint = (spec0.series === 'none' || sh.series === 'none') ? '—' : (m0 ? '1:' + m0[1] : sh.scaleHint);
});
SHEETS.forEach((sh, i) => {
  const no = i + 1;
  const r = sh.render(no, SHEETS);
  const spec = typeof r === 'string' ? { body: r } : r;
  const svg = P.sheet(Object.assign({ no, name: sh.name, type: sh.type, series: sh.series, fixed: sh.fixed }, spec));
  const rel = path.join(sh.dir, `${String(no).padStart(2, '0')}-${sh.file}.svg`);
  const abs = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, svg);
  files.push(rel);
  const ratio = (svg.match(/data-scale="1:(\d+)"/) || [])[1];
  console.log(`  лист ${String(no).padStart(2, ' ')} · М 1:${ratio} · ${sh.name}`);
});

// ---------------- документы ----------------
const htmlFiles = docs.build({ M, P, brief, author: AUTHOR, date: DATE, sheets: SHEETS, outDir });
htmlFiles.forEach(f => files.push(f));

// ---------------- входы в альбом ----------------
const entries = docs.entries({ M, P, brief, author: AUTHOR, date: DATE, sheets: SHEETS, files, outDir });
entries.forEach(f => files.push(f));

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({
  generated: DATE,
  kind: 'landscape',
  object: brief.meta.address,
  siteArea: SITE.area,
  sheets: SHEETS.length,
  files
}, null, 2));

console.log(`\nАльбом собран: ${outDir}`);
console.log(`Листов: ${SHEETS.length} · документов: ${htmlFiles.length} · всего файлов: ${files.length + 1}`);
