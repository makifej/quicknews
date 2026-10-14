// Az admin-süti közös ellenőrzése (api/admin.js és api/kerdez.js). Nem végpont: az aláhúzásos fájl nem kerül ki.
// SEC-015: az aláírókulcs az ADMIN_TITOK-ból HKDF-fel származtatott alkulcs; a Mac gépkulcsa (GEP_KULCS) és a
// hírlevél-token kulcsa (HIRLEVEL_TITOK) külön titok, így bármelyik kiszivárgása önmagában nem ad süti-hamisítást.
// SEC-016: a süti formátuma <lejárat>.<generáció>.<hmac>; a generáció a KV-ben van (qn:admin:gen), kilépéskor nő.
const crypto = require("crypto");

const SUTI = "qn_admin";

function sutiKulcs() {
  return Buffer.from(crypto.hkdfSync("sha256", process.env.ADMIN_TITOK, "", "qn-suti", 32));
}
function alair(lejar, gen) {
  return crypto.createHmac("sha256", sutiKulcs()).update(`${lejar}|${gen}`).digest("hex");
}
async function sutiGen(kv) {
  return String((await kv("GET", "qn:admin:gen")) || 0);
}
async function belepve(req, kv) {
  // SEC-012: titok nélkül semmilyen süti nem érvényes (különben üres kulccsal is hamisítható lenne)
  if (!process.env.ADMIN_TITOK) return false;
  const m = (req.headers.cookie || "").match(new RegExp(`${SUTI}=(\\d+)\\.(\\d+)\\.([a-f0-9]{64})`));
  if (!m || Number(m[1]) < Date.now()) return false;
  const gen = await sutiGen(kv);
  if (m[2] !== gen) return false;
  const a = Buffer.from(alair(m[1], gen)), b = Buffer.from(m[3]);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { SUTI, alair, sutiGen, belepve };
