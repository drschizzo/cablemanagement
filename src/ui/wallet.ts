// What the player earns: a job pays its payslip (game/pay.ts), but a level
// played again only pays what it adds to its best one, so that a level is
// not a mine to dig. Pure functions over the saved wallet: saving it is the
// caller's business (storage.ts).

import type { Payslip } from '../game/pay';
import type { Wallet } from './storage';

/** pays a job of level `levelId` into the wallet; returns the € paid */
export function earn(wallet: Wallet, levelId: string, slip: Payslip): number {
  const best = wallet.best[levelId] ?? 0;
  const paid = Math.max(0, slip.total - best);
  wallet.best[levelId] = Math.max(best, slip.total);
  wallet.coins += paid;
  return paid;
}
