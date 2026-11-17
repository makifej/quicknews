// Fizetős útmutatók (Heni 2026-11-17: „990 Ft, Stripe-on keresztül, és csak akkor küldjük ki, ha kifizette!!”).
//
// A vásárlás a Stripe fizetési linkjén megy (api/_utmutatok.json: "fizetos": true, "stripe_link", "stripe_plink").
// A PDF NEM nyilvános: az api/_privat/ mappában van, és csak ez a függvény adja ki, ellenőrzött fizetés után.
//
//   GET  /api/vasarlas?s=<checkout session id>   a köszönőoldal hívja: a Stripe-nál ellenőrzi, hogy kifizették-e;
//                                                 ha igen: teljesítés (egyszer) és a letöltési link a válaszban
//   GET  /api/vasarlas?letolt=<sid>.<aláírás>    a PDF letöltése (aláírt link, csak kifizetett vásárlásra)
//   POST /api/vasarlas                           Stripe webhook (checkout.session.completed), ha a vevő bezárná a lapot
//
// Teljesítés (vásárlásonként egyszer, Upstash SET NX): Billingo-számla (alanyi adómentes, bankkártyás, kifizetett;
// a Billingo e-mailben elküldi), levél a vevőnek a letöltési linkkel, értesítés az info@adverr.hu-ra.
// Környezeti változók: STRIPE_SECRET_KEY (korlátozott: Checkout Sessions olvasás), STRIPE_WEBHOOK_SECRET,
// LETOLT_TITOK, BILLINGO_API_KEY, RESEND_API_KEY, KV_REST_API_URL/TOKEN.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const ANYAGOK = require("./_utmutatok.json");

const FELADO = "quicknews.hu <hirlevel@quicknews.hu>";
const VALASZ = "info@adverr.hu";
const ERTESIT = "info@adverr.hu";
const DOMAIN = "https://quicknews.hu";
const BILLINGO_BLOKK = 53987;
const BILLINGO_BANK = 117230;

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
function json(res, kod, adat) {
  res.statusCode = kod;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(adat));
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const alair = (sid) => crypto.createHmac("sha256", process.env.LETOLT_TITOK).update(sid).digest("hex").slice(0, 32);
const egyezik = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const letoltLink = (sid) => `${DOMAIN}/api/vasarlas?letolt=${encodeURIComponent(sid)}.${alair(sid)}`;

function anyagLinkbol(plink) {
  for (const [azon, a] of Object.entries(ANYAGOK)) if (a.fizetos && a.stripe_plink === plink) return [azon, a];
  return [null, null];
}
async function stripeSession(sid) {
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sid)}`, {
    headers: { Authorization: "Bearer " + process.env.STRIPE_SECRET_KEY },
  });
  if (!r.ok) return null;
  return r.json();
}

// ---- Billingo: partner + kifizetett, alanyi adómentes számla, e-mailben kiküldve
async function billingo(ut, adat) {
  const r = await fetch("https://api.billingo.hu/v3" + ut, {
    method: "POST",
    headers: { "X-API-KEY": process.env.BILLINGO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(adat),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Billingo ${ut} ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
}
async function szamla(s, a) {
  const c = s.customer_details || {};
  const cim = c.address || {};
  const nev = (c.name || "").trim() || c.email;
  const partner = await billingo("/partners", {
    name: nev,
    address: { country_code: cim.country || "HU", post_code: cim.postal_code || "", city: cim.city || "", address: [cim.line1, cim.line2].filter(Boolean).join(" ") },
    emails: [c.email], taxcode: "", tax_type: "NO_TAX_NUMBER",
  });
  const ma = new Date().toISOString().slice(0, 10);
  const doc = await billingo("/documents", {
    partner_id: partner.id, block_id: BILLINGO_BLOKK, bank_account_id: BILLINGO_BANK, type: "invoice",
    fulfillment_date: ma, due_date: ma, payment_method: "bankcard", language: "hu", currency: "HUF",
    electronic: true, paid: true,
    comment: "Fizetve bankkártyával (Stripe). Rendelés: " + s.id,
    items: [{ name: a.termek_nev || a.anyag, unit_price: Math.round((s.amount_total || 0) / 100), unit_price_type: "gross", quantity: 1, unit: "db", vat: "AM" }],
  });
  try { await billingo(`/documents/${doc.id}/send`, { emails: [c.email] }); } catch (e) { /* a számla megvan, a kiküldés a pultból pótolható */ }
  return doc.invoice_number || String(doc.id);
}

// ---- levelek
async function level(to, subject, html, text) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FELADO, to: [to], reply_to: VALASZ, subject, html, text }),
  });
  return r.ok;
}
function vevoLevel(a, link) {
  const html = `<!doctype html><html lang="hu"><body style="margin:0;padding:0;background:#181818">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;font:16px/1.6 Manrope,Arial,sans-serif;color:#f2f2f2;background:#181818">
<p style="margin:0 0 32px;font-weight:800;font-size:20px">quick<span style="color:#ffb224">news</span>.hu</p>
<p style="margin:0 0 8px;color:#ffb224;font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase">Gyakorlati útmutató</p>
<h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:800">${esc(a.anyag)}</h1>
<p style="margin:0 0 16px">Szia! Köszönjük a vásárlást. Itt a letöltési linked, ez a te személyes linked, kérjük, ne oszd meg.</p>
<p style="margin:0 0 32px"><a href="${esc(link)}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:#ffb224;color:#141414;font-weight:800;text-decoration:none">Letöltöm az útmutatót (PDF)</a></p>
<p style="margin:0 0 16px">A számlát külön levélben küldjük. Ha elakadsz, válaszolj erre a levélre nyugodtan.</p>
<p style="margin:0 0 16px;font-size:13px;color:#8a8a8a">Visszaigazoljuk: a vásárláskor kifejezetten kérted, hogy az útmutatót azonnal elérhetővé tegyük, és tudomásul vetted, hogy a teljesítés megkezdésével elveszíted az elállási jogodat (45/2014. (II. 26.) Korm. rendelet 29. § (1) m) pont). A vásárlás feltételei: <a href="https://quicknews.hu/aszf" style="color:#bdbdbd">quicknews.hu/aszf</a>.</p>
<p style="margin:32px 0 0;font-size:13px;color:#8a8a8a">Még több AI-eszköz és hír: <a href="https://quicknews.hu" style="color:#bdbdbd">quicknews.hu</a></p>
</div></body></html>`;
  const text = ["Szia! Köszönjük a vásárlást. Itt a letöltési linked (személyes, kérjük, ne oszd meg):", "", a.anyag, link, "",
    "A számlát külön levélben küldjük. Ha elakadsz, válaszolj erre a levélre nyugodtan.", "",
    "Visszaigazoljuk: a vásárláskor kifejezetten kérted, hogy az útmutatót azonnal elérhetővé tegyük, és tudomásul vetted, hogy a teljesítés megkezdésével elveszíted az elállási jogodat (45/2014. (II. 26.) Korm. rendelet 29. § (1) m) pont). A vásárlás feltételei: https://quicknews.hu/aszf", "", "quicknews.hu"].join("\n");
  return [html, text];
}

// ---- teljesítés: vásárlásonként pontosan egyszer
async function teljesit(s) {
  if (!s || s.payment_status !== "paid" || s.status !== "complete") return { fizetve: false };
  const [azon, a] = anyagLinkbol(s.payment_link);
  if (!a) return { fizetve: true, hiba: "ismeretlen termék" };
  const kulcs = "qn:vasarlas:" + s.id;
  const email = (s.customer_details || {}).email || "";
  const uj = await kv("SET", kulcs, JSON.stringify({ anyag: azon, email, nev: (s.customer_details || {}).name || "", osszeg: s.amount_total, ido: new Date().toISOString() }), "NX");
  const link = letoltLink(s.id);
  if (uj === "OK") {
    let szamlaszam = "", hiba = "";
    try { szamlaszam = await szamla(s, a); } catch (e) { hiba = String(e.message || e); }
    const [html, text] = vevoLevel(a, link);
    const ment = email ? await level(email, "Itt a megvásárolt útmutató: " + a.cim, html, text) : false;
    await kv("HSET", "qn:vasarlasok", s.id, JSON.stringify({ anyag: azon, email, szamla: szamlaszam, szamla_hiba: hiba, level: ment, ido: new Date().toISOString() }));
    await level(ERTESIT, `Új vásárlás: ${a.cim} (${Math.round((s.amount_total || 0) / 100)} Ft)`,
      `<p>Vevő: ${esc(email)}<br>Termék: ${esc(a.anyag)}<br>Számla: ${esc(szamlaszam || "HIBA: " + hiba)}<br>Levél a vevőnek: ${ment ? "elküldve" : "NEM ment ki"}</p>`,
      `Vevő: ${email}\nTermék: ${a.anyag}\nSzámla: ${szamlaszam || "HIBA: " + hiba}\nLevél a vevőnek: ${ment ? "elküldve" : "NEM ment ki"}`);
  }
  return { fizetve: true, letolt: link, cim: a.cim };
}

async function nyers(req) {
  const d = [];
  for await (const c of req) d.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(d).toString("utf8");
}
function webhookRendben(test, fejlec) {
  const titok = process.env.STRIPE_WEBHOOK_SECRET;
  if (!titok || !fejlec) return false;
  const r = Object.fromEntries(String(fejlec).split(",").map((x) => x.split("=")).map(([k, v]) => [k, v]));
  const ts = Number(r.t);
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 600) return false;
  const vart = crypto.createHmac("sha256", titok).update(`${r.t}.${test}`).digest("hex");
  return String(fejlec).split(",").some((x) => x.startsWith("v1=") && egyezik(x.slice(3), vart));
}

module.exports = async (req, res) => {
  const env = process.env;
  if (!env.KV_REST_API_URL || !env.STRIPE_SECRET_KEY || !env.LETOLT_TITOK || !env.RESEND_API_KEY) return json(res, 503, { hiba: "a vásárlás nincs beállítva" });
  try {
    const u = new URL(req.url, DOMAIN);
    if (req.method === "POST") {
      const test = await nyers(req);
      if (!webhookRendben(test, req.headers["stripe-signature"])) return json(res, 400, { hiba: "érvénytelen aláírás" });
      const e = JSON.parse(test);
      // az előfizetés eseményei ugyanide jönnek (egy végpont, egy titok), azokat az elofizetes.js kezeli
      if (e.type === "invoice.paid" || e.type.startsWith("customer.subscription.")) {
        await require("./elofizetes").webhook(e);
        return json(res, 200, { rendben: true });
      }
      if (e.type === "checkout.session.completed" || e.type === "checkout.session.async_payment_succeeded") {
        // a webhook tartalmában nem bízunk vakon: a Stripe-tól kérjük le újra
        await teljesit(await stripeSession(e.data.object.id));
      }
      return json(res, 200, { rendben: true });
    }
    if (req.method !== "GET") { res.setHeader("Allow", "GET, POST"); return json(res, 405, { hiba: "nem támogatott metódus" }); }

    const lt = u.searchParams.get("letolt");
    if (lt) {
      const i = lt.lastIndexOf(".");
      const sid = lt.slice(0, i), al = lt.slice(i + 1);
      if (i < 1 || !egyezik(al, alair(sid))) { res.statusCode = 403; return res.end("Érvénytelen letöltési link."); }
      const rec = await kv("GET", "qn:vasarlas:" + sid);
      if (!rec) { res.statusCode = 404; return res.end("Ehhez a linkhez nem tartozik kifizetett vásárlás."); }
      const a = ANYAGOK[JSON.parse(rec).anyag];
      const fajl = path.join(__dirname, "_privat", path.basename(a.privat_pdf));
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(a.privat_pdf)}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Robots-Tag", "noindex");
      return res.end(fs.readFileSync(fajl));
    }

    const sid = u.searchParams.get("s") || "";
    if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sid)) return json(res, 400, { hiba: "hiányzó vagy hibás rendelésazonosító" });
    const eredm = await teljesit(await stripeSession(sid));
    return json(res, eredm.fizetve ? 200 : 402, eredm);
  } catch (e) {
    return json(res, 500, { hiba: "átmeneti hiba, próbáld újra pár másodperc múlva" });
  }
};
