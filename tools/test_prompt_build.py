#!/usr/bin/env python3
"""Тесты сборщика промптов: python3 -m unittest tools/test_prompt_build.py

Главное, что стережём: материалы проекта приходят из ДНК, а не из общего блока,
и кривая ДНК останавливает сборку понятной ошибкой, а не тихо даёт «промпт как у всех».
"""
import copy
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("prompt_build", ROOT / "tools" / "prompt-build.py")
pb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pb)

DNA_PATH = ROOT / "examples" / "dna" / "elite-modern.json"
DNA = json.loads(DNA_PATH.read_text(encoding="utf-8"))
DEFAULT_MATERIALS = (ROOT / "tools" / "prompts" / "_materials-default.txt").read_text(encoding="utf-8").strip()


class TestDnaSchema(unittest.TestCase):
    def test_example_dna_is_valid(self):
        self.assertEqual(pb.check_dna(DNA), [])

    def test_rule_of_three_moves(self):
        bad = copy.deepcopy(DNA)
        bad["moves"] = bad["moves"][:2]
        self.assertTrue(any("ровно 3" in e for e in pb.check_dna(bad)))

    def test_too_many_materials(self):
        bad = copy.deepcopy(DNA)
        bad["materials"] = bad["materials"] * 2
        self.assertTrue(any("3–5" in e for e in pb.check_dna(bad)))

    def test_room_without_en(self):
        bad = copy.deepcopy(DNA)
        bad["rooms"]["living"] = {"ru": "только по-русски"}
        self.assertIn("rooms.living: нет en", pb.check_dna(bad))

    def test_not_an_object(self):
        self.assertEqual(pb.check_dna([]), ["ДНК должна быть JSON-объектом"])


class TestBuild(unittest.TestCase):
    def test_legacy_call_keeps_default_materials(self):
        out = pb.build("interior", "Living room with a grey sofa")
        self.assertIn("SCENE AND STYLE:\nLiving room with a grey sofa", out)
        self.assertIn(DEFAULT_MATERIALS, out)
        self.assertNotIn("ELITE STUDIO LEVEL", out)

    def test_dna_replaces_default_materials(self):
        out = pb.build("interior", dna=DNA, room="living")
        self.assertNotIn(DEFAULT_MATERIALS, out)
        self.assertIn("American walnut veneer", out)
        self.assertIn("DESIGN DNA", out)
        self.assertIn(DNA["rooms"]["living"]["en"], out)
        self.assertIn("ELITE STUDIO LEVEL", out)  # tier=elite включает блок сам
        self.assertIn("gilded frame", out)        # анти-список проекта дошёл до промпта

    def test_evening_light(self):
        day = pb.build("interior", dna=DNA, room="bedroom")
        eve = pb.build("interior", dna=DNA, room="bedroom", evening=True)
        self.assertIn("Blue-hour", eve)
        self.assertNotIn("Blue-hour", day)
        self.assertIn("LIGHT:\nWarm 2700K", day)  # фразы блока — с заглавной

    def test_extra_scene_appended(self):
        out = pb.build("interior", "camera from the window corner", dna=DNA, room="living")
        self.assertIn(DNA["rooms"]["living"]["en"] + "\ncamera from the window corner", out)

    def test_unknown_room(self):
        with self.assertRaises(pb.DnaError) as cm:
            pb.build("interior", dna=DNA, room="garage")
        self.assertIn("living", str(cm.exception))

    def test_dna_requires_room(self):
        with self.assertRaises(pb.DnaError):
            pb.build("interior", dna=DNA)

    def test_empty_scene(self):
        with self.assertRaises(ValueError):
            pb.build("interior", "   ")

    def test_unknown_kind(self):
        with self.assertRaises(ValueError):
            pb.build("panorama", "x")


class TestCli(unittest.TestCase):
    def test_check_dna_ok(self):
        self.assertEqual(pb.main(["--check-dna", str(DNA_PATH)]), 0)

    def test_check_dna_missing_file(self):
        self.assertEqual(pb.main(["--check-dna", "/nonexistent/dna.json"]), 2)

    def test_cli_unknown_room_exit_code(self):
        self.assertEqual(pb.main(["interior", "--dna", str(DNA_PATH), "--room", "garage"]), 2)


if __name__ == "__main__":
    unittest.main()
