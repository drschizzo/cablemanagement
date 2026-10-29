// The velcro: a line drawn across the cords to strap, where they pass side by
// side; let go, a strap closes round the cords it crossed. A click on a strap
// takes it off.

import * as THREE from 'three';
import { sfx } from '../../audio/sfx';
import { disposeTree } from '../../render/dispose';
import type { Strap } from '../../game/cables';
import type { PlayContext, ToolHandler } from '../context';
import type { ScreenPoint } from '../pointer';

/** a strap closes round the cords that pass within this of where it goes (m): about a unit across */
const STRAP_REACH = 0.045;
/** a click this close to a strap (px) takes it off */
const STRAP_CLICK_PX = 14;
/** a line shorter than this (px) is a click, not a velcro */
const MIN_LINE_PX = 6;
const CROSSED_TINT = '#7a5a10';

/** the velcro being drawn */
interface Line {
  /** where the button went down, and the pointer (px) */
  from: ScreenPoint;
  to: ScreenPoint;
  /** the node of each cord it would strap */
  nodes: number[];
  /** the cords lit because it crosses them */
  lit: Set<number>;
}

export class VelcroTool implements ToolHandler {
  readonly cursor = 'crosshair';
  readonly worksOnCords = false;
  readonly worksWhilePreparing = false;
  private line: Line | null = null;
  private view = new THREE.Group();

  constructor(private ctx: PlayContext) {
    ctx.stage.scene.add(this.view);
  }

  pointerDown(e: PointerEvent): boolean {
    if (this.removeStrapUnderPointer()) return true;
    const px = this.ctx.pointer.px;
    this.line = { from: { ...px }, to: { ...px }, nodes: [], lit: new Set() };
    this.ctx.pointer.capture(e);
    return true;
  }

  pointerMove(): boolean {
    if (!this.line) return false;
    this.extend();
    return true;
  }

  pointerUp(): boolean {
    if (!this.line) return false;
    this.finish();
    return true;
  }

  cancel(): void {}

  dispose(): void {
    this.ctx.stage.scene.remove(this.view);
    disposeTree(this.view);
  }

  /** a click on a strap takes it off; false when there is none under the pointer */
  private removeStrapUnderPointer(): boolean {
    const ctx = this.ctx;
    let hit: Strap | null = null;
    for (const s of ctx.world.straps) {
      const c = ctx.world.strapCentre(s);
      if (ctx.pointer.screenDistance(c[0], c[1], c[2]) < STRAP_CLICK_PX) hit = s;
    }
    if (!hit) return false;
    ctx.world.removeStrap(hit);
    sfx.remove();
    ctx.events.onInventory();
    return true;
  }

  /** the line grew: the cords it crosses light up */
  private extend(): void {
    const line = this.line!, ctx = this.ctx;
    line.to = { ...ctx.pointer.px };
    line.nodes = this.strappedNodes(line.from, line.to);
    const now = new Set(line.nodes.map((i) => ctx.world.sim.cableOf[i]));
    for (const c of line.lit) if (!now.has(c)) ctx.cableView.setHighlight(c, false);
    const ok = line.nodes.length >= 2;
    for (const c of now) ctx.cableView.setHighlight(c, true, CROSSED_TINT);
    line.lit = now;
    this.draw(ok);
    const n = line.nodes.length;
    ctx.events.onHint(ok
      ? `<b>${n} câbles</b> : relâchez, le velcro les serre là où le trait les croise.`
      : 'Tracez le trait <b>en travers</b> des câbles à serrer, là où ils passent côte à côte : ceux qu\'il prend s\'allument.');
  }

  /** let go: the velcro straps the cords the line crossed, if they lie close together */
  private finish(): void {
    const line = this.line!, ctx = this.ctx;
    this.line = null;
    for (const c of line.lit) ctx.cableView.setHighlight(c, false);
    this.clearView();
    ctx.events.onHint(null);
    ctx.refreshHighlights();
    if (Math.hypot(line.to.x - line.from.x, line.to.y - line.from.y) < MIN_LINE_PX) {
      ctx.events.onToast('Velcro : tracez un trait en travers des câbles à serrer (un clic sur un velcro l\'enlève).');
      return;
    }
    if (ctx.world.stock.velcro <= 0) { ctx.events.onToast('Plus de velcro.'); sfx.error(); return; }
    if (line.nodes.length < 2) { ctx.events.onToast('Le trait doit croiser au moins deux câbles qui passent côte à côte.'); sfx.error(); return; }
    ctx.world.strapNodes(line.nodes);
    sfx.velcro();
    ctx.events.onInventory();
  }

  /**
   * The nodes the velcro drawn from a to b (screen px) would strap: where
   * the line crosses the cords (away from their connectors, not strapped
   * already), the strap goes where most cords cross close together, and takes
   * the crossing of each cord nearest there, if close enough. A cord crossed
   * twice (a loop hanging in front of a manager) is strapped where the
   * others are, and one crossed far from the bundle is left out.
   */
  private strappedNodes(a: ScreenPoint, b: ScreenPoint): number[] {
    const world = this.ctx.world;
    const S = this.ctx.picker.projectNodes();
    const sim = world.sim, x = sim.x;
    const hits: { cable: number; node: number; depth: number }[] = [];
    const dx = b.x - a.x, dy = b.y - a.y;
    world.cables.forEach((cb, c) => {
      for (let i = cb.start + 2; i < cb.start + cb.count - 3; i++) {
        const px = S[3 * i], py = S[3 * i + 1], ex = S[3 * i + 3] - px, ey = S[3 * i + 4] - py;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((px - a.x) * ey - (py - a.y) * ex) / den;
        const u = ((px - a.x) * dy - (py - a.y) * dx) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const near = u < 0.5 ? i : i + 1, far = u < 0.5 ? i + 1 : i;
        const node = sim.bundleOf[near] < 0 ? near : sim.bundleOf[far] < 0 ? far : -1;
        if (node >= 0) hits.push({ cable: c, node, depth: S[3 * i + 2] + (S[3 * i + 5] - S[3 * i + 2]) * u });
      }
    });
    if (!hits.length) return [];
    const dist = (i: number, j: number) => Math.hypot(x[3 * i] - x[3 * j], x[3 * i + 1] - x[3 * j + 1], x[3 * i + 2] - x[3 * j + 2]);
    // the crossing with the most other cords crossed close to it (the frontmost, between equals)
    const around = (h: (typeof hits)[number]) => new Set(hits.filter((q) => dist(q.node, h.node) <= STRAP_REACH).map((q) => q.cable)).size;
    let anchor = hits[0], most = -1;
    for (const h of hits) {
      const n = around(h);
      if (n > most || (n === most && h.depth < anchor.depth)) { anchor = h; most = n; }
    }
    const best = new Map<number, { node: number; d: number }>();
    for (const h of hits) {
      const d = dist(h.node, anchor.node);
      if (d > STRAP_REACH) continue;
      const old = best.get(h.cable);
      if (!old || d < old.d) best.set(h.cable, { node: h.node, d });
    }
    return [...best.values()].map((v) => v.node);
  }

  private clearView(): void {
    for (const o of [...this.view.children]) { this.view.remove(o); disposeTree(o); }
  }

  /** the line, drawn where it crosses the cords (green: it will hold; grey: fewer than two cords) */
  private draw(ok: boolean): void {
    const line = this.line!, ctx = this.ctx;
    this.clearView();
    const x = ctx.world.sim.x;
    const z = line.nodes.length ? line.nodes.reduce((s, i) => s + x[3 * i + 2], 0) / line.nodes.length : 0.06;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z);
    const at = (p: ScreenPoint) => ctx.pointer.rayAt(p).intersectPlane(plane, new THREE.Vector3());
    const pa = at(line.from), pb = at(line.to);
    if (!pa || !pb) return;
    const color = ok ? '#7dff9a' : '#9a9a9a';
    const stroke = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pa, pb]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }));
    stroke.renderOrder = 30;
    this.view.add(stroke);
    for (const i of line.nodes) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }));
      dot.position.set(x[3 * i], x[3 * i + 1], x[3 * i + 2]);
      dot.renderOrder = 31;
      this.view.add(dot);
    }
  }
}
