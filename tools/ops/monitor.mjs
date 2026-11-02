#!/usr/bin/env node
// LINEA · внешний мониторинг сайта (SmartApe, Планировщик Windows раз в 5 минут).
//
//   node monitor.mjs            один прогон: проверки → state/monitor.json → оповещение только при СМЕНЕ состояния
//   node monitor.mjs --print    то же + таблица в консоль
//   node monitor.mjs --test-alert   отправить пробное оповещение по настроенным каналам
//
// Проверки: dns (A домена через DoH Google и системный резолвер), home (главная 200), ping (api/ping.php: ok/private/config),
// kabinet (/kabinet/ 200), ssl (срок сертификата; меньше sslWarnDays — «внимание»), backup (последний удачный бэкап не старше N часов).
// Без шума: сбой считается подтверждённым после failConfirmRuns прогонов подряд; одно письмо на все сменившиеся проверки;
// пока сбой длится — напоминание раз в remindHours; восстановление — сразу.
import tls from 'node:tls';
import dns from 'node:dns';
import path from 'node:path';
import fs from 'node:fs';
import { P, cfg, logger, readJson, writeJson, notify } from './lib.mjs';

const C = cfg();
const log = logger('monitor');
const argv = process.argv.slice(2);
const UA = 'LINEA-monitor/1 (+SmartApe)';
const site = C.site.replace(/\/+$/, '');

async function get(url, ms = 20000) {
  const t0 = Date.now();
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'mon=' + Date.now(), { redirect: 'follow', headers: { 'user-agent': UA, 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(ms) });
  const body = await r.text();
  return { status: r.status, body, ms: Date.now() - t0 };
}
const errText = e => (e.cause && (e.cause.code || e.cause.message)) || e.code || e.name || e.message;

const CHECKS = {
  async dns() {
    const d = C.domain;
    let doh = null, sys = null;
    try {
      const r = await fetch(`https://dns.google/resolve?name=${d}&type=A`, { signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      doh = j.Status === 0 && (j.Answer || []).some(a => a.type === 1) ? j.Answer.filter(a => a.type === 1).map(a => a.data).join(',') : `Status ${j.Status}`;
    } catch (e) { doh = 'ошибка ' + errText(e); }
    try { sys = (await dns.promises.resolve4(d)).join(','); } catch (e) { sys = 'ошибка ' + (e.code || e.message); }
    const okDoh = /^\d/.test(doh), okSys = /^\d/.test(sys);
    return { status: okDoh || okSys ? (okDoh && okSys ? 'ok' : 'warn') : 'fail', detail: `DoH ${doh}; система ${sys}` };
  },
  async home() {
    const r = await get(site + C.pages.home);
    return { status: r.status === 200 && /<\/html>/i.test(r.body) ? 'ok' : 'fail', detail: `HTTP ${r.status}, ${r.ms} мс` };
  },
  async ping() {
    const r = await get(site + C.pages.ping);
    let j = null; try { j = JSON.parse(r.body); } catch { }
    const good = r.status === 200 && j && j.ok === true && j.private === true && j.config === true;
    return { status: good ? 'ok' : 'fail', detail: good ? `ok, ${r.ms} мс` : `HTTP ${r.status}; ${j ? `ok=${j.ok} private=${j.private} config=${j.config}` : 'не JSON'}` };
  },
  async kabinet() {
    const r = await get(site + C.pages.kabinet);
    return { status: r.status === 200 ? 'ok' : 'fail', detail: `HTTP ${r.status}, ${r.ms} мс` };
  },
  ssl() {
    const host = new URL(site).hostname;
    return new Promise(resolve => {
      const s = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 15000 }, () => {
        const c = s.getPeerCertificate(); const authErr = s.authorizationError; s.end();
        if (!c || !c.valid_to) return resolve({ status: 'fail', detail: 'сертификат не получен' });
        const days = Math.floor((new Date(c.valid_to) - Date.now()) / 86400e3);
        const st = authErr || days < 0 ? 'fail' : days < C.sslWarnDays ? 'warn' : 'ok';
        resolve({ status: st, detail: `до ${new Date(c.valid_to).toISOString().slice(0, 10)} (${days} дн.)${authErr ? ', не доверен: ' + authErr : ''}` });
      });
      s.on('timeout', () => { s.destroy(); resolve({ status: 'fail', detail: 'TLS: таймаут' }); });
      s.on('error', e => resolve({ status: 'fail', detail: 'TLS: ' + (e.code || e.message) }));
    });
  },
  backup() {
    if (!C.backupMaxAgeHours) return { status: 'ok', detail: 'не проверяется' };
    const ok = readJson(path.join(P.state, 'backup-last-ok.json'), null);
    if (!ok) return { status: C.expectBackup ? 'fail' : 'ok', detail: C.expectBackup ? 'удачного бэкапа ещё не было' : 'бэкап ещё не включён' };
    const h = (Date.now() - new Date(ok.at)) / 3600e3;
    return { status: h <= C.backupMaxAgeHours ? 'ok' : 'fail', detail: `последний удачный ${h.toFixed(1)} ч назад (${ok.name})` };
  },
};
const TITLE = { dns: 'DNS домена', home: 'главная', ping: 'api/ping.php', kabinet: 'кабинет', ssl: 'SSL-сертификат', backup: 'бэкап' };

async function main() {
  if (argv.includes('--test-alert')) { console.log(await notify('пробное оповещение', 'Канал работает. Мониторинг LINEA, SmartApe.')); return; }
  const stFile = path.join(P.state, 'monitor.json');
  const prev = readJson(stFile, { checks: {} });
  const now = Date.now();
  const res = {};
  await Promise.all(Object.entries(CHECKS).filter(([k]) => !(C.disable || []).includes(k)).map(async ([k, fn]) => {
    try { res[k] = await fn(); } catch (e) { res[k] = { status: 'fail', detail: 'ошибка: ' + errText(e) }; }
  }));
  const changes = [], recovered = [], reminders = [];
  const next = { at: new Date(now).toISOString(), checks: {} };
  for (const [k, r] of Object.entries(res)) {
    const p = prev.checks[k];
    const streak = p && p.raw === r.status ? p.streak + 1 : 1;
    let confirmed = r.status === 'fail' && streak < C.failConfirmRuns ? (p ? p.confirmed : 'ok') : r.status;
    if (r.status === 'fail' && !p) confirmed = 'fail';   // первый прогон: сразу фиксируем, что уже лежит
    const n = { raw: r.status, streak, confirmed, detail: r.detail, since: p && p.confirmed === confirmed ? p.since : next.at, notified: p ? p.notified : null };
    if (!p || p.confirmed !== confirmed) {
      if (confirmed === 'ok' && p && p.confirmed !== 'ok') recovered.push(`${TITLE[k]}: ${r.detail}`);
      else if (confirmed !== 'ok') changes.push(`${confirmed === 'fail' ? 'СБОЙ' : 'внимание'} — ${TITLE[k]}: ${r.detail}`);
      if (confirmed !== 'ok' || (p && p.confirmed !== 'ok')) n.notified = next.at;
    } else if (confirmed !== 'ok' && n.notified && now - new Date(n.notified) > C.remindHours * 3600e3) {
      reminders.push(`всё ещё ${confirmed === 'fail' ? 'сбой' : 'внимание'} с ${n.since.slice(0, 16).replace('T', ' ')} UTC — ${TITLE[k]}: ${r.detail}`);
      n.notified = next.at;
    }
    next.checks[k] = n;
  }
  writeJson(stFile, next);
  log(Object.entries(res).map(([k, r]) => `${k}=${r.status}`).join(' '));
  if (changes.length || reminders.length) await notify(changes.length ? 'проблема на сайте' : 'сбой продолжается', [...changes, ...reminders].join('\n') + `\n${site}`);
  if (recovered.length) await notify('восстановлено', recovered.join('\n'), { ok: true });
  if (recovered.length && !Object.values(next.checks).some(c => c.confirmed !== 'ok')) { try { fs.renameSync(path.join(P.state, 'ALERT.txt'), path.join(P.state, `ALERT-${next.at.slice(0, 10)}-closed.txt`)); } catch { } }
  if (argv.includes('--print')) for (const [k, c] of Object.entries(next.checks)) console.log(`${c.confirmed.padEnd(5)} ${k.padEnd(8)} ${c.detail}${c.raw !== c.confirmed ? `  (сейчас ${c.raw}, подтверждение ${c.streak}/${C.failConfirmRuns})` : ''}`);
}
main().catch(e => { log('сбой монитора: ' + (e.stack || e)); process.exitCode = 1; });
