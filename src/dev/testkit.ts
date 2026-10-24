// Dev-only helpers to drive the game from the console or automated checks
// (the game loop can be pumped by hand when the page is hidden).
import * as THREE from 'three';
import { insideBox, type SupportBox } from '../game/rack';
import { ledClock, ledViewHeight } from '../render/leds';
import { ledGlows, ledLight, ledLightRack } from '../render/ledGlow';

export function installTestkit(get: () => any, stage?: unknown): void {
  const w = window as any;
  /** the renderer and its passes, for measuring the cost of the image */
  w.__stage = stage;
  /** the clock and the screen height of the lights (to freeze their blinking, or their smallest size) */
  w.__leds = { ledClock, ledViewHeight, ledLight, ledLightRack, ledGlows };
  const canvas = () => document.querySelector('#view canvas') as HTMLCanvasElement;
  // synchronous: timers are throttled when the page is in the background
  w.__pump = (ms: number) => { for (let t = 0; t < ms; t += 1000 / 60) get()?.tick(1 / 60, false); get()?.tick(0); };
  w.__scr = (x: number, y: number, z: number) => {
    const c = get().stage.camera as THREE.PerspectiveCamera;
    const v = new THREE.Vector3(x, y, z).project(c);
    const r = canvas().getBoundingClientRect();
    return [r.left + (v.x * 0.5 + 0.5) * r.width, r.top + (-v.y * 0.5 + 0.5) * r.height];
  };
  w.__node = (i: number) => { const x = get().world.sim.x; return [x[3 * i], x[3 * i + 1], x[3 * i + 2]]; };
  const fire = (type: string, x: number, y: number) =>
    canvas().dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, bubbles: true }));
  w.__click = async (x: number, y: number) => {
    fire('pointermove', x, y); fire('pointerdown', x, y);
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, button: 0, pointerId: 1 }));
    w.__pump(50);
  };
  /** drags along 3D waypoints (straight lines on screen between them), holding at the end */
  w.__drag3 = (from: number[], ...rest: (number[] | number)[]) => {
    const pts = rest.filter((p) => Array.isArray(p)) as number[][];
    const nums = rest.filter((p) => typeof p === 'number') as number[];
    const ms = nums[0] ?? 900, hold = nums[1] ?? 400;
    let cur = w.__scr(...from);
    fire('pointermove', cur[0], cur[1]);
    fire('pointerdown', cur[0], cur[1]);
    const grabbed = get().world.sim.grabNode;
    for (const p of pts) {
      const b = w.__scr(...p);
      const n = Math.max(2, Math.round(ms / pts.length / 16.7));
      for (let i = 1; i <= n; i++) { w.__pump(16.7); fire('pointermove', cur[0] + ((b[0] - cur[0]) * i) / n, cur[1] + ((b[1] - cur[1]) * i) / n); }
      cur = b;
    }
    w.__pump(hold);
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: cur[0], clientY: cur[1], button: 0, pointerId: 1 }));
    return grabbed;
  };
  w.__supported = (c: number) => {
    const g = get().world;
    const cb = g.cables[c];
    const sup = g.rack.supports();
    const x = g.sim.x;
    const out: number[] = [];
    for (let k = 0; k < cb.count; k++) {
      const i = cb.start + k;
      const px = x[3 * i], py = x[3 * i + 1], pz = x[3 * i + 2];
      if (sup.some((s: SupportBox) => insideBox(s, px, py, pz))) out.push(k);
    }
    return out;
  };
}
