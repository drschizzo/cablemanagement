// The route tool (Chemin): the player draws a way from a cord over the
// guides, in the order it must take them, and ends it on a free port; let go,
// the cord is laid along the way (a RouteRun, a few physics steps at a time).

import * as THREE from 'three';
import { sfx } from '../../audio/sfx';
import { disposeTree } from '../../render/dispose';
import { RouteRun, planRoute } from '../../game/routeLaying';
import type { Guide, Port } from '../../game/rack';
import { SETTLE_SHOW } from '../feedback/holdView';
import { freePortUnderPointer, guideUnderPointer } from '../picking';
import type { PlayContext, ToolHandler } from '../context';

const LINE_COLOR = '#7ee0ff';
/** the frame round a guide taken: fill, edges */
const GUIDE_COLORS = ['#3fbf6a', '#7dff9a'];
/** the way is drawn on this plane (z, m), just in front of the equipment */
const DRAWING_Z = 0.09;
/** the pointer must move this much (px) for the line to grow */
const MIN_STEP_PX = 4;

/** the way being drawn */
interface Sketch {
  cable: number;
  /** the guides passed over, in order */
  guides: Guide[];
  /** the line outside them: one leg before each guide, one after the last */
  legs: [number, number, number][][];
  /** the guide under the pointer now (its item), or −1 */
  over: number;
  /** the line drawn, on the drawing plane */
  points: THREE.Vector3[];
  /** the port the way ends on */
  port: Port | null;
  /** the pointer when the line last grew (px) */
  last: { x: number; y: number };
}

export class RouteTool implements ToolHandler {
  readonly cursor = 'crosshair';
  readonly worksOnCords = true;
  readonly worksWhilePreparing = false;
  private sketch: Sketch | null = null;
  /** a cord being laid along its way */
  private laying: RouteRun | null = null;
  /** the line drawn, and a frame round each guide it takes */
  private view = new THREE.Group();

  constructor(private ctx: PlayContext) {
    ctx.stage.scene.add(this.view);
  }

  /** a way is being drawn */
  get drawing(): boolean {
    return this.sketch !== null;
  }

  pointerDown(e: PointerEvent): boolean {
    const p = this.ctx.picker.pick();
    if (!p) return false;
    this.start(p.cable);
    this.ctx.pointer.capture(e);
    return true;
  }

  pointerMove(): boolean {
    if (!this.sketch) return false;
    this.extend();
    return true;
  }

  pointerUp(): boolean {
    if (!this.sketch) return false;
    this.finish();
    return true;
  }

  cancel(): void {
    if (this.sketch) this.clear();
  }

  dispose(): void {
    this.ctx.stage.scene.remove(this.view);
    disposeTree(this.view);
  }

  /** the route tool takes a cord: the way starts there */
  private start(cable: number): void {
    const ctx = this.ctx;
    this.sketch = { cable, guides: [], legs: [[]], over: -1, points: [], port: null, last: { x: -1e9, y: -1e9 } };
    ctx.cableView.setHighlight(cable, true, LINE_COLOR);
    ctx.events.onHover(null, [], 0, 0);
    ctx.events.onHint({ kind: 'drawRoute' });
    sfx.grab();
    this.extend();
  }

  /** the pointer moved while drawing: the line grows, the guides under it join the way in order */
  private extend(): void {
    const sk = this.sketch!, ctx = this.ctx, px = ctx.pointer.px;
    if (Math.hypot(px.x - sk.last.x, px.y - sk.last.y) < MIN_STEP_PX) return;
    sk.last = { x: px.x, y: px.y };
    const p = ctx.pointer.onPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -DRAWING_Z), 0);
    if (p) sk.points.push(p);
    // a guide joins the way when the line enters it; entered again later,
    // it moves to that later place (the line crossed it on the way), the
    // legs either side of where it was joined
    const g = guideUnderPointer(ctx.world, ctx.pointer);
    if (g && g.item !== sk.over) {
      const j = sk.guides.findIndex((q) => q.item === g.item);
      if (j >= 0 && j === sk.guides.length - 1) sk.legs[j + 1] = [];
      else {
        if (j >= 0) {
          sk.guides.splice(j, 1);
          sk.legs.splice(j, 2, [...sk.legs[j], ...sk.legs[j + 1]]);
        }
        sk.guides.push(g);
        sk.legs.push([]);
        sfx.label();
      }
    }
    if (!g && p) sk.legs[sk.legs.length - 1].push([p.x, p.y, p.z]);
    sk.over = g?.item ?? -1;
    // a port only when the line ends on it, not on a guide next to it
    sk.port = g ? null : freePortUnderPointer(ctx.world, ctx.pointer);
    ctx.portHint.set(sk.port);
    this.draw();
  }

  /** let go: the way is planned, and the cord laid along it (or the player told why not) */
  private finish(): void {
    const sk = this.sketch!, ctx = this.ctx, w = ctx.world;
    this.clear();
    const res = planRoute(w, sk.cable, sk.guides, sk.port, sk.legs);
    if ('error' in res) {
      ctx.events.onToast({ kind: 'routeRefused', error: res.error });
      sfx.error();
      return;
    }
    const b = 1 - res.plan.a, end = w.cables[sk.cable].ends[b];
    if (res.plan.portB && end.port) ctx.announceCut(w.liveLinksCarriedBy(sk.cable));
    ctx.history.remember();
    w.unpark(sk.cable, b);
    this.laying = new RouteRun(w, res.plan);
    ctx.counters.routed++;
    if (res.plan.slack > 0.2) ctx.events.onToast({ kind: 'routeSlack', extra: res.plan.slack });
    sfx.whoosh();
  }

  private clear(): void {
    const sk = this.sketch, ctx = this.ctx;
    this.sketch = null;
    if (sk) ctx.cableView.setHighlight(sk.cable, false);
    ctx.portHint.set(null);
    ctx.events.onHint(null);
    this.clearView();
    ctx.refreshHighlights();
  }

  private clearView(): void {
    for (const o of [...this.view.children]) { this.view.remove(o); disposeTree(o); }
  }

  /** the line drawn so far, and a frame round each guide it takes */
  private draw(): void {
    const sk = this.sketch!;
    this.clearView();
    if (sk.points.length > 1) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(sk.points), new THREE.LineBasicMaterial({ color: LINE_COLOR, transparent: true, opacity: 0.9, depthTest: false }));
      line.renderOrder = 30;
      this.view.add(line);
    }
    for (const g of sk.guides) {
      const b = g.reach;
      const geo = new THREE.BoxGeometry(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
      const box = new THREE.Group();
      box.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: GUIDE_COLORS[0], transparent: true, opacity: 0.14, depthWrite: false })));
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: GUIDE_COLORS[1], transparent: true, opacity: 0.9, depthTest: false }));
      edges.renderOrder = 25;
      box.add(edges);
      box.position.set((b.max[0] + b.min[0]) / 2, (b.max[1] + b.min[1]) / 2, (b.max[2] + b.min[2]) / 2);
      this.view.add(box);
    }
  }

  // ------------------------------------------------------------- laying

  /** a physics step of the cord being laid; once there, what came of it */
  step(h: number): void {
    const run = this.laying, ctx = this.ctx;
    if (!run || !run.step(h)) return;
    this.laying = null;
    const port = run.plan.portB;
    if (port && run.plugged) {
      ctx.counters.plugged++;
      ctx.counters.moves++;
      sfx.plug(ctx.isLineConnectedAt(ctx.world.rack.port(port)));
    } else if (port) {
      ctx.events.onToast({ kind: 'connectorHeldBack' });
      sfx.error();
    }
    ctx.reevaluate();
    ctx.holdView.show(run.plan.cable, ctx.clock + SETTLE_SHOW);
  }

  /** a cord being laid stops where it is (any other gesture stops it) */
  stopLaying(): void {
    if (!this.laying) return;
    this.laying.cancel();
    this.laying = null;
  }
}
