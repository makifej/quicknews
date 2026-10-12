// quicknews.hu/admin háttere: jelszavas belépés, a pult adatai (a Mac tölti fel az Upstash Redisbe), a pipák mentése.
// Env: ADMIN_JELSZO (Heni állítja be), ADMIN_TITOK (a süti aláírása és a Mac gépkulcsa),
// KV_REST_API_URL + KV_REST_API_TOKEN (a Vercelen bekötött Upstash-tároló adja; a Mac ezeket nem ismeri).
const crypto = require("crypto");
let HIREK = [];
try { HIREK = require("./_hirek.json").hirek || []; } catch (e) { HIREK = []; }

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

// a pultból kért műveletek (szerkesztés, hirdetés indítása, címsorcsere): a Mac 3 percenként hajtja végre őket
async function muveletFelvesz(b) {
  const tipus = String(b.tipus || "");
  let m = null;
  if (tipus === "szerkeszt" && /^[a-f0-9]{24}$/.test(b.pid || "")) {
    const mikor = String(b.mikor || "");
    if (mikor && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(mikor)) return [400, { hiba: "Rossz időpont." }];
    m = { tipus, pid: b.pid, szoveg: String(b.szoveg || "").slice(0, 3000) || null, mikor: mikor || null, cim: String(b.cim || "").slice(0, 200) };
  } else if ((tipus === "hirdetes_indit" || tipus === "hirdetes_cimsor") && /^[a-f0-9]{12}$/.test(b.azon || "")) {
    m = { tipus, azon: b.azon, cimsor: tipus === "hirdetes_cimsor" ? String(b.cimsor || "").trim().slice(0, 60) : null };
    if (tipus === "hirdetes_cimsor" && (m.cimsor || "").length < 3) return [400, { hiba: "Adj meg címsort." }];
  }
  if (!m) return [400, { hiba: "Rossz kérés." }];
  m.kert = new Date().toISOString();
  await kv("HSET", P + "muveletek", crypto.randomBytes(8).toString("hex"), JSON.stringify(m));
  return [200, { ok: true }];
}

function alair(lejar) {
  return crypto.createHmac("sha256", process.env.ADMIN_TITOK).update(String(lejar)).digest("hex");
}

function belepve(req) {
  // SEC-012: titok nélkül semmilyen süti nem érvényes (különben üres kulccsal is hamisítható lenne)
  if (!process.env.ADMIN_TITOK) return false;
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

async function kepFeltolt(id, b64) {
  if (!/^[a-f0-9]{12}$/.test(id || "")) return { hiba: "Rossz azonosító." };
  if (!b64 || b64.length > 4_000_000) return { hiba: "A kép túl nagy vagy üres (legfeljebb kb. 3 MB)." };
  const ido = new Date().toISOString();
  await kv("SET", P + "kep:" + id, b64, "EX", 30 * 86400);
  const regi = await kv("HGET", P + "kitenni", id);
  const e = regi ? JSON.parse(regi) : {};
  e.sajat_kep = { ido, meret: Math.round(b64.length * 0.75) };
  await kv("HSET", P + "kitenni", id, JSON.stringify(e));
  return { ok: true, ido };
}

module.exports = async (req, res) => {
  const url = new URL(req.url, "https://quicknews.hu");
  const mi = url.searchParams.get("mi") || "";
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  try {
    if (mi === "belep" && req.method === "POST") {
      const { jelszo } = await torzs(req);
      if (!process.env.ADMIN_JELSZO || !process.env.ADMIN_TITOK) return json(res, 503, { hiba: "Még nincs beállítva admin jelszó." });
      // SEC-003: IP-nként óránként legfeljebb 10 jelszópróba. A próbát az ellenőrzés ELŐTT, atomikusan foglaljuk le
      // (INCR), így párhuzamos kérésekkel sem lehet többet kiértékeltetni. Globális zárolás nincs, hogy egy támadó
      // ne zárhassa ki a tulajdonost; az összesített számláló csak a megfigyeléshez van.
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
      const ora = new Date().toISOString().slice(0, 13);
      const ipKulcs = "qn:admin:probak:" + crypto.createHash("sha256").update(`${process.env.CHAT_SO || ""}|${ora}|${ip}`).digest("hex").slice(0, 24);
      const db = await kv("INCR", ipKulcs);
      if (db === 1) await kv("EXPIRE", ipKulcs, 3600);
      if (db > 10) return json(res, 429, { hiba: "Túl sok próbálkozás erről a hálózatról. Próbáld újra egy óra múlva." });
      await new Promise((r) => setTimeout(r, 400)); // lassítja a próbálgatást
      if (!jelszo || !egyezik(jelszo, process.env.ADMIN_JELSZO)) {
        const ossz = "qn:admin:hibas:ossz:" + ora;
        if ((await kv("INCR", ossz)) === 1) await kv("EXPIRE", ossz, 86400);
        return json(res, 401, { hiba: "Hibás jelszó." });
      }
      await kv("DEL", ipKulcs);
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
      if (mi === "kep_feltolt" && req.method === "POST") {
        const { id, b64 } = await torzs(req);
        return json(res, 200, await kepFeltolt(id, b64));
      }
      if (mi === "hirdetok_gep") {
        const idk = (await kv("ZREVRANGE", "qn:hird:lista", 0, 199)) || [];
        const tetel = [];
        for (const id of idk) { const v = await kv("GET", "qn:hird:" + id); if (v) tetel.push(JSON.parse(v)); }
        return json(res, 200, { tetel });
      }
      if (mi === "hirdeto_allapot_gep" && req.method === "POST") {
        const { id, allapot } = await torzs(req);
        if (/^[a-f0-9]{16}$/.test(id || "") && allapot === "torol") {  // Heni törölhet bármit a listából
          await kv("DEL", "qn:hird:" + id); await kv("ZREM", "qn:hird:lista", id);
          return json(res, 200, { ok: true });
        }
        if (!/^[a-f0-9]{16}$/.test(id || "") || !["uj", "felkerestem", "ugyfel", "nem"].includes(allapot)) return json(res, 400, { hiba: "Rossz kérés." });
        const v = await kv("GET", "qn:hird:" + id);
        if (!v) return json(res, 404, { hiba: "Nincs ilyen." });
        const r = JSON.parse(v); r.allapot = allapot; r.modositva = new Date().toISOString();
        await kv("SET", "qn:hird:" + id, JSON.stringify(r), "KEEPTTL");
        return json(res, 200, { ok: true });
      }
      if (mi === "bekuldesek_gep") {
        const idk = (await kv("ZREVRANGE", "qn:bek:lista", 0, 99)) || [];
        const tetel = [];
        for (const id of idk) { const v = await kv("GET", "qn:bek:" + id); if (v) tetel.push(JSON.parse(v)); }
        return json(res, 200, { tetel });
      }
      if (mi === "bekuldes_dontes_gep" && req.method === "POST") {
        const { id, allapot } = await torzs(req);
        if (/^[a-f0-9]{16}$/.test(id || "") && allapot === "torol") {  // törlés a listából (a már megjelent hír marad az oldalon)
          await kv("DEL", "qn:bek:" + id); await kv("ZREM", "qn:bek:lista", id); await kv("SREM", "qn:bek:var", id);
          return json(res, 200, { ok: true });
        }
        if (!/^[a-f0-9]{16}$/.test(id || "") || !["elfogadva", "elutasitva", "dontesre_var"].includes(allapot)) return json(res, 400, { hiba: "Rossz kérés." });
        const v = await kv("GET", "qn:bek:" + id);
        if (!v) return json(res, 404, { hiba: "Nincs ilyen beküldés." });
        const r = JSON.parse(v);
        if (r.atveve) return json(res, 409, { hiba: "Ez már bekerült a feldolgozásba." });
        r.allapot = allapot; if (allapot === "dontesre_var") delete r.kezi; else r.kezi = new Date().toISOString();
        await kv("SET", "qn:bek:" + id, JSON.stringify(r), "EX", 90 * 86400);
        if (allapot === "elfogadva") await kv("SADD", "qn:bek:var", id); else await kv("SREM", "qn:bek:var", id);
        return json(res, 200, { ok: true });
      }
      if (mi === "bekuldes_allapot" && req.method === "POST") {
        // a Mac jelzi, mi lett a feldolgozásba került beküldéssel: megjelent (linkkel) vagy kiszűrte a szerkesztés
        const { id, megjelent, kiszurve, link } = await torzs(req);
        if (!/^[a-f0-9]{16}$/.test(id || "")) return json(res, 400, { hiba: "rossz azonosító" });
        const v = await kv("GET", "qn:bek:" + id);
        if (!v) return json(res, 404, { hiba: "nincs" });
        const r = JSON.parse(v);
        if (megjelent) { r.megjelent = megjelent; r.link = String(link || "").slice(0, 300); }
        if (kiszurve) r.kiszurve = String(kiszurve).slice(0, 200);
        await kv("SET", "qn:bek:" + id, JSON.stringify(r), "EX", 90 * 86400);
        return json(res, 200, { ok: true });
      }
      if (mi === "bekuldes_var") {
        const idk = (await kv("SMEMBERS", "qn:bek:var")) || [];
        const tetel = [];
        for (const id of idk) { const v = await kv("GET", "qn:bek:" + id); if (v) tetel.push(JSON.parse(v)); }
        return json(res, 200, { tetel });
      }
      if (mi === "bekuldes_atvett" && req.method === "POST") {
        const { idk } = await torzs(req);
        for (const id of (idk || []).filter((x) => /^[a-f0-9]{16}$/.test(x))) {
          await kv("SREM", "qn:bek:var", id);
          const v = await kv("GET", "qn:bek:" + id);
          if (v) { const r = JSON.parse(v); r.atveve = new Date().toISOString(); await kv("SET", "qn:bek:" + id, JSON.stringify(r), "EX", 90 * 86400); }
        }
        return json(res, 200, { ok: true });
      }
      if (mi === "kisopor_gep" && req.method === "POST") {
        const { id, ertek } = await torzs(req);
        if (!/^[a-f0-9]{12}$/.test(id || "")) return json(res, 400, { hiba: "rossz azonosító" });
        if (ertek === false) await kv("SREM", P + "kisoport", id); else await kv("SADD", P + "kisoport", id);
        return json(res, 200, { ok: true });
      }
      if (mi === "kisoport") {
        return json(res, 200, { idk: (await kv("SMEMBERS", P + "kisoport")) || [] });
      }
      if (mi === "chat_szamlalo_torles" && req.method === "POST") {
        const kulcsok = (await kv("KEYS", "qn:chat:ip:*")) || [];
        for (const k of kulcsok) await kv("DEL", k);
        return json(res, 200, { ok: true, torolve: kulcsok.length });
      }
      if (mi === "torlendo") {
        const k = (await kv("HGETALL", P + "torlendo")) || [];
        const t = {};
        for (let i = 0; i < k.length; i += 2) t[k[i]] = JSON.parse(k[i + 1]);
        return json(res, 200, t);
      }
      if (mi === "muvelet_gep" && req.method === "POST") {
        const [kod, valasz] = await muveletFelvesz(await torzs(req));
        return json(res, kod, valasz);
      }
      if (mi === "muveletek_gep") {
        const k = (await kv("HGETALL", P + "muveletek")) || [];
        const t = {};
        for (let i = 0; i < k.length; i += 2) t[k[i]] = JSON.parse(k[i + 1]);
        return json(res, 200, t);
      }
      if (mi === "muvelet_kesz" && req.method === "POST") {
        const { kulcs, eredmeny } = await torzs(req);
        const v = await kv("HGET", P + "muveletek", String(kulcs || ""));
        await kv("HDEL", P + "muveletek", String(kulcs || ""));
        if (v) {
          const m = JSON.parse(v); m.kesz = new Date().toISOString(); m.eredmeny = String(eredmeny || "").slice(0, 300);
          await kv("LPUSH", P + "muvelet_naplo", JSON.stringify(m)); await kv("LTRIM", P + "muvelet_naplo", 0, 99);
        }
        return json(res, 200, { ok: true });
      }
      if (mi === "torlendo_kesz" && req.method === "POST") {
        const { pid } = await torzs(req);
        await kv("HDEL", P + "torlendo", String(pid || ""));
        return json(res, 200, { ok: true });
      }
      if (mi === "kep") {
        const b64 = await kv("GET", P + "kep:" + (url.searchParams.get("id") || ""));
        return json(res, b64 ? 200 : 404, b64 ? { b64 } : { hiba: "nincs feltöltött kép" });
      }
      if (mi === "kitenni") {
        if (req.method === "POST") {
          const { id, e } = await torzs(req);
          if (!/^[a-f0-9]{12}$/.test(id || "")) return json(res, 400, { hiba: "rossz azonosító" });
          if (!e || (!e.facebook && !e.linkedin && !e.hirdetes && !e.kartya && !e.sajat_kep)) await kv("HDEL", P + "kitenni", id);
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
      const adat = v ? JSON.parse(v) : { hiba: "Még nincs feltöltött adat.", sorok: [] };
      if (mi === "posztok") {
        const k = (await kv("HGETALL", P + "torlendo")) || [];
        const t = new Set(k.filter((_, i) => i % 2 === 0));
        for (const s of adat.sorok || []) if (t.has(s.id)) s.torles_folyamatban = true;
      }
      return json(res, 200, adat);
    }
    if (mi === "torles" && req.method === "POST") {
      const { pid, felulet, cim } = await torzs(req);
      if (!/^[a-f0-9]{24}$/.test(pid || "")) return json(res, 400, { hiba: "Rossz posztazonosító." });
      await kv("HSET", P + "torlendo", pid, JSON.stringify({ kert: new Date().toISOString(), felulet, cim: String(cim || "").slice(0, 200) }));
      return json(res, 200, { ok: true, sorban: true });
    }
    if (mi === "ajanlott") {
      const v = await kv("GET", P + "pult:ajanlott");
      const adat = v ? JSON.parse(v) : { sorok: [] };
      // a pipák élőben jönnek, nem a (negyedóránként frissülő) pillanatképből
      const k = (await kv("HGETALL", P + "kitenni")) || [];
      const kit = {};
      for (let i = 0; i < k.length; i += 2) kit[k[i]] = JSON.parse(k[i + 1]);
      const kis = new Set((await kv("SMEMBERS", P + "kisoport")) || []);
      adat.sorok = (adat.sorok || []).filter((s) => !kis.has(s.id));
      // ami a gép utolsó pillanatképe óta jelent meg, azt a kitett oldal indexéből azonnal hozzáadjuk
      const megvan = new Set(adat.sorok.map((s) => s.id));
      const hatar = Math.max(Date.parse(adat.frissitve || 0) || 0, Date.now() - 96 * 3600e3);
      for (const h of HIREK) {
        const t = Date.parse(h.publikalva || "");
        if (!t || t <= hatar || megvan.has(h.id) || kis.has(h.id)) continue;
        adat.sorok.push({
          id: h.id, cim: h.cim, lead: h.lead, slug: (h.url || "").replace(/^\/hir\//, ""),
          fontossag: h.fontossag, felkapott: false, kategoria: h.kategoria, forras: h.forras,
          publikalva: h.publikalva, video: !!h.video, kep: "https://quicknews.hu" + (h.kep || ""),
          pont: (h.fontossag || 3) * 20 + 15, uj: true, allapot: {},
        });
      }
      adat.sorok.sort((a, b) => String(b.publikalva || "").localeCompare(String(a.publikalva || "")));
      for (const s of adat.sorok || []) {
        const e = kit[s.id] || {};
        s.kerve = { facebook: !!e.facebook, linkedin: !!e.linkedin, hirdetes: !!e.hirdetes };
        s.kartya = e.kartya || null;
        s.sajat_kep = e.sajat_kep || null;
        s.jovahagyas = e.jovahagyas || {};
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
    if (mi === "kep_feltolt" && req.method === "POST") {
      const { id, b64 } = await torzs(req);
      const r = await kepFeltolt(id, b64);
      return json(res, r.hiba ? 400 : 200, r);
    }
    if (mi === "kep") {
      const b64 = await kv("GET", P + "kep:" + (url.searchParams.get("id") || "").replace(/[^a-f0-9]/g, ""));
      if (!b64) { res.statusCode = 404; return res.end("nincs"); }
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "private, no-store");
      return res.end(Buffer.from(b64, "base64"));
    }
    if (mi === "hirdetok") {
      const idk = (await kv("ZREVRANGE", "qn:hird:lista", 0, 199)) || [];
      const tetel = [];
      for (const id of idk) { const v = await kv("GET", "qn:hird:" + id); if (v) tetel.push(JSON.parse(v)); }
      return json(res, 200, { tetel });
    }
    if (mi === "hirdeto_allapot" && req.method === "POST") {
      const { id, allapot } = await torzs(req);
      if (/^[a-f0-9]{16}$/.test(id || "") && allapot === "torol") {  // Heni törölhet bármit a listából
        await kv("DEL", "qn:hird:" + id); await kv("ZREM", "qn:hird:lista", id);
        return json(res, 200, { ok: true });
      }
      if (!/^[a-f0-9]{16}$/.test(id || "") || !["uj", "felkerestem", "ugyfel", "nem"].includes(allapot)) return json(res, 400, { hiba: "Rossz kérés." });
      const v = await kv("GET", "qn:hird:" + id);
      if (!v) return json(res, 404, { hiba: "Nincs ilyen." });
      const r = JSON.parse(v); r.allapot = allapot; r.modositva = new Date().toISOString();
      await kv("SET", "qn:hird:" + id, JSON.stringify(r), "KEEPTTL");
      return json(res, 200, { ok: true });
    }
    if (mi === "bekuldesek") {
      const idk = (await kv("ZREVRANGE", "qn:bek:lista", 0, 99)) || [];
      const tetel = [];
      for (const id of idk) { const v = await kv("GET", "qn:bek:" + id); if (v) tetel.push(JSON.parse(v)); }
      return json(res, 200, { tetel });
    }
    if (mi === "bekuldes_dontes" && req.method === "POST") {
      // Heni felülbírálja a moderátor AI döntését: elfogadva -> a Mac átveszi; elutasitva -> kikerül a várólistából
      const { id, allapot } = await torzs(req);
      if (/^[a-f0-9]{16}$/.test(id || "") && allapot === "torol") {  // törlés a listából (a már megjelent hír marad az oldalon)
        await kv("DEL", "qn:bek:" + id); await kv("ZREM", "qn:bek:lista", id); await kv("SREM", "qn:bek:var", id);
        return json(res, 200, { ok: true });
      }
      if (!/^[a-f0-9]{16}$/.test(id || "") || !["elfogadva", "elutasitva", "dontesre_var"].includes(allapot)) return json(res, 400, { hiba: "Rossz kérés." });
      const v = await kv("GET", "qn:bek:" + id);
      if (!v) return json(res, 404, { hiba: "Nincs ilyen beküldés." });
      const r = JSON.parse(v);
      if (r.atveve) return json(res, 409, { hiba: "Ez már bekerült a feldolgozásba." });
      r.allapot = allapot; if (allapot === "dontesre_var") delete r.kezi; else r.kezi = new Date().toISOString();
      await kv("SET", "qn:bek:" + id, JSON.stringify(r), "EX", 90 * 86400);
      if (allapot === "elfogadva") await kv("SADD", "qn:bek:var", id); else await kv("SREM", "qn:bek:var", id);
      return json(res, 200, { ok: true });
    }
    if (mi === "kisopor" && req.method === "POST") {
      const { id, ertek } = await torzs(req);
      if (!/^[a-f0-9]{12}$/.test(id || "")) return json(res, 400, { hiba: "Rossz azonosító." });
      if (ertek === false) await kv("SREM", P + "kisoport", id); else await kv("SADD", P + "kisoport", id);
      return json(res, 200, { ok: true });
    }
    if (mi === "muvelet" && req.method === "POST") {
      const [kod, valasz] = await muveletFelvesz(await torzs(req));
      return json(res, kod, valasz);
    }
    if (mi === "muveletek") {
      const k = (await kv("HGETALL", P + "muveletek")) || [];
      const t = {};
      for (let i = 0; i < k.length; i += 2) t[k[i]] = JSON.parse(k[i + 1]);
      return json(res, 200, t);
    }
    if (mi === "kijeloles" && req.method === "POST") {
      const { id, mi: mezo, ertek } = await torzs(req);
      if (!/^[a-f0-9]{12}$/.test(id || "")) return json(res, 400, { hiba: "Rossz azonosító." });
      const regi = await kv("HGET", P + "kitenni", id);
      const e = regi ? JSON.parse(regi) : {};
      const most = new Date().toISOString();
      if (["facebook", "linkedin", "hirdetes"].includes(mezo)) {
        if (ertek) e[mezo] = { kerve: most }; else delete e[mezo];
      } else if (mezo === "jovahagyas") {
        // a pipa önmagában nem indít semmit: csak a jóváhagyott felületekhez készül időzített elem (Heni 2026-10-12)
        const feluletek = ["facebook", "linkedin", "hirdetes"].filter((f) => e[f]);
        if (ertek) {
          if (!feluletek.length) return json(res, 400, { hiba: "Előbb pipáld be, hova menjen ki." });
          e.jovahagyas = { ido: most, feluletek };
        } else delete e.jovahagyas;
      } else if (mezo === "kartya_jo" || mezo === "kartya_rossz") {
        if (!e.kartya || !e.kartya.fajl) return json(res, 400, { hiba: "Ehhez a hírhez még nincs kártya." });
        if (mezo === "kartya_jo") { e.kartya.jo = ertek ? most : null; if (ertek) e.kartya.elutasitva = null; }
        else { e.kartya.elutasitva = ertek ? most : null; if (ertek) e.kartya.jo = null; }
      } else return json(res, 400, { hiba: "Ismeretlen mező." });
      if (!e.facebook && !e.linkedin && !e.hirdetes && !e.kartya && !e.sajat_kep && !e.jovahagyas) await kv("HDEL", P + "kitenni", id);
      else await kv("HSET", P + "kitenni", id, JSON.stringify(e));
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { hiba: "Ismeretlen kérés." });
  } catch (err) {
    return json(res, 500, { hiba: "Szerverhiba: " + String(err.message || err).slice(0, 120) });
  }
};
