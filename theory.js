/* Endless Music Machine — music theory + genre DNA: chords, voice leading, progressions, motifs, rhythm patterns, hybrid genre inventor. */
(function (G) {
  'use strict';
  const MM = G.MM = G.MM || {};
  const rng = MM.mulberry32;
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const rnd = (r, a, b) => a + r() * (b - a);
  const chance = (r, p) => r() < p;
  const KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const fit = (s, n) => (s.length >= n ? s.slice(0, n) : s + '.'.repeat(n - s.length));

  const MODES = {
    Ionian: [0, 2, 4, 5, 7, 9, 11], Dorian: [0, 2, 3, 5, 7, 9, 10], Phrygian: [0, 1, 3, 5, 7, 8, 10],
    Lydian: [0, 2, 4, 6, 7, 9, 11], Mixolydian: [0, 2, 4, 5, 7, 9, 10], Aeolian: [0, 2, 3, 5, 7, 8, 10],
    'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11]
  };
  const QUAL = {
    M: [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '7': [0, 4, 7, 10], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
    '9': [0, 4, 7, 10, 14], '13': [0, 4, 10, 14, 21], sus2: [0, 2, 7], sus4: [0, 5, 7], m7b5: [0, 3, 6, 10], dim: [0, 3, 6], m6: [0, 3, 7, 9],
    'maj7#11': [0, 4, 7, 11, 18], add9: [0, 4, 7, 14], m11: [0, 3, 7, 10, 17], '5': [0, 7], maj6: [0, 4, 7, 9], sus2add: [0, 2, 7, 12]
  };

  // ---------- progressions: [rootSemitones, quality]; b = bars per chord ----------
  const PR = {
    lofiMin: [
      { m: 'Dorian', b: 1, c: [[2, 'm7b5'], [7, '7'], [0, 'm9'], [8, 'maj7']] },
      { m: 'Dorian', b: 1, c: [[0, 'm7'], [5, '9'], [0, 'm9'], [7, 'm7']] },
      { m: 'Aeolian', b: 1, c: [[0, 'm7'], [5, 'm7'], [10, '7'], [3, 'maj7']] },
      { m: 'Aeolian', b: 2, c: [[0, 'm9'], [8, 'maj9'], [3, 'maj7'], [10, '9']] }],
    lofiMaj: [
      { m: 'Ionian', b: 1, c: [[0, 'maj9'], [9, 'm9'], [2, 'm9'], [7, '13']] },
      { m: 'Ionian', b: 1, c: [[5, 'maj9'], [4, 'm7'], [2, 'm9'], [0, 'maj7']] },
      { m: 'Ionian', b: 1, c: [[2, 'm9'], [7, '13'], [0, 'maj9'], [9, 'm7']] },
      { m: 'Lydian', b: 2, c: [[0, 'maj7#11'], [7, 'maj7'], [4, 'm7'], [2, '9']] }],
    jazz: [
      { m: 'Ionian', b: 1, c: [[2, 'm7'], [7, '7'], [0, 'maj7'], [9, '7'], [2, 'm7'], [7, '7'], [0, 'maj7'], [0, 'maj7']] },
      { m: 'Ionian', b: 1, c: [[0, 'maj7'], [9, '7'], [2, 'm7'], [7, '7'], [4, 'm7'], [9, '7'], [2, 'm7'], [7, '7']] },
      { m: 'Dorian', b: 1, c: [[2, 'm7b5'], [7, '7'], [0, 'm6'], [0, 'm6'], [5, 'm7'], [10, '7'], [3, 'maj7'], [8, 'maj7']] },
      { m: 'Aeolian', b: 1, c: [[5, 'm7'], [10, '7'], [3, 'maj7'], [8, 'maj7'], [2, 'm7b5'], [7, '7'], [0, 'm7'], [0, 'm7']] }],
    houseA: [
      { m: 'Aeolian', b: 1, c: [[0, 'm7'], [8, 'maj7'], [3, 'maj7'], [10, '7']] },
      { m: 'Dorian', b: 2, c: [[0, 'm9'], [5, 'm9'], [0, 'm9'], [10, 'maj7']] },
      { m: 'Aeolian', b: 1, c: [[0, 'm9'], [0, 'm9'], [8, 'maj9'], [10, '9']] },
      { m: 'Ionian', b: 1, c: [[0, 'maj7'], [9, 'm7'], [5, 'maj7'], [7, '7']] }],
    dnb: [
      { m: 'Aeolian', b: 2, c: [[0, 'm7'], [8, 'maj7'], [3, 'maj7'], [10, '7']] },
      { m: 'Aeolian', b: 1, c: [[0, 'm9'], [8, 'maj9'], [3, 'maj7'], [10, 'sus4']] },
      { m: 'Dorian', b: 2, c: [[0, 'm9'], [10, 'maj9'], [5, '9'], [7, 'm7']] },
      { m: 'Phrygian', b: 2, c: [[0, 'm7'], [1, 'maj7'], [0, 'm7'], [10, 'maj7']] }],
    wave: [
      { m: 'Aeolian', b: 1, c: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']] },
      { m: 'Aeolian', b: 1, c: [[0, 'm'], [10, 'M'], [8, 'M'], [7, 'M']] },
      { m: 'Ionian', b: 1, c: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']] },
      { m: 'Aeolian', b: 2, c: [[0, 'm7'], [5, 'm7'], [8, 'maj7'], [10, '7']] }],
    ambient: [
      { m: 'Lydian', b: 2, c: [[0, 'maj9'], [7, 'sus2'], [9, 'm9'], [5, 'maj7#11']] },
      { m: 'Aeolian', b: 2, c: [[0, 'm9'], [8, 'maj7'], [3, 'maj9'], [10, 'sus2']] },
      { m: 'Dorian', b: 2, c: [[0, 'sus2'], [5, 'sus2'], [3, 'maj7'], [10, 'sus2']] },
      { m: 'Ionian', b: 4, c: [[0, 'maj9'], [4, 'm7'], [5, 'maj7#11'], [7, 'sus4']] }],
    dub: [
      { m: 'Aeolian', b: 2, c: [[0, 'm7'], [0, 'm7'], [5, 'm7'], [5, 'm7']] },
      { m: 'Dorian', b: 2, c: [[0, 'm7'], [5, '9'], [0, 'm7'], [7, 'm7']] },
      { m: 'Aeolian', b: 1, c: [[0, 'm7'], [3, 'maj7'], [5, 'm7'], [10, '7']] }],
    trap: [
      { m: 'Aeolian', b: 2, c: [[0, 'm'], [8, 'M'], [7, 'M'], [7, 'M']] },
      { m: 'Phrygian', b: 2, c: [[0, 'm'], [1, 'M'], [0, 'm'], [7, 'M']] },
      { m: 'Aeolian', b: 2, c: [[0, 'm7'], [5, 'm7'], [8, 'maj7'], [7, '7']] },
      { m: 'Harmonic Minor', b: 2, c: [[0, 'm'], [8, 'M'], [5, 'm'], [7, 'M']] }],
    chip: [
      { m: 'Ionian', b: 1, c: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']] },
      { m: 'Ionian', b: 1, c: [[0, 'M'], [9, 'm'], [5, 'M'], [7, 'M']] },
      { m: 'Aeolian', b: 1, c: [[0, 'm'], [10, 'M'], [8, 'M'], [7, 'M']] },
      { m: 'Mixolydian', b: 1, c: [[0, 'M'], [10, 'M'], [5, 'M'], [0, 'M']] }],
    afro: [
      { m: 'Mixolydian', b: 2, c: [[0, '9'], [5, '9'], [0, '9'], [7, 'm7']] },
      { m: 'Dorian', b: 2, c: [[0, 'm9'], [0, 'm9'], [5, '9'], [5, '9']] },
      { m: 'Ionian', b: 1, c: [[0, 'maj7'], [5, 'maj7'], [7, '7'], [5, 'maj7']] },
      { m: 'Mixolydian', b: 2, c: [[0, '7'], [5, '7'], [10, 'M'], [5, '7']] }],
    cine: [
      { m: 'Aeolian', b: 2, c: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']] },
      { m: 'Aeolian', b: 2, c: [[0, 'm'], [3, 'M'], [8, 'M'], [10, 'M']] },
      { m: 'Aeolian', b: 2, c: [[0, 'm'], [0, 'm'], [8, 'M'], [7, 'M']] },
      { m: 'Lydian', b: 2, c: [[0, 'M'], [2, 'M'], [0, 'M'], [4, 'm']] },
      { m: 'Dorian', b: 2, c: [[0, 'm'], [10, 'M'], [5, 'M'], [10, 'M']] }],
    techno: [
      { m: 'Phrygian', b: 2, c: [[0, 'm7'], [0, 'm7'], [0, 'm7'], [1, 'maj7']] },
      { m: 'Aeolian', b: 2, c: [[0, 'm7'], [0, 'm7'], [10, 'M'], [0, 'm7']] },
      { m: 'Dorian', b: 4, c: [[0, 'm9'], [5, 'm7'], [0, 'm9'], [10, 'maj7']] }],
    garage: [
      { m: 'Dorian', b: 1, c: [[0, 'm9'], [5, '9'], [3, 'maj7'], [10, 'maj9']] },
      { m: 'Aeolian', b: 1, c: [[0, 'm7'], [8, 'maj7'], [10, 'maj7'], [7, 'm7']] },
      { m: 'Ionian', b: 1, c: [[0, 'maj9'], [2, 'm9'], [5, 'maj7'], [7, '13']] }],
    prog: [
      { m: 'Lydian', b: 1, c: [[0, 'maj7#11'], [2, '9'], [0, 'maj7#11'], [4, 'm7']] },
      { m: 'Dorian', b: 1, c: [[0, 'm7'], [3, 'maj7'], [8, 'maj7'], [10, '7']] },
      { m: 'Phrygian', b: 1, c: [[0, 'm9'], [1, 'maj7'], [10, 'm7'], [8, 'maj7']] }]
  };

  // ---------- voice leading ----------
  function chordInfo(rootPc, q) {
    const iv = QUAL[q] || QUAL.M;
    return { root: ((rootPc % 12) + 12) % 12, q, iv, pcs: iv.map(x => (((rootPc + x) % 12) + 12) % 12) };
  }
  function voiceChord(ch, prev, lo, hi, maxN) {
    let pcs = ch.pcs.slice();
    if (pcs.length > maxN) { // drop the fifth first, then others
      const fi = ch.iv.indexOf(7); if (fi > 0) pcs.splice(fi, 1);
      while (pcs.length > maxN) pcs.splice(pcs.length - 1, 1);
    }
    const cands = pcs.map(pc => { const a = []; for (let m = lo; m <= hi; m++) if (m % 12 === pc) a.push(m); return a; });
    let best = null, bestCost = 1e9;
    const cur = [];
    (function rec(i) {
      if (i === cands.length) {
        const s = cur.slice().sort((a, b) => a - b);
        let cost = 0;
        if (prev && prev.length) { for (let k = 0; k < s.length; k++) { const pp = prev[Math.min(prev.length - 1, Math.round(k * (prev.length - 1) / Math.max(1, s.length - 1)))]; cost += Math.abs(s[k] - pp) * 1.2; } }
        else cost += Math.abs((s[0] + s[s.length - 1]) / 2 - (lo + hi) / 2) * 2;
        const span = s[s.length - 1] - s[0]; cost += Math.max(0, span - 14) * 3 + (span < 5 ? 6 : 0);
        for (let k = 1; k < s.length; k++) if (s[k] - s[k - 1] < 2) cost += 8 ; // avoid clusters
        if (s[0] < lo + 1 && !prev) cost += 3;
        if (cost < bestCost) { bestCost = cost; best = s; }
        return;
      }
      for (const m of cands[i]) { cur[i] = m; rec(i + 1); }
    })(0);
    return best || pcs.map((p, i) => lo + p + 12 * (i > 2 ? 1 : 0));
  }

  // ---------- drum sets (16 = sixteenth grid; 12 = triplet / 6-8) ----------
  // chars: x normal, X accent, o soft/ghost, r=2 hits, t=3 hits, q=4 hits in the step
  const DRUMS = {
    lofi: { kit: 'lofi', sets: [
      { k: 'x.....x..x.x....', s: '....x.......x...', h: 'x.o.x.o.x.o.x.o.', oh: '..............o.', rim: '.......o.......o' },
      { k: 'x..x....x.x.....', s: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', oh: '......o.........' },
      { k: 'x.....x...x..x..', s: '....x.......x...', h: 'x.o.x.oox.o.x.o.', oh: '..............o.', rim: '...o...o...o...o' }] },
    house: { kit: 'punch', sets: [
      { k: 'x...x...x...x...', s: '....x.......x...', sn: 'clap', h: 'oxoxoxoxoxoxoxox', oh: '..x...x...x...x.', rim: '.......x.....x.x' },
      { k: 'x...x...x...x...', s: '....x.......x...', sn: 'clap', h: 'x.x.x.x.x.x.x.x.', oh: '..x...x...x...x.', perc: [{ n: 'shaker', p: 'oxoxoxoxoxoxoxox', v: .5 }] }] },
    techno: { kit: 'tech', sets: [
      { k: 'x...x...x...x...', s: '....x.......x...', sn: 'clap', h: 'o.x.o.x.o.x.o.x.', oh: '..x...x...x...x.', rim: 'x..x..x..x..x..x', perc: [{ n: 'cow', p: '.......x.....o..', v: .3 }] },
      { k: 'x...x...x...x...', s: '............x...', sn: 'clap', h: 'xoxoxoxoxoxoxoxo', oh: '..x...x...x...x.', rim: '..x..x..x..x..x.' }] },
    dnb: { kit: 'dnb', sets: [
      { k: 'x.........x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', oh: '......x.......x.', ghost: [7, 9, 14, 15], alt: { k: 'x.........x.....', s: '........x.......' } },
      { k: 'x.........x...x.', s: '....x.......x...', h: 'x.xoxox.x.xoxox.', oh: '..x.......x.....', ghost: [3, 7, 15], alt: { k: 'x...............', s: '........x.......' } },
      { k: 'x.x.......x.....', s: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', oh: '......x.......x.', ghost: [9, 11, 14], alt: { k: 'x.......x.......', s: '........x.......' } }] },
    wave: { kit: 'gated', sets: [
      { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', oh: '..............x.' },
      { k: 'x.......x.......', s: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', oh: '..x.......x.....' },
      { k: 'x..x..x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', oh: '' }] },
    dub: { kit: 'deep', sets: [
      { k: '........x.......', s: '........x.......', sn: 'rim', h: 'o.x.o.x.o.x.o.x.', oh: '', rim: '', ghost: [] },
      { k: 'x...x...x...x...', s: '........x.......', sn: 'rim', h: 'x.x.x.x.x.x.x.x.', oh: '..............x.' },
      { k: 'x.......x.......', s: '....x.......x...', sn: 'rim', h: 'o.x.o.x.o.x.o.x.', oh: '..x.......x.....' }] },
    trap: { kit: '808', sets: [
      { k: 'x.....x...x.....', s: '........x.......', sn: 'both', h: 'x.x.x.x.x.xtx.qx', oh: '......x.......x.' },
      { k: 'x..x..x.x.......', s: '........x.......', sn: 'both', h: 'x.xrx.x.xrx.xtxt', oh: '..............x.' },
      { k: 'x.......x.x..x..', s: '........x.......', sn: 'clap', h: 'xxxxxxxxxxxxxtxq', oh: '......x.' }] },
    jazz: { kit: 'jazz', steps: 12, sets: [
      { k: 'x..x..x..x..', kv: .35, ride: 'x..x.xx..x.x', foot: '...x.....x..', comp: [2, 5, 8, 11] },
      { k: 'x.....x.....', kv: .3, ride: 'x..x.xx..x.x', foot: '...x.....x..', comp: [5, 8, 11] }] },
    chip: { kit: 'chip', sets: [
      { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', oh: '..............x.' },
      { k: 'x..x..x.x..x....', s: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', oh: '' },
      { k: 'x.x...x.x.x...x.', s: '....x.......xx..', h: 'x.x.x.x.x.x.x.xx', oh: '' }] },
    afro: { kit: 'afro', steps: 12, sets: [
      { k: 'x.....x.....', s: '...x.....x..', sn: 'rim', bell: 'x.x.xx.x.x.x', perc: [{ n: 'congaH', p: '..x.xx..x.xx', v: .6 }, { n: 'congaL', p: 'x..x..x.....', v: .55 }, { n: 'shaker', p: 'xoxoxoxoxoxo', v: .5 }] },
      { k: 'x..x..x.....', s: '.....x.....x', sn: 'clap', bell: 'x.x.xx.x.x.x', perc: [{ n: 'wood', p: 'x...x...x...', v: .5 }, { n: 'congaH', p: '.xx.x..xx.x.', v: .55 }, { n: 'shaker', p: 'xxxxxxxxxxxx', v: .45 }] }] },
    cine: { kit: 'cine', sets: [
      { k: 'x.......x.x.....', s: '........x.......', sn: 'both', h: '', oh: '', perc: [{ n: 'tomL', p: 'x.......x.x.....', v: .9 }, { n: 'tomM', p: '..............x.', v: .6 }] },
      { k: 'x...............', s: '........x.......', sn: 'both', h: '', oh: '', perc: [{ n: 'tomL', p: 'x.......x.......', v: .9 }, { n: 'tomH', p: '....x.......x...', v: .5 }] }] },
    cine6: { kit: 'cine', steps: 12, sets: [
      { k: 'x.....x.....', s: '......x.....', sn: 'both', h: '', oh: '', perc: [{ n: 'tomL', p: 'x.....x..x..', v: .9 }, { n: 'tomH', p: '..x...x.x...', v: .45 }] }] },
    garage: { kit: 'deep', sets: [
      { k: 'x.........x.....', s: '....x.......x...', sn: 'both', h: 'x.xxx.xxx.xxx.xx', oh: '..x.......x.....', ghost: [7, 13, 15], rim: '...........o...o' },
      { k: 'x.......x.x.....', s: '....x.......x...', sn: 'clap', h: 'x.x.x.xxx.x.x.xx', oh: '......x.......x.', ghost: [7, 15] }] }
  };
  DRUMS.ride = null;

  // generated odd-meter drums (7/8 etc) from groups
  function oddDrums(r, steps, groups) {
    const starts = []; let a = 0; groups.forEach(gp => { starts.push(a); a += gp; });
    const mk = () => new Array(steps).fill('.');
    const k = mk(), s = mk(), h = mk(), oh = mk(), rim = mk();
    starts.forEach((st, i) => { if (i === 0 || i === starts.length - 1 || chance(r, .4)) k[st] = 'x'; else s[st] = 'x'; });
    if (!s.includes('x')) s[starts[1]] = 'x';
    for (let i = 0; i < steps; i += 2) h[i] = i % 4 === 0 ? 'x' : 'o';
    if (chance(r, .5)) h[steps - 1] = 'o';
    oh[starts[starts.length - 1] + 2] = chance(r, .6) ? 'x' : '.';
    rim[starts[1] + groups[1] - 1] = 'o';
    return { kit: pick(r, ['tech', 'punch', 'dnb']), sets: [{ k: k.join(''), s: bump(s.join('')), h: h.join(''), oh: oh.join(''), rim: rim.join(''), sn: pick(r, ['snare', 'both', 'clap']) }] };
  }
  function bump(x) { return x; }

  // ---------- bass pattern libs: chars r o 5 3 b 4 s n (approach), '-' hold, '.' rest, 'g' = slide from previous ----------
  const BASSP = {
    sub: { 16: ['r-----..r--.5---', 'r---..r-..r-.o..', 'r.......r-5-....', 'r--.r--.r-----5.'], 12: ['r-----......', 'r--..5..r...'] },
    dubsub: { 16: ['r---..r---5.....', 'r-----..r-.5....', 'r--.r-.-r-5.....', '....r-----..5---'], 12: ['r-----r-....'] },
    '808': { 16: ['r-------..r-----', 'r-----r-..5-....', 'r--.r---r-----o-', 'r-----..g--.r---'], 12: ['r-----.-r---'] },
    reese: { 16: ['r-------r--.5---', 'r-----..r-----.-', 'r---..r-..r---o-', 'r--.-.r-----5-n-'], 12: ['r-----r-----'] },
    acid: { 16: ['r.rr.r.or.rr.5.o', 'r.r.rgr.o.r.rgo.', 'rr.r.r.or..r.5r.', 'r.or.r.gr.o.rr.5'], 12: ['r.rr.or.5.or'] },
    funk: { 16: ['r..r..r.r.5..o..', 'r.-.r.5.-.r.o.5.', 'r..o..r.5.b.r.n.', 'r-.r..5.r..b.o..'], 12: ['r..r.5r..b.n', 'r.-.o.r.5.b.'] },
    pump: { 16: ['..r...r...r...r.', '.rr..rr..rr..rr.', '..r..or...r..or.', '..r...r...r.5.r.'], 12: ['.r..r..r..r.'] },
    pulse: { 16: ['r.r.r.r.r.r.r.r.', 'r.rrr.r.r.rrr.r.', 'r.o.r.o.r.o.r.o.', 'r.rrr.o.r.rrr.5.'], 12: ['r.r.r.r.r.r.'] },
    chip: { 16: ['r.5.o.5.r.5.o.5.', 'r.r.5.5.o.o.5.5.', 'r.o.5.o.r.o.5.n.'], 12: ['r.5.o.5.r.5.'] },
    fm: { 16: ['r--.r-.5--r-.o--', 'r-.-r-.-5-.-r-n-', 'r.r-..5-r.r-..o-'], 12: ['r--r--5--b-.'] },
    drone: { 16: ['r---------------', 'r-------5-------', 'r-------------n-'], 12: ['r-----------'] }
  };

  // ---------- families ----------
  // steps/grid: 16 = sixteenth grid, 12 = triplet grid (4 beats)
  const FAM = {
    lofi: { id: 'lofi', tag: 'Lo-fi', bpm: [68, 92], swing: [.2, .38], steps: 16, grid: 16, drum: 'lofi', arc: 'chill', progs: ['lofiMin', 'lofiMaj'],
      bass: { kind: 'sub', pats: BASSP.sub }, comp: { kinds: ['rhodes', 'rhodes', 'epiano'], pats: { 16: ['x-....x-.x-.....', 'x--...x...x-....', 'x-..x-..x-.....-', '..x-....x--.x...'], 12: ['x--..x......'] }, vel: .75 },
      pad: { kinds: ['glass', 'strings', null] }, lead: { kinds: ['sine', 'kalimba', 'flute', 'epiano'], oct: 0, style: 'sparse' }, arp: { kinds: ['kalimba', null], rate: 2 },
      tex: 'crackle', verb: { sec: 1.6, dark: .7, lvl: .28 }, delay: { div: .75, lvl: .18 }, duck: .0, sat: .5, width: 1.1, cut: .6, vibe: 'warm' },
    house: { id: 'house', tag: 'House', bpm: [118, 128], swing: [0, .1], steps: 16, grid: 16, drum: 'house', arc: 'club', progs: ['houseA'],
      bass: { kind: 'pump', pats: BASSP.pump }, comp: { kinds: ['stab', 'epiano', 'brass'], pats: { 16: ['x..x..x...x..x..', '..x...x...x...x.', 'x.x..x..x.x..x..', 'x--.x--.x--.x...'], 12: ['x.x.x.x.x.x.'] }, vel: .8 },
      pad: { kinds: ['supersaw', 'strings', 'glass'] }, lead: { kinds: ['pluck', 'saw', 'bell', 'epiano'], oct: 0, style: 'hook' }, arp: { kinds: ['pluck', null], rate: 1 },
      tex: 'air', verb: { sec: 1.4, dark: .4, lvl: .22 }, delay: { div: .75, lvl: .3 }, duck: .55, sat: .35, width: 1.3, cut: .75, vibe: 'neon' },
    dnb: { id: 'dnb', tag: 'Jungle', bpm: [164, 170], swing: [0, .04], steps: 16, grid: 16, drum: 'dnb', arc: 'club', progs: ['dnb'],
      bass: { kind: 'reese', pats: BASSP.reese }, comp: { kinds: ['pluckchord', 'epiano', 'stab'], pats: { 16: ['x-.....-x-......', '..x-......x-....', 'x-......x-.x....'], 12: ['x--.....x...'] }, vel: .7 },
      pad: { kinds: ['strings', 'glass', 'supersaw'] }, lead: { kinds: ['saw', 'flute', 'fm', 'bell'], oct: 0, style: 'melodic' }, arp: { kinds: ['bell', 'pluck', null], rate: 1 },
      tex: 'air', verb: { sec: 1.8, dark: .5, lvl: .25 }, delay: { div: .75, lvl: .25 }, duck: .3, sat: .45, width: 1.2, cut: .8, vibe: 'ice' },
    wave: { id: 'wave', tag: 'Wave', bpm: [90, 118], swing: [0, .02], steps: 16, grid: 16, drum: 'wave', arc: 'club', progs: ['wave'],
      bass: { kind: 'pulse', pats: BASSP.pulse }, comp: { kinds: ['brass', 'stab', 'supersaw'], pats: { 16: ['x---------------', 'x-.-x-.-x-.-x-.-', 'x-----..x-----..'], 12: ['x-----------'] }, vel: .6 },
      pad: { kinds: ['supersaw', 'strings'] }, lead: { kinds: ['saw', 'saw', 'pluck', 'fm'], oct: 0, style: 'hook' }, arp: { kinds: ['saw', 'pluck'], rate: .5 },
      tex: null, verb: { sec: 2.6, dark: .45, lvl: .42 }, delay: { div: .75, lvl: .35 }, duck: .2, sat: .45, width: 1.55, cut: .85, vibe: 'neon' },
    ambient: { id: 'ambient', tag: 'Ambient', bpm: [60, 80], swing: [0, 0], steps: 16, grid: 16, drum: null, arc: 'ambi', progs: ['ambient'],
      bass: { kind: 'drone', pats: BASSP.drone }, comp: { kinds: ['bellpad', 'glass'], pats: { 16: ['x---------------', '....x-----------', 'x-------....x---'], 12: ['x-----------'] }, vel: .5 },
      pad: { kinds: ['strings', 'glass', 'supersaw'] }, lead: { kinds: ['sine', 'flute', 'bell'], oct: 0, style: 'long' }, arp: { kinds: ['bell', 'kalimba'], rate: 4 },
      tex: 'air', verb: { sec: 4.6, dark: .5, lvl: .55 }, delay: { div: 1, lvl: .4 }, duck: 0, sat: .1, width: 1.7, cut: .45, vibe: 'space' },
    dub: { id: 'dub', tag: 'Dub', bpm: [64, 78], swing: [0, .1], steps: 16, grid: 16, drum: 'dub', arc: 'chill', progs: ['dub'],
      bass: { kind: 'sub', pats: BASSP.dubsub }, comp: { kinds: ['organ', 'organ', 'epiano'], pats: { 16: ['..x...x...x...x.', '..x...x...x...x.', '....x.......x...'], 12: ['..x..x..x..x'] }, vel: .7 },
      pad: { kinds: ['glass', null] }, lead: { kinds: ['flute', 'bell', 'sine'], oct: 0, style: 'sparse' }, arp: { kinds: [null], rate: 2 },
      tex: 'air', verb: { sec: 1.1, dark: .6, lvl: .3 }, delay: { div: .75, lvl: .62, fb: .62 }, duck: .1, sat: .4, width: 1.2, cut: .55, vibe: 'warm' },
    trap: { id: 'trap', tag: 'Trap', bpm: [132, 150], swing: [0, .05], steps: 16, grid: 16, drum: 'trap', arc: 'club', progs: ['trap'],
      bass: { kind: '808', pats: BASSP['808'] }, comp: { kinds: ['bellpad', 'epiano', 'glass'], pats: { 16: ['x-------x-------', 'x-----..x---x-..', 'x---------x-....'], 12: ['x-----x-----'] }, vel: .55 },
      pad: { kinds: ['strings', 'glass', 'supersaw'] }, lead: { kinds: ['bell', 'sine', 'flute', 'kalimba'], oct: 12, style: 'sparse' }, arp: { kinds: ['bell', 'kalimba'], rate: 1 },
      tex: 'air', verb: { sec: 2.2, dark: .6, lvl: .3 }, delay: { div: .75, lvl: .3 }, duck: .15, sat: .5, width: 1.25, cut: .65, vibe: 'grit' },
    jazz: { id: 'jazz', tag: 'Jazz', bpm: [96, 150], swing: [0, 0], steps: 12, grid: 12, drum: 'jazz', arc: 'chill', progs: ['jazz'],
      bass: { kind: 'walk', walk: true, pats: BASSP.sub }, comp: { kinds: ['epiano', 'rhodes'], pats: { 12: ['x--..x......', 'x.....x--...', '..x--.....x.', 'x--.....x...'], 16: ['x-....x-.x-.....'] }, vel: .7 },
      pad: { kinds: [null, 'glass'] }, lead: { kinds: ['flute', 'epiano', 'kalimba', 'sine'], oct: 0, style: 'bebop' }, arp: { kinds: [null], rate: 1 },
      tex: 'crackle', verb: { sec: 1.0, dark: .5, lvl: .2 }, delay: { div: .5, lvl: .12 }, duck: 0, sat: .25, width: 1.1, cut: .6, vibe: 'warm' },
    chip: { id: 'chip', tag: 'Arcade', bpm: [125, 162], swing: [0, .03], steps: 16, grid: 16, drum: 'chip', arc: 'club', progs: ['chip'],
      bass: { kind: 'chip', pats: BASSP.chip }, comp: { kinds: ['pulse'], pats: { 16: ['x.x.x.x.x.x.x.x.', 'x-x-x-x-x-x-x-x-', 'x..x..x.x..x..x.'], 12: ['x.x.x.x.x.x.'] }, vel: .55 },
      pad: { kinds: [null, 'pulse'] }, lead: { kinds: ['chip', 'chip', 'pluck'], oct: 0, style: 'busy' }, arp: { kinds: ['chip'], rate: .5 },
      tex: null, verb: { sec: .6, dark: .3, lvl: .08 }, delay: { div: .75, lvl: .22 }, duck: .08, sat: .1, width: .8, cut: 1, vibe: 'neon' },
    afro: { id: 'afro', tag: 'Afro', bpm: [98, 118], swing: [0, 0], steps: 12, grid: 12, drum: 'afro', arc: 'chill', progs: ['afro'],
      bass: { kind: 'funk', pats: BASSP.funk }, comp: { kinds: ['pluckchord', 'brass', 'epiano'], pats: { 12: ['x.xx.xx.x.xx', 'x.x.xx.x.x.x', 'x..x.xx..x.x', 'xx.x.xx.x.x.'], 16: ['x..x..x.x..x..x.'] }, vel: .65 },
      pad: { kinds: [null, 'organ'] }, lead: { kinds: ['kalimba', 'brass', 'flute', 'epiano'], oct: 0, style: 'melodic' }, arp: { kinds: ['kalimba', 'pluck'], rate: 1 },
      tex: null, verb: { sec: 1.2, dark: .4, lvl: .2 }, delay: { div: .75, lvl: .25 }, duck: .0, sat: .3, width: 1.2, cut: .75, vibe: 'warm' },
    cine: { id: 'cine', tag: 'Cinematic', bpm: [66, 104], swing: [0, 0], steps: 16, grid: 16, drum: 'cine', arc: 'club', progs: ['cine'],
      bass: { kind: 'drone', pats: BASSP.drone }, comp: { kinds: ['strings', 'pluckchord'], pats: { 16: ['x.x.x.x.x.x.x.x.', 'x..x..x.x..x..x.', 'x.xxx.xxx.xxx.xx'], 12: ['x.x.x.x.x.x.'] }, vel: .55, stacc: 1 },
      pad: { kinds: ['strings', 'strings', 'brass'] }, lead: { kinds: ['brass', 'flute', 'sine', 'bell'], oct: 0, style: 'long' }, arp: { kinds: ['bell', 'pluck'], rate: 1 },
      tex: 'air', verb: { sec: 3.6, dark: .5, lvl: .45 }, delay: { div: .75, lvl: .22 }, duck: .1, sat: .25, width: 1.6, cut: .7, vibe: 'space' },
    techno: { id: 'techno', tag: 'Techno', bpm: [128, 146], swing: [0, .05], steps: 16, grid: 16, drum: 'techno', arc: 'club', progs: ['techno'],
      bass: { kind: 'acid', pats: BASSP.acid }, comp: { kinds: ['stab', 'organ'], pats: { 16: ['..x...x...x...x.', 'x..x..x...x..x..', '.x..x..x.x..x...'], 12: ['x.x.x.x.x.x.'] }, vel: .6 },
      pad: { kinds: ['strings', 'glass'] }, lead: { kinds: ['pluck', 'saw', 'fm'], oct: 0, style: 'busy' }, arp: { kinds: ['pluck', 'saw'], rate: 1 },
      tex: 'air', verb: { sec: 1.9, dark: .6, lvl: .26 }, delay: { div: .75, lvl: .34 }, duck: .5, sat: .6, width: 1.2, cut: .65, vibe: 'grit' },
    garage: { id: 'garage', tag: '2-Step', bpm: [128, 136], swing: [.24, .38], steps: 16, grid: 16, drum: 'garage', arc: 'club', progs: ['garage'],
      bass: { kind: 'fm', pats: BASSP.fm }, comp: { kinds: ['pluckchord', 'epiano', 'stab'], pats: { 16: ['x..x..x...x.x...', 'x-..x-..x..x....', '..x..x..x...x.x.'], 12: ['x..x..x..x..'] }, vel: .65 },
      pad: { kinds: ['glass', 'strings'] }, lead: { kinds: ['pluck', 'flute', 'epiano', 'bell'], oct: 0, style: 'hook' }, arp: { kinds: ['pluck', null], rate: 1 },
      tex: 'crackle', verb: { sec: 1.5, dark: .5, lvl: .28 }, delay: { div: .75, lvl: .3 }, duck: .35, sat: .35, width: 1.25, cut: .7, vibe: 'neon' },
    prog: { id: 'prog', tag: 'Odd-Time', bpm: [108, 140], swing: [0, .04], steps: 14, grid: 16, drum: 'odd', arc: 'club', progs: ['prog'], odd: true,
      bass: { kind: 'fm', pats: BASSP.fm }, comp: { kinds: ['pluckchord', 'kalimba', 'epiano'], pats: {}, vel: .65 },
      pad: { kinds: ['glass', 'strings'] }, lead: { kinds: ['kalimba', 'fm', 'saw', 'flute'], oct: 0, style: 'melodic' }, arp: { kinds: ['kalimba', 'pluck'], rate: 1 },
      tex: 'air', verb: { sec: 1.8, dark: .5, lvl: .28 }, delay: { div: .75, lvl: .3 }, duck: .25, sat: .35, width: 1.3, cut: .75, vibe: 'ice' }
  };
  const ADJ = [['Glacier', 'ice'], ['Neon', 'neon'], ['Velvet', 'warm'], ['Cosmic', 'space'], ['Rust', 'grit'], ['Lunar', 'space'], ['Jelly', 'warm'], ['Chrome', 'neon'],
    ['Moss', 'warm'], ['Static', 'grit'], ['Sunken', 'ice'], ['Hyper', 'neon'], ['Paper', 'ice'], ['Amber', 'warm'], ['Cobalt', 'ice'], ['Feral', 'grit'], ['Plasma', 'neon'],
    ['Midnight', 'space'], ['Pixel', 'neon'], ['Tidal', 'ice'], ['Solar', 'warm'], ['Gravel', 'grit'], ['Orchid', 'warm'], ['Quantum', 'space']];
  const MID = ['Monk', 'Lizard', 'Tiger', 'Cathedral', 'Robot', 'Jungle', 'Pirate', 'Orbit', 'Cactus', 'Sphinx', 'Samurai', 'Kraken', 'Penguin', 'Wizard', 'Ghost', 'Falcon'];
  const HUE = { ice: 190, neon: 320, warm: 25, space: 265, grit: 100 };

  function inventGenre(seed, force) {
    const r = rng(Math.imul(seed ^ 0x9e3779b9, 2654435761) >>> 0); r(); r(); r();
    const ids = Object.keys(FAM);
    const A = FAM[(force && force[0]) || pick(r, ids)];
    let B = A, C = null;
    if (chance(r, force ? 1 : .78)) { const others = ids.filter(i => i !== A.id && !(A.arc === 'ambi' && FAM[i].drum === null)); B = FAM[(force && force[1]) || pick(r, others)]; }
    if (chance(r, .2)) C = FAM[pick(r, ids)];
    const L = chance(r, .5) ? B : A; // who donates "colour"
    const H = chance(r, .55) ? B : A; // who donates harmony
    const [adj, vibe0] = pick(r, ADJ);
    const vibe = chance(r, .6) ? A.vibe : vibe0;
    const steps = A.steps, grid = A.grid;
    let groups;
    if (A.odd) groups = pick(r, [[4, 4, 6], [6, 4, 4], [4, 6, 4]]);
    else if (steps === 12 && grid === 12) groups = [3, 3, 3, 3];
    else if (steps === 12) groups = [6, 6];
    else groups = [4, 4, 4, 4];
    // cinematic may go 6/8
    let drumKey = A.drum, meterName = steps === 16 ? '4/4' : steps === 14 ? '7/8' : grid === 12 ? '12/8' : '6/8';
    if (A.id === 'cine' && chance(r, .3)) { drumKey = 'cine6'; groups = [6, 6]; meterName = '6/8'; }
    const stepsG = drumKey === 'cine6' ? 12 : steps, gridG = drumKey === 'cine6' ? 16 : grid;
    let drums = null;
    if (drumKey) drums = drumKey === 'odd' ? oddDrums(r, stepsG, groups) : DRUMS[drumKey];
    if (A.id === 'jazz') meterName = '4/4 swing';
    const prName = pick(r, H.progs), progs = PR[prName];
    let prog = pick(r, progs);
    const mode = prog.m, bpm = Math.round(rnd(r, A.bpm[0], A.bpm[1]));
    const root = Math.floor(r() * 12);
    const bpick = (chance(r, .7) || (B.bass.kind === 'drone' && A.drum)) ? A : B;
    const usePat = (src, n) => src && src[n] && src[n].length;
    const barStepsOK = (bpick.bass.pats && bpick.bass.pats[stepsG]);
    const bass = { kind: bpick.bass.kind, walk: !!bpick.bass.walk, pats: barStepsOK ? bpick.bass.pats[stepsG] : null };
    if (bass.walk && stepsG !== 12 && stepsG !== 16) bass.walk = false;
    const cmp = L.comp, ck = pick(r, cmp.kinds);
    const comp = { kind: ck, pats: cmp.pats[stepsG] || null, vel: cmp.vel, stacc: !!cmp.stacc };
    const pk = pick(r, (chance(r, .5) ? L : A).pad.kinds);
    const ld = (chance(r, .6) ? L : (C || A)).lead;
    const leadKind = pick(r, ld.kinds);
    const arpSrc = (chance(r, .5) ? L : (C || A)).arp;
    const arpKind = pick(r, arpSrc.kinds);
    const tex = (chance(r, .6) ? A : (C || B)).tex;
    const fxs = chance(r, .5) ? A : B;
    const g = {
      seed, name: '', family: A === B ? A.tag : A.tag + ' × ' + B.tag, famIds: [A.id, B.id, C && C.id], vibe,
      hue: (HUE[vibe] + rnd(r, -25, 25) + 360) % 360,
      bpm, grid: gridG, steps: stepsG, groups, meterName, swing: gridG === 12 ? 0 : rnd(r, A.swing[0], A.swing[1]) * (B !== A && chance(r, .3) ? 1.3 : 1),
      mode, scaleName: mode, scale: MODES[mode], root, key: KEYS[root], progName: prName, prog, progs,
      drums, kit: drums ? drums.kit : null, arc: A.arc === 'ambi' || B.arc === 'ambi' && chance(r, .3) ? 'ambi' : (chance(r, .2) && A.arc !== 'ambi' ? (A.arc === 'club' ? 'chill' : 'club') : A.arc),
      bass, comp, pad: { kind: pk }, lead: { kind: leadKind, oct: ld.oct + (chance(r, .2) ? 12 : 0), style: pick(r, [ld.style, ld.style, A.lead.style]) }, arp: { kind: arpKind, rate: arpSrc.rate },
      tex, verb: { sec: fxs.verb.sec * rnd(r, .8, 1.25), dark: fxs.verb.dark, lvl: Math.min(.7, fxs.verb.lvl * rnd(r, .8, 1.2)) },
      delay: { div: pick(r, [fxs.delay.div, fxs.delay.div, .75, 1, .5]), lvl: fxs.delay.lvl * rnd(r, .8, 1.2), fb: fxs.delay.fb || rnd(r, .32, .5) },
      duck: Math.max(A.duck, B === A ? 0 : B.duck * .6) * (A.drum ? 1 : 0), sat: (A.sat + B.sat) / 2, width: (A.width + B.width) / 2, cut: (A.cut + B.cut) / 2,
      leadOct: 0, motifSeed: Math.floor(r() * 1e9), engSeed: Math.floor(r() * 1e9), hybrid: A !== B
    };
    if (g.arc === 'ambi' && !(A.arc === 'ambi')) g.arc = 'chill';
    if (A.arc === 'ambi') g.arc = 'ambi';
    let name = adj + ' ';
    if (chance(r, .5)) name += pick(r, MID) + ' ';
    name += B !== A ? B.tag + ' ' + A.tag : A.tag;
    g.name = name.split(' ').filter((w, i, a) => a.indexOf(w) === i).join(' ');
    g.alt = chance(r, .5);
    return g;
  }

  // ---------- motifs ----------
  const STYLE = {
    sparse: { n: [4, 6], lens: [2, 3, 4, 6], leap: .12, sync: .4 }, melodic: { n: [7, 10], lens: [1, 2, 2, 3, 4], leap: .18, sync: .5 },
    busy: { n: [12, 18], lens: [1, 1, 2], leap: .15, sync: .5 }, long: { n: [2, 4], lens: [6, 8, 12], leap: .2, sync: .2 },
    hook: { n: [6, 9], lens: [2, 3, 4], leap: .18, sync: .6 }, bebop: { n: [10, 14], lens: [1, 1, 2], leap: .1, sync: .55 }
  };
  function stepWeight(g, pos) {
    const p = pos % g.steps; let a = 0, w = .22;
    for (let i = 0; i < g.groups.length; i++) { if (p === a) return 1; a += g.groups[i]; }
    if (g.grid === 12 && g.steps === 12 && g.groups.length === 4) { if (p % 3 === 2) return .55; return .3; }
    if (p % 2 === 0) w = .55;
    if (g.grid === 16 && p % 4 === 2) w = .7;
    return w;
  }
  function genMotif(r, g, styleName) {
    const st = STYLE[styleName] || STYLE.melodic, total = g.steps * 2;
    const scaleN = total / 32;
    const count = Math.max(2, Math.round(rnd(r, st.n[0], st.n[1]) * scaleN));
    const pos = new Set([0]);
    let guard = 0;
    while (pos.size < count && guard++ < 400) {
      const s = Math.floor(r() * total), w = stepWeight(g, s);
      if (r() < w * (st.sync + (1 - st.sync) * (w > .9 ? 1 : 0))) pos.add(s);
    }
    const sorted = [...pos].sort((a, b) => a - b);
    const n = g.scale.length;
    let d = pick(r, [0, 2, 4, 7, 4, 2]); const notes = [];
    sorted.forEach((s, i) => {
      if (i) {
        const u = r();
        let mv = u < .3 ? 1 : u < .55 ? -1 : u < .7 ? 2 : u < .85 ? -2 : (r() < .5 ? 1 : -1) * (3 + Math.floor(r() * 2));
        if (r() < st.leap * .5) mv = (r() < .5 ? -1 : 1) * 4;
        if (d > 9) mv = -Math.abs(mv); if (d < -1) mv = Math.abs(mv);
        d += mv;
      }
      const next = sorted[i + 1] == null ? total : sorted[i + 1];
      const maxL = pick(r, st.lens);
      notes.push({ s, l: Math.max(1, Math.min(maxL, next - s)), d, v: stepWeight(g, s) > .9 ? 1 : .75 });
    });
    // question/answer shape: end of first half hangs, end resolves to a chord tone
    const half = notes.filter(x => x.s < g.steps), second = notes.filter(x => x.s >= g.steps);
    if (half.length) half[half.length - 1].d = nearest(half[half.length - 1].d, [1, 3, 5, 8, 10]);
    if (second.length) second[second.length - 1].d = nearest(second[second.length - 1].d, [0, 2, 4, 7]);
    return { notes, total };
  }
  function nearest(d, set) { let best = set[0], bd = 99; set.forEach(x => { const dd = Math.abs(x - d); if (dd < bd) { bd = dd; best = x; } }); return best; }
  const clone = m => ({ total: m.total, notes: m.notes.map(x => Object.assign({}, x)) });
  function develop(m, kind, r, g) {
    const o = clone(m), N = o.notes;
    if (!N.length) return o;
    switch (kind) {
      case 'seq': { const sft = pick(r, [1, 2, -1, -2, 2]); N.forEach(x => x.d += sft); break; }
      case 'inv': { const c = N[0].d; N.forEach(x => x.d = c - (x.d - c)); N[N.length - 1].d = nearest(N[N.length - 1].d, [0, 2, 4, 7]); break; }
      case 'ret': { const ds = N.map(x => x.d).reverse(); N.forEach((x, i) => x.d = ds[i]); break; }
      case 'oct': N.forEach(x => x.d += 7); break;
      case 'ans': { const k = Math.max(1, Math.floor(N.length / 3)); for (let i = N.length - k; i < N.length; i++) N[i].d += pick(r, [-2, -1, 1, 2]); N[N.length - 1].d = nearest(N[N.length - 1].d, [0, 2, 4, 7]); break; }
      case 'frag': { const h = Math.max(2, Math.ceil(N.length / 2)); const part = N.slice(0, h); o.notes = part.concat(part.map(x => Object.assign({}, x, { s: x.s + g.steps, d: x.d + 1 })).filter(x => x.s < o.total)); break; }
      case 'rot': { const sh = pick(r, [1, 2]); N.forEach(x => x.s = (x.s + sh) % o.total); o.notes.sort((a, b) => a.s - b.s); break; }
      case 'orn': { const add = []; for (let i = 0; i < N.length - 1; i++) { const gap = N[i + 1].s - (N[i].s + N[i].l); if (gap >= 1 && Math.abs(N[i + 1].d - N[i].d) >= 2 && r() < .6) add.push({ s: N[i].s + N[i].l, l: 1, d: N[i].d + Math.sign(N[i + 1].d - N[i].d), v: .6 }); } o.notes = N.concat(add).sort((a, b) => a.s - b.s); break; }
      case 'aug': { o.notes = N.filter((x, i) => i % 2 === 0).map(x => Object.assign({}, x, { l: x.l * 2 })); break; }
    }
    return o;
  }
  function mutateMotif(m, r, g) {
    const N = m.notes; if (!N.length) return;
    const i = Math.floor(r() * N.length), u = r();
    if (u < .5) N[i].d += pick(r, [-2, -1, 1, 2]);
    else if (u < .7 && N.length > 3) N.splice(i, 1);
    else { const s = Math.floor(r() * m.total); if (!N.some(x => x.s === s)) { N.push({ s, l: 1 + Math.floor(r() * 2), d: N[i].d + pick(r, [-1, 1, 2]), v: .7 }); N.sort((a, b) => a.s - b.s); } }
  }

  // generic fallbacks when a hybrid's pattern is for a different meter
  function genPat(r, g, dens, len) {
    const a = new Array(g.steps).fill('.'); let a0 = 0;
    g.groups.forEach(gp => { if (r() < dens + .3) a[a0] = 'x'; if (gp >= 4 && r() < dens) a[a0 + gp - 2 + (g.grid === 12 ? 1 : 0)] = 'x'; a0 += gp; });
    a[0] = 'x';
    if (len > 1) for (let i = 0; i < a.length; i++) if (a[i] === 'x') for (let k = 1; k < len && a[i + k] === '.'; k++) a[i + k] = '-';
    return a.join('');
  }
  function bassFromKick(r, g, kickStr) {
    const a = new Array(g.steps).fill('.'), k = fit(kickStr || '', g.steps);
    for (let i = 0; i < g.steps; i++) if (k[i] !== '.') a[i] = i === 0 ? 'r' : pick(r, ['r', 'r', '5', 'o']);
    for (let i = 0; i < g.steps; i++) if (a[i] !== '.' && a[i + 1] === '.' && r() < .5) a[i + 1] = '-';
    if (a.every(x => x === '.')) a[0] = 'r';
    return a.join('');
  }

  MM.theory = { PR, MODES, QUAL, KEYS, FAM, DRUMS, BASSP, chordInfo, voiceChord, genMotif, develop, mutateMotif, genPat, bassFromKick, fit, stepWeight, pick, chance, rnd, nearest };
  MM.inventGenre = inventGenre;
})(window);
