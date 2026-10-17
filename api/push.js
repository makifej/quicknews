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
//   esedekes_gep POST gép: a lejárt időzítettek kiküldése (a felhős kör hívja)
//   megnyitas   POST  nyilvános, névtelen: az app jelzi, hogy egy értesítést megnyitottak
const crypto = require("crypto");
const suti = require("./_suti.js");

const P = "qn:push:";
const TEMAK = /^(kiemelt|napi|rovat_(modell|eszkoz|video|kep|ugynok|uzlet|kutatas|egyeb))$/;
const ALAP_BEALL = { aktiv: true, napiMax: 3, kuszob: 5, csendesTol: 22, csendesIg: 7 };

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
  const data = { pid: e.id, cim: e.cim, szoveg: e.szoveg, hir_id: e.hir_id || "", kep: e.kep || "", tema: e.tema };
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${fiok.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { topic: e.tema, data, android: { priority: "high", ttl: "86400s" } } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("FCM: " + ((j.error && j.error.message) || r.status));
  return j.name;
}

async function beallitas() {
  return { ...ALAP_BEALL, ...JSON.parse((await kv("GET", P + "beall")) || "{}") };
}

async function naplozKuld(e) {
  e.kuldve = new Date().toISOString();
  e.fcm = await fcmKuld(e);
  await kv("LPUSH", P + "elozmeny", JSON.stringify(e));
  await kv("LTRIM", P + "elozmeny", 0, 199);
  if (e.hir_id) await kv("SADD", P + "kiment", e.hir_id);
  return e;
}

function ertesites(b, forras) {
  const tema = String(b.tema || "kiemelt");
  if (!TEMAK.test(tema)) return [null, "Ismeretlen téma."];
  const cim = tiszta(b.cim, 90), szoveg = tiszta(b.szoveg, 240);
  if (cim.length < 3) return [null, "Adj meg címet."];
  const hir_id = /^[a-f0-9]{12}$/.test(b.hir_id || "") ? b.hir_id : "";
  const kep = /^https:\/\/quicknews\.hu\//.test(b.kep || "") ? String(b.kep).slice(0, 400) : "";
  return [{ id: crypto.randomBytes(6).toString("hex"), cim, szoveg, hir_id, kep, tema, forras, kert: new Date().toISOString() }, null];
}

module.exports = async (req, res) => {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return json(res, 503, { hiba: "nincs beállítva" });
  const mi = String((req.query && req.query.mi) || "");
  const vanFcm = !!process.env.FCM_SZOLGALTATAS;
  try {
    if (mi === "megnyitas" && req.method === "POST") {
      const b = await torzs(req);
      if (!/^[a-f0-9]{12}$/.test(b.pid || "")) return json(res, 400, { hiba: "Rossz kérés." });
      await kv("HINCRBY", P + "megnyitas", b.pid, 1);
      return json(res, 200, { ok: true });
    }

    if (mi === "auto_gep" || mi === "esedekes_gep") {
      if (!gep(req) || req.method !== "POST") return json(res, 403, { hiba: "Nincs jogosultság." });
      if (!vanFcm) return json(res, 503, { hiba: "Az FCM még nincs bekötve." });
      const beall = await beallitas();
      const { nap, ora } = budapest();
      if (mi === "esedekes_gep") {
        const lejart = (await kv("ZRANGEBYSCORE", P + "idozitett", 0, Date.now())) || [];
        const ki = [];
        for (const s of lejart) {
          await kv("ZREM", P + "idozitett", s);
          ki.push(await naplozKuld(JSON.parse(s)));
        }
        return json(res, 200, { ok: true, kiment: ki.length });
      }
      const b = await torzs(req);
      if (!beall.aktiv) return json(res, 200, { ok: false, ok_miert: "ki van kapcsolva" });
      if (Number(b.fontossag || 0) < beall.kuszob && !b.fohir) return json(res, 200, { ok: false, ok_miert: "küszöb alatt" });
      if (b.hir_id && (await kv("SISMEMBER", P + "kiment", b.hir_id))) return json(res, 200, { ok: false, ok_miert: "már kiment" });
      const db = Number((await kv("GET", P + "auto:" + nap)) || 0);
      if (db >= beall.napiMax) return json(res, 200, { ok: false, ok_miert: "napi keret elfogyott" });
      const [e, hiba] = ertesites(b, "auto");
      if (!e) return json(res, 400, { hiba });
      await kv("INCR", P + "auto:" + nap);
      await kv("EXPIRE", P + "auto:" + nap, 3 * 86400);
      if (csendesE(beall, ora)) {
        // csendes órában reggel 7-re időzítjük (PRD 5)
        const reggel = new Date(); reggel.setUTCMinutes(0, 0, 0);
        do reggel.setTime(reggel.getTime() + 3600000); while (budapest(reggel).ora !== beall.csendesIg);
        await kv("ZADD", P + "idozitett", reggel.getTime(), JSON.stringify(e));
        if (e.hir_id) await kv("SADD", P + "kiment", e.hir_id);
        return json(res, 200, { ok: true, idozitve: reggel.toISOString() });
      }
      return json(res, 200, { ok: true, kuldve: await naplozKuld(e) });
    }

    // az admin pult a böngészőből (süti) vagy a Mac helyi pultjáról (gépkulcs) hívja
    if (!gep(req) && !(await suti.belepve(req, kv))) return json(res, 401, { hiba: "Lépj be." });

    if (mi === "lista") {
      const elozmeny = ((await kv("LRANGE", P + "elozmeny", 0, 99)) || []).map((x) => JSON.parse(x));
      const nyitas = (await kv("HGETALL", P + "megnyitas")) || [];
      const ny = {};
      for (let i = 0; i < nyitas.length; i += 2) ny[nyitas[i]] = Number(nyitas[i + 1]);
      elozmeny.forEach((e) => (e.megnyitas = ny[e.id] || 0));
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
    return json(res, 500, { hiba: String(e.message || e).slice(0, 200) });
  }
};
