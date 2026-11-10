#!/usr/bin/env node
// Выгружает каталог вопросов брифа (site/js/brief-life.js) в таблицы docs/brief-schema-v2.md — между метками
// <!-- catalog --> и <!-- /catalog -->. Запускать после любой правки каталога: node tools/brief-schema-doc.js [--check]
// С --check только сверяет и возвращает код 1 при расхождении.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.window = {}; global.document = { activeElement: null };
require(path.join(ROOT, 'site/js/brief-life.js'));
const sets = [['life', 'Жизнь в квартире', window.LineaLife, 'Не знаю — решит дизайнер'], ['tech', 'Двери, свет и электрика', window.LineaTech, 'Не знаю — решит дизайнер'], ['home', 'Дом и ремонт', window.LineaHome, 'Не знаю — уточним на обмере']];
const cell = s => String(s).replace(/\|/g, '\\|');
const ASK = { one: 'один', multi: 'несколько', num: 'число', text: 'текст' };
let md = '';
for (const [key, title, S, unk] of sets) {
  const nLegacy = S.G.reduce((n, g) => n + g.q.filter(q => q.legacy).length, 0);
  md += `\n### \`${key}\` — ${title}: ${S.total} вопросов на экране, ядро ${S.core}${nLegacy ? `, ещё ${nLegacy} устаревших (в форме не показываются, старые ответы читаются)` : ''}\n\nУ каждого вопроса есть ответ \`unknown\` (unknown_ok), подпись по умолчанию — «${unk}».\n`;
  for (const g of S.G) {
    md += `\n#### \`${key}.${g.k}\` — ${g.t}${g.legacy ? ' (устаревшая группа: заменена в шаге «Двери, свет и электрика»)' : ''}\n\n| ключ | вопрос | ядро | тип | варианты | зачем (why) | что меняет (affects) |\n|---|---|---|---|---|---|---|\n`;
    for (const q of g.q) {
      const opts = q.o ? q.o.filter(p => p[0] !== 'unknown').map(p => `\`${p[0]}\` ${p[1]}`).join('; ') : (q.ph ? `пример: ${q.ph}` : '—');
      const cond = q.if ? (q.if.only ? ` (только если \`${q.if.q}\` = ${q.if.only.map(x => `\`${x}\``).join(' или ')})` : ` (если \`${q.if.q}\` ≠ ${q.if.not.map(x => `\`${x}\``).join(', ')})`) : '';
      md += `| \`${q.k}\` | ${cell(q.l)}${cond}${q.legacy ? ' (устар.)' : ''} | ${q.core ? 'да' : ''} | ${ASK[q.ask]} | ${cell(opts)} | ${cell(q.why)} | ${cell(q.aff || '')} |\n`;
    }
  }
}
const file = path.join(ROOT, 'docs/brief-schema-v2.md');
const src = fs.readFileSync(file, 'utf8');
const re = /<!-- catalog -->[\s\S]*?<!-- \/catalog -->/;
if (!re.test(src)) { console.error('нет меток <!-- catalog --> в ' + file); process.exit(2); }
const next = src.replace(re, `<!-- catalog -->\n${md}\n<!-- /catalog -->`);
if (process.argv.includes('--check')) { if (next !== src) { console.error('docs/brief-schema-v2.md расходится с каталогом — node tools/brief-schema-doc.js'); process.exit(1); } console.log('схема совпадает с каталогом'); process.exit(0); }
fs.writeFileSync(file, next);
console.log(`docs/brief-schema-v2.md: life ${window.LineaLife.total} (ядро ${window.LineaLife.core}), tech ${window.LineaTech.total} (ядро ${window.LineaTech.core}), home ${window.LineaHome.total} (ядро ${window.LineaHome.core})`);
