#!/usr/bin/env node
// Геометрическая проверка сцены Pascal до сборки папки заказчика (без браузера):
//   node tools/3d/check-scene.mjs <scene.json>   (graph или {name, graph})
// Проверяет: каждая точка (розетка, выключатель, слаботочка, вода, канализация, щит) стоит НА СВОЕЙ стене —
// в пределах толщины стены от её оси — и смотрит в помещение (точка + 30 см по нормали попадает в зону);
// двери и окна лежат внутри своей стены и не перекрываются друг с другом; потолки над каждым помещением и приборы под ними.
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
const ceilings = nodes.filter((n) => n.type === 'ceiling' && n.polygon?.length >= 3)
// прибор под потолком (верх в 5 см от плоскости над ним): потолочный, на стену не проверяется
const underCeiling = (it) => {
  const p = [it.position[0], it.position[2]]
  const over = ceilings.filter((q) => inPoly(p, q.polygon))
  if (!over.length) return false
  const top = it.position[1] + (it.asset?.dimensions?.[1] ?? 0) * (it.scale?.[1] ?? 1)
  return top >= Math.min(...over.map((q) => q.height ?? 9)) - 0.05
}
let checked = 0
let offWall = 0 // лючки в полу и потолочные приборы (извещатели, точки доступа, блоки питания) — не на стене, не проверяются
for (const it of nodes.filter((n) => n.type === 'item' && WALL_ITEM.test(n.asset?.id ?? ''))) {
  if (it.position[1] < 0.03 || it.position[1] > 2.5 || underCeiling(it)) { offWall++; continue }
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

// Потолки (с 31.10.2026 конвертер их выдаёт): у каждой зоны над центром есть потолок на высоте 2,1…3,5 м; потолочный прибор
// (спот, извещатель, подвес) стоит под плоскостью потолка над собой — не выше её и не ниже на 5 см (подвес — по верху);
// в названии нет незаполненного шаблона {{…}}.
const CEIL_ITEM = /^(linea-spot|linea-smoke|recessed-light|ceiling-lamp)$/
let ceilChecked = 0
if (!ceilings.length) problems.push('в сцене нет потолков — в прогулке над головой будет небо')
else {
  for (const z of zones) {
    const c = [z.polygon.reduce((a, p) => a + p[0], 0) / z.polygon.length, z.polygon.reduce((a, p) => a + p[1], 0) / z.polygon.length]
    const over = ceilings.filter((q) => inPoly(c, q.polygon))
    if (!over.length) { problems.push(`помещение «${z.name}»: над центром нет потолка`); continue }
    const h = Math.min(...over.map((q) => q.height ?? 0))
    if (!(h >= 2.1 && h <= 3.5)) problems.push(`помещение «${z.name}»: потолок на ${h} м — вне 2,1…3,5 м`)
  }
  for (const it of nodes.filter((n) => n.type === 'item' && CEIL_ITEM.test(n.asset?.id ?? ''))) {
    const p = [it.position[0], it.position[2]]
    const over = ceilings.filter((q) => inPoly(p, q.polygon) || q.polygon.some((v) => Math.hypot(v[0] - p[0], v[1] - p[1]) < 1e-3))
    if (!over.length) continue
    ceilChecked++
    const h = Math.min(...over.map((q) => q.height ?? 9))
    const sc = it.scale?.[1] ?? 1, dim = it.asset?.dimensions?.[1] ?? 0
    const topY = it.position[1] + dim * sc
    const label = it.metadata?.linea?.id ?? it.name
    if (topY > h + 0.005) problems.push(`${label}: верх прибора ${topY.toFixed(3)} м выше потолка ${h} м — спрятан над потолком`)
    else if (topY < h - 0.05) problems.push(`${label}: верх прибора ${topY.toFixed(3)} м ниже потолка ${h} м — висит в воздухе`)
  }
}
const sceneName = raw.name ?? nodes.find((n) => n.type === 'building')?.name ?? ''
if (/\{\{[^}]*\}\}/.test(sceneName)) problems.push(`в названии остался шаблон: «${sceneName}»`)
console.log(`потолков: ${ceilings.length}, потолочных приборов проверено: ${ceilChecked}`)
const doors = nodes.filter((n) => n.type === 'door').length
console.log(`точек на стенах проверено: ${checked} (пол/потолок пропущено: ${offWall}), дверей: ${doors}, окон: ${nodes.filter((n) => n.type === 'window').length}`)
if (problems.length) { console.log(`НАРУШЕНИЙ: ${problems.length}`); problems.slice(0, 40).forEach((p) => console.log('  - ' + p)); process.exit(1) }
console.log('OK: все точки на своих стенах и смотрят в помещение, проёмы не перекрываются')
