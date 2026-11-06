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
const CMP = require('./compare-pairs');
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
    lead: 'Первый объект в новом формате: две спальни, кухня-гостиная, ванная, санузел, гардеробная, прихожая и коридор. '
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
    name: 'Квартира {A} м² после реконструкции',
    short: 'квартира {A} м²',
    lead: 'Собрана по плану заказчика: две спальни, кухня-гостиная, прихожая, коридор, ванная, санузел, гардеробная '
      + 'и кладовая. К альбому — выпуск для заказчика по образцу студийных проектов: визуализации стоят листами перед '
      + 'развёртками своих помещений.',
    code: 'ГД-2026-007-АИ',
    highlights: [
      ['План заказчика — в данные', 'Планировка снята с картинки заказчика коротким файлом раскладки, начинка помещений '
        + 'перенесена с образцов готовых проектов и подогнана под новые размеры.'],
      ['Визуализация этой стены — на листе развёртки', 'Движок по положению камеры понимает, какую стену показывает кадр, '
        + 'и ставит его рядом с чертежом этой стены. Узлы стены 1:10 — там же, со ссылкой на лист узлов.'],
      ['Спальня без окна — стоп-ошибка, а не допущение', 'Проверка держит выпуск, пока автор не решит: перенести спальню, '
        + 'добавить окно или сделать помещение нежилым. Альбом показан как рабочий пример до решения.'],
    ],
  },
  {
    slug: 'gost-kv58',
    explain: false,
    name: 'Квартира {A} м² · кухня-гостиная и спальня',
    short: 'квартира {A} м²',
    lead: 'Второй объект, собранный по шаблону: планировка описана коротким файлом, начинка помещений — с образцов '
      + 'готовых проектов. Выпуск без стоп-ошибок.',
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
      ['Кадры сверяются с планом', 'После разбора практика каждый кадр проверяется по чек-листу плана: мебель, двери, сантехника, свет. '
        + 'Что не совпало — перерисовывается; на сайте только сверенные кадры, со статусом подписи дизайнера.'],
      ['Кадр — рядом с развёрткой своей стены', 'В альбоме для заказчика визуализация стоит перед листом развёртки той стены, которую показывает.'],
      ['Перепланировка — предложение', 'Несущие стены не определены: решение и обмер отмечены в реестре открытых вопросов, '
        + 'альбом помечен «предварительно» до их закрытия.'],
    ],
  },
  {
    slug: 'gost-retro103',
    explain: false,
    name: 'Квартира {A} м² · ретро с авторской мебелью',
    short: 'квартира {A} м² в ретро-стиле',
    lead: 'Две соседние квартиры по обмеру объединены в одну: гостиная-столовая с балконом, кабинет-библиотека, мастер-спальня '
      + 'с ванной. Стиль — середина века и ар-деко: орех и тик, латунь, изумрудный бархат, горчичное букле, терраццо.',
    code: 'ГД-2026-009-АИ',
    highlights: [
      ['Авторская мебель середины века', 'Кресло-лаунж с оттоманкой, мраморный стол-тюльпан, журнальный стол Noguchi, '
        + 'кресло-яйцо, буфет на конических ножках — как предложение, модели уточняются с заказчиком.'],
      ['Объединение квартир — предложение', 'Проём в межквартирной стене и один вход из тамбура; несущие колонны и ригель '
        + 'не трогаем, техзаключение — в реестре открытых вопросов.'],
      ['Визуализации и вид сверху 3D', 'Кадры стоят перед развёртками своих стен в альбоме для заказчика. С планом по новому чек-листу '
        + 'они ещё не пересверены, поэтому на этой странице их нет — смотрите листы.'],
    ],
  },
  {
    slug: 'gost-lineademo',
    explain: false,
    name: 'Квартира {A} м² · джапанди',
    short: 'квартира {A} м² в стиле джапанди',
    lead: 'Демо-квартира студии, пересобранная в новом формате: кухня-гостиная, спальня, детская, санузел, '
      + 'прихожая. Джапанди — тёплый белый, дуб, серо-зелёный, без глянца; у каждой комнаты свой акцент.',
    code: 'ГД-2026-011-АИ',
    highlights: [
      ['Тот же бриф — новый формат', 'Старый демо-альбом был 30 листов; в новом формате — полный комплект с автопроверкой оформления.'],
      ['Своя мебель и сюжеты картин', 'Линейная кухня с навесными шкафами, кровать-подиум, растущий стол в детской; '
        + 'картины — суми-э, акварель сакуры, гуашь «кот на подоконнике».'],
      ['Честные допущения', 'Планировка, вентканалы и мощность взяты из брифа как допущения — в реестре открытых вопросов.'],
    ],
  },
  {
    slug: 'gost-dom120',
    explain: false,
    house: true, // срок для дома — до 72 часов от оплаты и плана
    name: 'Дом {A} м² в два этажа · средиземноморье',
    short: 'дом {A} м² в два этажа',
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
    name: 'Дом {A} м² с мансардой и гаражом',
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
        + 'летняя гостиная на веранде.'],
    ],
  },
  {
    slug: 'gost-elitemodern',
    explain: false,
    type: 'Квартира',
    style: 'Элитный модерн',
    name: 'Квартира 68 м² · элитный модерн',
    short: 'квартира в элитном модерне',
    lead: 'Новый проект: семь помещений, элитный модерн — орех, латунь, мрамор с прожилкой, букле; '
      + 'у каждой комнаты свой тёмный акцент. Авторский светлый титул с виньетками и аркой, вид сверху и студийный порядок листов.',
    code: 'ГД-2026-020-АИ',
    highlights: [
      ['Авторский титул и орнамент', 'Светлая бумага без чёрной панели: двойная рамка с угловыми виньетками, монограмма LINEA, '
        + 'линейная арка с пилястрами; цвета — из палитры проекта.'],
      ['Единый образ, а не шаблон', 'Орех с рейкой, латунь, кварцит и мрамор, букле, свет 3000 K; образ стиля применён ко всем позициям, '
        + 'а не только к палитре.'],
      ['Кадры сверяются с планом', 'Каждый кадр проверяется по чек-листу: мебель, двери, сантехника, свет. На сайте — только сверенные кадры '
        + 'со статусом подписи; остальные — в альбоме.'],
    ],
  },
);
// с 06.11.2026 на сайте только квартиры (TERMS.houses = false): альбомы домов не собираются, их адреса — заглушки tools/gen-moved-pages.js
for (let i = ALBUMS.length - 1; i >= 0; i--) if (ALBUMS[i].house && !SHELL.TERMS.houses) ALBUMS.splice(i, 1);

// карточка проекта: тип и стиль (стиль — из project.json движка: meta.style), стиль для title («в стиле …») и честное пояснение,
// если площадь в названии не совпадает с экспликацией альбома. {AREA} — общая площадь с титула выпуска.
const CARD = {
  'gost-dom120': { inStyle: 'в средиземноморском стиле', type: 'Дом, 2 этажа', style: 'Средиземноморье и скандинавский',
    declared: 'В брифе демо-дома указано 120 м²; общая площадь по экспликации альбома (сумма помещений) — {AREA}, она и стоит в названии.' },
  'gost-lineademo': { inStyle: 'в стиле джапанди', type: 'Квартира', style: 'Джапанди' },
  'gost-dom331': { inStyle: 'в стиле шале', type: 'Дом с мансардой', style: 'Шале и эко',
    declared: 'На картинке плана заказчика заявлено 331 м². Размеры на ней не читаются — их подобрал проектировщик, '
      + 'и общая площадь по экспликации альбома вышла {AREA}; она и стоит в названии. Точная площадь — после контрольного обмера.' },
  'gost-retro103': { inStyle: 'в стиле ретро', type: 'Квартира', style: 'Середина века и ар-деко',
    declared: 'По обмерному плану общая площадь двух квартир с тамбуром — 102,98 м²; по экспликации альбома (сумма помещений) — {AREA}, '
      + 'она и стоит в названии.' },
  'gost-modern4k': { inStyle: 'в стиле модерн', type: 'Квартира', style: 'Модерн и современный' },
  'gost-kv65': { inStyle: 'в скандинавском стиле', type: 'Квартира', style: 'Скандинавский' },
  'gost-kv58': { inStyle: 'в скандинавском стиле', type: 'Квартира', style: 'Скандинавский',
    declared: 'В исходных данных заказчика — 57,6 м²; по экспликации альбома (сумма помещений) — {AREA}, она и стоит в названии.' },
  'gost-proekt2': { inStyle: 'в современном стиле', type: 'Квартира', style: 'Современный' },
  'gost-kv3k': { inStyle: 'в современном стиле', type: 'Квартира', style: 'Современный, тёплая гамма' },
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

// «Зачем этот раздел» — одна строка на странице альбома (разведка 03.11.2026: заказчик не знает, зачем ему 100+ листов).
// Ключ — название раздела из SECTION_OF / bySection. Без обещаний результата: что лист даёт и кому.
const SECTION_WHY = {
  'Общие данные': 'Состав альбома, условные обозначения и исходные данные — с чего читать комплект и на что опираются остальные листы.',
  'Вопросы, задание на обмер и график работ': 'Что ещё не решено и что замерить на месте: пока здесь есть открытые пункты, комплект предварительный. Тут же порядок закупок и работ.',
  'Архитектурные решения': 'Что сносить и что строить: обмер, демонтаж и монтаж перегородок, двери — по этим листам бригада размечает стены.',
  'Планировочное решение': 'Где стоит мебель и с какими размерами — от расстановки считаются розетки, свет и выводы воды.',
  'Электрооборудование': 'Розетки и выводы с высотами от пола, привязками и группами щита — чтобы штробить один раз, до штукатурки.',
  'Слаботочные системы': 'Интернет, ТВ, домофон и слаботочный щит — кабель кладут вместе с силовым, потом его не добавить.',
  'Освещение': 'Светильники, сценарии и спецификация — свет считается под мебель, а не по сетке на потолке.',
  'Отопление и вентиляция': 'Радиаторы, тёплый пол и вентиляция — что учесть до потолков и отделки.',
  'Водоснабжение и канализация': 'Выводы воды и канализации с высотами и схема разводки — под конкретные приборы, до стяжки и плитки.',
  'Потолки и ГКЛ-конструкции': 'Уровни потолков, короба и перегородки из ГКЛ с разрезами и узлами — по ним собирают каркас.',
  'Раскладка плитки': 'Откуда начинать раскладку, где подрезки и как швы сходятся с розетками и сантехникой.',
  'Полы и отделка': 'Пироги полов с отметками и ведомость отделки по помещениям — сколько и какого материала.',
  'Цвет и материалы': 'Колерная карта и спецификация материалов — цвет каждой поверхности по коду, а не «на глаз».',
  'Декор и текстиль': 'Шторы, карнизы и декор с размерами — чтобы закладные под карнизы появились до покраски.',
  'Встроенная мебель': 'Чертежи шкафов и кухни с монтажными схемами — мебельщик считает по ним, выводы сверяются с ними.',
  'Развёртки стен, узлы и реестры': 'Каждая стена изнутри: отделка, розетки, выводы и мебель с размерами от угла и от пола.',
  'Смета': 'Объёмы работ и материалов считаются с чертежей — по ним сравнивают предложения бригад строка за строкой.',
  'Приёмка работ': 'Чек-листы для вашей приёмки этапов: что смотреть и что сфотографировать до закрытия стен.',
};

const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya', ь: '', ъ: '', ё: 'e' };
// склонение: «71 лист», «105 листов», «22 листа» — иначе плитки читаются коряво
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return `${n} ${a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many}`;
};

// то же без числа: «<b>41</b> открытый вопрос» — число стоит в плитке отдельно
const word = (n, one, few, many) => plural(n, one, few, many).replace(/^\d+ /, '');

// диапазон с согласованием по последнему числу: «64–121 лист», «132–156 листов»
const range = (a, b, ...f) => (a === b ? plural(b, ...f) : `${a}–${plural(b, ...f)}`);

// картинка проекта: webp рядом — через <picture>, иначе просто jpg. u — путь до корня сайта
const pic = (h, u, attrs) => {
  const img = `<img src="${u}${h.src}" alt="${esc(h.alt)}" width="${h.w}" height="${h.h}" ${attrs}>`;
  return h.webp ? `<picture style="display:block"><source type="image/webp" srcset="${u}${h.webp}">${img}</picture>` : img;
};

// title и description: обрезка в site-shell ставит «…» посреди фразы — поэтому выбираем первый вариант, который влезает
const fit = (cands, max, what) => {
  const c = cands.map(x => x.replace(/\s+/g, ' ').trim()).find(x => x.length <= max);
  if (!c) throw new Error(`${what}: ни один вариант не влез в ${max} знаков — «${cands[cands.length - 1]}»`);
  return c;
};

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
// Статус кадра решает НЕ этот генератор, а приёмка движка — tools/views-check.js (отзыв практика 22.10.2026: кадры,
// «принятые» сверкой с глиной, разошлись с планом — остров, стулья, двери). У каждого кадра одно из трёх состояний:
//   signed — сверен с ПЛАНОМ по чек-листу и подписан дизайнером (checked.confirmedBy + confirmedOn);
//   prelim — сверен с планом исполнителем, подписи дизайнера нет;
//   rejected — не совпал с планом или сверялся только с глиной (старая методика) — на сайт не идёт вовсе.
// В ленту и в заглавный кадр идут только signed и prelim (подписанные первыми), подпись под кадром говорит, какой он.
// Нет ни одного сверенного кадра — заглавным идёт лист расстановки мебели, ленты нет. Копии ужимаются до 1600 px
// (лента — 1200 px) и лежат в site/assets/portfolio; если движка рядом нет, берётся _renders.json с сайта.
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
function sips(src, dst, px, force) {
  if (!force && fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  require('child_process').execFileSync('sips', ['-Z', String(px), '-s', 'format', 'jpeg', '-s', 'formatOptions', '68', src, '--out', dst], { stdio: 'ignore' });
}
// webp рядом с jpg — для <picture>: заглавный кадр самый тяжёлый на странице. Нет cwebp — остаётся только jpg.
function webp(jpg) {
  const dst = jpg.replace(/\.jpe?g$/i, '.webp');
  try {
    if (!fs.existsSync(dst) || fs.statSync(dst).mtimeMs < fs.statSync(jpg).mtimeMs) {
      require('child_process').execFileSync('cwebp', ['-quiet', '-q', '72', jpg, '-o', dst], { stdio: 'ignore' });
    }
    return fs.existsSync(dst);
  } catch { return false; }
}
function dims(f) {
  try {
    const o = require('child_process').execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', f], { encoding: 'utf8' });
    return { w: +(o.match(/pixelWidth: (\d+)/) || [])[1] || 1600, h: +(o.match(/pixelHeight: (\d+)/) || [])[1] || 1067 };
  } catch { return { w: 1600, h: 1067 }; }
}
// приёмка кадров движком: имя кадра → 'signed' | 'prelim' | 'rejected' (вывод tools/views-check.js <project.json>)
function acceptanceOf(obj) {
  const proj = path.join(GD, 'projects', obj, 'project.json'), tool = path.join(GD, 'tools', 'views-check.js');
  if (!fs.existsSync(proj) || !fs.existsSync(tool)) return null;
  let txt = '';
  try { txt = require('child_process').execFileSync(process.execPath, [tool, proj], { cwd: GD, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { txt = String(e.stdout || ''); }
  const map = new Map();
  for (const m of txt.matchAll(/^\s{2}(принят|предварительно|НЕ принят)\s+(\S+)/gm)) map.set(m[2], { 'принят': 'signed', 'предварительно': 'prelim' }[m[1]] || 'rejected');
  if (!map.size) throw new Error(`${obj}: views-check.js не выдал ни одного кадра — формат вывода поменялся?`);
  return map;
}
function renders(a, r) {
  const man = path.join(SITE, 'portfolio', a.slug, '_renders.json');
  const dir = OBJ[a.slug] && path.join(GD, 'projects', OBJ[a.slug], 'renders');
  // без визуализации заглавным идёт лист расстановки мебели — по нему сразу видно планировку
  const plan = r.sheets.find(x => /^План расстановки мебели/.test(x.title)) || r.sheets[0];
  const coverHero = { src: `portfolio/${a.slug}/sheets/${plan.file}`, alt: `${a.name} — ${plan.title.replace(/^./, c => c.toLowerCase())}`, w: 1587, h: 1123, kind: 'sheet' };
  if (!dir || !fs.existsSync(dir)) {
    try { return JSON.parse(fs.readFileSync(man, 'utf8')); } catch { return { hero: coverHero, ribbon: [], signed: 0, prelim: 0, rejected: 0, accepted: 0, checked: false }; }
  }
  let views = [];
  try { views = JSON.parse(fs.readFileSync(path.join(dir, 'views.json'), 'utf8')); } catch { /* сверки нет */ }
  const acc = views.length ? acceptanceOf(OBJ[a.slug]) : null;
  const has = n => fs.existsSync(path.join(dir, `${n}.jpg`));
  const st = v => (acc && acc.get(v.name)) || 'rejected';
  // 04.11.2026 (Александр): показываем все кадры проекта; непринятые идут с честной подписью «иллюстрация».
  const shown = views.filter(v => has(v.name) && /^(room-|3d-top)/.test(v.name));
  const n = { signed: shown.filter(v => st(v) === 'signed').length, prelim: shown.filter(v => st(v) === 'prelim').length };
  n.rejected = views.length - n.signed - n.prelim;
  const first = (re, state) => shown.find(v => re.test(v.name) && (!state || st(v) === state));
  // заглавный: подписанный вид сверху 3D, затем подписанный кадр самого важного помещения, и только потом предварительные
  const byRoom = state => shown.filter(v => st(v) === state && /^room-/.test(v.name))
    .sort((x, y) => (ROOM_ORDER.indexOf(roomKey(x.name)) + 1 || 99) - (ROOM_ORDER.indexOf(roomKey(y.name)) + 1 || 99))[0];
  const heroV = first(/^3d-top(-et1)?$/, 'signed') || byRoom('signed') || first(/^3d-top(-et1)?$/) || byRoom('prelim') || shown[0];
  // лента: по одному кадру на помещение в порядке значимости, подписанные первыми, затем вторые кадры — до 8
  const pool = shown.filter(v => v !== heroV);
  const rank = v => { const k = roomKey(v.name); const i = ROOM_ORDER.indexOf(k); return (st(v) === 'signed' ? 0 : st(v) === 'prelim' ? 50 : 200) + (k === '3d-top' ? -1 : i < 0 ? 99 : i); };
  pool.sort((x, y) => rank(x) - rank(y));
  const pick = [], used = new Set();
  for (const v of pool) { const k = roomKey(v.name) + (v.name.match(/^room-[a-z]+(\d*)/) || [])[1]; if (!used.has(k)) { used.add(k); pick.push(v); } }
  for (const v of pool) if (!pick.includes(v)) pick.push(v);
  const ribbonViews = pick;                    // 04.11.2026: на странице — все кадры проекта, не только первые восемь
  // accepted — только подписанные дизайнером: это число и идёт в карточки и счётчики «визуализаций»
  const out = { checked: !!(n.signed + n.prelim), signed: n.signed, prelim: n.prelim, rejected: n.rejected, accepted: n.signed, ribbon: [] };
  const coverFile = dir ? path.join(dir, 'cover', 'hero.jpg') : null;
  const dstHero = path.join(SITE, 'assets', 'portfolio', `${a.slug}-hero.jpg`);
  let prevHero = null;
  try { prevHero = JSON.parse(fs.readFileSync(man, 'utf8')).hero.name; } catch { /* первый прогон */ }
  const acceptedHero = heroV && (st(heroV) === 'signed' || st(heroV) === 'prelim');
  if (coverFile && fs.existsSync(coverFile)) {
    // на титуле альбома — 3D-фотография квартиры (04.11.2026); она и идёт заглавной на странице проекта
    sips(coverFile, dstHero, 1600, prevHero !== 'cover-hero');
    out.hero = { src: `assets/portfolio/${a.slug}-hero.jpg`, alt: `${a.name} — визуализация интерьера`, ...dims(dstHero), kind: 'render', state: 'illustration', name: 'cover-hero' };
  } else if (acceptedHero) {
    sips(path.join(dir, `${heroV.name}.jpg`), dstHero, 1600, prevHero !== heroV.name);   // кадр сменился — копию перезаписать
    out.hero = { src: `assets/portfolio/${a.slug}-hero.jpg`, alt: frameAlt(a, heroV.name), ...dims(dstHero), kind: 'render', state: st(heroV), name: heroV.name };
  } else if (heroV) {
    sips(path.join(dir, `${heroV.name}.jpg`), dstHero, 1600, prevHero !== heroV.name);
    out.hero = { src: `assets/portfolio/${a.slug}-hero.jpg`, alt: frameAlt(a, heroV.name), ...dims(dstHero), kind: 'render', state: st(heroV), name: heroV.name };
  } else out.hero = coverHero;
  if (out.hero && /^assets\/portfolio\//.test(out.hero.src || '') && webp(dstHero)) out.hero.webp = `assets/portfolio/${a.slug}-hero.webp`;
  const rdir = path.join(SITE, 'assets', 'portfolio', a.slug);
  const keep = new Set();
  for (const v of ribbonViews) {
    const dst = path.join(rdir, `${v.name}.jpg`);
    sips(path.join(dir, `${v.name}.jpg`), dst, 1200);
    keep.add(`${v.name}.jpg`);
    out.ribbon.push({ src: `assets/portfolio/${a.slug}/${v.name}.jpg`, alt: frameAlt(a, v.name), ...dims(dst), state: st(v) });
  }
  if (fs.existsSync(rdir)) for (const f of fs.readdirSync(rdir)) if (!keep.has(f)) fs.unlinkSync(path.join(rdir, f));
  return out;
}

// стили страниц раздела: заглавный кадр, лента визуализаций, шаги правок. Общий main.css не трогаем — правят другие
const CSS = `<style>
.g-why{color:var(--ink);font-size:15px;line-height:1.55;max-width:760px;margin:-4px 0 10px}.g-why b{color:var(--gold);font-weight:600}
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
.cmp{background:var(--panel);border:1px solid var(--line)}
.cmp-head{padding:30px 34px 22px;border-bottom:1px solid var(--line)}
.cmp-head .kicker{margin-bottom:10px}
.cmp-title{font-family:var(--serif);font-weight:400;text-transform:uppercase;letter-spacing:.05em;font-size:clamp(22px,2.6vw,30px);line-height:1.35;margin:0 0 10px}
.cmp-sub{color:var(--mut);font-size:14.5px;line-height:1.6;max-width:760px;margin:0 0 20px}
.cmp-floors{display:flex;gap:8px;margin:0 0 14px}
.cmp-floors button{font:inherit;font-size:13px;letter-spacing:.05em;padding:6px 14px;background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:0;cursor:pointer;transition:.18s}
.cmp-floors button:hover{border-color:#C9A45F80}
.cmp-floors button[aria-pressed=true]{background:#F2EEE6;border-color:#F2EEE6;color:#1B1915;font-weight:600}
.cmp-row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px}
.cmp-seg{display:flex}
.cmp-seg button{font:inherit;height:36px;padding:0 20px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;background:transparent;color:var(--ink);border:1px solid #F2EEE64D;border-radius:0;margin-right:-1px;cursor:pointer;transition:.2s}
.cmp-seg button:last-child{margin-right:0}
.cmp-seg button:hover{background:#F2EEE61A;border-color:#F2EEE680}
.cmp-seg button[aria-pressed=true]{background:var(--gold);border-color:var(--gold);color:#14130f;font-weight:600;position:relative}
.cmp-seg button:disabled{opacity:.35;cursor:default}
.cmp-frame{position:relative;background:#F2EEE6;overflow:hidden}
.cmp-stage{position:relative;margin:0;width:100%;aspect-ratio:var(--ar);max-height:74vh;touch-action:pan-y;user-select:none;-webkit-user-select:none;cursor:ew-resize;--p:50%}
.cmp-stage[hidden]{display:none}
.cmp-stage img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain;pointer-events:none}
.cmp-b{position:absolute;inset:0;clip-path:inset(0 calc(100% - var(--p)) 0 0);background:#F2EEE6}
.cmp-h{position:absolute;top:0;bottom:0;left:var(--p);width:44px;margin-left:-22px;outline:none;display:flex;justify-content:center;z-index:3}
.cmp-h::before{content:"";position:absolute;top:0;bottom:0;width:2px;background:#1B1915;transition:width .15s}
.cmp-h:hover::before{width:3px}
.cmp-h i{position:absolute;top:50%;width:44px;height:44px;margin-top:-22px;background:#1B1915;border:1px solid var(--gold);display:flex;align-items:center;justify-content:center;gap:7px;box-shadow:0 4px 15px rgba(0,0,0,.4);transition:transform .15s,box-shadow .15s}
.cmp-h i::before,.cmp-h i::after{content:"";width:1px;height:14px;background:var(--gold)}
.cmp-h:hover i,.cmp-stage.is-drag .cmp-h i{transform:scale(1.06);box-shadow:0 6px 20px rgba(0,0,0,.5)}
.cmp-h:focus-visible i{outline:2px solid #fff;outline-offset:3px}
.cmp-l{position:absolute;top:16px;padding:7px 14px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;pointer-events:none;z-index:2}
.cmp-l.l{left:16px;background:#1B1915;color:#F2EEE6}.cmp-l.r{right:66px;background:#F2EEE6;color:#1B1915;border:1px solid #1B19151F}
.cmp-zoom{position:absolute;top:12px;right:12px;width:40px;height:40px;border-radius:50%;background:#1B1915cc;border:1px solid #F2EEE64D;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:4;transition:.2s}
.cmp-zoom:hover{background:#1B1915;border-color:var(--gold)}
.cmp-zoom svg{width:19px;height:19px;stroke:currentColor;stroke-width:2;fill:none}
.cmp-hint{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:10px 20px;border-radius:20px;background:#1B1915e6;color:#fff;font-size:12px;white-space:nowrap;pointer-events:none;z-index:4;opacity:0;animation:cmpIn .5s ease 1s forwards,cmpOut .5s ease 4.5s forwards}
.cmp-hint svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;animation:cmpSwipe 1.5s ease-in-out infinite}
.cmp.touched .cmp-hint{display:none}
@keyframes cmpIn{to{opacity:1}}@keyframes cmpOut{from{opacity:1}to{opacity:0}}
@keyframes cmpSwipe{0%,100%{transform:translateX(-3px)}50%{transform:translateX(3px)}}
@media (prefers-reduced-motion:reduce){.cmp-hint{animation:none;opacity:1}.cmp-hint svg{animation:none}}
.cmp-frame:fullscreen{display:flex;align-items:center;justify-content:center}
.cmp-frame:fullscreen .cmp-stage{max-height:none;height:100vh}
.cmp-foot{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:14px 24px;padding:20px 34px;border-top:1px solid var(--line)}
.cmp-cap{color:var(--mut);font-size:13px;line-height:1.6;margin:0}.cmp-cap[hidden]{display:none}
.cmp-cap b{color:var(--ink);font-weight:500}.cmp-cap a{color:inherit}
.cmp-cta{display:inline-block;padding:14px 32px;font-size:12px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--ink);text-decoration:none;border:1px solid #F2EEE699;transition:.3s;white-space:nowrap}
.cmp-cta:hover{background:var(--gold);border-color:var(--gold);color:#14130f}
@media (max-width:760px){.cmp-head{padding:22px 16px 16px}.cmp-long{display:none}.cmp-row{gap:8px}.cmp-row>*{flex:1 1 100%}.cmp-seg button{flex:1;height:34px;padding:0 6px;font-size:10px;letter-spacing:.08em}.cmp-floors button{flex:1}.cmp-stage{max-height:62vh}.cmp-l{font-size:10px;padding:5px 9px;top:10px}.cmp-l.l{left:10px}.cmp-l.r{right:58px}.cmp-zoom{width:36px;height:36px;top:8px;right:8px}.cmp-hint{font-size:11px;padding:8px 16px}.cmp-foot{padding:16px;flex-direction:column;align-items:stretch;text-align:center}.cmp-cta{text-align:center;padding:12px 20px}.g-ribbon{grid-auto-columns:78%}.stats{gap:22px 30px}.cta-row .btn{white-space:normal;text-align:center}}
</style>`;

function page({ file, title, desc, h1, crumb, lead, body, u, jsonld, object, ogImage, ogDesc }) {
  const ld = (jsonld || []).map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');
  if (title.length > 70) console.warn(`  ! ${file}: title ${title.length} знаков (> 70)`);
  if (desc.replace(/\s+/g, ' ').trim().length > 158) console.warn(`  ! ${file}: description длиннее 158 — site-shell обрежет его на «…»`);
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
  for (const g of groups) if (!SECTION_WHY[g.sec]) console.warn(`  ! ${a.slug}: у раздела «${g.sec}» нет строки «зачем» (SECTION_WHY)`);
  const R = a.renders;
  // список листов для страницы правок голосом (review.html): клиент открывает лист, ставит метку и надиктовывает правку
  w(`portfolio/${a.slug}/sheets.json`, JSON.stringify(r.sheets.map(sh => ({ file: sh.file, title: sh.title, no: (sh.file.match(/^(\d+)/) || [])[1] ? +sh.file.match(/^(\d+)/)[1] : null }))));
  const rv = f => `../../review.html?p=${a.slug}&amp;s=${encodeURIComponent(f)}`;
  const rvAll = `../../review.html?p=${a.slug}`;
  // разбор решений проекта — кейс, если он есть (перелинковка альбом ↔ кейс)
  const CASE = { 'gost-dom331': 'dom-331.html', 'gost-retro103': 'kvartira-103.html', 'gost-lineademo': 'kvartira-56.html', 'gost-dom120': 'dom-120.html' }[a.slug];
  const caseBtn = CASE ? `\n        <a class="btn ghost" href="../../cases/${CASE}">Разбор решений проекта</a>` : '';

  const blocks = groups.map(g => `  <section class="blk" id="${g.id}">
    <div class="wrap">
      <div class="kicker">Раздел</div>
      <h2>${esc(g.sec)}</h2>${SECTION_WHY[g.sec] ? `\n      <p class="g-why"><b>Зачем:</b> ${esc(SECTION_WHY[g.sec])}</p>` : ''}
      <p class="sub">${plural(g.items.length, 'лист', 'листа', 'листов')}. Нажмите на лист — он откроется целиком, и к нему можно надиктовать правку.</p>
      <div class="plates">
      ${g.items.map(sh => `<a class="plate" href="${rv(sh.file)}" rel="nofollow" title="Открыть лист и оставить правку голосом">
        <span class="plate-img"><img loading="lazy" decoding="async" src="sheets/${encodeURIComponent(sh.file)}" alt="${esc(sh.title)}" width="1587" height="1123"></span>
        <span class="plate-cap"><i>${esc(sh.file.replace(/^(\d+).*$/, 'Лист $1'))}</i>${esc(sh.title)}</span>
      </a>`).join('\n      ')}
      </div>
    </div>
  </section>`).join('\n');

  // заглавный кадр
  const capOf = { signed: 'Кадр сверен с планом по чек-листу (мебель, двери, сантехника, свет) и подписан дизайнером.',
    prelim: 'Кадр сверен с планом по чек-листу исполнителем; подписи дизайнера пока нет.',
    illustration: 'Сверка кадра с планом ещё не завершена — где кадр и чертёж расходятся, верен чертёж.',
    sheet: 'Лист альбома. Визуализации этого проекта с планом по чек-листу ещё не сверены — на сайте их не показываем, они есть в альбоме для заказчика.' };
  const hero = R.hero ? `      <figure class="g-hero${R.hero.kind === 'sheet' ? ' sheet' : ''}">
        ${pic(R.hero, '../../', 'fetchpriority="high" decoding="async"')}
        <figcaption>${esc(R.hero.alt.replace(`${a.name} — `, '').replace(/^./, c => c.toUpperCase()))}. ${capOf[R.hero.kind === 'sheet' ? 'sheet' : R.hero.state] || ''}</figcaption>
      </figure>\n` : '';

  // два PDF: полный альбом (рабочая документация с проверкой) и альбом для заказчика с визуализациями
  const has = f => fs.existsSync(path.join(SITE, 'portfolio', a.slug, f));
  const pdf = `      <div class="cta-row" style="margin-top:26px">${has('studio.pdf') ? `<a class="btn" href="studio.pdf" download>Альбом для заказчика · PDF ${a.studioSize}</a>` : ''}
        ${has('album.pdf') ? `<a class="btn ghost" href="album.pdf" download>Полный альбом по ГОСТ · PDF ${a.pdfSize}</a>` : ''}
        <a class="btn ghost" href="${rvAll}" rel="nofollow">🎤 Оставить правку голосом</a>${caseBtn}</div>
      <p class="g-note">Альбом для заказчика — проект в подаче студии: на титуле 3D-фотография квартиры,
      дальше планы с расстановкой мебели, развёртки и ведомости. Все кадры — в разделе «Визуализации» выше. ${R.signed && !R.prelim && !R.rejected ? '' : 'Не все кадры сверены с планом и подписаны дизайнером — где кадр и чертёж расходятся, верен чертёж. '}Полный альбом — предварительный комплект для обсуждения: все разделы, ведомости
      и смета (что значит пометка «ПРЕДВАРИТЕЛЬНО» — в разделе о проверке на этой странице). Файлы большие — на мобильном интернете лучше качать по Wi-Fi.</p>\n`;

  // статус выпуска — до кнопок скачивания, а не в тексте ниже (аудит сайта 04.11.2026, п. 4)
  const prelim = r.blockers ? `      <p class="g-note" style="border-left:3px solid var(--gold);padding-left:14px;margin:0 0 8px"><b>ПРЕДВАРИТЕЛЬНО · ${plural(r.blockers, 'стоп-ошибка', 'стоп-ошибки', 'стоп-ошибок')}</b> · демонстрационный проект студии, не заказ клиента. Комплект не выдаётся, пока стоп-ошибки не закрыты.</p>\n` : '';
  const card = CARD[a.slug] || {};
  const areaNote = card.declared ? `      <p class="g-note"><b>Про площадь.</b> ${esc(card.declared.replace('{AREA}', a.area))}</p>\n` : '';

  const ribbon = R.ribbon.length ? `  <section class="blk">
    <div class="wrap">
      <div class="kicker">Визуализации</div>
      <h2>Как это будет выглядеть</h2>
      <p class="sub">Все 3D-кадры проекта. Подписанные дизайнером сверены с планом по чек-листу; остальные — иллюстрации,
      сверка с планом ещё не завершена: где кадр и чертёж расходятся, верен чертёж. Под каждым кадром — его статус.
      В ленте — ${plural(R.ribbon.length, 'кадр', 'кадра', 'кадров')}.</p>
      <div class="g-ribbon">
      ${R.ribbon.map(f => `<a href="../../${f.src}" target="_blank" rel="noopener"><img src="../../${f.src}" alt="${esc(f.alt)}" width="${f.w}" height="${f.h}" loading="lazy" decoding="async"><span>${esc(f.alt.replace(`${a.name} — `, '').replace(', визуализация', ''))} · ${f.state === 'signed' ? 'подписан дизайнером' : f.state === 'prelim' ? 'ждёт подписи дизайнера' : 'иллюстрация · сверка с планом не завершена'}</span></a>`).join('\n      ')}
      </div>
    </div>
  </section>\n` : '';

  // «до/после»: обмер → мебель / декор, листы этого выпуска, обрезанные по контуру стен (tools/compare-pairs.js)
  const pairs = CMP.build(SITE, a.slug, r.sheets);
  const floors = [...new Set(pairs.map(p => p.floor))];
  const kinds = [...new Set(pairs.map(p => p.kind))];
  const KIND = { mebel: 'С мебелью', dekor: 'С <span class="cmp-long">текстилем и </span>декором' };
  const cmp = pairs.length ? `  <section class="blk" id="do-posle">
    <div class="wrap">
      <div class="cmp" data-cmp>
        <div class="cmp-head">
          <div class="kicker">До и после</div>
          <h2 class="cmp-title">${a.house ? 'Дом' : 'Квартира'} как есть — и как будет</h2>
          <p class="cmp-sub">Слева обмерный план этого объекта, справа — тот же план после проекта. Оба — листы этого альбома,
          совмещённые по контуру стен.</p>
          ${floors.length > 1 ? `<div class="cmp-floors" role="group" aria-label="Этаж">${floors.map((f, i) => `<button type="button" data-floor="${esc(f)}" aria-pressed="${i ? 'false' : 'true'}">${esc(f)}</button>`).join('')}</div>` : ''}
          <div class="cmp-row">
            ${kinds.length > 1 ? `<div class="cmp-seg" role="group" aria-label="Что показать после">${kinds.map((k, i) => `<button type="button" data-kind="${k}" aria-pressed="${i ? 'false' : 'true'}">${KIND[k]}</button>`).join('')}</div>` : '<span></span>'}
            <div class="cmp-seg" role="group" aria-label="Режим сравнения"><button type="button" data-mode="split" aria-pressed="true">Разделить</button><button type="button" data-mode="before" aria-pressed="false"><span class="cmp-long">Только </span>как есть</button><button type="button" data-mode="after" aria-pressed="false"><span class="cmp-long">Только </span>как будет</button></div>
          </div>
        </div>
        <div class="cmp-frame">
        ${pairs.map((p, i) => `<figure class="cmp-stage" id="${p.id}" data-floor="${esc(p.floor)}" data-kind="${p.kind}"${i ? ' hidden' : ''} style="--ar:${(p.after.w / p.after.h).toFixed(4)}">
          <img src="${p.after.src}" alt="${esc(a.name)} — ${esc(p.after.cap.toLowerCase())}" width="${p.after.w}" height="${p.after.h}" loading="lazy" decoding="async">
          <div class="cmp-b"><img src="${p.before.src}" alt="${esc(a.name)} — ${esc(p.before.cap.toLowerCase())}" width="${p.before.w}" height="${p.before.h}" loading="lazy" decoding="async"></div>
          <div class="cmp-h" role="slider" tabindex="0" aria-label="Сравнение: как есть и как будет" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><i aria-hidden="true"></i></div>
          <span class="cmp-l l">Как есть</span><span class="cmp-l r">Как будет</span>
        </figure>`).join('\n        ')}
          <button type="button" class="cmp-zoom" data-mode="full" aria-label="Открыть во весь экран" title="Открыть во весь экран"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/></svg></button>
          <div class="cmp-hint" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>Потяните для сравнения</div>
        </div>
        <div class="cmp-foot">
          <div>
          ${pairs.map((p, i) => `<p class="cmp-cap"${i ? ' hidden' : ''}><b>${esc(a.area)} | ${esc(a.name)}</b>${p.floor ? ' · ' + esc(p.floor) : ''}${p.before.scale ? ` · Масштаб листов ${esc(p.before.scale)}` : ''}<br>Слева — <a href="${rv(p.before.sheet)}" rel="nofollow">лист ${p.before.no}</a> «${esc(p.before.cap.replace(/^.*— /, ''))}», справа — <a href="${rv(p.after.sheet)}" rel="nofollow">лист ${p.after.no}</a> «${esc(p.after.cap.replace(/^.*— /, ''))}»</p>`).join('\n          ')}
          </div>
          <a class="cmp-cta" href="../../brief.html">Обсудить свой проект</a>
        </div>
      </div>
    </div>
  </section>
  <script src="../../js/compare.js?v=2" defer></script>\n` : '';

  const voice = `  <section class="blk" id="pravki">
    <div class="wrap">
      <div class="kicker">Правки</div>
      <h2>Как оставить правку голосом</h2>
      <p class="sub">Писать письма со списком замечаний не нужно — правка ставится прямо на лист, к нужному месту чертежа.</p>
      <ol class="g-steps">
        <li><b>Откройте лист</b><p>Любой лист ниже или в PDF для заказчика: на каждой странице есть кнопка «Правка к этому листу».</p></li>
        <li><b>Нажмите на место</b><p>На чертеже появится метка — к ней и относится правка: «диван развернуть к окну», «розетку выше».</p></li>
        <li><b>Скажите голосом</b><p>Или напишите. Правок к одному листу может быть сколько угодно, есть правка ко всему листу.</p></li>
        <li>${SHELL.TERMS.intake.reviewStep}</li>
      </ol>
      <div class="cta-row"><a class="btn" href="${rvAll}" rel="nofollow">🎤 Попробовать на этом альбоме</a>
        <a class="btn ghost" href="../../brief.html">Свой проект — заполнить бриф</a></div>
      <p class="hint" style="margin-top:14px">Если голосовой ввод в браузере не работает — нажмите микрофон на клавиатуре телефона.</p>
    </div>
  </section>\n`;

  // одна строка простыми словами вместо «Блокеров нет»: стоп-ошибки, замечания к доработке, вопросы к заказчику (лист «Открытые вопросы»)
  const Q = a.openQ;
  const check = `  <section class="blk">
    <div class="wrap">
      <div class="kicker">Что значит «проверено»</div>
      <h2>Автопроверка оформления — и чего она не заменяет</h2>
      <p class="sub"><b>Автопроверка оформления: ${plural(r.blockers, 'стоп-ошибка', 'стоп-ошибки', 'стоп-ошибок')}, ${plural(r.issues, 'замечание', 'замечания', 'замечаний')} к доработке${Q ? `, ${plural(Q.n, 'вопрос', 'вопроса', 'вопросов')} к заказчику — лист ${Q.no}` : ''}.</b></p>
      <div class="cards g3">
        <div class="card"><h3>Стоп-ошибка</h3>
          <p>То, с чем комплект не выдаётся: проём не помещается в стену, лист вылез за формат, жилая комната без окна.
          ${r.blockers ? 'Здесь она осталась открытой — ниже объяснено, какая.' : 'В этом выпуске таких нет.'}</p></div>
        <div class="card"><h3>Замечание к доработке</h3>
          <p>Программа нашла место, которое стоит улучшить: плотная надпись, неполная привязка, рекомендация по нормам.
          Это не стоп-ошибки, но и не «всё хорошо» — их закрывают при перевыпуске.</p></div>
        <div class="card"><h3>Вопрос к заказчику</h3>
          <p>Решение, которое без вас не принять: несущие стены, оборудование, модель мебели. Вопросы собраны на листе
          «Открытые вопросы»; пока они не закрыты, на каждом листе стоит пометка «ПРЕДВАРИТЕЛЬНО».</p></div>
      </div>
      <p class="g-note">Автопроверка смотрит оформление и явные нестыковки. Она не отвечает на главный вопрос — поймёт ли заказчик
      лист и сможет ли прораб по нему работать. Это проверяет автор, а окончательно — контрольный обмер и ваши ответы на вопросы.
      ${esc(SHELL.TERMS.prelim)}</p>
${r.blockers ? `      <p class="g-note">Стоп-ошибок на выдаче: ${r.blockers}. Это открытый вопрос по исходным данным, а не ошибка оформления:
      комплект не выдаётся, пока он не закрыт. Здесь альбом показан как рабочий пример — так выглядит выпуск до решения заказчика.</p>\n` : ''}    </div>
  </section>\n`;

  const body = `  <section class="blk" style="padding-top:0">
    <div class="wrap">
${a.preReview ? `      <p class="g-note" style="border-left:3px solid var(--gold);padding-left:14px;margin:0 0 22px"><b>Выпуск до разбора замечаний практика.</b>
      Этот альбом выпущен ${a.preReview} — до того, как практикующий проектировщик разобрал наши листы. Часть того, что он назвал
      неудобным для работы, — развёртки, план розеток и выключателей, ведомость дверей, колерная карта — здесь ещё в прежнем виде.
      Перевыпуск готовится; до него смотрите альбом как пример подачи, а не как образец рабочих листов.</p>\n` : ''}${hero}      <div class="stats" style="margin-top:40px">
        <div><b>${r.total}</b><span>${word(r.total, 'лист', 'листа', 'листов')} A3</span></div>
        <div><b>${a.area}</b><span>общая площадь по экспликации</span></div>
        <div><b>${a.rooms}</b><span>${word(a.rooms, 'помещение', 'помещения', 'помещений')}</span></div>
        <div><b>${groups.length}</b><span>${word(groups.length, 'раздел', 'раздела', 'разделов')} комплекта</span></div>
        ${R.signed ? `<div><b>${R.signed}</b><span>${word(R.signed, 'кадр сверен', 'кадра сверены', 'кадров сверены')} с планом и подписаны дизайнером</span></div>` : ''}
        ${R.prelim ? `<div><b>${R.prelim}</b><span>${word(R.prelim, 'кадр ждёт', 'кадра ждут', 'кадров ждут')} подписи дизайнера</span></div>` : ''}
      </div>
${areaNote}${prelim}${pdf}    </div>
  </section>

${cmp}${ribbon}${voice}${check}${honesty}
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
        <div><b>~5 мин</b><span>бриф: план, картинки, пара слов</span></div>
        <div><b>от ${SHELL.TERMS.rate('proekt')}</b><span>минимальный заказ ${SHELL.TERMS.minSum('proekt')}</span></div>
        <div><b>до ${a.house ? 72 : 48} ч</b><span>первый вариант ${a.house ? 'проекта дома' : 'проекта квартиры'} — от оплаты и получения плана с размерами</span></div>
      </div>
      <p class="g-note">${SHELL.TERMS.start}: <a href="../../oplata/">как платить</a>, ${SHELL.ofertaRef('../../', 'договоре-оферте', { before: 'условия — в ' })}.
      Соседние работы — в <a href="../../portfolio-hub/">портфолио</a>, как устроена проверка — в разделе <a href="../../gost/">«Документация»</a>.</p>
    </div>
  </section>

${blocks}
`;

  const coverJpg = `assets/portfolio/${a.slug}-hero.jpg`;
  const ogImg = R.hero && R.hero.kind !== 'sheet' ? R.hero.src : fs.existsSync(path.join(SITE, coverJpg)) ? coverJpg : null;
  // title: «Дизайн-проект квартиры 58 м² в скандинавском стиле — 64 листа по ГОСТ | LINEA». Площадь — та же, что в названии
  // (H1), чтобы title не спорил с заголовком; если в названии её нет — общая по экспликации, округлённо.
  const areaN = +a.area.replace(/[^\d,]/g, '').replace(',', '.');
  const declN = +((a.name.match(/(\d+) м²/) || [])[1] || 0);
  const what = `Дизайн-проект ${a.house ? 'дома' : 'квартиры'} ${declN || Math.round(areaN)} м²`;
  const sheetsT = `${plural(r.total, 'лист', 'листа', 'листов')} по ГОСТ`;
  const title = fit([
    `${what} ${card.inStyle || ''} — ${sheetsT} | LINEA`,
    `${what} ${card.inStyle || ''} — ${sheetsT}`,
    `${what} — ${sheetsT} | LINEA`,
  ], 70, `${a.slug} title`);
  // description: законченная фраза ≤ 158 знаков. Если площадь в названии заявленная — в описании прямо «по экспликации».
  const areaT = declN && Math.abs(declN - areaN) > 1.5 ? `площадь по экспликации ${a.area}` : `общая площадь ${a.area}`;
  const one = R.signed % 10 === 1 && R.signed % 100 !== 11;
  const visT = R.signed ? `, ${plural(R.signed, 'визуализация', 'визуализации', 'визуализаций')} ${one ? 'сверена' : 'сверены'} с планом` : '';
  const head = `${a.name.replace(/ · .*$/, '').replace(/, .*$/, '')}${card.inStyle ? ` ${card.inStyle}` : ''}`;
  const desc = fit([
    `${head}: ${plural(r.total, 'лист', 'листа', 'листов')} A3 по ГОСТ, ${areaT}${visT}. Альбом для заказчика и полный альбом в PDF, правки голосом на листах.`,
    `${head}: ${plural(r.total, 'лист', 'листа', 'листов')} A3 по ГОСТ, ${areaT}${visT}. Два PDF и правки голосом на листах.`,
    `${head}: ${plural(r.total, 'лист', 'листа', 'листов')} A3 по ГОСТ, ${areaT}. Два PDF и правки голосом на листах.`,
  ], 158, `${a.slug} description`);
  return page({
    object: a.house ? 'house' : 'flat',
    file: `portfolio/${a.slug}/index.html`,
    title,
    desc,
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
      // Offer: цена «от» = минимальный заказ, ставка за м² — в priceSpecification (site-shell.js → TERMS.offers)
      offers: SHELL.TERMS.offers(a.house ? 'Дизайн-проект дома' : 'Дизайн-проект квартиры', `${BASE}/brief.html`),
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
          ${h ? pic(h, '../', `loading="lazy" decoding="async"${h.kind === 'sheet' ? ' class="sheet"' : ''}`) : ''}
          <div class="tile-body">
            <span class="tag">${esc(c.type || '')}${c.style ? ` · ${esc(c.style)}` : ''}</span>
            <b>${esc(a.name)}</b>
            <span class="tile-lead">${esc(a.lead)}</span>
            <div class="tile-figs"><i><b>${r.total}</b>${word(r.total, 'лист', 'листа', 'листов')}</i><i><b>${a.area.replace(' м²', '')}</b>м²</i><i><b>${a.rooms}</b>${word(a.rooms, 'помещение', 'помещения', 'помещений')}</i></div>
            <span class="more">Смотреть листы →</span>
          </div>
        </a>`;
  }).join('\n');
  const blockers = releases.reduce((s, x) => s + x.r.blockers, 0);
  const body = `  <section class="blk">
    <div class="wrap">
      <div class="kicker">Что получаете на руки</div>
      <div class="cards g3">
        <div class="card"><h3>Заказчику</h3><p>Альбом для заказчика: план мебели с размерами, визуализации перед развёртками своих стен,
          цвета и материалы с образцами. По нему видно, что и где будет, и есть что обсудить.</p></div>
        <div class="card"><h3>Прорабу — после обмера</h3><p>Полный альбом: обмерный план, демонтаж и монтаж, электрика со щитом, вода,
          потолки, плитка, отделка, развёртки и смета. До ответов на открытые вопросы и контрольного обмера он предварительный.</p></div>
        <div class="card"><h3>Список того, что решить</h3><p>Лист «Открытые вопросы» и задание на контрольный обмер: что уточнить у вас,
          что померить на объекте. Пока там что-то открыто, на каждом листе стоит пометка «ПРЕДВАРИТЕЛЬНО».</p></div>
      </div>
      <p class="g-note">Примеры ниже: ${plural(totalSheets, 'лист', 'листа', 'листов')} в ${NUM_IN[releases.length] || releases.length} альбомах, каждый можно открыть целиком.</p>
    </div>
  </section>

  <section class="blk">
    <div class="wrap">
      <div class="kicker">Как это устроено</div>
      <h2>Программа чертит, автор проверяет решения</h2>
      <p class="sub">Объект описывается один раз: размеры помещений, высоты, окна и двери, мебель, розетки и сантехника, отделка.
      Из этого программа строит все листы, а автопроверка оформления смотрит, не вылезло ли что-то за формат и не спорят ли листы
      между собой. Автопроверка не отвечает на главный вопрос — поймёт ли заказчик лист и сможет ли прораб по нему работать;
      на него отвечают автор, ваши ответы на открытые вопросы и контрольный обмер.</p>
      <div class="cards g3">
        <div class="card"><div class="num">01</div><h3>Данные вместо картинок</h3>
          <p>Лист нельзя поправить руками в файле: он строится из данных объекта. Поменялась планировка —
          пересобрался весь альбом, и смета вместе с ним.</p></div>
        <div class="card"><div class="num">02</div><h3>Замечание — с адресом</h3>
          <p>Что нашла автопроверка, выводится с адресом: лист, элемент, что не так. Это помогает не пропустить мелочь,
          но не заменяет взгляд проектировщика на смысл листа.</p></div>
        <div class="card"><div class="num">03</div><h3>Стоп-ошибки не уходят в печать</h3>
          <p>Проём не помещается в стену, содержимое вылезло за край листа — выпуск останавливается.
          Стоп-ошибок на выдаче во всех ${NUM_IN[releases.length] || releases.length} альбомах: ${blockers}${blockers ? ` (${releases.filter(x => x.r.blockers).map(x => x.a.short).join(', ')})` : ''}.
          Замечания к доработке и вопросы к заказчику при этом остаются — их число стоит на странице каждого альбома.
          Подписей проверяющего и нормоконтролёра на листах нет — об этом ниже, в разделе о честности выпуска.</p></div>
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
      <p class="sub">Это листы выпуска как есть: со штампом, размерами, ведомостями и примечаниями. Новые проекты — первыми.
      ${releases.some(x => x.a.preReview) ? 'Альбомы выпущены до разбора замечаний практикующего проектировщика (22.10.2026); перевыпуск готовится.' : ''}</p>
      <div class="tiles">
${cards}
      </div>
    </div>
  </section>
`;

  return page({
    file: 'gost/index.html',
    title: 'Рабочая документация по ГОСТ — как собирается альбом | LINEA',
    desc: fit([
      `Альбомы на квартиру: ${range(Math.min(...releases.map(x => x.r.total)), Math.max(...releases.map(x => x.r.total)), 'лист', 'листа', 'листов')} A3, `
        + `что получает заказчик и прораб, что значит пометка «предварительно». ${plural(releases.length, 'альбом', 'альбома', 'альбомов')} открыты целиком.`,
      `Альбомы на квартиру: ${range(Math.min(...releases.map(x => x.r.total)), Math.max(...releases.map(x => x.r.total)), 'лист', 'листа', 'листов')} A3. Альбомы открыты целиком.`,
    ], 158, 'gost/ description'),
    h1: 'Рабочая документация по ГОСТ',
    lead: 'Комплект рабочей документации на квартиру: планировки, развёртки стен, электрика со щитом, '
      + 'вода и канализация, отопление и вентиляция, потолки с узлами, раскладка плитки, отделка, '
      + 'встроенная мебель и смета. Показанные альбомы — предварительные: пока открыты вопросы к заказчику и не сделан контрольный обмер, по ним не строят.',
    crumb: [['Документация', null]],
    body,
    ogImage: (sorted.find(x => x.a.renders.hero && x.a.renders.hero.kind === 'render') || { a: { renders: { hero: {} } } }).a.renders.hero.src,
    u: '../',
    jsonld: [crumbsLd([['LINEA', `${BASE}/`], ['Документация', `${BASE}/gost/`]])],
  });
}

// открытые вопросы к заказчику — число из сводки, напечатанной на листе «Открытые вопросы» (как читает мастер)
function openQuestions(slug, r) {
  const sh = r.sheets.find(x => /^Открытые вопросы/.test(x.title));
  if (!sh) return null;
  const svg = fs.readFileSync(path.join(SITE, 'portfolio', slug, 'sheets', sh.file), 'utf8');
  const m = svg.match(/открытых вопросов — (\d+)/);
  return m ? { n: +m[1], no: (sh.file.match(/^(\d+)/) || [])[1] } : null;
}
// выпуск сделан до разбора практика (22.10.2026, docs/reviews/2026-10-22-andrey-revit.md в gost-draft)? Дата — коммит листов;
// листы изменены и не закоммичены (свежий sync) — выпуск новый. Возвращает дату «ДД.ММ.ГГГГ» или ''.
const PRACTICE_REVIEW = '2026-10-23';
function preReview(slug) {
  const rel = path.join('site', 'portfolio', slug, 'sheets');
  const git = args => { try { return require('child_process').execFileSync('git', args, { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim(); } catch { return ''; } };
  if (git(['status', '--porcelain', '--', rel])) return '';
  const d = git(['log', '-1', '--format=%cs', '--', rel]);
  return d && d < PRACTICE_REVIEW ? d.split('-').reverse().join('.') : '';
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
  // площадь в названии — общая по экспликации, округлённо (заявленная заказчиком — один раз, в пояснении «Про площадь»)
  const A = String(Math.round(+a.area.replace(/[^\d,]/g, '').replace(',', '.')));
  a.name = a.name.replace('{A}', A); a.short = a.short.replace('{A}', A);
  a.openQ = openQuestions(a.slug, r);
  a.preReview = preReview(a.slug);
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
    blockers: r.blockers, issues: r.issues, openQ: a.openQ, preReview: a.preReview, hero: a.renders.hero || null,
    visuals: a.renders.signed, visualsPrelim: a.renders.prelim,
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
for (const { a, r } of releases) console.log(`  ${a.slug}: ${r.total} листов, блокеров ${r.blockers}, вопросов и рекомендаций ${r.issues}; кадров подписано ${a.renders.signed}, ждут подписи ${a.renders.prelim}, не на сайте ${a.renders.rejected}, в ленте ${a.renders.ribbon.length}, заглавный — ${a.renders.hero ? a.renders.hero.kind : 'нет'}`);
