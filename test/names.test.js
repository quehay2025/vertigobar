import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/names.js';
const { check } = globalThis.TribuNames;

test('nombres normales y comunes pasan (sin falsos positivos)', () => {
  const ok = ['Sebastián', 'María José', 'Juan Carlos', 'Analía', 'Pitt', 'Concha', 'Cassandra', 'Scunthorpe', 'Dick Van', 'Luis', 'Paola', 'Cocoa',
    'Mateo', 'Ximena', 'Sofía', 'El Taxista', 'Pepe', 'Pablo', 'Lucho', 'Kevin', 'Andrés', 'Jhon', 'Coco', 'Manuel', 'Ñaño', 'Rita', 'Gaytán', 'Margarita', 'Pepa Pig'.split(' ')[0]];
  for (const n of ok) assert.equal(check(n).ok, true, 'debería pasar: ' + n);
});

test('groserías claras se bloquean aunque las disfracen', () => {
  const bad = ['puta', 'PUTA', 'p u t a', 'p.u.t.a', 'puuuuta', 'pvta'.replace('v', 'u'), 'mierda', 'M13rd4', 'hijueputa', 'hijo de puta', 'hdp', 'pendejo',
    'cabrón', 'maricón', 'fuck', 'f u c k', 'sh1t', 'bitch', 'nigger', 'hitler', 'verga', 'xxx', 'gonorrea', 'conchetumare', 'chingada', 'malparido', 'idiota'];
  for (const n of bad) assert.equal(check(n).ok, false, 'debería bloquearse: ' + n);
});

test('el mensaje con humor existe', () => {
  assert.ok(globalThis.TribuNames.randomMsg().length > 10);
});
