'use strict';
/**
 * Общий каркас страниц сайта: автор, навигация, подвал, липкая панель.
 *
 * Раньше эти куски были скопированы в четырёх генераторах, и при добавлении
 * раздела приходилось править меню в четырёх местах — в один заход это уже
 * дало задвоенный пункт «Журнал» на половине страниц. Теперь источник один.
 *
 * u — префикс до корня сайта: '../' для страниц в подпапке, './' для корня.
 */

const AUTHOR = {
  name: 'Кырлан Александр',
  role: 'дизайнер-архитектор',
  phone: '+7 925 733-86-40',
  tel: '+79257338640',
  email: 'optteem@mail.ru',
};

const BASE = 'https://alex1986-rgb.github.io/linea-design-studio';
const CSSV = 'v=17';

// Разделы сайта в порядке меню. Добавили раздел — правится только здесь.
const SECTIONS = [
  { key: 'catalog', title: 'Каталог', href: 'catalog/' },
  { key: 'cases', title: 'Кейсы', href: 'cases/' },
  { key: 'compare', title: 'Сравнение', href: 'compare/' },
  { key: 'style', title: 'Стили', href: 'style/' },
  { key: 'journal', title: 'Журнал', href: 'journal/' },
  { key: 'stories', title: 'Истории', href: 'stories/' },
  { key: 'reviews', title: 'Отзывы', href: 'reviews/' },
];

// Описание для сниппета: длиннее ~160 знаков поисковик всё равно обрежет,
// причём в произвольном месте. Режем сами — по границе слова.
function clamp(str, n) {
  n = n || 158;
  str = String(str).replace(/\s+/g, ' ').trim();
  if (str.length <= n) return str;
  const cut = str.slice(0, n);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 24)).replace(/[\s,;:.—-]+$/, '') + '…';
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// active — key раздела: его ссылка ведёт на './' (мы уже внутри)
function header(u, active) {
  const links = SECTIONS.map(s =>
    `      <a href="${s.key === active ? './' : u + s.href}"${s.key === active ? ' aria-current="page"' : ''}>${s.title}</a>`
  ).join('\n');
  return `<header class="site">
  <div class="nav">
    <a class="logo" href="${u}">LINE<i>A</i></a>
    <nav class="links">
${links}
    </nav>
    <a class="btn sm" href="${u}brief.html">Заполнить бриф</a>
  </div>
</header>`;
}

const beta = u => `<div class="beta">Открытое тестирование студии · дизайн-проект делается бесплатно · <a href="${u}brief.html">заполнить бриф</a></div>`;

const sticky = u => `<div class="sticky-cta">
  <a class="btn" href="${u}brief.html">Заполнить бриф</a>
  <a class="btn ghost" href="tel:${AUTHOR.tel}">Позвонить</a>
</div>`;

// в подвале к разделам добавляются служебные страницы
const FOOTER_EXTRA = [
  { title: 'Портфолио', href: 'portfolio-hub/' }, { title: 'Условия', href: 'price/' },
  { title: 'Процесс', href: 'process/' }, { title: 'FAQ', href: 'faq/' },
  { title: 'О студии', href: 'about/' }, { title: 'Контакты', href: 'contacts/' },
  { title: 'Карта сайта', href: 'sitemap/' }, { title: 'Обработка данных', href: 'policy/' },
];
// Воронка сайта: три состояния посетителя. Полоса стоит перед подвалом на
// каждой странице и всегда показывает, где человек сейчас и что дальше.
const FUNNEL = [
  { key: 'look', title: 'Посмотреть', text: 'альбомы целиком, лист за листом', href: 'portfolio-hub/', on: ['cases', 'stories', 'reviews', 'style'] },
  { key: 'check', title: 'Сравнить', text: 'состав, сроки и условия с рынком', href: 'compare/', on: ['compare', 'catalog', 'journal'] },
  { key: 'start', title: 'Начать', text: 'бриф — семь минут, дальше мы', href: 'brief.html', on: [] },
];
function funnel(u, active) {
  const cur = FUNNEL.findIndex(f => f.on.includes(active));
  const i0 = cur < 0 ? 0 : cur;
  return `<section class="funnel" aria-label="Что дальше">
  <div class="wrap">
${FUNNEL.map((f, i) => `    <a class="fstep${i === i0 ? ' on' : ''}${i < i0 ? ' done' : ''}" href="${u + f.href}">
      <span class="fnum">${String(i + 1).padStart(2, '0')}</span>
      <span class="ftitle">${f.title}</span>
      <span class="ftext">${f.text}</span>
    </a>`).join('\n')}
  </div>
</section>`;
}

function footer(u, active) {
  const links = SECTIONS.map(s => `<a href="${s.key === active ? './' : u + s.href}">${s.title}</a>`)
    .concat(FOOTER_EXTRA.map(s => `<a href="${u + s.href}">${s.title}</a>`)).join(' · ');
  return `${funnel(u, active)}

<a class="to-top" href="#" aria-label="Наверх">↑</a>

<footer class="site">
  <div class="wrap cols">
    <div>
      <div class="logo">LINE<i>A</i></div>
      <p>Премиальный дизайн-проект интерьера,<br>собранный автоматизированным конвейером<br>под контролем дизайнера.</p>
      <p>${AUTHOR.role} <b>${AUTHOR.name}</b><br><a href="tel:${AUTHOR.tel}">${AUTHOR.phone}</a> · <a href="mailto:${AUTHOR.email}">${AUTHOR.email}</a></p>
    </div>
    <div>
      <p><a href="${u}brief.html">Бриф</a> · ${links}</p>
      <p>© LINEA studio, 2026</p>
    </div>
  </div>
</footer>`;
}

// Видимые хлебные крошки: и навигация, и сигнал структуры для поиска
function crumbsBar(u, items) {
  return `<nav class="crumbs" aria-label="Хлебные крошки"><div class="wrap">`
    + `<a href="${u}">Главная</a>` + items.map(it => it[1] ? `<a href="${it[1]}">${esc(it[0])}</a>` : `<span>${esc(it[0])}</span>`).join('')
    + `</div></nav>`;
}

const crumbsLd = items => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it[0], item: it[1] })),
});

const head = (u, { title, desc, canonical, ogTitle, ogDesc, ogType, extra }) => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(clamp(desc))}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="${ogType || 'website'}">
<meta property="og:title" content="${esc(ogTitle || title)}">
<meta property="og:description" content="${esc(ogDesc || desc)}">
<meta property="og:image" content="${BASE}/assets/hero.jpg">
<meta property="og:locale" content="ru_RU">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%230F0E0C'/><text x='50' y='68' font-size='52' text-anchor='middle' fill='%23C29A5B' font-family='Georgia'>L</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${u}css/main.css?${CSSV}">${extra || ''}`;

module.exports = { AUTHOR, BASE, CSSV, SECTIONS, FOOTER_EXTRA, FUNNEL, funnel, crumbsBar, esc, clamp, header, footer, beta, sticky, crumbsLd, head };
