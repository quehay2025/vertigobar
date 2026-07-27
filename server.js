import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'url';
import path from 'path';
import { connectDB, RoundModel, isDbEnabled } from './db.js';
import * as artists from './artists.js';
import { getCategory, sanitizeItemFields } from './categories.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'vertigo-admin';

// Cada dispositivo (clientId) puede votar una vez por ventana de tiempo,
// sin importar de qué ítem/ciclo/ronda se trate (mantiene a la gente
// participando toda la noche, en vez de "un voto y listo").
const VOTE_COOLDOWN_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
//  ESTADO EN MEMORIA (fuente de verdad para tiempo real; Mongo persiste)
// ---------------------------------------------------------------------------
// Ronda:
//   { id, cycle, title, open, winnerId, createdAt,
//     artistId, artistName, category,
//     items: [{ id, title, artist, genre, votes, status:'active'|'done' }] }
let round = null;

// clientId -> timestamp (ms) del último voto. Vive fuera de `round` para que
// el cooldown no se reinicie al cambiar de ciclo, tema o artista en vivo.
const cooldowns = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of cooldowns) if (now - ts > VOTE_COOLDOWN_MS) cooldowns.delete(id);
}, 10 * 60 * 1000);

// Próximo show: independiente de la ronda activa (el operador lo actualiza
// libremente, aunque no haya votación abierta). No se persiste a Mongo: es
// información de una sola noche y se resetea si el servidor reinicia.
//   { label: string, targetAt: number|null }  targetAt en ms epoch, o null
//   si el operador solo puso un texto libre sin horario.
let nextShowInfo = null;

// ¿El código pertenece al artista que está en vivo ahora mismo?
function isRoundArtist(code) {
  if (!round || !round.artistId || !code) return false;
  const artist = artists.findByCode(code);
  return !!artist && artist.id === round.artistId;
}
// Autoriza acciones sobre la RONDA EN VIVO (marcar cumplido, reactivar, agregar ad-hoc)
function isRoundStaff({ key, code } = {}) {
  return key === ADMIN_KEY || isRoundArtist(code);
}
// Autoriza acciones sobre el REPERTORIO de un artista puntual (propio código o staff)
function canManageArtist(artist, { key, code } = {}) {
  if (!artist) return false;
  if (key === ADMIN_KEY) return true;
  return !!code && artist.code === code;
}

function newRound({ artistId, title } = {}) {
  const artist = artists.findById(artistId);
  if (!artist) return { error: 'artista_invalido' };
  if (!artist.repertoire.length) return { error: 'repertorio_vacio' };
  const cfg = getCategory(artist.category);
  const round = {
    id: nanoid(10),
    cycle: 0,
    title: (title && title.trim()) || cfg.promptLabel,
    open: true,
    winnerId: null,
    artistId: artist.id,
    artistName: artist.name,
    category: artist.category,
    createdAt: Date.now(),
    items: artist.repertoire.map(it => ({
      id: it.id, title: it.title, artist: it.artist || '', genre: it.genre || '',
      votes: 0, status: 'active'
    }))
  };
  return { round };
}

const activeItems = r => r.items.filter(i => i.status === 'active');
const doneItems = r => r.items.filter(i => i.status === 'done');

// Ranking (solo activos), mayor a menor votos; desempata por id estable
function rankedItems(r) {
  return activeItems(r).sort((a, b) => b.votes - a.votes || a.id.localeCompare(b.id));
}
const totalVotes = r => activeItems(r).reduce((acc, i) => acc + i.votes, 0);

// Payload publico
function publicState(r) {
  if (!r) return null;
  const total = totalVotes(r);
  return {
    id: r.id,
    cycle: r.cycle,
    title: r.title,
    open: r.open,
    winnerId: r.winnerId,
    artistId: r.artistId,
    artistName: r.artistName,
    category: r.category,
    total,
    items: rankedItems(r).map((it, i) => ({
      id: it.id, title: it.title, artist: it.artist, genre: it.genre, votes: it.votes,
      rank: i + 1,
      pct: total > 0 ? Math.round((it.votes / total) * 100) : 0
    })),
    done: doneItems(r).map(it => ({ id: it.id, title: it.title, artist: it.artist, genre: it.genre }))
  };
}

function broadcastState() {
  io.emit('estado_actual', publicState(round));
}

async function persist(r) {
  if (!isDbEnabled() || !r) return;
  try {
    await RoundModel.findOneAndUpdate(
      { id: r.id },
      {
        id: r.id, cycle: r.cycle, title: r.title,
        open: r.open, winnerId: r.winnerId,
        artistId: r.artistId, artistName: r.artistName, category: r.category,
        items: r.items.map(i => ({ id: i.id, title: i.title, artist: i.artist, genre: i.genre, votes: i.votes, status: i.status })),
        createdAt: new Date(r.createdAt)
      },
      { upsert: true, new: true }
    );
  } catch (e) {
    console.error('[persist] error:', e.message);
  }
}

// ---------------------------------------------------------------------------
//  SOCKET.IO
// ---------------------------------------------------------------------------
io.on('connection', socket => {
  socket.emit('estado_actual', publicState(round));
  socket.emit('proximo_show_actualizado', nextShowInfo);

  // Identidad anti-spam (el cliente guarda el clientId en LocalStorage).
  // Devuelve el cooldown vigente (si lo hay) para que el cliente recupere
  // su cuenta regresiva aunque haya recargado la página.
  socket.on('registrar_cliente', (clientId, ack) => {
    const id = clientId && typeof clientId === 'string' ? clientId : nanoid(16);
    const last = cooldowns.get(id);
    const retryAt = last ? last + VOTE_COOLDOWN_MS : 0;
    ack?.({ clientId: id, retryAt, roundId: round?.id || null, cycle: round?.cycle || 0 });
  });

  // ----------------------------- VOTO -----------------------------
  // Un voto cada VOTE_COOLDOWN_MS por dispositivo (clientId), sin importar
  // ciclo/ítem/ronda. Mantiene a la gente votando toda la noche.
  socket.on('votar', async ({ clientId, itemId, name } = {}, ack) => {
    if (!round || !round.open) return ack?.({ ok: false, error: 'votacion_cerrada' });
    if (!clientId) return ack?.({ ok: false, error: 'sin_id' });
    const now = Date.now();
    const last = cooldowns.get(clientId);
    if (last && now - last < VOTE_COOLDOWN_MS) {
      return ack?.({ ok: false, error: 'en_espera', retryAt: last + VOTE_COOLDOWN_MS });
    }
    const item = round.items.find(i => i.id === itemId && i.status === 'active');
    if (!item) return ack?.({ ok: false, error: 'item_invalido' });

    const prevTotal = totalVotes(round);
    const antes = rankedItems(round).map(i => i.id);

    // Contador sube al instante
    item.votes += 1;
    cooldowns.set(clientId, now);

    const despues = rankedItems(round).map(i => i.id);
    const state = publicState(round);
    ack?.({ ok: true, itemId, retryAt: now + VOTE_COOLDOWN_MS });

    io.emit('voto_recibido', { itemId, name: name || null, itemTitle: item.title, state });

    // Empate
    const cuenta = {};
    let empate = false;
    for (const i of activeItems(round)) {
      if (i.votes > 0) { cuenta[i.votes] = (cuenta[i.votes] || 0) + 1; if (cuenta[i.votes] > 1) empate = true; }
    }
    if (empate) io.emit('empate_detectado', { state });

    // Rebase / sorpasso
    if (prevTotal > 0 && antes.some((id, i) => despues[i] !== id)) {
      io.emit('rebase_ocurrido', { state, subioId: itemId, antes, despues });
    }
    await persist(round);
  });

  // -------------------- ARTISTA/STAFF: marcar cumplido --------------------
  // Termina el ítem en vivo -> sale del ranking, sus puntos se reinician (0)
  // y podrá re-entrar luego. El siguiente sube automáticamente a #1 (el
  // cooldown de cada votante sigue su propio reloj, no depende del ciclo).
  socket.on('marcar_cumplido', async ({ key, code, itemId } = {}, ack) => {
    if (!isRoundStaff({ key, code })) return ack?.({ ok: false, error: 'no_autorizado' });
    if (!round) return ack?.({ ok: false, error: 'sin_ronda' });
    const item = round.items.find(i => i.id === itemId && i.status === 'active');
    if (!item) return ack?.({ ok: false, error: 'item_invalido' });

    item.status = 'done';
    item.votes = 0;                 // se reinician los puntos
    round.cycle += 1;               // nuevo ciclo de votacion

    const state = publicState(round);
    io.emit('tema_cumplido', { itemId, title: item.title, state });
    io.emit('estado_actual', state);
    ack?.({ ok: true, state });
    await persist(round);
  });

  // -------------------- ARTISTA/STAFF: reactivar ítem --------------------
  socket.on('reactivar_tema', async ({ key, code, itemId } = {}, ack) => {
    if (!isRoundStaff({ key, code })) return ack?.({ ok: false, error: 'no_autorizado' });
    if (!round) return ack?.({ ok: false, error: 'sin_ronda' });
    const item = round.items.find(i => i.id === itemId && i.status === 'done');
    if (!item) return ack?.({ ok: false, error: 'item_invalido' });
    item.status = 'active';
    item.votes = 0;
    const state = publicState(round);
    io.emit('tema_reactivado', { itemId, title: item.title, state });
    io.emit('estado_actual', state);
    ack?.({ ok: true, state });
    await persist(round);
  });

  // -------------------- ARTISTA/STAFF: agregar ítem ad-hoc a la ronda --------------------
  // Solo afecta la ronda de esta noche; NO se guarda en el repertorio permanente
  // (para eso está artista_agregar_item).
  socket.on('agregar_tema', async ({ key, code, title, artist, genre } = {}, ack) => {
    if (!isRoundStaff({ key, code })) return ack?.({ ok: false, error: 'no_autorizado' });
    if (!round) return ack?.({ ok: false, error: 'sin_ronda' });
    const clean = sanitizeItemFields(round.category, { title, artist, genre });
    if (!clean) return ack?.({ ok: false, error: 'campos_invalidos' });
    round.items.push({ id: nanoid(6), ...clean, votes: 0, status: 'active' });
    const state = publicState(round);
    io.emit('estado_actual', state);
    ack?.({ ok: true, state });
    await persist(round);
  });

  // ----------------------- ARTISTA: login por código -----------------------
  socket.on('artista_login', (code, ack) => {
    const artist = artists.findByCode(code);
    if (!artist) return ack?.({ ok: false, error: 'codigo_invalido' });
    ack?.({ ok: true, artist: artists.publicArtist(artist) });
  });

  // ----------------- ARTISTA/STAFF: repertorio persistente -----------------
  socket.on('artista_agregar_item', async ({ artistId, key, code, fields } = {}, ack) => {
    const artist = artists.findById(artistId);
    if (!canManageArtist(artist, { key, code })) return ack?.({ ok: false, error: 'no_autorizado' });
    const result = await artists.addItem(artistId, fields || {});
    if (result.error) return ack?.({ ok: false, error: result.error });
    // Si este artista está en vivo ahora mismo, el ítem nuevo entra también a la ronda.
    if (round && round.artistId === artistId) {
      round.items.push({
        id: result.item.id, title: result.item.title, artist: result.item.artist,
        genre: result.item.genre, votes: 0, status: 'active'
      });
      io.emit('estado_actual', publicState(round));
      await persist(round);
    }
    ack?.({ ok: true, artist: artists.publicArtist(result.artist) });
  });

  socket.on('artista_editar_item', async ({ artistId, itemId, key, code, fields } = {}, ack) => {
    const artist = artists.findById(artistId);
    if (!canManageArtist(artist, { key, code })) return ack?.({ ok: false, error: 'no_autorizado' });
    const result = await artists.updateItem(artistId, itemId, fields || {});
    if (result.error) return ack?.({ ok: false, error: result.error });
    ack?.({ ok: true, artist: artists.publicArtist(result.artist) });
  });

  socket.on('artista_eliminar_item', async ({ artistId, itemId, key, code } = {}, ack) => {
    const artist = artists.findById(artistId);
    if (!canManageArtist(artist, { key, code })) return ack?.({ ok: false, error: 'no_autorizado' });
    const result = await artists.removeItem(artistId, itemId);
    if (result.error) return ack?.({ ok: false, error: result.error });
    ack?.({ ok: true, artist: artists.publicArtist(result.artist) });
  });

  // ----------------------------- ADMIN: artistas -----------------------------
  socket.on('admin_crear_artista', async ({ key, name, category } = {}, ack) => {
    if (key !== ADMIN_KEY) return ack?.({ ok: false, error: 'no_autorizado' });
    const result = await artists.createArtist({ name, category });
    if (result.error) return ack?.({ ok: false, error: result.error });
    ack?.({ ok: true, artist: artists.adminArtist(result.artist) });
  });

  socket.on('admin_listar_artistas', ({ key } = {}, ack) => {
    if (key !== ADMIN_KEY) return ack?.({ ok: false, error: 'no_autorizado' });
    ack?.({ ok: true, artists: artists.listArtists().map(a => artists.adminArtist(a)) });
  });

  socket.on('admin_regenerar_codigo_artista', async ({ key, artistId } = {}, ack) => {
    if (key !== ADMIN_KEY) return ack?.({ ok: false, error: 'no_autorizado' });
    const result = await artists.regenerateCode(artistId);
    if (result.error) return ack?.({ ok: false, error: result.error });
    ack?.({ ok: true, artist: artists.adminArtist(result.artist) });
  });

  socket.on('admin_eliminar_artista', async ({ key, artistId } = {}, ack) => {
    if (key !== ADMIN_KEY) return ack?.({ ok: false, error: 'no_autorizado' });
    const result = await artists.deleteArtist(artistId);
    if (result.error) return ack?.({ ok: false, error: result.error });
    ack?.({ ok: true });
  });

  // ----------------------------- ADMIN: ronda -----------------------------
  socket.on('admin_iniciar_ronda_artista', async ({ key, artistId, title } = {}, ack) => {
    if (key !== ADMIN_KEY) return ack?.({ ok: false, error: 'no_autorizado' });
    const result = newRound({ artistId, title });
    if (result.error) return ack?.({ ok: false, error: result.error });
    round = result.round;
    await persist(round);
    io.emit('ronda_iniciada', publicState(round));
    broadcastState();
    ack?.({ ok: true, state: publicState(round) });
  });

  socket.on('admin_cerrar_ronda', async ({ key } = {}, ack) => {
    if (key !== ADMIN_KEY) return ack?.({ ok: false, error: 'no_autorizado' });
    if (!round) return ack?.({ ok: false, error: 'sin_ronda' });
    round.open = false;
    round.winnerId = rankedItems(round)[0]?.id || null;
    await persist(round);
    io.emit('ronda_concluida', { state: publicState(round), winnerId: round.winnerId });
    ack?.({ ok: true, winnerId: round.winnerId });
  });

  // Reinicia los votos de la ronda actual (mismo artista/ítems), sin re-elegirla
  socket.on('admin_reset', async ({ key } = {}, ack) => {
    if (key !== ADMIN_KEY) return ack?.({ ok: false, error: 'no_autorizado' });
    if (!round) return ack?.({ ok: false, error: 'sin_ronda' });
    round.items.forEach(i => { i.votes = 0; });
    round.cycle += 1;
    round.winnerId = null;
    round.open = true;
    const state = publicState(round);
    io.emit('estado_actual', state);
    ack?.({ ok: true, state });
    await persist(round);
  });

  // -------------------- ADMIN: próximo show (independiente de la ronda) --------------------
  // mode 'hora': value = "HH:MM" (si ya pasó hoy, se asume mañana).
  // mode 'duracion': value = minutos desde ahora.
  // Sin mode/value válido: solo se guarda el texto, sin cuenta regresiva.
  socket.on('admin_set_next_show', ({ key, label, mode, value } = {}, ack) => {
    if (key !== ADMIN_KEY) return ack?.({ ok: false, error: 'no_autorizado' });
    const clean = (label || '').trim().slice(0, 80);
    if (!clean) return ack?.({ ok: false, error: 'sin_titulo' });
    let targetAt = null;
    if (mode === 'hora' && /^\d{1,2}:\d{2}$/.test(value || '')) {
      const [hh, mm] = value.split(':').map(Number);
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        const d = new Date();
        d.setSeconds(0, 0);
        d.setHours(hh, mm);
        if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); // ya pasó -> mañana
        targetAt = d.getTime();
      }
    } else if (mode === 'duracion') {
      const mins = Number(value);
      if (Number.isFinite(mins) && mins > 0) targetAt = Date.now() + mins * 60000;
    }
    nextShowInfo = { label: clean, targetAt };
    io.emit('proximo_show_actualizado', nextShowInfo);
    ack?.({ ok: true, nextShowInfo });
  });

  // Retraso de último momento: suma minutos al horario ya fijado.
  socket.on('admin_posponer_next_show', ({ key, minutes } = {}, ack) => {
    if (key !== ADMIN_KEY) return ack?.({ ok: false, error: 'no_autorizado' });
    if (!nextShowInfo || !nextShowInfo.targetAt) return ack?.({ ok: false, error: 'sin_horario' });
    const add = Number(minutes) || 0;
    nextShowInfo = { ...nextShowInfo, targetAt: nextShowInfo.targetAt + add * 60000 };
    io.emit('proximo_show_actualizado', nextShowInfo);
    ack?.({ ok: true, nextShowInfo });
  });

  socket.on('admin_borrar_next_show', ({ key } = {}, ack) => {
    if (key !== ADMIN_KEY) return ack?.({ ok: false, error: 'no_autorizado' });
    nextShowInfo = null;
    io.emit('proximo_show_actualizado', nextShowInfo);
    ack?.({ ok: true });
  });
});

// ---------------------------------------------------------------------------
//  REST auxiliar
// ---------------------------------------------------------------------------
app.get('/api/estado', (req, res) => res.json(publicState(round)));
app.get('/api/health', (req, res) => res.json({ ok: true, db: isDbEnabled(), round: round?.id || null }));

app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tv.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/artist', (req, res) => res.sendFile(path.join(__dirname, 'public', 'artist.html')));
app.get('/artista', (req, res) => res.sendFile(path.join(__dirname, 'public', 'artist.html')));
app.get('/vota', (req, res) => res.sendFile(path.join(__dirname, 'public', 'vota.html')));
app.get('/votar', (req, res) => res.sendFile(path.join(__dirname, 'public', 'vota.html')));

// ---------------------------------------------------------------------------
//  ARRANQUE
// ---------------------------------------------------------------------------
async function boot() {
  await connectDB();
  await artists.restoreFromDB();
  if (isDbEnabled()) {
    try {
      const last = await RoundModel.findOne({}).sort({ createdAt: -1 });
      if (last) {
        round = {
          id: last.id, cycle: last.cycle || 0, title: last.title,
          open: last.open, winnerId: last.winnerId,
          artistId: last.artistId || null, artistName: last.artistName || '', category: last.category || 'otro',
          items: (last.items || []).map(i => ({
            id: i.id, title: i.title, artist: i.artist || '', genre: i.genre || '',
            votes: i.votes, status: i.status || 'active'
          })),
          createdAt: last.createdAt?.getTime() || Date.now()
        };
        console.log(`[boot] ronda restaurada: ${round.id}`);
      }
    } catch (e) { console.error('[boot] restore error:', e.message); }
  }

  server.listen(PORT, () => {
    console.log(`\n  VERTIGO BAR  ->  http://localhost:${PORT}`);
    console.log(`  Inicio  : http://localhost:${PORT}/`);
    console.log(`  Cliente : http://localhost:${PORT}/vota`);
    console.log(`  TV      : http://localhost:${PORT}/tv`);
    console.log(`  Artista : http://localhost:${PORT}/artista  (código personal por artista)`);
    console.log(`  Admin   : http://localhost:${PORT}/admin    (key: ${ADMIN_KEY})`);
    console.log(`  DB      : ${isDbEnabled() ? 'MongoDB conectada' : 'en memoria (sin Mongo)'}\n`);
  });
}

boot();
