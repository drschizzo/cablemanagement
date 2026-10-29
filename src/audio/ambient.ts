// Ambient music, synthesised as it plays (no assets): slow pad chords, a few
// soft notes drifting over them through an echo, and the hum of a server
// room underneath. Never twice the same, never in a hurry.

import { audioContext } from './context';

/** the chords of the pad, as semitones above D3, played in turn */
const CHORDS = [[0, 7, 10, 14], [-2, 5, 9, 12], [3, 10, 14, 17], [-4, 3, 7, 10]];
/** the notes the melody picks from: D minor pentatonic, an octave and a half up */
const MELODY = [12, 15, 17, 19, 22, 24, 27, 29];
const D3 = 146.83;
/** s each chord lasts; s between two notes of the melody (at least, at most) */
const CHORD_S = 9;
const NOTE_GAP: [number, number] = [1.6, 4.5];
/** overall loudness, and how long it takes to come in or fade out (s) */
const VOLUME = 0.16;
const FADE_S = 2.5;

const hz = (semitones: number) => D3 * Math.pow(2, semitones / 12);

class Ambient {
  private out: GainNode | null = null;
  private echo: DelayNode | null = null;
  private hum: AudioBufferSourceNode | null = null;
  private timers: number[] = [];

  get playing(): boolean {
    return this.out !== null;
  }

  start(): void {
    if (this.out) return;
    const a = audioContext();
    if (!a) return;
    const out = a.createGain();
    out.gain.setValueAtTime(0.0001, a.currentTime);
    out.gain.exponentialRampToValueAtTime(VOLUME, a.currentTime + FADE_S);
    out.connect(a.destination);
    this.out = out;
    // the echo of the melody: a delay fed back into itself, darker each time
    const echo = a.createDelay(1);
    echo.delayTime.value = 0.42;
    const feedback = a.createGain();
    feedback.gain.value = 0.38;
    const dark = a.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 1800;
    echo.connect(dark).connect(feedback).connect(echo);
    dark.connect(out);
    this.echo = echo;
    this.hum = this.startHum(a, out);
    this.chord(0);
    this.note();
  }

  stop(): void {
    const a = audioContext(), out = this.out;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.out = null;
    if (!a || !out) return;
    out.gain.cancelScheduledValues(a.currentTime);
    out.gain.setValueAtTime(out.gain.value, a.currentTime);
    out.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + FADE_S);
    const hum = this.hum;
    this.hum = null;
    window.setTimeout(() => { hum?.stop(); out.disconnect(); }, FADE_S * 1000 + 100);
  }

  /** chord k of the progression, then the next one */
  private chord(k: number): void {
    const a = audioContext(), out = this.out;
    if (!a || !out) return;
    const t = a.currentTime;
    for (const s of CHORDS[k % CHORDS.length]) this.padVoice(a, out, hz(s), t, CHORD_S + 3);
    this.later(CHORD_S, () => this.chord(k + 1));
  }

  /** one voice of the pad: two triangles a little out of tune, through a soft filter, slow in and slow out */
  private padVoice(a: AudioContext, out: AudioNode, freq: number, t: number, dur: number): void {
    const filter = a.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 3);
    g.gain.setValueAtTime(0.09, t + dur - 4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    filter.connect(g).connect(out);
    for (const detune of [-6, 6]) {
      const o = a.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(filter);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  /** a soft note of the melody, into the echo; the next one a while later */
  private note(): void {
    const a = audioContext(), out = this.out, echo = this.echo;
    if (!a || !out || !echo) return;
    const t = a.currentTime;
    const o = a.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz(MELODY[Math.floor(Math.random() * MELODY.length)]);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(g);
    g.connect(out);
    g.connect(echo);
    o.start(t);
    o.stop(t + 2.3);
    this.later(NOTE_GAP[0] + Math.random() * (NOTE_GAP[1] - NOTE_GAP[0]), () => this.note());
  }

  /** the hum of the room: noise, very low, very quiet, looping */
  private startHum(a: AudioContext, out: AudioNode): AudioBufferSourceNode {
    const buf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    // brown noise: each sample a small step from the last
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const src = a.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = a.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    const g = a.createGain();
    g.gain.value = 0.35;
    src.connect(filter).connect(g).connect(out);
    src.start();
    return src;
  }

  private later(seconds: number, then: () => void): void {
    const timer = window.setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== timer);
      if (this.out) then();
    }, seconds * 1000);
    this.timers.push(timer);
  }
}

/** the one ambient music of the page */
export const ambient = new Ambient();
