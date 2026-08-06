#!/usr/bin/env node
'use strict';
// ================================================================
// LINEA · аудит альбома по канону (docs/cad-canon.md)
//
// Линтер (tools/lint-sheets.js) проверяет бумагу: формат, кегль, перо.
// Этот аудит проверяет СОДЕРЖАНИЕ листа: есть ли на нём то, без чего
// подрядчик не сможет работать — цепочки размеров, отметки уровня,
// привязки, легенда, спецификация, примечания, допустимый масштаб.
//
// Тип листа движок пишет в data-sheet корня SVG, смысловые блоки —
// в data-el. Плюс текстовые детекторы: отметки «+2,700», привязки «h=»,
// сумма сегментов цепочки против габарита.
//
//   node tools/audit-sheets.js site/portfolio/demo
//   node tools/audit-sheets.js site/portfolio/demo --type=elevation --max=5
//   node tools/audit-sheets.js site/portfolio/demo --json
// ================================================================
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith('--'));
const flag = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const MAX = +flag('max', 12);
const ONLY = flag('type', null);
const JSONOUT = args.includes('--json');
if (!dir) { console.error('Использование: node tools/audit-sheets.js <папка-проекта> [--type=elevation] [--max=N] [--json]'); process.exit(1); }

// ---------- канон: масштабные ряды ----------
const SCALES_PLAN = [20, 25, 40, 50, 100, 200];
const SCALES_NODE = [5, 10, 20];

// ---------- канон: требования по типам листов ----------
// need: обязательные метки data-el (или текстовые детекторы) с минимальным количеством
// want: желательные — попадают в отчёт как замечания, не как ошибки
const RULES = {
  obmer:            { need: { chain: 2, legend: 1, notes: 1, stamp: 1, level: 0, room: 1 }, want: { dim: 4 }, scales: SCALES_PLAN, sum: true },
  'obmer-room':     { need: { chain: 2, stamp: 1 }, want: { notes: 1 }, scales: SCALES_PLAN, sum: true },
  demolition:       { need: { legend: 1, notes: 1, stamp: 1 }, want: { chain: 1 }, scales: SCALES_PLAN },
  'demolition-room': { need: { stamp: 1 }, want: { legend: 1 }, scales: SCALES_PLAN },
  montage:          { need: { legend: 1, notes: 1, stamp: 1 }, want: { chain: 1, mark: 1 }, scales: SCALES_PLAN },
  'montage-room':   { need: { stamp: 1 }, want: { chain: 1 }, scales: SCALES_PLAN },
  furniture:        { need: { notes: 1, stamp: 1, room: 1, spec: 1 }, want: { leader: 1 }, scales: SCALES_PLAN },
  plan:             { need: { stamp: 1 }, want: { legend: 1 }, scales: SCALES_PLAN },
  'plan-dims':      { need: { chain: 2, stamp: 1 }, want: {}, scales: SCALES_PLAN, sum: true },
  doors:            { need: { legend: 1, notes: 1, stamp: 1, spec: 1 }, want: { chain: 1 }, scales: SCALES_PLAN },
  sockets:          { need: { legend: 1, notes: 1, stamp: 1, tie: 4 }, want: {}, scales: SCALES_PLAN },
  'electro-room':   { need: { stamp: 1, tie: 2 }, want: { legend: 1 }, scales: SCALES_PLAN },
  lighting:         { need: { legend: 1, notes: 1, stamp: 1 }, want: { lampSpec: 1 }, scales: SCALES_PLAN },
  switches:         { need: { legend: 1, notes: 1, stamp: 1 }, want: {}, scales: SCALES_PLAN },
  'switch-scheme':  { need: { legend: 1, notes: 1, stamp: 1 }, want: {}, scales: SCALES_PLAN },
  ceiling:          { need: { legend: 1, notes: 1, stamp: 1, level: 1 }, want: { chain: 1, nodeRef: 1 }, scales: SCALES_PLAN },
  'ceiling-room':   { need: { stamp: 1, level: 1 }, want: { chain: 1 }, scales: SCALES_PLAN },
  floors:           { need: { legend: 1, notes: 1, stamp: 1 }, want: { level: 1, arrow: 1 }, scales: SCALES_PLAN },
  'floor-room':     { need: { stamp: 1 }, want: { level: 1, arrow: 1 }, scales: SCALES_PLAN },
  'wall-finish':    { need: { legend: 1, notes: 1, stamp: 1 }, want: { finMark: 1 }, scales: SCALES_PLAN },
  'heat-floor':     { need: { legend: 1, notes: 1, stamp: 1 }, want: {}, scales: SCALES_PLAN },
  climate:          { need: { legend: 1, notes: 1, stamp: 1 }, want: { slope: 1 }, scales: SCALES_PLAN },
  plumbing:         { need: { legend: 1, notes: 1, stamp: 1, tie: 2 }, want: { slope: 1 }, scales: SCALES_PLAN },
  // привязки на развёртке обязательны там, где на стене есть розетки и выключатели;
  // стена без электрики их иметь не может — поэтому tie здесь замечание, а не ошибка
  elevation:        { need: { stamp: 1, level: 2, chain: 1 }, want: { tie: 1, spec: 1, notes: 1 }, scales: SCALES_PLAN },
  node:             { need: { stamp: 1, level: 1 }, want: { leader: 1, sheetRef: 1 }, scales: SCALES_NODE },
  // разрез: конструкции в сечении, отметки уровней, габариты помещений по линии сечения
  section:          { need: { stamp: 1, level: 3, dim: 2, notes: 1 }, want: { leader: 1, chain: 1 }, scales: SCALES_PLAN },
  // щит: однолинейка с аппаратами защиты и кабельный журнал с длинами
  panel:            { need: { stamp: 1, notes: 1, spec: 1 }, want: { legend: 1 }, scales: SCALES_PLAN },
  // презентационный лист для клиента: намеренно без размерных цепочек и привязок
  presentation:     { need: { stamp: 1, room: 0 }, want: { legend: 1 }, scales: SCALES_PLAN },
  // титул с перечнем чертежей и лист обозначения развёрток
  title:            { need: { stamp: 1, notes: 1, spec: 1 }, want: {}, scales: SCALES_PLAN },
  'elev-keys':      { need: { stamp: 1, legend: 1, notes: 1, room: 1 }, want: { spec: 1 }, scales: SCALES_PLAN },
  'smart-room':     { need: { stamp: 1 }, want: { legend: 1 }, scales: SCALES_PLAN },
  'lowvolt-room':   { need: { stamp: 1, legend: 1 }, want: { tie: 1 }, scales: SCALES_PLAN },
};

const HUMAN = {
  chain: 'размерная цепочка', dim: 'размерная линия', legend: 'условные обозначения',
  notes: 'примечания', stamp: 'основная надпись', room: 'номера помещений',
  level: 'отметка уровня по ГОСТ (знак 45° + полка)', tie: 'привязка (расстояние/высота)',
  spec: 'спецификация/ведомость на листе', leader: 'выноска по ГОСТ 2.316',
  arrow: 'стрелка направления укладки', slope: 'указание уклона',
  finMark: 'марка отделки в кружке', lampSpec: 'запись о светильниках «тип · лампы×Вт»',
  nodeRef: 'ссылка на лист узла', sheetRef: 'обратная ссылка на лист-источник', mark: 'марка конструкции Мn'
};

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)
    .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : (e.name.endsWith('.svg') ? [path.join(d, e.name)] : []));
}

// ---------- детекторы ----------
function counts(svg) {
  const c = {};
  const byEl = (name) => (svg.match(new RegExp(`data-el="${name}"`, 'g')) || []).length;
  for (const k of ['chain', 'dim', 'legend', 'notes', 'stamp', 'room', 'level', 'leader', 'spec']) c[k] = byEl(k);
  // текстовые детекторы — то, что рисуется без отдельной метки
  const texts = [...svg.matchAll(/>([^<>]{1,300})</g)].map(m => m[1]);
  const has = re => texts.filter(t => re.test(t)).length;
  c.level += has(/^[+−-]?\d{1,2},\d{3}$/);                       // отметки вида +2,700 / −0,020
  c.tie = has(/(^|\s)(h=|H=)\s*\d{2,4}/) + has(/\d{2,4}\s*\/\s*\d{2,4}/); // высоты и привязки L/H
  c.arrow = has(/укладк|направлен/i);
  c.slope = has(/уклон|i\s*[≥=]/i);
  c.finMark = has(/^(От|FIN)[-\s]?\d/i);
  c.lampSpec = has(/\d+\s*(шт|×|x)\s*\d+\s*Вт/i) + has(/точечн|светильник/i);
  c.nodeRef = has(/узел|л\.\s?\d+/i);
  c.sheetRef = has(/лист\s?\d+|см\.\s?лист/i);
  c.mark = has(/^М\d+$/);
  // кабельный журнал — такой же табличный документ на листе, как ведомость (ГОСТ 21.608)
  c.spec += has(/спецификац|ведомост|экспликац|журнал/i) ? 1 : 0;
  return c;
}

// замкнутость цепочки: сумма подписанных сегментов должна давать габарит
function chainClosure(svg) {
  const nums = [...svg.matchAll(/data-el="chain"[\s\S]*?(?=data-el="(?!chain)|<\/svg>)/g)]
    .map(m => [...m[0].matchAll(/>(\d{3,5})</g)].map(x => +x[1]));
  const bad = [];
  for (const seg of nums) {
    if (seg.length < 3) continue;
    const total = Math.max(...seg);
    const parts = seg.filter(v => v !== total);
    const sum = parts.reduce((a, b) => a + b, 0);
    // цепочка считается замкнутой, если сумма сегментов совпадает с габаритом
    // (допуск 2% — на листе бывают и отдельные справочные размеры)
    if (parts.length >= 2 && Math.abs(sum - total) > total * 0.02 && sum < total) bad.push({ sum, total });
  }
  return bad;
}

const files = walk(dir);
if (!files.length) { console.error(`В ${dir} нет ни одного .svg`); process.exit(1); }

const report = [];
for (const f of files) {
  const svg = fs.readFileSync(f, 'utf8');
  const type = (/data-sheet="([^"]+)"/.exec(svg) || [, 'other'])[1];
  if (ONLY && type !== ONLY) continue;
  const rule = RULES[type];
  const rel = path.relative(dir, f);
  if (!rule) { report.push({ rel, type, errors: [`тип листа «${type}» не описан в каноне`], warns: [] }); continue; }

  const c = counts(svg);
  const errors = [], warns = [];

  const scale = +((/data-scale="1:(\d+)"/.exec(svg) || [, 0])[1]);
  if (!scale) errors.push('в листе нет масштаба (data-scale)');
  else if (!rule.scales.includes(scale)) errors.push(`масштаб 1:${scale} вне ряда ГОСТ 21.501 (допустимо 1:${rule.scales.join(', 1:')})`);

  for (const [k, min] of Object.entries(rule.need)) {
    if (min > 0 && (c[k] || 0) < min) errors.push(`${HUMAN[k] || k}: ${c[k] || 0} из ${min}`);
  }
  for (const [k, min] of Object.entries(rule.want || {})) {
    if ((c[k] || 0) < min) warns.push(`${HUMAN[k] || k}: ${c[k] || 0} из ${min}`);
  }
  if (rule.sum) for (const b of chainClosure(svg)) errors.push(`цепочка не замкнута: сумма сегментов ${b.sum} против габарита ${b.total}`);

  report.push({ rel, type, errors, warns });
}

if (JSONOUT) { console.log(JSON.stringify(report, null, 1)); process.exit(report.some(r => r.errors.length) ? 1 : 0); }

// ---------- вывод ----------
const bad = report.filter(r => r.errors.length);
const warnOnly = report.filter(r => !r.errors.length && r.warns.length);
let shown = 0;
for (const r of bad) {
  if (shown++ >= MAX) break;
  console.log(`✖ ${r.rel}  [${r.type}]`);
  r.errors.forEach(e => console.log(`    ${e}`));
  r.warns.forEach(w => console.log(`    · ${w}`));
}
if (bad.length > MAX) console.log(`… и ещё ${bad.length - MAX} листов с нарушениями канона`);

// сводка по типам: где системная дыра, а где единичный лист
const byType = {};
for (const r of report) {
  const t = byType[r.type] = byType[r.type] || { n: 0, bad: 0, top: {} };
  t.n++; if (r.errors.length) t.bad++;
  for (const e of r.errors) { const k = e.split(':')[0]; t.top[k] = (t.top[k] || 0) + 1; }
}
console.log('\nПо типам листов:');
for (const [t, v] of Object.entries(byType).sort((a, b) => b[1].bad - a[1].bad)) {
  const top = Object.entries(v.top).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} (${n})`).join(', ');
  console.log(`  ${v.bad ? '✖' : '✔'} ${t.padEnd(17)} ${String(v.bad).padStart(3)}/${String(v.n).padEnd(3)} нарушают${top ? ' — ' + top : ''}`);
}
console.log(`\nПроверено листов: ${report.length}. Нарушают канон: ${bad.length}. Только замечания: ${warnOnly.length}.`);
if (bad.length) process.exit(1);
