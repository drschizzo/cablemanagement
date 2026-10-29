// Numbers as the player reads them (French conventions: decimal comma).

/** downtime per second, as the budget counts it */
export function formatCost(v: number): string {
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, '').replace('.', ',')} pt${v > 1 ? 's' : ''}`;
}

/** a cord length: in centimetres under a metre, else in metres */
export function formatLength(m: number): string {
  return m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(m % 1 ? 2 : 0).replace('.', ',')} m`;
}

/** a duration as minutes:seconds */
export function formatTime(t: number): string {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
