/* Ideiglenes halloweenes pókhálók (Heni 2026-10-18). Minden betöltéskor máshol, más alakban: szabálytalan,
   amorf hálók a tartalom mögött, halvány narancs szálakkal, amelyek betöltéskor „beszövődnek”, és néha egy pók
   is lóg az egyiken. A render.py HALLOWEEN kapcsolója tölti be; kikapcsolva ez a fájl nem fut. */
(function () {
  if (!document.body.classList.contains('halloween')) return;
  var NS = 'http://www.w3.org/2000/svg';
  var mozgas = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var r = Math.random;
  function koz(a, b) { return a + r() * (b - a); }
  function el(nev, attr) { var e = document.createElementNS(NS, nev); for (var k in attr) e.setAttribute(k, attr[k]); return e; }

  var reteg = document.createElement('div');
  reteg.className = 'hw-reteg';
  reteg.setAttribute('aria-hidden', 'true');
  var svg = el('svg', { width: '100%', height: '100%' });
  reteg.appendChild(svg);
  document.body.insertBefore(reteg, document.body.firstChild);

  function magassag() { reteg.style.height = document.documentElement.scrollHeight + 'px'; }
  magassag();

  // Egy háló: szabálytalan szögű és hosszú sugarak, közöttük befelé belógó, néhol elszakadt körszálak.
  function halo(cx, cy, R, kesleltetes) {
    var g = el('g', { class: 'hw-halo' });
    var n = Math.round(koz(7, 11)), szogek = [], kezd = koz(0, Math.PI * 2);
    for (var i = 0; i < n; i++) szogek.push(kezd + (i + koz(-0.3, 0.3)) * (Math.PI * 2 / n));
    var hossz = szogek.map(function () { return R * koz(0.62, 1.05); });
    var d = '';
    szogek.forEach(function (a, i) {
      var h = hossz[i] * (r() < 0.25 ? koz(1.3, 1.9) : 1); // néhány tartószál messzebb fut
      d += 'M' + cx.toFixed(1) + ' ' + cy.toFixed(1) + 'L' + (cx + Math.cos(a) * h).toFixed(1) + ' ' + (cy + Math.sin(a) * h).toFixed(1);
    });
    var gyuruk = Math.round(koz(5, 8));
    for (var k = 1; k <= gyuruk; k++) {
      var t = Math.pow(k / (gyuruk + 0.4), 1.15);
      for (var j = 0; j < n; j++) {
        if (r() < 0.1) continue; // elszakadt szál
        var a0 = szogek[j], a1 = szogek[(j + 1) % n];
        var r0 = hossz[j] * t * koz(0.94, 1.04), r1 = hossz[(j + 1) % n] * t * koz(0.94, 1.04);
        var x0 = cx + Math.cos(a0) * r0, y0 = cy + Math.sin(a0) * r0, x1 = cx + Math.cos(a1) * r1, y1 = cy + Math.sin(a1) * r1;
        var bl = koz(0.72, 0.9); // a szál középen a háló közepe felé lóg be
        var qx = cx + ((x0 + x1) / 2 - cx) * bl, qy = cy + ((y0 + y1) / 2 - cy) * bl + koz(0, R * 0.02);
        d += 'M' + x0.toFixed(1) + ' ' + y0.toFixed(1) + 'Q' + qx.toFixed(1) + ' ' + qy.toFixed(1) + ' ' + x1.toFixed(1) + ' ' + y1.toFixed(1);
      }
    }
    var ut = el('path', { d: d, fill: 'none', class: 'hw-szal', 'stroke-width': koz(0.7, 1.1).toFixed(2), 'stroke-opacity': koz(0.16, 0.28).toFixed(2), pathLength: '1' });
    if (mozgas) { ut.style.strokeDasharray = '1'; ut.style.strokeDashoffset = '1'; ut.style.animationDelay = kesleltetes + 'ms'; ut.classList.add('hw-szo'); }
    g.appendChild(ut);
    svg.appendChild(g);
    return { cx: cx, cy: cy, R: R };
  }

  // Lógó pók egy szálon, lassan fel-le himbálózik.
  function pok(x, y, h) {
    var g = el('g', { class: 'hw-pok' + (mozgas ? ' hw-pok--mozog' : '') });
    g.appendChild(el('path', { d: 'M' + x + ' ' + (y - 400) + 'V' + (y + h), class: 'hw-szal', 'stroke-opacity': '0.3', 'stroke-width': '0.8' }));
    var test = el('g', { transform: 'translate(' + x + ' ' + (y + h) + ')' });
    var lab = '';
    [-1, 1].forEach(function (o) {
      lab += 'M0 0q' + 7 * o + ' -6 ' + 11 * o + ' -2M0 1q' + 8 * o + ' -2 ' + 12 * o + ' 3M0 2q' + 7 * o + ' 2 ' + 10 * o + ' 8M0 3q' + 5 * o + ' 4 ' + 7 * o + ' 11';
    });
    test.appendChild(el('path', { d: lab, fill: 'none', class: 'hw-szal', 'stroke-opacity': '0.55', 'stroke-width': '1.2', 'stroke-linecap': 'round' }));
    test.appendChild(el('ellipse', { cx: 0, cy: 2, rx: 4.2, ry: 5.2, class: 'hw-pok-test' }));
    test.appendChild(el('circle', { cx: 0, cy: -4, r: 2.8, class: 'hw-pok-test' }));
    g.appendChild(test);
    svg.appendChild(g);
  }

  function rajzol() {
    var w = document.documentElement.clientWidth, h = document.documentElement.scrollHeight;
    var kicsi = w < 768;
    var db = Math.max(3, Math.min(9, Math.round(h / (kicsi ? 1100 : 900))));
    var halok = [];
    for (var i = 0; i < db; i++) {
      // a képernyő széleihez húzódnak, ahol kevesebb a tartalom; a sávban egyenletesen, de véletlen helyen
      var bal = r() < 0.5;
      var x = bal ? koz(-0.04, 0.16) * w : koz(0.84, 1.04) * w;
      if (!kicsi && r() < 0.2) x = koz(0.3, 0.7) * w;
      var y = (i + koz(0.1, 0.9)) * (h / db);
      var R = kicsi ? koz(70, 130) : koz(120, 260);
      halok.push(halo(x, y, R, i < 2 ? i * 250 : 0));
    }
    var p = halok[Math.floor(r() * Math.min(halok.length, 2))];
    if (p) pok(p.cx + koz(-0.3, 0.3) * p.R, p.cy, koz(60, 140));
  }
  rajzol();
  if ('ResizeObserver' in window) new ResizeObserver(function () { magassag(); }).observe(document.body);
})();
