#!/usr/bin/env node
// ================================================================================================================
// LINEA · обмер → заготовка project.json движка GOST-DRAFT
//
//   node tools/survey-to-project.mjs <survey.json> <папка> [--code=ГД-2026-0NN-АИ] [--author="Кырлан А.С."] [--date=ДД.ММ.ГГГГ]
//
// Вход — survey.json формата `linea-survey/1` (форма site/obmer/, описание — docs/obmer/format.md, пример —
// docs/obmer/survey-example.json). Выход — <папка>/project.json по канону ~/projects/gost-draft/docs/schema.md
// (мм, оси стен, offset проёмов по сетке, A/B/C/D = верх/право/низ/лево плана) и <папка>/survey-journal.md —
// что пересчитано и что не сошлось. Движок GOST-DRAFT этот скрипт не импортирует (репозитории независимы).
//
// Что делает:
//   1. Чистые размеры помещения: ширина — среднее стен A и C по низу, длина — среднее B и D. Расхождение
//      противоположных стен > 10 мм, низ/верх > 10 мм, средняя диагональ против расчётной > 1 % — в журнал.
//   2. Раскладка: помещение с `place {x, y}` — чистый левый верхний угол; с `place {from, side, shift}` — за стеной
//      `side` помещения `from`, начало сдвинуто на `shift` вдоль этой стены. Зазор между чистыми гранями = толщина
//      внутренних стен INT (медиана замеров), чтобы оси соседей совпали (в движке одна толщина перегородки).
//   3. Оси: сторона к соседнему помещению отодвигается на INT/2 (ось перегородки), сторона на границе квартиры
//      (улица, соседи, лестница) — не отодвигается: в движке контур `object.outline` идёт по чистой грани наружных стен.
//      Контур — объединение помещений по осям (обход по часовой стрелке).
//   4. Проёмы, радиаторы — offset от чистого угла переводится в offset по сетке. Дверь, записанная в обоих помещениях,
//      остаётся одна. Стояки, вентканалы, щит — по привязке к двум стенам или к стене с отступом.
//   5. object.survey { by, date } — событие обмера: автор и дата берутся только из survey.json (их вносит замерщик).
//      Чего обмер не даёт (несущие стены, разрешённая мощность по ТУ, тип дома без документа) — не выдумывается:
//      допущение + запись реестра К-N с заданием (knowledge/zakrytie-zamechanii.md в gost-draft).
// ================================================================================================================
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : true]; }));
const [inFile, outDir] = args.filter(a => !a.startsWith('--'));
if (!inFile || !outDir) {
  console.error('node tools/survey-to-project.mjs <survey.json> <папка> [--code=…] [--author=…] [--date=ДД.ММ.ГГГГ]');
  process.exit(2);
}
const S = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const journal = [], errors = [];
const note = s => journal.push(s);
const fail = s => errors.push(s);
const num = v => typeof v === 'number' && Number.isFinite(v);
const arr = v => (Array.isArray(v) ? v : []);
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const R = v => Math.round(v);
const DATE = /^\d{2}\.\d{2}\.\d{4}$/;
const SIDES = ['A', 'B', 'C', 'D'];
const OPP = { A: 'C', C: 'A', B: 'D', D: 'B' };
const BOUNDARY = new Set(['outside', 'flat', 'stair', 'street', 'neighbor', 'lift', 'boundary']);
const TYPES = new Set(['living', 'living-kitchen', 'kitchen', 'bedroom', 'kids', 'study', 'hall', 'corridor', 'bathroom', 'wc', 'wardrobe', 'storage', 'balcony', 'loggia']);
const SIDE_RU = { outside: 'улица', flat: 'соседняя квартира', stair: 'лестница / МОП', street: 'улица', neighbor: 'соседи', lift: 'лифт', boundary: 'граница квартиры', room: 'помещение квартиры' };

// ── 0. Формат и событие обмера ─────────────────────────────────────────────────────────────────────────────────
if (S.format !== 'linea-survey/1') fail(`format = ${JSON.stringify(S.format)}: ожидается "linea-survey/1"`);
const SV = S.survey || {};
if (!String(SV.by || '').trim()) fail('survey.by пуст: обмер — событие с автором (кто мерил). Без автора object.survey не ставится');
if (!DATE.test(String(SV.date || ''))) fail(`survey.date = ${JSON.stringify(SV.date)}: нужна дата ДД.ММ.ГГГГ`);
const rooms0 = arr(S.rooms);
if (!rooms0.length) fail('rooms[] пуст');
if (errors.length) { console.error('Ошибки survey.json:\n- ' + errors.join('\n- ')); process.exit(1); }

const ids = new Set();
rooms0.forEach((r, i) => {
  r.id = String(r.id || `r${i + 1}`);
  if (ids.has(r.id)) fail(`помещение ${r.id}: id повторяется`);
  ids.add(r.id);
  if (!TYPES.has(r.type)) fail(`помещение ${r.id} «${r.name}»: тип ${JSON.stringify(r.type)} не из канона (${[...TYPES].join(', ')})`);
  for (const k of SIDES) if (!num(r.walls?.[k]?.bottom)) fail(`помещение ${r.id} «${r.name}»: нет длины стены ${k} по низу`);
});
if (errors.length) { console.error('Ошибки survey.json:\n- ' + errors.join('\n- ')); process.exit(1); }

// ── 1. Чистые размеры и контроль замера ───────────────────────────────────────────────────────────────────────
const byId = {};
for (const r of rooms0) {
  const W = r.walls, where = `${r.id} «${r.name}»`;
  r.cw = R(mean([W.A.bottom, W.C.bottom]));
  r.cl = R(mean([W.B.bottom, W.D.bottom]));
  if (Math.abs(W.A.bottom - W.C.bottom) > 10) note(`${where}: стены A и C по низу ${W.A.bottom} / ${W.C.bottom} мм (разница ${Math.abs(W.A.bottom - W.C.bottom)}) — помещение не прямоугольно, в модели ширина ${r.cw}`);
  if (Math.abs(W.B.bottom - W.D.bottom) > 10) note(`${where}: стены B и D по низу ${W.B.bottom} / ${W.D.bottom} мм (разница ${Math.abs(W.B.bottom - W.D.bottom)}) — в модели длина ${r.cl}`);
  for (const k of SIDES) if (num(W[k].top) && Math.abs(W[k].top - W[k].bottom) > 10) note(`${where}: стена ${k} по низу ${W[k].bottom}, по верху ${W[k].top} мм — завал стены ${Math.abs(W[k].top - W[k].bottom)} мм`);
  const d = arr(r.diagonals).filter(num);
  if (d.length >= 2) {
    const calc = Math.hypot(r.cw, r.cl), m = mean(d.slice(0, 2));
    if (Math.abs(d[0] - d[1]) >= 5) note(`${where}: диагонали ${d[0]} / ${d[1]} мм (разница ${Math.abs(d[0] - d[1])}) — углы не прямые, в движке это AR-16`);
    if (Math.abs(m - calc) / calc > 0.01) note(`${where}: средняя диагональ ${R(m)} против ${R(calc)} по сторонам (> 1 %) — перемерить стороны или диагонали`);
  } else note(`${where}: диагонали не сняты — прямоугольность не проверена`);
  const h = arr(r.heights).filter(num);
  if (!h.length) note(`${where}: высота потолка не замерена — потолок помещения возьмётся из object.ceiling`);
  else if (Math.max(...h) - Math.min(...h) > 15) note(`${where}: высоты ${h.join(' / ')} мм — перепад ${Math.max(...h) - Math.min(...h)} мм, в модели ceiling = наименьшая`);
  byId[r.id] = r;
}

// ── 2. Толщины стен ────────────────────────────────────────────────────────────────────────────────────────────
const isB = side => BOUNDARY.has(String(side || '').toLowerCase());
const intT = [], extT = [];
for (const r of rooms0) for (const k of SIDES) {
  const w = r.walls[k], ts = [w.t, ...arr(r.openings).filter(o => o.wall === k).map(o => o.wallT)].filter(num);
  for (const t of ts) (isB(w.side) ? extT : intT).push(t);
}
let INT = median(intT), EXT = median(extT);
const assumedWalls = [];
if (!num(INT)) { INT = 120; assumedWalls.push('внутренние 120'); }
if (!num(EXT)) { EXT = 200; assumedWalls.push('на границе квартиры 200'); }
if (intT.some(t => Math.abs(t - INT) > 20)) note(`толщины внутренних стен по замеру: ${[...new Set(intT)].sort((a, b) => a - b).join(', ')} мм; в модели одна толщина перегородки ${INT} мм (медиана) — фактические толщины в rooms[].survey.walls`);
if (extT.some(t => Math.abs(t - EXT) > 20)) note(`толщины стен на границе квартиры: ${[...new Set(extT)].sort((a, b) => a - b).join(', ')} мм; в модели ${EXT} мм (медиана)`);

// ── 3. Раскладка чистых прямоугольников ────────────────────────────────────────────────────────────────────────
const placed = new Set();
const setClear = (r, x0, y0) => { Object.assign(r, { x0, y0, x1: x0 + r.cw, y1: y0 + r.cl }); placed.add(r.id); };
for (const r of rooms0) if (num(r.place?.x) && num(r.place?.y)) setClear(r, r.place.x, r.place.y);
if (!placed.size) { setClear(rooms0[0], 0, 0); note(`${rooms0[0].id}: нет place — принят за начало координат`); }
for (let pass = 0; pass < rooms0.length + 1; pass++) {
  for (const r of rooms0) {
    if (placed.has(r.id) || !r.place?.from) continue;
    const b = byId[r.place.from];
    if (!b) { fail(`${r.id}: place.from = ${r.place.from} — нет такого помещения`); placed.add(r.id); continue; }
    if (!placed.has(b.id)) continue;
    const sh = num(r.place.shift) ? r.place.shift : 0, side = r.place.side;
    const wb = b.walls[side];
    if (wb && num(wb.t) && Math.abs(wb.t - INT) > 10) note(`${r.id} поставлен за стеной ${side} помещения ${b.id}: стена по замеру ${wb.t} мм, в раскладке ${INT} мм (одна толщина перегородки движка)`);
    if (side === 'B') setClear(r, b.x1 + INT, b.y0 + sh);
    else if (side === 'D') setClear(r, b.x0 - INT - r.cw, b.y0 + sh);
    else if (side === 'A') setClear(r, b.x0 + sh, b.y0 - INT - r.cl);
    else if (side === 'C') setClear(r, b.x0 + sh, b.y1 + INT);
    else { fail(`${r.id}: place.side = ${side}: ожидается A/B/C/D`); placed.add(r.id); }
  }
}
for (const r of rooms0) if (!placed.has(r.id) || !num(r.x0)) fail(`${r.id} «${r.name}»: не удалось поставить на план (place не связан с поставленными помещениями)`);
if (errors.length) { console.error('Ошибки раскладки:\n- ' + errors.join('\n- ')); process.exit(1); }

// соседство по чистым граням: через стену INT (±INT/2) с перекрытием > 100 мм
function neighbors(r, k) {
  const out = [];
  for (const o of rooms0) {
    if (o === r) continue;
    let gap, ov;
    if (k === 'B') { gap = o.x0 - r.x1; ov = Math.min(r.y1, o.y1) - Math.max(r.y0, o.y0); }
    if (k === 'D') { gap = r.x0 - o.x1; ov = Math.min(r.y1, o.y1) - Math.max(r.y0, o.y0); }
    if (k === 'A') { gap = r.y0 - o.y1; ov = Math.min(r.x1, o.x1) - Math.max(r.x0, o.x0); }
    if (k === 'C') { gap = o.y0 - r.y1; ov = Math.min(r.x1, o.x1) - Math.max(r.x0, o.x0); }
    if (ov > 100 && gap > -1 && gap <= INT * 1.5 + 1) out.push(o.id);
  }
  return out;
}
// пересечения чистых прямоугольников — ошибка раскладки
for (let i = 0; i < rooms0.length; i++) for (let j = i + 1; j < rooms0.length; j++) {
  const a = rooms0[i], b = rooms0[j];
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (ox > 1 && oy > 1) fail(`помещения ${a.id} и ${b.id} налезают друг на друга (${R(ox)} × ${R(oy)} мм) — проверить place и размеры`);
}
if (errors.length) { console.error('Ошибки раскладки:\n- ' + errors.join('\n- ')); process.exit(1); }

// ── 4. Оси стен ────────────────────────────────────────────────────────────────────────────────────────────────
for (const r of rooms0) {
  r.bnd = {};
  for (const k of SIDES) {
    const said = r.walls[k].side, nb = neighbors(r, k);
    let b = said ? isB(said) : !nb.length;
    if (!said) note(`${r.id} «${r.name}», стена ${k}: не указано, что за стеной — принято «${b ? 'граница квартиры' : 'помещение'}» по раскладке`);
    if (!b && !nb.length) { b = true; note(`${r.id} «${r.name}», стена ${k}: за стеной указано помещение, но на раскладке соседа нет — стена считается границей квартиры (проверить place или обмерить соседнее помещение)`); }
    if (b && nb.length) note(`${r.id} «${r.name}», стена ${k}: указано «${SIDE_RU[said] || said}», а на раскладке за ней ${nb.join(', ')} — проверить`);
    if (!b && nb.length) {
      const horiz = k === 'A' || k === 'C', a0 = horiz ? r.x0 : r.y0, a1 = horiz ? r.x1 : r.y1;
      const cover = nb.map(id => byId[id]).reduce((s, o) => s + Math.max(0, Math.min(a1, horiz ? o.x1 : o.y1) - Math.max(a0, horiz ? o.x0 : o.y0)), 0);
      if (cover < (a1 - a0) * 0.9) note(`${r.id} «${r.name}», стена ${k}: соседнее помещение (${nb.join(', ')}) только на ${R(cover)} из ${R(a1 - a0)} мм — остальная часть стены выйдет на контур квартиры, площадь в движке больше обмерной на полосу ${INT / 2} мм; обмерить помещение за остальной частью или разбить помещение на части`);
    }
    r.bnd[k] = b;
  }
  const e = k => (r.bnd[k] ? 0 : INT / 2);
  Object.assign(r, { ax: r.x0 - e('D'), ay: r.y0 - e('A'), ax1: r.x1 + e('B'), ay1: r.y1 + e('C') });
}
const minX = Math.min(...rooms0.map(r => r.ax)), minY = Math.min(...rooms0.map(r => r.ay));
for (const r of rooms0) { for (const k of ['ax', 'ax1', 'x0', 'x1']) r[k] -= minX; for (const k of ['ay', 'ay1', 'y0', 'y1']) r[k] -= minY; }
// стыковка: оси, разошедшиеся на ≤ 10 мм (среднее сторон, погрешность рулетки), сводятся в одну линию —
// иначе контур получает ступеньки по 1–2 мм. Чистый угол помещения остаётся замеренным.
const SNAP = 10;
let snapMax = 0;
for (const [lo, hi] of [['ax', 'ax1'], ['ay', 'ay1']]) {
  const vals = [...new Set(rooms0.flatMap(r => [r[lo], r[hi]]))].sort((a, b) => a - b);
  const map = new Map();
  for (let i = 0; i < vals.length;) {
    let j = i; while (j + 1 < vals.length && vals[j + 1] - vals[j] <= SNAP && vals[j + 1] - vals[i] <= SNAP) j++;
    const grp = vals.slice(i, j + 1), v = R(median(grp));
    for (const g of grp) { map.set(g, v); snapMax = Math.max(snapMax, Math.abs(g - v)); }
    i = j + 1;
  }
  for (const r of rooms0) { r[lo] = map.get(r[lo]); r[hi] = map.get(r[hi]); }
}
if (snapMax > 2) note(`стыковка осей: линии стен, разошедшиеся на ≤ ${SNAP} мм, сведены в одну (наибольший сдвиг ${R(snapMax)} мм)`);
const W = R(Math.max(...rooms0.map(r => r.ax1))), L = R(Math.max(...rooms0.map(r => r.ay1)));

// контур: объединение осевых прямоугольников, обход по часовой (экранные координаты, Y вниз)
function unionOutline(rects) {
  const xs = [...new Set(rects.flatMap(q => [q[0], q[2]]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap(q => [q[1], q[3]]))].sort((a, b) => a - b);
  const cov = (i, j) => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= ys.length - 1) return false;
    const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
    return rects.some(q => cx > q[0] && cx < q[2] && cy > q[1] && cy < q[3]);
  };
  const edges = new Map(), key = p => p.join(',');
  const add = (a, b) => { const k = key(a); if (!edges.has(k)) edges.set(k, []); edges.get(k).push(b); };
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    if (!cov(i, j)) continue;
    const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
    if (!cov(i, j - 1)) add([x0, y0], [x1, y0]);
    if (!cov(i + 1, j)) add([x1, y0], [x1, y1]);
    if (!cov(i, j + 1)) add([x1, y1], [x0, y1]);
    if (!cov(i - 1, j)) add([x0, y1], [x0, y0]);
  }
  const loops = [];
  while (edges.size) {
    const [k0] = [...edges.keys()].sort((a, b) => { const [ax, ay] = a.split(',').map(Number), [bx, by] = b.split(',').map(Number); return ay - by || ax - bx; });
    const start = k0.split(',').map(Number), loop = [start];
    let cur = start;
    for (let guard = 0; guard < 100000; guard++) {
      const list = edges.get(key(cur));
      if (!list || !list.length) break;
      const nx = list.shift();
      if (!list.length) edges.delete(key(cur));
      if (key(nx) === key(start)) break;
      loop.push(nx); cur = nx;
    }
    // убрать точки на прямой
    const simp = loop.filter((p, i) => { const a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length]; return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1])); });
    const area = Math.abs(simp.reduce((s, p, i) => { const q = simp[(i + 1) % simp.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
    loops.push({ pts: simp, area });
  }
  loops.sort((a, b) => b.area - a.area);
  return loops;
}
const loops = unionOutline(rooms0.map(r => [r.ax, r.ay, r.ax1, r.ay1]));
if (loops.length > 1) note(`контур квартиры: ${loops.length} замкнутых обхода (дыры между помещениями или помещение отдельно) — взят внешний; проверить, не пропущено ли помещение (шахта, ниша, кладовая)`);
const outline = loops[0].pts.map(p => [R(p[0]), R(p[1])]);
const rectangular = outline.length === 4;

// ── 5. Помещения, проёмы, предметы ─────────────────────────────────────────────────────────────────────────────
// перевод: offset от чистого угла → offset по сетке; точка у двух стен → координаты плана
const gridOff = (r, wall, off) => R(off + (wall === 'A' || wall === 'C' ? r.x0 - r.ax : r.y0 - r.ay));
function pointAt(r, at, where) {
  let x = null, y = null;
  if (num(at?.D)) x = r.x0 + at.D; else if (num(at?.B)) x = r.x1 - at.B;
  if (num(at?.A)) y = r.y0 + at.A; else if (num(at?.C)) y = r.y1 - at.C;
  if (x == null || y == null) { note(`${where}: привязка ${JSON.stringify(at)} — нужна одна стена по X (B или D) и одна по Y (A или C); точка не поставлена`); return null; }
  return { x: R(x), y: R(y) };
}
// точка на стене по offset вдоль стены от чистого угла (центр предмета)
function pointOnWall(r, wall, off) {
  if (wall === 'A') return { x: r.x0 + off, y: r.y0 };
  if (wall === 'C') return { x: r.x0 + off, y: r.y1 };
  if (wall === 'D') return { x: r.x0, y: r.y0 + off };
  return { x: r.x1, y: r.y0 + off };
}
const doorsSeen = [];
const RISER_MARK = { sewer: 'К1', cold: 'В1', hot: 'Т3', heat: 'Т1', gas: 'Г' };
const riserN = {}, risers = [], ventDucts = [];
let ventN = 0, radN = 0;
const rooms = rooms0.map(r => {
  const where = `${r.id} «${r.name}»`;
  const doors = [], windows = [], radiators = [];
  for (const [i, o] of arr(r.openings).entries()) {
    if (!SIDES.includes(o.wall) || !num(o.offset) || !num(o.width)) { note(`${where}, проём ${i + 1}: нет стены, отступа или ширины — пропущен`); continue; }
    const len = o.wall === 'A' || o.wall === 'C' ? r.cw : r.cl;
    if (o.offset < 0 || o.offset + o.width > len + 5) note(`${where}, проём ${i + 1} на стене ${o.wall}: ${o.offset} + ${o.width} мм выходит за стену ${len} мм — проверить привязку`);
    const base = { wall: o.wall, offset: gridOff(r, o.wall, o.offset), width: R(o.width) };
    if (num(o.height)) base.height = R(o.height); else note(`${where}, проём ${i + 1}: нет высоты`);
    const surv = Object.fromEntries(Object.entries({ wallT: o.wallT, quarter: o.quarter, photo: o.photo, offsetClear: o.offset }).filter(([, v]) => v != null && v !== ''));
    if (o.kind === 'window') {
      Object.assign(base, num(o.sill) ? { sill: R(o.sill) } : {}, num(o.reveal) ? { revealDepth: R(o.reveal) } : {});
      if (!num(o.sill)) note(`${where}, окно ${i + 1}: нет высоты подоконника`);
      windows.push(Object.assign(base, { survey: surv }));
    } else {
      // одна дверь — одна запись: в соседнем помещении та же дверь не повторяется
      const p0 = pointOnWall(r, o.wall, o.offset), p1 = pointOnWall(r, o.wall, o.offset + o.width);
      const dup = doorsSeen.find(d => d.horiz === (o.wall === 'A' || o.wall === 'C') && Math.abs((d.horiz ? d.y : d.x) - (d.horiz ? p0.y : p0.x)) <= INT * 1.5 + 1
        && Math.min(d.b, d.horiz ? p1.x : p1.y) - Math.max(d.a, d.horiz ? p0.x : p0.y) > o.width * 0.5 && d.room !== r.id);
      if (dup) { note(`${where}, дверь ${i + 1}: та же дверь уже записана в ${dup.room} — второй раз не ставится`); continue; }
      const horiz = o.wall === 'A' || o.wall === 'C';
      doorsSeen.push({ room: r.id, horiz, x: p0.x, y: p0.y, a: horiz ? p0.x : p0.y, b: horiz ? p1.x : p1.y });
      if (o.entry) base.entry = true;
      if (o.swing === 'start' || o.swing === 'end') base.swing = o.swing;
      if (o.kind === 'opening') base.leaf = false;
      if (o.kind === 'balcony-door') { base.balcony = true; if (num(o.sill)) base.sill = R(o.sill); }
      doors.push(Object.assign(base, { survey: surv }));
    }
  }
  for (const o of arr(r.radiators)) {
    if (!SIDES.includes(o.wall) || !num(o.offset) || !num(o.width)) { note(`${where}: радиатор без стены / отступа / ширины — пропущен`); continue; }
    radiators.push(Object.fromEntries(Object.entries({ id: `Р${++radN}`, wall: o.wall, offset: gridOff(r, o.wall, o.offset), width: R(o.width), height: o.height, depth: o.depth, floorGap: o.floorGap, wallGap: o.wallGap,
      connect: ['side', 'bottom'].includes(o.connect) ? o.connect : undefined, airVent: typeof o.airVent === 'boolean' ? o.airVent : undefined, thermoHead: typeof o.thermoHead === 'boolean' ? o.thermoHead : undefined,
      survey: Object.fromEntries(Object.entries({ sections: o.sections, kind: o.kind, photo: o.photo }).filter(([, v]) => v != null && v !== '')) }).filter(([, v]) => v != null)));
  }
  for (const s of arr(r.risers)) {
    const p = pointAt(r, s.at, `${where}, стояк ${s.kind}`);
    if (!p) continue;
    const mark = RISER_MARK[s.kind] || s.kind;
    riserN[mark] = (riserN[mark] || 0) + 1;
    risers.push(Object.fromEntries(Object.entries({ id: `Ст${mark}-${riserN[mark]}`, name: `Ст ${mark}-${riserN[mark]}`, x: p.x, y: p.y, d: s.d, kind: s.kind, valve: s.valve, meter: s.meter, meterH: s.meterH,
      room: r.id, survey: Object.fromEntries(Object.entries({ at: s.at, material: s.material, photo: s.photo }).filter(([, v]) => v != null && v !== '')) }).filter(([, v]) => v != null)));
    if (!num(s.d)) note(`${where}: стояк ${mark} без диаметра`);
  }
  for (const v of arr(r.vents)) {
    if (!SIDES.includes(v.wall) || !num(v.offset)) { note(`${where}: вентканал без стены / отступа — пропущен`); continue; }
    const w = num(v.w) ? v.w : 140, l = num(v.l) ? v.l : 140, c = pointOnWall(r, v.wall, v.offset);
    if (!num(v.w) || !num(v.l)) note(`${where}: сечение вентканала не замерено — принято ${w}×${l}`);
    // канал в толще стены за решёткой; box: true — вентблок выступает в помещение коробом
    const into = v.box ? 1 : -1;
    let rect;
    if (v.wall === 'A') rect = { x: c.x - w / 2, y: into > 0 ? c.y : c.y - l, w, l };
    else if (v.wall === 'C') rect = { x: c.x - w / 2, y: into > 0 ? c.y - l : c.y, w, l };
    else if (v.wall === 'D') rect = { x: into > 0 ? c.x : c.x - l, y: c.y - w / 2, w: l, l: w };
    else rect = { x: into > 0 ? c.x - l : c.x, y: c.y - w / 2, w: l, l: w };
    ventDucts.push(Object.assign({ id: `ВК-${++ventN}` }, Object.fromEntries(Object.entries(rect).map(([k, x]) => [k, R(x)])),
      { room: r.id, survey: Object.fromEntries(Object.entries({ wall: v.wall, offsetClear: v.offset, h: v.h, draft: v.draft, box: !!v.box, photo: v.photo }).filter(([, x]) => x != null && x !== '')) }));
  }
  const h = arr(r.heights).filter(num);
  const wallBase = Object.fromEntries(SIDES.filter(k => r.walls[k].material).map(k => [k, r.walls[k].material]));
  const room = { id: r.id, name: r.name || r.id, type: r.type, x: R(r.ax), y: R(r.ay), w: R(r.ax1 - r.ax), l: R(r.ay1 - r.ay) };
  if (h.length) room.ceiling = Math.min(...h);
  Object.assign(room, { doors, windows });
  if (radiators.length) room.radiators = radiators;
  if (Object.keys(wallBase).length) room.wallBase = wallBase;
  room.survey = Object.fromEntries(Object.entries({
    diagonals: arr(r.diagonals).filter(num), heights: h, clear: { w: r.cw, l: r.cl },
    walls: Object.fromEntries(SIDES.map(k => [k, Object.fromEntries(Object.entries(r.walls[k]).filter(([, v]) => v != null && v !== ''))])),
    floorStep: r.floorStep, photos: arr(r.photos), note: r.note,
  }).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));
  if (h.length) room.survey.heights = h;
  return room;
});

// ── 6. Объект, реестр К-N ──────────────────────────────────────────────────────────────────────────────────────
const O = S.object || {};
const dateIssue = flags.date || SV.date;
const author = flags.author || SV.by;
const src = `обмер ${SV.date}, ${SV.by} (survey.json)`;
const questions = [], assumed = {};
let kn = 0;
const Q = (q) => { const id = `К-${++kn}`; questions.push(Object.assign({ id, by: author }, q)); return id; };
const SVQ = (key, method, what, where, until, who, recalc, proof) => ({ key, method, phase: 'before', what, where, until, who, recalc, proof });

const object = { type: O.type || 'квартира' };
if (num(O.floor)) object.floor = O.floor;
if (num(O.floors)) object.floors = O.floors;
if (num(O.areaDocs)) object.area = O.areaDocs;
object.width = W; object.length = L;
if (!rectangular) object.outline = outline;
const ceils = rooms.map(r => r.ceiling).filter(num);
object.ceiling = ceils.length ? median(ceils) : 2700;
object.walls = { ext: EXT, int: INT, source: src };
object.survey = Object.fromEntries(Object.entries({ by: SV.by, date: SV.date, ceiling: ceils.length ? median(ceils) : undefined, tool: SV.tool, time: SV.started && SV.finished ? `${SV.started}–${SV.finished}` : undefined,
  orientation: SV.orientation, file: 'survey.json', photos: rooms0.reduce((n, r) => n + arr(r.photos).length, 0) || undefined }).filter(([, v]) => v != null && v !== ''));
if (risers.length) object.risers = risers;
if (ventDucts.length) object.ventDucts = ventDucts;
const kitchen = rooms0.find(r => r.stove);
if (kitchen) object.stove = kitchen.stove;

// несущие: обмер их не определяет
const house = O.house || {};
const KIND = { panel: 'panel', brick: 'brick', monolith: 'monolith', block: 'block', wood: 'wood' };
if (house.source === 'document' && KIND[house.kind]) {
  object.structure = Object.fromEntries(Object.entries({ houseType: KIND[house.kind], series: house.series || undefined, year: house.year || undefined, source: house.note || 'проект дома' }).filter(([, v]) => v != null));
}
object.structure = Object.assign(object.structure || {}, { bearingStatus: 'pending', bearingBasis: 'обмер несущие стены не определяет: нужен проект дома (АР, КР) или техническое заключение обследования' });
const kBear = Q({ sheet: 'architect/obmer · architect/demolition', kind: 'отсутствует', owner: 'architect',
  text: `Несущие стены не определены: обмер фиксирует размеры и материал стен простукиванием, но не их работу в доме.${house.kind ? ` Тип дома по ${house.source === 'document' ? 'документу' : 'словам заказчика'}: ${house.kind}${house.series ? ', серия ' + house.series : ''}.` : ''} До документов все стены считаются несущими.`,
  ifNoDecision: 'проёмы и штробы в существующих стенах не выполнять, демонтаж не назначать',
  survey: [SVQ('proekt-doma', 'document', 'Проект дома (АР, КР) или план БТИ с несущими; при перепланировке — техзаключение.', 'заказчик, УК', 'до демонтажа', 'заказчик', 'обмерный план, демонтаж, перепланировка', ['document'])] });
if (house.source !== 'document' && house.kind) note(`тип дома «${house.kind}» — ${house.source === 'words' ? 'со слов' : 'не по документу'}: в structure не записан, вопрос ${kBear}`);

// электрощит
const pw = O.power || {};
const el = {};
if (num(pw.allowedPowerKw) && pw.tu) { el.allowedPowerKw = pw.allowedPowerKw; el.source = 'ТУ / договор техприсоединения (по данным обмера)'; }
else {
  const k = Q({ sheet: 'electrical-engineer/panel', kind: 'отсутствует', owner: 'electrical-engineer',
    text: `Разрешённая мощность квартиры по ТУ неизвестна.${pw.inputBreaker?.amps ? ` На вводе стоит автомат ${pw.inputBreaker.curve || ''}${pw.inputBreaker.amps} А (обмер) — это не разрешённая мощность.` : ''}`,
    ifNoDecision: 'щит и группы рассчитываются на 15 кВт; при меньших ТУ — пересчёт',
    survey: [SVQ('tu-power', 'document', 'ТУ на электроснабжение или справка УК о разрешённой мощности.', 'заказчик, УК', 'до сборки щита', 'заказчик', 'вводной автомат, группы', ['document'])] });
  assumed.power = { ref: k, text: 'разрешённая мощность не подтверждена документом, принята 15 кВт' };
  el.allowedPowerKw = 15;
}
if (pw.modules || pw.used || pw.room) {
  el.panel = Object.fromEntries(Object.entries({ modules: pw.modules, used: pw.used }).filter(([, v]) => num(v)));
  const pr = byId[pw.room];
  const pt = pr && pointAt(pr, pw.at, 'электрощит');
  el.panel.survey = Object.fromEntries(Object.entries({ room: pw.room, x: pt?.x, y: pt?.y, h: pw.h, inputBreaker: pw.inputBreaker, rcdInput: pw.rcdInput, photo: pw.photo }).filter(([, v]) => v != null && v !== ''));
}
object.electrical = el;

// вода
const wt = O.water || {};
if (num(wt.staticPressureBar)) {
  object.water = { staticPressure: +(wt.staticPressureBar / 10).toFixed(3), source: `манометр, ${src}${wt.how ? '; ' + wt.how : ''}` };
  const mpa = wt.staticPressureBar / 10;
  if (mpa > 0.45) note(`давление воды ${wt.staticPressureBar} бар (${mpa.toFixed(2)} МПа) — выше 0,45 МПа: нужен редуктор (решает инженер ВК)`);
} else {
  Q({ sheet: 'plumbing-engineer/water', kind: 'отсутствует', owner: 'plumbing-engineer', text: 'Давление воды на вводе не замерено.', ifNoDecision: 'редуктор давления закладывается в узел ввода',
    survey: [SVQ('davlenie', 'measure', 'Давление ХВС и ГВС манометром на кране.', 'санузел / кухня', 'до разводки', 'исполнитель', 'узел ввода', ['act'])] });
}
if (wt.inletRoom) object.waterInlet = { survey: { room: wt.inletRoom, meters: !!wt.meters } };
if (O.lowCurrent) object.lowCurrent = { survey: O.lowCurrent };

if (assumedWalls.length) {
  const k = Q({ sheet: 'architect/obmer', kind: 'отсутствует', owner: 'architect', text: `Толщины стен не замерены (${assumedWalls.join(', ')} мм приняты).`, ifNoDecision: 'толщины по типовым значениям',
    survey: [SVQ('tolshchiny', 'measure', 'Толщины стен в дверных и оконных проёмах.', 'все проёмы', 'до монтажного плана', 'исполнитель', 'обмерный план', ['act'])] });
  assumed.walls = { ref: k, text: `толщины ${assumedWalls.join(', ')} мм приняты, не замерены` };
}
if (!ceils.length) {
  const k = Q({ sheet: 'architect/obmer', kind: 'отсутствует', owner: 'architect', text: 'Высота потолка не замерена, принята 2700 мм.', ifNoDecision: 'высоты от 2700 мм' });
  assumed.ceiling = { ref: k, text: 'высота потолка 2700 мм принята, не замерена' };
}
if (Object.keys(assumed).length) object.assumed = assumed;
object.coordination = { kickoff: { date: dateIssue, questions } };

const meta = {
  name: S.meta?.object || 'Квартира по обмеру',
  address: S.meta?.address || '',
  code: flags.code || 'ГД-2026-000-АИ',
  date: dateIssue,
  stage: 'РП',
  author,
  source: `${src}; заготовка tools/survey-to-project.mjs (LINEA) — начинку (мебель, отделка, электрика) добавляет проектировщик`,
};
if (S.meta?.order) meta.order = S.meta.order;
if (!flags.code) note('meta.code не задан (--code=ГД-2026-0NN-АИ) — стоит заглушка ГД-2026-000-АИ');

const P = { meta, object, rooms };
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'project.json'), JSON.stringify(P, null, 2) + '\n');
fs.copyFileSync(inFile, path.join(outDir, 'survey.json'));
const area = rooms0.reduce((s, r) => s + (r.cw * r.cl) / 1e6, 0);
const md = [`# Журнал перевода обмера → project.json`, '',
  `Обмер: ${SV.date}, ${SV.by}${SV.started ? `, ${SV.started}–${SV.finished || '?'}` : ''}. Помещений: ${rooms.length}, сумма чистых площадей ≈ ${area.toFixed(2)} м²` +
  `${num(O.areaDocs) ? ` (по документам ${O.areaDocs} м², разница ${((area / O.areaDocs - 1) * 100).toFixed(1)} %)` : ''}.`,
  `Толщины в модели: внутренние ${INT} мм, на границе квартиры ${EXT} мм. Габарит по осям ${W} × ${L} мм, контур — ${rectangular ? 'прямоугольник' : outline.length + ' вершин'}.`,
  `Стояков ${risers.length}, вентканалов ${ventDucts.length}, вопросов реестра ${questions.length} (${questions.map(q => q.id).join(', ')}).`, '',
  '## Замечания', '', ...(journal.length ? journal.map(s => `- ${s}`) : ['- нет']), ''].join('\n');
fs.writeFileSync(path.join(outDir, 'survey-journal.md'), md);
console.log(`project.json → ${path.join(outDir, 'project.json')}: помещений ${rooms.length}, ${W}×${L} мм, ≈ ${area.toFixed(2)} м², стояков ${risers.length}, вентканалов ${ventDucts.length}, К-N ${questions.length}, замечаний ${journal.length}`);
if (num(O.areaDocs) && Math.abs(area / O.areaDocs - 1) > 0.02) console.log(`  ! сумма площадей отличается от документа больше чем на 2 %`);
for (const s of journal) console.log('  · ' + s);
