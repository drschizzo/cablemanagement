// The shop panel, from the title screen: the € on hand, and for each slot
// the looks to buy or to wear, a swatch each.

import { load, save } from './storage';
import { hide, show } from './dom';
import { $ } from '../lib/page';
import { LOOK_SLOTS, SHOP, buy, isOwned, wear, wornIn, type LookSlot } from './shop';
import { formatMoney } from './format';
import { tr } from './language';
import { assertNever } from '../lib/assertNever';

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
  }
}

function slotName(slot: LookSlot): string {
  switch (slot) {
    case 'velcro': return tr({ fr: 'Velcros', en: 'Velcros' });
    case 'accent': return tr({ fr: 'Lumière autour de la baie', en: 'Light round the cabinet' });
    default: return assertNever(slot);
  }
}
