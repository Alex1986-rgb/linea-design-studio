#!/usr/bin/env node
// LINEA · ночной бэкап боевых данных (работает на SmartApe по Планировщику Windows; на маке — только макет).
//
//   node bk.mjs backup [--from-file=<tgz>] [--local-root=<папка>] [--no-upload] [--at=ГГГГММДД-ЧЧММ] [--accept-drop]
//   node bk.mjs test [файл.7z]        проверка целостности и пароля последнего (или указанного) архива
//   node bk.mjs cat-latest            расшифровать последний архив в stdout (tar.gz) — для restore-check.sh
//   node bk.mjs status                что лежит, когда был последний удачный
//
// Источник данных: ssh <beget> dump → один поток tar.gz (дамп MySQL + linea-private). Ключ SmartApe на Beget ограничен
//   ПРИНУДИТЕЛЬНОЙ командой ~/linea-ops/beget-dump.sh (after-beget-up.sh): слово после хоста — только режим из белого списка
//   (dump | check | version), произвольную команду через этот ключ выполнить нельзя. Перед дампом сверяется sha256
//   скрипта на Beget с нашим beget-dump.sh — расхождение даёт предупреждение (обновить: after-beget-up.sh --only-script).
//   --from-file   взять готовый tar.gz (проверка на макете, без Beget)
//   --local-root  прогнать beget-dump.sh локально с LINEA_ROOT=<папка> (макет на маке)
// Проверка копии ДО сохранения (ревью 02.11, В3): драйвер базы none, 0 таблиц, нет config.php — отказ; падение числа строк,
//   заказов или размера более чем на backupDropPct % (ops.json, по умолчанию 40) к последней удачной копии — копия
//   «подозрительная»: шифруется в backups/suspect (3 последних), в daily/weekly и на Диск НЕ попадает, хорошие не вытесняет,
//   уходит сигнал. Падение законное (удалили тестовые заказы) — один прогон с --accept-drop.
// Шифрование: 7-Zip AES-256 с шифрованием имён (-mhe=on), пароль — secrets/backup.pass; в 7z он уходит через stdin, не в командной
// строке (её видят администраторы SmartApe). Открывается обычным 7-Zip.
// Хранение: backups/daily — 14 последних, backups/weekly — 8 (раз в 7 дней копия суточного). Копия — rclone в gdrive:LINEA/Бэкапы/{daily,weekly}.
// Ротация везде ПО ЧИСЛУ, не по возрасту: удаляются только наши linea-*.7z сверх max(keep, keepMinGood) самых свежих —
// если бэкап перестал проходить, старые хорошие копии остаются сколько угодно долго. Публичные ссылки не создаются.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { OPS_HOME, P, IS_WIN, cfg, stamp, logger, readJson, writeJson, notify } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const log = logger('backup');
const C = cfg();
const args = Object.fromEntries(process.argv.slice(3).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : ['_', a]; }));
const NAME_RE = /^linea-\d{8}-\d{4}\.7z$/;
const DAILY = path.join(P.backups, 'daily'), WEEKLY = path.join(P.backups, 'weekly'), SUSPECT = path.join(P.backups, 'suspect');
for (const d of [DAILY, WEEKLY, SUSPECT]) fs.mkdirSync(d, { recursive: true });
const KEEP_MIN_GOOD = Math.max(1, +C.keepMinGood || 7);
const DROP_PCT = +C.backupDropPct > 0 ? +C.backupDropPct : 40;

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
const pwIn = (n = 1) => Array(n).fill(password()).join('\n') + '\n';   // 7z: «a -p» спрашивает пароль и подтверждение, «t»/«e» без -p — один раз
function run(cmd, a, opt = {}) {
  const r = spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true, ...opt });
  if (r.error) throw new Error(`${path.basename(cmd)}: ${r.error.message}`);
  return r;
}
const rcloneArgs = a => (RCLONE_CONF && fs.existsSync(RCLONE_CONF) ? ['--config', RCLONE_CONF] : []).concat(a);
const list = dir => fs.readdirSync(dir).filter(f => NAME_RE.test(f)).sort();
const latest = () => { const all = [...list(DAILY).map(f => path.join(DAILY, f)), ...list(WEEKLY).map(f => path.join(WEEKLY, f))]; all.sort((a, b) => path.basename(a).localeCompare(path.basename(b))); return all.at(-1); };

/** Команда до источника: ssh с режимом (на Beget его принимает принудительная команда ключа) или локальный beget-dump.sh. */
function source(mode) {
  if (args['local-root']) return { cmd: 'bash', a: [path.join(HERE, 'beget-dump.sh'), mode], env: { ...process.env, LINEA_ROOT: path.resolve(args['local-root']), LINEA_PHP: C.localPhp || 'php' } };
  const b = C.beget;
  const key = path.join(P.secrets, 'beget_ed25519'), kh = path.join(P.secrets, 'known_hosts');
  const a = ['-i', key, '-o', `UserKnownHostsFile=${kh}`, '-o', 'StrictHostKeyChecking=yes', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
       '-o', 'ConnectTimeout=30', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=6', '-T'];
  if (b.ip) a.push('-o', `HostName=${b.ip}`, '-o', `HostKeyAlias=${b.host}`);   // DNS Beget лежит — по IP, ключ хоста сверяется по имени
  a.push(`${b.user}@${b.host}`, mode);   // только слово-режим: остальное отвергнет beget-dump.sh на сервере
  return { cmd: SSH, a, env: process.env };
}
function sha256(f) { return createHash('sha256').update(fs.readFileSync(f)).digest('hex'); }
/** Сверка версии скрипта на Beget с нашим: расхождение — предупреждение, не отказ. */
function checkRemoteVersion() {
  if (args['from-file'] || args['local-root']) return null;
  const s = source('version');
  const r = spawnSync(s.cmd, s.a, { env: s.env, encoding: 'utf8', timeout: 60000, windowsHide: true });
  const m = (r.stdout || '').match(/beget-dump ([0-9a-f]{64})/);
  if (r.status !== 0 || !m) return `версию beget-dump.sh на Beget узнать не удалось (код ${r.status}) — ключ без принудительной команды или скрипт не выложен`;
  return m[1] === sha256(path.join(HERE, 'beget-dump.sh')) ? null : 'beget-dump.sh на Beget отличается от версии в репозитории — обновить: tools/ops/after-beget-up.sh --only-script';
}

/** Поток tar.gz от источника → файл. */
function fetchDump(out) {
  return new Promise((resolve, reject) => {
    if (args['from-file']) { fs.copyFileSync(args['from-file'], out); return resolve('файл ' + path.basename(args['from-file'])); }
    const { cmd, a, env } = source('dump');
    const ch = spawn(cmd, a, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const ws = fs.createWriteStream(out);
    ch.stdout.pipe(ws);
    let err = '';
    ch.stderr.on('data', d => { err += d; for (const l of String(d).split(/\r?\n/)) if (l.trim()) log('  ' + l.trim()); });
    ch.on('error', reject);
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
  let man; try { man = JSON.parse(m.stdout); } catch { throw new Error('manifest.json не читается'); }
  if (!names.some(n => n.endsWith('linea-private/config.php'))) throw new Error('в архиве нет linea-private/config.php');
  if (man.driver !== 'mysql' && man.driver !== 'sqlite') throw new Error(`драйвер базы «${man.driver}» — ни MySQL, ни SQLite не найдены, база в копию не попала`);
  if (man.driver === 'mysql' && !names.includes('_dump/mysql.sql')) throw new Error('драйвер mysql, а дампа нет');
  if (man.driver === 'sqlite' && !names.includes('_dump/linea.sqlite')) throw new Error('драйвер sqlite, а копии базы нет');
  const tables = man.driver === 'sqlite' ? man.sqlite_tables : man.tables;
  if (!Object.keys(tables || {}).length) throw new Error('в базе 0 таблиц — дамп не годится');
  const big = run(TAR, ['-xzOf', f, '_dump/skipped-big.txt']);
  const skippedBig = big.status === 0 ? big.stdout.split(/\r?\n/).filter(Boolean) : [];
  return { bytes: st.size, files: names.filter(n => n.startsWith('linea-private/')).length, driver: man.driver, method: man.method,
           tables: Object.keys(tables || {}).length, rows: Object.values(tables || {}).reduce((s, n) => s + n, 0), orders: (tables || {}).orders ?? null,
           skippedBig };
}

/** Сверка с последней удачной копией: резкое падение строк, заказов или размера — копия подозрительна. */
function compareWithPrev(cur, prev, pct = DROP_PCT) {
  if (!prev || !prev.ok) return [];
  const why = [];
  const drop = (a, b) => (b > 0 ? (b - a) / b * 100 : 0);
  for (const [k, title, minBase] of [['orders', 'заказов', 1], ['rows', 'строк в базе', 20], ['bytes', 'размер дампа', 4096], ['files', 'файлов linea-private', 5]]) {
    const a = cur[k], b = prev[k];
    if (typeof a !== 'number' || typeof b !== 'number' || b <= 0) continue;
    if (a === 0) why.push(`${title}: было ${b}, стало 0`);
    else if (b >= minBase && drop(a, b) > pct) why.push(`${title}: было ${b}, стало ${a} (−${drop(a, b).toFixed(0)} %, порог ${pct} %)`);
  }
  if (prev.tables > 0 && cur.tables < prev.tables) why.push(`таблиц: было ${prev.tables}, стало ${cur.tables}`);
  return why;
}

function encrypt(tgz, out) {
  if (fs.existsSync(out)) fs.unlinkSync(out);
  // -mx=1: tar.gz уже сжат; -mhe=on: имена файлов внутри тоже зашифрованы; «-p» без значения — пароль из stdin (дважды: ввод и подтверждение)
  let r = run(SEVENZIP, ['a', '-t7z', '-mx=1', '-mhe=on', '-p', '-bso0', '-bsp0', out, tgz], { input: pwIn(2) });
  if (r.status !== 0) throw new Error('7z a: код ' + r.status + ' ' + (r.stderr || '').slice(0, 300));
  r = test7z(out);
  if (r.status !== 0) throw new Error('7z t после шифрования: код ' + r.status);
}
/** 7z t: без -p пароль спрашивается и читается из stdin. Нешифрованный архив вопроса не задаст — поэтому проверяем и заголовок. */
function test7z(f) {
  const r = run(SEVENZIP, ['t', '-bso0', '-bsp0', f], { input: pwIn(1) });
  if (r.status === 0) { const l = run(SEVENZIP, ['l', '-slt', '-p', f]); if (l.status === 0) return { status: 99, stderr: 'архив открывается без пароля' }; }
  return r;
}

/** Ротация по числу: удаляются только самые старые сверх max(keep, keepMinGood). Возраст не учитывается. */
function rotate(dir, keep) {
  const f = list(dir); const del = f.slice(0, Math.max(0, f.length - Math.max(keep, KEEP_MIN_GOOD)));
  for (const x of del) fs.unlinkSync(path.join(dir, x));
  return del;
}

function upload(file, sub) {
  if (args['no-upload'] || !C.gdrive) return 'выключено';
  const dst = `${C.gdrive}/${sub}`;
  let r = run(RCLONE, rcloneArgs(['copyto', file, `${dst}/${path.basename(file)}`, '--retries', '3', '--low-level-retries', '5']), { timeout: 30 * 60 * 1000 });
  if (r.status !== 0) throw new Error('rclone copyto: ' + (r.stderr || '').trim().split('\n').slice(-2).join(' / ').slice(0, 300));
  // чистка на Диске ПО ЧИСЛУ: оставляем max(keep, keepMinGood) самых свежих наших linea-*.7z (на Диск попадают только
  // прошедшие проверку копии). Список не прочитан — ничего не удаляем.
  const keep = Math.max(sub === 'weekly' ? C.keepWeekly : C.keepDaily, KEEP_MIN_GOOD);
  r = run(RCLONE, rcloneArgs(['lsf', dst, '--files-only', '--include', 'linea-*.7z']), { timeout: 5 * 60 * 1000 });
  if (r.status !== 0) return 'загружен; список на Диске не прочитан — чистка пропущена';
  const names = r.stdout.split(/\r?\n/).map(s => s.trim()).filter(n => NAME_RE.test(n)).sort();
  if (!names.includes(path.basename(file))) return 'загружен, но в списке Диска его нет — чистка пропущена';
  let bad = 0;
  for (const n of names.slice(0, Math.max(0, names.length - keep))) {
    const d = run(RCLONE, rcloneArgs(['deletefile', `${dst}/${n}`]), { timeout: 5 * 60 * 1000 });
    if (d.status !== 0) bad++;
  }
  return bad ? `загружен; не удалось удалить старых: ${bad}` : 'ok';
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
    res.warnings = [];
    const vw = checkRemoteVersion(); if (vw) { res.warnings.push(vw); log('ВНИМАНИЕ: ' + vw); }
    res.source = await fetchDump(tgz);
    Object.assign(res, checkTgz(tgz));
    log(`получено: ${(res.bytes / 1048576).toFixed(1)} МБ, файлов ${res.files}, база ${res.driver}/${res.method}, таблиц ${res.tables}, строк ${res.rows}`);
    if (res.skippedBig.length) res.warnings.push(`пропущены большие файлы (${res.skippedBig.length}): ${res.skippedBig.slice(0, 5).join(', ')}${res.skippedBig.length > 5 ? '…' : ''} — их в копии нет`);
    const prevOk = readJson(path.join(P.state, 'backup-last-ok.json'), null);
    const why = compareWithPrev(res, prevOk);
    if (why.length && !args['accept-drop']) {
      // подозрительная копия: сохраняем отдельно (вдруг падение законное), но хорошие не вытесняем и на Диск не грузим
      encrypt(tgz, out7); fs.unlinkSync(tgz);
      fs.renameSync(out7, path.join(SUSPECT, name + '.7z'));
      const sus = list(SUSPECT); for (const x of sus.slice(0, Math.max(0, sus.length - 3))) fs.unlinkSync(path.join(SUSPECT, x));
      res.suspect = name + '.7z';
      const e = new Error(`копия подозрительна, в ротацию не пошла (лежит в backups\\suspect): ${why.join('; ')}. Если падение законное — один прогон «bk.mjs backup --accept-drop»`);
      e.always = true; throw e;
    }
    if (why.length) { res.acceptedDrop = why; log('падение принято вручную (--accept-drop): ' + why.join('; ')); }
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
    if (prev.ok !== false || e.always || args['notify-always']) await notify(e.always ? 'бэкап отвергнут: подозрительная копия' : 'бэкап не прошёл', `${name}: ${e.message}\nПоследний удачный: ${readJson(path.join(P.state, 'backup-last-ok.json'), {}).at || 'не было'}`);
  } finally {
    writeJson(path.join(P.state, 'backup-last.json'), res);
    try { fs.unlinkSync(lock); } catch { }
  }
  const prevState = readJson(path.join(P.state, 'backup-prev-state.json'), {});
  if (res.ok && prevState.ok === false) await notify('бэкап снова проходит', res.name, { ok: true });
  const warnKey = (res.warnings || []).join('\n');
  if (res.ok && warnKey && warnKey !== (prevState.warnings || '')) await notify('бэкап прошёл с замечаниями', `${res.name}:\n${warnKey}`);
  writeJson(path.join(P.state, 'backup-prev-state.json'), { ok: res.ok, at: res.at, warnings: res.ok ? warnKey : (prevState.warnings || '') });
  return res.ok ? 0 : 1;
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'backup') process.exitCode = await backup();
  else if (cmd === 'test') {
    const f = args._ || latest(); if (!f) { console.error('архивов нет'); process.exitCode = 1; return; }
    const r = test7z(f);
    console.log(`${path.basename(f)}: ${r.status === 0 ? 'целый, пароль подходит' : 'ОШИБКА 7z код ' + r.status}`); process.exitCode = r.status === 0 ? 0 : 1;
  } else if (cmd === 'cat-latest') {
    const f = latest(); if (!f) { console.error('архивов нет'); process.exitCode = 1; return; }
    console.error('архив: ' + path.basename(f));
    const ch = spawn(SEVENZIP, ['e', '-so', f], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    ch.stdin.end(pwIn(1));
    ch.stdout.pipe(process.stdout);
    ch.on('close', c => { process.exitCode = c; });
  } else if (cmd === 'status') {
    const ok = readJson(path.join(P.state, 'backup-last-ok.json'), null), last = readJson(path.join(P.state, 'backup-last.json'), null);
    console.log(JSON.stringify({ home: OPS_HOME, lastOk: ok && { at: ok.at, name: ok.name, mb: +(ok.bytes7z / 1048576).toFixed(2), rows: ok.rows, files: ok.files, upload: ok.upload },
      last: last && { at: last.at, ok: last.ok, error: last.error, warnings: last.warnings }, daily: list(DAILY), weekly: list(WEEKLY), suspect: list(SUSPECT) }, null, 2));
  } else { console.error('команды: backup | test [файл] | cat-latest | status'); process.exitCode = 2; }
}
main().catch(e => { log('сбой: ' + e.stack); process.exitCode = 1; });
