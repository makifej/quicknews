/* Ideiglenes halloweenes szellemek (Heni 2026-10-18): cuki, szellemek, minden betöltéskor más helyen,
   csak üres helyen, a hírek területén soha: halványan, véletlen időben bukkannak fel, pulzálnak egy kicsit, aztán máshol tűnnek fel újra. A render.py HALLOWEEN kapcsolója tölti be. */
(function () {
  // mobilon csak a narancs szín és a tök marad (Heni 2026-10-18)
  if (!document.body.classList.contains('halloween') || document.documentElement.clientWidth < 768) return;
  var r = Math.random;
  function koz(a, b) { return a + r() * (b - a); }
  var SZELLEM = '<svg viewBox="0 0 100 112" aria-hidden="true">' +
        '<path class="hw-test" d="M26 50Q12 46 9 30M74 50Q88 46 91 30" fill="none" stroke-width="10" stroke-linecap="round"/>' +
    '<path class="hw-test" d="M50 14C30 14 22 32 22 52v24c0 14 12 21 24 19 12 8 30 9 46 3-12-6-16-14-16-24V52c0-20-8-38-26-38z"/>' +
    '<ellipse cx="42" cy="40" rx="3.8" ry="5.2" class="hw-arc"/><ellipse cx="58" cy="40" rx="3.8" ry="5.2" class="hw-arc"/>' +
    '<ellipse cx="50" cy="57" rx="4.6" ry="6.4" class="hw-arc"/></svg>';

  var reteg = document.createElement('div');
  reteg.className = 'hw-reteg';
  reteg.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(reteg, document.body.firstChild);
  function magassag() { reteg.style.height = document.documentElement.scrollHeight + 'px'; }
  magassag();

  // tiltott terület: minden hír, kép, videó, cím, szöveg és gomb teljes doboza, a fejléc és a lábléc;
  // minden elhelyezés előtt frissen mérve, mert a később betöltődő képek eltolják a híreket
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

  var w = document.documentElement.clientWidth, h = document.documentElement.scrollHeight;
  var fejlec = (document.querySelector('[data-fejlec]') || { offsetHeight: 120 }).offsetHeight;
  var db = 5;

  // szabad hely keresése a sávjában; ha nincs, null
  function hely(i, meret) {
    var lista = tiltottak();
    w = document.documentElement.clientWidth; h = document.documentElement.scrollHeight;
    // széles képernyőn a tartalom melletti üres oldalsávok az elsők (a lap tetejétől), különben bárhol, ahol üres a hely
    var k = document.querySelector('main .keret') || document.querySelector('main');
    var kb = k ? k.getBoundingClientRect() : { left: 0, right: w };
    var balSav = kb.left - 16, jobbSav = w - kb.right - 16;
    for (var p = 0; p < 120; p++) {
      var x = koz(4, w - meret - 4), y = fejlec + 40 + (i + r()) * ((h - fejlec - 200) / db);
      if (p < 60 && (balSav > meret + 24 || jobbSav > meret + 24)) {
        var bal = balSav > meret + 24 && (jobbSav <= meret + 24 || r() < 0.5);
        x = bal ? koz(12, balSav - meret - 12) : koz(kb.right + 28 + meret * 1.4, w - meret - 12);
        if (i === 0) y = fejlec + koz(20, 260);
      }
      // előbb a szellem elé próbálja a feliratot; ha ott hírre lógna, mögé
      if (szabad(x, y, meret, lista, true)) return [x, y, true];
      if (szabad(x, y, meret, lista, false)) return [x, y, false];
    }
    return null;
  }

  // minden szellem halványan felbukkan, pulzál egy kicsit, eltűnik, és a következő körben máshol jelenik meg
  // csak a teljes betöltés után (képekkel együtt) helyez el, hogy a mért elrendezés a végleges legyen
  function indit() { for (var i = 0; i < db; i++) (function (i) {
    var meret = koz(50, 72), xy = hely(i, meret);
    if (!xy) return;
    var sz = document.createElement('div');
    sz.className = 'hw-szellem';
    sz.style.width = meret + 'px';
    sz.style.left = xy[0] + 'px';
    sz.style.top = xy[1] + 'px';
    sz.style.animationDuration = koz(8, 13).toFixed(2) + 's';
    sz.style.animationDelay = koz(0, 9).toFixed(2) + 's';
    // a szellem előtt egy „BOO”, vastag filces kézírással; ha ott hírre lógna, a szellem mögé kerül
    sz.innerHTML = '<div class="hw-himba">' + SZELLEM + '</div><span class="hw-boo' + (xy[2] ? '' : ' hw-boo--jobb') + '">BOO</span>';
    sz.style.setProperty('--boo', (meret * 0.46).toFixed(0) + 'px');
    if (r() < 0.5) sz.querySelector('svg').style.transform = 'scaleX(-1)';
    sz.addEventListener('animationiteration', function (e) {
      if (e.target !== sz) return;
      var uj = hely(i, meret);
      if (uj) { sz.style.left = uj[0] + 'px'; sz.style.top = uj[1] + 'px'; sz.style.visibility = ''; sz.lastChild.classList.toggle('hw-boo--jobb', !uj[2]); }
      else sz.style.visibility = 'hidden'; // ebben a körben nincs szabad hely: nem jelenik meg
    });
    reteg.appendChild(sz);
  })(i); }
  if (document.readyState === 'complete') indit(); else window.addEventListener('load', indit);
  if ('ResizeObserver' in window) new ResizeObserver(magassag).observe(document.body);
})();
