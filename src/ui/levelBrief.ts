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
import { tr } from './language';
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
  if (level.kind === 'puzzle') tips.push(tr({
    fr: `<b>Défi gestes</b> : ★★★ en ${level.moves} geste${level.moves > 1 ? 's' : ''} au plus. Compte pour un geste : un cordon déplacé ou branché, un chemin posé, un support ou un velcro posé ou retiré, un cordon jeté au bac ou pris au Stock.`,
    en: `<b>Gestures challenge</b>: ★★★ in ${level.moves} gesture${level.moves > 1 ? 's' : ''} at most. A gesture is: a cord moved or plugged, a route laid, a support or a velcro placed or taken off, a cord thrown into the crate or taken from the Stock.`,
  }));
  if (level.kind === 'campaign') tips.push(tr({ fr: `<b>Défi chrono</b> : ★★★ en moins de ${formatTime(level.par)}.`, en: `<b>Time challenge</b>: ★★★ in less than ${formatTime(level.par)}.` }));
  tips.push(tr({
    fr: '<b>Ni tendu ni plié</b> : un cordon bien plus court que son chemin rangé, ou une fibre pliée en angle vif, ne vaut pas ★★★.',
    en: '<b>Neither taut nor kinked</b>: a cord much shorter than its tidy route, or a fibre bent at a sharp angle, is not worth ★★★.',
  }));
  if (level.downtime !== undefined) {
    const used = [...new Set(ctl?.world.circuits.map((c) => c.service) ?? [])].sort((a, b) => SERVICES[b].weight - SERVICES[a].weight);
    const chips = used.map((i) => `<span class="svc-chip" style="--c:${SERVICES[i].color}" title="${serviceWhat(i)}">${serviceName(i)} ×${formatCost(SERVICES[i].weight).replace(/ pts?/, '')}</span>`).join(' ');
    const n = level.bypass ?? 0;
    tips.unshift(tr({
      fr: `<b>Fenêtre de maintenance</b> : les liaisons ⚡ sont en production. Chaque seconde où l'une est coupée coûte le poids de son service sur un budget de <b>${level.downtime} pts</b> : ${chips}. Budget dépassé : incident, plus de ★★★.`
        + (n ? ` Vous avez <b>${n} dérivation${n > 1 ? 's' : ''}</b> : posée sur une liaison (cliquez son ⚡ dans le plan), elle porte son trafic pendant qu'on la recâble.` : ''),
      en: `<b>Maintenance window</b>: the ⚡ links are in production. Every second one of them is cut costs its service's weight off a budget of <b>${level.downtime} pts</b>: ${chips}. Budget overrun: an incident, no more ★★★.`
        + (n ? ` You have <b>${n} bypass${n > 1 ? 'es' : ''}</b>: put on a link (click its ⚡ on the schedule), it carries its traffic while it is recabled.` : ''),
    }));
  }
  if (ctl?.world.circuits.some((c) => c.type === 'PWR')) tips.push(tr({
    fr: '<b>Courant</b> : les cordons noirs vont du bandeau électrique aux alimentations des serveurs (couper l\'une, c\'est couper le service du serveur). On ne les range pas avec les données : chaque famille ses supports.',
    en: '<b>Power</b>: the black cords run from the power strip to the servers\' supplies (cutting one cuts the server\'s service). They are not run with the data: each family its own supports.',
  }));
  if (level.faults) tips.push(tr({
    fr: `<b>Pannes</b> : ${level.faults > 1 ? `${level.faults} vieux cordons sont coupés` : 'un vieux cordon est coupé'} à l'intérieur. Branché comme prévu, il ne porte rien et ses voyants clignotent en rouge. Le <b>Testeur</b> (4) le trouve d'un clic ; remplacez-le par un cordon neuf du Stock.`,
    en: `<b>Faults</b>: ${level.faults > 1 ? `${level.faults} old cords are` : 'an old cord is'} broken inside. Plugged as planned, it carries nothing and its LEDs blink red. The <b>Tester</b> (4) finds it in a click; swap it for a new cord from the Stock.`,
  }));
  tips.push(tr({ fr: 'Les voyants des ports : vert = liaison conforme au plan, orange = mauvais port, rouge = liaison coupée.', en: 'The port LEDs: green = link as planned, orange = wrong port, red = link down.' }));
  return tips;
}

/** the material the level gives: supports, velcros, new cords */
function materialLine(level: LevelDef): string {
  const parts = ALL_SUPPLIES.filter((s) => level.inventory[s]).map((s) => countOf(s, level.inventory[s]!));
  const cords = (level.cords ?? []).map(([length, count]) => `${count} × ${formatLength(length)}`);
  if (cords.length) parts.push(tr({ fr: `cordons neufs : ${cords.join(', ')}`, en: `new cords: ${cords.join(', ')}` }));
  return parts.length ? tr({ fr: `Matériel : ${parts.join(', ')}.`, en: `Material: ${parts.join(', ')}.` }) : '';
}
