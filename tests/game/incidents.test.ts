// The incidents on their own: no rack, no physics. Whether a link is up is a
// plain set the test changes by hand.
import { describe, expect, it } from 'vitest';
import { CALL_PENALTY, CALL_WAIT, Incidents, drawIncidents, type IncidentSpec } from '../../src/game/incidents';
import { rng } from '../../src/lib/random';

function incidentsWith(specs: IncidentSpec[], up: Set<number>) {
  return new Incidents(specs, () => [0, 1, 2], (i) => up.has(i), rng(1));
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

  it('draws colleagues and calls in turn, a while apart', () => {
    const specs = drawIncidents(4, rng(3));
    expect(specs.map((s) => s.kind)).toEqual(['colleague', 'call', 'colleague', 'call']);
    for (let k = 1; k < specs.length; k++) expect(specs[k].at - specs[k - 1].at).toBeGreaterThanOrEqual(50);
  });
});
