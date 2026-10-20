// Megosztásszámláló a cikkoldalon (Heni 2026-10-20): hányan osztották meg a hírt a Megosztás gombbal.
//   GET  /api/megoszt?ids=a,b  -> {db: {id: szám}}
//   POST /api/megoszt {id}     -> {db: szám}
// Személyes adatot nem tárol: csak hírenkénti darabszám van (Upstash qn:megoszt hash). Hogy egy böngészőből egy hír
// csak egyszer számítson, azt a böngésző helyi tárolója jegyzi (qn-megosztva), nem a szerver.
// Csak az oldal gombjával indított megosztás számít; a máshol (pl. Facebookon) megosztott linket nem látjuk.
let ELO = null;
try { ELO = new Set(require("./_hir_idk.json").idk || []); } catch { ELO = null; }
const ID = /^[a-f0-9]{12}$/;
const K = "qn:megoszt";

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

module.exports = async (req, res) => {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return json(res, 503, { hiba: "nincs beállítva" });
  if (req.method === "POST" && !/^application\/json/i.test(req.headers["content-type"] || "")) return json(res, 415, { hiba: "application/json kell" });
  try {
    const url = new URL(req.url, "https://quicknews.hu");
    if (req.method === "GET") {
      const ids = [...new Set((url.searchParams.get("ids") || "").split(",").filter((x) => ID.test(x)))].slice(0, 200);
      if (!ids.length) return json(res, 200, { db: {} });
      const v = (await kv("HMGET", K, ...ids)) || [];
      const db = {};
      ids.forEach((id, i) => { const n = Number(v[i] || 0); if (n) db[id] = n; });
      return json(res, 200, { db });
    }
    if (req.method !== "POST") return json(res, 405, { hiba: "Nem támogatott." });
    const { id } = await torzs(req);
    if (!ID.test(id || "")) return json(res, 400, { hiba: "Rossz kérés." });
    if (ELO && !ELO.has(id)) return json(res, 404, { hiba: "Nincs ilyen hír." });
    const n = await kv("HINCRBY", K, id, 1);
    return json(res, 200, { db: Number(n) });
  } catch (err) {
    return json(res, 500, { hiba: "Most nem sikerült." });
  }
};
