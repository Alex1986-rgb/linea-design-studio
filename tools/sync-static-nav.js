#!/usr/bin/env node
'use strict';
/**
 * Синхронизация статических страниц с общим каркасом.
 *
 *   node tools/sync-static-nav.js            — переписать шапку и подвал
 *   node tools/sync-static-nav.js --check    — только проверить расхождения (код 1)
 *
 * index.html и brief.html не проходят через генераторы, поэтому их меню
 * разъезжалось с остальным сайтом. Здесь оно берётся из tools/site-shell.js —
 * того же источника, что и у генераторов.
 */

const fs = require('fs');
const path = require('path');
const SHELL = require('./site-shell.js');

const SITE = path.join(__dirname, '..', 'site');
const CHECK = process.argv.includes('--check');
// --only=brief.html — синхронизировать один файл (главную правит отдельный шаг)
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);

// Ссылку на первый демо-альбом старого движка из подвала главной сняли (второй круг критиков 27.10.2026):
// его визуализации с планом не сверены, архив закрыт от индекса (tools/archive-old-demos.js).
const EXTRA = {};

let drift = 0;
for (const file of ['index.html', 'brief.html'].filter(f => !ONLY || f === ONLY)) {
  const p = path.join(SITE, file);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  let out = src;

  // Шапку переносим целиком (вместе с бургером и мобильным оверлеем).
  // Закрывающий </div> оверлея ищем ТОЛЬКО в начале строки: внутри .mnav есть
  // вложенный .mnav-cta, и ленивый [\s\S]*?</div> обрывался на нём — «хвост»
  // оверлея оставался в файле, а следом дописывался целый новый блок. Каждый
  // прогон добавлял по лишнему </div>, вёрстка тихо копила мусор.
  const fullHeader = SHELL.header('', null);
  out = out.replace(/<header class="site">[\s\S]*?<\/header>(\n<div class="mnav"[\s\S]*?\n<\/div>)?/, fullHeader);
  // скрипт меню — перед </body>, если ещё не вставлен
  const menuJs = SHELL.footer('', null).match(/<script>[\s\S]*<\/script>/)[0];
  if (!/querySelector\('\.burger'\)/.test(out)) out = out.replace('</body>', menuJs + '\n</body>');

  // подвал: сгруппированные ссылки (блок <!-- fnav -->), контакты автора не трогаем
  const nav = `<!-- fnav -->${SHELL.footerNav('', null)}<!-- /fnav -->${EXTRA[file] || ''}`;
  if (/<!-- fnav -->[\s\S]*?<!-- \/fnav -->/.test(out)) {
    out = out.replace(/<!-- fnav -->[\s\S]*?<!-- \/fnav -->/, nav);
  } else if (/<p><a href="brief\.html">Бриф<\/a>/.test(out)) {
    out = out.replace(/<p><a href="brief\.html">Бриф<\/a>[\s\S]*?<\/p>/, nav);
  } else {
    // на брифе колонки ссылок не было вовсе — вставляем перед копирайтом
    out = out.replace(/<div>©\s*LINEA studio, 2026<\/div>/, `<div class="f-links">${nav}<p>© LINEA studio, 2026</p></div>`);
  }
  out = out.replace(/<div>(\s*)<!-- fnav -->/, '<div class="f-links">$1<!-- fnav -->');
  // версия CSS — та же, что у всех страниц (иначе новая шапка и подвал на этих двух страницах остаются без стилей из кэша)
  out = out.replace(/css\/main\.css\?v=\d+/, `css/main.css?${SHELL.CSSV}`);

  // бриф: строка-описание, «что будет дальше» и ставки — из TERMS (tools/site-shell.js), руками в brief.html не правятся
  if (file === 'brief.html') {
    const T = SHELL.TERMS, rub = T.rub;
    const region = (name, html) => { out = out.replace(new RegExp(`<!-- terms:${name} -->[\\s\\S]*?<!-- /terms:${name} -->`), `<!-- terms:${name} -->${html}<!-- /terms:${name} -->`); };
    out = out.replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1Три шага, около 5 минут: план, картинки и пара слов — можно голосом. От ${rub(T.packs[0].rate)}/м², сумму знаете до оплаты; проект — ${T.daysShort}.$2`);
    region('brief-lead', `${T.brief.line}. Цена ${T.fromLine}; ${T.sumShort}.`);
    region('brief-next', `<h3>Что будет дальше</h3><ol>${T.brief.next.map(x => `<li>${x}</li>`).join('')}</ol><p>${T.intake.brief}.</p><p class="pre-call"><b>${T.call.title}.</b> ${T.call.line}</p>`);
    const AS = T.addons.smeta;
    // опция «Смета на материалы»: галочка на шаге с суммой (js/brief.js читает ставки из briefTerms.addons)
    region('brief-smeta', `<label class="chk addon" id="addonSmeta"><input type="checkbox" id="cSmeta" aria-describedby="smetaHelp"><span><b>Добавить смету на материалы — <span id="smetaSum">${AS.fromLine}</span></b> <span class="hint">(по желанию, отдельная строка оплаты)</span><span class="hint" id="smetaHelp" style="display:block;margin-top:4px">${AS.what[0].toUpperCase() + AS.what.slice(1)}. ${AS.priceNoteShort[0].toUpperCase() + AS.priceNoteShort.slice(1)}. <a href="smeta/" target="_blank" rel="noopener">Что входит</a></span><span class="hint" style="display:block;margin-top:4px">Нужна только смета, без дизайн-проекта? <a href="${AS.solo.url}">${AS.solo.btn}</a> — по вашему проекту или плану.</span></span></label>`);
    const json = JSON.stringify({ packs: T.packs.map(p => ({ key: p.key, name: p.name, rate: p.rate, min: p.min })), minArea: T.minArea, areaRecalc: T.areaRecalc, addons: T.addonsPublic() });
    const tag = `<script type="application/json" id="briefTerms">${json}</script>`;
    if (/<script type="application\/json" id="briefTerms">[\s\S]*?<\/script>/.test(out)) out = out.replace(/<script type="application\/json" id="briefTerms">[\s\S]*?<\/script>/, tag);
    else out = out.replace(/<script src="js\/brief\.js/, `${tag}\n<script src="js/brief.js`);
  }

  if (out !== src) {
    drift++;
    if (CHECK) console.log(`✖ ${file}: шапка или подвал разошлись с site-shell.js`);
    else { fs.writeFileSync(p, out); console.log(`↻ ${file}: шапка и подвал синхронизированы`); }
  } else {
    console.log(`✔ ${file}: совпадает с каркасом`);
  }
}

if (CHECK && drift) process.exit(1);
