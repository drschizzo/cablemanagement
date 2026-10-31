// The game modes, in two groups: the story (the training, then the career)
// and free play (the big cabinets, or a cabinet set up by the player). One
// card per mode, with what it is in a sentence and where the player stands in
// it; a mode not open yet says what opens it (modeLocks.ts). From the title
// screen, and from a level's pause menu.

import type { LevelDef } from '../game/levels/levelDef';
import { TRAINING } from '../game/levels/training';
import { BIG_BAYS } from '../game/levels/bigBays';
import { TICKETS } from '../game/levels/career';
import { $ } from '../lib/page';
import { hide, show } from './dom';
import { load, type Progress } from '../progression/storage';
import { tr, type Words } from '../lib/language';
import { isModeOpen, type Mode } from '../progression/modeLocks';
import { levelTitle } from './levelTexts';

/** where the cards lead; each gets `start` (what a level chosen does) and `back` (back to the modes) */
export interface ModesActions {
  training(start: (level: LevelDef) => void, back: () => void): void;
  career(start: (level: LevelDef) => void, back: () => void): void;
  free(start: (level: LevelDef) => void, back: () => void): void;
}

interface ModeCard {
  mode: Mode;
  name: Words;
  what: Words;
  /** where the player stands in it (empty: nothing to say) */
  status: () => string;
  /** what the card does when chosen */
  open: () => void;
}

interface ModeGroup {
  name: Words;
  cards: ModeCard[];
}

export class ModesPanel {
  constructor(private actions: ModesActions, private progress: () => Progress) {
    $('#modes-back').onclick = () => { hide('#modes'); this.back(); };
  }

  private back = () => {};

  /** `start`: what a level chosen does; `back`: where the Back button returns */
  show(start: (level: LevelDef) => void, back: () => void): void {
    this.back = back;
    const reopen = () => this.show(start, back);
    const lead = (open: () => void) => () => { hide('#modes'); open(); };
    const box = $('#modes-cards');
    box.innerHTML = '';
    for (const group of this.groups(start, reopen, lead)) box.appendChild(this.groupElement(group));
    show('#modes');
  }

  private groups(start: (level: LevelDef) => void, reopen: () => void, lead: (open: () => void) => () => void): ModeGroup[] {
    const progress = this.progress();
    const stars = (ids: string[]) => ids.reduce((sum, id) => sum + (progress.stars[id] ?? 0), 0);
    return [
      {
        name: { fr: 'Histoire', en: 'Story' },
        cards: [
          {
            mode: 'training',
            name: { fr: 'Formation', en: 'Training' },
            what: { fr: `${TRAINING.length} baies pour apprendre le métier, une règle de plus à chacune. La carrière vient après.`, en: `${TRAINING.length} cabinets to learn the trade, one more rule each. The career comes after.` },
            status: () => `★ ${stars(TRAINING.map((l) => l.id))}/${3 * TRAINING.length}`,
            open: lead(() => this.actions.training(start, reopen)),
          },
          {
            mode: 'career',
            name: { fr: 'Carrière', en: 'Career' },
            what: { fr: 'Radio Pinède, 98.4 FM : une seule baie, ticket après ticket, retrouvée comme vous l\'avez laissée.', en: 'Radio Pinède, 98.4 FM: one cabinet, ticket after ticket, found as you left it.' },
            status: () => tr({ fr: `Ticket ${Math.min(load('career').done + 1, TICKETS.length)}/${TICKETS.length}`, en: `Ticket ${Math.min(load('career').done + 1, TICKETS.length)}/${TICKETS.length}` }),
            open: lead(() => this.actions.career(start, reopen)),
          },
        ],
      },
      {
        name: { fr: 'Partie libre', en: 'Free play' },
        cards: [
          {
            mode: 'free',
            name: { fr: 'Baie libre', en: 'Free cabinet' },
            what: { fr: `Les ${BIG_BAYS.length} grandes baies toutes prêtes, ou une baie que vous réglez : nombre de câbles, désordre, équipement, en production ou non.`, en: `The ${BIG_BAYS.length} big cabinets ready to play, or a cabinet you set up: number of cords, mess, equipment, in production or not.` },
            status: () => `★ ${stars(BIG_BAYS.map((l) => l.id))}/${3 * BIG_BAYS.length}`,
            open: lead(() => this.actions.free(start, reopen)),
          },
        ],
      },
    ];
  }

  private groupElement(group: ModeGroup): HTMLElement {
    const el = document.createElement('section');
    el.className = 'mode-group';
    el.innerHTML = `<h2>${tr(group.name)}</h2>`;
    const cards = document.createElement('div');
    cards.className = 'cards';
    for (const card of group.cards) cards.appendChild(this.cardElement(card));
    el.appendChild(cards);
    return el;
  }

  private cardElement(card: ModeCard): HTMLElement {
    const el = document.createElement('div');
    const open = isModeOpen(card.mode, this.progress());
    el.className = 'mode-card' + (open ? '' : ' locked');
    el.innerHTML = `<div class="t">${tr(card.name)}<span class="status">${open ? card.status() : ''}</span></div><p>${tr(card.what)}</p>`;
    if (!open) {
      el.appendChild(this.lockElement());
      return el;
    }
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.onclick = () => card.open();
    el.onkeydown = (e) => { if (e.key === 'Enter' && e.target === el) card.open(); };
    return el;
  }

  /** what opens a locked mode: the training, all of it */
  private lockElement(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'lock';
    const last = TRAINING.length - 1;
    el.textContent = tr({ fr: `🔒 S'ouvre à la fin de la formation · niveau ${last + 1}, ${levelTitle(TRAINING[last])}`, en: `🔒 Opens at the end of the training · level ${last + 1}, ${levelTitle(TRAINING[last])}` });
    return el;
  }
}
