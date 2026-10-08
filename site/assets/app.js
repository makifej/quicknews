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
      setTimeout(function(){ a.classList.remove('bent'); setTimeout(function(){ a.remove(); }, 800); }, 45000);
      if (window.Notification && Notification.permission === 'granted') {
        try { var n = new Notification('quicknews.hu: ' + h.forras, {body: h.cim, icon: '/assets/ikon.svg', tag: h.id}); n.onclick = function(){ window.focus(); location.href = '/hir/' + h.slug; }; } catch(e){}
      }
    }
    function nez(){
      fetch('/feed.json?t=' + Date.now(), {cache:'no-store'}).then(function(r){ return r.json(); }).then(function(d){
        var l = latott(); var ujak = d.hirek.filter(function(h){ return l.indexOf(h.id) < 0; });
        if (!elso) ujak.slice(0, 5).reverse().forEach(kartya);
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