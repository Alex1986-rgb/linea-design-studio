#!/usr/bin/env node
// Скриншоты кабинета бригады (и ремонта в кабинете клиента) в headless Chrome (CDP, без зависимостей), 375 и 1280 px.
//   node tools/test-brigady.mjs --private=<папка> --until=shots      # поднимает php -S :8143 с бригадой, объектом в работе и бригадиром
//   node tools/shots-brigada.mjs --private=<папка> [--out=docs/reports/img] [--prefix=2026-11-01-kabinet-brigady]
// Вход клиента — кодом (devCode отдаёт только локальный сервер с LINEA_MAIL_DRY), админ — тестовый пароль из <папка>/_dev.json.
// JPEG ≤ 150 КБ; горизонтальная прокрутка страницы отмечается ⚠.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const PRIV = path.resolve(arg('private'));
const OUT = path.resolve(arg('out') || 'docs/reports/img');
const PREFIX = arg('prefix') || '2026-11-01-kabinet-brigady';
const DEV = JSON.parse(fs.readFileSync(path.join(PRIV, '_dev.json'), 'utf8'));
const BASE = DEV.base;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9339;
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
  } while (buf.length > 150 * 1024 && q > 26);
  const f = path.join(OUT, `${PREFIX}-${name}.jpg`);
  fs.writeFileSync(f, buf);
  const over = await js('return document.documentElement.scrollWidth > document.documentElement.clientWidth');
  console.log(`  ${path.basename(f)} ${w}×${h} ${Math.round(buf.length / 1024)} КБ${over ? '  ⚠ горизонтальная прокрутка' : ''}`);
}
const topOf = sel => js(`const e=document.querySelector(${JSON.stringify(sel)}); return e ? Math.max(0, Math.round(e.getBoundingClientRect().top + scrollY - 10)) : 0`);
const login = email => js(`await fetch('/api/vhod.php?a=logout',{method:'POST',headers:{'X-CSRF':(await (await fetch('/api/vhod.php?a=me')).json()).csrf}});
  const me=await (await fetch('/api/vhod.php?a=me')).json(); const H={'Content-Type':'application/json','X-CSRF':me.csrf};
  const c=await (await fetch('/api/vhod.php?a=code',{method:'POST',headers:H,body:JSON.stringify({email:${JSON.stringify(email)}})})).json();
  const v=await (await fetch('/api/vhod.php?a=verify',{method:'POST',headers:H,body:JSON.stringify({email:${JSON.stringify(email)},code:c.devCode,remember:true})})).json();
  if (v.choose) { const m2=await (await fetch('/api/vhod.php?a=me')).json(); await fetch('/api/vhod.php?a=role',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF':m2.csrf},body:JSON.stringify({role:${JSON.stringify(email === DEV.client ? 'client' : 'brigade')}})}); }
  return v.ok`);
const G = `${BASE}/brigada/`;
// 1. вход (телефон)
await go(G, 375); await shot('vhod-375', { y: await topOf('main'), maxH: 900 });
// 2. владелец: главная, объект, этапы, мастер сдачи, оплаты, деньги, команда, профиль
await go(G, 375); console.log('  вход владельца:', await login(DEV.brigade));
await go(G + '#/', 1280); await shot('glavnaya-1280', { y: await topOf('main'), maxH: 900 });
await go(G + '#/', 375); await shot('glavnaya-375', { viewport: true });
await go(G + '#/obekt/' + DEV.job + '/etapy', 375); await shot('etapy-375', { y: await topOf('main'), maxH: 2200 });
await js(`document.querySelector('[data-wiz]')?.click(); return 1`); await sleep(500); await shot('sdacha-etapa-375', { viewport: true });
await go(G + '#/obekt/' + DEV.job + '/oplaty', 375); await shot('oplaty-375', { y: await topOf('main'), maxH: 1700 });
await go(G + '#/obekt/' + DEV.job + '/dogovor', 1280); await shot('dogovor-1280', { y: await topOf('main'), maxH: 1100 });
await go(G + '#/dengi', 1280); await shot('dengi-1280', { y: await topOf('main'), maxH: 1300 });
await go(G + '#/komanda', 1280); await shot('komanda-1280', { y: await topOf('main'), maxH: 1200 });
await go(G + '#/reiting', 375); await shot('reiting-375', { y: await topOf('main'), maxH: 1400 });
await go(G + '#/profil', 375); await shot('profil-375', { y: await topOf('main'), maxH: 1800 });
await go(G + '#/eshche', 375); await shot('eshche-375', { viewport: true });
// 3. бригадир: меньше пунктов, «Попросить владельца подписать»
await go(G, 375); console.log('  вход бригадира:', await login(DEV.foreman));
await go(G + '#/', 1280); await shot('brigadir-1280', { y: await topOf('main'), maxH: 900 });
// 4. заказчик того же объекта: этапы и оплаты в кабинете (kabinet-remont.js)
await go(`${BASE}/kabinet/`, 375); console.log('  вход заказчика:', await login(DEV.client));
await go(`${BASE}/kabinet/#/o/${DEV.order}/remont`, 375); await sleep(900);
await js(`[...document.querySelectorAll('[data-sec]')].find(a => a.dataset.sec === 'oplaty')?.click(); return 1`); await sleep(500);
await shot('klient-oplaty-375', { y: await topOf('.kab-tabs'), maxH: 1500 });
await go(`${BASE}/kabinet/#/o/${DEV.order}/remont`, 1280); await sleep(900); await shot('klient-etapy-1280', { y: await topOf('.kab-tabs'), maxH: 1500 });

ws.close(); ch.kill();
try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { }
