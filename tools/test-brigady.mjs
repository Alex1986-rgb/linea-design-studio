#!/usr/bin/env node
// Сквозная проверка «Ремонт по проекту» на маке: php -S + отдельная папка данных (боевых данных и писем нет).
//   node tools/test-brigady.mjs [--private=<папка>] [--port=8143] [--keep]
// Сценарий: регистрация 3 бригад → допуск 2 → заказ клиента (проект prompt-kv54, pack.json из tools/brigady-pack.mjs) → подбор
// (+ приглашение из каталога) → рассылка → 2 предложения → сравнение → выбор → договор → 2 этапа (возврат с замечанием, приёмка) →
// отзыв → вознаграждение (ставка из brig_terms) → счёт оплачен; «лист по запросу» через API воркера; каталог; восстановление пароля.
// Негативы: бригада без допуска не видит заказы; чужой объект → 403; POST без CSRF → 403; загрузка .php → отказ;
// контакты клиента до выбора не видны; токен воркера неверный → 403.
// Защита от обхода (01.11.2026): контакты сторон закрыты до подтверждения договора обеими сторонами, переписка в ленте сделки,
// фильтр контактов в свободных текстах + сигналы, уникальный ИНН и отказ заблокированной, приёмка только по всем пунктам чек-листа,
// листы по запросу — только в активной сделке, отказ после выбора, вкладка «Сигналы обхода».
// --keep — не останавливать сервер в конце (для браузера), данные остаются в папке.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const PRIV = path.resolve(arg('private') || path.join(os.tmpdir(), 'linea-brigady-test'));
const PORT = +(arg('port') || 8143);
const UNTIL = arg('until');                       // --until=offers — остановиться после двух предложений (для скриншотов)
const KEEP = process.argv.includes('--keep') || !!UNTIL;
const STOP = new Error('stop');
// --mysql=<dsn> — та же проверка на MySQL/MariaDB (база должна быть пустой: тест удаляет её таблицы перед прогоном)
const MYSQL = arg('mysql');
const BASE = `http://127.0.0.1:${PORT}`;
// пакет проекта: --pack=<pack.json> (свежий из tools/brigady-pack.mjs) или фикстура репозитория (prompt-kv54, обезличенная)
const PACK = arg('pack') || path.join(ROOT, 'tools', 'fixtures', 'brigady-pack.json');

let pass = 0, fail = 0;
const ok = (cond, msg, extra = '') => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra ? ' — ' + String(extra).slice(0, 300) : '')); } };
const step = t => console.log('\n' + t);

// ── папка данных и конфиг (пароль админа и токен воркера — случайные на каждый прогон, нигде не печатаются)
fs.rmSync(PRIV, { recursive: true, force: true });
fs.mkdirSync(PRIV, { recursive: true });
const ADMIN_PASS = crypto.randomBytes(12).toString('hex');
const WORKER = crypto.randomBytes(24).toString('hex');
const hash = execFileSync('php', ['-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', ADMIN_PASS]).toString();
fs.writeFileSync(path.join(PRIV, 'config.php'), `<?php return ['mode' => 'manual', 'admin_hash' => '${hash}', 'notify_enabled' => false, 'brig_mail_enabled' => false, 'tg_enabled' => false, 'sheet_worker_token' => '${WORKER}', 'brig_reg_per_hour' => 50, 'briefs_per_hour' => 50${MYSQL ? `, 'db' => ['dsn' => '${MYSQL}', 'user' => '${arg('mysql-user') || process.env.USER}', 'pass' => '']` : ''}];`);
if (MYSQL) {   // чистая база: снести таблицы прошлого прогона
  execFileSync('php', ['-r', `$p = new PDO($argv[1], $argv[2], ''); $p->exec('SET FOREIGN_KEY_CHECKS=0'); foreach ($p->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $t) { $p->exec("DROP TABLE \`$t\`"); }`, MYSQL, arg('mysql-user') || process.env.USER]);
}

// ── файлы для загрузок
const FX = path.join(PRIV, '_fx'); fs.mkdirSync(FX);
execFileSync('php', ['-r', `foreach (['before'=>[180,170,160],'after'=>[235,228,214],'stage'=>[120,140,160]] as $k=>$c){$i=imagecreatetruecolor(900,640);imagefill($i,0,0,imagecolorallocate($i,...$c));imagestring($i,5,40,40,"LINEA test $k",imagecolorallocate($i,20,20,20));imagejpeg($i,"${FX}/$k.jpg",80);}`]);
fs.writeFileSync(path.join(FX, 'shell.php'), '<?php echo "pwned"; ?>');
fs.writeFileSync(path.join(FX, 'fake.jpg'), '<?php system($_GET["c"]); ?>' + 'x'.repeat(500));
fs.writeFileSync(path.join(FX, 'list.pdf'), '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
fs.writeFileSync(path.join(FX, 'audio.webm'), Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84]), Buffer.from('webm'), Buffer.alloc(400)]));
// минимальный xlsx (как ведомости): [Content_Types].xml + workbook
{
  const d = path.join(FX, 'x'); fs.mkdirSync(path.join(d, '_rels'), { recursive: true }); fs.mkdirSync(path.join(d, 'xl'), { recursive: true });
  fs.writeFileSync(path.join(d, '[Content_Types].xml'), '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>');
  fs.writeFileSync(path.join(d, '_rels/.rels'), '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  fs.writeFileSync(path.join(d, 'xl/workbook.xml'), '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>');
  execFileSync('zip', ['-qr', path.join(FX, 'vedomosti.xlsx'), '.'], { cwd: d });
}
// бриф клиента (как отдаёт brief.js): архив + json
const BRIEF = { meta: { test: true, service: 'kvartira' }, client: { name: 'Тест Клиентов', phone: '+7 900 000-00-01', email: 'client@example.test', consent: { personalData: true, edition: '27.10.2026', at: new Date().toISOString() } },
  object: { type: 'квартира', area: 64, address: 'Москва, тестовая ул., 1' } };
fs.writeFileSync(path.join(FX, 'brief.json'), JSON.stringify(BRIEF));
execFileSync('zip', ['-qj', path.join(FX, 'brief.zip'), path.join(FX, 'brief.json')]);

// ── сервер
const srv = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', path.join(ROOT, 'site'), path.join(ROOT, 'tools/dev-router.php')],
  { env: { ...process.env, LINEA_PRIVATE: PRIV, LINEA_MAIL_DRY: '1' }, stdio: ['ignore', 'ignore', KEEP ? fs.openSync(path.join(PRIV, '_server.log'), 'a') : 'pipe'], detached: KEEP });
let srvErr = ''; if (!KEEP) srv.stderr.on('data', d => { srvErr += d; }); else srv.unref();
const stop = () => { if (!KEEP) srv.kill(); };
process.on('exit', stop);
for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/ping.php'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }

// ── HTTP с куками на участника
function actor(name) {
  const jar = new Map();
  const a = { name, csrf: '' };
  a.req = async (method, url, { json, form, headers = {}, raw = false, csrf = true } = {}) => {
    const h = { ...headers };
    if (jar.size) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (csrf && a.csrf && method === 'POST' && !h['X-CSRF']) h['X-CSRF'] = a.csrf;
    let body;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) { body = new FormData(); for (const [k, v] of Object.entries(form)) { if (v && v.file) body.append(k, new Blob([fs.readFileSync(v.file)], { type: v.type || 'application/octet-stream' }), v.name || path.basename(v.file)); else body.append(k, String(v)); } }
    const r = await fetch(BASE + url, { method, headers: h, body, redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const [k, ...v] = kv.split('='); if (/expires=Thu, 01 Jan 1970|Max-Age=0/i.test(c) || v.join('=') === 'deleted') jar.delete(k.trim()); else jar.set(k.trim(), v.join('=')); }
    const text = await r.text();
    let j = null; if (!raw) { try { j = JSON.parse(text); } catch { } }
    return { code: r.status, j, text, headers: r.headers };
  };
  return a;
}

const reg = (n, specs, districts) => ({
  name: `Тест-бригада ${n}`, contactName: `Бригадир ${n}`, phone: `+7 900 000-1${n}-0${n}`, email: `brig${n}@example.test`, password: `Pass${n}word77`,
  legal: 'npd', inn: ['500100732259', '771301001701', '390702484982'][n - 1], specs, districts, teamSize: 4, experience: 8, warrantyMonths: 24, priceFrom: 9000 + n * 1000,
  referees: 'Иван, объект на Мосфильмовской', about: 'Тестовая бригада: черновые и чистовые работы по проекту.', publicName: n === 1,
  consents: { pd: '31.10.2026', rules: '31.10.2026', agency: '31.10.2026' },
});
const ALL = ['demontazh', 'chernovye', 'elektrika', 'santehnika', 'plitka', 'malyarka', 'poly', 'potolki', 'mebel'];
const B = [actor('A'), actor('B'), actor('C')];
const client = actor('client'), admin = actor('admin'), anon = actor('anon');
const adminCsrf = html => (html.match(/name="csrf" value="([0-9a-f]+)"/) || [])[1];
const adminPost = async (fields) => { const p = await admin.req('GET', '/api/admin-brigady.php', { raw: true }); return admin.req('POST', '/api/admin-brigady.php', { form: { csrf: adminCsrf(p.text), ...fields }, raw: true }); };

try {
  step('1. Регистрация 3 бригад, портфолио «до/после», отправка на проверку');
  for (let i = 0; i < 3; i++) {
    const r = await B[i].req('POST', '/api/brigade/auth.php?a=register&test=1', { json: reg(i + 1, i === 1 ? ['elektrika', 'plitka', 'malyarka', 'poly'] : ALL, ['zao', 'cao', 'mo-w']) });
    ok(r.code === 200 && r.j?.ok, `бригада ${B[i].name} зарегистрирована`, r.text);
    B[i].csrf = r.j?.csrf; B[i].id = r.j?.brigade?.id; B[i].slug = r.j?.brigade?.slug;
    for (let k = 0; k < 3; k++) {
      const p = await B[i].req('POST', '/api/brigade/profile.php?a=portfolio_add', { json: { title: `Квартира ${50 + k * 10} м², объект ${k + 1}`, district: 'zao', area: 50 + k * 10, year: 2025, works: 'Черновые и чистовые работы, плитка, электрика' } });
      const pid = p.j?.portfolio?.at(-1)?.id;
      for (const kind of ['before', 'after']) await B[i].req('POST', '/api/brigade/profile.php?a=photo', { form: { portfolio: pid, kind, file: { file: path.join(FX, kind + '.jpg'), type: 'image/jpeg' } } });
    }
    const s = await B[i].req('POST', '/api/brigade/profile.php?a=submit');
    ok(s.j?.brigade?.status === 'review', `анкета ${B[i].name} на проверке`, s.text);
  }
  const bad1 = await B[0].req('POST', '/api/brigade/auth.php?a=register&test=1', { json: { ...reg(1, ALL, ['zao']), email: 'x@example.test', inn: '500100732258' } });
  ok(bad1.code === 400 && /ИНН/.test(bad1.j?.error), 'ИНН с неверной контрольной суммой — отказ');
  const dupInn = await actor('dup').req('POST', '/api/brigade/auth.php?a=register&test=1', { json: { ...reg(1, ALL, ['zao']), email: 'dup@example.test', phone: '+7 900 555-44-33' } });
  ok(dupInn.code === 409 && /ИНН/.test(dupInn.j?.error || ''), 'второй аккаунт на тот же ИНН — отказ 409');
  const ab = await B[0].req('POST', '/api/brigade/profile.php?a=save', { json: { about: 'Тестовая бригада: черновые и чистовые работы по проекту. Пишите на brig@mail.ru или звоните 8 926 111-22-33' } });
  ok(ab.j?.brigade?.about?.startsWith('Тестовая бригада') && !/mail\.ru|111-22-33/.test(ab.text), '«О бригаде»: почта и телефон скрыты фильтром');

  step('2. Негатив: загрузки — только изображения/PDF');
  const pid0 = (await B[0].req('GET', '/api/brigade/profile.php')).j.portfolio[0].id;
  const up1 = await B[0].req('POST', '/api/brigade/profile.php?a=photo', { form: { portfolio: pid0, kind: 'after', file: { file: path.join(FX, 'shell.php'), type: 'image/jpeg' } } });
  ok(up1.code === 415, 'загрузка .php → 415', up1.text);
  const up2 = await B[0].req('POST', '/api/brigade/profile.php?a=photo', { form: { portfolio: pid0, kind: 'after', file: { file: path.join(FX, 'fake.jpg'), type: 'image/jpeg' } } });
  ok(up2.code === 415, 'PHP-код под видом .jpg → 415', up2.text);
  const upNo = await B[0].req('POST', '/api/brigade/profile.php?a=photo', { form: { portfolio: pid0, kind: 'after', file: { file: path.join(FX, 'after.jpg') } } }, );
  ok(upNo.code === 200, 'настоящее фото принято и пережато');
  const st = fs.readdirSync(path.join(PRIV, 'brigady/files'), { recursive: true }).filter(f => /\.php|\.html/.test(f));
  ok(st.length === 0, 'в хранилище нет .php/.html');

  step('3. Негатив: без допуска заказы не видны; CSRF');
  const feed0 = await B[0].req('GET', '/api/brigade/feed.php');
  ok(feed0.code === 403, 'бригада «на проверке» — лента 403', feed0.text);
  const noCsrf = await B[0].req('POST', '/api/brigade/profile.php?a=save', { json: { about: 'x' }, csrf: false });
  ok(noCsrf.code === 403, 'POST кабинета без CSRF → 403', noCsrf.text);

  step('4. Админ: вход, проверка ИНН и видеозвонка, допуск A и B');
  const lg = await admin.req('POST', '/api/admin.php', { form: { password: ADMIN_PASS }, raw: true });
  ok(lg.code === 302, 'вход администратора', lg.code);
  const early = await adminPost({ act: 'b_status', id: B[0].id, to: 'active' });
  ok((await admin.req('GET', `/api/admin-brigady.php?b=${B[0].id}`, { raw: true })).text.includes('Допуск — только после отметок') || early.code === 302, 'допуск без отметок проверки не проходит');
  for (const b of [B[0], B[1]]) {
    await adminPost({ act: 'b_check', id: b.id, inn_ok: 1, call_ok: 1, inn_note: 'npd.nalog.ru: статус НПД подтверждён (тест)' });
    await adminPost({ act: 'b_status', id: b.id, to: 'active' });
  }
  const meA = await B[0].req('GET', '/api/brigade/auth.php?a=me');
  ok(meA.j?.brigade?.status === 'active', 'A допущена');
  ok((await B[2].req('GET', '/api/brigade/auth.php?a=me')).j?.brigade?.status === 'review', 'C остаётся на проверке');
  const noAdmCsrf = await admin.req('POST', '/api/admin-brigady.php', { form: { act: 'b_status', id: B[2].id, to: 'active' }, raw: true });
  ok(noAdmCsrf.code === 403, 'действие админки без CSRF → 403');

  step('5. Заказ клиента (бриф test=1) → оплачен → «Подобрать бригаду»');
  const br = await client.req('POST', '/api/brief.php?test=1', { form: { test: 1, json: JSON.stringify(BRIEF), brief: { file: path.join(FX, 'brief.zip'), type: 'application/zip' } } });
  ok(br.j?.ok && br.j.token, 'бриф принят: ' + (br.j?.number || ''), br.text);
  const T = br.j.token, NUM = br.j.number;
  const p0 = await admin.req('GET', `/api/admin.php?o=${NUM}`, { raw: true });
  await admin.req('POST', '/api/admin.php', { form: { csrf: adminCsrf(p0.text), act: 'amount', number: NUM, rub: 128000, kind: 'kvartira', who: 'тест' }, raw: true });
  await admin.req('POST', '/api/admin.php', { form: { csrf: adminCsrf(p0.text), act: 'paid', number: NUM, who: 'тест' }, raw: true });
  let rs = await client.req('GET', `/api/remont.php?t=${T}`);
  ok(rs.j?.eligible === true, 'оплаченный заказ — подбор доступен');
  client.csrf = rs.j.csrf;
  const noC = await client.req('POST', `/api/remont.php?t=${T}&a=request`, { json: { district: 'zao', consent: true }, csrf: false });
  ok(noC.code === 403, 'POST клиента без CSRF → 403');
  const noConsent = await client.req('POST', `/api/remont.php?t=${T}&a=request`, { json: { district: 'zao' } });
  ok(noConsent.code === 400, 'без согласия на передачу проекта — отказ');
  rs = await client.req('POST', `/api/remont.php?t=${T}&a=request`, { json: { district: 'zao', consent: true, startWish: 'с 15 ноября' } });
  ok(rs.j?.request?.status === 'new', 'запрос создан, ждёт рассылки', rs.text);
  const inv = await client.req('POST', `/api/remont.php?t=${T}&a=invite`, { json: { slug: B[1].slug } });
  ok(inv.j?.request?.invited?.length === 1, 'клиент пригласил бригаду B из каталога', inv.text);
  const invC = await client.req('POST', `/api/remont.php?t=${T}&a=invite`, { json: { slug: B[2].slug } });
  ok(invC.code === 404, 'бригаду без допуска пригласить нельзя');

  step('6. Админ: пакет проекта prompt-kv54 (pack.json + ведомости + листы), автоподбор, рассылка');
  const rid = +((await admin.req('GET', '/api/admin-brigady.php?view=requests', { raw: true })).text.match(/\?r=(\d+)/) || [])[1];
  const pg = await admin.req('GET', `/api/admin-brigady.php?r=${rid}`, { raw: true });
  const packUp = await admin.req('POST', '/api/admin-brigady.php', { raw: true, form: { csrf: adminCsrf(pg.text), act: 'r_pack', id: rid,
    pack: { file: PACK, type: 'application/json', name: 'pack.json' }, f1: { file: path.join(FX, 'vedomosti.xlsx'), name: 'vedomosti.xlsx' }, f2: { file: path.join(FX, 'list.pdf'), type: 'application/pdf', name: 'listy-albom.pdf' } } });
  ok(packUp.code === 302, 'пакет загружен');
  const pg2 = await admin.req('GET', `/api/admin-brigady.php?r=${rid}`, { raw: true });
  ok(/54 позиций|\d+ позиций/.test(pg2.text), 'позиции сметы в запросе: ' + (pg2.text.match(/(\d+) позиций/) || [])[1]);
  ok(!pg2.text.includes(`value="${B[2].id}"`), 'бригада без допуска в автоподбор не попала');
  const dl = new Date(Date.now() + 86400e3 + 3 * 3600e3).toISOString().slice(0, 16);
  const send = await admin.req('POST', '/api/admin-brigady.php', { raw: true, form: { csrf: adminCsrf(pg2.text), act: 'r_send', id: rid, deadline: dl, 'bid[]': B[0].id } });
  // FormData с двумя bid[] — отдельным запросом для B (уже в запросе от клиента)
  await admin.req('POST', '/api/admin-brigady.php', { raw: true, form: { csrf: adminCsrf(pg2.text), act: 'r_send', id: rid, deadline: dl, 'bid[]': B[1].id, [`src[${B[1].id}]`]: 'client' } });
  ok(send.code === 302, 'разослано');

  step('7. Лента бригады: обезличенный пакет; C не видит; контакты клиента до выбора скрыты');
  const fA = await B[0].req('GET', '/api/brigade/feed.php');
  ok(fA.j?.requests?.length === 1, 'A видит запрос в ленте');
  const dA = await B[0].req('GET', `/api/brigade/feed.php?r=${rid}`);
  ok(dA.j?.request?.positions?.length > 10, `пакет: ${dA.j?.request?.positions?.length} позиций, файлов ${dA.j?.request?.files?.length}`);
  const leak = ['Тест Клиентов', '900 000-00-01', 'client@example.test', 'тестовая ул'].filter(s => dA.text.includes(s) || fA.text.includes(s));
  ok(leak.length === 0, 'в ленте и пакете нет ФИО, телефона, почты, адреса клиента', leak.join(', '));
  const fileA = await B[0].req('GET', `/api/brigade/file.php?f=${dA.j.request.files[0].id}`, { raw: true });
  ok(fileA.code === 200, 'файл пакета отдаётся приглашённой бригаде');
  ok((await B[2].req('GET', `/api/brigade/file.php?f=${dA.j.request.files[0].id}`, { raw: true })).code === 403, 'файл пакета чужой бригаде → 403');
  ok((await B[2].req('GET', `/api/brigade/feed.php?r=${rid}`)).code === 403, 'C (без допуска) — запрос 403');
  ok((await anon.req('GET', `/api/brigade/feed.php`)).code === 401, 'без входа — 401');

  step('8. Два предложения по позициям');
  const pos = dA.j.request.positions;
  const priceA = Object.fromEntries(pos.map((p, i) => [p.id, { price: 300 + i * 10 }]));
  const priceB = Object.fromEntries(pos.map((p, i) => [p.id, p.spec === 'santehnika' ? { skip: true } : { price: 280 + i * 12 }]));
  const start = new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10);
  const oA = await B[0].req('POST', '/api/brigade/offer.php?a=save', { json: { r: rid, items: priceA, materials: 'mixed', stages: [{ name: 'Черновая электрика', days: 7 }, { name: 'Финальная приёмка', days: 2 }], startDate: start, warrantyMonths: 24, comment: 'Вывоз мусора включён' } });
  ok(oA.j?.ok, 'предложение A: ' + oA.j?.total + ' ₽', oA.text);
  const oA2 = await B[0].req('POST', '/api/brigade/offer.php?a=save', { json: { r: rid, items: { ...priceA, p1: { price: 999 } }, materials: 'mixed', stages: [{ name: 'Черновая электрика', days: 7 }, { name: 'Финальная приёмка', days: 2 }], startDate: start, warrantyMonths: 24, comment: 'Вывоз мусора включён. Звоните 8 (926) 111-22-33 или в вотсап', materialsNote: 'черновые закупаем сами, прайс на remont-a.ru' } });
  ok(oA2.j?.ok && oA2.j.total !== oA.j.total, 'A поправила предложение до срока');
  const oB = await B[1].req('POST', '/api/brigade/offer.php?a=save', { json: { r: rid, items: priceB, materials: 'client', stages: [{ name: 'Черновая электрика', days: 10 }, { name: 'Плитка', days: 12 }, { name: 'Финальная приёмка', days: 2 }], startDate: start, warrantyMonths: 12 } });
  ok(oB.j?.ok, 'предложение B: ' + oB.j?.total + ' ₽ (сантехнику не делает)', oB.text);
  const hack = await B[0].req('POST', '/api/brigade/offer.php?a=save', { json: { r: rid + 1000, items: priceA } });
  ok(hack.code === 403, 'предложение по чужому запросу → 403');

  if (UNTIL === 'offers') {
    // данные для ручной проверки в браузере (только локальная тестовая папка): токен заказа, пароли тестовых аккаунтов
    fs.writeFileSync(path.join(PRIV, '_dev.json'), JSON.stringify({ order: `${BASE}/order.html?t=${T}`, admin: ADMIN_PASS, brigades: [1, 2, 3].map(n => ({ email: `brig${n}@example.test`, password: `Pass${n}word77` })) }, null, 2));
    throw STOP;
  }
  step('9. Клиент: сравнение и выбор');
  rs = await client.req('GET', `/api/remont.php?t=${T}`);
  ok(rs.j?.offers?.length === 2, 'в сравнении 2 предложения');
  ok(!rs.text.includes('900 000-11-01') && !rs.text.includes('brig1@example.test'), 'контактов бригад до выбора нет');
  const cA = rs.j.offers.find(o => o.brigade.slug === B[0].slug);
  ok(!/111-22-33|вотсап|remont-a\.ru/.test(rs.text) && cA.comment.includes('Вывоз мусора') && cA.comment.includes('[скрыто'), 'телефон, мессенджер и сайт в предложении скрыты фильтром: «' + cA.comment.slice(0, 70) + '»');
  ok(rs.j?.brigTerms?.rate === '7 %' && rs.j.brigTerms.contactsAfter === 'signed', 'условия бригад из одного источника: ' + rs.j?.brigTerms?.rate + ', контакты — ' + rs.j?.brigTerms?.contactsAfter);
  const offA = rs.j.offers.find(o => o.brigade.slug === B[0].slug);
  const noCC = await client.req('POST', `/api/remont.php?t=${T}&a=choose`, { json: { offer: offA.id } });
  ok(noCC.code === 400, 'выбор без согласия на передачу контактов — отказ');
  const jA0 = await B[0].req('GET', '/api/brigade/jobs.php');
  ok(jA0.j?.jobs?.length === 0, 'до выбора у A нет объекта и контактов клиента');
  rs = await client.req('POST', `/api/remont.php?t=${T}&a=choose`, { json: { offer: offA.id, consentContacts: true } });
  ok(rs.j?.job?.status === 'contract', 'выбрана A, объект ждёт договора');
  ok(rs.j?.job?.contactsOpen === false && !rs.text.includes('900 000-11-01') && !rs.text.includes('brig1@example.test') && !rs.text.includes('500100732259'), 'после выбора телефон, почта и ИНН бригады ещё закрыты');

  step('10. Объект: контакты закрыты до подтверждения договора, чужой объект 403, договор, вознаграждение');
  const jl = await B[0].req('GET', '/api/brigade/jobs.php');
  const JID = jl.j.jobs[0].id;
  let jA = await B[0].req('GET', `/api/brigade/jobs.php?j=${JID}`);
  ok(jA.j?.job?.contactsOpen === false && !/Тест Клиентов|900 000-00-01|client@example|тестовая ул/.test(jA.text), 'до подтверждения договора A не видит ФИО, телефон, почту и адрес клиента');
  ok(jA.j?.job?.commission === null, 'вознаграждение до открытия контактов не начислено');
  const dog0 = await B[0].req('GET', `/api/remont-dogovor.php?j=${JID}`, { raw: true });
  ok(dog0.code === 200 && !/Тест Клиентов|900 000-00-01|тестовая ул/.test(dog0.text) && dog0.text.includes('откроется после подтверждения'), 'шаблон договора до подтверждения — без контактов и адреса');
  step('10а. Лента сделки: сообщения сторон, фильтр контактов, сигналы');
  const m1 = await B[0].req('POST', '/api/brigade/jobs.php?a=msg', { json: { j: JID, text: 'Добрый день! Когда удобно показать объект? Мой номер +7 (926) 111-22-33, пишите в телегу @brigada_a' } });
  ok(m1.j?.ok && m1.j.messages.length === 1 && !/111-22-33|@brigada_a|телегу/.test(m1.text) && m1.j.messages[0].masked, 'сообщение бригады: телефон, ник и мессенджер скрыты');
  rs = await client.req('POST', `/api/remont.php?t=${T}&a=msg`, { json: { text: 'Удобно в субботу. Почта client2@mail.ru' } });
  ok(rs.j?.job?.messages?.length === 2 && !rs.text.includes('client2@mail.ru'), 'сообщение клиента: почта скрыта, лента общая');
  ok((await B[1].req('POST', '/api/brigade/jobs.php?a=msg', { json: { j: JID, text: 'привет' } })).code === 403, 'чужая бригада в ленту сделки не пишет → 403');
  const sig = await admin.req('GET', '/api/admin-brigady.php?view=signals', { raw: true });
  ok(sig.code === 200 && sig.text.includes('Сигналы обхода') && (sig.text.match(/контакты в тексте \(скрыты\)/g) || []).length >= 3 && !/111-22-33|client2@mail/.test(sig.text), 'админка: вкладка «Сигналы обхода», срабатывания фильтра без самих контактов');
  const shEarly = await B[0].req('POST', '/api/brigade/sheets.php?a=create', { form: { j: JID, text: 'Нужна развёртка кухни' } });
  ok(shEarly.code === 403 && /внутри сделки/.test(shEarly.j?.error || ''), 'лист по запросу до подтверждения договора — отказ «бесплатно только внутри сделки»');
  ok((await B[1].req('GET', `/api/brigade/jobs.php?j=${JID}`)).code === 403, 'B: чужой объект → 403');
  ok((await B[1].req('POST', '/api/brigade/jobs.php?a=sign', { json: { j: JID } })).code === 403, 'B: подписать чужой договор → 403');
  ok((await B[1].req('GET', `/api/remont-dogovor.php?j=${JID}`, { raw: true })).code === 403, 'B: чужой договор → 403');
  const dog = await client.req('GET', `/api/remont-dogovor.php?t=${T}`, { raw: true });
  ok(dog.code === 200 && dog.text.includes('Договор подряда') && dog.text.includes('Приложение 4'), 'договор подряда с приложениями (HTML → печать в PDF)');
  await B[0].req('POST', '/api/brigade/jobs.php?a=sign', { json: { j: JID } });
  ok((await B[0].req('GET', `/api/brigade/jobs.php?j=${JID}`)).j?.job?.contactsOpen === false, 'подтвердила только бригада — контакты ещё закрыты');
  rs = await client.req('POST', `/api/remont.php?t=${T}&a=sign`, { json: {} });
  ok(rs.j?.job?.status === 'work', 'договор подтверждён обеими сторонами — ремонт идёт');
  ok(rs.j?.job?.contactsOpen && rs.j.job.brigade.phone === '+7 900 000-11-01' && /ИНН 500100732259/.test(rs.j.job.brigade.legalFull), 'клиент видит телефон и ИНН бригады после подтверждения');
  jA = await B[0].req('GET', `/api/brigade/jobs.php?j=${JID}`);
  ok(jA.j?.job?.client?.phone === BRIEF.client.phone && jA.j.job.client.address.includes('тестовая'), 'A видит контакты и адрес клиента после подтверждения договора');
  ok(jA.j?.job?.canCancel === false, 'после открытия контактов отказ без спора невозможен');
  const fin = await B[0].req('GET', '/api/brigade/finance.php');
  ok(Math.abs(fin.j.accrued - Math.round(oA2.j.total * 0.07 * 100) / 100) < 0.02 && fin.j.rate === '7 %', `вознаграждение ${fin.j.rate}: ${fin.j.accrued} ₽ от ${oA2.j.total} ₽ — зафиксировано при открытии контактов`);

  step('11. Этапы: фото, «готов», возврат с замечанием, закрытие, приёмка');
  let stg = (await B[0].req('GET', `/api/brigade/jobs.php?j=${JID}`)).j.job.stages;
  ok(stg.length === 2 && stg[0].checklist.items.length > 2, `этапов ${stg.length}, чек-лист «${stg[0].checklist.title}»`);
  const r0 = await B[0].req('POST', '/api/brigade/jobs.php?a=stage_ready', { json: { stage: stg[0].id } });
  ok(r0.code === 400, 'без фото этап не сдаётся');
  await B[0].req('POST', '/api/brigade/jobs.php?a=stage_photo', { form: { stage: stg[0].id, file: { file: path.join(FX, 'stage.jpg'), type: 'image/jpeg' } } });
  await B[0].req('POST', '/api/brigade/jobs.php?a=stage_ready', { json: { stage: stg[0].id } });
  rs = await client.req('POST', `/api/remont.php?t=${T}&a=stage_return`, { json: { stage: stg[0].id, remarks: 'Нет протокола замера изоляции\nКоробка в кухне не по листу' } });
  ok(rs.j?.job?.stages[0].status === 'returned' && rs.j.job.stages[0].remarks.length === 2, 'клиент вернул этап с 2 замечаниями');
  const r1 = await B[0].req('POST', '/api/brigade/jobs.php?a=stage_ready', { json: { stage: stg[0].id } });
  ok(r1.code === 400, 'с открытыми замечаниями этап не сдаётся');
  stg = (await B[0].req('GET', `/api/brigade/jobs.php?j=${JID}`)).j.job.stages;
  for (const m of stg[0].remarks) await B[0].req('POST', '/api/brigade/jobs.php?a=remark_close', { json: { remark: m.id, note: 'Исправлено, фото приложено' } });
  await B[0].req('POST', '/api/brigade/jobs.php?a=stage_ready', { json: { stage: stg[0].id } });
  const photoId = stg[0].photos[0];
  ok((await client.req('GET', `/api/brigade/file.php?f=${photoId}&t=${T}`, { raw: true })).code === 200, 'клиент видит фото этапа по своему токену');
  ok((await B[1].req('GET', `/api/brigade/file.php?f=${photoId}`, { raw: true })).code === 403, 'чужая бригада фото этапа не видит → 403');
  const part = await client.req('POST', `/api/remont.php?t=${T}&a=stage_accept`, { json: { stage: stg[0].id, checks: [true, true, false, true, true] } });
  ok(part.code === 400 && /4 из 5/.test(part.j?.error || ''), 'приёмка без всех пунктов чек-листа — отказ: ' + (part.j?.error || '').slice(0, 60));
  rs = await client.req('POST', `/api/remont.php?t=${T}&a=stage_accept`, { json: { stage: stg[0].id, checks: [true, true, true, true, true] } });
  ok(rs.j?.job?.stages[0].status === 'accepted' && rs.j.job.stages[1].status === 'work', 'этап 1 принят, этап 2 в работе');
  step('11б. «Лист по запросу» и API воркера');
  const sh = await B[0].req('POST', '/api/brigade/sheets.php?a=create', { form: { j: JID, text: 'Нужна развёртка стены B кухни с выводами под технику', room: 'Кухня-гостиная', wall: 'B', lang: 'ru', audio: { file: path.join(FX, 'audio.webm'), type: 'audio/webm' } } });
  ok(sh.j?.ok, 'бригада попросила лист (текст + запись)', sh.text);
  ok((await B[1].req('GET', `/api/brigade/sheets.php?j=${JID}`)).code === 403, 'чужие листы → 403');
  const W = { Authorization: `Bearer ${WORKER}` };
  ok((await anon.req('GET', '/api/brigade/sheet-request.php?action=next', { headers: { Authorization: 'Bearer bad' } })).code === 403, 'воркер с неверным токеном → 403');
  const onlyVoice = await B[0].req('POST', '/api/brigade/sheets.php?a=create', { form: { j: JID, text: '', audio: { file: path.join(FX, 'audio.webm'), type: 'audio/webm' } } });
  ok(onlyVoice.code === 400 && /Надиктовать/.test(onlyVoice.j?.error), 'голос без текста — понятный отказ «нажмите Надиктовать или напишите»');
  const nx = await anon.req('GET', '/api/brigade/sheet-request.php?action=next&worker=test', { headers: W });
  const task = nx.j;
  ok(nx.code === 200 && task?.project_slug === 'prompt-kv54' && task.wall === 'B' && /^Б-\d+$/.test(task.brigade_id) && /action=audio/.test(task.audio_url || ''), 'воркер получил задание в формате движка: ' + (task ? `${task.id} / ${task.project_slug}` : nx.code));
  ok(!/Тест Клиентов|900 000-00-01|client@example|тестовая ул/.test(nx.text), 'в задании нет ПДн клиента');
  ok((await anon.req('GET', '/api/brigade/sheet-request.php?action=next', { headers: W })).code === 204, 'очередь пуста — 204');
  ok(fs.existsSync(path.join(PRIV, 'sheet-requests', task.id + '.json')), 'зеркало задания в linea-private/sheet-requests/');
  const au = await anon.req('GET', `/api/brigade/sheet-request.php?action=audio&id=${task.id}`, { headers: { 'X-Worker-Token': WORKER }, raw: true });
  ok(au.code === 200, 'воркер забрал запись (запасной заголовок X-Worker-Token)');
  const res = await anon.req('POST', '/api/brigade/sheet-request.php?action=result', { headers: W, form: { id: task.id, status: 'done', note: 'Лист Р-7, масштаб 1:20', meta: JSON.stringify({ sheets: 1 }), pdf: { file: path.join(FX, 'list.pdf'), type: 'application/pdf' } } });
  ok(res.j?.ok, 'воркер вернул PDF (status=done)', res.text);
  const shl = await B[0].req('GET', `/api/brigade/sheets.php?j=${JID}`);
  ok(shl.j?.sheets?.[0]?.status === 'ready' && shl.j.sheets[0].result, 'в кабинете: лист готов');
  ok((await B[0].req('GET', `/api/brigade/file.php?f=${shl.j.sheets[0].result}`, { raw: true })).code === 200, 'бригада скачивает PDF листа');

  step('11в. Этап 2 и завершение');
  await B[0].req('POST', '/api/brigade/jobs.php?a=stage_photo', { form: { stage: stg[1].id, file: { file: path.join(FX, 'after.jpg'), type: 'image/jpeg' } } });
  await B[0].req('POST', '/api/brigade/jobs.php?a=stage_ready', { json: { stage: stg[1].id } });
  rs = await client.req('POST', `/api/remont.php?t=${T}&a=stage_accept`, { json: { stage: stg[1].id, checks: [true, true, true, true] } });
  ok(rs.j?.job?.status === 'done' && rs.j.job.canReview, 'все этапы приняты — объект завершён');
  const shDone = await B[0].req('POST', '/api/brigade/sheets.php?a=create', { form: { j: JID, text: 'Ещё лист после сдачи' } });
  ok(shDone.code === 403, 'объект завершён — листы по запросу закрыты (платный режим вне сделки выключен)');

  step('13. Отзыв, счёт на комиссию, оплата');
  rs = await client.req('POST', `/api/remont.php?t=${T}&a=review`, { json: { rating: 5, text: 'Сделали по проекту, этапы сдавали с фото и протоколами. Бригадир: +7 926 111 22 33' } });
  ok(rs.j?.job?.review?.rating === 5 && !rs.j.job.review.text.includes('111 22 33'), 'отзыв клиента принят, телефон в публичном отзыве скрыт');
  ok((await client.req('POST', `/api/remont.php?t=${T}&a=review`, { json: { rating: 1, text: 'ещё' } })).code === 400, 'второй отзыв по объекту — отказ');
  await adminPost({ act: 'j_invoice', id: JID });
  const money = await admin.req('GET', '/api/admin-brigady.php?view=money', { raw: true });
  const iid = (money.text.match(/name="act" value="i_paid"><input type="hidden" name="id" value="(\d+)"/) || [])[1];
  ok(!!iid, 'счёт на комиссию выставлен');
  await adminPost({ act: 'i_paid', id: iid, note: 'п/п 1 (тест)' });
  const fin2 = await B[0].req('GET', '/api/brigade/finance.php');
  ok(fin2.j?.jobs?.[0]?.invoice?.paid && fin2.j.debt === 0, 'счёт оплачен, долга нет');
  const csv = await admin.req('GET', '/api/admin-brigady.php?csv=money', { raw: true });
  ok(csv.code === 200 && csv.text.includes('Тест-бригада 1'), 'выгрузка CSV комиссии');

  step('14. Каталог и карточка бригады');
  const kat = await anon.req('GET', '/brigady/?test=1', { raw: true });
  ok(kat.code === 200 && kat.text.includes('Тест-бригада 1') && kat.text.includes('Тест-бригада 2') && !kat.text.includes('Тест-бригада 3'), 'каталог: только допущенные');
  const card = await anon.req('GET', `/brigady/${B[0].slug}/`, { raw: true });
  ok(card.code === 200 && card.text.includes('AggregateRating') && card.text.includes('ИНН проверен'), 'карточка: значки и AggregateRating по реальному отзыву');
  ok(!card.text.includes('900 000-11-01') && !card.text.includes('brig1@example.test'), 'на карточке нет телефона и почты');
  const cardB = await anon.req('GET', `/brigady/${B[1].slug}/`, { raw: true });
  ok(!cardB.text.includes('AggregateRating'), 'без отзывов — без AggregateRating');
  ok((await anon.req('GET', `/brigady/${B[2].slug}/`, { raw: true })).code === 404, 'бригада без допуска — 404');

  step('14б. Демо-бригады: сид, плашка, noindex, без schema.org и значков; в подбор и приглашения не попадают; --purge');
  const seed = (...a) => execFileSync('php', [path.join(ROOT, 'server/tools/seed-demo.php'), `--private=${PRIV}`, ...a], { env: { ...process.env, LINEA_PRIVATE: PRIV } }).toString();
  ok(/новых демо-бригад 3/.test(seed()), 'сид: 3 демо-бригады');
  ok(/новых демо-бригад 0/.test(seed()), 'повторный сид ничего не задваивает');
  const kd = await anon.req('GET', '/brigady/', { raw: true });
  const demoSlug = (kd.text.match(/href="\/brigady\/(primer-[a-z0-9-]+)\/"/) || [])[1];
  ok(kd.text.includes('Пример страницы') && kd.text.includes('Вы бригада?') && !!demoSlug, 'каталог без настоящих бригад: образцы с плашкой и «Вы бригада?»');
  ok(!kd.text.includes('application/ld+json') && /noindex/.test(kd.text), 'каталог-образец: noindex, без schema.org');
  const dc = await anon.req('GET', `/brigady/${demoSlug}/`, { raw: true });
  ok(dc.code === 200 && dc.text.includes('Пример карточки') && dc.text.includes('иллюстрация из проекта LINEA') && /noindex/.test(dc.text) && !dc.text.includes('ld+json'), 'демо-карточка: плашка, подписи иллюстраций, noindex, без schema.org');
  ok(dc.text.includes('у примера нет') && !/ИНН проверен<\/td><td>да/.test(dc.text) && !dc.text.includes('k-stars'), 'у демо нет отметок проверки, рейтинга и отзывов');
  ok(!(await anon.req('GET', '/brigady/sitemap.xml', { raw: true })).text.includes('primer-'), 'демо нет в sitemap');
  const T2 = (await client.req('POST', '/api/brief.php?test=1', { form: { test: 1, json: JSON.stringify(BRIEF), brief: { file: path.join(FX, 'brief.zip'), type: 'application/zip' } } })).j.token;
  const NUM2 = (await client.req('GET', `/api/order.php?t=${T2}`)).j.order.number;
  const p2 = await admin.req('GET', `/api/admin.php?o=${NUM2}`, { raw: true });
  await admin.req('POST', '/api/admin.php', { form: { csrf: adminCsrf(p2.text), act: 'amount', number: NUM2, rub: 100000, kind: 'kvartira', who: 'тест' }, raw: true });
  await admin.req('POST', '/api/admin.php', { form: { csrf: adminCsrf(p2.text), act: 'paid', number: NUM2, who: 'тест' }, raw: true });
  const c2 = actor('client2'); c2.csrf = (await c2.req('GET', `/api/remont.php?t=${T2}`)).j.csrf;
  await c2.req('POST', `/api/remont.php?t=${T2}&a=request`, { json: { district: 'cao', consent: true } });
  ok((await c2.req('POST', `/api/remont.php?t=${T2}&a=invite`, { json: { slug: demoSlug } })).code === 404, 'демо-бригаду нельзя пригласить в запрос');
  ok((await anon.req('POST', '/api/brigade/auth.php?a=login', { json: { email: 'demo-otdelka@linea.invalid', password: 'x' } })).code === 401, 'в демо-аккаунт войти нельзя');
  // отказ после выбора: второй заказ → пакет → рассылка A → предложение → выбор → отказ клиента до подтверждения
  {
    const rid2 = +((await admin.req('GET', '/api/admin-brigady.php?view=requests', { raw: true })).text.match(/\?r=(\d+)/) || [])[1];
    const pr2 = await admin.req('GET', `/api/admin-brigady.php?r=${rid2}`, { raw: true });
    await admin.req('POST', '/api/admin-brigady.php', { raw: true, form: { csrf: adminCsrf(pr2.text), act: 'r_pack', id: rid2, pack: { file: PACK, type: 'application/json', name: 'pack.json' } } });
    await admin.req('POST', '/api/admin-brigady.php', { raw: true, form: { csrf: adminCsrf(pr2.text), act: 'r_send', id: rid2, deadline: dl, 'bid[]': B[0].id } });
    const p2pos = (await B[0].req('GET', `/api/brigade/feed.php?r=${rid2}`)).j?.request?.positions || [];
    await B[0].req('POST', '/api/brigade/offer.php?a=save', { json: { r: rid2, items: Object.fromEntries(p2pos.map(p => [p.id, { price: 500 }])), materials: 'client', stages: [{ name: 'Демонтаж', days: 3 }], startDate: start, warrantyMonths: 24 } });
    const st2 = await c2.req('GET', `/api/remont.php?t=${T2}`);
    await c2.req('POST', `/api/remont.php?t=${T2}&a=choose`, { json: { offer: st2.j.offers[0]?.id, consentContacts: true } });
    const cn = await c2.req('POST', `/api/remont.php?t=${T2}&a=job_cancel`, { json: { reason: 'передумали' } });
    ok(cn.j?.ok && !cn.j.job && cn.j.request?.status === 'cancelled', 'клиент отказался от выбранной бригады до подтверждения договора');
    const sg2 = await admin.req('GET', '/api/admin-brigady.php?view=signals', { raw: true });
    ok(sg2.text.includes('отказ после выбора'), 'отказ после выбора — в сигналах обхода');
  }
  ok(/Демо удалено \(файлов: 1\d\)/.test(seed('--purge')), 'сид --purge удаляет демо с файлами');
  ok(!(await anon.req('GET', '/brigady/', { raw: true })).text.includes('primer-'), 'после --purge образцов нет');

  step('15. Восстановление пароля, выход');
  const fg = await anon.req('POST', '/api/brigade/auth.php?a=forgot', { json: { email: 'brig1@example.test' } });
  const tok = (fg.j?.devLink || '').split('#reset=')[1];
  ok(!!tok, 'ссылка восстановления (только тест + localhost)');
  const rr = await anon.req('POST', '/api/brigade/auth.php?a=reset', { json: { token: tok, password: 'NewPass2026x' } });
  ok(rr.j?.ok, 'новый пароль задан');
  ok((await anon.req('POST', '/api/brigade/auth.php?a=reset', { json: { token: tok, password: 'Other2026xx' } })).code === 400, 'повторно ссылка не работает');
  const ln = await anon.req('POST', '/api/brigade/auth.php?a=login', { json: { email: 'brig1@example.test', password: 'NewPass2026x' } });
  ok(ln.j?.ok, 'вход с новым паролем');
  ok((await anon.req('POST', '/api/brigade/auth.php?a=logout', { csrf: false })).code === 403, 'выход без CSRF → 403');
  await adminPost({ act: 'b_status', id: B[2].id, to: 'blocked', reason: 'тест: обход платформы' });
  const rr3 = await actor('re').req('POST', '/api/brigade/auth.php?a=register&test=1', { json: { ...reg(3, ALL, ['zao']), email: 'again@example.test' } });
  ok(rr3.code === 403 && /заблокирована/.test(rr3.j?.error || ''), 'заблокированная бригада заново не регистрируется (тот же ИНН)');
  const rr4 = await actor('re2').req('POST', '/api/brigade/auth.php?a=register&test=1', { json: { ...reg(3, ALL, ['zao']), email: 'again2@example.test', inn: '7707083893', legal: 'ooo' } });
  ok(rr4.code === 403, 'заблокированная бригада не регистрируется на другой ИНН с тем же телефоном');

  step('16. Журналы и письма');
  const mlog = fs.readFileSync(path.join(PRIV, 'brig-mail.log'), 'utf8');
  ok(!/SENT/.test(mlog), 'ни одного отправленного письма (всё DRY)');
  const logs = ['brig-mail.log', 'mail.log', 'orders.log'].map(f => fs.existsSync(path.join(PRIV, f)) ? fs.readFileSync(path.join(PRIV, f), 'utf8') : '').join('\n');
  ok(!logs.includes(tok) && !logs.includes(T) && !logs.includes('NewPass2026x'), 'в журналах нет токенов и паролей');
  const adm = await admin.req('GET', '/api/admin-brigady.php?view=audit&who=admin', { raw: true });
  ok((adm.text.match(/<tr><td class="mut">/g) || []).length >= 6, 'журнал действий администратора ведётся');
} catch (e) { if (e !== STOP) { fail++; console.log('  ✗ исключение: ' + e.stack); } }

console.log(`\nИтог: ${pass} ✓, ${fail} ✗` + (srvErr.match(/PHP (Fatal|Warning|Notice|Deprecated)[^\n]*/g) || []).map(s => '\n  ' + s).join(''));
if (KEEP) console.log(`Сервер оставлен: ${BASE}  (данные ${PRIV})`);
stop();
process.exit(fail ? 1 : 0);
