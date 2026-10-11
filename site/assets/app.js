// qn-chat: „Kérdezz a hírektől!” (api/kerdez). A beszélgetés a böngészőfül munkamenetében megmarad
// (sessionStorage): oldalról oldalra viszi, a fül bezárásával törlődik.
(function(){
  var dob = document.querySelector('[data-chat]'); if (!dob) return;
  var indit = dob.querySelector('[data-chat-indit]'), panel = dob.querySelector('.chat-panel'), lista = dob.querySelector('[data-chat-uzenetek]');
  var urlap = dob.querySelector('[data-chat-urlap]'), mezo = urlap.querySelector('input'), kuld = urlap.querySelector('button');
  var TAR = 'qn-chat', all = {nyitva: false, uzenetek: []};
  try { all = JSON.parse(sessionStorage.getItem(TAR)) || all; } catch(e){}
  function ment(){ try { sessionStorage.setItem(TAR, JSON.stringify(all)); } catch(e){} }
  function ev(nev, adat){ try { if (window.gtag) gtag('event', nev, adat || {}); } catch(e){} }
  function biztos(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function nyit(n, csendes){ panel.hidden = !n; indit.setAttribute('aria-expanded', n ? 'true' : 'false'); dob.classList.toggle('nyitva', n);
    all.nyitva = n; ment(); if (n && !csendes) { setTimeout(function(){ mezo.focus(); }, 50); ev('chat_megnyitas'); } }
  indit.addEventListener('click', function(){ nyit(panel.hidden); });
  dob.querySelector('[data-chat-zar]').addEventListener('click', function(){ nyit(false); indit.focus(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !panel.hidden) { nyit(false); indit.focus(); } });
  function datum(d){ var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? (+m[2]) + '. ' + (+m[3]) + '.' : ''; }
  function hirlista(l, szam){ return l.map(function(f){ return '<li><a href="'+biztos(f.url)+'">'+(szam ? '<span>'+f.n+'</span>' : '')+'<em>'+biztos(f.cim)+(f.datum ? ' <small>'+datum(f.datum)+'</small>' : '')+'</em></a></li>'; }).join(''); }
  function rajzol(u){
    var d = document.createElement('div');
    if (u.en) { d.className = 'chat-b en'; d.innerHTML = biztos(u.en); }
    else if (u.hiba) { d.className = 'chat-b bot hiba'; d.innerHTML = biztos(u.hiba); }
    else if (u.info) { d.className = 'chat-b bot info'; d.innerHTML = biztos(u.info).replace('Napok menüben', '<a href="/napok">Napok</a> menüben'); }
    else {
      var j = u.bot, szoveg = biztos(j.valasz).replace(/^\s*[*-]\s+/gm, '• ').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n{2,}/g, '\n').replace(/\n/g, '<br>').replace(/\[(\d)\]/g, '<sup>$1</sup>');
      d.className = 'chat-valasz';
      var fm = {}; (j.forrasok || []).forEach(function(f){ fm[f.n] = f; });
      var jelek = function(l){ return '<span class="chat-jelek">' + (l || []).map(function(n){ var f = fm[n] || {};
        return '<button type="button" class="chat-jel" data-n="'+n+'" aria-expanded="false" aria-label="'+biztos('Forrás '+n+(f.cim ? ': '+f.cim : ''))+'">'+n
          + (f.cim ? '<span class="chat-tipp" role="tooltip"><strong>'+biztos(f.cim)+'</strong>'+(f.datum ? '<small>'+datum(f.datum)+'</small>' : '')+(f.lead ? '<em>'+biztos(f.lead)+'</em>' : '')+'</span>' : '')
          + '</button>'; }).join('') + '</span>'; };
      d._fm = fm;
      var torzs = (j.pontok && j.pontok.length) || j.bevezeto
        ? (j.bevezeto ? '<p class="chat-bev">'+biztos(j.bevezeto)+'</p>' : '') + ((j.pontok || []).length ? '<ul class="chat-pontok">' + j.pontok.map(function(x){ return '<li><div class="chat-psor"><span class="chat-psz">'+biztos(x.szoveg)+'</span>'+jelek(x.forras)+'</div><div class="chat-lenyilo" hidden></div></li>'; }).join('') + '</ul>' : '')
        : '<p>'+szoveg+'</p>';
      d.innerHTML = '<div class="chat-b bot">'+torzs+'</div>'
        + ((j.korabbi || []).length ? '<div class="chat-korabbi"><h3>Válogatás korábbi híreinkből</h3><ul>'+hirlista(j.korabbi, false)+'</ul></div>' : '')
        + masok(u.kerdes);
    }
    lista.appendChild(d); return d;
  }
  function gorget(){ lista.scrollTop = lista.scrollHeight; }
  // a leggyakoribb kérdések (api/kerdez?mi=nepszeru): kattintható javaslatok, hogy ne kelljen gépelni
  var nepszeru = all.nepszeru || [];
  function masok(volt){ var l = nepszeru.filter(function(k){ return k.toLowerCase() !== String(volt || '').toLowerCase(); }).slice(0, 3);
    return l.length ? '<div class="chat-masok"><span>Mások ezt is kérdezték:</span>' + l.map(function(k){ return '<button type="button" class="chat-javas">'+biztos(k)+'</button>'; }).join('') + '</div>' : ''; }
  function javaslatok(){ var jv = lista.querySelector('.chat-javaslat'); if (!jv || !nepszeru.length) return;
    jv.innerHTML = '<span class="chat-javaslat-cim">Gyakori kérdések</span>' + nepszeru.map(function(k){ return '<button type="button">'+biztos(k)+'</button>'; }).join(''); }
  fetch('/api/kerdez?mi=nepszeru').then(function(r){ return r.json(); }).then(function(j){
    if (j && j.kerdesek && j.kerdesek.length) { nepszeru = j.kerdesek; all.nepszeru = nepszeru; ment(); javaslatok(); }
  }).catch(function(){});
  function uj(u){ all.uzenetek.push(u); all.uzenetek = all.uzenetek.slice(-30); ment(); rajzol(u); gorget(); }
  if (all.uzenetek.length) { var jav0 = lista.querySelector('.chat-javaslat'); if (jav0) jav0.remove(); all.uzenetek.forEach(rajzol); }
  if (all.nyitva) { nyit(true, true); setTimeout(gorget, 0); }
  function kerdez(q){
    q = (q || '').trim(); if (q.length < 3) return;
    var jav = lista.querySelector('.chat-javaslat'); if (jav) jav.remove();
    uj({en: q}); mezo.value = ''; mezo.disabled = kuld.disabled = true;
    var var_ = document.createElement('div'); var_.className = 'chat-b bot var'; var_.innerHTML = '<span class="chat-pont"></span><span class="chat-pont"></span><span class="chat-pont"></span>'; lista.appendChild(var_); gorget();
    ev('chat_kerdes');
    fetch('/api/kerdez', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({kerdes:q})})
      .then(function(r){ return r.json(); })
      .then(function(j){ var_.remove(); uj(j.hiba ? {hiba: j.hiba} : j.info ? {info: j.info} : {bot: j, kerdes: q}); })
      .catch(function(){ var_.remove(); uj({hiba: 'Most nem sikerült választ adni. Próbáld újra kicsit később!'}); })
      .then(function(){ mezo.disabled = kuld.disabled = false; mezo.focus(); });
  }
  urlap.addEventListener('submit', function(e){ e.preventDefault(); kerdez(mezo.value); });
  // forrásjel: ráhúzásra felugró ablak (CSS), kattintásra a pont alatt lenyíló hírkártya
  lista.addEventListener('click', function(e){
    var jel = e.target.closest('.chat-jel');
    if (jel) {
      var li = jel.closest('li'), le = li.querySelector('.chat-lenyilo'), n = jel.getAttribute('data-n');
      var fm = (jel.closest('.chat-valasz') || {})._fm || {}, f = fm[n];
      var nyitott = jel.getAttribute('aria-expanded') === 'true';
      li.querySelectorAll('.chat-jel').forEach(function(x){ x.setAttribute('aria-expanded', 'false'); });
      if (nyitott || !f) { le.hidden = true; le.innerHTML = ''; return; }
      jel.setAttribute('aria-expanded', 'true');
      le.innerHTML = '<a class="chat-hirkartya" href="'+biztos(f.url)+'"><span class="chat-hk-fej"><span class="chat-jel kicsi">'+n+'</span>'+(f.datum ? '<small>'+datum(f.datum)+'</small>' : '')+'</span><strong>'+biztos(f.cim)+'</strong>'+(f.lead ? '<em>'+biztos(f.lead)+'</em>' : '')+'<span class="chat-hk-link">Elolvasom →</span></a>';
      le.hidden = false; ev('chat_forrasjel', {n: n}); return;
    }
    var b = e.target.closest('.chat-javaslat button, .chat-javas'); if (b) { ev('chat_javaslat'); kerdez(b.textContent); }
    var a = e.target.closest('.chat-korabbi a'); if (a) ev('chat_forras_kattintas', {korabbi: !a.closest('.chat-forrasblokk')}); });
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
  if (fr) {
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
      fetch('/frissit', {method:'POST'}).then(function(){ figyel(); }).catch(function(){ gomb.disabled = false; all.textContent = 'Nem érem el a helyi szervert.'; });
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
      var a = document.createElement('a'); a.className = 'uj-kartya'; a.href = '/hir/' + h.slug;
      a.innerHTML = (h.kep ? '<img src="'+h.kep+'" alt="">' : '') + '<div><span class="uj-cimke">Új hír · '+h.forras+(h.ido?' · '+h.ido:'')+'</span><strong>'+h.cim+'</strong></div><button type="button" class="uj-zar" aria-label="Bezárás">×</button>';
      a.querySelector('.uj-zar').addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); a.remove(); });
      doboz.prepend(a);
      setTimeout(function(){ a.classList.add('bent'); }, 30);
      setTimeout(function(){ a.classList.remove('bent'); setTimeout(function(){ a.remove(); }, 800); }, 30000);
      if (window.Notification && Notification.permission === 'granted') {
        try { var n = new Notification('quicknews.hu: ' + h.forras, {body: h.cim, icon: '/assets/ikon.svg', tag: h.id}); n.onclick = function(){ window.focus(); location.href = '/hir/' + h.slug; }; } catch(e){}
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
  // ---- Kereső: a mutató (kereso.json) az első gépelésnél tölt be, a találatok a mező alatt nyílnak.
  (function(){
    var doboz=document.querySelector('[data-kereso]'), mezo=document.querySelector('[data-kereso-mezo]'), panel=document.querySelector('[data-kereso-panel]'), lista=document.querySelector('[data-kereso-talalatok]'), torlo=document.querySelector('[data-kereso-zar]');
    if(!doboz||!mezo||!panel||!lista) return;
    var mutato=null, betoltes=null, kiemeltIndex=-1;
    var egyszeru=function(t){ return (t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); };
    var tolts=function(){ if(betoltes) return betoltes; betoltes=fetch('/kereso.json',{cache:'no-cache'}).then(function(r){return r.json();}).then(function(d){ mutato=d.map(function(x){ x._c=egyszeru(x.c); x._b=egyszeru(x.b); x._sz=egyszeru(x.sz); x._k=egyszeru(x.k+' '+x.g); return x; }); return mutato; }).catch(function(){ mutato=[]; return mutato; }); return betoltes; };
    var biztos=function(t){ return t.replace(/[&<>]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); };
    var kiemelCim=function(szoveg,kif){ var e=egyszeru(szoveg); var i=e.indexOf(kif); if(i<0) return biztos(szoveg); return biztos(szoveg.slice(0,i))+'<mark>'+biztos(szoveg.slice(i,i+kif.length))+'</mark>'+biztos(szoveg.slice(i+kif.length)); };
    var kiemel=function(szoveg,kif){ var e=egyszeru(szoveg); var i=e.indexOf(kif); if(i<0) return null; var start=Math.max(0,i-45); return (start>0?'…':'')+biztos(szoveg.slice(start,i))+'<mark>'+biztos(szoveg.slice(i,i+kif.length))+'</mark>'+biztos(szoveg.slice(i+kif.length,i+kif.length+90))+'…'; };
    var nyitva=function(igen){ panel.hidden=!igen; mezo.setAttribute('aria-expanded',igen?'true':'false'); };
    var rajzol=function(talalatok,kif){ kiemeltIndex=-1; if(!kif){ nyitva(false); lista.innerHTML=''; return; } if(!talalatok.length){ lista.innerHTML='<div class="kereso-ures">Erre nincs találat. Próbálj rövidebb szót.</div>'; nyitva(true); return; }
      lista.innerHTML=talalatok.slice(0,12).map(function(x){ var r=kiemel(x.sz,kif)||kiemel(x.b,kif)||''; return '<a class="kereso-tetel" href="'+x.u+'" role="option"><span class="kt-meta">'+biztos(x.k)+(x.d?' · '+x.d:'')+'</span><span class="kt-cim">'+(kiemel(x.c,kif)||biztos(x.c)).replace(/^…|…$/g,'')+'</span>'+(r?'<span class="kt-reszlet">'+r+'</span>':'')+'</a>'; }).join(''); nyitva(true); };
    var keres=function(nyers){ var kif=egyszeru(nyers.trim()); if(torlo) torlo.hidden=!nyers; if(!mutato||kif.length<2){ rajzol([],''); return; } var pont=[]; for(var i=0;i<mutato.length;i++){ var x=mutato[i], p=0; if(x._c.indexOf(kif)>=0) p+=100; if(x._c.indexOf(kif)===0) p+=40; if(x._k.indexOf(kif)>=0) p+=30; if(x._b.indexOf(kif)>=0) p+=20; if(x._sz.indexOf(kif)>=0) p+=10; if(p) pont.push([p,x]); } pont.sort(function(a,b){return b[0]-a[0];}); rajzol(pont.map(function(x){return x[1];}),kif); };
    var urit=function(){ mezo.value=''; if(torlo) torlo.hidden=true; lista.innerHTML=''; nyitva(false); };
    mezo.addEventListener('input',function(){ tolts().then(function(){ keres(mezo.value); }); });
    mezo.addEventListener('focus',function(){ doboz.classList.add('nyitott'); if(mezo.value.trim().length>=2) tolts().then(function(){ keres(mezo.value); }); });
    mezo.addEventListener('blur',function(){ setTimeout(function(){ if(!mezo.value&&panel.hidden) doboz.classList.remove('nyitott'); },200); });
    if(torlo) torlo.addEventListener('click',function(){ urit(); mezo.focus(); });
    var sor=doboz.querySelector('.kereso-mezosor'); sor.addEventListener('click',function(e){ if(torlo&&torlo.contains(e.target)) return; doboz.classList.add('nyitott'); setTimeout(function(){ mezo.focus(); },30); });
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
    var biztos=function(t){ return (t||'').replace(/[&<>]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); };
    var jelol=function(){ var db=ujak().length; jel.textContent=db>9?'9+':String(db); jel.hidden=db===0; gomb.setAttribute('aria-label',db?'Új hírek, '+db+' új':'Új hírek'); };
    var kirajzol=function(){ var ujId=ujak().map(function(h){return h.id;}); var sorok=hirek.slice(0,20).map(function(h){ return '<li'+(ujId.indexOf(h.id)>=0?' class="uj"':'')+'><a href="/hir/'+h.slug+'">'+(h.kep?'<img src="'+h.kep+'" alt="" loading="lazy">':'')+'<span><span class="harang-forras">'+biztos(h.forras)+(h.ido?' · '+h.ido:'')+'</span><strong>'+biztos(h.cim)+'</strong></span></a></li>'; }).join('');
      buborek.innerHTML='<div class="harang-fej">Friss hírek</div>'+(sorok?'<ul>'+sorok+'</ul>':'<p class="harang-ures">Most nincs új hír.</p>')+(window.Notification?'<button type="button" class="harang-ertesit">'+(Notification.permission==='granted'?'Értesítés bekapcsolva':'Értesíts az új hírekről')+'</button>':'');
      var he=buborek.querySelector('.harang-ertesit'); if(he) he.addEventListener('click',function(ev){ ev.stopPropagation(); Notification.requestPermission().then(function(p){ he.textContent = p==='granted'?'Értesítés bekapcsolva':'Értesítés letiltva a böngészőben'; }); }); };
    var zar=function(){ buborek.hidden=true; gomb.setAttribute('aria-expanded','false'); document.removeEventListener('keydown',bill); document.removeEventListener('click',kivul); };
    function bill(ev){ if(ev.key==='Escape'){ zar(); gomb.focus(); } }
    function kivul(ev){ if(!doboz.contains(ev.target)) zar(); }
    var nyit=function(){ kirajzol(); buborek.hidden=false; gomb.setAttribute('aria-expanded','true'); latott=hirek.map(function(h){return h.id;}); try{ localStorage.setItem(TAR,JSON.stringify(latott)); }catch(e){} jelol(); setTimeout(function(){ document.addEventListener('keydown',bill); document.addEventListener('click',kivul); },0); };
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
  function ment(meres, hirdetes){
    valasz = {meres: !!meres, hirdetes: !!hirdetes, ido: new Date().toISOString(), verzio: VER};
    try { localStorage.setItem(TAR, JSON.stringify(valasz)); } catch(e){}
    try { if (window.gtag) gtag('consent', 'update', {analytics_storage: meres ? 'granted' : 'denied'}); } catch(e){}
    if (meres && window.qnGaBetolt) window.qnGaBetolt();
    if (hirdetes && window.qnMetaBetolt) window.qnMetaBetolt();
    document.documentElement.classList.add('suti-van');
    document.documentElement.style.removeProperty('--fel-also');  // a chat és a fel-gomb azonnal visszaáll a helyére
    rejt();
  }
  sav.addEventListener('click', function(e){ var g = e.target.closest('[data-suti]'); if (!g) return; var v = g.getAttribute('data-suti'); ment(v !== 'nem', v === 'igen'); });
  document.addEventListener('click', function(e){ if (e.target.closest('[data-suti-ujra]')) { document.documentElement.classList.remove('suti-van'); mutat(); } });
  if (valasz) sav.hidden = true; else mutat();
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
    var v = ugro.querySelector('input').value;
    if (napok.indexOf(v) > -1) { location.href = '/nap/' + v; return; }
    ugro.querySelector('.nap-ugro-uzenet').textContent = 'Ezen a napon nem jelent meg hír.';
  });
})();
