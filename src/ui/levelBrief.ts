// The brief of a level, before it starts (and on the Help button): what to
// do, the tips, the rules met here for the first time (those met before are
// folded), the material given. On a first reading of a level with supports to
// place, the preparation follows: the cabinet stands still and the clock
// waits while the player places them.

import type { Controller, Tool } from '../play/controller';
import { ALL_SUPPLIES, ITEM_KINDS } from '../game/supplies';
import type { LevelDef } from '../game/levels/levelDef';
import { levelRules, type Rule } from '../game/levels/levelRules';
import { formatLength, formatTime } from './format';
import { hide, show } from './dom';
import { $ } from '../lib/page';
import { countOf } from './names';
import { tr } from './language';
import { levelBrief, levelTips, levelTitle } from './levelTexts';
import { ruleTip } from './ruleTexts';
import { load } from './storage';
import { isTimeChallengeKnown, knownRules } from './progress';

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
    const rules = splitRules(level);
    const services = ctl?.world.circuits.map((c) => c.service) ?? [];
    $('#brief-tips').innerHTML = briefTips(level, rules, services).map((t) => `<li>${t}</li>`).join('');
    // the rules met before: folded, to read again on demand
    $('#brief-known').style.display = rules.known.length ? '' : 'none';
    $('#brief-known-tips').innerHTML = rules.known.map((r) => `<li>${ruleTip(r, level, services)}</li>`).join('');
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

/** the brief's tips: the level's own, its challenge, then the rules met for the first time (flagged new) */
function briefTips(level: LevelDef, rules: { fresh: Rule[] }, services: number[]): string[] {
  const tips = levelTips(level);
  const challenge = challengeTip(level);
  if (challenge) tips.push(challenge);
  const isNew = tr({ fr: 'Nouveau', en: 'New' });
  return [...tips, ...rules.fresh.map((r) => `<span class="new">${isNew}</span> ${ruleTip(r, level, services)}`)];
}

/**
 * The level's challenge: the gestures of a puzzle; the time of a campaign
 * level, once the result screen has told it (it is found there, not read
 * before the first try).
 */
function challengeTip(level: LevelDef): string | null {
  if (level.kind === 'puzzle') return tr({
    fr: `<b>Défi gestes</b> : ★★★ en ${level.moves} geste${level.moves > 1 ? 's' : ''} au plus. Compte pour un geste : brancher ou débrancher un connecteur (à la main ou au bout d'un chemin), poser ou retirer un support ou un velcro, jeter un cordon au bac, en prendre un au Stock. Ranger (déplacer un câble, poser un chemin, peigner) est gratuit.`,
    en: `<b>Gestures challenge</b>: ★★★ in ${level.moves} gesture${level.moves > 1 ? 's' : ''} at most. A gesture is: plugging or unplugging a connector (by hand or at the end of a route), placing or taking off a support or a velcro, throwing a cord into the crate, taking one from the Stock. Tidying (moving a cord, laying a route, combing) is free.`,
  });
  if (level.kind === 'campaign' && isTimeChallengeKnown(load('progress'), level)) return tr({ fr: `<b>Défi chrono</b> : ★★★ en moins de ${formatTime(level.par)}.`, en: `<b>Time challenge</b>: ★★★ in less than ${formatTime(level.par)}.` });
  return null;
}

/** the level's rules, split: those the player meets here for the first time, and those met before */
function splitRules(level: LevelDef): { fresh: Rule[]; known: Rule[] } {
  const known = knownRules(load('rules'), load('progress'));
  const rules = levelRules(level);
  return { fresh: rules.filter((r) => !known.has(r)), known: rules.filter((r) => known.has(r)) };
}

/** the material the level gives: supports, velcros, new cords */
function materialLine(level: LevelDef): string {
  const parts = ALL_SUPPLIES.filter((s) => level.inventory[s]).map((s) => countOf(s, level.inventory[s]!));
  const cords = (level.cords ?? []).map(([length, count]) => `${count} × ${formatLength(length)}`);
  if (cords.length) parts.push(tr({ fr: `cordons neufs : ${cords.join(', ')}`, en: `new cords: ${cords.join(', ')}` }));
  return parts.length ? tr({ fr: `Matériel : ${parts.join(', ')}.`, en: `Supplies: ${parts.join(', ')}.` }) : '';
}
