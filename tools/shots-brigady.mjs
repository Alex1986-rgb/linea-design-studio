#!/usr/bin/env node
// Скриншоты «Ремонт по проекту» в headless Chrome (CDP через встроенный WebSocket Node, без зависимостей), 375 и 1280 px.
//   node tools/test-brigady.mjs --private=<папка> --until=offers      # поднимает php -S :8143 с данными до сравнения
//   node tools/shots-brigady.mjs --private=<папка> [--out=docs/reports/img] [--prefix=2026-10-31-brigady]
// Входные данные — <папка>/_dev.json (ссылка заказа и пароли ТЕСТОВЫХ аккаунтов этой папки). JPEG ≤ 200 КБ.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const PRIV = path.resolve(arg('private'));
const OUT = path.resolve(arg('out') || 'docs/reports/img');
const PREFIX = arg('prefix') || '2026-10-31-brigady';
const DEV = JSON.parse(fs.readFileSync(path.join(PRIV, '_dev.json'), 'utf8'));
const BASE = new URL(DEV.order).origin;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9337;
fs.mkdirSync(OUT, { recursive: true });
const prof = path.join(PRIV, '_chrome');
const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ver;
for (let i = 0; i < 60 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(250); } }
const pageWs = ver.find(t => t.type === 'page').webSocketDebuggerUrl;
const ws = new WebSocket(pageWs);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0; const wait = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const id = ++seq; wait.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async expr => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
await send('Page.enable');

async function go(url, width) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 500 ? 812 : 900, deviceScaleFactor: 1, mobile: width < 500 });
  await send('Page.navigate', { url });
  for (let i = 0; i < 40; i++) { await sleep(150); if (await js('return document.readyState') === 'complete') break; }
  await sleep(600);
}
async function shot(name, { maxH = 1800, y = 0 } = {}) {
  const h = Math.min(maxH, await js(`return document.documentElement.scrollHeight - ${y}`));
  const w = await js('return document.documentElement.clientWidth');
  let q = 72, buf;
  do {
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: q, clip: { x: 0, y, width: w, height: h, scale: 1 }, captureBeyondViewport: true });
    buf = Buffer.from(r.result.data, 'base64'); q -= 8;
  } while (buf.length > 200 * 1024 && q > 30);
  const f = path.join(OUT, `${PREFIX}-${name}.jpg`);
  fs.writeFileSync(f, buf);
  const over = await js('return document.documentElement.scrollWidth > document.documentElement.clientWidth');
  console.log(`  ${path.basename(f)} ${w}×${h} ${Math.round(buf.length / 1024)} КБ${over ? '  ⚠ горизонтальная прокрутка' : ''}`);
}
const topOf = sel => js(`const e=document.querySelector(${JSON.stringify(sel)}); return e ? Math.max(0, Math.round(e.getBoundingClientRect().top + scrollY - 10)) : 0`);
const click = async (sel, ms = 900) => { await js(`document.querySelector(${JSON.stringify(sel)}).click()`); await sleep(ms); };
const login = async (email, password) => js(`return (await fetch('/api/brigade/auth.php?a=login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:${JSON.stringify(email)},password:${JSON.stringify(password)}})})).status`);

// 1. регистрация бригады, телефон
await go(`${BASE}/brigada/?test=1#register`, 375);
await shot('registraciya-375', { y: await topOf('#fReg'), maxH: 1700 });
// 2–3. лента и предложение (бригада A)
await go(`${BASE}/brigada/`, 1280);
await login(DEV.brigades[0].email, DEV.brigades[0].password);
await go(`${BASE}/brigada/`, 1280);
await click('[data-t=feed]');
await shot('lenta-1280', { y: await topOf('#bx'), maxH: 700 });
await click('[data-r]', 1200);
await shot('predlozhenie-1280', { y: await topOf('#fOffer'), maxH: 1500 });
await go(`${BASE}/brigada/`, 375);
await click('[data-t=feed]'); await click('[data-r]', 1200);
await shot('predlozhenie-375', { y: await topOf('#fOffer'), maxH: 1600 });
// 4–5. сравнение у клиента
await go(DEV.order, 1280);
await sleep(800);
await shot('sravnenie-1280', { y: await topOf('#ordRemont'), maxH: 1500 });
await go(DEV.order, 375);
await sleep(800);
await shot('sravnenie-375', { y: await topOf('#ordRemont'), maxH: 1500 });
// 6–7. админка
await go(`${BASE}/api/admin.php`, 1280);
await js(`const f=new FormData(); f.append('password', ${JSON.stringify(DEV.admin)}); await fetch('/api/admin.php',{method:'POST',body:f}); return 1`);
await go(`${BASE}/api/admin-brigady.php?r=1`, 1280);
await shot('admin-zapros-1280', { maxH: 1300 });
await go(`${BASE}/api/admin-brigady.php`, 375);
await shot('admin-brigady-375', { maxH: 1000 });
// 8. каталог
await go(`${BASE}/brigady/?test=1`, 1280);
await shot('katalog-1280', { y: await topOf('.hero-page'), maxH: 1100 });

ws.close(); ch.kill();
try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { }
