"""Biztonsági és kódminőségi regressziós tesztek a Python oldalhoz (2026-10-11-es átvilágítás).

Futtatás: python3 -m unittest discover -s tests
Hálózatot és éles adatot nem érint: a fájlok ideiglenes mappában, a közös tároló kikapcsolva.
"""
import hashlib
import importlib
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

BUILD = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build")
sys.path.insert(0, BUILD)


class Kezelo:
    def __init__(self, fejlecek):
        self.headers = fejlecek


class HelyiPult(unittest.TestCase):
    """SEC-002: a helyi pult (4433) és a frissítő szerver (4430) csak a saját localhost-oldalnak engedelmeskedik."""

    def setUp(self):
        self.p = importlib.import_module("posztsor")
        self.port = self.p.PORT

    def test_sajat_oldal_irhat(self):
        h = {"Host": f"localhost:{self.port}", "Origin": f"http://localhost:{self.port}", "Content-Type": "application/json"}
        self.assertTrue(self.p.helyi_keres(Kezelo(h), True))

    def test_idegen_origin_nem_irhat(self):
        h = {"Host": f"localhost:{self.port}", "Origin": "https://gonosz.example", "Content-Type": "application/json"}
        self.assertFalse(self.p.helyi_keres(Kezelo(h), True))

    def test_text_plain_nem_irhat(self):
        # a böngésző előzetes ellenőrzés nélkül csak „egyszerű” (pl. text/plain) kérést küldhet idegen oldalról
        h = {"Host": f"127.0.0.1:{self.port}", "Content-Type": "text/plain"}
        self.assertFalse(self.p.helyi_keres(Kezelo(h), True))

    def test_dns_rebinding_host_tiltva(self):
        h = {"Host": f"gonosz.example:{self.port}"}
        self.assertFalse(self.p.helyi_keres(Kezelo(h), False))
        self.assertTrue(self.p.helyi_keres(Kezelo({"Host": f"127.0.0.1:{self.port}"}), False))

    def test_frissito_szerver(self):
        with mock.patch.object(sys, "argv", ["szerver.py"]):
            sz = importlib.import_module("szerver")
        k = sz.Kezelo.__new__(sz.Kezelo)
        k.headers = {"Host": f"localhost:{sz.PORT}", "Origin": "https://gonosz.example"}
        self.assertFalse(sz.Kezelo.helyi(k, True))
        k.headers = {"Host": f"localhost:{sz.PORT}", "Origin": f"http://localhost:{sz.PORT}", "Content-Type": "application/json"}
        self.assertTrue(sz.Kezelo.helyi(k, True))
        k.headers = {"Host": f"localhost:{sz.PORT}", "Content-Type": "text/plain"}
        self.assertFalse(sz.Kezelo.helyi(k, True), "Origin nélküli text/plain kérés sem írhat")
        k.headers = {"Host": "gonosz.example"}
        self.assertFalse(sz.Kezelo.helyi(k, False))


class FeedKep(unittest.TestCase):
    """SEC-001: a feed.json képmezőjébe csak saját /assets/ út vagy https-cím kerülhet."""

    def test_biztos_kep(self):
        r = importlib.import_module("render")
        self.assertIsNone(r.biztos_kep('x" onerror="alert(1)'))
        self.assertIsNone(r.biztos_kep("javascript:alert(1)"))
        self.assertIsNone(r.biztos_kep("http://kep.pelda.hu/a.jpg"))
        self.assertEqual(r.biztos_kep("/assets/kep/abc.webp"), "/assets/kep/abc.webp")
        self.assertEqual(r.biztos_kep("https://kep.pelda.hu/a.jpg"), "https://kep.pelda.hu/a.jpg")


class PotkartyaElutasitasUtan(unittest.TestCase):
    """CQ-002: ha a hír bármelyik kártyáját elutasították, minden további kártya jóváhagyásra vár."""

    def kartya(self, tmp, fajl, rekord):
        kit = importlib.import_module("kitenni")
        ut = os.path.join(tmp, "kitenni.json")
        json.dump({"teszt0000001": rekord}, open(ut, "w"))
        kartyak = os.path.join(kit.GYOKER, "site", "assets", "kartya")
        cel = os.path.join(kartyak, fajl)
        open(cel, "wb").write(fajl.encode())
        try:
            with mock.patch.object(kit, "KITENNI", ut), mock.patch.object(kit.qn_kv, "van", return_value=False), \
                    mock.patch.object(sys, "argv", ["kitenni.py", "--kartya", "teszt0000001", fajl]):
                kit.main()
        finally:
            os.remove(cel)
        return json.load(open(ut))["teszt0000001"]

    def test_masodik_potkartya_sem_automatikus(self):
        with tempfile.TemporaryDirectory() as tmp:
            e = self.kartya(tmp, "teszt0000001-v8.jpg", {"kartya": {"fajl": "teszt0000001-v7.jpg", "elutasitva": "2026-10-11T20:00:00", "jo": None}})
            self.assertFalse(e["kartya"]["auto"])
            self.assertTrue(e["volt_elutasitva"])
            e2 = self.kartya(tmp, "teszt0000001-v9.jpg", e)
            self.assertFalse(e2["kartya"]["auto"], "a második pótkártya sem mehet ki jóváhagyás nélkül")

    def test_eredeti_kepes_elso_kartya_automatikus(self):
        with tempfile.TemporaryDirectory() as tmp:
            e = self.kartya(tmp, "teszt0000001-v8.jpg", {"kell": ["facebook"]})
            self.assertTrue(e["kartya"]["auto"])


class FbPosztJovahagyas(unittest.TestCase):
    """CQ-001: a --jovahagyva csak a pultban rögzített, jóváhagyott kártyára (fájl és lenyomat) írható."""

    def futtat(self, rekord, argv, fajlok):
        tmp = tempfile.mkdtemp()
        kartyak = os.path.join(tmp, "site", "assets", "kartya")
        os.makedirs(kartyak)
        os.makedirs(os.path.join(tmp, "data", "cikkek"))
        json.dump({"slug": "teszt"}, open(os.path.join(tmp, "data", "cikkek", "teszt0000001.json"), "w"))
        for n, b in fajlok.items():
            open(os.path.join(kartyak, n), "wb").write(b)
        fb = importlib.import_module("fb_poszt")
        kit = importlib.import_module("kitenni")
        jova = os.path.join(tmp, "jova.json")
        with mock.patch.object(fb, "GYOKER", tmp), mock.patch.object(fb, "JOVA", jova), \
                mock.patch.object(kit, "kit_be", return_value={"teszt0000001": {"kartya": rekord}}), \
                mock.patch.object(sys, "argv", ["fb_poszt.py", "teszt0000001", "--jovahagyva"] + argv):
            try:
                fb.main()
                return json.load(open(jova))
            except SystemExit as e:
                return str(e)

    def test_v2_jovahagyva_a_v2_kerul_rogzitesre(self):
        b = b"masodik-kartya"
        r = self.futtat({"fajl": "teszt0000001-v2.jpg", "sha256": hashlib.sha256(b).hexdigest(), "jo": "2026-10-11T20:00:00"}, [],
                        {"teszt0000001-v1.jpg": b"regi", "teszt0000001-v2.jpg": b})
        self.assertIsInstance(r, dict)
        self.assertEqual(r["teszt0000001"]["fajl"], "teszt0000001-v2.jpg")

    def test_v1_nelkul_is_a_rogzitett_kartya(self):
        b = b"nyolcadik"
        r = self.futtat({"fajl": "teszt0000001-v8.jpg", "sha256": hashlib.sha256(b).hexdigest(), "jo": "2026-10-11T20:00:00"}, [],
                        {"teszt0000001-v8.jpg": b})
        self.assertIsInstance(r, dict, r)
        self.assertEqual(r["teszt0000001"]["fajl"], "teszt0000001-v8.jpg")

    def test_jovahagyatlan_kartya_nem_rogzitheto(self):
        b = b"var-meg"
        r = self.futtat({"fajl": "teszt0000001-v1.jpg", "sha256": hashlib.sha256(b).hexdigest(), "jo": None}, [], {"teszt0000001-v1.jpg": b})
        self.assertIn("ÁLLJ", r)

    def test_megvaltozott_kartya_nem_rogzitheto(self):
        r = self.futtat({"fajl": "teszt0000001-v1.jpg", "sha256": hashlib.sha256(b"eredeti").hexdigest(), "jo": "2026-10-11T20:00:00"}, [],
                        {"teszt0000001-v1.jpg": b"kicserelt"})
        self.assertIn("ÁLLJ", r)


if __name__ == "__main__":
    unittest.main()
