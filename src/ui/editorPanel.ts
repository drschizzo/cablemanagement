// The cabinet editor, from the game modes: the cabinet drawn as an elevation,
// a strip per unit in the colours of its equipment, stacked from a palette
// and moved about; the cords, the services, the mess, the production; then
// play it, or copy its link to share it. The last cabinet composed is kept
// for next time.

import {
  MAX_UNITS, PALETTE, checkSpec, customLevel, decodeSpec, encodeSpec, mostCords,
  type CustomSpec, type Difficulty, type PaletteItem,
} from '../game/levels/customLevel';
import type { LevelDef } from '../game/levels/levelDef';
import { assertNever } from '../lib/assertNever';
import { $ } from '../lib/page';
import { hide, show } from './dom';
import { load, save } from './storage';
import { customLink } from './share';
import { tr } from './language';
import { SERVICES } from '../game/services';
import { serviceName } from './names';
import { customErrorText } from './messages';

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
    const cables = $<HTMLInputElement>('#ed-cables');
    cables.oninput = () => this.change({ cables: Number(cables.value) });
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
    $('#ed-count').textContent = `${spec.units.length}U`;
    this.renderRack();
    this.renderPalette();
    const most = mostCords(spec.units);
    const cables = $<HTMLInputElement>('#ed-cables');
    cables.max = String(Math.max(1, most));
    cables.value = String(spec.cables);
    $('#ed-cables-val').textContent = tr({ fr: `${spec.cables} / ${most} au plus`, en: `${spec.cables} / ${most} at most` });
    this.renderChoices('#ed-services', [1, 2, 3, 4, 5, 6].map((n) => ({ label: String(n), on: n === spec.services, pick: () => this.change({ services: n }) })));
    $('#ed-services-dots').innerHTML = SERVICES.slice(0, spec.services).map((sv, i) => `<i style="background:${sv.color}" title="${serviceName(i)}"></i>`).join('');
    this.renderChoices('#ed-difficulty', (['easy', 'normal', 'hard'] as Difficulty[]).map((d) => ({ label: difficultyName(d), on: d === spec.difficulty, pick: () => this.change({ difficulty: d }) })));
    $<HTMLInputElement>('#ed-maintenance').checked = spec.maintenance;
    const error = checkSpec(spec);
    $('#ed-error').textContent = error ? customErrorText(error) : '';
    $<HTMLButtonElement>('#ed-play').disabled = !!error;
    $<HTMLButtonElement>('#ed-link').disabled = !!error;
    $<HTMLButtonElement>('#ed-link').textContent = tr({ fr: 'Copier le lien', en: 'Copy the link' });
  }

  /** the cabinet as an elevation: a strip per unit, numbered from the top, its moves shown on hover */
  private renderRack(): void {
    const units = this.spec.units, list = $('#ed-units');
    list.innerHTML = '';
    units.forEach((item, k) => {
      const row = document.createElement('div');
      row.className = `ed-unit is-${item}`;
      row.innerHTML = `<span class="u">${k + 1}</span><div class="face"><span class="name">${itemName(item)}</span></div>
        <div class="acts">
          <button data-move="-1" title="${tr({ fr: 'Monter', en: 'Up' })}" ${k === 0 ? 'disabled' : ''}>↑</button>
          <button data-move="1" title="${tr({ fr: 'Descendre', en: 'Down' })}" ${k === units.length - 1 ? 'disabled' : ''}>↓</button>
          <button data-remove title="${tr({ fr: 'Retirer', en: 'Remove' })}">✕</button>
        </div>`;
      row.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((b) => {
        b.onclick = () => {
          const next = [...units], to = k + Number(b.dataset.move);
          [next[k], next[to]] = [next[to], next[k]];
          this.change({ units: next });
        };
      });
      row.querySelector<HTMLButtonElement>('[data-remove]')!.onclick = () => this.change({ units: units.filter((_, i) => i !== k) });
      list.appendChild(row);
    });
  }

  /** a tile per piece of equipment, its face as in the cabinet; none once the cabinet is full */
  private renderPalette(): void {
    const box = $('#ed-palette'), full = this.spec.units.length >= MAX_UNITS;
    box.innerHTML = (Object.values(PALETTE) as PaletteItem[]).map((item) =>
      `<button class="ed-tile is-${item}" data-item="${item}" ${full ? 'disabled' : ''}><i class="face"></i><span>${itemName(item)}</span></button>`).join('');
    box.querySelectorAll<HTMLButtonElement>('[data-item]').forEach((b) => {
      b.onclick = () => this.change({ units: [...this.spec.units, b.dataset.item as PaletteItem] });
    });
  }

  /** a row of choices, the one picked lit */
  private renderChoices(selector: string, choices: { label: string; on: boolean; pick: () => void }[]): void {
    const box = $(selector);
    box.innerHTML = '';
    for (const c of choices) {
      const button = document.createElement('button');
      button.textContent = c.label;
      button.classList.toggle('cur', c.on);
      button.setAttribute('aria-pressed', String(c.on));
      button.onclick = c.pick;
      box.appendChild(button);
    }
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
    case 'pdu': return tr({ fr: 'Bandeau électrique', en: 'Power strip' });
    default: return assertNever(item);
  }
}

function difficultyName(d: Difficulty): string {
  switch (d) {
    case 'easy': return tr({ fr: 'Léger', en: 'Light' });
    case 'normal': return tr({ fr: 'Normal', en: 'Normal' });
    case 'hard': return tr({ fr: 'Spaghettis', en: 'Spaghetti' });
    default: return assertNever(d);
  }
}
