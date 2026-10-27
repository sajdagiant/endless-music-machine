/* Endless Music Machine — audio engine. Pure Web Audio, no dependencies.
   Works on AudioContext (live) and OfflineAudioContext (render to WAV). */
(function (global) {
  'use strict';

  // ---------- seeded RNG ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const rnd = (r, a, b) => a + r() * (b - a);
  const chance = (r, p) => r() < p;

  // ---------- genre invention ----------
  const SCALES = {
    'Minor Pentatonic': [0, 3, 5, 7, 10],
    'Dorian': [0, 2, 3, 5, 7, 9, 10],
    'Phrygian': [0, 1, 3, 5, 7, 8, 10],
    'Lydian': [0, 2, 4, 6, 7, 9, 11],
    'Mixolydian': [0, 2, 4, 5, 7, 9, 10],
    'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
    'Hirajoshi': [0, 2, 3, 7, 8],
    'Major Pentatonic': [0, 2, 4, 7, 9],
    'Aeolian': [0, 2, 3, 5, 7, 8, 10],
    'Whole Tone': [0, 2, 4, 6, 8, 10]
  };
  const KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  // Archetypes = the "DNA" a genre mutates from.
  const FAMILIES = {
    Dub:    { bpm: [66, 78], swing: [0, .12], drums: 'dub', bass: 'sub', pad: 'organ', lead: 'bell', scales: ['Minor Pentatonic', 'Dorian', 'Aeolian'], dens: .5, verb: .6, delay: .75 },
    Funk:   { bpm: [96, 114], swing: [.08, .22], drums: 'funk', bass: 'funk', pad: 'organ', lead: 'pluck', scales: ['Dorian', 'Mixolydian', 'Minor Pentatonic'], dens: .8, verb: .2, delay: .35 },
    Garage: { bpm: [128, 136], swing: [.15, .3], drums: 'garage', bass: 'wobble', pad: 'glass', lead: 'pluck', scales: ['Aeolian', 'Dorian', 'Phrygian'], dens: .8, verb: .35, delay: .4 },
    Trance: { bpm: [134, 144], swing: [0, .02], drums: 'four', bass: 'drive', pad: 'super', lead: 'super', scales: ['Aeolian', 'Harmonic Minor', 'Phrygian'], dens: 1, verb: .5, delay: .5 },
    Drift:  { bpm: [60, 84], swing: [0, .05], drums: 'none', bass: 'sub', pad: 'glass', lead: 'bell', scales: ['Lydian', 'Whole Tone', 'Major Pentatonic', 'Hirajoshi'], dens: .3, verb: .95, delay: .8 },
    Bop:    { bpm: [140, 170], swing: [.2, .33], drums: 'breaks', bass: 'walk', pad: 'organ', lead: 'pluck', scales: ['Dorian', 'Mixolydian', 'Lydian'], dens: .9, verb: .25, delay: .3 },
    Disco:  { bpm: [114, 126], swing: [0, .08], drums: 'four', bass: 'octave', pad: 'super', lead: 'pluck', scales: ['Dorian', 'Mixolydian', 'Major Pentatonic'], dens: .9, verb: .3, delay: .4 },
    Chiptune: { bpm: [120, 160], swing: [0, .05], drums: 'four', bass: 'chip', pad: 'chip', lead: 'chip', scales: ['Major Pentatonic', 'Mixolydian', 'Hirajoshi', 'Harmonic Minor'], dens: 1, verb: .12, delay: .35 }
  };
  const FAMILY_NAMES = {
    Dub: ['Dub', 'Dubstep', 'Skank'], Funk: ['Funk', 'Boogie', 'Groove'], Garage: ['Garage', 'Grime', '2-Step'],
    Trance: ['Trance', 'Rave', 'Wave'], Drift: ['Ambient', 'Drift', 'Bloom', 'Haze'], Bop: ['Bop', 'Jungle', 'Jazz'],
    Disco: ['Disco', 'Pop', 'Strut'], Chiptune: ['Chip', 'Arcade', 'Bitcore']
  };
  const ADJ = [
    ['Glacier', 'ice'], ['Neon', 'neon'], ['Velvet', 'warm'], ['Cosmic', 'space'], ['Rust', 'grit'], ['Lunar', 'space'],
    ['Jelly', 'warm'], ['Chrome', 'neon'], ['Moss', 'warm'], ['Static', 'grit'], ['Sunken', 'ice'], ['Hyper', 'neon'],
    ['Paper', 'ice'], ['Amber', 'warm'], ['Cobalt', 'ice'], ['Feral', 'grit'], ['Plasma', 'neon'], ['Midnight', 'space'],
    ['Pixel', 'neon'], ['Tidal', 'ice'], ['Solar', 'warm'], ['Gravel', 'grit'], ['Orchid', 'warm'], ['Quantum', 'space']
  ];
  const MID = ['Monk', 'Lizard', 'Tiger', 'Cathedral', 'Robot', 'Jungle', 'Disco', 'Pirate', 'Orbit', 'Cactus', 'Sphinx', 'Samurai', 'Kraken', 'Penguin', 'Wizard', 'Ghost'];
  const MOODS = { ice: 40, neon: 320, warm: 20, space: 265, grit: 100 }; // base hue for palette (neon 320)

  function inventGenre(seed) {
    const r = mulberry32(Math.imul(seed ^ 0x9e3779b9, 2654435761) >>> 0); r(); r(); r();
    const famKey = pick(r, Object.keys(FAMILIES));
    const F = FAMILIES[famKey];
    const [adj, vibe] = pick(r, ADJ);
    let name = adj + ' ';
    if (chance(r, .55)) name += pick(r, MID) + ' ';
    name += pick(r, FAMILY_NAMES[famKey]);
    const scaleName = pick(r, F.scales);
    const root = Math.floor(r() * 12);
    const bpm = Math.round(rnd(r, F.bpm[0], F.bpm[1]));
    const leadTypes = ['pluck', 'bell', 'super', 'chip', 'fm', 'flute'];
    const padTypes = ['organ', 'glass', 'super', 'chip', 'choirless'];
    const g = {
      seed, name, family: famKey, vibe,
      hue: (MOODS[vibe] + rnd(r, -25, 25) + 360) % 360,
      bpm, swing: rnd(r, F.swing[0], F.swing[1]),
      scaleName, scale: SCALES[scaleName], root, key: KEYS[root],
      drums: F.drums, bass: chance(r, .75) ? F.bass : pick(r, ['sub', 'funk', 'drive', 'wobble', 'octave', 'walk']),
      padT: chance(r, .7) ? F.pad : pick(r, padTypes),
      leadT: chance(r, .65) ? F.lead : pick(r, leadTypes),
      density: Math.min(1, F.dens * rnd(r, .8, 1.15)),
      reverb: Math.min(1, F.verb * rnd(r, .8, 1.2)),
      delay: F.delay * rnd(r, .8, 1.2),
      delayDiv: pick(r, [.75, .75, 1, .5]), // in beats (dotted 8th = .75)
      cutoff: rnd(r, 900, 3200) * (vibe === 'ice' ? 1.3 : vibe === 'grit' ? .8 : 1),
      drive: vibe === 'grit' ? rnd(r, 2, 6) : rnd(r, 0, 2.5),
      kickTune: rnd(r, 42, 58), snareTune: rnd(r, 170, 240), hatBright: rnd(r, 6500, 9500),
      kickStyle: pick(r, ['punch', 'deep', 'click']),
      snareStyle: pick(r, ['snap', 'clap', 'rim']),
      progs: null
    };
    if (g.drums === 'none') g.density *= .8;
    return g;
  }

  // ---------- helpers ----------
  function euclid(k, n, rot) {
    const out = new Array(n).fill(0);
    if (k <= 0) return out;
    let b = 0;
    for (let i = 0; i < n; i++) { b += k; if (b >= n) { b -= n; out[(i + rot) % n] = 1; } }
    return out;
  }
  function makeReverbIR(ctx, seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += (((Math.random() * 2 - 1)) - lp) * (.5 - .4 * t); // darkening tail
        d[i] = lp * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }
  function makeNoise(ctx) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function makeCurve(amount) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = Math.tanh(x * (1 + amount)) / Math.tanh(1 + amount); }
    return c;
  }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- the engine ----------
  const SECTIONS = {
    intro:  { bars: 8, k: 0, s: 0, h: .4, b: 0, p: 1, l: 0, a: .5, e: .25 },
    groove: { bars: 8, k: 1, s: 1, h: 1, b: 1, p: 1, l: .55, a: .3, e: .6 },
    build:  { bars: 8, k: 1, s: 1, h: 1, b: .6, p: 1, l: .3, a: 1, e: .8, roll: 1 },
    drop:   { bars: 8, k: 1, s: 1, h: 1, b: 1, p: 1, l: 1, a: .6, e: 1 },
    break:  { bars: 8, k: 0, s: 0, h: .2, b: .4, p: 1, l: .9, a: .8, e: .35 },
    outro:  { bars: 8, k: .3, s: 0, h: .5, b: .5, p: 1, l: .2, a: .3, e: .2 }
  };
  const NEXT = {
    intro: ['groove', 'groove', 'build'], groove: ['groove', 'build', 'break', 'drop'], build: ['drop', 'drop'],
    drop: ['groove', 'break', 'drop', 'outro'], break: ['build', 'groove', 'drop'], outro: ['intro', 'groove']
  };

  function Engine(ctx, opts) {
    opts = opts || {};
    this.ctx = ctx;
    this.offline = !!opts.offline;
    this.mood = opts.mood == null ? .55 : opts.mood;
    this.onEvent = opts.onEvent || null;
    this.step = 0; this.bar = 0;
    this.nextTime = 0;
    this.section = null; this.sectionBar = 0;
    this.pendingGenre = null;
    this.running = false;
    this._build();
    this.setGenre(opts.genre || inventGenre((Math.random() * 1e9) | 0), true);
  }

  Engine.prototype._build = function () {
    const c = this.ctx;
    this.noise = makeNoise(c);
    this.master = c.createGain(); this.master.gain.value = .7;
    this.mix = c.createGain();
    this.tone = c.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 18000; this.tone.Q.value = .5;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 10; this.comp.ratio.value = 4; this.comp.attack.value = .004; this.comp.release.value = .18;
    this.analyser = c.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = .8;
    this.mix.connect(this.tone); this.tone.connect(this.comp); this.comp.connect(this.master); this.master.connect(this.analyser);
    this.out = this.master;
    // buses
    const bus = (g) => { const n = c.createGain(); n.gain.value = g; n.connect(this.mix); return n; };
    this.drumBus = bus(.95); this.bassBus = bus(.8); this.padBus = bus(.5); this.leadBus = bus(.55); this.arpBus = bus(.4);
    // sends
    this.verb = c.createConvolver(); this.verb.buffer = makeReverbIR(c, 3.2, 2.4);
    this.verbIn = c.createGain(); this.verbOut = c.createGain(); this.verbOut.gain.value = .6;
    this.verbIn.connect(this.verb); this.verb.connect(this.verbOut); this.verbOut.connect(this.mix);
    this.dly = c.createDelay(2); this.dlyFb = c.createGain(); this.dlyTone = c.createBiquadFilter(); this.dlyTone.type = 'lowpass'; this.dlyTone.frequency.value = 2800;
    this.dlyIn = c.createGain(); this.dlyOut = c.createGain(); this.dlyOut.gain.value = .5;
    this.dlyIn.connect(this.dly); this.dly.connect(this.dlyTone); this.dlyTone.connect(this.dlyFb); this.dlyFb.connect(this.dly); this.dlyTone.connect(this.dlyOut);
    this.dlyOut.connect(this.mix); this.dlyOut.connect(this.verbIn);
    [this.padBus, this.leadBus, this.arpBus].forEach(b => { b.connect(this.verbIn); });
    [this.leadBus, this.arpBus].forEach(b => b.connect(this.dlyIn));
    // sidechain-ish ducking node for pad/bass
    this.duck = c.createGain(); this.duck.gain.value = 1;
    this.padDuck = c.createGain(); this.padDuck.connect(this.duck); this.duck.connect(this.padBus);
    this.shaper = c.createWaveShaper(); this.shaper.curve = makeCurve(1); this.shaper.oversample = '2x';
    this.bassIn = c.createGain(); this.bassIn.connect(this.shaper); this.shaper.connect(this.bassBus);
  };

  Engine.prototype.setGenre = function (g, immediate) {
    if (!immediate && this.running) { this.pendingGenre = g; return; }
    this._applyGenre(g);
  };
  Engine.prototype._applyGenre = function (g) {
    this.g = g;
    this.shaper.curve = makeCurve(g.drive);
    this.verbOut.gain.value = .25 + g.reverb * .9;
    this.dlyOut.gain.value = .12 + g.delay * .55;
    this.dlyFb.gain.value = .25 + g.delay * .3;
    this.rootMidi = 36 + g.root;
    this.newSection('intro');
    if (this.onEvent) this.onEvent('genre', this.nextTime || this.ctx.currentTime, g);
  };

  // ----- musical structure -----
  Engine.prototype.newSection = function (name) {
    const g = this.g, r = Math.random;
    this.section = name; this.sectionBar = 0; this.S = SECTIONS[name];
    // chord progression (scale-degree indices, 4 chords x 2 bars)
    const n = g.scale.length;
    const sets = [[0, 3, 4, 0], [0, 5, 3, 4], [0, 2, 5, 4], [0, 0, 3, 4], [0, 6 % n, 5 % n, 4], [0, 3, 0, 4 % n], [0, 4, 5 % n, 3], [0, 2, 3, 2]];
    if (!this.prog || chance(r, .7)) {
      this.prog = pick(r, sets).map(d => d % n);
      if (chance(r, .35)) this.prog[3] = pick(r, [1 % n, 4 % n, 6 % n]);
    }
    // bass pattern
    const B = g.bass, bp = new Array(16).fill(null);
    const put = (i, off, len, oct) => { bp[i] = { off, len, oct: oct || 0 }; };
    if (B === 'sub') { put(0, 0, 14); if (chance(r, .5)) put(10, 0, 4); }
    else if (B === 'funk') { put(0, 0, 2); [3, 6, 7, 10, 11, 14].forEach(i => { if (chance(r, .55)) put(i, pick(r, [0, 0, 4]), 1, chance(r, .3) ? 1 : 0); }); }
    else if (B === 'drive' || B === 'chip') { for (let i = 0; i < 16; i += 2) put(i, 0, 1, i % 4 === 2 && B === 'chip' ? 1 : 0); }
    else if (B === 'octave') { for (let i = 0; i < 16; i += 2) put(i, 0, 1, (i / 2) % 2); }
    else if (B === 'wobble') { put(0, 0, 6); put(6, 0, 3); if (chance(r, .6)) put(10, pick(r, [0, 2, 4]), 5); }
    else if (B === 'walk') { for (let i = 0; i < 16; i += 4) put(i, pick(r, [0, 2, 4, 6]), 3); put(0, 0, 3); }
    this.bassPat = bp;
    // lead motif (2 bars = 32 steps)
    const lm = new Array(32).fill(null);
    const dens = .22 + g.density * .3;
    let last = 0;
    for (let i = 0; i < 32; i++) {
      const strong = i % 4 === 0;
      if (i === 0 || chance(r, strong ? dens + .25 : dens * .6)) {
        const off = strong ? pick(r, [0, 2, 4, 7, 4, 2]) : Math.max(-2, Math.min(9, last + pick(r, [-2, -1, 1, 2, 1, -1])));
        lm[i] = { off, len: pick(r, [1, 2, 2, 3, 4]) };
        last = off;
      }
    }
    this.motif = lm;
    this.arpMode = pick(r, ['up', 'down', 'updown', 'rand']);
    this.arpRate = pick(r, [1, 1, 2]);
    this.arpOct = pick(r, [1, 2]);
    // drums
    this.makeDrums();
    if (this.onEvent) this.onEvent('section', this.nextTime || this.ctx.currentTime, name);
  };
  Engine.prototype.makeDrums = function () {
    const g = this.g, r = Math.random;
    const D = g.drums;
    let k, s, h;
    if (D === 'four' ) { k = euclid(4, 16, 0); s = [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0]; h = [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0]; }
    else if (D === 'dub') { k = [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0]; k[0] = 1 * (chance(r, .5) ? 1 : 0); s = [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0]; s[8] = 1; h = euclid(8, 16, 0); k[8] = 1; s = new Array(16).fill(0); s[12] = 1; }
    else if (D === 'funk') { k = [1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0]; if (chance(r, .5)) k[10] = 1; s = [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,1]; h = [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]; }
    else if (D === 'garage') { k = [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0]; if (chance(r, .5)) k[7] = 1; s = [0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,0]; s[4]=1; s[13] = 1; s[14] = 0; h = euclid(11, 16, 1); }
    else if (D === 'breaks') { k = euclid(5, 16, 0); s = [0,0,0,0,1,0,0,1,0,1,0,0,1,0,0,0]; h = euclid(12, 16, 0); }
    else { k = new Array(16).fill(0); s = new Array(16).fill(0); h = euclid(5, 16, 2); if (D === 'none') { k[0] = chance(r, .4) ? 1 : 0; } }
    this.kp = k; this.sp = s; this.hp = h;
  };

  Engine.prototype.chordNote = function (degIndex, off) {
    // scale-degree index -> midi. off = additional scale steps above chord root.
    const sc = this.g.scale, n = sc.length;
    const idx = degIndex + off;
    const oct = Math.floor(idx / n);
    const d = ((idx % n) + n) % n;
    return this.rootMidi + sc[d] + 12 * oct;
  };
  Engine.prototype.chordTones = function (deg) {
    const n = this.g.scale.length;
    const t = n >= 7 ? [0, 2, 4, 6] : n === 6 ? [0, 2, 3, 5] : [0, 1, 2, 3];
    return t;
  };

  // ----- scheduling -----
  Engine.prototype.start = function (t0) {
    this.running = true;
    this.nextTime = t0 == null ? this.ctx.currentTime + .08 : t0;
  };
  Engine.prototype.stepDur = function () { return 60 / this.bpmNow() / 4; };
  Engine.prototype.bpmNow = function () { return this.g.bpm * (.94 + this.mood * .12); };

  Engine.prototype.scheduleUntil = function (until) {
    while (this.nextTime < until) {
      this.playStep(this.step, this.nextTime);
      const sd = this.stepDur();
      this.nextTime += sd;
      this.step++;
      if (this.step % 16 === 0) this.onBar();
    }
  };
  Engine.prototype.onBar = function () {
    this.bar++; this.sectionBar++;
    if (this.pendingGenre) { const g = this.pendingGenre; this.pendingGenre = null; this._applyGenre(g); this.swoosh(this.nextTime); return; }
    if (this.sectionBar >= this.S.bars) {
      this.newSection(pick(Math.random, NEXT[this.section]));
    } else if (chance(Math.random, .35)) {
      // per-bar mutation so nothing repeats exactly
      const m = this.motif, i = Math.floor(Math.random() * 32);
      if (m[i] && chance(Math.random, .5)) m[i] = null;
      else if (!m[i]) m[i] = { off: pick(Math.random, [0, 1, 2, 3, 4, 5, 7]), len: pick(Math.random, [1, 2, 3]) };
      else m[i].off += pick(Math.random, [-1, 1]);
      if (chance(Math.random, .4)) this.hp[Math.floor(Math.random() * 16)] ^= 1;
      if (chance(Math.random, .3) && this.g.drums !== 'none') this.kp[pick(Math.random, [3, 7, 10, 11, 14, 15])] ^= 1;
      if (chance(Math.random, .25)) this.arpMode = pick(Math.random, ['up', 'down', 'updown', 'rand']);
    }
  };

  Engine.prototype.playStep = function (step, t0) {
    const g = this.g, S = this.S, r = Math.random, m = this.mood;
    const i = step % 16;
    const bar8 = this.sectionBar % 8;
    const chordI = Math.floor(bar8 / 2) % 4;
    const deg = this.prog[chordI];
    const sd = this.stepDur();
    const sw = (i % 2 === 1) ? g.swing * sd : 0;
    const t = t0 + sw;
    const energy = S.e * (.5 + m * .7);
    const dens = Math.min(1, g.density * (.45 + m * .85));
    const noDrums = g.drums === 'none';
    const lastBarOfSection = this.sectionBar === S.bars - 1;

    // tone sweeps by section/mood
    if (i === 0) {
      let cut = 600 + 17000 * Math.pow(.25 + .75 * (this.section === 'build' ? (this.sectionBar + 1) / S.bars : 1) * (.35 + m * .65), 1.6);
      if (this.section === 'break') cut *= .6;
      this.tone.frequency.setTargetAtTime(Math.min(18000, cut), t0, .3);
      this.dly.delayTime.setTargetAtTime(Math.min(1.9, 60 / this.bpmNow() * g.delayDiv), t0, .05);
      if (this.onEvent) this.onEvent('bar', t0, { bar: this.bar, sectionBar: this.sectionBar, section: this.section, chord: chordI });
    }

    // PAD: chord every 2 bars
    if (bar8 % 2 === 0 && i === 0 && S.p) {
      const tones = this.chordTones(deg);
      const dur = sd * 32;
      tones.forEach((o, ti) => { this.padVoice(this.chordNote(deg, o) + 12, t0, dur, ti); });
      if (this.onEvent) this.onEvent('pad', t0, null);
    }

    // DRUMS
    if (!noDrums || g.drums === 'none') {
      if (this.kp[i] && S.k && chance(r, Math.min(1, .55 + energy * .6)) && !noDrums) { this.kick(t, .9 * (i % 4 === 0 ? 1 : .8)); }
      if (noDrums && i === 0 && S.k && chance(r, .5)) this.kick(t, .55);
      if (this.sp[i] && S.s && !noDrums) { this.snare(t, .85); }
      if (this.hp[i] && S.h && chance(r, Math.min(1, .35 + dens * .7 * S.h))) { this.hat(t, (i % 4 === 2 ? .7 : .45) * (.6 + energy * .5), chance(r, .08) && i % 2 === 1); }
      // fills & rolls
      if (lastBarOfSection && !noDrums && S.s && i >= 12 && chance(r, .6 + .3 * (S.roll || 0))) this.snare(t, .35 + (i - 12) * .12);
      if (S.roll && this.sectionBar >= S.bars - 2 && !noDrums && i % 2 === 0) this.snare(t, .15 + this.sectionBar * .02 + i * .01);
      if (g.drums === 'funk' || g.drums === 'garage' || g.drums === 'breaks') if (S.s && chance(r, .06 * energy)) this.snare(t, .2); // ghost notes
      if (S.h && !noDrums && chance(r, .04) && i % 4 === 3) this.perc(t, deg);
    }
    if (noDrums && S.h && i % 4 === 2 && chance(r, .25)) this.perc(t, deg);

    // BASS
    const bp = this.bassPat[i];
    if (bp && S.b && chance(r, Math.min(1, .6 + S.b * .5))) {
      const midi = this.chordNote(deg, bp.off) - 12 + 12 * bp.oct;
      this.bassVoice(midi, t, Math.max(.06, bp.len * sd * .92), .8);
    }

    // LEAD
    const lm = this.motif[step % 32];
    if (lm && S.l && chance(r, Math.min(1, S.l * (.45 + dens * .7)))) {
      const midi = this.chordNote(deg, lm.off) + 24;
      this.leadVoice(midi, t, lm.len * sd * .95, .55 + energy * .4);
      if (this.onEvent) this.onEvent('lead', t, midi);
    }

    // ARP
    if (S.a && i % this.arpRate === 0 && chance(r, S.a * (.3 + dens * .7))) {
      const tones = this.chordTones(deg);
      const seq = [];
      for (let o = 0; o < this.arpOct; o++) tones.forEach(x => seq.push(x + o * g.scale.length));
      let k = Math.floor(step / this.arpRate);
      let idx;
      if (this.arpMode === 'up') idx = k % seq.length;
      else if (this.arpMode === 'down') idx = seq.length - 1 - (k % seq.length);
      else if (this.arpMode === 'updown') { const L = seq.length * 2 - 2; const p = k % L; idx = p < seq.length ? p : L - p; }
      else idx = Math.floor(Math.random() * seq.length);
      this.arpVoice(this.chordNote(deg, seq[idx]) + 24, t, sd * this.arpRate * .8, .22 + energy * .2);
    }
  };

  // ----- voices -----
  Engine.prototype.env = function (param, t, a, peak, d, hold) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(.0001, t);
    param.exponentialRampToValueAtTime(Math.max(.0002, peak), t + a);
    param.exponentialRampToValueAtTime(.0001, t + a + d);
  };
  Engine.prototype.duckNow = function (t, amt) {
    const p = this.duck.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(1 - amt, t);
    p.linearRampToValueAtTime(1, t + .22);
  };
  Engine.prototype.kick = function (t, v) {
    const c = this.ctx, g = this.g;
    const o = c.createOscillator(), a = c.createGain();
    const f0 = g.kickStyle === 'click' ? 220 : g.kickStyle === 'deep' ? 120 : 170;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(g.kickTune, t + (g.kickStyle === 'deep' ? .1 : .05));
    const len = g.kickStyle === 'deep' ? .55 : .32;
    a.gain.setValueAtTime(v, t); a.gain.exponentialRampToValueAtTime(.001, t + len);
    o.connect(a); a.connect(this.drumBus); o.start(t); o.stop(t + len + .05);
    if (g.kickStyle === 'click') { this.noiseBurst(t, .01, 3000, 'highpass', .25, this.drumBus); }
    this.duckNow(t, .35 * (.5 + this.mood));
    if (this.onEvent) this.onEvent('kick', t, v);
  };
  Engine.prototype.noiseBurst = function (t, dur, freq, type, vol, dest, q) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    const a = c.createGain(); a.gain.setValueAtTime(vol, t); a.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f); f.connect(a); a.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + .02);
  };
  Engine.prototype.snare = function (t, v) {
    const c = this.ctx, g = this.g;
    if (g.snareStyle === 'clap') {
      for (let k = 0; k < 3; k++) this.noiseBurst(t + k * .011, .09, 1500, 'bandpass', .5 * v, this.drumBus, 1.2);
      this.noiseBurst(t + .033, .2, 1500, 'bandpass', .45 * v, this.drumBus, 1);
    } else if (g.snareStyle === 'rim') {
      const o = c.createOscillator(), a = c.createGain(); o.type = 'square'; o.frequency.value = g.snareTune * 3.2;
      a.gain.setValueAtTime(.3 * v, t); a.gain.exponentialRampToValueAtTime(.001, t + .05);
      o.connect(a); a.connect(this.drumBus); o.start(t); o.stop(t + .06);
      this.noiseBurst(t, .08, 3000, 'bandpass', .35 * v, this.drumBus, 2);
    } else {
      const o = c.createOscillator(), a = c.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(g.snareTune * 1.6, t); o.frequency.exponentialRampToValueAtTime(g.snareTune, t + .06);
      a.gain.setValueAtTime(.5 * v, t); a.gain.exponentialRampToValueAtTime(.001, t + .14);
      o.connect(a); a.connect(this.drumBus); o.start(t); o.stop(t + .16);
      this.noiseBurst(t, .16, 2200, 'highpass', .5 * v, this.drumBus);
    }
    if (this.onEvent && v > .5) this.onEvent('snare', t, v);
  };
  Engine.prototype.hat = function (t, v, open) {
    this.noiseBurst(t, open ? .22 : .045, this.g.hatBright, 'highpass', .3 * v, this.drumBus);
    if (this.onEvent) this.onEvent('hat', t, v);
  };
  Engine.prototype.swoosh = function (t) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(8000, t); f.frequency.exponentialRampToValueAtTime(200, t + 1.2);
    const a = c.createGain(); a.gain.setValueAtTime(.0001, t); a.gain.exponentialRampToValueAtTime(.3, t + .05); a.gain.exponentialRampToValueAtTime(.0001, t + 1.3);
    s.connect(f); f.connect(a); a.connect(this.verbIn); a.connect(this.mix); s.start(t); s.stop(t + 1.4);
  };
  Engine.prototype.perc = function (t, deg) {
    const c = this.ctx, o = c.createOscillator(), a = c.createGain(), f = 300 + Math.random() * 700;
    o.type = 'sine'; o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + .05);
    a.gain.setValueAtTime(.25, t); a.gain.exponentialRampToValueAtTime(.001, t + .12);
    o.connect(a); a.connect(this.drumBus); o.start(t); o.stop(t + .15);
  };
  Engine.prototype.bassVoice = function (midi, t, dur, v) {
    const c = this.ctx, g = this.g, f = mtof(midi);
    const a = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = g.bass === 'wobble' ? 8 : 3;
    const cut = g.bass === 'sub' ? 300 : 500 + this.mood * 1400;
    lp.frequency.setValueAtTime(cut * 3, t); lp.frequency.exponentialRampToValueAtTime(cut, t + .12);
    if (g.bass === 'wobble') {
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 60 / this.bpmNow() * 2; lg.gain.value = cut * .8; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t); lfo.stop(t + dur + .1);
    }
    const types = { sub: 'sine', funk: 'sawtooth', drive: 'sawtooth', wobble: 'sawtooth', octave: 'square', walk: 'triangle', chip: 'square' };
    const o = c.createOscillator(); o.type = types[g.bass] || 'sawtooth'; o.frequency.value = f;
    a.gain.setValueAtTime(.0001, t); a.gain.exponentialRampToValueAtTime(v * .7, t + .01); a.gain.setValueAtTime(v * .7, t + Math.max(.02, dur - .06)); a.gain.exponentialRampToValueAtTime(.0001, t + dur + .06);
    o.connect(lp); lp.connect(a);
    // duck bass slightly with kick via shared duck node
    a.connect(this.bassIn);
    o.start(t); o.stop(t + dur + .1);
    if (g.bass !== 'sub' && g.bass !== 'chip') { const s = c.createOscillator(), sg = c.createGain(); s.frequency.value = f; sg.gain.value = v * .5; s.connect(sg); sg.connect(a); s.start(t); s.stop(t + dur + .1); }
  };
  Engine.prototype.padVoice = function (midi, t, dur, ti) {
    const c = this.ctx, g = this.g, f = mtof(midi), T = g.padT;
    const a = c.createGain(), lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(900 + this.mood * 2200, t + dur * .5); lp.frequency.linearRampToValueAtTime(500, t + dur);
    const atk = T === 'chip' ? .01 : Math.min(2.5, dur * .25), vol = .1;
    a.gain.setValueAtTime(.0001, t); a.gain.linearRampToValueAtTime(vol, t + atk); a.gain.setValueAtTime(vol, t + dur * .75); a.gain.linearRampToValueAtTime(.0001, t + dur + .5);
    const wave = { organ: 'sine', glass: 'triangle', super: 'sawtooth', chip: 'square', choirless: 'sawtooth' }[T];
    const dets = T === 'super' ? [-14, 0, 14] : T === 'organ' ? [0] : [-6, 6];
    dets.forEach(d => {
      const o = c.createOscillator(); o.type = wave; o.frequency.value = f; o.detune.value = d + (Math.random() - .5) * 4;
      o.connect(lp); o.start(t); o.stop(t + dur + .6);
    });
    if (T === 'organ') { const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2; const g2 = c.createGain(); g2.gain.value = .4; o2.connect(g2); g2.connect(lp); o2.start(t); o2.stop(t + dur + .6); }
    lp.connect(a); a.connect(this.padDuck);
  };
  Engine.prototype.leadVoice = function (midi, t, dur, v) {
    const c = this.ctx, g = this.g, f = mtof(midi), T = g.leadT;
    const a = c.createGain(); a.connect(this.leadBus);
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    let dest = a; if (pan) { pan.pan.value = (Math.random() - .5) * .6; pan.connect(a); dest = pan; }
    const end = t + Math.max(.12, dur) + .15;
    if (T === 'bell' || T === 'fm') {
      const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain();
      car.frequency.value = f; mod.frequency.value = f * (T === 'bell' ? 3.5 : 2); mg.gain.setValueAtTime(f * (T === 'bell' ? 2.2 : 1.5), t); mg.gain.exponentialRampToValueAtTime(f * .1, t + .4);
      mod.connect(mg); mg.connect(car.frequency); car.connect(dest);
      a.gain.setValueAtTime(.0001, t); a.gain.exponentialRampToValueAtTime(.35 * v, t + .005); a.gain.exponentialRampToValueAtTime(.0001, t + (T === 'bell' ? 1.2 : .5) + dur * .3);
      car.start(t); mod.start(t); car.stop(t + 1.6); mod.stop(t + 1.6);
    } else if (T === 'flute') {
      const o = c.createOscillator(), vib = c.createOscillator(), vg = c.createGain(); o.type = 'sine'; o.frequency.value = f; vib.frequency.value = 5.5; vg.gain.value = f * .008; vib.connect(vg); vg.connect(o.frequency);
      o.connect(dest); a.gain.setValueAtTime(.0001, t); a.gain.linearRampToValueAtTime(.35 * v, t + .06); a.gain.setValueAtTime(.35 * v, t + dur); a.gain.exponentialRampToValueAtTime(.0001, t + dur + .2);
      this.noiseBurst(t, .08, 4000, 'bandpass', .04 * v, a, 1);
      o.start(t); vib.start(t); o.stop(end + .1); vib.stop(end + .1);
    } else {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
      const cut = g.cutoff * (.6 + this.mood);
      lp.frequency.setValueAtTime(cut * 3, t); lp.frequency.exponentialRampToValueAtTime(cut * .6, t + .25);
      const wave = T === 'chip' ? 'square' : 'sawtooth';
      const dets = T === 'super' ? [-12, 0, 12] : T === 'chip' ? [0] : [-4, 4];
      dets.forEach(d => { const o = c.createOscillator(); o.type = wave; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t); o.stop(end + .1); });
      lp.connect(dest);
      const hold = T === 'super' ? dur : Math.min(dur, .22);
      a.gain.setValueAtTime(.0001, t); a.gain.exponentialRampToValueAtTime(.22 * v, t + .008); a.gain.setValueAtTime(.22 * v, t + hold * .6); a.gain.exponentialRampToValueAtTime(.0001, t + hold + .18);
    }
  };
  Engine.prototype.arpVoice = function (midi, t, dur, v) {
    const c = this.ctx, g = this.g, f = mtof(midi);
    const o = c.createOscillator(), a = c.createGain(), lp = c.createBiquadFilter();
    o.type = g.leadT === 'chip' ? 'square' : g.vibe === 'ice' ? 'sine' : 'triangle'; o.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.value = 1800 + this.mood * 3500;
    a.gain.setValueAtTime(.0001, t); a.gain.exponentialRampToValueAtTime(v * .5, t + .004); a.gain.exponentialRampToValueAtTime(.0001, t + Math.max(.08, dur));
    o.connect(lp); lp.connect(a); a.connect(this.arpBus); o.start(t); o.stop(t + dur + .1);
    if (this.onEvent) this.onEvent('arp', t, midi);
  };

  // ---------- offline render → WAV ----------
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
  async function renderOffline(genre, seconds, mood, skipSections) {
    const sr = 44100;
    const ctx = new OfflineAudioContext(2, Math.floor(sr * seconds), sr);
    const eng = new Engine(ctx, { genre, mood, offline: true });
    eng.out.connect(ctx.destination);
    eng.start(0);
    // optionally jump past the quiet intro
    if (skipSections) eng.newSection('groove');
    eng.scheduleUntil(seconds + .5);
    const buf = await ctx.startRendering();
    // gentle fade out
    const fade = Math.floor(sr * 1.5);
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade; }
    return buf;
  }

  global.MM = { Engine, inventGenre, renderOffline, encodeWav, mulberry32 };
})(window);
