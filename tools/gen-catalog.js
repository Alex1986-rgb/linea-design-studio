#!/usr/bin/env node
'use strict';
/**
 * Каталог услуг студии: site/catalog/index.html + site/catalog/<slug>.html
 *
 *   node tools/gen-catalog.js
 *
 * Каталог описывает только то, что студия действительно выпускает: состав разделов
 * и число листов читаются из альбомов нового формата (site/portfolio/gost-*,
 * tools/gost-facts.js). Цены не выдумываем: проект начинается после оплаты, цена — из site-shell.js → TERMS
 * (пока Александр её не задал — «по брифу, до начала работы», и Offer без цены не выводится).
 * Срок везде один и берётся из site-shell.js → TERMS (days / daysFrom): 1–3 суток от оплаты и получения плана с размерами.
 */

const fs = require('fs');
const path = require('path');
const SHELL = require('./site-shell.js');
const G = require('./gost-facts.js');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const { BASE, AUTHOR, esc, TERMS } = SHELL;

/* ------------------------------------------------------------------ факты из альбомов */
const A = G.all();
// кадры, сверенные с планом и подписанные дизайнером, по всем проектам — [src, подпись]; статус пишет gen-gost-pages.js в _renders.json
const SIGNED = A.flatMap(f => {
  let r = null; try { r = JSON.parse(fs.readFileSync(path.join(SITE, 'portfolio', f.slug, '_renders.json'), 'utf8')); } catch { return []; }
  return [r.hero, ...(r.ribbon || [])].filter(x => x && x.state === 'signed').map(x => [x.src, x.alt]);
});
const FLATS = A.filter(f => !f.house);
const minOf = (list, fn) => Math.min(...list.map(fn));
const maxOf = (list, fn) => Math.max(...list.map(fn));
const cnt = re => f => f.list.filter(s => re.test(s.file)).length;
const MIN_FLAT = minOf(FLATS, f => f.sheets);
// «только рабочая документация» — тот же рабочий альбом, поэтому и минимум тот же: по фактическим выпускам
const MIN_DOCS = MIN_FLAT;
const PLAN = [minOf(A, cnt(/-(architect|interior)-/)), maxOf(A, cnt(/-(architect|interior)-/))];
const EST = [minOf(A, cnt(/-(estimator|colorist)-/)), maxOf(A, cnt(/-(estimator|colorist)-/))];
const COMP_FLAT = G.composition(f => !f.house);
const { word, gen } = G;
const LISTOV = n => gen(n, 'листа', 'листов');                 // «от 61 листа», «от 64 листов»
const RANGE = (a, b) => `${a}–${b} ${word(b, 'лист', 'листа', 'листов')}`;
const D = (s, where) => G.desc(s, 'catalog/' + where);

/* ------------------------------------------------------------------ каркас */
// cta — свой призыв у страницы услуги [заголовок, текст]; без него — общий блок каркаса
const ctaOwn = (cta) => `<section class="blk cta-blk">
  <div class="wrap">
    <div class="kicker">Дальше</div>
    <h2>${esc(cta[0])}</h2>
    <p class="sub">${esc(cta[1])}</p>
    <div class="cta-row">
      <a class="btn" href="../brief.html">Бриф на квартиру — ${TERMS.brief.time}</a>
      <a class="btn ghost" href="../portfolio/gost-lineademo/">Альбом квартиры 56 м²</a>
    </div>
  </div>
</section>`;
function shell({ file, title, desc, h1, crumb, lead, body, jsonld, ogImage, cta }) {
  const canonical = `${BASE}/${file.replace(/index\.html$/, '')}`;
  const ld = (jsonld || []).map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');
  const head = SHELL.head('../', { title, desc, canonical, ogTitle: String(h1).replace(/<[^>]*>/g, ''), ogDesc: String(lead).replace(/<[^>]*>/g, '') })
    .replace(`${BASE}/assets/hero.jpg`, `${BASE}/${ogImage || 'assets/hero.jpg'}`);
  return `<!DOCTYPE html>
<html lang="ru">
<head>
${head}
${ld}
</head>
<body>
${SHELL.beta('../')}

${SHELL.header('../', 'catalog')}
${SHELL.crumbsAuto('../', 'catalog', file === 'catalog/index.html' ? null : String(h1).replace(/<[^>]*>/g, ''))}

<section class="blk hero-page">
  <div class="wrap">
    <div class="kicker">${crumb}</div>
    <h1>${h1}</h1>
    <p class="lead-page">${lead}</p>
  </div>
</section>

${body}

${cta ? ctaOwn(cta) : SHELL.ctaBlock('../', 'catalog')}

${SHELL.sticky('../')}

${SHELL.footer('../', 'catalog')}
</body>
</html>
`;
}

/* ------------------------------------------------------------------ общие блоки */
// состав комплекта — по фактическим разделам альбомов нового формата
const compRows = (comp, skip = []) => comp.filter(c => !skip.includes(c.role)).map(c => {
  const titles = c.titles.filter(x => x.k >= Math.min(5, c.albums)).map(x => x.t);
  const extra = c.titles.filter(x => x.k < Math.min(5, c.albums)).map(x => x.t);
  return `      <tr><td>${esc(c.name)}</td><td>${esc(titles.join('; '))}${extra.length ? `<br><span class="hint">по объекту: ${esc(extra.join('; ').toLowerCase())}</span>` : ''}</td><td>${c.min === c.max ? c.min : `${c.min}–${c.max}`}</td></tr>`;
}).join('\n');
const compTable = (comp, extraRows, hint) => `<div class="scroll-x">
    <table class="tbl">
      <tr><th>Раздел</th><th>Листы раздела</th><th>Листов в&nbsp;наших альбомах</th></tr>
${compRows(comp)}
${(extraRows || []).map(r => `      <tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2] || '')}</td></tr>`).join('\n')}
    </table>
    </div>
    <p class="hint" style="margin-top:12px">${hint}</p>`;

const hows = term => [
  [`Бриф — ${TERMS.brief.time}`, 'Три шага: загружаете план, картинки, которые нравятся, и пару слов о том, как живёте, — можно надиктовать. Анкеты и обязательного выбора стиля нет.'],
  ['Цена и оплата — до начала работы', 'Смотрим бриф, задаём вопросы, считаем сумму по вашей площади: ставка за м² фиксирована, минимальный заказ — как за 40 м². Работа начинается после оплаты. Чего нет в исходных данных — не выдумываем, а записываем допущением.'],
  [`Два альбома — ${term}`, 'Полный по ГОСТ и альбом для заказчика с визуализациями ключевых стен. Отсчёт — от оплаты и плана с размерами. Если остались вопросы к вам или нужен обмер, альбом выходит с пометкой «ПРЕДВАРИТЕЛЬНО»; после ваших ответов и обмера перевыпускаем — тоже за ' + TERMS.days + '.'],
  ['Правки — голосом на листе', 'Открываете лист на сайте или жмёте «Правка к этому листу» в PDF, ставите метку на чертеже и говорите, что поменять. Альбом перевыпускается целиком.'],
];

// второй выпуск — для заказчика: визуализации и кнопка правки на каждом листе (studio.pdf в папке альбома)
const STUDIO_ROW = ['Альбом для заказчика', 'отдельный PDF: визуализации ключевых стен перед листами их развёрток, план мебели с размерами изделий; на каждом листе — кнопка «Правка к этому листу»', 'PDF'];

const examples = (slugs, first, sub) => `<section class="blk">
  <div class="wrap">
    <div class="kicker">Примеры</div>
    <h2>Посмотрите на реальных альбомах</h2>
    <p class="sub">${sub || 'Альбомы открыты целиком: каждый лист увеличивается, к любому можно оставить правку голосом — так же будет и с вашим проектом.'}</p>
    <div class="tiles">
${slugs.map(s => '      ' + G.tile('../', G.get(s))).join('\n')}
    </div>
${first ? `    <p class="hint" style="margin-top:16px">${first}</p>\n` : ''}  </div>
</section>`;

/* ------------------------------------------------------------------ услуги */
const SERVICES = [
  {
    slug: 'dizayn-proekt-kvartiry', name: 'Дизайн-проект квартиры',
    tag: 'Основная услуга', term: TERMS.days, vol: `от ${LISTOV(MIN_FLAT)} A3`, house: false,
    desc: `Дизайн-проект квартиры: альбом чертежей и альбом для заказчика. Цена ${TERMS.fromLine}; срок — ${TERMS.daysFrom}.`,
    termNote: 'от оплаты и плана с размерами', termFull: `Проект квартиры — ${TERMS.daysFrom}`,
    cover: 'assets/refs/retro-103-living-wA.jpg',
    lead: 'Два альбома на вашу квартиру: полный по ГОСТ — сначала предварительный, после ваших ответов и обмера по нему строят и закупают — и альбом для заказчика с визуализациями. Правки — голосом прямо на листах.',
    forWhom: ['новостройка без отделки или вторичка под полный ремонт', 'есть план с размерами — от застройщика, из БТИ или снятый рулеткой', 'нужен полный комплект чертежей и смета, а не только красивые картинки'],
    table: () => compTable(COMP_FLAT, [STUDIO_ROW], `Таблица собрана из ${gen(FLATS.length, 'альбома', 'альбомов')} квартир, выпущенных студией: названия листов и их число — как в выпусках. Больше комнат — больше развёрток и изделий мебели; санузел с ванной и душем даёт отдельные листы раскладки плитки.`),
    steps: [
      [`Бриф — ${TERMS.brief.time}`, 'План от застройщика или БТИ (можно сфотографировать), картинки, которые нравятся, и пара слов голосом или текстом: кто живёт, что мешает сейчас, что обязательно нужно.'],
      ['Вопросы по плану — в тот же день', 'Сверяем размеры с планом, уточняем стояки, вентканалы и тип дома. Чего не знаем — записываем допущением, а не угадываем.'],
      ['Цена и оплата', `${TERMS.line}. Работа начинается после оплаты.`],
      [`Два альбома — ${TERMS.days}`, 'Полный альбом квартиры и альбом для вас с визуализациями. Отсчёт — от оплаты и плана с размерами. Если остались вопросы к вам или нужен обмер, первый выпуск — предварительный.'],
      ['Правки на листах', 'Метка на плане кухни или на развёртке спальни, пара фраз голосом — и квартира перевыпускается целиком, со сметой.'],
    ],
    faq: [
      [`За какой срок будет готов проект?`, `${TERMS.term[0].toUpperCase() + TERMS.term.slice(1)}. Это полный комплект — альбом по ГОСТ и альбом для заказчика, собранные по вашему брифу. Отсчёт идёт от оплаты и получения плана с размерами; дальше — ваши правки, ответы на открытые вопросы, обмер и перевыпуск.`],
      ['Как вносить правки?', 'Откройте лист на сайте или нажмите «Правка к этому листу» в PDF — она есть на каждой странице альбома для заказчика. Поставьте метку на чертеже и скажите, что поменять. Правки собираются в один список и уходят нам одним сообщением.'],
      ['А если обмера нет?', 'Начнём по плану застройщика или даже по картинке. Чего нет в исходных данных, программа не придумывает: записывает допущением в реестр открытых вопросов и печатает задание на контрольный обмер. До обмера альбом помечен «предварительно».'],
      ['Во что обойдётся проект квартиры?', `${TERMS.line}. Сумма — ставка × площадь, не меньше минимального заказа. Проект начинается после оплаты; условия и возврат — в договоре-оферте.`],
    ],
    ex: ['gost-lineademo', 'gost-retro103', 'gost-proekt2', 'gost-modern4k'],
    exSub: 'Четыре квартиры — от 56 м² до двух квартир, объединённых в одну. Каждый лист открывается крупно, к любому можно оставить правку голосом.',
    cta: ['Ваша квартира — следующая', 'Расскажите о квартире голосом и приложите план — назовём цену до начала работы, а оба альбома придут за ' + TERMS.daysFrom + '.'],
    first: 'Архив: демо-квартира первой версии программы (август 2026) — <a href="../portfolio/demo/presentation.html" rel="nofollow">30 листов</a>, визуализации там с планом не сверены. Тот же бриф в новом формате — <a href="../portfolio/gost-lineademo/">' + G.plural(G.get('gost-lineademo').sheets, 'лист', 'листа', 'листов') + '</a>.',
    caseLink: ['../cases/kvartira-56.html', 'Кейс: квартира 56 м², джапанди'],
  },
  {
    slug: 'rabochaya-dokumentatsiya', name: 'Только рабочая документация',
    tag: 'Если концепция уже есть', term: TERMS.days, vol: `от ${LISTOV(MIN_DOCS)} A3`,
    desc: `Рабочая документация по ГОСТ на вашу готовую концепцию: развёртки, электрика, узлы, мебель на заказ и смета. Срок — ${TERMS.daysShort}.`,
    termNote: 'от оплаты и плана', termFull: `От оплаты и получения плана с размерами — ${TERMS.days}`,
    cover: 'assets/refs/kv-3k-kitchen.jpg',
    lead: 'Планировка и картинки у вас уже есть, но строить по ним нельзя: нет развёрток, электрики с привязками, узлов, а смета — «на глаз». Достраиваем рабочую часть по ГОСТ на вашей геометрии; цена — по брифу.',
    forWhom: ['концепция согласована, и менять её вы не хотите', 'бригада отказывается работать «по картинкам»', 'нужна документация под закупку, смету и мебель на заказ'],
    includes: [
      ['Архитектурные решения', 'обмерный план, демонтаж и монтаж перегородок, двери с ведомостью проёмов, задание на контрольный обмер'],
      ['Развёртки и узлы', 'развёртки стен каждого помещения, схема их расположения, узлы'],
      ['Электрика', 'розетки и электровыводы, освещение, выключатели и схема включения, однолинейная схема щита, трассы, слаботочные сети'],
      ['Вода, тепло, воздух', 'выводы сантехники, схема разводки водопровода и канализации, планы вентиляции и отопления'],
      ['Потолки, полы, плитка', 'план потолков, план и конструкции полов, раскладка плитки по полам и стенам мокрых зон'],
      ['Мебель на заказ', 'схема встроенной мебели, развёртка и монтажная схема кухни, чертёж каждого изделия'],
      ['Ведомости и смета', 'ведомость отделки, спецификация материалов, ведомость объёмов работ, ориентировочная смета'],
    ],
    steps: [
      ['Разбор входа', 'Смотрим, что есть: план, размеры, визуализации. Переносим геометрию в бриф.'],
      ['Сверка', 'Показываем расхождения: где картинка не сходится с размерами. Обычно таких мест несколько.'],
      ['Цена и оплата', 'Отдельный расчёт: цену называем по брифу и подтверждаем до начала работы. Работа начинается после оплаты.'],
      ['Документация', `Собираем рабочую часть на согласованной геометрии — ${TERMS.daysShort}. Если остались вопросы или нужен обмер, выпуск предварительный; после ответов и обмера перевыпускаем — тоже за ${TERMS.days}.`],
      ['Правки голосом', 'Метка на листе, пара фраз — и альбом перевыпускается целиком.'],
    ],
    faq: [
      ['Что нужно передать на старте?', 'План с размерами (подойдёт скан или фото), высоту потолка, фотографии помещений и визуализации, если они есть.'],
      ['А если в исходной концепции ошибка?', 'Покажем и предложим решение, но замысел без вашего согласия не меняем — это ваша концепция.'],
      ['Визуализации входят?', 'Нет, только рабочая часть. Альбом для заказчика с визуализациями входит в полный дизайн-проект.'],
    ],
    ex: ['gost-kv3k', 'gost-kv65'],
    caseLink: ['../journal/sostav-dizayn-proekta.html', 'Статья: состав альбома'],
  },
  {
    slug: 'planirovochnoe-reshenie', name: 'Планировочное решение',
    tag: 'Первый шаг', term: TERMS.days, vol: RANGE(PLAN[0], PLAN[1]),
    desc: 'Планировочное решение: обмерный план, перепланировка, концепция и расстановка мебели с проверкой проходов. Удобно до покупки квартиры или до полного проекта.',
    termNote: 'от оплаты и плана', termFull: `${TERMS.daysFrom[0].toUpperCase() + TERMS.daysFrom.slice(1)}`,
    cover: 'assets/refs/modern-4k-study-wA.jpg',
    lead: 'Ответ на вопрос «встанет ли»: обмерный план, перепланировка, концепция и расстановка мебели с проходами. Удобно до покупки квартиры или до старта полного проекта.',
    forWhom: ['выбираете между двумя-тремя квартирами', 'хотите понять, влезает ли нужный набор мебели', 'думаете объединить комнаты или две квартиры в одну'],
    includes: [
      ['Обмерный план', 'существующая геометрия с цепочками размеров и привязками'],
      ['Демонтаж и монтаж', 'что сносим и что возводим, с марками перегородок; объединение помещений — предложением до техзаключения'],
      ['Концепция интерьера', 'зонирование и образ каждого помещения'],
      ['Расстановка мебели', 'план мебели с позициями, спецификация мебели и оборудования'],
      ['Проверка эргономики', 'проходы, двери, задевающие мебель, зона безопасности у тренажёров — программа проверяет расстановку правилами, автор — смысл'],
    ],
    steps: [
      ['Бриф', 'План, картинки, которые нравятся, и пара слов: кто живёт и что обязательно должно встать. Можно голосом.'],
      ['Цена и оплата', 'Отдельный расчёт: цену называем по брифу и подтверждаем до начала работы. Работа начинается после оплаты.'],
      ['Расстановка', 'Программа расставляет по правилам, дизайнер проверяет смысл.'],
      ['Дальше — полный проект', 'Геометрия уже введена: полный альбом собирается на ней, повторно ничего вводить не нужно.'],
    ],
    faq: [
      ['Можно потом дополнить до полного проекта?', 'Да, бриф остаётся у нас: полный альбом собирается на той же геометрии.'],
      ['Учитываете ли перепланировку?', 'Показываем как предложение: несущие не трогаем, объединение помечаем в реестре открытых вопросов — нужен план БТИ и техзаключение. Согласование в жилинспекции не берём: это работа проектной организации с допуском.'],
      ['Что если квартиру ещё не купили?', 'Достаточно планировки от застройщика с размерами — этого хватает для проверки расстановки.'],
    ],
    ex: ['gost-retro103', 'gost-modern4k'],
    caseLink: ['../cases/kvartira-103.html', 'Кейс: две квартиры в одну'],
  },
  {
    slug: 'vizualizatsii', name: 'Визуализации по чертежам', part: true,
    tag: 'Входит в дизайн-проект', term: 'вместе с проектом', vol: 'кадры ключевых стен',
    desc: 'Визуализации ключевых стен в составе дизайн-проекта: каждый кадр сверяется с планом по чек-листу, а стоит перед листом развёртки своей стены.',
    termNote: 'приходят вместе с альбомом', termFull: 'Визуализации приходят вместе с первым вариантом проекта',
    cover: (SIGNED[0] || ['assets/refs/retro-103-kitchen-wB.jpg'])[0],
    // галерея — только кадры, сверенные с планом и подписанные дизайнером (из _renders.json, их отбирает gen-gost-pages.js)
    gallery: SIGNED.slice(0, 6),
    lead: 'Кадры ключевых стен каждого помещения и, где получается, вид сверху. Каждый кадр сверяется с планом по чек-листу — мебель, двери, сантехника, свет; что не совпало, перерисовывается. В альбоме для заказчика кадр стоит перед листом развёртки своей стены.',
    forWhom: ['нужно показать решение семье до того, как что-то покупать', 'хотите видеть помещение с нескольких сторон, а не один «парадный» ракурс', 'важно, чтобы картинка совпадала с чертежом'],
    includes: [
      ['Кадры ключевых стен', 'камера ставится по чертежу; кадр стоит перед листом развёртки своей стены'],
      ['Вид сверху 3D', 'вся квартира одним кадром — если он прошёл сверку с планом'],
      ['Сверка с планом', 'по чек-листу: мебель (положение, тип, число), двери, сантехника, свет; подписывает дизайнер. Где кадр и чертёж расходятся, верен чертёж'],
      ['Материалы из проекта', 'те же краски, полы и плитка, что в колерной карте и спецификации'],
    ],
    steps: [
      ['Геометрия', 'Кадры строятся по чертежам проекта — поэтому они идут в его составе.'],
      ['Стиль', 'Из брифа: цвета, референсы, что нравится и что раздражает.'],
      ['Кадры и сверка', 'Каждый кадр сверяется с планом по чек-листу; что не совпало — перерисовываем, подписывает дизайнер.'],
    ],
    faq: [
      ['Насколько это похоже на итог?', 'Генератор картинок иногда добавляет лишнее — стул, столик, другую дверь. Поэтому каждый кадр сверяется с планом, и где расхождение осталось, верен чертёж. Мелочи декора — подушки и вазы — в реальности будут ваши.'],
      ['Можно заказать визуализации без проекта?', 'Кадры строятся по чертежам: без геометрии картинка получится «вообще», а не про вашу квартиру. Поэтому они идут в составе проекта — бриф с планом, и кадры придут вместе с альбомом.'],
      ['Кадр не понравился — что делать?', 'Оставьте правку голосом прямо на листе с визуализацией: кнопка «Правка к этому листу» есть и на нём.'],
    ],
    ex: ['gost-retro103', 'gost-modern4k'],
    caseLink: ['../style/', 'Стили и их материалы'],
  },
  {
    slug: 'smeta-i-komplektatsiya', name: 'Смета и комплектация', part: true,
    tag: 'Входит в дизайн-проект', term: 'вместе с проектом', vol: RANGE(EST[0], EST[1]),
    desc: 'Ведомость объёмов, спецификация материалов и ориентировочная смета — в составе альбома, по тем же чертежам. Перевыпуск проекта пересчитывает и смету.',
    termNote: 'приходят вместе с альбомом', termFull: 'Ведомости и смета приходят вместе с первым вариантом проекта',
    cover: 'assets/refs/proekt-2-kitchen-wA.jpg',
    lead: 'Ведомость объёмов работ, спецификация материалов и ориентировочная смета — посчитаны по тем же чертежам, что и альбом. С ними идут в магазин и разговаривают с подрядчиком.',
    forWhom: ['нужно понять бюджет до начала работ', 'хотите закупать сами, без наценки подрядчика', 'нужно сравнить предложения бригад на одних и тех же объёмах'],
    includes: [
      ['Ведомость объёмов работ', 'объёмы по видам работ из геометрии: площади стен и полов, точки электрики, погонаж'],
      ['Спецификация материалов', 'краски и сантехника — с артикулом, мебель и текстиль — по характеристикам, под подбор'],
      ['Колерная карта и отделка', 'краски с кодами цвета, покрытия, плитка — спецификация отделочных материалов'],
      ['Мебель, сантехника, свет', 'спецификации мебели и оборудования, сантехники, светильников; ведомости изделий, техники и фурнитуры'],
      ['Смета ориентировочная', 'работы, материалы, прочие услуги — с итогами по разделам, по тарифу проекта, на дату выпуска'],
    ],
    steps: [
      ['Геометрия', 'Объёмы берутся из чертежей: площади, длины, число точек, метраж кабеля.'],
      ['Тариф', 'Уровень материалов и мебели — из брифа; позиции спецификации подставляются под него.'],
      ['Выдача', 'Ведомости и смета — последними листами альбома, с итогами по разделам.'],
    ],
    faq: [
      ['Смета — это оферта?', 'Нет, это расчёт на дату выпуска. Цены материалов меняются; работы обычно попадают точнее, если объёмы взяты из чертежей.'],
      ['Мебель входит?', 'Да, отдельными спецификациями — чтобы был виден полный бюджет, а не только строительная часть.'],
      ['Изменилась планировка — смета тоже?', 'Да: объёмы считаются из тех же чертежей, поэтому перевыпуск альбома пересчитывает и ведомости, и смету.'],
      ['Можно заказать только смету?', 'Нет: без чертежей объёмы взять неоткуда, и смета снова станет ценой за метр. Если проект от другого дизайнера уже есть — подойдёт «Только рабочая документация»: смета войдёт в неё.'],
    ],
    ex: ['gost-proekt2', 'gost-kv58'],
    caseLink: ['../journal/smeta-remonta.html', 'Статья: как читать смету'],
  },
];

/* ------------------------------------------------------------------ сборка */
const out = [];
const w = (rel, html) => { const p = path.join(SITE, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, html); out.push(rel); };
// Offer: цена «от» = минимальный заказ, ставка за м² — в priceSpecification (TERMS.offers); только для двух проектных услуг
const PRICE_KEY = { 'dizayn-proekt-kvartiry': 'kvartira' };
const OFFER = s => (PRICE_KEY[s.slug] ? { offers: TERMS.offers(s.name, `${BASE}/catalog/${s.slug}.html`) } : {});

/* хаб каталога */
w('catalog/index.html', shell({
  file: 'catalog/index.html',
  title: 'Каталог услуг LINEA — дизайн-проект, документация, смета',
  desc: D('Каталог LINEA: проект квартиры, рабочая документация, планировочное решение. Визуализации и смета входят в каждый проект. Состав — по листам.', 'index'),
  h1: 'Каталог: три услуги и два раздела, которые входят в каждый проект',
  crumb: 'Каталог услуг',
  ogImage: 'assets/refs/retro-103-living-wA.jpg',
  lead: `Три услуги — от полного проекта до отдельного планировочного решения — и два раздела, которые входят в каждый дизайн-проект: визуализации и смета. Отдельно они не продаются. Состав расписан по листам и взят из ${gen(A.length, 'альбома', 'альбомов')}, которые студия уже выпустила: любой пункт можно открыть и проверить.`,
  jsonld: [
    SHELL.crumbsLd([['LINEA', BASE + '/'], ['Каталог', BASE + '/catalog/']]),
    { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: SERVICES.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.name, url: `${BASE}/catalog/${s.slug}.html` })) },
  ],
  body: `<section class="proof"><div class="wrap">
  <div><b>~5 минут</b><span>бриф: план, картинки, пара слов</span></div>
  <div><b>${TERMS.days}</b><span>проект квартиры — от оплаты и плана с размерами</span></div>
  <div><b>от ${LISTOV(MIN_FLAT)}</b><span>альбома квартиры по ГОСТ</span></div>
  <div><b>${TERMS.fromLine}</b><span>${TERMS.sumShort}, старт после оплаты</span></div>
</div></section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Услуги</div>
    <h2>Полный проект или его часть</h2>
    <div class="tiles">
${SERVICES.filter(s => !s.part).map(s => `      <a class="tile" href="${s.slug}.html">
        ${G.img('../', s.cover, s.name)}
        <div class="tile-body">
          <span class="tag">${esc(s.tag)}</span>
          <b>${esc(s.name)}</b>
          <span class="tile-lead">${esc(SHELL.clamp(s.lead, 120))}</span>
          <span class="tile-figs"><i><b>${esc(s.term)}</b></i><i><b>${esc(s.vol)}</b></i></span>
        </div>
      </a>`).join('\n')}
    </div>
    <h3 style="margin-top:34px">Входит в каждый дизайн-проект</h3>
    <p class="sub">Визуализации и смета строятся по чертежам проекта квартиры, поэтому отдельно не продаются — они приходят вместе с альбомом.</p>
    <div class="tiles two">
${SERVICES.filter(s => s.part).map(s => `      <a class="tile" href="${s.slug}.html">
        ${G.img('../', s.cover, s.name)}
        <div class="tile-body">
          <span class="tag">${esc(s.tag)}</span>
          <b>${esc(s.name)}</b>
          <span class="tile-lead">${esc(SHELL.clamp(s.lead, 120))}</span>
          <span class="tile-figs"><i><b>${esc(s.term)}</b></i><i><b>${esc(s.vol)}</b></i></span>
        </div>
      </a>`).join('\n')}
    </div>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Как это проходит</div>
    <h2>Пять шагов — и на руках два альбома</h2>
    <ol class="steps-list">
${hows(TERMS.days).map(st => `      <li><h3>${esc(st[0])}</h3><p>${esc(st[1])}</p></li>`).join('\n')}
    </ol>
    <div class="cta-row" style="margin-top:26px">
      <a class="btn" href="../brief.html">Начать бриф</a>
      <a class="btn ghost" href="../${G.reviewHref('gost-lineademo', 'draftsman-elev-r1-1')}">Попробовать правку на листе</a>
    </div>
  </div>
</section>

<section class="blk" id="quiz">
  <div class="wrap">
    <div class="kicker">Не знаете, что выбрать?</div>
    <h2>Два вопроса — и каталог сузится до одной услуги</h2>
    <div class="quiz" data-quiz>
      <div class="q" data-q="0"><p>Что уже есть на руках?</p>
        <div class="q-opts"><button data-a="nothing">Только план и желание</button><button data-a="concept">Концепция от дизайнера</button><button data-a="project">Готовый проект — нужна смета</button></div></div>
      <div class="q" data-q="1" hidden><p>Что важнее прямо сейчас?</p>
        <div class="q-opts"><button data-a="all">Полный комплект для стройки</button><button data-a="plan">Понять, встанет ли мебель</button><button data-a="viz">Увидеть, как будет выглядеть</button></div></div>
      <div class="q-res" hidden><p class="kicker">Вам подойдёт</p><h3><a data-res-link href="dizayn-proekt-kvartiry.html" aria-label="Подходящая услуга">Дизайн-проект квартиры</a></h3><p data-res-why class="sub"></p>
        <div class="cta-row"><a class="btn" data-res-btn href="dizayn-proekt-kvartiry.html">Открыть услугу</a><button class="btn ghost" type="button" data-reset>Пройти заново</button></div></div>
    </div>
  </div>
</section>
<script>
(function () {
  var root = document.querySelector('[data-quiz]'); if (!root) return;
  var ans = [];
  var MAP = function () {
    if (ans[0] === 'project') return ['rabochaya-dokumentatsiya.html', 'Только рабочая документация', 'Отдельно смета не делается — она считается по чертежам. Достраиваем рабочую часть на вашей геометрии, и ведомость объёмов, спецификация и смета войдут в неё.'];
    if (ans[0] === 'concept') return ['rabochaya-dokumentatsiya.html', 'Только рабочая документация', 'Концепцию сохраняем, достраиваем развёртки, инженерию, мебель на заказ и смету.'];
    if (ans[1] === 'plan') return ['planirovochnoe-reshenie.html', 'Планировочное решение', 'Обмерный план, перепланировка и расстановка мебели с проходами.'];
    if (ans[1] === 'viz') return ['dizayn-proekt-kvartiry.html', 'Дизайн-проект квартиры', 'Визуализации ключевых стен, сверенные с планом, входят в альбом для заказчика — вместе с чертежами.'];
    return ['dizayn-proekt-kvartiry.html', 'Дизайн-проект квартиры', 'От ${LISTOV(MIN_FLAT)} документации — ${TERMS.daysShort}. ' + ${JSON.stringify(TERMS.line)} + '.'];
  };
  root.addEventListener('click', function (e) {
    if (e.target.closest('[data-reset]')) {
      ans = [];
      root.querySelectorAll('.q').forEach(function (q, i) { q.hidden = i !== 0; });
      root.querySelector('.q-res').hidden = true;
      return;
    }
    var b = e.target.closest('button[data-a]'); if (!b) return;
    var q = b.closest('.q'); ans[+q.dataset.q] = b.dataset.a;
    q.hidden = true;
    var next = root.querySelector('.q[data-q="' + (+q.dataset.q + 1) + '"]');
    if (next && !(ans[0] === 'project' || ans[0] === 'concept')) { next.hidden = false; return; }
    var r = MAP();
    root.querySelector('[data-res-link]').textContent = r[1];
    root.querySelector('[data-res-link]').href = r[0];
    root.querySelector('[data-res-btn]').href = r[0];
    root.querySelector('[data-res-why]').textContent = r[2];
    root.querySelector('.q-res').hidden = false;
  });
})();
</script>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Альбомы</div>
    <h2>${G.plural(A.length, 'проект', 'проекта', 'проектов')} в новом формате — открыты целиком</h2>
    <p class="sub">Квартиры от ${minOf(FLATS, f => +f.area.replace(',', '.')).toFixed(0)} м² до двух квартир, объединённых в одну. У каждого — полный альбом и альбом для заказчика; все комплекты предварительные, до ответов заказчика и обмера.</p>
    <div class="tiles">
${A.map(f => '      ' + G.tile('../', f)).join('\n')}
    </div>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Условия</div>
    <h2>Про деньги — без мелкого шрифта</h2>
    <div class="pas-grid">
      <div class="pas-col good">
        <h3>Оплата</h3>
        <ul>
          <li>${TERMS.line} — подробно на странице «<a href="../price/">Стоимость</a>»</li>
          <li>Проект начинается после оплаты: онлайн через ЮKassa или по счёту</li>
          <li>Срок — от оплаты и получения плана с размерами</li>
          <li>Отказ и возврат — ${SHELL.ofertaRef('../', 'договору-оферте', { before: 'по ', draft: 'по условиям заказа: их подтверждаем на странице заказа до оплаты' })}</li>
        </ul>
      </div>
      <div class="pas-col">
        <h3>Что такое «тариф»</h3>
        <ul>
          <li>Тариф — уровень материалов и мебели в смете</li>
          <li>Эконом, бизнес, премиум: меняются позиции, а не состав чертежей</li>
          <li>На стоимость проектирования тариф не влияет</li>
        </ul>
      </div>
    </div>
    <div class="cta-row" style="margin-top:28px">
      <a class="btn ghost" href="../compare/">Сравнить с рынком</a>
      <a class="btn ghost" href="../cases/">Посмотреть кейсы</a>
    </div>
  </div>
</section>`,
}));

/* страницы услуг */
SERVICES.forEach(s => {
  const others = s.part ? SERVICES.filter(x => !x.part).slice(0, 3) : SERVICES.filter(x => x.slug !== s.slug && !x.part).slice(0, 3);
  const table = s.table ? s.table() : `<div class="scroll-x">
    <table class="tbl">
      <tr><th>Раздел</th><th>Что в нём</th></tr>
${s.includes.map(i => `      <tr><td>${esc(i[0])}</td><td>${esc(i[1])}</td></tr>`).join('\n')}
    </table>
    </div>`;
  w(`catalog/${s.slug}.html`, shell({
    file: `catalog/${s.slug}.html`,
    title: `${s.name} — состав, сроки, условия | LINEA`,
    desc: D(s.desc, s.slug),
    h1: esc(s.name),
    crumb: `<a href="./">Каталог</a> · ${esc(s.tag)}`,
    lead: esc(s.lead),
    ogImage: s.cover, cta: s.cta,
    jsonld: [
      SHELL.crumbsLd([['LINEA', BASE + '/'], ['Каталог', BASE + '/catalog/'], [s.name, `${BASE}/catalog/${s.slug}.html`]]),
      {
        '@context': 'https://schema.org', '@type': 'Service', name: s.name, serviceType: 'Дизайн интерьера',
        description: s.lead, areaServed: 'RU', url: `${BASE}/catalog/${s.slug}.html`, image: `${BASE}/${s.cover}`,
        provider: { '@type': 'ProfessionalService', name: 'LINEA', url: BASE + '/', telephone: AUTHOR.tel, email: AUTHOR.email },
        ...OFFER(s),
      },
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: s.faq.map(f => ({ '@type': 'Question', name: f[0], acceptedAnswer: { '@type': 'Answer', text: f[1] } })) },
    ],
    body: `<section class="proof"><div class="wrap">
  <div><b>${esc(s.term)}</b><span>${esc(s.termNote)}</span></div>
  <div><b>${esc(s.vol)}</b><span>${s.table ? 'рабочего альбома' : 'объём'}</span></div>
  <div><b>${PRICE_KEY[s.slug] ? TERMS.fromLine : 'по запросу'}</b><span>${PRICE_KEY[s.slug] ? 'сумма — по площади, до оплаты' : s.part ? 'входит в стоимость проекта' : 'цену называем до начала работы'}</span></div>
  <div><b>голосом</b><span>бриф и правки к листам</span></div>
</div></section>

${s.gallery ? `<section class="blk">
  <div class="wrap">
    <div class="kicker">Примеры</div>
    <h2>Кадры, сверенные с планом</h2>
    <p class="sub">Только кадры, которые прошли сверку с планом по чек-листу и подписаны дизайнером. В альбоме для заказчика каждый стоит перед листом развёртки той стены, которую показывает.</p>
    <div class="gal">
${s.gallery.map(gi => '      ' + G.img('../', gi[0], gi[1])).join('\n')}
    </div>
    <p class="render-note"><b>О картинках.</b> ${esc(TERMS.renderNote)}.</p>
  </div>
</section>

` : ''}<section class="blk">
  <div class="wrap">
    <div class="kicker">Кому подходит</div>
    <h2>Когда стоит брать именно это</h2>
    <ul class="checklist">${s.forWhom.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Состав</div>
    <h2>Что входит в комплект</h2>
    ${table}
    <div class="cta-row" style="margin-top:26px">
      <a class="btn ghost" href="${s.caseLink[0]}">${esc(s.caseLink[1])}</a>
      <a class="btn ghost" href="../gost/">Как проверяется документация</a>
    </div>
  </div>
</section>

${examples(s.ex, s.first, s.exSub)}

<section class="blk">
  <div class="wrap">
    <div class="kicker">Порядок работы</div>
    <h2>Как это проходит</h2>
    <ol class="steps-list">
${s.steps.map(st => `      <li><h3>${esc(st[0])}</h3><p>${esc(st[1])}</p></li>`).join('\n')}
    </ol>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Частые вопросы</div>
    <h2>Коротко</h2>
    ${s.faq.map((f, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(f[0])}</summary><p>${esc(f[1])}</p></details>`).join('\n    ')}
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Ещё в каталоге</div>
    <h2>${s.part ? 'Услуги, в которые это входит' : 'Другие услуги'}</h2>
    <div class="tiles two">
${others.map(o => `      <a class="tile plain" href="${o.slug}.html"><div class="tile-body"><span class="tag">${esc(o.tag)} · ${esc(o.term)}</span><b>${esc(o.name)}</b><span class="more">Смотреть →</span></div></a>`).join('\n')}
    </div>
  </div>
</section>`,
  }));
});

/* sitemap */
const smPath = path.join(SITE, 'sitemap.xml');
let sm = fs.readFileSync(smPath, 'utf8');
sm = sm.replace(/\s*<url>\s*<loc>[^<]*\/catalog\/[^<]*<\/loc>[\s\S]*?<\/url>/g, '');
sm = sm.replace('</urlset>', out.map(rel => {
  const loc = `${BASE}/${rel.replace(/index\.html$/, '')}`;
  return `  <url><loc>${loc}</loc><changefreq>monthly</changefreq><priority>${/index\.html$/.test(rel) ? '0.9' : '0.8'}</priority></url>`;
}).join('\n') + '\n</urlset>');
fs.writeFileSync(smPath, sm);

console.log(`Собрано страниц: ${out.length}`);
console.log(out.map(o => '  ' + o).join('\n'));
console.log('sitemap.xml обновлён');
