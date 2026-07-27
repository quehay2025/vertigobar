// =============================================================================
//  VÉRTIGO BAR — Store de artistas (perfiles + repertorio persistente)
//  Mismo patrón que el estado de `round` en server.js: fuente de verdad en
//  memoria para tiempo real, con persistencia opcional a Mongo si hay URI.
// =============================================================================
import { nanoid } from 'nanoid';
import { ArtistModel, isDbEnabled } from './db.js';
import { isValidCategory, sanitizeItemFields } from './categories.js';

const artistsById = new Map();
const idByCode = new Map();

function generateCode() {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (idByCode.has(code));
  return code;
}

function indexArtist(a) {
  artistsById.set(a.id, a);
  idByCode.set(a.code, a.id);
}

async function persist(artist) {
  if (!isDbEnabled()) return;
  try {
    await ArtistModel.findOneAndUpdate(
      { id: artist.id },
      {
        id: artist.id, name: artist.name, category: artist.category, code: artist.code,
        repertoire: artist.repertoire,
        createdAt: new Date(artist.createdAt), updatedAt: new Date(artist.updatedAt)
      },
      { upsert: true, new: true }
    );
  } catch (e) {
    console.error('[artists] persist error:', e.message);
  }
}

export async function restoreFromDB() {
  if (!isDbEnabled()) return;
  try {
    const docs = await ArtistModel.find({});
    for (const d of docs) {
      indexArtist({
        id: d.id, name: d.name, category: d.category, code: d.code,
        repertoire: (d.repertoire || []).map(i => ({ id: i.id, title: i.title, artist: i.artist || '', genre: i.genre || '' })),
        createdAt: d.createdAt?.getTime() || Date.now(),
        updatedAt: d.updatedAt?.getTime() || Date.now()
      });
    }
    if (docs.length) console.log(`[artists] ${docs.length} artista(s) restaurado(s)`);
  } catch (e) {
    console.error('[artists] restore error:', e.message);
  }
}

export function findById(id) {
  return artistsById.get(id) || null;
}

export function findByCode(code) {
  const id = idByCode.get(String(code || '').trim());
  return id ? artistsById.get(id) : null;
}

export function listArtists() {
  return [...artistsById.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export async function createArtist({ name, category }) {
  if (!name || !name.trim()) return { error: 'nombre_requerido' };
  if (!isValidCategory(category)) return { error: 'categoria_invalida' };
  const artist = {
    id: nanoid(10),
    name: name.trim().slice(0, 60),
    category,
    code: generateCode(),
    repertoire: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  indexArtist(artist);
  await persist(artist);
  return { artist };
}

export async function regenerateCode(artistId) {
  const artist = artistsById.get(artistId);
  if (!artist) return { error: 'artista_invalido' };
  idByCode.delete(artist.code);
  artist.code = generateCode();
  artist.updatedAt = Date.now();
  idByCode.set(artist.code, artist.id);
  await persist(artist);
  return { artist };
}

export async function deleteArtist(artistId) {
  const artist = artistsById.get(artistId);
  if (!artist) return { error: 'artista_invalido' };
  idByCode.delete(artist.code);
  artistsById.delete(artistId);
  if (isDbEnabled()) {
    try { await ArtistModel.deleteOne({ id: artistId }); }
    catch (e) { console.error('[artists] delete error:', e.message); }
  }
  return { ok: true };
}

export async function addItem(artistId, fields) {
  const artist = artistsById.get(artistId);
  if (!artist) return { error: 'artista_invalido' };
  const clean = sanitizeItemFields(artist.category, fields);
  if (!clean) return { error: 'campos_invalidos' };
  const item = { id: nanoid(6), ...clean };
  artist.repertoire.push(item);
  artist.updatedAt = Date.now();
  await persist(artist);
  return { artist, item };
}

export async function updateItem(artistId, itemId, fields) {
  const artist = artistsById.get(artistId);
  if (!artist) return { error: 'artista_invalido' };
  const item = artist.repertoire.find(i => i.id === itemId);
  if (!item) return { error: 'item_invalido' };
  const clean = sanitizeItemFields(artist.category, fields);
  if (!clean) return { error: 'campos_invalidos' };
  Object.assign(item, clean);
  artist.updatedAt = Date.now();
  await persist(artist);
  return { artist, item };
}

export async function removeItem(artistId, itemId) {
  const artist = artistsById.get(artistId);
  if (!artist) return { error: 'artista_invalido' };
  const idx = artist.repertoire.findIndex(i => i.id === itemId);
  if (idx === -1) return { error: 'item_invalido' };
  artist.repertoire.splice(idx, 1);
  artist.updatedAt = Date.now();
  await persist(artist);
  return { artist };
}

// Payload público para el propio artista (incluye repertorio completo, sin código)
export function publicArtist(a) {
  if (!a) return null;
  return { id: a.id, name: a.name, category: a.category, repertoire: a.repertoire, createdAt: a.createdAt };
}

// Payload para el panel de operador (incluye código, sin repertorio completo)
export function adminArtist(a) {
  if (!a) return null;
  return {
    id: a.id, name: a.name, category: a.category, code: a.code,
    repertoireCount: a.repertoire.length, createdAt: a.createdAt
  };
}
