// The question asked before leaving a level the player has worked on (the
// cabinet under way would be lost), or before starting the career over.

import { hide, show } from './dom';
import { $ } from '../lib/page';
import { tr } from '../lib/language';

/** asks `question`; `action` labels the button that leaves, `stay` runs on Cancel; `lost`: what leaving loses */
export function confirmLeaving(question: string, action: string, leave: () => void, stay: () => void, lost?: string): void {
  $('#confirm-title').textContent = question;
  $('#confirm-lost').textContent = lost ?? tr({ fr: 'La baie en cours sera perdue.', en: 'The cabinet under way will be lost.' });
  const yes = $('#confirm-yes');
  yes.textContent = action;
  yes.onclick = () => { hide('#confirm'); leave(); };
  $('#confirm-no').onclick = () => { hide('#confirm'); stay(); };
  show('#confirm');
}
