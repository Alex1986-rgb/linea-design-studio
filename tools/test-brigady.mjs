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
const UNTIL = arg('until');                       // --until=offers — после двух предложений; --until=shots — после кабинета бригады (tools/shots-brigada.mjs)
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
fs.writeFileSync(path.join(PRIV, 'config.php'), `<?php return ['mode' => 'manual', 'admin_hash' => '${hash}', 'notify_enabled' => false, 'brig_mail_enabled' => false, 'tg_enabled' => false, 'sheet_worker_token' => '${WORKER}', 'brig_reg_per_hour' => 50, 'briefs_per_hour' => 50, 'requisites' => ['name' => 'ИП Тестов Т. Т.', 'inn' => '500100732259'], 'brig_terms' => ['npd' => ['allowed' => true, 'no_fee' => false, 'max_deal_kop' => 240000000, 'big_object_m2' => 120]]${MYSQL ? `, 'db' => ['dsn' => '${MYSQL}', 'user' => '${arg('mysql-user') || process.env.USER}', 'pass' => '']` : ''}];`);
if (MYSQL) {   // чистая база: снести таблицы прошлого прогона
  execFileSync('php', ['-r', `$p = new PDO($argv[1], $argv[2], ''); $p->exec('SET FOREIGN_KEY_CHECKS=0'); foreach ($p->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $t) { $p->exec("DROP TABLE \`$t\`"); }`, MYSQL, arg('mysql-user') || process.env.USER]);
}

// ── прямой запрос к базе теста (сдвиг дат для правил «к оплате», проверка мягкой отмены): только тестовая папка/база
const DSN = MYSQL || 'sqlite:' + path.join(PRIV, 'linea.sqlite');
const sql = q => JSON.parse(execFileSync('php', ['-r', '$p = new PDO($argv[1], $argv[2], ""); $p->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $s = $p->query($argv[3]); echo json_encode($s && $s->columnCount() ? $s->fetchAll(PDO::FETCH_ASSOC) : []);', DSN, MYSQL ? (arg('mysql-user') || process.env.USER) : '', q]).toString() || '[]');
const ago = days => new Date(Date.now() - days * 86400e3 + 3 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');   // МСК, как linea_now()

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
  consents: { pd: '31.10.2026', rules: '02.11.2026', agency: '02.11.2026' },
});
const ALL = ['demontazh', 'chernovye', 'elektrika', 'santehnika', 'plitka', 'malyarka', 'poly', 'potolki', 'mebel'];
const B = [actor('A'), actor('B'), actor('C')];
const client = actor('client'), admin = actor('admin'), anon = actor('anon');
const adminCsrf = html => (html.match(/name="csrf" value="([0-9a-f]+)"/) || [])[1];
// вход клиента кодом на почту (кабинет): devCode отдаётся только локальному серверу с LINEA_MAIL_DRY
const loginCode = async (who, email = BRIEF.client.email) => {
  const keep = who.csrf;
  who.csrf = (await who.req('GET', '/api/vhod.php?a=me')).j.csrf;
  const cd = await who.req('POST', '/api/vhod.php?a=code', { json: { email } });
  const vf = await who.req('POST', '/api/vhod.php?a=verify', { json: { email, code: cd.j?.devCode } });
  who.csrf = keep;
  return vf;
};
// фото этапа: «готов к приёмке» — не меньше 3 фото, у скрытых работ — с привязкой к пунктам чек-листа; kind=before — фото «до» перед стартом
const stagePhotos = async (who, sid, n = 3, kind = '') => { for (let k = 0; k < n; k++) await who.req('POST', '/api/brigada.php?m=jobs&a=stage_photo', { form: { stage: sid, ...(kind ? { kind } : { item: k }), file: { file: path.join(FX, k % 2 ? 'after.jpg' : 'stage.jpg'), type: 'image/jpeg' } } }); };
const adminPost = async (fields) => { const p = await admin.req('GET', '/api/admin-brigady.php', { raw: true }); return admin.req('POST', '/api/admin-brigady.php', { form: { csrf: adminCsrf(p.text), ...fields }, raw: true }); };

try {
  step('1. Регистрация 3 бригад, портфолио «до/после», отправка на проверку');
  for (let i = 0; i < 3; i++) {
    const r = await B[i].req('POST', '/api/brigada.php?m=auth&a=register&test=1', { json: reg(i + 1, i === 1 ? ['elektrika', 'plitka', 'malyarka', 'poly'] : ALL, ['zao', 'cao', 'mo-w']) });
    ok(r.code === 200 && r.j?.ok, `бригада ${B[i].name} зарегистрирована`, r.text);
    B[i].csrf = r.j?.csrf; B[i].id = r.j?.brigade?.id; B[i].slug = r.j?.brigade?.slug;
    for (let k = 0; k < 3; k++) {
      const p = await B[i].req('POST', '/api/brigada.php?m=profile&a=portfolio_add', { json: { title: `Квартира ${50 + k * 10} м², объект ${k + 1}`, district: 'zao', area: 50 + k * 10, year: 2025, works: 'Черновые и чистовые работы, плитка, электрика' } });
      const pid = p.j?.portfolio?.at(-1)?.id;
      for (const kind of ['before', 'after']) await B[i].req('POST', '/api/brigada.php?m=profile&a=photo', { form: { portfolio: pid, kind, file: { file: path.join(FX, kind + '.jpg'), type: 'image/jpeg' } } });
    }
    await loginCode(B[i], `brig${i + 1}@example.test`);   // значимые действия бригады — после входа кодом (спецификация 4.0)
    B[i].csrf = (await B[i].req('GET', '/api/brigada.php?m=kab&a=me')).j?.csrf;
    const s = await B[i].req('POST', '/api/brigada.php?m=profile&a=submit');
    ok(s.j?.brigade?.status === 'review', `анкета ${B[i].name} на проверке`, s.text);
  }
  const bad1 = await B[0].req('POST', '/api/brigada.php?m=auth&a=register&test=1', { json: { ...reg(1, ALL, ['zao']), email: 'x@example.test', inn: '500100732258' } });
  ok(bad1.code === 400 && /ИНН/.test(bad1.j?.error), 'ИНН с неверной контрольной суммой — отказ');
  const dupInn = await actor('dup').req('POST', '/api/brigada.php?m=auth&a=register&test=1', { json: { ...reg(1, ALL, ['zao']), email: 'dup@example.test', phone: '+7 900 555-44-33' } });
  ok(dupInn.code === 409 && /ИНН/.test(dupInn.j?.error || ''), 'второй аккаунт на тот же ИНН — отказ 409');
  const ab = await B[0].req('POST', '/api/brigada.php?m=profile&a=save', { json: { about: 'Тестовая бригада: черновые и чистовые работы по проекту. Пишите на brig@mail.ru или звоните 8 926 111-22-33' } });
  ok(ab.j?.brigade?.about?.startsWith('Тестовая бригада') && !/mail\.ru|111-22-33/.test(ab.text), '«О бригаде»: почта и телефон скрыты фильтром');

  step('2. Негатив: загрузки — только изображения/PDF');
  const pid0 = (await B[0].req('GET', '/api/brigada.php?m=profile')).j.portfolio[0].id;
  const up1 = await B[0].req('POST', '/api/brigada.php?m=profile&a=photo', { form: { portfolio: pid0, kind: 'after', file: { file: path.join(FX, 'shell.php'), type: 'image/jpeg' } } });
  ok(up1.code === 415, 'загрузка .php → 415', up1.text);
  const up2 = await B[0].req('POST', '/api/brigada.php?m=profile&a=photo', { form: { portfolio: pid0, kind: 'after', file: { file: path.join(FX, 'fake.jpg'), type: 'image/jpeg' } } });
  ok(up2.code === 415, 'PHP-код под видом .jpg → 415', up2.text);
  const upNo = await B[0].req('POST', '/api/brigada.php?m=profile&a=photo', { form: { portfolio: pid0, kind: 'after', file: { file: path.join(FX, 'after.jpg') } } }, );
  ok(upNo.code === 200, 'настоящее фото принято и пережато');
  const st = fs.readdirSync(path.join(PRIV, 'brigady/files'), { recursive: true }).filter(f => /\.php|\.html/.test(f));
  ok(st.length === 0, 'в хранилище нет .php/.html');

  step('3. Негатив: без допуска заказы не видны; CSRF');
  const feed0 = await B[0].req('GET', '/api/brigada.php?m=feed');
  ok(feed0.code === 403, 'бригада «на проверке» — лента 403', feed0.text);
  const noCsrf = await B[0].req('POST', '/api/brigada.php?m=profile&a=save', { json: { about: 'x' }, csrf: false });
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
  const meA = await B[0].req('GET', '/api/brigada.php?m=auth&a=me');
  ok(meA.j?.brigade?.status === 'active', 'A допущена');
  ok((await B[2].req('GET', '/api/brigada.php?m=auth&a=me')).j?.brigade?.status === 'review', 'C остаётся на проверке');
  const noAdmCsrf = await admin.req('POST', '/api/admin-brigady.php', { form: { act: 'b_status', id: B[2].id, to: 'active' }, raw: true });
  ok(noAdmCsrf.code === 403, 'действие админки без CSRF → 403');

  step('5. Заказ клиента (бриф test=1) → оплачен → «Подобрать бригаду»');
  const noArea = await client.req('POST', '/api/brief.php?test=1', { form: { test: 1, json: JSON.stringify({ ...BRIEF, object: { type: 'квартира' } }), brief: { file: path.join(FX, 'brief.zip'), type: 'application/zip' } } });
  ok(noArea.code === 400 && /площадь/i.test(noArea.j?.error || ''), 'бриф без площади — отказ (сумма должна быть видна сразу)');
  const br = await client.req('POST', '/api/brief.php?test=1', { form: { test: 1, json: JSON.stringify(BRIEF), brief: { file: path.join(FX, 'brief.zip'), type: 'application/zip' } } });
  ok(br.j?.ok && br.j.token, 'бриф принят: ' + (br.j?.number || ''), br.text);
  const T = br.j.token, NUM = br.j.number;
  const p0 = await admin.req('GET', `/api/admin.php?o=${NUM}`, { raw: true });
  await admin.req('POST', '/api/admin.php', { form: { csrf: adminCsrf(p0.text), act: 'amount', number: NUM, rub: 128000, kind: 'kvartira', who: 'тест' }, raw: true });
  await admin.req('POST', '/api/admin.php', { form: { csrf: adminCsrf(p0.text), act: 'paid', number: NUM, who: 'тест' }, raw: true });
  let rs = await client.req('GET', `/api/remont.php?t=${T}`);
  ok(rs.j?.eligible === false, 'оплачен, но альбом не выдан — подбор закрыт (choose_after = final)');
  await admin.req('POST', '/api/admin.php', { form: { csrf: adminCsrf(p0.text), act: 'delivered', number: NUM, url: 'https://example.test/album', who: 'тест' }, raw: true });
  rs = await client.req('GET', `/api/remont.php?t=${T}`);
  ok(rs.j?.eligible === true, 'финальный альбом выдан — подбор доступен');
  // значимые действия по ссылке с токеном — только после входа кодом на почту заказа (кабинет, спецификация 3.0)
  const noFresh = await client.req('POST', `/api/remont.php?t=${T}&a=request`, { json: { district: 'zao', consent: true }, headers: { 'X-CSRF': rs.j.csrf } });
  ok(noFresh.code === 401 && noFresh.j?.needCode, 'без входа кодом «Подобрать бригаду» → 401 needCode', noFresh.text);
  {
    const me = await client.req('GET', '/api/vhod.php?a=me'); client.csrf = me.j.csrf;
    const cd = await client.req('POST', '/api/vhod.php?a=code', { json: { email: BRIEF.client.email } });
    const vf = await client.req('POST', '/api/vhod.php?a=verify', { json: { email: BRIEF.client.email, code: cd.j?.devCode } });
    ok(vf.j?.ok && vf.j.go === 'client', 'клиент вошёл кодом на почту заказа', vf.text);
  }
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
  const fA = await B[0].req('GET', '/api/brigada.php?m=feed');
  ok(fA.j?.requests?.length === 1, 'A видит запрос в ленте');
  const dA = await B[0].req('GET', `/api/brigada.php?m=feed&r=${rid}`);
  ok(dA.j?.request?.positions?.length > 10, `пакет: ${dA.j?.request?.positions?.length} позиций, файлов ${dA.j?.request?.files?.length}`);
  const leak = ['Тест Клиентов', '900 000-00-01', 'client@example.test', 'тестовая ул'].filter(s => dA.text.includes(s) || fA.text.includes(s));
  ok(leak.length === 0, 'в ленте и пакете нет ФИО, телефона, почты, адреса клиента', leak.join(', '));
  const fileA = await B[0].req('GET', `/api/brigade/file.php?f=${dA.j.request.files[0].id}`, { raw: true });
  ok(fileA.code === 200, 'файл пакета отдаётся приглашённой бригаде');
  ok((await B[2].req('GET', `/api/brigade/file.php?f=${dA.j.request.files[0].id}`, { raw: true })).code === 403, 'файл пакета чужой бригаде → 403');
  ok((await B[2].req('GET', `/api/brigada.php?m=feed&r=${rid}`)).code === 403, 'C (без допуска) — запрос 403');
  ok((await anon.req('GET', `/api/brigada.php?m=feed`)).code === 401, 'без входа — 401');

  step('8. Два предложения по позициям');
  const pos = dA.j.request.positions;
  const priceA = Object.fromEntries(pos.map((p, i) => [p.id, { price: 300 + i * 10 }]));
  const priceB = Object.fromEntries(pos.map((p, i) => [p.id, p.spec === 'santehnika' ? { skip: true } : { price: 280 + i * 12 }]));
  const start = new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10);
  const oA = await B[0].req('POST', '/api/brigada.php?m=offer&a=save', { json: { r: rid, items: priceA, materials: 'mixed', stages: [{ name: 'Черновая электрика', days: 7 }, { name: 'Финальная приёмка', days: 2 }], startDate: start, warrantyMonths: 24, comment: 'Вывоз мусора включён' } });
  ok(oA.j?.ok, 'предложение A: ' + oA.j?.total + ' ₽', oA.text);
  const oA2 = await B[0].req('POST', '/api/brigada.php?m=offer&a=save', { json: { r: rid, items: { ...priceA, p1: { price: 999 } }, materials: 'mixed', stages: [{ name: 'Черновая электрика', days: 7 }, { name: 'Финальная приёмка', days: 2 }], startDate: start, warrantyMonths: 24, comment: 'Вывоз мусора включён. Звоните 8 (926) 111-22-33 или в вотсап', materialsNote: 'черновые закупаем сами, прайс на remont-a.ru' } });
  ok(oA2.j?.ok && oA2.j.total !== oA.j.total, 'A поправила предложение до срока');
  const oB = await B[1].req('POST', '/api/brigada.php?m=offer&a=save', { json: { r: rid, items: priceB, materials: 'client', stages: [{ name: 'Черновая электрика', days: 10 }, { name: 'Плитка', days: 12 }, { name: 'Финальная приёмка', days: 2 }], startDate: start, warrantyMonths: 12 } });
  ok(oB.j?.ok, 'предложение B: ' + oB.j?.total + ' ₽ (сантехнику не делает)', oB.text);
  const hack = await B[0].req('POST', '/api/brigada.php?m=offer&a=save', { json: { r: rid + 1000, items: priceA } });
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
  ok(rs.j?.brigTerms?.rate === '10 %' && rs.j.brigTerms.contactsAfter === 'signed' && /5 %/.test(rs.j.brigTerms.pilot || ''), 'условия бригад из одного источника: ' + rs.j?.brigTerms?.rate + ', контакты — ' + rs.j?.brigTerms?.contactsAfter);
  const offA = rs.j.offers.find(o => o.brigade.slug === B[0].slug);
  const noCC = await client.req('POST', `/api/remont.php?t=${T}&a=choose`, { json: { offer: offA.id } });
  ok(noCC.code === 400, 'выбор без согласия на передачу контактов — отказ');
  const jA0 = await B[0].req('GET', '/api/brigada.php?m=jobs');
  ok(jA0.j?.jobs?.length === 0, 'до выбора у A нет объекта и контактов клиента');
  rs = await client.req('POST', `/api/remont.php?t=${T}&a=choose`, { json: { offer: offA.id, consentContacts: true } });
  ok(rs.j?.job?.status === 'contract', 'выбрана A, объект ждёт договора');
  ok(rs.j?.job?.contactsOpen === false && !rs.text.includes('900 000-11-01') && !rs.text.includes('brig1@example.test'), 'после выбора телефон и почта бригады ещё закрыты');
  ok(/ИНН 500100732259/.test(rs.j?.job?.brigade?.legalFull || '') && /Тест-бригада 1/.test(rs.j.job.brigade.legalFull), 'реквизиты бригады (наименование, форма, ИНН) заказчик видит ДО договора (ст. 9 ЗоЗПП, юрист п. 4)');

  step('10. Объект: контакты закрыты до подтверждения договора, чужой объект 403, договор, вознаграждение');
  const jl = await B[0].req('GET', '/api/brigada.php?m=jobs');
  const JID = jl.j.jobs[0].id;
  let jA = await B[0].req('GET', `/api/brigada.php?m=jobs&j=${JID}`);
  ok(jA.j?.job?.contactsOpen === false && !/Тест Клиентов|900 000-00-01|client@example|тестовая ул/.test(jA.text), 'до подтверждения договора A не видит ФИО, телефон, почту и адрес клиента');
  ok(jA.j?.job?.commission === null, 'вознаграждение до открытия контактов не начислено');
  const dog0 = await B[0].req('GET', `/api/remont-dogovor.php?j=${JID}`, { raw: true });
  ok(dog0.code === 200 && !/Тест Клиентов|900 000-00-01|тестовая ул/.test(dog0.text) && dog0.text.includes('откроются здесь, когда договор подпишут'), 'шаблон договора до подтверждения — без контактов и адреса');
  step('10а. Лента сделки: сообщения сторон, фильтр контактов, сигналы');
  const m1 = await B[0].req('POST', '/api/brigada.php?m=jobs&a=msg', { json: { j: JID, text: 'Добрый день! Когда удобно показать объект? Мой номер +7 (926) 111-22-33, пишите в телегу @brigada_a' } });
  ok(m1.j?.ok && m1.j.messages.length === 1 && !/111-22-33|@brigada_a|телегу/.test(m1.text) && m1.j.messages[0].masked, 'сообщение бригады: телефон, ник и мессенджер скрыты');
  rs = await client.req('POST', `/api/remont.php?t=${T}&a=msg`, { json: { text: 'Удобно в субботу. Почта client2@mail.ru' } });
  ok(rs.j?.job?.messages?.length === 2 && !rs.text.includes('client2@mail.ru'), 'сообщение клиента: почта скрыта, лента общая');
  ok((await B[1].req('POST', '/api/brigada.php?m=jobs&a=msg', { json: { j: JID, text: 'привет' } })).code === 403, 'чужая бригада в ленту сделки не пишет → 403');
  const sig = await admin.req('GET', '/api/admin-brigady.php?view=signals', { raw: true });
  ok(sig.code === 200 && sig.text.includes('Сигналы обхода') && (sig.text.match(/контакты в тексте \(скрыты\)/g) || []).length >= 3 && !/111-22-33|client2@mail/.test(sig.text), 'админка: вкладка «Сигналы обхода», срабатывания фильтра без самих контактов');
  const shEarly = await B[0].req('POST', '/api/brigada.php?m=sheets&a=create', { form: { j: JID, text: 'Нужна развёртка кухни' } });
  ok(shEarly.code === 403 && /внутри сделки/.test(shEarly.j?.error || ''), 'лист по запросу до подтверждения договора — отказ «бесплатно только внутри сделки»');
  ok((await B[1].req('GET', `/api/brigada.php?m=jobs&j=${JID}`)).code === 403, 'B: чужой объект → 403');
  ok((await B[1].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: JID } })).code === 403, 'B: подписать чужой договор → 403');
  ok((await B[1].req('GET', `/api/remont-dogovor.php?j=${JID}`, { raw: true })).code === 403, 'B: чужой договор → 403');
  const dog = await client.req('GET', `/api/remont-dogovor.php?t=${T}`, { raw: true });
  ok(dog.code === 200 && dog.text.includes('Договор подряда') && dog.text.includes('Приложение 4'), 'договор подряда с приложениями (HTML → печать в PDF)');
  step('10б. Договор на сайте: одна версия для обеих сторон, подпись кодом (ПЭП), хеш, затем контакты');
  const docsC = rs.j?.job?.docs || (await client.req('GET', `/api/remont.php?t=${T}`)).j.job.docs;
  const docsB = jA.j?.job?.docs;
  ok(docsC?.contracts?.length === 1 && docsC.contracts[0].hash === docsB?.contracts?.[0]?.hash && /^[0-9a-f]{64}$/.test(docsC.contracts[0].hash), 'заказчик и бригада видят одну версию договора (SHA-256 ' + (docsC?.contracts?.[0]?.hash || '').slice(0, 12) + '…)');
  ok(dog.text.includes(docsC.contracts[0].hash), 'хеш версии напечатан в договоре');
  ok(/транспарент|только на сайте/.test(docsC.transparency) && docsC.pep?.ed, 'стороны предупреждены: без подписанного на сайте договора — ни контактов, ни этапов, ни листов, ни гарантии');
  const sb1 = await B[0].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: JID } });
  ok(sb1.j?.codeSent && /^\d{6}$/.test(sb1.j.devCode || ''), 'бригаде отправлен код подписи на почту (в тесте — код в ответе)');
  ok((await B[0].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: JID, doc: sb1.j.doc, code: '000000', pep: true } })).code === 400, 'неверный код — отказ');
  ok((await B[0].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: JID, doc: sb1.j.doc, code: sb1.j.devCode } })).code === 400, 'без согласия на ПЭП — отказ');
  ok((await B[0].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: JID, doc: sb1.j.doc, code: sb1.j.devCode, pep: true } })).j?.ok, 'бригада подписала договор кодом');
  ok((await B[0].req('GET', `/api/brigada.php?m=jobs&j=${JID}`)).j?.job?.contactsOpen === false, 'подписала только бригада — контакты ещё закрыты');
  const sc1 = await client.req('POST', `/api/remont.php?t=${T}&a=sign`, { json: {} });
  ok(sc1.j?.codeSent && /^\d{6}$/.test(sc1.j.devCode || ''), 'заказчику отправлен код подписи');
  rs = await client.req('POST', `/api/remont.php?t=${T}&a=sign`, { json: { doc: sc1.j.doc, code: sc1.j.devCode, pep: true } });
  ok(rs.j?.job?.status === 'work' && rs.j.job.docs.contracts[0].status === 'signed', 'договор подписан обеими сторонами на сайте — ремонт идёт');
  ok(rs.j.job.docs.log.some(l => /Заказчик подписал/.test(l.text)) && rs.j.job.docs.log.some(l => /Подрядчик подписал/.test(l.text)), 'журнал сделки: кто и когда подписал — виден заказчику');
  ok(rs.j?.job?.contactsOpen && rs.j.job.brigade.phone === '+7 900 000-11-01' && /ИНН 500100732259/.test(rs.j.job.brigade.legalFull), 'клиент видит телефон и ИНН бригады после подтверждения');
  jA = await B[0].req('GET', `/api/brigada.php?m=jobs&j=${JID}`);
  ok(jA.j?.job?.client?.phone === BRIEF.client.phone && jA.j.job.client.address.includes('тестовая'), 'A видит контакты и адрес клиента после подтверждения договора');
  ok(jA.j?.job?.canCancel === false, 'после открытия контактов отказ без спора невозможен');
  const fin = await B[0].req('GET', '/api/brigada.php?m=finance');
  ok(Math.abs(fin.j.accrued - Math.round(oA2.j.total * 0.05 * 100) / 100) < 0.02 && fin.j.jobs[0].rate === '5 %', `пилот: первой допущенной бригаде — ${fin.j.jobs[0].rate} (основная ставка ${rs.j.brigTerms.rate}): ${fin.j.accrued} ₽ от ${oA2.j.total} ₽ — начислено при подписании`);
  ok(fin.j.due === 0 && fin.j.debt === 0, 'к оплате пока 0: вознаграждение — только после первых денег бригаде (аванс или первый этап)');
  ok((await adminPost({ act: 'j_invoice', id: JID })).code === 302 && !(await admin.req('GET', '/api/admin-brigady.php?view=money', { raw: true })).text.includes('LB-'), 'счёт до первых денег не выставляется');

  step('10в. Допсоглашение через сайт: подпись обеих сторон, пересчёт суммы сделки и вознаграждения');
  const ad = await B[0].req('POST', '/api/brigada.php?m=jobs&a=addendum', { json: { j: JID, items: [{ name: 'Дополнительные розетки в кухне', unit: 'шт', qty: 4, price: 1500 }], daysAdd: 2, note: 'по просьбе заказчика' } });
  ok(ad.j?.ok && ad.j.doc, 'бригада предложила допсоглашение (+4 розетки, +2 дня)');
  ok((await client.req('POST', `/api/remont.php?t=${T}&a=addendum`, { json: { items: [{ name: 'x', qty: 1, price: 1 }] } })).code === 400, 'второе неподписанное допсоглашение — отказ');
  const sa1 = await B[0].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: JID, doc: ad.j.doc } });
  await B[0].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: JID, doc: ad.j.doc, code: sa1.j.devCode, pep: true } });
  const sa2 = await client.req('POST', `/api/remont.php?t=${T}&a=sign`, { json: { doc: ad.j.doc } });
  rs = await client.req('POST', `/api/remont.php?t=${T}&a=sign`, { json: { doc: ad.j.doc, code: sa2.j.devCode, pep: true } });
  const add1 = rs.j?.job?.docs?.contracts?.find(c => c.kind === 'addendum');
  ok(add1?.status === 'signed' && Math.abs(rs.j.job.docs.dealTotal - (oA2.j.total + 6000)) < 0.01, `допсоглашение подписано: сумма сделки ${rs.j?.job?.docs?.dealTotal} ₽ (+6 000 ₽)`);
  const finAd = await B[0].req('GET', '/api/brigada.php?m=finance');
  ok(Math.abs(finAd.j.accrued - Math.round((oA2.j.total + 6000) * 0.05 * 100) / 100) < 0.02, 'база вознаграждения пересчитана по допсоглашению: ' + finAd.j.accrued + ' ₽');
  const dogAd = await B[0].req('GET', `/api/remont-dogovor.php?j=${JID}`, { raw: true });
  ok(dogAd.text.includes('Дополнительное соглашение № 1') && dogAd.text.includes(add1.hash) && dogAd.text.includes('тестовая ул'), 'в документах сделки — договор, допсоглашение с хешем и реквизиты сторон после подписания');
  ok((await B[0].req('POST', '/api/brigada.php?m=jobs&a=advance_dispute', { json: { j: JID, reason: 'не было' } })).code === 400, 'оспорить нечего, пока заказчик не отметил аванс — 400');
  rs = await client.req('POST', `/api/remont.php?t=${T}&a=advance`, { json: {} });
  const finDecl = await B[0].req('GET', '/api/brigada.php?m=finance');
  ok(rs.j?.job?.advanceAt && rs.j.job.advanceState === 'declared' && finDecl.j.due === 0, 'В-2: отметка заказчика «аванс внесён» — только заявление, к оплате не становится, пока бригада не подтвердит');
  ok((await client.req('POST', `/api/remont.php?t=${T}&a=advance`, { json: {} })).code === 400, 'повторная отметка аванса — отказ');
  ok((await B[0].req('POST', '/api/brigada.php?m=jobs&a=advance', { json: { j: JID } })).j?.ok, 'бригада подтвердила получение аванса');
  const finAdv = await B[0].req('GET', '/api/brigada.php?m=finance');
  ok(finAdv.j.due > 0 && Math.abs(finAdv.j.due - finAdv.j.accrued) < 0.01 && /аванс/.test(finAdv.j.jobs[0].dueWhy || ''), 'К-1: аванс подтверждён бригадой — вознаграждение к оплате (' + (finAdv.j.jobs?.[0]?.dueWhy || '') + ')');

  step('11. Этапы: фото, «готов», возврат с замечанием, закрытие, приёмка');
  let stg = (await B[0].req('GET', `/api/brigada.php?m=jobs&j=${JID}`)).j.job.stages;
  ok(stg.length === 2 && stg[0].checklist.items.length > 2, `этапов ${stg.length}, чек-лист «${stg[0].checklist.title}»`);
  const r0 = await B[0].req('POST', '/api/brigada.php?m=jobs&a=stage_ready', { json: { stage: stg[0].id } });
  ok(r0.code === 400, 'без фото этап не сдаётся');
  await B[0].req('POST', '/api/brigada.php?m=jobs&a=stage_photo', { form: { stage: stg[0].id, file: { file: path.join(FX, 'stage.jpg'), type: 'image/jpeg' } } });
  const r0b = await B[0].req('POST', '/api/brigada.php?m=jobs&a=stage_ready', { json: { stage: stg[0].id } });
  ok(r0b.code === 400 && /не меньше 3/.test(r0b.j?.error || ''), 'с одним фото этап не сдаётся — нужно не меньше 3', r0b.text);
  await stagePhotos(B[0], stg[0].id, 2);
  const r0c = await B[0].req('POST', '/api/brigada.php?m=jobs&a=stage_ready', { json: { stage: stg[0].id } });
  ok(r0c.j?.ok, 'этап с 3 фото (скрытые работы — с фото к пунктам чек-листа) сдан на приёмку', r0c.text);
  rs = await client.req('POST', `/api/remont.php?t=${T}&a=stage_return`, { json: { stage: stg[0].id, remarks: 'Нет протокола замера изоляции\nКоробка в кухне не по листу' } });
  ok(rs.j?.job?.stages[0].status === 'returned' && rs.j.job.stages[0].remarks.length === 2, 'клиент вернул этап с 2 замечаниями');
  const r1 = await B[0].req('POST', '/api/brigada.php?m=jobs&a=stage_ready', { json: { stage: stg[0].id } });
  ok(r1.code === 400, 'с открытыми замечаниями этап не сдаётся');
  stg = (await B[0].req('GET', `/api/brigada.php?m=jobs&j=${JID}`)).j.job.stages;
  for (const m of stg[0].remarks) await B[0].req('POST', '/api/brigada.php?m=jobs&a=remark_close', { json: { remark: m.id, note: 'Исправлено, фото приложено' } });
  await B[0].req('POST', '/api/brigada.php?m=jobs&a=stage_ready', { json: { stage: stg[0].id } });
  const photoId = stg[0].photos[0];
  ok((await client.req('GET', `/api/brigade/file.php?f=${photoId}&t=${T}`, { raw: true })).code === 200, 'клиент видит фото этапа по своему токену');
  ok((await B[1].req('GET', `/api/brigade/file.php?f=${photoId}`, { raw: true })).code === 403, 'чужая бригада фото этапа не видит → 403');
  const part = await client.req('POST', `/api/remont.php?t=${T}&a=stage_accept`, { json: { stage: stg[0].id, checks: [true, true, false, true, true] } });
  ok(part.code === 400 && /4 из 5/.test(part.j?.error || ''), 'приёмка без всех пунктов чек-листа — отказ: ' + (part.j?.error || '').slice(0, 60));
  rs = await client.req('POST', `/api/remont.php?t=${T}&a=stage_accept`, { json: { stage: stg[0].id, checks: [true, true, true, true, true] } });
  ok(rs.j?.job?.stages[0].status === 'accepted' && rs.j.job.stages[1].status === 'work', 'этап 1 принят, этап 2 в работе');
  step('11б. «Лист по запросу» и API воркера');
  const sh = await B[0].req('POST', '/api/brigada.php?m=sheets&a=create', { form: { j: JID, text: 'Нужна развёртка стены B кухни с выводами под технику', room: 'Кухня-гостиная', wall: 'B', lang: 'ru', audio: { file: path.join(FX, 'audio.webm'), type: 'audio/webm' } } });
  ok(sh.j?.ok, 'бригада попросила лист (текст + запись)', sh.text);
  ok((await B[1].req('GET', `/api/brigada.php?m=sheets&j=${JID}`)).code === 403, 'чужие листы → 403');
  const W = { Authorization: `Bearer ${WORKER}` };
  ok((await anon.req('GET', '/api/brigade/sheet-request.php?action=next', { headers: { Authorization: 'Bearer bad' } })).code === 403, 'воркер с неверным токеном → 403');
  const onlyVoice = await B[0].req('POST', '/api/brigada.php?m=sheets&a=create', { form: { j: JID, text: '', audio: { file: path.join(FX, 'audio.webm'), type: 'audio/webm' } } });
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
  const shl = await B[0].req('GET', `/api/brigada.php?m=sheets&j=${JID}`);
  ok(shl.j?.sheets?.[0]?.status === 'ready' && shl.j.sheets[0].result, 'в кабинете: лист готов');
  ok((await B[0].req('GET', `/api/brigade/file.php?f=${shl.j.sheets[0].result}`, { raw: true })).code === 200, 'бригада скачивает PDF листа');

  step('11в. Этап 2 и завершение');
  await stagePhotos(B[0], stg[1].id, 3);
  await B[0].req('POST', '/api/brigada.php?m=jobs&a=stage_ready', { json: { stage: stg[1].id } });
  rs = await client.req('POST', `/api/remont.php?t=${T}&a=stage_accept`, { json: { stage: stg[1].id, checks: [true, true, true, true] } });
  ok(rs.j?.job?.status === 'done' && rs.j.job.canReview, 'все этапы приняты — объект завершён');
  const shDone = await B[0].req('POST', '/api/brigada.php?m=sheets&a=create', { form: { j: JID, text: 'Ещё лист после сдачи' } });
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
  const fin2 = await B[0].req('GET', '/api/brigada.php?m=finance');
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
  await admin.req('POST', '/api/admin.php', { form: { csrf: adminCsrf(p2.text), act: 'delivered', number: NUM2, url: 'https://example.test/a', who: 'тест' }, raw: true });
  const c2 = actor('client2'); c2.csrf = (await c2.req('GET', `/api/remont.php?t=${T2}`)).j.csrf;
  await loginCode(c2);
  await c2.req('POST', `/api/remont.php?t=${T2}&a=request`, { json: { district: 'cao', consent: true } });
  ok((await c2.req('POST', `/api/remont.php?t=${T2}&a=invite`, { json: { slug: demoSlug } })).code === 404, 'демо-бригаду нельзя пригласить в запрос');
  ok((await anon.req('POST', '/api/brigada.php?m=auth&a=login', { json: { email: 'demo-otdelka@linea.invalid', password: 'x' } })).code === 401, 'в демо-аккаунт войти нельзя');
  // отказ после выбора: второй заказ → пакет → рассылка A → предложение → выбор → отказ клиента до подтверждения
  {
    const rid2 = +((await admin.req('GET', '/api/admin-brigady.php?view=requests', { raw: true })).text.match(/\?r=(\d+)/) || [])[1];
    const pr2 = await admin.req('GET', `/api/admin-brigady.php?r=${rid2}`, { raw: true });
    await admin.req('POST', '/api/admin-brigady.php', { raw: true, form: { csrf: adminCsrf(pr2.text), act: 'r_pack', id: rid2, pack: { file: PACK, type: 'application/json', name: 'pack.json' } } });
    await admin.req('POST', '/api/admin-brigady.php', { raw: true, form: { csrf: adminCsrf(pr2.text), act: 'r_send', id: rid2, deadline: dl, 'bid[]': B[0].id } });
    const p2pos = (await B[0].req('GET', `/api/brigada.php?m=feed&r=${rid2}`)).j?.request?.positions || [];
    await B[0].req('POST', '/api/brigada.php?m=offer&a=save', { json: { r: rid2, items: Object.fromEntries(p2pos.map(p => [p.id, { price: 500 }])), materials: 'client', stages: [{ name: 'Демонтаж', days: 3 }], startDate: start, warrantyMonths: 24 } });
    const st2 = await c2.req('GET', `/api/remont.php?t=${T2}`);
    await c2.req('POST', `/api/remont.php?t=${T2}&a=choose`, { json: { offer: st2.j.offers[0]?.id, consentContacts: true } });
    await c2.req('POST', `/api/remont.php?t=${T2}&a=msg`, { json: { text: 'Добрый день, когда сможете начать?' } });
    const cn = await c2.req('POST', `/api/remont.php?t=${T2}&a=job_cancel`, { json: { reason: 'передумали' } });
    ok(cn.j?.ok && !cn.j.job && cn.j.request?.status === 'cancelled', 'клиент отказался от выбранной бригады до подтверждения договора');
    const cj = sql(`SELECT j.id, j.status, j.cancel_by, (SELECT COUNT(*) FROM br_messages m WHERE m.job_id = j.id AND m.who <> 'system') msgs, (SELECT COUNT(*) FROM br_contracts c WHERE c.job_id = j.id) docs FROM br_jobs j JOIN br_requests r ON r.id = j.request_id JOIN orders o ON o.id = r.order_id WHERE o.token = '${T2}'`)[0] || {};
    ok(cj.status === 'cancelled' && cj.cancel_by === 'client' && +cj.msgs === 1 && +cj.docs >= 1, 'С-3: отмена мягкая — сделка помечена отменённой, переписка и версия договора сохранены для админки');
    const sg2 = await admin.req('GET', '/api/admin-brigady.php?view=signals', { raw: true });
    ok(sg2.text.includes('отказ после выбора'), 'отказ после выбора — в сигналах обхода');
  }
  ok(/Демо удалено \(файлов: 1\d\)/.test(seed('--purge')), 'сид --purge удаляет демо с файлами');
  ok(!(await anon.req('GET', '/brigady/', { raw: true })).text.includes('primer-'), 'после --purge образцов нет');

  step('15. Восстановление пароля, выход');
  const fg = await anon.req('POST', '/api/brigada.php?m=auth&a=forgot', { json: { email: 'brig1@example.test' } });
  const tok = (fg.j?.devLink || '').split('#reset=')[1];
  ok(!!tok, 'ссылка восстановления (только тест + localhost)');
  const rr = await anon.req('POST', '/api/brigada.php?m=auth&a=reset', { json: { token: tok, password: 'NewPass2026x' } });
  ok(rr.j?.ok, 'новый пароль задан');
  ok((await anon.req('POST', '/api/brigada.php?m=auth&a=reset', { json: { token: tok, password: 'Other2026xx' } })).code === 400, 'повторно ссылка не работает');
  const ln = await anon.req('POST', '/api/brigada.php?m=auth&a=login', { json: { email: 'brig1@example.test', password: 'NewPass2026x' } });
  ok(ln.j?.ok, 'вход с новым паролем');
  ok((await anon.req('POST', '/api/brigada.php?m=auth&a=logout', { csrf: false })).code === 403, 'выход без CSRF → 403');
  await adminPost({ act: 'b_status', id: B[2].id, to: 'blocked', reason: 'тест: обход платформы' });
  const rr3 = await actor('re').req('POST', '/api/brigada.php?m=auth&a=register&test=1', { json: { ...reg(3, ALL, ['zao']), email: 'again@example.test' } });
  ok(rr3.code === 403 && /заблокирована/.test(rr3.j?.error || ''), 'заблокированная бригада заново не регистрируется (тот же ИНН)');
  const rr4 = await actor('re2').req('POST', '/api/brigada.php?m=auth&a=register&test=1', { json: { ...reg(3, ALL, ['zao']), email: 'again2@example.test', inn: '7707083893', legal: 'ooo' } });
  ok(rr4.code === 403, 'заблокированная бригада не регистрируется на другой ИНН с тем же телефоном');

  step('15б. Ревью кода сделки: «к оплате» без кликов клиента, аванс, долг, допсоглашения, подпись, вебхук, договор, CSV');
  {
    const T3 = (await client.req('POST', '/api/brief.php?test=1', { form: { test: 1, json: JSON.stringify(BRIEF), brief: { file: path.join(FX, 'brief.zip'), type: 'application/zip' } } })).j.token;
    const N3 = (await client.req('GET', `/api/order.php?t=${T3}`)).j.order.number;
    const p3 = await admin.req('GET', `/api/admin.php?o=${N3}`, { raw: true });
    await admin.req('POST', '/api/admin.php', { form: { csrf: adminCsrf(p3.text), act: 'amount', number: N3, rub: 90000, kind: 'kvartira', who: 'тест' }, raw: true });
    await admin.req('POST', '/api/admin.php', { form: { csrf: adminCsrf(p3.text), act: 'paid', number: N3, who: 'тест' }, raw: true });
    await admin.req('POST', '/api/admin.php', { form: { csrf: adminCsrf(p3.text), act: 'delivered', number: N3, url: 'https://example.test/a', who: 'тест' }, raw: true });
    const c3 = actor('client3'); c3.csrf = (await c3.req('GET', `/api/remont.php?t=${T3}`)).j.csrf;
    await loginCode(c3);
    await c3.req('POST', `/api/remont.php?t=${T3}&a=request`, { json: { district: 'zao', consent: true } });
    const rid3 = +sql(`SELECT r.id FROM br_requests r JOIN orders o ON o.id = r.order_id WHERE o.token = '${T3}'`)[0].id;
    const pr3 = await admin.req('GET', `/api/admin-brigady.php?r=${rid3}`, { raw: true });
    await admin.req('POST', '/api/admin-brigady.php', { raw: true, form: { csrf: adminCsrf(pr3.text), act: 'r_pack', id: rid3, pack: { file: PACK, type: 'application/json', name: 'pack.json' } } });
    await admin.req('POST', '/api/admin-brigady.php', { raw: true, form: { csrf: adminCsrf(pr3.text), act: 'r_send', id: rid3, deadline: dl, 'bid[]': B[1].id } });
    const p3pos = (await B[1].req('GET', `/api/brigada.php?m=feed&r=${rid3}`)).j?.request?.positions || [];
    const start3 = new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10);
    await B[1].req('POST', '/api/brigada.php?m=offer&a=save', { json: { r: rid3, items: Object.fromEntries(p3pos.map(p => [p.id, { price: 400 }])), materials: 'client', stages: [{ name: 'Демонтаж', days: 3 }, { name: 'Финальная приёмка', days: 2 }], startDate: start3, warrantyMonths: 24 } });
    const st3 = await c3.req('GET', `/api/remont.php?t=${T3}`);
    await c3.req('POST', `/api/remont.php?t=${T3}&a=choose`, { json: { offer: st3.j.offers[0]?.id, consentContacts: true } });
    const J3 = +sql(`SELECT id FROM br_jobs WHERE request_id = ${rid3} AND status <> 'cancelled'`)[0].id;
    // К-2: номер по частям в трёх сообщениях
    for (const t of ['8 900', '123']) await B[1].req('POST', '/api/brigada.php?m=jobs&a=msg', { json: { j: J3, text: t } });
    const m3 = await B[1].req('POST', '/api/brigada.php?m=jobs&a=msg', { json: { j: J3, text: '45 67' } });
    ok(m3.j?.messages?.at(-1)?.masked && !/45 67/.test(m3.j.messages.at(-1).text), 'К-2: телефон по частям в трёх сообщениях — третья часть скрыта, сигнал в админку');
    const m4 = await B[1].req('POST', '/api/brigada.php?m=jobs&a=msg', { json: { j: J3, text: 'Мой номер 8 900 123 45 67.' } });
    ok(!/123 45 67/.test(m4.j?.messages?.at(-1)?.text || 'x'), 'К-2: телефон с точкой в конце фразы скрыт');
    const m5 = await B[1].req('POST', '/api/brigada.php?m=jobs&a=msg', { json: { j: J3, text: 'пиши в тeлегрaм, восемь девятьсот сто двадцать три сорок пять шестьдесят семь' } });
    ok(m5.j?.messages?.at(-1)?.masked && !/телегр|девятьсот/.test(m5.j.messages.at(-1).text), 'К-2: двойники и цифры прописью — сообщение скрыто целиком');
    // С-1: попытки кода — атомарно, не больше 5; код привязан к версии
    const sb = await B[1].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: J3 } });
    const wrong = await Promise.all([1, 2, 3, 4, 5, 6, 7].map(i => B[1].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: J3, doc: sb.j.doc, code: '00000' + i, pep: true } })));
    ok(wrong.filter(r => r.code === 400).length === 5 && wrong.filter(r => r.code === 429).length === 2, 'С-1: 7 неверных кодов подряд — 5 попыток засчитаны, дальше 429');
    ok((await B[1].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: J3, doc: sb.j.doc, code: sb.j.devCode, pep: true } })).code === 429, 'С-1: после 5 неверных и верный код не проходит — нужен новый');
    const sb2 = await B[1].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: J3 } });
    const twice = await Promise.all([0, 1].map(() => B[1].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: J3, doc: sb2.j.doc, code: sb2.j.devCode, pep: true } })));
    ok(twice.filter(r => r.j?.ok).length === 1, 'С-1: один код — одна подпись (второй запрос с тем же кодом отклонён)');
    const sc = await c3.req('POST', `/api/remont.php?t=${T3}&a=sign`, { json: {} });
    let r3 = await c3.req('POST', `/api/remont.php?t=${T3}&a=sign`, { json: { doc: sc.j.doc, code: sc.j.devCode, pep: true } });
    ok(r3.j?.job?.status === 'work', 'договор второй сделки подписан обеими сторонами');
    const pil = sql(`SELECT id, pilot_slot, pilot_used FROM br_brigades WHERE id IN (${B[0].id}, ${B[1].id}) ORDER BY id`);
    ok(+pil[0].pilot_slot === 1 && +pil[1].pilot_slot === 2 && +pil[0].pilot_used === 1 && +pil[1].pilot_used === 1, 'С-5: место в пилоте фиксируется при допуске, пилотные сделки считаются атомарным счётчиком');
    // К-1: к оплате без кликов заказчика
    const due = async () => (await B[1].req('GET', '/api/brigada.php?m=finance')).j.jobs.find(x => x.job === J3);
    ok(!(await due()).dueAt, 'К-1: сразу после подписания (начало работ через 7 дней) — ещё не к оплате');
    sql(`UPDATE br_jobs SET contacts_open_at = '${ago(15)}' WHERE id = ${J3}`);
    let d3 = await due();
    ok(d3.dueAt && /после подписания/.test(d3.dueWhy), 'К-1: прошло 14 дней после подписания, ни аванса, ни этапа — вознаграждение к оплате само: ' + d3.dueWhy);
    sql(`UPDATE br_jobs SET contacts_open_at = '${ago(1)}', commission_due_at = NULL, commission_due_why = NULL WHERE id = ${J3}`);
    sql(`UPDATE br_stages SET plan_start = '${ago(2).slice(0, 10)}' WHERE job_id = ${J3} AND idx = 1`);
    d3 = await due();
    ok(d3.dueAt && /начала работ по договору/.test(d3.dueWhy), 'К-1: наступила дата начала работ по договору — к оплате: ' + d3.dueWhy);
    sql(`UPDATE br_jobs SET commission_due_at = NULL, commission_due_why = NULL WHERE id = ${J3}`);
    sql(`UPDATE br_stages SET plan_start = '${start3}' WHERE job_id = ${J3} AND idx = 1`);
    const stg3 = (await B[1].req('GET', `/api/brigada.php?m=jobs&j=${J3}`)).j.job.stages;
    const st0 = await B[1].req('POST', '/api/brigada.php?m=jobs&a=stage_start', { json: { stage: stg3[0].id } });
    ok(st0.code === 400 && /фото «до»/.test(st0.j?.error || ''), '«Начать работу» по этапу 1 без фото «до» — отказ', st0.text);
    await stagePhotos(B[1], stg3[0].id, 3, 'before');
    ok((await B[1].req('POST', '/api/brigada.php?m=jobs&a=stage_start', { json: { stage: stg3[0].id } })).j?.ok, 'бригада нажала «Начать работу» по этапу 1 (3 фото «до»)');
    d3 = await due();
    ok(d3.dueAt && /начала работу/.test(d3.dueWhy), 'К-1: «Начать работу» по этапу 1 — к оплате: ' + d3.dueWhy);
    ok((await B[1].req('POST', '/api/brigada.php?m=jobs&a=stage_start', { json: { stage: stg3[0].id } })).code === 400, 'повторный старт этапа — отказ');
    // В-2: заказчик отметил аванс — бригада оспорила — админ исправил с причиной
    sql(`UPDATE br_jobs SET commission_due_at = NULL, commission_due_why = NULL WHERE id = ${J3}`);
    sql(`UPDATE br_stages SET started_at = NULL WHERE job_id = ${J3}`);
    await c3.req('POST', `/api/remont.php?t=${T3}&a=advance`, { json: {} });
    ok((await B[1].req('POST', '/api/brigada.php?m=jobs&a=advance_dispute', { json: { j: J3, reason: 'денег не получали' } })).j?.ok, 'В-2: бригада оспорила отметку аванса');
    ok(!(await due()).dueAt, 'оспоренный аванс к оплате не переводит');
    const sg3 = await admin.req('GET', '/api/admin-brigady.php?view=signals', { raw: true });
    ok(/Расхождение по (авансу|оплате)|advance|payment/.test(sg3.text), 'расхождение по авансу — в сигналах админки');
    await adminPost({ act: 'j_advance', id: J3, to: 'confirmed' });
    ok(!sql(`SELECT advance_state FROM br_jobs WHERE id = ${J3}`)[0].advance_state.includes('confirmed'), 'исправить аванс без причины нельзя');
    await adminPost({ act: 'j_advance', id: J3, to: 'confirmed', reason: 'клиент прислал чек перевода' });
    ok(sql(`SELECT advance_state FROM br_jobs WHERE id = ${J3}`)[0].advance_state === 'confirmed' && (await due()).dueAt, 'админ подтвердил аванс с причиной — к оплате');
    ok(sql(`SELECT COUNT(*) n FROM br_audit WHERE action = 'advance' AND detail LIKE '%чек перевода%'`)[0].n > 0, 'исправление аванса — в журнале');
    // ручной счёт и лестница долга
    sql(`UPDATE br_jobs SET commission_due_at = NULL, commission_due_why = NULL, advance_at = NULL, advance_state = NULL WHERE id = ${J3}`);
    await adminPost({ act: 'j_invoice', id: J3 });
    ok(!sql(`SELECT id FROM br_invoices WHERE job_id = ${J3}`).length, 'счёт без наступившей даты и без «вручную» не выставляется');
    await adminPost({ act: 'j_invoice', id: J3, manual: 1, reason: 'стороны работают мимо сайта' });
    ok(sql(`SELECT id FROM br_invoices WHERE job_id = ${J3}`).length === 1, 'К-1: админ выставил счёт вручную (с причиной) — всегда можно');
    sql(`UPDATE br_invoices SET due_at = '${ago(20).slice(0, 10)}' WHERE job_id = ${J3}`);
    const fd = await B[1].req('GET', '/api/brigada.php?m=feed');
    ok(fd.code === 402 && /закрыты до оплаты/.test(fd.j?.error || ''), 'лестница долга: просрочка 20 дней — лента новых заказов закрыта');
    ok((await B[1].req('GET', `/api/brigada.php?m=jobs&j=${J3}`)).code === 200 && (await B[1].req('GET', '/api/brigada.php?m=finance')).j.debtLadder.level === 'feed_closed', 'начатый объект доступен, в «Финансах» — уровень долга');
    sql(`UPDATE br_invoices SET due_at = '${ago(3).slice(0, 10)}' WHERE job_id = ${J3}`);
    ok((await B[1].req('GET', '/api/brigada.php?m=feed')).code === 200 && (await B[1].req('GET', '/api/brigada.php?m=finance')).j.debtLadder.level === 'warn', 'просрочка 3 дня — только предупреждение, лента открыта');
    sql(`UPDATE br_invoices SET paid_at = '${ago(0)}' WHERE job_id = ${J3}`);
    // В-1: допсоглашения
    const add = items => B[1].req('POST', '/api/brigada.php?m=jobs&a=addendum', { json: { j: J3, items } });
    ok((await add([{ name: 'Минус работа', qty: -1, price: 1000 }])).code === 400, 'В-1: отрицательное количество — отказ');
    ok((await add([{ name: 'Дорого', qty: 1, price: 1e12 }])).code === 400, 'В-1: цена сверх границы — отказ');
    ok((await add([{ name: 'Много', qty: 1e9, price: 1 }])).code === 400, 'В-1: количество сверх границы — отказ');
    const total3 = +sql(`SELECT deal_total_kop t FROM br_jobs WHERE id = ${J3}`)[0].t / 100;
    const cut = await add([{ name: 'Демонтаж перегородок', qty: 1, price: Math.round(total3 * 0.5), remove: true }]);
    ok(cut.j?.ok, 'допсоглашение «исключить работу» на 50 % цены предложено');
    const cutDoc = (await B[1].req('GET', `/api/brigada.php?m=jobs&j=${J3}`)).j.job.docs.contracts.find(c => c.id === cut.j.doc);
    ok(cutDoc?.waitAdmin === true, 'В-1: уменьшение цены больше 20 % — ждёт подтверждения LINEA');
    ok((await B[1].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: J3, doc: cut.j.doc } })).j?.codeSent && (await B[1].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: J3, doc: cut.j.doc, code: '123456', pep: true } })).code === 409, 'подписать до подтверждения LINEA нельзя (409)');
    await adminPost({ act: 'c_approve', id: cut.j.doc, reason: 'объём по согласию сторон' });
    const sc2 = await B[1].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: J3, doc: cut.j.doc } });
    ok((await B[1].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: J3, doc: cut.j.doc, code: sc2.j.devCode, pep: true } })).j?.ok, 'после подтверждения LINEA бригада подписала');
    const cc = await c3.req('POST', `/api/remont.php?t=${T3}&a=sign`, { json: { doc: cut.j.doc } });
    r3 = await c3.req('POST', `/api/remont.php?t=${T3}&a=sign`, { json: { doc: cut.j.doc, code: cc.j.devCode, pep: true } });
    const comm3 = +sql(`SELECT commission_kop c FROM br_jobs WHERE id = ${J3}`)[0].c, inv3 = +sql(`SELECT amount_kop a FROM br_invoices WHERE job_id = ${J3}`)[0].a;
    ok(comm3 >= inv3, 'вознаграждение после уменьшения цены не ниже уже выставленного счёта');
    ok(!(r3.j?.job?.docs?.log || []).some(l => /вознагражд/i.test(l.text)), 'журнал сделки заказчика не показывает вознаграждение LINEA');
    // приняли этап 1 из 2 — итог не ниже принятого
    await stagePhotos(B[1], stg3[0].id, 3);
    await B[1].req('POST', '/api/brigada.php?m=jobs&a=stage_ready', { json: { stage: stg3[0].id } });
    await c3.req('POST', `/api/remont.php?t=${T3}&a=stage_accept`, { json: { stage: stg3[0].id, checks: Array(20).fill(true) } });
    const total3b = +sql(`SELECT deal_total_kop t FROM br_jobs WHERE id = ${J3}`)[0].t / 100;
    const below = await add([{ name: 'Убрать почти всё', qty: 1, price: Math.round(total3b * 0.8), remove: true }]);
    ok(below.code === 400 && /принятых этапов/.test(below.j?.error || ''), 'В-1: цена не может стать меньше стоимости принятых этапов');
    // С-8: печать договора без инлайн-обработчика
    const dg = await B[1].req('GET', `/api/remont-dogovor.php?j=${J3}`, { raw: true });
    const csp = dg.headers.get('content-security-policy') || '';
    ok(!/onclick=/.test(dg.text) && /script-src 'nonce-/.test(csp) && dg.text.includes('nonce="' + (csp.match(/nonce-([^']+)/) || [])[1] + '"'), 'С-8: кнопка печати — скрипт с nonce, без onclick (CSP не блокирует)');
    // CSV-инъекция
    sql(`UPDATE br_brigades SET name = '=HYPERLINK("http://x")' WHERE id = ${B[1].id}`);
    const csv3 = await admin.req('GET', '/api/admin-brigady.php?csv=money', { raw: true });
    sql(`UPDATE br_brigades SET name = 'Тест-бригада 2' WHERE id = ${B[1].id}`);
    ok(csv3.text.includes(`'=HYPERLINK`) && !/;=HYPERLINK/.test(csv3.text), 'CSV: ячейка с «=» экранирована префиксом «\'»');
    // В-5: вебхук ЮKassa — неизвестный платёж отсекается своей базой
    const wh = await anon.req('POST', '/api/pay-notify.php', { json: { event: 'payment.succeeded', object: { id: '2f1b0c3e-000f-5000-8000-0000000000aa' } }, raw: true });
    ok(wh.code === 200 && /неизвестный платёж/.test(fs.readFileSync(path.join(PRIV, 'pay.log'), 'utf8')), 'В-5: вебхук с чужим id платежа — 200 без запроса к API ЮKassa');
    // К-2: файлы портфолио после допуска — в каталоге только после модерации
    const pf = (await B[0].req('GET', '/api/brigada.php?m=profile')).j.portfolio[0].id;
    const up = await B[0].req('POST', '/api/brigada.php?m=profile&a=photo', { form: { portfolio: pf, kind: 'after', file: { file: path.join(FX, 'after.jpg'), type: 'image/jpeg' } } });
    const fid = up.j?.file || +sql(`SELECT MAX(id) m FROM br_files WHERE owner_kind = 'portfolio'`)[0].m;
    const guest = actor('guest');
    ok((await guest.req('GET', `/api/brigade/file.php?f=${fid}`, { raw: true })).code === 403, 'К-2: новое фото портфолио до модерации в каталоге не отдаётся');
    await adminPost({ act: 'f_ok', id: fid });
    ok((await guest.req('GET', `/api/brigade/file.php?f=${fid}`, { raw: true })).code === 200, 'после «Одобрить» — видно в каталоге');
    if (MYSQL) ok(sql(`SELECT DATA_TYPE t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'br_contracts' AND COLUMN_NAME = 'body'`)[0]?.t === 'mediumtext', 'С-2: тело договора на MySQL — MEDIUMTEXT');

    step('18. Кабинет бригады: старые адреса, команда и права, реестр оплат, переходы сделки, заморозка, панель, экспорт');
    const B1 = B[1];
    const old = await B1.req('GET', '/api/brigade/jobs.php?j=1');
    ok(old.code === 307 && /brigada\.php\?m=jobs&j=1/.test(old.headers.get('location') || ''), 'старый адрес api/brigade/jobs.php → 307 на api/brigada.php?m=jobs (метод и тело сохраняются)');
    const home = await B1.req('GET', '/api/brigada.php?m=kab&a=home');
    ok(home.j?.ok && Array.isArray(home.j.todo) && home.j.tiles.length >= 3, 'главная бригады: «Сейчас от вас нужно» и плитки');
    ok((await B1.req('GET', '/api/brigada.php?m=kab&a=me')).j?.brigade?.role === 'owner', 'владелец входит кодом, роль «owner»');
    const fi = await B1.req('POST', '/api/brigada.php?m=kab&a=team_invite', { json: { email: 'foreman2@example.test', name: 'Пётр', role: 'foreman', objects: null } });
    ok(fi.j?.ok, 'владелец пригласил бригадира', fi.text);
    ok((await B1.req('POST', '/api/brigada.php?m=kab&a=team_invite', { json: { email: 'worker2@example.test', name: 'Иван', role: 'worker' } })).j?.ok, 'владелец пригласил сотрудника (без объектов)');
    ok((await B1.req('POST', '/api/brigada.php?m=kab&a=team_invite', { json: { email: 'brig1@example.test', name: 'Чужой', role: 'worker' } })).code === 409, 'почту другой бригады пригласить нельзя — 409');
    const F = actor('foreman'), W = actor('worker');
    await loginCode(F, 'foreman2@example.test'); F.csrf = (await F.req('GET', '/api/brigada.php?m=kab&a=me')).j?.csrf;
    await loginCode(W, 'worker2@example.test'); W.csrf = (await W.req('GET', '/api/brigada.php?m=kab&a=me')).j?.csrf;
    const fme = (await F.req('GET', '/api/brigada.php?m=kab&a=me')).j?.brigade;
    ok(fme?.role === 'foreman' && fme.can.sign === false && fme.can.stage === true && fme.can.money === false, 'бригадир вошёл кодом: подписывать и видеть деньги нельзя, сдавать этапы можно');
    ok((await F.req('GET', `/api/brigada.php?m=jobs&j=${J3}`)).j?.job?.id === J3, 'бригадир видит объект бригады');
    ok((await F.req('GET', `/api/brigada.php?m=jobs&j=${J3}`)).j?.job?.payments === null, 'бригадир не видит оплаты по объекту');
    ok((await F.req('GET', '/api/brigada.php?m=finance')).code === 403, 'бригадир: «Деньги» — 403');
    ok((await F.req('GET', '/api/brigada.php?m=kab&a=team')).code === 403, 'бригадир: «Команда» — 403');
    ok((await F.req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: J3 } })).code === 403, 'бригадир не подписывает договор — 403');
    ok((await F.req('POST', '/api/brigada.php?m=jobs&a=sign_ask', { json: { j: J3 } })).j?.ok, 'бригадир: «Попросить владельца подписать» — уведомление владельцу');
    ok((await F.req('POST', '/api/brigada.php?m=jobs&a=pay', { json: { j: J3, kind: 'extra', amount: 100 } })).code === 403, 'бригадир не отмечает оплаты — 403');
    ok((await F.req('POST', '/api/brigada.php?m=profile&a=save', { json: { name: 'Чужое имя' } })).code === 403, 'бригадир не меняет анкету — 403');
    ok((await W.req('GET', `/api/brigada.php?m=jobs&j=${J3}`)).code === 403, 'сотрудник без назначенных объектов — сделка 403');
    ok(((await W.req('GET', '/api/brigada.php?m=jobs')).j?.jobs || ['x']).length === 0, 'сотрудник видит только свои объекты (пока ни одного)');
    ok((await W.req('GET', '/api/brigada.php?m=feed')).code === 403, 'сотрудник: лента заказов — 403');
    const wid = (await B1.req('GET', '/api/brigada.php?m=kab&a=team')).j.members.find(m => m.role === 'worker').id;
    await B1.req('POST', '/api/brigada.php?m=kab&a=team_update', { json: { id: wid, role: 'worker', objects: [J3] } });
    ok((await W.req('GET', `/api/brigada.php?m=jobs&j=${J3}`)).j?.job?.id === J3, 'сотруднику назначили объект — видит его');
    ok((await W.req('POST', '/api/brigada.php?m=jobs&a=msg', { json: { j: J3, text: 'Добрый день' } })).code === 403, 'сотрудник не пишет заказчику, пока владелец не разрешил');
    ok((await W.req('POST', '/api/brigada.php?m=jobs&a=stage_ready', { json: { stage: stg3[1].id } })).code === 403, 'сотрудник не сдаёт этап — 403');
    ok((await B[0].req('GET', `/api/brigada.php?m=jobs&j=${J3}`)).code === 403, 'чужая бригада не видит сделку — 403');
    await B1.req('POST', '/api/brigada.php?m=kab&a=team_remove', { json: { id: wid } });
    ok((await W.req('GET', '/api/brigada.php?m=jobs')).code === 401, 'удалённый сотрудник теряет доступ сразу — 401');
    ok(sql(`SELECT 1 x FROM br_messages WHERE job_id = ${J3} AND who = 'system' AND text LIKE 'Статус сделки:%'`).length > 0 && sql(`SELECT 1 x FROM br_audit WHERE action = 'deal-work' AND target = 'job#${J3}'`).length > 0,
      'переход «договор → в работе» сделан deal_transition(): запись «Система» в ленте и в журнале');
    const pays = (await B1.req('GET', `/api/brigada.php?m=jobs&j=${J3}`)).j.job.payments.filter(p => p.kind === 'stage');
    ok(pays.length === 2 && pays.reduce((a, p) => a + p.amount, 0) > 0, 'план оплат из договора: по строке на каждый этап');
    const cp = await c3.req('POST', `/api/remont.php?t=${T3}&a=pay`, { json: { p: pays[0].id } });
    ok(cp.j?.job?.payments?.find(p => p.id === pays[0].id)?.status === 'declared', 'заказчик отметил оплату этапа — «отмечено одной стороной»');
    ok((await c3.req('POST', `/api/remont.php?t=${T3}&a=pay`, { json: { p: pays[0].id } })).j?.ok === false, 'повторная отметка той же стороной — отказ, ждём вторую сторону');
    const bp = await B1.req('POST', '/api/brigada.php?m=jobs&a=pay', { json: { j: J3, p: pays[0].id } });
    ok(bp.j?.payment?.status === 'confirmed', 'бригада подтвердила получение — «подтверждено обеими сторонами»', bp.text);
    await B1.req('POST', '/api/brigada.php?m=jobs&a=pay', { json: { j: J3, p: pays[1].id } });
    const cc2 = await c3.req('POST', `/api/remont.php?t=${T3}&a=pay_contest`, { json: { p: pays[1].id, note: 'ещё не платили' } });
    ok(cc2.j?.job?.payments?.find(p => p.id === pays[1].id)?.status === 'contested', 'заказчик оспорил отметку бригады — расхождение');
    ok(sql(`SELECT 1 x FROM br_signals WHERE kind = 'payment' AND job_id = ${J3} AND detail LIKE '%не платили%'`).length > 0, 'расхождение по оплате — сигнал LINEA');
    ok(sql(`SELECT 1 x FROM br_messages WHERE job_id = ${J3} AND who = 'system' AND text LIKE '%подтверждена обеими%'`).length > 0, 'отметки оплат видны обеим сторонам в общей ленте сделки');
    ok(((await B1.req('GET', '/api/brigada.php?m=kab&a=notices')).j?.list || []).some(n => /просит подписать/.test(n.text)), 'уведомления бригады в кабинете (просьба бригадира подписать)');
    const pp = await admin.req('GET', '/api/panel.php', { raw: true }); const pcs = adminCsrf(pp.text);
    await admin.req('POST', '/api/panel.php', { raw: true, form: { csrf: pcs, act: 'd_freeze', id: J3, reason: 'проверка' } });
    ok((await B1.req('POST', '/api/brigada.php?m=jobs&a=stage_start', { json: { stage: stg3[1].id } })).code === 423, 'приостановленная LINEA сделка: действия по этапам — 423');
    ok((await B1.req('POST', '/api/brigada.php?m=jobs&a=pay', { json: { j: J3, kind: 'extra', amount: 100 } })).code === 423, 'приостановленная сделка: отметки оплат — 423');
    ok((await B1.req('POST', '/api/brigada.php?m=jobs&a=msg', { json: { j: J3, text: 'Когда разморозят?' } })).j?.ok, 'лента при приостановке работает');
    await admin.req('POST', '/api/panel.php', { raw: true, form: { csrf: pcs, act: 'd_unfreeze', id: J3, reason: 'разобрались' } });
    ok((await B1.req('POST', '/api/brigada.php?m=jobs&a=stage_start', { json: { stage: stg3[1].id } })).j?.ok, 'после возобновления — «Начать работу» по этапу 2 (не скрытые работы — без фото «до»)');
    const bcard = await admin.req('GET', `/api/panel.php?s=brigade&id=${B1.id}`, { raw: true });
    ok(bcard.code === 200 && /Допустить/.test(bcard.text) && /Пётр/.test(bcard.text), 'панель: анкета бригады — модерация, файлы, команда');
    const rq = await admin.req('GET', `/api/panel.php?s=requests&id=${rid3}`, { raw: true });
    ok(/Рассылка — отправлено 1 из \d/.test(rq.text) && /Пакет проекта/.test(rq.text), 'панель: запрос — пакет и рассылка с лимитом invite_max');
    const dsp = await admin.req('GET', '/api/panel.php?s=disputes', { raw: true });
    ok(dsp.code === 200 && /Переписка по открытым разногласиям/.test(dsp.text), 'панель: переписка и итог разногласий');
    sql(`INSERT INTO br_signals (at, kind, who, detail) VALUES ('${new Date().toISOString().slice(0, 19).replace('T', ' ')}', 'test', 'test', '=HYPERLINK("http://x")')`);
    const ex = await admin.req('GET', '/api/panel.php?csv=signals', { raw: true });
    ok(ex.code === 200 && /text\/csv/.test(ex.headers.get('content-type') || '') && ex.text.includes(`'=HYPERLINK`) && !/;=HYPERLINK/.test(ex.text), 'экспорт CSV из панели: ячейка с «=» выгружается с апострофом');
    ok(sql(`SELECT 1 x FROM br_audit WHERE action = 'csv-export' AND target = 'signals'`).length > 0, 'выгрузка CSV — в журнале');
    ok((await B1.req('GET', '/api/brigada.php?m=kab&a=docs')).j?.jobs?.length >= 1 && (await B1.req('GET', '/api/brigada.php?m=kab&a=rating')).j?.stats, 'документы бригады и показатели рейтинга');
    // ревью кода кабинетов 01.11: С-3, С-7, фильтр контактов
    const pw = await anon.req('POST', '/api/brigada.php?m=auth&a=login', { json: { email: 'brig3@example.test', password: 'Pass3word77' } });
    ok(pw.code === 401 && sql("SELECT pass_hash FROM accounts WHERE email = 'brig3@example.test'")[0].pass_hash === '', 'С-3: после первого входа кодом прежний пароль бригадного аккаунта не действует (сброшен)');
    const g7 = actor('guest7'); g7.csrf = (await g7.req('GET', `/api/remont.php?t=${T3}`)).j?.csrf;
    ok((await g7.req('POST', `/api/remont.php?t=${T3}&a=msg`, { json: { text: 'я заказчик' } })).code === 401, 'С-7: сообщение бригаде по одной ссылке, без кода — 401');
    ok((await g7.req('POST', `/api/remont.php?t=${T3}&a=invite`, { json: { slug: 'x' } })).code === 401, 'С-7: приглашение бригады без кода — 401');
    const scan = t => JSON.parse(execFileSync('php', ['-r', 'require $argv[1] . "/server/api/lib/boot.php"; require $argv[1] . "/server/api/lib/brig.php"; echo json_encode(brig_contact_scan($argv[2]), JSON_UNESCAPED_UNICODE);', ROOT, t], { env: { ...process.env, LINEA_PRIVATE: PRIV } }).toString());
    ok(scan('звоните восемь девятьсот ноль один два три четыре пять шесть семь')[1].includes('телефон'), 'фильтр: номер словами с лишней цифрой — скрыт');
    ok(scan('пишите ivan гав gmail дот ком')[1].includes('почта'), 'фильтр: «гав» и «дот» вместо @ и точки — скрыто');
    ok(scan('плитка 60 на 120, три коробки')[1].length === 0, 'фильтр: размеры и количества словами — не трогает');
    if (UNTIL === 'shots') {   // данные для tools/shots-brigada.mjs: бригада с объектом в работе, бригадир, заказчик того же объекта
      fs.writeFileSync(path.join(PRIV, '_dev.json'), JSON.stringify({ base: BASE, brigade: 'brig2@example.test', foreman: 'foreman2@example.test', client: BRIEF.client.email, order: N3, job: J3, admin: ADMIN_PASS }, null, 2));
      throw STOP;
    }
    step('19. Договор: суммы и сроки этапов, аванс; расторжение через сайт — акт о принятом объёме, пересчёт вознаграждения');
    {
      const dg = await c3.req('GET', `/api/remont-dogovor.php?t=${T3}`, { raw: true });
      const offT = +sql(`SELECT o.total_kop t FROM br_jobs j JOIN br_offers o ON o.id = j.offer_id WHERE j.id = ${J3}`)[0].t;
      const stSum = sql(`SELECT SUM(amount_kop) s, COUNT(amount_kop) n FROM br_stages WHERE job_id = ${J3}`)[0];
      ok(+stSum.s === offT && +stSum.n === stg3.length, `суммы этапов записаны при договоре и сходятся с ценой (${offT / 100} ₽ на ${stSum.n} этапа)`);
      ok(/Приложение 3\. График этапов и оплаты/.test(dg.text) && /К оплате после приёмки/.test(dg.text) && /8\. Расторжение/.test(dg.text) && /ст\. 717 ГК/.test(dg.text) && !/агентск/i.test(dg.text),
        'договор: стоимость и срок каждого этапа, оплата после приёмки, раздел «Расторжение» (ст. 717 ГК), без «агентского договора»');
      const plan = sql(`SELECT SUM(amount_kop) s FROM br_payments WHERE job_id = ${J3} AND kind IN ('stage','advance') AND note = 'по договору'`)[0];
      ok(+plan.s === offT || +plan.s > 0, 'реестр оплат: план по суммам этапов договора');
      // чистый расчёт сумм этапов: стоимости этапов → как есть; разделы → по своим этапам; ничего не сопоставилось → поровну
      const am = JSON.parse(execFileSync('php', ['-r', 'require $argv[1] . "/server/api/lib/boot.php"; require $argv[1] . "/server/api/lib/brig.php"; require $argv[1] . "/server/api/lib/brigada.php"; echo json_encode([' +
        'brig_stage_amounts(["total_kop"=>100000,"mode"=>"sections","sections"=>json_encode(["elektrika"=>30000,"plitka"=>50000,"poly"=>20000])], [], [["name"=>"Черновая электрика"],["name"=>"Гидроизоляция и плитка"],["name"=>"Финальная приёмка"]]),' +
        'brig_stage_amounts(["total_kop"=>100000], [], [["name"=>"А","amount"=>70000],["name"=>"Б","amount"=>30000]]),' +
        'brig_stage_amounts(["total_kop"=>100001,"mode"=>"sections","sections"=>"{}"], [], [["name"=>"А"],["name"=>"Б"],["name"=>"В"]]),' +
        'brig_pay_plan_calc(100000, 30, [["id"=>1,"amount"=>70000],["id"=>2,"amount"=>30000]])]);', ROOT], { env: { ...process.env, LINEA_PRIVATE: PRIV } }).toString());
      ok(JSON.stringify(am[0]) === '[30000,50000,20000]' && JSON.stringify(am[1]) === '[70000,30000]' && JSON.stringify(am[2]) === '[33333,33333,33335]',
        'суммы этапов: разделы → свои этапы, «без этапа» → последний; стоимости этапов → как есть; иначе поровну (копейки — последнему)', JSON.stringify(am));
      ok(am[3][0].amount === 30000 && am[3][1].amount === 49000 && am[3][2].amount === 21000, 'план оплат: аванс 30 %, этап — стоимость минус соразмерная часть аванса', JSON.stringify(am[3]));
      for (const d of sql(`SELECT id FROM br_contracts WHERE job_id = ${J3} AND status = 'draft'`)) await B[1].req('POST', '/api/brigada.php?m=jobs&a=addendum_cancel', { json: { j: J3, doc: +d.id } });
      ok((await c3.req('POST', `/api/remont.php?t=${T3}&a=terminate`, { json: { reason: '' } })).code === 400, 'расторжение без причины — отказ');
      ok((await B[1].req('POST', '/api/brigada.php?m=jobs&a=terminate', { json: { j: J3, reason: 'Заказчик переносит ремонт', extra: offT, extraNote: 'всё' } })).code === 400, 'работы сверх принятого больше цены договора — отказ');
      // ревью 02.11 В1: расторжение «на ноль» после открытых контактов — сигнал обхода и подтверждение LINEA (принятый этап временно снят)
      {
        const st1 = sql(`SELECT status, accepted_at FROM br_stages WHERE id = ${stg3[0].id}`)[0];
        sql(`UPDATE br_stages SET status = 'ready' WHERE id = ${stg3[0].id}`);
        const z = await c3.req('POST', `/api/remont.php?t=${T3}&a=terminate`, { json: { reason: 'Расходимся, дальше сами' } });
        const zd = z.j?.doc ? sql(`SELECT * FROM br_contracts WHERE id = ${z.j.doc}`)[0] : {};
        ok(z.j?.ok && +zd.total_kop === 0 && +zd.needs_admin === 1 && sql(`SELECT 1 x FROM br_signals WHERE kind = 'termination_zero' AND job_id = ${J3}`).length > 0,
          'В1: акт на ноль после открытых контактов — сигнал обхода, соглашение ждёт подтверждения LINEA', z.text);
        const zs = await c3.req('POST', `/api/remont.php?t=${T3}&a=sign`, { json: { doc: z.j?.doc } });
        const zc = await c3.req('POST', `/api/remont.php?t=${T3}&a=sign`, { json: { doc: z.j?.doc, code: zs.j?.devCode || '000000', pep: true } });
        ok(zc.code === 409 && /подтверждения LINEA/.test(zc.text) && sql(`SELECT status FROM br_jobs WHERE id = ${J3}`)[0].status === 'work', 'В1: без подтверждения LINEA подписать нельзя — сделка в работе', zc.text);
        ok(/без принятых работ/.test((await admin.req('GET', `/api/admin-brigady.php?j=${J3}`, { raw: true })).text), 'В1: админка показывает соглашение на подтверждении');
        // С1: пока есть неподписанное соглашение о расторжении, приёмка этапа закрыта (акт устарел бы)
        const sa = await c3.req('POST', `/api/remont.php?t=${T3}&a=stage_accept`, { json: { stage: stg3[0].id, checks: Array(20).fill(true) } });
        ok(sa.code === 409 && /отзовите соглашение/.test(sa.text) && sql(`SELECT status FROM br_stages WHERE id = ${stg3[0].id}`)[0].status === 'ready', 'С1: приёмка этапа при открытом соглашении о расторжении — отказ', sa.text);
        await adminPost({ act: 'c_reject', id: z.j?.doc, reason: 'обход' });
        ok(sql(`SELECT status FROM br_contracts WHERE id = ${z.j?.doc}`)[0].status === 'void', 'В1: LINEA отклонила соглашение — оно недействительно');
        sql(`UPDATE br_stages SET status = '${st1.status}' WHERE id = ${stg3[0].id}`);
      }
      const tp = await B[1].req('POST', '/api/brigada.php?m=jobs&a=terminate', { json: { j: J3, reason: 'Заказчик переносит ремонт на весну', extra: 1000, extraNote: 'Штробление под розетки в кухне начато' } });
      ok(tp.j?.ok && tp.j.doc, 'бригада (владелец) предложила расторжение: соглашение и акт', tp.text);
      ok((await c3.req('POST', `/api/remont.php?t=${T3}&a=terminate`, { json: { reason: 'Второе расторжение' } })).code === 400, 'второе неподписанное соглашение — отказ');
      const acc = +sql(`SELECT amount_kop a FROM br_stages WHERE id = ${stg3[0].id}`)[0].a;
      const paid = +sql(`SELECT COALESCE(SUM(amount_kop),0) p FROM br_payments WHERE job_id = ${J3} AND status = 'confirmed' AND kind <> 'refund'`)[0].p;
      const tdoc = sql(`SELECT * FROM br_contracts WHERE id = ${tp.j.doc}`)[0];
      ok(+tdoc.total_kop === acc + 100000 && +tdoc.delta_kop === acc + 100000 - paid && tdoc.kind === 'termination', `акт: принято ${(acc + 100000) / 100} ₽ (этап 1 + признанные работы), оплачено ${paid / 100} ₽, расчёт ${(acc + 100000 - paid) / 100} ₽`);
      const dgT = await c3.req('GET', `/api/remont-dogovor.php?t=${T3}`, { raw: true });
      ok(/Соглашение о расторжении договора подряда/.test(dgT.text) && /Итого принято/.test(dgT.text) && /по инициативе Подрядчика/.test(dgT.text) && dgT.text.includes(tdoc.hash), 'текст соглашения: инициатор, принятые этапы, расчёт, хеш версии');
      // В1: счёт на вознаграждение уже выставлен от полной цены, а по акту меньше — подписание только после подтверждения LINEA
      const inv3 = +(sql(`SELECT amount_kop a FROM br_invoices WHERE job_id = ${J3}`)[0]?.a || 0);
      ok(inv3 > 0 && +tdoc.needs_admin === 1, 'В1: вознаграждение по акту ниже выставленного счёта — соглашение на подтверждении LINEA');
      // пол вознаграждения (чистый расчёт): акт на 0 → база не ниже оплаченного по реестру; база 'paid' — полученное подрядчиком
      const fee = JSON.parse(execFileSync('php', ['-r', 'require $argv[1] . "/server/api/lib/boot.php"; require $argv[1] . "/server/api/lib/brig.php"; require_once $argv[1] . "/server/api/lib/contract.php"; brig_db();'
        + '$j = db_one("SELECT * FROM br_jobs WHERE id = ' + J3 + '"); $a = brig_termination_fee($j, 0); $b = brig_termination_fee($j, 10000000000);'
        + '$old = linea_settings("brig_terms"); $new = $old; $new["termination_fee_base"] = "paid"; db_exec("DELETE FROM settings WHERE k = ?", ["brig_terms"]); db_insert("settings", ["k" => "brig_terms", "v" => json_encode($new), "updated_at" => linea_now()]); brig_terms(true);'
        + '$c = brig_termination_fee($j, 0); db_exec("DELETE FROM settings WHERE k = ?", ["brig_terms"]); if ($old) { db_insert("settings", ["k" => "brig_terms", "v" => json_encode($old), "updated_at" => linea_now()]); } brig_terms(true);'
        + 'echo json_encode([$a, $b, $c, brig_paid_kop(' + J3 + '), brig_received_kop(' + J3 + ')]);', ROOT], { env: { ...process.env, LINEA_PRIVATE: PRIV } }).toString());
      ok(fee[0].base === fee[3] && fee[3] > 0 && fee[0].fee > 0 && fee[0].below_invoice === true && fee[1].base === 10000000000 && fee[2].base === fee[4] && fee[4] >= fee[3],
        `В1: пол — оплачено по реестру (${fee[3] / 100} ₽); 'paid' — полученное подрядчиком (${fee[4] / 100} ₽); ниже счёта — помечено`, JSON.stringify(fee));
      const sb0 = await B[1].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: J3, doc: tp.j.doc } });
      const sb1 = await B[1].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: J3, doc: tp.j.doc, code: sb0.j?.devCode, pep: true } });
      ok(sb1.code === 409 && sql(`SELECT brigade_signed_at s FROM br_contracts WHERE id = ${tp.j.doc}`)[0].s === null, 'В1: до подтверждения LINEA подпись не принимается', sb1.text);
      await adminPost({ act: 'c_approve', id: tp.j.doc, reason: 'проверено' });
      ok(!!sql(`SELECT admin_ok_at a FROM br_contracts WHERE id = ${tp.j.doc}`)[0].a, 'LINEA подтвердила соглашение о расторжении');
      const sb = await B[1].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: J3, doc: tp.j.doc } });
      await B[1].req('POST', '/api/brigada.php?m=jobs&a=sign', { json: { j: J3, doc: tp.j.doc, code: sb.j?.devCode, pep: true } });
      ok(sql(`SELECT status FROM br_jobs WHERE id = ${J3}`)[0].status === 'work', 'подписала одна сторона — сделка ещё действует');
      const sc = await c3.req('POST', `/api/remont.php?t=${T3}&a=sign`, { json: { doc: tp.j.doc } });
      const fin3 = await c3.req('POST', `/api/remont.php?t=${T3}&a=sign`, { json: { doc: tp.j.doc, code: sc.j?.devCode, pep: true } });
      const jj = sql(`SELECT * FROM br_jobs WHERE id = ${J3}`)[0];
      ok(fin3.j?.job?.status === 'cancelled' && jj.terminated_at && +jj.accepted_kop === acc + 100000, 'обе подписи → договор расторгнут, принятый объём записан в сделку', fin3.text);
      ok(+jj.commission_kop === Math.round(Math.max(acc + 100000, paid) * +jj.commission_rate) && jj.commission_due_at, `вознаграждение пересчитано от фактически принятого (не ниже оплаченного): ${+jj.commission_kop / 100} ₽ (${+jj.commission_rate * 100} % от ${Math.max(acc + 100000, paid) / 100} ₽); уменьшение ниже счёта — с подтверждения LINEA`);
      ok(sql(`SELECT status FROM br_ledger WHERE job_id = ${J3} AND kind = 'accrual'`)[0]?.status !== 'void' && sql(`SELECT 1 x FROM br_audit WHERE action = 'deal-cancelled' AND target = 'job#${J3}'`).length > 0
        && sql(`SELECT 1 x FROM br_messages WHERE job_id = ${J3} AND who = 'system' AND text LIKE '%расторгнут соглашением%'`).length > 0, 'переход — через deal_transition() (лента «Система», журнал); проводка не аннулирована');
      ok((await B[1].req('POST', '/api/brigada.php?m=jobs&a=stage_ready', { json: { stage: stg3[1].id } })).code >= 400, 'после расторжения этапы закрыты');
    }
  }

  step('16. Журналы и письма');
  const mlog = fs.readFileSync(path.join(PRIV, 'brig-mail.log'), 'utf8');
  ok(!/SENT/.test(mlog), 'ни одного отправленного письма (всё DRY)');
  const logs = ['brig-mail.log', 'mail.log', 'orders.log'].map(f => fs.existsSync(path.join(PRIV, f)) ? fs.readFileSync(path.join(PRIV, f), 'utf8') : '').join('\n');
  ok(!logs.includes(tok) && !logs.includes(T) && !logs.includes('NewPass2026x'), 'в журналах нет токенов и паролей');
  const adm = await admin.req('GET', '/api/admin-brigady.php?view=audit&who=admin', { raw: true });
  ok((adm.text.match(/<tr><td class="mut">/g) || []).length >= 6, 'журнал действий администратора ведётся');

  step('17. Модули сервера: адрес клиента, ссылки писем, условия бригад, фильтр контактов, чек 54-ФЗ, оплата через макет ЮKassa');
  {
    const UP = path.join(PRIV, '_units'), MD = path.join(PRIV, '_yk-mock'); fs.mkdirSync(MD, { recursive: true });
    const mport = PORT + 2;
    const mock = spawn('php', ['-S', `127.0.0.1:${mport}`, path.join(ROOT, 'tools/fixtures/yk-mock.php')], { env: { ...process.env, LINEA_YK_MOCK: MD }, stdio: 'ignore' });
    for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${mport}/payments/x`); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
    let out = '';
    try { out = execFileSync('php', [path.join(ROOT, 'tools/test-units.php'), UP, `http://127.0.0.1:${mport}`, MD]).toString(); }
    catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
    mock.kill();
    for (const line of out.split('\n')) { const m = line.match(/^\s+([✓✗]) (.*)$/); if (m) ok(m[1] === '✓', m[2]); }
    ok(/✓/.test(out) && !/Fatal|Warning/.test(out), 'модульные проверки отработали без ошибок PHP', out.slice(-300));
  }
} catch (e) { if (e !== STOP) { fail++; console.log('  ✗ исключение: ' + e.stack); } }

console.log(`\nИтог: ${pass} ✓, ${fail} ✗` + (srvErr.match(/PHP (Fatal|Warning|Notice|Deprecated)[^\n]*/g) || []).map(s => '\n  ' + s).join(''));
if (KEEP) console.log(`Сервер оставлен: ${BASE}  (данные ${PRIV})`);
stop();
process.exit(fail ? 1 : 0);
