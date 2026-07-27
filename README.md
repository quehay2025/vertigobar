# 🔥 VÉRTIGO BAR — Votación de canciones en tiempo real

Sistema de votación en vivo con estética **arcade / HUD de Esports**. Los clientes votan
desde el móvil escaneando un QR; la pantalla del bar (TV 16:9) muestra las barras en tiempo
real con animaciones estilo videojuego (shockwave, sorpasso/turbo drift, K.O. del ganador).

## Arquitectura

| Capa | Tecnología | Por qué |
|------|-----------|---------|
| Servidor | **Node + Express + Socket.io** | Un único proceso sirve el front y los WebSockets → latencia de milisegundos |
| Tiempo real | **Socket.io** | Eventos `voto_recibido`, `empate_detectado`, `rebase_ocurrido`, `ronda_concluida` |
| Persistencia | **MongoDB Atlas** (M0 gratis) — *opcional* | Si no hay `MONGODB_URI`, corre en memoria |
| Anti-spam | **clientId (nanoid) + LocalStorage** | Un voto por ronda, sin registro de usuarios |
| Front | **HTML + CSS puro + SVG/Canvas ligero** | 60 FPS con `transform: translate3d` / `scale` / `opacity`. Sin Three.js ni vídeos |

## Vistas

- **`/`** — Vista Cliente (mobile-first): bienvenida + gamepad táctil con estados Normal / Presionado / Bloqueado. Se desbloquea solo cuando empieza un nuevo ciclo (tema cumplido) o ronda.
- **`/tv`** — Pantalla del Bar (16:9): 70 % ranking en vivo con **fuego real por puesto** (naranja 1º, azul 2º, verde 3º) sobre fondo de velocidad; 30 % QR y datos del show.
- **`/artista`** — Panel del Artista / comediante: marca temas como **✓ cumplidos** (salen del ranking, sube el siguiente), reactiva temas y agrega nuevos (protegido por `ARTIST_KEY`).
- **`/admin`** — Panel de operador: abrir/cerrar rondas (K.O.), editar temas, reiniciar (protegido por `ADMIN_KEY`).

## Flujo del artista (el corazón de la interacción)

1. La gente vota temas desde el móvil; el contador sube **al instante** con cada voto.
2. El artista abre `/artista`, ve el ranking en vivo y, al terminar un tema, pulsa **✓ Ya lo hice**.
3. Ese tema **sale del ranking**, sus puntos se **reinician a 0** y pasa a la lista de "cumplidos" (para no repetirlo). El siguiente tema sube automáticamente a #1.
4. Empieza un **nuevo ciclo de votación**: todos los clientes se desbloquean y pueden votar de nuevo el siguiente tema.
5. Si la gente quiere que se repita un tema, el artista lo **reactiva** desde "Temas ya cumplidos" (vuelve al ranking con 0 puntos).

> El anti-spam ("un voto por ciclo") se controla con `clientId` (servidor) + LocalStorage, con clave `roundId:cycle`. Cuando el ciclo avanza, el cliente vuelve a estar habilitado.

## Ejecutar en local

```bash
npm install
npm start          # http://localhost:3000
```

- Cliente: <http://localhost:3000/>
- TV: <http://localhost:3000/tv>
- Admin: <http://localhost:3000/admin> (clave por defecto `vertigo-admin`)

Copia `.env.example` a `.env` para configurar `ADMIN_KEY` y `MONGODB_URI`.

## Flujo de operación (una noche)

1. Abre `/admin`, escribe la clave, edita las 4 canciones y pulsa **ABRIR RONDA**.
2. Proyecta `/tv` en la pantalla del bar. El QR apunta a la vista cliente.
3. La gente escanea, pone su nombre y vota (una vez por ronda).
4. Al terminar, pulsa **CERRAR (K.O.)** → la pantalla congela y explota el ganador.
5. **ABRIR RONDA** de nuevo para la siguiente canción.

## Eventos de socket (contrato)

| Evento (server→cliente) | Dispara en la TV |
|---|---|
| `voto_recibido` | Latido `scale(1.05)` + partícula `+1` (shockwave) |
| `empate_detectado` | Badge "DUELO" en la barra igualada |
| `rebase_ocurrido` | Turbo drift: brillo dorado + desplazamiento fluido hacia arriba |
| `tema_cumplido` | Sello "✓ CUMPLIDO" verde + salida de la barra + reconstrucción del ranking |
| `tema_reactivado` | El tema vuelve al ranking |
| `ronda_concluida` | Flashbang + perdedoras al 20 % + explosión del ganador (K.O.) |

**Acciones del artista (socket → servidor):** `marcar_cumplido`, `reactivar_tema`, `agregar_tema` (todas requieren `ARTIST_KEY` o `ADMIN_KEY`).

## Despliegue

> ⚠️ **Netlify no sirve para el servidor**: sus funciones son serverless y no mantienen
> conexiones WebSocket abiertas. Usa un host con proceso persistente.

**Render (recomendado, tier gratis):** incluye `render.yaml`. Sube el repo a GitHub →
Render → New → Blueprint. Define `ADMIN_KEY` y (opcional) `MONGODB_URI` en el dashboard.

Alternativas equivalentes: Railway, Fly.io, o cualquier VPS con `node server.js`.

### MongoDB Atlas (opcional, para persistir votos entre reinicios)
1. Crea un cluster **M0 (gratis)** en <https://cloud.mongodb.com>.
2. Crea usuario, permite acceso desde `0.0.0.0/0`.
3. Copia la cadena de conexión en `MONGODB_URI`.

## Rendimiento

- Todas las animaciones usan propiedades aceleradas por GPU (`translate3d`, `scaleX`, `opacity`).
- El rebase reposiciona las filas por `transform` (no por reflow del DOM) → transiciones fluidas.
- El confeti del K.O. es un canvas 2D ligero que se autodetiene a los ~8 s.
- Sin dependencias de render pesadas ni vídeos: seguro para móviles de gama media/baja y datos móviles.
