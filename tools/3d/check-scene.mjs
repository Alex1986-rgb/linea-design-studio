#!/usr/bin/env node
// Геометрическая проверка сцены Pascal до сборки папки заказчика (без браузера):
//   node tools/3d/check-scene.mjs <scene.json>   (graph или {name, graph})
// Проверяет: каждая точка (розетка, выключатель, слаботочка, вода, канализация, щит) стоит НА СВОЕЙ стене —
// в пределах толщины стены от её оси — и смотрит в помещение (точка + 30 см по нормали попадает в зону);
// двери и окна лежат внутри своей стены и не перекрываются друг с другом.
// Код возврата 1, если нашлось хоть одно нарушение.
import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) { console.error('usage: check-scene.mjs <scene.json>'); process.exit(2) }
const raw = JSON.parse(readFileSync(file, 'utf8'))
const graph = raw.graph ?? raw
const nodes = Object.values(graph.nodes)
const walls = nodes.filter((n) => n.type === 'wall')
const zones = nodes.filter((n) => n.type === 'zone' && n.polygon)
const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))

const WALL_ITEM = /^linea-(socket|socket-2|switch|lan|tv|water-cold|water-hot|drain|panel|smoke)$/
const inPoly = (p, poly) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
const distToWall = (p, w) => {
  const [x1, y1] = w.start, [x2, y2] = w.end
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy
  const t = Math.max(0, Math.min(1, ((p[0] - x1) * dx + (p[1] - y1) * dy) / l2))
  return Math.hypot(p[0] - (x1 + t * dx), p[1] - (y1 + t * dy))
}

const problems = []
let checked = 0
let offWall = 0 // лючки в полу и потолочные приборы (извещатели, точки доступа, блоки питания) — не на стене, не проверяются
for (const it of nodes.filter((n) => n.type === 'item' && WALL_ITEM.test(n.asset?.id ?? ''))) {
  if (it.position[1] < 0.03 || it.position[1] > 2.5) { offWall++; continue }
  checked++
  const p = [it.position[0], it.position[2]]
  const near = walls.map((w) => ({ w, d: distToWall(p, w) })).sort((a, b) => a.d - b.d)[0]
  const label = it.metadata?.linea?.id ?? it.name
  if (!near) { problems.push(`${label}: в сцене нет стен`); continue }
  const half = near.w.thickness / 2
  // точка может стоять на грани стены (d ≈ половина толщины) или в её теле (d < половины), но не дальше 4 см от грани
  if (near.d > half + 0.04) problems.push(`${label}: от оси ближайшей стены ${(near.d * 1000).toFixed(0)} мм (полутолщина ${(half * 1000).toFixed(0)}) — висит в воздухе`)
  const th = it.rotation?.[1] ?? 0
  const ahead = [p[0] + Math.sin(th) * 0.3, p[1] + Math.cos(th) * 0.3]
  if (!zones.some((z) => inPoly(ahead, z.polygon))) problems.push(`${label}: лицом не в помещение (на 30 см вперёд зоны нет) — повёрнуто на чужую сторону стены`)
}

const spans = new Map()
for (const o of nodes.filter((n) => n.type === 'door' || n.type === 'window')) {
  const w = byId[o.wallId ?? o.parentId]
  if (!w) { problems.push(`${o.name ?? o.id}: нет стены ${o.wallId}`); continue }
  const len = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
  const a = o.position[0] - o.width / 2, b = o.position[0] + o.width / 2
  if (a < -0.001 || b > len + 0.001) problems.push(`${o.name ?? o.id}: проём ${a.toFixed(2)}…${b.toFixed(2)} м выходит за стену длиной ${len.toFixed(2)} м`)
  if (!spans.has(w.id)) spans.set(w.id, [])
  spans.get(w.id).push({ a, b, name: o.name ?? o.id })
}
for (const list of spans.values()) {
  list.sort((x, y) => x.a - y.a)
  for (let i = 1; i < list.length; i++) if (list[i].a < list[i - 1].b - 0.001) problems.push(`проёмы перекрываются: «${list[i - 1].name}» и «${list[i].name}»`)
}

const doors = nodes.filter((n) => n.type === 'door').length
console.log(`точек на стенах проверено: ${checked} (пол/потолок пропущено: ${offWall}), дверей: ${doors}, окон: ${nodes.filter((n) => n.type === 'window').length}`)
if (problems.length) { console.log(`НАРУШЕНИЙ: ${problems.length}`); problems.slice(0, 40).forEach((p) => console.log('  - ' + p)); process.exit(1) }
console.log('OK: все точки на своих стенах и смотрят в помещение, проёмы не перекрываются')
