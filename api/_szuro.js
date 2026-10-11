// Közös bemenetszűrő minden űrlaphoz (hirdetői érdeklődés, hírbeküldés, chatbot). Az aláhúzásos fájlt a Vercel nem teszi ki végpontként.
// Heni 2026-10-11: „minden boxot ellenőrizzünk, faszságot sehova ne írhassanak, minden pornó, gambling meg minden szenny tartalmat szűrjünk”.
const dns = require("dns").promises;

// tiltott szavak két csoportban, hogy valódi nevek ne akadjanak fenn (Szarka, Pinár, Gunnar, Sexton, Slotnick):
// TOVEK: egyértelmű szótövek, szóelejen bármilyen folytatással; SZAVAK: csak egész szóként
const TOVEK = ["fasz", "basz", "bazmeg", "kurv", "picsa", "geci", "ribanc", "köcsög", "kocsog", "seggfej", "buzer", "fuck", "cunt", "nigger",
  "porn", "pornó", "hentai", "onlyfans", "fansly", "xvideo", "xnxx", "xhamster", "pornhub", "redtube", "youporn", "chaturbate", "nsfw", "escort",
  "casino", "kaszinó", "kaszino", "gambl", "poker", "póker", "tippmix", "sportfogad", "bet365", "1xbet", "unibet",
  "kokain", "cocaine", "heroin", "marihuán", "marihuan", "viagra", "cialis", "kamagra", "piramisjáték"];
const SZAVAK = ["pina", "pinák", "buzi", "buzik", "segg", "szar", "szaros", "sex", "szex", "sexy", "szexi", "xxx", "milf", "nude", "nudes", "meztelen",
  "erotik", "erotic", "webcam", "camgirl", "dick", "cock", "pussy", "shit", "bitch", "slut", "whore", "asshole", "bastard", "retard", "faggot",
  "anyád", "anyad", "néger", "slot", "slots", "betting", "bingo", "lotto", "lottó", "rulett", "roulette", "blackjack", "jackpot",
  "meth", "weed", "cannabis", "gun", "fegyver"];
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TILTOTT_RE = new RegExp("(^|[^\\p{L}\\p{N}])(?:(?:" + TOVEK.map(esc).join("|") + ")|(?:" + SZAVAK.map(esc).join("|") + ")(?=$|[^\\p{L}\\p{N}]))", "iu");
// domainben: részszó is számít (pl. „bestcasino”, „freeporn”), de a „sex” csak szóelejen (Essex, Sussex miatt)
const TILTOTT_DOMAIN = /(porn|xxx|xvideo|xnxx|xhamster|redtube|youporn|pornhub|onlyfans|fansly|escort|hentai|nsfw|camgirl|chaturbate|stripchat|(^|[.-])sex|sexy|szex|erotik|erotic|casino|kaszino|kaszinó|gambl|poker|slot|betting|(^|[.-])bet\d*\.|sportsbook|lotto|lottery|bingo|roulette|blackjack|tippmix|1xbet|bet365|unibet|viagra|cialis|kamagra)/i;
const TILTOTT_TLD = /\.(xxx|sex|porn|adult|casino|bet|poker|sexy|dating)$/i;

function tiltottSzoveg(s) {
  return TILTOTT_RE.test(String(s || "").normalize("NFC"));
}

function tiltottDomain(host) {
  host = String(host || "").toLowerCase();
  return TILTOTT_DOMAIN.test(host) || TILTOTT_TLD.test(host);
}

// név: csak betű, szóköz, kötőjel, pont, aposztróf; legalább 2 betű; tiltott szó nélkül
function nev(s) {
  const n = String(s || "").replace(/\s+/g, " ").trim();
  if (n.length < 2 || n.length > 80) return { ok: false, uzenet: "Add meg a neved (2-80 karakter)." };
  if (!/^[\p{L}][\p{L} .'’-]*$/u.test(n) || (n.match(/\p{L}/gu) || []).length < 2) return { ok: false, uzenet: "A névben csak betű, szóköz, kötőjel és pont lehet." };
  if (tiltottSzoveg(n)) return { ok: false, uzenet: "Ezt a nevet nem tudjuk elfogadni." };
  return { ok: true, ertek: n };
}

// telefonszám: magyar (+36, 06, 36 előtaggal) vagy külföldi nemzetközi formában (+országkód, E.164: 8-15 számjegy)
const MAGYAR_MOBIL = /^(20|30|31|50|70)\d{7}$/;
const MAGYAR_BP = /^1\d{7}$/;
const MAGYAR_VIDEK = /^([2-9]\d)\d{6}$/;
function telefon(s) {
  const nyers = String(s || "").trim();
  const t = nyers.replace(/[\s().\-/]/g, "");
  if (!t) return { ok: false, uzenet: "Add meg a telefonszámod." };
  if (!/^\+?\d+$/.test(t)) return { ok: false, uzenet: "A telefonszámban csak számjegy és az elején + jel lehet." };
  let szam = null;
  if (t.startsWith("+36")) szam = t.slice(3);
  else if (t.startsWith("0036")) szam = t.slice(4);
  else if (t.startsWith("06")) szam = t.slice(2);
  else if (t.startsWith("36") && t.length === 11) szam = t.slice(2);
  else if (!t.startsWith("+") && !t.startsWith("00") && (t.length === 8 || t.length === 9)) szam = t;  // előtag nélküli magyar szám
  if (szam !== null) {
    let fmt = null;
    if (MAGYAR_MOBIL.test(szam)) fmt = `+36 ${szam.slice(0, 2)} ${szam.slice(2, 5)} ${szam.slice(5)}`;
    else if (MAGYAR_BP.test(szam)) fmt = `+36 1 ${szam.slice(1, 4)} ${szam.slice(4)}`;
    else if (MAGYAR_VIDEK.test(szam) && !/^(20|30|31|50|70)/.test(szam)) fmt = `+36 ${szam.slice(0, 2)} ${szam.slice(2, 5)} ${szam.slice(5)}`;
    if (!fmt) return { ok: false, uzenet: "Ez nem érvényes magyar telefonszám. Mobilszám például: +36 30 123 4567, budapesti: +36 1 234 5678." };
    return { ok: true, ertek: fmt, kulfoldi: false };
  }
  // külföldi: kötelező a + vagy a 00 előtag és az országkód
  const k = t.startsWith("00") ? "+" + t.slice(2) : t;
  if (!k.startsWith("+")) return { ok: false, uzenet: "Külföldi számot nemzetközi formában add meg, + jellel és országkóddal, például: +44 20 7946 0958." };
  const jegyek = k.slice(1);
  if (!/^[1-9]\d{7,14}$/.test(jegyek)) return { ok: false, kulfoldi: true, uzenet: "Ez nem érvényes nemzetközi telefonszám. Így add meg: + jel, országkód, majd a szám, például: +44 20 7946 0958." };
  return { ok: true, ertek: "+" + jegyek, kulfoldi: true };
}

// weboldal: létező, feloldható domain, nem tiltólistás; a nyitóoldal tartalmát a hívó dönti el (Geminivel), ha kell
async function weboldal(s) {
  let w = String(s || "").trim();
  if (!w) return { ok: false, uzenet: "Add meg a weboldalad címét." };
  if (!/^https?:\/\//i.test(w)) w = "https://" + w;
  let u;
  try { u = new URL(w); } catch { return { ok: false, uzenet: "Ez nem érvényes weboldalcím. Például: pelda.hu" }; }
  const host = u.hostname.toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,24}$/i.test(host) || host.includes("..") || /^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(host)) return { ok: false, uzenet: "Ez nem érvényes weboldalcím. Például: pelda.hu" };
  if (tiltottDomain(host) || tiltottSzoveg(host.replace(/[.-]/g, " ")) || tiltottSzoveg(u.pathname.replace(/[/_-]/g, " "))) return { ok: false, uzenet: "Ezt a weboldalt nem tudjuk elfogadni." };
  try {
    await Promise.race([dns.lookup(host), new Promise((_, nem) => setTimeout(() => nem(new Error("idő")), 4000))]);
  } catch {
    return { ok: false, uzenet: "Ezt a weboldalt nem találjuk. Ellenőrizd a címet!" };
  }
  return { ok: true, ertek: `https://${host}${u.pathname === "/" ? "" : u.pathname}`, host };
}

module.exports = { tiltottSzoveg, tiltottDomain, nev, telefon, weboldal };
