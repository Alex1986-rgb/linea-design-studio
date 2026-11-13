"""Мультик LINEA (9:16, 1080×1920, 30 к/с): сцены frames/sNN.png (gen.mjs) → плавный наезд/проезд камеры, переходы, титры,
два голоса Яндекс SpeechKit (диктор ermil, Анна alena, эмоция good), своя музыка (music.py) с приглушением под голос.
Обещаем только то, что есть: цена на сайте сразу, 3 круга правок, рабочий проект по ГОСТ, бригады через LINEA, этапы в кабинете.
  set -a; source ~/.claude/secrets/yandex-speechkit.env; set +a; uv run --with pillow --with numpy python build.py  →  linea-multik.mp4, linea-multik-light.mp4"""
import asyncio, json, subprocess, pathlib, os, urllib.request, urllib.parse
from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).resolve().parent
FR, OUT, VOI = HERE / "frames", HERE / "out", HERE / "voice"
OUT.mkdir(exist_ok=True); VOI.mkdir(exist_ok=True)
W, H, FPS, XF = 1080, 1920, 30, 0.6               # кадр, частота, длительность перехода
NARR, ANNA = "ermil", "alena"          # голоса Яндекс SpeechKit (ключ — ~/.claude/secrets/yandex-speechkit.env, YC_API_KEY)
F_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
F_SERIF = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
SITE = "дизайн-студия-квартир.рф"

# реплики: (голос, текст); титр — 1–2 короткие строки; move — zoom_in | zoom_out | pan_up | pan_down
SC = [
    ("s01", [(ANNA, "Ну вот, своя квартира. И с чего начинать?"), (NARR, "Голые стены и тысяча вопросов? Начните с LINEA.")], "Пустая квартира?\nНачните с LINEA", "zoom_in"),
    ("s02", [(NARR, "Дизайн-проект квартиры онлайн. Цена видна сразу на сайте.")], "Дизайн-проект онлайн —\nцена сразу на сайте", "zoom_out"),
    ("s03", [(NARR, "Загрузите план — даже фото. Расскажите, как вы живёте, и приложите картинки, которые нравятся.")], "Загрузите план\nи расскажите о себе", "pan_down"),
    ("s04", [(NARR, "И вот эскиз: ваша квартира сверху, точно по вашему плану, с мебелью и цветом.")], "Эскиз: квартира сверху\nпо вашему плану", "zoom_in"),
    ("s05", [(NARR, "И каждая комната — изнутри, как на фото.")], "Каждая комната —\nизнутри", "pan_up"),
    ("s06", [(ANNA, "А диван — зелёный бархат!"), (NARR, "Правки — просто словами. Три круга правок входят в стоимость.")], "Правки словами —\n3 круга в стоимости", "zoom_out"),
    ("s07", [(NARR, "Согласовали эскиз — получите рабочий проект по ГОСТ: чертежи, развёртки и ведомости.")], "Рабочий проект\nпо ГОСТ", "zoom_in"),
    ("s08", [(NARR, "Бригаду можно найти тоже через LINEA. Мастера работают строго по проекту.")], "Бригада —\nтоже через LINEA", "pan_down"),
    ("s09", [(NARR, "А этапы ремонта видны в личном кабинете.")], "Этапы ремонта —\nв личном кабинете", "zoom_out"),
    ("s10", [(ANNA, "Всё как на эскизе!"), (NARR, "Квартира под ключ — по вашему проекту.")], "Квартира под ключ —\nкак на эскизе", "zoom_in"),
    ("end", [(NARR, "LINEA. Дизайн-проект и ремонт квартиры. Дизайн-студия-квартир точка рф.")], "", "none"),
]

def sh(*a): subprocess.run([str(x) for x in a], check=True)
def dur(f): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)], capture_output=True, text=True).stdout)

async def tts():
    lens = {}
    for sid, lines, _, _ in SC:
        parts = []
        for k, (v, text) in enumerate(lines):
            mp3 = VOI / f"{sid}-{k}.ogg"
            if not mp3.exists():
                body = urllib.parse.urlencode({"text": text, "lang": "ru-RU", "voice": v, "emotion": "good", "speed": "1.05" if v == NARR else "1.0"}).encode()
                req = urllib.request.Request("https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize", data=body, headers={"Authorization": "Api-Key " + os.environ["YC_API_KEY"]})
                mp3.write_bytes(urllib.request.urlopen(req, timeout=60).read())
            wav = mp3.with_suffix(".wav")
            sh("ffmpeg", "-loglevel", "error", "-y", "-i", mp3, "-af",
               "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.35",
               "-ar", "48000", "-ac", "1", wav)
            parts.append(wav)
        lst = VOI / f"{sid}.txt"; lst.write_text("".join(f"file '{p.name}'\n" for p in parts))
        sh("ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", VOI / f"{sid}.wav")
        lens[sid] = dur(VOI / f"{sid}.wav")
    return lens

def caption(title, path, end=False):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if end:
        d.rectangle([0, 0, W, H], fill=(29, 27, 24, 255))
        d.text((W / 2, 760), "LINEA", font=ImageFont.truetype(F_SERIF, 160), fill=(232, 220, 196, 255), anchor="mm")
        d.text((W / 2, 905), "дизайн-проект и ремонт квартиры", font=ImageFont.truetype(F_BOLD, 50), fill=(232, 220, 196, 255), anchor="mm")
        d.rounded_rectangle([110, 1070, W - 110, 1196], radius=63, fill=(180, 70, 43, 255))
        d.text((W / 2, 1133), SITE, font=ImageFont.truetype(F_BOLD, 47), fill=(255, 255, 255, 255), anchor="mm")
        d.text((W / 2, 1290), "план  →  эскиз  →  чертежи  →  ремонт", font=ImageFont.truetype(F_BOLD, 38), fill=(170, 160, 140, 255), anchor="mm")
    else:
        for y in range(H - 700, H):
            a = int(200 * ((y - (H - 700)) / 700) ** 1.4); d.line([(0, y), (W, y)], fill=(18, 16, 14, a))
        d.multiline_text((70, H - 300), title, font=ImageFont.truetype(F_BOLD, 74), fill=(255, 255, 255, 255), spacing=12, anchor="ld",
                         stroke_width=2, stroke_fill=(18, 16, 14, 160))
        d.text((70, H - 160), "LINEA", font=ImageFont.truetype(F_SERIF, 46), fill=(232, 220, 196, 255))
        d.text((W - 70, H - 140), SITE, font=ImageFont.truetype(F_BOLD, 32), fill=(232, 220, 196, 235), anchor="rm")
    im.save(path)

def scene(sid, seconds, move, cap, out):
    n = int(round(seconds * FPS))
    if sid == "end":
        sh("ffmpeg", "-loglevel", "error", "-y", "-loop", "1", "-t", f"{seconds:.3f}", "-i", cap, "-vf", f"fps={FPS},format=yuv420p",
           "-c:v", "libx264", "-crf", "17", "-preset", "medium", out); return
    # zoompan по картинке, увеличенной ×2 (без «дрожи» целых пикселей); итог 1080×1920
    z = {"zoom_in": f"1.0+0.10*on/{n}", "zoom_out": f"1.10-0.10*on/{n}", "pan_up": "1.10", "pan_down": "1.10"}[move]
    y = {"pan_up": f"(ih-ih/zoom)*(1-on/{n})", "pan_down": f"(ih-ih/zoom)*on/{n}"}.get(move, "(ih-ih/zoom)/2")
    vf = (f"scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,scale=4320:7680,"
          f"zoompan=z='{z}':x='(iw-iw/zoom)/2':y='{y}':d={n}:s={W}x{H}:fps={FPS},format=yuv420p")
    tmp = OUT / f"{sid}-raw.mp4"
    sh("ffmpeg", "-loglevel", "error", "-y", "-i", FR / f"{sid}.png", "-vf", vf, "-frames:v", n, "-c:v", "libx264", "-crf", "16", "-preset", "medium", tmp)
    sh("ffmpeg", "-loglevel", "error", "-y", "-i", tmp, "-loop", "1", "-i", cap, "-filter_complex",
       "[1]format=rgba,fade=t=in:st=0.35:d=0.4:alpha=1[o];[0][o]overlay=0:0:shortest=1,format=yuv420p",
       "-frames:v", n, "-c:v", "libx264", "-crf", "16", "-preset", "medium", out)

def main():
    lens = asyncio.run(tts())
    clips, starts, t = [], [], 0.0
    for i, (sid, _, title, move) in enumerate(SC):
        seconds = round(lens[sid] + 0.9 + (XF if i < len(SC) - 1 else 0) + (1.2 if sid == "end" else 0), 2)
        cap = OUT / f"{sid}-cap.png"; caption(title, cap, end=sid == "end")
        c = OUT / f"{sid}.mp4"; scene(sid, seconds, move, cap, c); clips.append((c, seconds))
        starts.append(t + 0.35); t += seconds - (XF if i < len(SC) - 1 else 0)
    total = t
    # переходы: xfade «fade» между сценами
    inputs, fc, prev, off = [], [], "0:v", 0.0
    for c, _ in clips: inputs += ["-i", c]
    for i in range(1, len(clips)):
        off += clips[i - 1][1] - XF
        lab = f"v{i}"; fc.append(f"[{prev}][{i}:v]xfade=transition={'fade' if i % 3 else 'smoothleft'}:duration={XF}:offset={off:.3f}[{lab}]"); prev = lab
    sh("ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", ";".join(fc), "-map", f"[{prev}]", "-c:v", "libx264", "-crf", "17", "-preset", "medium",
       "-pix_fmt", "yuv420p", OUT / "video.mp4")
    # голос: реплики сцен на своих местах
    ains, amix = [], []
    for i, (sid, *_r) in enumerate(SC):
        ains += ["-i", VOI / f"{sid}.wav"]; ms = int(starts[i] * 1000); amix.append(f"[{i}]adelay={ms}|{ms}[a{i}]")
    sh("ffmpeg", "-loglevel", "error", "-y", *ains, "-filter_complex", ";".join(amix) + ";" + "".join(f"[a{i}]" for i in range(len(SC))) +
       f"amix=inputs={len(SC)}:normalize=0,apad=whole_dur={total:.2f},loudnorm=I=-15:TP=-1.5:LRA=7[v]", "-map", "[v]", "-ar", "48000", "-ac", "2", OUT / "voice.wav")
    sh("uv", "run", "-q", "--with", "numpy", "python", HERE / "music.py", f"{total:.2f}", OUT / "music.wav")
    # музыка тише и уходит вниз под голос (sidechain), затем смесь
    sh("ffmpeg", "-loglevel", "error", "-y", "-i", OUT / "music.wav", "-i", OUT / "voice.wav", "-filter_complex",
       "[0]volume=0.42[m];[1]asplit[v1][v2];[m][v1]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[md];[md][v2]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]",
       "-map", "[a]", "-ar", "48000", OUT / "mix.wav")
    final = HERE / "linea-multik.mp4"
    sh("ffmpeg", "-loglevel", "error", "-y", "-i", OUT / "video.mp4", "-i", OUT / "mix.wav", "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow",
       "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", final)
    sh("ffmpeg", "-loglevel", "error", "-y", "-i", final, "-c:v", "libx264", "-crf", "25", "-preset", "slow", "-c:a", "copy", "-movflags", "+faststart",
       HERE / "linea-multik-light.mp4")
    print("готово:", final, round(dur(final), 1), "с")

if __name__ == "__main__":
    main()
