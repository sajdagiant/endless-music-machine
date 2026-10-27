# Endless Music Machine
Invented, never-repeating **instrumental** music in the browser. Pure Web Audio, no dependencies, no sample files.
Run: `./serve.sh` (or `python3 -m http.server 8080`) → open http://localhost:8080 and tap start.
Keys: Space play/pause, N new genre. Tap the glow to play a note in the current key.

## How it works
- `dsp.js` – drum-kit synthesis rendered to buffers (pitch-enveloped kicks, snappy snares/claps, metallic hats, ride, toms, congas…, round-robin snare/hat variants), generated convolution reverbs (3-band decay, early reflections, short drum room).
- `theory.js` – scales (incl. rarer colours: Phrygian Dominant, Hirajoshi, In-Sen, Double Harmonic, Hungarian Minor, Lydian Dominant, Whole Tone), voice-led progressions, 14 genre families fused into **invented hybrids**, motif generator/developer, per-genre *instrument personality* (vibrato, glide, attack, brightness, detune spread, drift, lay-back), humanisation, field-recording bed, polyrhythm.
- `engine.js` – mix chain (per-bus EQ against mud/harshness, sidechain-style ducking, convolution reverb, ping-pong delay, asymmetric tape saturation + wow/flutter, glue compressor + limiter, M/S width), band-limited warm saw/square waves with randomised harmonic phase, synthesized field recordings (rain, wind, sea, crickets, birds, storm, city, night) and the synth voices.
- `sequencer.js` – arrangement (intro → groove → build → drop → break…), key changes, evolving motifs, **call & response** answer voice, **polyrhythmic** percussion/ostinato cycling on their own length, loose human timing/velocity, and rare **surprises** (vacuum bar, underwater dip, gong, whisper, glitch stutter, key turn, swell).
- `machine.js` – UI, per-genre colour palettes (cross-faded), haptics, visuals, iOS audio unlock, recording / WAV export.

## Haptics
Optional toggle. Android: `navigator.vibrate`. iPhone Safari has no vibrate API: taps on the glow and buttons are forwarded to a hidden `<input type=checkbox switch>` (native tick, iOS 17.4+/18+); beat-synced ticks (drops, downbeats, surprises — throttled, never constant) are best-effort because recent WebKit only allows switch haptics from real user taps.
