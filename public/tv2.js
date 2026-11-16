/* =========================================================================
   TRIBU GASTRO PUB, Pantalla del Bar v2 (tema tribal / fuego)
   Mismos eventos que /tv: estado_actual, voto_recibido, rebase_ocurrido,
   empate_detectado, tema_cumplido, ronda_iniciada, ronda_concluida,
   proximo_show_actualizado.
   El contenido es 1920x1080, se escala y centra; el fondo llena toda la pantalla.
   ========================================================================= */
(() => {
  const socket = io();
  const $ = s => document.querySelector(s);
  const stage = $('#stage');

  const content = $('#content');
  const cv = $('#fx'), ctx = cv.getContext('2d');
  // El escenario ocupa SIEMPRE toda la pantalla: el contenido (1920x1080) se
  // escala para caber y se centra; los lados o el borde sobrante se rellenan
  // con el fondo, las franjas y el fuego (sin márgenes negros).
  let SX = 1920, SY = 1080, OX = 0, OY = 0;
  function fit() {
    const W = window.innerWidth, H = window.innerHeight;
    const s = Math.min(W / 1920, H / 1080);
    SX = W / s; SY = H / s; OX = (SX - 1920) / 2; OY = (SY - 1080) / 2;
    stage.style.width = SX + 'px'; stage.style.height = SY + 'px';
    stage.style.transform = 'scale(' + s + ')';
    content.style.left = OX + 'px'; content.style.top = OY + 'px';
    cv.width = Math.ceil(SX); cv.height = Math.ceil(SY);
    cv.style.width = SX + 'px'; cv.style.height = SY + 'px';
  }
  addEventListener('resize', fit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
  fit();

  const esc = str => String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------- DECORADO
  function mandala(el, fine) {
    let s = '<g fill="none" stroke="#c98a3a" stroke-width="2">';
    [520, 470, 380, 300, 200].forEach(r => { s += '<circle r="' + r + '"/>'; });
    s += '<circle r="425" stroke-dasharray="7 16" stroke-width="3"/></g><g fill="#c98a3a">';
    const n = fine ? 24 : 36;
    for (let i = 0; i < n; i++) {
      s += '<g transform="rotate(' + (i * 360 / n) + ')"><path d="M-18 -380 L0 -470 L18 -380Z"/><path d="M-9 -300 L0 -345 L9 -300Z" opacity=".7"/></g>';
    }
    s += '</g><g fill="none" stroke="#e08a2b" stroke-width="3">';
    const pts = [];
    for (let i = 0; i < 32; i++) {
      const r = i % 2 ? 150 : 230, a = i * Math.PI / 16;
      pts.push((Math.cos(a) * r).toFixed(1) + ',' + (Math.sin(a) * r).toFixed(1));
    }
    el.innerHTML = s + '<polygon points="' + pts.join(' ') + '"/></g>';
  }
  mandala($('#sun1'), false);
  mandala($('#sun2'), true);

  (function () {
    let s = '<circle r="148" fill="none" stroke="#e08a2b" stroke-width="3" stroke-dasharray="4 10"/><g fill="#ffc04d">';
    for (let i = 0; i < 28; i++) s += '<g transform="rotate(' + (i * 360 / 28) + ')"><path d="M-9 -150 L0 -172 L9 -150Z"/></g>';
    $('#ring').innerHTML = s + '</g>';
  })();

  // ---- QR hacia /vota ----
  const voteUrl = location.origin + '/vota';
  try {
    new QRCode($('#qr'), {
      text: voteUrl, width: 188, height: 188,
      colorDark: '#1a0f0a', colorLight: '#f4e2c4',
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch (e) {
    // Si la librería del QR no carga, la pantalla sigue funcionando: se muestra la URL.
    $('#qr').innerHTML = '<div style="padding:18px;font:700 22px Rajdhani,sans-serif;color:#1a0f0a;word-break:break-all;background:#f4e2c4;height:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;text-align:center">' + esc(voteUrl.replace(/^https?:\/\//, '')) + '</div>';
  }

  // ------------------------------------------------------------------ LAYOUT
  const SLOTH = [120, 90, 90, 78, 78, 78], GAP = 24, TOP = 264, TX = 260, TW = 880, MAXROWS = 6;
  const SLOTY = (() => { const a = []; let y = TOP; for (let i = 0; i < MAXROWS; i++) { a.push(y); y += SLOTH[i] + GAP; } return a; })();

  let state = null;
  const rowsEl = $('#rows');
  const objs = new Map();        // itemId -> objeto de fila
  let order = [];                // objetos visibles, de 1º a último

  const catCfg = () => window.tribuCategory(state ? state.category : 'otro');
  function itemSub(it) {
    const c = catCfg();
    return c.subtitleField ? (it[c.subtitleField] || '') : (it.genre || it.artist || '');
  }

  function makeObj(it, idx) {
    const el = document.createElement('div');
    el.className = 'row r' + idx;
    el.innerHTML =
      '<div class="medal"><svg viewBox="-60 -60 120 120" class="rays"></svg>' +
      '<svg viewBox="0 0 100 100" class="dm"><path class="md" d="M50 4 L96 50 L50 96 L4 50Z"/><path class="mi" d="M50 17 L83 50 L50 83 L17 50Z"/></svg>' +
      '<b class="rk">' + (idx + 1) + '</b></div>' +
      '<div class="track"><div class="fill"></div><div class="lbl"><span class="tt"></span><span class="ss"></span></div></div>' +
      '<div class="cnt"><b>0</b><small>voces</small></div>';
    let r = '';
    for (let k = 0; k < 16; k++) r += '<g transform="rotate(' + (k * 22.5) + ')"><path d="M-7 -52 L0 -70 L7 -52Z"/></g>';
    el.querySelector('.rays').innerHTML = r;
    rowsEl.appendChild(el);
    const slot = Math.min(idx, MAXROWS - 1);
    return {
      id: it.id, el, v: 0, rank: idx, y: SLOTY[slot] + 30, h: SLOTH[slot], w: 60, cls: -1,
      medal: el.querySelector('.medal'), rays: el.querySelector('.rays'), dm: el.querySelector('.dm'),
      rk: el.querySelector('.rk'), track: el.querySelector('.track'), fill: el.querySelector('.fill'),
      tt: el.querySelector('.tt'), ss: el.querySelector('.ss'), cnt: el.querySelector('.cnt b'), cl: el.querySelector('.cnt small'), clTxt: 'voces',
      title: null, sub: null
    };
  }

  function sync() {
    const items = (state && state.items) || [];
    const ids = new Set(items.map(i => i.id));
    objs.forEach((o, id) => { if (!ids.has(id)) { o.el.remove(); objs.delete(id); } });
    items.forEach((it, idx) => {
      let o = objs.get(it.id);
      if (!o) { o = makeObj(it, idx); objs.set(it.id, o); }
      o.v = it.votes; o.rank = idx;
      const sub = itemSub(it);
      if (o.title !== it.title) { o.tt.textContent = it.title; o.title = it.title; }
      if (o.sub !== sub) { o.ss.textContent = sub; o.ss.style.display = sub ? '' : 'none'; o.sub = sub; }
      o.el.style.display = idx >= MAXROWS ? 'none' : '';
    });
    order = items.slice(0, MAXROWS).map(i => objs.get(i.id));
    $('#totn').textContent = state ? state.total : 0;
    const empty = !items.length;
    $('#empty').style.display = empty ? 'flex' : 'none';
    $('#emptySub').textContent = state
      ? 'Esperando ' + catCfg().itemLabelPlural.toLowerCase() + ' para votar…'
      : 'Esperando el próximo show…';
    $('#liveArtist').textContent = state && state.artistName ? catCfg().icon + ' ' + state.artistName : '—';
    $('#sideSub').textContent = state ? catCfg().promptLabel : 'Escanea y vota lo que sigue';
  }

  // ----------------------------------------------------------------- TICKER
  const tick = $('#tick'); let tickT = 0;
  function say(html) {
    tick.innerHTML = html; tick.classList.add('on');
    clearTimeout(tickT); tickT = setTimeout(() => tick.classList.remove('on'), 3600);
  }

  // ------------------------------------------------------------ PARTÍCULAS
  function sprite(a, b, c) {
    const k = document.createElement('canvas'); k.width = k.height = 64;
    const g = k.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, a); r.addColorStop(.28, b); r.addColorStop(.62, c); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); return k;
  }
  const SP = {
    gold: sprite('rgba(255,250,225,1)', 'rgba(255,190,70,.9)', 'rgba(255,90,20,.32)'),
    red: sprite('rgba(255,228,205,1)', 'rgba(255,90,50,.85)', 'rgba(170,20,10,.28)'),
    teal: sprite('rgba(232,255,250,1)', 'rgba(60,220,190,.85)', 'rgba(10,110,140,.28)'),
    ember: sprite('rgba(255,238,195,1)', 'rgba(255,150,40,.95)', 'rgba(200,60,10,.25)')
  };
  const P = [], RINGS = [];
  let q = 1;   // calidad adaptable: baja sola si la TV no llega a 30 fps
  function spawn(x, y, vx, vy, s, life, sp, spark) {
    if (P.length > 3200 * q) return;
    P.push({ x, y, vx, vy, s, l: 0, m: life, sp: SP[sp], k: Math.random() * 6.28, spark });
  }
  function burst(x, y, n, sp, power) {
    n = Math.max(3, Math.round(n * q));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, p = Math.random() * power;
      spawn(x, y, Math.cos(a) * p, Math.sin(a) * p - 1.5, 10 + Math.random() * 10, 40 + Math.random() * 40, sp || 'ember', true);
    }
  }

  // ---------------------------------------------------------------- EFECTOS
  const NAMES_FALLBACK = '';
  const chipN = new Map();
  function voteFx(itemId, name) {
    const o = objs.get(itemId);
    if (!o || o.rank >= MAXROWS) return;
    const x = TX + o.w, y = o.y + o.h / 2;
    RINGS.push({ x, y, r: 10, a: 1 }, { x, y, r: 4, a: .9 });
    burst(x, y, 14, o.rank === 2 ? 'teal' : o.rank === 1 ? 'red' : 'gold', 5);
    const c = document.createElement('div'); c.className = 'chip';
    c.textContent = '+1' + (name ? ' ' + name : NAMES_FALLBACK);
    const stack = chipN.get(itemId) || 0; chipN.set(itemId, stack + 1);
    c.style.left = Math.max(TX + 120, Math.min(x, TX + TW - 120)) + 'px';
    c.style.top = (y - 76 - (stack % 3) * 54) + 'px';
    content.appendChild(c);
    setTimeout(() => { c.remove(); chipN.set(itemId, Math.max(0, (chipN.get(itemId) || 1) - 1)); }, 10000);
    o.cnt.classList.add('bump'); setTimeout(() => o.cnt.classList.remove('bump'), 260);
  }

  // ------------------------------------------------------------ SUPERACIÓN
  let pumT = 0;
  function overtakeFx(up, down, newRank) {
    if (celeOn || !up) return;
    const pum = $('#pum');
    const lead = newRank === 0;
    pum.classList.toggle('lead', lead);
    $('#pumT').textContent = lead ? '¡NUEVO LÍDER!' : '¡PUM!';
    $('#pumT').style.fontSize = lead ? '170px' : '';
    $('#pumA').innerHTML = '<b>' + esc(up.title).toUpperCase() + '</b> SUPERA A ' + (down ? esc(down.title).toUpperCase() : 'LA ANTERIOR');
    $('#pumB').textContent = lead ? 'LA TRIBU CAMBIA DE LÍDER' : 'SUBE AL PUESTO ' + (newRank + 1);
    pum.classList.remove('on'); void pum.offsetWidth; pum.classList.add('on');
    clearTimeout(pumT); pumT = setTimeout(() => pum.classList.remove('on'), 5100);
    content.classList.remove('shake'); void content.offsetWidth; content.classList.add('shake');
    setTimeout(() => content.classList.remove('shake'), 650);
    // ondas y fuego en las dos filas que se cruzan
    [up, down].forEach((o, k) => {
      if (!o) return;
      const y = SLOTY[Math.min(newRank + k, MAXROWS - 1)] + SLOTH[Math.min(newRank + k, MAXROWS - 1)] / 2;
      for (let i = 0; i < 4; i++) RINGS.push({ x: TX + 300 + i * 260, y, r: 6 + i * 8, a: 1 });
      burst(TX + 300, y, 60, k ? 'red' : 'gold', 11);
      burst(TX + TW - 200, y, 60, k ? 'red' : 'teal', 11);
    });
    for (let i = 0; i < 4; i++) setTimeout(() => burst(300 + Math.random() * 1320, 300 + Math.random() * 500, 50, ['gold', 'red', 'teal'][i % 3], 10), 250 + i * 330);
  }

  // ------------------------------------------------------------ CELEBRACIÓN
  let celeOn = false, celeTimeout = null, celeFx = null;
  function showCelebration({ title, sub, votes }) {
    clearTimeout(celeTimeout); clearInterval(celeFx);
    celeOn = true;
    $('#cName').textContent = String(title).toUpperCase();
    $('#cSub').textContent = sub || '';
    $('#cSub').style.display = sub ? '' : 'none';
    $('#cVotes').textContent = votes + (votes === 1 ? ' VOZ' : ' VOCES');
    $('#celeBg').classList.add('on');
    const tx = $('#celeTx'); tx.classList.remove('on'); void tx.offsetWidth; tx.classList.add('on');
    let f = 0;
    celeFx = setInterval(() => {
      f++;
      if (f <= 150) {
        const n = Math.max(6, Math.round(26 * q));
        for (let i = 0; i < n; i++) spawn(Math.random() * SX - OX, 1060 + OY, (Math.random() - .5) * 2, -(5 + Math.random() * 7), 30 + Math.random() * 30, 70 + Math.random() * 50, ['gold', 'red', 'teal', 'gold'][Math.floor(Math.random() * 4)]);
        if (f % 12 === 0) burst(300 + Math.random() * 1320, 420 + Math.random() * 300, 40, ['gold', 'red', 'teal'][Math.floor(Math.random() * 3)], 9);
      } else if (f % 5 === 0) {
        const n = Math.max(2, Math.round(8 * q));
        for (let i = 0; i < n; i++) spawn(Math.random() * SX - OX, 1060 + OY, (Math.random() - .5) * 1.5, -(3 + Math.random() * 4), 24 + Math.random() * 20, 60 + Math.random() * 40, ['gold', 'red'][Math.floor(Math.random() * 2)]);
        if (f % 60 === 0) burst(300 + Math.random() * 1320, 420 + Math.random() * 300, 28, ['gold', 'red', 'teal'][Math.floor(Math.random() * 3)], 8);
      }
    }, 40);
    celeTimeout = setTimeout(hideCelebration, 30000);
  }
  function hideCelebration() {
    clearTimeout(celeTimeout); clearInterval(celeFx);
    celeOn = false;
    $('#celeBg').classList.remove('on'); $('#celeTx').classList.remove('on');
  }

  // --------------------------------------------------------------- BUCLE
  let lastT = performance.now(), accT = 0, accN = 0;
  function frame(now) {
    const dt = now - lastT; lastT = now;
    if (dt < 250) { accT += dt; accN++; }
    if (accN >= 90) {
      const avg = accT / accN;
      if (avg > 36 && q > .3) q = Math.max(.3, q - .25);
      else if (avg < 20 && q < 1) q = Math.min(1, q + .1);
      accT = accN = 0;
    }

    const maxV = Math.max(1, ...order.map(o => o.v));
    objs.forEach(o => {
      if (o.rank >= MAXROWS) return;
      const r = o.rank, ty = SLOTY[r], th = SLOTH[r];
      const tw = o.v > 0 ? Math.max(70, o.v / maxV * (TW - 12) * .99) : 60;
      o.y += (ty - o.y) * .13; o.h += (th - o.h) * .13; o.w += (tw - o.w) * .1;
      if (o.cls !== r) { o.el.className = 'row r' + r; o.rk.textContent = r + 1; o.cls = r; }
      o.el.style.transform = 'translateY(' + o.y.toFixed(1) + 'px)';
      o.el.style.height = o.h.toFixed(1) + 'px';
      const ms = Math.min(o.h * .96, 118);
      o.dm.style.width = o.dm.style.height = ms + 'px';
      o.rays.style.width = o.rays.style.height = (ms * 1.35) + 'px';
      o.rk.style.fontSize = (ms * .46) + 'px';
      o.track.style.height = (o.h - 14) + 'px';
      o.fill.style.width = o.w.toFixed(1) + 'px';
      o.tt.style.fontSize = (o.h * .4) + 'px'; o.ss.style.fontSize = (o.h * .2) + 'px';
      o.cnt.style.fontSize = (o.h * .62) + 'px'; o.cnt.textContent = o.v;
      const lt = o.v === 1 ? 'voz' : 'voces';
      if (o.clTxt !== lt) { o.cl.textContent = lt; o.clTxt = lt; }
    });

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(1, 0, 0, 1, OX, OY);
    ctx.globalCompositeOperation = 'lighter';
    if (!celeOn) {
      order.forEach(o => {
        const r = o.rank, x0 = TX + 14, top = o.y + 9;
        if (o.v <= 0) return;
        if (r > 2) { if (Math.random() < .2 * q) spawn(x0 + Math.random() * o.w, top, (Math.random() - .5) * .6, -.8 - Math.random(), 6 + Math.random() * 5, 40 + Math.random() * 30, 'ember', true); return; }
        const cfg = [{ sp: 'gold', n: o.w / 46, h: 2.3, s: 30 }, { sp: 'red', n: o.w / 64, h: 1.7, s: 24 }, { sp: 'teal', n: o.w / 84, h: 1.35, s: 20 }][r];
        const n = Math.max(1, Math.round(cfg.n * q));
        for (let i = 0; i < n; i++) {
          const x = x0 + Math.random() * Math.max(10, o.w - 20);
          spawn(x, top + Math.random() * 6, (Math.random() - .5) * .9, -(cfg.h * (.5 + Math.random() * .7)), cfg.s * (.6 + Math.random() * .6), 38 + Math.random() * 30, cfg.sp, false);
        }
        if (Math.random() < .35 * q) spawn(x0 + Math.random() * o.w, top, (Math.random() - .5) * 1.2, -(2 + Math.random() * 3), 5 + Math.random() * 4, 70 + Math.random() * 60, 'ember', true);
      });
      const g = Math.round(3 * q);
      for (let i = 0; i < g; i++) spawn(Math.random() * SX - OX, 1052 + OY, (Math.random() - .5) * .8, -(.8 + Math.random() * 1.5), 26 + Math.random() * 26, 40 + Math.random() * 26, Math.random() < .75 ? 'red' : 'gold', false);
    }
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.l++;
      if (p.l >= p.m) { P.splice(i, 1); continue; }
      const t = p.l / p.m;
      p.x += p.vx + Math.sin(p.l * .12 + p.k) * (p.spark ? .7 : .55); p.y += p.vy; p.vy *= p.spark ? .985 : .992;
      if (p.spark) p.vy += .012;
      const s = p.s * (p.spark ? (1 - t * .6) : Math.pow(1 - t, .75));
      ctx.globalAlpha = (p.spark ? (.4 + .6 * Math.random()) : 1) * (p.spark ? 1 - t : Math.min(1, (1 - t) * 1.4)) * (p.spark ? 1 : .55);
      ctx.drawImage(p.sp, p.x - s, p.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    for (let i = RINGS.length - 1; i >= 0; i--) {
      const g = RINGS[i]; g.r += 4.5; g.a -= .045;
      if (g.a <= 0) { RINGS.splice(i, 1); continue; }
      ctx.strokeStyle = 'rgba(255,230,180,' + g.a.toFixed(3) + ')'; ctx.lineWidth = 5 * g.a + 1;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, 6.283); ctx.stroke();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ----------------------------------------------------------- PRÓXIMO SHOW
  let nextShowInfo = null, nsInterval = null;
  function renderNextShow() {
    clearInterval(nsInterval);
    const lab = $('#nextLabel'), cd = $('#cd');
    if (!nextShowInfo) { lab.textContent = '—'; cd.textContent = ''; return; }
    lab.textContent = nextShowInfo.label || '—';
    if (!nextShowInfo.targetAt) { cd.textContent = ''; return; }
    const t = () => {
      const rem = nextShowInfo.targetAt - Date.now();
      if (rem <= 0) { cd.textContent = '¡YA CASI!'; return; }
      const h = Math.floor(rem / 3600000), m = Math.floor((rem % 3600000) / 60000), s = Math.floor((rem % 60000) / 1000);
      cd.textContent = (h > 0 ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    };
    t(); nsInterval = setInterval(t, 1000);
  }

  // ---------------------------------------------------------------- SOCKETS
  socket.on('estado_actual', s => {
    const isNew = !state || (s && state.id !== s.id) || (!s && state);
    state = s;
    if (isNew) hideCelebration();
    sync();
    if (!s) say('LA TRIBU SE REÚNE<b>·</b>VOTA CUANDO ARRANQUE EL SHOW');
  });

  socket.on('proximo_show_actualizado', info => { nextShowInfo = info; renderNextShow(); });

  socket.on('voto_recibido', ({ itemId, name, itemTitle, state: s }) => {
    state = s; sync();
    voteFx(itemId, name);
    if (name) say('<b>' + esc(name).toUpperCase() + '</b> VOTÓ POR<b>' + esc(itemTitle).toUpperCase() + '</b>');
  });

  socket.on('rebase_ocurrido', ({ state: s, subioId, antes, despues }) => {
    state = s; sync();
    const o = objs.get(subioId);
    if (!o) return;
    const a = (antes || []).indexOf(subioId), d = (despues || []).indexOf(subioId);
    if (d >= 0 && d < a) overtakeFx(o, objs.get(despues[d + 1]), d);
    if (o.rank === 0) say('LA TRIBU CAMBIA DE LÍDER<b>·</b>' + esc(o.title).toUpperCase());
    else say('<b>▲</b>' + esc(o.title).toUpperCase() + ' SUBE AL PUESTO ' + (o.rank + 1));
  });

  socket.on('empate_detectado', ({ state: s }) => {
    state = s; sync();
    say('DESAFÍO<b>·</b>LA TRIBU ESTÁ DIVIDIDA');
  });

  socket.on('tema_cumplido', ({ title, artist, genre, votes, state: s }) => {
    state = s; sync();
    showCelebration({ title, sub: itemSub({ artist, genre }), votes });
    say('<b>' + esc(title).toUpperCase() + '</b> ' + esc(catCfg().doneToast).toUpperCase() + '<b>·</b>SIGUE LA VOTACIÓN');
  });

  socket.on('ronda_iniciada', s => {
    state = s; hideCelebration(); sync();
    say('NUEVA RONDA<b>·</b>A VOTAR');
  });

  socket.on('ronda_concluida', ({ state: s }) => {
    state = s; sync();
    say('VOTACIÓN CERRADA POR AHORA');
  });
})();
