/* =========================================================================
   VÉRTIGO BAR — Panel del Artista (código personal + repertorio persistente)
   ========================================================================= */
(() => {
  const socket = io();
  const $ = s => document.querySelector(s);

  let artist = null;   // perfil propio { id, name, category, repertoire }
  let code = sessionStorage.getItem('vertigo_artist_code') || '';
  let state = null;    // estado de la ronda en vivo (broadcast global)

  const cat = () => window.vertigoCategory(artist.category);
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function msg(t, err = false) {
    const m = $('#msg'); m.textContent = t; m.classList.toggle('err', err);
    clearTimeout(msg._t); msg._t = setTimeout(() => { m.textContent = ''; }, 3500);
  }
  function itemSubtitle(it) {
    return cat().fields.filter(f => f.key !== 'title').map(f => it[f.key]).filter(Boolean).join(' · ');
  }

  // ---- Acceso ----
  $('#keyForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#keyInput').value.trim();
    if (!v) return;
    login(v);
  });

  function login(c) {
    socket.emit('artista_login', c, res => {
      if (res && res.ok) {
        code = c; artist = res.artist;
        sessionStorage.setItem('vertigo_artist_code', code);
        $('#gateMsg').textContent = '';
        openPanel();
      } else {
        $('#gateMsg').textContent = 'Código incorrecto';
      }
    });
  }

  $('#logoutLink').addEventListener('click', e => {
    e.preventDefault();
    sessionStorage.removeItem('vertigo_artist_code');
    location.reload();
  });

  function openPanel() {
    $('#gate').style.display = 'none';
    $('#panel').classList.add('on');
    $('#artistBadge').textContent = `${cat().icon} ${artist.name} · ${cat().label}`;
    $('#addSummary').textContent = cat().addCta;
    renderAddFields();
    renderRepertoire();
    renderLive();
  }

  // ---------------------------------------------------------------------
  //  REPERTORIO — alta
  // ---------------------------------------------------------------------
  function renderAddFields() {
    $('#addFields').innerHTML = cat().fields.map(f =>
      `<input data-f="${f.key}" placeholder="${esc(f.label)}${f.required ? '' : ' (opcional)'}">`
    ).join('');
  }

  $('#addForm').addEventListener('submit', e => {
    e.preventDefault();
    const fields = {};
    $('#addFields').querySelectorAll('[data-f]').forEach(i => { fields[i.dataset.f] = i.value.trim(); });
    const faltaObligatorio = cat().fields.some(f => f.required && !fields[f.key]);
    if (faltaObligatorio) return msg('Completa el campo obligatorio', true);
    socket.emit('artista_agregar_item', { artistId: artist.id, code, fields }, res => {
      if (res && res.ok) {
        artist = res.artist;
        $('#addFields').querySelectorAll('[data-f]').forEach(i => { i.value = ''; });
        renderRepertoire();
        msg('✓ Agregado a tu repertorio');
      } else {
        msg('No se pudo agregar: ' + window.vertigoError(res?.error), true);
      }
    });
  });

  // ---------------------------------------------------------------------
  //  REPERTORIO — lista / editar / borrar
  // ---------------------------------------------------------------------
  function renderRepertoire() {
    $('#repCount').textContent = artist.repertoire.length;
    const box = $('#repList');
    if (!artist.repertoire.length) {
      box.innerHTML = `<div class="empty">Todavía no agregaste ${cat().itemLabelPlural.toLowerCase()}.</div>`;
      return;
    }
    box.innerHTML = '';
    artist.repertoire.forEach(it => {
      const row = document.createElement('div');
      row.className = 'a-row rep-row';
      row.dataset.id = it.id;
      const sub = itemSubtitle(it);
      row.innerHTML = `
        <div class="info">
          <div class="t">${esc(it.title)}</div>
          ${sub ? `<div class="a">${esc(sub)}</div>` : ''}
        </div>
        <button class="icon-btn edit-btn" type="button" title="Editar">✏️</button>
        <button class="icon-btn del-btn" type="button" title="Borrar">🗑️</button>`;
      row.querySelector('.edit-btn').addEventListener('click', () => editRow(row, it));
      row.querySelector('.del-btn').addEventListener('click', () => {
        if (!confirm(`¿Borrar "${it.title}" de tu repertorio?`)) return;
        socket.emit('artista_eliminar_item', { artistId: artist.id, code, itemId: it.id }, res => {
          if (res && res.ok) { artist = res.artist; renderRepertoire(); msg('✓ Eliminado de tu repertorio'); }
          else msg('No se pudo borrar: ' + window.vertigoError(res?.error), true);
        });
      });
      box.appendChild(row);
    });
  }

  function editRow(row, it) {
    row.innerHTML = `
      <div class="edit-fields">
        ${cat().fields.map(f => `<input data-f="${f.key}" placeholder="${esc(f.label)}" value="${esc(it[f.key] || '')}">`).join('')}
      </div>
      <button class="icon-btn save-btn" type="button" title="Guardar">💾</button>
      <button class="icon-btn cancel-btn" type="button" title="Cancelar">✕</button>`;
    row.querySelector('.save-btn').addEventListener('click', () => {
      const fields = {};
      row.querySelectorAll('[data-f]').forEach(i => { fields[i.dataset.f] = i.value.trim(); });
      socket.emit('artista_editar_item', { artistId: artist.id, code, itemId: it.id, fields }, res => {
        if (res && res.ok) { artist = res.artist; renderRepertoire(); msg('Actualizado ✓'); }
        else msg('No se pudo guardar: ' + window.vertigoError(res?.error), true);
      });
    });
    row.querySelector('.cancel-btn').addEventListener('click', renderRepertoire);
  }

  // ---------------------------------------------------------------------
  //  EN VIVO — ranking de la ronda actual (solo si este artista está en vivo)
  // ---------------------------------------------------------------------
  function renderLive() {
    if (!artist) return;
    const live = !!(state && state.artistId === artist.id);
    $('#liveSection').style.display = live ? '' : 'none';
    $('#notLiveMsg').style.display = live ? 'none' : '';
    if (!live) {
      $('#notLiveMsg').textContent = (state && state.artistId)
        ? `Ahora está en vivo: ${state.artistName}`
        : 'No hay ninguna ronda activa en este momento.';
      return;
    }

    $('#liveHint').innerHTML = `Marca <b>${cat().doneCta}</b> cuando termines: sale del ranking, se reinician sus puntos y sube el siguiente. Todos podrán votar de nuevo al instante.`;
    $('#activeCount').textContent = state.items.length;
    $('#doneLabel').textContent = `${cat().itemLabelPlural} que ya pasaron`;
    $('#doneCount').textContent = (state.done || []).length;

    const rk = $('#ranking');
    if (!state.items.length) {
      rk.innerHTML = `<div class="empty">No hay ${cat().itemLabelPlural.toLowerCase()} en votación. Agrega uno o reactiva uno cumplido.</div>`;
    } else {
      rk.innerHTML = '';
      state.items.forEach(it => {
        const row = document.createElement('div');
        row.className = 'a-row' + (it.rank === 1 && it.votes > 0 ? ' top' : '');
        row.dataset.id = it.id;
        const sub = itemSubtitle(it);
        row.innerHTML = `
          <div class="rank">${it.rank}</div>
          <div class="info">
            <div class="t">${esc(it.title)}</div>
            ${sub ? `<div class="a">${esc(sub)}</div>` : ''}
          </div>
          <div class="v">${it.votes}<small>${it.pct}%</small></div>
          <button class="done-btn">${cat().doneCta}</button>`;
        row.querySelector('.done-btn').addEventListener('click', () => cumplir(it.id, row));
        rk.appendChild(row);
      });
    }

    const dl = $('#donelist');
    const done = state.done || [];
    if (!done.length) {
      dl.innerHTML = '<div class="empty">Aún nada cumplido en esta ronda.</div>';
    } else {
      dl.innerHTML = '';
      done.forEach(it => {
        const sub = itemSubtitle(it);
        const row = document.createElement('div');
        row.className = 'done-row';
        row.innerHTML = `
          <div class="info"><div class="t">${esc(it.title)}</div>${sub ? `<div class="a">${esc(sub)}</div>` : ''}</div>
          <button class="react-btn">↺ Reactivar</button>`;
        row.querySelector('.react-btn').addEventListener('click', () => reactivar(it.id));
        dl.appendChild(row);
      });
    }
  }

  function cumplir(itemId, row) {
    row.classList.add('gone');
    socket.emit('marcar_cumplido', { code, itemId }, res => {
      if (res && res.ok) msg(`${cat().doneCta} · sube el siguiente`);
      else { row.classList.remove('gone'); msg('No se pudo marcar: ' + window.vertigoError(res?.error), true); }
    });
  }
  function reactivar(itemId) {
    socket.emit('reactivar_tema', { code, itemId }, res => {
      if (res && res.ok) msg('↺ Vuelve a votación');
      else msg('No se pudo reactivar: ' + window.vertigoError(res?.error), true);
    });
  }

  // ---------------------------------------------------------------------
  //  SOCKETS (live)
  // ---------------------------------------------------------------------
  const onState = s => { state = s; if (artist) renderLive(); };
  socket.on('estado_actual', onState);
  socket.on('voto_recibido', ({ state: s }) => onState(s));
  socket.on('rebase_ocurrido', ({ state: s }) => onState(s));
  socket.on('tema_cumplido', ({ state: s }) => onState(s));
  socket.on('tema_reactivado', ({ state: s }) => onState(s));
  socket.on('ronda_iniciada', s => onState(s));
  socket.on('ronda_concluida', ({ state: s }) => onState(s));

  // Auto-entrar si ya había código guardado
  if (code) login(code);
})();
