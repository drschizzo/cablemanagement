// Which cords are lit, and why: the line of the schedule the player focused
// (its cords and ports), the cord in the hand or under the pointer, and the
// tracer — a cord blinking red for a few seconds with its two ports circled,
// to find where a cord in the heap really goes (a visual fault locator in a
// fibre, a tone generator on copper).

import type { Evaluation } from '../../game/evaluation';
import type { CableIndex, CircuitIndex, World } from '../../game/world';
import type { CableView } from '../../render/cableView';
import type { RackView } from '../../render/rackView';

const FOCUS_COLOR = '#2b5f7a';
const HOVER_COLOR = '#5a4a10';
const TRACE_COLOR = '#ff3030';
/** how long a traced cord blinks (s) */
const TRACE_TIME = 4;

export class CordHighlights {
  /** the line of the schedule focused (−1: none) */
  focusedLine: CircuitIndex = -1;
  /** cords traced at least once: an unmarked cord (blind level) then tells where it goes */
  readonly traced = new Set<CableIndex>();
  /** cords lit now by refresh() */
  private lit = new Set<CableIndex>();
  /** the cord blinking under the tracer, until when (clock) */
  private tracing: { cable: CableIndex; until: number } | null = null;

  /** `cableView`: read every time, the view being rebuilt with the cords */
  constructor(private world: World, private rackView: RackView, private cableView: () => CableView) {}

  /** a cord lit for a reason of its own (the others' glows leave it alone) */
  isBusy(cable: CableIndex): boolean {
    return this.lit.has(cable) || this.tracing?.cable === cable;
  }

  /** the cords were rebuilt: nothing is lit any more */
  forget(): void {
    this.lit.clear();
  }

  /** shows the ports of one line of the schedule (−1: none); refresh() then lights its cords */
  focus(line: CircuitIndex): void {
    this.focusedLine = line;
    for (const m of this.rackView.portMarkers.values()) m.visible = false;
    if (line >= 0) {
      const ci = this.world.circuits[line];
      for (const id of [ci.a, ci.b]) this.rackView.marker(id).visible = true;
    }
  }

  /**
   * Lights the cords of the focused line, and `active` (in the hand or under
   * the pointer); the others go out. `stretchShown`, shown stretch by stretch
   * (HoldView), keeps its own glow.
   */
  refresh(ev: Evaluation, active: CableIndex, stretchShown: CableIndex): void {
    const want = new Map<CableIndex, string>();
    if (this.focusedLine >= 0) {
      const st = ev.circuits[this.focusedLine];
      if (st && st.cable >= 0) want.set(st.cable, FOCUS_COLOR);
      // cords plugged into either port of the line
      const ci = this.world.circuits[this.focusedLine];
      for (const id of [ci.a, ci.b]) {
        const pl = this.world.rack.port(id).plug;
        if (pl >= 0) want.set(pl >> 1, FOCUS_COLOR);
      }
    }
    if (active >= 0) want.set(active, HOVER_COLOR);
    want.delete(stretchShown);
    const view = this.cableView();
    for (const c of this.lit) if (!want.has(c) && c !== stretchShown) view.setHighlight(c, false);
    for (const [c, color] of want) view.setHighlight(c, true, color);
    this.lit = new Set(want.keys());
    if (stretchShown >= 0) this.lit.add(stretchShown);
  }

  /** T over a cord: it blinks, its two ports circled */
  trace(cable: CableIndex, clock: number): void {
    this.traced.add(cable);
    this.tracing = { cable, until: clock + TRACE_TIME };
    for (const m of this.rackView.portMarkers.values()) m.visible = false;
    for (const e of this.world.cables[cable].ends) if (e.port) this.rackView.marker(e.port).visible = true;
  }

  /** the tracer blinks; true when it has just ended (the focused line shows again) */
  updateTracer(clock: number): boolean {
    const t = this.tracing;
    if (!t) return false;
    const on = clock < t.until && Math.floor(clock * 6) % 2 === 0;
    this.cableView().setHighlight(t.cable, on, TRACE_COLOR);
    if (clock < t.until) return false;
    this.tracing = null;
    return true;
  }
}
