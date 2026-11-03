(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const cv = $('cv'), g2 = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  let ctx, eng, recDest, playing = false, worker, started = false;
  const events = [];
  const V = { hue: 266, kick: 0, bass: 0, flash: 0, rings: [], parts: [], sparks: [], scroll: 0, level: 0, secName: '' };
  let freq, wave;

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    g2.setTransform(DPR, 0, 0, DPR, 0, 0);
    g2.fillStyle = '#07080c'; g2.fillRect(0, 0, W, H);
  }
  addEventListener('resize', resize); resize();

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- audio start ----------
  // iOS Safari: AudioContext must be created/resumed synchronously inside a user gesture,
  // and Web Audio is muted by the ringer switch unless the page is on the "playback" audio session
  // (navigator.audioSession) or an HTML media element is playing.
  const AC = window.AudioContext || window.webkitAudioContext;
  let keepAlive = null;
  function silentWavURL() {
    const sr = 8000, n = sr, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, i & 1 ? 1 : -1, true); // inaudible, not digital zero
    return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
  }
  function unlockIOS() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    try {
      if (!keepAlive) {
        keepAlive = document.createElement('audio');
        keepAlive.src = silentWavURL(); keepAlive.loop = true; keepAlive.preload = 'auto';
        keepAlive.setAttribute('playsinline', ''); keepAlive.setAttribute('x-webkit-airplay', 'deny');
        keepAlive.volume = 1; keepAlive.style.display = 'none';
        document.body.appendChild(keepAlive);
      }
      const p = keepAlive.play(); if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
  function unlockCtx() {
    // silent one-sample buffer, started synchronously in the gesture
    try {
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    } catch (e) {}
    try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }
  function revive() {
    if (!ctx || !playing) return;
    if (ctx.state !== 'running') { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
    if (keepAlive && keepAlive.paused) { const p = keepAlive.play(); if (p && p.catch) p.catch(() => {}); }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revive(); });
  addEventListener('pageshow', revive);
  addEventListener('focus', revive);
  // any later tap also re-resumes (iOS can interrupt after calls/Siri/lock)
  ['touchend', 'click'].forEach(ev => document.addEventListener(ev, () => { if (ctx && playing && ctx.state !== 'running') revive(); }, true));
  setInterval(() => { if (ctx && playing && ctx.state !== 'running') revive(); }, 1000);

  function start() {
    if (started) return;
    if (!AC) return toast('Web Audio not supported in this browser');
    started = true;
    unlockIOS();
    ctx = new AC({ latencyHint: 'interactive' });
    unlockCtx();
    ctx.onstatechange = () => { if (playing && ctx.state !== 'running' && ctx.state !== 'closed') revive(); };
    eng = new MM.Engine(ctx, { mood: $('mood').value / 100, onEvent: (type, time, data) => events.push({ type, time, data }) });
    try { recDest = ctx.createMediaStreamDestination(); } catch (e) { recDest = null; }
    eng.out.connect(ctx.destination);
    if (recDest) eng.out.connect(recDest);
    freq = new Uint8Array(eng.analyser.frequencyBinCount);
    wave = new Uint8Array(eng.analyser.fftSize);
    eng.start();
    // Worker timer: not throttled in background tabs
    try {
      const url = URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),25)'], { type: 'text/javascript' }));
      worker = new Worker(url); worker.onmessage = tick;
    } catch (e) { setInterval(tick, 25); }
    unlockCtx();
    playing = true;
    tick();
    $('start').style.display = 'none';
    setBtn($('play'), 'Pause');
    window.__mm = { eng, ctx, V };
  }
  function tick() { if (eng && playing) eng.scheduleUntil(ctx.currentTime + .6); }

  // ---------- palette: refined base schemes, derived per genre, smoothly cross-faded ----------
  // each: [h,s,l] for c1 (primary), c2 (secondary), c3 (accent), bg
  const SCHEMES = {
    dusk:      [[266, 70, 76], [22, 88, 72], [48, 85, 80], [262, 38, 6]],
    lagoon:    [[176, 62, 62], [206, 82, 72], [44, 90, 78], [200, 40, 5.5]],
    ember:     [[12, 85, 66], [40, 92, 68], [340, 70, 82], [10, 36, 5.5]],
    orchid:    [[318, 62, 72], [268, 70, 78], [186, 70, 78], [300, 32, 6]],
    moss:      [[96, 38, 66], [160, 52, 62], [50, 80, 78], [130, 26, 5]],
    glacier:   [[196, 80, 74], [236, 70, 80], [330, 60, 86], [220, 40, 5.5]],
    rosewood:  [[350, 65, 70], [28, 70, 76], [200, 40, 82], [350, 30, 5.5]],
    aurora:    [[152, 66, 62], [276, 66, 74], [196, 80, 78], [240, 36, 5.5]],
    citrine:   [[54, 85, 66], [24, 85, 66], [176, 50, 72], [40, 30, 5]]
  };
  const BY_VIBE = { ice: ['glacier', 'lagoon', 'aurora'], neon: ['orchid', 'aurora', 'dusk'], warm: ['ember', 'rosewood', 'citrine', 'dusk'], space: ['dusk', 'aurora', 'glacier', 'orchid'], grit: ['moss', 'citrine', 'ember'] };
  const pal = { cur: SCHEMES.dusk.map(x => x.slice()), tgt: SCHEMES.dusk.map(x => x.slice()), n: 0, last: '' };
  function pickScheme(g) {
    const list = BY_VIBE[g.vibe] || BY_VIBE.space, name = list[(g.seed >>> 3) % list.length], sh = ((g.seed >>> 7) % 17) - 8; // slight per-genre hue drift
    return SCHEMES[name].map((c, i) => [(c[0] + sh * (i < 3 ? 1 : .5) + 360) % 360, c[1], c[2]]);
  }
  const lerp = (a, b, k) => a + (b - a) * k;
  const lerpH = (a, b, k) => { let d = ((b - a + 540) % 360) - 180; return (a + d * k + 360) % 360; };
  function updatePalette(dt) {
    const k = 1 - Math.exp(-dt * 1.5);
    for (let i = 0; i < 4; i++) { const c = pal.cur[i], t = pal.tgt[i]; c[0] = lerpH(c[0], t[0], k); c[1] = lerp(c[1], t[1], k); c[2] = lerp(c[2], t[2], k); }
    if ((pal.n++ % 3) === 0) applyPalette();
  }
  const hs = (c, a, dl) => `hsl(${c[0].toFixed(1)} ${c[1].toFixed(1)}% ${(c[2] + (dl || 0)).toFixed(1)}%${a == null || a >= 1 ? '' : ' / ' + a.toFixed(3)})`;
  const hsa = (c, a, dl) => `hsla(${c[0].toFixed(1)},${c[1].toFixed(1)}%,${(c[2] + (dl || 0)).toFixed(1)}%,${a == null ? 1 : a})`;
  function applyPalette() {
    const r = document.documentElement.style, [c1, c2, c3, bg] = pal.cur;
    r.setProperty('--c1', hs(c1)); r.setProperty('--c2', hs(c2)); r.setProperty('--c3', hs(c3)); r.setProperty('--c1a', hs(c1, .2)); r.setProperty('--bg', hs(bg));
    const st = $('start'); if (st && st.style.display !== 'none') st.style.background = `radial-gradient(120% 90% at 50% 38%, ${hs([c1[0], 40, 13])}, ${hs(bg)} 68%)`;
    if ((pal.n % 30) === 0) { const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = hs(bg); }
  }

  // ---------- small UI helpers ----------
  function setBtn(el, txt) {
    let t = el.querySelector('.t'); if (!t) { t = document.createElement('span'); t.className = 't'; el.insertBefore(t, el.firstChild); }
    t.textContent = txt;
  }
  ['play', 'new', 'marb', 'rec', 'wav'].forEach(id => { const b = $(id), txt = b.textContent.trim(); b.textContent = ''; setBtn(b, txt); });

  // ---------- haptics ----------
  // Android: navigator.vibrate. iOS Safari has no vibrate API: native taps on a hidden <input type=checkbox switch> give a haptic tick
  // (iOS 17.4+/18). Recent WebKit only allows that for real user taps, so taps on the glow / buttons are forwarded to a switch (reliable);
  // beat-synced ticks are best-effort (a script-clicked switch) and simply do nothing on iOS builds that block it.
  const UA = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const canVibrate = typeof navigator.vibrate === 'function';
  const Hap = { on: false, last: 0, stamps: [], kicks: 0 };
  try { Hap.on = localStorage.getItem('emm.haptics') === '1' && (isIOS || canVibrate); } catch (e) {}
  let synth = null;
  function iosTick() {
    try {
      if (!synth) {
        synth = document.createElement('label'); synth.setAttribute('aria-hidden', 'true'); synth.style.cssText = 'position:fixed;left:-9px;top:-9px;width:1px;height:1px;opacity:0;pointer-events:none';
        const inp = document.createElement('input'); inp.type = 'checkbox'; inp.setAttribute('switch', ''); synth.appendChild(inp); document.body.appendChild(synth);
      }
      synth.click();
    } catch (e) {}
  }
  const MINGAP = { soft: 260, tick: 190, hard: 420 };
  function haptic(kind) { // kind: 'soft' | 'tick' | 'hard'
    if (!Hap.on) return;
    const now = performance.now();
    if (now - Hap.last < (MINGAP[kind] || 200)) return;
    Hap.stamps = Hap.stamps.filter(x => now - x < 3000); if (Hap.stamps.length >= 6 && kind !== 'hard') return; // never constant
    Hap.last = now; Hap.stamps.push(now);
    if (canVibrate) { try { navigator.vibrate(kind === 'hard' ? [24, 36, 34] : kind === 'soft' ? 7 : 13); } catch (e) {} }
    else if (isIOS) { iosTick(); if (kind === 'hard') setTimeout(iosTick, 80); }
  }
  function syncHapticUI() {
    document.querySelectorAll('[data-hap] input').forEach(i => { if (Hap.on && isIOS) i.setAttribute('switch', ''); else i.removeAttribute('switch'); });
    $('hap').checked = Hap.on; $('hap0').checked = Hap.on;
    try { localStorage.setItem('emm.haptics', Hap.on ? '1' : '0'); } catch (e) {}
  }
  if (!isIOS && !canVibrate) { $('hapL').style.display = 'none'; $('hapL0').style.display = 'none'; }
  // taps on the pad / buttons are real user gestures: forward them to a hidden switch so iOS plays its native tick
  (function () {
    const mk = el => {
      const lab = document.createElement('label'); lab.setAttribute('data-hap', ''); lab.setAttribute('aria-hidden', 'true'); lab.style.cssText = 'position:absolute;inset:0;border-radius:inherit;touch-action:manipulation';
      const inp = document.createElement('input'); inp.type = 'checkbox'; inp.style.cssText = 'position:absolute;width:1px;height:1px;margin:0;visibility:hidden'; inp.addEventListener('click', e => e.stopPropagation()); lab.appendChild(inp); el.appendChild(lab);
    };
    ['play', 'new', 'rec', 'wav'].forEach(id => { if (isIOS) mk($(id)); });
    const pad = $('pad'); pad.setAttribute('data-hap', ''); pad.querySelector('input').addEventListener('click', e => e.stopPropagation());
  })();
  window.__hap = Hap;
  const setHap = v => { Hap.on = !!v && (isIOS || canVibrate); syncHapticUI(); if (Hap.on && canVibrate) navigator.vibrate(18); };
  ['hapL', 'hapL0'].forEach(id => { const L = $(id); ['click', 'touchend', 'pointerdown'].forEach(ev => L.addEventListener(ev, e => e.stopPropagation())); });
  $('hap').addEventListener('change', e => setHap(e.target.checked));
  $('hap0').addEventListener('change', e => setHap(e.target.checked));
  syncHapticUI();

  // ---------- meta / genre UI ----------
  let metaG = null;
  function renderMeta(key, mode) {
    const g = metaG; if (!g) return;
    $('meta').innerHTML = `<span><b>${Math.round(g.bpm)}</b> bpm</span><span><b>${g.meterName}</b></span><span><b>${key}</b> ${mode}</span><span>${g.family}</span><span>#${g.seed.toString(36)}</span>`;
  }
  function setGenreUI(g) {
    const h = $('genre');
    h.classList.add('swap');
    setTimeout(() => {
      h.textContent = g.name; $('persona').textContent = g.pers ? g.pers.tag : '';
      metaG = g; renderMeta(g.key, g.scaleName);
      h.classList.remove('swap');
    }, 280);
    if (!(V.ghosts && V.ghosts.witch)) pal.tgt = pickScheme(g);
    if (!setGenreUI.told) { setGenreUI.told = 1; setTimeout(() => toast('Tap the glow · hold & drag to glide'), 2500); }
    document.title = g.name + ' · Endless Music Machine';
  }

  // ---------- controls ----------
  function togglePlay() {
    if (!started) return start();
    if (playing) { glideStop(); ghostsHush(); cameosHush(); ctx.suspend(); playing = false; if (keepAlive) keepAlive.pause(); setBtn($('play'), 'Play'); }
    else { unlockIOS(); ctx.resume(); playing = true; setBtn($('play'), 'Pause'); }
  }
  // the machine keeps evolving: a fresh hybrid genre every ~7 minutes while playing
  setInterval(() => { if (started && playing && eng && !eng.pendingGenre && ctx.currentTime - lastGenreAt > 420) newGenre(true); }, 5000);
  let lastGenreAt = 0;
  function newGenre(auto) {
    if (!started) start();
    const g = MM.inventGenre((Math.random() * 4e9) >>> 0);
    eng.setGenre(g); lastGenreAt = ctx.currentTime;
    toast((auto === true ? 'Drifting to · ' : 'Next · ') + g.name);
    if (!playing) togglePlay();
  }
  $('start').addEventListener('click', start);
  $('start').addEventListener('touchend', e => { e.preventDefault(); start(); }, { passive: false });
  $('play').addEventListener('click', togglePlay);
  $('new').addEventListener('click', () => newGenre());
  // Chill <-> Intense: reshapes the whole mix live (density, tempo, brightness, grit, pump, space). A word under the thumb says where you are.
  const MOODW = ['sparse · dark · spacious', 'mellow', 'grooving', 'driving', 'packed · bright · gritty'];
  function moodInput(e) {
    const v = e.target.value / 100; if (eng && eng.setMood) eng.setMood(v); else if (eng) eng.mood = v;
    const w = MOODW[Math.min(4, Math.floor(v * 5))]; if (w !== moodInput.w) { moodInput.w = w; toast((v < .2 ? '☾ ' : v > .8 ? '⚡ ' : '') + w); if (v > .8 || v < .2) haptic('soft'); }
  }
  $('mood').addEventListener('input', moodInput);
  addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'n' || e.key === 'N') newGenre();
    else if (e.key === 'l' || e.key === 'L') starToggle();
    else if (e.key === 'm' || e.key === 'M') marbleToggle();
  });

  // tap the glow: strike a note in the current key (chord-aware), with a ripple and (native) haptic.
  // hold & drag: the Glide Ribbon — a live scale-snapped portamento synth with a glowing comet trail.
  const NOTE = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  const GL = { id: null, x0: 0, y0: 0, t0: 0, on: false, trail: [], blooms: [], hold: 0, lastVib: 0 };
  V.glide = GL;
  function glideBegin(x, y) {
    if (GL.on || !eng || !eng.glideStart) return;
    GL.on = true; const m = eng.glideStart(x / W, 1 - y / H); bloom(x, y, m, 1.4);
    if (!glideBegin.told) { glideBegin.told = 1; toast('〰 Glide Ribbon · drag left/right for pitch, up for shine'); }
  }
  function bloom(x, y, m, big) { GL.blooms.push({ x, y, txt: NOTE[((m % 12) + 12) % 12], a: 1, s: big || 1 }); if (GL.blooms.length > 24) GL.blooms.shift(); }
  function glideStop() {
    clearTimeout(GL.hold); GL.id = null;
    if (GL.on) { GL.on = false; if (eng) eng.glideEnd(); }
  }
  $('pad').addEventListener('pointerdown', e => {
    if (!started || !playing || !eng) return;
    const gh = ghostHit(e.clientX, e.clientY); if (gh) { ghostCatch(gh); return; }
    const cm = cameoHit(e.clientX, e.clientY); if (cm) { cameoTap(cm); return; }
    if (MB.on) { if (!MB.hold) marbleGrab(e); if (!isIOS) haptic('soft'); return; }
    if (ST.on && eng.starTap) starPlant(e.clientX, e.clientY); else eng.strike(e.clientX / W, 1 - e.clientY / H);
    V.taps.push({ x: e.clientX, y: e.clientY, r: 0, a: .9 });
    if (!isIOS) haptic('soft');
    if (GL.id !== null) return; // one ribbon at a time; extra fingers still strike notes
    GL.id = e.pointerId; GL.x0 = e.clientX; GL.y0 = e.clientY; GL.trail.length = 0;
    try { $('pad').setPointerCapture(e.pointerId); } catch (er) {}
    clearTimeout(GL.hold); GL.hold = setTimeout(() => { if (GL.id !== null) glideBegin(GL.x0, GL.y0); }, 200);
  });
  $('pad').addEventListener('pointermove', e => {
    if (MB.hold && e.pointerId === MB.hold.id) { const b = MB.hold.b; b.x = e.clientX; b.y = e.clientY; b.samp.push({ x: b.x, y: b.y, t: performance.now() }); if (b.samp.length > 12) b.samp.shift(); return; }
    if (e.pointerId !== GL.id || !eng) return;
    if (!GL.on && Math.hypot(e.clientX - GL.x0, e.clientY - GL.y0) > 14) glideBegin(e.clientX, e.clientY);
    if (!GL.on) return;
    GL.trail.push({ x: e.clientX, y: e.clientY, life: 1 }); if (GL.trail.length > 90) GL.trail.shift();
    const r = eng.glideMove(e.clientX / W, 1 - e.clientY / H);
    if (r && r.changed) {
      bloom(e.clientX, e.clientY, r.m);
      const now = performance.now();
      if (Hap.on && canVibrate && now - GL.lastVib > 55) { GL.lastVib = now; try { navigator.vibrate(5); } catch (er) {} }
    }
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => $('pad').addEventListener(ev, e => { if (MB.hold && e.pointerId === MB.hold.id) marbleRelease(); if (e.pointerId === GL.id) glideStop(); }));
  addEventListener('blur', glideStop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { glideStop(); ghostsHush(); cameosHush(); } });

  // ---------- Star Loop: plant stars by tapping; they loop every 2 bars as a living constellation and follow the chords ----------
  const ST = { on: false, flare: {}, shoot: [], dust: [], pulse: 0 };
  V.stars = ST;
  function starToggle() {
    if (!started || !eng || !eng.starToggle) return;
    ST.on = !ST.on;
    if (!ST.on) { // scatter the constellation into stardust
      const L = (eng.stars && eng.stars.list) || [];
      L.forEach(s => { const p = ST.pos && ST.pos[s.id]; if (!p) return; for (let k = 0; k < 9; k++) { const a = Math.random() * 7, sp = 60 + Math.random() * 200; ST.dust.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1 }); } });
    }
    eng.starToggle(ST.on);
    $('loop').classList.toggle('on', ST.on); $('loop').setAttribute('aria-pressed', ST.on);
    toast(ST.on ? '✦ Star Loop · tap the glow to plant stars — they loop & follow the chords' : '✦ Constellation released');
    haptic(ST.on ? 'hard' : 'soft');
  }
  $('loop').addEventListener('click', starToggle);
  function starPlant(x, y) {
    const r = eng.starTap(x / W, 1 - y / H); if (!r || r.id == null) return;
    ST.shoot.push({ x, y, id: r.id, t: 0 }); bloom(x, y, r.m, 1.2);
    const n = eng.stars.list.length; $('loop').dataset.n = n; if (n === 1) toast('★ First star · it will come back every 2 bars');
  }
  function starPos(s, cx, cy, R) {
    const a = s.frac * Math.PI * 2 - Math.PI / 2, rr = R * 1.55 + 18 + s.v * Math.min(W, H) * .16;
    return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr };
  }
  function drawStars(dt, cx, cy, R, c1, c2, c3, now) {
    for (let i = ST.dust.length - 1; i >= 0; i--) { const d = ST.dust[i]; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 40 * dt; d.life -= dt * .9; if (d.life <= 0) { ST.dust.splice(i, 1); continue; } g2.fillStyle = hsa(c3, d.life * .9, 10); g2.fillRect(d.x - 1, d.y - 1, 2.4, 2.4); }
    if (!ST.on || !eng.stars) return;
    const list = eng.stars.list, ph = eng.starPhase(), pos = ST.pos = {};
    // orbit + sweeping hand
    const orb = R * 1.55 + 18 + Math.min(W, H) * .08, ha = ph * Math.PI * 2 - Math.PI / 2;
    g2.setLineDash([2, 7]); g2.strokeStyle = hsa(c3, .22); g2.lineWidth = 1; g2.beginPath(); g2.arc(cx, cy, orb, 0, 7); g2.stroke(); g2.setLineDash([]);
    for (let k = 0; k < 14; k++) { const a = ha - k * .045; g2.strokeStyle = hsa(c3, .2 * (1 - k / 14)); g2.lineWidth = 2; g2.beginPath(); g2.moveTo(cx + Math.cos(a) * R * 1.1, cy + Math.sin(a) * R * 1.1); g2.lineTo(cx + Math.cos(a) * (orb + Math.min(W, H) * .1), cy + Math.sin(a) * (orb + Math.min(W, H) * .1)); g2.stroke(); }
    // constellation lines in loop order
    const sorted = list.slice().sort((a, b) => a.frac - b.frac);
    sorted.forEach(s => pos[s.id] = starPos(s, cx, cy, R));
    if (sorted.length > 1) {
      g2.strokeStyle = hsa(c2, .28 + V.bass * .3); g2.lineWidth = 1.1; g2.beginPath();
      sorted.forEach((s, i) => { const p = pos[s.id]; i ? g2.lineTo(p.x, p.y) : g2.moveTo(p.x, p.y); }); if (sorted.length > 2) g2.closePath(); g2.stroke();
    }
    g2.textAlign = 'center'; g2.textBaseline = 'middle';
    sorted.forEach(s => {
      const p = pos[s.id], f = ST.flare[s.id] || 0, tw = .6 + .4 * Math.sin(now / 260 + s.id * 2.3), r = 2.4 + f * 9 + tw * 1.2;
      if (f > 0) ST.flare[s.id] = f * Math.pow(.02, dt);
      const gr = g2.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4.5); gr.addColorStop(0, hsa(c3, .9, 14)); gr.addColorStop(.3, hsa(c1, .35 + f * .4)); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g2.fillStyle = gr; g2.beginPath(); g2.arc(p.x, p.y, r * 4.5, 0, 7); g2.fill();
      g2.strokeStyle = `hsla(0,0%,100%,${(.35 + f * .6).toFixed(3)})`; g2.lineWidth = 1; const sp = r * (1.6 + f * 2.4);
      g2.beginPath(); g2.moveTo(p.x - sp, p.y); g2.lineTo(p.x + sp, p.y); g2.moveTo(p.x, p.y - sp); g2.lineTo(p.x, p.y + sp); g2.stroke();
      if (f > .3) { g2.font = '600 11px -apple-system,system-ui,sans-serif'; g2.fillStyle = hsa(c3, f, 10); g2.fillText(NOTE[((s.m % 12) + 12) % 12], p.x, p.y - 14 - f * 6); }
    });
    // shooting stars from your finger to their place in the sky
    for (let i = ST.shoot.length - 1; i >= 0; i--) {
      const sh = ST.shoot[i], p = pos[sh.id]; sh.t += dt * 2.2; if (!p || sh.t >= 1) { ST.shoot.splice(i, 1); if (p) ST.flare[sh.id] = 1; continue; }
      const e = 1 - Math.pow(1 - sh.t, 3), x = sh.x + (p.x - sh.x) * e, y = sh.y + (p.y - sh.y) * e, bx = sh.x + (p.x - sh.x) * Math.max(0, e - .25), by = sh.y + (p.y - sh.y) * Math.max(0, e - .25);
      const lg = g2.createLinearGradient(bx, by, x, y); lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, hsa(c3, .95, 12));
      g2.strokeStyle = lg; g2.lineWidth = 3; g2.lineCap = 'round'; g2.beginPath(); g2.moveTo(bx, by); g2.lineTo(x, y); g2.stroke();
    }
  }
  window.__stars = { toggle: starToggle, plant: starPlant, ST };

  // ---------- Marble Garden: fling glowing marbles; they bounce on a floor-xylophone (always in key) and ping off the orb ----------
  // tilt the iPhone to tilt gravity (DeviceOrientation, permission asked on the toggle tap). Real bounces → natural accelerando rhythms.
  const MB = { on: false, list: [], glow: [], vis: 0, gx: 0, gy: 1, tilt: false, hold: null, sparks: [], hits: 0, hue: 0 };
  V.marbles = MB;
  const MG = 1500; // px/s² gravity
  function onTilt(e) {
    if (e.gamma == null || e.beta == null) return;
    const rad = Math.PI / 180, ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    let gx = Math.sin(clampN(e.gamma, -90, 90) * rad), gy = Math.sin(clampN(e.beta, -90, 90) * rad);
    if (ang === 90) [gx, gy] = [gy, -gx]; else if (ang === -90 || ang === 270) [gx, gy] = [-gy, gx];
    const l = Math.hypot(gx, gy); if (l < .18) { gx = 0; gy = .35; } // phone flat → a gentle default pull
    MB.gx += (gx - MB.gx) * .3; MB.gy += (gy - MB.gy) * .3; MB.tilt = true;
  }
  function clampN(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function marbleToggle() {
    if (!started || !eng || !eng.marbleHit) return;
    MB.on = !MB.on;
    if (MB.on && !MB.tiltAsked) { // iOS 13+: motion permission must be requested inside the tap
      MB.tiltAsked = 1;
      try {
        const DOE = window.DeviceOrientationEvent;
        if (DOE && typeof DOE.requestPermission === 'function') DOE.requestPermission().then(s => { if (s === 'granted') addEventListener('deviceorientation', onTilt); }).catch(() => {});
        else if (DOE) addEventListener('deviceorientation', onTilt);
      } catch (e) {}
    }
    if (!MB.on) MB.list.forEach(b => b.pop = b.pop || 1);
    $('marb').classList.toggle('on', MB.on); $('marb').setAttribute('aria-pressed', MB.on);
    toast(MB.on ? '◉ Marble Garden · tap to drop, flick to throw' + (isIOS || canVibrate ? ' · tilt to steer' : '') : '◉ Marbles away');
    haptic(MB.on ? 'hard' : 'soft');
  }
  $('marb').addEventListener('click', marbleToggle);
  function marbleAdd(x, y) {
    const r = (W > 600 ? 11 : 9) + Math.random() * 3, ch = [0, 1, 2][MB.hue++ % 3];
    const b = { x, y, vx: (Math.random() - .5) * 40, vy: 0, r, ch, t: 0, rest: 0, pop: 0, trail: [], held: true, samp: [] };
    MB.list.push(b); if (MB.list.length > 14) { const o = MB.list.find(q => !q.pop && !q.held); if (o) o.pop = 1; }
    if (MB.list.length > 20) MB.list.shift();
    if (!marbleAdd.told) { marbleAdd.told = 1; setTimeout(() => toast('Bounce them on the glowing bars · hit the orb for a chord'), 900); }
    return b;
  }
  function marbleGeom() {
    const n = eng.marbleBars ? eng.marbleBars() : 15, floor = H * .74, bw = W / n;
    return { n, floor, bw };
  }
  function marbleStep(dt, cx, cy, R) {
    if (!MB.list.length) return;
    const { n, floor, bw } = marbleGeom(), orbR = R * 1.12, ax = MB.gx * MG, ay = MB.gy * MG, sub = 3, h = dt / sub;
    for (let i = MB.list.length - 1; i >= 0; i--) { const b = MB.list[i]; if (b.pop) { b.pop -= dt * 2.6; if (b.pop <= 0) MB.list.splice(i, 1); } }
    for (const b of MB.list) {
      b.t += dt;
      if (b.held) { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 10) b.trail.shift(); continue; }
      if (b.pop) continue;
      for (let s = 0; s < sub; s++) {
        b.vx += ax * h; b.vy += ay * h; b.vx *= 1 - .08 * h; b.x += b.vx * h; b.y += b.vy * h;
        // floor xylophone
        if (b.y + b.r > floor && b.vy > 0) {
          const imp = b.vy; b.y = floor - b.r; b.vy = -imp * .76; b.vx *= .985;
          if (imp > 70) { const k = clampN(Math.floor(b.x / bw), 0, n - 1); marbleSound('bar', b, imp, k); MB.glow[k] = Math.min(1.4, (MB.glow[k] || 0) + .5 + imp / 1400); }
        }
        // ceiling only when gravity points up (tilted), otherwise sky is open
        if (b.y - b.r < 0 && ay < 0 && b.vy < 0) { b.y = b.r; b.vy = -b.vy * .7; }
        // walls
        if (b.x - b.r < 0 && b.vx < 0) { b.x = b.r; const imp = -b.vx; b.vx = imp * .72; if (imp > 160) marbleSound('tok', b, imp * .5, 1); }
        if (b.x + b.r > W && b.vx > 0) { b.x = W - b.r; const imp = b.vx; b.vx = -imp * .72; if (imp > 160) marbleSound('tok', b, imp * .5, 3); }
        // the orb: a steel handpan
        const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy), md = orbR + b.r;
        if (d < md && d > .01) {
          const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
          b.x = cx + nx * md; b.y = cy + ny * md;
          if (vn < 0) { b.vx -= 1.84 * vn * nx; b.vy -= 1.84 * vn * ny; if (-vn > 80) { const sector = Math.floor(((Math.atan2(ny, nx) + Math.PI) / (Math.PI * 2)) * 6); marbleSound('orb', b, -vn, sector); V.kick = Math.max(V.kick, .5 + Math.min(.5, -vn / 1600)); MB.orbFlash = 1; } }
        }
      }
      const sp = Math.hypot(b.vx, b.vy);
      b.rest = (sp < 40 && b.y + b.r >= floor - 2) ? b.rest + dt : 0;
      if (b.rest > .8 || b.t > 22 || b.y > H + 200 || b.y < -H * 2) b.pop = 1;
      b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 10) b.trail.shift();
    }
    // marble ↔ marble (elastic, wood "tok")
    const L = MB.list;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const b = L[i], o = L[j]; if (b.pop || o.pop) continue;
      const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy), md = o.r + b.r;
      if (d >= md || d < .01) continue;
      const nx = dx / d, ny = dy / d, rv = (o.vx - b.vx) * nx + (o.vy - b.vy) * ny, ov = (md - d) / 2;
      if (!b.held) { b.x -= nx * ov; b.y -= ny * ov; } if (!o.held) { o.x += nx * ov; o.y += ny * ov; }
      if (rv < 0) { const jj = -rv * .92; if (!b.held) { b.vx -= jj * nx; b.vy -= jj * ny; } if (!o.held) { o.vx += jj * nx; o.vy += jj * ny; } if (-rv > 140) marbleSound('tok', b, -rv * .6, MB.hits % 5); }
    }
  }
  function marbleSound(kind, b, imp, idx) {
    const vel = Math.min(1, imp / 1300), m = eng.marbleHit(kind, b.x / W, vel, idx);
    if (m == null) return; MB.hits++;
    for (let k = 0; k < 3 + vel * 6; k++) { const a = Math.random() * 7, s = 40 + Math.random() * 160 * vel; MB.sparks.push({ x: b.x, y: b.y + (kind === 'bar' ? b.r : 0), vx: Math.cos(a) * s, vy: Math.sin(a) * s - (kind === 'bar' ? 60 : 0), life: .8, ch: b.ch }); }
    if (kind !== 'tok' && vel > .55) bloom(b.x, b.y, m, .8);
    if (vel > .45) haptic(kind === 'orb' ? 'tick' : 'soft');
  }
  function drawMarbles(dt, cx, cy, R, c1, c2, c3) {
    MB.vis += ((MB.on || MB.list.length ? 1 : 0) - MB.vis) * Math.min(1, dt * 4);
    if (MB.vis < .01) return;
    const C = [c1, c2, c3], { n, floor, bw } = marbleGeom(), sc = (eng.scale || [0, 2, 4, 7, 9]).length;
    // the floor xylophone: one glowing bar per scale step; octave roots taller
    for (let i = 0; i < n; i++) {
      const gl = MB.glow[i] || 0; if (gl > 0) MB.glow[i] = Math.max(0, gl - dt * 2.2);
      const root = i % sc === 0, x = i * bw + 2, w = bw - 4, hh = (root ? 13 : 9) + gl * 10, col = C[i % sc === 0 ? 2 : i % 2];
      const a = MB.vis * (.22 + gl * .7);
      g2.fillStyle = hsa(col, a, gl * 14); roundRect(x, floor, w, hh, 4); g2.fill();
      if (gl > .05) { const gr = g2.createRadialGradient(x + w / 2, floor, 0, x + w / 2, floor, bw * 1.6 + gl * 30); gr.addColorStop(0, hsa(col, gl * .35 * MB.vis, 12)); gr.addColorStop(1, 'rgba(0,0,0,0)'); g2.fillStyle = gr; g2.fillRect(x - bw * 2, floor - bw * 2 - 30, bw * 5, bw * 4 + 60); }
    }
    if (MB.orbFlash > .02) { g2.strokeStyle = hsa(c3, MB.orbFlash * .7, 10); g2.lineWidth = 3 * MB.orbFlash; g2.beginPath(); g2.arc(cx, cy, R * 1.12, 0, 7); g2.stroke(); MB.orbFlash *= Math.pow(.01, dt); }
    for (let i = MB.sparks.length - 1; i >= 0; i--) { const s = MB.sparks[i]; s.life -= dt * 1.6; if (s.life <= 0) { MB.sparks.splice(i, 1); continue; } s.vy += 300 * dt; s.x += s.vx * dt; s.y += s.vy * dt; g2.fillStyle = hsa(C[s.ch], s.life, 14); g2.fillRect(s.x - 1.2, s.y - 1.2, 2.6, 2.6); }
    if (MB.sparks.length > 300) MB.sparks.splice(0, 100);
    for (const b of MB.list) {
      const al = b.pop ? Math.max(0, b.pop) : 1, col = C[b.ch], r = b.r * (b.pop ? 1 + (1 - b.pop) * 1.5 : 1);
      for (let k = 1; k < b.trail.length; k++) { const p = b.trail[k - 1], q = b.trail[k], f = k / b.trail.length; g2.strokeStyle = hsa(col, f * .35 * al); g2.lineWidth = r * 1.4 * f; g2.lineCap = 'round'; g2.beginPath(); g2.moveTo(p.x, p.y); g2.lineTo(q.x, q.y); g2.stroke(); }
      const halo = g2.createRadialGradient(b.x, b.y, 0, b.x, b.y, r * 3.2); halo.addColorStop(0, hsa(col, .45 * al, 8)); halo.addColorStop(1, 'rgba(0,0,0,0)'); g2.fillStyle = halo; g2.beginPath(); g2.arc(b.x, b.y, r * 3.2, 0, 7); g2.fill();
      const body = g2.createRadialGradient(b.x - r * .35, b.y - r * .4, r * .1, b.x, b.y, r); body.addColorStop(0, `rgba(255,255,255,${(.95 * al).toFixed(3)})`); body.addColorStop(.35, hsa(col, .9 * al, 6)); body.addColorStop(1, hsa(col, .5 * al, -20));
      g2.fillStyle = body; g2.beginPath(); g2.arc(b.x, b.y, r, 0, 7); g2.fill();
      if (b.held) { g2.strokeStyle = hsa(c3, .6); g2.lineWidth = 1.5; g2.setLineDash([3, 4]); g2.beginPath(); g2.arc(b.x, b.y, r + 7 + Math.sin(performance.now() / 120) * 2, 0, 7); g2.stroke(); g2.setLineDash([]); }
    }
  }
  function roundRect(x, y, w, h, r) { g2.beginPath(); g2.moveTo(x + r, y); g2.lineTo(x + w - r, y); g2.quadraticCurveTo(x + w, y, x + w, y + r); g2.lineTo(x + w, y + h - r); g2.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g2.lineTo(x + r, y + h); g2.quadraticCurveTo(x, y + h, x, y + h - r); g2.lineTo(x, y + r); g2.quadraticCurveTo(x, y, x + r, y); g2.closePath(); }
  function marbleGrab(e) {
    const b = marbleAdd(e.clientX, e.clientY); MB.hold = { id: e.pointerId, b };
    b.samp.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    try { $('pad').setPointerCapture(e.pointerId); } catch (er) {}
  }
  function marbleRelease() {
    const h = MB.hold; if (!h) return; MB.hold = null; const b = h.b, s = b.samp, now = performance.now();
    let recent = s.filter(p => now - p.t < 110); if (recent.length < 2) recent = s.slice(-2); const a = recent[0], z = s[s.length - 1];
    if (a && z && z.t - a.t > 4 && now - z.t < 160) { const k = 1000 / (z.t - a.t); b.vx = clampN((z.x - a.x) * k, -2600, 2600); b.vy = clampN((z.y - a.y) * k, -2600, 2600); }
    b.held = false;
  }
  window.__marbles = { toggle: marbleToggle, add: (x, y, vx, vy) => { const b = marbleAdd(x, y); b.held = false; b.vx = vx || 0; b.vy = vy || 0; return b; }, MB };

  // ---------- Ghost Hunt: theremin ghosts drift through the glow; tap one to burst it into a haunted organ chord ----------
  // every 5th catch summons the Witching Hour (bell tolls, a pumpkin/poison palette, a swarm of ghosts). Instrumental only.
  const today = new Date(), HALLOWEEN = today.getMonth() === 9 && today.getDate() >= 24;
  const WITCH = [[28, 96, 60], [118, 80, 58], [276, 72, 70], [272, 50, 5]];
  const GH = { list: [], bats: [], caught: 0, next: 0, witch: 0, witchTimer: 0 };
  V.ghosts = GH;
  if (HALLOWEEN) { const p = document.querySelector('#start p'); if (p) p.textContent = 'Invented genres · no vocals · 🎃 ghosts are out tonight'; }
  function ghostSpawn() {
    if (!eng || !eng.ghostHum || GH.list.length >= (GH.witch ? 5 : 3)) return;
    const fromL = Math.random() < .5, s = 30 + Math.random() * 18 + (W > 600 ? 12 : 0);
    const g = { x: fromL ? -s : W + s, y: H * (.14 + Math.random() * .42), vx: (fromL ? 1 : -1) * (18 + Math.random() * 26) * (W > 600 ? 1.6 : 1), ph: Math.random() * 7, s, t: 0, life: 10 + Math.random() * 6, a: 0, dead: 0 };
    g.hum = eng.ghostHum(g.x / W, 1 - g.y / H); GH.list.push(g);
    if (!ghostSpawn.told) { ghostSpawn.told = 1; toast('👻 A ghost is humming · tap it to catch'); }
  }
  function ghostUpdate(dt) {
    if (!playing) return;
    const now = ctx.currentTime;
    if (!GH.next) GH.next = now + (HALLOWEEN ? 4 : 20);
    if (now > GH.next) { ghostSpawn(); GH.next = now + (GH.witch ? 1.5 + Math.random() * 2.5 : HALLOWEEN ? 7 + Math.random() * 8 : 14 + Math.random() * 16); }
    for (let i = GH.list.length - 1; i >= 0; i--) {
      const g = GH.list[i]; g.t += dt;
      if (g.dead) { g.dead -= dt * 2.4; if (g.dead <= 0) GH.list.splice(i, 1); continue; }
      g.x += g.vx * dt; g.y += Math.sin(g.t * 1.7 + g.ph) * 22 * dt;
      g.a = Math.min(1, g.t / 1.2, Math.max(0, (g.life - g.t) / 1.5));
      if (g.hum && (i + (V.gf = (V.gf || 0) + 1)) % 6 === 0) g.hum.move(g.x / W, 1 - g.y / H);
      if (g.t > g.life || g.x < -g.s * 3 || g.x > W + g.s * 3) { if (g.hum) g.hum.stop(); GH.list.splice(i, 1); }
    }
  }
  function ghostsHush() { GH.list.forEach(g => g.hum && g.hum.stop()); GH.list.length = 0; }
  function ghostHit(x, y) {
    for (let i = GH.list.length - 1; i >= 0; i--) { const g = GH.list[i]; if (!g.dead && g.a > .2 && Math.hypot(x - g.x, y - g.y) < g.s * 1.35) return g; }
    return null;
  }
  function ghostCatch(g) {
    g.dead = 1; if (g.hum) g.hum.stop(true);
    GH.caught++; const big = GH.caught % 5 === 0;
    const m = eng.ghostCatch(g.x / W, 1 - g.y / H, big);
    const n = big ? 26 : 12;
    for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 220; GH.bats.push({ x: g.x, y: g.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 1, s: 6 + Math.random() * 8, f: Math.random() * 7 }); }
    GL.blooms.push({ x: g.x, y: g.y + 10, txt: big ? 'BOO!!' : 'boo', a: 1, s: big ? 2.4 : 1.6 });
    V.taps.push({ x: g.x, y: g.y, r: 0, a: 1 }); V.flash = Math.min(1, V.flash + (big ? .9 : .35));
    haptic('hard'); $('ghosts').textContent = '👻 ' + GH.caught; $('ghosts').classList.add('show', 'pop'); setTimeout(() => $('ghosts').classList.remove('pop'), 260);
    if (big) {
      GH.witch = 1; pal.tgt = WITCH.map(c => c.slice()); toast('🕯 Witching Hour'); GH.next = ctx.currentTime + 1;
      clearTimeout(GH.witchTimer); GH.witchTimer = setTimeout(() => { GH.witch = 0; if (eng) pal.tgt = pickScheme(eng.g); }, 24000);
    } else if (GH.caught === 1) toast('Caught one · 5 summons the Witching Hour');
    return m;
  }
  function drawGhosts(dt, c1, c2, c3) {
    const tnow = performance.now() / 1000;
    for (const g of GH.list) {
      const al = g.dead ? Math.max(0, g.dead) : g.a, s = g.s * (g.dead ? 1 + (1 - g.dead) * .9 : 1 + Math.sin(g.t * 3) * .03 + V.kick * .06);
      if (al <= 0) continue;
      g2.save(); g2.translate(g.x, g.y); g2.rotate(Math.sin(g.t * 1.3 + g.ph) * .12 + (g.vx > 0 ? .06 : -.06));
      const halo = g2.createRadialGradient(0, 0, 0, 0, 0, s * 2.4); halo.addColorStop(0, hsa(GH.witch ? WITCH[1] : c3, .3 * al, 10)); halo.addColorStop(1, 'rgba(0,0,0,0)');
      g2.fillStyle = halo; g2.beginPath(); g2.arc(0, 0, s * 2.4, 0, 7); g2.fill();
      g2.beginPath(); g2.moveTo(-s * .78, s * .15); g2.arc(0, -s * .1, s * .78, Math.PI, 0);
      g2.lineTo(s * .78, s * .9);
      for (let k = 0; k <= 4; k++) { const xx = s * .78 - k * s * .39, yy = s * .9 + Math.sin(tnow * 7 + k * 1.7 + g.ph) * s * .12 + (k % 2 ? -s * .16 : 0); g2.lineTo(xx, yy); }
      g2.closePath();
      g2.fillStyle = `rgba(240,236,255,${(.55 * al).toFixed(3)})`; g2.shadowColor = hsa(c1, .9); g2.shadowBlur = 18; g2.fill(); g2.shadowBlur = 0;
      g2.globalCompositeOperation = 'source-over';
      g2.fillStyle = `rgba(8,6,16,${(.85 * al).toFixed(3)})`;
      const blink = Math.sin(tnow * 1.1 + g.ph * 3) > .97 ? .15 : 1, eyeDx = g.vx > 0 ? s * .08 : -s * .08;
      g2.beginPath(); g2.ellipse(-s * .26 + eyeDx, -s * .18, s * .1, s * .15 * blink, 0, 0, 7); g2.ellipse(s * .26 + eyeDx, -s * .18, s * .1, s * .15 * blink, 0, 0, 7); g2.fill();
      g2.beginPath(); g2.ellipse(eyeDx, s * .2, s * .1, s * (.1 + .08 * Math.abs(Math.sin(tnow * 2.4 + g.ph))), 0, 0, 7); g2.fill(); // "oooo"
      g2.globalCompositeOperation = 'lighter';
      g2.restore();
    }
    for (let i = GH.bats.length - 1; i >= 0; i--) {
      const b = GH.bats[i]; b.life -= dt * .8; if (b.life <= 0) { GH.bats.splice(i, 1); continue; }
      b.vx *= Math.pow(.4, dt); b.vy = b.vy * Math.pow(.4, dt) - 40 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.f += dt * 22;
      const w = Math.sin(b.f) * .7, s = b.s;
      g2.fillStyle = hsa(GH.witch ? WITCH[0] : c2, b.life * .9, 4);
      g2.beginPath(); g2.moveTo(b.x, b.y);
      g2.quadraticCurveTo(b.x - s * .6, b.y - s * (.2 + w), b.x - s * 1.3, b.y - s * w * .6); g2.quadraticCurveTo(b.x - s * .7, b.y + s * .1, b.x, b.y + s * .25);
      g2.quadraticCurveTo(b.x + s * .7, b.y + s * .1, b.x + s * 1.3, b.y - s * w * .6); g2.quadraticCurveTo(b.x + s * .6, b.y - s * (.2 + w), b.x, b.y);
      g2.fill();
    }
    if (GH.bats.length > 200) GH.bats.splice(0, 60);
  }
  window.__ghost = { spawn: ghostSpawn, catch: () => GH.list[0] && ghostCatch(GH.list[0]), GH };

  // ---------- Cameos: a character for every genre family wanders through now and then; tap it for a musical payoff ----------
  // Each has its own look, motion and signature sound (see cameo.js). Met characters are collected (🐾 n/14). Instrumental only.
  const CM = { list: [], parts: [], next: 0, met: {} };
  try { CM.met = JSON.parse(localStorage.getItem('emm-zoo') || '{}') || {}; } catch (e) { CM.met = {}; }
  V.cameos = CM;
  const CMK = Object.keys(MM.CAMEOS || {});
  const zooText = () => '🐾 ' + Object.keys(CM.met).filter(k => CM.met[k] && MM.CAMEOS[k]).length + '/' + CMK.length;
  function zooShow(pop) { const z = $('zoo'); if (!z) return; z.textContent = zooText(); if (Object.keys(CM.met).some(k => CM.met[k] && MM.CAMEOS[k])) z.classList.add('show'); if (pop) { z.classList.add('pop'); setTimeout(() => z.classList.remove('pop'), 260); } }
  zooShow();
  // motion style per character
  const CMOVE = { lofi: 'float', house: 'hang', dnb: 'run', wave: 'drive', ambient: 'rise', dub: 'swim', trap: 'hop', jazz: 'walk', chip: 'bounce', afro: 'walk', cine: 'soar', techno: 'fly', garage: 'strut', prog: 'drift' };
  function cameoSpawn(kind) {
    if (!eng || !eng.cameoTap || CM.list.length) return null;
    if (!kind) { const f = (eng.g.famIds || []).filter(x => x && MM.CAMEOS[x]); kind = f.length ? f[Math.random() < .62 ? 0 : f.length - 1] : CMK[Math.floor(Math.random() * CMK.length)]; }
    const mv = CMOVE[kind], fromL = Math.random() < .5, dir = fromL ? 1 : -1, s = (W > 600 ? 48 : 40) * (mv === 'drive' ? 1.2 : mv === 'soar' ? 1.05 : 1);
    const floor = Math.min(H * .8, H - 196 - s * .4), /* feet just above the controls */ spd = { run: 120, drive: 150, hop: 70, bounce: 70, walk: 46, strut: 56, float: 34, swim: 40, soar: 70, fly: 64, drift: 30 }[mv] || 40;
    const c = { kind, mv, dir, s, t: 0, a: 0, dead: 0, happy: 0, ph: Math.random() * 7, life: 15 + Math.random() * 4, nextIdle: 0, gone: 0,
      x: fromL ? -s * 2 : W + s * 2, y: floor - s * .55, vx: dir * spd * (W > 600 ? 1.5 : 1), vy: 0, floor, base: 0 };
    if (mv === 'hang') { c.x = W * (.2 + Math.random() * .6); c.y = -s * 2; c.vx = 0; c.base = H * (.16 + Math.random() * .14); }
    else if (mv === 'rise') { c.x = W * (.15 + Math.random() * .7); c.y = H * .78; c.vx = dir * 8; c.base = H * .78; }
    else if (mv === 'swim' || mv === 'fly' || mv === 'drift') c.y = c.base = H * (.16 + Math.random() * .3);
    else if (mv === 'soar') c.y = c.base = H * (.12 + Math.random() * .16);
    else if (mv === 'drive') c.y = c.floor - s * .35;
    else if (mv === 'float') c.y = c.base = c.floor - s * 1.1;
    CM.list.push(c);
    const info = MM.CAMEOS[kind]; if (!CM.met['seen_' + kind]) { CM.met['seen_' + kind] = 0; toast(info.emoji + ' ' + info.name + ' is passing by · tap it'); }
    return c;
  }
  function cameoUpdate(dt) {
    if (!playing || !eng) return;
    const now = ctx.currentTime;
    if (!CM.next) CM.next = now + 9;
    if (now > CM.next && !CM.list.length) { cameoSpawn(); CM.next = now + 24 + Math.random() * 22; }
    const beat = 60 / eng.bpmNow();
    for (let i = CM.list.length - 1; i >= 0; i--) {
      const c = CM.list[i]; c.t += dt;
      if (c.dead) { c.dead -= dt * 1.2; if (c.dead <= 0) CM.list.splice(i, 1); continue; }
      if (c.happy > 0) c.happy -= dt;
      const leaving = c.t > c.life || c.gone;
      switch (c.mv) {
        case 'hang': { const tgt = leaving ? -c.s * 3 : c.base; c.y += (tgt - c.y) * Math.min(1, dt * 1.6); if (leaving && c.y < -c.s * 2.5) c.dead = .01; break; }
        case 'rise': c.y -= dt * (18 + (leaving ? 80 : 0)) * (1 + Math.max(0, Math.sin(c.t * 3)) * 1.5); c.x += c.vx * dt; if (c.y < -c.s * 3) c.dead = .01; break;
        case 'hop': { c.x += c.vx * dt * (leaving ? 2.4 : 1); const p = (c.t * 1.3) % 1; c.y = c.floor - c.s * .55 - Math.sin(p * Math.PI) * c.s * 2.2; break; }
        case 'bounce': { c.x += c.vx * dt * (leaving ? 2.4 : 1); const p = (c.t / beat / 2) % 1; c.y = c.floor - c.s * .5 - Math.sin(p * Math.PI) * c.s * 1.8; c.sq = p; break; }
        case 'swim': case 'fly': case 'drift': case 'soar': c.x += c.vx * dt * (leaving ? 2.6 : 1); c.y = c.base + Math.sin(c.t * (c.mv === 'soar' ? 1.6 : 1.1) + c.ph) * c.s * (c.mv === 'soar' ? 1.2 : .7); break;
        case 'float': c.x += c.vx * dt * (leaving ? 3 : 1); c.y = c.base + Math.sin(c.t * 1.4) * c.s * .2; break;
        default: c.x += c.vx * dt * (leaving ? 2.4 : 1);
      }
      if (c.happy > 0 && c.mv !== 'hang') c.y -= Math.sin(Math.max(0, c.happy) / 1.2 * Math.PI) * c.s * .06;
      c.a = Math.min(1, c.t / .8);
      if (c.x < -c.s * 4 || c.x > W + c.s * 4) { CM.list.splice(i, 1); continue; }
      if (!c.happy || c.happy <= 0) { if (now > c.nextIdle) { eng.cameoIdle(c.kind, c.x / W); c.nextIdle = now + beat * ((MM.CAMEOS[c.kind] || {}).idle || 4); } }
    }
  }
  function cameosHush() { CM.list.length = 0; }
  function cameoHit(x, y) { for (const c of CM.list) if (!c.dead && c.a > .2 && !c.gone && Math.hypot(x - c.x, y - c.y) < c.s * 1.45) return c; return null; }
  const CPART = { lofi: ['z', '#cbb8ff'], house: ['spark', '#fff6c2'], dnb: ['spark', '#59f3ff'], wave: ['laser', '#ff4fd8'], ambient: ['bubble', '#8ef6ff'], dub: ['bubble', '#9cffb0'], trap: ['drip', '#7cf0ff'], jazz: ['note', '#ffd36b'], chip: ['pixel', '#7dff6b'], afro: ['spark', null], cine: ['ember', '#ffb347'], techno: ['ring', '#8dff6a'], garage: ['note', '#c8a2ff'], prog: ['gear', '#e7c37a'] };
  function cameoTap(c) {
    const info = MM.CAMEOS[c.kind]; eng.cameoTap(c.kind, c.x / W, 1 - c.y / H); c.happy = 1.4; c.gone = 1; c.life = Math.min(c.life, c.t + 2);
    const [pk, col] = CPART[c.kind] || ['spark', '#fff'];
    for (let k = 0; k < 22; k++) { const a = Math.random() * 7, sp = 70 + Math.random() * 230; CM.parts.push({ x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 70, life: 1, k: pk, col: col || `hsl(${Math.floor(Math.random() * 360)} 90% 65%)`, s: 4 + Math.random() * 7, r: Math.random() * 7 }); }
    GL.blooms.push({ x: c.x, y: c.y - c.s * .4, txt: info.word, a: 1, s: 1.5 }); V.taps.push({ x: c.x, y: c.y, r: 0, a: 1 }); V.flash = Math.min(1, V.flash + .3);
    haptic('hard');
    const first = !CM.met[c.kind]; CM.met[c.kind] = 1; try { localStorage.setItem('emm-zoo', JSON.stringify(CM.met)); } catch (e) {}
    zooShow(true); if (first) toast(info.emoji + ' New friend: ' + info.name + ' · ' + zooText().slice(3) + ' met');
    return c.kind;
  }
  // --- drawing ---
  const rr = (x, y, w, h, r) => { g2.beginPath(); g2.moveTo(x + r, y); g2.arcTo(x + w, y, x + w, y + h, r); g2.arcTo(x + w, y + h, x, y + h, r); g2.arcTo(x, y + h, x, y, r); g2.arcTo(x, y, x + w, y, r); g2.closePath(); };
  const circ = (x, y, r, f) => { g2.beginPath(); g2.arc(x, y, Math.max(.1, r), 0, 7); if (f) { g2.fillStyle = f; g2.fill(); } };
  const ell = (x, y, a, b, rot, f) => { g2.beginPath(); g2.ellipse(x, y, Math.max(.1, a), Math.max(.1, b), rot || 0, 0, 7); if (f) { g2.fillStyle = f; g2.fill(); } };
  const ln = (pts, col, w) => { g2.beginPath(); pts.forEach((p, i) => i ? g2.lineTo(p[0], p[1]) : g2.moveTo(p[0], p[1])); g2.strokeStyle = col; g2.lineWidth = w; g2.lineCap = 'round'; g2.lineJoin = 'round'; g2.stroke(); };
  const eyes = (x, y, gap, r, col, look) => { circ(x - gap, y, r, '#fff'); circ(x + gap, y, r, '#fff'); circ(x - gap + (look || 0), y + r * .1, r * .55, col || '#16121f'); circ(x + gap + (look || 0), y + r * .1, r * .55, col || '#16121f'); circ(x - gap + (look || 0) + r * .2, y - r * .2, r * .18, '#fff'); circ(x + gap + (look || 0) + r * .2, y - r * .2, r * .18, '#fff'); };
  const smile = (x, y, w, col, lw) => { g2.beginPath(); g2.arc(x, y - w * .5, w, .25 * Math.PI, .75 * Math.PI); g2.strokeStyle = col || '#16121f'; g2.lineWidth = lw || 2; g2.lineCap = 'round'; g2.stroke(); };
  const DRAW = {
    lofi(s, T, c) { // sleepy cat in big headphones on a floating cushion
      rr(-s * .95, s * .35, s * 1.9, s * .42, s * .2); g2.fillStyle = '#6c5ce7'; g2.fill(); rr(-s * .8, s * .3, s * 1.6, s * .16, s * .08); g2.fillStyle = '#8f83ff'; g2.fill();
      ln([[s * .55, s * .3], [s * 1.05, s * .1 + Math.sin(T * 2.2) * s * .15], [s * 1.0, -s * .3 + Math.sin(T * 2.2 + 1) * s * .2]], '#a99bc9', s * .16); // tail
      ell(0, s * .08, s * .72, s * .42, 0, '#b9a8d8');
      const nod = Math.sin(T * 2) * .06 + V.kick * .05; g2.save(); g2.translate(0, -s * .32); g2.rotate(nod);
      g2.beginPath(); g2.moveTo(-s * .5, -s * .2); g2.lineTo(-s * .42, -s * .72); g2.lineTo(-s * .12, -s * .45); g2.moveTo(s * .5, -s * .2); g2.lineTo(s * .42, -s * .72); g2.lineTo(s * .12, -s * .45); g2.fillStyle = '#b9a8d8'; g2.fill();
      circ(0, 0, s * .52, '#c7b8e4');
      g2.beginPath(); g2.arc(0, -s * .05, s * .6, Math.PI * 1.05, Math.PI * 1.95); g2.strokeStyle = '#2b2440'; g2.lineWidth = s * .12; g2.stroke(); // band
      ell(-s * .56, s * .02, s * .16, s * .24, 0, '#ff8fb1'); ell(s * .56, s * .02, s * .16, s * .24, 0, '#ff8fb1'); ell(-s * .56, s * .02, s * .07, s * .14, 0, '#2b2440'); ell(s * .56, s * .02, s * .07, s * .14, 0, '#2b2440');
      const happy = c.happy > 0; g2.strokeStyle = '#2b2440'; g2.lineWidth = s * .06; g2.lineCap = 'round';
      [-1, 1].forEach(k => { g2.beginPath(); if (happy) { circ(k * s * .2, -s * .04, s * .09, '#2b2440'); } else { g2.arc(k * s * .2, -s * .06, s * .1, .15 * Math.PI, .85 * Math.PI); g2.stroke(); } });
      circ(0, s * .1, s * .05, '#ff8fb1'); smile(-s * .06, s * .2, s * .07, '#2b2440', s * .04); smile(s * .06, s * .2, s * .07, '#2b2440', s * .04);
      g2.restore();
    },
    house(s, T, c) { // mirrorball with shades on a string
      ln([[0, -s * .8], [0, -H]], 'rgba(220,220,235,.5)', 1.2);
      const gr = g2.createRadialGradient(-s * .3, -s * .3, s * .1, 0, 0, s * .85); gr.addColorStop(0, '#ffffff'); gr.addColorStop(.5, '#c9cfe0'); gr.addColorStop(1, '#6d7390'); circ(0, 0, s * .8, gr);
      g2.save(); g2.beginPath(); g2.arc(0, 0, s * .8, 0, 7); g2.clip(); g2.strokeStyle = 'rgba(40,44,70,.45)'; g2.lineWidth = 1;
      for (let k = -3; k <= 3; k++) { g2.beginPath(); g2.moveTo(-s, k * s * .22); g2.lineTo(s, k * s * .22); g2.stroke(); }
      for (let k = 0; k < 8; k++) { const xx = Math.sin(T * 1.5 + k * Math.PI / 8 * 2) * s * .8; g2.beginPath(); g2.ellipse(0, 0, Math.abs(xx), s * .8, 0, 0, 7); g2.stroke(); }
      for (let k = 0; k < 6; k++) { const a = T * 2 + k; if (Math.sin(a * 3) > .6) circ(Math.cos(a) * s * .5, Math.sin(a * 1.3) * s * .5, s * .06, '#fff'); }
      g2.restore();
      rr(-s * .52, -s * .2, s * .44, s * .2, s * .08); g2.fillStyle = '#111'; g2.fill(); rr(s * .08, -s * .2, s * .44, s * .2, s * .08); g2.fill(); ln([[-s * .08, -s * .12], [s * .08, -s * .12]], '#111', s * .05);
      smile(0, s * .32, s * .2, '#1b1b2b', s * .06);
      g2.globalCompositeOperation = 'lighter'; for (let k = 0; k < 6; k++) { const a = T * .9 + k * 1.05; g2.fillStyle = `hsla(${(k * 60 + T * 40) % 360},90%,65%,.07)`; g2.beginPath(); g2.moveTo(0, 0); g2.lineTo(Math.cos(a - .07) * s * 7, Math.sin(a - .07) * s * 7); g2.lineTo(Math.cos(a + .07) * s * 7, Math.sin(a + .07) * s * 7); g2.fill(); } g2.globalCompositeOperation = 'source-over';
    },
    dnb(s, T, c) { // little running robot with LED visor
      const run = T * 14, l1 = Math.sin(run) * s * .3, l2 = -l1;
      ln([[-s * .2, s * .45], [-s * .2 + l1, s * .95]], '#7d8fa3', s * .14); ln([[s * .2, s * .45], [s * .2 + l2, s * .95]], '#7d8fa3', s * .14);
      rr(-s * .45, -s * .05, s * .9, s * .55, s * .1); g2.fillStyle = '#9fb4c7'; g2.fill();
      for (let k = 0; k < 3; k++) circ(-s * .2 + k * s * .2, s * .22, s * .06, Math.sin(T * 8 + k) > 0 ? '#ff4d6d' : '#ffd166');
      ln([[-s * .45, s * .1], [-s * .75, s * .1 + Math.sin(run + 1) * s * .25]], '#7d8fa3', s * .1); ln([[s * .45, s * .1], [s * .75, s * .1 - Math.sin(run + 1) * s * .25]], '#7d8fa3', s * .1);
      const bob = Math.abs(Math.sin(run)) * s * .05; rr(-s * .5, -s * .75 - bob, s * 1, s * .62, s * .14); g2.fillStyle = '#c9d6e3'; g2.fill();
      rr(-s * .38, -s * .6 - bob, s * .76, s * .3, s * .1); g2.fillStyle = '#102030'; g2.fill();
      const sc = (T * 3) % 1; g2.fillStyle = '#59f3ff'; g2.shadowColor = '#59f3ff'; g2.shadowBlur = 10; rr(-s * .26 + sc * s * .1, -s * .52 - bob, s * .14, s * .12, s * .03); g2.fill(); rr(s * .08 + sc * s * .1, -s * .52 - bob, s * .14, s * .12, s * .03); g2.fill(); g2.shadowBlur = 0;
      ln([[0, -s * .75 - bob], [0, -s * 1.05 - bob]], '#7d8fa3', s * .06); circ(0, -s * 1.08 - bob, s * .09, Math.sin(T * 10) > 0 ? '#ff4d6d' : '#ff9fb0');
      for (let k = 0; k < 3; k++) ln([[-c.dir * s * (.8 + k * .25), -s * .3 + k * s * .25], [-c.dir * s * (1.3 + k * .3), -s * .3 + k * s * .25]], 'rgba(89,243,255,.45)', 2);
    },
    wave(s, T, c) { // retro neon time car (side view)
      g2.globalCompositeOperation = 'lighter'; for (let k = 0; k < 4; k++) ln([[-s * 1.1, s * (-.1 + k * .1)], [-s * (2.6 + k * .5 + Math.sin(T * 9 + k) * .2), s * (-.1 + k * .1)]], k % 2 ? 'rgba(255,79,216,.55)' : 'rgba(89,243,255,.55)', 3); g2.globalCompositeOperation = 'source-over';
      ell(0, s * .38, s * 1.2, s * .1, 0, 'rgba(255,79,216,.55)');
      g2.beginPath(); g2.moveTo(-s * 1.15, s * .25); g2.lineTo(-s * 1.15, -s * .1); g2.lineTo(-s * .55, -s * .2); g2.lineTo(-s * .25, -s * .48); g2.lineTo(s * .35, -s * .48); g2.lineTo(s * .7, -s * .18); g2.lineTo(s * 1.2, -s * .08); g2.lineTo(s * 1.2, s * .25); g2.closePath();
      const gr = g2.createLinearGradient(0, -s * .5, 0, s * .3); gr.addColorStop(0, '#e8edf6'); gr.addColorStop(1, '#8c95a8'); g2.fillStyle = gr; g2.fill();
      g2.beginPath(); g2.moveTo(-s * .2, -s * .42); g2.lineTo(s * .32, -s * .42); g2.lineTo(s * .58, -s * .2); g2.lineTo(-s * .45, -s * .2); g2.closePath(); g2.fillStyle = '#17142e'; g2.fill();
      ln([[-s * .05, -s * .38], [s * .2, -s * .24]], 'rgba(89,243,255,.8)', 2);
      ln([[-s * 1.1, s * .02], [s * 1.15, s * .02]], '#ff4fd8', 2); rr(-s * 1.17, -s * .06, s * .12, s * .1, 2); g2.fillStyle = '#ff2a4f'; g2.fill(); rr(s * 1.08, -s * .04, s * .12, s * .08, 2); g2.fillStyle = '#fff6c2'; g2.fill();
      [-s * .65, s * .7].forEach(wx => { circ(wx, s * .26, s * .24, '#141420'); circ(wx, s * .26, s * .12, '#59f3ff'); const a = T * 18; ln([[wx + Math.cos(a) * s * .2, s * .26 + Math.sin(a) * s * .2], [wx - Math.cos(a) * s * .2, s * .26 - Math.sin(a) * s * .2]], '#141420', 2); });
    },
    ambient(s, T, c) { // bioluminescent jellyfish
      const pulse = .85 + .15 * Math.sin(T * 3);
      g2.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 5; k++) { const x0 = (-.5 + k * .25) * s; const pts = []; for (let j = 0; j <= 8; j++) pts.push([x0 + Math.sin(T * 2.4 + j * .7 + k) * s * .12 * (j / 8), s * .1 + j * s * .17]); ln(pts, 'rgba(142,246,255,.45)', 2.2); }
      g2.beginPath(); g2.ellipse(0, 0, s * .75 * (2 - pulse), s * .62 * pulse, 0, Math.PI, 0); g2.closePath(); const gr = g2.createRadialGradient(0, -s * .2, 0, 0, -s * .1, s * .8); gr.addColorStop(0, 'rgba(255,190,255,.75)'); gr.addColorStop(1, 'rgba(120,200,255,.35)'); g2.fillStyle = gr; g2.fill();
      g2.globalCompositeOperation = 'source-over';
      eyes(0, -s * .22, s * .18, s * .09, '#2a1840'); ell(-s * .35, -s * .08, s * .08, s * .04, 0, 'rgba(255,120,180,.6)'); ell(s * .35, -s * .08, s * .08, s * .04, 0, 'rgba(255,120,180,.6)'); smile(0, -s * .02, s * .08, '#2a1840', s * .04);
    },
    dub(s, T, c) { // sea turtle in a red-gold-green knit cap
      const pad = Math.sin(T * 3.2) * .5;
      ell(-s * .45, s * .32, s * .32, s * .12, .6 + pad, '#86c46e'); ell(s * .45, s * .32, s * .32, s * .12, -.6 - pad, '#86c46e'); ell(-s * .6, -s * .05, s * .36, s * .13, -.4 - pad, '#86c46e');
      circ(s * .9, -s * .1, s * .3, '#a7d58c'); circ(s * .98, -s * .18, s * .07, '#fff'); circ(s * 1.0, -s * .17, s * .04, '#122'); smile(s * .98, -s * .02, s * .1, '#244', s * .04);
      ['#d8342b', '#f2c12e', '#2f9e44'].forEach((col, k) => { g2.beginPath(); g2.arc(s * .88, -s * .22, s * (.33 - k * .0), Math.PI * (1.1 + k * .0), Math.PI * 1.95); g2.lineWidth = s * .09; g2.strokeStyle = col; g2.save(); g2.translate(0, -k * s * .08); g2.stroke(); g2.restore(); });
      g2.beginPath(); g2.ellipse(0, s * .05, s * .8, s * .55, 0, Math.PI, 0); g2.closePath(); g2.fillStyle = '#3f8f5a'; g2.fill();
      g2.strokeStyle = '#7cc48a'; g2.lineWidth = 2; for (let k = -1; k <= 1; k++) { g2.beginPath(); for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2; const x = k * s * .42 + Math.cos(a) * s * .16, y = -s * .2 + Math.sin(a) * s * .14; j ? g2.lineTo(x, y) : g2.moveTo(x, y); } g2.closePath(); g2.stroke(); }
      rr(-s * .82, s * .02, s * 1.64, s * .1, s * .05); g2.fillStyle = '#2d6b43'; g2.fill();
    },
    trap(s, T, c) { // frog in shades + gold chain
      ell(0, s * .2, s * .78, s * .55, 0, '#5fd068'); ell(0, s * .38, s * .55, s * .32, 0, '#b6f2a4');
      circ(-s * .38, -s * .32, s * .26, '#5fd068'); circ(s * .38, -s * .32, s * .26, '#5fd068');
      rr(-s * .66, -s * .44, s * .52, s * .24, s * .1); g2.fillStyle = '#0d0d12'; g2.fill(); rr(s * .14, -s * .44, s * .52, s * .24, s * .1); g2.fill(); ln([[-s * .14, -s * .36], [s * .14, -s * .36]], '#0d0d12', s * .06);
      ln([[-s * .55, -s * .4], [-s * .35, -s * .26]], 'rgba(255,255,255,.7)', 2); ln([[s * .25, -s * .4], [s * .45, -s * .26]], 'rgba(255,255,255,.7)', 2);
      g2.beginPath(); g2.arc(0, -s * .1, s * .36, .15 * Math.PI, .85 * Math.PI); g2.strokeStyle = '#1d5b26'; g2.lineWidth = s * .06; g2.stroke();
      g2.beginPath(); g2.arc(0, -s * .05, s * .58, .2 * Math.PI, .8 * Math.PI); g2.strokeStyle = '#f5c542'; g2.lineWidth = s * .08; g2.setLineDash([s * .07, s * .04]); g2.stroke(); g2.setLineDash([]);
      circ(0, s * .5, s * .1, '#f5c542');
    },
    jazz(s, T, c) { // black cat in a beret playing a gold sax
      const sw = Math.sin(T * 3) * .08; g2.rotate(sw);
      ln([[-s * .2, s * .5], [-s * .25, s * .95]], '#2a2633', s * .16); ln([[s * .2, s * .5], [s * .25, s * .95]], '#2a2633', s * .16);
      ln([[-s * .3, s * .4], [-s * .8, s * .3 + Math.sin(T * 2) * s * .2], [-s * .9, -s * .2]], '#2a2633', s * .12);
      ell(0, s * .2, s * .42, s * .45, 0, '#2a2633');
      circ(0, -s * .45, s * .4, '#2a2633'); g2.beginPath(); g2.moveTo(-s * .35, -s * .6); g2.lineTo(-s * .28, -s * 1); g2.lineTo(-s * .05, -s * .78); g2.moveTo(s * .35, -s * .6); g2.lineTo(s * .28, -s * 1); g2.lineTo(s * .05, -s * .78); g2.fillStyle = '#2a2633'; g2.fill();
      ell(-s * .05, -s * .82, s * .36, s * .1, -.2, '#d8342b'); circ(-s * .05, -s * .93, s * .05, '#d8342b');
      ell(-s * .15, -s * .5, s * .09, s * (c.happy > 0 ? .03 : .06), 0, '#ffd36b'); ell(s * .15, -s * .5, s * .09, s * (c.happy > 0 ? .03 : .06), 0, '#ffd36b');
      g2.beginPath(); g2.moveTo(s * .05, -s * .3); g2.quadraticCurveTo(s * .3, -s * .25, s * .35, s * .1); g2.quadraticCurveTo(s * .4, s * .55, s * .7, s * .45); g2.strokeStyle = '#f5c542'; g2.lineWidth = s * .13; g2.lineCap = 'round'; g2.stroke();
      g2.beginPath(); g2.moveTo(s * .6, s * .3); g2.lineTo(s * .95, s * .12); g2.lineTo(s * .88, s * .52); g2.closePath(); g2.fillStyle = '#f5c542'; g2.fill();
      for (let k = 0; k < 3; k++) circ(s * (.33 + k * .02), -s * .05 + k * s * .13, s * .035, '#a8801c');
    },
    chip(s, T, c) { // pixel-art slime (squash & stretch)
      const p = c.sq || 0, sq = p < .08 || p > .92 ? .8 : 1.05, b = s / 4.2, M = ['..XXXX..', '.XXXXXX.', 'XXWXXWXX', 'XXBXXBXX', 'XXXXXXXX', 'XXXMMXXX', '.XXXXXX.'];
      g2.save(); g2.scale(1 / sq, sq);
      const col = { X: '#7dff6b', W: '#ffffff', B: '#10301a', M: '#ff5fa2' };
      M.forEach((row, y) => row.split('').forEach((ch, x) => { if (ch === '.') return; g2.fillStyle = col[ch]; g2.fillRect((x - 4) * b, (y - 4) * b, b + .5, b + .5); }));
      g2.fillStyle = '#c6ffbc'; g2.fillRect(-3 * b, -3 * b, b, b); g2.restore();
    },
    afro(s, T, c) { // colour-shifting chameleon on a branch, curly tail, rolling eye
      const h = (T * 60) % 360, body = `hsl(${h} 75% 55%)`, belly = `hsl(${(h + 40) % 360} 85% 70%)`;
      ln([[-s * 1.2, s * .55], [s * 1.2, s * .55]], '#7a4b2a', s * .12);
      g2.beginPath(); g2.arc(-s * .85, s * .05, s * .25, 0, Math.PI * 1.6); g2.strokeStyle = body; g2.lineWidth = s * .14; g2.stroke();
      ell(0, 0, s * .7, s * .4, 0, body); ell(0, s * .15, s * .55, s * .18, 0, belly);
      for (let k = 0; k < 4; k++) circ(-s * .35 + k * s * .23, -s * .12, s * .06, ['#f2c12e', '#d8342b', '#2f9e44', '#111'][k]);
      const step = Math.sin(T * 6) * s * .1; ln([[-s * .35, s * .3], [-s * .4 + step, s * .55]], body, s * .1); ln([[s * .35, s * .3], [s * .4 - step, s * .55]], body, s * .1);
      ell(s * .75, -s * .05, s * .32, s * .26, -.2, body); circ(s * .78, -s * .12, s * .15, belly); const a = T * 2.5; circ(s * .78 + Math.cos(a) * s * .06, -s * .12 + Math.sin(a) * s * .06, s * .06, '#111');
      if (c.happy > 0) ln([[s * 1.02, s * .02], [s * (1.02 + Math.sin(c.happy * 4) * .9), s * .0]], '#ff5fa2', s * .06);
    },
    cine(s, T, c) { // paper dragon kite with trailing body segments
      const segs = 7;
      for (let k = segs; k >= 1; k--) { const x = -c.dir * k * s * .42, y = Math.sin(T * 3 - k * .7) * s * .35; circ(x, y, s * (.3 - k * .02), k % 2 ? '#e63946' : '#f4a261'); ln([[x, y - s * .25], [x, y - s * .42]], '#f2c12e', 3); }
      ln([[-c.dir * segs * s * .42, 0], [-c.dir * segs * s * .42 - c.dir * s * .5, s * 2.2]], 'rgba(255,240,220,.45)', 1);
      g2.save(); if (c.dir < 0) g2.scale(-1, 1);
      g2.beginPath(); g2.moveTo(-s * .3, -s * .35); g2.lineTo(s * .55, -s * .2); g2.lineTo(s * .62, s * .15); g2.lineTo(-s * .3, s * .35); g2.closePath(); g2.fillStyle = '#e63946'; g2.fill();
      ln([[-s * .1, -s * .3], [-s * .35, -s * .75]], '#f2c12e', s * .08); ln([[s * .15, -s * .28], [s * .05, -s * .72]], '#f2c12e', s * .08);
      eyes(s * .2, -s * .08, s * .0, s * .12, '#111'); ln([[s * .62, s * .05], [s * .9, s * .25 + Math.sin(T * 4) * s * .1]], '#f2c12e', 2); ln([[s * .62, s * .1], [s * .95, s * .4 + Math.sin(T * 4 + 1) * s * .1]], '#f2c12e', 2);
      rr(-s * .2, s * .12, s * .7, s * .08, 2); g2.fillStyle = '#fff6e0'; g2.fill();
      g2.restore();
    },
    techno(s, T, c) { // little green alien in a saucer, tractor beam on the beat
      g2.globalCompositeOperation = 'lighter'; const bm = .1 + V.kick * .25 + (c.happy > 0 ? .3 : 0); g2.fillStyle = `rgba(141,255,106,${bm.toFixed(3)})`; g2.beginPath(); g2.moveTo(-s * .35, s * .2); g2.lineTo(s * .35, s * .2); g2.lineTo(s * .9, s * 2.4); g2.lineTo(-s * .9, s * 2.4); g2.closePath(); g2.fill(); g2.globalCompositeOperation = 'source-over';
      g2.beginPath(); g2.ellipse(0, -s * .15, s * .45, s * .5, 0, Math.PI, 0); g2.fillStyle = 'rgba(170,230,255,.35)'; g2.fill();
      circ(0, -s * .35, s * .24, '#8dff6a'); ell(-s * .1, -s * .37, s * .08, s * .11, -.4, '#0b0b14'); ell(s * .1, -s * .37, s * .08, s * .11, .4, '#0b0b14');
      ln([[-s * .1, -s * .55], [-s * .2, -s * .78]], '#8dff6a', 2); ln([[s * .1, -s * .55], [s * .2, -s * .78]], '#8dff6a', 2); circ(-s * .2, -s * .8, s * .05, '#ff4fd8'); circ(s * .2, -s * .8, s * .05, '#ff4fd8');
      ell(0, 0, s * 1, s * .28, 0, '#b6c2d1'); ell(0, -s * .06, s * .9, s * .12, 0, '#dfe6ef');
      for (let k = 0; k < 7; k++) circ(-s * .75 + k * s * .25, s * .08, s * .05, ((Math.floor(T * 8) + k) % 3) ? '#59f3ff' : '#ffd166');
    },
    garage(s, T, c) { // strutting pigeon with a backwards cap, head bobbing to the beat
      const bob = Math.sin(T * Math.PI * 2 * (eng ? eng.bpmNow() / 60 / 2 : 1)) * s * .12, step = Math.sin(T * 7) * s * .12;
      g2.save(); if (c.dir < 0) g2.scale(-1, 1);
      ln([[-s * .1, s * .35], [-s * .12 + step, s * .85]], '#ff8fa0', s * .06); ln([[s * .12, s * .35], [s * .1 - step, s * .85]], '#ff8fa0', s * .06);
      ell(-s * .1, s * .1, s * .62, s * .42, -.15, '#9aa3b5'); ell(-s * .35, s * .05, s * .38, s * .2, -.3, '#7b8396'); ln([[-s * .7, s * .15], [-s * .98, s * .3]], '#5f6678', s * .16);
      ell(s * .3 + bob * .5, -s * .15, s * .18, s * .28, .3, '#5fb3a0'); ell(s * .25 + bob * .5, -s * .1, s * .1, s * .2, .3, 'rgba(160,110,220,.7)');
      circ(s * .45 + bob, -s * .45, s * .22, '#9aa3b5'); circ(s * .5 + bob, -s * .5, s * .06, '#ff9f1c'); circ(s * .51 + bob, -s * .5, s * .03, '#111');
      g2.beginPath(); g2.moveTo(s * .64 + bob, -s * .48); g2.lineTo(s * .82 + bob, -s * .42); g2.lineTo(s * .64 + bob, -s * .38); g2.fillStyle = '#4b4b55'; g2.fill();
      g2.beginPath(); g2.arc(s * .45 + bob, -s * .5, s * .22, Math.PI, 0); g2.fillStyle = '#26325c'; g2.fill(); rr(s * .05 + bob, -s * .56, s * .24, s * .07, 2); g2.fill(); circ(s * .45 + bob, -s * .72, s * .03, '#f2c12e');
      g2.restore();
    },
    prog(s, T, c) { // clockwork octopus: 7 arms ticking in 2+2+3, gear spinning on its head
      const tick = Math.floor(T * 4) % 7, grp = [0, 0, 1, 1, 2, 2, 2];
      for (let k = 0; k < 7; k++) { const a = Math.PI * (.12 + k * .76 / 6), on = grp[k] === grp[tick] ? 1 : 0, pts = []; for (let j = 0; j <= 6; j++) { const r = s * (.35 + j * .13), w = Math.sin(T * 3 + k + j * .8) * .15 + on * .2 * Math.sin(j); pts.push([Math.cos(a + w) * r, s * .1 + Math.sin(a + w) * r]); } ln(pts, on ? '#c77dff' : '#9d4edd', s * (.14 - 0)); }
      const gx = s * .05, gy = -s * .85, ga = T * 2; g2.save(); g2.translate(gx, gy); g2.rotate(ga); g2.beginPath(); for (let k = 0; k < 16; k++) { const r = k % 2 ? s * .26 : s * .34, a = k / 16 * Math.PI * 2; g2.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g2.closePath(); g2.fillStyle = '#e7c37a'; g2.fill(); circ(0, 0, s * .1, '#7a5a1c'); g2.restore();
      ell(0, -s * .2, s * .62, s * .58, 0, '#b15cff'); circ(-s * .3, -s * .45, s * .08, 'rgba(255,255,255,.35)');
      eyes(0, -s * .2, s * .22, s * .12, '#240046'); g2.beginPath(); g2.arc(s * .22, -s * .2, s * .17, 0, 7); g2.strokeStyle = '#e7c37a'; g2.lineWidth = 2; g2.stroke(); ln([[s * .36, -s * .12], [s * .42, s * .2]], '#e7c37a', 1);
      smile(0, s * .08, s * .1, '#240046', s * .04);
    }
  };
  function drawCameos(dt, c1, c2, c3) {
    const T0 = performance.now() / 1000;
    for (const c of CM.list) {
      const al = c.dead ? Math.max(0, c.dead) : c.a; if (al <= 0) continue;
      const hp = c.happy > 0 ? c.happy / 1.4 : 0, sc = 1 + Math.sin(hp * Math.PI) * .25 + V.kick * .03;
      g2.save(); g2.translate(c.x, c.y);
      const halo = g2.createRadialGradient(0, 0, 0, 0, 0, c.s * 2.2); halo.addColorStop(0, hsa(c3, .22 * al + hp * .3, 8)); halo.addColorStop(1, 'rgba(0,0,0,0)'); g2.fillStyle = halo; g2.beginPath(); g2.arc(0, 0, c.s * 2.2, 0, 7); g2.fill();
      g2.globalCompositeOperation = 'source-over'; g2.globalAlpha = al; g2.scale(sc, sc);
      if (hp) g2.rotate(Math.sin(hp * Math.PI * 4) * .12);
      const flip = c.dir < 0 && !['cine', 'garage', 'house', 'ambient', 'techno', 'chip', 'prog'].includes(c.kind); if (flip) g2.scale(-1, 1);
      try { DRAW[c.kind](c.s, c.t + c.ph, c); } catch (e) { if (!drawCameos.err) { drawCameos.err = 1; console.error('cameo draw ' + c.kind + ': ' + e.message); } }
      g2.restore(); g2.globalAlpha = 1; g2.globalCompositeOperation = 'lighter';
      if (c.kind === 'lofi' && !c.happy && Math.random() < dt * .8) CM.parts.push({ x: c.x + c.s * .4, y: c.y - c.s * .8, vx: 12, vy: -26, life: 1, k: 'z', col: '#cbb8ff', s: 8, r: 0 });
      if (c.kind === 'jazz' && Math.random() < dt * 1.5) CM.parts.push({ x: c.x + c.dir * c.s * .9, y: c.y + c.s * .2, vx: c.dir * 20, vy: -40, life: 1, k: 'note', col: '#ffd36b', s: 9, r: 0 });
      if ((c.kind === 'dub' || c.kind === 'ambient') && Math.random() < dt * 2) CM.parts.push({ x: c.x + (Math.random() - .5) * c.s, y: c.y - c.s * .5, vx: 0, vy: -30, life: 1, k: 'bubble', col: c.kind === 'dub' ? '#9cffb0' : '#8ef6ff', s: 3 + Math.random() * 4, r: 0 });
    }
    g2.textAlign = 'center'; g2.textBaseline = 'middle';
    for (let i = CM.parts.length - 1; i >= 0; i--) {
      const p = CM.parts[i]; p.life -= dt * .7; if (p.life <= 0) { CM.parts.splice(i, 1); continue; }
      p.vx *= Math.pow(.5, dt); p.vy = p.vy * Math.pow(.5, dt) + (p.k === 'drip' || p.k === 'pixel' ? 160 : p.k === 'bubble' || p.k === 'z' || p.k === 'note' ? -10 : 20) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 4;
      const a = Math.min(1, p.life * 1.4); g2.fillStyle = p.col; g2.strokeStyle = p.col; g2.globalAlpha = a;
      switch (p.k) {
        case 'z': g2.font = `700 ${Math.round(p.s + 6)}px -apple-system,system-ui,sans-serif`; g2.fillText('z', p.x, p.y); break;
        case 'note': g2.font = `700 ${Math.round(p.s + 8)}px -apple-system,system-ui,sans-serif`; g2.fillText(p.r % 2 > 1 ? '♫' : '♪', p.x, p.y); break;
        case 'pixel': g2.fillRect(p.x, p.y, p.s, p.s); break;
        case 'bubble': g2.lineWidth = 1.4; g2.beginPath(); g2.arc(p.x, p.y, p.s, 0, 7); g2.stroke(); break;
        case 'laser': g2.lineWidth = 2; g2.beginPath(); g2.moveTo(p.x, p.y); g2.lineTo(p.x - p.vx * .08, p.y - p.vy * .08); g2.stroke(); break;
        case 'ring': g2.lineWidth = 2; g2.beginPath(); g2.arc(p.x, p.y, p.s * (2 - p.life) * 1.5, 0, 7); g2.stroke(); break;
        case 'gear': g2.save(); g2.translate(p.x, p.y); g2.rotate(p.r); g2.beginPath(); for (let k = 0; k < 12; k++) { const r = k % 2 ? p.s * .7 : p.s, an = k / 12 * Math.PI * 2; g2.lineTo(Math.cos(an) * r, Math.sin(an) * r); } g2.closePath(); g2.fill(); g2.restore(); break;
        case 'drip': g2.beginPath(); g2.arc(p.x, p.y, p.s * .5, 0, Math.PI); g2.lineTo(p.x, p.y - p.s); g2.closePath(); g2.fill(); break;
        default: g2.beginPath(); g2.moveTo(p.x, p.y - p.s); g2.lineTo(p.x + p.s * .3, p.y); g2.lineTo(p.x, p.y + p.s); g2.lineTo(p.x - p.s * .3, p.y); g2.closePath(); g2.fill();
      }
      g2.globalAlpha = 1;
    }
    if (CM.parts.length > 300) CM.parts.splice(0, 80);
  }
  window.__cameo = { spawn: cameoSpawn, tap: () => CM.list[0] && cameoTap(CM.list[0]), CM, kinds: CMK };

  // record clip (canvas video + audio if possible, else audio only)
  let rec = null, recChunks = [], recTimer;
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  const slug = () => (eng ? eng.g.name : 'music').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  $('rec').addEventListener('click', () => {
    if (!started) start();
    const btn = $('rec');
    if (rec) { rec.stop(); return; }
    if (typeof MediaRecorder === 'undefined' || !recDest) return toast('Recording not supported here');
    let stream = recDest.stream, withVideo = false;
    try {
      const vs = cv.captureStream(30);
      stream = new MediaStream([...vs.getVideoTracks(), ...recDest.stream.getAudioTracks()]); withVideo = true;
    } catch (e) {}
    const mimes = withVideo ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    const mime = mimes.find(m => MediaRecorder.isTypeSupported(m));
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); } catch (e) { rec = null; return toast('Recorder failed'); }
    recChunks = [];
    rec.ondataavailable = e => e.data.size && recChunks.push(e.data);
    rec.onstop = () => {
      clearInterval(recTimer);
      const type = rec.mimeType || 'video/webm', ext = /mp4/.test(type) ? 'mp4' : 'webm', blob = new Blob(recChunks, { type });
      download(blob, slug() + '.' + ext); toast('Saved ' + slug() + '.' + ext);
      rec = null; btn.classList.remove('on'); setBtn(btn, '● Clip');
    };
    rec.start(250);
    btn.classList.add('on'); let s = 0; setBtn(btn, '■ Stop 0s');
    recTimer = setInterval(() => { s++; setBtn(btn, '■ Stop ' + s + 's'); if (s >= 120) rec.stop(); }, 1000);
  });
  $('wav').addEventListener('click', async () => {
    if (!started) start();
    const btn = $('wav'); btn.disabled = true; setBtn(btn, 'Rendering…');
    try {
      await new Promise(r => setTimeout(r, 60));
      const buf = await MM.renderOffline(eng.g, 30, eng.mood, true);
      download(MM.encodeWav(buf), slug() + '.wav'); toast('Saved ' + slug() + '.wav');
    } catch (e) { toast('Render failed'); console.error(e); }
    btn.disabled = false; setBtn(btn, '↓ WAV');
  });

  // ---------- visuals ----------
  V.taps = []; V.bars = 0;
  const SURP = { vacuum: 'Vacuum', dip: 'Underwater dip', gong: 'Gong', whisper: 'Whisper', stutter: 'Glitch', turn: 'Key turn', swell: 'Swell' };
  function handleEvents() {
    const now = ctx.currentTime;
    while (events.length && events[0].time <= now + .02) {
      const e = events.shift();
      if (e.type === 'kick') {
        V.kick = 1; V.rings.push({ r: 0, a: .9, w: 4 });
        if (V.secName === 'drop' || V.secName === 'peak') { if ((V.kicks = (V.kicks || 0) + 1) % 2 === 1) haptic('tick'); }
      }
      else if (e.type === 'snare') { V.flash = Math.min(1, V.flash + .3); }
      else if (e.type === 'lead' || e.type === 'arp') {
        const n = e.type === 'lead' ? 5 : 2;
        const ang = ((e.data % 12) / 12) * Math.PI * 2 - Math.PI / 2;
        for (let i = 0; i < n; i++) {
          const sp = 1 + Math.random() * 3.2, a = ang + (Math.random() - .5) * .7;
          V.parts.push({ x: 0, y: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c: e.type === 'lead' ? 2 : 3, s: e.type === 'lead' ? 3 : 1.6, ang });
        }
      }
      else if (e.type === 'star') { ST.flare[e.data.id] = 1; if (!e.data.rec) { const p = ST.pos && ST.pos[e.data.id]; if (p) V.taps.push({ x: p.x, y: p.y, r: 0, a: .45 }); if (++ST.pulse % 4 === 1) haptic('tick'); } }
      else if (e.type === 'hat') { if (Math.random() < .45) V.sparks.push({ x: Math.random() * W, y: Math.random() * H, life: 1 }); }
      else if (e.type === 'genre') { setGenreUI(e.data); V.flash = 1; haptic('hard'); if (V.cameos && V.cameos.next) V.cameos.next = Math.min(V.cameos.next, ctx.currentTime + 10); }
      else if (e.type === 'key') { renderMeta(e.data.key, e.data.mode); haptic('soft'); }
      else if (e.type === 'bar') { if (e.data.secBar === 0) haptic(e.data.section === 'drop' || e.data.section === 'peak' ? 'hard' : 'soft'); else if ((V.secName === 'drop' || V.secName === 'peak') && e.data.secBar % 4 === 0) haptic('tick'); }
      else if (e.type === 'surprise') { toast('✦ ' + (SURP[e.data] || e.data)); V.flash = Math.min(1, V.flash + .5); haptic('hard'); }
      else if (e.type === 'section') {
        V.secName = e.data; $('section').textContent = e.data;
        if (e.data === 'drop' || e.data === 'peak') V.flash = 1;
      }
    }
    if (events.length > 600) events.splice(0, events.length - 300);
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    updatePalette(dt);
    if (!started) { idle(now); return; }
    if (playing) handleEvents();
    ghostUpdate(dt); cameoUpdate(dt);
    eng.analyser.getByteFrequencyData(freq);
    eng.analyser.getByteTimeDomainData(wave);
    V.kick *= Math.pow(.003, dt); V.flash *= Math.pow(.02, dt);
    let bass = 0, mid = 0, hi = 0;
    for (let i = 1; i < 12; i++) bass += freq[i]; bass /= 11 * 255;
    for (let i = 12; i < 120; i++) mid += freq[i]; mid /= 108 * 255;
    for (let i = 120; i < 500; i++) hi += freq[i]; hi /= 380 * 255;
    V.bass += (bass - V.bass) * .35; V.level += ((bass + mid + hi) / 3 - V.level) * .2;
    const [c1, c2, c3, bg] = pal.cur;

    g2.globalCompositeOperation = 'source-over';
    g2.fillStyle = hsa(bg, .24 - V.level * .08);
    g2.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H * (W < 600 ? .22 : .34), R = Math.min(W * .8, H * .8) * (.15 + V.kick * .018 + V.bass * .045);
    g2.globalCompositeOperation = 'lighter';

    // soft aura
    const grd = g2.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * .62);
    grd.addColorStop(0, hsa(c1, .028 + V.bass * .1 + V.flash * .07, -16)); grd.addColorStop(.5, hsa(c2, .01 + V.bass * .03, -22)); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = grd; g2.fillRect(0, 0, W, H);

    // perspective floor
    const hor = H * .74;
    V.scroll = (V.scroll + dt * (.3 + eng.mood * .7 + V.bass * 1.1)) % 1;
    g2.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const p = ((i + V.scroll) / 14), y = hor + Math.pow(p, 2.2) * (H - hor);
      g2.strokeStyle = hsa(c2, .02 + p * .11 + V.kick * .06, -14);
      g2.beginPath(); g2.moveTo(0, y); g2.lineTo(W, y); g2.stroke();
    }
    for (let i = -10; i <= 10; i++) {
      g2.strokeStyle = hsa(c2, .07, -14);
      g2.beginPath(); g2.moveTo(cx + i * W * .02, hor); g2.lineTo(cx + i * W * .2, H); g2.stroke();
    }

    // spectrum ring (c1 → c2)
    const N = 120, bins = 360;
    g2.save(); g2.translate(cx, cy); g2.rotate(now / 11000);
    for (let i = 0; i < N; i++) {
      const f0 = Math.floor(Math.pow(i / N, 2.1) * bins) + 1;
      let v = 0; const cnt = Math.max(1, Math.floor(Math.pow((i + 1) / N, 2.1) * bins) - Math.floor(Math.pow(i / N, 2.1) * bins));
      for (let k = 0; k < cnt; k++) v += freq[f0 + k] || 0; v = v / cnt / 255;
      v = Math.pow(v, 1.4) * (1 + i / N * .8);
      const a = i / N * Math.PI * 2, len = 5 + v * R * .95, t = Math.abs(i / N * 2 - 1);
      g2.strokeStyle = `hsla(${lerpH(c1[0], c2[0], t).toFixed(1)},${lerp(c1[1], c2[1], t).toFixed(1)}%,${(lerp(c1[2], c2[2], t) + v * 4 - 4).toFixed(1)}%,${.2 + v * .5})`;
      g2.lineWidth = Math.max(1.6, (Math.PI * 2 * R / N) * .42); g2.lineCap = 'round';
      g2.beginPath(); g2.moveTo(Math.cos(a) * R, Math.sin(a) * R); g2.lineTo(Math.cos(a) * (R + len), Math.sin(a) * (R + len)); g2.stroke();
    }
    g2.restore();

    // waveform ring (c3)
    g2.beginPath();
    const WN = 256;
    for (let i = 0; i <= WN; i++) {
      const a = (i / WN) * Math.PI * 2, s = (wave[(i * 4) % wave.length] - 128) / 128;
      const rr = R * .86 + s * R * .32;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i ? g2.lineTo(x, y) : g2.moveTo(x, y);
    }
    g2.closePath(); g2.strokeStyle = hsa(c3, .75, -4); g2.lineWidth = 1.6; g2.shadowColor = hsa(c3, .6); g2.shadowBlur = 8; g2.stroke(); g2.shadowBlur = 0;

    // kick rings
    for (let i = V.rings.length - 1; i >= 0; i--) {
      const r = V.rings[i]; r.r += dt * (240 + eng.mood * 200); r.a -= dt * 1.2;
      if (r.a <= 0) { V.rings.splice(i, 1); continue; }
      g2.strokeStyle = hsa(c1, r.a * .38); g2.lineWidth = r.w * r.a;
      g2.beginPath(); g2.arc(cx, cy, R + r.r, 0, Math.PI * 2); g2.stroke();
    }
    // tap ripples
    for (let i = V.taps.length - 1; i >= 0; i--) {
      const t = V.taps[i]; t.r += dt * 320; t.a -= dt * 1.6;
      if (t.a <= 0) { V.taps.splice(i, 1); continue; }
      g2.strokeStyle = hsa(c3, t.a * .8); g2.lineWidth = 2.2 * t.a + .4; g2.beginPath(); g2.arc(t.x, t.y, 8 + t.r, 0, Math.PI * 2); g2.stroke();
      g2.fillStyle = hsa(c1, t.a * .18); g2.beginPath(); g2.arc(t.x, t.y, 8 + t.r * .6, 0, Math.PI * 2); g2.fill();
    }
    // note particles
    for (let i = V.parts.length - 1; i >= 0; i--) {
      const p = V.parts[i]; p.x += p.vx * 60 * dt; p.y += p.vy * 60 * dt; p.life -= dt * .8;
      if (p.life <= 0) { V.parts.splice(i, 1); continue; }
      g2.fillStyle = hsa(p.c === 2 ? c2 : c3, p.life * .9, 4);
      g2.beginPath(); g2.arc(cx + Math.cos(p.ang) * R * 1.1 + p.x, cy + Math.sin(p.ang) * R * 1.1 + p.y, p.s * p.life + .5, 0, 7); g2.fill();
    }
    if (V.parts.length > 500) V.parts.splice(0, 100);
    for (let i = V.sparks.length - 1; i >= 0; i--) {
      const s = V.sparks[i]; s.life -= dt * 3;
      if (s.life <= 0) { V.sparks.splice(i, 1); continue; }
      g2.fillStyle = hsa(c3, s.life * .7, 6); g2.fillRect(s.x, s.y, 2, 2);
    }
    drawGhosts(dt, c1, c2, c3); drawCameos(dt, c1, c2, c3);
    drawStars(dt, cx, cy, R, c1, c2, c3, now);
    marbleStep(dt, cx, cy, R); drawMarbles(dt, cx, cy, R, c1, c2, c3);
    drawRibbon(dt, c1, c2, c3);
    if (V.flash > .02) { g2.fillStyle = hsa(c1, V.flash * .06, -8); g2.fillRect(0, 0, W, H); }
  }
  function drawRibbon(dt, c1, c2, c3) {
    const tr = GL.trail;
    for (let i = tr.length - 1; i >= 0; i--) { tr[i].life -= dt * (GL.on ? .9 : 2.2); if (tr[i].life <= 0) tr.splice(i, 1); }
    if (tr.length > 1) {
      g2.lineCap = 'round'; g2.lineJoin = 'round';
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < tr.length; i++) {
          const a = tr[i - 1], b = tr[i], k = i / tr.length, life = Math.min(a.life, b.life), wob = Math.sin(performance.now() / 90 + i * .6) * (2 + V.level * 10);
          const h = lerpH(c1[0], c2[0], k), col = pass ? `hsla(${h.toFixed(1)},90%,88%,${(life * .9).toFixed(3)})` : `hsla(${h.toFixed(1)},${c1[1].toFixed(0)}%,${c1[2].toFixed(0)}%,${(life * .22).toFixed(3)})`;
          g2.strokeStyle = col; g2.lineWidth = pass ? 1.5 + k * 3.5 : 10 + k * 26 + V.bass * 20;
          g2.beginPath(); g2.moveTo(a.x, a.y + (pass ? 0 : wob)); g2.lineTo(b.x, b.y + (pass ? 0 : wob)); g2.stroke();
        }
      }
      if (GL.on) { const h = tr[tr.length - 1], r = 16 + V.bass * 30 + Math.sin(performance.now() / 70) * 3;
        const gr = g2.createRadialGradient(h.x, h.y, 0, h.x, h.y, r * 2.4); gr.addColorStop(0, hsa(c3, .65, 6)); gr.addColorStop(.35, hsa(c2, .25)); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g2.fillStyle = gr; g2.beginPath(); g2.arc(h.x, h.y, r * 2.4, 0, 7); g2.fill(); }
    }
    g2.textAlign = 'center'; g2.textBaseline = 'middle';
    for (let i = GL.blooms.length - 1; i >= 0; i--) {
      const b = GL.blooms[i]; b.a -= dt * 1.1; b.y -= dt * 46; if (b.a <= 0) { GL.blooms.splice(i, 1); continue; }
      g2.font = `700 ${Math.round(15 * b.s + (1 - b.a) * 8)}px -apple-system,system-ui,sans-serif`;
      g2.fillStyle = hsa(c3, b.a * .95, 8); g2.fillText(b.txt, b.x, b.y - 30);
    }
  }
  function idle(now) {
    const [c1, c2, c3, bg] = pal.cur;
    g2.globalCompositeOperation = 'source-over';
    g2.fillStyle = hsa(bg, .2); g2.fillRect(0, 0, W, H);
    g2.globalCompositeOperation = 'lighter';
    const cx = W / 2, cy = H * .5;
    for (let i = 0; i < 90; i++) {
      const a = i / 90 * Math.PI * 2 + now / 5000, r = Math.min(W, H) * (.2 + .04 * Math.sin(now / 900 + i * .5)), t = Math.abs(i / 90 * 2 - 1);
      g2.strokeStyle = `hsla(${lerpH(c1[0], c2[0], t).toFixed(1)},${lerp(c1[1], c2[1], t).toFixed(1)}%,${lerp(c1[2], c2[2], t).toFixed(1)}%,.38)`; g2.lineWidth = 2.5; g2.lineCap = 'round';
      const l = 14 + 16 * Math.sin(now / 400 + i);
      g2.beginPath(); g2.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g2.lineTo(cx + Math.cos(a) * (r + l), cy + Math.sin(a) * (r + l)); g2.stroke();
    }
  }
  applyPalette();
  requestAnimationFrame(frame);
})();
