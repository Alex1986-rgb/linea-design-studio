#!/usr/bin/env node
'use strict';
/**
 * Архив первой версии программы: site/portfolio/demo и site/portfolio/dom-120 (август 2026, движок engine/generate.js).
 *
 *   node tools/archive-old-demos.js            — привести страницы архива в порядок (повторный прогон ничего не меняет)
 *   node tools/archive-old-demos.js --check    — только проверить (код 1, если что-то не так)
 *
 * Зачем (второй круг критиков 27.10.2026, замечание практика 22.10 — «рендер не совпадает с чертежом»): в этих альбомах
 * 22 визуализации, с планом не сверенные, а тексты обещали «та же мебель, свет и материалы, что на чертежах», «такая же
 * папка за 48 часов» (без «от оплаты») и «конвейер студии». Страницы оставлены только для сравнения, поэтому:
 *   • <meta name="robots" content="noindex, follow"> — из индекса и из sitemap.xml (touch-sitemap.js снимает noindex-страницы);
 *   • плашка «Архив: первая версия программы…» сразу под <body>;
 *   • обещания заменены на честные формулировки, CTA — условия из TERMS (цена до старта, срок от оплаты).
 * Движок первой версии (снапшот-фикстуры) не трогаем: перегенерировали демо — прогнать этот скрипт ещё раз.
 */
const fs = require('fs');
const path = require('path');
const { TERMS } = require('./site-shell.js');

const SITE = path.join(__dirname, '..', 'site');
const DIRS = ['portfolio/demo', 'portfolio/dom-120'];
const CHECK = process.argv.includes('--check');
const MARK = '<!--linea-archive-->';

const ROBOTS = '<meta name="robots" content="noindex, follow">';
const END = '<!--/linea-archive-->';
const BOX = 'z-index:60;margin:0;padding:10px 16px;background:#3a2a12;color:#f3e6c4;font:14px/1.45 Inter,system-ui,sans-serif;border-bottom:2px solid #c9a45f';
// листалка (presentation.html) свёрстана fixed-слоями на весь экран: плашка там тоже fixed, шапка и лист сдвигаются под неё
const banner = (up, fixed) => fixed
  ? `${MARK}<style>header{top:44px!important}main,.nav{top:100px!important}</style><div style="position:fixed;top:0;left:0;right:0;height:44px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;${BOX}">`
    + `<b>Архив первой версии (август 2026):</b> визуализации с планом не сверены, по комплекту не строят. <a href="${up}portfolio-hub/" style="color:#ebdca8">Новый формат →</a></div>${END}`
  : `${MARK}<div style="position:relative;${BOX}">`
    + `<b>Архив: первая версия программы (август 2026).</b> Визуализации с планом не сверены, по комплекту не строят — страница оставлена для сравнения. `
    + `<a href="${up}portfolio-hub/" style="color:#ebdca8">Альбомы нового формата →</a></div>${END}`;
const cta = up => `<div class="cta"><h3>Свой проект — в новом формате</h3><p>${TERMS.how}. Первый вариант проекта — до 48 часов от оплаты и получения плана с размерами (дом — до 72). ${TERMS.prelim.split('. ')[0]}.</p>`
  + `<a class="btn" href="${up}brief.html">Заполнить бриф</a> <a class="btn ghost" href="${up}portfolio-hub/">Альбомы нового формата</a></div>`;

// обещания первой версии → как есть на самом деле
const FIX = [
  ['Фотореалистичные виды помещений — та же мебель, свет и материалы, что на чертежах',
    'Визуализации первой версии программы с планом не сверены: мебель и детали могут отличаться от чертежей; где расходятся, верен чертёж'],
  ['Визуализации выполнены по планировочному решению проекта: та же мебель, ниши и сценарии света, что и на чертежах.',
    'Визуализации первой версии программы с планом не сверены: мебель, ниши и свет могут отличаться от чертежей; где расходятся, верен чертёж.'],
  ['Реальный результат конвейера: рабочие чертежи, визуализации, спецификация и смета.',
    'Архив первой версии программы (август 2026): чертежи, визуализации, спецификация и смета. По комплекту не строят.'],
  ['Чертежи выполнены конвейером студии LINEA и проверены автором проекта',
    'Чертежи выполнены первой версией программы LINEA (август 2026) и просмотрены автором проекта'],
  ['>Хочу такую папку →<', '>Заполнить бриф →<'],
];
// что не должно остаться на странице архива
const BAD = [/та же мебель/, /конвейер/i, /за 48 часов(?! от оплаты)/, /за 72 час/, /Такая же папка/, /Фотореалистичн/];

let changed = 0, bad = 0, total = 0;
for (const d of DIRS) {
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.html$/.test(e.name)) continue;
      total++;
      const up = '../'.repeat(path.relative(SITE, p).split(path.sep).length - 1);
      const src = fs.readFileSync(p, 'utf8');
      let s = src;
      if (!/<meta name="robots"/.test(s)) s = s.replace(/<head>/i, m => `${m}\n${ROBOTS}`);
      const want = banner(up, e.name === 'presentation.html');
      if (s.includes(END)) s = s.replace(new RegExp(`${MARK}[\\s\\S]*?${END}`), () => want);
      else if (s.includes(MARK)) s = s.replace(new RegExp(`${MARK}<div[^>]*>[\\s\\S]*?</a></div>`), () => want);   // плашка прошлой редакции
      else s = s.replace(/<body([^>]*)>/i, (m) => `${m}\n${want}`);
      for (const [a, b] of FIX) s = s.split(a).join(b);
      s = s.replace(/<div class="cta"><h3>Такая же папка[\s\S]*?<\/div>/g, cta(up));
      const rel = path.relative(SITE, p);
      const left = BAD.filter(re => re.test(s)).map(String);
      if (!/<meta name="robots" content="noindex/.test(s) || !s.includes(MARK)) left.push('нет noindex или плашки');
      if (left.length) { bad++; console.error(`✖ ${rel}: ${left.join(', ')}`); }
      if (s !== src) {
        changed++;
        if (!CHECK) fs.writeFileSync(p, s);
      }
    }
  })(path.join(SITE, d));
}
console.log(`архив первой версии: ${total} страниц, ${CHECK ? 'требуют правки' : 'исправлено'}: ${changed}${bad ? `, с остатками: ${bad}` : ''}`);
process.exit(bad || (CHECK && changed) ? 1 : 0);
