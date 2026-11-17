// Elemzések előfizetés (Heni 2026-11-17): havi 1490 Ft vagy évi 6990 Ft, Stripe, regisztráció nélkül.
// Az elemzés eleje nyilvános, a folytatás az api/_privat/elemzes/<slug>.html fájlban van (git-crypttel titkosítva),
// és csak ez a függvény adja ki: előfizetőnek, vagy eszközönként havonta 1 ingyenes elemzésre.
//
//   GET  ?mi=tartalom&slug=<slug>[&ingyen=1]  a zárolt rész; 402: {ingyen: true|false} ha nincs jogosultság
//   GET  ?mi=kesz&s=<checkout session>        a /elofizetes oldal hívja fizetés után: ellenőrzi és beállítja a sütit
//   GET  ?mi=allapot                          {elofizeto, eddig, email}
//   POST ?mi=kod   {email}                    belépőkód e-mailben (másik eszközre, az appra)
//   POST ?mi=belep {email, kod}               a kóddal beállítja a sütit
//   GET  ?mi=kilep
// A Stripe webhookot az api/vasarlas.js fogadja (egy végpont, egy titok), és a webhook() függvénynek adja tovább:
// invoice.paid (Billingo-számla, meghosszabbítás), customer.subscription.updated/deleted (lemondás, lejárat).
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DOMAIN = "https://quicknews.hu";
const FELADO = "quicknews.hu <hirlevel@quicknews.hu>";
const VALASZ = "info@adverr.hu";
const ERTESIT = "info@adverr.hu";
const BILLINGO_BLOKK = 53987;
const BILLINGO_BANK = 117230;
const PORTAL = "https://billing.stripe.com/p/login/cNi3cufFkbup5v19iacjS00";
const LINKEK = { plink_1Ucnr0Byok11zf2FDIn92ryJ: "havi", plink_1Ucnr2Byok11zf2FARBOfpL0: "eves" };
const ARAK = { price_1UcnngByok11zf2FdRZSRLMx: "havi", price_1UcnqqByok11zf2FGxZnh8DV: "eves" };
const TERV_NEV = { havi: "quicknews.hu elemzések, havi előfizetés", eves: "quicknews.hu elemzések, éves előfizetés" };
const EV = 400 * 86400;

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
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.end(JSON.stringify(adat));
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const alair = (x) => crypto.createHmac("sha256", process.env.LETOLT_TITOK).update("elo|" + x).digest("hex").slice(0, 32);
const egyezik = (a, b) => typeof a === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const most = () => Math.floor(Date.now() / 1000);
const honap = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 7); // magyar idő szerint elég pontos
const normEmail = (e) => String(e || "").trim().toLowerCase();

function sutik(req) {
  const o = {};
  for (const r of String(req.headers.cookie || "").split(";")) {
    const i = r.indexOf("=");
    if (i > 0) o[r.slice(0, i).trim()] = decodeURIComponent(r.slice(i + 1).trim());
  }
  return o;
}
function sutiAd(res, nev, ertek, kor) {
  const regi = res.getHeader("Set-Cookie") || [];
  res.setHeader("Set-Cookie", [].concat(regi, `${nev}=${encodeURIComponent(ertek)}; Path=/; Max-Age=${kor}; HttpOnly; Secure; SameSite=Lax`));
}
const alairt = (ertek) => `${ertek}.${alair(ertek)}`;
function ellenoriz(suti) {
  const i = String(suti || "").lastIndexOf(".");
  if (i < 1) return null;
  const ertek = suti.slice(0, i);
  return egyezik(suti.slice(i + 1), alair(ertek)) ? ertek : null;
}

// ---- az előfizetés állapota: qn:elo:<sub> = {email, nev, terv, eddig, allapot}
async function elo(sub) {
  const r = sub && (await kv("GET", "qn:elo:" + sub));
  return r ? JSON.parse(r) : null;
}
async function eloMent(sub, uj) {
  const regi = (await elo(sub)) || {};
  const adat = { ...regi, ...Object.fromEntries(Object.entries(uj).filter(([, v]) => v !== undefined && v !== "")) };
  await kv("SET", "qn:elo:" + sub, JSON.stringify(adat));
  if (adat.email) await kv("SET", "qn:elo:email:" + normEmail(adat.email), sub);
  return adat;
}
// a lemondott előfizetés a kifizetett időszak végéig él; késedelmes fizetésnél 3 nap türelmi idő
const ervenyes = (a) => !!a && ["active", "trialing", "past_due"].includes(a.allapot || "active") && (a.eddig || 0) + 3 * 86400 > most();

async function stripeSession(sid) {
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sid)}`, {
    headers: { Authorization: "Bearer " + process.env.STRIPE_SECRET_KEY },
  });
  return r.ok ? r.json() : null;
}

async function level(to, subject, html, text) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FELADO, to: [to], reply_to: VALASZ, subject, html, text }),
  });
  return r.ok;
}
function keret(belso) {
  return `<!doctype html><html lang="hu"><body style="margin:0;padding:0;background:#181818">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;font:16px/1.6 Manrope,Arial,sans-serif;color:#f2f2f2;background:#181818">
<p style="margin:0 0 32px;font-weight:800;font-size:20px">quick<span style="color:#ffb224">news</span>.hu</p>${belso}
<p style="margin:32px 0 0;font-size:13px;color:#8a8a8a">Kérdésed van? Válaszolj erre a levélre nyugodtan.</p></div></body></html>`;
}
function udvLevel(terv) {
  const html = keret(`<p style="margin:0 0 8px;color:#ffb224;font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase">Előfizetés</p>
<h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:800">Köszönjük, az elemzések már olvashatók</h1>
<p style="margin:0 0 16px">Szia! Az előfizetésed (${terv === "eves" ? "éves, 6990 Ft" : "havi, 1490 Ft"}) elindult. Azon az eszközön, ahol fizettél, minden elemzést azonnal elolvashatsz.</p>
<div style="margin:0 0 16px;padding:14px 18px;background:#232323;border-left:4px solid #ffb224">
<p style="margin:0 0 8px"><strong>Másik eszközön vagy az appban:</strong> nyiss meg egy elemzést, koppints a <strong>Belépés e-mail-kóddal</strong> gombra, és add meg ezt az e-mail-címet. Küldünk egy 6 jegyű kódot.</p>
<p style="margin:0"><strong>Lemondás, számlák, kártyacsere:</strong> <a href="${PORTAL}" style="color:#ffb224">az előfizetésed kezelése</a>. Lemondás után a kifizetett időszak végéig olvashatsz.</p></div>
<p style="margin:0 0 16px">A számlát külön levélben küldjük.</p>
<p style="margin:0;font-size:13px;color:#8a8a8a">Visszaigazoljuk: az előfizetéskor kifejezetten kérted, hogy a szolgáltatás azonnal induljon, és tudomásul vetted, hogy ezzel elveszíted az elállási jogodat (45/2014. (II. 26.) Korm. rendelet 29. § (1) a) és m) pont). A feltételek: <a href="${DOMAIN}/aszf" style="color:#bdbdbd">quicknews.hu/aszf</a>.</p>`);
  const text = `Szia! Az előfizetésed elindult, az elemzések olvashatók.\n\nMásik eszközön vagy az appban: nyiss meg egy elemzést, koppints a „Belépés e-mail-kóddal” gombra, és add meg ezt az e-mail-címet.\n\nLemondás, számlák, kártyacsere: ${PORTAL}\nLemondás után a kifizetett időszak végéig olvashatsz.\n\nVisszaigazoljuk: kifejezetten kérted, hogy a szolgáltatás azonnal induljon, és tudomásul vetted, hogy ezzel elveszíted az elállási jogodat. Feltételek: ${DOMAIN}/aszf`;
  return [html, text];
}

// ---- Billingo: minden kifizetett Stripe-számlához egy kifizetett, alanyi adómentes számla (az első és a megújítások is)
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
async function szamla(inv, terv) {
  const cim = inv.customer_address || {};
  const email = inv.customer_email;
  const partner = await billingo("/partners", {
    name: (inv.customer_name || "").trim() || email,
    address: { country_code: cim.country || "HU", post_code: cim.postal_code || "", city: cim.city || "", address: [cim.line1, cim.line2].filter(Boolean).join(" ") },
    emails: [email], taxcode: "", tax_type: "NO_TAX_NUMBER",
  });
  const ma = new Date().toISOString().slice(0, 10);
  const doc = await billingo("/documents", {
    partner_id: partner.id, block_id: BILLINGO_BLOKK, bank_account_id: BILLINGO_BANK, type: "invoice",
    fulfillment_date: ma, due_date: ma, payment_method: "bankcard", language: "hu", currency: "HUF",
    electronic: true, paid: true, comment: "Fizetve bankkártyával (Stripe). Számla: " + inv.id,
    items: [{ name: TERV_NEV[terv], unit_price: Math.round((inv.amount_paid || 0) / 100), unit_price_type: "gross", quantity: 1, unit: "db", vat: "AM" }],
  });
  try { await billingo(`/documents/${doc.id}/send`, { emails: [email] }); } catch (e) { /* a számla megvan, a kiküldés pótolható */ }
  return doc.invoice_number || String(doc.id);
}

// a Stripe API-verziótól függően máshol van az előfizetés és az ár azonosítója, ezért mindkét helyet nézzük
const invSub = (inv) => inv.subscription || ((inv.parent || {}).subscription_details || {}).subscription || "";
function invTerv(inv) {
  for (const l of (inv.lines || {}).data || []) {
    const ar = (l.price || {}).id || (((l.pricing || {}).price_details) || {}).price;
    if (ARAK[ar]) return ARAK[ar];
  }
  return { 149000: "havi", 699000: "eves" }[inv.amount_paid] || null;
}

async function webhook(e) {
  const o = e.data.object;
  if (e.type === "invoice.paid") {
    const terv = invTerv(o), sub = invSub(o);
    if (!terv || !sub) return;
    const vege = Math.max(0, ...((o.lines || {}).data || []).map((l) => (l.period || {}).end || 0));
    const a = await eloMent(sub, { email: normEmail(o.customer_email), nev: o.customer_name, terv, eddig: vege || undefined, allapot: "active" });
    if ((await kv("SET", "qn:elo:szamla:" + o.id, "1", "NX")) !== "OK") return;
    let szamlaszam = "", hiba = "";
    try { szamlaszam = await szamla(o, terv); } catch (x) { hiba = String(x.message || x); }
    await kv("HSET", "qn:elofizetesek", o.id, JSON.stringify({ sub, email: a.email, terv, osszeg: o.amount_paid, szamla: szamlaszam, szamla_hiba: hiba, ido: new Date().toISOString() }));
    await level(ERTESIT, `Előfizetés fizetve: ${terv === "eves" ? "éves" : "havi"} (${Math.round((o.amount_paid || 0) / 100)} Ft)`,
      `<p>Előfizető: ${esc(a.email)}<br>Számla: ${esc(szamlaszam || "HIBA: " + hiba)}<br>Ok: ${esc(o.billing_reason)}</p>`,
      `Előfizető: ${a.email}\nSzámla: ${szamlaszam || "HIBA: " + hiba}\nOk: ${o.billing_reason}`);
  } else if (e.type === "customer.subscription.updated" || e.type === "customer.subscription.deleted") {
    const regi = await elo(o.id);
    if (!regi) return; // nem a mi előfizetésünk, vagy az invoice.paid még nem jött meg
    const vege = o.current_period_end || Math.max(0, ...((o.items || {}).data || []).map((i) => i.current_period_end || 0));
    await eloMent(o.id, { allapot: o.status, eddig: vege || undefined, lemondva: !!o.cancel_at_period_end });
  }
}

async function nyersTest(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const d = [];
  for await (const c of req) d.push(typeof c === "string" ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(d).toString("utf8") || "{}"); } catch (e) { return {}; }
}

async function jogosult(req) {
  const sub = ellenoriz(sutik(req).qn_elo);
  const a = sub ? await elo(sub) : null;
  return ervenyes(a) ? a : null;
}

module.exports = async (req, res) => {
  const env = process.env;
  if (!env.KV_REST_API_URL || !env.STRIPE_SECRET_KEY || !env.LETOLT_TITOK || !env.RESEND_API_KEY) return json(res, 503, { hiba: "az előfizetés nincs beállítva" });
  try {
    const u = new URL(req.url, DOMAIN);
    const mi = u.searchParams.get("mi") || "";

    if (mi === "tartalom") {
      const slug = u.searchParams.get("slug") || "";
      if (!/^[a-z0-9-]{3,120}$/.test(slug)) return json(res, 400, { hiba: "hibás elemzés" });
      const fajl = path.join(__dirname, "_privat", "elemzes", slug + ".html");
      if (!fs.existsSync(fajl)) return json(res, 404, { hiba: "nincs ilyen elemzés" });
      const ad = () => json(res, 200, { html: fs.readFileSync(fajl, "utf8") });
      if (await jogosult(req)) return ad();
      const ingy = ellenoriz(sutik(req).qn_ingyen);
      const [ho, islug] = ingy ? [ingy.slice(0, 7), ingy.slice(8)] : ["", ""];
      if (ho === honap() && islug === slug) return ad();
      if (ho === honap()) return json(res, 402, { ingyen: false });
      if (u.searchParams.get("ingyen") === "1") {
        sutiAd(res, "qn_ingyen", alairt(`${honap()}.${slug}`), 40 * 86400);
        return ad();
      }
      return json(res, 402, { ingyen: true });
    }

    if (mi === "kesz") {
      const sid = u.searchParams.get("s") || "";
      if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sid)) return json(res, 400, { hiba: "hibás rendelésazonosító" });
      const s = await stripeSession(sid);
      const terv = s && LINKEK[s.payment_link];
      if (!s || !terv || s.status !== "complete" || !s.subscription || most() - (s.created || 0) > 86400) return json(res, 402, { hiba: "a fizetés még nem zárult le" });
      const sub = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
      const email = normEmail((s.customer_details || {}).email);
      const regi = await elo(sub);
      // az invoice.paid webhook pontosítja az időszak végét; addig a tervből számolunk
      await eloMent(sub, { email, nev: (s.customer_details || {}).name, terv, eddig: (regi && regi.eddig) || most() + (terv === "eves" ? 367 : 32) * 86400, allapot: (regi && regi.allapot) || "active" });
      sutiAd(res, "qn_elo", alairt(sub), EV);
      if (email && (await kv("SET", "qn:elo:udv:" + sub, "1", "NX")) === "OK") {
        const [html, text] = udvLevel(terv);
        await level(email, "Elindult a quicknews.hu előfizetésed", html, text);
      }
      return json(res, 200, { rendben: true, email, terv });
    }

    if (mi === "allapot") {
      const a = await jogosult(req);
      return json(res, 200, a ? { elofizeto: true, eddig: a.eddig, email: a.email, lemondva: !!a.lemondva, kezeles: PORTAL } : { elofizeto: false, kezeles: PORTAL });
    }

    if (mi === "kilep") {
      sutiAd(res, "qn_elo", "", 0);
      return json(res, 200, { rendben: true });
    }

    if (req.method === "POST" && (mi === "kod" || mi === "belep")) {
      const b = await nyersTest(req);
      const email = normEmail(b.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return json(res, 400, { hiba: "Adj meg egy érvényes e-mail-címet." });
      if (mi === "kod") {
        // óránként legfeljebb 5 kód egy címre; nem áruljuk el, van-e ilyen előfizető
        const db = await kv("INCR", "qn:elo:kodszam:" + email);
        if (db === 1) await kv("EXPIRE", "qn:elo:kodszam:" + email, 3600);
        const sub = await kv("GET", "qn:elo:email:" + email);
        if (db <= 5 && sub && ervenyes(await elo(sub))) {
          const kod = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
          await kv("SET", "qn:elo:kod:" + email, JSON.stringify({ kod, probak: 0 }), "EX", 900);
          await level(email, `Belépőkód: ${kod}`,
            keret(`<p style="margin:0 0 16px">Szia! A quicknews.hu elemzésekhez ezzel a kóddal tudsz belépni:</p><p style="margin:0 0 16px;font-size:32px;font-weight:800;letter-spacing:.2em;color:#ffb224">${kod}</p><p style="margin:0;color:#bdbdbd">A kód 15 percig érvényes. Ha nem te kérted, nyugodtan hagyd figyelmen kívül ezt a levelet.</p>`),
            `A quicknews.hu belépőkódod: ${kod}\nA kód 15 percig érvényes. Ha nem te kérted, hagyd figyelmen kívül.`);
        }
        return json(res, 200, { rendben: true });
      }
      const r = await kv("GET", "qn:elo:kod:" + email);
      const k = r && JSON.parse(r);
      if (!k || k.probak >= 5) return json(res, 400, { hiba: "A kód lejárt. Kérj újat." });
      if (!egyezik(String(b.kod || "").replace(/\D/g, ""), k.kod)) {
        await kv("SET", "qn:elo:kod:" + email, JSON.stringify({ ...k, probak: k.probak + 1 }), "KEEPTTL");
        return json(res, 400, { hiba: "Ez a kód nem jó. Nézd meg újra a levélben." });
      }
      await kv("DEL", "qn:elo:kod:" + email);
      const sub = await kv("GET", "qn:elo:email:" + email);
      sutiAd(res, "qn_elo", alairt(sub), EV);
      return json(res, 200, { rendben: true });
    }

    return json(res, 400, { hiba: "ismeretlen kérés" });
  } catch (e) {
    return json(res, 500, { hiba: "átmeneti hiba, próbáld újra pár másodperc múlva" });
  }
};
module.exports.webhook = webhook;
module.exports._teszt = { ervenyes, invTerv, invSub, ellenoriz, alairt };
