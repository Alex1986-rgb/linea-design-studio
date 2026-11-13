"""Рекламный ролик LINEA для телефона: 9:16, 1080×1920, ≈ 45 с, озвучка на русском (edge-tts ru-RU-DmitryNeural).
Кадры — наши (эскиз демо-плана по плану заказчика, интерьеры, лист чертежа движка). На сайте и в рекламе не пишем «бесплатно»,
«0 ₽», «без предоплаты», «48 часов»; только квартиры; обещаем только то, что есть (3 круга правок — config rounds).
  uv run --with edge-tts --with pillow python build.py  →  out/linea-45s.mp4 (+ out/linea-45s-light.mp4 для телефона)
"""
import asyncio, json, subprocess, pathlib
import edge_tts
from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).resolve().parent
SRC, OUT, VOI = HERE / "src", HERE / "out", HERE / "voice"
OUT.mkdir(exist_ok=True); VOI.mkdir(exist_ok=True)
W, H, FPS = 1080, 1920, 30
VOICE, RATE = "ru-RU-DmitryNeural", "+8%"
F_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
F_SERIF = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf" if pathlib.Path("/System/Library/Fonts/Supplemental/Georgia Bold.ttf").exists() else F_BOLD

# сцена: картинки (сменяются внутри сцены), титр, текст диктора; пан — направление движения камеры
SCENES = [
    {"id": "s1", "imgs": ["top.png"], "title": "Квартира готова —\nещё до ремонта", "voice": "Хотите увидеть свою квартиру готовой — ещё до начала ремонта?", "pan": 1},
    {"id": "s2", "imgs": ["plan.png"], "title": "Загрузите план —\nфото или скан", "voice": "Загрузите план квартиры. Подойдёт даже фотография или скан.", "pan": -1},
    {"id": "s3", "imgs": ["ref.png"], "title": "Расскажите,\nкак вы живёте", "voice": "Расскажите, как вы живёте и что вам нравится. Можно приложить картинки, которые вдохновляют.", "pan": 1},
    {"id": "s4", "imgs": ["top.png"], "title": "Эскиз: квартира\nсверху, по вашему плану", "voice": "Мы покажем эскиз: вашу квартиру сверху, точно по вашему плану, с мебелью и материалами.", "pan": -1},
    {"id": "s5", "imgs": ["living.png", "bedroom.png", "kids.png", "study.png"], "title": "И каждая комната\nизнутри", "voice": "И каждую комнату — изнутри, как на фотографии. Гостиная, спальня, детская, кабинет.", "pan": 1},
    {"id": "s6", "imgs": ["bath.png"], "title": "Правки — словами.\n3 круга в стоимости", "voice": "Хотите другой цвет дивана? Просто напишите правку словами. Три круга правок входят в стоимость.", "pan": -1},
    {"id": "s7", "imgs": ["sheet.png"], "title": "Рабочий проект\nпо ГОСТ", "voice": "После согласования — рабочий проект по ГОСТ: чертежи, развёртки и ведомости для бригады.", "pan": 1},
    {"id": "s8", "imgs": [], "title": "", "voice": "LINEA. Дизайн-проект квартиры. Заказ — на сайте дизайн-студия-квартир точка рф.", "pan": 0},
]
SITE = "дизайн-студия-квартир.рф"

def sh(*a): subprocess.run(a, check=True)
def dur(f): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)], capture_output=True, text=True).stdout)

async def tts():
    for s in SCENES:
        mp3 = VOI / f"{s['id']}.mp3"
        await edge_tts.Communicate(s["voice"], VOICE, rate=RATE).save(str(mp3))
        wav = mp3.with_suffix(".wav")
        sh("ffmpeg", "-loglevel", "error", "-y", "-i", str(mp3), "-af",
           "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse",
           "-ar", "48000", "-ac", "1", str(wav))
        s["dur"] = dur(wav)

def overlay(title, path, end=False):
    """Титр поверх кадра: затемнение снизу и крупный текст; финал — тёмная карточка с логотипом и адресом."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if end:
        d.rectangle([0, 0, W, H], fill=(29, 27, 24, 255))
        f1, f2, f3 = ImageFont.truetype(F_SERIF, 150), ImageFont.truetype(F_BOLD, 54), ImageFont.truetype(F_BOLD, 46)
        d.text((W / 2, 760), "LINEA", font=f1, fill=(232, 220, 196, 255), anchor="mm")
        d.text((W / 2, 900), "дизайн-проект квартиры", font=f2, fill=(232, 220, 196, 255), anchor="mm")
        d.rounded_rectangle([120, 1080, W - 120, 1200], radius=60, fill=(180, 70, 43, 255))
        d.text((W / 2, 1140), SITE, font=f3, fill=(255, 255, 255, 255), anchor="mm")
        d.text((W / 2, 1290), "план → эскиз → чертежи", font=ImageFont.truetype(F_BOLD, 40), fill=(170, 160, 140, 255), anchor="mm")
    else:
        for y in range(H - 760, H):                                   # мягкое затемнение снизу под титр
            a = int(215 * ((y - (H - 760)) / 760) ** 1.3); d.line([(0, y), (W, y)], fill=(18, 16, 14, a))
        f = ImageFont.truetype(F_BOLD, 76)
        d.multiline_text((72, H - 330), title, font=f, fill=(255, 255, 255, 255), spacing=14, anchor="ld")
        d.text((72, H - 170), "LINEA", font=ImageFont.truetype(F_SERIF, 48), fill=(232, 220, 196, 255))
        d.text((W - 72, H - 150), SITE, font=ImageFont.truetype(F_BOLD, 34), fill=(232, 220, 196, 230), anchor="rm")
    im.save(path)

def clip(img, seconds, pan, out):
    """Картинка → 9:16 с плавным проездом камеры по горизонтали (или вертикали для высоких картинок)."""
    src = Image.open(SRC / img); w, h = src.size
    if w / h >= W / H:   # широкая: высота 1920 × 1.06, едем по x
        sh("ffmpeg", "-loglevel", "error", "-y", "-loop", "1", "-t", f"{seconds:.2f}", "-i", str(SRC / img), "-vf",
           f"scale=-2:{int(H*1.06)},crop={W}:{H}:x='(iw-{W})*({0 if pan>0 else 1}+{pan}*t/{seconds:.2f})':y='(ih-{H})/2',fps={FPS},format=yuv420p",
           "-c:v", "libx264", "-preset", "medium", "-crf", "18", str(out))
    else:
        sh("ffmpeg", "-loglevel", "error", "-y", "-loop", "1", "-t", f"{seconds:.2f}", "-i", str(SRC / img), "-vf",
           f"scale={int(W*1.06)}:-2,crop={W}:{H}:x='(iw-{W})/2':y='(ih-{H})*t/{seconds:.2f}',fps={FPS},format=yuv420p",
           "-c:v", "libx264", "-preset", "medium", "-crf", "18", str(out))

def main():
    asyncio.run(tts())
    gap = 0.25
    parts, auds = [], []
    for s in SCENES:
        s["len"] = round(s["dur"] + gap, 2)
        ov = OUT / f"{s['id']}-ov.png"; overlay(s["title"], ov, end=not s["imgs"])
        sub = []
        if s["imgs"]:
            k = len(s["imgs"]); each = s["len"] / k
            for i, im in enumerate(s["imgs"]):
                c = OUT / f"{s['id']}-{i}.mp4"; clip(im, each, s["pan"] if i % 2 == 0 else -s["pan"], c); sub.append(c)
        else:
            c = OUT / f"{s['id']}-0.mp4"
            sh("ffmpeg", "-loglevel", "error", "-y", "-loop", "1", "-t", f"{s['len']:.2f}", "-i", str(ov), "-vf", f"fps={FPS},format=yuv420p", "-c:v", "libx264", "-crf", "18", str(c)); sub.append(c)
        lst = OUT / f"{s['id']}.txt"; lst.write_text("".join(f"file '{p.name}'\n" for p in sub))
        base = OUT / f"{s['id']}-base.mp4"; sh("ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(base))
        scene = OUT / f"{s['id']}.mp4"
        if s["imgs"]:
            sh("ffmpeg", "-loglevel", "error", "-y", "-i", str(base), "-loop", "1", "-i", str(ov), "-filter_complex",
               f"[1]format=rgba,fade=t=in:st=0:d=0.3:alpha=1[o];[0][o]overlay=0:0:shortest=1,fade=t=in:st=0:d=0.15,format=yuv420p", "-t", f"{s['len']:.2f}",
               "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", str(FPS), str(scene))
        else:
            base.rename(scene)
        parts.append(scene)
        # голос сцены + тишина до конца сцены
        a = OUT / f"{s['id']}-a.wav"
        sh("ffmpeg", "-loglevel", "error", "-y", "-i", str(VOI / f"{s['id']}.wav"), "-af", f"adelay=80|80,apad=whole_dur={s['len']:.2f}", "-ar", "48000", "-ac", "1", str(a)); auds.append(a)
    total = sum(s["len"] for s in SCENES)
    print("длительность:", round(total, 2), "с", [(s["id"], s["len"]) for s in SCENES])
    (OUT / "v.txt").write_text("".join(f"file '{p.name}'\n" for p in parts)); (OUT / "a.txt").write_text("".join(f"file '{p.name}'\n" for p in auds))
    sh("ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(OUT / "v.txt"), "-c", "copy", str(OUT / "video.mp4"))
    sh("ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(OUT / "a.txt"), "-af", "loudnorm=I=-14:TP=-1.5:LRA=7", "-ar", "48000", str(OUT / "voice.wav"))
    final = HERE / "linea-45s.mp4"
    sh("ffmpeg", "-loglevel", "error", "-y", "-i", str(OUT / "video.mp4"), "-i", str(OUT / "voice.wav"), "-map", "0:v", "-map", "1:a",
       "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest", str(final))
    sh("ffmpeg", "-loglevel", "error", "-y", "-i", str(final), "-c:v", "libx264", "-crf", "25", "-preset", "slow", "-c:a", "copy", "-movflags", "+faststart", str(HERE / "linea-45s-light.mp4"))
    print("готово:", final, round(dur(final), 2), "с")

if __name__ == "__main__":
    main()
