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
  if (!(await nyilvanosHost(host))) return { ok: false, uzenet: "Ezt a weboldalt nem találjuk. Ellenőrizd a címet!" };
  return { ok: true, ertek: `https://${host}${u.pathname === "/" ? "" : u.pathname}`, host };
}

// SEC-006: a szerver csak nyilvános internetes címre indíthat kérést. Privát, loopback, link-local, CGNAT,
// többes küldésű és fenntartott címre (IPv4 és IPv6, minden írásmódban) nem, átirányítás után sem.
// A címet a kapcsolódáskor ellenőrizzük (saját lookup), így a DNS a vizsgálat és a lekérés között sem cserélhető le.
const net = require("net");
const http = require("http");
const https = require("https");
// külön lista az IPv4-hez és az IPv6-hoz: a közös BlockList az IPv4-et ::ffff:-ként az IPv6-szabályokkal is összeveti
const TILTOTT_IP = new net.BlockList(), TILTOTT_IP6 = new net.BlockList();
for (const [cim, hossz] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3]])
  TILTOTT_IP.addSubnet(cim, hossz, "ipv4");
for (const [cim, hossz] of [["::", 96], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32], ["2002::", 16],
  ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8]])
  TILTOTT_IP6.addSubnet(cim, hossz, "ipv6");

function belsoCim(ip) {
  const v = net.isIP(String(ip || ""));
  if (!v) return true;  // ismeretlen formátum: inkább tiltjuk
  return v === 4 ? TILTOTT_IP.check(String(ip), "ipv4") : TILTOTT_IP6.check(String(ip), "ipv6");
}

function vedettLookup(host, opciok, cb) {
  require("dns").lookup(host, { all: true }, (hiba, cimek) => {  // a callbackes változat (a dns itt a promises API)
    if (hiba) return cb(hiba);
    if (!cimek.length || cimek.some((c) => belsoCim(c.address))) return cb(new Error("nem nyilvános cím"));
    if (opciok && opciok.all) return cb(null, cimek);
    cb(null, cimek[0].address, cimek[0].family);
  });
}

async function nyilvanosHost(host) {
  if (/^\[|^\d+$|^0x/i.test(host) || net.isIP(host)) return false;
  try {
    const cimek = await Promise.race([dns.lookup(host, { all: true }), new Promise((_, nem) => setTimeout(() => nem(new Error("idő")), 4000))]);
    return cimek.length > 0 && cimek.every((c) => !belsoCim(c.address));
  } catch { return false; }
}

// egyetlen kérés a védett lookuppal; legfeljebb 1,5 MB választörzs
function egyKeres(cel, { headers = {}, ido = 9000 } = {}) {
  return new Promise((ok, nem) => {
    const x = new URL(cel);
    const modul = x.protocol === "https:" ? https : http;
    const k = modul.request(x, { method: "GET", headers, lookup: vedettLookup, timeout: ido }, (r) => {
      const darabok = []; let hossz = 0;
      r.on("data", (d) => { hossz += d.length; if (hossz <= 1500000) darabok.push(d); else r.destroy(); });
      const kesz = () => {
        const test = Buffer.concat(darabok).toString("utf8");
        ok({ status: r.statusCode, ok: r.statusCode >= 200 && r.statusCode < 300,
          headers: { get: (n) => { const v = r.headers[String(n).toLowerCase()]; return Array.isArray(v) ? v.join(", ") : v ?? null; } },
          text: async () => test });
      };
      r.on("end", kesz); r.on("close", kesz);
    });
    k.on("timeout", () => k.destroy(new Error("időtúllépés")));
    k.on("error", nem);
    k.end();
  });
}

async function biztonsagosLekeres(u, opciok = {}) {
  let cel = u;
  for (let i = 0; i <= 3; i++) {
    const x = new URL(cel);
    if (!/^https?:$/.test(x.protocol) || (x.port && !["80", "443"].includes(x.port)) || x.username || x.password) throw new Error("nem engedett cím");
    if (!(await nyilvanosHost(x.hostname))) throw new Error("nem nyilvános cím");
    const r = await egyKeres(cel, { headers: opciok.headers, ido: opciok.ido });
    const hova = r.status >= 300 && r.status < 400 && r.headers.get("location");
    if (!hova) return { valasz: r, vegso: cel };
    cel = new URL(hova, cel).toString();
  }
  throw new Error("túl sok átirányítás");
}

module.exports = { tiltottSzoveg, tiltottDomain, nev, telefon, weboldal, belsoCim, nyilvanosHost, biztonsagosLekeres };
