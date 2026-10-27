# Endless Music Machine
Invented, never-repeating **instrumental** music in the browser. Pure Web Audio, no dependencies, no sample files.
Run: `./serve.sh` (or `python3 -m http.server 8080`) → open http://localhost:8080 and tap start.
Keys: Space play/pause, N new genre.

## How it works
- `dsp.js` – drum-kit synthesis rendered to buffers (pitch-enveloped kicks, snappy snares/claps, metallic hats, ride, toms, congas…) and generated reverb impulses.
- `theory.js` – scales, chord qualities, voice-led progressions, 14 genre families (lo-fi, house, jungle/DnB, synthwave, ambient, dub, trap, jazz, arcade/chiptune, afrobeat 12/8, cinematic, techno/acid, 2-step garage, 7/8 odd-time) that are **mixed into invented hybrids**, motif generator/developer.
- `engine.js` – mix chain (sidechain-style ducking, convolution reverb, ping-pong delay, saturation, glue compressor + limiter, M/S stereo width) and the synth voices (FM keys, detuned supersaws, strings, brass, pluck, kalimba, flute, acid/reese/808/sub/walking bass…).
- `sequencer.js` – arrangement (intro → groove → build-up with snare roll/riser/gap → drop → breakdown → …), key changes, evolving motifs, per-genre rhythm grids (straight, swing, triplet, half-time, 6/8, 7/8, 12/8).
- `machine.js` – UI, visuals, iOS audio unlock, recording / WAV export.
