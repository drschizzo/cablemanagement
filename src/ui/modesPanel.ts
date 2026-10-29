// The game modes, in three groups: the story (the training, then the
// career), the challenges (the puzzles, the cabinet of the day, the big
// cabinets) and free play
// (its size, its zen setting, and the editor to compose one's own). One card
// per mode, with what it is in a sentence and where the player stands in it;
// a mode not open yet says what opens it (modeLocks.ts). From the title
// screen, and from a level's pause menu.

import type { LevelDef } from '../game/levels/levelDef';
import { BIG_BAYS, LEVELS } from '../game/levels/campaign';
import { PUZZLES } from '../game/levels/puzzles';
import { TICKETS } from '../game/levels/career';
import { dailyLevel, dayKey } from '../game/levels/dailyLevel';
import { freeLevel, zenLevel } from '../game/levels/freeLevel';
import { $ } from '../lib/page';
import { hide, show } from './dom';
import { load, save, type Progress } from './storage';
import { streak } from './daily';
import { tr, type Words } from './language';
import type { LevelSection } from './levelMenu';
import { isModeOpen, modeOpensAfter, savedModeRecords, type Mode } from './modeLocks';
import { levelTitle } from './levelTexts';

/** where the cards lead; each gets `start` (what a level chosen does) and `back` (back to the modes) */
export interface ModesActions {
  levels(section: LevelSection, start: (level: LevelDef) => void, back: () => void): void;
  career(start: (level: LevelDef) => void, back: () => void): void;
  editor(start: (level: LevelDef) => void, back: () => void): void;
}

interface ModeCard {
  mode: Mode;
  name: Words;
  what: Words;
  /** where the player stands in it (empty: nothing to say) */
  status: () => string;
  /** what the card does when chosen */
  open: () => void;
  /** controls in the card (free play: its size, zen, the editor) */
  extra?: () => HTMLElement;
}

interface ModeGroup {
  name: Words;
  cards: ModeCard[];
}

const randomSeed = () => Math.floor(Math.random() * 1e9);

export class ModesPanel {
  private freeCords = 16;
  /** free play's zen setting: nothing in production, music */
  private zen = false;

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
    for (const group of this.groups(start, reopen, go, lead)) box.appendChild(this.groupElement(group, reopen));
    show('#modes');
  }

  private groups(start: (level: LevelDef) => void, reopen: () => void, go: (level: LevelDef) => void, lead: (open: () => void) => () => void): ModeGroup[] {
    const progress = this.progress();
    const stars = (ids: string[]) => ids.reduce((sum, id) => sum + (progress.stars[id] ?? 0), 0);
    return [
      {
        name: { fr: 'Histoire', en: 'Story' },
        cards: [
          {
            mode: 'campaign',
            name: { fr: 'Formation', en: 'Training' },
            what: { fr: `${LEVELS.length} baies pour apprendre le métier, une règle de plus à chacune. La carrière vient après.`, en: `${LEVELS.length} cabinets to learn the trade, one more rule each. The career comes after.` },
            status: () => `★ ${stars(LEVELS.map((l) => l.id))}/${3 * LEVELS.length}`,
            open: lead(() => this.actions.levels('campaign', start, reopen)),
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
        name: { fr: 'Défis', en: 'Challenges' },
        cards: [
          {
            mode: 'puzzles',
            name: { fr: 'Puzzles express', en: 'Express puzzles' },
            what: { fr: 'De toutes petites baies, une idée chacune, en peu de gestes.', en: 'Tiny cabinets, one idea each, in few gestures.' },
            status: () => `★ ${stars(PUZZLES.map((p) => p.id))}/${3 * PUZZLES.length}`,
            open: lead(() => this.actions.levels('puzzles', start, reopen)),
          },
          {
            mode: 'daily',
            name: { fr: 'Baie du jour', en: 'Cabinet of the day' },
            what: { fr: 'La même baie pour tout le monde aujourd\'hui. Un résultat à partager.', en: 'The same cabinet for everyone today. A result to share.' },
            status: () => {
              const days = load('daily'), today = dayKey(new Date()), run = streak(days, today);
              return (days[today] ? '★'.repeat(days[today].stars) : tr({ fr: 'pas encore jouée', en: 'not played yet' })) + (run > 1 ? ` · 🔥 ${run}` : '');
            },
            open: () => go(dailyLevel(dayKey(new Date()))),
          },
          {
            mode: 'big',
            name: { fr: 'Grandes baies', en: 'Big cabinets' },
            what: { fr: `${BIG_BAYS.length} salles chargées, de la salle serveurs au plat de spaghettis, où toutes les règles se croisent.`, en: `${BIG_BAYS.length} busy rooms, from the server room to the spaghetti bowl, where every rule meets the others.` },
            status: () => `★ ${stars(BIG_BAYS.map((l) => l.id))}/${3 * BIG_BAYS.length}`,
            open: lead(() => this.actions.levels('big', start, reopen)),
          },
        ],
      },
      {
        name: { fr: 'Partie libre', en: 'Free play' },
        cards: [
          {
            mode: 'free',
            name: { fr: 'Partie libre', en: 'Free play' },
            what: { fr: 'Une baie tirée au hasard, de la taille que vous voulez. En zen : rien en production, en musique.', en: 'A cabinet drawn at random, of the size you want. In zen: nothing in production, with music.' },
            status: () => this.freeStatus(),
            open: () => go(this.zen ? zenLevel(this.freeCords, randomSeed()) : freeLevel(this.freeCords, randomSeed())),
            extra: () => this.freeControls(lead(() => this.actions.editor(start, reopen))),
          },
        ],
      },
    ];
  }

  private groupElement(group: ModeGroup, reopen: () => void): HTMLElement {
    const el = document.createElement('section');
    el.className = 'mode-group';
    el.innerHTML = `<h2>${tr(group.name)}</h2>`;
    const cards = document.createElement('div');
    cards.className = 'cards';
    for (const card of group.cards) cards.appendChild(this.cardElement(card, reopen));
    el.appendChild(cards);
    return el;
  }

  private cardElement(card: ModeCard, reopen: () => void): HTMLElement {
    const el = document.createElement('div');
    const open = isModeOpen(card.mode, savedModeRecords());
    el.className = 'mode-card' + (open ? '' : ' locked');
    el.innerHTML = `<div class="t">${tr(card.name)}<span class="status">${open ? card.status() : ''}</span></div><p>${tr(card.what)}</p>`;
    if (!open) {
      el.appendChild(this.lockElement(card.mode, reopen));
      return el;
    }
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    if (card.extra) el.appendChild(card.extra());
    // the controls in the card do their own thing; a click anywhere else plays
    el.onclick = (e) => { if (!(e.target as HTMLElement).closest('input, label, button')) card.open(); };
    el.onkeydown = (e) => { if (e.key === 'Enter' && e.target === el) card.open(); };
    return el;
  }

  /** what opens a mode; free play may be opened ahead, on the player's word */
  private lockElement(mode: Mode, reopen: () => void): HTMLElement {
    const el = document.createElement('div');
    el.className = 'lock';
    const after = modeOpensAfter(mode);
    el.textContent = after === null ? ''
      : 'tickets' in after ? tr({ fr: `🔒 S'ouvre avec le ticket ${after.tickets} de la carrière`, en: `🔒 Opens with ticket ${after.tickets} of the career` })
      : this.levelLock(after.level);
    if (mode === 'free') {
      const button = document.createElement('button');
      button.className = 'link';
      button.textContent = tr({ fr: 'Ouvrir maintenant', en: 'Open it now' });
      button.onclick = () => { save('freeOpen', true); reopen(); };
      el.appendChild(button);
    }
    return el;
  }

  /** the training level that opens a mode, by its number and title */
  private levelLock(id: string): string {
    const index = LEVELS.findIndex((l) => l.id === id);
    return tr({ fr: `🔒 S'ouvre avec le niveau ${index + 1} de la formation · ${levelTitle(LEVELS[index])}`, en: `🔒 Opens with level ${index + 1} of the training · ${levelTitle(LEVELS[index])}` });
  }

  private freeStatus(): string {
    return tr({ fr: `${this.freeCords} câbles`, en: `${this.freeCords} cords` }) + (this.zen ? ' · zen' : '');
  }

  /** free play's settings: how many cords, zen or not; and the editor, to compose a cabinet instead */
  private freeControls(openEditor: () => void): HTMLElement {
    const box = document.createElement('div');
    box.className = 'free-controls';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '4'; input.max = '48'; input.step = '2';
    input.value = String(this.freeCords);
    const zen = document.createElement('label');
    zen.innerHTML = `<input type="checkbox"${this.zen ? ' checked' : ''}> ${tr({ fr: 'Zen : sans budget, en musique', en: 'Zen: no budget, with music' })}`;
    const status = () => { box.closest('.mode-card')!.querySelector('.status')!.textContent = this.freeStatus(); };
    input.oninput = () => { this.freeCords = Number(input.value); status(); };
    zen.querySelector('input')!.onchange = (e) => { this.zen = (e.target as HTMLInputElement).checked; status(); };
    const editor = document.createElement('button');
    editor.className = 'link';
    editor.textContent = tr({ fr: 'Composer la baie dans l\'éditeur →', en: 'Compose the cabinet in the editor →' });
    editor.onclick = openEditor;
    box.append(input, zen, editor);
    return box;
  }
}
