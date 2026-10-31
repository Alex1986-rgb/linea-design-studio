#!/usr/bin/env node
// Пакет проекта для бригад «Ремонт по проекту»: ОБЕЗЛИЧЕННЫЕ позиции сметы (работы) по специализациям + ведомости xlsx.
//   node tools/brigady-pack.mjs <project.json GOST-DRAFT> <папка> [--gost=~/projects/gost-draft-svod] [--date=ДД.ММ.ГГГГ]
// Выход: <папка>/pack.json (загружается в запрос в admin-brigady.php) и <папка>/vedomosti.xlsx (там же, файлом пакета).
// Источник позиций — единый реестр движка GOST-DRAFT (engine/schedules.js → estimate, строки «Работа»), количества — из модели
// project.json. Из пакета убраны: ФИО/телефон/почта клиента, адрес, шифр с номером договора; автор проекта (дизайнер) остаётся.
// Код движка не копируется — импортируется из его папки (независимость репозиториев сохраняется).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = k => (args.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const [projFile, outDir] = args.filter(a => !a.startsWith('--'));
if (!projFile || !outDir) { console.error('node tools/brigady-pack.mjs <project.json> <папка> [--gost=…] [--date=ДД.ММ.ГГГГ]'); process.exit(2); }
const GOST = path.resolve((opt('gost') || process.env.GOST_DRAFT || path.join(os.homedir(), 'projects/gost-draft-svod')).replace(/^~/, os.homedir()));
const date = opt('date') || new Date().toLocaleDateString('ru-RU');
const imp = f => import(pathToFileURL(path.join(GOST, f)).href);
const { loadProject } = await imp('engine/model.js');
const { buildSchedules } = await imp('engine/schedules.js');

// специализация позиции — по словам наименования (порядок важен: первое совпадение)
const SPEC = [
  ['demontazh', /демонтаж/i],
  ['elektrika', /кабел|электро|светильник|розетк|щит|узо|автомат|led|блок питания|извещател|слаботоч|гофротруб|штроб|терморегулятор/i],
  ['santehnika', /унитаз|инсталляц|ванн|умывальник|мойк|радиатор|сантех|канализ|водопровод|\bвк\b|стиральн|смесител/i],
  ['plitka', /керамогранит|плитк|облицовк|затирк/i],
  ['potolki', /потол.*гкл|гкл|короб|каркас/i],
  ['malyarka', /шпаклёвк|шпаклевк|окраск|грунтован/i],
  ['poly', /доск|ламинат|паркет|плинтус|линолеум|кварцвинил/i],
  ['mebel', /двер|гарнитур|мебел|шкаф/i],
  ['chernovye', /.*/],
];
const specOf = name => SPEC.find(([, re]) => re.test(name))[0];

const P = loadProject(path.resolve(projFile));
const S = buildSchedules(P, { date });
const positions = S.estimate.rows.filter(r => r.kind === 'Работа' || r.kind === 'Оборудование')
  .map(r => ({ spec: specOf(r.name), name: r.name, unit: r.unit, qty: typeof r.qty === 'number' ? r.qty : null }));
const area = P.totals?.area ?? P.object?.area ?? null;
const pack = {
  v: 1, slug: path.basename(path.dirname(path.resolve(projFile))),
  object: `${/дом/i.test(P.object?.type || '') ? 'Дом' : 'Квартира'}${area ? ' ' + Math.round(area) + ' м²' : ''}`,
  area, date,
  rooms: (P.rooms || []).map(r => ({ name: r.name, area: r.area ? Math.round(r.area * 10) / 10 : null })),
  positions,
  source: `GOST-DRAFT ${path.basename(GOST)}, смета ${date}`,
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'pack.json'), JSON.stringify(pack, null, 2));
// ведомости: те же таблицы, что у альбома, без адреса, клиента и шифра
try {
  const { writeXlsx } = await imp('tools/export-xlsx.js');
  const S2 = { ...S, meta: { ...S.meta, address: '', client: '', code: '', object: pack.object } };
  await writeXlsx(S2, path.join(outDir, 'vedomosti.xlsx'));
} catch (e) { console.error('  xlsx не собран: ' + e.message); }
const bySpec = positions.reduce((a, p) => (a[p.spec] = (a[p.spec] || 0) + 1, a), {});
console.log(`pack: ${pack.object}, позиций ${positions.length} (${Object.entries(bySpec).map(([k, n]) => k + ' ' + n).join(', ')}) → ${outDir}`);
