/* Ideiglenes halloweenes szellemek (Heni 2026-10-18): cuki, szálon lógó szellemek, minden betöltéskor más helyen,
   ott, ahol nincs szöveg, a tartalom fölött lassan himbálózva. A render.py HALLOWEEN kapcsolója tölti be. */
(function () {
  if (!document.body.classList.contains('halloween')) return;
  var r = Math.random;
  function koz(a, b) { return a + r() * (b - a); }
  var SZELLEM = '<svg viewBox="0 0 100 112" aria-hidden="true">' +
    '<path class="hw-szal" d="M50 -60V16"/>' +
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

  // a szöveg sorainak helye (oldalkoordinátában): a szellem ide nem kerülhet, képre és üres helyre igen
  var sorok = [], jaro = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: function (n) { return /\S/.test(n.nodeValue) && n.parentElement && n.parentElement.offsetParent ? 1 : 3; } });
  var tart = document.createRange(), sy = window.scrollY, sx = window.scrollX;
  while (jaro.nextNode()) {
    tart.selectNodeContents(jaro.currentNode);
    var rl = tart.getClientRects();
    for (var k = 0; k < rl.length; k++) sorok.push([rl[k].left + sx, rl[k].top + sy, rl[k].right + sx, rl[k].bottom + sy]);
  }
  function szabad(x, y, m) {
    for (var k = 0; k < sorok.length; k++) {
      var q = sorok[k];
      if (x < q[2] + 10 && x + m > q[0] - 10 && y < q[3] + 10 && y + m * 1.12 > q[1] - 10) return false;
    }
    return true;
  }

  var w = document.documentElement.clientWidth, h = document.documentElement.scrollHeight;
  var fejlec = (document.querySelector('[data-fejlec]') || { offsetHeight: 120 }).offsetHeight;
  var db = w < 768 ? 3 : 5;
  for (var i = 0; i < db; i++) {
    var meret = w < 768 ? koz(40, 54) : koz(50, 72), x, y, jo = false;
    for (var p = 0; p < 80 && !jo; p++) {
      x = koz(4, w - meret - 4);
      y = fejlec + 40 + (i + r()) * ((h - fejlec - 200) / db);
      jo = szabad(x, y, meret);
    }
    if (!jo) continue;
    var sz = document.createElement('div');
    sz.className = 'hw-szellem';
    sz.style.width = meret + 'px';
    sz.style.left = x + 'px';
    sz.style.top = y + 'px';
    sz.style.animationDelay = (-koz(0, 6)).toFixed(2) + 's';
    sz.style.animationDuration = koz(4.5, 7).toFixed(2) + 's';
    sz.innerHTML = SZELLEM;
    if (r() < 0.5) sz.firstChild.style.transform = 'scaleX(-1)';
    reteg.appendChild(sz);
  }
  if ('ResizeObserver' in window) new ResizeObserver(magassag).observe(document.body);
})();
