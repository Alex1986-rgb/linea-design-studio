'use strict';
/**
 * Факты электрики одного опубликованного альбома — для страницы «Розетки там, где нужно» (rozetki/)
 * и короткого блока на главной. Всё читается из листов выпуска (site/portfolio/<slug>/sheets/*.svg):
 *   ведомость электроточек  — марка, помещение, назначение, высота Н, группа щита (по каждой точке);
 *   однолинейная схема щита — группы и защита 30 мА;
 *   план розеток            — номер листа, масштаб;
 *   развёртка кухни          — лист, на котором стоят розетки фартука (ищется по марке первой из них).
 * Руками ничего не пишется: перевыпустили альбом — страница пересобирается и говорит то, что на листах.
 * Если формат листа поменялся и разобрать ведомость не удалось, сборка падает, а не публикует пустые цифры.
 */
const fs = require('fs');
const path = require('path');

const txt = f => [...fs.readFileSync(f, 'utf8').matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1].replace(/&amp;/g, '&').trim());

function rozetki(SITE, slug = 'gost-kv3k') {
  const dir = path.join(SITE, 'portfolio', slug);
  const sheets = JSON.parse(fs.readFileSync(path.join(dir, 'sheets.json'), 'utf8'));
  const card = (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, '_card.json'), 'utf8')); } catch { return {}; } })();
  const by = (re, what) => { const s = sheets.filter(x => re.test(x.file)); if (!s.length) throw new Error(`${slug}: нет листа «${what}»`); return s; };
  const no = f => +(f.match(/^(\d+)/) || [])[1];
  const S = f => path.join(dir, 'sheets', f);
  const sockets = by(/-electrical-engineer-sockets/, 'план розеток')[0];
  const schedule = by(/-electrical-engineer-schedule/, 'ведомость электроточек');
  const panel = by(/-electrical-engineer-panel/, 'однолинейная схема щита');

  // ведомость: «Р26 | 6 | фартук | 1100 | 7» — назначение бывает в несколько строк, до высоты (2–4 цифры)
  const t = schedule.flatMap(s => txt(S(s.file)));
  const points = [];
  for (let i = 0; i < t.length; i++) {
    if (!/^(Р|ЭВ)\d+\**$/.test(t[i]) || !/^\d+$/.test(t[i + 1] || '')) continue;
    let j = i + 2; const what = [];
    while (j < t.length && !/^\d{2,4}$/.test(t[j]) && what.length < 4) what.push(t[j++]);
    if (!/^\d{2,4}$/.test(t[j] || '')) continue;
    points.push({ mark: t[i].replace(/\*+$/, ''), proposed: /\*\*$/.test(t[i]), room: +t[i + 1], what: what.join(' '), h: +t[j], group: /^\d+$/.test(t[j + 1] || '') ? +t[j + 1] : null });
  }
  if (points.length < 10) throw new Error(`${slug}: из ведомости электроточек разобрано ${points.length} строк — формат листа поменялся?`);

  // щит: «гр.7 | розетки | фартука | кухни | 2,5 кВт» и «30 мА» у каждой защищённой линии
  const p = panel.flatMap(s => txt(S(s.file)));
  const groups = [];
  for (let i = 0; i < p.length; i++) {
    const m = p[i].match(/^гр\.(\d+)$/); if (!m) continue;
    let j = i + 1; const what = [];
    while (j < p.length && !/кВт$/.test(p[j]) && !/^(QF|гр\.)/.test(p[j]) && what.length < 5) what.push(p[j++]);
    groups.push({ n: +m[1], what: what.join(' '), kw: /кВт$/.test(p[j] || '') ? p[j] : '' });
  }
  const rcd30 = p.filter(x => x === '30 мА').length;

  // помещения — из названий развёрток «… Кухня-гостиная (пом. 6) …»
  const rooms = {};
  for (const s of sheets) for (const m of s.title.matchAll(/([А-ЯЁ][а-яё\- 0-9]+?) \(пом\. (\d+)\)/g)) { const k = +m[2], v = m[1].trim(); if (!rooms[k] || v.length > rooms[k].length) rooms[k] = v; }

  // развёртка кухни, на которой стоят розетки фартука
  const apron = points.filter(x => /фартук/.test(x.what));
  const kRoom = apron.length ? apron[0].room : null;
  const kitchenElev = apron.length ? sheets.find(s => /-draftsman-elev-/.test(s.file) && new RegExp(`>${apron[0].mark}[ <]`).test(fs.readFileSync(S(s.file), 'utf8'))) : null;

  const sTxt = txt(S(sockets.file));
  const scale = (sTxt.find(x => /^М 1:\d+$/.test(x)) || '').replace(/^М /, '');
  const notes = sTxt.filter(x => /ПУЭ|УЗО|чистого пола|привязки/.test(x));

  const hs = [...new Set(points.map(x => x.h))].sort((a, b) => a - b);
  const sheetOf = s => ({ file: s.file, no: no(s.file), title: s.title });
  return {
    slug, name: card.name || slug, area: card.area || '', total: sheets.length,
    sheets: { sockets: sheetOf(sockets), schedule: schedule.map(sheetOf), panel: panel.map(sheetOf), kitchen: kitchenElev ? sheetOf(kitchenElev) : null },
    scale, points, groups, rcd30, rooms, kitchenRoom: kRoom,
    nSockets: points.filter(x => x.mark.startsWith('Р')).length,
    nOutlets: points.filter(x => x.mark.startsWith('ЭВ')).length,
    nProposed: points.filter(x => x.proposed).length,
    heights: hs,
    kitchen: points.filter(x => x.room === kRoom && (/фартук|посудомо|варочн|духов|вытяжк|холодил/.test(x.what))),
    hasNotes: { puе: notes.some(x => /ПУЭ/.test(x)), uzo: notes.some(x => /УЗО/.test(x)) },
  };
}

module.exports = rozetki;
if (require.main === module) {
  const r = rozetki(path.join(__dirname, '..', 'site'), process.argv[2]);
  console.log(JSON.stringify({ ...r, points: r.points.length }, null, 1));
}
