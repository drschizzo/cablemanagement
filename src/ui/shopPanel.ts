// The technician's notebook, from the title screen: the finds picked up so
// far, and where to look for the others; then, as a bonus, for each slot the
// looks open or still to win with the stars (a swatch each).

import { load, save } from './storage';
import { hide, show } from './dom';
import { $ } from '../lib/page';
import { LOOK_SLOTS, SHOP, equip, equippedIn, isOpen, starsWon, type LookSlot } from './shop';
import { tr } from './language';
import { assertNever } from '../lib/assertNever';
import { FINDS, type FindId } from '../game/finds';
import { BIG_BAYS, LEVELS } from '../game/levels/campaign';
import { KEYS_FROM, MANUAL_FROM } from '../game/levels/freeLevel';
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
  if (index >= 0) return tr({ fr: `Quelque part dans le niveau ${index + 1} de la formation, ${levelTitle(LEVELS[index])}.`, en: `Somewhere in level ${index + 1} of the training, ${levelTitle(LEVELS[index])}.` });
  const big = BIG_BAYS.find((l) => l.find === id);
  if (big) return tr({ fr: `Quelque part dans une grande baie, ${levelTitle(big)}.`, en: `Somewhere in a big cabinet, ${levelTitle(big)}.` });
  switch (id) {
    case 'keys': return tr({ fr: `Dans une baie libre en production, de ${KEYS_FROM} à ${MANUAL_FROM - 1} câbles.`, en: `In a free cabinet in production, of ${KEYS_FROM} to ${MANUAL_FROM - 1} cords.` });
    case 'manual': return tr({ fr: `Dans une baie libre de ${MANUAL_FROM} câbles ou plus.`, en: `In a free cabinet of ${MANUAL_FROM} cords or more.` });
    default: return tr({ fr: 'Quelque part, dans une baie.', en: 'Somewhere, in a cabinet.' });
  }
}

