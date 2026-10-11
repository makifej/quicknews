// Fel- és leszavazás a hírekre (Reddit-szerűen). Env: KV_REST_API_URL, KV_REST_API_TOKEN, CHAT_SO.
//   GET  /api/szavaz?ids=a,b,c[&l=<látogató>]  -> {pont: {id: összeg}, sajat: {id: 1|-1}}
//   POST /api/szavaz {id, l, ertek: 1|-1|0}    -> {pont, sajat}
// A látogató egy véletlen, névtelen azonosító a böngésző helyi tárolójából; hírenként egy szavazata számít,
// amit visszavonhat vagy megfordíthat. Egy IP-címről hírenként csak egy szavazat élhet (az IP visszafejthetetlen
// lenyomata hírenként a szavazó böngészőhöz kötve, 400 napig). Ezen felül óránként legfeljebb 120 szavazás IP-nként.
const crypto = require("crypto");

const P = "qn:sz:";
const ID = /^[a-f0-9]{12}$/;
const LAT = /^[a-z0-9]{16,40}$/;
const ORANKENT = 120;

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

function ipCim(req) {
  return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
}

function ipLenyomat(req) {  // óránként változó: csak a tömeges szavazás fékezéséhez
  const ora = new Date().toISOString().slice(0, 13);
  return crypto.createHash("sha256").update(`${process.env.CHAT_SO || ""}|${ora}|${ipCim(req)}`).digest("hex").slice(0, 24);
}

function ipAllando(req) {  // állandó, visszafejthetetlen lenyomat: hírenként egy szavazat IP-címenként
  return crypto.createHash("sha256").update(`szavaz|${process.env.CHAT_SO || ""}|${ipCim(req)}`).digest("hex").slice(0, 24);
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, "https://quicknews.hu");
    if (req.method === "GET") {
      const ids = [...new Set((url.searchParams.get("ids") || "").split(",").filter((x) => ID.test(x)))].slice(0, 200);
      if (!ids.length) return json(res, 200, { pont: {}, sajat: {} });
      const ertekek = (await kv("HMGET", P + "pont", ...ids)) || [];
      const pont = {};
      ids.forEach((id, i) => { const v = Number(ertekek[i] || 0); if (v) pont[id] = v; });
      const sajat = {};
      const l = url.searchParams.get("l") || "";
      if (LAT.test(l)) {
        const s = (await kv("HMGET", P + "l:" + l, ...ids)) || [];
        ids.forEach((id, i) => { const v = Number(s[i] || 0); if (v) sajat[id] = v; });
      }
      return json(res, 200, { pont, sajat });
    }
    if (req.method !== "POST") return json(res, 405, { hiba: "Nem támogatott." });
    const { id, l, ertek } = await torzs(req);
    const uj = Number(ertek);
    if (!ID.test(id || "") || !LAT.test(l || "") || ![1, -1, 0].includes(uj)) return json(res, 400, { hiba: "Rossz kérés." });
    const kulcs = P + "ip:" + ipLenyomat(req);
    const db = await kv("INCR", kulcs);
    if (db === 1) await kv("EXPIRE", kulcs, 3600);
    if (db > ORANKENT) return json(res, 429, { hiba: "Túl sok szavazás, próbáld később." });
    // egy IP-címről hírenként egy szavazat: ha erről a címről más böngésző már szavazott erre a hírre, elutasítjuk
    const ipk = P + "ipv:" + id, ipl = ipAllando(req);
    const gazda = await kv("HGET", ipk, ipl);
    if (gazda && gazda !== l && uj !== 0) return json(res, 409, { hiba: "Erről a hálózatról már szavaztak erre a hírre." });
    // a látogató szavazatai egy hashben: {hír: 1|-1}; a különbség megy az összesítőbe
    const regi = Number((await kv("HGET", P + "l:" + l, id)) || 0);
    if (uj === regi) {
      const p = Number((await kv("HGET", P + "pont", id)) || 0);
      return json(res, 200, { pont: p, sajat: uj });
    }
    if (uj === 0) await kv("HDEL", P + "l:" + l, id); else await kv("HSET", P + "l:" + l, id, uj);
    await kv("EXPIRE", P + "l:" + l, 400 * 86400);
    if (uj === 0) { if (gazda === l) await kv("HDEL", ipk, ipl); }  // visszavonáskor a cím felszabadul
    else { await kv("HSET", ipk, ipl, l); await kv("EXPIRE", ipk, 400 * 86400); }
    const p = await kv("HINCRBY", P + "pont", id, uj - regi);
    return json(res, 200, { pont: Number(p), sajat: uj });
  } catch (err) {
    return json(res, 500, { hiba: "Most nem sikerült, próbáld újra." });
  }
};
