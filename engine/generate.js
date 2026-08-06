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
const { STYLES, TIERS, WORK_RATES, FURN_PRICES, FURN_H, pickStyle } = require('./presets');

// ---------- CLI ----------
// node engine/generate.js <brief.json> [папка-вывода] [--date=ДД.ММ.ГГГГ] [--strict]
const FLAGS = {}, POS = [];
for (const a of process.argv.slice(2)) {
  const m = /^--([a-z][a-z-]*)(?:=(.*))?$/.exec(a);
  if (m) FLAGS[m[1]] = m[2] === undefined ? true : m[2]; else POS.push(a);
}
const briefPath = POS[0];
if (!briefPath) { console.error('Использование: node engine/generate.js <brief.json> [папка-вывода] [--date=ДД.ММ.ГГГГ] [--strict]'); process.exit(1); }
const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
// дата выпуска: флаг → бриф → системные часы. Первые два дают побайтово воспроизводимый альбом.
const ISSUE_DATE = (typeof FLAGS.date === 'string' && FLAGS.date) || (brief.meta && brief.meta.issueDate) || null;
const DATE = ISSUE_DATE || new Date().toLocaleDateString('ru-RU');
const outDir = POS[1] || path.join('output', 'project-' + (ISSUE_DATE ? ISSUE_DATE.split('.').reverse().join('-') : new Date().toISOString().slice(0, 10)));

// ---------- проверка исходных данных ----------
const CHECK = require('./validate').validate(brief);
if (CHECK.errors.length || CHECK.warnings.length) {
  console.log(`Проверка брифа: ошибок ${CHECK.errors.length}, предупреждений ${CHECK.warnings.length}`);
  CHECK.errors.forEach(e => console.error('  ✖ ' + e));
  CHECK.warnings.forEach(w => console.log('  ⚠ ' + w));
}
if (CHECK.errors.length && FLAGS.strict) {
  console.error('--strict: альбом не собран, пока в исходных данных есть ошибки.');
  process.exit(1);
}

// ---------- нормализация брифа (метры → мм) ----------
const HABITABLE = new Set(['living', 'bedroom', 'kids', 'living-kitchen', 'cabinet', 'kitchen']);
const rooms = (brief.rooms || []).map((r, i) => {
  const w = Math.round(r.width * 1000), l = Math.round(r.length * 1000);
  const h = Math.round((r.height || (brief.object && brief.object.ceilingHeight) || 2.7) * 1000);
  const windows = (r.windows || (HABITABLE.has(r.type) ? [{ wall: 'A', offset: Math.max(0.2, (r.width - 1.5) / 2), width: 1.5, height: 1.45, sill: 0.9 }] : []))
    .map(o => ({ wall: o.wall, off: Math.round(o.offset * 1000), w: Math.round(o.width * 1000), h: Math.round(o.height * 1000), sill: Math.round((o.sill == null ? 0.9 : o.sill) * 1000) }));
  const doors = (r.doors || [{ wall: 'C', offset: 0.2, width: 0.9 }])
    .map(o => ({ wall: o.wall, off: Math.round(o.offset * 1000), w: Math.round(o.width * 1000), h: Math.round((o.height || 2.05) * 1000) }));
  return { idx: i + 1, id: r.id || 'room' + (i + 1), name: r.name, type: r.type || 'living', w, l, h, windows, doors, area: +(r.width * r.length).toFixed(1), level: r.level || 1, stairs: r.stairs || null,
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

// ---------- ЛИСТ: А3 альбомный (420×297 мм при 96 dpi), рамка ГОСТ 2.301, поле подшивки 20 мм ----------
const PAGE = { w: 1587, h: 1123, ml: 76, mr: 19, mt: 19, mb: 19 };
// масштабный ряд: [знаменатель, коэффициент к внутренним координатам]. S=0.08 px/мм ≈ 1:47,24 при 96 dpi
// Ряд масштабов: только рекомендованные для планов, разрезов и развёрток интерьера
// (ГОСТ 21.501-2018, табл. 1 + ряд ГОСТ 2.302). 1:15, 1:75 и 1:150 убраны — они
// формально существуют, но в альбоме АИ дают «нестандартный» лист, а масштабная
// линейка и привязки перестают читаться как у соседних листов.
const SCALE_SERIES = [[20, 2.3622], [25, 1.8898], [40, 1.1811], [50, 0.9449], [100, 0.4724], [200, 0.2362]];
let LAST_STAMP = null; // штамп листа, собранный draw-функцией (рисуется рамкой листа, не содержимым)

function sheetStampBlock(x, y, w, h, st) {
  const r1 = y + h * 0.42, c1 = x + w * 0.24;                       // верхняя строка: студия | объект
  const b1 = x + w * 0.52, c2 = x + w * 0.63, c3 = x + w * 0.775, c4 = x + w * 0.885; // нижняя: имя | стадия | М | лист | листов
  let s = `<g data-el="stamp" stroke="#1C1C1C" stroke-width="1" fill="none"><rect x="${x}" y="${y}" width="${w}" height="${h}"/>
<line x1="${x}" y1="${r1}" x2="${x + w}" y2="${r1}"/><line x1="${c1}" y1="${y}" x2="${c1}" y2="${r1}"/>
<line x1="${b1}" y1="${r1}" x2="${b1}" y2="${y + h}"/>
<line x1="${c2}" y1="${r1}" x2="${c2}" y2="${y + h}"/><line x1="${c3}" y1="${r1}" x2="${c3}" y2="${y + h}"/><line x1="${c4}" y1="${r1}" x2="${c4}" y2="${y + h}"/></g>`;
  const lbl = (tx, ty, t) => `<text x="${tx}" y="${ty}" font-size="9.5" fill="#7A756D">${esc(t)}</text>`;
  const val = (tx, ty, t, sz, w2) => `<text x="${tx}" y="${ty}" font-size="${sz || 11}" font-weight="${w2 || 400}" fill="#1C1C1C">${esc(t)}</text>`;
  s += lbl(x + 7, y + 13, 'Студия') + val(x + 7, y + 30, 'LINEA', 15, 700) + lbl(x + 7, y + 43, 'Дизайн интерьера');
  s += lbl(c1 + 7, y + 13, 'Объект') + val(c1 + 7, y + 30, (brief.object && brief.object.address) || 'Объект', 12, 600);
  s += lbl(c1 + 7, y + 43, `${(brief.object && brief.object.type) || 'квартира'} · ${totalArea} м² · стиль «${style.title}»`);
  s += lbl(x + 7, r1 + 13, 'Наименование листа');
  const nm = wrapText(String(st.name), 42);
  nm.slice(0, 2).forEach((ln, i2) => { s += val(x + 7, r1 + 30 + i2 * 14, ln, nm.length > 1 ? 11 : 12.5, 600); });
  s += lbl(b1 + 7, r1 + 13, 'Стадия') + val(b1 + 7, r1 + 30, 'РП', 12, 600);
  s += lbl(c2 + 7, r1 + 13, 'Масштаб') + val(c2 + 7, r1 + 30, 'М 1:' + st.ratio, 12, 600);
  s += lbl(c3 + 7, r1 + 13, 'Лист') + val(c3 + 7, r1 + 30, String(st.sheet), 12, 600);
  s += lbl(c4 + 7, r1 + 13, 'Листов') + val(c4 + 7, r1 + 30, String(TOTAL_SHEETS || '—'), 12, 600);
  s += `<text x="${x + w - 7}" y="${y + h - 6}" font-size="9.5" fill="#8A8478" text-anchor="end">${DATE}</text>`;
  return s;
}

// вырезать содержимое групп с clip-path (учитывая вложенность <g>)
function stripClipped(body) {
  let out = '', i = 0;
  for (;;) {
    const m = /<g[^>]*clip-path="[^"]*"[^>]*>/.exec(body.slice(i));
    if (!m) return out + body.slice(i);
    const start = i + m.index, inner = start + m[0].length;
    out += body.slice(i, start);
    let depth = 1, j = inner;
    const re = /<g\b|<\/g>/g; re.lastIndex = inner;
    let t;
    while ((t = re.exec(body))) { depth += t[0] === '</g>' ? -1 : 1; if (!depth) break; }
    i = t ? re.lastIndex : body.length;
  }
}

// фактические границы содержимого: по ним лист заполняется без пустых полей
function contentBox(body) {
  // <defs> измерять нельзя: координаты внутри <pattern>/<marker> живут в своей системе,
  // и нулевая точка штриховки тянула габарит листа к (0,0) — из-за этого чертёж уезжал
  // на ступень мельче по масштабному ряду и половина поля оставалась пустой
  body = body.replace(/<defs>[\s\S]*?<\/defs>/g, '');
  // Содержимое обрезанных групп на листе не видно за пределами clipPath: штриховки
  // рисуются с запасом (демонтаж, полы, раскладка плитки) и раньше раздували габарит.
  // Видимые границы задаёт <rect> внутри <clipPath> — он остаётся в замере.
  body = stripClipped(body);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const put = (x, y) => { if (isFinite(x) && isFinite(y)) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } };
  // прямоугольники и изображения (с учётом ширины/высоты)
  const re = /<(rect|image)\b[^>]*?x="(-?[\d.]+)"[^>]*?y="(-?[\d.]+)"[^>]*?width="(-?[\d.]+)"[^>]*?height="(-?[\d.]+)"/g;
  let m; while ((m = re.exec(body))) { const x = +m[2], y = +m[3]; put(x, y); put(x + +m[4], y + +m[5]); }
  // линии
  const rl = /<line\b[^>]*?x1="(-?[\d.]+)"[^>]*?y1="(-?[\d.]+)"[^>]*?x2="(-?[\d.]+)"[^>]*?y2="(-?[\d.]+)"/g;
  while ((m = rl.exec(body))) { put(+m[1], +m[2]); put(+m[3], +m[4]); }
  // окружности и эллипсы
  const rc = /<(circle|ellipse)\b[^>]*?cx="(-?[\d.]+)"[^>]*?cy="(-?[\d.]+)"/g;
  while ((m = rc.exec(body))) { put(+m[2] - 12, +m[3] - 12); put(+m[2] + 12, +m[3] + 12); }
  // тексты: якорь плюс запас на длину строки
  const rt = /<text\b[^>]*?x="(-?[\d.]+)"[^>]*?y="(-?[\d.]+)"[^>]*?>([^<]*)</g;
  while ((m = rt.exec(body))) { const x = +m[1], y = +m[2], w = (m[3] || '').length * 5.2; put(x - 6, y - 14); put(x + w, y + 6); }
  // пути и полилинии
  const rp = /<(path|polyline)\b[^>]*?(?:d|points)="([^"]+)"/g;
  while ((m = rp.exec(body))) {
    const nums = (m[2].match(/-?[\d.]+/g) || []).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) put(nums[i], nums[i + 1]);
  }
  if (x0 > x1 || y0 > y1) return null;
  return { x0: x0 - 14, y0: y0 - 14, x1: x1 + 14, y1: y1 + 14 };
}

// ---------- перо и типографика в миллиметрах бумаги (ГОСТ 2.303 / 2.304) ----------
const PXMM = 1587 / 420;          // px листа на 1 мм бумаги (A3 при 96 dpi)
const PEN_MM = { cut: 0.7, cutSecondary: 0.5, visible: 0.35, thin: 0.25, aux: 0.18 };
const TEXT_MM = { h5: 5, h35: 3.5, h25: 2.5 };
// Содержимое листа рисуется в модельных px и потом масштабируется в поле чертежа
// коэффициентом k (см. SCALE_SERIES). Из-за этого один и тот же font-size давал на бумаге
// от 1,5 до 5,6 мм — альбом читался как склейка из разных проектов. Нормализация держит
// толщины и кегли постоянными на бумаге: делим на k и подпираем минимумами ГОСТ.
const K_REF = 1.05;               // опорный коэффициент: font-size 9 → 2,5 мм на бумаге
function normalizeInk(body, k) {
  const c = Math.max(0.35, Math.min(1.35, K_REF / k));   // границы: не даём тексту распухнуть на мелких масштабах
  const minText = TEXT_MM.h25 * PXMM / k;                // 2,5 мм — ниже ГОСТ 2.304 не выводим
  const minPen = PEN_MM.aux * PXMM / k;                  // 0,18 мм — тоньше не печатается
  return body
    .replace(/font-size="([\d.]+)"/g, (m, v) => `font-size="${Math.max(+v * c, minText).toFixed(2)}"`)
    .replace(/stroke-width="([\d.]+)"/g, (m, v) => `stroke-width="${Math.max(+v * c, minPen).toFixed(2)}"`);
}

function svgDoc(wPx, hPx, body, bg) {
  const st = LAST_STAMP || { name: 'Лист', sheet: '—', scale: null }; LAST_STAMP = null;
  if (st.y && st.y > 40 && st.y < hPx) hPx = st.y + 12;   // низ содержимого — там, где стоял старый штамп
  const fx = PAGE.ml, fy = PAGE.mt, fw = PAGE.w - PAGE.ml - PAGE.mr, fh = PAGE.h - PAGE.mt - PAGE.mb;
  const sw = 700, sh = 150;                       // штамп 185×40 мм в правом нижнем углу поля
  const fieldW = fw - 16, fieldH = fh - sh - 20;  // поле чертежа над штампом
  const bb = contentBox(body) || { x0: 0, y0: 0, x1: wPx, y1: hPx };
  const cw = Math.max(40, bb.x1 - bb.x0), ch = Math.max(40, bb.y1 - bb.y0);
  let k = SCALE_SERIES[SCALE_SERIES.length - 1][1], ratio = SCALE_SERIES[SCALE_SERIES.length - 1][0];
  for (const [r, kk] of SCALE_SERIES) { if (cw * kk <= fieldW && ch * kk <= fieldH) { k = kk; ratio = r; break; } }
  if (st.scale === '1:20') { k = SCALE_SERIES[0][1]; ratio = 20; }  // узлы — фиксированный масштаб
  st.ratio = ratio;
  if (process.env.LINEA_DEBUG_FIT) console.log(`FIT ${st.name} | bb ${bb.x0.toFixed(0)},${bb.y0.toFixed(0)} → ${bb.x1.toFixed(0)},${bb.y1.toFixed(0)} | cw×ch ${cw.toFixed(0)}×${ch.toFixed(0)} | k=${k} 1:${ratio} | на бумаге ${(cw*k).toFixed(0)}×${(ch*k).toFixed(0)} из ${fieldW}×${fieldH}`);
  // содержимое ставим по фактическим границам: слева и сверху с равным полем, без пустых зон
  const ox = fx + 12 + Math.max(0, (fieldW - cw * k) / 2) - bb.x0 * k;
  const oy = fy + 14 + Math.max(0, (fieldH - ch * k) / 2) - bb.y0 * k;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.w}" height="${PAGE.h}" viewBox="0 0 ${PAGE.w} ${PAGE.h}" font-family='${FONT}' data-sheet="${CUR_SHEET || 'other'}" data-scale="1:${ratio}">`;
  s += `<rect width="${PAGE.w}" height="${PAGE.h}" fill="${bg || CAD.paper}"/>`;
  s += `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="none" stroke="#1C1C1C" stroke-width="1.6"/>`;
  s += `<g transform="translate(${ox} ${oy}) scale(${k.toFixed(4)})">${normalizeInk(body, k)}</g>`;
  s += sheetStampBlock(fx + fw - sw, fy + fh - sh, sw, sh, st);
  // контрольный отрезок масштаба: 1000 мм в натуре
  const ctrl = 1000 * S * k;
  s += `<g stroke="#1C1C1C" stroke-width="1"><line x1="${fx + 14}" y1="${fy + fh - 22}" x2="${fx + 14 + ctrl}" y2="${fy + fh - 22}"/><line x1="${fx + 14}" y1="${fy + fh - 27}" x2="${fx + 14}" y2="${fy + fh - 17}"/><line x1="${fx + 14 + ctrl}" y1="${fy + fh - 27}" x2="${fx + 14 + ctrl}" y2="${fy + fh - 17}"/></g>`;
  s += `<text x="${fx + 14}" y="${fy + fh - 32}" font-size="9.5" fill="#57514A">контроль: 1000 мм · печать 1:1, без подгонки под лист</text>`;
  return s + `</svg>`;
}
let TOTAL_SHEETS = 0; // проставляется до генерации листов
// Тип текущего листа (obmer, demolition, furniture, …) — пишется в data-sheet корня SVG,
// по нему tools/audit-sheets.js понимает, какой чек-лист канона применять.
let CUR_SHEET = '';
function stamp(x, y, w, drawingName, sheet, scale) {
  LAST_STAMP = { name: drawingName, sheet, scale: scale || null, y, x };
  return ''; // штамп рисуется рамкой листа (svgDoc) в едином месте
}
function dimH(x1, x2, y, label) {
  return `<g data-el="dim" stroke="#2A2A2A" stroke-width="0.8" fill="none"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/><line x1="${x1}" y1="${y - 5}" x2="${x1}" y2="${y + 5}"/><line x1="${x2}" y1="${y - 5}" x2="${x2}" y2="${y + 5}"/><line x1="${x1 - 3}" y1="${y + 3}" x2="${x1 + 3}" y2="${y - 3}"/><line x1="${x2 - 3}" y1="${y + 3}" x2="${x2 + 3}" y2="${y - 3}"/></g>
<text x="${(x1 + x2) / 2}" y="${y - 5}" font-size="10.5" fill="#2A2A2A" text-anchor="middle">${label}</text>`;
}
function dimV(x, y1, y2, label) {
  return `<g data-el="dim" stroke="#2A2A2A" stroke-width="0.8" fill="none"><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/><line x1="${x - 5}" y1="${y1}" x2="${x + 5}" y2="${y1}"/><line x1="${x - 5}" y1="${y2}" x2="${x + 5}" y2="${y2}"/><line x1="${x - 3}" y1="${y1 + 3}" x2="${x + 3}" y2="${y1 - 3}"/><line x1="${x - 3}" y1="${y2 + 3}" x2="${x + 3}" y2="${y2 - 3}"/></g>
<text x="${x + 6}" y="${(y1 + y2) / 2}" font-size="10.5" fill="#2A2A2A" transform="rotate(-90 ${x + 6} ${(y1 + y2) / 2})" text-anchor="middle">${label}</text>`;
}

// Знак отметки уровня (ГОСТ Р 21.101-2020, 5.4.3 / ГОСТ 2.307, 5.43): на разрезах и
// развёртках — стрелка из двух штрихов под 45° на выносной линии плюс полка с числом
// в метрах с тремя знаками. dir: 1 — полка вправо, -1 — влево.
function levelMark(x, y, mm, dir, opt) {
  opt = opt || {};
  const d = dir || 1, a = 5, shelf = opt.shelf || 40;
  const v = (mm / 1000).toFixed(3).replace('.', ',');
  const txt = (mm > 0 ? '+' : mm < 0 ? '' : '') + v;
  return `<g data-el="level" stroke="${opt.color || '#2A2A2A'}" stroke-width="0.8" fill="none">`
    + `<line x1="${x - a}" y1="${y - a}" x2="${x}" y2="${y}"/><line x1="${x}" y1="${y}" x2="${x + a}" y2="${y - a}"/>`
    + `<line x1="${x + (d > 0 ? a : -a)}" y1="${y - a}" x2="${x + d * shelf}" y2="${y - a}"/></g>`
    + `<text x="${x + d * (shelf - 3)}" y="${y - a - 3}" font-size="8.6" fill="${opt.color || '#2A2A2A'}" text-anchor="${d > 0 ? 'end' : 'start'}">${txt}</text>`;
}

function levelPlan(x, y, mm, prose) {
  const v = (mm / 1000).toFixed(3).replace('.', ',');
  const txt = (mm > 0 ? '+' : mm < 0 ? '' : '') + v;
  const w = txt.length * 5.9 + 12;
  return `<g data-el="level"><rect x="${x}" y="${y}" width="${w}" height="15" fill="#FFFFFFEE" stroke="#2A2A2A" stroke-width="0.7"/>`
    + `<text x="${x + w / 2}" y="${y + 11}" font-size="9.5" font-weight="600" fill="#2A2A2A" text-anchor="middle">${txt}</text></g>`
    + (prose ? `<text x="${x + w + 5}" y="${y + 11}" font-size="9" fill="#57514A">${esc(prose)}</text>` : '');
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
  if (room.stairs) { // марш вдоль длинной стены; ширина марша 1000, длина по числу ступеней
    const run = Math.min(3600, (room.w >= room.l ? room.w : room.l) - 400), march = 1000;
    const it0 = room.w >= room.l
      ? { x: (room.w - run) / 2, y: 100, w: run, h: march }
      : { x: 100, y: (room.l - run) / 2, w: march, h: run };
    if (add('stairs', room.stairs === 'down' ? 'Лестница вниз' : 'Лестница вверх', it0.x, it0.y, it0.w, it0.h)) {
      const last = it[it.length - 1]; last.dir = room.stairs; last.steps = Math.max(10, Math.round(run / 260));
    }
  }
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
function chainDimH(x0, y, len, openings, withTotal) {   // data-el="chain" — замкнутая цепочка (ГОСТ 2.307, 4.13)
  const segs = chainSegments(len, openings);
  let out = '';
  if (segs.length > 1) for (const s of segs) out += dimH(x0 + px(s.a), x0 + px(s.b), y, String(Math.round(s.b - s.a)));
  if (withTotal || segs.length <= 1) out += dimH(x0, x0 + px(len), y + (segs.length > 1 ? 22 : 0), String(len));
  return `<g data-el="chain">${out}</g>`;
}
function chainDimV(x, y0, len, openings, withTotal) {   // data-el="chain" — замкнутая цепочка (ГОСТ 2.307, 4.13)
  const segs = chainSegments(len, openings);
  let out = '';
  if (segs.length > 1) for (const s of segs) out += dimV(x, y0 + px(s.a), y0 + px(s.b), String(Math.round(s.b - s.a)));
  if (withTotal || segs.length <= 1) out += dimV(x + (segs.length > 1 ? 22 : 0), y0, y0 + px(len), String(len));
  return `<g data-el="chain">${out}</g>`;
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
  if (wet) { // кирпичная раскладка 600×300 от угла А, затирка 2 мм
    const TILE_W = 600, TILE_H = 300;
    const tileFill = '#F2EEE8', groutStroke = '#C4BDB3';
    for (let gy = 0; gy < room.l; gy += TILE_H) {
      const rowOffset = (Math.floor(gy / TILE_H) % 2 === 1) ? TILE_W / 2 : 0;
      for (let gx = -rowOffset; gx < room.w; gx += TILE_W) {
        if (gx + TILE_W <= 0 || gx >= room.w) continue;
        b += `<rect x="${M + px(gx) + 0.5}" y="${M + px(gy) + 0.5}" width="${px(TILE_W) - 1}" height="${px(TILE_H) - 1}" fill="${tileFill}" stroke="${groutStroke}" stroke-width="0.6"/>`;
      }
    }
    // маяки укладки ✚ каждые 1000 мм
    for (let bx = 1000; bx < room.w; bx += 1000) {
      for (let by = 1000; by < room.l; by += 1000) {
        const bcx = M + px(bx), bcy = M + px(by);
        b += `<line x1="${bcx - 6}" y1="${bcy}" x2="${bcx + 6}" y2="${bcy}" stroke="#C29A5B" stroke-width="1.4"/>`;
        b += `<line x1="${bcx}" y1="${bcy - 6}" x2="${bcx}" y2="${bcy + 6}" stroke="#C29A5B" stroke-width="1.4"/>`;
      }
    }
    // стрелка «начало укладки от угла А» — диагональ 45°
    { const sid = `arrS${room.idx}`;
      b += `<defs><marker id="${sid}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6Z" fill="#2E2A26"/></marker></defs>`;
      const alen = Math.min(px(room.w), px(room.l)) * 0.28;
      const ax2 = M + 10 + alen * 0.707, ay2 = M + 10 + alen * 0.707;
      b += `<line x1="${M + 10}" y1="${M + 10}" x2="${ax2}" y2="${ay2}" stroke="#2E2A26" stroke-width="2" marker-end="url(#${sid})"/>`;
      b += `<rect x="${ax2 + 4}" y="${ay2 - 10}" width="156" height="13" fill="#FAF7F0D9" rx="2"/>`;
      b += `<text x="${ax2 + 8}" y="${ay2}" font-size="8.5" fill="#2E2A26">начало укладки от угла А</text>`;
    }
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
  b += `<text x="${M - WT}" y="${M - 28}" font-size="11" fill="#7A756D">${code} · ${wet ? 'керамогранит 600×300, кирпичная раскладка (перевязка)' : esc(style.floor.name)} · S=${g.floor} м²${wet ? '' : ' · плинтус ' + g.plinth + ' м.п.'}</text>`;
  b += dimH(M, M + w, M + l + 30, room.w + '');
  b += dimV(M + w + 30, M, M + l, room.l + '');
  const ly = M + l + 58;
  b += `<g font-size="10" fill="#57514A"><rect x="${M}" y="${ly - 12}" width="16" height="16" fill="${wet ? '#EDEAE2' : style.floor.color + '55'}" stroke="#57514A" stroke-width="0.7"/><text x="${M + 24}" y="${ly}">${code} · ${wet ? 'керамогранит, ' + (g.floor * 1.1).toFixed(1) + ' м² (+10%)' : esc(style.floor.name.split(',')[0]) + ', ' + (g.floor * 1.15).toFixed(1) + ' м² (+15% ёлка)'}</text></g>`;
  b += `<text x="${M - WT}" y="${ly + 20}" font-size="9" fill="#8A8478">${wet ? 'Гидроизоляция обмазочная с заведением на стены 200 мм · уклон к трапу не требуется' : 'Стык покрытий выполнять на оси дверного полотна · компенсационный зазор у стен 10 мм под плинтус'}</text>`;
  if (wet) {
    const TILE_W2 = 600, TILE_H2 = 300;
    const g2 = roomGeometry(room);
    const tileArea = (TILE_W2 / 1000) * (TILE_H2 / 1000); // м²
    const tileCount = Math.ceil(g2.floor / tileArea * 1.1);
    const anLy = M + l + 74; // ниже легенды
    b += `<text x="${M - WT}" y="${anLy}" font-size="9.5" font-weight="600" fill="#57514A">Плитка пол: 600×300 мм · затирка 2 мм · кирпичная раскладка (перевязка)</text>`;
    b += `<text x="${M - WT}" y="${anLy + 14}" font-size="9.5" fill="#57514A">≈ ${tileCount} шт. / ${(g2.floor * 1.1).toFixed(1)} м² (+10% запас)</text>`;
  }
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

// ---------- электрика — Phase 2 (per-appliance, multi-gang, smart home) ----------
function electroFor(room) {
  const W = room.w, L = room.l, pts = [];
  // Phase 2: expanded P helper — opts spread supplies gang/pass/ip44/amps/smart/hidden
  const P = (x, y, type, hh, label, opts) => pts.push({ x: Math.max(120, Math.min(W-120,x)), y: Math.max(120, Math.min(L-120,y)), type, h:hh, label, ...(opts||{}) });

  const door = room.doors[0];
  const doorPos = door
    ? (door.wall === 'A' ? { x: door.off + door.w + 150, y: 150 }
     : door.wall === 'C' ? { x: door.off + door.w + 150, y: L - 150 }
     : door.wall === 'B' ? { x: W - 150, y: door.off + door.w + 150 }
     :                     { x: 150, y: door.off + door.w + 150 })
    : { x: 150, y: L - 150 };

  switch (room.type) {

    case 'bedroom': {
      // Entry: 2-gang switch (ceiling + bedside group)
      P(doorPos.x, doorPos.y, 'switch', 900, 'выкл. 2-кл.', { gang: 2 });

      const hwall = bedWallFor(room);
      if (hwall === 'A' || hwall === 'C') {
        const bx = (W - 1600) / 2;
        const yy = hwall === 'A' ? 150 : L - 150;
        const y2 = hwall === 'A' ? 380 : L - 380;
        // Bedside sockets
        P(bx - 300, yy, 'socket', 600, '2×розетка');
        P(bx + 1900, yy, 'socket', 600, '2×розетка');
        // Passage/2-way switches at each bedside
        P(bx - 300, y2, 'switch', 900, 'проходной', { pass: true });
        P(bx + 1900, y2, 'switch', 900, 'проходной', { pass: true });
        P(500, hwall === 'A' ? L - 150 : 150, 'socket', 300, 'комод/шкаф');
      } else {
        const by = (L - 1600) / 2;
        const xx = hwall === 'B' ? W - 150 : 150;
        const x2 = hwall === 'B' ? W - 380 : 380;
        P(xx, by - 300, 'socket', 600, '2×розетка');
        P(xx, by + 1900, 'socket', 600, '2×розетка');
        // Passage switch at bedside
        P(x2, by - 300, 'switch', 900, 'проходной', { pass: true });
        P(hwall === 'B' ? 500 : W - 500, 150, 'socket', 300, 'шкаф/утюг');
      }
      // TV / work zone socket
      P(W * 0.5, L * 0.5, 'socket', 300, 'ТВ/рабочая 2×');
      // Smart: PIR motion sensor near door
      P(Math.min(W - 200, doorPos.x + 300), doorPos.y, 'sensor', 1800, 'датчик движения', { smart: true });
      // Smart: thermostat on wall opposite entry
      P(W * 0.5, doorPos.y < L / 2 ? L - 200 : 200, 'thermostat', 1400, 'термостат', { smart: true });
      // Smart: robot vacuum dock near wardrobe
      P(200, L - 200, 'vacuum', 150, 'база робота-пылесоса', { smart: true });
      break;
    }

    case 'living-kitchen': {
      // Entry: 4-gang switch (ceiling spots / LED strip / pendant / kitchen zone)
      P(doorPos.x, doorPos.y, 'switch', 900, 'выкл. 4-кл.', { gang: 4 });

      // Kitchen zone — per-appliance sockets along wall A (y≈150)
      P(W * 0.12, 150, 'socket', 150, 'холодильник 1×');
      P(W * 0.25, 150, 'socket', 150, 'посудомойка IP44', { ip44: true });
      P(W * 0.38, 150, 'socket', 150, 'плита 16А', { amps: 16 });
      P(W * 0.52, 150, 'socket', 150, 'духовой шкаф 16А', { amps: 16 });
      P(W * 0.65, 150, 'socket', 1550, 'микроволновка встроенная');
      P(W * 0.40, 260, 'socket', 2100, 'вытяжка 1×');
      // Backsplash fartuk: 3× sockets at h=1100 distributed along counter
      P(W * 0.22, 260, 'socket', 1100, 'фартук 1×');
      P(W * 0.43, 260, 'socket', 1100, 'фартук 1×');
      P(W * 0.61, 260, 'socket', 1100, 'фартук 1×');

      // Living zone
      P(150, L * 0.5, 'socket', 1300, 'ТВ 5× + TV/LAN (скрыто в нише)');
      P(W - 150, L * 0.4, 'socket', 300, 'диван 2×');
      P(W * 0.55, L - 150, 'socket', 300, 'стол');

      // Smart: PIR sensor
      P(Math.min(W - 200, doorPos.x + 300), doorPos.y, 'sensor', 1800, 'датчик движения', { smart: true });
      // Smart: robot vacuum dock in living corner
      P(W - 200, L - 200, 'vacuum', 150, 'база робота-пылесоса', { smart: true });
      // Smart: hub
      P(200, 200, 'hub', 1800, 'хаб умного дома', { smart: true, hidden: true });
      break;
    }

    case 'living': {
      P(doorPos.x, doorPos.y, 'switch', 900, 'выкл. 2-кл.', { gang: 2 });
      P(W * 0.5, 150, 'socket', 1300, 'ТВ 5× + TV/LAN (скрыто в нише)');
      P(W * 0.2, L - 150, 'socket', 300, 'диван 2×');
      P(W - 150, L * 0.5, 'socket', 300, 'торшер');
      P(Math.min(W - 200, doorPos.x + 300), doorPos.y, 'sensor', 1800, 'датчик движения', { smart: true });
      P(W - 200, L - 200, 'vacuum', 150, 'база робота-пылесоса', { smart: true });
      break;
    }

    case 'kitchen': {
      // Entry: 2-gang switch
      P(doorPos.x, doorPos.y, 'switch', 900, 'выкл. 2-кл.', { gang: 2 });
      // Per-appliance sockets
      P(W * 0.12, 150, 'socket', 150, 'холодильник 1×');
      P(W * 0.26, 150, 'socket', 150, 'посудомойка IP44', { ip44: true });
      P(W * 0.42, 150, 'socket', 150, 'плита 16А', { amps: 16 });
      P(W * 0.58, 150, 'socket', 150, 'духовой шкаф 16А', { amps: 16 });
      P(W * 0.72, 150, 'socket', 1550, 'микроволновка встроенная');
      P(W * 0.40, 260, 'socket', 2100, 'вытяжка 1×');
      // Backsplash fartuk: 3×
      P(W * 0.22, 260, 'socket', 1100, 'фартук 1×');
      P(W * 0.45, 260, 'socket', 1100, 'фартук 1×');
      P(W * 0.65, 260, 'socket', 1100, 'фартук 1×');
      P(W - 150, L - 400, 'socket', 300, 'стол');
      break;
    }

    case 'kids': {
      P(doorPos.x, doorPos.y, 'switch', 900, 'выкл. 2-кл.', { gang: 2 });
      P(1500, 150, 'socket', 900, 'стол: блок 4× + LAN');
      P(300, 500, 'socket', 600, 'кровать');
      P(Math.min(W - 200, doorPos.x + 300), doorPos.y, 'sensor', 1800, 'датчик движения', { smart: true });
      P(200, L - 200, 'vacuum', 150, 'база робота-пылесоса', { smart: true });
      break;
    }

    case 'bathroom': {
      P(doorPos.x, doorPos.y, 'switch', 900, 'выкл.');
      P(W - 400, L - 150, 'socket', 1100, 'IP44 фен/бритва', { ip44: true });
      P(W - 150, 400, 'socket', 600, 'вывод полот.суш.');
      // Heated towel rail socket
      P(W - 150, L * 0.55, 'socket', 600, 'полотенцесушитель IP44', { ip44: true });
      // PIR + humidity sensor
      P(W * 0.5, 200, 'sensor', 1800, 'датчик движ./влажн.', { smart: true });
      break;
    }

    case 'hallway': {
      // 3-gang panel: hall light / coat area / street
      P(doorPos.x, doorPos.y, 'switch', 900, 'выкл. 3-кл.', { gang: 3 });
      P(W - 300, 150, 'socket', 300, 'банкетка/сушка');
      // Washing machine
      P(150, L * 0.3, 'socket', 900, 'стиральная машина IP44', { ip44: true });
      // Smart: PIR sensor
      P(W * 0.5, L * 0.5, 'sensor', 1800, 'датчик движения', { smart: true });
      // Smart: hub in hallway closet
      P(200, L - 200, 'hub', 1800, 'хаб умного дома', { smart: true, hidden: true });
      break;
    }

    default: {
      P(doorPos.x, doorPos.y, 'switch', 900, 'выкл.');
      P(500, 150, 'socket', 300, 'розетка');
    }
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
  if (f.key === 'stairs') { // марш: ступени + стрелка направления подъёма
    const horiz = W2 >= H2, n = f.steps || 14;
    for (let i = 1; i < n; i++) s += horiz
      ? `<line x1="${X + (W2 / n) * i}" y1="${Y}" x2="${X + (W2 / n) * i}" y2="${Y + H2}" stroke="${CAD.furn}" stroke-width="0.7"/>`
      : `<line x1="${X}" y1="${Y + (H2 / n) * i}" x2="${X + W2}" y2="${Y + (H2 / n) * i}" stroke="${CAD.furn}" stroke-width="0.7"/>`;
    const up = f.dir !== 'down';
    if (horiz) {
      const y0 = Y + H2 / 2, x1 = up ? X + 8 : X + W2 - 8, x2 = up ? X + W2 - 8 : X + 8, sg = up ? -1 : 1;
      s += `<line x1="${x1}" y1="${y0}" x2="${x2}" y2="${y0}" stroke="${CAD.doorArc}" stroke-width="1.2"/><path d="M ${x2} ${y0} l ${sg * 8} -4 M ${x2} ${y0} l ${sg * 8} 4" fill="none" stroke="${CAD.doorArc}" stroke-width="1.2"/>`;
      s += `<circle cx="${x1}" cy="${y0}" r="2.4" fill="${CAD.doorArc}"/>`;
    } else {
      const x0 = X + W2 / 2, y1 = up ? Y + H2 - 8 : Y + 8, y2 = up ? Y + 8 : Y + H2 - 8, sg = up ? 1 : -1;
      s += `<line x1="${x0}" y1="${y1}" x2="${x0}" y2="${y2}" stroke="${CAD.doorArc}" stroke-width="1.2"/><path d="M ${x0} ${y2} l -4 ${sg * 8} M ${x0} ${y2} l 4 ${sg * 8}" fill="none" stroke="${CAD.doorArc}" stroke-width="1.2"/>`;
      s += `<circle cx="${x0}" cy="${y1}" r="2.4" fill="${CAD.doorArc}"/>`;
    }
  }
  if (f.key === 'wc' || f.key === 'sink') s += `<ellipse cx="${X + W2 / 2}" cy="${Y + H2 / 2}" rx="${W2 * 0.34}" ry="${H2 * 0.34}" fill="none" stroke="${CAD.furn}" stroke-width="0.8"/>`;
  return s;
}
function drawPlan(room, sheet, withDims) {
  const M = 90, WT = 12, w = px(room.w), l = px(room.l);
  const PW = 250; // колонка фото готового интерьера
  const hasPh = roomPhotos(room, 2).length;
  const Wd = Math.max(760, w + M * 2 + 110 + (hasPh ? PW + 100 : 0));
  const Hd = Math.max(l + M * 2 + 300, hasPh ? M + 2 * (PW * 0.68 + 22) + 240 : 0);
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
  { // сводка по помещению: геометрия и отделка — как в рабочих альбомах
    const g = roomGeometry(room), lv = ceilingLevelsFor(room), nn2 = nichesFor(room);
    const tx = M - WT, ty = M + l + 118, cw2 = Math.max(w + 2 * WT, 560);
    const rows = [
      ['Площадь пола', `${g.floor} м²`, 'Высота потолка', `${room.h} мм`],
      ['Площадь стен (за вычетом проёмов)', `${g.walls} м²`, 'Плинтус', `${g.plinth} м.п.`],
      ['Пол', style.floor.name.split(',')[0], 'Стены', style.wall.finish.split(',')[0]],
      ['Потолок', `${lv.three ? '3 уровня' : '2 уровня'}, LED ${lv.ledLen} м.п.`, 'Двери', style.doors.split(',')[0]],
    ];
    b += `<text x="${tx}" y="${ty - 8}" font-size="11" font-weight="700" fill="#1C1C1C">Данные помещения и отделка</text>`;
    b += `<rect x="${tx}" y="${ty}" width="${cw2}" height="${rows.length * 19 + 6}" fill="none" stroke="#8A8478" stroke-width="0.8"/>`;
    rows.forEach((r0, i2) => {
      const yy = ty + 18 + i2 * 19;
      if (i2) b += `<line x1="${tx}" y1="${yy - 14}" x2="${tx + cw2}" y2="${yy - 14}" stroke="#D8D2C6" stroke-width="0.6"/>`;
      const cut = (t, n) => { t = String(t); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
      b += `<text x="${tx + 8}" y="${yy}" font-size="9" fill="#7A756D">${esc(cut(r0[0], 30))}</text><text x="${tx + cw2 * 0.30}" y="${yy}" font-size="9.5" fill="#1C1C1C">${esc(cut(r0[1], 24))}</text>`;
      b += `<line x1="${tx + cw2 * 0.55}" y1="${yy - 14}" x2="${tx + cw2 * 0.55}" y2="${yy + 5}" stroke="#D8D2C6" stroke-width="0.6"/>`;
      b += `<text x="${tx + cw2 * 0.57}" y="${yy}" font-size="9" fill="#7A756D">${esc(cut(r0[2], 18))}</text><text x="${tx + cw2 * 0.78}" y="${yy}" font-size="9.5" fill="#1C1C1C">${esc(cut(r0[3], 26))}</text>`;
    });
    let ny2 = ty + rows.length * 19 + 24;
    if (nn2.length) {
      b += `<text x="${tx}" y="${ny2}" font-size="9" fill="#7A756D">Ниши:</text>`;
      nn2.slice(0, 3).forEach((n, i2) => { b += `<text x="${tx + 44}" y="${ny2 + i2 * 12}" font-size="9" fill="#1C1C1C">${esc(n.label)} — ${n.w}×${n.h}, глуб. ${n.depth}, низ +${(n.sill / 1000).toFixed(3).replace('.', ',')}</text>`; });
      ny2 += nn2.slice(0, 3).length * 12 + 8;
    }
    b += `<text x="${tx}" y="${ny2}" font-size="9" fill="#7A756D">Мебель:</text>`;
    wrapText(furnitureFor(room).map(f => f.name).join(' · ') || '—', 92).slice(0, 2).forEach((ln, i2) => {
      b += `<text x="${tx + 52}" y="${ny2 + i2 * 12}" font-size="9" fill="#1C1C1C">${esc(ln)}</text>`;
    });
  }
  b += stamp(M - WT, Hd - 44, Math.max(w + 2 * WT + 40, 520), `План${withDims ? ' с размерами' : ''}. ${room.name}`, sheet);
  return svgDoc(Wd + 20, Hd + 20, b, CAD.paper);
}

// ---------- развёртка: электроточки стены (проекция плана на стену) ----------
function elevsFor(room, wallKey) {
  const W = room.w, L = room.l, SNAP = 420;
  return electroFor(room).filter(p => {
    if (wallKey === 'A') return p.y <= SNAP;
    if (wallKey === 'C') return p.y >= L - SNAP;
    if (wallKey === 'B') return p.x >= W - SNAP;
    if (wallKey === 'D') return p.x <= SNAP;
    return false;
  }).map(p => ({
    xElev: wallKey === 'A' ? p.x : wallKey === 'C' ? p.x : wallKey === 'B' ? p.y : L - p.y,
    h: p.h, type: p.type, label: p.label
  }));
}

// ---------- мебель на развёртке ----------
// Развертка без мебели несёт ~10% информации: кухонщик не замерит модули, электрик
// не поймёт, попадёт ли розетка за корпус. Берём фактическую расстановку с плана,
// оставляем предметы, прилегающие к этой стене, и разворачиваем их в координату стены.
function furnOnWall(room, wallKey) {
  const GAP = 300;   // мм: считаем предмет пристенным, если зазор до стены меньше
  const out = [];
  for (const f of furnitureFor(room)) {
    if (f.key === 'rug' || f.key === 'stairs') continue;
    const spec = FURN_H[f.key];
    if (!spec) continue;
    let near = false, xElev = 0, wLen = 0;
    if (wallKey === 'A') { near = f.y <= GAP; xElev = f.x; wLen = f.w; }
    else if (wallKey === 'C') { near = room.l - (f.y + f.h) <= GAP; xElev = f.x; wLen = f.w; }
    else if (wallKey === 'B') { near = room.w - (f.x + f.w) <= GAP; xElev = f.y; wLen = f.h; }
    else { near = f.x <= GAP; xElev = room.l - (f.y + f.h); wLen = f.h; }
    if (!near || wLen < 200) continue;
    const isHead = spec.head && f.head === wallKey;   // изголовье кровати у этой стены
    out.push({ key: f.key, name: f.name, xElev, w: wLen, base: spec.base,
      h: isHead ? spec.head : spec.h, head: !!isHead, plan: f });
  }
  return out.sort((a, b) => b.h - a.h);   // высокое рисуем первым, низкое поверх
}

// ---------- развёртка: бра (настенные светильники) по типу помещения ----------
function sconceFor(room, wallKey) {
  const W = room.w, L = room.l, sc = [];
  const add = (wall, xElev, h, label) => {
    const wallLen = (wall === 'A' || wall === 'C') ? W : L;
    if (wall === wallKey && xElev > 120 && xElev < wallLen - 120) sc.push({ xElev, h, label });
  };
  switch (room.type) {
    case 'bedroom': {
      const hw = bedWallFor(room);
      const bBase = (hw === 'A' || hw === 'C') ? (W - 1600) / 2 : (L - 1600) / 2;
      add(hw, bBase - 260, 1600, 'бра'); add(hw, bBase + 1860, 1600, 'бра');
      break;
    }
    case 'living-kitchen': case 'living': {
      const nch = nichesFor(room).find(n => n.label.includes('ТВ'));
      if (nch) { add(nch.wall, nch.off - 300, 1600, 'бра'); add(nch.wall, nch.off + nch.w + 100, 1600, 'бра'); }
      break;
    }
    case 'bathroom': {
      const mw = ['B', 'D', 'C', 'A'].find(w => !room.windows.some(o => o.wall === w) && !room.doors.some(o => o.wall === w));
      if (mw) {
        const ml = (mw === 'A' || mw === 'C') ? W : L;
        add(mw, ml / 2 - 420, 1700, 'бра зеркало');
        add(mw, ml / 2 + 420, 1700, 'бра зеркало');
      }
      break;
    }
    case 'hallway': add('D', Math.max(300, W / 2), 1600, 'бра вход'); break;
  }
  return sc;
}

// ── kitchenEquipFor: возвращает массив объектов техники для кухонной развёртки ──
function kitchenEquipFor(room, wallKey) {
  if (!(room.type === 'living-kitchen' || room.type === 'kitchen') || wallKey !== 'A') return [];
  const kStart = 100;
  const kEnd   = room.w - 200;
  const kW     = kEnd - kStart;
  // Ярусы гарнитура не могут идти сквозь проём: верхние шкафы обходят окно всегда,
  // нижние — когда подоконник ниже столешницы (иначе столешница шла бы по радиатору).
  const CLR = 50;
  const winsOnWall = (room.windows || []).filter(o => o.wall === wallKey);
  const gapsUpper = winsOnWall.map(o => [o.off - CLR, o.off + o.w + CLR]);
  const gapsLower = winsOnWall.filter(o => o.sill < 900).map(o => [o.off - CLR, o.off + o.w + CLR]);
  const splitAround = (a, b, gaps) => {
    let segs = [[a, b]];
    for (const [g0, g1] of gaps) {
      const next = [];
      for (const [s0, s1] of segs) {
        if (g1 <= s0 || g0 >= s1) { next.push([s0, s1]); continue; }
        if (s0 < g0) next.push([s0, Math.min(g0, s1)]);
        if (s1 > g1) next.push([Math.max(g1, s0), s1]);
      }
      segs = next;
    }
    return segs.filter(([s0, s1]) => s1 - s0 >= 300);   // огрызок меньше 300 мм не модуль
  };
  const tier = (segs, hMm, bottomMm, type) => segs.map(([s0, s1]) => ({
    type, xMm: s0, wMm: s1 - s0, hMm, bottomMm,
    fillColor: '#D4C9A8', strokeColor: '#8A7A5A', label: ''
  }));
  return [
    { type: 'fridge',     xMm: kStart,                          wMm: 600, hMm: 2000, bottomMm: 0,          fillColor: '#E8EDEB', strokeColor: '#3D8A6E', label: 'Холодильник' },
    ...tier(splitAround(kStart + 600, kEnd, gapsLower), 870, 0, 'counter'),
    ...tier(splitAround(kStart + 600, kEnd - 350, gapsUpper), 700, room.h - 900, 'upper'),
    { type: 'dishwasher', xMm: kStart + 620,                    wMm: 600, hMm: 860,  bottomMm: 0,          fillColor: '#E0E8ED', strokeColor: '#3D6A8A', label: 'ПМ' },
    { type: 'hob',        xMm: kStart + Math.round(kW * 0.50),  wMm: 600, hMm: 40,   bottomMm: 870,        fillColor: '#2E2A26', strokeColor: '#2E2A26', label: 'Плита' },
    { type: 'hood',       xMm: kStart + Math.round(kW * 0.50),  wMm: 600, hMm: 380,  bottomMm: room.h - 900, fillColor: '#9A9A9A', strokeColor: '#555',    label: 'Вытяжка' },
    { type: 'oven',       xMm: kStart + Math.round(kW * 0.75),  wMm: 600, hMm: 600,  bottomMm: 870,        fillColor: '#555',    strokeColor: '#333',    label: 'Духовой' },
    { type: 'microwave',  xMm: kStart + Math.round(kW * 0.75),  wMm: 600, hMm: 380,  bottomMm: 1450,       fillColor: '#555',    strokeColor: '#333',    label: 'СВЧ' },
    { type: 'sink',       xMm: kStart + Math.round(kW * 0.38),  wMm: 600, hMm: 200,  bottomMm: 670,        fillColor: '#A0C4D8', strokeColor: '#4A8AAA', label: 'Мойка' },
  ];
}

// ── bathroomEquipFor: возвращает сантехнику для развёртки ванной ──
function bathroomEquipFor(room, wallKey) {
  if (room.type !== 'bathroom') return [];
  const hasDoor   = key => (room.doors   || []).some(d => d.wall === key);
  const hasWindow = key => (room.windows || []).some(w => w.wall === key);
  const preferred = ['B', 'C', 'A', 'D'];
  let mainWall = preferred.find(k => !hasWindow(k) && !hasDoor(k));
  if (!mainWall) mainWall = preferred.find(k => !hasWindow(k));
  if (!mainWall) mainWall = 'B';
  if (wallKey !== mainWall) return [];
  const wallLen = (wallKey === 'A' || wallKey === 'C') ? room.w : room.l;
  return [
    { type: 'mirror', xMm: wallLen / 2 - 400, wMm: 800, hMm: 600, bottomMm: room.h - 1800, fillColor: '#B8D4E0', strokeColor: '#4A7A8A', label: 'Зеркало' },
    { type: 'basin',  xMm: wallLen / 2 - 250, wMm: 500, hMm: 200, bottomMm: 840,           fillColor: '#D0E8F0', strokeColor: '#4A8AAA', label: 'Раковина' },
    { type: 'tap',    xMm: wallLen / 2 - 30,  wMm:  60, hMm: 250, bottomMm: 840,           fillColor: '#CCC',    strokeColor: '#888',    label: 'Смеситель' },
    { type: 'towel',  xMm: wallLen - 380,      wMm: 300, hMm: 500, bottomMm: 900,           fillColor: 'none',    strokeColor: '#CCC',    label: 'ПС 300' },
  ];
}

// ── livingEquipFor: возвращает TV-технику для развёртки гостиной ──
function livingEquipFor(room, wallKey) {
  if (!(room.type === 'living-kitchen' || room.type === 'living')) return [];
  const tvNiche = nichesFor(room).find(n => n.label && n.label.includes('ТВ') && n.wall === wallKey);
  if (!tvNiche) return [];
  const hasDeco = !!(room.decor || (room.style && ['neoclassic', 'modern-classic', 'classic'].includes(room.style)));
  return [
    { type: 'tv_console', xMm: tvNiche.off + tvNiche.w * 0.1,  wMm: tvNiche.w * 0.8,        hMm: 480,                    bottomMm: 0,                  fillColor: '#2E2A26', strokeColor: '#1A1A1A', label: '' },
    { type: 'tv_screen',  xMm: tvNiche.off + tvNiche.w * 0.15, wMm: tvNiche.w * 0.7,        hMm: tvNiche.w * 0.7 * 0.56, bottomMm: tvNiche.sill + 520, fillColor: '#1A2030', strokeColor: '#404858', label: 'ТВ 65"' },
    { type: 'soundbar',   xMm: tvNiche.off + tvNiche.w * 0.25, wMm: tvNiche.w * 0.5,        hMm: 80,                     bottomMm: tvNiche.sill + 490, fillColor: '#2E2A26', strokeColor: '#1A1A1A', label: 'Soundbar' },
    ...(hasDeco ? [{ type: 'deco', xMm: tvNiche.off + 60, wMm: 120, hMm: 280, bottomMm: tvNiche.sill, fillColor: '#8A7A5A', strokeColor: '#7A6A4A', label: '' }] : []),
  ];
}

// ---------- развертка стены (премиум: карниз, электрика, бра, подоконник, перемычки) ----------
function drawElevation(room, wallKey, sheet) {
  const len = (wallKey === 'A' || wallKey === 'C') ? room.w : room.l;
  const M = 90, w = px(len), h = px(room.h);
  const CORN_H = 200, PLIN_H = 80; // мм: высота карниза / плинтуса
  const SPEC_X = M + w + 72;
  const SPEC_W = 268;
  const Wd = Math.max(880, w + M * 2 + SPEC_W + 80);
  const Hd = h + M * 2 + 130;

  // ── 1. фон стены ──────────────────────────────────────────────
  let b = `<rect x="${M}" y="${M}" width="${w}" height="${h}" fill="${style.wall.color}" stroke="#2E2A26" stroke-width="2"/>`;
  if (room.type === 'bathroom') { // настенная плитка 600×300 (горизонтальная укладка)
    const WTILE_W = 600, WTILE_H = 300;
    for (let ty = 0; ty < room.h; ty += WTILE_H) {
      for (let tx = 0; tx < len; tx += WTILE_W) {
        b += `<rect x="${M + px(tx) + 0.5}" y="${M + h - px(ty + WTILE_H) + 0.5}" width="${px(WTILE_W) - 1}" height="${px(WTILE_H) - 1}" fill="#F2EEE8" stroke="#C8C0B4" stroke-width="0.6"/>`;
      }
    }
  }

  // ── 2. карниз с подсветкой (у потолка) ───────────────────────
  const cornHpx = px(CORN_H);
  b += `<rect x="${M}" y="${M}" width="${w}" height="${cornHpx}" fill="#D8D4CC" stroke="#57514A" stroke-width="1" stroke-dasharray="5 3"/>`;
  b += `<line x1="${M + 6}" y1="${M + cornHpx * 0.64}" x2="${M + w - 6}" y2="${M + cornHpx * 0.64}" stroke="#C29A5B" stroke-width="2.5" stroke-dasharray="9 5"/>`;
  b += `<text x="${M + 8}" y="${M + cornHpx * 0.42}" font-size="8" fill="#7A756D">Карниз ГКЛ ${CORN_H}×60 мм</text>`;
  b += `<text x="${M + w - 8}" y="${M + cornHpx * 0.42}" font-size="7.5" fill="#8A6A3B" text-anchor="end">LED 3000К · ${style.skus.led.split('·')[0].trim()}</text>`;

  // ── 3. плинтус ────────────────────────────────────────────────
  b += `<rect x="${M}" y="${M + h - px(PLIN_H)}" width="${w}" height="${px(PLIN_H)}" fill="#CFC9BD" stroke="#57514A" stroke-width="0.8"/>`;
  b += `<text x="${M + 8}" y="${M + h - 3}" font-size="8" fill="#57514A">${esc(style.plinth.split(',')[0])}</text>`;

  // ── 4. ниши (+ LED-пунктир внутри) ───────────────────────────
  let nicheLabels = '';
  for (const nch of nichesFor(room).filter(o => o.wall === wallKey)) {
    const nx = M + px(nch.off), ny = M + h - px(nch.sill + nch.h);
    b += `<rect x="${nx}" y="${ny}" width="${px(nch.w)}" height="${px(nch.h)}" fill="#00000014" stroke="#57514A" stroke-width="1.2"/>`;
    b += `<rect x="${nx + 3}" y="${ny + 3}" width="${px(nch.w) - 6}" height="${px(nch.h) - 6}" fill="none" stroke="#C29A5B" stroke-width="1" stroke-dasharray="5 3"/>`;
    b += `<line x1="${nx + 5}" y1="${ny + 7}" x2="${nx + px(nch.w) - 5}" y2="${ny + 7}" stroke="#C29A5B" stroke-width="2.2" stroke-dasharray="7 4"/>`;
    const l1 = `${nch.w}×${nch.h} гл.${nch.depth}`;
    const lw = Math.min(Math.max(l1.length, nch.label.length) * 5.2 + 10, w - 12);
    const tcx = Math.min(Math.max(nx + px(nch.w) / 2, M + 6 + lw / 2), M + w - 6 - lw / 2);
    nicheLabels += `<rect x="${tcx - lw / 2}" y="${ny + px(nch.h) / 2 - 10}" width="${lw}" height="26" fill="#FFFFFFE8"/>`;
    nicheLabels += `<text x="${tcx}" y="${ny + px(nch.h) / 2}" font-size="9" fill="#57514A" text-anchor="middle">${l1}</text>`;
    nicheLabels += `<text x="${tcx}" y="${ny + px(nch.h) / 2 + 12}" font-size="8" fill="#8A6A3B" text-anchor="middle">${esc(nch.label)}</text>`;
    b += `<text x="${nx + px(nch.w) / 2}" y="${ny - 5}" font-size="9" fill="#7A756D" text-anchor="middle">низ +${(nch.sill / 1000).toFixed(3).replace('.', ',')}</text>`;
  }

  // ── кухонная техника + сантехника + ТВ на развёртке ─────────────
  const kitEquip    = kitchenEquipFor(room, wallKey);
  const bathEquip   = bathroomEquipFor(room, wallKey);
  const livingEquip = livingEquipFor(room, wallKey);

  // ── 4a. фронты пристенной мебели с плана ─────────────────────
  // Рисуем до техники: техника (плита, мойка, ТВ) ложится поверх своих корпусов.
  const drawnByEquip = new Set();
  if (kitEquip.length) { drawnByEquip.add('kitchen'); drawnByEquip.add('kitchen_ext'); drawnByEquip.add('fridge'); }
  if (bathEquip.length) { drawnByEquip.add('sink'); }
  const wallFurn = furnOnWall(room, wallKey).filter(f => !drawnByEquip.has(f.key));
  let furnMarks = '';
  for (const f of wallFurn) {
    const fx0 = M + px(f.xElev), fy0 = M + h - px(f.base + f.h);
    const fw0 = px(f.w), fh0 = px(f.h);
    b += `<rect x="${fx0}" y="${fy0}" width="${fw0}" height="${fh0}" fill="#2E9E4F0F" stroke="${CAD.furn}" stroke-width="1.1"/>`;
    // деталировка фронта: створки по 450–600 мм с ручками, у мягкой мебели — спинка
    if (['wardrobe', 'hallwardrobe', 'shelf', 'dresser'].includes(f.key)) {
      const nD = Math.max(1, Math.round(f.w / 500));
      for (let d = 1; d < nD; d++) b += `<line x1="${fx0 + fw0 * d / nD}" y1="${fy0 + 3}" x2="${fx0 + fw0 * d / nD}" y2="${fy0 + fh0 - 3}" stroke="${CAD.furn}" stroke-width="0.7"/>`;
      for (let d = 0; d < nD; d++) b += `<rect x="${fx0 + fw0 * (d + 0.5) / nD - 1.2}" y="${fy0 + fh0 * 0.45}" width="2.4" height="${Math.min(28, fh0 * 0.18)}" fill="${CAD.furn}"/>`;
      if (f.key === 'shelf') for (let sh = 1; sh < Math.round(f.h / 350); sh++)
        b += `<line x1="${fx0 + 2}" y1="${fy0 + fh0 * sh / Math.round(f.h / 350)}" x2="${fx0 + fw0 - 2}" y2="${fy0 + fh0 * sh / Math.round(f.h / 350)}" stroke="${CAD.furn}" stroke-width="0.6"/>`;
    }
    if (f.head) { // изголовье: мягкая панель с прошивкой
      const nS = Math.max(2, Math.round(f.w / 600));
      for (let sq = 1; sq < nS; sq++) b += `<line x1="${fx0 + fw0 * sq / nS}" y1="${fy0 + 4}" x2="${fx0 + fw0 * sq / nS}" y2="${fy0 + fh0 - 4}" stroke="${CAD.furn}" stroke-width="0.6" stroke-dasharray="3 2"/>`;
    }
    if (['sofa', 'armchair'].includes(f.key)) b += `<line x1="${fx0}" y1="${fy0 + fh0 * 0.42}" x2="${fx0 + fw0}" y2="${fy0 + fh0 * 0.42}" stroke="${CAD.furn}" stroke-width="0.7"/>`;
    if (['table', 'desk', 'dining', 'coffee'].includes(f.key)) { // столешница + ножки
      b += `<line x1="${fx0}" y1="${fy0 + 4}" x2="${fx0 + fw0}" y2="${fy0 + 4}" stroke="${CAD.furn}" stroke-width="1.4"/>`;
      b += `<line x1="${fx0 + 6}" y1="${fy0 + 4}" x2="${fx0 + 6}" y2="${fy0 + fh0}" stroke="${CAD.furn}" stroke-width="0.8"/>`;
      b += `<line x1="${fx0 + fw0 - 6}" y1="${fy0 + 4}" x2="${fx0 + fw0 - 6}" y2="${fy0 + fh0}" stroke="${CAD.furn}" stroke-width="0.8"/>`;
    }
    // подпись и отметка верха — поверх графики, собираем отдельно
    const cap = `${f.head ? 'Изголовье' : (FURN_H[f.key] || {}).name || f.name} ${f.w}`;
    if (fw0 > cap.length * 4.6 && fh0 > 16)
      furnMarks += `<text x="${fx0 + fw0 / 2}" y="${fy0 + fh0 / 2 + 3}" font-size="8" fill="${CAD.furn}" text-anchor="middle">${esc(cap)}</text>`;
    furnMarks += `<text x="${fx0 + fw0 - 3}" y="${fy0 - 4}" font-size="7.6" fill="#57514A" text-anchor="end">+${((f.base + f.h) / 1000).toFixed(3).replace('.', ',')}</text>`;
  }
  for (const eq of [...kitEquip, ...bathEquip, ...livingEquip]) {
    const ex = M + px(eq.xMm), ey = M + h - px(eq.bottomMm + eq.hMm);
    const ew = px(eq.wMm),     eh = px(eq.hMm);
    if (eq.type === 'hood') {
      b += `<path d="M ${ex} ${ey+eh} L ${ex+ew*0.15} ${ey} L ${ex+ew*0.85} ${ey} L ${ex+ew} ${ey+eh} Z" fill="${eq.fillColor}" stroke="${eq.strokeColor}" stroke-width="1.2"/>`;
    } else {
      b += `<rect x="${ex}" y="${ey}" width="${ew}" height="${eh}" fill="${eq.fillColor}" stroke="${eq.strokeColor}" stroke-width="1.2" rx="2"/>`;
    }
    if (eq.type === 'hob') {
      const boffsets = [[0.18,0.35],[0.5,0.35],[0.18,0.65],[0.5,0.65]];
      for (const [bx,by] of boffsets) b += `<circle cx="${ex+ew*bx}" cy="${ey+eh*by*6}" r="4" fill="none" stroke="#C29A5B" stroke-width="1.2"/>`;
    } else if (eq.type === 'upper' || eq.type === 'counter') {
      const nDoors = Math.max(1, Math.round(eq.wMm / 450));
      for (let d = 1; d < nDoors; d++) b += `<line x1="${ex + ew*d/nDoors}" y1="${ey+4}" x2="${ex + ew*d/nDoors}" y2="${ey+eh-4}" stroke="${eq.strokeColor}" stroke-width="0.7"/>`;
      for (let d = 0; d < nDoors; d++) b += `<circle cx="${ex + ew*(d+0.5)/nDoors}" cy="${ey+eh*0.5}" r="2" fill="${eq.strokeColor}"/>`;
    } else if (eq.type === 'mirror') {
      b += `<line x1="${ex+4}" y1="${ey+4}" x2="${ex+ew-4}" y2="${ey+eh-4}" stroke="${eq.strokeColor}" stroke-width="0.8" opacity="0.5"/>`;
      b += `<line x1="${ex+ew-4}" y1="${ey+4}" x2="${ex+4}" y2="${ey+eh-4}" stroke="${eq.strokeColor}" stroke-width="0.8" opacity="0.5"/>`;
    } else if (eq.type === 'tap') {
      const tc = ex + ew/2, tmid = ey + eh*0.4;
      b += `<line x1="${tc-8}" y1="${tmid}" x2="${tc+8}" y2="${tmid}" stroke="#888" stroke-width="2"/>`;
      b += `<line x1="${tc}" y1="${tmid-8}" x2="${tc}" y2="${tmid+8}" stroke="#888" stroke-width="2"/>`;
      b += `<path d="M ${tc} ${tmid+8} Q ${tc+12} ${tmid+16} ${tc+12} ${ey+eh}" fill="none" stroke="#888" stroke-width="1.4"/>`;
    } else if (eq.type === 'towel') {
      const tw2 = px(eq.wMm), th2 = px(eq.hMm);
      b += `<line x1="${ex+6}" y1="${ey}" x2="${ex+6}" y2="${ey+th2}" stroke="#BBBBBB" stroke-width="3"/>`;
      b += `<line x1="${ex+tw2-6}" y1="${ey}" x2="${ex+tw2-6}" y2="${ey+th2}" stroke="#BBBBBB" stroke-width="3"/>`;
      const rungs = Math.max(2, Math.round(eq.hMm/80));
      for (let ri=0; ri<=rungs; ri++) b += `<line x1="${ex+6}" y1="${ey+th2*ri/rungs}" x2="${ex+tw2-6}" y2="${ey+th2*ri/rungs}" stroke="#BBBBBB" stroke-width="2"/>`;
    } else if (eq.type === 'tv_screen') {
      // inset bezel rect
      b += `<rect x="${ex+3}" y="${ey+3}" width="${ew-6}" height="${eh-6}" fill="none" stroke="${eq.strokeColor}" stroke-width="0.7" rx="3"/>`;
      // four corner quarter-arc highlights
      const ar = Math.min(9, ew * 0.07);
      b += `<path d="M ${ex+5} ${ey+5+ar} A ${ar} ${ar} 0 0 1 ${ex+5+ar} ${ey+5}" fill="none" stroke="#FFFFFF45" stroke-width="1.3"/>`;
      b += `<path d="M ${ex+ew-5-ar} ${ey+5} A ${ar} ${ar} 0 0 1 ${ex+ew-5} ${ey+5+ar}" fill="none" stroke="#FFFFFF45" stroke-width="1.3"/>`;
      b += `<path d="M ${ex+5} ${ey+eh-5-ar} A ${ar} ${ar} 0 0 0 ${ex+5+ar} ${ey+eh-5}" fill="none" stroke="#FFFFFF20" stroke-width="1"/>`;
      b += `<path d="M ${ex+ew-5-ar} ${ey+eh-5} A ${ar} ${ar} 0 0 0 ${ex+ew-5} ${ey+eh-5-ar}" fill="none" stroke="#FFFFFF20" stroke-width="1"/>`;
      // stand line at bottom centre
      const stW = ew * 0.32;
      b += `<line x1="${ex+ew/2-stW/2}" y1="${ey+eh}" x2="${ex+ew/2+stW/2}" y2="${ey+eh+3}" stroke="${eq.strokeColor}" stroke-width="2.2"/>`;
      // dimension annotation above screen
      b += `<text x="${ex}" y="${ey-7}" font-size="7.5" fill="#5A6880">экран: ${Math.round(eq.wMm)}×${Math.round(eq.hMm)} мм · ось +${Math.round(eq.bottomMm + eq.hMm/2)} мм</text>`;
    } else if (eq.type === 'tv_console') {
      // top accent strip
      b += `<rect x="${ex}" y="${ey}" width="${ew}" height="${Math.max(4, eh*0.08)}" fill="#3E3A36" stroke="none" rx="3"/>`;
      // vertical door division lines
      const nDoors = Math.max(2, Math.round(eq.wMm / 550));
      for (let d = 1; d < nDoors; d++)
        b += `<line x1="${ex + ew*d/nDoors}" y1="${ey + Math.max(4, eh*0.08) + 2}" x2="${ex + ew*d/nDoors}" y2="${ey+eh-4}" stroke="#1A1A1A" stroke-width="0.8"/>`;
      // horizontal handle bars per door section
      for (let d = 0; d < nDoors; d++) {
        const hcx = ex + ew*(d+0.5)/nDoors;
        const hcy = ey + eh * 0.52;
        b += `<rect x="${hcx-9}" y="${hcy-2}" width="18" height="4" fill="#888880" stroke="none" rx="2"/>`;
      }
    } else if (eq.type === 'soundbar') {
      // speaker grille — row of evenly-spaced dots
      const nDots = Math.max(5, Math.round(eq.wMm / 90));
      const dotR  = Math.min(2.5, eh * 0.22);
      const dotY  = ey + eh / 2;
      for (let d = 0; d < nDots; d++)
        b += `<circle cx="${ex + ew*(d+0.5)/nDots}" cy="${dotY}" r="${dotR}" fill="#484858" stroke="none"/>`;
    } else if (eq.type === 'deco') {
      // tall vase: trapezoid body + neck rectangle + ellipse mouth
      const vCx  = ex + ew / 2;
      const neckW = ew * 0.38, bodyW = ew * 0.72, neckH = eh * 0.24;
      b += `<path d="M ${vCx-bodyW/2} ${ey+eh} L ${vCx-neckW/2} ${ey+neckH} L ${vCx+neckW/2} ${ey+neckH} L ${vCx+bodyW/2} ${ey+eh} Z" fill="${eq.fillColor}" stroke="${eq.strokeColor}" stroke-width="1"/>`;
      b += `<rect x="${vCx-neckW/2}" y="${ey+4}" width="${neckW}" height="${neckH}" fill="${eq.fillColor}" stroke="${eq.strokeColor}" stroke-width="0.8"/>`;
      b += `<ellipse cx="${vCx}" cy="${ey+4}" rx="${neckW*0.58}" ry="${Math.max(3, neckH*0.18)}" fill="${eq.strokeColor}" stroke="${eq.strokeColor}" stroke-width="0.8"/>`;
    }
    if (eq.label && eh > 14) b += `<text x="${ex + ew/2}" y="${ey + eh/2 + 4}" font-size="8" fill="${eq.strokeColor}" text-anchor="middle" font-weight="600">${esc(eq.label)}</text>`;
  }

  // ── 5. окна + профиль подоконника + радиатор ──────────────────
  let radSvg = '';
  for (const o of room.windows.filter(o => o.wall === wallKey)) {
    const ox = M + px(o.off), oy = M + h - px(o.sill + o.h);
    // рама
    b += `<rect x="${ox}" y="${oy}" width="${px(o.w)}" height="${px(o.h)}" fill="#DCE8EC" stroke="#57514A" stroke-width="1.5"/>`;
    b += `<line x1="${ox + px(o.w) / 2}" y1="${oy}" x2="${ox + px(o.w) / 2}" y2="${oy + px(o.h)}" stroke="#57514A" stroke-width="1"/>`;
    // метка «окно»: если верх рамы в зоне карниза — ставим внутрь проёма
    { const inCorn = oy - 10 < M + cornHpx + 14;
      b += `<text x="${ox + px(o.w) / 2}" y="${inCorn ? oy + px(o.h) / 2 + 4 : oy - 10}" font-size="9.5" fill="${inCorn ? '#57514A' : '#7A756D'}" text-anchor="middle">окно ${o.w}×${o.h}</text>`; }
    // подоконник — профиль
    const sillOvhg = 40, sillThick = 35;
    const sillX = ox - px(sillOvhg), sillY = M + h - px(o.sill);
    b += `<rect x="${sillX}" y="${sillY}" width="${px(o.w + sillOvhg * 2)}" height="${px(sillThick)}" fill="#D8D2C0" stroke="#57514A" stroke-width="1.2"/>`;
    const sillMat = style.key === 'neoclassic' ? 'мрамор Bianco' : style.key === 'minimal' || style.key === 'loft' ? 'искусств. камень' : 'МДФ кр. в тон';
    b += `<text x="${ox + 4}" y="${sillY + px(sillThick) + 12}" font-size="8" fill="#7A756D">подоконник ${o.w + sillOvhg * 2}×${o.sill}×${sillThick} · ${sillMat}</text>`;
    // радиатор под подоконником
    const radW = px(Math.min(o.w, 1200)), radH = px(88);
    const radX = ox + (px(o.w) - radW) / 2, radY = sillY + px(sillThick) + px(20);
    radSvg += `<rect x="${radX}" y="${radY}" width="${radW}" height="${radH}" fill="#EAF3F7" stroke="#5B7FA0" stroke-width="0.9"/>`;
    const rn = Math.max(4, Math.round(radW / 9));
    for (let i = 1; i < rn; i++) radSvg += `<line x1="${radX + radW / rn * i}" y1="${radY + 2}" x2="${radX + radW / rn * i}" y2="${radY + radH - 2}" stroke="#5B7FA0" stroke-width="0.6"/>`;
    radSvg += `<text x="${ox + px(o.w) - 4}" y="${radY + radH + 11}" font-size="8" fill="#5B7FA0" text-anchor="end">радиатор отопления</text>`;
  }

  // ── 6. двери + перемычка ──────────────────────────────────────
  for (const o of room.doors.filter(o => o.wall === wallKey)) {
    const dx = M + px(o.off), dy = M + h - px(o.h);
    b += `<rect x="${dx - 4}" y="${dy - px(60)}" width="${px(o.w) + 8}" height="${px(60)}" fill="#CFC9BD" stroke="#57514A" stroke-width="0.8"/>`;
    b += `<rect x="${dx}" y="${dy}" width="${px(o.w)}" height="${px(o.h)}" fill="#EFEAE1" stroke="#57514A" stroke-width="1.5"/>`;
    b += `<circle cx="${dx + px(o.w) - 8}" cy="${dy + px(o.h) / 2}" r="2.5" fill="#57514A"/>`;
    b += `<text x="${dx + px(o.w) / 2}" y="${dy - px(60) - 6}" font-size="9.5" fill="#7A756D" text-anchor="middle">дверь ${o.w}×${o.h}</text>`;
  }

  b += radSvg;
  // Колонка отметок уровня слева (ГОСТ Р 21.101-2020, 5.4.3): чистый пол, потолок,
  // верх пристенной мебели и столешниц — по ним бригада ставит закладные и не перекрывает
  // выключатели. Практика рабочих альбомов: отметки всегда слева от развёртки.
  {
    const lv = [{ mm: 0, t: 'чистый пол' }, { mm: room.h, t: 'потолок' }];
    for (const f of wallFurn) lv.push({ mm: f.base + f.h, t: '' });
    const seen = new Set();
    lv.filter(v => { const k = Math.round(v.mm / 10); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.mm - b.mm)
      .forEach(v => { b += levelMark(M - 6, M + h - px(v.mm), v.mm, -1, { shelf: 46 }); });
  }
  b += furnMarks;      // подписи мебели поверх графики фронтов
  b += nicheLabels;

  // ── 7. бра ────────────────────────────────────────────────────
  const mySconces = sconceFor(room, wallKey);
  for (const sc of mySconces) {
    const sx = M + px(sc.xElev), sy = M + h - px(sc.h);
    const ar = 14; // px (фиксированный, не в масштабе)
    b += `<path d="M ${sx - ar * 2.2} ${sy} A ${ar * 2.2} ${ar * 2.2} 0 0 1 ${sx + ar * 2.2} ${sy}" fill="#FFF3CC88" stroke="#C29A5B" stroke-width="1.4"/>`;
    b += `<circle cx="${sx}" cy="${sy}" r="${ar * 0.85}" fill="#FFEC99" stroke="#C29A5B" stroke-width="1"/>`;
    b += `<line x1="${sx}" y1="${sy + ar * 0.85}" x2="${sx}" y2="${sy + ar * 2.8}" stroke="#C29A5B" stroke-width="1.5"/>`;
    b += `<line x1="${sx - ar * 1.4}" y1="${sy + ar * 1.2}" x2="${sx - ar * 2}" y2="${sy + ar * 2.2}" stroke="#C29A5B" stroke-width="0.8" stroke-dasharray="2 2"/>`;
    b += `<line x1="${sx + ar * 1.4}" y1="${sy + ar * 1.2}" x2="${sx + ar * 2}" y2="${sy + ar * 2.2}" stroke="#C29A5B" stroke-width="0.8" stroke-dasharray="2 2"/>`;
    b += `<text x="${sx}" y="${sy - ar * 2.8}" font-size="8" fill="#8A6A3B" text-anchor="middle">бра h=${sc.h}</text>`;
  }

  // ── 8. электрика на стене (розетки / выключатели) ─────────────
  const elevHLabels = [];
  const elPts = elevsFor(room, wallKey);
  const SR = 8; // px фиксированный — размер символа
  for (const ep of elPts) {
    const ex = M + px(ep.xElev), ey = M + h - px(ep.h);
    if (ep.type === 'socket') {
      // розетка: окружность + крест
      b += `<circle cx="${ex}" cy="${ey}" r="${SR}" fill="#F0FFEE" stroke="#21A366" stroke-width="1.3"/>`;
      b += `<line x1="${ex - SR * 0.6}" y1="${ey - SR * 0.85}" x2="${ex + SR * 0.6}" y2="${ey - SR * 0.85}" stroke="#21A366" stroke-width="1"/>`;
      b += `<line x1="${ex - SR * 0.6}" y1="${ey - SR * 1.2}" x2="${ex + SR * 0.6}" y2="${ey - SR * 1.2}" stroke="#21A366" stroke-width="1"/>`;
    } else {
      // выключатель: заполненный круг + рычаг
      b += `<circle cx="${ex}" cy="${ey}" r="${SR * 0.85}" fill="#21A366"/>`;
      b += `<line x1="${ex}" y1="${ey - SR * 0.85}" x2="${ex + SR * 1.8}" y2="${ey - SR * 2.2}" stroke="#21A366" stroke-width="1.4"/>`;
      b += `<line x1="${ex + SR * 1.8}" y1="${ey - SR * 2.2}" x2="${ex + SR * 3}" y2="${ey - SR * 1.6}" stroke="#21A366" stroke-width="1.4"/>`;
    }
    // вертикальная нитка вниз к полу
    b += `<line x1="${ex}" y1="${M + h}" x2="${ex}" y2="${ey + SR + 1}" stroke="#21A36630" stroke-width="0.6" stroke-dasharray="2 3"/>`;
    // подпись высоты — собираем, чтобы разложить в два ряда без слипания
    elevHLabels.push({ x: ex, h: ep.h });
  }
  // Подписи привязок раскладываем по двум рядам: в один ряд они слипались в кашу
  // («h=1800h=150h=1100»). Не влезло даже во второй ряд — высота всё равно есть
  // в выносках справа от стены.
  {
    const rows = [[], []];
    for (const lab of elevHLabels.slice().sort((a, b) => a.x - b.x)) {
      const wLab = 30;
      const ri = rows.findIndex(r => !r.length || lab.x - r[r.length - 1] >= wLab);
      if (ri < 0) continue;
      rows[ri].push(lab.x);
      b += `<text x="${lab.x}" y="${M + h + 16 + ri * 12}" font-size="8" fill="#21A366" text-anchor="middle">h=${lab.h}</text>`;
    }
  }
  // горизонтальная группировка подписей h= (уникальные высоты, вынос вправо от стены)
  const uniqH = [...new Set(elPts.map(p => p.h))].sort((a, b) => a - b);
  uniqH.forEach((hh, i) => {
    const ty = M + h - px(hh);
    b += `<line x1="${M + w}" y1="${ty}" x2="${M + w + 38}" y2="${ty}" stroke="#21A36650" stroke-width="0.8"/>`;
    b += `<text x="${M + w + 42}" y="${ty + 4}" font-size="8" fill="#21A366">h=${hh}</text>`;
  });

  // ── 9. размерные цепочки ──────────────────────────────────────
  const hOpen = [
    ...wallOpenings(room, wallKey),
    ...nichesFor(room).filter(n => n.wall === wallKey && n.depth >= 80).map(n => ({ off: n.off, w: n.w }))
  ].sort((a, b) => a.off - b.off).filter((o, i, arr) => i === 0 || o.off >= arr[i - 1].off + arr[i - 1].w - 10);
  b += chainDimH(M, M + h + 34, len, hOpen, true);

  // вертикальная цепочка: карниз + окно (если есть) + плинтус
  const vw = room.windows.find(o => o.wall === wallKey);
  const rawSegs = [
    { off: 0, w: CORN_H },
    ...(vw ? [{ off: room.h - vw.sill - vw.h, w: vw.h }] : []),
    { off: room.h - PLIN_H, w: PLIN_H }
  ].sort((a, b) => a.off - b.off);
  const vSegs = rawSegs.filter((s, i, arr) => i === 0 || s.off >= arr[i - 1].off + arr[i - 1].w + 20);
  b += chainDimV(M - 46, M, room.h, vSegs, true);

  // ── 10. правая колонка: спецификация ──────────────────────────
  const ax = SPEC_X;
  const sockCount = elPts.filter(p => p.type === 'socket').length;
  const swCount = elPts.filter(p => p.type === 'switch').length;
  const braCount = mySconces.length;
  const wallNiches = nichesFor(room).filter(n => n.wall === wallKey);
  const ledCorniceM = +(len / 1000 * 1.05).toFixed(1);

  b += `<text x="${ax}" y="${M + 16}" font-size="12" font-weight="700" fill="#2E2A26">Отделка · стена ${wallKey}</text>`;
  b += `<line x1="${ax}" y1="${M + 22}" x2="${ax + SPEC_W - 4}" y2="${M + 22}" stroke="#D8D2C6" stroke-width="0.8"/>`;

  const finRows = room.type === 'bathroom'
    ? [['Стены', 'Кер./гр. 600×300, затирка в тон'], ['Потолок', 'ГКЛВ, краска влагостойкая'], ['Плинтус', 'ПВХ сантехнический'], ['LED', style.skus.led.split('·')[0].trim()]]
    : [['Стены', style.wall.finish.split(',')[0].replace(/^краска\s+/i, '')], ['Акцент', style.accent.finish.split(':').pop().trim()], ['Плинтус', style.plinth.split(',')[0]], ['LED', style.skus.led.split('·')[0].trim()]];
  let cy = M + 34;
  finRows.forEach(r => {
    b += `<text x="${ax}" y="${cy}" font-size="9" font-weight="600" fill="#7A756D">${esc(r[0])}:</text>`;
    wrapText(r[1], 27).slice(0, 2).forEach((ln, j) => { b += `<text x="${ax + 50}" y="${cy + j * 12}" font-size="9.5" fill="#1C1C1C">${esc(ln)}</text>`; });
    cy += 23;
  });

  cy += 8;
  b += `<text x="${ax}" y="${cy}" font-size="11" font-weight="700" fill="#2E2A26">Элементы стены</text>`;
  b += `<line x1="${ax}" y1="${cy + 5}" x2="${ax + SPEC_W - 4}" y2="${cy + 5}" stroke="#D8D2C6" stroke-width="0.8"/>`;
  cy += 18;
  const counters = [
    ...(sockCount > 0 ? [['Розетки', `${sockCount} шт.`]] : []),
    ...(swCount > 0   ? [['Выключатели', `${swCount} шт.`]] : []),
    ...(braCount > 0  ? [[`Бра h=1600`, `${braCount} шт.`]] : []),
    ...(wallNiches.length > 0 ? [[`Ниши с LED`, `${wallNiches.length} шт.`]] : []),
    ...(livingEquip.some(e => e.type === 'tv_screen')  ? [['ТВ 65"',   '1 шт.']] : []),
    ...(livingEquip.some(e => e.type === 'tv_console') ? [['ТВ-тумба', '1 шт.']] : []),
    [`LED карниз`, `${ledCorniceM} м.п.`],
    [`Плинтус`, `${+(len / 1000).toFixed(1)} м.п.`]
  ];
  counters.forEach((r, i) => {
    if (i) b += `<line x1="${ax}" y1="${cy - 6}" x2="${ax + SPEC_W - 4}" y2="${cy - 6}" stroke="#EDEBE4" stroke-width="0.6"/>`;
    // символ-иконка слева
    if (r[0].startsWith('Розетки')) b += `<circle cx="${ax + 5}" cy="${cy + 2}" r="4.5" fill="none" stroke="#21A366" stroke-width="1.2"/>`;
    else if (r[0].startsWith('Выключат')) b += `<circle cx="${ax + 5}" cy="${cy + 2}" r="4" fill="#21A366"/>`;
    else if (r[0].startsWith('Бра')) b += `<path d="M ${ax + 1} ${cy + 4} A 8 8 0 0 1 ${ax + 12} ${cy + 4}" fill="none" stroke="#C29A5B" stroke-width="1.4"/>`;
    else if (r[0].startsWith('Ниши')) b += `<rect x="${ax + 1}" y="${cy - 2}" width="10" height="8" fill="none" stroke="#C29A5B" stroke-width="1" stroke-dasharray="3 2"/>`;
    else if (r[0].startsWith('LED')) b += `<line x1="${ax + 1}" y1="${cy + 3}" x2="${ax + 11}" y2="${cy + 3}" stroke="#C29A5B" stroke-width="2.2" stroke-dasharray="4 3"/>`;
    b += `<text x="${ax + 16}" y="${cy + 7}" font-size="9.5" fill="#57514A">${esc(r[0])}</text>`;
    b += `<text x="${ax + SPEC_W - 6}" y="${cy + 7}" font-size="9.5" font-weight="600" fill="#1C1C1C" text-anchor="end">${esc(r[1])}</text>`;
    cy += 21;
  });

  // артикул LED
  cy += 6;
  b += `<text x="${ax}" y="${cy}" font-size="8" fill="#8A8478">Арт.: ${esc(style.skus.led)}</text>`;
  cy += 18;

  // фото помещения
  const ph = roomPhotos(room, 1)[0];
  if (ph) {
    const pw = Math.min(SPEC_W - 4, 228);
    b += `<image href="${ph.data}" x="${ax}" y="${cy}" width="${pw}" height="${+(pw * 0.66).toFixed(0)}" preserveAspectRatio="xMidYMid slice"/>`;
    b += `<rect x="${ax}" y="${cy}" width="${pw}" height="${+(pw * 0.66).toFixed(0)}" fill="none" stroke="#1C1C1C" stroke-width="0.8"/>`;
    b += `<text x="${ax}" y="${cy + pw * 0.66 + 12}" font-size="8.4" fill="#57514A">Реализация: ${esc(room.name)}</text>`;
  }

  // ── 11. заголовок и штамп ─────────────────────────────────────
  b += `<text x="${M}" y="${M - 40}" font-size="16" font-weight="700" fill="#2E2A26">Развертка · ${esc(room.name)} · стена ${wallKey}</text>`;
  b += `<text x="${M}" y="${M - 24}" font-size="11" fill="#7A756D">Вид изнутри помещения · отметки от чистого пола · М 1:50</text>`;
  b += stamp(M, Hd - 60, Math.min(w + 220, ax - M - 24), `Развертка ${room.name}, стена ${wallKey}`, sheet);
  return svgDoc(Wd, Hd + 10, b);
}
function wrapText(t, n) { const out = []; let cur = ''; for (const word of t.split(' ')) { if ((cur + ' ' + word).trim().length > n) { out.push(cur.trim()); cur = word; } else cur += ' ' + word; } if (cur.trim()) out.push(cur.trim()); return out; }

// ---------- план потолка (2–3 уровня, отметки по ГОСТ) ----------
const mark = mm => '+' + (mm / 1000).toFixed(3).replace('.', ',');
function drawCeiling(room, sheet) {
  const M = 90, WT = 12, w = px(room.w), l = px(room.l);
  const Wd = Math.max(760, w + M * 2 + 60), Hd = l + M * 2 + 220;
  const L = lightsFor(room);
  const lv = ceilingLevelsFor(room);
  const drop = 120; // перепад уровня, мм
  let islandLabel = '';
  let b = roomWalls(M, WT, room, sheet, '#E9E4D8');
  // уровень 1 (базовый потолок) — внутренняя зона
  const bx = M + px(lv.box), by = M + px(lv.box), bw = w - 2 * px(lv.box), bl = l - 2 * px(lv.box);
  b += `<rect x="${bx}" y="${by}" width="${bw}" height="${bl}" fill="#F6F3EC" stroke="#57514A" stroke-width="1.2"/>`;
  // LED по внутреннему контуру короба
  b += `<rect x="${bx + 4}" y="${by + 4}" width="${bw - 8}" height="${bl - 8}" fill="none" stroke="#C29A5B" stroke-width="1.4" stroke-dasharray="6 4"/>`;

  // --- ZONE RECTANGLES для умного освещения ---
  if (room.type === 'living-kitchen') {
    const kzH = px(600);
    b += `<rect x="${M}" y="${M}" width="${w}" height="${kzH}" fill="#F0EDE280" stroke="none"/>`;
    b += `<text x="${M + 6}" y="${M + kzH - 5}" font-size="8" fill="#7A756D">Зона 1: кухня</text>`;
  }
  if (room.type === 'bedroom') {
    const hwall = bedWallFor(room);
    const rzD = px(800);
    let rzX = M, rzY = M, rzW = w, rzH = rzD;
    if (hwall === 'C') { rzY = M + l - rzD; }
    else if (hwall === 'B') { rzX = M + w - rzD; rzW = rzD; rzH = l; }
    else if (hwall === 'D') { rzW = rzD; rzH = l; }
    b += `<rect x="${rzX}" y="${rzY}" width="${rzW}" height="${rzH}" fill="#EFF0F580" stroke="none"/>`;
    b += `<text x="${rzX + 6}" y="${rzY + 14}" font-size="8" fill="#7A756D">Зона 2: чтение</text>`;
  }

  // отметки уровней
  const spotsPx = L.spots.map(sp => ({ x: M + px(sp.x), y: M + px(sp.y) }));
  const nicheBottom = room.windows.some(o => o.wall === 'C'), nicheTop = room.windows.some(o => o.wall === 'A');
  const cands2 = [];
  for (let yy = M + 26; yy <= M + l - 26; yy += 10) for (const xx of [M + 8, M + w - 146]) cands2.push([xx, yy]);
  cands2.sort((a, c) => Math.abs(a[1] - (M + l - 30)) - Math.abs(c[1] - (M + l - 30)));
  const cands2f = cands2.filter(c => !(nicheTop && c[1] < M + 44) && !(nicheBottom && c[1] > M + l - 44));
  const busy = [{ x: bx + bw - 96, y: by + bl - 26, w: 88, h: 16 }];
  const freeRect = (list, bw2, bh) => list.find(c =>
    !spotsPx.some(sp => sp.x > c[0] - 8 && sp.x < c[0] + bw2 + 8 && sp.y > c[1] - 8 && sp.y < c[1] + bh + 8)
    && !busy.some(r => c[0] < r.x + r.w + 6 && c[0] + bw2 > r.x - 6 && c[1] < r.y + r.h + 6 && c[1] + bh > r.y - 6)
  ) || list[0] || [M + 8, M + l - 24];
  const t2 = `2 ур. · короб ${lv.box}`, w2 = t2.length * 5.6 + 14;
  const p2 = freeRect(cands2f.length ? cands2f : cands2, w2, 16);
  let levelPlates = levelPlan(p2[0], p2[1], room.h - drop, t2) + `<g font-size="10" fill="#2E2A26">`;
  levelPlates += `</g>` + levelPlan(bx + bw - 108, by + bl - 26, room.h, '1 ур.');

  // уровень 3 — «парящий остров» с Phase 2 расширениями
  if (lv.three && lv.island) {
    const i = lv.island;
    const ix = M + px(i.x), iy = M + px(i.y), iw = px(i.w), ih = px(i.l);
    b += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="#E0D9C9" stroke="#57514A" stroke-width="1.2"/>`;
    b += `<rect x="${ix + 4}" y="${iy + 4}" width="${iw - 8}" height="${ih - 8}" fill="none" stroke="#C29A5B" stroke-width="1.4" stroke-dasharray="6 4"/>`;
    // дополнительная внутренняя LED-полоса
    b += `<rect x="${ix + 10}" y="${iy + 10}" width="${iw - 20}" height="${ih - 20}" fill="none" stroke="#F5C842" stroke-width="0.9" stroke-dasharray="3 6" opacity="0.65"/>`;
    // размерная стрелка вдоль верхней грани острова
    const arY = iy - 14;
    b += `<g stroke="#57514A" stroke-width="0.8" fill="#57514A">`;
    b += `<line x1="${ix}" y1="${arY}" x2="${ix + iw}" y2="${arY}"/>`;
    b += `<line x1="${ix}" y1="${arY - 3}" x2="${ix}" y2="${arY + 3}"/>`;
    b += `<line x1="${ix + iw}" y1="${arY - 3}" x2="${ix + iw}" y2="${arY + 3}"/>`;
    b += `<text x="${(ix + iw / 2).toFixed(1)}" y="${arY - 2}" font-size="8" text-anchor="middle">${i.w}</text>`;
    b += `</g>`;
    const ic = [[ix, iy - 24], [ix, iy + ih + 8], [ix + iw - 188, iy - 24], [ix + 8, iy + 8]];
    const ip = freeRect(ic, 188, 16);
    busy.push({ x: ip[0], y: ip[1], w: 188, h: 16 });
    islandLabel = levelPlan(ip[0], ip[1], room.h - 2 * drop, '3 ур. · парящий, щель 10');
    islandLabel += `<text x="${(ix + iw / 2).toFixed(1)}" y="${(iy + ih / 2 + 4).toFixed(1)}" font-size="8" fill="#57514A" text-anchor="middle">${i.w}×${i.l} мм, 3 ур.</text>`;
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

  // --- SPOTS с подписями групп ---
  const half = Math.ceil(L.spots.length / 2);
  const isKitchenHallway = room.type === 'kitchen' || room.type === 'hallway';
  for (let si = 0; si < L.spots.length; si++) {
    const s = L.spots[si];
    const scx = M + px(s.x), scy = M + px(s.y);
    b += `<g stroke="#57514A" stroke-width="1"><circle cx="${scx}" cy="${scy}" r="5" fill="#FFF"/><line x1="${scx - 7}" y1="${scy}" x2="${scx + 7}" y2="${scy}"/><line x1="${scx}" y1="${scy - 7}" x2="${scx}" y2="${scy + 7}"/></g>`;
    if (isKitchenHallway) {
      b += `<text x="${scx + 7}" y="${scy - 3}" font-size="6.5" fill="#7A756D">D=90 4000K</text>`;
    }
    if (si === 0 || si === half) {
      const grp = si === 0 ? 1 : 2;
      b += `<text x="${scx + 7}" y="${scy + 8}" font-size="7" fill="#7A756D">GR-${grp}</text>`;
    }
  }

  // --- PENDANT улучшенный (люстра/подвес) ---
  if (L.pendant) {
    const pcx = M + w / 2, pcy = M + l / 2;
    b += `<circle cx="${pcx}" cy="${pcy}" r="13" fill="#F5E14C44" stroke="#2E2A26" stroke-width="1.6"/>`;
    for (let ang = 0; ang < 360; ang += 45) {
      const rad = ang * Math.PI / 180;
      b += `<line x1="${(pcx + 4 * Math.cos(rad)).toFixed(1)}" y1="${(pcy + 4 * Math.sin(rad)).toFixed(1)}" x2="${(pcx + 13 * Math.cos(rad)).toFixed(1)}" y2="${(pcy + 13 * Math.sin(rad)).toFixed(1)}" stroke="#2E2A26" stroke-width="0.8"/>`;
    }
    b += `<circle cx="${pcx}" cy="${pcy}" r="4" fill="#2E2A26"/>`;
    const plabel = (room.type === 'bedroom' || room.type === 'kids') ? 'подвес' : 'люстра';
    b += `<text x="${pcx}" y="${pcy + 24}" font-size="8" fill="#57514A" text-anchor="middle">${plabel}</text>`;
  }

  // --- TRACK улучшенный с насечками ---
  if (L.track) {
    const trX1 = M + px(400), trY = M + px(850), trX2 = M + w - px(400);
    b += `<line x1="${trX1}" y1="${trY}" x2="${trX2}" y2="${trY}" stroke="#2E2A26" stroke-width="3.5"/>`;
    const tLen = trX2 - trX1;
    const notchStep = 80;
    const nCount = Math.max(0, Math.floor(tLen / notchStep));
    for (let ni = 0; ni <= nCount; ni++) {
      const tnx = trX1 + ni * notchStep;
      if (tnx > trX2 + 1) break;
      b += `<line x1="${tnx}" y1="${trY - 7}" x2="${tnx}" y2="${trY + 7}" stroke="#2E2A26" stroke-width="1.2"/>`;
      b += `<circle cx="${tnx}" cy="${trY}" r="3" fill="white" stroke="#2E2A26" stroke-width="0.8"/>`;
    }
    b += `<text x="${trX1}" y="${trY - 10}" font-size="9" fill="#57514A">трек 48В · ${nCount + 1} св.</text>`;
  }

  b += levelPlates + islandLabel;
  b += `<text x="${M - WT}" y="${M - 46}" font-size="16" font-weight="700" fill="#2E2A26">План потолка · ${esc(room.name)}</text>`;
  b += `<text x="${M - WT}" y="${M - 28}" font-size="11" fill="#7A756D">${esc(style.ceiling)} · ${lv.three ? '3 уровня' : '2 уровня'} · перепад ${drop} мм · LED ${lv.ledLen} м.п. · отметки от чистого пола</text>`;
  b += dimH(M, M + w, M + l + 34, String(room.w));
  b += dimV(M + w + 34, M, M + l, String(room.l));

  const ly = M + l + 56;
  const totalW = L.spots.length * 7 + (L.pendant ? 40 : 0) + Math.round(lv.ledLen * 5);
  const numGrps = L.spots.length > 0 ? 2 : 1;

  // --- ЛЕГЕНДА (2 строки) ---
  b += `<g font-size="10" fill="#57514A">`;
  // строка 1: светильники
  b += `<circle cx="${M + 6}" cy="${ly - 3}" r="5" fill="#FFF" stroke="#57514A"/><text x="${M + 18}" y="${ly}">точечный — ${L.spots.length} шт.</text>`;
  if (L.pendant) {
    b += `<circle cx="${M + 146}" cy="${ly - 3}" r="6" fill="#F5E14C44" stroke="#2E2A26" stroke-width="1.4"/>`;
    b += `<circle cx="${M + 146}" cy="${ly - 3}" r="2" fill="#2E2A26"/>`;
    b += `<text x="${M + 158}" y="${ly}">подвес — 1</text>`;
  }
  if (L.track) b += `<line x1="${M + 260}" y1="${ly - 4}" x2="${M + 290}" y2="${ly - 4}" stroke="#2E2A26" stroke-width="3.5"/><text x="${M + 298}" y="${ly}">трек — 1</text>`;
  b += `<line x1="${M + 380}" y1="${ly - 4}" x2="${M + 412}" y2="${ly - 4}" stroke="#C29A5B" stroke-width="1.4" stroke-dasharray="6 4"/><text x="${M + 420}" y="${ly}">LED 3000K скрытая — ${lv.ledLen} м.п.</text>`;
  // строка 2: диммер + мощность
  b += `<circle cx="${M + 6}" cy="${ly + 17}" r="7" fill="none" stroke="#57514A" stroke-width="1"/>`;
  b += `<text x="${M + 6}" y="${ly + 21}" font-size="8" text-anchor="middle" fill="#57514A">D</text>`;
  b += `<text x="${M + 18}" y="${ly + 22}">диммер — все группы GR-1…GR-${numGrps}</text>`;
  b += `<text x="${M + 300}" y="${ly + 22}" font-weight="600" fill="#2E2A26">≈ ${totalW} Вт</text>`;
  b += `</g>`;

  b += `<text x="${M - WT}" y="${ly + 38}" font-size="9" fill="#8A8478">Короб 2-го уровня: ГКЛ 12,5 по каркасу ПП 60×27 шаг 600 · LED-полка 100, бортик 50, зазор 70 (узел — лист «Узел А») · закладные под подвесные светильники</text>`;
  b += `<text x="${M - WT}" y="${ly + 52}" font-size="8.5" fill="#8A8478">все группы на диммерах Schneider Sedna / Legrand Valena Life</text>`;
  b += `<text x="${M - WT}" y="${ly + 66}" font-size="8.5" fill="#8A8478">Умный дом: группы 1–${numGrps} на диммерах, управление через Яндекс Алиса / Tuya. Цветовая температура: споты 2700К, подсветка 3000К, кухня 4000К.</text>`;
  b += stamp(M - WT, l + M * 2 + 155, w + 2 * WT + 40, `Потолок. ${room.name}`, sheet);
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
  // Отметки уровня знаком по ГОСТ (разрез) + обратная ссылка на лист, откуда вынесен узел
  b += levelMark(X - 30, y1, BASE_H, -1, { shelf: 52 });
  b += levelMark(X - 30, y2 + q(12.5), BASE_H - 120, -1, { shelf: 52 });
  b += `<text x="${X}" y="${y2 + q(12.5) + 52}" font-size="9.5" fill="#57514A">Узел вынесен с плана потолков — см. лист «План потолков» (раздел 01) и планы потолков помещений (раздел 05).</text>`;
  b += stamp(X, y2 + q(12.5) + 60, q(1400), 'Узел А. Короб с LED', sheet, '1:20');
  return svgDoc(Math.max(790, q(1400) + M * 2), y2 + q(12.5) + 130 + M, b);
}

// ---------- план электрики ----------
function drawElectro(room, sheet) {
  const M = 90, WT = 12, w = px(room.w), l = px(room.l);
  const Wd = Math.max(760, w + M * 2 + 60), Hd = l + M * 2 + 210;
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
  // — Row 1: socket · switch · слаботочная · IP44 ———————————————————
  b += `<g font-size="9.5" fill="#57514A">`;
  b += `<circle cx="${M+6}" cy="${ly-3}" r="6" fill="#FFF" stroke="#2E2A26" stroke-width="1.4"/>`;
  b += `<line x1="${M}" y1="${ly-11}" x2="${M+12}" y2="${ly-11}" stroke="#2E2A26" stroke-width="1.4"/>`;
  b += `<line x1="${M-2}" y1="${ly-14}" x2="${M+14}" y2="${ly-14}" stroke="#2E2A26" stroke-width="1.4"/>`;
  b += `<text x="${M+18}" y="${ly}">розетка (блок)</text>`;
  b += `<circle cx="${M+148}" cy="${ly-3}" r="5" fill="#2E2A26"/>`;
  b += `<line x1="${M+148}" y1="${ly-8}" x2="${M+155}" y2="${ly-15}" stroke="#2E2A26" stroke-width="1.4"/>`;
  b += `<line x1="${M+155}" y1="${ly-15}" x2="${M+160}" y2="${ly-12}" stroke="#2E2A26" stroke-width="1.4"/>`;
  b += `<text x="${M+166}" y="${ly}">выключатель</text>`;
  b += `<circle cx="${M+288}" cy="${ly-3}" r="6" fill="#E8F0E8" stroke="#2E2A26" stroke-width="1.2"/>`;
  b += `<text x="${M+288}" y="${ly}" font-size="6" font-weight="700" text-anchor="middle" fill="#27703F">TV</text>`;
  b += `<text x="${M+300}" y="${ly}">слаботочная (TV/LAN)</text>`;
  b += `<circle cx="${M+462}" cy="${ly-3}" r="6" fill="#FFF" stroke="#2E2A26" stroke-width="1.2"/>`;
  b += `<circle cx="${M+462}" cy="${ly-3}" r="9" fill="none" stroke="#2E2A26" stroke-width="0.8"/>`;
  b += `<line x1="${M+456}" y1="${ly-11}" x2="${M+468}" y2="${ly-11}" stroke="#2E2A26" stroke-width="1.4"/>`;
  b += `<text x="${M+476}" y="${ly}">IP44 (влажная зона)</text>`;
  b += `</g>`;
  // — Row 2: проходной · многоклавишный · 16А · стиральная IP44 ———
  const ly2 = ly + 22;
  b += `<g font-size="9.5" fill="#57514A">`;
  b += `<circle cx="${M+6}" cy="${ly2-3}" r="5" fill="#2E2A26"/>`;
  b += `<line x1="${M+6}" y1="${ly2-8}" x2="${M+13}" y2="${ly2-15}" stroke="#2E2A26" stroke-width="1.4"/>`;
  b += `<line x1="${M+13}" y1="${ly2-15}" x2="${M+18}" y2="${ly2-12}" stroke="#2E2A26" stroke-width="1.4"/>`;
  b += `<line x1="${M+8}" y1="${ly2-10}" x2="${M+15}" y2="${ly2-17}" stroke="#2E2A26" stroke-width="1.1"/>`;
  b += `<text x="${M+22}" y="${ly2}">проходной выкл.</text>`;
  b += `<circle cx="${M+148}" cy="${ly2-3}" r="5" fill="#2E2A26"/>`;
  b += `<line x1="${M+148}" y1="${ly2-8}" x2="${M+155}" y2="${ly2-15}" stroke="#2E2A26" stroke-width="1.4"/>`;
  b += `<line x1="${M+155}" y1="${ly2-15}" x2="${M+160}" y2="${ly2-12}" stroke="#2E2A26" stroke-width="1.4"/>`;
  b += `<text x="${M+148}" y="${ly2-11}" font-size="6" font-weight="700" text-anchor="middle" fill="#FFF">N</text>`;
  b += `<text x="${M+166}" y="${ly2}">N-кл. (2/3/4 gang)</text>`;
  b += `<circle cx="${M+312}" cy="${ly2-3}" r="6" fill="#FFF" stroke="#B0483A" stroke-width="1.4"/>`;
  b += `<line x1="${M+306}" y1="${ly2-11}" x2="${M+318}" y2="${ly2-11}" stroke="#B0483A" stroke-width="1.4"/>`;
  b += `<text x="${M+312}" y="${ly2+1}" font-size="5.5" font-weight="700" text-anchor="middle" fill="#B0483A">16</text>`;
  b += `<text x="${M+326}" y="${ly2}">силовая 16А (плита/духовой)</text>`;
  b += `<circle cx="${M+510}" cy="${ly2-3}" r="6" fill="#FFF" stroke="#2E2A26" stroke-width="1.2"/>`;
  b += `<circle cx="${M+510}" cy="${ly2-3}" r="9" fill="none" stroke="#2E2A26" stroke-width="0.8"/>`;
  b += `<text x="${M+510}" y="${ly2+1}" font-size="5" font-weight="700" text-anchor="middle" fill="#2E2A26">IP</text>`;
  b += `<text x="${M+524}" y="${ly2}">стиральная машина IP44</text>`;
  b += `</g>`;
  // — Row 3: smart home types ——————————————————————————————————————
  const ly3 = ly + 44;
  b += `<g font-size="9.5" fill="#57514A">`;
  // PIR sensor — blue diamond
  b += `<polygon points="${M+6},${ly3-10} ${M+12},${ly3-3} ${M+6},${ly3+4} ${M},${ly3-3}" fill="#4A90D9" stroke="#2A5A8A" stroke-width="1.2"/>`;
  b += `<text x="${M+18}" y="${ly3}">датчик движ./влажн.</text>`;
  // Thermostat — blue rectangle
  b += `<rect x="${M+141}" y="${ly3-10}" width="14" height="13" rx="2" fill="#4A90D9" stroke="#2A5A8A" stroke-width="1.2"/>`;
  b += `<line x1="${M+143}" y1="${ly3-5}" x2="${M+153}" y2="${ly3-5}" stroke="#FFF" stroke-width="1"/>`;
  b += `<line x1="${M+143}" y1="${ly3-1}" x2="${M+153}" y2="${ly3-1}" stroke="#FFF" stroke-width="1"/>`;
  b += `<text x="${M+162}" y="${ly3}">термостат (умный)</text>`;
  // Robot vacuum dock — circle with arrow
  b += `<circle cx="${M+300}" cy="${ly3-3}" r="7" fill="none" stroke="#4A90D9" stroke-width="1.5"/>`;
  b += `<line x1="${M+300}" y1="${ly3-9}" x2="${M+300}" y2="${ly3+1}" stroke="#4A90D9" stroke-width="1.5"/>`;
  b += `<polygon points="${M+296},${ly3-1} ${M+300},${ly3+5} ${M+304},${ly3-1}" fill="#4A90D9"/>`;
  b += `<text x="${M+313}" y="${ly3}">база робота-пылесоса</text>`;
  // Smart hub — filled square with antenna
  b += `<rect x="${M+465}" y="${ly3-9}" width="11" height="11" fill="#4A90D9" stroke="#2A5A8A" stroke-width="1.2"/>`;
  b += `<line x1="${M+470}" y1="${ly3-9}" x2="${M+470}" y2="${ly3-15}" stroke="#4A90D9" stroke-width="1.5"/>`;
  b += `<circle cx="${M+470}" cy="${ly3-16}" r="2" fill="#4A90D9"/>`;
  b += `<text x="${M+482}" y="${ly3}">хаб умного дома (скрытый)</text>`;
  b += `</g>`;
  // — Notes —————————————————————————————————————————————————————————
  b += `<text x="${M-WT}" y="${ly3+16}" font-size="8.5" fill="#57514A">В подписи после названия — привязка L/H: расстояние до ближайшей стены / высота установки от чистого пола, мм.</text>`;
  b += `<text x="${M-WT}" y="${ly3+30}" font-size="9.5" font-weight="600" fill="#B0483A">* Розетки — h=300 по умолчанию; 16А (плита/духовой) — h=150; вытяжка — h=2100; фартук — h=1100; отклонения подписаны у позиций.</text>`;
  b += `<text x="${M-WT}" y="${ly3+44}" font-size="9" fill="#8A8478">Санузлы: УЗО 30 мА, IP44 · выключатели ≥100 мм от проёма · умные устройства (синие символы) — 220 В + слаботочный шлейф · привязки уточняются инженерным проектом</text>`;
  b += stamp(M - WT, l + M * 2 + 160, w + 2 * WT + 40, `Электрика. ${room.name}`, sheet);
  return svgDoc(Wd + 20, Hd + 10, b);
}

// ---------- умный дом: список устройств ----------
function smartHomeFor(room) {
  const W = room.w, L = room.l, pts = [];
  const D = (x, y, type, hh, label, extra) => pts.push(Object.assign(
    { x: Math.max(100, Math.min(W - 100, x)), y: Math.max(100, Math.min(L - 100, y)), type, h: hh, label },
    extra || {}
  ));
  const door = room.doors[0] || { wall: 'C', off: 200, w: 900 };
  const dwall = door.wall, doff = door.off, dw = door.w;
  let swx, swy;
  if (dwall === 'A') { swx = doff + dw + 150; swy = 150; }
  else if (dwall === 'C') { swx = doff + dw + 150; swy = L - 150; }
  else if (dwall === 'B') { swx = W - 150; swy = doff + dw + 150; }
  else { swx = 150; swy = doff + dw + 150; }
  D(swx, swy, 'smartswitch', 900, 'умн. выкл.', { gang: 1 });
  // PIR-датчик движения
  D(W * 0.15, L * 0.15, 'sensor', 1800, 'PIR датчик');
  if (W * L > 12e6) D(W * 0.85, L * 0.85, 'sensor', 1800, 'PIR датчик');
  // термостат
  if (['bedroom', 'living', 'kids', 'living-kitchen', 'kitchen', 'cabinet'].includes(room.type)) {
    const thx = room.windows.some(o => o.wall === 'B') ? W * 0.3 : W - 150;
    D(thx, L * 0.5, 'thermostat', 1400, 'термостат');
  }
  // хаб в углу без окон
  const winWalls = new Set(room.windows.map(o => o.wall));
  const freeCorn = [
    !winWalls.has('A') && !winWalls.has('D') ? [W * 0.1, L * 0.1] : null,
    !winWalls.has('A') && !winWalls.has('B') ? [W * 0.9, L * 0.1] : null,
    !winWalls.has('C') && !winWalls.has('D') ? [W * 0.1, L * 0.9] : null,
    !winWalls.has('C') && !winWalls.has('B') ? [W * 0.9, L * 0.9] : null,
  ].filter(Boolean);
  const hc = freeCorn[0] || [W * 0.85, L * 0.5];
  D(hc[0], hc[1], 'hub', 1800, 'smart hub');
  // база пылесоса-робота — в жилых зонах
  if (['living', 'bedroom', 'living-kitchen', 'kids'].includes(room.type)) {
    D(W - 300, L - 200, 'vacuum', 150, 'база пылесоса');
  }
  if (W * L > 15e6) D(W * 0.5, L - 150, 'smartswitch', 900, 'умн. выкл.', { gang: 2 });
  return pts;
}

// ---------- план умного дома ----------
function drawSmartHome(room, sheet) {
  const M = 90, WT = 12, w = px(room.w), l = px(room.l);
  const SPEC_X = M + w + 24, SPEC_W = 280;
  const Wd = Math.max(860, w + M * 2 + SPEC_W + 40), Hd = l + M * 2 + 150;
  const pts = smartHomeFor(room);
  let b = roomWalls(M, WT, room, sheet, CAD.paper);
  for (const o of room.windows) b += openingPlan(o, 'window', M, WT, room);
  for (const o of room.doors) b += openingPlan(o, 'door', M, WT, room);
  // мебель призраком
  for (const f of furnitureFor(room)) b += `<rect x="${M + px(f.x)}" y="${M + px(f.y)}" width="${px(f.w)}" height="${px(f.h)}" fill="none" stroke="#C5BFB2" stroke-width="0.8" rx="2"/>`;
  // символы устройств + подписи
  let labs = '';
  for (const p of pts) {
    const x = M + px(p.x), y = M + px(p.y);
    if (p.type === 'sensor') {
      b += `<path d="M ${x - 8} ${y + 6} L ${x} ${y - 8} L ${x + 8} ${y + 6} Z" fill="#D44B4B" stroke="#A33030" stroke-width="0.8"/>`;
      b += `<text x="${x}" y="${y + 4}" font-size="5.5" font-weight="700" text-anchor="middle" fill="#FFF">PIR</text>`;
    } else if (p.type === 'thermostat') {
      b += `<circle cx="${x}" cy="${y}" r="9" fill="#EBF3FC" stroke="#3A7ABD" stroke-width="1.4"/>`;
      b += `<text x="${x}" y="${y + 4}" font-size="9" font-weight="700" text-anchor="middle" fill="#3A7ABD">T</text>`;
    } else if (p.type === 'vacuum') {
      b += `<circle cx="${x}" cy="${y}" r="9" fill="#27703F" stroke="#1B5030" stroke-width="0.8"/>`;
      b += `<text x="${x}" y="${y + 4}" font-size="9" font-weight="700" text-anchor="middle" fill="#FFF">V</text>`;
      b += `<rect x="${x - 9}" y="${y + 9}" width="18" height="6" rx="2" fill="#27703F" stroke="#1B5030" stroke-width="0.7"/>`;
    } else if (p.type === 'hub') {
      b += `<path d="M ${x} ${y - 11} L ${x + 9} ${y} L ${x} ${y + 11} L ${x - 9} ${y} Z" fill="#E8A000" stroke="#B07500" stroke-width="0.8"/>`;
      b += `<text x="${x}" y="${y + 4}" font-size="8" font-weight="700" text-anchor="middle" fill="#FFF">H</text>`;
    } else if (p.type === 'smartswitch') {
      const gang = p.gang || 1;
      b += `<rect x="${x - 7}" y="${y - 5}" width="14" height="10" rx="2" fill="#2E2A26" stroke="#111" stroke-width="0.7"/>`;
      b += `<text x="${x}" y="${y + 3}" font-size="7" font-weight="700" text-anchor="middle" fill="#FFF">${gang}</text>`;
    }
    const lx2 = x + 13, ly2 = y - 6;
    const txt = `${p.label} · h${p.h}`;
    const tw2 = txt.length * 4.8 + 6;
    labs += `<rect x="${lx2 - 3}" y="${ly2 - 9}" width="${tw2}" height="12" fill="#FBFAF6D9"/>`;
    labs += `<text x="${lx2}" y="${ly2}" font-size="8" fill="#57514A">${esc(txt)}</text>`;
  }
  b += labs;

  // ---- панель спецификации (правая сторона) ----
  const nSensor = pts.filter(p => p.type === 'sensor').length;
  const nTherm  = pts.filter(p => p.type === 'thermostat').length;
  const swPts   = pts.filter(p => p.type === 'smartswitch');
  const nVac    = pts.filter(p => p.type === 'vacuum').length;
  const nHub    = pts.filter(p => p.type === 'hub').length;
  const totalGangs = swPts.reduce((a, p) => a + (p.gang || 1), 0);
  const sx = SPEC_X;
  let ry = M;

  b += `<text x="${sx}" y="${ry + 17}" font-size="14" font-weight="700" fill="#2E2A26">Умный дом · ${esc(room.name)}</text>`;
  b += `<line x1="${sx}" y1="${ry + 24}" x2="${sx + SPEC_W}" y2="${ry + 24}" stroke="#3A7ABD" stroke-width="1.2"/>`;
  ry += 38;

  if (nSensor > 0) {
    b += `<path d="M ${sx + 6} ${ry + 2} L ${sx + 14} ${ry - 10} L ${sx + 22} ${ry + 2} Z" fill="#D44B4B"/>`;
    b += `<text x="${sx + 26}" y="${ry}" font-size="10" fill="#2E2A26">PIR датчик</text>`;
    b += `<text x="${sx + SPEC_W - 60}" y="${ry}" font-size="10" fill="#57514A">${nSensor} шт.</text>`;
    b += `<text x="${sx + SPEC_W - 8}" y="${ry}" font-size="9" fill="#8A8478" text-anchor="end">h=1800</text>`;
    ry += 18;
  }
  if (nTherm > 0) {
    b += `<circle cx="${sx + 12}" cy="${ry - 5}" r="7" fill="#EBF3FC" stroke="#3A7ABD" stroke-width="1.2"/>`;
    b += `<text x="${sx + 12}" y="${ry - 2}" font-size="7" font-weight="700" text-anchor="middle" fill="#3A7ABD">T</text>`;
    b += `<text x="${sx + 26}" y="${ry}" font-size="10" fill="#2E2A26">Термостат</text>`;
    b += `<text x="${sx + SPEC_W - 60}" y="${ry}" font-size="10" fill="#57514A">${nTherm} шт.</text>`;
    b += `<text x="${sx + SPEC_W - 8}" y="${ry}" font-size="9" fill="#8A8478" text-anchor="end">h=1400</text>`;
    ry += 18;
  }
  if (swPts.length > 0) {
    b += `<rect x="${sx + 5}" y="${ry - 10}" width="14" height="10" rx="2" fill="#2E2A26"/>`;
    b += `<text x="${sx + 12}" y="${ry - 2}" font-size="7" font-weight="700" text-anchor="middle" fill="#FFF">${totalGangs}</text>`;
    b += `<text x="${sx + 26}" y="${ry}" font-size="10" fill="#2E2A26">Умная панель (${totalGangs}кл.)</text>`;
    b += `<text x="${sx + SPEC_W - 60}" y="${ry}" font-size="10" fill="#57514A">${swPts.length} шт.</text>`;
    b += `<text x="${sx + SPEC_W - 8}" y="${ry}" font-size="9" fill="#8A8478" text-anchor="end">h=900</text>`;
    ry += 18;
  }
  if (nVac > 0) {
    b += `<circle cx="${sx + 12}" cy="${ry - 5}" r="7" fill="#27703F"/>`;
    b += `<text x="${sx + 12}" y="${ry - 2}" font-size="7" font-weight="700" text-anchor="middle" fill="#FFF">V</text>`;
    b += `<text x="${sx + 26}" y="${ry}" font-size="10" fill="#2E2A26">База пылесоса</text>`;
    b += `<text x="${sx + SPEC_W - 60}" y="${ry}" font-size="10" fill="#57514A">${nVac} шт.</text>`;
    b += `<text x="${sx + SPEC_W - 8}" y="${ry}" font-size="9" fill="#8A8478" text-anchor="end">h=150</text>`;
    ry += 18;
  }
  if (nHub > 0) {
    b += `<path d="M ${sx + 12} ${ry - 12} L ${sx + 20} ${ry - 5} L ${sx + 12} ${ry + 2} L ${sx + 4} ${ry - 5} Z" fill="#E8A000"/>`;
    b += `<text x="${sx + 12}" y="${ry - 2}" font-size="6" font-weight="700" text-anchor="middle" fill="#FFF">H</text>`;
    b += `<text x="${sx + 26}" y="${ry}" font-size="10" fill="#2E2A26">Smart Hub</text>`;
    b += `<text x="${sx + SPEC_W - 60}" y="${ry}" font-size="10" fill="#57514A">${nHub} шт.</text>`;
    b += `<text x="${sx + SPEC_W - 8}" y="${ry}" font-size="9" fill="#8A8478" text-anchor="end">h=1800</text>`;
    ry += 18;
  }

  ry += 8;
  b += `<text x="${sx}" y="${ry}" font-size="11" font-weight="700" fill="#2E2A26">Зоны автоматизации</text>`;
  ry += 8;
  const ZONES = [
    ['#DAEAF833', 'Зона 1: Свет', 'выключатели + диммеры'],
    ['#FFF3CC44', 'Зона 2: Климат', 'термостаты + вентиляция'],
    ['#FDEAEA44', 'Зона 3: Безопасность', 'PIR + датчики'],
    ['#E2F4E944', 'Зона 4: Бытовая техника', 'робот + умные розетки'],
  ];
  for (const [fill, ztitle, zdesc] of ZONES) {
    b += `<rect x="${sx}" y="${ry}" width="${SPEC_W}" height="30" rx="4" fill="${fill}" stroke="#DDD8D0" stroke-width="0.7"/>`;
    b += `<text x="${sx + 8}" y="${ry + 13}" font-size="10" font-weight="700" fill="#2E2A26">${esc(ztitle)}</text>`;
    b += `<text x="${sx + 8}" y="${ry + 26}" font-size="9" fill="#57514A">${esc(zdesc)}</text>`;
    ry += 36;
  }

  ry += 4;
  const NOTES = [
    'Протокол: Zigbee 3.0 / Z-Wave',
    'Хаб: Яндекс Алиса или Tuya Smart Life',
    'Голосовое управление и приложение',
    'Кабель КВВГнг 3×2,5 мм²',
    'Выключатели Schneider Electric Atlas Design',
  ];
  for (const ln of NOTES) {
    b += `<text x="${sx}" y="${ry}" font-size="8.5" fill="#8A8478">${esc(ln)}</text>`;
    ry += 12;
  }

  // легенда снизу плана
  const lyS = M + l + 56;
  b += `<g font-size="10" fill="#57514A">`;
  b += `<path d="M ${M + 6} ${lyS + 2} L ${M + 14} ${lyS - 10} L ${M + 22} ${lyS + 2} Z" fill="#D44B4B"/>`;
  b += `<text x="${M + 28}" y="${lyS}">PIR датчик</text>`;
  b += `<circle cx="${M + 140}" cy="${lyS - 4}" r="7" fill="#EBF3FC" stroke="#3A7ABD" stroke-width="1.2"/>`;
  b += `<text x="${M + 140}" y="${lyS - 1}" font-size="7" font-weight="700" text-anchor="middle" fill="#3A7ABD">T</text>`;
  b += `<text x="${M + 153}" y="${lyS}">Термостат</text>`;
  b += `<circle cx="${M + 254}" cy="${lyS - 4}" r="7" fill="#27703F"/>`;
  b += `<text x="${M + 254}" y="${lyS - 1}" font-size="7" font-weight="700" text-anchor="middle" fill="#FFF">V</text>`;
  b += `<text x="${M + 267}" y="${lyS}">База робота</text>`;
  b += `<path d="M ${M + 380} ${lyS - 11} L ${M + 389} ${lyS - 4} L ${M + 380} ${lyS + 3} L ${M + 371} ${lyS - 4} Z" fill="#E8A000"/>`;
  b += `<text x="${M + 380}" y="${lyS - 1}" font-size="6" font-weight="700" text-anchor="middle" fill="#FFF">H</text>`;
  b += `<text x="${M + 395}" y="${lyS}">Smart Hub</text>`;
  b += `<rect x="${M + 474}" y="${lyS - 11}" width="14" height="10" rx="2" fill="#2E2A26"/>`;
  b += `<text x="${M + 481}" y="${lyS - 3}" font-size="7" font-weight="700" text-anchor="middle" fill="#FFF">N</text>`;
  b += `<text x="${M + 494}" y="${lyS}">Умная панель</text>`;
  b += `</g>`;

  b += dimH(M, M + w, M + l + 34, String(room.w));
  b += dimV(M + w + 34, M, M + l, String(room.l));
  b += `<text x="${M - WT}" y="${M - 46}" font-size="16" font-weight="700" fill="#2E2A26">Умный дом · ${esc(room.name)}</text>`;
  b += `<text x="${M - WT}" y="${M - 28}" font-size="11" fill="#7A756D">Автоматизация: ${pts.length} устройств · Zigbee 3.0 / Z-Wave · высоты от чистого пола, мм</text>`;
  b += stamp(M - WT, l + M * 2 + 100, w + 2 * WT + 40, `Умный дом. ${room.name}`, sheet);
  return svgDoc(Wd + 20, Hd + 10, b);
}

// ---------- слаботочка — точки (TV / LAN / satellite / phone / camera / intercom / speaker) ----------
function slabotochkaFor(room) {
  const W = room.w, L = room.l, pts = [];
  const D = (x, y, type, hh, label) => pts.push({
    x: Math.max(100, Math.min(W - 100, x)),
    y: Math.max(100, Math.min(L - 100, y)),
    type, h: hh, label
  });

  const door  = room.doors[0]  || { wall: 'C', off: 200, w: 900 };
  const dwall = door.wall, doff = door.off, dw = door.w;
  const winWalls = new Set(room.windows.map(o => o.wall));

  switch (room.type) {

    case 'bedroom': {
      const hw = bedWallFor(room);
      if (hw === 'A' || hw === 'C') {
        const yy = hw === 'A' ? 150 : L - 150;
        D(W * 0.5, yy, 'tv', 1100, 'ТВ-розетка');
      } else {
        const xx = hw === 'B' ? W - 150 : 150;
        D(xx, L * 0.5, 'tv', 1100, 'ТВ-розетка');
      }
      D(W * 0.72, L * 0.72, 'lan', 300, 'LAN рабочая');
      if (W * L > 14e6) {
        const cx = dwall === 'A' || dwall === 'C' ? (doff + dw * 0.5) : (W * 0.5);
        const cy = dwall === 'A' ? 150 : dwall === 'C' ? L - 150 : (doff + dw * 0.5);
        D(cx, cy, 'camera', 2200, 'камера');
      }
      break;
    }

    case 'living-kitchen': {
      const tvWall = !winWalls.has('B') ? 'B' : !winWalls.has('D') ? 'D' : 'C';
      if (tvWall === 'B') D(W - 150, L * 0.5, 'tv', 1100, 'ТВ-розетка');
      else if (tvWall === 'D') D(150, L * 0.5, 'tv', 1100, 'ТВ-розетка');
      else D(W * 0.5, L - 150, 'tv', 1100, 'ТВ-розетка');
      D(W * 0.25, L * 0.7, 'lan', 300, 'LAN диван');
      D(W * 0.7,  L * 0.25, 'lan', 300, 'LAN стол');
      const winW = room.windows[0];
      if (winW) {
        if (winW.wall === 'A') D(winW.off + winW.w * 0.5, 150, 'satellite', 300, 'спутник');
        else if (winW.wall === 'C') D(winW.off + winW.w * 0.5, L - 150, 'satellite', 300, 'спутник');
        else if (winW.wall === 'B') D(W - 150, winW.off + winW.w * 0.5, 'satellite', 300, 'спутник');
        else D(150, winW.off + winW.w * 0.5, 'satellite', 300, 'спутник');
      }
      break;
    }

    case 'living': {
      const tvWall = !winWalls.has('B') ? 'B' : !winWalls.has('D') ? 'D' : 'C';
      if (tvWall === 'B') D(W - 150, L * 0.5, 'tv', 1100, 'ТВ-розетка');
      else if (tvWall === 'D') D(150, L * 0.5, 'tv', 1100, 'ТВ-розетка');
      else D(W * 0.5, L - 150, 'tv', 1100, 'ТВ-розетка');
      D(W * 0.3, L * 0.6, 'lan', 300, 'LAN диван');
      D(W * 0.65, L * 0.3, 'lan', 300, 'LAN стол');
      break;
    }

    case 'kitchen': {
      D(W * 0.6, L * 0.4, 'lan', 1100, 'LAN кухня');
      break;
    }

    case 'hallway': {
      let ix, iy;
      if (dwall === 'A') { ix = doff + dw + 150; iy = 150; }
      else if (dwall === 'C') { ix = doff + dw + 150; iy = L - 150; }
      else if (dwall === 'B') { ix = W - 150; iy = doff + dw + 150; }
      else { ix = 150; iy = doff + dw + 150; }
      D(ix, iy, 'intercom', 1400, 'домофон');
      D(dwall === 'A' ? doff + dw * 0.5 : dwall === 'C' ? doff + dw * 0.5 : dwall === 'B' ? W - 150 : 150,
        dwall === 'A' ? 150 : dwall === 'C' ? L - 150 : doff + dw * 0.5,
        'camera', 2200, 'камера');
      D(W * 0.5, L * 0.5, 'lan', 1800, 'LAN патч-панель');
      break;
    }

    case 'bathroom': {
      let bx = 150, by = 150;
      if (dwall === 'A') { bx = doff + dw + 100; by = 150; }
      else if (dwall === 'C') { bx = doff + dw + 100; by = L - 150; }
      else if (dwall === 'B') { bx = W - 150; by = doff + dw + 100; }
      else { bx = 150; by = doff + dw + 100; }
      D(bx, by, 'speaker', 1600, 'динамик');
      break;
    }

    case 'kids': {
      const hw = bedWallFor(room);
      const yy = (hw === 'A') ? 150 : (hw === 'C') ? L - 150 : L * 0.5;
      const xx = (hw === 'B') ? W - 150 : (hw === 'D') ? 150 : W * 0.5;
      D(hw === 'A' || hw === 'C' ? W * 0.5 : xx,
        hw === 'A' || hw === 'C' ? yy : L * 0.5,
        'tv', 1100, 'ТВ-розетка');
      D(W * 0.7, L * 0.65, 'lan', 300, 'LAN рабочая');
      break;
    }

    default: {
      D(W * 0.5, L * 0.5, 'lan', 300, 'LAN');
      break;
    }
  }

  return pts;
}

// ---------- план слаботочки ----------
function drawSlabotochka(room, sheet) {
  const M = 90, WT = 12, w = px(room.w), l = px(room.l);
  const SPEC_X = M + w + 24, SPEC_W = 280;
  const Wd = Math.max(860, w + M * 2 + SPEC_W + 40), Hd = l + M * 2 + 150;
  const pts = slabotochkaFor(room);
  let b = roomWalls(M, WT, room, sheet, CAD.paper);
  for (const o of room.windows) b += openingPlan(o, 'window', M, WT, room);
  for (const o of room.doors)   b += openingPlan(o, 'door',   M, WT, room);
  // мебель призраком
  for (const f of furnitureFor(room))
    b += `<rect x="${M + px(f.x)}" y="${M + px(f.y)}" width="${px(f.w)}" height="${px(f.h)}" fill="none" stroke="#C5BFB2" stroke-width="0.8" rx="2"/>`;

  // ---- SVG-символы + подписи ----
  let labs = '';
  for (const p of pts) {
    const x = M + px(p.x), y = M + px(p.y);

    if (p.type === 'tv') {
      b += `<rect x="${x - 6}" y="${y}" width="12" height="8" rx="1" fill="white" stroke="#2E4A8A" stroke-width="1.2"/>`;
      b += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 6}" stroke="#2E4A8A" stroke-width="1"/>`;
      b += `<line x1="${x - 4}" y1="${y - 6}" x2="${x + 4}" y2="${y - 6}" stroke="#2E4A8A" stroke-width="1"/>`;
    } else if (p.type === 'lan') {
      b += `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" rx="1" fill="#E8F4E8" stroke="#2E8A4A" stroke-width="1.2"/>`;
      b += `<line x1="${x - 5}" y1="${y}" x2="${x + 5}" y2="${y}" stroke="#2E8A4A" stroke-width="0.8"/>`;
      b += `<line x1="${x}" y1="${y - 5}" x2="${x}" y2="${y + 5}" stroke="#2E8A4A" stroke-width="0.8"/>`;
    } else if (p.type === 'camera') {
      b += `<path d="M ${x - 6} ${y - 7} L ${x + 6} ${y - 7} L ${x} ${y - 13} Z" fill="#8A8A8A" stroke="#555" stroke-width="0.7"/>`;
      b += `<circle cx="${x}" cy="${y}" r="7" fill="#2E2A26" stroke="#8A8A8A" stroke-width="1"/>`;
      b += `<circle cx="${x}" cy="${y}" r="3" fill="none" stroke="#AAAAAA" stroke-width="1"/>`;
    } else if (p.type === 'intercom') {
      b += `<rect x="${x - 5}" y="${y - 7}" width="10" height="14" rx="2.5" fill="#3A6A8A" stroke="#1A4A6A" stroke-width="1.2"/>`;
      b += `<line x1="${x - 4}" y1="${y}" x2="${x + 4}" y2="${y}" stroke="#AACCE8" stroke-width="1"/>`;
    } else if (p.type === 'speaker') {
      b += `<path d="M ${x} ${y - 8} L ${x + 6} ${y + 5} Q ${x} ${y + 9} ${x - 6} ${y + 5} Z" fill="#8A5A2A" stroke="#6A3A1A" stroke-width="1"/>`;
    } else if (p.type === 'satellite') {
      b += `<circle cx="${x}" cy="${y}" r="7" fill="#C0C0C0" stroke="#808080" stroke-width="1"/>`;
      b += `<line x1="${x - 5}" y1="${y - 5}" x2="${x + 5}" y2="${y + 5}" stroke="#808080" stroke-width="0.8"/>`;
      b += `<line x1="${x - 5}" y1="${y + 5}" x2="${x + 5}" y2="${y - 5}" stroke="#808080" stroke-width="0.8"/>`;
    } else if (p.type === 'phone') {
      b += `<path d="M ${x - 5} ${y - 6} C ${x - 5} ${y - 10} ${x + 5} ${y - 10} ${x + 5} ${y - 6} L ${x + 5} ${y + 6} C ${x + 5} ${y + 10} ${x - 5} ${y + 10} ${x - 5} ${y + 6} Z" fill="#4A8A4A" stroke="#2A5A2A" stroke-width="0.8"/>`;
    }

    // подпись с белой плашкой
    const lx2 = x + 13, ly2 = y - 6;
    const txt = `${p.label} · h${p.h}`;
    const tw2 = txt.length * 4.8 + 6;
    labs += `<rect x="${lx2 - 3}" y="${ly2 - 9}" width="${tw2}" height="12" fill="#FBFAF6D9"/>`;
    labs += `<text x="${lx2}" y="${ly2}" font-size="8" fill="#57514A">${esc(txt)}</text>`;
  }
  b += labs;

  // ---- правая панель спецификации ----
  const nTV       = pts.filter(p => p.type === 'tv').length;
  const nLAN      = pts.filter(p => p.type === 'lan').length;
  const nCamera   = pts.filter(p => p.type === 'camera').length;
  const nIntercom = pts.filter(p => p.type === 'intercom').length;
  const nSpeaker  = pts.filter(p => p.type === 'speaker').length;
  const nSatellite= pts.filter(p => p.type === 'satellite').length;
  const nPhone    = pts.filter(p => p.type === 'phone').length;
  const sx = SPEC_X;
  let ry = M;

  b += `<text x="${sx}" y="${ry + 17}" font-size="14" font-weight="700" fill="#2E2A26">Слаботочка · ${esc(room.name)}</text>`;
  b += `<line x1="${sx}" y1="${ry + 24}" x2="${sx + SPEC_W}" y2="${ry + 24}" stroke="#2E4A8A" stroke-width="1.2"/>`;
  ry += 38;
  // Условные обозначения слаботочки (ГОСТ 21.210 — символы электрооборудования на планах).
  // Без них лист читается наугад: точки отличаются только буквой внутри.
  b += flatLegendBox(sx, ry, SPEC_W, 'Условные обозначения', [
    { sym: (px2, py2) => `<g stroke="#2E4A8A" fill="#FFF" stroke-width="1"><rect x="${px2}" y="${py2 - 9}" width="13" height="13" rx="2"/><text x="${px2 + 6.5}" y="${py2 + 1}" font-size="7" text-anchor="middle" fill="#2E4A8A" stroke="none">TV</text></g>`, text: 'ТВ-розетка, h=1100 (за ТВ-панелью — в нише)' },
    { sym: (px2, py2) => `<g stroke="#2E4A8A" fill="#FFF" stroke-width="1"><rect x="${px2}" y="${py2 - 9}" width="13" height="13" rx="2"/><text x="${px2 + 6.5}" y="${py2 + 1}" font-size="6.5" text-anchor="middle" fill="#2E4A8A" stroke="none">LAN</text></g>`, text: 'розетка LAN (UTP Cat.6), h=300' },
    { sym: (px2, py2) => `<g stroke="#2E4A8A" fill="none" stroke-width="1"><circle cx="${px2 + 6.5}" cy="${py2 - 3}" r="6"/><path d="M ${px2 + 3} ${py2 - 3} L ${px2 + 10} ${py2 - 3}"/></g>`, text: 'точка Wi-Fi / камера PoE, h=2200' },
    { sym: (px2, py2) => `<g stroke="#2E4A8A" fill="none" stroke-width="1" stroke-dasharray="4 2"><line x1="${px2}" y1="${py2 - 3}" x2="${px2 + 16}" y2="${py2 - 3}"/></g>`, text: 'трасса слаботочного кабеля (отдельно от силовых, ≥ 100 мм)' },
    { sym: (px2, py2) => `<g stroke="#8A8A50" fill="#F4F0E8" stroke-width="0.9"><rect x="${px2}" y="${py2 - 10}" width="16" height="14"/></g>`, text: 'мультимедиа-щиток, ниша 400×400, h=1500' },
  ]);
  ry += 5 * 22 + 40;

  const specRows = [
    nTV       > 0 ? ['tv',       'ТВ-розетка',         nTV,       1100] : null,
    nLAN      > 0 ? ['lan',      'LAN (UTP Cat.6)',     nLAN,      300 ] : null,
    nCamera   > 0 ? ['camera',   'Камера PoE',          nCamera,   2200] : null,
    nIntercom > 0 ? ['intercom', 'Домофон/переговор.',  nIntercom, 1400] : null,
    nSpeaker  > 0 ? ['speaker',  'Динамик',             nSpeaker,  1600] : null,
    nSatellite> 0 ? ['satellite','Спутник',              nSatellite, 300] : null,
    nPhone    > 0 ? ['phone',    'Телефон',              nPhone,    800 ] : null,
  ].filter(Boolean);

  for (const [type, label, cnt, hh] of specRows) {
    if (type === 'tv') {
      b += `<rect x="${sx + 1}" y="${ry - 10}" width="12" height="8" rx="1" fill="white" stroke="#2E4A8A" stroke-width="1"/>`;
      b += `<line x1="${sx + 7}" y1="${ry - 10}" x2="${sx + 7}" y2="${ry - 14}" stroke="#2E4A8A" stroke-width="0.9"/>`;
      b += `<line x1="${sx + 4}" y1="${ry - 14}" x2="${sx + 10}" y2="${ry - 14}" stroke="#2E4A8A" stroke-width="0.9"/>`;
    } else if (type === 'lan') {
      b += `<rect x="${sx + 2}" y="${ry - 10}" width="10" height="10" rx="1" fill="#E8F4E8" stroke="#2E8A4A" stroke-width="1"/>`;
      b += `<line x1="${sx + 2}" y1="${ry - 5}" x2="${sx + 12}" y2="${ry - 5}" stroke="#2E8A4A" stroke-width="0.7"/>`;
      b += `<line x1="${sx + 7}" y1="${ry - 10}" x2="${sx + 7}" y2="${ry}" stroke="#2E8A4A" stroke-width="0.7"/>`;
    } else if (type === 'camera') {
      b += `<circle cx="${sx + 7}" cy="${ry - 5}" r="6" fill="#2E2A26" stroke="#8A8A8A" stroke-width="0.8"/>`;
      b += `<circle cx="${sx + 7}" cy="${ry - 5}" r="2.5" fill="none" stroke="#AAA" stroke-width="0.7"/>`;
    } else if (type === 'intercom') {
      b += `<rect x="${sx + 2}" y="${ry - 12}" width="10" height="14" rx="2" fill="#3A6A8A" stroke="#1A4A6A" stroke-width="0.9"/>`;
      b += `<line x1="${sx + 3}" y1="${ry - 5}" x2="${sx + 11}" y2="${ry - 5}" stroke="#AACCE8" stroke-width="0.9"/>`;
    } else if (type === 'speaker') {
      b += `<path d="M ${sx + 7} ${ry - 12} L ${sx + 13} ${ry + 1} Q ${sx + 7} ${ry + 5} ${sx + 1} ${ry + 1} Z" fill="#8A5A2A" stroke="#6A3A1A" stroke-width="0.8"/>`;
    } else if (type === 'satellite') {
      b += `<circle cx="${sx + 7}" cy="${ry - 5}" r="6" fill="#C0C0C0" stroke="#808080" stroke-width="0.8"/>`;
      b += `<line x1="${sx + 2}" y1="${ry - 10}" x2="${sx + 12}" y2="${ry}" stroke="#808080" stroke-width="0.7"/>`;
    } else if (type === 'phone') {
      b += `<path d="M ${sx + 2} ${ry - 11} C ${sx + 2} ${ry - 15} ${sx + 12} ${ry - 15} ${sx + 12} ${ry - 11} L ${sx + 12} ${ry - 1} C ${sx + 12} ${ry + 3} ${sx + 2} ${ry + 3} ${sx + 2} ${ry - 1} Z" fill="#4A8A4A" stroke="#2A5A2A" stroke-width="0.7"/>`;
    }
    b += `<text x="${sx + 22}" y="${ry}" font-size="10" fill="#2E2A26">${esc(label)}</text>`;
    b += `<text x="${sx + SPEC_W - 60}" y="${ry}" font-size="10" fill="#57514A">${cnt} шт.</text>`;
    b += `<text x="${sx + SPEC_W - 8}" y="${ry}" font-size="9" fill="#8A8478" text-anchor="end">h=${hh}</text>`;
    ry += 20;
    b += `<line x1="${sx}" y1="${ry - 6}" x2="${sx + SPEC_W}" y2="${ry - 6}" stroke="#EDEBE4" stroke-width="0.6"/>`;
  }

  // кабельное расписание
  ry += 8;
  b += `<text x="${sx}" y="${ry}" font-size="11" font-weight="700" fill="#2E2A26">Кабельное расписание</text>`;
  b += `<line x1="${sx}" y1="${ry + 5}" x2="${sx + SPEC_W}" y2="${ry + 5}" stroke="#D8D2C6" stroke-width="0.8"/>`;
  ry += 18;
  const cableNotes = ['Кабель ТВ: RG-6/U', 'LAN: UTP Cat.6', 'Трасса: гофра ПВХ 16 мм'];
  for (const ln of cableNotes) {
    b += `<text x="${sx}" y="${ry}" font-size="9.5" fill="#57514A">${esc(ln)}</text>`;
    ry += 14;
  }

  // блок СЩ
  ry += 6;
  b += `<rect x="${sx}" y="${ry}" width="${SPEC_W}" height="38" rx="4" fill="#EAF0F8" stroke="#2E4A8A" stroke-width="0.8"/>`;
  b += `<text x="${sx + 6}" y="${ry + 14}" font-size="9.5" font-weight="700" fill="#2E4A8A">Слаботочный щит (СЩ)</text>`;
  b += `<text x="${sx + 6}" y="${ry + 27}" font-size="8.5" fill="#57514A">Шкаф настенный 9U, 600×450</text>`;
  b += `<text x="${sx + 6}" y="${ry + 38}" font-size="8" fill="#8A8478">Место: кладовая / прихожая</text>`;
  ry += 52;

  if (nCamera > 0) {
    b += `<rect x="${sx}" y="${ry}" width="${SPEC_W}" height="30" rx="4" fill="#F4F0E8" stroke="#8A8A50" stroke-width="0.7"/>`;
    b += `<text x="${sx + 6}" y="${ry + 13}" font-size="9" font-weight="700" fill="#57514A">Камеры PoE</text>`;
    b += `<text x="${sx + 6}" y="${ry + 26}" font-size="8.5" fill="#7A7560">Питание по LAN, отдельный БП не нужен</text>`;
    ry += 44;
  }

  // легенда снизу плана
  const lyS = M + l + 56;
  b += `<g font-size="10" fill="#57514A">`;
  b += `<rect x="${M + 1}" y="${lyS - 8}" width="12" height="8" rx="1" fill="white" stroke="#2E4A8A" stroke-width="1"/>`;
  b += `<text x="${M + 18}" y="${lyS}">ТВ-розетка</text>`;
  b += `<rect x="${M + 100}" y="${lyS - 8}" width="10" height="10" rx="1" fill="#E8F4E8" stroke="#2E8A4A" stroke-width="1"/>`;
  b += `<text x="${M + 116}" y="${lyS}">LAN</text>`;
  b += `<circle cx="${M + 175}" cy="${lyS - 3}" r="6" fill="#2E2A26" stroke="#8A8A8A" stroke-width="0.8"/>`;
  b += `<text x="${M + 186}" y="${lyS}">Камера</text>`;
  b += `<rect x="${M + 255}" y="${lyS - 10}" width="10" height="14" rx="2" fill="#3A6A8A" stroke="#1A4A6A" stroke-width="0.8"/>`;
  b += `<text x="${M + 270}" y="${lyS}">Домофон</text>`;
  b += `<circle cx="${M + 358}" cy="${lyS - 3}" r="6" fill="#C0C0C0" stroke="#808080" stroke-width="0.8"/>`;
  b += `<text x="${M + 369}" y="${lyS}">Спутник</text>`;
  b += `<path d="M ${M + 440} ${lyS - 10} L ${M + 447} ${lyS + 2} Q ${M + 440} ${lyS + 6} ${M + 433} ${lyS + 2} Z" fill="#8A5A2A" stroke="#6A3A1A" stroke-width="0.8"/>`;
  b += `<text x="${M + 452}" y="${lyS}">Динамик</text>`;
  b += `</g>`;

  b += dimH(M, M + w, M + l + 34, String(room.w));
  b += dimV(M + w + 34, M, M + l, String(room.l));
  b += `<text x="${M - WT}" y="${M - 46}" font-size="16" font-weight="700" fill="#2E2A26">Слаботочка · ${esc(room.name)}</text>`;
  b += `<text x="${M - WT}" y="${M - 28}" font-size="11" fill="#7A756D">TV / LAN / камеры / домофон · ${pts.length} точек · высоты от чистого пола, мм</text>`;
  b += stamp(M - WT, l + M * 2 + 100, w + 2 * WT + 40, `Слаботочка. ${room.name}`, sheet);
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
function autoLayout(level) {
  const INT = 150; // перегородка между помещениями, мм
  const order = rooms.filter(r => (r.level || 1) === (level || 1)).sort((a, b) => {
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
  const maxY = Math.max(...order.map(o => o.pos.y + o.l));
  for (const r of order) {
    for (const o of r.windows) {
      const top = r.pos.y === 0, bottom = Math.abs(r.pos.y + r.l - maxY) < 1;
      o.wall = top ? 'A' : bottom ? 'C' : (r.pos.x === 0 ? 'D' : 'B');
      const wallLen = (o.wall === 'A' || o.wall === 'C') ? r.w : r.l;
      o.off = Math.max(200, Math.min(o.off, wallLen - o.w - 200));
    }
  }
  return true;
}
if (rooms.length && rooms.some(r => !r.pos)) for (const lv of [...new Set(rooms.map(r => r.level || 1))]) autoLayout(lv);
const allFlatRooms = rooms.filter(r => r.pos);
const LEVELS = [...new Set(rooms.map(r => r.level || 1))].sort((a, b) => a - b);
const LEVEL_NAME = lv => LEVELS.length > 1 ? ` · ${lv} этаж` : '';
let flatRooms = [];   // помещения текущего этажа
let FLAT = null;      // габарит текущего этажа
function setLevel(lv) {
  flatRooms = allFlatRooms.filter(r => (r.level || 1) === lv);
  if (!flatRooms.length || allFlatRooms.length !== rooms.length) { FLAT = null; return; }
  FLAT = {
    x0: Math.min(...flatRooms.map(r => r.pos.x)), y0: Math.min(...flatRooms.map(r => r.pos.y)),
    x1: Math.max(...flatRooms.map(r => r.pos.x + r.w)), y1: Math.max(...flatRooms.map(r => r.pos.y + r.l)), level: lv
  };
  FLAT.W = FLAT.x1 - FLAT.x0; FLAT.H = FLAT.y1 - FLAT.y0;
}
setLevel(LEVELS[0]);
const EXT = 200; // наружная стена, мм
const BASE_H = rooms.length ? rooms[0].h : 2700; // высота потолка объекта, мм

function flatLayer(MX, MY, opts) {
  opts = opts || {};
  const pale = !!opts.pale; // тематический лист: подложка приглушена, акцент — на активном слое
  const wallF = pale ? '#DFDFDF' : CAD.wallFill, wallS = pale ? '#9A9A9A' : CAD.wallStroke, hatchC = pale ? '#C4C4C4' : CAD.hatch;
  const fx = mm => MX + px(EXT + mm - FLAT.x0);
  const fy = mm => MY + px(EXT + mm - FLAT.y0);
  const bx = MX, by = MY, bw2 = px(FLAT.W + 2 * EXT), bh2 = px(FLAT.H + 2 * EXT);
  // стены: серая заливка + чёрный контур; наружная полоса — с диагональной штриховкой
  let s = `<defs><pattern id="wh${opts.id || 0}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="${wallF}"/><line x1="0" y1="0" x2="0" y2="7" stroke="${hatchC}" stroke-width="2"/></pattern></defs>`;
  s += `<rect x="${bx}" y="${by}" width="${bw2}" height="${bh2}" fill="url(#wh${opts.id || 0})" stroke="${wallS}" stroke-width="${pale ? 1 : 1.6}"/>`;
  // внутренняя зона (перегородки без штриховки — ровный серый)
  s += `<rect x="${fx(FLAT.x0)}" y="${fy(FLAT.y0)}" width="${px(FLAT.W)}" height="${px(FLAT.H)}" fill="${wallF}"/>`;
  for (const r of flatRooms) s += `<rect x="${fx(r.pos.x)}" y="${fy(r.pos.y)}" width="${px(r.w)}" height="${px(r.l)}" fill="${opts.roomFill || CAD.paper}" stroke="${wallS}" stroke-width="${pale ? 0.8 : 1.1}"/>`;
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

// ---------- выноска по ГОСТ 2.316 ----------
// Точка → наклонная → горизонтальная полка → текст без белой плашки поверх чертежа.
// Раскладчик перебирает 8 направлений и ставит подпись в первое свободное место;
// занятость листа накапливается в ink, поэтому подписи не наезжают ни на графику,
// ни друг на друга. Не нашлось места — зовущий ставит номер позиции и уводит текст
// в ведомость (так делают в рабочих альбомах вместо диагоналей через весь план).
function inkMap() {
  const boxes = [];
  return {
    add: (x, y, w, h) => { boxes.push({ x, y, w, h }); },
    free: (x, y, w, h) => !boxes.some(b => hits({ x, y, w, h }, b)),
    boxes
  };
}
const LEAD_DIRS = [[1, -1], [-1, -1], [1, 1], [-1, 1], [1, -0.45], [-1, -0.45], [1, 0.45], [-1, 0.45]];
function leader(ink, tx, ty, text, opt) {
  opt = opt || {};
  const fs = opt.size || 8.6, tw = String(text).length * fs * 0.55, th = fs * 1.4;
  const arm = opt.arm || 30, shelf = opt.shelf || 30;
  for (const [dx, dy] of LEAD_DIRS) {
    const bx = tx + dx * arm, by = ty + dy * arm;      // конец наклонной
    const ex = bx + Math.sign(dx) * shelf;             // конец полки
    const txx = dx > 0 ? ex + 3 : ex - 3 - tw;
    if (!ink.free(Math.min(tx, txx) - 2, Math.min(ty, by - th) - 2, Math.abs(txx - tx) + tw + 4, Math.abs(by - ty) + th + 4)) continue;
    ink.add(txx - 2, by - th + 2, tw + 4, th);         // занимаем только текст: полки тонкие, пересечение допустимо
    return `<g data-el="leader" stroke="${CAD.callout}" stroke-width="0.6" fill="none"><line x1="${tx}" y1="${ty}" x2="${bx}" y2="${by}"/><line x1="${bx}" y1="${by}" x2="${ex}" y2="${by}"/></g>`
      + `<circle cx="${tx}" cy="${ty}" r="1.6" fill="${CAD.callout}" stroke="none"/>`
      + `<text x="${txx}" y="${by - 3}" font-size="${fs}" fill="${CAD.callout}">${esc(text)}</text>`;
  }
  return null;
}

// значимые для спецификации предметы: по ним идёт нумерация позиций на плане мебели
const FURN_POS_KEYS = new Set(['bed', 'kidbed', 'sofa', 'armchair', 'wardrobe', 'kitchen', 'kitchen_ext', 'table', 'dining', 'desk', 'tv', 'bath', 'shower', 'wc', 'sink', 'washer', 'fridge', 'shelf', 'nightstand', 'coffee', 'stairs']);
function furnPositions() {
  const out = []; let n = 0;
  for (const r of flatRooms) for (const f of furnitureFor(r)) {
    if (!FURN_POS_KEYS.has(f.key)) continue;
    out.push({ n: ++n, r, f });
  }
  return out;
}

// выноска-плашка с линией-указкой (стандарт рабочих альбомов)
function callout(tx, ty, px2, py2, text) {
  const w = text.length * 5.4 + 12;
  return `<line x1="${px2}" y1="${py2}" x2="${tx + (tx > px2 ? 0 : w)}" y2="${ty + 8}" stroke="${CAD.callout}" stroke-width="0.6"/>
<rect x="${tx}" y="${ty}" width="${w}" height="16" fill="#FFF" stroke="${CAD.callout}" stroke-width="0.8"/>
<text x="${tx + 6}" y="${ty + 11.5}" font-size="8.6" fill="${CAD.callout}">${esc(text)}</text>`;
}

function flatRoomMarks(fx, fy, full) { // номер в кружке (+ имя и площадь на полных)
  let s = '<g data-el="room"></g>';
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
  if (FLAT && FLAT.level && LEVELS.length > 1) title = `${title} · ${FLAT.level} этаж`;
  // тематические листы (слой поверх подложки) рисуются с приглушённой подложкой
  if (/розет|освещен|выключател|схема|пол(ы|ов)|отделк|тёплы|потолк/i.test(title)) lopts = Object.assign({ pale: true }, lopts || {});
  const MX = 70, MY = 74;
  const planW = px(FLAT.W + 2 * EXT), planH = px(FLAT.H + 2 * EXT);
  const LGX = MX + planW + 76, LGW = 268;
  const Wd = LGX + LGW + 26;
  const base = flatLayer(MX, MY, Object.assign({ id: sheetNo }, lopts || {}));
  let b = base.s + layerFn(base);
  b += rightFn(LGX, MY, LGW);
  let ny = MY + planH + 62;
  b += `<g data-el="notes"></g><text x="${MX}" y="${ny - 22}" font-size="10" font-weight="700" fill="#2E2A26">Примечания:</text>`;
  notes.forEach((n, i) => { b += `<text x="${MX}" y="${ny - 8 + i * 14}" font-size="9" fill="#57514A">${i + 1}. ${esc(n)}</text>`; });
  const stY = ny - 16 + notes.length * 14 + 10;
  b += `<text x="${MX}" y="${MY - 52}" font-size="17" font-weight="700" fill="#2E2A26">${esc(title)}</text>`;
  b += `<text x="${MX}" y="${MY - 34}" font-size="11" fill="#7A756D">${esc(sub)}</text>`;
  b += flatStamp(Wd - 26 - 560, stY, 560, title, sheetNo);
  const Hd = stY + 56 + 26;
  // рамку листа рисует svgDoc (ГОСТ 2.301 + поле подшивки) — вторая здесь была лишней
  return svgDoc(Wd, Hd, b, CAD.paper);
}

function flatLegendBox(x, y, w, title, rows) { // rows: [{sym, text}] sym = функция (sx, sy) => svg
  // высота строки зависит от числа переносов — многострочные записи не наезжают на соседние
  const wrapped = rows.map(r0 => wrapText(r0.text, 40));
  const heights = wrapped.map(ls => Math.max(20, ls.length * 11 + 8));
  const total = heights.reduce((a, b) => a + b, 0);
  let s = `<g data-el="legend"><rect x="${x}" y="${y}" width="${w}" height="${total + 30}" fill="none" stroke="#8A8478" stroke-width="0.8"/>`;
  s += `<text x="${x + 10}" y="${y + 18}" font-size="10.5" font-weight="700" fill="#2E2A26">${esc(title)}</text>`;
  let sy = y + 34;
  rows.forEach((r0, i) => {
    s += r0.sym(x + 12, sy);
    wrapped[i].forEach((line, j) => { s += `<text x="${x + 38}" y="${sy + 3 + j * 11}" font-size="8.7" fill="#57514A">${esc(line)}</text>`; });
    sy += heights[i];
  });
  return s + '</g>';
}

// 1. Обмерный план квартиры: прострелы по осям + экспликация
function drawFlatObmer(sheetNo) {
  return flatSheet(sheetNo, 'Обмерный план квартиры', `${esc((brief.object && brief.object.address) || '')} · ${totalArea} м² · все размеры в мм`, base => {
    let s = flatRoomMarks(base.fx, base.fy, true);
    // прострел по X (низ) и по Y (право) по всем осям стен
    const xs = [...new Set(flatRooms.flatMap(r => [r.pos.x, r.pos.x + r.w]))].sort((a, b) => a - b);
    const ys = [...new Set(flatRooms.flatMap(r => [r.pos.y, r.pos.y + r.l]))].sort((a, b) => a - b);
    const yb = base.fy(FLAT.y1) + px(EXT) + 26, xr = base.fx(FLAT.x1) + px(EXT) + 26;
    // прострелы по осям стен — замкнутые размерные цепочки (ГОСТ 2.307, 4.13)
    let chX = '', chY = '';
    for (let i = 0; i + 1 < xs.length; i++) if (xs[i + 1] - xs[i] > 60) chX += dimH(base.fx(xs[i]), base.fx(xs[i + 1]), yb, String(xs[i + 1] - xs[i]));
    chX += dimH(base.fx(FLAT.x0) - px(EXT), base.fx(FLAT.x1) + px(EXT), yb + 24, String(FLAT.W + 2 * EXT));
    for (let i = 0; i + 1 < ys.length; i++) if (ys[i + 1] - ys[i] > 60) chY += dimV(xr, base.fy(ys[i]), base.fy(ys[i + 1]), String(ys[i + 1] - ys[i]));
    chY += dimV(xr + 24, base.fy(FLAT.y0) - px(EXT), base.fy(FLAT.y1) + px(EXT), String(FLAT.H + 2 * EXT));
    s += `<g data-el="chain">${chX}</g><g data-el="chain">${chY}</g>`;
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
    // Условные обозначения обмерного плана: без них штриховка наружной стены и дуга
    // открывания читаются наугад (ГОСТ 21.201 — изображения стен, проёмов, дверей)
    s += flatLegendBox(x, ty + 22, w, 'Условные обозначения', [
      { sym: (sx, sy) => `<g stroke="${CAD.wallStroke}" stroke-width="0.9"><rect x="${sx}" y="${sy - 10}" width="17" height="12" fill="${CAD.wallFill}"/><line x1="${sx}" y1="${sy + 2}" x2="${sx + 17}" y2="${sy - 10}" stroke="${CAD.hatch}" stroke-width="1"/></g>`, text: `наружная стена ${EXT} мм, штриховка — существующая конструкция` },
      { sym: (sx, sy) => `<rect x="${sx}" y="${sy - 8}" width="17" height="9" fill="${CAD.wallFill}" stroke="${CAD.wallStroke}" stroke-width="0.9"/>`, text: 'перегородка 150 мм (существующая)' },
      { sym: (sx, sy) => `<g stroke="${CAD.wallStroke}" stroke-width="0.8" fill="none"><rect x="${sx}" y="${sy - 8}" width="17" height="9" fill="${CAD.paper}"/><line x1="${sx}" y1="${sy - 5}" x2="${sx + 17}" y2="${sy - 5}" stroke="${CAD.window}" stroke-width="1.4"/></g>`, text: 'оконный проём: ширина × высота, отметка подоконника' },
      { sym: (sx, sy) => `<g stroke="${CAD.doorArc}" stroke-width="0.9" fill="none"><line x1="${sx}" y1="${sy}" x2="${sx}" y2="${sy - 12}"/><path d="M ${sx} ${sy - 12} A 12 12 0 0 1 ${sx + 12} ${sy}" stroke-dasharray="2 2"/></g>`, text: 'дверной проём, дуга — сторона открывания (ГОСТ 21.201)' },
      { sym: (sx, sy) => `<g stroke="#2A2A2A" stroke-width="0.8" fill="none"><line x1="${sx}" y1="${sy - 4}" x2="${sx + 17}" y2="${sy - 4}"/><line x1="${sx + 1}" y1="${sy - 1}" x2="${sx + 5}" y2="${sy - 7}"/><line x1="${sx + 13}" y1="${sy - 1}" x2="${sx + 17}" y2="${sy - 7}"/></g>`, text: 'размерная цепочка, засечки 45° (ГОСТ 2.307)' },
    ]);
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
    // ---------- позиции и выноски ----------
    // Раньше здесь было 4 выноски-плашки, летевшие диагоналями через всю квартиру
    // («Кровать 1600×2000» через гостиную в спальню). Теперь: каждый предмет получает
    // номер позиции в кружке и строку в спецификации справа, а короткие выноски по ГОСТ
    // остаются для проектных решений — ниш.
    const ink = inkMap();
    // занятость: подписи помещений в центрах и площадь листа под мебелью
    for (const r of flatRooms) {
      ink.add(base.fx(r.pos.x + r.w / 2) - 62, base.fy(r.pos.y + r.l / 2) - 28, 124, 56);
      for (const f of furnitureFor(r)) ink.add(base.fx(r.pos.x + f.x), base.fy(r.pos.y + f.y), px(f.w), px(f.h));
    }
    // ниши — проектное решение, которое клиент должен увидеть на плане, а не в примечании.
    // Ниша задана стеной и смещением по ней (wall + off) — переводим в координаты плана.
    const nichePoint = (r, n) => {
      const c = n.off + n.w / 2, IN = 120;   // точка внутри помещения у соответствующей стены
      if (n.wall === 'A') return { x: r.pos.x + c, y: r.pos.y + IN };
      if (n.wall === 'C') return { x: r.pos.x + c, y: r.pos.y + r.l - IN };
      if (n.wall === 'D') return { x: r.pos.x + IN, y: r.pos.y + c };
      return { x: r.pos.x + r.w - IN, y: r.pos.y + c };
    };
    // контур ниши по стене + марка Нn. Сначала пробуем короткую выноску по ГОСТ;
    // на плотном плане места нет — тогда работает штатный запасной путь: марка на плане,
    // расшифровка в ведомости справа (так делают в рабочих альбомах).
    const nicheRect = (r, nz) => {
      const D = nz.depth || 100;
      if (nz.wall === 'A') return { x: r.pos.x + nz.off, y: r.pos.y, w: nz.w, h: D };
      if (nz.wall === 'C') return { x: r.pos.x + nz.off, y: r.pos.y + r.l - D, w: nz.w, h: D };
      if (nz.wall === 'D') return { x: r.pos.x, y: r.pos.y + nz.off, w: D, h: nz.w };
      return { x: r.pos.x + r.w - D, y: r.pos.y + nz.off, w: D, h: nz.w };
    };
    drawFlatFurniture.niches = [];
    for (const r of flatRooms) for (const nz of nichesFor(r)) {
      const pt = nichePoint(r, nz), rc = nicheRect(r, nz);
      const nx = base.fx(pt.x), ny = base.fy(pt.y);
      if (!isFinite(nx) || !isFinite(ny)) continue;
      const mk = 'Н' + (drawFlatFurniture.niches.length + 1);
      drawFlatFurniture.niches.push({ mk, r, nz });
      s += `<rect x="${base.fx(rc.x)}" y="${base.fy(rc.y)}" width="${px(rc.w)}" height="${px(rc.h)}" fill="none" stroke="${CAD.plumb}" stroke-width="0.8" stroke-dasharray="5 3"/>`;
      const lead = leader(ink, nx, ny, `${mk} · ${nz.label.length > 30 ? nz.label.slice(0, 29) + '…' : nz.label}`, { size: 8 });
      if (lead) { s += lead; continue; }
      s += `<rect x="${nx - 8}" y="${ny - 7}" width="16" height="14" rx="2" fill="#FFFFFFE8" stroke="${CAD.plumb}" stroke-width="0.9"/>`
        + `<text x="${nx}" y="${ny + 3}" font-size="7.6" font-weight="700" text-anchor="middle" fill="${CAD.plumb}">${mk}</text>`;
    }
    // номера позиций: кружок Ø7 мм в центре предмета, поверх контура
    for (const p of furnPositions()) {
      const cx = base.fx(p.r.pos.x + p.f.x + p.f.w / 2), cy = base.fy(p.r.pos.y + p.f.y + p.f.h / 2);
      s += `<rect x="${cx - 7}" y="${cy - 7}" width="14" height="14" rx="2" fill="#FFFFFFE8" stroke="${CAD.furn}" stroke-width="0.9"/>`
        + `<text x="${cx}" y="${cy + 3}" font-size="8" font-weight="700" text-anchor="middle" fill="${CAD.furn}">${p.n}</text>`;
    }
    return s + flatRoomMarks(base.fx, base.fy, true);
  }, (x, y, w) => {
    // Правая колонка: спецификация позиций (номера с плана) + одна фото-врезка-референс.
    // Спецификация связывает кружок на чертеже с наименованием, габаритом и помещением —
    // без неё номера на плане нечитаемы, а мебель не сходится со сметой.
    let s = '';
    const pos = furnPositions();
    const rowH = 12.6, headH = 44;
    const maxRows = Math.max(6, Math.floor((px(FLAT.H + 2 * EXT) - 210 - headH) / rowH));
    const shown = pos.slice(0, maxRows);
    const tblH = headH + shown.length * rowH + (pos.length > shown.length ? rowH : 0) + 8;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${tblH}" fill="none" stroke="#8A8478" stroke-width="0.8"/>`;
    s += `<text x="${x + 10}" y="${y + 18}" font-size="10.5" font-weight="700" fill="#2E2A26">Спецификация мебели и оборудования</text>`;
    s += `<text x="${x + 26}" y="${y + headH - 10}" font-size="7.4" fill="#7A756D">поз. · наименование</text>`;
    s += `<text x="${x + w - 30}" y="${y + headH - 10}" font-size="7.4" fill="#7A756D" text-anchor="end">габарит, мм</text>`;
    s += `<text x="${x + w - 8}" y="${y + headH - 10}" font-size="7.4" fill="#7A756D" text-anchor="end">пом.</text>`;
    s += `<line x1="${x}" y1="${y + headH - 6}" x2="${x + w}" y2="${y + headH - 6}" stroke="#8A8478" stroke-width="0.6"/>`;
    shown.forEach((p, i) => {
      const ry = y + headH + 8 + i * rowH;
      s += `<rect x="${x + 7}" y="${ry - 9}" width="13" height="13" rx="2" fill="none" stroke="${CAD.furn}" stroke-width="0.8"/>`;
      s += `<text x="${x + 13.5}" y="${ry}" font-size="7.6" font-weight="700" text-anchor="middle" fill="${CAD.furn}">${p.n}</text>`;
      const nm = p.f.name.length > 28 ? p.f.name.slice(0, 27) + '…' : p.f.name;
      s += `<text x="${x + 26}" y="${ry}" font-size="8" fill="#2E2A26">${esc(nm)}</text>`;
      s += `<text x="${x + w - 30}" y="${ry}" font-size="7.6" fill="#57514A" text-anchor="end">${p.f.w}×${p.f.h}</text>`;
      s += `<text x="${x + w - 8}" y="${ry}" font-size="7.6" fill="#7A756D" text-anchor="end">${nn(p.r.idx)}</text>`;
    });
    if (pos.length > shown.length) s += `<text x="${x + 26}" y="${y + headH + 8 + shown.length * rowH}" font-size="7.6" fill="#7A756D">…ещё ${pos.length - shown.length} поз. — в спецификации, раздел 07</text>`;
    // ведомость ниш: марка → что это и в каком помещении
    const nl = drawFlatFurniture.niches || [];
    let nicheH = 0;
    if (nl.length) {
      const ny0 = y + tblH + 12;
      nicheH = 26 + nl.length * rowH + 8;
      s += `<rect x="${x}" y="${ny0}" width="${w}" height="${nicheH}" fill="none" stroke="#8A8478" stroke-width="0.8"/>`;
      s += `<text x="${x + 10}" y="${ny0 + 17}" font-size="10" font-weight="700" fill="#2E2A26">Ниши ГКЛ с подсветкой</text>`;
      nl.forEach((it, i) => {
        const ry = ny0 + 26 + 10 + i * rowH;
        s += `<rect x="${x + 7}" y="${ry - 9}" width="17" height="13" rx="2" fill="none" stroke="${CAD.plumb}" stroke-width="0.8"/>`;
        s += `<text x="${x + 15.5}" y="${ry}" font-size="7.4" font-weight="700" text-anchor="middle" fill="${CAD.plumb}">${it.mk}</text>`;
        const lbl = it.nz.label.length > 30 ? it.nz.label.slice(0, 29) + '…' : it.nz.label;
        s += `<text x="${x + 30}" y="${ry}" font-size="7.8" fill="#2E2A26">${esc(lbl)}</text>`;
        s += `<text x="${x + w - 8}" y="${ry}" font-size="7.6" fill="#7A756D" text-anchor="end">${nn(it.r.idx)}</text>`;
      });
    }
    let refs = [];
    try {
      refs = fs.readdirSync(path.join(outDir, '06-koncept', 'renders', 'thumbs'))
        .filter(f => /\.(jpe?g|png)$/i.test(f)).sort().slice(0, 1)
        .map(f => { const r0 = flatRooms.find(x => f.startsWith(nn(x.idx))); return { f, t: r0 ? r0.name : 'Референс' }; });
    } catch (e) { refs = []; }
    refs.forEach((rf, i) => {
      const iy = y + tblH + (typeof nicheH === 'number' ? nicheH : 0) + 26 + i * 202;
      let href = null;
      try {
        const raw = fs.readFileSync(path.join(outDir, '06-koncept', 'renders', 'thumbs', rf.f));
        href = 'data:image/jpeg;base64,' + raw.toString('base64');
      } catch (e) { return; } // нет миниатюры — врезку не рисуем
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
  // отметки уровней ставим на самом плане: в легенде они были, на чертеже — нет,
  // а бригада ищет высоту там, где стоит короб (канон, чек-лист ceiling)
  const ceilLevels = base => {
    let s = '';
    for (const r of flatRooms) {
      const lv = ceilingLevelsFor(r);
      s += levelPlan(base.fx(r.pos.x + r.w / 2) - 30, base.fy(r.pos.y + r.l / 2) + 16, r.h - (lv.box ? 120 : 0), lv.box ? '2 ур.' : '1 ур.');
    }
    return s;
  };
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
    return s + ceilLevels(base) + flatRoomMarks(base.fx, base.fy, false);
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
  const GRN = '#1F8A4C';                      // цвет активного слоя электрики
  return flatSheet(sheetNo, 'План розеток 220 В и выводов с привязками', 'Привязки L/H: от угла или проёма / от чистого пола, мм', base => {
    let s = '';
    // подложка: мебель бледно-серым, только для привязки
    for (const r of flatRooms) for (const f of furnitureFor(r))
      s += `<rect x="${base.fx(r.pos.x + f.x)}" y="${base.fy(r.pos.y + f.y)}" width="${px(f.w)}" height="${px(f.h)}" fill="none" stroke="#C9C9C9" stroke-width="0.6" rx="1.5"/>`;
    // активный слой
    const outs = [];
    for (const r of flatRooms) for (const p of electroFor(r)) {
      const x = base.fx(r.pos.x + p.x), y = base.fy(r.pos.y + p.y), lab = p.label.toLowerCase();
      const ip44 = /ip44|полот|фен/.test(lab), weak = /tv|lan|тв/.test(lab);
      if (p.type === 'socket') { // «купол» на ножке — стандартный символ розетки
        s += `<g stroke="${GRN}" stroke-width="1.2" fill="none"><path d="M ${x - 5} ${y} a 5 5 0 0 1 10 0" fill="${ip44 ? GRN : '#FFF'}"/><line x1="${x - 6}" y1="${y}" x2="${x + 6}" y2="${y}"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y + 4}"/></g>`;
        if (weak) s += `<text x="${x + 8}" y="${y + 7}" font-size="5.5" font-weight="700" fill="${GRN}">it</text>`;
      } else s += `<g stroke="${GRN}" stroke-width="1.2"><circle cx="${x}" cy="${y}" r="3.4" fill="${GRN}"/><line x1="${x}" y1="${y - 3.4}" x2="${x + 6}" y2="${y - 9}"/></g>`;
      // компактная привязка L/H у символа
      const dl = Math.round(Math.min(p.x, r.w - p.x, p.y, r.l - p.y) / 10);
      s += `<text x="${x + 7}" y="${y - 5}" font-size="6.2" fill="#2A2A2A">${dl}/${Math.round(p.h / 10)}</text>`;
      if (/полот|аквастор|стирал|кондиц|встройк/.test(lab)) outs.push({ x, y, t: p.label });
    }
    // выноски к спецвыводам по периметру плана
    outs.slice(0, 5).forEach((o, i2) => { // короткая полка рядом с точкой
      const dx = o.x > base.fx(FLAT.x0 + FLAT.W / 2) ? -150 : 46;
      s += callout(o.x + dx, o.y + (i2 % 2 ? 22 : -30), o.x, o.y, o.t.split(',')[0].slice(0, 22));
    });
    return s + flatRoomMarks(base.fx, base.fy, false);
  }, (x, y, w) => {
    const nS = rooms.reduce((a, r) => a + electroFor(r).filter(p => p.type === 'socket').length, 0);
    const nW = rooms.reduce((a, r) => a + electroFor(r).filter(p => p.type === 'switch').length, 0);
    let s = flatLegendBox(x, y, w, 'Условные обозначения', [
      { sym: (sx, sy) => `<g stroke="${GRN}" stroke-width="1.2" fill="none"><path d="M ${sx + 3} ${sy - 3} a 5 5 0 0 1 10 0" fill="#FFF"/><line x1="${sx + 2}" y1="${sy - 3}" x2="${sx + 14}" y2="${sy - 3}"/></g>`, text: `розетка штепсельная IP20–IP23 — ${nS} поз.` },
      { sym: (sx, sy) => `<g stroke="${GRN}" stroke-width="1.2" fill="none"><path d="M ${sx + 3} ${sy - 3} a 5 5 0 0 1 10 0" fill="${GRN}"/><line x1="${sx + 2}" y1="${sy - 3}" x2="${sx + 14}" y2="${sy - 3}"/></g>`, text: 'розетка влагозащищённая IP44–IP55' },
      { sym: (sx, sy) => `<g><text x="${sx + 2}" y="${sy}" font-size="7" font-weight="700" fill="${GRN}">it</text><circle cx="${sx + 14}" cy="${sy - 3}" r="3" fill="${GRN}"/></g>`, text: 'интернет / ТВ-розетка (слаботочная)' },
      { sym: (sx, sy) => `<g stroke="${GRN}" stroke-width="1.2"><circle cx="${sx + 7}" cy="${sy - 3}" r="3.4" fill="${GRN}"/><line x1="${sx + 7}" y1="${sy - 6.4}" x2="${sx + 13}" y2="${sy - 12}"/></g>`, text: `выключатель — ${nW} поз.` },
      { sym: (sx, sy) => `<rect x="${sx}" y="${sy - 8}" width="16" height="11" fill="none" stroke="#C9C9C9" stroke-width="0.8"/>`, text: 'мебель — подложка для привязки' },
    ]);
    // красные блоки-пояснения, как в рабочих альбомах
    const boxY = y + 5 * 20 + 46;
    const kitchen = ['Холодильник', 'Посудомоечная машина', 'Варочная панель', 'Духовой шкаф', 'Вытяжка', 'СВЧ', 'Рабочая зона фартука'];
    s += `<rect x="${x}" y="${boxY}" width="${w}" height="${kitchen.length * 13 + 58}" fill="#FFF6F4" stroke="#B0483A" stroke-width="1"/>`;
    s += `<text x="${x + 10}" y="${boxY + 17}" font-size="10" font-weight="700" fill="#B0483A">Розетки в кухонной зоне</text>`;
    kitchen.forEach((t, i2) => { s += `<text x="${x + 10}" y="${boxY + 32 + i2 * 13}" font-size="8.6" fill="#2A2A2A">${i2 + 1}. ${esc(t)}</text>`; });
    wrapText('Итоговые размеры техники запросить у заказчика до разводки.', 40).forEach((ln, i3) => {
      s += `<text x="${x + 10}" y="${boxY + 34 + kitchen.length * 13 + i3 * 11}" font-size="8.2" fill="#B0483A">${esc(ln)}</text>`;
    });
    const b2 = boxY + kitchen.length * 13 + 72;
    s += `<rect x="${x}" y="${b2}" width="${w}" height="62" fill="#FFF6F4" stroke="#B0483A" stroke-width="1"/>`;
    s += `<text x="${x + 10}" y="${b2 + 16}" font-size="10" font-weight="700" fill="#B0483A">Привязки L/H заданы:</text>`;
    ['от чистого пола (высота)', 'от угла или дверного проёма (расстояние)', 'до центра блока розеток'].forEach((t, i2) => {
      s += `<text x="${x + 10}" y="${b2 + 31 + i2 * 12}" font-size="8.6" fill="#2A2A2A">— ${esc(t)}</text>`;
    });
    return s;
  }, ['Все размеры даны в сантиметрах, в формате L/H.', 'Размеры даны без учёта отделочного слоя.', '* размеры уточнить после выбора мебели и техники.', '** размеры уточнить у прораба на объекте.', 'Санузлы: линии через УЗО 30 мА, механизмы IP44.', 'Электросеть прокладывать в гофрированной трубе ПВХ за подвесными потолками и в подготовке пола вдоль стен в зоне 150 мм от стен.'],
  { pale: true });
}

// ---------- табличный ГОСТ-штамп для сводных листов (формат рабочих альбомов) ----------
function flatStamp(x, y, w, title, sheetNo) {
  LAST_STAMP = { name: title, sheet: sheetNo, scale: null, y, x };
  return ''; // единый штамп листа — в svgDoc
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
// Условные обозначения дверей по ГОСТ 21.201-2011 (табл. 7): однопольная с дугой
// открывания, откатная со стрелкой, входная. Без легенды подрядчик читает дуги наугад.
function doorLegendRows() {
  return [
    { sym: (sx, sy) => `<g stroke="#2A2A2A" fill="none" stroke-width="1"><line x1="${sx}" y1="${sy - 2}" x2="${sx + 4}" y2="${sy - 2}"/><line x1="${sx + 4}" y1="${sy - 2}" x2="${sx + 4}" y2="${sy - 13}"/><path d="M ${sx + 4} ${sy - 13} A 11 11 0 0 1 ${sx + 15} ${sy - 2}" stroke-dasharray="2 2"/><line x1="${sx + 15}" y1="${sy - 2}" x2="${sx + 18}" y2="${sy - 2}"/></g>`, text: 'дверь однопольная, дуга — сторона открывания (ГОСТ 21.201, табл. 7)' },
    { sym: (sx, sy) => `<g stroke="#2A2A2A" fill="none" stroke-width="1"><line x1="${sx}" y1="${sy - 4}" x2="${sx + 18}" y2="${sy - 4}"/><line x1="${sx + 2}" y1="${sy - 8}" x2="${sx + 12}" y2="${sy - 8}"/><path d="M ${sx + 12} ${sy - 11} L ${sx + 16} ${sy - 8} L ${sx + 12} ${sy - 5}"/></g>`, text: 'дверь откатная / в пенал, стрелка — направление сдвига' },
    { sym: (sx, sy) => `<g stroke="#2A2A2A" fill="none" stroke-width="1.6"><rect x="${sx}" y="${sy - 11}" width="18" height="9" fill="#E8E4DC"/></g>`, text: 'входная дверь (существующая), стальная' },
    { sym: (sx, sy) => `<text x="${sx}" y="${sy}" font-size="9" font-weight="700" fill="#2E2A26">Дn</text>`, text: 'марка проёма по ведомости дверей на этом листе' },
  ];
}

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
    // условные обозначения дверей — по канону обязательны на этом листе
    let s0 = flatLegendBox(x, y, w, 'Условные обозначения', doorLegendRows());
    const shift = 4 * 20 + 42;   // высота легенды: 4 строки
    y = y + shift + 14;
    // ниже — ведомость дверей
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
    return s0 + s;
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

// 14. Кондиционеры
function drawFlatAC(sheetNo) {
  const acUnits = [];
  const oppWall = { A: 'C', C: 'A', B: 'D', D: 'B' };
  for (const r of flatRooms) {
    if (!['bedroom', 'kids', 'living-kitchen', 'living'].includes(r.type)) continue;
    const targetWall = r.windows.length ? (oppWall[r.windows[0].wall] || 'C') : 'C';
    const wallLen = (targetWall === 'A' || targetWall === 'C') ? r.w : r.l;
    if (wallLen < 950) continue;
    const count = (r.type === 'living-kitchen' && r.area > 20) ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const center = count === 1 ? wallLen / 2 : wallLen * (i === 0 ? 0.3 : 0.7);
      const off = Math.max(100, Math.min(center - 425, wallLen - 950));
      acUnits.push({ r, wall: targetWall, off });
    }
  }
  return flatSheet(sheetNo, 'Кондиционеры', 'Схема кондиционирования · внутренние блоки, трассы фреона, конденсат', base => {
    let s = '';
    const patId = `acOuP${sheetNo}`;
    s += `<defs><pattern id="${patId}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#E8F4FF"/><line x1="0" y1="0" x2="0" y2="6" stroke="#2A6AA0" stroke-width="1.8"/></pattern></defs>`;
    const ouX = base.fx(FLAT.x0), ouY = base.fy(FLAT.y0) - px(EXT);
    const ouW = Math.min(px(850), px(FLAT.W / 2)), ouH = px(EXT);
    s += `<rect x="${ouX}" y="${ouY}" width="${ouW}" height="${ouH}" fill="url(#${patId})" stroke="#2A6AA0" stroke-width="1.3"/>`;
    s += `<text x="${ouX + ouW / 2}" y="${ouY + ouH / 2 + 3}" font-size="5.5" text-anchor="middle" fill="#2A6AA0" font-weight="700">Наруж. блок</text>`;
    const ocx = ouX + ouW / 2, ocy = ouY + ouH;
    for (const u of acUnits) {
      const r = u.r;
      let ux, uy, uw, uh, horiz;
      if (u.wall === 'A')      { ux = base.fx(r.pos.x + u.off); uy = base.fy(r.pos.y);                  uw = px(850); uh = px(200); horiz = true; }
      else if (u.wall === 'C') { ux = base.fx(r.pos.x + u.off); uy = base.fy(r.pos.y + r.l) - px(200); uw = px(850); uh = px(200); horiz = true; }
      else if (u.wall === 'D') { ux = base.fx(r.pos.x);         uy = base.fy(r.pos.y + u.off);          uw = px(200); uh = px(850); horiz = false; }
      else                     { ux = base.fx(r.pos.x + r.w) - px(200); uy = base.fy(r.pos.y + u.off); uw = px(200); uh = px(850); horiz = false; }
      s += `<rect x="${ux}" y="${uy}" width="${uw}" height="${uh}" fill="#E8F4FF" stroke="#2A6AA0" stroke-width="1.2"/>`;
      const fanR = Math.min(horiz ? uh / 2 - 2 : uw / 2 - 2, 8);
      if (horiz) {
        const step = uh / 5;
        for (let fi = 1; fi <= 4; fi++) s += `<line x1="${ux + 4}" y1="${uy + step * fi}" x2="${ux + uw - 4}" y2="${uy + step * fi}" stroke="#2A6AA066" stroke-width="0.7"/>`;
      } else {
        const step = uw / 5;
        for (let fi = 1; fi <= 4; fi++) s += `<line x1="${ux + step * fi}" y1="${uy + 4}" x2="${ux + step * fi}" y2="${uy + uh - 4}" stroke="#2A6AA066" stroke-width="0.7"/>`;
      }
      s += `<circle cx="${ux + uw / 2}" cy="${uy + uh / 2}" r="${fanR}" fill="none" stroke="#2A6AA0" stroke-width="0.8"/>`;
      const lbl2 = r.name.length > 9 ? r.name.slice(0, 9) + '…' : r.name;
      s += `<text x="${ux + uw / 2}" y="${uy + uh / 2 + (horiz ? 3 : 0)}" font-size="5.5" text-anchor="middle" fill="#1A4A70">${esc(lbl2)}</text>`;
      const sox = ux + uw - 10, soy = uy + 2;
      s += `<rect x="${sox}" y="${soy}" width="8" height="8" fill="#FFF" stroke="${CAD.elec}" stroke-width="0.8"/>`;
      s += `<circle cx="${sox + 4}" cy="${soy + 4}" r="1.8" fill="${CAD.elec}"/>`;
      const icx = ux + uw / 2, icy = uy + uh / 2;
      s += `<polyline points="${icx},${icy} ${icx},${ocy} ${ocx},${ocy}" fill="none" stroke="#2A6AA0" stroke-width="0.9" stroke-dasharray="8 4"/>`;
    }
    return s + flatRoomMarks(base.fx, base.fy, false);
  }, (x, y, w) => flatLegendBox(x, y, w, 'Условные обозначения', [
    { sym: (sx, sy) => `<rect x="${sx}" y="${sy - 10}" width="16" height="9" fill="#E8F4FF" stroke="#2A6AA0" stroke-width="0.9"/><line x1="${sx + 3}" y1="${sy - 7}" x2="${sx + 13}" y2="${sy - 7}" stroke="#2A6AA066" stroke-width="0.7"/><circle cx="${sx + 8}" cy="${sy - 5}" r="2.5" fill="none" stroke="#2A6AA0" stroke-width="0.6"/>`, text: `внутренний блок 850×200, h=2200 — ${acUnits.length} шт.` },
    { sym: (sx, sy) => `<rect x="${sx}" y="${sy - 10}" width="14" height="9" fill="#E8F4FF80" stroke="#2A6AA0" stroke-width="0.9" stroke-dasharray="3 2"/>`, text: 'наружный блок 850×650 · вылет от фасада' },
    { sym: (sx, sy) => `<line x1="${sx}" y1="${sy - 4}" x2="${sx + 16}" y2="${sy - 4}" stroke="#2A6AA0" stroke-width="1.2" stroke-dasharray="8 4"/>`, text: 'трасса фреона: медная труба в теплоизоляции ø6/10 мм' },
    { sym: (sx, sy) => `<rect x="${sx + 2}" y="${sy - 9}" width="8" height="8" fill="#FFF" stroke="${CAD.elec}" stroke-width="0.8"/><circle cx="${sx + 6}" cy="${sy - 5}" r="1.8" fill="${CAD.elec}"/>`, text: 'розетка питания 16А/2,5мм² от щита' },
  ]), [
    'Конденсат: полипропиленовая труба ø20 в штробе.',
    'Питание: выделенная линия 16А/2,5мм² от щита.',
    'Рекомендации: Mitsubishi Electric MSZ-LN / Daikin FTXB / Bosch Climate 5000.',
    'Трассы фреона: медная труба в теплоизоляции — монтаж сертифицированными мастерами.',
  ]);
}

// 15. Сантехника с привязками

// Правая колонка листа сантехники: условные обозначения + ведомость привязок,
// куда уходят приборы, для которых на плане не хватило места под выноску.
function plumbColumn(x, y, w, legendSvg) {
  const rows = drawFlatPlumbing.marks || [];
  if (!rows.length) return legendSvg;
  const ly = y + 5 * 22 + 44;
  let s = legendSvg;
  s += `<rect x="${x}" y="${ly}" width="${w}" height="${rows.length * 13 + 32}" fill="none" stroke="#8A8478" stroke-width="0.8"/>`;
  s += `<text x="${x + 10}" y="${ly + 17}" font-size="10" font-weight="700" fill="#2E2A26">Ведомость привязок сантехники</text>`;
  rows.forEach((r0, i2) => {
    const ry = ly + 30 + i2 * 13;
    s += `<rect x="${x + 7}" y="${ry - 9}" width="16" height="12" rx="2" fill="none" stroke="${CAD.plumb}" stroke-width="0.8"/>`;
    s += `<text x="${x + 15}" y="${ry}" font-size="7.4" font-weight="700" text-anchor="middle" fill="${CAD.plumb}">${r0.mk}</text>`;
    s += `<text x="${x + 28}" y="${ry}" font-size="7.6" fill="#2E2A26">${esc(r0.t)}</text>`;
  });
  return s;
}

function drawFlatPlumbing(sheetNo) {
  const plumbTypes = new Set(['bathroom', 'wc', 'kitchen', 'living-kitchen']);
  const plumbRooms = flatRooms.filter(r => plumbTypes.has(r.type));
  return flatSheet(sheetNo, 'Сантехника с привязками', 'Расположение сантехнических приборов · привязки от стен в мм', base => {
    let s = '';
    const ink = inkMap(), ties = [];
    for (const r of flatRooms) {   // занятость: помещения и приборы, чтобы подписи не легли на графику
      ink.add(base.fx(r.pos.x + r.w / 2) - 40, base.fy(r.pos.y + r.l / 2) - 18, 80, 36);
      for (const f of furnitureFor(r)) ink.add(base.fx(r.pos.x + f.x), base.fy(r.pos.y + f.y), px(f.w), px(f.h));
    }
    for (const r of plumbRooms)
      s += `<rect x="${base.fx(r.pos.x)}" y="${base.fy(r.pos.y)}" width="${px(r.w)}" height="${px(r.l)}" fill="#E8F2FC" fill-opacity="0.55" stroke="none"/>`;
    for (const r of plumbRooms) {
      const furns = furnitureFor(r);
      for (const f of furns) {
        if (!['wc', 'sink', 'bath', 'kitchen'].includes(f.key)) continue;
        const fx2 = base.fx(r.pos.x + f.x), fy2 = base.fy(r.pos.y + f.y);
        const fw = px(f.w), fh = px(f.h);
        const fcx = fx2 + fw / 2, fcy = fy2 + fh / 2;
        if (f.key === 'wc') {
          s += `<rect x="${fx2}" y="${fy2}" width="${fw}" height="${fh * 0.42}" fill="#E0F0FF" stroke="${CAD.plumb}" stroke-width="1"/>`;
          s += `<line x1="${fx2}" y1="${fy2 + fh * 0.42}" x2="${fx2 + fw}" y2="${fy2 + fh * 0.42}" stroke="${CAD.plumb}" stroke-width="0.9"/>`;
          s += `<rect x="${fx2}" y="${fy2 + fh * 0.42}" width="${fw}" height="${fh * 0.58}" fill="none" stroke="${CAD.plumb}" stroke-width="0.8"/>`;
          s += `<ellipse cx="${fcx}" cy="${fy2 + fh * 0.72}" rx="${fw * 0.42}" ry="${fh * 0.27}" fill="#FFF" stroke="${CAD.plumb}" stroke-width="1"/>`;
        } else if (f.key === 'sink') {
          s += `<rect x="${fx2}" y="${fy2}" width="${fw}" height="${fh}" fill="#E0F0FF" stroke="${CAD.plumb}" stroke-width="1" rx="4"/>`;
          s += `<ellipse cx="${fcx}" cy="${fcy}" rx="${fw * 0.38}" ry="${fh * 0.42}" fill="#FFF" stroke="${CAD.plumb}" stroke-width="0.9"/>`;
          s += `<circle cx="${fcx}" cy="${fcy}" r="2" fill="${CAD.plumb}"/>`;
        } else if (f.key === 'bath') {
          s += `<rect x="${fx2}" y="${fy2}" width="${fw}" height="${fh}" fill="#E0F0FF" stroke="${CAD.plumb}" stroke-width="1.1" rx="3"/>`;
          s += `<rect x="${fx2 + 4}" y="${fy2 + 4}" width="${fw - 8}" height="${fh - 8}" fill="none" stroke="${CAD.plumb}" stroke-width="0.7" rx="2"/>`;
          s += `<circle cx="${fcx}" cy="${fy2 + fh * 0.85}" r="${Math.min(fw * 0.12, 5)}" fill="none" stroke="${CAD.plumb}" stroke-width="0.8"/>`;
        } else if (f.key === 'kitchen' && r.type !== 'bathroom') {
          const hw = fw / 2 - 3;
          s += `<rect x="${fx2}" y="${fy2}" width="${fw}" height="${fh}" fill="#E0F0FF" stroke="${CAD.plumb}" stroke-width="1.1" rx="3"/>`;
          s += `<rect x="${fx2 + 3}" y="${fy2 + 3}" width="${hw}" height="${fh - 6}" fill="#FFF" stroke="${CAD.plumb}" stroke-width="0.8" rx="2"/>`;
          s += `<rect x="${fx2 + fw / 2 + 1}" y="${fy2 + 3}" width="${hw - 1}" height="${fh - 6}" fill="#FFF" stroke="${CAD.plumb}" stroke-width="0.8" rx="2"/>`;
          s += `<circle cx="${fx2 + fw * 0.27}" cy="${fcy}" r="2" fill="${CAD.plumb}"/>`;
          s += `<circle cx="${fx2 + fw * 0.75}" cy="${fcy}" r="2" fill="${CAD.plumb}"/>`;
        }
        // Высоты водорозеток и выпусков от чистого пола — без них сантехник
        // ставит подводку наугад и потом вскрывает плитку (канон, чек-лист plumbing)
        const TIE = {
          wc:      'выпуск Ø110 h=180 · ХВ h=250',
          sink:    'ХВ/ГВ h=550 · слив Ø50 h=450',
          bath:    'смеситель h=1100 · слив Ø50 h=80',
          kitchen: 'ХВ/ГВ h=550 · слив Ø50 h=450'
        }[f.key];
        // приборы в санузле стоят вплотную: подписи раскладываем выноской по ГОСТ 2.316,
        // иначе три привязки сливаются в одну строку
        if (TIE) ties.push({ x: fcx, y: fy2 + fh / 2, t: TIE, room: r.name });
        const wl = base.fx(r.pos.x), wt = base.fy(r.pos.y);
        const dimGap = 14;
        const distH = Math.round(f.x + f.w / 2);
        if (distH > 0) s += dimH(wl, fcx, fy2 + fh + dimGap, String(distH));
        const distV = Math.round(f.y + f.h / 2);
        if (distV > 0) s += dimV(fx2 - dimGap, wt, fcy, String(distV));
      }
      const plFurns = furns.filter(ff => ['wc', 'sink', 'bath', 'kitchen'].includes(ff.key));
      if (plFurns.length && r.doors.length) {
        const d = r.doors[0];
        let dpx2, dpy2;
        if      (d.wall === 'A') { dpx2 = base.fx(r.pos.x + d.off + d.w / 2); dpy2 = base.fy(r.pos.y); }
        else if (d.wall === 'C') { dpx2 = base.fx(r.pos.x + d.off + d.w / 2); dpy2 = base.fy(r.pos.y + r.l); }
        else if (d.wall === 'D') { dpx2 = base.fx(r.pos.x);                    dpy2 = base.fy(r.pos.y + d.off + d.w / 2); }
        else                     { dpx2 = base.fx(r.pos.x + r.w);              dpy2 = base.fy(r.pos.y + d.off + d.w / 2); }
        const ff0 = plFurns[0];
        s += `<line x1="${dpx2}" y1="${dpy2}" x2="${base.fx(r.pos.x + ff0.x + ff0.w / 2)}" y2="${base.fy(r.pos.y + ff0.y + ff0.h / 2)}" stroke="${CAD.plumb}" stroke-width="0.8" stroke-dasharray="6 3"/>`;
      }
    }
    // раскладка привязок: выноска по ГОСТ 2.316, а при полном отсутствии места —
    // подпись над прибором со сдвигом, чтобы соседние не наложились
    // Сначала выноска по ГОСТ 2.316. В тесной мокрой зоне (санузел 1,85 м на 1:50)
    // места нет — тогда штатный путь канона: марка прибора Вn на плане, привязки
    // в «Ведомости привязок сантехники» справа. Лист не перегружается.
    drawFlatPlumbing.marks = [];
    ties.forEach(t => {
      const lead = leader(ink, t.x, t.y, t.t, { size: 7.8, arm: 26, shelf: 34 });
      if (lead) { s += lead; return; }
      const mk = 'В' + (drawFlatPlumbing.marks.length + 1);
      drawFlatPlumbing.marks.push({ mk, t: t.t, room: t.room });
      s += `<rect x="${t.x - 8}" y="${t.y - 7}" width="16" height="14" rx="2" fill="#FFFFFFEE" stroke="${CAD.plumb}" stroke-width="0.9"/>`
        + `<text x="${t.x}" y="${t.y + 3}" font-size="7.6" font-weight="700" text-anchor="middle" fill="${CAD.plumb}">${mk}</text>`;
    });
    return s + flatRoomMarks(base.fx, base.fy, false);
  }, (x, y, w) => plumbColumn(x, y, w, flatLegendBox(x, y, w, 'Условные обозначения', [
    { sym: (sx, sy) => `<rect x="${sx}" y="${sy - 10}" width="10" height="14" fill="#E0F0FF" stroke="${CAD.plumb}" stroke-width="0.9"/><ellipse cx="${sx + 5}" cy="${sy + 1}" rx="3.5" ry="2.5" fill="#FFF" stroke="${CAD.plumb}" stroke-width="0.7"/>`, text: 'унитаз 400×680' },
    { sym: (sx, sy) => `<ellipse cx="${sx + 8}" cy="${sy - 3}" rx="7" ry="5" fill="#E0F0FF" stroke="${CAD.plumb}" stroke-width="0.9"/><circle cx="${sx + 8}" cy="${sy - 3}" r="1.5" fill="${CAD.plumb}"/>`, text: 'раковина 600×450' },
    { sym: (sx, sy) => `<rect x="${sx}" y="${sy - 9}" width="16" height="10" fill="#E0F0FF" stroke="${CAD.plumb}" stroke-width="0.9" rx="2"/><circle cx="${sx + 8}" cy="${sy - 2}" r="1.8" fill="none" stroke="${CAD.plumb}" stroke-width="0.7"/>`, text: 'ванна 1700×700 / душ 900×900' },
    { sym: (sx, sy) => `<rect x="${sx}" y="${sy - 9}" width="16" height="10" fill="#E0F0FF" stroke="${CAD.plumb}" stroke-width="0.9" rx="2"/><circle cx="${sx + 5}" cy="${sy - 4}" r="1.5" fill="${CAD.plumb}"/><circle cx="${sx + 11}" cy="${sy - 4}" r="1.5" fill="${CAD.plumb}"/>`, text: 'мойка кухонная двойная 600×500' },
    { sym: (sx, sy) => `<line x1="${sx}" y1="${sy - 4}" x2="${sx + 16}" y2="${sy - 4}" stroke="${CAD.plumb}" stroke-width="0.9" stroke-dasharray="6 3"/>`, text: 'трасса ГВС/ХВС от стояка' },
  ])), [
    'Привязки от оси прибора; уточнить после укладки плитки ±5 мм.',
    'Сантехника монтируется после завершения чистовой отделки.',
    'Уклоны канализации ≥2% (20 мм/пог.м) в направлении стояка.',
    'Ввод ГВС и ХВС — от существующих стояков согласно проекту ВК.',
  ], { pale: true });
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

// Описание помещения собирается из фактической расстановки и геометрии этого помещения.
// Общий текст о стиле стоит в шапке документа один раз — в карточках он превращал
// концепцию в пять одинаковых абзацев.
function roomConcept(r) {
  const f = furnitureFor(r), by = k => f.find(x => x.key === k);
  const m = v => (v / 1000).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
  const wallOf = it => !it ? null : (it.y < 300 ? 'A' : (r.l - (it.y + it.h) < 300 ? 'C' : (it.x < 300 ? 'D' : (r.w - (it.x + it.w) < 300 ? 'B' : null))));
  const at = it => { const w = wallOf(it); return w ? ` по стене ${w}` : ' в центре помещения'; };
  const lv = ceilingLevelsFor(r);
  const b = [];
  const bed = by('bed') || by('kidbed'), kit = by('kitchen'), sofa = by('sofa'), desk = by('desk'), wr = by('wardrobe');
  switch (r.type) {
    case 'living-kitchen':
      b.push(`Единое пространство ${r.area} м² без перегородок`);
      if (kit) b.push(`кухонный фронт ${m(kit.w)} м${at(kit)}`);
      if (sofa) b.push(`мягкая зона напротив ТВ-стены`);
      if (by('table')) b.push('обеденная группа на границе зон');
      b.push(`границы держат свет и ${lv.three ? 'три уровня' : 'два уровня'} потолка, а не стены`);
      break;
    case 'living':
      b.push(`Гостиная ${r.area} м² с ТВ-зоной${at(by('tv'))}`);
      if (sofa) b.push(`диван ${m(sofa.w >= sofa.h ? sofa.w : sofa.h)} м напротив`);
      if (by('armchair')) b.push('кресло у окна для чтения');
      break;
    case 'bedroom':
      b.push(`Спальня ${r.area} м²: кровать${bed ? ' ' + bed.name.replace(/^Кровать /, '') : ''} изголовьем к стене ${bed && bed.head ? bed.head : '—'} — без окна и двери за головой`);
      if (f.filter(x => x.key === 'nightstand').length) b.push(`тумбы с розетками на высоте 600 мм по обе стороны`);
      if (wr) b.push(`шкаф ${m(wr.w >= wr.h ? wr.w : wr.h)} м${at(wr)}`);
      break;
    case 'kids':
      b.push(`Детская ${r.area} м²: спальное место${bed ? ' ' + bed.name.replace(/^Кровать /, '') : ''}${at(bed)}`);
      if (desk) b.push(`рабочий стол ${m(desk.w)} м у окна — свет слева`);
      if (by('rug')) b.push('игровая зона в центре');
      b.push('свет разделён на общий, рабочий и ночной');
      break;
    case 'kitchen':
      b.push(`Кухня ${r.area} м²`);
      if (kit) b.push(`фронт ${m(kit.w + (by('kitchen_ext') ? by('kitchen_ext').h : 0))} м.п.${by('kitchen_ext') ? ' Г-образной компоновкой' : at(kit)}`);
      b.push('фартук с подсветкой и розетками на высоте 1100 мм');
      break;
    case 'bathroom':
    case 'wc': {
      const bath = by('bath');
      b.push(`Санузел ${r.area} м²: ${bath ? bath.name.toLowerCase() : 'душевая зона'}${at(bath)}`);
      b.push('пол ниже жилых на 20 мм, гидроизоляция с заходом на стены 200 мм');
      b.push('вся электрика IP44, тёплый пол с терморегулятором');
      break; }
    case 'hallway':
      b.push((wr || by('shelf'))
        ? `Прихожая ${r.area} м²: входная группа хранения${at(wr || by('shelf'))}`
        : `Прихожая ${r.area} м²: шкаф-купе и скамья — по фактическому обмеру после демонтажа`);
      b.push('керамогранит с тёплым полом в зоне входа, зеркало в полный рост');
      break;
    case 'cabinet':
      b.push(`Кабинет ${r.area} м²: рабочее место${desk ? ' ' + m(desk.w) + ' м' : ''} у окна`);
      b.push('розетки и слаботочка в столе, свет 4000K на рабочей плоскости');
      break;
    default:
      b.push(`${r.name}, ${r.area} м², высота ${r.h} мм`);
  }
  const nich = nichesFor(r);
  if (nich.length) b.push(`${nich.length === 1 ? 'ниша' : 'ниши'} ГКЛ с LED в алюминиевом профиле`);
  if (r.windows.length) b.push(`${r.windows.length === 1 ? 'окно' : `окна (${r.windows.length})`} со шторами в потолочной нише`);
  return b.join(' · ') + '.';
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
<p>${esc(roomConcept(r))}</p>
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
    // подпись рендера: имя файла в транслите → помещение из брифа + вид.
    // Слова, уже прозвучавшие в названии помещения, из хвоста выбрасываем.
    const base0 = f.split('/').pop().replace(/\.\w+$/, '');
    const room0 = rooms.find(r0 => base0.startsWith(nn(r0.idx)));
    const WORD = { gostinaya: 'гостиная', kuhnya: 'кухня', stolovaya: 'столовая', spalnya: 'спальня', detskaya: 'детская',
      sanuzel: 'санузел', prihozhaya: 'прихожая', kabinet: 'кабинет', koridor: 'коридор', dom: 'дом',
      detail: 'фрагмент', obshiy: 'общий вид', vid: 'вид', ot: 'от', krovati: 'кровати', stol: 'рабочее место',
      dush: 'душевая зона', vanna: 'зона ванны', zerkalo: 'зеркало', hranenie: 'зона хранения', noch: 'вечерний свет',
      terrasa: 'терраса', lestnica: 'лестница', vtoroy: 'второй', etazh: 'этаж', pervyy: 'первый' };
    // слово уже есть в названии помещения — как транслит («spalnya») или как корень перевода
    // («лестница» при «Холл с лестницей»)
    const nameWords = room0 ? room0.name.toLowerCase().split(/[\s-]+/) : [];
    const inName = w => {
      if (!room0) return false;
      if (slug(room0.name).split('-').includes(w)) return true;
      const ru = (WORD[w] || '').toLowerCase();
      return ru.length > 4 && nameWords.some(nw => nw.slice(0, 5) === ru.slice(0, 5));
    };
    const tail = base0.replace(/^\d+\w?-/, '').split('-').filter(w => w && !inName(w))
      .map(w => WORD[w] || w).join(' ').trim();
    const nm = room0 ? (room0.name + (tail ? ' · ' + tail : '')) : base0.replace(/-/g, ' ');
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
// на помещение: обмер, демонтаж, монтаж, 2 плана, пол, 4 развертки, потолок, электрика,
// умный дом, слаботочка = 14 листов; плюс узел А и 15 сводных на этаж.
// Расхождение с фактом проверяется в конце: штамп «Листов N» обязан совпадать с ведомостью.
TOTAL_SHEETS = rooms.length * 14 + 1 + (FLAT ? 15 * LEVELS.length : 0);
const reg = []; // реестр листов для ведомости
const counts = { flat: 0, obmer: 0, demo: 0, mont: 0, plans: 0, poly: 0, elev: 0, ceil: 0, electro: 0 };
function sheetOut(rel, maker, title, scale, type) {
  const no = sheet++;
  CUR_SHEET = type || 'other';
  writeOut(rel, maker(no));
  CUR_SHEET = '';
  reg.push({ no, title, scale: scale || '1:50', file: rel });
}
const SL = r => `${nn(r.idx)}-${slug(r.name)}`;
const RN = r => `${r.name}${LEVEL_NAME(r.level || 1)}`;
// порядок листов — как в альбомах профессиональных студий
const FLAT_SHEETS = [
    ['01-obmer', drawFlatObmer, 'Обмерный план квартиры', 'obmer'],
    ['02-demontazh', drawFlatDemolition, 'План демонтажа', 'demolition'],
    ['03-montazh', drawFlatMontage, 'План монтажа ГКЛ-конструкций', 'montage'],
    ['04-mebel', drawFlatFurniture, 'План расстановки мебели', 'furniture'],
    ['05-eksplikatsiya-dverey', drawFlatDoors, 'Экспликация помещений и план дверей', 'doors'],
    ['06-rozetki', drawFlatElectro, 'План розеток и выводов', 'sockets'],
    ['07-potolki', drawFlatCeiling, 'План потолков', 'ceiling'],
    ['08-osveshchenie', drawFlatLighting, 'План освещения', 'lighting'],
    ['09-vyklyuchateli', drawFlatSwitches, 'План выключателей', 'switches'],
    ['10-skhema-vklyucheniya', drawFlatSwitchScheme, 'Схема включения освещения', 'switch-scheme'],
    ['11-poly', drawFlatFloors, 'План напольных покрытий', 'floors'],
    ['12-otdelka-sten', drawFlatWallFinish, 'План отделки стен', 'wall-finish'],
    ['13-teplye-poly', drawFlatHeatFloor, 'План тёплых полов', 'heat-floor'],
    ['14-kondicionery', drawFlatAC, 'Кондиционеры', 'climate'],
    ['15-santehnika', drawFlatPlumbing, 'Сантехника с привязками', 'plumbing'],
];
for (const lv of LEVELS) { // канон альбома: 13 сводных листов на каждый этаж
  setLevel(lv);
  if (!FLAT) continue;
  const pre = LEVELS.length > 1 ? `et${lv}-` : '';
  for (const [key, fn, title, type] of FLAT_SHEETS) {
    sheetOut(`01-kvartira/kvartira-${pre}${key}.svg`, n => fn(n), title + LEVEL_NAME(lv), '1:50', type);
    counts.flat++;
  }
}
setLevel(LEVELS[0]);
for (const r of rooms) { sheetOut(`01-obmer/obmer-${SL(r)}.svg`, n => drawObmer(r, n), `Обмерный план. ${RN(r)}`, '1:50', 'obmer-room'); counts.obmer++; }
for (const r of rooms) { sheetOut(`01-obmer/demo-${SL(r)}.svg`, n => drawDemolition(r, n), `Демонтаж. ${RN(r)}`, '1:50', 'demolition-room'); counts.demo++; }
for (const r of rooms) { sheetOut(`01-obmer/mont-${SL(r)}.svg`, n => drawMontage(r, n), `Монтаж перегородок. ${RN(r)}`, '1:50', 'montage-room'); counts.mont++; }
for (const r of rooms) { sheetOut(`02-plany/plan-${SL(r)}.svg`, n => drawPlan(r, n, true), `План мебели с размерами. ${RN(r)}`, '1:50', 'plan-dims'); counts.plans++; }
for (const r of rooms) { sheetOut(`02-plany/plan-${SL(r)}-mebel.svg`, n => drawPlan(r, n, false), `План мебели. ${RN(r)}`, '1:50', 'plan'); counts.plans++; }
for (const r of rooms) { sheetOut(`03-poly/pol-${SL(r)}.svg`, n => drawFloor(r, n), `План пола. ${RN(r)}`, '1:50', 'floor-room'); counts.poly++; }
for (const r of rooms) for (const wk of ['A', 'B', 'C', 'D']) { sheetOut(`04-razvertki/${SL(r)}-stena-${wk}.svg`, n => drawElevation(r, wk, n), `Развертка. ${RN(r)}, стена ${wk}`, '1:50', 'elevation'); counts.elev++; }
for (const r of rooms) { sheetOut(`05-potolki/potolok-${SL(r)}.svg`, n => drawCeiling(r, n), `План потолка. ${RN(r)}`, '1:50', 'ceiling-room'); counts.ceil++; }
sheetOut(`05-potolki/uzel-A-korob-led.svg`, n => drawNode(n), 'Узел А. Короб с LED-подсветкой', '1:20', 'node');
for (const r of rooms) { sheetOut(`09-elektrika/elektrika-${SL(r)}.svg`, n => drawElectro(r, n), `Электрика. ${RN(r)}`, '1:50', 'electro-room'); counts.electro++; }
for (const r of rooms) { sheetOut(`09-elektrika/smarthome-${SL(r)}.svg`, n => drawSmartHome(r, n), `Умный дом. ${RN(r)}`, '1:50', 'smart-room'); counts.electro++; }
for (const r of rooms) { sheetOut(`09-elektrika/slabotochka-${SL(r)}.svg`, n => drawSlabotochka(r, n), `Слаботочка. ${RN(r)}`, '1:50', 'lowvolt-room'); counts.electro++; }
// рендеры: подхватываем, если сгенерированы (06-koncept/renders/*.jpg|png)
let renders = [];
try {
  const rdir = path.join(outDir, '06-koncept', 'renders');
  renders = fs.readdirSync(rdir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort().map(f => '06-koncept/renders/' + f);
  files.push(...renders);
} catch (e) { /* рендеров нет — ок */ }

// ---------- ведомость чертежей ----------
// документы альбома: своя нумерация Д-N, чтобы у каждой позиции ведомости был номер,
// по которому её спрашивают у бригады («Д-4» вместо «—»)
const DOCS = [
  { id: 'Д-1', title: 'Паспорт проекта + пояснительная записка', file: '00-pasport/pasport.html' },
  { id: 'Д-2', title: 'Ведомость чертежей', file: '00-pasport/vedomost.html' },
  { id: 'Д-3', title: 'Концепция и визуализации', file: '06-koncept/koncept.html' },
  { id: 'Д-4', title: 'Спецификация материалов с артикулами', file: '07-materialy/specification.html' },
  { id: 'Д-5', title: 'Смета реализации (HTML + CSV)', file: '08-smeta/smeta.html' }
].concat((CHECK.errors.length || CHECK.warnings.length)
  ? [{ id: 'Д-6', title: `Замечания к исходным данным (ошибок ${CHECK.errors.length}, проверить ${CHECK.warnings.length})`, file: '00-pasport/zamechaniya.html' }] : []);

function vedomostHTML() {
  const docsRows = DOCS.map(d => `<tr><td class="num">${d.id}</td><td>${esc(d.title)}</td><td class="num">—</td><td>документ</td></tr>`).join('');
  const rows = reg.map(s => `<tr><td class="num">АИ-${s.no}</td><td>${esc(s.title)}</td><td class="num">${s.scale}</td><td>${s.file.split('/')[0]}</td></tr>`).join('');
  return docHTML('Ведомость чертежей', `
<h1>Ведомость чертежей</h1>
<p class="sub">${esc((brief.object && brief.object.address) || 'Объект')} · ${totalArea} м² · всего листов: ${reg.length} · ${DATE}</p>
<table><thead><tr><th>Лист</th><th>Наименование</th><th>Масштаб</th><th>Раздел</th></tr></thead><tbody>${docsRows}${rows}</tbody></table>
<p class="note">Нумерация сквозная АИ-N (архитектура интерьера). Все чертежи выполнены автоматически конвейером LINEA и проверены главным архитектором студии.</p>`);
}
// ---------- замечания к исходным данным ----------
// Лист выпускается только когда валидатору есть что сказать: он объясняет заказчику,
// какие цифры в альбоме взяты по умолчанию, а какие противоречивы.
function zamechaniyaHTML() {
  const li = (arr, cls) => arr.map(t => `<tr><td class="k">${cls}</td><td>${esc(t)}</td></tr>`).join('');
  return docHTML('Замечания к исходным данным', `
<h1>Замечания к исходным данным</h1>
<p class="sub">${esc((brief.object && brief.object.address) || 'Объект')} · проверка брифа перед выпуском · ${DATE}</p>
<p class="mut">Альбом собран автоматически из брифа. Ниже — всё, что валидатор нашёл в исходных данных: ошибки требуют уточнения обмера, предупреждения означают, что движок подставил значение по умолчанию.</p>
<table><tbody>${li(CHECK.errors, 'ошибка')}${li(CHECK.warnings, 'проверить')}</tbody></table>
<p class="note">Ошибки геометрии влияют на площади, а значит — на спецификацию и смету. До их устранения цифры разделов 07 и 08 считать предварительными.</p>`);
}
const smetaRows = buildSmeta();
// документы собираем в память: те же строки уходят и в отдельные HTML, и в единый print.html
const DOC_HTML = {
  '00-pasport/pasport.html': coverHTML(counts),
  '00-pasport/vedomost.html': vedomostHTML(),
  '06-koncept/koncept.html': conceptHTML(),
  '07-materialy/specification.html': specHTML(),
  '08-smeta/smeta.html': smetaHTML(smetaRows)
};
if (CHECK.errors.length || CHECK.warnings.length) DOC_HTML['00-pasport/zamechaniya.html'] = zamechaniyaHTML();
for (const [rel, html] of Object.entries(DOC_HTML)) writeOut(rel, html);
writeOut('08-smeta/smeta.csv', smetaCSV(smetaRows));
// ---------- единый альбом на печать (print.html → album.pdf) ----------
// Бригаде нельзя отдавать 86 файлов: распечатают не ту ревизию и половину потеряют.
// Один документ: титул → оглавление со ссылками → документы → листы, каждый на своей A3.
function printHTML() {
  const docCSS = (/<style>([\s\S]*?)<\/style>/.exec(docHTML('x', '')) || [, ''])[1];
  const body = h => (/<main>([\s\S]*?)<\/main>/.exec(h) || [, ''])[1];
  const addr = (brief.object && brief.object.address) || 'Объект';
  const tocRow = (id, title, extra, href) => `<a class="tr" href="#${href}"><span class="n">${id}</span><span class="t">${esc(title)}</span><span class="s">${extra}</span></a>`;
  const toc = DOCS.map((d, i) => tocRow(d.id, d.title, 'документ', 'd' + (i + 1))).join('')
    + reg.map(s => tocRow('АИ-' + s.no, s.title, s.scale, 's' + s.no)).join('');
  const docPages = DOCS.map((d, i) => DOC_HTML[d.file]
    ? `<section class="page doc" id="d${i + 1}"><div class="dhead">${d.id} · ${esc(addr)} · ${DATE}</div><div class="inner">${body(DOC_HTML[d.file])}</div></section>` : '').join('');
  const sheetPages = reg.map(s => `<section class="page" id="s${s.no}"><img src="${s.file}" alt="${esc(s.title)}"></section>`).join('');
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Альбом · ${esc(addr)} — LINEA</title><style>
${docCSS}
@page{size:A3 landscape;margin:0}
html,body{margin:0;padding:0;background:#fff}
.page{width:420mm;height:297mm;overflow:hidden;position:relative;box-sizing:border-box;page-break-after:always;break-after:page;display:flex;align-items:center;justify-content:center}
.page:last-child{page-break-after:auto;break-after:auto}
.page>img{width:420mm;height:297mm;object-fit:contain;display:block}
.cover{flex-direction:column;background:#FAF9F6}
.cover .mark{font-family:Georgia,serif;font-size:64pt;letter-spacing:12px;margin:0 0 6mm;color:#2E2A26}
.cover .sub{letter-spacing:5px;font-size:11pt;color:#7A756D;text-transform:uppercase;margin:0 0 24mm}
.cover .obj{font-family:Georgia,serif;font-size:22pt;color:#2E2A26;margin:0 0 4mm;text-align:center}
.cover .meta{font-size:11pt;color:#57514A;margin:0 0 2mm}
.cover .stage{margin-top:26mm;font-size:10pt;letter-spacing:3px;color:#7A756D;text-transform:uppercase}
.toc{flex-direction:column;align-items:stretch;padding:18mm 20mm 14mm;background:#fff}
.toc h1{font-family:Georgia,serif;font-size:20pt;margin:0 0 2mm}
.toc .lead{color:#7A756D;font-size:10pt;margin:0 0 6mm}
.toc .cols{columns:3;column-gap:12mm;font-size:8.6pt}
.toc .tr{display:flex;gap:3mm;padding:0.9mm 0;border-bottom:1px solid #EFEBE2;text-decoration:none;color:#2E2A26;break-inside:avoid}
.toc .n{flex:0 0 15mm;color:#9A937F}
.toc .t{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.toc .s{flex:0 0 12mm;text-align:right;color:#9A937F}
/* документ — не окно фиксированной высоты, а поток: длинная ведомость сама
   разливается на нужное число A3 вместо того, чтобы обрезаться на границе */
.doc{display:block;height:auto;min-height:297mm;overflow:visible;padding:14mm 20mm 16mm;background:#fff}
.doc .dhead{font-size:7.5pt;color:#9A937F;letter-spacing:1px;border-bottom:1px solid #EFEBE2;padding-bottom:2mm;margin-bottom:6mm}
.doc .inner{columns:2;column-gap:14mm;font-size:9pt;orphans:3;widows:3}
.doc .inner h1{font-size:17pt;margin:0 0 3mm;column-span:all}
.doc .inner h2{font-size:11pt;margin:5mm 0 2mm;break-after:avoid}
.doc .inner p.sub{column-span:all}
.doc .inner table{font-size:7.8pt;break-inside:auto}
.doc .inner tr,.doc .inner .card,.doc .inner .pal{break-inside:avoid}
.doc .inner thead{display:table-header-group}
.doc .inner img{max-width:100%;height:auto}
</style></head><body>
<section class="page cover"><p class="mark">LINEA</p><p class="sub">студия дизайна интерьера</p>
<p class="obj">${esc(addr)}</p>
<p class="meta">${esc((brief.object && brief.object.type) || 'квартира')} · ${totalArea} м² · помещений ${rooms.length} · стиль «${esc(style.title)}»</p>
<p class="meta">Альбом рабочей документации · листов ${reg.length} · документов ${DOCS.length}</p>
<p class="stage">стадия РП · выпуск ${DATE}</p></section>
<section class="page toc"><h1>Состав альбома</h1>
<p class="lead">${esc(addr)} · ${totalArea} м² · листов ${reg.length} · выпуск ${DATE}. Нумерация: АИ-N — чертежи, Д-N — документы. Названия в оглавлении — ссылки на лист.</p>
<div class="cols">${toc}</div></section>
${docPages}${sheetPages}
</body></html>`;
}
writeOut('print.html', printHTML());
writeOut('index.html', viewerHTML(files.slice()));
writeOut('manifest.json', JSON.stringify({ generated: ISSUE_DATE || new Date().toISOString(), issues: { errors: CHECK.errors, warnings: CHECK.warnings }, style: styleKey, tier: tier.key, totalArea, rooms: rooms.map(r => ({ name: r.name, type: r.type, area: r.area })), files }, null, 2));

const total = smetaRows.reduce((s, r) => s + r.sum, 0);
if (reg.length !== TOTAL_SHEETS) console.warn(`  ⚠ штамп обещает «Листов ${TOTAL_SHEETS}», фактически выпущено ${reg.length} — поправить формулу TOTAL_SHEETS`);
console.log(`✔ Проект собран: ${outDir}`);
console.log(`  Стиль «${style.title}», тариф «${tier.title}», ${totalArea} м², помещений: ${rooms.length}`);
console.log(`  Листов: планы ${counts.plans} · развертки ${counts.elev} · потолки ${counts.ceil}`);
console.log(`  Смета (без резерва): ${fmt(total)} ₽ · файлов: ${files.length}`);
