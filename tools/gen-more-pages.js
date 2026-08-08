#!/usr/bin/env node
'use strict';
/**
 * Недостающие страницы сайта: портфолио, процесс, условия, FAQ,
 * политика обработки данных, карта сайта, страница благодарности.
 *
 *   node tools/gen-more-pages.js
 *
 * Политика написана по факту: сайт статический, форма брифа формирует письмо
 * в почтовом клиенте, счётчиков аналитики на сайте нет. Ничего «на всякий
 * случай» в неё не дописываем — обещать сбор данных, которого нет, так же
 * плохо, как умалчивать о реальном.
 */

const fs = require('fs');
const path = require('path');
const SHELL = require('./site-shell.js');

const SITE = path.join(__dirname, '..', 'site');
const { AUTHOR, BASE, esc, crumbsLd } = SHELL;
const out = [];
const w = (rel, html) => { const p = path.join(SITE, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, html); out.push(rel); };

function page({ file, title, desc, h1, crumb, lead, body, jsonld, noindex, sec }) {
  const u = '../';
  const ld = (jsonld || []).map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');
  return `<!DOCTYPE html>
<html lang="ru">
<head>
${SHELL.head(u, { title, desc, canonical: `${BASE}/${file.replace(/index\.html$/, '')}`, ogTitle: h1, ogDesc: lead })}${noindex ? '\n<meta name="robots" content="noindex">' : ''}
${ld}
</head>
<body>
${SHELL.beta(u)}

${SHELL.header(u, null)}

<section class="blk hero-page">
  <div class="wrap">
    <div class="kicker">${crumb}</div>
    <h1>${h1}</h1>
    <p class="lead-page">${lead}</p>
  </div>
</section>

${body}

${SHELL.sticky(u)}

${SHELL.footer(u, sec || null)}
</body>
</html>
`;
}

/* ---------------------------------------------------------- портфолио */
w('portfolio-hub/index.html', page({
  file: 'portfolio-hub/index.html',
  sec: 'cases',
  title: 'Портфолио LINEA — два альбома целиком, лист за листом',
  desc: 'Демо-проекты студии открыты полностью: квартира 56 м² на 45 листов и дом 120 м² на 86 листов. Листалка, единый PDF, спецификация и смета — всё доступно без запроса.',
  h1: 'Портфолио: альбомы открыты целиком',
  crumb: 'Портфолио',
  lead: 'Обычно студия показывает пять красивых кадров и обещает «полный комплект чертежей». Мы выкладываем комплект целиком — 131 лист в двух проектах, каждый можно открыть, увеличить и распечатать.',
  jsonld: [crumbsLd([['LINEA', BASE + '/'], ['Портфолио', BASE + '/portfolio-hub/']])],
  body: `<section class="blk">
  <div class="wrap">
    <div class="kicker">Проекты</div>
    <h2>Два альбома и три способа их смотреть</h2>
    <div class="tiles">
      <a class="tile" href="../portfolio/demo/presentation.html">
        <img src="../portfolio/demo/06-koncept/renders/01-gostinaya-kuhnya.jpg" alt="Квартира 56 м² — визуализация гостиной" width="1200" height="800" loading="lazy" decoding="async">
        <div class="tile-body"><span class="badge">45 листов A3</span><span class="tag" style="margin-left:10px">Джапанди</span><b>Квартира 56 м²</b>
        <span class="tile-lead">Гостиная-кухня, спальня, детская, санузел, прихожая. Смета 2 514 162 ₽ в тарифе «бизнес».</span>
        <span class="tile-figs"><i><b>20</b> развёрток</i><i><b>11</b> визуализаций</i><i><b>5</b> узлов</i></span></div>
      </a>
      <a class="tile" href="../portfolio/dom-120/presentation.html">
        <img src="../portfolio/dom-120/06-koncept/renders/05-holl-lestnica.jpg" alt="Дом 120 м² — холл с лестницей" width="1200" height="800" loading="lazy" decoding="async">
        <div class="tile-body"><span class="badge">86 листов A3</span><span class="tag" style="margin-left:10px">Современный</span><b>Дом 120 м², два этажа</b>
        <span class="tile-lead">Общая зона и кабинет внизу, три спальни наверху, лестница с расчётом. Смета 4 871 834 ₽.</span>
        <span class="tile-figs"><i><b>44</b> развёртки</i><i><b>2</b> этажа</i><i><b>1</b> лестница</i></span></div>
      </a>
    </div>
    <table class="tbl" style="margin-top:34px">
      <tr><th>Способ</th><th>Что это</th><th>Кому удобнее</th></tr>
      <tr><td><a href="../portfolio/demo/presentation.html">Листалка</a></td><td>полноэкранный просмотр листов со стрелками и миниатюрами</td><td>заказчику — посмотреть альбом как презентацию</td></tr>
      <tr><td><a href="../portfolio/demo/index.html">Все файлы</a></td><td>дерево папок проекта: чертежи, документы, визуализации</td><td>прорабу — найти нужный лист по названию</td></tr>
      <tr><td><a href="../portfolio/demo/print.html">Версия для печати</a></td><td>источник единого PDF: титул, оглавление, документы, листы A3</td><td>тому, кто печатает альбом целиком</td></tr>
    </table>
    <div class="cta-row" style="margin-top:28px">
      <a class="btn ghost" href="../cases/">Разбор решений в кейсах</a>
      <a class="btn ghost" href="../catalog/">Что можно заказать</a>
    </div>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Листы крупно</div>
    <h2>Шесть листов из двух альбомов — как есть</h2>
    <div class="plates">
      ${[
        ['demo/01-kvartira/kvartira-04-mebel.svg', 'Лист 6', 'Планировочное решение'],
        ['demo/04-razvertki/01-gostinaya-kuhnya-stena-A.svg', 'Лист 20', 'Развёртка стены гостиной'],
        ['demo/01-kvartira/kvartira-11b-plintus.svg', 'Лист 14', 'Плинтусы и порожки'],
        ['dom-120/10-uzly/lestnitsa.svg', 'Дом', 'Лестница: планы и расчёт'],
        ['dom-120/10-uzly/razrez-1-1.svg', 'Дом', 'Разрез 1—1'],
        ['demo/10-uzly/uzly-V-D-mokraya-plintus.svg', 'Лист 45', 'Узлы В и Д'],
      ].map(pl => `<a class="plate" href="../portfolio/${pl[0]}" target="_blank" rel="noopener">
        <span class="plate-img"><img src="../portfolio/${pl[0]}" alt="${pl[2]} — лист альбома LINEA" width="1587" height="1123" loading="lazy" decoding="async"></span>
        <span class="plate-cap"><i>${pl[1]}</i>${pl[2]}</span>
      </a>`).join('\n      ')}
    </div>
  </div>
</section>`
}));

/* ---------------------------------------------------------- процесс */
w('process/index.html', page({
  file: 'process/index.html',
  sec: 'compare',
  title: 'Как проходит работа над проектом — этапы LINEA',
  desc: 'Пять этапов от брифа до выдачи альбома: что происходит на каждом, сколько занимает, что требуется от заказчика и чем этап заканчивается.',
  h1: 'Как проходит работа',
  crumb: 'Процесс',
  lead: 'Весь путь занимает 48 часов и укладывается в пять этапов. Ниже — что делаем мы, что нужно от вас и по какому результату понятно, что этап закрыт.',
  jsonld: [
    crumbsLd([['LINEA', BASE + '/'], ['Процесс', BASE + '/process/']]),
    { '@context': 'https://schema.org', '@type': 'HowTo', name: 'Как проходит работа над дизайн-проектом в LINEA', totalTime: 'PT48H',
      step: [['Бриф', 'Заказчик заполняет форму: размеры, проёмы, конструктив, пожелания'], ['Планировка', 'Студия расставляет мебель и согласует решение'], ['Инженерия', 'Электрика, свет, тёплые полы и сантехника привязываются к мебели'], ['Альбом', 'Конвейер собирает листы, три программы проверяют выпуск'], ['Выдача', 'Папка проекта, единый PDF, смета и спецификация']]
        .map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s[0], text: s[1] })) }
  ],
  body: `<section class="blk">
  <div class="wrap">
    <div class="kicker">Этапы</div>
    <h2>Пять шагов и что закрывает каждый</h2>
    <div class="scroll-x">
      <table class="tbl">
        <tr><th>Этап</th><th>Сколько</th><th>Что делаем</th><th>Что нужно от вас</th><th>Результат</th></tr>
        <tr><td>1. Бриф</td><td>7 минут</td><td>Разбираем ответы, задаём уточняющие вопросы</td><td>Размеры, фото, пожелания по стилю и бюджету</td><td>Проверенная геометрия объекта</td></tr>
        <tr><td>2. Планировка</td><td>2–4 часа</td><td>Расставляем мебель по эргономике, показываем варианты</td><td>Согласовать или сказать, что не так</td><td>Утверждённое планировочное решение</td></tr>
        <tr><td>3. Инженерия</td><td>2 часа</td><td>Привязываем розетки к мебели, раскладываем свет, считаем щит</td><td>Список техники, если он уже есть</td><td>Планы электрики, воды и тепла</td></tr>
        <tr><td>4. Альбом</td><td>до 48 часов от старта</td><td>Собираем чертежи, спецификацию, смету, визуализации</td><td>Ничего — работаем сами</td><td>45 листов A3 и документы</td></tr>
        <tr><td>5. Выдача</td><td>сразу</td><td>Отдаём папку проекта и объясняем, как ей пользоваться</td><td>Прочитать и задать вопросы</td><td>Комплект на руках, предоплаты нет</td></tr>
      </table>
    </div>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Правки</div>
    <h2>Что происходит, когда что-то не нравится</h2>
    <div class="pas-grid">
      <div class="pas-col">
        <h3>Как в ручной студии</h3>
        <ul>
          <li>Правка планировки тянет за собой переделку каждого листа руками</li>
          <li>Круг правок — от недели; часть листов забывают обновить</li>
          <li>Смета пересчитывается отдельно и расходится с чертежами</li>
        </ul>
      </div>
      <div class="pas-col good">
        <h3>Как у нас</h3>
        <ul>
          <li>Меняется исходная геометрия — альбом пересобирается целиком</li>
          <li>Пересборка занимает минуты, забыть лист технически невозможно</li>
          <li>Смета и спецификация считаются из той же геометрии, что чертежи</li>
        </ul>
      </div>
    </div>
    <div class="cta-row" style="margin-top:28px">
      <a class="btn" href="../brief.html">Начать с брифа</a>
      <a class="btn ghost" href="../catalog/">Выбрать услугу</a>
    </div>
  </div>
</section>`
}));

/* ---------------------------------------------------------- условия и цены */
w('price/index.html', page({
  file: 'price/index.html',
  sec: 'compare',
  title: 'Стоимость дизайн-проекта — условия студии LINEA',
  desc: 'Сколько стоит дизайн-проект в LINEA: на время открытого тестирования проектирование бесплатно, предоплаты нет. Что входит, за что платить не нужно и как считается смета реализации.',
  h1: 'Стоимость и условия',
  crumb: 'Условия',
  lead: 'Студия работает в режиме открытого тестирования: проектирование бесплатно, предоплаты нет, альбом остаётся у вас в любом случае. Ниже — что это значит на практике и чем стоимость проекта отличается от бюджета ремонта.',
  jsonld: [
    crumbsLd([['LINEA', BASE + '/'], ['Условия', BASE + '/price/']]),
    { '@context': 'https://schema.org', '@type': 'Offer', name: 'Дизайн-проект интерьера', price: '0', priceCurrency: 'RUB',
      availability: 'https://schema.org/LimitedAvailability', description: 'Открытое тестирование студии: проектирование бесплатно, предоплаты нет',
      seller: { '@type': 'ProfessionalService', name: 'LINEA', telephone: AUTHOR.tel, email: AUTHOR.email } }
  ],
  body: `<section class="blk">
  <div class="wrap">
    <div class="kicker">Сейчас</div>
    <h2>Что входит и сколько стоит</h2>
    <div class="scroll-x">
      <table class="tbl">
        <tr><th>Услуга</th><th>Объём</th><th>Срок</th><th class="hi">Цена в тесте</th></tr>
        <tr><td><a href="../catalog/dizayn-proekt-kvartiry.html">Дизайн-проект квартиры</a></td><td>45 листов A3 + документы</td><td>48 часов</td><td class="hi">0 ₽</td></tr>
        <tr><td><a href="../catalog/dizayn-proekt-doma.html">Дизайн-проект дома</a></td><td>86 листов A3 + документы</td><td>48–72 часа</td><td class="hi">0 ₽</td></tr>
        <tr><td><a href="../catalog/rabochaya-dokumentatsiya.html">Только рабочая документация</a></td><td>от 30 листов</td><td>24–48 часов</td><td class="hi">0 ₽</td></tr>
        <tr><td><a href="../catalog/planirovochnoe-reshenie.html">Планировочное решение</a></td><td>4–8 листов</td><td>24 часа</td><td class="hi">0 ₽</td></tr>
        <tr><td><a href="../catalog/vizualizatsii.html">Визуализации</a></td><td>6–12 кадров</td><td>24 часа</td><td class="hi">0 ₽</td></tr>
        <tr><td><a href="../catalog/smeta-i-komplektatsiya.html">Смета и комплектация</a></td><td>спецификация + смета</td><td>24 часа</td><td class="hi">0 ₽</td></tr>
      </table>
    </div>
    <p class="hint" style="margin-top:14px">Тестирование не бессрочное: о старте платного периода предупредим заранее, участникам теста цена фиксируется.</p>
  </div>
</section>

<section class="blk" id="calc">
  <div class="wrap">
    <div class="kicker">Калькулятор</div>
    <h2>Сколько листов будет в вашем альбоме</h2>
    <p class="sub">Формула откалибрована по выпущенным альбомам: квартира на 5 помещений — 45 листов, дом на 11 помещений в два этажа — 86. Отметьте, что есть у вас.</p>
    <div class="calc" data-calc>
      <div class="calc-row"><span>Помещений (комнаты, кухня, санузлы, прихожая)</span>
        <div class="calc-num"><button type="button" data-mm="-1">−</button><b data-rooms>5</b><button type="button" data-mm="1">+</button></div>
      </div>
      <div class="calc-row"><span>Этажей</span>
        <div class="calc-num"><button type="button" data-fm="-1">−</button><b data-floors>1</b><button type="button" data-fm="1">+</button></div>
      </div>
      <div class="calc-out">
        <div><b data-base>45</b><span>листов в базовом пакете</span></div>
        <div><b data-full>~90</b><span>в полном (с покомнатными)</span></div>
        <div><b data-elev>20</b><span>из них развёрток стен</span></div>
      </div>
      <p class="hint">Базовый пакет: титул, презентационный план, 16 сводных планов на этаж, щит, план обозначения развёрток, 2 разреза, 3 листа узлов, лестница (в доме) и развёртка каждой стены — 4 на помещение.</p>
      <div class="cta-row"><a class="btn" href="../brief.html">Собрать такой альбом — бриф</a></div>
    </div>
  </div>
</section>
<script>
(function () {
  var root = document.querySelector('[data-calc]'); if (!root) return;
  var rooms = 5, floors = 1;
  var $ = function (sel) { return root.querySelector(sel); };
  function render() {
    $('[data-rooms]').textContent = rooms;
    $('[data-floors]').textContent = floors;
    // калибровка: 45 = 1+1+16+1+1+2+3 (=25) + 4×5; дом 86 = 25+16 + 1(лестница) + 4×11
    var base = 25 + 16 * (floors - 1) + (floors > 1 ? 1 : 0) + 4 * rooms;
    $('[data-base]').textContent = base;
    $('[data-full]').textContent = '~' + (base + 10 * rooms);
    $('[data-elev]').textContent = 4 * rooms;
  }
  root.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-mm],button[data-fm]'); if (!b) return;
    if (b.dataset.mm) rooms = Math.min(20, Math.max(2, rooms + (+b.dataset.mm)));
    if (b.dataset.fm) floors = Math.min(3, Math.max(1, floors + (+b.dataset.fm)));
    render();
  });
  render();
})();
</script>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Важное различие</div>
    <h2>Цена проекта и бюджет ремонта — разные вещи</h2>
    <p class="sub">Проектирование сейчас ничего не стоит. Но ремонт по проекту стоит денег, и эту сумму мы считаем честно, построчно, из вашей геометрии. Тариф в брифе — это как раз уровень материалов в смете реализации, а не стоимость нашей работы.</p>
    <table class="tbl">
      <tr><th>Тариф</th><th>Что меняется</th><th>Пример по полу</th></tr>
      <tr><td>Эконом</td><td>ламинат 33 класса, царговые двери, базовые механизмы</td><td>3 640 ₽/м²</td></tr>
      <tr><td>Бизнес</td><td>инженерная доска, двери в цвет стен, брендовые механизмы</td><td>5 200 ₽/м²</td></tr>
      <tr><td>Премиум</td><td>массив под УФ-маслом, столярка на заказ, латунь</td><td>8 320 ₽/м²</td></tr>
    </table>
    <div class="cta-row" style="margin-top:26px">
      <a class="btn ghost" href="../compare/">Полное сравнение пакетов и тарифов</a>
      <a class="btn ghost" href="../journal/smeta-remonta.html">Как читать смету</a>
    </div>
  </div>
</section>`
}));

/* ---------------------------------------------------------- FAQ */
const FAQ = [
  ['Что входит в дизайн-проект?', 'Планировки с расстановкой, развёртка каждой стены, планы полов, потолков и отделки, электрика с привязками и щитом, сантехника, разрезы и узлы, спецификация с артикулами, смета и визуализации. В базовом пакете на квартиру это 45 листов A3 и семь документов.'],
  ['Почему 48 часов, а не три месяца?', 'Черновую работу делает программный конвейер: он строит листы по согласованной геометрии и сам проверяет их тремя программами. Человек тратит время на смысл — бриф, планировку и приёмку, а не на вычерчивание.'],
  ['Проект правда бесплатный?', 'Да, на время открытого тестирования. Предоплаты нет ни на одном этапе, альбом остаётся у вас, даже если работать дальше не станем. Взамен просим честную обратную связь.'],
  ['Что нужно от меня на старте?', 'Размеры помещений и проёмов, высота потолка, тип дома, фотографии объекта и пожелания по стилю и бюджету. Подойдёт планировка застройщика или фото листа с рулеткой.'],
  ['Можно ли вносить правки?', 'Да. Правка вносится в исходную геометрию, после чего альбом пересобирается целиком за минуты — забыть обновить лист технически невозможно.'],
  ['Вы делаете перепланировку и согласование?', 'Показываем варианты перепланировки, но согласование в жилинспекции и расчёт несущих конструкций не берём: это работа организаций с допуском.'],
  ['Смета — это точная цена ремонта?', 'Это расчёт на дату выпуска из объёмов по чертежам. Работы обычно попадают в 10 %, материалы зависят от момента закупки. Офертой смета не является.'],
  ['Кто ведёт проект?', `${AUTHOR.role[0].toUpperCase() + AUTHOR.role.slice(1)} ${AUTHOR.name}. Его имя и контакты стоят в основной надписи каждого листа — вопросы по любому размеру можно задать напрямую.`],
  ['Работаете удалённо или нужен выезд?', 'Основной формат — удалённо: этого достаточно, если есть размеры. Контрольный обмер на объекте рекомендуем перед закупкой материалов.'],
  ['Что если бригада не поймёт чертежи?', 'Альбом сделан в стандарте проектных бюро: штамп, масштаб, цепочки размеров, узлы. Если вопрос всё же возник — звонок автору проекта, чьи контакты на каждом листе.']
];
w('faq/index.html', page({
  file: 'faq/index.html',
  sec: 'compare',
  title: 'Вопросы и ответы о дизайн-проекте — LINEA',
  desc: 'Десять частых вопросов о работе студии: что входит в проект, почему 48 часов, правда ли бесплатно, что нужно от заказчика, как вносятся правки и что со сметой.',
  h1: 'Вопросы и ответы',
  crumb: 'FAQ',
  lead: 'Собрали то, что спрашивают чаще всего — от состава альбома до условий тестирования. Если вопроса здесь нет, звоните: телефон внизу каждой страницы.',
  jsonld: [
    crumbsLd([['LINEA', BASE + '/'], ['FAQ', BASE + '/faq/']]),
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f[0], acceptedAnswer: { '@type': 'Answer', text: f[1] } })) }
  ],
  body: `<section class="blk">
  <div class="wrap">
    <div class="kicker">Коротко о главном</div>
    <h2>Десять вопросов</h2>
    ${FAQ.map((f, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(f[0])}</summary><p>${esc(f[1])}</p></details>`).join('\n    ')}
  </div>
</section>`
}));

/* ---------------------------------------------------------- политика */
w('policy/index.html', page({
  file: 'policy/index.html',
  title: 'Политика обработки персональных данных — LINEA',
  desc: 'Какие данные собирает сайт студии LINEA, что происходит с брифом, где хранятся контакты и как отозвать согласие. Написано по факту: сайт статический, счётчиков аналитики нет.',
  h1: 'Обработка персональных данных',
  crumb: 'Правовое',
  lead: 'Коротко: сайт статический, форму брифа обрабатывает ваш почтовый клиент, счётчиков аналитики на страницах нет. Ниже — то же самое подробно и с оговорками, которые важны.',
  jsonld: [crumbsLd([['LINEA', BASE + '/'], ['Политика', BASE + '/policy/']])],
  body: `<section class="blk">
  <div class="wrap">
    <div class="kicker">Что происходит с данными</div>
    <h2>Кто обрабатывает и что именно</h2>
    <table class="tbl">
      <tr><th>Вопрос</th><th>Ответ</th></tr>
      <tr><td>Кто обрабатывает</td><td>${esc(AUTHOR.role)} ${esc(AUTHOR.name)}, контакты: <a href="tel:${AUTHOR.tel}">${AUTHOR.phone}</a>, <a href="mailto:${AUTHOR.email}">${AUTHOR.email}</a></td></tr>
      <tr><td>Какие данные</td><td>имя, телефон, e-mail и сведения об объекте, которые вы сами указываете в брифе или в письме</td></tr>
      <tr><td>Зачем</td><td>связаться с вами и выпустить дизайн-проект; рассылок мы не ведём</td></tr>
      <tr><td>Основание</td><td>ваше действие — отправка брифа или письма — и последующее исполнение договорённости</td></tr>
      <tr><td>Где хранится</td><td>в почтовом ящике студии и в рабочей папке проекта на компьютере автора</td></tr>
      <tr><td>Сколько</td><td>пока идёт работа и год после выдачи альбома; дальше удаляем по запросу или по истечении срока</td></tr>
      <tr><td>Кому передаём</td><td>никому: подрядчиков, партнёров и рекламных сетей в цепочке нет</td></tr>
    </table>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Техническая правда</div>
    <h2>Что умеет и чего не умеет сам сайт</h2>
    <ul class="checklist">
      <li>Сайт статический и размещён на GitHub Pages — у него нет базы данных и серверной обработки форм</li>
      <li>Кнопка в брифе формирует письмо в вашем почтовом клиенте: до отправки данные не покидают устройство, отправляете их вы сами</li>
      <li>Счётчиков аналитики, пикселей рекламных сетей и внешних скриптов слежения на страницах нет</li>
      <li>Из внешних ресурсов подключаются только шрифты Google Fonts — их сервер видит факт запроса и IP-адрес; это единственная сторонняя загрузка</li>
      <li>Хостинг GitHub Pages ведёт собственные технические журналы доступа, на которые мы повлиять не можем</li>
      <li>Файлы cookie сайт не устанавливает; в браузере сохраняется только последний просмотренный лист альбома — локально, в вашем устройстве</li>
    </ul>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Ваши права</div>
    <h2>Что вы можете потребовать</h2>
    <p class="sub">Запросить, какие ваши данные у нас есть; исправить их; удалить; отозвать согласие на обработку. Для любого из этих действий достаточно письма на <a href="mailto:${AUTHOR.email}">${AUTHOR.email}</a> — отвечаем в течение суток, удаляем в течение трёх рабочих дней и подтверждаем удаление письмом.</p>
    <p class="hint">Документ описывает фактическое положение дел на дату публикации страницы. Если появится серверная форма, аналитика или рассылка, страница будет обновлена до, а не после запуска.</p>
  </div>
</section>`
}));

/* ---------------------------------------------------------- карта сайта */
const MAP = [
  ['Услуги', [['Каталог услуг', 'catalog/'], ['Дизайн-проект квартиры', 'catalog/dizayn-proekt-kvartiry.html'], ['Дизайн-проект дома', 'catalog/dizayn-proekt-doma.html'], ['Только рабочая документация', 'catalog/rabochaya-dokumentatsiya.html'], ['Планировочное решение', 'catalog/planirovochnoe-reshenie.html'], ['Визуализации', 'catalog/vizualizatsii.html'], ['Смета и комплектация', 'catalog/smeta-i-komplektatsiya.html'], ['Стоимость и условия', 'price/']]],
  ['Работы', [['Портфолио', 'portfolio-hub/'], ['Кейсы', 'cases/'], ['Квартира 56 м²', 'cases/kvartira-56.html'], ['Дом 120 м²', 'cases/dom-120.html'], ['Альбом квартиры', 'portfolio/demo/presentation.html'], ['Альбом дома', 'portfolio/dom-120/presentation.html']]],
  ['Разобраться', [['Сравнение с рынком', 'compare/'], ['Как проходит работа', 'process/'], ['Вопросы и ответы', 'faq/'], ['Журнал', 'journal/'], ['Состав дизайн-проекта', 'journal/sostav-dizayn-proekta.html'], ['Развёртки стен', 'journal/razvertki-sten.html'], ['Электрика в проекте', 'journal/elektrika-v-proekte.html'], ['Пирог пола', 'journal/pirog-pola.html'], ['Смета ремонта', 'journal/smeta-remonta.html']]],
  ['Стили', [['Все стили', 'style/'], ['Джапанди', 'style/japandi.html'], ['Скандинавский', 'style/scandi.html'], ['Минимализм', 'style/minimal.html'], ['Современный', 'style/modern.html'], ['Неоклассика', 'style/neoclassic.html'], ['Лофт', 'style/loft.html']]],
  ['Студия', [['О студии', 'about/'], ['Контакты', 'contacts/'], ['Истории', 'stories/'], ['Отзывы', 'reviews/'], ['Бриф', 'brief.html'], ['Политика обработки данных', 'policy/']]]
];
w('sitemap/index.html', page({
  file: 'sitemap/index.html',
  title: 'Карта сайта LINEA — все разделы и страницы',
  desc: 'Полный список страниц студии LINEA: услуги и цены, портфолио и кейсы, журнал, стили, информация о студии и правовые документы.',
  h1: 'Карта сайта',
  crumb: 'Навигация',
  lead: 'Все страницы сайта одним списком — быстрее, чем через меню.',
  jsonld: [crumbsLd([['LINEA', BASE + '/'], ['Карта сайта', BASE + '/sitemap/']])],
  body: `<section class="blk">
  <div class="wrap">
    <div class="cards g3">
${MAP.map(([group, links]) => `      <div class="card"><h3>${esc(group)}</h3><ul>${links.map(l => `<li><a href="../${l[1]}">${esc(l[0])}</a></li>`).join('')}</ul></div>`).join('\n')}
    </div>
  </div>
</section>`
}));

/* ---------------------------------------------------------- спасибо */
w('thanks/index.html', page({
  file: 'thanks/index.html',
  title: 'Бриф отправлен — LINEA',
  desc: 'Бриф получен: что происходит дальше, когда ждать ответ и что можно посмотреть, пока студия разбирает вашу геометрию.',
  h1: 'Бриф отправлен. Дальше — наша работа',
  crumb: 'Спасибо',
  noindex: true,
  lead: 'Ответим в течение суток с уточняющими вопросами. Если что-то срочное — звоните напрямую, телефон ниже.',
  body: `<section class="blk">
  <div class="wrap">
    <div class="kicker">Что дальше</div>
    <h2>Три шага, которые сделаем без вас</h2>
    <ol class="steps-list">
      <li><h3>Разберём геометрию</h3><p>Проверим размеры и проёмы валидатором, вернёмся с вопросами, если что-то не сходится.</p></li>
      <li><h3>Соберём планировку</h3><p>Покажем расстановку до чертежей — на этом шаге правки бесплатны и быстры.</p></li>
      <li><h3>Выпустим альбом</h3><p>48 часов от согласованной планировки до полного комплекта с документами и сметой.</p></li>
    </ol>
    <div class="cta-row" style="margin-top:30px">
      <a class="btn ghost" href="../portfolio-hub/">Посмотреть альбомы, пока ждёте</a>
      <a class="btn ghost" href="tel:${AUTHOR.tel}">${AUTHOR.phone}</a>
    </div>
  </div>
</section>`
}));

/* ---------------------------------------------------------- чек-лист приёмки */
w('checklist/index.html', page({
  file: 'checklist/index.html',
  sec: 'compare',
  title: 'Чек-лист приёмки дизайн-проекта — 24 проверки',
  desc: 'Печатный чек-лист: как проверить дизайн-проект любой студии за полчаса. Состав альбома, штампы, развёртки, инженерия, документы — 24 пункта с пояснениями.',
  h1: 'Чек-лист приёмки дизайн-проекта',
  crumb: 'Инструмент',
  lead: 'Возьмите этот список на приёмку проекта — нашего или любого другого. Если по пункту нечего показать, вы платите за картинки, а не за документацию. Страница печатается: Ctrl+P / ⌘P.',
  jsonld: [crumbsLd([['LINEA', BASE + '/'], ['Чек-лист', BASE + '/checklist/']])],
  body: `<section class="blk checklist-doc">
  <div class="wrap">
    ${[
      ['Состав альбома', [
        'Есть титульный лист с перечнем всех чертежей',
        'В штампе каждого листа: «Лист N из M» — и M совпадает с фактом',
        'Масштаб в штампе указан и не «подогнан под лист»',
        'Есть обмерный план с цепочками размеров, а не только «план с мебелью»',
        'Планы демонтажа и монтажа разделены',
      ]],
      ['Развёртки', [
        'Развёртка есть на каждую стену каждого помещения',
        'На развёртках — высоты и привязки, а не только красивая графика',
        'Раскладка плитки показана со стартовым рядом и подрезкой',
        'Фронты мебели показаны с высотами (шкаф не упирается в карниз)',
        'Выключатели не перекрываются открытыми створками',
      ]],
      ['Инженерия', [
        'Розетки привязаны к мебели с размерами L/H, а не «по стенам через 2 метра»',
        'В санузле розетки только дальше 1200 мм от ванны (зона 3 ПУЭ) и через УЗО',
        'Есть схема включения: какой выключатель зажигает какую группу',
        'Есть щит: автоматы, УЗО и кабель по группам с длинами',
        'Тёплые полы: зоны, терморегулятор, отдельная линия',
      ]],
      ['Узлы и высоты', [
        'Есть узлы пирога пола — жилой и мокрой зоны с гидроизоляцией',
        'Пол мокрой зоны ниже на 15–20 мм или отделён порогом (СП 29.13330)',
        'Есть хотя бы два разреза с отметками уровней',
        'Стыки покрытий — на осях дверных полотен',
      ]],
      ['Документы', [
        'Спецификация — с брендами и артикулами, а не «плитка бежевая»',
        'Смета построчная: работы, материалы, мебель, свет — по разделам',
        'Объёмы сметы взяты из чертежей (спросите, откуда цифра плитки)',
        'Понятно, как вносятся правки и что при этом происходит с листами',
        'На чертежах есть контакты автора, которому можно позвонить',
      ]],
    ].map(g => `<h2>${g[0]}</h2>
    <ul class="check-print">${g[1].map(li => `<li><span class="cbx"></span>${li}</li>`).join('')}</ul>`).join('\n    ')}
    <p class="hint" style="margin-top:26px">Составлен по канону студии LINEA (ГОСТ 21.507-81, ГОСТ Р 21.101-2020, СП 29.13330.2011, ПУЭ гл. 7.1). Раздаётся свободно — заберите на встречу с любой студией.</p>
    <div class="cta-row noprint" style="margin-top:20px">
      <button class="btn ghost" onclick="print()">Распечатать чек-лист</button>
      <a class="btn ghost" href="../journal/sostav-dizayn-proekta.html">Подробный разбор состава</a>
      <a class="btn" href="../brief.html">Проверить нас — бриф</a>
    </div>
  </div>
</section>`
}));

/* ---------------------------------------------------------- sitemap.xml */
const smPath = path.join(SITE, 'sitemap.xml');
let sm = fs.readFileSync(smPath, 'utf8');
for (const rel of out) {
  const loc = `${BASE}/${rel.replace(/index\.html$/, '')}`;
  if (/thanks/.test(rel) || sm.includes(loc)) continue;   // «спасибо» в индекс не отдаём
  sm = sm.replace('</urlset>', `  <url><loc>${loc}</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n</urlset>`);
}
fs.writeFileSync(smPath, sm);

console.log(`Собрано страниц: ${out.length}`);
console.log(out.map(o => '  ' + o).join('\n'));
