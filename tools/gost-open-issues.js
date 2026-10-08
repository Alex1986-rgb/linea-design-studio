'use strict';
/**
 * Чтение «честной» части выпуска GOST-DRAFT: открытые вопросы, конфликты, реестр изменений,
 * знак «*» и задание на контрольный обмер.
 *
 * Всё берётся из самих листов выпуска (site/portfolio/<slug>/sheets/*.svg), руками ничего не вписывается:
 *   • числа — из НАПЕЧАТАННОГО на листах: сводки («Сводка: открытых вопросов — N …»), строки таблиц, пометка
 *     «ПРЕДВАРИТЕЛЬНО …», строка штампа, строка «Основа листа». Атрибуты data-* в SVG (data-open, data-basis,
 *     data-el) служат только для сверки: число, которого нет на бумаге, на страницу не попадает, а расхождение
 *     бумаги с атрибутом — ошибка сборки. Мастер читает лист, а не JSON;
 *   • цитаты — регулярными выражениями из текста листов, вместе с номером листа, на котором нашлись;
 *   • утверждения, которые страница делает словами, проверяются теми же листами (CLAIMS): не нашлось —
 *     сборка падает, а не публикует то, чего в выпуске нет.
 * Альбом перевыпустили и формулировки поменялись — генератор скажет, какое утверждение больше не подтверждается.
 */

const fs = require('fs');
const path = require('path');

const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');

// все <text> листа: координата x (по ней различаем графы таблицы) и очищенная строка
const textsOf = svg => [...svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)].map(m => ({
  x: +((/\bx="([\d.]+)"/.exec(m[1]) || [])[1]),
  t: unesc(m[2].replace(/<[^>]+>/g, '')).trim(),
})).filter(o => o.t);

const num = file => +String(file).match(/^(\d+)-/)[1];
const runs = nos => {                      // 5, 6, 7, 8 -> «5–8»; 5, 7 -> «5, 7»
  const n = [...new Set(nos)].sort((a, b) => a - b), out = [];
  for (let i = 0; i < n.length; i++) {
    let j = i;
    while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++;
    out.push(j - i >= 2 ? `${n[i]}–${n[j]}` : n.slice(i, j + 1).join(', '));
    i = j;
  }
  return out.join(', ');
};

// строки таблиц реестра: графы различаются по x, перенесённые строки одной графы склеиваются пробелом
function readRows(svg) {
  return [...svg.matchAll(/<g data-el="issue-row" data-kind="([a-z]+)" data-id="([^"]*)"[^>]*>([\s\S]*?)<\/g>/g)].map(m => {
    const tx = textsOf(m[3]);
    const xs = [...new Set(tx.map(t => t.x))].sort((a, b) => a - b);
    return { kind: m[1], id: m[2], cols: xs.map(x => tx.filter(t => t.x === x).map(t => t.t)) };
  });
}

// «л. 34 — Раскладка плитки. Планы полов» -> { nos: [34], label }
function sheetRefs(lines) {
  return lines.join(' ').split(/\s(?=л\. \d)/).map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^л\.\s*(\d+)/);
    return { no: m ? +m[1] : null, label: s };
  }).filter(r => r.no);
}

// состав выпуска из служебной листалки _release.html (её кладёт tools/sync-gost-releases.sh)
function readRelease(siteDir, slug) {
  const idx = fs.readFileSync(path.join(siteDir, 'portfolio', slug, '_release.html'), 'utf8');
  const stat = idx.match(/Листов:\s*(\d+)[^<]*блокеров:\s*(\d+)[^<]*замечаний:\s*(\d+)/) || [];
  const sheets = [...idx.matchAll(/<h3>([^<]+?)\.svg — ([^<]+?) \(([a-z-]+)\)<\/h3>/g)]
    .map(m => ({ file: m[1] + '.svg', title: m[2], owner: m[3] }));
  if (!sheets.length) throw new Error(`${slug}: в _release.html не нашлось листов — проверьте синхронизацию выпуска`);
  return { sheets, total: +stat[1] || sheets.length, blockers: +stat[2] || 0, issues: +stat[3] || 0 };
}

function read(siteDir, slug, release) {
  const dir = path.join(siteDir, 'portfolio', slug, 'sheets');
  const fail = msg => { throw new Error(`${slug}: ${msg}`); };

  const sheets = release.sheets.map(s => {
    const svg = fs.readFileSync(path.join(dir, s.file), 'utf8');
    const tx = textsOf(svg);
    return { ...s, no: num(s.file), svg, tx, joined: tx.map(t => t.t).join(' ').replace(/[\u00a0\u202f]/g, ' ') };
  });
  const byNo = new Map(sheets.map(s => [s.no, s]));
  const issuesSheets = sheets.filter(s => s.owner === 'foreman' && /^Открытые вопросы/.test(s.title));
  const surveySheets = sheets.filter(s => s.owner === 'foreman' && /^Задание на контрольный обмер/.test(s.title));
  if (!issuesSheets.length) fail('в выпуске нет листа «Открытые вопросы, принятые допущения и конфликты»');
  if (!surveySheets.length) fail('в выпуске нет листа «Задание на контрольный обмер и обследование»');

  // ---------- реестры ----------
  const rows = issuesSheets.flatMap(s => readRows(s.svg).map(r => ({ ...r, sheet: s.no })));
  const pick = k => rows.filter(r => r.kind === k);
  const questions = pick('question').map(r => {
    if (r.cols.length !== 6) fail(`строка ${r.id} реестра: ожидалось 6 граф, найдено ${r.cols.length}`);
    const [id, text, kindAwaits, owner, ifNo, where] = r.cols;
    return {
      id: r.id, sheet: r.sheet, text: text.join(' '), kind: kindAwaits[0],
      awaits: kindAwaits.slice(1).join(' '), owner: owner.join(' '), ifNo: ifNo.join(' '), refs: sheetRefs(where),
    };
  });
  const conflicts = pick('conflict').map(r => ({ id: r.id, sheet: r.sheet, text: (r.cols[1] || []).join(' '), refs: sheetRefs(r.cols[r.cols.length - 1] || []) }));
  const changes = pick('change').map(r => ({
    id: r.id, sheet: r.sheet, was: (r.cols[3] || []).join(' '), now: (r.cols[4] || []).join(' '), by: (r.cols[5] || []).join(' '),
  }));
  const roles = pick('role');

  // ---------- сводка на листе реестра ----------
  // сводка может перенестись на вторую строку, поэтому читаем склеенный текст до следующего абзаца
  const summaryOf = (sheet, stop, what) => {
    const i = sheet.joined.indexOf('Сводка:');
    if (i < 0) fail(`на листе ${what} нет строки «Сводка: …»`);
    const rest = sheet.joined.slice(i);
    const j = rest.indexOf(stop);
    return j > 0 ? rest.slice(0, j) : rest.slice(0, 500);
  };
  const sumIssues = summaryOf(issuesSheets[0], 'Пункты, ответ', 'реестра');
  const grab = (re, s, d) => { const m = s.match(re); return m ? +m[1] : d; };
  const sum = {
    open: grab(/открытых вопросов — (\d+)/, sumIssues),
    facts: grab(/ждут факта объекта — (\d+)/, sumIssues),
    conflicts: grab(/конфликтов между разделами — (\d+)/, sumIssues, 0),
    changes: grab(/изменений в реестре — (\d+)/, sumIssues, 0),
    unsigned: grab(/без подписи — (\d+)/, sumIssues, 0),
    roles: grab(/не сданных к выпуску,? — (\d+)/, sumIssues, 0),
  };
  // что сводка называет вслух: «0» там, где сводка молчит, — не утверждение листа, а его отсутствие
  const stated = {
    conflicts: /конфликтов между разделами — \d+/.test(sumIssues),
    unsigned: /без подписи — \d+/.test(sumIssues),
    roles: /не сданных к выпуску,? — \d+/.test(sumIssues),
  };
  const factsWhat = (sumIssues.match(/ждут факта объекта — \d+: ([^)]*)\)/) || [])[1] || '';
  if (!Number.isFinite(sum.open) || !Number.isFinite(sum.facts)) fail(`сводка реестра не разобрана: «${sumIssues}»`);

  // ---------- пометка выпуска на каждом листе: читаем напечатанный текст ----------
  const MARK_RE = /ПРЕДВАРИТЕЛЬНО · не для производства работ · открыто пунктов: (\d+) \(реестр — л\. ([^)]+)\)/;
  const markPrinted = sheets.filter(s => MARK_RE.test(s.joined));
  const markNums = new Set(markPrinted.map(s => +s.joined.match(MARK_RE)[1]));
  if (!markPrinted.length) fail('на листах не напечатана пометка «ПРЕДВАРИТЕЛЬНО · не для производства работ»');
  if (markNums.size !== 1) fail(`пометка листов называет разные числа открытых пунктов: ${[...markNums].join(', ')}`);
  const mark = { open: [...markNums][0], regs: markPrinted[0].joined.match(MARK_RE)[2] };
  const markSheets = markPrinted.length;
  // метаданные пометки — только для сверки с бумагой
  const attrOpen = new Set(sheets.map(s => (s.svg.match(/data-el="release-mark"[^>]*data-open="(\d+)"/) || [])[1]).filter(Boolean).map(Number));
  const attrSheets = sheets.filter(s => /data-el="release-mark"/.test(s.svg)).length;
  if (attrSheets !== markSheets) fail(`пометка напечатана на ${markSheets} листах, а в метаданных — на ${attrSheets}`);
  if (attrOpen.size !== 1 || [...attrOpen][0] !== mark.open) fail('число открытых пунктов в метаданных пометки не совпадает с напечатанным');
  const blockSheets = sheets.filter(s => s.joined.includes('Допущения и предложения на листе'));
  const blockSeeRegistry = blockSheets.filter(s => /См\. лист открытых вопросов \(/.test(s.joined)).length;
  const noBlock = sheets.filter(s => !s.joined.includes('Допущения и предложения на листе'));
  const baseTitle = t => t.replace(/\.\s*Лист \d+ из \d+$/, '');
  const noBlockTitles = [...noBlock.reduce((m, s) => m.set(baseTitle(s.title), (m.get(baseTitle(s.title)) || 0) + 1), new Map())];

  // ---------- штамп: строка «размеры со скана, не замерены (реестр — л. …, К-N)» ----------
  const STAMP_RE = /Общая площадь [\d,]+\* м² · \* размеры со скана, не замерены \(реестр — л\. [^)]*К-\d+[^)]*\)/;
  const stampSheets = sheets.filter(s => STAMP_RE.test(s.joined)).length;

  // ---------- знаки «*» и «**» в чертеже (вне штампа и вне кавычек «*» в пояснениях) ----------
  const LEGEND_RE = /«\*\*?»|(?:^|[\s(;])\*\*?\s+(?:—|[а-яёА-ЯЁa-z])/;
  const stripStar = t => t.replace(/«\*\*?»/g, '').replace(/Общая площадь [\d,]+\* м²/, '');
  const isStamp = t => /^Общая площадь [\d,]+\* м² · \* размеры со скана/.test(t.t);
  const starred = sheets.filter(s => s.tx.some(t => !isStamp(t) && /\*/.test(stripStar(t.t))));
  const starLegend = starred.filter(s => s.tx.some(t => LEGEND_RE.test(t.t) && !isStamp(t)));
  const starRecords = starred.filter(s => /(?:ИЗ|К)-\d+/.test(s.joined.replace(/\(реестр — л\. [^)]*\)/g, '')));
  const stars = { sheets: starred.length, legend: starLegend.length, records: starRecords.length, nos: starred.map(s => s.no) };

  // ---------- «Основа листа»: пункты считаем по напечатанной строке, берём самую полную ----------
  const basisItems = s => {
    const m = s.joined.match(/Основа листа: ([\s\S]*?)(?= Знак «\*»| См\. лист открытых| Изм\. Кол\.уч|$)/);
    if (!m) return 0;
    let depth = 0, n = 1;
    for (const ch of m[1].replace(/\.\s*$/, '')) { if (ch === '(') depth++; else if (ch === ')') depth--; else if (ch === ';' && depth === 0) n++; }
    return n;
  };
  const basisBest = sheets.map(s => ({ no: s.no, n: basisItems(s) })).sort((a, b) => b.n - a.n || a.no - b.no)[0];
  // число в метаданных пометки (data-basis) на страницу не идёт: на бумаге его нет, а пересчёт по строке даёт другое (в proekt2 — 6 против 5)
  const basis = { n: basisBest.n, no: basisBest.no };

  // ---------- основная надпись: пустые ли графы «Пров.» и «Н. контр.» ----------
  const cellFilled = (svg, label) => {
    const all = [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map(m => ({
      x: +((/\bx="([\d.]+)"/.exec(m[1]) || [])[1]), y: +((/\by="([\d.]+)"/.exec(m[1]) || [])[1]), t: unesc(m[2]).trim() }));
    const lab = all.find(t => t.t === label && t.x > 200 && t.y > 240);
    if (!lab) return null;                       // нет такой графы на листе
    return all.some(t => t.t && Math.abs(t.y - lab.y) < 1.5 && t.x > lab.x + 5 && t.x < 295);
  };
  const stampCells = sheets.map(s => ({ prov: cellFilled(s.svg, 'Пров.'), nk: cellFilled(s.svg, 'Н. контр.') }));
  const unsignedCells = { total: sheets.length, empty: stampCells.filter(c => c.prov === false && c.nk === false).length,
    missing: stampCells.filter(c => c.prov === null || c.nk === null).length };

  // ---------- задание на обмер ----------
  const survey = surveySheets.flatMap(s => [...s.svg.matchAll(/<g data-el="survey-row" data-id="([^"]+)" data-key="([^"]*)" data-closes="([^"]*)" data-method="([a-z]+)"[^>]*>([\s\S]*?)<\/g>/g)]
    .map(m => {
      const tx = textsOf(m[5]);
      const xs = [...new Set(tx.map(t => t.x))].sort((a, b) => a - b);
      const cols = xs.map(x => tx.filter(t => t.x === x).map(t => t.t).join(' '));
      return { id: m[1], key: m[2], closes: m[3].split(/[\s,]+/).filter(Boolean), method: m[4], sheet: s.no, cols };
    }));
  const ON_SITE = ['measure', 'uncover', 'inspect'];
  const onsite = survey.filter(r => ON_SITE.includes(r.method)).length;
  const sumSurvey = summaryOf(surveySheets[0], 'Условия проведения', 'задания');
  const sSum = {
    onsite: grab(/на объекте — (\d+)/, sumSurvey), off: grab(/документом и при закупке — (\d+)/, sumSurvey),
    stages: (sumSurvey.match(/на объекте — \d+ \(([^)]*)\)/) || [])[1] || '',
    closesN: grab(/Закрываются вопросы: [^()]*\((\d+)\)/, sumSurvey),
  };
  // все графы таблицы заполнены: 9 для пунктов на объекте, 8 для документов и закупки
  const rowFull = r => r.cols.length >= (ON_SITE.includes(r.method) ? 9 : 8) && r.cols.every(c => c.trim());
  survey.full = survey.filter(rowFull).length;
  const surveyClosed = new Set(survey.flatMap(r => r.closes));

  // ---------- сверки: страница не должна говорить то, что листы не подтверждают ----------
  const unsignedTable = changes.filter(c => /Не утверждено: подписи нет/.test(c.by)).length;
  if (questions.length !== sum.open) fail(`в таблице реестра ${questions.length} вопросов, а в сводке ${sum.open}`);
  if (changes.length !== sum.changes) fail(`в таблице реестра ${changes.length} изменений, а в сводке ${sum.changes}`);
  if (conflicts.length !== sum.conflicts) fail(`в таблице реестра ${conflicts.length} конфликтов, а в сводке ${sum.conflicts}`);
  if (stated.unsigned && unsignedTable !== sum.unsigned) fail('число записей «без подписи» не сходится со сводкой');
  sum.unsigned = unsignedTable;                    // считаем по таблице: сводка может промолчать, таблица — нет
  if (roles.length !== sum.roles) fail(`в таблице реестра ${roles.length} несданных разделов, а в сводке ${sum.roles}`);
  if (mark.open !== sum.open + sum.conflicts + sum.unsigned) fail(`пометка листов говорит «открыто пунктов: ${mark.open}», а реестр даёт ${sum.open + sum.conflicts + sum.unsigned}`);
  if (onsite !== sSum.onsite || survey.length - onsite !== sSum.off) fail(`строки задания (${onsite} + ${survey.length - onsite}) не сходятся со сводкой (${sSum.onsite} + ${sSum.off})`);
  if (surveyClosed.size !== sSum.closesN) fail(`строки задания закрывают ${surveyClosed.size} вопросов, а сводка задания называет ${sSum.closesN}`);
  const qIds = new Set(questions.map(q => q.id));
  for (const id of surveyClosed) if (!qIds.has(id)) fail(`задание закрывает вопрос ${id}, которого нет в реестре`);
  const awaitsDecisionOnly = q => /^Ждёт: решения$/.test(q.awaits.replace(/\s+/g, ' ').trim());
  // вопросы, которые ждут только решения человека, но названы в сводке задания (лист сам говорит, что такие задание не закрывает)
  const decisionInSurvey = questions.filter(q => awaitsDecisionOnly(q) && surveyClosed.has(q.id))
    .map(q => ({ id: q.id, rows: survey.filter(r => r.closes.includes(q.id)).map(r => r.id) }));
  // вопросы, которые ждут факта, но задание их не закрывает
  const factNotInSurvey = questions.filter(q => !awaitsDecisionOnly(q) && !surveyClosed.has(q.id)).map(q => q.id);
  if (factNotInSurvey.length) fail(`вопросы ${factNotInSurvey.join(', ')} ждут факта, но не вошли в задание на обмер`);
  if (questions.filter(q => !awaitsDecisionOnly(q)).length !== sum.facts) fail(`сводка говорит «ждут факта объекта — ${sum.facts}», а в графе «Ждёт» таких вопросов ${questions.filter(q => !awaitsDecisionOnly(q)).length}`);
  const incomplete = questions.filter(q => !(q.text && q.kind && q.owner && q.ifNo && q.refs.length && /^Ждёт:/.test(q.awaits)));
  const qComplete = incomplete.length === 0;

  // паспорт объекта с титульного листа: площадь и число помещений печатаются под подписями «ОБЩАЯ ПЛОЩАДЬ» и «ПОМЕЩЕНИЙ»
  const after = (label, re) => {
    for (const s of sheets.slice(0, 3)) {
      const i = s.tx.findIndex(t => t.t === label);
      const m = i >= 0 && s.tx[i + 1] && s.tx[i + 1].t.match(re);
      if (m) return m[1];
    }
    return null;
  };
  const area = after('ОБЩАЯ ПЛОЩАДЬ', /^([\d\s\u00a0]+,\d+) м²/);
  const rooms = +after('ПОМЕЩЕНИЙ', /^(\d+)/);
  if (!area || !rooms) fail('на титуле не найдены общая площадь и число помещений');
  const facts = { area: area.replace(/[\s\u00a0]/g, '') + ' м²', rooms };

  const kinds = {};
  for (const q of questions) kinds[q.kind] = (kinds[q.kind] || 0) + 1;

  // ---------- цитаты и утверждения ----------
  const quote = (re, { optional = false } = {}) => {
    for (const s of sheets) {
      const m = s.joined.match(re);
      if (m) return { text: m[0].replace(/\s+/g, ' '), no: s.no, file: s.file };
    }
    if (optional) return null;
    return fail(`на листах не найдено ${re} — страница ссылается на текст, которого в выпуске больше нет`);
  };
  const need = re => quote(re);

  return {
    slug, sheets, byNo, facts,
    issuesSheets: issuesSheets.map(s => s.no), surveySheets: surveySheets.map(s => s.no),
    issuesRange: runs(issuesSheets.map(s => s.no)), surveyRange: runs(surveySheets.map(s => s.no)),
    questions, conflicts, changes, roles: roles.length, sum, stated, factsWhat, kinds, mark, markSheets,
    blockSheets: blockSheets.length, blockSeeRegistry, noBlockTitles, stampSheets, stars, basis, unsignedCells,
    decisionInSurvey, qComplete, qIncomplete: incomplete.map(q => q.id),
    survey: { rows: survey, onsite, off: survey.length - onsite, full: survey.full, stages: sSum.stages, closesN: sSum.closesN },
    quote, need,
    sheetFile: no => (byNo.get(no) || {}).file,
  };
}

module.exports = { read, readRelease, runs };
