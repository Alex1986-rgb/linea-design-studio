#!/usr/bin/env python3
"""Визуализация по чертежу: картинка-референс + текст → фотореалистичный рендер.

ArionHub принимает референс только на /images/edits (multipart), а не в chat/completions —
там изображение на входе отвергается. Поэтому путь здесь один и жёстко задан.

  python3 tools/img2img.py <чертёж.png> --out <файл.png> [--size 1536x1024] [--prompt-file f.txt]
"""
import argparse, base64, json, mimetypes, pathlib, sys, urllib.request, uuid

SECRETS = pathlib.Path("~/.claude/secrets/arionhub.env").expanduser()

def cfg():
    key = base = ""
    for line in SECRETS.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k == "ROUTER_CHEAP_API_KEY":
                key = v
            elif k == "ROUTER_CHEAP_BASE_URL":
                base = v.rstrip("/")
    if not key:
        sys.exit(f"нет ключа: {SECRETS}")
    return key, base or "https://arionhub.pro/v1"

DEFAULT_PROMPT = (
    "Turn this architectural floor plan into a photorealistic 3D dollhouse render. "
    "Keep the EXACT layout of the drawing: every wall, door and window stays in its place, "
    "every room keeps its shape and proportions, and every piece of furniture stays exactly "
    "where it is drawn, with the same size and orientation. "
    "Aerial view tilted about 35 degrees, ceiling removed, partition walls at full height, "
    "the apartment as one block on a plain light background with a soft shadow. "
    "Modern contemporary interior: light walls, herringbone oak floor in living areas, "
    "large-format grey tile in wet rooms, black metal accents, warm lamp light with daylight "
    "from the windows, plants, textiles, realistic materials and shadows. "
    "No people, no text, no numbers, no dimension lines, no labels, no watermark."
)

def edit(image, prompt, out, model="gpt-image-2", size="1536x1024", timeout=900):
    key, base = cfg()
    data = pathlib.Path(image).read_bytes()
    ctype = mimetypes.guess_type(image)[0] or "image/png"
    boundary = "----linea" + uuid.uuid4().hex
    parts = []
    for name, value in (("model", model), ("prompt", prompt), ("size", size), ("n", "1")):
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    parts.append(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; "
        f"filename=\"{pathlib.Path(image).name}\"\r\nContent-Type: {ctype}\r\n\r\n".encode()
        + data + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)
    req = urllib.request.Request(base + "/images/edits", data=body, headers={
        "Authorization": "Bearer " + key,
        "Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.load(r)
    item = d["data"][0]
    out = pathlib.Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    if item.get("b64_json"):
        out.write_bytes(base64.b64decode(item["b64_json"]))
    else:
        with urllib.request.urlopen(item["url"], timeout=timeout) as im:
            out.write_bytes(im.read())
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="gpt-image-2")
    ap.add_argument("--size", default="1536x1024")
    ap.add_argument("--prompt")
    ap.add_argument("--prompt-file")
    a = ap.parse_args()
    prompt = a.prompt or (pathlib.Path(a.prompt_file).read_text(encoding="utf-8") if a.prompt_file else DEFAULT_PROMPT)
    out = edit(a.image, prompt, a.out, a.model, a.size)
    print(f"готово: {out} ({out.stat().st_size // 1024} КБ)")

if __name__ == "__main__":
    main()
