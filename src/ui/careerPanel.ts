// The career panel, from the title screen: the client, its tickets one by one
// (signed off with their stars, the one to play now, those still locked),
// and a new career from the mess.

import { TICKETS, ticketLevel } from '../game/levels/career';
import type { LevelDef } from '../game/levels/levelDef';
import { load, save } from './storage';
import { hide, show, starsHtml } from './dom';
import { $ } from '../lib/page';
import { currentTicket } from './career';
import { levelBrief, levelTitle } from './levelTexts';
import { confirmLeaving } from './confirmDialog';
import { tr } from './language';

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
        tr({ fr: 'La baie du client repartira du désordre du premier jour.', en: 'The client\'s cabinet will go back to the mess of the first day.' }));
    };
  }

  /** `start`: what the ticket chosen does; `back`: where the Back button returns */
  show(start: (level: LevelDef) => void, back: () => void): void {
    this.start = start;
    this.back = back;
    const career = load('career');
    const now = currentTicket(career);
    $('#career-tickets').innerHTML = '';
    TICKETS.forEach((_, t) => {
      const card = document.createElement('div');
      // a locked ticket shows only its number: the client has not called yet
      const level = t === now?.ticket ? now : ticketLevel(t, null);
      card.className = 'ticket' + (t < career.done ? ' done' : t === now?.ticket ? ' now' : ' later');
      card.innerHTML = t <= career.done
        ? `<b>${levelTitle(level)}</b>${t < career.done ? `<span class="stars">${starsHtml(career.stars[t] ?? 0)}</span>` : `<p>${levelBrief(level)}</p>`}`
        : `<b>${tr({ fr: `Ticket ${t + 1}`, en: `Ticket ${t + 1}` })}</b><span class="sub">🔒 ${tr({ fr: `Validez le ticket ${t} pour l'ouvrir`, en: `Sign off ticket ${t} to open it` })}</span>`;
      $('#career-tickets').appendChild(card);
    });
    const go = $<HTMLButtonElement>('#career-go');
    go.style.display = now ? '' : 'none';
    go.textContent = career.done ? tr({ fr: 'Ticket suivant →', en: 'Next ticket →' }) : tr({ fr: 'Premier jour →', en: 'First day →' });
    go.onclick = () => { if (now) { hide('#career'); this.start(now); } };
    $('#career-over').style.display = now ? 'none' : '';
    show('#career');
  }
}
