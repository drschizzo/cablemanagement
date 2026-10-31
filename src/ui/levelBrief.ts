// The brief of a level, before it starts (and on the Help button): what to
// do, the tips, the rules met here for the first time (those met before are
// not told again: the side panel says what counts), the material
// given. On a first reading of a level with supports to
// place, the preparation follows: the cabinet stands still and the clock
// waits while the player places them.

import type { Controller, Tool } from '../play/controller';
import { ALL_SUPPLIES, ITEM_KINDS } from '../game/supplies';
import type { LevelDef } from '../game/levels/levelDef';
import { levelRules } from '../game/levels/levelRules';
import { formatLength } from './format';
import { hide, show } from './dom';
import { $ } from '../lib/page';
import { countOf } from './names';
import { tr } from '../lib/language';
import { levelBrief, levelPlace, levelTips, levelTitle } from './levelTexts';
import { ruleTip } from './ruleTexts';
import { load } from '../progression/storage';

export class LevelBrief {
  /** the preparation was offered for this level already */
  private prepared = false;

  constructor(private selectTool: (tool: Tool) => void) {}

  /** a new level: its preparation is still to come */
  reset(): void {
    this.prepared = false;
    $('#prep').classList.remove('on');
  }

  show(level: LevelDef, ctl: Controller | null): void {
    $('#brief-place').textContent = levelPlace(level);
    $('#brief-title').textContent = levelTitle(level);
    $('#brief-text').textContent = levelBrief(level);
    const services = ctl?.world.circuits.map((c) => c.service) ?? [];
    $('#brief-tips').innerHTML = briefTips(level, services).map((t) => `<li>${t}</li>`).join('');
    $('#brief-inv').innerHTML = material(level).map((m) => `<span>${m}</span>`).join('');
    // the clock waits for the player to read
    ctl?.pause();
    $('#brief-go').onclick = () => {
      hide('#brief');
      if (!ctl) return;
      const hasSupports = ITEM_KINDS.some((k) => (level.inventory[k] ?? 0) > 0);
      if (!this.prepared && level.kind !== 'tutorial' && hasSupports) this.prepare(ctl);
      else ctl.resume();
      this.prepared = true;
    };
    show('#brief');
  }

  /** the cabinet stands still and the clock waits while the supports are placed */
  private prepare(ctl: Controller): void {
    ctl.beginPreparation();
    this.selectTool('supports');
    $('#prep').classList.add('on');
    $('#prep-go').onclick = () => {
      ctl.startWork();
      $('#prep').classList.remove('on');
      this.selectTool('hand');
    };
  }
}

/** the brief's tips: the level's own, then the rules met for the first time */
function briefTips(level: LevelDef, services: number[]): string[] {
  const known = new Set(load('rules'));
  const fresh = levelRules(level).filter((r) => !known.has(r));
  return [...levelTips(level), ...fresh.map((r) => ruleTip(r, level, services))];
}

/** the material the level gives, an item each: supports, velcros, new cords */
function material(level: LevelDef): string[] {
  const parts = ALL_SUPPLIES.filter((s) => level.inventory[s]).map((s) => countOf(s, level.inventory[s]!));
  const cords = (level.cords ?? []).map(([length, count]) => count > 1
    ? tr({ fr: `${count} câbles neufs de ${formatLength(length)}`, en: `${count} new cords of ${formatLength(length)}` })
    : tr({ fr: `1 câble neuf de ${formatLength(length)}`, en: `1 new cord of ${formatLength(length)}` }));
  return [...parts, ...cords];
}
