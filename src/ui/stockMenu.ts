// The stock of new cords: a menu beside the Stock button, by type, colour and
// length. A cord taken drops coiled into the crate on the floor.

import type { Controller } from '../play/controller';
import { CATALOGUE, CORD_KINDS, type FibreType, FIBRE_COLORS } from '../game/cordTypes';
import { SERVICES } from '../game/services';
import type { LevelDef } from '../game/levels/levelDef';
import { formatLength } from './format';
import { $ } from '../lib/page';
import { fibreName, serviceName } from './names';
import { tr } from './language';

export class StockMenu {
  private menu = $('#stock-menu');

  /** `onTaken`: a cord was taken (what to tell the player) */
  constructor(private onTaken: (message: string) => void) {
    // the menu closes on a click anywhere else
    window.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      if (this.menu.classList.contains('on') && !this.menu.contains(target) && !target.closest('.stock')) this.menu.classList.remove('on');
    }, true);
  }

  toggle(ctl: Controller, level: LevelDef): void {
    const types = [...new Set(ctl.world.circuits.map((c) => c.type))];
    let type: FibreType = types[0];
    let color: string | undefined = level.colorByService ? SERVICES[0].color : undefined;
    const render = () => {
      const stock = ctl.world.cordStock;
      const bypasses = ctl.world.maintenance.bypassesLeft;
      const head = tr({
        fr: 'Stock de cordons neufs<span>Ils arrivent enroulés dans le bac, au sol. Remplacer un cordon branché coupe sa liaison le temps de changer.</span>',
        en: 'Stock of new cords<span>They arrive coiled in the crate, on the floor. Swapping a plugged cord cuts its link while it is changed.</span>',
      });
      const foot = tr({ fr: `Dérivations : <b>${bypasses}</b><span>Cliquez le ⚡ d'une liaison du plan.</span>`, en: `Bypasses: <b>${bypasses}</b><span>Click the ⚡ of a link on the schedule.</span>` });
      this.menu.innerHTML = `<div class="h">${head}</div>
        ${types.length > 1 ? `<div class="types">${types.map((t) => `<button data-t="${t}" class="${t === type ? 'cur' : ''}"><i style="background:${FIBRE_COLORS[t]}"></i>${fibreName(t)}</button>`).join('')}</div>` : ''}
        ${CORD_KINDS[type].takesServiceColor && level.colorByService ? `<div class="colors">${SERVICES.slice(0, Math.max(1, level.services)).map((sv, i) => `<button data-c="${sv.color}" class="${sv.color === color ? 'cur' : ''}" style="background:${sv.color}" title="${serviceName(i)}"></button>`).join('')}</div>` : ''}
        <div class="grid">${CATALOGUE.map((L) => `<button data-l="${L}" ${(stock.get(L) ?? 0) > 0 ? '' : 'disabled'}>${formatLength(L)}<small>×${stock.get(L) ?? 0}</small></button>`).join('')}</div>
        ${level.bypass ? `<div class="h foot">${foot}</div>` : ''}`;
      this.menu.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => { b.onclick = () => { type = b.dataset.t as FibreType; render(); }; });
      this.menu.querySelectorAll<HTMLButtonElement>('[data-c]').forEach((b) => { b.onclick = () => { color = b.dataset.c; render(); }; });
      this.menu.querySelectorAll<HTMLButtonElement>('[data-l]').forEach((b) => {
        b.onclick = () => {
          const length = Number(b.dataset.l);
          if (!ctl.newCord(type, length, CORD_KINDS[type].takesServiceColor ? color : undefined)) return;
          this.onTaken(tr({ fr: `Cordon ${fibreName(type)} de ${formatLength(length)} dans le bac.`, en: `A ${formatLength(length)} ${fibreName(type)} cord in the crate.` }));
          render();
        };
      });
    };
    render();
    const anchor = document.querySelector('.tool.stock')!.getBoundingClientRect();
    this.menu.style.left = `${anchor.right + 10}px`;
    this.menu.style.top = `${Math.min(anchor.top, window.innerHeight - 260)}px`;
    this.menu.classList.toggle('on');
  }
}
