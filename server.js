import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import { connectDB, RoundModel, isDbEnabled } from './db.js';
import * as artists from './artists.js';
import { getCategory, sanitizeItemFields } from './categories.js';
import './public/names.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Orígenes web permitidos para conectarse al tiempo real (además del propio sitio).
// ALLOWED_ORIGINS="https://arcade.tribugastropub.com,https://tribugastropub.com"
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  'https://arcade.tribugastropub.com,https://tribugastropub.com,https://www.tribugastropub.com')
  .split(',').map(s => s.trim()).filter(Boolean);
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;                                   // apps/herramientas sin navegador
  try { if (new URL(origin).host === req.headers.host) return true; } catch { return false; }
  return ALLOWED_ORIGINS.includes(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin);
}
const io = new Server(server, {
  cors: { origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin)) },
  allowRequest: (req, cb) => cb(null, originAllowed(req)),
  maxHttpBufferSize: 1e5
});

// Encabezados de seguridad
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"
  ].join('; '));
  if (req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'tribu-admin';

// Cada dispositivo (clientId) puede votar una vez por ventana de tiempo,
// sin importar de qué ítem/ciclo/ronda se trate (mantiene a la gente
// participando toda la noche, en vez de "un voto y listo"). 1 minuto.
const VOTE_COOLDOWN_MS = 60 * 1000;

// ---------------------------------------------------------------------------
//  ESTADO EN MEMORIA (fuente de verdad para tiempo real; Mongo persiste)
// ---------------------------------------------------------------------------
// Ronda: la votación es continua durante toda la noche, no hay "un ganador".
// Cuando un ítem se marca cumplido sus votos se reinician a 0 (cae al fondo
// del mismo ranking) pero sigue votable — la gente puede pedirlo de nuevo.
//   { id, cycle, title, open, createdAt,
//     artistId, artistName, category,
//     items: [{ id, title, artist, genre, votes }] }
let round = null;

// clientId -> timestamp (ms) del último voto. Vive fuera de `round` para que
// el cooldown no se reinicie al cambiar de ciclo, tema o artista en vivo.
const cooldowns = new Map();
// Anti votos inventados: una conexión solo puede votar con UN clientId, y cada IP
// tiene un tope de votos por minuto y de identidades nuevas por rato (el wifi del
// local comparte IP: topes pensados para un aforo de ~117 personas con margen).
const IP_VOTES_PER_MIN = 200, IP_NEW_IDS_PER_10MIN = 250;
const ipVotes = new Map();   // ip -> [timestamps]
const ipIds = new Map();     // ip -> Map(clientId -> ts)
setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of ipVotes) { const f = arr.filter(ts => now - ts < 60000); f.length ? ipVotes.set(ip, f) : ipVotes.delete(ip); }
  for (const [ip, m] of ipIds) { for (const [id, ts] of m) if (now - ts > 600000) m.delete(id); if (!m.size) ipIds.delete(ip); }
}, 30 * 1000).unref();
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

// ---------------------------------------------------------------------------
//  AUTENTICACIÓN con límite de intentos fallidos (anti fuerza bruta)
//  Se cuentan por IP (la última del encabezado X-Forwarded-For, que es la que
//  agrega el proxy de confiable de Render). 15 fallos en 5 min bloquean esa IP
//  5 min. Ojo: en el wifi del local todos comparten IP, por eso el margen es amplio.
// ---------------------------------------------------------------------------
const MAX_FAILS = 15, FAIL_WINDOW_MS = 5 * 60 * 1000;
const authFails = new Map();   // ip -> [timestamps]
function ipOf(socket) {
  const xf = socket.handshake.headers['x-forwarded-for'];
  if (xf) { const parts = String(xf).split(',').map(s => s.trim()).filter(Boolean); if (parts.length) return parts[parts.length - 1]; }
  return socket.handshake.address || 'x';
}
function recentFails(ip) {
  const now = Date.now();
  const arr = (authFails.get(ip) || []).filter(ts => now - ts < FAIL_WINDOW_MS);
  if (arr.length) authFails.set(ip, arr); else authFails.delete(ip);
  return arr;
}
const isLocked = socket => recentFails(ipOf(socket)).length >= MAX_FAILS;
function registerFail(socket) { const ip = ipOf(socket); recentFails(ip); const a = authFails.get(ip) || []; a.push(Date.now()); authFails.set(ip, a); }
setInterval(() => { for (const ip of [...authFails.keys()]) recentFails(ip); }, 60 * 1000).unref();
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

// ¿La clave de operador es correcta? (cuenta el fallo si se envió una clave equivocada)
function adminOk(socket, key) {
  if (key === undefined || key === null || key === '') return false;
  if (isLocked(socket)) return false;
  if (typeof key === 'string' && safeEqual(key, ADMIN_KEY)) return true;
  registerFail(socket); return false;
}
// ¿El código pertenece al artista que está en vivo ahora mismo?
function isRoundArtist(socket, code) {
  if (!code || typeof code !== 'string' || isLocked(socket)) return false;
  const artist = artists.findByCode(code);
  if (!artist) { registerFail(socket); return false; }
  return !!round && !!round.artistId && artist.id === round.artistId;
}
// Autoriza acciones sobre la RONDA EN VIVO (marcar cumplido, agregar ad-hoc)
function isRoundStaff(socket, { key, code } = {}) {
  return adminOk(socket, key) || isRoundArtist(socket, code);
}
// Autoriza acciones sobre el REPERTORIO de un artista puntual (propio código o staff)
function canManageArtist(socket, artist, { key, code } = {}) {
  if (adminOk(socket, key)) return true;
  if (!artist || !code || typeof code !== 'string' || isLocked(socket)) return false;
  if (safeEqual(artist.code, code)) return true;
  registerFail(socket); return false;
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
    artistId: artist.id,
    artistName: artist.name,
    category: artist.category,
    createdAt: Date.now(),
    items: artist.repertoire.map(it => ({
      id: it.id, title: it.title, artist: it.artist || '', genre: it.genre || '', votes: 0
    }))
  };
  return { round };
}

// Ranking, mayor a menor votos; desempata por id estable. Todos los ítems
// son siempre votables (no hay estado "retirado").
function rankedItems(r) {
  return [...r.items].sort((a, b) => b.votes - a.votes || a.id.localeCompare(b.id));
}
const totalVotes = r => r.items.reduce((acc, i) => acc + i.votes, 0);

// Payload publico
function publicState(r) {
  if (!r) return null;
  const total = totalVotes(r);
  return {
    id: r.id,
    cycle: r.cycle,
    title: r.title,
    open: r.open,
    artistId: r.artistId,
    artistName: r.artistName,
    category: r.category,
    total,
    items: rankedItems(r).map((it, i) => ({
      id: it.id, title: it.title, artist: it.artist, genre: it.genre, votes: it.votes,
      rank: i + 1,
      pct: total > 0 ? Math.round((it.votes / total) * 100) : 0
    }))
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
        open: r.open,
        artistId: r.artistId, artistName: r.artistName, category: r.category,
        items: r.items.map(i => ({ id: i.id, title: i.title, artist: i.artist, genre: i.genre, votes: i.votes })),
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
// Red de seguridad: un mensaje mal formado nunca debe tumbar el servidor en pleno show.
process.on('uncaughtException', e => console.error('[uncaughtException]', e));
process.on('unhandledRejection', e => console.error('[unhandledRejection]', e));
const FREE_ARG_EVENTS = new Set(['registrar_cliente', 'artista_login']);   // reciben un texto, no un objeto

io.on('connection', socket => {
  // Descarta cualquier mensaje cuyo contenido no sea un objeto (o texto en los eventos que lo piden)
  // Límite de ritmo por conexión: ráfaga de 60 mensajes, luego 20 por segundo
  let tokens = 60, tokAt = Date.now();
  socket.use((packet, next) => {
    const nowT = Date.now();
    tokens = Math.min(60, tokens + (nowT - tokAt) / 1000 * 20); tokAt = nowT;
    if (tokens < 1) {
      const ackFn = packet[packet.length - 1];
      if (typeof ackFn === 'function') ackFn({ ok: false, error: 'demasiados_mensajes' });
      return;
    }
    tokens -= 1;
    next();
  });
  socket.use((packet, next) => {
    const [event, arg] = packet;
    const isObj = arg !== null && typeof arg === 'object' && !Array.isArray(arg);
    if (FREE_ARG_EVENTS.has(event)) return next();
    if (arg === undefined || isObj) return next();
    const ackFn = packet[packet.length - 1];
    if (typeof ackFn === 'function') ackFn({ ok: false, error: 'campos_invalidos' });
    return;
  });
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
    if (!clientId || typeof clientId !== 'string' || clientId.length > 64) return ack?.({ ok: false, error: 'sin_id' });
    if (typeof itemId !== 'string') return ack?.({ ok: false, error: 'item_invalido' });
    const now = Date.now();
    if (socket.data.cid && socket.data.cid !== clientId) return ack?.({ ok: false, error: 'sin_id' });
    const last = cooldowns.get(clientId);
    if (last && now - last < VOTE_COOLDOWN_MS) {
      return ack?.({ ok: false, error: 'en_espera', retryAt: last + VOTE_COOLDOWN_MS });
    }
    {
      const ip = ipOf(socket);
      const recent = (ipVotes.get(ip) || []).filter(ts => now - ts < 60000);
      let ids = ipIds.get(ip); if (!ids) { ids = new Map(); ipIds.set(ip, ids); }
      if (recent.length >= IP_VOTES_PER_MIN || (!ids.has(clientId) && ids.size >= IP_NEW_IDS_PER_10MIN)) {
        return ack?.({ ok: false, error: 'demasiados_votos', retryAt: now + 30000 });
      }
      recent.push(now); ipVotes.set(ip, recent); ids.set(clientId, now);
      socket.data.cid = clientId;
    }
    const item = round.items.find(i => i.id === itemId);
    if (!item) return ack?.({ ok: false, error: 'item_invalido' });

    const prevTotal = totalVotes(round);
    const antes = rankedItems(round).map(i => i.id);

    // Contador sube al instante
    item.votes += 1;
    cooldowns.set(clientId, now);

    const despues = rankedItems(round).map(i => i.id);
    const state = publicState(round);
    ack?.({ ok: true, itemId, retryAt: now + VOTE_COOLDOWN_MS });

    // Nombre ofensivo: el voto cuenta, pero el nombre nunca sale en la pantalla
    let shownName = typeof name === 'string' ? name.trim().slice(0, 18) : null;
    if (shownName && !globalThis.TribuNames.check(shownName).ok) shownName = null;
    io.emit('voto_recibido', { itemId, name: shownName || null, itemTitle: item.title, state });

    // Empate
    const cuenta = {};
    let empate = false;
    for (const i of round.items) {
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
  // El artista ya lo interpretó: sus votos se reinician a 0 (cae al fondo del
  // mismo ranking, sigue votable toda la noche) y dispara la celebración en
  // la TV. Esto se repite cada vez que algo llega a #1 y se interpreta -
  // no hay "un solo ganador de la noche".
  socket.on('marcar_cumplido', async ({ key, code, itemId } = {}, ack) => {
    if (!isRoundStaff(socket, { key, code })) return ack?.({ ok: false, error: 'no_autorizado' });
    if (!round) return ack?.({ ok: false, error: 'sin_ronda' });
    const item = round.items.find(i => i.id === itemId);
    if (!item) return ack?.({ ok: false, error: 'item_invalido' });

    const votesAlCumplirse = item.votes;   // para mostrar en la celebración
    item.votes = 0;                        // se reinicia, cae al fondo del ranking
    round.cycle += 1;

    const state = publicState(round);
    io.emit('tema_cumplido', {
      itemId, title: item.title, artist: item.artist, genre: item.genre,
      votes: votesAlCumplirse, state
    });
    ack?.({ ok: true, state });
    await persist(round);
  });

  // -------------------- ARTISTA/STAFF: agregar ítem ad-hoc a la ronda --------------------
  // Solo afecta la ronda de esta noche; NO se guarda en el repertorio permanente
  // (para eso está artista_agregar_item).
  socket.on('agregar_tema', async ({ key, code, title, artist, genre } = {}, ack) => {
    if (!isRoundStaff(socket, { key, code })) return ack?.({ ok: false, error: 'no_autorizado' });
    if (!round) return ack?.({ ok: false, error: 'sin_ronda' });
    if (round.items.length >= artists.MAX_REPERTOIRE) return ack?.({ ok: false, error: 'repertorio_lleno' });
    const clean = sanitizeItemFields(round.category, { title, artist, genre });
    if (!clean) return ack?.({ ok: false, error: 'campos_invalidos' });
    round.items.push({ id: nanoid(6), ...clean, votes: 0 });
    const state = publicState(round);
    io.emit('estado_actual', state);
    ack?.({ ok: true, state });
    await persist(round);
  });

  // ----------------------- ARTISTA: login por código -----------------------
  socket.on('artista_login', (code, ack) => {
    if (isLocked(socket)) return ack?.({ ok: false, error: 'demasiados_intentos' });
    const artist = typeof code === 'string' ? artists.findByCode(code) : null;
    if (!artist) { registerFail(socket); return ack?.({ ok: false, error: 'codigo_invalido' }); }
    ack?.({ ok: true, artist: artists.publicArtist(artist) });
  });

  // ----------------- ARTISTA/STAFF: repertorio persistente -----------------
  socket.on('artista_agregar_item', async ({ artistId, key, code, fields } = {}, ack) => {
    const artist = artists.findById(artistId);
    if (!canManageArtist(socket, artist, { key, code })) return ack?.({ ok: false, error: 'no_autorizado' });
    const result = await artists.addItem(artistId, fields || {});
    if (result.error) return ack?.({ ok: false, error: result.error });
    // Si este artista está en vivo ahora mismo, el ítem nuevo entra también a la ronda.
    if (round && round.artistId === artistId) {
      round.items.push({
        id: result.item.id, title: result.item.title, artist: result.item.artist,
        genre: result.item.genre, votes: 0
      });
      io.emit('estado_actual', publicState(round));
      await persist(round);
    }
    ack?.({ ok: true, artist: artists.publicArtist(result.artist) });
  });

  socket.on('artista_editar_item', async ({ artistId, itemId, key, code, fields } = {}, ack) => {
    const artist = artists.findById(artistId);
    if (!canManageArtist(socket, artist, { key, code })) return ack?.({ ok: false, error: 'no_autorizado' });
    const result = await artists.updateItem(artistId, itemId, fields || {});
    if (result.error) return ack?.({ ok: false, error: result.error });
    // Si este artista está en vivo, el cambio se refleja ya en la ronda (conserva los votos)
    if (round && round.artistId === artistId) {
      const live = round.items.find(i => i.id === itemId);
      if (live) {
        live.title = result.item.title; live.artist = result.item.artist; live.genre = result.item.genre;
        io.emit('estado_actual', publicState(round));
        await persist(round);
      }
    }
    ack?.({ ok: true, artist: artists.publicArtist(result.artist) });
  });

  socket.on('artista_eliminar_item', async ({ artistId, itemId, key, code } = {}, ack) => {
    const artist = artists.findById(artistId);
    if (!canManageArtist(socket, artist, { key, code })) return ack?.({ ok: false, error: 'no_autorizado' });
    const result = await artists.removeItem(artistId, itemId);
    if (result.error) return ack?.({ ok: false, error: result.error });
    // Si este artista está en vivo, también sale de la votación
    if (round && round.artistId === artistId) {
      const before = round.items.length;
      round.items = round.items.filter(i => i.id !== itemId);
      if (round.items.length !== before) {
        io.emit('estado_actual', publicState(round));
        await persist(round);
      }
    }
    ack?.({ ok: true, artist: artists.publicArtist(result.artist) });
  });

  // ----------------------------- ADMIN: artistas -----------------------------
  socket.on('admin_crear_artista', async ({ key, name, handle, category } = {}, ack) => {
    if (!adminOk(socket, key)) return ack?.({ ok: false, error: 'no_autorizado' });
    const result = await artists.createArtist({ name, handle, category });
    if (result.error) return ack?.({ ok: false, error: result.error });
    ack?.({ ok: true, artist: artists.adminArtist(result.artist) });
  });

  socket.on('admin_editar_artista', async ({ key, artistId, name, handle } = {}, ack) => {
    if (!adminOk(socket, key)) return ack?.({ ok: false, error: 'no_autorizado' });
    const result = await artists.updateArtist(artistId, { name, handle });
    if (result.error) return ack?.({ ok: false, error: result.error });
    ack?.({ ok: true, artist: artists.adminArtist(result.artist) });
  });

  socket.on('admin_listar_artistas', ({ key } = {}, ack) => {
    if (!adminOk(socket, key)) return ack?.({ ok: false, error: 'no_autorizado' });
    ack?.({ ok: true, artists: artists.listArtists().map(a => artists.adminArtist(a)) });
  });

  // Trae el perfil completo (incluye repertorio) para que el operador pueda
  // ver/editar el repertorio de cualquier artista desde /admin.
  socket.on('admin_ver_artista', ({ key, artistId } = {}, ack) => {
    if (!adminOk(socket, key)) return ack?.({ ok: false, error: 'no_autorizado' });
    const artist = artists.findById(artistId);
    if (!artist) return ack?.({ ok: false, error: 'artista_invalido' });
    ack?.({ ok: true, artist: artists.publicArtist(artist) });
  });

  socket.on('admin_regenerar_codigo_artista', async ({ key, artistId } = {}, ack) => {
    if (!adminOk(socket, key)) return ack?.({ ok: false, error: 'no_autorizado' });
    const result = await artists.regenerateCode(artistId);
    if (result.error) return ack?.({ ok: false, error: result.error });
    ack?.({ ok: true, artist: artists.adminArtist(result.artist) });
  });

  socket.on('admin_eliminar_artista', async ({ key, artistId } = {}, ack) => {
    if (!adminOk(socket, key)) return ack?.({ ok: false, error: 'no_autorizado' });
    const result = await artists.deleteArtist(artistId);
    if (result.error) return ack?.({ ok: false, error: result.error });
    ack?.({ ok: true });
  });

  // ----------------------------- ADMIN: ronda -----------------------------
  socket.on('admin_iniciar_ronda_artista', async ({ key, artistId, title } = {}, ack) => {
    if (!adminOk(socket, key)) return ack?.({ ok: false, error: 'no_autorizado' });
    const result = newRound({ artistId, title });
    if (result.error) return ack?.({ ok: false, error: result.error });
    round = result.round;
    await persist(round);
    io.emit('ronda_iniciada', publicState(round));
    broadcastState();
    ack?.({ ok: true, state: publicState(round) });
  });

  // Detiene la votación por ahora (ej. cierre de la noche, cambio de artista).
  // Ya no hay "ganador" que declarar: la votación es continua, sin final.
  socket.on('admin_cerrar_ronda', async ({ key } = {}, ack) => {
    if (!adminOk(socket, key)) return ack?.({ ok: false, error: 'no_autorizado' });
    if (!round) return ack?.({ ok: false, error: 'sin_ronda' });
    round.open = false;
    await persist(round);
    io.emit('ronda_concluida', { state: publicState(round) });
    ack?.({ ok: true });
  });

  // Reinicia los votos de la ronda actual (mismo artista/ítems), sin re-elegirla
  socket.on('admin_reset', async ({ key } = {}, ack) => {
    if (!adminOk(socket, key)) return ack?.({ ok: false, error: 'no_autorizado' });
    if (!round) return ack?.({ ok: false, error: 'sin_ronda' });
    round.items.forEach(i => { i.votes = 0; });
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
    if (!adminOk(socket, key)) return ack?.({ ok: false, error: 'no_autorizado' });
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
    if (!adminOk(socket, key)) return ack?.({ ok: false, error: 'no_autorizado' });
    if (!nextShowInfo || !nextShowInfo.targetAt) return ack?.({ ok: false, error: 'sin_horario' });
    const add = Number(minutes) || 0;
    nextShowInfo = { ...nextShowInfo, targetAt: nextShowInfo.targetAt + add * 60000 };
    io.emit('proximo_show_actualizado', nextShowInfo);
    ack?.({ ok: true, nextShowInfo });
  });

  socket.on('admin_borrar_next_show', ({ key } = {}, ack) => {
    if (!adminOk(socket, key)) return ack?.({ ok: false, error: 'no_autorizado' });
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

// Portada: landing "Proximamente" (public/index.html, via express.static)
// La experiencia de votacion en vivo cuelga de /arcade -> /vota
app.get('/arcade', (req, res) => res.sendFile(path.join(__dirname, 'public', 'arcade.html')));

app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tv.html')));
app.get('/tv2', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tv2.html')));
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
          open: last.open,
          artistId: last.artistId || null, artistName: last.artistName || '', category: last.category || 'otro',
          items: (last.items || []).map(i => ({
            id: i.id, title: i.title, artist: i.artist || '', genre: i.genre || '', votes: i.votes
          })),
          createdAt: last.createdAt?.getTime() || Date.now()
        };
        console.log(`[boot] ronda restaurada: ${round.id}`);
      }
    } catch (e) { console.error('[boot] restore error:', e.message); }
  }

  server.listen(PORT, () => {
    console.log(`\n  TRIBU GASTRO PUB  ->  http://localhost:${PORT}`);
    console.log(`  Inicio  : http://localhost:${PORT}/`);
    console.log(`  Cliente : http://localhost:${PORT}/vota`);
    console.log(`  TV      : http://localhost:${PORT}/tv`);
    console.log(`  Artista : http://localhost:${PORT}/artista  (código personal por artista)`);
    console.log(`  Admin   : http://localhost:${PORT}/admin    (key: ${ADMIN_KEY})`);
    console.log(`  DB      : ${isDbEnabled() ? 'MongoDB conectada' : 'en memoria (sin Mongo)'}\n`);
  });
}

boot();
