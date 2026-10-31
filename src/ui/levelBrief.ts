// The brief of a level, before it starts (and on the Help button): what to
// do, the tips, the rules and gestures met here for the first time (those
// met before are not told again: the stars of the side panel say what
// counts), the material given. On a first reading of a level with supports to
// place, the preparation follows: the cabinet stands still and the clock
// waits while the player places them.

import type { Controller, Tool } from '../play/controller';
import { ALL_SUPPLIES, ITEM_KINDS } from '../game/supplies';
import type { LevelDef } from '../game/levels/levelDef';
import { levelRules, type Rule } from '../game/levels/levelRules';
import { levelGestures, type Gesture } from '../game/levels/levelGestures';
import { formatLength } from './format';
import { hide, show } from './dom';
import { $ } from '../lib/page';
import { countOf } from './names';
import { tr } from './language';
import { levelBrief, levelTips, levelTitle } from './levelTexts';
import { gestureTip, ruleTip } from './ruleTexts';
import { load } from './storage';
import { knownGestures, knownRules } from './progress';

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
    $('#brief-title').textContent = levelTitle(level);
    $('#brief-text').textContent = levelBrief(level);
    const met = splitMet(level);
    const services = ctl?.world.circuits.map((c) => c.service) ?? [];
    $('#brief-tips').innerHTML = briefTips(level, met, services).map((t) => `<li>${t}</li>`).join('');
    $('#brief-inv').textContent = materialLine(level);
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

/** the brief's tips: the level's own, then the rules and gestures met for the first time */
function briefTips(level: LevelDef, met: Met, services: number[]): string[] {
  return [...levelTips(level), ...met.rules.fresh.map((r) => ruleTip(r, level, services)), ...met.gestures.fresh.map(gestureTip)];
}

/** the level's rules and gestures, each split: those the player meets here for the first time, and those met before */
interface Met {
  rules: { fresh: Rule[]; known: Rule[] };
  gestures: { fresh: Gesture[]; known: Gesture[] };
}

function splitMet(level: LevelDef): Met {
  const progress = load('progress');
  const split = <T>(items: T[], known: Set<T>) => ({ fresh: items.filter((i) => !known.has(i)), known: items.filter((i) => known.has(i)) });
  return {
    rules: split(levelRules(level), knownRules(load('rules'), progress)),
    gestures: split(levelGestures(level), knownGestures(load('gestures'), progress)),
  };
}

/** the material the level gives: supports, velcros, new cords */
function materialLine(level: LevelDef): string {
  const parts = ALL_SUPPLIES.filter((s) => level.inventory[s]).map((s) => countOf(s, level.inventory[s]!));
  const cords = (level.cords ?? []).map(([length, count]) => `${count} × ${formatLength(length)}`);
  if (cords.length) parts.push(tr({ fr: `câbles neufs : ${cords.join(', ')}`, en: `new cords: ${cords.join(', ')}` }));
  return parts.length ? tr({ fr: `Matériel : ${parts.join(', ')}.`, en: `Supplies: ${parts.join(', ')}.` }) : '';
}
