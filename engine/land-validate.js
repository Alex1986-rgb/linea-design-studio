'use strict';
// ================================================================
// LINEA · проверка ландшафтного брифа
// Ловит то, что на глаз не видно: наложения объектов, нарушенные отступы
// от границ, узкие проходы, посадки под воздушной линией, выход за участок.
// ================================================================
const PL = require('./land-plants');

const inter = (a, b) => {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y));
  return x * y;
};
const R = o => ({ x: o.x, y: o.y, w: o.w, d: o.d, name: o.name || o.id });

// прямоугольная оболочка полилинии-дорожки (посегментно)
function pathBoxes(p) {
  const out = [];
  for (let i = 0; i < p.pts.length - 1; i++) {
    const [ax, ay] = p.pts[i], [bx, by] = p.pts[i + 1];
    out.push({
      x: Math.min(ax, bx) - p.w / 2, y: Math.min(ay, by) - p.w / 2,
      w: Math.abs(bx - ax) + p.w, d: Math.abs(by - ay) + p.w, name: p.name
    });
  }
  return out;
}

function validate(brief) {
  const errors = [], warnings = [], notes = [];
  const SW = brief.site.width, SD = brief.site.depth;
  const ex = brief.existing.buildings.map(R);
  const nw = brief.buildingsNew.map(R);
  const beds = brief.planting.beds.filter(b => b.r == null).map(R);
  const pav = brief.paving.filter(p => p.r == null).map(R);
  const paths = brief.paths.flatMap(pathBoxes);
  const gryadki = (brief.maf.find(m => m.beds) || { beds: [] }).beds.map(([x, y]) => ({ x, y, w: 3.5, d: 1.0, name: 'гряда-короб' }));

  const within = (o, what) => {
    if (o.x < 0 || o.y < 0 || o.x + o.w > SW || o.y + o.d > SD)
      errors.push(`${what} «${o.name}» выходит за границу участка`);
  };
  [...nw, ...beds, ...pav, ...gryadki].forEach(o => within(o, 'объект'));
  // круглые элементы (костровая площадка, кольцевой цветник) тоже не должны вылезать за забор
  const circles = brief.paving.filter(p => p.r != null).concat(brief.planting.beds.filter(b => b.r != null));
  circles.forEach(c => {
    if (c.cx - c.r < 0 || c.cy - c.r < 0 || c.cx + c.r > SW || c.cy + c.r > SD)
      errors.push(`круглый элемент «${c.name}» выходит за границу участка`);
  });

  // 1. наложения проектируемых построек друг на друга и на существующие
  const allBuild = [...ex.map(o => ({ ...o, ex: true })), ...nw];
  for (let i = 0; i < allBuild.length; i++) for (let j = i + 1; j < allBuild.length; j++) {
    const a = allBuild[i], b = allBuild[j], s = inter(a, b);
    if (s > 0.05) {
      const pair = [a.name, b.name].join(' / ');
      const ok = /Пергола[\s\S]*Патио|Патио[\s\S]*Пергола|Крыльцо|Терраса бани/.test(pair);
      (ok ? notes : errors).push(`постройки накладываются: ${pair} — ${s.toFixed(1)} м²`);
    }
  }
  // 2. цветники, гряды и покрытия не должны наезжать на постройки и дорожки
  const soft = [...beds.map(o => ({ ...o, kind: 'цветник' })), ...gryadki.map(o => ({ ...o, kind: 'гряда' }))];
  soft.forEach(o => {
    allBuild.forEach(b => { const s = inter(o, b); if (s > 0.3) errors.push(`${o.kind} «${o.name}» наезжает на «${b.name}» — ${s.toFixed(1)} м²`); });
    paths.forEach(p => { const s = inter(o, p); if (s > 0.3) warnings.push(`${o.kind} «${o.name}» пересекает дорожку «${p.name}» — ${s.toFixed(1)} м²`); });
    pav.forEach(p => { const s = inter(o, p); if (s > 0.3 && p.name !== o.name) warnings.push(`${o.kind} «${o.name}» пересекает площадку «${p.name}» — ${s.toFixed(1)} м²`); });
  });
  // 3. отступы от границ (СП 53.13330.2019, 6.7)
  const gap = o => Math.min(o.x, o.y, SW - (o.x + o.w), SD - (o.y + o.d));
  nw.forEach(o => { const g = gap(o); if (g < 0.99) errors.push(`«${o.name}»: отступ от границы ${g.toFixed(1)} м — норма не менее 1,0 м`); });
  // 4. проходы между постройками
  for (let i = 0; i < allBuild.length; i++) for (let j = i + 1; j < allBuild.length; j++) {
    const a = allBuild[i], b = allBuild[j];
    const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
    const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.d, b.y + b.d));
    const d = Math.hypot(dx, dy);
    if (d > 0.02 && d < 0.9 && !/Крыльцо|Пергола|Терраса/.test(a.name + b.name))
      warnings.push(`узкий проход ${d.toFixed(2)} м между «${a.name}» и «${b.name}» — нужно не менее 0,9 м`);
  }
  // 5. посадки: отступы от границ и от построек, высота под ЛЭП
  brief.planting.trees.forEach(t => {
    const g = Math.min(t.x, t.y, SW - t.x, SD - t.y);
    if (g < 2 && !t.existing) warnings.push(`дерево «${t.name}»: ${g.toFixed(1)} м до границы — норма не менее 2,0 м`);
    const c = PL.lookup(t.name.replace(/\s*\(.*?\)/g, ''));
    if (t.x < 2.0 && c && c.h > 3.0) errors.push(`дерево «${t.name}» под воздушной линией: взрослая высота ${c.h} м при допустимых 3,0 м`);
    allBuild.forEach(b => {
      const dx = Math.max(b.x - t.x, 0, t.x - (b.x + b.w));
      const dy = Math.max(b.y - t.y, 0, t.y - (b.y + b.d));
      const d = Math.hypot(dx, dy);
      if (d < t.crown / 2 + 0.5) warnings.push(`крона «${t.name}» упирается в «${b.name}» (${d.toFixed(1)} м от ствола)`);
    });
  });
  // 5а. кроны соседних деревьев не должны наезжать друг на друга
  const tr = brief.planting.trees;
  for (let i = 0; i < tr.length; i++) for (let j = i + 1; j < tr.length; j++) {
    const d = Math.hypot(tr[i].x - tr[j].x, tr[i].y - tr[j].y);
    const need = (tr[i].crown + tr[j].crown) / 2 * 0.8;
    if (d < need) warnings.push(`кроны «${tr[i].name}» и «${tr[j].name}» смыкаются: ${d.toFixed(1)} м между стволами при потребности ${need.toFixed(1)} м`);
  }
  brief.planting.hedges.forEach(h => {
    const g = Math.min(h.line[0][0], h.line[1][0], SW - h.line[0][0], SW - h.line[1][0], h.line[0][1], h.line[1][1], SD - h.line[0][1], SD - h.line[1][1]);
    if (g < 1.0 && g >= 0.6) notes.push(`изгородь «${h.name}»: ${g.toFixed(1)} м до границы — допустимо по согласованию с соседом (норма 1,0 м)`);
    if (g < 0.6) warnings.push(`изгородь «${h.name}»: ${g.toFixed(1)} м до границы — норма не менее 1,0 м`);
  });
  // 6. проверка сумм площадей
  const bom = require('./land-bom');
  const A = bom.areas(brief);
  const sum = ['lawn', 'build', 'buildNew', 'paveOld', 'paveNew', 'path', 'bed', 'hedge', 'veg', 'gravel', 'tree'].reduce((s, k) => s + A[k], 0);
  if (Math.abs(sum - A.total) > 1.5) errors.push(`сумма площадей слоёв ${sum.toFixed(1)} м² не сходится с площадью участка ${A.total} м²`);
  if (A.lawn < 120) warnings.push(`газона остаётся ${A.lawn} м² — участок перегружен покрытиями`);
  return { errors, warnings, notes, areas: A };
}

module.exports = { validate };
