/* Ideiglenes halloweenes szellemek (Heni 2026-10-18): cuki szellemek, minden betöltéskor más helyen. Asztalon csak üres helyen,
   a hírek területén soha; mobilon (2026-10-20) a képernyő látható részén bárhol, mert ott nincs üres sáv. Halványan, véletlen
   időben bukkannak fel, pulzálnak egy kicsit, aztán máshol tűnnek fel újra. A render.py HALLOWEEN kapcsolója tölti be.
   BOO-vadászat (Heni 2026-10-20): ha a body-n data-boo="1" van (render.py BOO_JATEK) vagy a cím ?boo=elonezet, a szellem
   elkapható: kattintásra/koppintásra narancsra vált, a számlálóba repül, és 5 elkapott szellem után felugrik a nyereményjáték
   ablaka, ahol a játékos megadja, hova értesítsük, ha ő nyert. Az állás a böngészőben (localStorage, qn-boo) marad meg. */
(function () {
  var B = document.body;
  if (!B.classList.contains('halloween')) return;
  var r = Math.random;
  function koz(a, b) { return a + r() * (b - a); }
  var MOBIL = document.documentElement.clientWidth < 768;
  // az előnézet a böngészőben megmarad, így minden oldalon játszható (Heni 2026-10-20: „minden oldalon legyen aktív”);
  // kikapcsolás: ?boo=ki
  var ELONEZET = false;
  try {
    if (/[?&]boo=elonezet\b/.test(location.search)) localStorage.setItem('qn-boo-elonezet', '1');
    if (/[?&]boo=ki\b/.test(location.search)) localStorage.removeItem('qn-boo-elonezet');
    ELONEZET = localStorage.getItem('qn-boo-elonezet') === '1';
  } catch (e) { ELONEZET = /[?&]boo=elonezet\b/.test(location.search); }
  // a szabályzat szerint 2026. november 9. 23:59-ig (budapesti idő) lehet játszani; utána a szellemek csak díszek
  var HATARIDO = Date.parse('2026-11-09T22:59:59Z');
  var JATEK = (B.getAttribute('data-boo') === '1' && Date.now() <= HATARIDO) || ELONEZET;
  var CEL = 5;
  var TAR = 'qn-boo';
  var all = { db: 0, kesz: false, bekuldve: false };
  try { var t = JSON.parse(localStorage.getItem(TAR) || 'null'); if (t && typeof t.db === 'number') all = t; } catch (e) {}
  function ment() { try { localStorage.setItem(TAR, JSON.stringify(all)); } catch (e) {} }
  // előnézetben a ?uj=1 nulláról kezdi a játékot (teszteléshez)
  if (ELONEZET && /[?&]uj=1\b/.test(location.search)) { all = { db: 0, kesz: false, bekuldve: false }; ment(); }
  if (JATEK) B.classList.add('boo-jatek');
  // bújócska (Heni 2026-10-20): oldalanként legfeljebb 1 BOO kapható el, és lejjebb kell görgetni érte; a többit más oldalakon kell keresni
  var OLDAL = location.pathname.replace(/\/+$/, '') || '/';
  if (!Array.isArray(all.oldalak)) all.oldalak = [];
  var ITT_MEGVOLT = JATEK && !all.kesz && all.oldalak.indexOf(OLDAL) >= 0;
  var BUJOCSKA = JATEK && !all.kesz && !ITT_MEGVOLT;
  // cikkoldalon (Heni 2026-10-20) a szellem azonnal, a látható részen jelenik meg: nekünk jó, ha a látogató cikket olvas
  var CIKK = /^\/hir\//.test(OLDAL);

  var SZELLEM = '<svg viewBox="0 0 100 112" aria-hidden="true">' +
    '<path class="hw-test" d="M26 50Q12 46 9 30M74 50Q88 46 91 30" fill="none" stroke-width="10" stroke-linecap="round"/>' +
    '<path class="hw-test" d="M50 14C30 14 22 32 22 52v24c0 14 12 21 24 19 12 8 30 9 46 3-12-6-16-14-16-24V52c0-20-8-38-26-38z"/>' +
    '<ellipse cx="42" cy="40" rx="3.8" ry="5.2" class="hw-arc"/><ellipse cx="58" cy="40" rx="3.8" ry="5.2" class="hw-arc"/>' +
    '<ellipse cx="50" cy="57" rx="4.6" ry="6.4" class="hw-arc"/></svg>';
  var KIS = '<svg viewBox="0 0 100 112" aria-hidden="true"><path d="M50 14C30 14 22 32 22 52v24c0 14 12 21 24 19 12 8 30 9 46 3-12-6-16-14-16-24V52c0-20-8-38-26-38z"/>' +
    '<ellipse cx="42" cy="40" rx="4.4" ry="6" class="k-arc"/><ellipse cx="58" cy="40" rx="4.4" ry="6" class="k-arc"/><ellipse cx="50" cy="57" rx="5" ry="7" class="k-arc"/></svg>';

  // asztalon a réteg az oldal koordinátáiban van (a szellem a görgetéssel együtt mozog), mobilon a képernyőhöz rögzített
  var reteg = document.createElement('div');
  reteg.className = 'hw-reteg' + (MOBIL && !BUJOCSKA ? ' hw-reteg--mobil' : '');
  reteg.setAttribute('aria-hidden', 'true');
  B.insertBefore(reteg, B.firstChild);
  function magassag() { if (!MOBIL || BUJOCSKA) reteg.style.height = document.documentElement.scrollHeight + 'px'; }
  magassag();

  // asztali tiltott terület: minden hír, kép, videó, cím, szöveg és gomb teljes doboza, a fejléc és a lábléc
  var TILOS = 'header, footer, main a, main img, main video, main picture, main figure, main p, main h1, main h2, main h3, main h4, ' +
    'main li, main button, main mark, main input, main form, main article, main [class*="hir"], main [class*="pb-"], main [class*="szavaz"]';
  function tiltottak() {
    var sy = window.scrollY, sx = window.scrollX, lista = [];
    document.querySelectorAll(TILOS).forEach(function (e) {
      var q = e.getBoundingClientRect();
      if (q.width && q.height) lista.push([q.left + sx, q.top + sy, q.right + sx, q.bottom + sy]);
    });
    return lista;
  }
  var w = document.documentElement.clientWidth;
  // a szellem doboza a „BOO” felirattal együtt; elol = a felirat a szellem előtt (balra), különben mögötte
  function szabad(x, y, m, lista, elol) {
    var x0 = elol ? x - m * 1.4 : x, x1 = elol ? x + m : x + m * 2.4;
    if (x0 < 4 || x1 > w - 4) return false;
    for (var k = 0; k < lista.length; k++) {
      var q = lista[k];
      if (x0 < q[2] + 16 && x1 > q[0] - 16 && y < q[3] + 16 && y + m * 1.12 > q[1] - 16) return false;
    }
    return true;
  }
  var fejlec = (document.querySelector('[data-fejlec]') || { offsetHeight: 120 }).offsetHeight;
  function helyAsztal(bal, meret) {
    var lista = tiltottak();
    w = document.documentElement.clientWidth;
    var k = document.querySelector('main .keret') || document.querySelector('main');
    var kb = k ? k.getBoundingClientRect() : { left: 0, right: w };
    var sav = bal ? kb.left - 16 : w - kb.right - 16;
    var fent = window.scrollY + fejlec + 24, lent = window.scrollY + window.innerHeight - meret * 1.3 - 24;
    if (lent <= fent) return null;
    for (var p = 0; p < 150; p++) {
      var y = koz(fent, lent), x;
      if (p < 75 && sav > meret + 24) x = bal ? koz(12, sav - meret - 12) : koz(kb.right + 28, w - meret - 12);
      else x = bal ? koz(4, w / 2 - meret) : koz(w / 2, w - meret - 4);
      if (szabad(x, y, meret, lista, true)) return [x, y, true];
      if (szabad(x, y, meret, lista, false)) return [x, y, false];
    }
    return null;
  }
  // mobilon a látható képernyőn, a fejléc alatt és az alsó gombsor fölött; bal oldalon a BOO a szellem előtt, jobbon mögötte
  function helyMobil(bal, meret) {
    w = document.documentElement.clientWidth;
    var fent = Math.max(16, fejlec - window.scrollY) + 24, lent = window.innerHeight - meret * 1.2 - 110;
    if (lent <= fent) return null;
    var y = koz(fent, lent);
    var x = bal ? koz(meret * 1.4 + 8, w / 2 - meret / 2) : koz(w / 2 - meret / 2, w - meret * 2.4 - 8);
    return [x, y, bal];
  }
  // játék közben asztalon is meg kell jelennie: ha nincs üres hely (a főoldal teljes szélességben hírekkel teli), a hírek fölé kerül
  function helyAtfedo(bal, meret) {
    w = document.documentElement.clientWidth;
    var fent = Math.max(window.scrollY + 24, fejlec + 24), lent = window.scrollY + window.innerHeight - meret * 1.3 - 96;
    if (lent <= fent) return null;
    var x = bal ? koz(meret * 1.4 + 24, w / 2 - meret) : koz(w / 2, w - meret * 2.4 - 24);
    return [x, koz(fent, lent), bal];
  }
  // bújócska: a szellem az oldal lejjebb eső részén bújik el (az első képernyőnyin túl, ha az oldal elég hosszú), és ott is marad;
  // asztalon üres helyet keres, ha nincs, a hírek fölé kerül
  function helyJatek(meret) {
    var H = document.documentElement.scrollHeight, vh = window.innerHeight;
    w = document.documentElement.clientWidth;
    if (CIKK) {
      // cikkoldalon a képernyő éppen látható részén, a fejléc alatt, görgetés nélkül
      var fent = window.scrollY + Math.max(fejlec - window.scrollY, 0) + 24, lent = window.scrollY + vh - meret * 1.3 - 110;
      if (!MOBIL) { var u = helyAsztal(r() < 0.5, meret); if (u) return u; }
      var bb = r() < 0.5;
      return [bb ? koz(meret * 1.4 + 8, w / 2 - meret / 2) : koz(w / 2 - meret / 2, w - meret * 2.4 - 8), koz(fent, Math.max(fent + 1, lent)), bb];
    }
    // legfeljebb kb. 4,5 képernyőnyi görgetésre, hogy megtalálható legyen
    var also = H > vh * 1.6 ? vh * 0.9 : fejlec + 40, felso = Math.min(H - meret * 1.4 - 160, vh * 4.5);
    if (felso <= also) { also = fejlec + 40; felso = Math.max(also + 1, H - meret * 1.4 - 40); }
    if (!MOBIL) {
      var lista = tiltottak();
      for (var p = 0; p < 200; p++) {
        var yy = koz(also, felso), xx = koz(8, w - meret * 2.4 - 8);
        if (szabad(xx, yy, meret, lista, true)) return [xx, yy, true];
        if (szabad(xx, yy, meret, lista, false)) return [xx, yy, false];
      }
    }
    var b = r() < 0.5;
    return [b ? koz(meret * 1.4 + 8, w / 2 - meret / 2) : koz(w / 2 - meret / 2, w - meret * 2.4 - 8), koz(also, felso), b];
  }
  function hely(bal, meret) { return MOBIL ? helyMobil(bal, meret) : (helyAsztal(bal, meret) || (JATEK ? helyAtfedo(bal, meret) : null)); }

  // ---- számláló és nyereményjáték-ablak ----
  var szamlalo = null;
  function szamlaloRajz(ugrik) {
    if (!JATEK) return;
    if (!szamlalo) {
      szamlalo = document.createElement('button');
      szamlalo.type = 'button';
      szamlalo.className = 'boo-szamlalo';
      szamlalo.addEventListener('click', function () { if (all.kesz && !all.bekuldve) ablak(); });
      B.appendChild(szamlalo);
    }
    var pontok = '';
    for (var i = 0; i < CEL; i++) pontok += '<i class="' + (i < all.db ? 'be' : '') + '">' + KIS + '</i>';
    // mobilon rövid felirat, hogy ne érjen el a jobb alsó chatgombig
    var szoveg = all.bekuldve ? (MOBIL ? '✓' : 'Benne vagy a sorsolásban') : all.kesz ? (MOBIL ? '5/5 · Jelentkezz' : 'Megvan mind az 5! Kattints ide')
      : (MOBIL || all.db ? all.db + '/' + CEL : 'Kapd el az 5 BOO-t!');
    var cimke = all.bekuldve ? 'Benne vagy a sorsolásban' : all.kesz ? 'Megvan mind az 5 BOO, kattints a jelentkezéshez' : all.db + ' BOO elkapva az 5-ből';
    szamlalo.innerHTML = '<span class="boo-pontok">' + pontok + '</span><span class="boo-szoveg">' + szoveg + '</span>' +
      (!all.db && !all.kesz ? '<span class="boo-tipp">Kapd el az 5 BOO-t, és nyerhetsz!' + (CIKK ? '' : ' Görgess lejjebb, és nézz körül több oldalon is.') + '</span>' : '');
    szamlalo.setAttribute('aria-label', cimke);
    szamlalo.classList.toggle('boo-szamlalo--kesz', !!all.kesz);
    if (ugrik) { szamlalo.classList.remove('boo-ugrik'); void szamlalo.offsetWidth; szamlalo.classList.add('boo-ugrik'); }
  }

  // rövid buborék a számláló fölött
  function tipp(szoveg) {
    if (!szamlalo) return;
    var o = szamlalo.querySelector('.boo-tipp'); if (o) o.remove();
    var t_ = document.createElement('span'); t_.className = 'boo-tipp'; t_.textContent = szoveg; szamlalo.appendChild(t_);
  }

  var abl = null;
  function zar() { if (abl) abl.hidden = true; B.classList.remove('boo-nyitva'); }
  function ablak() {
    if (abl) { abl.hidden = false; B.classList.add('boo-nyitva'); return; }
    abl = document.createElement('div');
    abl.className = 'boo-hatter';
    abl.innerHTML = '<div class="boo-ablak" role="dialog" aria-modal="true" aria-labelledby="boo-cim">' +
      '<button type="button" class="boo-zar" aria-label="Bezárás">×</button>' +
      '<div class="boo-sereg">' + KIS + KIS + KIS + KIS + KIS + '</div>' +
      '<p class="boo-felirat">Nyereményjáték</p>' +
      '<h2 id="boo-cim">Elkaptad mind az 5 BOO-t!</h2>' +
      '<p class="boo-bev">Hova írjunk, ha te nyersz?</p>' +
      '<form class="boo-urlap" novalidate><label class="rejtett" for="boo-email">E-mail-cím</label>' +
      '<input id="boo-email" type="email" inputmode="email" autocomplete="email" placeholder="nev@pelda.hu" required>' +
      '<label class="boo-jog"><input type="checkbox" class="boo-elfogad" required> <span>Elfogadom a <a href="/nyeremenyjatek" target="_blank" rel="noopener">játékszabályzatot</a>, és megismertem az <a href="/adatvedelem#nyeremenyjatek" target="_blank" rel="noopener">adatkezelési tájékoztatót</a>.</span></label>' +
      // a hírlevél külön, nem kötelező pipa (Heni 2026-10-20), alapból bejelöletlen; a részvételnek nem feltétele
      '<label class="boo-jog boo-jog--hl"><input type="checkbox" class="boo-hirlevel"> <span>Feliratkozom a quicknews.hu napi hírlevelére is (nem kötelező, bármikor leiratkozhatok).</span></label>' +
      '<button type="submit" class="boo-gomb">Értesítsetek, ha nyertem</button><p class="boo-uzenet" role="status"></p></form>' +
      '<button type="button" class="boo-most-nem">Most nem</button></div>';
    B.appendChild(abl);
    B.classList.add('boo-nyitva');
    abl.querySelector('.boo-zar').onclick = zar;
    abl.querySelector('.boo-most-nem').onclick = zar;
    abl.addEventListener('click', function (e) { if (e.target === abl) zar(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && abl && !abl.hidden) zar(); });
    var urlap = abl.querySelector('form'), uz = abl.querySelector('.boo-uzenet'), gomb = abl.querySelector('.boo-gomb');
    urlap.onsubmit = function (e) {
      e.preventDefault();
      var email = abl.querySelector('#boo-email').value.trim(), elf = abl.querySelector('.boo-elfogad').checked, hl = abl.querySelector('.boo-hirlevel').checked;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { uz.textContent = 'Írj be egy érvényes e-mail-címet.'; return; }
      if (!elf) { uz.textContent = 'A részvételhez fogadd el a játékszabályzatot.'; return; }
      gomb.disabled = true; uz.textContent = 'Küldés…';
      fetch('/api/boo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, elfogad: true, hirlevel: hl, db: all.db }) })
        .then(function (v) { return v.json().then(function (j) { return [v.ok, j]; }); })
        .then(function (x) {
          if (x[0] && x[1].rendben) {
            all.bekuldve = true; ment(); szamlaloRajz(true);
            // ha a hírlevélre is feliratkozott, a hírlevél-ablak többé ne kérje (render.py: qn-hl-kesz)
            if (hl) { try { localStorage.setItem('qn-hl-kesz', '1'); } catch (e2) {} }
            abl.querySelector('.boo-ablak').innerHTML = '<div class="boo-sereg">' + KIS + KIS + KIS + KIS + KIS + '</div>' +
              '<p class="boo-felirat">Nyereményjáték</p><h2>Benne vagy a sorsolásban!</h2><p class="boo-bev">' + (x[1].uzenet || 'Ha te nyersz, erre a címre írunk.') + '</p>' +
              '<button type="button" class="boo-gomb">Vissza a hírekhez</button>';
            abl.querySelector('.boo-gomb').onclick = zar;
          } else { gomb.disabled = false; uz.textContent = (x[1] && x[1].uzenet) || 'Most nem sikerült elküldeni. Próbáld újra egy perc múlva.'; }
        })
        .catch(function () { gomb.disabled = false; uz.textContent = 'Most nem sikerült elküldeni. Próbáld újra egy perc múlva.'; });
    };
  }

  // elkapás: a szellem narancsra vált, szikraeső, és egy narancs szellem átrepül a számlálóba
  function elkap(sz) {
    if (sz.classList.contains('hw-elkapva') || all.db >= CEL) return;
    sz.classList.add('hw-elkapva');
    var q = sz.querySelector('svg').getBoundingClientRect(), cx = q.left + q.width / 2, cy = q.top + q.height / 2;
    var szikrak = document.createElement('div');
    szikrak.className = 'boo-szikrak';
    szikrak.style.left = cx + 'px'; szikrak.style.top = cy + 'px';
    for (var i = 0; i < 12; i++) {
      var s = document.createElement('i'), sz2 = (i * 30 + koz(-10, 10)) * Math.PI / 180, tav = koz(44, 96);
      s.style.setProperty('--dx', (Math.cos(sz2) * tav).toFixed(0) + 'px');
      s.style.setProperty('--dy', (Math.sin(sz2) * tav).toFixed(0) + 'px');
      szikrak.appendChild(s);
    }
    B.appendChild(szikrak);
    setTimeout(function () { szikrak.remove(); }, 1000);
    all.db++; if (all.db >= CEL) { all.db = CEL; all.kesz = true; }
    if (all.oldalak.indexOf(OLDAL) < 0) all.oldalak.push(OLDAL);
    ment();
    var cel = szamlalo.querySelectorAll('.boo-pontok i')[all.db - 1].getBoundingClientRect();
    var repulo = document.createElement('div');
    repulo.className = 'boo-repulo';
    repulo.innerHTML = KIS;
    repulo.style.left = q.left + 'px'; repulo.style.top = q.top + 'px'; repulo.style.width = q.width + 'px';
    B.appendChild(repulo);
    var dx = cel.left + cel.width / 2 - cx, dy = cel.top + cel.height / 2 - cy, sk = cel.width / q.width;
    var anim = repulo.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)' },
      { transform: 'translate(' + (dx * 0.3) + 'px,' + (dy * 0.3 - 90) + 'px) scale(1.3) rotate(-16deg)', offset: 0.35 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sk + ') rotate(0deg)' }
    ], { duration: 950, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', delay: 260, fill: 'forwards' });
    anim.onfinish = function () {
      repulo.remove(); szamlaloRajz(true);
      if (!all.kesz && BUJOCSKA) tipp('Megvan! A következő BOO egy másik oldalon bújt el.');
      if (all.kesz && !all.bekuldve) setTimeout(function () { unnep(); setTimeout(ablak, 900); }, 150);
    };
    setTimeout(function () { sz.remove(); if (!all.kesz && !BUJOCSKA) setTimeout(indit, koz(2500, 6000)); }, 700);
  }
  // az 5. elkapás után narancs szellemek szállnak fel a képernyő aljáról
  function unnep() {
    for (var i = 0; i < 16; i++) {
      var g = document.createElement('div');
      g.className = 'boo-repulo';
      g.innerHTML = KIS;
      var m = koz(28, 60);
      g.style.width = m + 'px'; g.style.left = koz(0, window.innerWidth - m) + 'px'; g.style.top = window.innerHeight + 'px';
      B.appendChild(g);
      g.animate([{ transform: 'translateY(0) rotate(0deg)', opacity: 0 }, { opacity: 1, offset: 0.2 },
        { transform: 'translateY(' + (-window.innerHeight - 160) + 'px) rotate(' + koz(-40, 40) + 'deg)', opacity: 0 }],
        { duration: koz(1500, 2600), delay: koz(0, 500), easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' })
        .onfinish = (function (x) { return function () { x.remove(); }; })(g);
    }
  }

  // Egyszerre mindig csak EGY szellem van (Heni 2026-10-18), felváltva bal és jobb oldalon, a képernyő látható részén.
  var bal = r() < 0.5;
  function indit() {
    var meret = MOBIL ? koz(52, 64) : koz(54, 70);
    var sz = document.createElement('div');
    sz.className = 'hw-szellem';
    var dur = koz(9, 12);
    sz.style.width = meret + 'px';
    sz.style.animationDuration = dur.toFixed(2) + 's';
    sz.style.animationDelay = (BUJOCSKA && CIKK ? 0.5 : koz(1, 4)).toFixed(2) + 's';
    sz.innerHTML = '<div class="hw-himba">' + SZELLEM + '</div><span class="hw-boo">BOO</span>';
    sz.style.setProperty('--boo', (meret * 0.46).toFixed(0) + 'px');
    var idozito = null;
    function athelyez() {
      if (BUJOCSKA && sz.dataset.hely) return; // a bújócskában a szellem a helyén marad, ott bukkan fel újra és újra
      var uj = BUJOCSKA ? helyJatek(meret) : (hely(bal, meret) || hely(!bal, meret));
      if (BUJOCSKA && uj) sz.dataset.hely = '1';
      bal = !bal;
      if (!uj) { sz.style.visibility = 'hidden'; return; }
      sz.style.left = uj[0] + 'px'; sz.style.top = uj[1] + 'px'; sz.style.visibility = '';
      sz.lastChild.classList.toggle('hw-boo--jobb', !uj[2]);
      sz.querySelector('svg').style.transform = r() < 0.5 ? 'scaleX(-1)' : '';
    }
    // csak akkor fogható, amíg látszik (a ciklus első felében); máskor a koppintás a tartalomra megy át
    function foghato() {
      if (!JATEK || all.kesz || sz.style.visibility === 'hidden') return;
      sz.classList.add('hw-foghato');
      clearTimeout(idozito);
      idozito = setTimeout(function () { sz.classList.remove('hw-foghato'); }, dur * 520);
    }
    athelyez();
    sz.addEventListener('animationstart', function (e) { if (e.target === sz) foghato(); });
    sz.addEventListener('animationiteration', function (e) { if (e.target === sz) { sz.classList.remove('hw-foghato'); athelyez(); foghato(); } });
    sz.addEventListener('pointerdown', function (e) { if (sz.classList.contains('hw-foghato')) { e.preventDefault(); e.stopPropagation(); elkap(sz); } });
    sz.addEventListener('click', function (e) { if (sz.classList.contains('hw-elkapva')) { e.preventDefault(); e.stopPropagation(); } });
    reteg.appendChild(sz);
  }
  // bemutató ablak (Heni 2026-10-20): böngészőnként egyszer, a sütisávra adott válasz után, amíg a játékos még nem gyűjtötte össze az 5-öt
  function bemutato() {
    if (!JATEK || all.kesz || all.bekuldve || /^\/nyeremenyjatek/.test(location.pathname)) return;
    try { if (localStorage.getItem('qn-boo-bemutato') && !/[?&]bemutato=1\b/.test(location.search)) return; } catch (e) { return; }
    var var_ = setInterval(function () {
      if (!document.documentElement.classList.contains('suti-van') || B.classList.contains('boo-nyitva') || document.querySelector('.hl-ablak:not([hidden])')) return;
      clearInterval(var_);
      setTimeout(function () {
        if (B.classList.contains('boo-nyitva')) return;
        var h = document.createElement('div');
        h.className = 'boo-hatter';
        h.innerHTML = '<div class="boo-ablak boo-ablak--bemutato" role="dialog" aria-modal="true" aria-labelledby="boo-bem-cim">' +
          '<button type="button" class="boo-zar" aria-label="Bezárás">×</button>' +
          '<div class="boo-sereg boo-sereg--bemutato">' + KIS + KIS + KIS + KIS + KIS + '</div>' +
          '<h2 id="boo-bem-cim">Kapd el a <span class="boo-egyben">BOO-kat</span> és <span class="boo-nyerj">NYERJ!</span></h2>' +
          '<p class="boo-bev">Gyűjts össze 5 szellemet! HAJRÁ!</p>' +
          '<button type="button" class="boo-gomb">Kezdem!</button>' +
          '<a class="boo-reszletek" href="/nyeremenyjatek">A nyereményjáték részletei</a></div>';
        B.appendChild(h);
        B.classList.add('boo-nyitva');
        try { localStorage.setItem('qn-boo-bemutato', String(Date.now())); } catch (e) {}
        function zar2() { h.remove(); B.classList.remove('boo-nyitva'); }
        h.querySelector('.boo-zar').onclick = zar2;
        h.querySelector('.boo-gomb').onclick = zar2;
        h.addEventListener('click', function (e) { if (e.target === h) zar2(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && h.isConnected) zar2(); });
      }, 1200);
    }, 500);
  }
  // belépő (Heni 2026-10-20), csak asztalon: első látogatáskor egy nagy BOO úszik át a képernyőn, és maga után húz egy lebegő
  // „NYEREMÉNYJÁTÉK!” szalagot; kb. 5 mp, utána eltűnik. Böngészőnként egyszer.
  function repules(utana) {
    var volt = true;
    try { volt = !!localStorage.getItem('qn-boo-repules') && !/[?&]repules=1\b/.test(location.search); } catch (e) {}
    // csak asztalon (Heni 2026-10-20: „csak desktopon csináld ezt!”)
    if (MOBIL || !JATEK || volt || all.kesz || all.bekuldve || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { utana(); return; }
    try { localStorage.setItem('qn-boo-repules', String(Date.now())); } catch (e) {}
    var r_ = document.createElement('div');
    r_.className = 'boo-repules';
    r_.setAttribute('aria-hidden', 'true');
    r_.innerHTML = '<div class="boo-szalag"><span>NYEREMÉNYJÁTÉK!</span></div><i class="boo-kotel"></i><div class="boo-nagy">' + SZELLEM + '</div>';
    B.appendChild(r_);
    var vw = window.innerWidth, sz = r_.getBoundingClientRect().width, kozep = (vw - sz) / 2;
    r_.style.top = Math.round(window.innerHeight * (MOBIL ? 0.3 : 0.26)) + 'px';
    var a = r_.animate([
      { transform: 'translateX(' + (-sz - 20) + 'px)' },
      { transform: 'translateX(' + kozep + 'px)', offset: 0.32 },
      { transform: 'translateX(' + (kozep + Math.min(40, vw * 0.04)) + 'px)', offset: 0.66 },
      { transform: 'translateX(' + (vw + 20) + 'px)' }
    ], { duration: 5000, easing: 'cubic-bezier(0.45, 0, 0.55, 1)', fill: 'forwards' });
    a.onfinish = function () { r_.remove(); utana(); };
  }
  function rajt() {
    repules(bemutato);
    szamlaloRajz(false);
    if (!(JATEK && all.kesz) && !ITT_MEGVOLT) indit();
    if (ITT_MEGVOLT) tipp('Ezen az oldalon már elkaptad a BOO-t. Keresd a következőt egy másik oldalon!');
    if (JATEK && all.kesz && !all.bekuldve && /[?&]boo=elonezet\b/.test(location.search)) ablak();
  }
  if (document.readyState === 'complete') rajt(); else window.addEventListener('load', rajt);
  if ('ResizeObserver' in window) new ResizeObserver(magassag).observe(B);
})();
