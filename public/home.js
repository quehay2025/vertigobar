/* =========================================================================
   Landing VÉRTIGO — viento sobre el telón y balanceo del cartel.

   No hay bucle: no es un clip que empieza y termina. El estado del telón
   sale de un muelle amortiguado empujado por viento continuo, así que
   SIEMPRE vuelve por sí solo al mismo reposo. Sobre esa brisa caen ráfagas
   de intensidad y duración aleatorias; de vez en cuando llega una fuerte
   que abre el telón casi del todo, deja ver el local un instante y se cierra.
   ========================================================================= */
(() => {
  const bg     = document.getElementById('bgLocal');
  const logo   = document.getElementById('logo');
  const panelL = document.getElementById('panelL');
  const panelR = document.getElementById('panelR');
  const rig    = document.getElementById('signRig');
  const root   = document.documentElement;

  // Foto del local (si falta el archivo, queda el negro de fondo)
  const LOCAL = 'img/local.jpg';
  const probe = new Image();
  probe.onload = () => { bg.style.backgroundImage = `url("${LOCAL}")`; };
  probe.src = LOCAL;

  // Sin PNG del logo -> logotipo tipográfico
  const logoFail = () => {
    logo.hidden = true;
    document.getElementById('logoFallback').hidden = false;
  };
  logo.addEventListener('error', logoFail);
  if (logo.complete && logo.naturalWidth === 0) logoFail();

  const REST = 0.06;          // abertura en reposo: apenas una rendija
  const MAX_TRAVEL = 78;      // % de recorrido: a tope queda ~85% del local a la vista

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.style.setProperty('--open', String(REST));
    panelL.style.transform = `translateX(${-REST * MAX_TRAVEL}%)`;
    panelR.style.transform = `translateX(${ REST * MAX_TRAVEL}%)`;
    return;
  }

  // --------------------------------------------------------------- ESTADO --
  let open = REST, openVel = 0;    // muelle de apertura
  let ang  = 0,    angVel  = 0;    // péndulo del cartel
  let gust = 0, gustAmp = 0, gustDecay = 0.997;
  let nextGust = 2600;
  let strongIn = 9000;             // cuenta atrás de la ráfaga fuerte

  // Cada ráfaga es distinta: fuerza, duración y aleteo propios
  function launchGust(strong) {
    gust = 1;
    if (strong) {
      gustAmp   = 0.95 + Math.random() * 0.35; // abre el telón casi entero
      gustDecay = 0.9984 + Math.random() * 0.0006; // pasa rápido: solo un vistazo
      strongIn  = 13000 + Math.random() * 11000;
    } else {
      gustAmp   = 0.16 + Math.random() * 0.26;
      gustDecay = 0.9986 + Math.random() * 0.0008;
    }
    nextGust = 2600 + Math.random() * 5200;
  }

  const t0 = performance.now();
  let last = t0;

  function frame(now) {
    const t  = (now - t0) / 1000;
    const dt = Math.min(48, now - last); last = now;
    const s  = dt / 16.67;                    // pasos normalizados a 60 fps

    // ------------------------------------------------------------ VIENTO --
    strongIn -= dt;
    nextGust -= dt;
    if (strongIn <= 0) launchGust(true);
    else if (nextGust <= 0) launchGust(false);
    gust *= Math.pow(gustDecay, dt);

    // Brisa: frecuencias inconmensurables, el patrón nunca se repite
    const breeze =
      0.58 * Math.sin(t * 0.62) +
      0.27 * Math.sin(t * 1.31 + 1.7) +
      0.15 * Math.sin(t * 2.43 + 0.4);

    const wind = 0.055 + breeze * 0.05 + gust * gustAmp;

    // Muelle amortiguado: el telón siempre regresa al mismo reposo.
    // Abre con ganas y cierra algo más lento, como tela pesada.
    const stiffness = openVel > 0 ? 0.055 : 0.042;
    openVel += (wind - (open - REST) * 1.0) * stiffness * s;
    openVel *= Math.pow(0.90, s);
    open = Math.max(0, Math.min(1, open + openVel * s));
    root.style.setProperty('--open', open.toFixed(4));

    // Cada hoja ondula con su propio desfase
    const ripL = 0.9 * Math.sin(t * 1.9)       + gust * 1.6 * Math.sin(t * 7.1);
    const ripR = 0.9 * Math.sin(t * 1.9 + 2.2) + gust * 1.6 * Math.sin(t * 6.4 + 1.1);
    const travel = open * MAX_TRAVEL;

    panelL.style.transform =
      `translateX(${(-travel).toFixed(2)}%) skewX(${(ripL * 0.8).toFixed(2)}deg) scaleX(${(1 - open * 0.06).toFixed(3)})`;
    panelR.style.transform =
      `translateX(${( travel).toFixed(2)}%) skewX(${(-ripR * 0.8).toFixed(2)}deg) scaleX(${(1 - open * 0.06).toFixed(3)})`;

    // El terciopelo se recoge: los pliegues se juntan al abrirse
    const fold = (132 - open * 46).toFixed(1) + 'px';
    panelL.style.backgroundSize = `auto, ${fold} 100%`;
    panelR.style.backgroundSize = `auto, ${fold} 100%`;

    // ----------------------------------------------------------- PÉNDULO --
    // El mismo viento empuja el cartel; gravedad y rozamiento lo devuelven.
    const push = breeze * 0.10 + gust * gustAmp * 0.55 * Math.sin(t * 3.4);
    angVel += (push - ang * 0.020) * s;
    angVel *= Math.pow(0.982, s);
    ang += angVel * s * 0.16;
    ang = Math.max(-2.4, Math.min(2.4, ang));
    rig.style.setProperty('--swing', ang.toFixed(3) + 'deg');

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
