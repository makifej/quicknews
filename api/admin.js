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

// Budapest szerinti nap, d nappal ezelőtt (0 = ma)
function pestiNap(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(new Date(Date.now() - d * 86400000));
}

// Redis HGETALL -> { mező: szám } (számlálókhoz)
async function hashSzam(k) {
  const l = (await kv("HGETALL", k)) || [];
  const o = {};
  for (let i = 0; i < l.length; i += 2) o[l[i]] = Number(l[i + 1]);
  return o;
}

// Redis HGETALL -> { mező: szöveg } (verziókhoz)
async function hashSzoveg(k) {
  const l = (await kv("HGETALL", k)) || [];
  const o = {};
  for (let i = 0; i < l.length; i += 2) o[l[i]] = String(l[i + 1]);
  return o;
}

// Egyedi darabszám több halmaz uniójából. A teljes lista nem jön vissza: a Redisben SUNIONSTORE, majd SCARD.
async function egyediSzam(kulcsok) {
  const tmp = "qn:tmp:uniq:" + Math.random().toString(36).slice(2);
  await kv("SUNIONSTORE", tmp, ...kulcsok);
  await kv("EXPIRE", tmp, 60);
  const n = Number((await kv("SCARD", tmp)) || 0);
  await kv("DEL", tmp);
  return n;
}

// Az app-mérés kezdete (api/apk.js mi=aktiv): az 1.3.61-es verzió, 2026. november 23. A régebbi telefonok nem jeleznek.
const APP_MERES_KEZDETE = "2026-11-23";

// APK letöltések (api/apk.js számolja): összesen és naponta (Heni 2026-11-14)
async function apkAdat() {
  const osszesen = Number((await kv("GET", "qn:apk_letoltes")) || 0);
  const k = (await kv("HGETALL", "qn:apk_letoltes_nap")) || [];
  const napok = {};
  for (let i = 0; i < k.length; i += 2) napok[k[i]] = Number(k[i + 1]);
  const napokNyers = { ...napok };
  // Heni 2026-11-23: a frissítés nem új letöltés. A javítás előtt a frissítés-értesítésekből jött letöltések is ide
  // számolódtak; a frissítés-pusht kapott napok (nov. 17., 20., 23.) addigi számai nem választhatók szét, ezért
  // ezek nem számítanak új letöltésnek (vegyes). Azóta a frissítést az api/apk.js külön számolja.
  const VEGYES = { "2026-11-17": 7, "2026-11-20": 6, "2026-11-23": 13 };
  let vegyes = 0;
  for (const [n, db] of Object.entries(VEGYES)) { const le = Math.min(db, napok[n] || 0); napok[n] = (napok[n] || 0) - le; vegyes += le; }
  const fk = (await kv("HGETALL", "qn:apk_frissites_nap")) || [];
  const frissites_napok = {};
  for (let i = 0; i < fk.length; i += 2) frissites_napok[fk[i]] = Number(fk[i + 1]);
  const frissites = Number((await kv("GET", "qn:apk_frissites")) || 0);
  const mind_napok = { ...napokNyers };
  for (const [n, db] of Object.entries(frissites_napok)) mind_napok[n] = (mind_napok[n] || 0) + db;
  // forrás szerint (az 1.3.61-es oldal óta, 2026. november 23-tól): weboldal (web) és cikk-banner (banner)
  const forrasWeb = Number((await kv("GET", "qn:apk_forras:web")) || 0);
  const forrasBanner = Number((await kv("GET", "qn:apk_forras:banner")) || 0);
  const forrasNapok = await Promise.all(Array.from({ length: 14 }, (_, i) => hashSzam("qn:apk_forras_nap:" + pestiNap(i))));
  const forras_napok = {};
  forrasNapok.forEach((o, i) => { forras_napok[pestiNap(i)] = { web: o.web || 0, banner: o.banner || 0 }; });
  return { osszesen: osszesen - vegyes, napok, frissites, frissites_napok, vegyes, mind: osszesen + frissites, mind_napok,
    forras: { kezdet: APP_MERES_KEZDETE, web: forrasWeb, banner: forrasBanner, frissites, napok: forras_napok },
    aktiv: await aktivAdat(), push: await pushAdat() };
}

// App-felhasználók (api/apk.js mi=aktiv): napi, 7 és 30 napos aktív, telepítés és frissítés külön, verziók,
// elhagyók, visszatérés. Minden szám a 2026. november 23-i méréstől számít.
async function aktivAdat() {
  const napKulcsok = (n) => Array.from({ length: n }, (_, i) => `qn:app_aktiv:${pestiNap(i)}`);
  // napi aktív: az utolsó 30 nap
  const napiSzamok = await Promise.all(napKulcsok(30).map((k) => kv("SCARD", k)));
  const napok = {};
  napiSzamok.forEach((n, i) => { napok[pestiNap(i)] = Number(n || 0); });
  const het = await egyediSzam(napKulcsok(7));
  const ho = await egyediSzam(napKulcsok(30));
  const osszes = Number((await kv("SCARD", "qn:app_eszkozok")) || 0);
  // telepítések és frissítések
  const telepites_napok = await hashSzam("qn:app_telepites_nap");
  const frissites_napok = await hashSzam("qn:app_frissites_nap");
  const osszeg = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const frissites_nv = {};
  const nvNapok = await Promise.all(Array.from({ length: 30 }, (_, i) => hashSzam("qn:app_frissites_nv:" + pestiNap(i))));
  nvNapok.forEach((o, i) => { if (Object.keys(o).length) frissites_nv[pestiNap(i)] = o; });
  const frissito = Number((await kv("SCARD", "qn:app_frissito")) || 0);
  // verzióeloszlás: az utolsó 7 nap aktív készülékei, mindegyik a legutóbbi ismert verziójával
  const verzioNapok = await Promise.all(Array.from({ length: 7 }, (_, i) => hashSzoveg("qn:app_verzio:" + pestiNap(6 - i))));
  const legutobbi = {};
  verzioNapok.forEach((o) => Object.assign(legutobbi, o)); // régebbi napok előbb, az újabb felülírja
  const verziok = {};
  Object.values(legutobbi).forEach((v) => { verziok[v] = (verziok[v] || 0) + 1; });
  const frissites_verzio = await hashSzam("qn:app_frissites_verzio");
  // visszatérés: a telepítés napja szerinti kohorszok, és hány készülék jelzett a telepítés után 1, 7, 30 nappal
  const kohorszok = await Promise.all(Array.from({ length: 30 }, (_, i) => i).map(async (i) => {
    const d = pestiNap(i);
    const [meret, v1, v7, v30] = await Promise.all([
      kv("SCARD", "qn:app_cohort:" + d), kv("SCARD", `qn:app_vissza:1:${d}`), kv("SCARD", `qn:app_vissza:7:${d}`), kv("SCARD", `qn:app_vissza:30:${d}`),
    ]);
    return { nap: d, telepites: Number(meret || 0), vissza1: Number(v1 || 0), vissza7: Number(v7 || 0), vissza30: Number(v30 || 0) };
  }));
  // csak azok a kohorszok számítanak, ahol a k napos nap már eltelt (i >= k)
  const visszaArany = (k) => {
    let m = 0, v = 0;
    kohorszok.forEach((c, i) => { if (i >= k) { m += c.telepites; v += c[`vissza${k}`]; } });
    return { telepites: m, vissza: v, arany: m ? Math.round((v / m) * 1000) / 10 : null };
  };
  const teszt = JSON.parse((await kv("GET", "qn:app_teszt_utolso")) || "null");
  return {
    kezdet: APP_MERES_KEZDETE, verzio_kezdet: "1.3.61",
    ma: napok[pestiNap(0)] || 0, het, ho, osszes, napok,
    elhagyo7: Math.max(0, osszes - het), elhagyo30: Math.max(0, osszes - ho),
    telepites: osszeg(telepites_napok), telepites_ma: telepites_napok[pestiNap(0)] || 0, telepites_napok,
    frissites: osszeg(frissites_napok), frissites_ma: frissites_napok[pestiNap(0)] || 0, frissites_napok,
    frissito, frissites_verzio, frissites_nv,
    verziok, verzio_aktiv_7: Object.keys(legutobbi).length,
    kohorszok, visszater: { 1: visszaArany(1), 7: visszaArany(7), 30: visszaArany(30) },
    regi_telepites: Number((await kv("GET", "qn:app_regi_telepites")) || 0),
    teszt_utolso: teszt,
  };
}

// Push-értesítések az utolsó 30 napban, értesítésenként: FCM elfogadta (topik-küldés), megnyitás, egyedi készülék
async function pushAdat() {
  const sorok = ((await kv("LRANGE", "qn:push:elozmeny", 0, 199)) || []).map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
  const kezdet = Date.now() - 30 * 86400000;
  const utolso = sorok.filter((e) => e.kuldve && Date.parse(e.kuldve) >= kezdet);
  const megnyitas = utolso.length ? ((await kv("HMGET", "qn:push:megnyitas", ...utolso.map((e) => e.id))) || []) : [];
  const reszletek = await Promise.all(utolso.map(async (e, i) => ({
    cim: e.cim || "", tema: e.tema || "", kuldve: e.kuldve,
    fcm_elfogadta: !!e.fcm,
    megnyitas: Number(megnyitas[i] || 0),
    egyedi_keszulek: Number((await kv("SCARD", "qn:push:nyito_eszk:" + e.id)) || 0),
  })));
  return {
    idoszak: "az utolsó 30 nap", kuldott: reszletek.length, fcm_elfogadta: reszletek.filter((r) => r.fcm_elfogadta).length,
    megnyitas: reszletek.reduce((a, r) => a + r.megnyitas, 0), egyedi_keszulek: reszletek.reduce((a, r) => a + r.egyedi_keszulek, 0),
    reszletek: reszletek.slice(0, 12),
  };
}

// hirdetés-banner kattintások (api/hirdetes.js számolja): összesen, helyenként, naponta (Heni 2026-11-17)
// Heni 2026-11-23: az Adverr applikációfejlesztés hirdetés (cikkoldalak, web és app) kattintásai is: ?h=adverr-app
const HIRD_NEV = { "boo-nyertes-tudatos-ember": ["Tudatos ember az AI korában (BOO-nyertes)", "2026-12-16"],
                   "adverr-app": ["Adverr applikációfejlesztés (cikkoldalak)", ""] };
async function hirdetesAdat(kert) {
  const h = HIRD_NEV[kert] ? kert : "boo-nyertes-tudatos-ember";
  const osszesen = Number((await kv("GET", `qn:hird:${h}`)) || 0);
  const par = async (k) => { const l = (await kv("HGETALL", k)) || []; const o = {}; for (let i = 0; i < l.length; i += 2) o[l[i]] = Number(l[i + 1]); return o; };
  return { hirdetes: h, nev: HIRD_NEV[h][0], ig: HIRD_NEV[h][1], osszesen, helyek: await par(`qn:hird:${h}:hely`), napok: await par(`qn:hird:${h}:nap`) };
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

// ---- Videós útmutató-kérések (Heni 2026-11-02): ki melyik videóhoz kérte a gyakorlati útmutatót (api/utmutato.js) ----
const UTM = "qn:utmutato";
const UTM_ANYAGOK = require("./_utmutatok.json");

// ---- Előfizetők és útmutató-vásárlások (Heni 2026-11-22), csak olvasás
const ELO_TERV = { havi: "Havi (1 490 Ft)", eves: "Éves (6 990 Ft)" };
async function hgetall(kulcs) {
  const k = (await kv("HGETALL", kulcs)) || [];
  const ki = [];
  for (let i = 0; i < k.length; i += 2) { try { ki.push([k[i], JSON.parse(k[i + 1])]); } catch (e) { /* hibás sor kimarad */ } }
  return ki;
}
// Látogatottság az Umamiból (Napi feladatok / Heni 2026-11-27). Csak szerveroldalon: a jelszó és a token nem megy ki a
// böngészőbe. Env: UMAMI_API_URL, UMAMI_USERNAME, UMAMI_PASSWORD, UMAMI_WEBSITE_ID (csak olvasó felhasználó).
let UMAMI_TOKEN = null, UMAMI_TOKEN_IDO = 0;
async function umamiToken(uj) {
  if (!uj && UMAMI_TOKEN && Date.now() - UMAMI_TOKEN_IDO < 3600000) return UMAMI_TOKEN;
  const r = await fetch(process.env.UMAMI_API_URL.replace(/\/$/, "") + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: process.env.UMAMI_USERNAME, password: process.env.UMAMI_PASSWORD }),
  });
  if (!r.ok) throw new Error("Umami belépés sikertelen (" + r.status + ")");
  UMAMI_TOKEN = (await r.json()).token; UMAMI_TOKEN_IDO = Date.now();
  return UMAMI_TOKEN;
}
async function umami(ut, param) {
  const u = new URL(process.env.UMAMI_API_URL.replace(/\/$/, "") + `/api/websites/${process.env.UMAMI_WEBSITE_ID}` + ut);
  for (const [k, v] of Object.entries(param || {})) u.searchParams.set(k, String(v));
  for (let i = 0; i < 2; i++) {
    const r = await fetch(u, { headers: { Authorization: "Bearer " + await umamiToken(i > 0), Accept: "application/json" } });
    if (r.status === 401 && i === 0) continue;
    if (!r.ok) throw new Error("Umami " + ut + ": " + r.status);
    return r.json();
  }
}
function umamiSzam(x) { return Number(x && typeof x === "object" ? x.value : x) || 0; }
function umamiKpi(s) {
  const latogatas = umamiSzam(s.visits);
  return {
    latogatok: umamiSzam(s.visitors), megtekintesek: umamiSzam(s.pageviews), latogatasok: latogatas,
    visszafordulas: latogatas ? Math.min(1, umamiSzam(s.bounces) / latogatas) : null,
    atlag_ido: latogatas ? Math.round(umamiSzam(s.totaltime) / latogatas) : null,
  };
}
async function latogatokAdat(idoszak) {
  if (!process.env.UMAMI_API_URL || !process.env.UMAMI_WEBSITE_ID) return { hiba: "Az Umami nincs beállítva." };
  const hossz = { "24h": 86400000, "7d": 7 * 86400000, "30d": 30 * 86400000 }[idoszak] ? idoszak : "7d";
  const ms = { "24h": 86400000, "7d": 7 * 86400000, "30d": 30 * 86400000 }[hossz];
  const veg = Date.now(), kezd = veg - ms;
  const ab = { startAt: kezd, endAt: veg };
  const egyseg = hossz === "24h" ? "hour" : "day";
  const metr = (type) => umami("/metrics", { ...ab, type, limit: 10 }).catch(() => []);
  const [most, elozo, sor, oldalak, forrasok, orszagok, eszkozok, bongeszok, aktiv] = await Promise.all([
    umami("/stats", ab), umami("/stats", { startAt: kezd - ms, endAt: kezd }),
    umami("/pageviews", { ...ab, unit: egyseg, timezone: "Europe/Budapest" }),
    metr("path").then(x => (x && x.length) ? x : metr("url")), metr("referrer"), metr("country"), metr("device"), metr("browser"),
    umami("/active").catch(() => null),
  ]);
  const ido = (t) => String(t).replace(" ", "T");
  const pont = {};
  for (const p of sor.pageviews || []) (pont[ido(p.x)] = pont[ido(p.x)] || { t: ido(p.x), megtekintes: 0, latogato: 0 }).megtekintes = p.y;
  for (const p of sor.sessions || []) (pont[ido(p.x)] = pont[ido(p.x)] || { t: ido(p.x), megtekintes: 0, latogato: 0 }).latogato = p.y;
  const lista = (x) => (Array.isArray(x) ? x : []).map(e => ({ nev: e.x == null ? "" : String(e.x), db: Number(e.y) || 0 }));
  return {
    idoszak: hossz, egyseg, kezd, veg, aktiv: aktiv == null ? null : umamiSzam(aktiv.visitors ?? aktiv.x ?? aktiv),
    kpi: umamiKpi(most), elozo: umamiKpi(elozo),
    sor: Object.values(pont).sort((a, b) => a.t < b.t ? -1 : 1),
    oldalak: lista(oldalak), forrasok: lista(forrasok), orszagok: lista(orszagok), eszkozok: lista(eszkozok), bongeszok: lista(bongeszok),
  };
}

async function elofizetokAdat() {
  // qn:elofizetesek: Stripe-számlánként egy sor (első fizetés és megújítások); előfizetésenként összevonjuk
  const szamlak = await hgetall("qn:elofizetesek");
  const subok = {};
  for (const [, s] of szamlak) {
    if (!s.sub) continue;
    const e = (subok[s.sub] = subok[s.sub] || { sub: s.sub, email: s.email, terv: s.terv, kezdet: s.ido, fizetve: 0, szamlak: [] });
    if (s.ido && s.ido < e.kezdet) e.kezdet = s.ido;
    e.fizetve += Number(s.osszeg || 0);
    e.szamlak.push({ ido: s.ido, osszeg: s.osszeg, szamla: s.szamla || "", szamla_hiba: s.szamla_hiba ? "nem készült (Billingo)" : "" });
  }
  const most = Math.floor(Date.now() / 1000);
  const sorok = [];
  for (const e of Object.values(subok)) {
    const r = await kv("GET", "qn:elo:" + e.sub);
    const a = r ? JSON.parse(r) : {};
    const aktiv = ["active", "trialing", "past_due"].includes(a.allapot || "active") && (a.eddig || 0) + 3 * 86400 > most;
    sorok.push({ email: a.email || e.email, nev: a.nev || "", terv: a.terv || e.terv, terv_nev: ELO_TERV[a.terv || e.terv] || (a.terv || e.terv || ""),
                 kezdet: e.kezdet, eddig: a.eddig ? new Date(a.eddig * 1000).toISOString() : null, allapot: a.allapot || "", aktiv,
                 lemondva: !!a.lemondva, fizetve: e.fizetve, szamlak: e.szamlak.sort((x, y) => String(y.ido).localeCompare(String(x.ido))) });
  }
  sorok.sort((x, y) => String(y.kezdet).localeCompare(String(x.kezdet)));
  return { sorok, aktiv: sorok.filter((s) => s.aktiv).length };
}
async function vasarlasokAdat() {
  // qn:vasarlasok: Stripe-munkamenetenként a teljesítés (útmutató, e-mail, számla); a név és az összeg a qn:vasarlas:<id>-ben
  const sorok = [];
  for (const [sid, v] of await hgetall("qn:vasarlasok")) {
    let r = {};
    try { r = JSON.parse((await kv("GET", "qn:vasarlas:" + sid)) || "{}"); } catch (e) { /* nincs */ }
    const u = UTM_ANYAGOK[v.anyag] || {};
    sorok.push({ ido: v.ido || r.ido, email: v.email || r.email, nev: r.nev || "", anyag: v.anyag, cim: u.anyag || u.cim || v.anyag,
                 osszeg: r.osszeg ?? null, szamla: v.szamla || "", szamla_hiba: v.szamla_hiba ? "nem készült (Billingo)" : "", level: !!v.level });
  }
  sorok.sort((x, y) => String(y.ido).localeCompare(String(x.ido)));
  return { sorok };
}
const UTM_MEGORZES = 365 * 864e5; // az adatvédelmi tájékoztató szerint a kéréseket 1 évig őrizzük (Heni 2026-11-02)
async function utmutatoAdat() {
  const k = (await kv("HGETALL", UTM)) || [];
  const lista = [], lejart = [];
  for (let i = 0; i < k.length; i += 2) {
    let v = {};
    try { v = JSON.parse(k[i + 1]) || {}; } catch (e) { /* hibás bejegyzés */ }
    if (v.ido && Date.now() - Date.parse(v.ido) > UTM_MEGORZES) { lejart.push(k[i]); continue; }
    const [email, anyag] = String(k[i]).split("|");
    // kiment: Heni saját pipája a pultban („Útmutató kiküldve”, Heni 2026-11-02): alapból üres, csak az ő jelölése számít.
    // A kuldve külön mutatja, hogy a gép automatikus levele kiment-e.
    const kuldve = v.kuldve !== false;
    lista.push({ email, anyag, ido: v.ido || "", hirlevel: !!v.hirlevel, cikk: v.cikk || "", kuldve,
      kiment: v.kiment ? !!v.kiment.ertek : false, kiment_ido: v.kiment ? v.kiment.ido || "" : "", kezi: !!v.kiment });
  }
  if (lejart.length) await kv("HDEL", UTM, ...lejart);
  lista.sort((a, b) => String(b.ido).localeCompare(String(a.ido)));
  const anyagok = {};
  // a pultban a rövid név látszik (Heni 2026-11-02: „Remotion”, „Xmind”), a teljes cím csak tartaléknak
  for (const [id, a] of Object.entries(UTM_ANYAGOK)) anyagok[id] = { cim: a.rovid || a.cim, teljes_cim: a.cim, datum: a.datum, aktiv: !!a.aktiv };
  return { darab: lista.length, lista, anyagok, ido: new Date().toISOString() };
}
async function utmutatoMuvelet(b) {
  const email = String(b.email || "").trim().toLowerCase(), anyag = String(b.anyag || "");
  if (b.muvelet === "torol" && email && anyag) { await kv("HDEL", UTM, email + "|" + anyag); return [200, { ok: true }]; }
  if (b.muvelet === "kiment" && email && anyag && typeof b.ertek === "boolean") {
    const nyers = await kv("HGET", UTM, email + "|" + anyag);
    if (!nyers) return [404, { hiba: "Ez a kérés már nincs a listán." }];
    let v = {};
    try { v = JSON.parse(nyers) || {}; } catch (e) { /* hibás bejegyzés */ }
    v.kiment = { ertek: b.ertek, ido: new Date().toISOString() };
    await kv("HSET", UTM, email + "|" + anyag, JSON.stringify(v));
    return [200, { ok: true }];
  }
  return [400, { hiba: "Rossz kérés." }];
}

// ---- Google AdSense futásidejű kapcsoló (Heni 2026-10-20): qn:adsense_ki = "1" -> az oldal nem tölti be a hirdetéseket (api/adsense.js) ----
async function adsenseAdat() { return { be: (await kv("GET", "qn:adsense_ki")) !== "1" }; }
async function adsenseKapcsol(b) {
  if (typeof b.be !== "boolean") return [400, { hiba: "Rossz kérés." }];
  if (b.be) await kv("DEL", "qn:adsense_ki"); else await kv("SET", "qn:adsense_ki", "1");
  return [200, await adsenseAdat()];
}

// ---------- Beérkező hírek priorizálása (Heni 2026-10-21) ----------
// A Mac pillanatképet tölt fel a pontozott hírekről (qn:pult:prioritas), Heni döntései élőben a qn:jovahagyas hash-be
// mennek ({id: {allapot, szint, ido}}), a Mac 3 percenként data/jovahagyas.json-ba szinkronizálja őket, és csak a
// "jovahagyva" állapotú hír jelenhet meg bárhol. Az előzmények a qn:jovahagyas:naplo listában (a legfrissebb elöl).
const JOVA_ALLAPOT = ["jovahagyva", "elutasitva", "fuggo"];
const JOVA_SZINT = ["P1", "P2", "P3"];

async function jovahagyasok() {
  const k = (await kv("HGETALL", P + "jovahagyas")) || [];
  const d = {};
  for (let i = 0; i < k.length; i += 2) { try { d[k[i]] = JSON.parse(k[i + 1]); } catch { /* sérült sor */ } }
  return d;
}

const PULT_KULCSOK = ["posztok", "koltseg", "ajanlott", "statisztika", "prioritas"];
async function pultIdo(kulcs) { await kv("SET", P + "pult:" + kulcs + ":ido", new Date().toISOString()); }
// a változatlanul hagyott pillanatkép is a legutóbbi ellenőrzés idejét mutassa („Frissítve: …”)
// Upstash-forgalom (2026-10-27, a 10 GB-os havi keret elfogyott): a pult percenként a teljes pillanatképet kérte
// (a Beérkező 1,2 MB). A változásjel kis kulcsokból áll; ha a kliens a nála lévővel egyezőt küld, nem olvassuk a nagyot.
async function valtozasJel(kulcs) {
  const ido = (await kv("GET", P + "pult:" + kulcs + ":ido")) || "";
  let tobb = "";
  if (kulcs === "posztok") tobb = String((await kv("HLEN", P + "torlendo")) || 0);
  if (kulcs === "prioritas") tobb = crypto.createHash("sha1").update(String((await kv("LINDEX", P + "jovahagyas:naplo", 0)) || "")).digest("hex").slice(0, 12);
  return ido + "|" + tobb;
}
async function frissIdo(kulcs, adat) {
  const ido = await kv("GET", P + "pult:" + kulcs + ":ido");
  if (!ido || !adat || adat.hiba) return adat;
  for (const m of ["frissult", "frissitve"]) if (m in adat && String(adat[m] || "") < ido) adat[m] = ido;
  return adat;
}
// a jóváhagyásra váró tételek kis kivonata a számlálóhoz (az app 2 percenként, a pult percenként kéri)
function fuggoKivonat(adat) {
  return (adat.sorok || []).filter((s) => s.allapot === "fuggo").map((s) => ({ id: s.id, szint: s.szint, beerkezett: s.beerkezett || "" }));
}

async function prioritasAdat() {
  const v = await kv("GET", P + "pult:prioritas");
  const adat = await frissIdo("prioritas", v ? JSON.parse(v) : { sorok: [], hiba: "Még nincs feltöltött adat." });
  const dont = await jovahagyasok();
  for (const s of adat.sorok || []) {
    const d = dont[s.id];
    if (d) { s.allapot = d.allapot || s.allapot; s.szint_kezi = JOVA_SZINT.includes(d.szint) ? d.szint : null; s.dontes_ido = d.ido || null; }
    s.szint_tenyleges = s.szint_kezi || s.szint;
  }
  adat.naplo = ((await kv("LRANGE", P + "jovahagyas:naplo", 0, 149)) || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
  return adat;
}

// a függőben lévő, Heni döntésére váró hírek száma (az app piros jelzéséhez)
async function fuggoDb() {
  // a kis kivonatból számol (ugyanaz a forrás, mint a lista: a feltöltött pillanatkép + Heni élő döntései)
  const kiv = await kv("GET", P + "pult:prioritas:fuggo");
  if (!kiv) return fuggoDbTeljes();
  const dont = await jovahagyasok();
  const f = [];
  for (const s of JSON.parse(kiv)) {
    const d = dont[s.id];
    if (d && d.allapot && d.allapot !== "fuggo") continue;
    f.push({ ...s, szint_tenyleges: (d && JOVA_SZINT.includes(d.szint)) ? d.szint : s.szint });
  }
  const db = { P1: 0, P2: 0, P3: 0 };
  for (const s of f) if (db[s.szint_tenyleges] !== undefined) db[s.szint_tenyleges]++;
  const legujabb = f.reduce((m, s) => (String(s.beerkezett || "") > m ? String(s.beerkezett) : m), "");
  return { db: f.length, ...db, legujabb, frissult: (await kv("GET", P + "pult:prioritas:ido")) || null };
}
async function fuggoDbTeljes() {
  const adat = await prioritasAdat();
  const f = (adat.sorok || []).filter((s) => s.allapot === "fuggo");
  const db = { P1: 0, P2: 0, P3: 0 };
  for (const s of f) if (db[s.szint_tenyleges] !== undefined) db[s.szint_tenyleges]++;
  const legujabb = f.reduce((m, s) => (String(s.beerkezett || "") > m ? String(s.beerkezett) : m), "");
  return { db: f.length, ...db, legujabb, frissult: adat.frissult || null };
}

async function prioritasDontes(b, ki) {
  const idk = Array.isArray(b.idk) ? b.idk : (b.id ? [b.id] : []);
  if (!idk.length || idk.length > 200 || !idk.every((x) => /^[a-f0-9]{12}$/.test(String(x)))) return [400, { hiba: "Rossz hírazonosító." }];
  const allapot = b.allapot === undefined || b.allapot === null ? null : String(b.allapot);
  const szint = b.szint === undefined ? undefined : (b.szint === null || b.szint === "" ? null : String(b.szint));
  if (allapot !== null && !JOVA_ALLAPOT.includes(allapot)) return [400, { hiba: "Rossz állapot." }];
  if (szint !== undefined && szint !== null && !JOVA_SZINT.includes(szint)) return [400, { hiba: "Rossz prioritás." }];
  if (allapot === null && szint === undefined) return [400, { hiba: "Nincs mit menteni." }];
  const cimek = b.cimek && typeof b.cimek === "object" ? b.cimek : {};
  const most = new Date().toISOString();
  for (const id of idk) {
    const regi = JSON.parse((await kv("HGET", P + "jovahagyas", id)) || "{}");
    const uj = { allapot: allapot || regi.allapot || "fuggo", szint: szint === undefined ? (regi.szint || null) : szint, ido: most, ki };
    // a megjelenés ideje: az első jóváhagyás pillanata (a csengő, a Napok és az app értesítései ehhez igazodnak);
    // egy későbbi szintmódosítás nem teszi újra „friss” hírré
    uj.jovahagyva_ido = uj.allapot === "jovahagyva" ? (regi.allapot === "jovahagyva" && regi.jovahagyva_ido ? regi.jovahagyva_ido : most) : null;
    await kv("HSET", P + "jovahagyas", id, JSON.stringify(uj));
    // Heni 2026-10-25: „ami jóvá van hagyva a Beérkezőben, az mind kerüljön át az Ajánlottba”. Egy korábbi kisöprés
    // (Ajánlott, balra húzás) ne rejtse el az újonnan jóváhagyott hírt; ha utána söpri ki, az marad érvényben.
    if (uj.allapot === "jovahagyva" && regi.allapot !== "jovahagyva") await kv("SREM", P + "kisoport", id);
    await kv("LPUSH", P + "jovahagyas:naplo", JSON.stringify({ ido: most, id, cim: String(cimek[id] || "").slice(0, 160),
      allapot: uj.allapot, elozo: regi.allapot || "fuggo", szint: uj.szint, elozo_szint: regi.szint || null, ki, tomeges: idk.length > 1 }));
  }
  await kv("LTRIM", P + "jovahagyas:naplo", 0, 1999);
  return [200, { ok: true, db: idk.length }];
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
      // csak érvényes sütivel érvényteleníti a többi munkamenetet is, különben bárki kiléptethetné a tulajdonost;
      // kilépéskor az admin-értesítést kapó eszközök listája is törlődik (újra belépve az app újra jelentkezik)
      if (await belepve(req)) { await kv("INCR", "qn:admin:gen"); await kv("DEL", "qn:push:admin_tokenek"); }
      res.setHeader("Set-Cookie", `${SUTI}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
      return json(res, 200, { ok: true });
    }
    if (gep(req)) {
      if (mi === "feltolt" && req.method === "POST") {
        const { kulcs, adat, hash } = await torzs(req);
        if (!["posztok", "koltseg", "ajanlott", "statisztika", "prioritas"].includes(kulcs)) return json(res, 400, { hiba: "rossz kulcs" });
        await kv("SET", P + "pult:" + kulcs, JSON.stringify(adat));
        await pultIdo(kulcs);
        if (typeof hash === "string" && /^[a-f0-9]{16,64}$/.test(hash)) await kv("SET", P + "pult:" + kulcs + ":hash", hash);
        if (kulcs === "prioritas") await kv("SET", P + "pult:prioritas:fuggo", JSON.stringify(fuggoKivonat(adat)));
        return json(res, 200, { ok: true });
      }
      // Upstash-forgalom (2026-10-23): a változatlan pillanatképet a gép nem tölti fel újra, csak az idejét frissíti,
      // ehhez előbb lekéri a tárolt lenyomatokat (néhány bájt a 0,3-0,9 MB-os csomagok helyett)
      // 2026-11-22 (Heni: „ellenőrizd, hogy hozzáfér-e”): csak olvasó lekérdezés, aktív-e egy e-mail-cím előfizetése.
      // Ugyanaz az érvényességi szabály, mint az api/elofizetes.js ervenyes() függvényében.
      // kézzel (Billingo-felületen) kiállított számla számának rögzítése egy előfizetés- vagy vásárlás-sorhoz
      if (mi === "szamla_kezi_gep" && req.method === "POST") {
        const { tipus, id, szamla } = await torzs(req);
        const kulcs = tipus === "elofizetes" ? "qn:elofizetesek" : tipus === "vasarlas" ? "qn:vasarlasok" : "";
        if (!kulcs || !/^(in|cs)_[A-Za-z0-9_]{8,120}$/.test(id || "") || !/^[0-9A-Za-z\-\/]{4,40}$/.test(szamla || "")) return json(res, 400, { hiba: "rossz adat" });
        const r = await kv("HGET", kulcs, id);
        if (!r) return json(res, 404, { hiba: "nincs ilyen sor" });
        await kv("HSET", kulcs, id, JSON.stringify({ ...JSON.parse(r), szamla, szamla_hiba: "", szamla_kezi: true }));
        return json(res, 200, { ok: true });
      }
      if (mi === "elofizetok_gep") return json(res, 200, await elofizetokAdat());
      if (mi === "latogatok_gep") return json(res, 200, await latogatokAdat(String(url.searchParams.get("i") || "7d")));
      if (mi === "vasarlasok_gep") return json(res, 200, await vasarlasokAdat());
      if (mi === "elofizeto_gep") {
        const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
        if (!email) return json(res, 400, { hiba: "email kell" });
        const sub = await kv("GET", "qn:elo:email:" + email);
        const r = sub && (await kv("GET", "qn:elo:" + sub));
        const a = r ? JSON.parse(r) : null;
        const most = Math.floor(Date.now() / 1000);
        const aktiv = !!a && ["active", "trialing", "past_due"].includes(a.allapot || "active") && (a.eddig || 0) + 3 * 86400 > most;
        return json(res, 200, { email, van: !!a, aktiv, terv: a && a.terv, allapot: a && a.allapot, eddig: a && a.eddig,
                                lemondva: !!(a && a.lemondva), udvozolve: !!(sub && (await kv("GET", "qn:elo:udv:" + sub))) });
      }
      if (mi === "pult_hash_gep") {
        const ki = {};
        for (const k of PULT_KULCSOK) ki[k] = (await kv("GET", P + "pult:" + k + ":hash")) || null;
        return json(res, 200, ki);
      }
      if (mi === "pult_erintes_gep" && req.method === "POST") {
        const { kulcs } = await torzs(req);
        if (!PULT_KULCSOK.includes(kulcs)) return json(res, 400, { hiba: "rossz kulcs" });
        await pultIdo(kulcs);
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
      if (mi === "apk_letoltes_gep") return json(res, 200, await apkAdat());
      if (mi === "hirlevel_gep") return json(res, 200, await hirlevelAdat());
      if (mi === "jovahagyasok_gep") return json(res, 200, { dontesek: await jovahagyasok() });
      if (mi === "prioritas_gep") return json(res, 200, await prioritasAdat());
      if (mi === "pult_frissult_gep") {
        // a pult pillanatképeinek kora: a felhős kör ebből látja, hogy a Mac frissen tartja-e a Flybuilt-függő listákat
        const ki = {};
        for (const k of ["posztok", "ajanlott", "prioritas", "koltseg"]) ki[k] = (await kv("GET", P + "pult:" + k + ":ido")) || null;
        return json(res, 200, ki);
      }
      if (mi === "prioritas_dontes_gep" && req.method === "POST") { const [k, v] = await prioritasDontes(await torzs(req), "Heni (gépi pult)"); return json(res, k, v); }
      if (mi === "boo_gep") return json(res, 200, await booAdat());
      if (mi === "utmutato_gep") return json(res, 200, await utmutatoAdat());
      if (mi === "utmutato_muvelet_gep" && req.method === "POST") { const [k, v] = await utmutatoMuvelet(await torzs(req)); return json(res, k, v); }
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
          if (!e || (!e.facebook && !e.linkedin && !e.hirdetes && !e.csoport && !e.threads && !e.kartya && !e.sajat_kep && !e.hirlevel)) await kv("HDEL", P + "kitenni", id);
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

    if ((mi === "posztok" || mi === "prioritas") && url.searchParams.get("jel")) {
      const jel = await valtozasJel(mi);
      if (jel === url.searchParams.get("jel")) return json(res, 200, { valtozatlan: true, jel });
    }
    if (mi === "posztok" || mi === "koltseg" || mi === "statisztika") {
      const v = await kv("GET", P + "pult:" + mi);
      const adat = await frissIdo(mi, v ? JSON.parse(v) : { hiba: "Még nincs feltöltött adat.", sorok: [] });
      if (mi === "posztok") {
        const k = (await kv("HGETALL", P + "torlendo")) || [];
        const t = new Set(k.filter((_, i) => i % 2 === 0));
        for (const s of adat.sorok || []) if (t.has(s.id)) s.torles_folyamatban = true;
        adat.jel = await valtozasJel("posztok");
      }
      return json(res, 200, adat);
    }
    // Heni 2026-11-22: „adminba is rakd be, hogy lássam az előfizetőket, mettől meddig tart, mire fizetett elő, és az
    // útmutatókat is, külön fülön”. Csak olvasás.
    if (mi === "elofizetok") return json(res, 200, await elofizetokAdat());
    // Heni 2026-11-27: látogatottság az adminban (Umami, szerveroldali lekérés)
    if (mi === "latogatok") return json(res, 200, await latogatokAdat(String(url.searchParams.get("i") || "7d")));
    if (mi === "vasarlasok") return json(res, 200, await vasarlasokAdat());
    if (mi === "apk_letoltes") return json(res, 200, await apkAdat());
    if (mi === "hirdetes_katt") return json(res, 200, await hirdetesAdat(String(url.searchParams.get("h") || "")));    if (mi === "torles" && req.method === "POST") {
      const { pid, felulet, cim } = await torzs(req);
      if (!/^[a-f0-9]{24}$/.test(pid || "")) return json(res, 400, { hiba: "Rossz posztazonosító." });
      if (!["Facebook", "LinkedIn", "Hirdetés"].includes(felulet)) return json(res, 400, { hiba: "Rossz felület." });
      await kv("HSET", P + "torlendo", pid, JSON.stringify({ kert: new Date().toISOString(), felulet, cim: String(cim || "").slice(0, 200) }));
      return json(res, 200, { ok: true, sorban: true });
    }
    if (mi === "ajanlott") {
      const v = await kv("GET", P + "pult:ajanlott");
      const adat = await frissIdo("ajanlott", v ? JSON.parse(v) : { sorok: [] });
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
        adat.sorok = adat.sorok.filter((s) => s.elemzes || elo.has(s.id));
      }
      // ami a gép utolsó pillanatképe óta jelent meg, azt a kitett oldal indexéből azonnal hozzáadjuk
      const megvan = new Set(adat.sorok.map((s) => s.id));
      // minden élő hír, ami a pillanatképből hiányzik (a 4 napos ablakon belül), azonnal bekerül: nem csak a pillanatkép
      // után megjelentek, mert a pillanatkép a gyűjtés ütemétől függően néhány percig a friss híreket még nem látja
      const hatar = Date.now() - 96 * 3600e3;
      // NINCS BORÍTÓKÉP, NINCS AJÁNLOTT CIKK (Heni 2026-10-13): csak betölthető képpel kerülhet be
      // Heni 2026-10-25: az Ajánlottba CSAK a Beérkezőben jóváhagyott hír kerülhet
      const jova = await jovahagyasok();
      const jovaE = (id) => (jova[id] || {}).allapot === "jovahagyva";
      adat.sorok = adat.sorok.filter((s) => s.elemzes || jovaE(s.id));
      const jeloltek = HIREK.filter((h) => { const t = Date.parse(h.publikalva || ""); return t && t > hatar && !megvan.has(h.id) && !kis.has(h.id) && h.kep && jovaE(h.id); });
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
        // a pillanatkép szándékosan kihagyott hírét (rossz borító) nem tesszük vissza feldolgozatlanként (2026-10-26)
        if (!t || t <= hatar || megvan.has(h.id) || kis.has(h.id) || !jok.has(h.id) || !jovaE(h.id) || (adat.kep_nelkul || []).includes(h.id)) continue;
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
        s.kerve = { facebook: !!e.facebook, linkedin: !!e.linkedin, hirdetes: !!e.hirdetes, csoport: !!e.csoport, threads: !!e.threads };
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
    if (mi === "prioritas") { const adat = await prioritasAdat(); adat.jel = await valtozasJel("prioritas"); return json(res, 200, adat); }
    if (mi === "fuggo") return json(res, 200, await fuggoDb());
    if (mi === "prioritas_dontes" && req.method === "POST") { const [k, v] = await prioritasDontes(await torzs(req), "Heni"); return json(res, k, v); }
    if (mi === "admin_eszkoz" && req.method === "POST") {
      // az app (belépett admin) FCM-eszköztokenje: csak ide megy a jóváhagyásra váró hírek értesítése
      const { token } = await torzs(req);
      if (!/^[A-Za-z0-9_:\-]{100,300}$/.test(String(token || ""))) return json(res, 400, { hiba: "Rossz eszköztoken." });
      await kv("SADD", "qn:push:admin_tokenek", token);
      return json(res, 200, { ok: true });
    }
    if (mi === "boo") return json(res, 200, await booAdat());
    if (mi === "utmutato") return json(res, 200, await utmutatoAdat());
    if (mi === "utmutato_muvelet" && req.method === "POST") { const [k, v] = await utmutatoMuvelet(await torzs(req)); return json(res, k, v); }
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
      if (mezo === "csoport") return json(res, 403, { hiba: "Csoportba a gép nem posztol, azt Heni intézi." }); // 2026-11-20
      if (["facebook", "linkedin", "hirdetes", "threads"].includes(mezo)) {
        if (ertek) e[mezo] = { kerve: most }; else delete e[mezo];
      } else if (mezo === "jovahagyas") {
        // a pipa önmagában nem indít semmit: csak a jóváhagyott felületekhez készül időzített elem (Heni 2026-10-12)
        const feluletek = ["facebook", "linkedin", "hirdetes", "threads"].filter((f) => e[f]);
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
      if (!e.facebook && !e.linkedin && !e.hirdetes && !e.csoport && !e.threads && !e.kartya && !e.sajat_kep && !e.jovahagyas && !e.hirlevel) await kv("HDEL", P + "kitenni", id);
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
const KITENNI_MEZOK = ["facebook", "linkedin", "hirdetes", "csoport", "threads", "kartya", "sajat_kep", "jovahagyas", "hirlevel", "kartya_hiba", "kiteteli_hiba", "volt_elutasitva"];
function kitenniTiszta(e) {
  return Object.fromEntries(KITENNI_MEZOK.filter((k) => k in e).map((k) => [k, e[k]]));
}
