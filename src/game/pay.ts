// What a job pays: a fee for each link plugged as planned, more for a tidy
// cabinet, a bonus for a readable one and for the downtime spared, and the
// challenge won on top. The interface names the lines (ui/), and pays only
// what a replay adds to the best payslip of a level (ui/wallet.ts).

import type { Evaluation } from './evaluation';
import { assertNever } from '../lib/assertNever';

/** € a link earns: plugged as planned, then in a cabinet worth two stars, then three */
const PER_LINK = 5;
const PER_LINK_TIDY = 3;
const PER_LINK_PERFECT = 5;
/** € a link earns at a readability note of 100 (in proportion below) */
const PER_LINK_READABLE = 2;
/** € the whole budget spared earns (in proportion to what is left of it) */
const BUDGET_SPARED = 20;
/** € the challenge won earns */
const CHALLENGE = 25;

export type PayItem = 'links' | 'tidy' | 'readability' | 'budget' | 'challenge';

export interface Payslip {
  lines: { item: PayItem; amount: number }[];
  /** € */
  total: number;
}

/** what a signed-off cabinet earns */
export function payslip(ev: Evaluation, challengeWon: boolean): Payslip {
  const lines = (['links', 'tidy', 'readability', 'budget', 'challenge'] as const)
    .map((item) => ({ item, amount: Math.round(amountOf(item, ev, challengeWon)) }))
    .filter((l) => l.amount > 0);
  return { lines, total: lines.reduce((sum, l) => sum + l.amount, 0) };
}

function amountOf(item: PayItem, ev: Evaluation, challengeWon: boolean): number {
  switch (item) {
    case 'links': return PER_LINK * ev.connected;
    case 'tidy': return ev.stars >= 2 ? ev.total * (PER_LINK_TIDY + (ev.stars === 3 ? PER_LINK_PERFECT : 0)) : 0;
    case 'readability': return ev.stars >= 2 ? (PER_LINK_READABLE * ev.total * ev.readability.note) / 100 : 0;
    case 'budget': return Number.isFinite(ev.budget) && ev.budget > 0 ? BUDGET_SPARED * Math.max(0, 1 - ev.downtime / ev.budget) : 0;
    case 'challenge': return challengeWon ? CHALLENGE : 0;
    default: return assertNever(item);
  }
}
