#!/usr/bin/env node
'use strict';
// ================================================================
// LINEA · снапшот-фикстуры альбома
// Гоняет движок по эталонным брифам с фиксированной датой выпуска
// и сверяет sha256 каждого листа с сохранённым снимком.
// Любая правка generate.js, которая молча изменила лист, видна здесь.
//
//   node tools/regen-fixtures.js              — проверить
//   node tools/regen-fixtures.js --update     — принять текущий вывод как эталон
//   node tools/regen-fixtures.js --only=studio-24
// ================================================================
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FIX_DIR = path.join(ROOT, 'examples', 'fixtures');
const SNAP_DIR = path.join(FIX_DIR, 'snapshots');
const DATE = '01.01.2026';   // дата выпуска фикстур: закреплена, иначе штамп плавает каждый день

const FLAGS = {};
for (const a of process.argv.slice(2)) { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a); if (m) FLAGS[m[1]] = m[2] === undefined ? true : m[2]; }

// эталонные брифы: два демо-проекта студии + краевые случаи
const briefs = [
  { name: 'demo-56', file: path.join(ROOT, 'examples', 'demo-brief.json') },
  { name: 'house-120', file: path.join(ROOT, 'examples', 'house-brief.json') },
  ...fs.readdirSync(FIX_DIR).filter(f => f.endsWith('.json')).sort()
    .map(f => ({ name: f.replace(/\.json$/, ''), file: path.join(FIX_DIR, f) }))
].filter(b => !FLAGS.only || b.name === FLAGS.only);

const sha = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

function walk(dir, base) {
  const out = {};
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    const p = path.join(dir, e.name), rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) Object.assign(out, walk(p, rel));
    else out[rel] = sha(fs.readFileSync(p));
  }
  return out;
}

fs.mkdirSync(SNAP_DIR, { recursive: true });
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linea-fix-'));
let failed = 0, updated = 0;

for (const b of briefs) {
  const out = path.join(tmpRoot, b.name);
  let log = '';
  try {
    log = execFileSync('node', [path.join(ROOT, 'engine', 'generate.js'), b.file, out, `--date=${DATE}`], { encoding: 'utf8', cwd: ROOT });
  } catch (e) {
    console.log(`✖ ${b.name}: движок упал\n${(e.stdout || '') + (e.stderr || '')}`);
    failed++; continue;
  }
  const now = walk(out, '');
  const snapFile = path.join(SNAP_DIR, b.name + '.json');
  const sheets = Object.keys(now).filter(f => f.endsWith('.svg')).length;

  if (FLAGS.update || !fs.existsSync(snapFile)) {
    fs.writeFileSync(snapFile, JSON.stringify(now, null, 1) + '\n');
    console.log(`${fs.existsSync(snapFile) ? '↻' : '+'} ${b.name}: снимок записан — ${Object.keys(now).length} файлов (листов ${sheets})`);
    updated++; continue;
  }

  const was = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
  const added = Object.keys(now).filter(f => !(f in was));
  const gone = Object.keys(was).filter(f => !(f in now));
  const diff = Object.keys(now).filter(f => f in was && was[f] !== now[f]);

  if (!added.length && !gone.length && !diff.length) {
    console.log(`✔ ${b.name}: ${Object.keys(now).length} файлов совпали (листов ${sheets})`);
  } else {
    failed++;
    console.log(`✖ ${b.name}: изменено ${diff.length}, добавлено ${added.length}, удалено ${gone.length}`);
    for (const f of diff.slice(0, 12)) console.log(`    ~ ${f}`);
    if (diff.length > 12) console.log(`    … и ещё ${diff.length - 12}`);
    for (const f of added.slice(0, 8)) console.log(`    + ${f}`);
    for (const f of gone.slice(0, 8)) console.log(`    − ${f}`);
  }
}

fs.rmSync(tmpRoot, { recursive: true, force: true });
if (updated) console.log(`\nСнимков записано: ${updated}. Проверьте их глазами перед коммитом — снимок фиксирует то, что есть, а не то, что правильно.`);
if (failed) {
  console.log(`\nРасхождений в ${failed} фикстур${failed === 1 ? 'е' : 'ах'}. Если правка движка задумана — посмотрите листы и запустите с --update.`);
  process.exit(1);
}
