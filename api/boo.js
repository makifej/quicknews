// BOO-vadászat nyereményjáték (Heni 2026-10-20): aki elkapta az 5 szellemet, itt adja meg az e-mail-címét a sorsoláshoz.
//
// POST /api/boo {email, elfogad:true, db}
//
// A jelentkezők KÜLÖN listán vannak (Upstash qn:boo hash: cím -> {ido, hirlevel}), Heni kérésére. A hírlevél külön, nem kötelező
// pipa (Heni 2026-10-20): csak akkor kerül a cím a qn:hirlevel listára is (forras: "boo"), ha a játékos bepipálta; ha már ott
// volt, az eredeti feliratkozása marad. Amíg a BOO_JATEK környezeti változó nem "1", a végpont nem fogad jelentkezést.
// A válasz akkor is ugyanaz, ha a cím már jelentkezett, így a végponttal nem lehet kitalálni, ki játszik.
const crypto = require("crypto");
const { tisztit, domainRendben } = require("./hirlevel.js");

const KULCS = "qn:boo";
const HL = "qn:hirlevel";
const KORLAT_ABLAK = 3600;
const KORLAT_DB = 5;
// a játékszabályzat szerint 2026. november 9. 23:59-ig (budapesti idő, CET = UTC+1) lehet jelentkezni
const HATARIDO = Date.parse("2026-11-09T22:59:59Z");

async function kv(...parancs) {
  const r = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(parancs),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
async function torzs(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body || "{}"); } catch { return {}; } }
  let s = "";
  for await (const d of req) s += d;
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}
function json(res, kod, adat) {
  res.statusCode = kod;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(adat));
}
function honnan(req) {
  const f = req.headers["x-forwarded-for"];
  return (Array.isArray(f) ? f[0] : String(f || "")).split(",")[0].trim() || "ismeretlen";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return json(res, 405, { hiba: "nem támogatott metódus" }); }
  if (process.env.BOO_JATEK !== "1") return json(res, 403, { rendben: false, uzenet: "A nyereményjáték még nem indult el. Hamarosan!" });
  if (Date.now() > HATARIDO) return json(res, 403, { rendben: false, uzenet: "A jelentkezési határidő november 9-én lejárt. Köszönjük, hogy játszottál!" });
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN || !process.env.CHAT_SO) return json(res, 503, { hiba: "az adattár nincs beállítva" });
  if (!/^application\/json/i.test(req.headers["content-type"] || "")) return json(res, 415, { hiba: "application/json kell" });
  try {
    const b = await torzs(req);
    const email = tisztit(b.email);
    if (!email) return json(res, 400, { rendben: false, uzenet: "Ez a cím nem tűnik érvényesnek." });
    if (b.elfogad !== true) return json(res, 400, { rendben: false, uzenet: "A részvételhez fogadd el a játékszabályzatot." });
    if (Number(b.db) !== 5) return json(res, 400, { rendben: false, uzenet: "Előbb kapd el mind az 5 BOO-t." });

    const korlat = "qn:boo:korlat:" + crypto.createHash("sha256").update((process.env.CHAT_SO || "") + "|" + honnan(req)).digest("hex").slice(0, 24);
    const db = await kv("INCR", korlat);
    if (db === 1) await kv("EXPIRE", korlat, KORLAT_ABLAK);
    if (db > KORLAT_DB) return json(res, 429, { rendben: false, uzenet: "Túl sok próbálkozás. Próbáld később." });

    const allapot = await domainRendben(email.split("@")[1]);
    if (allapot === "eldobhato") return json(res, 400, { rendben: false, uzenet: "Egyszer használatos címre nem tudunk írni. Adj meg egy rendes e-mail-címet." });
    if (allapot === "nem") return json(res, 400, { rendben: false, uzenet: "Erre a címre nem lehet levelet küldeni. Nézd meg, nem gépelted-e el." });

    const ido = new Date().toISOString();
    const hirlevel = b.hirlevel === true;
    await kv("HSETNX", KULCS, email, JSON.stringify({ ido, hirlevel }));
    if (hirlevel) await kv("HSETNX", HL, email, JSON.stringify({ ido, forras: "boo" }));
    return json(res, 200, { rendben: true, uzenet: hirlevel ? "Ha te nyersz, erre a címre írunk. Addig minden reggel 8-kor megkapod a napi AI-híreket is." : "Ha te nyersz, erre a címre írunk." });
  } catch (e) {
    return json(res, 502, { hiba: "az adattár nem válaszolt" });
  }
};
