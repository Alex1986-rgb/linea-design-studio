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
function stamp(x, y, w, drawingName, sheet) {
  return `<g><rect x="${x}" y="${y}" width="${w}" height="44" fill="none" stroke="#2E2A26" stroke-width="1"/>
<text x="${x + 10}" y="${y + 17}" font-size="11" font-weight="700" fill="#2E2A26" letter-spacing="2">LINEA · СТУДИЯ ДИЗАЙНА ИНТЕРЬЕРА</text>
<text x="${x + 10}" y="${y + 33}" font-size="10" fill="#7A756D">${esc((brief.object && brief.object.address) || 'Объект')} · ${totalArea} м² · стиль «${style.title}»</text>
<text x="${x + w - 10}" y="${y + 17}" font-size="10" fill="#2E2A26" text-anchor="end">${esc(drawingName)}</text>
<text x="${x + w - 10}" y="${y + 33}" font-size="10" fill="#7A756D" text-anchor="end">Лист ${sheet} · М 1:50 · ${DATE}</text></g>`;
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
      const bw = 1600, bl = 2000, bx = (W - bw) / 2;
      add('bed', 'Кровать 1600×2000', bx, 100, bw, bl);
      if (bx >= 560) add('nightstand', 'Тумба', bx - 520, 100, 450, 450);
      if (W - bx - bw >= 560) add('nightstand', 'Тумба', bx + bw + 70, 100, 450, 450);
      const vl = L - bl - 500;
      if (vl >= 1200) { add('wardrobe', 'Шкаф h2400', W - 700, L - Math.min(2600, vl) - 100, 600, Math.min(2600, vl)); add('dresser', 'Комод', 100, L - 550, 1000, 450); }
      else { const wl2 = Math.min(2400, W - 1600); add('wardrobe', 'Шкаф h2400', W - wl2 - 100, L - 700, wl2, 600); }
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
function drawPlan(room, sheet) {
  const M = 90, WT = 12, w = px(room.w), l = px(room.l);
  const Wd = w + M * 2 + 60, Hd = l + M * 2 + 90;
  let b = `<rect x="${M - WT}" y="${M - WT}" width="${w + 2 * WT}" height="${l + 2 * WT}" fill="#2E2A26"/>`;
  b += `<rect x="${M}" y="${M}" width="${w}" height="${l}" fill="${style.floor.color}22"/>`;
  for (let gx = 300; gx < room.w; gx += 300) b += `<line x1="${M + px(gx)}" y1="${M}" x2="${M + px(gx)}" y2="${M + l}" stroke="#00000010" stroke-width="1"/>`;
  for (const o of room.windows) b += openingPlan(o, 'window', M, WT, room);
  for (const o of room.doors) b += openingPlan(o, 'door', M, WT, room);
  for (const f of furnitureFor(room)) {
    const dash = f.key === 'rug' ? ' stroke-dasharray="4 3"' : '';
    const fill = f.key === 'rug' ? 'none' : '#FFFFFFE0';
    b += `<rect x="${M + px(f.x)}" y="${M + px(f.y)}" width="${px(f.w)}" height="${px(f.h)}" fill="${fill}" stroke="#57514A" stroke-width="1.2" rx="2"${dash}/>`;
    if (f.key !== 'rug' || f.w > 1500) b += `<text x="${M + px(f.x + f.w / 2)}" y="${M + px(f.y + f.h / 2) + 3}" font-size="9" fill="#57514A" text-anchor="middle">${esc(f.name)}</text>`;
  }
  b += `<text x="${M - WT}" y="${M - 46}" font-size="16" font-weight="700" fill="#2E2A26">${esc(room.name)} · ${room.area} м²</text>`;
  b += `<text x="${M - WT}" y="${M - 28}" font-size="11" fill="#7A756D">План с расстановкой мебели · стиль «${style.title}» · h потолка ${room.h} мм</text>`;
  b += dimH(M, M + w, M + l + 34, room.w + ' мм');
  b += dimV(M + w + 34, M, M + l, room.l + ' мм');
  b += stamp(M - WT, l + M * 2 + 30, w + 2 * WT + 40, `План. ${room.name}`, sheet);
  return svgDoc(Wd + 20, Hd + 10, b);
}

// ---------- развертка стены ----------
function drawElevation(room, wallKey, sheet) {
  const len = (wallKey === 'A' || wallKey === 'C') ? room.w : room.l;
  const M = 90, w = px(len), h = px(room.h);
  const Wd = w + M * 2 + 250, Hd = h + M * 2 + 90;
  let b = `<rect x="${M}" y="${M}" width="${w}" height="${h}" fill="${style.wall.color}" stroke="#2E2A26" stroke-width="2"/>`;
  b += `<rect x="${M}" y="${M + h - px(80)}" width="${w}" height="${px(80)}" fill="#CFC9BD" stroke="#57514A" stroke-width="0.8"/>`; // плинтус
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
  b += dimH(M, M + w, M + h + 30, len + ' мм');
  b += dimV(M - 30, M, M + h, room.h + ' мм');
  const ax = M + w + 24;
  b += `<text x="${ax}" y="${M + 16}" font-size="12" font-weight="700" fill="#2E2A26">Отделка стены</text>`;
  const notes = ['Стены: ' + style.wall.finish, 'Плинтус: ' + style.plinth, 'Двери: ' + style.doors, 'Акцент: ' + style.accent.finish];
  notes.forEach((t, i) => { wrapText(t, 34).forEach((line, j) => { b += `<text x="${ax}" y="${M + 40 + i * 46 + j * 14}" font-size="10" fill="#57514A">${esc(line)}</text>`; }); });
  b += `<text x="${M}" y="${M - 40}" font-size="16" font-weight="700" fill="#2E2A26">Развертка · ${esc(room.name)} · стена ${wallKey}</text>`;
  b += `<text x="${M}" y="${M - 24}" font-size="11" fill="#7A756D">Вид изнутри помещения · отметки от чистого пола</text>`;
  b += stamp(M, h + M * 2 + 26, w + 220, `Развертка ${room.name}, стена ${wallKey}`, sheet);
  return svgDoc(Wd, Hd + 10, b);
}
function wrapText(t, n) { const out = []; let cur = ''; for (const word of t.split(' ')) { if ((cur + ' ' + word).trim().length > n) { out.push(cur.trim()); cur = word; } else cur += ' ' + word; } if (cur.trim()) out.push(cur.trim()); return out; }

// ---------- план потолка ----------
function drawCeiling(room, sheet) {
  const M = 90, WT = 12, w = px(room.w), l = px(room.l);
  const Wd = w + M * 2 + 60, Hd = l + M * 2 + 130;
  const L = lightsFor(room);
  let b = `<rect x="${M - WT}" y="${M - WT}" width="${w + 2 * WT}" height="${l + 2 * WT}" fill="#2E2A26"/>`;
  b += `<rect x="${M}" y="${M}" width="${w}" height="${l}" fill="#F4F1EA"/>`;
  for (const o of room.windows) { // ниша штор вдоль стены с окном
    let nx = M, ny = M, nw = w, nh = px(200);
    if (o.wall === 'A') { ny = M; } else if (o.wall === 'C') { ny = M + l - px(200); }
    else { nw = px(200); nh = l; nx = o.wall === 'D' ? M : M + w - px(200); }
    b += `<rect x="${nx}" y="${ny}" width="${nw}" height="${nh}" fill="#E3DED4" stroke="#8A8478" stroke-width="0.7" stroke-dasharray="4 3"/>`;
    b += `<text x="${nx + 6}" y="${ny + 14}" font-size="9" fill="#8A8478">ниша штор 200</text>`;
  }
  for (const s of L.spots) b += `<g stroke="#57514A" stroke-width="1"><circle cx="${M + px(s.x)}" cy="${M + px(s.y)}" r="5" fill="#FFF"/><line x1="${M + px(s.x) - 7}" y1="${M + px(s.y)}" x2="${M + px(s.x) + 7}" y2="${M + px(s.y)}"/><line x1="${M + px(s.x)}" y1="${M + px(s.y) - 7}" x2="${M + px(s.x)}" y2="${M + px(s.y) + 7}"/></g>`;
  if (L.pendant) b += `<circle cx="${M + w / 2}" cy="${M + l / 2}" r="11" fill="none" stroke="#2E2A26" stroke-width="1.6"/><circle cx="${M + w / 2}" cy="${M + l / 2}" r="3" fill="#2E2A26"/>`;
  if (L.track) b += `<line x1="${M + px(400)}" y1="${M + px(850)}" x2="${M + w - px(400)}" y2="${M + px(850)}" stroke="#2E2A26" stroke-width="3"/><text x="${M + px(420)}" y="${M + px(850) - 8}" font-size="9" fill="#57514A">трек-система</text>`;
  b += `<text x="${M - WT}" y="${M - 46}" font-size="16" font-weight="700" fill="#2E2A26">План потолка · ${esc(room.name)}</text>`;
  b += `<text x="${M - WT}" y="${M - 28}" font-size="11" fill="#7A756D">${esc(style.ceiling)} · h ${room.h} мм</text>`;
  b += dimH(M, M + w, M + l + 34, room.w + ' мм');
  b += dimV(M + w + 34, M, M + l, room.l + ' мм');
  const ly = M + l + 52;
  b += `<g font-size="10" fill="#57514A"><circle cx="${M + 6}" cy="${ly - 3}" r="5" fill="#FFF" stroke="#57514A"/><text x="${M + 18}" y="${ly}">точечный светильник — ${L.spots.length} шт.</text>`;
  if (L.pendant) b += `<circle cx="${M + 216}" cy="${ly - 3}" r="6" fill="none" stroke="#2E2A26" stroke-width="1.4"/><text x="${M + 228}" y="${ly}">подвес/люстра — 1 шт.</text>`;
  if (L.track) b += `<line x1="${M + 380}" y1="${ly - 4}" x2="${M + 410}" y2="${ly - 4}" stroke="#2E2A26" stroke-width="3"/><text x="${M + 418}" y="${ly}">трек — 1 шт.</text>`;
  b += `</g>`;
  b += stamp(M - WT, l + M * 2 + 66, w + 2 * WT + 40, `Потолок. ${room.name}`, sheet);
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
  let totalSpots = 0, pendants = 0, tracks = 0;
  for (const r of rooms) {
    const g = roomGeometry(r), L = lightsFor(r);
    totalSpots += L.spots.length; if (L.pendant) pendants++; if (L.track) tracks++;
    const wet = r.type === 'bathroom';
    R('Черновые работы', r.name, WORK_RATES.screed.name, 'м²', g.floor, WORK_RATES.screed.rate * tier.k);
    R('Черновые работы', r.name, WORK_RATES.plaster.name, 'м²', g.walls, WORK_RATES.plaster.rate * tier.k);
    R('Черновые работы', r.name, WORK_RATES.ceilGkl.name, 'м²', g.floor, WORK_RATES.ceilGkl.rate * tier.k);
    R('Черновые работы', r.name, WORK_RATES.electro.name, 'точка', L.spots.length + (L.pendant ? 1 : 0) + (L.track ? 1 : 0) + 6, WORK_RATES.electro.rate * tier.k);
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
  let body = '';
  for (const r of rooms) {
    const wet = r.type === 'bathroom';
    const g = roomGeometry(r);
    const rowsSpec = wet ? [
      ['Пол', `керамогранит 600×600, матовый · ${g.floor} м²`],
      ['Стены', `керамогранит / плитка под камень · ${g.walls} м²`],
      ['Потолок', 'влагостойкий ГКЛ, краска для влажных помещений'],
      ['Сантехника', 'ванна 1700, подвесной унитаз, накладная раковина'],
      ['Освещение', `точечные IP44 — ${lightsFor(r).spots.length} шт.`]
    ] : [
      ['Пол', `${style.floor.name} · ${g.floor} м²`],
      ['Стены', `${style.wall.finish} · ${g.walls} м²`],
      ['Акцент', style.accent.finish],
      ['Потолок', style.ceiling],
      ['Плинтус', `${style.plinth} · ${g.plinth} м.п.`],
      ['Двери', style.doors],
      ['Текстиль', style.textiles]
    ];
    const furn = furnitureFor(r).map(f => f.name).join(', ') || '—';
    body += `<h2>${nn(r.idx)} · ${esc(r.name)} · ${r.area} м²</h2>
<table><tbody>${rowsSpec.map(x => `<tr><td class="k">${x[0]}</td><td>${esc(x[1])}</td></tr>`).join('')}
<tr><td class="k">Мебель</td><td>${esc(furn)}</td></tr></tbody></table>`;
  }
  return docHTML('Спецификация материалов', `
<h1>Спецификация чистовых материалов</h1>
<p class="sub">Стиль «${style.title}» · тариф «${tier.title}» · ${DATE}</p>
<div class="pal">${style.palette.map(c => `<span style="background:${c}"></span>`).join('')}<em>палитра проекта</em></div>
${body}
<p class="note">Артикулы и точные коллекции подбираются на этапе комплектации; допустимы аналоги в той же ценовой группе без изменения образа.</p>`);
}

// ---------- концепт ----------
function conceptHTML() {
  const cards = rooms.map(r => `
<div class="card"><h2>${nn(r.idx)} · ${esc(r.name)}</h2>
<p>${esc(style.concept)}</p>
<p class="mut">Свет: ${lightsFor(r).spots.length} точечных${lightsFor(r).pendant ? ' + декоративный подвес' : ''}${lightsFor(r).track ? ' + трек' : ''}. Пол: ${esc(style.floor.name)}.</p></div>`).join('');
  return docHTML('Концепция проекта', `
<h1>Концепция · стиль «${style.title}»</h1>
<p class="sub">${esc(style.concept)}</p>
<div class="pal">${style.palette.map(c => `<span style="background:${c}"></span>`).join('')}<em>палитра</em></div>
${cards}
<p class="note">Фотореалистичные рендеры каждого помещения выполняются на этапе 2 после согласования планировочного решения.</p>`);
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
<h2>Состав комплекта</h2>
<table><tbody>
<tr><td class="k">01 Планы</td><td>планы с расстановкой мебели — ${counts.plans} лист.</td></tr>
<tr><td class="k">02 Развертки</td><td>развертка каждой стены — ${counts.elev} лист.</td></tr>
<tr><td class="k">03 Потолки</td><td>планы потолков со светом — ${counts.ceil} лист.</td></tr>
<tr><td class="k">04 Концепция</td><td>образ и палитра каждого помещения</td></tr>
<tr><td class="k">05 Материалы</td><td>спецификация чистовой отделки</td></tr>
<tr><td class="k">06 Смета</td><td>смета реализации (HTML + CSV для Excel)</td></tr>
</tbody></table>
<p class="note">Все чертежи — в масштабе 1:50, размеры в миллиметрах, отметки от чистого пола. Комплект пригоден для передачи строительной бригаде.</p>`);
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
.mut{color:#7A756D;font-size:13px}
.note{color:#7A756D;font-size:12px;border-top:1px solid #E5E0D6;padding-top:14px;margin-top:28px}
footer{max-width:900px;margin:14px auto 0;color:#9A937F;font-size:11px;letter-spacing:2px}
@media print{body{padding:0}main{border:0;padding:24px}}
</style></head><body><main>${body}</main><footer>LINEA · СТУДИЯ ДИЗАЙНА ИНТЕРЬЕРА · ${DATE}</footer></body></html>`;
}

// ---------- просмотрщик папки ----------
function viewerHTML(files) {
  const grp = k => files.filter(f => f.startsWith(k) && f.endsWith('.svg'));
  const sec = (title, list) => list.length ? `<section><h2>${title}</h2><div class="grid">${list.map(f => `<figure><a href="${f}" target="_blank"><img src="${f}" loading="lazy" alt=""></a><figcaption>${f.split('/').pop()}</figcaption></figure>`).join('')}</div></section>` : '';
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
<nav><a href="#docs">Документы</a><a href="#plany">01 Планы</a><a href="#razv">02 Развертки</a><a href="#pot">03 Потолки</a></nav>
<section id="docs"><h2>Документы</h2><div class="docs">
<a href="00-pasport/pasport.html"><b>00 · Паспорт проекта</b>состав, палитра, данные объекта</a>
<a href="04-koncept/koncept.html"><b>04 · Концепция</b>образ каждого помещения</a>
<a href="05-materialy/specification.html"><b>05 · Материалы</b>спецификация чистовой отделки</a>
<a href="06-smeta/smeta.html"><b>06 · Смета</b>работы, материалы, мебель, свет</a>
<a href="06-smeta/smeta.csv"><b>06 · Смета CSV</b>для Excel / Google Sheets</a>
</div></section>
<section id="plany"><h2>01 · Планы с расстановкой мебели</h2><div class="grid">${grp('01-plany').map(f => `<figure><a href="${f}" target="_blank"><img src="${f}" loading="lazy" alt=""></a><figcaption>${f.split('/').pop()}</figcaption></figure>`).join('')}</div></section>
${sec('02 · Развертки стен', grp('02-razvertki'))}
${sec('03 · Потолки и свет', grp('03-potolki'))}
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
const counts = { plans: 0, elev: 0, ceil: 0 };
for (const r of rooms) {
  const sl = `${nn(r.idx)}-${slug(r.name)}`;
  writeOut(`01-plany/plan-${sl}.svg`, drawPlan(r, sheet++)); counts.plans++;
  for (const wk of ['A', 'B', 'C', 'D']) { writeOut(`02-razvertki/${sl}-stena-${wk}.svg`, drawElevation(r, wk, sheet++)); counts.elev++; }
  writeOut(`03-potolki/potolok-${sl}.svg`, drawCeiling(r, sheet++)); counts.ceil++;
}
const smetaRows = buildSmeta();
writeOut('06-smeta/smeta.html', smetaHTML(smetaRows));
writeOut('06-smeta/smeta.csv', smetaCSV(smetaRows));
writeOut('05-materialy/specification.html', specHTML());
writeOut('04-koncept/koncept.html', conceptHTML());
writeOut('00-pasport/pasport.html', coverHTML(counts));
writeOut('index.html', viewerHTML(files.slice()));
writeOut('manifest.json', JSON.stringify({ generated: new Date().toISOString(), style: styleKey, tier: tier.key, totalArea, rooms: rooms.map(r => ({ name: r.name, type: r.type, area: r.area })), files }, null, 2));

const total = smetaRows.reduce((s, r) => s + r.sum, 0);
console.log(`✔ Проект собран: ${outDir}`);
console.log(`  Стиль «${style.title}», тариф «${tier.title}», ${totalArea} м², помещений: ${rooms.length}`);
console.log(`  Листов: планы ${counts.plans} · развертки ${counts.elev} · потолки ${counts.ceil}`);
console.log(`  Смета (без резерва): ${fmt(total)} ₽ · файлов: ${files.length}`);
