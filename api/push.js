// Az Android-app push-értesítései (docs: quicknews-android/docs/PRD.md 4.4, 5, 6).
// Firebase Cloud Messaging HTTP v1, témákra (topic) küldve, tehát eszköztokent nem tárolunk.
// Env: FCM_SZOLGALTATAS (a Firebase szolgáltatásfiók JSON-kulcsa egy sorban). Amíg nincs, a küldés 503-at ad.
// Végpontok (?mi=...):
// Az admin-műveletek a pult sütijével vagy a Mac X-Gep-Kulcs fejlécével mennek (build/qn_kv.py push()).
//   kuld        POST  admin: kézi értesítés most vagy időzítve
//   lista       GET   admin: előzmények, időzítettek, automatikus beállítás
//   visszavon   POST  admin: időzített értesítés törlése
//   beall       POST  admin: automatikus értesítések beállítása
//   auto_gep    POST  gép: automatikus értesítés egy hírről (napi keret, csendes órák, kétszer soha)
//   napi_gep    POST  gép: a reggeli összefoglaló a "napi" témára, naponta egyszer
//   esedekes_gep POST gép: a lejárt időzítettek kiküldése (a felhős kör hívja)
//   megnyitas   POST  nyilvános, névtelen: az app jelzi, hogy egy értesítést megnyitottak
const crypto = require("crypto");
const suti = require("./_suti.js");

const P = "qn:push:";
// rovat_X: a rovat fontos hírei (küszöb-1), rovat_X_mind: a rovat minden híre, feltorekvo: a felkapott hírek
// mindenki: minden telepített app (az app mindig feliratkozik rá); egyeb: nyereményjáték, újdonság, bejelentés (kikapcsolható)
const TEMAK = /^(mindenki|egyeb|kiemelt|napi|feltorekvo|rovat_(modell|eszkoz|video|kep|ugynok|uzlet|kutatas|egyeb)(_mind)?)$/;
const ALAP_BEALL = { aktiv: true, napiMax: 3, mindMax: 10, kuszob: 5, csendesTol: 22, csendesIg: 7 };

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
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function gep(req) {
  const k = req.headers["x-gep-kulcs"] || "";
  return k.length > 20 && !!process.env.GEP_KULCS && egyezik(k, process.env.GEP_KULCS);
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

// Budapesti óra és nap (a csendes órákhoz és a napi kerethez)
function budapest(d = new Date()) {
  const r = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(d).reduce((a, p) => ((a[p.type] = p.value), a), {});
  return { nap: `${r.year}-${r.month}-${r.day}`, ora: Number(r.hour) };
}
function csendesE(beall, ora) {
  return beall.csendesTol > beall.csendesIg ? ora >= beall.csendesTol || ora < beall.csendesIg : ora >= beall.csendesTol && ora < beall.csendesIg;
}

// Az értesítés szövegére ugyanaz vonatkozik, mint a posztokra: nincs gondolatjel
function tiszta(s, max) {
  return String(s || "").replace(/[–—‒―−]/g, "-").replace(/[​-‏⁠﻿­ ]/g, "").trim().slice(0, max);
}

// --- FCM HTTP v1 ---
let tokenCache = null;
async function fcmToken(fiok) {
  if (tokenCache && tokenCache.lejar > Date.now() + 60000) return tokenCache.token;
  const most = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const fej = b64({ alg: "RS256", typ: "JWT" });
  const test = b64({ iss: fiok.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: most, exp: most + 3600 });
  const alairas = crypto.createSign("RSA-SHA256").update(`${fej}.${test}`).sign(fiok.private_key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${fej}.${test}.${alairas}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("FCM token: " + (j.error || r.status));
  tokenCache = { token: j.access_token, lejar: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

async function fcmKuld(e) {
  const fiok = JSON.parse(process.env.FCM_SZOLGALTATAS);
  const token = await fcmToken(fiok);
  // data-üzenet: az app maga rajzolja ki, így a csendes órát és a csatornát ő kezeli
  const data = { pid: e.id, cim: e.cim, szoveg: e.szoveg, hir_id: e.hir_id || "", kep: e.kep || "", link: e.link || "", tema: e.tema };
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${fiok.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { topic: e.tema, data, android: { priority: "high", ttl: "86400s" } } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("FCM: " + ((j.error && j.error.message) || r.status));
  return j.name;
}

// Admin-értesítés (Heni 2026-10-21): a jóváhagyásra váró hírekről, kizárólag a belépett admin eszközeire (eszköztoken,
// nem téma, így más felhasználó nem iratkozhat fel rá). A tokeneket az app a pult sütijével jelenti be (api/admin.js
// mi=admin_eszkoz); kilépéskor a lista törlődik. Az érvénytelenné vált tokent itt kivesszük.
async function adminKuld(e) {
  const fiok = JSON.parse(process.env.FCM_SZOLGALTATAS);
  const token = await fcmToken(fiok);
  const tokenek = (await kv("SMEMBERS", "qn:push:admin_tokenek")) || [];
  let ok = 0;
  for (const t of tokenek) {
    const data = { pid: e.id, cim: e.cim, szoveg: e.szoveg, hir_id: "", kep: "", link: "", tema: "admin", db: String(e.db || 0) };
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${fiok.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { token: t, data, android: { priority: "high", ttl: "21600s" } } }),
    });
    if (r.ok) { ok++; continue; }
    const j = await r.json().catch(() => ({}));
    const kod = JSON.stringify(j.error || {});
    if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(kod)) await kv("SREM", "qn:push:admin_tokenek", t);
  }
  return { eszkoz: tokenek.length, ok };
}

async function beallitas() {
  return { ...ALAP_BEALL, ...JSON.parse((await kv("GET", P + "beall")) || "{}") };
}

// kétszer ugyanarról soha: a Kiemelt (és minden kézi) küldés a hír azonosítóján, az automatikus rovat-értesítés
// külön kulcson, hogy egy fontos hír a Kiemelt témára és a saját rovatára is kimehessen
function kimentKulcs(e) {
  if (e.forras !== "auto" || e.tema === "kiemelt") return e.hir_id;
  return (/^rovat_[a-z]+$/.test(e.tema) ? "r:" : e.tema + ":") + e.hir_id;
}

async function naplozKuld(e) {
  e.kuldve = new Date().toISOString();
  e.fcm = await fcmKuld(e);
  await kv("LPUSH", P + "elozmeny", JSON.stringify(e));
  await kv("LTRIM", P + "elozmeny", 0, 199);
  if (e.hir_id) await kv("SADD", P + "kiment", kimentKulcs(e));
  // a megnyitás-számláló csak ténylegesen kiküldött értesítést fogad el (SEC-040)
  await kv("SADD", P + "pidek", e.id);
  return e;
}

function ertesites(b, forras) {
  const tema = String(b.tema || "kiemelt");
  if (!TEMAK.test(tema)) return [null, "Ismeretlen téma."];
  const cim = tiszta(b.cim, 90), szoveg = tiszta(b.szoveg, 240);
  if (cim.length < 3) return [null, "Adj meg címet."];
  const hir_id = /^[a-f0-9]{12}$/.test(b.hir_id || "") ? b.hir_id : "";
  const kep = /^https:\/\/quicknews\.hu\//.test(b.kep || "") ? String(b.kep).slice(0, 400) : "";
  // koppintásra megnyíló cím (nyereményjáték, bejelentés); hírnél a hír nyílik, ez csak hír nélkül számít
  // csak saját domainre mutató, userinfo nélküli https link (SEC-042: ellopott belépéssel se menjen ki adathalász link)
  let link = "";
  try {
    const u = new URL(String(b.link || ""));
    if (u.protocol === "https:" && !u.username && !u.password && /(^|\.)(quicknews\.hu|adverr\.hu|adverr\.io)$/.test(u.hostname)) link = u.toString().slice(0, 400);
  } catch { /* nincs vagy rossz link */ }
  return [{ id: crypto.randomBytes(6).toString("hex"), cim, szoveg, hir_id, kep, link, tema, forras, kert: new Date().toISOString() }, null];
}

module.exports = async (req, res) => {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return json(res, 503, { hiba: "nincs beállítva" });
  const mi = String((req.query && req.query.mi) || "");
  const vanFcm = !!process.env.FCM_SZOLGALTATAS;
  try {
    // a pultból feltöltött értesítéskép nyilvánosan (az app ezt tölti le a kibontott értesítéshez)
    if (mi === "kep" && req.method === "GET") {
      const id = String((req.query && req.query.id) || "");
      if (!/^[a-f0-9]{16}$/.test(id)) return json(res, 400, { hiba: "Rossz kérés." });
      const b64 = await kv("GET", P + "kep:" + id);
      if (!b64) return json(res, 404, { hiba: "Nincs ilyen kép." });
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      return res.end(Buffer.from(b64, "base64"));
    }
    if (mi === "megnyitas" && req.method === "POST") {
      // SEC-040: csak JSON, csak kiküldött értesítés azonosítója, IP-nként óránként legfeljebb 60 jelzés
      if (!String(req.headers["content-type"] || "").includes("application/json")) return json(res, 415, { hiba: "JSON kell." });
      const b = await torzs(req);
      if (!/^[a-f0-9]{12}$/.test(b.pid || "")) return json(res, 400, { hiba: "Rossz kérés." });
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
      const ora = Math.floor(Date.now() / 3600000);
      const ipKulcs = P + "nyit_ip:" + crypto.createHash("sha256").update(`${process.env.CHAT_SO || ""}|${ora}|${ip}`).digest("hex").slice(0, 24);
      const db = await kv("INCR", ipKulcs);
      if (db === 1) await kv("EXPIRE", ipKulcs, 3700);
      if (db > 60) return json(res, 429, { hiba: "Túl sok kérés." });
      if (!(await kv("SISMEMBER", P + "pidek", b.pid))) return json(res, 200, { ok: false });
      await kv("HINCRBY", P + "megnyitas", b.pid, 1);
      return json(res, 200, { ok: true });
    }

    if (mi === "admin_gep") {
      // a Mac jelzi az új, jóváhagyásra váró híreket; egy köteg = egy értesítés (a kétszer-küldést a kulcs zárja ki)
      if (!gep(req) || req.method !== "POST") return json(res, 403, { hiba: "Nincs jogosultság." });
      if (!vanFcm) return json(res, 503, { hiba: "Az FCM még nincs bekötve." });
      const b = await torzs(req);
      const kulcs = String(b.kulcs || "");
      if (!/^[a-f0-9]{12,64}$/.test(kulcs)) return json(res, 400, { hiba: "Rossz kulcs." });
      if ((await kv("SET", P + "admin_kuldve:" + kulcs, "1", "NX", "EX", 7 * 86400)) !== "OK") return json(res, 200, { ok: false, ok_miert: "már kiment" });
      const e = { id: crypto.randomBytes(6).toString("hex"), cim: tiszta(b.cim, 90) || "Új hírek jóváhagyásra várnak",
                  szoveg: tiszta(b.szoveg, 240), db: Math.max(0, Math.min(999, Number(b.db) || 0)) };
      try { return json(res, 200, { ok: true, ...(await adminKuld(e)) }); }
      catch (err) { await kv("DEL", P + "admin_kuldve:" + kulcs); throw err; }
    }
    if (mi === "auto_gep" || mi === "esedekes_gep" || mi === "napi_gep") {
      if (!gep(req) || req.method !== "POST") return json(res, 403, { hiba: "Nincs jogosultság." });
      if (!vanFcm) return json(res, 503, { hiba: "Az FCM még nincs bekötve." });
      const beall = await beallitas();
      const { nap, ora } = budapest();
      if (mi === "esedekes_gep") {
        const lejart = (await kv("ZRANGEBYSCORE", P + "idozitett", 0, Date.now())) || [];
        const ki = [];
        for (const s of lejart) {
          // csak az küldi ki, amelyik ténylegesen kivette (két párhuzamos hívás ne küldje kétszer); hibánál visszakerül
          if ((await kv("ZREM", P + "idozitett", s)) !== 1) continue;
          try { ki.push(await naplozKuld(JSON.parse(s))); }
          catch (e) { await kv("ZADD", P + "idozitett", Date.now() + 300000, s); throw e; }
        }
        return json(res, 200, { ok: true, kiment: ki.length });
      }
      const b = await torzs(req);
      if (!beall.aktiv) return json(res, 200, { ok: false, ok_miert: "ki van kapcsolva" });
      if (mi === "napi_gep") {
        const [e, hiba] = ertesites({ ...b, tema: "napi", hir_id: "" }, "napi");
        if (!e) return json(res, 400, { hiba });
        if ((await kv("SET", P + "napi:" + nap, "1", "NX", "EX", 3 * 86400)) !== "OK") return json(res, 200, { ok: false, ok_miert: "ma már kiment" });
        return json(res, 200, { ok: true, kuldve: await naplozKuld(e) });
      }
      // Kiemelt: a küszöbtől (alapból 5); rovat: eggyel kisebbtől (alapból 4); rovat „minden hír”: küszöb nélkül;
      // Feltörekvő: csak felkapott hír
      const tema = String(b.tema || "");
      const mindE = tema.endsWith("_mind");
      if (tema === "feltorekvo" && !b.felkapott) return json(res, 200, { ok: false, ok_miert: "nem felkapott" });
      const kuszob = mindE || tema === "feltorekvo" ? 1 : tema.startsWith("rovat_") ? Math.max(1, beall.kuszob - 1) : beall.kuszob;
      if (Number(b.fontossag || 0) < kuszob && !b.fohir) return json(res, 200, { ok: false, ok_miert: "küszöb alatt" });
      const [e, hiba] = ertesites(b, "auto");
      if (!e) return json(res, 400, { hiba });
      // a SADD visszatérési értéke a zár: 0 = már kiment (vagy épp most viszi ki egy párhuzamos hívás)
      if (e.hir_id && (await kv("SADD", P + "kiment", kimentKulcs(e))) === 0) return json(res, 200, { ok: false, ok_miert: "már kiment" });
      // napi keret témánként: Kiemelt, rovat és Feltörekvő napiMax, a rovat „minden hír” mindMax; előbb INCR, utána összevetés
      const szamlalo = P + "auto:" + e.tema + ":" + nap;
      const db = Number(await kv("INCR", szamlalo));
      if (db === 1) await kv("EXPIRE", szamlalo, 3 * 86400);
      if (db > (mindE ? beall.mindMax : beall.napiMax)) {
        if (e.hir_id) await kv("SREM", P + "kiment", kimentKulcs(e));
        return json(res, 200, { ok: false, ok_miert: "napi keret elfogyott" });
      }
      if (csendesE(beall, ora)) {
        // csendes órában reggel 7-re időzítjük (PRD 5)
        const reggel = new Date(); reggel.setUTCMinutes(0, 0, 0);
        do reggel.setTime(reggel.getTime() + 3600000); while (budapest(reggel).ora !== beall.csendesIg);
        await kv("ZADD", P + "idozitett", reggel.getTime(), JSON.stringify(e));
        if (e.hir_id) await kv("SADD", P + "kiment", kimentKulcs(e));
        return json(res, 200, { ok: true, idozitve: reggel.toISOString() });
      }
      return json(res, 200, { ok: true, kuldve: await naplozKuld(e) });
    }

    // az admin pult a böngészőből (süti) vagy a Mac helyi pultjáról (gépkulcs) hívja
    if (!gep(req) && !(await suti.belepve(req, kv))) return json(res, 401, { hiba: "Lépj be." });

    if (mi === "lista") {
      const elozmeny = ((await kv("LRANGE", P + "elozmeny", 0, 99)) || []).map((x) => JSON.parse(x));
      // csak a megjelenített (legfeljebb 100) értesítés számlálója, nem a teljes hash (SEC-040)
      const nyitas = elozmeny.length ? (await kv("HMGET", P + "megnyitas", ...elozmeny.map((e) => e.id))) || [] : [];
      elozmeny.forEach((e, i) => (e.megnyitas = Number(nyitas[i] || 0)));
      const idozitett = ((await kv("ZRANGE", P + "idozitett", 0, -1, "WITHSCORES")) || []).reduce((a, x, i, t) => {
        if (i % 2 === 0) a.push({ ...JSON.parse(x), mikor: new Date(Number(t[i + 1])).toISOString() });
        return a;
      }, []);
      return json(res, 200, { fcm: vanFcm, beall: await beallitas(), elozmeny, idozitett });
    }
    if (req.method !== "POST") return json(res, 405, { hiba: "POST kell." });
    const b = await torzs(req);
    if (mi === "beall") {
      const uj = {
        aktiv: !!b.aktiv,
        napiMax: Math.max(0, Math.min(10, parseInt(b.napiMax, 10) || 0)),
        mindMax: Math.max(0, Math.min(30, parseInt(b.mindMax, 10) || 0)),
        kuszob: Math.max(1, Math.min(5, parseInt(b.kuszob, 10) || 5)),
        csendesTol: Math.max(0, Math.min(23, parseInt(b.csendesTol, 10) || 22)),
        csendesIg: Math.max(0, Math.min(23, parseInt(b.csendesIg, 10) || 7)),
      };
      await kv("SET", P + "beall", JSON.stringify(uj));
      return json(res, 200, { ok: true, beall: uj });
    }
    if (mi === "visszavon") {
      const lista = (await kv("ZRANGE", P + "idozitett", 0, -1)) || [];
      const t = lista.find((x) => JSON.parse(x).id === b.id);
      if (!t) return json(res, 404, { hiba: "Nincs ilyen időzített értesítés." });
      await kv("ZREM", P + "idozitett", t);
      return json(res, 200, { ok: true });
    }
    // az app naplója (quicknews-android Naplo.kt): csak az admin telefonjáról jön, a pult sütijével; az utolsó 5000 sor
    if (mi === "naplo" && req.method === "POST") {
      const eszkoz = String(b.eszkoz || "").slice(0, 80);
      const sorok = (Array.isArray(b.sorok) ? b.sorok : []).slice(0, 200).map((x) => String(x).slice(0, 6000));
      const be = [];
      for (const s of sorok) {
        let o; try { o = JSON.parse(s); } catch { continue; }
        if (!o || typeof o !== "object" || Array.isArray(o)) continue;
        o.eszkoz = eszkoz;
        be.push(JSON.stringify(o));
      }
      if (be.length) await kv("LPUSH", P + "naplo", ...be);
      await kv("LTRIM", P + "naplo", 0, 4999);
      await kv("EXPIRE", P + "naplo", 30 * 86400);
      return json(res, 200, { ok: true, db: sorok.length });
    }
    if (mi === "naplo_olvas") {
      const n = Math.max(1, Math.min(2000, parseInt((req.query && req.query.n) || b.n || "300", 10) || 300));
      const l = ((await kv("LRANGE", P + "naplo", 0, n - 1)) || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
      return json(res, 200, { ok: true, sorok: l });
    }
    if (mi === "kep_feltolt" && req.method === "POST") {
      // a pult a böngészőben már átméretezte (legfeljebb 1200 px széles JPEG); 60 napig marad meg
      const adat = String(b.adat || "").replace(/^data:image\/jpeg;base64,/, "");
      if (!/^[A-Za-z0-9+/=]+$/.test(adat) || adat.length < 100) return json(res, 400, { hiba: "Rossz kép." });
      if (adat.length > 900000) return json(res, 413, { hiba: "Túl nagy kép (legfeljebb kb. 650 kB)." });
      const nyers = Buffer.from(adat, "base64");
      if (nyers[0] !== 0xff || nyers[1] !== 0xd8 || nyers[nyers.length - 2] !== 0xff || nyers[nyers.length - 1] !== 0xd9)
        return json(res, 400, { hiba: "Csak JPEG kép tölthető fel." });
      const id = crypto.randomBytes(8).toString("hex");
      await kv("SET", P + "kep:" + id, adat, "EX", 60 * 86400);
      return json(res, 200, { ok: true, url: "https://quicknews.hu/api/push?mi=kep&id=" + id });
    }
    if (mi === "kuld") {
      const [e, hiba] = ertesites(b, "kezi");
      if (!e) return json(res, 400, { hiba });
      if (b.mikor) {
        const t = Date.parse(b.mikor);
        if (!(t > Date.now() + 60000)) return json(res, 400, { hiba: "Az időpont legyen a jövőben." });
        await kv("ZADD", P + "idozitett", t, JSON.stringify(e));
        return json(res, 200, { ok: true, idozitve: new Date(t).toISOString() });
      }
      if (!vanFcm) return json(res, 503, { hiba: "Az FCM még nincs bekötve." });
      return json(res, 200, { ok: true, kuldve: await naplozKuld(e) });
    }
    return json(res, 404, { hiba: "Ismeretlen művelet." });
  } catch (e) {
    console.error("push hiba:", e);
    return json(res, 500, { hiba: "Szerverhiba, próbáld újra." });
  }
};
