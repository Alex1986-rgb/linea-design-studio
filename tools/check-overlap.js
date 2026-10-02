#!/usr/bin/env node
// ================================================================
// LINEA · наложения подписей — проверка из командной строки
//   node tools/check-overlap.js site/portfolio/demo [ещё папки…]
//
// Почему через браузер. Наложения ловятся только настоящими метриками шрифта:
// getBBox() игнорирует трансформацию группы содержимого, а наша оценка ширины
// по числу знаков врёт на кириллице. Поэтому считает страница site/_dev-overlap.html
// в headless-браузере, а скрипт её запускает и читает результат.
//
// Как читается результат. Страница кладёт итог в <script id="result"> как JSON;
// браузер зовётся с --dump-dom и печатает DOM после отработки скриптов. Никаких
// зависимостей и никакого протокола отладчика — только то, что уже есть в системе.
// ================================================================
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', 'site');
const MIME = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };

const RESULT_RE = /<script[^>]*id="result"[^>]*>([\s\S]*?)<\/script>/;

const CHROMES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
];
function findChrome() {
  for (const c of CHROMES) { try { fs.accessSync(c, fs.constants.X_OK); return c; } catch (e) { /* дальше */ } }
  return null;
}

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404).end(); return; }
        // Кэш гасим: страница перечитывает альбом после каждой перегенерации,
        // а браузер иначе отдаёт прошлый выпуск и проверка врёт.
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function dumpDom(chrome, url, profile) {
  return new Promise((resolve, reject) => {
    const args = ['--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${profile}`,
      '--virtual-time-budget=120000', '--dump-dom', url];
    // Браузер на наших альбомах печатает DOM и не выходит (та же болячка, что у
    // tools/album.sh). Поэтому читаем поток и снимаем процесс, как только в выводе
    // появился машиночитаемый итог — ждать его выхода значит ждать впустую.
    // detached — чтобы снять всю группу: браузер плодит вспомогательные процессы,
    // и убийство одного родителя оставляло их висеть.
    const ch = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'ignore'], detached: true });
    let buf = '';
    let done = false;
    const finish = (err, val) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { process.kill(-ch.pid, 'SIGKILL'); } catch (e) { try { ch.kill('SIGKILL'); } catch (e2) { /* уже мёртв */ } }
      err ? reject(err) : resolve(val);
    };
    ch.stdout.on('data', d => {
      buf += d;
      if (RESULT_RE.test(buf)) finish(null, buf);
    });
    ch.on('error', e => finish(e));
    ch.on('exit', () => finish(RESULT_RE.test(buf) ? null : new Error('браузер не отдал результат'), buf));
    const timer = setTimeout(() => finish(new Error('браузер не ответил за 180 с')), 180000);
  });
}

(async () => {
  const projects = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!projects.length) {
    console.error('Использование: node tools/check-overlap.js <папка-проекта> [ещё…]');
    console.error('Например: node tools/check-overlap.js site/portfolio/demo site/portfolio/dom-120');
    process.exit(2);
  }
  const chrome = findChrome();
  if (!chrome) {
    console.error('Не нашёл headless-браузер (Chrome/Chromium/Edge/Brave).');
    console.error('Проверить вручную: открыть site/_dev-overlap.html?p=<проект> на локальном сервере.');
    process.exit(2);
  }
  const srv = await serve();
  const port = srv.address().port;
  const profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'linea-overlap-'));
  let bad = 0;
  try {
    for (const proj of projects) {
      const rel = path.relative(ROOT, path.resolve(proj));
      if (rel.startsWith('..')) { console.error(`  ✗ ${proj}: папка вне site/`); bad++; continue; }
      const url = `http://127.0.0.1:${port}/_dev-overlap.html?p=${encodeURIComponent(rel)}`;
      let r;
      try {
        const dom = await dumpDom(chrome, url, profile);
        r = JSON.parse((dom.match(RESULT_RE) || [])[1]);
      } catch (e) {
        console.error(`  ✗ ${proj}: ${e.message}`);
        bad++;
        continue;
      }
      const head = `${path.basename(proj)}: листов ${r.sheets}`;
      if (!r.total) { console.log(`✔ ${head} · наложений нет`); continue; }
      bad++;
      console.log(`✖ ${head} · наложений ${r.total}`);
      for (const it of r.items) {
        console.log(`   ${it.file} — ${it.bad.length} из ${it.texts} надписей`);
        for (const x of it.bad.slice(0, 8)) console.log(`      «${x.a}» ↔ «${x.b}» — ${x.ox}×${x.oy} px`);
        if (it.bad.length > 8) console.log(`      …ещё ${it.bad.length - 8}`);
      }
    }
  } finally {
    srv.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
  console.log(bad ? `\nПроектов с наложениями: ${bad}.` : '\nНаложений нет ни на одном листе.');
  process.exit(bad ? 1 : 0);
})();
