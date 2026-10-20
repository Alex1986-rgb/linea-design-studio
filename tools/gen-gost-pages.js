#!/usr/bin/env node
'use strict';
/**
 * Раздел «Документация» — альбомы, выпущенные движком GOST-DRAFT.
 *
 *   node tools/gen-gost-pages.js
 *
 * Движок живёт отдельным репозиторием (~/projects/gost-draft) и на сайт попадает только
 * результатом — листами выпуска. Сюда их кладёт tools/sync-gost-releases.sh:
 * листы в site/portfolio/<slug>/sheets, а служебная листалка выпуска — в _release.html.
 * Из неё генератор и читает состав: перечень листов, владельцев разделов и числа проверки.
 * Руками цифры не пишем — альбом перевыпускается, страницы пересобираются, сайт не врёт.
 */

const fs = require('fs');
const path = require('path');
const SHELL = require('./site-shell.js');
const OPEN = require('./gost-open-issues.js');
const EXPLAINER = require('./gost-explainer.js');

const SITE = path.join(__dirname, '..', 'site');
const { BASE, esc, crumbsLd } = SHELL;
const out = [];
const w = (rel, html) => {
  const p = path.join(SITE, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, html);
  out.push(rel);
};

// ---------- альбомы, которые показываем ----------
const ALBUMS = [
  {
    slug: 'gost-proekt2',
    name: 'Квартира с эркерами, 13 помещений',
    short: 'квартира с эркерами',
    lead: 'Четырёхкомнатная с непрямоугольным контуром и двумя эркерными балконами: зал, кухня, две детские, '
      + 'две гардеробные, кладовая, ванная, санузел, прихожая и коридор.',
    code: 'ГД-2026-004-АИ',
    highlights: [
      ['Обмер снят со скана заказчика', 'Координаты пересчитаны с внутренних граней на оси стен. Движок сразу поймал '
        + 'два проёма, которые заходили в примыкающую стену: дверную коробку туда не поставить.'],
      ['Щит разошёлся на два листа сам', 'Восемнадцать групп не помещались в формат, подписи назначения сжимались до '
        + 'нечитаемых. Однолинейка считает по данным, сколько листов нужно, и на продолжении показывает шину с обрывом.'],
      ['Сорок пять изделий встроенной мебели', 'Монтажные схемы разошлись на три листа в масштабе 1:40 — масштаб выбран '
        + 'из ряда ГОСТ 2.302, а не подогнан на глаз.'],
    ],
  },
  {
    slug: 'gost-kv3k',
    name: 'Трёхкомнатная квартира',
    short: 'трёхкомнатная квартира',
    lead: 'Первый объект нового движка: две спальни, кухня-гостиная, ванная, санузел, гардеробная, прихожая и коридор. '
      + 'Г-образный контур, помещения собраны из нескольких частей.',
    code: 'ГД-2026-003-АИ',
    highlights: [
      ['Развёртки строятся от чистовых граней', 'Вид начинается от чистового угла, длина — между чистовыми гранями '
        + 'отделки: та же формула, что на листах ВК и в раскладке плитки.'],
      ['Каждая марка отделки с выноской', 'Марки стоят в кружках на плане и на развёртках, ведомость собрана по форме 1 '
        + 'приложения А ГОСТ 21.501-2018.'],
      ['Раскладка плитки от точки старта', 'Подрезки не меньше трети плитки, швы пола продолжаются на стены, '
        + 'положение розеток сверено с сеткой швов.'],
    ],
  },
];

// Альбомы без разбора «честной части» (explain: false): реестр выпущен иначе или не выпущен вовсе, а сравнительный разбор
// gost-explainer.js сверяет формулировки двух первых альбомов дословно. Площадь и помещения — с титула (OPEN.facts).
ALBUMS.push(
  {
    slug: 'gost-kv65',
    explain: false,
    name: 'Квартира 65 м² после реконструкции',
    short: 'квартира 65 м²',
    lead: 'Собрана по плану заказчика: две спальни, кухня-гостиная, прихожая, коридор, ванная, санузел, гардеробная '
      + 'и кладовая. К альбому — выпуск для заказчика по образцу студийных проектов: визуализации стоят листами перед '
      + 'развёртками своих помещений.',
    code: 'ГД-2026-007-АИ',
    highlights: [
      ['План заказчика — в данные', 'Планировка снята с картинки заказчика коротким файлом раскладки, начинка помещений '
        + 'перенесена с образцов готовых проектов и подогнана под новые размеры.'],
      ['Визуализация этой стены — на листе развёртки', 'Движок по положению камеры понимает, какую стену показывает кадр, '
        + 'и ставит его рядом с чертежом этой стены. Узлы стены 1:10 — там же, со ссылкой на лист узлов.'],
      ['Спальня без окна — блокер, а не допущение', 'Проверка держит выпуск, пока автор не решит: перенести спальню, '
        + 'добавить окно или сделать помещение нежилым. Альбом показан как рабочий пример до решения.'],
    ],
  },
  {
    slug: 'gost-kv58',
    explain: false,
    name: 'Квартира 58 м² · кухня-гостиная и спальня',
    short: 'квартира 58 м²',
    lead: 'Второй объект, собранный по шаблону: планировка описана коротким файлом, начинка помещений — с образцов '
      + 'готовых проектов. Выпуск без блокеров.',
    code: 'ГД-2026-006-АИ',
    highlights: [
      ['Проект по шаблону за один проход', 'Габарит, помещения по сетке, проёмы и стояки заданы раскладкой; мебель, '
        + 'сантехника, электроточки и отделка перенесены из помещений-образцов с подгонкой под размеры.'],
      ['Реальные изделия в ведомостях', 'Вместо «аналога по характеристикам» — изделия из каталога с производителем, '
        + 'коллекцией и артикулом: доска, плитка, плинтус, сантехника.'],
      ['Выпуск для заказчика', 'Студийный выпуск: план мебели с выносками «наименование Ш×Г h В», развёртки 1:20, '
        + 'образцы цвета в спецификации отделки.'],
    ],
  },
  {
    slug: 'gost-modern4k',
    explain: false,
    name: 'Квартира с кабинетом · современный модерн',
    short: 'квартира с кабинетом',
    lead: 'Новый проект по плану заказчика: перепланировка (предложение до обмера), мебель расставлена заново, стиль — '
      + 'модерн 2026: шалфей, бархат павлиньего цвета, горчица, травертин, морёный дуб и латунь.',
    code: 'ГД-2026-008-АИ',
    highlights: [
      ['Вид сверху 3D — на титуле', 'Вся квартира одним кадром: помещения, мебель, текстиль и декор по данным проекта.'],
      ['Визуализация каждой стены', '23 кадра, каждый сверен с макетом; кадр стоит на листе развёртки своей стены.'],
      ['Перепланировка — предложение', 'Несущие стены не определены: решение и обмер отмечены в реестре открытых вопросов, '
        + 'альбом помечен «предварительно» до их закрытия.'],
    ],
  },
  {
    slug: 'gost-retro103',
    explain: false,
    name: 'Квартира 103 м² · ретро с авторской мебелью',
    short: 'квартира 103 м² в ретро-стиле',
    lead: 'Две соседние квартиры по обмеру объединены в одну: гостиная-столовая с балконом, кабинет-библиотека, мастер-спальня '
      + 'с ванной. Стиль — середина века и ар-деко: орех и тик, латунь, изумрудный бархат, горчичное букле, терраццо.',
    code: 'ГД-2026-009-АИ',
    highlights: [
      ['Авторская мебель середины века', 'Кресло-лаунж с оттоманкой, мраморный стол-тюльпан, журнальный стол Noguchi, '
        + 'кресло-яйцо, буфет на конических ножках — как предложение, модели уточняются с заказчиком.'],
      ['Объединение квартир — предложение', 'Проём в межквартирной стене и один вход из тамбура; несущие колонны и ригель '
        + 'не трогаем, техзаключение — в реестре открытых вопросов.'],
      ['26 визуализаций и вид сверху 3D', 'Каждый кадр сверен с макетом и стоит на листе развёртки своей стены.'],
    ],
  },
  {
    slug: 'gost-lineademo',
    explain: false,
    name: 'Квартира 56 м² · джапанди (демо LINEA в новом формате)',
    short: 'квартира 56 м² в стиле джапанди',
    lead: 'Демо-квартира студии, пересобранная движком рабочей документации: кухня-гостиная, спальня, детская, санузел, '
      + 'прихожая. Джапанди — тёплый белый, дуб, серо-зелёный, без глянца; у каждой комнаты свой акцент.',
    code: 'ГД-2026-011-АИ',
    highlights: [
      ['Тот же бриф — новый уровень', 'Старый демо-альбом был 30 листов; в новом формате — полный комплект с проверкой по нормам.'],
      ['Своя мебель и сюжеты картин', 'Линейная кухня с навесными шкафами, кровать-подиум, растущий стол в детской; '
        + 'картины — суми-э, акварель сакуры, гуашь «кот на подоконнике».'],
      ['Честные допущения', 'Планировка, вентканалы и мощность взяты из брифа как допущения — в реестре открытых вопросов.'],
    ],
  },
  {
    slug: 'gost-dom120',
    explain: false,
    house: true, // срок для дома — до 72 часов от брифа с планом
    name: 'Дом 120 м² в два этажа · средиземноморье (демо LINEA в новом формате)',
    short: 'дом 120 м² в два этажа',
    lead: 'Демо-дом студии в новом формате: планы по этажам, лестница с ограждением и отдельным листом, '
      + 'средиземноморско-скандинавская гамма — эгейский синий, охра, олива, песок.',
    code: 'ГД-2026-012-АИ',
    highlights: [
      ['Два этажа и лестница', 'Каждый план — отдельно по этажу; лист «Лестница Л-1»: план, разрез, узел стойки, спецификация.'],
      ['Свой акцент у комнат', 'Пять картин с разными сюжетами, Г-образная кухня с навесными шкафами и пеналом.'],
      ['Что ждёт решения', 'Котёл, проект АР/КР и обмер — в реестре открытых вопросов, альбом помечен «предварительно».'],
    ],
  },
  {
    slug: 'gost-dom331',
    explain: false,
    house: true,
    name: 'Дом 331 м² с мансардой и гаражом',
    short: 'двухэтажный дом с мансардой',
    lead: 'Частный дом: 1-й этаж — гостиная с камином, кухня-столовая, кабинет, веранда, гараж и котельная; мансарда — '
      + 'четыре спальни, гардеробная, санузлы и спортзона в холле. Современное шале с эко-теплом: дуб и лиственница, '
      + 'натуральный камень у камина, у каждой комнаты свой цветовой акцент.',
    code: 'ГД-2026-010-АИ',
    highlights: [
      ['Планы по этажам', 'Каждый план выпущен отдельно для 1-го этажа и мансарды; этаж — в заголовке и штампе.'],
      ['Потолки мансарды по скату кровли', 'Развёртки со скатом и отметкой его низа, площади стен и потолков по скату, '
        + 'высокая мебель под скатом проверяется отдельно.'],
      ['Спортзона, гараж и веранда', 'Беговая дорожка и велотренажёр у конька, силовая стойка и верстак в гараже, '
        + 'летняя гостиная на веранде; виды сверху 3D обоих этажей.'],
    ],
  },
);

// карточка проекта: тип и стиль (стиль — из project.json движка: meta.style) и честное пояснение,
// если площадь в названии не совпадает с экспликацией альбома. {AREA} — общая площадь с титула выпуска.
const CARD = {
  'gost-dom120': { type: 'Дом, 2 этажа', style: 'Средиземноморье и скандинавский',
    declared: '120 м² в названии — площадь из брифа демо-дома; общая площадь по экспликации альбома — {AREA}.' },
  'gost-lineademo': { type: 'Квартира', style: 'Джапанди' },
  'gost-dom331': { type: 'Дом с мансардой', style: 'Шале и эко',
    declared: '331 м² в названии — площадь, заявленная заказчиком на его картинке плана. Размеры на ней не читаются, '
      + 'их подобрал проектировщик, и общая площадь по экспликации альбома вышла {AREA}. Цифра уточнится после контрольного обмера.' },
  'gost-retro103': { type: 'Квартира', style: 'Середина века и ар-деко',
    declared: '103 м² в названии — общая площадь по обмерному плану (102,98 м², две квартиры с тамбуром); '
      + 'по экспликации альбома — {AREA}.' },
  'gost-modern4k': { type: 'Квартира', style: 'Модерн и современный' },
  'gost-kv65': { type: 'Квартира', style: 'Скандинавский' },
  'gost-kv58': { type: 'Квартира', style: 'Скандинавский',
    declared: '58 м² в названии — площадь из исходных данных заказчика (57,6 м²); по экспликации альбома — {AREA}.' },
  'gost-proekt2': { type: 'Квартира', style: 'Современный' },
  'gost-kv3k': { type: 'Квартира', style: 'Современный, тёплая гамма' },
};
// новые проекты — первыми (по номеру шифра, свежие сверху)
const NEWEST = a => -(+(a.code.match(/-(\d{3})-/) || [])[1] || 0);

// человеческие названия разделов по владельцу листа
const SECTION_OF = {
  draftsman: 'Общие данные, развёртки и узлы',
  architect: 'Архитектурные решения',
  'interior-designer': 'Планировочное решение',
  'electrical-engineer': 'Электрооборудование',
  'lowcurrent-engineer': 'Слаботочные системы',
  'lighting-designer': 'Освещение',
  'hvac-engineer': 'Отопление и вентиляция',
  'plumbing-engineer': 'Водоснабжение и канализация',
  'drywall-installer': 'Потолки и ГКЛ-конструкции',
  tiler: 'Раскладка плитки',
  finisher: 'Полы и отделка',
  colorist: 'Цвет и материалы',
  decorator: 'Декор и текстиль',
  'furniture-maker': 'Встроенная мебель',
  estimator: 'Смета',
  'quality-inspector': 'Приёмка работ',
  foreman: 'Вопросы, задание на обмер и график работ',
};

const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya', ь: '', ъ: '', ё: 'e' };
// склонение: «71 лист», «105 листов», «22 листа» — иначе плитки читаются коряво
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return `${n} ${a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many}`;
};

// то же без числа: «<b>41</b> открытый вопрос» — число стоит в плитке отдельно
const word = (n, one, few, many) => plural(n, one, few, many).replace(/^\d+ /, '');

const slugify = s => String(s).toLowerCase().replace(/[а-яё]/g, c => TR[c] ?? c)
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- читаем выпуск ----------
const readRelease = slug => OPEN.readRelease(SITE, slug);

// Разделы — в том порядке, в каком листы идут в выданном альбоме: соседние листы одного владельца — один раздел.
// Титульный лист (его выпускает декоратор) и «Общие данные» — первым разделом; поздние листы чертёжника
// (реестры, развёртки, узлы) — своим разделом, а не вместе с общими данными.
function bySection(sheets) {
  const runs = [];
  sheets.forEach((s, i) => {
    let sec = SECTION_OF[s.owner] || 'Прочие листы';
    if ((i === 0 && /cover/.test(s.file)) || (s.owner === 'draftsman' && /^Общие данные/.test(s.title))) sec = 'Общие данные';
    else if (s.owner === 'draftsman') sec = 'Развёртки стен, узлы и реестры';
    const last = runs[runs.length - 1];
    if (last && last.sec === sec) last.items.push(s); else runs.push({ sec, items: [s] });
  });
  const seen = {};
  for (const g of runs) { const id = slugify(g.sec); seen[id] = (seen[id] || 0) + 1; g.id = seen[id] > 1 ? `${id}-${seen[id]}` : id; }
  return runs;
}

// ---------- визуализации проекта ----------
// Берутся из движка: ~/projects/gost-draft/projects/<объект>/renders, связка объект → слаг — в sync-gost-releases.sh.
// В ленту идут только кадры, принятые при сверке с макетом (views.json → checked.verdict «принят»). Заглавный кадр —
// вид сверху 3D, если он принят (допускается «принят с отклонениями» — отклонения в мебели, не в планировке).
// У выпусков, где сверки не было, заглавным идёт вид сверху 3D с титульного листа альбома, а если его нет — сам титул;
// ленты у них нет. Копии ужимаются до 1600 px (лента — 1200 px) и лежат в site/assets/portfolio; если движка рядом нет,
// берётся то, что уже лежит на сайте (_renders.json).
const GD = process.env.GOST_DRAFT || path.join(require('os').homedir(), 'projects', 'gost-draft');
const OBJ = (() => {
  try {
    const sh = fs.readFileSync(path.join(__dirname, 'sync-gost-releases.sh'), 'utf8');
    return Object.fromEntries([...sh.matchAll(/^sync_one\s+(\S+)\s+(\S+)/gm)].map(m => [m[2], m[1]]));
  } catch { return {}; }
})();
const ROOM_RU = { living: 'гостиная', kitchen: 'кухня-столовая', bedroom: 'спальня', kids: 'детская', study: 'кабинет',
  bath: 'ванная', wc: 'санузел', hall: 'прихожая', corridor: 'холл', wardrobe: 'гардеробная', storage: 'кладовая',
  balcony: 'балкон', '3d-top': 'вид сверху 3D' };
const ROOM_ORDER = ['living', 'kitchen', 'bedroom', 'kids', 'study', 'bath', 'hall', 'wardrobe', 'balcony', 'corridor', 'wc', 'storage'];
const roomKey = n => (n.match(/^room-([a-z]+)/) || [])[1] || (/^3d-top/.test(n) ? '3d-top' : '');
const frameAlt = (a, n) => {
  if (/^3d-top/.test(n)) return `${a.name} — вид сверху 3D${/et2/.test(n) ? ', второй этаж' : /et1/.test(n) ? ', первый этаж' : ''}`;
  const k = roomKey(n);
  return `${a.name} — ${ROOM_RU[k] || 'интерьер'}, визуализация`;
};
function sips(src, dst, px) {
  if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  require('child_process').execFileSync('sips', ['-Z', String(px), '-s', 'format', 'jpeg', '-s', 'formatOptions', '68', src, '--out', dst], { stdio: 'ignore' });
}
function dims(f) {
  try {
    const o = require('child_process').execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', f], { encoding: 'utf8' });
    return { w: +(o.match(/pixelWidth: (\d+)/) || [])[1] || 1600, h: +(o.match(/pixelHeight: (\d+)/) || [])[1] || 1067 };
  } catch { return { w: 1600, h: 1067 }; }
}
function renders(a, r) {
  const man = path.join(SITE, 'portfolio', a.slug, '_renders.json');
  const dir = OBJ[a.slug] && path.join(GD, 'projects', OBJ[a.slug], 'renders');
  // без визуализации заглавным идёт лист расстановки мебели — по нему сразу видно планировку (титул без кадра пустоват)
  const plan = r.sheets.find(x => /^План расстановки мебели/.test(x.title)) || r.sheets[0];
  const coverHero = { src: `portfolio/${a.slug}/sheets/${plan.file}`, alt: `${a.name} — ${plan.title.replace(/^./, c => c.toLowerCase())}`, w: 1587, h: 1123, kind: 'sheet' };
  if (!dir || !fs.existsSync(dir)) {
    try { return JSON.parse(fs.readFileSync(man, 'utf8')); } catch { return { hero: coverHero, ribbon: [], accepted: 0, checked: false }; }
  }
  let views = [];
  try { views = JSON.parse(fs.readFileSync(path.join(dir, 'views.json'), 'utf8')); } catch { /* сверки нет */ }
  const has = n => fs.existsSync(path.join(dir, `${n}.jpg`));
  const ok = v => v.checked && /^принят/.test(v.checked.verdict || '') && has(v.name);
  const strict = v => ok(v) && v.checked.verdict === 'принят';
  const checked = views.some(v => v.checked);
  let heroName = (views.find(v => /^3d-top(-et1)?$/.test(v.name) && ok(v)) || {}).name;
  if (!heroName && checked) heroName = (views.find(v => /^room-(living|kitchen)/.test(v.name) && strict(v)) || views.find(strict) || {}).name;
  if (!heroName && !checked && has('3d-top')) heroName = '3d-top';      // кадр с титульного листа альбома
  // лента: по одному кадру на помещение в порядке значимости, затем вторые кадры — до 8
  const pool = views.filter(v => strict(v) && v.name !== heroName && /^(room-|3d-top)/.test(v.name));
  const rank = v => { const k = roomKey(v.name); const i = ROOM_ORDER.indexOf(k); return k === '3d-top' ? -1 : i < 0 ? 99 : i; };
  pool.sort((x, y) => rank(x) - rank(y));
  const pick = [], used = new Set();
  for (const v of pool) { const k = roomKey(v.name) + (v.name.match(/^room-[a-z]+(\d*)/) || [])[1]; if (!used.has(k)) { used.add(k); pick.push(v); } }
  for (const v of pool) if (pick.length < 8 && !pick.includes(v)) pick.push(v);
  const ribbonViews = pick.slice(0, 8);
  // копии на сайт; лишние файлы прошлых прогонов убираем
  const out = { checked, accepted: views.filter(ok).length, ribbon: [] };
  if (heroName) {
    const dst = path.join(SITE, 'assets', 'portfolio', `${a.slug}-hero.jpg`);
    sips(path.join(dir, `${heroName}.jpg`), dst, 1600);
    out.hero = { src: `assets/portfolio/${a.slug}-hero.jpg`, alt: frameAlt(a, heroName), ...dims(dst),
      kind: checked ? 'render' : 'cover-render', name: heroName };
  } else out.hero = coverHero;
  const rdir = path.join(SITE, 'assets', 'portfolio', a.slug);
  const keep = new Set();
  for (const v of ribbonViews) {
    const dst = path.join(rdir, `${v.name}.jpg`);
    sips(path.join(dir, `${v.name}.jpg`), dst, 1200);
    keep.add(`${v.name}.jpg`);
    out.ribbon.push({ src: `assets/portfolio/${a.slug}/${v.name}.jpg`, alt: frameAlt(a, v.name), ...dims(dst) });
  }
  if (fs.existsSync(rdir)) for (const f of fs.readdirSync(rdir)) if (!keep.has(f)) fs.unlinkSync(path.join(rdir, f));
  return out;
}

// стили страниц раздела: заглавный кадр, лента визуализаций, шаги правок. Общий main.css не трогаем — правят другие
const CSS = `<style>
.g-hero{margin:0}.g-hero img{display:block;width:100%;height:auto;max-height:640px;object-fit:cover;border:1px solid var(--line);border-radius:4px;background:#14130f}
.g-hero.sheet img{object-fit:contain;background:#f4f1ea}
.g-hero figcaption{color:var(--dim);font-size:13px;margin-top:10px;line-height:1.5}
.g-ribbon{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(240px,31%);gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:10px;-webkit-overflow-scrolling:touch}
.g-ribbon a{scroll-snap-align:start;display:block}
.g-ribbon img{display:block;width:100%;aspect-ratio:3/2;height:auto;object-fit:cover;border:1px solid var(--line);border-radius:3px}
.g-ribbon span{display:block;color:var(--dim);font-size:12.5px;margin-top:6px}
.g-note{color:var(--mut);font-size:14px;line-height:1.6;max-width:760px;margin:18px 0 0}
.g-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:18px;margin:0 0 26px;padding:0;list-style:none;counter-reset:st}
.g-steps li{border:1px solid var(--line);border-radius:4px;padding:18px 20px;background:var(--panel);counter-increment:st}
.g-steps li::before{content:counter(st,decimal-leading-zero);display:block;color:var(--gold);font-family:var(--serif);font-size:20px;margin-bottom:6px}
.g-steps b{display:block;margin-bottom:6px}.g-steps p{margin:0;color:var(--mut);font-size:14px;line-height:1.55}
.tile .g-type{display:block;color:var(--dim);font-size:12.5px;margin:-4px 0 10px}
.tile img.sheet{object-fit:contain;background:#f4f1ea}
@media (max-width:760px){.g-ribbon{grid-auto-columns:78%}.stats{gap:22px 30px}.cta-row .btn{white-space:normal;text-align:center}}
</style>`;

function page({ file, title, desc, h1, crumb, lead, body, u, jsonld, object, ogImage, ogDesc }) {
  const ld = (jsonld || []).map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');
  let head = SHELL.head(u, { title, desc, canonical: `${BASE}/${file.replace(/index\.html$/, '')}`, ogTitle: h1, ogDesc: ogDesc || lead });
  if (ogImage) head = head.replace(`${BASE}/assets/hero.jpg`, `${BASE}/${ogImage}`);   // превью ссылки — кадр самого проекта
  return `<!DOCTYPE html>
<html lang="ru">
<head>
${head}
${CSS}
${ld}
</head>
<body>
${SHELL.beta(u)}
${SHELL.header(u, 'gost')}
${SHELL.crumbsBar(u, crumb)}
<main>
  <section class="blk">
    <div class="wrap">
      <h1>${esc(h1)}</h1>
      <p class="sub">${lead}</p>
    </div>
  </section>
${body}
${SHELL.ctaBlock(u, 'gost', { object })}
</main>
${SHELL.footer(u, 'gost')}
${SHELL.sticky(u)}
</body>
</html>
`;
}

// ---------- страница одного альбома ----------
function albumPage(a, r, honesty) {
  const groups = bySection(r.sheets);
  const R = a.renders;
  // список листов для страницы правок голосом (review.html): клиент открывает лист, ставит метку и надиктовывает правку
  w(`portfolio/${a.slug}/sheets.json`, JSON.stringify(r.sheets.map(sh => ({ file: sh.file, title: sh.title, no: (sh.file.match(/^(\d+)/) || [])[1] ? +sh.file.match(/^(\d+)/)[1] : null }))));
  const rv = f => `../../review.html?p=${a.slug}&amp;s=${encodeURIComponent(f)}`;
  const rvAll = `../../review.html?p=${a.slug}`;

  const blocks = groups.map(g => `  <section class="blk" id="${g.id}">
    <div class="wrap">
      <div class="kicker">Раздел</div>
      <h2>${esc(g.sec)}</h2>
      <p class="sub">${plural(g.items.length, 'лист', 'листа', 'листов')}. Нажмите на лист — он откроется целиком, и к нему можно надиктовать правку.</p>
      <div class="plates">
      ${g.items.map(sh => `<a class="plate" href="${rv(sh.file)}" title="Открыть лист и оставить правку голосом">
        <span class="plate-img"><img loading="lazy" decoding="async" src="sheets/${encodeURIComponent(sh.file)}" alt="${esc(sh.title)}" width="1587" height="1123"></span>
        <span class="plate-cap"><i>${esc(sh.file.replace(/^(\d+).*$/, 'Лист $1'))}</i>${esc(sh.title)}</span>
      </a>`).join('\n      ')}
      </div>
    </div>
  </section>`).join('\n');

  // заглавный кадр
  const capOf = { render: 'Кадр сверен с макетом проекта: планировка и мебель — как на листах альбома.',
    'cover-render': 'Кадр с титульного листа альбома.', sheet: 'Лист альбома. Визуализации этого проекта ещё не сверены с макетом — на сайте их пока не показываем.' };
  const hero = R.hero ? `      <figure class="g-hero${R.hero.kind === 'sheet' ? ' sheet' : ''}">
        <img src="../../${R.hero.src}" alt="${esc(R.hero.alt)}" width="${R.hero.w}" height="${R.hero.h}" fetchpriority="high" decoding="async">
        <figcaption>${esc(R.hero.alt.replace(`${a.name} — `, '').replace(/^./, c => c.toUpperCase()))}. ${capOf[R.hero.kind] || ''}</figcaption>
      </figure>\n` : '';

  // два PDF: полный альбом (рабочая документация с проверкой) и альбом для заказчика с визуализациями
  const has = f => fs.existsSync(path.join(SITE, 'portfolio', a.slug, f));
  const pdf = `      <div class="cta-row" style="margin-top:26px">${has('studio.pdf') ? `<a class="btn" href="studio.pdf" download>Альбом для заказчика · PDF ${a.studioSize}</a>` : ''}
        ${has('album.pdf') ? `<a class="btn ghost" href="album.pdf" download>Полный альбом по ГОСТ · PDF ${a.pdfSize}</a>` : ''}
        <a class="btn ghost" href="${rvAll}">🎤 Оставить правку голосом</a></div>
      <p class="g-note">Альбом для заказчика — проект в подаче студии: визуализации стоят перед развёртками своих помещений,
      у мебели на плане выноски с размерами. Полный альбом — рабочая документация для строителей: все разделы, ведомости
      и смета. Файлы большие — на мобильном интернете лучше качать по Wi-Fi.</p>\n`;

  const card = CARD[a.slug] || {};
  const areaNote = card.declared ? `      <p class="g-note"><b>Про площадь.</b> ${esc(card.declared.replace('{AREA}', a.area))}</p>\n` : '';

  const ribbon = R.ribbon.length ? `  <section class="blk">
    <div class="wrap">
      <div class="kicker">Визуализации</div>
      <h2>Как это будет выглядеть</h2>
      <p class="sub">${plural(R.ribbon.length, 'кадр', 'кадра', 'кадров')} из ${R.accepted}, принятых при сверке с макетом проекта: мебель,
      окна и двери стоят там же, где на чертежах. Остальные — в альбоме для заказчика, перед развёртками своих стен.</p>
      <div class="g-ribbon">
      ${R.ribbon.map(f => `<a href="../../${f.src}" target="_blank" rel="noopener"><img src="../../${f.src}" alt="${esc(f.alt)}" width="${f.w}" height="${f.h}" loading="lazy" decoding="async"><span>${esc(f.alt.replace(`${a.name} — `, '').replace(', визуализация', ''))}</span></a>`).join('\n      ')}
      </div>
    </div>
  </section>\n` : '';

  const voice = `  <section class="blk" id="pravki">
    <div class="wrap">
      <div class="kicker">Правки</div>
      <h2>Как оставить правку голосом</h2>
      <p class="sub">Писать письма со списком замечаний не нужно — правка ставится прямо на лист, к нужному месту чертежа.</p>
      <ol class="g-steps">
        <li><b>Откройте лист</b><p>Любой лист ниже или в PDF: в альбоме на каждой странице есть кнопка «Правка к этому листу».</p></li>
        <li><b>Нажмите на место</b><p>На чертеже появится метка — к ней и относится правка: «диван развернуть к окну», «розетку выше».</p></li>
        <li><b>Скажите голосом</b><p>Или напишите. Правок к одному листу может быть сколько угодно, есть правка ко всему листу.</p></li>
        <li><b>Отправьте одним сообщением</b><p>Все метки уходят разом — через «Поделиться» или файлом. Альбом перевыпускается с правками.</p></li>
      </ol>
      <div class="cta-row"><a class="btn" href="${rvAll}">🎤 Попробовать на этом альбоме</a>
        <a class="btn ghost" href="../../brief.html">Свой проект — бриф голосом</a></div>
      <p class="hint" style="margin-top:14px">Если голосовой ввод в браузере не работает — нажмите микрофон на клавиатуре телефона.</p>
    </div>
  </section>\n`;

  const check = `  <section class="blk">
    <div class="wrap">
      <div class="kicker">Проверка по нормам</div>
      <h2>Что значит «проверено»</h2>
      <div class="cards g3">
        <div class="card"><h3>${r.blockers ? `${plural(r.blockers, 'блокер', 'блокера', 'блокеров')} на выдаче` : 'Блокеров нет'}</h3>
          <p>Блокер — то, с чем альбом не выдаётся: проём не помещается в стену, лист вылез за формат, жилая комната без окна.
          ${r.blockers ? 'Здесь он остался открытым вопросом по исходным данным — ниже объяснено, каким.' : 'В этом альбоме таких нет.'}</p></div>
        <div class="card"><h3>Открытые вопросы — не брак</h3>
          <p>Кроме блокеров, проверка оставляет в выпуске вопросы и рекомендации: что уточнить на обмере, где можно лучше,
          какое допущение принято. Они собраны на листе «Открытые вопросы» в начале альбома — их решают вместе с заказчиком.</p></div>
        <div class="card"><h3>До обмера — предварительно</h3>
          <p>Размеры сняты с плана заказчика. Перед работами нужен контрольный обмер — в альбоме есть готовое задание на него:
          что именно померить и проверить.</p></div>
      </div>
${r.blockers ? `      <p class="g-note">Блокеров на выдаче: ${r.blockers}. Это открытый вопрос по исходным данным, а не ошибка оформления:
      проверка держит комплект невыданным, пока он не закрыт. Здесь альбом показан как рабочий пример — так выглядит выпуск
      до решения заказчика.</p>\n` : ''}    </div>
  </section>\n`;

  const body = `  <section class="blk" style="padding-top:0">
    <div class="wrap">
${hero}      <div class="stats" style="margin-top:40px">
        <div><b>${r.total}</b><span>${word(r.total, 'лист', 'листа', 'листов')} A3</span></div>
        <div><b>${a.area}</b><span>общая площадь по экспликации</span></div>
        <div><b>${a.rooms}</b><span>${word(a.rooms, 'помещение', 'помещения', 'помещений')}</span></div>
        <div><b>${groups.length}</b><span>${word(groups.length, 'раздел', 'раздела', 'разделов')} комплекта</span></div>
        ${R.accepted ? `<div><b>${R.accepted}</b><span>${word(R.accepted, 'визуализация', 'визуализации', 'визуализаций')}</span></div>` : ''}
      </div>
${areaNote}${pdf}    </div>
  </section>

${ribbon}${voice}${check}${honesty}
  <section class="blk">
    <div class="wrap">
      <div class="kicker">Состав</div>
      <h2>Что внутри альбома</h2>
      <p class="sub">Шифр комплекта ${esc(a.code)}. Разделы идут в том же порядке, что в выданном альбоме:
      титульный лист и общие данные, открытые вопросы и задание на обмер, дальше разделы по специальностям, в конце — развёртки, узлы и смета.</p>
      <div class="cards g3">
        ${groups.map(g => `<a class="card" href="#${g.id}"><h3>${esc(g.sec)}</h3><p>${plural(g.items.length, 'лист', 'листа', 'листов')}</p></a>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="blk">
    <div class="wrap">
      <div class="kicker">Решения</div>
      <h2>Что решалось на этом объекте</h2>
      <div class="cards g3">
        ${a.highlights.map(([t, d]) => `<div class="card"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="blk">
    <div class="wrap">
      <div class="kicker">Условия</div>
      <h2>Такой же альбом на ваш объект</h2>
      <div class="stats">
        <div><b>0 ₽</b><span>на время открытого тестирования</span></div>
        <div><b>~10 мин</b><span>бриф — можно рассказать голосом</span></div>
        <div><b>до ${a.house ? 72 : 48} ч</b><span>первый вариант ${a.house ? 'проекта дома' : 'проекта квартиры'} — от получения брифа с планом</span></div>
      </div>
      <p class="g-note">Получение брифа подтверждаем в течение дня. Соседние работы — в <a href="../../portfolio-hub/">портфолио</a>,
      как устроена проверка — в разделе <a href="../../gost/">«Документация»</a>.</p>
    </div>
  </section>

${blocks}
`;

  const ogImg = R.hero && R.hero.kind !== 'sheet' ? R.hero.src : null;
  return page({
    object: a.house ? 'house' : 'flat',
    file: `portfolio/${a.slug}/index.html`,
    title: `${a.name} — дизайн-проект и альбом по ГОСТ | LINEA`,
    desc: `${a.name}: ${plural(r.total, 'лист', 'листа', 'листов')} A3, ${plural(groups.length, 'раздел', 'раздела', 'разделов')}, общая площадь ${a.area}`
      + `${R.accepted ? `, ${plural(R.accepted, 'визуализация', 'визуализации', 'визуализаций')}` : ''}. Два PDF — альбом для заказчика и полный альбом для строителей; правки голосом прямо на листах.`,
    h1: a.name,
    lead: a.lead,
    ogImage: ogImg,
    crumb: [['Портфолио', '../../portfolio-hub/'], [a.name, null]],
    body,
    u: '../../',
    jsonld: [crumbsLd([
      ['LINEA', `${BASE}/`],
      ['Портфолио', `${BASE}/portfolio-hub/`],
      [a.name, `${BASE}/portfolio/${a.slug}/`],
    ]), {
      '@context': 'https://schema.org', '@type': 'CreativeWork',
      name: a.name, description: a.lead, url: `${BASE}/portfolio/${a.slug}/`, inLanguage: 'ru',
      genre: 'Дизайн-проект интерьера, рабочая документация', ...(ogImg ? { image: `${BASE}/${ogImg}` } : {}),
      author: { '@type': 'Person', name: SHELL.AUTHOR.name }, publisher: { '@type': 'Organization', name: 'LINEA', url: `${BASE}/` },
      ...(R.ribbon.length ? { associatedMedia: R.ribbon.map(f => ({ '@type': 'ImageObject', contentUrl: `${BASE}/${f.src}`, caption: f.alt })) } : {}),
    }, {
      '@context': 'https://schema.org', '@type': 'Service',
      name: a.house ? 'Дизайн-проект дома' : 'Дизайн-проект квартиры', serviceType: 'Дизайн-проект интерьера с рабочей документацией',
      provider: { '@type': 'Organization', name: 'LINEA', url: `${BASE}/` },
      areaServed: 'RU',
      offers: {
        '@type': 'Offer', price: '0', priceCurrency: 'RUB', availability: 'https://schema.org/InStock',
        url: `${BASE}/brief.html`,
        description: `Открытое тестирование: проект бесплатно; первый вариант ${a.house ? 'проекта дома — до 72 часов' : 'проекта квартиры — до 48 часов'} от получения брифа с планом`,
      },
    }],
  });
}

// ---------- страница раздела ----------
function hubPage(releases, honesty) {
  const totalSheets = releases.reduce((s, x) => s + x.r.total, 0);
  const NUM_IN = { 2: 'двух', 3: 'трёх', 4: 'четырёх', 5: 'пяти', 6: 'шести', 7: 'семи', 8: 'восьми', 9: 'девяти', 10: 'десяти' };
  const sorted = [...releases].sort((x, y) => NEWEST(x.a) - NEWEST(y.a));
  const cards = sorted.map(({ a, r }) => {
    const h = a.renders.hero, c = CARD[a.slug] || {};
    return `        <a class="tile" href="../portfolio/${a.slug}/">
          ${h ? `<img src="../${h.src}" alt="${esc(h.alt)}" width="${h.w}" height="${h.h}" loading="lazy" decoding="async"${h.kind === 'sheet' ? ' class="sheet"' : ''}>` : ''}
          <div class="tile-body">
            <span class="tag">${esc(c.type || '')}${c.style ? ` · ${esc(c.style)}` : ''}</span>
            <b>${esc(a.name)}</b>
            <span class="tile-lead">${esc(a.lead)}</span>
            ${c.declared ? `<span class="tile-lead" style="font-size:12.5px;margin-top:8px">В названии — заявленная площадь; в цифрах ниже — общая по экспликации альбома.</span>` : ''}
            <div class="tile-figs"><i><b>${r.total}</b>${word(r.total, 'лист', 'листа', 'листов')}</i><i><b>${a.area.replace(' м²', '')}</b>м²</i><i><b>${a.rooms}</b>${word(a.rooms, 'помещение', 'помещения', 'помещений')}</i></div>
            <span class="more">Смотреть листы →</span>
          </div>
        </a>`;
  }).join('\n');
  const blockers = releases.reduce((s, x) => s + x.r.blockers, 0);
  const body = `  <section class="blk">
    <div class="wrap">
      <div class="stats">
        <div><b>${RULES}</b><span>правил проверки выпуска</span></div>
        <div><b>26</b><span>специальностей в команде</span></div>
        <div><b>${totalSheets}</b><span>${word(totalSheets, 'лист', 'листа', 'листов')} в ${NUM_IN[releases.length] || releases.length} альбомах</span></div>
        <div><b>${blockers}</b><span>${word(blockers, 'блокер', 'блокера', 'блокеров')} на выдаче</span></div>
      </div>
    </div>
  </section>

  <section class="blk">
    <div class="wrap">
      <div class="kicker">Как это устроено</div>
      <h2>Альбом собирает движок — и сам себя проверяет</h2>
      <p class="sub">Объект описан данными один раз: геометрия в миллиметрах, отметки от нуля, проёмы, мебель,
      инженерные точки, отделка. Каждый раздел выпускает свой специалист движка, а проверка движка прогоняет
      результат по ${RULES} правилам — у каждого записан источник: пункт ГОСТ, СП или практика бюро.</p>
      <div class="cards g3">
        <div class="card"><div class="num">01</div><h3>Данные вместо картинок</h3>
          <p>Лист нельзя поправить руками в файле: он строится из данных объекта. Поменялась планировка —
          пересобрался весь альбом, и смета вместе с ним.</p></div>
        <div class="card"><div class="num">02</div><h3>Проверка с пунктом норматива</h3>
          <p>Каждое правило ссылается на источник. Нарушение выводится с адресом: лист, элемент, что именно не так
          и куда смотреть в норме.</p></div>
        <div class="card"><div class="num">03</div><h3>Блокеры не уходят в печать</h3>
          <p>Проём не помещается в стену, содержимое вылезло за край листа — выпуск останавливается.
          Блокеров на выдаче во всех ${NUM_IN[releases.length] || releases.length} альбомах: ${blockers}${blockers ? ` (${releases.filter(x => x.r.blockers).map(x => x.a.short).join(', ')})` : ''}.
          Остальное, что находит проверка, — открытые вопросы и рекомендации, а не брак: они собраны на листе «Открытые вопросы»
          в начале альбома. Подписей проверяющего и нормоконтролёра на листах нет — об этом ниже, в разделе о честности выпуска.</p></div>
      </div>
    </div>
  </section>

  <section class="blk">
    <div class="wrap">
      <div class="kicker">Контроль</div>
      <h2>Что движок поймал за собой на этих объектах</h2>
      <div class="cards g2">
        <div class="card"><h3>Дверь в примыкающей стене</h3><p>Два проёма попадали на стык стен — дверную коробку
        туда не поставить. Поймано до выпуска, проёмы сдвинуты.</p></div>
        <div class="card"><h3>Щит не влезал в формат</h3><p>Восемнадцать групп уходили за край листа, подписи
        сжимались до нечитаемых. Однолинейка научилась делиться на листы по числу групп.</p></div>
        <div class="card"><h3>Титул стоял 33-м листом</h3><p>Ядро не читало признак обложки, и титульный лист
        оказывался в середине альбома. Теперь он первый, а ведомость чертежей пересчитывается сама.</p></div>
        <div class="card"><h3>Марки сноса спорили с дверями</h3><p>И то и другое обозначалось буквой «Д» —
        в одном альбоме одна буква не может значить два разных предмета.</p></div>
      </div>
    </div>
  </section>

${honesty}
  <section class="blk">
    <div class="wrap">
      <div class="kicker">Альбомы</div>
      <h2>Посмотреть листы целиком</h2>
      <p class="sub">Это не картинки для сайта, а листы выпуска: со штампом, размерными цепочками, ведомостями
      и примечаниями. Новые проекты — первыми. Комплекты предварительные, до контрольного обмера: на листах напечатано «не для производства работ».</p>
      <div class="tiles">
${cards}
      </div>
    </div>
  </section>
`;

  return page({
    file: 'gost/index.html',
    title: 'Рабочая документация по ГОСТ — как собирается альбом | LINEA',
    desc: `Комплект рабочей документации на квартиру или дом: ${Math.min(...releases.map(x => x.r.total))}–${Math.max(...releases.map(x => x.r.total))} листов A3, 26 специальностей, ${RULES} правил `
      + `проверки с пунктами ГОСТ и СП. ${plural(releases.length, 'альбом', 'альбома', 'альбомов')} можно посмотреть целиком.`,
    h1: 'Рабочая документация по ГОСТ',
    lead: 'Комплект рабочей документации на квартиру или дом: планировки, развёртки стен, электрика со щитом, '
      + 'вода и канализация, отопление и вентиляция, потолки с узлами, раскладка плитки, отделка, '
      + 'встроенная мебель и смета. Показанные альбомы — предварительные: до контрольного обмера по ним не работают.',
    crumb: [['Документация', null]],
    body,
    ogImage: (sorted.find(x => x.a.renders.hero && x.a.renders.hero.kind === 'render') || { a: { renders: { hero: {} } } }).a.renders.hero.src,
    u: '../',
    jsonld: [crumbsLd([['LINEA', `${BASE}/`], ['Документация', `${BASE}/gost/`]])],
  });
}

// ---------- сборка ----------
const mb = f => (fs.existsSync(f) ? `${Math.round(fs.statSync(f).size / 1024 / 1024)}\u00a0МБ` : '');
for (const a of ALBUMS) {          // размер PDF показываем честно, из файла
  a.pdfSize = mb(path.join(SITE, 'portfolio', a.slug, 'album.pdf'));
  a.studioSize = mb(path.join(SITE, 'portfolio', a.slug, 'studio.pdf'));
}
// число правил проверки — из отчёта проверки выпуска (sync-gost-releases.sh кладёт _rules.txt); разные выпуски — берём наибольшее
const RULES = Math.max(0, ...ALBUMS.map(a => +((() => { try { return fs.readFileSync(path.join(SITE, 'portfolio', a.slug, '_rules.txt'), 'utf8'); } catch { return '0'; } })()) || 0));
if (!RULES) throw new Error('не найдено число правил проверки (_rules.txt) — запустите tools/sync-gost-releases.sh');
const releases = ALBUMS.map(a => ({ a, r: readRelease(a.slug) }));
// честная часть выпуска: вопросы, знак «*», задание на обмер — читается с самих листов (tools/gost-open-issues.js)
const H = {};
for (const { a } of releases) {
  const r = releases.find(x => x.a === a).r;
  H[a.slug] = a.explain === false ? OPEN.facts(SITE, a.slug, r) : OPEN.read(SITE, a.slug, r);
  a.area = H[a.slug].facts.area;          // паспорт объекта — с титула выпуска, не руками
  a.rooms = H[a.slug].facts.rooms;
  const nm = a.name.match(/(\d+) помещени/);   // число в названии альбома не пишем мимо титула
  if (nm && +nm[1] !== a.rooms) throw new Error(`${a.slug}: в названии «${a.name}» ${nm[1]} помещений, а на титуле выпуска ${a.rooms}`);
}
// визуализации и карточка проекта для портфолио (gen-more-pages.js читает _card.json, а не дублирует метаданные)
for (const { a, r } of releases) {
  a.renders = renders(a, r);
  w(`portfolio/${a.slug}/_renders.json`, JSON.stringify(a.renders, null, 1));
  const c = CARD[a.slug] || {};
  w(`portfolio/${a.slug}/_card.json`, JSON.stringify({
    slug: a.slug, name: a.name, lead: a.lead, code: a.code, house: !!a.house, type: c.type || '', style: c.style || '',
    area: a.area, declared: c.declared ? c.declared.replace('{AREA}', a.area) : '', rooms: a.rooms, total: r.total,
    blockers: r.blockers, hero: a.renders.hero || null, visuals: a.renders.accepted,
    studioSize: a.studioSize, pdfSize: a.pdfSize,
  }, null, 1));
}
const explained = releases.filter(x => x.a.explain !== false);
const X = EXPLAINER.build({ ALBUMS: ALBUMS.filter(a => a.explain !== false), releases: explained, H, esc, plural, word, page, BASE, crumbsLd });
for (const { a, r } of releases) w(`portfolio/${a.slug}/index.html`, albumPage(a, r, a.explain === false ? '' : X.albumBlock(a.slug)));
w('gost/index.html', hubPage(releases, X.hubSection));
w(`gost/${X.slug}/index.html`, X.explainer);

// sitemap: дописываем новые адреса, если их ещё нет
const smPath = path.join(SITE, 'sitemap.xml');
if (fs.existsSync(smPath)) {
  let sm = fs.readFileSync(smPath, 'utf8');
  let added = 0;
  for (const u of ['gost/', `gost/${X.slug}/`, ...ALBUMS.map(a => `portfolio/${a.slug}/`)]) {
    const loc = `${BASE}/${u}`;
    if (sm.includes(`<loc>${loc}</loc>`)) continue;
    sm = sm.replace('</urlset>', `  <url><loc>${loc}</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>\n</urlset>`);
    added++;
  }
  if (added) { fs.writeFileSync(smPath, sm); out.push(`sitemap.xml (+${added})`); }
}

console.log('Собрано:');
for (const f of out) console.log('  ' + f);
for (const { a, r } of releases) console.log(`  ${a.slug}: ${r.total} листов, блокеров ${r.blockers}, вопросов и рекомендаций ${r.issues}; кадров принято ${a.renders.accepted}, в ленте ${a.renders.ribbon.length}, заглавный — ${a.renders.hero ? a.renders.hero.kind : 'нет'}`);
