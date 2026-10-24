// Runs one level: the fixed-step physics loop, the rendering, and every
// interaction of the player with the cabinet.

import * as THREE from 'three';
import { Stage } from '../render/stage';
import { RackView, buildItem, ghostBadMat, ghostMat } from '../render/rackView';
import { CableView } from '../render/cableView';
import { disposeTree } from '../render/dispose';
import { HOLD, World, type Evaluation, type Snapshot, type Strap } from './world';
import { COLUMN_X, FRONT_Z, ROOM_FLOOR, U, WALL_X, type Item, type ItemKind, type Port } from './rack';
import { FIBRE_NAMES, type FibreType, type LevelDef } from './levels';
import { sfx } from '../audio/sfx';

export type Tool = 'hand' | ItemKind | 'velcro' | 'label' | 'length' | 'trace' | 'deposit';

export interface ControllerEvents {
  onEval(ev: Evaluation): void;
  onInventory(): void;
  onHover(text: string | null, x: number, y: number): void;
  onToast(text: string): void;
  onStats(text: string): void;
  /** the length tool picked a cord: show the cord catalogue */
  onLengthMenu(cable: number, x: number, y: number): void;
  /** a hint for what the player is doing now (null: back to the tool's) */
  onHint(text: string | null): void;
}

interface Pick {
  cable: number;
  node: number;
  point: THREE.Vector3;
  /** picked on a connector: which end */
  end: number;
}

const MAX_TARGET_STEP = 0.035; // m per frame the hand may move
/** how far the hand pulls a plugged connector before it comes out (m) */
const UNPLUG_PULL = 0.04;
/** glow of a stretch of the carried cord: held by the management, hanging too long, on the floor */
const HOLD_TINT = [null, new THREE.Color('#1f9a45'), new THREE.Color('#c06800'), new THREE.Color('#b01c1c')];
const CORD_TOOLS = new Set<Tool>(['hand', 'label', 'velcro', 'length', 'trace', 'deposit']);

export class Controller {
  world: World;
  rackView: RackView;
  cableView: CableView;
  tool: Tool = 'hand';
  /** colour the label tool puts on (−1: the service of the cord's line, on both ends) */
  labelColor = -1;
  elapsed = 0;
  running = true;
  lastEval: Evaluation;
  debug = false;
  private hover: Pick | null = null;
  private drag: {
    node: number; cable: number; plane: THREE.Plane; depth: number; target: THREE.Vector3; end: number;
    /** Shift held: the mouse moves the cord in depth (up = away) instead of in height */
    depthMode: boolean; anchor: { mx: number; my: number; t: THREE.Vector3 };
    /** hand minus pointer-on-plane: keeps the cord where it is when Shift is released */
    offset: THREE.Vector3;
    /** a plugged connector was taken: it stays in until the hand pulls it far enough */
    pull: { end: number; from: THREE.Vector3; refused: boolean } | null;
  } | null = null;
  /** the cord whose held and hanging stretches are shown (while carried, and a moment after) */
  private holdView: { cable: number; until: number; next: number } | null = null;
  /** plumb line from the held point to the floor: the depth cue */
  private guide: THREE.Group;
  private pan: { mx: number; my: number } | null = null;
  private mouse = new THREE.Vector2();
  private mousePx = { x: 0, y: 0 };
  private ray = new THREE.Raycaster();
  private acc = 0;
  private last = performance.now();
  private evalTimer = 0;
  private ghost: THREE.Group | null = null;
  private ghostKey = '';
  private portHint: Port | null = null;
  private highlighted = new Set<number>();
  private focusCircuit = -1;
  private disposed = false;
  private screen = new Float32Array(0);
  private cycle = 0;
  private builtCables = 0;
  private clock = 0;
  private tracing: { cable: number; until: number } | null = null;
  /** what the player did, for the tutorial */
  counters = { hovered: 0, dragged: 0, plugged: 0, unplugged: 0, orbited: 0, deposited: 0 };
  private lastHoverCable = -1;
  private spot: THREE.Group | null = null;
  private spotTime = 0;
  private cycleAt = { x: -1e9, y: -1e9 };
  /** undoes every subscription made by bind() */
  private unbind: (() => void)[] = [];
  /** cords tidy as of the last evaluation (plugged as planned, routed, clear) */
  private tidyCables = new Set<number>();
  /** cords that just became tidy: they glow for a moment (clock time it ends) */
  private glows = new Map<number, number>();
  /** cords made tidy in a row, and when the last one was */
  private streak = { n: 0, at: -1e9 };
  /** states to go back to (Ctrl+Z), the latest last */
  private history: Snapshot[] = [];
  /** the cabinet as the player found it (image), taken on the first frame */
  before: string | null = null;

  constructor(public stage: Stage, level: LevelDef, private events: ControllerEvents, threaded = true) {
    this.world = new World(level);
    this.world.preroll(30);
    if (threaded) this.world.sim.startWorker();
    const types = new Map<number, FibreType>();
    this.world.circuits.forEach((c) => types.set(this.world.rack.port(c.a).unit, c.type));
    this.rackView = new RackView(this.world.rack, types);
    this.guide = makeGuide();
    stage.scene.add(this.guide);
    this.cableView = new CableView(this.world);
    stage.scene.add(this.rackView.group, this.cableView.group);
    const r = this.world.rack;
    // the cabinet and, at its right, the crate on the floor
    stage.frame((r.topY + r.floorY) / 2 + 0.01, r.topY - r.floorY + 0.16, 0.6, 0.16);
    this.rackView.syncItems(this.world.itemsVersion);
    this.cableView.update(true);
    this.lastEval = this.world.evaluate();
    this.tidyCables = this.tidySet(this.lastEval);
    this.refreshLeds();
    this.bind();
    requestAnimationFrame(this.frame);
  }

  dispose(): void {
    this.disposed = true;
    this.world.dispose();
    for (const off of this.unbind) off();
    this.spotlight(null);
    for (const g of [this.rackView.group, this.cableView.group, this.guide, this.ghost]) {
      if (!g) continue;
      this.stage.scene.remove(g);
      disposeTree(g);
    }
  }

  setTool(t: Tool): void {
    this.tool = t;
    this.updateGhost();
    this.stage.renderer.domElement.style.cursor = t === 'hand' ? 'grab' : 'crosshair';
  }

  /** highlights the cords and ports of one line of the schedule (−1: none) */
  focus(circuit: number): void {
    this.focusCircuit = circuit;
    for (const m of this.rackView.portMarkers.values()) m.visible = false;
    if (circuit >= 0) {
      const ci = this.world.circuits[circuit];
      for (const id of [ci.a, ci.b]) this.rackView.portMarkers.get(id)!.visible = true;
    }
    this.refreshHighlights();
  }

  // ------------------------------------------------------------- loop

  private frame = (): void => {
    if (this.disposed) return;
    requestAnimationFrame(this.frame);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.tick(dt);
  };

  /** advances the game by dt seconds and draws it */
  tick(dt: number, draw = true): void {
    if (this.running) this.elapsed += dt;
    this.clock += dt;
    if (this.tracing) {
      const t = this.tracing;
      const on = this.clock < t.until && Math.floor(this.clock * 6) % 2 === 0;
      this.cableView.setHighlight(t.cable, on, '#ff3030');
      if (this.clock >= t.until) {
        this.tracing = null;
        this.focus(this.focusCircuit);
      }
    }
    if (this.spot) {
      this.spotTime += dt;
      const a = 0.35 + 0.35 * Math.sin(this.spotTime * 5);
      this.spot.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && 'opacity' in m) m.opacity = o.userData.base * (0.5 + a);
      });
    }
    const h = this.world.sim.P.dt;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= h && steps < 2) {
      this.stepHand();
      this.acc -= h;
      steps++;
    }
    if (this.acc > h) this.acc = 0; // too slow: drop time rather than spiral
    if (steps) this.world.sim.advance(steps);
    const ms = this.world.sim.stats.ms;
    this.syncCableView();
    this.cableView.update();
    this.rackView.syncItems(this.world.itemsVersion);
    this.evalTimer += dt;
    if (this.evalTimer > 0.4) {
      this.evalTimer = 0;
      this.reevaluate();
      if (this.debug) {
        const s = this.world.sim.stats;
        this.events.onStats(`${this.world.sim.n} nœuds · ${s.contacts} contacts · ${s.awake}/${this.world.cables.length} câbles actifs · physique ${ms.toFixed(1)} ms${this.world.sim.threaded ? ' (worker)' : ''}`);
      }
    }
    this.updateGlows();
    this.updateHoldView();
    if (draw) {
      this.stage.render();
      if (!this.before) this.before = this.capture();
    }
  }

  /**
   * An image of the cabinet from the front, framed in the space the panels
   * leave free (the before/after of the result screen).
   */
  capture(): string {
    const cam = this.stage.camera, ctl = this.stage.controls;
    const pos = cam.position.clone(), target = ctl.target.clone();
    const guide = this.guide.visible;
    this.guide.visible = false;
    this.stage.resetView();
    this.stage.render();
    const src = this.stage.renderer.domElement;
    const k = src.width / Math.max(1, src.clientWidth);
    const ins = this.stage.insets;
    const sx = ins.left * k, sy = ins.top * k;
    const sw = Math.max(1, src.width - (ins.left + ins.right) * k), sh = Math.max(1, src.height - (ins.top + ins.bottom) * k);
    const out = document.createElement('canvas');
    const scale = Math.min(1, 420 / sh);
    out.width = Math.round(sw * scale);
    out.height = Math.round(sh * scale);
    out.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height);
    cam.position.copy(pos);
    ctl.target.copy(target);
    ctl.update();
    this.guide.visible = guide;
    this.stage.render();
    return out.toDataURL('image/jpeg', 0.85);
  }

  /** moves the hand target towards the pointer, at a bounded speed */
  private stepHand(): void {
    const d = this.drag;
    if (!d) return;
    let goal: THREE.Vector3 | null;
    if (d.depthMode) {
      // metres per pixel at the held point: the cord follows the mouse 1:1
      const cam = this.stage.camera;
      const h = this.stage.renderer.domElement.clientHeight;
      const m = (2 * cam.position.distanceTo(d.target) * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / h;
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
      const toward = new THREE.Vector3(-right.z, 0, right.x); // towards the viewer
      goal = d.anchor.t.clone()
        .addScaledVector(right, (this.mousePx.x - d.anchor.mx) * m)
        .addScaledVector(toward, (this.mousePx.y - d.anchor.my) * m);
    } else goal = this.pointerOnPlane(d.plane, d.depth)?.add(d.offset) ?? null;
    if (!goal) return;
    const t = d.target;
    const step = goal.clone().sub(t);
    const L = step.length();
    if (L > MAX_TARGET_STEP) step.multiplyScalar(MAX_TARGET_STEP / L);
    t.add(step);
    this.counters.dragged += step.length();
    // keep the hand out of the equipment
    const r = this.world.rack;
    if (Math.abs(t.x) < COLUMN_X && t.y > -0.02 && t.y < r.topY + 0.02) t.z = Math.max(t.z, 0.006);
    // beside the cabinet (over the crate, say), the hand stays in front of its
    // walls rather than being thrown sideways into them
    t.x = THREE.MathUtils.clamp(t.x, -0.75, 0.75);
    if (!r.open && Math.abs(t.x) > WALL_X - 0.005) t.z = Math.max(t.z, FRONT_Z + 0.01);
    const inside = t.z < FRONT_Z;
    t.y = THREE.MathUtils.clamp(t.y, (inside || r.open ? r.floorY : ROOM_FLOOR(r)) + 0.004, r.topY + 0.1);
    t.z = THREE.MathUtils.clamp(t.z, -0.055, 0.7);
    const g = this.world.sim.grabTarget;
    g[0] = t.x; g[1] = t.y; g[2] = t.z;
    this.placeGuide(t, d.depthMode);
    if (d.pull && t.distanceTo(d.pull.from) > UNPLUG_PULL) this.pullOut(d);
  }

  /** the hand pulled a plugged connector far enough: it comes out, and the hand now holds it */
  private pullOut(d: NonNullable<Controller['drag']>): void {
    const w = this.world, p = d.pull!;
    if (!w.canUnplug(d.cable)) {
      if (!p.refused) this.refuseCut();
      p.refused = true;
      return;
    }
    d.pull = null;
    w.unplug(d.cable, p.end);
    this.counters.unplugged++;
    sfx.unplug();
    this.reevaluate();
    const [n0] = w.endNodes(d.cable, p.end);
    w.sim.release();
    w.sim.grab(n0);
    const g = w.sim.grabTarget;
    g[0] = d.target.x; g[1] = d.target.y; g[2] = d.target.z;
    d.node = n0;
    d.end = p.end;
    this.events.onHint('Relâchez le connecteur devant un port libre (surligné en jaune) pour le brancher.');
  }

  private pointerOnPlane(plane: THREE.Plane, depth: number): THREE.Vector3 | null {
    this.ray.setFromCamera(this.mouse, this.stage.camera);
    const p = new THREE.Plane().copy(plane);
    p.constant -= depth;
    const out = new THREE.Vector3();
    return this.ray.ray.intersectPlane(p, out);
  }

  // ------------------------------------------------------------ input

  private bind(): void {
    const el = this.stage.renderer.domElement;
    const on = (t: EventTarget, n: string, f: (e: any) => void, opt?: AddEventListenerOptions) => {
      t.addEventListener(n, f, opt);
      this.unbind.push(() => t.removeEventListener(n, f));
    };
    on(el, 'pointermove', (e: PointerEvent) => this.onMove(e));
    on(el, 'pointerdown', (e: PointerEvent) => this.onDown(e));
    on(window, 'pointerup', (e: PointerEvent) => this.onUp(e));
    on(el, 'wheel', (e: WheelEvent) => this.onWheel(e), { passive: false });
    on(el, 'contextmenu', (e: Event) => e.preventDefault());
    on(el, 'pointerleave', () => this.events.onHover(null, 0, 0));
    const onOrbit = () => { this.counters.orbited++; };
    this.stage.controls.addEventListener('start', onOrbit);
    this.unbind.push(() => this.stage.controls.removeEventListener('start', onOrbit));
    on(window, 'keydown', (e: KeyboardEvent) => { if (e.key === 'Shift' && this.drag && !this.drag.depthMode) this.setDepthMode(true); });
    on(window, 'keyup', (e: KeyboardEvent) => { if (e.key === 'Shift' && this.drag && this.drag.depthMode) this.setDepthMode(false); });
    on(window, 'keydown', (e: KeyboardEvent) => {
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !document.querySelector('.overlay.on')) {
        e.preventDefault();
        this.undo();
      }
    });
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || this.drag || document.querySelector('.overlay.on')) return;
      e.preventDefault();
      if (this.picksCords()) this.cyclePick();
    });
    this.setTool('hand');
  }

  private setMouse(e: PointerEvent | WheelEvent): void {
    const r = this.stage.renderer.domElement.getBoundingClientRect();
    this.mousePx.x = e.clientX - r.left;
    this.mousePx.y = e.clientY - r.top;
    this.mouse.set((this.mousePx.x / r.width) * 2 - 1, -(this.mousePx.y / r.height) * 2 + 1);
  }

  private onMove(e: PointerEvent): void {
    this.setMouse(e);
    if (this.pan) {
      this.panBy(e.clientX - this.pan.mx, e.clientY - this.pan.my);
      this.pan = { mx: e.clientX, my: e.clientY };
      return;
    }
    if (this.drag && e.shiftKey !== this.drag.depthMode) this.setDepthMode(e.shiftKey);
    if (this.drag) {
      this.updatePortHint();
      return;
    }
    if (this.picksCords()) {
      const p = this.pick();
      this.setHover(p);
      const stacked = p ? this.pickAll().length : 0;
      if (p) this.events.onHover(this.describe(p) + (stacked > 1 ? `<br><i>${stacked} câbles sous le curseur — Tab : suivant</i>` : ''), e.clientX, e.clientY);
      else this.events.onHover(null, 0, 0);
    } else {
      this.setHover(null);
      this.events.onHover(null, 0, 0);
    }
    this.updateGhost();
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.setMouse(e);
    if (this.tool === 'hand') {
      const p = this.pick();
      if (!p) {
        // nothing under the pointer: drag the view
        this.pan = { mx: e.clientX, my: e.clientY };
        this.stage.renderer.domElement.style.cursor = 'move';
        return;
      }
      this.remember();
      this.dragStartedAt = this.counters.dragged;
      this.startDrag(p);
      this.stage.renderer.domElement.setPointerCapture(e.pointerId);
    } else if (this.tool === 'label') {
      const p = this.pick();
      if (p) this.applyLabel(p);
    } else if (this.tool === 'velcro') {
      this.applyVelcro();
    } else if (this.tool === 'length') {
      const p = this.pick();
      if (p) this.events.onLengthMenu(p.cable, e.clientX, e.clientY);
    } else if (this.tool === 'trace') {
      const p = this.pick();
      if (p) this.trace(p.cable);
    } else if (this.tool === 'deposit') {
      const p = this.pick();
      if (p && !this.world.canUnplug(p.cable)) this.refuseCut();
      else if (p) {
        this.remember();
        this.world.depositCable(p.cable);
        this.counters.deposited++;
        sfx.unplug();
        this.afterRewire();
      }
    } else {
      this.applyItem(this.tool);
    }
  }

  /** remembers the cabinet before a gesture, for Ctrl+Z */
  private remember(): void {
    this.history.push(this.world.snapshot());
    if (this.history.length > 30) this.history.shift();
  }

  /** puts the cabinet back as it was before the last gesture */
  undo(): void {
    if (this.drag) return;
    const s = this.history.pop();
    if (!s) { this.events.onToast('Rien à annuler.'); return; }
    if (!this.world.restore(s)) {
      // cords rebuilt since (another length, a new cord): older states no longer fit
      this.history = [];
      this.events.onToast('Impossible d\'annuler au-delà d\'un changement de cordon.');
      sfx.error();
      return;
    }
    sfx.remove();
    this.glows.clear();
    this.cableView.update(true);
    this.reevaluate();
    this.tidyCables = this.tidySet(this.lastEval);
    this.events.onToast('Annulé.');
  }

  /** the maintenance window is full: say so, and point at the cut links */
  private refuseCut(): void {
    const max = this.world.level.maxCuts ?? 0;
    this.events.onToast(`Fenêtre de maintenance : ${max} liaison${max > 1 ? 's' : ''} en production déjà coupée${max > 1 ? 's' : ''}. Rebranchez-en une avant d'en couper une autre.`);
    sfx.error();
    for (const m of this.rackView.portMarkers.values()) m.visible = false;
    for (const i of this.world.live) {
      if (this.world.circuitUp(i)) continue;
      const ci = this.world.circuits[i];
      for (const id of [ci.a, ci.b]) this.rackView.portMarkers.get(id)!.visible = true;
    }
  }

  /** every tool but the rack items works on a cord */
  private picksCords(): boolean {
    return CORD_TOOLS.has(this.tool);
  }

  /** swaps a cord for one of another length; false when it would not reach */
  setLength(c: number, length: number): boolean {
    if (!this.world.setCableLength(c, length)) {
      this.events.onToast('Trop court : ce cordon n\'irait pas d\'un bout à l\'autre.');
      sfx.error();
      return false;
    }
    sfx.place();
    this.afterRewire();
    return true;
  }

  /** a new cord from the stock, in the crate */
  newCord(type: FibreType, length: number, color?: string): void {
    this.world.addCable(type, length, color);
    sfx.place();
    this.afterRewire();
  }

  private afterRewire(): void {
    this.syncCableView();
    this.reevaluate();
  }

  /** scores the cabinet now, and shows it (LEDs, schedule) */
  private reevaluate(): void {
    this.lastEval = this.world.evaluate();
    this.refreshLeds();
    this.celebrate();
    this.events.onEval(this.lastEval);
  }

  /** cords plugged as planned, routed and leaving the front clear */
  private tidySet(ev: Evaluation): Set<number> {
    const out = new Set<number>();
    for (const s of ev.circuits) if (s.connected && s.routed && s.clear) out.add(s.cable);
    return out;
  }

  /** the cords that just became tidy: a glow and a note each, rising while they come in a row */
  private celebrate(): void {
    const now = this.tidySet(this.lastEval);
    const fresh = [...now].filter((c) => !this.tidyCables.has(c));
    this.tidyCables = now;
    if (!fresh.length) return;
    // the cord just let go of glows as a whole, not stretch by stretch
    const hv = this.holdView;
    if (hv && !this.drag && fresh.includes(hv.cable)) hv.until = this.clock;
    if (this.clock - this.streak.at > 8) this.streak.n = 0;
    this.streak.at = this.clock;
    fresh.forEach((c, i) => {
      this.glows.set(c, this.clock + 0.9 + i * 0.12);
      window.setTimeout(() => sfx.tidy(this.streak.n++), i * 120);
    });
  }

  private updateGlows(): void {
    for (const [c, until] of this.glows) {
      if (this.highlighted.has(c) || (this.tracing && this.tracing.cable === c)) continue;
      const left = until - this.clock;
      if (left <= 0) {
        this.glows.delete(c);
        this.cableView.setHighlight(c, false);
        continue;
      }
      const a = Math.min(1, left / 0.6);
      this.cableView.setHighlight(c, true, `rgb(${Math.round(30 * a)}, ${Math.round(150 * a)}, ${Math.round(70 * a)})`);
    }
  }

  /** the cords were rebuilt (another length, a new one): a new view */
  private syncCableView(): void {
    if (this.builtCables === this.world.cablesVersion) return;
    this.builtCables = this.world.cablesVersion;
    this.stage.scene.remove(this.cableView.group);
    disposeTree(this.cableView.group);
    this.cableView = new CableView(this.world);
    this.stage.scene.add(this.cableView.group);
    this.highlighted.clear();
    this.glows.clear();
    this.hover = null;
    this.refreshHighlights();
  }

  /**
   * The tracer: a visual fault locator (red light in a fibre) or a tone
   * generator (copper), in the game a cord that blinks for a few seconds with
   * its two ports circled — to find where a cord in the heap really goes.
   */
  /** cords traced at least once: an unmarked cord (blind level) then tells where it goes */
  private traced = new Set<number>();

  private trace(c: number): void {
    this.traced.add(c);
    this.tracing = { cable: c, until: this.clock + 4 };
    for (const m of this.rackView.portMarkers.values()) m.visible = false;
    for (const e of this.world.cables[c].ends) if (e.port) this.rackView.portMarkers.get(e.port)!.visible = true;
    sfx.label();
  }

  /** how far the hand had travelled when the current drag began (a mere click is not worth an undo) */
  private dragStartedAt = 0;

  private onUp(_e: PointerEvent): void {
    if (this.pan) { this.pan = null; this.stage.renderer.domElement.style.cursor = 'default'; return; }
    if (!this.drag) return;
    if (this.counters.dragged - this.dragStartedAt < 0.002 && !this.portHint && !(this.drag.end >= 0)) this.history.pop();
    this.guide.visible = false;
    this.events.onHint(null);
    const d = this.drag;
    this.drag = null;
    this.stage.controls.enableZoom = true;
    this.world.sim.release();
    // the cord settles: its held and hanging stretches stay in view a little longer
    if (this.holdView) this.holdView.until = this.clock + 1.6;
    if (d.end >= 0) {
      const port = this.portHint;
      if (port) {
        this.world.plug(d.cable, d.end, port.id);
        this.counters.plugged++;
        this.reevaluate();
        sfx.plug(this.circuitOkAt(port));
      }
    }
    this.setPortHint(null);
    this.stage.renderer.domElement.style.cursor = 'grab';
    this.refreshHighlights();
  }

  private onWheel(e: WheelEvent): void {
    if (!this.drag) return;
    e.preventDefault();
    this.drag.depth += Math.sign(e.deltaY) * -0.008;
    this.drag.depth = THREE.MathUtils.clamp(this.drag.depth, -0.25, 0.25);
  }

  private startDrag(p: Pick): void {
    const w = this.world;
    let node = p.node;
    let end = -1;
    let pull: { end: number; from: THREE.Vector3; refused: boolean } | null = null;
    const eo = w.endOfNode(node);
    if (eo) {
      const [n0, n1] = w.endNodes(eo.cable, eo.end);
      if (w.cables[eo.cable].ends[eo.end].port) {
        // a plugged connector stays in until it is pulled: the hand takes the cord just behind its boot
        node = n1 + (eo.end === 0 ? 1 : -1);
        pull = { end: eo.end, from: new THREE.Vector3(), refused: false };
        sfx.grab();
      } else {
        end = eo.end;
        node = n0;
      }
    } else sfx.grab();
    w.sim.grab(node);
    const dir = new THREE.Vector3();
    this.stage.camera.getWorldDirection(dir);
    const at = new THREE.Vector3(w.sim.x[3 * node], w.sim.x[3 * node + 1], w.sim.x[3 * node + 2]);
    if (pull) pull.from.copy(at);
    // the hand moves on a plane facing the camera, through the grabbed point
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(dir.clone().negate(), at);
    this.drag = { node, cable: p.cable, plane, depth: 0, target: at.clone(), end, depthMode: false, anchor: { mx: this.mousePx.x, my: this.mousePx.y, t: at.clone() }, offset: new THREE.Vector3(), pull };
    this.holdView = { cable: p.cable, until: Infinity, next: 0 };
    this.events.onHint(pull
      ? '<b>Tirez</b> le connecteur de quelques centimètres pour le débrancher ; sinon vous rangez simplement le câble.'
      : 'Maintenez <b>Maj</b> pour pousser le câble vers le fond (souris vers le haut) ou le ramener vers vous (vers le bas). <span class="ok">Vert</span> : tenu, <span class="warn">orange</span> : pend trop.');
    this.stage.controls.enableZoom = false;
    this.stage.renderer.domElement.style.cursor = 'grabbing';
    this.events.onHover(null, 0, 0);
    this.refreshHighlights();
  }

  /** the carried cord, a stretch at a time: held (green), hanging too long (orange), on the floor (red) */
  private updateHoldView(): void {
    const h = this.holdView;
    if (!h) return;
    if (this.clock >= h.until || h.cable >= this.world.cables.length) {
      this.holdView = null;
      this.cableView.setHighlight(h.cable, false);
      this.refreshHighlights();
      return;
    }
    if (this.clock < h.next) return;
    h.next = this.clock + 0.1;
    const map = this.world.holdMap(h.cable);
    const fade = Number.isFinite(h.until) ? Math.min(1, (h.until - this.clock) / 0.5) : 1;
    const hl = new THREE.Color('#5a4a10').multiplyScalar(fade);
    this.cableView.setNodeTints(h.cable, Array.from(map, (m) => m === HOLD.FREE ? hl : HOLD_TINT[m]!.clone().multiplyScalar(fade)));
  }

  /** while carrying a connector: the free port it would plug into */
  private updatePortHint(): void {
    const d = this.drag;
    if (!d || d.end < 0) return;
    const tip = this.world.connectorTip(d.cable, d.end);
    const cam = this.stage.camera;
    let best: Port | null = null, bestD = Infinity;
    const v = new THREE.Vector3();
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    for (const p of this.world.rack.ports) {
      if (p.plug >= 0) continue;
      const d3 = Math.hypot(tip[0] - p.x, tip[1] - p.y, tip[2]);
      v.set(p.x, p.y, 0).project(cam);
      const sx = (v.x * 0.5 + 0.5) * rect.width, sy = (-v.y * 0.5 + 0.5) * rect.height;
      const d2 = Math.hypot(sx - this.mousePx.x, sy - this.mousePx.y);
      const score = Math.min(d3 / 0.03, d2 / 22);
      if (score < 1 && score < bestD) { bestD = score; best = p; }
    }
    this.setPortHint(best);
  }

  private setPortHint(p: Port | null): void {
    if (this.portHint === p) return;
    if (this.portHint) {
      const m = this.rackView.portMarkers.get(this.portHint.id)!;
      m.visible = false;
      (m.material as THREE.MeshBasicMaterial).color.set('#7ee0ff');
    }
    this.portHint = p;
    if (p) {
      const m = this.rackView.portMarkers.get(p.id)!;
      m.visible = true;
      (m.material as THREE.MeshBasicMaterial).color.set('#ffe066');
    }
    if (!p && this.focusCircuit >= 0) this.focus(this.focusCircuit);
  }

  /** a line of the schedule through this port is connected (as of the last evaluation) */
  private circuitOkAt(port: Port): boolean {
    return this.lastEval.circuits.some((s, i) => s.connected && (this.world.circuits[i].a === port.id || this.world.circuits[i].b === port.id));
  }

  // ------------------------------------------------------- choreography

  /** Shift pressed or released while carrying a cord */
  private setDepthMode(on: boolean): void {
    const d = this.drag!;
    d.depthMode = on;
    d.anchor = { mx: this.mousePx.x, my: this.mousePx.y, t: d.target.clone() };
    if (!on) {
      // back to the plane facing the camera, through where the hand is now
      const dir = new THREE.Vector3();
      this.stage.camera.getWorldDirection(dir);
      d.plane.setFromNormalAndCoplanarPoint(dir.negate(), d.target);
      d.depth = 0;
      // the pointer is no longer over the cord: carry on from where it is, without a jump
      const hit = this.pointerOnPlane(d.plane, 0);
      d.offset = hit ? d.target.clone().sub(hit) : new THREE.Vector3();
    }
    this.events.onHint(on
      ? '<b>Profondeur</b> : souris vers le haut = vers le fond, vers le bas = vers vous. Relâchez Maj pour revenir.'
      : 'Maintenez <b>Maj</b> pour pousser le câble vers le fond ou le ramener vers vous.');
  }

  private placeGuide(t: THREE.Vector3, depth: boolean): void {
    const r = this.world.rack;
    const floor = t.z >= FRONT_Z && !r.open ? ROOM_FLOOR(r) : r.floorY;
    const g = this.guide;
    g.visible = true;
    const line = g.children[0] as THREE.Line;
    const pos = line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, t.x, t.y, t.z);
    pos.setXYZ(1, t.x, floor + 0.002, t.z);
    pos.needsUpdate = true;
    const ring = g.children[1] as THREE.Mesh;
    ring.position.set(t.x, floor + 0.003, t.z);
    // the depth also shown against the rack: a tick on the equipment face
    const tick = g.children[2] as THREE.Mesh;
    tick.position.set(t.x, t.y, Math.max(0.001, Math.min(t.z, 0.002)));
    tick.scale.setScalar(1 + Math.max(0, t.z) * 8);
    const col = depth ? '#ffb020' : '#5cc8ff';
    for (const c of g.children) ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(col);
  }

  /** moves the view parallel to the screen (the world follows the mouse) */
  private panBy(dx: number, dy: number): void {
    const cam = this.stage.camera;
    const ctl = this.stage.controls;
    const h = this.stage.renderer.domElement.clientHeight;
    const m = (2 * cam.position.distanceTo(ctl.target) * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / h;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const move = right.multiplyScalar(-dx * m).add(up.multiplyScalar(dy * m));
    cam.position.add(move);
    ctl.target.add(move);
  }

  /** a pulsing frame around a region of the cabinet (tutorial) */
  spotlight(box: { min: [number, number, number]; max: [number, number, number] } | null): void {
    if (this.spot) {
      this.stage.scene.remove(this.spot);
      disposeTree(this.spot);
      this.spot = null;
    }
    if (!box) return;
    const size = new THREE.Vector3(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]);
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const g = new THREE.Group();
    const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#5cc8ff', transparent: true, opacity: 0.12, depthWrite: false }));
    fill.userData.base = 0.12;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#8fe0ff', transparent: true, opacity: 0.9, depthTest: false }));
    edges.userData.base = 0.9;
    edges.renderOrder = 20;
    g.add(fill, edges);
    g.position.set((box.max[0] + box.min[0]) / 2, (box.max[1] + box.min[1]) / 2, (box.max[2] + box.min[2]) / 2);
    this.spot = g;
    this.stage.scene.add(g);
  }

  // ------------------------------------------------------------ picking

  /**
   * Cords under the pointer, in screen space, one per cable: frontmost first,
   * connectors before the cords lying around them (a connector buried in a
   * heap must stay reachable). Tab walks down the list.
   */
  private pick(): Pick | null {
    const list = this.pickAll();
    if (list.length === 0) return null;
    const a = this.cycleAt;
    if (Math.hypot(a.x - this.mousePx.x, a.y - this.mousePx.y) > 5) this.cycle = 0;
    return list[this.cycle % list.length];
  }

  /** Tab: the next cord under the pointer */
  cyclePick(): void {
    const list = this.pickAll();
    if (list.length < 2) return;
    const a = this.cycleAt;
    if (Math.hypot(a.x - this.mousePx.x, a.y - this.mousePx.y) > 5) this.cycle = 0;
    this.cycle = (this.cycle + 1) % list.length;
    this.cycleAt = { x: this.mousePx.x, y: this.mousePx.y };
    const p = list[this.cycle];
    this.setHover(p);
    const r = this.stage.renderer.domElement.getBoundingClientRect();
    this.events.onHover(`${this.describe(p)}<br><i>${this.cycle + 1}/${list.length} sous le curseur — Tab : suivant</i>`, r.left + this.mousePx.x, r.top + this.mousePx.y);
  }

  private pickAll(): Pick[] {
    const sim = this.world.sim;
    const cam = this.stage.camera;
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    const N = sim.n;
    if (this.screen.length < N * 3) this.screen = new Float32Array(N * 3);
    const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements;
    const S = this.screen;
    const x = sim.x;
    const W = rect.width, H = rect.height;
    const project = (px: number, py: number, pz: number, out: Float32Array, o: number) => {
      const cx = m[0] * px + m[4] * py + m[8] * pz + m[12];
      const cy = m[1] * px + m[5] * py + m[9] * pz + m[13];
      const cw = m[3] * px + m[7] * py + m[11] * pz + m[15];
      out[o] = (cx / cw * 0.5 + 0.5) * W;
      out[o + 1] = (-cy / cw * 0.5 + 0.5) * H;
      out[o + 2] = cw;
    };
    for (let i = 0; i < N; i++) project(x[3 * i], x[3 * i + 1], x[3 * i + 2], S, 3 * i);
    const mx = this.mousePx.x, my = this.mousePx.y;
    // tolerance: the projected cable radius plus a few pixels
    const pxPerM = H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    const best = new Map<number, { score: number; pick: Pick }>();
    const consider = (ax: number, ay: number, aw: number, bx: number, by: number, bw: number, cable: number, nodeA: number, nodeB: number, end: number, extra: number) => {
      const dx = bx - ax, dy = by - ay;
      const L2 = dx * dx + dy * dy;
      let t = L2 > 0 ? ((mx - ax) * dx + (my - ay) * dy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t - mx, qy = ay + dy * t - my;
      const d = Math.sqrt(qx * qx + qy * qy);
      const w = aw + (bw - aw) * t;
      const tol = Math.max(6, (0.0022 + extra) * pxPerM / w + 4);
      if (d > tol) return;
      // distance to the camera, then to the pointer; a connector counts as
      // 4 cm closer, 12 cm when the pointer is right on it
      // a plugged one only when the pointer is right on it: a cord passing by is what the player wants
      const plugged = end >= 0 && !!this.world.cables[cable].ends[end].port;
      const score = w + d * 0.0006 - (end >= 0 ? (d < 8 ? 0.12 : plugged ? 0 : 0.04) : 0);
      const old = best.get(cable);
      if (old && old.score <= score) return;
      const pa = new THREE.Vector3(x[3 * nodeA], x[3 * nodeA + 1], x[3 * nodeA + 2]);
      const pb = new THREE.Vector3(x[3 * nodeB], x[3 * nodeB + 1], x[3 * nodeB + 2]);
      best.set(cable, { score, pick: { cable, node: t < 0.5 ? nodeA : nodeB, point: pa.lerp(pb, t), end } });
    };
    const tip = new Float32Array(3);
    this.world.cables.forEach((cb, c) => {
      for (let i = cb.start; i < cb.start + cb.count - 1; i++) {
        const e = this.world.endOfNode(i);
        consider(S[3 * i], S[3 * i + 1], S[3 * i + 2], S[3 * i + 3], S[3 * i + 4], S[3 * i + 5], c, i, i + 1, e && this.world.endOfNode(i + 1) ? e.end : -1, 0);
      }
      for (const e of [0, 1]) {
        const [n0] = this.world.endNodes(c, e);
        const t = this.world.connectorTip(c, e);
        project(t[0], t[1], t[2], tip, 0);
        consider(S[3 * n0], S[3 * n0 + 1], S[3 * n0 + 2], tip[0], tip[1], tip[2], c, n0, n0, e, 0.003);
      }
    });
    return [...best.values()].sort((a, b) => a.score - b.score).map((b) => b.pick);
  }

  private setHover(p: Pick | null): void {
    const prev = this.hover?.cable ?? -1;
    if (p && p.cable !== this.lastHoverCable) { this.counters.hovered++; this.lastHoverCable = p.cable; }
    this.hover = p;
    if ((p?.cable ?? -1) !== prev) this.refreshHighlights();
    if (this.tool === 'hand') this.stage.renderer.domElement.style.cursor = p ? (p.end >= 0 || this.world.endOfNode(p.node) ? 'pointer' : 'grab') : 'default';
  }

  private refreshHighlights(): void {
    const want = new Map<number, string>();
    if (this.focusCircuit >= 0) {
      const st = this.lastEval.circuits[this.focusCircuit];
      if (st && st.cable >= 0) want.set(st.cable, '#2b5f7a');
      // cords plugged into either port of the line
      const ci = this.world.circuits[this.focusCircuit];
      for (const id of [ci.a, ci.b]) {
        const pl = this.world.rack.port(id).plug;
        if (pl >= 0) want.set(pl >> 1, '#2b5f7a');
      }
    }
    const h = this.drag ? this.drag.cable : this.hover?.cable ?? -1;
    if (h >= 0) want.set(h, '#5a4a10');
    // the cord shown stretch by stretch keeps its own glow
    const shown = this.holdView?.cable ?? -1;
    want.delete(shown);
    for (const c of this.highlighted) if (!want.has(c) && c !== shown) this.cableView.setHighlight(c, false);
    for (const [c, col] of want) this.cableView.setHighlight(c, true, col);
    this.highlighted = new Set(want.keys());
    if (shown >= 0) this.highlighted.add(shown);
  }

  private describe(p: Pick): string {
    const w = this.world;
    const cb = w.cables[p.cable];
    const ci = this.lastEval.circuits.findIndex((s) => s.cable === p.cable);
    // an unmarked cord says where it goes once traced, or once it makes its line
    const known = !w.level.blind || this.traced.has(p.cable) || (ci >= 0 && this.lastEval.circuits[ci].connected);
    const ends = (known ? cb.ends.map((e) => e.port ?? '—').join(' ↔ ') : 'sans marque — Traceur (8) pour le suivre') + ` · ${this.world.cableLength(p.cable).toFixed(2).replace('.', ',')} m`;
    let what = `<b>${FIBRE_NAMES[cb.type]}</b> · ${ends}`;
    if (ci >= 0) what += ` · <span class="ok">liaison ${ci + 1} ✓</span>`;
    if (this.tool === 'hand' && (p.end >= 0 || w.endOfNode(p.node))) {
      const plugged = cb.ends[p.end >= 0 ? p.end : w.endOfNode(p.node)!.end].port;
      what += plugged ? '<br><i>connecteur : saisir et tirer pour débrancher</i>' : '<br><i>connecteur : relâchez-le devant un port pour le brancher</i>';
    }
    return what;
  }

  // ------------------------------------------------------------- tools

  private applyLabel(p: Pick): void {
    const cb = this.world.cables[p.cable];
    if (this.labelColor < 0) {
      // the service of the line this cord makes, on both ends at once
      const line = this.lastEval.circuits.find((s) => s.connected && s.cable === p.cable);
      if (!line) {
        this.events.onToast('Étiquette auto : branchez d\'abord ce cordon sur les deux ports de sa liaison, ou choisissez une couleur.');
        sfx.error();
        return;
      }
      this.remember();
      const svc = this.world.circuits[this.lastEval.circuits.indexOf(line)].service;
      const done = cb.ends.every((e) => e.label === svc);
      for (const e of cb.ends) e.label = done ? null : svc;
    } else {
      this.remember();
      const k = p.node - cb.start;
      const end = cb.ends[k < cb.count / 2 ? 0 : 1];
      end.label = end.label === this.labelColor ? null : this.labelColor;
    }
    sfx.label();
    this.lastEval = this.world.evaluate();
    this.events.onEval(this.lastEval);
    this.cableView.update(true);
  }

  private applyVelcro(): void {
    // remove a strap under the pointer
    const cam = this.stage.camera;
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3();
    let hit: Strap | null = null;
    for (const s of this.world.straps) {
      const c = this.world.strapCentre(s);
      v.set(c[0], c[1], c[2]).project(cam);
      const sx = (v.x * 0.5 + 0.5) * rect.width, sy = (-v.y * 0.5 + 0.5) * rect.height;
      if (Math.hypot(sx - this.mousePx.x, sy - this.mousePx.y) < 14) hit = s;
    }
    if (hit) {
      this.world.removeStrap(hit);
      sfx.remove();
      this.events.onInventory();
      return;
    }
    const p = this.pick();
    if (!p) return;
    if (this.world.inventory.velcro <= 0) { this.events.onToast('Plus de velcro.'); sfx.error(); return; }
    const s = this.world.addStrap(p.point.x, p.point.y, p.point.z);
    if (!s) { this.events.onToast('Le velcro doit serrer au moins deux câbles qui se touchent.'); sfx.error(); return; }
    sfx.velcro();
    this.events.onInventory();
  }

  /** slot under the pointer for a rack item */
  private slot(kind: ItemKind): { unit: number; side: number } | null {
    this.ray.setFromCamera(this.mouse, this.stage.camera);
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.03), p)) return null;
    const r = this.world.rack;
    const unit = Math.floor((r.topY - p.y) / U);
    if (unit < 0 || unit >= r.units.length) return null;
    if (kind === 'hmgr') return Math.abs(p.x) < COLUMN_X ? { unit, side: 0 } : null;
    if (Math.abs(p.x) < COLUMN_X - 0.03 || Math.abs(p.x) > WALL_X + 0.04) return null;
    return { unit, side: Math.sign(p.x) };
  }

  private applyItem(kind: ItemKind): void {
    const s = this.slot(kind);
    if (!s) return;
    const w = this.world;
    const existing = w.rack.itemAt(kind, s.unit, s.side);
    if (existing) {
      if (existing.locked) { this.events.onToast('Cet élément est fixé à la baie.'); sfx.error(); return; }
      if (existing.kind !== kind) { this.events.onToast('Emplacement occupé.'); sfx.error(); return; }
      w.removeItem(existing);
      sfx.remove();
    } else {
      if (w.inventory[kind] <= 0) { this.events.onToast('Plus aucun élément de ce type en stock.'); sfx.error(); return; }
      if (!w.placeItem(kind, s.unit, s.side)) { this.events.onToast(kind === 'hmgr' ? 'Un guide-câbles se pose dans une unité vide.' : 'Emplacement occupé.'); sfx.error(); return; }
      sfx.place();
    }
    this.ghostKey = '';
    this.updateGhost();
    this.events.onInventory();
  }

  private updateGhost(): void {
    const kind = this.tool;
    let key = '';
    let s: { unit: number; side: number } | null = null;
    if (kind === 'hmgr' || kind === 'duct' || kind === 'vring') {
      s = this.slot(kind);
      if (s) key = `${kind}:${s.unit}:${s.side}:${this.world.itemsVersion}`;
    }
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    if (this.ghost) { this.stage.scene.remove(this.ghost); disposeTree(this.ghost); this.ghost = null; }
    if (!s || !key) return;
    const k = kind as ItemKind;
    const rack = this.world.rack;
    const existing = rack.itemAt(k, s.unit, s.side);
    const ok = existing ? !existing.locked && existing.kind === k : rack.canPlace(k, s.unit, s.side) && this.world.inventory[k] > 0;
    const it: Item = existing ?? { id: -99, kind: k, unit: k === 'duct' ? rack.ductStart(s.unit) : s.unit, side: s.side, span: k === 'duct' ? 4 : 1, locked: false };
    this.ghost = buildItem(rack, { ...it, id: -99 }, null, existing ? ghostBadMat : ok ? ghostMat : ghostBadMat);
    this.stage.scene.add(this.ghost);
  }

  private refreshLeds(): void {
    this.rackView.showLeds(this.world.okPorts(this.lastEval));
  }
}

/** the depth cue while carrying a cord: plumb line, ring on the floor, tick on the rack */
function makeGuide(): THREE.Group {
  const g = new THREE.Group();
  const lineGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#5cc8ff', transparent: true, opacity: 0.8, depthTest: false }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.016, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#5cc8ff', transparent: true, opacity: 0.8, depthTest: false }));
  const tick = new THREE.Mesh(new THREE.RingGeometry(0.004, 0.0055, 24), new THREE.MeshBasicMaterial({ color: '#5cc8ff', transparent: true, opacity: 0.6, depthTest: false }));
  for (const o of [line, ring, tick]) { o.renderOrder = 30; g.add(o); }
  g.visible = false;
  return g;
}
