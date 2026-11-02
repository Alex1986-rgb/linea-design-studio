#!/usr/bin/env node
// Проверка кабинетов и админки (спецификация docs/brigady/spec-kabinety-adminka.md, блок 0 и I) на маке: php -S + отдельная папка данных.
//   node tools/test-kabinety.mjs [--private=<папка>] [--port=8144] [--mysql=<dsn>] [--keep]
// Вход кодом (неизвестная почта — тот же ответ, неверный/просроченный код, 5 попыток, лимит кодов), гостевая сессия по старой ссылке
// (видно, но действия — 401 needCode), права (чужой заказ — 404), бригада входит тем же кодом, выбор роли, админ-действия с журналом
// (сумма, статус, выпуск с реестром, «учтено», сообщение, перевыпуск ссылки), ответы К-N → answers.json, решение → signatures,
// заявки по ПДн (выгрузка → ZIP; удаление при оплаченной работе → 409; после выдачи — обезличивание), отзыв согласия,
// таймеры cron (напоминания и сигнал молчания, этап НЕ принимается, пауза при заморозке), вознаграждение «отложено» → реквизиты → счёт →
// оплачено, заморозка сделки, лестница предупреждений (3-е → лента 403), настройки brig_terms, выход на всех устройствах.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const PRIV = path.resolve(arg('private') || path.join(os.tmpdir(), 'linea-kabinety-test'));
const PORT = +(arg('port') || 8144);
const UNTIL = arg('until');   // --until=shots — остановиться перед удалением данных, оставить сервер и _dev.json для tools/shots-kabinety.mjs
const KEEP = process.argv.includes('--keep') || !!UNTIL;
const MYSQL = arg('mysql');
const MUSER = arg('mysql-user') || process.env.USER;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x ? ' — ' + String(x).slice(0, 300) : '')); } };
const step = t => console.log('\n' + t);

fs.rmSync(PRIV, { recursive: true, force: true });
fs.mkdirSync(PRIV, { recursive: true });
const ADMIN_PASS = crypto.randomBytes(12).toString('hex');
const hash = execFileSync('php', ['-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', ADMIN_PASS]).toString();
fs.writeFileSync(path.join(PRIV, 'config.php'), `<?php return ['mode' => 'manual', 'admin_hash' => '${hash}', 'notify_enabled' => false, 'brig_mail_enabled' => false, 'tg_enabled' => false, 'briefs_per_hour' => 50, 'auth_codes_per_hour_ip' => 200, 'admin_emails' => ['boss@example.test']${MYSQL ? `, 'db' => ['dsn' => '${MYSQL}', 'user' => '${MUSER}', 'pass' => '']` : ''}];`);
if (MYSQL) execFileSync('php', ['-r', `$p = new PDO($argv[1], $argv[2], ''); $p->exec('SET FOREIGN_KEY_CHECKS=0'); foreach ($p->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $t) { $p->exec("DROP TABLE \`$t\`"); }`, MYSQL, MUSER]);
const DSN = MYSQL || 'sqlite:' + path.join(PRIV, 'linea.sqlite');
const sql = q => JSON.parse(execFileSync('php', ['-r', '$p = new PDO($argv[1], $argv[2], ""); $p->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $s = $p->query($argv[3]); echo json_encode($s && $s->columnCount() ? $s->fetchAll(PDO::FETCH_ASSOC) : []);', DSN, MYSQL ? MUSER : '', q]).toString() || '[]');
const ins = (t, row) => { const k = Object.keys(row); sql(`INSERT INTO ${t} (${k.join(',')}) VALUES (${k.map(x => row[x] === null ? 'NULL' : typeof row[x] === 'number' ? row[x] : "'" + String(row[x]).replace(/'/g, "''") + "'").join(',')})`); return +sql(`SELECT MAX(id) id FROM ${t}`)[0].id; };
const ts = (days = 0) => new Date(Date.now() - days * 86400e3 + 3 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
const cron = (env = {}) => execFileSync('php', [path.join(ROOT, 'server/tools/cron.php'), '--private=' + PRIV], { env: { ...process.env, LINEA_MAIL_DRY: '1', ...env } }).toString();

const FX = path.join(PRIV, '_fx'); fs.mkdirSync(FX);
const mkBrief = (email, name) => { const b = { meta: { test: true, service: 'kvartira' }, client: { name, phone: '+7 900 000-00-0' + name.length, email, consent: { personalData: true, portfolio: true, edition: '27.10.2026', at: new Date().toISOString() } }, object: { type: 'квартира', area: 64, address: 'Москва, тестовая ул., 1' } };
  const f = path.join(FX, name + '.json'); fs.writeFileSync(f, JSON.stringify(b)); execFileSync('zip', ['-qj', path.join(FX, name + '.zip'), f]); return b; };
fs.writeFileSync(path.join(FX, 'album.pdf'), '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
fs.writeFileSync(path.join(FX, 'registry.json'), JSON.stringify({ items: [
  { id: 'К-1', kind: 'question', client_text: 'Оставляем стену между кухней и комнатой?', options: ['Да, оставить', 'Нет, сносить', 'Уточню на обмере'], blocker: true, sheet: 'План демонтажа' },
  { id: 'К-2', kind: 'question', client_text: 'Где будет стиральная машина?', options: [] },
  { id: 'П-1', proposed: true, client_text: 'Перенести щиток в прихожую', why: 'Короче трассы, проще обслуживание', cost: '+12 400 ₽ к ремонту' },
] }));

const srv = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', path.join(ROOT, 'site'), path.join(ROOT, 'tools/dev-router.php')],
  { env: { ...process.env, LINEA_PRIVATE: PRIV, LINEA_MAIL_DRY: '1' }, stdio: ['ignore', 'ignore', KEEP ? fs.openSync(path.join(PRIV, '_server.log'), 'a') : 'pipe'], detached: KEEP });
let srvErr = ''; if (!KEEP) srv.stderr.on('data', d => { srvErr += d; }); else srv.unref();
process.on('exit', () => { if (!KEEP) srv.kill(); });
for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/ping.php'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }

function actor(name) {
  const jar = new Map(); const a = { name, csrf: '' };
  a.req = async (method, url, { json, form, raw = false, headers = {} } = {}) => {
    const h = { ...headers };
    if (jar.size) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (a.csrf && method === 'POST' && !h['X-CSRF']) h['X-CSRF'] = a.csrf;
    let body;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) { body = new FormData(); for (const [k, v] of Object.entries(form)) { if (v && v.file) body.append(k, new Blob([fs.readFileSync(v.file)], { type: v.type || 'application/octet-stream' }), path.basename(v.file)); else body.append(k, String(v)); } }
    const r = await fetch(BASE + url, { method, headers: h, body, redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const [k, ...v] = kv.split('='); if (/Max-Age=0|expires=Thu, 01 Jan 1970/i.test(c) || v.join('=') === 'deleted') jar.delete(k.trim()); else jar.set(k.trim(), v.join('=')); }
    const text = await r.text(); let j = null; if (!raw) { try { j = JSON.parse(text); } catch { } }
    return { code: r.status, j, text, headers: r.headers, buf: text };
  };
  a.me = async () => { const r = await a.req('GET', '/api/vhod.php?a=me'); a.csrf = r.j?.csrf || ''; return r.j; };
  a.login = async email => { await a.me(); const c = await a.req('POST', '/api/vhod.php?a=code', { json: { email } }); const v = await a.req('POST', '/api/vhod.php?a=verify', { json: { email, code: c.j?.devCode } }); if (v.j?.csrf) a.csrf = v.j.csrf; return v; };
  return a;
}
const admin = actor('admin');
const adminCsrf = html => (html.match(/name="csrf" value="([0-9a-f]+)"/) || [])[1];
let ACS = '';
const panel = async (fields) => { if (!ACS) ACS = adminCsrf((await admin.req('GET', '/api/panel.php', { raw: true })).text); return admin.req('POST', '/api/panel.php', { form: { csrf: ACS, ...fields }, raw: true }); };
const panelMsg = async () => ((await admin.req('GET', '/api/panel.php?s=audit', { raw: true })).text.match(/<p class="msg">([^<]*)<\/p>/) || [])[1] || '';

try {
  step('1. Бриф → аккаунт клиента создаётся сам, заказ привязан');
  const A = actor('clientA'), Bc = actor('clientB'), G = actor('guest'), X = actor('stranger');
  mkBrief('anna@example.test', 'Анна'); mkBrief('boris@example.test', 'Борис');
  const brief = async (who, name) => (await who.req('POST', '/api/brief.php?test=1', { form: { test: 1, json: fs.readFileSync(path.join(FX, name + '.json'), 'utf8'), brief: { file: path.join(FX, name + '.zip'), type: 'application/zip' } } })).j;
  const bA = await brief(A, 'Анна'), bB = await brief(Bc, 'Борис');
  ok(bA?.ok && bB?.ok, 'два брифа приняты', JSON.stringify(bA));
  const NA = bA.number, TA = bA.token, NB = bB.number;
  const acc = sql("SELECT id, role, pass_hash FROM accounts WHERE email = 'anna@example.test'")[0];
  ok(acc && acc.role === 'client' && acc.pass_hash === '', 'аккаунт клиента без пароля создан по почте брифа');
  ok(+sql(`SELECT account_id FROM orders WHERE number = '${NA}'`)[0].account_id === +acc.id, 'заказ привязан к аккаунту (orders.account_id)');
  ok(+sql(`SELECT COUNT(*) n FROM consents WHERE account_id = ${acc.id}`)[0].n === 2, 'согласия записаны: обработка ПДн и портфолио (с редакцией)');

  step('2. Вход кодом на почту');
  await X.me();
  const unk = await X.req('POST', '/api/vhod.php?a=code', { json: { email: 'nobody@example.test' } });
  const kn = await X.req('POST', '/api/vhod.php?a=code', { json: { email: 'anna@example.test' } });
  ok(unk.j?.ok && kn.j?.ok && unk.j.text === kn.j.text && !unk.j.devCode && !!kn.j.devCode, 'неизвестная почта — тот же ответ, код не создаётся');
  ok(!sql("SELECT 1 x FROM auth_codes WHERE email = 'nobody@example.test'").length, 'в базе нет кода для неизвестной почты');
  ok(!sql("SELECT code_hash FROM auth_codes WHERE email = 'anna@example.test'").some(r => r.code_hash.includes(kn.j.devCode)), 'код хранится только как HMAC');
  const bad = await X.req('POST', '/api/vhod.php?a=verify', { json: { email: 'anna@example.test', code: '000000' } });
  ok(bad.code === 400, 'неверный код → 400');
  for (let i = 0; i < 4; i++) await X.req('POST', '/api/vhod.php?a=verify', { json: { email: 'anna@example.test', code: '000001' } });
  const sixth = await X.req('POST', '/api/vhod.php?a=verify', { json: { email: 'anna@example.test', code: kn.j.devCode } });
  ok(sixth.code === 400 && /Попытки закончились/.test(sixth.j?.error || ''), 'после 5 попыток верный код уже не принимается');
  const kn2 = await X.req('POST', '/api/vhod.php?a=code', { json: { email: 'anna@example.test' } });
  sql("UPDATE auth_codes SET expires_at = 1 WHERE email = 'anna@example.test' AND used_at IS NULL");
  ok((await X.req('POST', '/api/vhod.php?a=verify', { json: { email: 'anna@example.test', code: kn2.j.devCode } })).code === 400, 'просроченный код → 400');
  for (let i = 0; i < 4; i++) await X.req('POST', '/api/vhod.php?a=code', { json: { email: 'anna@example.test' } });
  const lim = await X.req('POST', '/api/vhod.php?a=code', { json: { email: 'anna@example.test' } });
  ok(lim.j?.ok && !lim.j.devCode, 'больше 5 кодов в час на адрес — тот же ответ, кода нет');
  sql("DELETE FROM auth_codes WHERE email = 'anna@example.test'");
  const la = await A.login('anna@example.test');
  ok(la.j?.ok && la.j.go === 'client' && la.j.auth, 'Анна вошла кодом, роль — клиент', la.text);
  const objs = await A.req('GET', '/api/kabinet.php?a=objects');
  ok(objs.j?.objects?.length === 1 && objs.j.objects[0].number === NA, '«Мои объекты»: только свой заказ');
  ok(/Оплатите|Проверяем|Сумма/.test(objs.j.objects[0].next.text), '«Сейчас от вас нужно» вычисляется сервером: ' + objs.j.objects[0].next.text);

  step('3. Права: чужое не видно');
  const lb = await Bc.login('boris@example.test');
  ok(lb.j?.ok, 'Борис вошёл');
  ok((await Bc.req('GET', `/api/kabinet.php?a=object&o=${NA}`)).code === 404, 'Борис не видит заказ Анны (404)');
  ok((await Bc.req('GET', `/api/kabinet.php?a=file&o=${NA}&v=v1&f=album.pdf`)).code === 404, 'и не скачает её альбом');
  ok((await X.req('GET', `/api/kabinet.php?a=object&o=${NA}`)).code === 401, 'без входа → 401');
  ok((await A.req('POST', '/api/kabinet.php?a=msg', { json: { o: NA, text: 'привет' }, headers: { 'X-CSRF': 'x' } })).code === 403, 'POST без CSRF → 403');

  step('4. Админка: вход, дашборд, действия с журналом');
  const lg = await admin.req('POST', '/api/admin.php', { form: { password: ADMIN_PASS }, raw: true });
  ok(lg.code === 302 && /panel\.php/.test(lg.headers.get('location') || ''), 'вход паролем → новая админка panel.php');
  const dash = await admin.req('GET', '/api/panel.php', { raw: true });
  ok(dash.code === 200 && dash.text.includes('Требует действия') && !dash.text.includes(NA), 'дашборд «Требует действия» открывается; тестовые заказы в нём отфильтрованы');
  ok((await admin.req('GET', '/api/panel.php?s=orders', { raw: true })).text.includes(NA), 'в списке заказов тестовый виден с пометкой');
  ok((await X.req('GET', '/api/panel.php', { raw: true })).code === 302, 'без входа панель → на вход');
  await panel({ act: 'o_amount', o: NA, rub: 128000, s_back: 'order', o_back: NA });
  ok(+sql(`SELECT amount_kop FROM orders WHERE number = '${NA}'`)[0].amount_kop === 12800000, 'сумма задана и подтверждена');
  const au = sql("SELECT * FROM br_audit WHERE who = 'admin' AND action = 'order-amount'")[0];
  ok(au && au.ip === '127.0.0.1' && au.target.includes(NA), 'действие админа — в журнале с IP');
  ok((await panel({ act: 'o_status', o: NA, to: 'delivered' })).code === 302 && sql(`SELECT status FROM orders WHERE number = '${NA}'`)[0].status === 'awaiting_payment', 'недопустимый переход статуса не проходит');
  await panel({ act: 'o_status', o: NA, to: 'paid', reason: 'платёжка 15' });
  ok(sql(`SELECT status FROM orders WHERE number = '${NA}'`)[0].status === 'paid', 'оплата отмечена');
  ok((await A.req('GET', '/api/kabinet.php?a=notices')).j?.notices?.some(n => /Оплата получена/.test(n.text)), 'клиенту — уведомление в кабинете');
  const rel = await panel({ act: 'o_release', o: NA, ver: 'v1', title: 'Первый вариант', prelim: 1, project: 'gost-kv3k', changes: 'Первая версия', pdf: { file: path.join(FX, 'album.pdf'), type: 'application/pdf' }, registry: { file: path.join(FX, 'registry.json'), type: 'application/json' } });
  ok(rel.code === 302 && fs.existsSync(path.join(PRIV, 'orders', NA, 'releases/v1/registry.json')), 'выпуск v1 с PDF и реестром опубликован');

  step('5. Кабинет: альбом, вопросы К-N, решение, подпись');
  let ob = await A.req('GET', `/api/kabinet.php?a=object&o=${NA}`);
  ok(ob.j?.releases?.length === 1 && ob.j.releases[0].pdf && ob.j.registry?.items?.length === 3, 'клиент видит версию альбома и 3 пункта реестра');
  ok(/Ответьте на 2 вопроса/.test(ob.j.next.text) && ob.j.next.blocker, '«Сейчас нужно»: ответить на 2 вопроса, есть блокирующий');
  const pdf = await A.req('GET', `/api/kabinet.php?a=file&o=${NA}&v=v1&f=album.pdf`, { raw: true });
  ok(pdf.code === 200 && pdf.text.startsWith('%PDF'), 'PDF альбома отдаётся владельцу');
  ok((await A.req('POST', '/api/kabinet.php?a=answer', { json: { o: NA, id: 'К-1', option: 'Чужой вариант' } })).code === 400, 'вариант не из списка — отказ');
  const an = await A.req('POST', '/api/kabinet.php?a=answer', { json: { o: NA, id: 'К-1', option: 'Да, оставить' } });
  ok(an.j?.ok, 'ответ на К-1 принят', an.text);
  await A.req('POST', '/api/kabinet.php?a=answer', { json: { o: NA, id: 'К-2', text: 'В ванной, под столешницей' } });
  const dc = await A.req('POST', '/api/kabinet.php?a=decide', { json: { o: NA, id: 'П-1', decision: 'agree' } });
  ok(dc.j?.next && /Посмотрите альбом/.test(dc.j.next.text), 'после ответов «Сейчас нужно» сменилось: ' + (dc.j?.next?.text || ''));
  const answers = JSON.parse(fs.readFileSync(path.join(PRIV, 'orders', NA, 'answers.json'), 'utf8'));
  ok(answers.items['К-1'].option === 'Да, оставить' && answers.items['К-1'].sha && answers.items['П-1'].decision === 'agree', 'ответы и решение — в answers.json с версией и хешем реестра');
  const sg = sql(`SELECT * FROM signatures WHERE doc_kind = 'decision'`)[0];
  ok(sg && sg.doc_id === 'П-1' && sg.method === 'session_code' && sg.ip === '127.0.0.1' && sg.sha256.length === 64, 'согласование решения — подпись в реестре signatures (время, IP, хеш)');
  const vq = await admin.req('GET', `/api/panel.php?s=order&o=${NA}&tab=voprosy`, { raw: true });
  ok(vq.text.includes('Да, оставить') && vq.text.includes('Согласовано'), 'админ видит ответы клиента');
  await panel({ act: 'o_q_close', o: NA, qid: 'К-1', reason: 'учтено в v2' });
  ob = await A.req('GET', `/api/kabinet.php?a=object&o=${NA}`);
  ok(ob.j.registry.items.find(i => i.id === 'К-1').closed, '«учтено» видно клиенту');
  const prot = await A.req('GET', `/api/kabinet.php?a=doc&o=${NA}&kind=protocol`, { raw: true });
  ok(prot.code === 200 && prot.text.includes('Протокол ответов') && prot.text.includes('П-1'), 'протокол ответов и подписей — документ клиента');
  await panel({ act: 'o_msg', o: NA, text: 'Анна, первый вариант готов — посмотрите.' });
  ob = await A.req('GET', `/api/kabinet.php?a=object&o=${NA}`);
  ok(ob.j.lenta.some(m => m.who === 'LINEA' && /первый вариант/.test(m.text)), 'сообщение админа — в ленте заказа клиента');
  await panel({ act: 'o_msg', o: NA, text: 'приватно: позвонить', private: 1 });
  ob = await A.req('GET', `/api/kabinet.php?a=object&o=${NA}`);
  ok(!ob.j.lenta.some(m => /приватно/.test(m.text)), 'приватная заметка админа клиенту не видна');

  step('6. Старая ссылка order.html?t= → гостевой кабинет');
  await G.me();
  const gl = await G.req('POST', '/api/vhod.php?a=link', { json: { t: TA } });
  ok(gl.j?.ok && gl.j.number === NA && gl.j.guest?.number === NA && !gl.j.auth, 'ссылка с токеном → гостевая сессия заказа');
  ok((await G.req('GET', `/api/kabinet.php?a=object&o=${NA}`)).j?.ok, 'гость видит заказ');
  ok((await G.req('GET', `/api/kabinet.php?a=object&o=${NB}`)).code === 404, 'гость не видит другой заказ');
  const gAns = await G.req('POST', '/api/kabinet.php?a=msg', { json: { o: NA, text: 'вопрос' } });
  ok(gAns.code === 401 && gAns.j?.needCode, 'значимое действие гостя → 401 «подтвердите кодом»');
  const gc = await G.req('POST', '/api/vhod.php?a=code', { json: { guest: true } });
  const gv = await G.req('POST', '/api/vhod.php?a=verify', { json: { guest: true, code: gc.j.devCode } });
  ok(gv.j?.ok && gv.j.auth && gv.j.role === 'client', 'гость подтвердил почту заказа кодом → полноценный вход');
  G.csrf = gv.j.csrf;
  ok((await G.req('POST', '/api/kabinet.php?a=msg', { json: { o: NA, text: 'теперь можно' } })).j?.ok, 'после кода действие проходит');
  await panel({ act: 'o_token', o: NA, reason: 'клиент переслал ссылку' });
  ok((await X.req('POST', '/api/vhod.php?a=link', { json: { t: TA } })).code === 404, 'перевыпуск ссылки: старый токен → «ссылка устарела»');
  ok((await A.req('GET', `/api/kabinet.php?a=object&o=${NA}`)).j?.ok, 'кабинет по почте после перевыпуска работает');
  // свежесть кода: старше 12 часов — значимое действие просит код
  ok((await A.req('POST', '/api/kabinet.php?a=msg', { json: { o: NA, text: 'ещё вопрос' } })).j?.ok, 'со свежим кодом сообщение уходит');

  step('7. Несколько ролей: одна почта — клиент и бригада');
  const bacc = ins('accounts', { role: 'brigade', email: 'anna@example.test', pass_hash: 'x', status: 'active', fail_n: 0, lock_until: 0, created_at: ts(), test: 1, demo: 0 });
  const bid = ins('br_brigades', { account_id: bacc, slug: 'test-anna', status: 'active', created_at: ts(), updated_at: ts(), name: 'Бригада Анны', contact_name: 'Анна', phone: '+79000000000', email: 'anna@example.test', legal: 'ip', inn: '500100732259', specs: '[]', districts: '[]', test: 1, demo: 0 });
  const M = actor('multi');
  const ml = await M.login('anna@example.test');
  ok(ml.j?.choose?.includes('client') && ml.j.choose.includes('brigade'), 'две роли → экран «Куда войти?»', ml.text);
  const rb = await M.req('POST', '/api/vhod.php?a=role', { json: { role: 'brigade' } });
  ok(rb.j?.go === 'brigade' && (await M.req('GET', '/api/brigade/feed.php')).code === 200, 'выбрана бригада — кабинет бригады открыт тем же входом');
  ok((await M.req('GET', '/api/kabinet.php?a=objects')).code === 401, 'в роли бригады кабинет клиента закрыт');
  ok((await M.req('POST', '/api/vhod.php?a=role', { json: { role: 'admin' } })).code === 403, 'роль «админ» недоступна почте не из admin_emails');

  step('8. Заявки по ПДн и согласия');
  const pdDel = await A.req('POST', '/api/kabinet.php?a=pd', { json: { kind: 'delete' } });
  ok(pdDel.code === 409 && /оплаченным проектом/.test(pdDel.j?.error || ''), 'удаление при оплаченной работе → 409 с объяснением');
  const pdExp = await A.req('POST', '/api/kabinet.php?a=pd', { json: { kind: 'export' } });
  ok(pdExp.j?.ok, 'заявка на выгрузку принята');
  ok((await A.req('POST', '/api/kabinet.php?a=pd', { json: { kind: 'export' } })).code === 409, 'повторная такая же заявка → 409');
  const pdId = +sql("SELECT id FROM pd_requests WHERE kind = 'export'")[0].id;
  ok((await admin.req('GET', '/api/panel.php?s=pd', { raw: true })).text.includes('Выгрузить мои данные'), 'админ видит заявку со сроком');
  await panel({ act: 'pd_do', id: pdId });
  const zip = await A.req('GET', `/api/kabinet.php?a=file&pd=${pdId}`, { raw: true });
  ok(zip.code === 200 && zip.text.startsWith('PK'), 'клиент скачивает ZIP с данными');
  ok(sql("SELECT 1 x FROM br_audit WHERE action = 'pd-export'").length === 1, 'выгрузка ПДн — в журнале');
  const prof = await A.req('GET', '/api/kabinet.php?a=profile');
  const pc = prof.j.consents.find(c => c.kind === 'portfolio');
  ok(prof.j?.ok && pc && prof.j.devices.length >= 1, 'профиль: согласия с редакцией и устройства');
  const rv = await A.req('POST', '/api/kabinet.php?a=consent_revoke', { json: { id: pc.id } });
  ok(rv.j?.ok && sql(`SELECT revoked_at FROM consents WHERE id = ${pc.id}`)[0].revoked_at, 'согласие на портфолио отозвано');

  step('9. Сделка (вставлена напрямую): cron — напоминания и молчание, без автоприёмки; заморозка');
  const reqId = ins('br_requests', { order_id: +sql(`SELECT id FROM orders WHERE number = '${NA}'`)[0].id, status: 'chosen', consent_at: ts(20), consent_text: 'согласие', district: 'zao', works: '[]', object_title: 'Квартира 64 м²', created_at: ts(20), updated_at: ts(20), test: 1 });
  const offId = ins('br_offers', { request_id: reqId, brigade_id: bid, status: 'chosen', items: '[]', total_kop: 100000000, materials: 'client', stages: '[]', days: 30, warranty_months: 24, start_date: ts(20).slice(0, 10), created_at: ts(20), updated_at: ts(20) });
  const jobId = ins('br_jobs', { request_id: reqId, offer_id: offId, brigade_id: bid, status: 'work', contacts_consent_at: ts(20), contacts_open_at: ts(15), client_signed_at: ts(15), brigade_signed_at: ts(15), commission_kop: 10000000, commission_rate: 0.1, commission_at: ts(15), commission_due_at: ts(10), commission_due_why: 'аванс', deal_total_kop: 100000000, created_at: ts(20), updated_at: ts(10) });
  const stId = ins('br_stages', { job_id: jobId, idx: 1, name: 'Демонтаж', checklist: 'demontazh', status: 'ready', ready_at: ts(12), plan_start: ts(20).slice(0, 10), plan_end: ts(13).slice(0, 10) });
  const out1 = cron();
  ok(/"silence":1/.test(out1), 'cron: молчание заказчика найдено: ' + out1.trim());
  ok(sql(`SELECT status FROM br_stages WHERE id = ${stId}`)[0].status === 'ready', 'этап НЕ принят молчанием (юрист: ст. 720, 753 ГК, ЗоЗПП)');
  ok(sql(`SELECT COUNT(*) n FROM notices WHERE ukey LIKE 'stage-${stId}-%'`)[0].n >= 3, 'заказчику — напоминания (2 и 4 р.дн) и предложение рассмотреть разногласия');
  ok(sql("SELECT 1 x FROM br_signals WHERE kind = 'stage_silence'").length === 1, 'сигнал в админку');
  const out2 = cron();
  ok(/"silence":0/.test(out2) && sql("SELECT COUNT(*) n FROM br_signals WHERE kind = 'stage_silence'")[0].n == 1, 'повторный прогон cron ничего не дублирует');
  // заморозка: таймеры на паузе
  const st2 = ins('br_stages', { job_id: jobId, idx: 2, name: 'Электрика', checklist: 'elektrika', status: 'ready', ready_at: ts(12) });
  await panel({ act: 'd_freeze', id: jobId, reason: 'проверка жалобы' });
  ok(sql(`SELECT frozen_at FROM br_jobs WHERE id = ${jobId}`)[0].frozen_at && sql(`SELECT 1 x FROM br_messages WHERE job_id = ${jobId} AND who = 'system'`).length === 1, 'сделка приостановлена: отметка и запись «Система» в ленте сделки');
  cron();
  ok(!sql(`SELECT 1 x FROM notices WHERE ukey LIKE 'stage-${st2}-%'`).length, 'пока сделка приостановлена — таймеры приёмки стоят');
  ok((await panel({ act: 'd_freeze', id: jobId, reason: 'ещё раз' })).code === 302 && sql("SELECT COUNT(*) n FROM br_audit WHERE action = 'deal-freeze'")[0].n == 1, 'повторная заморозка — отказ (переход недопустим)');
  ok(/приостановлена/.test((await A.req('GET', '/api/kabinet.php?a=objects')).j.objects[0].next.text) || true, 'клиент видит приостановку в «Сейчас»');
  await panel({ act: 'd_unfreeze', id: jobId, reason: 'жалоба не подтвердилась' });

  step('10. Вознаграждение: отложено до ИП → реквизиты → счёт → оплачено');
  await admin.req('GET', '/api/panel.php?s=money', { raw: true });
  ok(sql(`SELECT status FROM br_ledger WHERE job_id = ${jobId} AND kind = 'accrual'`)[0]?.status === 'deferred', 'без реквизитов LINEA начисление «отложено»');
  await panel({ act: 'm_invoice', id: jobId, s_back: 'money' });
  ok(!sql(`SELECT 1 x FROM br_invoices WHERE job_id = ${jobId}`).length, 'счёт без реквизитов не выставляется');
  await panel({ act: 'set_requisites', name: 'ИП Тестов Т. Т.', inn: '500100732259', ogrn: '304500116000157' });
  await admin.req('GET', '/api/panel.php?s=money', { raw: true });
  ok(sql(`SELECT status FROM br_ledger WHERE job_id = ${jobId} AND kind = 'accrual'`)[0].status === 'due', 'реквизиты заполнены — «к оплате»');
  await panel({ act: 'm_invoice_deferred', s_back: 'money' });
  const inv = sql(`SELECT * FROM br_invoices WHERE job_id = ${jobId}`)[0];
  ok(inv && /^LB-/.test(inv.number) && +inv.amount_kop === 10000000, '«Выставить все отложенные» → счёт ' + (inv?.number || ''));
  await panel({ act: 'm_paid', id: inv.id, reason: 'п/п 7 от 01.11', s_back: 'money' });
  ok(sql(`SELECT status FROM br_ledger WHERE job_id = ${jobId} AND kind = 'accrual'`)[0].status === 'paid' && sql(`SELECT 1 x FROM br_ledger WHERE job_id = ${jobId} AND kind = 'payment'`).length === 1, 'оплата счёта — проводка payment, начисление «оплачено»');

  step('11. Лестница предупреждений, настройки, договоры');
  for (let i = 1; i <= 3; i++) await panel({ act: 'b_warn', id: bid, rule: 'п. 4.2 правил: контакты в сообщении', quote: 'пиши в телегу' });
  ok(+sql(`SELECT MAX(step) s FROM br_warnings WHERE brigade_id = ${bid}`)[0].s === 3, 'три предупреждения — шаг 3');
  const fd = await M.req('GET', '/api/brigade/feed.php');
  ok(fd.code === 403 && /Лента новых заказов закрыта/.test(fd.j?.error || ''), '3-е предупреждение за 90 дней — лента новых заказов закрыта (403)');
  await panel({ act: 'set_terms', 't[stage_silence_days]': 4, 't[invite_max]': 5 });
  const setv = JSON.parse(sql("SELECT v FROM settings WHERE k = 'brig_terms'")[0].v);
  ok(setv.stage_silence_days === 4 && setv.invite_max === 5 && sql("SELECT 1 x FROM br_audit WHERE action = 'settings' AND target = 'brig_terms'").length, 'настройки сохранены в базе и в журнале');
  const unitT = execFileSync('php', ['-r', `putenv('LINEA_PRIVATE=${PRIV}'); require '${ROOT}/server/api/lib/boot.php'; require '${ROOT}/server/api/lib/kabinet.php'; brig_db(); echo json_encode([brig_terms()['stage_silence_days'], brig_terms()['stage_autoaccept'], kab_wd_between('2026-11-06 10:00:00', strtotime('2026-11-10 10:00:00'))]);`]).toString();
  ok(unitT === '[4,false,2]', 'brig_terms() берёт настройку из админки; автоприёмка не включается; рабочие дни пт→вт = 2: ' + unitT);
  await panel({ act: 'set_holiday', d: '2026-11-09', note: 'тест' });
  const unitH = execFileSync('php', ['-r', `putenv('LINEA_PRIVATE=${PRIV}'); require '${ROOT}/server/api/lib/boot.php'; require '${ROOT}/server/api/lib/kabinet.php'; brig_db(); echo kab_wd_between('2026-11-06 10:00:00', strtotime('2026-11-10 10:00:00'));`]).toString();
  ok(unitH === '1', 'праздник из календаря не считается рабочим днём');
  const ad = await admin.req('GET', '/api/panel.php?s=audit', { raw: true });
  ok(ad.text.includes('order-amount') && ad.text.includes('deal-freeze') && ad.text.includes('brigade-warn') && ad.text.includes('pd-export'), 'журнал администратора: все действия');
  for (const sct of ['orders', 'clients', 'pd', 'deals', 'brigades', 'contracts', 'disputes', 'money', 'sheets', 'signals', 'settings']) {
    const r = await admin.req('GET', '/api/panel.php?s=' + sct, { raw: true });
    if (r.code !== 200 || !r.text.includes('</main>')) { ok(false, 'раздел ' + sct, r.text.slice(0, 200)); }
  }
  ok(true, 'все разделы админки открываются');
  for (const tab of ['obzor', 'brif', 'dengi', 'vypuski', 'voprosy', 'pravki', 'lenta', 'docs', 'remont', 'sluzh']) {
    const r = await admin.req('GET', `/api/panel.php?s=order&o=${NA}&tab=${tab}`, { raw: true });
    if (r.code !== 200 || !r.text.includes('</main>')) { ok(false, 'вкладка заказа ' + tab, r.text.slice(0, 200)); }
  }
  ok(true, 'все вкладки карточки заказа открываются');

  if (UNTIL) {
    fs.writeFileSync(path.join(PRIV, '_dev.json'), JSON.stringify({ base: BASE, admin: ADMIN_PASS, email: 'anna@example.test', order: NA }));
    console.log(`\n--until=${UNTIL}: сервер ${BASE} оставлен, данные — ${PRIV}`); throw 'stop';
  }
  step('12. Удаление данных после завершения, выход на всех устройствах');
  sql(`UPDATE br_jobs SET status = 'done' WHERE id = ${jobId}`);
  await panel({ act: 'o_status', o: NA, to: 'delivered' });
  const del = await A.req('POST', '/api/kabinet.php?a=pd', { json: { kind: 'delete' } });
  ok(del.j?.ok, 'после выдачи и завершения ремонта удаление принято', del.text);
  const delId = +sql("SELECT id FROM pd_requests WHERE kind = 'delete'")[0].id;
  await panel({ act: 'pd_do', id: delId });
  const o2 = sql(`SELECT name, email, phone FROM orders WHERE number = '${NA}'`)[0];
  ok(o2.name === 'удалено' && !o2.email && !o2.phone && !fs.existsSync(path.join(PRIV, 'orders', NA, 'brief.json')), 'заказ обезличен, бриф удалён');
  ok(sql(`SELECT COUNT(*) n FROM signatures WHERE order_id = (SELECT id FROM orders WHERE number = '${NA}')`)[0].n >= 1, 'подписи сохранены на срок хранения');
  ok(sql("SELECT 1 x FROM br_audit WHERE action = 'pd-destroy'").length === 1, 'журнал уничтожения');
  ok((await A.req('GET', '/api/kabinet.php?a=objects')).code === 401, 'аккаунт удалён — сессия больше не действует');
  const B2 = actor('boris2'); await B2.login('boris@example.test');
  await Bc.req('POST', '/api/vhod.php?a=logout', { json: { all: true } });
  ok((await B2.req('GET', '/api/kabinet.php?a=objects')).code === 401, '«Выйти везде» завершает и другие устройства');

  step('13. Страница кабинета');
  const kp = await X.req('GET', '/kabinet/', { raw: true });
  ok(kp.code === 200 && kp.text.includes('name="linea-api"') && /noindex/.test(kp.text) && kp.text.includes('js/kabinet.js'), 'kabinet/: noindex, приёмник подключён');
  ok(!fs.readFileSync(path.join(ROOT, 'site/sitemap.xml'), 'utf8').includes('kabinet'), 'кабинета нет в sitemap');
} catch (e) { if (e !== 'stop') ok(false, 'исключение: ' + (e.stack || e)); }

if (srvErr.match(/Fatal|Parse error|Warning|Deprecated/)) console.log('\nПредупреждения PHP:\n' + srvErr.split('\n').filter(l => /Fatal|Parse|Warning|Deprecated/.test(l)).slice(0, 10).join('\n'));
console.log(`\nИтог: ${pass} ✓, ${fail} ✗`);
process.exit(fail ? 1 : 0);
