import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'url';
import path from 'path';
import { connectDB, RoundModel, isDbEnabled } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'vertigo-admin';
const ARTIST_KEY = process.env.ARTIST_KEY || 'vertigo-artista';

// Autoriza acciones de "operador" (admin) o de "artista".
const isStaff = key => key === ADMIN_KEY || key === ARTIST_KEY;

// ---------------------------------------------------------------------------
//  ESTADO EN MEMORIA (fuente de verdad para tiempo real; Mongo persiste)
// ---------------------------------------------------------------------------
// Ronda:
//   { id, cycle, title, nextShow, open, winnerId, createdAt,
//     songs: [{ id, title, artist, votes, status:'active'|'done' }],
//     voters: Set<clientId> }   // votantes del ciclo actual
let round = null;

function defaultSongs() {
  return [
    { id: 's1', title: 'Rojo', artist: 'J Balvin' },
    { id: 's2', title: 'Provenza', artist: 'Karol G' },
    { id: 's3', title: 'Despecha', artist: 'Rosalia' },
    { id: 's4', title: 'Bizarrap Vol. 53', artist: 'Bizarrap' }
  ];
}

function newRound(config = {}) {
  const src = (config.songs && config.songs.length ? config.songs : defaultSongs());
  return {
    id: nanoid(10),
    cycle: 0,
    title: config.title || 'Elige el siguiente tema',
    nextShow: config.nextShow || 'Dj Tech-Mix Live (23:00 HS)',
    open: true,
    winnerId: null,
    createdAt: Date.now(),
    songs: src.map(s => ({
      id: s.id || nanoid(6),
      title: s.title,
      artist: s.artist || '',
      votes: s.votes || 0,
      status: s.status || 'active'
    })),
    voters: new Set()
  };
}

const activeSongs = r => r.songs.filter(s => s.status === 'active');
const doneSongs = r => r.songs.filter(s => s.status === 'done');

// Ranking (solo activos), mayor a menor votos; desempata por id estable
function rankedSongs(r) {
  return activeSongs(r).sort((a, b) => b.votes - a.votes || a.id.localeCompare(b.id));
}
const totalVotes = r => activeSongs(r).reduce((acc, s) => acc + s.votes, 0);

// Payload publico (nunca expone el Set de voters)
function publicState(r) {
  if (!r) return null;
  const total = totalVotes(r);
  return {
    id: r.id,
    cycle: r.cycle,
    title: r.title,
    nextShow: r.nextShow,
    open: r.open,
    winnerId: r.winnerId,
    total,
    songs: rankedSongs(r).map((s, i) => ({
      id: s.id, title: s.title, artist: s.artist, votes: s.votes,
      rank: i + 1,
      pct: total > 0 ? Math.round((s.votes / total) * 100) : 0
    })),
    done: doneSongs(r).map(s => ({ id: s.id, title: s.title, artist: s.artist }))
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
        id: r.id, cycle: r.cycle, title: r.title, nextShow: r.nextShow,
        open: r.open, winnerId: r.winnerId,
        songs: r.songs.map(s => ({ id: s.id, title: s.title, artist: s.artist, votes: s.votes, status: s.status })),
        voters: [...r.voters],
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

  // Identidad anti-spam (el cliente guarda el clientId en LocalStorage)
  socket.on('registrar_cliente', (clientId, ack) => {
    const id = clientId && typeof clientId === 'string' ? clientId : nanoid(16);
    const yaVoto = round ? round.voters.has(id) : false;
    ack?.({ clientId: id, yaVoto, roundId: round?.id || null, cycle: round?.cycle || 0 });
  });

  // ----------------------------- VOTO -----------------------------
  socket.on('votar', async ({ clientId, songId, name } = {}, ack) => {
    if (!round || !round.open) return ack?.({ ok: false, error: 'votacion_cerrada' });
    if (!clientId) return ack?.({ ok: false, error: 'sin_id' });
    if (round.voters.has(clientId)) return ack?.({ ok: false, error: 'ya_voto' });
    const song = round.songs.find(s => s.id === songId && s.status === 'active');
    if (!song) return ack?.({ ok: false, error: 'tema_invalido' });

    const prevTotal = totalVotes(round);
    const antes = rankedSongs(round).map(s => s.id);

    // Contador sube al instante
    song.votes += 1;
    round.voters.add(clientId);

    const despues = rankedSongs(round).map(s => s.id);
    const state = publicState(round);
    ack?.({ ok: true, songId });

    io.emit('voto_recibido', { songId, name: name || null, songTitle: song.title, state });

    // Empate
    const cuenta = {};
    let empate = false;
    for (const s of activeSongs(round)) {
      if (s.votes > 0) { cuenta[s.votes] = (cuenta[s.votes] || 0) + 1; if (cuenta[s.votes] > 1) empate = true; }
    }
    if (empate) io.emit('empate_detectado', { state });

    // Rebase / sorpasso
    if (prevTotal > 0 && antes.some((id, i) => despues[i] !== id)) {
      io.emit('rebase_ocurrido', { state, subioId: songId, antes, despues });
    }
    await persist(round);
  });

  // -------------------- ARTISTA: marcar cumplido --------------------
  // El artista/comediante terminó el tema -> se elimina del ranking,
  // sus puntos se reinician (0) y podrá re-entrar luego. Empieza un
  // nuevo ciclo de votación (los votantes se liberan para volver a votar).
  socket.on('marcar_cumplido', async ({ key, songId } = {}, ack) => {
    if (!isStaff(key)) return ack?.({ ok: false, error: 'no_autorizado' });
    if (!round) return ack?.({ ok: false, error: 'sin_ronda' });
    const song = round.songs.find(s => s.id === songId && s.status === 'active');
    if (!song) return ack?.({ ok: false, error: 'tema_invalido' });

    song.status = 'done';
    song.votes = 0;                 // se reinician los puntos
    round.cycle += 1;               // nuevo ciclo de votacion
    round.voters.clear();           // todos pueden volver a votar el siguiente

    const state = publicState(round);
    io.emit('tema_cumplido', { songId, title: song.title, state });
    io.emit('estado_actual', state);
    ack?.({ ok: true, state });
    await persist(round);
  });

  // -------------------- ARTISTA: reactivar tema --------------------
  socket.on('reactivar_tema', async ({ key, songId } = {}, ack) => {
    if (!isStaff(key)) return ack?.({ ok: false, error: 'no_autorizado' });
    if (!round) return ack?.({ ok: false, error: 'sin_ronda' });
    const song = round.songs.find(s => s.id === songId && s.status === 'done');
    if (!song) return ack?.({ ok: false, error: 'tema_invalido' });
    song.status = 'active';
    song.votes = 0;
    const state = publicState(round);
    io.emit('tema_reactivado', { songId, title: song.title, state });
    io.emit('estado_actual', state);
    ack?.({ ok: true, state });
    await persist(round);
  });

  // -------------------- ARTISTA/ADMIN: agregar tema --------------------
  socket.on('agregar_tema', async ({ key, title, artist } = {}, ack) => {
    if (!isStaff(key)) return ack?.({ ok: false, error: 'no_autorizado' });
    if (!round) return ack?.({ ok: false, error: 'sin_ronda' });
    if (!title || !title.trim()) return ack?.({ ok: false, error: 'sin_titulo' });
    round.songs.push({ id: nanoid(6), title: title.trim(), artist: (artist || '').trim(), votes: 0, status: 'active' });
    const state = publicState(round);
    io.emit('estado_actual', state);
    ack?.({ ok: true, state });
    await persist(round);
  });

  // ----------------------------- ADMIN -----------------------------
  socket.on('admin_abrir_ronda', async ({ key, config } = {}, ack) => {
    if (key !== ADMIN_KEY) return ack?.({ ok: false, error: 'no_autorizado' });
    round = newRound(config || {});
    await persist(round);
    io.emit('ronda_iniciada', publicState(round));
    broadcastState();
    ack?.({ ok: true, state: publicState(round) });
  });

  socket.on('admin_cerrar_ronda', async ({ key } = {}, ack) => {
    if (key !== ADMIN_KEY) return ack?.({ ok: false, error: 'no_autorizado' });
    if (!round) return ack?.({ ok: false, error: 'sin_ronda' });
    round.open = false;
    round.winnerId = rankedSongs(round)[0]?.id || null;
    await persist(round);
    io.emit('ronda_concluida', { state: publicState(round), winnerId: round.winnerId });
    ack?.({ ok: true, winnerId: round.winnerId });
  });

  socket.on('admin_reset', async ({ key } = {}, ack) => {
    if (key !== ADMIN_KEY) return ack?.({ ok: false, error: 'no_autorizado' });
    round = newRound();
    await persist(round);
    broadcastState();
    ack?.({ ok: true, state: publicState(round) });
  });
});

// ---------------------------------------------------------------------------
//  REST auxiliar
// ---------------------------------------------------------------------------
app.get('/api/estado', (req, res) => res.json(publicState(round)));
app.get('/api/health', (req, res) => res.json({ ok: true, db: isDbEnabled(), round: round?.id || null }));

// Landing informativo -> public/index.html (servido por express.static)
// La experiencia de votacion en vivo vive en /arcade
app.get('/arcade', (req, res) => res.sendFile(path.join(__dirname, 'public', 'arcade.html')));

app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tv.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/artist', (req, res) => res.sendFile(path.join(__dirname, 'public', 'artist.html')));
app.get('/artista', (req, res) => res.sendFile(path.join(__dirname, 'public', 'artist.html')));

// ---------------------------------------------------------------------------
//  ARRANQUE
// ---------------------------------------------------------------------------
async function boot() {
  await connectDB();
  if (isDbEnabled()) {
    try {
      const last = await RoundModel.findOne({}).sort({ createdAt: -1 });
      if (last) {
        round = {
          id: last.id, cycle: last.cycle || 0, title: last.title, nextShow: last.nextShow,
          open: last.open, winnerId: last.winnerId,
          songs: last.songs.map(s => ({ id: s.id, title: s.title, artist: s.artist, votes: s.votes, status: s.status || 'active' })),
          voters: new Set(last.voters || []),
          createdAt: last.createdAt?.getTime() || Date.now()
        };
        console.log(`[boot] ronda restaurada: ${round.id}`);
      }
    } catch (e) { console.error('[boot] restore error:', e.message); }
  }
  if (!round) round = newRound();

  server.listen(PORT, () => {
    console.log(`\n  VERTIGO BAR  ->  http://localhost:${PORT}`);
    console.log(`  Home    : http://localhost:${PORT}/`);
    console.log(`  Arcade  : http://localhost:${PORT}/arcade`);
    console.log(`  TV      : http://localhost:${PORT}/tv`);
    console.log(`  Artista : http://localhost:${PORT}/artista  (key: ${ARTIST_KEY})`);
    console.log(`  Admin   : http://localhost:${PORT}/admin    (key: ${ADMIN_KEY})`);
    console.log(`  DB      : ${isDbEnabled() ? 'MongoDB conectada' : 'en memoria (sin Mongo)'}\n`);
  });
}

boot();
