#!/usr/bin/env node
// Словарь подписей брифа для сервера: site/js/brief-life.js (каталог вопросов «Жизнь в квартире» и «Дом и ремонт») →
// server/api/lib/brief-dict.json. Админка и вкладка «Бриф» в кабинете показывают ответы человеческими словами по этому файлу
// (lib/brief-view.php), поэтому каталог и словарь не расходятся: node tools/gen-brief-dict.js после любой правки каталога,
// node tools/gen-brief-dict.js --check — только сверить (код 1 при расхождении).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.window = {}; global.document = { activeElement: null };
require(path.join(ROOT, 'site/js/brief-life.js'));
const sets = [['life', 'Жизнь в квартире', window.LineaLife], ['tech', 'Двери, свет и электрика', window.LineaTech], ['home', 'Дом и ремонт', window.LineaHome]];
const out = { _note: 'Генерируется tools/gen-brief-dict.js из site/js/brief-life.js. Руками не править.' };
for (const [key, title, S] of sets) {
  out[key] = { title, total: S.total, groups: S.G.map(g => ({ k: g.k, t: g.t, q: g.q.map(q => ({
    k: q.k, l: q.l, s: q.s || q.l, ask: q.ask || (q.m ? 'multi' : 'one'), core: q.core ? 1 : 0,
    o: q.o ? Object.fromEntries(q.o.map(p => [p[0], p[1]])) : undefined,
  })) })) };
}
const file = path.join(ROOT, 'server/api/lib/brief-dict.json');
const next = JSON.stringify(out, null, 1) + '\n';
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (cur !== next) { console.error('server/api/lib/brief-dict.json расходится с каталогом — node tools/gen-brief-dict.js'); process.exit(1); }
  console.log('словарь брифа совпадает с каталогом'); process.exit(0);
}
fs.writeFileSync(file, next);
console.log(`server/api/lib/brief-dict.json: life ${out.life.total}, tech ${out.tech.total}, home ${out.home.total} вопросов`);
