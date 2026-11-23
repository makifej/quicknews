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

// Napi aktív készülékek (Heni 2026-11-23): az app naponta egyszer POST /api/apk?mi=aktiv {"e": névtelen készülék-azonosító,
// "v": verzió}. qn:app_aktiv:<nap> halmaz (120 napig), qn:app_eszkozok (minden valaha jelzett készülék),
// qn:app_verzio:<nap> (verziónként). Személyes adat nincs benne.
async function aktiv(req, res) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const e = String((b || {}).e || ""), v = String((b || {}).v || "").slice(0, 20);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!/^[a-z0-9]{24}$/.test(e)) { res.statusCode = 400; res.end('{"ok":false}'); return; }
  const nap = budapestNap();
  // telepítés vagy frissítés (Heni 2026-11-23: pontos mérés kell). Az app a rendszer szerinti első telepítési és
  // utolsó frissítési időt küldi. Új készülék: ha a kettő egyezik, új telepítés (a telepítés napjára), különben
  // korábbról meglévő telepítés, amely most frissült. Ismert készülék: ha a verziója változott, frissítés.
  const telepitve = Number((b || {}).telepitve) || 0, frissitve = Number((b || {}).frissitve) || 0;
  const napja = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(new Date(ms));
  const regiV = await kv("HGET", (b || {}).teszt === true ? "qn:app_teszt_eszkoz" : "qn:app_eszkoz_verzio", e);
  if ((b || {}).teszt === true) {
    // emulátoros próba: csak kiértékeljük, a valódi számokba nem kerül (az utolsó eredmény 1 napig a pultnak)
    const mi = regiV === null || regiV === undefined ? (telepitve && Math.abs(frissitve - telepitve) < 1000 ? "telepites" : "frissites (korabbi telepites)") : (regiV !== v ? "frissites" : "aktiv");
    await kv("SET", "qn:app_teszt_utolso", JSON.stringify({ mi, v, ido: new Date().toISOString() }), "EX", 86400);
    await kv("HSET", "qn:app_teszt_eszkoz", e, v);
    res.statusCode = 200; res.end(JSON.stringify({ ok: true, teszt: true, mi })); return;
  }
  if (regiV === null || regiV === undefined) {
    if (telepitve && Math.abs(frissitve - telepitve) < 1000) {
      await kv("HINCRBY", "qn:app_telepites_nap", napja(telepitve), 1);
    } else {
      await kv("HINCRBY", "qn:app_frissites_nap", frissitve ? napja(frissitve) : nap, 1);
      await kv("HINCRBY", "qn:app_frissites_verzio", v || "?", 1);
      await kv("INCR", "qn:app_regi_telepites");
    }
  } else if (regiV !== v) {
    await kv("HINCRBY", "qn:app_frissites_nap", frissitve ? napja(frissitve) : nap, 1);
    await kv("HINCRBY", "qn:app_frissites_verzio", v || "?", 1);
  }
  if (v) await kv("HSET", "qn:app_eszkoz_verzio", e, v);
  await kv("SADD", `qn:app_aktiv:${nap}`, e);
  await kv("EXPIRE", `qn:app_aktiv:${nap}`, 120 * 86400);
  await kv("SADD", "qn:app_eszkozok", e);
  if (/^[0-9.]+$/.test(v)) { await kv("HSET", `qn:app_verzio:${nap}`, e, v); await kv("EXPIRE", `qn:app_verzio:${nap}`, 120 * 86400); }
  res.statusCode = 200; res.end('{"ok":true}');
}

module.exports = async (req, res) => {
  if (req.method === "POST" && /[?&]mi=aktiv\b/.test(req.url || "")) {
    try { return await aktiv(req, res); } catch (e) { res.statusCode = 500; res.end('{"ok":false}'); return; }
  }
  const cel = "/alkalmazas/quicknews.apk";
  try {
    if (req.method === "GET") {
      const nap = budapestNap();
      // Heni 2026-11-23: a frissítés nem új letöltés. Az app frissítés-értesítése ?frissites=1-gyel jön
      // (build/app_kiadas.py), ezt külön számoljuk (qn:apk_frissites), az új letöltések közé nem kerül.
      const frissites = /[?&]frissites=1\b/.test(req.url || "");
      const kulcs = frissites ? "qn:apk_frissites" : "qn:apk_letoltes";
      await kv("INCR", kulcs);
      await kv("HINCRBY", kulcs + "_nap", nap, 1);
      // Heni 2026-11-18: minden letöltés a GA4-be is (Measurement Protocol, minden alkalommal új, véletlen azonosító,
      // ugyanúgy, mint a bannerkattintásnál). Külön eseménynév, hogy ne duplázza a weboldal hozzájárulásos apk_letoltes-ét.
      const ua = String(req.headers["user-agent"] || "");
      if (process.env.GA4_API_SECRET && !/bot|crawl|spider|preview|facebookexternalhit|slurp|curl|wget|python/i.test(ua)) {
        try {
          await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=G-MXSE5QFHHY&api_secret=${process.env.GA4_API_SECRET}`, {
            method: "POST",
            body: JSON.stringify({ client_id: `apk.${Date.now()}.${Math.floor(Math.random() * 1e9)}`,
              events: [{ name: frissites ? "apk_frissites" : "apk_letoltes_osszes", params: { honnan: /; wv\)|quicknews-android/.test(ua) ? "app" : "web" } }] }),
          });
        } catch (e) { /* GA-hiba ne akadályozza a letöltést */ }
      }
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
