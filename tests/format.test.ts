import { describe, expect, it } from 'vitest';
import { formatCost, formatLength, formatTime } from '../src/format';

describe('numbers as the player reads them', () => {
  it('writes a cost in points, with a decimal comma', () => {
    expect(formatCost(1)).toBe('1 pt');
    expect(formatCost(3)).toBe('3 pts');
    expect(formatCost(0.25)).toBe('0,25 pt');
    expect(formatCost(1.5)).toBe('1,5 pts');
  });

  it('writes a cord length in centimetres under a metre, else in metres', () => {
    expect(formatLength(0.25)).toBe('25 cm');
    expect(formatLength(1)).toBe('1 m');
    expect(formatLength(1.5)).toBe('1,50 m');
  });

  it('writes a duration as minutes:seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(600)).toBe('10:00');
  });
});
