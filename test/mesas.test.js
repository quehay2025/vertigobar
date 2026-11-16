import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mesas from '../mesas.js';

test('parseKi acepta solo el formato esperado y descarta lo raro', () => {
  assert.equal(mesas.parseKi(null), null);
  assert.equal(mesas.parseKi({ mesas: 'x' }), null);
  const r = mesas.parseKi({ mesas: [
    { mesa: '12', total: 100.5 }, { mesa: 7, total: 3 },
    { mesa: '<script>', total: 5 }, { mesa: '5', total: -1 }, { mesa: '6', total: 'abc' },
    { mesa: '8', total: 1e12 }, null, 'x', { mesa: 'a'.repeat(30), total: 1 },
    { mesa: '9', total: 5, cliente: 'Juan Pérez', tarjeta: '4111' }
  ] });
  assert.deepEqual(r, [{ id: '12', total: 100.5 }, { id: '7', total: 3 }, { id: '9', total: 5 }]);
  assert.equal(mesas.parseKi({ mesas: Array.from({ length: 500 }, (_, i) => ({ mesa: String(i), total: 1 })) }).length, 60);
});

test('los enlaces firmados verifican y no se pueden falsificar', () => {
  const s = mesas.sign('12', 'secreto');
  assert.equal(s.length, 16);
  assert.equal(mesas.verify('12', s, 'secreto'), true);
  assert.equal(mesas.verify('13', s, 'secreto'), false);
  assert.equal(mesas.verify('12', s, 'otro-secreto'), false);
  assert.equal(mesas.verify('12', 'x'.repeat(16), 'secreto'), false);
  assert.equal(mesas.verify('12', null, 'secreto'), false);
  assert.equal(mesas.verify('../x', s, 'secreto'), false);
});

test('el nombre de mesa se limpia y bloquea groserías', () => {
  assert.equal(mesas.sanitizeName('Los  Duros').name, 'Los Duros');
  assert.equal(mesas.sanitizeName('<b>Fuego</b>').name, 'bFuego/b');
  assert.equal(mesas.sanitizeName('A'.repeat(80)).name.length, 20);
  assert.equal(mesas.sanitizeName('a').error, 'nombre_requerido');
  assert.equal(mesas.sanitizeName(123).error, 'nombre_requerido');
  assert.equal(mesas.sanitizeName('hijueputa').error, 'nombre_ofensivo');
});

test('el estado público solo trae porcentajes, nunca el total real', () => {
  mesas.apply([{ id: '1', total: 250 }, { id: '2', total: 500 }, { id: '3', total: 0 }]);
  const pub = mesas.publicMesas();
  assert.deepEqual(pub.map(m => [m.id, m.pct, m.rank]), [['2', 100, 1], ['1', 50, 2]]);
  assert.ok(!JSON.stringify(pub).includes('500') && !JSON.stringify(pub).includes('250'));
  const { newLeader } = mesas.apply([{ id: '1', total: 900 }, { id: '2', total: 500 }]);
  assert.equal(newLeader.id, '1');
});

test('fetchKi manda la llave, valida y rechaza respuestas malas', async () => {
  let seen;
  const ok = async (url, o) => { seen = o.headers.Authorization; return { ok: true, text: async () => JSON.stringify({ mesas: [{ mesa: '1', total: 5 }] }) }; };
  assert.deepEqual(await mesas.fetchKi({ url: 'https://ki.example/api', key: 'K', fetchImpl: ok }), [{ id: '1', total: 5 }]);
  assert.equal(seen, 'Bearer K');
  await assert.rejects(mesas.fetchKi({ url: 'http://ki.example/api', key: 'K', fetchImpl: ok }), /https/);
  await assert.rejects(mesas.fetchKi({ url: 'https://ki.example', key: 'K', fetchImpl: async () => ({ ok: false, status: 401 }) }), /401/);
  await assert.rejects(mesas.fetchKi({ url: 'https://ki.example', key: 'K', fetchImpl: async () => ({ ok: true, text: async () => 'x'.repeat(300000) }) }), /grande/);
  await assert.rejects(mesas.fetchKi({ url: 'https://ki.example', key: 'K', fetchImpl: async () => ({ ok: true, text: async () => '{"otra":1}' }) }), /formato/);
  await assert.rejects(mesas.fetchKi({ url: 'https://ki.example', key: 'K', fetchImpl: async () => ({ ok: true, text: async () => 'no es json' }) }));
});
