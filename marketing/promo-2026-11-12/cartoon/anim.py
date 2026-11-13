"""Оживление сцен мультика: frames/sNN.png → видеоклип grok-imagine-video-1.5 (шлюз arionhub, POST /videos multipart с картинкой-основой,
GET /videos/<id> до completed, GET /videos/<id>/content). Ключ — ~/.claude/secrets/arionhub.env (ROUTER_CHEAP_*), в код не пишется.
  set -a; source ~/.claude/secrets/arionhub.env; set +a; python3 anim.py [s02,s03]   →  video/sNN.mp4"""
import json, os, subprocess, sys, time, pathlib, concurrent.futures as cf

HERE = pathlib.Path(__file__).resolve().parent; V = HERE / "video"; V.mkdir(exist_ok=True)
KEY, BASE = os.environ["ROUTER_CHEAP_API_KEY"], os.environ["ROUTER_CHEAP_BASE_URL"].rstrip("/")
STYLE = "Keep the exact 3D cartoon style, characters and faces of the image; smooth natural animation, gentle cinematic camera move, no text appears."
MOTION = {
    "s01": "The woman looks around the empty apartment, smiles and raises her keys; soft camera push-in, warm sunlight.",
    "s02": "The woman scrolls her phone with her finger, her eyes widen and she smiles happily — she found it; slight camera drift.",
    "s03": "She takes a photo of the paper floor plan with her phone, the upload ring on the screen fills; steam rises from the cup.",
    "s04": "The glowing 3D apartment hologram above the phone slowly rotates and sparkles; she gasps with delight and waves her hand.",
    "s05": "She swipes on the tablet, the interior picture changes to another room; she smiles and nods; slow camera push-in.",
    "s06": "She types on the phone, the thought bubble pops, on the tablet the sofa turns green; she laughs and gives a thumbs up.",
    "s07": "She taps the green check mark, drawing sheets fly out of the tablet and land neatly in the box; she smiles proudly.",
    "s08": "She shakes hands with the foreman at the door, the workers nod and smile, the foreman shows the drawings on his tablet.",
    "s09": "The workers plaster, lay the floor and install the kitchen in the background; in front she shows the progress on her phone and winks.",
    "s10": "The boy bounces on the sofa, the husband laughs and hugs her, she spreads her arms happily; warm evening light, slow camera pull-back.",
}

def curl(*a):
    r = subprocess.run(["curl", "-s", "-m", "180", "-H", f"Authorization: Bearer {KEY}", *a], capture_output=True, text=True)
    return r.stdout

def one(sid, seconds=6):
    out = V / f"{sid}.mp4"
    if out.exists() and out.stat().st_size > 100_000: return f"{sid}: уже есть"
    for attempt in range(3):
        r = curl("-X", "POST", f"{BASE}/videos", "-F", "model=grok-imagine-video-1.5", "-F", f"prompt={MOTION[sid]} {STYLE}",
                 "-F", f"seconds={seconds}", "-F", "size=720x1280", "-F", f"input_reference=@{HERE / 'frames' / (sid + '.png')};type=image/png")
        try: tid = json.loads(r)["id"]
        except Exception: time.sleep(20); continue
        for _ in range(80):
            time.sleep(10)
            try: st = json.loads(curl(f"{BASE}/videos/{tid}")).get("status")
            except Exception: st = "?"
            if st in ("completed", "failed", "error"): break
        if st == "completed":
            subprocess.run(["curl", "-s", "-m", "180", "-L", "-o", str(out), "-H", f"Authorization: Bearer {KEY}", f"{BASE}/videos/{tid}/content"], check=True)
            return f"{sid}: готово ({tid})"
    return f"{sid}: НЕ ПОЛУЧИЛОСЬ ({r[:160]})"

ids = sys.argv[1].split(",") if len(sys.argv) > 1 else list(MOTION)
with cf.ThreadPoolExecutor(4) as ex:
    for line in ex.map(one, ids): print(line, flush=True)
