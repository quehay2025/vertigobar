/* =========================================================================
   VÉRTIGO BAR — Panel del Artista
   ========================================================================= */
(() => {
  const socket = io();
  const $ = s => document.querySelector(s);
  let state = null;
  let key = sessionStorage.getItem('vertigo_artist_key') || '';

  // ---- Acceso ----
  $('#keyForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#keyInput').value.trim();
    if (!v) return;
    // Validamos con una acción no destructiva (agregar nada -> usamos un ping)
    key = v;
    // probamos autorización intentando una acción neutra: reactivar id inexistente
    socket.emit('reactivar_tema', { key, songId: '__ping__' }, res => {
      if (res && res.error === 'no_autorizado') {
        $('#gateMsg').textContent = 'Clave incorrecta';
        key = '';
      } else {
        sessionStorage.setItem('vertigo_artist_key', key);
        openPanel();
      }
    });
  });

  function openPanel() {
    $('#gate').style.display = 'none';
    $('#panel').classList.add('on');
    render();
  }

  // ---- Render ----
  function render() {
    if (!state) return;
    $('#cycle').textContent = state.cycle || 0;
    $('#total').textContent = state.total || 0;
    $('#activeCount').textContent = state.songs.length;
    $('#doneCount').textContent = (state.done || []).length;

    // Ranking activo
    const rk = $('#ranking');
    if (!state.songs.length) {
      rk.innerHTML = '<div class="empty">No hay temas en votación. Agrega uno o reactiva uno cumplido.</div>';
    } else {
      rk.innerHTML = '';
      state.songs.forEach(s => {
        const row = document.createElement('div');
        row.className = 'a-row' + (s.rank === 1 && s.votes > 0 ? ' top' : '');
        row.dataset.id = s.id;
        row.innerHTML = `
          <div class="rank">${s.rank}</div>
          <div class="info">
            <div class="t">${esc(s.title)}</div>
            <div class="a">${esc(s.artist || '')}</div>
          </div>
          <div class="v">${s.votes}<small>${s.pct}%</small></div>
          <button class="done-btn">✓ Ya lo hice</button>`;
        row.querySelector('.done-btn').addEventListener('click', () => cumplir(s.id, row));
        rk.appendChild(row);
      });
    }

    // Cumplidos
    const dl = $('#donelist');
    const done = state.done || [];
    if (!done.length) {
      dl.innerHTML = '<div class="empty">Aún no hay temas cumplidos.</div>';
    } else {
      dl.innerHTML = '';
      done.forEach(s => {
        const row = document.createElement('div');
        row.className = 'done-row';
        row.innerHTML = `
          <div class="info"><div class="t">${esc(s.title)}</div><div class="a">${esc(s.artist || '')}</div></div>
          <button class="react-btn">↺ Reactivar</button>`;
        row.querySelector('.react-btn').addEventListener('click', () => reactivar(s.id));
        dl.appendChild(row);
      });
    }
  }

  // ---- Acciones ----
  function cumplir(songId, row) {
    row.classList.add('gone');
    socket.emit('marcar_cumplido', { key, songId }, res => {
      if (res && res.ok) msg(`✓ Tema cumplido · sube el siguiente`);
      else { row.classList.remove('gone'); msg('No se pudo marcar: ' + (res?.error || '?'), true); }
    });
  }
  function reactivar(songId) {
    socket.emit('reactivar_tema', { key, songId }, res => {
      if (res && res.ok) msg('↺ Tema devuelto a votación');
      else msg('No se pudo reactivar: ' + (res?.error || '?'), true);
    });
  }
  $('#addForm').addEventListener('submit', e => {
    e.preventDefault();
    const title = $('#addTitle').value.trim();
    const artist = $('#addArtist').value.trim();
    if (!title) return;
    socket.emit('agregar_tema', { key, title, artist }, res => {
      if (res && res.ok) { $('#addTitle').value = ''; $('#addArtist').value = ''; msg('➕ Tema agregado'); }
      else msg('No se pudo agregar: ' + (res?.error || '?'), true);
    });
  });

  function msg(t, err = false) {
    const m = $('#msg'); m.textContent = t; m.classList.toggle('err', err);
    clearTimeout(msg._t); msg._t = setTimeout(() => { m.textContent = ''; }, 3500);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ---- Sockets (live) ----
  const update = s => { state = s; if ($('#panel').classList.contains('on')) render(); };
  socket.on('estado_actual', s => { if (s) update(s); });
  socket.on('voto_recibido', ({ state: s }) => update(s));
  socket.on('rebase_ocurrido', ({ state: s }) => update(s));
  socket.on('tema_cumplido', ({ state: s }) => update(s));
  socket.on('tema_reactivado', ({ state: s }) => update(s));
  socket.on('ronda_iniciada', s => update(s));
  socket.on('ronda_concluida', ({ state: s }) => update(s));

  // Auto-entrar si ya había clave en sesión
  if (key) {
    socket.emit('reactivar_tema', { key, songId: '__ping__' }, res => {
      if (!(res && res.error === 'no_autorizado')) openPanel();
      else { key = ''; sessionStorage.removeItem('vertigo_artist_key'); }
    });
  }
})();
