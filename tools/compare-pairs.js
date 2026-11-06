// Пары «до/после» для страницы альбома: обмерный план (как есть) → план мебели / план декора (как будет).
// Берём листы ТОЛЬКО этого выпуска, обрезаем каждый по контуру стен — тогда планы разного масштаба
// ложатся друг на друга. Проверка честности: тип листа, этаж и пропорции контура обязаны совпасть,
// иначе пара не выводится (никаких шаблонных картинок с чужого объекта).
'use strict';
const fs = require('fs');
const path = require('path');

const MARGIN = 0.07;      // поле вокруг контура стен, доля большей стороны
const RATIO_TOL = 0.015;  // допустимое расхождение пропорций контура «до» и «после»

function meta(svg) {
  const head = svg.slice(0, 1200);
  const sheet = (head.match(/data-sheet="([^"]*)"/) || [])[1] || '';
  const title = (head.match(/data-title="([^"]*)"/) || [])[1] || '';
  const floor = (title.split(' · ')[1] || '').trim();
  const scale = (head.match(/data-scale="([^"]*)"/) || [])[1] || '';
  return { sheet, title, floor, scale };
}

// габарит группы стен в координатах листа, с учётом translate у родительских <g>
function wallsBox(svg) {
  const at = svg.indexOf('<g data-el="walls">');
  if (at < 0) return null;
  const stack = [];
  const re = /<g\b([^>]*?)(\/?)>|<\/g>/g;
  let m;
  while ((m = re.exec(svg)) && m.index < at) {
    if (m[0] === '</g>') stack.pop();
    else if (!m[2]) {
      const t = (m[1].match(/transform="translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)"/) || []);
      stack.push(t.length ? [+t[1], +t[2]] : [0, 0]);
    }
  }
  const dx = stack.reduce((s, v) => s + v[0], 0), dy = stack.reduce((s, v) => s + v[1], 0);
  const end = svg.indexOf('</g>', at);
  const body = svg.slice(at, end);
  const pts = [];
  for (const d of body.matchAll(/ d="([^"]+)"/g)) {
    const n = (d[1].match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i] + dx, n[i + 1] + dy]);
  }
  if (pts.length < 3) return null;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function crop(svg, b) {
  const pad = Math.max(b.w, b.h) * MARGIN;
  const vb = [b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad].map(v => +v.toFixed(2));
  const W = 1600, H = Math.round(W * vb[3] / vb[2]);
  const out = svg.replace(/<svg\b[^>]*>/, tag => tag
    .replace(/\swidth="[^"]*"/, ` width="${W}"`)
    .replace(/\sheight="[^"]*"/, ` height="${H}"`)
    .replace(/\sviewBox="[^"]*"/, ` viewBox="${vb.join(' ')}"`));
  return { svg: out, w: W, h: H };
}

const KINDS = {
  obmer: 'Как есть — обмерный план',
  furniture: 'Как будет — расстановка мебели',
  plan: 'Как будет — текстиль и декор',
};

// slug — папка выпуска, sheets — состав выпуска (sheets.json). Возвращает пары и пишет обрезанные листы в portfolio/<slug>/compare/
function build(SITE, slug, sheets) {
  const dir = path.join(SITE, 'portfolio', slug);
  const outDir = path.join(dir, 'compare');
  const items = [];
  for (const sh of sheets) {
    const f = path.join(dir, 'sheets', sh.file);
    if (!fs.existsSync(f)) continue;
    const svg = fs.readFileSync(f, 'utf8');
    const m = meta(svg);
    if (!KINDS[m.sheet]) continue;
    if (m.sheet === 'plan' && !/декор/i.test(m.title)) continue;   // «plan» — общий тип; берём только план декора
    const box = wallsBox(svg);
    if (!box) { console.warn(`  ! ${slug}/${sh.file}: нет контура стен — в «до/после» не идёт`); continue; }
    items.push({ ...m, file: sh.file, no: sh.no || +(sh.file.match(/^(\d+)/) || [0, 0])[1], svg, box });
  }
  const pairs = [];
  const floors = [...new Set(items.map(i => i.floor))];
  for (const floor of floors) {
    const before = items.find(i => i.sheet === 'obmer' && i.floor === floor);
    if (!before) continue;
    for (const kind of ['furniture', 'plan']) {
      const after = items.find(i => i.sheet === kind && i.floor === floor);
      if (!after) continue;
      const r1 = before.box.w / before.box.h, r2 = after.box.w / after.box.h;
      if (Math.abs(r1 - r2) / r1 > RATIO_TOL) {
        console.warn(`  ! ${slug}: «${before.title}» и «${after.title}» — контуры не совпадают (${r1.toFixed(3)} / ${r2.toFixed(3)}), пара не выводится`);
        continue;
      }
      pairs.push({ floor, kind, before, after });
    }
  }
  // пишем только нужные файлы, лишнее из прошлых сборок убираем
  const keep = new Set();
  const res = pairs.map((p, i) => {
    const side = (it, tag) => {
      const name = `${p.floor ? 'f' + (floors.indexOf(p.floor) + 1) + '-' : ''}${tag}.svg`;
      if (!keep.has(name)) {
        const c = crop(it.svg, it.box);
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, name), c.svg);
        keep.add(name);
        it._dim = [c.w, c.h];
      }
      return { src: `compare/${name}`, cap: KINDS[it.sheet], sheet: it.file, no: it.no, scale: it.scale, w: it._dim[0], h: it._dim[1] };
    };
    const b = side(p.before, 'obmer');
    const a = side(p.after, p.kind === 'furniture' ? 'mebel' : 'dekor');
    return {
      id: `cmp-${i + 1}`, floor: p.floor, kind: p.kind === 'furniture' ? 'mebel' : 'dekor',
      tab: `${p.kind === 'furniture' ? 'Мебель' : 'Декор'}${p.floor ? ' · ' + p.floor : ''}`,
      before: b, after: a,
    };
  });
  if (fs.existsSync(outDir)) for (const f of fs.readdirSync(outDir)) if (!keep.has(f)) fs.unlinkSync(path.join(outDir, f));
  if (fs.existsSync(outDir) && !fs.readdirSync(outDir).length) fs.rmdirSync(outDir);
  return res;
}

module.exports = { build, wallsBox };
