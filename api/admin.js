// quicknews.hu/admin háttere: jelszavas belépés, a pult adatai (a Mac tölti fel az Upstash Redisbe), a pipák mentése.
// Env: ADMIN_JELSZO (Heni állítja be), ADMIN_TITOK (a süti aláírása és a Mac gépkulcsa),
// KV_REST_API_URL + KV_REST_API_TOKEN (a Vercelen bekötött Upstash-tároló adja; a Mac ezeket nem ismeri).
const crypto = require("crypto");

const P = "qn:";
const SUTI = "qn_admin";
const NAP = 30;

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

function alair(lejar) {
  return crypto.createHmac("sha256", process.env.ADMIN_TITOK || "").update(String(lejar)).digest("hex");
}

function belepve(req) {
  const m = (req.headers.cookie || "").match(new RegExp(`${SUTI}=(\\d+)\\.([a-f0-9]{64})`));
  if (!m || Number(m[1]) < Date.now()) return false;
  const a = Buffer.from(alair(m[1])), b = Buffer.from(m[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function gep(req) {
  // a Mac feltöltője: X-Gep-Kulcs = ADMIN_TITOK
  const k = req.headers["x-gep-kulcs"] || "";
  return !!process.env.ADMIN_TITOK && k.length > 20 && egyezik(k, process.env.ADMIN_TITOK);
}

function egyezik(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

async function torzs(req) {
  if (req.body && typeof req.body === "object") return req.body;
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

module.exports = async (req, res) => {
  const url = new URL(req.url, "https://quicknews.hu");
  const mi = url.searchParams.get("mi") || "";
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  try {
    if (mi === "belep" && req.method === "POST") {
      const { jelszo } = await torzs(req);
      if (!process.env.ADMIN_JELSZO) return json(res, 503, { hiba: "Még nincs beállítva admin jelszó." });
      await new Promise((r) => setTimeout(r, 400)); // lassítja a próbálgatást
      if (!jelszo || !egyezik(jelszo, process.env.ADMIN_JELSZO)) return json(res, 401, { hiba: "Hibás jelszó." });
      const lejar = Date.now() + NAP * 864e5;
      res.setHeader("Set-Cookie", `${SUTI}=${lejar}.${alair(lejar)}; Path=/; Max-Age=${NAP * 86400}; HttpOnly; Secure; SameSite=Strict`);
      return json(res, 200, { ok: true });
    }
    if (mi === "kilep") {
      res.setHeader("Set-Cookie", `${SUTI}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
      return json(res, 200, { ok: true });
    }
    if (gep(req)) {
      if (mi === "feltolt" && req.method === "POST") {
        const { kulcs, adat } = await torzs(req);
        if (!["posztok", "koltseg", "ajanlott"].includes(kulcs)) return json(res, 400, { hiba: "rossz kulcs" });
        await kv("SET", P + "pult:" + kulcs, JSON.stringify(adat));
        return json(res, 200, { ok: true });
      }
      if (mi === "kartya_feltolt" && req.method === "POST") {
        const { fajl, b64 } = await torzs(req);
        if (!/^[a-f0-9]{12}-v\d+\.jpg$/.test(fajl || "")) return json(res, 400, { hiba: "rossz fájlnév" });
        await kv("SET", P + "kartya:" + fajl, b64, "EX", 60 * 86400);
        return json(res, 200, { ok: true });
      }
      if (mi === "kitenni") {
        if (req.method === "POST") {
          const { id, e } = await torzs(req);
          if (!/^[a-f0-9]{12}$/.test(id || "")) return json(res, 400, { hiba: "rossz azonosító" });
          if (!e || (!e.facebook && !e.linkedin && !e.hirdetes && !e.kartya)) await kv("HDEL", P + "kitenni", id);
          else await kv("HSET", P + "kitenni", id, JSON.stringify(e));
          return json(res, 200, { ok: true });
        }
        const k = (await kv("HGETALL", P + "kitenni")) || [];
        const kit = {};
        for (let i = 0; i < k.length; i += 2) kit[k[i]] = JSON.parse(k[i + 1]);
        return json(res, 200, kit);
      }
    }
    if (!belepve(req)) return json(res, 401, { hiba: "Belépés szükséges." });

    if (mi === "posztok" || mi === "koltseg") {
      const v = await kv("GET", P + "pult:" + mi);
      return json(res, 200, v ? JSON.parse(v) : { hiba: "Még nincs feltöltött adat.", sorok: [] });
    }
    if (mi === "ajanlott") {
      const v = await kv("GET", P + "pult:ajanlott");
      const adat = v ? JSON.parse(v) : { sorok: [] };
      // a pipák élőben jönnek, nem a (negyedóránként frissülő) pillanatképből
      const k = (await kv("HGETALL", P + "kitenni")) || [];
      const kit = {};
      for (let i = 0; i < k.length; i += 2) kit[k[i]] = JSON.parse(k[i + 1]);
      for (const s of adat.sorok || []) {
        const e = kit[s.id] || {};
        s.kerve = { facebook: !!e.facebook, linkedin: !!e.linkedin, hirdetes: !!e.hirdetes };
        s.kartya = e.kartya || null;
      }
      return json(res, 200, adat);
    }
    if (mi === "kartya") {
      const f = (url.searchParams.get("f") || "").replace(/[^a-z0-9.\-]/gi, "");
      const b64 = f && (await kv("GET", P + "kartya:" + f));
      if (!b64) { res.statusCode = 404; return res.end("nincs"); }
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "private, max-age=3600");
      return res.end(Buffer.from(b64, "base64"));
    }
    if (mi === "kijeloles" && req.method === "POST") {
      const { id, mi: mezo, ertek } = await torzs(req);
      if (!/^[a-f0-9]{12}$/.test(id || "")) return json(res, 400, { hiba: "Rossz azonosító." });
      const regi = await kv("HGET", P + "kitenni", id);
      const e = regi ? JSON.parse(regi) : {};
      const most = new Date().toISOString();
      if (["facebook", "linkedin", "hirdetes"].includes(mezo)) {
        if (ertek) e[mezo] = { kerve: most }; else delete e[mezo];
      } else if (mezo === "kartya_jo" || mezo === "kartya_rossz") {
        if (!e.kartya || !e.kartya.fajl) return json(res, 400, { hiba: "Ehhez a hírhez még nincs kártya." });
        if (mezo === "kartya_jo") { e.kartya.jo = ertek ? most : null; if (ertek) e.kartya.elutasitva = null; }
        else { e.kartya.elutasitva = ertek ? most : null; if (ertek) e.kartya.jo = null; }
      } else return json(res, 400, { hiba: "Ismeretlen mező." });
      if (!e.facebook && !e.linkedin && !e.hirdetes && !e.kartya) await kv("HDEL", P + "kitenni", id);
      else await kv("HSET", P + "kitenni", id, JSON.stringify(e));
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { hiba: "Ismeretlen kérés." });
  } catch (err) {
    return json(res, 500, { hiba: "Szerverhiba: " + String(err.message || err).slice(0, 120) });
  }
};
