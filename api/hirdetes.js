// Hirdetői érdeklődés (oldalsávos űrlap): név, weboldal, telefonszám; Heni a pult „Hirdetők” fülén látja és hívja vissza.
// Env: CHAT_SO, KV_REST_API_URL, KV_REST_API_TOKEN.
//   POST /api/hirdetes {nev, weboldal, telefon, web2 (csapda, üresen kell maradnia)} -> {ok, uzenet}
// Tárolás: qn:hird:<id> (név, weboldal, telefonszám, időpont, állapot), qn:hird:lista; 1 évig.
// Visszaélés ellen: naponta legfeljebb 5 űrlap látogatónként (24 órás IP-lenyomat), összesen 100.
const crypto = require("crypto");

const P = "qn:hird:";
const NAPI_LATOGATO = 5;
const NAPI_OSSZES = 100;
const MEGORZES = 365 * 86400;

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

function json(res, kod, adat) {
  res.statusCode = kod;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(adat));
}

async function torzs(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let s = "";
  for await (const d of req) s += d;
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

function nap() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return json(res, 405, { ok: false, uzenet: "Nem támogatott." });
    const b = await torzs(req);
    if (b.web2) return json(res, 200, { ok: true, uzenet: "Köszönjük, hamarosan keresünk!" });  // botcsapda: csendben eldobjuk
    const nev = String(b.nev || "").replace(/\s+/g, " ").trim().slice(0, 80);
    let web = String(b.weboldal || "").trim().slice(0, 200);
    const tel = String(b.telefon || "").replace(/[^\d+()\-\s/]/g, "").replace(/\s+/g, " ").trim().slice(0, 30);
    if (web && !/^https?:\/\//i.test(web)) web = "https://" + web;
    let webOk = false;
    try { const u = new URL(web); webOk = /\./.test(u.hostname); } catch { webOk = false; }
    const hiba = [];
    if (nev.length < 2) hiba.push("a nevedet");
    if (!webOk) hiba.push("a weboldalad címét");
    if ((tel.match(/\d/g) || []).length < 8) hiba.push("egy elérhető telefonszámot");
    if (hiba.length) return json(res, 200, { ok: false, uzenet: "Kérjük, add meg " + hiba.join(", ") + "." });

    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
    const lenyomat = crypto.createHash("sha256").update(`${process.env.CHAT_SO || ""}|hird|${nap()}|${ip}`).digest("hex").slice(0, 24);
    const sajat = await kv("INCR", P + "ip:" + lenyomat);
    if (sajat === 1) await kv("EXPIRE", P + "ip:" + lenyomat, 86400);
    const ossz = await kv("INCR", P + "nap:" + nap());
    if (ossz === 1) await kv("EXPIRE", P + "nap:" + nap(), 2 * 86400);
    if (sajat > NAPI_LATOGATO || ossz > NAPI_OSSZES) return json(res, 200, { ok: false, uzenet: "Most nem tudjuk fogadni, írj nekünk az info@adverr.hu címre!" });

    const id = crypto.randomBytes(8).toString("hex");
    const rekord = { id, nev, weboldal: web, telefon: tel, ido: new Date().toISOString(), allapot: "uj", oldal: String(b.oldal || "").slice(0, 200) };
    await kv("SET", P + id, JSON.stringify(rekord), "EX", MEGORZES);
    await kv("ZADD", P + "lista", Date.now(), id);
    await kv("ZREMRANGEBYSCORE", P + "lista", 0, Date.now() - MEGORZES * 1000);
    return json(res, 200, { ok: true, uzenet: "Köszönjük! Hamarosan felkeresünk a megadott telefonszámon." });
  } catch (err) {
    return json(res, 500, { ok: false, uzenet: "Most nem sikerült elküldeni. Írj nekünk az info@adverr.hu címre!" });
  }
};
