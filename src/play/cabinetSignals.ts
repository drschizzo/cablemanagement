// What the cabinet shows and plays of its state as it changes: the LEDs of
// its ports, the cords that just became tidy (a glow, a note), the production
// traffic cut and back (a sound, a glow), and the news the player hears of
// (an incident, links cut).

import type { RackView } from '../render/rackView';
import type { World } from '../game/world';
import type { Evaluation } from '../game/evaluation';
import type { CircuitIndex } from '../game/cables';
import type { IncidentEvent } from '../game/incidents';
import { sfx } from '../audio/sfx';
import type { ControllerEvents } from './context';
import type { TidyGlows } from './feedback/tidyGlows';
import type { HoldView } from './feedback/holdView';

/** what the signals read of the level as it is played */
export interface SignalsSource {
  /** seconds since the level opened (animations) */
  clock(): number;
  /** the cord in hand (−1: none) */
  carried(): number;
  /** the work is being played again: the replay sets the LEDs as they were */
  replaying(): boolean;
}

export class CabinetSignals {
  /** cords tidy as of the last evaluation (plugged as planned, routed, clear) */
  private tidyCables = new Set<number>();
  /** production lines down as of the last evaluation */
  private linksDown = new Set<number>();

  constructor(
    private world: World,
    private rackView: RackView,
    private events: ControllerEvents,
    private tidyGlows: TidyGlows,
    private holdView: HoldView,
    private source: SignalsSource,
  ) {}

  /** the cords tidy now are taken as they are, without a glow (the level opens, a gesture undone) */
  settle(ev: Evaluation): void {
    this.tidyCables = tidyCablesOf(ev);
  }

  /** a new evaluation: the LEDs, the cords just tidy, the traffic */
  evaluated(ev: Evaluation): void {
    this.refreshLeds(ev);
    this.celebrate(ev);
    this.followTraffic(ev);
  }

  /** the LEDs of the ports: as planned, down, or held up by a bypass */
  refreshLeds(ev: Evaluation): void {
    if (this.source.replaying()) return;
    const w = this.world, down = new Set<string>(), bypass = new Set<string>();
    for (const i of w.maintenance.live) {
      if (w.circuitUp(i)) continue;
      const ci = w.circuits[i];
      for (const id of [ci.a, ci.b]) (w.maintenance.bypassed.has(i) ? bypass : down).add(id);
    }
    // a cord broken inside, plugged as planned: its ports blink red all the same, no light comes through
    w.circuits.forEach((ci, i) => { if (w.circuitFaulty(i)) down.add(ci.a).add(ci.b); });
    this.rackView.showLeds(w.okPorts(ev), down, bypass);
  }

  /** an incident: the player hears of it */
  announceIncident(ev: IncidentEvent): void {
    this.events.onToast({ kind: 'incident', incident: ev });
    if (ev.kind === 'call') sfx.ring();
    else if (ev.kind === 'callMissed') sfx.error();
  }

  /** production links just cut: what each second of them costs */
  announceCut(links: CircuitIndex[]): void {
    if (!links.length) return;
    const cost = links.reduce((a, i) => a + this.world.maintenance.cutCost(i), 0);
    this.events.onToast({ kind: 'linksCut', links: links.map((i) => ({ link: i, service: this.world.circuits[i].service })), costPerSecond: cost });
  }

  /** the cords that just became tidy: a glow and a note each */
  private celebrate(ev: Evaluation): void {
    const now = tidyCablesOf(ev);
    const fresh = [...now].filter((c) => !this.tidyCables.has(c));
    this.tidyCables = now;
    if (!fresh.length) return;
    const clock = this.source.clock();
    // the cord just let go of glows as a whole, not stretch by stretch
    if (this.source.carried() < 0 && fresh.includes(this.holdView.cable)) this.holdView.endAt(clock);
    this.tidyGlows.celebrate(fresh, clock);
  }

  /** a production line cut: the traffic drops; back up: it comes back, and its cord glows */
  private followTraffic(ev: Evaluation): void {
    const m = this.world.maintenance;
    const now = new Set([...m.live].filter((i) => m.isDown(i)));
    const cut = [...now].some((i) => !this.linksDown.has(i) && !m.bypassed.has(i));
    const back = [...this.linksDown].filter((i) => !now.has(i));
    this.linksDown = now;
    if (cut) sfx.cut();
    if (!back.length) return;
    sfx.restore();
    for (const i of back) {
      const c = ev.circuits[i].cable;
      if (c >= 0) this.tidyGlows.flash(c, this.source.clock() + 1.2);
    }
  }
}

/** cords plugged as planned, routed and leaving the front clear */
function tidyCablesOf(ev: Evaluation): Set<number> {
  const out = new Set<number>();
  for (const s of ev.circuits) if (s.connected && s.routed && s.clear) out.add(s.cable);
  return out;
}
