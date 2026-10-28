// Runs one level: the fixed-step physics loop, the rendering, and every
// interaction of the player with the cabinet.

import * as THREE from 'three';
import { Stage } from '../render/stage';
import { RackView, buildItem, ghostBadMat, ghostMat } from '../render/rackView';
import { CableView } from '../render/cableView';
import { disposeTree } from '../render/dispose';
import { HOLD, World, type Evaluation, type Snapshot, type Strap } from './world';
import { COLUMN_X, FRONT_Z, ROOM_FLOOR, U, WALL_X, type Guide, type Item, type ItemKind, type Port } from './rack';
import { RouteRun, planRoute } from './route';
import { FIBRE_NAMES, SERVICES, type FibreType, type LevelDef } from './levels';
import { sfx } from '../audio/sfx';

/** the hand, the route (a way drawn over the guides, the cord laid along it), the supports, the velcro */
export type Tool = 'hand' | 'route' | 'supports' | 'velcro';

export interface ControllerEvents {
  onEval(ev: Evaluation): void;
  onInventory(): void;
  onHover(text: string | null, x: number, y: number): void;
  onToast(text: string): void;
  onStats(text: string): void;
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
const CORD_TOOLS = new Set<Tool>(['hand', 'route']);

export class Controller {
  world: World;
  rackView: RackView;
  cableView: CableView;
  tool: Tool = 'hand';
  elapsed = 0;
  running = true;
  /**
   * Preparation: before the work starts, the cabinet stands still and the
   * clock waits; only the supports may be placed (the plan is made first).
   */
  preparing = false;
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
    pull: { end: number; from: THREE.Vector3 } | null;
    /** what pinches the cord: Space, the right button (either will do) */
    pinchBy: { space: boolean; right: boolean };
    /** the hand pinched during this drag (worth an undo, even without moving) */
    pinched: boolean;
    /** when the current pinch began (clock), or −1 */
    pinchSince: number;
  } | null = null;
  /** the way being drawn (route tool): its cord, the guides passed over in order, the line outside them (one leg before each guide, one after the last), the port it ends on */
  private stroke: { cable: number; guides: Guide[]; legs: [number, number, number][][]; over: number; pts: THREE.Vector3[]; port: Port | null; last: { x: number; y: number } } | null = null;
  /**
   * The velcro being drawn: a line across the cords to strap, from where the
   * button went down to the pointer (px), and the node of each cord it crosses.
   */
  private band: { a: { x: number; y: number }; b: { x: number; y: number }; nodes: number[]; lit: Set<number> } | null = null;
  /** Shift held: the supports tool puts a ring rather than a duct */
  private keys = { shift: false };
  /** glows on the free connectors: cyan when lying loose, amber when hooked in the air */
  private ends: THREE.Group;
  /** the line drawn, and a frame round each guide it takes */
  private strokeView: THREE.Group;
  /** a cord being laid along its way */
  private routing: RouteRun | null = null;
  /** the cord whose held and hanging stretches are shown (while carried, and a moment after) */
  private holdView: { cable: number; until: number; next: number } | null = null;
  /** plumb line from the held point to the floor: the depth cue */
  private guide: THREE.Group;
  /** where the other hand holds a cord still */
  private otherHand: THREE.Group;
  private pan: { mx: number; my: number } | null = null;
  private mouse = new THREE.Vector2();
  private mousePx = { x: 0, y: 0 };
  private ray = new THREE.Raycaster();
  private acc = 0;
  /** physics steps dropped by the loop since the last report (see `tick`) */
  private dropped = 0;
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
  counters = { hovered: 0, dragged: 0, plugged: 0, unplugged: 0, orbited: 0, deposited: 0, pinched: 0, handedOver: 0, routed: 0 };
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
  /** the cabinet as the player found it (image), taken on the first frame, and its readability note */
  before: string | null = null;
  startNote = 0;

  constructor(public stage: Stage, level: LevelDef, private events: ControllerEvents, threaded = true) {
    this.world = new World(level);
    this.world.preroll(30);
    if (threaded) this.world.sim.startWorker();
    const types = new Map<number, FibreType>();
    this.world.circuits.forEach((c) => types.set(this.world.rack.port(c.a).unit, c.type));
    this.rackView = new RackView(this.world.rack, types);
    this.guide = makeGuide();
    stage.scene.add(this.guide);
    this.otherHand = makeOtherHand();
    stage.scene.add(this.otherHand);
    this.strokeView = new THREE.Group();
    stage.scene.add(this.strokeView);
    this.ends = new THREE.Group();
    stage.scene.add(this.ends);
    this.cableView = new CableView(this.world);
    this.cableView.lightBy(this.rackView.glow);
    stage.scene.add(this.rackView.group, this.cableView.group);
    const r = this.world.rack;
    // the cabinet and, at its right, the crate on the floor
    stage.frame((r.topY + r.floorY) / 2 + 0.01, r.topY - r.floorY + 0.16, 0.6, 0.16);
    this.rackView.syncItems(this.world.itemsVersion);
    this.cableView.update(true);
    this.lastEval = this.world.evaluate();
    this.startNote = this.lastEval.readability.note;
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
    for (const g of [this.rackView.group, this.cableView.group, this.guide, this.otherHand, this.strokeView, this.ends, this.ghost]) {
      if (!g) continue;
      this.stage.scene.remove(g);
      disposeTree(g);
    }
  }

  setTool(t: Tool): void {
    if (this.stroke) this.clearStroke();
    this.tool = t;
    this.updateGhost();
    this.stage.renderer.domElement.style.cursor = t === 'hand' ? 'grab' : 'crosshair';
    if (t !== 'hand' && this.hover) this.setHover(null);
  }

  /** highlights the cords and ports of one line of the schedule (−1: none) */
  focus(circuit: number): void {
    this.focusCircuit = circuit;
    for (const m of this.rackView.portMarkers.values()) m.visible = false;
    if (circuit >= 0) {
      const ci = this.world.circuits[circuit];
      for (const id of [ci.a, ci.b]) this.rackView.marker(id).visible = true;
    }
    this.refreshHighlights();
  }

  // ------------------------------------------------------------- loop

  private frame = (): void => {
    if (this.disposed) return;
    requestAnimationFrame(this.frame);
    const now = performance.now();
    if (!this.stage.due(now)) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.tick(dt);
  };

  /** advances the game by dt seconds and draws it */
  tick(dt: number, draw = true): void {
    if (this.running) {
      this.elapsed += dt;
      for (const i of this.world.tickDowntime(dt)) {
        this.events.onToast(`Liaison ${i + 1} rétablie : sa dérivation revient au stock.`);
        this.events.onInventory();
      }
    }
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
    this.firmPinch();
    const h = this.world.sim.P.dt;
    this.acc += this.preparing ? 0 : dt;
    let steps = 0;
    while (this.acc >= h && steps < 2) {
      this.stepHand();
      this.stepRoute(h);
      this.acc -= h;
      steps++;
    }
    if (this.acc > h) { this.dropped += Math.floor(this.acc / h); this.acc = 0; } // too slow: drop time rather than spiral
    if (steps) this.world.sim.advance(steps);
    const ms = this.world.sim.stats.ms;
    this.syncCableView();
    this.cableView.update();
    this.rackView.syncItems(this.world.itemsVersion);
    this.evalTimer += dt;
    if (this.evalTimer > 0.4) {
      this.evalTimer = 0;
      this.reevaluate();
      // frames of physics given up since the last report (the page or the worker too slow):
      // the game then runs in slow motion rather than stutters, so it must be seen
      const lost = this.dropped + this.world.sim.dropped;
      this.dropped = 0;
      this.world.sim.dropped = 0;
      if (this.debug) {
        const s = this.world.sim.stats;
        this.events.onStats(`${this.world.sim.n} nœuds · ${s.contacts} contacts · ${s.awake}/${this.world.cables.length} câbles actifs · physique ${ms.toFixed(1)} ms${this.world.sim.threaded ? ' (worker)' : ''}${lost ? ` · ${lost} pas perdus` : ''}`);
      }
    }
    this.updateGlows();
    this.updateHoldView();
    this.updateEnds();
    // the other hand, where it holds (it lets go when the cords are rebuilt)
    const sim = this.world.sim;
    this.otherHand.visible = sim.holdNode >= 0;
    if (sim.holdNode >= 0) this.otherHand.position.set(sim.holdTarget[0], sim.holdTarget[1], sim.holdTarget[2]);
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
    const guide = this.guide.visible, other = this.otherHand.visible;
    this.guide.visible = false;
    this.otherHand.visible = false;
    this.ends.visible = false;
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
    this.otherHand.visible = other;
    this.ends.visible = true;
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
    d.pull = null;
    const cut = this.liveLinksOf(d.cable);
    w.unplug(d.cable, p.end);
    this.sayCut(cut);
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
    const mods = (e: KeyboardEvent) => {
      if (e.shiftKey === this.keys.shift) return;
      this.keys = { shift: e.shiftKey };
      this.updateGhost(true);
    };
    on(window, 'keydown', mods);
    on(window, 'keyup', mods);
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || document.querySelector('.overlay.on')) return;
      const p = this.drag ? null : this.hover;
      if (e.code === 'KeyT' && p) this.trace(p.cable);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && p) {
        e.preventDefault();
        this.deposit(p.cable);
      }
    });
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (e.code !== 'Space' || document.querySelector('.overlay.on')) return;
      // not a click on whatever button has the focus
      e.preventDefault();
      if (e.repeat) return;
      if (this.drag) this.setPinch('space', true);
      else this.unpinchHovered();
    });
    on(window, 'keyup', (e: KeyboardEvent) => { if (e.code === 'Space' && this.drag) this.setPinch('space', false); });
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (e.code !== 'KeyE' || e.repeat || e.ctrlKey || e.metaKey || document.querySelector('.overlay.on')) return;
      if (this.drag) this.handOver();
      else this.letGoOtherHand();
    });
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
    if (this.stroke) { this.extendStroke(); return; }
    if (this.band) { this.extendBand(); return; }
    if (this.drag && e.shiftKey !== this.drag.depthMode) this.setDepthMode(e.shiftKey);
    if (this.drag) {
      // the right button pressed while the left one holds the cord: a chord,
      // which comes as a move with the new buttons rather than a pointerdown
      this.setPinch('right', (e.buttons & 2) !== 0);
      this.updatePortHint();
      return;
    }
    if (this.picksCords()) {
      const p = this.pick();
      this.setHover(p);
      const stacked = p ? this.pickAll().length : 0;
      let pinched = p && this.tool === 'hand' && this.pinchNear(p.node) >= 0 ? '<br><i>Coude pincé — Espace : le relâcher</i>' : '';
      if (p && this.tool === 'hand' && this.otherHandAt(p.node)) pinched += '<br><i>Tenu par l\'autre main — E : la lâcher</i>';
      if (p) this.events.onHover(this.describe(p) + pinched + (stacked > 1 ? `<br><i>${stacked} câbles sous le curseur — Tab : suivant</i>` : ''), e.clientX, e.clientY);
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
    // any gesture stops a cord being laid where it is
    this.stopRoute();
    if (this.preparing && this.tool !== 'supports') {
      // the cabinet stands still: the view moves, the cords wait
      this.pan = { mx: e.clientX, my: e.clientY };
      this.stage.renderer.domElement.style.cursor = 'move';
      return;
    }
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
    } else if (this.tool === 'route') {
      const p = this.pick();
      if (!p) {
        this.pan = { mx: e.clientX, my: e.clientY };
        this.stage.renderer.domElement.style.cursor = 'move';
        return;
      }
      this.startStroke(p.cable);
      this.stage.renderer.domElement.setPointerCapture(e.pointerId);
    } else if (this.tool === 'velcro') {
      if (this.removeStrapUnderPointer()) return;
      this.band = { a: { ...this.mousePx }, b: { ...this.mousePx }, nodes: [], lit: new Set() };
      this.stage.renderer.domElement.setPointerCapture(e.pointerId);
    } else {
      this.applySupport();
    }
  }

  /** unplugs a cord, coils it and throws it in the crate (Delete over it) */
  private deposit(c: number): void {
    this.stopRoute();
    const cut = this.liveLinksOf(c);
    this.remember();
    this.world.depositCable(c);
    this.counters.deposited++;
    sfx.unplug();
    this.sayCut(cut);
    this.setHover(null);
    this.events.onHover(null, 0, 0);
    this.afterRewire();
  }

  /** the preparation is over: the cords move, the clock and the downtime run */
  startWork(): void {
    this.preparing = false;
    this.running = true;
    this.last = performance.now();
  }

  /** remembers the cabinet before a gesture, for Ctrl+Z */
  private remember(): void {
    this.history.push(this.world.snapshot());
    if (this.history.length > 30) this.history.shift();
  }

  /** puts the cabinet back as it was before the last gesture */
  undo(): void {
    if (this.drag || this.stroke) return;
    this.stopRoute();
    const s = this.history.pop();
    if (!s) { this.events.onToast('Rien à annuler.'); return; }
    this.world.sim.letGoStill();
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

  /** the production links a cord carries now (unplugging it cuts them) */
  private liveLinksOf(c: number): number[] {
    return [...this.world.live].filter((i) => this.world.circuitUp(i) && this.world.rack.port(this.world.circuits[i].a).plug >> 1 === c);
  }

  /** production links just cut: what each second of them costs */
  private sayCut(links: number[]): void {
    const cost = links.reduce((a, i) => a + this.world.cutCost(i), 0);
    if (!links.length) return;
    const names = links.map((i) => `${i + 1} (${SERVICES[this.world.circuits[i].service].name})`).join(', ');
    this.events.onToast(cost > 0
      ? `Liaison ${names} coupée : ${fmtCost(cost)} par seconde sur le budget d'interruption. Rebranchez vite.`
      : `Liaison ${names} coupée, mais sa dérivation porte le trafic.`);
  }

  /** every tool but the rack items works on a cord */
  private picksCords(): boolean {
    return CORD_TOOLS.has(this.tool);
  }

  /** a new cord from the stock, in the crate; false when there is none of that length left */
  newCord(type: FibreType, length: number, color?: string): boolean {
    this.stopRoute();
    if (this.world.takeCord(type, length, color) < 0) {
      this.events.onToast('Plus aucun cordon de cette longueur en stock.');
      sfx.error();
      return false;
    }
    sfx.place();
    this.afterRewire();
    return true;
  }

  /** puts a bypass on a production link, or takes it off */
  toggleBypass(i: number): void {
    if (!this.world.toggleBypass(i)) {
      this.events.onToast(this.world.live.has(i) ? 'Plus de dérivation en stock.' : 'Seules les liaisons en production (⚡) se dérivent.');
      sfx.error();
      return;
    }
    sfx.label();
    this.events.onInventory();
    this.reevaluate();
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
    this.traffic();
    this.events.onEval(this.lastEval);
  }

  /** production lines down as of the last evaluation */
  private down = new Set<number>();

  /** a production line cut: the traffic drops; back up: it comes back, and its cord glows */
  private traffic(): void {
    const w = this.world;
    const now = new Set([...w.live].filter((i) => !w.circuitUp(i)));
    const cut = [...now].some((i) => !this.down.has(i) && !w.bypassed.has(i));
    const back = [...this.down].filter((i) => !now.has(i));
    this.down = now;
    if (cut) sfx.cut();
    if (!back.length) return;
    sfx.restore();
    for (const i of back) {
      const c = this.lastEval.circuits[i].cable;
      if (c >= 0) this.glows.set(c, this.clock + 1.2);
    }
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
    this.cableView.lightBy(this.rackView.glow);
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
    for (const e of this.world.cables[c].ends) if (e.port) this.rackView.marker(e.port).visible = true;
    sfx.label();
  }

  /** how far the hand had travelled when the current drag began (a mere click is not worth an undo) */
  private dragStartedAt = 0;

  /** `hook`: a loose connector let go in the air stays hooked there (not when the other hand takes the cord) */
  private onUp(_e: PointerEvent | null, hook = true): void {
    if (this.pan) { this.pan = null; this.stage.renderer.domElement.style.cursor = 'default'; return; }
    if (this.stroke) { this.endStroke(); return; }
    if (this.band) { this.endBand(); return; }
    if (!this.drag) return;
    if (this.counters.dragged - this.dragStartedAt < 0.002 && !this.portHint && !(this.drag.end >= 0) && !this.drag.pinched) this.history.pop();
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
      } else if (hook && this.canHook(d.target)) {
        // let go in front of the cabinet, a connector stays hooked where it is
        this.world.park(d.cable, d.end);
        sfx.grab();
      }
    }
    this.setPortHint(null);
    this.stage.renderer.domElement.style.cursor = 'grab';
    this.refreshHighlights();
  }

  // ------------------------------------------------------------ routes

  /** the route tool takes a cord: the way starts there */
  private startStroke(cable: number): void {
    this.stroke = { cable, guides: [], legs: [[]], over: -1, pts: [], port: null, last: { x: -1e9, y: -1e9 } };
    this.cableView.setHighlight(cable, true, '#7ee0ff');
    this.events.onHover(null, 0, 0);
    this.events.onHint('Tracez le chemin du câble <b>par-dessus les guides</b>, dans l\'ordre où il doit les traverser (guide-câbles, anneaux, goulottes), et finissez sur un <b>port libre</b> pour l\'y brancher. Relâchez : le câble est posé le long du chemin.');
    sfx.grab();
    this.extendStroke();
  }

  /** the pointer moved while drawing: the line grows, the guides under it join the way in order */
  private extendStroke(): void {
    const st = this.stroke!;
    if (Math.hypot(this.mousePx.x - st.last.x, this.mousePx.y - st.last.y) < 4) return;
    st.last = { x: this.mousePx.x, y: this.mousePx.y };
    const p = this.pointerOnPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.09), 0);
    if (p) st.pts.push(p);
    // a guide joins the way when the line enters it; entered again later,
    // it moves to that later place (the line crossed it on the way), the
    // legs either side of where it was joined
    const g = this.guideUnderPointer();
    if (g && g.item !== st.over) {
      const j = st.guides.findIndex((q) => q.item === g.item);
      if (j >= 0 && j === st.guides.length - 1) st.legs[j + 1] = [];
      else {
        if (j >= 0) {
          st.guides.splice(j, 1);
          st.legs.splice(j, 2, [...st.legs[j], ...st.legs[j + 1]]);
        }
        st.guides.push(g);
        st.legs.push([]);
        sfx.label();
      }
    }
    if (!g && p) st.legs[st.legs.length - 1].push([p.x, p.y, p.z]);
    st.over = g?.item ?? -1;
    // a port only when the line ends on it, not on a guide next to it
    st.port = g ? null : this.portUnderPointer();
    this.setPortHint(st.port);
    this.drawStroke();
  }

  /** let go: the way is planned, and the cord laid along it (or the player told why not) */
  private endStroke(): void {
    const st = this.stroke!;
    this.clearStroke();
    const res = planRoute(this.world, st.cable, st.guides, st.port, st.legs);
    if ('error' in res) {
      this.events.onToast(res.error);
      sfx.error();
      return;
    }
    const b = 1 - res.plan.a, end = this.world.cables[st.cable].ends[b];
    if (res.plan.portB && end.port) this.sayCut(this.liveLinksOf(st.cable));
    this.remember();
    this.world.unpark(st.cable, b);
    this.routing = new RouteRun(this.world, res.plan);
    this.counters.routed++;
    if (res.plan.slack > 0.2) this.events.onToast(`Ce cordon a ${Math.round(res.plan.slack * 100)} cm de trop pour ce chemin : le mou est rangé dans les guides, ou pend (un cordon plus court se prend au Stock).`);
    sfx.whoosh();
  }

  /** a connector let go there stays hooked: in front of the cabinet, not over the crate nor on the floor */
  private canHook(t: THREE.Vector3): boolean {
    const r = this.world.rack;
    return t.z > 0 && Math.abs(t.x) < WALL_X && t.y > r.floorY + 0.06;
  }

  private clearStroke(): void {
    const st = this.stroke;
    this.stroke = null;
    if (st) this.cableView.setHighlight(st.cable, false);
    this.setPortHint(null);
    this.events.onHint(null);
    for (const o of [...this.strokeView.children]) { this.strokeView.remove(o); disposeTree(o); }
    this.refreshHighlights();
  }

  /** the line drawn so far, and a frame round each guide it takes */
  private drawStroke(): void {
    const st = this.stroke!;
    for (const o of [...this.strokeView.children]) { this.strokeView.remove(o); disposeTree(o); }
    if (st.pts.length > 1) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(st.pts), new THREE.LineBasicMaterial({ color: '#7ee0ff', transparent: true, opacity: 0.9, depthTest: false }));
      line.renderOrder = 30;
      this.strokeView.add(line);
    }
    const col = ['#3fbf6a', '#7dff9a'];
    for (const g of st.guides) {
      const b = g.reach;
      const size = new THREE.Vector3(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
      const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
      const box = new THREE.Group();
      box.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col[0], transparent: true, opacity: 0.14, depthWrite: false })));
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: col[1], transparent: true, opacity: 0.9, depthTest: false }));
      edges.renderOrder = 25;
      box.add(edges);
      box.position.set((b.max[0] + b.min[0]) / 2, (b.max[1] + b.min[1]) / 2, (b.max[2] + b.min[2]) / 2);
      this.strokeView.add(box);
    }
  }

  /** the guide under the pointer (the nearest along the ray), or null */
  private guideUnderPointer(): Guide | null {
    this.ray.setFromCamera(this.mouse, this.stage.camera);
    let best: Guide | null = null, bd = Infinity;
    const box = new THREE.Box3(), hit = new THREE.Vector3();
    for (const g of this.world.rack.guides()) {
      box.min.fromArray(g.reach.min);
      box.max.fromArray(g.reach.max);
      if (!this.ray.ray.intersectBox(box, hit)) continue;
      const d = hit.distanceTo(this.ray.ray.origin);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }

  /** the free port under the pointer, or null */
  private portUnderPointer(): Port | null {
    const cam = this.stage.camera, v = new THREE.Vector3();
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    let best: Port | null = null, bd = 18;
    for (const p of this.world.rack.ports) {
      if (p.plug >= 0) continue;
      v.set(p.x, p.y, 0).project(cam);
      const d = Math.hypot((v.x * 0.5 + 0.5) * rect.width - this.mousePx.x, (-v.y * 0.5 + 0.5) * rect.height - this.mousePx.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /** a physics step of the cord being laid; once there, what came of it */
  private stepRoute(h: number): void {
    const r = this.routing;
    if (!r || !r.step(h)) return;
    this.routing = null;
    const port = r.plan.portB;
    if (port && r.plugged) {
      this.counters.plugged++;
      sfx.plug(this.circuitOkAt(this.world.rack.port(port)));
    } else if (port) {
      this.events.onToast('Le connecteur n\'a pas pu atteindre le port : quelque chose le retient.');
      sfx.error();
    }
    this.reevaluate();
    this.holdView = { cable: r.plan.cable, until: this.clock + 1.6, next: 0 };
  }

  /** a cord being laid stops where it is */
  private stopRoute(): void {
    if (!this.routing) return;
    this.routing.cancel();
    this.routing = null;
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
    let pull: { end: number; from: THREE.Vector3 } | null = null;
    const eo = w.endOfNode(node);
    if (eo) {
      const [n0, n1] = w.endNodes(eo.cable, eo.end);
      if (w.cables[eo.cable].ends[eo.end].port) {
        // a plugged connector stays in until it is pulled: the hand takes the cord just behind its boot
        node = n1 + (eo.end === 0 ? 1 : -1);
        pull = { end: eo.end, from: new THREE.Vector3() };
        sfx.grab();
      } else {
        end = eo.end;
        node = n0;
        // a hooked connector is taken off its hook
        w.unpark(eo.cable, eo.end);
      }
    } else sfx.grab();
    // taking the cord where the other hand holds it: it lets go
    if (this.otherHandAt(node)) w.sim.letGoStill();
    w.sim.grab(node);
    const dir = new THREE.Vector3();
    this.stage.camera.getWorldDirection(dir);
    const at = new THREE.Vector3(w.sim.x[3 * node], w.sim.x[3 * node + 1], w.sim.x[3 * node + 2]);
    if (pull) pull.from.copy(at);
    // the hand moves on a plane facing the camera, through the grabbed point
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(dir.clone().negate(), at);
    this.drag = { node, cable: p.cable, plane, depth: 0, target: at.clone(), end, depthMode: false, anchor: { mx: this.mousePx.x, my: this.mousePx.y, t: at.clone() }, offset: new THREE.Vector3(), pull, pinchBy: { space: false, right: false }, pinched: false, pinchSince: -1 };
    this.holdView = { cable: p.cable, until: Infinity, next: 0 };
    this.cableView.pinchHover = -1;
    this.cableView.pinchShown = p.cable;
    this.events.onHint(pull
      ? '<b>Tirez</b> le connecteur de quelques centimètres pour le débrancher ; sinon vous rangez simplement le câble.'
      : 'Maintenez <b>Maj</b> pour pousser le câble vers le fond (souris vers le haut) ou le ramener vers vous (vers le bas). Maintenez <b>Espace</b> (ou le clic droit) pour pincer : le câble garde le coude qu\'il fait sous la main, d\'autant plus fermement que vous pincez longtemps. <b>E</b> : l\'autre main tient le câble ici, et la vôtre est libre. <span class="ok">Vert</span> : tenu, <span class="warn">orange</span> : pend trop.');
    this.stage.controls.enableZoom = false;
    this.stage.renderer.domElement.style.cursor = 'grabbing';
    this.events.onHover(null, 0, 0);
    this.refreshHighlights();
  }

  /**
   * Space or the right button, pressed or released while the hand holds a
   * cord. Either one pinches: the cord around the hand keeps the shape it has
   * when the pinch ends, the more firmly the longer it lasted (rings show it).
   */
  private setPinch(by: 'space' | 'right', down: boolean): void {
    const d = this.drag;
    if (!d || d.pinchBy[by] === down) return;
    const was = d.pinchBy.space || d.pinchBy.right;
    d.pinchBy[by] = down;
    const on = d.pinchBy.space || d.pinchBy.right;
    if (on === was) return;
    this.world.sim.pinch(on);
    d.pinchSince = on ? this.clock : -1;
    if (on) { this.counters.pinched++; d.pinched = true; sfx.pinch(); }
  }

  /** the pinch being made firms up with the time it has been held */
  private firmPinch(): void {
    const d = this.drag;
    if (!d || d.pinchSince < 0) return;
    const P = this.world.sim.P;
    const s = Math.min(1, P.pinchStart + P.pinchGrow * (this.clock - d.pinchSince));
    if (s > (this.world.sim.pinchHeld?.s ?? 1)) this.world.sim.firmPinch(s);
  }

  /**
   * E while carrying a cord: the other hand takes it where it is and holds it
   * still, and this one is free to take the cord further along (or another).
   */
  private handOver(): void {
    const d = this.drag, sim = this.world.sim;
    if (!d || sim.grabNode < 0) return;
    const t = sim.grabTarget;
    sim.holdStill(sim.grabNode, t[0], t[1], t[2]);
    this.counters.handedOver++;
    // no plugging on the way: the cord stays where the other hand holds it
    this.setPortHint(null);
    this.onUp(null, false);
    sfx.grab();
  }

  /** E with the hand free: the other hand lets go */
  private letGoOtherHand(): void {
    const sim = this.world.sim;
    if (sim.holdNode < 0) return;
    sim.letGoStill();
    sfx.remove();
  }

  /** does the other hand hold node i, or one next to it? */
  private otherHandAt(i: number): boolean {
    const sim = this.world.sim, h = sim.holdNode;
    return h >= 0 && Math.abs(h - i) <= 1 && sim.cableOf[h] === sim.cableOf[i];
  }

  /** the pinch holding node i or one next to it, or −1 */
  private pinchNear(i: number): number {
    const sim = this.world.sim;
    for (const j of [i, i - 1, i + 1]) if (j >= 0 && j < sim.n && sim.cableOf[j] === sim.cableOf[i] && sim.pinchOf[j] >= 0) return sim.pinchOf[j];
    return -1;
  }

  /** Space over a pinch: the cord lets go of it */
  private unpinchHovered(): void {
    const p = this.hover;
    if (!p || this.tool !== 'hand') return;
    const k = this.pinchNear(p.node);
    if (k < 0) return;
    this.remember();
    this.world.sim.unpinch(this.world.sim.pinches[k].a);
    this.cableView.pinchHover = -1;
    this.events.onHover(null, 0, 0);
    sfx.remove();
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
      const m = this.rackView.marker(this.portHint.id);
      m.visible = false;
      (m.material as THREE.MeshBasicMaterial).color.set('#7ee0ff');
    }
    this.portHint = p;
    if (p) {
      const m = this.rackView.marker(p.id);
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

  /** a point to the screen (px), and its depth, into out[o..o+2] */
  private projector(): (px: number, py: number, pz: number, out: Float32Array, o: number) => void {
    const cam = this.stage.camera;
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements;
    const W = rect.width, H = rect.height;
    return (px, py, pz, out, o) => {
      const cx = m[0] * px + m[4] * py + m[8] * pz + m[12];
      const cy = m[1] * px + m[5] * py + m[9] * pz + m[13];
      const cw = m[3] * px + m[7] * py + m[11] * pz + m[15];
      out[o] = (cx / cw * 0.5 + 0.5) * W;
      out[o + 1] = (-cy / cw * 0.5 + 0.5) * H;
      out[o + 2] = cw;
    };
  }

  /** every node on the screen (px) with its depth, three numbers a node */
  private projectNodes(): Float32Array {
    const sim = this.world.sim, N = sim.n, x = sim.x;
    if (this.screen.length < N * 3) this.screen = new Float32Array(N * 3);
    const project = this.projector();
    for (let i = 0; i < N; i++) project(x[3 * i], x[3 * i + 1], x[3 * i + 2], this.screen, 3 * i);
    return this.screen;
  }

  private pickAll(): Pick[] {
    const cam = this.stage.camera;
    const H = this.stage.renderer.domElement.getBoundingClientRect().height;
    const S = this.projectNodes();
    const project = this.projector();
    const x = this.world.sim.x;
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
    // the pinch under the pointer, which Space would let go of; the pinches of the cord under it
    this.cableView.pinchHover = p && this.tool === 'hand' ? this.pinchNear(p.node) : -1;
    this.cableView.pinchShown = p && this.tool === 'hand' ? p.cable : -1;
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
    const ends = (known ? cb.ends.map((e) => e.port ?? '—').join(' ↔ ') : 'sans marque — <b>T</b> pour le tracer') + ` · ${this.world.cableLength(p.cable).toFixed(2).replace('.', ',')} m`;
    let what = `<b>${FIBRE_NAMES[cb.type]}</b> · ${ends}`;
    if (ci >= 0) what += ` · <span class="ok">liaison ${ci + 1} ✓</span>`;
    const strain = this.lastEval.cableStrain[p.cable];
    if (strain) what += ` · <span class="warn">${strain}</span>`;
    if (this.tool === 'hand' && (p.end >= 0 || w.endOfNode(p.node))) {
      const plugged = cb.ends[p.end >= 0 ? p.end : w.endOfNode(p.node)!.end].port;
      what += plugged ? '<br><i>connecteur : saisir et tirer pour débrancher</i>' : '<br><i>connecteur : relâchez-le devant un port pour le brancher</i>';
    }
    if (this.tool === 'hand') what += '<br><i>T : tracer · Suppr : au bac</i>';
    return what;
  }

  // ------------------------------------------------------------- tools

  /** a click on a strap takes it off; false when there is none under the pointer */
  private removeStrapUnderPointer(): boolean {
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
    if (!hit) return false;
    this.world.removeStrap(hit);
    sfx.remove();
    this.events.onInventory();
    return true;
  }

  /** the line of the velcro grew: the cords it crosses light up */
  private extendBand(): void {
    const band = this.band!;
    band.b = { ...this.mousePx };
    band.nodes = this.bandNodes(band.a, band.b);
    const now = new Set(band.nodes.map((i) => this.world.sim.cableOf[i]));
    for (const c of band.lit) if (!now.has(c)) this.cableView.setHighlight(c, false);
    const ok = band.nodes.length >= 2;
    for (const c of now) this.cableView.setHighlight(c, true, '#7a5a10');
    band.lit = now;
    this.drawBand(ok);
    const n = band.nodes.length;
    this.events.onHint(ok
      ? `<b>${n} câbles</b> : relâchez, le velcro les serre là où le trait les croise.`
      : 'Tracez le trait <b>en travers</b> des câbles à serrer, là où ils passent côte à côte : ceux qu\'il prend s\'allument.');
  }

  /** let go: the velcro straps the cords the line crossed, if they lie close together */
  private endBand(): void {
    const band = this.band!;
    this.band = null;
    for (const c of band.lit) this.cableView.setHighlight(c, false);
    for (const o of [...this.strokeView.children]) { this.strokeView.remove(o); disposeTree(o); }
    this.events.onHint(null);
    this.refreshHighlights();
    if (Math.hypot(band.b.x - band.a.x, band.b.y - band.a.y) < 6) {
      this.events.onToast('Velcro : tracez un trait en travers des câbles à serrer (un clic sur un velcro l\'enlève).');
      return;
    }
    if (this.world.inventory.velcro <= 0) { this.events.onToast('Plus de velcro.'); sfx.error(); return; }
    if (band.nodes.length < 2) { this.events.onToast('Le trait doit croiser au moins deux câbles qui passent côte à côte.'); sfx.error(); return; }
    this.world.strapNodes(band.nodes);
    sfx.velcro();
    this.events.onInventory();
  }

  /** a strap closes round the cords that pass within this of where it goes (m): about a unit across */
  private static readonly BAND_REACH = 0.045;

  /**
   * The nodes the velcro drawn from a to b (screen px) would strap: where
   * the line crosses the cords (away from their connectors, not strapped
   * already), the strap goes where most cords cross close together, and takes
   * the crossing of each cord nearest there, if close enough. A cord crossed
   * twice (a loop hanging in front of a manager) is strapped where the
   * others are, and one crossed far from the bundle is left out.
   */
  private bandNodes(a: { x: number; y: number }, b: { x: number; y: number }): number[] {
    const S = this.projectNodes();
    const sim = this.world.sim, x = sim.x;
    const hits: { c: number; node: number; w: number }[] = [];
    const dx = b.x - a.x, dy = b.y - a.y;
    this.world.cables.forEach((cb, c) => {
      for (let i = cb.start + 2; i < cb.start + cb.count - 3; i++) {
        const px = S[3 * i], py = S[3 * i + 1], ex = S[3 * i + 3] - px, ey = S[3 * i + 4] - py;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((px - a.x) * ey - (py - a.y) * ex) / den;
        const u = ((px - a.x) * dy - (py - a.y) * dx) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const near = u < 0.5 ? i : i + 1, far = u < 0.5 ? i + 1 : i;
        const node = sim.bundleOf[near] < 0 ? near : sim.bundleOf[far] < 0 ? far : -1;
        if (node >= 0) hits.push({ c, node, w: S[3 * i + 2] + (S[3 * i + 5] - S[3 * i + 2]) * u });
      }
    });
    if (!hits.length) return [];
    const d = (i: number, j: number) => Math.hypot(x[3 * i] - x[3 * j], x[3 * i + 1] - x[3 * j + 1], x[3 * i + 2] - x[3 * j + 2]);
    const R = Controller.BAND_REACH;
    // the crossing with the most other cords crossed close to it (the frontmost, between equals)
    const around = (h: (typeof hits)[number]) => new Set(hits.filter((q) => d(q.node, h.node) <= R).map((q) => q.c)).size;
    let anchor = hits[0], most = -1;
    for (const h of hits) {
      const n = around(h);
      if (n > most || (n === most && h.w < anchor.w)) { anchor = h; most = n; }
    }
    const best = new Map<number, { node: number; d: number }>();
    for (const h of hits) {
      const e = d(h.node, anchor.node);
      if (e > R) continue;
      const old = best.get(h.c);
      if (!old || e < old.d) best.set(h.c, { node: h.node, d: e });
    }
    return [...best.values()].map((v) => v.node);
  }

  /** the line of the velcro, drawn where it crosses the cords (green: it will hold; grey: fewer than two cords) */
  private drawBand(ok: boolean): void {
    const band = this.band!;
    for (const o of [...this.strokeView.children]) { this.strokeView.remove(o); disposeTree(o); }
    const x = this.world.sim.x;
    const z = band.nodes.length ? band.nodes.reduce((s, i) => s + x[3 * i + 2], 0) / band.nodes.length : 0.06;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z);
    const at = (p: { x: number; y: number }) => {
      const r = this.stage.renderer.domElement.getBoundingClientRect();
      this.ray.setFromCamera(new THREE.Vector2((p.x / r.width) * 2 - 1, -(p.y / r.height) * 2 + 1), this.stage.camera);
      return this.ray.ray.intersectPlane(plane, new THREE.Vector3());
    };
    const pa = at(band.a), pb = at(band.b);
    if (!pa || !pb) return;
    const col = ok ? '#7dff9a' : '#9a9a9a';
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pa, pb]), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthTest: false }));
    line.renderOrder = 30;
    this.strokeView.add(line);
    for (const i of band.nodes) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthTest: false }));
      dot.position.set(x[3 * i], x[3 * i + 1], x[3 * i + 2]);
      dot.renderOrder = 31;
      this.strokeView.add(dot);
    }
  }

  /**
   * What the supports tool would do under the pointer: in an empty unit, a
   * finger manager; in a side channel, a duct (a ring with Shift, or when no
   * duct is left); on an item already there, take it off.
   */
  private supportSlot(): { kind: ItemKind; unit: number; side: number; existing?: Item } | null {
    this.ray.setFromCamera(this.mouse, this.stage.camera);
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.03), p)) return null;
    const r = this.world.rack;
    const unit = Math.floor((r.topY - p.y) / U);
    if (unit < 0 || unit >= r.units.length) return null;
    if (Math.abs(p.x) < COLUMN_X) {
      const existing = r.itemAt('hmgr', unit, 0);
      return { kind: 'hmgr', unit, side: 0, existing };
    }
    if (Math.abs(p.x) < COLUMN_X - 0.03 || Math.abs(p.x) > WALL_X + 0.04) return null;
    const side = Math.sign(p.x);
    const existing = r.itemAt('duct', unit, side);
    if (existing) return { kind: existing.kind, unit, side, existing };
    const kind: ItemKind = this.keys.shift || this.world.inventory.duct <= 0 ? 'vring' : 'duct';
    return { kind, unit, side };
  }

  private applySupport(): void {
    const s = this.supportSlot();
    if (!s) return;
    const w = this.world;
    if (s.existing) {
      if (s.existing.locked) { this.events.onToast('Cet élément est fixé à la baie.'); sfx.error(); return; }
      w.removeItem(s.existing);
      sfx.remove();
    } else {
      const names = { hmgr: 'guide-câbles', duct: 'goulotte', vring: 'anneau' };
      if (w.inventory[s.kind] <= 0) { this.events.onToast(`Plus de ${names[s.kind]} en stock.`); sfx.error(); return; }
      if (!w.placeItem(s.kind, s.unit, s.side)) { this.events.onToast(s.kind === 'hmgr' ? 'Un guide-câbles se pose dans une unité vide.' : 'Emplacement occupé.'); sfx.error(); return; }
      sfx.place();
    }
    this.updateGhost(true);
    this.events.onInventory();
  }

  private updateGhost(force = false): void {
    let key = '';
    const s = this.tool === 'supports' ? this.supportSlot() : null;
    if (s) key = `${s.kind}:${s.unit}:${s.side}:${this.world.itemsVersion}`;
    if (key === this.ghostKey && !force) return;
    this.ghostKey = key;
    if (this.ghost) { this.stage.scene.remove(this.ghost); disposeTree(this.ghost); this.ghost = null; }
    if (!s) return;
    const rack = this.world.rack, k = s.kind;
    const ok = s.existing ? !s.existing.locked : rack.canPlace(k, s.unit, s.side) && this.world.inventory[k] > 0;
    const it: Item = s.existing ?? { id: -99, kind: k, unit: k === 'duct' ? rack.ductStart(s.unit) : s.unit, side: s.side, span: k === 'duct' ? 4 : 1, locked: false };
    this.ghost = buildItem(rack, { ...it, id: -99 }, null, s.existing || !ok ? ghostBadMat : ghostMat);
    this.stage.scene.add(this.ghost);
  }

  /** a glow on every free connector: loose (cyan) or hooked in the air (amber), so that none is lost in the heap */
  private updateEnds(): void {
    const want: { at: [number, number, number]; hooked: boolean }[] = [];
    this.world.cables.forEach((cb, c) => cb.ends.forEach((e, k) => {
      if (e.port || (this.drag && this.drag.cable === c && this.drag.end === k)) return;
      want.push({ at: this.world.connectorTip(c, k), hooked: !!e.parked });
    }));
    const g = this.ends;
    while (g.children.length < want.length) g.add(makeEndGlow());
    g.children.forEach((o, i) => {
      o.visible = i < want.length;
      if (!o.visible) return;
      const w = want[i];
      o.position.set(w.at[0], w.at[1], w.at[2]);
      const pulse = 1 + 0.25 * Math.sin(this.clock * 4 + i);
      o.scale.setScalar(pulse);
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(w.hooked ? '#ffb347' : '#5cd8ff');
    });
  }

  /**
   * A line of the schedule clicked: the loose end of its cord is brought out
   * of the heap and hooked just under the port it belongs in.
   */
  fetchEnd(circuit: number): void {
    const w = this.world, ci = w.circuits[circuit];
    const free = [ci.a, ci.b].map((id) => w.rack.port(id)).filter((p) => p.plug < 0);
    if (!free.length) { this.events.onToast('Ses deux ports sont occupés.'); return; }
    // its own cord first (the one made for it), else any cord of its type with a loose end
    const loose = (c: number) => w.cables[c].ends.findIndex((e) => !e.port);
    const plugged = [ci.a, ci.b].map((id) => w.rack.port(id).plug).find((pl) => pl >= 0);
    const order = [...(plugged !== undefined ? [plugged >> 1] : []), circuit, ...w.cables.map((_, c) => c)];
    const c = order.find((k) => k < w.cables.length && w.cables[k].type === ci.type && loose(k) >= 0);
    if (c === undefined) {
      this.events.onToast('Aucun cordon de ce type n\'a de bout libre : débranchez celui qui est sur un mauvais port.');
      sfx.error();
      return;
    }
    const e = loose(c), p = free[0];
    this.remember();
    this.stopRoute();
    w.park(c, e, [[p.x, p.y - 0.035, 0.09], [p.x, p.y - 0.035 - w.seg, 0.09]]);
    this.holdView = { cable: c, until: this.clock + 1.6, next: 0 };
    sfx.whoosh();
  }

  private refreshLeds(): void {
    const w = this.world, down = new Set<string>(), bypass = new Set<string>();
    for (const i of w.live) {
      if (w.circuitUp(i)) continue;
      const ci = w.circuits[i];
      for (const id of [ci.a, ci.b]) (w.bypassed.has(i) ? bypass : down).add(id);
    }
    this.rackView.showLeds(w.okPorts(this.lastEval), down, bypass);
  }
}

/** downtime per second, as the budget counts it */
export function fmtCost(v: number): string {
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, '').replace('.', ',')} pt${v > 1 ? 's' : ''}`;
}

/** the glow on a free connector */
function makeEndGlow(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 10), new THREE.MeshBasicMaterial({ color: '#5cd8ff', transparent: true, opacity: 0.35, depthTest: false }));
  m.renderOrder = 29;
  return m;
}

/** the depth cue while carrying a cord: plumb line, ring on the floor, tick on the rack */
/** the other hand: a soft glow round the point it holds, seen through the cords */
function makeOtherHand(): THREE.Group {
  const g = new THREE.Group();
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.011, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.35, depthTest: false }));
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.004, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffd28a', transparent: true, opacity: 0.9, depthTest: false }));
  for (const o of [glow, core]) { o.renderOrder = 31; g.add(o); }
  g.visible = false;
  return g;
}

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
