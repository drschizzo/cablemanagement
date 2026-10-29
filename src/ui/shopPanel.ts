// The workshop, from the title screen: the stars won, for each slot the looks
// open or still to win (a swatch each), and the finds picked up so far.

import { load, save } from './storage';
import { hide, show } from './dom';
import { $ } from '../lib/page';
import { LOOK_SLOTS, SHOP, equip, equippedIn, isOpen, starsWon, type LookSlot } from './shop';
import { language, tr } from './language';
import { assertNever } from '../lib/assertNever';
import { FINDS, type FindId } from '../game/finds';
import { LEVELS } from '../game/levels/campaign';
import { KEYS_WEEKDAY } from '../game/levels/dailyLevel';
import { MANUAL_FROM } from '../game/levels/freeLevel';
import { findName, findStory } from './names';
import { levelTitle } from './levelTexts';

export class ShopPanel {
  private back = () => {};

  constructor() {
    $('#shop-back').onclick = () => { hide('#shop'); this.back(); };
  }

  /** `back`: where the Back button returns */
  show(back: () => void): void {
    this.back = back;
    this.render();
    show('#shop');
  }

  private render(): void {
    const workshop = load('workshop');
    const stars = starsWon(load('progress'), load('career'));
    $('#shop-stars').textContent = `${stars} ★`;
    const box = $('#shop-items');
    box.innerHTML = '';
    for (const slot of LOOK_SLOTS) {
      const title = document.createElement('h2');
      title.textContent = slotName(slot);
      const row = document.createElement('div');
      row.className = 'swatches';
      const equipped = equippedIn(workshop, stars, slot);
      for (const item of SHOP.filter((i) => i.slot === slot)) {
        const open = isOpen(stars, item);
        const button = document.createElement('button');
        button.className = 'swatch' + (item === equipped ? ' cur' : '') + (open ? '' : ' locked');
        button.disabled = !open;
        button.innerHTML = `<i style="background:${item.value}"></i><span>${tr(item.name)}</span><small>${item === equipped ? tr({ fr: 'équipé', en: 'equipped' }) : open ? tr({ fr: 'équiper', en: 'equip' }) : `${item.stars} ★`}</small>`;
        button.onclick = () => {
          const w = load('workshop');
          if (equip(w, stars, item)) save('workshop', w);
          this.render();
        };
        row.appendChild(button);
      }
      box.append(title, row);
    }
    this.renderFinds(workshop.finds);
  }

  /** the finds: those picked up with their story, the others as where to look */
  private renderFinds(found: readonly string[]): void {
    $('#shop-finds-count').textContent = `${found.length}/${FINDS.length}`;
    $('#shop-finds').innerHTML = FINDS.map((id) => found.includes(id)
      ? `<div class="find"><b>${findName(id)}</b><span>${findStory(id)}</span></div>`
      : `<div class="find unknown"><b>???</b><span>${whereHidden(id)}</span></div>`).join('');
  }
}

function slotName(slot: LookSlot): string {
  switch (slot) {
    case 'velcro': return tr({ fr: 'Velcros', en: 'Velcros' });
    case 'accent': return tr({ fr: 'Éclairage de la salle', en: 'Room lighting' });
    default: return assertNever(slot);
  }
}

/** where a find not picked up yet hides, as a hint */
function whereHidden(id: FindId): string {
  const index = LEVELS.findIndex((l) => l.find === id);
  if (index >= 0) return tr({ fr: `Quelque part dans le niveau ${index + 1}, ${levelTitle(LEVELS[index])}.`, en: `Somewhere in level ${index + 1}, ${levelTitle(LEVELS[index])}.` });
  switch (id) {
    case 'keys': return tr({ fr: `Dans la baie du jour, un ${weekdayName(KEYS_WEEKDAY)}.`, en: `In the cabinet of the day, on a ${weekdayName(KEYS_WEEKDAY)}.` });
    case 'manual': return tr({ fr: `Dans une grande partie libre (${MANUAL_FROM} câbles ou plus).`, en: `In a big free play (${MANUAL_FROM} cords or more).` });
    default: return tr({ fr: 'Quelque part, dans une baie.', en: 'Somewhere, in a cabinet.' });
  }
}

/** a day of the week (Monday 0) in the player's language */
function weekdayName(weekday: number): string {
  // 2026-10-26 was a Monday
  return new Intl.DateTimeFormat(language(), { weekday: 'long' }).format(new Date(2026, 9, 26 + weekday));
}
