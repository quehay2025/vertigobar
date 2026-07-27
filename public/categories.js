/* =========================================================================
   VÉRTIGO BAR — Categorías de artista (browser)
   IMPORTANTE: copia sincronizada a mano con categories.js (raíz, servidor).
   Se carga como <script> plano (no módulo) para que lo usen admin/artist/
   client/tv sin build step.
   ========================================================================= */
window.VERTIGO_CATEGORIES = {
  musico: {
    label: 'Música / Banda',
    icon: '🎵',
    itemLabel: 'Canción',
    itemLabelPlural: 'Canciones',
    article: 'una',
    promptLabel: 'Elige la siguiente canción',
    addCta: '➕ Agregar canción',
    doneCta: '✓ Ya la canté',
    doneToast: 'ya se cantó',
    fields: [
      { key: 'title', label: 'Título de la canción', placeholder: 'Ej: Provenza', required: true },
      { key: 'artist', label: 'Artista / Autor', placeholder: 'Ej: Karol G', required: false },
      { key: 'genre', label: 'Género', placeholder: 'Ej: Reggaetón', required: false }
    ],
    subtitleField: 'artist'
  },
  standup: {
    label: 'Stand-up / Comedia',
    icon: '🎤',
    itemLabel: 'Tema',
    itemLabelPlural: 'Temas',
    article: 'un',
    promptLabel: 'Elige el próximo tema',
    addCta: '➕ Agregar tema',
    doneCta: '✓ Ya lo hablé',
    doneToast: 'ya se habló',
    fields: [
      { key: 'title', label: 'Tema', placeholder: 'Ej: Divorcios', required: true }
    ],
    subtitleField: null
  },
  dj: {
    label: 'DJ',
    icon: '🎧',
    itemLabel: 'Género',
    itemLabelPlural: 'Géneros',
    article: 'un',
    promptLabel: 'Elige el próximo género',
    addCta: '➕ Agregar género',
    doneCta: '✓ Ya lo puse',
    doneToast: 'ya se puso',
    fields: [
      { key: 'title', label: 'Género musical', placeholder: 'Ej: Reggaetón', required: true }
    ],
    subtitleField: null
  },
  otro: {
    label: 'Otro',
    icon: '⭐',
    itemLabel: 'Punto',
    itemLabelPlural: 'Puntos',
    article: 'un',
    promptLabel: 'Elige lo siguiente',
    addCta: '➕ Agregar punto',
    doneCta: '✓ Ya lo hice',
    doneToast: 'ya se hizo',
    fields: [
      { key: 'title', label: 'Título / punto', placeholder: 'Ej: Ronda de preguntas', required: true }
    ],
    subtitleField: null
  }
};

window.VERTIGO_CATEGORY_LIST = Object.entries(window.VERTIGO_CATEGORIES).map(([id, c]) => ({ id, ...c }));

window.vertigoCategory = function (cat) {
  return window.VERTIGO_CATEGORIES[cat] || window.VERTIGO_CATEGORIES.otro;
};
