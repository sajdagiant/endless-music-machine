(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const cv = $('cv'), g2 = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  let ctx, eng, recDest, playing = false, worker, started = false;
  const events = [];
  const V = { hue: 320, kick: 0, bass: 0, flash: 0, rings: [], parts: [], sparks: [], scroll: 0, level: 0, secName: '' };
  let freq, wave;

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    g2.setTransform(DPR, 0, 0, DPR, 0, 0);
    g2.fillStyle = '#05050a'; g2.fillRect(0, 0, W, H);
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
    $('play').textContent = 'Pause';
    window.__mm = { eng, ctx, V };
  }
  function tick() { if (eng && playing) eng.scheduleUntil(ctx.currentTime + .6); }

  let metaG = null;
  function renderMeta(key, mode) {
    const g = metaG; if (!g) return;
    $('meta').innerHTML = `<span><b>${Math.round(g.bpm)}</b> bpm</span><span><b>${g.meterName}</b></span><span><b>${key}</b> ${mode}</span><span>${g.family} DNA</span><span>seed ${g.seed.toString(36)}</span>`;
  }
  function setGenreUI(g) {
    const h = $('genre');
    h.classList.add('swap');
    setTimeout(() => {
      h.textContent = g.name;
      metaG = g; renderMeta(g.key, g.scaleName);
      h.classList.remove('swap');
    }, 280);
    V.hue = g.hue; V.targetHue = g.hue;
    document.documentElement.style.setProperty('--h', Math.round(g.hue));
    document.title = g.name + ' · Endless Music Machine';
  }

  // ---------- controls ----------
  function togglePlay() {
    if (!started) return start();
    if (playing) { ctx.suspend(); playing = false; if (keepAlive) keepAlive.pause(); $('play').textContent = 'Play'; }
    else { unlockIOS(); ctx.resume(); playing = true; $('play').textContent = 'Pause'; }
  }
  // the machine keeps evolving: a fresh hybrid genre every ~7 minutes while playing
  setInterval(() => { if (started && playing && eng && !eng.pendingGenre && ctx.currentTime - lastGenreAt > 420) newGenre(true); }, 5000);
  let lastGenreAt = 0;
  function newGenre(auto) {
    if (!started) start();
    const g = MM.inventGenre((Math.random() * 4e9) >>> 0);
    eng.setGenre(g); lastGenreAt = ctx.currentTime;
    toast((auto === true ? 'Drifting to: ' : 'Next: ') + g.name + ' …');
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
    const mimes = withVideo ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] : ['audio/webm;codecs=opus', 'audio/webm'];
    const mime = mimes.find(m => MediaRecorder.isTypeSupported(m));
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); } catch (e) { rec = null; return toast('Recorder failed'); }
    recChunks = [];
    rec.ondataavailable = e => e.data.size && recChunks.push(e.data);
    rec.onstop = () => {
      clearInterval(recTimer);
      const blob = new Blob(recChunks, { type: rec.mimeType || 'video/webm' });
      download(blob, slug() + '.webm'); toast('Saved ' + slug() + '.webm');
      rec = null; btn.classList.remove('on'); btn.textContent = '● Rec clip';
    };
    rec.start(250);
    btn.classList.add('on'); let s = 0; btn.textContent = '■ Stop 0s';
    recTimer = setInterval(() => { s++; btn.textContent = '■ Stop ' + s + 's'; if (s >= 120) rec.stop(); }, 1000);
  });
  $('wav').addEventListener('click', async () => {
    if (!started) start();
    const btn = $('wav'); btn.disabled = true; btn.textContent = 'Rendering…';
    try {
      await new Promise(r => setTimeout(r, 60));
      const buf = await MM.renderOffline(eng.g, 30, eng.mood, true);
      download(MM.encodeWav(buf), slug() + '.wav'); toast('Saved ' + slug() + '.wav');
    } catch (e) { toast('Render failed'); console.error(e); }
    btn.disabled = false; btn.textContent = '⬇ WAV 30s';
  });

  // ---------- visuals ----------
  const hsl = (h, s, l, a) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a == null ? 1 : a})`;

  function handleEvents() {
    const now = ctx.currentTime;
    while (events.length && events[0].time <= now + .02) {
      const e = events.shift();
      if (e.type === 'kick') { V.kick = 1; V.rings.push({ r: 0, a: .9, w: 4 }); }
      else if (e.type === 'snare') { V.flash = Math.min(1, V.flash + .35); }
      else if (e.type === 'lead' || e.type === 'arp') {
        const n = e.type === 'lead' ? 5 : 2;
        const ang = ((e.data % 12) / 12) * Math.PI * 2 - Math.PI / 2;
        for (let i = 0; i < n; i++) {
          const sp = 1 + Math.random() * 3.5, a = ang + (Math.random() - .5) * .7;
          V.parts.push({ x: 0, y: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, hue: V.hue + (e.type === 'lead' ? 150 : 30) + Math.random() * 30, s: e.type === 'lead' ? 3 : 1.6, ang });
        }
      }
      else if (e.type === 'hat') { if (Math.random() < .5) V.sparks.push({ x: Math.random() * W, y: Math.random() * H, life: 1 }); }
      else if (e.type === 'genre') { setGenreUI(e.data); V.flash = 1; }
      else if (e.type === 'key') { renderMeta(e.data.key, e.data.mode); }
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
    if (!started) { idle(now); return; }
    if (playing) handleEvents();
    eng.analyser.getByteFrequencyData(freq);
    eng.analyser.getByteTimeDomainData(wave);
    V.kick *= Math.pow(.003, dt); V.flash *= Math.pow(.02, dt);
    // levels
    let bass = 0, mid = 0, hi = 0;
    for (let i = 1; i < 12; i++) bass += freq[i]; bass /= 11 * 255;
    for (let i = 12; i < 120; i++) mid += freq[i]; mid /= 108 * 255;
    for (let i = 120; i < 500; i++) hi += freq[i]; hi /= 380 * 255;
    V.bass += (bass - V.bass) * .35; V.level += ((bass + mid + hi) / 3 - V.level) * .2;

    // trails
    g2.globalCompositeOperation = 'source-over';
    g2.fillStyle = `rgba(5,5,10,${.22 - V.level * .08})`;
    g2.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H * (W < 600 ? .3 : .36), R = Math.min(W * .8, H * .8) * (.17 + V.kick * .02 + V.bass * .05);
    const hue = V.hue;
    g2.globalCompositeOperation = 'lighter';

    // sky glow
    const grd = g2.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * .6);
    grd.addColorStop(0, hsl(hue, 100, 50, .08 + V.bass * .25 + V.flash * .15)); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = grd; g2.fillRect(0, 0, W, H);

    // perspective floor
    const hor = H * .72;
    V.scroll = (V.scroll + dt * (.35 + eng.mood * .8 + V.bass * 1.2)) % 1;
    g2.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const p = ((i + V.scroll) / 14), y = hor + Math.pow(p, 2.2) * (H - hor);
      g2.strokeStyle = hsl(hue + 150, 100, 60, .05 + p * .3 + V.kick * .15);
      g2.beginPath(); g2.moveTo(0, y); g2.lineTo(W, y); g2.stroke();
    }
    for (let i = -10; i <= 10; i++) {
      g2.strokeStyle = hsl(hue + 150, 100, 60, .18);
      g2.beginPath(); g2.moveTo(cx + i * W * .02, hor); g2.lineTo(cx + i * W * .2, H); g2.stroke();
    }

    // spectrum ring
    const N = 120, bins = 360;
    g2.save(); g2.translate(cx, cy); g2.rotate(now / 9000);
    for (let i = 0; i < N; i++) {
      const f0 = Math.floor(Math.pow(i / N, 2.1) * bins) + 1;
      let v = 0; const cnt = Math.max(1, Math.floor(Math.pow((i + 1) / N, 2.1) * bins) - Math.floor(Math.pow(i / N, 2.1) * bins));
      for (let k = 0; k < cnt; k++) v += freq[f0 + k] || 0; v = v / cnt / 255;
      v = Math.pow(v, 1.4) * (1 + i / N * .8);
      const a = i / N * Math.PI * 2, len = 6 + v * R * .95;
      g2.strokeStyle = hsl(hue + i / N * 150, 100, 50 + v * 12, .3 + v * .6);
      g2.lineWidth = Math.max(2, (Math.PI * 2 * R / N) * .55);
      g2.beginPath(); g2.moveTo(Math.cos(a) * R, Math.sin(a) * R); g2.lineTo(Math.cos(a) * (R + len), Math.sin(a) * (R + len)); g2.stroke();
    }
    g2.restore();

    // waveform ring
    g2.beginPath();
    const WN = 256;
    for (let i = 0; i <= WN; i++) {
      const a = (i / WN) * Math.PI * 2, s = (wave[(i * 4) % wave.length] - 128) / 128;
      const rr = R * .86 + s * R * .35;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i ? g2.lineTo(x, y) : g2.moveTo(x, y);
    }
    g2.closePath(); g2.strokeStyle = hsl(hue + 170, 100, 75, .9); g2.lineWidth = 2; g2.shadowColor = hsl(hue + 170, 100, 60, 1); g2.shadowBlur = 14; g2.stroke(); g2.shadowBlur = 0;

    // kick rings
    for (let i = V.rings.length - 1; i >= 0; i--) {
      const r = V.rings[i]; r.r += dt * (260 + eng.mood * 220); r.a -= dt * 1.2;
      if (r.a <= 0) { V.rings.splice(i, 1); continue; }
      g2.strokeStyle = hsl(hue + 20, 100, 65, r.a * .6); g2.lineWidth = r.w * r.a;
      g2.beginPath(); g2.arc(cx, cy, R + r.r, 0, Math.PI * 2); g2.stroke();
    }
    // note particles
    for (let i = V.parts.length - 1; i >= 0; i--) {
      const p = V.parts[i]; p.x += p.vx * 60 * dt; p.y += p.vy * 60 * dt; p.life -= dt * .8;
      if (p.life <= 0) { V.parts.splice(i, 1); continue; }
      g2.fillStyle = hsl(p.hue, 100, 65, p.life);
      g2.beginPath(); g2.arc(cx + Math.cos(p.ang) * R * 1.1 + p.x, cy + Math.sin(p.ang) * R * 1.1 + p.y, p.s * p.life + .5, 0, 7); g2.fill();
    }
    if (V.parts.length > 500) V.parts.splice(0, 100);
    // hat sparks
    for (let i = V.sparks.length - 1; i >= 0; i--) {
      const s = V.sparks[i]; s.life -= dt * 3;
      if (s.life <= 0) { V.sparks.splice(i, 1); continue; }
      g2.fillStyle = hsl(hue + 90, 100, 85, s.life * .8); g2.fillRect(s.x, s.y, 2, 2);
    }
    // flash
    if (V.flash > .02) { g2.fillStyle = hsl(hue, 100, 60, V.flash * .12); g2.fillRect(0, 0, W, H); }
  }
  function idle(now) {
    g2.globalCompositeOperation = 'source-over';
    g2.fillStyle = 'rgba(5,5,10,.15)'; g2.fillRect(0, 0, W, H);
    g2.globalCompositeOperation = 'lighter';
    const cx = W / 2, cy = H / 2;
    for (let i = 0; i < 90; i++) {
      const a = i / 90 * Math.PI * 2 + now / 4000, r = Math.min(W, H) * (.18 + .05 * Math.sin(now / 700 + i * .5));
      g2.strokeStyle = hsl(320 + i * 1.7, 100, 60, .6); g2.lineWidth = 3;
      g2.beginPath(); g2.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g2.lineTo(cx + Math.cos(a) * (r + 18 + 20 * Math.sin(now / 300 + i)), cy + Math.sin(a) * (r + 18 + 20 * Math.sin(now / 300 + i))); g2.stroke();
    }
  }
  requestAnimationFrame(frame);
})();
