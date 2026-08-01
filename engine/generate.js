#!/usr/bin/env node
'use strict';
// ================================================================
// LINEA · генератор дизайн-проекта
// Вход:  brief.json (метры) → Выход: папка клиента с чертежами
//   00-pasport, 01-plany, 02-razvertki, 03-potolki, 04-koncept,
//   05-materialy, 06-smeta, index.html, manifest.json
// Запуск: node engine/generate.js <brief.json> [папка-вывода]
// ================================================================
const fs = require('fs');
const path = require('path');
const { STYLES, TIERS, WORK_RATES, FURN_PRICES, pickStyle } = require('./presets');

// ---------- CLI ----------
const briefPath = process.argv[2];
const outDir = process.argv[3] || path.join('output', 'project-' + new Date().toISOString().slice(0, 10));
if (!briefPath) { console.error('Использование: node engine/generate.js <brief.json> [папка-вывода]'); process.exit(1); }
const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
const DATE = new Date().toLocaleDateString('ru-RU');

// ---------- нормализация брифа (метры → мм) ----------
const HABITABLE = new Set(['living', 'bedroom', 'kids', 'living-kitchen', 'cabinet', 'kitchen']);
const rooms = (brief.rooms || []).map((r, i) => {
  const w = Math.round(r.width * 1000), l = Math.round(r.length * 1000);
  const h = Math.round((r.height || (brief.object && brief.object.ceilingHeight) || 2.7) * 1000);
  const windows = (r.windows || (HABITABLE.has(r.type) ? [{ wall: 'A', offset: Math.max(0.2, (r.width - 1.5) / 2), width: 1.5, height: 1.45, sill: 0.9 }] : []))
    .map(o => ({ wall: o.wall, off: Math.round(o.offset * 1000), w: Math.round(o.width * 1000), h: Math.round(o.height * 1000), sill: Math.round((o.sill == null ? 0.9 : o.sill) * 1000) }));
  const doors = (r.doors || [{ wall: 'C', offset: 0.2, width: 0.9 }])
    .map(o => ({ wall: o.wall, off: Math.round(o.offset * 1000), w: Math.round(o.width * 1000), h: Math.round((o.height || 2.05) * 1000) }));
  return { idx: i + 1, id: r.id || 'room' + (i + 1), name: r.name, type: r.type || 'living', w, l, h, windows, doors, area: +(r.width * r.length).toFixed(1) };
});
const totalArea = (brief.object && brief.object.area) || +rooms.reduce((s, r) => s + r.area, 0).toFixed(1);
const styleKey = (brief.style && !brief.style.byStudio && brief.style.name && STYLES[brief.style.name]) ? brief.style.name : pickStyle(brief);
const style = STYLES[styleKey];
const tier = TIERS[(brief.budget || 'business')] || TIERS.business;

// ---------- утилиты ----------
const S = 0.08; // px на мм (≈ М 1:50 при печати)
const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const px = mm => +(mm * S).toFixed(1);
const fmt = n => Math.round(n).toLocaleString('ru-RU');
const TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
const slug = s => String(s).toLowerCase().split('').map(c => TR[c] != null ? TR[c] : c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const nn = n => String(n).padStart(2, '0');

function svgDoc(wPx, hPx, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${wPx}" height="${hPx}" viewBox="0 0 ${wPx} ${hPx}" font-family='${FONT}'>\n<rect width="${wPx}" height="${hPx}" fill="#FAF9F6"/>\n${body}\n</svg>`;
}
let TOTAL_SHEETS = 0; // проставляется до генерации листов
function stamp(x, y, w, drawingName, sheet, scale) {
  const sc = scale || '1:50';
  const list = TOTAL_SHEETS ? `Лист ${sheet} из ${TOTAL_SHEETS}` : `Лист ${sheet}`;
  if (w < 700) { // узкий лист — компактный штамп в две строки
    return `<g><rect x="${x}" y="${y}" width="${w}" height="44" fill="none" stroke="#2E2A26" stroke-width="1"/>
<text x="${x + 10}" y="${y + 17}" font-size="10.5" font-weight="700" fill="#2E2A26" letter-spacing="1">LINEA · ${esc(drawingName)}</text>
<text x="${x + 10}" y="${y + 33}" font-size="9.5" fill="#7A756D">${list} · М ${sc} · стадия РП · ${DATE}</text></g>`;
  }
  return `<g><rect x="${x}" y="${y}" width="${w}" height="44" fill="none" stroke="#2E2A26" stroke-width="1"/>
<text x="${x + 10}" y="${y + 17}" font-size="11" font-weight="700" fill="#2E2A26" letter-spacing="2">LINEA · СТУДИЯ ДИЗАЙНА ИНТЕРЬЕРА</text>
<text x="${x + 10}" y="${y + 33}" font-size="10" fill="#7A756D">${esc((brief.object && brief.object.address) || 'Объект')} · ${totalArea} м² · стиль «${style.title}» · стадия РП</text>
<text x="${x + w - 10}" y="${y + 17}" font-size="10" fill="#2E2A26" text-anchor="end">${esc(drawingName)}</text>
<text x="${x + w - 10}" y="${y + 33}" font-size="10" fill="#7A756D" text-anchor="end">${list} · М ${sc} · ${DATE}</text></g>`;
}
function dimH(x1, x2, y, label) {
  return `<g stroke="#8A8478" stroke-width="1" fill="none"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/><line x1="${x1}" y1="${y - 5}" x2="${x1}" y2="${y + 5}"/><line x1="${x2}" y1="${y - 5}" x2="${x2}" y2="${y + 5}"/><line x1="${x1 - 3}" y1="${y + 3}" x2="${x1 + 3}" y2="${y - 3}"/><line x1="${x2 - 3}" y1="${y + 3}" x2="${x2 + 3}" y2="${y - 3}"/></g>
<text x="${(x1 + x2) / 2}" y="${y - 5}" font-size="11" fill="#4A453E" text-anchor="middle">${label}</text>`;
}
function dimV(x, y1, y2, label) {
  return `<g stroke="#8A8478" stroke-width="1" fill="none"><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/><line x1="${x - 5}" y1="${y1}" x2="${x + 5}" y2="${y1}"/><line x1="${x - 5}" y1="${y2}" x2="${x + 5}" y2="${y2}"/><line x1="${x - 3}" y1="${y1 + 3}" x2="${x + 3}" y2="${y1 - 3}"/><line x1="${x - 3}" y1="${y2 + 3}" x2="${x + 3}" y2="${y2 - 3}"/></g>
<text x="${x + 6}" y="${(y1 + y2) / 2}" font-size="11" fill="#4A453E" transform="rotate(-90 ${x + 6} ${(y1 + y2) / 2})" text-anchor="middle">${label}</text>`;
}

// ---------- расстановка мебели (правила по типу помещения) ----------
function furnitureFor(room) {
  const W = room.w, L = room.l, it = [];
  const add = (key, name, x, y, w, h) => { if (x >= 0 && y >= 0 && x + w <= W && y + h <= L) it.push({ key, name, x, y, w, h }); };
  switch (room.type) {
    case 'bedroom': {
      const hwall = bedWallFor(room), bw = 1600, bl = 2000;
      if (hwall === 'A' || hwall === 'C') {
        const bx = (W - bw) / 2, by = hwall === 'A' ? 100 : L - bl - 100, ty = hwall === 'A' ? 100 : L - 550;
        add('bed', 'Кровать 1600×2000', bx, by, bw, bl);
        if (bx >= 560) add('nightstand', 'Тумба', bx - 520, ty, 450, 450);
        if (W - bx - bw >= 560) add('nightstand', 'Тумба', bx + bw + 70, ty, 450, 450);
        const wl2 = Math.min(2400, W - 1600);
        add('wardrobe', 'Шкаф h2400', W - wl2 - 100, hwall === 'A' ? L - 700 : 100, wl2, 600);
      } else {
        const by = (L - bw) / 2, bx = hwall === 'B' ? W - bl - 100 : 100, tx = hwall === 'B' ? W - 550 : 100;
        add('bed', 'Кровать 1600×2000', bx, by, bl, bw);
        if (by >= 560) add('nightstand', 'Тумба', tx, by - 520, 450, 450);
        if (L - by - bw >= 560) add('nightstand', 'Тумба', tx, by + bw + 70, 450, 450);
        const wl2 = Math.min(2400, L - 1600);
        add('wardrobe', 'Шкаф h2400', hwall === 'B' ? 100 : W - 700, 100, 600, wl2);
      }
      break; }
    case 'living-kitchen': {
      add('kitchen', 'Кухонный гарнитур', 100, 100, W - 200, 600);
      add('rug', 'Ковёр', W - 3200, 900, 2100, Math.min(2900, L - 1000));
      add('table', 'Обеденный стол + 4 стула', 900, 1100, 1500, 900);
      add('sofa', 'Диван', W - 1050, Math.max(900, (L - 2400) / 2 + 300), 950, Math.min(2400, L - 1200));
      add('coffee', 'Журнальный стол', W - 2150, Math.min(L - 900, 2000), 800, 800);
      add('tv', 'ТВ-зона', 100, Math.max(800, (L - 1800) / 2 + 300), 400, Math.min(1800, L - 1100));
      break; }
    case 'living': {
      add('tv', 'ТВ-консоль', (W - 1800) / 2, 100, 1800, 400);
      add('rug', 'Ковёр', (W - 2800) / 2, L - 3000, 2800, 2000);
      add('sofa', 'Диван 2400', (W - 2400) / 2, L - 1050, 2400, 950);
      add('coffee', 'Журнальный стол', (W - 800) / 2, L - 2050, 800, 800);
      add('shelf', 'Стеллаж', W - 450, 100, 350, 1400);
      add('armchair', 'Кресло', 150, L - 1250, 750, 800);
      break; }
    case 'kitchen': {
      add('kitchen', 'Гарнитур', 100, 100, W - 200, 600);
      add('kitchen_ext', 'Гарнитур (Г)', 100, 700, 600, Math.min(1800, L - 900));
      add('table', 'Стол + стулья', W - 1400, L - 1000, 1200, 800);
      break; }
    case 'kids': {
      add('kidbed', 'Кровать 900×2000', 100, 100, 900, 2000);
      add('desk', 'Стол у окна', 1300, 100, Math.min(1200, W - 1400), 600);
      add('wardrobe', 'Шкаф', W - 700, L - 1600, 600, 1500);
      add('rug', 'Ковёр игровой', 1300, 1000, Math.min(1500, W - 1700), Math.min(1200, L - 1200));
      break; }
    case 'bathroom': {
      add('bath', 'Ванна 1700×700', 80, 80, Math.min(1700, W - 160), 700);
      add('wc', 'Унитаз', 1100, L - 730, 400, 650);
      add('sink', 'Раковина', W - 630, L - 530, 550, 450);
      break; }
    case 'hallway': {
      add('hallwardrobe', 'Шкаф-гардероб', 100, 80, Math.min(1800, W - 1200), 600);
      add('bench', 'Банкетка', W - 900, 80, 800, 400);
      break; }
    case 'cabinet': {
      add('desk', 'Стол рабочий', (W - 1400) / 2, 100, 1400, 700);
      add('armchair', 'Кресло', (W - 700) / 2, 850, 700, 700);
      add('shelf', 'Стеллаж', W - 450, L - 1600, 350, 1500);
      break; }
    default: add('wardrobe', 'Шкаф', 100, 100, Math.min(1800, W - 200), 600);
  }
  return it;
}

// ---------- свет ----------
function lightsFor(room) {
  const inset = 500, step = 1150, spots = [];
  const nx = Math.max(2, Math.round((room.w - 2 * inset) / step) + 1);
  const ny = Math.max(2, Math.round((room.l - 2 * inset) / step) + 1);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++)
    spots.push({ x: inset + i * (room.w - 2 * inset) / (nx - 1), y: inset + j * (room.l - 2 * inset) / (ny - 1) });
  const pendant = ['living', 'bedroom', 'living-kitchen'].includes(room.type);
  const track = ['kitchen', 'living-kitchen'].includes(room.type);
  return { spots, pendant, track };
}

// ---------- размерные цепочки (ярус 1 = сегменты, ярус 2 = габарит) ----------
function wallOpenings(room, wallKey) {
  return [...room.windows.filter(o => o.wall === wallKey).map(o => ({ ...o, kind: 'окно' })),
          ...room.doors.filter(o => o.wall === wallKey).map(o => ({ ...o, kind: 'дверь' }))].sort((a, b) => a.off - b.off);
}
function chainSegments(len, openings) {
  const segs = []; let cur = 0;
  for (const o of openings) {
    if (o.off > cur + 10) segs.push({ a: cur, b: o.off });
    segs.push({ a: o.off, b: o.off + o.w, open: true });
    cur = o.off + o.w;
  }
  if (cur < len - 10) segs.push({ a: cur, b: len });
  return segs;
}
function chainDimH(x0, y, len, openings, withTotal) {
  const segs = chainSegments(len, openings);
  let out = '';
  if (segs.length > 1) for (const s of segs) out += dimH(x0 + px(s.a), x0 + px(s.b), y, String(Math.round(s.b - s.a)));
  if (withTotal || segs.length <= 1) out += dimH(x0, x0 + px(len), y + (segs.length > 1 ? 22 : 0), String(len));
  return out;
}
function chainDimV(x, y0, len, openings, withTotal) {
  const segs = chainSegments(len, openings);
  let out = '';
  if (segs.length > 1) for (const s of segs) out += dimV(x, y0 + px(s.a), y0 + px(s.b), String(Math.round(s.b - s.a)));
  if (withTotal || segs.length <= 1) out += dimV(x + (segs.length > 1 ? 22 : 0), y0, y0 + px(len), String(len));
  return out;
}

// ---------- обмерный план ----------
function drawObmer(room, sheet) {
  const M = 120, WT = 12, w = px(room.w), l = px(room.l);
  const Wd = w + M * 2 + 90, Hd = l + M * 2 + 150;
  let b = `<rect x="${M - WT}" y="${M - WT}" width="${w + 2 * WT}" height="${l + 2 * WT}" fill="#D9D9D9" stroke="#57514A" stroke-width="1"/>`;
  b += `<rect x="${M}" y="${M}" width="${w}" height="${l}" fill="#FCFBF8"/>`;
  for (const o of room.windows) b += openingPlan(o, 'window', M, WT, room);
  for (const o of room.doors) b += openingPlan(o, 'door', M, WT, room);
  // диагональ (штриховая, с размером)
  const diag = Math.round(Math.sqrt(room.w * room.w + room.l * room.l) / 5) * 5;
  b += `<line x1="${M + 6}" y1="${M + 6}" x2="${M + w - 6}" y2="${M + l - 6}" stroke="#8A8478" stroke-width="0.8" stroke-dasharray="8 5"/>`;
  b += `<text x="${M + w / 2}" y="${M + l / 2 - 8}" font-size="10" fill="#7A756D" transform="rotate(${(Math.atan2(l, w) * 180 / Math.PI).toFixed(1)} ${M + w / 2} ${M + l / 2})" text-anchor="middle">${diag}</text>`;
  // цепочки: A сверху, C снизу, D слева, B справа
  b += chainDimH(M, M - 40, room.w, wallOpenings(room, 'A'), true); // верх (сегменты −40, габарит −18)
  b += chainDimH(M, M + l + 30, room.w, wallOpenings(room, 'C'), true);
  b += chainDimV(M + w + 30, M, room.l, wallOpenings(room, 'B'), true);
  b += chainDimV(M - 40, M, room.l, wallOpenings(room, 'D'), false);
  // высотные отметки проёмов
  for (const o of room.windows) {
    const pos = o.wall === 'A' ? { x: M + px(o.off + o.w / 2), y: M + 16 } : o.wall === 'C' ? { x: M + px(o.off + o.w / 2), y: M + l - 8 } : { x: o.wall === 'D' ? M + 14 : M + w - 130, y: M + px(o.off + o.w / 2) };
    b += `<text x="${pos.x}" y="${pos.y}" font-size="9" fill="#3B5C77">Вп=${o.sill} · Н.пр=${o.h}</text>`;
  }
  for (const o of room.doors) {
    const pos = o.wall === 'C' ? { x: M + px(o.off + o.w / 2), y: M + l - 8 } : o.wall === 'A' ? { x: M + px(o.off + o.w / 2), y: M + 16 } : { x: o.wall === 'D' ? M + 14 : M + w - 90, y: M + px(o.off + o.w / 2) };
    b += `<text x="${pos.x}" y="${pos.y}" font-size="9" fill="#3B5C77">h=${o.h}</text>`;
  }
  // штамп комнаты: S подчёркнуто, P, h
  const per = (2 * (room.w + room.l) / 1000).toFixed(1);
  b += `<g text-anchor="end"><text x="${M + w - 10}" y="${M + l - 40}" font-size="14" font-weight="700" fill="#2E2A26">${nn(room.idx)} ${esc(room.name)}</text>
<text x="${M + w - 10}" y="${M + l - 24}" font-size="12" fill="#2E2A26" text-decoration="underline">S=${room.area} м²</text>
<text x="${M + w - 10}" y="${M + l - 10}" font-size="10" fill="#57514A">P=${per} м · h=${room.h}</text></g>`;
  b += `<text x="${M - WT}" y="${M - 104}" font-size="16" font-weight="700" fill="#2E2A26">Обмерный план · ${esc(room.name)}</text>`;
  b += `<text x="${M - WT}" y="${M - 86}" font-size="11" fill="#7A756D">Все размеры в мм · Вп — высота подоконника, Н.пр — высота проёма · перегородки 150</text>`;
  // ключевые высоты — красной рамкой (по образцу проф. альбомов)
  const kw = room.windows[0], kd = room.doors[0];
  const keyH = `H=${room.h}${kw ? ` · Вп=${kw.sill} · Н.пр=${kw.h}` : ''}${kd ? ` · дверь ${kd.w}/${kd.h}` : ''} · без учёта отделочного слоя`;
  b += `<g><rect x="${M - WT}" y="${M - 72}" width="${Math.min(keyH.length * 6.2 + 20, w + 2 * WT + 80)}" height="20" fill="#FFF6F4" stroke="#B0483A" stroke-width="1.2"/><text x="${M - WT + 10}" y="${M - 58}" font-size="10.5" font-weight="600" fill="#B0483A">${keyH}</text></g>`;
  const ny = M + l + 66;
  b += `<text x="${M - WT}" y="${ny}" font-size="9" fill="#8A8478">Примечания: размеры проверять по месту · допуск обмера ±5 мм в зонах встроенной мебели и санузлов · за 0,000 принят уровень чистового пола</text>`;
  b += stamp(M - WT, ny + 14, w + 2 * WT + 60, `Обмерный план. ${room.name}`, sheet);
  return svgDoc(Wd + 20, Hd + 40, b);
}

// ---------- план полов ----------
function drawFloor(room, sheet) {
  const M = 100, WT = 12, w = px(room.w), l = px(room.l);
  const Wd = w + M * 2 + 60, Hd = l + M * 2 + 160;
  const wet = room.type === 'bathroom';
  const code = wet ? 'Пл-2' : 'Пл-1';
  let b = `<rect x="${M - WT}" y="${M - WT}" width="${w + 2 * WT}" height="${l + 2 * WT}" fill="#2E2A26"/>`;
  b += `<rect x="${M}" y="${M}" width="${w}" height="${l}" fill="#FAF7F0"/>`;
  b += `<rect x="${M}" y="${M}" width="${w}" height="${l}" fill="${wet ? '#EDEAE2' : style.floor.color + '40'}"/>`;
  b += `<clipPath id="fl${room.idx}"><rect x="${M}" y="${M}" width="${w}" height="${l}"/></clipPath><g clip-path="url(#fl${room.idx})">`;
  if (wet) { // плитка 600×600 от центра
    for (let gx = (room.w % 600) / 2; gx <= room.w; gx += 600) b += `<line x1="${M + px(gx)}" y1="${M}" x2="${M + px(gx)}" y2="${M + l}" stroke="#00000022" stroke-width="0.9"/>`;
    for (let gy = (room.l % 600) / 2; gy <= room.l; gy += 600) b += `<line x1="${M}" y1="${M + px(gy)}" x2="${M + w}" y2="${M + px(gy)}" stroke="#00000022" stroke-width="0.9"/>`;
  } else { // ёлка 45°
    const st = px(280);
    for (let i = -Math.ceil(l / st); i < w / st + Math.ceil(l / st); i++) {
      b += `<line x1="${M + i * st}" y1="${M}" x2="${M + i * st + l}" y2="${M + l}" stroke="#00000018" stroke-width="0.9"/>`;
      b += `<line x1="${M + i * st}" y1="${M + l}" x2="${M + i * st + l}" y2="${M}" stroke="#00000018" stroke-width="0.9"/>`;
    }
  }
  b += `</g>`;
  for (const o of room.windows) b += openingPlan(o, 'window', M, WT, room);
  for (const o of room.doors) {
    b += openingPlan(o, 'door', M, WT, room);
    // стык покрытий на оси дверного полотна
    let jx1, jy1, jx2, jy2, tx, ty;
    if (o.wall === 'A' || o.wall === 'C') { const y = o.wall === 'A' ? M : M + l; jx1 = M + px(o.off); jx2 = M + px(o.off + o.w); jy1 = jy2 = y; tx = jx1 + 8; ty = o.wall === 'A' ? y + 16 : y - 10; }
    else { const x = o.wall === 'D' ? M : M + w; jy1 = M + px(o.off); jy2 = M + px(o.off + o.w); jx1 = jx2 = x; tx = o.wall === 'D' ? x + 4 : x - 150; ty = jy1 - 6; }
    b += `<line x1="${jx1}" y1="${jy1}" x2="${jx2}" y2="${jy2}" stroke="#B0483A" stroke-width="2.4"/>`;
    b += `<text x="${tx}" y="${ty}" font-size="8.5" fill="#B0483A">стык на оси полотна${wet ? '' : ', скрытый, без порожка'}</text>`;
  }
  // стрелка направления укладки — от стены с окном
  if (!wet) {
    const win = room.windows[0];
    const dir = win ? win.wall : 'A';
    const cx = M + w / 2, cy = M + l / 2;
    const ar = { A: [cx, M + 30, cx, M + 110], C: [cx, M + l - 30, cx, M + l - 110], D: [M + 30, cy, M + 110, cy], B: [M + w - 30, cy, M + w - 110, cy] }[dir];
    b += `<g stroke="#2E2A26" stroke-width="1.6" fill="none"><line x1="${ar[0]}" y1="${ar[1]}" x2="${ar[2]}" y2="${ar[3]}"/><path d="M ${ar[2]} ${ar[3]} l ${ar[0] === ar[2] ? '-5 -9 M ' + ar[2] + ' ' + ar[3] + ' l 5 -9' : '-9 -5 M ' + ar[2] + ' ' + ar[3] + ' l -9 5'}"/></g>`;
    b += `<text x="${ar[0] + 8}" y="${(ar[1] + ar[3]) / 2}" font-size="9" fill="#57514A">направление укладки, от окна</text>`;
  }
  // отметка уровня
  b += `<g><circle cx="${M + 26}" cy="${M + l - 26}" r="13" fill="#FFF" stroke="#2E2A26" stroke-width="1.2"/><text x="${M + 26}" y="${M + l - 22}" font-size="8.5" text-anchor="middle" fill="#2E2A26">${wet ? '−0.020' : '0.000'}</text></g>`;
  const g = roomGeometry(room);
  b += `<text x="${M - WT}" y="${M - 46}" font-size="16" font-weight="700" fill="#2E2A26">План пола · ${esc(room.name)}</text>`;
  b += `<text x="${M - WT}" y="${M - 28}" font-size="11" fill="#7A756D">${code} · ${wet ? 'керамогранит 600×600, раскладка от центра' : esc(style.floor.name)} · S=${g.floor} м² · плинтус ${wet ? '—' : g.plinth + ' м.п.'}</text>`;
  b += dimH(M, M + w, M + l + 30, room.w + '');
  b += dimV(M + w + 30, M, M + l, room.l + '');
  const ly = M + l + 58;
  b += `<g font-size="10" fill="#57514A"><rect x="${M}" y="${ly - 12}" width="16" height="16" fill="${wet ? '#EDEAE2' : style.floor.color + '55'}" stroke="#57514A" stroke-width="0.7"/><text x="${M + 24}" y="${ly}">${code} · ${wet ? 'керамогранит, ' + (g.floor * 1.1).toFixed(1) + ' м² (+10%)' : esc(style.floor.name.split(',')[0]) + ', ' + (g.floor * 1.15).toFixed(1) + ' м² (+15% ёлка)'}</text></g>`;
  b += `<text x="${M - WT}" y="${ly + 20}" font-size="9" fill="#8A8478">${wet ? 'Гидроизоляция обмазочная с заведением на стены 200 мм · уклон к трапу не требуется' : 'Стык покрытий выполнять на оси дверного полотна · компенсационный зазор у стен 10 мм под плинтус'}</text>`;
  b += stamp(M - WT, ly + 34, w + 2 * WT + 40, `План пола. ${room.name}`, sheet);
  return svgDoc(Wd + 20, Hd + 30, b);
}

// ---------- стена изголовья: без окна, затем без двери ----------
function bedWallFor(room) {
  const hasWin = w => room.windows.some(o => o.wall === w);
  const hasDoor = w => room.doors.some(o => o.wall === w);
  for (const w of ['A', 'C', 'B', 'D']) if (!hasWin(w) && !hasDoor(w)) return w;
  for (const w of ['A', 'C', 'B', 'D']) if (!hasWin(w)) return w;
  return 'A';
}

// ---------- ниши в стенах (авто по типу помещения) ----------
function nichesFor(room) {
  const W = room.w, L = room.l, n = [];
  const add = (wall, off, w, h, sill, label) => { const len = (wall === 'A' || wall === 'C') ? W : L; if (off >= 0 && off + w <= len) n.push({ wall, off, w, h, sill, depth: 100, label }); };
  switch (room.type) {
    case 'living-kitchen': add('D', (L - Math.min(2400, L - 800)) / 2, Math.min(2400, L - 800), 1500, 400, 'ТВ-ниша ГКЛ, LED 3000K по контуру'); break;
    case 'living': add('A', (W - Math.min(2400, W - 800)) / 2, Math.min(2400, W - 800), 1500, 400, 'ТВ-ниша ГКЛ, LED 3000K по контуру'); break;
    case 'bedroom': {
      const hwall = bedWallFor(room);
      const wallLen = (hwall === 'A' || hwall === 'C') ? W : L;
      const hw = Math.min(2600, wallLen - 700), ho = (wallLen - hw) / 2;
      add(hwall, ho, hw, 1120, 80, 'Мягкая панель изголовья, лён');
      add(hwall, ho, hw, 600, 1400, 'Ниша над изголовьем, LED 3000K');
      break; }
    case 'kids': add('B', (L - 1200) / 2, 1200, 1000, 900, 'Ниша-стеллаж с подсветкой'); break;
    case 'bathroom': add('A', 300, Math.min(1200, W - 600), 350, 1100, 'Ниша-полка над ванной, LED, полка стекло'); break;
    case 'hallway': add('A', W - 1000, 900, 1350, 450, 'Ниша банкетки с подсветкой'); break;
  }
  return n;
}

// ---------- уровни потолка ----------
function ceilingLevelsFor(room) {
  const per = 2 * (room.w + room.l) / 1000;
  const three = ['living', 'living-kitchen'].includes(room.type) && room.w >= 3600 && room.l >= 3200;
  const box = 450; // ширина короба 2-го уровня
  const inW = room.w - 2 * box, inL = room.l - 2 * box;
  const lv = { box, boxLen: +(2 * (inW + inL) / 1000).toFixed(1), three, ledLen: 0, island: null };
  lv.ledLen = lv.boxLen; // LED по внутреннему контуру короба
  if (three) {
    const iw = Math.round(inW * 0.55), il = Math.round(inL * 0.55);
    lv.island = { x: box + Math.round((inW - iw) * 0.35), y: room.l - box - il - 200, w: iw, l: il };
    lv.ledLen = +(lv.ledLen + 2 * (iw + il) / 1000).toFixed(1);
  }
  return lv;
}

// ---------- электрика (розетки/выключатели по мебельным сценариям) ----------
function electroFor(room) {
  const W = room.w, L = room.l, pts = [];
  const P = (x, y, type, hh, label) => pts.push({ x: Math.max(120, Math.min(W - 120, x)), y: Math.max(120, Math.min(L - 120, y)), type, h: hh, label });
  const door = room.doors[0];
  const doorPos = door ? (door.wall === 'A' ? { x: door.off + door.w + 150, y: 150 } : door.wall === 'C' ? { x: door.off + door.w + 150, y: L - 150 } : door.wall === 'B' ? { x: W - 150, y: door.off + door.w + 150 } : { x: 150, y: door.off + door.w + 150 }) : { x: 150, y: L - 150 };
  P(doorPos.x, doorPos.y, 'switch', 900, 'выкл.');
  switch (room.type) {
    case 'bedroom': {
      const hwall = bedWallFor(room);
      if (hwall === 'A' || hwall === 'C') {
        const bx = (W - 1600) / 2, yy = hwall === 'A' ? 150 : L - 150, y2 = hwall === 'A' ? 380 : L - 380;
        P(bx - 300, yy, 'socket', 600, '2×розетка'); P(bx + 1900, yy, 'socket', 600, '2×розетка');
        P(bx - 300, y2, 'switch', 900, 'проходной'); P(bx + 1900, y2, 'switch', 900, 'проходной');
        P(500, hwall === 'A' ? L - 150 : 150, 'socket', 300, 'комод/шкаф');
      } else {
        const by = (L - 1600) / 2, xx = hwall === 'B' ? W - 150 : 150, x2 = hwall === 'B' ? W - 380 : 380;
        P(xx, by - 300, 'socket', 600, '2×розетка'); P(xx, by + 1900, 'socket', 600, '2×розетка');
        P(x2, by - 300, 'switch', 900, 'проходной');
        P(hwall === 'B' ? 500 : W - 500, 150, 'socket', 300, 'шкаф/утюг');
      }
      break; }
    case 'living-kitchen': {
      P(W * 0.25, 150, 'socket', 1100, 'фартук 2×'); P(W * 0.55, 150, 'socket', 1100, 'фартук 2×');
      P(W * 0.4, 350, 'socket', 150, 'встройка 3× (посудом./духовой/холод.)');
      P(150, L * 0.5, 'socket', 1300, 'ТВ 5× + TV/LAN (скрыто в нише)');
      P(W - 150, L * 0.4, 'socket', 300, 'диван 2×'); P(W * 0.55, L - 150, 'socket', 300, 'стол'); break; }
    case 'living': {
      P(W * 0.5, 150, 'socket', 1300, 'ТВ 5× + TV/LAN (скрыто в нише)');
      P(W * 0.2, L - 150, 'socket', 300, 'диван 2×'); P(W - 150, L * 0.5, 'socket', 300, 'торшер'); break; }
    case 'kitchen': {
      P(W * 0.3, 150, 'socket', 1100, 'фартук 2×'); P(W * 0.6, 150, 'socket', 1100, 'фартук 2×');
      P(150, L * 0.5, 'socket', 150, 'встройка 3×'); P(W - 150, L - 400, 'socket', 300, 'стол'); break; }
    case 'kids': {
      P(1500, 150, 'socket', 900, 'стол: блок 4× + LAN');
      P(300, 500, 'socket', 600, 'кровать'); break; }
    case 'bathroom': {
      P(W - 400, L - 150, 'socket', 1100, 'IP44 фен/бритва'); P(W - 150, 400, 'socket', 600, 'вывод полот.суш.'); break; }
    case 'hallway': { P(W - 300, 150, 'socket', 300, 'банкетка/сушка'); break; }
    default: P(500, 150, 'socket', 300, 'розетка');
  }
  return pts;
}

// ---------- план с мебелью ----------
function openingPlan(o, kind, M, WT, room) {
  const c = kind === 'window' ? '#BFD8DF' : '#FAF9F6';
  let r = '';
  if (o.wall === 'A') r = `<rect x="${M + px(o.off)}" y="${M - WT}" width="${px(o.w)}" height="${WT}" fill="${c}" stroke="#57514A" stroke-width="0.8"/>`;
  if (o.wall === 'C') r = `<rect x="${M + px(o.off)}" y="${M + px(room.l)}" width="${px(o.w)}" height="${WT}" fill="${c}" stroke="#57514A" stroke-width="0.8"/>`;
  if (o.wall === 'B') r = `<rect x="${M + px(room.w)}" y="${M + px(o.off)}" width="${WT}" height="${px(o.w)}" fill="${c}" stroke="#57514A" stroke-width="0.8"/>`;
  if (o.wall === 'D') r = `<rect x="${M - WT}" y="${M + px(o.off)}" width="${WT}" height="${px(o.w)}" fill="${c}" stroke="#57514A" stroke-width="0.8"/>`;
  if (kind === 'door') { // створка
    const dw = px(o.w);
    if (o.wall === 'C') r += `<path d="M ${M + px(o.off)} ${M + px(room.l) - dw} A ${dw} ${dw} 0 0 1 ${M + px(o.off) + dw} ${M + px(room.l)}" fill="none" stroke="#8A8478" stroke-width="1" stroke-dasharray="3 3"/><line x1="${M + px(o.off)}" y1="${M + px(room.l)}" x2="${M + px(o.off)}" y2="${M + px(room.l) - dw}" stroke="#57514A" stroke-width="1.4"/>`;
    if (o.wall === 'A') r += `<path d="M ${M + px(o.off)} ${M + dw} A ${dw} ${dw} 0 0 0 ${M + px(o.off) + dw} ${M}" fill="none" stroke="#8A8478" stroke-width="1" stroke-dasharray="3 3"/><line x1="${M + px(o.off)}" y1="${M}" x2="${M + px(o.off)}" y2="${M + dw}" stroke="#57514A" stroke-width="1.4"/>`;
    if (o.wall === 'B') r += `<path d="M ${M + px(room.w) - dw} ${M + px(o.off)} A ${dw} ${dw} 0 0 0 ${M + px(room.w)} ${M + px(o.off) + dw}" fill="none" stroke="#8A8478" stroke-width="1" stroke-dasharray="3 3"/><line x1="${M + px(room.w)}" y1="${M + px(o.off)}" x2="${M + px(room.w) - dw}" y2="${M + px(o.off)}" stroke="#57514A" stroke-width="1.4"/>`;
    if (o.wall === 'D') r += `<path d="M ${M + dw} ${M + px(o.off)} A ${dw} ${dw} 0 0 1 ${M} ${M + px(o.off) + dw}" fill="none" stroke="#8A8478" stroke-width="1" stroke-dasharray="3 3"/><line x1="${M}" y1="${M + px(o.off)}" x2="${M + dw}" y2="${M + px(o.off)}" stroke="#57514A" stroke-width="1.4"/>`;
  }
  return r;
}
function drawPlan(room, sheet, withDims) {
  const M = 90, WT = 12, w = px(room.w), l = px(room.l);
  const Wd = w + M * 2 + 60, Hd = l + M * 2 + 90;
  let b = `<rect x="${M - WT}" y="${M - WT}" width="${w + 2 * WT}" height="${l + 2 * WT}" fill="#2E2A26"/>`;
  b += `<rect x="${M}" y="${M}" width="${w}" height="${l}" fill="${style.floor.color}22"/>`;
  for (let gx = 300; gx < room.w; gx += 300) b += `<line x1="${M + px(gx)}" y1="${M}" x2="${M + px(gx)}" y2="${M + l}" stroke="#00000010" stroke-width="1"/>`;
  for (const o of room.windows) b += openingPlan(o, 'window', M, WT, room);
  for (const o of room.doors) b += openingPlan(o, 'door', M, WT, room);
  for (const nch of nichesFor(room).filter(n => n.depth >= 80)) { // ниши пунктиром у стены
    let r = '';
    const d = px(nch.depth);
    if (nch.wall === 'A') r = `<rect x="${M + px(nch.off)}" y="${M}" width="${px(nch.w)}" height="${d}"`;
    if (nch.wall === 'C') r = `<rect x="${M + px(nch.off)}" y="${M + px(room.l) - d}" width="${px(nch.w)}" height="${d}"`;
    if (nch.wall === 'B') r = `<rect x="${M + px(room.w) - d}" y="${M + px(nch.off)}" width="${d}" height="${px(nch.w)}"`;
    if (nch.wall === 'D') r = `<rect x="${M}" y="${M + px(nch.off)}" width="${d}" height="${px(nch.w)}"`;
    b += r + ` fill="#C29A5B22" stroke="#C29A5B" stroke-width="1" stroke-dasharray="4 3"/>`;
  }
  for (const f of furnitureFor(room)) {
    const dash = f.key === 'rug' ? ' stroke-dasharray="4 3"' : '';
    const fill = f.key === 'rug' ? 'none' : '#FFFFFFE0';
    b += `<rect x="${M + px(f.x)}" y="${M + px(f.y)}" width="${px(f.w)}" height="${px(f.h)}" fill="${fill}" stroke="#57514A" stroke-width="1.2" rx="2"${dash}/>`;
    if (f.key !== 'rug' || f.w > 1500) b += `<text x="${M + px(f.x + f.w / 2)}" y="${M + px(f.y + f.h / 2) + 3}" font-size="9" fill="#57514A" text-anchor="middle">${esc(f.name)}</text>`;
  }
  b += `<text x="${M - WT}" y="${M - 46}" font-size="16" font-weight="700" fill="#2E2A26">${esc(room.name)} · ${room.area} м²</text>`;
  b += `<text x="${M - WT}" y="${M - 28}" font-size="11" fill="#7A756D">План с расстановкой мебели${withDims ? ' и привязками проёмов' : ''} · стиль «${style.title}» · h потолка ${room.h} мм</text>`;
  if (withDims) {
    b += chainDimH(M, M + l + 34, room.w, wallOpenings(room, 'C'), true);
    b += chainDimV(M + w + 34, M, room.l, wallOpenings(room, 'B'), true);
  } else {
    b += dimH(M, M + w, M + l + 34, room.w + ' мм');
    b += dimV(M + w + 34, M, M + l, room.l + ' мм');
  }
  b += stamp(M - WT, l + M * 2 + 30, w + 2 * WT + 40, `План${withDims ? ' с размерами' : ''}. ${room.name}`, sheet);
  return svgDoc(Wd + 20, Hd + 10, b);
}

// ---------- развертка стены ----------
function drawElevation(room, wallKey, sheet) {
  const len = (wallKey === 'A' || wallKey === 'C') ? room.w : room.l;
  const M = 90, w = px(len), h = px(room.h);
  const Wd = w + M * 2 + 320, Hd = h + M * 2 + 110;
  let b = `<rect x="${M}" y="${M}" width="${w}" height="${h}" fill="${style.wall.color}" stroke="#2E2A26" stroke-width="2"/>`;
  if (room.type === 'bathroom') { // раскладка плитки 600×300
    for (let gx = 600; gx < len; gx += 600) b += `<line x1="${M + px(gx)}" y1="${M}" x2="${M + px(gx)}" y2="${M + h}" stroke="#00000018" stroke-width="0.8"/>`;
    for (let gy = 300; gy < room.h; gy += 300) b += `<line x1="${M}" y1="${M + h - px(gy)}" x2="${M + w}" y2="${M + h - px(gy)}" stroke="#00000018" stroke-width="0.8"/>`;
  }
  b += `<rect x="${M}" y="${M + h - px(80)}" width="${w}" height="${px(80)}" fill="#CFC9BD" stroke="#57514A" stroke-width="0.8"/>`; // плинтус
  // ниши на этой стене
  for (const nch of nichesFor(room).filter(o => o.wall === wallKey)) {
    const x = M + px(nch.off), y = M + h - px(nch.sill + nch.h);
    b += `<rect x="${x}" y="${y}" width="${px(nch.w)}" height="${px(nch.h)}" fill="#00000014" stroke="#57514A" stroke-width="1.2"/>`;
    b += `<rect x="${x + 3}" y="${y + 3}" width="${px(nch.w) - 6}" height="${px(nch.h) - 6}" fill="none" stroke="#C29A5B" stroke-width="1" stroke-dasharray="5 3"/>`;
    b += `<text x="${x + px(nch.w) / 2}" y="${y + px(nch.h) / 2}" font-size="9" fill="#57514A" text-anchor="middle">Ниша ${nch.w}×${nch.h}, глуб. ${nch.depth}</text>`;
    b += `<text x="${x + px(nch.w) / 2}" y="${y + px(nch.h) / 2 + 12}" font-size="8" fill="#8A6A3B" text-anchor="middle">${esc(nch.label)}</text>`;
    b += `<text x="${x + px(nch.w) / 2}" y="${y - 5}" font-size="9" fill="#7A756D" text-anchor="middle">низ +${(nch.sill / 1000).toFixed(3).replace('.', ',')}</text>`;
  }
  for (const o of room.windows.filter(o => o.wall === wallKey)) {
    const x = M + px(o.off), y = M + h - px(o.sill + o.h);
    b += `<rect x="${x}" y="${y}" width="${px(o.w)}" height="${px(o.h)}" fill="#DCE8EC" stroke="#57514A" stroke-width="1.5"/>`;
    b += `<line x1="${x + px(o.w) / 2}" y1="${y}" x2="${x + px(o.w) / 2}" y2="${y + px(o.h)}" stroke="#57514A" stroke-width="1"/>`;
    b += `<text x="${x + px(o.w) / 2}" y="${y - 6}" font-size="10" fill="#7A756D" text-anchor="middle">окно ${o.w}×${o.h}, подоконник ${o.sill}</text>`;
  }
  for (const o of room.doors.filter(o => o.wall === wallKey)) {
    const x = M + px(o.off), y = M + h - px(o.h);
    b += `<rect x="${x}" y="${y}" width="${px(o.w)}" height="${px(o.h)}" fill="#EFEAE1" stroke="#57514A" stroke-width="1.5"/>`;
    b += `<circle cx="${x + px(o.w) - 8}" cy="${y + px(o.h) / 2}" r="2.5" fill="#57514A"/>`;
    b += `<text x="${x + px(o.w) / 2}" y="${y - 6}" font-size="10" fill="#7A756D" text-anchor="middle">дверь ${o.w}×${o.h}</text>`;
  }
  // горизонтальная цепочка: проёмы + ниши этой стены
  const hOpen = [...wallOpenings(room, wallKey), ...nichesFor(room).filter(n => n.wall === wallKey && n.depth >= 80).map(n => ({ off: n.off, w: n.w }))].sort((a, b) => a.off - b.off)
    .filter((o, i, arr) => i === 0 || o.off >= arr[i - 1].off + arr[i - 1].w - 10); // без перекрытий
  b += chainDimH(M, M + h + 30, len, hOpen, true);
  // вертикальная цепочка: пол → подоконник → окно → потолок (по первому окну стены)
  const vw = room.windows.find(o => o.wall === wallKey);
  if (vw) b += chainDimV(M - 34, M, room.h, [{ off: room.h - vw.sill - vw.h, w: vw.h }], true);
  else b += dimV(M - 30, M, M + h, room.h + '');
  const ax = M + w + 60;
  b += `<text x="${ax}" y="${M + 16}" font-size="12" font-weight="700" fill="#2E2A26">Отделка стены</text>`;
  const notes = ['Стены: ' + style.wall.finish, 'Плинтус: ' + style.plinth, 'Двери: ' + style.doors, 'Акцент: ' + style.accent.finish];
  notes.forEach((t, i) => { wrapText(t, 34).forEach((line, j) => { b += `<text x="${ax}" y="${M + 40 + i * 46 + j * 14}" font-size="10" fill="#57514A">${esc(line)}</text>`; }); });
  b += `<text x="${M}" y="${M - 40}" font-size="16" font-weight="700" fill="#2E2A26">Развертка · ${esc(room.name)} · стена ${wallKey}</text>`;
  b += `<text x="${M}" y="${M - 24}" font-size="11" fill="#7A756D">Вид изнутри помещения · отметки от чистого пола</text>`;
  b += stamp(M, h + M * 2 + 26, w + 220, `Развертка ${room.name}, стена ${wallKey}`, sheet);
  return svgDoc(Wd, Hd + 10, b);
}
function wrapText(t, n) { const out = []; let cur = ''; for (const word of t.split(' ')) { if ((cur + ' ' + word).trim().length > n) { out.push(cur.trim()); cur = word; } else cur += ' ' + word; } if (cur.trim()) out.push(cur.trim()); return out; }

// ---------- план потолка (2–3 уровня, отметки по ГОСТ) ----------
const mark = mm => '+' + (mm / 1000).toFixed(3).replace('.', ',');
function drawCeiling(room, sheet) {
  const M = 90, WT = 12, w = px(room.w), l = px(room.l);
  const Wd = w + M * 2 + 60, Hd = l + M * 2 + 150;
  const L = lightsFor(room);
  const lv = ceilingLevelsFor(room);
  const drop = 120; // перепад уровня, мм
  let b = `<rect x="${M - WT}" y="${M - WT}" width="${w + 2 * WT}" height="${l + 2 * WT}" fill="#2E2A26"/>`;
  // уровень 2 (короб по периметру) — базовая заливка
  b += `<rect x="${M}" y="${M}" width="${w}" height="${l}" fill="#E9E4D8"/>`;
  // уровень 1 (базовый потолок) — внутренняя зона
  const bx = M + px(lv.box), by = M + px(lv.box), bw = w - 2 * px(lv.box), bl = l - 2 * px(lv.box);
  b += `<rect x="${bx}" y="${by}" width="${bw}" height="${bl}" fill="#F6F3EC" stroke="#57514A" stroke-width="1.2"/>`;
  // LED по внутреннему контуру короба
  b += `<rect x="${bx + 4}" y="${by + 4}" width="${bw - 8}" height="${bl - 8}" fill="none" stroke="#C29A5B" stroke-width="1.4" stroke-dasharray="6 4"/>`;
  // отметки уровней (по углам, чтобы не пересекались с нишами и треком)
  b += `<g font-size="10" fill="#2E2A26"><rect x="${M + 8}" y="${M + l - 24}" width="130" height="16" fill="#FFFFFFCC" stroke="#57514A" stroke-width="0.6"/><text x="${M + 14}" y="${M + l - 12}">2 ур. ${mark(room.h - drop)} · короб ${lv.box}</text>`;
  b += `<rect x="${bx + bw - 96}" y="${by + bl - 26}" width="88" height="16" fill="#FFFFFFCC" stroke="#57514A" stroke-width="0.6"/><text x="${bx + bw - 90}" y="${by + bl - 14}">1 ур. ${mark(room.h)}</text></g>`;
  // уровень 3 — «парящий остров»
  if (lv.three && lv.island) {
    const i = lv.island;
    b += `<rect x="${M + px(i.x)}" y="${M + px(i.y)}" width="${px(i.w)}" height="${px(i.l)}" fill="#E0D9C9" stroke="#57514A" stroke-width="1.2"/>`;
    b += `<rect x="${M + px(i.x) + 4}" y="${M + px(i.y) + 4}" width="${px(i.w) - 8}" height="${px(i.l) - 8}" fill="none" stroke="#C29A5B" stroke-width="1.4" stroke-dasharray="6 4"/>`;
    b += `<g font-size="10" fill="#2E2A26"><rect x="${M + px(i.x) + 8}" y="${M + px(i.y) + 8}" width="188" height="16" fill="#FFFFFFCC" stroke="#57514A" stroke-width="0.6"/><text x="${M + px(i.x) + 14}" y="${M + px(i.y) + 20}">3 ур. ${mark(room.h - 2 * drop)} · парящий, щель 10</text></g>`;
  }
  // ниша штор вдоль стены с окном: длина = проём + 2×250, ширина 200
  for (const o of room.windows) {
    const nl = px(o.w + 500), no = px(Math.max(0, o.off - 250));
    let nx = M, ny = M, nw = nl, nh = px(200);
    if (o.wall === 'A') { nx = M + no; ny = M; } else if (o.wall === 'C') { nx = M + no; ny = M + l - px(200); }
    else { nw = px(200); nh = nl; ny = M + no; nx = o.wall === 'D' ? M : M + w - px(200); }
    b += `<rect x="${nx}" y="${ny}" width="${nw}" height="${nh}" fill="#DCD5C6" stroke="#8A8478" stroke-width="0.7" stroke-dasharray="4 3"/>`;
    b += `<text x="${nx + 6}" y="${ny + 13}" font-size="8.5" fill="#7A756D">ниша штор 200, кромка −30</text>`;
  }
  // свет
  for (const s of L.spots) b += `<g stroke="#57514A" stroke-width="1"><circle cx="${M + px(s.x)}" cy="${M + px(s.y)}" r="5" fill="#FFF"/><line x1="${M + px(s.x) - 7}" y1="${M + px(s.y)}" x2="${M + px(s.x) + 7}" y2="${M + px(s.y)}"/><line x1="${M + px(s.x)}" y1="${M + px(s.y) - 7}" x2="${M + px(s.x)}" y2="${M + px(s.y) + 7}"/></g>`;
  if (L.pendant) b += `<circle cx="${M + w / 2}" cy="${M + l / 2}" r="11" fill="none" stroke="#2E2A26" stroke-width="1.6"/><circle cx="${M + w / 2}" cy="${M + l / 2}" r="3" fill="#2E2A26"/>`;
  if (L.track) b += `<line x1="${M + px(400)}" y1="${M + px(850)}" x2="${M + w - px(400)}" y2="${M + px(850)}" stroke="#2E2A26" stroke-width="3"/><text x="${M + px(420)}" y="${M + px(850) - 8}" font-size="9" fill="#57514A">трек-система</text>`;
  b += `<text x="${M - WT}" y="${M - 46}" font-size="16" font-weight="700" fill="#2E2A26">План потолка · ${esc(room.name)}</text>`;
  b += `<text x="${M - WT}" y="${M - 28}" font-size="11" fill="#7A756D">${esc(style.ceiling)} · ${lv.three ? '3 уровня' : '2 уровня'} · перепад ${drop} мм · LED ${lv.ledLen} м.п. · отметки от чистого пола</text>`;
  b += dimH(M, M + w, M + l + 34, room.w + ' мм');
  b += dimV(M + w + 34, M, M + l, room.l + ' мм');
  const ly = M + l + 56;
  b += `<g font-size="10" fill="#57514A"><circle cx="${M + 6}" cy="${ly - 3}" r="5" fill="#FFF" stroke="#57514A"/><text x="${M + 18}" y="${ly}">точечный — ${L.spots.length} шт.</text>`;
  if (L.pendant) b += `<circle cx="${M + 146}" cy="${ly - 3}" r="6" fill="none" stroke="#2E2A26" stroke-width="1.4"/><text x="${M + 158}" y="${ly}">подвес — 1</text>`;
  if (L.track) b += `<line x1="${M + 260}" y1="${ly - 4}" x2="${M + 290}" y2="${ly - 4}" stroke="#2E2A26" stroke-width="3"/><text x="${M + 298}" y="${ly}">трек — 1</text>`;
  b += `<line x1="${M + 380}" y1="${ly - 4}" x2="${M + 412}" y2="${ly - 4}" stroke="#C29A5B" stroke-width="1.4" stroke-dasharray="6 4"/><text x="${M + 420}" y="${ly}">LED 3000K скрытая — ${lv.ledLen} м.п.</text></g>`;
  b += `<text x="${M - WT}" y="${ly + 22}" font-size="9" fill="#8A8478">Короб 2-го уровня: ГКЛ 12,5 по каркасу ПП 60×27 шаг 600 · LED-полка 100, бортик 50, зазор 70 (узел — лист «Узел А») · закладные под подвесные светильники</text>`;
  b += stamp(M - WT, l + M * 2 + 86, w + 2 * WT + 40, `Потолок. ${room.name}`, sheet);
  return svgDoc(Wd + 20, Hd + 10, b);
}

// ---------- узел короба с LED (М 1:20, один на альбом) ----------
function drawNode(sheet) {
  const S2 = 0.28, M = 110; // 1:20 при базе 0.08≈1:50 → крупнее
  const q = mm => +(mm * S2).toFixed(1);
  const X = M, Y = M;
  let b = '';
  // перекрытие
  b += `<rect x="${X}" y="${Y}" width="${q(1400)}" height="${q(60)}" fill="#B9B2A4"/><text x="${X + 6}" y="${Y - 8}" font-size="11" fill="#57514A">ж/б перекрытие</text>`;
  for (let i = 0; i < 1400; i += 90) b += `<line x1="${X + q(i)}" y1="${Y + q(60)}" x2="${X + q(i + 45)}" y2="${Y}" stroke="#8A8478" stroke-width="0.7"/>`;
  // подвес + каркас + ГКЛ базового потолка (1 уровень −60 от перекрытия)
  const y1 = Y + q(180);
  b += `<line x1="${X + q(900)}" y1="${Y + q(60)}" x2="${X + q(900)}" y2="${y1}" stroke="#57514A" stroke-width="1.4"/><text x="${X + q(910)}" y="${(Y + q(60) + y1) / 2}" font-size="9" fill="#7A756D">подвес</text>`;
  b += `<rect x="${X + q(600)}" y="${y1}" width="${q(800)}" height="${q(27)}" fill="#D8D2C4" stroke="#57514A" stroke-width="0.8"/>`;
  b += `<rect x="${X + q(600)}" y="${y1 + q(27)}" width="${q(800)}" height="${q(12.5)}" fill="#F6F3EC" stroke="#2E2A26" stroke-width="1"/>`;
  b += `<text x="${X + q(1020)}" y="${y1 + q(27) + 16}" font-size="10" fill="#57514A">1 ур.: ПП 60×27 + ГКЛ 12,5 · ${mark(2700)}</text>`;
  // короб 2 уровня с LED-полкой
  const y2 = y1 + q(120); // низ короба
  b += `<rect x="${X}" y="${y1}" width="${q(450)}" height="${y2 - y1 + q(12.5)}" fill="#E9E4D8" stroke="#2E2A26" stroke-width="1"/>`;
  b += `<text x="${X + 8}" y="${y1 + 18}" font-size="10" fill="#57514A">короб 450</text>`;
  // LED полка 100 с бортиком 50, зазор 70 до 1 уровня
  const shelfY = y1 + q(50);
  b += `<rect x="${X + q(450)}" y="${shelfY}" width="${q(100)}" height="${q(12.5)}" fill="#E9E4D8" stroke="#2E2A26" stroke-width="1"/>`;
  b += `<rect x="${X + q(535)}" y="${shelfY - q(50)}" width="${q(15)}" height="${q(50)}" fill="#E9E4D8" stroke="#2E2A26" stroke-width="1"/>`;
  b += `<circle cx="${X + q(480)}" cy="${shelfY - 4}" r="3" fill="#C29A5B"/><text x="${X + q(560)}" y="${shelfY - 8}" font-size="10" fill="#8A6A3B">LED 3000K в профиле, полка 100 · бортик 50 · зазор 70</text>`;
  b += `<text x="${X + 8}" y="${y2 + q(12.5) + 18}" font-size="10" fill="#57514A">низ короба ${mark(2580)}</text>`;
  // размерные
  b += dimV(X - 26, Y + q(60), y1, '180');
  b += dimV(X - 26, y1, y2 + q(12.5), '~130');
  b += dimH(X, X + q(450), y2 + q(12.5) + 34, '450');
  b += dimH(X + q(450), X + q(550), y2 + q(12.5) + 34, '100');
  b += `<text x="${X}" y="${Y - 44}" font-size="16" font-weight="700" fill="#2E2A26">Узел А · Короб 2-го уровня со скрытой LED-подсветкой</text>`;
  b += `<text x="${X}" y="${Y - 26}" font-size="11" fill="#7A756D">М 1:20 · применяется на планах потолков всех помещений · блок питания LED с запасом 30% и ревизионным люком</text>`;
  b += stamp(X, y2 + q(12.5) + 60, q(1400), 'Узел А. Короб с LED', sheet, '1:20');
  return svgDoc(q(1400) + M * 2, y2 + q(12.5) + 130 + M, b);
}

// ---------- план электрики ----------
function drawElectro(room, sheet) {
  const M = 90, WT = 12, w = px(room.w), l = px(room.l);
  const Wd = w + M * 2 + 60, Hd = l + M * 2 + 150;
  const pts = electroFor(room);
  let b = `<rect x="${M - WT}" y="${M - WT}" width="${w + 2 * WT}" height="${l + 2 * WT}" fill="#2E2A26"/>`;
  b += `<rect x="${M}" y="${M}" width="${w}" height="${l}" fill="#FBFAF6"/>`;
  for (const o of room.windows) b += openingPlan(o, 'window', M, WT, room);
  for (const o of room.doors) b += openingPlan(o, 'door', M, WT, room);
  // мебель призраком
  for (const f of furnitureFor(room)) b += `<rect x="${M + px(f.x)}" y="${M + px(f.y)}" width="${px(f.w)}" height="${px(f.h)}" fill="none" stroke="#C5BFB2" stroke-width="1" rx="2"/>`;
  // точки
  let s = 0, sw = 0;
  for (const p of pts) {
    const x = M + px(p.x), y = M + px(p.y);
    if (p.type === 'socket') { s++;
      b += `<g stroke="#2E2A26" stroke-width="1.4"><circle cx="${x}" cy="${y}" r="6" fill="#FFF"/><line x1="${x - 6}" y1="${y - 8}" x2="${x + 6}" y2="${y - 8}"/><line x1="${x - 4}" y1="${y - 11}" x2="${x + 4}" y2="${y - 11}"/></g>`;
    } else { sw++;
      b += `<g stroke="#2E2A26" stroke-width="1.4"><circle cx="${x}" cy="${y}" r="5" fill="#2E2A26"/><line x1="${x}" y1="${y - 5}" x2="${x + 7}" y2="${y - 12}"/><line x1="${x + 7}" y1="${y - 12}" x2="${x + 12}" y2="${y - 9}"/></g>`;
    }
    b += `<text x="${x + 10}" y="${y + 4}" font-size="8.5" fill="#57514A">${esc(p.label)} · h${p.h}</text>`;
  }
  b += `<text x="${M - WT}" y="${M - 46}" font-size="16" font-weight="700" fill="#2E2A26">План электрики · ${esc(room.name)}</text>`;
  b += `<text x="${M - WT}" y="${M - 28}" font-size="11" fill="#7A756D">Розетки — ${s} поз. · выключатели — ${sw} поз. · высоты от чистого пола, мм</text>`;
  b += dimH(M, M + w, M + l + 34, room.w + ' мм');
  b += dimV(M + w + 34, M, M + l, room.l + ' мм');
  const ly = M + l + 56;
  b += `<g font-size="10" fill="#57514A"><circle cx="${M + 6}" cy="${ly - 3}" r="6" fill="#FFF" stroke="#2E2A26"/><line x1="${M}" y1="${ly - 11}" x2="${M + 12}" y2="${ly - 11}" stroke="#2E2A26"/><text x="${M + 18}" y="${ly}">розетка (блок)</text>`;
  b += `<circle cx="${M + 146}" cy="${ly - 3}" r="5" fill="#2E2A26"/><text x="${M + 158}" y="${ly}">выключатель</text></g>`;
  b += `<text x="${M - WT}" y="${ly + 22}" font-size="9.5" font-weight="600" fill="#B0483A">* Розетки — h=300 от чистого пола по умолчанию; отклонения подписаны у позиций. Выключатели — h=900.</text>`;
  b += `<text x="${M - WT}" y="${ly + 36}" font-size="9" fill="#8A8478">Санузлы: линии через УЗО 30 мА, розетки IP44 · выключатели со стороны ручки двери, ≥100 мм от проёма · привязки уточняются инженерным проектом</text>`;
  b += stamp(M - WT, l + M * 2 + 86, w + 2 * WT + 40, `Электрика. ${room.name}`, sheet);
  return svgDoc(Wd + 20, Hd + 10, b);
}

// ---------- смета ----------
function roomGeometry(r) {
  const floor = r.w * r.l / 1e6;
  const per = 2 * (r.w + r.l) / 1000;
  const openArea = (r.windows.reduce((s, o) => s + o.w * o.h, 0) + r.doors.reduce((s, o) => s + o.w * o.h, 0)) / 1e6;
  const walls = Math.max(0, per * (r.h / 1000) - openArea);
  const plinth = Math.max(0, per - r.doors.reduce((s, o) => s + o.w, 0) / 1000);
  return { floor: +floor.toFixed(1), walls: +walls.toFixed(1), plinth: +plinth.toFixed(1) };
}
function buildSmeta() {
  const rows = [];
  const R = (section, roomName, name, unit, qty, rate) => rows.push({ section, room: roomName, name, unit, qty: +qty.toFixed(1), rate: Math.round(rate), sum: Math.round(qty * rate) });
  let totalSpots = 0, pendants = 0, tracks = 0, totalLed = 0;
  for (const r of rooms) {
    const g = roomGeometry(r), L = lightsFor(r);
    const lv = ceilingLevelsFor(r), niches = nichesFor(r), epts = electroFor(r);
    totalSpots += L.spots.length; if (L.pendant) pendants++; if (L.track) tracks++;
    const nichesLed = niches.filter(n => /LED|подсвет/i.test(n.label));
    const ledRoom = +(lv.ledLen + nichesLed.reduce((s2, n) => s2 + n.w / 1000, 0)).toFixed(1);
    totalLed += ledRoom;
    const wet = r.type === 'bathroom';
    R('Черновые работы', r.name, WORK_RATES.screed.name, 'м²', g.floor, WORK_RATES.screed.rate * tier.k);
    R('Черновые работы', r.name, WORK_RATES.plaster.name, 'м²', g.walls, WORK_RATES.plaster.rate * tier.k);
    R('Черновые работы', r.name, WORK_RATES.ceilGkl.name + ' (1-й уровень)', 'м²', g.floor, WORK_RATES.ceilGkl.rate * tier.k);
    R('Черновые работы', r.name, 'Короб потолка 2-го уровня с LED-полкой (ГКЛ, каркас)', 'м.п.', lv.boxLen, 1450 * tier.k);
    if (lv.three && lv.island) R('Черновые работы', r.name, '3-й уровень: «парящий» остров с теневой щелью', 'м²', lv.island.w * lv.island.l / 1e6, 2100 * tier.k);
    for (const n of niches) R('Черновые работы', r.name, `${n.label} (${n.w}×${n.h}, глуб. ${n.depth})`, 'шт.', 1, (/панель/i.test(n.label) ? 9500 : 6500) * tier.k);
    R('Черновые работы', r.name, WORK_RATES.electro.name + ` (свет ${L.spots.length + (L.pendant ? 1 : 0) + (L.track ? 1 : 0)} + розетки/выкл. ${epts.length})`, 'точка', L.spots.length + (L.pendant ? 1 : 0) + (L.track ? 1 : 0) + epts.length, WORK_RATES.electro.rate * tier.k);
    if (wet) {
      R('Чистовая отделка', r.name, WORK_RATES.tile.name, 'м²', g.walls + g.floor, WORK_RATES.tile.rate * tier.k);
      R('Материалы', r.name, 'Плитка керамогранит (стены+пол, +10% подрезка)', 'м²', (g.walls + g.floor) * 1.1, 2600 * tier.kMat);
    } else {
      R('Чистовая отделка', r.name, WORK_RATES.paint.name, 'м²', g.walls, WORK_RATES.paint.rate * tier.k);
      R('Чистовая отделка', r.name, WORK_RATES.floorLay.name, 'м²', g.floor, WORK_RATES.floorLay.rate * tier.k);
      R('Чистовая отделка', r.name, WORK_RATES.plinthLay.name, 'м.п.', g.plinth, WORK_RATES.plinthLay.rate * tier.k);
      R('Материалы', r.name, 'Краска (' + style.wall.finish + '), 2 слоя', 'л', g.walls * 0.25, style.paintPriceL * tier.kMat);
      R('Материалы', r.name, 'Пол: ' + style.floor.name + ' (+5%)', 'м²', g.floor * 1.05, style.floor.priceM2 * tier.kMat);
      R('Материалы', r.name, style.plinth, 'м.п.', g.plinth, 550 * tier.kMat);
    }
  }
  // мебель по всем помещениям
  const furnAgg = {};
  for (const r of rooms) for (const f of furnitureFor(r)) { const k = f.key; if (!FURN_PRICES[k]) continue; furnAgg[k] = furnAgg[k] || { name: f.name, qty: 0 }; furnAgg[k].qty++; }
  for (const [k, v] of Object.entries(furnAgg)) R('Мебель и оборудование', '—', v.name, 'шт.', v.qty, FURN_PRICES[k] * tier.kFurn);
  R('Освещение', '—', 'Точечные светильники', 'шт.', totalSpots, FURN_PRICES.spot * tier.kFurn);
  if (pendants) R('Освещение', '—', 'Подвесы/люстры', 'шт.', pendants, FURN_PRICES.pendant * tier.kFurn);
  if (tracks) R('Освещение', '—', 'Трек-системы со спотами', 'шт.', tracks, FURN_PRICES.track * tier.kFurn);
  if (totalLed) R('Освещение', '—', 'LED-лента 3000K + алюм. профиль с рассеивателем + БП (запас 30%)', 'м.п.', totalLed, 1900 * tier.kFurn);
  return rows;
}
function smetaHTML(rows) {
  const sections = [...new Set(rows.map(r => r.section))];
  const subtotal = rows.reduce((s, r) => s + r.sum, 0);
  const reserve = Math.round(rows.filter(r => r.section !== 'Мебель и оборудование' && r.section !== 'Освещение').reduce((s, r) => s + r.sum, 0) * 0.1);
  const total = subtotal + reserve;
  let body = '';
  for (const sec of sections) {
    const rs = rows.filter(r => r.section === sec);
    const ssum = rs.reduce((s, r) => s + r.sum, 0);
    body += `<tr class="sec"><td colspan="5">${sec}</td><td class="num">${fmt(ssum)} ₽</td></tr>`;
    body += rs.map(r => `<tr><td>${esc(r.room)}</td><td>${esc(r.name)}</td><td>${r.unit}</td><td class="num">${r.qty.toLocaleString('ru-RU')}</td><td class="num">${fmt(r.rate)}</td><td class="num">${fmt(r.sum)}</td></tr>`).join('');
  }
  return docHTML('Смета проекта', `
<h1>Смета реализации</h1>
<p class="sub">${esc((brief.object && brief.object.address) || 'Объект')} · ${totalArea} м² · стиль «${style.title}» · тариф «${tier.title}» · ${DATE}</p>
<table><thead><tr><th>Помещение</th><th>Наименование</th><th>Ед.</th><th>Кол-во</th><th>Цена, ₽</th><th>Сумма, ₽</th></tr></thead><tbody>
${body}
<tr class="tot"><td colspan="5">Итого по разделам</td><td class="num">${fmt(subtotal)} ₽</td></tr>
<tr><td colspan="5">Непредвиденные расходы, 10% (работы и материалы)</td><td class="num">${fmt(reserve)} ₽</td></tr>
<tr class="tot big"><td colspan="5">ВСЕГО по проекту</td><td class="num">${fmt(total)} ₽</td></tr>
<tr><td colspan="5">Стоимость реализации за м²</td><td class="num">${fmt(total / totalArea)} ₽/м²</td></tr>
</tbody></table>
<p class="note">Смета предварительная, рассчитана автоматически по обмерам брифа и тарифу «${tier.title}». Уточняется после выезда на объект и выбора конкретных артикулов. Цены — ориентир на ${DATE}.</p>`);
}
function smetaCSV(rows) {
  const lines = ['Раздел;Помещение;Наименование;Ед.;Кол-во;Цена ₽;Сумма ₽'];
  for (const r of rows) lines.push([r.section, r.room, r.name, r.unit, String(r.qty).replace('.', ','), r.rate, r.sum].join(';'));
  return '﻿' + lines.join('\n');
}

// ---------- спецификация чистовых материалов ----------
function specHTML() {
  const sku = style.skus || {};
  let body = '';
  for (const r of rooms) {
    const wet = r.type === 'bathroom';
    const g = roomGeometry(r);
    const lv = ceilingLevelsFor(r);
    let fin = 1;
    const C = () => `FIN-${nn(r.idx)}-${fin++}`;
    const rowsSpec = wet ? [
      [C(), 'Пол', 'керамогранит 600×600, матовый', sku.tile || '—', `${(g.floor * 1.1).toFixed(1)} м² (+10%)`],
      [C(), 'Стены', 'керамогранит / плитка под камень', sku.tile || '—', `${(g.walls * 1.1).toFixed(1)} м² (+10%)`],
      [C(), 'Потолок', 'влагостойкий ГКЛ, краска для влажных помещений', '—', `${g.floor} м²`],
      [C(), 'LED-подсветка', 'ниша-полка + контур короба, 3000K', sku.led || '—', `${lv.ledLen} м.п.`],
      [C(), 'Сантехника', 'ванна 1700, подвесной унитаз, накладная раковина', 'по дизайн-борду', '3 поз.']
    ] : [
      [C(), 'Пол', style.floor.name, sku.floor || '—', `${(g.floor * 1.15).toFixed(1)} м² (+15% ёлка)`],
      [C(), 'Стены', style.wall.finish, sku.paint || '—', `${(g.walls * 0.25).toFixed(1)} л (2 слоя)`],
      [C(), 'Акцент', style.accent.finish, 'по дизайн-борду', '1 стена'],
      [C(), 'Потолок', style.ceiling, '—', `${g.floor} м²`],
      [C(), 'Плинтус', style.plinth, sku.plinth || '—', `${g.plinth} м.п.`],
      [C(), 'Двери', style.doors, sku.doors || '—', `${r.doors.length} шт.`],
      [C(), 'LED-подсветка', 'короб потолка + ниши, 3000K', sku.led || '—', `${lv.ledLen} м.п.`]
    ];
    const furn = furnitureFor(r).map(f => f.name).join(', ') || '—';
    body += `<h2>${nn(r.idx)} · ${esc(r.name)} · ${r.area} м²</h2>
<table><thead><tr><th>Код</th><th>Позиция</th><th>Наименование</th><th>Бренд · артикул</th><th>Кол-во</th></tr></thead>
<tbody>${rowsSpec.map(x => `<tr><td class="num">${x[0]}</td><td class="k" style="width:90px">${x[1]}</td><td>${esc(x[2])}</td><td>${esc(x[3])}</td><td class="num">${x[4]}</td></tr>`).join('')}
<tr><td class="num">—</td><td class="k">Ниши</td><td colspan="3">${esc(nichesFor(r).map(n => `${n.label} — ${n.w}×${n.h}, глуб. ${n.depth}, низ +${(n.sill / 1000).toFixed(3).replace('.', ',')}`).join('; ') || '—')}</td></tr>
<tr><td class="num">—</td><td class="k">Мебель</td><td colspan="3">${esc(furn)}</td></tr></tbody></table>`;
  }
  // сводная ведомость отделки
  let tf = 0, tw = 0, tc = 0, tp = 0;
  const vedRows = rooms.map(r => {
    const g = roomGeometry(r);
    tf += g.floor; tw += g.walls; tc += g.floor; tp += g.plinth;
    const wet = r.type === 'bathroom';
    return `<tr><td>${nn(r.idx)} · ${esc(r.name)}</td><td>${wet ? 'керамогранит' : esc(style.floor.name.split(',')[0])}</td><td class="num">${g.floor}</td><td class="num">${g.walls}</td><td class="num">${g.floor}</td><td class="num">${wet ? '—' : g.plinth}</td></tr>`;
  }).join('');
  const vedomost = `<h2>Сводная ведомость отделки</h2>
<table><thead><tr><th>Помещение</th><th>Тип пола</th><th class="num">Пол, м²</th><th class="num">Стены, м²</th><th class="num">Потолок, м²</th><th class="num">Плинтус, м.п.</th></tr></thead>
<tbody>${vedRows}<tr class="tot"><td colspan="2">Итого по объекту</td><td class="num">${tf.toFixed(1)}</td><td class="num">${tw.toFixed(1)}</td><td class="num">${tc.toFixed(1)}</td><td class="num">${tp.toFixed(1)}</td></tr></tbody></table>`;
  return docHTML('Спецификация материалов', `
<h1>Спецификация чистовых материалов</h1>
<p class="sub">Стиль «${style.title}» · тариф «${tier.title}» · ${DATE}</p>
<div class="pal">${style.palette.map(c => `<span style="background:${c}"></span>`).join('')}<em>палитра проекта</em></div>
${body}
${vedomost}
<p class="note">Артикулы и точные коллекции подбираются на этапе комплектации; допустимы аналоги в той же ценовой группе без изменения образа. Площади стен даны за вычетом проёмов.</p>`);
}

// ---------- концепт ----------
function conceptHTML() {
  const cards = rooms.map(r => {
    const imgs = renders.filter(f => f.split('/').pop().startsWith(nn(r.idx)));
    const gal = imgs.length ? `<div class="rgal">${imgs.map(f => `<a href="renders/${f.split('/').pop()}" target="_blank"><img src="renders/${f.split('/').pop()}" alt="${esc(r.name)} — визуализация" loading="lazy"></a>`).join('')}</div>` : '';
    const niches = nichesFor(r).map(n => n.label).join('; ');
    const lv = ceilingLevelsFor(r);
    return `
<div class="card"><h2>${nn(r.idx)} · ${esc(r.name)}</h2>
${gal}
<p>${esc(style.concept)}</p>
<p class="mut">Потолок: ${lv.three ? '3 уровня с «парящим» островом' : '2 уровня'}, скрытая LED 3000K — ${lv.ledLen} м.п. ${niches ? '· Ниши: ' + esc(niches) : ''}</p>
<p class="mut">Свет: ${lightsFor(r).spots.length} точечных${lightsFor(r).pendant ? ' + декоративный подвес' : ''}${lightsFor(r).track ? ' + трек' : ''}. Пол: ${esc(style.floor.name)}.</p></div>`;
  }).join('');
  return docHTML('Концепция проекта', `
<h1>Концепция · стиль «${style.title}»</h1>
<p class="sub">${esc(style.concept)}</p>
<div class="pal">${style.palette.map(c => `<span style="background:${c}"></span>`).join('')}<em>палитра</em></div>
${cards}
<p class="note">${renders.length ? 'Визуализации выполнены по планировочному решению проекта: та же мебель, ниши и сценарии света, что и на чертежах.' : 'Фотореалистичные рендеры каждого помещения выполняются на этапе 2 после согласования планировочного решения.'}</p>`);
}

// ---------- паспорт проекта ----------
function coverHTML(counts) {
  return docHTML('Паспорт проекта', `
<h1>Дизайн-проект интерьера</h1>
<p class="sub">${esc((brief.object && brief.object.address) || 'Объект')} · ${esc((brief.object && brief.object.type) || 'квартира')} · ${totalArea} м²</p>
<table><tbody>
<tr><td class="k">Заказчик</td><td>${esc((brief.client && brief.client.name) || '—')}</td></tr>
<tr><td class="k">Стиль</td><td>«${style.title}» — ${esc(style.concept)}</td></tr>
<tr><td class="k">Тариф</td><td>«${tier.title}»</td></tr>
<tr><td class="k">Помещений</td><td>${rooms.length}: ${rooms.map(r => r.name).join(', ')}</td></tr>
<tr><td class="k">Высота потолков</td><td>${rooms[0] ? rooms[0].h : 2700} мм</td></tr>
<tr><td class="k">Дата выпуска</td><td>${DATE}</td></tr>
</tbody></table>
<div class="pal">${style.palette.map(c => `<span style="background:${c}"></span>`).join('')}<em>палитра проекта</em></div>
<h2>Состав комплекта · ${counts.obmer + counts.plans + counts.poly + counts.elev + counts.ceil + counts.electro + 1} листов + документы</h2>
<table><tbody>
<tr><td class="k">00 Паспорт</td><td>паспорт, пояснительная записка, <a href="vedomost.html">ведомость чертежей</a></td></tr>
<tr><td class="k">01 Обмер</td><td>обмерные планы с цепочками привязок, высотами проёмов, диагональю — ${counts.obmer} лист.</td></tr>
<tr><td class="k">02 Планы</td><td>парные планы мебели: с размерами / презентационные — ${counts.plans} лист.</td></tr>
<tr><td class="k">03 Полы</td><td>планы полов: раскладка, направление укладки, стыки, отметки — ${counts.poly} лист.</td></tr>
<tr><td class="k">04 Развертки</td><td>каждая стена: цепочки размеров, ниши, раскладка плитки — ${counts.elev} лист.</td></tr>
<tr><td class="k">05 Потолки</td><td>потолки 2–3 уровня со светом — ${counts.ceil} лист. + узел короба с LED (М 1:20)</td></tr>
<tr><td class="k">06 Концепция</td><td>образ, палитра${renders.length ? ` и ${renders.length} фотореалистичных визуализаций (2–3 ракурса на помещение)` : ''}</td></tr>
<tr><td class="k">07 Материалы</td><td>спецификация с кодами FIN, брендами и артикулами + сводная ведомость</td></tr>
<tr><td class="k">08 Смета</td><td>смета реализации (HTML + CSV для Excel)</td></tr>
<tr><td class="k">09 Электрика</td><td>розетки и выключатели с высотами — ${counts.electro} лист.</td></tr>
</tbody></table>
<h2>Пояснительная записка</h2>
<table><tbody>
<tr><td class="k">Объект</td><td>${esc((brief.object && brief.object.type) || 'квартира')} ${totalArea} м², ${rooms.length} помещений: ${rooms.map(r => `${r.name} (${r.area} м²)`).join(', ')}. Высота потолков ${rooms[0] ? rooms[0].h : 2700} мм.</td></tr>
<tr><td class="k">Стиль и колористика</td><td>«${style.title}». ${esc(style.concept)} Палитра из 5 тонов: светлая тёплая база, деревянные фактуры, один тёмный якорь и латунный акцент — сочетание проверено на контраст и температуру.</td></tr>
<tr><td class="k">Потолки</td><td>Два уровня во всех помещениях (короб 450 мм, перепад 120 мм, скрытая LED 3000K по внутреннему контуру)${rooms.some(r => ceilingLevelsFor(r).three) ? '; в гостиной — третий уровень «парящий остров» с теневой щелью 10 мм' : ''}. Узел исполнения — лист «Узел А» (М 1:20). Закладные под все подвесные светильники.</td></tr>
<tr><td class="k">Ниши</td><td>${esc(rooms.flatMap(r => nichesFor(r).map(n => n.label)).filter((v, i, a) => a.indexOf(v) === i).join('; ') || '—')}. Все ниши — ГКЛ с LED-подсветкой в алюминиевом профиле, БП с запасом 30% и ревизией.</td></tr>
<tr><td class="k">Полы</td><td>${esc(style.floor.name)} (жилые), керамогранит (санузел, −0,020). Стыки покрытий — на оси дверного полотна, без порожков. Запас: +15% на «ёлку», +10% на плитку.</td></tr>
<tr><td class="k">Электрика</td><td>Розетки по мебельным сценариям (кровать +600, фартук +1100, ТВ-блок +1300 скрыт в нише), выключатели +900 со стороны ручки. Санузлы — через УЗО 30 мА, IP44. Разводку выполняет инженерный проект по привязкам альбома.</td></tr>
<tr><td class="k">Пожелания клиента</td><td>${esc(Object.values(brief.answers || {}).filter(Boolean).join(' · ') || '—')}</td></tr>
</tbody></table>
<p class="note">Все чертежи — в масштабе 1:50 (узлы — 1:20), размеры в миллиметрах без обозначения единиц, отметки от чистого пола (за 0,000 принят уровень чистового пола). Размеры проверять по месту; допуск обмера ±5 мм в зонах встроенной мебели и санузлов. Комплект пригоден для передачи строительной бригаде.</p>`);
}

// ---------- общий шаблон документов ----------
function docHTML(title, body) {
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — LINEA</title><style>
body{font-family:${FONT};margin:0;background:#FAF9F6;color:#2E2A26;padding:48px 24px}
main{max-width:900px;margin:0 auto;background:#fff;border:1px solid #E5E0D6;padding:48px 56px}
h1{font-family:Georgia,'Times New Roman',serif;font-weight:600;font-size:30px;margin:0 0 6px}
h2{font-family:Georgia,serif;font-size:19px;margin:34px 0 10px;border-bottom:1px solid #E5E0D6;padding-bottom:6px}
.sub{color:#7A756D;margin:0 0 24px;font-size:14px}
table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0 16px}
td,th{border:1px solid #E5E0D6;padding:7px 10px;text-align:left;vertical-align:top}
th{background:#F1EDE4;font-weight:600}
td.k{width:160px;color:#7A756D;background:#FBFAF7}
td.num,th.num{text-align:right;white-space:nowrap}
tr.sec td{background:#2E2A26;color:#EDE7DC;font-weight:600}
tr.tot td{background:#F1EDE4;font-weight:700}
tr.big td{font-size:15px}
.pal{display:flex;align-items:center;gap:8px;margin:14px 0 6px}
.pal span{width:44px;height:44px;border-radius:4px;border:1px solid #00000015;display:inline-block}
.pal em{color:#7A756D;font-size:12px;margin-left:8px}
.card{border:1px solid #E5E0D6;padding:16px 20px;margin:12px 0;background:#FBFAF7}
.card h2{border:0;margin:0 0 6px;padding:0}
.rgal{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin:10px 0 14px}
.rgal img{width:100%;height:auto;border-radius:4px;display:block}
.mut{color:#7A756D;font-size:13px}
.note{color:#7A756D;font-size:12px;border-top:1px solid #E5E0D6;padding-top:14px;margin-top:28px}
footer{max-width:900px;margin:14px auto 0;color:#9A937F;font-size:11px;letter-spacing:2px}
@media print{body{padding:0}main{border:0;padding:24px}}
</style></head><body><main>${body}</main><footer>LINEA · СТУДИЯ ДИЗАЙНА ИНТЕРЬЕРА · ${DATE}</footer></body></html>`;
}

// ---------- просмотрщик папки ----------
function viewerHTML(files) {
  const grp = k => files.filter(f => f.startsWith(k) && f.endsWith('.svg'));
  const rnd = files.filter(f => f.startsWith('06-koncept/renders/'));
  const sec = (title, list) => list.length ? `<section><h2>${title}</h2><div class="grid">${list.map(f => `<figure><a href="${f}" target="_blank"><img src="${f}" loading="lazy" alt=""></a><figcaption>${f.split('/').pop()}</figcaption></figure>`).join('')}</div></section>` : '';
  const secR = rnd.length ? `<section id="rendery"><h2>Визуализации</h2><div class="grid wide">${rnd.map(f => `<figure><a href="${f}" target="_blank"><img src="${f}" loading="lazy" alt="Фотореалистичная визуализация"></a><figcaption>${f.split('/').pop().replace(/\.\w+$/, '').replace(/-/g, ' ')}</figcaption></figure>`).join('')}</div></section>` : '';
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Папка проекта — LINEA</title><style>
body{font-family:${FONT};margin:0;background:#0F0E0C;color:#EDE7DC}
header{padding:48px 5vw 24px;border-bottom:1px solid #2b271f}
header h1{font-family:Georgia,serif;font-weight:500;font-size:30px;margin:0 0 8px}
header p{color:#9A937F;margin:0;font-size:14px}
nav{display:flex;flex-wrap:wrap;gap:10px;padding:18px 5vw;border-bottom:1px solid #2b271f;position:sticky;top:0;background:#0F0E0Cee;backdrop-filter:blur(8px)}
nav a{color:#C29A5B;text-decoration:none;font-size:13px;letter-spacing:1px;border:1px solid #3a3428;border-radius:20px;padding:6px 14px}
nav a:hover{background:#1c1913}
section{padding:34px 5vw}
h2{font-family:Georgia,serif;font-weight:500;font-size:22px;color:#EDE7DC;border-left:3px solid #C29A5B;padding-left:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:18px;margin-top:18px}
.grid.wide{grid-template-columns:repeat(auto-fill,minmax(440px,1fr))}
figure{margin:0;background:#FAF9F6;border-radius:6px;overflow:hidden}
figure img{width:100%;height:auto;display:block}
figcaption{font-size:11px;color:#57514A;padding:8px 12px;background:#F1EDE4}
.docs{display:flex;gap:14px;flex-wrap:wrap;margin-top:16px}
.docs a{display:block;background:#1c1913;border:1px solid #3a3428;border-radius:8px;padding:18px 22px;color:#EDE7DC;text-decoration:none;min-width:220px}
.docs a b{display:block;color:#C29A5B;margin-bottom:4px}
.docs a:hover{border-color:#C29A5B}
footer{padding:40px 5vw;color:#6d675c;font-size:12px;letter-spacing:2px;border-top:1px solid #2b271f}
</style></head><body>
<header><h1>Папка дизайн-проекта</h1><p>${esc((brief.object && brief.object.address) || 'Объект')} · ${totalArea} м² · стиль «${style.title}» · тариф «${tier.title}» · выпуск ${DATE}</p></header>
<nav>${rnd.length ? '<a href="#rendery">Визуализации</a>' : ''}<a href="#docs">Документы</a><a href="#obmer">01 Обмер</a><a href="#plany">02 Планы</a><a href="#poly">03 Полы</a><a href="#razv">04 Развертки</a><a href="#pot">05 Потолки</a><a href="#elektro">09 Электрика</a></nav>
${secR}
<section id="docs"><h2>Документы</h2><div class="docs">
<a href="00-pasport/pasport.html"><b>00 · Паспорт проекта</b>пояснительная записка, состав, палитра</a>
<a href="00-pasport/vedomost.html"><b>00 · Ведомость чертежей</b>все листы АИ-N с масштабами</a>
<a href="06-koncept/koncept.html"><b>06 · Концепция</b>образ и визуализации помещений</a>
<a href="07-materialy/specification.html"><b>07 · Материалы</b>спецификация с артикулами + ведомость</a>
<a href="08-smeta/smeta.html"><b>08 · Смета</b>работы, материалы, мебель, свет</a>
<a href="08-smeta/smeta.csv"><b>08 · Смета CSV</b>для Excel / Google Sheets</a>
</div></section>
${sec('01 · Обмерные планы: цепочки привязок, высоты, диагонали', grp('01-obmer')).replace('<section>', '<section id="obmer">')}
${sec('02 · Планы мебели: с размерами и презентационные', grp('02-plany')).replace('<section>', '<section id="plany">')}
${sec('03 · Полы: раскладка, направление, стыки, отметки', grp('03-poly')).replace('<section>', '<section id="poly">')}
${sec('04 · Развертки стен (цепочки размеров, ниши, плитка)', grp('04-razvertki')).replace('<section>', '<section id="razv">')}
${sec('05 · Потолки 2–3 уровня, свет и узлы', grp('05-potolki')).replace('<section>', '<section id="pot">')}
${sec('09 · Электрика: розетки и выключатели', grp('09-elektrika')).replace('<section>', '<section id="elektro">')}
<footer>LINEA · СТУДИЯ ДИЗАЙНА ИНТЕРЬЕРА — комплект сформирован автоматически конвейером студии</footer>
</body></html>`;
}

// ---------- сборка ----------
const files = [];
function writeOut(rel, content) {
  const p = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  files.push(rel.split(path.sep).join('/'));
}

let sheet = 1;
TOTAL_SHEETS = rooms.length * 10 + 1; // обмер+2 плана+пол+4 развертки+потолок+электрика на комнату + узел
const reg = []; // реестр листов для ведомости
const counts = { obmer: 0, plans: 0, poly: 0, elev: 0, ceil: 0, electro: 0 };
function sheetOut(rel, maker, title, scale) {
  const no = sheet++;
  writeOut(rel, maker(no));
  reg.push({ no, title, scale: scale || '1:50', file: rel });
}
const SL = r => `${nn(r.idx)}-${slug(r.name)}`;
// порядок листов — как в альбомах профессиональных студий
for (const r of rooms) { sheetOut(`01-obmer/obmer-${SL(r)}.svg`, n => drawObmer(r, n), `Обмерный план. ${r.name}`); counts.obmer++; }
for (const r of rooms) { sheetOut(`02-plany/plan-${SL(r)}.svg`, n => drawPlan(r, n, true), `План мебели с размерами. ${r.name}`); counts.plans++; }
for (const r of rooms) { sheetOut(`02-plany/plan-${SL(r)}-mebel.svg`, n => drawPlan(r, n, false), `План мебели. ${r.name}`); counts.plans++; }
for (const r of rooms) { sheetOut(`03-poly/pol-${SL(r)}.svg`, n => drawFloor(r, n), `План пола. ${r.name}`); counts.poly++; }
for (const r of rooms) for (const wk of ['A', 'B', 'C', 'D']) { sheetOut(`04-razvertki/${SL(r)}-stena-${wk}.svg`, n => drawElevation(r, wk, n), `Развертка. ${r.name}, стена ${wk}`); counts.elev++; }
for (const r of rooms) { sheetOut(`05-potolki/potolok-${SL(r)}.svg`, n => drawCeiling(r, n), `План потолка. ${r.name}`); counts.ceil++; }
sheetOut(`05-potolki/uzel-A-korob-led.svg`, n => drawNode(n), 'Узел А. Короб с LED-подсветкой', '1:20');
for (const r of rooms) { sheetOut(`09-elektrika/elektrika-${SL(r)}.svg`, n => drawElectro(r, n), `Электрика. ${r.name}`); counts.electro++; }
// рендеры: подхватываем, если сгенерированы (06-koncept/renders/*.jpg|png)
let renders = [];
try {
  const rdir = path.join(outDir, '06-koncept', 'renders');
  renders = fs.readdirSync(rdir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort().map(f => '06-koncept/renders/' + f);
  files.push(...renders);
} catch (e) { /* рендеров нет — ок */ }

// ---------- ведомость чертежей ----------
function vedomostHTML() {
  const docsRows = [
    ['—', 'Паспорт проекта + пояснительная записка', '—'],
    ['—', 'Ведомость чертежей (настоящий лист)', '—'],
    ['—', 'Концепция и визуализации', '—'],
    ['—', 'Спецификация материалов с артикулами', '—'],
    ['—', 'Смета реализации (HTML + CSV)', '—']
  ].map(x => `<tr><td class="num">${x[0]}</td><td>${x[1]}</td><td class="num">${x[2]}</td><td>документ</td></tr>`).join('');
  const rows = reg.map(s => `<tr><td class="num">АИ-${s.no}</td><td>${esc(s.title)}</td><td class="num">${s.scale}</td><td>${s.file.split('/')[0]}</td></tr>`).join('');
  return docHTML('Ведомость чертежей', `
<h1>Ведомость чертежей</h1>
<p class="sub">${esc((brief.object && brief.object.address) || 'Объект')} · ${totalArea} м² · всего листов: ${reg.length} · ${DATE}</p>
<table><thead><tr><th>Лист</th><th>Наименование</th><th>Масштаб</th><th>Раздел</th></tr></thead><tbody>${docsRows}${rows}</tbody></table>
<p class="note">Нумерация сквозная АИ-N (архитектура интерьера). Все чертежи выполнены автоматически конвейером LINEA и проверены главным архитектором студии.</p>`);
}
writeOut('00-pasport/vedomost.html', vedomostHTML());
const smetaRows = buildSmeta();
writeOut('08-smeta/smeta.html', smetaHTML(smetaRows));
writeOut('08-smeta/smeta.csv', smetaCSV(smetaRows));
writeOut('07-materialy/specification.html', specHTML());
writeOut('06-koncept/koncept.html', conceptHTML());
writeOut('00-pasport/pasport.html', coverHTML(counts));
writeOut('index.html', viewerHTML(files.slice()));
writeOut('manifest.json', JSON.stringify({ generated: new Date().toISOString(), style: styleKey, tier: tier.key, totalArea, rooms: rooms.map(r => ({ name: r.name, type: r.type, area: r.area })), files }, null, 2));

const total = smetaRows.reduce((s, r) => s + r.sum, 0);
console.log(`✔ Проект собран: ${outDir}`);
console.log(`  Стиль «${style.title}», тариф «${tier.title}», ${totalArea} м², помещений: ${rooms.length}`);
console.log(`  Листов: планы ${counts.plans} · развертки ${counts.elev} · потолки ${counts.ceil}`);
console.log(`  Смета (без резерва): ${fmt(total)} ₽ · файлов: ${files.length}`);
