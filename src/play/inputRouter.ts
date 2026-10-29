// The player's mouse and keyboard, routed: a pointer gesture goes to the tool
// that has one under way, or to the chosen tool, or drags the view when that
// tool takes nothing; the keys are the shortcuts of the hand (pinch, other
// hand, tracer, crate) and of the level (undo, next cord under the pointer).

import * as THREE from 'three';
import type { Stage } from '../render/stage';
import type { ControllerEvents, GestureCounters, Tool, ToolHandler } from './context';
import type { CordPick } from './picking';
import type { Pointer } from './pointer';
import type { HandTool } from './tools/handTool';
import type { RouteTool } from './tools/routeTool';
import type { SupportsTool } from './tools/supportsTool';
import type { CableIndex } from '../game/cables';

export interface ToolSet {
  byName: Record<Tool, ToolHandler>;
  /** the tools that may have a gesture under way, in the order they get the pointer */
  withGestures: ToolHandler[];
  hand: HandTool;
  route: RouteTool;
  supports: SupportsTool;
}

/** what the keys and the hover ask of the level (the Controller) */
export interface InputCommands {
  readonly tool: Tool;
  readonly preparing: boolean;
  readonly counters: GestureCounters;
  readonly events: ControllerEvents;
  /** the cord under the pointer */
  hoveredCord(): CordPick | null;
  /** the pointer moved with no gesture under way, over the cords */
  hoverCords(e: PointerEvent): void;
  clearHover(): void;
  trace(cable: CableIndex): void;
  deposit(cable: CableIndex): void;
  undo(): void;
  cyclePick(): void;
}

export class InputRouter {
  /** the view being dragged: the pointer when it last moved */
  private pan: { mx: number; my: number } | null = null;
  /** undoes every subscription made by the constructor */
  private unbind: (() => void)[] = [];

  constructor(private stage: Stage, private pointer: Pointer, private tools: ToolSet, private level: InputCommands) {
    this.bindPointer();
    this.bindKeys();
  }

  dispose(): void {
    for (const off of this.unbind) off();
  }

  /** listens, and remembers how to stop (dispose) */
  private on<E extends Event>(target: EventTarget, name: string, listener: (e: E) => void, options?: AddEventListenerOptions): void {
    const handler = listener as EventListener;
    target.addEventListener(name, handler, options);
    this.unbind.push(() => target.removeEventListener(name, handler));
  }

  // ------------------------------------------------------------ pointer

  private bindPointer(): void {
    const canvas = this.stage.renderer.domElement;
    this.on(canvas, 'pointermove', (e: PointerEvent) => this.pointerMove(e));
    this.on(canvas, 'pointerdown', (e: PointerEvent) => this.pointerDown(e));
    // on the window: a button let go outside the canvas still ends the gesture
    this.on(window, 'pointerup', (e: PointerEvent) => this.pointerUp(e));
    this.on(canvas, 'wheel', (e: WheelEvent) => this.tools.hand.wheel(e), { passive: false });
    this.on(canvas, 'contextmenu', (e: Event) => e.preventDefault());
    this.on(canvas, 'pointerleave', () => this.level.events.onHover(null, [], 0, 0));
    this.on(this.stage.controls as unknown as EventTarget, 'start', () => { this.level.counters.orbited++; });
  }

  private pointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.pointer.update(e);
    // any gesture stops a cord being laid where it is
    this.tools.route.stopLaying();
    // preparing, the cabinet stands still: the view moves, the cords wait
    const tool = this.tools.byName[this.level.tool];
    if (this.level.preparing && !tool.worksWhilePreparing) { this.startPan(e); return; }
    // nothing for the tool under the pointer: drag the view
    if (!tool.pointerDown(e)) this.startPan(e);
  }

  private pointerMove(e: PointerEvent): void {
    this.pointer.update(e);
    if (this.pan) {
      this.panBy(e.clientX - this.pan.mx, e.clientY - this.pan.my);
      this.pan = { mx: e.clientX, my: e.clientY };
      return;
    }
    for (const t of this.tools.withGestures) if (t.pointerMove(e)) return;
    if (this.tools.byName[this.level.tool].worksOnCords) this.level.hoverCords(e);
    else this.level.clearHover();
    this.tools.supports.updateGhost();
  }

  private pointerUp(e: PointerEvent): void {
    if (this.pan) { this.pan = null; this.pointer.setCursor('default'); return; }
    for (const t of this.tools.withGestures) if (t.pointerUp(e)) return;
  }

  private startPan(e: PointerEvent): void {
    this.pan = { mx: e.clientX, my: e.clientY };
    this.pointer.setCursor('move');
  }

  /** moves the view parallel to the screen (the world follows the mouse) */
  private panBy(dx: number, dy: number): void {
    const cam = this.stage.camera;
    const ctl = this.stage.controls;
    const m = this.pointer.metresPerPixel(cam.position.distanceTo(ctl.target));
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const move = right.multiplyScalar(-dx * m).add(up.multiplyScalar(dy * m));
    cam.position.add(move);
    ctl.target.add(move);
  }

  // ------------------------------------------------------------ keys

  private bindKeys(): void {
    const { hand, supports } = this.tools;
    const level = this.level;
    /** a dialog is open: the keys are its own */
    const overlayOpen = () => !!document.querySelector('.overlay.on');
    const plain = (e: KeyboardEvent) => !e.repeat && !e.ctrlKey && !e.metaKey && !overlayOpen();
    const key = (type: 'keydown' | 'keyup', listener: (e: KeyboardEvent) => void) => this.on(window, type, listener);

    // Shift: the hand carries the cord in depth; the supports tool puts a ring rather than a duct
    key('keydown', (e) => { if (e.key === 'Shift') hand.shiftChanged(true); });
    key('keyup', (e) => { if (e.key === 'Shift') hand.shiftChanged(false); });
    key('keydown', (e) => supports.setShift(e.shiftKey));
    key('keyup', (e) => supports.setShift(e.shiftKey));
    // T over a cord: the tracer; Delete: into the crate
    key('keydown', (e) => {
      if (!plain(e)) return;
      const p = hand.carried ? null : level.hoveredCord();
      if (e.code === 'KeyT' && p) level.trace(p.cable);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && p) {
        e.preventDefault();
        level.deposit(p.cable);
      }
    });
    // Space: pinch the cord carried, or let go of the pinch under the pointer
    key('keydown', (e) => {
      if (e.code !== 'Space' || overlayOpen()) return;
      // not a click on whatever button has the focus
      e.preventDefault();
      if (e.repeat) return;
      const hovered = level.hoveredCord();
      if (hand.carried) hand.setPinch('space', true);
      else if (hovered && this.tools.byName[level.tool] === hand) hand.unpinchAt(hovered);
    });
    key('keyup', (e) => { if (e.code === 'Space') hand.setPinch('space', false); });
    // E: the other hand takes the cord carried, or lets go
    key('keydown', (e) => {
      if (e.code !== 'KeyE' || !plain(e)) return;
      if (hand.carried) hand.handOver();
      else hand.letGoOtherHand();
    });
    key('keydown', (e) => {
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !overlayOpen()) {
        e.preventDefault();
        level.undo();
      }
    });
    // Tab: the next cord under the pointer
    key('keydown', (e) => {
      if (e.key !== 'Tab' || hand.carried || overlayOpen()) return;
      e.preventDefault();
      if (this.tools.byName[level.tool].worksOnCords) level.cyclePick();
    });
  }
}
