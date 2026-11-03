/* Endless Music Machine — Scratch Deck: the live mix is continuously recorded into a 10 s ring buffer (AudioWorklet, ScriptProcessor
   fallback). Grabbing the record swaps the output to a variable-speed (forward/backward) read head with cubic interpolation, a
   stylus low-pass that follows speed, and a DC blocker; release spins the motor back up, flings spin back (rewind), and the mix
   cuts back in on the next downbeat. Instrumental only: it scratches the instrumental mix itself. */
(function (G) {
  'use strict';
  const MM = G.MM = G.MM || {};
  // shared DSP core: evaluated inside the AudioWorklet and on the main thread (fallback)
  const CORE = `function scHm(y0,y1,y2,y3,f){const c1=.5*(y2-y0),c2=y0-2.5*y1+2*y2-.5*y3,c3=.5*(y3-y0)+1.5*(y1-y2);return((c3*f+c2)*f+c1)*f+y1;}
function ScratchCore(sr){this.sr=sr;this.N=Math.round(sr*10);this.L=new Float32Array(this.N);this.R=new Float32Array(this.N);
this.w=0;this.r=0;this.on=false;this.rate=1;this.tgt=1;this.k=1-Math.exp(-1/(sr*.008));this.lpL=0;this.lpR=0;this.xL=0;this.xR=0;this.yL=0;this.yR=0;this.pk=0;}
ScratchCore.prototype.msg=function(d){if(d.grab){if(!this.on){this.r=Math.max(1,this.w-Math.round((d.lag||0)*this.sr));this.rate=1;this.tgt=1;}this.on=true;}
if(d.rate!=null){this.tgt=d.rate;this.k=1-Math.exp(-1/(this.sr*Math.max(.001,d.tc||.008)));}if(d.off){this.on=false;this.rate=1;this.tgt=1;}};
ScratchCore.prototype.run=function(iL,iR,oL,oR,n){const N=this.N,L=this.L,R=this.R,sr=this.sr;
for(let k=0;k<n;k++){const wi=this.w%N,a=iL?iL[k]:0;L[wi]=a;R[wi]=iR?iR[k]:a;this.w++;
if(!this.on){oL[k]=0;if(oR)oR[k]=0;continue;}
this.rate+=(this.tgt-this.rate)*this.k;let r=this.r+this.rate;const hi=this.w-2,lo=Math.max(2,this.w-N+4);if(r>hi)r=hi;if(r<lo)r=lo;this.r=r;
const i=Math.floor(r),f=r-i,i0=(i-1)%N,i1=i%N,i2=(i+1)%N,i3=(i+2)%N;
let sL=scHm(L[i0],L[i1],L[i2],L[i3],f),sR=scHm(R[i0],R[i1],R[i2],R[i3],f);
const sp=Math.abs(this.rate),fc=Math.min(17000,15000/Math.max(.7,sp)),g=1-Math.exp(-6.2832*fc/sr);this.lpL+=(sL-this.lpL)*g;this.lpR+=(sR-this.lpR)*g;
const yl=this.lpL-this.xL+.996*this.yL,yr=this.lpR-this.xR+.996*this.yR;this.xL=this.lpL;this.xR=this.lpR;this.yL=yl;this.yR=yr;
oL[k]=yl;if(oR)oR[k]=yr;}};`;
  const WORKLET = CORE + `class EMMScratch extends AudioWorkletProcessor{constructor(){super();this.c=new ScratchCore(sampleRate);this.port.onmessage=e=>this.c.msg(e.data);}
process(ins,outs){const i=ins[0]||[],o=outs[0];this.c.run(i[0],i[1]||i[0],o[0],o[1],o[0].length);return true;}}registerProcessor('emm-scratch',EMMScratch);`;

  function crackleBuf(ctx) {
    const sr = ctx.sampleRate, n = sr * 4, b = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lp = 0;
      for (let i = 0; i < n; i++) { lp += ((Math.random() * 2 - 1) - lp) * .05; d[i] = lp * .05; }
      const pops = 70 + (Math.random() * 30 | 0);
      for (let p = 0; p < pops; p++) { const at = Math.random() * (n - 200) | 0, a = (Math.random() < .12 ? .9 : .25) * (Math.random() < .5 ? -1 : 1), len = 8 + (Math.random() * 40 | 0); for (let j = 0; j < len; j++) d[at + j] += a * Math.exp(-j / (len * .25)) * (j & 1 ? -.6 : 1); }
    }
    return b;
  }

  MM.Scratch = {
    attach(ctx, eng) {
      const g = v => { const x = ctx.createGain(); x.gain.value = v; return x; };
      const S = { ctx, ready: false, kind: 'none', dry: g(1), wet: g(0), tail: g(1), crk: g(0) };
      eng.out.connect(S.dry); S.dry.connect(S.tail); S.wet.connect(S.tail);
      // scratch-aware visuals: the analyser listens to what you actually hear
      try { eng.master.disconnect(eng.analyser); S.tail.connect(eng.analyser); } catch (e) {}
      // vinyl crackle bed (only while the deck is out)
      try { const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(); s.buffer = crackleBuf(ctx); s.loop = true; hp.type = 'highpass'; hp.frequency.value = 900; s.connect(hp); hp.connect(S.crk); S.crk.connect(S.tail); s.start(); } catch (e) {}
      S.send = () => {};
      const fallback = () => {
        try {
          const core = new (new Function(CORE + ';return ScratchCore;')())(ctx.sampleRate), sp = ctx.createScriptProcessor(1024, 2, 2);
          sp.onaudioprocess = e => { const I = e.inputBuffer, O = e.outputBuffer; core.run(I.getChannelData(0), I.getChannelData(1), O.getChannelData(0), O.getChannelData(1), O.length); };
          eng.out.connect(sp); sp.connect(S.wet); S.send = d => core.msg(d); S.ready = true; S.kind = 'script';
        } catch (e) { S.kind = 'none'; }
      };
      if (ctx.audioWorklet && G.AudioWorkletNode) {
        const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
        ctx.audioWorklet.addModule(url).then(() => {
          const n = new AudioWorkletNode(ctx, 'emm-scratch', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
          eng.out.connect(n); n.connect(S.wet); S.send = d => n.port.postMessage(d); S.ready = true; S.kind = 'worklet';
        }).catch(fallback);
      } else fallback();
      const ramp = (p, v, t, tc) => { p.cancelScheduledValues(t); p.setTargetAtTime(v, t, tc); };
      // hand on the record: the read head starts exactly where the mix is, so the swap is seamless
      S.grab = () => { if (!S.ready) return false; const t = ctx.currentTime; S.send({ grab: 1, lag: (ctx.baseLatency || 0) * .5 }); ramp(S.wet.gain, 1, t, .004); ramp(S.dry.gain, 0, t, .004); return true; };
      S.rate = (r, tc) => S.send({ rate: r, tc: tc || .012 });
      // back to the live mix at time `at` (default now)
      S.live = (at, tc) => { const t = Math.max(ctx.currentTime, at || 0); ramp(S.wet.gain, 0, t, tc || .01); ramp(S.dry.gain, 1, t, tc || .01); };
      S.off = () => { S.send({ off: 1 }); };
      S.crackle = on => ramp(S.crk.gain, on ? .07 : 0, ctx.currentTime, on ? .25 : .4);
      // needle drop: a soft thump + stylus scrape (no voices)
      S.needle = () => {
        const t = ctx.currentTime + .01, o = ctx.createOscillator(), og = g(0); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + .25);
        og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(.32, t + .006); og.gain.exponentialRampToValueAtTime(1e-4, t + .4); o.connect(og); og.connect(S.tail); o.start(t); o.stop(t + .45);
        const ns = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = g(0); ns.buffer = eng.noiseBuf; bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = .8;
        ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(.06, t + .01); ng.gain.exponentialRampToValueAtTime(1e-4, t + .22); ns.connect(bp); bp.connect(ng); ng.connect(S.tail); ns.start(t); ns.stop(t + .3);
      };
      return S;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
