// The brief of a level, before it starts (and on the Help button): what to
// do, the tips, the material given. On a first reading of a level with
// supports to place, the preparation follows: the cabinet stands still and the
// clock waits while the player places them.

import type { Controller, Tool } from '../play/controller';
import { SERVICES } from '../game/services';
import { ALL_SUPPLIES, ITEM_KINDS } from '../game/supplies';
import type { LevelDef } from '../game/levels/levelDef';
import { formatCost, formatLength, formatTime } from './format';
import { hide, show } from './dom';
import { $ } from '../lib/page';
import { countOf, serviceName, serviceWhat } from './names';
import { levelBrief, levelTips, levelTitle } from './levelTexts';

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
    $('#brief-tips').innerHTML = briefTips(level, ctl).map((t) => `<li>${t}</li>`).join('');
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

/** the level's own tips, then those of its rules (time challenge, tension, maintenance window, LEDs) */
function briefTips(level: LevelDef, ctl: Controller | null): string[] {
  const tips = levelTips(level);
  if (level.kind === 'campaign') tips.push(`<b>Défi chrono</b> : ★★★ en moins de ${formatTime(level.par)}.`);
  tips.push('<b>Ni tendu ni plié</b> : un cordon bien plus court que son chemin rangé, ou une fibre pliée en angle vif, ne vaut pas ★★★.');
  if (level.downtime !== undefined) {
    const used = [...new Set(ctl?.world.circuits.map((c) => c.service) ?? [])].sort((a, b) => SERVICES[b].weight - SERVICES[a].weight);
    const chips = used.map((i) => `<span class="svc-chip" style="--c:${SERVICES[i].color}" title="${serviceWhat(i)}">${serviceName(i)} ×${formatCost(SERVICES[i].weight).replace(/ pts?/, '')}</span>`).join(' ');
    tips.unshift(`<b>Fenêtre de maintenance</b> : les liaisons ⚡ sont en production. Chaque seconde où l'une est coupée coûte le poids de son service sur un budget de <b>${level.downtime} pts</b> : ${chips}. Budget dépassé : incident, plus de ★★★.`
      + (level.bypass ? ` Vous avez <b>${level.bypass} dérivation${level.bypass > 1 ? 's' : ''}</b> : posée sur une liaison (cliquez son ⚡ dans le plan), elle porte son trafic pendant qu'on la recâble.` : ''));
  }
  tips.push('Les voyants des ports : vert = liaison conforme au plan, orange = mauvais port.');
  return tips;
}

/** the material the level gives: supports, velcros, new cords */
function materialLine(level: LevelDef): string {
  const parts = ALL_SUPPLIES.filter((s) => level.inventory[s]).map((s) => countOf(s, level.inventory[s]!));
  const cords = (level.cords ?? []).map(([length, count]) => `${count} × ${formatLength(length)}`);
  if (cords.length) parts.push(`cordons neufs : ${cords.join(', ')}`);
  return parts.length ? `Matériel : ${parts.join(', ')}.` : '';
}
