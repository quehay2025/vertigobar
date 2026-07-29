// Pruebas unitarias de la lógica de categorías (runner nativo node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES, CATEGORY_LIST, isValidCategory, getCategory, sanitizeItemFields
} from '../categories.js';

test('CATEGORY_LIST refleja todas las categorías con su id', () => {
  assert.equal(CATEGORY_LIST.length, Object.keys(CATEGORIES).length);
  for (const c of CATEGORY_LIST) {
    assert.ok(c.id && CATEGORIES[c.id], `id inválido: ${c.id}`);
    assert.ok(c.label && c.itemLabel && Array.isArray(c.fields));
  }
});

test('isValidCategory acepta categorías conocidas y rechaza el resto', () => {
  assert.equal(isValidCategory('musico'), true);
  assert.equal(isValidCategory('standup'), true);
  assert.equal(isValidCategory('dj'), true);
  assert.equal(isValidCategory('otro'), true);
  assert.equal(isValidCategory('inexistente'), false);
  assert.equal(isValidCategory(''), false);
  assert.equal(isValidCategory(undefined), false);
  // No debe confundirse con propiedades heredadas del prototipo.
  assert.equal(isValidCategory('toString'), false);
  assert.equal(isValidCategory('constructor'), false);
});

test('getCategory devuelve la config pedida o cae a "otro"', () => {
  assert.equal(getCategory('dj').label, CATEGORIES.dj.label);
  assert.equal(getCategory('desconocida'), CATEGORIES.otro);
  assert.equal(getCategory(undefined), CATEGORIES.otro);
});

test('sanitizeItemFields (músico): título obligatorio, artista/género opcionales', () => {
  const ok = sanitizeItemFields('musico', { title: 'Provenza', artist: 'Karol G', genre: 'Reggaetón' });
  assert.deepEqual(ok, { title: 'Provenza', artist: 'Karol G', genre: 'Reggaetón' });

  // Sin título -> null (campo requerido)
  assert.equal(sanitizeItemFields('musico', { artist: 'Karol G' }), null);

  // Título presente, opcionales ausentes -> se rellenan vacíos
  assert.deepEqual(
    sanitizeItemFields('musico', { title: 'Tacones Rojos' }),
    { title: 'Tacones Rojos', artist: '', genre: '' }
  );
});

test('sanitizeItemFields recorta espacios y aplica tope de longitud (120)', () => {
  const largo = 'x'.repeat(200);
  const out = sanitizeItemFields('musico', { title: `   ${largo}   ` });
  assert.equal(out.title.length, 120);
});

test('sanitizeItemFields (standup): sólo campo title, ignora extras', () => {
  const out = sanitizeItemFields('standup', { title: 'Divorcios', artist: 'no aplica' });
  assert.deepEqual(out, { title: 'Divorcios', artist: '', genre: '' });
  assert.equal(sanitizeItemFields('standup', {}), null);
});

test('sanitizeItemFields con categoría inválida usa esquema de "otro"', () => {
  const out = sanitizeItemFields('categoria_rara', { title: 'Ronda de preguntas' });
  assert.deepEqual(out, { title: 'Ronda de preguntas', artist: '', genre: '' });
});

test('sanitizeItemFields tolera title no-string y valores nulos', () => {
  assert.equal(sanitizeItemFields('musico', { title: null }), null);
  const out = sanitizeItemFields('musico', { title: 12345 });
  assert.equal(out.title, '12345');
});
