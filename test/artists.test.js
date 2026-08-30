// Pruebas unitarias del store de artistas (en memoria, sin Mongo).
// isDbEnabled() es false en test -> persist() es no-op, así que probamos
// la lógica pura de CRUD/validación sin base de datos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as artists from '../artists.js';

async function nuevoArtista(over = {}) {
  const r = await artists.createArtist({ name: 'Ana Test', category: 'musico', ...over });
  assert.ok(r.artist, `esperaba artista, obtuve ${JSON.stringify(r)}`);
  return r.artist;
}

test('createArtist valida nombre y categoría', async () => {
  assert.deepEqual(await artists.createArtist({ name: '', category: 'musico' }), { error: 'nombre_requerido' });
  assert.deepEqual(await artists.createArtist({ name: '   ', category: 'musico' }), { error: 'nombre_requerido' });
  assert.deepEqual(await artists.createArtist({ name: 'X', category: 'xx' }), { error: 'categoria_invalida' });
});

test('createArtist genera id, código de 6 dígitos y repertorio vacío', async () => {
  const a = await nuevoArtista({ name: 'DJ Sol', category: 'dj' });
  assert.ok(a.id);
  assert.match(a.code, /^\d{6}$/);
  assert.deepEqual(a.repertoire, []);
  assert.equal(a.category, 'dj');
});

test('normalizeHandle: quita @ inicial y recorta', async () => {
  const a = await nuevoArtista({ handle: '@@banda_luz' });
  assert.equal(a.handle, 'banda_luz');
  const b = await nuevoArtista({ handle: '  ' });
  assert.equal(b.handle, '');
});

test('findById / findByCode localizan y regeneran índice por código', async () => {
  const a = await nuevoArtista();
  assert.equal(artists.findById(a.id).id, a.id);
  assert.equal(artists.findByCode(a.code).id, a.id);
  assert.equal(artists.findByCode('  ' + a.code + ' ').id, a.id, 'debe tolerar espacios');
  assert.equal(artists.findById('noexiste'), null);
  assert.equal(artists.findByCode('000000'), null);
});

test('regenerateCode cambia el código y reindexa (el viejo deja de resolver)', async () => {
  const a = await nuevoArtista();
  const viejo = a.code;
  const r = await artists.regenerateCode(a.id);
  assert.ok(r.artist);
  assert.notEqual(r.artist.code, viejo);
  assert.equal(artists.findByCode(viejo), null);
  assert.equal(artists.findByCode(r.artist.code).id, a.id);
});

test('updateArtist edita nombre/handle y rechaza nombre vacío', async () => {
  const a = await nuevoArtista();
  const r = await artists.updateArtist(a.id, { name: 'Nuevo Nombre', handle: '@x' });
  assert.equal(r.artist.name, 'Nuevo Nombre');
  assert.equal(r.artist.handle, 'x');
  assert.deepEqual(await artists.updateArtist(a.id, { name: '   ' }), { error: 'nombre_requerido' });
  assert.deepEqual(await artists.updateArtist('noexiste', { name: 'z' }), { error: 'artista_invalido' });
});

test('addItem valida campos y agrega al repertorio', async () => {
  const a = await nuevoArtista({ category: 'musico' });
  assert.deepEqual(await artists.addItem(a.id, {}), { error: 'campos_invalidos' });
  const r = await artists.addItem(a.id, { title: 'Provenza', artist: 'Karol G' });
  assert.ok(r.item.id);
  assert.equal(r.item.title, 'Provenza');
  assert.equal(artists.findById(a.id).repertoire.length, 1);
  assert.deepEqual(await artists.addItem('noexiste', { title: 'x' }), { error: 'artista_invalido' });
});

test('updateItem y removeItem operan sobre ítems existentes', async () => {
  const a = await nuevoArtista();
  const { item } = await artists.addItem(a.id, { title: 'Tema 1' });
  const up = await artists.updateItem(a.id, item.id, { title: 'Tema Editado' });
  assert.equal(up.item.title, 'Tema Editado');
  assert.deepEqual(await artists.updateItem(a.id, 'noexiste', { title: 'x' }), { error: 'item_invalido' });

  const rm = await artists.removeItem(a.id, item.id);
  assert.ok(rm.artist);
  assert.equal(artists.findById(a.id).repertoire.length, 0);
  assert.deepEqual(await artists.removeItem(a.id, item.id), { error: 'item_invalido' });
});

test('deleteArtist elimina y desindexa código', async () => {
  const a = await nuevoArtista();
  assert.deepEqual(await artists.deleteArtist(a.id), { ok: true });
  assert.equal(artists.findById(a.id), null);
  assert.equal(artists.findByCode(a.code), null);
  assert.deepEqual(await artists.deleteArtist(a.id), { error: 'artista_invalido' });
});

test('publicArtist expone repertorio sin código; adminArtist expone código y conteo', async () => {
  const a = await nuevoArtista();
  await artists.addItem(a.id, { title: 'Uno' });
  const full = artists.findById(a.id);

  const pub = artists.publicArtist(full);
  assert.equal(pub.code, undefined);
  assert.ok(Array.isArray(pub.repertoire));

  const adm = artists.adminArtist(full);
  assert.equal(adm.code, full.code);
  assert.equal(adm.repertoireCount, 1);
  assert.equal(adm.repertoire, undefined);

  assert.equal(artists.publicArtist(null), null);
  assert.equal(artists.adminArtist(null), null);
});

test('códigos de artistas son únicos entre varias creaciones', async () => {
  const codigos = new Set();
  for (let i = 0; i < 30; i++) {
    const a = await nuevoArtista({ name: `Artista ${i}` });
    assert.equal(codigos.has(a.code), false, `código duplicado: ${a.code}`);
    codigos.add(a.code);
  }
});
