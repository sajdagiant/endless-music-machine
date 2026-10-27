/* Endless Music Machine — audio engine core: mixing chain (compression, saturation, ducking, convolution reverb, ping-pong delay, stereo width)
   and the synth voices (FM, detuned supersaws, filtered noise, pluck, bass, ...). Works on AudioContext and OfflineAudioContext. */
(function (G) {
  'use strict';
  const MM = G.MM = G.MM || {};
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const rr = (a, b) => a + Math.random() * (b - a);
  function curve(k, n) { n = n || 2048; const c = new Float32Array(n), d = Math.tanh(k); for (let i = 0; i < n; i++) { const x = i * 2 / (n - 1) - 1; c[i] = Math.tanh(x * k) / d; } return c; }
  // ADSR on an AudioParam (exponential). returns the end time
  function adsr(p, t, pk, a, d, s, dur, r) {
    const hold = Math.max(t + a + d, t + dur), sl = Math.max(1e-4, pk * s);
    p.setValueAtTime(1e-4, t); p.exponentialRampToValueAtTime(Math.max(1e-4, pk), t + a);
    p.exponentialRampToValueAtTime(sl, t + a + Math.max(.002, d));
    p.setValueAtTime(sl, hold); p.exponentialRampToValueAtTime(1e-4, hold + r);
    return hold + r;
  }

  function Engine(ctx, opts) {
    opts = opts || {};
    this.ctx = ctx; this.offline = !!opts.offline;
    this.mood = opts.mood == null ? .55 : opts.mood;
    this.onEvent = opts.onEvent || null;
    this.running = false; this.pendingGenre = null; this.pendingTime = 0;
    this.stepInBar = 0; this.bar = 0; this.secBar = 0; this.nextTime = 0; this.section = null; this.keyOff = 0;
    this._build();
    this.setGenre(opts.genre || MM.inventGenre((Math.random() * 1e9) | 0), true);
  }
  MM.Engine = Engine;
  const P = Engine.prototype;
  P.mtof = mtof;

  P.node = function (type, o) { const n = this.ctx['create' + type](); if (o) Object.assign(n, o); return n; };
  P.gain = function (v) { const g = this.ctx.createGain(); g.gain.value = v == null ? 1 : v; return g; };
  P.pan = function (v) { const c = this.ctx; if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, v)); return p; } return this.gain(1); };
  P.biq = function (type, f, q) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; };
  P.pulseWave = function (duty) {
    this._pw = this._pw || {}; const k = duty;
    if (!this._pw[k]) {
      const N = 48, re = new Float32Array(N), im = new Float32Array(N);
      for (let n = 1; n < N; n++) { const A = 2 / (n * Math.PI) * Math.sin(n * Math.PI * duty); re[n] = A * Math.cos(n * Math.PI * duty); im[n] = A * Math.sin(n * Math.PI * duty); }
      this._pw[k] = this.ctx.createPeriodicWave(re, im);
    }
    return this._pw[k];
  };

  P._build = function () {
    const c = this.ctx, sr = c.sampleRate;
    // shared noise
    this.noiseBuf = c.createBuffer(1, sr * 2, sr);
    const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // ---- master chain ----
    this.pre = this.gain(.1);
    const hp = this.biq('highpass', 26, .6);
    this.sat = c.createWaveShaper(); this.sat.curve = curve(1.4); this.sat.oversample = '2x';
    this.lowShelf = this.biq('lowshelf', 90, 0); this.lowShelf.gain.value = 1.5;
    this.highShelf = this.biq('highshelf', 7500, 0); this.highShelf.gain.value = 1.5;
    this.glue = c.createDynamicsCompressor();
    Object.assign(this.glue.threshold, { value: -17 }); this.glue.knee.value = 14; this.glue.ratio.value = 2.6; this.glue.attack.value = .018; this.glue.release.value = .2;
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -4; this.limiter.knee.value = 1; this.limiter.ratio.value = 20; this.limiter.attack.value = .002; this.limiter.release.value = .09;
    this.clip = c.createWaveShaper(); this.clip.curve = curve(.9, 1024);
    this.master = this.gain(.8);
    this.analyser = c.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = .8;
    this.pre.connect(hp); hp.connect(this.sat); this.sat.connect(this.lowShelf); this.lowShelf.connect(this.highShelf); this.highShelf.connect(this.glue);
    this.glue.connect(this.limiter); this.limiter.connect(this.clip); this.clip.connect(this.master); this.master.connect(this.analyser);
    this.out = this.master;
    // ---- drums ----
    this.drumBus = this.gain(.95);
    const dcomp = c.createDynamicsCompressor(); dcomp.threshold.value = -16; dcomp.knee.value = 8; dcomp.ratio.value = 3; dcomp.attack.value = .006; dcomp.release.value = .09;
    this.drumBus.connect(dcomp); dcomp.connect(this.pre);
    // ---- bass (saturated, sidechain-ducked) ----
    this.bassIn = this.gain(.5);
    this.bassSat = c.createWaveShaper(); this.bassSat.curve = curve(2); this.bassSat.oversample = '2x';
    this.bassDuck = this.gain(1);
    this.bassIn.connect(this.bassSat); this.bassSat.connect(this.bassDuck); this.bassDuck.connect(this.pre);
    // ---- music (filter macro -> stereo widener -> sidechain duck) ----
    this.musicIn = this.node('Gain'); this.musicIn.channelCount = 2; this.musicIn.channelCountMode = 'explicit';
    this.musicLP = this.biq('lowpass', 18000, .7);
    this.musicHP = this.biq('highpass', 20, .6);
    this.musicDuck = this.gain(1);
    this.musicIn.connect(this.musicHP); this.musicHP.connect(this.musicLP);
    this._widener(this.musicLP, this.musicDuck, 1.3);
    this.musicDuck.connect(this.pre);
    // ---- sends ----
    this.verbIn = this.gain(1); this.verbOut = this.gain(.3);
    this.fxLP = this.biq('lowpass', 18000, .5); this.verbDuck = this.gain(1);
    this.verbOut.connect(this.fxLP); this.fxLP.connect(this.verbDuck); this.verbDuck.connect(this.pre);
    this.vSlot = null;
    // ping-pong delay
    this.dlyIn = this.gain(1); this.dL = c.createDelay(2.5); this.dR = c.createDelay(2.5);
    this.dFb1 = this.gain(.4); this.dFb2 = this.gain(.4);
    this.dTone = this.biq('lowpass', 3200, .6); const dHp = this.biq('highpass', 220, .6);
    this.dlyOut = this.gain(.3); const pL = this.pan(-.75), pR = this.pan(.75);
    this.dlyIn.connect(dHp); dHp.connect(this.dL); this.dL.connect(this.dFb1); this.dFb1.connect(this.dTone); this.dTone.connect(this.dR); this.dR.connect(this.dFb2); this.dFb2.connect(this.dL);
    this.dL.connect(pL); this.dR.connect(pR); pL.connect(this.dlyOut); pR.connect(this.dlyOut);
    this.dlyOut.connect(this.fxLP); this.dlyOut.connect(this.verbIn);
    // ---- instrument buses ----
    const mkBus = (lvl, vs, ds) => { const b = this.gain(lvl); b.connect(this.musicIn); const v = this.gain(vs); b.connect(v); v.connect(this.verbIn); const d = this.gain(ds); b.connect(d); d.connect(this.dlyIn); b.vs = v; b.ds = d; return b; };
    this.busChord = mkBus(2.2, .3, .1); this.busLead = mkBus(2.2, .35, .6); this.busArp = mkBus(1.9, .35, .6);
    // pad bus has a stereo chorus
    this.busPad = this.gain(1.9);
    { const dry = this.gain(1), wl = this.gain(.5), wr = this.gain(.5);
      const d1 = c.createDelay(.1), d2 = c.createDelay(.1); d1.delayTime.value = .019; d2.delayTime.value = .027;
      const l1 = c.createOscillator(), l2 = c.createOscillator(), g1 = this.gain(.004), g2 = this.gain(.005); l1.frequency.value = .27; l2.frequency.value = .21; l1.connect(g1); g1.connect(d1.delayTime); l2.connect(g2); g2.connect(d2.delayTime); l1.start(); l2.start();
      const p1 = this.pan(-.9), p2 = this.pan(.9);
      this.busPad.connect(dry); dry.connect(this.musicIn); this.busPad.connect(d1); d1.connect(wl); wl.connect(p1); p1.connect(this.musicIn); this.busPad.connect(d2); d2.connect(wr); wr.connect(p2); p2.connect(this.musicIn);
      const v = this.gain(.45); this.busPad.connect(v); v.connect(this.verbIn); this.busPad.vs = v; }
    // drum sends / fx / texture
    this.drumVerb = this.gain(1); this.drumVerb.connect(this.verbIn);
    this.fxBus = this.gain(.8); this.fxBus.connect(this.pre); const fv = this.gain(.5); this.fxBus.connect(fv); fv.connect(this.verbIn);
    this.texBus = this.gain(0); this.texBus.trim = 1; this.texBus.connect(this.musicIn); const tv = this.gain(.3); this.texBus.connect(tv); tv.connect(this.verbIn);
    this.curTex = null;
  };

  // mid/side stereo widener
  P._widener = function (src, dst, w) {
    const c = this.ctx, st = this.node('Gain'); st.channelCount = 2; st.channelCountMode = 'explicit'; src.connect(st);
    const sp = c.createChannelSplitter(2), mg = c.createChannelMerger(2);
    st.connect(sp);
    const lm = this.gain(.5), rm = this.gain(.5), ls = this.gain(.5), rs = this.gain(-.5), mid = this.gain(1), side = this.gain(1), inv = this.gain(-1);
    sp.connect(lm, 0); sp.connect(rm, 1); sp.connect(ls, 0); sp.connect(rs, 1);
    lm.connect(mid); rm.connect(mid); ls.connect(side); rs.connect(side);
    this.sideGain = side; side.gain.value = w;
    mid.connect(mg, 0, 0); side.connect(mg, 0, 0); mid.connect(mg, 0, 1); side.connect(inv); inv.connect(mg, 0, 1);
    mg.connect(dst);
  };

  P.setReverb = function (sec, dark, lvl, seed, t) {
    const c = this.ctx, conv = c.createConvolver(); conv.buffer = MM.makeIR(c, sec, dark, seed);
    const og = this.gain(0); if (!this.verbPre) { this.verbPre = this.biq('highpass', 220, .6); this.verbIn.connect(this.verbPre); } this.verbPre.connect(conv); conv.connect(og); og.connect(this.verbOut);
    const now = t == null ? c.currentTime : t;
    if (!this.vSlot) og.gain.value = 1; else { og.gain.setTargetAtTime(1, now, .6); const o = this.vSlot; o.og.gain.setTargetAtTime(0, now, .6); if (!this.offline) setTimeout(() => { try { this.verbPre.disconnect(o.conv); o.og.disconnect(); } catch (e) {} }, 6000); }
    this.vSlot = { conv, og }; this.verbOut.gain.setTargetAtTime(lvl, now, .3);
  };

  // sidechain-style pumping
  P.duck = function (t, depth, rel) {
    if (depth <= 0) return;
    const f = 1 - depth;
    this.musicDuck.gain.setValueAtTime(f, t); this.musicDuck.gain.setTargetAtTime(1, t + .012, rel * .35);
    this.verbDuck.gain.setValueAtTime(1 - depth * .5, t); this.verbDuck.gain.setTargetAtTime(1, t + .012, rel * .4);
    this.bassDuck.gain.setValueAtTime(1 - depth * .75, t); this.bassDuck.gain.setTargetAtTime(1, t + .01, rel * .22);
  };

  const HL = { kick: .62, snare: 1.15, clap: 1.0, hat: .95, ohat: .8, ride: .75, crash: .7, rev: .7, impact: .5, tomH: 1, tomM: 1, tomL: 1, congaH: 1, congaL: 1, wood: .8, cow: .6, agoH: .6, agoL: .6, shaker: .6, rim: .8, brush: .7 };
  // ---------- drums: play a pre-rendered one-shot ----------
  P.hit = function (name, t, vel, o) {
    const b = this.kit && this.kit[name]; if (!b) return null; o = o || {};
    if (this.muted && this.muted.fx && (name === 'impact' || name === 'crash' || name === 'rev')) return null;
    const c = this.ctx, s = c.createBufferSource(); s.buffer = b;
    if (o.rate) s.playbackRate.value = o.rate;
    const g = this.gain(vel * (o.gain == null ? 1 : o.gain) * (HL[name] == null ? .5 : HL[name])); s.connect(g);
    let out = g; if (o.pan) { out = this.pan(o.pan); g.connect(out); }
    out.connect(o.bus || this.drumBus);
    if (o.verb) { const v = this.gain(o.verb); out.connect(v); v.connect(this.verbIn); }
    if (o.dly) { const d = this.gain(o.dly); out.connect(d); d.connect(this.dlyIn); }
    s.start(t, o.offset || 0); return g;
  };

  // ---------- texture beds ----------
  P.setTexture = function (kind, t) {
    const c = this.ctx, now = t == null ? c.currentTime : t;
    if (this.curTex) { const o = this.curTex; o.g.gain.setTargetAtTime(0, now, .5); try { o.stop(now + 3); } catch (e) {} this.curTex = null; }
    if (this.wob) { try { this.wob.stop(now + 3); } catch (e) {} this.wob = null; }
    const stops = [];
    if (kind === 'crackle') {
      const s = c.createBufferSource(); s.buffer = MM.makeCrackle(c, this.g.seed); s.loop = true;
      const g = this.gain(1), f = this.biq('highpass', 400, .5); s.connect(f); f.connect(g); g.connect(this.texBus); s.start(now); stops.push(s);
      this.curTex = { g, stop: tt => s.stop(tt) };
      // tape wobble for every pitched voice
      const lfo = c.createOscillator(), lg = this.gain(9), lfo2 = c.createOscillator(), lg2 = this.gain(4); lfo.frequency.value = .55; lfo2.frequency.value = 3.1; lfo.connect(lg); lfo2.connect(lg2);
      const w = this.gain(1); lg.connect(w); lg2.connect(w); lfo.start(now); lfo2.start(now); this.wob = { connect: p => w.connect(p), stop: tt => { lfo.stop(tt); lfo2.stop(tt); } };
    } else if (kind === 'air') {
      const mk = (fc, rate, depth, lvl) => { const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; s.playbackRate.value = .9 + Math.random() * .2; const bp = this.biq('bandpass', fc, .9); const l = c.createOscillator(), lgn = this.gain(depth); l.frequency.value = rate; l.connect(lgn); lgn.connect(bp.frequency); const g = this.gain(lvl); s.connect(bp); bp.connect(g); l.start(now); s.start(now); return { g, s, l }; };
      const a = mk(900, .045, 600, .5), b = mk(3200, .031, 1800, .22), out = this.gain(1); a.g.connect(out); b.g.connect(out); out.connect(this.texBus);
      this.curTex = { g: out, stop: tt => { a.s.stop(tt); b.s.stop(tt); a.l.stop(tt); b.l.stop(tt); } };
    }
    this.texKind = kind;
  };
  P.wobble = function (o) { if (this.wob) this.wob.connect(o.detune); };

  // ---------- FX ----------
  P.riser = function (t, dur, lvl) {
    if (this.muted && this.muted.fx) return;
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const bp = this.biq('bandpass', 250, 1.6); bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(9000, t + dur);
    const g = this.gain(1e-4); g.gain.setValueAtTime(1e-4, t); g.gain.exponentialRampToValueAtTime(.28 * lvl, t + dur * .97); g.gain.linearRampToValueAtTime(0, t + dur + .03);
    s.connect(bp); bp.connect(g); g.connect(this.fxBus); s.start(t); s.stop(t + dur + .1);
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(1500, t + dur);
    const lp = this.biq('lowpass', 600, 2); lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const og = this.gain(1e-4); og.gain.setValueAtTime(1e-4, t); og.gain.exponentialRampToValueAtTime(.07 * lvl, t + dur * .95); og.gain.linearRampToValueAtTime(0, t + dur + .03);
    o.connect(lp); lp.connect(og); og.connect(this.fxBus); o.start(t); o.stop(t + dur + .1);
  };
  P.swoosh = function (t, dur, down) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const bp = this.biq('bandpass', down ? 7000 : 300, 1.2); bp.frequency.setValueAtTime(down ? 7000 : 300, t); bp.frequency.exponentialRampToValueAtTime(down ? 250 : 7000, t + dur);
    const g = this.gain(1e-4); g.gain.setValueAtTime(1e-4, t); g.gain.exponentialRampToValueAtTime(.22, t + dur * (down ? .1 : .9)); g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    s.connect(bp); bp.connect(g); g.connect(this.fxBus); s.start(t); s.stop(t + dur + .1);
  };

  // ---------- synth voices ----------
  P._osc = function (type, f, t, end, dest, det) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (det) o.detune.value = det; o.connect(dest); this.wobble(o); o.start(t); o.stop(end); return o;
  };
  P._lfo = function (rate, depth, t, end, target, delay) {
    const c = this.ctx, o = c.createOscillator(), g = this.gain(0); o.frequency.value = rate; o.connect(g); g.connect(target);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(depth, t + (delay || 0) + .25); o.start(t); o.stop(end); return o;
  };

  // BASS --------------------------------------------------------------
  P.bassNote = function (kind, m, t, dur, vel, o) {
    o = o || {}; const c = this.ctx, f = mtof(m), mood = this.mood, cut = this.g.cut || .7;
    const out = this.gain(1); out.connect(this.bassIn);
    const end = t + dur + .5, v = vel;
    const slide = (osc) => { if (o.slide) { osc.frequency.setValueAtTime(o.slide, t); osc.frequency.exponentialRampToValueAtTime(f, t + .07); } };
    switch (kind) {
      case 'sub': {
        const g = this.gain(1); g.connect(out);
        const e = adsr(g.gain, t, .75 * v, .012, .05, .85, dur * .9, .09); out.gain.value = 1;
        const a = this._osc('sine', f, t, e + .05, g); slide(a);
        const h = this.gain(.14); this._osc('triangle', f * 2, t, e + .05, h); h.connect(g);
        break;
      }
      case '808': {
        const g = this.gain(1), ln = Math.min(2.2, dur * 1.05 + .15); g.connect(out);
        g.gain.setValueAtTime(1e-4, t); g.gain.exponentialRampToValueAtTime(.9 * v, t + .004); g.gain.exponentialRampToValueAtTime(.5 * v, t + ln * .6); g.gain.exponentialRampToValueAtTime(1e-4, t + ln);
        const os = c.createOscillator(); os.type = 'sine'; os.connect(g);
        const f0 = o.slide || f * 1.9; os.frequency.setValueAtTime(f0, t); os.frequency.exponentialRampToValueAtTime(f, t + (o.slide ? .08 : .04)); os.start(t); os.stop(t + ln + .05);
        out.gain.value = 1.15;
        break;
      }
      case 'reese': {
        const lp = this.biq('lowpass', 400 + 700 * mood * cut, 2.2); lp.connect(out);
        const bt = 60 / this.bpmNow();
        this._lfo(1 / (bt * 2), 260 + 320 * mood, t, end, lp.frequency, 0);
        const g = this.gain(1); g.connect(lp);
        const e = adsr(g.gain, t, .62 * v, .012, .05, .95, dur, .07);
        [-19, 0, 19].forEach((d, i) => { const so = this._osc('sawtooth', f, t, e + .05, g, d); if (i === 2) this._lfo(.37, 14, t, e + .05, so.detune, 0); });
        const sb = this.gain(.8); this._osc('sine', f, t, e + .05, sb); sb.connect(g);
        out.gain.value = 1.1; break;
      }
      case 'acid': {
        const base = 160 + 700 * (.35 + mood * .65) * cut, pk = base * (o.accent ? 9 : 5);
        const lp = this.biq('lowpass', base, 13); lp.frequency.setValueAtTime(pk, t); lp.frequency.exponentialRampToValueAtTime(base * 1.2, t + (o.accent ? .26 : .17)); lp.connect(out);
        const g = this.gain(1); g.connect(lp);
        const e = adsr(g.gain, t, (o.accent ? .8 : .55) * v, .003, .04, .9, dur * .92, .03);
        const os = this._osc(this.g.seed % 2 ? 'sawtooth' : 'square', f, t, e + .05, g); slide(os);
        out.gain.value = .75; break;
      }
      case 'funk': case 'pump': {
        const pump = kind === 'pump';
        const lp = this.biq('lowpass', 200, 3.2); const hi = (pump ? 1500 : 2400) * (.5 + mood * .8) * cut + 300;
        lp.frequency.setValueAtTime(hi * .35, t); lp.frequency.exponentialRampToValueAtTime(hi, t + .008); lp.frequency.exponentialRampToValueAtTime(pump ? 160 : 520, t + .16); lp.connect(out);
        const g = this.gain(1); g.connect(lp);
        const e = adsr(g.gain, t, .7 * v, .004, .08, .7, dur * .85, .05);
        this._osc('sawtooth', f, t, e + .05, g); const sq = this.gain(.5); this._osc(pump ? 'sine' : 'square', f, t, e + .05, sq); sq.connect(g);
        out.gain.value = pump ? 1.15 : .95; break;
      }
      case 'walk': {
        const lp = this.biq('lowpass', 750 + 500 * mood, .8); lp.connect(out);
        const g = this.gain(1); g.connect(lp);
        g.gain.setValueAtTime(1e-4, t); g.gain.exponentialRampToValueAtTime(.85 * v, t + .008); g.gain.exponentialRampToValueAtTime(.4 * v, t + dur * .8); g.gain.exponentialRampToValueAtTime(1e-4, t + dur + .09);
        this._osc('triangle', f, t, t + dur + .15, g); const s = this.gain(.7); this._osc('sine', f, t, t + dur + .15, s); s.connect(g);
        const nb = c.createBufferSource(); nb.buffer = this.noiseBuf; const nf = this.biq('bandpass', 1100, 1.5), ng = this.gain(0); ng.gain.setValueAtTime(.18 * v, t); ng.gain.exponentialRampToValueAtTime(1e-4, t + .035); nb.connect(nf); nf.connect(ng); ng.connect(out); nb.start(t, Math.random() * 1.5); nb.stop(t + .06);
        out.gain.value = 1.1; break;
      }
      case 'pulse': {
        const lp = this.biq('lowpass', 300, 2.5); const hi = 450 + 900 * (.4 + mood) * cut; lp.frequency.setValueAtTime(hi * 2.5, t); lp.frequency.exponentialRampToValueAtTime(hi, t + .1); lp.connect(out);
        const g = this.gain(1); g.connect(lp); const e = adsr(g.gain, t, .65 * v, .005, .06, .85, dur * .85, .05);
        this._osc('sawtooth', f, t, e + .05, g); this._osc('sawtooth', f, t, e + .05, g, 9); const s = this.gain(.8); this._osc('sine', f, t, e + .05, s); s.connect(g);
        out.gain.value = .85; break;
      }
      case 'chip': {
        const g = this.gain(1); g.connect(out); const e = adsr(g.gain, t, .42 * v, .003, .02, .85, dur * .7, .02);
        const os = c.createOscillator(); os.setPeriodicWave(this.pulseWave(.5)); os.frequency.value = f; os.connect(g); os.start(t); os.stop(e + .05);
        const os2 = c.createOscillator(); os2.type = 'triangle'; os2.frequency.value = f; const g2 = this.gain(.5); os2.connect(g2); g2.connect(g); os2.start(t); os2.stop(e + .05);
        out.gain.value = .9; break;
      }
      case 'fm': {
        const g = this.gain(1); g.connect(out); const e = adsr(g.gain, t, .75 * v, .005, .08, .75, dur * .9, .08);
        const car = this._osc('sine', f, t, e + .05, g), mod = c.createOscillator(), mg = this.gain(f * 2.2); mod.frequency.value = f; mod.connect(mg); mg.connect(car.frequency);
        mg.gain.setValueAtTime(f * 2.4, t); mg.gain.exponentialRampToValueAtTime(f * .35, t + .16); mod.start(t); mod.stop(e + .05);
        const s = this.gain(.35); this._osc('sine', f / 2, t, e + .05, s); s.connect(g); out.gain.value = 1; break;
      }
      case 'drone': default: {
        const lp = this.biq('lowpass', 260, .8); lp.connect(out); const g = this.gain(1); g.connect(lp);
        const e = adsr(g.gain, t, .65 * v, Math.min(1.2, dur * .3), .2, .9, dur, Math.min(1.5, dur * .4));
        this._osc('sine', f, t, e + .1, g); this._osc('sawtooth', f, t, e + .1, g, 7); this._osc('sawtooth', f, t, e + .1, g, -7);
        const s = this.gain(.8); this._osc('sine', f * .5, t, e + .1, s); s.connect(g); out.gain.value = .9; break;
      }
    }
  };

  // CHORDS / PADS -------------------------------------------------------
  P.chordNote = function (kind, notes, t, dur, vel, role, o) {
    o = o || {}; const c = this.ctx, mood = this.mood, bus = role === 'pad' ? this.busPad : this.busChord, cut = this.g.cut || .7;
    const sorted = notes.slice().sort((a, b) => a - b);
    const gStrum = (i) => (o.strum ? i * o.strum : 0);
    const noteFM = (m, i, p) => { // FM keys (rhodes / epiano / bellpad)
      const f = mtof(m), tt = t + gStrum(i), a = this.gain(1), pn = this.pan((m - 62) / 40 + rr(-.08, .08)); a.connect(pn); pn.connect(bus);
      const len = p.len; const e = tt + dur + len + .1;
      a.gain.setValueAtTime(1e-4, tt); a.gain.exponentialRampToValueAtTime(p.pk * vel, tt + p.atk); a.gain.exponentialRampToValueAtTime(p.pk * vel * p.s, tt + .4); a.gain.setValueAtTime(p.pk * vel * p.s * Math.pow(.5, Math.max(0, dur - .4) / p.hl), tt + Math.max(.4, dur)); a.gain.exponentialRampToValueAtTime(1e-4, tt + Math.max(.4, dur) + p.rel);
      const car = this._osc('sine', f, tt, tt + Math.max(.4, dur) + p.rel + .1, a);
      const mod = c.createOscillator(), mg = this.gain(0); mod.frequency.value = f * p.ratio; mod.connect(mg); mg.connect(car.frequency);
      mg.gain.setValueAtTime(f * p.idx, tt); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * p.idx2), tt + p.idt); mod.start(tt); mod.stop(tt + Math.max(.4, dur) + p.rel + .1);
      if (p.tine) { const tg = this.gain(p.tine * .5); this._osc('sine', f * 4.01, tt, tt + .5, tg); tg.connect(a); tg.gain.setValueAtTime(p.tine * .5, tt); tg.gain.exponentialRampToValueAtTime(1e-4, tt + .18); }
    };
    switch (kind) {
      case 'rhodes': sorted.forEach((m, i) => noteFM(m, i, { pk: .3, atk: .004, s: .5, hl: 1.2, rel: .5, len: 1, ratio: 1, idx: 1.7, idx2: .25, idt: .5, tine: .5 })); break;
      case 'epiano': sorted.forEach((m, i) => noteFM(m, i, { pk: .28, atk: .003, s: .35, hl: .7, rel: .3, len: .8, ratio: 1, idx: 2.4, idx2: .5, idt: .3, tine: .7 })); break;
      case 'bellpad': sorted.forEach((m, i) => noteFM(m + 12, i, { pk: .2, atk: .015, s: .6, hl: 2, rel: 1.6, len: 2, ratio: 3.5, idx: 1.3, idx2: .12, idt: 1.2, tine: 0 })); break;
      case 'organ': {
        const lp = this.biq('lowpass', 2400 * (.7 + mood * .6), .7), a = this.gain(1); lp.connect(a); a.connect(bus);
        const e = adsr(a.gain, t, .17 * vel, .004, .02, .85, Math.min(dur, o.short || dur), .05);
        sorted.forEach(m => { const f = mtof(m); this._osc('sine', f, t, e + .05, lp); const h = this.gain(.5); this._osc('sine', f * 2, t, e + .05, h); h.connect(lp); const h2 = this.gain(.22); this._osc('sine', f * 3, t, e + .05, h2); h2.connect(lp); });
        break;
      }
      case 'stab': {
        const hi = 1500 + 3500 * (.3 + mood) * cut, lp = this.biq('lowpass', hi, 3.5); lp.frequency.setValueAtTime(hi * .3, t); lp.frequency.exponentialRampToValueAtTime(hi * 1.5, t + .012); lp.frequency.exponentialRampToValueAtTime(hi * .35, t + .32);
        const a = this.gain(1); lp.connect(a); a.connect(bus);
        const e = adsr(a.gain, t, .2 * vel, .004, .2, .08, Math.min(dur, .3), .1);
        sorted.forEach((m, i) => { const f = mtof(m), pn = this.pan(i % 2 ? .5 : -.5); pn.connect(lp); this._osc('sawtooth', f, t, e + .05, pn, -10); this._osc('sawtooth', f, t, e + .05, pn, 10); });
        break;
      }
      case 'supersaw': case 'strings': {
        const st = kind === 'strings', stac = o.stac;
        const cutv = (st ? 1500 : 2200) + 2800 * (.2 + mood) * cut * (stac ? 1.3 : 1);
        const a = this.gain(1); a.connect(bus);
        const atk = stac ? .012 : Math.min(st ? 1.0 : 1.4, dur * .3);
        const e = stac ? adsr(a.gain, t, .22 * vel, atk, .12, .3, Math.min(dur, .35), .1) : adsr(a.gain, t, (st ? .2 : .17) * vel, atk, .3, .85, dur, Math.min(1.2, dur * .4 + .2));
        const groups = [[-.75, []], [0, []], [.75, []]];
        const mk = (pn, d) => { const lp = this.biq('lowpass', cutv, .8); if (!stac) { lp.frequency.setValueAtTime(cutv * .45, t); lp.frequency.linearRampToValueAtTime(cutv, t + dur * .5); lp.frequency.linearRampToValueAtTime(cutv * .55, t + dur + .3); } const p = this.pan(pn); lp.connect(p); p.connect(a); return lp; };
        const L = mk(-.7), C = mk(0), R = mk(.7);
        const dets = st ? [-9, 0, 9] : [-22, -11, 0, 11, 22];
        const vib = st ? this.gain(1) : null; if (vib) this._lfo(5.1, 7, t, e + .1, vib.gain, .3);
        sorted.forEach(m => { const f = mtof(m); dets.forEach(d => { const dest = d < 0 ? L : d > 0 ? R : C; const os = this._osc('sawtooth', f, t, e + .1, dest, d + rr(-2, 2)); if (st && vib) vib.connect(os.detune); }); });
        break;
      }
      case 'glass': {
        const lp = this.biq('lowpass', 3500 * (.6 + mood * .6), .5), a = this.gain(1); lp.connect(a); a.connect(bus);
        const e = adsr(a.gain, t, .2 * vel, Math.min(1.6, dur * .3), .3, .85, dur, Math.min(1.4, dur * .4 + .2));
        sorted.forEach((m, i) => { const f = mtof(m), pn = this.pan(i % 2 ? .45 : -.45); pn.connect(lp); this._osc('triangle', f, t, e + .1, pn, -5); this._osc('triangle', f, t, e + .1, pn, 5); const h = this.gain(.3); this._osc('sine', f * 2, t, e + .1, h); h.connect(pn); const h2 = this.gain(.1); this._osc('sine', f * 4, t, e + .1, h2); h2.connect(pn); });
        break;
      }
      case 'brass': {
        const hi = 1200 + 2600 * (.4 + mood) * cut, lp = this.biq('lowpass', hi, 1.5); lp.frequency.setValueAtTime(hi * .35, t); lp.frequency.exponentialRampToValueAtTime(hi, t + .09); lp.frequency.setTargetAtTime(hi * .5, t + .12, .25); const a = this.gain(1); lp.connect(a); a.connect(bus);
        const e = adsr(a.gain, t, .2 * vel, .035, .15, .65, dur, .14);
        sorted.forEach((m, i) => { const f = mtof(m), pn = this.pan(i % 2 ? .35 : -.35); pn.connect(lp); this._osc('sawtooth', f, t, e + .05, pn, -7); this._osc('sawtooth', f, t, e + .05, pn, 7); });
        break;
      }
      case 'pluckchord': {
        sorted.forEach((m, i) => {
          const tt = t + i * (o.strum || .011), f = mtof(m), hi = 3200 * (.5 + mood * .7) * cut + 500, lp = this.biq('lowpass', hi, 2), a = this.gain(1), pn = this.pan((m - 60) / 40);
          lp.frequency.setValueAtTime(hi, tt); lp.frequency.exponentialRampToValueAtTime(Math.max(300, hi * .16), tt + .3); lp.connect(a); a.connect(pn); pn.connect(bus);
          const e = adsr(a.gain, tt, .26 * vel, .002, .35, .02, Math.min(.35, dur), .25);
          this._osc('sawtooth', f, tt, e + .05, lp, -6); this._osc('triangle', f * 2, tt, e + .05, lp, 6);
        }); break;
      }
      case 'pulse': {
        sorted.forEach((m, i) => { const tt = t + gStrum(i), f = mtof(m), a = this.gain(1); a.connect(bus); const e = adsr(a.gain, tt, .17 * vel, .003, .03, .6, Math.min(dur, .2), .03); const os = c.createOscillator(); os.setPeriodicWave(this.pulseWave(.25)); os.frequency.value = f; os.connect(a); os.start(tt); os.stop(e + .05); });
        break;
      }
      default: sorted.forEach((m, i) => this.leadNote(kind, m, t + gStrum(i), dur, vel * .8, 'chord'));
    }
  };

  // LEAD / ARP ---------------------------------------------------------
  P.leadNote = function (kind, m, t, dur, vel, role) {
    const c = this.ctx, mood = this.mood, f = mtof(m), cut = this.g.cut || .7;
    const bus = role === 'arp' ? this.busArp : role === 'chord' ? this.busChord : this.busLead;
    const a = this.gain(1), pn = this.pan(role === 'arp' ? rr(-.6, .6) : rr(-.25, .25)); a.connect(pn); pn.connect(bus);
    const glideFrom = (osc) => { if (role === 'lead' && this.lastLeadF && t - this.lastLeadT < dur * 2 + .3 && Math.abs(Math.log2(this.lastLeadF / f)) < 1.1 && (kind === 'saw' || kind === 'sine' || kind === 'brass')) { osc.frequency.setValueAtTime(this.lastLeadF, t); osc.frequency.exponentialRampToValueAtTime(f, t + .055); } };
    let e;
    switch (kind) {
      case 'saw': {
        const hi = (1600 + 4200 * (.25 + mood) * cut), lp = this.biq('lowpass', hi, 3); lp.frequency.setValueAtTime(hi * 2.4, t); lp.frequency.exponentialRampToValueAtTime(hi * .8, t + .22); lp.connect(a);
        e = adsr(a.gain, t, .26 * vel, .01, .1, .75, dur, .2);
        const v = this.gain(1); this._lfo(5.4, 9, t, e + .1, v.gain, .15);
        [-11, 0, 11].forEach(d => { const os = this._osc('sawtooth', f, t, e + .1, lp, d); v.connect(os.detune); glideFrom(os); }); break;
      }
      case 'sine': {
        e = adsr(a.gain, t, .4 * vel, .025, .08, .8, dur, .25);
        const os = this._osc('sine', f, t, e + .1, a); glideFrom(os); this._lfo(5.2, 7, t, e + .1, os.detune, .2);
        const h = this.gain(.18); this._osc('triangle', f * 2, t, e + .1, h); h.connect(a); break;
      }
      case 'bell': {
        e = adsr(a.gain, t, .34 * vel, .003, 1.2, .001, .01, .1); e = t + 1.5;
        const car = this._osc('sine', f, t, e, a), mod = c.createOscillator(), mg = this.gain(0); mod.frequency.value = f * 3.5; mod.connect(mg); mg.connect(car.frequency);
        mg.gain.setValueAtTime(f * 1.8, t); mg.gain.exponentialRampToValueAtTime(f * .08, t + .6); mod.start(t); mod.stop(e); break;
      }
      case 'fm': {
        e = adsr(a.gain, t, .3 * vel, .006, .12, .65, dur, .2);
        const car = this._osc('sine', f, t, e + .1, a), mod = c.createOscillator(), mg = this.gain(0); mod.frequency.value = f * 2; mod.connect(mg); mg.connect(car.frequency);
        mg.gain.setValueAtTime(f * 1.7, t); mg.gain.exponentialRampToValueAtTime(f * .5, t + .3); mod.start(t); mod.stop(e + .1); this._lfo(5.6, 6, t, e + .1, car.detune, .2); break;
      }
      case 'kalimba': {
        e = t + .9; a.gain.setValueAtTime(1e-4, t); a.gain.exponentialRampToValueAtTime(.42 * vel, t + .002); a.gain.exponentialRampToValueAtTime(1e-4, e);
        this._osc('sine', f, t, e, a); const h = this.gain(.35); this._osc('sine', f * 5.4, t, t + .12, h); h.connect(a); h.gain.setValueAtTime(.35, t); h.gain.exponentialRampToValueAtTime(1e-4, t + .08);
        const h2 = this.gain(.12); this._osc('sine', f * 3, t, t + .3, h2); h2.connect(a); break;
      }
      case 'flute': {
        e = adsr(a.gain, t, .38 * vel, .06, .1, .8, dur, .14);
        const os = this._osc('sine', f, t, e + .1, a); this._lfo(5.1, 10, t, e + .1, os.detune, .12); const h = this.gain(.14); this._osc('sine', f * 2, t, e + .1, h); h.connect(a);
        const nb = c.createBufferSource(); nb.buffer = this.noiseBuf; const nf = this.biq('bandpass', Math.min(9000, f * 3), 2), ng = this.gain(0); ng.gain.setValueAtTime(1e-4, t); ng.gain.exponentialRampToValueAtTime(.06 * vel, t + .05); ng.gain.exponentialRampToValueAtTime(1e-4, e); nb.connect(nf); nf.connect(ng); ng.connect(a); nb.start(t, Math.random()); nb.stop(e + .05); break;
      }
      case 'chip': {
        e = adsr(a.gain, t, .17 * vel, .003, .04, .8, dur * .85, .03);
        const os = c.createOscillator(); os.setPeriodicWave(this.pulseWave(this.g.seed % 3 ? .25 : .125)); os.frequency.value = f; os.connect(a); os.start(t); os.stop(e + .05); this._lfo(6.5, 8, t, e + .05, os.detune, .1); break;
      }
      case 'pluck': {
        const hi = 4200 * (.4 + mood * .8) * cut + 600, lp = this.biq('lowpass', hi, 4); lp.frequency.setValueAtTime(hi, t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, hi * .12), t + .22); lp.connect(a);
        e = t + Math.min(.55, dur * .8 + .22); a.gain.setValueAtTime(1e-4, t); a.gain.exponentialRampToValueAtTime(.3 * vel, t + .002); a.gain.exponentialRampToValueAtTime(1e-4, e);
        this._osc('sawtooth', f, t, e, lp, -7); this._osc('sawtooth', f, t, e, lp, 7); break;
      }
      case 'brass': {
        const hi = 1300 + 2400 * (.4 + mood) * cut, lp = this.biq('lowpass', hi, 1.4); lp.frequency.setValueAtTime(hi * .4, t); lp.frequency.exponentialRampToValueAtTime(hi, t + .08); lp.connect(a);
        e = adsr(a.gain, t, .26 * vel, .04, .1, .8, dur, .15);
        [-6, 6].forEach(d => { const os = this._osc('sawtooth', f, t, e + .1, lp, d); glideFrom(os); this._lfo(5.3, 9, t, e + .1, os.detune, .25); }); break;
      }
      case 'epiano': { a.disconnect(); this.chordNote('epiano', [m], t, dur, vel * 1.15, 'chord'); e = t + 1; break; }
      default: { a.disconnect(); this.leadNote('sine', m, t, dur, vel, role); return; }
    }
    if (role === 'lead') { this.lastLeadF = f; this.lastLeadT = t + dur; }
  };
})(window);
