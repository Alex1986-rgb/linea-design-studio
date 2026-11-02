#!/usr/bin/env node
// LINEA · проверка эксплуатационного контура на макете (ревью 02.11.2026: В3, В4, С7, С8, низкие). Без сети и без Beget.
//
//   node tools/ops/test-ops.mjs [--keep]     всё во временной папке ($LINEA_SCRATCH или системная), в конце удаляется
//
// Что проверяется (негативы — главное):
//   В4  beget-dump.sh: режим только из белого списка SSH_ORIGINAL_COMMAND (произвольная команда — код 64, пустой stdout);
//       bk.mjs ходит к «Beget» как принудительная команда (подставной ssh передаёт слово-режим), сверяет версию скрипта.
//   В3  driver none — отказ; падение заказов/строк — копия в suspect, хорошие в daily и на «Диске» не тронуты, сигнал;
//       --accept-drop — проходит; ротация по числу: остаётся max(keep, keepMinGood), старые по возрасту не удаляются;
//       пропущенные большие файлы — предупреждение-сигнал; архив зашифрован, пароль в 7z не передаётся аргументом.
//   С7  monitor.mjs: токен только в заголовке, cron старше 45 мин — сбой, без токена — «внимание», expectBackup=false — «внимание».
//   С8  config-edit.php / otkat-config.sh: повторный запуск ничего не меняет и не плодит копий; заданные владельцем значения
//       не переписываются; копия не перезаписывается; битая копия не подменяет рабочий config; config с выражениями не правится;
//       откат возвращает копию и сам сохраняет текущую.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const KEEP = process.argv.includes('--keep');
const BASE = fs.mkdtempSync(path.join(process.env.LINEA_SCRATCH || os.tmpdir(), 'linea-ops-test-'));
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { failN++; console.log('  ✗ ' + m); } };
const sh = (cmd, a, opt = {}) => spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opt });
const has = c => sh('bash', ['-c', `command -v ${c}`]).status === 0;
if (!has('7z') || !has('php')) { console.error('нужны 7z и php'); process.exit(2); }
const sqliteOk = sh('php', ['-r', 'exit(extension_loaded("pdo_sqlite") ? 0 : 1);']).status === 0;
if (!sqliteOk) { console.error('нужен pdo_sqlite'); process.exit(2); }

// ---------- макет Beget: linea-private на SQLite ----------
const ROOT = path.join(BASE, 'beget', 'dizain-studiya-kvartir'), PRIV = path.join(ROOT, 'linea-private');
fs.mkdirSync(path.join(PRIV, 'orders', 'LN-2611-0001'), { recursive: true });
fs.mkdirSync(path.join(PRIV, 'sessions'), { recursive: true });
fs.writeFileSync(path.join(PRIV, 'config.php'), "<?php\nreturn ['mode' => 'manual'];\n");
fs.writeFileSync(path.join(PRIV, 'orders', 'LN-2611-0001', 'brief.json'), JSON.stringify({ t: 'x'.repeat(20000) }));
for (let i = 0; i < 8; i++) fs.writeFileSync(path.join(PRIV, `f${i}.log`), 'журнал '.repeat(2000) + i);
fs.writeFileSync(path.join(PRIV, 'sessions', 's1'), 'sess');
const DB = path.join(PRIV, 'linea.sqlite');
const sql = q => { const r = sh('php', ['-r', '$p = new PDO("sqlite:" . $argv[1]); $p->exec($argv[2]);', DB, q]); if (r.status) throw new Error(r.stderr); };
sql('CREATE TABLE orders (id INTEGER PRIMARY KEY, t TEXT); CREATE TABLE events (id INTEGER PRIMARY KEY, t TEXT);');
const fill = (t, n) => sql(`INSERT INTO ${t} (t) ${Array.from({ length: n }, (_, i) => `SELECT '${'строка'.repeat(30)}${i}'`).join(' UNION ALL ')}`);
fill('orders', 10); fill('events', 40);

// ---------- В4: белый список режимов ----------
console.log('\nВ4 · принудительная команда beget-dump.sh');
const DUMP = path.join(HERE, 'beget-dump.sh');
for (const c of ['id', 'dump; id', 'dump && cat ~/.ssh/authorized_keys', 'bash -i', '$(id)', 'dump\nid']) {
  const r = sh('bash', [DUMP], { env: { ...process.env, SSH_ORIGINAL_COMMAND: c, LINEA_ROOT: ROOT, LINEA_PHP: 'php' } });
  ok(r.status === 64 && r.stdout === '', `«${c.replace('\n', '\\n')}» отвергнута (код ${r.status})`);
}
{
  const r = sh('bash', [DUMP], { env: { ...process.env, SSH_ORIGINAL_COMMAND: ' check ', LINEA_ROOT: ROOT, LINEA_PHP: 'php' } });
  ok(r.status === 0 && /^ok /.test(r.stdout), 'режим check проходит');
  const v = sh('bash', [DUMP], { env: { ...process.env, SSH_ORIGINAL_COMMAND: 'version' } });
  ok(/^beget-dump [0-9a-f]{64}$/m.test(v.stdout), 'режим version отдаёт sha256');
  const keys = fs.readFileSync(path.join(HERE, 'after-beget-up.sh'), 'utf8');
  ok(/command=\\"nice -n 19 bash \$RH\/linea-ops\/beget-dump\.sh\\",no-pty,no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-user-rc,from=/.test(keys), 'after-beget-up.sh ставит ключ с command= и запретами');
}

// ---------- окружение бэкапера ----------
const OPS = path.join(BASE, 'ops'), DRIVE = path.join(BASE, 'drive');
fs.mkdirSync(path.join(OPS, 'secrets'), { recursive: true }); fs.mkdirSync(DRIVE, { recursive: true });
const PW = 'test-pass-' + 'x'.repeat(24);
fs.writeFileSync(path.join(OPS, 'secrets', 'backup.pass'), PW);
const BIN = path.join(BASE, 'bin'); fs.mkdirSync(BIN);
const ARGLOG = path.join(BASE, 'argv.log');
// подставной ssh: как sshd с принудительной командой — последнее слово уходит в SSH_ORIGINAL_COMMAND, запускается beget-dump.sh
fs.writeFileSync(path.join(BIN, 'ssh'), `#!/usr/bin/env bash\nfor a in "$@"; do last="$a"; done\nprintf '%s\\n' "$*" >> "${ARGLOG}"\nSSH_ORIGINAL_COMMAND="$last" LINEA_ROOT="${ROOT}" LINEA_PHP=php exec bash "${DUMP}"\n`, { mode: 0o755 });
// подставной 7z: пишет аргументы (проверка, что пароля в них нет) и зовёт настоящий
const REAL7Z = sh('bash', ['-c', 'command -v 7z']).stdout.trim();
fs.writeFileSync(path.join(BIN, '7z'), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${ARGLOG}"\nexec "${REAL7Z}" "$@"\n`, { mode: 0o755 });
// подставной rclone: gdrive:… → папка DRIVE
fs.writeFileSync(path.join(BIN, 'rclone'), `#!/usr/bin/env bash
m() { printf '%s' "${DRIVE}/\${1#gdrive:}"; }
case "$1" in
  copyto) mkdir -p "$(dirname "$(m "$3")")"; cp "$2" "$(m "$3")";;
  lsf) d="$(m "$2")"; [ -d "$d" ] && ls "$d" | grep -E '^linea-.*\\.7z$' || true;;
  deletefile) rm -f "$(m "$2")";;
  *) echo "rclone-mock: $1?" >&2; exit 1;;
esac
`, { mode: 0o755 });
const writeCfg = extra => fs.writeFileSync(path.join(OPS, 'ops.json'), JSON.stringify({
  ssh: path.join(BIN, 'ssh'), sevenZip: path.join(BIN, '7z'), rclone: path.join(BIN, 'rclone'), gdrive: 'gdrive:LINEA',
  beget: { host: 'mock.beget', user: 'u', root: 'dizain-studiya-kvartir' }, keepDaily: 3, keepWeekly: 2, keepMinGood: 4, backupDropPct: 40, ...extra }));
writeCfg({});
const env = { ...process.env, LINEA_OPS_HOME: OPS };
const bk = (...a) => sh('node', [path.join(HERE, 'bk.mjs'), ...a], { env: { ...env, ...(a.envx || {}) } });
const daily = () => fs.readdirSync(path.join(OPS, 'backups', 'daily')).sort();
const drive = sub => { try { return fs.readdirSync(path.join(DRIVE, 'LINEA', sub)).sort(); } catch { return []; } };
const alerts = () => { try { return fs.readFileSync(path.join(OPS, 'state', 'ALERT.txt'), 'utf8'); } catch { return ''; } };

console.log('\nВ3 · бэкап: удачные копии и ротация по числу');
// на «Диске» заранее лежат очень старые хорошие копии и чужой файл — по возрасту их больше не чистят
fs.mkdirSync(path.join(DRIVE, 'LINEA', 'daily'), { recursive: true });
for (const n of ['linea-20200101-0100.7z', 'linea-20200102-0100.7z']) fs.writeFileSync(path.join(DRIVE, 'LINEA', 'daily', n), 'old');
fs.writeFileSync(path.join(DRIVE, 'LINEA', 'daily', 'чужой.txt'), 'x');
let r = bk('backup', '--at=20261101-0100');
ok(r.status === 0, 'первый бэкап через подставной ssh (принудительная команда) проходит' + (r.status ? ': ' + r.stderr.slice(-400) : ''));
const argl = fs.readFileSync(ARGLOG, 'utf8');
ok(/ u@mock\.beget dump$/m.test(argl) && / u@mock\.beget version$/m.test(argl) && !/bash -s|LINEA_ROOT=/.test(argl), 'к Beget уходит только слово-режим (dump, version), без команды оболочки');
ok(!argl.includes(PW), 'пароль архива не попадает в аргументы 7z/ssh');
const first = path.join(OPS, 'backups', 'daily', 'linea-20261101-0100.7z');
ok(sh(REAL7Z, ['t', '-p', first]).status !== 0 && sh(REAL7Z, ['l', '-p', first]).status !== 0, 'архив без пароля не открывается (имена тоже зашифрованы)');
ok(bk('test').status === 0, 'bk.mjs test: пароль подходит (через stdin)');
{
  const c = spawnSync('node', [path.join(HERE, 'bk.mjs'), 'cat-latest'], { env, maxBuffer: 256 * 1024 * 1024 });
  const tgz = path.join(BASE, 'latest.tgz'); fs.writeFileSync(tgz, c.stdout);
  ok(c.status === 0 && sh('tar', ['-tzf', tgz]).stdout.includes('_dump/manifest.json'), 'cat-latest отдаёт расшифрованный tar.gz');
}
ok(drive('daily').includes('linea-20261101-0100.7z') && drive('daily').includes('linea-20200101-0100.7z'), 'на «Диске»: новая копия есть, старые хорошие не удалены по возрасту');
for (const at of ['20261102-0100', '20261103-0100', '20261104-0100', '20261105-0100']) r = bk('backup', '--at=' + at);
ok(r.status === 0 && daily().length === 4, `локально осталось max(keepDaily=3, keepMinGood=4) = 4: ${daily().join(' ')}`);
ok(drive('daily').filter(n => n.startsWith('linea-')).length === 4 && !drive('daily').includes('linea-20200101-0100.7z') && drive('daily').includes('чужой.txt'),
  'на «Диске» по числу: 4 свежих, старые сверх — удалены, чужой файл не тронут');
const goodDaily = daily(), goodDrive = drive('daily');

console.log('\nВ3 · отказ: пустой и подозрительный дамп');
{
  // driver none: архив без базы
  const t = path.join(BASE, 'none'); fs.mkdirSync(path.join(t, '_dump'), { recursive: true }); fs.mkdirSync(path.join(t, 'linea-private'));
  fs.writeFileSync(path.join(t, '_dump', 'manifest.json'), JSON.stringify({ driver: 'none', tables: {}, sqlite_tables: {} }));
  fs.writeFileSync(path.join(t, 'linea-private', 'config.php'), '<?php return [];'); fs.writeFileSync(path.join(t, 'pad.bin'), crypto.randomBytes(4096));
  sh('tar', ['-czf', path.join(BASE, 'none.tgz'), '-C', t, '_dump', 'linea-private', 'pad.bin'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  r = bk('backup', '--at=20261106-0100', '--from-file=' + path.join(BASE, 'none.tgz'));
  ok(r.status === 1 && /драйвер базы «none»/.test(r.stderr), 'driver none — отказ');
  ok(JSON.stringify(daily()) === JSON.stringify(goodDaily) && JSON.stringify(drive('daily')) === JSON.stringify(goodDrive), 'после отказа хорошие копии (локально и на Диске) на месте');
  // 0 таблиц в SQLite
  fs.writeFileSync(path.join(t, '_dump', 'manifest.json'), JSON.stringify({ driver: 'sqlite', tables: {}, sqlite_tables: {} }));
  fs.writeFileSync(path.join(t, '_dump', 'linea.sqlite'), '');
  sh('tar', ['-czf', path.join(BASE, 'none.tgz'), '-C', t, '_dump', 'linea-private', 'pad.bin'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  r = bk('backup', '--at=20261106-0101', '--from-file=' + path.join(BASE, 'none.tgz'));
  ok(r.status === 1 && /0 таблиц/.test(r.stderr), '0 таблиц — отказ');
}
sql('DELETE FROM orders');   // «база обнулилась»
const alertsBefore = alerts().length;
r = bk('backup', '--at=20261107-0100');
ok(r.status === 1 && /подозрительна/.test(r.stderr) && /заказов: было 10, стало 0/.test(r.stderr), 'заказов стало 0 — копия отвергнута');
ok(fs.readdirSync(path.join(OPS, 'backups', 'suspect')).includes('linea-20261107-0100.7z'), 'подозрительная копия сохранена отдельно (backups/suspect)');
ok(JSON.stringify(daily()) === JSON.stringify(goodDaily) && JSON.stringify(drive('daily')) === JSON.stringify(goodDrive), 'хорошие копии не вытеснены, на Диск подозрительная не ушла');
ok(alerts().length > alertsBefore && /бэкап отвергнут/.test(alerts().slice(alertsBefore)), 'сигнал «бэкап отвергнут» в ALERT.txt');
r = bk('backup', '--at=20261108-0100');
ok(r.status === 1 && JSON.stringify(daily()) === JSON.stringify(goodDaily), 'на следующий день то же: без решения человека хорошие не вытесняются');
const a2 = alerts().length; r = bk('backup', '--at=20261108-0200');
ok(alerts().length > a2, 'сигнал повторяется при каждом отказе (не только первом)');
fill('orders', 10); sql('DELETE FROM events WHERE id > 5');   // строк: 50 → 15 (−70 %)
r = bk('backup', '--at=20261109-0100');
ok(r.status === 1 && /строк в базе/.test(r.stderr), 'строк меньше на 70 % — отвергнута');
r = bk('backup', '--at=20261109-0200', '--accept-drop');
ok(r.status === 0 && daily().includes('linea-20261109-0200.7z'), '--accept-drop: законное падение принято вручную');
r = bk('backup', '--at=20261109-0300');
ok(r.status === 0, 'после принятия новая база — точка отсчёта, следующий прогон проходит');

console.log('\nНизкие · пропущенные большие файлы');
fs.writeFileSync(path.join(PRIV, 'orders', 'LN-2611-0001', 'big.bin'), Buffer.alloc(1100 * 1024, 1));
{
  const e2 = { ...env, LINEA_BK_MAXMB: '1' };
  const a3 = alerts().length;
  r = sh('node', [path.join(HERE, 'bk.mjs'), 'backup', '--at=20261110-0100'], { env: e2 });
  const last = JSON.parse(fs.readFileSync(path.join(OPS, 'state', 'backup-last.json'), 'utf8'));
  ok(r.status === 0 && (last.warnings || []).some(w => /пропущены большие файлы/.test(w)), 'большой файл пропущен — предупреждение в backup-last.json');
  ok(/с замечаниями/.test(alerts().slice(a3)), 'и сигнал «бэкап прошёл с замечаниями»');
}

// ---------- С7: монитор ----------
console.log('\nС7 · монитор: токен в заголовке, возраст cron');
{
  const TOKEN = 'm'.repeat(40); let seen = [];
  let cronLast = null;
  const srv = http.createServer((q, s) => {
    seen.push({ url: q.url, tok: q.headers['x-monitor-token'] || null });
    if (q.url.startsWith('/api/ping.php')) {
      const base = { ok: true, private: true, config: true };
      if (!q.headers['x-monitor-token']) return s.end(JSON.stringify(base));
      if (q.headers['x-monitor-token'] !== TOKEN) { s.statusCode = 403; return s.end('{}'); }
      return s.end(JSON.stringify({ ...base, cron_last: cronLast, db: { schema: 9 } }));
    }
    s.end('<html></html>');
  });
  await new Promise(res => srv.listen(0, '127.0.0.1', res));
  const port = srv.address().port;
  const MON = path.join(BASE, 'mon'); fs.mkdirSync(path.join(MON, 'secrets'), { recursive: true });
  const mcfg = x => fs.writeFileSync(path.join(MON, 'ops.json'), JSON.stringify({ site: `http://127.0.0.1:${port}`, domain: 'localhost', disable: ['dns', 'ssl'], failConfirmRuns: 1, ...x }));
  const runMon = () => new Promise(res => { const ch = spawn('node', [path.join(HERE, 'monitor.mjs')], { env: { ...process.env, LINEA_OPS_HOME: MON } }); ch.on('close', () => res(JSON.parse(fs.readFileSync(path.join(MON, 'state', 'monitor.json'), 'utf8')).checks)); });
  mcfg({ expectBackup: false });
  let c = await runMon();
  ok(c.cron.confirmed === 'warn' && /токен мониторинга не задан/.test(c.cron.detail), 'без токена — «внимание», а не тишина');
  ok(c.backup.confirmed === 'warn' && /не настроен/.test(c.backup.detail), 'expectBackup=false — «внимание: бэкап не настроен»');
  fs.writeFileSync(path.join(MON, 'secrets', 'monitor.token'), TOKEN + '\n');
  const msk = d => new Date(d + 3 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
  cronLast = msk(Date.now() - 10 * 60e3) + ' {"ok":1}';
  seen = []; c = await runMon();
  ok(c.cron.confirmed === 'ok', 'cron 10 мин назад — ok: ' + c.cron.detail);
  ok(seen.some(s => s.tok === TOKEN) && !seen.some(s => /token=/.test(s.url) || s.url.includes(TOKEN)), 'токен ушёл только заголовком, в адресе его нет');
  cronLast = msk(Date.now() - 50 * 60e3);
  c = await runMon();
  ok(c.cron.confirmed === 'fail' && /50 мин/.test(c.cron.detail), 'cron 50 мин назад — сбой');
  cronLast = null; c = await runMon();
  ok(c.cron.confirmed === 'fail', 'cron не работал ни разу — сбой');
  fs.writeFileSync(path.join(MON, 'secrets', 'monitor.token'), 'w'.repeat(40));
  c = await runMon();
  ok(c.cron.confirmed === 'fail' && /не принял токен/.test(c.cron.detail), 'чужой токен — сбой «не принял токен»');
  mcfg({});   // expectBackup по умолчанию true
  c = await runMon();
  ok(c.backup.confirmed === 'fail', 'expectBackup по умолчанию true: нет бэкапа — сбой');
  srv.close();
}

// ---------- С8: config-edit / otkat ----------
console.log('\nС8 · правка и откат config.php');
{
  const D = path.join(BASE, 'cfg'); fs.mkdirSync(D);
  const F = path.join(D, 'config.php');
  const ORIG = "<?php\nreturn ['mode' => 'manual', 'brig_mail_enabled' => false, 'admin_emails' => ['owner@x.ru', 'second@x.ru'], 'notify_enabled' => false, 'db_pass' => 'p\\'q'];\n";
  fs.writeFileSync(F, ORIG);
  const ce = (...a) => sh('php', [path.join(REPO, 'tools', 'config-edit.php'), '--dir=' + D, ...a]);
  const load = () => JSON.parse(sh('php', ['-r', 'echo json_encode(require $argv[1]);', F]).stdout);
  const baks = () => fs.readdirSync(D).filter(n => n.startsWith('config.php.bak-')).sort();
  const SPEC = JSON.stringify({ brig_mail_enabled: true, admin_emails: { if_empty: ['admin@x.ru'] }, notify_enabled: true, admin_2fa: false,
    base: { if_empty: 'https://example.test' }, monitor_token: { if_short: 24, random_hex: 24 } });
  r = ce('defaults', SPEC);
  let c = load();
  ok(r.status === 0 && c.brig_mail_enabled === false && c.notify_enabled === false && c.admin_emails.length === 2, 'заданные владельцем значения (письма выключены, свои адреса) не переписаны');
  ok(c.admin_2fa === false && c.base === 'https://example.test' && c.monitor_token.length === 48 && c.db_pass === "p'q", 'незаданные ключи добавлены, остальное цело');
  ok(baks().length === 1, 'одна копия перед правкой');
  const tok = c.monitor_token;
  r = ce('defaults', SPEC);
  ok(/без изменений/.test(r.stdout) && baks().length === 1 && load().monitor_token === tok, 'повторный запуск: без изменений, новой копии нет, токен прежний');
  ok(!r.stdout.includes(tok) && !ce('list').stdout.includes(tok), 'значения (токен) не печатаются');
  // копия не перезаписывается: две правки в одну секунду
  const b0 = baks();
  ce('add-proxy', '10.0.0.1'); ce('add-proxy', '10.0.0.2');
  ok(baks().length === b0.length + 2 && fs.readFileSync(path.join(D, b0[0]), 'utf8') === ORIG, 'копии не затирают друг друга, исходная цела');
  ok(ce('add-proxy', '10.0.0.2').stdout.includes('без изменений'), 'add-proxy повторно — без изменений');
  ok(ce('add-proxy', '1.2.3.4; rm -rf /').status !== 0, 'add-proxy: не IP — отказ');
  // битая копия не подменяет рабочий config
  const before = fs.readFileSync(F, 'utf8');
  fs.writeFileSync(path.join(D, 'config.php.bak-20990101-000000'), '<?php return [ broken');
  r = ce('rollback', '--file=config.php.bak-20990101-000000');
  ok(r.status === 5 && fs.readFileSync(F, 'utf8') === before, 'битая копия: отказ, рабочий config не тронут');
  fs.writeFileSync(path.join(D, 'config.php.bak-20990101-000000'), '<?php return "строка";');
  r = ce('rollback', '--file=config.php.bak-20990101-000000');
  ok(r.status === 5 && fs.readFileSync(F, 'utf8') === before, 'копия, которая не возвращает массив: отказ');
  fs.unlinkSync(path.join(D, 'config.php.bak-20990101-000000'));
  ok(!fs.readdirSync(D).some(n => n.startsWith('.config.php.tmp')), 'временных файлов не осталось');
  // откат через otkat-config.sh
  const ot = (...a) => sh('bash', [path.join(REPO, 'tools', 'otkat-config.sh'), ...a], { env: { ...process.env, LINEA_CFG_DIR: D } });
  r = ot('--dry');
  ok(r.status === 0 && fs.readFileSync(F, 'utf8') === before, 'otkat --dry ничего не меняет');
  ok(ot('--list').stdout.split('\n').filter(Boolean).length === baks().length, 'otkat --list показывает все копии');
  r = ot();
  ok(r.status === 0 && load().trusted_proxies.includes('10.0.0.1') && !load().trusted_proxies.includes('10.0.0.2'), 'otkat вернул последнюю копию (до последней правки)');
  ok(baks().some(n => n.includes('-before-otkat')), 'текущий config перед откатом сохранён копией -before-otkat');
  r = ot(); r = ot();
  ok(fs.readFileSync(F, 'utf8') === ORIG, 'повторные откаты идут дальше назад до исходного (копии -before-otkat пропускаются)');
  ok(ot('--file=../../etc/passwd').status === 2, 'otkat: чужой путь в --file — отказ');
  // config с выражениями не переписывается
  fs.writeFileSync(F, "<?php\nreturn ['mode' => 'manual', 'db_pass' => getenv('DB_PASS')];\n");
  const exprSrc = fs.readFileSync(F, 'utf8');
  r = ce('defaults', SPEC);
  ok(r.status === 6 && fs.readFileSync(F, 'utf8') === exprSrc && /getenv/.test(r.stderr), 'config с getenv(): правка отказана, файл не тронут');
  // vykladka: правка только через config-edit, STAMP до секунд, токен не в аргументах curl
  const vk = fs.readFileSync(path.join(REPO, 'tools', 'vykladka-kabinety.sh'), 'utf8');
  ok(!/file_put_contents/.test(vk) && /config-edit\.php/.test(vk) && /%H%M%S/.test(vk), 'vykladka: config только через config-edit.php, метка до секунд');
  ok(!/-H "X-Monitor-Token: \$MON"/.test(vk) && /-H @-/.test(vk), 'vykladka: токен мониторинга не в аргументах curl');
}

console.log(`\nИтог: ${pass} ✓ / ${failN} ✗`);
if (!KEEP) fs.rmSync(BASE, { recursive: true, force: true }); else console.log('папка: ' + BASE);
process.exit(failN ? 1 : 0);
