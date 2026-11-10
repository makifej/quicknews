// Főhír (főoldal): a sorsolást a doboz utáni beágyazott szkript végzi (render.py FO_SORSOLO); itt csak az, hogy a látható
// főhír lejjebb ne szerepeljen még egyszer
(function(){
  var fo = document.querySelector('[data-fo-keszlet]'); if (!fo) return;
  var v = [].slice.call(fo.children).filter(function(el){ return !el.hidden; })[0]; if (!v) return;
  var hid = v.getAttribute('data-hid') || '';
  if (hid) [].forEach.call(document.querySelectorAll('[data-hid="' + hid + '"]'), function(el){ if (!fo.contains(el)) { var li = el.closest('li'); (li || el).hidden = true; } });
})();
// Jobbra fent (főoldal és rovatoldal): a készlet jelöltjei közül betöltésenként véletlen egy látszik (Heni 2026-10-15)
(function(){
  var fo = document.querySelector('[data-jobb-fo]'); if (!fo) return;
  var lapok = [].slice.call(fo.children); if (lapok.length < 2) return;
  // nem ugyanaz jön, mint az előző betöltéskor ezen az oldalon (a böngésző megjegyzi, mit mutatott utoljára)
  var kulcs = 'qn-jobb-fo:' + location.pathname, elozo = null;
  try { elozo = localStorage.getItem(kulcs); } catch (e) {}
  var jeloltek = lapok.filter(function(el){ return el.getAttribute('data-hid') !== elozo; });
  if (!jeloltek.length) jeloltek = lapok;
  var valasztott = jeloltek[Math.floor(Math.random() * jeloltek.length)];
  lapok.forEach(function(el){ el.hidden = el !== valasztott; });
  var hid = valasztott.getAttribute('data-hid') || '';
  try { localStorage.setItem(kulcs, hid); } catch (e) {}
  // ugyanaz a hír ne szerepeljen még egyszer lejjebb a lapon
  if (hid) [].forEach.call(document.querySelectorAll('[data-hid="' + hid + '"]'), function(el){ if (!fo.contains(el)) { var li = el.closest('li'); (li || el).hidden = true; } });
})();
// Főoldal, jobb oszlop: a készletből minden betöltéskor véletlenszerűen 3 sima és 2 képes hír, váltakozva
(function(){
  var v = document.querySelector('.jobb-vegyes[data-keszlet]'); if (!v) return;
  var kever = function(t){ for (var i = t.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = t[i]; t[i] = t[j]; t[j] = x; } return t; };
  var sz = kever([].slice.call(v.querySelectorAll('[data-tipus="szoveg"]'))), kp = kever([].slice.call(v.querySelectorAll('[data-tipus="kep"]')));
  var sor = [sz[0], kp[0], sz[1], kp[1], sz[2]].filter(Boolean);
  [].forEach.call(v.children, function(el){ el.hidden = true; el.classList.remove('elhagyhato'); });
  sor.forEach(function(el, i){ el.hidden = false; if (i === 4) el.classList.add('elhagyhato'); v.appendChild(el); });
  // kiegyensúlyozás (2026-10-13): ha a bal oszlop jóval hosszabb, a jobb oszlop a készletből még hírt kap, hogy ne maradjon üres hely
  var tartalek = [sz[3], kp[2], sz[4], kp[3], sz[5]].filter(Boolean);
  var bal = document.querySelector('.vezeto-bal');
  var vege = function(el){ var u = el.lastElementChild; while (u && (u.hidden || !u.getBoundingClientRect().height)) u = u.previousElementSibling; return u ? u.getBoundingClientRect().bottom : 0; };
  var egyensuly = function(){
    if (!bal || window.innerWidth <= 900) return;
    while (tartalek.length && vege(bal) - vege(v) > 90) { var el = tartalek.shift(); el.hidden = false; v.appendChild(el); }
  };
  egyensuly(); window.addEventListener('load', egyensuly);
})();
// SEC-001 (2026-10-11): a feed.json mezői külső tartalomból jönnek, innerHTML-be csak escape-elve kerülhetnek
function qnEsc(t){ return String(t == null ? '' : t).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function qnSlug(s){ return typeof s === 'string' && /^[a-z0-9-]{1,200}$/.test(s); }
function qnKep(k){ return (typeof k === 'string' && (/^\/assets\/[\w.\/-]+$/.test(k) || /^https:\/\/[^\s"'<>]+$/.test(k))) ? k : ''; }
// mobilon (Heni 2026-10-20) a „Kérdezz!” gomb görgetéskor kerek ikonná húzódik össze, és pár másodpercenként megnő; fent újra kinyílik
(function(){
  var dob = document.querySelector('[data-chat]'); if (!dob) return;
  var var_ = false;
  var nez = function(){ var_ = false; dob.classList.toggle('osszecsukva', window.scrollY > 120); };
  window.addEventListener('scroll', function(){ if (!var_) { var_ = true; requestAnimationFrame(nez); } }, {passive: true});
  nez();
})();
// qn-chat: „Kérdezz a hírektől!” (api/kerdez). A beszélgetés a böngészőfül munkamenetében megmarad
// (sessionStorage): oldalról oldalra viszi, a fül bezárásával törlődik.
(function(){
  var dob = document.querySelector('[data-chat]'); if (!dob) return;
  var indit = dob.querySelector('[data-chat-indit]'), panel = dob.querySelector('.chat-panel'), lista = dob.querySelector('[data-chat-uzenetek]');
  var urlap = dob.querySelector('[data-chat-urlap]'), mezo = urlap.querySelector('input'), kuld = urlap.querySelector('button');
  var TAR = 'qn-chat', all = {nyitva: false, uzenetek: []}, alapGomb = dob.querySelector('[data-chat-alap]');
  var KEZDO = lista.innerHTML; // a kiindulási állapot: az alap kérdésjavaslatok
  try { all = JSON.parse(sessionStorage.getItem(TAR)) || all; } catch(e){}
  function ment(){ try { sessionStorage.setItem(TAR, JSON.stringify(all)); } catch(e){} }
  function ev(nev, adat){ try { if (window.gtag) gtag('event', nev, adat || {}); } catch(e){} }
  function biztos(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function nyit(n, csendes){ panel.hidden = !n; indit.setAttribute('aria-expanded', n ? 'true' : 'false'); dob.classList.toggle('nyitva', n);
    all.nyitva = n; ment(); if (n && !csendes) { setTimeout(function(){ mezo.focus(); }, 50); ev('chat_megnyitas'); } }
  indit.addEventListener('click', function(){ nyit(panel.hidden); });
  dob.querySelector('[data-chat-zar]').addEventListener('click', function(){ nyit(false); indit.focus(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !panel.hidden) { nyit(false); indit.focus(); } });
  // dátum az oldal többi részével egyezően (Audit 2026-11-03): „nov. 2. 14:05”, budapesti idő
  var HO = ['jan.','febr.','márc.','ápr.','máj.','jún.','júl.','aug.','szept.','okt.','nov.','dec.'];
  function datum(d){ var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(d || ''); return m ? HO[+m[2]-1] + ' ' + (+m[3]) + '.' + (m[4] ? ' ' + m[4] + ':' + m[5] : '') : ''; }
  function idoHu(ido){ var p = new Intl.DateTimeFormat('hu-HU', {timeZone: 'Europe/Budapest', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false}).formatToParts(ido);
    var g = function(t){ var x = p.filter(function(y){ return y.type === t; })[0]; return x ? x.value : ''; };
    return HO[+g('month')-1] + ' ' + (+g('day')) + '. ' + g('hour') + ':' + g('minute'); }
  var IK = {
    szikra: '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M197.58 129.06l-51.61-19-19-51.65a15.92 15.92 0 0 0-29.88 0L78.07 110l-51.65 19a15.92 15.92 0 0 0 0 29.88L78 177.93l19 51.62a15.92 15.92 0 0 0 29.88 0l19-51.61 51.65-19a15.92 15.92 0 0 0 0-29.88ZM140.39 163a15.87 15.87 0 0 0-9.43 9.43l-19 51.46L93 172.39a15.87 15.87 0 0 0-9.39-9.39l-51.46-19 51.46-19a15.87 15.87 0 0 0 9.39-9.39l19-51.46 19 51.46a15.87 15.87 0 0 0 9.39 9.39l51.46 19ZM144 40a8 8 0 0 1 8-8h16V16a8 8 0 0 1 16 0v16h16a8 8 0 0 1 0 16h-16v16a8 8 0 0 1-16 0V48h-16a8 8 0 0 1-8-8Zm104 48a8 8 0 0 1-8 8h-8v8a8 8 0 0 1-16 0v-8h-8a8 8 0 0 1 0-16h8v-8a8 8 0 0 1 16 0v8h8a8 8 0 0 1 8 8Z"/></svg>',
    lap: '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M213.66 82.34l-56-56A8 8 0 0 0 152 24H56a16 16 0 0 0-16 16v176a16 16 0 0 0 16 16h144a16 16 0 0 0 16-16V88a8 8 0 0 0-2.34-5.66ZM160 51.31 188.69 80H160ZM200 216H56V40h88v48a8 8 0 0 0 8 8h48v120Zm-32-80a8 8 0 0 1-8 8H96a8 8 0 0 1 0-16h64a8 8 0 0 1 8 8Zm0 32a8 8 0 0 1-8 8H96a8 8 0 0 1 0-16h64a8 8 0 0 1 8 8Z"/></svg>'
  };
  // A válasz pontjai: egy hírről szóló pontnál maga a szöveg visz a hírre (asztalon ráhúzva felugró ablak),
  // több hírt összefogó pontnál csak a narancs szaggatott vonallal aláhúzott részlet, hírenként.
  // Audit 2026-11-03: a ráhúzásra felugró hírkártya rácsúszott a válasz szövegére. Helyette minden pont végén a forrás
  // sorszáma, a válasz alján pedig a hivatkozott hírek listája címmel és dátummal.
  function tipp(){ return ''; }
  function jel(l){ return l.length ? ' <span class="chat-fsz">' + l.map(function(n){ return '<a href="#" data-chat-f="'+n+'" aria-label="'+n+'. forrás">'+n+'</a>'; }).join('') + '</span>' : ''; }
  function pontHtml(x, fm){
    var l = (x.forras || []).filter(function(n){ return fm[n]; });
    if (l.length === 1) { var f = fm[l[0]];
      return '<a class="chat-hirpont" href="'+biztos(f.url)+'">'+biztos(x.szoveg)+'</a>' + jel(l); }
    var t = String(x.szoveg || ''), rr = [];
    var szabad = function(i, v){ return rr.every(function(r){ return v <= r.i || i >= r.v; }); };
    (x.reszek || []).forEach(function(r){ var i = t.indexOf(r.resz); if (i >= 0 && fm[r.forras] && szabad(i, i + r.resz.length)) rr.push({i: i, v: i + r.resz.length, f: fm[r.forras], n: r.forras}); });
    // ha egy hírhez nincs részlet (vagy régebbi, részlet nélküli válasz), a hír címének egy csak rá jellemző szavát jelöljük
    var SZO = /[0-9A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű][0-9A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű.\-]*[0-9A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]/g;
    var szavak = function(s){ return (String(s || '').match(SZO) || []).filter(function(w){ return w.length >= 4; }); };
    var tobe = function(w){ return w.toLowerCase().slice(0, 5); };
    var nagy = function(w){ return /^[A-ZÁÉÍÓÖŐÚÜŰ0-9]/.test(w) ? 1 : 0; };
    l.forEach(function(n){
      if (rr.some(function(r){ return r.n === n; })) return;
      var masik = {}; l.forEach(function(m){ if (m !== n) szavak(fm[m].cim + ' ' + (fm[m].lead || '')).forEach(function(w){ masik[tobe(w)] = 1; }); });
      var jo = {}; szavak(fm[n].cim).concat(szavak(fm[n].lead)).forEach(function(w){ if (!masik[tobe(w)]) jo[tobe(w)] = 1; });
      // a megkülönböztető név jellemzően hátrébb áll a mondatban (a közös alany elöl), ezért a legutolsó találat nyer, a nagybetűs előnyben
      var best = null, m; SZO.lastIndex = 0;
      while ((m = SZO.exec(t))) { if (m[0].length >= 4 && jo[tobe(m[0])] && szabad(m.index, m.index + m[0].length)
        && (!best || nagy(m[0]) >= nagy(best[0]))) best = m; }
      if (best) rr.push({i: best.index, v: best.index + best[0].length, f: fm[n], n: n});
    });
    rr.sort(function(a, b){ return a.i - b.i; });
    var ki = '', poz = 0;
    rr.forEach(function(r){ if (r.i < poz) return;
      ki += biztos(t.slice(poz, r.i)) + '<a class="chat-resz" href="'+biztos(r.f.url)+'">'+biztos(t.slice(r.i, r.v))+tipp(r.f)+'</a>'; poz = r.v; });
    return '<span class="chat-psz">' + ki + biztos(t.slice(poz)) + jel(l) + '</span>';
  }
  function forrasLista(j){ var f = (j.forrasok || []).slice().sort(function(a, b){ return a.n - b.n; }); if (!f.length) return '';
    return '<ol class="chat-forrasok" aria-label="Források">' + f.map(function(x){ return '<li data-n="'+x.n+'"><span class="chat-fn">'+x.n+'</span><a class="chat-hirpont" href="'+biztos(x.url)+'">'+biztos(x.cim)+'</a>'
      + (x.datum ? '<time>'+datum(x.datum)+'</time>' : '') + '</li>'; }).join('') + '</ol>'; }
  function rajzol(u){
    var d = document.createElement('div');
    if (u.en) { d.className = 'chat-b en'; d.innerHTML = biztos(u.en); }
    else if (u.hiba) { d.className = 'chat-b bot hiba'; d.innerHTML = biztos(u.hiba) + (u.kerdes ? ' <button type="button" class="chat-ujra" data-chat-ujra>Újrapróbálom</button>' : ''); if (u.kerdes) d.dataset.kerdes = u.kerdes; }
    else if (u.info) { d.className = 'chat-b bot info'; d.innerHTML = biztos(u.info).replace('Napok menüben', '<a href="/napok">Napok</a> menüben'); }
    else {
      var j = u.bot, fm = {}; (j.forrasok || []).forEach(function(f){ fm[f.n] = f; });
      var torzs = (j.pontok && j.pontok.length) || j.bevezeto
        ? (j.bevezeto ? '<p class="chat-bev">'+biztos(j.bevezeto)+'</p>' : '') + ((j.pontok || []).length ? '<ul class="chat-pontok">' + j.pontok.map(function(x){ return '<li>'+pontHtml(x, fm)+'</li>'; }).join('') + '</ul>' : '')
        : '<p>'+biztos(j.valasz || '')+'</p>';
      var ido = u.ido ? new Date(u.ido) : null;
      var lab = '<div class="ai-lab"><span>'+IK.lap+'A quicknews.hu híreiből</span>' + (ido ? '<span>Válasz: <time>'+idoHu(ido)+'</time></span>' : '') + '</div>'
        + (j.tartalek ? '<button type="button" class="chat-ujra" data-chat-ujra>Újrapróbálom</button>' : '');
      d.className = 'chat-valasz';
      d.innerHTML = '<div class="ai-sor"><span class="ai-ikon">'+IK.szikra+'</span><div class="chat-b bot ai-buborek">'+torzs+forrasLista(j)+lab+'</div></div>'
        + masok(u.kerdes);
      if (j.tartalek) d.dataset.kerdes = u.kerdes || '';
    }
    lista.appendChild(d); return d;
  }
  function gorget(){ lista.scrollTop = lista.scrollHeight; }
  // a görgetési helyzet a munkamenetben megmarad: hírre kattintva, oldalváltáskor sem ugrik el
  var gt = 0; function helyMent(){ all.gorgetes = lista.scrollTop; ment(); }
  lista.addEventListener('scroll', function(){ clearTimeout(gt); gt = setTimeout(helyMent, 150); }, {passive: true});
  window.addEventListener('pagehide', helyMent);
  // a leggyakoribb kérdések (api/kerdez?mi=nepszeru): kattintható javaslatok, hogy ne kelljen gépelni
  var nepszeru = all.nepszeru || [];
  function masok(volt){ var l = nepszeru.filter(function(k){ return k.toLowerCase() !== String(volt || '').toLowerCase(); }).slice(0, 3);
    return l.length ? '<div class="chat-masok"><span>Mások ezt is kérdezték:</span>' + l.map(function(k){ return '<button type="button" class="chat-javas">'+biztos(k)+'</button>'; }).join('') + '</div>' : ''; }
  function javaslatok(){ var jv = lista.querySelector('.chat-javaslat'); if (!jv || !nepszeru.length) return;
    jv.innerHTML = '<span class="chat-javaslat-cim">Gyakori kérdések</span>' + nepszeru.map(function(k){ return '<button type="button">'+biztos(k)+'</button>'; }).join(''); }
  fetch('/api/kerdez?mi=nepszeru').then(function(r){ return r.json(); }).then(function(j){
    if (j && j.kerdesek && j.kerdesek.length) { nepszeru = j.kerdesek; all.nepszeru = nepszeru; ment(); javaslatok(); }
  }).catch(function(){});
  var utolso = null;
  function uj(u){ all.uzenetek.push(u); all.uzenetek = all.uzenetek.slice(-30); ment(); var d = rajzol(u); utolso = d; alapGomb.disabled = false;
    // a kész válasz elejére görgetünk, nem a lista aljára
    if (u.bot) { lista.scrollTop = Math.max(0, d.offsetTop - 8); } else gorget(); helyMent(); }
  if (all.uzenetek.length) { var jav0 = lista.querySelector('.chat-javaslat'); if (jav0) jav0.remove(); all.uzenetek.forEach(rajzol); }
  function alapAllapot(){ alapGomb.disabled = !all.uzenetek.length; }
  alapAllapot();
  // „Kiindulási állapot visszaállítása”: a beszélgetés törlődik, visszajönnek az alap kérdések
  alapGomb.addEventListener('click', function(){
    all.uzenetek = []; delete all.gorgetes; ment();
    lista.innerHTML = KEZDO; javaslatok(); lista.scrollTop = 0; alapAllapot(); mezo.value = ''; mezo.focus(); ev('chat_alaphelyzet'); });
  // Audit 2026-11-03: oldalváltás után a panel ne takarja a következő oldalt; a beszélgetés megmarad, a gombbal újranyitható.
  // Kivétel: mobilon a válaszból megnyitott hírről visszalépve (Heni 2026-10-19) ugyanazon az oldalon újra kinyílik.
  var visszaJott = all.vissza && all.vissza === location.pathname;
  all.nyitva = !!visszaJott; delete all.vissza; ment();
  if (all.nyitva) { nyit(true, true); setTimeout(function(){ if (typeof all.gorgetes === 'number') lista.scrollTop = all.gorgetes; else gorget(); }, 0); }
  function kerdez(q){
    q = (q || '').trim(); if (q.length < 3) return;
    var jav = lista.querySelector('.chat-javaslat'); if (jav) jav.remove();
    uj({en: q}); mezo.value = ''; mezo.disabled = kuld.disabled = true;
    var var_ = document.createElement('div'); var_.className = 'chat-b bot var'; var_.innerHTML = '<span class="chat-pont"></span><span class="chat-pont"></span><span class="chat-pont"></span>'; lista.appendChild(var_); gorget();
    ev('chat_kerdes');
    fetch('/api/kerdez', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({kerdes:q})})
      .then(function(r){ return r.json(); })
      .then(function(j){ var_.remove(); uj(j.hiba ? {hiba: j.hiba, kerdes: q} : j.info ? {info: j.info} : {bot: j, kerdes: q, ido: new Date().toISOString()}); })
      .catch(function(){ var_.remove(); uj({hiba: 'Most nem sikerült választ adni.', kerdes: q}); })
      // Audit 2026-11-03: a válasz után a fókusz a válaszra kerül (képernyőolvasó onnan olvas, mobilon nem ugrik fel a billentyűzet);
      // a mezőhöz a Tab vagy egy koppintás visz vissza
      .then(function(){ mezo.disabled = kuld.disabled = false;
        if (utolso && !utolso.classList.contains('en')) { utolso.setAttribute('tabindex', '-1'); utolso.focus({preventScroll: true}); } else mezo.focus(); });
  }
  urlap.addEventListener('submit', function(e){ e.preventDefault(); kerdez(mezo.value); });
  lista.addEventListener('click', function(e){
    if (e.target.closest('.chat-hirpont, .chat-resz')) {
      // mobilon a chat a teljes képernyőt takarja: hírre ugráskor összecsukjuk, hogy a hír látsszon (a beszélgetés megmarad)
      // visszalépéskor (Heni 2026-10-19) ugyanezen az oldalon újra kinyílik, a kérdés és a válasz ott van
      if (window.matchMedia('(max-width: 767px)').matches) { all.nyitva = false; all.vissza = location.pathname; }
      helyMent(); ev('chat_forras_kattintas', {resz: !!e.target.closest('.chat-resz')}); return; }
    var fsz = e.target.closest('[data-chat-f]');
    if (fsz) { e.preventDefault(); var li = fsz.closest('.chat-valasz').querySelector('.chat-forrasok li[data-n="'+fsz.dataset.chatF+'"]');
      if (li) { li.scrollIntoView({block: 'nearest', behavior: 'smooth'}); li.classList.add('villan'); setTimeout(function(){ li.classList.remove('villan'); }, 1200); } return; }
    var uj_ = e.target.closest('[data-chat-ujra]');
    if (uj_) { var hol = uj_.closest('[data-kerdes]'); var kq = hol && hol.dataset.kerdes; if (kq) { ev('chat_ujraprobalas');
      var ix = Array.prototype.indexOf.call(lista.children, hol); hol.remove(); all.uzenetek = all.uzenetek.filter(function(u, i){ return !(u.kerdes === kq && (u.hiba || (u.bot && u.bot.tartalek))); });
      var enIx = -1; all.uzenetek.forEach(function(u, i){ if (u.en === kq) enIx = i; }); if (enIx >= 0) { all.uzenetek.splice(enIx, 1); var enEl = lista.children[ix - 1]; if (enEl && enEl.classList.contains('en')) enEl.remove(); }
      ment(); kerdez(kq); } return; }
    var b = e.target.closest('.chat-javaslat button, .chat-javas'); if (b) { ev('chat_javaslat'); kerdez(b.textContent); } });
})();
// Fel- és leszavazás (api/szavaz): a látogató egy véletlen, névtelen azonosítót kap a helyi tárolóban
(function(){
  // az azonosító csak az első szavazáskor jön létre (adatvédelmi tájékoztató: „Szavazás a hírekre”)
  var L = ''; try { L = localStorage.getItem('qn-l') || ''; if (!/^[a-z0-9]{16,40}$/.test(L)) L = ''; } catch(e){}
  function azonosito(){ if (L) return L; var u = ''; try { var r = new Uint8Array(16); crypto.getRandomValues(r); for (var i = 0; i < 16; i++) u += (r[i] < 16 ? '0' : '') + r[i].toString(16); } catch(e) { for (var j = 0; j < 24; j++) u += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; }
    try { localStorage.setItem('qn-l', u); } catch(e){} L = u; return L; }
  function fmt(n){ var a = Math.abs(n); if (a >= 1000) { var k = (a / 1000).toFixed(a >= 10000 ? 0 : 1).replace('.', ',').replace(',0', ''); return (n < 0 ? '-' : '') + k + 'K'; } return String(n); }
  var dobozok = [].slice.call(document.querySelectorAll('[data-szavaz]'));
  var kartyak = [].slice.call(document.querySelectorAll('[data-hid]'));
  var ids = dobozok.map(function(d){ return d.getAttribute('data-szavaz'); }).concat(kartyak.map(function(k){ return k.getAttribute('data-hid'); }));
  ids = ids.filter(function(x, i){ return ids.indexOf(x) === i; });
  function rajzolMind(id, pont, sajat){ dobozok.forEach(function(x){ if (x.getAttribute('data-szavaz') === id) rajzol(x, pont, sajat); }); }
  function rajzol(d, pont, sajat){ d.setAttribute('data-sajat', String(sajat)); d.querySelector('.sz-db').textContent = fmt(pont);
    d.querySelector('.sz-fel').setAttribute('aria-pressed', sajat === 1 ? 'true' : 'false'); d.querySelector('.sz-le').setAttribute('aria-pressed', sajat === -1 ? 'true' : 'false'); }
  function jel(k, pont){ if (!pont) return; var sp = k.querySelectorAll(':scope > span'); var m = k.querySelector('.hmeta') || (k.classList.contains('kiemelt-sav') ? null : sp[sp.length - 1]); var s = document.createElement('span');
    s.className = 'sz-jel ' + (pont > 0 ? 'poz' : 'neg'); s.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 3.5 13H9v7.5h6V13h5.5z"/></svg>' + fmt(pont);
    s.setAttribute('aria-label', 'Pontszám: ' + pont); var hova = m || k, mj = hova.querySelector(':scope > .mentes-jel'); if (mj) hova.insertBefore(s, mj); else hova.appendChild(s); }
  if (!ids.length) return;
  for (var c = 0; c < ids.length; c += 150) (function(resz){
    fetch('/api/szavaz?ids=' + resz.join(',') + (dobozok.length && L ? '&l=' + L : '')).then(function(r){ return r.json(); }).then(function(j){
      dobozok.forEach(function(d){ var id = d.getAttribute('data-szavaz'); if (resz.indexOf(id) >= 0) rajzol(d, (j.pont || {})[id] || 0, (j.sajat || {})[id] || 0); });
      kartyak.forEach(function(k){ var id = k.getAttribute('data-hid'); if (resz.indexOf(id) >= 0) jel(k, (j.pont || {})[id] || 0); });
    }).catch(function(){});
  })(ids.slice(c, c + 150));
  function uzen(d, t){ if (!t) return; var u = d.parentNode.querySelector('.sz-uzenet');
    if (!u) { u = document.createElement('p'); u.className = 'sz-uzenet'; u.setAttribute('role', 'status'); d.after(u); }
    u.textContent = t; clearTimeout(u._t); u._t = setTimeout(function(){ u.remove(); }, 5000); }
  dobozok.forEach(function(d){ d.addEventListener('click', function(e){
    var b = e.target.closest('button[data-ertek]'); if (!b) return; azonosito();
    var id = d.getAttribute('data-szavaz'), regi = Number(d.getAttribute('data-sajat')), ert = Number(b.getAttribute('data-ertek'));
    var uj = regi === ert ? 0 : ert, db = d.querySelector('.sz-db'), elozo = db.textContent;
    var most = Number(String(elozo).replace(',', '.').replace('K', '')) * (/K/.test(elozo) ? 1000 : 1);
    rajzolMind(id, Math.round(most + uj - regi), uj); // azonnal látszik, a szerver válasza pontosítja
    fetch('/api/szavaz', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: id, l: L, ertek: uj})})
      .then(function(r){ return r.json(); }).then(function(j){ if (typeof j.pont === 'number') rajzolMind(id, j.pont, j.sajat); else { rajzolMind(id, most, regi); uzen(d, j.hiba); } })
      .catch(function(){ rajzolMind(id, most, regi); });
    try { if (window.gtag) gtag('event', 'szavazas', {ertek: uj}); } catch(e2){}
  }); });
})();
// „Szeretnéd, hogy behúzzuk a cikkeidet?” gomb: ha van ajánlatkérő űrlap, oda visz és megjelöli a témát
(function(){
  var g = document.querySelector('[data-partner]'), f = document.querySelector('[data-hirdeto]'); if (!g || !f) return;
  g.setAttribute('href', '#hird-cim');
  g.addEventListener('click', function(e){
    e.preventDefault(); f.elements.tema.value = 'hirfolyam';
    var jel = document.querySelector('[data-tema-jel]'); if (jel) jel.hidden = false;
    var doboz = f.closest('.hirdeto');
    doboz.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center'});
    setTimeout(function(){ f.elements.nev.focus({preventScroll: true}); }, 500);
  });
})();
// Hirdetői érdeklődés (api/hirdetes): név, weboldal, telefonszám
(function(){
  var f = document.querySelector('[data-hirdeto]'); if (!f) return;
  var gomb = f.querySelector('button'), uz = f.parentNode.querySelector('.hird-uzenet');
  var tel = f.querySelector('[name=telefon]'), info = f.querySelector('[data-kulfoldi]');
  // külföldi szám jelzése gépelés közben: + vagy 00 előtag, de nem magyar (+36 / 0036)
  function kulfoldi(v){ v = String(v || '').replace(/[\s().\-\/]/g, ''); return /^(\+|00)/.test(v) && !/^(\+36|0036)/.test(v) && v.replace(/\D/g, '').length >= 2; }
  tel.addEventListener('input', function(){ info.hidden = !kulfoldi(tel.value); });
  f.addEventListener('input', function(e){ if (e.target.getAttribute('aria-invalid') === 'true') e.target.removeAttribute('aria-invalid'); });
  f.addEventListener('submit', function(e){
    e.preventDefault(); var d = {}; [].forEach.call(f.elements, function(x){ if (x.name) d[x.name] = x.value; }); d.oldal = location.pathname;
    gomb.disabled = true; gomb.textContent = 'Küldés…'; uz.className = 'hird-uzenet'; uz.textContent = '';
    fetch('/api/hirdetes', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(d)})
      .then(function(r){ return r.json(); })
      .then(function(j){ uz.className = 'hird-uzenet ' + (j.ok ? 'ok' : 'hiba'); uz.textContent = j.uzenet || '';
        if (!j.ok && j.mezo) { var m = f.querySelector('[name=' + j.mezo + ']'); if (m) { m.setAttribute('aria-invalid', 'true'); m.focus(); } }
        if (j.kulfoldi) info.hidden = false;
        if (j.ok) { f.reset(); f.hidden = true; try { if (window.gtag) gtag('event', 'hirdetoi_erdeklodes'); if (window.fbq) fbq('track', 'Lead'); } catch(e2){} } })
      .catch(function(){ uz.className = 'hird-uzenet hiba'; uz.textContent = 'Most nem sikerült elküldeni. Írj nekünk az info@adverr.hu címre!'; })
      .then(function(){ gomb.disabled = false; gomb.textContent = 'Kérem az ajánlatot'; });
  });
})();
// Hírbeküldés (api/bekuld): csak a link, a szerver és a moderátor AI dönt
(function(){
  var f = document.querySelector('[data-bekuldo]'); if (!f) return;
  var mezo = f.querySelector('input'), gomb = f.querySelector('button'), uz = f.parentNode.querySelector('.bek-uzenet');
  f.addEventListener('submit', function(e){
    e.preventDefault(); var u = mezo.value.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(u)) { uz.className = 'bek-uzenet hiba'; uz.textContent = 'Másold be a hír teljes linkjét (https://…).'; mezo.focus(); return; }
    gomb.disabled = mezo.disabled = true; gomb.textContent = 'Ellenőrizzük…'; uz.className = 'bek-uzenet'; uz.textContent = '';
    fetch('/api/bekuld', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({url: u})})
      .then(function(r){ return r.json(); })
      .then(function(j){ uz.className = 'bek-uzenet ' + (j.allapot === 'dontesre_var' ? 'ok' : j.allapot === 'megvan' ? '' : 'hiba');
        uz.textContent = j.uzenet || 'Köszönjük!'; if (j.link) { var a = document.createElement('a'); a.href = j.link; a.textContent = ' Megnézem'; uz.appendChild(a); }
        if (j.allapot !== 'hiba') mezo.value = '';
        try { if (window.gtag) gtag('event', 'hir_bekuldes', {allapot: j.allapot}); } catch(e2){} })
      .catch(function(){ uz.className = 'bek-uzenet hiba'; uz.textContent = 'Most nem sikerült elküldeni, próbáld újra kicsit később!'; })
      .then(function(){ gomb.disabled = mezo.disabled = false; gomb.textContent = 'Beküldöm'; });
  });
})();
(function(){
  document.querySelectorAll('.szakasz-tobb').forEach(function(b){ b.addEventListener('click', function(){ var r=b.parentElement.querySelector('.szakasz-rejtett'); var ny=!r.hidden; r.hidden=ny; b.setAttribute('aria-expanded', ny?'false':'true'); b.textContent = ny ? b.dataset.cimke : 'Kevesebb'; if(!b.dataset.cimke) b.dataset.cimke=b.textContent; }); b.dataset.cimke=b.textContent; });
  var csoportos = document.querySelector('.csoportos');
  var szurok = document.querySelectorAll('.szuro');
  if (szurok.length) {
    var kartyak = document.querySelectorAll('.folyam .kartya');
    var ures = document.querySelector('.folyam .ures');
    var akt = {kat:'mind', forras:'mind'};
    function alkalmaz(){
      document.querySelectorAll('.szuro button').forEach(function(b){
        var kulcs = b.dataset.kat !== undefined ? 'kat' : 'forras';
        b.setAttribute('aria-pressed', b.dataset[kulcs]===akt[kulcs] ? 'true':'false');
      });
      document.querySelectorAll('.szuro-mobil select').forEach(function(sel){ sel.value = akt[sel.dataset.dim]; });
      if (csoportos) {
        document.querySelectorAll('.szakasz').forEach(function(sz){
          var ok = akt.kat==='mind' || akt.kat==='videoval' || sz.dataset.kat===akt.kat;
          if (sz.dataset.kat==='mind' && akt.kat!=='mind') ok=false;
          sz.style.display = ok?'':'none';
          if (ok && akt.kat!=='mind') { var r=sz.querySelector('.szakasz-rejtett'); if(r){ r.hidden=false; } var b=sz.querySelector('.szakasz-tobb'); if(b) b.hidden=true; }
        });
      }
      var n=0;
      kartyak.forEach(function(k){
        var okK = akt.kat==='mind' || (akt.kat==='videoval' ? k.dataset.media==='video' : k.dataset.kat===akt.kat);
        if (csoportos && akt.kat!=='videoval') okK = true;
        var okF = akt.forras==='mind' || (' '+k.dataset.forras+' ').indexOf(' '+akt.forras+' ')>=0;
        var ok = okK && okF;
        k.style.display = ok?'':'none'; if(ok){n++;}
      });
      if (ures) ures.style.display = n? 'none':'';
      var q=[]; if (akt.kat!=='mind') q.push('kat='+encodeURIComponent(akt.kat)); if (akt.forras!=='mind') q.push('forras='+encodeURIComponent(akt.forras));
      try { history.replaceState(null,'', q.length ? '/?'+q.join('&') : '/'); } catch(e){}
    }
    document.querySelectorAll('.szuro button').forEach(function(b){ b.addEventListener('click', function(){
      if (b.dataset.kat !== undefined) akt.kat = b.dataset.kat; else akt.forras = b.dataset.forras; alkalmaz(); }); });
    document.querySelectorAll('.szuro-mobil select').forEach(function(sel){ sel.addEventListener('change', function(){ akt[sel.dataset.dim] = sel.value; alkalmaz(); }); });
    var sp = new URLSearchParams(location.search);
    if (sp.get('kat')) akt.kat = sp.get('kat'); if (sp.get('forras')) akt.forras = sp.get('forras');
    if (akt.kat!=='mind' || akt.forras!=='mind') alkalmaz();
  }
  var fr = document.querySelector('.frissit');
  // A frissítőgomb csak a Macen futó helyi szerverrel működik; élesben nem kérdezünk rá, mert a 404 hibát ír a konzolba.
  if (fr && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
    var gomb = fr.querySelector('.frissit-gomb'), all = fr.querySelector('.frissit-allapot'), idozito = null;
    function allapot(){
      return fetch('/frissit/allapot', {cache:'no-store'}).then(function(r){ if(!r.ok) throw 0; return r.json(); });
    }
    function mutat(a){
      if (a.fut) {
        gomb.disabled = true; gomb.textContent = 'Frissítés folyamatban';
        var s = (a.sorok||[]).filter(Boolean); all.textContent = s.length ? s[s.length-1].replace(/^\S+ \S+ /,'') : 'indul';
      } else {
        gomb.disabled = false; gomb.textContent = 'Frissítés most';
        all.textContent = a.kod === 0 ? 'Kész, az oldal újratölt.' : (a.kod != null ? 'Hiba történt, nézd meg a data/frissites.log fájlt.' : '');
      }
    }
    function figyel(){
      idozito = setInterval(function(){ allapot().then(function(a){ mutat(a); if (!a.fut) { clearInterval(idozito); if (a.kod === 0) setTimeout(function(){ location.reload(); }, 800); } }).catch(function(){ clearInterval(idozito); }); }, 2500);
    }
    allapot().then(function(a){ gomb.hidden = false; mutat(a); if (a.fut) figyel(); }).catch(function(){});
    gomb.addEventListener('click', function(){
      gomb.disabled = true; all.textContent = 'indul';
      fetch('/frissit', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'}).then(function(){ figyel(); }).catch(function(){ gomb.disabled = false; all.textContent = 'Nem érem el a helyi szervert.'; });
    });
  }
  // Új hírek figyelése: percenként lekéri a feed.json-t, ami új, azt kártyán kiteszi bal oldalt.
  (function(){
    var doboz = document.querySelector('.uj-hirek'); if (!doboz) return;
    var KULCS = 'qn-latott';
    function latott(){ try { return JSON.parse(localStorage.getItem(KULCS) || '[]'); } catch(e){ return []; } }
    function ment(l){ try { localStorage.setItem(KULCS, JSON.stringify(l.slice(0, 400))); } catch(e){} }
    var elso = latott().length === 0;
    function kartya(h){
      if (!qnSlug(h.slug)) return;
      var a = document.createElement('a'); a.className = 'uj-kartya'; a.href = '/hir/' + h.slug;
      var kep = qnKep(h.kep);
      a.innerHTML = (kep ? '<img src="'+qnEsc(kep)+'" alt="">' : '') + '<div><span class="uj-cimke">Új hír · '+qnEsc(h.forras)+(h.ido?' · '+qnEsc(h.ido):'')+'</span><strong>'+qnEsc(h.cim)+'</strong></div><button type="button" class="uj-zar" aria-label="Bezárás">×</button>';
      a.querySelector('.uj-zar').addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); a.remove(); });
      doboz.prepend(a);
      // Audit 2026-11-03: egyszerre legfeljebb 1 (mobil) vagy 2 (asztal) kártya lebeg, a régebbiek eltűnnek
      var max = window.matchMedia('(max-width: 767px)').matches ? 1 : 2;
      [].slice.call(doboz.children, max).forEach(function(r){ r.remove(); });
      setTimeout(function(){ a.classList.add('bent'); }, 30);
      setTimeout(function(){ a.classList.remove('bent'); setTimeout(function(){ a.remove(); }, 800); }, 30000);
      if (window.Notification && Notification.permission === 'granted') {
        try { var n = new Notification('quicknews.hu: ' + h.forras, {body: h.cim, icon: '/assets/qn-ikon-192.png', tag: h.id}); n.onclick = function(){ window.focus(); location.href = '/hir/' + h.slug; }; } catch(e){}
      }
    }
    function nez(){
      fetch('/feed.json?t=' + Date.now(), {cache:'no-store'}).then(function(r){ return r.json(); }).then(function(d){
        var l = latott(); var ujak = d.hirek.filter(function(h){ return l.indexOf(h.id) < 0; });
        if (!elso) ujak.slice(0, 3).reverse().forEach(kartya);
        elso = false;
        ment(d.hirek.map(function(h){ return h.id; }).concat(l));
      }).catch(function(){});
    }
    nez(); setInterval(nez, 60000);
    var eg = document.querySelector('.ertesit-gomb');
    if (eg) {
      if (!window.Notification) eg.hidden = true;
      else if (Notification.permission === 'granted') eg.textContent = 'Értesítés bekapcsolva';
      eg.addEventListener('click', function(){ Notification.requestPermission().then(function(p){ eg.textContent = p === 'granted' ? 'Értesítés bekapcsolva' : 'Értesítés letiltva a böngészőben'; }); });
    }
  })();
  // ---- Közös keresőlogika (Audit 2026-11-03): a kötőjel, pont, perjel szóköznek számít, és a szóköz nélküli alak is
  // talál („gpt 6” = „GPT-6” = „gpt6”); több szónál mindegyiknek szerepelnie kell; ha nincs találat, a legközelebbi
  // ismert szóra „Erre gondoltál?” javaslatot adunk (legfeljebb 1-2 betű eltérés).
  window.qnKereso = (function(){
    var alap = function(t){ return (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
    var egys = function(t){ return alap(t).replace(/[-_./+:,;'"()!?]+/g, ' ').replace(/\s+/g, ' ').trim(); };
    var tomor = function(t){ return t.replace(/ /g, ''); };
    function elokeszit(d){ return d.map(function(x){ x._c = egys(x.c); x._b = egys(x.b); x._sz = egys(x.sz); x._k = egys(x.k + ' ' + x.g);
      x._cc = tomor(x._c); x._mind = x._c + ' ' + x._b + ' ' + x._k + ' ' + x._sz; x._mindc = tomor(x._mind); return x; }); }
    function pontoz(mutato, nyers){
      var kif = egys(nyers), szavak = kif.split(' ').filter(function(w){ return w.length >= 1; }), kc = tomor(kif);
      if (kc.length < 2) return [];
      var ki = [];
      mutato.forEach(function(x){
        var p = 0;
        if (x._c.indexOf(kif) >= 0 || x._cc.indexOf(kc) >= 0) p += 100;
        if (x._c.indexOf(kif) === 0) p += 40;
        if (x._k.indexOf(kif) >= 0) p += 30;
        if (x._b.indexOf(kif) >= 0) p += 20;
        if (x._sz.indexOf(kif) >= 0) p += 10;
        if (!p && x._mindc.indexOf(kc) >= 0) p += 8;
        // több szó: mindegyik szerepeljen valahol (a sorrend kötetlen); rövid szónál (pl. „6”) csak az egybefüggő alak számít,
        // különben a „gpt 6” egy GPT-5-ös hírre is találna, amelyben valahol egy 6-os szám áll
        if (!p && szavak.length > 1 && szavak.every(function(w){ return w.length >= 3 && x._mind.indexOf(w) >= 0; })) p += 6 + szavak.filter(function(w){ return x._c.indexOf(w) >= 0; }).length * 4;
        if (p) ki.push([p, x]);
      });
      return ki.sort(function(a, b){ return b[0] - a[0]; });
    }
    function tav(a, b, max){ if (Math.abs(a.length - b.length) > max) return max + 1; var e = [], i, j;
      for (j = 0; j <= b.length; j++) e[j] = j;
      for (i = 1; i <= a.length; i++) { var bal = e[0], kis = i; e[0] = i;
        for (j = 1; j <= b.length; j++) { var t = e[j]; e[j] = Math.min(e[j] + 1, e[j - 1] + 1, bal + (a[i - 1] === b[j - 1] ? 0 : 1)); bal = t; if (e[j] < kis) kis = e[j]; }
        if (kis > max) return max + 1; }
      return e[b.length]; }
    var szotar = null;
    function javasol(mutato, nyers){
      if (!szotar) { szotar = {}; mutato.forEach(function(x){ (x._c + ' ' + x._k).split(' ').forEach(function(w){ if (w.length >= 4) szotar[w] = (szotar[w] || 0) + 1; }); }); }
      var valtozott = false, ki = egys(nyers).split(' ').map(function(w){
        if (w.length < 4 || szotar[w]) return w;
        var max = w.length >= 7 ? 2 : 1, legj = null, lt = max + 1;
        Object.keys(szotar).forEach(function(s){ var d = tav(w, s, max); if (d < lt || (d === lt && legj && szotar[s] > szotar[legj])) { lt = d; legj = s; } });
        if (legj && lt <= max) { valtozott = true; return legj; } return w; });
      return valtozott ? ki.join(' ') : '';
    }
    return {elokeszit: elokeszit, pontoz: pontoz, javasol: javasol, egys: egys};
  })();
  // ---- Kereső: a mutató (kereso.json) az első gépelésnél tölt be, a találatok a mező alatt nyílnak.
  (function(){
    var doboz=document.querySelector('[data-kereso]'), mezo=document.querySelector('[data-kereso-mezo]'), panel=document.querySelector('[data-kereso-panel]'), lista=document.querySelector('[data-kereso-talalatok]'), torlo=document.querySelector('[data-kereso-zar]');
    if(!doboz||!mezo||!panel||!lista) return;
    var mutato=null, betoltes=null, kiemeltIndex=-1;
    var egyszeru=function(t){ return (t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); };
    var tolts=function(){ if(betoltes) return betoltes; betoltes=fetch('/kereso.json',{cache:'no-cache'}).then(function(r){return r.json();}).then(function(d){ mutato=qnKereso.elokeszit(d); return mutato; }).catch(function(){ mutato=[]; return mutato; }); return betoltes; };
    var biztos=function(t){ return t.replace(/[&<>]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); };
    var kiemelCim=function(szoveg,kif){ var e=egyszeru(szoveg); var i=e.indexOf(kif); if(i<0) return biztos(szoveg); return biztos(szoveg.slice(0,i))+'<mark>'+biztos(szoveg.slice(i,i+kif.length))+'</mark>'+biztos(szoveg.slice(i+kif.length)); };
    var kiemel=function(szoveg,kif){ var e=egyszeru(szoveg); var i=e.indexOf(kif); if(i<0) return null; var start=Math.max(0,i-45); return (start>0?'…':'')+biztos(szoveg.slice(start,i))+'<mark>'+biztos(szoveg.slice(i,i+kif.length))+'</mark>'+biztos(szoveg.slice(i+kif.length,i+kif.length+90))+'…'; };
    var nyitva=function(igen){ panel.hidden=!igen; mezo.setAttribute('aria-expanded',igen?'true':'false'); };
    var rajzol=function(talalatok,kif){ kiemeltIndex=-1; if(!kif){ nyitva(false); lista.innerHTML=''; return; } if(!talalatok.length){ lista.innerHTML='<div class="kereso-ures">Erre nincs találat. Próbálj rövidebb szót.</div>'; nyitva(true); return; }
      lista.innerHTML=talalatok.slice(0,12).map(function(x){ var r=kiemel(x.sz,kif)||kiemel(x.b,kif)||''; return '<a class="kereso-tetel" href="'+qnEsc(x.u)+'" role="option"><span class="kt-meta">'+biztos(x.k)+(x.d?' · '+qnEsc(x.d):'')+'</span><span class="kt-cim">'+kiemelCim(x.c,kif)+'</span>'+(r?'<span class="kt-reszlet">'+r+'</span>':'')+'</a>'; }).join('')+(talalatok.length>12?'<a class="kereso-mind" href="/kereses?q='+encodeURIComponent(mezo.value.trim())+'">Mind a '+talalatok.length+' találat egy oldalon</a>':''); nyitva(true); };
    var keres=function(nyers){ var kif=egyszeru(nyers.trim()); if(torlo) torlo.hidden=!nyers; if(!mutato||kif.length<2){ rajzol([],''); return; } var pont=qnKereso.pontoz(mutato,nyers);
      if(!pont.length){ var jav=qnKereso.javasol(mutato,nyers); if(jav){ rajzol(qnKereso.pontoz(mutato,jav).map(function(x){return x[1];}),qnKereso.egys(jav)); if(lista.firstChild) lista.insertAdjacentHTML('afterbegin','<div class="kereso-javaslat">Erre gondoltál: <strong>'+biztos(jav)+'</strong>?</div>'); return; } }
      rajzol(pont.map(function(x){return x[1];}),qnKereso.egys(nyers)); };
    var urit=function(){ mezo.value=''; if(torlo) torlo.hidden=true; lista.innerHTML=''; nyitva(false); };
    mezo.addEventListener('input',function(){ tolts().then(function(){ keres(mezo.value); }); });
    mezo.addEventListener('focus',function(){ doboz.classList.add('nyitott'); if(mezo.value.trim().length>=2) tolts().then(function(){ keres(mezo.value); }); });
    mezo.addEventListener('blur',function(){ setTimeout(function(){ if(!mezo.value&&panel.hidden) doboz.classList.remove('nyitott'); },200); });
    if(torlo) torlo.addEventListener('click',function(){ urit(); mezo.focus(); });
    var sor=doboz.querySelector('.kereso-mezosor'); sor.addEventListener('click',function(e){ if(torlo&&torlo.contains(e.target)) return; doboz.classList.add('nyitott'); setTimeout(function(){ mezo.focus(); },30); });
    // Enter a mezőben (kijelölt találat nélkül): a találati oldal, az összes találattal (Heni 2026-10-18)
    mezo.addEventListener('keydown',function(e){ if(e.key!=='Enter'||kiemeltIndex>=0||mezo.value.trim().length<2) return; e.preventDefault(); location.href='/kereses?q='+encodeURIComponent(mezo.value.trim()); });
    document.addEventListener('click',function(e){ if(!panel.hidden&&!doboz.contains(e.target)) nyitva(false); });
    document.addEventListener('keydown',function(e){
      if((e.key==='k'||e.key==='K')&&(e.metaKey||e.ctrlKey)){ e.preventDefault(); mezo.focus(); mezo.select(); return; }
      if(e.key==='Escape'&&(document.activeElement===mezo||!panel.hidden)){ urit(); mezo.blur(); doboz.classList.remove('nyitott'); return; }
      if(panel.hidden) return; var tetelek=[].slice.call(lista.querySelectorAll('.kereso-tetel')); if(!tetelek.length) return;
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){ e.preventDefault(); kiemeltIndex+=e.key==='ArrowDown'?1:-1; if(kiemeltIndex<0) kiemeltIndex=tetelek.length-1; if(kiemeltIndex>=tetelek.length) kiemeltIndex=0; tetelek.forEach(function(t,i){ t.classList.toggle('kiemelt',i===kiemeltIndex); }); tetelek[kiemeltIndex].scrollIntoView({block:'nearest'}); }
      if(e.key==='Enter'&&kiemeltIndex>=0) tetelek[kiemeltIndex].click();
    });
  })();
  // ---- Csengő: a feed.json friss híreiből a még nem látottak száma; megnyitáskor minden látottnak számít.
  (function(){
    var doboz=document.querySelector('[data-harang]'); if(!doboz) return;
    var TAR='qn-harang-latott', gomb=doboz.querySelector('.harang-gomb'), jel=doboz.querySelector('[data-harang-jel]'), buborek=doboz.querySelector('[data-harang-buborek]'), hirek=[], latott=[];
    try{ latott=JSON.parse(localStorage.getItem(TAR)||'[]'); }catch(e){ latott=[]; } if(!Array.isArray(latott)) latott=[];
    var ujak=function(){ return hirek.filter(function(h){ return latott.indexOf(h.id)<0; }); };
    var biztos=qnEsc;
    var jelol=function(){ var db=ujak().length; jel.textContent=db>9?'9+':String(db); jel.hidden=db===0; gomb.setAttribute('aria-label',db?'Új hírek, '+db+' új':'Új hírek'); };
    // Heni 2026-10-15: a bélyegkép cellája mindig megvan (kép nélkül a forrás nevével), így a cím sosem kerül a keskeny
    // képoszlopba; a be nem töltődő (404, lejárt) kép helyére is a helyőrző kerül, a sor magassága nem változik
    var kepHiba=function(img){ if(!img||!img.classList||!img.classList.contains('harang-kep')) return; var b=img.closest('.hi-kep'); if(!b) return; var li=b.closest('li'); if(li) li.classList.add('nincs-kep'); b.remove(); };
    buborek.addEventListener('error',function(ev){ kepHiba(ev.target); },true);
    var helyorzo=function(h){ return '<span class="harang-kep nincs" aria-hidden="true">'+biztos(String(h.forras||'').replace(/\s*\((X|LinkedIn|YouTube)\)\s*$/,'').slice(0,14))+'</span>'; };
    // Heni 2026-10-29: a csengő ugyanaz az idővonal, mint az appban: bal oldalon az óra és a pont a sávon, jobbra képes kártya,
    // napváltáskor napcímke („Ma, október 29.”); a még nem látott hírek sárga pontot és ÚJ címkét kapnak
    var HONAP=['január','február','március','április','május','június','július','augusztus','szeptember','október','november','december'];
    var bp=function(d,o){ o.timeZone='Europe/Budapest'; return d.toLocaleString('hu-HU',o); };
    var napKulcs=function(d){ return bp(d,{year:'numeric',month:'2-digit',day:'2-digit'}); };
    var napCim=function(d){ var most=new Date(), alap=HONAP[parseInt(bp(d,{month:'numeric'}),10)-1]+' '+parseInt(bp(d,{day:'numeric'}),10)+'.';
      if(napKulcs(d)===napKulcs(most)) return 'Ma, '+alap; if(napKulcs(d)===napKulcs(new Date(most.getTime()-864e5))) return 'Tegnap, '+alap; return alap.charAt(0).toUpperCase()+alap.slice(1); };
    var MENT='<svg viewBox="0 0 256 256" aria-hidden="true"><path class="mj-ures" d="M184 32H72a16 16 0 0 0-16 16v176a8 8 0 0 0 12.24 6.78L128 193.43l59.77 37.35A8 8 0 0 0 200 224V48a16 16 0 0 0-16-16Zm0 177.57-51.77-32.35a8 8 0 0 0-8.48 0L72 209.57V48h112Z"/><path class="mj-ures" d="M120 80h16v28h28v16h-28v28h-16v-28H92v-16h28Z"/><path class="mj-teli" d="M200 48v176a8 8 0 0 1-12.24 6.78L128 193.43l-59.77 37.35A8 8 0 0 1 56 224V48a16 16 0 0 1 16-16h112a16 16 0 0 1 16 16Z"/></svg>';
    var kirajzol=function(){ var ujId=ujak().map(function(h){return h.id;}), elozoNap=null;
      var l=hirek.filter(function(h){ return qnSlug(h.slug); }).slice(0,20);
      var sorok=l.map(function(h,i){ var kep=h.fk?'':qnKep(h.kep), uj=ujId.indexOf(h.id)>=0, d=h.t?new Date(h.t):null, ok=d&&!isNaN(d.getTime()), nap='';
        if(ok&&napKulcs(d)!==elozoNap){ elozoNap=napKulcs(d); nap='<li class="hi-nap"><span>'+napCim(d)+'</span></li>'; }
        var ora=ok?bp(d,{hour:'2-digit',minute:'2-digit'}):'';
        var ment=/^[a-z0-9]{6,40}$/.test(h.id||'')?'<button type="button" class="harang-ment" data-ment="'+h.id+'" data-ment-adat data-u="/hir/'+h.slug+'" data-c="'+biztos(h.cim)+'" data-k="'+biztos(kep)+'" data-f="'+biztos(h.forras)+'" aria-pressed="false" aria-label="Elolvasom később" title="Elolvasom később">'+MENT+'</button>':'';
        return nap+'<li class="hi-sor'+(uj?' uj':'')+(kep?'':' nincs-kep')+(i===l.length-1?' utolso':'')+'"><div class="hi-sav"><span class="hi-ora" title="Nálunk megjelent">'+ora+'</span><span class="hi-pont"></span></div>'
          +'<div class="hi-kartya"><a href="/hir/'+h.slug+'">'+(kep?'<span class="hi-kep"><img class="harang-kep" src="'+biztos(kep)+'" alt="" loading="lazy" decoding="async">'+(uj?'<span class="hi-cimke">ÚJ</span>':'')+'</span>':'')
          +'<span class="harang-szoveg"><span class="harang-forras">'+(h.rov?'<b>'+biztos(h.rov)+'</b>':'')+'<span>'+biztos(h.forras)+'</span></span><strong>'+biztos(h.cim)+'</strong></span></a>'+ment+'</div></li>'; }).join('');
      // Audit 2026-11-03: a jelvény, a felolvasott név és a fejléc ugyanazt a számot mutatja (az összes új hírt); ha a lista
      // ennél kevesebbet fér el, külön kiírjuk, hogy a legfrissebb hány látszik
      var db=ujId.length, latszik=l.filter(function(h){ return ujId.indexOf(h.id)>=0; }).length;
      buborek.innerHTML='<div class="hi-fej">'+(db?'<span class="hi-uj">'+db+' ÚJ HÍR</span>':'')+'<p>'+(db?'Ezek érkeztek, mióta utoljára benéztél. Az időpont azt mutatja, mikor jelentek meg nálunk.'+(db>latszik?' Itt a legfrissebb '+latszik+' látszik, a többit a Friss oldalon találod.':''):'Mindent láttál, ezek a legfrissebbek. Az időpont azt mutatja, mikor jelentek meg nálunk.')+'</p></div>'+(sorok?'<ul>'+sorok+'</ul>':'<p class="harang-ures">Most nincs új hír.</p>')+(window.Notification?'<button type="button" class="harang-ertesit">'+(Notification.permission==='granted'?'Értesítés bekapcsolva':'Értesíts az új hírekről')+'</button>':'');
      [].forEach.call(buborek.querySelectorAll('img.harang-kep'),function(img){ if(img.complete&&img.naturalWidth===0) kepHiba(img); });
      var he=buborek.querySelector('.harang-ertesit'); if(he) he.addEventListener('click',function(ev){ ev.stopPropagation(); Notification.requestPermission().then(function(p){ he.textContent = p==='granted'?'Értesítés bekapcsolva':'Értesítés letiltva a böngészőben'; }); }); };
    var zar=function(){ buborek.hidden=true; gomb.setAttribute('aria-expanded','false'); document.body.classList.remove('harang-nyitva'); document.removeEventListener('keydown',bill); document.removeEventListener('click',kivul); };
    function bill(ev){ if(ev.key==='Escape'){ zar(); gomb.focus(); } }
    function kivul(ev){ if(!doboz.contains(ev.target)) zar(); }
    var nyit=function(){ kirajzol(); buborek.hidden=false; gomb.setAttribute('aria-expanded','true'); document.body.classList.add('harang-nyitva'); latott=hirek.map(function(h){return h.id;}); try{ localStorage.setItem(TAR,JSON.stringify(latott)); }catch(e){} jelol(); setTimeout(function(){ document.addEventListener('keydown',bill); document.addEventListener('click',kivul); },0); };
    gomb.addEventListener('click',function(){ if(buborek.hidden) nyit(); else zar(); });
    var betolt=function(){ fetch('/feed.json?t='+Date.now(),{cache:'no-store'}).then(function(r){ return r.json(); }).then(function(d){ hirek=d.hirek||[]; var elo=hirek.map(function(h){return h.id;}); latott=latott.filter(function(i){ return elo.indexOf(i)>=0; }); jelol(); }).catch(function(){}); };
    betolt(); setInterval(betolt,60000);
  })();
  (function(){
    var g=document.querySelector('[data-tema]'); if(!g) return;
    var meta=document.querySelector('meta[name="theme-color"]');
    function alkalmaz(t){ if(t==='light') document.documentElement.setAttribute('data-theme','light'); else document.documentElement.removeAttribute('data-theme');
      g.setAttribute('aria-label', t==='light'?'Sötét téma bekapcsolása':'Világos téma bekapcsolása'); if(meta) meta.setAttribute('content', t==='light'?'#ffffff':'#181818'); }
    alkalmaz(document.documentElement.getAttribute('data-theme')==='light'?'light':'dark');
    g.addEventListener('click', function(){ var uj=document.documentElement.getAttribute('data-theme')==='light'?'dark':'light'; alkalmaz(uj); try{ localStorage.setItem('qn-tema', uj); }catch(e){} });
  })();
  document.querySelectorAll('.lejatszo').forEach(function(box){
    var gomb = box.querySelector('.lejatszas'); if (!gomb) return;
    gomb.addEventListener('click', function(){
      if (box.dataset.iframe) {
        var f = document.createElement('iframe'); f.referrerPolicy='strict-origin-when-cross-origin'; f.src = box.dataset.iframe; f.title='Videó'; f.allow='autoplay; encrypted-media; picture-in-picture'; f.allowFullscreen=true;
        box.innerHTML=''; box.appendChild(f);
      } else if (box.dataset.video) {
        var v = document.createElement('video'); v.referrerPolicy='no-referrer'; v.src = box.dataset.video; v.controls=true; v.autoplay=true; v.playsInline=true; if (box.dataset.poszter) v.poster = box.dataset.poszter;
        box.innerHTML=''; box.appendChild(v);
      }
    });
  });
})();

// qn-esemenyek: egyedi GA4-események (a bővített mérésen felül), csak ha a gtag betöltött
(function(){
  var META = {kiprobalom: 'Kiprobalom', facebook_kattintas: 'FacebookKattintas', eredeti_forras: 'EredetiForras', video_inditas: 'VideoInditas'};
  function ev(nev, adat){
    try { if (window.gtag) gtag('event', nev, adat || {}); } catch(e){}
    try { if (window.fbq) { if (nev === 'search') fbq('track', 'Search', {search_string: (adat||{}).search_term}); else if (META[nev]) fbq('trackCustom', META[nev], adat || {}); } } catch(e){}
  }
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a, button'); if (!a) return;
    if (a.classList.contains('kiprobal')) ev('kiprobalom', {eszkoz: (a.textContent||'').replace('Kipróbálom:','').trim().slice(0,80), link_url: a.href});
    else if (a.classList.contains('kulso')) ev('cikk_link', {link_text: (a.textContent||'').trim().slice(0,80), link_url: a.href});
    else if (a.classList.contains('eredeti') && a.tagName === 'A') ev('eredeti_forras', {link_url: a.href});
    else if (a.classList.contains('li-kartya')) ev('eredeti_forras', {link_url: a.href, tipus: 'linkedin'});
    else if (a.classList.contains('uj-kartya')) ev('uj_hir_kartya', {link_url: a.href});
    else if (a.classList.contains('kereso-tetel')) ev('kereses_talalat', {link_url: a.href});
    else if (a.classList.contains('ertesit-gomb')) ev('ertesites_keres');
    else if (a.classList.contains('fb-gomb')) ev('facebook_kattintas', {hely: 'fejlec'});
    else if (a.classList.contains('tema-gomb')) ev('tema_valtas', {tema: document.documentElement.getAttribute('data-theme') === 'light' ? 'sotet' : 'vilagos'});
    else if (a.closest('.rovatsor')) ev('rovat_menu', {rovat: (a.textContent||'').trim()});
    var lj = e.target.closest && e.target.closest('.lejatszo'); if (lj && !lj.dataset.mert) { lj.dataset.mert = '1'; ev('video_inditas', {tipus: lj.dataset.video ? 'mp4' : 'beagyazott'}); }
  }, true);
  var mezo = document.getElementById('kereso-mezo'), idoz;
  if (mezo) mezo.addEventListener('input', function(){ clearTimeout(idoz); var q = mezo.value.trim(); if (q.length < 3) return; idoz = setTimeout(function(){ ev('search', {search_term: q.slice(0,60)}); }, 1500); });
})();

// cikk_elolvasva: a cikk szövegét (hír + "Miért számít") 90%-ig görgette le az olvasó; hírenként egyszer
(function(){
  var cikk = document.querySelector('article.cikk .cikk-racs'); if (!cikk || !window.gtag) return;
  var kesz = false, var_ = false, kezd = Date.now();
  function nez(){
    var_ = false; if (kesz) return;
    var r = cikk.getBoundingClientRect();
    var latott = (window.innerHeight - r.top) / r.height;
    if (r.height > 0 && latott >= 0.9) {
      kesz = true;
      var h1 = document.querySelector('article.cikk h1'), f = document.querySelector('.cikk-fej .meta .forras');
      try { gtag('event', 'cikk_elolvasva', {cikk_cim: h1 ? h1.textContent.trim().slice(0, 100) : '', forras: f ? f.textContent.trim() : '',
        olvasasi_ido_mp: Math.round((Date.now() - kezd) / 1000)}); } catch(e){}
      try { if (window.fbq) fbq('trackCustom', 'CikkElolvasva', {cikk_cim: h1 ? h1.textContent.trim().slice(0, 100) : ''}); } catch(e){}
      window.removeEventListener('scroll', jel);
    }
  }
  function jel(){ if (!var_) { var_ = true; requestAnimationFrame(nez); } }
  window.addEventListener('scroll', jel, {passive: true});
  setTimeout(nez, 1500);  // rövid hír: ha betöltéskor már 90% látszik, 1,5 mp után számol
})();

// Vissza a tetejére: legalább egy képernyőnyi görgetés után látszik (80 ms-mal fékezett, passzív figyelő).
// Amíg a sütisáv nyitva van, fölé emelkedik, hogy ne takarja.
(function(){
  var gomb = document.querySelector('[data-fel-gomb]'); if (!gomb) return;
  var var_ = false;
  function allapot(){
    var_ = false;
    var kuszob = Math.max(400, window.innerHeight);
    gomb.classList.toggle('lathato', (window.scrollY || document.documentElement.scrollTop) > kuszob);
    var sav = document.querySelector('[data-suti-sav].nyitva');
    document.documentElement.style.setProperty('--fel-also', sav && !sav.hidden ? (sav.getBoundingClientRect().height + 16) + 'px' : '');
  }
  window.addEventListener('scroll', function(){ if (!var_) { var_ = true; setTimeout(allapot, 80); } }, {passive: true});
  window.addEventListener('resize', allapot, {passive: true});
  setInterval(allapot, 1500);  // a sütisáv nyílása és csukódása görgetés nélkül is
  gomb.addEventListener('click', function(){
    var halk = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({top: 0, behavior: halk ? 'auto' : 'smooth'});
    var fo = document.getElementById('fo') || document.body; fo.setAttribute('tabindex', '-1'); fo.focus({preventScroll: true});
    try { if (window.gtag) gtag('event', 'vissza_a_tetejere'); } catch(e){}
  });
  allapot();
})();
// qn-suti-kezelo: a sütisáv. Döntés a localStorage qn-suti kulcsában; elfogadáskor a Consent Mode frissül.
(function(){
  var sav = document.querySelector('[data-suti-sav]'); if (!sav) return;
  var TAR = 'qn-suti', valasz = null, VER = +(sav.getAttribute('data-suti-verzio') || 1);
  try { valasz = JSON.parse(localStorage.getItem(TAR) || 'null'); } catch(e){}
  if (valasz && (valasz.verzio || 1) < VER) valasz = null;  // régi, csak GA-ra szóló döntés: újra kérdezünk
  function mutat(){ sav.hidden = false; setTimeout(function(){ sav.classList.add('nyitva'); }, 30); }
  function rejt(){ sav.classList.remove('nyitva'); setTimeout(function(){ sav.hidden = true; }, 700); }
  function ment(meres, hirdetes, forras){
    valasz = {meres: !!meres, hirdetes: !!hirdetes, ido: new Date().toISOString(), verzio: VER};
    if (forras) valasz.forras = forras;
    try { localStorage.setItem(TAR, JSON.stringify(valasz)); } catch(e){}
    try { if (window.gtag) gtag('consent', 'update', {analytics_storage: meres ? 'granted' : 'denied'}); } catch(e){}
    if (meres && window.qnGaBetolt) window.qnGaBetolt();
    if (hirdetes && window.qnMetaBetolt) window.qnMetaBetolt();
    document.documentElement.classList.add('suti-van');
    document.documentElement.style.removeProperty('--fel-also');  // a chat és a fel-gomb azonnal visszaáll a helyére
    rejt();
  }
  sav.addEventListener('click', function(e){ var g = e.target.closest('[data-suti]'); if (!g) return; var v = g.getAttribute('data-suti'); ment(v !== 'nem', v === 'igen'); });
  // Google hozzájárulás-kezelő (TCF, AdSense mellett): az EGT-ben ez kérdez, a döntését a saját kulcsunkba is átírjuk.
  // GA: 1. cél (tárolás) + 8. (tartalom mérése); Meta pixel: 1 + 3 + 4 (személyre szabott profil és kiválasztás) + 7 (hirdetésmérés).
  // Ha a látogató nem az EGT-ből jön, vagy a Google ablaka 4 mp alatt nem jelentkezik (pl. hirdetésblokkoló), a saját sáv kérdez.
  var tcfAktiv = false;
  function sajatSav(){ if (tcfAktiv) return; if (valasz && valasz.forras === 'tcf') valasz = null; if (valasz) sav.hidden = true; else mutat(); }
  function tcfVar(){
    var vege = Date.now() + 4000;
    (function var_(){
      if (typeof window.__tcfapi !== 'function') { if (Date.now() < vege) setTimeout(var_, 150); else sajatSav(); return; }
      // ha a Google ablaka 5 mp alatt nem jelenik meg és nincs korábbi döntés (pl. a webhely még nincs jóváhagyva), a saját sáv kérdez
      var tcfOra = setTimeout(function(){ tcfAktiv = false; sajatSav(); }, 5000);
      window.__tcfapi('addEventListener', 2, function(tc, ok){
        if (!ok || !tc) return;
        if (tc.gdprApplies === false) { clearTimeout(tcfOra); sajatSav(); return; }
        if (tc.eventStatus !== 'cmpuishown' && tc.eventStatus !== 'tcloaded' && tc.eventStatus !== 'useractioncomplete') return;
        clearTimeout(tcfOra); tcfAktiv = true; sav.classList.remove('nyitva'); sav.hidden = true;
        if (tc.eventStatus === 'cmpuishown') return;
        var c = (tc.purpose && tc.purpose.consents) || {};
        ment(!!(c[1] && c[8]), !!(c[1] && c[3] && c[4] && c[7]), 'tcf');
      });
    })();
  }
  document.addEventListener('click', function(e){
    if (!e.target.closest('[data-suti-ujra]')) return;
    if (tcfAktiv) { window.googlefc = window.googlefc || {}; googlefc.callbackQueue = googlefc.callbackQueue || []; googlefc.callbackQueue.push(function(){ googlefc.showRevocationMessage(); }); return; }
    document.documentElement.classList.remove('suti-van'); mutat();
  });
  if (window.qnTcf && window.qnAdsP) { sav.hidden = true; window.qnAdsP.then(function(be){ if (be) tcfVar(); else if (valasz) sav.hidden = true; else mutat(); }); }
  else { if (valasz) sav.hidden = true; else mutat(); }
})();

// a menüsor egy sorban, oldalra húzható: amíg jobbra van még menüpont, a jobb széle elhalványul; az aktív menüpont látszódjon (Heni 2026-10-29)
(function(){
  var k = document.querySelector('.rovatsor .keret'); if (!k) return;
  // Audit 2026-11-03: a halványuló szél mellé egy jobbra mutató gomb is jelzi, hogy van még menüpont; koppintásra továbbgörget
  var nav = k.parentElement, nyil = document.createElement('button');
  nyil.type = 'button'; nyil.className = 'rovat-tovabb'; nyil.setAttribute('aria-label', 'További rovatok'); nyil.hidden = true;
  nyil.innerHTML = '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M181.66 133.66l-80 80a8 8 0 0 1-11.32-11.32L164.69 128 90.34 53.66a8 8 0 0 1 11.32-11.32l80 80a8 8 0 0 1 0 11.32Z"/></svg>';
  nav.appendChild(nyil);
  nyil.addEventListener('click', function(){ k.scrollBy({left: Math.round(k.clientWidth * 0.7), behavior: 'smooth'}); });
  function jelol(){ var van = k.scrollLeft + k.clientWidth < k.scrollWidth - 2; k.classList.toggle('tovabb', van); nyil.hidden = !van; }
  var akt = k.querySelector('a[aria-current="page"]');
  if (akt && akt.offsetLeft + akt.offsetWidth > k.clientWidth) k.scrollLeft = akt.offsetLeft - 16;
  jelol(); k.addEventListener('scroll', jelol, {passive: true}); window.addEventListener('resize', jelol, {passive: true});
})();
// a csengő lenyíló dobozának teteje mobilon a fejléc alja (CSS-változóban)
(function(){
  var fej = document.querySelector('.harang-gomb'); if (!fej) return;
  function allit(){ var r = fej.getBoundingClientRect(); document.documentElement.style.setProperty('--harang-teto', Math.max(8, Math.round(r.bottom) + 8) + 'px'); }
  allit(); window.addEventListener('resize', allit, {passive: true}); window.addEventListener('scroll', allit, {passive: true});
})();
// napválasztó: kattintásra máshova vagy Esc-re bezárul; a /napok dátumválasztója a nap oldalára ugrik
(function(){
  function zar(kivetel){ document.querySelectorAll('[data-nap-valaszto][open]').forEach(function(d){ if (d !== kivetel) d.removeAttribute('open'); }); }
  document.addEventListener('click', function(ev){ var d = ev.target.closest ? ev.target.closest('[data-nap-valaszto]') : null; zar(d); });
  document.addEventListener('keydown', function(ev){ if (ev.key === 'Escape') zar(null); });
  // "Ma" és "Tegnap" előtag a látogató budapesti napja szerint
  try {
    var f = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Budapest'});
    var ma = f.format(new Date()), tegnap = f.format(new Date(Date.now() - 864e5));
    document.querySelectorAll('[data-nap]').forEach(function(el){
      var n = el.getAttribute('data-nap'), elo = n === ma ? 'Ma, ' : n === tegnap ? 'Tegnap, ' : '';
      if (!elo) return;
      var t = el.textContent.replace(/^\d{4}\. /, '');
      el.textContent = elo + t.charAt(0).toLowerCase() + t.slice(1);
    });
  } catch (e) {}
  var ugro = document.querySelector('[data-nap-ugro]'); if (!ugro) return;
  var napok = (ugro.getAttribute('data-napok') || '').split(',');
  ugro.addEventListener('submit', function(ev){
    ev.preventDefault();
    var v = ugro.querySelector('select, input').value;
    if (napok.indexOf(v) > -1) { location.href = '/nap/' + v; return; }
    ugro.querySelector('.nap-ugro-uzenet').textContent = 'Ezen a napon nem jelent meg hír.';
  });
})();
// Felugró ablakok rendje (Audit 2026-11-03, Heni: „késleltesd, hogy ne fedjék egymást”): egyszerre csak egy lehet nyitva,
// az előző bezárása után legalább 30 mp szünet jár, és nem nyílik meg, amíg a látogató épp kattint vagy gépel
// (különben elnyeli a kattintást). A BOO-játék (halloween.js) ugyanezt a window.qnAblakSzabad() kaput használja.
(function(){
  var utolsoBevitel = 0;
  ['pointerdown', 'keydown', 'touchstart'].forEach(function(e){ document.addEventListener(e, function(){ utolsoBevitel = Date.now(); }, {passive: true, capture: true}); });
  window.qnAblakZarva = function(){ window.qnUtolsoAblak = Date.now(); };
  window.qnAblakSzabad = function(){
    var h = document.documentElement;
    if (!h.classList.contains('suti-van') || h.classList.contains('hl-nyitva') || document.body.classList.contains('boo-nyitva')) return false;
    if (document.querySelector('.hl-hatter, .boo-hatter, .chat.nyitva, .harang-buborek:not([hidden])')) return false;
    if (Date.now() - (window.qnUtolsoAblak || 0) < 30000) return false;
    return Date.now() - utolsoBevitel > 2000;
  };
})();
// Hírlevél-feliratkozó ablak (2026-10-13): 45 mp aktív olvasás után (oldalakon át összeadva; 2026-11-03-ig 20 mp volt),
// és nem jelenik meg újra annak, aki feliratkozott, vagy 14 napon belül bezárta.
(function(){
  var be = document.querySelector('meta[name="qn-hirlevel"]'), elonezet = /[?&]hirlevel=elonezet/.test(location.search);
  if (!be && !elonezet) return;
  if (/^\/(admin|leiratkozas)/.test(location.pathname)) return;
  var t = function(k, v){ try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch(e) { return null; } };
  var s = function(k, v){ try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch(e) { return null; } };
  if (!elonezet && (t('qn-hl-kesz') || Date.now() - Number(t('qn-hl-zarva') || 0) < 14 * 864e5)) return;
  var ido = Number(s('qn-hl-ido') || 0), CEL = elonezet ? 2 : 45, kesz = false;
  var tik = setInterval(function(){
    // a sütisávra adott válasz előtt nem számol, hogy a két ablak ne kerüljön egymásra
    if (document.visibilityState !== 'visible' || kesz || !document.documentElement.classList.contains('suti-van') || document.documentElement.classList.contains('hl-nyitva')) return;
    if (ido < CEL) { ido += 1; s('qn-hl-ido', ido); }
    // ha letelt az idő, csak akkor nyílik meg, ha más ablak nincs nyitva, és a látogató épp nem kattint
    if (ido >= CEL && (elonezet || !window.qnAblakSzabad || window.qnAblakSzabad())) { kesz = true; clearInterval(tik); nyit(); }
  }, 1000);
  function nyit(){
    var d = document.createElement('div');
    d.className = 'hl-hatter';
    d.innerHTML = '<div class="hl-ablak" role="dialog" aria-modal="true" aria-labelledby="hl-cim">' +
      '<button type="button" class="hl-zar" aria-label="Bezárás">×</button>' +
      '<p class="hl-felirat">Napi AI-emlékeztető</p>' +
      '<h2 id="hl-cim">Lemaradni elég 1 hét.</h2>' +
      '<p class="hl-szoveg">Ennyi idő alatt jön ki egy új modell, és ír át mindent, amit eddig elképzeltél. Összeszedjük neked, ami ebből számít.</p>' +
      '<form class="hl-urlap" novalidate><label class="hl-cimke" for="hl-email-mezo">Hova küldjük?</label>' +
      '<input id="hl-email-mezo" type="email" name="email" placeholder="nev@pelda.hu" autocomplete="email" required>' +
      '<button type="submit">Kérem a napi összefoglalót</button></form>' +
      '<p class="hl-uzenet" role="status" aria-live="polite"></p>' +
      '<p class="hl-jog">Az e-mail-címedet csak erre az emlékeztetőre használjuk. <a href="/adatvedelem#hirlevel">Részletek</a></p>' +
      '<button type="button" class="hl-most-nem">Most nem</button></div>';
    document.body.appendChild(d);
    var elozo = document.activeElement, mezo = d.querySelector('input'), uz = d.querySelector('.hl-uzenet');
    document.documentElement.classList.add('hl-nyitva');
    setTimeout(function(){ d.classList.add('bent'); }, 30);
    setTimeout(function(){ try { mezo.focus({preventScroll: true}); } catch(e) {} }, 350);
    function zar(){ if (window.qnAblakZarva) window.qnAblakZarva(); t('qn-hl-zarva', String(Date.now())); d.classList.remove('bent'); document.documentElement.classList.remove('hl-nyitva');
      setTimeout(function(){ d.remove(); if (elozo && elozo.focus) try { elozo.focus({preventScroll: true}); } catch(e) {} }, 400);
      document.removeEventListener('keydown', bill); }
    function bill(e){ if (e.key === 'Escape') zar(); }
    document.addEventListener('keydown', bill);
    d.addEventListener('click', function(e){ if (e.target === d) zar(); });
    d.querySelector('.hl-zar').onclick = zar; d.querySelector('.hl-most-nem').onclick = zar;
    d.querySelector('form').addEventListener('submit', function(e){
      e.preventDefault(); var gomb = d.querySelector('form button'); var cim = mezo.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cim)) { uz.textContent = 'Ez a cím nem tűnik érvényesnek.'; uz.className = 'hl-uzenet hiba'; mezo.focus(); return; }
      gomb.disabled = true; uz.textContent = ''; uz.className = 'hl-uzenet';
      fetch('/api/hirlevel', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: cim, forras: 'popup'})})
        .then(function(r){ return r.json(); }).then(function(j){
          if (j.rendben) { t('qn-hl-kesz', '1'); d.querySelector('.hl-ablak').classList.add('sikeres');
            d.querySelector('form').hidden = true; d.querySelector('.hl-most-nem').textContent = 'Bezárás';
            uz.textContent = j.uzenet || 'Kész, feliratkoztál.';
            try { if (window.gtag) gtag('event', 'hirlevel_feliratkozas'); } catch(e) {} }
          else { uz.textContent = j.uzenet || 'Nem sikerült, próbáld újra.'; uz.className = 'hl-uzenet hiba'; gomb.disabled = false; }
        }).catch(function(){ uz.textContent = 'Most nem érjük el a szervert, próbáld újra.'; uz.className = 'hl-uzenet hiba'; gomb.disabled = false; });
    });
  }
})();
// Videós útmutató-gyűjtő (Heni 2026-11-02): a cikk oldalsávjában lévő videóra kattintva felugrik a videó, alatta/mellette az
// e-mail-cím és a választás (csak az útmutató, vagy a hírlevél is). A kérés az /api/utmutato végpontra megy, a levelet az küldi.
(function(){
  var elonezet = /[?&]utmutato=elonezet/.test(location.search);
  document.querySelectorAll('[data-utm-elonezet]').forEach(function(x){ if (elonezet) x.hidden = false; });
  // a főoldali kártyán a videó ott helyben megy; ha valaki elindít egyet, a többi megáll
  var mobil = window.matchMedia('(max-width: 640px)');
  document.querySelectorAll('.gyu-video').forEach(function(v){
    // mobilon a kis előnézeten a gyári vezérlősáv zsúfolt: helyette lejátszógomb, koppintásra indul
    if (mobil.matches) { v.controls = false; v.addEventListener('click', function(){ if (v.paused) { v.controls = true; v.play(); } }); }
    v.addEventListener('play', function(){
    document.querySelectorAll('.gyu-video').forEach(function(m){ if (m !== v) m.pause(); });
    // mobilon a kártyán csak kis előnézet van, ezért lejátszáskor teljes képernyőre vált (asztalon marad a helyén)
    if (mobil.matches && !document.fullscreenElement) {
      try { if (v.requestFullscreen) v.requestFullscreen().catch(function(){}); else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); } catch(e) {}
    }
    v.closest('.gyu-kartya').classList.add('gyu-megy');
    try { if (window.gtag) gtag('event', 'utmutato_video', {anyag: v.closest('[data-utm]').dataset.utm, hely: 'fooldal'}); } catch(e) {}
  }); });
  // a teljes képernyőből kilépve mobilon megáll, hogy ne szóljon tovább a kis előnézetben
  document.addEventListener('fullscreenchange', function(){
    if (document.fullscreenElement || !mobil.matches) return;
    document.querySelectorAll('.gyu-video').forEach(function(v){ v.pause(); });
  });
  document.querySelectorAll('[data-utm]').forEach(function(doboz){
    if (doboz.closest('[hidden]')) return;
    doboz.querySelectorAll('[data-utm-nyit]').forEach(function(g){ g.addEventListener('click', function(){
      var helyi = doboz.querySelector('.gyu-video');
      if (helyi) helyi.pause();
      nyit(doboz.dataset, !helyi);
    }); });
  });
  function nyit(D, indit){
    var d = document.createElement('div');
    d.className = 'hl-hatter utm-hatter';
    d.innerHTML = '<div class="hl-ablak utm-ablak" role="dialog" aria-modal="true" aria-labelledby="utm-ablak-cim">' +
      '<button type="button" class="hl-zar" aria-label="Bezárás">×</button>' +
      '<div class="utm-racs"><div class="utm-video"><video controls playsinline preload="metadata"></video></div>' +
      '<div class="utm-fej"><p class="hl-felirat">Ingyenes gyakorlati útmutató</p>' +
      '<h2 id="utm-ablak-cim"></h2><p class="hl-szoveg utm-anyag"></p></div>' +
      '<div class="utm-urlap-resz"><form class="hl-urlap" novalidate><label class="hl-cimke" for="utm-email-mezo">Hova küldjük?</label>' +
      '<input id="utm-email-mezo" type="email" name="email" placeholder="nev@pelda.hu" autocomplete="email" required>' +
      '<fieldset class="utm-valaszt"><legend class="hl-rejtett">Mit kérsz?</legend>' +
      '<label><input type="radio" name="utm-hl" value="0" checked><span>Csak az útmutatót kérem</span></label>' +
      '<label><input type="radio" name="utm-hl" value="1"><span>Az útmutató mellé a napi AI-hírlevelet is kérem</span></label></fieldset>' +
      '<button type="submit">Kérem az útmutatót</button></form>' +
      '<p class="hl-uzenet" role="status" aria-live="polite"></p>' +
      '<p class="hl-jog">Az e-mail-címedre elküldjük az útmutatót. Hírlevelet csak akkor kapsz, ha azt is kérted, és bármikor leiratkozhatsz. <a href="/adatvedelem#utmutato">Részletek</a></p>' +
      '</div></div></div>';
    d.querySelector('h2').textContent = D.utmCim;
    d.querySelector('.utm-anyag').textContent = D.utmAnyag;
    var v = d.querySelector('video'); v.poster = D.utmPoster; v.src = D.utmVideo;
    document.body.appendChild(d);
    var elozo = document.activeElement, mezo = d.querySelector('input[type=email]'), uz = d.querySelector('.hl-uzenet');
    document.documentElement.classList.add('hl-nyitva');
    setTimeout(function(){ d.classList.add('bent'); }, 30);
    // a kattintás felhasználói mozdulat, így hanggal indulhat; ha a böngésző mégsem engedi, némán indul
    if (indit) try { var p = v.play(); if (p && p.catch) p.catch(function(){ v.muted = true; v.play().catch(function(){}); }); } catch(e) {}
    try { if (window.gtag) gtag('event', 'utmutato_video', {anyag: D.utm}); } catch(e) {}
    function zar(){ try { v.pause(); } catch(e) {} d.classList.remove('bent'); document.documentElement.classList.remove('hl-nyitva');
      setTimeout(function(){ d.remove(); if (elozo && elozo.focus) try { elozo.focus({preventScroll: true}); } catch(e) {} }, 400);
      document.removeEventListener('keydown', bill); }
    function bill(e){ if (e.key === 'Escape') zar(); }
    document.addEventListener('keydown', bill);
    d.addEventListener('click', function(e){ if (e.target === d) zar(); });
    d.querySelector('.hl-zar').onclick = zar;
    setTimeout(function(){ try { d.querySelector('.hl-zar').focus({preventScroll: true}); } catch(e) {} }, 350);
    d.querySelector('form').addEventListener('submit', function(e){
      e.preventDefault(); var gomb = d.querySelector('form button'); var cim = mezo.value.trim();
      var hl = (d.querySelector('input[name=utm-hl]:checked') || {}).value === '1';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cim)) { uz.textContent = 'Ez a cím nem tűnik érvényesnek.'; uz.className = 'hl-uzenet hiba'; mezo.focus(); return; }
      gomb.disabled = true; uz.textContent = ''; uz.className = 'hl-uzenet';
      fetch('/api/utmutato', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: cim, anyag: D.utm, hirlevel: hl, cikk: D.utmCikk})})
        .then(function(r){ return r.json(); }).then(function(j){
          if (j.rendben) { d.querySelector('.hl-ablak').classList.add('sikeres'); d.querySelector('form').hidden = true;
            uz.textContent = j.uzenet || 'Elküldtük az útmutatót.';
            if (hl) try { localStorage.setItem('qn-hl-kesz', '1'); } catch(e) {}
            try { if (window.gtag) gtag('event', 'utmutato_keres', {anyag: D.utm, hirlevel: hl ? 'igen' : 'nem'}); } catch(e) {} }
          else { uz.textContent = j.uzenet || 'Nem sikerült, próbáld újra.'; uz.className = 'hl-uzenet hiba'; gomb.disabled = false; }
        }).catch(function(){ uz.textContent = 'Most nem érjük el a szervert, próbáld újra.'; uz.className = 'hl-uzenet hiba'; gomb.disabled = false; });
    });
  }
})();
// Gyakorlati útmutatók körhintája (Heni 2026-11-02): egyszerre egy kártya látszik, nyíllal és pöttyel váltható, mobilon
// húzással is. Magától is továbblép 8 másodpercenként, de csak ha a sáv látszik, nincs rajta az egér vagy a fókusz, és
// nem megy videó; a mozgáscsökkentést kérő böngészőben nem lapoz magától.
(function(){
  document.querySelectorAll('.gyu').forEach(function(gy){
    var sor = gy.querySelector('[data-gyu-sor]');
    var lapok = sor ? sor.querySelectorAll('.gyu-kartya') : [];
    if (lapok.length < 2) return;
    var pontok = gy.querySelectorAll('[data-gyu-pont]'), lapozo = gy.querySelector('.gyu-lapozo'), akt = 0, ido = null, megall = false, lathato = false;
    var csendes = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // ha minden kártya elfér (asztalon a kettő egymás mellett), nincs lapozó és nem lapoz magától
    function elfer(){ return sor.scrollWidth <= sor.clientWidth + 2; }
    function igazit(){ var e = elfer(); if (lapozo) lapozo.hidden = e; if (e && sor.scrollLeft) sor.scrollLeft = 0; }
    var szaml = gy.querySelector('[data-gyu-szamlalo]');
    function jelol(i){ akt = i; pontok.forEach(function(p, k){ p.setAttribute('aria-current', k === i ? 'true' : 'false'); }); if (szaml) szaml.textContent = (i + 1) + ' / ' + lapok.length; }
    function ugrik(i){
      i = (i + lapok.length) % lapok.length;
      sor.querySelectorAll('video').forEach(function(v){ if (!v.paused) v.pause(); });
      sor.scrollTo({left: lapok[i].offsetLeft - lapok[0].offsetLeft, behavior: csendes ? 'auto' : 'smooth'});
      jelol(i);
    }
    function megy(){ return [].some.call(sor.querySelectorAll('video'), function(v){ return !v.paused; }); }
    function ujra(){ clearInterval(ido); ido = setInterval(function(){ if (!csendes && lathato && !megall && !megy() && !elfer()) ugrik(akt + 1); }, 8000); }
    gy.querySelector('[data-gyu-elozo]').addEventListener('click', function(){ ugrik(akt - 1); ujra(); });
    gy.querySelector('[data-gyu-kov]').addEventListener('click', function(){ ugrik(akt + 1); ujra(); });
    pontok.forEach(function(p){ p.addEventListener('click', function(){ ugrik(+p.dataset.gyuPont); ujra(); }); });
    // kézi húzás után a pötty kövesse, melyik kártya van elöl
    var io = new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting && e.intersectionRatio > 0.6) jelol([].indexOf.call(lapok, e.target)); }); }, {root: sor, threshold: [0.6]});
    lapok.forEach(function(l){ io.observe(l); });
    new IntersectionObserver(function(es){ lathato = es[0].isIntersecting; }, {threshold: 0.4}).observe(gy);
    gy.addEventListener('mouseenter', function(){ megall = true; });
    gy.addEventListener('mouseleave', function(){ megall = false; });
    gy.addEventListener('focusin', function(){ megall = true; });
    gy.addEventListener('focusout', function(){ megall = false; });
    if (window.ResizeObserver) new ResizeObserver(igazit).observe(sor);
    window.addEventListener('resize', igazit);
    igazit();
    ujra();
  });
})();
// Mentett hírek (Heni 2026-10-13): piros „Elolvasom később” jel a híreken és a cikkoldalon. A lista csak a böngészőben
// él (localStorage qn-mentett, legfeljebb 200 elem), szerverre nem megy. A /mentett oldal a kereso.json alapján rajzol,
// így a levett hír (ami már nincs a kereső mutatójában) a mentettek közül is kikerül.
(function(){
  var TAR = 'qn-mentett', MAX = 200;
  var IKON = (document.querySelector('.mentett-gomb svg') || {}).outerHTML || '';
  var olvas = function(){ try { var l = JSON.parse(localStorage.getItem(TAR) || '[]'); return Array.isArray(l) ? l.filter(function(x){ return x && typeof x.i === 'string'; }) : []; } catch(e) { return []; } };
  var ir = function(l){ try { localStorage.setItem(TAR, JSON.stringify(l.slice(0, MAX))); return true; } catch(e) { return false; } };
  var jelzo = null;
  var jelez = function(html){
    if (!jelzo) { jelzo = document.createElement('div'); jelzo.className = 'mentes-jelzo'; jelzo.setAttribute('role', 'status'); jelzo.setAttribute('aria-live', 'polite'); document.body.appendChild(jelzo); }
    jelzo.innerHTML = html; jelzo.classList.add('lathato'); clearTimeout(jelzo._t);
    jelzo._t = setTimeout(function(){ jelzo.classList.remove('lathato'); }, 3200);
  };
  var allapot = function(el, be){
    el.classList.toggle('mentve', be); el.setAttribute('aria-pressed', be ? 'true' : 'false');
    var c = be ? 'Kiveszem a mentett hírek közül' : 'Elolvasom később';
    el.setAttribute('aria-label', c); el.title = c;
    var sz = el.querySelector('.mj-szoveg'); if (sz) sz.textContent = be ? 'Elmentve' : 'Elolvasom később';
  };
  var frissit = function(){
    var l = olvas(), van = {}; l.forEach(function(x){ van[x.i] = 1; });
    [].forEach.call(document.querySelectorAll('[data-ment]'), function(el){ allapot(el, !!van[el.getAttribute('data-ment')]); });
    // a piros szám csak az olvasatlan mentett híreket számolja (Heni 2026-10-23: elolvasásra csökkenjen, ahogy a lista is kiszürkül)
    var db = l.filter(function(x){ return !x.o; }).length;
    [].forEach.call(document.querySelectorAll('[data-mentett-jel]'), function(j){ j.textContent = db > 99 ? '99+' : db; j.hidden = !db; });
  };
  var valt = function(d){
    if (!d || !d.i || !/^\/hir\/[a-z0-9-]{1,200}$/.test(d.u || '')) return;
    var l = olvas(), hol = -1; l.forEach(function(x, j){ if (x.i === d.i) hol = j; });
    if (hol >= 0) { l.splice(hol, 1); if (ir(l)) jelez('Kivetted a mentett hírek közül.'); }
    else {
      l.unshift({i: d.i, u: d.u, c: d.c || '', k: qnKep(d.k || ''), f: d.f || '', t: Date.now(), o: 0});
      if (!ir(l)) { jelez('A böngésződ most nem engedi a mentést.'); return; }
      jelez('Elmentve. A <a href="/mentett">Mentett hírek</a> között megtalálod.');
      try { if (window.gtag) gtag('event', 'hir_mentes'); } catch(e) {}
    }
    frissit();
  };
  var listabol = function(a){
    var cim = a.querySelector('h3, strong, .ks-cim'), kep = a.querySelector('img'), f = a.querySelector('.forras');
    return {i: a.getAttribute('data-hid'), u: a.getAttribute('href'), c: cim ? cim.textContent.trim() : '', k: kep ? kep.getAttribute('src') : '', f: f ? f.textContent.trim() : ''};
  };
  // a jel a hír meta-sorába kerül (forrás, dátum), a hírlinken belül; a kattintást a link előtt elkapjuk
  var felrak = function(){
    [].forEach.call(document.querySelectorAll('a[data-hid]:not([data-ment-kesz])'), function(a){
      a.setAttribute('data-ment-kesz', '');
      if (a.closest('.harang-buborek, .uj-hirek, [data-mentett-oldal]')) return;
      var hely = a.querySelector('.hmeta') || a.querySelector('.ks-lead') || a.querySelector(':scope > span:last-of-type');
      if (!hely || !/^[a-z0-9]{6,40}$/.test(a.getAttribute('data-hid') || '')) return;
      var b = document.createElement('span'); b.className = 'mentes-jel'; b.setAttribute('role', 'button'); b.tabIndex = 0;
      b.setAttribute('data-ment', a.getAttribute('data-hid')); b.innerHTML = IKON; hely.appendChild(b);
    });
    frissit();
  };
  document.addEventListener('click', function(ev){
    var b = ev.target.closest && ev.target.closest('[data-ment]'); if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    if (b.hasAttribute('data-ment-cikk') || b.hasAttribute('data-ment-adat')) valt({i: b.getAttribute('data-ment'), u: b.getAttribute('data-u'), c: b.getAttribute('data-c'), k: b.getAttribute('data-k'), f: b.getAttribute('data-f')});
    else { var a = b.closest('a[data-hid]'); if (a) valt(listabol(a)); }
  }, true);
  document.addEventListener('keydown', function(ev){
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var b = ev.target.closest && ev.target.closest('.mentes-jel'); if (!b) return;
    ev.preventDefault(); ev.stopPropagation(); b.click();
  }, true);
  window.addEventListener('storage', function(ev){ if (ev.key === TAR) frissit(); });
  // a cikkoldal megnyitása: ha a hír mentve volt, olvasottnak jelöljük
  var cikk = document.querySelector('[data-ment-cikk]');
  if (cikk) { var l0 = olvas(), m = false; l0.forEach(function(x){ if (x.i === cikk.getAttribute('data-ment') && !x.o) { x.o = 1; m = true; } }); if (m && ir(l0)) frissit(); }
  // visszalépéskor a böngésző a gyorsítótárból hozza vissza az előző oldalt: a számot akkor is frissíteni kell
  window.addEventListener('pageshow', function(ev){ if (ev.persisted) frissit(); });
  felrak();
  var idozito = null;
  new MutationObserver(function(){ clearTimeout(idozito); idozito = setTimeout(felrak, 120); }).observe(document.body, {childList: true, subtree: true});

  // a /mentett oldal
  var oldal = document.querySelector('[data-mentett-oldal]'); if (!oldal) return;
  var ures = function(){ oldal.innerHTML = '<p class="mentett-ures">Még nincs mentett híred. A hírek mellett a piros könyvjelzőre kattintva mentheted el, amit később szeretnél elolvasni.</p>'; };
  var rajzol = function(lista, elo){
    if (!lista.length) return ures();
    oldal.innerHTML = '<ul class="mentett-lista">' + lista.map(function(x){
      var h = elo[x.i], kep = qnKep(h.p) || qnKep(x.k);
      return '<li class="mentett-elem' + (x.o ? ' olvasott' : '') + '"><a href="' + qnEsc(h.u) + '">'
        + (kep ? '<img src="' + qnEsc(kep) + '" alt="" loading="lazy">' : '<span class="me-nincs"></span>')
        + '<span class="me-torzs"><span class="me-meta"><span class="forras">' + qnEsc(h.k) + '</span><span>' + qnEsc(h.d) + '</span>'
        + (x.o ? '<span class="me-olvasva">Elolvasva</span>' : '') + '</span><strong>' + qnEsc(h.c) + '</strong><span class="me-lead">' + qnEsc(h.b) + '</span></span></a>'
        + '<button type="button" class="me-torol" data-torol="' + qnEsc(x.i) + '" aria-label="Kiveszem a mentett hírek közül" title="Kiveszem a mentett hírek közül"><svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M205.66 194.34a8 8 0 0 1-11.32 11.32L128 139.31l-66.34 66.35a8 8 0 0 1-11.32-11.32L116.69 128 50.34 61.66a8 8 0 0 1 11.32-11.32L128 116.69l66.34-66.35a8 8 0 0 1 11.32 11.32L139.31 128Z"/></svg></button></li>';
    }).join('') + '</ul>';
  };
  oldal.addEventListener('click', function(ev){
    var t = ev.target.closest('[data-torol]'); if (!t) return;
    var id = t.getAttribute('data-torol'), l = olvas().filter(function(x){ return x.i !== id; });
    ir(l); var li = t.closest('li'); if (li) li.remove(); frissit();
    if (!oldal.querySelector('li')) ures();
  });
  var l = olvas(); if (!l.length) return ures();
  fetch('/kereso.json', {cache: 'no-cache'}).then(function(r){ return r.json(); }).then(function(d){
    var elo = {}; d.forEach(function(h){ if (h.i && /^\/hir\/[a-z0-9-]{1,200}$/.test(h.u || '')) elo[h.i] = h; });
    var marad = olvas().filter(function(x){ return elo[x.i]; });
    if (marad.length !== olvas().length) { ir(marad); frissit(); }
    rajzol(marad, elo);
  }).catch(function(){ oldal.innerHTML = '<p class="mentett-ures">Most nem sikerült betölteni a mentett híreidet. Frissítsd az oldalt.</p>'; });
})();
// Útmutató saját oldala (Heni 2026-11-08): a megosztható link másolása; kattintásra a mező kijelölődik
document.addEventListener('click', function(ev){
  var m = ev.target.closest && ev.target.closest('[data-link-mezo]'); if (m) { m.select(); return; }
  var g = ev.target.closest && ev.target.closest('[data-link-masol]'); if (!g) return;
  var mezo = document.querySelector('[data-link-mezo]'); if (!mezo) return;
  var kesz = function(){ g.textContent = 'Kimásolva'; setTimeout(function(){ g.textContent = 'Link másolása'; }, 2200); };
  if (navigator.clipboard) navigator.clipboard.writeText(mezo.value).then(kesz, function(){ mezo.select(); });
  else { mezo.select(); try { document.execCommand('copy'); kesz(); } catch(e) {} }
});
// Megosztás a cikkoldalon: telefonon a rendszer megosztója, máshol a link a vágólapra kerül (Heni 2026-10-18)
document.addEventListener('click', function(ev){
  var g = ev.target.closest && ev.target.closest('[data-megoszt]'); if (!g) return;
  var url = g.getAttribute('data-url'), cim = g.getAttribute('data-cim'), felirat = g.querySelector('span');
  var jelez = function(t){ if (!felirat) return; var regi = 'Megosztás'; felirat.textContent = t; setTimeout(function(){ felirat.textContent = regi; }, 2200); };
  var szamol = function(){ window.qnMegosztva && window.qnMegosztva(g); };
  if (navigator.share) { navigator.share({title: cim, url: url}).then(szamol, function(){}); return; }
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(function(){ jelez('Link kimásolva'); szamol(); }, function(){ prompt('A link:', url); });
  else prompt('A link:', url);
});
// „Meghallgatom”: a hír felolvasása; egy lejátszó az oldalon, a két gomb (asztali és mobil) együtt vált (Heni 2026-10-20)
(function(){
  var gombok = document.querySelectorAll('[data-hallgat]'); if (!gombok.length) return;
  var hang = null;
  var ido = function(s){ s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); };
  var rajz = function(){
    var megy = hang && !hang.paused, maradt = hang && isFinite(hang.duration) ? hang.duration - hang.currentTime : null;
    gombok.forEach(function(g){
      g.setAttribute('aria-pressed', megy ? 'true' : 'false');
      var sz = g.querySelector('.hg-szoveg'); if (sz) sz.textContent = megy ? ('Szünet' + (maradt != null ? ' · ' + ido(maradt) : '')) : (hang && hang.currentTime > 0 && !hang.ended ? 'Folytatom' : 'Meghallgatom');
      g.style.setProperty('--hg', hang && isFinite(hang.duration) && hang.duration ? (hang.currentTime / hang.duration * 100).toFixed(1) + '%' : '0%');
    });
  };
  gombok.forEach(function(g){ g.addEventListener('click', function(){
    if (!hang) { hang = new Audio(g.getAttribute('data-src')); hang.preload = 'auto';
      ['play', 'pause', 'timeupdate', 'ended', 'loadedmetadata'].forEach(function(t){ hang.addEventListener(t, rajz); });
      hang.addEventListener('ended', function(){ hang.currentTime = 0; rajz(); }); }
    if (hang.paused) hang.play().catch(function(){}); else hang.pause();
  }); });
})();
// Megosztásszámláló (Heni 2026-10-20, api/megoszt.js): a gombon kis szám mutatja, hányan osztották meg a hírt.
// Egy böngészőből hírenként egyszer számít (qn-megosztva a helyi tárolóban); személyes adat nem megy a szerverre.
(function(){
  var gombok = document.querySelectorAll('[data-megoszt][data-id]'); if (!gombok.length) return;
  var rajz = function(g, n){ var d = g.querySelector('[data-megoszt-db]'); if (!d) return; n = Number(n) || 0; d.textContent = n > 999 ? (Math.floor(n / 100) / 10).toFixed(1).replace('.', ',') + 'e' : String(n); d.hidden = !n; g.setAttribute('aria-label', 'Megosztás' + (n ? ', eddig ' + n + ' megosztás' : '')); };
  var ids = []; gombok.forEach(function(g){ ids.push(g.getAttribute('data-id')); });
  fetch('/api/megoszt?ids=' + encodeURIComponent(ids.join(',')), {cache: 'no-store'}).then(function(r){ return r.json(); }).then(function(d){
    gombok.forEach(function(g){ rajz(g, (d.db || {})[g.getAttribute('data-id')]); });
  }).catch(function(){});
  window.qnMegosztva = function(g){
    var id = g.getAttribute('data-id'), volt = []; try { volt = JSON.parse(localStorage.getItem('qn-megosztva') || '[]'); } catch(e){}
    if (!Array.isArray(volt)) volt = [];
    if (volt.indexOf(id) >= 0) return;
    volt.push(id); try { localStorage.setItem('qn-megosztva', JSON.stringify(volt.slice(-500))); } catch(e){}
    fetch('/api/megoszt', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: id})})
      .then(function(r){ return r.json(); }).then(function(d){ if (d && d.db) rajz(g, d.db); }).catch(function(){});
  };
})();
// Találati oldal (/kereses?q=...): az összes találat a napi oldal kártyáival (Heni 2026-10-18).
// Audit 2026-11-03: rendezés (relevancia vagy legfrissebb), rovatszűrő, 24-esével „Továbbiak” gomb, elírásnál javaslat.
(function(){
  var oldal = document.querySelector('[data-kereses-oldal]'); if (!oldal) return;
  var q = (new URLSearchParams(location.search).get('q') || '').trim().slice(0, 100);
  var cim = document.querySelector('[data-kereses-cim]'), db = document.querySelector('[data-kereses-db]');
  var mezo = document.getElementById('kereso-mezo'); if (mezo && q) mezo.value = q;
  if (cim) cim.textContent = q ? 'Találatok erre: „' + q + '”' : 'Keresés';
  if (qnKereso.egys(q).replace(/ /g, '').length < 2) { oldal.innerHTML = '<p class="mentett-ures">Írj be legalább 2 betűt a fenti keresőbe, és nyomj Entert.</p>'; return; }
  var LAP = 24, mutat = LAP, rend = 'rel', rovat = '', talalat = [], jav = '';
  function kartya(x){ var kep = x.p || '';
    return '<a class="hir hir-kicsi" href="' + qnEsc(x.u) + '" data-hid="' + qnEsc(x.i) + '">'
      + (kep ? '<div class="hkep"><img src="' + qnEsc(kep) + '" alt="" loading="lazy"></div>' : '')
      + '<div class="htorzs"><div class="hmeta"><span class="forras">' + qnEsc(x.k) + '</span> ' + (x.d ? '<span>' + qnEsc(x.d) + '</span> ' : '')
      + (x.g ? '<span class="kat">' + qnEsc(x.g) + '</span>' : '') + '</div><h3>' + qnEsc(x.c) + '</h3>' + (x.b ? '<p class="hlead">' + qnEsc(x.b) + '</p>' : '') + '</div></a>'; }
  function rajzol(){
    var l = talalat.filter(function(x){ return !rovat || x.g === rovat; });
    if (rend === 'uj') l = l.slice().sort(function(a, b){ return (b.t || '').localeCompare(a.t || ''); });
    var rovatok = {}; talalat.forEach(function(x){ if (x.g) rovatok[x.g] = (rovatok[x.g] || 0) + 1; });
    if (db) { db.textContent = l.length + ' hír'; db.hidden = false; }
    var vez = '<div class="kt-vezerlo">'
      + '<div class="kt-rend" role="group" aria-label="Rendezés"><button type="button" data-rend="rel" aria-pressed="' + (rend === 'rel') + '">Legjobb találat</button><button type="button" data-rend="uj" aria-pressed="' + (rend === 'uj') + '">Legfrissebb</button></div>'
      + (Object.keys(rovatok).length > 1 ? '<label class="kt-rovat"><span>Rovat</span><select data-rovat><option value="">Mind (' + talalat.length + ')</option>'
        + Object.keys(rovatok).sort(function(a, b){ return rovatok[b] - rovatok[a]; }).map(function(g){ return '<option value="' + qnEsc(g) + '"' + (g === rovat ? ' selected' : '') + '>' + qnEsc(g) + ' (' + rovatok[g] + ')</option>'; }).join('') + '</select></label>' : '')
      + '</div>';
    oldal.innerHTML = (jav ? '<p class="kt-javaslat">Erre nem találtunk hírt, ezért a hasonló szóra keresünk: <strong>' + qnEsc(jav) + '</strong>.</p>' : '') + vez
      + '<div class="racs-4">' + l.slice(0, mutat).map(kartya).join('') + '</div>'
      + (l.length > mutat ? '<div class="kt-tovabb"><button type="button" data-tovabb>Továbbiak (' + (l.length - mutat) + ')</button></div>' : '');
  }
  oldal.addEventListener('click', function(e){
    var r = e.target.closest('[data-rend]'); if (r) { rend = r.dataset.rend; mutat = LAP; rajzol(); return; }
    if (e.target.closest('[data-tovabb]')) { var elozo = mutat; mutat += LAP; rajzol(); var k = oldal.querySelectorAll('.racs-4 > a')[elozo]; if (k) k.focus({preventScroll: true}); }
  });
  oldal.addEventListener('change', function(e){ if (e.target.matches('[data-rovat]')) { rovat = e.target.value; mutat = LAP; rajzol(); } });
  fetch('/kereso.json', {cache: 'no-cache'}).then(function(r){ return r.json(); }).then(function(d){
    var m = qnKereso.elokeszit(d.filter(function(x){ return /^\/hir\/[a-z0-9-]{1,200}$/.test(x.u || ''); }));
    var p = qnKereso.pontoz(m, q);
    if (!p.length) { jav = qnKereso.javasol(m, q); if (jav) p = qnKereso.pontoz(m, jav); }
    talalat = p.map(function(t){ return t[1]; });
    if (!talalat.length) { if (db) { db.textContent = '0 hír'; db.hidden = false; } oldal.innerHTML = '<p class="mentett-ures">Erre nincs találat. Próbálj rövidebb vagy másik szót.</p>'; return; }
    rajzol();
  }).catch(function(){ oldal.innerHTML = '<p class="mentett-ures">Most nem sikerült betölteni a találatokat. Frissítsd az oldalt.</p>'; });
})();
// Szavazás: párbajok (Heni 2026-10-14). Minden [data-parbaj] elem egy párbaj; az állás csak a saját szavazat után
// (vagy a lezárt párbajnál) látszik. Mobilon a Szavazás oldal futó párbajai húzható kártyapakliként jönnek:
// balra húzva a bal oldali, jobbra húzva a jobb oldali eszközre szavazol.
(function(){
  var dobozok = [].slice.call(document.querySelectorAll('[data-parbaj]'));
  var eredmenyek = [].slice.call(document.querySelectorAll('[data-parbaj-eredm]'));
  if (!dobozok.length && !eredmenyek.length) return;
  var nyugodt = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ft = new Intl.NumberFormat('hu-HU');
  // ugyanaz a névtelen böngészőazonosító, mint a hírszavazásnál; csak az első szavazáskor jön létre
  var latOlvas = function(){ try { var l = localStorage.getItem('qn-l') || ''; return /^[a-z0-9]{16,40}$/.test(l) ? l : ''; } catch(e) { return ''; } };
  var lat = function(){ var l = latOlvas(); if (l) return l; var u = ''; try { var r = new Uint8Array(16); crypto.getRandomValues(r); for (var i = 0; i < 16; i++) u += (r[i] < 16 ? '0' : '') + r[i].toString(16); } catch(e) { for (var j = 0; j < 24; j++) u += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; } try { localStorage.setItem('qn-l', u); } catch(e) { return ''; } return u; };
  var ids = [];
  dobozok.concat(eredmenyek).forEach(function(d){ var id = d.getAttribute('data-parbaj') || d.getAttribute('data-parbaj-eredm'); if (ids.indexOf(id) < 0) ids.push(id); });

  var szamlal = function(el, cel, uto){
    if (nyugodt) { el.textContent = ft.format(cel) + uto; return; }
    var t0 = performance.now();
    var lep = function(t){ var x = Math.min(1, (t - t0) / 900); el.textContent = ft.format(Math.round(cel * (1 - Math.pow(1 - x, 3)))) + uto; if (x < 1) requestAnimationFrame(lep); };
    requestAnimationFrame(lep);
  };
  var szikrak = function(gomb){
    if (nyugodt || !gomb || !gomb.animate) return;
    var szulo = gomb.closest('.pb-jelolt'); if (!szulo) return;
    var r = gomb.getBoundingClientRect(), p = szulo.getBoundingClientRect();
    for (var i = 0; i < 22; i++) (function(i){
      var s = document.createElement('span'); s.className = 'pb-szikra';
      s.style.left = (r.left - p.left + r.width / 2) + 'px'; s.style.top = (r.top - p.top + r.height / 2) + 'px';
      s.style.background = i % 3 ? 'var(--kiemelo)' : (i % 2 ? 'var(--piros)' : 'var(--szoveg)');
      szulo.appendChild(s);
      var sz = Math.random() * Math.PI * 2, t = 50 + Math.random() * 100;
      s.animate([{ transform: 'translate(-50%,-50%)', opacity: 1 }, { transform: 'translate(' + (Math.cos(sz) * t) + 'px,' + (Math.sin(sz) * t - 30) + 'px) rotate(' + (Math.random() * 360) + 'deg) scale(.4)', opacity: 0 }],
        { duration: 650 + Math.random() * 450, easing: 'cubic-bezier(.32,.72,0,1)' }).onfinish = function(){ s.remove(); };
    })(i);
  };

  // egy párbaj megjelenítése az állással (ha van) és a saját választással
  var rajzol = function(d, allas, sajat, animal){
    var st = d.getAttribute('data-allapot');
    var lathato = !!allas && (sajat || st === 'lezart');
    d.classList.toggle('pb-voksolt', lathato);
    var ossz = allas ? allas.a + allas.b : 0;
    ['a', 'b'].forEach(function(o){
      var j = d.querySelector('.pb-jelolt[data-oldal="' + o + '"]'); if (!j) return;
      j.classList.toggle('pb-valasztott', sajat === o);
      if (!lathato) return;
      var szaz = ossz ? Math.round(100 * allas[o] / ossz) : 0;
      j.classList.toggle('pb-vezeto', ossz > 0 && allas[o] >= allas[o === 'a' ? 'b' : 'a']);
      var sz = j.querySelector('.pb-szaz'), cs = j.querySelector('.pb-csik i'), db = j.querySelector('.pb-db');
      if (animal) szamlal(sz, szaz, '%'); else sz.textContent = szaz + '%';
      db.textContent = ft.format(allas[o]) + ' szavazat';
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ cs.style.width = szaz + '%'; }); });
    });
    var al = d.querySelector('.pb-allas'), masik = d.querySelector('.pb-masik');
    if (sajat) {
      var nev = d.getAttribute('data-' + sajat);
      // a szavazat lezárva (Heni 2026-10-18): nincs „Mégis a másikat”, csak kiírjuk, hogy már szavazott
      if (al) al.textContent = 'Már szavaztál: ' + nev + ' · ' + ft.format(ossz) + ' szavazat eddig';
      if (masik) masik.hidden = true;
    } else if (al && st === 'lezart' && allas) {
      al.textContent = ft.format(ossz) + ' szavazat';
    }
  };
  var eredmRajz = function(e, allas){
    if (!allas) return;
    var ossz = allas.a + allas.b, pa = ossz ? Math.round(100 * allas.a / ossz) : 0, pb = ossz ? 100 - pa : 0;
    e.classList.add('pb-er-kesz');
    e.querySelector('.pb-er-db').textContent = ft.format(ossz);
    e.querySelector('.pb-er-a').textContent = pa + '%';
    e.querySelector('.pb-er-b').textContent = pb + '%';
    var ia = e.querySelector('.pb-er-sav .a'), ib = e.querySelector('.pb-er-sav .b');
    ia.classList.toggle('vezet', allas.a >= allas.b); ib.classList.toggle('vezet', allas.b > allas.a);
    var jegy = e.querySelector('.pb-er-jegy'); if (jegy) jegy.textContent = '';
    var fel = function(){ ia.style.width = 'calc(' + pa + '% - 2px)'; ib.style.width = 'calc(' + pb + '% - 1px)'; };
    if (window.IntersectionObserver && !nyugodt) {
      var io = new IntersectionObserver(function(x){ if (x[0].isIntersecting) { fel(); io.disconnect(); } }, { threshold: .3 });
      io.observe(e); setTimeout(fel, 2500);
    } else fel();
  };
  var allapotok = {};
  var mindent = function(id, animal){
    var a = allapotok[id] || {};
    dobozok.forEach(function(d){ if (d.getAttribute('data-parbaj') === id) rajzol(d, a.allas, a.sajat, animal); });
    eredmenyek.forEach(function(e){ if (e.getAttribute('data-parbaj-eredm') === id) eredmRajz(e, a.allas); });
  };

  var mobil = window.matchMedia && matchMedia('(max-width: 640px)');
  var szavaz = function(d, o, gomb){
    var id = d.getAttribute('data-parbaj'), l = lat();
    if (!l) return Promise.resolve(false);
    if (gomb) szikrak(gomb);
    return fetch('/api/parbaj', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, l: l, valasztas: o }) })
      .then(function(r){ return r.json(); }).then(function(j){
        if (j.hiba) {
          var al = d.querySelector('.pb-allas'); if (al) al.textContent = j.hiba;
          // mobilon nagy, piros jelzés, ha már szavazott (Heni 2026-10-14)
          if (j.mar && mobil && mobil.matches) {
            var regiJel = d.querySelector('.pb-mar'); if (regiJel) regiJel.remove();
            var jel = document.createElement('div'); jel.className = 'pb-mar'; jel.setAttribute('role', 'alert'); jel.textContent = 'Már szavaztál ebben a párbajban!';
            d.appendChild(jel); setTimeout(function(){ jel.remove(); }, 2600);
          }
          // Audit 2026-11-03: ha már szavazott (akár másik eszközről, ugyanarról a hálózatról), az állás akkor is látsszon
          if (j.mar && j.allas && j.sajat) { allapotok[id] = { allas: j.allas, sajat: j.sajat }; mindent(id, true); }
          return j.mar ? 'mar' : false;
        }
        allapotok[id] = { allas: j.allas, sajat: j.sajat }; mindent(id, true);
        try { if (window.gtag) gtag('event', 'parbaj_szavazat', { parbaj: id, valasztas: d.getAttribute('data-' + o) }); } catch(e) {}
        return true;
      }).catch(function(){ var al = d.querySelector('.pb-allas'); if (al) al.textContent = 'Most nem sikerült, próbáld újra.'; return false; });
  };
  dobozok.forEach(function(d){
    d.addEventListener('click', function(ev){
      var g = ev.target.closest('[data-valaszt]'); if (g) { ev.preventDefault(); szavaz(d, g.getAttribute('data-valaszt'), g); return; }
      var m = ev.target.closest('.pb-masik'); if (m) { ev.preventDefault(); szavaz(d, m.getAttribute('data-masik'), null); }
    });
  });

  // beúszás: a két jelölt oldalról, középen a VAGY, amikor a párbaj láthatóvá válik
  if (!nyugodt && window.IntersectionObserver) {
    var bio = new IntersectionObserver(function(x){ x.forEach(function(b){ if (b.isIntersecting) { b.target.classList.add('pb-be'); bio.unobserve(b.target); } }); }, { threshold: .2 });
    dobozok.forEach(function(d){ bio.observe(d); });
  }

  // ---------- mobil pakli a Szavazás oldalon
  var pakli = document.querySelector('[data-pb-pakli]');
  // asztali lapozó (Heni 2026-10-14): egyszerre egy teljes kártya, nyilakkal és pontokkal; mobilon a pakli dolgozik
  var lapozoElore = null;
  var lapozo = document.querySelector('[data-pb-lapozo]');
  if (lapozo && pakli && !(mobil && mobil.matches)) {
    var lapokL = [].slice.call(pakli.children).filter(function(x){ return x.classList.contains('pb'); });
    if (lapokL.length > 1) {
      lapozo.classList.add('pb-lapozo-be');
      var aktL = 0, pontok = lapozo.querySelector('.pb-lapozo-pontok');
      var mutatL = function(i){
        aktL = (i + lapokL.length) % lapokL.length;
        lapokL.forEach(function(l, k){ l.classList.toggle('pb-lap-aktiv', k === aktL); });
        if (pontok) [].forEach.call(pontok.children, function(b, k){ b.classList.toggle('aktiv', k === aktL); b.setAttribute('aria-selected', k === aktL ? 'true' : 'false'); });
      };
      if (pontok) lapokL.forEach(function(l, i){
        var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab');
        b.setAttribute('aria-label', (i + 1) + '. párbaj: ' + (l.getAttribute('data-a') || '') + ' vagy ' + (l.getAttribute('data-b') || ''));
        b.addEventListener('click', function(){ mutatL(i); }); pontok.appendChild(b);
      });
      [].forEach.call(lapozo.querySelectorAll('[data-lap]'), function(b){ b.addEventListener('click', function(){ mutatL(aktL + Number(b.getAttribute('data-lap'))); }); });
      lapozoElore = function(id){
        var i = -1; lapokL.forEach(function(l, k){ if (l.getAttribute('data-parbaj') === id) i = k; });
        if (i < 0) return false;
        mutatL(i); lapozo.scrollIntoView({behavior: 'auto', block: 'start'}); return true;
      };
      mutatL(0);
    }
  }
  // az eredménylista „Szavazok ebben” gombja: mobilon a pakli tetejére hozza a párbajt, máshol odagörget
  var pakliElore = null;
  document.addEventListener('click', function(ev){
    var g = ev.target.closest && ev.target.closest('[data-ugras]'); if (!g) return;
    var id = g.getAttribute('data-ugras');
    if (pakliElore && pakliElore(id)) return;
    if (lapozoElore && lapozoElore(id)) return;
    var cel = null; dobozok.forEach(function(d){ if (!cel && d.getAttribute('data-parbaj') === id) cel = d; });
    if (cel) cel.scrollIntoView({behavior: 'auto', block: 'start'});
  });
  var pakliIndit = function(){
    if (!pakli || !mobil || !mobil.matches || pakli.classList.contains('pb-pakli-be')) return;
    var lapok = [].slice.call(pakli.querySelectorAll('.pb[data-allapot="fut"]'));
    if (lapok.length < 1) return;
    // először azok, amelyekre még nem szavazott
    lapok.sort(function(x, y){ return (allapotok[x.getAttribute('data-parbaj')] || {}).sajat ? 1 : ((allapotok[y.getAttribute('data-parbaj')] || {}).sajat ? -1 : 0); });
    lapok.forEach(function(l){ pakli.appendChild(l); });
    pakli.classList.add('pb-pakli-be');
    // nagy, sárga útmutató (Heni 2026-10-14): mit kell csinálni, és melyik irány melyik eszköz
    var tipp = document.createElement('div'); tipp.className = 'pb-pakli-tipp';
    var tippFo = document.createElement('b'); tippFo.textContent = 'Húzd a kártyát balra vagy jobbra: amerre húzod, arra szavazol!';
    var tippIrany = document.createElement('span'); tippIrany.className = 'pb-pakli-irany';
    var tippBal = document.createElement('span'), tippJobb = document.createElement('span');
    tippIrany.append(tippBal, tippJobb); tipp.append(tippFo, tippIrany);
    var gombok = document.createElement('div'); gombok.className = 'pb-pakli-gombok';
    gombok.innerHTML = '<button type="button" data-irany="a" aria-label="A bal oldali eszközt választom">←</button><button type="button" data-irany="b" aria-label="A jobb oldali eszközt választom">→</button>';
    pakli.parentNode.insertBefore(tipp, pakli); pakli.parentNode.insertBefore(gombok, pakli.nextSibling);
    var sor = [].slice.call(lapok).reverse(); // a tömb vége a legfelső kártya
    var felso = function(){ return sor.length ? sor[sor.length - 1] : null; };
    var rendez = function(){
      lapok.forEach(function(l){ l.classList.remove('pb-lap-0', 'pb-lap-1', 'pb-lap-2', 'pb-lap-el'); l.style.transform = ''; l.style.opacity = ''; });
      for (var i = 0; i < sor.length; i++) { var mely = sor.length - 1 - i; sor[i].classList.add(mely < 3 ? 'pb-lap-' + mely : 'pb-lap-el'); }
      var f = felso(); if (f) { tippBal.textContent = '← ' + f.getAttribute('data-a'); tippJobb.textContent = f.getAttribute('data-b') + ' →'; }
      if (!sor.length) {
        var v = document.createElement('div'); v.className = 'pb-pakli-vege';
        v.innerHTML = '<b>Ennyi volt mára</b><span>Minden futó párbajban szavaztál. Lent látod az állást, és jövő héten új párbajok jönnek.</span>';
        pakli.appendChild(v); gombok.hidden = true; tipp.hidden = true;
      }
    };
    // szavazás után az eredményekhez ugrik, kiemeli a párbaj sorát; ha van még párbaj, egy gombbal vissza lehet menni (Heni 2026-10-14)
    var vissza = document.createElement('button'); vissza.type = 'button'; vissza.className = 'pb-er-tovabb'; vissza.hidden = true;
    vissza.textContent = 'Jöhet a következő párbaj ↑';
    vissza.addEventListener('click', function(){ tipp.scrollIntoView({behavior: 'auto', block: 'start'}); });
    pakliElore = function(id){
      var i = -1; sor.forEach(function(l, k){ if (l.getAttribute('data-parbaj') === id) i = k; });
      if (i < 0) return false;
      var l = sor.splice(i, 1)[0]; sor.push(l); rendez(); fog();
      tipp.scrollIntoView({behavior: 'auto', block: 'start'});
      return true;
    };
    var ugrik = function(id){
      var sorEr = null;
      eredmenyek.forEach(function(e){ if (e.getAttribute('data-parbaj-eredm') === id) sorEr = e; });
      var cel = sorEr || document.getElementById('eredmenyek'); if (!cel) return;
      if (sorEr) {
        eredmenyek.forEach(function(e){ e.classList.remove('pb-er-friss'); });
        sorEr.classList.add('pb-er-friss');
        vissza.hidden = !sor.length; sorEr.parentNode.insertBefore(vissza, sorEr.nextSibling);
      }
      cel.scrollIntoView({behavior: 'auto', block: 'center'});
    };
    // húzáskor csak az a jelölt mozdul, amelyik felé húzzák: balra a felső (a), jobbra az alsó (b) (Heni 2026-10-14)
    var jeloltMozgat = function(l, v){
      var ja = l.querySelector('.pb-jelolt[data-oldal="a"]'), jb = l.querySelector('.pb-jelolt[data-oldal="b"]');
      var cel = v < 0 ? ja : v > 0 ? jb : null;
      [ja, jb].forEach(function(j){ if (j && j !== cel) j.style.transform = ''; });
      if (cel) cel.style.transform = 'translateX(' + v + 'px) rotate(' + (v / 30) + 'deg)';
    };
    var pecset0 = function(l){ [].forEach.call(l.querySelectorAll('.pb-jelolt'), function(j){ j.style.setProperty('--pb-pecset', 0); }); };
    var kidob = function(l, o){
      var irany = o === 'a' ? -1 : 1; jeloltMozgat(l, 0);
      szavaz(l, o, null).then(function(ok){
        if (ok === 'mar') {
          l.style.transform = ''; pecset0(l);
          setTimeout(function(){
            l.style.transform = 'translateX(' + (irany * 120) + '%) rotate(' + (irany * 22) + 'deg)'; l.style.opacity = '0';
            setTimeout(function(){ var i = sor.indexOf(l); if (i >= 0) sor.splice(i, 1); l.classList.add('pb-lap-kesz'); rendez(); fog(); }, nyugodt ? 50 : 380);
          }, 2200);
          return;
        }
        if (!ok) { l.style.transform = ''; pecset0(l); return; }
        l.classList.add('pb-lap-eredm');
        setTimeout(function(){
          l.style.transform = 'translateX(' + (irany * 120) + '%) rotate(' + (irany * 22) + 'deg)'; l.style.opacity = '0';
          setTimeout(function(){ sor.pop(); l.classList.remove('pb-lap-eredm'); l.classList.add('pb-lap-kesz'); rendez(); fog(); ugrik(l.getAttribute('data-parbaj')); }, nyugodt ? 50 : 380);
        }, nyugodt ? 500 : 1500);
      });
    };
    var fog = function(){
      var l = felso(); if (!l || l._fog) return; l._fog = 1;
      var x0 = null, y0 = null, dx = 0, dy = 0, iranyok = null;
      var pecset = function(v){ ['a', 'b'].forEach(function(o){ var j = l.querySelector('.pb-jelolt[data-oldal="' + o + '"]'); if (j) j.style.setProperty('--pb-pecset', o === 'a' ? Math.max(0, Math.min(1, -v / 80)) : Math.max(0, Math.min(1, v / 80))); }); };
      l.addEventListener('pointerdown', function(e){ if (felso() !== l || l.classList.contains('pb-lap-eredm') || e.target.closest('a,button')) return; x0 = e.clientX; y0 = e.clientY; dx = dy = 0; iranyok = null; });
      l.addEventListener('pointermove', function(e){
        if (x0 === null) return; dx = e.clientX - x0; dy = e.clientY - y0;
        if (iranyok === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) { iranyok = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; if (iranyok === 'x') { l.setPointerCapture(e.pointerId); l.classList.add('pb-huzott'); } }
        if (iranyok !== 'x') return;
        e.preventDefault(); if (!l._raf) l._raf = requestAnimationFrame(function(){ l._raf = 0; if (x0 !== null) { jeloltMozgat(l, dx); pecset(dx); } });
      });
      var vege = function(){ if (x0 === null) return; x0 = null; l.classList.remove('pb-huzott'); if (iranyok === 'x' && Math.abs(dx) > 80) kidob(l, dx < 0 ? 'a' : 'b'); else { jeloltMozgat(l, 0); pecset(0); } };
      l.addEventListener('pointerup', vege); l.addEventListener('pointercancel', vege);
    };
    gombok.addEventListener('click', function(e){ var b = e.target.closest('[data-irany]'); var l = felso(); if (!b || !l || l.classList.contains('pb-lap-eredm')) return; var o = b.getAttribute('data-irany'); var j = l.querySelector('.pb-jelolt[data-oldal="' + o + '"]'); if (j) j.style.setProperty('--pb-pecset', 1); kidob(l, o); });
    // akikre már szavazott, azok nem kerülnek a pakliba, hanem lent maradnak
    sor = sor.filter(function(l){ var s = (allapotok[l.getAttribute('data-parbaj')] || {}).sajat; if (s) { l.classList.add('pb-lap-kesz'); return false; } return true; });
    rendez(); fog();
  };

  var l = latOlvas();
  fetch('/api/parbaj?ids=' + encodeURIComponent(ids.join(',')) + (l ? '&l=' + l : ''), { cache: 'no-store' })
    .then(function(r){ return r.json(); }).then(function(j){
      ids.forEach(function(id){ allapotok[id] = { allas: (j.allas || {})[id], sajat: (j.sajat || {})[id] }; mindent(id, false); });
    }).catch(function(){}).then(pakliIndit);
})();

// Esti hangos összefoglaló (Heni 2026-11-01): lejátszás, hátralévő idő, equalizer (CSS), lezárt képernyős vezérlés (Media Session)
// 2026-11-10: az /osszefoglalok oldalon több adás is van, mindegyik saját lejátszóval; egyszerre csak egy szól
[].forEach.call(document.querySelectorAll('[data-esti]'), function(sav){
  var gomb = sav.querySelector('.esti-gomb'), idoEl = sav.querySelector('[data-esti-ido]'), hang = null;
  var ido = function(s){ s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); };
  // megjegyzi, hol tartott a hallgatás (Heni 2026-11-02, mint az appban): megállítás, lapozás, másik oldal után innen folytatja.
  // Adásonként egy kulcs, a végére érve törlődik. A tárolás hibája (privát mód) nem akadályozza a lejátszást.
  var hely = 'qn-esti-hely:' + sav.getAttribute('data-src'), mentve = 0;
  try { mentve = parseFloat(localStorage.getItem(hely)) || 0; } catch (e) {}
  var ment = function(){
    if (!hang) return;
    try {
      if (hang.ended || hang.currentTime < 1) localStorage.removeItem(hely);
      else localStorage.setItem(hely, hang.currentTime.toFixed(1));
    } catch (e) {}
  };
  var mp0 = +sav.getAttribute('data-mp') || 0;
  if (mentve > 1 && (!mp0 || mentve < mp0 - 1)) idoEl.textContent = ido(mp0 - mentve); else mentve = 0;
  var rajz = function(){
    var megy = hang && !hang.paused;
    sav.classList.toggle('szol', !!megy);
    gomb.setAttribute('aria-pressed', megy ? 'true' : 'false');
    if (hang && isFinite(hang.duration) && hang.duration && !huz) {
      idoEl.textContent = (hang.currentTime > 0 && !hang.ended) ? ido(hang.duration - hang.currentTime) : ido(hang.duration);
    }
  };
  // equalizer (spektrumanalizátor): oszloponként egy frekvenciasáv, balra a mély, jobbra a magas hang. Az adat a hang előre
  // kiszámolt sávjai (…-eq.bin, képkockánként 48 bájt), a hang aktuális idejéhez igazítva; gyors emelkedés, lassabb esés,
  // a tetején lassan süllyedő csúcsjelző. Megállítva az oszlopok leülnek.
  var oszl = sav.querySelectorAll('.esti-eq b'), eq = null, eqSav = +sav.getAttribute('data-eq-savok') || 48,
      eqFps = +sav.getAttribute('data-eq-fps') || 25, n = oszl.length, szint = new Float32Array(n), csucs = new Float32Array(n), pihen = new Float32Array(n),
      fut = false, elozo = 0;
  for (var pi = 0; pi < n; pi++) { pihen[pi] = 0.10 + 0.32 * Math.abs(Math.sin(pi * 1.7 + 0.4)) * (1 - 0.6 * pi / Math.max(1, n)); szint[pi] = csucs[pi] = pihen[pi]; }
  var eqBetolt = function(){
    var u = sav.getAttribute('data-eq'); if (!u || eq) return;
    fetch(u).then(function(r){ return r.arrayBuffer(); }).then(function(b){ eq = new Uint8Array(b); }).catch(function(){});
  };
  var kocka = function(most){
    var szol = hang && !hang.paused, dt = Math.min(0.1, (most - (elozo || most)) / 1000); elozo = most;
    sav.classList.toggle('szol', szol);
    var k = szol ? Math.floor(hang.currentTime * eqFps) : -1, nyugszik = true;
    for (var i = 0; i < n; i++) {
      var s = Math.min(eqSav - 1, Math.floor(i * eqSav / n)), v = 0;
      if (szol && eq && (k + 1) * eqSav <= eq.length) v = eq[k * eqSav + s] / 255;
      else if (!szol) v = pihen[i];
      szint[i] = v > szint[i] ? szint[i] + (v - szint[i]) * 0.6 : Math.max(v, szint[i] - dt * 2.2);
      csucs[i] = szint[i] > csucs[i] ? szint[i] : Math.max(szint[i], csucs[i] - dt * 0.55);
      var o = oszl[i];
      o.firstChild.style.transform = 'scaleY(' + Math.max(0.04, szint[i]).toFixed(3) + ')';
      o.lastChild.style.bottom = Math.min(94, Math.max(0.04, csucs[i]) * 100).toFixed(1) + '%';
      if (Math.abs(szint[i] - pihen[i]) > 0.002 || Math.abs(csucs[i] - szint[i]) > 0.002) nyugszik = false;
    }
    if (szol || !nyugszik) requestAnimationFrame(kocka); else { fut = false; elozo = 0; }
  };
  var indit = function(){ if (!fut) { fut = true; requestAnimationFrame(kocka); } };
  var letrehoz = function(){
    eqBetolt();
    if (hang) return;
    hang = new Audio(sav.getAttribute('data-src')); hang.preload = 'auto';
    hang.addEventListener('play', function(){ if (window.qnEstiMost && window.qnEstiMost !== hang) window.qnEstiMost.pause(); window.qnEstiMost = hang; });
    hang.addEventListener('play', indit); hang.addEventListener('pause', indit);
    ['play', 'pause', 'timeupdate', 'ended', 'loadedmetadata'].forEach(function(t){ hang.addEventListener(t, rajz); });
    hang.addEventListener('ended', function(){ hang.currentTime = 0; rajz(); try { localStorage.removeItem(hely); } catch (e) {} });
    if (mentve > 1) hang.addEventListener('loadedmetadata', function(){ if (mentve < hang.duration - 1) hang.currentTime = mentve; mentve = 0; }, { once: true });
    var utolso = 0;
    hang.addEventListener('timeupdate', function(){ if (Math.abs(hang.currentTime - utolso) >= 2) { utolso = hang.currentTime; ment(); } });
    hang.addEventListener('pause', ment);
    window.addEventListener('pagehide', ment);
    document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') ment(); });
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: sav.getAttribute('data-cim'), artist: 'quicknews.hu',
        artwork: [{ src: '/assets/qn-ikon-512.png', sizes: '512x512', type: 'image/png' }] });
      navigator.mediaSession.setActionHandler('play', function(){ hang.play(); });
      navigator.mediaSession.setActionHandler('pause', function(){ hang.pause(); });
      try { navigator.mediaSession.setActionHandler('seekbackward', function(){ hang.currentTime = Math.max(0, hang.currentTime - 10); }); } catch (e) {}
      try { navigator.mediaSession.setActionHandler('seekforward', function(){ hang.currentTime = Math.min(hang.duration || 0, hang.currentTime + 10); }); } catch (e) {}
    }
  };
  gomb.addEventListener('click', function(){
    letrehoz();
    if (hang.paused) hang.play().catch(function(){}); else hang.pause();
  });
  // tekerés (Heni 2026-11-04): az equalizeren vízszintesen húzva (egérrel vagy ujjal) előre-hátra lehet menni az adásban.
  // A sáv szélessége az adás teljes hossza; a vékony alsó csík mutatja, hol tart. Függőleges húzásra az oldal görget tovább.
  var eqDoboz = sav.querySelector('.esti-eq'), huz = null;
  var hossz = function(){ return (hang && isFinite(hang.duration) && hang.duration) || mp0 || 0; };
  var helyzet = function(){
    var h = hossz(), t = huz ? huz.t : (hang ? hang.currentTime : mentve);
    eqDoboz.style.setProperty('--hol', h ? Math.min(1, Math.max(0, t / h)).toFixed(4) : 0);
    eqDoboz.setAttribute('aria-valuenow', Math.round(t));
    eqDoboz.setAttribute('aria-valuetext', ido(t) + ' / ' + ido(h));
  };
  var ugrik = function(t){
    letrehoz();
    var h = hossz(); t = Math.max(0, Math.min(h ? h - 0.5 : t, t));
    if (isFinite(hang.duration) && hang.duration) hang.currentTime = t;
    else { mentve = t; hang.addEventListener('loadedmetadata', function(){ hang.currentTime = Math.min(t, hang.duration - 0.5); }, { once: true }); }
    ment(); rajz(); helyzet(); indit();
  };
  var arany = function(ev){ var r = eqDoboz.getBoundingClientRect(); return Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)); };
  eqDoboz.setAttribute('aria-valuemin', '0'); eqDoboz.setAttribute('aria-valuemax', String(mp0));
  eqDoboz.addEventListener('pointerdown', function(ev){
    if (ev.button > 0) return;
    huz = { id: ev.pointerId, t: arany(ev) * hossz() };
    try { eqDoboz.setPointerCapture(ev.pointerId); } catch (e) {}
    sav.classList.add('teker'); helyzet();
    if (hossz()) idoEl.textContent = ido(hossz() - huz.t);
  });
  eqDoboz.addEventListener('pointermove', function(ev){
    if (!huz || ev.pointerId !== huz.id) return;
    huz.t = arany(ev) * hossz(); helyzet();
    if (hossz()) idoEl.textContent = ido(hossz() - huz.t);
  });
  var elenged = function(ev, ervenyes){
    if (!huz || ev.pointerId !== huz.id) return;
    var t = huz.t; huz = null; sav.classList.remove('teker');
    if (ervenyes) { var ment0 = !hang || hang.paused; ugrik(t); if (ment0 && hang.paused) hang.play().catch(function(){}); }
    else { rajz(); helyzet(); }
  };
  eqDoboz.addEventListener('pointerup', function(ev){ elenged(ev, true); });
  eqDoboz.addEventListener('pointercancel', function(ev){ elenged(ev, false); });
  eqDoboz.addEventListener('keydown', function(ev){
    var d = ev.key === 'ArrowRight' ? 10 : ev.key === 'ArrowLeft' ? -10 : 0; if (!d) return;
    ev.preventDefault(); ugrik((hang ? hang.currentTime : mentve) + d);
  });
  setInterval(function(){ if (hang && !hang.paused && !huz) helyzet(); }, 250);
  helyzet();
});
