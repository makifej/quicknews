// Elemzések jóváhagyása (Heni 2026-11-12). A reggeli piszkozatról levél megy Heninek két gombbal; a gomb ide mutat.
//
// GET  /api/elemzes?slug=<slug>&d=mehet|elvet&t=<aláírás>   Heni döntése a levélből. Az aláírás:
//      HMAC-SHA256(GEP_KULCS, "elemzes|<slug>|<d>") hex, így a link nem hamisítható, és csak a saját cikkére szól.
//      A döntés a qn:elemzes:dontes listára kerül; a Mac 3 percenként átveszi és kiteszi (build/elemzes_dontes.py).
// GET  /api/elemzes?mi=dontesek   (X-Gep-Kulcs fejléccel)  a Mac lekéri és kiüríti a döntéseket.
const crypto = require("crypto");

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

function egyezik(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function oldal(res, kod, cim, szoveg) {
  res.statusCode = kod;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.end(`<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${cim}</title><body style="font-family:-apple-system,system-ui,sans-serif;background:#141414;color:#f2f2f2;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="max-width:460px;padding:28px;text-align:center"><h1 style="font-size:24px;margin:0 0 12px">${cim}</h1><p style="opacity:.8;line-height:1.6">${szoveg}</p>
<p><a href="https://quicknews.hu/elemzesek" style="color:#f5a524">Elemzések</a></p></div></body></html>`);
}

async function torzs(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const darabok = [];
  for await (const d of req) darabok.push(d);
  try { return JSON.parse(Buffer.concat(darabok).toString("utf8") || "{}"); } catch (e) { return {}; }
}

function jsonValasz(res, kod, adat) {
  res.statusCode = kod;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(adat));
}

module.exports = async (req, res) => {
  const u = new URL(req.url, "https://quicknews.hu");
  // POST: az előnézeti oldal jóváhagyó űrlapja (Heni 2026-11-13: a címet és a borítót egyszerre lehessen választani).
  // Törzs: {slug, d: "mehet"|"elvet", t: HMAC(GEP_KULCS, "elemzes|<slug>|urlap"), cim, kep: 0-2}
  if (req.method === "POST") {
    const gk0 = process.env.GEP_KULCS || "";
    if (!gk0 || !process.env.KV_REST_API_URL) return jsonValasz(res, 503, { ok: false, uzenet: "A jóváhagyás most nem érhető el." });
    const b = await torzs(req);
    const slug = String(b.slug || ""), d = String(b.d || ""), t = String(b.t || "");
    if (!/^[a-z0-9-]{3,120}$/.test(slug) || !["mehet", "elvet", "general", "cim", "kep"].includes(d)) return jsonValasz(res, 400, { ok: false, uzenet: "Hibás kérés." });
    // r: az újranyitás sorszáma (egy elvetett elemzés újra jóváhagyásra kerülhet, új aláírással)
    const r = Math.max(0, parseInt(b.r, 10) || 0);
    const vart = crypto.createHmac("sha256", gk0).update(`elemzes|${slug}|urlap` + (r ? `|${r}` : "")).digest("hex");
    if (!egyezik(t, vart)) return jsonValasz(res, 403, { ok: false, uzenet: "Ez az űrlap nem érvényes." });
    if (d === "cim" || d === "kep") {
      // részjóváhagyás: csak a címet vagy csak a képet menti, a cikk még nem kerül ki (Heni 2026-11-13)
      const cim1 = String(b.cim || "").replace(/\s*[\u2013\u2014]\s*/g, ": ").replace(/\s+/g, " ").trim().slice(0, 160);
      const kep1 = Math.max(0, Math.min(2, parseInt(b.kep, 10) || 0));
      await kv("RPUSH", "qn:elemzes:dontes", JSON.stringify(d === "cim" ? { slug, d, cim: cim1, ido: new Date().toISOString() } : { slug, d, kep: kep1, ido: new Date().toISOString() }));
      return jsonValasz(res, 200, { ok: true, resz: true, uzenet: d === "cim" ? "A cím elmentve. A képről külön dönthetsz." : "A kép elmentve. A címről külön dönthetsz." });
    }
    if (d === "general") {
      // képgenerálás: nem végleges döntés, a Mac 3 új borítót generál, és új jóváhagyó levelet küld (új aláírással)
      const gk = `qn:elemzes:general:${slug}:${r}`;
      if (await kv("GET", gk)) return jsonValasz(res, 200, { ok: false, uzenet: "Erre már kértél képgenerálást, a gép dolgozik rajta." });
      await kv("SET", gk, "1", "EX", 60 * 60 * 24 * 7);
      const otlet = String(b.otlet || "").replace(/\s+/g, " ").trim().slice(0, 500);
      await kv("RPUSH", "qn:elemzes:dontes", JSON.stringify({ slug, d, otlet, ido: new Date().toISOString() }));
      return jsonValasz(res, 200, { ok: true, uzenet: "Rendben, 3 új képet generálok (kb. 0,08 dollár). 10-15 perc, és új jóváhagyó levelet kapsz." });
    }
    const voltKulcs = r ? `qn:elemzes:dontve:${slug}:${r}` : `qn:elemzes:dontve:${slug}`;
    const volt = await kv("GET", voltKulcs);
    if (volt) return jsonValasz(res, 200, { ok: false, uzenet: `Erről az elemzésről már döntöttél: ${volt === "mehet" ? "mehet" : "elvetve"}.` });
    const cim = String(b.cim || "").replace(/\s*[\u2013\u2014]\s*/g, ": ").replace(/\s+/g, " ").trim().slice(0, 160);
    const kep = Math.max(0, Math.min(2, parseInt(b.kep, 10) || 0));
    await kv("SET", voltKulcs, d, "EX", 60 * 60 * 24 * 30);
    await kv("RPUSH", "qn:elemzes:dontes", JSON.stringify({ slug, d, cim, kep, ido: new Date().toISOString() }));
    return jsonValasz(res, 200, { ok: true, uzenet: d === "mehet" ? "Mehet, köszönöm! Pár percen belül kikerül, a választott címmel és képpel." : "Elvetve, ez az elemzés nem kerül ki." });
  }
  const gk = process.env.GEP_KULCS || "";
  if (!gk || !process.env.KV_REST_API_URL) return oldal(res, 503, "Nincs beállítva", "A jóváhagyás most nem érhető el.");
  if (u.searchParams.get("mi") === "dontesek") {
    if (!egyezik(req.headers["x-gep-kulcs"] || "", gk)) { res.statusCode = 403; return res.end("{}"); }
    const lista = (await kv("LRANGE", "qn:elemzes:dontes", 0, -1)) || [];
    if (lista.length) await kv("LTRIM", "qn:elemzes:dontes", lista.length, -1);
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ dontesek: lista.map((x) => JSON.parse(x)) }));
  }
  const slug = String(u.searchParams.get("slug") || "");
  const d = String(u.searchParams.get("d") || "");
  const t = String(u.searchParams.get("t") || "");
  if (!/^[a-z0-9-]{3,120}$/.test(slug) || !["mehet", "elvet"].includes(d)) return oldal(res, 400, "Hibás link", "Ez a link nem érvényes.");
  const vart = crypto.createHmac("sha256", gk).update(`elemzes|${slug}|${d}`).digest("hex");
  if (!egyezik(t, vart)) return oldal(res, 403, "Hibás link", "Ez a link nem érvényes.");
  const voltKulcs = `qn:elemzes:dontve:${slug}`;
  const volt = await kv("GET", voltKulcs);
  if (volt) return oldal(res, 200, "Már rögzítve", `Erről az elemzésről már döntöttél: ${volt === "mehet" ? "mehet" : "elvetve"}.`);
  await kv("SET", voltKulcs, d, "EX", 60 * 60 * 24 * 30);
  await kv("RPUSH", "qn:elemzes:dontes", JSON.stringify({ slug, d, ido: new Date().toISOString() }));
  return d === "mehet"
    ? oldal(res, 200, "Mehet, köszönöm!", "Pár percen belül kikerül a quicknews.hu-ra. Ha kint van, szólok.")
    : oldal(res, 200, "Elvetve", "Ez az elemzés nem kerül ki.");
};
