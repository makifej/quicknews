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
  // a szabályzat szerint 2026. november 3. 23:59-ig (budapesti idő) lehet játszani; utána a szellemek csak díszek
  var HATARIDO = Date.parse('2026-11-03T22:59:59Z');
  var JATEK = (B.getAttribute('data-boo') === '1' && Date.now() <= HATARIDO) || ELONEZET;
  var CEL = 5;
  var TAR = 'qn-boo';
  var all = { db: 0, kesz: false, bekuldve: false };
  try { var t = JSON.parse(localStorage.getItem(TAR) || 'null'); if (t && typeof t.db === 'number') all = t; } catch (e) {}
  function ment() { try { localStorage.setItem(TAR, JSON.stringify(all)); } catch (e) {} }
  // előnézetben a ?uj=1 nulláról kezdi a játékot (teszteléshez)
  if (ELONEZET && /[?&]uj=1\b/.test(location.search)) { all = { db: 0, kesz: false, bekuldve: false }; ment(); }
  if (JATEK) B.classList.add('boo-jatek');

  var SZELLEM = '<svg viewBox="0 0 100 112" aria-hidden="true">' +
    '<path class="hw-test" d="M26 50Q12 46 9 30M74 50Q88 46 91 30" fill="none" stroke-width="10" stroke-linecap="round"/>' +
    '<path class="hw-test" d="M50 14C30 14 22 32 22 52v24c0 14 12 21 24 19 12 8 30 9 46 3-12-6-16-14-16-24V52c0-20-8-38-26-38z"/>' +
    '<ellipse cx="42" cy="40" rx="3.8" ry="5.2" class="hw-arc"/><ellipse cx="58" cy="40" rx="3.8" ry="5.2" class="hw-arc"/>' +
    '<ellipse cx="50" cy="57" rx="4.6" ry="6.4" class="hw-arc"/></svg>';
  var KIS = '<svg viewBox="0 0 100 112" aria-hidden="true"><path d="M50 14C30 14 22 32 22 52v24c0 14 12 21 24 19 12 8 30 9 46 3-12-6-16-14-16-24V52c0-20-8-38-26-38z"/>' +
    '<ellipse cx="42" cy="40" rx="4.4" ry="6" class="k-arc"/><ellipse cx="58" cy="40" rx="4.4" ry="6" class="k-arc"/><ellipse cx="50" cy="57" rx="5" ry="7" class="k-arc"/></svg>';

  // asztalon a réteg az oldal koordinátáiban van (a szellem a görgetéssel együtt mozog), mobilon a képernyőhöz rögzített
  var reteg = document.createElement('div');
  reteg.className = 'hw-reteg' + (MOBIL ? ' hw-reteg--mobil' : '');
  reteg.setAttribute('aria-hidden', 'true');
  B.insertBefore(reteg, B.firstChild);
  function magassag() { if (!MOBIL) reteg.style.height = document.documentElement.scrollHeight + 'px'; }
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
      (!all.db && !all.kesz ? '<span class="boo-tipp">Kapd el az 5 BOO-t, és nyerhetsz!</span>' : '');
    szamlalo.setAttribute('aria-label', cimke);
    szamlalo.classList.toggle('boo-szamlalo--kesz', !!all.kesz);
    if (ugrik) { szamlalo.classList.remove('boo-ugrik'); void szamlalo.offsetWidth; szamlalo.classList.add('boo-ugrik'); }
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
      if (all.kesz && !all.bekuldve) setTimeout(function () { unnep(); setTimeout(ablak, 900); }, 150);
    };
    setTimeout(function () { sz.remove(); if (!all.kesz) setTimeout(indit, koz(2500, 6000)); }, 700);
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
    sz.style.animationDelay = koz(1, 4).toFixed(2) + 's';
    sz.innerHTML = '<div class="hw-himba">' + SZELLEM + '</div><span class="hw-boo">BOO</span>';
    sz.style.setProperty('--boo', (meret * 0.46).toFixed(0) + 'px');
    var idozito = null;
    function athelyez() {
      var uj = hely(bal, meret) || hely(!bal, meret);
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
  function rajt() {
    szamlaloRajz(false);
    if (!(JATEK && all.kesz)) indit();
    if (JATEK && all.kesz && !all.bekuldve && /[?&]boo=elonezet\b/.test(location.search)) ablak();
  }
  if (document.readyState === 'complete') rajt(); else window.addEventListener('load', rajt);
  if ('ResizeObserver' in window) new ResizeObserver(magassag).observe(B);
})();
