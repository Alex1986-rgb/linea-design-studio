#!/usr/bin/env node
'use strict';
// Сквозная проверка выпущенных листов — то, чего не делают audit-sheets (содержание)
// и lint-sheets (формат, кегль, перо): целостность файла, честность штампа,
// выход содержимого за рамку и наезд на основную надпись.
const fs = require('fs'), path = require('path');

const roots = process.argv.slice(2);
const PAGE = { w: 1587, h: 1123, ml: 76, mt: 19, mr: 19, mb: 19 };  // A3 + поле подшивки
const STAMP = { w: 700, h: 150 };
let total = 0;
const bad = [];
const add = (f, kind, msg) => bad.push({ f, kind, msg });

function walk(d, acc) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.svg')) acc.push(p);
  }
  return acc;
}

for (const root of roots) {
  const files = walk(root, []);
  const seenNo = new Map();
  let declaredTotal = null;

  for (const f of files) {
    total++;
    const raw = fs.readFileSync(f, 'utf8');
    const s = raw.replace(/href="data:[^"]*"/g, 'href="data:X"');   // base64 из измерений вон
    const rel = path.relative(root, f);

    // --- 1. целостность разметки: дубли атрибутов ломают рендер молча ---
    for (const t of s.match(/<[a-zA-Z][^>]*>/g) || []) {
      const attrs = [...t.matchAll(/\s([a-zA-Z-]+)=/g)].map(m => m[1]);
      const seen = new Set(), dup = new Set();
      for (const a of attrs) { if (seen.has(a)) dup.add(a); seen.add(a); }
      if (dup.size) { add(rel, 'разметка', `дублируется атрибут ${[...dup].join(', ')}`); break; }
    }
    if (/(?:^|[^A-Za-z0-9+/])(NaN|undefined|Infinity)(?:[^A-Za-z0-9+/]|$)/.test(s.replace(/data:X/g, '')))
      add(rel, 'разметка', 'в разметке есть NaN/undefined/Infinity');

    // --- 2. лист и группа содержимого ---
    const w = +(s.match(/\swidth="(\d+)"/) || [])[1], h = +(s.match(/\sheight="(\d+)"/) || [])[1];
    if (w !== PAGE.w || h !== PAGE.h) add(rel, 'формат', `лист ${w}×${h} вместо 1587×1123`);
    const tr = s.match(/<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)"/);
    if (!tr) { add(rel, 'компоновка', 'нет группы содержимого с transform'); continue; }
    const [ox, oy, k] = [+tr[1], +tr[2], +tr[3]];
    const gStart = s.indexOf('>', s.indexOf('scale(')) + 1;
    // содержимое кончается там, где начинается основная надпись: она рисуется
    // в координатах листа, а не внутри масштабируемой группы
    const stampAt = s.indexOf('<g data-el="stamp"');
    const gEnd = stampAt > 0 ? stampAt : s.lastIndexOf('</g>');
    const inner = s.slice(gStart, gEnd);

    // --- 3. штамп: масштаб, номер листа, «листов N» ---
    const dataScale = (s.match(/data-scale="1:(\d+)"/) || [])[1];
    const stampScale = (s.match(/>М 1:(\d+)</) || [])[1];
    if (!dataScale) add(rel, 'штамп', 'нет data-scale');
    if (stampScale && dataScale && stampScale !== dataScale)
      add(rel, 'штамп', `в штампе М 1:${stampScale}, фактически 1:${dataScale}`);
    const type = (s.match(/data-sheet="([^"]+)"/) || [])[1];
    if (!type || type === 'other') add(rel, 'тип', `тип листа «${type || 'нет'}» — аудит применит общий чек-лист`);
    // «Лист N» и «Листов M» стоят в штампе жирным
    const stampNums = [...s.slice(gEnd).matchAll(/font-size="12" font-weight="600"[^>]*>(\d+|—)</g)].map(m => m[1]);
    if (stampNums.length >= 2) {
      const [no, tot] = stampNums.slice(-2).map(Number);
      if (seenNo.has(no)) add(rel, 'нумерация', `номер листа ${no} уже занят (${seenNo.get(no)})`);
      seenNo.set(no, rel);
      if (declaredTotal === null) declaredTotal = tot;
      else if (declaredTotal !== tot) add(rel, 'нумерация', `в штампе «Листов ${tot}», на других листах ${declaredTotal}`);
      if (no > tot) add(rel, 'нумерация', `номер листа ${no} больше заявленного количества ${tot}`);
    } else add(rel, 'штамп', 'не читается номер листа');

    // --- 4. содержимое за рамкой и наезд на основную надпись ---
    const fx = PAGE.ml, fy = PAGE.mt, fw = PAGE.w - PAGE.ml - PAGE.mr, fh = PAGE.h - PAGE.mt - PAGE.mb;
    const toPage = (x, y) => [ox + x * k, oy + y * k];
    const stampBox = { x0: fx + fw - STAMP.w, y0: fy + fh - STAMP.h, x1: fx + fw, y1: fy + fh };
    let outFrame = 0, onStamp = 0, worst = 0;
    for (const m of inner.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)"([^>]*)>([^<]*)</g)) {
      const [, xs, ys, attrs, txt] = m;
      if (!txt.trim() || /rotate/.test(attrs)) continue;
      const fs2 = +((attrs.match(/font-size="([\d.]+)"/) || [])[1] || 10);
      const anchor = (attrs.match(/text-anchor="(\w+)"/) || [])[1] || 'start';
      const wTxt = txt.length * fs2 * 0.53;
      const x0m = anchor === 'end' ? +xs - wTxt : anchor === 'middle' ? +xs - wTxt / 2 : +xs;
      const [px0, py0] = toPage(x0m, +ys - fs2 * 0.8);
      const [px1, py1] = toPage(x0m + wTxt, +ys + fs2 * 0.2);
      if (px0 < fx || px1 > fx + fw || py0 < fy || py1 > fy + fh) {
        outFrame++; worst = Math.max(worst, px1 - (fx + fw), fx - px0, py1 - (fy + fh));
      } else if (px1 > stampBox.x0 && px0 < stampBox.x1 && py1 > stampBox.y0 && py0 < stampBox.y1) onStamp++;
    }
    if (outFrame) add(rel, 'за рамкой', `${outFrame} надписей выходят за поле чертежа (до ${Math.round(worst)} px)`);
    if (onStamp) add(rel, 'наезд', `${onStamp} надписей заходят в зону основной надписи`);

    // --- 5. заполнение поля ---
    const nums = [...inner.matchAll(/[xy]\d?="([-\d.]+)"/g)].map(m => +m[1]).filter(v => Number.isFinite(v));
    if (nums.length > 8) {
      const xs = [...inner.matchAll(/\sx\d?="([-\d.]+)"/g)].map(m => +m[1]);
      const ys = [...inner.matchAll(/\sy\d?="([-\d.]+)"/g)].map(m => +m[1]);
      const cw = (Math.max(...xs) - Math.min(...xs)) * k, ch = (Math.max(...ys) - Math.min(...ys)) * k;
      const fill = (cw * ch) / (fw * fh);
      if (fill < 0.18) add(rel, 'пустовато', `содержимое занимает ~${Math.round(fill * 100)}% поля листа`);
    }

    // --- 6. отметки уровня: метры с тремя знаками и запятой ---
    for (const m of inner.matchAll(/data-el="level"[\s\S]{0,400}?>([+\-]?\d+[.,]\d+)</g)) {
      const v = m[1];
      if (!/^[+\-]?\d+,\d{3}$/.test(v)) add(rel, 'отметка', `отметка «${v}» не в формате ±0,000`);
    }
  }
  console.log(`${path.basename(root)}: листов ${files.length}, номера 1…${Math.max(...seenNo.keys())}, в штампе «Листов ${declaredTotal}»`);
  const nos = [...seenNo.keys()].sort((a, b) => a - b);
  for (let i = 1; i <= (declaredTotal || 0); i++) if (!seenNo.has(i)) add(path.basename(root), 'нумерация', `лист ${i} заявлен в штампе, но файла нет`);
}

console.log(`\nПроверено листов: ${total}. Замечаний: ${bad.length}`);
const byKind = {};
for (const b of bad) (byKind[b.kind] = byKind[b.kind] || []).push(b);
for (const k of Object.keys(byKind)) {
  console.log(`\n[${k}] ${byKind[k].length}`);
  for (const b of byKind[k].slice(0, 10)) console.log(`   ${b.f} — ${b.msg}`);
  if (byKind[k].length > 10) console.log(`   … ещё ${byKind[k].length - 10}`);
}
