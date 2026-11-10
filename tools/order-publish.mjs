#!/usr/bin/env node
// Выпуск конвейера → пакет для публикации клиенту в кабинете. ТОЛЬКО локальные пути: собирает папку
// clients/<slug>/publish/<версия>/ (album.pdf, registry.json, release.json) — её загружают в админке (заказ → «Выпуски»), потому что
// публикация в кабинете сразу шлёт клиенту письмо, а это решение человека. Скрипт на сервер ничего не отправляет.
//   node tools/order-publish.mjs clients/<slug> --ver=v1 [--title="Первый вариант"] [--final] [--prelim] [--pdf=<album.pdf>] [--registry=<registry.json>] [--changes="а; б"]
// album.pdf берётся из project/album.pdf (tools/album.sh), registry.json — из clients/<slug>/registry.json или project/registry.json
// (вопросы К-N, решения П-N — формат docs/brigady/spec-kabinety-adminka.md). Без реестра выпуск идёт без вопросов — об этом сказано в выводе.
import fs from 'node:fs';
import path from 'node:path';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const dirArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const ver = (arg('ver') || '').replace(/[^A-Za-z0-9._-]/g, '');
if (!dirArg || !ver) { console.error('Использование: node tools/order-publish.mjs clients/<slug> --ver=v1 [--title=…] [--final|--prelim] [--pdf=…] [--registry=…] [--changes="а; б"]'); process.exit(2); }
const cl = path.resolve(dirArg);
if (!fs.existsSync(path.join(cl, 'order.json'))) { console.error('Нет order.json — папку клиента создаёт tools/order-pull.mjs'); process.exit(1); }
const order = JSON.parse(fs.readFileSync(path.join(cl, 'order.json'), 'utf8'));
const first = (...c) => c.filter(Boolean).map(p => path.resolve(p)).find(p => fs.existsSync(p));
const pdf = first(arg('pdf'), path.join(cl, 'project/album.pdf'));
const reg = first(arg('registry'), path.join(cl, 'registry.json'), path.join(cl, 'project/registry.json'));
if (!pdf) { console.error('Нет album.pdf: соберите ./tools/album.sh ' + path.join(dirArg, 'project') + ' или укажите --pdf='); process.exit(1); }
if (fs.readFileSync(pdf).subarray(0, 5).toString() !== '%PDF-') { console.error(pdf + ' — не PDF'); process.exit(1); }
if (reg) { let j; try { j = JSON.parse(fs.readFileSync(reg, 'utf8')); } catch { } if (!j || !Array.isArray(j.items)) { console.error(reg + ': нужен объект {"items":[…]}'); process.exit(1); } }
if (process.argv.includes('--final') && !reg) console.log('⚠ финальный выпуск без реестра: клиенту нечего согласовывать — проверьте, что так и задумано');
const out = path.join(cl, 'publish', ver); fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(pdf, path.join(out, 'album.pdf'));
if (reg) fs.copyFileSync(reg, path.join(out, 'registry.json'));
const rel = { order: order.number, ver, title: arg('title') || ver, final: process.argv.includes('--final'), prelim: process.argv.includes('--prelim') || !process.argv.includes('--final'),
  project: path.basename(cl), changes: (arg('changes') || '').split(';').map(x => x.trim()).filter(Boolean) };
fs.writeFileSync(path.join(out, 'release.json'), JSON.stringify(rel, null, 2));
console.log(`✓ пакет ${path.relative(process.cwd(), out)}/: album.pdf (${Math.round(fs.statSync(pdf).size / 1024)} КБ), ${reg ? 'registry.json' : 'без реестра'}, release.json`);
console.log(`Дальше — вручную: админка → заказ ${order.number} → «Выпуски» → версия ${ver}, заголовок «${rel.title}», ${rel.final ? 'финальная' : 'предварительная'}; загрузить album.pdf${reg ? ' и registry.json' : ''}. Клиенту уйдёт письмо.`);
