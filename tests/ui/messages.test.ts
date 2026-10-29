// The game sends data; the words are tested here, where they are written.
import { describe, expect, it } from 'vitest';
import { cordTooltipHtml, hintHtml, readabilityText, toastText } from '../../src/ui/messages';

describe('the messages of a level', () => {
  it('says how much a cord lacks for a route', () => {
    expect(toastText({ kind: 'routeRefused', error: { kind: 'tooShort', missing: 0.123 } })).toMatch(/trop court.*il manque 13 cm/);
  });

  it('names the links just cut, and what they cost', () => {
    const text = toastText({ kind: 'linksCut', links: [{ link: 2, service: 1 }], costPerSecond: 3 });
    expect(text).toContain('Liaison 3 (Voix) coupée : 3 pts par seconde');
    expect(toastText({ kind: 'linksCut', links: [{ link: 0, service: 0 }], costPerSecond: 0 })).toContain('dérivation');
  });

  it('counts the cords a velcro line would strap', () => {
    expect(hintHtml({ kind: 'velcroLine', cords: 3 })).toContain('<b>3 câbles</b>');
    expect(hintHtml({ kind: 'velcroLine', cords: 0 })).toContain('en travers');
  });

  it('hides where an unmarked cord goes until it is traced', () => {
    const cord = { type: 'CU' as const, length: 1.5, line: -1, strain: null };
    expect(cordTooltipHtml({ ...cord, ends: null }, [])).toContain('sans marque');
    expect(cordTooltipHtml({ ...cord, ends: ['A1', null] }, [{ kind: 'traceOrCrate' }])).toContain('A1 ↔ — · 1,50 m<br><i>T : tracer');
  });

  it('names every readability criterion', () => {
    expect(readabilityText({ criterion: 'crossings', value: 0.5, crossings: 2 }).tip).toBe('2 croisements hors des supports');
  });
});
