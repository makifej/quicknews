// APK letöltés-számláló (Heni kérte 2026-11-14): a /api/apk átírányít a legfrissebb quicknews APK-ra
// és megszámolja a letöltéseket. Tárolás a Upstash-tárolóban: qn:apk_letoltes (összesen) és
// qn:apk_letoltes_nap (naponként, Europe/Budapest szerint). A pult az /api/admin?mi=apk_letoltes-en
// látja; a GA4-be a /alkalmazas oldalról az app.js küld apk_letoltes eseményt.
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
  const cel = "/alkalmazas/quicknews.apk";
  try {
    if (req.method === "GET") {
      const nap = budapestNap();
      await kv("INCR", "qn:apk_letoltes");
      await kv("HINCRBY", "qn:apk_letoltes_nap", nap, 1);
    } else if (req.method !== "HEAD") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ hiba: "csak GET" }));
      return;
    }
  } catch (e) {
    // a számláló elakadása ne akadályozza a letöltést
  }
  res.statusCode = 302;
  res.setHeader("Location", cel);
  res.setHeader("Cache-Control", "no-store");
  res.end();
};
