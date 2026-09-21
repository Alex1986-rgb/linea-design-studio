'use strict';
// ================================================================
// LINEA · ведомости и смета ландшафтного проекта
// Один источник чисел для листов альбома, ведомостей и HTML-сметы.
// Цены — средняя полоса РФ, 2026 г.; работы — подрядчик с техникой.
// ================================================================
const PL = require('./land-plants');

const money = n => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');


// ---------- площади по факту геометрии ----------
// Растр 0,1 × 0,1 м: каждая ячейка получает верхний слой по приоритету.
// Так площади мощения, цветников и газона считаются без ручных перекрытий.
const CELL = 0.1;
function areas(brief) {
  const Wd = brief.site.width, D = brief.site.depth;
  const nx = Math.round(Wd / CELL), ny = Math.round(D / CELL);
  const grid = new Uint8Array(nx * ny);           // 0 — газон
  const KIND = ['lawn', 'build', 'buildNew', 'paveOld', 'paveNew', 'path', 'bed', 'hedge', 'veg', 'gravel', 'tree'];
  const idx = k => KIND.indexOf(k);
  const rect = (x, y, w, d, kind) => {
    const k = idx(kind);
    const x0 = Math.max(0, Math.round(x / CELL)), x1 = Math.min(nx, Math.round((x + w) / CELL));
    const y0 = Math.max(0, Math.round(y / CELL)), y1 = Math.min(ny, Math.round((y + d) / CELL));
    for (let i = x0; i < x1; i++) for (let j = y0; j < y1; j++) grid[i * ny + j] = k;
  };
  const circle = (cx, cy, r, kind, rin) => {
    const k = idx(kind);
    const x0 = Math.max(0, Math.round((cx - r) / CELL)), x1 = Math.min(nx, Math.round((cx + r) / CELL));
    const y0 = Math.max(0, Math.round((cy - r) / CELL)), y1 = Math.min(ny, Math.round((cy + r) / CELL));
    for (let i = x0; i < x1; i++) for (let j = y0; j < y1; j++) {
      const dx = (i + 0.5) * CELL - cx, dy = (j + 0.5) * CELL - cy, dd = Math.hypot(dx, dy);
      if (dd <= r && (!rin || dd >= rin)) grid[i * ny + j] = k;
    }
  };
  const line = (pts, w, kind) => {
    for (let s2 = 0; s2 < pts.length - 1; s2++) {
      const [ax, ay] = pts[s2], [bx, by] = pts[s2 + 1];
      const len = Math.hypot(bx - ax, by - ay), steps = Math.ceil(len / (CELL / 2));
      for (let t = 0; t <= steps; t++) {
        const x = ax + (bx - ax) * t / steps, y = ay + (by - ay) * t / steps;
        rect(x - w / 2, y - w / 2, w, w, kind);
      }
    }
  };

  // порядок = приоритет снизу вверх
  brief.planting.hedges.forEach(h => line(h.line, 0.8, 'hedge'));
  brief.planting.beds.forEach(b => { if (b.r != null) circle(b.cx, b.cy, b.r, 'bed', b.id === 'b7' ? 2.5 : 0); else rect(b.x, b.y, b.w, b.d, 'bed'); });
  brief.planting.trees.forEach(t => circle(t.x, t.y, 0.5, 'tree'));
  (brief.maf.find(m => m.beds) || { beds: [] }).beds.forEach(([x, y]) => rect(x, y, 3.5, 1.0, 'veg'));
  brief.existing.paving.filter(p => p.x != null).forEach(p => rect(p.x, p.y, p.w, p.d, 'paveOld'));
  const dom = brief.existing.buildings.find(b => b.id === 'dom');
  rect(dom.x - 1, dom.y - 1, dom.w + 2, dom.d + 2, 'paveOld');       // мощёная отмостка
  brief.paths.forEach(p => line(p.pts, p.w, p.kind === 'gravel' || p.kind === 'step' ? 'gravel' : 'path'));
  brief.paving.forEach(p => { if (p.r != null) circle(p.cx, p.cy, p.r, p.kind === 'gravel' ? 'gravel' : 'paveNew'); else rect(p.x, p.y, p.w, p.d, p.kind === 'gravel' ? 'gravel' : 'paveNew'); });
  brief.existing.buildings.forEach(b => rect(b.x, b.y, b.w, b.d, 'build'));
  brief.buildingsNew.forEach(b => rect(b.x, b.y, b.w, b.d, 'buildNew'));

  const cnt = {};
  KIND.forEach(k => cnt[k] = 0);
  for (let i = 0; i < grid.length; i++) cnt[KIND[grid[i]]] += CELL * CELL;
  Object.keys(cnt).forEach(k => cnt[k] = +cnt[k].toFixed(1));
  cnt.total = +(Wd * D).toFixed(1);
  // длины линейных элементов
  cnt.pathLen = +brief.paths.reduce((s2, p) => s2 + p.pts.slice(1).reduce((a, pt, i) => a + Math.hypot(pt[0] - p.pts[i][0], pt[1] - p.pts[i][1]), 0), 0).toFixed(1);
  cnt.hedgeLen = +brief.planting.hedges.reduce((s2, h) => s2 + Math.hypot(h.line[1][0] - h.line[0][0], h.line[1][1] - h.line[0][1]), 0).toFixed(1);
  return cnt;
}

// ---------- посадочный материал ----------
function plantList(brief) {
  const acc = new Map();
  const put = (name, qty, where) => {
    const c = PL.lookup(name);
    const key = c ? c.ru : name;
    const cur = acc.get(key) || { ru: key, lat: c ? c.lat : '—', form: c ? c.form : 'растение', size: c ? c.size : '—', price: c ? c.price : 0, qty: 0, where: new Set(), note: c ? (c.note || '') : '', h: c ? c.h : null, light: c ? c.light : null };
    cur.qty += qty;
    cur.where.add(where);
    acc.set(key, cur);
  };
  brief.planting.trees.forEach(t => put(t.name.replace(/\s*\(.*?\)/g, ''), 1, t.existing ? 'существующее' : 'дендроплан'));
  brief.planting.hedges.forEach(h => {
    const len = Math.hypot(h.line[1][0] - h.line[0][0], h.line[1][1] - h.line[0][1]);
    const n = Math.round(len / h.step) + 1;
    h.plant.split('+').forEach((p, i, arr) => put(p.trim(), Math.round(n / arr.length), h.name));
  });
  brief.planting.beds.forEach(b => PL.parseMix(b.mix).forEach(p => put(p.name, p.qty, b.name)));
  // лианы на перголу и ширму хозблока
  put('Девичий виноград', 5, 'пергола и ширма хозблока');
  const rows = [...acc.values()].map(r => ({ ...r, where: [...r.where].join(', '), sum: r.price * r.qty }));
  const order = { 'дерево': 0, 'хвойное': 1, 'плодовое': 2, 'кустарник': 3, 'ягодное': 4, 'полукустарник': 5, 'лиана': 6, 'злак': 7, 'многолетник': 8, 'почвопокровное': 9 };
  rows.sort((a, b) => (order[a.form] ?? 9) - (order[b.form] ?? 9) || a.ru.localeCompare(b.ru, 'ru'));
  return rows;
}

// ---------- материалы и работы ----------
// [раздел, наименование, ед., кол-во, цена материала, цена работы]
// Количества берутся из фактической геометрии участка (areas) и ведомости растений —
// чтобы смета не разъезжалась с чертежами при любой правке брифа.
function estimateRows(brief) {
  const A = areas(brief);
  const pl = plantList(brief);
  const qtyOf = forms => pl.filter(r => forms.includes(r.form) && r.price > 0).reduce((s, r) => s + r.qty, 0);
  const trees = qtyOf(['дерево', 'хвойное', 'плодовое']);
  const shrubs = qtyOf(['кустарник', 'полукустарник', 'ягодное', 'лиана']);
  const perens = qtyOf(['многолетник', 'злак', 'почвопокровное']);
  const r1 = v => Math.round(v * 10) / 10;
  const stripped = r1(A.bed + A.veg + A.paveNew + A.path + A.gravel + A.buildNew);   // снимаем дернину
  const planned = r1(A.total - A.build - A.paveOld);                                 // планировка грунта
  const hardNew = r1(A.paveNew + A.path);                                            // мощение в плитке
  const gravelNew = A.gravel;
  const lawnSeed = 90, lawnFix = r1(A.lawn - lawnSeed);
  const edgeLen = r1(A.pathLen * 2 + 46);                                            // борт по дорожкам и площадкам
  const dripLen = r1(A.bed * 3 + A.veg * 4 + A.hedgeLen * 1.2);
  return [
    ['Подготовка', 'Вывоз строительного мусора и металлолома контейнером 8 м³', 'шт', 1, 0, 9500],
    ['Подготовка', 'Демонтаж деревянного каркаса у торца дома', 'шт', 1, 0, 3500],
    ['Подготовка', 'Удаление сорных куртин с выборкой корневищ', 'м²', 28, 0, 350],
    ['Подготовка', 'Снятие дернины под покрытия, постройки и цветники', 'м²', stripped, 0, 250],
    ['Подготовка', 'Вынос разбивочной сетки в натуру, закрепление колышками', 'компл', 1, 2500, 9000],

    ['Земляные работы', 'Планировка грунта с приданием проектных уклонов', 'м²', planned, 0, 180],
    ['Земляные работы', 'Грунт плодородный (завоз, распределение)', 'м³', r1(A.bed * 0.25 + A.lawn * 0.05 + A.veg * 0.3), 1800, 650],
    ['Земляные работы', 'Песок для подсыпки и песковки газона', 'м³', r1(A.lawn * 0.03), 1100, 550],

    ['Дренаж и ливнёвка', 'Траншея под дренаж и ливнёвку глубиной до 0,8 м', 'п.м', 104, 0, 900],
    ['Дренаж и ливнёвка', 'Труба ПВХ Ø 110 наружная (ливневая)', 'п.м', 46, 320, 380],
    ['Дренаж и ливнёвка', 'Дрена гофрированная Ø 110 в фильтре', 'п.м', 58, 210, 380],
    ['Дренаж и ливнёвка', 'Щебень фракции 20–40 для обсыпки', 'м³', 9, 2300, 900],
    ['Дренаж и ливнёвка', 'Геотекстиль 150 г/м²', 'м²', 92, 65, 45],
    ['Дренаж и ливнёвка', 'Дождеприёмник 300×300 с корзиной', 'шт', 4, 1400, 1800],
    ['Дренаж и ливнёвка', 'Колодец дренажный смотровой Ø 630 с лючком', 'шт', 1, 12000, 6500],
    ['Дренаж и ливнёвка', 'Тоннель дренажный 300 л с обсыпкой', 'шт', 2, 9500, 7000],
    ['Дренаж и ливнёвка', 'Отвод воды с кровли гаража: жёлоб, труба, дождеприёмник', 'компл', 1, 8500, 6500],

    ['Мощение', 'Основание под мощение: ЩПС 150 мм с уплотнением', 'м²', r1(hardNew + gravelNew), 850, 900],
    ['Мощение', 'Брусчатка вибропрессованная 200×100×60', 'м²', hardNew, 900, 1100],
    ['Мощение', 'Отсыпка гранитная фракции 5–20 слоем 80 мм', 'м²', gravelNew, 780, 420],
    ['Мощение', 'Борт садовый бетонный 1000×200×80 на бетонной подушке', 'п.м', edgeLen, 320, 550],
    ['Мощение', 'Террасная доска ДПК по лагам (терраса бани)', 'м²', 13.2, 2400, 1600],
    ['Мощение', 'Ремонт просадок существующего мощения с переборкой', 'м²', 24, 350, 800],

    ['Освещение', 'Щит уличный на 4 группы с УЗО 30 мА', 'шт', 1, 18000, 9000],
    ['Освещение', 'Кабель ВВГнг-LS 3×1,5 в гофре, в траншее', 'п.м', 165, 135, 450],
    ['Освещение', 'Светильник-боллард h 0,6 м', 'шт', 14, 6500, 1800],
    ['Освещение', 'Светильник грунтовый (подсветка растений и ступеней)', 'шт', 12, 4200, 1500],
    ['Освещение', 'Прожектор 20 Вт с датчиком движения', 'шт', 3, 3800, 1600],
    ['Освещение', 'Гирлянда ретро над патио, 18 м', 'компл', 1, 6000, 3500],

    ['Автополив', 'Контроллер 6-зонный с датчиком дождя', 'компл', 1, 26500, 12000],
    ['Автополив', 'Клапанный бокс с электромагнитными клапанами', 'шт', 6, 3500, 2200],
    ['Автополив', 'Труба ПНД Ø 32 магистральная (в траншее)', 'п.м', 118, 120, 420],
    ['Автополив', 'Дождеватель роторный с соплом', 'шт', 9, 3200, 2500],
    ['Автополив', 'Дождеватель веерный', 'шт', 6, 1600, 1900],
    ['Автополив', 'Линия капельного полива с компенсацией давления', 'п.м', dripLen, 60, 250],

    ['Озеленение', 'Посадка дерева с комом (яма, дренаж, смесь, крепёж)', 'шт', trees, 1500, 3500],
    ['Озеленение', 'Посадка кустарника', 'шт', shrubs, 400, 700],
    ['Озеленение', 'Посадка многолетника и злака', 'шт', perens, 150, 250],
    ['Озеленение', 'Устройство цветника: подготовка почвы, кромка, мульча', 'м²', A.bed, 700, 900],
    ['Озеленение', 'Мульча — кора сосновая фракции 20–40', 'м³', r1(A.bed * 0.06), 3500, 800],
    ['Озеленение', 'Кромка садовая пластиковая для цветников', 'п.м', r1(A.bed * 1.3), 180, 220],
    ['Озеленение', 'Санитарная обрезка и формовка существующих деревьев', 'шт', 8, 0, 2200],

    ['Газон', 'Газон посевной на нарушенных участках: подготовка, посев, прикатка', 'м²', lawnSeed, 90, 460],
    ['Газон', 'Ремонт существующего газона: скарификация, подсев, песковка', 'м²', lawnFix, 60, 260],

    ['Огород', 'Гряда-короб 3,4 × 0,9 м, борт ДПК h 0,3 м', 'шт', 2, 9200, 2500],
    ['Огород', 'Грунт для гряд (торф, компост, песок)', 'м³', 3, 2200, 600],
    ['Огород', 'Компостер двухсекционный', 'шт', 1, 14000, 2500],

    ['МАФ', 'Кострище стальное Ø 0,8 м', 'шт', 1, 12000, 1500],
    ['МАФ', 'Скамья садовая', 'шт', 2, 14000, 1200],
    ['МАФ', 'Шпалера-ширма 4,6 × 1,8 м для хозяйственного двора', 'компл', 1, 21000, 7000],
    ['МАФ', 'Сушилка для белья (перенос существующей)', 'шт', 1, 0, 1500]
  ];
}

// крупные постройки — отдельным договором, ориентировочно
function buildingsRows() {
  return [
    ['Гараж на 2 автомобиля 10,0 × 6,0 м: фундаментная плита, стены, кровля', 'компл', 1, 1180000],
    ['Ворота секционные 3,0 × 2,4 м с автоматикой', 'шт', 2, 145000],
    ['Баня 6,0 × 4,0 м (24 м²), каркас, отделка в цвет дома', 'компл', 1, 850000],
    ['Терраса бани 6,0 × 2,3 м с ограждением', 'компл', 1, 148000],
    ['Купель Ø 2,0 м с подогревом', 'шт', 1, 120000],
    ['Хозпостройка с дровником 5,0 × 3,0 м', 'компл', 1, 220000],
    ['Пергола-патио 3,2 × 2,6 м, металл + поликарбонат', 'компл', 1, 78000],
    ['Мангальный комплекс с рабочим столом', 'компл', 1, 68000]
  ];
}

function estimate(brief) {
  const rows = estimateRows(brief).map(r => {
    const [sec, name, unit, qty, mat, work] = r;
    return { sec, name, unit, qty, mat, work, sum: qty * (mat + work) };
  });
  const bySec = new Map();
  rows.forEach(r => { bySec.set(r.sec, (bySec.get(r.sec) || 0) + r.sum); });
  const total = rows.reduce((s, r) => s + r.sum, 0);
  const matTotal = rows.reduce((s, r) => s + r.qty * r.mat, 0);
  const workTotal = rows.reduce((s, r) => s + r.qty * r.work, 0);
  return { rows, bySec, total, matTotal, workTotal };
}

function plantsTotal(brief) {
  const list = plantList(brief);
  return { list, total: list.reduce((s, r) => s + r.sum, 0), qty: list.reduce((s, r) => s + r.qty, 0) };
}

module.exports = { areas, plantList, plantsTotal, estimate, estimateRows, buildingsRows, money };
