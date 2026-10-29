// What the player earns and keeps: a job pays its payslip (game/pay.ts), but
// a level played again only pays what it adds to its best one, so that a
// level is not a mine to dig; a find picked up joins the collection. Pure
// functions over the saved wallet: saving it is the caller's business
// (storage.ts).

import type { Payslip } from '../game/pay';
import type { FindId } from '../game/finds';
import type { Wallet } from './storage';

/** pays a job of level `levelId` into the wallet; returns the € paid */
export function earn(wallet: Wallet, levelId: string, slip: Payslip): number {
  const best = wallet.best[levelId] ?? 0;
  const paid = Math.max(0, slip.total - best);
  wallet.best[levelId] = Math.max(best, slip.total);
  wallet.coins += paid;
  return paid;
}

/** a find picked up joins the collection; false when it was in it already */
export function collectFind(wallet: Wallet, find: FindId): boolean {
  if (wallet.finds.includes(find)) return false;
  wallet.finds.push(find);
  return true;
}
