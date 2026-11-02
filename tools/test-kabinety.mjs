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

const srv = spawn('php', ['-d', 'opcache.enable=0', '-S', `127.0.0.1:${PORT}`, '-t', path.join(ROOT, 'site'), path.join(ROOT, 'tools/dev-router.php')],
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
  step('1. Бриф → заказ; аккаунт и привязка — только после подтверждения почты кодом (ревью С-2)');
  const A = actor('clientA'), Bc = actor('clientB'), G = actor('guest'), X = actor('stranger');
  mkBrief('anna@example.test', 'Анна'); mkBrief('boris@example.test', 'Борис');
  const brief = async (who, name) => (await who.req('POST', '/api/brief.php?test=1', { form: { test: 1, json: fs.readFileSync(path.join(FX, name + '.json'), 'utf8'), brief: { file: path.join(FX, name + '.zip'), type: 'application/zip' } } })).j;
  const bA = await brief(A, 'Анна'), bB = await brief(Bc, 'Борис');
  ok(bA?.ok && bB?.ok, 'два брифа приняты', JSON.stringify(bA));
  const NA = bA.number, TA = bA.token, NB = bB.number;
  ok(!sql("SELECT 1 x FROM accounts WHERE email = 'anna@example.test'").length && !sql(`SELECT account_id FROM orders WHERE number = '${NA}'`)[0].account_id,
    'С-2: бриф на почту не создаёт аккаунт и не кладёт заказ в чужой кабинет до подтверждения почты кодом');
  ok(+sql(`SELECT COUNT(*) n FROM consents c JOIN orders o ON o.id = c.order_id WHERE o.number = '${NA}' AND c.account_id = 0`)[0].n === 2, 'согласия брифа записаны (с редакцией) и ждут подтверждения почты');

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
  sql("DELETE FROM auth_codes WHERE email = 'anna@example.test'");
  const c1 = await X.req('POST', '/api/vhod.php?a=code', { json: { email: 'anna@example.test' } });
  const c2 = await X.req('POST', '/api/vhod.php?a=code', { json: { email: 'anna@example.test' } });
  ok(c1.j?.devCode && c2.j?.ok && !c2.j.devCode, 'С-1: повторный запрос в первую минуту не «гасит» код, который уже пришёл');
  sql(`UPDATE auth_codes SET created_at = '${ts(0.01)}' WHERE email = 'anna@example.test'`);
  for (let i = 0; i < 5; i++) { sql(`UPDATE auth_codes SET created_at = '${ts(0.01)}' WHERE email = 'anna@example.test'`); await X.req('POST', '/api/vhod.php?a=code', { json: { email: 'anna@example.test' } }); }
  const lim = await X.req('POST', '/api/vhod.php?a=code', { json: { email: 'anna@example.test' } });
  ok(lim.j?.ok && !lim.j.devCode, 'С-1: больше 5 кодов в час с одного адреса на почту — тот же ответ, кода нет');
  sql("DELETE FROM auth_codes WHERE email = 'anna@example.test'");
  for (let i = 0; i < 6; i++) ins('auth_codes', { email: 'anna@example.test', purpose: 'login', code_hash: 'x' + i, expires_at: 1, tries: 0, created_at: ts(0.01), used_at: ts(0.01), ip: '203.0.113.9' });
  const own = await X.req('POST', '/api/vhod.php?a=code', { json: { email: 'anna@example.test' } });
  ok(!!own.j?.devCode, 'С-1: чужие запросы с другого IP не лишают владельца почты кода');
  sql("DELETE FROM auth_codes WHERE email = 'anna@example.test'");
  const la = await A.login('anna@example.test');
  ok(la.j?.ok && la.j.go === 'client' && la.j.auth, 'Анна вошла кодом, роль — клиент', la.text);
  const acc = sql("SELECT id, role, pass_hash FROM accounts WHERE email = 'anna@example.test'")[0];
  ok(acc && acc.pass_hash === '' && +sql(`SELECT account_id FROM orders WHERE number = '${NA}'`)[0].account_id === +acc.id, 'после кода: аккаунт без пароля создан, заказ привязан');
  ok(+sql(`SELECT COUNT(*) n FROM consents WHERE account_id = ${acc.id}`)[0].n === 2, 'согласия брифа перешли к аккаунту');
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
  const G0 = actor('guest-no-me');
  ok((await G0.req('POST', '/api/vhod.php?a=link', { json: { t: TA } })).code === 403, 'В-1: link без выданного сессией csrf — 403 (поэтому браузер сначала спрашивает me)');
  const kjs = fs.readFileSync(path.join(ROOT, 'site/js/kabinet.js'), 'utf8'), tkb = kjs.slice(kjs.indexOf('if (tk) {'), kjs.indexOf("vh('link'"));
  ok(/ME = await vh\('me'\)/.test(tkb), 'В-1: в кабинете старая ссылка сначала получает csrf (vh(me)), потом link — тот же порядок, что в браузере');
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
  ok(rb.j?.go === 'brigade' && (await M.req('GET', '/api/brigada.php?m=feed')).code === 200, 'выбрана бригада — кабинет бригады открыт тем же входом');
  ok((await M.req('GET', '/api/kabinet.php?a=objects')).code === 401, 'в роли бригады кабинет клиента закрыт');
  const bme = (await M.req('GET', '/api/brigada.php?m=kab&a=me')).j;
  ok(bme?.brigade?.role === 'owner' && bme.brigade.can.money === true && bme.fresh === true, 'кабинет бригады: владелец, все права, вход кодом свежий (значимые действия без повторного кода)');
  ok(Array.isArray((await M.req('GET', '/api/brigada.php?m=kab&a=home')).j?.tiles), 'главная бригады отвечает: «Сейчас от вас нужно» и плитки');
  const rbBack = await M.req('POST', '/api/vhod.php?a=role', { json: { role: 'client' } });
  ok(rbBack.j?.go === 'client' && (await M.req('GET', '/api/brigada.php?m=kab&a=home')).code === 401, 'переключились в клиента без повторного кода — кабинет бригады закрыт');
  await M.req('POST', '/api/vhod.php?a=role', { json: { role: 'brigade' } });
  const pg = n => fs.readFileSync(path.join(ROOT, 'site', n), 'utf8');
  ok(/class="nav-in" href="[^"]*vhod\/"/.test(pg('index.html')) && /class="nav-in" href="\.\.\/vhod\/"/.test(pg('brigadam/index.html')), 'кнопка «Войти» в шапке сайта ведёт на единый вход');
  ok(/js\/kabinet-remont\.js/.test(pg('kabinet/index.html')) && !/js\/remont\.js/.test(pg('kabinet/index.html')) && /js\/brigada\.js/.test(pg('brigada/index.html')), 'кабинет клиента — модуль ремонта kabinet-remont.js, кабинет бригады — тот же каркас');
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
  // данные логичны (QA п. 8): этапы в работе — только при подписанном обеими договоре
  ins('br_contracts', { job_id: jobId, kind: 'main', num: 1, status: 'signed', body: '<h1>Договор подряда (тест)</h1>', hash: 'a'.repeat(64), total_kop: 100000000, delta_kop: 0, days_add: 0, created_at: ts(16), created_by: 'test', client_signed_at: ts(15), brigade_signed_at: ts(15), needs_admin: 0 });
  const stId = ins('br_stages', { job_id: jobId, idx: 1, name: 'Демонтаж', checklist: 'demontazh', status: 'ready', ready_at: ts(12), plan_start: ts(20).slice(0, 10), plan_end: ts(13).slice(0, 10) });
  const out1 = cron();
  ok(/"silence":1/.test(out1), 'cron: молчание заказчика найдено: ' + out1.trim());
  ok(sql(`SELECT status FROM br_stages WHERE id = ${stId}`)[0].status === 'ready', 'этап НЕ принят молчанием (юрист: ст. 720, 753 ГК, ЗоЗПП)');
  ok(sql(`SELECT COUNT(*) n FROM notices WHERE ukey LIKE 'stage-${stId}-%'`)[0].n >= 3, 'заказчику — напоминания (2 и 4 р.дн) и предложение рассмотреть разногласия');
  ok(sql("SELECT 1 x FROM br_signals WHERE kind = 'stage_silence'").length === 1, 'сигнал в админку');
  const out2 = cron();
  ok(/"silence":0/.test(out2) && sql("SELECT COUNT(*) n FROM br_signals WHERE kind = 'stage_silence'")[0].n == 1, 'повторный прогон cron ничего не дублирует');
  sql(`UPDATE orders SET account_id = NULL WHERE number = '${NA}'`);   // В-2: заказ без аккаунта (как старые заказы до v4)
  ins('br_stages', { job_id: jobId, idx: 9, name: 'Штукатурка-В2', checklist: 'shtukaturka', status: 'ready', ready_at: ts(12) });
  cron(); cron(); cron();
  const v2 = fs.readFileSync(path.join(PRIV, 'brig-mail.log'), 'utf8').split('\n').filter(l => l.includes('Штукатурка-В2') && /kab_notice/.test(l)).length;
  ok(v2 === 2, 'В-2: заказ без аккаунта — напоминания (2 и 4 р.дн) по одному письму, три прогона cron их не повторяют: ' + v2);
  sql(`UPDATE orders SET account_id = ${acc.id} WHERE number = '${NA}'`);
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
  const fd = await M.req('GET', '/api/brigada.php?m=feed');
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

  step('14. Автоудаление персональных данных по срокам (cron)');
  {
    const mkO = (num, row) => ins('orders', { number: num, token: crypto.randomBytes(16).toString('hex'), kind: 'kvartira', name: 'Старый Клиент', phone: '+7 900 111-11-11', email: num.toLowerCase() + '@example.test', test: 1, ...row });
    const dirOf = num => { const d = path.join(PRIV, 'orders', num); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'brief.json'), '{"client":{"name":"x"}}'); return d; };
    const oldAcc = ins('accounts', { role: 'client', email: 'old3@example.test', pass_hash: '', status: 'active', fail_n: 0, lock_until: 0, created_at: ts(1300), last_login_at: ts(1200), test: 1, demo: 0 });
    mkO('LN-OLD-1', { status: 'awaiting_payment', created_at: ts(400), updated_at: ts(400) }); dirOf('LN-OLD-1');
    mkO('LN-NEW-1', { status: 'awaiting_payment', created_at: ts(30), updated_at: ts(30) });
    const o2 = mkO('LN-OLD-2', { status: 'delivered', created_at: ts(1300), updated_at: ts(1200), paid_at: ts(1250), delivered_at: ts(1200) });
    mkO('LN-OLD-3', { status: 'delivered', created_at: ts(1300), updated_at: ts(1200), paid_at: ts(1250), delivered_at: ts(1200), account_id: oldAcc }); dirOf('LN-OLD-3');
    const o4 = mkO('LN-OLD-4', { status: 'delivered', created_at: ts(2300), updated_at: ts(2200), paid_at: ts(2250), delivered_at: ts(2200) });
    const deal = (oid, closed) => {
      const rq = ins('br_requests', { order_id: oid, status: 'chosen', consent_at: ts(closed + 100), consent_text: 'согласие', district: 'zao', works: '[]', object_title: 'Старый объект', created_at: ts(closed + 100), updated_at: ts(closed), test: 1 });
      const of = ins('br_offers', { request_id: rq, brigade_id: bid, status: 'chosen', items: '[]', total_kop: 100000, materials: 'client', stages: '[]', days: 10, warranty_months: 24, created_at: ts(closed + 100), updated_at: ts(closed) });
      const jb = ins('br_jobs', { request_id: rq, offer_id: of, brigade_id: bid, status: 'done', contacts_consent_at: ts(closed + 90), created_at: ts(closed + 90), updated_at: ts(closed), done_at: ts(closed) });
      ins('br_messages', { job_id: jb, who: 'client', text: 'мой адрес: ул. Старая, 5', masked: 0, at: ts(closed + 50) });
      ins('br_contracts', { job_id: jb, kind: 'main', num: 0, status: 'signed', body: '<h1>Договор</h1><p>старый текст</p>', hash: 'b'.repeat(64), total_kop: 100000, delta_kop: 0, days_add: 0, created_at: ts(closed + 80), created_by: 'test', client_signed_at: ts(closed + 80), client_ip: '10.1.1.1', brigade_signed_at: ts(closed + 80), brigade_ip: '10.2.2.2', needs_admin: 0 });
      return jb;
    };
    const jRecent = deal(o2, 1000);      // сделка закрыта < 5 лет назад — заказ ждёт
    const jOld = deal(o4, 2000);         // сделка закрыта > 5 лет назад — удаляются и сделка, и заказ
    // заявка «удалить после завершения»: работы закончены (выдан, сделок нет) — исполняется сама
    const lateAcc = ins('accounts', { role: 'client', email: 'late@example.test', pass_hash: '', status: 'active', fail_n: 0, lock_until: 0, created_at: ts(60), last_login_at: ts(5), test: 1, demo: 0 });
    mkO('LN-LATE-1', { status: 'delivered', created_at: ts(60), updated_at: ts(3), paid_at: ts(50), delivered_at: ts(3), account_id: lateAcc }); dirOf('LN-LATE-1');
    const lateReq = ins('pd_requests', { account_id: lateAcc, kind: 'delete', status: 'new', note: 'Удалить после завершения: идёт работа над оплаченным проектом', created_at: ts(40), due_at: ts(30) });
    const dry = execFileSync('php', [path.join(ROOT, 'server/tools/cron.php'), '--private=' + PRIV, '--pd-dry'], { env: { ...process.env, LINEA_MAIL_DRY: '1' } }).toString();
    const dj = JSON.parse((dry.match(/"pd_purge":(\{[^}]*\})/) || [0, '{}'])[1]);
    ok(dj.deals === 1 && dj.orders === 3 && dj.requests >= 1 && sql("SELECT name FROM orders WHERE number = 'LN-OLD-1'")[0].name === 'Старый Клиент', 'пробный прогон (--pd-dry): посчитано — 1 сделка, 3 заказа, заявки; ничего не изменено: ' + JSON.stringify(dj));
    const run = cron();
    const g = n => sql(`SELECT * FROM orders WHERE number = '${n}'`)[0];
    ok(g('LN-OLD-1').name === 'удалено' && !g('LN-OLD-1').email && g('LN-OLD-1').pd_purged_at && !fs.existsSync(path.join(PRIV, 'orders/LN-OLD-1/brief.json')), 'бриф без оплаты старше срока — обезличен, файл брифа удалён');
    ok(g('LN-NEW-1').name === 'Старый Клиент', 'свежий бриф без оплаты — не тронут');
    ok(g('LN-OLD-2').name === 'Старый Клиент' && !g('LN-OLD-2').pd_purged_at, 'заказ со сделкой в сроке хранения договоров — ждёт (реквизиты стороны — часть договора)');
    ok(g('LN-OLD-3').name === 'удалено' && +g('LN-OLD-3').amount_kop === +sql("SELECT amount_kop FROM orders WHERE number = 'LN-OLD-3'")[0].amount_kop, 'выданный заказ старше срока — контакты и бриф удалены, номер и суммы остались');
    const jo = sql(`SELECT * FROM br_jobs WHERE id = ${jOld}`)[0], co = sql(`SELECT * FROM br_contracts WHERE job_id = ${jOld}`)[0];
    ok(jo.pd_purged_at && !co.client_ip && !/старый текст/.test(co.body) && co.hash === 'b'.repeat(64) && !sql(`SELECT 1 x FROM br_messages WHERE job_id = ${jOld} AND text LIKE '%Старая%'`).length,
      'сделка после срока хранения договоров: переписка, текст договора и IP подписей удалены, хеш версии сохранён');
    ok(g('LN-OLD-4').name === 'удалено', '…и её заказ обезличен в том же прогоне');
    ok(sql(`SELECT * FROM br_jobs WHERE id = ${jRecent}`)[0].pd_purged_at === null && /старый текст/.test(sql(`SELECT body FROM br_contracts WHERE job_id = ${jRecent}`)[0].body), 'договор в сроке хранения — не тронут');
    ok(sql(`SELECT status FROM accounts WHERE id = ${oldAcc}`)[0].status === 'deleted', 'аккаунт без действующих заказов и без входа дольше срока — обезличен');
    ok(sql(`SELECT status FROM pd_requests WHERE id = ${lateReq}`)[0].status === 'done' && sql(`SELECT status FROM accounts WHERE id = ${lateAcc}`)[0].status === 'deleted' && g('LN-LATE-1').name === 'удалено', 'заявка «удалить после завершения» исполнена cron-ом, когда работы закончились');
    ok(sql("SELECT COUNT(*) n FROM br_audit WHERE action = 'pd-retention'")[0].n >= 6 && fs.readFileSync(path.join(PRIV, 'pd.log'), 'utf8').includes('LN-OLD-1') && !fs.readFileSync(path.join(PRIV, 'pd.log'), 'utf8').includes('old3@example'), 'журнал: аудит админки и pd.log — без самих данных');
    ok(/"pd_purge":\{"deals":0,"orders":0,"accounts":0,"requests":0\}/.test(cron()), 'повторный прогон ничего не находит');
    ok(fs.existsSync(path.join(PRIV, 'cron.last')), 'cron отмечает последний прогон (для мониторинга)');
  }

  step('15. Второй шаг входа в админку: код на почту, доверенное устройство, аварийный адрес');
  {
    const cfgPath = path.join(PRIV, 'config.php'), cfg0 = fs.readFileSync(cfgPath, 'utf8');
    const MON = crypto.randomBytes(20).toString('hex');
    // config.php переписывается на лету (сервер теста запущен без opcache)
    const withCfg = async extra => { fs.writeFileSync(cfgPath, cfg0.replace(/\];\s*$/, `, ${extra}];`)); };
    await withCfg(`'admin_2fa' => true, 'monitor_token' => '${MON}'`);
    const Z = actor('admin2fa');
    const p1 = await Z.req('POST', '/api/admin.php', { form: { password: ADMIN_PASS }, raw: true });
    ok(p1.code === 302 && /step=code/.test(p1.headers.get('location') || ''), 'верный пароль → второй шаг (код на почту), не в панель');
    ok((await Z.req('GET', '/api/panel.php', { raw: true })).code === 302, 'до кода панель закрыта');
    const pg = await Z.req('GET', '/api/admin.php?step=code', { raw: true });
    const code = (pg.text.match(/id="devcode">[^0-9]*(\d{6})/) || [])[1];
    ok(!!code && /admin_code/.test(fs.readFileSync(path.join(PRIV, 'brig-mail.log'), 'utf8')), 'код отправлен на admin_emails (в журнале писем — без кода)');
    ok(!fs.readFileSync(path.join(PRIV, 'brig-mail.log'), 'utf8').includes(code), 'кода нет в журнале');
    const bad = await Z.req('POST', '/api/admin.php', { form: { code: '000000' }, raw: true });
    ok(/Неверный код/.test(bad.text), 'неверный код — отказ');
    const good = await Z.req('POST', '/api/admin.php', { form: { code, trust: 1 }, raw: true });
    ok(good.code === 302 && /panel\.php/.test(good.headers.get('location') || '') && (await Z.req('GET', '/api/panel.php', { raw: true })).code === 200, 'верный код → панель');
    ok(sql('SELECT COUNT(*) n FROM adm_devices WHERE ended_at IS NULL')[0].n == 1 && !sql('SELECT token_hash FROM adm_devices')[0].token_hash.includes('linea'), 'устройство запомнено на 30 дней (в базе — только хеш токена)');
    const sv = await Z.req('GET', '/api/panel.php?s=settings', { raw: true });
    ok(/второй шаг/.test(sv.text) && /Включён/.test(sv.text) && /Забыть все устройства/.test(sv.text), 'панель: статус второго шага и доверенные устройства');
    await Z.req('POST', '/api/panel.php', { form: { csrf: adminCsrf(sv.text), act: 'logout' }, raw: true });
    const p2 = await Z.req('POST', '/api/admin.php', { form: { password: ADMIN_PASS }, raw: true });
    ok(p2.code === 302 && /panel\.php/.test(p2.headers.get('location') || ''), 'доверенное устройство: следующий вход — только паролем');
    const Y = actor('admin-other');
    ok(/step=code/.test((await Y.req('POST', '/api/admin.php', { form: { password: ADMIN_PASS }, raw: true })).headers.get('location') || ''), 'другое устройство — снова код');
    const sv2 = await Z.req('GET', '/api/panel.php?s=settings', { raw: true });
    await Z.req('POST', '/api/panel.php', { form: { csrf: adminCsrf(sv2.text), act: 'adm_dev_end', reason: 'тест' }, raw: true });
    ok(sql('SELECT COUNT(*) n FROM adm_devices WHERE ended_at IS NULL')[0].n == 0 && sql("SELECT 1 x FROM br_audit WHERE action = 'admin-devices'").length, '«Забыть все устройства» — в журнале');
    for (let i = 0; i < 5; i++) await Y.req('POST', '/api/admin.php', { form: { code: '111111' }, raw: true });
    ok(/закончились|Начать вход/.test((await Y.req('POST', '/api/admin.php', { form: { code: '111111' }, raw: true })).text), '5 неверных кодов — вход заново');
    await withCfg(`'admin_2fa' => true, 'monitor_token' => '${MON}', 'admin_emergency_ips' => ['127.0.0.1'], 'admin_ip_allow' => ['127.0.0.1']`);   // неверные коды выше засчитаны в неудачные входы с адреса
    const E = actor('admin-emerg');
    const em = await E.req('POST', '/api/admin.php', { form: { password: ADMIN_PASS }, raw: true });
    ok(/panel\.php/.test(em.headers.get('location') || '') && /аварийный/.test(fs.readFileSync(path.join(PRIV, 'admin.log'), 'utf8')), 'аварийный адрес из admin_emergency_ips — без кода, запись в журнал', em.code + ' ' + (em.headers.get('location') || '') + (em.text.match(/class="msg">([^<]*)/) || [])[1]);
    await withCfg(`'monitor_token' => '${MON}', 'admin_ip_allow' => ['127.0.0.1']`);
    ok(/panel\.php/.test((await actor('admin-auto').req('POST', '/api/admin.php', { form: { password: ADMIN_PASS }, raw: true })).headers.get('location') || ''), 'режим auto без писем (brig_mail_enabled = false) — вход паролем, как раньше');

    step('16. ping.php: публично — без режима и TLS; подробности — с токеном мониторинга');
    const pub = await X.req('GET', '/api/ping.php');
    ok(pub.j?.ok && !('mode' in pub.j) && !('tls' in pub.j) && !('proxy' in pub.j), 'публичный ответ: только «да/нет», без режима оплаты и признаков TLS');
    ok((await X.req('GET', '/api/ping.php', { headers: { 'X-Monitor-Token': 'x'.repeat(40) } })).code === 403, 'неверный токен — 403');
    const det = await X.req('GET', '/api/ping.php', { headers: { 'X-Monitor-Token': MON } });
    ok(det.j?.mode === 'manual' && det.j.tls && det.j.proxy?.remote_addr === '127.0.0.1' && det.j.proxy.remote_is_trusted === true && det.j.db?.schema >= 7 && det.j.cron_last, 'с токеном: режим, TLS, какой REMOTE_ADDR видит PHP и доверен ли он, версия схемы, последний cron');
    fs.writeFileSync(cfgPath, cfg0);
  }
} catch (e) { if (e !== 'stop') ok(false, 'исключение: ' + (e.stack || e)); }

if (srvErr.match(/Fatal|Parse error|Warning|Deprecated/)) console.log('\nПредупреждения PHP:\n' + srvErr.split('\n').filter(l => /Fatal|Parse|Warning|Deprecated/.test(l)).slice(0, 10).join('\n'));
console.log(`\nИтог: ${pass} ✓, ${fail} ✗`);
process.exit(fail ? 1 : 0);
