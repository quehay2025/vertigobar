// =============================================================================
//  VÉRTIGO BAR — Categorías de artista (servidor)
//  IMPORTANTE: mantener este archivo sincronizado con public/categories.js
//  (la versión de browser es una copia simple, sin import/export, porque los
//  scripts públicos se cargan como <script> plano, no como módulos).
// =============================================================================

export const CATEGORIES = {
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
    ]
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
    ]
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
    ]
  }
};

export const CATEGORY_LIST = Object.entries(CATEGORIES).map(([id, c]) => ({ id, ...c }));

export function isValidCategory(cat) {
  return Object.prototype.hasOwnProperty.call(CATEGORIES, cat);
}

export function getCategory(cat) {
  return CATEGORIES[cat] || CATEGORIES.otro;
}

// Valida y normaliza los campos de un ítem de repertorio según su categoría.
// Devuelve { title, artist, genre } (algunos vacíos según la categoría) o null si falta un campo obligatorio.
export function sanitizeItemFields(category, input = {}) {
  const cfg = getCategory(category);
  const out = { title: '', artist: '', genre: '' };
  for (const f of cfg.fields) {
    const v = (input[f.key] || '').toString().trim();
    if (f.required && !v) return null;
    out[f.key] = v.slice(0, 120);
  }
  return out;
}
