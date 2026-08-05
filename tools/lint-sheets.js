#!/usr/bin/env node
'use strict';
// ================================================================
// LINEA · линтер выпущенных листов
// Проверяет то, что видно только на бумаге:
//   • кегль ниже 2,5 мм (ГОСТ 2.304) — на печати не читается
//   • перо тоньше 0,18 мм — на лазернике исчезает
//   • формат листа: 420×297 мм (A3 альбомный)
//   • штамп и масштаб в штампе присутствуют
//
//   node tools/lint-sheets.js site/portfolio/demo [--max=20]
// ================================================================
const fs = require('fs');
const path = require('path');

const PXMM = 1587 / 420;            // px листа на 1 мм бумаги
const MIN_TEXT_MM = 2.5, MIN_PEN_MM = 0.18;
const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith('--'));
const MAX = +((args.find(a => a.startsWith('--max=')) || '--max=20').split('=')[1]);
if (!dir) { console.error('Использование: node tools/lint-sheets.js <папка-проекта> [--max=N]'); process.exit(1); }

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)
    .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : (e.name.endsWith('.svg') ? [path.join(d, e.name)] : []));
}

const files = walk(dir);
if (!files.length) { console.error(`В ${dir} нет ни одного .svg`); process.exit(1); }

let bad = 0, shown = 0;
const totals = { text: 0, pen: 0, fmt: 0, stamp: 0 };

for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const issues = [];

  // формат: содержимое масштабируется группой scale(k) — бумажный размер = значение × k
  const mk = /<g transform="translate\([^)]*\) scale\(([\d.]+)\)"/.exec(s);
  const k = mk ? +mk[1] : 1;
  if (!/width="1587" height="1123"/.test(s)) { issues.push('формат листа не A3 420×297 мм'); totals.fmt++; }
  if (!/Наименование листа/.test(s)) { issues.push('нет штампа'); totals.stamp++; }
  else if (!/М 1:/.test(s)) { issues.push('в штампе нет масштаба'); totals.stamp++; }

  // Внутри масштабирующей группы единицы модельные (бумажный размер = значение × k),
  // снаружи (рамка, штамп, контрольный отрезок) — сразу бумажные. Границу ищем по
  // балансу <g>…</g>, иначе штамп попадёт в проверку с чужим коэффициентом.
  const inner = (() => {
    if (!mk) return '';
    const open = s.indexOf('>', s.indexOf('scale(')) + 1;
    let depth = 1, i = open;
    const re = /<g\b|<\/g>/g; re.lastIndex = open;
    let m2;
    while ((m2 = re.exec(s))) { depth += m2[0] === '</g>' ? -1 : 1; if (!depth) { i = m2.index; break; } }
    return s.slice(open, i);
  })();
  const smallText = [...inner.matchAll(/font-size="([\d.]+)"/g)].map(m => +m[1] * k / PXMM).filter(mm => mm < MIN_TEXT_MM - 0.01);
  const thinPen = [...inner.matchAll(/stroke-width="([\d.]+)"/g)].map(m => +m[1] * k / PXMM).filter(mm => mm < MIN_PEN_MM - 0.001);
  if (smallText.length) { issues.push(`кегль < ${MIN_TEXT_MM} мм: ${smallText.length} шт. (минимум ${Math.min(...smallText).toFixed(2)} мм)`); totals.text += smallText.length; }
  if (thinPen.length) { issues.push(`перо < ${MIN_PEN_MM} мм: ${thinPen.length} шт. (минимум ${Math.min(...thinPen).toFixed(3)} мм)`); totals.pen += thinPen.length; }

  if (issues.length) {
    bad++;
    if (shown++ < MAX) console.log(`✖ ${path.relative(dir, f)}\n    ${issues.join('\n    ')}`);
  }
}

if (shown > MAX) console.log(`… и ещё ${bad - MAX} листов с замечаниями`);
console.log(`\nПроверено листов: ${files.length}. С замечаниями: ${bad}.`);
if (bad) {
  console.log(`Мелкий кегль: ${totals.text} · тонкое перо: ${totals.pen} · формат: ${totals.fmt} · штамп: ${totals.stamp}`);
  process.exit(1);
}
console.log('Все листы держат формат A3, штамп, кегль ≥ 2,5 мм и перо ≥ 0,18 мм.');
