/* Endless Music Machine — DSP: drum-kit synthesis (rendered to buffers in JS), reverb impulse generator, helpers. */
(function (G) {
  'use strict';
  const MM = G.MM = G.MM || {};
  const TAU = Math.PI * 2;
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  MM.mulberry32 = mulberry32;

  // RBJ biquad, applied in place (offline, on arrays)
  function filt(x, type, f, q, sr) {
    f = Math.min(f, sr * .45); q = q || .707;
    const w = TAU * f / sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; }
    const a0 = 1 + al, a1 = -2 * c / a0, a2 = (1 - al) / a0; b0 /= a0; b1 /= a0; b2 /= a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y;
    }
    return x;
  }
  function crush(x, bits, hold) {
    const q = Math.pow(2, bits - 1); let h = 0, last = 0;
    for (let i = 0; i < x.length; i++) {
      if (i % hold === 0) { last = Math.round(x[i] * q) / q; }
      x[i] = last;
    }
    return x;
  }
  function norm(x, peak) {
    let m = 1e-9; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
    const k = peak / m; for (let i = 0; i < x.length; i++) x[i] *= k; return x;
  }
  function fadeEnd(x, sr, ms) {
    const n = Math.min(x.length, Math.floor(sr * ms / 1000));
    for (let i = 0; i < n; i++) x[x.length - 1 - i] *= i / n; return x;
  }

  // ---- drum generators (each returns Float32Array) ----
  function kick(sr, p) {
    const n = Math.floor(sr * p.len), o = new Float32Array(n), cr = mulberry32(7);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, f = p.f1 + (p.f0 - p.f1) * Math.exp(-t / p.pd);
      ph += TAU * f / sr;
      let s = Math.sin(ph) + (p.harm || 0) * Math.sin(2 * ph + .6);
      s *= Math.exp(-t / p.ad) * (1 - Math.exp(-t / .0007));
      if (p.drive > 1) s = Math.tanh(s * p.drive) / Math.tanh(p.drive);
      if (p.click) s += p.click * (cr() * 2 - 1) * Math.exp(-t / .0022);
      o[i] = s;
    }
    if (p.lp) filt(o, 'lp', p.lp, .7, sr);
    if (p.crush) crush(o, p.crush, 2);
    return fadeEnd(norm(o, .95), sr, 12);
  }
  function snare(sr, p, r) {
    const n = Math.floor(sr * p.len), o = new Float32Array(n), nz = new Float32Array(n);
    let ph = 0, ph2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, f = p.f1 + (p.f0 - p.f1) * Math.exp(-t / .018);
      ph += TAU * f / sr; ph2 += TAU * f * 1.62 / sr;
      o[i] = (Math.sin(ph) + .45 * Math.sin(ph2)) * Math.exp(-t / p.td) * p.tmix;
      let e = Math.exp(-t / p.nd);
      if (p.gate) e = t < p.gate ? 1 - .15 * t / p.gate : Math.exp(-(t - p.gate) / .012);
      nz[i] = (r() * 2 - 1) * e * (1 - Math.exp(-t / .0004));
    }
    if (p.nhp) filt(nz, 'hp', p.nhp, .7, sr);
    if (p.nlp) filt(nz, 'lp', p.nlp, .7, sr);
    for (let i = 0; i < n; i++) o[i] += nz[i] * (p.nmix == null ? 1 : p.nmix);
    if (p.crush) crush(o, p.crush, p.hold || 1);
    return fadeEnd(norm(o, .9), sr, 10);
  }
  function clap(sr, p, r) {
    const n = Math.floor(sr * p.len), o = new Float32Array(n), bt = [0, .0105, .021, .033];
    for (let i = 0; i < n; i++) {
      const t = i / sr; let e = 0;
      for (let b = 0; b < 4; b++) if (t >= bt[b]) { const d = b < 3 ? .005 : p.tail; e = Math.max(e, Math.exp(-(t - bt[b]) / d) * (b < 3 ? 1 : .8)); }
      o[i] = (r() * 2 - 1) * e;
    }
    filt(o, 'bp', p.fc || 1300, p.q || .9, sr); filt(o, 'hp', 450, .7, sr);
    if (p.crush) crush(o, p.crush, 2);
    return fadeEnd(norm(o, .9), sr, 10);
  }
  const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];
  function hat(sr, p, r) {
    const n = Math.floor(sr * p.dec * 6), o = new Float32Array(n), nz = new Float32Array(n);
    let held = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr; let s = 0;
      if (!p.bit) { for (let k = 0; k < 6; k++) s += Math.sin(TAU * METAL[k] * p.pitch * t) >= 0 ? 1 : -1; s /= 6; }
      if (p.bit) { if (i % 3 === 0) held = r() < .5 ? -1 : 1; s = held; }
      const e = Math.exp(-t / p.dec) * (1 - Math.exp(-t / .0003));
      o[i] = s * p.metal * e; nz[i] = (r() * 2 - 1) * e * (1 - p.metal * .6);
    }
    filt(o, 'hp', p.hp, .8, sr); filt(o, 'bp', 9500, .6, sr);
    for (let i = 0; i < n; i++) o[i] = o[i] * 2.2 + nz[i];
    filt(o, 'hp', p.hp * .9, .7, sr);
    if (p.lp) filt(o, 'lp', p.lp, .7, sr);
    return fadeEnd(norm(o, .8), sr, 8);
  }
  function ride(sr, p, r) {
    const n = Math.floor(sr * p.len), o = new Float32Array(n);
    const fr = [], rr = mulberry32(99); for (let k = 0; k < 9; k++) fr.push(2800 + rr() * 6500);
    for (let i = 0; i < n; i++) {
      const t = i / sr; let s = 0;
      for (let k = 0; k < 9; k++) s += Math.sin(TAU * fr[k] * t + k) / (1 + k * .2);
      o[i] = s * .18 * Math.exp(-t / p.dec) + (r() * 2 - 1) * .25 * Math.exp(-t / (p.dec * .35)) + Math.sin(TAU * 1700 * t) * .3 * Math.exp(-t / .03);
    }
    filt(o, 'hp', 3500, .7, sr); if (p.lp) filt(o, 'lp', p.lp, .7, sr);
    return fadeEnd(norm(o, .7), sr, 20);
  }
  function crash(sr, len, r, dark) {
    const n = Math.floor(sr * len), o = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; o[i] = (r() * 2 - 1) * Math.exp(-t / (len * .28)) * (1 - Math.exp(-t / .002)); }
    filt(o, 'hp', dark ? 1500 : 3000, .7, sr); filt(o, 'bp', 7000, .4, sr);
    for (let i = 0; i < n; i++) o[i] *= 2;
    return fadeEnd(norm(o, .8), sr, 40);
  }
  function impact(sr, r) {
    const n = Math.floor(sr * 3), o = new Float32Array(n), nz = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, f = 38 + 70 * Math.exp(-t / .12); ph += TAU * f / sr;
      o[i] = Math.sin(ph) * Math.exp(-t / .9) * (1 - Math.exp(-t / .002));
      nz[i] = (r() * 2 - 1) * Math.exp(-t / .5);
    }
    filt(nz, 'lp', 3500, .7, sr); filt(nz, 'hp', 120, .7, sr);
    for (let i = 0; i < n; i++) o[i] = Math.tanh(1.6 * (o[i] + nz[i] * .35));
    return fadeEnd(norm(o, .9), sr, 100);
  }
  function tom(sr, f0, f1, dec) {
    const n = Math.floor(sr * dec * 5), o = new Float32Array(n); let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / sr, f = f1 + (f0 - f1) * Math.exp(-t / .03); ph += TAU * f / sr; o[i] = Math.sin(ph) * Math.exp(-t / dec) * (1 - Math.exp(-t / .0007)) + (Math.sin(ph * 2.3) * .15 * Math.exp(-t / (dec * .3))); }
    return fadeEnd(norm(o, .9), sr, 10);
  }
  function conga(sr, f, r) {
    const n = Math.floor(sr * .35), o = new Float32Array(n); let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / sr, fr = f * (1 + .25 * Math.exp(-t / .012)); ph += TAU * fr / sr; o[i] = Math.sin(ph) * Math.exp(-t / .09) + (r() * 2 - 1) * .5 * Math.exp(-t / .006); }
    filt(o, 'hp', 150, .7, sr);
    return fadeEnd(norm(o, .85), sr, 10);
  }
  function wood(sr, f) {
    const n = Math.floor(sr * .2), o = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; o[i] = (Math.sin(TAU * f * t) + .5 * Math.sin(TAU * f * 1.58 * t)) * Math.exp(-t / .035) * (1 - Math.exp(-t / .0003)); }
    return fadeEnd(norm(o, .8), sr, 10);
  }
  function bell(sr, f, ratio, dec) {
    const n = Math.floor(sr * dec * 5), o = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; o[i] = (Math.sin(TAU * f * t) + Math.sin(TAU * f * ratio * t) * .8) * Math.exp(-t / dec) * (1 - Math.exp(-t / .0003)); }
    return fadeEnd(norm(o, .75), sr, 10);
  }
  function cowbell(sr) {
    const n = Math.floor(sr * .5), o = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; o[i] = (Math.sin(TAU * 540 * t) >= 0 ? 1 : -1) * .5 + (Math.sin(TAU * 800 * t) >= 0 ? 1 : -1) * .5; o[i] *= (Math.exp(-t / .012) * .6 + Math.exp(-t / .12) * .4); }
    filt(o, 'bp', 810, 2.2, sr);
    return fadeEnd(norm(o, .8), sr, 10);
  }
  function shaker(sr, r) {
    const n = Math.floor(sr * .14), o = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; o[i] = (r() * 2 - 1) * Math.pow(Math.min(1, t / .012), 1) * Math.exp(-t / .035); }
    filt(o, 'bp', 7000, 1.2, sr); filt(o, 'hp', 3500, .7, sr);
    return fadeEnd(norm(o, .7), sr, 8);
  }
  function rim(sr) {
    const n = Math.floor(sr * .12), o = new Float32Array(n), r = mulberry32(5);
    for (let i = 0; i < n; i++) { const t = i / sr; o[i] = (Math.sin(TAU * 1750 * t) * .6 + Math.sin(TAU * 480 * t) * .6 + (r() * 2 - 1) * .5) * Math.exp(-t / .012); }
    filt(o, 'hp', 300, .7, sr);
    return fadeEnd(norm(o, .8), sr, 8);
  }
  function brush(sr, r) {
    const n = Math.floor(sr * .3), o = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; o[i] = (r() * 2 - 1) * Math.min(1, t / .018) * Math.exp(-t / .09); }
    filt(o, 'bp', 4200, .5, sr);
    return fadeEnd(norm(o, .7), sr, 20);
  }
  function reverse(a) { const b = new Float32Array(a.length); for (let i = 0; i < a.length; i++) b[i] = a[a.length - 1 - i]; return b; }

  // ---- kits ----
  const KITS = {
    punch: { kick: { f0: 200, f1: 50, pd: .03, ad: .24, len: .5, click: .5, drive: 3, harm: .12 }, snare: { f0: 240, f1: 180, td: .06, tmix: .5, nd: .13, nhp: 1500, nlp: 11000, len: .35 }, clap: { len: .4, tail: .1 }, hat: { dec: .028, hp: 7500, pitch: 1, metal: .6 }, ohat: { dec: .2 } },
    tech: { kick: { f0: 230, f1: 46, pd: .028, ad: .32, len: .6, click: .35, drive: 5, harm: .2 }, snare: { f0: 250, f1: 190, td: .05, tmix: .35, nd: .1, nhp: 2200, nlp: 12000, len: .3 }, clap: { len: .35, tail: .08, fc: 1700 }, hat: { dec: .022, hp: 8200, pitch: 1.1, metal: .7 }, ohat: { dec: .14 } },
    deep: { kick: { f0: 135, f1: 44, pd: .05, ad: .55, len: .9, click: .08, drive: 1.6, harm: .05, lp: 5000 }, snare: { f0: 200, f1: 150, td: .09, tmix: .8, nd: .16, nhp: 900, nlp: 7000, len: .45 }, clap: { len: .5, tail: .16, fc: 1000 }, hat: { dec: .035, hp: 6500, pitch: .9, metal: .5, lp: 12000 }, ohat: { dec: .3 } },
    '808': { kick: { f0: 150, f1: 40, pd: .07, ad: 1.0, len: 1.5, click: .12, drive: 1.8, harm: .05 }, snare: { f0: 260, f1: 190, td: .05, tmix: .35, nd: .14, nhp: 1800, nlp: 10000, len: .35 }, clap: { len: .55, tail: .2, fc: 1500 }, hat: { dec: .02, hp: 8500, pitch: 1.2, metal: .75 }, ohat: { dec: .16 } },
    lofi: { kick: { f0: 125, f1: 52, pd: .035, ad: .2, len: .45, click: .05, drive: 1.4, lp: 2400 }, snare: { f0: 200, f1: 160, td: .05, tmix: .6, nd: .12, nhp: 900, nlp: 5200, len: .3, crush: 10 }, clap: { len: .35, tail: .09, fc: 1100, crush: 10 }, hat: { dec: .03, hp: 5500, pitch: .8, metal: .35, lp: 8000 }, ohat: { dec: .16 }, crush: 11, lp: 8500 },
    dnb: { kick: { f0: 230, f1: 54, pd: .018, ad: .14, len: .35, click: .55, drive: 3, harm: .1 }, snare: { f0: 320, f1: 210, td: .05, tmix: .75, nd: .09, nhp: 2600, nlp: 13000, len: .28 }, clap: { len: .3, tail: .07 }, hat: { dec: .02, hp: 8000, pitch: 1.15, metal: .65 }, ohat: { dec: .12 } },
    chip: { kick: { f0: 190, f1: 42, pd: .035, ad: .14, len: .3, click: 0, drive: 8, crush: 4 }, snare: { f0: 330, f1: 330, td: .01, tmix: 0, nd: .09, nhp: 1500, nlp: 9000, len: .2, crush: 3, hold: 3 }, clap: { len: .25, tail: .05, crush: 3 }, hat: { dec: .03, hp: 6500, pitch: 1, metal: .2, bit: 1 }, ohat: { dec: .14 }, crush: 5 },
    jazz: { kick: { f0: 105, f1: 60, pd: .04, ad: .26, len: .5, click: 0, drive: 1.1, lp: 1900 }, snare: { f0: 190, f1: 170, td: .05, tmix: .25, nd: .14, nhp: 3000, nlp: 8000, len: .3 }, clap: { len: .3, tail: .08 }, hat: { dec: .04, hp: 6000, pitch: .85, metal: .4, lp: 11000 }, ohat: { dec: .22 }, ride: { dec: .75 } },
    afro: { kick: { f0: 140, f1: 48, pd: .04, ad: .3, len: .6, click: .12, drive: 1.8, lp: 6000 }, snare: { f0: 210, f1: 160, td: .07, tmix: .7, nd: .1, nhp: 1400, nlp: 9000, len: .3 }, clap: { len: .35, tail: .08, fc: 1500 }, hat: { dec: .025, hp: 7000, pitch: 1, metal: .5 }, ohat: { dec: .15 } },
    cine: { kick: { f0: 105, f1: 34, pd: .08, ad: 1.2, len: 2.2, click: .06, drive: 1.5, harm: .1 }, snare: { f0: 150, f1: 100, td: .18, tmix: .9, nd: .5, nhp: 400, nlp: 8000, len: 1.2 }, clap: { len: .9, tail: .4, fc: 800 }, hat: { dec: .04, hp: 6000, pitch: .8, metal: .4 }, ohat: { dec: .3 } },
    gated: { kick: { f0: 190, f1: 50, pd: .03, ad: .22, len: .45, click: .35, drive: 2.5, harm: .1 }, snare: { f0: 250, f1: 200, td: .07, tmix: .5, nd: .3, gate: .17, nhp: 1200, nlp: 10000, len: .4 }, clap: { len: .35, tail: .12 }, hat: { dec: .028, hp: 7000, pitch: .95, metal: .55 }, ohat: { dec: .2 } }
  };

  function kitJobs(ctx, kitName, seed) {
    const sr = ctx.sampleRate, K = KITS[kitName] || KITS.punch, r = mulberry32(seed || 1), r2 = mulberry32((seed || 1) + 777);
    const tune = 1 + (r() - .5) * .08;
    const kk = Object.assign({}, K.kick, { f0: K.kick.f0 * tune, f1: K.kick.f1 * tune });
    const post = a => { if (K.lp) filt(a, 'lp', K.lp, .7, sr); if (K.crush) crush(a, K.crush, 1); return a; };
    const mono = a => { const b = ctx.createBuffer(1, a.length, sr); b.getChannelData(0).set(post(a)); return b; };
    const st = (fn) => { const a = post(fn(r)), b = post(fn(r2)); const buf = ctx.createBuffer(2, a.length, sr); buf.getChannelData(0).set(a); buf.getChannelData(1).set(b); return buf; };
    return [
      ['kick', () => mono(kick(sr, kk))],
      ['snare', () => st(rr => snare(sr, Object.assign({}, K.snare, { f0: K.snare.f0 * tune, f1: K.snare.f1 * tune }), rr))],
      ['clap', () => st(rr => clap(sr, K.clap, rr))],
      ['snare2', () => st(rr => snare(sr, Object.assign({}, K.snare, { f0: K.snare.f0 * tune * 1.012, f1: K.snare.f1 * tune * .99 }), mulberry32((seed || 1) + (rr === r ? 4242 : 5353))))],
      ['hat', () => st(rr => hat(sr, Object.assign({ metal: .6, pitch: 1 }, K.hat), rr))],
      ['hat2', () => st(rr => hat(sr, Object.assign({ metal: .6, pitch: 1 }, K.hat, { pitch: (K.hat.pitch || 1) * 1.035 }), mulberry32((seed || 1) + (rr === r ? 9191 : 8181))))],
      ['ohat', () => st(rr => hat(sr, Object.assign({ metal: .6, pitch: 1 }, K.hat, K.ohat), rr))],
      ['ride', () => st(rr => ride(sr, Object.assign({ dec: .9, len: 2 }, K.ride, { len: 2 }), rr))],
      ['crash', () => st(rr => crash(sr, 2.2, rr, kitName === 'cine'))],
      ['rev', kit => { const rev = ctx.createBuffer(2, kit.crash.length, sr); for (let c = 0; c < 2; c++) rev.getChannelData(c).set(reverse(kit.crash.getChannelData(c))); return rev; }],
      ['impact', () => st(rr => impact(sr, rr))],
      ['tomH', () => mono(tom(sr, 210 * tune, 120, .16))], ['tomM', () => mono(tom(sr, 150 * tune, 85, .2))], ['tomL', () => mono(tom(sr, 105 * tune, 62, .26))],
      ['congaH', () => mono(conga(sr, 380 * tune, r))], ['congaL', () => mono(conga(sr, 260 * tune, r))],
      ['wood', () => mono(wood(sr, 880 * tune))], ['cow', () => mono(cowbell(sr))],
      ['agoH', () => mono(bell(sr, 900, 1.504, .09))], ['agoL', () => mono(bell(sr, 600, 1.504, .1))],
      ['shaker', () => st(rr => shaker(sr, rr))], ['rim', () => mono(rim(sr))], ['brush', () => st(rr => brush(sr, rr))]
    ];
  }
  MM.buildKit = function (ctx, kitName, seed) { const kit = {}; kitJobs(ctx, kitName, seed).forEach(j => { kit[j[0]] = j[1](kit); }); return kit; };
  // same, but time-sliced so a live genre change never stalls the audio scheduler
  MM.buildKitAsync = function (ctx, kitName, seed) {
    return new Promise(res => {
      const jobs = kitJobs(ctx, kitName, seed), kit = {}; let i = 0;
      (function next() { const t0 = performance.now(); while (i < jobs.length && performance.now() - t0 < 6) { kit[jobs[i][0]] = jobs[i][1](kit); i++; } if (i < jobs.length) setTimeout(next, 4); else res(kit); })();
    });
  };

  // ---- reverb impulse (stereo, generated) ----
  // v3 reverb: early-reflection cluster with air absorption, 3-band decay (lows linger, highs die first), decorrelated stereo, slowly modulated density
  MM.makeIR = function (ctx, seconds, dark, seed) {
    const sr = ctx.sampleRate, n = Math.floor(sr * seconds), buf = ctx.createBuffer(2, n, sr), r = mulberry32(seed || 3);
    const pre = Math.floor(sr * (.011 + r() * .022));
    const rtL = seconds * 1.12, rtM = seconds, rtH = seconds * (.2 + (1 - dark) * .38);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c); let a1 = 0, a2 = 0, hpz = 0, ph = r() * 6.28;
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / sr, w = r() * 2 - 1;
        a1 += (w - a1) * .045; a2 += (w - a2) * .42;                // low / mid-low-pass states
        const low = a1, mid = a2 - a1, high = w - a2;
        const env = Math.exp(-6.9 * t / rtM), eL = Math.exp(-6.9 * t / rtL), eH = Math.exp(-6.9 * t / rtH);
        const dens = Math.min(1, .25 + t / .09);                   // density builds up (sparse start = smoother, less metallic)
        const mod = 1 + .22 * Math.sin(ph + t * (.7 + c * .23));
        let v = (low * 1.6 * eL * .9 + mid * 1.15 * env + high * .85 * eH) * dens * mod;
        hpz += (v - hpz) * .012; v -= hpz;                         // remove DC / sub rumble
        d[i] = v * Math.min(1, t / .006);
      }
      let taps = 0;                                                  // early reflections: sparse, damped, panned apart
      for (let e = 0; e < 12; e++) {
        const dt = .004 + Math.pow(r(), 1.3) * .075, at = pre + Math.floor(sr * dt); if (at + 80 >= n) continue;
        const amp = (r() < .5 ? -1 : 1) * (.62 - e * .036) * (c ? 1 - (e % 3) * .08 : 1 - ((e + 1) % 3) * .08);
        let lp = 0, k = .25 + r() * .5; for (let j = 0; j < 72; j++) { lp += ((j === 0 ? 1 : 0) - lp) * k; d[at + j] += amp * lp * (1 - j / 72); }
        taps++;
      }
      // fade the very end so it never clicks
      const f = Math.floor(sr * .15); for (let i = 0; i < f && i < n; i++) d[n - 1 - i] *= i / f;
    }
    return buf;
  };
  // short bright "room" for snares / claps / toms
  MM.makeRoomIR = function (ctx, seed) {
    const sr = ctx.sampleRate, sec = .42, n = Math.floor(sr * sec), buf = ctx.createBuffer(2, n, sr), r = mulberry32((seed || 5) + 31);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c); let lp = 0;
      const pre = Math.floor(sr * (.002 + c * .0013));
      for (let i = pre; i < n; i++) { const t = (i - pre) / sr; lp += ((r() * 2 - 1) - lp) * (.5 * Math.exp(-t / .12) + .1); d[i] = lp * Math.exp(-6.9 * t / sec) * Math.min(1, t / .002); }
      for (let e = 0; e < 6; e++) { const at = pre + Math.floor(sr * (.003 + r() * .022)); if (at < n) d[at] += (r() < .5 ? -1 : 1) * (.7 - e * .08); }
    }
    return buf;
  };
  MM.makeCrackle = function (ctx, seed) {
    const sr = ctx.sampleRate, n = sr * 4, buf = ctx.createBuffer(2, n, sr), r = mulberry32(seed || 11);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c); let lp = 0;
      for (let i = 0; i < n; i++) { lp += ((r() * 2 - 1) - lp) * .5; d[i] = lp * .02; }
      for (let k = 0; k < 22; k++) { const at = Math.floor(r() * (n - 400)), a = (.15 + r() * .6) * (r() < .5 ? -1 : 1), dec = 8 + r() * 30; for (let j = 0; j < 300; j++) d[at + j] += a * Math.exp(-j / dec) * (r() * .6 + .4); }
    }
    return buf;
  };
  MM.dspUtil = { filt, TAU };
})(window);
