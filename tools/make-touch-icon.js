#!/usr/bin/env node
'use strict';
/**
 * Рисует site/apple-touch-icon.png (180×180) — иконку для «Добавить на экран»
 * на iPhone/iPad. Тот же знак, что в inline-SVG фавиконе: золотая литера L с
 * изумрудным кабошоном на графитовом поле.
 *
 *   node tools/make-touch-icon.js
 *
 * Без зависимостей: пиксели считаются вручную, PNG пакуется через zlib из
 * стандартной библиотеки. Растровых конвертеров в системе может не быть, а
 * иконка нужна ровно одна и меняется раз в жизни.
 */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const N = 180;
const px = Buffer.alloc(N * N * 3);

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex('#0F0E0C');
const GOLD_HI = hex('#EBDCA8');
const GOLD_LO = hex('#8F6B33');
const EMERALD = hex('#1E6E57');
const LINE = hex('#C9A45F');

const set = (x, y, c) => {
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  const i = (y * N + x) * 3;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
};
// градиент золота по диагонали — как в SVG-фавиконе
const gold = (x, y) => {
  const t = Math.min(1, Math.max(0, (x + y) / (2 * N)));
  return GOLD_HI.map((v, i) => Math.round(v + (GOLD_LO[i] - v) * t));
};
const rect = (x0, y0, w, h, c) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, typeof c === 'function' ? c(x, y) : c);
};

for (let i = 0; i < N * N; i++) { px[i * 3] = BG[0]; px[i * 3 + 1] = BG[1]; px[i * 3 + 2] = BG[2]; }

// тонкая золотая рамка с отступом — «паспарту» премиального тона
const M = 12;
rect(M, M, N - 2 * M, 1, LINE); rect(M, N - M - 1, N - 2 * M, 1, LINE);
rect(M, M, 1, N - 2 * M, LINE); rect(N - M - 1, M, 1, N - 2 * M, LINE);

// литера L: вертикальная стойка + подошва, пропорции близки к Playfair
rect(56, 44, 17, 78, gold);   // стойка
rect(56, 105, 62, 17, gold);  // подошва

// изумрудный кабошон — ромб на конце подошвы, в золотой обводке
const cx = 128, cy = 70, r = 15;
for (let y = cy - r - 2; y <= cy + r + 2; y++) {
  for (let x = cx - r - 2; x <= cx + r + 2; x++) {
    const d = Math.abs(x - cx) + Math.abs(y - cy);
    if (d <= r) set(x, y, EMERALD);
    else if (d <= r + 2) set(x, y, LINE);
  }
}

// --- упаковка PNG ---------------------------------------------------------
const raw = Buffer.alloc(N * (N * 3 + 1));
for (let y = 0; y < N; y++) {
  raw[y * (N * 3 + 1)] = 0; // фильтр «none»
  px.copy(raw, y * (N * 3 + 1) + 1, y * N * 3, (y + 1) * N * 3);
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = buf => {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8 бит, truecolor RGB

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'site', 'apple-touch-icon.png');
fs.writeFileSync(out, png);
console.log(`apple-touch-icon.png: ${N}×${N}, ${(png.length / 1024).toFixed(1)} КБ`);
