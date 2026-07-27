/* =========================================================================
   VÉRTIGO BAR — Pantalla del Bar (TV)
   Orquesta: voto_recibido (shockwave), rebase_ocurrido (turbo drift),
             empate_detectado (duelo), ronda_concluida (K.O.)
   ========================================================================= */
(() => {
  const socket = io();
  const $ = s => document.querySelector(s);
  const barsEl = $('#bars');

  const ROW_GAP = () => parseFloat(getComputedStyle(barsEl).gap) || 16;

  let state = null;
  let rowById = new Map();     // songId -> elemento .bar-row
  let orderIds = [];           // orden actual de ids (de arriba a abajo)

  // ---- URL de voto para el QR ----
  const voteUrl = location.origin + '/';
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
    const songs = state.songs; // vienen ordenadas por ranking desde el server
    songs.forEach(s => {
      const row = document.createElement('div');
      row.className = 'bar-row gpu';
      row.dataset.id = s.id;
      row.innerHTML = `
        <div class="shock"></div>
        <div class="bar-shell">
          <div class="bar-fill"></div>
          <div class="bar-rank">${s.rank}</div>
          <div class="bar-info">
            <div class="bar-title">${escapeHtml(s.title)}</div>
            <div class="bar-artist">${escapeHtml(s.artist || '')}</div>
          </div>
          <div class="bar-stats">
            <div class="bar-votes">${s.votes}</div>
            <div class="bar-pct">${s.pct}%</div>
          </div>
          <div class="bar-badge"></div>
        </div>`;
      barsEl.appendChild(row);
      rowById.set(s.id, row);
    });
    orderIds = songs.map(s => s.id);
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
    if (!state) return;
    $('#totalVotes').textContent = state.total;
    const leaderId = state.songs[0]?.id;
    const second = state.songs[1];
    const duelClose = second && state.songs[0] && (state.songs[0].votes - second.votes) <= 3 && state.songs[0].votes > 0;

    state.songs.forEach(s => {
      const row = rowById.get(s.id);
      if (!row) return;
      row.querySelector('.bar-votes').textContent = s.votes;
      row.querySelector('.bar-pct').textContent = s.pct + '%';
      row.querySelector('.bar-rank').textContent = s.rank;
      const fill = row.querySelector('.bar-fill');
      const maxVotes = state.songs[0]?.votes || 1;
      const ratio = maxVotes > 0 ? s.votes / maxVotes : 0;
      fill.style.transform = `scaleX(${Math.max(0.02, ratio)})`;
      row.classList.toggle('leader', s.id === leaderId && s.votes > 0);
      row.classList.toggle('duel', duelClose && s.id === second.id);
      row.classList.toggle('rank2', s.rank === 2);
      row.classList.toggle('rank3', s.rank === 3);
    });
    updateFire();
  }

  // Llama real (naranja=1°, azul=2°, verde=3°) que envuelve el % cargado de la barra
  function updateFire() {
    rowById.forEach((row, id) => {
      const song = state.songs.find(s => s.id === id);
      const fill = row.querySelector('.bar-fill');
      const shouldHaveFire = !!song && song.rank <= 3 && song.votes > 0;
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
    const newOrder = state.songs.map(s => s.id);
    const changed = newOrder.some((id, i) => orderIds[i] !== id);
    orderIds = newOrder;
    layout(true);
    return changed;
  }

  // ---------------------------------------------------------------------
  //  EFECTOS
  // ---------------------------------------------------------------------
  function shockwave(songId) {
    const row = rowById.get(songId);
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

  // ---------------------------------------------------------------------
  //  K.O. / GANADOR
  // ---------------------------------------------------------------------
  function showKO() {
    const w = state.songs.find(s => s.id === state.winnerId) || state.songs[0];
    if (!w) return;
    barsEl.classList.add('settled');
    orderIds.forEach(id => rowById.get(id)?.classList.toggle('winner', id === w.id));
    flash();
    $('#koTitle').textContent = w.title;
    $('#koArtist').textContent = w.artist || '';
    $('#koVotes').textContent = w.votes;
    setTimeout(() => { $('#ko').classList.add('on'); confetti(); }, 350);
  }
  function hideKO() { $('#ko').classList.remove('on'); barsEl.classList.remove('settled'); orderIds.forEach(id => rowById.get(id)?.classList.remove('winner')); }

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
  // ¿cambió el conjunto de temas activos? (alta/baja/cumplido) -> reconstruir
  function songSetChanged(s) {
    const now = new Set(s.songs.map(x => x.id));
    if (!state || now.size !== rowById.size) return true;
    for (const id of now) if (!rowById.has(id)) return true;
    return false;
  }

  socket.on('estado_actual', s => {
    if (!s) return;
    const isNew = !state || state.id !== s.id;
    const setChanged = songSetChanged(s);
    state = s;
    $('#nextShow').textContent = s.nextShow || '';
    if (isNew) { hideKO(); buildRows(); }
    else if (setChanged) { buildRows(); }
    else { updateStats(); reorder(); }
    if (!s.open && s.winnerId) showKO();
  });

  // El artista marcó el tema como cumplido: sello + salida, luego se reconstruye
  socket.on('tema_cumplido', ({ songId, title, state: s }) => {
    const row = rowById.get(songId);
    if (row) {
      const stamp = document.createElement('div');
      stamp.className = 'done-stamp';
      stamp.textContent = '✓ CUMPLIDO';
      row.appendChild(stamp);
      row.classList.add('vanish');
    }
    ticker(`✓ <b>${escapeHtml(title)}</b> cumplido · ¡vota el siguiente!`);
    flash();
    setTimeout(() => { state = s; buildRows(); }, 650);
  });

  socket.on('tema_reactivado', ({ title, state: s }) => {
    state = s; buildRows();
    ticker(`↺ <b>${escapeHtml(title)}</b> vuelve a la votación`);
  });

  socket.on('ronda_iniciada', s => {
    state = s; hideKO(); buildRows();
    $('#nextShow').textContent = s.nextShow || '';
    ticker('Nueva ronda · <b>¡a votar!</b>');
  });

  socket.on('voto_recibido', ({ songId, name, songTitle, state: s }) => {
    state = s;
    shockwave(songId);
    updateStats();
    const changed = reorder();
    if (name) ticker(`<b>${escapeHtml(name)}</b> votó por <b>${escapeHtml(songTitle)}</b>`);
  });

  socket.on('rebase_ocurrido', ({ state: s, subioId }) => {
    state = s;
    updateStats();
    reorder();
    turboDrift(subioId);
    const song = s.songs.find(x => x.id === subioId);
    if (song) ticker(`🔥 <b>${escapeHtml(song.title)}</b> toma la delantera · SORPASSO`);
  });

  socket.on('empate_detectado', ({ state: s }) => {
    state = s; updateStats();
    ticker('⚔️ <b>¡EMPATE!</b> Duelo en el vértigo');
  });

  socket.on('ronda_concluida', ({ state: s }) => {
    state = s; updateStats(); reorder();
    showKO();
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
