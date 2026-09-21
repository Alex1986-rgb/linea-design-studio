'use strict';
// ================================================================
// LINEA · бумажный слой ландшафтного альбома
// Лист A3 (420×297), рамка ГОСТ 2.301, основная надпись ГОСТ Р 21.101-2020,
// подбор масштаба по габариту содержимого, нормализация пера и кегля.
//
// Отдельный модуль, а не часть engine/generate.js: интерьерный движок держит
// побайтовые снапшот-фикстуры, и любая правка в нём стоит перегенерации 6 альбомов.
// Здесь свои масштабный ряд (генплан 1:100…1:500) и модельная единица (10 px = 1 м).
// ================================================================

const PAGE = { w: 1587, h: 1123, ml: 76, mr: 19, mt: 19, mb: 19 };
const PXMM = 1587 / 420;                 // px листа на 1 мм бумаги
const STAMP = { w: 700, h: 150 };
const FONT = "'PT Sans','Arial',sans-serif";
const S = 10;                            // модельных px в одном метре натуры

// Ряд масштабов ГОСТ 2.302-68, применимый к генпланам (ГОСТ 21.508-93, 4.4) и фрагментам.
// k = 100 · PXMM / знаменатель — коэффициент от модельных единиц к бумаге.
const kOf = r => +(100 * PXMM / r).toFixed(4);
const PLAN_SERIES = [25, 50, 100, 200, 500].map(r => [r, kOf(r)]);
const NODE_SERIES = [5, 10, 20, 25].map(r => [r, kOf(r)]);

const PEN_MM = { cut: 0.7, main: 0.5, visible: 0.35, thin: 0.25, aux: 0.18 };
const TEXT_MM = { h7: 7, h5: 5, h35: 3.5, h25: 2.5 };
// кегль/перо в модельных единицах: normalizeInk держит их постоянными на бумаге
const F = { title: 19, head: 15, big: 13, norm: 11, small: 10, tiny: 9.6 };
const W = { cut: 2.6, main: 1.9, vis: 1.3, thin: 0.95, aux: 0.72 };

// палитра ландшафтного альбома
const L = {
  paper: '#FFFFFF',
  frame: '#1C1C1C',
  ink: '#1C1C1C',
  dim: '#2A2A2A',
  grey: '#7A756D',
  border: '#1C1C1C',        // граница участка
  build: '#8E8E8E',         // существующие здания (заливка)
  buildNew: '#B08968',      // проектируемые постройки
  paveOld: '#DCD6CB',       // существующее мощение
  paveNew: '#C9BFAE',       // новое мощение
  deck: '#B98A5A',          // террасная доска
  gravel: '#D9D2C4',        // отсыпка
  rubber: '#C98F86',        // безопасное покрытие
  lawn: '#DCEBCB',          // газон
  lawnLine: '#7FA860',
  tree: '#2E7D32',          // деревья
  treeOld: '#7CA982',       // существующие деревья
  shrub: '#5A9367',         // кустарники
  flower: '#B4577E',        // цветники
  veg: '#8A6D2F',           // огород
  water: '#3C8FB5',         // вода, дренаж
  light: '#E0A200',         // освещение
  wire: '#C25E00',          // кабельные трассы
  irr: '#1E88A8',           // полив
  hot: '#C0392B',           // акценты, замечания
  zoneLine: '#8A8478'
};

let CTX = { author: null, object: {}, date: '', total: 0, mono: false };
function setup(o) { CTX = Object.assign(CTX, o); }

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function wrapText(t, n) {
  const out = []; let cur = '';
  for (const word of String(t).split(' ')) {
    if ((cur + ' ' + word).trim().length > n) { if (cur.trim()) out.push(cur.trim()); cur = word; }
    else cur += ' ' + word;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const nm = v => String(v).replace('.', ',');            // число по-русски
const fmtM = v => nm((+v).toFixed(v % 1 ? 2 : 0));      // метры

// ---------- ч/б выпуск ----------
function greyOf(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const a = h.length === 8 ? h.slice(6) : '';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(isNaN)) return hex;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  const v = sat > 40 ? Math.min(lum, 116) : lum;
  const q = Math.round(Math.max(0, Math.min(255, v)));
  const hx = q.toString(16).padStart(2, '0');
  return '#' + hx + hx + hx + a;
}
const monoize = svg => svg.replace(/(fill|stroke|stop-color)="(#[0-9A-Fa-f]{3,8})"/g, (m, k, c) => `${k}="${greyOf(c)}"`);

// ---------- габарит содержимого ----------
function stripClipped(body) {
  let out = '', i = 0;
  for (;;) {
    const m = /<g[^>]*clip-path="[^"]*"[^>]*>/.exec(body.slice(i));
    if (!m) return out + body.slice(i);
    const start = i + m.index, inner = start + m[0].length;
    out += body.slice(i, start);
    let depth = 1;
    const re = /<g\b|<\/g>/g; re.lastIndex = inner;
    let t;
    while ((t = re.exec(body))) { depth += t[0] === '</g>' ? -1 : 1; if (!depth) break; }
    i = t ? re.lastIndex : body.length;
  }
}
function contentBox(body, textK) {
  body = body.replace(/<defs>[\s\S]*?<\/defs>/g, '');
  body = stripClipped(body);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const put = (x, y) => { if (isFinite(x) && isFinite(y)) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } };
  let m;
  const re = /<(rect|image)\b[^>]*?x="(-?[\d.]+)"[^>]*?y="(-?[\d.]+)"[^>]*?width="(-?[\d.]+)"[^>]*?height="(-?[\d.]+)"/g;
  while ((m = re.exec(body))) { const x = +m[2], y = +m[3]; put(x, y); put(x + +m[4], y + +m[5]); }
  const rl = /<line\b[^>]*?x1="(-?[\d.]+)"[^>]*?y1="(-?[\d.]+)"[^>]*?x2="(-?[\d.]+)"[^>]*?y2="(-?[\d.]+)"/g;
  while ((m = rl.exec(body))) { put(+m[1], +m[2]); put(+m[3], +m[4]); }
  const rc = /<(circle|ellipse)\b[^>]*?cx="(-?[\d.]+)"[^>]*?cy="(-?[\d.]+)"(?:[^>]*?r="(-?[\d.]+)")?/g;
  while ((m = rc.exec(body))) { const r = +m[4] || 8; put(+m[2] - r, +m[3] - r); put(+m[2] + r, +m[3] + r); }
  const rt = /<text\b([^>]*?)x="(-?[\d.]+)"[^>]*?y="(-?[\d.]+)"([^>]*?)>([^<]*)</g;
  while ((m = rt.exec(body))) {
    const attrs = m[1] + m[4], x = +m[2], y = +m[3], txt = m[5] || '';
    const fs = +((attrs.match(/font-size="([\d.]+)"/) || [])[1] || 10);
    const anchor = (attrs.match(/text-anchor="(\w+)"/) || [])[1] || 'start';
    // ширину текста считаем по фактическому кеглю с поправкой на нормализацию:
    // без неё длинные выноски раздували габарит и лист падал на ступень мельче
    const w = txt.length * fs * 0.53 * (textK || 1);
    const x0t = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    put(x0t, y - fs * (textK || 1)); put(x0t + w, y + fs * 0.35 * (textK || 1));
  }
  // points читаем парами, d — по командам: у дуги (A) координаты только в последних
  // двух числах из семи, и наивный разбор парами уводил габарит листа на сотни пикселей
  const rpp = /<(polyline|polygon)\b[^>]*?points="([^"]+)"/g;
  while ((m = rpp.exec(body))) {
    const nums = (m[2].match(/-?[\d.]+/g) || []).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) put(nums[i], nums[i + 1]);
  }
  const ARGS = { M: 2, L: 2, T: 2, C: 6, S: 4, Q: 4, A: 7, H: 1, V: 1 };
  const rpd = /<path\b[^>]*?\sd="([^"]+)"/g;
  while ((m = rpd.exec(body))) {
    const toks = m[1].match(/[A-Za-z]|-?[\d.]+(?:e-?\d+)?/g) || [];
    let cmd = 'M', cx = 0, cy = 0, i = 0;
    while (i < toks.length) {
      if (/[A-Za-z]/.test(toks[i])) { cmd = toks[i]; i++; continue; }
      const up = cmd.toUpperCase(), rel = cmd !== up, n = ARGS[up] || 2;
      const a = toks.slice(i, i + n).map(Number);
      if (a.length < n) break;
      i += n;
      if (up === 'H') { cx = rel ? cx + a[0] : a[0]; }
      else if (up === 'V') { cy = rel ? cy + a[0] : a[0]; }
      else {
        const [dx, dy] = [a[n - 2], a[n - 1]];
        cx = rel ? cx + dx : dx; cy = rel ? cy + dy : dy;
      }
      put(cx, cy);
      if (up === 'M') cmd = rel ? 'l' : 'L';
    }
  }
  if (x0 > x1 || y0 > y1) return null;
  return { x0: x0 - 8, y0: y0 - 8, x1: x1 + 8, y1: y1 + 8 };
}

// ---------- нормализация пера и кегля ----------
const K_REF = 1.0;
function normalizeInk(body, k) {
  const c = Math.max(0.02, Math.min(1.6, K_REF / k));
  const minText = TEXT_MM.h25 * PXMM / k;
  const minPen = PEN_MM.aux * PXMM / k;
  return body
    .replace(/font-size="([\d.]+)"/g, (m, v) => `font-size="${Math.max(+v * c, minText).toFixed(2)}"`)
    .replace(/stroke-width="([\d.]+)"/g, (m, v) => `stroke-width="${Math.max(+v * c, minPen).toFixed(2)}"`);
}

// ---------- основная надпись ----------
function stampBlock(x, y, w, h, st) {
  const r1 = y + h * 0.42, c1 = x + w * 0.24;
  const b1 = x + w * 0.52, c2 = x + w * 0.63, c3 = x + w * 0.775, c4 = x + w * 0.885;
  const A = CTX.author, O = CTX.object || {};
  let s = `<g data-el="stamp" stroke="#1C1C1C" stroke-width="1" fill="none"><rect x="${x}" y="${y}" width="${w}" height="${h}"/>
<line x1="${x}" y1="${r1}" x2="${x + w}" y2="${r1}"/><line x1="${c1}" y1="${y}" x2="${c1}" y2="${r1}"/>
<line x1="${b1}" y1="${r1}" x2="${b1}" y2="${y + h}"/>
<line x1="${c2}" y1="${r1}" x2="${c2}" y2="${y + h}"/><line x1="${c3}" y1="${r1}" x2="${c3}" y2="${y + h}"/><line x1="${c4}" y1="${r1}" x2="${c4}" y2="${y + h}"/></g>`;
  const lbl = (tx, ty, t) => `<text x="${tx}" y="${ty}" font-size="9.5" fill="#7A756D">${esc(t)}</text>`;
  const val = (tx, ty, t, sz, w2) => `<text x="${tx}" y="${ty}" font-size="${sz || 11}" font-weight="${w2 || 400}" fill="#1C1C1C">${esc(t)}</text>`;
  const sm = (tx, ty, t) => `<text x="${tx}" y="${ty}" font-size="8.2" fill="#57514A">${esc(t)}</text>`;
  s += lbl(x + 7, y + 11, 'Разработал') + val(x + 7, y + 26, A.name, 12, 700);
  s += sm(x + 7, y + 37, `${A.role} · LINEA`) + sm(x + 7, y + 47, A.phone) + sm(x + 7, y + 57, A.email);
  s += lbl(c1 + 7, y + 13, 'Объект') + val(c1 + 7, y + 30, O.address || 'Объект', 12, 600);
  s += lbl(c1 + 7, y + 43, `${O.type || 'участок'} · ${O.area || '—'} м² · ${O.sub || 'ландшафтный проект'}`);
  s += lbl(x + 7, r1 + 13, 'Наименование листа');
  const nmL = wrapText(String(st.name), 42);
  nmL.slice(0, 2).forEach((ln, i) => { s += val(x + 7, r1 + 30 + i * 14, ln, nmL.length > 1 ? 11 : 12.5, 600); });
  s += lbl(b1 + 7, r1 + 13, 'Стадия') + val(b1 + 7, r1 + 30, CTX.object.stage || 'РП', 12, 600);
  s += lbl(c2 + 7, r1 + 13, 'Масштаб') + val(c2 + 7, r1 + 30, st.ratio === '—' ? 'б/м' : 'М 1:' + st.ratio, 12, 600);
  s += lbl(c3 + 7, r1 + 13, 'Лист') + val(c3 + 7, r1 + 30, String(st.sheet), 12, 600);
  s += lbl(c4 + 7, r1 + 13, 'Листов') + val(c4 + 7, r1 + 30, String(CTX.total || '—'), 12, 600);
  s += `<text x="${x + w - 7}" y="${y + h - 6}" font-size="9.5" fill="#8A8478" text-anchor="end">${CTX.mono ? 'ч/б · ' : ''}${CTX.date}</text>`;
  return s;
}

// ---------- лист ----------
// opts: {
//   no, name, type, body,            — body рисуется в модельных единицах и масштабируется
//   panel(x, y, w, h), footer(x, y, w, h) — блоки в БУМАЖНЫХ координатах (кегль сразу в px листа)
//   panelW, footerH, series: 'plan'|'node'|'none', fixed: знаменатель
// }
// Панели держим вне масштабируемой группы намеренно: таблица легенды не должна
// растягиваться вместе с планом, иначе масштаб в штампе перестаёт быть правдой.
function sheet(opts) {
  const body = opts.body || '';
  const fx = PAGE.ml, fy = PAGE.mt, fw = PAGE.w - PAGE.ml - PAGE.mr, fh = PAGE.h - PAGE.mt - PAGE.mb;
  const panelW = opts.panel ? (opts.panelW || 600) : 0;
  const footerH = opts.footer ? (opts.footerH || 150) : 0;
  const head = takeTitle();
  const headH = head ? 38 : 0;
  const fieldW = fw - 24 - (panelW ? panelW + 16 : 0);
  const fieldH = fh - STAMP.h - 26 - footerH - headH;
  const series = opts.series === 'node' ? NODE_SERIES : PLAN_SERIES;
  const free = opts.series === 'none';
  // первый проход — по геометрии без текста, второй — с текстом в нормализованном кегле
  const geom = contentBox(body.replace(/<text\b[^>]*>[^<]*<\/text>/g, ''), 1) || { x0: 0, y0: 0, x1: 100, y1: 100 };
  const kFor = bb => {
    const cw = Math.max(20, bb.x1 - bb.x0), ch = Math.max(20, bb.y1 - bb.y0);
    if (free) return [Math.min(fieldW / cw, fieldH / ch), 1];
    if (opts.fixed) { const f = series.find(r => r[0] === opts.fixed); if (f) return [f[1], f[0]]; }
    for (const [r, kk] of series) if (cw * kk <= fieldW && ch * kk <= fieldH) return [kk, r];
    return series[series.length - 1].slice().reverse();
  };
  let [k, ratio] = kFor(geom);
  const cK = Math.max(0.02, Math.min(1.6, K_REF / k));
  const bb = contentBox(body, cK) || geom;
  [k, ratio] = kFor(bb);
  const cw = Math.max(20, bb.x1 - bb.x0), ch = Math.max(20, bb.y1 - bb.y0);
  if (process.env.LINEA_DEBUG_FIT) {
    console.log(`FIT ${opts.name} | bb ${bb.x0.toFixed(0)},${bb.y0.toFixed(0)}→${bb.x1.toFixed(0)},${bb.y1.toFixed(0)} | ${cw.toFixed(0)}×${ch.toFixed(0)} мод. | 1:${ratio} | на бумаге ${(cw * k / PXMM).toFixed(0)}×${(ch * k / PXMM).toFixed(0)} мм из ${(fieldW / PXMM).toFixed(0)}×${(fieldH / PXMM).toFixed(0)}`);
  }
  const ox = fx + 12 + Math.max(0, (fieldW - cw * k) / 2) - bb.x0 * k;
  const oy = fy + 16 + headH + Math.max(0, (fieldH - ch * k) / 2) - bb.y0 * k;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.w}" height="${PAGE.h}" viewBox="0 0 ${PAGE.w} ${PAGE.h}" font-family="${FONT}" data-sheet="${opts.type || 'plan'}" data-scale="1:${free ? 1 : ratio}">`;
  s += `<rect width="${PAGE.w}" height="${PAGE.h}" fill="${L.paper}"/>`;
  s += `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="none" stroke="${L.frame}" stroke-width="1.6"/>`;
  s += `<g transform="translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${k.toFixed(4)})">${normalizeInk(body, k)}</g>`;
  if (head) {
    s += `<g data-el="heading"><text x="${fx + 16}" y="${fy + 30}" font-size="17" font-weight="700" fill="${L.ink}">${esc(head.t)}</text>`;
    if (head.sub) s += `<text x="${fx + 16}" y="${fy + 46}" font-size="11" fill="${L.grey}">${esc(head.sub)}</text>`;
    s += `</g>`;
  }
  if (opts.panel) s += `<g data-el="panel">${opts.panel(fx + fw - panelW - 10, fy + 16 + headH, panelW, fh - STAMP.h - 34 - headH)}</g>`;
  if (opts.footer) s += `<g data-el="footer">${opts.footer(fx + 14, fy + fh - STAMP.h - footerH - 4, fw - STAMP.w - 30, footerH)}</g>`;
  s += stampBlock(fx + fw - STAMP.w, fy + fh - STAMP.h, STAMP.w, STAMP.h, { name: opts.name, sheet: opts.no, ratio: free ? '—' : ratio });
  if (!free) {
    const ctrl = 10 * S * k;
    const bx = fx + 16, by = fy + fh - 22;
    s += `<g stroke="${L.frame}" stroke-width="1" fill="none"><line x1="${bx}" y1="${by}" x2="${bx + ctrl}" y2="${by}"/>`
      + `<line x1="${bx}" y1="${by - 5}" x2="${bx}" y2="${by + 5}"/><line x1="${bx + ctrl}" y1="${by - 5}" x2="${bx + ctrl}" y2="${by + 5}"/></g>`
      + `<rect x="${bx}" y="${by - 4}" width="${ctrl / 2}" height="4" fill="${L.frame}"/>`;
    s += `<text x="${bx}" y="${by - 9}" font-size="9.5" fill="#57514A">контроль: 10 м в натуре · печать 1:1, без подгонки под лист</text>`;
    s += `<text x="${bx + ctrl + 8}" y="${by + 4}" font-size="9.5" fill="#57514A">10 м</text>`;
  }
  return (CTX.mono ? monoize(s) : s) + `</svg>`;
}

// ================================================================
// примитивы чертежа (модельные единицы: 1 м = S px)
// ================================================================
const mx = v => +(v * S).toFixed(2);

// размерная линия с засечками (ГОСТ 2.307: на строительных чертежах засечки под 45°)
function dimH(x1, x2, y, label) {
  const f = 11, txt = label != null ? label : fmtM(Math.abs(x2 - x1) / S);
  const tight = String(txt).length * f * 0.53 > Math.abs(x2 - x1) - 4;
  const dy = tight ? -8 : -4;
  return `<g data-el="dim" stroke="${L.dim}" stroke-width="${W.thin}" fill="none">`
    + `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>`
    + `<line x1="${x1}" y1="${y - 4}" x2="${x1}" y2="${y + 4}"/><line x1="${x2}" y1="${y - 4}" x2="${x2}" y2="${y + 4}"/>`
    + `<line x1="${x1 - 2.5}" y1="${y + 2.5}" x2="${x1 + 2.5}" y2="${y - 2.5}"/><line x1="${x2 - 2.5}" y1="${y + 2.5}" x2="${x2 + 2.5}" y2="${y - 2.5}"/></g>`
    + `<text x="${(x1 + x2) / 2}" y="${y + dy}" font-size="${f}" fill="${L.dim}" text-anchor="middle">${esc(txt)}</text>`;
}
function dimV(x, y1, y2, label) {
  const f = 11, txt = label != null ? label : fmtM(Math.abs(y2 - y1) / S);
  const my = (y1 + y2) / 2;
  return `<g data-el="dim" stroke="${L.dim}" stroke-width="${W.thin}" fill="none">`
    + `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/>`
    + `<line x1="${x - 4}" y1="${y1}" x2="${x + 4}" y2="${y1}"/><line x1="${x - 4}" y1="${y2}" x2="${x + 4}" y2="${y2}"/>`
    + `<line x1="${x - 2.5}" y1="${y1 + 2.5}" x2="${x + 2.5}" y2="${y1 - 2.5}"/><line x1="${x - 2.5}" y1="${y2 + 2.5}" x2="${x + 2.5}" y2="${y2 - 2.5}"/></g>`
    + `<text x="${x - 5}" y="${my}" font-size="${f}" fill="${L.dim}" transform="rotate(-90 ${x - 5} ${my})" text-anchor="middle">${esc(txt)}</text>`;
}
// выносная линия к размерной цепочке
const witness = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${L.dim}" stroke-width="${W.aux}" stroke-dasharray="4 3"/>`;

// отметка уровня на плане (ГОСТ Р 21.101-2020, 5.4.3): число в прямоугольнике
function levelPlan(x, y, m, opt) {
  opt = opt || {};
  const v = (m < 0 ? '' : '+') + Math.abs(m).toFixed(3).replace('.', ',').replace(/^/, m < 0 ? '-' : '');
  const w = 34, h = 12;
  return `<g data-el="level"><rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" fill="#FFFFFF" fill-opacity="0.85" stroke="${L.dim}" stroke-width="${W.aux}"/>`
    + `<text x="${x}" y="${y + 3.6}" font-size="9.6" fill="${L.dim}" text-anchor="middle">${v}</text></g>`;
}
// стрелка уклона с промилле (ГОСТ Р 21.101-2020, 5.4.6)
function slopeArrow(x1, y1, x2, y2, promille) {
  const a = Math.atan2(y2 - y1, x2 - x1), L1 = 6;
  const hx = x2 - L1 * Math.cos(a - 0.4), hy = y2 - L1 * Math.sin(a - 0.4);
  const gx = x2 - L1 * Math.cos(a + 0.4), gy = y2 - L1 * Math.sin(a + 0.4);
  const midx = (x1 + x2) / 2, midy = (y1 + y2) / 2;
  const deg = a * 180 / Math.PI, flip = Math.abs(deg) > 90;
  return `<g data-el="slope" stroke="${L.water}" stroke-width="${W.thin}" fill="none">`
    + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><path d="M${x2} ${y2} L${hx} ${hy} M${x2} ${y2} L${gx} ${gy}"/></g>`
    + `<text x="${midx}" y="${midy - 4}" font-size="9.6" fill="${L.water}" text-anchor="middle" transform="rotate(${(flip ? deg + 180 : deg).toFixed(1)} ${midx} ${midy - 4})">i=${promille}</text>`;
}
// указатель севера
function north(x, y, r, angleDeg) {
  const a = (angleDeg || 0) * Math.PI / 180;
  const p = (rr, aa) => [x + rr * Math.sin(aa), y - rr * Math.cos(aa)];
  const [tx, ty] = p(r, a), [lx, ly] = p(r * 0.42, a + 2.5), [rx, ry] = p(r * 0.42, a - 2.5), [cx, cy] = p(0, a);
  return `<g data-el="north"><circle cx="${x}" cy="${y}" r="${r}" fill="#FFFFFF" fill-opacity="0.82" stroke="${L.ink}" stroke-width="${W.thin}"/>`
    + `<polygon points="${tx.toFixed(1)},${ty.toFixed(1)} ${lx.toFixed(1)},${ly.toFixed(1)} ${cx.toFixed(1)},${cy.toFixed(1)}" fill="${L.ink}"/>`
    + `<polygon points="${tx.toFixed(1)},${ty.toFixed(1)} ${rx.toFixed(1)},${ry.toFixed(1)} ${cx.toFixed(1)},${cy.toFixed(1)}" fill="#FFFFFF" stroke="${L.ink}" stroke-width="${W.aux}"/>`
    + `<text x="${x}" y="${y - r - 5}" font-size="11" font-weight="700" fill="${L.ink}" text-anchor="middle">С</text></g>`;
}
// линия-выноска с полкой (ГОСТ 2.316)
function leader(px, py, tx, ty, text, opt) {
  opt = opt || {};
  const anchor = opt.anchor || (tx < px ? 'end' : 'start');
  const lines = Array.isArray(text) ? text : [text];
  // Полка фиксированной длины: раньше она рисовалась «под текст» в модельных
  // единицах, а после нормализации кегля надпись становилась вдвое короче —
  // полка уезжала за пределы чертежа и тянула за собой габарит листа.
  const sh = (anchor === 'end' ? -1 : 1) * (opt.shelf || 10);
  let s = `<g data-el="callout" stroke="${L.ink}" stroke-width="${W.aux}" fill="none">`
    + `<circle cx="${px}" cy="${py}" r="1.6" fill="${L.ink}"/><line x1="${px}" y1="${py}" x2="${tx}" y2="${ty}"/>`
    + `<line x1="${tx}" y1="${ty}" x2="${tx + sh}" y2="${ty}"/></g>`;
  lines.forEach((t, i) => {
    s += `<text x="${tx + sh + (anchor === 'end' ? -2 : 2)}" y="${ty - 3 + i * 11}" font-size="10" fill="${L.ink}" text-anchor="${anchor === 'end' ? 'end' : 'start'}">${esc(t)}</text>`;
  });
  return s;
}
// номер позиции в кружке
function pos(x, y, n, color) {
  return `<g data-el="pos"><circle cx="${x}" cy="${y}" r="7.6" fill="#FFFFFF" stroke="${color || L.ink}" stroke-width="${W.thin}"/>`
    + `<text x="${x}" y="${y + 3.6}" font-size="10.5" font-weight="700" fill="${color || L.ink}" text-anchor="middle">${n}</text></g>`;
}
// блок легенды
function legend(x, y, w, title, rows, opt) {
  opt = opt || {};
  const rh = opt.rh || 17;
  let s = `<g data-el="legend"><rect x="${x}" y="${y}" width="${w}" height="${28 + rows.length * rh}" fill="#FFFFFF" stroke="${L.grey}" stroke-width="${W.thin}"/>`;
  s += `<text x="${x + 8}" y="${y + 17}" font-size="12" font-weight="700" fill="${L.ink}">${esc(title)}</text>`;
  rows.forEach((r, i) => {
    const yy = y + 28 + i * rh + rh / 2;
    s += r.sym ? r.sym(x + 16, yy) : '';
    const txt = wrapText(r.text, opt.wrap || 46);
    txt.slice(0, 2).forEach((t, j) => {
      s += `<text x="${x + 30}" y="${yy + 3.4 + j * 10}" font-size="${opt.f || 10}" fill="${L.ink}">${esc(t)}</text>`;
    });
  });
  return s + `</g>`;
}
// таблица (спецификация, ведомость) — колонки [{t, w, align}]
function table(x, y, cols, rows, opt) {
  opt = opt || {};
  const hh = opt.hh || 22, rh = opt.rh || 16, f = opt.f || 10;
  const w = cols.reduce((s2, c) => s2 + c.w, 0);
  let s = `<g data-el="spec"><rect x="${x}" y="${y}" width="${w}" height="${hh + rows.length * rh}" fill="#FFFFFF" stroke="${L.ink}" stroke-width="${W.thin}"/>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="#EFEBE3" stroke="${L.ink}" stroke-width="${W.thin}"/>`;
  let cx = x;
  cols.forEach((c, i) => {
    if (i) s += `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + hh + rows.length * rh}" stroke="${L.grey}" stroke-width="${W.aux}"/>`;
    const tx = c.align === 'middle' ? cx + c.w / 2 : c.align === 'end' ? cx + c.w - 5 : cx + 5;
    s += `<text x="${tx}" y="${y + hh / 2 + 4}" font-size="${f + 0.5}" font-weight="700" fill="${L.ink}" text-anchor="${c.align || 'start'}">${esc(c.t)}</text>`;
    cx += c.w;
  });
  rows.forEach((r, ri) => {
    const yy = y + hh + ri * rh;
    s += `<line x1="${x}" y1="${yy}" x2="${x + w}" y2="${yy}" stroke="${L.grey}" stroke-width="${W.aux}"/>`;
    let cx2 = x;
    cols.forEach((c, ci) => {
      const v = r[ci] == null ? '' : String(r[ci]);
      const tx = c.align === 'middle' ? cx2 + c.w / 2 : c.align === 'end' ? cx2 + c.w - 5 : cx2 + 5;
      const fit = Math.max(6, Math.floor(c.w / (f * 0.5)));
      const parts = v.length > fit ? wrapText(v, fit).slice(0, 2) : [v];
      parts.forEach((p, pi) => {
        s += `<text x="${tx}" y="${yy + (parts.length > 1 ? rh / 2 - 1 + pi * 9 : rh / 2 + 3.6)}" font-size="${parts.length > 1 ? f - 1 : f}" fill="${L.ink}" text-anchor="${c.align || 'start'}">${esc(p)}</text>`;
      });
      cx2 += c.w;
    });
  });
  return s + `</g>`;
}
// нумерованные примечания
function notes(x, y, w, items, opt) {
  opt = opt || {};
  const wrap = opt.wrap || Math.floor(w / 5);
  let s = `<text x="${x}" y="${y}" font-size="12" font-weight="700" fill="${L.ink}">Примечания</text>`;
  let yy = y + 16;
  items.forEach((t, i) => {
    const lines = wrapText(t, wrap);
    lines.forEach((ln, j) => {
      s += `<text x="${x + (j ? 14 : 0)}" y="${yy}" font-size="10" fill="#33312E">${j ? '' : (i + 1) + '. '}${esc(ln)}</text>`;
      yy += 12;
    });
    yy += 2;
  });
  return s;
}
// Заголовок листа. Раньше он рисовался внутри масштабируемой группы и своей
// длиной определял масштаб всего чертежа: длинное название уводило план на
// ступень мельче. Теперь заголовок регистрируется и печатается в координатах листа.
let LAST_TITLE = null;
function title(x, y, t, sub) {
  LAST_TITLE = { t, sub };
  return '';
}
function takeTitle() { const t = LAST_TITLE; LAST_TITLE = null; return t; }

module.exports = {
  PAGE, PXMM, STAMP, FONT, S, L, F, W, PEN_MM, TEXT_MM, PLAN_SERIES, NODE_SERIES,
  setup, sheet, esc, wrapText, nm, fmtM, mx, takeTitle,
  dimH, dimV, witness, levelPlan, slopeArrow, north, leader, pos, legend, table, notes, title,
  contentBox, normalizeInk
};
