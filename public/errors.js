/* =========================================================================
   TRIBU GASTRO PUB — Mensajes de error (browser)
   Traduce los códigos que devuelve el servidor (server.js, artists.js) a
   texto claro para el usuario. Si agregas un código nuevo en el servidor,
   agrégalo también aquí.
   ========================================================================= */
window.TRIBU_ERRORS = {
  no_autorizado: 'Clave o código incorrecto.',
  sin_ronda: 'No hay ningún show en vivo en este momento.',
  item_invalido: 'Esa opción ya no está disponible. Actualiza la página.',
  artista_invalido: 'No se encontró ese artista.',
  repertorio_vacio: 'Este artista todavía no tiene nada en su repertorio. Agrega al menos una canción/tema/género desde /artista antes de iniciar el show.',
  codigo_invalido: 'Código incorrecto. Revisa los 6 dígitos e intenta de nuevo.',
  campos_invalidos: 'Falta completar un campo obligatorio.',
  votacion_cerrada: 'La votación está cerrada por ahora.',
  sin_id: 'Hubo un problema de conexión. Recarga la página e intenta de nuevo.',
  en_espera: 'Todavía estás en tiempo de espera para volver a votar.',
  nombre_requerido: 'Escribe un nombre para el artista.',
  categoria_invalida: 'Elige una categoría válida.',
  sin_titulo: 'Escribe quién o qué sigue.',
  demasiados_intentos: 'Demasiados intentos fallidos. Espera 5 minutos e intenta de nuevo.',
  demasiados_votos: 'Mucho movimiento ahora mismo. Intenta de nuevo en unos segundos.',
  demasiados_mensajes: 'Vas muy rápido. Espera un momento.',
  repertorio_lleno: 'Llegaste al máximo de 200 elementos. Borra alguno para agregar otro.',
  sin_horario: 'Todavía no has definido una hora para el próximo show.'
};

window.tribuError = function (code) {
  return window.TRIBU_ERRORS[code] || 'Ocurrió un error inesperado. Intenta de nuevo.';
};
