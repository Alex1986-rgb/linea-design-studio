#!/usr/bin/env node
'use strict';
/**
 * Служебные страницы сайта: о студии, контакты, 404.
 *
 *   node tools/gen-info-pages.js
 *
 * «О студии» нужна не для красоты: поисковики и заказчики одинаково хотят
 * понимать, кто именно отвечает за проект. Поэтому здесь автор, метод,
 * чем не занимаемся и на чём проверяется качество — без общих слов.
 */

const fs = require('fs');
const path = require('path');
const SHELL = require('./site-shell.js');

const SITE = path.join(__dirname, '..', 'site');
const { AUTHOR, BASE, esc, crumbsLd } = SHELL;
const out = [];
const w = (rel, html) => { const p = path.join(SITE, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, html); out.push(rel); };

function page({ file, title, desc, h1, crumb, lead, body, jsonld, u }) {
  u = u === undefined ? '../' : u;
  const ld = (jsonld || []).map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');
  return `<!DOCTYPE html>
<html lang="ru">
<head>
${SHELL.head(u, { title, desc, canonical: `${BASE}/${file.replace(/index\.html$/, '')}`, ogTitle: h1, ogDesc: lead })}
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

${SHELL.footer(u, null)}
</body>
</html>
`;
}

/* ------------------------------------------------------------- о студии */
w('about/index.html', page({
  file: 'about/index.html',
  title: 'О студии LINEA — кто делает проект',
  desc: 'Дизайнер-архитектор Кырлан Александр и автоматизированный конвейер студии: как распределена работа между человеком и алгоритмом, чем мы не занимаемся и как проверяется качество чертежей.',
  h1: 'О студии: человек отвечает за смысл, конвейер — за листы',
  crumb: 'О студии',
  lead: 'LINEA — небольшая студия с собственным программным конвейером выпуска рабочей документации. Проект ведёт один человек, а рутину — 45 листов чертежей, спецификацию и смету — собирает алгоритм по согласованной геометрии.',
  jsonld: [
    crumbsLd([['LINEA', BASE + '/'], ['О студии', BASE + '/about/']]),
    {
      '@context': 'https://schema.org', '@type': 'ProfessionalService', name: 'LINEA — студия дизайна интерьера',
      url: BASE + '/', telephone: AUTHOR.tel, email: AUTHOR.email, areaServed: 'RU', priceRange: 'Открытое тестирование: 0 ₽',
      founder: { '@type': 'Person', name: AUTHOR.name, jobTitle: AUTHOR.role, telephone: AUTHOR.tel, email: AUTHOR.email }
    }
  ],
  body: `<section class="proof"><div class="wrap">
  <div><b>1 человек</b><span>ведёт проект от брифа до выдачи</span></div>
  <div><b>48 часов</b><span>от брифа до полного альбома</span></div>
  <div><b>3 программы</b><span>проверяют каждый лист перед выдачей</span></div>
  <div><b>131 лист</b><span>в двух открытых демо-альбомах</span></div>
</div></section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Автор</div>
    <h2>${esc(AUTHOR.role[0].toUpperCase() + AUTHOR.role.slice(1))} ${esc(AUTHOR.name)}</h2>
    <p class="sub">Ведёт проект целиком: разбирает бриф, принимает планировку, спорит с алгоритмом там, где машина формально права, а жить в этом неудобно, и подписывает выпуск. Его имя, телефон и почта стоят в основной надписи каждого листа — не «студия», а конкретный человек, которому можно позвонить по любому размеру на чертеже.</p>
    <div class="cta-row">
      <a class="btn ghost" href="tel:${AUTHOR.tel}">${AUTHOR.phone}</a>
      <a class="btn ghost" href="mailto:${AUTHOR.email}">${AUTHOR.email}</a>
    </div>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Метод</div>
    <h2>Что делает человек, а что алгоритм</h2>
    <table class="tbl">
      <tr><th>Этап</th><th>Человек</th><th>Конвейер</th></tr>
      <tr><td>Бриф</td><td>Задаёт вопросы, которых нет в форме: привычки, сценарии, что раздражало в прошлой квартире</td><td>Проверяет геометрию: нахлёст помещений, проём за стеной, расхождение площадей</td></tr>
      <tr><td>Планировка</td><td>Решает, что важнее, когда всё не влезает; переписывает правило, если расстановка формально верна, но неудобна</td><td>Расставляет по эргономике с учётом радиаторов, стояков и проходов</td></tr>
      <tr><td>Чертежи</td><td>Смотрит выборку листов глазами, ловит смысловые ошибки</td><td>Собирает все листы, подбирает масштаб, нормализует кегли и линии</td></tr>
      <tr><td>Проверка</td><td>Принимает решение о выдаче</td><td>Линтер бумаги, аудит содержания по канону, сквозной контроль выпуска</td></tr>
      <tr><td>Правки</td><td>Формулирует, что не так</td><td>Пересобирает альбом целиком за минуты</td></tr>
    </table>
    <p class="hint" style="margin-top:14px">Ключевое отличие от ручной работы: правка вносится не в лист, а в правило. Поэтому исправление приходит сразу во все проекты, а не в один чертёж.</p>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Границы</div>
    <h2>Чем мы не занимаемся</h2>
    <div class="pas-grid">
      <div class="pas-col">
        <h3>Не берём</h3>
        <ul>
          <li>Расчёт несущих конструкций — это работа конструктора с допуском</li>
          <li>Согласование перепланировки в жилинспекции</li>
          <li>Светотехнический и теплотехнический расчёт по нормам</li>
          <li>Строительные работы и авторский надзор на объекте</li>
        </ul>
      </div>
      <div class="pas-col good">
        <h3>Берём</h3>
        <ul>
          <li>Планировочное решение и полный альбом рабочей документации</li>
          <li>Инженерию интерьера: электрика, свет, тёплые полы, сантехника</li>
          <li>Спецификацию с артикулами и смету реализации</li>
          <li>Визуализации по фактической геометрии проекта</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="blk sig-blk">
  <div class="wrap">
    <div class="sig">
      <span class="sig-mark">✦</span>
      <p class="sig-line">Подпись, телефон и почта автора стоят в основной надписи каждого листа</p>
      <p class="sig-name">${esc(AUTHOR.name)}</p>
      <p class="sig-role">${esc(AUTHOR.role)} · LINEA</p>
    </div>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Проверяемость</div>
    <h2>Почему нам можно верить до первого отзыва</h2>
    <p class="sub">Студия в открытом тестировании, поэтому вместо чужих слов мы выкладываем документы: два полных альбома открыты целиком, каждый лист можно увеличить и распечатать, смета и спецификация лежат рядом. Правила, по которым чертежи проверяются, тоже открыты — они записаны в канон с пунктами ГОСТ и СП, а не живут в голове у исполнителя.</p>
    <div class="cta-row">
      <a class="btn ghost" href="../cases/">Разбор проектов</a>
      <a class="btn ghost" href="../reviews/">Про отзывы — честно</a>
      <a class="btn ghost" href="../journal/">Журнал о документации</a>
    </div>
  </div>
</section>`
}));

/* ------------------------------------------------------------- контакты */
w('contacts/index.html', page({
  file: 'contacts/index.html',
  title: 'Контакты студии LINEA — телефон и почта',
  desc: `Связаться со студией: ${AUTHOR.role} ${AUTHOR.name}, телефон ${AUTHOR.phone}, почта ${AUTHOR.email}. Как проходит первый разговор и что подготовить к брифу.`,
  h1: 'Контакты',
  crumb: 'Контакты',
  lead: 'Быстрее всего — заполнить бриф: он структурирует то, что всё равно придётся рассказать. Но если удобнее сначала поговорить, звоните или пишите напрямую автору проектов.',
  jsonld: [
    crumbsLd([['LINEA', BASE + '/'], ['Контакты', BASE + '/contacts/']]),
    { '@context': 'https://schema.org', '@type': 'ContactPage', mainEntity: { '@type': 'Person', name: AUTHOR.name, jobTitle: AUTHOR.role, telephone: AUTHOR.tel, email: AUTHOR.email } }
  ],
  body: `<section class="blk">
  <div class="wrap">
    <div class="kicker">Связь</div>
    <h2>${esc(AUTHOR.name)}, ${esc(AUTHOR.role)}</h2>
    <table class="tbl">
      <tr><th>Канал</th><th>Куда</th><th>Когда отвечаем</th></tr>
      <tr><td>Телефон</td><td><a href="tel:${AUTHOR.tel}">${AUTHOR.phone}</a></td><td>ежедневно, 10:00–21:00 МСК</td></tr>
      <tr><td>Почта</td><td><a href="mailto:${AUTHOR.email}">${AUTHOR.email}</a></td><td>в течение суток, с вложениями любого объёма</td></tr>
      <tr><td>Бриф</td><td><a href="../brief.html">форма на сайте</a></td><td>ответ с уточняющими вопросами в тот же день</td></tr>
    </table>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Подготовка</div>
    <h2>Что подготовить к разговору</h2>
    <ul class="checklist">
      <li>План квартиры с размерами — подойдёт planировка застройщика, скан БТИ или фото листа с рулеткой</li>
      <li>Высоту потолка и тип дома: панель, кирпич, монолит — от этого зависят толщины и ниши</li>
      <li>Фотографии помещений, если объект уже есть</li>
      <li>Состав семьи и сценарии: кто где спит, работает, хранит вещи</li>
      <li>Ориентир по бюджету реализации — от него зависит тариф спецификации</li>
    </ul>
    <p class="hint" style="margin-top:16px">Ничего из этого не обязательно к первому звонку: недостающее соберём вместе.</p>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Условия</div>
    <h2>Коротко про деньги и обязательства</h2>
    <div class="pas-grid">
      <div class="pas-col good">
        <h3>Сейчас</h3>
        <ul>
          <li>Проектирование бесплатно — идёт открытое тестирование</li>
          <li>Предоплаты нет ни на одном этапе</li>
          <li>Альбом остаётся у вас в любом случае</li>
        </ul>
      </div>
      <div class="pas-col">
        <h3>Взамен</h3>
        <ul>
          <li>Честная обратная связь по комплекту</li>
          <li>Разрешение показать проект в портфолио — по желанию</li>
          <li>Участникам теста фиксируется цена на будущие проекты</li>
        </ul>
      </div>
    </div>
  </div>
</section>`
}));

/* ------------------------------------------------------------- 404 */
const notFound = `<!DOCTYPE html>
<html lang="ru">
<head>
${SHELL.head(BASE + '/', { title: 'Страница не найдена — LINEA', desc: 'Такой страницы на сайте студии LINEA нет. Перейдите в каталог услуг, кейсы или журнал.', canonical: BASE + '/404.html' })}
<meta name="robots" content="noindex">
</head>
<body>
${SHELL.beta(BASE + '/')}

${SHELL.header(BASE + '/', null)}

<section class="blk hero-page">
  <div class="wrap">
    <div class="kicker">Ошибка 404</div>
    <h1>Такой страницы нет — но есть чертежи</h1>
    <p class="lead-page">Возможно, адрес изменился или в ссылке опечатка. Ниже — то, ради чего сюда обычно приходят.</p>
    <div class="cta-row" style="margin-top:26px">
      <a class="btn" href="${BASE}/">На главную</a>
      <a class="btn ghost" href="${BASE}/catalog/">Каталог услуг</a>
      <a class="btn ghost" href="${BASE}/cases/">Кейсы</a>
      <a class="btn ghost" href="${BASE}/journal/">Журнал</a>
    </div>
  </div>
</section>

${SHELL.footer(BASE + '/', null)}
</body>
</html>
`;
w('404.html', notFound);

console.log(`Собрано страниц: ${out.length}`);
console.log(out.map(o => '  ' + o).join('\n'));
