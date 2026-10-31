// Runs one level: the fixed-step physics loop, the rendering, the cord under
// the pointer, and the actions of the interface. It puts the pieces together:
// the gestures live in tools/, the routing of the mouse and keys in
// inputRouter.ts, the overlays in feedback/, what the cabinet shows of its
// state in cabinetSignals.ts, the timelapse and its replay in workRecording.ts.

import { Stage } from '../render/stage';
import type { RackView } from '../render/rackView';
import { CableView } from '../render/cableView';
import { DEFAULT_LOOK, type Look } from '../render/look';
import { disposeTree } from '../render/dispose';
import { World } from '../game/world';
import type { Evaluation } from '../game/evaluation';
import { ROOM_FLOOR, type Port } from '../game/rack';
import type { CordType } from '../game/cordTypes';
import type { LevelDef } from '../game/levels/levelDef';
import { sfx } from '../audio/sfx';
import type { ControllerEvents, GestureCounters, PlayContext, Tool, ToolHandler } from './context';
import { Pointer } from './pointer';
import { CordPicker, type CordPick } from './picking';
import { UndoHistory } from './undoHistory';
import { cordInfo } from './cordInfo';
import type { HoverNote } from './notices';
import { captureFront } from '../render/frontImage';
import { buildFind } from '../render/findView';
import type * as THREE from 'three/webgpu';
import { WorkRecording, type Playback } from './workRecording';
import type { ReplayView } from './replayView';
import { CabinetSignals } from './cabinetSignals';
import { PortHint } from './feedback/portHint';
import { HoldView, SETTLE_SHOW } from './feedback/holdView';
import { OtherHandMarker } from './feedback/otherHandMarker';
import { ConnectorGlows } from './feedback/connectorGlows';
import { Spotlight, type Box3Like } from './feedback/spotlight';
import { TidyGlows } from './feedback/tidyGlows';
import { CordHighlights } from './feedback/cordHighlights';
import { HandTool } from './tools/handTool';
import { RouteTool } from './tools/routeTool';
import { VelcroTool } from './tools/velcroTool';
import { SupportsTool } from './tools/supportsTool';
import { TesterTool } from './tools/testerTool';
import { InputRouter, type InputCommands } from './inputRouter';
import { rackViewOf, sceneryOf } from './levelViews';
import type { CableIndex, CircuitIndex } from '../game/cables';

export type { ControllerEvents, Tool } from './context';

/**
 * Where a level is: playing (the clock and the downtime run), paused (a brief
 * or the result is read: the clock waits, the cords still move), or preparing
 * (before the work starts: the cabinet stands still and the clock waits, only
 * the supports may be placed).
 */
export type Phase = 'playing' | 'paused' | 'preparing';

/** physics steps the loop may catch up in one frame; beyond, time is dropped */
const MAX_STEPS_PER_FRAME = 2;
/** how often the cabinet is scored (s) */
const EVAL_PERIOD = 0.4;
/** px from the find on screen within which a click picks it up, besides a click on the find itself */
const FIND_CLICK_PX = 26;
/** the flight round a signed-off cabinet (s) */
const FINISH_TOUR_S = 3.2;

export class Controller implements PlayContext, InputCommands {
  world: World;
  rackView: RackView;
  /** the room round the cabinet: its floor, the racks of the room */
  private scenery: THREE.Group;
  cableView: CableView;
  tool: Tool = 'hand';
  /** seconds of play (the level's clock: it only runs while playing) */
  elapsed = 0;
  private currentPhase: Phase = 'playing';
  lastEval: Evaluation;
  debug = false;
  /** seconds since the level opened, preparation and pauses included (animations) */
  clock = 0;
  readonly counters: GestureCounters = { hovered: 0, dragged: 0, unplugged: 0, orbited: 0, deposited: 0, handedOver: 0 };
  /** the work as it went: the cabinet as found, its timelapse, and its replay */
  private recording: WorkRecording;
  /** what the cabinet shows and plays of its state as it changes */
  private signals: CabinetSignals;

  readonly pointer: Pointer;
  readonly picker: CordPicker;
  readonly history: UndoHistory;
  readonly portHint: PortHint;
  readonly holdView: HoldView;

  private hand: HandTool;
  private route: RouteTool;
  private velcro: VelcroTool;
  private supports: SupportsTool;
  private tools: Record<Tool, ToolHandler>;
  private input: InputRouter;

  /** the find the cabinet hides, drawn where it lies (null: none, or picked up) */
  private findView: THREE.Group | null = null;
  private otherHand = new OtherHandMarker();
  private connectorGlows = new ConnectorGlows();
  private spotlightFrame: Spotlight;
  private tidyGlows = new TidyGlows();
  private highlights: CordHighlights;

  /** the cord under the pointer */
  private hover: CordPick | null = null;
  private lastHoveredCable = -1;

  /** time not yet simulated (s) */
  private physicsBacklog = 0;
  /** physics steps dropped by the loop since the last report (see `tick`) */
  private droppedSteps = 0;
  private lastFrameAt = performance.now();
  private sinceEval = 0;
  /** the version of the cords the cord view was built for */
  private cablesVersionShown = 0;
  private disposed = false;

  /** `look`: the player's own touches to the picture (velcros, light) */
  constructor(public stage: Stage, level: LevelDef, readonly events: ControllerEvents, threaded = true, private look: Look = DEFAULT_LOOK) {
    this.world = new World(level);
    this.world.preroll(30);
    if (threaded) this.world.sim.startWorker();
    this.rackView = rackViewOf(this.world, events.unitLabel);
    this.scenery = sceneryOf(this.world, level);
    this.pointer = new Pointer(stage);
    this.picker = new CordPicker(stage, this.world, this.pointer);
    this.history = new UndoHistory(this.world);
    this.highlights = new CordHighlights(this.world, this.rackView, () => this.cableView);
    this.portHint = new PortHint(this.rackView, () => { if (this.highlights.focusedLine >= 0) this.focus(this.highlights.focusedLine); });
    this.holdView = new HoldView(this);
    this.spotlightFrame = new Spotlight(stage.scene);
    this.hand = new HandTool(this);
    stage.scene.add(this.otherHand.group);
    this.route = new RouteTool(this);
    this.velcro = new VelcroTool(this);
    this.supports = new SupportsTool(this);
    this.tools = { hand: this.hand, route: this.route, velcro: this.velcro, supports: this.supports, tester: new TesterTool(this) };
    stage.scene.add(this.connectorGlows.group);
    this.cableView = new CableView(this.world, look.velcro);
    this.cableView.lightBy(this.rackView.glow);
    stage.scene.add(this.rackView.group, this.scenery, this.cableView.group);
    stage.setAccent(look.accent);
    stage.focusOnSubject(true);
    if (this.world.find) {
      this.findView = buildFind(this.world.find);
      stage.scene.add(this.findView);
    }
    const rack = this.world.rack;
    // the cabinet and, at its right, the crate on the floor
    stage.floorY = rack.open ? rack.floorY : ROOM_FLOOR(rack);
    stage.frame((rack.topY + rack.floorY) / 2 + 0.01, rack.topY - rack.floorY + 0.16, 0.6, 0.16);
    this.rackView.syncItems(this.world.itemsVersion);
    this.cableView.update(true);
    this.recording = new WorkRecording(stage, this.world, this.rackView, look.velcro);
    this.signals = new CabinetSignals(this.world, this.rackView, events, this.tidyGlows, this.holdView, {
      clock: () => this.clock,
      carried: () => this.hand.carried?.cable ?? -1,
      replaying: () => this.recording.replaying,
    });
    this.lastEval = this.world.evaluate();
    this.signals.settle(this.lastEval);
    this.signals.refreshLeds(this.lastEval);
    this.input = new InputRouter(stage, this.pointer, {
      byName: this.tools, withGestures: [this.route, this.velcro, this.hand], hand: this.hand, route: this.route, supports: this.supports,
    }, this);
    this.setTool('hand');
    requestAnimationFrame(this.frame);
  }

  dispose(): void {
    this.disposed = true;
    this.stopReplay();
    this.stage.setAccent(DEFAULT_LOOK.accent);
    this.stage.focusOnSubject(false);
    this.world.dispose();
    this.input.dispose();
    this.spotlightFrame.set(null);
    for (const t of Object.values(this.tools)) t.dispose();
    this.stage.scene.remove(this.rackView.group);
    this.rackView.dispose();
    for (const g of [this.scenery, this.cableView.group, this.otherHand.group, this.connectorGlows.group, ...(this.findView ? [this.findView] : [])]) {
      this.stage.scene.remove(g);
      disposeTree(g);
    }
  }

  setTool(t: Tool): void {
    for (const tool of Object.values(this.tools)) tool.cancel();
    this.tool = t;
    this.supports.updateGhost();
    this.pointer.setCursor(this.tools[t].cursor);
    if (this.hover && !this.tools[t].hoverChanged) this.setHover(null);
  }

  /** highlights the cords and ports of one line of the schedule (−1: none) */
  focus(circuit: CircuitIndex): void {
    this.highlights.focus(circuit);
    this.refreshHighlights();
  }

  /** a pulsing frame around a region of the cabinet (tutorial) */
  spotlight(box: Box3Like | null): void {
    this.spotlightFrame.set(box);
  }

  get phase(): Phase {
    return this.currentPhase;
  }

  get preparing(): boolean {
    return this.currentPhase === 'preparing';
  }

  /** the clock stops (a brief, the result): the cords still move */
  pause(): void {
    if (this.currentPhase === 'playing') this.currentPhase = 'paused';
  }

  /** back to work after a pause (not out of the preparation: startWork does that) */
  resume(): void {
    if (this.currentPhase === 'paused') this.currentPhase = 'playing';
  }

  /** before the work starts, the cabinet stands still while the supports are placed */
  beginPreparation(): void {
    this.currentPhase = 'preparing';
  }

  /** the preparation is over: the cords move, the clock and the downtime run */
  startWork(): void {
    this.currentPhase = 'playing';
    this.lastFrameAt = performance.now();
  }

  /**
   * The cabinet is signed off: the clock stops, every cord glows in a wave
   * down the cabinet while the camera flies round it. Resolves back at the
   * front, or as soon as the player takes the camera.
   */
  finish(): Promise<void> {
    this.pause();
    const w = this.world;
    const height = (c: number) => Math.max(...w.cables[c].ends.map((e) => (e.port ? w.rack.port(e.port).y : -Infinity)));
    const order = w.cables.map((_, c) => c).sort((a, b) => height(b) - height(a));
    this.tidyGlows.wave(order, this.clock, FINISH_TOUR_S * 0.6);
    // the timelapse ends on the cabinet as it is signed off
    this.recording.wantKey();
    return this.stage.tour(FINISH_TOUR_S);
  }

  /** an image of the cabinet from the front, without the overlays (the before/after of the result screen) */
  capture(): string {
    return captureFront(this.stage, this.overlays());
  }

  // ------------------------------------------------------------- loop

  private frame = (): void => {
    if (this.disposed) return;
    requestAnimationFrame(this.frame);
    const now = performance.now();
    if (!this.stage.due(now)) return;
    const dt = Math.min(0.1, (now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;
    this.tick(dt);
  };

  /** advances the game by dt seconds and draws it */
  tick(dt: number, draw = true): void {
    if (this.currentPhase === 'playing') {
      this.elapsed += dt;
      const news = this.world.workGoesOn(dt);
      for (const i of news.bypassesBack) {
        this.events.onToast({ kind: 'bypassBack', link: i });
        this.events.onInventory();
      }
      for (const ev of news.incidents) {
        this.signals.announceIncident(ev);
        // the cabinet shows it at once
        if (ev.kind === 'colleague') this.reevaluate();
      }
    }
    this.clock += dt;
    if (this.highlights.updateTracer(this.clock)) this.focus(this.highlights.focusedLine);
    this.spotlightFrame.update(dt);
    this.hand.firmPinch();
    this.stepPhysics(dt);
    this.syncCableView();
    this.cableView.update();
    if (!this.recording.replaying) this.rackView.syncItems(this.world.itemsVersion);
    this.sinceEval += dt;
    if (this.sinceEval > EVAL_PERIOD) {
      this.sinceEval = 0;
      this.reevaluate();
      this.reportStats();
    }
    this.tidyGlows.update(this.cableView, this.clock, (c) => this.highlights.isBusy(c));
    this.holdView.update();
    const carried = this.hand.carried;
    this.connectorGlows.update(this.world, this.clock, carried && carried.end >= 0 ? carried : null);
    this.otherHand.follow(this.world.sim);
    this.recording.keep(this.elapsed, dt, this.currentPhase === 'playing');
    if (draw) {
      if (this.recording.replaying) this.recording.draw(dt, [this.cableView.group, ...this.overlays(), ...(this.findView ? [this.findView] : [])]);
      else this.stage.render();
      this.recording.before ??= this.capture();
    }
  }

  /** what is drawn over the cabinet: the plumb line, the other hand, the glows of the connectors */
  private overlays(): THREE.Object3D[] {
    return [this.hand.plumbLine.group, this.otherHand.group, this.connectorGlows.group];
  }

  // ----------------------------------------------------------- replay

  /** the cabinet as the player found it (image) */
  get before(): string | null {
    return this.recording.before;
  }

  /** the work as it went, a few times a second of play */
  get timelapse(): WorkRecording['timelapse'] {
    return this.recording.timelapse;
  }

  /** plays the recorded work again in place of the cabinet, until stopReplay (see WorkRecording.start) */
  startReplay(playback: Playback): ReplayView {
    return this.recording.start(playback);
  }

  /** back to the cabinet as it is */
  stopReplay(): void {
    if (!this.recording.stop()) return;
    this.rackView.syncItems(this.world.itemsVersion);
    this.signals.refreshLeds(this.lastEval);
    this.stage.resetView();
  }

  /** fixed physics steps for the time passed (none while preparing) */
  private stepPhysics(dt: number): void {
    const h = this.world.sim.P.dt;
    this.physicsBacklog += this.preparing ? 0 : dt;
    let steps = 0;
    while (this.physicsBacklog >= h && steps < MAX_STEPS_PER_FRAME) {
      this.hand.step();
      this.route.step(h);
      this.physicsBacklog -= h;
      steps++;
    }
    // too slow: drop time rather than spiral
    if (this.physicsBacklog > h) { this.droppedSteps += Math.floor(this.physicsBacklog / h); this.physicsBacklog = 0; }
    if (steps) this.world.sim.advance(steps);
  }

  /** the debug line: nodes, contacts, physics time, and the steps given up */
  private reportStats(): void {
    const sim = this.world.sim;
    // frames of physics given up since the last report (the page or the worker too slow):
    // the game then runs in slow motion rather than stutters, so it must be seen
    const lost = this.droppedSteps + sim.dropped;
    this.droppedSteps = 0;
    sim.dropped = 0;
    if (!this.debug) return;
    const s = sim.stats;
    this.events.onStats({ nodes: sim.n, contacts: s.contacts, awake: s.awake, cords: this.world.cables.length, physicsMs: s.ms, inWorker: sim.threaded, lostSteps: lost });
  }

  // ------------------------------------------------------------ hover

  hoveredCord(): CordPick | null {
    return this.hover;
  }

  /** the cord under the pointer, and its tooltip */
  hoverCords(e: PointerEvent): void {
    const p = this.picker.pick();
    this.setHover(p);
    if (!p) { this.events.onHover(null, [], 0, 0); return; }
    const stacked = this.picker.pickAll().length;
    this.showTooltip(p, stacked > 1 ? [{ kind: 'stacked', count: stacked }] : [], e.clientX, e.clientY);
  }

  /** Tab: the next cord under the pointer */
  cyclePick(): void {
    const next = this.picker.next();
    if (!next) return;
    this.setHover(next.pick);
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    const px = this.pointer.px;
    this.showTooltip(next.pick, [{ kind: 'cycling', index: next.index, count: next.count }], rect.left + px.x, rect.top + px.y);
  }

  clearHover(): void {
    this.setHover(null);
    this.events.onHover(null, [], 0, 0);
  }

  /** the tooltip of a cord: what it is, what the chosen tool can do with it, then `extra` notes */
  private showTooltip(p: CordPick, extra: HoverNote[], x: number, y: number): void {
    const notes = [...(this.tools[this.tool].hoverNotes?.(p) ?? []), ...extra];
    this.events.onHover(cordInfo(this.world, this.lastEval, this.highlights.traced, p), notes, x, y);
  }

  private setHover(p: CordPick | null): void {
    const prev = this.hover?.cable ?? -1;
    if (p && p.cable !== this.lastHoveredCable) { this.counters.hovered++; this.lastHoveredCable = p.cable; }
    this.hover = p;
    this.cableView.pinchHover = -1;
    this.cableView.pinchShown = -1;
    this.tools[this.tool].hoverChanged?.(p);
    if ((p?.cable ?? -1) !== prev) this.refreshHighlights();
  }

  /** the focused line's cords, the cord in hand or under the pointer: lit; the others not */
  refreshHighlights(): void {
    const active = this.hand.carried?.cable ?? this.hover?.cable ?? -1;
    this.highlights.refresh(this.lastEval, active, this.holdView.cable);
  }

  // ---------------------------------------------------------- actions

  /** puts the cabinet back as it was before the last gesture */
  undo(): void {
    if (this.hand.carried || this.route.drawing) return;
    this.stopLaying();
    const s = this.history.takeLast();
    if (!s) { this.events.onToast({ kind: 'nothingToUndo' }); return; }
    this.world.sim.letGoStill();
    if (!this.world.restore(s)) {
      // cords rebuilt since (another length, a new cord): older states no longer fit
      this.history.clear();
      this.events.onToast({ kind: 'undoBlocked' });
      sfx.error();
      return;
    }
    sfx.remove();
    this.tidyGlows.clear();
    this.cableView.update(true);
    this.reevaluate();
    this.signals.settle(this.lastEval);
    this.events.onToast({ kind: 'undone' });
  }

  /** cords still being laid (a route) are let go where they are: another gesture begins */
  stopLaying(): void {
    this.route.stopLaying();
  }

  /** unplugs a cord, coils it and throws it in the crate (Delete over it) */
  deposit(c: CableIndex): void {
    this.stopLaying();
    const cut = this.world.liveLinksCarriedBy(c);
    this.history.remember();
    this.world.depositCable(c);
    this.counters.deposited++;
    sfx.unplug();
    this.announceCut(cut);
    this.setHover(null);
    this.events.onHover(null, [], 0, 0);
    this.afterRewire();
  }

  /** a new cord from the stock, in the crate; false when there is none of that length left */
  newCord(type: CordType, length: number, color?: string): boolean {
    this.stopLaying();
    if (this.world.takeCord(type, length, color) < 0) {
      this.events.onToast({ kind: 'noCordOfThatLength' });
      sfx.error();
      return false;
    }
    sfx.place();
    this.afterRewire();
    return true;
  }

  /** puts a bypass on a production link, or takes it off */
  toggleBypass(i: CircuitIndex): void {
    if (!this.world.maintenance.toggleBypass(i)) {
      this.events.onToast({ kind: this.world.maintenance.live.has(i) ? 'noBypassLeft' : 'notInProduction' });
      sfx.error();
      return;
    }
    sfx.label();
    this.events.onInventory();
    this.reevaluate();
  }

  /**
   * A line of the schedule clicked: the loose end of its cord is brought out
   * of the heap and hooked just under the port it belongs in.
   */
  fetchEnd(circuit: CircuitIndex): void {
    const w = this.world, ci = w.circuits[circuit];
    const free = [ci.a, ci.b].map((id) => w.rack.port(id)).filter((p) => !p.plugged);
    if (!free.length) { this.events.onToast({ kind: 'portsTaken' }); return; }
    // its own cord first (the one made for it), else any cord of its type with a loose end
    const loose = (c: number) => w.cables[c].ends.findIndex((e) => !e.port);
    const plugged = [ci.a, ci.b].map((id) => w.rack.port(id).plugged).find((p) => p !== null);
    const order = [...(plugged ? [plugged.cable] : []), circuit, ...w.cables.map((_, c) => c)];
    const c = order.find((k) => k < w.cables.length && w.cables[k].type === ci.type && loose(k) >= 0);
    if (c === undefined) {
      this.events.onToast({ kind: 'noLooseEnd' });
      sfx.error();
      return;
    }
    const e = loose(c), p = free[0];
    this.history.remember();
    this.stopLaying();
    w.park(c, e, [[p.x, p.y - 0.035, 0.09], [p.x, p.y - 0.035 - w.seg, 0.09]]);
    this.holdView.show(c, this.clock + SETTLE_SHOW);
    sfx.whoosh();
  }

  takeFindUnderPointer(): boolean {
    const find = this.world.find, view = this.findView;
    if (!find || !view) return false;
    const [x, y, z] = find.at;
    // on the find itself (the manual is big), or near enough to a small one
    this.pointer.ray();
    const onIt = this.pointer.raycaster.intersectObject(view, true).length > 0;
    if (!onIt && this.pointer.screenDistance(x, y + 0.02, z) > FIND_CLICK_PX) return false;
    this.world.takeFind();
    this.stage.scene.remove(view);
    disposeTree(view);
    this.findView = null;
    sfx.find();
    this.events.onFind(find.id);
    return true;
  }

  /** the tracer (T over a cord): it blinks, its two ports circled */
  trace(c: CableIndex): void {
    this.highlights.trace(c, this.clock);
    sfx.label();
  }

  /** production links just cut: what each second of them costs */
  announceCut(links: CircuitIndex[]): void {
    this.signals.announceCut(links);
  }

  // ------------------------------------------------------- evaluation

  private afterRewire(): void {
    this.syncCableView();
    this.reevaluate();
  }

  /** scores the cabinet now, and shows it (LEDs, schedule) */
  reevaluate(): void {
    this.lastEval = this.world.evaluate();
    this.signals.evaluated(this.lastEval);
    this.events.onEval(this.lastEval);
  }

  isLineConnectedAt(port: Port): boolean {
    return this.lastEval.circuits.some((s, i) => s.connected && (this.world.circuits[i].a === port.id || this.world.circuits[i].b === port.id));
  }

  /** the cords were rebuilt (another length, a new one): a new view */
  private syncCableView(): void {
    if (this.cablesVersionShown === this.world.cablesVersion) return;
    this.cablesVersionShown = this.world.cablesVersion;
    this.stage.scene.remove(this.cableView.group);
    disposeTree(this.cableView.group);
    this.cableView = new CableView(this.world, this.look.velcro);
    this.cableView.lightBy(this.rackView.glow);
    this.stage.scene.add(this.cableView.group);
    this.highlights.forget();
    this.tidyGlows.clear();
    this.hover = null;
    this.refreshHighlights();
  }
}
