#!/usr/bin/env python3
"""Сборка промпта из частей: задача + сцена + блок качества.

Качество рендера описывается одинаково для всех кадров и живёт в одном файле,
поэтому правка «света» или «материалов» меняет разом все будущие визуализации,
а не переписывается в каждом промпте заново.

  python3 tools/prompt-build.py dollhouse scene.txt > out.txt
  python3 tools/prompt-build.py interior "Living room with a grey sofa..." > out.txt
"""
import pathlib, sys

P = pathlib.Path(__file__).resolve().parent / "prompts"

def build(kind, scene):
    base = (P / f"{kind}.txt").read_text(encoding="utf-8").strip()
    quality = (P / "_quality.txt").read_text(encoding="utf-8").strip()
    scene = scene.strip()
    return f"{base}\n\nSCENE AND STYLE:\n{scene}\n\n{quality}\n"

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("нужно: prompt-build.py <dollhouse|interior> <файл-сцены или текст>")
    kind, arg = sys.argv[1], sys.argv[2]
    p = pathlib.Path(arg)
    scene = p.read_text(encoding="utf-8") if p.exists() else arg
    print(build(kind, scene))
