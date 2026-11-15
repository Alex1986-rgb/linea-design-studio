#!/usr/bin/env python3
"""Сборка промпта визуализации из частей: задача + ДНК проекта + сцена + элитный уровень + качество.

Зачем так: качество рендера (физика света, запреты) одинаково для всех кадров и живёт в одном
файле, а материалы и свет — РАЗНЫЕ у каждого проекта и берутся из его ДНК (clients/<slug>/dna.json,
стандарт — docs/design/elite-standard.md). Раньше материалы были зашиты в _quality.txt, и все
проекты получали одни и те же «известь, белый дуб, латунь» — отсюда похожесть.

  # по-старому, без ДНК (материалы и свет — из _materials-default.txt и _light-default.txt):
  python3 tools/prompt-build.py dollhouse scene.txt > out.txt
  python3 tools/prompt-build.py interior "Living room with a grey sofa..." > out.txt

  # с ДНК: сцена комнаты берётся из dna.rooms[<room>], свой текст дописывается после неё
  python3 tools/prompt-build.py interior --dna clients/x/dna.json --room living
  python3 tools/prompt-build.py interior --dna clients/x/dna.json --room living --evening "extra scene"

  # проверить dna.json по схеме (concept-designer запускает после записи)
  python3 tools/prompt-build.py --check-dna clients/x/dna.json
"""
import argparse
import json
import pathlib
import re
import sys

P = pathlib.Path(__file__).resolve().parent / "prompts"
KINDS = ("interior", "dollhouse")
# Уровни, на которых блок _elite.txt включается сам (архитектура вместо мебели, сдержанный стайлинг)
ELITE_TIERS = {"elite", "premium"}


class DnaError(ValueError):
    """dna.json не соответствует схеме из examples/dna/elite-modern.json."""


def _read(name: str) -> str:
    return (P / name).read_text(encoding="utf-8").strip()


def _text(obj, key: str) -> str:
    """Строка поля или ''. null и не-строки считаем пустыми: str(None) == 'None' прошёл бы проверку."""
    v = obj.get(key) if isinstance(obj, dict) else None
    return v.strip() if isinstance(v, str) else ""


def _cap(s: str) -> str:
    """Фраза с заглавной: в dna.json свет пишут как продолжение предложения, в промпте он открывает блок."""
    return s[:1].upper() + s[1:]


HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
PALETTE_ROLES = ("base", "support", "anchor", "accent", "metal")


def check_dna(dna) -> list:
    """Список ошибок схемы; пустой список — ДНК годится для промптов.

    Проверяем ровно то, без чего промпт выйдет пустым или «как у всех»: идея, 3 приёма,
    3–5 материалов, пол, палитра, свет, комнаты. «Правило трёх» — из стандарта, раздел 1.
    """
    if not isinstance(dna, dict):
        return ["ДНК должна быть JSON-объектом"]
    errs = []
    if not _text(dna, "idea_en"):
        errs.append("нет idea_en — образа проекта для промпта")
    if "tier" in dna and not isinstance(dna["tier"], str):
        errs.append("tier: должен быть строкой (elite, premium, business, econom)")
    moves = dna.get("moves") if isinstance(dna.get("moves"), list) else []
    if len(moves) != 3:
        errs.append(f"moves: нужно ровно 3 сквозных приёма, сейчас {len(moves)}")
    errs += [f"moves[{i}]: нет en" for i, m in enumerate(moves) if not _text(m, "en")]
    move_en = [_text(m, "en").lower() for m in moves if _text(m, "en")]
    if len(set(move_en)) != len(move_en):
        errs.append("moves: приёмы повторяются")
    mats = dna.get("materials") if isinstance(dna.get("materials"), list) else []
    if not 3 <= len(mats) <= 5:
        errs.append(f"materials: нужно 3–5 материалов, сейчас {len(mats)}")
    errs += [f"materials[{i}]: нет en" for i, m in enumerate(mats) if not _text(m, "en")]
    if not _text(dna.get("floor"), "en"):
        errs.append("floor.en: нет пола — без него кадры серии расходятся по полу (art-check, п. 10)")
    if not _text(dna.get("light"), "en"):
        errs.append("light.en: нет характера света")
    pal = dna.get("palette") if isinstance(dna.get("palette"), dict) else {}
    if not _text(pal, "en"):
        errs.append("palette.en: нет палитры словами")
    errs += [f"palette.{r}: нужен HEX вида #RRGGBB" for r in PALETTE_ROLES if not HEX.match(_text(pal, r))]
    avoid = dna.get("avoid", [])
    if not isinstance(avoid, list) or any(not _text(a, "en") for a in avoid):
        errs.append("avoid: список объектов с непустым en")
    rooms = dna.get("rooms")
    if not isinstance(rooms, dict) or not rooms:
        errs.append("rooms: нет ни одного помещения")
    else:
        errs += [f"rooms.{k}: нет en" for k, r in rooms.items() if not _text(r, "en")]
    return errs


def load_dna(path: pathlib.Path) -> dict:
    try:
        dna = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise DnaError(f"нет файла ДНК: {path}")
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise DnaError(f"{path}: битый JSON ({e})")
    errs = check_dna(dna)
    if errs:
        raise DnaError(f"{path}: " + "; ".join(errs))
    return dna


def dna_blocks(dna: dict, room, evening: bool) -> tuple:
    """Блоки DESIGN DNA, MATERIALS, LIGHT и сцена из ДНК.

    room=None — вся квартира (вид сверху): приёмы показываются по квартире, а не в одной комнате.
    """
    rooms = dna["rooms"]
    if room is not None and room not in rooms:
        raise DnaError(f"комнаты «{room}» нет в ДНК; есть: {', '.join(rooms)}")
    moves = "\n".join(f"- {_text(m, 'en')}" for m in dna["moves"])
    where = ("Show every move that fits this room's function: all three in living rooms, kitchens and "
             "bedrooms, at least two in bathrooms, halls and service rooms"
             if room is not None else "Each move appears in several rooms across the apartment")
    design = (
        "DESIGN DNA — THE IDEA THAT EVERY FRAME OF THIS PROJECT SHARES:\n"
        f"{_text(dna, 'idea_en').rstrip('.')}.\n"
        f"Three signature moves. {where}:\n{moves}\n"
        f"Palette: {_text(dna['palette'], 'en').rstrip('.')}."
    )
    materials = (
        "PRIMARY MATERIALS — THE ROOM'S SURFACES ARE BUILT FROM THESE, EACH A REAL TACTILE SURFACE:\n"
        + "; ".join(_text(m, "en") for m in dna["materials"])
        + f".\nFloor throughout: {_text(dna['floor'], 'en').rstrip('.')}."
        + "\nDo not introduce other wood species, stones or metals."
    )
    avoid = [_text(a, "en") for a in dna.get("avoid", [])]
    if avoid:
        materials += "\nAvoid in this project: " + "; ".join(avoid) + "."
    light = dna["light"]
    mood = _text(light, "evening_en" if evening else "day_en")
    base = _cap(_text(light, "en").rstrip("."))
    light_block = "LIGHT:\n" + base + "." + (f" {_cap(mood).rstrip('.')}." if mood else "")
    if room is not None:
        scene = _text(rooms[room], "en")
    else:
        scene = "Rooms of the apartment: " + "; ".join(_text(r, "en") for r in rooms.values())
    return design, materials, light_block, scene


def build(kind: str, scene: str = "", dna: dict = None, room: str = None,
          evening: bool = False, elite: bool = None) -> str:
    """Собирает промпт. elite=None — включить элитный блок по dna.tier.

    С ДНК кадр интерьера требует room; вид сверху (dollhouse) берёт всю квартиру, room не нужен.
    """
    if kind not in KINDS:
        raise ValueError(f"вид кадра {kind!r}; нужно одно из: {', '.join(KINDS)}")
    parts = [_read(f"{kind}.txt")]
    if dna is not None:
        if kind == "interior" and not room:
            raise DnaError("для interior с --dna нужен --room: ДНК задаёт сцену конкретной комнаты")
        design, materials, light, dna_scene = dna_blocks(dna, room, evening)
        scene = dna_scene + ("\n" + scene.strip() if scene.strip() else "")
        parts.append(design)
    if not scene.strip():
        raise ValueError("пустая сцена: дай текст сцены или --dna с --room")
    parts.append("SCENE AND STYLE:\n" + scene.strip())
    if elite is None:
        elite = dna is not None and _text(dna, "tier").lower() in ELITE_TIERS
    if elite:
        parts.append(_read("_elite.txt"))
    if dna is not None:
        parts += [materials, light]
    else:
        parts += [_read("_materials-default.txt"), _read("_light-default.txt")]
    parts.append(_read("_quality.txt"))
    # «Уютный беспорядок» (плед наброшен, чашка, книга) спорит со сдержанным стайлингом элитного уровня
    if not elite:
        parts.append(_read("_lived-in.txt"))
    return "\n\n".join(parts) + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Сборка промпта визуализации LINEA")
    ap.add_argument("kind", nargs="?", choices=KINDS)
    ap.add_argument("scene", nargs="?", default="", help="текст сцены или путь к файлу сцены")
    ap.add_argument("--dna", type=pathlib.Path, help="clients/<slug>/dna.json")
    ap.add_argument("--room", help="ключ помещения из dna.rooms (living, kitchen, ...)")
    ap.add_argument("--evening", action="store_true", help="вечерний кадр: сумерки, подсветки включены")
    ap.add_argument("--elite", action="store_true", help="элитный блок даже без ДНК")
    ap.add_argument("--check-dna", type=pathlib.Path, metavar="DNA", help="только проверить dna.json")
    a = ap.parse_args(argv)
    try:
        if a.check_dna:
            if a.kind or a.room or a.dna:
                raise ValueError("--check-dna работает отдельно, без вида кадра, --dna и --room")
            load_dna(a.check_dna)
            print(f"ДНК в порядке: {a.check_dna}")
            return 0
        if not a.kind:
            raise ValueError("нужно: prompt-build.py <interior|dollhouse> [сцена] [--dna ... --room ...]")
        if not a.dna and (a.room or a.evening):
            raise ValueError("--room и --evening работают только с --dna")
        p = pathlib.Path(a.scene) if a.scene else None
        if p and p.is_file():
            scene = p.read_text(encoding="utf-8")
        elif a.scene.endswith((".txt", ".md")) and "\n" not in a.scene:
            # опечатка в пути иначе молча ушла бы в промпт как текст сцены
            raise ValueError(f"нет файла сцены: {a.scene}")
        else:
            scene = a.scene
        dna = load_dna(a.dna) if a.dna else None
        sys.stdout.write(build(a.kind, scene, dna, a.room, a.evening, True if a.elite else None))
        return 0
    except (ValueError, OSError) as e:  # DnaError — подкласс ValueError
        print(f"prompt-build: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
