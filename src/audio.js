// Generative ambient sound with WebAudio (no audio files needed).
// Swap for real tracks later (e.g. with Howler.js) once FlowD has its own sound.
let ctx, master, started = false;
export const audio = { enabled: false };

function build() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 520; filter.Q.value = 0.7;
  filter.connect(master);

  // slow drone chord
  [55, 82.4, 110.2, 164.8].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = i % 2 ? 'sine' : 'triangle';
    o.frequency.value = f; o.detune.value = (i - 1.5) * 6;
    const g = ctx.createGain(); g.gain.value = 0.06 / (i + 1);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + i * 0.03;
    const lg = ctx.createGain(); lg.gain.value = 0.03 / (i + 1);
    lfo.connect(lg).connect(g.gain); lfo.start();
    o.connect(g).connect(filter); o.start();
  });
  // filtered noise "water"
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
  const ng = ctx.createGain(); ng.gain.value = 0.018;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
  const lg = ctx.createGain(); lg.gain.value = 500;
  lfo.connect(lg).connect(bp.frequency); lfo.start();
  noise.connect(bp).connect(ng).connect(master); noise.start();
}

export function setSound(on) {
  audio.enabled = on;
  if (on && !started) { build(); started = true; }
  if (!ctx) return;
  if (on) ctx.resume();
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.linearRampToValueAtTime(on ? 0.9 : 0, ctx.currentTime + 1.2);
}

/** Short soft tick for hovers and clicks. */
export function blip(freq = 880, vol = 0.04) {
  if (!audio.enabled || !ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = freq; o.type = 'sine';
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
  o.connect(g).connect(master); o.start(); o.stop(ctx.currentTime + 0.3);
}

/** Air "whoosh" layered over a cover on hover: a short band-passed noise sweep plus a soft low hit. */
let noiseBuf;
export function whoosh({ up = true, vol = 0.07, dur = 0.55, hit = true } = {}) {
  if (!audio.enabled || !ctx) return;
  const t = ctx.currentTime;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(up ? 300 : 2400, t);
  bp.frequency.exponentialRampToValueAtTime(up ? 2400 : 300, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(master); src.start(t); src.stop(t + dur + 0.05);
  if (!hit) return;
  const o = ctx.createOscillator(), og = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, t + dur * 0.4);
  o.frequency.exponentialRampToValueAtTime(48, t + dur * 0.4 + 0.35);
  og.gain.setValueAtTime(0.0001, t);
  og.gain.setValueAtTime(0.0001, t + dur * 0.4);
  og.gain.exponentialRampToValueAtTime(vol * 1.4, t + dur * 0.4 + 0.02);
  og.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.4 + 0.45);
  o.connect(og).connect(master); o.start(t); o.stop(t + dur + 0.6);
}
