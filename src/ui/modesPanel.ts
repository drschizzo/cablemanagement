// The game modes, one card each with what it is in a sentence and where the
// player stands in it: the campaign, the puzzles, the career, the cabinet of
// the day, the zen mode, free play, the editor. From the title screen, and
// from a level's pause menu.

import type { LevelDef } from '../game/levels/levelDef';
import { LEVELS } from '../game/levels/campaign';
import { PUZZLES } from '../game/levels/puzzles';
import { TICKETS } from '../game/levels/career';
import { dailyLevel, dayKey } from '../game/levels/dailyLevel';
import { freeLevel, zenLevel } from '../game/levels/freeLevel';
import { $ } from '../lib/page';
import { hide, show } from './dom';
import { load, type Progress } from './storage';
import { streak } from './daily';
import { tr, type Words } from './language';

/** a section of the levels menu */
export type LevelSection = 'campaign' | 'puzzles';

/** where the cards lead; each gets `start` (what a level chosen does) and `back` (back to the modes) */
export interface ModesActions {
  levels(section: LevelSection, start: (level: LevelDef) => void, back: () => void): void;
  career(start: (level: LevelDef) => void, back: () => void): void;
  editor(start: (level: LevelDef) => void, back: () => void): void;
}

interface ModeCard {
  name: Words;
  what: Words;
  /** where the player stands in it (empty: nothing to say) */
  status: () => string;
  /** what the card does when chosen */
  open: () => void;
  /** a control in the card (the size of a free cabinet) */
  extra?: () => HTMLElement;
}

const randomSeed = () => Math.floor(Math.random() * 1e9);

export class ModesPanel {
  private freeCords = 16;

  constructor(private actions: ModesActions, private progress: () => Progress) {
    $('#modes-back').onclick = () => { hide('#modes'); this.back(); };
  }

  private back = () => {};

  /** `start`: what a level chosen does; `back`: where the Back button returns */
  show(start: (level: LevelDef) => void, back: () => void): void {
    this.back = back;
    const reopen = () => this.show(start, back);
    const go = (level: LevelDef) => { hide('#modes'); start(level); };
    const lead = (open: () => void) => () => { hide('#modes'); open(); };
    const box = $('#modes-cards');
    box.innerHTML = '';
    for (const card of this.cards(start, reopen, go, lead)) box.appendChild(this.cardElement(card));
    show('#modes');
  }

  private cards(start: (level: LevelDef) => void, reopen: () => void, go: (level: LevelDef) => void, lead: (open: () => void) => () => void): ModeCard[] {
    const progress = this.progress();
    const stars = (ids: string[]) => ids.reduce((sum, id) => sum + (progress.stars[id] ?? 0), 0);
    return [
      {
        name: { fr: 'Campagne', en: 'Campaign' },
        what: { fr: 'Huit baies de plus en plus chargées, du premier brassage au plat de spaghettis.', en: 'Eight ever busier cabinets, from the first patch to the spaghetti bowl.' },
        status: () => `★ ${stars(LEVELS.map((l) => l.id))}/${3 * LEVELS.length}`,
        open: lead(() => this.actions.levels('campaign', start, reopen)),
      },
      {
        name: { fr: 'Puzzles express', en: 'Express puzzles' },
        what: { fr: 'De toutes petites baies, une idée chacune, en peu de gestes.', en: 'Tiny cabinets, one idea each, in few gestures.' },
        status: () => `★ ${stars(PUZZLES.map((p) => p.id))}/${3 * PUZZLES.length}`,
        open: lead(() => this.actions.levels('puzzles', start, reopen)),
      },
      {
        name: { fr: 'Carrière', en: 'Career' },
        what: { fr: 'Radio Pinède, 98.4 FM : une seule baie, ticket après ticket, retrouvée comme vous l\'avez laissée.', en: 'Radio Pinède, 98.4 FM: one cabinet, ticket after ticket, found as you left it.' },
        status: () => tr({ fr: `Ticket ${Math.min(load('career').done + 1, TICKETS.length)}/${TICKETS.length}`, en: `Ticket ${Math.min(load('career').done + 1, TICKETS.length)}/${TICKETS.length}` }),
        open: lead(() => this.actions.career(start, reopen)),
      },
      {
        name: { fr: 'Baie du jour', en: 'Cabinet of the day' },
        what: { fr: 'La même baie pour tout le monde aujourd\'hui. Un résultat à partager.', en: 'The same cabinet for everyone today. A result to share.' },
        status: () => {
          const days = load('daily'), today = dayKey(new Date()), run = streak(days, today);
          return (days[today] ? '★'.repeat(days[today].stars) : tr({ fr: 'pas encore jouée', en: 'not played yet' })) + (run > 1 ? ` · 🔥 ${run}` : '');
        },
        open: () => go(dailyLevel(dayKey(new Date()))),
      },
      {
        name: { fr: 'Mode zen', en: 'Zen mode' },
        what: { fr: 'Une grande baie, sans chrono ni budget, en musique. Prenez votre temps.', en: 'A big cabinet, no clock, no budget, with music. Take your time.' },
        status: () => '',
        open: () => go(zenLevel(randomSeed())),
      },
      {
        name: { fr: 'Partie libre', en: 'Free play' },
        what: { fr: 'Une baie tirée au hasard, de la taille que vous voulez.', en: 'A cabinet drawn at random, of the size you want.' },
        status: () => tr({ fr: `${this.freeCords} câbles`, en: `${this.freeCords} cords` }),
        open: () => go(freeLevel(this.freeCords, randomSeed())),
        extra: () => this.cordsSlider(),
      },
      {
        name: { fr: 'Éditeur de baie', en: 'Cabinet editor' },
        what: { fr: 'Composez votre baie, jouez-la, partagez-la par un lien.', en: 'Compose your cabinet, play it, share it by a link.' },
        status: () => '',
        open: lead(() => this.actions.editor(start, reopen)),
      },
    ];
  }

  private cardElement(card: ModeCard): HTMLElement {
    const el = document.createElement('div');
    el.className = 'mode-card';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    const status = card.status();
    el.innerHTML = `<div class="t">${tr(card.name)}${status ? `<span class="status">${status}</span>` : ''}</div><p>${tr(card.what)}</p>`;
    if (card.extra) el.appendChild(card.extra());
    el.onclick = (e) => { if (!(e.target as HTMLElement).closest('input')) card.open(); };
    el.onkeydown = (e) => { if (e.key === 'Enter') card.open(); };
    return el;
  }

  /** how many cords a free cabinet has: the card's status follows */
  private cordsSlider(): HTMLElement {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '4'; input.max = '48'; input.step = '2';
    input.value = String(this.freeCords);
    input.oninput = () => {
      this.freeCords = Number(input.value);
      const status = input.closest('.mode-card')!.querySelector('.status')!;
      status.textContent = tr({ fr: `${this.freeCords} câbles`, en: `${this.freeCords} cords` });
    };
    return input;
  }
}
