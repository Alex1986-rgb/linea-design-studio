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
    name: 'Дом 331 м² с мансардой и гаражом',
    short: 'двухэтажный дом с мансардой',
    lead: 'Частный дом: 1-й этаж — гостиная с камином, кухня-столовая, кабинет, веранда, гараж и котельная; мансарда — '
      + 'четыре спальни, гардеробная, санузлы и спортзона в холле. Современная классика со скандинавским светом.',
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

// группировка листов по разделам в порядке появления
function bySection(sheets) {
  const order = [], map = new Map();
  for (const s of sheets) {
    const sec = SECTION_OF[s.owner] || 'Прочие листы';
    if (!map.has(sec)) { map.set(sec, []); order.push(sec); }
    map.get(sec).push(s);
  }
  return order.map(sec => ({ sec, items: map.get(sec) }));
}

function page({ file, title, desc, h1, crumb, lead, body, u, jsonld }) {
  const ld = (jsonld || []).map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');
  return `<!DOCTYPE html>
<html lang="ru">
<head>
${SHELL.head(u, { title, desc, canonical: `${BASE}/${file.replace(/index\.html$/, '')}`, ogTitle: h1, ogDesc: lead })}
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
${SHELL.ctaBlock(u, 'gost')}
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
  // список листов для страницы правок голосом (review.html): клиент открывает лист, ставит метку и надиктовывает правку
  w(`portfolio/${a.slug}/sheets.json`, JSON.stringify(r.sheets.map(sh => ({ file: sh.file, title: sh.title, no: (sh.file.match(/^(\d+)/) || [])[1] ? +sh.file.match(/^(\d+)/)[1] : null }))));
  const rv = f => `../../review.html?p=${a.slug}&amp;s=${encodeURIComponent(f)}`;

  const blocks = groups.map(g => `  <section class="blk" id="${slugify(g.sec)}">
    <div class="wrap">
      <div class="kicker">Раздел</div>
      <h2>${esc(g.sec)}</h2>
      <p class="sub">Листов в разделе: ${g.items.length}</p>
      <div class="plates">
      ${g.items.map(sh => `<a class="plate" href="${rv(sh.file)}" title="Открыть лист и оставить правку голосом">
        <span class="plate-img"><img loading="lazy" src="sheets/${encodeURIComponent(sh.file)}" alt="${esc(sh.title)}"></span>
        <span class="plate-cap"><i>${esc(sh.file.replace(/^(\d+).*$/, 'Лист $1'))}</i>${esc(sh.title)}</span>
      </a>`).join('\n      ')}
      </div>
    </div>
  </section>`).join('\n');

  // два PDF: полный альбом (рабочая документация с проверкой) и выпуск «студия» для заказчика (по эталонам студийных проектов)
  const has = f => fs.existsSync(path.join(SITE, 'portfolio', a.slug, f));
  const pdf = has('album.pdf') || has('studio.pdf')
    ? `      <div class="cta-row" style="margin-top:26px">${has('album.pdf') ? `<a class="btn" href="album.pdf" download>Полный альбом PDF · ${a.pdfSize}</a>` : ''}
        ${has('studio.pdf') ? `<a class="btn" href="studio.pdf" download>Альбом для заказчика PDF · ${a.studioSize}</a>` : ''}
        <a class="btn ghost" href="../../review.html?p=${a.slug}">🎤 Проверить листы и надиктовать правки</a>
        <a class="btn ghost" href="../../brief.html">Собрать такой же — бриф</a></div>
      <p class="sub" style="margin-top:12px">Альбом для заказчика — тот же проект в подаче студии: визуализации стоят перед
      развёртками своих помещений, у мебели на плане выноски с размерами, узлы стены — рядом с её развёрткой.</p>\n`
    : '';

  const body = `  <section class="blk">
    <div class="wrap">
      <div class="stats">
        <div><b>${r.total}</b><span>${word(r.total, 'лист', 'листа', 'листов')} A3</span></div>
        <div><b>${a.area}</b><span>площадь</span></div>
        <div><b>${a.rooms}</b><span>помещений</span></div>
        <div><b>${r.blockers}</b><span>${word(r.blockers, 'блокер', 'блокера', 'блокеров')} проверки движка</span></div>
        <div><b>${r.issues}</b><span>${word(r.issues, 'замечание', 'замечания', 'замечаний')} проверки в выпуске</span></div>
        <div><b>${groups.length}</b><span>разделов комплекта</span></div>
      </div>
${pdf}${r.blockers ? `      <p class="sub" style="margin-top:18px">Блокеров на выдаче: ${r.blockers}. Это открытые вопросы
      по исходным данным, а не ошибки оформления: проверка движка держит комплект невыданным, пока они не закрыты.
      Здесь альбом показан как рабочий пример — так выглядит выпуск до контрольного обмера.</p>\n` : ''}    </div>
  </section>

${honesty}
  <section class="blk">
    <div class="wrap">
      <div class="kicker">Состав</div>
      <h2>Что внутри альбома</h2>
      <p class="sub">Шифр комплекта ${esc(a.code)}. Листы идут в том же порядке, что в выданном альбоме:
      титульный лист, общие данные с ведомостью чертежей, дальше разделы по специальностям.</p>
      <div class="cards g3">
        ${groups.map(g => `<div class="card"><h3>${esc(g.sec)}</h3><p>${plural(g.items.length, 'лист', 'листа', 'листов')}</p></div>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="blk">
    <div class="wrap">
      <div class="kicker">Условия</div>
      <h2>Сколько стоит и сколько ждать</h2>
      <div class="stats">
        <div><b>24–48 ч</b><span>срок выпуска комплекта</span></div>
        <div><b>0 ₽</b><span>на время открытого теста</span></div>
        <div><b>${r.total}</b><span>листов в этом альбоме</span></div>
      </div>
      <p class="sub">Тот же комплект на вашей геометрии — позиция каталога
      <a href="../../catalog/rabochaya-dokumentatsiya.html">«Только рабочая документация»</a>.
      Соседние работы — в <a href="../../portfolio-hub/">портфолио</a> и в разделе
      <a href="../../gost/">«Документация»</a>.</p>
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

${blocks}
`;

  return page({
    file: `portfolio/${a.slug}/index.html`,
    title: `${a.name} — рабочая документация | LINEA`,
    desc: `${a.name}: комплект рабочей документации на ${plural(r.total, 'лист', 'листа', 'листов')} A3, ${groups.length} разделов, `
      + `проверка движка: блокеров ${r.blockers}, замечаний ${r.issues}. Комплект предварительный — до контрольного обмера. Каждый лист можно рассмотреть целиком.`,
    h1: a.name,
    lead: a.lead,
    crumb: [['Документация', '../../gost/'], [a.name, null]],
    body,
    u: '../../',
    jsonld: [crumbsLd([
      ['LINEA', `${BASE}/`],
      ['Документация', `${BASE}/gost/`],
      [a.name, `${BASE}/portfolio/${a.slug}/`],
    ]), {
      '@context': 'https://schema.org', '@type': 'Service',
      name: 'Рабочая документация по ГОСТ', serviceType: 'Дизайн-проект: рабочая документация',
      provider: { '@type': 'Organization', name: 'LINEA', url: `${BASE}/` },
      areaServed: 'RU',
      offers: {
        '@type': 'Offer', price: '0', priceCurrency: 'RUB', availability: 'https://schema.org/InStock',
        url: `${BASE}/catalog/rabochaya-dokumentatsiya.html`,
        description: 'Открытое тестирование: комплект рабочей документации выпускается бесплатно, срок 24–48 часов',
      },
    }],
  });
}

// ---------- страница раздела ----------
function hubPage(releases, honesty) {
  const totalSheets = releases.reduce((s, x) => s + x.r.total, 0);
  const cards = releases.map(({ a, r }) => `        <a class="tile plain" href="../portfolio/${a.slug}/">
          <div class="tile-body">
            <span class="tag">${plural(r.total, 'лист', 'листа', 'листов')} A3</span>
            <b>${esc(a.name)}</b>
            <span class="tile-lead">${esc(a.lead)}</span>
            <div class="tile-figs"><i><b>${a.area}</b>площадь</i><i><b>${a.rooms}</b>помещений</i><i><b>${r.blockers}</b>блокеров</i></div>
            <span class="more">Смотреть листы →</span>
          </div>
        </a>`).join('\n');

  const body = `  <section class="blk">
    <div class="wrap">
      <div class="stats">
        <div><b>${RULES}</b><span>правил проверки выпуска</span></div>
        <div><b>26</b><span>специальностей в команде</span></div>
        <div><b>${totalSheets}</b><span>${word(totalSheets, 'лист', 'листа', 'листов')} в ${releases.length === 2 ? 'двух' : releases.length === 3 ? 'трёх' : releases.length === 4 ? 'четырёх' : releases.length} альбомах</span></div>
        <div><b>${releases.reduce((s, x) => s + x.r.blockers, 0)}</b><span>${word(releases.reduce((s, x) => s + x.r.blockers, 0), 'блокер', 'блокера', 'блокеров')} на выдаче</span></div>
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
          Блокеров на выдаче: ${releases.map(x => `${x.a.short} — ${x.r.blockers}`).join('; ')}. Замечания проверки блокерами не являются и остаются в выпуске: ${releases.map(x => `${x.a.short} — ${x.r.issues}`).join('; ')}.
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
      <p class="sub">Это не картинки для сайта, а листы выпуска: со штампом, размерными цепочками, ведомостями
      и примечаниями. Комплекты предварительные: на листах напечатано «не для производства работ».</p>
      <div class="tiles">
${cards}
      </div>
    </div>
  </section>
`;

  return page({
    file: 'gost/index.html',
    title: 'Рабочая документация по ГОСТ — как собирается альбом | LINEA',
    desc: `Комплект рабочей документации на квартиру: ${Math.min(...releases.map(x => x.r.total))}–${Math.max(...releases.map(x => x.r.total))} листов A3, 26 специальностей, ${RULES} правил `
      + `проверки с пунктами ГОСТ и СП. ${plural(releases.length, 'альбом', 'альбома', 'альбомов')} можно посмотреть целиком.`,
    h1: 'Рабочая документация по ГОСТ',
    lead: 'Комплект рабочей документации на квартиру: планировки, развёртки стен, электрика со щитом, '
      + 'вода и канализация, отопление и вентиляция, потолки с узлами, раскладка плитки, отделка, '
      + 'встроенная мебель и смета. Показанные альбомы — предварительные: до контрольного обмера по ним не работают.',
    crumb: [['Документация', null]],
    body,
    u: '../',
    jsonld: [crumbsLd([['LINEA', `${BASE}/`], ['Документация', `${BASE}/gost/`]])],
  });
}

// ---------- сборка ----------
const mb = f => (fs.existsSync(f) ? `${Math.round(fs.statSync(f).size / 1024 / 1024)} МБ` : '');
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
for (const { a, r } of releases) console.log(`  ${a.slug}: ${r.total} листов, блокеров ${r.blockers}, замечаний ${r.issues}`);
