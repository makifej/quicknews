// Hirdetés-banner kattintásszámláló (Heni 2026-11-16: „mérjük GA4-ben mindenhol, hányan kattintottak”).
// /api/hirdetes?h=<hirdetés>&hely=<web-asztali|web-mobil|app> → számol, majd átirányít a hirdető oldalára.
// Upstash: qn:hird:<h> (összesen), qn:hird:<h>:hely (helyenként), qn:hird:<h>:nap (naponként).
// GA4: a weben a böngésző küldi (gtag, hozzájárulással); az appból ide jön a kattintás, és ha van GA4_API_SECRET,
// Measurement Protocollal megy a GA4-be ugyanazzal az eseménynévvel (hirdetes_kattintas).
const HIRDETESEK = {
  "boo-nyertes-tudatos-ember": "https://ai.budalaszlo.hu/landing/aikonyv/quicknews",
  // Heni 2026-11-23: az Adverr applikációfejlesztés hirdetése a cikkoldalakon, a „Miért számít” doboz helyén
  "adverr-app": "https://adverr.hu/sajat_fejlesztesu_alkalmazasok",
};
const HELYEK = ["web-asztali", "web-mobil", "app", "web-cikk"];
const GA_ID = "G-MXSE5QFHHY";

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

function budapestNap() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

module.exports = async (req, res) => {
  const u = new URL(req.url, "https://quicknews.hu");
  const h = u.searchParams.get("h") || "";
  const cel = HIRDETESEK[h];
  if (!cel) { res.statusCode = 404; res.end("nincs ilyen hirdetés"); return; }
  const hely = HELYEK.includes(u.searchParams.get("hely")) ? u.searchParams.get("hely") : "ismeretlen";
  if (req.method === "GET") {
    try {
      await kv("INCR", `qn:hird:${h}`);
      await kv("HINCRBY", `qn:hird:${h}:hely`, hely, 1);
      await kv("HINCRBY", `qn:hird:${h}:nap`, budapestNap(), 1);
    } catch (e) { /* a számláló elakadása ne akadályozza az átirányítást */ }
    if (hely === "app" && process.env.GA4_API_SECRET) {
      try {
        await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${GA_ID}&api_secret=${process.env.GA4_API_SECRET}`, {
          method: "POST",
          body: JSON.stringify({ client_id: `app.${Date.now()}.${Math.floor(Math.random() * 1e9)}`,
            events: [{ name: "hirdetes_kattintas", params: { hirdetes: h, hely } }] }),
        });
      } catch (e) { /* GA-hiba ne akadályozza az átirányítást */ }
    }
  }
  res.statusCode = 302;
  res.setHeader("Location", cel);
  res.setHeader("Cache-Control", "no-store");
  res.end();
};
