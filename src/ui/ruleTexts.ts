// What each rule of a level, and each gesture it calls for, says in its
// brief (game/levels/levelRules.ts, levelGestures.ts): one tip each, with the
// level's own figures (its budget, its bundles).

import type { LevelDef } from '../game/levels/levelDef';
import type { Rule } from '../game/levels/levelRules';
import type { Gesture } from '../game/levels/levelGestures';
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
    case 'leds': return tr({ fr: 'Les voyants des ports : vert = liaison conforme au plan, orange = mauvais port, rouge = liaison coupée.', en: 'The port LEDs: green = link as planned, orange = wrong port, red = link down.' });
    case 'taut': return tr({
      fr: '<b>Ni tendu</b> : un cordon bien plus court que son chemin rangé n\'est pas propre.',
      en: '<b>Not taut</b>: a cord much shorter than its tidy route is not tidy.',
    });
    case 'kinked': return tr({
      fr: '<b>Ni plié</b> : une fibre pliée en angle vif n\'est pas propre. Laissez-lui des courbes douces.',
      en: '<b>Not kinked</b>: a fibre bent at a sharp angle is not tidy. Give it gentle curves.',
    });
    case 'separation': return tr({
      fr: '<b>Chaque famille son couloir</b> : pour ★★★, aucune goulotte ni anneau ne mêle la fibre, le cuivre et le courant. Descendez-les par des côtés différents ; les guide-câbles, eux, se partagent.',
      en: '<b>Each family its own channel</b>: for ★★★, no duct nor ring mixes fibre, copper and power. Take them down different sides; the cable managers can be shared.',
    });
    case 'maintenance': return tr({
      fr: `<b>Fenêtre de maintenance</b> : les liaisons ⚡ sont en production. Chaque seconde où l'une est coupée coûte le poids de son service sur un budget de <b>${level.downtime} pts</b> : ${serviceChips(services)}. Budget dépassé : incident, plus de ★★★.`,
      en: `<b>Maintenance window</b>: the ⚡ links are in production. Every second one of them is cut costs its service's weight off a budget of <b>${level.downtime} pts</b>: ${serviceChips(services)}. Budget overrun: an incident, no more ★★★.`,
    });
    case 'bypass': {
      const n = level.bypass ?? 0;
      return tr({
        fr: `<b>Dérivation</b> : vous en avez ${n}. Posée sur une liaison (cliquez son ⚡ dans le plan), elle porte son trafic pendant qu'on la recâble.`,
        en: `<b>Bypass</b>: you have ${n}. Put on a link (click its ⚡ on the schedule), it carries its traffic while it is recabled.`,
      });
    }
    case 'bundles': {
      const n = level.bundles ?? 0;
      return tr({
        fr: `<b>Faisceaux</b> : pour ★★★, au moins ${n} velcro${n > 1 ? 's' : ''} qui serre${n > 1 ? 'nt' : ''} chacun 3 câbles ou plus d'un même service, dans un guide-câbles ou une goulotte.`,
        en: `<b>Bundles</b>: for ★★★, at least ${n} velcro${n > 1 ? 's' : ''} strapping 3 cords or more of one service each, in a cable manager or a duct.`,
      });
    }
    case 'blind': return tr({
      fr: '<b>Cordons sans marque</b> : survolés, ils ne disent pas où ils vont. Le Traceur (T sur un câble) le révèle, et un cordon branché comme prévu se reconnaît tout seul.',
      en: '<b>Unmarked cords</b>: hovered, they do not say where they go. The Tracer (T over a cord) reveals it, and a cord plugged as planned is recognised by itself.',
    });
    case 'faults': {
      const n = level.faults ?? 0;
      return tr({
        fr: `<b>Pannes</b> : ${n > 1 ? `${n} vieux cordons sont coupés` : 'un vieux cordon est coupé'} à l'intérieur. Branché comme prévu, il ne porte rien et ses voyants clignotent en rouge. Le <b>Testeur</b> (${toolKey('tester')}) le trouve d'un clic ; remplacez-le par un cordon neuf du Stock.`,
        en: `<b>Faults</b>: ${n > 1 ? `${n} old cords are` : 'an old cord is'} broken inside. Plugged as planned, it carries nothing and its LEDs blink red. The <b>Tester</b> (${toolKey('tester')}) finds it in a click; swap it for a new cord from the Stock.`,
      });
    }
    case 'power': return tr({
      fr: '<b>Courant</b> : les cordons noirs vont du bandeau électrique aux alimentations des serveurs (couper l\'une, c\'est couper le service du serveur).',
      en: '<b>Power</b>: the black cords run from the power strip to the servers\' supplies (cutting one cuts the server\'s service).',
    });
    case 'incidents': return tr({
      fr: `<b>Incidents</b> : pendant le chantier, un collègue peut débrancher une liaison par erreur, et un utilisateur appeler pour une liaison coupée. Rétablie en moins de ${CALL_WAIT} s, tout va bien ; trop tard, l'appel coûte ${CALL_PENALTY} pts sur le budget.`,
      en: `<b>Incidents</b>: while you work, a colleague may unplug a link by mistake, and a user may call about a link that is down. Back within ${CALL_WAIT} s, all is well; too late, the call costs ${CALL_PENALTY} pts off the budget.`,
    });
    default: return assertNever(rule);
  }
}

/** the tip of a gesture the level calls for */
export function gestureTip(gesture: Gesture): string {
  switch (gesture) {
    case 'duct': return tr({
      fr: `<b>Goulotte</b> : outil Supports (${toolKey('supports')}), un clic dans un couloir latéral la pose. Elle descend les câbles le long des montants et cache le mou. Au Chemin, tracez par le guide-câbles puis le long de la goulotte : le câble y entre par la fente de sa face avant, et sa longueur en trop y pend en boucle.`,
      en: `<b>Duct</b>: Supports tool (${toolKey('supports')}), a click in a side channel places it. It takes the cords down along the posts and hides the slack. With the Route, draw through the cable manager then along the duct: the cord goes in through the slit of its front face, and its extra length hangs in a loop inside.`,
    });
    case 'ring': return tr({
      fr: '<b>Anneau</b> : plus léger qu\'une goulotte, il guide un câble vertical dans un couloir latéral (outil Supports, <b>Maj</b> + clic dans un couloir). Pratique pour quelques câbles ; au-delà, la goulotte tient mieux le mou.',
      en: '<b>Ring</b>: lighter than a duct, it guides a vertical cord in a side channel (Supports tool, <b>Shift</b> + click in a channel). Handy for a few cords; beyond that, the duct holds the slack better.',
    });
    case 'velcro': return tr({
      fr: `<b>Velcro</b> (${toolKey('velcro')}) : tracez un trait en travers des câbles côte à côte, le velcro les serre là où le trait les croise. Un clic sur un velcro l'enlève. Un faisceau ne compte que s'il est d'un seul service.`,
      en: `<b>Velcro</b> (${toolKey('velcro')}): draw a line across cords running side by side, the velcro straps them where the line crosses them. A click on a velcro takes it off. A bundle only counts when it is of one service.`,
    });
    default: return assertNever(gesture);
  }
}

/** the services carried, the costliest first, each with its weight */
function serviceChips(services: number[]): string {
  return [...new Set(services)].sort((a, b) => SERVICES[b].weight - SERVICES[a].weight)
    .map((i) => `<span class="svc-chip" style="--c:${SERVICES[i].color}" title="${serviceWhat(i)}">${serviceName(i)} ×${formatCost(SERVICES[i].weight).replace(/ pts?/, '')}</span>`).join(' ');
}
