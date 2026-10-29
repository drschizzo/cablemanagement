// The workshop, from the title screen: the € on hand, for each slot the looks
// to buy or to wear (a swatch each), and the finds picked up so far.

import { load, save } from './storage';
import { hide, show } from './dom';
import { $ } from '../lib/page';
import { LOOK_SLOTS, SHOP, buy, isOwned, wear, wornIn, type LookSlot } from './shop';
import { formatMoney } from './format';
import { tr } from './language';
import { assertNever } from '../lib/assertNever';
import { FINDS, type FindId } from '../game/finds';
import { LEVELS } from '../game/levels/campaign';
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
    const wallet = load('wallet');
    $('#shop-coins').textContent = formatMoney(wallet.coins);
    const box = $('#shop-items');
    box.innerHTML = '';
    for (const slot of LOOK_SLOTS) {
      const title = document.createElement('h2');
      title.textContent = slotName(slot);
      const row = document.createElement('div');
      row.className = 'swatches';
      const worn = wornIn(wallet, slot);
      for (const item of SHOP.filter((i) => i.slot === slot)) {
        const owned = isOwned(wallet, item);
        const button = document.createElement('button');
        button.className = 'swatch' + (item === worn ? ' cur' : '') + (owned ? '' : ' locked');
        button.disabled = !owned && wallet.coins < item.price;
        button.innerHTML = `<i style="background:${item.value}"></i><span>${tr(item.name)}</span><small>${item === worn ? tr({ fr: 'porté', en: 'worn' }) : owned ? tr({ fr: 'porter', en: 'wear' }) : formatMoney(item.price)}</small>`;
        button.onclick = () => {
          const w = load('wallet');
          if (owned ? wear(w, item) : buy(w, item) && wear(w, item)) save('wallet', w);
          this.render();
        };
        row.appendChild(button);
      }
      box.append(title, row);
    }
    this.renderFinds(wallet.finds);
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
    case 'accent': return tr({ fr: 'Lumière autour de la baie', en: 'Light round the cabinet' });
    default: return assertNever(slot);
  }
}

/** where a find not picked up yet hides, as a hint */
function whereHidden(id: FindId): string {
  const index = LEVELS.findIndex((l) => l.find === id);
  if (index >= 0) return tr({ fr: `Quelque part dans le niveau ${index + 1}, ${levelTitle(LEVELS[index])}.`, en: `Somewhere in level ${index + 1}, ${levelTitle(LEVELS[index])}.` });
  switch (id) {
    case 'keys': return tr({ fr: 'Dans la baie du jour, un dimanche.', en: 'In the cabinet of the day, on a Sunday.' });
    case 'manual': return tr({ fr: 'Dans une grande partie libre (30 câbles ou plus).', en: 'In a big free play (30 cords or more).' });
    default: return tr({ fr: 'Quelque part, dans une baie.', en: 'Somewhere, in a cabinet.' });
  }
}
