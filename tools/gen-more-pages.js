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
const OPEN = require('./gost-open-issues.js');

const SITE = path.join(__dirname, '..', 'site');
const { AUTHOR, BASE, esc, crumbsLd } = SHELL;
const out = [];
// выпуски нового движка: число листов и паспорт объекта читаются с самих листов, а не пишутся руками
// gost-kv65 и gost-kv58 — без разбора реестра (как в gen-gost-pages, explain: false): паспорт — с титула
const GOST = Object.fromEntries(['gost-proekt2', 'gost-kv3k', 'gost-kv65', 'gost-kv58', 'gost-modern4k', 'gost-retro103', 'gost-dom331', 'gost-lineademo', 'gost-dom120'].map(slug => {
  const r = OPEN.readRelease(SITE, slug);
  const facts = ['gost-kv65', 'gost-kv58', 'gost-modern4k', 'gost-retro103', 'gost-dom331', 'gost-lineademo', 'gost-dom120'].includes(slug) ? OPEN.facts(SITE, slug, r).facts : OPEN.read(SITE, slug, r).facts;
  return [slug, { total: r.total, blockers: r.blockers, ...facts }];
}));
// число правил проверки — из отчёта проверки выпуска (tools/sync-gost-releases.sh → _rules.txt)
const RULES = Math.max(0, ...Object.keys(GOST).map(slug => { try { return +fs.readFileSync(path.join(SITE, 'portfolio', slug, '_rules.txt'), 'utf8') || 0; } catch { return 0; } }));
if (!RULES) throw new Error('нет числа правил проверки (_rules.txt) — запустите tools/sync-gost-releases.sh');
const GOST_SHEETS = Object.values(GOST).reduce((n, g) => n + g.total, 0);
// карточки проектов пишет tools/gen-gost-pages.js (_card.json: название, тип, стиль, площадь, кадр) — запускать его первым
const CARDS = Object.keys(GOST).map(slug => {
  const c = JSON.parse(fs.readFileSync(path.join(SITE, 'portfolio', slug, '_card.json'), 'utf8'));
  c.total = JSON.parse(fs.readFileSync(path.join(SITE, 'portfolio', slug, 'sheets.json'), 'utf8')).length;   // листов — из sheets.json
  c.elev = fs.readdirSync(path.join(SITE, 'portfolio', slug, 'sheets')).filter(f => /-elev-/.test(f)).length;
  return c;
}).sort((a, b) => (+(b.code.match(/-(\d{3})-/) || [])[1] || 0) - (+(a.code.match(/-(\d{3})-/) || [])[1] || 0));   // новые первыми
const NEW_N = CARDS.length;
const NUM_W = { 2: 'два', 3: 'три', 4: 'четыре', 5: 'пять', 6: 'шесть', 7: 'семь', 8: 'восемь', 9: 'девять', 10: 'десять', 11: 'одиннадцать' };
const NUM_IN = { 2: 'двух', 3: 'трёх', 4: 'четырёх', 5: 'пяти', 6: 'шести', 7: 'семи', 8: 'восьми', 9: 'девяти', 10: 'десяти', 11: 'одиннадцати' };
const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return `${n} ${a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many}`; };
const word = (n, ...f) => plural(n, ...f).replace(/^\S+ /, '');
// диапазон с согласованием по последнему числу: «64–121 лист», «132–156 листов»
const range = (a, b, ...f) => (a === b ? plural(b, ...f) : `${a}–${plural(b, ...f)}`);
const LIST = ['лист', 'листа', 'листов'];
// картинка проекта: webp рядом (его пишет gen-gost-pages.js) — через <picture>, иначе просто jpg
const pic = (h, u, attrs) => {
  const img = `<img src="${u}${h.src}" alt="${esc(h.alt)}" width="${h.w}" height="${h.h}" ${attrs}>`;
  return h.webp ? `<picture style="display:block"><source type="image/webp" srcset="${u}${h.webp}">${img}</picture>` : img;
};
const areaNum = c => +c.area.replace(/[^\d,]/g, '').replace(',', '.');
const FLATS = CARDS.filter(c => !c.house), HOUSES = CARDS.filter(c => c.house);
const span = (arr, f) => [Math.min(...arr.map(f)), Math.max(...arr.map(f))];
const [FL_MIN, FL_MAX] = span(FLATS, c => c.total), [HS_MIN, HS_MAX] = span(HOUSES, c => c.total);
const fmtA = n => String(n.toFixed(2)).replace('.', ',');
const [AR_MIN, AR_MAX] = span(CARDS, areaNum);
const VISUALS = CARDS.reduce((n, c) => n + (c.visuals || 0), 0);
const VIS_N = CARDS.filter(c => c.visuals).length;     // у скольких проектов визуализации сверены с макетом
// калькулятор листов: прямая по выпущенным альбомам квартир (листы от числа помещений, метод наименьших квадратов),
// второй этаж — средняя прибавка домов к этой прямой. Пересобрали выпуски — коэффициенты пересчитались сами.
const LS = (() => {
  const n = FLATS.length, mx = FLATS.reduce((s, c) => s + c.rooms, 0) / n, my = FLATS.reduce((s, c) => s + c.total, 0) / n;
  const k = FLATS.reduce((s, c) => s + (c.rooms - mx) * (c.total - my), 0) / (FLATS.reduce((s, c) => s + (c.rooms - mx) ** 2, 0) || 1);
  const b = my - k * mx;
  const floor = HOUSES.length ? HOUSES.reduce((s, c) => s + c.total - (b + k * c.rooms), 0) / HOUSES.length : 15;
  const dev = Math.max(...FLATS.map(c => Math.abs(c.total - (b + k * c.rooms))));
  const elev = CARDS.reduce((s, c) => s + c.elev, 0) / CARDS.reduce((s, c) => s + c.rooms, 0);
  return { k: +k.toFixed(2), b: +b.toFixed(1), floor: Math.round(floor), dev: Math.ceil(dev), elev: +elev.toFixed(2) };
})();
// разделы альбома — по фактическому составу выпуска (порядок как в альбоме), см. bySection в gen-gost-pages.js
const SECTIONS_FACT = ['титульный лист и общие данные с ведомостью чертежей', 'открытые вопросы, задание на контрольный обмер и график закупок и работ',
  'обмерный план, демонтаж и монтаж перегородок, двери', 'концепция интерьера, расстановка и спецификация мебели',
  'электрика: розетки, свет, выключатели со схемой включения, щит, слаботочные сети',
  'отопление и вентиляция', 'водоснабжение и канализация', 'освещение со спецификацией светильников', 'потолки и конструкции из ГКЛ с узлами',
  'раскладка плитки', 'полы и отделка', 'цвет и материалы, колерная карта', 'декор и текстиль', 'встроенная мебель с монтажными схемами',
  'развёртки каждой стены и узлы', 'ведомость объёмов работ, спецификация материалов и ориентировочная смета'];
const w = (rel, html) => { const p = path.join(SITE, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, html); out.push(rel); };

function page({ file, title, desc, h1, crumb, lead, body, jsonld, noindex, sec, ogImage }) {
  const u = '../';
  const ld = (jsonld || []).map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');
  // site-shell режет описание длиннее 158 знаков на «…» посреди фразы — следим сами, чтобы фраза была законченной
  if (title.length > 70) console.warn(`  ! ${file}: title ${title.length} знаков (> 70)`);
  if (desc.replace(/\s+/g, ' ').trim().length > 158) console.warn(`  ! ${file}: description ${desc.length} знаков — будет обрезан на «…»`);
  let head = SHELL.head(u, { title, desc, canonical: `${BASE}/${file.replace(/index\.html$/, '')}`, ogTitle: h1, ogDesc: lead.replace(/\s+/g, ' ') });
  if (ogImage) head = head.replace(`${BASE}/assets/hero.jpg`, `${BASE}/${ogImage}`);
  return `<!DOCTYPE html>
<html lang="ru">
<head>
${head}
<style>.g-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px;margin:0;padding:0;list-style:none;counter-reset:st}
.g-steps li{border:1px solid var(--line);border-radius:4px;padding:20px 22px;background:var(--panel);counter-increment:st}
.g-steps li::before{content:counter(st,decimal-leading-zero);display:block;color:var(--gold);font-family:var(--serif);font-size:22px;margin-bottom:8px}
.g-steps h3{margin:0 0 8px;font-size:18px}.g-steps p{margin:0 0 8px;color:var(--mut);font-size:14px;line-height:1.55}.g-steps .hint{font-size:12.5px;margin:0}
@media (max-width:760px){.stats{gap:22px 30px}.cta-row .btn{white-space:normal;text-align:center}}</style>${noindex ? '\n<meta name="robots" content="noindex">' : ''}
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
// карточка проекта нового формата: кадр, тип и стиль, площадь по экспликации, листов из sheets.json
const firstSentence = t => (t.match(/^.+?[.!?](\s|$)/) || [t])[0].trim();
const tileOf = c => {
  const h = c.hero;
  const decl = (c.name.match(/(\d+) м²/) || [])[1];
  const declTxt = decl && Math.abs(+decl - areaNum(c)) > 1.5 ? `<span class="tile-lead" style="font-size:12.5px;margin-top:8px">В названии — заявленная площадь ${decl} м²; в цифрах ниже — по экспликации альбома.</span>` : '';
  return `      <a class="tile" href="../portfolio/${c.slug}/">
        ${h ? pic(h, '../', `loading="lazy" decoding="async"${h.kind === 'sheet' ? ' style="object-fit:contain;background:#f4f1ea"' : ''}`) : ''}
        <div class="tile-body"><span class="tag">${esc(c.type)} · ${esc(c.style)}</span><b>${esc(c.name)}</b>
        <span class="tile-lead">${esc(firstSentence(c.lead))}</span>${declTxt}
        <span class="tile-figs"><i><b>${c.total}</b>${word(c.total, 'лист', 'листа', 'листов')}</i><i><b>${c.area.replace(' м²', '')}</b>м²</i><i><b>${c.rooms}</b>${word(c.rooms, 'помещение', 'помещения', 'помещений')}</i>${c.visuals ? `<i><b>${c.visuals}</b>${word(c.visuals, 'визуализация', 'визуализации', 'визуализаций')}</i>` : ''}</span></div>
      </a>`;
};
// листы крупно — по одному типовому листу из разных альбомов (ищем по названию в sheets.json)
const PLATES = [
  ['gost-lineademo', /^План расстановки мебели/, 'Планировочное решение'],
  ['gost-dom331', /^Развёртк/, 'Развёртка стен'],
  ['gost-retro103', /^Однолинейная схема щита/, 'Щит: однолинейная схема'],
  ['gost-kv3k', /^Раскладка плитки\. Ванная/, 'Раскладка плитки в ванной'],
  ['gost-modern4k', /^Разрезы и узлы потолков/, 'Разрезы и узлы потолков'],
  ['gost-dom120', /^Смета ориентировочная/, 'Смета'],
].map(([slug, re, cap]) => {
  const list = JSON.parse(fs.readFileSync(path.join(SITE, 'portfolio', slug, 'sheets.json'), 'utf8'));
  const sh = list.find(x => re.test(x.title));
  return sh && { slug, sh, cap, name: CARDS.find(c => c.slug === slug).name };
}).filter(Boolean);
const OLD = [
  { href: '../portfolio/demo/presentation.html', img: '../portfolio/demo/06-koncept/renders/01-gostinaya-kuhnya.jpg', w: 1536, h: 1024,
    name: 'Квартира 56 м², джапанди', sheets: 30, note: 'Тот же бриф, что у демо-квартиры нового формата выше: сравните 30 листов старого формата с полным альбомом.' },
  { href: '../portfolio/dom-120/presentation.html', img: '../portfolio/dom-120/06-koncept/renders/02-gostinaya-kuhnya.jpg', w: 1536, h: 1024,
    name: 'Дом 120 м² в два этажа', sheets: 56, note: 'Демо-дом в старом формате: планы, развёртки, узлы и смета без проверки по нормам.' },
];
const hubTitle = `Портфолио LINEA — ${NUM_W[NEW_N] || NEW_N} проектов нового формата целиком`;
w('portfolio-hub/index.html', page({
  file: 'portfolio-hub/index.html',
  sec: 'cases',
  title: hubTitle,
  desc: `${plural(NEW_N, 'дизайн-проект', 'дизайн-проекта', 'дизайн-проектов')} открыты целиком: квартиры и дома от ${fmtA(AR_MIN)} до ${fmtA(AR_MAX)} м², `
    + `${plural(GOST_SHEETS, ...LIST)} A3 по ГОСТ, ${plural(VISUALS, 'визуализация', 'визуализации', 'визуализаций')} сверены с макетом. Правки голосом на листах.`,
  h1: 'Портфолио: проекты открыты целиком',
  crumb: 'Портфолио',
  lead: `Обычно студия показывает пять красивых кадров и обещает «полный комплект чертежей». Мы выкладываем комплект целиком:
    ${NUM_W[NEW_N] || NEW_N} проектов нового формата, ${GOST_SHEETS} листов — каждый можно открыть, рассмотреть и оставить к нему правку голосом.`,
  ogImage: CARDS.find(c => c.hero && c.hero.kind === 'render').hero.src,
  jsonld: [crumbsLd([['LINEA', BASE + '/'], ['Портфолио', BASE + '/portfolio-hub/']]), {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'Проекты LINEA нового формата',
    itemListElement: CARDS.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${BASE}/portfolio/${c.slug}/`, name: c.name })),
  }],
  body: `<section class="blk">
  <div class="wrap">
    <div class="stats" style="margin-top:0">
      <div><b>${NEW_N}</b><span>проектов нового формата</span></div>
      <div><b>${GOST_SHEETS}</b><span>${word(GOST_SHEETS, 'лист', 'листа', 'листов')} A3 по ГОСТ</span></div>
      <div><b>${VISUALS}</b><span>${word(VISUALS, 'визуализация', 'визуализации', 'визуализаций')} сверены с макетом — у ${VIS_N} из ${NEW_N} проектов</span></div>
      <div><b>${FL_MIN}–${FL_MAX}</b><span>${word(FL_MAX, ...LIST)} в альбоме квартиры</span></div>
      <div><b>${HS_MIN}–${HS_MAX}</b><span>${word(HS_MAX, ...LIST)} в альбоме дома</span></div>
    </div>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Новый формат · 2026</div>
    <h2>${NUM_W[NEW_N] ? NUM_W[NEW_N][0].toUpperCase() + NUM_W[NEW_N].slice(1) : NEW_N} проектов — новые первыми</h2>
    <p class="sub">Каждый проект — это полный альбом по ГОСТ с проверкой по нормам и альбом для заказчика. Визуализации, сверенные
    с макетом (мебель, окна и двери там же, где на чертежах), есть у ${VIS_N} из ${NEW_N} проектов — число кадров стоит в карточке.
    У остальных кадры в альбоме для заказчика сверку с макетом ещё не прошли.
    Площадь в карточках — общая по экспликации альбома (сумма помещений с титульного листа). Комплекты предварительные:
    до контрольного обмера по ним не строят.</p>
    <div class="tiles">
${CARDS.map(tileOf).join('\n')}
    </div>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Как смотреть</div>
    <h2>Три способа посмотреть любой проект</h2>
    <div class="cards g3">
      <div class="card"><h3>Страница проекта</h3><p>Визуализации, цифры и все листы по разделам — в том же порядке, что в выданном альбоме.</p></div>
      <div class="card"><h3>Два PDF</h3><p>Альбом для заказчика — с визуализациями перед развёртками своих стен; полный альбом — для строителей, со всеми разделами и сметой.</p></div>
      <div class="card"><h3>Правки голосом</h3><p>Откройте лист, нажмите на нужное место и скажите, что поменять. В PDF на каждой странице есть кнопка «Правка к этому листу».</p></div>
    </div>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Листы крупно</div>
    <h2>${NUM_W[PLATES.length] ? NUM_W[PLATES.length][0].toUpperCase() + NUM_W[PLATES.length].slice(1) : PLATES.length} листов из разных альбомов — как есть</h2>
    <div class="plates">
      ${PLATES.map(p => `<a class="plate" href="../review.html?p=${p.slug}&amp;s=${encodeURIComponent(p.sh.file)}" rel="nofollow">
        <span class="plate-img"><img src="../portfolio/${p.slug}/sheets/${encodeURIComponent(p.sh.file)}" alt="${esc(p.cap)} — ${esc(p.name)}" width="1587" height="1123" loading="lazy" decoding="async"></span>
        <span class="plate-cap"><i>Лист ${p.sh.no}</i>${esc(p.cap)} · ${esc(p.name)}</span>
      </a>`).join('\n      ')}
    </div>
    <div class="cta-row" style="margin-top:26px">
      <a class="btn" href="../brief.html">Свой проект — бриф голосом</a>
      <a class="btn ghost" href="../gost/">Как устроен и проверяется альбом</a>
    </div>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Архив</div>
    <h2>Первая версия, старый формат</h2>
    <p class="sub">С этих двух демо студия начиналась. Альбомы короче, без проверки по нормам и без альбома для заказчика —
    оставлены для сравнения. Новые версии этих же объектов — в списке выше.</p>
    <div class="tiles">
${OLD.map(o => `      <a class="tile" href="${o.href}">
        <img src="${o.img}" alt="${esc(o.name)} — визуализация первой версии" width="${o.w}" height="${o.h}" loading="lazy" decoding="async" style="filter:saturate(.75)">
        <div class="tile-body"><span class="tag">Первая версия · старый формат</span><b>${esc(o.name)}</b>
        <span class="tile-lead">${esc(o.note)}</span>
        <span class="tile-figs"><i><b>${o.sheets}</b>${word(o.sheets, ...LIST)}</i></span></div>
      </a>`).join('\n')}
    </div>
    <p class="hint" style="margin-top:18px">У первой версии три входа: <a href="../portfolio/demo/presentation.html">листалка</a>,
    <a href="../portfolio/demo/index.html">все файлы</a> и <a href="../portfolio/demo/print.html">версия для печати</a> (на примере квартиры).</p>
  </div>
</section>`
}));

/* ---------------------------------------------------------- процесс */
// путь клиента: голосовой бриф → альбом → правки голосом на листах → финал. Сроки — одно правило студии (site-shell.js).
const STEPS = [
  ['Бриф голосом', 'около 10 минут', 'Расскажите о квартире или доме голосом или заполните форму: что за объект, кто живёт, что нравится. Приложите план — от застройщика, БТИ, фото листка с размерами от руки.',
    'Получение брифа подтверждаем в течение дня. Если что-то не сходится — зададим вопросы.'],
  ['Альбом', `до 48 часов — квартира, до 72 — дом`, 'Собираем два альбома: полный по ГОСТ для строителей — с проверкой по нормам — и альбом для заказчика с визуализациями. Срок — от получения брифа с планом.',
    `Квартира — ${range(FL_MIN, FL_MAX, ...LIST)} A3, дом — ${range(HS_MIN, HS_MAX, ...LIST)} (так вышло на наших ${NEW_N} проектах).`],
  ['Правки голосом на листах', 'когда удобно', 'Открываете лист на сайте или в PDF, нажимаете на место на чертеже и говорите, что поменять: «диван к окну», «розетку выше». Все правки уходят одним сообщением.',
    'В PDF на каждой странице есть кнопка «Правка к этому листу».'],
  ['Финальный выпуск', 'после правок', 'Вносим правки в данные проекта — и альбом пересобирается целиком: листы, ведомости и смета меняются вместе, ничего не забыто.',
    'Перед работами — контрольный обмер: задание на него уже лежит в альбоме.'],
];
w('process/index.html', page({
  file: 'process/index.html',
  sec: 'compare',
  title: 'Как проходит работа — бриф голосом, альбом, правки на листах | LINEA',
  desc: 'Четыре шага: бриф голосом за 10 минут, два альбома — по ГОСТ и для заказчика (квартира до 48 часов, дом до 72), правки голосом на листах, финальный выпуск.',
  h1: 'Как проходит работа',
  crumb: 'Процесс',
  lead: 'Четыре шага: рассказать о доме, получить альбом, надиктовать правки прямо на листах, забрать финальный выпуск. Первый вариант квартиры — до 48 часов, дома — до 72 от получения брифа с планом. На время открытого тестирования — бесплатно.',
  jsonld: [
    crumbsLd([['LINEA', BASE + '/'], ['Процесс', BASE + '/process/']]),
    { '@context': 'https://schema.org', '@type': 'HowTo', name: 'Как получить дизайн-проект в LINEA',
      estimatedCost: { '@type': 'MonetaryAmount', currency: 'RUB', value: '0' },
      step: STEPS.map((st, i) => ({ '@type': 'HowToStep', position: i + 1, name: st[0], text: `${st[2]} ${st[3]}`, url: `${BASE}/process/#step-${i + 1}` })) },
  ],
  body: `<section class="blk">
  <div class="wrap">
    <div class="kicker">Путь клиента</div>
    <h2>Четыре шага</h2>
    <ol class="g-steps">
      ${STEPS.map((st, i) => `<li id="step-${i + 1}"><h3>${esc(st[0])}</h3><p><b>${esc(st[1])}</b></p><p>${esc(st[2])}</p><p class="hint">${esc(st[3])}</p></li>`).join('\n      ')}
    </ol>
    <div class="cta-row" style="margin-top:28px">
      <a class="btn" href="../brief.html">🎤 Начать бриф голосом</a>
      <a class="btn ghost" href="../review.html?p=gost-lineademo" rel="nofollow">Попробовать правки на демо-альбоме</a>
    </div>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Что на руках</div>
    <h2>Два альбома вместо одного</h2>
    <div class="pas-grid">
      <div class="pas-col good">
        <h3>Альбом для заказчика</h3>
        <ul>
          <li>Визуализации стоят перед развёртками своих стен — видно, что и где будет</li>
          <li>План мебели с выносками «наименование, ширина × глубина, высота»</li>
          <li>Цвета и материалы с образцами</li>
        </ul>
      </div>
      <div class="pas-col good">
        <h3>Полный альбом по ГОСТ</h3>
        <ul>
          <li>Рабочая документация для строителей: размеры, отметки, узлы, ведомости</li>
          <li>Каждый лист прошёл проверку по нормам; что осталось решить — на листе «Открытые вопросы»</li>
          <li>Смета и спецификация считаются из тех же данных, что чертежи</li>
        </ul>
      </div>
    </div>
    <p class="sub" style="margin-top:26px">Состав полного альбома по фактическим разделам: ${SECTIONS_FACT.join('; ')}.</p>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Правки</div>
    <h2>Что происходит, когда что-то не нравится</h2>
    <div class="pas-grid">
      <div class="pas-col">
        <h3>Как обычно</h3>
        <ul>
          <li>Список замечаний письмом: «на третьем листе справа внизу…»</li>
          <li>Правка планировки — переделка каждого листа руками; часть листов забывают обновить</li>
          <li>Смета пересчитывается отдельно и расходится с чертежами</li>
        </ul>
      </div>
      <div class="pas-col good">
        <h3>Как у нас</h3>
        <ul>
          <li>Правка ставится меткой прямо на лист и надиктовывается голосом</li>
          <li>Правка вносится в данные проекта — альбом пересобирается целиком, забыть лист нельзя</li>
          <li>Смета и спецификация пересчитываются вместе с чертежами</li>
        </ul>
      </div>
    </div>
    <div class="cta-row" style="margin-top:28px">
      <a class="btn" href="../brief.html">Начать с брифа</a>
      <a class="btn ghost" href="../faq/">Частые вопросы</a>
    </div>
  </div>
</section>`
}));

/* ---------------------------------------------------------- условия и цены */
// объёмы — по фактическим выпускам (sheets.json), так же как в каталоге услуг
const cntBy = re => CARDS.map(c => JSON.parse(fs.readFileSync(path.join(SITE, 'portfolio', c.slug, 'sheets.json'), 'utf8')).filter(x => re.test(x.file)).length);
const MIN_DOCS = Math.min(...FLATS.map(c => JSON.parse(fs.readFileSync(path.join(SITE, 'portfolio', c.slug, 'sheets.json'), 'utf8')).filter(x => !/-decorator-|concept/.test(x.file)).length));
const PLAN_N = cntBy(/-(architect|interior-designer)-/), EST_N = cntBy(/-(estimator|colorist)-/);
w('price/index.html', page({
  file: 'price/index.html',
  sec: 'compare',
  title: 'Стоимость дизайн-проекта — бесплатно на время теста | LINEA',
  desc: `На время теста дизайн-проект бесплатно и без предоплаты: альбом по ГОСТ (квартира — ${range(FL_MIN, FL_MAX, ...LIST)}, дом — ${range(HS_MIN, HS_MAX, ...LIST)}), альбом для заказчика, правки голосом.`,
  h1: 'Стоимость и условия',
  crumb: 'Условия',
  lead: 'Студия работает в режиме открытого тестирования: проект бесплатно, предоплаты нет, альбомы остаются у вас в любом случае. Ниже — что входит, чего нет и чем стоимость проекта отличается от бюджета ремонта.',
  jsonld: [
    crumbsLd([['LINEA', BASE + '/'], ['Условия', BASE + '/price/']]),
    { '@context': 'https://schema.org', '@type': 'Offer', name: 'Дизайн-проект интерьера: альбом по ГОСТ и альбом для заказчика', price: '0', priceCurrency: 'RUB',
      url: `${BASE}/price/`, availability: 'https://schema.org/LimitedAvailability', description: 'Открытое тестирование студии: проект бесплатно, предоплаты нет; квартира — до 48 часов, дом — до 72 часов от получения брифа с планом',
      seller: { '@type': 'ProfessionalService', name: 'LINEA', url: `${BASE}/`, telephone: AUTHOR.tel, email: AUTHOR.email } }
  ],
  body: `<section class="blk">
  <div class="wrap">
    <div class="kicker">Сейчас</div>
    <h2>Что входит и сколько стоит</h2>
    <div class="scroll-x">
      <table class="tbl">
        <tr><th>Услуга</th><th>Объём</th><th>Срок</th><th class="hi">Цена в тесте</th></tr>
        <tr><td><a href="../catalog/dizayn-proekt-kvartiry.html">Дизайн-проект квартиры</a></td><td>альбом по ГОСТ ${range(FL_MIN, FL_MAX, ...LIST)} A3 + альбом для заказчика</td><td>до 48 часов</td><td class="hi">0 ₽</td></tr>
        <tr><td><a href="../catalog/dizayn-proekt-doma.html">Дизайн-проект дома</a></td><td>альбом по ГОСТ ${range(HS_MIN, HS_MAX, ...LIST)} A3 + альбом для заказчика</td><td>до 72 часов</td><td class="hi">0 ₽</td></tr>
        <tr><td><a href="../catalog/rabochaya-dokumentatsiya.html">Только рабочая документация</a></td><td>от ${MIN_DOCS} ${MIN_DOCS % 10 === 1 && MIN_DOCS % 100 !== 11 ? 'листа' : 'листов'} A3 (альбом без концепции и декора)</td><td>до 48 ч, дом — до 72</td><td class="hi">0 ₽</td></tr>
        <tr><td><a href="../catalog/planirovochnoe-reshenie.html">Планировочное решение</a></td><td>${range(Math.min(...PLAN_N), Math.max(...PLAN_N), ...LIST)}</td><td>до 48 ч, дом — до 72</td><td class="hi">0 ₽</td></tr>
        <tr><td><a href="../catalog/vizualizatsii.html">Визуализации</a></td><td>в альбоме для заказчика, перед развёртками своих стен</td><td>вместе с проектом</td><td class="hi">0 ₽</td></tr>
        <tr><td><a href="../catalog/smeta-i-komplektatsiya.html">Смета и комплектация</a></td><td>${range(Math.min(...EST_N), Math.max(...EST_N), ...LIST)} в составе альбома</td><td>вместе с проектом</td><td class="hi">0 ₽</td></tr>
      </table>
    </div>
    <p class="hint" style="margin-top:14px">Срок — до первого варианта проекта, отсчёт от получения брифа с планом; получение брифа подтверждаем в течение дня.
    Объёмы — по нашим ${NUM_IN[NEW_N] || NEW_N} выпущенным проектам, у вашего объекта число листов зависит от числа помещений.
    Тестирование не бессрочное: о старте платного периода предупредим заранее, участникам теста цена фиксируется.</p>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Честно</div>
    <h2>Что входит бесплатно, а чего мы не делаем</h2>
    <div class="pas-grid">
      <div class="pas-col good">
        <h3>Входит</h3>
        <ul>
          <li>Бриф голосом или формой и вопросы по нему</li>
          <li>Полный альбом по ГОСТ с проверкой по нормам и альбом для заказчика с визуализациями</li>
          <li>Правки голосом прямо на листах и перевыпуск альбома с ними</li>
          <li>Смета, спецификация и задание на контрольный обмер — в составе альбома</li>
        </ul>
      </div>
      <div class="pas-col">
        <h3>Не входит</h3>
        <ul>
          <li>Выезд и обмер на объекте: работаем удалённо, контрольный обмер — перед закупкой и работами</li>
          <li>Согласование перепланировки в жилинспекции и расчёт несущих конструкций — это работа организаций с допуском</li>
          <li>Строительные работы и авторский надзор на объекте</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="blk" id="calc">
  <div class="wrap">
    <div class="kicker">Калькулятор</div>
    <h2>Сколько листов будет в вашем альбоме</h2>
    <p class="sub">Оценка по ${NUM_IN[NEW_N] || NEW_N} выпущенным альбомам: квартиры на ${Math.min(...FLATS.map(c => c.rooms))}–${Math.max(...FLATS.map(c => c.rooms))} помещений — ${range(FL_MIN, FL_MAX, ...LIST)}, дома — ${range(HS_MIN, HS_MAX, ...LIST)}. Разброс у реальных проектов — до ±${LS.dev} листов: больше мебели на заказ и мокрых зон — больше листов.</p>
    <div class="calc" data-calc>
      <div class="calc-row"><span>Помещений (комнаты, кухня, санузлы, прихожая, гардеробная)</span>
        <div class="calc-num"><button type="button" data-mm="-1" aria-label="Меньше помещений">−</button><b data-rooms>6</b><button type="button" data-mm="1" aria-label="Больше помещений">+</button></div>
      </div>
      <div class="calc-row"><span>Этажей</span>
        <div class="calc-num"><button type="button" data-fm="-1" aria-label="Меньше этажей">−</button><b data-floors>1</b><button type="button" data-fm="1" aria-label="Больше этажей">+</button></div>
      </div>
      <div class="calc-out">
        <div><b data-base>—</b><span>листов в альбоме, около</span></div>
        <div><b>${SECTIONS_FACT.length}</b><span>разделов</span></div>
        <div><b data-elev>—</b><span>из них развёрток стен, около</span></div>
      </div>
      <p class="hint">Разделы альбома: ${SECTIONS_FACT.join('; ')}. Плюс отдельный альбом для заказчика с визуализациями.</p>
      <div class="cta-row"><a class="btn" href="../brief.html">Собрать такой альбом — бриф</a></div>
    </div>
  </div>
</section>
<script>
(function () {
  var root = document.querySelector('[data-calc]'); if (!root) return;
  var rooms = 6, floors = 1;
  var $ = function (sel) { return root.querySelector(sel); };
  function render() {
    $('[data-rooms]').textContent = rooms;
    $('[data-floors]').textContent = floors;
    // коэффициенты посчитаны генератором по выпущенным альбомам (tools/gen-more-pages.js, LS):
    // листы квартиры ≈ ${LS.b} + ${LS.k} × помещений; каждый следующий этаж ≈ +${LS.floor}; развёрток ≈ ${LS.elev} на помещение
    $('[data-base]').textContent = Math.round(${LS.b} + ${LS.k} * rooms + ${LS.floor} * (floors - 1));
    $('[data-elev]').textContent = Math.round(${LS.elev} * rooms);
  }
  root.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-mm],button[data-fm]'); if (!b) return;
    if (b.dataset.mm) rooms = Math.min(25, Math.max(2, rooms + (+b.dataset.mm)));
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
// Ответы — только то, что подтверждается выпусками и устройством сайта. Цифр «на всякий случай» не пишем.
const FAQ = [
  ['В чём подвох, если проект бесплатный?', 'Подвоха нет, но есть причина: студия в открытом тестировании и проверяет свой способ работы на настоящих объектах. '
    + 'Предоплаты нет ни на одном шаге, оба альбома остаются у вас, даже если дальше работать не станем. Взамен просим честную обратную связь — что понятно, '
    + 'что нет, что пришлось переспрашивать у строителей. Тестирование не бессрочное: о платном периоде предупредим заранее, участникам теста цена фиксируется.'],
  ['Что я получу на руки?', `Два PDF. Полный альбом по ГОСТ — рабочая документация для строителей: ${SECTIONS_FACT.join('; ')}. `
    + `На наших проектах это ${range(FL_MIN, FL_MAX, ...LIST)} A3 для квартиры и ${range(HS_MIN, HS_MAX, ...LIST)} для дома. И альбом для заказчика: визуализации стоят перед развёртками своих стен, у мебели на плане — размеры.`],
  ['Сколько ждать?', 'Первый вариант проекта квартиры — до 48 часов, дома — до 72 часов от получения брифа с планом. Получение брифа подтверждаем в течение дня. '
    + 'Сам бриф занимает около 10 минут, начать можно с рассказа голосом.'],
  ['Примут ли альбом строители?', 'Полный альбом оформлен по правилам проектной документации (СПДС): штамп, масштаб из ряда ГОСТ, цепочки размеров, отметки, узлы, '
    + 'ведомости и смета. Каждый лист проходит автоматическую проверку по нормам — у каждого правила записан источник: пункт ГОСТ, СП или практика бюро. Но честно о границах: '
    + 'размеры сняты с вашего плана, поэтому альбом предварительный — на листах напечатано «не для производства работ», пока не сделан контрольный обмер. '
    + 'Задание на обмер уже лежит в альбоме. Подписей проверяющего и нормоконтролёра на листах нет: в штампе стоит фамилия автора проекта.'],
  ['Как оставить правки?', 'Голосом прямо на листе. Откройте лист на странице проекта или нажмите в PDF кнопку «Правка к этому листу», ткните в нужное место чертежа — '
    + 'появится метка — и скажите, что поменять: «диван развернуть к окну», «розетку выше». Можно и текстом. Все правки уходят одним сообщением через «Поделиться» '
    + 'или файлом. Мы вносим их в данные проекта, и альбом пересобирается целиком — листы, ведомости и смета меняются вместе.'],
  ['Что если у меня нет плана?', 'Подойдёт любой: от застройщика, из БТИ, проект дома, фото листка с размерами от руки или фото стен на телефон. Если нет совсем ничего — '
    + 'шаг с планом в брифе можно пропустить, договоримся, как снять размеры. Срок «до 48 / до 72 часов» отсчитывается от момента, когда план с размерами у нас: '
    + 'без размеров чертежи не строятся.'],
  ['Что такое «открытые вопросы» в альбоме — это ошибки?', 'Нет. Проверка делит находки на два вида. Блокеры — то, с чем альбом не выдаётся: проём не помещается '
    + 'в стену, лист вылез за формат, жилая комната без окна. Всё остальное — вопросы и рекомендации: что уточнить на обмере, какое допущение принято, '
    + 'где можно сделать лучше. Они собраны на листе «Открытые вопросы» в начале альбома и решаются вместе с вами.'],
  ['Вы делаете перепланировку и согласование?', 'Предлагаем перепланировку и показываем её на листах демонтажа и монтажа, но согласование в жилинспекции и расчёт несущих '
    + 'конструкций не берём: это работа организаций с допуском. Если несущие не определены, это вынесено в открытые вопросы.'],
  ['Смета — это точная цена ремонта?', 'Это ориентировочный расчёт на дату выпуска: объёмы взяты из чертежей, цены — на момент расчёта. Материалы дорожают и дешевеют, '
    + 'поэтому перед закупкой цены нужно сверить. Офертой смета не является.'],
  ['Нужен ли выезд на объект?', 'Проект делается удалённо — достаточно плана с размерами и фото. Контрольный обмер на объекте нужен перед закупкой и работами: '
    + 'что именно померить и проверить, написано в задании на обмер внутри альбома.'],
  ['Кто ведёт проект?', `${AUTHOR.role[0].toUpperCase() + AUTHOR.role.slice(1)} ${AUTHOR.name}. Его фамилия стоит в основной надписи листов; телефон и почта — на странице контактов и внизу каждой страницы сайта.`],
];
w('faq/index.html', page({
  file: 'faq/index.html',
  sec: 'compare',
  title: 'Вопросы и ответы о дизайн-проекте — бесплатно, правки голосом | LINEA',
  desc: 'В чём подвох бесплатного проекта, что получу на руки, сколько ждать, примут ли альбом строители, как оставить правки голосом и что делать, если нет плана.',
  h1: 'Вопросы и ответы',
  crumb: 'FAQ',
  lead: 'Честно о главном — от того, зачем мы делаем проект бесплатно, до того, что строители скажут об альбоме. Если вопроса нет — звоните или пишите: контакты внизу каждой страницы.',
  jsonld: [
    crumbsLd([['LINEA', BASE + '/'], ['FAQ', BASE + '/faq/']]),
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f[0], acceptedAnswer: { '@type': 'Answer', text: f[1] } })) }
  ],
  body: `<section class="blk">
  <div class="wrap">
    <div class="kicker">Коротко о главном</div>
    <h2>${plural(FAQ.length, 'вопрос', 'вопроса', 'вопросов')}</h2>
    ${FAQ.map((f, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(f[0])}</summary><p>${esc(f[1])}</p></details>`).join('\n    ')}
    <div class="cta-row" style="margin-top:30px">
      <a class="btn" href="../brief.html">🎤 Бриф голосом — около 10 минут</a>
      <a class="btn ghost" href="../portfolio-hub/">Посмотреть проекты</a>
    </div>
  </div>
</section>`
}));

/* ---------------------------------------------------------- политика */
w('policy/index.html', page({
  file: 'policy/index.html',
  title: 'Политика обработки персональных данных — LINEA',
  desc: 'Какие данные собирает сайт LINEA, что происходит с брифом, где хранятся контакты и как отозвать согласие. Сайт статический, счётчиков аналитики нет.',
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
    <p class="sub">Запросить, какие ваши данные у нас есть; исправить их; удалить; отозвать согласие на обработку. Для любого из этих действий достаточно письма на <a href="mailto:${AUTHOR.email}">${AUTHOR.email}</a> — отвечаем в течение дня, удаляем в течение трёх рабочих дней и подтверждаем удаление письмом.</p>
    <p class="hint">Документ описывает фактическое положение дел на дату публикации страницы. Если появится серверная форма, аналитика или рассылка, страница будет обновлена до, а не после запуска.</p>
  </div>
</section>`
}));

/* ---------------------------------------------------------- карта сайта */
const MAP = [
  ['Услуги', [['Каталог услуг', 'catalog/'], ['Дизайн-проект квартиры', 'catalog/dizayn-proekt-kvartiry.html'], ['Дизайн-проект дома', 'catalog/dizayn-proekt-doma.html'], ['Только рабочая документация', 'catalog/rabochaya-dokumentatsiya.html'], ['Планировочное решение', 'catalog/planirovochnoe-reshenie.html'], ['Визуализации', 'catalog/vizualizatsii.html'], ['Смета и комплектация', 'catalog/smeta-i-komplektatsiya.html'], ['Стоимость и условия', 'price/']]],
  ['Работы', [['Портфолио', 'portfolio-hub/'], ...CARDS.map(c => [c.name, `portfolio/${c.slug}/`]), ['Кейсы', 'cases/'], ['Первая версия: квартира (старый формат)', 'portfolio/demo/presentation.html'], ['Первая версия: дом (старый формат)', 'portfolio/dom-120/presentation.html']]],
  ['Разобраться', [['Сравнение с рынком', 'compare/'], ['Как проходит работа', 'process/'], ['Вопросы и ответы', 'faq/'], ['Журнал', 'journal/'], ['Состав дизайн-проекта', 'journal/sostav-dizayn-proekta.html'], ['Развёртки стен', 'journal/razvertki-sten.html'], ['Электрика в проекте', 'journal/elektrika-v-proekte.html'], ['Пирог пола', 'journal/pirog-pola.html'], ['Смета ремонта', 'journal/smeta-remonta.html']]],
  ['Стили', [['Все стили', 'style/'], ['Джапанди', 'style/japandi.html'], ['Скандинавский', 'style/scandi.html'], ['Минимализм', 'style/minimal.html'], ['Современный', 'style/modern.html'], ['Неоклассика', 'style/neoclassic.html'], ['Лофт', 'style/loft.html']]],
  ['Документация', [['Рабочая документация по ГОСТ', 'gost/'], ['Открытые вопросы и знак «*»', 'gost/otkrytye-voprosy/'], ['Правки голосом на листах', 'review.html?p=gost-lineademo']]],
  ['Студия', [['О студии', 'about/'], ['Контакты', 'contacts/'], ['Истории', 'stories/'], ['Отзывы', 'reviews/'], ['Бриф голосом', 'brief.html'], ['Чек-лист приёмки проекта', 'checklist/'], ['Политика обработки данных', 'policy/']]]
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
  lead: 'Подтвердим получение брифа в течение дня и вернёмся с уточняющими вопросами. Если что-то срочное — звоните напрямую, телефон ниже.',
  body: `<section class="blk">
  <div class="wrap">
    <div class="kicker">Что дальше</div>
    <h2>Что будет дальше</h2>
    <ol class="steps-list">
      <li><h3>Подтвердим получение</h3><p>В течение дня. Если в размерах что-то не сходится — вернёмся с вопросами.</p></li>
      <li><h3>Выпустим альбом</h3><p>Первый вариант проекта квартиры — до 48 часов от получения брифа с планом, дома — до 72: полный альбом по ГОСТ и альбом для заказчика с визуализациями.</p></li>
      <li><h3>Вы надиктуете правки</h3><p>Прямо на листах: откройте лист, нажмите на нужное место и скажите, что поменять. Альбом перевыпустим с правками.</p></li>
    </ol>
    <div class="cta-row" style="margin-top:30px">
      <a class="btn ghost" href="../portfolio-hub/">Посмотреть проекты, пока ждёте</a>
      <a class="btn ghost" href="../review.html?p=gost-lineademo" rel="nofollow">Попробовать правки голосом на демо</a>
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
        'В штампе указан автор проекта, и понятно, как с ним связаться',
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
