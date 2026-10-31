// The career panel, from the title screen: the client, its tickets one by one
// (signed off with their record, the one to play now, those still locked),
// and a new career from the mess.

import { TICKETS, ticketLevel } from '../game/levels/career';
import type { LevelDef } from '../game/levels/levelDef';
import { load, save } from '../progression/storage';
import { hide, show } from './dom';
import { recordBadge } from './recordBadge';
import { $ } from '../lib/page';
import { currentTicket } from '../progression/career';
import { levelBrief, levelTitle } from './levelTexts';
import { confirmLeaving } from './confirmDialog';
import { tr } from '../lib/language';

export class CareerPanel {
  private back = () => {};
  private start: (level: LevelDef) => void = () => {};

  constructor() {
    $('#career-back').onclick = () => { hide('#career'); this.back(); };
    $('#career-reset').onclick = () => {
      hide('#career');
      confirmLeaving(tr({ fr: 'Recommencer la carrière ?', en: 'Start the career over?' }), tr({ fr: 'Recommencer', en: 'Start over' }),
        () => { save('career', null); this.show(this.start, this.back); },
        () => show('#career'),
        tr({ fr: 'La baie de Radio Pinède repartira du désordre du premier jour.', en: 'Radio Pinède\'s cabinet will go back to the mess of the first day.' }));
    };
  }

  /** `start`: what the ticket chosen does; `back`: where the Back button returns */
  show(start: (level: LevelDef) => void, back: () => void): void {
    this.start = start;
    this.back = back;
    const career = load('career');
    const now = currentTicket(career);
    const box = $('#career-tickets');
    box.innerHTML = '';
    // the tickets signed off with their record, then the one to play with its brief
    for (let t = 0; t <= career.done && t < TICKETS.length; t++) {
      const card = document.createElement('div');
      const level = t === now?.ticket ? now : ticketLevel(t, null);
      card.className = 'ticket' + (t < career.done ? ' done' : ' now');
      card.innerHTML = `<b>${levelTitle(level)}</b>`
        + (t < career.done ? recordBadge(career.records[t]) : `<p>${levelBrief(level)}</p>`);
      box.appendChild(card);
    }
    // the locked ones, by their number only: the client has not called yet
    const later = TICKETS.length - career.done - 1;
    if (later > 0) {
      const row = document.createElement('div');
      row.className = 'later';
      row.innerHTML = Array.from({ length: later }, (_, i) => `<span>${String(career.done + 2 + i).padStart(2, '0')}</span>`).join('')
        + `<p>${tr({ fr: 'Chaque ticket validé ouvre le suivant.', en: 'Each ticket signed off opens the next.' })}</p>`;
      box.appendChild(row);
    }
    const go = $<HTMLButtonElement>('#career-go');
    go.style.display = now ? '' : 'none';
    go.textContent = career.done ? tr({ fr: 'Ticket suivant →', en: 'Next ticket →' }) : tr({ fr: 'Premier jour →', en: 'First day →' });
    go.onclick = () => { if (now) { hide('#career'); this.start(now); } };
    $('#career-over').style.display = now ? 'none' : '';
    show('#career');
  }
}
