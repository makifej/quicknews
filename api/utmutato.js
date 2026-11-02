// Videós útmutató-kérés (Heni 2026-11-02): a cikkek oldalsávjában lévő videóra kattintva a látogató megadja az e-mail-címét,
// és mi elküldjük neki a videóhoz tartozó gyakorlati útmutatót. Ugyanaz a mintája, mint a TikTokon a „kommenteld, hogy VIDEÓ”.
//
// POST /api/utmutato {email, anyag, hirlevel, cikk}
//
// A kérések KÜLÖN listán vannak (Upstash qn:utmutato hash: "<cím>|<anyag>" -> {email, anyag, ido, hirlevel, cikk, kuldve}),
// Heni kérésére, hogy a pultban lássa, ki melyik videóhoz kérte az útmutatót. A hírlevél külön választás: csak akkor kerül
// a cím a qn:hirlevel listára is (forras: "video"), ha a látogató azt választotta; ha már ott volt, az eredeti feliratkozása
// marad. A videók és az anyagok listája az api/_utmutatok.json (a render.py is ebből rajzolja a dobozt).
// A válasz akkor is ugyanaz, ha a cím már kérte az anyagot, így a végponttal nem lehet kitalálni, ki van a listán.
const crypto = require("crypto");
const { tisztit, domainRendben, token } = require("./hirlevel.js");
const ANYAGOK = require("./_utmutatok.json");

const KULCS = "qn:utmutato";
const HL = "qn:hirlevel";
const KORLAT_ABLAK = 3600;
const KORLAT_DB = 5;
const FELADO = "quicknews.hu <hirlevel@quicknews.hu>";
const VALASZ = "info@adverr.hu";

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
function honnan(req) {
  const f = req.headers["x-forwarded-for"];
  return (Array.isArray(f) ? f[0] : String(f || "")).split(",")[0].trim() || "ismeretlen";
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function levelHtml(a, hirlevel, leir) {
  const hl = hirlevel
    ? `<p style="margin:0 0 16px">Feliratkoztál a napi AI-hírlevelünkre is: minden reggel 8-kor összeszedjük, ami előző nap az AI világában számított.</p>`
    : `<p style="margin:0 0 16px">Ezt a levelet azért kaptad, mert a quicknews.hu-n erre a címre kérted az útmutatót. Hírlevelet nem küldünk, csak ha külön feliratkozol.</p>`;
  return `<!doctype html><html lang="hu"><body style="margin:0;padding:0;background:#181818">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;font:16px/1.6 Manrope,Arial,sans-serif;color:#f2f2f2;background:#181818">
<p style="margin:0 0 32px;font-weight:800;font-size:20px">quick<span style="color:#ffb224">news</span>.hu</p>
<p style="margin:0 0 8px;color:#ffb224;font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase">Gyakorlati útmutató</p>
<h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:800">${esc(a.anyag)}</h1>
<p style="margin:0 0 16px">Szia! Köszönjük, hogy megnézted a videónkat. Itt az ígért útmutató.</p>
<p style="margin:0 0 24px;color:#bdbdbd">${esc(a.anyag_leiras)}</p>
<p style="margin:0 0 32px"><a href="${esc(a.pdf)}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:#ffb224;color:#141414;font-weight:800;text-decoration:none">Letöltöm az útmutatót (PDF)</a></p>
${hl}
<p style="margin:0 0 16px">Ha elakadsz, válaszolj erre a levélre nyugodtan.</p>
<p style="margin:32px 0 0;font-size:13px;color:#8a8a8a">Még több AI-eszköz és hír: <a href="https://quicknews.hu" style="color:#bdbdbd">quicknews.hu</a>${leir ? ` · <a href="${esc(leir)}" style="color:#bdbdbd">Leiratkozás a hírlevélről</a>` : ""}</p>
</div></body></html>`;
}
function levelSzoveg(a, hirlevel, leir) {
  return [
    "Szia! Köszönjük, hogy megnézted a videónkat. Itt az ígért útmutató:", "",
    a.anyag, a.anyag_leiras, "", "Letöltés (PDF): " + a.pdf, "",
    hirlevel ? "Feliratkoztál a napi AI-hírlevelünkre is: minden reggel 8-kor érkezik."
      : "Ezt a levelet azért kaptad, mert a quicknews.hu-n erre a címre kérted az útmutatót. Hírlevelet nem küldünk, csak ha külön feliratkozol.",
    "", "Ha elakadsz, válaszolj erre a levélre nyugodtan.", "", "quicknews.hu",
  ].concat(leir ? ["Leiratkozás a hírlevélről: " + leir] : []).join("\n");
}
async function kuld(email, a, hirlevel) {
  const leir = hirlevel && process.env.HIRLEVEL_TITOK
    ? `https://quicknews.hu/api/hirlevel?e=${encodeURIComponent(email)}&t=${token(email, process.env.HIRLEVEL_TITOK)}` : "";
  const level = { from: FELADO, to: [email], reply_to: VALASZ, subject: "Itt az útmutató: " + a.cim,
    html: levelHtml(a, hirlevel, leir), text: levelSzoveg(a, hirlevel, leir) };
  if (leir) level.headers = { "List-Unsubscribe": `<${leir}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(level),
  });
  return r.ok;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return json(res, 405, { hiba: "nem támogatott metódus" }); }
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN || !process.env.CHAT_SO || !process.env.RESEND_API_KEY) return json(res, 503, { hiba: "a szolgáltatás nincs beállítva" });
  if (!/^application\/json/i.test(req.headers["content-type"] || "")) return json(res, 415, { hiba: "application/json kell" });
  try {
    const b = await torzs(req);
    const azon = String(b.anyag || "");
    const a = Object.prototype.hasOwnProperty.call(ANYAGOK, azon) ? ANYAGOK[azon] : null;
    if (!a || !a.aktiv) return json(res, 400, { rendben: false, uzenet: "Ez az útmutató már nem kérhető." });
    const email = tisztit(b.email);
    if (!email) return json(res, 400, { rendben: false, uzenet: "Ez a cím nem tűnik érvényesnek." });

    const korlat = "qn:utmutato:korlat:" + crypto.createHash("sha256").update((process.env.CHAT_SO || "") + "|" + honnan(req)).digest("hex").slice(0, 24);
    const db = await kv("INCR", korlat);
    if (db === 1) await kv("EXPIRE", korlat, KORLAT_ABLAK);
    if (db > KORLAT_DB) return json(res, 429, { rendben: false, uzenet: "Túl sok próbálkozás. Próbáld később." });

    const allapot = await domainRendben(email.split("@")[1]);
    if (allapot === "eldobhato") return json(res, 400, { rendben: false, uzenet: "Egyszer használatos címre nem tudunk írni. Adj meg egy rendes e-mail-címet." });
    if (allapot === "nem") return json(res, 400, { rendben: false, uzenet: "Erre a címre nem lehet levelet küldeni. Nézd meg, nem gépelted-e el." });

    const ido = new Date().toISOString();
    const hirlevel = b.hirlevel === true;
    const cikk = String(b.cikk || "").replace(/[^a-z0-9-]/g, "").slice(0, 120);
    if (hirlevel) await kv("HSETNX", HL, email, JSON.stringify({ ido, forras: "video" }));
    const kuldve = await kuld(email, a, hirlevel).catch(() => false);
    // ugyanarra a videóra ismételt kérésnél a legutóbbi kérés adatai maradnak (újra kiküldjük az anyagot)
    await kv("HSET", KULCS, email + "|" + azon, JSON.stringify({ email, anyag: azon, ido, hirlevel, cikk, kuldve }));
    if (!kuldve) return json(res, 502, { rendben: false, uzenet: "A levelet most nem sikerült elküldeni. Próbáld újra pár perc múlva." });
    return json(res, 200, { rendben: true, uzenet: hirlevel
      ? "Elküldtük az útmutatót. Nézd meg a postafiókod (a Promóciók mappát is). A hírlevél reggel 8-kor érkezik."
      : "Elküldtük az útmutatót. Nézd meg a postafiókod (a Promóciók mappát is)." });
  } catch (e) {
    return json(res, 502, { hiba: "az adattár nem válaszolt" });
  }
};
