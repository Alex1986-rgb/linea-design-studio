#!/usr/bin/env node
// Скриншоты кабинета клиента и админки в headless Chrome (CDP, без зависимостей), 375 и 1280 px.
//   node tools/test-kabinety.mjs --private=<папка> --until=shots     # поднимает php -S :8144 с тестовыми данными
//   node tools/shots-kabinety.mjs --private=<папка> [--out=docs/reports/img] [--prefix=2026-11-01-kabinety]
// Вход клиента — кодом (devCode отдаёт только локальный сервер с LINEA_MAIL_DRY), админ — тестовый пароль из <папка>/_dev.json.
// JPEG ≤ 200 КБ; горизонтальная прокрутка страницы отмечается ⚠.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const PRIV = path.resolve(arg('private'));
const OUT = path.resolve(arg('out') || 'docs/reports/img');
const PREFIX = arg('prefix') || '2026-11-01-kabinety';
const DEV = JSON.parse(fs.readFileSync(path.join(PRIV, '_dev.json'), 'utf8'));
const BASE = DEV.base;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9338;
fs.mkdirSync(OUT, { recursive: true });
const prof = path.join(PRIV, '_chrome');
const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ver;
for (let i = 0; i < 60 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(250); } }
const ws = new WebSocket(ver.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0; const wait = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const id = ++seq; wait.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async expr => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
await send('Page.enable');

let W = 1280;
async function go(url, width = W) {
  W = width;
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 500 ? 812 : 900, deviceScaleFactor: 1, mobile: width < 500 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(100);
  await send('Page.navigate', { url });
  for (let i = 0; i < 40; i++) { await sleep(150); if (await js('return document.readyState') === 'complete') break; }
  await sleep(900);
}
async function shot(name, { maxH = 1800, y = 0, viewport = false } = {}) {
  // длинный снимок телефона: липкие панели (нижнее меню, главная кнопка) прячем, иначе они рисуются посреди снимка
  await js(`document.querySelectorAll('.kab-tabbar,.kab-sticky').forEach(e => e.style.visibility = ${viewport ? "''" : "'hidden'"}); return 1`);
  const h = viewport ? (W < 500 ? 812 : 900) : Math.min(maxH, await js(`return document.documentElement.scrollHeight - ${y}`));
  const w = await js('return document.documentElement.clientWidth');
  let q = 74, buf;
  do {
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: q, clip: { x: 0, y, width: w, height: h, scale: 1 }, captureBeyondViewport: !viewport });
    buf = Buffer.from(r.result.data, 'base64'); q -= 8;
  } while (buf.length > 200 * 1024 && q > 30);
  const f = path.join(OUT, `${PREFIX}-${name}.jpg`);
  fs.writeFileSync(f, buf);
  const over = await js('return document.documentElement.scrollWidth > document.documentElement.clientWidth');
  console.log(`  ${path.basename(f)} ${w}×${h} ${Math.round(buf.length / 1024)} КБ${over ? '  ⚠ горизонтальная прокрутка' : ''}`);
}
const topOf = sel => js(`const e=document.querySelector(${JSON.stringify(sel)}); return e ? Math.max(0, Math.round(e.getBoundingClientRect().top + scrollY - 10)) : 0`);
const K = `${BASE}/kabinet/`;

// 1. вход (телефон) — до входа
await go(K, 375);
await shot('vhod-375', { y: await topOf('#kab'), maxH: 900 });
// вход кодом из браузера (тестовый сервер отдаёт devCode); почта с двумя ролями → «Куда войти?»
await js(`const me=await (await fetch('/api/vhod.php?a=me')).json(); const H={'Content-Type':'application/json','X-CSRF':me.csrf};
  const c=await (await fetch('/api/vhod.php?a=code',{method:'POST',headers:H,body:JSON.stringify({email:${JSON.stringify(DEV.email)}})})).json();
  const v=await (await fetch('/api/vhod.php?a=verify',{method:'POST',headers:H,body:JSON.stringify({email:${JSON.stringify(DEV.email)},code:c.devCode,remember:true})})).json(); return JSON.stringify([c, v.ok, v.error||'', v.choose||''])`).then(r => console.log('  вход:', r));
await go(K + '#/rol', 375);
await shot('rol-375', { y: await topOf('#kab'), maxH: 800 });
await js(`const me=await (await fetch('/api/vhod.php?a=me')).json(); await fetch('/api/vhod.php?a=role',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF':me.csrf},body:JSON.stringify({role:'client'})}); sessionStorage.setItem('kab_list','1'); return 1`);
// 2. мои объекты
await go(K + '#/', 1280); await shot('obekty-1280', { y: await topOf('#kab'), maxH: 900 });
await go(K + '#/', 375); await shot('obekty-375', { viewport: true });
// 3. объект — проект
await go(K + '#/o/' + DEV.order + '/proekt', 1280); await shot('proekt-1280', { y: await topOf('#kab'), maxH: 1900 });
await go(K + '#/o/' + DEV.order + '/proekt', 375); await shot('proekt-375', { viewport: true });
await shot('proekt-375-dlinno', { y: await topOf('#kab'), maxH: 2600 });
// 4. вопросы и решения
await go(K + '#/o/' + DEV.order + '/voprosy', 375);
await js(`document.querySelector('[data-qf="done"]')?.click(); return 1`); await sleep(900);
await shot('voprosy-375', { y: await topOf('.kab-tabs'), maxH: 1400 });
// 5. ремонт
await go(K + '#/o/' + DEV.order + '/remont', 1280); await sleep(800); await shot('remont-1280', { y: await topOf('.kab-tabs'), maxH: 1800 });
// 6. документы, уведомления, профиль
await go(K + '#/docs', 1280); await sleep(500); await shot('dokumenty-1280', { y: await topOf('#kab'), maxH: 1200 });
await go(K + '#/uvedomleniya', 375); await shot('uvedomleniya-375', { y: await topOf('#kab'), maxH: 1600 });
await go(K + '#/profil', 375); await shot('profil-375', { y: await topOf('#kab'), maxH: 2600 });
// 7. админка
await go(`${BASE}/api/admin.php`, 1280);
await js(`const f=new FormData(); f.append('password', ${JSON.stringify(DEV.admin)}); await fetch('/api/admin.php',{method:'POST',body:f}); return 1`);
await go(`${BASE}/api/panel.php`, 1280); await shot('admin-dashboard-1280', { maxH: 1400 });
await go(`${BASE}/api/panel.php`, 375); await shot('admin-dashboard-375', { maxH: 1400 });
await go(`${BASE}/api/panel.php?s=order&o=${DEV.order}&tab=voprosy`, 1280); await shot('admin-zakaz-voprosy-1280', { maxH: 1100 });
await go(`${BASE}/api/panel.php?s=order&o=${DEV.order}&tab=vypuski`, 375); await shot('admin-zakaz-375', { maxH: 1500 });
await go(`${BASE}/api/panel.php?s=money`, 1280); await shot('admin-dengi-1280', { maxH: 900 });
await go(`${BASE}/api/panel.php?s=pd`, 1280); await shot('admin-pdn-1280', { maxH: 800 });
await go(`${BASE}/api/panel.php?s=audit`, 1280); await shot('admin-zhurnal-1280', { maxH: 1100 });
await go(`${BASE}/api/panel.php?s=settings`, 1280); await shot('admin-nastroiki-1280', { maxH: 1500 });

ws.close(); ch.kill();
try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { }
