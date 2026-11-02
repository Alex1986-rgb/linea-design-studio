#!/usr/bin/env node
// LINEA · ночной бэкап боевых данных (работает на SmartApe по Планировщику Windows; на маке — только макет).
//
//   node bk.mjs backup [--from-file=<tgz>] [--local-root=<папка>] [--no-upload] [--at=ГГГГММДД-ЧЧММ]
//   node bk.mjs test [файл.7z]        проверка целостности и пароля последнего (или указанного) архива
//   node bk.mjs cat-latest            расшифровать последний архив в stdout (tar.gz) — для restore-check.sh
//   node bk.mjs status                что лежит, когда был последний удачный
//
// Источник данных: ssh <beget> 'nice -n 19 bash -s' < beget-dump.sh  → один поток tar.gz (дамп MySQL + linea-private).
//   --from-file   взять готовый tar.gz (проверка на макете, без Beget)
//   --local-root  прогнать beget-dump.sh локально с LINEA_ROOT=<папка> (макет на маке)
// Шифрование: 7-Zip AES-256 с шифрованием имён (-mhe=on), пароль — secrets/backup.pass. Открывается обычным 7-Zip.
// Хранение: backups/daily — 14 последних, backups/weekly — 8 (раз в 7 дней копия суточного). Копия — rclone в gdrive:LINEA/Бэкапы/{daily,weekly},
// там чистятся только наши файлы linea-*.7z старше срока. Публичные ссылки не создаются.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OPS_HOME, P, IS_WIN, cfg, stamp, logger, readJson, writeJson, notify } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const log = logger('backup');
const C = cfg();
const args = Object.fromEntries(process.argv.slice(3).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : ['_', a]; }));
const NAME_RE = /^linea-\d{8}-\d{4}\.7z$/;
const DAILY = path.join(P.backups, 'daily'), WEEKLY = path.join(P.backups, 'weekly');
fs.mkdirSync(DAILY, { recursive: true }); fs.mkdirSync(WEEKLY, { recursive: true });

const SEVENZIP = C.sevenZip || (IS_WIN ? 'C:\\Program Files\\7-Zip\\7z.exe' : '7z');
const RCLONE = C.rclone || (IS_WIN ? 'C:\\tools\\rclone\\rclone.exe' : 'rclone');
const RCLONE_CONF = C.rcloneConfig || (IS_WIN ? 'C:\\Windows\\System32\\config\\systemprofile\\AppData\\Roaming\\rclone\\rclone.conf' : '');
const SSH = C.ssh || (IS_WIN ? 'C:\\Windows\\System32\\OpenSSH\\ssh.exe' : 'ssh');
const TAR = IS_WIN ? 'C:\\Windows\\System32\\tar.exe' : 'tar';

function password() {
  const f = path.join(P.secrets, 'backup.pass');
  const p = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
  if (p.length < 20) throw new Error(`нет пароля шифрования ${f} (создаёт install-smartape.sh)`);
  return p;
}
function run(cmd, a, opt = {}) {
  const r = spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true, ...opt });
  if (r.error) throw new Error(`${path.basename(cmd)}: ${r.error.message}`);
  return r;
}
const rcloneArgs = a => (RCLONE_CONF && fs.existsSync(RCLONE_CONF) ? ['--config', RCLONE_CONF] : []).concat(a);
const list = dir => fs.readdirSync(dir).filter(f => NAME_RE.test(f)).sort();
const latest = () => { const all = [...list(DAILY).map(f => path.join(DAILY, f)), ...list(WEEKLY).map(f => path.join(WEEKLY, f))]; all.sort((a, b) => path.basename(a).localeCompare(path.basename(b))); return all.at(-1); };

/** Поток tar.gz от источника → файл. */
function fetchDump(out) {
  return new Promise((resolve, reject) => {
    let cmd, a, env = process.env, input = null;
    if (args['from-file']) { fs.copyFileSync(args['from-file'], out); return resolve('файл ' + path.basename(args['from-file'])); }
    const script = fs.readFileSync(path.join(HERE, 'beget-dump.sh'));
    if (args['local-root']) {
      cmd = 'bash'; a = ['-s']; env = { ...process.env, LINEA_ROOT: path.resolve(args['local-root']), LINEA_PHP: C.localPhp || 'php' };
    } else {
      const b = C.beget;
      const key = path.join(P.secrets, 'beget_ed25519'), kh = path.join(P.secrets, 'known_hosts');
      cmd = SSH;
      a = ['-i', key, '-o', `UserKnownHostsFile=${kh}`, '-o', 'StrictHostKeyChecking=yes', '-o', 'BatchMode=yes',
           '-o', 'ConnectTimeout=30', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=6'];
      if (b.ip) a.push('-o', `HostName=${b.ip}`, '-o', `HostKeyAlias=${b.host}`);   // DNS Beget лежит — по IP, ключ хоста сверяется по имени
      a.push(`${b.user}@${b.host}`, `LINEA_ROOT="$HOME/${b.root}" nice -n 19 bash -s`);
    }
    input = script;
    const ch = spawn(cmd, a, { env, windowsHide: true });
    const ws = fs.createWriteStream(out);
    ch.stdout.pipe(ws);
    let err = '';
    ch.stderr.on('data', d => { err += d; for (const l of String(d).split(/\r?\n/)) if (l.trim()) log('  ' + l.trim()); });
    ch.on('error', reject);
    ch.stdin.end(input);
    const timer = setTimeout(() => { ch.kill(); reject(new Error('источник не ответил за 60 минут')); }, 60 * 60 * 1000);
    const written = new Promise(r => ws.on('close', r));
    ch.on('close', async code => {
      clearTimeout(timer);
      await written;
      if (code === 0) resolve(args['local-root'] ? 'локальный beget-dump.sh' : `ssh ${C.beget.user}@${C.beget.host}`);
      else reject(new Error(`источник завершился с кодом ${code}: ${err.trim().split('\n').slice(-3).join(' / ').slice(0, 400)}`));
    });
  });
}

function checkTgz(f) {
  const st = fs.statSync(f);
  if (st.size < 1024) throw new Error(`архив подозрительно мал: ${st.size} байт`);
  const t = run(TAR, ['-tzf', f]);
  if (t.status !== 0) throw new Error('tar.gz битый: ' + (t.stderr || '').slice(0, 300));
  const names = t.stdout.split(/\r?\n/).filter(Boolean);
  const m = run(TAR, ['-xzOf', f, '_dump/manifest.json']);
  if (m.status !== 0) throw new Error('в архиве нет _dump/manifest.json');
  const man = JSON.parse(m.stdout);
  if (!names.some(n => n.endsWith('linea-private/config.php'))) throw new Error('в архиве нет linea-private/config.php');
  if (man.driver === 'mysql' && !names.includes('_dump/mysql.sql')) throw new Error('драйвер mysql, а дампа нет');
  if (man.driver === 'mysql' && !Object.keys(man.tables || {}).length) throw new Error('в базе 0 таблиц — дамп не годится');
  const tables = man.driver === 'sqlite' ? man.sqlite_tables : man.tables;
  return { bytes: st.size, files: names.filter(n => n.startsWith('linea-private/')).length, driver: man.driver, method: man.method,
           tables: Object.keys(tables || {}).length, rows: Object.values(tables || {}).reduce((s, n) => s + n, 0), orders: (tables || {}).orders ?? null };
}

function encrypt(tgz, out) {
  const pw = password();
  if (fs.existsSync(out)) fs.unlinkSync(out);
  // -mx=1: tar.gz уже сжат; -mhe=on: имена файлов внутри тоже зашифрованы
  let r = run(SEVENZIP, ['a', '-t7z', '-mx=1', '-mhe=on', `-p${pw}`, '-bso0', '-bsp0', out, tgz]);
  if (r.status !== 0) throw new Error('7z a: код ' + r.status + ' ' + (r.stderr || '').slice(0, 300));
  r = run(SEVENZIP, ['t', `-p${pw}`, '-bso0', '-bsp0', out]);
  if (r.status !== 0) throw new Error('7z t после шифрования: код ' + r.status);
}

function rotate(dir, keep) {
  const f = list(dir); const del = f.slice(0, Math.max(0, f.length - keep));
  for (const x of del) fs.unlinkSync(path.join(dir, x));
  return del;
}

function upload(file, sub) {
  if (args['no-upload'] || !C.gdrive) return 'выключено';
  const dst = `${C.gdrive}/${sub}`;
  let r = run(RCLONE, rcloneArgs(['copyto', file, `${dst}/${path.basename(file)}`, '--retries', '3', '--low-level-retries', '5']), { timeout: 30 * 60 * 1000 });
  if (r.status !== 0) throw new Error('rclone copyto: ' + (r.stderr || '').trim().split('\n').slice(-2).join(' / ').slice(0, 300));
  // срок на Диске: только наши linea-*.7z; ничего другого rclone delete не трогает
  const age = sub === 'weekly' ? `${C.keepWeekly * 7 + 3}d` : `${C.keepDaily + 1}d`;
  r = run(RCLONE, rcloneArgs(['delete', dst, '--min-age', age, '--include', 'linea-*.7z']), { timeout: 10 * 60 * 1000 });
  return r.status === 0 ? 'ok' : 'загружен; чистка старых не прошла';
}

async function backup() {
  const lock = path.join(P.state, 'backup.lock');
  if (fs.existsSync(lock) && Date.now() - fs.statSync(lock).mtimeMs < 3 * 3600e3) { log('уже идёт другой прогон — выхожу'); return 0; }
  fs.writeFileSync(lock, String(process.pid));
  const at = args.at || stamp();
  const name = `linea-${at}`;
  const tgz = path.join(P.work, name + '.tgz'), out7 = path.join(P.work, name + '.7z');
  const res = { ok: false, at: new Date().toISOString(), name: name + '.7z' };
  try {
    password();   // нет пароля — не тянем данные вовсе
    log(`== бэкап ${name}`);
    res.source = await fetchDump(tgz);
    Object.assign(res, checkTgz(tgz));
    log(`получено: ${(res.bytes / 1048576).toFixed(1)} МБ, файлов ${res.files}, база ${res.driver}/${res.method}, таблиц ${res.tables}, строк ${res.rows}`);
    encrypt(tgz, out7);
    fs.unlinkSync(tgz);
    const daily = path.join(DAILY, name + '.7z');
    fs.renameSync(out7, daily);
    res.bytes7z = fs.statSync(daily).size;
    // недельная копия: если последней недельной больше 6,5 суток (или её нет)
    const w = list(WEEKLY).at(-1);
    const wAge = w ? (Date.now() - fs.statSync(path.join(WEEKLY, w)).mtimeMs) / 86400e3 : Infinity;
    if (wAge > 6.5 || args.weekly) { fs.copyFileSync(daily, path.join(WEEKLY, name + '.7z')); res.weekly = true; }
    res.rotated = [...rotate(DAILY, C.keepDaily), ...rotate(WEEKLY, C.keepWeekly)];
    res.upload = upload(daily, 'daily');
    if (res.weekly) res.uploadWeekly = upload(path.join(WEEKLY, name + '.7z'), 'weekly');
    res.ok = true;
    log(`готово: ${res.name} (${(res.bytes7z / 1048576).toFixed(1)} МБ), Диск: ${res.upload}${res.weekly ? ', недельная копия' : ''}; удалено старых: ${res.rotated.length}`);
    writeJson(path.join(P.state, 'backup-last-ok.json'), res);
  } catch (e) {
    res.error = e.message;
    log('ОШИБКА: ' + e.message);
    for (const f of [tgz, out7]) try { fs.unlinkSync(f); } catch { }
    const prev = readJson(path.join(P.state, 'backup-last.json'), {});
    if (prev.ok !== false || args['notify-always']) await notify('бэкап не прошёл', `${name}: ${e.message}\nПоследний удачный: ${readJson(path.join(P.state, 'backup-last-ok.json'), {}).at || 'не было'}`);
  } finally {
    writeJson(path.join(P.state, 'backup-last.json'), res);
    try { fs.unlinkSync(lock); } catch { }
  }
  if (res.ok) { const prev = readJson(path.join(P.state, 'backup-prev-state.json'), {}); if (prev.ok === false) await notify('бэкап снова проходит', res.name, { ok: true }); }
  writeJson(path.join(P.state, 'backup-prev-state.json'), { ok: res.ok, at: res.at });
  return res.ok ? 0 : 1;
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'backup') process.exitCode = await backup();
  else if (cmd === 'test') {
    const f = args._ || latest(); if (!f) { console.error('архивов нет'); process.exitCode = 1; return; }
    const r = run(SEVENZIP, ['t', `-p${password()}`, '-bso0', '-bsp0', f]);
    console.log(`${path.basename(f)}: ${r.status === 0 ? 'целый, пароль подходит' : 'ОШИБКА 7z код ' + r.status}`); process.exitCode = r.status === 0 ? 0 : 1;
  } else if (cmd === 'cat-latest') {
    const f = latest(); if (!f) { console.error('архивов нет'); process.exitCode = 1; return; }
    console.error('архив: ' + path.basename(f));
    const ch = spawn(SEVENZIP, ['e', '-so', `-p${password()}`, f], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    ch.stdout.pipe(process.stdout);
    ch.on('close', c => { process.exitCode = c; });
  } else if (cmd === 'status') {
    const ok = readJson(path.join(P.state, 'backup-last-ok.json'), null), last = readJson(path.join(P.state, 'backup-last.json'), null);
    console.log(JSON.stringify({ home: OPS_HOME, lastOk: ok && { at: ok.at, name: ok.name, mb: +(ok.bytes7z / 1048576).toFixed(2), rows: ok.rows, files: ok.files, upload: ok.upload },
      last: last && { at: last.at, ok: last.ok, error: last.error }, daily: list(DAILY), weekly: list(WEEKLY) }, null, 2));
  } else { console.error('команды: backup | test [файл] | cat-latest | status'); process.exitCode = 2; }
}
main().catch(e => { log('сбой: ' + e.stack); process.exitCode = 1; });
