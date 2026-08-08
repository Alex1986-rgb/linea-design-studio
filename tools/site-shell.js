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
const CSSV = 'v=23';

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
    <button class="burger" type="button" aria-label="Меню" aria-expanded="false"><i></i><i></i><i></i></button>
  </div>
</header>
<div class="mnav" hidden>
  <nav>
${SECTIONS.map(x => `    <a href="${x.key === active ? './' : u + x.href}">${x.title}</a>`).join('\n')}
  </nav>
  <div class="mnav-cta">
    <a class="btn" href="${u}brief.html">Заполнить бриф</a>
    <a class="btn ghost" href="tel:${AUTHOR.tel}">${AUTHOR.phone}</a>
  </div>
</div>`;
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
  { title: 'Чек-лист приёмки', href: 'checklist/' }, { title: 'Карта сайта', href: 'sitemap/' }, { title: 'Обработка данных', href: 'policy/' },
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

// CTA перед воронкой: текст и второе действие зависят от того, на каком шаге
// пути человек находится. «Посмотреть» зовёт сравнить, «Сравнить» — вернуться
// к альбомам или начать; финал везде один — бриф.
function ctaBlock(u, active) {
  const step = FUNNEL.find(f => f.on.includes(active));
  let kicker = 'Дальше', h = 'Свой проект — с того же места',
    sub = 'Заполните бриф за 7 минут: размеры, фото, пожелания. Через 48 часов у вас альбом; предоплаты нет, альбом остаётся у вас в любом случае.',
    second = `<a class="btn ghost" href="${u}portfolio-hub/">Посмотреть альбомы</a>`;
  if (step && step.key === 'look') {
    kicker = 'Понравилось?';
    h = 'Теперь сравните — потом решайте';
    sub = 'Не верьте на слово даже нам: рядом таблица, где то же самое разложено против планировщиков, студий и бюро. А бриф займёт семь минут, когда решите.';
    second = `<a class="btn ghost" href="${u}compare/">Сравнить с рынком</a>`;
  } else if (step && step.key === 'check') {
    kicker = 'Всё сходится?';
    h = 'Тогда дальше — бриф, семь минут';
    sub = 'Размеры, фото, пожелания по стилю и бюджету. На время открытого тестирования проект делается бесплатно, предоплаты нет, альбом остаётся у вас в любом случае.';
    second = `<a class="btn ghost" href="${u}portfolio-hub/">Ещё раз взглянуть на альбомы</a>`;
  }
  return `<section class="blk cta-blk">
  <div class="wrap">
    <div class="kicker">${kicker}</div>
    <h2>${h}</h2>
    <p class="sub">${sub}</p>
    <div class="cta-row">
      <a class="btn" href="${u}brief.html">Заполнить бриф</a>
      ${second}
      <a class="btn ghost" href="tel:${AUTHOR.tel}">${AUTHOR.phone}</a>
    </div>
    <p class="hint" style="margin-top:18px">Автор проекта — ${AUTHOR.role} ${AUTHOR.name}. Его подпись и контакты стоят в основной надписи каждого листа.</p>
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
</footer>
<script>
(function () {
  var b = document.querySelector('.burger'), m = document.querySelector('.mnav');
  if (!b || !m) return;
  b.addEventListener('click', function () {
    var open = m.hidden;
    m.hidden = !open;
    b.classList.toggle('on', open);
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.documentElement.style.overflow = open ? 'hidden' : '';
  });
  m.addEventListener('click', function (e) { if (e.target.tagName === 'A') b.click(); });
})();
</script>`;
}

// Видимые хлебные крошки: и навигация, и сигнал структуры для поиска
function crumbsBar(u, items) {
  return `<nav class="crumbs" aria-label="Хлебные крошки"><div class="wrap">`
    + `<a href="${u}">Главная</a>` + items.map(it => it[1] ? `<a href="${it[1]}">${esc(it[0])}</a>` : `<span>${esc(it[0])}</span>`).join('')
    + `</div></nav>`;
}

// <picture> c WebP-источником и JPG-фолбэком: одна замена расширения,
// файлы .webp кладёт tools/make-webp (cwebp), верстка не знает о форматах
function pic(src, alt, w, h, cls) {
  const webp = src.replace(/\.jpe?g$/i, '.webp');
  return `<picture><source srcset="${webp}" type="image/webp"><img src="${src}" alt="${esc(alt)}" width="${w || 1200}" height="${h || 800}" loading="lazy" decoding="async"${cls ? ` class="${cls}"` : ''}></picture>`;
}

// Крошки для типовых страниц: раздел из SECTIONS + необязательное имя страницы
function crumbsAuto(u, section, pageTitle) {
  const sec = SECTIONS.find(x => x.key === section);
  if (!sec) return pageTitle ? crumbsBar(u, [[pageTitle, null]]) : '';
  return crumbsBar(u, pageTitle ? [[sec.title, u + sec.href], [pageTitle, null]] : [[sec.title, null]]);
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
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%23EBDCA8'/><stop offset='.5' stop-color='%23C9A45F'/><stop offset='1' stop-color='%238F6B33'/></linearGradient></defs><rect width='100' height='100' fill='%230F0E0C'/><text x='50' y='70' font-size='56' text-anchor='middle' fill='url(%23g)' font-family='Georgia'>L</text><rect x='66' y='62' width='10' height='10' transform='rotate(45 71 67)' fill='%231E6E57' stroke='%23C9A45F' stroke-width='2'/></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${u}css/main.css?${CSSV}">${extra || ''}`;

module.exports = { AUTHOR, BASE, CSSV, SECTIONS, FOOTER_EXTRA, FUNNEL, funnel, ctaBlock, crumbsBar, crumbsAuto, pic, esc, clamp, header, footer, beta, sticky, crumbsLd, head };
