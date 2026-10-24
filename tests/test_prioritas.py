"""A hírpriorizálás és a kötelező jóváhagyás tesztjei (Heni 2026-10-21). Futtatás: python3 -m unittest discover -s tests
Külső hívás nincs: az AI-pontozás eredményét a teszt adja meg."""
import datetime as dt
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build"))
import kozos  # noqa: E402
import prioritas as p  # noqa: E402


def most(ora=0):
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=ora)).isoformat()


def ny(cim, szoveg="", forras="openai", ora=1, azon="aaaaaaaaaaaa"):
    return {"id": azon, "forras_id": forras, "forras_nev": forras, "cim_eredeti": cim, "szoveg_eredeti": szoveg,
            "publikalva": most(ora)}


AI_JO = {"ai_hir": True, "hatas": 95, "aktualitas": 95, "hirertek": 95, "hitelesseg": 95, "egyediseg": 95,
         "kozossegi": 90, "indok": "Nagy modellkiadás.", "tema": "openai launch"}
AI_GYENGE = {"ai_hir": True, "hatas": 20, "aktualitas": 40, "hirertek": 20, "hitelesseg": 60, "egyediseg": 40,
             "kozossegi": 20, "indok": "Apró frissítés.", "tema": "minor"}


class Szintek(unittest.TestCase):
    def test_hatarok(self):
        self.assertEqual([p.szint(x) for x in (100, 85, 84, 65, 64, 40, 39, 0)], ["P1", "P1", "P2", "P2", "P3", "P3", "X", "X"])


class Eloszures(unittest.TestCase):
    def test_allashirdetes_kiesik_ai_nelkul(self):
        e = p.elofeszur(ny("We're hiring! Join our team", "We are hiring engineers, apply now for this job opening.", forras="x-sama"))
        self.assertIsNotNone(e["ok"])

    def test_ures_kiesik(self):
        self.assertIsNotNone(p.elofeszur(ny("gm", ""))["ok"])

    def test_hivatalos_bejelentes_atmegy(self):
        e = p.elofeszur(ny("Introducing GPT-6", "Today we are launching GPT-6, now available to all users.", forras="openai"))
        self.assertIsNone(e["ok"])
        self.assertGreaterEqual(e["pont"], 60)

    def test_regi_hir_alacsonyabb_aktualitas(self):
        self.assertGreater(p.aktualitas(ny("x", ora=1)), p.aktualitas(ny("x", ora=60)))


class Vegso(unittest.TestCase):
    def elo(self):
        return {"pont": 70, "ok": None, "hitelesseg": 90, "aktualitas": 95, "tanult": 50, "jelek": 10}

    def test_eros_hir_p1(self):
        r = p.vegso(ny("x"), self.elo(), AI_JO)
        self.assertEqual(r["szint"], "P1")
        self.assertTrue(r["ai"])

    def test_gyenge_hir_elutasitva(self):
        self.assertEqual(p.vegso(ny("x"), self.elo(), AI_GYENGE)["szint"], "X")

    def test_nem_ai_hir_mindig_elutasitva(self):
        r = p.vegso(ny("x"), self.elo(), dict(AI_JO, ai_hir=False))
        self.assertLessEqual(r["pont"], 20)
        self.assertEqual(r["szint"], "X")

    def test_ai_nelkul_nincs_p1(self):
        r = p.vegso(ny("x"), dict(self.elo(), hitelesseg=100, aktualitas=100, tanult=100), None)
        self.assertLess(r["pont"], p.P1)
        self.assertFalse(r["ai"])

    def test_klaszter_lerontja_az_egyediseget(self):
        r = p.vegso(ny("x"), self.elo(), AI_JO, ("bbbbbbbbbbbb", 90))
        self.assertLessEqual(r["reszpont"]["egyediseg"], 35)
        self.assertIn("bbbbbbbbbbbb", r["indok"])

    def test_nincs_gondolatjel_az_indokban(self):
        r = p.vegso(ny("x"), self.elo(), dict(AI_JO, indok="Nagy hír — fontos"))
        self.assertNotIn("—", r["indok"])

    def test_klaszter_felismeres(self):
        kor = [{"id": "bbbbbbbbbbbb", "tok": p._tokenek("OpenAI launches GPT-6 reasoning model today"), "pont": 90}]
        tars, _ = p.klaszter(ny("OpenAI launches GPT-6 reasoning model"), kor)
        self.assertEqual(tars, "bbbbbbbbbbbb")
        self.assertEqual(p.klaszter(ny("Midjourney adds video editing"), kor)[0], None)


class Jovahagyas(unittest.TestCase):
    """Semmi nem jelenhet meg Heni jóváhagyása nélkül; a főhír csak jóváhagyott P1 vagy P2 lehet."""

    def setUp(self):
        self.mappa = tempfile.mkdtemp()
        self.regi = kozos.JOVAHAGYAS_UT
        kozos.JOVAHAGYAS_UT = os.path.join(self.mappa, "jovahagyas.json")
        kozos._jovahagyas_cache["mtime"] = None

    def tearDown(self):
        kozos.JOVAHAGYAS_UT = self.regi
        kozos._jovahagyas_cache["mtime"] = None

    def dont(self, d):
        with open(kozos.JOVAHAGYAS_UT, "w") as f:
            json.dump(d, f)
        kozos._jovahagyas_cache["mtime"] = None

    def cikk(self, azon="c1", szint="P1", **kw):
        return {"id": azon, "jovahagyas_kell": True, "prioritas": {"szint": szint, "pont": 90}, "fontossag": 5, **kw}

    def test_regi_hir_nem_erintett(self):
        self.dont({})
        c = {"id": "r1", "fontossag": 5}
        self.assertTrue(kozos.jovahagyva(c))
        self.assertFalse(kozos.forras_visszatart(c))

    def test_uj_hir_jovahagyas_nelkul_nem_jelenik_meg(self):
        self.dont({})
        self.assertTrue(kozos.forras_visszatart(self.cikk()))
        self.dont({"c1": {"allapot": "fuggo"}})
        self.assertTrue(kozos.forras_visszatart(self.cikk()))
        self.dont({"c1": {"allapot": "elutasitva"}})
        self.assertTrue(kozos.forras_visszatart(self.cikk()))

    def test_jovahagyott_megjelenik(self):
        self.dont({"c1": {"allapot": "jovahagyva"}})
        self.assertFalse(kozos.forras_visszatart(self.cikk()))

    def test_jovahagyott_de_tenyhibas_nem_jelenik_meg(self):
        self.dont({"c1": {"allapot": "jovahagyva"}})
        self.assertTrue(kozos.forras_visszatart(self.cikk(tenyellenorzes={"ok": False})))

    def test_fohir_csak_jovahagyott_p1_p2(self):
        self.dont({"c1": {"allapot": "jovahagyva"}, "c2": {"allapot": "jovahagyva"}, "c3": {"allapot": "fuggo"},
                   "c4": {"allapot": "jovahagyva", "szint": "P3"}, "c5": {"allapot": "jovahagyva"}})
        self.assertTrue(kozos.fohir_lehet(self.cikk("c1", "P1")))
        self.assertTrue(kozos.fohir_lehet(self.cikk("c2", "P2")))
        self.assertFalse(kozos.fohir_lehet(self.cikk("c3", "P1")), "jóváhagyás nélkül nem")
        self.assertFalse(kozos.fohir_lehet(self.cikk("c4", "P1")), "Heni P3-ra tette: nem")
        self.assertFalse(kozos.fohir_lehet(self.cikk("c5", "X")), "a 40 alatti, mégis jóváhagyott hír legfeljebb P3")

    def test_kezi_szint_felulirja(self):
        self.dont({"c1": {"allapot": "jovahagyva", "szint": "P2"}})
        self.assertEqual(kozos.prioritas_szint(self.cikk("c1", "P3")), "P2")
        self.assertTrue(kozos.fohir_lehet(self.cikk("c1", "P3")))

    def test_regi_hir_fohir_a_fontossagbol(self):
        self.dont({})
        self.assertTrue(kozos.fohir_lehet({"id": "r", "fontossag": 4}))
        self.assertFalse(kozos.fohir_lehet({"id": "r", "fontossag": 3}))


if __name__ == "__main__":
    unittest.main()


class EgyForras(unittest.TestCase):
    """2026-10-22: a Beérkező lista, a számláló és a jelzés ugyanabból az adatból készül. Korábban a lista a Mac
    pillanatképéből jött, a jelzés a felhő friss adatából, és 2 hír „eltűnt”: a jelzés szólt, a lista nem mutatta."""

    def setUp(self):
        import shutil
        self.mappa = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.mappa, "data", "cikkek"))
        self.regi = kozos.JOVAHAGYAS_UT
        kozos.JOVAHAGYAS_UT = os.path.join(self.mappa, "data", "jovahagyas.json")
        kozos._jovahagyas_cache["mtime"] = None
        import posztsor
        self.ps = posztsor
        self.ps_gyoker = posztsor.GYOKER
        posztsor.GYOKER = self.mappa
        self.shutil = shutil

    def tearDown(self):
        kozos.JOVAHAGYAS_UT = self.regi
        kozos._jovahagyas_cache["mtime"] = None
        self.ps.GYOKER = self.ps_gyoker
        self.shutil.rmtree(self.mappa, ignore_errors=True)

    def cikk(self, azon, szint, pont, **kw):
        c = {"id": azon, "forras_id": "openai", "forras_nev": "OpenAI", "cim_eredeti": "x " + azon, "megjelent": most(1),
             "jovahagyas_kell": True, "prioritas": {"szint": szint, "pont": pont, "cim_hu": "Magyar " + azon}, **kw}
        json.dump(c, open(os.path.join(self.mappa, "data", "cikkek", azon + ".json"), "w"))

    def test_lista_szamlalo_jelzes_egyezik(self):
        import admin_jelzes
        self.cikk("a" * 12, "P2", 70)
        self.cikk("b" * 12, "P3", 45)
        self.cikk("c" * 12, "X", 20)  # 40 alatti: gépileg elutasítva, nem vár döntésre
        self.cikk("d" * 12, "P1", 90, dupla_of="a" * 12)  # duplikátum: nem jelenik meg
        with open(kozos.JOVAHAGYAS_UT, "w") as f:
            json.dump({"b" * 12: {"allapot": "elutasitva"}}, f)
        kozos._jovahagyas_cache["mtime"] = None
        lista = self.ps.prioritas(napok=2)["sorok"]
        fuggo_lista = {s["id"] for s in lista if s["allapot"] == "fuggo"}
        self.assertEqual(fuggo_lista, {"a" * 12})
        self.assertEqual({s["id"] for s in lista}, {"a" * 12, "b" * 12, "c" * 12})
        jelzes = admin_jelzes.fuggo_sorok(napok=2)
        self.assertEqual({s["id"] for s in jelzes}, fuggo_lista, "a jelzés pontosan a lista függő tételeiről szól")
        self.assertEqual(jelzes[0]["cim"], "Magyar " + "a" * 12)


class ArazasTenyellenorzes(unittest.TestCase):
    """2026-10-24, sideOS.ai: az ár- és ingyenesség-állítás mindig keresést és hivatalos oldalt kap."""

    def test_arazas_felismerese(self):
        import tenyellenor as t
        self.assertTrue(t.arazas_szerepel({"osszefoglalo": "és előfizetési díj nélkül érhető el."}))
        self.assertTrue(t.arazas_szerepel({"lead": "Ingyenesen kipróbálható"}))
        self.assertTrue(t.arazas_szerepel({"osszefoglalo": "egyszeri 89 dolláros licenc"}))
        self.assertFalse(t.arazas_szerepel({"osszefoglalo": "Már elérhető a modell, a kutatók szerint gyorsabb."}))
        self.assertFalse(t.kell_kereses({"fontossag": 2, "lead": "ingyenes"}), "a fizetős keresés szabálya nem változott")
