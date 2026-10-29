// The cabinet editor, from the levels menu: equipment from a palette, stacked
// top to bottom and moved about, the cords, the difficulty, the services, the
// maintenance window; then play it, or copy its link to share it. The last
// cabinet composed is kept for next time.

import {
  MAX_UNITS, PALETTE, checkSpec, customLevel, decodeSpec, encodeSpec, mostCords,
  type CustomError, type CustomSpec, type Difficulty, type PaletteItem,
} from '../game/levels/customLevel';
import type { LevelDef } from '../game/levels/levelDef';
import { assertNever } from '../lib/assertNever';
import { $ } from '../lib/page';
import { hide, show } from './dom';
import { load, save } from './storage';
import { customLink } from './share';
import { tr } from './language';

/** the cabinet the editor opens on, the first time */
const FIRST_SPEC: CustomSpec = {
  units: ['blank', 'copperPanel', 'blank', 'switch', 'blank', 'firewall', 'blank', 'router', 'server', 'ups'],
  cables: 12, difficulty: 'normal', services: 3, maintenance: true, seed: 1,
};

export class EditorPanel {
  private spec: CustomSpec = FIRST_SPEC;
  private back = () => {};
  private start: (level: LevelDef) => void = () => {};

  constructor() {
    $('#ed-back').onclick = () => { hide('#editor'); this.back(); };
    $('#ed-palette').innerHTML = (Object.values(PALETTE) as PaletteItem[]).map((item) => `<button data-item="${item}">+ ${itemName(item)}</button>`).join('');
    $('#ed-palette').querySelectorAll<HTMLButtonElement>('[data-item]').forEach((b) => {
      b.onclick = () => this.change({ units: [...this.spec.units, b.dataset.item as PaletteItem] });
    });
    const cables = $<HTMLInputElement>('#ed-cables'), services = $<HTMLInputElement>('#ed-services');
    cables.oninput = () => this.change({ cables: Number(cables.value) });
    services.oninput = () => this.change({ services: Number(services.value) });
    $<HTMLSelectElement>('#ed-difficulty').onchange = (e) => this.change({ difficulty: (e.target as HTMLSelectElement).value as Difficulty });
    $<HTMLInputElement>('#ed-maintenance').onchange = (e) => this.change({ maintenance: (e.target as HTMLInputElement).checked });
    $('#ed-play').onclick = () => {
      if (checkSpec(this.spec)) return;
      hide('#editor');
      this.start(customLevel(this.spec));
    };
    $('#ed-link').onclick = () => this.copyLink();
    $('#ed-import').onclick = () => {
      const read = decodeSpec($<HTMLInputElement>('#ed-code').value.replace(/^.*[?&]rack=/, ''));
      if ('kind' in read) $('#ed-error').textContent = customErrorText(read);
      else this.change(read);
    };
  }

  /** `start`: what Play does with the cabinet; `back`: where the Back button returns */
  show(start: (level: LevelDef) => void, back: () => void): void {
    this.start = start;
    this.back = back;
    const kept = decodeSpec(load('editorDraft'));
    if (!('kind' in kept)) this.spec = kept;
    this.render();
    show('#editor');
  }

  /** the spec changed: a new seed (another mess), kept, shown */
  private change(part: Partial<CustomSpec>): void {
    this.spec = { ...this.spec, ...part, seed: Math.floor(Math.random() * 36 ** 5) };
    this.spec.cables = Math.max(1, Math.min(this.spec.cables, mostCords(this.spec.units) || 1));
    if (!checkSpec(this.spec)) save('editorDraft', encodeSpec(this.spec));
    this.render();
  }

  private render(): void {
    const spec = this.spec;
    const list = $('#ed-units');
    list.innerHTML = '';
    spec.units.forEach((item, k) => {
      const row = document.createElement('div');
      row.className = 'ed-unit';
      row.innerHTML = `<span class="u">${k + 1}U</span><span class="name">${itemName(item)}</span>
        <button data-move="-1" title="${tr({ fr: 'Monter', en: 'Up' })}" ${k === 0 ? 'disabled' : ''}>↑</button>
        <button data-move="1" title="${tr({ fr: 'Descendre', en: 'Down' })}" ${k === spec.units.length - 1 ? 'disabled' : ''}>↓</button>
        <button data-remove title="${tr({ fr: 'Retirer', en: 'Remove' })}">✕</button>`;
      row.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((b) => {
        b.onclick = () => {
          const units = [...spec.units], to = k + Number(b.dataset.move);
          [units[k], units[to]] = [units[to], units[k]];
          this.change({ units });
        };
      });
      row.querySelector<HTMLButtonElement>('[data-remove]')!.onclick = () => this.change({ units: spec.units.filter((_, i) => i !== k) });
      list.appendChild(row);
    });
    const most = mostCords(spec.units);
    const cables = $<HTMLInputElement>('#ed-cables');
    cables.max = String(Math.max(1, most));
    cables.value = String(spec.cables);
    $('#ed-cables-val').textContent = tr({ fr: `${spec.cables} câbles (au plus ${most})`, en: `${spec.cables} cords (${most} at most)` });
    $<HTMLInputElement>('#ed-services').value = String(spec.services);
    $('#ed-services-val').textContent = String(spec.services);
    const difficulty = $<HTMLSelectElement>('#ed-difficulty');
    difficulty.innerHTML = (['easy', 'normal', 'hard'] as Difficulty[]).map((d) => `<option value="${d}">${difficultyName(d)}</option>`).join('');
    difficulty.value = spec.difficulty;
    $<HTMLInputElement>('#ed-maintenance').checked = spec.maintenance;
    $('#ed-palette').classList.toggle('full', spec.units.length >= MAX_UNITS);
    const error = checkSpec(spec);
    $('#ed-error').textContent = error ? customErrorText(error) : '';
    $<HTMLButtonElement>('#ed-play').disabled = !!error;
    $<HTMLButtonElement>('#ed-link').disabled = !!error;
    $<HTMLButtonElement>('#ed-link').textContent = tr({ fr: 'Copier le lien', en: 'Copy the link' });
  }

  private copyLink(): void {
    if (checkSpec(this.spec)) return;
    const link = customLink(this.spec), button = $('#ed-link');
    const byHand = () => { window.prompt(tr({ fr: 'Lien de la baie', en: 'Link of the cabinet' }), link); };
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => { button.textContent = tr({ fr: 'Lien copié ✓', en: 'Link copied ✓' }); }, byHand);
    else byHand();
  }
}

function itemName(item: PaletteItem): string {
  switch (item) {
    case 'blank': return tr({ fr: 'Unité vide', en: 'Empty unit' });
    case 'copperPanel': return tr({ fr: 'Panneau cuivre 24', en: 'Copper panel 24' });
    case 'fibrePanel': return tr({ fr: 'Tiroir optique 12', en: 'Fibre panel 12' });
    case 'switch': return tr({ fr: 'Switch 24', en: 'Switch 24' });
    case 'firewall': return tr({ fr: 'Pare-feu', en: 'Firewall' });
    case 'router': return tr({ fr: 'Routeur', en: 'Router' });
    case 'server': return tr({ fr: 'Serveur', en: 'Server' });
    case 'ups': return tr({ fr: 'Onduleur', en: 'UPS' });
    default: return assertNever(item);
  }
}

function difficultyName(d: Difficulty): string {
  switch (d) {
    case 'easy': return tr({ fr: 'Facile : peu de désordre', en: 'Easy: little mess' });
    case 'normal': return tr({ fr: 'Normal', en: 'Normal' });
    case 'hard': return tr({ fr: 'Difficile : un vrai plat de spaghettis', en: 'Hard: a real spaghetti bowl' });
    default: return assertNever(d);
  }
}

/** why a cabinet of the editor cannot be played, or a code read */
export function customErrorText(e: CustomError): string {
  switch (e.kind) {
    case 'noPanel': return tr({ fr: 'Il faut au moins un panneau de brassage.', en: 'It takes a patch panel at least.' });
    case 'noSwitch': return tr({ fr: 'Il faut au moins un switch.', en: 'It takes a switch at least.' });
    case 'tooManyUnits': return tr({ fr: `${e.most} unités au plus.`, en: `${e.most} units at most.` });
    case 'tooManyCords': return tr({ fr: `Entre 1 et ${e.most} câbles : autant que de ports de panneaux et de switchs.`, en: `Between 1 and ${e.most} cords: as many as the panel and switch ports.` });
    case 'twice': return e.item === 'firewall' ? tr({ fr: 'Un seul pare-feu.', en: 'One firewall only.' }) : tr({ fr: 'Un seul routeur.', en: 'One router only.' });
    case 'badCode': return tr({ fr: 'Ce code ne décrit pas une baie.', en: 'This code describes no cabinet.' });
    default: return assertNever(e);
  }
}
