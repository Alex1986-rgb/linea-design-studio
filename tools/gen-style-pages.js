#!/usr/bin/env node
'use strict';
/**
 * Генератор страниц стилей: site/style/<key>.html + site/style/index.html.
 *
 * Содержание страниц берётся из engine/presets.js — того же источника, из которого
 * движок собирает отделку, спецификацию и смету. Поэтому страница сайта не может
 * разойтись с тем, что клиент увидит в альбоме: поменяли краску в пресете —
 * перегенерировали страницы.
 *
 *   node tools/gen-style-pages.js
 */

const fs = require('fs');
const path = require('path');
const { STYLES, TIERS } = require('../engine/presets.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'site', 'style');
const BASE = 'https://alex1986-rgb.github.io/linea-design-studio';
// Автор проекта — тот же, что в основной надписи листов альбома
const AUTHOR = { name: 'Кырлан Александр', role: 'дизайнер-архитектор', phone: '+7 925 733-86-40', tel: '+79257338640', email: 'optteem@mail.ru' };

/* Редакторская часть: то, чего в пресете нет и быть не должно —
   кому стиль подходит, на чём в нём экономить нельзя, где обычно ошибаются. */
const COPY = {
  japandi: {
    lead: 'Японская сдержанность плюс скандинавская теплота: мало предметов, много воздуха, дерево и мягкий свет.',
    fits: ['семьям, которые устали от визуального шума', 'квартирам с невысокими потолками — низкая мебель работает на объём', 'тем, кто готов держать порядок: стиль не прощает открытого хранения'],
    spend: 'Дерево и свет. Шпон и массив читаются на просвет, а дешёвая плёнка «под дуб» рушит весь замысел. Второй пункт — сценарии освещения: без тёплой заливки и подсветки ниш палитра становится серой.',
    mistake: 'Смешать джапанди с чистым сканди — добавить белого глянца и ярких акцентов. Джапанди держится на приглушённых землистых тонах и матовых фактурах.',
    faq: [
      ['Джапанди — это надолго или мода?', 'В основе стиля пропорции и натуральные материалы, а не декор сезона. Заменяемая часть — текстиль и предметы; отделка и мебель остаются актуальными годами.'],
      ['Подойдёт ли для семьи с детьми?', 'Да, при поправке на практичность: пол в проходных зонах берём под УФ-маслом (ремонтопригоден локально), стены — краской моющегося класса, открытые полки заменяем закрытым хранением.'],
      ['Много ли стоит акцентная стена из реек?', 'Рейки шпонированного дуба — заметная строка сметы. Дешёвая альтернатива в том же характере — окраска в тон на два-три тона темнее плюс тёплая подсветка.']
    ]
  },
  scandi: {
    lead: 'Белая база, светлое дерево и тёплый текстиль: самый прощающий стиль — он терпит смену мебели и живёт с детьми.',
    fits: ['первым квартирам и небольшим площадям', 'северным окнам: белая база отыгрывает недостаток солнца', 'тем, кто хочет обновлять интерьер декором, а не ремонтом'],
    spend: 'Свет и текстиль. В сканди почти нет дорогой отделки, поэтому качество считывается по шторам, коврам и светильникам. Не экономьте на потолочном свете с тёплой температурой 2700–3000 K.',
    mistake: 'Уйти в стерильную белизну. Стилю нужны три-четыре тёплых материала — дерево, шерсть, керамика — иначе комната выглядит съёмной.',
    faq: [
      ['Белые стены быстро пачкаются?', 'Берём краску моющегося класса (для коридора и кухни — 1-й класс истираемости). Локальная подкраска возможна без перекраски всей стены, если сохранить остаток банки из проекта.'],
      ['Ламинат — не слишком просто для проекта?', 'В базовом тарифе да, ламинат 33 класса. В спецификации указан конкретный артикул; при переходе на бизнес-тариф движок пересчитает пол на инженерную доску и обновит смету.'],
      ['Можно ли добавить цвет?', 'Стиль строится на белой базе с одним-двумя акцентами. В пресете акцент — шалфейно-серая стена; яркое пятно лучше отдать декору и текстилю, их проще заменить.']
    ]
  },
  minimal: {
    lead: 'Стиль поверхностей: скрытые двери, теневые швы, отсутствие наличников и плинтусов в привычном виде.',
    fits: ['людям, которые ценят тишину в интерьере', 'квартирам со свободной планировкой и длинными стенами', 'тем, кто готов заложить в бюджет качество монтажа'],
    spend: 'Работа, а не материал. Микроцемент, теневой профиль и скрытый короб двери требуют геометрии стен в допуске: перепад 3 мм на 2 м здесь виден. Заложите выравнивание по маякам и опытную бригаду.',
    mistake: 'Купить скрытые двери и поставить их в кривой проём. Минимализм разоблачает любую неточность — либо делать по узлам, либо выбрать стиль, который прощает.',
    faq: [
      ['Микроцемент практичен?', 'Под лаком — да: шов отсутствует, поверхность моется. Уязвимое место — удары в углах, поэтому в проходных зонах предусматриваем защитный уголок или радиус.'],
      ['Что такое скрытый плинтус?', 'Алюминиевый профиль, вмонтированный в стену заподлицо, с теневым швом 15–20 мм. Ставится до штукатурки — если стены уже отделаны, решение отпадает.'],
      ['Не будет ли пусто?', 'Наполнение даёт свет и фактура: разница матовой стены и полированного керамогранита читается сильнее, чем декор. В проекте это отражено на развёртках и в узлах примыканий.']
    ]
  },
  modern: {
    lead: 'Тёплая нейтральная база, глубокие акценты, латунь и трековый свет — универсальный современный интерьер без стилевых крайностей.',
    fits: ['семьям, которым нужен «спокойный, но не скучный» интерьер', 'квартирам под сдачу в высоком сегменте', 'тем, кто хочет один раз собрать нейтральную базу и менять акценты'],
    spend: 'Свет и фурнитура. Трековая система с нормальным индексом цветопередачи и латунные ручки поднимают восприятие всей квартиры. Экономия здесь заметнее, чем на отделке стен.',
    mistake: 'Набрать акцентов из разных наборов — серо-зелёный, синий, бордо в одной квартире. Держите один акцентный цвет плюс металл.',
    faq: [
      ['Чем «современный» отличается от минимализма?', 'Минимализм убирает детали, современный стиль их допускает: молдингов нет, но есть цвет, металл, фактурный текстиль и открытые полки.'],
      ['Трек или споты?', 'В пресете — треки в локальных потолочных нишах: сценарии света меняются без перекладки проводки. Планы электрики и схема включения в альбоме сделаны под это решение.'],
      ['Тёмная акцентная стена уменьшит комнату?', 'При правильной подсветке — нет, она добавляет глубины. Важно не ставить акцент на стену с окном: контраст против света утомляет глаз.']
    ]
  },
  neoclassic: {
    lead: 'Классические пропорции в современном исполнении: молдинги, симметрия, «французская ёлка», белая эмаль и латунь.',
    fits: ['квартирам с потолком от 2,9 м', 'любителям симметричных композиций и парадных гостиных', 'тем, кто готов к более длинному сроку реализации'],
    spend: 'Столярка. Филёнчатые двери, буазери и карнизы — это работа краснодеревщика; дешёвые заменители из полиуретана видны на стыках. Второй пункт — пол: «французская ёлка» требует ровного основания и опытного укладчика.',
    mistake: 'Перегрузить молдингом маленькие помещения. Классика живёт пропорциями: в комнате 12 м² с потолком 2,6 м карниз 120 мм визуально съест высоту.',
    faq: [
      ['Неоклассика уместна в новостройке?', 'Да, если высота позволяет. Симметрию задают отделкой и мебелью: развёртки в альбоме показывают, как выровнять композицию относительно окна и двери.'],
      ['Молдинги обязательны?', 'Нет. Тот же характер даёт покраска стен в два тона с делением по горизонтали и качественная столярка дверей — бюджет ниже примерно на треть.'],
      ['Сколько стоит «французская ёлка»?', 'Материал в пресете — массив дуба под УФ-маслом; укладка обходится дороже палубной примерно в полтора раза. В смете проекта работа и материал разнесены построчно.']
    ]
  },
  loft: {
    lead: 'Честные фактуры: бетон, кирпич, чёрный металл и тёмное дерево, открытые коммуникации и свободная планировка.',
    fits: ['квартирам-студиям и апартаментам с высоким потолком', 'тем, кто не хочет прятать инженерию за коробами', 'холостяцким квартирам и рабочим пространствам'],
    spend: 'Инженерия и свет. Открытые коммуникации требуют аккуратной трассировки и качественной арматуры — то, что обычно прячут за ГКЛ, здесь остаётся на виду и должно выглядеть намеренно.',
    mistake: 'Оставить бетонный потолок в квартире с плохой плитой. Лофт — это выбранная фактура, а не сэкономленная отделка: перекрытие всё равно требует шлифовки, ремонта швов и окраски.',
    faq: [
      ['Лофт подходит для семьи?', 'С поправками: смягчаем текстилем и деревом, кирпич оставляем на одной стене, зоны хранения делаем закрытыми. Стиль легко переводится в «мягкий лофт».'],
      ['Открытый потолок — это шумно?', 'Да, отсутствие подвесной конструкции ухудшает акустику. Компенсируем коврами, плотными шторами и акустическими панелями — они закладываются в спецификацию.'],
      ['Кирпич настоящий или плитка?', 'В пресете — клинкерная плитка: тоньше, легче и не съедает площадь. Настоящую кладку оставляют, когда она есть в доме и в приличном состоянии.']
    ]
  }
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rub = n => n.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽';

const HEAD_COMMON = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:locale" content="ru_RU">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%230F0E0C'/><text x='50' y='68' font-size='52' text-anchor='middle' fill='%23C29A5B' font-family='Georgia'>L</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/main.css?v=14">`;

/* Локальные стили страниц раздела: не трогаем main.css, чтобы не сбрасывать кеш всему сайту. */
const LOCAL_CSS = `<style>
.pal{display:flex;gap:0;border-radius:10px;overflow:hidden;border:1px solid var(--line);margin:22px 0}
.pal i{flex:1;height:74px;display:block;position:relative}
.pal i b{position:absolute;left:0;right:0;bottom:6px;text-align:center;font:400 10px/1 var(--sans);color:#0F0E0C99;letter-spacing:.5px}
.spec{width:100%;border-collapse:collapse;margin-top:8px}
.spec td{border-top:1px solid var(--line);padding:11px 0;vertical-align:top;font-size:15px}
.spec td:first-child{color:var(--mut);width:30%;padding-right:18px}
.sku{list-style:none;padding:0;margin:8px 0 0}
.sku li{border-top:1px solid var(--line);padding:10px 0;font-size:14.5px}
.sku li span{color:var(--mut);display:inline-block;min-width:120px}
.tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:14px}
.tiers div{border:1px solid var(--line);border-radius:12px;padding:16px 18px;background:var(--panel)}
.tiers b{display:block;font-size:22px;font-family:var(--serif);color:var(--gold2)}
.tiers small{color:var(--mut)}
.slist{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:18px}
.slist a{display:block;border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:var(--panel);color:var(--ink)}
.slist a:hover{border-color:var(--gold)}
.slist .sw{display:flex;gap:0;border-radius:6px;overflow:hidden;margin-bottom:10px}
.slist .sw i{flex:1;height:26px}
.slist b{display:block;font-family:var(--serif);font-size:19px}
.slist small{color:var(--mut)}
@media(max-width:720px){.tiers{grid-template-columns:1fr}.pal i{height:56px}}
</style>`;

const header = () => `<header class="site">
  <div class="nav">
    <a class="logo" href="../">LINE<i>A</i></a>
    <nav class="links">
      <a href="../catalog/">Каталог</a>
      <a href="../cases/">Кейсы</a>
      <a href="../compare/">Сравнение</a>
      <a href="./">Стили</a>
      <a href="../journal/">Журнал</a>
      <a href="../stories/">Истории</a>
      <a href="../reviews/">Отзывы</a>
    </nav>
    <a class="btn sm" href="../brief.html">Заполнить бриф</a>
  </div>
</header>`;

const footer = () => `<footer class="site">
  <div class="wrap cols">
    <div>
      <div class="logo">LINE<i>A</i></div>
      <p>Премиальный дизайн-проект интерьера,<br>собранный автоматизированным конвейером<br>под контролем дизайнера.</p>
      <p>${AUTHOR.role} <b>${AUTHOR.name}</b><br><a href="tel:${AUTHOR.tel}">${AUTHOR.phone}</a> · <a href="mailto:${AUTHOR.email}">${AUTHOR.email}</a></p>
    </div>
    <div>
      <p><a href="../brief.html">Бриф</a> · <a href="../catalog/">Каталог</a> · <a href="../cases/">Кейсы</a> · <a href="../compare/">Сравнение</a> · <a href="./">Стили</a> · <a href="../stories/">Истории</a> · <a href="../reviews/">Отзывы</a></p>
      <p>© LINEA studio, 2026</p>
    </div>
  </div>
</footer>`;

function stylePage(key) {
  const s = STYLES[key];
  const c = COPY[key];
  const url = `${BASE}/style/${key}.html`;
  const others = Object.keys(STYLES).filter(k => k !== key);

  const crumbs = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'LINEA', item: BASE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Стили интерьера', item: BASE + '/style/' },
      { '@type': 'ListItem', position: 3, name: s.title, item: url }
    ]
  };
  const author = {
    '@context': 'https://schema.org', '@type': 'Person',
    name: AUTHOR.name, jobTitle: AUTHOR.role, telephone: AUTHOR.tel, email: AUTHOR.email,
    worksFor: { '@type': 'ProfessionalService', name: 'LINEA', url: BASE + '/' }
  };
  const faq = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: c.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))
  };

  const tiers = ['econom', 'business', 'premium'].map(t => {
    const T = TIERS[t];
    return `<div><small>${T.title}</small><b>${rub(Math.round(s.floor.priceM2 * T.kMat))}</b><small>за м² покрытия пола</small></div>`;
  }).join('');

  const skuNames = { paint: 'Краска', floor: 'Пол', tile: 'Плитка', plinth: 'Плинтус', doors: 'Двери', led: 'Свет' };

  return `<!DOCTYPE html>
<html lang="ru">
<head>
${HEAD_COMMON}
<title>Дизайн-проект в стиле «${s.title}» — палитра, материалы, цены | LINEA</title>
<meta name="description" content="${esc(s.title)} в дизайн-проекте LINEA: палитра, отделка стен и пола, потолок, двери и плинтус, конкретные артикулы в спецификации и ориентир по стоимости материалов. ${esc(c.lead)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="Интерьер в стиле «${esc(s.title)}» — что попадёт в ваш проект">
<meta property="og:description" content="${esc(c.lead)}">
<meta property="og:image" content="${BASE}/assets/hero.jpg">
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
<script type="application/ld+json">${JSON.stringify(faq)}</script>
<script type="application/ld+json">${JSON.stringify(author)}</script>
${LOCAL_CSS}
</head>
<body>
<div class="beta">Открытое тестирование студии · дизайн-проект делается бесплатно · <a href="../brief.html">заполнить бриф</a></div>

${header()}

<section class="blk">
  <div class="wrap">
    <div class="kicker"><a href="./">Стили интерьера</a> · направление</div>
    <h1>Интерьер в стиле «${s.title}»</h1>
    <p class="sub">${esc(c.lead)}</p>
    <div class="pal">${s.palette.map(hex => `<i style="background:${hex}"><b>${hex}</b></i>`).join('')}</div>
    <p>${esc(s.concept)}</p>
    <div class="cta-row">
      <a class="btn" href="../brief.html?style=${key}">Заполнить бриф в этом стиле</a>
      <a class="btn ghost" href="../portfolio/demo/presentation.html">Посмотреть альбом проекта</a>
    </div>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Решения проекта</div>
    <h2>Что конвейер применит в чертежах</h2>
    <p class="sub">Эти решения движок подставляет в развёртки, планы полов, ведомость отделки и смету — они же попадут в ваш альбом.</p>
    <table class="spec">
      <tr><td>Стены</td><td>${esc(s.wall.finish)} · ${s.wall.color}</td></tr>
      <tr><td>Акцент</td><td>${esc(s.accent.finish)} · ${s.accent.color}</td></tr>
      <tr><td>Пол</td><td>${esc(s.floor.name)}</td></tr>
      <tr><td>Потолок</td><td>${esc(s.ceiling)}</td></tr>
      <tr><td>Плинтус</td><td>${esc(s.plinth)}</td></tr>
      <tr><td>Двери</td><td>${esc(s.doors)}</td></tr>
      <tr><td>Текстиль</td><td>${esc(s.textiles)}</td></tr>
    </table>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Спецификация</div>
    <h2>Артикулы, а не «что-то похожее»</h2>
    <p class="sub">В разделе «Материалы» альбома каждая позиция выходит с брендом и артикулом — с этим списком можно идти в магазин или отдать снабженцу.</p>
    <ul class="sku">
      ${Object.keys(s.skus).map(k => `<li><span>${skuNames[k] || k}</span>${esc(s.skus[k])}</li>`).join('\n      ')}
    </ul>
    <div class="tiers">${tiers}</div>
    <p class="hint" style="margin-top:12px">Показана стоимость материала пола по трём тарифам (коэффициенты тарифа применяются ко всем материалам проекта). Краска в этом стиле — ${rub(s.paintPriceL)} за литр. Цены — ориентир для планирования бюджета, точная смета считается по вашей геометрии.</p>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Честно о стиле</div>
    <h2>Кому подходит и где обычно ошибаются</h2>
    <div class="cards g3">
      <div class="card"><h3>Кому подходит</h3><ul>${c.fits.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
      <div class="card"><h3>На чём нельзя экономить</h3><p>${esc(c.spend)}</p></div>
      <div class="card"><h3>Типичная ошибка</h3><p>${esc(c.mistake)}</p></div>
    </div>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">В альбоме</div>
    <h2>Где стиль виден в рабочей документации</h2>
    <p class="sub">Демо-проект собран в стиле «Джапанди», но состав листов одинаков для любого направления — меняются материалы, цвета и артикулы.</p>
    <table class="spec">
      <tr><td>Отделка стен</td><td><a href="../portfolio/demo/01-kvartira/kvartira-12-otdelka-sten.svg">План отделки с кодами и ведомостью</a> — какая краска или штукатурка на какой стене</td></tr>
      <tr><td>Полы</td><td><a href="../portfolio/demo/01-kvartira/kvartira-11-poly.svg">План полов</a> — раскладка, направление укладки, стыки покрытий</td></tr>
      <tr><td>Развёртки</td><td><a href="../portfolio/demo/presentation.html">Развёртки стен</a> — фронты мебели, высоты, привязки</td></tr>
      <tr><td>Материалы</td><td><a href="../portfolio/demo/07-materialy/specification.html">Спецификация</a> — бренды, артикулы, расход</td></tr>
      <tr><td>Смета</td><td><a href="../portfolio/demo/index.html">Смета реализации</a> — работы, материалы, мебель по тарифу</td></tr>
    </table>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Вопросы и ответы</div>
    <h2>О стиле «${s.title}»</h2>
    ${c.faq.map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n    ')}
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Другие направления</div>
    <h2>Сравните со смежными стилями</h2>
    <div class="slist">
      ${others.map(k => {
    const o = STYLES[k];
    return `<a href="${k}.html"><div class="sw">${o.palette.map(h => `<i style="background:${h}"></i>`).join('')}</div><b>${o.title}</b><small>${esc(o.concept.split(':')[0])}</small></a>`;
  }).join('\n      ')}
    </div>
    <div class="cta-row" style="margin-top:28px">
      <a class="btn" href="../brief.html?style=${key}">Заполнить бриф в стиле «${s.title}»</a>
      <a class="btn ghost" href="tel:${AUTHOR.tel}">${AUTHOR.phone}</a>
      <a class="btn ghost" href="mailto:${AUTHOR.email}">${AUTHOR.email}</a>
    </div>
    <p class="hint" style="margin-top:14px">${AUTHOR.role} ${AUTHOR.name} — автор проектов студии.</p>
  </div>
</section>

${footer()}
</body>
</html>
`;
}

function hubPage() {
  const url = `${BASE}/style/`;
  const list = {
    '@context': 'https://schema.org', '@type': 'ItemList',
    itemListElement: Object.keys(STYLES).map((k, i) => ({
      '@type': 'ListItem', position: i + 1, name: STYLES[k].title, url: `${BASE}/style/${k}.html`
    }))
  };
  return `<!DOCTYPE html>
<html lang="ru">
<head>
${HEAD_COMMON}
<title>Стили интерьера в проектах LINEA — 6 направлений с палитрами и ценами</title>
<meta name="description" content="Шесть стилей, в которых студия собирает дизайн-проект: джапанди, скандинавский, минимализм, современный, неоклассика, лофт. По каждому — палитра, отделка, артикулы в спецификации и ориентир по стоимости материалов.">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:title" content="Стили интерьера в проектах LINEA">
<meta property="og:description" content="Палитры, материалы и артикулы шести стилей — то, что реально попадает в чертежи и смету.">
<meta property="og:image" content="${BASE}/assets/hero.jpg">
<script type="application/ld+json">${JSON.stringify(list)}</script>
${LOCAL_CSS}
</head>
<body>
<div class="beta">Открытое тестирование студии · дизайн-проект делается бесплатно · <a href="../brief.html">заполнить бриф</a></div>

${header()}

<section class="blk">
  <div class="wrap">
    <div class="kicker">Направления</div>
    <h1>Стили, в которых студия собирает проект</h1>
    <p class="sub">Стиль в LINEA — не картинка для настроения, а набор конкретных решений: краска с артикулом, покрытие пола, тип потолка, плинтус, двери и текстиль. Выбранное направление движок подставляет в развёртки, план отделки, спецификацию и смету. Если направления нет — отметьте «на усмотрение студии», подберём по ответам в брифе. Автор проектов — ${AUTHOR.role} ${AUTHOR.name}, ${AUTHOR.phone}, ${AUTHOR.email}.</p>
    <div class="slist">
      ${Object.keys(STYLES).map(k => {
    const s = STYLES[k];
    return `<a href="${k}.html"><div class="sw">${s.palette.map(h => `<i style="background:${h}"></i>`).join('')}</div><b>${s.title}</b><small>${esc(COPY[k].lead)}</small></a>`;
  }).join('\n      ')}
    </div>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Как это работает</div>
    <h2>Стиль меняет материалы, а не состав альбома</h2>
    <div class="cards g3">
      <div class="card"><h3>Состав листов одинаков</h3><p>Обмер, демонтаж и монтаж, мебель, двери, розетки, потолки, свет, полы, отделка, тёплые полы, сантехника, узлы, разрезы, щит — независимо от стиля.</p></div>
      <div class="card"><h3>Меняется наполнение</h3><p>Палитра, покрытия, плинтус, тип дверей и светильники подставляются из пресета стиля — вместе с брендами и артикулами в спецификации.</p></div>
      <div class="card"><h3>Смета пересчитывается</h3><p>Цены материалов зависят от тарифа: эконом, бизнес, премиум. Один и тот же стиль можно собрать в трёх бюджетах.</p></div>
    </div>
    <div class="cta-row" style="margin-top:28px">
      <a class="btn" href="../brief.html">Заполнить бриф — 7 минут</a>
      <a class="btn ghost" href="../portfolio/demo/presentation.html">Листать альбом проекта</a>
    </div>
  </div>
</section>

${footer()}
</body>
</html>
`;
}

fs.mkdirSync(OUT, { recursive: true });
const written = [];
for (const key of Object.keys(STYLES)) {
  if (!COPY[key]) { console.error(`× нет редакторского текста для стиля «${key}» — страница не собрана`); continue; }
  const f = path.join(OUT, key + '.html');
  fs.writeFileSync(f, stylePage(key));
  written.push(`style/${key}.html`);
}
fs.writeFileSync(path.join(OUT, 'index.html'), hubPage());
written.unshift('style/index.html');

/* sitemap.xml: держим адреса раздела в актуальном состоянии */
const smPath = path.join(ROOT, 'site', 'sitemap.xml');
let sm = fs.readFileSync(smPath, 'utf8');
sm = sm.replace(/\s*<url>\s*<loc>[^<]*\/style\/[^<]*<\/loc>[\s\S]*?<\/url>/g, '');
const add = written.map(w => {
  const loc = `${BASE}/${w.replace(/index\.html$/, '')}`;
  const pri = w.endsWith('style/index.html') ? '0.8' : '0.7';
  return `  <url><loc>${loc}</loc><changefreq>monthly</changefreq><priority>${pri}</priority></url>`;
}).join('\n');
sm = sm.replace('</urlset>', add + '\n</urlset>');
fs.writeFileSync(smPath, sm);

console.log(`Собрано страниц: ${written.length} → site/style/`);
console.log(written.map(w => '  ' + w).join('\n'));
console.log('sitemap.xml обновлён');
