// Numbers as the player reads them (French conventions: decimal comma).

/** downtime per second, as the budget counts it */
export function formatCost(points: number): string {
  return `${Number.isInteger(points) ? points : points.toFixed(2).replace(/0$/, '').replace('.', ',')} pt${points > 1 ? 's' : ''}`;
}

/** a cord length: in centimetres under a metre, else in metres */
export function formatLength(metres: number): string {
  return metres < 1 ? `${Math.round(metres * 100)} cm` : `${metres.toFixed(metres % 1 ? 2 : 0).replace('.', ',')} m`;
}

/** a duration as minutes:seconds */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
