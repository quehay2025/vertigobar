/* =========================================================================
   VÉRTIGO BAR — Cliente (mobile)
   ========================================================================= */
(() => {
  const socket = io();
  const $ = s => document.querySelector(s);

  const screens = {
    welcome: $('#welcome'),
    vote: $('#vote'),
    done: $('#done')
  };
  function show(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  // ---- Identidad anti-spam (LocalStorage) ----
  let clientId = localStorage.getItem('vertigo_cid');
  let userName = localStorage.getItem('vertigo_name') || '';
  let currentRoundId = null;
  let currentCycle = 0;
  let myVote = null; // { key, songId }  key = `${roundId}:${cycle}`

  // La clave de voto incluye el ciclo: al cumplirse un tema el ciclo sube
  // y el cliente se desbloquea para volver a votar el siguiente.
  const voteKey = () => `${currentRoundId}:${currentCycle}`;
  const hasVoted = () => !!myVote && myVote.key === voteKey();

  function loadMyVote() {
    try { myVote = JSON.parse(localStorage.getItem('vertigo_vote') || 'null'); }
    catch { myVote = null; }
  }
  function saveMyVote(v) {
    myVote = v;
    localStorage.setItem('vertigo_vote', JSON.stringify(v));
  }
  loadMyVote();

  let state = null;

  // ---- Registro con el servidor ----
  function registrar() {
    socket.emit('registrar_cliente', clientId, res => {
      clientId = res.clientId;
      localStorage.setItem('vertigo_cid', clientId);
    });
  }

  // ---------------------------------------------------------------------
  //  BIENVENIDA
  // ---------------------------------------------------------------------
  $('#nameForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#nameInput').value.trim();
    if (!v) return;
    userName = v;
    localStorage.setItem('vertigo_name', userName);
    enterVote();
  });

  function enterVote() {
    $('#userName').textContent = userName;
    if (state) renderPad();
    // ¿ya voté en este ciclo?
    if (hasVoted()) {
      goDone(false);
    } else {
      show('vote');
    }
  }

  // ---------------------------------------------------------------------
  //  PAD DE VOTACIÓN
  // ---------------------------------------------------------------------
  const pad = $('#pad');

  function renderPad() {
    if (!state) return;
    $('#roundTitle').textContent = state.title || 'Elige la siguiente canción';
    // Orden fijo por id para que los botones no salten en el cliente
    const songs = [...state.songs].sort((a, b) => a.id.localeCompare(b.id));
    pad.innerHTML = '';
    songs.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.className = 'song-btn gpu';
      btn.dataset.id = s.id;
      btn.innerHTML = `
        <span class="num">${i + 1}</span>
        <span class="meta">
          <span class="t">${escapeHtml(s.title)}</span>
          <span class="a">${escapeHtml(s.artist || '')}</span>
        </span>
        <span class="chevron">▸</span>`;
      btn.addEventListener('pointerdown', ev => ripple(btn, ev));
      btn.addEventListener('click', () => votar(s.id, btn));
      pad.appendChild(btn);
    });
    applyLockState();
  }

  function applyLockState() {
    const voted = hasVoted();
    const closed = state && !state.open;
    pad.classList.toggle('locked', !!voted || !!closed);
    [...pad.children].forEach(btn => {
      btn.classList.toggle('picked', voted && btn.dataset.id === myVote.songId);
    });
    const msg = $('#voteMsg');
    if (closed) { msg.textContent = 'Votación cerrada · mira la pantalla'; msg.classList.remove('err'); }
    else if (voted) { msg.textContent = 'Ya votaste · espera el siguiente tema'; msg.classList.remove('err'); }
    else msg.textContent = 'Toca un tema para votar';
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
  function votar(songId, btn) {
    if (sending || pad.classList.contains('locked')) return;
    sending = true;
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 350);

    socket.emit('votar', { clientId, songId, name: userName }, res => {
      sending = false;
      if (res && res.ok) {
        saveMyVote({ key: voteKey(), songId });
        if (navigator.vibrate) navigator.vibrate([20, 40, 30]);
        applyLockState();
        setTimeout(() => goDone(false), 450);
      } else {
        const msg = $('#voteMsg');
        msg.classList.add('err');
        msg.textContent = ({
          ya_voto: 'Ya habías votado en este ciclo',
          votacion_cerrada: 'La votación está cerrada',
          tema_invalido: 'Tema no válido'
        })[res?.error] || 'No se pudo registrar el voto';
        // si el server dice que ya votó, bloquea igual
        if (res?.error === 'ya_voto') { saveMyVote({ key: voteKey(), songId: null }); applyLockState(); }
      }
    });
  }

  // ---------------------------------------------------------------------
  //  ESTADO POST-VOTO / CIERRE
  // ---------------------------------------------------------------------
  function goDone(isWin) {
    const song = state && myVote ? state.songs.find(s => s.id === myVote.songId) : null;
    const done = $('#done');
    if (isWin && myVote && state && state.winnerId === myVote.songId) {
      done.classList.add('win');
      $('#doneIcon').textContent = '★';
      $('#doneTitle').textContent = '¡GANÓ TU TEMA!';
      $('#doneText').textContent = 'Tu elección se lleva la ronda. Sube el volumen.';
    } else if (isWin) {
      done.classList.remove('win');
      $('#doneIcon').textContent = '✓';
      $('#doneTitle').textContent = 'Ronda cerrada';
      $('#doneText').textContent = state && state.winnerId
        ? `Ganó: ${winnerLabel()}`
        : 'Gracias por participar.';
    } else {
      done.classList.remove('win');
      $('#doneIcon').textContent = '✓';
      $('#doneTitle').textContent = '¡Voto registrado!';
      $('#doneText').textContent = 'Tu voto ya está en la pantalla del bar.';
    }
    $('#myPick').innerHTML = song ? `🎵 ${escapeHtml(song.title)} · ${escapeHtml(song.artist || '')}` : '';
    $('#myPick').style.display = song ? 'block' : 'none';
    show('done');
  }

  function winnerLabel() {
    const w = state && state.songs.find(s => s.id === state.winnerId);
    return w ? `${w.title} — ${w.artist || ''}` : '';
  }

  // ---------------------------------------------------------------------
  //  SOCKETS
  // ---------------------------------------------------------------------
  socket.on('connect', registrar);

  socket.on('estado_actual', s => {
    if (!s) return;
    const prevRound = currentRoundId;
    const prevCycle = currentCycle;
    state = s; currentRoundId = s.id; currentCycle = s.cycle || 0;
    // nueva ronda o nuevo ciclo (tema cumplido) -> el cliente se desbloquea
    const reset = (prevRound && prevRound !== currentRoundId) || (prevCycle !== currentCycle);
    if (reset && userName && s.open) { renderPad(); show('vote'); }
    if (screens.vote.classList.contains('active') || screens.done.classList.contains('active')) renderPad();
    applyLockStateSafe();
  });

  socket.on('voto_recibido', ({ state: s }) => { state = s; applyLockStateSafe(); });
  socket.on('rebase_ocurrido', ({ state: s }) => { state = s; });

  // El artista cumplió un tema: nuevo ciclo -> vuelve a la pantalla de voto
  socket.on('tema_cumplido', ({ title, state: s }) => {
    state = s; currentCycle = s.cycle || 0;
    if (userName && s.open) {
      renderPad(); show('vote');
      const msg = $('#voteMsg');
      msg.classList.remove('err');
      msg.textContent = `✓ "${title}" ya se hizo · ¡vota el siguiente!`;
    }
  });
  socket.on('tema_reactivado', ({ state: s }) => { state = s; if (screens.vote.classList.contains('active')) renderPad(); });

  socket.on('ronda_iniciada', s => {
    state = s; currentRoundId = s.id; currentCycle = s.cycle || 0;
    $('#done').classList.remove('win');
    if (userName) { renderPad(); show('vote'); }
  });

  socket.on('ronda_concluida', ({ state: s }) => {
    state = s; currentRoundId = s.id;
    flash();
    if (userName) setTimeout(() => goDone(true), 250);
  });

  function applyLockStateSafe() {
    if (screens.vote.classList.contains('active')) applyLockState();
  }

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

  // Si ya tenía nombre guardado, precargar input
  if (userName) $('#nameInput').value = userName;
})();
