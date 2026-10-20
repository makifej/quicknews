// quicknews.hu/admin háttere: jelszavas belépés, a pult adatai (a Mac tölti fel az Upstash Redisbe), a pipák mentése.
// Env: ADMIN_JELSZO (Heni állítja be), ADMIN_TITOK (csak a süti aláírása, api/_suti.js), GEP_KULCS (a Mac gépkulcsa),
// KV_REST_API_URL + KV_REST_API_TOKEN (a Vercelen bekötött Upstash-tároló adja; a Mac ezeket nem ismeri).
const crypto = require("crypto");
const suti = require("./_suti.js");
let HIREK = [];
try { HIREK = require("./_hirek.json").hirek || []; } catch (e) { HIREK = []; }

const P = "qn:";
const SUTI = suti.SUTI;
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

// a süti kezelése a közös api/_suti.js-ben (SEC-015, SEC-016)
const alair = suti.alair;
const sutiGen = () => suti.sutiGen(kv);
const belepve = (req) => suti.belepve(req, kv);

// SEC-017: a feltöltött kép csak JPEG lehet (fájlaláírás), és a kártya mérete is korlátos
function jpegE(b64) {
  const b = Buffer.from(String(b64 || "").slice(0, 8), "base64");
  return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

function gep(req) {
  // a Mac feltöltője: X-Gep-Kulcs = GEP_KULCS (SEC-015: külön titok, nem a süti kulcsa).
  // ÁTMENETI: a kulcscsere idejére a régi (ADMIN_TITOK) is elfogadott, ha GEP_REGI_IS=1
  const k = req.headers["x-gep-kulcs"] || "";
  if (k.length <= 20) return false;
  if (process.env.GEP_KULCS && egyezik(k, process.env.GEP_KULCS)) return true;
  return process.env.GEP_REGI_IS === "1" && !!process.env.ADMIN_TITOK && egyezik(k, process.env.ADMIN_TITOK);
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
  if (!jpegE(b64)) return { hiba: "Csak JPEG kép tölthető fel." };
  const ido = new Date().toISOString();
  await kv("SET", P + "kep:" + id, b64, "EX", 30 * 86400);
  const regi = await kv("HGET", P + "kitenni", id);
  const e = regi ? JSON.parse(regi) : {};
  e.sajat_kep = { ido, meret: Math.round(b64.length * 0.75) };
  await kv("HSET", P + "kitenni", id, JSON.stringify(e));
  return { ok: true, ido };
}

// ---- hírlevél (Heni 2026-10-13): feliratkozók, küldés be/ki, kiadásnapló; a levelet a Mac küldi reggel 8-kor ----
const HL = "qn:hirlevel";
const HL_MINTA = /^[^\s@,;:<>()[\]\\"]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
async function hirlevelAdat() {
  const k = (await kv("HGETALL", HL)) || [];
  const lista = [];
  for (let i = 0; i < k.length; i += 2) {
    let v = { ido: k[i + 1] };
    try { const j = JSON.parse(k[i + 1]); if (j && typeof j === "object") v = j; } catch (e) { /* régi alak: csak időpont */ }
    lista.push({ email: k[i], ido: v.ido || "", forras: v.forras || "" });
  }
  lista.sort((a, b) => String(b.ido).localeCompare(String(a.ido)));
  const beall = JSON.parse((await kv("GET", HL + ":beall")) || '{"aktiv":true}');
  const kiadasok = ((await kv("LRANGE", HL + ":kiadasok", 0, 29)) || []).map((x) => JSON.parse(x));
  return { darab: lista.length, lista, beall, kiadasok, ido: new Date().toISOString() };
}
async function hirlevelMuvelet(b) {
  if (b.muvelet === "beall") {
    await kv("SET", HL + ":beall", JSON.stringify({ aktiv: !!b.aktiv, modositva: new Date().toISOString() }));
    return [200, { ok: true }];
  }
  const email = String(b.email || "").trim().toLowerCase();
  if (email.length < 6 || email.length > 254 || !HL_MINTA.test(email)) return [400, { hiba: "Ez a cím nem tűnik érvényesnek." }];
  if (b.muvelet === "torol") { await kv("HDEL", HL, email); return [200, { ok: true }]; }
  if (b.muvelet === "hozzaad") {
    const uj = await kv("HSETNX", HL, email, JSON.stringify({ ido: new Date().toISOString(), forras: "admin" }));
    return [200, { ok: true, uj: Number(uj) }];
  }
  return [400, { hiba: "Rossz kérés." }];
}

// ---- BOO-vadászat nyereményjáték (Heni 2026-10-20): a jelentkezők külön listán (api/boo.js) ----
const BOO = "qn:boo";
async function booAdat() {
  const k = (await kv("HGETALL", BOO)) || [];
  const lista = [];
  for (let i = 0; i < k.length; i += 2) {
    let v = {};
    try { v = JSON.parse(k[i + 1]) || {}; } catch (e) { /* hibás bejegyzés */ }
    lista.push({ email: k[i], ido: v.ido || "", hirlevel: !!v.hirlevel });
  }
  lista.sort((a, b) => String(b.ido).localeCompare(String(a.ido)));
  return { darab: lista.length, lista, ido: new Date().toISOString() };
}
async function booMuvelet(b) {
  const email = String(b.email || "").trim().toLowerCase();
  if (b.muvelet === "torol" && email) { await kv("HDEL", BOO, email); return [200, { ok: true }]; }
  return [400, { hiba: "Rossz kérés." }];
}

// ---- Google AdSense futásidejű kapcsoló (Heni 2026-10-20): qn:adsense_ki = "1" -> az oldal nem tölti be a hirdetéseket (api/adsense.js) ----
async function adsenseAdat() { return { be: (await kv("GET", "qn:adsense_ki")) !== "1" }; }
async function adsenseKapcsol(b) {
  if (typeof b.be !== "boolean") return [400, { hiba: "Rossz kérés." }];
  if (b.be) await kv("DEL", "qn:adsense_ki"); else await kv("SET", "qn:adsense_ki", "1");
  return [200, await adsenseAdat()];
}

module.exports = async (req, res) => {
  const url = new URL(req.url, "https://quicknews.hu");
  const mi = url.searchParams.get("mi") || "";
  // SEC-021: só vagy adattár nélkül nem futunk (különben sózatlan IP-lenyomat készülne, pl. preview környezetben)
  if (!process.env.CHAT_SO || !process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return json(res, 503, { hiba: "nincs beállítva" });
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
      const lejar = Date.now() + NAP * 864e5, gen = await sutiGen();
      res.setHeader("Set-Cookie", `${SUTI}=${lejar}.${gen}.${alair(lejar, gen)}; Path=/; Max-Age=${NAP * 86400}; HttpOnly; Secure; SameSite=Strict`);
      return json(res, 200, { ok: true });
    }
    if (mi === "kilep") {
      // csak érvényes sütivel érvényteleníti a többi munkamenetet is, különben bárki kiléptethetné a tulajdonost
      if (await belepve(req)) await kv("INCR", "qn:admin:gen");
      res.setHeader("Set-Cookie", `${SUTI}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
      return json(res, 200, { ok: true });
    }
    if (gep(req)) {
      if (mi === "feltolt" && req.method === "POST") {
        const { kulcs, adat } = await torzs(req);
        if (!["posztok", "koltseg", "ajanlott", "statisztika"].includes(kulcs)) return json(res, 400, { hiba: "rossz kulcs" });
        await kv("SET", P + "pult:" + kulcs, JSON.stringify(adat));
        return json(res, 200, { ok: true });
      }
      if (mi === "kartya_feltolt" && req.method === "POST") {
        const { fajl, b64 } = await torzs(req);
        if (!/^[a-f0-9]{12}-v\d+\.jpg$/.test(fajl || "")) return json(res, 400, { hiba: "rossz fájlnév" });
        if (typeof b64 !== "string" || b64.length > 2_700_000 || !jpegE(b64)) return json(res, 400, { hiba: "csak legfeljebb 2 MB-os JPEG" });
        await kv("SET", P + "kartya:" + fajl, b64, "EX", 60 * 86400);
        return json(res, 200, { ok: true });
      }
      if (mi === "kep_feltolt" && req.method === "POST") {
        const { id, b64 } = await torzs(req);
        return json(res, 200, await kepFeltolt(id, b64));
      }
      if (mi === "hirlevel_gep") return json(res, 200, await hirlevelAdat());
      if (mi === "boo_gep") return json(res, 200, await booAdat());
      if (mi === "adsense_gep") return json(res, 200, await adsenseAdat());
      if (mi === "adsense_kapcsol_gep" && req.method === "POST") { const [k, v] = await adsenseKapcsol(await torzs(req)); return json(res, k, v); }
      if (mi === "boo_muvelet_gep" && req.method === "POST") { const [k, v] = await booMuvelet(await torzs(req)); return json(res, k, v); }
      if (mi === "hirlevel_muvelet_gep" && req.method === "POST") { const [k, v] = await hirlevelMuvelet(await torzs(req)); return json(res, k, v); }
      if (mi === "hirlevel_kiadas_gep" && req.method === "POST") {
        const { kiadas, html } = await torzs(req);
        if (!kiadas || typeof kiadas !== "object") return json(res, 400, { hiba: "rossz kérés" });
        // SEC-018: csak a várt mezők kerülnek be (mass assignment ellen)
        const kiadasTiszta = Object.fromEntries(["nap", "ido", "targy", "hirek", "cimzett", "hiba", "hir_idk", "cimek_lenyomat"]
          .filter((k) => k in kiadas).map((k) => [k, kiadas[k]]));
        await kv("LPUSH", HL + ":kiadasok", JSON.stringify(kiadasTiszta));
        await kv("LTRIM", HL + ":kiadasok", 0, 59);
        if (typeof html === "string" && html.length < 400000) await kv("SET", HL + ":utolso", html);
        return json(res, 200, { ok: true });
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
          if (!e || (!e.facebook && !e.linkedin && !e.hirdetes && !e.csoport && !e.kartya && !e.sajat_kep && !e.hirlevel)) await kv("HDEL", P + "kitenni", id);
          else await kv("HSET", P + "kitenni", id, JSON.stringify(kitenniTiszta(e)));
          return json(res, 200, { ok: true });
        }
        const k = (await kv("HGETALL", P + "kitenni")) || [];
        const kit = {};
        for (let i = 0; i < k.length; i += 2) kit[k[i]] = JSON.parse(k[i + 1]);
        return json(res, 200, kit);
      }
    }
    if (!(await belepve(req))) return json(res, 401, { hiba: "Belépés szükséges." });

    if (mi === "posztok" || mi === "koltseg" || mi === "statisztika") {
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
      if (!["Facebook", "LinkedIn", "Hirdetés"].includes(felulet)) return json(res, 400, { hiba: "Rossz felület." });
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
      // az oldalról levett hír (duplikátum, nem releváns, törölt) az Ajánlottból is azonnal kikerül, nem csak a következő
      // pillanatképpel (Heni 2026-10-13: „ha törölsz egy hírt az oldalról, vedd ki onnan is”); az index 14 napot fed le
      if (HIREK.length) {
        const elo = new Set(HIREK.map((h) => h.id));
        adat.sorok = adat.sorok.filter((s) => elo.has(s.id));
      }
      // ami a gép utolsó pillanatképe óta jelent meg, azt a kitett oldal indexéből azonnal hozzáadjuk
      const megvan = new Set(adat.sorok.map((s) => s.id));
      // minden élő hír, ami a pillanatképből hiányzik (a 4 napos ablakon belül), azonnal bekerül: nem csak a pillanatkép
      // után megjelentek, mert a pillanatkép a gyűjtés ütemétől függően néhány percig a friss híreket még nem látja
      const hatar = Date.now() - 96 * 3600e3;
      // NINCS BORÍTÓKÉP, NINCS AJÁNLOTT CIKK (Heni 2026-10-13): csak betölthető képpel kerülhet be
      const jeloltek = HIREK.filter((h) => { const t = Date.parse(h.publikalva || ""); return t && t > hatar && !megvan.has(h.id) && !kis.has(h.id) && h.kep; });
      const kepJo = async (k) => {
        const u = /^https:\/\//.test(k) ? k : "https://quicknews.hu" + k;
        try {
          const r = await fetch(u, { headers: { Range: "bytes=0-2047", "User-Agent": "Mozilla/5.0 (Macintosh) quicknews-pult" }, signal: AbortSignal.timeout(3000) });
          if (!r.ok) return false;
          if (/^image\//i.test(r.headers.get("content-type") || "")) return true;
          // a típusjelzés nem mindig pontos: a fájl elejéből ismerjük fel a képet
          const e = new Uint8Array((await r.arrayBuffer()).slice(0, 16));
          const s = String.fromCharCode(...e);
          return (e[0] === 0xff && e[1] === 0xd8) || s.startsWith("\x89PNG") || s.startsWith("GIF8") || (s.startsWith("RIFF") && s.slice(8, 12) === "WEBP") || /^ftyp(avif|heic|mif1)/.test(s.slice(4, 12));
        } catch { return false; }
      };
      const jok = new Set((await Promise.all(jeloltek.map(async (h) => ((await kepJo(h.kep)) ? h.id : null)))).filter(Boolean));
      for (const h of HIREK) {
        const t = Date.parse(h.publikalva || "");
        if (!t || t <= hatar || megvan.has(h.id) || kis.has(h.id) || !jok.has(h.id)) continue;
        adat.sorok.push({
          id: h.id, cim: h.cim, lead: h.lead, slug: (h.url || "").replace(/^\/hir\//, ""),
          fontossag: h.fontossag, felkapott: false, kategoria: h.kategoria, forras: h.forras,
          publikalva: h.publikalva, video: !!h.video, kep: /^https:\/\//.test(h.kep || "") ? h.kep : "https://quicknews.hu" + (h.kep || ""),
          pont: (h.fontossag || 3) * 20 + 15, uj: true, allapot: {},
        });
      }
      adat.sorok.sort((a, b) => String(b.publikalva || "").localeCompare(String(a.publikalva || "")));
      for (const s of adat.sorok || []) {
        const e = kit[s.id] || {};
        s.kerve = { facebook: !!e.facebook, linkedin: !!e.linkedin, hirdetes: !!e.hirdetes, csoport: !!e.csoport };
        s.kartya = e.kartya || null;
        s.sajat_kep = e.sajat_kep || null;
        s.jovahagyas = e.jovahagyas || {};
        s.hirlevel = e.hirlevel || null;
        s.kartya_hiba = e.kartya_hiba || null;
        s.kiteteli_hiba = e.kiteteli_hiba || null;
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
    if (mi === "hirlevel") return json(res, 200, await hirlevelAdat());
    if (mi === "boo") return json(res, 200, await booAdat());
    if (mi === "adsense") return json(res, 200, await adsenseAdat());
    if (mi === "adsense_kapcsol" && req.method === "POST") { const [k, v] = await adsenseKapcsol(await torzs(req)); return json(res, k, v); }
    if (mi === "boo_muvelet" && req.method === "POST") { const [k, v] = await booMuvelet(await torzs(req)); return json(res, k, v); }
    if (mi === "hirlevel_muvelet" && req.method === "POST") { const [k, v] = await hirlevelMuvelet(await torzs(req)); return json(res, k, v); }
    if (mi === "hirlevel_utolso") {
      const h = await kv("GET", HL + ":utolso");
      res.statusCode = h ? 200 : 404;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      // SEC-019: a tárolt HTML a saját originen jelenik meg, ezért szkript és űrlap nem futhat benne
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
      return res.end(h || "<p style='font-family:sans-serif'>Még nem ment ki hírlevél.</p>");
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
      if (["facebook", "linkedin", "hirdetes", "csoport"].includes(mezo)) {
        if (ertek) e[mezo] = { kerve: most }; else delete e[mezo];
      } else if (mezo === "jovahagyas") {
        // a pipa önmagában nem indít semmit: csak a jóváhagyott felületekhez készül időzített elem (Heni 2026-10-12)
        const feluletek = ["facebook", "linkedin", "hirdetes", "csoport"].filter((f) => e[f]);
        if (ertek) {
          if (!feluletek.length) return json(res, 400, { hiba: "Előbb pipáld be, hova menjen ki." });
          e.jovahagyas = { ido: most, feluletek };
        } else delete e.jovahagyas;
      } else if (mezo === "hirlevel") {
        // a bepipált hír a következő reggeli emlékeztetőbe mindenképp bekerül (Heni 2026-10-13), jóváhagyás nélkül
        if (e.hirlevel && e.hirlevel.kiment) return json(res, 400, { hiba: "Ez a hír már kiment az emlékeztetőben." });
        if (ertek) e.hirlevel = { kerve: most }; else delete e.hirlevel;
      } else if (mezo === "kartya_jo" || mezo === "kartya_rossz") {
        if (!e.kartya || !e.kartya.fajl) return json(res, 400, { hiba: "Ehhez a hírhez még nincs kártya." });
        if (mezo === "kartya_jo") { e.kartya.jo = ertek ? most : null; if (ertek) e.kartya.elutasitva = null; }
        else { e.kartya.elutasitva = ertek ? most : null; if (ertek) e.kartya.jo = null; }
      } else return json(res, 400, { hiba: "Ismeretlen mező." });
      if (!e.facebook && !e.linkedin && !e.hirdetes && !e.csoport && !e.kartya && !e.sajat_kep && !e.jovahagyas && !e.hirlevel) await kv("HDEL", P + "kitenni", id);
      else await kv("HSET", P + "kitenni", id, JSON.stringify(kitenniTiszta(e)));
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { hiba: "Ismeretlen kérés." });
  } catch (err) {
    // SEC-020: belső hibaszöveg nem megy ki, csak a Vercel-naplóba
    console.error("admin", mi, err && err.message);
    return json(res, 500, { hiba: "Szerverhiba, nézd meg a Vercel-naplót." });
  }
};

// SEC-018: a kitételi bejegyzésből csak a várt mezők tárolódnak
const KITENNI_MEZOK = ["facebook", "linkedin", "hirdetes", "csoport", "kartya", "sajat_kep", "jovahagyas", "hirlevel", "kartya_hiba", "kiteteli_hiba", "volt_elutasitva"];
function kitenniTiszta(e) {
  return Object.fromEntries(KITENNI_MEZOK.filter((k) => k in e).map((k) => [k, e[k]]));
}
