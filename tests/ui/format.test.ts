import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatCost, formatLength, formatTime } from '../../src/ui/format';
import { setLanguage } from '../../src/ui/language';

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

  it('rounds a length off the physics to the centimetre before choosing the unit', () => {
    expect(formatLength(0.996)).toBe('1 m');
    expect(formatLength(0.994)).toBe('99 cm');
    expect(formatLength(1.004)).toBe('1 m');
    expect(formatLength(1.996)).toBe('2 m');
    expect(formatLength(1.005 + 1e-9)).toBe('1,01 m');
  });

  it('writes a duration as minutes:seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(600)).toBe('10:00');
  });
});

describe('numbers in English', () => {
  beforeEach(() => setLanguage('en'));
  afterEach(() => setLanguage('fr'));

  it('writes a decimal point', () => {
    expect(formatCost(0.25)).toBe('0.25 pt');
    expect(formatLength(1.5)).toBe('1.50 m');
  });
});
