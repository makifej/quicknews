// Párbaj-szavazás (Heni 2026-10-14, Szavazás menü): két hasonló AI-eszköz közül melyiket választanád.
//   GET  /api/parbaj?ids=pb-a,pb-b[&l=<látogató>]  -> {allas: {id: {a, b}}, sajat: {id: "a"|"b"}}
//        Az állást csak annál a párbajnál adja vissza, ahol a látogató már szavazott, vagy amelyik lezárult,
//        hogy a futó párbaj állása ne befolyásolja a szavazást.
//   POST /api/parbaj {id, l, valasztas: "a"|"b"}   -> {allas: {a, b}, sajat}
// A látogató ugyanaz a véletlen, névtelen böngészőazonosító, mint a hírszavazásnál (qn-l). Párbajonként egy
// szavazat, amely átváltható. Egy IP-címről párbajonként egy szavazat (visszafejthetetlen lenyomat, 400 nap), és
// óránként legfeljebb 120 szavazás IP-nként. A párbajok listáját és időpontjait a kitett /parbajok.json adja.
const crypto = require("crypto");

const P = "qn:pb:";
const ID = /^pb-[a-z0-9-]{2,60}$/;
const LAT = /^[a-z0-9]{16,40}$/;
const ORANKENT = 120;
let lista = { ido: 0, adat: null };

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
const ipCim = (req) => String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
const ipOras = (req) => crypto.createHash("sha256").update(`${process.env.CHAT_SO || ""}|${new Date().toISOString().slice(0, 13)}|${ipCim(req)}`).digest("hex").slice(0, 24);
const ipAllando = (req) => crypto.createHash("sha256").update(`parbaj|${process.env.CHAT_SO || ""}|${ipCim(req)}`).digest("hex").slice(0, 24);

// a párbajok időpontjai a kitett oldalról (percenként frissítve)
async function parbajok() {
  if (lista.adat && Date.now() - lista.ido < 60000) return lista.adat;
  try {
    const r = await fetch("https://quicknews.hu/parbajok.json", { cache: "no-store" });
    const d = await r.json();
    lista = { ido: Date.now(), adat: Object.fromEntries((d.parbajok || []).map((p) => [p.id, p])) };
  } catch { lista = { ido: Date.now(), adat: lista.adat || {} }; }
  return lista.adat;
}
const allapot = (p) => { const m = Date.now(); return !p ? "nincs" : m < Date.parse(p.nyit) ? "hamarosan" : m >= Date.parse(p.zar) ? "lezart" : "fut"; };
const allasBe = async (id) => { const v = (await kv("HMGET", P + "allas:" + id, "a", "b")) || []; return { a: Number(v[0] || 0), b: Number(v[1] || 0) }; };

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, "https://quicknews.hu");
    const pb = await parbajok();
    if (req.method === "GET") {
      const ids = [...new Set((url.searchParams.get("ids") || "").split(",").filter((x) => ID.test(x) && pb[x]))].slice(0, 50);
      const l = url.searchParams.get("l") || "";
      const sajat = {};
      if (ids.length && LAT.test(l)) {
        const s = (await kv("HMGET", P + "l:" + l, ...ids)) || [];
        ids.forEach((id, i) => { if (s[i] === "a" || s[i] === "b") sajat[id] = s[i]; });
      }
      const allas = {};
      for (const id of ids) if (sajat[id] || allapot(pb[id]) === "lezart") allas[id] = await allasBe(id);
      return json(res, 200, { allas, sajat });
    }
    if (req.method !== "POST") return json(res, 405, { hiba: "Nem támogatott." });
    const { id, l, valasztas } = await torzs(req);
    if (!ID.test(id || "") || !LAT.test(l || "") || !["a", "b"].includes(valasztas)) return json(res, 400, { hiba: "Rossz kérés." });
    const st = allapot(pb[id]);
    if (st === "nincs") return json(res, 404, { hiba: "Nincs ilyen párbaj." });
    if (st === "hamarosan") return json(res, 409, { hiba: "Ez a párbaj még nem indult el." });
    if (st === "lezart") return json(res, 409, { hiba: "Ez a párbaj már lezárult." });
    const kulcs = P + "ip:" + ipOras(req);
    const db = await kv("INCR", kulcs);
    if (db === 1) await kv("EXPIRE", kulcs, 3600);
    if (db > ORANKENT) return json(res, 429, { hiba: "Túl sok szavazás, próbáld később." });
    const ipl = ipAllando(req), ipk = P + "ipv:" + id, zar = P + "zar:" + id + ":" + ipl;
    if ((await kv("SET", zar, "1", "NX", "EX", 5)) !== "OK") return json(res, 429, { hiba: "Egy pillanat, a szavazatod még mentés alatt van." });
    try {
      const gazda = await kv("HGET", ipk, ipl);
      if (gazda && gazda !== l) return json(res, 409, { hiba: "Már szavaztál ebben a párbajban!", mar: true });
      const regi = await kv("HGET", P + "l:" + l, id);
      if (regi !== valasztas) {
        await kv("HSET", P + "l:" + l, id, valasztas);
        await kv("EXPIRE", P + "l:" + l, 400 * 86400);
        await kv("HSET", ipk, ipl, l);
        await kv("EXPIRE", ipk, 400 * 86400);
        if (regi === "a" || regi === "b") await kv("HINCRBY", P + "allas:" + id, regi, -1);
        await kv("HINCRBY", P + "allas:" + id, valasztas, 1);
      }
      return json(res, 200, { allas: await allasBe(id), sajat: valasztas });
    } finally {
      await kv("DEL", zar);
    }
  } catch (err) {
    return json(res, 500, { hiba: "Most nem sikerült, próbáld újra." });
  }
};
