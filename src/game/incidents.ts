// Incidents while the work goes on: a colleague unplugs a production link by
// mistake, or a user calls about a link that is down and wants it back within
// the minute. The level draws when they come; this class plays them and says
// what happens, as data: the World applies it to the cabinet.

import type { CircuitIndex } from './cables';
import { pick, shuffle } from '../lib/random';

export type IncidentKind = 'colleague' | 'call';

/** an incident of the level, at `at` seconds of play */
export interface IncidentSpec {
  kind: IncidentKind;
  at: number;
}

/** what an incident did, for the interface */
export type IncidentEvent =
  /** a colleague unplugged this production link */
  | { kind: 'colleague'; link: CircuitIndex }
  /** a user calls: this link must be up within `within` s */
  | { kind: 'call'; link: CircuitIndex; within: number }
  | { kind: 'callMet'; link: CircuitIndex }
  /** too late: `penalty` points of downtime */
  | { kind: 'callMissed'; link: CircuitIndex; penalty: number };

/** s a caller waits for their link */
export const CALL_WAIT = 60;
/** downtime points a missed call costs */
export const CALL_PENALTY = 40;
/** s of play before the first incident, and at least between two */
const FIRST_AT = 45;
const GAP = 50;

/**
 * `count` incidents for a level, drawn with `random`: the first after
 * three quarters of a minute, then every minute or so, colleagues and calls
 * in turn (a colleague first: the call that follows has a link to ask for).
 */
export function drawIncidents(count: number, random: () => number): IncidentSpec[] {
  const out: IncidentSpec[] = [];
  let at = FIRST_AT + random() * 20;
  for (let k = 0; k < count; k++) {
    out.push({ kind: k % 2 === 0 ? 'colleague' : 'call', at: Math.round(at) });
    at += GAP + random() * 30;
  }
  return out;
}

export class Incidents {
  /** s of play so far */
  private elapsed = 0;
  /** the next incident of the list */
  private next = 0;
  /** the call under way: its link and when its time is up (s of play), or null */
  call: { link: CircuitIndex; deadline: number } | null = null;

  /**
   * `live`: the links in production; `isUp`: whether a link's cord joins its
   * ports now (a colleague unplugs only those); `served`: whether its users
   * have their traffic, by its cord or by a bypass (nobody calls about a link
   * served); `random`: who is unplugged, who calls.
   */
  constructor(
    private specs: readonly IncidentSpec[],
    private live: () => Iterable<CircuitIndex>,
    private isUp: (i: CircuitIndex) => boolean,
    private served: (i: CircuitIndex) => boolean,
    private random: () => number,
  ) {}

  /** s the caller still waits (null: no call) */
  callLeft(): number | null {
    return this.call ? Math.max(0, this.call.deadline - this.elapsed) : null;
  }

  /** time passes while the work goes on: what happened meanwhile */
  tick(dt: number): IncidentEvent[] {
    this.elapsed += dt;
    const events: IncidentEvent[] = [];
    const call = this.call;
    if (call && this.served(call.link)) {
      events.push({ kind: 'callMet', link: call.link });
      this.call = null;
    } else if (call && this.elapsed >= call.deadline) {
      events.push({ kind: 'callMissed', link: call.link, penalty: CALL_PENALTY });
      this.call = null;
    }
    while (this.next < this.specs.length && this.specs[this.next].at <= this.elapsed) {
      const event = this.fire(this.specs[this.next++].kind);
      if (event) events.push(event);
    }
    return events;
  }

  /** an incident comes: on whom it falls (none: it passes unnoticed) */
  private fire(kind: IncidentKind): IncidentEvent | null {
    const live = [...this.live()];
    if (kind === 'colleague') {
      const up = live.filter((i) => this.isUp(i));
      return up.length ? { kind: 'colleague', link: pick(up, this.random) } : null;
    }
    if (this.call) return null;
    const down = shuffle(live.filter((i) => !this.served(i)), this.random);
    if (!down.length) return null;
    this.call = { link: down[0], deadline: this.elapsed + CALL_WAIT };
    return { kind: 'call', link: down[0], within: CALL_WAIT };
  }
}
