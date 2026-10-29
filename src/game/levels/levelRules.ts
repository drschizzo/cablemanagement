// The rules a level plays by, beyond plugging and tidying: what it adds to
// the game (a downtime budget, fibres that kink, cords broken inside…). The
// brief tells a rule the first time the player meets it, and only recalls it
// after (ui/levelBrief.ts); its words are the interface's.

import type { LevelDef } from './levelDef';
import { CORD_KINDS } from '../cordTypes';
import { assertNever } from '../../lib/assertNever';

/** every rule, in the order a brief tells them */
export const RULES = ['leds', 'taut', 'kinked', 'maintenance', 'bypass', 'bundles', 'blind', 'faults', 'power', 'incidents'] as const;

export type Rule = typeof RULES[number];

/** the rules this level plays by, in the order of RULES */
export function levelRules(level: LevelDef): Rule[] {
  return RULES.filter((rule) => hasRule(level, rule));
}

function hasRule(level: LevelDef, rule: Rule): boolean {
  const cordTypes = [...level.types, ...(level.links ?? []).flatMap((l) => l.type ?? [])];
  switch (rule) {
    // what every cabinet is judged on
    case 'leds': case 'taut': return true;
    case 'kinked': return cordTypes.some((t) => CORD_KINDS[t].kinks);
    case 'maintenance': return level.downtime !== undefined;
    case 'bypass': return level.downtime !== undefined && (level.bypass ?? 0) > 0;
    case 'bundles': return (level.bundles ?? 0) > 0;
    case 'blind': return !!level.blind;
    case 'faults': return (level.faults ?? 0) > 0;
    case 'power': return cordTypes.some((t) => CORD_KINDS[t].family === 'power');
    case 'incidents': return (level.incidents?.length ?? 0) > 0;
    default: return assertNever(rule);
  }
}
