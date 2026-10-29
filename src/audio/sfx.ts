// Tiny synthesised sound effects (no assets): clicks, thuds, velcro.

import { audioContext } from './context';

let muted = false;

function ac(): AudioContext | null {
  return muted ? null : audioContext();
}

export function setMuted(on: boolean): void {
  muted = on;
}

export function isMuted(): boolean {
  return muted;
}

function noise(a: AudioContext, dur: number): AudioBufferSourceNode {
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = a.createBufferSource();
  s.buffer = buf;
  return s;
}

function burst(freq: number, q: number, dur: number, gain: number, delay = 0): void {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const src = noise(a, dur);
  const f = a.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
  src.stop(t + dur);
}

function tone(freq: number, dur: number, gain: number, delay = 0, type: OscillatorType = 'sine'): void {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  o.type = type; o.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  plug(ok: boolean) {
    burst(3800, 4, 0.03, 0.5);
    burst(2400, 6, 0.025, 0.4, 0.035);
    if (ok) { tone(880, 0.12, 0.05, 0.06); tone(1320, 0.16, 0.05, 0.12); }
  },
  unplug() { burst(2900, 5, 0.03, 0.45); },
  grab() { burst(1200, 1.5, 0.04, 0.06); },
  place() { burst(300, 2, 0.08, 0.5); burst(1800, 6, 0.03, 0.2, 0.02); },
  remove() { burst(500, 2, 0.06, 0.35); },
  /** fingers pinching a cord into an elbow */
  pinch() { burst(900, 2.5, 0.05, 0.22); burst(2300, 5, 0.03, 0.12, 0.035); },
  velcro() { burst(5000, 0.7, 0.22, 0.25); burst(3500, 0.8, 0.15, 0.2, 0.05); },
  label() { burst(6000, 1, 0.05, 0.12); tone(1600, 0.05, 0.03); },
  /** a cord landing in its place (demo), pitched along the bundle */
  land(k: number) { burst(2600 + k * 40, 5, 0.025, 0.25); tone(660 * Math.pow(2, (k % 12) / 12), 0.09, 0.025); },
  /** a cord just became tidy: a soft click and a note, one step higher for each in a row */
  tidy(k: number) {
    const steps = [0, 2, 4, 7, 9];
    burst(4200, 5, 0.02, 0.18);
    tone(784 * Math.pow(2, (steps[k % 5] + 12 * Math.floor(Math.min(k, 9) / 5)) / 12), 0.22, 0.045, 0.02, 'triangle');
  },
  whoosh() { burst(700, 0.6, 0.5, 0.12); },
  /** a production line cut: the traffic drops */
  cut() { tone(330, 0.18, 0.05, 0, 'sawtooth'); tone(196, 0.3, 0.05, 0.1, 'sawtooth'); },
  /** a production line back up: the traffic comes back, a chatter of frames */
  restore() {
    tone(587, 0.1, 0.05);
    tone(880, 0.18, 0.05, 0.08);
    for (let k = 0; k < 6; k++) burst(5200 + k * 300, 6, 0.012, 0.12, 0.2 + k * 0.045 + Math.random() * 0.02);
  },
  error() { tone(220, 0.12, 0.06, 0, 'square'); },
  /** the teeth of a comb brushing over cords */
  comb() { for (let k = 0; k < 4; k++) burst(3400 + k * 500, 3, 0.02, 0.08, k * 0.025); },
  /** something found: a little rising sparkle */
  find() { [988, 1319, 1760, 2637].forEach((f, i) => tone(f, 0.18, 0.04, i * 0.07, 'triangle')); },
  /** a desk phone rings twice */
  ring() { for (const at of [0, 0.5]) for (let k = 0; k < 8; k++) tone(k % 2 ? 1320 : 1100, 0.03, 0.03, at + k * 0.035, 'square'); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 0.07, i * 0.11, 'triangle')); },
};
