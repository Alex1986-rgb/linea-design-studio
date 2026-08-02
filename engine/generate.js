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
  return { idx: i + 1, id: r.id || 'room' + (i + 1), name: r.name, type: r.type || 'living', w, l, h, windows, doors, area: +(r.width * r.length).toFixed(1),
    pos: r.pos ? { x: Math.round(r.pos.x * 1000), y: Math.round(r.pos.y * 1000) } : null };
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

function svgDoc(wPx, hPx, body, bg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${wPx}" height="${hPx}" viewBox="0 0 ${wPx} ${hPx}" font-family='${FONT}'>\n<rect width="${wPx}" height="${hPx}" fill="${bg || CAD.paper}"/>\n${body}\n</svg>`;
}
let TOTAL_SHEETS = 0; // проставляется до генерации листов
function stamp(x, y, w, drawingName, sheet, scale) {
  const sc = scale || '1:50';
  const list = TOTAL_SHEETS ? `Лист ${sheet} из ${TOTAL_SHEETS}` : `Лист ${sheet}`;
  const line2 = `${list} · М ${sc} · стадия РП · ${DATE}`;
  w = Math.max(w, Math.max(drawingName.length * 6.2 + 60, line2.length * 5.2 + 24)); // не даём тексту вылезти
  if (w < 700) { // узкий лист — компактный штамп в две строки
    return `<g><rect x="${x}" y="${y}" width="${w}" height="44" fill="none" stroke="#2E2A26" stroke-width="1"/>
<text x="${x + 10}" y="${y + 17}" font-size="10.5" font-weight="700" fill="#2E2A26" letter-spacing="1">LINEA · ${esc(drawingName)}</text>
<text x="${x + 10}" y="${y + 33}" font-size="9.5" fill="#7A756D">${line2}</text></g>`;
  }
  return `<g><rect x="${x}" y="${y}" width="${w}" height="44" fill="none" stroke="#2E2A26" stroke-width="1"/>
<text x="${x + 10}" y="${y + 17}" font-size="11" font-weight="700" fill="#2E2A26" letter-spacing="2">LINEA · СТУДИЯ ДИЗАЙНА ИНТЕРЬЕРА</text>
<text x="${x + 10}" y="${y + 33}" font-size="10" fill="#7A756D">${esc((brief.object && brief.object.address) || 'Объект')} · ${totalArea} м² · стиль «${style.title}» · стадия РП</text>
<text x="${x + w - 10}" y="${y + 17}" font-size="10" fill="#2E2A26" text-anchor="end">${esc(drawingName)}</text>
<text x="${x + w - 10}" y="${y + 33}" font-size="10" fill="#7A756D" text-anchor="end">${list} · М ${sc} · ${DATE}</text></g>`;
}
function dimH(x1, x2, y, label) {
  return `<g stroke="#2A2A2A" stroke-width="0.8" fill="none"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/><line x1="${x1}" y1="${y - 5}" x2="${x1}" y2="${y + 5}"/><line x1="${x2}" y1="${y - 5}" x2="${x2}" y2="${y + 5}"/><line x1="${x1 - 3}" y1="${y + 3}" x2="${x1 + 3}" y2="${y - 3}"/><line x1="${x2 - 3}" y1="${y + 3}" x2="${x2 + 3}" y2="${y - 3}"/></g>
<text x="${(x1 + x2) / 2}" y="${y - 5}" font-size="10.5" fill="#2A2A2A" text-anchor="middle">${label}</text>`;
}
function dimV(x, y1, y2, label) {
  return `<g stroke="#2A2A2A" stroke-width="0.8" fill="none"><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/><line x1="${x - 5}" y1="${y1}" x2="${x + 5}" y2="${y1}"/><line x1="${x - 5}" y1="${y2}" x2="${x + 5}" y2="${y2}"/><line x1="${x - 3}" y1="${y1 + 3}" x2="${x + 3}" y2="${y1 - 3}"/><line x1="${x - 3}" y1="${y2 + 3}" x2="${x + 3}" y2="${y2 - 3}"/></g>
<text x="${x + 6}" y="${(y1 + y2) / 2}" font-size="10.5" fill="#2A2A2A" transform="rotate(-90 ${x + 6} ${(y1 + y2) / 2})" text-anchor="middle">${label}</text>`;
}

// ---------- расстановка мебели (правила по типу помещения) ----------
// зоны открывания дверей — мебель туда ставить нельзя
function doorZones(room) {
  return room.doors.map(o => {
    const d = o.w + 100;
    if (o.wall === 'A') return { x: o.off, y: 0, w: d, h: d };
    if (o.wall === 'C') return { x: o.off, y: room.l - d, w: d, h: d };
    if (o.wall === 'D') return { x: 0, y: o.off, w: d, h: d };
    return { x: room.w - d, y: o.off, w: d, h: d };
  });
}
const hits = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function furnitureFor(room) {
  const W = room.w, L = room.l, it = [];
  const zones = doorZones(room);
  // мебель не пересекает другую мебель и не блокирует открывание дверей
  const add = (key, name, x, y, w, h) => {
    if (!(x >= 0 && y >= 0 && x + w <= W && y + h <= L)) return false;
    const r = { x, y, w, h };
    if (key !== 'rug' && (it.some(f => f.key !== 'rug' && hits(r, f)) || zones.some(z => hits(r, z)))) return false;
    it.push({ key, name, x, y, w, h });
    return true;
  };
  // поставить предмет в первую подходящую позицию из списка вариантов
  const addAny = (key, name, w, h, cands) => { for (const c of cands) if (add(key, name, c[0], c[1], w, h)) return true; return false; };
  // подбор вдоль стен с шагом 100 мм, если явные варианты заняты
  const addScan = (key, name, w, h, cands) => {
    if (addAny(key, name, w, h, cands || [])) return true;
    for (const [dx, dy, sw, sh] of [[0, 0, w, h], [0, 0, h, w]]) {
      for (let y = 80; y + sh <= L - 80; y += 100)
        for (let x = 80; x + sw <= W - 80; x += 100)
          if (add(key, name, x, y, sw, sh)) return true;
    }
    return false;
  };
  switch (room.type) {
    case 'bedroom': {
      const hwall = bedWallFor(room), bw = 1600, bl = 2000;
      if (hwall === 'A' || hwall === 'C') {
        const bx = (W - bw) / 2, by = hwall === 'A' ? 100 : L - bl - 100, ty = hwall === 'A' ? 100 : L - 550;
        add('bed', 'Кровать 1600×2000', bx, by, bw, bl); if (it.length) it[it.length - 1].head = hwall;
        if (bx >= 560) add('nightstand', 'Тумба', bx - 520, ty, 450, 450);
        if (W - bx - bw >= 560) add('nightstand', 'Тумба', bx + bw + 70, ty, 450, 450);
        const wl2 = Math.min(2400, W - 1600);
        add('wardrobe', 'Шкаф h2400', W - wl2 - 100, hwall === 'A' ? L - 700 : 100, wl2, 600);
      } else {
        const by = (L - bw) / 2, bx = hwall === 'B' ? W - bl - 100 : 100, tx = hwall === 'B' ? W - 550 : 100;
        add('bed', 'Кровать 1600×2000', bx, by, bl, bw); if (it.length) it[it.length - 1].head = hwall;
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
    case 'bathroom': { // ванна у стены без двери, унитаз и раковина — по свободным углам
      const bw2 = Math.min(1700, W - 160), bl2 = 700;
      addAny('bath', `Ванна ${bw2}×${bl2}`, bw2, bl2, [[80, 80], [80, L - bl2 - 80], [(W - bw2) / 2, 80]]) ||
        addAny('bath', 'Душевая 900×900', 900, 900, [[W - 980, 80], [80, 80], [W - 980, L - 980], [80, L - 980]]);
      addScan('wc', 'Унитаз', 400, 650, [[80, L - 730], [W - 480, L - 730], [80, 80], [W - 480, 80]]);
      addScan('sink', 'Раковина', 600, 450, [[W - 680, L - 530], [80, L - 530], [W - 680, 80], [(W - 600) / 2, L - 530]]);
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
  const Wd = Math.max(760, w + M * 2 + 90), Hd = l + M * 2 + 150;
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
  let openLabels = '';
  for (const o of room.windows) {
    const pos = o.wall === 'A' ? { x: M + px(o.off + o.w / 2), y: M + 16 } : o.wall === 'C' ? { x: M + px(o.off + o.w / 2), y: M + l - 8 } : { x: o.wall === 'D' ? M + 14 : M + w - 130, y: M + px(o.off + o.w / 2) };
    openLabels += `<rect x="${pos.x - 2}" y="${pos.y - 9}" width="112" height="12" fill="#FFFFFFCC"/><text x="${pos.x}" y="${pos.y}" font-size="9" fill="#3B5C77">Вп=${o.sill} · Н.пр=${o.h}</text>`;
  }
  for (const o of room.doors) {
    const pos = o.wall === 'C' ? { x: M + px(o.off + o.w / 2), y: M + l - 8 } : o.wall === 'A' ? { x: M + px(o.off + o.w / 2), y: M + 16 } : { x: o.wall === 'D' ? M + 14 : M + w - 90, y: M + px(o.off + o.w / 2) };
    openLabels += `<rect x="${pos.x - 2}" y="${pos.y - 9}" width="46" height="12" fill="#FFFFFFCC"/><text x="${pos.x}" y="${pos.y}" font-size="9" fill="#3B5C77">h=${o.h}</text>`;
  }
  // штамп комнаты: S подчёркнуто, P, h
  const per = (2 * (room.w + room.l) / 1000).toFixed(1);
  const lbx = M + w / 2, lby = M + l / 2;
  b += `<rect x="${lbx - 95}" y="${lby - 26}" width="190" height="52" fill="#FFFFFFE8"/>`;
  b += `<g text-anchor="middle"><text x="${lbx}" y="${lby - 10}" font-size="14" font-weight="700" fill="#2E2A26">${nn(room.idx)} ${esc(room.name)}</text>
<text x="${lbx}" y="${lby + 6}" font-size="12" fill="#2E2A26" text-decoration="underline">S=${room.area} м²</text>
<text x="${lbx}" y="${lby + 20}" font-size="10" fill="#57514A">P=${per} м · h=${room.h}</text></g>`;
  b += openLabels;
  b += `<text x="${M - WT}" y="${M - 104}" font-size="16" font-weight="700" fill="#2E2A26">Обмерный план · ${esc(room.name)}</text>`;
  b += `<text x="${M - WT}" y="${M - 86}" font-size="11" fill="#7A756D">Все размеры в мм · Вп — высота подоконника, Н.пр — высота проёма · перегородки 150</text>`;
  // ключевые высоты — красной рамкой (по образцу проф. альбомов)
  const kw = room.windows[0], kd = room.doors[0];
  const keyH = `H=${room.h}${kw ? ` · Вп=${kw.sill} · Н.пр=${kw.h}` : ''}${kd ? ` · дверь ${kd.w}/${kd.h}` : ''} · без учёта отделочного слоя`;
  b += `<g><rect x="${M - WT}" y="${M - 86}" width="${keyH.length * 6.7 + 20}" height="20" fill="#FFF6F4" stroke="#B0483A" stroke-width="1.2"/><text x="${M - WT + 10}" y="${M - 72}" font-size="10.5" font-weight="600" fill="#B0483A">${keyH}</text></g>`;
  const ny = M + l + 66;
  b += `<text x="${M - WT}" y="${ny}" font-size="9" fill="#8A8478">Примечания: размеры проверять по месту · допуск обмера ±5 мм в зонах встроенной мебели и санузлов · за 0,000 принят уровень чистового пола</text>`;
  b += stamp(M - WT, ny + 14, w + 2 * WT + 60, `Обмерный план. ${room.name}`, sheet);
  return svgDoc(Wd + 20, Hd + 40, b);
}

// ---------- план полов ----------
function drawFloor(room, sheet) {
  const M = 100, WT = 12, w = px(room.w), l = px(room.l);
  const Wd = Math.max(760, w + M * 2 + 60), Hd = l + M * 2 + 160;
  const wet = room.type === 'bathroom';
  const code = wet ? 'Пл-2' : 'Пл-1';
  let b = roomWalls(M, WT, room, sheet, CAD.paper);
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
    let anch = 'start';
    if (o.wall === 'A' || o.wall === 'C') {
      const y = o.wall === 'A' ? M : M + l; jx1 = M + px(o.off); jx2 = M + px(o.off + o.w); jy1 = jy2 = y; ty = o.wall === 'A' ? y + 16 : y - 10;
      if (jx2 + 120 > M + w) { tx = jx1 - 8; anch = 'end'; } else tx = jx2 + 8; // подпись со свободной стороны проёма
    }
    else { const x = o.wall === 'D' ? M : M + w; jy1 = M + px(o.off); jy2 = M + px(o.off + o.w); jx1 = jx2 = x; ty = jy1 - 6; if (o.wall === 'D') tx = x + 6; else { tx = x - 6; anch = 'end'; } }
    b += `<line x1="${jx1}" y1="${jy1}" x2="${jx2}" y2="${jy2}" stroke="#B0483A" stroke-width="2.4"/>`;
    const jw = 92;
    b += `<rect x="${anch === 'end' ? tx - jw : tx - 3}" y="${ty - 9}" width="${jw + 6}" height="12" fill="#FAF7F0E0"/>`;
    b += `<text x="${tx}" y="${ty}" font-size="8.5" fill="#B0483A" text-anchor="${anch}">стык на оси полотна</text>`;
  }
  // стрелка направления укладки — от стены с окном
  if (!wet) {
    const win = room.windows[0];
    const dir = win ? win.wall : 'A';
    const cx = M + w / 2, cy = M + l / 2;
    const ar = { A: [cx, M + 30, cx, M + 110], C: [cx, M + l - 30, cx, M + l - 110], D: [M + 30, cy, M + 110, cy], B: [M + w - 30, cy, M + w - 110, cy] }[dir];
    b += `<g stroke="#2E2A26" stroke-width="1.6" fill="none"><line x1="${ar[0]}" y1="${ar[1]}" x2="${ar[2]}" y2="${ar[3]}"/><path d="M ${ar[2]} ${ar[3]} l ${ar[0] === ar[2] ? '-5 -9 M ' + ar[2] + ' ' + ar[3] + ' l 5 -9' : '-9 -5 M ' + ar[2] + ' ' + ar[3] + ' l -9 5'}"/></g>`;
    const atxt = win ? 'укладка от окна' : 'укладка вдоль помещения';
    const aw = atxt.length * 5 + 8;
    const ax0 = (ar[0] + ar[2]) / 2, ay0 = ar[0] === ar[2] ? Math.max(ar[1], ar[3]) + 16 : cy - 14;
    b += `<rect x="${ax0 - aw / 2}" y="${ay0 - 9}" width="${aw}" height="13" fill="#FAF7F0D9"/>`;
    b += `<text x="${ax0}" y="${ay0}" font-size="9" fill="#57514A" text-anchor="middle">${atxt}</text>`;
  }
  // отметка уровня
  { // отметка уровня — в первый угол без двери
    const zs = doorZones(room);
    const corners = [[28, l - 58], [w - 28, l - 58], [28, 58], [w - 28, 58]];
    const free = corners.find(c => !zs.some(z => hits({ x: (c[0] - 20) / S, y: (c[1] - 20) / S, w: 40 / S, h: 40 / S }, z))) || corners[0];
    b += `<g><circle cx="${M + free[0]}" cy="${M + free[1]}" r="16" fill="#FFF" stroke="#2E2A26" stroke-width="1.2"/><text x="${M + free[0]}" y="${M + free[1] + 4}" font-size="8" text-anchor="middle" fill="#2E2A26">${wet ? '−0.020' : '0.000'}</text></g>`;
  }
  const g = roomGeometry(room);
  b += `<text x="${M - WT}" y="${M - 46}" font-size="16" font-weight="700" fill="#2E2A26">План пола · ${esc(room.name)}</text>`;
  b += `<text x="${M - WT}" y="${M - 28}" font-size="11" fill="#7A756D">${code} · ${wet ? 'керамогранит 600×600, раскладка от центра' : esc(style.floor.name)} · S=${g.floor} м²${wet ? '' : ' · плинтус ' + g.plinth + ' м.п.'}</text>`;
  b += dimH(M, M + w, M + l + 30, room.w + '');
  b += dimV(M + w + 30, M, M + l, room.l + '');
  const ly = M + l + 58;
  b += `<g font-size="10" fill="#57514A"><rect x="${M}" y="${ly - 12}" width="16" height="16" fill="${wet ? '#EDEAE2' : style.floor.color + '55'}" stroke="#57514A" stroke-width="0.7"/><text x="${M + 24}" y="${ly}">${code} · ${wet ? 'керамогранит, ' + (g.floor * 1.1).toFixed(1) + ' м² (+10%)' : esc(style.floor.name.split(',')[0]) + ', ' + (g.floor * 1.15).toFixed(1) + ' м² (+15% ёлка)'}</text></g>`;
  b += `<text x="${M - WT}" y="${ly + 20}" font-size="9" fill="#8A8478">${wet ? 'Гидроизоляция обмазочная с заведением на стены 200 мм · уклон к трапу не требуется' : 'Стык покрытий выполнять на оси дверного полотна · компенсационный зазор у стен 10 мм под плинтус'}</text>`;
  b += stamp(M - WT, ly + 34, w + 2 * WT + 40, `План пола. ${room.name}`, sheet);
  return svgDoc(Wd + 20, Hd + 30, b);
}

// ---------- демонтаж (снятие отделки, дверные блоки) ----------
function drawDemolition(room, sheet) {
  const M = 100, WT = 12, w = px(room.w), l = px(room.l);
  const Wd = Math.max(760, w + M * 2 + 60), Hd = l + M * 2 + 150;
  const wet = room.type === 'bathroom';
  let b = roomWalls(M, WT, room, sheet, CAD.paper);
  // штриховка зоны демонтажа отделки (весь контур помещения)
  b += `<clipPath id="dm${room.idx}"><rect x="${M}" y="${M}" width="${w}" height="${l}"/></clipPath><g clip-path="url(#dm${room.idx})">`;
  const st = 22;
  for (let i = -Math.ceil(l / st); i < w / st + Math.ceil(l / st); i++)
    b += `<line x1="${M + i * st}" y1="${M}" x2="${M + i * st + l}" y2="${M + l}" stroke="#B0483A33" stroke-width="1.4"/>`;
  b += `</g>`;
  for (const o of room.windows) b += openingPlan(o, 'window', M, WT, room);
  for (const o of room.doors) {
    b += openingPlan(o, 'door', M, WT, room);
    // красный X на демонтируемом дверном блоке
    let x0, y0, x1, y1;
    if (o.wall === 'A' || o.wall === 'C') { const y = o.wall === 'A' ? M - WT : M + l - 2; x0 = M + px(o.off); x1 = M + px(o.off + o.w); y0 = y; y1 = y + WT + 2; }
    else { const x = o.wall === 'D' ? M - WT : M + w - 2; y0 = M + px(o.off); y1 = M + px(o.off + o.w); x0 = x; x1 = x + WT + 2; }
    b += `<g stroke="#B0483A" stroke-width="2"><line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/><line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y0}"/></g>`;
    const tx = (o.wall === 'A' || o.wall === 'C') ? x0 + 4 : x0 + 18, ty = (o.wall === 'A' || o.wall === 'C') ? (o.wall === 'A' ? M + 16 : M + l - 8) : y0 - 6;
    b += `<text x="${tx}" y="${ty}" font-size="8.5" fill="#B0483A">демонтаж дверного блока</text>`;
  }
  b += `<text x="${M - WT}" y="${M - 46}" font-size="16" font-weight="700" fill="#2E2A26">План демонтажа · ${esc(room.name)}</text>`;
  b += `<text x="${M - WT}" y="${M - 28}" font-size="11" fill="#7A756D">Подготовка под чистовую отделку · перегородки не демонтируются</text>`;
  b += dimH(M, M + w, M + l + 34, room.w + '');
  b += dimV(M + w + 34, M, M + l, room.l + '');
  const ly = M + l + 62;
  b += `<g font-size="10" fill="#57514A">
<rect x="${M - WT}" y="${ly - 12}" width="16" height="16" fill="#FAF7F0" stroke="#B0483A" stroke-width="0.8"/><line x1="${M - WT}" y1="${ly + 4}" x2="${M - WT + 16}" y2="${ly - 12}" stroke="#B0483A88" stroke-width="1.2"/>
<text x="${M - WT + 24}" y="${ly}">демонтаж отделки: ${wet ? 'плитка стен и пола, стяжка до плиты, старая гидроизоляция' : 'покрытие пола до стяжки, обои/краска, плинтусы, наличники'}</text></g>`;
  b += `<g font-size="9.5" font-weight="600" fill="#B0483A"><text x="${M - WT}" y="${ly + 22}">⚠ Несущие конструкции не затрагиваются. Перед штроблением уточнить трассы скрытых коммуникаций.</text></g>`;
  b += stamp(M - WT, ly + 36, w + 2 * WT + 40, `Демонтаж. ${room.name}`, sheet);
  return svgDoc(Wd + 20, Hd + 30, b);
}

// ---------- монтаж ГКЛ-конструкций (фальш-стены под ниши, короба) ----------
function drawMontage(room, sheet) {
  const M = 100, WT = 12, w = px(room.w), l = px(room.l);
  const Wd = Math.max(760, w + M * 2 + 60), Hd = l + M * 2 + 170;
  let b = roomWalls(M, WT, room, sheet, CAD.paper);
  for (const o of room.windows) b += openingPlan(o, 'window', M, WT, room);
  for (const o of room.doors) b += openingPlan(o, 'door', M, WT, room);
  // контур короба потолка 2-го уровня (для связки с листом потолка)
  const lv = ceilingLevelsFor(room);
  if (lv.box) {
    const off = px(lv.box);
    b += `<rect x="${M + off}" y="${M + off}" width="${w - 2 * off}" height="${l - 2 * off}" fill="none" stroke="#C7BFB3" stroke-width="1" stroke-dasharray="10 5"/>`;
    if (w - 2 * off > 280) b += `<text x="${M + off + 8}" y="${M + l - off - 8}" font-size="8.5" fill="#8A8478">граница короба потолка (лист «Потолок»)</text>`;
  }
  // фальш-стены под ниши — синим, с вылетом; ниши на одной стене в одном пятне объединяем
  const nn2 = nichesFor(room).filter(n => n.depth >= 80);
  const groups = [];
  for (const n of nn2) {
    const g0 = groups.find(g => g.wall === n.wall && Math.abs(g.off - n.off) < 200);
    if (g0) { g0.depth = Math.max(g0.depth, n.depth); g0.w = Math.max(g0.w, n.w); g0.labels.push(n.label); }
    else groups.push({ wall: n.wall, off: n.off, w: n.w, depth: n.depth, labels: [n.label] });
  }
  let nlab = 0;
  for (const g0 of groups) {
    const th = px(g0.depth + 65); // глубина ниши + каркас ПП 60×27
    let rx, ry, rw, rh, tx, ty;
    if (g0.wall === 'A') { rx = M + px(g0.off); ry = M; rw = px(g0.w); rh = th; tx = rx + rw / 2; ty = ry + rh + 14; }
    else if (g0.wall === 'C') { rx = M + px(g0.off); ry = M + l - th; rw = px(g0.w); rh = th; tx = rx + rw / 2; ty = ry - 8; }
    else if (g0.wall === 'B') { rx = M + w - th; ry = M + px(g0.off); rw = th; rh = px(g0.w); tx = rx - 14; ty = ry + rh / 2 + 3; }
    else { rx = M; ry = M + px(g0.off); rw = th; rh = px(g0.w); tx = M + th + 14; ty = ry + rh / 2 + 3; }
    b += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="#3B5C7722" stroke="#3B5C77" stroke-width="1.6" stroke-dasharray="5 3"/>`;
    nlab++;
    b += `<circle cx="${tx}" cy="${ty - 3.5}" r="9" fill="#FFFFFFE6" stroke="#3B5C77" stroke-width="1"/><text x="${tx}" y="${ty}" font-size="9" font-weight="700" fill="#3B5C77" text-anchor="middle">М${nlab}</text>`;
  }
  b += `<text x="${M - WT}" y="${M - 46}" font-size="16" font-weight="700" fill="#2E2A26">План монтажа ГКЛ-конструкций · ${esc(room.name)}</text>`;
  b += `<text x="${M - WT}" y="${M - 28}" font-size="11" fill="#7A756D">Фальш-стены под ниши, закладные, короб потолка · каркас ПП 60×27, ГКЛ 12,5 в 2 слоя</text>`;
  b += dimH(M, M + w, M + l + 34, room.w + '');
  b += dimV(M + w + 34, M, M + l, room.l + '');
  let legH = M + l + 62;
  // расшифровка позиций М1..N
  groups.forEach((g0, i) => {
    const short = g0.labels.map(s => s.split(',')[0]).join(' + ');
    const lines = wrapText(`— фальш-стена ГКЛ, вылет ${g0.depth + 65} мм, стена ${g0.wall} · ${short}`, 74);
    b += `<text x="${M - WT}" y="${legH}" font-size="10" font-weight="700" fill="#3B5C77">М${i + 1}</text>`;
    lines.forEach((ln, j) => { b += `<text x="${M - WT + 26}" y="${legH + j * 12}" font-size="10" fill="#3B5C77">${esc(ln)}</text>`; });
    legH += 4 + lines.length * 12;
  });
  b += `<g font-size="10" fill="#2E2A26">
<rect x="${M - WT}" y="${legH - 8}" width="14" height="14" fill="#3B5C7722" stroke="#3B5C77" stroke-width="1.4" stroke-dasharray="4 3"/><text x="${M - WT + 20}" y="${legH + 4}">новые ГКЛ-конструкции · внутри — закладные из фанеры 18 мм под навесное</text>
<rect x="${M - WT}" y="${legH + 14}" width="14" height="14" fill="none" stroke="#C7BFB3" stroke-width="1" stroke-dasharray="6 3"/><text x="${M - WT + 20}" y="${legH + 26}">граница потолочного короба 2-го уровня</text></g>`;
  b += `<text x="${M - WT}" y="${legH + 46}" font-size="9" fill="#8A8478">Стыки ГКЛ вразбежку, кромки с расшивкой · в санузлах — ГКЛВ · звукоизоляция минватой 50 мм в полостях</text>`;
  b += stamp(M - WT, legH + 58, w + 2 * WT + 40, `Монтаж ГКЛ. ${room.name}`, sheet);
  return svgDoc(Wd + 20, Hd + 40 + groups.length * 14, b);
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
  // ниша не должна попадать на проём (дверь/окно) той же стены
  const clash = (wall, off, w) => {
    if ([...room.doors, ...room.windows].some(o => o.wall === wall && off < o.off + o.w + 50 && off + w > o.off - 50)) return true;
    if (!room.pos) return false;
    // глобальная проверка: проёмы всех помещений, выходящие на ту же линию стены
    const horiz = wall === 'A' || wall === 'C';
    const line = horiz ? room.pos.y + (wall === 'A' ? 0 : room.l) : room.pos.x + (wall === 'D' ? 0 : room.w);
    const a0 = (horiz ? room.pos.x : room.pos.y) + off, a1 = a0 + w;
    return rooms.some(r2 => r2 !== room && r2.pos && r2.doors.concat(r2.windows).some(o => {
      const h2 = o.wall === 'A' || o.wall === 'C';
      if (h2 !== horiz) return false;
      const l2 = h2 ? r2.pos.y + (o.wall === 'A' ? 0 : r2.l) : r2.pos.x + (o.wall === 'D' ? 0 : r2.w);
      if (Math.abs(l2 - line) > 200) return false;
      const b0 = (h2 ? r2.pos.x : r2.pos.y) + o.off, b1 = b0 + o.w;
      return a0 < b1 + 50 && a1 > b0 - 50;
    }));
  };
  const add = (wall, off, w, h, sill, label) => {
    const len = (wall === 'A' || wall === 'C') ? W : L;
    if (!(off >= 0 && off + w <= len)) return;
    let pos = off;
    if (clash(wall, pos, w)) { // пробуем сдвинуть вдоль стены в свободный участок
      const alts = [];
      for (const o of [...room.doors, ...room.windows].filter(o => o.wall === wall)) { alts.push(o.off + o.w + 100, o.off - w - 100); }
      alts.push(100, len - w - 100);
      pos = alts.find(a => a >= 0 && a + w <= len && !clash(wall, a, w));
      if (pos == null) return; // свободного участка нет — ниша не размещается
    }
    n.push({ wall, off: pos, w, h, sill, depth: 100, label });
  };
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
    case 'bathroom': { // ниша-полка над фактическим положением ванны
      const bath = furnitureFor(room).find(f => f.key === 'bath');
      if (bath) {
        const horiz = bath.w >= bath.h;
        const wall = horiz ? (bath.y < L / 2 ? 'A' : 'C') : (bath.x < W / 2 ? 'D' : 'B');
        const off = horiz ? bath.x + 150 : bath.y + 150;
        add(wall, off, Math.min(1200, (horiz ? bath.w : bath.h) - 300), 350, 1100, 'Ниша-полка над ванной, LED, полка стекло');
      }
      break; }
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
  const W = px(room.w), L = px(room.l), ow = px(o.w);
  let r = '';
  // прорезь проёма в теле стены — «бумага»
  if (o.wall === 'A') r = `<rect x="${M + px(o.off)}" y="${M - WT}" width="${ow}" height="${WT}" fill="${CAD.paper}" stroke="${CAD.wallStroke}" stroke-width="0.9"/>`;
  if (o.wall === 'C') r = `<rect x="${M + px(o.off)}" y="${M + L}" width="${ow}" height="${WT}" fill="${CAD.paper}" stroke="${CAD.wallStroke}" stroke-width="0.9"/>`;
  if (o.wall === 'B') r = `<rect x="${M + W}" y="${M + px(o.off)}" width="${WT}" height="${ow}" fill="${CAD.paper}" stroke="${CAD.wallStroke}" stroke-width="0.9"/>`;
  if (o.wall === 'D') r = `<rect x="${M - WT}" y="${M + px(o.off)}" width="${WT}" height="${ow}" fill="${CAD.paper}" stroke="${CAD.wallStroke}" stroke-width="0.9"/>`;
  if (kind === 'window') { // рама: голубая линия остекления + линия подоконника
    if (o.wall === 'A' || o.wall === 'C') {
      const my = o.wall === 'A' ? M - WT / 2 : M + L + WT / 2, x0 = M + px(o.off);
      r += `<line x1="${x0}" y1="${my - 2.2}" x2="${x0 + ow}" y2="${my - 2.2}" stroke="${CAD.window}" stroke-width="1.6"/><line x1="${x0}" y1="${my + 2.2}" x2="${x0 + ow}" y2="${my + 2.2}" stroke="${CAD.wallStroke}" stroke-width="0.7"/>`;
    } else {
      const mx = o.wall === 'D' ? M - WT / 2 : M + W + WT / 2, y0 = M + px(o.off);
      r += `<line x1="${mx - 2.2}" y1="${y0}" x2="${mx - 2.2}" y2="${y0 + ow}" stroke="${CAD.window}" stroke-width="1.6"/><line x1="${mx + 2.2}" y1="${y0}" x2="${mx + 2.2}" y2="${y0 + ow}" stroke="${CAD.wallStroke}" stroke-width="0.7"/>`;
    }
  }
  if (kind === 'window') { // радиатор отопления под окном
    const rl = Math.min(ow - 8, px(1200)), t = px(90);
    let rx, ry, rw2, rh2, horiz = (o.wall === 'A' || o.wall === 'C');
    if (o.wall === 'A') { rx = M + px(o.off) + (ow - rl) / 2; ry = M + px(60); rw2 = rl; rh2 = t; }
    else if (o.wall === 'C') { rx = M + px(o.off) + (ow - rl) / 2; ry = M + L - px(60) - t; rw2 = rl; rh2 = t; }
    else if (o.wall === 'D') { rx = M + px(60); ry = M + px(o.off) + (ow - rl) / 2; rw2 = t; rh2 = rl; }
    else { rx = M + W - px(60) - t; ry = M + px(o.off) + (ow - rl) / 2; rw2 = t; rh2 = rl; }
    r += `<rect x="${rx}" y="${ry}" width="${rw2}" height="${rh2}" fill="#EAF3F7" stroke="${CAD.window}" stroke-width="0.9"/>`;
    const n = Math.max(3, Math.round((horiz ? rw2 : rh2) / 6));
    for (let i = 1; i < n; i++) r += horiz
      ? `<line x1="${rx + (rw2 / n) * i}" y1="${ry + 1}" x2="${rx + (rw2 / n) * i}" y2="${ry + rh2 - 1}" stroke="${CAD.window}" stroke-width="0.5"/>`
      : `<line x1="${rx + 1}" y1="${ry + (rh2 / n) * i}" x2="${rx + rw2 - 1}" y2="${ry + (rh2 / n) * i}" stroke="${CAD.window}" stroke-width="0.5"/>`;
  }
  if (kind === 'door') { // полотно + четверть-дуга открывания
    const dw = ow;
    let hx, hy, lx, ly, arc;
    if (o.wall === 'C') { hx = M + px(o.off); hy = M + L; lx = hx; ly = hy - dw; arc = `M ${hx + dw} ${hy} A ${dw} ${dw} 0 0 0 ${hx} ${hy - dw}`; }
    else if (o.wall === 'A') { hx = M + px(o.off); hy = M; lx = hx; ly = hy + dw; arc = `M ${hx + dw} ${hy} A ${dw} ${dw} 0 0 1 ${hx} ${hy + dw}`; }
    else if (o.wall === 'D') { hx = M; hy = M + px(o.off); lx = hx + dw; ly = hy; arc = `M ${hx} ${hy + dw} A ${dw} ${dw} 0 0 1 ${hx + dw} ${hy}`; }
    else { hx = M + W; hy = M + px(o.off); lx = hx - dw; ly = hy; arc = `M ${hx} ${hy + dw} A ${dw} ${dw} 0 0 0 ${hx - dw} ${hy}`; }
    r += `<line x1="${hx}" y1="${hy}" x2="${lx}" y2="${ly}" stroke="${CAD.doorArc}" stroke-width="1.6"/>`;
    r += `<path d="${arc}" fill="none" stroke="${CAD.doorArc}" stroke-width="0.7"/>`;
  }
  return r;
}

// CAD-подложка помещения: серые стены, штриховка по наружным (там, где окна)
function roomWalls(M, WT, room, id, insideFill) {
  const w = px(room.w), l = px(room.l);
  let s = `<defs><pattern id="rh${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="${CAD.wallFill}"/><line x1="0" y1="0" x2="0" y2="7" stroke="${CAD.hatch}" stroke-width="2"/></pattern></defs>`;
  s += `<rect x="${M - WT}" y="${M - WT}" width="${w + 2 * WT}" height="${l + 2 * WT}" fill="${CAD.wallFill}" stroke="${CAD.wallStroke}" stroke-width="1.5"/>`;
  for (const wall of new Set(room.windows.map(o => o.wall))) { // наружные стены — со штриховкой
    if (wall === 'A') s += `<rect x="${M - WT}" y="${M - WT}" width="${w + 2 * WT}" height="${WT}" fill="url(#rh${id})"/>`;
    if (wall === 'C') s += `<rect x="${M - WT}" y="${M + l}" width="${w + 2 * WT}" height="${WT}" fill="url(#rh${id})"/>`;
    if (wall === 'D') s += `<rect x="${M - WT}" y="${M - WT}" width="${WT}" height="${l + 2 * WT}" fill="url(#rh${id})"/>`;
    if (wall === 'B') s += `<rect x="${M + w}" y="${M - WT}" width="${WT}" height="${l + 2 * WT}" fill="url(#rh${id})"/>`;
  }
  s += `<rect x="${M}" y="${M}" width="${w}" height="${l}" fill="${insideFill || CAD.paper}" stroke="${CAD.wallStroke}" stroke-width="1.2"/>`;
  return s;
}

// фото готового интерьера помещения (миниатюра, base64 — работает внутри <img>)
const RENDER_CACHE = {};
function roomPhotos(room, limit) {
  const key = `${nn(room.idx)}-${slug(room.name)}`;
  if (RENDER_CACHE[key]) return RENDER_CACHE[key].slice(0, limit || 2);
  let out = [];
  try {
    const dir = path.join(outDir, '06-koncept', 'renders', 'thumbs');
    out = fs.readdirSync(dir)
      .filter(f => /\.(jpe?g|png)$/i.test(f) && f.startsWith(nn(room.idx)))
      .sort()
      .map(f => ({ name: f, data: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64') }));
  } catch (e) { out = []; }
  RENDER_CACHE[key] = out;
  return out.slice(0, limit || 2);
}
// блок фото-врезок справа от плана (как на листах рабочих альбомов)
function photoPanel(x, y, w, room, cap) {
  const ph = roomPhotos(room, 2);
  if (!ph.length) return '';
  let s = `<text x="${x}" y="${y - 6}" font-size="10" font-weight="700" fill="#1C1C1C">${esc(cap || 'Реализованное решение')}</text>`;
  ph.forEach((p, i) => {
    const iy = y + i * (w * 0.68 + 22);
    s += `<image href="${p.data}" x="${x}" y="${iy}" width="${w}" height="${w * 0.66}" preserveAspectRatio="xMidYMid slice"/>`;
    s += `<rect x="${x}" y="${iy}" width="${w}" height="${w * 0.66}" fill="none" stroke="#1C1C1C" stroke-width="0.8"/>`;
    s += `<text x="${x + w / 2}" y="${iy + w * 0.66 + 12}" font-size="8.4" fill="#57514A" text-anchor="middle">${esc(room.name)} · вид ${i + 1}</text>`;
  });
  return s;
}

// CAD-символ единицы мебели (зелёный контур + деталировка), координаты в px
function furnSymbol(X, Y, W2, H2, f) {
  const dash = f.key === 'rug' ? ' stroke-dasharray="4 3"' : '';
  let s = `<rect x="${X}" y="${Y}" width="${W2}" height="${H2}" fill="none" stroke="${CAD.furn}" stroke-width="1.1"${dash}/>`;
  const g = (d, w2) => `<path d="${d}" fill="none" stroke="${CAD.furn}" stroke-width="${w2 || 0.8}"/>`;
  if (f.key === 'bed') { // подушки со стороны изголовья, линия одеяла
    const head = f.head || (W2 >= H2 ? 'A' : 'D');
    const pw = 0.26; // доля глубины под подушки
    if (head === 'A' || head === 'C') {
      const py0 = head === 'A' ? Y + 4 : Y + H2 - H2 * pw - 4;
      s += `<rect x="${X + 4}" y="${py0}" width="${W2 / 2 - 6}" height="${H2 * pw}" fill="none" stroke="${CAD.furn}" stroke-width="0.8" rx="2"/><rect x="${X + W2 / 2 + 2}" y="${py0}" width="${W2 / 2 - 6}" height="${H2 * pw}" fill="none" stroke="${CAD.furn}" stroke-width="0.8" rx="2"/>`;
      s += g(`M ${X} ${head === 'A' ? Y + H2 * 0.42 : Y + H2 * 0.58} H ${X + W2}`);
    } else {
      const px0 = head === 'D' ? X + 4 : X + W2 - W2 * pw - 4;
      s += `<rect x="${px0}" y="${Y + 4}" width="${W2 * pw}" height="${H2 / 2 - 6}" fill="none" stroke="${CAD.furn}" stroke-width="0.8" rx="2"/><rect x="${px0}" y="${Y + H2 / 2 + 2}" width="${W2 * pw}" height="${H2 / 2 - 6}" fill="none" stroke="${CAD.furn}" stroke-width="0.8" rx="2"/>`;
      s += g(`M ${head === 'D' ? X + W2 * 0.42 : X + W2 * 0.58} ${Y} V ${Y + H2}`);
    }
  }
  if (f.key === 'sofa') s += W2 >= H2
    ? g(`M ${X} ${Y + H2 * 0.3} H ${X + W2} M ${X + 8} ${Y + H2 * 0.3} V ${Y + H2} M ${X + W2 - 8} ${Y + H2 * 0.3} V ${Y + H2}`)
    : g(`M ${X + W2 * 0.3} ${Y} V ${Y + H2} M ${X + W2 * 0.3} ${Y + 8} H ${X + W2} M ${X + W2 * 0.3} ${Y + H2 - 8} H ${X + W2}`);
  if (f.key === 'table' || f.key === 'dining' || f.key === 'desk') s += `<ellipse cx="${X + W2 / 2}" cy="${Y + H2 / 2}" rx="${W2 * 0.26}" ry="${H2 * 0.26}" fill="none" stroke="${CAD.furn}" stroke-width="0.8"/>`;
  if (f.key === 'wardrobe' || f.key === 'kitchen') s += W2 >= H2 ? g(`M ${X} ${Y + H2 / 2} H ${X + W2}`) : g(`M ${X + W2 / 2} ${Y} V ${Y + H2}`);
  if (f.key === 'bath') s += `<rect x="${X + 4}" y="${Y + 4}" width="${W2 - 8}" height="${H2 - 8}" fill="none" stroke="${CAD.furn}" stroke-width="0.8" rx="6"/><circle cx="${X + W2 / 2}" cy="${Y + 9}" r="2" fill="${CAD.furn}"/>`;
  if (f.key === 'wc' || f.key === 'sink') s += `<ellipse cx="${X + W2 / 2}" cy="${Y + H2 / 2}" rx="${W2 * 0.34}" ry="${H2 * 0.34}" fill="none" stroke="${CAD.furn}" stroke-width="0.8"/>`;
  return s;
}
function drawPlan(room, sheet, withDims) {
  const M = 90, WT = 12, w = px(room.w), l = px(room.l);
  const PW = 250; // колонка фото готового интерьера
  const hasPh = roomPhotos(room, 2).length;
  const Wd = Math.max(760, w + M * 2 + 110 + (hasPh ? PW + 100 : 0));
  const Hd = Math.max(l + M * 2 + 140, hasPh ? M + 2 * (PW * 0.68 + 22) + 120 : 0);
  let b = roomWalls(M, WT, room, sheet, CAD.paper);
  if (hasPh) b += photoPanel(M + w + 150, M + 14, PW, room, 'Реализация интерьера');
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
    b += furnSymbol(M + px(f.x), M + px(f.y), px(f.w), px(f.h), f);
    if (f.key !== 'rug' || f.w > 1500) {
      const fx = M + px(f.x + f.w / 2), fy = f.key === 'rug' ? M + px(f.y) + 12 : M + px(f.y + f.h / 2) + 3;
      const fw2 = f.name.length * 5.2 + 8;
      b += `<rect x="${fx - fw2 / 2}" y="${fy - 9}" width="${fw2}" height="12" fill="#FFFFFFD9" rx="2"/>`;
      b += `<text x="${fx}" y="${fy}" font-size="9" fill="${CAD.ink || '#1C1C1C'}" text-anchor="middle">${esc(f.name)}</text>`;
    }
  }
  b += `<text x="${M - WT}" y="${M - 46}" font-size="16" font-weight="700" fill="#2E2A26">${esc(room.name)} · ${room.area} м²</text>`;
  b += `<text x="${M - WT}" y="${M - 28}" font-size="11" fill="#7A756D">План с расстановкой мебели${withDims ? ' и привязками проёмов' : ''} · стиль «${style.title}» · h потолка ${room.h} мм</text>`;
  if (withDims) {
    b += chainDimH(M, M + l + 34, room.w, wallOpenings(room, 'C'), true);
    b += chainDimV(M + w + 34, M, room.l, wallOpenings(room, 'B'), true);
    // обвязка мебели: проекции предметов на оси X и Y (как в рабочих альбомах)
    const merge = ivs => ivs.sort((a, b2) => a.off - b2.off).reduce((acc, v) => {
      const last = acc[acc.length - 1];
      if (last && v.off <= last.off + last.w) { last.w = Math.max(last.w, v.off + v.w - last.off); return acc; }
      acc.push({ ...v }); return acc;
    }, []);
    const fr = furnitureFor(room).filter(f => f.key !== 'rug');
    const fx2 = merge(fr.map(f => ({ off: f.x, w: f.w })));
    const fy2 = merge(fr.map(f => ({ off: f.y, w: f.h })));
    if (fx2.length) b += chainDimH(M, M + l + 78, room.w, fx2, false);
    if (fy2.length) b += chainDimV(M + w + 78, M, room.l, fy2, false);
  } else {
    b += dimH(M, M + w, M + l + 34, String(room.w));
    b += dimV(M + w + 34, M, M + l, String(room.l));
  }
  b += stamp(M - WT, Hd - 44, Math.max(w + 2 * WT + 40, 520), `План${withDims ? ' с размерами' : ''}. ${room.name}`, sheet);
  return svgDoc(Wd + 20, Hd + 20, b, CAD.paper);
}

// ---------- развертка стены ----------
function drawElevation(room, wallKey, sheet) {
  const len = (wallKey === 'A' || wallKey === 'C') ? room.w : room.l;
  const M = 90, w = px(len), h = px(room.h);
  const Wd = Math.max(780, w + M * 2 + 320), Hd = Math.max(h + M * 2 + 110, M + 40 + 4 * 46 + 230 * 0.66 + 90);
  let b = `<rect x="${M}" y="${M}" width="${w}" height="${h}" fill="${style.wall.color}" stroke="#2E2A26" stroke-width="2"/>`;
  if (room.type === 'bathroom') { // раскладка плитки 600×300
    for (let gx = 600; gx < len; gx += 600) b += `<line x1="${M + px(gx)}" y1="${M}" x2="${M + px(gx)}" y2="${M + h}" stroke="#00000018" stroke-width="0.8"/>`;
    for (let gy = 300; gy < room.h; gy += 300) b += `<line x1="${M}" y1="${M + h - px(gy)}" x2="${M + w}" y2="${M + h - px(gy)}" stroke="#00000018" stroke-width="0.8"/>`;
  }
  b += `<rect x="${M}" y="${M + h - px(80)}" width="${w}" height="${px(80)}" fill="#CFC9BD" stroke="#57514A" stroke-width="0.8"/>`; // плинтус
  // ниши на этой стене (подписи выводим последними, поверх проёмов)
  let nicheLabels = '';
  for (const nch of nichesFor(room).filter(o => o.wall === wallKey)) {
    const x = M + px(nch.off), y = M + h - px(nch.sill + nch.h);
    b += `<rect x="${x}" y="${y}" width="${px(nch.w)}" height="${px(nch.h)}" fill="#00000014" stroke="#57514A" stroke-width="1.2"/>`;
    b += `<rect x="${x + 3}" y="${y + 3}" width="${px(nch.w) - 6}" height="${px(nch.h) - 6}" fill="none" stroke="#C29A5B" stroke-width="1" stroke-dasharray="5 3"/>`;
    const l1 = `Ниша ${nch.w}×${nch.h}, глуб. ${nch.depth}`;
    const lw = Math.min(Math.max(l1.length, nch.label.length) * 5.2 + 10, w - 12);
    // центр подписи прижимаем внутрь стены, чтобы подложка не стирала контуры
    const tcx = Math.min(Math.max(x + px(nch.w) / 2, M + 6 + lw / 2), M + w - 6 - lw / 2);
    nicheLabels += `<rect x="${tcx - lw / 2}" y="${y + px(nch.h) / 2 - 10}" width="${lw}" height="26" fill="#FFFFFFE8"/>`;
    nicheLabels += `<text x="${tcx}" y="${y + px(nch.h) / 2}" font-size="9" fill="#57514A" text-anchor="middle">${l1}</text>`;
    nicheLabels += `<text x="${tcx}" y="${y + px(nch.h) / 2 + 12}" font-size="8" fill="#8A6A3B" text-anchor="middle">${esc(nch.label)}</text>`;
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
  b += nicheLabels;
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
  const notes = room.type === 'bathroom'
    ? ['Стены: керамогранит под камень 600×300, затирка в тон', 'Потолок: влагостойкий ГКЛ, краска для влажных зон', 'Двери: ' + style.doors, 'Ниша-полка: LED 3000K, полка — закалённое стекло']
    : ['Стены: ' + style.wall.finish, 'Плинтус: ' + style.plinth, 'Двери: ' + style.doors, 'Акцент: ' + style.accent.finish];
  notes.forEach((t, i) => { wrapText(t, 34).forEach((line, j) => { b += `<text x="${ax}" y="${M + 40 + i * 46 + j * 14}" font-size="10" fill="#57514A">${esc(line)}</text>`; }); });
  { // фото готового интерьера помещения
    const ph = roomPhotos(room, 1)[0];
    if (ph) {
      const py = M + 40 + notes.length * 46 + 6, pw = 230;
      b += `<image href="${ph.data}" x="${ax}" y="${py}" width="${pw}" height="${pw * 0.66}" preserveAspectRatio="xMidYMid slice"/>`;
      b += `<rect x="${ax}" y="${py}" width="${pw}" height="${pw * 0.66}" fill="none" stroke="#1C1C1C" stroke-width="0.8"/>`;
      b += `<text x="${ax}" y="${py + pw * 0.66 + 12}" font-size="8.4" fill="#57514A">Реализация: ${esc(room.name)}</text>`;
    }
  }
  b += `<text x="${M}" y="${M - 40}" font-size="16" font-weight="700" fill="#2E2A26">Развертка · ${esc(room.name)} · стена ${wallKey}</text>`;
  b += `<text x="${M}" y="${M - 24}" font-size="11" fill="#7A756D">Вид изнутри помещения · отметки от чистого пола</text>`;
  b += stamp(M, Hd - 60, Math.min(w + 220, ax - M - 24), `Развертка ${room.name}, стена ${wallKey}`, sheet);
  return svgDoc(Wd, Hd + 10, b);
}
function wrapText(t, n) { const out = []; let cur = ''; for (const word of t.split(' ')) { if ((cur + ' ' + word).trim().length > n) { out.push(cur.trim()); cur = word; } else cur += ' ' + word; } if (cur.trim()) out.push(cur.trim()); return out; }

// ---------- план потолка (2–3 уровня, отметки по ГОСТ) ----------
const mark = mm => '+' + (mm / 1000).toFixed(3).replace('.', ',');
function drawCeiling(room, sheet) {
  const M = 90, WT = 12, w = px(room.w), l = px(room.l);
  const Wd = Math.max(760, w + M * 2 + 60), Hd = l + M * 2 + 150;
  const L = lightsFor(room);
  const lv = ceilingLevelsFor(room);
  const drop = 120; // перепад уровня, мм
  let islandLabel = '';
  let b = roomWalls(M, WT, room, sheet, '#E9E4D8'); // уровень 2 (короб по периметру) — базовая заливка
  // уровень 1 (базовый потолок) — внутренняя зона
  const bx = M + px(lv.box), by = M + px(lv.box), bw = w - 2 * px(lv.box), bl = l - 2 * px(lv.box);
  b += `<rect x="${bx}" y="${by}" width="${bw}" height="${bl}" fill="#F6F3EC" stroke="#57514A" stroke-width="1.2"/>`;
  // LED по внутреннему контуру короба
  b += `<rect x="${bx + 4}" y="${by + 4}" width="${bw - 8}" height="${bl - 8}" fill="none" stroke="#C29A5B" stroke-width="1.4" stroke-dasharray="6 4"/>`;
  // отметки уровней (по углам, чтобы не пересекались с нишами и треком)
  // плашку уровня ставим в позицию без светильников и вне полосы ниши штор
  const spotsPx = L.spots.map(sp => ({ x: M + px(sp.x), y: M + px(sp.y) }));
  const nicheBottom = room.windows.some(o => o.wall === 'C'), nicheTop = room.windows.some(o => o.wall === 'A');
  const cands2 = [];
  for (let yy = M + 26; yy <= M + l - 26; yy += 10) for (const xx of [M + 8, M + w - 146]) cands2.push([xx, yy]);
  cands2.sort((a, b) => Math.abs(a[1] - (M + l - 30)) - Math.abs(b[1] - (M + l - 30))); // ближе к низу плана
  const cands2f = cands2.filter(c => !(nicheTop && c[1] < M + 44) && !(nicheBottom && c[1] > M + l - 44));
  const busy = [{ x: bx + bw - 96, y: by + bl - 26, w: 88, h: 16 }]; // плашка «1 ур.»
  const freeRect = (list, bw2, bh) => list.find(c =>
    !spotsPx.some(sp => sp.x > c[0] - 8 && sp.x < c[0] + bw2 + 8 && sp.y > c[1] - 8 && sp.y < c[1] + bh + 8)
    && !busy.some(r => c[0] < r.x + r.w + 6 && c[0] + bw2 > r.x - 6 && c[1] < r.y + r.h + 6 && c[1] + bh > r.y - 6)
  ) || list[0] || [M + 8, M + l - 24];
  const t2 = `2 ур. ${mark(room.h - drop)} · короб ${lv.box}`, w2 = t2.length * 5.6 + 14;
  const p2 = freeRect(cands2f.length ? cands2f : cands2, w2, 16);
  let levelPlates = `<g font-size="10" fill="#2E2A26"><rect x="${p2[0]}" y="${p2[1]}" width="${w2}" height="16" fill="#FFFFFFE6" stroke="#57514A" stroke-width="0.6"/><text x="${p2[0] + 6}" y="${p2[1] + 12}">${t2}</text>`;
  levelPlates += `<rect x="${bx + bw - 96}" y="${by + bl - 26}" width="88" height="16" fill="#FFFFFFE6" stroke="#57514A" stroke-width="0.6"/><text x="${bx + bw - 90}" y="${by + bl - 14}">1 ур. ${mark(room.h)}</text></g>`;
  // уровень 3 — «парящий остров»
  if (lv.three && lv.island) {
    const i = lv.island;
    b += `<rect x="${M + px(i.x)}" y="${M + px(i.y)}" width="${px(i.w)}" height="${px(i.l)}" fill="#E0D9C9" stroke="#57514A" stroke-width="1.2"/>`;
    b += `<rect x="${M + px(i.x) + 4}" y="${M + px(i.y) + 4}" width="${px(i.w) - 8}" height="${px(i.l) - 8}" fill="none" stroke="#C29A5B" stroke-width="1.4" stroke-dasharray="6 4"/>`;
    const ic = [[M + px(i.x), M + px(i.y) - 24], [M + px(i.x), M + px(i.y + i.l) + 8], [M + px(i.x) + px(i.w) - 188, M + px(i.y) - 24], [M + px(i.x) + 8, M + px(i.y) + 8]];
    const ip = freeRect(ic, 188, 16);
    busy.push({ x: ip[0], y: ip[1], w: 188, h: 16 });
    islandLabel = `<g font-size="10" fill="#2E2A26"><rect x="${ip[0]}" y="${ip[1]}" width="188" height="16" fill="#FFFFFFE6" stroke="#57514A" stroke-width="0.6"/><text x="${ip[0] + 6}" y="${ip[1] + 12}">3 ур. ${mark(room.h - 2 * drop)} · парящий, щель 10</text></g>`;
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
  b += levelPlates + islandLabel;
  b += `<text x="${M - WT}" y="${M - 46}" font-size="16" font-weight="700" fill="#2E2A26">План потолка · ${esc(room.name)}</text>`;
  b += `<text x="${M - WT}" y="${M - 28}" font-size="11" fill="#7A756D">${esc(style.ceiling)} · ${lv.three ? '3 уровня' : '2 уровня'} · перепад ${drop} мм · LED ${lv.ledLen} м.п. · отметки от чистого пола</text>`;
  b += dimH(M, M + w, M + l + 34, String(room.w));
  b += dimV(M + w + 34, M, M + l, String(room.l));
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
  b += `<text x="${X + q(1020)}" y="${y1 + q(27) + 16}" font-size="10" fill="#57514A">1 ур.: ПП 60×27 + ГКЛ 12,5 · ${mark(BASE_H)}</text>`;
  // короб 2 уровня с LED-полкой
  const y2 = y1 + q(120); // низ короба
  b += `<rect x="${X}" y="${y1}" width="${q(450)}" height="${y2 - y1 + q(12.5)}" fill="#E9E4D8" stroke="#2E2A26" stroke-width="1"/>`;
  b += `<text x="${X + 8}" y="${y1 + 18}" font-size="10" fill="#57514A">короб 450</text>`;
  // LED полка 100 с бортиком 50, зазор 70 до 1 уровня
  const shelfY = y1 + q(50);
  b += `<rect x="${X + q(450)}" y="${shelfY}" width="${q(100)}" height="${q(12.5)}" fill="#E9E4D8" stroke="#2E2A26" stroke-width="1"/>`;
  b += `<rect x="${X + q(535)}" y="${shelfY - q(50)}" width="${q(15)}" height="${q(50)}" fill="#E9E4D8" stroke="#2E2A26" stroke-width="1"/>`;
  b += `<circle cx="${X + q(480)}" cy="${shelfY - 4}" r="3" fill="#C29A5B"/><rect x="${X + q(560) - 4}" y="${shelfY - 19}" width="292" height="15" fill="#FAF9F6E6"/><text x="${X + q(560)}" y="${shelfY - 8}" font-size="10" fill="#8A6A3B">LED 3000K в профиле, полка 100 · бортик 50 · зазор 70</text>`;
  b += `<text x="${X + 8}" y="${y2 + q(12.5) + 18}" font-size="10" fill="#57514A">низ короба ${mark(BASE_H - 120)}</text>`;
  // размерные
  b += dimV(X - 26, Y + q(60), y1, '180');
  b += dimV(X - 26, y1, y2 + q(12.5), '~130');
  b += dimH(X, X + q(450), y2 + q(12.5) + 34, '450');
  b += dimH(X + q(450), X + q(550), y2 + q(12.5) + 34, '100');
  b += `<text x="${X}" y="${Y - 44}" font-size="16" font-weight="700" fill="#2E2A26">Узел А · Короб 2-го уровня со скрытой LED-подсветкой</text>`;
  b += `<text x="${X}" y="${Y - 26}" font-size="11" fill="#7A756D">М 1:20 · применяется на планах потолков всех помещений · блок питания LED с запасом 30% и ревизионным люком</text>`;
  b += stamp(X, y2 + q(12.5) + 60, q(1400), 'Узел А. Короб с LED', sheet, '1:20');
  return svgDoc(Math.max(790, q(1400) + M * 2), y2 + q(12.5) + 130 + M, b);
}

// ---------- план электрики ----------
function drawElectro(room, sheet) {
  const M = 90, WT = 12, w = px(room.w), l = px(room.l);
  const Wd = Math.max(760, w + M * 2 + 60), Hd = l + M * 2 + 150;
  const pts = electroFor(room);
  let b = roomWalls(M, WT, room, sheet, CAD.paper);
  for (const o of room.windows) b += openingPlan(o, 'window', M, WT, room);
  for (const o of room.doors) b += openingPlan(o, 'door', M, WT, room);
  // мебель призраком
  for (const f of furnitureFor(room)) b += `<rect x="${M + px(f.x)}" y="${M + px(f.y)}" width="${px(f.w)}" height="${px(f.h)}" fill="none" stroke="#C5BFB2" stroke-width="1" rx="2"/>`;
  // точки: сначала все символы, затем все подписи (чтобы символы не перечёркивали текст)
  let s = 0, sw = 0, labs = '';
  const placed = []; // занятые прямоугольники подписей — расталкиваем коллизии по вертикали
  const seenLab = [];
  for (const p of pts) {
    const x = M + px(p.x), y = M + px(p.y);
    const dup = seenLab.some(q => q.t === p.label && Math.abs(q.x - x) < 160 && Math.abs(q.y - y) < 60);
    seenLab.push({ t: p.label, x, y });
    const lab = p.label.toLowerCase();
    if (p.type === 'socket') { s++;
      const ip44 = /ip44|полот|фен/.test(lab), weak = /tv|lan|тв/.test(lab), outp = /вывод|встройк/.test(lab);
      b += `<g stroke="#2E2A26" stroke-width="1.4"><circle cx="${x}" cy="${y}" r="6" fill="${weak ? '#E8F0E8' : '#FFF'}"/><line x1="${x - 6}" y1="${y - 8}" x2="${x + 6}" y2="${y - 8}"/><line x1="${x - 4}" y1="${y - 11}" x2="${x + 4}" y2="${y - 11}"/></g>`;
      if (ip44) b += `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="#2E2A26" stroke-width="0.8"/>`; // защищённое исполнение
      if (weak) b += `<text x="${x}" y="${y + 3}" font-size="6.5" font-weight="700" text-anchor="middle" fill="#27703F">TV</text>`;
      if (outp) b += `<line x1="${x - 4}" y1="${y + 4}" x2="${x + 4}" y2="${y + 4}" stroke="#2E2A26" stroke-width="1.2"/>`; // вывод под встройку
    } else { sw++;
      const pass = /проходн/.test(lab), two = /2-кл|двух/.test(lab);
      b += `<g stroke="#2E2A26" stroke-width="1.4"><circle cx="${x}" cy="${y}" r="5" fill="#2E2A26"/><line x1="${x}" y1="${y - 5}" x2="${x + 7}" y2="${y - 12}"/><line x1="${x + 7}" y1="${y - 12}" x2="${x + 12}" y2="${y - 9}"/></g>`;
      if (pass) b += `<line x1="${x + 2}" y1="${y - 7}" x2="${x + 9}" y2="${y - 14}" stroke="#2E2A26" stroke-width="1.1"/>`; // вторая клавиша — проходной
      if (two) b += `<circle cx="${x - 7}" cy="${y}" r="3" fill="#2E2A26"/>`;
    }
    // привязка L/H — в самой подписи позиции (см. легенду)
    if (dup) continue; // повтор той же подписи рядом — не дублируем
    const dl = Math.round(Math.min(p.x, room.w - p.x, p.y, room.l - p.y));
    const txt = `${p.label} · ${dl}/${p.h}`;
    const tw = txt.length * 4.8 + 6;
    const right = p.x > room.w / 2;
    const lx = right ? x - 12 : x + 12;
    let lyy = p.type === 'switch' ? y - 16 : y + 6;
    const x1 = right ? lx - tw : lx - 3, x2 = x1 + tw;
    let guard = 0;
    const symbols = pts.map(q => ({ x1: M + px(q.x) - 9, x2: M + px(q.x) + 9, y: M + px(q.y) }));
    const bad = () => placed.some(r => x1 < r.x2 + 4 && x2 > r.x1 - 4 && Math.abs(lyy - r.y) < 13)
      || symbols.some(r => x1 < r.x2 && x2 > r.x1 && Math.abs(lyy - r.y) < 9);
    while (bad() && guard++ < 10) lyy += 15;
    placed.push({ x1, x2, y: lyy });
    labs += `<rect x="${x1}" y="${lyy - 9}" width="${tw}" height="13" fill="#FBFAF6D9"/>`;
    labs += `<text x="${lx}" y="${lyy}" font-size="8.5" fill="#57514A" text-anchor="${right ? 'end' : 'start'}">${esc(txt)}</text>`;
  }
  b += labs;
  b += `<text x="${M - WT}" y="${M - 46}" font-size="16" font-weight="700" fill="#2E2A26">План электрики · ${esc(room.name)}</text>`;
  b += `<text x="${M - WT}" y="${M - 28}" font-size="11" fill="#7A756D">Розетки — ${s} поз. · выключатели — ${sw} поз. · высоты от чистого пола, мм</text>`;
  b += dimH(M, M + w, M + l + 34, String(room.w));
  b += dimV(M + w + 34, M, M + l, String(room.l));
  const ly = M + l + 56;
  b += `<g font-size="10" fill="#57514A"><circle cx="${M + 6}" cy="${ly - 3}" r="6" fill="#FFF" stroke="#2E2A26"/><line x1="${M}" y1="${ly - 11}" x2="${M + 12}" y2="${ly - 11}" stroke="#2E2A26"/><text x="${M + 18}" y="${ly}">розетка (блок)</text>`;
  b += `<circle cx="${M + 146}" cy="${ly - 3}" r="5" fill="#2E2A26"/><text x="${M + 158}" y="${ly}">выключатель</text>`;
  b += `<circle cx="${M + 286}" cy="${ly - 3}" r="6" fill="#E8F0E8" stroke="#2E2A26" stroke-width="1.2"/><text x="${M + 286}" y="${ly}" font-size="6.5" font-weight="700" text-anchor="middle" fill="#27703F">TV</text><text x="${M + 298}" y="${ly}">слаботочная (TV/LAN)</text>`;
  b += `<circle cx="${M + 456}" cy="${ly - 3}" r="6" fill="#FFF" stroke="#2E2A26" stroke-width="1.2"/><circle cx="${M + 456}" cy="${ly - 3}" r="9" fill="none" stroke="#2E2A26" stroke-width="0.8"/><text x="${M + 470}" y="${ly}">IP44 (влажная зона)</text></g>`;
  b += `<text x="${M - WT}" y="${ly + 14}" font-size="8.5" fill="#57514A">В подписи после названия — привязка L/H: расстояние до ближайшей стены / высота установки от чистого пола, мм.</text>`;
  b += `<text x="${M - WT}" y="${ly + 30}" font-size="9.5" font-weight="600" fill="#B0483A">* Розетки — h=300 от чистого пола по умолчанию; отклонения подписаны у позиций. Выключатели — h=900.</text>`;
  b += `<text x="${M - WT}" y="${ly + 44}" font-size="9" fill="#8A8478">Санузлы: линии через УЗО 30 мА, розетки IP44 · выключатели со стороны ручки двери, ≥100 мм от проёма · привязки уточняются инженерным проектом</text>`;
  b += stamp(M - WT, l + M * 2 + 100, w + 2 * WT + 40, `Электрика. ${room.name}`, sheet);
  return svgDoc(Wd + 20, Hd + 10, b);
}

// ================================================================
// СВОДНЫЕ ПОКВАРТИРНЫЕ ЛИСТЫ (канон рабочих альбомов: весь план,
// экспликация, условные обозначения, нумерованные примечания)
// ================================================================
// Палитра рабочей документации (стандарт CAD-альбомов, снят с эталона remplanner/Тринити)
const CAD = {
  paper: '#FFFFFF',      // фон листа
  wallFill: '#9A9A9A',   // заливка стен
  wallStroke: '#1C1C1C', // обводка стен
  hatch: '#6E6E6E',      // штриховка наружных стен
  frame: '#1C1C1C',      // рамка листа
  dim: '#2A2A2A',        // размерные линии и текст
  furn: '#2E9E4F',       // мебель — зелёные контуры
  curtain: '#2E9E4F',    // шторы — зелёная волна
  doorArc: '#2A2A2A',    // дуги открывания
  window: '#7FB2C8',     // остекление
  roomFill: '#E4F0DC',   // заливка помещений (экспликация)
  newWall: '#7030A0',    // новые перегородки (пурпур, как в эталоне)
  plumb: '#0072C8',      // возводимые блоки / сантех-короба (синий)
  chand: '#FEFE00',      // люстры — жёлтая заливка
  chandSpoke: '#E8A000', // спицы люстр
  spot: '#FEFE00',       // споты — жёлтые кружки с обводкой
  spotStroke: '#8A7A10',
  ledDot: '#21A366',     // зелёная точка «вывод подсветки»
  led: '#E10000',        // LED-лента — красный пунктир
  elec: '#21A366',       // розетки/выключатели — зелёные контуры
  tp: '#E5B9B6',         // зона тёплого пола (розовая заливка)
  tpCable: '#CD110F',    // кабель/датчик ТП
  tpReg: '#00A651',      // терморегулятор
  finPaint: '#00B04E',   // отделка: краска/обои под покраску
  finTile: '#02AFF3',    // отделка: плитка
  finApron: '#F90101',   // отделка: фартук
  callout: '#1C1C1C'     // выноски
};

// Автокомпоновка квартиры, если координаты комнат не заданы в брифе (бриф с сайта):
// раскладываем помещения рядами по ширине «полосы», жилые сверху, служебные снизу —
// это даёт связную планировку для сводных листов вместо их пропуска.
function autoLayout() {
  const INT = 150; // перегородка между помещениями, мм
  const order = [...rooms].sort((a, b) => {
    const rank = t => ({ 'living-kitchen': 0, living: 1, kitchen: 2, bedroom: 3, kids: 4, cabinet: 5, hallway: 6, bathroom: 7, wc: 8 }[t] ?? 9);
    return rank(a.type) - rank(b.type) || b.area - a.area;
  });
  const target = Math.max(...order.map(r => r.w), Math.round(Math.sqrt(order.reduce((s, r) => s + r.w * r.l, 0)) * 1.25));
  let x = 0, y = 0, rowH = 0;
  for (const r of order) {
    if (x > 0 && x + r.w > target) { x = 0; y += rowH + INT; rowH = 0; }
    r.pos = { x, y };
    x += r.w + INT;
    rowH = Math.max(rowH, r.l);
  }
  // окна — только во внешних стенах получившейся раскладки
  const maxY = Math.max(...rooms.map(o => o.pos.y + o.l));
  for (const r of rooms) {
    for (const o of r.windows) {
      const top = r.pos.y === 0, bottom = Math.abs(r.pos.y + r.l - maxY) < 1;
      o.wall = top ? 'A' : bottom ? 'C' : (r.pos.x === 0 ? 'D' : 'B');
      const wallLen = (o.wall === 'A' || o.wall === 'C') ? r.w : r.l;
      o.off = Math.max(200, Math.min(o.off, wallLen - o.w - 200));
    }
  }
  return true;
}
if (rooms.length && rooms.some(r => !r.pos)) autoLayout();
const flatRooms = rooms.filter(r => r.pos);
const FLAT = flatRooms.length === rooms.length && rooms.length > 0 ? {
  x0: Math.min(...flatRooms.map(r => r.pos.x)), y0: Math.min(...flatRooms.map(r => r.pos.y)),
  x1: Math.max(...flatRooms.map(r => r.pos.x + r.w)), y1: Math.max(...flatRooms.map(r => r.pos.y + r.l))
} : null;
if (FLAT) { FLAT.W = FLAT.x1 - FLAT.x0; FLAT.H = FLAT.y1 - FLAT.y0; }
const EXT = 200; // наружная стена, мм
const BASE_H = rooms.length ? rooms[0].h : 2700; // высота потолка объекта, мм

function flatLayer(MX, MY, opts) {
  opts = opts || {};
  const fx = mm => MX + px(EXT + mm - FLAT.x0);
  const fy = mm => MY + px(EXT + mm - FLAT.y0);
  const bx = MX, by = MY, bw2 = px(FLAT.W + 2 * EXT), bh2 = px(FLAT.H + 2 * EXT);
  // стены: серая заливка + чёрный контур; наружная полоса — с диагональной штриховкой
  let s = `<defs><pattern id="wh${opts.id || 0}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="${CAD.wallFill}"/><line x1="0" y1="0" x2="0" y2="7" stroke="${CAD.hatch}" stroke-width="2"/></pattern></defs>`;
  s += `<rect x="${bx}" y="${by}" width="${bw2}" height="${bh2}" fill="url(#wh${opts.id || 0})" stroke="${CAD.wallStroke}" stroke-width="1.6"/>`;
  // внутренняя зона (перегородки без штриховки — ровный серый)
  s += `<rect x="${fx(FLAT.x0)}" y="${fy(FLAT.y0)}" width="${px(FLAT.W)}" height="${px(FLAT.H)}" fill="${CAD.wallFill}"/>`;
  for (const r of flatRooms) s += `<rect x="${fx(r.pos.x)}" y="${fy(r.pos.y)}" width="${px(r.w)}" height="${px(r.l)}" fill="${opts.roomFill || CAD.paper}" stroke="${CAD.wallStroke}" stroke-width="1.1"/>`;
  // дверные проёмы: прорезь + полотно + дуга открывания
  for (const r of flatRooms) for (const o of r.doors) {
    const t = 320, inset = 40;
    let rx, ry, rw2, rh2;
    if (o.wall === 'A') { rx = fx(r.pos.x + o.off); ry = fy(r.pos.y) - px(t - inset); rw2 = px(o.w); rh2 = px(t); }
    else if (o.wall === 'C') { rx = fx(r.pos.x + o.off); ry = fy(r.pos.y + r.l) - px(inset); rw2 = px(o.w); rh2 = px(t); }
    else if (o.wall === 'D') { rx = fx(r.pos.x) - px(t - inset); ry = fy(r.pos.y + o.off); rw2 = px(t); rh2 = px(o.w); }
    else { rx = fx(r.pos.x + r.w) - px(inset); ry = fy(r.pos.y + o.off); rw2 = px(t); rh2 = px(o.w); }
    s += `<rect x="${rx}" y="${ry}" width="${rw2}" height="${rh2}" fill="${CAD.paper}"/>`;
    if (opts.doorArcs !== false) {
      // полотно от петли внутрь комнаты + четверть-дуга
      const rad = px(o.w);
      let hx, hy, leafX, leafY, arc;
      if (o.wall === 'C') { hx = fx(r.pos.x + o.off); hy = fy(r.pos.y + r.l); leafX = hx; leafY = hy - rad; arc = `M ${hx + rad} ${hy} A ${rad} ${rad} 0 0 0 ${hx} ${hy - rad}`; }
      else if (o.wall === 'A') { hx = fx(r.pos.x + o.off); hy = fy(r.pos.y); leafX = hx; leafY = hy + rad; arc = `M ${hx + rad} ${hy} A ${rad} ${rad} 0 0 1 ${hx} ${hy + rad}`; }
      else if (o.wall === 'D') { hx = fx(r.pos.x); hy = fy(r.pos.y + o.off); leafX = hx + rad; leafY = hy; arc = `M ${hx} ${hy + rad} A ${rad} ${rad} 0 0 1 ${hx + rad} ${hy}`; }
      else { hx = fx(r.pos.x + r.w); hy = fy(r.pos.y + o.off); leafX = hx - rad; leafY = hy; arc = `M ${hx} ${hy + rad} A ${rad} ${rad} 0 0 0 ${hx - rad} ${hy}`; }
      s += `<line x1="${hx}" y1="${hy}" x2="${leafX}" y2="${leafY}" stroke="${CAD.doorArc}" stroke-width="1.4"/>`;
      s += `<path d="${arc}" fill="none" stroke="${CAD.doorArc}" stroke-width="0.7"/>`;
    }
  }
  // окна: проём в наружной стене + линии рам + остекление
  for (const r of flatRooms) for (const o of r.windows) {
    let rx, ry, rw2, rh2, horiz;
    if (o.wall === 'A') { rx = fx(r.pos.x + o.off); ry = fy(r.pos.y) - px(EXT); rw2 = px(o.w); rh2 = px(EXT); horiz = true; }
    else if (o.wall === 'C') { rx = fx(r.pos.x + o.off); ry = fy(r.pos.y + r.l); rw2 = px(o.w); rh2 = px(EXT); horiz = true; }
    else if (o.wall === 'D') { rx = fx(r.pos.x) - px(EXT); ry = fy(r.pos.y + o.off); rw2 = px(EXT); rh2 = px(o.w); horiz = false; }
    else { rx = fx(r.pos.x + r.w); ry = fy(r.pos.y + o.off); rw2 = px(EXT); rh2 = px(o.w); horiz = false; }
    s += `<rect x="${rx}" y="${ry}" width="${rw2}" height="${rh2}" fill="${CAD.paper}" stroke="${CAD.wallStroke}" stroke-width="1"/>`;
    if (horiz) { const my = ry + rh2 / 2; s += `<line x1="${rx}" y1="${my - 2.2}" x2="${rx + rw2}" y2="${my - 2.2}" stroke="${CAD.window}" stroke-width="1.6"/><line x1="${rx}" y1="${my + 2.2}" x2="${rx + rw2}" y2="${my + 2.2}" stroke="${CAD.wallStroke}" stroke-width="0.7"/>`; }
    else { const mx = rx + rw2 / 2; s += `<line x1="${mx - 2.2}" y1="${ry}" x2="${mx - 2.2}" y2="${ry + rh2}" stroke="${CAD.window}" stroke-width="1.6"/><line x1="${mx + 2.2}" y1="${ry}" x2="${mx + 2.2}" y2="${ry + rh2}" stroke="${CAD.wallStroke}" stroke-width="0.7"/>`; }
  }
  return { s, fx, fy };
}

// выноска-плашка с линией-указкой (стандарт рабочих альбомов)
function callout(tx, ty, px2, py2, text) {
  const w = text.length * 5.4 + 12;
  return `<line x1="${px2}" y1="${py2}" x2="${tx + (tx > px2 ? 0 : w)}" y2="${ty + 8}" stroke="${CAD.callout}" stroke-width="0.6"/>
<rect x="${tx}" y="${ty}" width="${w}" height="16" fill="#FFF" stroke="${CAD.callout}" stroke-width="0.8"/>
<text x="${tx + 6}" y="${ty + 11.5}" font-size="8.6" fill="${CAD.callout}">${esc(text)}</text>`;
}

function flatRoomMarks(fx, fy, full) { // номер в кружке (+ имя и площадь на полных)
  let s = '';
  for (const r of flatRooms) {
    const cx = fx(r.pos.x + r.w / 2), cy = fy(r.pos.y + r.l / 2);
    if (full) {
      s += `<rect x="${cx - 60}" y="${cy - 26}" width="120" height="52" fill="#FCFBF8D9"/>`;
      s += `<circle cx="${cx}" cy="${cy - 12}" r="10" fill="#FFF" stroke="#2E2A26" stroke-width="1.1"/><text x="${cx}" y="${cy - 8}" font-size="9" font-weight="700" text-anchor="middle" fill="#2E2A26">${r.idx}</text>`;
      s += `<text x="${cx}" y="${cy + 8}" font-size="10.5" font-weight="600" text-anchor="middle" fill="#2E2A26">${esc(r.name)}</text>`;
      s += `<text x="${cx}" y="${cy + 21}" font-size="9.5" text-anchor="middle" fill="#57514A" text-decoration="underline">S=${r.area} м²</text>`;
    } else {
      s += `<circle cx="${cx}" cy="${cy}" r="9" fill="#FFFFFFD9" stroke="#8A8478" stroke-width="0.9"/><text x="${cx}" y="${cy + 3.5}" font-size="8.5" font-weight="700" text-anchor="middle" fill="#57514A">${r.idx}</text>`;
    }
  }
  return s;
}

// каркас сводного листа: рамка, заголовок, колонка справа, примечания, штамп
function flatSheet(sheetNo, title, sub, layerFn, rightFn, notes, lopts) {
  const MX = 70, MY = 96;
  const planW = px(FLAT.W + 2 * EXT), planH = px(FLAT.H + 2 * EXT);
  const LGX = MX + planW + 76, LGW = 268;
  const Wd = LGX + LGW + 26;
  const base = flatLayer(MX, MY, Object.assign({ id: sheetNo }, lopts || {}));
  let b = base.s + layerFn(base);
  b += rightFn(LGX, MY, LGW);
  let ny = MY + planH + 104;
  b += `<text x="${MX}" y="${ny - 22}" font-size="10" font-weight="700" fill="#2E2A26">Примечания:</text>`;
  notes.forEach((n, i) => { b += `<text x="${MX}" y="${ny - 8 + i * 14}" font-size="9" fill="#57514A">${i + 1}. ${esc(n)}</text>`; });
  const stY = ny - 16 + notes.length * 14 + 10;
  b += `<text x="${MX}" y="${MY - 52}" font-size="17" font-weight="700" fill="#2E2A26">${esc(title)}</text>`;
  b += `<text x="${MX}" y="${MY - 34}" font-size="11" fill="#7A756D">${esc(sub)}</text>`;
  b += flatStamp(Wd - 26 - 560, stY, 560, title, sheetNo);
  const Hd = stY + 56 + 26;
  b = `<rect x="16" y="16" width="${Wd - 32}" height="${Hd - 32}" fill="none" stroke="${CAD.frame}" stroke-width="1.3"/>` + b;
  return svgDoc(Wd, Hd, b, CAD.paper);
}

function flatLegendBox(x, y, w, title, rows) { // rows: [{sym, text}] sym = функция (sx, sy) => svg
  // высота строки зависит от числа переносов — многострочные записи не наезжают на соседние
  const wrapped = rows.map(r0 => wrapText(r0.text, 40));
  const heights = wrapped.map(ls => Math.max(20, ls.length * 11 + 8));
  const total = heights.reduce((a, b) => a + b, 0);
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${total + 30}" fill="none" stroke="#8A8478" stroke-width="0.8"/>`;
  s += `<text x="${x + 10}" y="${y + 18}" font-size="10.5" font-weight="700" fill="#2E2A26">${esc(title)}</text>`;
  let sy = y + 34;
  rows.forEach((r0, i) => {
    s += r0.sym(x + 12, sy);
    wrapped[i].forEach((line, j) => { s += `<text x="${x + 38}" y="${sy + 3 + j * 11}" font-size="8.7" fill="#57514A">${esc(line)}</text>`; });
    sy += heights[i];
  });
  return s;
}

// 1. Обмерный план квартиры: прострелы по осям + экспликация
function drawFlatObmer(sheetNo) {
  return flatSheet(sheetNo, 'Обмерный план квартиры', `${esc((brief.object && brief.object.address) || '')} · ${totalArea} м² · все размеры в мм`, base => {
    let s = flatRoomMarks(base.fx, base.fy, true);
    // прострел по X (низ) и по Y (право) по всем осям стен
    const xs = [...new Set(flatRooms.flatMap(r => [r.pos.x, r.pos.x + r.w]))].sort((a, b) => a - b);
    const ys = [...new Set(flatRooms.flatMap(r => [r.pos.y, r.pos.y + r.l]))].sort((a, b) => a - b);
    const yb = base.fy(FLAT.y1) + px(EXT) + 26, xr = base.fx(FLAT.x1) + px(EXT) + 26;
    for (let i = 0; i + 1 < xs.length; i++) if (xs[i + 1] - xs[i] > 60) s += dimH(base.fx(xs[i]), base.fx(xs[i + 1]), yb, String(xs[i + 1] - xs[i]));
    s += dimH(base.fx(FLAT.x0) - px(EXT), base.fx(FLAT.x1) + px(EXT), yb + 24, String(FLAT.W + 2 * EXT));
    for (let i = 0; i + 1 < ys.length; i++) if (ys[i + 1] - ys[i] > 60) s += dimV(xr, base.fy(ys[i]), base.fy(ys[i + 1]), String(ys[i + 1] - ys[i]));
    s += dimV(xr + 24, base.fy(FLAT.y0) - px(EXT), base.fy(FLAT.y1) + px(EXT), String(FLAT.H + 2 * EXT));
    s += `<g><rect x="${base.fx(FLAT.x0) - px(EXT)}" y="${base.fy(FLAT.y0) - px(EXT) - 26}" width="430" height="18" fill="#FFF6F4" stroke="#B0483A" stroke-width="1.1"/><text x="${base.fx(FLAT.x0) - px(EXT) + 8}" y="${base.fy(FLAT.y0) - px(EXT) - 13}" font-size="10" font-weight="600" fill="#B0483A">H=${BASE_H} · наружные стены 200, перегородки 150 · без учёта отделочного слоя</text></g>`;
    return s;
  }, (x, y, w) => {
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${flatRooms.length * 20 + 58}" fill="none" stroke="#8A8478" stroke-width="0.8"/>`;
    s += `<text x="${x + 10}" y="${y + 18}" font-size="10.5" font-weight="700" fill="#2E2A26">Экспликация помещений</text>`;
    s += `<line x1="${x}" y1="${y + 26}" x2="${x + w}" y2="${y + 26}" stroke="#8A8478" stroke-width="0.6"/>`;
    flatRooms.forEach((r, i) => {
      const sy = y + 42 + i * 20;
      s += `<circle cx="${x + 18}" cy="${sy - 3}" r="8" fill="none" stroke="#57514A" stroke-width="0.9"/><text x="${x + 18}" y="${sy}" font-size="8.5" text-anchor="middle" fill="#2E2A26">${r.idx}</text>`;
      s += `<text x="${x + 34}" y="${sy}" font-size="9.5" fill="#2E2A26">${esc(r.name)}</text>`;
      s += `<text x="${x + w - 10}" y="${sy}" font-size="9.5" fill="#2E2A26" text-anchor="end">${r.area.toFixed(2)} м²</text>`;
    });
    const ty = y + 42 + flatRooms.length * 20;
    s += `<line x1="${x}" y1="${ty - 14}" x2="${x + w}" y2="${ty - 14}" stroke="#8A8478" stroke-width="0.6"/>`;
    s += `<text x="${x + 34}" y="${ty}" font-size="9.5" font-weight="700" fill="#2E2A26">Итого</text><text x="${x + w - 10}" y="${ty}" font-size="9.5" font-weight="700" fill="#2E2A26" text-anchor="end">${flatRooms.reduce((a, r) => a + r.area, 0).toFixed(2)} м²</text>`;
    return s;
  }, ['Все размеры даны в мм по внутренним поверхностям стен, без учёта отделочного слоя.', 'Размеры проверять по месту; допуск обмера ±5 мм в зонах встроенной мебели и санузлов.', 'За отметку 0,000 принят уровень чистового пола.']);
}

// 2. План расстановки мебели (общий) — CAD-стиль: зелёные контуры, шторы, выноски, фото-врезки
function drawFlatFurniture(sheetNo) {
  return flatSheet(sheetNo, 'Планировочное решение', `Расстановка мебели · шторы · выноски · референсы решений`, base => {
    let s = '';
    for (const r of flatRooms) for (const f of furnitureFor(r)) {
      const X = base.fx(r.pos.x + f.x), Y = base.fy(r.pos.y + f.y), W2 = px(f.w), H2 = px(f.h);
      const dash = f.key === 'rug' ? ' stroke-dasharray="4 3"' : '';
      s += `<rect x="${X}" y="${Y}" width="${W2}" height="${H2}" fill="none" stroke="${CAD.furn}" stroke-width="1"${dash}/>`;
      // деталировка CAD-символов
      if (f.key === 'bed') { // подушки + линия одеяла
        if (W2 >= H2) { s += `<rect x="${X + 3}" y="${Y + 3}" width="${W2 / 2 - 5}" height="${H2 * 0.28}" fill="none" stroke="${CAD.furn}" stroke-width="0.7" rx="2"/><rect x="${X + W2 / 2 + 2}" y="${Y + 3}" width="${W2 / 2 - 5}" height="${H2 * 0.28}" fill="none" stroke="${CAD.furn}" stroke-width="0.7" rx="2"/><line x1="${X}" y1="${Y + H2 * 0.4}" x2="${X + W2}" y2="${Y + H2 * 0.4}" stroke="${CAD.furn}" stroke-width="0.7"/>`; }
        else { s += `<rect x="${X + W2 - W2 * 0.28 - 3}" y="${Y + 3}" width="${W2 * 0.28}" height="${H2 / 2 - 5}" fill="none" stroke="${CAD.furn}" stroke-width="0.7" rx="2"/><rect x="${X + W2 - W2 * 0.28 - 3}" y="${Y + H2 / 2 + 2}" width="${W2 * 0.28}" height="${H2 / 2 - 5}" fill="none" stroke="${CAD.furn}" stroke-width="0.7" rx="2"/><line x1="${X + W2 * 0.6}" y1="${Y}" x2="${X + W2 * 0.6}" y2="${Y + H2}" stroke="${CAD.furn}" stroke-width="0.7"/>`; }
      }
      if (f.key === 'sofa') { // спинка и подлокотники
        s += W2 >= H2 ? `<line x1="${X}" y1="${Y + H2 * 0.3}" x2="${X + W2}" y2="${Y + H2 * 0.3}" stroke="${CAD.furn}" stroke-width="0.7"/><line x1="${X + 8}" y1="${Y + H2 * 0.3}" x2="${X + 8}" y2="${Y + H2}" stroke="${CAD.furn}" stroke-width="0.7"/><line x1="${X + W2 - 8}" y1="${Y + H2 * 0.3}" x2="${X + W2 - 8}" y2="${Y + H2}" stroke="${CAD.furn}" stroke-width="0.7"/>`
          : `<line x1="${X + W2 * 0.3}" y1="${Y}" x2="${X + W2 * 0.3}" y2="${Y + H2}" stroke="${CAD.furn}" stroke-width="0.7"/><line x1="${X + W2 * 0.3}" y1="${Y + 8}" x2="${X + W2}" y2="${Y + 8}" stroke="${CAD.furn}" stroke-width="0.7"/><line x1="${X + W2 * 0.3}" y1="${Y + H2 - 8}" x2="${X + W2}" y2="${Y + H2 - 8}" stroke="${CAD.furn}" stroke-width="0.7"/>`;
      }
      if (f.key === 'table' || f.key === 'dining') s += `<ellipse cx="${X + W2 / 2}" cy="${Y + H2 / 2}" rx="${W2 * 0.28}" ry="${H2 * 0.28}" fill="none" stroke="${CAD.furn}" stroke-width="0.7"/>`;
      if (f.key === 'wardrobe') { // штанга + диагонали
        s += W2 >= H2 ? `<line x1="${X}" y1="${Y + H2 / 2}" x2="${X + W2}" y2="${Y + H2 / 2}" stroke="${CAD.furn}" stroke-width="0.6" stroke-dasharray="6 3"/>` : `<line x1="${X + W2 / 2}" y1="${Y}" x2="${X + W2 / 2}" y2="${Y + H2}" stroke="${CAD.furn}" stroke-width="0.6" stroke-dasharray="6 3"/>`;
      }
      if (f.key === 'bath') s += `<rect x="${X + 4}" y="${Y + 4}" width="${W2 - 8}" height="${H2 - 8}" fill="none" stroke="${CAD.furn}" stroke-width="0.7" rx="6"/><circle cx="${X + W2 / 2}" cy="${Y + 9}" r="2" fill="${CAD.furn}"/>`;
    }
    // шторы — зелёная волна вдоль окон (внутри помещения)
    for (const r of flatRooms) for (const o of r.windows) {
      const n = Math.max(4, Math.round(px(o.w + 500) / 9));
      let pts = [];
      if (o.wall === 'A' || o.wall === 'C') {
        const y0 = o.wall === 'A' ? base.fy(r.pos.y) + 7 : base.fy(r.pos.y + r.l) - 7;
        const x0 = base.fx(r.pos.x + Math.max(50, o.off - 250));
        for (let i = 0; i <= n; i++) pts.push(`${x0 + i * 9},${y0 + (i % 2 ? 3.4 : -3.4)}`);
      } else {
        const x0 = o.wall === 'D' ? base.fx(r.pos.x) + 7 : base.fx(r.pos.x + r.w) - 7;
        const y0 = base.fy(r.pos.y + Math.max(50, o.off - 250));
        for (let i = 0; i <= n; i++) pts.push(`${x0 + (i % 2 ? 3.4 : -3.4)},${y0 + i * 9}`);
      }
      s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${CAD.curtain}" stroke-width="0.9"/>`;
    }
    // выноски к ключевым решениям (по одной на комнату)
    const co = [];
    for (const r of flatRooms) {
      const f0 = furnitureFor(r)[0];
      if (f0) co.push({ r, f: f0 });
    }
    co.slice(0, 4).forEach((c, i) => {
      const pxx = base.fx(c.r.pos.x + c.f.x + c.f.w / 2), pyy = base.fy(c.r.pos.y + c.f.y + c.f.h / 2);
      const top = pyy < MYREF();
      s += callout(base.fx(FLAT.x0) - px(EXT) + 10 + i * 150, top ? 66 : base.fy(FLAT.y1) + px(EXT) + 10, pxx, pyy, c.f.name.split(' ')[0] + (c.f.name.split(' ')[1] ? ' ' + c.f.name.split(' ')[1] : ''));
    });
    function MYREF() { return base.fy(FLAT.y0 + FLAT.H / 2); }
    return s + flatRoomMarks(base.fx, base.fy, true);
  }, (x, y, w) => {
    // фото-врезки: наши рендеры как референсы решений; миниатюры встраиваются base64,
    // чтобы работали внутри <img> просмотрщика (SVG в <img> не грузит внешние ресурсы)
    let s = '';
    const refs = [
      { f: '01-gostinaya-kuhnya.jpg', t: 'Гостиная-кухня' },
      { f: '02-spalnya.jpg', t: 'Спальня' },
      { f: '05-prihozhaya.jpg', t: 'Прихожая' },
    ];
    refs.forEach((rf, i) => {
      const iy = y + i * 202;
      let href = '../06-koncept/renders/' + rf.f;
      try {
        const raw = fs.readFileSync(path.join(outDir, '06-koncept', 'renders', 'thumbs', rf.f));
        href = 'data:image/jpeg;base64,' + raw.toString('base64');
      } catch (e) { /* нет миниатюры — относительная ссылка */ }
      s += `<text x="${x + w / 2}" y="${iy + 12}" font-size="10" font-weight="600" text-anchor="middle" fill="#1C1C1C" text-decoration="underline">${rf.t}</text>`;
      s += `<image href="${href}" x="${x}" y="${iy + 18}" width="${w}" height="168" preserveAspectRatio="xMidYMid slice"/>`;
      s += `<rect x="${x}" y="${iy + 18}" width="${w}" height="168" fill="none" stroke="#1C1C1C" stroke-width="0.8"/>`;
    });
    return s;
  }, ['Габариты и артикулы мебели — в спецификации (раздел 07) и на планах помещений (раздел 02).', 'Проходы между мебелью — не менее 600 мм, в кухонной зоне — не менее 900 мм.', 'Шторы — в потолочных нишах (см. планы потолков); карнизы по ширине проёма +500 мм.']);
}

// 3. План напольных покрытий (общий)
function drawFlatFloors(sheetNo) {
  return flatSheet(sheetNo, 'План напольных покрытий', 'Типы покрытий, направление укладки, отметки уровней', base => {
    let s = '';
    for (const r of flatRooms) {
      const wet = r.type === 'bathroom';
      const rx = base.fx(r.pos.x), ry = base.fy(r.pos.y), rw2 = px(r.w), rh2 = px(r.l);
      s += `<rect x="${rx}" y="${ry}" width="${rw2}" height="${rh2}" fill="${wet ? '#E3E7E4' : style.floor.color + '40'}"/>`;
      s += `<clipPath id="ff${r.idx}"><rect x="${rx}" y="${ry}" width="${rw2}" height="${rh2}"/></clipPath><g clip-path="url(#ff${r.idx})">`;
      if (wet) {
        for (let gx = 0; gx <= r.w; gx += 600) s += `<line x1="${rx + px(gx)}" y1="${ry}" x2="${rx + px(gx)}" y2="${ry + rh2}" stroke="#00000022" stroke-width="0.7"/>`;
        for (let gy = 0; gy <= r.l; gy += 600) s += `<line x1="${rx}" y1="${ry + px(gy)}" x2="${rx + rw2}" y2="${ry + px(gy)}" stroke="#00000022" stroke-width="0.7"/>`;
      } else {
        const st = px(300);
        for (let i = -Math.ceil(rh2 / st); i < rw2 / st + Math.ceil(rh2 / st); i++) {
          s += `<line x1="${rx + i * st}" y1="${ry}" x2="${rx + i * st + rh2}" y2="${ry + rh2}" stroke="#00000014" stroke-width="0.7"/>`;
          s += `<line x1="${rx + i * st}" y1="${ry + rh2}" x2="${rx + i * st + rh2}" y2="${ry}" stroke="#00000014" stroke-width="0.7"/>`;
        }
      }
      s += `</g>`;
      const cx = rx + rw2 / 2, cy = ry + rh2 / 2;
      s += `<rect x="${cx - 26}" y="${cy - 10}" width="52" height="15" fill="#FFFFFFE0" stroke="#57514A" stroke-width="0.7"/><text x="${cx}" y="${cy + 1}" font-size="9.5" font-weight="700" text-anchor="middle" fill="#2E2A26">${wet ? 'Пл-2' : 'Пл-1'}</text>`;
      s += `<circle cx="${rx + 20}" cy="${ry + rh2 - 18}" r="12" fill="#FFF" stroke="#2E2A26" stroke-width="1"/><text x="${rx + 20}" y="${ry + rh2 - 15}" font-size="6.6" text-anchor="middle" fill="#2E2A26">${wet ? '−0.020' : '0.000'}</text>`;
    }
    return s;
  }, (x, y, w) => {
    const dry = flatRooms.filter(r => r.type !== 'bathroom').reduce((a, r) => a + r.area, 0);
    const wetS = flatRooms.filter(r => r.type === 'bathroom').reduce((a, r) => a + r.area, 0);
    return flatLegendBox(x, y, w, 'Ведомость покрытий', [
      { sym: (sx, sy) => `<rect x="${sx}" y="${sy - 8}" width="16" height="11" fill="${style.floor.color}55" stroke="#57514A" stroke-width="0.7"/>`, text: `Пл-1 · ${style.floor.name.split(',')[0]} · ${(dry * 1.15).toFixed(1)} м² (+15% «ёлка»)` },
      { sym: (sx, sy) => `<rect x="${sx}" y="${sy - 8}" width="16" height="11" fill="#E3E7E4" stroke="#57514A" stroke-width="0.7"/>`, text: `Пл-2 · керамогранит 600×600 · ${(wetS * 1.1).toFixed(1)} м² (+10%)` },
      { sym: (sx, sy) => `<circle cx="${sx + 8}" cy="${sy - 3}" r="7" fill="#FFF" stroke="#2E2A26" stroke-width="0.9"/>`, text: 'отметка уровня чистового пола' },
    ]);
  }, ['Стыки покрытий выполнять на оси дверного полотна, скрыто, без порожков.', 'В санузле — гидроизоляция с заведением на стены 200 мм, отметка пола −0,020.', 'Компенсационный зазор у стен 10 мм — под плинтус.', 'Направление укладки «ёлки» — от главного окна помещения (см. раздел 03).']);
}

// 4. План потолков (общий)
function drawFlatCeiling(sheetNo) {
  return flatSheet(sheetNo, 'План потолков', `2–3 уровня · перепад 120 мм · скрытая LED 3000K · отметки от чистого пола`, base => {
    let s = '';
    for (const r of flatRooms) {
      const lv = ceilingLevelsFor(r);
      const rx = base.fx(r.pos.x), ry = base.fy(r.pos.y), rw2 = px(r.w), rh2 = px(r.l);
      s += `<rect x="${rx}" y="${ry}" width="${rw2}" height="${rh2}" fill="#E9E4D8"/>`;
      const off = px(lv.box);
      s += `<rect x="${rx + off}" y="${ry + off}" width="${rw2 - 2 * off}" height="${rh2 - 2 * off}" fill="#F6F3EC" stroke="#57514A" stroke-width="0.9"/>`;
      s += `<rect x="${rx + off + 3}" y="${ry + off + 3}" width="${rw2 - 2 * off - 6}" height="${rh2 - 2 * off - 6}" fill="none" stroke="#C29A5B" stroke-width="1.1" stroke-dasharray="5 3"/>`;
      if (lv.three && lv.island) s += `<rect x="${base.fx(r.pos.x + lv.island.x)}" y="${base.fy(r.pos.y + lv.island.y)}" width="${px(lv.island.w)}" height="${px(lv.island.l)}" fill="#E0D9C9" stroke="#57514A" stroke-width="0.9"/>`;
      for (const sp of lightsFor(r).spots) s += `<circle cx="${base.fx(r.pos.x + sp.x)}" cy="${base.fy(r.pos.y + sp.y)}" r="3" fill="#FFF" stroke="#57514A" stroke-width="0.8"/>`;
    }
    return s + flatRoomMarks(base.fx, base.fy, false);
  }, (x, y, w) => flatLegendBox(x, y, w, 'Условные обозначения', [
    { sym: (sx, sy) => `<rect x="${sx}" y="${sy - 8}" width="16" height="11" fill="#E9E4D8" stroke="#57514A" stroke-width="0.7"/>`, text: `короб 2-го уровня, отметка ${mark(BASE_H - 120)}` },
    { sym: (sx, sy) => `<rect x="${sx}" y="${sy - 8}" width="16" height="11" fill="#F6F3EC" stroke="#57514A" stroke-width="0.7"/>`, text: `базовый потолок, отметка ${mark(BASE_H)}` },
    { sym: (sx, sy) => `<rect x="${sx}" y="${sy - 8}" width="16" height="11" fill="#E0D9C9" stroke="#57514A" stroke-width="0.7"/>`, text: `«парящий» остров 3-го уровня, ${mark(BASE_H - 240)}` },
    { sym: (sx, sy) => `<line x1="${sx}" y1="${sy - 3}" x2="${sx + 16}" y2="${sy - 3}" stroke="#C29A5B" stroke-width="1.2" stroke-dasharray="5 3"/>`, text: `LED 3000K скрытая — ${rooms.reduce((a, r) => a + ceilingLevelsFor(r).ledLen, 0).toFixed(1)} м.п. всего` },
    { sym: (sx, sy) => `<circle cx="${sx + 8}" cy="${sy - 3}" r="4" fill="#FFF" stroke="#57514A" stroke-width="0.9"/>`, text: `точечные светильники — ${rooms.reduce((a, r) => a + lightsFor(r).spots.length, 0)} шт. всего` },
  ]), ['Отметки и перепады уровней — на планах потолков помещений (раздел 05).', 'Узел короба с LED-полкой — лист «Узел А», М 1:20.', 'Закладные под все подвесные светильники и карнизы предусмотреть до зашивки ГКЛ.']);
}

// 5. План электрики (общий)
function drawFlatElectro(sheetNo) {
  return flatSheet(sheetNo, 'План электрики', 'Розетки и выключатели · привязки и высоты — на планах помещений (раздел 09)', base => {
    let s = '';
    for (const r of flatRooms) {
      for (const f of furnitureFor(r)) s += `<rect x="${base.fx(r.pos.x + f.x)}" y="${base.fy(r.pos.y + f.y)}" width="${px(f.w)}" height="${px(f.h)}" fill="none" stroke="#D8D2C6" stroke-width="0.7" rx="1.5"/>`;
      for (const p of electroFor(r)) {
        const x = base.fx(r.pos.x + p.x), y = base.fy(r.pos.y + p.y);
        if (p.type === 'socket') s += `<g stroke="${CAD.elec}" stroke-width="1.1"><circle cx="${x}" cy="${y}" r="4.5" fill="#FFF"/><line x1="${x - 4.5}" y1="${y - 6.5}" x2="${x + 4.5}" y2="${y - 6.5}"/></g>`;
        else s += `<circle cx="${x}" cy="${y}" r="4" fill="${CAD.elec}"/>`;
      }
    }
    return s + flatRoomMarks(base.fx, base.fy, false);
  }, (x, y, w) => flatLegendBox(x, y, w, 'Условные обозначения', [
    { sym: (sx, sy) => `<g stroke="${CAD.elec}" stroke-width="1.1"><circle cx="${sx + 8}" cy="${sy - 3}" r="4.5" fill="#FFF"/><line x1="${sx + 3.5}" y1="${sy - 9.5}" x2="${sx + 12.5}" y2="${sy - 9.5}"/></g>`, text: `розетка (блок) — ${rooms.reduce((a, r) => a + electroFor(r).filter(p => p.type === 'socket').length, 0)} поз. всего` },
    { sym: (sx, sy) => `<circle cx="${sx + 8}" cy="${sy - 3}" r="4" fill="${CAD.elec}"/>`, text: `выключатель — ${rooms.reduce((a, r) => a + electroFor(r).filter(p => p.type === 'switch').length, 0)} поз. всего` },
    { sym: (sx, sy) => `<rect x="${sx}" y="${sy - 8}" width="16" height="11" fill="none" stroke="#D8D2C6" stroke-width="0.9"/>`, text: 'мебель (для привязки выводов)' },
  ]), ['Розетки — h=300 от чистого пола по умолчанию; отклонения (фартук 1100, ТВ 1300, тумбы 600) — на планах раздела 09.', 'Выключатели — h=900, со стороны ручки двери, ≥100 мм от проёма.', 'Санузел: линии через УЗО 30 мА, механизмы IP44.', 'Разводку выполнять по инженерному проекту; привязки уточнить по месту после монтажа перегородок.']);
}

// ---------- табличный ГОСТ-штамп для сводных листов (формат рабочих альбомов) ----------
function flatStamp(x, y, w, title, sheetNo) {
  const c1 = 84, c2 = w - 84 - 168, c3 = 56, c4 = 56, c5 = 56; // колонки
  let s = `<g stroke="#2E2A26" stroke-width="1" fill="none">
<rect x="${x}" y="${y}" width="${w}" height="56"/>
<line x1="${x + c1}" y1="${y}" x2="${x + c1}" y2="${y + 56}"/>
<line x1="${x + c1 + c2}" y1="${y}" x2="${x + c1 + c2}" y2="${y + 56}"/>
<line x1="${x + c1 + c2 + c3}" y1="${y}" x2="${x + c1 + c2 + c3}" y2="${y + 56}"/>
<line x1="${x + c1 + c2 + c3 + c4}" y1="${y}" x2="${x + c1 + c2 + c3 + c4}" y2="${y + 56}"/>
<line x1="${x}" y1="${y + 28}" x2="${x + w}" y2="${y + 28}"/></g>`;
  s += `<g font-size="8" fill="#7A756D">
<text x="${x + 6}" y="${y + 11}">Дата</text><text x="${x + 6}" y="${y + 39}">Студия</text>
<text x="${x + c1 + 8}" y="${y + 11}">${esc((brief.object && brief.object.address) || 'Объект')}</text>
<text x="${x + c1 + c2 + 6}" y="${y + 11}">Стадия</text><text x="${x + c1 + c2 + c3 + 6}" y="${y + 11}">Лист</text><text x="${x + c1 + c2 + c3 + c4 + 6}" y="${y + 11}">Листов</text></g>`;
  s += `<g font-size="10" fill="#2E2A26">
<text x="${x + 6}" y="${y + 23}">${DATE}</text>
<text x="${x + 6}" y="${y + 51}" font-weight="700" letter-spacing="1">LINEA</text>
<text x="${x + c1 + 8}" y="${y + 49}" font-size="11" font-weight="600">${esc(title)}</text>
<text x="${x + c1 + c2 + 20}" y="${y + 23}">РП</text>
<text x="${x + c1 + c2 + c3 + 20}" y="${y + 23}">${sheetNo}</text>
<text x="${x + c1 + c2 + c3 + c4 + 18}" y="${y + 23}">${TOTAL_SHEETS}</text>
<text x="${x + c1 + c2 + 8}" y="${y + 49}" font-size="9" fill="#7A756D">М 1:50</text></g>`;
  return s;
}

// сквозной список дверей квартиры (входная — первой)
function flatDoorList() {
  const list = [];
  const order = [...flatRooms].sort((a, b) => (a.type === 'hallway' ? 0 : 1) - (b.type === 'hallway' ? 0 : 1) || a.idx - b.idx);
  for (const r of order) for (const o of r.doors) {
    const entry = r.type === 'hallway';
    list.push({ r, o, mark: 'Д' + (list.length + 1), entry,
      type: entry ? 'Входная, сталь (сущ.)' : 'Скрытого монтажа, одностворчатая',
      leaf: entry ? '—' : `${o.w - 80}×2000` });
  }
  return list;
}

// 6. Демонтаж (общий): снятие отделки + дверные блоки
function drawFlatDemolition(sheetNo) {
  return flatSheet(sheetNo, 'План демонтажа', 'Подготовка под чистовую отделку · перегородки не демонтируются', base => {
    let s = '';
    for (const r of flatRooms) {
      const rx = base.fx(r.pos.x), ry = base.fy(r.pos.y), rw2 = px(r.w), rh2 = px(r.l);
      s += `<clipPath id="fdm${r.idx}"><rect x="${rx}" y="${ry}" width="${rw2}" height="${rh2}"/></clipPath><g clip-path="url(#fdm${r.idx})">`;
      for (let i = -Math.ceil(rh2 / 18); i < rw2 / 18 + Math.ceil(rh2 / 18); i++)
        s += `<line x1="${rx + i * 18}" y1="${ry}" x2="${rx + i * 18 + rh2}" y2="${ry + rh2}" stroke="#B0483A2E" stroke-width="1.2"/>`;
      s += `</g>`;
    }
    for (const d of flatDoorList()) {
      if (d.entry) continue;
      const { r, o } = d;
      let x0, y0, x1, y1;
      if (o.wall === 'A' || o.wall === 'C') { const yy = o.wall === 'A' ? base.fy(r.pos.y) - 12 : base.fy(r.pos.y + r.l); x0 = base.fx(r.pos.x + o.off); x1 = x0 + px(o.w); y0 = yy; y1 = yy + 12; }
      else { const xx = o.wall === 'D' ? base.fx(r.pos.x) - 12 : base.fx(r.pos.x + r.w); y0 = base.fy(r.pos.y + o.off); y1 = y0 + px(o.w); x0 = xx; x1 = xx + 12; }
      s += `<g stroke="#B0483A" stroke-width="1.8"><line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/><line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y0}"/></g>`;
    }
    return s + flatRoomMarks(base.fx, base.fy, false);
  }, (x, y, w) => flatLegendBox(x, y, w, 'Условные обозначения', [
    { sym: (sx, sy) => `<rect x="${sx}" y="${sy - 8}" width="16" height="11" fill="#FFF" stroke="#B0483A" stroke-width="0.8"/><line x1="${sx}" y1="${sy + 3}" x2="${sx + 16}" y2="${sy - 8}" stroke="#B0483A88" stroke-width="1"/>`, text: 'демонтаж отделки: полы до стяжки, обои/краска, плинтусы' },
    { sym: (sx, sy) => `<g stroke="#B0483A" stroke-width="1.6"><line x1="${sx}" y1="${sy - 9}" x2="${sx + 14}" y2="${sy + 2}"/><line x1="${sx}" y1="${sy + 2}" x2="${sx + 14}" y2="${sy - 9}"/></g>`, text: 'демонтаж дверного блока (полотно, коробка, наличники)' },
  ]), ['Несущие конструкции и перегородки не затрагиваются.', 'В санузле — демонтаж плитки, стяжки до плиты и старой гидроизоляции.', 'Перед штроблением уточнить трассы скрытых коммуникаций.']);
}

// 7. Монтаж ГКЛ (общий)
function drawFlatMontage(sheetNo) {
  return flatSheet(sheetNo, 'План монтажа ГКЛ-конструкций', 'Фальш-стены под ниши, закладные, короба потолков · каркас ПП 60×27, ГКЛ 12,5 в 2 слоя', base => {
    let s = '', marks = [];
    for (const r of flatRooms) {
      const nn2 = nichesFor(r).filter(n => n.depth >= 80), groups = [];
      for (const n of nn2) {
        const g0 = groups.find(g => g.wall === n.wall && Math.abs(g.off - n.off) < 200);
        if (g0) { g0.depth = Math.max(g0.depth, n.depth); g0.w = Math.max(g0.w, n.w); g0.labels.push(n.label); }
        else groups.push({ wall: n.wall, off: n.off, w: n.w, depth: n.depth, labels: [n.label] });
      }
      for (const g0 of groups) {
        const th = px(g0.depth + 65);
        let rx, ry, rw2, rh2;
        if (g0.wall === 'A') { rx = base.fx(r.pos.x + g0.off); ry = base.fy(r.pos.y); rw2 = px(g0.w); rh2 = th; }
        else if (g0.wall === 'C') { rx = base.fx(r.pos.x + g0.off); ry = base.fy(r.pos.y + r.l) - th; rw2 = px(g0.w); rh2 = th; }
        else if (g0.wall === 'B') { rx = base.fx(r.pos.x + r.w) - th; ry = base.fy(r.pos.y + g0.off); rw2 = th; rh2 = px(g0.w); }
        else { rx = base.fx(r.pos.x); ry = base.fy(r.pos.y + g0.off); rw2 = th; rh2 = px(g0.w); }
        marks.push({ n: marks.length + 1, text: `фальш-стена, вылет ${g0.depth + 65} мм · ${g0.labels.map(t => t.split(',')[0]).join(' + ')} (${r.name})` });
        s += `<rect x="${rx}" y="${ry}" width="${rw2}" height="${rh2}" fill="#3B5C7726" stroke="#3B5C77" stroke-width="1.3" stroke-dasharray="4 3"/>`;
        const mx = rx + rw2 / 2, my = ry + rh2 / 2;
        s += `<circle cx="${mx}" cy="${my}" r="8" fill="#FFFFFFE6" stroke="#3B5C77" stroke-width="0.9"/><text x="${mx}" y="${my + 3}" font-size="8" font-weight="700" fill="#3B5C77" text-anchor="middle">М${marks.length}</text>`;
      }
    }
    drawFlatMontage.marks = marks;
    return s + flatRoomMarks(base.fx, base.fy, false);
  }, (x, y, w) => {
    const rows = (drawFlatMontage.marks || []).map(m => ({ sym: (sx, sy) => `<circle cx="${sx + 8}" cy="${sy - 3}" r="7" fill="#FFF" stroke="#3B5C77" stroke-width="0.9"/><text x="${sx + 8}" y="${sy}" font-size="7.5" font-weight="700" fill="#3B5C77" text-anchor="middle">М${m.n}</text>`, text: m.text }));
    return flatLegendBox(x, y, w, 'Ведомость ГКЛ-конструкций', rows);
  }, ['Внутри всех конструкций — закладные из фанеры 18 мм под навесное оборудование.', 'Границы потолочных коробов — на плане потолков и листах раздела 05.', 'В санузле — влагостойкий ГКЛВ · звукоизоляция минватой 50 мм в полостях.']);
}

// 8. Экспликация помещений и план дверей
function drawFlatDoors(sheetNo) {
  return flatSheet(sheetNo, 'Экспликация помещений и план дверей', 'Марки дверей Дn · спецификация проёмов и полотен', base => {
    let s = flatRoomMarks(base.fx, base.fy, true);
    for (const d of flatDoorList()) {
      const { r, o } = d;
      let cx, cy;
      if (o.wall === 'A') { cx = base.fx(r.pos.x + o.off + o.w / 2); cy = base.fy(r.pos.y) - px(80); }
      else if (o.wall === 'C') { cx = base.fx(r.pos.x + o.off + o.w / 2); cy = base.fy(r.pos.y + r.l) + px(80); }
      else if (o.wall === 'D') { cx = base.fx(r.pos.x) - px(80); cy = base.fy(r.pos.y + o.off + o.w / 2); }
      else { cx = base.fx(r.pos.x + r.w) + px(80); cy = base.fy(r.pos.y + o.off + o.w / 2); }
      s += `<circle cx="${cx}" cy="${cy}" r="10" fill="#FFF" stroke="#B0483A" stroke-width="1.2"/><text x="${cx}" y="${cy + 3.5}" font-size="8.5" font-weight="700" fill="#B0483A" text-anchor="middle">${d.mark}</text>`;
    }
    return s;
  }, (x, y, w) => {
    const dl = flatDoorList();
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${dl.length * 30 + 44}" fill="none" stroke="#8A8478" stroke-width="0.8"/>`;
    s += `<text x="${x + 10}" y="${y + 18}" font-size="10.5" font-weight="700" fill="#2E2A26">Спецификация дверей</text>`;
    s += `<line x1="${x}" y1="${y + 26}" x2="${x + w}" y2="${y + 26}" stroke="#8A8478" stroke-width="0.6"/>`;
    dl.forEach((d, i) => {
      const sy = y + 44 + i * 30;
      s += `<circle cx="${x + 18}" cy="${sy - 4}" r="9" fill="none" stroke="#B0483A" stroke-width="1"/><text x="${x + 18}" y="${sy - 1}" font-size="8" font-weight="700" text-anchor="middle" fill="#B0483A">${d.mark}</text>`;
      s += `<text x="${x + 36}" y="${sy - 6}" font-size="8.6" fill="#2E2A26">проём ${d.o.w}×${d.o.h} · полотно ${d.leaf}</text>`;
      s += `<text x="${x + 36}" y="${sy + 6}" font-size="8.2" fill="#7A756D">${esc(d.type)} · ${esc(d.r.name)}</text>`;
    });
    return s;
  }, ['Полотна скрытого монтажа, эмаль в цвет стен, магнитные замки AGB (см. спецификацию, раздел 07).', 'Размеры проёмов уточнить по месту после монтажа конструкций и стяжки.', 'Входная дверь — существующая, замена не предусмотрена.'], { roomFill: CAD.roomFill });
}

// 9. План освещения (общий)
function drawFlatLighting(sheetNo) {
  let tot = { spots: 0, pendants: 0, tracks: 0 };
  return flatSheet(sheetNo, 'План освещения', 'Точечный свет, подвесы, треки и скрытая LED 3000K по всем помещениям', base => {
    let s = '';
    for (const r of flatRooms) {
      const L = lightsFor(r), lv = ceilingLevelsFor(r);
      const off = px(lv.box);
      const rx = base.fx(r.pos.x), ry = base.fy(r.pos.y), rw2 = px(r.w), rh2 = px(r.l);
      s += `<rect x="${rx + off + 2}" y="${ry + off + 2}" width="${rw2 - 2 * off - 4}" height="${rh2 - 2 * off - 4}" fill="none" stroke="#C29A5B" stroke-width="1" stroke-dasharray="5 3"/>`;
      for (const sp of L.spots) { tot.spots++; s += `<g stroke="#57514A" stroke-width="0.8"><circle cx="${base.fx(r.pos.x + sp.x)}" cy="${base.fy(r.pos.y + sp.y)}" r="4" fill="#FFF"/><line x1="${base.fx(r.pos.x + sp.x) - 5.5}" y1="${base.fy(r.pos.y + sp.y)}" x2="${base.fx(r.pos.x + sp.x) + 5.5}" y2="${base.fy(r.pos.y + sp.y)}"/><line x1="${base.fx(r.pos.x + sp.x)}" y1="${base.fy(r.pos.y + sp.y) - 5.5}" x2="${base.fx(r.pos.x + sp.x)}" y2="${base.fy(r.pos.y + sp.y) + 5.5}"/></g>`; }
      if (L.pendant) { tot.pendants++; s += `<circle cx="${rx + rw2 / 2}" cy="${ry + rh2 / 2}" r="8" fill="#F5E14C66" stroke="#2E2A26" stroke-width="1.2"/><circle cx="${rx + rw2 / 2}" cy="${ry + rh2 / 2}" r="2.2" fill="#2E2A26"/>`; }
      if (L.track) { tot.tracks++; s += `<line x1="${base.fx(r.pos.x + 400)}" y1="${base.fy(r.pos.y + 850)}" x2="${base.fx(r.pos.x + r.w - 400)}" y2="${base.fy(r.pos.y + 850)}" stroke="#2E2A26" stroke-width="2.4"/>`; }
    }
    return s + flatRoomMarks(base.fx, base.fy, false);
  }, (x, y, w) => flatLegendBox(x, y, w, 'Условные обозначения', [
    { sym: (sx, sy) => `<g stroke="#57514A" stroke-width="0.9"><circle cx="${sx + 8}" cy="${sy - 3}" r="4.5" fill="#FFF"/><line x1="${sx + 2}" y1="${sy - 3}" x2="${sx + 14}" y2="${sy - 3}"/><line x1="${sx + 8}" y1="${sy - 9}" x2="${sx + 8}" y2="${sy + 3}"/></g>`, text: `точечный светильник — ${rooms.reduce((a, r) => a + lightsFor(r).spots.length, 0)} шт.` },
    { sym: (sx, sy) => `<circle cx="${sx + 8}" cy="${sy - 3}" r="6" fill="#F5E14C66" stroke="#2E2A26" stroke-width="1"/>`, text: `подвесной светильник — ${rooms.filter(r => lightsFor(r).pendant).length} шт.` },
    { sym: (sx, sy) => `<line x1="${sx}" y1="${sy - 3}" x2="${sx + 16}" y2="${sy - 3}" stroke="#2E2A26" stroke-width="2.4"/>`, text: `трек-система — ${rooms.filter(r => lightsFor(r).track).length} шт.` },
    { sym: (sx, sy) => `<line x1="${sx}" y1="${sy - 3}" x2="${sx + 16}" y2="${sy - 3}" stroke="#C29A5B" stroke-width="1.2" stroke-dasharray="5 3"/>`, text: `LED 3000K скрытая — ${rooms.reduce((a, r) => a + ceilingLevelsFor(r).ledLen, 0).toFixed(1)} м.п.` },
  ]), ['Точная расстановка и привязки — на планах потолков помещений (раздел 05).', 'Все группы света — на диммерах в жилых помещениях.', 'Цветовая температура: LED 3000K, светильники 2700–3000K, CRI ≥ 90.']);
}

// 10. План выключателей (общий)
function drawFlatSwitches(sheetNo) {
  return flatSheet(sheetNo, 'План выключателей', 'Расположение выключателей · h=900 от чистого пола, со стороны ручки двери', base => {
    let s = '';
    for (const r of flatRooms) for (const p of electroFor(r).filter(p => p.type === 'switch')) {
      const x = base.fx(r.pos.x + p.x), y = base.fy(r.pos.y + p.y);
      s += `<g stroke="#2E2A26" stroke-width="1.2"><circle cx="${x}" cy="${y}" r="4.5" fill="#2E2A26"/><line x1="${x}" y1="${y - 4.5}" x2="${x + 6}" y2="${y - 10.5}"/><line x1="${x + 6}" y1="${y - 10.5}" x2="${x + 10.5}" y2="${y - 8}"/></g>`;
    }
    return s + flatRoomMarks(base.fx, base.fy, false);
  }, (x, y, w) => flatLegendBox(x, y, w, 'Условные обозначения', [
    { sym: (sx, sy) => `<circle cx="${sx + 8}" cy="${sy - 3}" r="4.5" fill="#2E2A26"/>`, text: `выключатель — ${rooms.reduce((a, r) => a + electroFor(r).filter(p => p.type === 'switch').length, 0)} поз.` },
  ]), ['Все выключатели — h=900 от чистого пола, ≥100 мм от края проёма, со стороны ручки двери.', 'В спальне — проходные выключатели у изголовья кровати.', 'Группы включения — на листе «Схема включения освещения».']);
}

// 11. Схема включения освещения (группы)
function drawFlatSwitchScheme(sheetNo) {
  return flatSheet(sheetNo, 'Схема включения освещения', 'Группы: какой выключатель включает какие светильники', base => {
    let s = '';
    for (const r of flatRooms) {
      const sws = electroFor(r).filter(p => p.type === 'switch');
      if (!sws.length) continue;
      const sw = sws[0];
      const sx = base.fx(r.pos.x + sw.x), sy = base.fy(r.pos.y + sw.y);
      const L = lightsFor(r), lv = ceilingLevelsFor(r);
      // группа 1 (красная): точечный свет — цепочкой через все споты
      const pts = L.spots.map(sp => [base.fx(r.pos.x + sp.x), base.fy(r.pos.y + sp.y)]).sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
      if (pts.length) s += `<polyline points="${[[sx, sy], ...pts].map(p => p.join(',')).join(' ')}" fill="none" stroke="#C0392B" stroke-width="0.9" opacity="0.85"/>`;
      // группа 2 (синяя): LED-контур короба
      const off = px(lv.box);
      s += `<polyline points="${sx},${sy} ${base.fx(r.pos.x) + off + 4},${base.fy(r.pos.y) + off + 4}" fill="none" stroke="#2980B9" stroke-width="0.9" stroke-dasharray="4 3" opacity="0.9"/>`;
      if (L.pendant) s += `<polyline points="${sx},${sy} ${base.fx(r.pos.x) + px(r.w) / 2},${base.fy(r.pos.y) + px(r.l) / 2}" fill="none" stroke="#27835B" stroke-width="0.9" stroke-dasharray="2 3"/>`;
      for (const p of [[sx, sy]]) s += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#2E2A26"/>`;
      for (const sp of L.spots) s += `<circle cx="${base.fx(r.pos.x + sp.x)}" cy="${base.fy(r.pos.y + sp.y)}" r="2.8" fill="${CAD.spot}" stroke="${CAD.spotStroke}" stroke-width="0.8"/>`;
      if (L.pendant) s += `<circle cx="${base.fx(r.pos.x) + px(r.w) / 2}" cy="${base.fy(r.pos.y) + px(r.l) / 2}" r="8" fill="${CAD.chand}" stroke="${CAD.chandSpoke}" stroke-width="1"/>`;
    }
    return s + flatRoomMarks(base.fx, base.fy, false);
  }, (x, y, w) => flatLegendBox(x, y, w, 'Группы включения', [
    { sym: (sx, sy) => `<line x1="${sx}" y1="${sy - 3}" x2="${sx + 16}" y2="${sy - 3}" stroke="#C0392B" stroke-width="1.2"/>`, text: 'группа 1 — точечный свет (диммер)' },
    { sym: (sx, sy) => `<line x1="${sx}" y1="${sy - 3}" x2="${sx + 16}" y2="${sy - 3}" stroke="#2980B9" stroke-width="1.2" stroke-dasharray="4 3"/>`, text: 'группа 2 — скрытая LED-подсветка' },
    { sym: (sx, sy) => `<line x1="${sx}" y1="${sy - 3}" x2="${sx + 16}" y2="${sy - 3}" stroke="#27835B" stroke-width="1.2" stroke-dasharray="2 3"/>`, text: 'группа 3 — подвес / трек' },
  ]), ['Схема принципиальная: показывает состав групп, а не трассы кабеля.', 'В спальне вторая точка группы 1 — проходной выключатель у изголовья.', 'Подсветка зеркала и фартука — со своими локальными выключателями.', 'Рекомендуется мастер-выключатель всего света у входной двери.']);
}

// 12. План отделки стен (общий)
function drawFlatWallFinish(sheetNo) {
  return flatSheet(sheetNo, 'План отделки стен', 'Коды отделки по помещениям · площади за вычетом проёмов', base => {
    let s = '';
    for (const r of flatRooms) {
      const wet = r.type === 'bathroom';
      const rx = base.fx(r.pos.x), ry = base.fy(r.pos.y), rw2 = px(r.w), rh2 = px(r.l);
      s += `<rect x="${rx + 3}" y="${ry + 3}" width="${rw2 - 6}" height="${rh2 - 6}" fill="none" stroke="${wet ? '#7FA3B5' : '#C9A227'}" stroke-width="2.2" opacity="0.85"/>`;
      // акцентная стена деревом: спальня — изголовье, гостиная — стена ТВ-ниши
      const tvN = nichesFor(r).find(n => /ТВ|изголов/i.test(n.label));
      if (tvN && !wet) {
        let x1, y1, x2, y2;
        if (tvN.wall === 'A') { x1 = rx + 3; y1 = ry + 3; x2 = rx + rw2 - 3; y2 = ry + 3; }
        else if (tvN.wall === 'C') { x1 = rx + 3; y1 = ry + rh2 - 3; x2 = rx + rw2 - 3; y2 = ry + rh2 - 3; }
        else if (tvN.wall === 'B') { x1 = rx + rw2 - 3; y1 = ry + 3; x2 = rx + rw2 - 3; y2 = ry + rh2 - 3; }
        else { x1 = rx + 3; y1 = ry + 3; x2 = rx + 3; y2 = ry + rh2 - 3; }
        s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8A5A2B" stroke-width="4"/>`;
      }
      const cx = rx + rw2 / 2, cy = ry + rh2 / 2;
      s += `<rect x="${cx - 26}" y="${cy - 10}" width="52" height="15" fill="#FFFFFFE0" stroke="#57514A" stroke-width="0.7"/><text x="${cx}" y="${cy + 1}" font-size="9.5" font-weight="700" text-anchor="middle" fill="#2E2A26">${wet ? 'От-2' : 'От-1'}</text>`;
    }
    return s;
  }, (x, y, w) => {
    const dry = flatRooms.filter(r => r.type !== 'bathroom').reduce((a, r) => a + roomGeometry(r).walls, 0);
    const wetW = flatRooms.filter(r => r.type === 'bathroom').reduce((a, r) => a + roomGeometry(r).walls, 0);
    return flatLegendBox(x, y, w, 'Ведомость отделки стен', [
      { sym: (sx, sy) => `<rect x="${sx}" y="${sy - 8}" width="16" height="11" fill="none" stroke="#C9A227" stroke-width="2"/>`, text: `От-1 · ${style.wall.finish.split(',')[0]} · ≈${(dry * 0.85).toFixed(0)} м²` },
      { sym: (sx, sy) => `<rect x="${sx}" y="${sy - 8}" width="16" height="11" fill="none" stroke="#7FA3B5" stroke-width="2"/>`, text: `От-2 · керамогранит под камень · ≈${(wetW * 1.1).toFixed(0)} м² (+10%)` },
      { sym: (sx, sy) => `<line x1="${sx}" y1="${sy - 3}" x2="${sx + 16}" y2="${sy - 3}" stroke="#8A5A2B" stroke-width="4"/>`, text: `От-3 · ${style.accent.finish.split(',')[0]} (акцентные стены) · ≈${(dry * 0.15).toFixed(0)} м²` },
    ]);
  }, ['Площади рассчитаны за вычетом проёмов; уточняются по развёрткам (раздел 04).', 'Отделка каждой стены с материалом и артикулом — на развёртках и в спецификации (раздел 07).', 'Стыки разных отделок — во внутренних углах, без нащельников.']);
}

// 13. План тёплых полов
function drawFlatHeatFloor(sheetNo) {
  const zones = [];
  for (const r of flatRooms) {
    if (r.type === 'bathroom') zones.push({ r, x: 100, y: 100, w: r.w - 200, l: r.l - 200, name: 'санузел' });
    if (r.type === 'living-kitchen') zones.push({ r, x: 300, y: 150, w: r.w - 600, l: 1100, name: 'кухонная зона' });
    if (r.type === 'hallway') zones.push({ r, x: 200, y: 200, w: r.w - 400, l: r.l - 600, name: 'прихожая' });
  }
  return flatSheet(sheetNo, 'План тёплых полов', 'Электрический мат под плитку/кварцвинил · зоны, терморегуляторы', base => {
    let s = '';
    for (const z of zones) {
      const zx = base.fx(z.r.pos.x + z.x), zy = base.fy(z.r.pos.y + z.y), zw = px(z.w), zl = px(z.l);
      s += `<rect x="${zx}" y="${zy}" width="${zw}" height="${zl}" fill="#D9634D1F" stroke="#D9634D" stroke-width="1.2"/>`;
      const step = 7;
      for (let yy = zy + 5; yy < zy + zl - 3; yy += step) s += `<line x1="${zx + 4}" y1="${yy}" x2="${zx + zw - 4}" y2="${yy}" stroke="#D9634D66" stroke-width="1"/>`;
      s += `<rect x="${zx + zw / 2 - 34}" y="${zy + 6}" width="68" height="13" fill="#FFFFFFE6"/><text x="${zx + zw / 2}" y="${zy + 16}" font-size="8.5" font-weight="600" text-anchor="middle" fill="#B0483A">ТП · ${(z.w * z.l / 1e6).toFixed(1)} м²</text>`;
      const d0 = z.r.doors[0];
      if (d0) {
        let tx2, ty2;
        if (d0.wall === 'C') { tx2 = base.fx(z.r.pos.x + d0.off + d0.w + 150); ty2 = base.fy(z.r.pos.y + z.r.l) - 6; }
        else if (d0.wall === 'D') { tx2 = base.fx(z.r.pos.x) + 6; ty2 = base.fy(z.r.pos.y + d0.off + d0.w + 150); }
        else if (d0.wall === 'B') { tx2 = base.fx(z.r.pos.x + z.r.w) - 12; ty2 = base.fy(z.r.pos.y + d0.off + d0.w + 150); }
        else { tx2 = base.fx(z.r.pos.x + d0.off + d0.w + 150); ty2 = base.fy(z.r.pos.y) + 6; }
        s += `<rect x="${tx2 - 5}" y="${ty2 - 5}" width="10" height="10" fill="#FFF" stroke="#B0483A" stroke-width="1.2"/><text x="${tx2}" y="${ty2 + 2.5}" font-size="6.5" font-weight="700" text-anchor="middle" fill="#B0483A">t°</text>`;
      }
    }
    return s + flatRoomMarks(base.fx, base.fy, false);
  }, (x, y, w) => flatLegendBox(x, y, w, 'Условные обозначения', [
    { sym: (sx, sy) => `<rect x="${sx}" y="${sy - 9}" width="16" height="12" fill="#D9634D1F" stroke="#D9634D" stroke-width="1"/><line x1="${sx + 2}" y1="${sy - 5}" x2="${sx + 14}" y2="${sy - 5}" stroke="#D9634D88" stroke-width="1"/><line x1="${sx + 2}" y1="${sy - 1}" x2="${sx + 14}" y2="${sy - 1}" stroke="#D9634D88" stroke-width="1"/>`, text: `зона тёплого пола — всего ${zones.reduce((a, z) => a + z.w * z.l / 1e6, 0).toFixed(1)} м²` },
    { sym: (sx, sy) => `<rect x="${sx + 3}" y="${sy - 10}" width="11" height="11" fill="#FFF" stroke="#B0483A" stroke-width="1.1"/><text x="${sx + 8.5}" y="${sy - 2}" font-size="7" font-weight="700" text-anchor="middle" fill="#B0483A">t°</text>`, text: 'терморегулятор, h=900, у входа в помещение' },
  ]), ['Отступ мата от стен и стационарной мебели — 100 мм; под мебелью без зазора не укладывать.', 'Датчик температуры — в гофре 16 мм, вывод в центр зоны.', 'Питание зон тёплого пола — отдельными линиями через УЗО 30 мА.']);
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
<h2>Состав комплекта · ${counts.flat + counts.obmer + counts.demo + counts.mont + counts.plans + counts.poly + counts.elev + counts.ceil + counts.electro + 1} листов + документы</h2>
<table><tbody>
<tr><td class="k">00 Паспорт</td><td>паспорт, пояснительная записка, <a href="vedomost.html">ведомость чертежей</a></td></tr>
${counts.flat ? `<tr><td class="k">01 Сводные планы квартиры</td><td>канон рабочего альбома, весь план квартиры на листе: обмер, демонтаж, монтаж, мебель, экспликация дверей, розетки, потолки, освещение, выключатели, схема включения, полы, отделка стен, тёплые полы — ${counts.flat} лист.</td></tr>` : ''}
<tr><td class="k">01 Обмер и подготовка</td><td>обмерные планы с цепочками привязок (${counts.obmer}), демонтаж отделки и дверных блоков (${counts.demo}), монтаж ГКЛ-конструкций под ниши (${counts.mont}) — ${counts.obmer + counts.demo + counts.mont} лист.</td></tr>
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
  const titles = {}; reg.forEach(r0 => { titles[r0.file] = { t: r0.title, n: r0.no }; });
  const grp = k => files.filter(f => f.startsWith(k) && f.endsWith('.svg'));
  const rnd = files.filter(f => f.startsWith('06-koncept/renders/') && !f.includes('/thumbs/'));
  const cap = f => { const t = titles[f]; return t ? `${t.t} <i>Лист ${t.n}</i>` : f.split('/').pop(); };
  const alt = f => { const t = titles[f]; const obj = (brief.object && brief.object.address) || 'объект'; return t ? `${t.t} — ${obj}, ${totalArea} м²` : ''; };
  const sec = (id, title, sub, list) => list.length ? `<section id="${id}"><h2>${title}</h2><p class="sub">${sub}</p><div class="grid">${list.map(f =>
    `<figure><button class="sh" data-src="${f}" data-cap="${esc(alt(f))}"><img src="${f}" loading="lazy" alt="${esc(alt(f))}"></button><figcaption>${cap(f)}</figcaption></figure>`).join('')}</div></section>` : '';
  const secR = rnd.length ? `<section id="rendery"><h2>Визуализации</h2><p class="sub">Фотореалистичные виды помещений — та же мебель, свет и материалы, что на чертежах</p><div class="grid wide">${rnd.map(f => {
    const nm = f.split('/').pop().replace(/\.\w+$/, '').replace(/^\d+\w?-/, '').replace(/-/g, ' ');
    return `<figure><button class="sh" data-src="${f}" data-cap="${esc(nm)}"><img src="${f}" loading="lazy" alt="Визуализация: ${esc(nm)} — стиль «${esc(style.title)}»"></button><figcaption>${esc(nm)}</figcaption></figure>`;
  }).join('')}</div></section>` : '';
  const totalSheets = files.filter(f => f.endsWith('.svg')).length;
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Папка дизайн-проекта · ${totalSheets} листов — LINEA</title>
<meta name="description" content="Демо-проект LINEA: ${totalSheets} листов рабочих чертежей и ${rnd.length} визуализаций — обмер, планы, полы, развертки, потолки, электрика, спецификация и смета.">
<link rel="canonical" href="https://alex1986-rgb.github.io/linea-design-studio/portfolio/demo/index.html">
<meta property="og:type" content="article"><meta property="og:title" content="Папка дизайн-проекта LINEA — ${totalSheets} листов">
<meta property="og:description" content="Реальный результат конвейера: рабочие чертежи, визуализации, спецификация и смета.">
<meta property="og:image" content="https://alex1986-rgb.github.io/linea-design-studio/portfolio/demo/06-koncept/renders/01-gostinaya-kuhnya.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"LINEA","item":"https://alex1986-rgb.github.io/linea-design-studio/"},{"@type":"ListItem","position":2,"name":"Демо-проект","item":"https://alex1986-rgb.github.io/linea-design-studio/portfolio/demo/index.html"}]}</script>
<style>
:root{--bg:#0F0E0C;--ink:#EDE7DC;--mut:#9A937F;--gold:#C29A5B;--line:#2b271f;--card:#1c1913}
*{box-sizing:border-box}
body{font-family:Inter,${FONT};margin:0;background:var(--bg);color:var(--ink)}
a{color:inherit}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 5vw;border-bottom:1px solid var(--line)}
.logo{font-family:'Playfair Display',Georgia,serif;font-size:22px;letter-spacing:6px;text-decoration:none}
.logo i{color:var(--gold);font-style:normal}
.btn{display:inline-block;background:var(--gold);color:#171410;text-decoration:none;font-weight:600;font-size:13px;padding:11px 20px;border-radius:4px}
.btn.ghost{background:transparent;color:var(--gold);border:1px solid var(--gold)}
header{padding:40px 5vw 22px}
header h1{font-family:'Playfair Display',Georgia,serif;font-weight:500;font-size:clamp(24px,4vw,34px);margin:0 0 10px}
header p{color:var(--mut);margin:0;font-size:14px;line-height:1.6}
nav{display:flex;flex-wrap:wrap;gap:8px;padding:14px 5vw;border-top:1px solid var(--line);border-bottom:1px solid var(--line);position:sticky;top:0;background:#0F0E0Cf2;backdrop-filter:blur(8px);z-index:5}
nav a{color:var(--gold);text-decoration:none;font-size:12px;letter-spacing:.5px;border:1px solid #3a3428;border-radius:20px;padding:6px 13px;white-space:nowrap}
nav a:hover{background:var(--card)}
section{padding:34px 5vw}
h2{font-family:'Playfair Display',Georgia,serif;font-weight:500;font-size:clamp(19px,2.4vw,23px);margin:0;border-left:3px solid var(--gold);padding-left:14px}
.sub{color:var(--mut);font-size:13px;margin:10px 0 0;padding-left:17px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px;margin-top:20px}
.grid.wide{grid-template-columns:repeat(auto-fill,minmax(420px,1fr))}
figure{margin:0;background:#FFF;border-radius:6px;overflow:hidden;border:1px solid #2b271f}
.sh{display:block;width:100%;padding:0;border:0;background:#FFF;cursor:zoom-in}
.sh img{width:100%;height:auto;display:block}
figcaption{font-size:11.5px;color:#3A352E;padding:9px 12px;background:#F1EDE4;display:flex;justify-content:space-between;gap:10px}
figcaption i{color:#8A8478;font-style:normal;white-space:nowrap}
.docs{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-top:20px}
.docs a{display:block;background:var(--card);border:1px solid #3a3428;border-radius:8px;padding:16px 18px;color:var(--ink);text-decoration:none;font-size:12.5px;line-height:1.5}
.docs a b{display:block;color:var(--gold);margin-bottom:4px;font-size:13px}
.docs a:hover{border-color:var(--gold)}
.cta{margin:10px 5vw 0;padding:34px 5vw;background:var(--card);border:1px solid #3a3428;border-radius:10px;text-align:center}
.cta h3{font-family:'Playfair Display',Georgia,serif;font-weight:500;font-size:22px;margin:0 0 10px}
.cta p{color:var(--mut);font-size:14px;margin:0 0 18px}
footer{padding:40px 5vw;color:#6d675c;font-size:12px;letter-spacing:2px;border-top:1px solid var(--line);margin-top:30px}
#lb{position:fixed;inset:0;background:#0B0A08f5;display:none;z-index:20;padding:60px 16px 70px;overflow:auto}
#lb.on{display:block}
#lb img{width:min(100%,1500px);height:auto;margin:0 auto;display:block;background:#FFF;border-radius:4px}
#lb .x,#lb .p,#lb .n{position:absolute;background:#1c1913;border:1px solid #3a3428;color:var(--ink);border-radius:6px;cursor:pointer;font-size:20px;line-height:1;padding:10px 14px}
#lb .x{top:14px;right:16px;position:fixed}#lb .p{left:16px;top:50%;position:fixed}#lb .n{right:16px;top:50%;position:fixed}
#lb .cap{position:fixed;left:0;right:0;bottom:18px;text-align:center;color:var(--mut);font-size:13px;padding:0 16px}
@media(max-width:640px){.grid,.grid.wide{grid-template-columns:1fr}nav{gap:6px;padding:10px 4vw}nav a{font-size:11px;padding:5px 10px}section{padding:26px 4vw}}
</style></head><body>
<div class="top"><a class="logo" href="../../index.html">LINE<i>A</i></a><a class="btn" href="../../brief.html">Хочу такую папку →</a></div>
<header><h1>Папка дизайн-проекта</h1><p>${esc((brief.object && brief.object.address) || 'Объект')} · ${totalArea} м² · стиль «${style.title}» · тариф «${tier.title}» · выпуск ${DATE}<br>${totalSheets} листов рабочих чертежей${rnd.length ? ` · ${rnd.length} визуализаций` : ''} · спецификация с артикулами · смета</p></header>
<nav>${rnd.length ? '<a href="#rendery">Визуализации</a>' : ''}<a href="#docs">Документы</a>${grp('01-kvartira').length ? '<a href="#kvartira">01 Квартира</a>' : ''}<a href="#obmer">01 Обмер</a><a href="#plany">02 Планы</a><a href="#poly">03 Полы</a><a href="#razv">04 Развертки</a><a href="#pot">05 Потолки</a><a href="#elektro">09 Электрика</a></nav>
${secR}
<section id="docs"><h2>Документы</h2><p class="sub">Открываются в браузере, смета доступна и в CSV для Excel</p><div class="docs">
<a href="00-pasport/pasport.html"><b>00 · Паспорт проекта</b>пояснительная записка, состав, палитра</a>
<a href="00-pasport/vedomost.html"><b>00 · Ведомость чертежей</b>все листы АИ-N с масштабами</a>
<a href="06-koncept/koncept.html"><b>06 · Концепция</b>образ и визуализации помещений</a>
<a href="07-materialy/specification.html"><b>07 · Материалы</b>спецификация с артикулами</a>
<a href="08-smeta/smeta.html"><b>08 · Смета</b>работы, материалы, мебель, свет</a>
<a href="08-smeta/smeta.csv"><b>08 · Смета CSV</b>для Excel / Google Sheets</a>
</div></section>
${sec('kvartira', '01 · Сводные планы квартиры', 'Весь план на листе: обмер, демонтаж, монтаж, мебель, экспликация дверей, розетки, потолки, освещение, выключатели, полы, отделка, тёплые полы', grp('01-kvartira'))}
${sec('obmer', '01 · Обмер, демонтаж, монтаж ГКЛ', 'Цепочки привязок, высоты проёмов, зоны демонтажа отделки, фальш-стены под ниши', grp('01-obmer'))}
${sec('plany', '02 · Планы помещений', 'Парные листы: рабочий с размерными цепочками и презентационный, с фото реализации', grp('02-plany'))}
${sec('poly', '03 · Полы', 'Раскладка покрытий, направление укладки, стыки на оси полотна, отметки уровней', grp('03-poly'))}
${sec('razv', '04 · Развертки стен', 'Каждая стена: ниши с LED, раскладка плитки, цепочки размеров, отделка и фото', grp('04-razvertki'))}
${sec('pot', '05 · Потолки', 'Уровни, скрытая LED-подсветка, ниши штор, узел короба М 1:20', grp('05-potolki'))}
${sec('elektro', '09 · Электрика', 'Розетки и выключатели с привязками L/H, слаботочные и влагозащищённые позиции', grp('09-elektrika'))}
<div class="cta"><h3>Такая же папка по вашей квартире — за 48 часов</h3><p>Заполните бриф: размеры, фото, пожелания по стилю. Остальное сделает конвейер студии под контролем дизайнера.</p><a class="btn" href="../../brief.html">Заполнить бриф — 7 минут</a> <a class="btn ghost" href="../../index.html">О студии</a></div>
<footer>LINEA · СТУДИЯ ДИЗАЙНА ИНТЕРЬЕРА — комплект сформирован автоматически конвейером студии</footer>
<div id="lb"><button class="x" aria-label="Закрыть">✕</button><button class="p" aria-label="Предыдущий">‹</button><button class="n" aria-label="Следующий">›</button><img alt=""><div class="cap"></div></div>
<script>
(function(){var sh=[].slice.call(document.querySelectorAll('.sh')),lb=document.getElementById('lb'),im=lb.querySelector('img'),cp=lb.querySelector('.cap'),i=0;
function open(k){i=(k+sh.length)%sh.length;var b=sh[i];im.src=b.dataset.src;im.alt=b.dataset.cap;cp.textContent=b.dataset.cap+' — '+(i+1)+' из '+sh.length;lb.classList.add('on');}
sh.forEach(function(b,k){b.addEventListener('click',function(){open(k);});});
lb.querySelector('.x').onclick=function(){lb.classList.remove('on');};
lb.querySelector('.p').onclick=function(e){e.stopPropagation();open(i-1);};
lb.querySelector('.n').onclick=function(e){e.stopPropagation();open(i+1);};
lb.addEventListener('click',function(e){if(e.target===lb||e.target===im)lb.classList.remove('on');});
document.addEventListener('keydown',function(e){if(!lb.classList.contains('on'))return;if(e.key==='Escape')lb.classList.remove('on');if(e.key==='ArrowLeft')open(i-1);if(e.key==='ArrowRight')open(i+1);});
})();
</script>
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
TOTAL_SHEETS = rooms.length * 12 + 1 + (FLAT ? 13 : 0); // сводные (канон 13) + обмер+демо+монтаж+2 плана+пол+4 развертки+потолок+электрика на комнату + узел
const reg = []; // реестр листов для ведомости
const counts = { flat: 0, obmer: 0, demo: 0, mont: 0, plans: 0, poly: 0, elev: 0, ceil: 0, electro: 0 };
function sheetOut(rel, maker, title, scale) {
  const no = sheet++;
  writeOut(rel, maker(no));
  reg.push({ no, title, scale: scale || '1:50', file: rel });
}
const SL = r => `${nn(r.idx)}-${slug(r.name)}`;
// порядок листов — как в альбомах профессиональных студий
if (FLAT) { // канон альбома: 13 поквартирных листов
  const flatSheets = [
    ['01-obmer', drawFlatObmer, 'Обмерный план квартиры'],
    ['02-demontazh', drawFlatDemolition, 'План демонтажа'],
    ['03-montazh', drawFlatMontage, 'План монтажа ГКЛ-конструкций'],
    ['04-mebel', drawFlatFurniture, 'План расстановки мебели'],
    ['05-eksplikatsiya-dverey', drawFlatDoors, 'Экспликация помещений и план дверей'],
    ['06-rozetki', drawFlatElectro, 'План розеток и выводов'],
    ['07-potolki', drawFlatCeiling, 'План потолков'],
    ['08-osveshchenie', drawFlatLighting, 'План освещения'],
    ['09-vyklyuchateli', drawFlatSwitches, 'План выключателей'],
    ['10-skhema-vklyucheniya', drawFlatSwitchScheme, 'Схема включения освещения'],
    ['11-poly', drawFlatFloors, 'План напольных покрытий'],
    ['12-otdelka-sten', drawFlatWallFinish, 'План отделки стен'],
    ['13-teplye-poly', drawFlatHeatFloor, 'План тёплых полов'],
  ];
  for (const [key, fn, title] of flatSheets) { sheetOut(`01-kvartira/kvartira-${key}.svg`, n => fn(n), title, '1:50'); counts.flat++; }
}
for (const r of rooms) { sheetOut(`01-obmer/obmer-${SL(r)}.svg`, n => drawObmer(r, n), `Обмерный план. ${r.name}`); counts.obmer++; }
for (const r of rooms) { sheetOut(`01-obmer/demo-${SL(r)}.svg`, n => drawDemolition(r, n), `Демонтаж. ${r.name}`); counts.demo++; }
for (const r of rooms) { sheetOut(`01-obmer/mont-${SL(r)}.svg`, n => drawMontage(r, n), `Монтаж перегородок. ${r.name}`); counts.mont++; }
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
