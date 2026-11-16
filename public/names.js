/* TRIBU: filtro de nombres de usuario (suave, con humor).
   Bloquea groserías y ofensas claras (español, jerga de Ecuador y algo de inglés).
   No bloquea nombres normales: palabras cortas solo por coincidencia exacta,
   y las largas y distintivas por coincidencia dentro del nombre.
   Se usa en el celular (al entrar) y en el servidor (para que nunca salga en la TV). */
(function () {
  // Coincidencia exacta de palabra (evita falsos positivos como "Pitt", "Analía", "Concha").
  const EXACT = ['puta', 'puto', 'putas', 'putos', 'mierda', 'verga', 'vergon', 'pene', 'pija', 'pendejo', 'pendeja', 'cabron', 'cabrona',
    'culo', 'cono', 'coño', 'zorra', 'perra', 'idiota', 'imbecil', 'estupido', 'estupida', 'maricon', 'marica', 'joto', 'puñal',
    'cagar', 'cago', 'cagada', 'chucha', 'chuchaqui', 'huevon', 'huevona', 'webon', 'weon', 'hpta', 'hdp', 'ctm', 'csm', 'mrd', 'vrg',
    'sexo', 'porno', 'porn', 'xxx', 'tetas', 'teta', 'coito', 'semen', 'nazi', 'sidoso', 'mongolo', 'mongola',
    'fuck', 'fucker', 'shit', 'bitch', 'asshole', 'cock', 'pussy', 'cunt', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'retard', 'rape',
    'violador', 'pedofilo', 'asesino', 'terrorista', 'hitler', 'follar', 'culiar', 'verguita', 'carajo', 'mamaverga', 'gonorrea'];
  // Coincidencia dentro del nombre (palabras largas y claras; con el texto pegado, sin espacios).
  const CONTAINS = ['hijueputa', 'hijodeputa', 'hijoputa', 'hijadeputa', 'puta madre', 'putamadre', 'concha de', 'conchatumadre', 'conchetumare',
    'mierda', 'pendejo', 'cabron', 'maricon', 'chingad', 'chingar', 'malparid', 'gonorrea', 'pinga', 'sinverguenza', 'follar',
    'fuck', 'shit', 'bitch', 'asshole', 'nigger', 'nigga', 'faggot', 'whore', 'pussy', 'dickhead', 'motherfuck', 'hitler',
    'violacion', 'violador', 'pedofil', 'mamaguevo', 'comemierda', 'culero', 'culiao', 'tetona', 'pornografia', 'porno', 'masturb', 'orgasm',
    'suicid', 'cocaina', 'marihuana', 'sicario'].map(w => w.replace(/ /g, ''));

  const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '¡': 'i', '+': 't' };

  function norm(s) {
    let t = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    t = t.replace(/[0134578@$!¡+]/g, c => LEET[c]);
    return t;
  }
  function squash(w) { return w.replace(/(.)\1+/g, '$1'); }          // "puuuuta" -> "puta"

  function check(name) {
    const raw = String(name || '').trim();
    const n = norm(raw);
    const words = n.split(/[^a-zñ]+/).filter(Boolean);
    const joined = n.replace(/[^a-zñ]/g, '');
    const exact = new Set(EXACT.map(w => squash(norm(w))));
    for (const w of words) { if (exact.has(w) || exact.has(squash(w))) return { ok: false, reason: 'word' }; }
    // letras separadas: p u t a, p.u.t.a
    if (words.filter(w => w.length === 1).length >= 2 && exact.has(squash(joined))) return { ok: false, reason: 'spaced' };
    const sj = squash(joined);
    for (const c of CONTAINS) {
      const sc = squash(c);
      if (joined.includes(c) || sj.includes(sc)) return { ok: false, reason: 'contains' };
    }
    return { ok: true };
  }

  // Mensajes con humor para quien intenta colar una palabrota
  const MSGS = [
    'Esa palabra no va con la tribu 🔥. Prueba con otro nombre.',
    'La tribu es de buena vibra 😅. Esa no pasa, elige otro nombre.',
    'Uy, ese nombre espanta a los espíritus de la hoguera 🪘. Otro, porfa.',
    'Los ancestros no aprueban ese nombre 🗿. Intenta otro.',
    'Aquí se viene a vibrar, no a ofender ✌️. Cambia el nombre.'
  ];
  const randomMsg = () => MSGS[Math.floor(Math.random() * MSGS.length)];

  const api = { check, randomMsg, MSGS };
  if (typeof window !== 'undefined') window.TribuNames = api; else globalThis.TribuNames = api;
})();
