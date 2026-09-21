'use strict';
// ================================================================
// LINEA · листы ландшафтного альбома, часть 2:
// ведомость посадок → цветники → огород → детская → свет → полив → узлы → вид
// ================================================================
const P = require('./paper');
const LZ = require('./land-layers');
const PL = require('./land-plants');
const BOM = require('./land-bom');
const L = P.L, W = P.W, esc = P.esc, nm = P.nm;

module.exports = function (M) {
  const B = M.brief, S = M.S;
  const SW = B.site.width, SD = B.site.depth;
  const ex = B.existing, pl = B.planting;
  const dom = ex.buildings.find(b => b.id === 'dom');

  function base(opt) {
    opt = opt || {};
    let s = LZ.defs();
    s += `<rect x="${M.box({ x: 0, y: 0, w: SW, d: SD }).x}" y="0" width="${M.len(SD)}" height="${M.len(SW)}" fill="${opt.pale ? '#FCFCFA' : LZ.FILL.lawn}"/>`;
    ex.paving.filter(p => p.x != null).forEach(p => { s += LZ.pave(M, p, 'tile'); });
    s += LZ.pave(M, { x: dom.x - 1, y: dom.y - 1, w: dom.w + 2, d: dom.d + 2 }, 'tile');
    B.paths.forEach(p => { s += LZ.pathway(M, p.pts, p.w, p.kind); });
    B.paving.forEach(p => { s += LZ.pave(M, p, p.kind === 'tile' ? 'tileNew' : p.kind); });
    ex.buildings.forEach(b => { s += LZ.building(M, b, { label: b.id === 'dom', f: 11 }); });
    B.buildingsNew.forEach(b => { s += LZ.building(M, b, { isNew: true, label: opt.labels === true, f: 10 }); });
    s += LZ.siteFrame(M, { fill: 'none', neighbours: opt.neighbours !== false, gates: opt.gates !== false });
    return s;
  }
  const northMark = () => P.north(M.px(0) - 26, M.py(SW) - 24, 13, 0);

  // ---------- раскладка растений внутри цветника ----------
  function layoutBed(bed) {
    const items = PL.parseMix(bed.mix).map(p => {
      const c = PL.lookup(p.name);
      return { name: c ? c.ru : p.name, qty: p.qty, h: c ? c.h : 0.4, form: c ? c.form : 'многолетник', lat: c ? c.lat : '', size: c ? c.size : '' };
    });
    const w = bed.r != null ? bed.r * 2 : bed.w, d = bed.r != null ? bed.r * 2 : bed.d;
    const x0 = bed.r != null ? bed.cx - bed.r : bed.x, y0 = bed.r != null ? bed.cy - bed.r : bed.y;
    const CELL = 0.1, nx = Math.round(w / CELL), ny = Math.round(d / CELL);
    const busy = new Uint8Array(nx * ny);
    const rOf = h => Math.max(0.15, Math.min(0.8, h * 0.32));
    const free = (cx, cy, r) => {
      const i0 = Math.floor((cx - r - x0) / CELL), i1 = Math.ceil((cx + r - x0) / CELL);
      const j0 = Math.floor((cy - r - y0) / CELL), j1 = Math.ceil((cy + r - y0) / CELL);
      if (i0 < 0 || j0 < 0 || i1 > nx || j1 > ny) return false;
      if (bed.r != null) {
        const dd = Math.hypot(cx - bed.cx, cy - bed.cy);
        if (dd > bed.r - r || (bed.id === 'b7' && dd < 2.5 + r)) return false;   // кольцо вокруг костровой
      }
      for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) if (busy[i * ny + j]) return false;
      return true;
    };
    const take = (cx, cy, r) => {
      const i0 = Math.max(0, Math.floor((cx - r - x0) / CELL)), i1 = Math.min(nx, Math.ceil((cx + r - x0) / CELL));
      const j0 = Math.max(0, Math.floor((cy - r - y0) / CELL)), j1 = Math.min(ny, Math.ceil((cy + r - y0) / CELL));
      for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) busy[i * ny + j] = 1;
    };
    items.sort((a, b) => b.h - a.h);
    const out = [];
    items.forEach((it, idx) => {
      for (let n = 0; n < it.qty; n++) {
        const r = rOf(it.h);
        let placed = false;
        for (let i = 0; i < nx && !placed; i++) for (let j = 0; j < ny && !placed; j++) {
          const cx = x0 + (i + 0.5) * CELL, cy = y0 + (j + 0.5) * CELL;
          if (free(cx, cy, r + 0.03)) { take(cx, cy, r + 0.03); out.push({ x: cx, y: cy, r, item: it, pos: idx + 1 }); placed = true; }
        }
      }
    });
    return { items, plants: out };
  }
  const bedColor = form => ({ 'кустарник': '#79A86B', 'хвойное': '#4E8464', 'полукустарник': '#9AAE6A', 'злак': '#C2A85E', 'ягодное': '#8C6E3F', 'лиана': '#6F9A78' })[form] || '#C1789A';

  // фрагмент цветника в натуральных координатах листа
  function bedFragment(bed, ox, oy) {
    const { items, plants } = layoutBed(bed);
    const w = bed.r != null ? bed.r * 2 : bed.w, d = bed.r != null ? bed.r * 2 : bed.d;
    const x0 = bed.r != null ? bed.cx - bed.r : bed.x, y0 = bed.r != null ? bed.cy - bed.r : bed.y;
    const X = (x, y) => [ox + (y - y0) * S, oy + (x - x0) * S];
    let s = `<g data-el="fragment">`;
    if (bed.r != null) {
      const [cx, cy] = X(bed.cx, bed.cy);
      s += `<circle cx="${cx}" cy="${cy}" r="${M.len(bed.r)}" fill="#FAF7F2" stroke="${L.flower}" stroke-width="${W.vis}"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="${M.len(2.4)}" fill="${LZ.FILL.gravel}" stroke="#9A9184" stroke-width="${W.thin}"/>`;
    } else {
      const [px0, py0] = X(x0, y0);
      s += `<rect x="${px0}" y="${py0}" width="${M.len(d)}" height="${M.len(w)}" fill="#FAF7F2" stroke="${L.flower}" stroke-width="${W.vis}" rx="2"/>`;
    }
    plants.forEach(p2 => {
      const [cx, cy] = X(p2.x, p2.y);
      const col = bedColor(p2.item.form);
      s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${M.len(p2.r)}" fill="${col}" fill-opacity="0.26" stroke="${col}" stroke-width="${W.aux}"/>`;
      s += `<text x="${cx.toFixed(1)}" y="${(cy + 1.4).toFixed(1)}" font-size="9.6" fill="#33312E" text-anchor="middle">${p2.pos}</text>`;
    });
    const [ax, ay] = X(x0, y0), bw = M.len(d), bh = M.len(w);
    s += P.dimH(ax, ax + bw, ay + bh + 9, `${nm(d)} м`);
    s += P.dimV(ax - 8, ay, ay + bh, `${nm(w)} м`);
    s += `<text x="${ax}" y="${ay - 12}" font-size="13" font-weight="700" fill="${L.ink}">${esc(bed.name)}</text>`;
    s += `<text x="${ax}" y="${ay - 5}" font-size="10" fill="${L.grey}">${bed.r != null ? Math.round(Math.PI * bed.r * bed.r * 0.46) : nm((bed.w * bed.d).toFixed(1))} м² · ${plants.length} растений · ${bed.type === 'shade' ? 'тень и полутень' : bed.type === 'part' ? 'полутень' : 'солнце'}</text>`;
    return { svg: s + `</g>`, items, count: plants.length };
  }
  const bedTable = (x, y, title, items, w) => {
    let t = `<text x="${x}" y="${y}" font-size="12" font-weight="700" fill="${L.ink}">${esc(title)}</text>`;
    t += P.table(x, y + 8, [{ t: '№', w: 24, align: 'middle' }, { t: 'Растение', w: w - 130 }, { t: 'Размер', w: 66, align: 'middle' }, { t: 'Кол-во', w: 40, align: 'middle' }],
      items.map((it, i) => [String(i + 1), it.name, it.size || '—', String(it.qty)]), { rh: 13.5, f: 9.6, hh: 17 });
    return t;
  };

  // ---------- ЛИСТ · ведомость посадочного материала ----------
  function vedomost() {
    const list = BOM.plantList(B);
    const half = Math.ceil(list.length / 2);
    const cols = [{ t: '№', w: 26, align: 'middle' }, { t: 'Наименование', w: 210 }, { t: 'Латинское название', w: 196 }, { t: 'Размер', w: 106 }, { t: 'Кол-во', w: 50, align: 'middle' }];
    let s = P.title(0, -12, 'Ассортиментная ведомость посадочного материала', `Всего ${list.reduce((a, r) => a + r.qty, 0)} растений · ${list.length} наименований · зона зимостойкости 4`);
    s += P.table(0, 8, cols, list.slice(0, half).map((r, i) => [String(i + 1), r.ru, r.lat, r.size, String(r.qty)]), { rh: 15, f: 9.6, hh: 20 });
    s += P.table(614, 8, cols, list.slice(half).map((r, i) => [String(half + i + 1), r.ru, r.lat, r.size, String(r.qty)]), { rh: 15, f: 9.6, hh: 20 });
    const y = 30 + half * 15 + 16;
    s += P.notes(0, y, 560, [
      'Материал принимается с закрытой корневой системой, ком без пересушки, без повреждений коры.',
      'Хвойные высаживаются с сохранением ориентации по сторонам света, отмеченной в питомнике.',
      'Замена сорта — только на равноценный по зимостойкости и габитусу, по согласованию с автором.',
      'Гарантия приживаемости действует при выполнении регламента полива и ухода первого сезона.'
    ], { wrap: 104 });
    s += P.notes(614, y, 560, [
      'Растения под воздушной линией подобраны с максимальной высотой до 3 м.',
      'Многолетники — контейнеры С1–С3, посадка группами по 3–9 шт. одного сорта.',
      'Живые изгороди высаживаются в траншею с единой плодородной засыпкой, не в отдельные ямы.',
      'Сроки: контейнерные растения — апрель–октябрь, кроме жары выше +28 °C.'
    ], { wrap: 104 });
    return { body: s, series: 'none' };
  }

  // ---------- ЛИСТЫ · цветники ----------
  function cvetniki1() {
    const b1 = pl.beds.find(b => b.id === 'b1'), b3 = pl.beds.find(b => b.id === 'b3');
    const f1 = bedFragment(b1, 0, 20), f2 = bedFragment(b3, M.len(3.4), 20);
    let s = f1.svg + f2.svg;
    s += P.title(0, 4, 'Цветники. Фрагменты: входная группа и теневой миксбордер', 'Кружок — одно растение, номер — позиция ведомости');
    const footer = (x, y, w) => bedTable(x, y + 14, `Ц1. ${b1.name}`, f1.items, 420)
      + bedTable(x + 460, y + 14, `Ц3. ${b3.name}`, f2.items, 460)
      + P.notes(x + 960, y + 14, 340, [
        'Растения одного вида высаживаются плотной группой, а не вразброс.',
        'Шаг посадки многолетников 0,3–0,4 м, злаков 0,5 м.',
        'После посадки — мульча корой слоем 60 мм, к стеблям не вплотную.'
      ], { wrap: 46 });
    return { body: s, footer, footerH: 230 };
  }
  function cvetniki2() {
    const b5 = pl.beds.find(b => b.id === 'b5'), b4 = pl.beds.find(b => b.id === 'b4'), b7 = pl.beds.find(b => b.id === 'b7');
    const f1 = bedFragment(b5, 0, 30), f2 = bedFragment(b4, M.len(3.6), 30), f3 = bedFragment(b7, M.len(6.0), 20);
    let s = f1.svg + f2.svg + f3.svg;
    s += P.title(0, 8, 'Цветники. Куртина у поляны, миксбордер у проезда, обрамление костровой', 'Кружок — одно растение, номер — позиция ведомости');
    const footer = (x, y, w) => bedTable(x, y + 10, `Ц5. ${b5.name}`, f1.items, 380)
      + bedTable(x + 400, y + 10, `Ц4. ${b4.name}`, f2.items, 380)
      + bedTable(x + 800, y + 10, `Ц7. ${b7.name}`, f3.items, 380);
    return { body: s, footer, footerH: 92 };
  }

  // ---------- фрагменты: общая модель, обрезанная окном ----------
  // Раньше фрагмент рисовался в собственных координатах и терял контекст
  // (дорожки и цветники за окном висели «в воздухе»). Теперь это тот же план
  // участка, обрезанный clipPath: контекст верный, а масштаб считается по окну.
  let FRAG = 0;
  function fragment(win, opt) {
    opt = opt || {};
    const id = 'frag' + (++FRAG);
    const b = M.box(win);
    let s = LZ.defs();
    s += `<clipPath id="${id}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/></clipPath>`;
    s += `<g clip-path="url(#${id})">`;
    s += base({ labels: false, neighbours: false, gates: false });
    if (opt.green !== false) {
      pl.beds.forEach(bd => { s += LZ.flowerBed(M, bd); });
      pl.hedges.forEach(h => { s += LZ.hedgeLine(M, h.line[0], h.line[1], h.step, Math.max(0.6, h.step * 0.95), { color: h.id === 'h2' ? '#2F6B4F' : L.shrub }); });
      pl.trees.forEach(t => {
        const conif = /ель|сосна|можжевельник|туя/i.test(t.name);
        s += conif ? LZ.conifer(M, t.x, t.y, t.crown, {}) : LZ.tree(M, t.x, t.y, t.crown, { existing: t.existing });
      });
    }
    if (opt.inner) s += opt.inner();
    s += `</g>`;
    s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="#8A8478" stroke-width="${W.thin}"/>`;
    return s;
  }
  // подпись объекта внутри фрагмента
  const cap = (o, t1, t2, f) => {
    const [cx, cy] = M.cen(o);
    let s = `<text x="${cx}" y="${cy}" font-size="${f || 11.5}" font-weight="600" fill="${L.ink}" text-anchor="middle">${esc(t1)}</text>`;
    if (t2) s += `<text x="${cx}" y="${cy + 11}" font-size="9.6" fill="${L.grey}" text-anchor="middle">${esc(t2)}</text>`;
    return s;
  };

  // ---------- ЛИСТ · гараж, проезд и хозяйственный двор ----------
  function garazhFragment() {
    const g = B.buildingsNew.find(b => b.id === 'garazh');
    const hz = B.buildingsNew.find(b => b.id === 'hozblok');
    const yag = pl.beds.find(b => b.id === 'b8');
    const win = { x: 9.8, y: 20.4, w: 12.2, d: 16.2 };
    let s = fragment(win, {
      inner: () => {
        let t = '';
        // парковочные места и ворота
        [[g.x + 0.5, 2.6], [g.x + 5.3, 2.6]].forEach(([mx, mw], i) => {
          const car = M.box({ x: mx, y: g.y + 0.7, w: mw, d: 4.6 });
          t += `<rect x="${car.x}" y="${car.y}" width="${car.w}" height="${car.h}" fill="none" stroke="#8A8478" stroke-width="${W.thin}" stroke-dasharray="5 3"/>`;
          t += `<text x="${car.x + car.w / 2}" y="${car.y + car.h / 2}" font-size="10" fill="${L.grey}" text-anchor="middle">место ${i + 1}</text>`;
          t += `<text x="${car.x + car.w / 2}" y="${car.y + car.h / 2 + 11}" font-size="9.6" fill="${L.grey}" text-anchor="middle">2,6 × 4,6 м</text>`;
          // ворота в северной стене гаража (со стороны площадки)
          const gt = M.box({ x: mx - 0.2, y: g.y, w: mw + 0.4, d: 0.1 });
          t += `<rect x="${gt.x - 1}" y="${gt.y}" width="3" height="${gt.h}" fill="${L.hot}"/>`;
          t += `<text x="${gt.x + 8}" y="${gt.y + gt.h / 2 + 3}" font-size="9.6" fill="${L.hot}">ворота 3,0 × 2,4 м</text>`;
        });
        return t;
      }
    });
    s += cap(g, 'ГАРАЖ на 2 автомобиля', '10,0 × 6,0 м · 60 м²', 13);
    s += cap(hz, 'Хозпостройка', '5,0 × 3,0 м', 11.5);
    s += cap(yag, 'Ягодник', '', 10.5);
    const pr = B.paving.find(p => p.id === 'n7'), pl2 = B.paving.find(p => p.id === 'n8');
    s += cap(pl2, 'Площадка перед гаражом', '10,0 × 4,0 м', 11);
    s += P.leader(...M.pt(17.5, 21.0), ...[M.px(21.0) + 24, M.py(17.5) + 22], ['Проезд к гаражу 4,0 м'], { anchor: 'start' });
    // размеры
    const bg = M.box(g);
    s += P.dimH(bg.x, bg.x + bg.w, bg.y - 9, `${nm(g.d)} м`);
    s += P.dimV(bg.x - 9, bg.y, bg.y + bg.h, `${nm(g.w)} м`);
    s += P.dimV(bg.x + bg.w + 9, bg.y + bg.h, M.py(22.0), '1,0');
    const bpr = M.box(pr);
    s += P.dimV(bpr.x + bpr.w + 9, bpr.y, bpr.y + bpr.h, `${nm(pr.w)} м`);
    s += P.title(M.px(win.y) - 40, M.py(win.x) - 24, 'Гараж, проезд и хозяйственный двор. Фрагмент', 'Габариты, места стоянки, ворота, отступы и покрытия');
    const panel = (x, y, w) => {
      let t = P.table(x, y, [{ t: 'Элемент', w: 230 }, { t: 'Размер', w: 110, align: 'middle' }, { t: 'Покрытие', w: 120 }], [
        ['Гараж на 2 автомобиля', '10,0 × 6,0 м', 'бетонный пол'],
        ['Место стоянки в гараже', '2,6 × 4,6 м', '2 шт.'],
        ['Ворота секционные', '3,0 × 2,4 м', '2 шт.'],
        ['Проезд от ворот участка', 'ширина 4,0 м', 'брусчатка 80 мм'],
        ['Площадка перед гаражом', '10,0 × 4,0 м', 'брусчатка 80 мм'],
        ['Хозпостройка с дровником', '5,0 × 3,0 м', 'отсыпка перед входом'],
        ['Ширма-шпалера двора', 'h 1,8 м, 4,2 м', 'девичий виноград'],
        ['Ягодник', '2,8 × 2,8 м', 'мульча корой']
      ], { rh: 18 });
      t += P.notes(x, y + 190, w, [
        'Гараж ставится с отступом 1,0 м от южной границы (СП 53.13330.2019, 6.7).',
        'Ворота развёрнуты на север, к площадке: заезд прямой с проезда, без разворота по участку.',
        'Проезд и площадка выполняются по узлу 2: брусчатка 80 мм, основание ЩПС 250 мм.',
        'Уклон площадки — 0,01 от ворот гаража к газону, вода не стоит у порога.',
        'Перед воротами сохраняется свободная полоса 4,0 м для маневра и мойки.',
        'Отвод воды с кровли гаража — в дренажную систему участка.'
      ], { wrap: Math.floor(w / 5.2) });
      return t;
    };
    return { body: s, panel, panelW: 430 };
  }

  // ---------- ЛИСТ · беседка, патио и тихий сад ----------
  function besedkaFragment() {
    const bes = ex.buildings.find(b => b.id === 'besedka');
    const pat = B.paving.find(p => p.id === 'n1');
    const win = { x: 0.2, y: 5.8, w: 11.0, d: 20.4 };
    let s = fragment(win, {});
    s += cap(bes, 'Беседка', '3,5 × 4,0 м', 11.5);
    s += cap(pat, 'Патио', 'пергола 3,2 × 2,6 м', 11);
    const bb2 = M.box(bes);
    s += P.dimH(bb2.x, bb2.x + bb2.w, bb2.y - 9, `${nm(bes.d)} м`);
    s += P.dimV(bb2.x - 9, bb2.y, bb2.y + bb2.h, `${nm(bes.w)} м`);
    s += P.dimV(bb2.x + bb2.w + 9, M.py(0), bb2.y, `${nm(bes.x)}`);
    const bp = M.box(pat);
    s += P.dimH(bp.x, bp.x + bp.w, bp.y + bp.h + 14, `${nm(pat.d)} м`);
    s += P.leader(...M.pt(2.6, 17.4), M.px(17.4) - 26, M.py(2.6) - 20, ['Клён Гиннала — акцент', 'на газоне за беседкой'], { anchor: 'end' });
    s += P.title(0, 0, 'Беседка, патио и тихий сад. Фрагмент', 'Северная сторона: беседка между воротами и домом, выход из дома на патио');
    const panel = (x, y, w) => {
      let t = P.table(x, y, [{ t: 'Поз.', w: 36, align: 'middle' }, { t: 'Элемент', w: 250 }, { t: 'Размер', w: 110, align: 'middle' }], [
        ['1', 'Беседка существующая, сохраняется', '3,5 × 4,0 м'],
        ['2', 'Мощение у беседки, ремонт существующего', '4,4 × 5,2 м'],
        ['3', 'Патио с перголой у западной стены дома', '3,2 × 2,6 м'],
        ['4', 'Обеденная группа на 6 персон', '2,0 × 1,4 м'],
        ['5', 'Теневой миксбордер у северной границы', '3,2 × 3,4 м'],
        ['6', 'Клён Гиннала — акцент газона', 'крона 4,0 м'],
        ['7', 'Садовые скамьи', '1,6 × 0,6 м, 2 шт.'],
        ['8', 'Дорожка от крыльца к беседке', 'ширина 1,2 м']
      ], { rh: 18 });
      t += P.notes(x, y + 190, w, [
        'Беседка сохраняется на месте; вокруг восстанавливается мощение и добавляются теневые посадки.',
        'Полоса вдоль северной границы затенена домом и забором — здесь работают хосты, папоротники, астильбы.',
        'Патио связано с домом выходом на запад: вечернее солнце и вид на поляну.',
        'Газон между беседкой и террасой бани оставлен свободным — это место для гамака, батута или детской площадки, если она понадобится.',
        'Дорожка от крыльца к беседке — брусчатка 1,2 м по узлу 1.'
      ], { wrap: Math.floor(w / 5.2) });
      return t;
    };
    return { body: s, panel, panelW: 470 };
  }

  // ---------- ЛИСТ · баня, купель и костровая ----------
  function banyaFragment() {
    const ban = B.buildingsNew.find(b => b.id === 'banya');
    const ter = B.buildingsNew.find(b => b.id === 'terrasa-bani');
    const kup = B.maf.find(m => m.id === 'm9');
    const kos = B.paving.find(p => p.id === 'n4');
    const gr = B.maf.find(m => m.id === 'm10');
    const win = { x: 0.2, y: 23.0, w: 11.2, d: 13.8 };
    let s = fragment(win, {
      inner: () => {
        let t = '';
        const [kx, ky] = M.pt(kup.cx, kup.cy);
        t += `<circle cx="${kx}" cy="${ky}" r="${M.len(kup.r)}" fill="#DCEAF0" stroke="${L.water}" stroke-width="${W.vis}"/>`;
        const [cx, cy] = M.pt(kos.cx, kos.cy);
        t += `<circle cx="${cx}" cy="${cy}" r="${M.len(0.4)}" fill="#8A8478" stroke="${L.ink}" stroke-width="${W.thin}"/>`;
        gr.beds.forEach(bd => {
          const bb = M.box({ x: bd[0], y: bd[1], w: gr.w, d: gr.d });
          t += `<rect x="${bb.x}" y="${bb.y}" width="${bb.w}" height="${bb.h}" fill="${LZ.FILL.veg}" stroke="#8A6D2F" stroke-width="${W.vis}"/>`;
        });
        [B.maf.find(m => m.id === 'm7'), B.maf.find(m => m.id === 'm8'), B.maf.find(m => m.id === 'm11'), B.maf.find(m => m.id === 'm5')].forEach(m => {
          if (!m) return;
          const bb = M.box(m);
          t += `<rect x="${bb.x}" y="${bb.y}" width="${bb.w}" height="${bb.h}" fill="#EFE7DA" stroke="#8A8478" stroke-width="${W.thin}"/>`;
        });
        return t;
      }
    });
    s += cap(ban, 'БАНЯ', '6,0 × 4,0 м · 24 м²', 12.5);
    s += cap(ter, 'Терраса', '6,0 × 2,3 м', 11);
    const [kx, ky] = M.pt(kup.cx, kup.cy);
    s += `<text x="${kx}" y="${ky + 3}" font-size="9.6" fill="${L.water}" text-anchor="middle">купель</text>`;
    const [cx, cy] = M.pt(kos.cx, kos.cy);
    s += `<text x="${cx}" y="${cy - M.len(kos.r) - 6}" font-size="10.5" font-weight="600" fill="${L.ink}" text-anchor="middle">костровая площадка Ø 4,4 м</text>`;
    const [grx, gry] = M.pt(gr.beds[1][0] + gr.w / 2, gr.beds[1][1] + gr.d / 2);
    s += P.leader(grx, gry, grx + 26, gry - 18, ['Гряды-короба 3,4 × 0,9 м', '3 шт., проход 0,5 м'], { anchor: 'start' });
    const bb = M.box(ban);
    s += P.dimH(bb.x, bb.x + bb.w, bb.y - 9, `${nm(ban.d)} м`);
    s += P.dimV(bb.x - 9, bb.y, bb.y + bb.h, `${nm(ban.w)} м`);
    s += P.dimV(bb.x + bb.w + 9, M.py(0), bb.y, '1,0');
    s += P.title(M.px(win.y) - 40, M.py(win.x) - 24, 'Баня, купель и костровая зона. Фрагмент', 'Западная часть участка: вечернее солнце и вид на поле');
    const panel = (x, y, w) => {
      let t = P.table(x, y, [{ t: 'Поз.', w: 36, align: 'middle' }, { t: 'Элемент', w: 250 }, { t: 'Размер', w: 110, align: 'middle' }], [
        ['1', 'Баня: парная, моечная, комната отдыха', '6,0 × 4,0 м'],
        ['2', 'Терраса бани, доска ДПК', '6,0 × 2,3 м'],
        ['3', 'Купель с подогревом', 'Ø 2,0 м'],
        ['4', 'Костровая площадка, гранитный отсев', 'Ø 4,4 м'],
        ['5', 'Кострище стальное', 'Ø 0,8 м'],
        ['6', 'Гряды-короба, борт ДПК h 0,3 м', '3,4 × 0,9 м, 3 шт.'],
        ['7', 'Компостер двухсекционный', '1,2 × 0,9 м'],
        ['8', 'Шезлонги и скамья-качели у видовой точки', '—']
      ], { rh: 18 });
      t += P.notes(x, y + 190, w, [
        'Баня ставится с отступом 1,0 м от северной границы (СП 53.13330.2019, 6.7).',
        'Терраса развёрнута на юго-запад: вечернее солнце и вид на поле с задней границы.',
        'Костровая площадка — гранитный отсев 80 мм по геотекстилю, отступ от построек не менее 5 м.',
        'Слив из купели — в дренажную систему через отстойник, не на газон.',
        'Гряды в северо-западном углу: вне гостевых маршрутов, но с солнцем во второй половине дня.',
        'Западная граница не закрывается посадками выше 1,5 м — вид на поле сохраняется.'
      ], { wrap: Math.floor(w / 5.2) });
      return t;
    };
    return { body: s, panel, panelW: 470 };
  }

  // ---------- освещение ----------
  function lightPoints() {
    const pts = [];
    B.paths.forEach(p => {
      for (let i = 0; i < p.pts.length - 1; i++) {
        const [ax, ay] = p.pts[i], [bx, by] = p.pts[i + 1];
        const len = Math.hypot(bx - ax, by - ay);
        for (let t = 2.0; t < len; t += 4.5) {
          const k = t / len;
          pts.push({ x: ax + (bx - ax) * k + 0.8, y: ay + (by - ay) * k, kind: 'bollard', g: 2 });
        }
      }
    });
    [[8.6, 2.5], [8.6, 6.5], [12.2, 2.0], [12.2, 6.4]].forEach(([x, y]) => pts.push({ x, y, kind: 'bollard', g: 1 }));
    [[3.6, 11.4], [7.2, 10.2], [19.8, 3.6], [17.4, 6.0], [3.2, 17.2], [2.6, 14.2], [8.6, 26.4], [6.6, 23.4], [12.4, 30.2], [9.4, 31.2], [1.4, 24.6], [6.4, 31.6]]
      .forEach(([x, y], i) => pts.push({ x, y, kind: 'ground', g: i < 4 ? 1 : 3 }));
    [[15.2, 32.6], [1.2, 28.4], [17.0, 1.2]].forEach(([x, y]) => pts.push({ x, y, kind: 'flood', g: 4 }));
    [[9.0, 11.4], [12.0, 11.4]].forEach(([x, y]) => pts.push({ x, y, kind: 'wall', g: 1, ex: true }));
    return pts;
  }

  function svet() {
    let s = base({ pale: true });
    const pts = lightPoints();
    const GC = { 1: '#D98324', 2: '#E0A200', 3: '#C46A9B', 4: '#5B8FB9' };
    const board = [15.0, 32.4];
    [[board, [11.6, 31.0]], [[11.6, 31.0], [11.6, 19.8]], [[11.6, 19.8], [15.0, 17.4]], [[11.6, 24.6], [10.6, 26.6]],
     [[10.6, 26.6], [10.6, 31.2]], [[11.6, 22.4], [10.4, 22.4]], [[10.4, 22.4], [10.4, 12.2]], [[10.4, 12.2], [10.4, 2.0]],
     [[11.6, 22.0], [5.6, 22.0]], [[5.6, 22.0], [5.6, 25.0]], [[5.6, 24.2], [1.6, 25.6]]
    ].forEach(([a, b]) => {
      const [x1, y1] = M.pt(a[0], a[1]), [x2, y2] = M.pt(b[0], b[1]);
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${L.wire}" stroke-width="${W.thin}" stroke-dasharray="9 3 2 3"/>`;
    });
    pts.forEach(p2 => { const [x, y] = M.pt(p2.x, p2.y); s += LZ.lampSym(x, y, p2.kind, { color: GC[p2.g] }); });
    const [bx, by] = M.pt(board[0], board[1]);
    s += `<rect x="${bx - 5}" y="${by - 5}" width="10" height="10" fill="#FFFFFF" stroke="${L.ink}" stroke-width="${W.main}"/>`
      + `<path d="M${bx - 2.5} ${by - 2.5}h5v5h-5z" fill="${L.wire}"/>`
      + `<text x="${bx + 9}" y="${by + 4}" font-size="10.5" font-weight="700" fill="${L.ink}">ЩУ</text>`;
    s += northMark();
    s += P.title(M.px(SD), -34, 'План наружного освещения', 'Четыре группы, кабельные трассы, уличный щит с УЗО');
    const cnt = k => pts.filter(p2 => p2.kind === k).length;
    const panel = (x, y, w) => {
      let t = P.table(x, y, [{ t: 'Гр.', w: 30, align: 'middle' }, { t: 'Назначение группы', w: 220 }, { t: 'Светильники', w: 150 }], [
        ['1', 'Парадная: въезд, дорожка, крыльцо', 'болларды 4, грунтовые 4, настенные 2 (сущ.)'],
        ['2', 'Маршрут: дорожки к патио, бане, поляне, огороду', `болларды ${cnt('bollard') - 4}`],
        ['3', 'Отдых: патио, беседка, костровая, терраса бани', 'грунтовые 8, гирлянда 18 м'],
        ['4', 'Хозяйственная и охранная', 'прожекторы 3 с датчиком движения']
      ], { rh: 24, f: 10 });
      t += P.legend(x, y + 130, w, 'Условные обозначения', [
        { sym: (px, py) => LZ.lampSym(px, py, 'bollard', { color: GC[2] }), text: 'Боллард h 0,6 м, IP65, 6 Вт, 3000 К' },
        { sym: (px, py) => LZ.lampSym(px, py, 'ground', { color: GC[3] }), text: 'Грунтовый светильник, IP67, 6 Вт, узкий луч' },
        { sym: (px, py) => LZ.lampSym(px, py, 'flood', { color: GC[4] }), text: 'Прожектор 20 Вт с датчиком движения, IP65' },
        { sym: (px, py) => LZ.lampSym(px, py, 'wall', { color: GC[1] }), text: 'Настенный светильник у крыльца (существующий)' },
        { sym: (px, py) => `<line x1="${px - 8}" y1="${py}" x2="${px + 8}" y2="${py}" stroke="${L.wire}" stroke-width="1" stroke-dasharray="9 3 2 3"/>`, text: 'Кабель ВВГнг-LS 3×1,5 в гофре, глубина 0,5 м' },
        { sym: (px, py) => `<rect x="${px - 5}" y="${py - 5}" width="10" height="10" fill="#FFFFFF" stroke="${L.ink}" stroke-width="1"/>`, text: 'Щит уличный на 4 группы, УЗО 30 мА' }
      ], { rh: 19, wrap: 54 });
      return t;
    };
    const footer = (x, y, w) => P.notes(x, y + 12, w, [
      'Кабель прокладывается в гофре на глубине 0,5 м в песчаной постели, с сигнальной лентой.',
      'Каждая группа — свой автомат и УЗО 30 мА; управление по таймеру и датчику освещённости.',
      'Светильники ставятся так, чтобы луч не бил в окна дома и на участок соседей.',
      'Подсветка деревьев — грунтовые светильники в 0,6–1,0 м от ствола, направление от дорожки.',
      'Трассы кабеля и полива идут в одной траншее с разнесением по глубине не менее 0,2 м.'
    ], { wrap: Math.floor(w / 5.4) });
    return { body: s, panel, panelW: 460, footer, footerH: 112 };
  }

  // ---------- полив ----------
  function poliv() {
    let s = base({ pale: true });
    const rotors = [[4.4, 4.6], [4.4, 9.4], [8.0, 4.6], [8.0, 16.6], [4.0, 20.0], [7.6, 24.6], [7.6, 29.4], [12.0, 26.0], [12.0, 33.2]];
    const sprays = [[6.4, 7.6], [3.4, 4.0], [11.0, 9.2], [2.6, 15.6], [17.2, 20.4], [19.6, 15.0]];
    rotors.forEach(([x, y]) => {
      const [px2, py2] = M.pt(x, y);
      s += `<circle cx="${px2}" cy="${py2}" r="${M.len(5.2)}" fill="${L.irr}" fill-opacity="0.07" stroke="${L.irr}" stroke-width="${W.aux}" stroke-dasharray="4 4"/>` + LZ.sprinkler(px2, py2, 'rotor');
    });
    sprays.forEach(([x, y]) => {
      const [px2, py2] = M.pt(x, y);
      s += `<circle cx="${px2}" cy="${py2}" r="${M.len(3.0)}" fill="${L.irr}" fill-opacity="0.06" stroke="${L.irr}" stroke-width="${W.aux}" stroke-dasharray="3 3"/>` + LZ.sprinkler(px2, py2, 'spray');
    });
    pl.beds.forEach(b => {
      if (b.r != null) {
        const [cx, cy] = M.pt(b.cx, b.cy);
        s += `<circle cx="${cx}" cy="${cy}" r="${M.len(b.r - 0.5)}" fill="none" stroke="${L.irr}" stroke-width="${W.aux}" stroke-dasharray="2 2"/>`;
      } else {
        const bx = M.box(b), rows = Math.max(1, Math.round(b.w / 0.6));
        for (let i = 1; i <= rows; i++) {
          const yy = bx.y + i * bx.h / (rows + 1);
          s += `<line x1="${bx.x + 2}" y1="${yy}" x2="${bx.x + bx.w - 2}" y2="${yy}" stroke="${L.irr}" stroke-width="${W.aux}" stroke-dasharray="2 2"/>`;
        }
      }
    });
    (B.maf.find(m => m.beds) || { beds: [] }).beds.forEach(bd => {
      const bx = M.box({ x: bd[0], y: bd[1], w: 3.5, d: 0.9 });
      [0.33, 0.67].forEach(f => { s += `<line x1="${bx.x + 2}" y1="${bx.y + bx.h * f}" x2="${bx.x + bx.w - 2}" y2="${bx.y + bx.h * f}" stroke="${L.irr}" stroke-width="${W.aux}" stroke-dasharray="2 2"/>`; });
    });
    const [cxp, cyp] = M.pt(15.2, 32.2);
    s += `<rect x="${cxp - 6}" y="${cyp - 4}" width="12" height="8" fill="#FFFFFF" stroke="${L.irr}" stroke-width="${W.main}"/>`
      + `<text x="${cxp + 10}" y="${cyp + 4}" font-size="10.5" font-weight="700" fill="${L.irr}">КБ</text>`;
    [[[15.2, 32.2], [11.6, 30.0]], [[11.6, 30.0], [11.6, 20.0]], [[11.6, 20.0], [10.4, 12.4]], [[10.4, 12.4], [10.4, 3.0]],
     [[11.6, 24.0], [6.0, 24.0]], [[6.0, 24.0], [3.0, 20.0]], [[11.6, 27.0], [14.0, 24.4]]
    ].forEach(([a, b]) => {
      const [x1, y1] = M.pt(a[0], a[1]), [x2, y2] = M.pt(b[0], b[1]);
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${L.irr}" stroke-width="${W.vis}"/>`;
    });
    s += northMark();
    s += P.title(M.px(SD), -34, 'План автоматического полива', 'Шесть зон, радиусы полива, магистраль и клапанный бокс');
    const panel = (x, y, w) => {
      let t = P.table(x, y, [{ t: 'Зона', w: 36, align: 'middle' }, { t: 'Что поливает', w: 200 }, { t: 'Оборудование', w: 100 }, { t: 'Расход', w: 64, align: 'middle' }],
        B.water.irrigation.zones.map(z => [String(z.n), z.name, z.heads, z.flow]), { rh: 20 });
      t += P.legend(x, y + 160, w, 'Условные обозначения', [
        { sym: (px2, py2) => LZ.sprinkler(px2, py2, 'rotor'), text: 'Дождеватель роторный, радиус 5,2 м' },
        { sym: (px2, py2) => LZ.sprinkler(px2, py2, 'spray'), text: 'Дождеватель веерный, радиус 3,0 м' },
        { sym: (px2, py2) => `<line x1="${px2 - 8}" y1="${py2}" x2="${px2 + 8}" y2="${py2}" stroke="${L.irr}" stroke-width="1.4"/>`, text: 'Магистраль ПНД Ø 32, глубина 0,35 м' },
        { sym: (px2, py2) => `<line x1="${px2 - 8}" y1="${py2}" x2="${px2 + 8}" y2="${py2}" stroke="${L.irr}" stroke-width="0.8" stroke-dasharray="2 2"/>`, text: 'Капельная линия Ø 16, эмиттеры 2,2 л/ч' },
        { sym: (px2, py2) => `<rect x="${px2 - 6}" y="${py2 - 4}" width="12" height="8" fill="#FFFFFF" stroke="${L.irr}" stroke-width="1"/>`, text: 'Клапанный бокс с электромагнитными клапанами' }
      ], { rh: 19, wrap: 54 });
      return t;
    };
    const footer = (x, y, w) => P.notes(x, y + 12, w, [
      'Источник — летний водопровод от дома; перед контроллером ставятся фильтр и редуктор на 3,0 бар.',
      'Полив газона — ранним утром 2–3 раза в неделю по 20–25 минут; капельные зоны — через день по 30 минут.',
      'Дождеватели устанавливаются с перекрытием факелов, корпуса заглубляются заподлицо с газоном.',
      'Магистраль укладывается с уклоном к дренажным клапанам; консервация — продувка компрессором.',
      'Расчёт выполнен на давление 3,0 бар и расход источника не менее 2,5 м³/ч — уточнить замером.'
    ], { wrap: Math.floor(w / 5.4) });
    return { body: s, panel, panelW: 440, footer, footerH: 112 };
  }

  // ---------- узлы ----------
  const NODE_F = { pave: '#DCD6CB', sand: '#F0E6CE', shchps: '#D8D2C6', geo: '#CFCFCF', soil: '#E2D8C6', ground: '#CFC6B4', grass: '#DCEBCB', deck: '#C99A6A', gravel: '#D9D2C4', concrete: '#C9C9C9' };
  function nodeBlock(ox, oy, title, layers, opt) {
    opt = opt || {};
    const w = opt.w || 1.2;
    let s = `<g data-el="node">`;
    let y = oy;
    layers.forEach(l => {
      const h = l.t / 1000;
      s += `<rect x="${ox}" y="${y.toFixed(2)}" width="${M.len(w)}" height="${M.len(h).toFixed(2)}" fill="${l.fill}" stroke="${L.ink}" stroke-width="${W.aux}"/>`;
      if (l.hatch) for (let i = 0.08; i < w; i += 0.14) s += `<line x1="${(ox + M.len(i)).toFixed(1)}" y1="${(y + M.len(h)).toFixed(1)}" x2="${(ox + M.len(i + 0.04)).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#8A8478" stroke-width="${W.aux}"/>`;
      s += `<line x1="${ox + M.len(w)}" y1="${(y + M.len(h) / 2).toFixed(1)}" x2="${ox + M.len(w) + 2.5}" y2="${(y + M.len(h) / 2).toFixed(1)}" stroke="${L.ink}" stroke-width="${W.aux}"/>`;
      s += `<text x="${ox + M.len(w) + 3.2}" y="${(y + M.len(h) / 2 + 0.7).toFixed(1)}" font-size="9.6" fill="#33312E">${esc(l.name)} — ${l.t} мм</text>`;
      y += M.len(h);
    });
    s += `<text x="${ox}" y="${(oy - 3.4).toFixed(1)}" font-size="12" font-weight="700" fill="${L.ink}">${esc(title)}</text>`;
    if (opt.sub) s += `<text x="${ox}" y="${(oy - 0.9).toFixed(1)}" font-size="9.6" fill="${L.grey}">${esc(opt.sub)}</text>`;
    return s + `</g>`;
  }
  const nodeFooter = items => (x, y, w) => P.notes(x, y + 12, w, items, { wrap: Math.floor(w / 5.4) });

  function uzly() {
    const F = NODE_F;
    let s = '';
    s += nodeBlock(0, 12, 'Узел 1. Пешеходное мощение', [
      { name: 'Брусчатка вибропрессованная', t: 60, fill: F.pave },
      { name: 'Песок крупный, уплотнённый', t: 30, fill: F.sand },
      { name: 'ЩПС 0–40, слоями по 100 мм', t: 150, fill: F.shchps, hatch: true },
      { name: 'Геотекстиль 150 г/м²', t: 10, fill: F.geo },
      { name: 'Уплотнённое основание, Ку 0,98', t: 90, fill: F.ground, hatch: true }
    ], { sub: 'дорожки, патио, площадки' });
    s += nodeBlock(24, 12, 'Узел 2. Проездная зона', [
      { name: 'Брусчатка 80 мм', t: 80, fill: F.pave },
      { name: 'Песчано-цементная смесь', t: 40, fill: F.sand },
      { name: 'ЩПС 0–40', t: 250, fill: F.shchps, hatch: true },
      { name: 'Геотекстиль 200 г/м²', t: 10, fill: F.geo },
      { name: 'Уплотнённое основание', t: 90, fill: F.ground, hatch: true }
    ], { sub: 'хозяйственный проезд' });
    s += nodeBlock(48, 12, 'Узел 3. Газон', [
      { name: 'Травостой', t: 20, fill: F.grass },
      { name: 'Плодородный слой', t: 150, fill: F.soil },
      { name: 'Рыхление подстилающего грунта', t: 100, fill: F.ground, hatch: true }
    ], { sub: 'вся открытая площадь участка' });

    s += nodeBlock(0, 34, 'Узел 4. Гряда-короб', [
      { name: 'Мульча — солома или компост', t: 50, fill: F.soil },
      { name: 'Грунт: торф, компост, песок', t: 250, fill: F.soil, hatch: true },
      { name: 'Геотекстиль по дну короба', t: 10, fill: F.geo },
      { name: 'Дренажный слой — щебень 20–40', t: 60, fill: F.gravel }
    ], { sub: 'борт ДПК h 300 мм по стойкам' });
    s += nodeBlock(24, 34, 'Узел 5. Дренажная траншея', [
      { name: 'Обратная засыпка грунтом', t: 250, fill: F.ground, hatch: true },
      { name: 'Геотекстиль, нахлёст 300 мм', t: 10, fill: F.geo },
      { name: 'Щебень 20–40 над трубой', t: 150, fill: F.gravel },
      { name: 'Дрена Ø 110 в фильтре', t: 110, fill: '#E4F1F6' },
      { name: 'Подстилающий щебень', t: 100, fill: F.gravel }
    ], { sub: 'уклон 0,005 к дренажному колодцу' });
    s += nodeBlock(48, 34, 'Узел 6. Терраса на опорах', [
      { name: 'Доска ДПК 140×25', t: 25, fill: F.deck },
      { name: 'Лага 50×40, шаг 400 мм', t: 40, fill: F.deck },
      { name: 'Опора регулируемая / блок', t: 120, fill: F.concrete, hatch: true },
      { name: 'Щебёночная подушка', t: 150, fill: F.gravel },
      { name: 'Геотекстиль по грунту', t: 10, fill: F.geo }
    ], { sub: 'терраса бани, зазор досок 4 мм' });
    s += P.title(0, 2, 'Узлы конструкций покрытий, гряды и дренажа', 'Разрезы, состав слоёв, толщины в миллиметрах');
    return { body: s, series: 'node', footer: nodeFooter([
      'Слои уплотняются виброплитой послойно; коэффициент уплотнения основания — не ниже 0,98.',
      'Геотекстиль укладывается с нахлёстом полотен 0,3 м, края заводятся на борт.',
      'Борт садовый ставится на бетонную подушку М150 с упором, верх борта — заподлицо с газоном.',
      'Проезд к гаражу выполняется по узлу 2: брусчатка 80 мм и основание 250 мм под нагрузку легкового автомобиля.',
      'Дренажная труба укладывается с проверкой уклона нивелиром; короб гряды — на оцинкованных уголках.',
      'Деревянные элементы в контакте с грунтом обрабатываются антисептиком; доска террасы — на скрытых клипсах.'
    ]), footerH: 122 };
  }

  // ---------- вид на зону отдыха ----------
  function vid() {
    const G = 58;                                   // линия земли
    const X = m => M.len(m), H = m => M.len(m);
    let s = `<g data-el="view">`;
    s += `<rect x="0" y="${G - H(4.6)}" width="${X(15.0)}" height="${H(4.6)}" fill="#F2F6F8"/>`;
    s += `<rect x="0" y="${G}" width="${X(15.0)}" height="${H(0.7)}" fill="#E8EFDF"/>`;
    s += `<line x1="0" y1="${G}" x2="${X(15.0)}" y2="${G}" stroke="${L.ink}" stroke-width="${W.main}"/>`;
    // дом на заднем плане
    s += `<g opacity="0.42"><rect x="${X(10.2)}" y="${G - H(4.2)}" width="${X(4.6)}" height="${H(4.2)}" fill="#D9D2CB" stroke="#8A8478" stroke-width="${W.thin}"/>`
      + `<polygon points="${X(9.9)},${G - H(4.2)} ${X(12.5)},${G - H(5.6)} ${X(15.1)},${G - H(4.2)}" fill="#C9BFB4" stroke="#8A8478" stroke-width="${W.thin}"/>`
      + `<text x="${X(12.5)}" y="${G - H(2.0)}" font-size="10.5" fill="#6E6A63" text-anchor="middle">жилой дом</text></g>`;
    // баня с террасой и купелью
    s += `<rect x="${X(0.8)}" y="${G - H(3.0)}" width="${X(6.0)}" height="${H(3.0)}" fill="#EFE0CE" stroke="${L.buildNew}" stroke-width="${W.cut}"/>`;
    s += `<polygon points="${X(0.4)},${G - H(3.0)} ${X(3.8)},${G - H(4.6)} ${X(7.2)},${G - H(3.0)}" fill="#E4D2BB" stroke="${L.buildNew}" stroke-width="${W.vis}"/>`;
    s += `<rect x="${X(1.8)}" y="${G - H(2.3)}" width="${X(1.0)}" height="${H(1.1)}" fill="#DCE9EF" stroke="#8A8478" stroke-width="${W.thin}"/>`;
    s += `<rect x="${X(4.4)}" y="${G - H(2.1)}" width="${X(0.9)}" height="${H(2.1)}" fill="#C8AE90" stroke="#8A8478" stroke-width="${W.thin}"/>`;
    s += `<text x="${X(3.8)}" y="${G - H(5.0)}" font-size="12" font-weight="600" fill="${L.ink}" text-anchor="middle">баня 6,0 × 4,0 м</text>`;
    s += `<rect x="${X(0.8)}" y="${G - H(0.32)}" width="${X(6.0)}" height="${H(0.32)}" fill="#C99A6A" stroke="${L.ink}" stroke-width="${W.thin}"/>`;
    s += `<ellipse cx="${X(5.8)}" cy="${G - H(0.7)}" rx="${X(1.0)}" ry="${H(0.36)}" fill="#DCEAF0" stroke="${L.water}" stroke-width="${W.vis}"/>`;
    s += `<text x="${X(5.8)}" y="${G - H(1.2)}" font-size="10" fill="${L.water}" text-anchor="middle">купель</text>`;
    // посадки
    const bush = (x, h, w2, col) => {
      let t = '';
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (i / 6);
        t += `<circle cx="${X(x + Math.cos(a) * w2 / 2).toFixed(1)}" cy="${(G - H(h * (0.45 + 0.35 * Math.sin(a)))).toFixed(1)}" r="${H(h * 0.3).toFixed(1)}" fill="${col}" fill-opacity="0.5" stroke="${col}" stroke-width="${W.aux}"/>`;
      }
      return t;
    };
    s += bush(7.8, 1.5, 1.6, '#7FA860') + bush(9.2, 1.0, 1.3, '#93B27A');
    // костровая площадка
    s += `<ellipse cx="${X(11.4)}" cy="${G}" rx="${X(2.0)}" ry="${H(0.26)}" fill="#D9D2C4" stroke="#9A9184" stroke-width="${W.thin}"/>`;
    s += `<rect x="${X(11.0)}" y="${G - H(0.4)}" width="${X(0.8)}" height="${H(0.4)}" fill="#8A8478" stroke="${L.ink}" stroke-width="${W.thin}"/>`;
    s += `<path d="M${X(11.4)} ${G - H(0.45)}q${X(0.2)} ${-H(0.3)} 0 ${-H(0.62)}q${X(0.3)} ${H(0.18)} ${X(0.13)} ${H(0.62)}" fill="#E8A33D" stroke="#C77E1E" stroke-width="${W.aux}"/>`;
    s += `<text x="${X(11.4)}" y="${G - H(1.3)}" font-size="10" fill="${L.grey}" text-anchor="middle">костровая площадка</text>`;
    // дерево
    s += `<line x1="${X(8.6)}" y1="${G}" x2="${X(8.6)}" y2="${G - H(2.0)}" stroke="#6B5228" stroke-width="${W.main}"/>`;
    s += `<circle cx="${X(8.6)}" cy="${G - H(2.9)}" r="${H(1.2)}" fill="#DCEFD6" fill-opacity="0.85" stroke="${L.tree}" stroke-width="${W.vis}"/>`;
    // отметки и размеры
    s += P.levelPlan(X(3.2), G + 9, -0.42);
    s += P.levelPlan(X(11.4), G + 9, -0.72);
    s += P.dimV(X(0.4) - 6, G - H(4.6), G, '4,6 м');
    s += P.dimH(X(0.8), X(6.8), G + 20, '6,0 м');
    s += `</g>`;
    s += P.title(0, 0, 'Вид на зону отдыха со стороны поляны', 'Схематичный вид: баня с террасой и купелью, костровая площадка, дом на заднем плане');
    const footer = (x, y, w) => P.notes(x, y + 12, w, [
      'Вид условный, для понимания пропорций и высот; фасады бани разрабатываются отдельным проектом.',
      'Высота бани в коньке — 4,6 м, терраса на отметке −0,32 от условного ноля.',
      'Растения показаны в размере на третий год после посадки.',
      'Отделка бани принимается в цвет дома: тёмно-коричневый корпус, кремовые обрамления проёмов.'
    ], { wrap: Math.floor(w / 5.4) });
    return { body: s, footer, footerH: 96 };
  }

  // ---------- ведомость МАФ ----------
  function maf() {
    const rows = B.maf.map((m, i) => {
      const sz = m.r != null ? `Ø ${nm(m.r * 2)} м` : `${nm(m.w)} × ${nm(m.d)} м`;
      return [String(i + 1), m.name, sz, String(m.qty || 1)];
    });
    let s = P.title(0, -12, 'Ведомость малых архитектурных форм и оборудования', 'Что ставится на участке помимо построек и растений');
    s += P.table(0, 8, [{ t: '№', w: 30, align: 'middle' }, { t: 'Наименование', w: 340 }, { t: 'Габарит', w: 110, align: 'middle' }, { t: 'Кол-во', w: 60, align: 'middle' }], rows, { rh: 18 });
    s += P.table(614, 8, [{ t: '№', w: 30, align: 'middle' }, { t: 'Проектируемые постройки', w: 260 }, { t: 'Габарит', w: 110, align: 'middle' }, { t: 'Площадь', w: 80, align: 'middle' }],
      B.buildingsNew.map((b, i) => [String(i + 1), b.name, `${nm(b.w)} × ${nm(b.d)} м`, `${nm(b.area)} м²`]), { rh: 18 });
    let y = 40 + B.buildingsNew.length * 18 + 22;
    s += `<text x="614" y="${y}" font-size="12" font-weight="700" fill="${L.ink}">Состав построек</text>`;
    y += 16;
    B.buildingsNew.forEach(b => {
      s += `<text x="614" y="${y}" font-size="10.5" font-weight="600" fill="${L.ink}">${esc(b.name)}</text>`;
      y += 12;
      P.wrapText(b.spec, 84).forEach(ln => { s += `<text x="614" y="${y}" font-size="10" fill="#4A463F">${esc(ln)}</text>`; y += 12; });
      y += 5;
    });
    s += P.notes(0, 40 + rows.length * 18 + 24, 560, [
      'Кострище ставится на негорючее основание, площадка — гранитный отсев по геотекстилю.',
      'Мангал и кострище устанавливаются на негорючем основании с отступом от построек не менее 5 м.',
      'Купель заполняется от летнего водопровода, слив — в дренажную систему через отстойник.',
      'Шпалера-ширма хозяйственного двора оплетается девичьим виноградом за один-два сезона.',
      'Постройки выполняются в отделке дома: тёмно-коричневый корпус, кремовые обрамления.'
    ], { wrap: 100 });
    return { body: s, series: 'none' };
  }

  return [
    { dir: '03-ozelenenie', file: 'vedomost-rasteniy', name: 'Ассортиментная ведомость посадочного материала', type: 'planting-list', scaleHint: '—', render: vedomost },
    { dir: '03-ozelenenie', file: 'cvetniki-1', name: 'Цветники. Фрагменты: входная группа, теневой миксбордер', type: 'bed', scaleHint: '1:25', render: cvetniki1 },
    { dir: '03-ozelenenie', file: 'cvetniki-2', name: 'Цветники. Куртина, миксбордер у проезда, костровая', type: 'bed', scaleHint: '1:50', render: cvetniki2 },
    { dir: '04-fragmenty', file: 'garazh-hozdvor', name: 'Гараж, проезд и хозяйственный двор. Фрагмент', type: 'fragment', scaleHint: '1:50', render: garazhFragment },
    { dir: '04-fragmenty', file: 'besedka-patio', name: 'Беседка, патио и тихий сад. Фрагмент', type: 'fragment', scaleHint: '1:100', render: besedkaFragment },
    { dir: '04-fragmenty', file: 'banya-kostrovaya', name: 'Баня, купель и костровая зона. Фрагмент', type: 'fragment', scaleHint: '1:50', render: banyaFragment },
    { dir: '05-inzheneriya', file: 'plan-osveshcheniya', name: 'План наружного освещения', type: 'lighting', scaleHint: '1:200', render: svet },
    { dir: '05-inzheneriya', file: 'plan-poliva', name: 'План автоматического полива', type: 'irrigation', scaleHint: '1:200', render: poliv },
    { dir: '06-uzly', file: 'uzly-pokrytiy', name: 'Узлы конструкций покрытий, гряды и дренажа', type: 'node', series: 'node', scaleHint: '1:20', render: uzly },
    { dir: '06-uzly', file: 'vid-zona-otdyha', name: 'Вид на зону отдыха со стороны поляны', type: 'view', scaleHint: '1:100', render: vid },
    { dir: '07-vedomosti', file: 'vedomost-maf', name: 'Ведомость малых архитектурных форм и оборудования', type: 'maf-list', scaleHint: '—', render: maf }
  ];
};
