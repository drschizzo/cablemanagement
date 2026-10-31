// The hand: takes a cord under the pointer and carries it, at a bounded speed,
// on a plane facing the camera (or in depth with Shift); pinches it (Space or
// the right button) so that it keeps an elbow; hands it over to the other hand
// (E); pulls a plugged connector out, and plugs or hooks a loose one where it
// is let go.

import * as THREE from 'three/webgpu';
import { sfx } from '../../audio/sfx';
import { disposeTree } from '../../render/dispose';
import { COLUMN_X, FRONT_Z, ROOM_FLOOR, WALL_X, type Port } from '../../game/rack';
import { PlumbLine } from '../feedback/plumbLine';
import { SETTLE_SHOW } from '../feedback/holdView';
import type { PlayContext, ToolHandler } from '../context';
import type { CordPick } from '../picking';
import type { HoverNote } from '../notices';
import type { NodeIndex } from '../../game/cables';

/** m per physics step the hand may move */
const MAX_HAND_STEP = 0.035;
/** how far the hand pulls a plugged connector before it comes out (m) */
const UNPLUG_PULL = 0.04;
/** less travel than this (m) is a mere click, not worth an undo */
const CLICK_TRAVEL = 0.002;

export type PinchKey = 'space' | 'right';

interface Carry {
  node: number;
  cable: number;
  /** carrying a loose connector: which end (else −1) */
  end: number;
  /** the hand moves on this plane (facing the camera, through the grabbed point), pushed `depth` along its normal by the wheel */
  plane: THREE.Plane;
  depth: number;
  /** where the hand is */
  target: THREE.Vector3;
  /** Shift held: the mouse moves the cord in depth (up = away) instead of in height */
  depthMode: boolean;
  /** pointer and hand when the depth mode began or ended */
  anchor: { mx: number; my: number; t: THREE.Vector3 };
  /** hand minus pointer-on-plane: keeps the cord where it is when Shift is released */
  offset: THREE.Vector3;
  /** a plugged connector was taken: it stays in until the hand pulls it far enough */
  pull: { end: number; from: THREE.Vector3 } | null;
  /** what pinches the cord: Space, the right button (either will do) */
  pinchBy: Record<PinchKey, boolean>;
  /** the hand pinched during this carry (worth an undo, even without moving) */
  pinched: boolean;
  /** when the current pinch began (clock), or −1 */
  pinchSince: number;
  /** how far the hand had travelled when this carry began */
  travelAtStart: number;
}

export class HandTool implements ToolHandler {
  readonly cursor = 'grab';
  readonly worksOnCords = true;
  readonly worksWhilePreparing = false;
  private carry: Carry | null = null;
  readonly plumbLine = new PlumbLine();

  constructor(private ctx: PlayContext) {
    ctx.stage.scene.add(this.plumbLine.group);
  }

  /** the cord in the hand and the connector carried (end −1: none), or null */
  get carried(): { cable: number; end: number } | null {
    return this.carry && { cable: this.carry.cable, end: this.carry.end };
  }

  pointerDown(e: PointerEvent): boolean {
    const p = this.ctx.picker.pick();
    if (!p) return false;
    this.ctx.history.remember();
    this.take(p);
    this.ctx.pointer.capture(e);
    return true;
  }

  pointerMove(e: PointerEvent): boolean {
    const c = this.carry;
    if (!c) return false;
    if (e.shiftKey !== c.depthMode) this.setDepthMode(e.shiftKey);
    // the right button pressed while the left one holds the cord: a chord,
    // which comes as a move with the new buttons rather than a pointerdown
    this.setPinch('right', (e.buttons & 2) !== 0);
    this.updatePortHint();
    return true;
  }

  pointerUp(e: PointerEvent): boolean {
    if (!this.carry) return false;
    this.letGo(e.altKey);
    return true;
  }

  cancel(): void {}

  /** the pinches of the cord under the pointer, the one Space would let go of; a connector shows as one */
  hoverChanged(p: CordPick | null): void {
    const ctx = this.ctx;
    ctx.cableView.pinchHover = p ? this.pinchNear(p.node) : -1;
    ctx.cableView.pinchShown = p ? p.cable : -1;
    ctx.pointer.setCursor(p ? (this.isConnector(p) ? 'pointer' : 'grab') : 'default');
  }

  hoverNotes(p: CordPick): HoverNote[] {
    const w = this.ctx.world, notes: HoverNote[] = [];
    if (this.isConnector(p)) {
      const plugged = w.cables[p.cable].ends[p.end >= 0 ? p.end : w.endOfNode(p.node)!.end].port;
      notes.push({ kind: plugged ? 'connectorPlugged' : 'connectorLoose' });
    }
    notes.push({ kind: 'traceOrCrate' });
    if (this.pinchNear(p.node) >= 0) notes.push({ kind: 'pinched' });
    if (this.otherHandAt(p.node)) notes.push({ kind: 'heldByOtherHand' });
    return notes;
  }

  private isConnector(p: CordPick): boolean {
    return p.end >= 0 || !!this.ctx.world.endOfNode(p.node);
  }

  dispose(): void {
    this.ctx.stage.scene.remove(this.plumbLine.group);
    disposeTree(this.plumbLine.group);
  }

  /** the wheel while carrying: the cord away from or towards the camera */
  wheel(e: WheelEvent): boolean {
    if (!this.carry) return false;
    e.preventDefault();
    this.carry.depth = THREE.MathUtils.clamp(this.carry.depth + Math.sign(e.deltaY) * -0.008, -0.25, 0.25);
    return true;
  }

  /** Shift pressed or released */
  shiftChanged(down: boolean): void {
    if (this.carry && this.carry.depthMode !== down) this.setDepthMode(down);
  }

  private take(p: CordPick): void {
    const ctx = this.ctx, w = ctx.world, stage = ctx.stage;
    let node = p.node;
    let end = -1;
    let pull: Carry['pull'] = null;
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
    stage.camera.getWorldDirection(dir);
    const at = new THREE.Vector3(...w.nodePosition(node));
    if (pull) pull.from.copy(at);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(dir.clone().negate(), at);
    const px = ctx.pointer.px;
    this.carry = {
      node, cable: p.cable, end, plane, depth: 0, target: at.clone(), depthMode: false,
      anchor: { mx: px.x, my: px.y, t: at.clone() }, offset: new THREE.Vector3(), pull,
      pinchBy: { space: false, right: false }, pinched: false, pinchSince: -1, travelAtStart: ctx.counters.dragged,
    };
    ctx.holdView.show(p.cable, Infinity);
    ctx.cableView.pinchHover = -1;
    ctx.cableView.pinchShown = p.cable;
    ctx.events.onHint({ kind: pull ? 'pullToUnplug' : 'carry' });
    stage.controls.enableZoom = false;
    ctx.pointer.setCursor('grabbing');
    ctx.events.onHover(null, [], 0, 0);
    ctx.refreshHighlights();
  }

  /**
   * The hand lets go. A connector over a free port plugs into it; a loose one
   * let go in the air hangs, or stays hooked there when `hook` (Alt held as
   * it is let go).
   */
  private letGo(hook: boolean): void {
    const ctx = this.ctx, c = this.carry!;
    const port = ctx.portHint.current;
    if (ctx.counters.dragged - c.travelAtStart < CLICK_TRAVEL && !port && !(c.end >= 0) && !c.pinched) ctx.history.forgetLast();
    this.plumbLine.hide();
    ctx.events.onHint(null);
    this.carry = null;
    ctx.stage.controls.enableZoom = true;
    ctx.world.sim.release();
    // the cord settles: its held and hanging stretches stay in view a little longer
    ctx.holdView.endAt(ctx.clock + SETTLE_SHOW);
    if (c.end >= 0) {
      if (port) {
        ctx.world.plug(c.cable, c.end, port.id);
        ctx.reevaluate();
        sfx.plug(ctx.isLineConnectedAt(port));
      } else if (hook && this.canHook(c.target)) {
        // let go in front of the cabinet, a connector stays hooked where it is
        ctx.world.park(c.cable, c.end);
        sfx.grab();
      }
    }
    ctx.portHint.set(null);
    ctx.pointer.setCursor('grab');
    ctx.refreshHighlights();
  }

  /** a connector let go there stays hooked: in front of the cabinet, not over the crate nor on the floor */
  private canHook(t: THREE.Vector3): boolean {
    const rack = this.ctx.world.rack;
    return t.z > 0 && Math.abs(t.x) < WALL_X && t.y > rack.floorY + 0.06;
  }

  /** a physics step: the hand moves towards the pointer, at a bounded speed */
  step(): void {
    const c = this.carry, ctx = this.ctx;
    if (!c) return;
    let goal: THREE.Vector3 | null;
    if (c.depthMode) {
      // metres per pixel at the held point: the cord follows the mouse 1:1
      const cam = ctx.stage.camera;
      const m = ctx.pointer.metresPerPixel(cam.position.distanceTo(c.target));
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
      const toward = new THREE.Vector3(-right.z, 0, right.x); // towards the viewer
      goal = c.anchor.t.clone()
        .addScaledVector(right, (ctx.pointer.px.x - c.anchor.mx) * m)
        .addScaledVector(toward, (ctx.pointer.px.y - c.anchor.my) * m);
    } else goal = ctx.pointer.onPlane(c.plane, c.depth)?.add(c.offset) ?? null;
    if (!goal) return;
    const t = c.target;
    const move = goal.clone().sub(t);
    const L = move.length();
    if (L > MAX_HAND_STEP) move.multiplyScalar(MAX_HAND_STEP / L);
    t.add(move);
    ctx.counters.dragged += move.length();
    // keep the hand out of the equipment
    const rack = ctx.world.rack;
    if (Math.abs(t.x) < COLUMN_X && t.y > -0.02 && t.y < rack.topY + 0.02) t.z = Math.max(t.z, 0.006);
    // beside the cabinet (over the crate, say), the hand stays in front of its
    // walls rather than being thrown sideways into them
    t.x = THREE.MathUtils.clamp(t.x, -0.75, 0.75);
    if (!rack.open && Math.abs(t.x) > WALL_X - 0.005) t.z = Math.max(t.z, FRONT_Z + 0.01);
    const inside = t.z < FRONT_Z;
    t.y = THREE.MathUtils.clamp(t.y, (inside || rack.open ? rack.floorY : ROOM_FLOOR(rack)) + 0.004, rack.topY + 0.1);
    t.z = THREE.MathUtils.clamp(t.z, -0.055, 0.7);
    const g = ctx.world.sim.grabTarget;
    g[0] = t.x; g[1] = t.y; g[2] = t.z;
    this.plumbLine.place(t, c.depthMode, rack);
    if (c.pull && t.distanceTo(c.pull.from) > UNPLUG_PULL) this.pullOut(c);
  }

  /** the hand pulled a plugged connector far enough: it comes out, and the hand now holds it */
  private pullOut(c: Carry): void {
    const ctx = this.ctx, w = ctx.world, p = c.pull!;
    c.pull = null;
    const cut = w.liveLinksCarriedBy(c.cable);
    w.unplug(c.cable, p.end);
    ctx.announceCut(cut);
    ctx.counters.unplugged++;
    sfx.unplug();
    ctx.reevaluate();
    const [n0] = w.endNodes(c.cable, p.end);
    w.sim.release();
    w.sim.grab(n0);
    const g = w.sim.grabTarget;
    g[0] = c.target.x; g[1] = c.target.y; g[2] = c.target.z;
    c.node = n0;
    c.end = p.end;
    ctx.events.onHint({ kind: 'plugConnector' });
  }

  /** Shift pressed or released while carrying a cord */
  private setDepthMode(on: boolean): void {
    const c = this.carry!, ctx = this.ctx;
    c.depthMode = on;
    c.anchor = { mx: ctx.pointer.px.x, my: ctx.pointer.px.y, t: c.target.clone() };
    if (!on) {
      // back to the plane facing the camera, through where the hand is now
      const dir = new THREE.Vector3();
      ctx.stage.camera.getWorldDirection(dir);
      c.plane.setFromNormalAndCoplanarPoint(dir.negate(), c.target);
      c.depth = 0;
      // the pointer is no longer over the cord: carry on from where it is, without a jump
      const hit = ctx.pointer.onPlane(c.plane, 0);
      c.offset = hit ? c.target.clone().sub(hit) : new THREE.Vector3();
    }
    ctx.events.onHint({ kind: 'depth', on });
  }

  /** while carrying a connector: the free port it would plug into */
  private updatePortHint(): void {
    const c = this.carry, ctx = this.ctx;
    if (!c || c.end < 0) return;
    const tip = ctx.world.connectorTip(c.cable, c.end);
    let best: Port | null = null, bestScore = Infinity;
    for (const p of ctx.world.rack.ports) {
      if (p.plugged) continue;
      const inSpace = Math.hypot(tip[0] - p.x, tip[1] - p.y, tip[2]);
      const onScreen = ctx.pointer.screenDistance(p.x, p.y, 0);
      const score = Math.min(inSpace / 0.03, onScreen / 22);
      if (score < 1 && score < bestScore) { bestScore = score; best = p; }
    }
    ctx.portHint.set(best);
  }

  // ------------------------------------------------------------ pinches

  /**
   * Space or the right button, pressed or released while the hand holds a
   * cord. Either one pinches: the cord around the hand keeps the shape it has
   * when the pinch ends, the more firmly the longer it lasted (rings show it).
   */
  setPinch(by: PinchKey, down: boolean): void {
    const c = this.carry;
    if (!c || c.pinchBy[by] === down) return;
    const was = c.pinchBy.space || c.pinchBy.right;
    c.pinchBy[by] = down;
    const on = c.pinchBy.space || c.pinchBy.right;
    if (on === was) return;
    this.ctx.world.sim.pinch(on);
    c.pinchSince = on ? this.ctx.clock : -1;
    if (on) { c.pinched = true; sfx.pinch(); }
  }

  /** the pinch being made firms up with the time it has been held */
  firmPinch(): void {
    const c = this.carry;
    if (!c || c.pinchSince < 0) return;
    const sim = this.ctx.world.sim, P = sim.P;
    const firmness = Math.min(1, P.pinchStart + P.pinchGrow * (this.ctx.clock - c.pinchSince));
    if (firmness > (sim.pinchHeld?.s ?? 1)) sim.firmPinch(firmness);
  }

  /** the pinch holding node i or one next to it, or −1 */
  pinchNear(i: NodeIndex): number {
    const sim = this.ctx.world.sim;
    for (const j of [i, i - 1, i + 1]) if (j >= 0 && j < sim.n && sim.cableOf[j] === sim.cableOf[i] && sim.pinchOf[j] >= 0) return sim.pinchOf[j];
    return -1;
  }

  /** Space over a pinch: the cord lets go of it */
  unpinchAt(p: CordPick): void {
    const ctx = this.ctx, k = this.pinchNear(p.node);
    if (k < 0) return;
    ctx.history.remember();
    ctx.world.sim.unpinch(ctx.world.sim.pinches[k].a);
    ctx.cableView.pinchHover = -1;
    ctx.events.onHover(null, [], 0, 0);
    sfx.remove();
  }

  // ---------------------------------------------------------- other hand

  /**
   * E while carrying a cord: the other hand takes it where it is and holds it
   * still, and this one is free to take the cord further along (or another).
   */
  handOver(): void {
    const sim = this.ctx.world.sim;
    if (!this.carry || sim.grabNode < 0) return;
    const t = sim.grabTarget;
    sim.holdStill(sim.grabNode, t[0], t[1], t[2]);
    this.ctx.counters.handedOver++;
    // no plugging on the way: the cord stays where the other hand holds it
    this.ctx.portHint.set(null);
    this.letGo(false);
    sfx.grab();
  }

  /** the hand lets go where it is, plugging nothing (Delete with a cord in hand: it goes to the crate) */
  drop(): void {
    if (!this.carry) return;
    this.ctx.portHint.set(null);
    this.letGo(false);
  }

  /** E with the hand free: the other hand lets go */
  letGoOtherHand(): void {
    const sim = this.ctx.world.sim;
    if (sim.holdNode < 0) return;
    sim.letGoStill();
    sfx.remove();
  }

  /** does the other hand hold node i, or one next to it? */
  otherHandAt(i: NodeIndex): boolean {
    const sim = this.ctx.world.sim, h = sim.holdNode;
    return h >= 0 && Math.abs(h - i) <= 1 && sim.cableOf[h] === sim.cableOf[i];
  }
}
