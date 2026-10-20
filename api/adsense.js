// Google AdSense futásidejű kapcsolója (Heni 2026-10-20): a pult egy gombjával ki- és bekapcsolható, élesítés nélkül.
//
// GET /api/adsense -> {be: true|false}
//
// Az oldal ebből dönti el, hogy betölti-e a Google hirdetési szkriptjét (és vele a Google hozzájárulás-kezelőjét).
// Az állapot az Upstash qn:adsense_ki kulcsa ("1" = kikapcsolva), a pult (api/admin.js, mi=adsense_kapcsol) állítja.
// Hiba esetén kikapcsolt (fail-closed). A CDN 30 másodpercig tárolja, ezért a kapcsolás kb. fél percen belül érvényes.
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

module.exports = async (req, res) => {
  let be = false;
  try { be = (await kv("GET", "qn:adsense_ki")) !== "1"; } catch (e) { be = false; }
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=30");
  res.end(JSON.stringify({ be }));
};
