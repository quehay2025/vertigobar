// Un artista que ya creó su perfil vuelve a entrar (también tras reiniciar el servidor)
// y encuentra su repertorio para seguir editándolo. Usa una base MongoDB simulada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArtistModel, __setDbEnabledForTests } from '../db.js';

const store = new Map();   // simula la colección 'artists'
ArtistModel.findOneAndUpdate = async (q, doc) => { store.set(q.id, JSON.parse(JSON.stringify(doc))); return doc; };
ArtistModel.find = async () => [...store.values()].map(d => ({ ...d, createdAt: new Date(d.createdAt), updatedAt: new Date(d.updatedAt) }));
ArtistModel.deleteOne = async q => { store.delete(q.id); return { deletedCount: 1 }; };
__setDbEnabledForTests(true);

test('el repertorio sobrevive a un reinicio y se puede seguir editando', async () => {
  const a1 = await import('../artists.js?sesion=1');
  const { artist } = await a1.createArtist({ name: 'DJ Tribal', handle: '@djt', category: 'dj' });
  for (const g of ['Reggaetón', 'Salsa', 'Rock']) await a1.addItem(artist.id, { title: g });
  const code = artist.code;

  // ---- reinicio del servidor: módulo nuevo, memoria vacía, restaura desde la base
  const a2 = await import('../artists.js?sesion=2');
  assert.equal(a2.findByCode(code), null, 'antes de restaurar la memoria está vacía');
  await a2.restoreFromDB();
  const back = a2.findByCode(code);
  assert.ok(back, 'el artista vuelve a entrar con el mismo código');
  assert.equal(back.name, 'DJ Tribal');
  assert.deepEqual(back.repertoire.map(i => i.title), ['Reggaetón', 'Salsa', 'Rock']);

  // ---- sigue editando: renombrar, borrar y agregar
  const salsa = back.repertoire[1];
  await a2.updateItem(back.id, salsa.id, { title: 'Salsa Dura' });
  await a2.removeItem(back.id, back.repertoire[0].id);
  await a2.addItem(back.id, { title: 'Cumbia' });

  // ---- segundo reinicio: los cambios también quedaron guardados
  const a3 = await import('../artists.js?sesion=3');
  await a3.restoreFromDB();
  const again = a3.findByCode(code);
  assert.deepEqual(again.repertoire.map(i => i.title), ['Salsa Dura', 'Rock', 'Cumbia']);
});

test('cambiar el código invalida el anterior y el nuevo sigue funcionando tras reiniciar', async () => {
  const a1 = await import('../artists.js?sesion=4');
  const { artist } = await a1.createArtist({ name: 'Banda X', category: 'musico' });
  const old = artist.code;
  await a1.addItem(artist.id, { title: 'Tema 1' });
  const { artist: upd } = await a1.regenerateCode(artist.id);
  const a2 = await import('../artists.js?sesion=5');
  await a2.restoreFromDB();
  assert.equal(a2.findByCode(old), null);
  assert.equal(a2.findByCode(upd.code).repertoire.length, 1);
});
