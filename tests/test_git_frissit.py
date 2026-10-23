"""A Mac-kör git-frissítése nem akadhat be (2026-10-23: egy autostash-ütközés egy napra megállította a kitételt).
Futtatás: python3 -m unittest discover -s tests"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build"))
import kitetel_auto as ka  # noqa: E402


def sh(cwd, *a):
    return subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *a], cwd=cwd, capture_output=True, text=True)


def ir(ut, d):
    os.makedirs(os.path.dirname(ut), exist_ok=True)
    json.dump(d, open(ut, "w"), indent=2)


class GitFrissit(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.mkdtemp()
        self.tavoli = os.path.join(self.t, "tavoli.git")
        subprocess.run(["git", "init", "-q", "--bare", "-b", "main", self.tavoli])
        self.felho = os.path.join(self.t, "felho")
        self.mac = os.path.join(self.t, "mac")
        subprocess.run(["git", "clone", "-q", self.tavoli, self.felho])
        sh(self.felho, "checkout", "-q", "-b", "main")
        ir(os.path.join(self.felho, "data", "slug_tortenet.json"), {"a": 1})
        ir(os.path.join(self.felho, "data", "jovahagyas.json"), {"x": "fuggo"})
        sh(self.felho, "add", "-A"); sh(self.felho, "commit", "-qm", "alap"); sh(self.felho, "push", "-q", "origin", "main")
        subprocess.run(["git", "clone", "-q", self.tavoli, self.mac])
        self.regi = ka.GYOKER, ka.SZERZO, ka.NAPLO
        ka.GYOKER, ka.SZERZO, ka.NAPLO = self.mac, ["-c", "user.name=t", "-c", "user.email=t@t"], os.path.join(self.t, "napló.log")

    def tearDown(self):
        ka.GYOKER, ka.SZERZO, ka.NAPLO = self.regi

    def felho_ir(self, slug, jova):
        ir(os.path.join(self.felho, "data", "slug_tortenet.json"), slug)
        ir(os.path.join(self.felho, "data", "jovahagyas.json"), jova)
        sh(self.felho, "add", "-A"); sh(self.felho, "commit", "-qm", "felhő"); sh(self.felho, "push", "-q")

    def test_helyi_modositas_mellett_is_frissul_es_semmi_nem_vesz_el(self):
        self.felho_ir({"a": 1, "b": 2}, {"x": "jovahagyva"})
        ir(os.path.join(self.mac, "data", "slug_tortenet.json"), {"a": 1, "c": 3})   # a gépi render új bejegyzése
        ir(os.path.join(self.mac, "data", "jovahagyas.json"), {"x": "fuggo", "y": 1})
        self.assertTrue(ka.git_frissit())
        m = json.load(open(os.path.join(self.mac, "data", "slug_tortenet.json")))
        self.assertEqual(m, {"a": 1, "b": 2, "c": 3}, "a slugtörténet egyesül")
        self.assertEqual(json.load(open(os.path.join(self.mac, "data", "jovahagyas.json"))), {"x": "jovahagyva"})
        self.assertEqual(sh(self.mac, "diff", "--name-only", "--diff-filter=U").stdout.strip(), "")

    def test_beragadt_utkozesbol_kijon(self):
        # a 2026-10-23-as állapot: autostash-visszarakás ütközése a slugtörténeten, „unmerged” index, ott maradt stash
        self.felho_ir({"a": 1, "b": 2}, {"x": "fuggo"})
        ir(os.path.join(self.mac, "data", "slug_tortenet.json"), {"a": 1, "c": 3})
        sh(self.mac, "stash", "-q")
        sh(self.mac, "pull", "-q")
        sh(self.mac, "stash", "pop")
        self.assertNotEqual(sh(self.mac, "diff", "--name-only", "--diff-filter=U").stdout.strip(), "", "az ütközés előállt")
        self.felho_ir({"a": 1, "b": 2, "d": 4}, {"x": "fuggo"})
        self.assertTrue(ka.git_frissit())
        m = json.load(open(os.path.join(self.mac, "data", "slug_tortenet.json")))
        self.assertTrue({"a", "b", "c", "d"} <= set(m), m)
        self.assertEqual(sh(self.mac, "stash", "list").stdout.strip(), "")
        self.assertEqual(sh(self.mac, "rev-list", "--count", "HEAD..origin/main").stdout.strip(), "0")


if __name__ == "__main__":
    unittest.main()
