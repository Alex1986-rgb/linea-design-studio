#!/usr/bin/env node
// Карточка для альбома: QR-код со ссылкой, пароль, срок. Файл с паролем НЕ публикуется — остаётся у студии.
//   node tools/3d/card.mjs --info <token>.info.json --host 3d.<домен> --out <папка>
// Пишет в <папка>: qr.svg, card.json, card.html (печатная карточка A6: ссылка, QR, пароль, срок).
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : null)).filter(Boolean))
if (!args.info || !args.host || !args.out) { console.error('usage: card.mjs --info <token.info.json> --host <3d-host> --out <dir>'); process.exit(2) }
const info = JSON.parse(readFileSync(args.info, 'utf8'))
const { token, password } = info
if (!/^[A-Za-z0-9_-]{22,}$/.test(token ?? '')) throw new Error('в info.json нет нормального токена')
if (!password || String(password).length < 5) throw new Error('в info.json нет пароля (или он короче 5 знаков)')
const url = `https://${args.host}/${token}/`
const out = resolve(args.out)
mkdirSync(out, { recursive: true })
execFileSync('swift', [join(dirname(fileURLToPath(import.meta.url)), 'qr-svg.swift'), url, join(out, 'qr.svg')], { stdio: ['ignore', 'pipe', 'inherit'] })
const expires = info.expires ? new Date(info.expires).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) : 'без срока'
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
writeFileSync(join(out, 'card.json'), JSON.stringify({ url, password, expires: info.expires ?? null, name: info.name ?? null }, null, 2))
writeFileSync(join(out, 'card.html'), `<!doctype html><meta charset="utf-8"><title>3D-просмотр · ${esc(info.name ?? token)}</title>
<style>body{font:16px/1.4 -apple-system,Segoe UI,sans-serif;color:#1d2a26;background:#f6f2ea;margin:0;padding:24px}
.c{max-width:360px;margin:0 auto;background:#fff;border:1px solid #d9d2c3;border-radius:16px;padding:24px;text-align:center}
.b{color:#2f5d50;letter-spacing:.2em;font-weight:600;font-size:13px}img{width:240px;height:240px}
.p{font:600 28px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;background:#f6f2ea;border-radius:10px;padding:12px;margin:8px 0}
.s{color:#6c746f;font-size:13px}@media print{body{background:#fff}}</style>
<div class="c"><div class="b">LINEA</div><h1 style="font-size:20px;margin:6px 0 12px">Ваша квартира в 3D</h1>
<img src="qr.svg" alt="QR-код со ссылкой на 3D-просмотр">
<p class="s">Наведите камеру телефона на код или откройте<br>${esc(url)}</p>
<div class="s">Пароль</div><div class="p">${esc(password)}</div>
<p class="s">Ссылка действует до ${esc(expires)}. Никому её не пересылайте: по ней видна вся квартира.</p></div>`)
console.log(`карточка: ${join(out, 'card.html')}\n  ссылка: ${url}\n  срок: ${expires}`)
