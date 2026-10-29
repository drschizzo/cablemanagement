// The page's one audio context, made on the first sound (browsers only allow
// it after a gesture of the player) and woken up when it was suspended.

let ctx: AudioContext | null = null;

/** the audio context, or null when the browser gives none */
export function audioContext(): AudioContext | null {
  if (!ctx) {
    try { ctx = new AudioContext(); } catch { return null; }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
