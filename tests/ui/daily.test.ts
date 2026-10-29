// The record of the cabinets of the day, the run of days, the lines to share.
import { describe, expect, it } from 'vitest';
import { dailyLevel } from '../../src/game/levels/dailyLevel';
import type { Evaluation } from '../../src/game/evaluation';
import { recordDaily, shareText, streak } from '../../src/ui/daily';
import type { DailyResult } from '../../src/ui/storage';

const status = (connected: boolean, tidy: boolean) => ({ cable: 0, connected, routed: tidy, clear: tidy, labelled: true, relaxed: tidy });
const ev = (stars: number, note: number): Evaluation => ({
  stars, downtime: 12.4, budget: 200, readability: { note, parts: [] },
  circuits: [status(true, true), status(true, false), status(false, false)],
} as unknown as Evaluation);
const done = (stars = 2): DailyResult => ({ stars, time: 60, note: 50, downtime: 0, budget: 200, lines: [2] });

describe('the cabinets of the day', () => {
  const level = dailyLevel('2026-11-05');

  it('keeps the best result of the day, and tells what it held before', () => {
    const record: Record<string, DailyResult> = {};
    recordDaily(record, level, ev(2, 70), 300);
    const second = recordDaily(record, level, ev(1, 90), 100);
    expect(record['2026-11-05'].stars).toBe(2);
    expect(second.previousStars).toBe(2);
    recordDaily(record, level, ev(2, 80), 400);
    expect(record['2026-11-05'].note).toBe(80);
  });

  it('counts the days in a row, today still to do or not', () => {
    const record = { '2026-11-03': done(), '2026-11-04': done(), '2026-11-02': done(0) };
    expect(streak(record, '2026-11-05')).toBe(2);
    expect(streak({ ...record, '2026-11-05': done() }, '2026-11-05')).toBe(3);
    expect(streak(record, '2026-11-07')).toBe(0);
  });

  it('shares the stars, the time and a grid of the links', () => {
    const record: Record<string, DailyResult> = {};
    recordDaily(record, level, ev(2, 70), 245);
    const text = shareText(level, record['2026-11-05'], 3);
    expect(text).toContain(`n° ${level.number}`);
    expect(text).toContain('★★☆ · ⏱ 4:05 · lisibilité 70 · ⚡ 12/200');
    expect(text).toContain('🟩🟨⬛');
    expect(text).toContain('🔥 3 jours de suite');
  });
});
