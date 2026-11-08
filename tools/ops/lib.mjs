// LINEA · эксплуатация: общие пути, настройки, журнал и оповещения для bk.mjs и monitor.mjs (Node 18+, без зависимостей).
// Рабочая папка OPS_HOME: на SmartApe — C:\linea-ops, на маке (макет) — переменная LINEA_OPS_HOME.
//   ops.json            — настройки (адреса, хост Beget, хранение); образец — tools/ops/ops.example.json
//   secrets\backup.pass — пароль шифрования архивов (создаёт install, в репозиторий не попадает)
//   secrets\notify.env  — TG_TOKEN=…, TG_CHAT=… (необязательно; нет — только журнал и файл-флаг)
//   secrets\monitor.token — токен мониторинга ping.php (= monitor_token в config.php на Beget); запасной путь — monitorToken в ops.json
//   secrets\beget_ed25519, secrets\known_hosts — ключ SSH до Beget
//   state\*.json, logs\*.log, backups\daily|weekly\*.7z
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const IS_WIN = process.platform === 'win32';
export const OPS_HOME = process.env.LINEA_OPS_HOME || (IS_WIN ? 'C:\\linea-ops' : path.join(os.homedir(), '.linea-ops'));
export const P = {
  cfg: path.join(OPS_HOME, 'ops.json'),
  secrets: path.join(OPS_HOME, 'secrets'),
  state: path.join(OPS_HOME, 'state'),
  logs: path.join(OPS_HOME, 'logs'),
  backups: path.join(OPS_HOME, 'backups'),
  work: path.join(OPS_HOME, 'work'),
};
for (const d of [P.state, P.logs, P.backups, P.work]) fs.mkdirSync(d, { recursive: true });

const DEF = {
  site: 'https://xn-----6kccjicviedfr1b2cbishm8w.xn--p1ai',      // дизайн-студия-квартир.рф
  domain: 'xn-----6kccjicviedfr1b2cbishm8w.xn--p1ai',
  pages: { home: '/', ping: '/api/ping.php', kabinet: '/kabinet/' },
  sslWarnDays: 14,
  // Источник дампа: 'beget' — аккаунт aleks2si (пока DNS и данные там), 'vps' — VPS SmartApe после переезда
  // (копия той же раскладки в /srv/beget, ключ бэкапера с принудительной командой в /root/.ssh/authorized_keys —
  // ставит after-beget-up.sh --target=vps). Меняется в ops.json: "source": "vps".
  source: 'beget',
  beget: { host: 'gandalf.beget.com', user: 'aleks2si', root: 'dizain-studiya-kvartir' },
  vps: { host: '45.154.185.168', user: 'root', root: '/srv/beget/dizain-studiya-kvartir' },
  keepDaily: 14, keepWeekly: 8,
  keepMinGood: 7,                 // ротация (локально и на Диске) никогда не оставляет меньше N хороших копий — независимо от возраста
  backupDropPct: 40,              // падение строк/заказов/размера к прошлой удачной копии больше N % — копия «подозрительная»
  gdrive: 'gdrive:LINEA/Бэкапы',
  backupMaxAgeHours: 30,          // монитор: свежий удачный бэкап не старше (0 — не проверять)
  expectBackup: true,             // бэкап обязан быть; false — пока не включён: монитор держит «внимание», а не молчит
  cronMaxAgeMin: 45,              // монитор: последний прогон cron.php на Beget не старше N минут (нужен токен мониторинга)
  serverTz: '+03:00',             // часовой пояс отметки cron.last на Beget (МСК)
  failConfirmRuns: 2,             // сбой подтверждается N прогонами подряд (без шума от разовых таймаутов)
  remindHours: 12,                // пока сбой длится — напоминание раз в N часов
};
export function cfg() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(P.cfg, 'utf8')); } catch { /* нет файла — значения по умолчанию */ }
  return { ...DEF, ...c, pages: { ...DEF.pages, ...(c.pages || {}) }, beget: { ...DEF.beget, ...(c.beget || {}) }, vps: { ...DEF.vps, ...(c.vps || {}) } };
}
/** Откуда снимать дамп по ops.json: {host, user, root, name} — Beget или VPS. */
export function dumpSource(c = cfg()) {
  return c.source === 'vps' ? { ...c.vps, name: 'VPS' } : { ...c.beget, name: 'Beget' };
}

export function stamp(d = new Date()) {
  // местное время сервера (МСК на SmartApe) — для имён файлов
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`;
}
export function logger(name) {
  const file = path.join(P.logs, name + '.log');
  return (...a) => {
    const line = `${new Date().toISOString()} ${a.join(' ')}`;
    console.error(line);
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 2 * 1024 * 1024) fs.renameSync(file, file + '.1');
      fs.appendFileSync(file, line + '\n');
    } catch { /* журнал не должен ронять работу */ }
  };
}
export function readJson(f, def = null) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } }
export function writeJson(f, v) { fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 2)); fs.renameSync(f + '.tmp', f); }

function readEnv(f) {
  const o = {};
  try { for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch { }
  return o;
}

/** Оповещение владельцу. Каналы: Telegram (secrets/notify.env), всегда — журнал alerts.log и файл-флаг state/ALERT.txt. */
export async function notify(subject, text, { ok = false } = {}) {
  const log = logger('alerts');
  log(`${ok ? 'OK' : 'ALERT'} ${subject} | ${text.replace(/\n/g, ' / ')}`);
  const flag = path.join(P.state, 'ALERT.txt');
  try {
    if (ok) { if (fs.existsSync(flag)) fs.appendFileSync(flag, `\n${new Date().toISOString()} ВОССТАНОВЛЕНО: ${subject}\n`); }
    else fs.appendFileSync(flag, `${new Date().toISOString()} ${subject}\n${text}\n\n`);
  } catch { }
  const env = readEnv(path.join(P.secrets, 'notify.env'));
  const sent = [];
  if (env.TG_TOKEN && env.TG_CHAT) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ chat_id: env.TG_CHAT, text: `${ok ? '✅' : '🔴'} LINEA: ${subject}\n${text}`, disable_web_page_preview: true }),
      });
      sent.push(r.ok ? 'telegram' : `telegram:${r.status}`);
    } catch (e) { sent.push('telegram:err'); }
  }
  if (env.WEBHOOK_URL) {   // любой приёмник POST JSON (например, свой скрипт на почту) — необязательно
    try { const r = await fetch(env.WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject, text, ok }), signal: AbortSignal.timeout(20000) }); sent.push(r.ok ? 'webhook' : `webhook:${r.status}`); } catch { sent.push('webhook:err'); }
  }
  if (!sent.length) sent.push('только журнал и state/ALERT.txt (канал не настроен)');
  log('канал: ' + sent.join(', '));
  return sent;
}
