/* =========================================================================
   VÉRTIGO BAR — Pantalla del Bar (TV)
   Orquesta: voto_recibido (shockwave), rebase_ocurrido (turbo drift),
             empate_detectado (duelo), tema_cumplido (celebración de 30s,
             se repite toda la noche — no hay "un solo ganador")
   ========================================================================= */
(() => {
  const socket = io();
  const $ = s => document.querySelector(s);
  const barsEl = $('#bars');

  const ROW_GAP = () => parseFloat(getComputedStyle(barsEl).gap) || 16;

  let state = null;
  let rowById = new Map();     // itemId -> elemento .bar-row
  let orderIds = [];           // orden actual de ids (de arriba a abajo)

  const catCfg = () => window.vertigoCategory(state ? state.category : 'otro');
  function itemSub(it) {
    const c = catCfg();
    return c.subtitleField ? (it[c.subtitleField] || '') : (it.genre || it.artist || '');
  }

  // ---- URL de voto para el QR ----
  const voteUrl = location.origin + '/vota';
  let qr = null;
  function initQR() {
    $('#qr').innerHTML = '';
    qr = new QRCode($('#qr'), {
      text: voteUrl,
      width: 220, height: 220,
      colorDark: '#0b0c10', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
    $('#voteUrl').textContent = voteUrl.replace(/^https?:\/\//, '');
  }

  // ---------------------------------------------------------------------
  //  CONSTRUCCIÓN / SINCRONIZACIÓN DE BARRAS
  // ---------------------------------------------------------------------
  function buildRows() {
    barsEl.innerHTML = '';
    rowById.clear();
    if (!state || !state.items || !state.items.length) {
      const empty = document.createElement('div');
      empty.className = 'bars-empty';
      empty.textContent = state
        ? `Esperando ${catCfg().itemLabelPlural.toLowerCase()} para votar…`
        : 'Esperando el próximo show…';
      barsEl.appendChild(empty);
      orderIds = [];
      updateStats();
      return;
    }
    const items = state.items; // vienen ordenados por ranking desde el server
    items.forEach(it => {
      const row = document.createElement('div');
      row.className = 'bar-row gpu';
      row.dataset.id = it.id;
      const sub = itemSub(it);
      row.innerHTML = `
        <div class="shock"></div>
        <div class="bar-shell">
          <div class="bar-fill"></div>
          <div class="bar-rank">${it.rank}</div>
          <div class="bar-info">
            <div class="bar-title">${escapeHtml(it.title)}</div>
            <div class="bar-artist">${escapeHtml(sub)}</div>
          </div>
          <div class="bar-stats">
            <div class="bar-votes">${it.votes}</div>
            <div class="bar-pct">${it.pct}%</div>
          </div>
          <div class="bar-badge"></div>
        </div>`;
      barsEl.appendChild(row);
      rowById.set(it.id, row);
    });
    orderIds = items.map(it => it.id);
    layout(false);
    updateStats();
  }

  // Posiciona cada fila por transform según su índice de ranking (rebase fluido)
  function layout(animate = true) {
    const rowH = barsEl.querySelector('.bar-row')?.offsetHeight || 0;
    const step = rowH + ROW_GAP();
    const totalH = orderIds.length * step - ROW_GAP();
    const offset = Math.max(0, (barsEl.clientHeight - totalH) / 2);
    orderIds.forEach((id, i) => {
      const row = rowById.get(id);
      if (!row) return;
      const ty = offset + i * step;
      row.style.setProperty('--ty', ty + 'px');
      row.style.setProperty('--tx', '0px');
      row.style.transform = `translate3d(0, ${ty}px, 0)`;
    });
    // altura del contenedor para que ocupe el flujo
    barsEl.style.minHeight = (orderIds.length * step - ROW_GAP()) + 'px';
  }

  function updateStats() {
    if (!state) { $('#totalVotes').textContent = 0; return; }
    $('#totalVotes').textContent = state.total;
    const items = state.items || [];
    const leaderId = items[0]?.id;
    const second = items[1];
    const duelClose = second && items[0] && (items[0].votes - second.votes) <= 3 && items[0].votes > 0;

    items.forEach(it => {
      const row = rowById.get(it.id);
      if (!row) return;
      row.querySelector('.bar-votes').textContent = it.votes;
      row.querySelector('.bar-pct').textContent = it.pct + '%';
      row.querySelector('.bar-rank').textContent = it.rank;
      const fill = row.querySelector('.bar-fill');
      const maxVotes = items[0]?.votes || 1;
      const ratio = maxVotes > 0 ? it.votes / maxVotes : 0;
      fill.style.transform = `scaleX(${Math.max(0.02, ratio)})`;
      row.classList.toggle('leader', it.id === leaderId && it.votes > 0);
      row.classList.toggle('duel', duelClose && it.id === second.id);
      row.classList.toggle('rank2', it.rank === 2);
      row.classList.toggle('rank3', it.rank === 3);
    });
    updateFire();
  }

  // Llama real (naranja=1°, azul=2°, verde=3°) que envuelve el % cargado de la barra
  function updateFire() {
    rowById.forEach((row, id) => {
      const item = (state?.items || []).find(it => it.id === id);
      const fill = row.querySelector('.bar-fill');
      const shouldHaveFire = !!item && item.rank <= 3 && item.votes > 0;
      const has = fill.querySelector('.fire');
      if (shouldHaveFire && !has) {
        const fire = document.createElement('div');
        fire.className = 'fire';
        fire.innerHTML = '<span class="flame f1"></span><span class="flame f2"></span><span class="flame f3"></span>';
        fill.appendChild(fire);
      } else if (!shouldHaveFire && has) {
        has.remove();
      }
    });
  }

  // Reordena orderIds según nuevo ranking del state y anima
  function reorder() {
    const newOrder = (state.items || []).map(it => it.id);
    const changed = newOrder.some((id, i) => orderIds[i] !== id);
    orderIds = newOrder;
    layout(true);
    return changed;
  }

  // ---------------------------------------------------------------------
  //  EFECTOS
  // ---------------------------------------------------------------------
  function shockwave(itemId) {
    const row = rowById.get(itemId);
    if (!row) return;
    row.classList.remove('hit'); void row.offsetWidth; row.classList.add('hit');
    setTimeout(() => row.classList.remove('hit'), 520);
    // floater +1
    const f = document.createElement('div');
    f.className = 'floater'; f.textContent = '+1';
    row.appendChild(f);
    setTimeout(() => f.remove(), 320);
  }

  function turboDrift(subioId) {
    const row = rowById.get(subioId);
    if (!row) return;
    row.classList.remove('rebase'); void row.offsetWidth; row.classList.add('rebase');
    setTimeout(() => row.classList.remove('rebase'), 950);
  }

  function flash() {
    const f = $('#flash');
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }

  function ticker(html) { const t = $('#ticker'); t.style.opacity = 0; setTimeout(() => { t.innerHTML = html; t.style.opacity = 1; }, 200); }

  function updateSideInfo() {
    $('#sideSub').textContent = catCfg().promptLabel;
    $('#liveArtist').textContent = state && state.artistName ? `${catCfg().icon} ${state.artistName}` : '—';
    if (!state) ticker('Escanea el código y vota en cuanto arranque el show');
  }

  // ---- Próximo show: cuenta regresiva en vivo ----
  let nextShowInfo = null;
  let nsTickInterval = null;
  function renderNextShow() {
    clearInterval(nsTickInterval);
    const el = $('#nextShow');
    if (!nextShowInfo) { el.textContent = '—'; return; }
    if (!nextShowInfo.targetAt) { el.textContent = nextShowInfo.label; return; }
    const tick = () => {
      const remaining = nextShowInfo.targetAt - Date.now();
      if (remaining <= 0) {
        el.innerHTML = `${escapeHtml(nextShowInfo.label)} <span class="ns-now">¡ya casi!</span>`;
        return;
      }
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      const hh = h > 0 ? h + ':' : '';
      el.innerHTML = `${escapeHtml(nextShowInfo.label)} <span class="ns-timer">${hh}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</span>`;
    };
    tick();
    nsTickInterval = setInterval(tick, 1000);
  }
  socket.on('proximo_show_actualizado', info => { nextShowInfo = info; renderNextShow(); });

  // ---------------------------------------------------------------------
  //  CELEBRACIÓN (recurrente: se repite cada vez que algo se cumple)
  // ---------------------------------------------------------------------
  let celebrationTimeout = null;
  function showCelebration({ title, sub, votes }) {
    clearTimeout(celebrationTimeout);
    flash();
    $('#koKicker').textContent = `¡${catCfg().doneToast.toUpperCase()}!`;
    $('#koTitle').textContent = title;
    $('#koArtist').textContent = sub;
    $('#koArtist').style.display = sub ? '' : 'none';
    $('#koVotes').textContent = votes;
    $('#ko').classList.add('on');
    confetti();
    celebrationTimeout = setTimeout(hideCelebration, 30000);
  }
  function hideCelebration() {
    clearTimeout(celebrationTimeout);
    celebrationTimeout = null;
    $('#ko').classList.remove('on');
  }

  // ---------------------------------------------------------------------
  //  CONFETTI (canvas ligero)
  // ---------------------------------------------------------------------
  let confettiRAF = null;
  function confetti() {
    const c = $('#confetti'); const ctx = c.getContext('2d');
    c.width = c.offsetWidth; c.height = c.offsetHeight;
    const colors = ['#ff6a00', '#ffc247', '#ffffff', '#ff8f2e'];
    const N = 140;
    const P = Array.from({ length: N }, (_, i) => ({
      x: Math.random() * c.width, y: -20 - Math.random() * c.height,
      r: 4 + Math.random() * 6, c: colors[i % colors.length],
      vy: 2 + Math.random() * 4, vx: -1.5 + Math.random() * 3,
      rot: Math.random() * 6.28, vr: -0.2 + Math.random() * 0.4
    }));
    let t = 0;
    cancelAnimationFrame(confettiRAF);
    (function frame() {
      t++; ctx.clearRect(0, 0, c.width, c.height);
      P.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
        ctx.restore();
        if (p.y > c.height + 20) { p.y = -20; p.x = Math.random() * c.width; }
      });
      if (t < 60 * 8) confettiRAF = requestAnimationFrame(frame);
    })();
  }

  // ---------------------------------------------------------------------
  //  SOCKETS
  // ---------------------------------------------------------------------
  // ¿cambió el conjunto de ítems activos? (alta/baja/cumplido) -> reconstruir
  function itemSetChanged(s) {
    const now = new Set((s.items || []).map(x => x.id));
    if (!state || now.size !== rowById.size) return true;
    for (const id of now) if (!rowById.has(id)) return true;
    return false;
  }

  socket.on('estado_actual', s => {
    const isNew = !state || (s && state.id !== s.id) || (!s && state);
    const setChanged = s ? itemSetChanged(s) : true;
    state = s;
    updateSideInfo();
    if (isNew) { hideCelebration(); buildRows(); }
    else if (setChanged) { buildRows(); }
    else { updateStats(); reorder(); }
  });

  // El artista/staff marcó el ítem como cumplido: sus votos vuelven a 0 (cae
  // al fondo del mismo ranking, sigue votable) y se dispara la celebración
  // de 30s. Esto se repite toda la noche, cada vez que algo se cumple.
  socket.on('tema_cumplido', ({ title, artist, genre, votes, state: s }) => {
    state = s;
    updateStats();
    reorder();
    const sub = itemSub({ artist, genre });
    showCelebration({ title, sub, votes });
    ticker(`🎉 <b>${escapeHtml(title)}</b> ¡${catCfg().doneToast}! · sigue la votación`);
  });

  socket.on('ronda_iniciada', s => {
    state = s; hideCelebration(); buildRows(); updateSideInfo();
    ticker('Nueva ronda · <b>¡a votar!</b>');
  });

  socket.on('voto_recibido', ({ itemId, name, itemTitle, state: s }) => {
    state = s;
    shockwave(itemId);
    updateStats();
    reorder();
    if (name) ticker(`<b>${escapeHtml(name)}</b> votó por <b>${escapeHtml(itemTitle)}</b>`);
  });

  socket.on('rebase_ocurrido', ({ state: s, subioId }) => {
    state = s;
    updateStats();
    reorder();
    turboDrift(subioId);
    const item = (s.items || []).find(x => x.id === subioId);
    if (item) ticker(`🔥 <b>${escapeHtml(item.title)}</b> toma la delantera · SORPASSO`);
  });

  socket.on('empate_detectado', ({ state: s }) => {
    state = s; updateStats();
    ticker('⚔️ <b>¡EMPATE!</b> Duelo en el vértigo');
  });

  // Se detiene la votación por ahora (ej. fin de la noche, cambio de artista).
  // No hay overlay de ganador: el ranking se queda congelado tal como estaba.
  socket.on('ronda_concluida', ({ state: s }) => {
    state = s; updateStats(); reorder();
    ticker('Votación cerrada por ahora');
  });

  window.addEventListener('resize', () => layout(false));

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- Brasas flotantes de fondo ----
  function spawnEmbers() {
    const box = $('#embers');
    if (!box) return;
    const N = 26;
    for (let i = 0; i < N; i++) {
      const e = document.createElement('span');
      e.className = 'ember';
      const dur = 6 + Math.random() * 7;
      e.style.left = Math.random() * 100 + 'vw';
      e.style.width = e.style.height = (2 + Math.random() * 4) + 'px';
      e.style.setProperty('--drift', (-40 + Math.random() * 80) + 'px');
      e.style.animationDuration = dur + 's';
      e.style.animationDelay = (-Math.random() * dur) + 's';
      e.style.opacity = 0.4 + Math.random() * 0.6;
      if (Math.random() > 0.6) e.style.background = 'var(--gold)';
      box.appendChild(e);
    }
  }

  spawnEmbers();
  initQR();
})();
