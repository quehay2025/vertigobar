/* =========================================================================
   VÉRTIGO BAR — Cliente (mobile)
   Modelo de voto: cada dispositivo puede votar una vez cada 5 minutos
   (VOTE_COOLDOWN_MS en el servidor), sin importar de qué tema/ciclo se trate.
   El nombre y el cooldown viven en LocalStorage para sobrevivir recargas.
   ========================================================================= */
(() => {
  const socket = io();
  const $ = s => document.querySelector(s);

  const screens = {
    welcome: $('#welcome'),
    vote: $('#vote'),
    done: $('#done')
  };
  const pad = $('#pad');
  function show(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  const TIPS = [
    '🍺 Aprovecha para pedir otra bebida — cuando vuelvas, tu voto te estará esperando.',
    '🎉 Estira las piernas y saluda a alguien nuevo. Ya casi puedes votar de nuevo.',
    '🥤 Buen momento para recargar el vaso. Vuelve en un ratito.',
    '🔥 El vértigo sigue en marcha en la pantalla grande. Disfruta y ya vuelves a votar.'
  ];

  // ---- Identidad + estado persistido en LocalStorage ----
  let clientId = localStorage.getItem('vertigo_cid');
  let userName = localStorage.getItem('vertigo_name') || '';
  let retryAt = Number(localStorage.getItem('vertigo_retry_at') || 0);
  let lastVote = null;
  try { lastVote = JSON.parse(localStorage.getItem('vertigo_last_vote') || 'null'); } catch { lastVote = null; }
  let cooldownTip = null;
  let cooldownInterval = null;

  const isLocked = () => retryAt > Date.now();

  let state = null;
  const catCfg = () => window.vertigoCategory(state ? state.category : 'otro');

  // ---- Registro con el servidor (fuente de verdad del cooldown) ----
  function registrar() {
    socket.emit('registrar_cliente', clientId, res => {
      clientId = res.clientId;
      localStorage.setItem('vertigo_cid', clientId);
      retryAt = res.retryAt || 0;
      if (retryAt) localStorage.setItem('vertigo_retry_at', String(retryAt));
      else localStorage.removeItem('vertigo_retry_at');
      if (userName) enterMain();
    });
  }
  socket.on('connect', registrar);

  // ---------------------------------------------------------------------
  //  BIENVENIDA
  // ---------------------------------------------------------------------
  $('#nameForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#nameInput').value.trim();
    if (!v) return;
    userName = v;
    localStorage.setItem('vertigo_name', userName);
    enterMain();
  });

  $('#changeNameLink').addEventListener('click', e => {
    e.preventDefault();
    userName = '';
    localStorage.removeItem('vertigo_name');
    $('#nameInput').value = '';
    show('welcome');
  });

  // Punto de entrada principal: decide si mostrar el pad o el cooldown.
  function enterMain() {
    $('#userName').textContent = userName;
    if (isLocked()) {
      goVoted({ freshVote: false });
    } else {
      renderPad();
      show('vote');
    }
  }

  if (userName) enterMain();

  // ---------------------------------------------------------------------
  //  PAD DE VOTACIÓN
  // ---------------------------------------------------------------------
  function renderPad() {
    if (!state || !state.items || !state.items.length) {
      $('#roundTitle').textContent = state ? catCfg().promptLabel : 'Esperando la próxima ronda…';
      pad.innerHTML = `<div class="pad-empty">${state
        ? `Todavía no hay ${catCfg().itemLabelPlural.toLowerCase()} en votación. Espera un momento.`
        : 'Todavía no hay ninguna votación activa. Mira la pantalla del bar para el próximo show.'}</div>`;
      pad.classList.remove('locked');
      $('#voteMsg').textContent = '';
      return;
    }
    $('#roundTitle').textContent = state.title || catCfg().promptLabel;
    // Orden fijo por id para que los botones no salten en el cliente
    const items = [...state.items].sort((a, b) => a.id.localeCompare(b.id));
    pad.innerHTML = '';
    items.forEach((it, i) => {
      const btn = document.createElement('button');
      btn.className = 'song-btn gpu';
      btn.dataset.id = it.id;
      const sub = catCfg().subtitleField ? (it[catCfg().subtitleField] || '') : (it.genre || it.artist || '');
      btn.innerHTML = `
        <span class="num">${i + 1}</span>
        <span class="meta">
          <span class="t">${escapeHtml(it.title)}</span>
          <span class="a">${escapeHtml(sub)}</span>
        </span>
        <span class="chevron">▸</span>`;
      btn.addEventListener('pointerdown', ev => ripple(btn, ev));
      btn.addEventListener('click', () => votar(it.id, btn));
      pad.appendChild(btn);
    });
    applyLockState();
  }

  function applyLockState() {
    if (!state || !state.items || !state.items.length) return;
    const closed = state && !state.open;
    pad.classList.toggle('locked', closed);
    const msg = $('#voteMsg');
    if (closed) { msg.textContent = 'Votación cerrada · mira la pantalla'; msg.classList.remove('err'); }
    else { msg.classList.remove('err'); msg.textContent = `Toca ${catCfg().article} ${catCfg().itemLabel.toLowerCase()} para votar`; }
  }

  function ripple(btn, ev) {
    if (pad.classList.contains('locked')) return;
    const r = document.createElement('span');
    r.className = 'ripple';
    const rect = btn.getBoundingClientRect();
    r.style.left = (ev.clientX - rect.left) + 'px';
    r.style.top = (ev.clientY - rect.top) + 'px';
    btn.appendChild(r);
    setTimeout(() => r.remove(), 500);
    if (navigator.vibrate) navigator.vibrate(12);
  }

  let sending = false;
  function votar(itemId, btn) {
    if (sending || pad.classList.contains('locked') || isLocked()) return;
    sending = true;
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 350);

    socket.emit('votar', { clientId, itemId, name: userName }, res => {
      sending = false;
      if (res && res.ok) {
        retryAt = res.retryAt;
        localStorage.setItem('vertigo_retry_at', String(retryAt));
        const it = (state.items || []).find(i => i.id === itemId);
        lastVote = it ? {
          id: it.id, title: it.title,
          sub: catCfg().subtitleField ? (it[catCfg().subtitleField] || '') : (it.genre || it.artist || ''),
          icon: catCfg().icon
        } : null;
        localStorage.setItem('vertigo_last_vote', JSON.stringify(lastVote));
        cooldownTip = null;
        if (navigator.vibrate) navigator.vibrate([20, 40, 30]);
        setTimeout(() => goVoted({ freshVote: true }), 400);
      } else if (res?.error === 'en_espera' && res.retryAt) {
        retryAt = res.retryAt;
        localStorage.setItem('vertigo_retry_at', String(retryAt));
        goVoted({ freshVote: false });
      } else {
        const msg = $('#voteMsg');
        msg.classList.add('err');
        msg.textContent = window.vertigoError(res?.error);
      }
    });
  }

  // ---------------------------------------------------------------------
  //  PANTALLA DE VOTO REGISTRADO / COOLDOWN
  // ---------------------------------------------------------------------
  function goVoted({ freshVote }) {
    $('#done').classList.remove('win');
    $('#doneIcon').textContent = (lastVote && lastVote.icon) || catCfg().icon;
    $('#doneTitle').textContent = freshVote ? '¡Voto registrado!' : 'Ya votaste';
    $('#doneText').textContent = freshVote
      ? 'Tu voto ya está en la pantalla del bar.'
      : 'Tu último voto sigue en pie mientras esperas.';
    renderMyPick();
    renderCooldown();
    show('done');
  }

  // No hay "ganador de la noche": la votación es continua. Esto solo se
  // dispara cuando el operador detiene la votación por un rato (fin de la
  // noche, cambio de artista) — no cada vez que algo se cumple.
  function goRoundConcluded() {
    if (!userName) return;
    $('#done').classList.remove('win');
    $('#doneIcon').textContent = '✓';
    $('#doneTitle').textContent = 'Votación cerrada';
    $('#doneText').textContent = 'Por ahora no se puede votar. Mira la pantalla del bar.';
    renderMyPick();
    renderCooldown();
    show('done');
  }

  function renderMyPick() {
    const el = $('#myPick');
    if (lastVote) {
      el.innerHTML = `${lastVote.icon} ${escapeHtml(lastVote.title)}${lastVote.sub ? ' · ' + escapeHtml(lastVote.sub) : ''}`;
      el.style.display = 'block';
    } else {
      el.innerHTML = ''; el.style.display = 'none';
    }
  }

  // ---------------------------------------------------------------------
  //  CUENTA REGRESIVA DEL COOLDOWN
  // ---------------------------------------------------------------------
  function renderCooldown() {
    const box = $('#cooldownBox');
    if (isLocked()) {
      box.style.display = 'flex';
      if (!cooldownTip) cooldownTip = TIPS[Math.floor(Math.random() * TIPS.length)];
      $('#cooldownTip').textContent = cooldownTip;
      startCooldownTicker();
    } else {
      box.style.display = 'none';
      stopCooldownTicker();
    }
  }
  function startCooldownTicker() {
    stopCooldownTicker();
    tickCooldown();
    cooldownInterval = setInterval(tickCooldown, 1000);
  }
  function stopCooldownTicker() {
    clearInterval(cooldownInterval);
    cooldownInterval = null;
  }
  function tickCooldown() {
    const remaining = retryAt - Date.now();
    if (remaining <= 0) {
      stopCooldownTicker();
      retryAt = 0;
      localStorage.removeItem('vertigo_retry_at');
      $('#cooldownBox').style.display = 'none';
      onCooldownEnd();
      return;
    }
    const mm = Math.floor(remaining / 60000);
    const ss = Math.floor((remaining % 60000) / 1000);
    $('#cooldownTimer').textContent = `${mm}:${String(ss).padStart(2, '0')}`;
  }
  function onCooldownEnd() {
    if (!screens.done.classList.contains('active')) return; // el usuario ya navegó a otro lado
    if (state && state.open && state.items && state.items.length) {
      renderPad();
      show('vote');
    } else {
      $('#doneIcon').textContent = catCfg().icon;
      $('#doneTitle').textContent = '¡Ya puedes votar de nuevo!';
      $('#doneText').textContent = state && state.open ? 'Espera el próximo tema en pantalla.' : 'Espera a que empiece la próxima votación.';
      $('#myPick').style.display = 'none';
    }
  }

  // ---------------------------------------------------------------------
  //  SOCKETS
  // ---------------------------------------------------------------------
  function onStateUpdate(s) {
    state = s;
    if (screens.vote.classList.contains('active')) renderPad();
  }

  socket.on('estado_actual', onStateUpdate);
  socket.on('voto_recibido', ({ state: s }) => onStateUpdate(s));
  socket.on('rebase_ocurrido', ({ state: s }) => onStateUpdate(s));
  socket.on('tema_cumplido', ({ state: s }) => onStateUpdate(s));
  socket.on('ronda_iniciada', s => onStateUpdate(s));

  socket.on('ronda_concluida', ({ state: s }) => {
    state = s;
    flash();
    if (userName) setTimeout(goRoundConcluded, 250);
  });

  // ---------------------------------------------------------------------
  //  UTILIDADES
  // ---------------------------------------------------------------------
  function flash() {
    const f = $('#flash');
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Si ya tenía nombre guardado, precargar input (por si vuelve a la bienvenida)
  if (userName) $('#nameInput').value = userName;
})();
