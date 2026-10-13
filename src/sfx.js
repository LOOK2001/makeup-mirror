// Tiny synthesized sound effects (no audio files). The AudioContext is created
// lazily on the first sound, which always follows a user gesture.
let ctx = null;
const ac = () => (ctx ??= new AudioContext());

function tone(freq, start, dur, { type = 'sine', gain = 0.2, slide = 0 } = {}) {
  const a = ac();
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur);
}

export function shutter() {
  const a = ac();
  const len = Math.floor(a.sampleRate * 0.08);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = a.createBufferSource();
  const g = a.createGain();
  g.gain.value = 0.35;
  src.buffer = buf;
  src.connect(g).connect(a.destination);
  src.start();
  tone(1800, 0, 0.04, { type: 'square', gain: 0.05 });
}

export function ding() {
  tone(1318, 0, 0.9, { gain: 0.18 });
  tone(2637, 0, 0.5, { gain: 0.05 });
}

export function fanfare() {
  [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.11, 0.35, { type: 'triangle', gain: 0.14 }));
}

export function pick() {
  tone(880, 0, 0.08, { gain: 0.06, slide: 1.5 });
}
