// Мультик LINEA (9:16): кадры сцен в стиле 3D-мультфильма через шлюз arionhub (gpt-image-2), героиня одна во всех сценах —
// лист персонажа (hero.png) идёт референсом в каждую сцену. Наши настоящие кадры (эскиз сверху, интерьеры) — вторым референсом там,
// где героиня их видит. Обещаем только то, что есть: 3 круга правок, рабочий проект по ГОСТ, бригады через LINEA, кабинет с этапами.
//   node gen.mjs hero | node gen.mjs scenes [s03,s05]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, gateway } from '/Users/alexandr/projects/gost-draft-svod/tools/imgen.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), OUT = path.join(HERE, 'frames'), SRC = path.join(HERE, '..', 'src');
fs.mkdirSync(OUT, { recursive: true });
const SIZE = '2160x3840';
const STYLE = 'High-end 3D animated feature film style (warm, expressive, Pixar-like quality but original characters), soft cinematic lighting, rich warm colours, shallow depth of field, vertical 9:16 frame composed for a phone screen with calm space in the lower third for captions. No text, letters, logos or watermarks anywhere — screens show only abstract UI blocks and pictures.';
const HERO = 'Anna: a friendly woman about 32, warm brown wavy shoulder-length hair, green eyes, light freckles, mustard-yellow knit sweater, dark blue jeans, white sneakers';

export const SCENES = [
  { id: 's01', refs: [], p: `Anna has just walked into her new EMPTY apartment: bare grey concrete walls and floor, exposed wires, a big bright window, a set of keys in her hand, cardboard box by the wall. She looks around a little overwhelmed but hopeful. Wide shot.` },
  { id: 's02', refs: [], p: `Anna sits on the cardboard box in the empty concrete apartment, scrolling her smartphone; the phone screen glows with a stylish interior-design website (abstract blocks with small room pictures, a warm burgundy accent button). Her face lights up — she found it. Medium shot over her shoulder, phone readable as a website but no text.` },
  { id: 's03', refs: [], p: `Close-up: Anna photographs a paper floor plan of the apartment lying on the box with her phone; on the phone screen the plan is being uploaded (progress ring); next to it on the screen small mood pictures (a velvet sofa, a warm kitchen). Cosy light from the window.` },
  { id: 's04', refs: ['top.png'], p: `Anna holds the phone up in the empty apartment, amazed: above the phone floats a glowing holographic 3D dollhouse model of her furnished apartment seen from above — exactly like the second reference image (same layout and colours), small and magical. Delighted expression.` },
  { id: 's05', refs: ['living.png'], p: `Anna on the box with a tablet; the tablet screen shows a beautiful finished living room interior exactly like the second reference image; she swipes, smiling. Soft light, still the empty concrete room around her.` },
  { id: 's06', refs: ['living.png'], p: `Anna types a short message on her phone with a playful thought bubble showing a green velvet sofa replacing a beige one; on the tablet next to her the interior from the second reference image now has a GREEN velvet sofa. She gives a happy thumbs up.` },
  { id: 's07', refs: ['sheet.png'], p: `Anna taps an approve button on the tablet (big green check mark, no text); from the tablet flies out a neat stack of architectural drawing sheets like the second reference image (floor plans, elevations), landing on the box. Proud, satisfied expression.` },
  { id: 's08', refs: [], p: `Doorway of the empty apartment: Anna welcomes a friendly renovation crew of three cartoon workers in clean navy work uniforms and safety helmets with toolboxes; the foreman holds a tablet showing the same architectural drawings. Handshake, everyone smiling. Warm, trustworthy mood.` },
  { id: 's09', refs: [], p: `Renovation in progress in the apartment: the renovation CREW (the same friendly workers in navy uniforms and white helmets — NOT Anna) are working: one plasters a wall, one lays a wooden herringbone floor, one installs a burgundy kitchen; architectural drawings pinned on the wall. Anna appears ONLY ONCE, in the foreground, standing calmly with her phone showing a progress timeline (abstract steps with green check marks), smiling. Anna does not do any construction work. Energetic, clean, one coherent room.` },
  { id: 's10', refs: ['living.png'], p: `The SAME apartment now finished and furnished exactly like the second reference image (same sofa, colours, rug, lamps): Anna stands in the middle with her husband and their 6-year-old son, all joyful, the boy jumping on the sofa, golden evening light. Wide happy final shot.` },
];

async function textToImage(prompt, out, size = '1536x1024') {
  const { KEY, BASE } = gateway('arionhub');
  const r = await fetch(`${BASE}/images/generations`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', prompt, size, quality: 'high', n: 1 }), signal: AbortSignal.timeout(10 * 60 * 1000) });
  const j = await r.json(); const b = j?.data?.[0]?.b64_json;
  if (!b) throw new Error(JSON.stringify(j).slice(0, 300));
  fs.writeFileSync(out, Buffer.from(b, 'base64'));
}

const [cmd, only] = process.argv.slice(2);
if (cmd === 'hero') {
  await textToImage(`Character turnaround sheet of one original 3D animated character: ${HERO}. Front, three-quarter and side views plus three facial expressions (surprised, happy, thoughtful), plain light warm-grey background. ${STYLE.replace('vertical 9:16 frame composed for a phone screen with calm space in the lower third for captions. ', '')}`, path.join(OUT, 'hero.png'), '3840x2160');
  console.log('✔ hero.png');
} else if (cmd === 'scenes') {
  const hero = path.join(OUT, 'hero.png');
  const list = SCENES.filter(s => !only || only.split(',').includes(s.id));
  const run = async s => {
    const refs = s.refs.map(f => path.join(SRC, f));
    const prompt = `Image 1 is the character sheet of ANNA — draw her exactly like that (face, hair, sweater, jeans).${refs.length ? ' Image 2 is a reference picture to show as described.' : ''}\n\nSCENE: ${s.p}\n\nCHARACTER: ${HERO}.\n\nSTYLE: ${STYLE}`;
    for (let a = 1; a <= 3; a++) {
      try { const r = await generate({ clay: hero, extra: refs, prompt, out: path.join(OUT, `${s.id}.png`), size: SIZE, model: 'gpt-image-2', quality: 'high' }); console.log(`✔ ${s.id} ${r.size?.w}×${r.size?.h} ${Math.round(r.sec)} с`); return; }
      catch (e) { console.log(`… ${s.id} попытка ${a}: ${String(e.message).slice(0, 120)}`); }
    }
    console.log(`✖ ${s.id}`);
  };
  for (let i = 0; i < list.length; i += 4) await Promise.all(list.slice(i, i + 4).map(run));   // по 4 параллельно
}
