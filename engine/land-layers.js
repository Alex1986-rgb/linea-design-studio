'use strict';
// ================================================================
// LINEA · слои ландшафтного чертежа
// Всё рисуется в модельных координатах (1 м = P.S px), система координат листа:
// север сверху, улица справа, глубина участка влево.
// ================================================================
const P = require('./paper');
const L = P.L, W = P.W, esc = P.esc;

// ---------- заливки ----------
function defs() {
  return `<defs>
<pattern id="pv-tile" width="9" height="9" patternUnits="userSpaceOnUse">
  <rect width="9" height="9" fill="${L.paveOld}"/>
  <path d="M0 4.5H9M4.5 0V4.5M0 9H9M0 0H9" stroke="#B9AF9E" stroke-width="0.4" fill="none"/></pattern>
<pattern id="pv-new" width="9" height="9" patternUnits="userSpaceOnUse">
  <rect width="9" height="9" fill="${L.paveNew}"/>
  <path d="M0 4.5H9M4.5 4.5V9M0 9H9M0 0H9" stroke="#A69884" stroke-width="0.4" fill="none"/></pattern>
<pattern id="pv-gravel" width="7" height="7" patternUnits="userSpaceOnUse">
  <rect width="7" height="7" fill="${L.gravel}"/>
  <circle cx="1.8" cy="2.1" r="0.55" fill="#A79C88"/><circle cx="5.1" cy="4.6" r="0.5" fill="#A79C88"/>
  <circle cx="3.4" cy="6.2" r="0.42" fill="#B3A894"/><circle cx="6.2" cy="1.3" r="0.42" fill="#B3A894"/></pattern>
<pattern id="pv-deck" width="12" height="6" patternUnits="userSpaceOnUse">
  <rect width="12" height="6" fill="${L.deck}" fill-opacity="0.55"/>
  <path d="M0 0H12M0 6H12" stroke="#8A6238" stroke-width="0.45" fill="none"/></pattern>
<pattern id="pv-rubber" width="6" height="6" patternUnits="userSpaceOnUse">
  <rect width="6" height="6" fill="${L.rubber}" fill-opacity="0.6"/>
  <circle cx="3" cy="3" r="0.9" fill="#B87A70" fill-opacity="0.7"/></pattern>
<pattern id="pv-lawn" width="10" height="10" patternUnits="userSpaceOnUse">
  <rect width="10" height="10" fill="${L.lawn}"/>
  <path d="M2 8l1-2.6 1 2.6M6.4 4.2l1-2.6 1 2.6" stroke="${L.lawnLine}" stroke-width="0.4" fill="none"/></pattern>
<pattern id="pv-veg" width="8" height="8" patternUnits="userSpaceOnUse">
  <rect width="8" height="8" fill="#EFE6CE"/>
  <path d="M0 2H8M0 5H8" stroke="#C2AC79" stroke-width="0.45" fill="none"/></pattern>
<pattern id="pv-build" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
  <rect width="7" height="7" fill="#DDDAD4"/>
  <path d="M0 0V7" stroke="#8E8E8E" stroke-width="0.75" fill="none"/></pattern>
<pattern id="pv-bed" width="8" height="8" patternUnits="userSpaceOnUse">
  <rect width="8" height="8" fill="#F6EDF1"/>
  <circle cx="2" cy="2.6" r="0.75" fill="#D5A7BC"/><circle cx="5.8" cy="5.4" r="0.65" fill="#C98FAA"/></pattern>
<pattern id="pv-water" width="8" height="8" patternUnits="userSpaceOnUse">
  <rect width="8" height="8" fill="#E4F1F6"/>
  <path d="M0 4q2-1.6 4 0t4 0" stroke="#8CC3D8" stroke-width="0.45" fill="none"/></pattern>
</defs>`;
}
const FILL = {
  tile: 'url(#pv-tile)', tileNew: 'url(#pv-new)', gravel: 'url(#pv-gravel)', deck: 'url(#pv-deck)',
  rubber: 'url(#pv-rubber)', lawn: 'url(#pv-lawn)', veg: 'url(#pv-veg)', build: 'url(#pv-build)',
  bed: 'url(#pv-bed)', water: 'url(#pv-water)'
};

// ---------- границы участка и забор ----------
function siteFrame(M, opt) {
  opt = opt || {};
  const b = M.brief, S = M.S, D = b.site.depth, Wd = b.site.width;
  const o = M.box({ x: 0, y: 0, w: Wd, d: D });
  let s = `<g data-el="site">`;
  // граница участка — толстая штрихпунктирная (ГОСТ 21.508: границы отвода)
  s += `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${opt.fill || '#FFFFFF'}" stroke="${L.border}" stroke-width="${W.cut}" stroke-dasharray="26 6 4 6"/>`;
  // забор по трём сторонам (профлист) — сплошная тонкая с засечками
  const fen = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#6E6A63" stroke-width="${W.vis}"/>`;
  s += fen(o.x, o.y, o.x + o.w, o.y) + fen(o.x, o.y + o.h, o.x + o.w, o.y + o.h) + fen(o.x, o.y, o.x, o.y + o.h);
  // фронтальная сторона с воротами и калиткой
  const [gx1] = M.pt(13.5, 0), [gx2] = M.pt(17.5, 0);
  const yTopG = M.py(13.5), yBotG = M.py(17.5), yK1 = M.py(12.0), yK2 = M.py(13.1);
  const fx = o.x + o.w;
  s += fen(fx, o.y, fx, yK1) + fen(fx, yK2, fx, yTopG) + fen(fx, yBotG, fx, o.y + o.h);
  // ворота откатные (ГОСТ 21.204: условное обозначение — тонкая линия со стрелкой отката)
  s += `<g data-el="gate" stroke="${L.ink}" stroke-width="${W.vis}" fill="none">`
    + `<line x1="${fx}" y1="${yTopG}" x2="${fx}" y2="${yBotG}" stroke-dasharray="5 3"/>`
    + `<path d="M${fx - 3} ${yBotG - 4} L${fx - 3} ${yTopG + 4}" stroke-width="${W.thin}"/>`
    + `<path d="M${fx - 3} ${yTopG + 4} l3 3 M${fx - 3} ${yTopG + 4} l-3 3" stroke-width="${W.thin}"/></g>`
    ;
  if (opt.gates !== false) s += `<text x="${fx + 6}" y="${(yTopG + yBotG) / 2}" font-size="10" fill="${L.ink}" transform="rotate(-90 ${fx + 6} ${(yTopG + yBotG) / 2})" text-anchor="middle">ворота откатные 4,0 м</text>`;
  s += `<g stroke="${L.ink}" stroke-width="${W.thin}" fill="none"><line x1="${fx}" y1="${yK1}" x2="${fx}" y2="${yK2}" stroke-dasharray="3 2"/>`
    + `<path d="M${fx} ${yK1} a11 11 0 0 1 -11 11" stroke-dasharray="2 2"/></g>`
    ;
  if (opt.gates !== false) s += `<text x="${fx + 6}" y="${(yK1 + yK2) / 2 + 3}" font-size="10" fill="${L.ink}">калитка</text>`;
  if (opt.neighbours !== false) {
    s += `<text x="${o.x + o.w / 2}" y="${o.y - 9}" font-size="10.5" fill="${L.grey}" text-anchor="middle">граница участка · соседний участок (север)</text>`;
    s += `<text x="${o.x + o.w / 2}" y="${o.y + o.h + 15}" font-size="10.5" fill="${L.grey}" text-anchor="middle">граница участка · соседний участок (юг)</text>`;
    s += `<text x="${o.x - 8}" y="${o.y + o.h / 2}" font-size="10.5" fill="${L.grey}" text-anchor="middle" transform="rotate(-90 ${o.x - 8} ${o.y + o.h / 2})">задняя граница · открытый вид на поле</text>`;
    s += `<text x="${fx + 30}" y="${o.y + o.h / 2}" font-size="10.5" fill="${L.grey}" text-anchor="middle" transform="rotate(-90 ${fx + 30} ${o.y + o.h / 2})">улица</text>`;
  }
  return s + `</g>`;
}

// ---------- постройки ----------
function building(M, o, opt) {
  opt = opt || {};
  const b = M.box(o);
  const fill = opt.fill || (opt.isNew ? '#F0E2D2' : FILL.build);
  const stroke = opt.isNew ? L.buildNew : L.ink;
  let s = `<g data-el="building"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${fill}" stroke="${stroke}" stroke-width="${W.cut}"${opt.isNew ? ' stroke-dasharray="8 3"' : ''}/>`;
  if (opt.label !== false) {
    // подпись строим по короткому имени: полное не влезает в контур и рвётся переносом
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const f = opt.f || 11;
    const name = o.short || o.name;
    const fits = name.length * f * 0.5 <= b.w - 6;
    const area = opt.area && o.area ? `${P.nm(o.area)} м²` : '';
    if (fits) {
      s += `<text x="${cx}" y="${cy + (area ? -1 : 3)}" font-size="${f}" font-weight="600" fill="${L.ink}" text-anchor="middle">${esc(name)}</text>`;
      if (area) s += `<text x="${cx}" y="${cy + 11}" font-size="9.6" fill="${L.grey}" text-anchor="middle">${esc(area)}</text>`;
    } else {
      // мелкий контур — подпись рядом, на полке; сторону выбираем так, чтобы
      // надпись осталась в поле чертежа, а не ушла за границу участка
      const tw = (name.length + (area ? area.length + 3 : 0)) * f * 0.3;
      const fitsRight = (b.x + b.w + 12 + tw) < (opt.limit == null ? 1e9 : opt.limit);
      const fitsLeft = (b.x - 12 - tw) > (opt.minX == null ? -1e9 : opt.minX);
      const right = opt.side !== 'left' && (fitsRight || !fitsLeft);
      const lx = right ? b.x + b.w : b.x;
      const dir = right ? 1 : -1;
      s += `<line x1="${lx}" y1="${cy}" x2="${lx + dir * 7}" y2="${cy}" stroke="${L.ink}" stroke-width="${W.aux}"/>`;
      s += `<text x="${lx + dir * 9}" y="${cy + 3}" font-size="${f}" font-weight="600" fill="${L.ink}" text-anchor="${right ? 'start' : 'end'}">${esc(name)}${area ? ' · ' + esc(area) : ''}</text>`;
    }
  }
  return s + `</g>`;
}

// мощение / площадка
function pave(M, o, kind, opt) {
  opt = opt || {};
  const fill = { tile: FILL.tile, tileNew: FILL.tileNew, gravel: FILL.gravel, deck: FILL.deck, rubber: FILL.rubber, veg: FILL.veg, water: FILL.water }[kind] || FILL.tile;
  if (o.r != null) {
    const [cx, cy] = M.pt(o.cx, o.cy);
    return `<circle cx="${cx}" cy="${cy}" r="${M.len(o.r)}" fill="${fill}" stroke="${opt.stroke || '#9A9184'}" stroke-width="${W.thin}"/>`;
  }
  const b = M.box(o);
  return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${fill}" stroke="${opt.stroke || '#9A9184'}" stroke-width="${W.thin}"${opt.rx ? ` rx="${opt.rx}"` : ''}/>`;
}

// дорожка по осевой линии заданной ширины
function pathway(M, pts, wM, kind, opt) {
  opt = opt || {};
  const half = M.len(wM) / 2;
  const pp = pts.map(([x, y]) => M.pt(x, y));
  const left = [], right = [];
  for (let i = 0; i < pp.length; i++) {
    const a = pp[Math.max(0, i - 1)], c = pp[Math.min(pp.length - 1, i + 1)];
    let dx = c[0] - a[0], dy = c[1] - a[1];
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    left.push([pp[i][0] - dy * half, pp[i][1] + dx * half]);
    right.push([pp[i][0] + dy * half, pp[i][1] - dx * half]);
  }
  const poly = left.concat(right.reverse()).map(p2 => `${p2[0].toFixed(1)},${p2[1].toFixed(1)}`).join(' ');
  const fill = { tile: FILL.tileNew, gravel: FILL.gravel, step: FILL.gravel, deck: FILL.deck }[kind] || FILL.tileNew;
  let s = `<polygon points="${poly}" fill="${fill}" stroke="#9A9184" stroke-width="${W.thin}"/>`;
  if (kind === 'step') {                      // шаговая дорожка — плиты по гравию
    for (let i = 0; i < pp.length - 1; i++) {
      const steps = Math.max(1, Math.round(Math.hypot(pp[i + 1][0] - pp[i][0], pp[i + 1][1] - pp[i][1]) / 6));
      for (let j = 0; j <= steps; j++) {
        const t = j / steps, x = pp[i][0] + (pp[i + 1][0] - pp[i][0]) * t, y = pp[i][1] + (pp[i + 1][1] - pp[i][1]) * t;
        s += `<rect x="${(x - half * 0.75).toFixed(1)}" y="${(y - 2.4).toFixed(1)}" width="${(half * 1.5).toFixed(1)}" height="4.8" fill="#CFC7B8" stroke="#9A9184" stroke-width="${W.aux}" rx="1"/>`;
      }
    }
  }
  return s;
}

// газон (заливка полигона участка минус объекты — упрощённо прямоугольниками зон)
function lawnArea(M, o, opt) {
  opt = opt || {};
  const b = M.box(o);
  return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${FILL.lawn}" stroke="none"${opt.rx ? ` rx="${opt.rx}"` : ''}/>`;
}

// ---------- растения ----------
// лиственное дерево: «облако» из дуг
function tree(M, x, y, crownM, opt) {
  opt = opt || {};
  const [cx, cy] = M.pt(x, y), r = M.len(crownM) / 2;
  const n = 11, col = opt.color || (opt.existing ? L.treeOld : L.tree);
  let d = '';
  for (let i = 0; i < n; i++) {
    const a1 = (i / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2;
    const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    const p2 = [cx + r * Math.cos(a2), cy + r * Math.sin(a2)];
    d += (i ? '' : `M${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`) + `A${(r * 0.42).toFixed(1)} ${(r * 0.42).toFixed(1)} 0 0 1 ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  let s = `<g data-el="tree"><path d="${d}Z" fill="${opt.fill || (opt.existing ? '#E4EFE2' : '#DCEFD6')}" fill-opacity="${opt.op || 0.9}" stroke="${col}" stroke-width="${W.vis}"${opt.existing ? '' : ''}/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="1.5" fill="${col}"/>`;
  if (opt.cross) s += `<path d="M${cx - r * 0.45} ${cy}H${cx + r * 0.45}M${cx} ${cy - r * 0.45}V${cy + r * 0.45}" stroke="${col}" stroke-width="${W.aux}"/>`;
  return s + `</g>`;
}
// хвойное: звезда
function conifer(M, x, y, crownM, opt) {
  opt = opt || {};
  const [cx, cy] = M.pt(x, y), r = M.len(crownM) / 2, n = 12;
  let pts = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.55 : r;
    pts += `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)} `;
  }
  return `<g data-el="tree"><polygon points="${pts.trim()}" fill="#DCE8DA" fill-opacity="0.9" stroke="${opt.color || '#2F6B4F'}" stroke-width="${W.vis}"/>`
    + `<circle cx="${cx}" cy="${cy}" r="1.4" fill="${opt.color || '#2F6B4F'}"/></g>`;
}
// кустарник: группа кружков
function shrub(M, x, y, dM, opt) {
  opt = opt || {};
  const [cx, cy] = M.pt(x, y), r = M.len(dM) / 2;
  const col = opt.color || L.shrub;
  let s = `<g data-el="shrub"><circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="${opt.fill || '#E1EEDD'}" fill-opacity="0.9" stroke="${col}" stroke-width="${W.thin}" stroke-dasharray="${opt.dash || '2.4 1.6'}"/>`;
  return s + `</g>`;
}
// рядовая посадка (живая изгородь) по отрезку
function hedgeLine(M, a, b2, stepM, dM, opt) {
  opt = opt || {};
  const [x1, y1] = M.pt(a[0], a[1]), [x2, y2] = M.pt(b2[0], b2[1]);
  const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.round(len / M.len(stepM)));
  let s = `<g data-el="hedge">`;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(M.len(dM) / 2).toFixed(1)}" fill="${opt.fill || '#D9E9D3'}" fill-opacity="0.85" stroke="${opt.color || L.shrub}" stroke-width="${W.thin}"/>`;
  }
  return s + `</g>` ;
}
// цветник: контур с заливкой
function flowerBed(M, o, opt) {
  opt = opt || {};
  if (o.r != null) {
    const [cx, cy] = M.pt(o.cx, o.cy);
    return `<circle cx="${cx}" cy="${cy}" r="${M.len(o.r)}" fill="${FILL.bed}" fill-opacity="0.9" stroke="${L.flower}" stroke-width="${W.thin}" stroke-dasharray="4 2"/>`;
  }
  const b = M.box(o);
  return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${FILL.bed}" fill-opacity="0.9" stroke="${L.flower}" stroke-width="${W.thin}" stroke-dasharray="4 2" rx="${opt.rx == null ? 4 : opt.rx}"/>`;
}

// ---------- инженерия ----------
function lampSym(x, y, kind, opt) {
  opt = opt || {};
  const c = opt.color || L.light;
  if (kind === 'bollard') return `<g data-el="light"><circle cx="${x}" cy="${y}" r="3.6" fill="#FFF6DA" stroke="${c}" stroke-width="${W.thin}"/><path d="M${x} ${y - 5.4}V${y + 5.4}" stroke="${c}" stroke-width="${W.aux}"/></g>`;
  if (kind === 'ground') return `<g data-el="light"><circle cx="${x}" cy="${y}" r="3" fill="${c}" fill-opacity="0.25" stroke="${c}" stroke-width="${W.thin}"/><path d="M${x - 4.2} ${y}H${x + 4.2}" stroke="${c}" stroke-width="${W.aux}"/></g>`;
  if (kind === 'flood') return `<g data-el="light"><rect x="${x - 4}" y="${y - 2.6}" width="8" height="5.2" fill="#FFF1C9" stroke="${c}" stroke-width="${W.thin}"/><path d="M${x + 4} ${y}l5 -2.6M${x + 4} ${y}l5 2.6" stroke="${c}" stroke-width="${W.aux}" fill="none"/></g>`;
  if (kind === 'wall') return `<g data-el="light"><path d="M${x - 3.4} ${y - 3.4}h6.8v6.8h-6.8z" fill="#FFF6DA" stroke="${c}" stroke-width="${W.thin}"/><path d="M${x - 3.4} ${y - 3.4}l6.8 6.8M${x + 3.4} ${y - 3.4}l-6.8 6.8" stroke="${c}" stroke-width="${W.aux}"/></g>`;
  return `<circle cx="${x}" cy="${y}" r="3" fill="${c}"/>`;
}
function sprinkler(x, y, kind, opt) {
  opt = opt || {};
  const c = opt.color || L.irr;
  if (kind === 'rotor') return `<g data-el="irr"><circle cx="${x}" cy="${y}" r="3.4" fill="#FFFFFF" stroke="${c}" stroke-width="${W.thin}"/><circle cx="${x}" cy="${y}" r="1.3" fill="${c}"/></g>`;
  if (kind === 'spray') return `<g data-el="irr"><circle cx="${x}" cy="${y}" r="3" fill="${c}" fill-opacity="0.3" stroke="${c}" stroke-width="${W.thin}"/></g>`;
  return `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" fill="#FFFFFF" stroke="${c}" stroke-width="${W.thin}"/>`;
}

module.exports = { defs, FILL, siteFrame, building, pave, pathway, lawnArea, tree, conifer, shrub, hedgeLine, flowerBed, lampSym, sprinkler };
