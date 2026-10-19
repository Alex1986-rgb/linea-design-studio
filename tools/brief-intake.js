#!/usr/bin/env node
// Приём брифа с сайта: архив LINEA-brif-<имя>-<дата>.zip (или brief.json) → clients/<слаг>/
//   node tools/brief-intake.js <архив.zip | brief.json> [слаг]
// Раскладывает: brief.json, brief.txt, plan/ (план, обмеры, фото квартиры), referensy/ (свои фото клиента),
// referensy-galereya.txt (отмеченные ♥/✕ кадры галереи сайта). Пишет clients/<слаг>/README.md — сводка и следующий шаг.
// Архив собирается в браузере клиента (site/js/brief.js), сжатия нет — распаковывает системный bsdtar.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [src, slugArg] = process.argv.slice(2);
if (!src || !fs.existsSync(src)) { console.error('использование: node tools/brief-intake.js <архив.zip | brief.json> [слаг]'); process.exit(2); }
const ROOT = path.join(__dirname, '..'), tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'brief-'));
if (/\.zip$/i.test(src)) execFileSync('bsdtar', ['-xf', path.resolve(src), '-C', tmp]);
else fs.copyFileSync(src, path.join(tmp, 'brief.json'));
const brief = JSON.parse(fs.readFileSync(path.join(tmp, 'brief.json'), 'utf8'));

const translit = s => String(s || '').toLowerCase().replace(/[а-яё]/g, ch => ({ а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' }[ch])).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const slug = slugArg || [translit(brief.client?.name) || 'klient', (brief.meta?.created || new Date().toISOString().slice(0, 10))].join('-');
const dst = path.join(ROOT, 'clients', slug);
if (fs.existsSync(dst)) { console.error(`уже есть ${path.relative(ROOT, dst)} — укажите другой слаг вторым аргументом`); process.exit(1); }
fs.mkdirSync(dst, { recursive: true });
for (const e of fs.readdirSync(tmp)) fs.cpSync(path.join(tmp, e), path.join(dst, e), { recursive: true });
fs.rmSync(tmp, { recursive: true, force: true });

const count = d => (fs.existsSync(path.join(dst, d)) ? fs.readdirSync(path.join(dst, d)).length : 0);
const o = brief.object || {}, st = brief.style || {};
const lines = [
  `# Бриф: ${brief.client?.name || 'клиент'} — ${brief.meta?.created || ''}`, '',
  `Контакт: ${[brief.client?.phone, brief.client?.email, brief.client?.contact].filter(Boolean).join(' · ') || '—'}`,
  `Объект: ${o.type || '—'}${o.area ? `, ${o.area} м²` : ''}${o.floors ? `, этажей ${o.floors}` : ''}${o.state ? `, ${o.state}` : ''}${o.address ? `, ${o.address}` : ''}`,
  `Помещения: ${(brief.rooms || []).map(r => r.name + (r.width && r.length ? ` ${r.width}×${r.length}` : '') + (r.level ? ` (${r.level} эт.)` : '')).join('; ') || '—'}`,
  `Стиль: ${st.title || st.key || '—'}; галерея: ♥ ${(st.liked || []).length}, ✕ ${(st.disliked || []).length}; ссылок ${(st.links || []).length}`,
  `Файлы: plan/ — ${count('plan')}, referensy/ — ${count('referensy')}`, '',
  '## Своими словами', '', brief.story || '—', '',
  '## Следующий шаг', '',
  '1. Прочитать brief.txt и план, недостающее — вопросы клиенту (одним сообщением).',
  '2. Проект в GOST-DRAFT: по плану — layout.json (образец ~/projects/gost-draft/projects/dom-331/gen-layout.py) → `node tools/new-project.js`;',
  '   стиль и палитра — по ♥ галереи и своим референсам (knowledge/styles/data), у каждой комнаты свой акцент, сюжеты картин (DC-28).',
  '3. Памятка: docs/kb/priem-brifa.md.',
];
fs.writeFileSync(path.join(dst, 'README.md'), lines.join('\n') + '\n');
console.log(`→ ${path.relative(ROOT, dst)}/  (план: ${count('plan')}, референсы: ${count('referensy')})`);
