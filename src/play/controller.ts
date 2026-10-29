// Runs one level: the fixed-step physics loop, the rendering, and what the
// cabinet shows of its state (LEDs, glows, the cord under the pointer). It
// puts the pieces together: the gestures live in tools/, the routing of the
// mouse and keys in inputRouter.ts, the overlays in feedback/.

import { Stage } from '../render/stage';
import { RackView } from '../render/rackView';
import { CableView } from '../render/cableView';
import { disposeTree } from '../render/dispose';
import { World } from '../game/world';
import type { Evaluation } from '../game/evaluation';
import type { Port } from '../game/rack';
import { SERVICES } from '../game/services';
import type { FibreType } from '../game/cordTypes';
import type { LevelDef } from '../game/levels/levelDef';
import { sfx } from '../audio/sfx';
import { formatCost } from '../format';
import type { ControllerEvents, GestureCounters, PlayContext, Tool, ToolHandler } from './context';
import { Pointer } from './pointer';
import { CordPicker, type CordPick } from './picking';
import { UndoHistory } from './undoHistory';
import { describeCord } from './cordTooltip';
import { captureFront } from './frontImage';
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
import { InputRouter, type InputCommands } from './inputRouter';
import type { CableIndex, CircuitIndex } from '../game/cables';

export type { ControllerEvents, Tool } from './context';

/** physics steps the loop may catch up in one frame; beyond, time is dropped */
const MAX_STEPS_PER_FRAME = 2;
/** how often the cabinet is scored (s) */
const EVAL_PERIOD = 0.4;

export class Controller implements PlayContext, InputCommands {
  world: World;
  rackView: RackView;
  cableView: CableView;
  tool: Tool = 'hand';
  /** seconds of play (the level's clock: it waits during the preparation) */
  elapsed = 0;
  running = true;
  /**
   * Preparation: before the work starts, the cabinet stands still and the
   * clock waits; only the supports may be placed (the plan is made first).
   */
  preparing = false;
  lastEval: Evaluation;
  debug = false;
  /** seconds since the level opened, preparation and pauses included (animations) */
  clock = 0;
  readonly counters: GestureCounters = { hovered: 0, dragged: 0, plugged: 0, unplugged: 0, orbited: 0, deposited: 0, pinched: 0, handedOver: 0, routed: 0 };
  /** the cabinet as the player found it (image), taken on the first frame, and its readability note */
  before: string | null = null;
  startNote = 0;

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

  private otherHand = new OtherHandMarker();
  private connectorGlows = new ConnectorGlows();
  private spotlightFrame: Spotlight;
  private tidyGlows = new TidyGlows();
  private highlights: CordHighlights;

  /** the cord under the pointer */
  private hover: CordPick | null = null;
  private lastHoveredCable = -1;
  /** cords tidy as of the last evaluation (plugged as planned, routed, clear) */
  private tidyCables = new Set<number>();
  /** production lines down as of the last evaluation */
  private linksDown = new Set<number>();

  /** time not yet simulated (s) */
  private physicsBacklog = 0;
  /** physics steps dropped by the loop since the last report (see `tick`) */
  private droppedSteps = 0;
  private lastFrameAt = performance.now();
  private sinceEval = 0;
  /** the version of the cords the cord view was built for */
  private cablesVersionShown = 0;
  private disposed = false;

  constructor(public stage: Stage, level: LevelDef, readonly events: ControllerEvents, threaded = true) {
    this.world = new World(level);
    this.world.preroll(30);
    if (threaded) this.world.sim.startWorker();
    const types = new Map<number, FibreType>();
    this.world.circuits.forEach((c) => types.set(this.world.rack.port(c.a).unit, c.type));
    this.rackView = new RackView(this.world.rack, types);
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
    this.tools = { hand: this.hand, route: this.route, velcro: this.velcro, supports: this.supports };
    stage.scene.add(this.connectorGlows.group);
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
    this.tidyCables = tidyCablesOf(this.lastEval);
    this.refreshLeds();
    this.input = new InputRouter(stage, this.pointer, {
      byName: this.tools, withGestures: [this.route, this.velcro, this.hand], hand: this.hand, route: this.route, supports: this.supports,
    }, this);
    this.setTool('hand');
    requestAnimationFrame(this.frame);
  }

  dispose(): void {
    this.disposed = true;
    this.world.dispose();
    this.input.dispose();
    this.spotlightFrame.set(null);
    for (const t of Object.values(this.tools)) t.dispose();
    for (const g of [this.rackView.group, this.cableView.group, this.otherHand.group, this.connectorGlows.group]) {
      this.stage.scene.remove(g);
      disposeTree(g);
    }
  }

  setTool(t: Tool): void {
    for (const tool of Object.values(this.tools)) tool.cancel();
    this.tool = t;
    this.supports.updateGhost();
    this.pointer.setCursor(t === 'hand' ? 'grab' : 'crosshair');
    if (t !== 'hand' && this.hover) this.setHover(null);
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

  /** the preparation is over: the cords move, the clock and the downtime run */
  startWork(): void {
    this.preparing = false;
    this.running = true;
    this.lastFrameAt = performance.now();
  }

  /** an image of the cabinet from the front, without the overlays (the before/after of the result screen) */
  capture(): string {
    return captureFront(this.stage, [this.hand.plumbLine.group, this.otherHand.group, this.connectorGlows.group]);
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
    if (this.running) {
      this.elapsed += dt;
      for (const i of this.world.maintenance.tick(dt)) {
        this.events.onToast(`Liaison ${i + 1} rétablie : sa dérivation revient au stock.`);
        this.events.onInventory();
      }
    }
    this.clock += dt;
    if (this.highlights.updateTracer(this.clock)) this.focus(this.highlights.focusedLine);
    this.spotlightFrame.update(dt);
    this.hand.firmPinch();
    this.stepPhysics(dt);
    this.syncCableView();
    this.cableView.update();
    this.rackView.syncItems(this.world.itemsVersion);
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
    if (draw) {
      this.stage.render();
      if (!this.before) this.before = this.capture();
    }
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
    this.events.onStats(`${sim.n} nœuds · ${s.contacts} contacts · ${s.awake}/${this.world.cables.length} câbles actifs · physique ${s.ms.toFixed(1)} ms${sim.threaded ? ' (worker)' : ''}${lost ? ` · ${lost} pas perdus` : ''}`);
  }

  // ------------------------------------------------------------ hover

  hoveredCord(): CordPick | null {
    return this.hover;
  }

  /** the cord under the pointer, and its tooltip */
  hoverCords(e: PointerEvent): void {
    const p = this.picker.pick();
    this.setHover(p);
    if (!p) { this.events.onHover(null, 0, 0); return; }
    const stacked = this.picker.pickAll().length;
    let notes = '';
    if (this.tool === 'hand' && this.hand.pinchNear(p.node) >= 0) notes += '<br><i>Coude pincé — Espace : le relâcher</i>';
    if (this.tool === 'hand' && this.hand.otherHandAt(p.node)) notes += '<br><i>Tenu par l\'autre main — E : la lâcher</i>';
    if (stacked > 1) notes += `<br><i>${stacked} câbles sous le curseur — Tab : suivant</i>`;
    this.events.onHover(this.describe(p) + notes, e.clientX, e.clientY);
  }

  /** Tab: the next cord under the pointer */
  cyclePick(): void {
    const next = this.picker.next();
    if (!next) return;
    this.setHover(next.pick);
    const r = this.stage.renderer.domElement.getBoundingClientRect();
    const px = this.pointer.px;
    this.events.onHover(`${this.describe(next.pick)}<br><i>${next.index + 1}/${next.count} sous le curseur — Tab : suivant</i>`, r.left + px.x, r.top + px.y);
  }

  clearHover(): void {
    this.setHover(null);
    this.events.onHover(null, 0, 0);
  }

  private describe(p: CordPick): string {
    return describeCord(this.world, this.lastEval, this.tool, this.highlights.traced, p);
  }

  private setHover(p: CordPick | null): void {
    const prev = this.hover?.cable ?? -1;
    if (p && p.cable !== this.lastHoveredCable) { this.counters.hovered++; this.lastHoveredCable = p.cable; }
    this.hover = p;
    // the pinch under the pointer, which Space would let go of; the pinches of the cord under it
    this.cableView.pinchHover = p && this.tool === 'hand' ? this.hand.pinchNear(p.node) : -1;
    this.cableView.pinchShown = p && this.tool === 'hand' ? p.cable : -1;
    if ((p?.cable ?? -1) !== prev) this.refreshHighlights();
    if (this.tool === 'hand') this.pointer.setCursor(p ? (p.end >= 0 || this.world.endOfNode(p.node) ? 'pointer' : 'grab') : 'default');
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
    this.route.stopLaying();
    const s = this.history.takeLast();
    if (!s) { this.events.onToast('Rien à annuler.'); return; }
    this.world.sim.letGoStill();
    if (!this.world.restore(s)) {
      // cords rebuilt since (another length, a new cord): older states no longer fit
      this.history.clear();
      this.events.onToast('Impossible d\'annuler au-delà d\'un changement de cordon.');
      sfx.error();
      return;
    }
    sfx.remove();
    this.tidyGlows.clear();
    this.cableView.update(true);
    this.reevaluate();
    this.tidyCables = tidyCablesOf(this.lastEval);
    this.events.onToast('Annulé.');
  }

  /** unplugs a cord, coils it and throws it in the crate (Delete over it) */
  deposit(c: CableIndex): void {
    this.route.stopLaying();
    const cut = this.world.liveLinksCarriedBy(c);
    this.history.remember();
    this.world.depositCable(c);
    this.counters.deposited++;
    sfx.unplug();
    this.announceCut(cut);
    this.setHover(null);
    this.events.onHover(null, 0, 0);
    this.afterRewire();
  }

  /** a new cord from the stock, in the crate; false when there is none of that length left */
  newCord(type: FibreType, length: number, color?: string): boolean {
    this.route.stopLaying();
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
  toggleBypass(i: CircuitIndex): void {
    if (!this.world.maintenance.toggleBypass(i)) {
      this.events.onToast(this.world.maintenance.live.has(i) ? 'Plus de dérivation en stock.' : 'Seules les liaisons en production (⚡) se dérivent.');
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
    this.history.remember();
    this.route.stopLaying();
    w.park(c, e, [[p.x, p.y - 0.035, 0.09], [p.x, p.y - 0.035 - w.seg, 0.09]]);
    this.holdView.show(c, this.clock + SETTLE_SHOW);
    sfx.whoosh();
  }

  /** the tracer (T over a cord): it blinks, its two ports circled */
  trace(c: CableIndex): void {
    this.highlights.trace(c, this.clock);
    sfx.label();
  }

  /** production links just cut: what each second of them costs */
  announceCut(links: number[]): void {
    const cost = links.reduce((a, i) => a + this.world.maintenance.cutCost(i), 0);
    if (!links.length) return;
    const names = links.map((i) => `${i + 1} (${SERVICES[this.world.circuits[i].service].name})`).join(', ');
    this.events.onToast(cost > 0
      ? `Liaison ${names} coupée : ${formatCost(cost)} par seconde sur le budget d'interruption. Rebranchez vite.`
      : `Liaison ${names} coupée, mais sa dérivation porte le trafic.`);
  }

  // ------------------------------------------------------- evaluation

  private afterRewire(): void {
    this.syncCableView();
    this.reevaluate();
  }

  /** scores the cabinet now, and shows it (LEDs, schedule) */
  reevaluate(): void {
    this.lastEval = this.world.evaluate();
    this.refreshLeds();
    this.celebrate();
    this.followTraffic();
    this.events.onEval(this.lastEval);
  }

  isLineConnectedAt(port: Port): boolean {
    return this.lastEval.circuits.some((s, i) => s.connected && (this.world.circuits[i].a === port.id || this.world.circuits[i].b === port.id));
  }

  /** a production line cut: the traffic drops; back up: it comes back, and its cord glows */
  private followTraffic(): void {
    const w = this.world;
    const now = new Set([...w.maintenance.live].filter((i) => w.maintenance.isDown(i)));
    const cut = [...now].some((i) => !this.linksDown.has(i) && !w.maintenance.bypassed.has(i));
    const back = [...this.linksDown].filter((i) => !now.has(i));
    this.linksDown = now;
    if (cut) sfx.cut();
    if (!back.length) return;
    sfx.restore();
    for (const i of back) {
      const c = this.lastEval.circuits[i].cable;
      if (c >= 0) this.tidyGlows.flash(c, this.clock + 1.2);
    }
  }

  /** the cords that just became tidy: a glow and a note each */
  private celebrate(): void {
    const now = tidyCablesOf(this.lastEval);
    const fresh = [...now].filter((c) => !this.tidyCables.has(c));
    this.tidyCables = now;
    if (!fresh.length) return;
    // the cord just let go of glows as a whole, not stretch by stretch
    if (!this.hand.carried && fresh.includes(this.holdView.cable)) this.holdView.endAt(this.clock);
    this.tidyGlows.celebrate(fresh, this.clock);
  }

  /** the cords were rebuilt (another length, a new one): a new view */
  private syncCableView(): void {
    if (this.cablesVersionShown === this.world.cablesVersion) return;
    this.cablesVersionShown = this.world.cablesVersion;
    this.stage.scene.remove(this.cableView.group);
    disposeTree(this.cableView.group);
    this.cableView = new CableView(this.world);
    this.cableView.lightBy(this.rackView.glow);
    this.stage.scene.add(this.cableView.group);
    this.highlights.forget();
    this.tidyGlows.clear();
    this.hover = null;
    this.refreshHighlights();
  }

  private refreshLeds(): void {
    const w = this.world, down = new Set<string>(), bypass = new Set<string>();
    for (const i of w.maintenance.live) {
      if (w.circuitUp(i)) continue;
      const ci = w.circuits[i];
      for (const id of [ci.a, ci.b]) (w.maintenance.bypassed.has(i) ? bypass : down).add(id);
    }
    this.rackView.showLeds(w.okPorts(this.lastEval), down, bypass);
  }
}

/** cords plugged as planned, routed and leaving the front clear */
function tidyCablesOf(ev: Evaluation): Set<number> {
  const out = new Set<number>();
  for (const s of ev.circuits) if (s.connected && s.routed && s.clear) out.add(s.cable);
  return out;
}
