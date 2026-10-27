#!/usr/bin/env node
'use strict';
/**
 * Недостающие страницы сайта: портфолио, процесс, условия, FAQ,
 * политика обработки данных, карта сайта, страница благодарности.
 *
 *   node tools/gen-more-pages.js
 *
 * Политика написана по факту (27.10.2026): бриф принимает сервер на Beget (на GitHub Pages —
 * архив, который клиент сам шлёт в WhatsApp или на почту), черновик брифа и правок лежит
 * в браузере, оплата — через ЮKassa, счётчиков аналитики нет. Ничего «на всякий случай»
 * не дописываем — обещать сбор данных, которого нет, так же плохо, как умалчивать о реальном.
 * Здесь же — оплата (oplata/), черновик договора-оферты (oferta/) и согласие на обработку
 * персональных данных (soglasie/): условия берутся из site-shell.js → TERMS.
 */

const fs = require('fs');
const path = require('path');
const SHELL = require('./site-shell.js');
const OPEN = require('./gost-open-issues.js');

const SITE = path.join(__dirname, '..', 'site');
const { AUTHOR, BASE, esc, crumbsLd, TERMS } = SHELL;
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
// визуализации: visuals — кадры, сверенные с планом и подписанные дизайнером; visualsPrelim — сверены исполнителем, ждут подписи
// (статус решает приёмка движка — gost-draft tools/views-check.js, см. renders() в gen-gost-pages.js)
const VISUALS = CARDS.reduce((n, c) => n + (c.visuals || 0), 0);
const VIS_PRE = CARDS.reduce((n, c) => n + (c.visualsPrelim || 0), 0);
const VIS_N = CARDS.filter(c => c.visuals || c.visualsPrelim).length;
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
  'развёртки стен и узлы', 'ведомость объёмов работ, спецификация материалов и ориентировочная смета'];
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
        <span class="tile-figs"><i><b>${c.total}</b>${word(c.total, 'лист', 'листа', 'листов')}</i><i><b>${c.area.replace(' м²', '')}</b>м²</i><i><b>${c.rooms}</b>${word(c.rooms, 'помещение', 'помещения', 'помещений')}</i>${c.visuals ? `<i><b>${c.visuals}</b>${word(c.visuals, 'кадр подписан', 'кадра подписаны', 'кадров подписаны')}</i>` : ''}</span></div>
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
    name: 'Дом 120 м² в два этажа (по брифу)', sheets: 56, note: 'Демо-дом в старом формате: планы, развёртки, узлы и смета без автопроверки оформления.' },
];
const hubTitle = `Портфолио LINEA — ${NUM_W[NEW_N] || NEW_N} проектов нового формата целиком`;
w('portfolio-hub/index.html', page({
  file: 'portfolio-hub/index.html',
  sec: 'portfolio',
  title: hubTitle,
  desc: `${plural(NEW_N, 'дизайн-проект', 'дизайн-проекта', 'дизайн-проектов')} открыты целиком: квартиры и дома от ${fmtA(AR_MIN)} до ${fmtA(AR_MAX)} м², `
    + `${plural(GOST_SHEETS, ...LIST)} A3. Предварительные комплекты до обмера, правки голосом на листах.`,
  h1: 'Портфолио: проекты открыты целиком',
  crumb: 'Портфолио',
  lead: `Обычно студия показывает пять красивых кадров и обещает «полный комплект чертежей». Мы выкладываем комплект целиком:
    ${NUM_W[NEW_N] || NEW_N} проектов нового формата, ${GOST_SHEETS} листов — каждый можно открыть, рассмотреть и оставить к нему правку голосом.
    Все комплекты предварительные: пока открыты вопросы к заказчику и не сделан контрольный обмер, по ним не строят.`,
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
      ${VISUALS ? `<div><b>${VISUALS}</b><span>${word(VISUALS, 'кадр сверен', 'кадра сверены', 'кадров сверены')} с планом и ${VISUALS % 10 === 1 && VISUALS % 100 !== 11 ? 'подписан' : 'подписаны'} дизайнером${VIS_PRE ? `, ещё ${VIS_PRE} ждут подписи` : ''}</span></div>` : ''}
      <div><b>${FL_MIN}–${FL_MAX}</b><span>${word(FL_MAX, ...LIST)} в альбоме квартиры</span></div>
      <div><b>${HS_MIN}–${HS_MAX}</b><span>${word(HS_MAX, ...LIST)} в альбоме дома</span></div>
    </div>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Новый формат · 2026</div>
    <h2>${NUM_W[NEW_N] ? NUM_W[NEW_N][0].toUpperCase() + NUM_W[NEW_N].slice(1) : NEW_N} проектов — новые первыми</h2>
    <p class="sub">Каждый проект — полный альбом по ГОСТ с автопроверкой оформления и альбом для заказчика.
    <b>Комплекты предварительные:</b> на каждом листе стоит пометка «ПРЕДВАРИТЕЛЬНО», пока по объекту открыты вопросы к заказчику
    и не сделан контрольный обмер; по таким листам не строят. Визуализации, сверенные с планом по чек-листу (мебель, двери,
    сантехника и свет там же, где на чертежах), сейчас есть у ${VIS_N} из ${NEW_N} проектов; у остальных кадры пересверяются,
    и в карточке вместо кадра — лист плана мебели.
    Площадь в названии и в карточке — общая по экспликации альбома (сумма помещений с титульного листа).
    ${CARDS.some(c => c.preReview) ? 'Альбомы выпущены до разбора замечаний практикующего проектировщика (22.10.2026) — перевыпуск готовится.' : ''}</p>
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
      <div class="card"><h3>Два PDF</h3><p>Альбом для заказчика — с визуализациями перед развёртками своих стен; полный альбом — все разделы и смета, для строителей после ответов на вопросы и обмера.</p></div>
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
    <p class="sub">С этих двух демо студия начиналась. Альбомы короче, без автопроверки оформления и без альбома для заказчика —
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
// путь клиента: бриф → цена и оплата → предварительный альбом → правки голосом → ответы на вопросы и обмер → перевыпуск без пометки.
// Сроки и условия — одно правило студии (site-shell.js → TERMS).
const STEPS = [
  ['Бриф голосом', 'около 10 минут', 'Расскажите о квартире или доме голосом или заполните форму: что за объект, кто живёт, что нравится. Приложите план — от застройщика, БТИ, фото листка с размерами от руки.',
    'Бриф уходит к нам одной кнопкой, вы сразу получаете номер заказа.'],
  ['Цена и оплата', 'до начала работы', 'По брифу называем стоимость и срок. Работа над проектом начинается после оплаты — онлайн или по счёту.',
    'Как платить и что с возвратом — на страницах «Оплата» и «Договор-оферта».'],
  ['Предварительный альбом', 'до 48 часов — квартира, до 72 — дом', 'Собираем два альбома: полный по ГОСТ и альбом для заказчика с визуализациями. Срок — от оплаты и получения плана с размерами.',
    `На листах стоит пометка «ПРЕДВАРИТЕЛЬНО»: по объекту остаются вопросы к вам. Объём у наших ${NEW_N} проектов: квартира — ${range(FL_MIN, FL_MAX, ...LIST)} A3, дом — ${range(HS_MIN, HS_MAX, ...LIST)}.`],
  ['Правки голосом на листах', 'когда удобно', 'Открываете лист на сайте или в PDF, нажимаете на место на чертеже и говорите, что поменять: «диван к окну», «розетку выше». Все правки уходят одним сообщением.',
    `В PDF на каждой странице есть кнопка «Правка к этому листу»; ${TERMS.roundsText}.`],
  ['Ответы на вопросы и обмер', 'перед стройкой', 'Отвечаете на открытые вопросы (лист «Открытые вопросы» в начале альбома) и заказываете контрольный обмер по заданию из альбома. Мы вносим ответы и замеры и перевыпускаем альбом целиком.',
    'Когда вопросы закрыты и обмер внесён, пометка «ПРЕДВАРИТЕЛЬНО» снимается — по такому комплекту уже можно работать.'],
];
w('process/index.html', page({
  file: 'process/index.html',
  sec: 'compare',
  title: 'Как проходит работа — бриф, оплата, альбом, правки | LINEA',
  desc: 'Пять шагов: бриф голосом, цена и оплата до начала работы, предварительный альбом (квартира до 48 часов, дом до 72), правки на листах, перевыпуск после обмера.',
  h1: 'Как проходит работа',
  crumb: 'Процесс',
  lead: `Пять шагов: рассказать о доме, узнать цену и оплатить, получить предварительный альбом, надиктовать правки на листах, ответить на вопросы и сделать обмер — и забрать комплект без пометки «ПРЕДВАРИТЕЛЬНО». ${TERMS.start}; ${TERMS.term}.`,
  jsonld: [
    crumbsLd([['LINEA', BASE + '/'], ['Процесс', BASE + '/process/']]),
    { '@context': 'https://schema.org', '@type': 'HowTo', name: 'Как получить дизайн-проект в LINEA',
      step: STEPS.map((st, i) => ({ '@type': 'HowToStep', position: i + 1, name: st[0], text: `${st[2]} ${st[3]}`, url: `${BASE}/process/#step-${i + 1}` })) },
  ],
  body: `<section class="blk">
  <div class="wrap">
    <div class="kicker">Путь клиента</div>
    <h2>Пять шагов</h2>
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
          <li>Все разделы для строителей: размеры, отметки, узлы, ведомости — после ответов на вопросы и обмера</li>
          <li>Автопроверка оформления; что осталось решить с вами — на листе «Открытые вопросы»</li>
          <li>Смета и спецификация считаются из тех же данных, что чертежи</li>
        </ul>
      </div>
    </div>
    <p class="sub" style="margin-top:26px">Состав полного альбома по фактическим разделам: ${SECTIONS_FACT.join('; ')}.</p>
    <p class="hint">${esc(TERMS.prelim)}</p>
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
const PRICE_KV = TERMS.prices.kvartira ? TERMS.price('kvartira') : 'по брифу', PRICE_DOM = TERMS.prices.dom ? TERMS.price('dom') : 'по брифу';
w('price/index.html', page({
  file: 'price/index.html',
  sec: 'compare',
  title: 'Стоимость дизайн-проекта и условия оплаты | LINEA',
  desc: `Дизайн-проект квартиры или дома: что входит, как считаем цену, оплата до начала работы, срок от оплаты. Квартира — ${range(FL_MIN, FL_MAX, ...LIST)}, дом — ${range(HS_MIN, HS_MAX, ...LIST)}.`,
  h1: 'Стоимость и условия',
  crumb: 'Условия',
  lead: `${TERMS.start}. ${TERMS.how}. Ниже — что именно вы покупаете, что не входит и чем стоимость проекта отличается от бюджета ремонта.`,
  jsonld: [
    crumbsLd([['LINEA', BASE + '/'], ['Условия', BASE + '/price/']]),
    // Offer — только с настоящей ценой (TERMS.prices); пока цен нет, микроразметки цены нет: «0 ₽» в сниппете был бы неправдой
    ...(TERMS.hasPrices ? [{ '@context': 'https://schema.org', '@type': 'OfferCatalog', name: 'Дизайн-проект интерьера', url: `${BASE}/price/`,
      itemListElement: [['kvartira', 'Дизайн-проект квартиры'], ['dom', 'Дизайн-проект дома']].filter(([k]) => TERMS.prices[k]).map(([k, n]) => ({
        '@type': 'Offer', name: n, price: String(TERMS.prices[k]), priceCurrency: 'RUB', url: `${BASE}/brief.html` })) }] : []),
  ],
  body: `<section class="blk">
  <div class="wrap">
    <div class="kicker">Что покупаете</div>
    <h2>Две услуги: проект квартиры и проект дома</h2>
    <div class="scroll-x">
      <table class="tbl">
        <tr><th>Услуга</th><th>Что получаете</th><th>Срок первого варианта</th><th class="hi">Стоимость</th></tr>
        <tr><td><a href="../catalog/dizayn-proekt-kvartiry.html">Дизайн-проект квартиры</a></td><td>полный альбом по ГОСТ (у наших проектов ${range(FL_MIN, FL_MAX, ...LIST)} A3) + альбом для заказчика</td><td>до 48 часов от оплаты и плана</td><td class="hi">${PRICE_KV}</td></tr>
        <tr><td><a href="../catalog/dizayn-proekt-doma.html">Дизайн-проект дома</a></td><td>полный альбом по ГОСТ (${range(HS_MIN, HS_MAX, ...LIST)} A3) + альбом для заказчика</td><td>до 72 часов от оплаты и плана</td><td class="hi">${PRICE_DOM}</td></tr>
      </table>
    </div>
    <p class="hint" style="margin-top:14px">${TERMS.hasPrices ? 'Цена — за проект целиком.' : 'Стоимость называем после брифа, до начала работы: она зависит от площади, числа помещений и этажей, перепланировки и объёма мебели на заказ. Вы видите сумму на странице своего заказа и решаете, платить или нет.'}
    Только рабочая документация или только планировочное решение — <a href="../catalog/">по договорённости</a>, цена тоже по брифу.
    Срок отсчитывается от оплаты и получения плана с размерами. Объёмы — по нашим ${NUM_IN[NEW_N] || NEW_N} выпущенным проектам; у вашего объекта число листов зависит от числа помещений.</p>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Порядок</div>
    <h2>Как платить</h2>
    <ol class="g-steps">
      <li><h3>Бриф</h3><p>Около 10 минут, можно голосом. Бриф уходит к нам одной кнопкой, вы получаете номер заказа и его страницу.</p></li>
      <li><h3>Цена</h3><p>Называем стоимость и срок — до начала работы. Сумма появляется на странице заказа.</p></li>
      <li><h3>Оплата</h3><p>Онлайн через ЮKassa или по счёту. Данные карты вводятся на странице платёжного сервиса — мы их не видим.</p></li>
      <li><h3>Работа</h3><p>После оплаты начинаем; ${esc(TERMS.term)}.</p></li>
    </ol>
    <p class="hint">Подробно — <a href="../oplata/">оплата и чеки</a>, условия и возврат — <a href="../oferta/">договор-оферта</a>.</p>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Честно</div>
    <h2>Что входит, а чего мы не делаем</h2>
    <div class="pas-grid">
      <div class="pas-col good">
        <h3>Входит</h3>
        <ul>
          <li>Бриф голосом или формой и вопросы по нему</li>
          <li>Предварительный комплект: полный альбом по ГОСТ с автопроверкой оформления и альбом для заказчика с визуализациями</li>
          <li>Правки голосом прямо на листах и перевыпуск альбома с ними; ${esc(TERMS.roundsText)}</li>
          <li>Финальный перевыпуск без пометки «ПРЕДВАРИТЕЛЬНО» — после ваших ответов на открытые вопросы и контрольного обмера</li>
          <li>Смета, спецификация и задание на контрольный обмер — в составе альбома</li>
        </ul>
      </div>
      <div class="pas-col">
        <h3>Не входит</h3>
        <ul>
          ${TERMS.notIncluded.map(t => `<li>${esc(t[0].toUpperCase() + t.slice(1))}</li>`).join('\n          ')}
        </ul>
      </div>
    </div>
    <p class="hint" style="margin-top:18px">${esc(TERMS.prelim)}</p>
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
    <p class="sub">Стоимость проекта — это наша работа. Ремонт по проекту стоит отдельных денег, и эту сумму мы считаем построчно, из вашей геометрии, — ориентировочно, на дату выпуска. Тариф в брифе — это уровень материалов в смете ремонта, а не стоимость проекта.</p>
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
  ['Когда и как платить?', `${TERMS.how}. ${TERMS.hasPrices ? '' : 'Стоимость зависит от площади, числа помещений и этажей, перепланировки и мебели на заказ — поэтому называем её по брифу, до начала работы. '}`
    + 'Платить можно онлайн через ЮKassa или по счёту; данные карты вводятся на странице платёжного сервиса. Срок «до 48 / до 72 часов» отсчитывается от оплаты и получения плана с размерами.'],
  ['Что если результат не понравится?', `Сначала — правки: ставите метку на лист и говорите, что поменять, альбом перевыпускается целиком; ${TERMS.roundsText}. `
    + 'Если вы решите отказаться от работы, деньги возвращаем за вычетом того, что к этому моменту уже фактически сделано (ст. 32 Закона «О защите прав потребителей»). '
    + 'Порядок и сроки возврата — в договоре-оферте.'],
  ['Что я получу на руки?', `Два PDF. Полный альбом по ГОСТ: ${SECTIONS_FACT.join('; ')}. `
    + `На наших проектах это ${range(FL_MIN, FL_MAX, ...LIST)} A3 для квартиры и ${range(HS_MIN, HS_MAX, ...LIST)} для дома. И альбом для заказчика: визуализации стоят перед развёртками своих стен, у мебели на плане — размеры. `
    + 'Первый выпуск — предварительный: по нему обсуждают решения, а строят после ваших ответов на вопросы и контрольного обмера.'],
  ['Сколько ждать?', 'Первый вариант проекта квартиры — до 48 часов, дома — до 72 часов от оплаты и получения плана с размерами. Цену по брифу называем до начала работы. '
    + 'Сам бриф занимает около 10 минут, начать можно с рассказа голосом.'],
  ['Можно ли сразу отдать альбом строителям?', 'Нет — и мы говорим это честно. Первый выпуск предварительный: размеры сняты с вашего плана, а часть решений ждёт ваших ответов '
    + '(лист «Открытые вопросы»). Пока это так, на каждом листе стоит пометка «ПРЕДВАРИТЕЛЬНО», и по нему не строят. После ответов и контрольного обмера '
    + '(задание на него — в альбоме) перевыпускаем комплект без пометки. Оформление листов проверяет программа — она ловит наложения, выход за формат, '
    + 'нестыковки между листами, но не отвечает за смысл: поймёт ли прораб лист, решает автор. Практикующий проектировщик разобрал наши альбомы 22.10.2026, '
    + 'и часть листов (развёртки, план розеток, ведомость дверей) мы переделываем по его замечаниям. Подписей проверяющего и нормоконтролёра на листах нет: в штампе — фамилия автора.'],
  ['Как оставить правки?', 'Голосом прямо на листе. Откройте лист на странице проекта или нажмите в PDF кнопку «Правка к этому листу», ткните в нужное место чертежа — '
    + 'появится метка — и скажите, что поменять: «диван развернуть к окну», «розетку выше». Можно и текстом. Все правки уходят одним сообщением. '
    + 'Мы вносим их в данные проекта, и альбом пересобирается целиком — листы, ведомости и смета меняются вместе.'],
  ['Что если у меня нет плана?', 'Подойдёт любой: от застройщика, из БТИ, проект дома, фото листка с размерами от руки или фото стен на телефон. Если нет совсем ничего — '
    + 'шаг с планом в брифе можно пропустить, договоримся, как снять размеры. Срок «до 48 / до 72 часов» отсчитывается от оплаты и момента, когда план с размерами у нас: '
    + 'без размеров чертежи не строятся.'],
  ['Что такое «открытые вопросы» в альбоме — это ошибки?', 'Нет. Это решения, которые без вас не принять: несущие стены, оборудование, модель мебели, что уточнить на обмере. '
    + 'Они собраны на листе «Открытые вопросы» в начале альбома. Пока там что-то открыто, на каждом листе стоит пометка «ПРЕДВАРИТЕЛЬНО» — она снимается сама, '
    + 'когда вопросы закрыты. Отдельно автопроверка находит стоп-ошибки (с ними комплект не выдаётся: проём не помещается в стену, лист вылез за формат) '
    + 'и замечания к доработке — их число стоит на странице каждого альбома.'],
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
  title: 'Вопросы и ответы о дизайн-проекте — оплата, сроки, правки | LINEA',
  desc: 'Когда и как платить, что если не понравится, что получу на руки, сколько ждать, можно ли сразу строить по альбому, как оставить правки голосом.',
  h1: 'Вопросы и ответы',
  crumb: 'FAQ',
  lead: 'Честно о главном — от оплаты и возврата до того, когда по альбому можно строить. Если вопроса нет — звоните или пишите: контакты внизу каждой страницы.',
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
// Редакция документов — одна дата на политику, согласие и оферту: её же пишет в заказ сервер (server/api/brief.php → consent_text)
const LEGAL_ED = '27.10.2026';
const OPERATOR = `${AUTHOR.name}, ${AUTHOR.role}`;
// Реквизиты исполнителя — site-shell.js → TERMS.requisites; пока их нет — честная пометка, а не выдуманные цифры
const reqLine = TERMS.reqLine;
w('policy/index.html', page({
  file: 'policy/index.html',
  title: 'Политика обработки персональных данных — LINEA',
  desc: 'Какие данные собирает сайт LINEA, где хранятся бриф и файлы, кто получает данные при оплате, что остаётся в браузере и как отозвать согласие.',
  h1: 'Обработка персональных данных',
  crumb: 'Правовое',
  lead: `Коротко: бриф с файлами уходит на наш сервер в России (хостинг Beget), оплата идёт через ЮKassa, черновик брифа хранится в вашем браузере, счётчиков аналитики нет. Редакция от ${LEGAL_ED}.`,
  jsonld: [crumbsLd([['LINEA', BASE + '/'], ['Политика', BASE + '/policy/']])],
  body: `<section class="blk">
  <div class="wrap">
    <div class="kicker">Что происходит с данными</div>
    <h2>Кто обрабатывает и что именно</h2>
    <table class="tbl">
      <tr><th>Вопрос</th><th>Ответ</th></tr>
      <tr><td>Оператор</td><td>${esc(OPERATOR)}; ${esc(reqLine)}. Контакты: <a href="tel:${AUTHOR.tel}">${AUTHOR.phone}</a>, <a href="mailto:${AUTHOR.email}">${AUTHOR.email}</a></td></tr>
      <tr><td>Какие данные</td><td>имя, телефон, e-mail, удобный способ связи; адрес и сведения об объекте; планы и фотографии, рассказ о доме — то, что вы сами указываете в брифе;
        текст правок к листам и имя автора правки; при оплате — номер заказа, сумма и статус платежа (данные карты мы не получаем); IP-адрес и время отправки брифа</td></tr>
      <tr><td>Зачем</td><td>назвать цену, выпустить дизайн-проект, связаться с вами по заказу, принять оплату и выдать чек, внести правки; защитить форму от спама (не больше нескольких брифов в час с одного адреса). Рассылок не ведём</td></tr>
      <tr><td>Основание</td><td>ваше согласие (<a href="../soglasie/">текст согласия</a> — отдельная галочка в брифе) и исполнение договора (<a href="../oferta/">договор-оферта</a>)</td></tr>
      <tr><td>Где хранится</td><td>на сервере хостинга Beget (Россия) в закрытой папке вне сайта: заказ в базе, архив брифа с файлами — отдельно по номеру заказа; переписка — в почтовом ящике студии (Mail.ru, Россия); рабочая папка проекта — на компьютере автора</td></tr>
      <tr><td>Сколько</td><td>пока идёт работа и год после выдачи альбома; неоплаченный заказ — до трёх месяцев после брифа; затем удаляем. Раньше — по вашему запросу</td></tr>
      <tr><td>Кто ещё получает данные</td><td>ООО «Бегет» — хостинг сервера (Россия); ООО НКО «ЮМани» (ЮKassa) — при онлайн-оплате получает данные платежа, которые вы вводите на её странице (Россия).
        Только если вы сами выберете такой способ отправки — WhatsApp (Meta, США) или ваша почтовая служба: это трансграничная передача, на которую вы соглашаетесь, отправляя туда архив</td></tr>
    </table>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Техническая правда</div>
    <h2>Что делает сам сайт</h2>
    <ul class="checklist">
      <li>Сайт открывается по двум адресам: основной пока на GitHub Pages (GitHub, США), новый — на хостинге Beget (Россия). Оба хостинга ведут собственные технические журналы доступа (IP-адрес, время, страница)</li>
      <li>Бриф на адресе Beget уходит на наш сервер одной кнопкой; там же принимаются правки к листам. На GitHub Pages сервера нет — там кнопка собирает архив, и вы сами отправляете его в WhatsApp или на почту</li>
      <li><b>Что хранится в вашем браузере</b> (localStorage, только на вашем устройстве): черновик брифа вместе с именем, телефоном и e-mail — чтобы можно было закрыть страницу и вернуться (ключи linea_brief_draft и linea_brief); ссылка на ваш последний заказ (linea_last_order); правки к листам, имя и телефон их автора (linea_review_…). Очистить: кнопка «начать заново» в брифе или очистка данных сайта в браузере</li>
      <li>Голосовой ввод в брифе и правках работает средствами браузера: в Chrome распознавание речи выполняют серверы Google, в Safari — Apple. Не хотите — печатайте текст, микрофон не обязателен</li>
      <li>Шрифты подключаются с Google Fonts (Google, США): их сервер видит IP-адрес и факт запроса — это трансграничная передача технических данных</li>
      <li>Счётчиков аналитики, пикселей рекламных сетей и скриптов слежения на страницах нет. Файлы cookie для посетителей сайт не устанавливает</li>
    </ul>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Ваши права</div>
    <h2>Что вы можете потребовать</h2>
    <p class="sub">Узнать, какие ваши данные у нас есть; исправить их; удалить; отозвать согласие на обработку. Достаточно письма на <a href="mailto:${AUTHOR.email}">${AUTHOR.email}</a> с номером заказа или телефоном из брифа — отвечаем в течение рабочего дня, удаляем в течение трёх рабочих дней и подтверждаем удаление. Если заказ оплачен, данные, нужные для чека и расчётов, храним столько, сколько требует закон.</p>
    <p class="hint">Документ описывает фактическое положение дел на ${LEGAL_ED}. Если появится аналитика, рассылка или новый получатель данных, страница будет обновлена до, а не после запуска.</p>
  </div>
</section>`
}));

/* ---------------------------------------------------------- согласие на обработку ПДн */
// Отдельный документ (152-ФЗ, ст. 9, редакция с 01.09.2025): согласие оформляется отдельно от других документов,
// в брифе — отдельная НЕотмеченная галочка со ссылкой сюда. Вторая галочка (необязательная) — показ проекта в портфолио.
w('soglasie/index.html', page({
  file: 'soglasie/index.html',
  title: 'Согласие на обработку персональных данных — LINEA',
  desc: 'Текст согласия на обработку персональных данных, которое вы даёте галочкой в брифе LINEA: кто оператор, какие данные, зачем, кому передаются, срок и отзыв.',
  h1: 'Согласие на обработку персональных данных',
  crumb: 'Правовое',
  lead: `Это согласие вы даёте, отмечая галочку «Даю согласие на обработку персональных данных» в брифе. Без неё бриф не отправляется. Редакция от ${LEGAL_ED}.`,
  jsonld: [crumbsLd([['LINEA', BASE + '/'], ['Согласие на обработку данных', BASE + '/soglasie/']])],
  body: `<section class="blk">
  <div class="wrap" style="max-width:860px">
    <p class="sub">Отмечая галочку в брифе, я свободно, своей волей и в своём интересе, конкретно, информированно и сознательно даю согласие на обработку моих персональных данных на следующих условиях.</p>
    <h2>1. Оператор</h2>
    <p class="sub">${esc(OPERATOR)}; ${esc(reqLine)}. Контакты: ${AUTHOR.phone}, ${AUTHOR.email}.</p>
    <h2>2. Цели</h2>
    <ul class="checklist">
      <li>рассмотреть бриф, назвать стоимость и срок, связаться со мной по заказу;</li>
      <li>заключить и исполнить договор на дизайн-проект: выпустить альбомы, внести правки, перевыпустить комплект;</li>
      <li>принять оплату, выдать чек, при необходимости вернуть деньги;</li>
      <li>защитить форму от злоупотреблений и разобрать технические сбои.</li>
    </ul>
    <h2>3. Данные</h2>
    <p class="sub">Имя, телефон, e-mail, удобный способ связи; адрес и сведения об объекте; планы, фотографии и рассказ о доме; текст правок к листам; номер заказа, сумма и статус оплаты; IP-адрес и время отправки брифа; отметка о согласии (редакция документа, дата и время). Специальные категории и биометрические данные не запрашиваются и не обрабатываются.</p>
    <h2>4. Действия с данными</h2>
    <p class="sub">Сбор, запись, систематизация, накопление, хранение, уточнение, извлечение, использование, передача лицам из раздела 5, блокирование, удаление, уничтожение — с использованием средств автоматизации и без них.</p>
    <h2>5. Кому передаются</h2>
    <ul class="checklist">
      <li>ООО «Бегет» (Россия) — хостинг сервера, на котором хранятся заказ и архив брифа;</li>
      <li>ООО НКО «ЮМани», сервис ЮKassa (Россия) — при онлайн-оплате, в объёме данных платежа;</li>
      <li>если я сам выберу отправку архива через WhatsApp (Meta Platforms, США) или почтой — соответствующему сервису; на такую трансграничную передачу я соглашаюсь, выбирая этот способ.</li>
    </ul>
    <h2>6. Срок и отзыв</h2>
    <p class="sub">Согласие действует, пока идёт работа по заказу и год после выдачи альбома; для неоплаченного заказа — три месяца после брифа. Я могу отозвать его в любой момент письмом на ${AUTHOR.email}; оператор прекращает обработку и удаляет данные в течение трёх рабочих дней, кроме тех, которые обязан хранить по закону (расчёты и чеки).</p>
    <h2>7. Портфолио — отдельно</h2>
    <p class="sub">Показ моего проекта в портфолио LINEA этим согласием не разрешается. Для этого в брифе есть отдельная необязательная галочка; даже с ней проект показывается без моего имени, контактов и адреса.</p>
    <p class="hint" style="margin-top:22px">Подробно о том, как устроен сайт и где лежат данные, — <a href="../policy/">политика обработки персональных данных</a>.</p>
  </div>
</section>`
}));

/* ---------------------------------------------------------- оплата */
w('oplata/index.html', page({
  file: 'oplata/index.html',
  title: 'Оплата дизайн-проекта — как платить, чек, возврат | LINEA',
  desc: 'Как оплатить дизайн-проект LINEA: цена до начала работы, оплата онлайн через ЮKassa или по счёту, чек, срок от оплаты и возврат денег.',
  h1: 'Оплата',
  crumb: 'Условия',
  lead: `${TERMS.start}. Цену называем по брифу — до того, как вы что-то платите; срок отсчитывается от оплаты.`,
  jsonld: [crumbsLd([['LINEA', BASE + '/'], ['Оплата', BASE + '/oplata/']])],
  body: `<section class="blk">
  <div class="wrap">
    <div class="kicker">Порядок</div>
    <h2>Как это происходит</h2>
    <ol class="g-steps">
      <li><h3>Бриф и номер заказа</h3><p>После отправки брифа открывается страница заказа с номером — сохраните ссылку.</p></li>
      <li><h3>Цена</h3><p>${TERMS.hasPrices ? 'Цена — на странице <a href="../price/">«Стоимость»</a>.' : 'Называем стоимость и срок по брифу, обычно в течение рабочего дня.'} Сумма появляется на странице заказа.</p></li>
      <li><h3>Оплата</h3><p>Кнопкой «Оплатить» на странице заказа (ЮKassa) или по счёту, который мы пришлём.</p></li>
      <li><h3>Старт</h3><p>Как только оплата пришла, заказ переходит в работу; ${esc(TERMS.term)}.</p></li>
    </ol>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Подробно</div>
    <h2>Способы, чек, безопасность</h2>
    <ul class="checklist">
      <li><b>Онлайн через ЮKassa.</b> Оплата проходит на странице платёжного сервиса; способы (карта, СБП и другие) показывает сама ЮKassa. Данные карты вводятся у неё — мы их не видим и не храним. Пока онлайн-оплата не подключена, на странице заказа будет написано «счёт пришлём»</li>
      <li><b>По счёту.</b> Присылаем счёт в мессенджер или на почту; отметку об оплате ставим вручную, она сразу видна на странице заказа</li>
      <li><b>Чек.</b> Электронный чек присылаем на e-mail или в мессенджер после оплаты</li>
      <li><b>Сумма фиксируется в заказе.</b> Сайт берёт её только из заказа; повторное нажатие «Оплатить» не создаёт второй платёж</li>
    </ul>
  </div>
</section>

<section class="blk">
  <div class="wrap">
    <div class="kicker">Возврат</div>
    <h2>Если вы передумали</h2>
    <p class="sub">До начала работы возвращаем всю сумму. Если работа уже идёт — сумму за вычетом того, что к этому моменту фактически сделано (ст. 32 Закона «О защите прав потребителей»). Напишите на <a href="mailto:${AUTHOR.email}">${AUTHOR.email}</a> с номером заказа; деньги возвращаются тем же способом, которым вы платили. Подробно — в <a href="../oferta/">договоре-оферте</a>.</p>
  </div>
</section>`
}));

/* ---------------------------------------------------------- договор-оферта (черновик) */
// ЧЕРНОВИК: без реквизитов исполнителя и проверки юристом публичной офертой не является. Числа (кругов правок, сроки,
// цены) — из TERMS; чего нет — пишем «определяется до оплаты», а не выдумываем. noindex и вне sitemap, пока черновик.
const OFERTA_DRAFT = true;
w('oferta/index.html', page({
  file: 'oferta/index.html',
  title: 'Договор-оферта на дизайн-проект — черновик | LINEA',
  desc: 'Черновик договора-оферты LINEA: предмет — предварительный комплект до обмера и перевыпуск по правкам, сроки от оплаты, что не входит, возврат.',
  h1: 'Договор-оферта на дизайн-проект',
  crumb: 'Правовое',
  noindex: OFERTA_DRAFT,
  lead: OFERTA_DRAFT ? 'Черновик — его проверит юрист. Реквизиты исполнителя будут указаны до приёма первой оплаты; до этого документ публичной офертой не является, условия заказа подтверждаем перед оплатой.' : 'Публичная оферта: оплачивая заказ, вы принимаете эти условия.',
  jsonld: [crumbsLd([['LINEA', BASE + '/'], ['Договор-оферта', BASE + '/oferta/']])],
  body: `<section class="blk">
  <div class="wrap" style="max-width:860px">
    ${OFERTA_DRAFT ? `<p class="hint" style="border-left:3px solid var(--gold);padding-left:14px;margin:0 0 24px"><b>Черновик от ${LEGAL_ED}.</b> Реквизиты, число кругов правок и цены впишет исполнитель.</p>` : ''}
    <h2>1. Стороны</h2>
    <p class="sub">Исполнитель — ${esc(OPERATOR)}; ${esc(reqLine)}. Заказчик — физическое лицо, отправившее бриф и оплатившее заказ. Договор заключается акцептом оферты — оплатой заказа.</p>
    <h2>2. Предмет</h2>
    <p class="sub">Исполнитель по брифу и плану заказчика выпускает дизайн-проект квартиры или дома в электронном виде (PDF): полный альбом по ГОСТ и альбом для заказчика с визуализациями — сначала как <b>предварительный комплект</b>, затем перевыпускает его по правкам заказчика и после контрольного обмера.</p>
    <p class="sub">${esc(TERMS.prelim)}</p>
    <h2>3. Цена и оплата</h2>
    <p class="sub">${TERMS.hasPrices ? 'Цена указана на странице «Стоимость» и в заказе.' : 'Цена определяется по брифу и указывается на странице заказа до оплаты.'} Оплата — 100 % до начала работы, онлайн через ЮKassa или по счёту. Работа начинается после поступления оплаты.</p>
    <h2>4. Сроки</h2>
    <p class="sub">Предварительный комплект: квартира — до 48 часов, дом — до 72 часов с момента оплаты и получения плана с размерами. Если плана с размерами нет, срок начинается с момента, когда он получен. Срок перевыпуска по правкам определяется до оплаты.</p>
    <h2>5. Правки и перевыпуск</h2>
    <p class="sub">Заказчик оставляет правки на листах (голосом или текстом). ${TERMS.rounds ? esc(TERMS.roundsText[0].toUpperCase() + TERMS.roundsText.slice(1)) : 'Число кругов правок, входящих в цену, указывается на странице заказа до оплаты'}. Финальный перевыпуск без пометки «ПРЕДВАРИТЕЛЬНО» — после ответов заказчика на открытые вопросы и внесения контрольного обмера.</p>
    <h2>6. Что не входит</h2>
    <ul class="checklist">${TERMS.notIncluded.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    <h2>7. Приёмка</h2>
    <p class="sub">Комплект передаётся ссылкой на страницу заказа или файлами. Замечания заказчик направляет правками к листам; смета ориентировочная, на дату выпуска, офертой на материалы и работы не является.</p>
    <h2>8. Отказ и возврат</h2>
    <p class="sub">Заказчик вправе отказаться от договора в любой момент. До начала работы возвращается вся сумма; после — за вычетом фактически понесённых исполнителем расходов на выполненную часть работы (ст. 32 Закона РФ «О защите прав потребителей»). Возврат — тем же способом, которым производилась оплата, в течение 10 дней с даты требования.</p>
    <h2>9. Права на проект и портфолио</h2>
    <p class="sub">Заказчик вправе использовать проект для ремонта своего объекта. Исполнитель показывает проект в портфолио только с отдельного согласия заказчика (галочка в брифе) и без имени, контактов и адреса.</p>
    <h2>10. Персональные данные</h2>
    <p class="sub">Обрабатываются по <a href="../soglasie/">согласию</a> и <a href="../policy/">политике обработки персональных данных</a>.</p>
  </div>
</section>`
}));

/* ---------------------------------------------------------- карта сайта */
const MAP = [
  ['Услуги', [['Каталог услуг', 'catalog/'], ['Дизайн-проект квартиры', 'catalog/dizayn-proekt-kvartiry.html'], ['Дизайн-проект дома', 'catalog/dizayn-proekt-doma.html'], ['Только рабочая документация', 'catalog/rabochaya-dokumentatsiya.html'], ['Планировочное решение', 'catalog/planirovochnoe-reshenie.html'], ['Визуализации', 'catalog/vizualizatsii.html'], ['Смета и комплектация', 'catalog/smeta-i-komplektatsiya.html'], ['Стоимость и условия', 'price/'], ['Оплата', 'oplata/'], ['Договор-оферта (черновик)', 'oferta/']]],
  ['Работы', [['Портфолио', 'portfolio-hub/'], ...CARDS.map(c => [c.name, `portfolio/${c.slug}/`]), ['Кейсы', 'cases/'], ['Первая версия: квартира (старый формат)', 'portfolio/demo/presentation.html'], ['Первая версия: дом (старый формат)', 'portfolio/dom-120/presentation.html']]],
  ['Разобраться', [['Сравнение с рынком', 'compare/'], ['Как проходит работа', 'process/'], ['Вопросы и ответы', 'faq/'], ['Журнал', 'journal/'], ['Состав дизайн-проекта', 'journal/sostav-dizayn-proekta.html'], ['Развёртки стен', 'journal/razvertki-sten.html'], ['Электрика в проекте', 'journal/elektrika-v-proekte.html'], ['Пирог пола', 'journal/pirog-pola.html'], ['Смета ремонта', 'journal/smeta-remonta.html']]],
  ['Стили', [['Все стили', 'style/'], ['Джапанди', 'style/japandi.html'], ['Скандинавский', 'style/scandi.html'], ['Минимализм', 'style/minimal.html'], ['Современный', 'style/modern.html'], ['Неоклассика', 'style/neoclassic.html'], ['Лофт', 'style/loft.html']]],
  ['Документация', [['Рабочая документация по ГОСТ', 'gost/'], ['Открытые вопросы и знак «*»', 'gost/otkrytye-voprosy/'], ['Правки голосом на листах', 'review.html?p=gost-lineademo']]],
  ['Студия', [['О студии', 'about/'], ['Контакты', 'contacts/'], ['Истории', 'stories/'], ['Отзывы', 'reviews/'], ['Бриф голосом', 'brief.html'], ['Чек-лист приёмки проекта', 'checklist/'], ['Политика обработки данных', 'policy/'], ['Согласие на обработку данных', 'soglasie/']]]
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
// Сюда ведёт только запасной путь (архив брифа собран в браузере, отправляет клиент сам — GitHub Pages или сервер не ответил).
// При приёме на сервере клиент попадает на страницу заказа (order.html), а не сюда, — поэтому не пишем «бриф отправлен».
w('thanks/index.html', page({
  file: 'thanks/index.html',
  title: 'Бриф собран — осталось отправить | LINEA',
  desc: 'Архив брифа собран в вашем браузере: как отправить его в студию, что будет дальше и когда начинается работа.',
  h1: 'Бриф собран — осталось отправить',
  crumb: 'Что дальше',
  noindex: true,
  lead: `Архив брифа сам к нам не уходит. Пришлите его в WhatsApp на ${AUTHOR.phone} или на ${AUTHOR.email} — получение подтвердим в течение рабочего дня.`,
  body: `<section class="blk">
  <div class="wrap">
    <div class="kicker">Что дальше</div>
    <h2>Что будет дальше</h2>
    <ol class="steps-list">
      <li><h3>Вы отправляете архив</h3><p>В WhatsApp на <a href="https://wa.me/${AUTHOR.tel.replace('+', '')}" target="_blank" rel="noopener">${AUTHOR.phone}</a> или письмом на <a href="mailto:${AUTHOR.email}">${AUTHOR.email}</a>.</p></li>
      <li><h3>Мы называем цену и срок</h3><p>Подтверждаем получение, задаём вопросы, если в размерах что-то не сходится, и называем стоимость — до начала работы.</p></li>
      <li><h3>Оплата</h3><p>Онлайн через ЮKassa или по счёту — <a href="../oplata/">как платить</a>. ${esc(TERMS.start)}.</p></li>
      <li><h3>Предварительный альбом и правки</h3><p>${esc(TERMS.term[0].toUpperCase() + TERMS.term.slice(1))}. Правки — голосом прямо на листах; после ответов на открытые вопросы и обмера перевыпускаем комплект без пометки «ПРЕДВАРИТЕЛЬНО».</p></li>
    </ol>
    <div class="cta-row" style="margin-top:30px">
      <a class="btn" href="https://wa.me/${AUTHOR.tel.replace('+', '')}" target="_blank" rel="noopener">Открыть WhatsApp</a>
      <a class="btn ghost" href="../portfolio-hub/">Посмотреть проекты</a>
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
  <div class="wrap"><p class="sub noprint">Как проходит приёмка и как оставить правки голосом прямо на листах — <a href="../journal/kak-prinyat-dizayn-proekt.html">статья «Как принять дизайн-проект»</a>.</p></div>
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
  if (/thanks/.test(rel) || (OFERTA_DRAFT && /oferta/.test(rel)) || sm.includes(loc)) continue;   // «спасибо» и черновик оферты в индекс не отдаём
  sm = sm.replace('</urlset>', `  <url><loc>${loc}</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n</urlset>`);
}
fs.writeFileSync(smPath, sm);

console.log(`Собрано страниц: ${out.length}`);
console.log(out.map(o => '  ' + o).join('\n'));
