(function () {
  'use strict';
  var C = window.TRIBU || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- Mandala tribal (mismo estilo que /tv2) ---------- */
  function mandala(el) {
    var s = '<g fill="none" stroke="#c98a3a" stroke-width="2">';
    [520, 470, 380, 300, 200].forEach(function (r) { s += '<circle r="' + r + '"/>'; });
    s += '<circle r="425" stroke-dasharray="7 16" stroke-width="3"/></g><g fill="#c98a3a">';
    for (var i = 0; i < 36; i++) {
      s += '<g transform="rotate(' + (i * 10) + ')"><path d="M-18 -380 L0 -470 L18 -380Z"/><path d="M-9 -300 L0 -345 L9 -300Z" opacity=".7"/></g>';
    }
    s += '</g><g fill="none" stroke="#e08a2b" stroke-width="3">';
    var pts = [];
    for (var j = 0; j < 32; j++) {
      var r2 = j % 2 ? 150 : 230, a = j * Math.PI / 16;
      pts.push((Math.cos(a) * r2).toFixed(1) + ',' + (Math.sin(a) * r2).toFixed(1));
    }
    s += '<polygon points="' + pts.join(' ') + '"/></g>';
    el.innerHTML = s;
  }
  $$('#mandala, [data-mandala]').forEach(mandala);

  /* ---------- Brasas (canvas ligero) ---------- */
  function embers(canvas) {
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var g = canvas.getContext('2d'), W, H, P = [], raf, visible = true;
    function size() {
      var r = canvas.getBoundingClientRect();
      W = canvas.width = Math.max(1, r.width); H = canvas.height = Math.max(1, r.height);
    }
    function spawn(initial) {
      return { x: Math.random() * W, y: initial ? Math.random() * H : H + 10,
        r: 1 + Math.random() * 2.6, vy: .25 + Math.random() * .9, vx: (Math.random() - .5) * .35,
        a: .25 + Math.random() * .6, ph: Math.random() * 6.28 };
    }
    size();
    var n = Math.round(Math.min(90, Math.max(30, W / 18)));
    for (var i = 0; i < n; i++) P.push(spawn(true));
    function frame(t) {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      g.clearRect(0, 0, W, H);
      for (var k = 0; k < P.length; k++) {
        var p = P[k];
        p.y -= p.vy; p.x += p.vx + Math.sin(t / 900 + p.ph) * .25;
        if (p.y < -12) P[k] = spawn(false);
        var life = Math.min(1, p.y / H + .15);
        var gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
        gr.addColorStop(0, 'rgba(255,190,80,' + (p.a * life) + ')');
        gr.addColorStop(.35, 'rgba(255,100,20,' + (p.a * life * .5) + ')');
        gr.addColorStop(1, 'rgba(255,60,0,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r * 5, 0, 6.283); g.fill();
      }
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(canvas);
    }
    addEventListener('resize', size);
    raf = requestAnimationFrame(frame);
  }
  if ($('#embers')) embers($('#embers'));
  embers($('.hero-embers'));

  /* ---------- Contenido desde config ---------- */
  var wa = (C.whatsapp || '').replace(/\D/g, '');
  function waLink(msg) {
    return 'https://wa.me/' + wa + '?text=' + encodeURIComponent(msg || C.whatsappMessage || '');
  }
  var ICONS = { instagram: '#i-ig', facebook: '#i-fb', tiktok: '#i-tt' };
  var LABEL = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' };

  $$('[data-social]').forEach(function (box) {
    var html = '';
    Object.keys(ICONS).forEach(function (k) {
      var url = C.social && C.social[k];
      if (url) html += '<a href="' + url + '" target="_blank" rel="noopener" aria-label="' + LABEL[k] + '"><svg><use href="' + ICONS[k] + '"/></svg></a>';
    });
    if (wa) html += '<a href="' + waLink() + '" target="_blank" rel="noopener" aria-label="WhatsApp"><svg><use href="#i-wa"/></svg></a>';
    if (html) box.innerHTML = html; else box.hidden = true;
  });

  $('#heroTag').textContent = C.tagline || '';
  if (C.about) {
    $('#aboutTitle').textContent = C.about.title || '';
    $('#aboutText').innerHTML = (C.about.paragraphs || []).map(function (p) { return '<p></p>'; }).join('');
    $$('#aboutText p').forEach(function (el, i) { el.textContent = C.about.paragraphs[i]; });
    $('#aboutCards').innerHTML = (C.about.highlights || []).map(function () {
      return '<div class="card"><span class="dm"></span><div><h3></h3><p></p></div></div>';
    }).join('');
    $$('#aboutCards .card').forEach(function (el, i) {
      var h = C.about.highlights[i]; $('h3', el).textContent = h.t; $('p', el).textContent = h.d;
    });
  }

  // Menu
  $$('[data-menu-link]').forEach(function (a) {
    if (C.menuUrl) { a.href = C.menuUrl; a.target = '_blank'; a.rel = 'noopener'; }
  });
  // Arcade
  $('#arcadeBtn').href = C.arcadeUrl || '#';
  $('#heroArcade').href = C.arcadeUrl || '#';
  var eb = $('#arcEmbers');
  if (eb && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (var q = 0; q < 22; q++) {
      var em = document.createElement('span'), du = 3 + Math.random() * 3.5;
      em.className = 'ember'; em.style.left = Math.random() * 100 + '%';
      em.style.setProperty('--dx', (-40 + Math.random() * 80) + 'px');
      em.style.width = em.style.height = (2 + Math.random() * 4) + 'px';
      em.style.animationDuration = du + 's'; em.style.animationDelay = (-Math.random() * du) + 's';
      eb.appendChild(em);
    }
  }
  $('#resApp').href = C.reservaUrl || C.menuUrl || '#';

  // Galeria
  var gal = $('#gallery');
  if (C.gallery && C.gallery.length) {
    C.gallery.forEach(function (src) {
      var f = document.createElement('figure'), im = new Image();
      im.src = src; im.alt = 'TRIBU Gastro Pub'; im.loading = 'lazy'; f.appendChild(im); gal.appendChild(f);
    });
  } else {
    $$('[data-needs="gallery"]').forEach(function (a) { a.hidden = true; });
    $('#galeria').hidden = true;
  }

  // Cenas navideñas
  var X = C.christmas;
  if (X && X.options && X.options.length) {
    $('#xmasTitle').textContent = X.title || '';
    $('#xmasIntro').textContent = X.intro || '';
    var g = $('#xmasGrid');
    X.options.forEach(function (o) {
      var d = document.createElement('article'); d.className = 'card xmas';
      function add(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; e.textContent = txt; d.appendChild(e); return e; }
      add('h3', '', o.name); add('div', 'tiempos', '3 tiempos');
      add('div', 'lbl', 'Entrada'); add('p', '', o.entrada);
      add('div', 'lbl', 'Plato fuerte');
      o.fuerte.forEach(function (f, i) { if (i) add('div', 'amp', '&'); add('p', '', f); });
      add('div', 'lbl', 'Acompañado de'); add('p', 'sides', o.sides);
      add('div', 'lbl', 'Postre'); add('p', '', o.postre);
      add('div', 'price', o.price);
      g.appendChild(d);
    });
  } else {
    $('#navidad').hidden = true;
    $$('[data-needs="christmas"]').forEach(function (a) { a.hidden = true; });
  }

  // Horarios
  if (C.hours && C.hours.length) {
    $('#hoursBlock').hidden = false;
    $('#hoursList').innerHTML = C.hours.map(function () { return '<li><span></span><span></span></li>'; }).join('');
    $$('#hoursList li').forEach(function (li, i) {
      var sp = li.querySelectorAll('span'); sp[0].textContent = C.hours[i][0]; sp[1].textContent = C.hours[i][1];
    });
  }

  // Contacto
  var rows = [];
  if (C.address) rows.push(['#i-pin', C.address, null]);
  if (C.phone) rows.push(['#i-ph', C.phone, 'tel:' + C.phone.replace(/[^\d+]/g, '')]);
  if (wa) rows.push(['#i-wa', 'WhatsApp', waLink()]);
  if (C.email) rows.push(['#i-ml', C.email, 'mailto:' + C.email]);
  var list = $('#contactList');
  rows.forEach(function (r) {
    var li = document.createElement('li');
    li.innerHTML = '<svg class="ic"><use href="' + r[0] + '"/></svg><span></span>';
    var span = $('span', li);
    if (r[2]) { var a = document.createElement('a'); a.href = r[2]; a.textContent = r[1]; if (r[2].indexOf('http') === 0) { a.target = '_blank'; a.rel = 'noopener'; } span.appendChild(a); }
    else span.textContent = r[1];
    list.appendChild(li);
  });
  if (!rows.length) list.hidden = true;
  if (C.mapQuery) {
    var box = $('#mapBox'); box.hidden = false;
    var gm = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(C.mapQuery);
    box.innerHTML = '<div class="map-card"><div class="map-pin"><svg class="ic" viewBox="0 0 24 24"><use href="#i-pin"/></svg></div>' +
      '<b>TRIBU Gastro Pub</b><span></span><a class="btn btn-fire btn-sm" target="_blank" rel="noopener">Cómo llegar</a></div>';
    $('span', box).textContent = C.address || C.mapQuery;
    $('a', box).href = gm;
  }
  var waBtn = $('#waBtn'), waFloat = $('#waFloat');
  if (wa) { waBtn.href = waLink(); waFloat.href = waLink(); waFloat.hidden = false; } else waBtn.hidden = true;

  // Contacto: "dejanos tu informacion"
  var form = $('#resForm'), msg = $('#resMsg');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { msg.textContent = 'Completa tu nombre y tu teléfono.'; return; }
    var data = { nombre: form.nombre.value.trim(), telefono: form.telefono.value.trim(), mensaje: form.notas.value.trim() };
    if (C.contactEndpoint) {
      msg.textContent = 'Enviando...';
      fetch(C.contactEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function () { msg.textContent = '¡Gracias! Te contactaremos pronto.'; form.reset(); })
        .catch(function () { msg.textContent = 'No pudimos enviarlo. Escríbenos por WhatsApp.'; });
    } else if (wa) {
      // Mientras no exista contactEndpoint, el contacto llega por WhatsApp (no es una reserva)
      var t = 'Hola TRIBU, quiero que me contacten.\nNombre: ' + data.nombre + '\nTeléfono: ' + data.telefono + (data.mensaje ? '\nMensaje: ' + data.mensaje : '');
      msg.textContent = 'Abriendo WhatsApp...';
      window.open(waLink(t), '_blank', 'noopener');
    } else msg.textContent = 'Este formulario estará disponible muy pronto.';
  });

  /* RESERVA POR WHATSAPP (desactivada; reactivar descomentando este bloque y restaurando el formulario
     comentado en index.html, seccion #reservas)
  // Reserva -> WhatsApp
  var form = $('#resForm'), msg = $('#resMsg');
  var today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  form.fecha.min = today.toISOString().slice(0, 10);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { msg.textContent = 'Completa nombre, fecha, hora y personas.'; return; }
    if (!wa) { msg.textContent = 'Las reservas por WhatsApp estarán disponibles muy pronto.'; return; }
    var d = form.fecha.value.split('-').reverse().join('/');
    var t = 'Hola TRIBU, quiero reservar.\nNombre: ' + form.nombre.value.trim() +
      '\nFecha: ' + d + '\nHora: ' + form.hora.value + '\nPersonas: ' + form.personas.value +
      (form.notas.value.trim() ? '\nComentarios: ' + form.notas.value.trim() : '');
    msg.textContent = 'Abriendo WhatsApp...';
    window.open(waLink(t), '_blank', 'noopener');
  });

  */

  // Menu movil
  var nt = $('#navToggle'), nl = $('#navLinks');
  nt.addEventListener('click', function () {
    var open = nl.classList.toggle('open'); nt.setAttribute('aria-expanded', open);
  });
  $$('#navLinks a').forEach(function (a) {
    a.addEventListener('click', function () { nl.classList.remove('open'); nt.setAttribute('aria-expanded', 'false'); });
  });

  /* ---------- Compuerta de apertura ---------- */
  var openAt = new Date(C.openAt).getTime();
  var qs = new URLSearchParams(location.search);
  var skew = 0;       // hora real del servidor menos hora del reloj del visitante
  var sim = null;     // ?countdown=SEGUNDOS para probar el cambio automatico
  if (qs.get('countdown')) sim = Date.now() + parseInt(qs.get('countdown'), 10) * 1000;
  if (location.hash === '#prueba') sim = Date.now() + 12000;   // demo: cuenta de 12 s
  var force = qs.get('preview') || (window.__FORCE ? window.__FORCE : null);   // ?preview=open | ?preview=countdown

  var cdView = $('#landing'), wView = $('#view-welcome');
  var LD = function () { return window.TribuLanding; };
  var els = { d: $('#cd-d'), h: $('#cd-h'), m: $('#cd-m'), s: $('#cd-s') };
  var shown = null, timer;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function now() { return Date.now() + skew; }
  function target() { return sim || openAt; }

  function showWelcome(animate) {
    if (shown === 'welcome') return;
    var was = shown;
    shown = 'welcome';
    clearInterval(timer);
    wView.hidden = false;
    document.documentElement.classList.add('is-open');
    if (animate && LD()) {
      // El home queda debajo; las cortinas se abren y lo descubren
      wView.scrollTop = 0; window.scrollTo(0, 0);
      LD().open(function () { window.scrollTo(0, 0); });
    } else {
      if (LD()) LD().hide(); else cdView.hidden = true;
      window.scrollTo(0, 0);
    }
  }
  function showCountdown() {
    shown = 'countdown'; cdView.hidden = false; wView.hidden = true;
    document.documentElement.classList.remove('is-open');
    if (LD()) LD().show();
  }
  function tick() {
    var left = target() - now();
    if (force === 'countdown') left = Math.max(left, 1000);
    if (left <= 0) { showWelcome(shown === 'countdown'); return; }
    var s = Math.floor(left / 1000);
    els.d.textContent = pad(Math.floor(s / 86400));
    els.h.textContent = pad(Math.floor(s % 86400 / 3600));
    els.m.textContent = pad(Math.floor(s % 3600 / 60));
    els.s.textContent = pad(s % 60);
  }

  function start() {
    var closed = force === 'open' || (force !== 'countdown' && target() - now() <= 0);
    if (closed) { showWelcome(false); return; }
    showCountdown(); tick();
    clearInterval(timer); timer = setInterval(tick, 250);
  }
  start();

  // Corrige el reloj del visitante con la hora del servidor (cabecera Date)
  if (!force && !sim && window.fetch) {
    var t0 = Date.now();
    fetch(location.pathname, { method: 'HEAD', cache: 'no-store' }).then(function (r) {
      var h = r.headers.get('Date'); if (!h) return;
      var srv = new Date(h).getTime(), rtt = Date.now() - t0;
      if (!isNaN(srv)) { skew = srv + rtt / 2 - Date.now(); var open = target() - now() <= 0; if (open && shown === 'countdown') tick(); else if (!open && shown === 'welcome') { shown = null; wView.hidden = true; start(); } else if (shown === 'countdown') tick(); }
    }).catch(function () {});
  }
})();
