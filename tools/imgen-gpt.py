#!/usr/bin/env python3
"""Генерация визуализаций через ArionHub.

Две модели ходят разными путями, и это не взаимозаменяемо:
  gpt-image-2        → /images/generations   (через /chat/completions отдаёт 400)
  gemini-3-pro-image → /chat/completions     (через /images/generations отдаёт 401)
Скрипт выбирает путь сам по имени модели.

  python3 tools/imgen-gpt.py tasks.json --outdir <папка> [--model gpt-image-2] [--size 1024x1024]
tasks.json: [{"name": "kitchen", "prompt": "..."}]
"""
import argparse, base64, json, pathlib, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

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

KEY, BASE = cfg()

def post(path, payload, timeout=600):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode(),
                                 headers={"Authorization": "Bearer " + KEY,
                                          "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

def gen(task, outdir, model, size, tries=2):
    out = pathlib.Path(outdir) / f"{task['name']}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    last = ""
    for _ in range(tries):
        try:
            if model.startswith("gpt-image"):
                d = post("/images/generations", {"model": model, "prompt": task["prompt"],
                                                 "size": size, "n": 1})
                item = d["data"][0]
                if item.get("b64_json"):
                    out.write_bytes(base64.b64decode(item["b64_json"]))
                else:
                    with urllib.request.urlopen(item["url"], timeout=600) as im:
                        out.write_bytes(im.read())
            else:
                d = post("/chat/completions", {"model": model, "messages": [
                    {"role": "user", "content": task["prompt"]}],
                    "image_config": {"aspect_ratio": task.get("ratio", "1:1"), "image_size": "2K"}})
                txt = d["choices"][0]["message"]["content"]
                m = re.search(r"data:image/\w+;base64,([A-Za-z0-9+/=]+)", txt)
                if not m:
                    raise RuntimeError("в ответе нет картинки")
                out.write_bytes(base64.b64decode(m.group(1)))
            return task["name"], out, out.stat().st_size // 1024, None
        except Exception as e:
            last = f"{type(e).__name__}: {e}"
    return task["name"], None, 0, last

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("tasks")
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--model", default="gpt-image-2")
    ap.add_argument("--size", default="1024x1024")
    ap.add_argument("-j", type=int, default=3)
    a = ap.parse_args()
    tasks = json.loads(pathlib.Path(a.tasks).read_text(encoding="utf-8"))
    print(f"задач: {len(tasks)}, модель: {a.model}")
    ok = fail = 0
    with ThreadPoolExecutor(max_workers=a.j) as ex:
        futs = [ex.submit(gen, t, a.outdir, a.model, a.size) for t in tasks]
        for f in as_completed(futs):
            name, path, kb, err = f.result()
            if path:
                ok += 1
                print(f"  {name:28s} ok {kb} КБ")
            else:
                fail += 1
                print(f"  {name:28s} FAIL {err}")
    print(f"итого: ok={ok} fail={fail}")

if __name__ == "__main__":
    main()
