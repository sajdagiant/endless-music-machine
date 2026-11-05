/* Endless Music Machine — Music Box ♫: a glowing pinned cylinder sits on the orb; crank it and steel pins pluck
   metallic tines tuned to the CURRENT chord/key (re-tuned live on every chord/key/genre change). Crank speed =
   playback rate of an ornamental in-key melody (slow = lullaby, fast = sparkle run); reverse crank plays it
   backwards. Soft metallic Karplus–Strong / comb tines — no neon pink, no harsh grit. Instrumental only. */
(function (G) {
  'use strict';
  const MM = G.MM, P = MM.Engine.prototype;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  P.BOX_N = 8;
  P.BOX_MEL = 16;
  // tines: chord tones + a couple of colour notes from the key, spread across ~1.5 octaves
  P.boxTines = function () {
    const n = this.BOX_N, g = this.g || {}, sc = this.scale || [0, 2, 4, 7, 9], tonic = (((g.root || 0) + (this.keyOff || 0)) % 12 + 12) % 12;
    const keyPc = new Set(sc.map(x => (tonic + x) % 12)), vo = this.voicing || [60, 64, 67];
    const root = this.chord && this.chord.root != null ? ((this.chord.root % 12) + 12) % 12 : ((Math.min.apply(null, vo) % 12) + 12) % 12;
    const pcs = []; const add = pc => { pc = ((pc % 12) + 12) % 12; if (pcs.indexOf(pc) < 0) pcs.push(pc); };
    add(root); vo.forEach(add);
    if (pcs.length < 5 && keyPc.has((root + 2) % 12)) add(root + 2);
    if (pcs.length < 5 && keyPc.has((root + 9) % 12)) add(root + 9);
    if (pcs.length < 5 && keyPc.has((root + 7) % 12)) add(root + 7);
    sc.forEach(x => { if (pcs.length < 6) add(tonic + x); });
    const out = []; for (let m = 62; out.length < n && m < 100; m++) if (pcs.indexOf(m % 12) >= 0) out.push(m);
    while (out.length < n) out.push(out[out.length - 1] + 12);
    return out.slice(0, n).map(m => ({ m, root: m % 12 === root }));
  };
  // ornamental in-key melody: a looping phrase of tine indices (+ occasional rests), re-seeded when harmony shifts
  P.boxMelody = function () {
    const st = this.boxTines(), n = st.length, L = this.BOX_MEL;
    const sig = st.map(s => s.m).join(',') + '|' + ((this.g && this.g.seed) || 0);
    if (this._boxMel && this._boxMelSig === sig) return this._boxMel;
    this._boxMelSig = sig;
    // tiny deterministic PRNG from the seed + chord signature so the phrase stays stable until harmony moves
    let h = 2166136261; for (let i = 0; i < sig.length; i++) { h ^= sig.charCodeAt(i); h = Math.imul(h, 16777619); }
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
    const mel = new Array(L), rootI = Math.max(0, st.findIndex(s => s.root));
    // contour: gentle arcs + neighbour ornaments (lullaby at slow crank, sparkle when fast)
    let cur = rootI >= 0 ? rootI : 0;
    for (let i = 0; i < L; i++) {
      if (i % 8 === 7 && rnd() < .45) { mel[i] = -1; continue; } // soft rest on phrase ends
      const step = rnd() < .55 ? (rnd() < .5 ? 1 : -1) : (rnd() < .5 ? 2 : -2);
      cur = clamp(cur + step, 0, n - 1);
      if (rnd() < .18) cur = rootI >= 0 ? rootI : 0; // land on root occasionally
      mel[i] = cur;
      // neighbour grace on even beats
      if (i % 2 === 0 && rnd() < .35 && i + 1 < L) {
        const gr = clamp(cur + (rnd() < .5 ? 1 : -1), 0, n - 1);
        mel[i] = gr; // grace first… next step will settle (handled by loop)
      }
    }
    // ensure at least half the steps sound
    let sounded = mel.filter(x => x >= 0).length;
    while (sounded < L * .6) { const i = (rnd() * L) | 0; if (mel[i] < 0) { mel[i] = (rnd() * n) | 0; sounded++; } }
    this._boxMel = mel; return mel;
  };
  // metallic tine: short KS with bright excitation + bright loss (music-box comb feel)
  P._boxBuf = function (m) {
    const c = this.ctx, sr = c.sampleRate, key = 'bx|' + m;
    this._bx = this._bx || new Map(); if (this._bx.has(key)) return this._bx.get(key);
    if (this._bx.size > 96) this._bx.delete(this._bx.keys().next().value);
    const f = 440 * Math.pow(2, (m - 69) / 12), T = clamp(2.4 - (m - 60) * .04, .9, 2.6), len = Math.floor(sr * (T * .7 + .08));
    const D = sr / f - .5, Ni = Math.max(2, Math.round(D)), y = new Float32Array(len), ex = new Float32Array(Ni);
    // bright metallic burst (narrow pulse + soft noise) — never harsh
    let lp = 0; for (let i = 0; i < Ni; i++) { const n = Math.random() * 2 - 1; lp += .55 * (n - lp); const env = i < Ni * .18 ? 1 : Math.exp(-(i - Ni * .18) / (Ni * .25)); ex[i] = (lp * .55 + (i < 3 ? (i & 1 ? -1 : 1) * .9 : 0)) * env; }
    let mean = 0; for (let i = 0; i < Ni; i++) mean += ex[i]; mean /= Ni;
    let pk = 1e-9; for (let i = 0; i < Ni; i++) { ex[i] -= mean; pk = Math.max(pk, Math.abs(ex[i])); }
    const rho = Math.pow(.001, 1 / (f * T)), Di = Math.floor(D), fr = D - Di;
    const rd = n => n < 0 ? 0 : y[n];
    for (let n = 0; n < len; n++) {
      const d0 = (1 - fr) * rd(n - Di) + fr * rd(n - Di - 1), d1 = (1 - fr) * rd(n - Di - 1) + fr * rd(n - Di - 2);
      y[n] = (n < Ni ? ex[n] / pk : 0) + rho * .5 * (d0 + d1);
    }
    // gentle high shimmer via a one-pole high emphasis on the attack, then fade
    let hp = 0; for (let n = 0; n < Math.min(len, Math.floor(sr * .08)); n++) { const x = y[n]; hp = .65 * (hp + x - (y[n - 1] || 0)); y[n] = x + hp * .28; }
    let p2 = 1e-9; for (let n = 0; n < len; n++) p2 = Math.max(p2, Math.abs(y[n]));
    const fade = Math.floor(sr * .18); for (let n = 0; n < len; n++) { y[n] /= p2; if (n > len - fade) y[n] *= (len - n) / fade; }
    const b = c.createBuffer(1, len, sr); b.getChannelData(0).set(y); this._bx.set(key, b); return b;
  };
  P.boxPluck = function (i, vel, u) {
    const st = this.boxTines(), s = st[clamp(i | 0, 0, st.length - 1)]; if (!s) return null;
    const c = this.ctx, t = c.currentTime + .003, m = s.m; vel = clamp(vel, .12, 1);
    this._bv = this._bv || {}; this._bl = this._bl || [];
    const damp = v => { try { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, .02); v.src.stop(t + .15); } catch (e) {} };
    if (this._bv[i]) damp(this._bv[i]);
    this._bl = this._bl.filter(v => v.end > t); if (this._bl.length > 12) damp(this._bl.shift());
    const b = this._boxBuf(m), pan = clamp((u == null ? (i / (st.length - 1) - .5) : (u - .5)) * 1.3, -.75, .75);
    const o = this._marbleOut(pan, .55, .13 * vel * (m > 88 ? .75 : 1)), gg = this.gain(1), src = c.createBufferSource();
    // soft body + air: warm metal, never harsh
    const body = this.biq('peaking', 520, .9); body.gain.value = 1.8;
    const air = this.biq('lowpass', 3800 + vel * 4200, .55);
    const shy = this.biq('highshelf', 7000, .7); shy.gain.value = -2.5;
    src.buffer = b; src.connect(body); body.connect(air); air.connect(shy); shy.connect(gg); gg.connect(o.out); src.start(t);
    const v = { src, g: gg, end: t + b.duration }; this._bv[i] = v; this._bl.push(v);
    setTimeout(() => { try { o.out.disconnect(); o.pn.disconnect(); } catch (e) {} }, (b.duration + 2) * 1000);
    this.boxPlucks = (this.boxPlucks || 0) + 1; this.emit('arp', t, m);
    return m;
  };
  P.boxPrewarm = function () { try { this.boxTines().forEach(s => this._boxBuf(s.m)); this.boxMelody(); } catch (e) {} };
})(window);
