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
  ['play', 'new', 'rec', 'wav'].forEach(id => { const b = $(id), txt = b.textContent.trim(); b.textContent = ''; setBtn(b, txt); });

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
    pal.tgt = pickScheme(g);
    if (!setGenreUI.told) { setGenreUI.told = 1; setTimeout(() => toast('Tap the glow · hold & drag to glide'), 2500); }
    document.title = g.name + ' · Endless Music Machine';
  }

  // ---------- controls ----------
  function togglePlay() {
    if (!started) return start();
    if (playing) { glideStop(); ctx.suspend(); playing = false; if (keepAlive) keepAlive.pause(); setBtn($('play'), 'Play'); }
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
  $('mood').addEventListener('input', e => { if (eng) eng.mood = e.target.value / 100; });
  addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'n' || e.key === 'N') newGenre();
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
    eng.strike(e.clientX / W, 1 - e.clientY / H);
    V.taps.push({ x: e.clientX, y: e.clientY, r: 0, a: .9 });
    if (!isIOS) haptic('soft');
    if (GL.id !== null) return; // one ribbon at a time; extra fingers still strike notes
    GL.id = e.pointerId; GL.x0 = e.clientX; GL.y0 = e.clientY; GL.trail.length = 0;
    try { $('pad').setPointerCapture(e.pointerId); } catch (er) {}
    clearTimeout(GL.hold); GL.hold = setTimeout(() => { if (GL.id !== null) glideBegin(GL.x0, GL.y0); }, 200);
  });
  $('pad').addEventListener('pointermove', e => {
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
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => $('pad').addEventListener(ev, e => { if (e.pointerId === GL.id) glideStop(); }));
  addEventListener('blur', glideStop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) glideStop(); });

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
      else if (e.type === 'hat') { if (Math.random() < .45) V.sparks.push({ x: Math.random() * W, y: Math.random() * H, life: 1 }); }
      else if (e.type === 'genre') { setGenreUI(e.data); V.flash = 1; haptic('hard'); }
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
