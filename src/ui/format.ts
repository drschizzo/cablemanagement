// Numbers as the player reads them, in the language spoken (a decimal comma
// in French, a point in English).

import { tr } from './language';

/** a decimal number with the separator of the language spoken */
export function formatDecimal(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return tr({ fr: text.replace('.', ','), en: text });
}

/** downtime per second, as the budget counts it */
export function formatCost(points: number): string {
  const value = Number.isInteger(points) ? String(points) : formatDecimal(points, 2).replace(/0$/, '');
  return `${value} pt${points > 1 ? 's' : ''}`;
}

/** a cord length: in centimetres under a metre, else in metres */
export function formatLength(metres: number): string {
  return metres < 1 ? `${Math.round(metres * 100)} cm` : `${formatDecimal(metres, metres % 1 ? 2 : 0)} m`;
}

/** a duration as minutes:seconds */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** a sum of euros, whole: "120 €" in French, "€120" in English */
export function formatMoney(euros: number): string {
  return tr({ fr: `${euros} €`, en: `€${euros}` });
}
