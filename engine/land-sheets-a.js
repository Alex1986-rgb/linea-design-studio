'use strict';
// ================================================================
// LINEA · листы ландшафтного альбома, часть 1: титул → посадочный чертёж
// Лист = { body — чертёж в модельных единицах, panel/footer — блоки в бумажных }
// ================================================================
const P = require('./paper');
const LZ = require('./land-layers');
const BOM = require('./land-bom');
const L = P.L, W = P.W, esc = P.esc, nm = P.nm;

module.exports = function (M) {
  const B = M.brief, S = M.S;
  const SW = B.site.width, SD = B.site.depth;
  const ex = B.existing, pl = B.planting;
  const findB = id => ex.buildings.find(b => b.id === id);
  const dom = findB('dom');
  const A = BOM.areas(B);

  // ---------- общий подмалёвок ----------
  function base(opt) {
    opt = opt || {};
    let s = LZ.defs();
    s += `<rect x="${M.box({ x: 0, y: 0, w: SW, d: SD }).x}" y="0" width="${M.len(SD)}" height="${M.len(SW)}" fill="${opt.pale ? '#FCFCFA' : LZ.FILL.lawn}"/>`;
    if (opt.paving !== false) {
      ex.paving.filter(p => p.x != null).forEach(p => { s += LZ.pave(M, p, 'tile'); });
      s += LZ.pave(M, { x: dom.x - 1, y: dom.y - 1, w: dom.w + 2, d: dom.d + 2 }, 'tile');
    }
    if (opt.newPaving !== false) {
      B.paths.forEach(p => { s += LZ.pathway(M, p.pts, p.w, p.kind); });
      B.paving.forEach(p => { s += LZ.pave(M, p, p.kind === 'tile' ? 'tileNew' : p.kind); });
    }
    if (opt.buildings !== false) {
      ex.buildings.forEach(b => { s += LZ.building(M, b, { label: opt.labels !== false, f: b.id === 'dom' ? 12 : 10, limit: M.px(0) - 4, minX: 0 }); });
      if (opt.newBuildings !== false) B.buildingsNew.forEach(b => { s += LZ.building(M, b, { isNew: true, label: opt.labels !== false, f: 10, area: opt.area, limit: M.px(0) - 4, minX: 0 }); });
    }
    s += LZ.siteFrame(M, { fill: 'none', neighbours: opt.neighbours !== false, gates: opt.gates !== false });
    return s;
  }

  function greenery() {
    let s = '';
    pl.beds.forEach(b => { s += LZ.flowerBed(M, b); });
    pl.hedges.forEach(h => { s += LZ.hedgeLine(M, h.line[0], h.line[1], h.step, Math.max(0.6, h.step * 0.95), { color: h.id === 'h2' ? '#2F6B4F' : L.shrub }); });
    s += LZ.hedgeLine(M, [0.9, 2.0], [0.9, 12.5], 1.3, 1.1, { color: '#2F6B4F', fill: '#D5E5D2' });
    pl.trees.forEach(t => {
      const isConifer = /ель|сосна|можжевельник|туя/i.test(t.name);
      s += isConifer ? LZ.conifer(M, t.x, t.y, t.crown, {}) : LZ.tree(M, t.x, t.y, t.crown, { existing: t.existing });
    });
    return s;
  }

  function siteDims() {
    const o = M.box({ x: 0, y: 0, w: SW, d: SD });
    return P.dimH(o.x, o.x + o.w, o.y + o.h + 22, `${nm(SD)} м`) + P.dimV(o.x + o.w + 26, o.y, o.y + o.h, `${nm(SW)} м`);
  }
  const northMark = () => P.north(M.px(0) - 26, M.py(SW) - 24, 13, 0);

  // ---------- ЛИСТ 1 · титул ----------
  function titul(no, all) {
    const rows = all.map((sh, i) => [String(i + 1), sh.name, sh.scaleHint || '1:200']);
    let s = `<text x="0" y="0" font-size="30" font-weight="700" fill="${L.ink}">ЛАНДШАФТНЫЙ ПРОЕКТ УЧАСТКА</text>`;
    s += `<text x="0" y="26" font-size="15" fill="${L.grey}">${esc(B.meta.address)} · ${B.site.area} м² (${nm((B.site.area / 100).toFixed(2))} сотки)</text>`;
    s += `<line x1="0" y1="42" x2="1000" y2="42" stroke="${L.ink}" stroke-width="${W.main}"/>`;
    const info = [
      ['Объект', `Индивидуальный жилой дом, участок ${nm(SW)} × ${nm(SD)} м`],
      ['Заказчик', B.meta.client],
      ['Стадия', 'Рабочий проект (РП)'],
      ['Климат', B.meta.region],
      ['Дом', 'Существующий, в проекте не изменяется'],
      ['Разработал', 'Кырлан Александр · ландшафтный архитектор LINEA'],
      ['Дата выпуска', B.meta.issueDate]
    ];
    info.forEach((r, i) => {
      s += `<text x="0" y="${68 + i * 19}" font-size="11" fill="${L.grey}">${esc(r[0])}</text>`;
      s += `<text x="112" y="${68 + i * 19}" font-size="12" font-weight="600" fill="${L.ink}">${esc(r[1])}</text>`;
    });
    let y = 68 + info.length * 19 + 22;
    s += `<text x="0" y="${y}" font-size="13" font-weight="700" fill="${L.ink}">Состав альбома</text>`;
    s += P.table(0, y + 10, [{ t: '№', w: 32, align: 'middle' }, { t: 'Наименование листа', w: 400 }, { t: 'Масштаб', w: 78, align: 'middle' }], rows, { rh: 15, f: 10, hh: 19 });
    // правая колонка
    const prog = [
      'Зонирование восьми соток: парадная часть, поляна, зона отдыха, детская, огород, хозяйственный двор.',
      'Баня с террасой, хозблок с дровником, теплица и патио — с нормируемыми отступами от границ.',
      'Замкнутый маршрут дорожек: гостевые и хозяйственные потоки не пересекаются.',
      'Водоотвод с кровли и мощения в нижнюю точку участка через дренажные тоннели.',
      'Посадки под фактические условия: тень с севера, солнце с юга, под ЛЭП — только низкорослое.',
      'Освещение четырьмя группами, автополив шестью зонами.',
      'Ведомости, смета по фактической геометрии и график работ на два сезона.'
    ];
    s += `<text x="560" y="68" font-size="13" font-weight="700" fill="${L.ink}">Что решает проект</text>`;
    let yy = 88;
    prog.forEach(t => {
      P.wrapText(t, 54).forEach((ln, j) => { s += `<text x="${560 + (j ? 12 : 0)}" y="${yy}" font-size="10.5" fill="#33312E">${j ? '' : '— '}${esc(ln)}</text>`; yy += 13; });
      yy += 3;
    });
    yy += 10;
    s += `<text x="560" y="${yy}" font-size="13" font-weight="700" fill="${L.ink}">Баланс территории</text>`;
    yy += 12;
    s += P.table(560, yy, [{ t: 'Элемент', w: 210 }, { t: 'Площадь, м²', w: 84, align: 'middle' }, { t: 'Доля', w: 56, align: 'middle' }], [
      ['Застройка существующая', nm(A.build), Math.round(A.build / A.total * 100) + ' %'],
      ['Постройки проектируемые', nm(A.buildNew), Math.round(A.buildNew / A.total * 100) + ' %'],
      ['Мощение существующее', nm(A.paveOld), Math.round(A.paveOld / A.total * 100) + ' %'],
      ['Покрытия новые', nm(+(A.paveNew + A.path + A.gravel).toFixed(1)), Math.round((A.paveNew + A.path + A.gravel) / A.total * 100) + ' %'],
      ['Газон', nm(A.lawn), Math.round(A.lawn / A.total * 100) + ' %'],
      ['Цветники, изгороди, посадки', nm(+(A.bed + A.hedge + A.tree).toFixed(1)), Math.round((A.bed + A.hedge + A.tree) / A.total * 100) + ' %'],
      ['Огород', nm(A.veg), Math.round(A.veg / A.total * 100) + ' %']
    ], { rh: 15, f: 10, hh: 19 });
    return { body: s, series: 'none' };
  }

  // ---------- ЛИСТ 2 · опорный план ----------
  function oporny() {
    let s = base({ newPaving: false, newBuildings: false, labels: true });
    s += LZ.hedgeLine(M, [0.9, 2.0], [0.9, 12.5], 1.3, 1.1, { color: '#2F6B4F', fill: '#D5E5D2' });
    pl.trees.filter(t => t.existing).forEach(t => { s += LZ.tree(M, t.x, t.y, t.crown, { existing: true, cross: true }); });
    const junk = [
      { x: 2.6, y: 22.8, w: 1.2, d: 0.8, t: 'Д1' }, { x: 18.6, y: 21.6, w: 1.2, d: 0.8, t: 'Д1' },
      { x: 15.6, y: 22.6, w: 2.4, d: 0.8, t: 'Д2' }, { x: 5.4, y: 11.4, w: 2.2, d: 0.6, t: 'Д3' }
    ];
    junk.forEach(j => {
      const b = M.box(j);
      s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#F6DDD9" stroke="${L.hot}" stroke-width="${W.thin}"/>`;
      s += `<path d="M${b.x} ${b.y}l${b.w} ${b.h}M${b.x + b.w} ${b.y}l${-b.w} ${b.h}" stroke="${L.hot}" stroke-width="${W.aux}"/>`;
      s += P.pos(b.x + b.w + 8, b.y + b.h / 2, j.t, L.hot);
    });
    [{ x: 1.4, y: 30.5, r: 2.2 }, { x: 19.4, y: 27.5, r: 1.8 }, { x: 10.5, y: 35.0, r: 2.4 }].forEach(w2 => {
      const [cx, cy] = M.pt(w2.x, w2.y);
      s += `<circle cx="${cx}" cy="${cy}" r="${M.len(w2.r)}" fill="#E9E4C8" fill-opacity="0.75" stroke="#9C8A2E" stroke-width="${W.thin}" stroke-dasharray="3 3"/>`;
      s += `<text x="${cx}" y="${cy + 3}" font-size="9.6" fill="#7C6D22" text-anchor="middle">Д4</text>`;
    });
    const [lx1, ly1] = M.pt(0.35, 0), [lx2] = M.pt(0.35, SD);
    s += `<line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly1}" stroke="${L.wire}" stroke-width="${W.thin}" stroke-dasharray="14 4 3 4"/>`;
    s += `<text x="${(lx1 + lx2) / 2}" y="${ly1 - 5}" font-size="10" fill="${L.wire}" text-anchor="middle">воздушная ЛЭП, охранная зона 2 м</text>`;
    const bd = M.box(dom);
    s += P.dimH(bd.x + bd.w, M.px(0), bd.y - 8, `${nm(dom.y)}`);
    s += P.dimH(bd.x, bd.x + bd.w, bd.y - 8, `${nm(dom.d)}`);
    s += P.dimV(bd.x - 6, bd.y, bd.y + bd.h, `${nm(dom.w)}`);
    s += P.dimV(bd.x + bd.w + 8, M.py(0), M.py(dom.x), `${nm(dom.x)}`);
    s += P.dimV(bd.x + bd.w + 8, M.py(dom.x + dom.w), M.py(SW), `${nm(+(SW - dom.x - dom.w).toFixed(1))}`);
    s += siteDims() + northMark();
    s += P.title(M.px(SD), -34, 'Опорный план. Существующее положение и демонтаж', 'Что остаётся, что убирается, что мешает работам');
    const panel = (x, y, w) => {
      let t = P.table(x, y, [{ t: '№', w: 30, align: 'middle' }, { t: 'Существующий объект', w: 300 }, { t: 'Решение', w: 190 }], [
        ['1', 'Жилой дом 8,5 × 10,0 м, 2 этажа', 'сохраняется'],
        ['2', 'Крыльцо с навесом', 'сохраняется'],
        ['3', 'Навес для автомобилей 5,5 × 6,0 м', 'сохраняется'],
        ['4', 'Беседка 3,5 × 4,0 м', 'сохраняется'],
        ['5', 'Мощение въезда, парковки и парадной дорожки', 'сохраняется, ремонт просадок'],
        ['6', 'Ивы шаровидные на штамбе, 2 шт.', 'формовка кроны'],
        ['7', 'Туя западная, рядовая посадка, 8 шт.', 'изгородь продлевается'],
        ['8', 'Плодовые деревья молодые, 4 шт.', 'санитарная обрезка'],
        ['9', 'Розы кустовые у крыльца, 5 шт.', 'пересадка в цветник'],
        ['10', 'Газон посевной', 'ремонт и подсев']
      ], { rh: 17 });
      t += P.table(x, y + 220, [{ t: 'Обозн.', w: 54, align: 'middle' }, { t: 'Демонтаж и подготовка', w: 276 }, { t: 'Объём', w: 190, align: 'middle' }], [
        ['Д1', 'Ларь металлический ржавый', '2 шт.'],
        ['Д2', 'Остатки досок, блоков, кирпича', '~1,5 м³'],
        ['Д3', 'Деревянный каркас у торца дома', '1 шт.'],
        ['Д4', 'Куртины сорняков: золотарник, зонтичные', '~28 м²'],
        ['Д5', 'Перенос сушилки для белья в хоз. двор', '1 шт.'],
        ['Д6', 'Снятие дернины под покрытия и постройки', `~${Math.round(A.paveNew + A.path + A.gravel + A.buildNew + A.bed)} м²`]
      ], { rh: 17 });
      return t;
    };
    const footer = (x, y, w) => P.notes(x, y + 14, w, [
      'Зонтичные сорняки (пастернак, борщевик) удалять в перчатках и закрытой одежде, с корнем, до цветения.',
      'Золотарник вырезать по границам, при перекопке корневища выбирать вручную; повторить через 3–4 недели.',
      'Строительный мусор вывозится до земляных работ — по нему проходит трасса дренажа и кабеля.',
      'Существующие деревья на время работ защитить обвязкой ствола и щитами приствольного круга.'
    ], { wrap: Math.floor(w / 5.4) });
    return { body: s, panel, panelW: 520, footer, footerH: 96 };
  }

  // ---------- ЛИСТ 3 · зонирование ----------
  function zoning() {
    let s = base({ pale: true, newPaving: false, labels: false });
    B.zones.forEach((z, i) => {
      const b = M.box(z);
      s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${z.color}" fill-opacity="0.6" stroke="${L.zoneLine}" stroke-width="${W.thin}" stroke-dasharray="6 3" rx="5"/>`;
      s += P.pos(b.x + 11, b.y + 11, i + 1);
    });
    ex.buildings.forEach(b => { s += LZ.building(M, b, { label: b.id === 'dom', f: 11 }); });
    B.buildingsNew.forEach(b => { s += LZ.building(M, b, { isNew: true, label: false }); });
    s += LZ.siteFrame(M, { fill: 'none' });
    const [sx, sy] = M.pt(20.0, 4.0);
    s += `<g><circle cx="${sx}" cy="${sy}" r="8" fill="#FFF3C9" stroke="#D9A400" stroke-width="${W.thin}"/>`;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      s += `<line x1="${(sx + 10 * Math.cos(a)).toFixed(1)}" y1="${(sy + 10 * Math.sin(a)).toFixed(1)}" x2="${(sx + 14 * Math.cos(a)).toFixed(1)}" y2="${(sy + 14 * Math.sin(a)).toFixed(1)}" stroke="#D9A400" stroke-width="${W.aux}"/>`;
    }
    s += `</g><text x="${sx}" y="${sy + 26}" font-size="10" fill="#8A6D00" text-anchor="middle">юг · полдень</text>`;
    const bd = M.box(dom);
    s += `<rect x="${bd.x}" y="${bd.y - M.len(4.2)}" width="${bd.w}" height="${M.len(4.2)}" fill="#8AA0B4" fill-opacity="0.22"/>`;
    s += `<text x="${bd.x + bd.w / 2}" y="${bd.y - M.len(2.0)}" font-size="10" fill="#4E6478" text-anchor="middle">тень дома в полдень ≈ 4 м</text>`;
    s += northMark();
    s += P.title(M.px(SD), -34, 'Схема функционального зонирования и инсоляции', 'Кто где живёт на участке и сколько получает солнца');
    const panel = (x, y, w) => {
      let t = `<text x="${x}" y="${y + 12}" font-size="13" font-weight="700" fill="${L.ink}">Зоны участка</text>`;
      let yy = y + 30;
      B.zones.forEach((z, i) => {
        t += `<rect x="${x}" y="${yy - 9}" width="13" height="13" fill="${z.color}" stroke="${L.zoneLine}" stroke-width="${W.aux}"/>`;
        t += `<text x="${x + 19}" y="${yy + 2}" font-size="11" font-weight="600" fill="${L.ink}">${i + 1}. ${esc(z.name)} — ${Math.round(z.w * z.d)} м²</text>`;
        yy += 13;
        P.wrapText(z.idea, 62).forEach(ln => { t += `<text x="${x + 19}" y="${yy}" font-size="10" fill="#4A463F">${esc(ln)}</text>`; yy += 11.5; });
        yy += 7;
      });
      return t;
    };
    const footer = (x, y, w) => P.notes(x, y + 14, w, [
      'Южная полоса участка освещена весь день — там огород, теплица, ягодник и светолюбивые цветники.',
      'Северная полоса и полоса вдоль дома — полутень: беседка, теневой миксбордер, баня.',
      'Западная (задняя) граница не закрывается посадками выше 1,5 м — вид на поле остаётся открытым.',
      'Хозяйственный двор отделён шпалерой h = 1,8 м и не просматривается с поляны и от дома.'
    ], { wrap: Math.floor(w / 5.4) });
    return { body: s, panel, panelW: 470, footer, footerH: 96 };
  }

  // ---------- ЛИСТ 4 · генеральный план ----------
  function genplan() {
    let s = base({ area: true, neighbours: false, gates: false });
    s += greenery();
    const lead = (x, y, dx, dy, txt) => {
      const [px2, py2] = M.pt(x, y);
      return P.leader(px2, py2, px2 + dx, py2 + dy, txt, { anchor: dx < 0 ? 'end' : 'start' });
    };
    s += lead(11.0, 34.6, 14, -14, ['Костровая площадка', 'и вид на поле']);
    s += lead(16.7, 34.1, 16, -12, ['Гряды и ягодник']);
    s += lead(3.2, 9.4, 14, 12, ['Беседка (существующая)']);
    s += lead(9.4, 23.6, -10, 12, ['Патио у дома']);
    s += lead(17.5, 17.6, -12, 12, ['Проезд к гаражу 4,0 м']);
    s += lead(16.0, 24.0, -12, -12, ['Площадка перед гаражом']);
    s += lead(4.0, 34.1, 14, 14, ['Хозпостройка 6 × 3 м']);
    s += northMark();
    return { body: s };
  }

  // ---------- ЛИСТ 5 · разбивочный ----------
  function razbivka() {
    let grid = `<g stroke="#B9B4AA" stroke-width="${W.aux}">`;
    for (let y = 0; y <= SD; y += 2) grid += `<line x1="${M.px(y)}" y1="${M.py(0)}" x2="${M.px(y)}" y2="${M.py(SW)}"${y % 10 ? ' stroke-dasharray="2 3"' : ''}/>`;
    for (let x = 0; x <= SW; x += 2) grid += `<line x1="${M.px(0)}" y1="${M.py(x)}" x2="${M.px(SD)}" y2="${M.py(x)}"${x % 10 ? ' stroke-dasharray="2 3"' : ''}/>`;
    grid += `</g>`;
    for (let y = 0; y <= SD; y += 5) grid += `<text x="${M.px(y)}" y="${M.py(SW) + 13}" font-size="10" fill="#6F6A62" text-anchor="middle">${y}</text>`;
    for (let x = 0; x <= SW; x += 5) grid += `<text x="${M.px(SD) - 10}" y="${M.py(x) + 3.4}" font-size="10" fill="#6F6A62" text-anchor="middle">${x}</text>`;
    let s = grid + base({ lawn: false, pale: true, labels: false });
    const objs = B.buildingsNew.concat([
      { name: 'Костровая площадка', x: 8.8, y: 31.4, w: 4.4, d: 4.4 }
    ]);
    objs.forEach((o, i) => {
      const b = M.box(o);
      s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="${L.buildNew}" stroke-width="${W.main}"/>`;
      s += P.pos(b.x + b.w / 2, b.y + b.h / 2, i + 1, L.buildNew);
    });
    s += siteDims() + northMark();
    s += P.title(M.px(SD), -34, 'Разбивочный чертёж', 'Сетка 2 × 2 м от угла участка у ворот; вынос в натуру по координатам');
    const panel = (x, y, w) => {
      let t = P.table(x, y, [
        { t: '№', w: 28, align: 'middle' }, { t: 'Объект', w: 210 },
        { t: 'X / Y угла, м', w: 96, align: 'middle' }, { t: 'Размер, м', w: 96, align: 'middle' }
      ], objs.map((o, i) => [String(i + 1), o.name, `${nm(o.y.toFixed(1))} / ${nm(o.x.toFixed(1))}`, `${nm(o.d)} × ${nm(o.w)}`]), { rh: 17 });
      let yy = y + 30 + objs.length * 17 + 22;
      t += `<text x="${x}" y="${yy}" font-size="12" font-weight="700" fill="${L.ink}">Нормируемые отступы</text>`;
      yy += 17;
      [['Баня — от северной границы', '1,0 м', 'СП 53.13330.2019, 6.7'],
       ['Хозблок и теплица — от границы', '1,0 м', 'СП 53.13330.2019, 6.7'],
       ['Деревья — от границы', '≥ 2,0 м', 'СП 53.13330.2019, 6.7'],
       ['Кустарники — от границы', '≥ 1,0 м', 'СП 53.13330.2019, 6.7'],
       ['Компостер — от границы', '≥ 1,0 м', 'СП 53.13330.2019, 6.7'],
       ['Посадки под ЛЭП', 'высота ≤ 3,0 м', 'охранная зона ВЛ 0,4 кВ'],
       ['Мангал — от построек', '≥ 5,0 м', 'противопожарный разрыв']
      ].forEach(r => {
        t += `<text x="${x}" y="${yy}" font-size="10.5" fill="#33312E">${esc(r[0])}</text>`;
        t += `<text x="${x + 210}" y="${yy}" font-size="10.5" font-weight="700" fill="${L.ink}">${esc(r[1])}</text>`;
        t += `<text x="${x + 270}" y="${yy}" font-size="9.6" fill="${L.grey}">${esc(r[2])}</text>`;
        yy += 15;
      });
      return t;
    };
    const footer = (x, y, w) => P.notes(x, y + 14, w, [
      'Вынос в натуру: от угла участка у ворот, рулеткой по сетке; углы построек закрепить колышками и проверить диагонали.',
      'Перед разбивкой — контрольный замер фактических размеров участка и положения дома.',
      'Отклонение фактических размеров более 0,3 м — согласовать корректировку плана до начала работ.'
    ], { wrap: Math.floor(w / 5.4) });
    return { body: s, panel, panelW: 460, footer, footerH: 78 };
  }

  // ---------- ЛИСТ 6 · покрытия ----------
  function pokrytiya() {
    let s = base({ labels: false });
    const marks = [
      { x: 15.0, y: 6.0, n: 1 }, { x: 10.4, y: 5.0, n: 2 }, { x: 10.0, y: 12.6, n: 2 },
      { x: 16.8, y: 15.4, n: 3 }, { x: 19.4, y: 20.6, n: 4 }, { x: 4.0, y: 25.4, n: 5 },
      { x: 9.4, y: 33.6, n: 6 }, { x: 13.4, y: 30.0, n: 7 }, { x: 10.4, y: 23.6, n: 3 },
      { x: 3.0, y: 21.0, n: 2 }, { x: 8.0, y: 28.0, n: 8 }, { x: 16.5, y: 22.6, n: 7 }
    ];
    marks.forEach(m2 => { const [x, y] = M.pt(m2.x, m2.y); s += P.pos(x, y, m2.n); });
    s += siteDims() + northMark();
    s += P.title(M.px(SD), -34, 'План покрытий и дорожно-тропиночной сети', 'Типы покрытий, площади, борта и уклоны поверхности');
    const panel = (x, y, w) => {
      let t = P.table(x, y, [
        { t: '№', w: 26, align: 'middle' }, { t: 'Покрытие', w: 176 }, { t: 'Состав (пирог)', w: 216 }, { t: 'S, м²', w: 62, align: 'middle' }
      ], [
        ['1', 'Мощение въезда (сущ.)', 'сохраняется, ремонт просадок', nm(A.paveOld)],
        ['2', 'Мощение пешеходное (сущ.)', 'сохраняется, промывка швов', 'в т.ч.'],
        ['3', 'Брусчатка новая 200×100×60', 'песок 30 / ЩПС 150 / геотекстиль', nm(+(A.paveNew + A.path).toFixed(1))],
                ['5', 'Террасная доска ДПК', 'лаги 50×40, шаг 400, по опорам', '13,2'],
        ['6', 'Отсыпка гранитная 5–20', 'слой 80 мм по геотекстилю', nm(A.gravel)],
        ['7', 'Проезд хозяйственный', 'ЩПС 200 + отсев 40', 'в т.ч.'],
        ['8', 'Газон посевной', 'плодородный слой 150 мм', nm(A.lawn)],
        ['9', 'Цветники с мульчей', 'кора 60 мм по прополотому грунту', nm(A.bed)],
        ['10', 'Гряды-короба', 'борт ДПК 300 мм, грунт по дренажу', nm(A.veg)]
      ], { rh: 18 });
      return t;
    };
    const footer = (x, y, w) => P.notes(x, y + 12, w, [
      'Все площадки мостятся с уклоном 0,005–0,01 от построек в сторону газона или лотка.',
      'Борт садовый бетонный 1000×200×80 на бетонной подушке — по всем новым дорожкам и площадкам.',
      'Швы брусчатки заполняются кварцевым песком; на уклонах — полимерная затирка.',
      'Основание уплотняется виброплитой слоями по 80–100 мм до коэффициента 0,98.',
      'Стык нового мощения с существующим — в один уровень, с подрезкой существующих камней.'
    ], { wrap: Math.floor(w / 5.4) });
    return { body: s, panel, panelW: 500, footer, footerH: 112 };
  }

  // ---------- ЛИСТ 7 · вертикальная планировка ----------
  function vertikalka() {
    let s = base({ labels: false });
    B.site.relief.marks.forEach(m2 => { const [x, y] = M.pt(m2.x, m2.y); s += P.levelPlan(x, y, m2.z); });
    [{ x: 3.0, y: 20.0, z: -0.12 }, { x: 19.0, y: 20.0, z: -0.10 }, { x: 4.0, y: 27.5, z: -0.42 },
     { x: 18.0, y: 27.0, z: -0.40 }, { x: 18.5, y: 33.0, z: -0.78 }, { x: 3.5, y: 33.5, z: -0.80 }
    ].forEach(m2 => { const [x, y] = M.pt(m2.x, m2.y); s += P.levelPlan(x, y, m2.z); });
    [[[16.6, 10.6], [19.8, 5.2], 8], [[8.6, 23.6], [8.6, 25.8], 12],
     [[2.4, 22.4], [2.4, 24.0], 12], [[21.0, 22.6], [21.0, 31.4], 12],
     [[8.8, 32.0], [8.8, 35.6], 20], [[4.6, 12.6], [2.2, 8.4], 10]
    ].forEach(([a, b2, pr]) => {
      const [x1, y1] = M.pt(a[0], a[1]), [x2, y2] = M.pt(b2[0], b2[1]);
      s += P.slopeArrow(x1, y1, x2, y2, pr + '‰');
    });
    const dr = B.water.drainage.find(d => /колодец/.test(d.kind));
    const [dx, dy] = M.pt(dr.x, dr.y);
    s += `<circle cx="${dx}" cy="${dy}" r="5.5" fill="#FFFFFF" stroke="${L.water}" stroke-width="${W.main}"/>`
      + `<path d="M${dx - 4} ${dy}h8M${dx} ${dy - 4}v8" stroke="${L.water}" stroke-width="${W.thin}"/>`
      + `<text x="${dx}" y="${dy - 9}" font-size="10" fill="${L.water}" text-anchor="middle">ДК-1</text>`;
    const tun = B.water.drainage.find(d => /тоннель/.test(d.kind));
    const tb = M.box({ x: tun.x - 0.6, y: tun.y - 1.2, w: 1.2, d: 2.4 });
    s += `<rect x="${tb.x}" y="${tb.y}" width="${tb.w}" height="${tb.h}" fill="${LZ.FILL.water}" stroke="${L.water}" stroke-width="${W.thin}"/>`;
    s += `<text x="${tb.x + tb.w / 2}" y="${tb.y + tb.h + 11}" font-size="10" fill="${L.water}" text-anchor="middle">ДТ-1,2</text>`;
    const outs = [[dom.x + 0.3, dom.y + 0.3], [dom.x + dom.w - 0.3, dom.y + 0.3], [dom.x + 0.3, dom.y + dom.d - 0.3], [dom.x + dom.w - 0.3, dom.y + dom.d - 0.3]];
    outs.forEach(([oxm, oym], i) => {
      const [x1, y1] = M.pt(oxm, oym);
      s += `<rect x="${x1 - 3}" y="${y1 - 3}" width="6" height="6" fill="#FFFFFF" stroke="${L.water}" stroke-width="${W.thin}"/>`;
      s += `<text x="${x1 + 7}" y="${y1 - 4}" font-size="9.6" fill="${L.water}">ДП-${i + 1}</text>`;
      s += `<line x1="${x1}" y1="${y1}" x2="${dx}" y2="${dy}" stroke="${L.water}" stroke-width="${W.thin}" stroke-dasharray="7 3"/>`;
    });
    s += siteDims() + northMark();
    s += P.title(M.px(SD), -34, 'Вертикальная планировка и водоотвод', 'Отметки, уклоны, ливневая канализация и дренаж');
    const panel = (x, y, w) => P.table(x, y, [{ t: 'Обозн.', w: 70 }, { t: 'Элемент водоотвода', w: 260 }, { t: 'Кол-во', w: 110, align: 'middle' }], [
      ['ДП-1…4', 'Дождеприёмник 300×300 с корзиной', '4 шт.'],
      ['ДК-1', 'Колодец смотровой дренажный Ø 630', '1 шт.'],
      ['ДТ-1,2', 'Тоннель дренажный 300 л', '2 шт.'],
      ['Т-1', 'Труба ПВХ Ø 110 (ливнёвка)', '46 м'],
      ['Т-2', 'Дрена гофр. Ø 110 в геотекстиле', '58 м'],
      ['Л-1', 'Лоток водоотводный с решёткой (сущ.)', '6 м'],
      ['—', 'Щебень фракции 20–40 для обсыпки', '9 м³'],
      ['—', 'Геотекстиль 150 г/м²', '92 м²']
    ], { rh: 18 });
    const footer = (x, y, w) => P.notes(x, y + 12, w, [
      'За отметку 0,000 принята отметка мощёной отмостки у крыльца дома; отметки условные.',
      'Общий уклон участка — от дома к задней (западной) границе, перепад ≈ 0,95 м на 37 м.',
      'Уклон газона — не менее 0,005; площадок — 0,005–0,01 от построек; трасс дренажа — 0,005 к колодцу.',
      'Плодородный грунт под газон и цветники завозится после прокладки всех подземных трасс.',
      'До земляных работ выполнить нивелировку и уточнить фактические перепады.'
    ], { wrap: Math.floor(w / 5.4) });
    return { body: s, panel, panelW: 450, footer, footerH: 112 };
  }

  // ---------- ЛИСТ 8 · дендроплан ----------
  function dendro() {
    let s = base({ labels: false });
    s += greenery();
    pl.trees.forEach((t, i) => {
      const [x, y] = M.pt(t.x, t.y);
      s += P.pos(x + M.len(t.crown) / 2 + 6, y - M.len(t.crown) / 2 - 3, i + 1, t.existing ? L.treeOld : L.tree);
    });
    pl.hedges.forEach((h, i) => {
      const [x, y] = M.pt((h.line[0][0] + h.line[1][0]) / 2, (h.line[0][1] + h.line[1][1]) / 2);
      s += P.pos(x, y, 'И' + (i + 1), L.shrub);
    });
    pl.beds.forEach((b, i) => {
      const [x, y] = b.r != null ? M.pt(b.cx, b.cy) : M.cen(b);
      s += P.pos(x, y, 'Ц' + (i + 1), L.flower);
    });
    s += northMark();
    s += P.title(M.px(SD), -34, 'Дендроплан', 'Деревья, кустарники, живые изгороди и цветники с номерами позиций');
    const panel = (x, y, w) => {
      let t = P.table(x, y, [{ t: '№', w: 26, align: 'middle' }, { t: 'Дерево', w: 230 }, { t: 'Кол-во', w: 56, align: 'middle' }, { t: 'Крона, м', w: 66, align: 'middle' }],
        pl.trees.map((tr, i) => [String(i + 1), tr.name.replace(/\s*\(существующ[^)]*\)/i, ''), tr.existing ? 'сущ.' : '1', nm(tr.crown)]), { rh: 15, f: 10, hh: 19 });
      let yy = y + 24 + pl.trees.length * 15 + 16;
      t += P.table(x, yy, [{ t: '№', w: 26, align: 'middle' }, { t: 'Живые изгороди и группы', w: 230 }, { t: 'Кол-во', w: 56, align: 'middle' }, { t: 'Высота', w: 66, align: 'middle' }],
        pl.hedges.map((h, i) => ['И' + (i + 1), h.plant, `${Math.round(Math.hypot(h.line[1][0] - h.line[0][0], h.line[1][1] - h.line[0][1]) / h.step) + 1} шт.`, `h ${nm(h.h)} м`]), { rh: 15, f: 10, hh: 19 });
      yy += 24 + pl.hedges.length * 15 + 16;
      t += P.table(x, yy, [{ t: '№', w: 26, align: 'middle' }, { t: 'Цветники и куртины', w: 286 }, { t: 'Площадь', w: 66, align: 'middle' }],
        pl.beds.map((b, i) => ['Ц' + (i + 1), b.name, b.r != null ? `${Math.round(Math.PI * b.r * b.r * 0.46)} м²` : `${nm((b.w * b.d).toFixed(1))} м²`]), { rh: 15, f: 10, hh: 19 });
      return t;
    };
    const footer = (x, y, w) => P.notes(x, y + 12, w, [
      'Существующие деревья сохраняются: ивы формуются ранней весной, плодовые проходят санитарную обрезку.',
      'Живые изгороди высаживаются в траншею; шаг посадки в ряду выдерживается по шнуру.',
      'Под воздушной линией по северной границе высота взрослых растений ограничена 3 м.',
      'Приствольные круги деревьев Ø 0,8–1,0 м мульчируются корой слоем 60 мм.',
      'Точное положение существующих стволов уточняется при выносе разбивочной сетки в натуру.'
    ], { wrap: Math.floor(w / 5.4) });
    return { body: s, panel, panelW: 400, footer, footerH: 112 };
  }

  // ---------- ЛИСТ 9 · посадочный ----------
  function posadka() {
    let s = base({ lawn: false, pale: true, labels: false });
    s += greenery();
    pl.trees.filter(t => !t.existing).slice(0, 4).forEach(t => {
      const [x, y] = M.pt(t.x, t.y);
      s += P.witness(x, y, x, M.py(0));
      s += P.dimV(x, M.py(0), y, nm(t.x.toFixed(1)));
      s += P.witness(x, y, M.px(0), y);
      s += P.dimH(M.px(0), x, y, nm(t.y.toFixed(1)));
    });
    s += northMark();
    s += P.title(M.px(SD), -34, 'Разбивочно-посадочный чертёж', 'Привязки посадок, размеры ям, шаг в рядах');
    const panel = (x, y, w) => P.table(x, y, [
      { t: 'Растение', w: 180 }, { t: 'Яма, м', w: 110, align: 'middle' }, { t: 'Шаг, м', w: 70, align: 'middle' }, { t: 'Грунт', w: 70, align: 'middle' }
    ], [
      ['Дерево лиственное', '0,8 × 0,8 × 0,7', '4,0–5,0', '70 л'],
      ['Дерево хвойное', '0,7 × 0,7 × 0,7', '3,0–4,0', '60 л'],
      ['Плодовое дерево', '0,8 × 0,8 × 0,6', '3,5–4,0', '60 л'],
      ['Кустарник крупный', '0,5 × 0,5 × 0,5', '1,0–1,2', '25 л'],
      ['Кустарник в изгороди', 'траншея 0,5 × 0,5', '0,7–0,8', '20 л/п.м'],
      ['Многолетник', '0,3 × 0,3 × 0,3', '0,3–0,5', '8 л'],
      ['Ягодный кустарник', '0,6 × 0,6 × 0,5', '1,5', '30 л']
    ], { rh: 18 });
    const footer = (x, y, w) => P.notes(x, y + 12, w, [
      'Посадочные ямы копаются на 20 см шире и глубже кома, дно рыхлится.',
      'Плодородная смесь: верховой торф 30 %, компост 30 %, местный грунт 30 %, песок 10 % плюс 60 г комплексного удобрения пролонгированного действия на яму.',
      'Корневая шейка после усадки — на уровне земли; у привитых плодовых прививка на 5 см выше грунта.',
      'После посадки — приствольный круг Ø 0,8–1,0 м, мульча корой 60 мм, полив 20–40 л на растение.',
      'Деревья выше 2 м раскрепляются тремя кольями с мягкой обвязкой на один сезон.',
      'Под воздушной линией высаживать только растения с максимальной высотой до 3 м.'
    ], { wrap: Math.floor(w / 5.4) });
    return { body: s, panel, panelW: 440, footer, footerH: 112 };
  }

  return [
    { dir: '00-obshchie-dannye', file: 'titul-vedomost', name: 'Титульный лист. Ведомость чертежей и баланс территории', type: 'title', scaleHint: '—', render: titul },
    { dir: '01-genplan', file: 'oporny-plan', name: 'Опорный план. Существующее положение и демонтаж', type: 'existing', scaleHint: '1:200', render: oporny },
    { dir: '01-genplan', file: 'zonirovanie', name: 'Схема функционального зонирования и инсоляции', type: 'zoning', scaleHint: '1:200', render: zoning },
    { dir: '01-genplan', file: 'genplan', name: 'Генеральный план участка', type: 'genplan', scaleHint: '1:100', render: genplan },
    { dir: '01-genplan', file: 'razbivochny-chertezh', name: 'Разбивочный чертёж', type: 'layout', scaleHint: '1:200', render: razbivka },
    { dir: '02-pokrytiya', file: 'plan-pokrytiy', name: 'План покрытий и дорожно-тропиночной сети', type: 'paving', scaleHint: '1:200', render: pokrytiya },
    { dir: '02-pokrytiya', file: 'vertikalnaya-planirovka', name: 'Вертикальная планировка и водоотвод', type: 'vertical', scaleHint: '1:200', render: vertikalka },
    { dir: '03-ozelenenie', file: 'dendroplan', name: 'Дендроплан', type: 'dendro', scaleHint: '1:200', render: dendro },
    { dir: '03-ozelenenie', file: 'posadochny-chertezh', name: 'Разбивочно-посадочный чертёж', type: 'planting', scaleHint: '1:200', render: posadka }
  ];
};
