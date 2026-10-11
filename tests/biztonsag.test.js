// Biztonsági regressziós tesztek az api/ végpontokhoz (2026-10-11-es átvilágítás, build/SECURITY_AUDIT.md).
// Futtatás: node --test tests/
// Külső hívás nincs: a KV memóriában fut, a Gemini és a weboldal-lekérés el van fogva.
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const API = path.join(__dirname, "..", "api");

// ---- memóriabeli Upstash és elfogott külső hívások ----
let tar, lejar, kulso;
function ujKv() { tar = new Map(); lejar = new Map(); kulso = []; }
function kvParancs(c) {
  const [p, k, ...a] = c.map((x) => (typeof x === "number" ? String(x) : x));
  const P = p.toUpperCase();
  const h = () => { if (!tar.has(k)) tar.set(k, new Map()); return tar.get(k); };
  switch (P) {
    case "GET": return tar.has(k) ? tar.get(k) : null;
    case "SET": {
      if (a.includes("NX") && tar.has(k)) return null;
      tar.set(k, a[0]); return "OK";
    }
    case "DEL": return tar.delete(k) ? 1 : 0;
    case "EXISTS": return tar.has(k) ? 1 : 0;
    case "INCR": { const v = Number(tar.get(k) || 0) + 1; tar.set(k, String(v)); return v; }
    case "EXPIRE": lejar.set(k, Number(a[0])); return 1;
    case "HGET": return (tar.get(k) || new Map()).get(a[0]) ?? null;
    case "HMGET": return a.map((f) => (tar.get(k) || new Map()).get(f) ?? null);
    case "HSET": { const m = h(); for (let i = 0; i < a.length; i += 2) m.set(a[i], a[i + 1]); return 1; }
    case "HSETNX": { const m = h(); if (m.has(a[0])) return 0; m.set(a[0], a[1]); return 1; }
    case "HDEL": return (tar.get(k) || new Map()).delete(a[0]) ? 1 : 0;
    case "HINCRBY": { const m = h(); const v = Number(m.get(a[0]) || 0) + Number(a[1]); m.set(a[0], String(v)); return v; }
    case "SADD": { if (!tar.has(k)) tar.set(k, new Set()); const s = tar.get(k); const u = !s.has(a[0]); s.add(a[0]); return u ? 1 : 0; }
    case "SREM": { const s = tar.get(k); return s && s.delete(a[0]) ? 1 : 0; }
    case "ZADD": case "ZREMRANGEBYSCORE": case "ZINCRBY": case "ZREM": return 1;
    case "ZREVRANGE": return [];
    default: throw new Error("ismeretlen KV-parancs a tesztben: " + P);
  }
}
const vartGemini = { valasz: null };
global.fetch = async (url, opt = {}) => {
  url = String(url);
  if (url === "https://kv.teszt") return { json: async () => ({ result: kvParancs(JSON.parse(opt.body)) }) };
  kulso.push({ url, opt });
  if (url.includes("generativelanguage.googleapis.com")) {
    if (vartGemini.valasz instanceof Error) throw vartGemini.valasz;
    return { json: async () => vartGemini.valasz || {} };
  }
  if (vartGemini.oldal && url.startsWith(vartGemini.oldal.url)) return vartGemini.oldal.valasz(url);
  throw new Error("nem engedett külső hívás a tesztben: " + url);
};
process.env.KV_REST_API_URL = "https://kv.teszt";
process.env.KV_REST_API_TOKEN = "teszt";
process.env.CHAT_SO = "so";
process.env.GEMINI_API_KEY = "teszt";

function keres(modul, { method = "POST", url = "/", body, headers = {} } = {}) {
  const h = require(path.join(API, modul));
  const req = { method, url, headers: { "x-forwarded-for": "198.51.100.7", ...headers }, body: body === undefined ? {} : body };
  return new Promise((ok) => {
    const fej = {};
    const res = { statusCode: 200, setHeader: (k, v) => { fej[k.toLowerCase()] = v; }, getHeader: (k) => fej[k.toLowerCase()],
      end: (b) => ok({ kod: res.statusCode, fej, adat: b ? JSON.parse(b) : null }) };
    h(req, res);
  });
}

// ---- SEC-003: admin belépés korlátja; SEC-012: titok nélkül nincs érvényes süti ----
test("SEC-003: 10 hibás próba után a helyes jelszó sem enged be ugyanarról az IP-ről", async () => {
  ujKv(); process.env.ADMIN_JELSZO = "helyes-jelszo-123"; process.env.ADMIN_TITOK = "x".repeat(32);
  for (let i = 0; i < 10; i++) {
    const r = await keres("admin.js", { url: "/api/admin?mi=belep", body: { jelszo: "rossz" + i } });
    assert.strictEqual(r.kod, 401);
  }
  const r = await keres("admin.js", { url: "/api/admin?mi=belep", body: { jelszo: "helyes-jelszo-123" } });
  assert.strictEqual(r.kod, 429);
  const masik = await keres("admin.js", { url: "/api/admin?mi=belep", body: { jelszo: "helyes-jelszo-123" }, headers: { "x-forwarded-for": "203.0.113.9" } });
  assert.strictEqual(masik.kod, 200, "más IP-ről a helyes jelszó működik");
  assert.match(masik.fej["set-cookie"], /HttpOnly; Secure; SameSite=Strict/);
});

test("SEC-003: párhuzamos próbákkal sem értékelhető ki 10-nél több jelszó, és a tulajdonos nem zárható ki", async () => {
  ujKv(); process.env.ADMIN_JELSZO = "helyes-jelszo-123"; process.env.ADMIN_TITOK = "x".repeat(32);
  const ki = await Promise.all(Array.from({ length: 60 }, (_, i) => keres("admin.js", { url: "/api/admin?mi=belep", body: { jelszo: "rossz" + i } })));
  assert.strictEqual(ki.filter((r) => r.kod === 401).length, 10);
  assert.strictEqual(ki.filter((r) => r.kod === 429).length, 50);
  const tulaj = await keres("admin.js", { url: "/api/admin?mi=belep", body: { jelszo: "helyes-jelszo-123" }, headers: { "x-forwarded-for": "203.0.113.50" } });
  assert.strictEqual(tulaj.kod, 200, "más hálózatról a tulajdonos be tud lépni");
});

test("ÚJ: az X-ág csak valódi x.com címre fut, az URL közepére írt minta nem kerüli meg a moderálást", async () => {
  ujKv();
  const szuro = require(path.join(API, "_szuro.js"));
  const eredeti = szuro.biztonsagosLekeres; const lekert = [];
  szuro.biztonsagosLekeres = async (u) => { lekert.push(u); throw new Error("teszt"); };
  await keres("bekuld.js", { body: { url: "https://adathalasz.example/promo/x.com/OpenAI/status/1234567890" } });
  szuro.biztonsagosLekeres = eredeti;
  assert.ok(!kulso.some((k) => k.url.includes("fxtwitter")), "nem a tweetet nézi meg helyette");
  assert.strictEqual(lekert.length, 1, "a beküldött oldalt magát kell megnyitni");
});

test("SEC-012: hiányzó ADMIN_TITOK mellett az üres kulccsal aláírt süti nem érvényes", async () => {
  ujKv(); const regi = process.env.ADMIN_TITOK; delete process.env.ADMIN_TITOK;
  const lejar = Date.now() + 864e5;
  const ures = crypto.createHmac("sha256", "").update(String(lejar)).digest("hex");
  const r = await keres("admin.js", { method: "GET", url: "/api/admin?mi=hirdetok", headers: { cookie: `qn_admin=${lejar}.${ures}` } });
  assert.strictEqual(r.kod, 401);
  process.env.ADMIN_TITOK = regi;
});

// ---- SEC-006: SSRF-szűrő ----
test("SEC-006: belső és fenntartott címek felismerése", () => {
  const { belsoCim } = require(path.join(API, "_szuro.js"));
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "224.0.0.1",
    "0:0:0:0:0:0:0:1", "0::1", "::7f00:1", "::127.0.0.1", "0:0:0:0:0:ffff:127.0.0.1", "fec0::1", "2002:7f00:1::1", "100::1", "nem-ip"])
    assert.ok(belsoCim(ip), ip + " belső");
  for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) assert.ok(!belsoCim(ip), ip + " nyilvános");
});

test("SEC-006: localhost, IP-literál, más port és belső címre mutató átirányítás tiltva", async () => {
  const { biztonsagosLekeres, nyilvanosHost } = require(path.join(API, "_szuro.js"));
  assert.strictEqual(await nyilvanosHost("localhost"), false);
  assert.strictEqual(await nyilvanosHost("2130706433"), false);
  assert.strictEqual(await nyilvanosHost("0x7f000001"), false);
  await assert.rejects(biztonsagosLekeres("http://127.0.0.1/"), /nem nyilvános/);
  await assert.rejects(biztonsagosLekeres("http://localhost/"), /nem nyilvános/);
  await assert.rejects(biztonsagosLekeres("https://pelda.hu:8080/"), /nem engedett/);
  await assert.rejects(biztonsagosLekeres("https://felhasznalo:jelszo@pelda.hu/"), /nem engedett/);
});

// ---- SEC-004: hosszkorlát a promptban; CQ-003: AI-hiba esetén Heni dönt ----
test("SEC-004 + CQ-003: óriási cím nem kerül a promptba, és Gemini-hiba esetén nincs csendes elutasítás", async () => {
  ujKv();
  const szuro = require(path.join(API, "_szuro.js"));
  const eredeti = szuro.biztonsagosLekeres;
  szuro.biztonsagosLekeres = async (u) => ({ vegso: u, valasz: { ok: true, headers: { get: () => "text/html" },
    text: async () => `<html><head><title>${"A".repeat(500000)}</title><meta name="description" content="${"B".repeat(100000)}"></head><body><p>${"mesterséges intelligencia hír ".repeat(50)}</p></body></html>` } });
  vartGemini.valasz = { error: { message: "kvóta" } };
  const r = await keres("bekuld.js", { body: { url: "https://pelda-ai-hir.hu/cikk" } });
  szuro.biztonsagosLekeres = eredeti;
  const g = kulso.filter((k) => k.url.includes("generativelanguage"));
  assert.strictEqual(g.length, 1);
  assert.ok(g[0].opt.body.length < 12000, "a prompt mérete korlátos: " + g[0].opt.body.length);
  assert.strictEqual(r.adat.allapot, "dontesre_var");
  const rek = [...tar.entries()].find(([k]) => /^qn:bek:[a-f0-9]{16}$/.test(k));
  assert.strictEqual(JSON.parse(rek[1]).ok, "ai_hiba");
  vartGemini.valasz = null;
});

// ---- SEC-007: a hirdetői űrlap a korlát után nem kér le weboldalt ----
test("SEC-007: a korláton túl a weboldal ellenőrzése (DNS, lekérés) már nem fut le", async () => {
  ujKv();
  const szuro = require(path.join(API, "_szuro.js"));
  const eredeti = szuro.weboldal; let hivas = 0;
  szuro.weboldal = async () => { hivas++; return { ok: false, uzenet: "nincs" }; };
  for (let i = 0; i < 20; i++) await keres("hirdetes.js", { body: { nev: "Teszt Elek", telefon: "+36 30 123 4567", weboldal: "pelda" + i + ".hu" } });
  szuro.weboldal = eredeti;
  assert.strictEqual(hivas, 15, "látogatónként legfeljebb 15 drága ellenőrzés naponta");
});

// ---- SEC-008: a chatbot globális kerete egy IP-ről nem meríthető ki ----
test("SEC-008: egyetlen IP legfeljebb a saját 10 kérdésével terheli a napi globális keretet", async () => {
  ujKv(); vartGemini.valasz = new Error("nincs hálózat a tesztben");
  for (let i = 0; i < 30; i++) await keres("kerdez.js", { body: { kerdes: "Mi újság az AI-ban? " + i } });
  const nap = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  assert.strictEqual(Number(tar.get("qn:chat:nap:" + nap)), 10);
  vartGemini.valasz = null;
});

// ---- SEC-010: párhuzamos szavazás ----
test("SEC-010: ugyanarról az IP-ről párhuzamosan küldött szavazatok legfeljebb 1-gyel növelik a pontot", async () => {
  ujKv();
  const id = "abcdef123456";
  const lat = (i) => crypto.createHash("sha256").update("lat" + i).digest("hex").slice(0, 24);
  const ki = await Promise.all(Array.from({ length: 8 }, (_, i) => keres("szavaz.js", { body: { id, l: lat(i), ertek: 1 } })));
  assert.ok(ki.some((r) => r.kod === 200), "legalább egy szavazat átmegy");
  assert.ok(Number(tar.get("qn:sz:pont").get(id)) <= 1, "a pont nem fújható fel");
  // rendes működés: a szavazat visszavonható, utána újra lehet szavazni
  const nyero = ki.findIndex((r) => r.kod === 200);
  const vissza = await keres("szavaz.js", { body: { id, l: lat(nyero), ertek: 0 } });
  assert.strictEqual(vissza.adat.pont, 0);
});

// ---- SEC-001: a kliens escape-segédei ----
test("SEC-001: a feed.json mezői escape-elve, a kép és a slug csak biztonságos formában", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "site", "assets", "app.js"), "utf8").split("\n").slice(0, 4).join("\n");
  const { qnEsc, qnSlug, qnKep } = new Function(js + "\nreturn { qnEsc, qnSlug, qnKep };")();
  assert.strictEqual(qnEsc('<img src=x onerror="a">\''), "&lt;img src=x onerror=&quot;a&quot;&gt;&#39;");
  assert.strictEqual(qnKep('x" onerror="alert(1)'), "");
  assert.strictEqual(qnKep("javascript:alert(1)"), "");
  assert.strictEqual(qnKep("/assets/kep/abc.webp"), "/assets/kep/abc.webp");
  assert.strictEqual(qnKep("https://kep.pelda.hu/a.jpg"), "https://kep.pelda.hu/a.jpg");
  assert.ok(!qnSlug('x" onclick="a'));
  assert.ok(qnSlug("dania-humanoid-robotokat-tesztel"));
});
