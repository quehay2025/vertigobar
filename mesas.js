// =============================================================================
//  TRIBU GASTRO PUB, Dinámica "La mesa reina"
//  Lee de la app KI (solo lectura, de servidor a servidor) qué mesa consume más
//  y deja que cada mesa se ponga nombre con un enlace firmado.
//
//  Contrato esperado de la API de KI (GET KI_API_URL, Authorization: Bearer KI_API_KEY):
//    { "mesas": [ { "mesa": "12", "total": 134.5 }, ... ] }
//  Solo mesa y total de la noche. Nada de clientes, pedidos ni datos de pago.
//  El total real NUNCA sale del servidor: a las pantallas solo llega el % frente a la líder.
// =============================================================================
import crypto from 'crypto';
import { MesaNameModel, isDbEnabled } from './db.js';
import './public/names.js';

export const ID_RE = /^[A-Za-z0-9_-]{1,12}$/;
const MAX_MESAS = 60;           // máximo de mesas que se aceptan de la API
const MAX_BODY = 200 * 1024;    // tope de tamaño de respuesta
export const TOP_N = 8;

const names = new Map();        // mesaId -> nombre elegido por la mesa
const nameAt = new Map();       // mesaId -> último cambio (límite de ritmo)
let totals = new Map();         // mesaId -> total (solo en servidor)
let leaderId = null;
let lastOkAt = 0, lastError = null;

// ------------------------------------------------------------- firmas de enlace
export function sign(id, secret) {
  return crypto.createHmac('sha256', secret).update('mesa:' + id).digest('hex').slice(0, 16);
}
export function verify(id, sig, secret) {
  if (typeof id !== 'string' || typeof sig !== 'string' || !ID_RE.test(id) || sig.length !== 16) return false;
  const a = Buffer.from(sign(id, secret)), b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ------------------------------------------------------------- nombres
export function sanitizeName(raw) {
  if (typeof raw !== 'string') return { error: 'nombre_requerido' };
  const clean = raw.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  if (clean.length < 2) return { error: 'nombre_requerido' };
  if (!globalThis.TribuNames.check(clean).ok) return { error: 'nombre_ofensivo' };
  return { name: clean };
}
export async function setName(id, raw) {
  if (!ID_RE.test(id)) return { error: 'mesa_invalida' };
  const now = Date.now();
  if (now - (nameAt.get(id) || 0) < 20000) return { error: 'demasiado_rapido' };
  const r = sanitizeName(raw);
  if (r.error) return r;
  names.set(id, r.name); nameAt.set(id, now);
  if (isDbEnabled()) {
    try { await MesaNameModel.findOneAndUpdate({ id }, { id, name: r.name }, { upsert: true }); }
    catch (e) { console.error('[mesas] persist error:', e.message); }
  }
  return { name: r.name };
}
export async function restoreNames() {
  if (!isDbEnabled()) return;
  try { for (const d of await MesaNameModel.find({})) if (ID_RE.test(d.id)) names.set(d.id, d.name); }
  catch (e) { console.error('[mesas] restore error:', e.message); }
}

// ------------------------------------------------------------- API de KI
// Valida estrictamente la respuesta: cualquier cosa rara se descarta.
export function parseKi(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.mesas)) return null;
  const out = [];
  for (const m of json.mesas.slice(0, MAX_MESAS)) {
    if (!m || typeof m !== 'object') continue;
    const id = String(m.mesa ?? '').trim();
    const total = Number(m.total);
    if (!ID_RE.test(id) || !Number.isFinite(total) || total < 0 || total > 1e9) continue;
    out.push({ id, total });
  }
  return out;
}

export async function fetchKi({ url, key, fetchImpl = fetch, timeoutMs = 5000 }) {
  const u = new URL(url);
  const local = ['localhost', '127.0.0.1'].includes(u.hostname);
  if (u.protocol !== 'https:' && !local) throw new Error('KI_API_URL debe ser https');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' }, signal: ctl.signal, redirect: 'error' });
    if (!res.ok) throw new Error('KI respondió HTTP ' + res.status);
    const text = await res.text();
    if (text.length > MAX_BODY) throw new Error('respuesta demasiado grande');
    const list = parseKi(JSON.parse(text));
    if (!list) throw new Error('formato inesperado');
    return list;
  } finally { clearTimeout(t); }
}

// Datos simulados para probar y mostrar la dinámica sin KI
let mock = null;
export function mockStep() {
  if (!mock) mock = new Map(Array.from({ length: 8 }, (_, i) => [String(i + 1), Math.round(Math.random() * 30)]));
  for (const [id, v] of mock) if (Math.random() < .7) mock.set(id, v + Math.round(Math.random() * 25));
  return [...mock].map(([id, total]) => ({ id, total }));
}

// ------------------------------------------------------------- estado público
export function publicMesas() {
  const list = [...totals].map(([id, total]) => ({ id, total })).filter(m => m.total > 0)
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
  const top = list[0]?.total || 0;
  return list.slice(0, TOP_N).map((m, i) => ({
    id: m.id, name: names.get(m.id) || '', label: names.get(m.id) || 'Mesa ' + m.id,
    pct: top ? Math.max(4, Math.round(m.total / top * 100)) : 0, rank: i + 1
  }));
}
export const health = () => ({ ok: lastOkAt > 0, lastOkAt, lastError });

// Aplica una lectura nueva. Devuelve { changed, newLeader }.
export function apply(list) {
  const before = JSON.stringify(publicMesas());
  totals = new Map(list.map(m => [m.id, m.total]));
  lastOkAt = Date.now(); lastError = null;
  const pub = publicMesas();
  const lead = pub[0]?.id || null;
  const newLeader = lead && lead !== leaderId && leaderId !== null ? pub[0] : null;
  leaderId = lead || leaderId;
  return { changed: JSON.stringify(pub) !== before, newLeader };
}
export function fail(e) { lastError = String(e && e.message || e).slice(0, 120); }
