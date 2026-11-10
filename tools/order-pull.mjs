#!/usr/bin/env node
// Заказ из кабинета → рабочая папка конвейера (clients/<slug>/). ТОЛЬКО локальные пути: читает копию папки linea-private
// (linea.sqlite + orders/<номер>/…), на сервер ничего не ходит и ничего в нём не меняет.
//   node tools/order-pull.mjs <LN-ГГММ-NNNN> --private=<папка linea-private> [--slug=<имя>] [--force]
// В конвейер идут только оплаченные заказы (правило проекта); --force — для проверок. Кладёт: brief.json (с дополнением из кабинета),
// brief.txt, source/ (план и фото из архива + догруженное, у файлов к вопросу — приставка К-N_), answers.json, order.json (без контактов).
// Заказ «только смета» (kind = smeta, 09.11.2026): проекта LINEA нет и не будет. source/plan/ — план клиента, source/proekt/ — файлы ЕГО проекта (если есть),
// brief.json → smeta {mode: project | answers, rooms[], electric, plumbing, height, state, note, thick{plaster,screed,level}}; order.json получает smetaOnly = true и smetaInput.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const num = process.argv.slice(2).find(a => /^LN-[A-Z0-9-]+$/i.test(a));
const PRIV = arg('private') || process.env.LINEA_PRIVATE;
if (!num || !PRIV) { console.error('Использование: node tools/order-pull.mjs <LN-…> --private=<папка linea-private> [--slug=имя] [--force]'); process.exit(2); }
const priv = path.resolve(PRIV), dir = path.join(priv, 'orders', num);
if (!fs.existsSync(dir)) { console.error('Нет папки заказа: ' + dir); process.exit(1); }
const row = JSON.parse(execFileSync('php', ['-r', '$p = new PDO("sqlite:" . $argv[1]); $s = $p->prepare("SELECT number, kind, status, area, object_type, amount_kop, paid_at, test FROM orders WHERE number = ?"); $s->execute([$argv[2]]); echo json_encode($s->fetch(PDO::FETCH_ASSOC) ?: null);', path.join(priv, 'linea.sqlite'), num]).toString());
if (!row) { console.error('Заказа нет в базе: ' + num); process.exit(1); }
if (['awaiting_payment', 'new', 'cancelled', 'refunded'].includes(row.status) && !process.argv.includes('--force')) { console.error(`Заказ ${num} в статусе «${row.status}» — в конвейер идут только оплаченные (или --force).`); process.exit(1); }
const slug = (arg('slug') || num.toLowerCase()).replace(/[^a-z0-9-]/g, '-');
const out = path.join(ROOT, 'clients', slug);
if (fs.existsSync(path.join(out, 'brief.json')) && !process.argv.includes('--force')) { console.error(`${out}/brief.json уже есть — не затираю (--force, если так и надо).`); process.exit(1); }
fs.mkdirSync(path.join(out, 'source'), { recursive: true });
// brief.json — без служебного поля addedAt, остальное как в кабинете
const b = JSON.parse(fs.readFileSync(path.join(dir, 'brief.json'), 'utf8')); const added = b.addedAt; delete b.addedAt;
fs.writeFileSync(path.join(out, 'brief.json'), JSON.stringify(b, null, 2));
const zip = path.join(dir, 'brief.zip');
if (fs.existsSync(zip)) {
  const tmp = fs.mkdtempSync(path.join(out, '.z-')); execFileSync('unzip', ['-qo', zip, '-d', tmp]);
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(tmp)) {
    const n = path.basename(f), rel = path.relative(tmp, f).split(path.sep);
    if (n === 'brief.txt') fs.copyFileSync(f, path.join(out, 'brief.txt'));
    else if (n === 'brief.json') continue;
    else if (row.kind === 'smeta' && ['plan', 'proekt'].includes(rel[0])) { fs.mkdirSync(path.join(out, 'source', rel[0]), { recursive: true }); fs.copyFileSync(f, path.join(out, 'source', rel[0], n)); }   // план и проект клиента — раздельно
    else fs.copyFileSync(f, path.join(out, 'source', n));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
const dop = path.join(dir, 'dopolnenie'); let nExtra = 0;
if (fs.existsSync(dop)) {
  let idx = {}; try { const x = JSON.parse(fs.readFileSync(path.join(dop, 'index.json'), 'utf8')); idx = Array.isArray(x) ? Object.fromEntries(x.map(i => [i.name, i])) : x; } catch { }
  for (const n of fs.readdirSync(dop)) { if (n === 'index.json' || n.startsWith('brief-до-')) continue; const q = idx[n] && idx[n].q; fs.copyFileSync(path.join(dop, n), path.join(out, 'source', (q ? q + '_' : '') + (idx[n]?.orig || n))); nExtra++; }
}
if (fs.existsSync(path.join(dir, 'answers.json'))) fs.copyFileSync(path.join(dir, 'answers.json'), path.join(out, 'answers.json'));
// опция «Смета на материалы» (09.11.2026): smeta = true — опция оплачена, конвейер обязан выпустить смету материалов (файлы — см. docs/reports/2026-11-09-opciya-smeta-materialov.md);
// smetaStatus — awaiting_payment | paid | delivered | cancelled | null (опции в заказе нет). Старая база без таблицы order_options — опции нет.
let opt = null;
try { opt = JSON.parse(execFileSync('php', ['-r', '$p = new PDO("sqlite:" . $argv[1]); $s = $p->prepare("SELECT x.status, x.paid_at FROM order_options x JOIN orders o ON o.id = x.order_id WHERE o.number = ? AND x.opt = \'smeta\'"); $s->execute([$argv[2]]); echo json_encode($s->fetch(PDO::FETCH_ASSOC) ?: null);', path.join(priv, 'linea.sqlite'), num], { stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch { }
const smetaOnly = row.kind === 'smeta', sm = (b && b.smeta) || {};
const cnt = d => { try { return fs.readdirSync(path.join(out, 'source', d)).length; } catch { return 0; } };
const thick = (sm.thick && typeof sm.thick === 'object') ? Object.fromEntries(['plaster', 'screed', 'level'].filter(k => Number(sm.thick[k]) > 0).map(k => [k, Number(sm.thick[k])])) : {};
const smetaInput = smetaOnly ? { mode: sm.mode || null, planFiles: cnt('plan'), projectFiles: cnt('proekt'), rooms: (sm.rooms || []).length, electric: sm.electric || null, plumbing: sm.plumbing || null,
  height: sm.height || null, state: sm.state || null,
  thick,   // толщины слоёв клиента, мм ({plaster, screed, level}, только заданные) — движок GOST-DRAFT берёт их вместо типовых
  // что взять за основу: по проекту клиента — его листы; без проекта — типовые решения по ответам, каждое допущение пометить в смете
  basis: sm.mode === 'project' ? 'проект клиента (source/proekt) + план (source/plan)' : 'план (source/plan) + ответы «что где» (brief.json → smeta.rooms); допущения помечать в смете' } : null;
fs.writeFileSync(path.join(out, 'order.json'), JSON.stringify({ smetaOnly, smetaInput, thick: smetaOnly ? thick : undefined, smeta: smetaOnly ? ['paid', 'delivered'].includes(row.status) : !!opt && ['paid', 'delivered'].includes(opt.status), smetaStatus: opt ? opt.status : null, smetaPaidAt: opt ? opt.paid_at : (smetaOnly ? row.paid_at : null), number: row.number, kind: row.kind, status: row.status, area: row.area, objectType: row.object_type, paidAt: row.paid_at, briefAddedAt: added || null }, null, 2));
console.log(`✓ ${num} → clients/${slug}/: brief.json${fs.existsSync(path.join(out, 'brief.txt')) ? ', brief.txt' : ''}, source/ (${fs.readdirSync(path.join(out, 'source')).length} файлов, из них догружено ${nExtra}), answers.json ${fs.existsSync(path.join(out, 'answers.json')) ? 'есть' : 'нет'}`);
console.log(smetaOnly
  ? `Заказ «только смета»: дизайн-проект НЕ собирать. Основа — ${smetaInput.basis}. Результат — PDF и таблица (xlsx/csv), их выдаёт админка (карточка заказа → «Выдача сметы»).`
  : `Дальше: /new-client ${slug} или node engine/generate.js clients/${slug}/brief.json clients/${slug}/project`);
