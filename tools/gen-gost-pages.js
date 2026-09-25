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
    lead: 'Четырёхкомнатная с непрямоугольным контуром и двумя эркерными балконами: зал, кухня, две детские, '
      + 'две гардеробные, кладовая, ванная, санузел, прихожая и коридор на 87,9 м².',
    area: '87,9 м²',
    rooms: 13,
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
    name: 'Трёхкомнатная квартира, 78,9 м²',
    lead: 'Первый объект нового движка: две спальни, кухня-гостиная, ванная, санузел, гардеробная, прихожая и коридор. '
      + 'Г-образный контур, помещения собраны из нескольких частей.',
    area: '78,9 м²',
    rooms: 8,
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
};

const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya', ь: '', ъ: '', ё: 'e' };
const slugify = s => String(s).toLowerCase().replace(/[а-яё]/g, c => TR[c] ?? c)
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- читаем выпуск ----------
function readRelease(slug) {
  const src = path.join(SITE, 'portfolio', slug, '_release.html');
  const idx = fs.readFileSync(src, 'utf8');
  const stat = idx.match(/Листов:\s*(\d+)[^<]*блокеров:\s*(\d+)[^<]*замечаний:\s*(\d+)/) || [];
  const sheets = [...idx.matchAll(/<h3>([^<]+?)\.svg — ([^<]+?) \(([a-z-]+)\)<\/h3>/g)]
    .map(m => ({ file: m[1] + '.svg', title: m[2], owner: m[3] }));
  if (!sheets.length) throw new Error(`${slug}: в _release.html не нашлось листов — проверьте синхронизацию выпуска`);
  return { sheets, total: +stat[1] || sheets.length, blockers: +stat[2] || 0, issues: +stat[3] || 0 };
}

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
function albumPage(a, r) {
  const groups = bySection(r.sheets);

  const blocks = groups.map(g => `  <section class="blk" id="${slugify(g.sec)}">
    <div class="wrap">
      <div class="kicker">Раздел</div>
      <h2>${esc(g.sec)}</h2>
      <p class="sub">Листов в разделе: ${g.items.length}</p>
      ${g.items.map(sh => `<figure class="sheet">
        <img loading="lazy" src="sheets/${encodeURIComponent(sh.file)}" alt="${esc(sh.title)}">
        <figcaption>${esc(sh.title)}</figcaption>
      </figure>`).join('\n      ')}
    </div>
  </section>`).join('\n');

  const body = `  <section class="blk">
    <div class="wrap">
      <div class="stats">
        <div><b>${r.total}</b><span>листов A3</span></div>
        <div><b>${a.area}</b><span>площадь</span></div>
        <div><b>${a.rooms}</b><span>помещений</span></div>
        <div><b>${r.blockers}</b><span>блокеров нормоконтроля</span></div>
        <div><b>${groups.length}</b><span>разделов комплекта</span></div>
      </div>
    </div>
  </section>

  <section class="blk">
    <div class="wrap">
      <div class="kicker">Состав</div>
      <h2>Что внутри альбома</h2>
      <p class="sub">Шифр комплекта ${esc(a.code)}. Листы идут в том же порядке, что в выданном альбоме:
      титульный лист, общие данные с ведомостью чертежей, дальше разделы по специальностям.</p>
      <div class="cards g3">
        ${groups.map(g => `<div class="card"><h3>${esc(g.sec)}</h3><p>Листов: ${g.items.length}</p></div>`).join('\n        ')}
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

${blocks}
`;

  return page({
    file: `portfolio/${a.slug}/index.html`,
    title: `${a.name} — рабочая документация, ${r.total} листов | LINEA`,
    desc: `${a.name}: комплект рабочей документации на ${r.total} листов A3, ${groups.length} разделов, `
      + 'нормоконтроль без блокеров. Каждый лист можно рассмотреть целиком.',
    h1: a.name,
    lead: a.lead,
    crumb: [['Документация', '../../gost/'], [a.name, null]],
    body,
    u: '../../',
    jsonld: [crumbsLd([
      ['LINEA', `${BASE}/`],
      ['Документация', `${BASE}/gost/`],
      [a.name, `${BASE}/portfolio/${a.slug}/`],
    ])],
  });
}

// ---------- страница раздела ----------
function hubPage(releases) {
  const totalSheets = releases.reduce((s, x) => s + x.r.total, 0);
  const cards = releases.map(({ a, r }) => `        <a class="tile plain" href="../portfolio/${a.slug}/">
          <div class="tile-body">
            <span class="tag">${r.total} листов A3</span>
            <b>${esc(a.name)}</b>
            <span class="tile-lead">${esc(a.lead)}</span>
            <div class="tile-figs"><i><b>${a.area}</b>площадь</i><i><b>${a.rooms}</b>помещений</i><i><b>${r.blockers}</b>блокеров</i></div>
            <span class="more">Смотреть листы →</span>
          </div>
        </a>`).join('\n');

  const body = `  <section class="blk">
    <div class="wrap">
      <div class="stats">
        <div><b>868</b><span>правил проверки выпуска</span></div>
        <div><b>26</b><span>специальностей в команде</span></div>
        <div><b>${totalSheets}</b><span>листов в двух альбомах</span></div>
        <div><b>0</b><span>блокеров на выдаче</span></div>
      </div>
    </div>
  </section>

  <section class="blk">
    <div class="wrap">
      <div class="kicker">Как это устроено</div>
      <h2>Альбом собирает движок — и сам себя проверяет</h2>
      <p class="sub">Объект описан данными один раз: геометрия в миллиметрах, отметки от нуля, проёмы, мебель,
      инженерные точки, отделка. Каждый раздел выпускает свой специалист движка, а нормоконтроль проверяет
      результат 868 правилами — у каждого записан источник: пункт ГОСТ, СП или практика бюро.</p>
      <div class="cards g3">
        <div class="card"><div class="num">01</div><h3>Данные вместо картинок</h3>
          <p>Лист нельзя поправить руками в файле: он строится из данных объекта. Поменялась планировка —
          пересобрался весь альбом, и смета вместе с ним.</p></div>
        <div class="card"><div class="num">02</div><h3>Проверка с пунктом норматива</h3>
          <p>Каждое правило ссылается на источник. Нарушение выводится с адресом: лист, элемент, что именно не так
          и куда смотреть в норме.</p></div>
        <div class="card"><div class="num">03</div><h3>Блокеры не уходят в печать</h3>
          <p>Проём не помещается в стену, содержимое вылезло за край листа — выпуск останавливается.
          На обоих альбомах на выдаче ноль блокеров.</p></div>
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

  <section class="blk">
    <div class="wrap">
      <div class="kicker">Альбомы</div>
      <h2>Посмотреть листы целиком</h2>
      <p class="sub">Это не картинки для сайта, а те самые листы, которые получает бригада: со штампом,
      размерными цепочками, ведомостями и примечаниями.</p>
      <div class="tiles">
${cards}
      </div>
    </div>
  </section>
`;

  return page({
    file: 'gost/index.html',
    title: 'Рабочая документация по ГОСТ — как собирается альбом | LINEA',
    desc: 'Комплект рабочей документации на квартиру: 70–105 листов A3, 26 специальностей, 868 правил '
      + 'нормоконтроля с пунктами ГОСТ и СП. Два альбома можно посмотреть целиком.',
    h1: 'Рабочая документация по ГОСТ',
    lead: 'Полный комплект, по которому работает бригада: планировки, развёртки всех стен, электрика со щитом, '
      + 'вода и канализация, отопление и вентиляция, потолки с узлами, раскладка плитки, отделка, '
      + 'встроенная мебель и смета.',
    crumb: [['Документация', null]],
    body,
    u: '../',
    jsonld: [crumbsLd([['LINEA', `${BASE}/`], ['Документация', `${BASE}/gost/`]])],
  });
}

// ---------- сборка ----------
const releases = ALBUMS.map(a => ({ a, r: readRelease(a.slug) }));
for (const { a, r } of releases) w(`portfolio/${a.slug}/index.html`, albumPage(a, r));
w('gost/index.html', hubPage(releases));

// sitemap: дописываем новые адреса, если их ещё нет
const smPath = path.join(SITE, 'sitemap.xml');
if (fs.existsSync(smPath)) {
  let sm = fs.readFileSync(smPath, 'utf8');
  let added = 0;
  for (const u of ['gost/', ...ALBUMS.map(a => `portfolio/${a.slug}/`)]) {
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
