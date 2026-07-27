# 🔥 VÉRTIGO BAR — Votación en vivo por artista y categoría

Sistema de votación en vivo con estética **arcade / HUD de Esports**. Cada artista tiene un
**perfil persistente** (con su propio repertorio) y el operador elige quién está en vivo esta
noche. Los clientes votan desde el móvil escaneando un QR; la pantalla del bar (TV 16:9)
muestra las barras en tiempo real con animaciones estilo videojuego (shockwave, sorpasso/turbo
drift, K.O. del ganador).

## Arquitectura

| Capa | Tecnología | Por qué |
|------|-----------|---------|
| Servidor | **Node + Express + Socket.io** | Un único proceso sirve el front y los WebSockets → latencia de milisegundos |
| Tiempo real | **Socket.io** | Eventos `voto_recibido`, `empate_detectado`, `rebase_ocurrido`, `ronda_concluida` |
| Persistencia | **MongoDB Atlas** (M0 gratis) — recomendado | Sin ella, los artistas/repertorios y la ronda se pierden en cada reinicio del servidor |
| Anti-spam | **clientId (nanoid) + LocalStorage** | Un voto por ciclo, sin registro de usuarios |
| Front | **HTML + CSS puro + SVG/Canvas ligero** | 60 FPS con `transform: translate3d` / `scale` / `opacity`. Sin Three.js ni vídeos |

## Categorías de artista

Al crear un artista se elige una categoría, y eso define qué campos se piden para su repertorio:

| Categoría | Campos del repertorio | Ejemplo |
|---|---|---|
| 🎵 Música / Banda | Título de canción (obligatorio) + Artista/Autor + Género | "Provenza" — Karol G — Reggaetón |
| 🎤 Stand-up / Comedia | Tema | "Divorcios" |
| 🎧 DJ | Género musical | "Reggaetón" |
| ⭐ Otro | Título / punto libre | cualquier dinámica futura sin tocar código |

La configuración vive en [`categories.js`](categories.js) (servidor) y su copia sincronizada a
mano [`public/categories.js`](public/categories.js) (browser).

## Vistas

- **`/`** — Vista Cliente (mobile-first): bienvenida + gamepad táctil con estados Normal /
  Presionado / Bloqueado. Se desbloquea solo cuando empieza un nuevo ciclo (ítem cumplido) o ronda.
- **`/tv`** — Pantalla del Bar (16:9): 70 % ranking en vivo con **fuego real por puesto**
  (naranja 1º, azul 2º, verde 3º); 30 % QR, artista en vivo y próximo show.
- **`/artista`** — Panel del artista: entra con su **código personal de 6 dígitos**, gestiona su
  repertorio de forma autónoma (agregar/editar/borrar) y, si es quien está en vivo, marca ítems
  como **✓ cumplidos** y los reactiva.
- **`/admin`** — Panel de operador (protegido por `ADMIN_KEY`): crear/borrar artistas y ver su
  código, elegir quién está en vivo para abrir la ronda, cerrar (K.O.) y reiniciar votos.

## Flujo de una noche

1. **Alta del artista (una sola vez):** desde `/admin`, el operador crea el perfil (nombre +
   categoría) y le entrega el código de 6 dígitos generado.
2. **El artista carga su repertorio** desde `/artista` con ese código — título+autor+género,
   temas o géneros según su categoría. Queda guardado para siempre; la próxima visita no hace
   falta volver a escribirlo.
3. **El operador elige quién está en vivo** en `/admin` → "Iniciar ronda" → selecciona el
   artista → su repertorio se copia a la votación de esta noche.
4. La gente vota desde el móvil; el contador sube **al instante** y el ranking se reordena en la
   TV con turbo drift cuando hay sorpasso.
5. El artista (o el operador) marca **✓ Ya lo hice** cuando termina un ítem: sale del ranking,
   sus puntos se reinician a 0 y pasa a "cumplidos" (para no repetirlo). El siguiente sube
   automáticamente a #1.
6. Si la gente quiere que se repita, el artista lo **reactiva** desde "Ya cumplidos" (vuelve al
   ranking con 0 puntos).
7. Al cerrar la ronda (K.O.), la TV congela el ranking y explota el ganador.

> **Próximo show:** desde `/admin`, independiente de la ronda activa, el operador define quién
> sigue con **hora exacta** o **minutos desde ahora** (switch en la tarjeta "Próximo show"). La
> TV muestra una cuenta regresiva en vivo; si el artista se retrasa, los botones **+10/+30 min**
> corrigen el horario sin tener que reescribirlo.

> **Anti-spam por tiempo, no por ronda:** cada dispositivo (`clientId` + LocalStorage) puede
> votar una vez cada 5 minutos (`VOTE_COOLDOWN_MS` en `server.js`), sin importar de qué
> tema/ciclo/artista se trate. Tras votar, el cliente ve una cuenta regresiva en vivo con un
> mensaje invitando a seguir consumiendo, y se desbloquea solo al llegar a 0 — así la gente
> vota durante toda la noche en vez de una sola vez. El nombre se guarda en el dispositivo, así
> que la próxima vez que entren no se les vuelve a pedir.

## Ejecutar en local

```bash
npm install
npm start          # http://localhost:3000
```

- Cliente: <http://localhost:3000/>
- TV: <http://localhost:3000/tv>
- Admin: <http://localhost:3000/admin> (clave por defecto `vertigo-admin`)
- Artista: <http://localhost:3000/artista> (con el código que le des desde `/admin`)

Copia `.env.example` a `.env` para configurar `ADMIN_KEY` y `MONGODB_URI`.

## Eventos de socket (contrato)

| Evento (server→cliente) | Dispara en la TV |
|---|---|
| `voto_recibido` | Latido `scale(1.05)` + partícula `+1` (shockwave) |
| `empate_detectado` | Badge "DUELO" en la barra igualada |
| `rebase_ocurrido` | Turbo drift: brillo dorado + desplazamiento fluido hacia arriba |
| `tema_cumplido` | Sello "✓ CUMPLIDO" verde + salida de la barra + reconstrucción del ranking |
| `tema_reactivado` | El ítem vuelve al ranking |
| `ronda_concluida` | Flashbang + perdedoras al 20 % + explosión del ganador (K.O.) |

**Acciones sobre la ronda en vivo (socket → servidor):** `marcar_cumplido`, `reactivar_tema`,
`agregar_tema` — autorizadas con `ADMIN_KEY` o el código del artista que está en vivo.

**Acciones sobre el repertorio de un artista:** `artista_login`, `artista_agregar_item`,
`artista_editar_item`, `artista_eliminar_item` — autorizadas con `ADMIN_KEY` o el código propio
del artista.

**Acciones de operador:** `admin_crear_artista`, `admin_listar_artistas`,
`admin_regenerar_codigo_artista`, `admin_eliminar_artista`, `admin_iniciar_ronda_artista`,
`admin_cerrar_ronda`, `admin_reset` — todas requieren `ADMIN_KEY`.

## Despliegue

> ⚠️ **Netlify no sirve para el servidor**: sus funciones son serverless y no mantienen
> conexiones WebSocket abiertas. Usa un host con proceso persistente.

**Render (recomendado, tier gratis):** incluye `render.yaml`. Sube el repo a GitHub →
Render → New → Blueprint. Define `ADMIN_KEY` y `MONGODB_URI` en el dashboard.

Alternativas equivalentes: Railway, Fly.io, o cualquier VPS con `node server.js`.

### MongoDB Atlas (recomendado, para no perder artistas/repertorios)
1. Crea un cluster **M0 (gratis)** en <https://cloud.mongodb.com>.
2. Crea usuario, permite acceso desde `0.0.0.0/0`.
3. Copia la cadena de conexión en `MONGODB_URI`.

### Dominio propio (vertigogastropub.com)
1. Despliega primero en Render (o el host que uses) y confirma que funciona en la URL temporal
   que te da (`*.onrender.com`).
2. En el dashboard del servicio → **Settings → Custom Domain** → agrega `vertigogastropub.com`
   (y `www.vertigogastropub.com` si lo usas).
3. Render te da un registro CNAME (o A/ALIAS para el dominio raíz) — cópialo en el panel DNS de
   donde compraste el dominio.
4. Espera la propagación DNS (minutos a horas) y Render emite el certificado HTTPS automáticamente.

## Rendimiento

- Todas las animaciones usan propiedades aceleradas por GPU (`translate3d`, `scaleX`, `opacity`).
- El rebase reposiciona las filas por `transform` (no por reflow del DOM) → transiciones fluidas.
- El confeti del K.O. es un canvas 2D ligero que se autodetiene a los ~8 s.
- Sin dependencias de render pesadas ni vídeos: seguro para móviles de gama media/baja y datos móviles.
