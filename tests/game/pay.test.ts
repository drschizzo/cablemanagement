// What a job pays, from its evaluation alone.
import { describe, expect, it } from 'vitest';
import { payslip } from '../../src/game/pay';
import type { Evaluation } from '../../src/game/evaluation';

const ev = (stars: number, connected: number, note = 50, downtime = 0, budget = Infinity) =>
  ({ stars, connected, total: 4, readability: { note, parts: [] }, downtime, budget } as unknown as Evaluation);

describe('what a job pays', () => {
  it('pays each link plugged, more for a tidy cabinet, more again for a perfect one', () => {
    const plugged = payslip(ev(1, 4), false).total;
    const tidy = payslip(ev(2, 4), false).total;
    const perfect = payslip(ev(3, 4), false).total;
    expect(plugged).toBe(20);
    expect(tidy).toBeGreaterThan(plugged);
    expect(perfect).toBeGreaterThan(tidy);
  });

  it('pays the budget spared, and the challenge won', () => {
    const spent = payslip(ev(3, 4, 50, 100, 100), false);
    const spared = payslip(ev(3, 4, 50, 0, 100), true);
    expect(spared.total - spent.total).toBe(20 + 25);
    expect(spared.lines.map((l) => l.item)).toContain('challenge');
  });
});
