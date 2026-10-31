// How a cabinet signed off shows on its card (training, big cabinets,
// career): a tick, and the client's requirements met of those it asks, lit
// when all are.

import type { LevelRecord } from '../progression/storage';
import { requirementsMetText } from './messages';
import { tr } from '../lib/language';

/** the badge of a record ('' : not signed off yet) */
export function recordBadge(record: LevelRecord | undefined): string {
  if (!record) return '';
  const requirements = requirementsMetText(record.met, record.asked);
  return `<div class="record"><span class="signed">✓ ${tr({ fr: 'Validé', en: 'Signed off' })}</span>`
    + (requirements ? `<span class="req${record.met === record.asked ? ' all' : ''}">${requirements}</span>` : '') + '</div>';
}
