// Free play, from the game modes: the three ready-made big cabinets, or a
// cabinet the player sets up: how many cords, how many services, how much
// mess, whether it is in production, and its equipment, drawn as an
// elevation and stacked from a palette. Play starts it with a new mess each
// time; its link shares it as it is. The last cabinet set up is kept for
// next time.

import {
  DIFFICULTIES, FAULT_FROM, INCIDENTS_FROM, MAX_CORDS, MAX_UNITS, PALETTE, checkSpec, decodeSpec, encodeSpec, fitUnits, freeLevel, mostCords, plainSpec,
  type FreeSpec, type Difficulty, type PaletteItem,
} from '../game/levels/freeLevel';
import { BIG_BAYS } from '../game/levels/bigBays';
import type { LevelDef } from '../game/levels/levelDef';
import { assertNever } from '../lib/assertNever';
import { $ } from '../lib/page';
import { hide, show } from './dom';
import { recordBadge } from './recordBadge';
import { load, save, type Progress } from '../progression/storage';
import { freeLink } from './share';
import { tr } from '../lib/language';
import { SERVICES } from '../game/services';
import { serviceName } from './names';
import { freeErrorText } from './messages';
import { levelBrief, levelTitle } from './levelTexts';

/** the cabinet the screen opens on, the first time */
const FIRST_SPEC = plainSpec(12, 1, false);

const newSeed = () => Math.floor(Math.random() * 36 ** 5);

export class FreePanel {
  private spec: FreeSpec = FIRST_SPEC;
  private back = () => {};
  private start: (level: LevelDef) => void = () => {};

  constructor() {
    $('#free-back').onclick = () => { hide('#free'); this.back(); };
    const cables = $<HTMLInputElement>('#free-cables');
    cables.max = String(MAX_CORDS);
    cables.oninput = () => {
      const n = Number(cables.value);
      this.change({ cables: n, units: fitUnits(this.spec.units, n) });
    };
    $<HTMLInputElement>('#free-production').onchange = (e) => this.change({ production: (e.target as HTMLInputElement).checked });
    $('#free-play').onclick = () => {
      if (checkSpec(this.spec)) return;
      this.spec = { ...this.spec, seed: newSeed() };
      save('freeDraft', encodeSpec(this.spec));
      this.play(freeLevel(this.spec));
    };
    $('#free-link').onclick = () => this.copyLink();
    $('#free-import').onclick = () => {
      const read = decodeSpec($<HTMLInputElement>('#free-code').value.replace(/^.*[?&]rack=/, ''));
      if ('kind' in read) $('#free-error').textContent = freeErrorText(read);
      else this.change(read);
    };
  }

  /** `start`: what Play does with the cabinet; `back`: where the Back button returns */
  show(progress: Progress, start: (level: LevelDef) => void, back: () => void): void {
    this.start = start;
    this.back = back;
    const kept = decodeSpec(load('freeDraft'));
    if (!('kind' in kept)) this.spec = kept;
    this.renderReady(progress);
    this.render();
    show('#free');
  }

  private play(level: LevelDef): void {
    hide('#free');
    this.start(level);
  }

  /** the spec changed: kept, shown */
  private change(part: Partial<FreeSpec>): void {
    this.spec = { ...this.spec, ...part };
    this.spec.cables = Math.max(1, Math.min(this.spec.cables, mostCords(this.spec.units) || 1));
    if (!checkSpec(this.spec)) save('freeDraft', encodeSpec(this.spec));
    this.render();
  }

  /** the big cabinets, ready to play: their title, what they ask, their record */
  private renderReady(progress: Progress): void {
    const box = $('#free-ready');
    box.innerHTML = '';
    for (const level of BIG_BAYS) {
      const card = document.createElement('button');
      card.className = 'level-card';
      card.innerHTML = `<div class="t">${levelTitle(level)}</div>
        <div class="meta">${tr({ fr: `${level.cables} câbles`, en: `${level.cables} cords` })} · ${levelBrief(level).split('. ')[0]}.</div>
        ${recordBadge(progress.levels[level.id])}`;
      card.onclick = () => this.play(level);
      box.appendChild(card);
    }
  }

  private render(): void {
    const spec = this.spec;
    $('#free-count').textContent = `${spec.units.length}U`;
    this.renderRack();
    this.renderPalette();
    const cables = $<HTMLInputElement>('#free-cables');
    cables.value = String(spec.cables);
    $('#free-cables-val').textContent = String(spec.cables);
    this.renderChoices('#free-services', SERVICES.map((_, k) => k + 1).map((n) => ({ label: String(n), on: n === spec.services, pick: () => this.change({ services: n }) })));
    $('#free-services-dots').innerHTML = SERVICES.slice(0, spec.services).map((sv, i) => `<i style="background:${sv.color}" title="${serviceName(i)}"></i>`).join('');
    this.renderChoices('#free-difficulty', DIFFICULTIES.map((d) => ({ label: difficultyName(d), on: d === spec.difficulty, pick: () => this.change({ difficulty: d }) })));
    $<HTMLInputElement>('#free-production').checked = spec.production;
    $('#free-production-what').textContent = spec.production
      ? tr({ fr: `Les liaisons qui fonctionnent au départ portent du trafic : un budget d'interruption, des incidents à partir de ${INCIDENTS_FROM} câbles, une panne à partir de ${FAULT_FROM}.`, en: `The links working at the start carry traffic: a downtime budget, incidents from ${INCIDENTS_FROM} cords, a fault from ${FAULT_FROM}.` })
      : tr({ fr: 'Rien en production : pas de budget ni d\'incident, du matériel en abondance et une musique d\'ambiance.', en: 'Nothing in production: no budget nor incident, plenty of material and ambient music.' });
    const error = checkSpec(spec);
    $('#free-error').textContent = error ? freeErrorText(error) : '';
    $<HTMLButtonElement>('#free-play').disabled = !!error;
    $<HTMLButtonElement>('#free-link').disabled = !!error;
    $<HTMLButtonElement>('#free-link').textContent = tr({ fr: 'Copier le lien', en: 'Copy the link' });
  }

  /** the cabinet as an elevation: a strip per unit, numbered from the top, its moves shown on hover */
  private renderRack(): void {
    const units = this.spec.units, list = $('#free-units');
    list.innerHTML = '';
    units.forEach((item, k) => {
      const row = document.createElement('div');
      row.className = `free-unit is-${item}`;
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
    const box = $('#free-palette'), full = this.spec.units.length >= MAX_UNITS;
    box.innerHTML = (Object.values(PALETTE) as PaletteItem[]).map((item) =>
      `<button class="free-tile is-${item}" data-item="${item}" ${full ? 'disabled' : ''}><i class="face"></i><span>${itemName(item)}</span></button>`).join('');
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
    const link = freeLink(this.spec), button = $('#free-link');
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
    case 'hard': return tr({ fr: 'Fort', en: 'Heavy' });
    default: return assertNever(d);
  }
}
