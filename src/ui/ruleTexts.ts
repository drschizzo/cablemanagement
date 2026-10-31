// What each rule of a level says in its brief (game/levels/levelRules.ts):
// one tip each, with the level's own figures (its budget, its bypasses).

import type { LevelDef } from '../game/levels/levelDef';
import type { Rule } from '../game/levels/levelRules';
import { SERVICES } from '../game/services';
import { CALL_PENALTY, CALL_WAIT } from '../game/incidents';
import { assertNever } from '../lib/assertNever';
import { formatCost } from './format';
import { serviceName, serviceWhat } from './names';
import { toolKey } from './toolbar';
import { tr } from './language';

/** the tip of `rule` in the brief of `level`; `services`: those its schedule carries (their weights are shown) */
export function ruleTip(rule: Rule, level: LevelDef, services: number[]): string {
  switch (rule) {
    case 'leds': return tr({ fr: 'Voyants des ports : vert, liaison conforme au plan ; orange, mauvais port ; rouge, liaison coupée.', en: 'Port LEDs: green, link as planned; orange, wrong port; red, link down.' });
    case 'taut': return tr({
      fr: '<b>Câble tendu</b> : un câble nettement plus court que son chemin dans les supports n\'est pas rangé.',
      en: '<b>Taut cord</b>: a cord clearly shorter than its route through the supports is not tidy.',
    });
    case 'kinked': return tr({
      fr: '<b>Fibre pliée</b> : une fibre pliée à angle vif n\'est pas rangée.',
      en: '<b>Kinked fibre</b>: a fibre bent at a sharp angle is not tidy.',
    });
    case 'separation': return tr({
      fr: '<b>Familles séparées</b> : pour ★★★, la fibre, le cuivre et le courant ne partagent pas de goulotte. Les guide-câbles peuvent être partagés.',
      en: '<b>Separate families</b>: for ★★★, fibre, copper and power never share a duct. Cable managers may be shared.',
    });
    case 'maintenance': return tr({
      fr: `<b>En production</b> : les liaisons ⚡ portent du trafic. Chaque seconde où l'une est coupée coûte le poids de son service sur un budget de <b>${level.downtime} pts</b> : ${serviceChips(services)}. Pour ★★★, restez dans le budget.`,
      en: `<b>In production</b>: the ⚡ links carry traffic. Every second one of them is cut costs its service's weight against a budget of <b>${level.downtime} pts</b>: ${serviceChips(services)}. For ★★★, stay within the budget.`,
    });
    case 'bypass': {
      const n = level.bypass ?? 0;
      return tr({
        fr: `<b>Dérivation</b> (${n} ${n > 1 ? 'disponibles' : 'disponible'}) : un clic sur le ⚡ d'une ligne du plan maintient son trafic pendant que vous la recâblez.`,
        en: `<b>Bypass</b> (${n} available): a click on the ⚡ of a schedule line keeps its traffic up while you recable it.`,
      });
    }
    case 'blind': return tr({
      fr: '<b>Câbles sans marque</b> : leur destination ne s\'affiche pas au survol. T sur un câble la révèle, et un câble branché comme prévu est reconnu.',
      en: '<b>Unmarked cords</b>: hovering does not show where they go. T over a cord reveals it, and a cord plugged as planned is recognised.',
    });
    case 'faults': {
      const n = level.faults ?? 0;
      return tr({
        fr: `<b>${n > 1 ? 'Pannes' : 'Panne'}</b> : ${n > 1 ? `${n} vieux câbles sont coupés` : 'un vieux câble est coupé'} à l'intérieur. Branché comme prévu, ses voyants clignotent en rouge. Le Testeur (${toolKey('tester')}) le confirme ; remplacez-le par un câble neuf du Stock.`,
        en: `<b>${n > 1 ? 'Faults' : 'Fault'}</b>: ${n > 1 ? `${n} old cords are` : 'an old cord is'} broken inside. Plugged as planned, its LEDs blink red. The Tester (${toolKey('tester')}) confirms it; replace it with a new cord from the Stock.`,
      });
    }
    case 'power': return tr({
      fr: '<b>Courant</b> : les câbles noirs relient le bandeau électrique aux alimentations des serveurs. Couper une alimentation coupe le service du serveur.',
      en: '<b>Power</b>: the black cords join the power strip to the servers\' supplies. Cutting a supply cuts the server\'s service.',
    });
    case 'incidents': return tr({
      fr: `<b>Incidents</b> : un collègue peut débrancher une liaison, puis un utilisateur appeler. Rétablissez la liaison en moins de ${CALL_WAIT} s, sinon l'appel coûte ${CALL_PENALTY} pts sur le budget.`,
      en: `<b>Incidents</b>: a colleague may unplug a link, then a user calls. Restore the link within ${CALL_WAIT} s, or the call costs ${CALL_PENALTY} pts of the budget.`,
    });
    case 'duct': return tr({
      fr: `<b>Goulotte</b> : outil Supports (${toolKey('supports')}), un clic dans un couloir latéral. Au Chemin, tracez par le guide-câbles puis le long de la goulotte : la longueur en trop y est rangée en boucle.`,
      en: `<b>Duct</b>: Supports tool (${toolKey('supports')}), a click in a side channel. With the Route, draw through the cable manager then along the duct: the extra length is stowed in it as a loop.`,
    });
    default: return assertNever(rule);
  }
}

/** the services carried, the costliest first, each with its weight */
function serviceChips(services: number[]): string {
  return [...new Set(services)].sort((a, b) => SERVICES[b].weight - SERVICES[a].weight)
    .map((i) => `<span class="svc-chip" style="--c:${SERVICES[i].color}" title="${serviceWhat(i)}">${serviceName(i)} ×${formatCost(SERVICES[i].weight).replace(/ pts?/, '')}</span>`).join(' ');
}
