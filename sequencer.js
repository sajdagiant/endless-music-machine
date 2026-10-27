/* Endless Music Machine — sequencer: arrangement (build-ups, drops, breakdowns), harmony (voice-led progressions, key changes),
   developing melodic motifs, bass/drum/comp patterns across different grids and meters. */
(function (G) {
  'use strict';
  const MM = G.MM, T = MM.theory, Engine = MM.Engine, P = Engine.prototype;
  const { pick, chance, rnd, fit } = T;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---------- arrangement tables ----------
  // layers: kick snare hat perc bass comp pad lead arp tex (0..1; <1 = enters later in the section)
  const ARCS = {
    club: {
      intro: { len: [8], hat: .6, perc: .3, comp: .5, pad: 1, arp: .6, tex: 1, filt: .3, next: ['groove'] },
      groove: { len: [16, 16, 8], kick: 1, snare: 1, hat: 1, perc: .6, bass: 1, comp: 1, pad: .5, lead: .35, arp: .4, tex: 1, filt: .65, next: ['build', 'groove2', 'break'] },
      groove2: { len: [16, 8], kick: 1, snare: 1, hat: 1, perc: 1, bass: 1, comp: 1, pad: .5, lead: .7, arp: .8, tex: 1, filt: .8, next: ['build', 'break', 'build'] },
      build: { len: [8, 8, 4], kick: 1, snare: 1, hat: 1, perc: .3, bass: .5, comp: .8, pad: 1, arp: 1, tex: 1, filt: 'ramp', riser: 1, roll: 1, gap: 1, next: ['drop'] },
      drop: { len: [16, 16, 8], kick: 1, snare: 1, hat: 1, perc: 1, bass: 1, comp: 1, pad: .7, lead: 1, arp: .6, tex: 1, filt: 1, hit: 1, key: 1, next: ['break', 'groove2', 'outro', 'drop'] },
      break: { len: [8, 8, 4], perc: .2, bass: .4, comp: .8, pad: 1, lead: .9, arp: .8, tex: 1, filt: .55, half: 1, next: ['build', 'groove2', 'build'] },
      outro: { len: [8, 4], rev: 1, kick: .5, hat: .5, bass: .4, comp: .5, pad: 1, arp: .3, tex: 1, filt: .45, next: ['intro', 'groove'] }
    },
    chill: {
      intro: { len: [4, 8], hat: .5, comp: .5, pad: 1, tex: 1, filt: .45, next: ['groove'] },
      groove: { len: [16, 8], kick: 1, snare: 1, hat: 1, perc: .6, bass: 1, comp: 1, pad: .6, lead: .45, arp: .3, tex: 1, filt: .7, next: ['groove2', 'break', 'lift'] },
      groove2: { len: [16, 16, 8], kick: 1, snare: 1, hat: 1, perc: 1, bass: 1, comp: 1, pad: .6, lead: .7, arp: .7, tex: 1, filt: .85, key: 1, next: ['lift', 'break', 'groove'] },
      lift: { len: [4, 4, 8], kick: 1, snare: 1, hat: 1, perc: .6, bass: 1, comp: 1, pad: 1, arp: 1, tex: 1, filt: 'ramp', riser: .5, hit: .5, next: ['groove2', 'groove2', 'groove'] },
      break: { len: [8, 4], bass: .4, comp: 1, pad: 1, lead: .9, arp: .5, perc: .3, hat: .3, tex: 1, filt: .55, half: 1, next: ['groove2', 'groove'] },
      outro: { len: [4, 8], rev: 1, kick: .5, hat: .5, bass: .4, comp: .5, pad: 1, tex: 1, filt: .45, next: ['intro', 'groove'] }
    },
    ambi: {
      drift: { len: [8], pad: 1, comp: .5, arp: .3, bass: .4, tex: 1, filt: .5, next: ['bloom'] },
      bloom: { len: [16, 8], pad: 1, comp: 1, arp: .7, lead: .6, bass: 1, tex: 1, filt: .75, next: ['swell', 'hush', 'bloom2'] },
      bloom2: { len: [16], pad: 1, comp: 1, arp: 1, lead: .8, bass: 1, tex: 1, filt: .85, key: 1, next: ['swell', 'hush'] },
      swell: { len: [8, 4], pad: 1, comp: .8, arp: 1, bass: .5, tex: 1, filt: 'ramp', riser: .6, next: ['peak'] },
      peak: { len: [16, 8], pad: 1, comp: 1, arp: 1, lead: 1, bass: 1, tex: 1, filt: 1, hit: .6, key: 1, next: ['hush', 'bloom'] },
      hush: { len: [8, 4], pad: 1, lead: .5, comp: .5, tex: 1, filt: .35, next: ['bloom', 'drift'] }
    }
  };
  const FIRST = { club: 'intro', chill: 'intro', ambi: 'drift' };

  // ---------- pattern helpers ----------
  const parse = (s, n) => fit(s || '', n).split('');
  const vel = ch => ch === 'X' ? 1.15 : ch === 'x' ? .85 : ch === 'o' ? .45 : 0;
  function hits(str, n) { // note list: {i, len, ch}
    const a = parse(str, n), out = [];
    for (let i = 0; i < n; i++) { const c = a[i]; if (c !== '.' && c !== '-') { let l = 1; while (i + l < n && a[i + l] === '-') l++; out[i] = { len: l, ch: c }; } }
    return out;
  }

  P.bpmNow = function () { return this.g.bpm * (.975 + this.mood * .05); };
  P.stepDur = function () { return 60 / this.bpmNow() / (this.g.grid === 12 && this.g.steps === 12 ? 3 : 4); };
  P.barDur = function () { return this.stepDur() * this.g.steps; };
  P.emit = function (type, t, data) { if (this.onEvent) this.onEvent(type, t, data); };

  // ---------- genre ----------
  P.setGenre = function (g, immediate) {
    if (!immediate && this.running) {
      this.pendingGenre = g; this.pendingKit = null;
      MM.buildKitAsync(this.ctx, g.kit || 'cine', g.seed).then(k => { if (this.pendingGenre === g) this.pendingKit = k; });
      return;
    }
    this._applyGenre(g);
  };
  P._applyGenre = function (g) {
    const c = this.ctx, t = this.running ? Math.max(this.nextTime, c.currentTime) : c.currentTime;
    this.g = g; this.r = MM.mulberry32(g.engSeed ^ 0x51ed270b);
    const r = this.r;
    this.kit = this._preKit || MM.buildKit(c, g.kit || 'cine', g.seed); this._preKit = null;
    this.setReverb(g.verb.sec, g.verb.dark, g.verb.lvl * 1.6, g.seed, t);
    // delay + sends
    this.dFb1.gain.setTargetAtTime(g.delay.fb, t, .1); this.dFb2.gain.setTargetAtTime(g.delay.fb, t, .1);
    this.dlyOut.gain.setTargetAtTime(.25 + g.delay.lvl * .9, t, .1);
    this.busLead.ds.gain.value = .35 + g.delay.lvl * 1.1; this.busArp.ds.gain.value = .35 + g.delay.lvl * 1.1; this.busChord.ds.gain.value = .08 + g.delay.lvl * .5; this.busPad.vs.gain.value = .4 + g.verb.lvl;
    this.busLead.vs.gain.value = .25 + g.verb.lvl * .8; this.busArp.vs.gain.value = .25 + g.verb.lvl; this.busChord.vs.gain.value = .15 + g.verb.lvl * .8;
    this.drumVerb.gain.value = 1;
    this.sat.curve = (function (k) { const n = 2048, a = new Float32Array(n), d = Math.tanh(k); for (let i = 0; i < n; i++) { const x = i * 2 / (n - 1) - 1; a[i] = Math.tanh(x * k) / d; } return a; })(1 + g.sat * 1.6);
    this.sideGain.gain.setTargetAtTime(g.width, t, .2);
    this.lowShelf.gain.value = g.kit === '808' || g.kit === 'cine' ? 3 : 1.5; this.highShelf.gain.value = g.vibe === 'warm' ? .5 : 2;
    this.setTexture(g.tex, t);
    this.texBus.gain.setTargetAtTime(0, t, .1);
    // harmony state
    this.keyOff = 0; this.prog = g.prog; this.scale = g.scale; this.mode = g.mode; this.voicing = null; this.chord = null; this.nextChord = null; this.cycleBar = 0;
    // melody state
    this.motifs = [T.genMotif(r, g, g.lead.style), T.genMotif(r, g, g.lead.style)];
    this.motifSel = 0; this.stmt = 0; this.plan = []; for (let i = 0; i < 8; i++) this.plan.push(i % 2 === 0 ? pick(r, ['rep', 'rep', 'seq', 'orn']) : pick(r, ['ans', 'ans', 'inv', 'frag', 'ret']));
    this.curMotif = this.motifs[0]; this.leadMap = {};
    this.arpMode = pick(r, ['up', 'updown', 'skip', 'down']); this.arpI = 0;
    this.lastBassF = 0; this.lastOH = null;
    this.bar = 0; this.stepInBar = 0; this.secBar = 0; this.sectionCount = 0; this.fillNow = false;
    this.dset = g.drums ? this._prepDrums() : null;
    if (this.running) { this.impactAt = t; }
    this._newSection(FIRST[g.arc] || 'intro', t);
    this.emit('genre', t, g);
  };
  P._prepDrums = function () {
    const g = this.g, n = g.steps, r = this.r, d = g.drums;
    const S = pick(r, d.sets), o = { sn: S.sn || 'snare', ghost: S.ghost || [] };
    ['k', 's', 'h', 'oh', 'rim', 'ride', 'foot', 'bell'].forEach(k => o[k] = S[k] != null ? parse(S[k], n) : null);
    o.perc = (S.perc || []).map(p => ({ n: p.n, arr: parse(p.p, n), v: p.v }));
    if (S.alt) o.alt = { k: parse(S.alt.k, n), s: parse(S.alt.s, n) };
    o.kv = S.kv || 1; o.comp = S.comp || [];
    return o;
  };

  // ---------- sections ----------
  P._newSection = function (name, t) {
    const g = this.g, r = this.r, A = ARCS[g.arc], S = A[name] || A[FIRST[g.arc]];
    this.section = name; this.S = S; this.secBar = 0; this.cycleBar = 0; this.sectionCount++;
    let len = pick(r, S.len); if (this.barDur() > 2.3 && len >= 16) len = len / 2; if (this.lenScale) len = Math.max(2, Math.round(len * this.lenScale / 2) * 2);
    this.secLen = len;
    this.nextSec = Array.isArray(S.next) ? pick(r, S.next) : S.next;
    // layer entry / exit bars
    this.lv = {}; this.enter = {}; this.leave = {};
    ['kick', 'snare', 'hat', 'perc', 'bass', 'comp', 'pad', 'lead', 'arp', 'tex'].forEach(l => {
      let v = S[l] || 0;
      if (v > 0 && v < 1 && (l === 'perc' || l === 'lead' || l === 'arp')) v = Math.min(1, v * (.65 + this.mood * .75));
      this.lv[l] = v; this.enter[l] = 0; this.leave[l] = 1e9;
      if (v > 0 && v < 1) { if (S.rev) this.leave[l] = 2 * Math.round(v * len / 2); else this.enter[l] = 2 * Math.round((1 - v) * len * .25); }
    });
    if (S.kick === 1 && S.roll && chance(r, .4)) this.leave.kick = len - 1;
    // key / progression change
    if (this.sectionCount > 2 && S.key && chance(r, .6)) this._modulate(t);
    else if (this.sectionCount > 1 && chance(r, .25) && g.progs.length > 1) this._newProg(t);
    // patterns for this section
    if (this.dset && this.sectionCount > 1 && (name === 'drop' || name === 'groove2') && chance(r, .3)) this.dset = this._prepDrums();
    const bp = g.bass.pats; this.bassPat = hits(bp ? pick(r, bp) : T.bassFromKick(r, g, g.drums && g.drums.sets[0].k), g.steps);
    this.bassPat2 = hits(bp ? pick(r, bp) : T.bassFromKick(r, g, g.drums && g.drums.sets[0].k), g.steps);
    const cp = g.comp.pats; this.compPat = hits(cp ? pick(r, cp) : T.genPat(r, g, .5, 2), g.steps);
    this.arpP = rnd(r, .55, .95); this.arpMode = pick(r, ['up', 'updown', 'skip', 'down', 'up']);
    const ar = g.arp.rate; this.arpStride = g.grid === 12 && g.steps === 12 ? (ar >= 2 ? 3 : 2) : (ar >= 4 ? 8 : ar >= 2 ? 4 : ar <= .5 ? 1 : 2);
    if (name === 'drop' || name === 'peak') this.motifSel = 1 - this.motifSel; else if (name === 'groove') this.motifSel = 0;
    this.texBus.gain.setTargetAtTime(S.tex && !(this.muted && this.muted.tex) ? (g.tex === 'crackle' ? 1.4 : .8) : 0, t, 1);
    this.emit('section', t, name);
  };
  P._modulate = function (t) {
    const r = this.r;
    if (this.keyOff !== 0 && chance(r, .3)) this.keyOff = 0;
    else this.keyOff = (this.keyOff + pick(r, [2, 2, 1, 3, 5, 7, -2, -3, 4])+ 12) % 12;
    if (chance(r, .4)) this._newProg(t); else this._announceKey(t);
  };
  const MINOR = { Aeolian: 1, Dorian: 1, Phrygian: 1, 'Harmonic Minor': 1 };
  P._newProg = function (t) { // switch progression; moving between minor and major goes to the relative key
    const np = pick(this.r, this.g.progs), wasMin = !!MINOR[this.mode], isMin = !!MINOR[np.m];
    if (wasMin && !isMin) this.keyOff = (this.keyOff + 3) % 12; else if (!wasMin && isMin) this.keyOff = (this.keyOff + 9) % 12;
    this.prog = np; this.scale = MM.theory.MODES[np.m]; this.mode = np.m; this._announceKey(t);
  };
  P._announceKey = function (t) { this.emit('key', t, { key: T.KEYS[(this.g.root + this.keyOff) % 12], mode: this.mode }); };
  P.layerOn = function (l) { if (this.muted && this.muted[l]) return false; return this.lv[l] > 0 && this.secBar >= this.enter[l] && this.secBar < this.leave[l]; };

  // ---------- harmony ----------
  P._chordAt = function (cb) {
    const p = this.prog, per = p.b, total = p.c.length * per, k = Math.floor((cb % total) / per), ch = p.c[k];
    return T.chordInfo(this.g.root + this.keyOff + ch[0], ch[1]);
  };

  // ---------- scheduler ----------
  P.start = function (t0) { this.running = true; this.nextTime = t0 == null ? this.ctx.currentTime + .08 : t0; this.t00 = this.nextTime; };
  P.scheduleUntil = function (until) {
    while (this.nextTime < until) {
      const i = this.stepInBar;
      if (i === 0) this._barStart(this.nextTime);
      const g = this.g, sd = this.stepDur();
      let t = this.nextTime;
      if (g.grid === 16 && g.swing > 0 && i % 2 === 1) t += g.swing * sd;
      this._step(i, t, sd);
      this.nextTime += sd; this.stepInBar++;
      if (this.stepInBar >= g.steps) { this.stepInBar = 0; this.bar++; this.secBar++; this.cycleBar++; }
    }
  };

  P._barStart = function (t) {
    if (this.pendingGenre && this.pendingKit) { // switch genre on the bar line with an impact + falling swoosh
      const ng = this.pendingGenre; this.pendingGenre = null; this._preKit = this.pendingKit; this.pendingKit = null;
      this._applyGenre(ng); t = this.nextTime;
      this.hit('impact', t, .8, { verb: .3 }); this.swoosh(t, 1.4, true); this.hit('crash', t, .5, { verb: .3 });
    }
    if (this.secBar >= this.secLen) this._newSection(this.nextSec, t);
    const g = this.g, S = this.S, bd = this.barDur(), bt = 60 / this.bpmNow();
    // chord change?
    const per = this.prog.b, total = this.prog.c.length * per, cb = this.cycleBar % total;
    this.chordStart = cb % per === 0; this.chordBarsLeft = per - (cb % per);
    if (this.chordStart || !this.chord) {
      this.chord = this._chordAt(this.cycleBar);
      this.voicing = T.voiceChord(this.chord, this.voicing, 50, 74, 5);
      this.chordLen = per * bd;
    }
    this.nextChord = this._chordAt(this.cycleBar + 1);
    // macro filter
    let v = S.filt === 'ramp' ? .3 + .7 * this.secBar / Math.max(1, this.secLen - 1) : S.filt == null ? .8 : S.filt;
    if (S.rev) v = Math.max(.25, v * (1 - .45 * this.secBar / this.secLen));
    const f = 400 * Math.pow(45, clamp(v * (.6 + .55 * this.mood) + (this.mood - .5) * .1, 0, 1));
    this.musicLP.frequency.setTargetAtTime(f, t, bd * .3); this.fxLP.frequency.setTargetAtTime(Math.min(18000, f * 1.6), t, bd * .3);
    this.dL.delayTime.setTargetAtTime(Math.min(2.2, bt * g.delay.div), t, .04); this.dR.delayTime.setTargetAtTime(Math.min(2.2, bt * g.delay.div), t, .04);
    // phrase-level: new lead statement every 2 bars
    if (this.secBar % 2 === 0) this._newStatement();
    // fill?
    this.fillNow = !!this.dset && this.layerOn('snare') && (this.secBar % 4 === 3 || this.secBar === this.secLen - 1) && !S.roll && chance(this.r, .55);
    this.fillKind = pick(this.r, ['snare', 'tom', 'snare']);
    // walking bass for this bar
    if (g.bass.walk) {
      const gp = g.groups; let s = ''; gp.forEach((gl, b) => { const ch = b === 0 ? 'r' : b === gp.length - 1 ? 'n' : pick(this.r, ['3', '5', '5', 's', 'o', '3']); s += ch + '-'.repeat(gl - 1); });
      this.bassPat = hits(s, g.steps); this.bassPat2 = this.bassPat;
    }
    this.barT = t;
    // section boundary FX
    const last = this.secBar === this.secLen - 1;
    const nxt = ARCS[g.arc][this.nextSec];
    if (S.riser && this.secBar === this.secLen - (this.secLen >= 8 ? 4 : 2)) {
      const nb = this.secLen >= 8 ? 4 : 2; this.riser(t, nb * bd - (S.gap ? 0 : .02), S.riser);
    }
    if (last && this.secLen >= 2 && nxt && (nxt.hit || S.gap)) {
      const rl = this.kit.rev.duration, st = t + bd - rl;
      this.hit('rev', Math.max(t, st), .55, { offset: Math.max(0, t - st), verb: .4 });
    }
    if (this.secBar === 0 && this.sectionCount > 1) {
      if (S.hit) { this.hit('impact', t, .6 * S.hit, { verb: .3 }); this.hit('crash', t, .55 * S.hit, { verb: .35 }); }
      else if (this.section === 'groove' || this.section === 'groove2' || this.section === 'bloom') this.hit('crash', t, .35, { verb: .3 });
    }
    this.emit('bar', t, { bar: this.bar, secBar: this.secBar, section: this.section });
    // pad: once per chord
    if (this.chordStart && g.pad.kind && this.layerOn('pad')) {
      const len = Math.min(this.chordLen + .3, 16);
      this.chordNote(g.pad.kind, this.voicing, t, len, .9 * (.7 + .3 * this.mood), 'pad');
    }
    // drone bass: once per chord
    if (g.bass.kind === 'drone' && this.chordStart && this.layerOn('bass')) {
      const rm = this._bassRoot(this.chord, 28); this.bassNote('drone', rm, t, this.chordLen, .9);
    }
  };

  P._newStatement = function () {
    const r = this.r, g = this.g;
    const base = this.motifs[this.motifSel];
    if (this.stmt % 6 === 5) T.mutateMotif(base, r, g);
    const kind = this.plan[this.stmt % this.plan.length];
    this.curMotif = kind === 'rep' ? base : T.develop(base, kind, r, g);
    if (this.section === 'break' || this.section === 'hush') { if (chance(r, .5)) this.curMotif = T.develop(this.curMotif, 'aug', r, g); }
    this.stmt++;
    const map = {}; this.curMotif.notes.forEach(n => { map[n.s] = n; }); this.leadMap = map;
  };

  P._bassRoot = function (ch, lo) { return lo + (((ch.root - lo) % 12) + 12) % 12; };
  P._bassMidi = function (c, ch, nxt, lo) {
    const rm = this._bassRoot(ch, lo);
    switch (c) {
      case 'r': case 'g': return rm; case 'o': return rm + 12; case '5': return rm + (ch.iv[2] === 6 ? 6 : 7); case '3': return rm + ch.iv[1]; case '4': return rm + 5; case 's': return rm + 2;
      case 'b': return rm + (ch.iv.find(x => x === 10 || x === 11) || 10);
      case 'n': { const pc = (nxt.root + (this.r() < .5 ? -1 : 1) + 12) % 12; let m = rm + (((pc - rm) % 12 + 12) % 12); if (m - rm > 6) m -= 12; return m; }
    }
    return rm;
  };

  // ---------- one step ----------
  P._step = function (i, t, sd) {
    const g = this.g, S = this.S, L = l => this.layerOn(l), mood = this.mood, r = Math.random;
    const steps = g.steps, last = this.secBar === this.secLen - 1;
    const lastGrp = g.groups[g.groups.length - 1];
    const gap = !!S.gap && last && i >= steps - lastGrp;
    const bt = 60 / this.bpmNow();
    // ---- drums ----
    const D = this.dset;
    if (D && !gap) {
      const half = S.half && D.alt;
      const kA = half ? D.alt.k : D.k, sA = half ? D.alt.s : D.s;
      const snareHit = (vv, o) => {
        o = o || {};
        const sv = o.v == null ? vv : o.v, vb = (g.kit === 'gated' ? .45 : .14) + g.verb.lvl * .35, tt = t + (o.dt || 0);
        if (D.sn === 'clap') this.hit('clap', tt, .8 * sv, { verb: vb });
        else if (D.sn === 'rim') this.hit('rim', tt, .9 * sv, { verb: vb * .7, dly: .12 });
        else { this.hit('snare', tt, sv, { verb: vb, rate: o.rate }); if (D.sn === 'both') this.hit('clap', tt, .55 * sv, { verb: vb }); }
        if (sv > .5) this.emit('snare', tt, sv);
      };
      // kick
      if (kA && L('kick') && this.secBar < this.leave.kick) {
        const kc = kA[i], kv = vel(kc);
        if (kv && (D.kv >= 1 || r() < .7)) { this.hit('kick', t, .95 * kv * D.kv, { rate: 1 + (r() - .5) * .02 }); this.duck(t, g.duck * Math.min(1, kv), Math.min(.3, bt * .6)); this.emit('kick', t, kv); }
      }
      // snare / clap
      const rolling = S.roll && L('snare');
      if (sA && L('snare') && !rolling) {
        const sc = sA[i], sv = vel(sc);
        if (sv && !(this.fillNow && i >= steps - lastGrp)) snareHit(sv * .95);
        else if (D.ghost.includes(i) && r() < .3 + mood * .2) snareHit(.2, { v: .22 });
      }
      if (rolling) {
        const left = this.secLen - 1 - this.secBar, prog = (this.secBar * steps + i) / (this.secLen * steps);
        const every = left >= 3 ? lastGrp : left === 2 ? Math.max(1, lastGrp / 2) : 1;
        if (i % every === 0 || left === 0) {
          const n = left === 0 ? 2 : 1;
          for (let k = 0; k < n; k++) snareHit(.35 + .65 * prog, { v: (.3 + .7 * prog) * (k ? .8 : 1), rate: 1 + prog * .4, dt: k * sd / n });
        }
      }
      // fills
      if (this.fillNow && i >= steps - lastGrp && L('kick')) {
        const k = i - (steps - lastGrp), pr = (k + 1) / lastGrp;
        if (this.fillKind === 'snare') { if (r() < .85) snareHit(.5 + .5 * pr, { v: .45 + .5 * pr }); }
        else { const nm = ['tomH', 'tomM', 'tomL', 'tomL'][Math.min(3, Math.floor(k * 4 / lastGrp))]; this.hit(nm, t, .8, { verb: .2 }); }
      }
      // hats
      if (D.h && L('hat')) {
        const hc = D.h[i];
        if (hc && hc !== '.') {
          const n = hc === 'r' ? 2 : hc === 't' ? 3 : hc === 'q' ? 4 : 1, hv = (hc === 'r' || hc === 't' || hc === 'q') ? .7 : vel(hc);
          if (!(hc === 'o' && r() < .12)) for (let k = 0; k < n; k++) { this.hit('hat', t + k * sd / n, hv * (.8 + r() * .3) * (n > 1 ? (.75 + .25 * k / n) : 1), { pan: (r() - .5) * .5, rate: 1 + (r() - .5) * .03 }); }
          if (this.lastOH && hc !== 'o') { this.lastOH.gain.setTargetAtTime(0, t, .004); this.lastOH = null; }
          if (r() < .5) this.emit('hat', t, hv);
        } else if (mood > .55 && r() < (mood - .5) * .22 && g.grid === 16) this.hit('hat', t, .22 + r() * .12, { pan: (r() - .5) * .5 });
      }
      if (D.oh && L('hat')) { const oc = D.oh[i]; if (oc && oc !== '.') { this.lastOH = this.hit('ohat', t, .55 * vel(oc) + .1, { pan: .15 }); } }
      if (D.rim && L('perc') && D.rim[i] !== '.' && r() < .9) this.hit('rim', t, .45 * vel(D.rim[i]) + .1, { pan: (r() - .5) * .6, verb: .12 });
      if (D.ride && L('hat')) { const rc = D.ride[i]; if (rc !== '.') this.hit('ride', t, (i % 3 === 0 ? .55 : .38) * (.8 + r() * .3), { pan: .3 }); }
      if (D.foot && L('hat') && D.foot[i] !== '.') this.hit('hat', t, .35, { rate: .8, pan: -.2 });
      if (D.bell && L('perc') && D.bell[i] !== '.') { const nm = (i % 2 === 0) ? 'agoH' : 'agoL'; this.hit(nm, t, .42 * (.8 + r() * .3), { pan: -.3, verb: .1 }); }
      if (D.comp && D.comp.length && L('snare') && D.comp.includes(i) && r() < .3 + mood * .25) this.hit('brush', t, .42 * (.6 + r() * .6), { pan: (r() - .5) * .4 });
      if (L('perc')) D.perc.forEach(p => { const pc = p.arr[i]; if (pc && pc !== '.' && r() < .92) this.hit(p.n, t, p.v * vel(pc) * (.8 + r() * .3), { pan: (r() - .5) * .7, verb: .12, dly: .06 }); });
    }
    // ---- bass ----
    if (!gap && g.bass.kind !== 'drone' && L('bass') && this.chord) {
      const bp = (this.secBar % 4 === 3 ? this.bassPat2 : this.bassPat)[i];
      if (bp) {
        const lo = g.bass.walk ? 36 : g.bass.kind === '808' ? 27 : 28;
        const m = this._bassMidi(bp.ch, this.chord, this.nextChord, lo), d = Math.max(.08, bp.len * sd * (g.bass.kind === '808' || g.bass.kind === 'sub' ? .98 : .92));
        const slide = bp.ch === 'g' && this.lastBassF ? this.lastBassF : 0;
        this.bassNote(g.bass.kind, m, t + r() * .003, d, .85 + r() * .15, { slide, accent: bp.ch === 'o' || (g.bass.kind === 'acid' && r() < .3) });
        this.lastBassF = this.mtof(m);
      }
    }
    // ---- chord comping ----
    if (!gap && g.comp.kind && L('comp') && this.chord) {
      const cp = this.compPat[i];
      if (cp) {
        const d = cp.len * sd * (g.comp.stacc ? .85 : .98);
        const v = g.comp.vel * vel(cp.ch) * (.85 + r() * .2) * (.6 + mood * .6);
        if (r() < .93) this.chordNote(g.comp.kind, this.voicing, t + r() * .006, d, v, 'chord', { short: d * .9, strum: g.comp.kind === 'pluckchord' ? .012 : (g.comp.kind === 'rhodes' || g.comp.kind === 'epiano') ? .008 : 0, stac: g.comp.stacc });
      }
    }
    // ---- arp ----
    if (!gap && g.arp.kind && L('arp') && this.chord && i % this.arpStride === 0 && r() < this.arpP) {
      const base = this.voicing.slice().sort((a, b) => a - b), pool = base.concat(base.map(x => x + 12)), n = pool.length, k = this.arpI++;
      let idx;
      switch (this.arpMode) { case 'down': idx = n - 1 - (k % n); break; case 'updown': { const p = k % (2 * n - 2); idx = p < n ? p : 2 * n - 2 - p; break; } case 'skip': idx = [0, 2, 1, 3, 2, 4, 3, 5][k % 8] % n; break; default: idx = k % n; }
      let m = pool[idx] + (['bell', 'kalimba', 'pluck', 'chip'].includes(g.arp.kind) ? 12 : 0);
      while (m > 90) m -= 12;
      this.leadNote(g.arp.kind, m, t, this.arpStride * sd * .8, (.42 + .25 * mood) * (i % (this.arpStride * 4) === 0 ? 1.15 : .85), 'arp');
      this.emit('arp', t, m);
    }
    // ---- lead (motif) ----
    if (!gap && g.lead.kind && L('lead') && this.chord) {
      const pos = (this.secBar % 2) * steps + i, n = this.leadMap[pos];
      if (n && (n.v > .9 || r() > (1 - mood) * .3)) {
        const m = this._melodyNote(n.d, i, n.l);
        const d = Math.max(.1, n.l * sd * (g.lead.kind === 'chip' || g.lead.kind === 'pluck' ? .9 : .97));
        this.leadNote(g.lead.kind, m, t + r() * .006, d, (.75 + .25 * n.v) * (.8 + r() * .25) * (.7 + mood * .5), 'lead');
        this.emit('lead', t, m);
      }
    }
  };

  // scale degree -> midi, adapted to the current chord (strong beats snap to chord tones, clashing notes nudge down)
  P._melodyNote = function (deg, i, len) {
    const g = this.g, sc = this.scale, n = sc.length, pc = (g.root + this.keyOff) % 12;
    const tonic = 60 + ((pc + 5) % 12) - 5;
    const idx = ((deg % n) + n) % n, oct = Math.floor(deg / n);
    const hi = { bell: 12, kalimba: 12, chip: 12, flute: 0 }[g.lead.kind] || 0;
    let m = tonic + sc[idx] + 12 * oct + hi + (g.lead.oct || 0);
    while (m > 90) m -= 12; while (m < 55) m += 12;
    const cts = this.chord.pcs;
    const strong = g.groups.reduce((acc, gl) => { acc.arr.push(acc.a); acc.a += gl; return acc; }, { a: 0, arr: [] }).arr.includes(i);
    const isCT = x => cts.includes(((x % 12) + 12) % 12);
    if (strong && (i === 0 || len >= 3) && !isCT(m)) { for (const d of [-1, 1, -2, 2]) if (isCT(m + d)) { m += d; break; } }
    else if (!isCT(m) && cts.some(c => ((m % 12) - c + 12) % 12 === 1)) m -= 1;
    return m;
  };

  // ---------- offline render / wav ----------
  function encodeWav(buf) {
    const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
    const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
    const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true);
    out.setUint16(22, ch, true); out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
    w(36, 'data'); out.setUint32(40, len * ch * 2, true);
    const d = []; for (let c = 0; c < ch; c++) d.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, d[c][i])); out.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o += 2; }
    return new Blob([out], { type: 'audio/wav' });
  }
  // opts: { section: start section name, lenScale: shrink section lengths }
  async function renderOffline(genre, seconds, mood, opts) {
    if (opts === true) opts = { section: 'groove' };
    opts = opts || {};
    const sr = 44100, ctx = new OfflineAudioContext(2, Math.floor(sr * seconds), sr);
    const eng = new Engine(ctx, { genre, mood, offline: true });
    eng.lenScale = opts.lenScale || 0;
    if (opts.mute) { eng.muted = {}; opts.mute.forEach(k => eng.muted[k] = 1); }
    eng.out.connect(ctx.destination);
    eng.start(0);
    if (opts.section) { const A = ARCS[genre.arc]; const sec = opts.section === 'best' ? (A.drop ? 'drop' : A.peak ? 'peak' : 'groove2') : opts.section; eng._newSection(sec, 0); eng.sectionCount = 3; }
    eng.scheduleUntil(seconds + .5);
    const buf = await ctx.startRendering();
    const fade = Math.floor(sr * 1.5);
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade; }
    return buf;
  }
  MM.renderOffline = renderOffline; MM.encodeWav = encodeWav;
})(window);
