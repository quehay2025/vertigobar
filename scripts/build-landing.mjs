/* =========================================================================
   Arma dist/ con el landing estático — los únicos archivos que el sitio
   "Próximamente" necesita. Va a un Static Site de Render, que no se apaga.
   Todo lo demás (votación, TV, admin) sigue en el servicio Node, porque
   necesita WebSockets y base de datos.
   ========================================================================= */
import { mkdir, copyFile, rm, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

// Solo lo que referencia index.html: nada de vota.html, tv.html ni client.js
const ASSETS = [
  'index.html',
  'home.css',
  'home.js',
  'img/logo.png',
  'img/local.jpg'
];

// A dónde se manda a quien llegue con un enlace o QR viejo del dominio raíz.
// Se sobreescribe con ARCADE_ORIGIN si algún día cambia el subdominio.
const ARCADE = process.env.ARCADE_ORIGIN || 'https://arcade.vertigogastropub.com';

const REDIRECTS = ['vota', 'votar', 'arcade', 'tv', 'admin', 'artist', 'artista']
  .map(r => `/${r}    ${ARCADE}/${r}    302`)
  .join('\n');

await rm(dist, { recursive: true, force: true });

for (const rel of ASSETS) {
  const to = path.join(dist, rel);
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(path.join(root, 'public', rel), to);
}

// Los QR ya impresos apuntan al dominio raíz: que sigan funcionando.
await writeFile(path.join(dist, '_redirects'), REDIRECTS + '\n');

let total = 0;
for (const rel of ASSETS) total += (await stat(path.join(dist, rel))).size;
console.log(`landing listo en dist/ — ${ASSETS.length} archivos, ${(total / 1024).toFixed(0)} KB`);
console.log(`redirecciones -> ${ARCADE}`);
