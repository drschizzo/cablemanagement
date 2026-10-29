// Numbers as the player reads them (French conventions: decimal comma).

/** downtime per second, as the budget counts it */
export function formatCost(v: number): string {
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, '').replace('.', ',')} pt${v > 1 ? 's' : ''}`;
}
