/* Endless Music Machine — Cameos: one charming character per genre family (14). Each has a quiet signature sound while it wanders
   through the glow, and a tap triggers a musical payoff that locks to the groove and the current key/chord. Instrumental only:
   every sound here is an instrument or synth (keys, reeds, bells, drums, bass, sirens, tape FX) — no voices. */
(function (G) {
  'use strict';
  const MM = G.MM, P = MM.Engine.prototype;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12), R = Math.random, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  MM.CAMEOS = {
    lofi: { name: 'Lo-fi Cat', emoji: '🐱', idle: 4, word: 'purr-fect ♪' },
    house: { name: 'Disco Ball', emoji: '🪩', idle: 2, word: 'groove!' },
    dnb: { name: 'Jungle Robot', emoji: '🤖', idle: 2, word: 'BZZT ⚡' },
    wave: { name: 'Neon Time Car', emoji: '🚗', idle: 4, word: 'OUTRUN ▶▶' },
    ambient: { name: 'Glow Jellyfish', emoji: '🪼', idle: 4, word: 'glow…' },
    dub: { name: 'Dub Turtle', emoji: '🐢', idle: 3, word: 'echo… echo…' },
    trap: { name: 'Drip Frog', emoji: '🐸', idle: 2, word: 'DRIP 💧' },
    jazz: { name: 'Sax Cat', emoji: '🎷', idle: 4, word: 'be-bop!' },
    chip: { name: 'Pixel Slime', emoji: '👾', idle: 2, word: '+1 UP' },
    afro: { name: 'Rainbow Chameleon', emoji: '🦎', idle: 3, word: 'colours!' },
    cine: { name: 'Paper Dragon', emoji: '🐉', idle: 8, word: 'EPIC 🔥' },
    techno: { name: 'Acid Alien', emoji: '👽', idle: 2, word: 'beam me ↑' },
    garage: { name: '2-Step Pigeon', emoji: '🐦', idle: 2, word: 'REWIND!' },
    prog: { name: 'Clockwork Octopus', emoji: '🐙', idle: 7, word: '7/8 ⚙' }
  };

  // ---------- helpers ----------
  P._cOut = function (pan, verb, dly, lvl, life) {
    const out = this.gain(lvl == null ? 1 : lvl), pn = this.pan(pan), v = this.gain(verb); out.connect(pn); pn.connect(this.busLead); pn.connect(v); v.connect(this.verbIn);
    let d = null; if (dly) { d = this.gain(dly); pn.connect(d); d.connect(this.dlyIn); }
    if (!this.offline) setTimeout(() => { try { out.disconnect(); pn.disconnect(); v.disconnect(); if (d) d.disconnect(); } catch (e) {} }, ((life || 4) + 1.5) * 1000);
    return out;
  };
  P._ctone = function (dest, type, f, t, dur, pk, o) {
    o = o || {}; const c = this.ctx, os = c.createOscillator(), g = this.gain(0);
    if (type === 'pulse') os.setPeriodicWave(this.pulseWave(o.duty || .5)); else os.type = type;
    os.frequency.setValueAtTime(f, t); if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + (o.tt || dur)); if (o.det) os.detune.value = o.det;
    const a = o.a || .004; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + a);
    if (o.hold) g.gain.setValueAtTime(pk, t + o.hold); g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    let node = os; if (o.lp) { const lp = this.biq(o.bp ? 'bandpass' : 'lowpass', o.lp, o.q || .7); if (o.lpTo) { lp.frequency.setValueAtTime(o.lp, t); lp.frequency.exponentialRampToValueAtTime(o.lpTo, t + (o.lpT || dur)); } os.connect(lp); node = lp; }
    node.connect(g); g.connect(dest);
    if (o.vib) { const v = c.createOscillator(), vg = this.gain(0); v.frequency.value = o.vib[0]; v.connect(vg); vg.connect(os.detune); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(o.vib[1], t + (o.vib[2] || .25)); v.start(t); v.stop(t + dur + .05); }
    os.start(t); os.stop(t + dur + .05); return os;
  };
  P._cnoise = function (dest, t, dur, pk, type, f, q, o) {
    o = o || {}; const c = this.ctx, s = c.createBufferSource(), fl = this.biq(type || 'bandpass', f || 2000, q || 1), g = this.gain(0); s.buffer = this.noiseBuf;
    if (o.to) { fl.frequency.setValueAtTime(f, t); fl.frequency.exponentialRampToValueAtTime(o.to, t + dur); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + (o.a || .002)); g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, R() * 1.5); s.stop(t + dur + .05);
  };
  // next grid time (div steps) so payoffs land in the groove
  P._cq = function (div) {
    const sd = this.stepDur(), now = this.ctx.currentTime + .03, nt = this.nextTime || now;
    if (!this.running) return now;
    let k = Math.floor((nt - now) / sd), tq = nt - k * sd; let idx = (this.gStep || 0) - k;
    div = div || 1; while (((idx % div) + div) % div !== 0) { tq += sd; idx++; }
    return Math.max(now, tq);
  };
  P._cvo = function () { return (this.voicing || [60, 64, 67]).slice().sort((a, b) => a - b); };
  P._croot = function (lo) { const r = this.chord ? this.chord.root : 60; return lo + (((r - lo) % 12) + 12) % 12; };
  P._csc = function (i, base) { // scale degree i above a tonic near `base`
    const g = this.g, sc = this.scale || [0, 2, 4, 7, 9], n = sc.length, pc = ((g.root + (this.keyOff || 0)) % 12 + 12) % 12, tonic = base + ((pc - base % 12 + 18) % 12) - 6;
    const d = Math.floor(i); return tonic + sc[((d % n) + n) % n] + 12 * Math.floor(d / n);
  };
  P._cct = function (m) { const v = this._cvo(); let best = v[0]; v.forEach(x => { for (let o = -24; o <= 24; o += 12) if (Math.abs(x + o - m) < Math.abs(best - m)) best = x + o; }); return best; };

  // reed (sax) voice: saw+square through formant peaks, breathy attack, delayed vibrato
  P._reed = function (dest, m, t, dur, vel, vib) {
    const c = this.ctx, f = mtof(m), g = this.gain(0), lp = this.biq('lowpass', 1200, 1.2), f1 = this.biq('peaking', 1050, 3), f2 = this.biq('peaking', 2600, 4);
    f1.gain.value = 9; f2.gain.value = 5; lp.frequency.setValueAtTime(900, t); lp.frequency.linearRampToValueAtTime(3200 + vel * 2000, t + .035); lp.frequency.setTargetAtTime(1900 + vel * 900, t + .05, .12);
    const a = this.gain(.6), b = this.gain(.25), o1 = c.createOscillator(), o2 = c.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = f; o2.frequency.value = f; o2.detune.value = 4;
    if (vib) { const v = c.createOscillator(), vg = this.gain(0); v.frequency.value = 5.6; v.connect(vg); vg.connect(o1.detune); vg.connect(o2.detune); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(22, t + dur * .7); v.start(t); v.stop(t + dur + .1); }
    o1.frequency.setValueAtTime(f * .97, t); o1.frequency.exponentialRampToValueAtTime(f, t + .03);
    o1.connect(a); o2.connect(b); a.connect(lp); b.connect(lp); lp.connect(f1); f1.connect(f2); f2.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.2 * vel, t + .02); g.gain.setTargetAtTime(.15 * vel, t + .03, .08); g.gain.setTargetAtTime(0, t + dur, .05);
    this._cnoise(dest, t, .06, .05 * vel, 'bandpass', 2400, 1.2); // breath
    [o1, o2].forEach(o => { o.start(t); o.stop(t + dur + .4); });
  };

  // ---------- signature idle sounds (quiet, while visible) ----------
  P.cameoIdle = function (kind, u) {
    if (!this.chord) return; const t = this._cq(2), pan = (u - .5) * 1.4, vo = this._cvo(), ct = vo[Math.floor(R() * vo.length)];
    const o = this._cOut(pan, .6, .25, 1, 3);
    switch (kind) {
      case 'lofi': this.leadNote('epiano', ct + 12, t, .7, .22, 'arp'); break;
      case 'house': this._ctone(o, 'triangle', mtof(ct + 24), t, .12, .05, { lp: 6000 }); this._ctone(o, 'sine', mtof(ct + 31), t + .003, .1, .03); break;
      case 'dnb': for (let k = 0; k < 3; k++) this._ctone(o, 'pulse', mtof(ct + 24 + [0, 7, 12][k]), t + k * .045, .04, .035, { duty: .25 }); break;
      case 'wave': this.leadNote('saw', ct, t, .5, .2, 'arp'); break;
      case 'ambient': this.leadNote('bell', Math.min(96, ct + 24), t, 1.6, .16, 'arp'); break;
      case 'dub': this._ctone(o, 'sine', 380 + R() * 200, t, .12, .05, { to: 1400 + R() * 600, tt: .1 }); break;
      case 'trap': for (let k = 0; k < 3; k++) this.hit('hat', t + k * this.stepDur() * 2 / 3, .25, { pan, raw: 1 }); break;
      case 'jazz': this.leadNote('pluck', ct - 12, t, .4, .25, 'arp'); this.hit('brush', t, .3, { pan }); break;
      case 'chip': this.leadNote('chip', Math.min(96, ct + 24), t, .07, .18, 'arp'); break;
      case 'afro': this.leadNote('kalimba', ct + 12, t, .5, .22, 'arp'); break;
      case 'cine': this.chordNote('strings', [this._croot(36), this._croot(36) + 7], t, 3, .28, 'pad'); break;
      case 'techno': this._ctone(o, 'sine', mtof(ct + 24), t, .25, .035, { vib: [9, 40, .05], to: mtof(ct + 26), tt: .2 }); break;
      case 'garage': this.hit('rim', t, .35, { pan, raw: 1 }); break;
      case 'prog': for (let k = 0; k < 7; k++) this._ctone(o, 'triangle', k === 0 ? 1900 : 1400, t + k * this.stepDur() * 2, .03, k === 0 ? .06 : .03); break;
    }
  };

  // ---------- tap payoffs ----------
  P.cameoTap = function (kind, u, v) {
    if (!this.chord) return null;
    const c = this.ctx, sd = this.stepDur(), bt = 60 / this.bpmNow(), t = this._cq(2), pan = (u - .5) * 1.2, vo = this._cvo(), root = this._croot(48);
    const o = this._cOut(pan, .9, .35, 1, 8);
    switch (kind) {
      case 'lofi': { // lazy rolled Rhodes 9th + falling kalimba + vinyl pops
        const top = vo[vo.length - 1]; this.chordNote('rhodes', vo.concat([this._cct(top + 2) === top ? top + 2 : this._cct(top + 3)]).map(x => x), t, 2.6, 1, 'chord', { strum: .055 });
        [0, 1, 2, 3].forEach(k => this.leadNote('kalimba', this._csc(7 - k * 2, 72), t + bt * (1 + k * .5), .6, .55, 'arp'));
        for (let k = 0; k < 7; k++) this._cnoise(o, t + R() * 2, .006, .25, 'highpass', 3000, .7);
        break; }
      case 'house': { // offbeat piano stabs climbing a filter + claps + sparkle sweep
        for (let k = 0; k < 4; k++) { const tt = t + bt * (k + .5); this.chordNote('stab', vo.map(x => x + 12), tt, sd * 1.6, .9 + k * .08, 'chord'); this.hit('clap', t + bt * k + (k % 2 ? 0 : bt), .55, { verb: .3, pan }); }
        this._cnoise(o, t, bt * 4, .12, 'bandpass', 600, 2, { to: 12000, a: bt * 3.6 });
        break; }
      case 'dnb': { // amen-ish snare roll, robot bleeps, reese growl
        for (let k = 0; k < 8; k++) { const tt = t + k * sd * (k < 6 ? 1 : .5); this.hit(k % 3 === 2 ? 'hat' : 'snare', tt, .45 + k * .06, { room: .2, rate: 1 + k * .03 }); }
        for (let k = 0; k < 6; k++) this._ctone(o, 'pulse', mtof(this._csc([0, 4, 2, 7, 5, 9][k], 84)), t + k * sd * .5, .05, .05, { duty: .125 });
        this.bassNote('reese', this._croot(28), t + sd * 7, bt * 1.4, 1); this.bassNote('reese', this._croot(28) + (R() < .5 ? 7 : -2), t + sd * 7 + bt * 1.5, bt, .9);
        break; }
      case 'wave': { // gated tom fill -> supersaw swell + lasers
        ['tomH', 'tomH', 'tomM', 'tomM', 'tomL', 'tomL'].forEach((nm, k) => this.hit(nm, t + k * sd, .85, { verb: .6, room: .4 }));
        this.chordNote('supersaw', vo.map(x => x + 12), t + sd * 6, bt * 4, .9, 'pad');
        for (let k = 0; k < 3; k++) this._ctone(o, 'sawtooth', 2600, t + sd * 6 + k * bt, .35, .06, { to: 180, tt: .3, lp: 5000 });
        break; }
      case 'ambient': { // glass cluster bloom + bell cascade
        this.chordNote('glass', vo.map(x => x + 12), t, 4.5, .9, 'pad'); this.chordNote('bellpad', vo, t + .02, 4, .5, 'pad');
        for (let k = 0; k < 7; k++) this.leadNote('bell', Math.min(98, this._csc(12 - k, 72)), t + k * sd * 1.5, 1.4, .5 - k * .04, 'arp');
        break; }
      case 'dub': { // dub siren + skanks thrown into a long echo
        const fb = this.dFb1.gain.value, tc = c.currentTime; [this.dFb1, this.dFb2].forEach(p => { p.gain.cancelScheduledValues(tc); p.gain.setTargetAtTime(.78, tc, .05); p.gain.setTargetAtTime(Math.min(.6, fb), t + bt * 3, .6); });
        const sOut = this._cOut(pan, .7, 1.1, 1, 9), so = c.createOscillator(), lf = c.createOscillator(), lg = this.gain(0), sg = this.gain(0), lp = this.biq('lowpass', 2400, 2);
        so.type = 'square'; so.frequency.setValueAtTime(mtof(root + 12), t); so.frequency.exponentialRampToValueAtTime(mtof(root - 5), t + bt * 2.5); lf.frequency.setValueAtTime(7, t); lf.frequency.linearRampToValueAtTime(2, t + bt * 2.5);
        lf.connect(lg); lg.gain.value = 300; lg.connect(so.detune); so.connect(lp); lp.connect(sg); sg.connect(sOut); sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(.07, t + .05); sg.gain.setValueAtTime(.07, t + bt * 2.2); sg.gain.linearRampToValueAtTime(0, t + bt * 2.6);
        so.start(t); lf.start(t); so.stop(t + bt * 2.7); lf.stop(t + bt * 2.7);
        [.5, 1.5].forEach(b => this.chordNote('organ', vo, t + bt * b, sd * .9, .8, 'chord'));
        break; }
      case 'trap': { // accelerating hat roll + 808 slide
        let tt = t, k = 0; const end = t + bt * 2; while (tt < end && k < 24) { this.hit('hat', tt, .35 + .4 * (tt - t) / (end - t), { pan: pan + (R() - .5) * .3, raw: 1 }); tt += k < 6 ? sd * 2 / 3 : k < 14 ? sd / 2 : sd / 3; k++; }
        const r0 = this._croot(28); this.bassNote('808', r0 + 12, t, bt * .9, 1); this.bassNote('808', r0, t + bt, bt * 1.6, 1, { slide: mtof(r0 + 12) }); this.hit('clap', t + bt, .6, { verb: .2 });
        break; }
      case 'jazz': { // bebop sax lick: chromatic approach, scale run, chord-tone landing with vibrato
        const sw = sd * .66, eighth = sd * 2, line = [], st = this._cct(66);
        line.push(st - 1, st); for (let k = 1; k <= 5; k++) line.push(this._csc(Math.round((st - 60) / 2) + k, 60)); line.push(this._cct(line[line.length - 1] + 2));
        line.forEach((m, k) => { const tt = t + k * eighth + (k % 2 ? sw * .35 : 0), last = k === line.length - 1; this._reed(o, clamp(m, 55, 84), tt, last ? bt * 1.6 : eighth * .85, last ? .9 : .7 + (k % 2 ? 0 : .2), last); });
        break; }
      case 'chip': { // power-up arpeggio + coin
        const pool = vo.concat(vo.map(x => x + 12), vo.map(x => x + 24)).sort((a, b) => a - b); const dt = sd / 2;
        pool.forEach((m, k) => this._ctone(o, 'pulse', mtof(Math.min(100, m + 12)), t + k * dt, dt * .9, .05, { duty: k % 2 ? .25 : .125, hold: dt * .6 }));
        const tc = t + pool.length * dt + sd, hi = this._csc(4, 84); this._ctone(o, 'pulse', mtof(hi), tc, .08, .06, { duty: .5, hold: .07 }); this._ctone(o, 'pulse', mtof(hi + 5), tc + .08, .5, .06, { duty: .5, hold: .2 });
        break; }
      case 'afro': { // kalimba 3-against-2 + shaker + congas
        const trip = bt / 3; for (let k = 0; k < 9; k++) this.leadNote('kalimba', this._csc([0, 2, 4, 2, 5, 4, 7, 5, 9][k], 72), t + k * trip, .5, .5 + (k % 3 === 0 ? .2 : 0), 'arp');
        for (let k = 0; k < 6; k++) { this.hit('shaker', t + k * bt / 2, .6, { pan: -.3 }); this.hit(k % 2 ? 'congaL' : 'congaH', t + k * bt / 2 + sd, .7, { pan: .3 }); }
        this.chordNote('pluckchord', vo, t + bt * 3, bt, .7, 'chord', { strum: .015 });
        break; }
      case 'cine': { // brass braam + timpani + rising strings
        const r0 = this._croot(36); this.chordNote('brass', [r0, r0 + 7, r0 + 12, vo[1]], t, bt * 3, 1, 'chord'); this.hit('impact', t, .8, { verb: .5 });
        for (let k = 0; k < 3; k++) { const tt = t + bt * (2 + k * .5); this._ctone(o, 'sine', mtof(r0 - 12 + (k === 2 ? 7 : 0)) * 1.25, tt, .9, .2, { to: mtof(r0 - 12 + (k === 2 ? 7 : 0)), tt: .08 }); this._cnoise(o, tt, .1, .1, 'lowpass', 400, .7); }
        this.chordNote('strings', vo.map(x => x + 12), t + bt, bt * 4, .9, 'pad');
        break; }
      case 'techno': { // acid squelch run + tractor-beam riser
        const r0 = this._croot(36); for (let k = 0; k < 8; k++) this.bassNote('acid', r0 + [0, 12, 0, 7, 12, 3, 0, 15][k] - 12, t + k * sd, sd * .9, 1, { accent: k % 3 === 0 });
        this.riser(t, bt * 2, .5); this._ctone(o, 'sine', 220, t, bt * 2.2, .05, { to: 1760, tt: bt * 2, vib: [14, 60, .1] });
        break; }
      case 'garage': { // tape rewind spinback -> 2-step organ chops
        const tc = c.currentTime + .01, rw = Math.min(.9, bt * 1.5), rs = c.createOscillator(), rg = this.gain(0), rlp = this.biq('bandpass', 1500, 1.5), wob = c.createOscillator(), wg = this.gain(900);
        rs.type = 'sawtooth'; rs.frequency.setValueAtTime(mtof(root + 12), tc); rs.frequency.exponentialRampToValueAtTime(mtof(root + 36), tc + rw); wob.frequency.setValueAtTime(22, tc); wob.frequency.exponentialRampToValueAtTime(3, tc + rw); wob.connect(wg); wg.connect(rs.detune);
        rs.connect(rlp); rlp.connect(rg); rg.connect(o); rg.gain.setValueAtTime(0, tc); rg.gain.linearRampToValueAtTime(.05, tc + .05); rg.gain.linearRampToValueAtTime(0, tc + rw); rs.start(tc); wob.start(tc); rs.stop(tc + rw + .05); wob.stop(tc + rw + .05);
        this._cnoise(o, tc, rw, .15, 'bandpass', 800, 1.2, { to: 9000 });
        let t3 = t; while (t3 < tc + rw - .01) t3 += sd * 2; [0, 3, 6, 10, 12].forEach((s, k) => this.chordNote('organ', vo.map(x => x + 12), t3 + s * sd, sd * 1.2, .85, 'chord'));
        this.hit('kick', t3, .8); this.hit('snare', t3 + sd * 4, .7, { room: .3 }); this.hit('kick', t3 + sd * 10, .7); this.hit('snare', t3 + sd * 12, .7, { room: .3 });
        break; }
      case 'prog': { // 7-note bell arpeggio in 2+2+3 with clock ticks, landing on a low bell
        const grp = [0, 0, 1, 1, 2, 2, 2]; for (let k = 0; k < 7; k++) { const tt = t + k * sd; const acc = k === 0 || k === 2 || k === 4; this.leadNote('bell', Math.min(98, this._csc([0, 4, 2, 6, 4, 7, 9][k], 72)), tt, 1, acc ? .7 : .45, 'arp'); this._ctone(o, 'triangle', acc ? 1900 : 1300, tt, .03, acc ? .08 : .04); }
        this.leadNote('bell', this._croot(48), t + sd * 8, 2.5, .7, 'arp'); this._ctone(o, 'triangle', 900, t + sd * 8, .05, .1);
        break; }
    }
    this.emit('arp', t, vo[0]); this.emit('cameo', t, kind);
    return t;
  };
})(window);
