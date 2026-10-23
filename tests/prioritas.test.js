// A beérkező hírek priorizálásának és kötelező jóváhagyásának tesztjei (Heni 2026-10-21): api/admin.js és api/push.js.
// Futtatás: node --test tests/
// Külső hívás nincs: a KV memóriában fut, az FCM el van fogva.
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const API = path.join(__dirname, "..", "api");

let tar, kulso;
function ujKv() { tar = new Map(); kulso = []; }
function kvParancs(c) {
  const [p, k, ...a] = c.map((x) => (typeof x === "number" ? String(x) : x));
  const P = p.toUpperCase();
  const h = () => { if (!tar.has(k)) tar.set(k, new Map()); return tar.get(k); };
  const l = () => { if (!tar.has(k)) tar.set(k, []); return tar.get(k); };
  switch (P) {
    case "GET": return tar.has(k) ? tar.get(k) : null;
    case "SET": { if (a.includes("NX") && tar.has(k)) return null; tar.set(k, a[0]); return "OK"; }
    case "DEL": return tar.delete(k) ? 1 : 0;
    case "INCR": { const v = Number(tar.get(k) || 0) + 1; tar.set(k, String(v)); return v; }
    case "EXPIRE": return 1;
    case "HGET": return (tar.get(k) || new Map()).get(a[0]) ?? null;
    case "HSET": { const m = h(); for (let i = 0; i < a.length; i += 2) m.set(a[i], a[i + 1]); return 1; }
    case "HGETALL": { const m = tar.get(k) || new Map(); return [...m.entries()].flat(); }
    case "LPUSH": { const x = l(); x.unshift(...a); return x.length; }
    case "LRANGE": { const x = tar.get(k) || []; return x.slice(Number(a[0]), Number(a[1]) + 1); }
    case "LTRIM": { const x = tar.get(k) || []; tar.set(k, x.slice(Number(a[0]), Number(a[1]) + 1)); return "OK"; }
    case "SADD": { if (!tar.has(k)) tar.set(k, new Set()); tar.get(k).add(a[0]); return 1; }
    case "SREM": { const s = tar.get(k); return s && s.delete(a[0]) ? 1 : 0; }
    case "SMEMBERS": return [...(tar.get(k) || new Set())];
    default: throw new Error("ismeretlen KV-parancs a tesztben: " + P);
  }
}
global.fetch = async (url, opt = {}) => {
  url = String(url);
  if (url === "https://kv.teszt") return { json: async () => ({ result: kvParancs(JSON.parse(opt.body)) }) };
  kulso.push({ url, opt });
  if (url.startsWith("https://oauth2.googleapis.com/token")) return { ok: true, json: async () => ({ access_token: "t", expires_in: 3600 }) };
  if (url.includes("fcm.googleapis.com")) {
    const t = JSON.parse(opt.body).message.token;
    if (t && t.startsWith("rossz")) return { ok: false, status: 404, json: async () => ({ error: { status: "UNREGISTERED" } }) };
    return { ok: true, status: 200, json: async () => ({ name: "projects/x/messages/1" }) };
  }
  throw new Error("nem engedett külső hívás a tesztben: " + url);
};
process.env.KV_REST_API_URL = "https://kv.teszt";
process.env.KV_REST_API_TOKEN = "teszt";
process.env.CHAT_SO = "so";
process.env.ADMIN_JELSZO = "helyes-jelszo-123";
process.env.ADMIN_TITOK = "x".repeat(32);
process.env.GEP_KULCS = "g".repeat(40);

function keres(modul, { method = "POST", url = "/", body, headers = {} } = {}) {
  const h = require(path.join(API, modul));
  const req = { method, url, headers: { "x-forwarded-for": "198.51.100.9", "content-type": "application/json", ...headers }, body: body === undefined ? {} : body,
    query: Object.fromEntries(new URL(url, "https://quicknews.hu").searchParams) };
  return new Promise((ok) => {
    const fej = {};
    const res = { statusCode: 200, setHeader: (k, v) => { fej[k.toLowerCase()] = v; }, getHeader: (k) => fej[k.toLowerCase()],
      end: (b) => { let adat = null; try { adat = b ? JSON.parse(b) : null; } catch { adat = { html: String(b) }; } ok({ kod: res.statusCode, fej, adat }); } };
    h(req, res);
  });
}
async function belep() {
  const r = await keres("admin.js", { url: "/api/admin?mi=belep", body: { jelszo: "helyes-jelszo-123" } });
  assert.strictEqual(r.kod, 200);
  return { cookie: String(r.fej["set-cookie"]).split(";")[0] };
}
const GEP = { "x-gep-kulcs": "g".repeat(40) };
const ID1 = "aaaaaaaaaaa1", ID2 = "aaaaaaaaaaa2", ID3 = "aaaaaaaaaaa3";
function pillanatkep() {
  tar.set("qn:pult:prioritas", JSON.stringify({ frissult: "2026-10-21T10:00:00+00:00", napok: 7, sorok: [
    { id: ID1, cim: "Első", szint: "P1", pont: 91, allapot: "fuggo", beerkezett: "2026-10-21T09:00:00+00:00" },
    { id: ID2, cim: "Második", szint: "P3", pont: 50, allapot: "fuggo", beerkezett: "2026-10-21T09:30:00+00:00" },
    { id: ID3, cim: "Harmadik", szint: "X", pont: 22, allapot: "elutasitva", auto: true, beerkezett: "2026-10-21T08:00:00+00:00" },
  ] }));
}

test("belépés nélkül a priorizálás se nem olvasható, se nem írható, és a számláló sem látszik", async () => {
  ujKv(); pillanatkep();
  for (const [mi, method] of [["prioritas", "GET"], ["fuggo", "GET"], ["prioritas_dontes", "POST"], ["admin_eszkoz", "POST"]]) {
    const r = await keres("admin.js", { method, url: "/api/admin?mi=" + mi, body: { idk: [ID1], allapot: "jovahagyva", token: "x".repeat(150) } });
    assert.strictEqual(r.kod, 401, mi);
  }
  assert.strictEqual(tar.has("qn:jovahagyas"), false);
});

test("jóváhagyás, elutasítás, kézi prioritás: a hash-be kerül és naplózódik, a pillanatképet felülírja", async () => {
  ujKv(); pillanatkep();
  const s = await belep();
  let r = await keres("admin.js", { url: "/api/admin?mi=prioritas_dontes", headers: s, body: { idk: [ID1], allapot: "jovahagyva", cimek: { [ID1]: "Első" } } });
  assert.strictEqual(r.kod, 200);
  r = await keres("admin.js", { url: "/api/admin?mi=prioritas_dontes", headers: s, body: { idk: [ID2], szint: "P2" } });
  assert.strictEqual(r.kod, 200);
  const d = await keres("admin.js", { method: "GET", url: "/api/admin?mi=prioritas", headers: s });
  const sor = Object.fromEntries(d.adat.sorok.map((x) => [x.id, x]));
  assert.strictEqual(sor[ID1].allapot, "jovahagyva");
  assert.strictEqual(sor[ID2].allapot, "fuggo");
  assert.strictEqual(sor[ID2].szint_tenyleges, "P2");
  assert.strictEqual(sor[ID3].allapot, "elutasitva");
  assert.strictEqual(d.adat.naplo.length, 2);
  assert.strictEqual(d.adat.naplo[1].allapot, "jovahagyva");
  assert.strictEqual(d.adat.naplo[1].elozo, "fuggo");
  const f = await keres("admin.js", { method: "GET", url: "/api/admin?mi=fuggo", headers: s });
  assert.deepStrictEqual([f.adat.db, f.adat.P1, f.adat.P2, f.adat.P3], [1, 0, 1, 0]);
});

test("tömeges döntés egy kérésben, a gépi pultból is (gépkulccsal)", async () => {
  ujKv(); pillanatkep();
  const r = await keres("admin.js", { url: "/api/admin?mi=prioritas_dontes_gep", headers: GEP, body: { idk: [ID1, ID2, ID3], allapot: "elutasitva" } });
  assert.strictEqual(r.kod, 200);
  assert.strictEqual(r.adat.db, 3);
  const g = await keres("admin.js", { method: "GET", url: "/api/admin?mi=jovahagyasok_gep", headers: GEP });
  assert.deepStrictEqual(Object.keys(g.adat.dontesek).sort(), [ID1, ID2, ID3]);
  assert.ok(Object.values(g.adat.dontesek).every((x) => x.allapot === "elutasitva"));
  assert.ok(JSON.parse(tar.get("qn:jovahagyas:naplo")[0]).tomeges);
});

test("hibás bemenet: rossz azonosító, rossz állapot, rossz szint, túl sok tétel", async () => {
  ujKv(); pillanatkep();
  const s = await belep();
  const rossz = [{ idk: ["../x"], allapot: "jovahagyva" }, { idk: [ID1], allapot: "kitesz" }, { idk: [ID1], szint: "P0" },
    { idk: Array.from({ length: 201 }, (_, i) => String(i).padStart(12, "a")), allapot: "jovahagyva" }, { idk: [ID1] }];
  for (const b of rossz) {
    const r = await keres("admin.js", { url: "/api/admin?mi=prioritas_dontes", headers: s, body: b });
    assert.strictEqual(r.kod, 400, JSON.stringify(b).slice(0, 60));
  }
  assert.strictEqual(tar.has("qn:jovahagyas"), false);
});

test("admin-értesítés: csak a bejelentett admin eszközre megy, egyszer, az érvénytelen token kikerül", async () => {
  ujKv(); process.env.FCM_SZOLGALTATAS = JSON.stringify({ client_email: "a@b", project_id: "p", private_key: require("crypto").generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" }) });
  const s = await belep();
  const jo = "j" + "A".repeat(150), rossz = "rossz" + "B".repeat(150);
  for (const t of [jo, rossz]) assert.strictEqual((await keres("admin.js", { url: "/api/admin?mi=admin_eszkoz", headers: s, body: { token: t } })).kod, 200);
  // gépkulcs nélkül nem küldhető
  assert.ok([401, 403].includes((await keres("push.js", { url: "/api/push?mi=admin_gep", body: { kulcs: "a".repeat(24), cim: "x" } })).kod));
  const sorok = [{ id: ID1, szint: "P1", pont: 91, cim: "Első", ora: 0.2 }, { id: ID2, szint: "P3", pont: 50, cim: "Második", ora: 0.1 }];
  const r = await keres("push.js", { url: "/api/push?mi=admin_gep", headers: GEP, body: { sorok } });
  assert.strictEqual(r.kod, 200);
  assert.strictEqual(r.adat.eszkoz, 2);
  assert.strictEqual(r.adat.ok, 1);
  assert.strictEqual(r.adat.uj, 2);
  const kuldes = kulso.filter((x) => x.url.includes("fcm.googleapis.com")).map((x) => JSON.parse(x.opt.body).message);
  assert.ok(kuldes.every((m) => m.token && !m.topic), "csak eszköztokenre megy, témára soha");
  assert.ok(kuldes.every((m) => m.data.tema === "admin"));
  assert.match(kuldes[0].data.cim, /2 új hír jóváhagyásra vár, ebből 1 P1/);
  assert.deepStrictEqual([...tar.get("qn:push:admin_tokenek")], [jo]);
  // ugyanazokról a hírekről másodszor (a Macről vagy a felhőből) nem szól; friss hír mellett nem jön emlékeztető sem
  const ujra = await keres("push.js", { url: "/api/push?mi=admin_gep", headers: GEP, body: { sorok } });
  assert.strictEqual(ujra.adat.ok, false, "ugyanazok a hírek kétszer nem mennek ki");
  // az eldöntött hír nem számít függőnek, az új hír egyedül megy ki
  tar.set("qn:jovahagyas", new Map([[ID1, JSON.stringify({ allapot: "jovahagyva" })]]));
  const harmadik = await keres("push.js", { url: "/api/push?mi=admin_gep", headers: GEP, body: { sorok: [...sorok, { id: ID3, szint: "P2", pont: 70, cim: "Harmadik", ora: 0 }] } });
  assert.strictEqual(harmadik.adat.uj, 1);
  assert.strictEqual(harmadik.adat.fuggo, 2);
  // kilépéskor az admin eszközök listája törlődik
  await keres("admin.js", { url: "/api/admin?mi=kilep", headers: s });
  assert.strictEqual(tar.has("qn:push:admin_tokenek"), false);
});

test("admin-emlékeztető: régóta váró P1/P2 hírre 2 óránként egyszer, a P3 miatt nem", async () => {
  ujKv(); const s = await belep();
  await keres("admin.js", { url: "/api/admin?mi=admin_eszkoz", headers: s, body: { token: "j" + "A".repeat(150) } });
  const regi = [{ id: ID1, szint: "P1", pont: 91, cim: "Első", ora: 3 }];
  for (const x of regi) tar.set("qn:push:admin_jel:" + x.id, "1");  // már jelezve volt
  const ora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Budapest", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const r = await keres("push.js", { url: "/api/push?mi=admin_gep", headers: GEP, body: { sorok: regi } });
  if (ora >= 8 && ora < 23) {
    assert.strictEqual(r.adat.emlekezteto, true);
    const m = kulso.filter((x) => x.url.includes("fcm.googleapis.com")).map((x) => JSON.parse(x.opt.body).message).pop();
    assert.match(m.data.cim, /1 hír vár még a jóváhagyásodra/);
    const ujra = await keres("push.js", { url: "/api/push?mi=admin_gep", headers: GEP, body: { sorok: regi } });
    assert.strictEqual(ujra.adat.ok_miert, "nemrég emlékeztetett");
  } else assert.strictEqual(r.adat.ok, false, "éjjel nincs emlékeztető");
  tar.delete("qn:push:admin_emlek");
  const p3 = await keres("push.js", { url: "/api/push?mi=admin_gep", headers: GEP, body: { sorok: [{ id: ID2, szint: "P3", pont: 50, cim: "x", ora: 5 }].map((x) => (tar.set("qn:push:admin_jel:" + x.id, "1"), x)) } });
  assert.strictEqual(p3.adat.ok, false, "P3 miatt nincs emlékeztető");
});

test("pult-pillanatképek kora: csak gépkulccsal, a felhős kör ebből dönt az Ajánlott felülírásáról", async () => {
  ujKv();
  tar.set("qn:pult:posztok", JSON.stringify({ frissitve: "2026-10-22T06:40:00+00:00", sorok: [] }));
  tar.set("qn:pult:prioritas", JSON.stringify({ frissult: "2026-10-22T06:48:30+00:00", sorok: [] }));
  assert.strictEqual((await keres("admin.js", { method: "GET", url: "/api/admin?mi=pult_frissult_gep" })).kod, 401);
  const r = await keres("admin.js", { method: "GET", url: "/api/admin?mi=pult_frissult_gep", headers: GEP });
  assert.strictEqual(r.kod, 200);
  assert.deepStrictEqual(r.adat, { posztok: "2026-10-22T06:40:00+00:00", ajanlott: null, prioritas: "2026-10-22T06:48:30+00:00", koltseg: null });
});

test("üzemi riasztás: csak gépkulccsal, ugyanaz 6 óránként egyszer", async () => {
  ujKv(); process.env.FCM_SZOLGALTATAS = JSON.stringify({ client_email: "a@b", project_id: "p", private_key: require("crypto").generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" }) });
  const s = await belep();
  await keres("admin.js", { url: "/api/admin?mi=admin_eszkoz", headers: s, body: { token: "j" + "A".repeat(150) } });
  assert.ok([401, 403].includes((await keres("push.js", { url: "/api/push?mi=admin_gep", body: { riasztas: "x" } })).kod));
  const r = await keres("push.js", { url: "/api/push?mi=admin_gep", headers: GEP, body: { cim: "quicknews: a gépi kitétel elakadt", riasztas: "A Mac 30 perce nem tud frissülni." } });
  assert.strictEqual(r.adat.riasztas, true);
  assert.strictEqual(r.adat.ok, 1);
  const m = kulso.filter((x) => x.url.includes("fcm.googleapis.com")).map((x) => JSON.parse(x.opt.body).message).pop();
  assert.strictEqual(m.data.tema, "admin");
  assert.match(m.data.cim, /elakadt/);
  const ujra = await keres("push.js", { url: "/api/push?mi=admin_gep", headers: GEP, body: { riasztas: "A Mac 30 perce nem tud frissülni." } });
  assert.strictEqual(ujra.adat.ok_miert, "nemrég szólt");
});
