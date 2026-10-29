// The modes open one by one as the story goes, over plain records.
import { describe, expect, it } from 'vitest';
import { isModeOpen, modeOpensAfter, type ModeRecords } from '../../src/ui/modeLocks';

const records = (r: Partial<ModeRecords> = {}): ModeRecords => ({
  progress: { stars: {}, times: {}, challenges: {} },
  career: { done: 0, cabinet: null, stars: [] },
  daily: {}, freeOpen: false, editorDraft: '', ...r,
});
const signedOff = (...ids: string[]) => records({ progress: { stars: Object.fromEntries(ids.map((id) => [id, 1])), times: {}, challenges: {} } });

describe('the game modes', () => {
  it('a first visit has the training only', () => {
    for (const mode of ['puzzles', 'daily', 'career', 'big', 'free'] as const) expect(isModeOpen(mode, records())).toBe(false);
    expect(isModeOpen('campaign', records())).toBe(true);
  });

  it('open with their level of the training signed off', () => {
    expect(isModeOpen('puzzles', signedOff('l2'))).toBe(true);
    expect(isModeOpen('daily', signedOff('l2'))).toBe(false);
    expect(isModeOpen('daily', signedOff('l3'))).toBe(true);
    expect(isModeOpen('career', signedOff('l4'))).toBe(false);
    expect(isModeOpen('career', signedOff('l5'))).toBe(true);
    expect(modeOpensAfter('career')).toEqual({ level: 'l5' });
    expect(modeOpensAfter('campaign')).toBeNull();
  });

  it('the big cabinets and free play open along the career', () => {
    const career = (done: number) => records({ career: { done, cabinet: null, stars: [] } });
    expect(isModeOpen('big', career(1))).toBe(false);
    expect(isModeOpen('big', career(2))).toBe(true);
    expect(isModeOpen('free', career(3))).toBe(false);
    expect(isModeOpen('free', career(4))).toBe(true);
  });

  it('stay open for a player who played them before the locks', () => {
    expect(isModeOpen('puzzles', signedOff('p3'))).toBe(true);
    expect(isModeOpen('daily', records({ daily: { '2026-10-01': { stars: 1, time: 1, downtime: 0, budget: 0, lines: [] } } }))).toBe(true);
    expect(isModeOpen('career', records({ career: { done: 2, cabinet: null, stars: [] } }))).toBe(true);
    expect(isModeOpen('free', records({ editorDraft: 'abc' }))).toBe(true);
    expect(isModeOpen('free', signedOff('free-16-42'))).toBe(true);
    // the big cabinets were the end of the campaign, and the last one opened free play
    expect(isModeOpen('big', signedOff('l6'))).toBe(true);
    expect(isModeOpen('free', signedOff('l8'))).toBe(true);
  });

  it('free play opens ahead on the player\'s word', () => {
    expect(isModeOpen('free', records({ freeOpen: true }))).toBe(true);
  });
});
