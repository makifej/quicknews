// A napi hírlevél feliratkozása és leiratkozása (Heni 2026-10-13). A testestudat.hu bevált végpontjának mintája.
//
// POST /api/hirlevel {email}                         -> feliratkozás (a felugró ablakból)
// POST /api/hirlevel {email, muvelet:"leiratkozas"}  -> leiratkozás a /leiratkozas oldalról
// GET  /api/hirlevel?e=<cím>&t=<token>               -> egy kattintásos leiratkozás a levél aljáról
// POST /api/hirlevel?e=<cím>&t=<token>               -> ugyanez a levelezők List-Unsubscribe-Post hívásához
//
// Adatvédelem: a válasz feliratkozásnál és leiratkozásnál is UGYANAZ, attól függetlenül, hogy a cím szerepelt-e
// már a listán, így a végponttal nem lehet kitalálni, ki van feliratkozva. A token a cím HMAC-je az ADMIN_TITOK-kal,
// tehát idegen címet nem lehet vele leiratkoztatni. Tárolás: Upstash, qn:hirlevel hash (cím -> {ido, forras}).
const crypto = require("crypto");
const dns = require("dns").promises;

const KULCS = "qn:hirlevel";
const KORLAT_ABLAK = 3600; // másodperc
const KORLAT_DB = 5;       // ennyi beküldés / IP / ablak

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

// szándékosan szigorúbb a szabványnál: a gyakorlatban előforduló címeket engedi át
const MINTA = /^[^\s@,;:<>()[\]\\"]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
function tisztit(nyers) {
  if (typeof nyers !== "string") return "";
  const e = nyers.trim().toLowerCase();
  if (e.length < 6 || e.length > 254) return "";
  return MINTA.test(e) ? e : "";
}

function token(email) {
  return crypto.createHmac("sha256", process.env.ADMIN_TITOK || "").update("leiratkozas|" + email).digest("hex").slice(0, 32);
}
function tokenJo(email, t) {
  if (!process.env.ADMIN_TITOK || typeof t !== "string" || t.length !== 32) return false;
  const a = Buffer.from(token(email)), b = Buffer.from(t);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const ELDOBHATO = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com", "10minutemail.net",
  "temp-mail.org", "tempmail.com", "tempmail.net", "yopmail.com", "yopmail.net", "trashmail.com", "trashmail.de",
  "getnada.com", "nada.email", "dispostable.com", "maildrop.cc", "throwawaymail.com", "fakeinbox.com", "mailnesia.com",
  "emailondeck.com", "mohmal.com", "tempail.com", "minuteinbox.com", "mintemail.com", "spamgourmet.com", "mailcatch.com",
  "tempr.email", "discard.email", "burnermail.io", "temp-mail.io", "tmpmail.org", "tmpmail.net", "moakt.com",
  "emailfake.com", "mytemp.email",
]);
const NINCS = new Set(["ENOTFOUND", "ENODATA", "ENONAME", "NXDOMAIN"]);
function idokorlat(p, ms) { return Promise.race([p, new Promise((_, n) => setTimeout(() => n(new Error("idokorlat")), ms))]); }
// csak a biztos „nem létezik” utasít el; ha a DNS épp nem válaszol, a címet elfogadjuk
async function domainRendben(domain) {
  if (ELDOBHATO.has(domain)) return "eldobhato";
  try {
    const mx = await idokorlat(dns.resolveMx(domain), 3000);
    if (mx.length) return mx.every((r) => !r.exchange || r.exchange === ".") ? "nem" : "igen";
  } catch (e) { if (!NINCS.has(e.code)) return "igen"; }
  try {
    const a = await idokorlat(dns.resolve4(domain), 3000);
    return a.length ? "igen" : "nem";
  } catch (e) { return NINCS.has(e.code) ? "nem" : "igen"; }
}

function honnan(req) {
  const f = req.headers["x-forwarded-for"];
  return (Array.isArray(f) ? f[0] : String(f || "")).split(",")[0].trim() || "ismeretlen";
}
async function torzs(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body || "{}"); } catch { return {}; } }
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
function oldal(res, kod, cim, szoveg) {
  res.statusCode = kod;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.end(`<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${cim} · quicknews.hu</title>
<style>body{margin:0;background:#181818;color:#f2f2f2;font:17px/1.6 Manrope,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;min-height:100dvh;padding:24px;box-sizing:border-box}
main{max-width:480px}h1{font-size:30px;line-height:36px;margin:0 0 12px}a{color:#ffb224}.logo{font-weight:800;font-size:20px;margin-bottom:32px;display:block;color:#f2f2f2;text-decoration:none}.logo span{color:#ffb224}</style></head>
<body><main><a class="logo" href="/">quicknews<span>.</span>hu</a><h1>${cim}</h1><p>${szoveg}</p><p><a href="/">Vissza a hírekhez</a></p></main></body></html>`);
}

module.exports = async (req, res) => {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN || !process.env.CHAT_SO) return json(res, 503, { hiba: "az adattár nincs beállítva" });
  const url = new URL(req.url, "https://quicknews.hu");
  try {
    // egy kattintásos leiratkozás a levélből (GET a linkre, POST a levelezők List-Unsubscribe-Post hívására)
    if (url.searchParams.has("e")) {
      const email = tisztit(url.searchParams.get("e") || "");
      if (!email || !tokenJo(email, url.searchParams.get("t") || "")) {
        return oldal(res, 400, "Ez a link nem érvényes", 'Ha le szeretnél iratkozni, a <a href="/leiratkozas">leiratkozó oldalon</a> megadhatod a címed.');
      }
      // SEC-024: a GET csak megerősítő gombot mutat (a levelezők előnézete automatikusan megnyitja a linkeket),
      // a tényleges leiratkozás POST (a gombról, vagy a levelezők List-Unsubscribe-Post hívásából)
      if (req.method !== "POST") {
        const akcio = `/api/hirlevel?e=${encodeURIComponent(email)}&t=${encodeURIComponent(url.searchParams.get("t") || "")}`;
        return oldal(res, 200, "Leiratkozás", `Biztosan leiratkozol a napi hírlevélről (${email.replace(/&/g, "&amp;").replace(/</g, "&lt;")})?</p>` +
          `<form method="post" action="${akcio}"><button type="submit" style="font:inherit;font-weight:700;padding:12px 20px;border:0;border-radius:10px;background:#ffb224;color:#181818;cursor:pointer">Leiratkozom</button></form><p>`);
      }
      await kv("HDEL", KULCS, email);
      if (/json/i.test(req.headers.accept || "") || /json/i.test(req.headers["content-type"] || "")) return json(res, 200, { rendben: true });
      return oldal(res, 200, "Leiratkoztál", "Több emlékeztetőt nem küldünk erre a címre. Ha meggondolod magad, a hírek oldalán bármikor újra feliratkozhatsz.");
    }
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return json(res, 405, { hiba: "nem támogatott metódus" }); }
    if (!/^application\/json/i.test(req.headers["content-type"] || "")) return json(res, 415, { hiba: "application/json kell" });

    const b = await torzs(req);
    const email = tisztit(b.email);
    if (!email) return json(res, 400, { rendben: false, uzenet: "Ez a cím nem tűnik érvényesnek." });

    // visszaélés elleni korlát: IP-nként, nem címenként (a cím maga a védendő adat)
    const korlat = "qn:hirlevel:korlat:" + crypto.createHash("sha256").update((process.env.CHAT_SO || "") + "|" + honnan(req)).digest("hex").slice(0, 24);
    const db = await kv("INCR", korlat);
    if (db === 1) await kv("EXPIRE", korlat, KORLAT_ABLAK);
    if (db > KORLAT_DB) return json(res, 429, { rendben: false, uzenet: "Túl sok próbálkozás. Próbáld később." });

    if (b.muvelet === "leiratkozas") {
      await kv("HDEL", KULCS, email);
      return json(res, 200, { rendben: true, uzenet: "Leiratkoztál. Több emlékeztetőt nem küldünk erre a címre." });
    }
    const allapot = await domainRendben(email.split("@")[1]);
    if (allapot === "eldobhato") return json(res, 400, { rendben: false, uzenet: "Egyszer használatos címre nem tudunk írni. Adj meg egy rendes e-mail-címet." });
    if (allapot === "nem") return json(res, 400, { rendben: false, uzenet: "Erre a címre nem lehet levelet küldeni. Nézd meg, nem gépelted-e el." });
    // ha a cím már bent van, a HSETNX nem írja felül, az eredeti időpont marad
    await kv("HSETNX", KULCS, email, JSON.stringify({ ido: new Date().toISOString(), forras: String(b.forras || "popup").slice(0, 20) }));
    return json(res, 200, { rendben: true, uzenet: "Kész, feliratkoztál. A következő reggel 8-kor érkezik az első leveled." });
  } catch (e) {
    return json(res, 502, { hiba: "az adattár nem válaszolt" });
  }
};
module.exports.token = token;
module.exports.tisztit = tisztit;
