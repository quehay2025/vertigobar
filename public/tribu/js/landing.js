/* Landing TRIBU: viento sobre el telon, balanceo del cartel y apertura final. */
(function () {
  var L = document.getElementById('landing');
  if (!L) return;
  var $ = function (id) { return document.getElementById(id); };
  var bg = $('bgLocal'), logo = $('logo'), panelL = $('panelL'), panelR = $('panelR'), rig = $('signRig'), root = document.documentElement;
  bg.style.backgroundImage = 'url("/img/local.jpg")';
  logo.addEventListener('error', function () { logo.hidden = true; $('logoFallback').hidden = false; });
  var C = window.TRIBU || {};
  var al = $('arcadeLink'); if (al) al.href = C.arcadeUrl || '/arcade';

  var REST = 0.06, MAX = 78, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var open = REST, openVel = 0, ang = 0, angVel = 0, gust = 0, gustAmp = 0, gustDecay = .997, nextGust = 2600, strongIn = 9000;
  var opening = false, openT0 = 0, openFrom = REST, running = true;

  function launch(strong) {
    gust = 1;
    if (strong) { gustAmp = .95 + Math.random() * .35; gustDecay = .9984 + Math.random() * .0006; strongIn = 13000 + Math.random() * 11000; }
    else { gustAmp = .16 + Math.random() * .26; gustDecay = .9986 + Math.random() * .0008; }
    nextGust = 2600 + Math.random() * 5200;
  }
  function paint(o, ripL, ripR) {
    root.style.setProperty('--open', Math.min(o, 1).toFixed(4));
    var tr = o * MAX, sc = (1 - Math.min(o, 1) * .06).toFixed(3);
    panelL.style.transform = 'translateX(' + (-tr).toFixed(2) + '%) skewX(' + (ripL * .8).toFixed(2) + 'deg) scaleX(' + sc + ')';
    panelR.style.transform = 'translateX(' + tr.toFixed(2) + '%) skewX(' + (-ripR * .8).toFixed(2) + 'deg) scaleX(' + sc + ')';
    var fold = (132 - Math.min(o, 1) * 46).toFixed(1) + 'px';
    panelL.style.backgroundSize = panelR.style.backgroundSize = 'auto, ' + fold + ' 100%';
  }

  var t0 = performance.now(), last = t0;
  function frame(now) {
    if (!running) return;
    var t = (now - t0) / 1000, dt = Math.min(48, now - last); last = now; var s = dt / 16.67;
    if (opening) {
      var p = Math.min(1, (now - openT0) / 2600), e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      paint(openFrom + (1.38 - openFrom) * e, Math.sin(t * 7) * (1 - p) * 1.2, Math.sin(t * 6) * (1 - p) * 1.2);
      requestAnimationFrame(frame); return;
    }
    strongIn -= dt; nextGust -= dt;
    if (strongIn <= 0) launch(true); else if (nextGust <= 0) launch(false);
    gust *= Math.pow(gustDecay, dt);
    var br = .58 * Math.sin(t * .62) + .27 * Math.sin(t * 1.31 + 1.7) + .15 * Math.sin(t * 2.43 + .4);
    var wind = .055 + br * .05 + gust * gustAmp;
    var k = openVel > 0 ? .055 : .042;
    openVel += (wind - (open - REST)) * k * s; openVel *= Math.pow(.9, s);
    open = Math.max(0, Math.min(1, open + openVel * s));
    paint(open, .9 * Math.sin(t * 1.9) + gust * 1.6 * Math.sin(t * 7.1), .9 * Math.sin(t * 1.9 + 2.2) + gust * 1.6 * Math.sin(t * 6.4 + 1.1));
    var push = br * .1 + gust * gustAmp * .55 * Math.sin(t * 3.4);
    angVel += (push - ang * .02) * s; angVel *= Math.pow(.982, s); ang += angVel * s * .16;
    ang = Math.max(-2.4, Math.min(2.4, ang));
    rig.style.setProperty('--swing', ang.toFixed(3) + 'deg');
    requestAnimationFrame(frame);
  }
  if (reduce) paint(REST, 0, 0); else requestAnimationFrame(frame);

  window.TribuLanding = {
    show: function () {
      L.hidden = false; L.classList.remove('opening', 'fade');
      root.classList.add('landing-on');
      if (!running) { running = true; opening = false; last = performance.now(); requestAnimationFrame(frame); }
    },
    hide: function () { running = false; L.hidden = true; root.classList.remove('landing-on'); },
    // Se abren las cortinas y el home queda como sitio
    open: function (done) {
      if (reduce) { this.hide(); done && done(); return; }
      L.classList.add('opening'); openFrom = open; openT0 = performance.now(); opening = true;
      var self = this;
      setTimeout(function () { L.classList.add('fade'); }, 2300);
      setTimeout(function () { self.hide(); done && done(); }, 3300);
    }
  };
  if (window.__tribuLandingReady) window.__tribuLandingReady();
})();
