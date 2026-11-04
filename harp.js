/* Endless Music Machine — Harp Strings: the glow becomes a curtain of glowing strings tuned to the CURRENT chord (plus a soft
   9th/6th colour tone), re-tuned live on every chord/key/genre change, so any strum sounds right. Real Karplus–Strong plucked
   strings (noise burst → tuned delay loop with a gentle loss filter), pluck position from where you touch the string (ends =
   bright & thin, middle = round & warm), a faint doubled string for shimmer, re-plucks damp the old note. Instrumental only. */
(function (G) {
  'use strict';
  const MM = G.MM, P = MM.Engine.prototype;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  P.HARP_N = 11;
  P.harpStrings = function () {
    const n = this.HARP_N, g = this.g || {}, sc = this.scale || [0, 2, 4, 7, 9], tonic = (((g.root || 0) + (this.keyOff || 0)) % 12 + 12) % 12;
    const keyPc = new Set(sc.map(x => (tonic + x) % 12)), vo = this.voicing || [60, 64, 67];
    const root = this.chord && this.chord.root != null ? ((this.chord.root % 12) + 12) % 12 : ((Math.min.apply(null, vo) % 12) + 12) % 12;
    const pcs = []; const add = pc => { pc = ((pc % 12) + 12) % 12; if (pcs.indexOf(pc) < 0) pcs.push(pc); };
    add(root); vo.forEach(add);
    if (pcs.length < 4 && keyPc.has((root + 2) % 12)) add(root + 2); // sweet add9
    if (pcs.length < 4 && keyPc.has((root + 9) % 12)) add(root + 9); // or a 6th
    const out = []; for (let m = 45; out.length < n && m < 110; m++) if (pcs.indexOf(m % 12) >= 0) out.push(m);
    return out.map(m => ({ m, root: m % 12 === root }));
  };
  // Karplus–Strong render (cached): pos 0 = plucked at the very end (bright), .5 = middle (warm, odd harmonics)
  P._ksBuf = function (m, pos) {
    const c = this.ctx, sr = c.sampleRate, pq = Math.round(clamp(pos, .06, .5) * 8) / 8, key = m + '|' + pq;
    this._ks = this._ks || new Map(); if (this._ks.has(key)) return this._ks.get(key);
    if (this._ks.size > 160) this._ks.delete(this._ks.keys().next().value);
    const f = 440 * Math.pow(2, (m - 69) / 12), T = clamp(5.2 - (m - 45) * .085, 1.4, 5.2), len = Math.floor(sr * (T * .75 + .1));
    const D = sr / f - .5, Ni = Math.max(2, Math.round(D)), y = new Float32Array(len), ex = new Float32Array(Ni);
    // excitation: soft-filtered noise (the "finger"), comb-notched at the pluck position, DC removed
    let lp = 0; const a = .32 + (.5 - pq) * .9; for (let i = 0; i < Ni; i++) { lp += a * ((Math.random() * 2 - 1) - lp); ex[i] = lp; }
    const k = Math.max(1, Math.round(pq * Ni)), ex2 = new Float32Array(Ni); let mean = 0;
    for (let i = 0; i < Ni; i++) { ex2[i] = ex[i] - (i >= k ? ex[i - k] : 0); mean += ex2[i]; } mean /= Ni;
    let pk = 1e-9; for (let i = 0; i < Ni; i++) { ex2[i] -= mean; pk = Math.max(pk, Math.abs(ex2[i])); }
    const rho = Math.pow(.001, 1 / (f * T)), Di = Math.floor(D), fr = D - Di;
    const rd = n => n < 0 ? 0 : y[n];
    for (let n = 0; n < len; n++) {
      const d0 = (1 - fr) * rd(n - Di) + fr * rd(n - Di - 1), d1 = (1 - fr) * rd(n - Di - 1) + fr * rd(n - Di - 2);
      y[n] = (n < Ni ? ex2[n] / pk : 0) + rho * .5 * (d0 + d1);
    }
    // gentle fade so the tail never clicks; normalise
    let p2 = 1e-9; for (let n = 0; n < len; n++) p2 = Math.max(p2, Math.abs(y[n]));
    const fade = Math.floor(sr * .25); for (let n = 0; n < len; n++) { y[n] /= p2; if (n > len - fade) y[n] *= (len - n) / fade; }
    const b = c.createBuffer(1, len, sr); b.getChannelData(0).set(y); this._ks.set(key, b); return b;
  };
  P.harpPluck = function (i, vel, u, pos) {
    const st = this.harpStrings(), s = st[clamp(i | 0, 0, st.length - 1)]; if (!s) return null;
    const c = this.ctx, t = c.currentTime + .004, m = s.m; vel = clamp(vel, .15, 1);
    this._hv = this._hv || {}; this._hl = this._hl || [];
    const damp = v => { try { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, .025); v.src.stop(t + .2); if (v.src2) v.src2.stop(t + .2); } catch (e) {} };
    if (this._hv[i]) damp(this._hv[i]); // re-pluck damps the string, like a real one
    this._hl = this._hl.filter(v => v.end > t); if (this._hl.length > 16) damp(this._hl.shift()); // voice budget
    const b = this._ksBuf(m, pos == null ? .25 : pos), pan = clamp((u - .5) * 1.4, -.8, .8);
    const o = this._marbleOut(pan, .45, .15 * vel * (m > 80 ? .8 : 1)), gg = this.gain(1), src = c.createBufferSource();
    const body = this.biq('peaking', 240, 1.1); body.gain.value = 2.5; const air = this.biq('lowpass', 2600 + vel * 5200, .5);
    src.buffer = b; src.connect(body); body.connect(air); air.connect(gg); gg.connect(o.out); src.start(t);
    let src2 = null; if (m < 84) { src2 = c.createBufferSource(); src2.buffer = b; src2.playbackRate.value = 1.0016; const g2 = this.gain(.22); src2.connect(g2); g2.connect(air); src2.start(t + .003); }
    const v = { src, src2, g: gg, end: t + b.duration }; this._hv[i] = v; this._hl.push(v);
    setTimeout(() => { try { o.out.disconnect(); o.pn.disconnect(); } catch (e) {} }, (b.duration + 2.5) * 1000);
    this.harpPlucks = (this.harpPlucks || 0) + 1; this.emit('arp', t, m);
    return m;
  };
  P.harpPrewarm = function () { try { this.harpStrings().forEach((s, i) => this._ksBuf(s.m, .25)); } catch (e) {} };
})(window);
