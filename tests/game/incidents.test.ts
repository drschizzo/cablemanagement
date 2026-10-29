// The incidents on their own: no rack, no physics. Whether a link is up is a
// plain set the test changes by hand.
import { describe, expect, it } from 'vitest';
import { CALL_PENALTY, CALL_WAIT, Incidents, drawIncidents, type IncidentSpec } from '../../src/game/incidents';
import { rng } from '../../src/lib/random';

/** `up`: links whose cord joins their ports; `bypassed`: links carried by a bypass meanwhile */
function incidentsWith(specs: IncidentSpec[], up: Set<number>, bypassed = new Set<number>()) {
  return new Incidents(specs, () => [0, 1, 2], (i) => up.has(i), (i) => up.has(i) || bypassed.has(i), rng(1));
}

describe('incidents while the work goes on', () => {
  it('a colleague unplugs a link that was up, when its time comes', () => {
    const up = new Set([0, 1, 2]);
    const inc = incidentsWith([{ kind: 'colleague', at: 10 }], up);
    expect(inc.tick(9)).toEqual([]);
    const [ev] = inc.tick(2);
    expect(ev.kind).toBe('colleague');
    expect(up.has(ev.link)).toBe(true);
  });

  it('a user calls about a link down, and is happy once it is back', () => {
    const up = new Set([0, 2]);
    const inc = incidentsWith([{ kind: 'call', at: 1 }], up);
    expect(inc.tick(1)).toEqual([{ kind: 'call', link: 1, within: CALL_WAIT }]);
    expect(inc.callLeft()).toBe(CALL_WAIT);
    up.add(1);
    expect(inc.tick(5)).toEqual([{ kind: 'callMet', link: 1 }]);
    expect(inc.callLeft()).toBeNull();
  });

  it('a call left unanswered costs a penalty', () => {
    const inc = incidentsWith([{ kind: 'call', at: 0 }], new Set([0, 2]));
    inc.tick(0.1);
    expect(inc.tick(CALL_WAIT)).toEqual([{ kind: 'callMissed', link: 1, penalty: CALL_PENALTY }]);
  });

  it('nobody calls while everything works', () => {
    const inc = incidentsWith([{ kind: 'call', at: 0 }], new Set([0, 1, 2]));
    expect(inc.tick(1)).toEqual([]);
  });

  it('a colleague finds nothing to unplug when every link is down: it passes unnoticed', () => {
    const inc = incidentsWith([{ kind: 'colleague', at: 0 }], new Set());
    expect(inc.tick(1)).toEqual([]);
  });

  it('one call at a time: another while the first waits passes unnoticed', () => {
    const up = new Set([0]);
    const inc = incidentsWith([{ kind: 'call', at: 0 }, { kind: 'call', at: 5 }], up);
    const [first] = inc.tick(1);
    expect(first.kind).toBe('call');
    expect(inc.tick(10)).toEqual([]);
    if (first.kind !== 'call') return;
    up.add(first.link);
    expect(inc.tick(1)).toEqual([{ kind: 'callMet', link: first.link }]);
    expect(inc.callLeft()).toBeNull();
  });

  it('a long frame settles the call due, then fires what comes next', () => {
    const up = new Set([0, 2]);
    const inc = incidentsWith([{ kind: 'call', at: 0 }, { kind: 'colleague', at: CALL_WAIT + 5 }], up);
    inc.tick(0.1);
    const events = inc.tick(CALL_WAIT + 10);
    expect(events.map((e) => e.kind)).toEqual(['callMissed', 'colleague']);
  });

  it('nobody calls about a link cut but carried by a bypass', () => {
    const inc = incidentsWith([{ kind: 'call', at: 0 }], new Set([0, 2]), new Set([1]));
    expect(inc.tick(1)).toEqual([]);
    expect(inc.callLeft()).toBeNull();
  });

  it('a bypass put on the link a user calls about meets the call', () => {
    const bypassed = new Set<number>();
    const inc = incidentsWith([{ kind: 'call', at: 0 }], new Set([0, 2]), bypassed);
    expect(inc.tick(1)).toEqual([{ kind: 'call', link: 1, within: CALL_WAIT }]);
    bypassed.add(1);
    expect(inc.tick(1)).toEqual([{ kind: 'callMet', link: 1 }]);
  });

  it('draws colleagues and calls in turn, a while apart', () => {
    const specs = drawIncidents(4, rng(3));
    expect(specs.map((s) => s.kind)).toEqual(['colleague', 'call', 'colleague', 'call']);
    for (let k = 1; k < specs.length; k++) expect(specs[k].at - specs[k - 1].at).toBeGreaterThanOrEqual(50);
  });
});
