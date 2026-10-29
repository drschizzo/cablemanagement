// The question asked before leaving a level the player has worked on: the
// cabinet under way would be lost.

import { hide, show } from './dom';
import { $ } from '../lib/page';

/** asks `question`; `action` labels the button that leaves, `stay` runs on Cancel */
export function confirmLeaving(question: string, action: string, leave: () => void, stay: () => void): void {
  $('#confirm-title').textContent = question;
  const yes = $('#confirm-yes');
  yes.textContent = action;
  yes.onclick = () => { hide('#confirm'); leave(); };
  $('#confirm-no').onclick = () => { hide('#confirm'); stay(); };
  show('#confirm');
}
