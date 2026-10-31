// Every sentence a level says to the player: the toasts, the hints under the
// cabinet, the tooltip of a cord, what each star asks, and why a free cabinet cannot be played. The game sends data (play/notices.ts,
// game/evaluation.ts, game/levels/freeLevel.ts); the words live here.

import type { CordInfo, Hint, HoverNote, PhysicsStats, Toast } from '../play/notices';
import type { RouteError } from '../game/routeLaying';
import { isGoalMet, type StarGoal, type Strain } from '../game/evaluation';
import type { IncidentEvent } from '../game/incidents';
import type { FreeError } from '../game/levels/freeLevel';
import { assertNever } from '../lib/assertNever';
import { formatCost, formatDecimal } from './format';
import { cordTypeName, serviceName, supplyName } from './names';
import { tr } from './language';
import { DELETE_KEY } from './keyHints';

export function strainLabel(strain: Strain): string {
  switch (strain) {
    case 'taut': return tr({ fr: 'tendu', en: 'taut' });
    case 'kinked': return tr({ fr: 'plié', en: 'kinked' });
    default: return assertNever(strain);
  }
}

export function toastText(t: Toast): string {
  switch (t.kind) {
    case 'bypassBack': return tr({ fr: `Liaison ${t.link + 1} rétablie : sa dérivation revient au stock.`, en: `Link ${t.link + 1} restored: its bypass goes back to the stock.` });
    case 'linksCut': {
      const names = t.links.map((l) => `${l.link + 1} (${serviceName(l.service)})`).join(', ');
      return t.costPerSecond > 0
        ? tr({ fr: `Liaison ${names} coupée : ${formatCost(t.costPerSecond)} par seconde sur le budget d'interruption. Rebranchez vite.`, en: `Link ${names} cut: ${formatCost(t.costPerSecond)} per second off the downtime budget. Plug it back quickly.` })
        : tr({ fr: `Liaison ${names} coupée, mais sa dérivation porte le trafic.`, en: `Link ${names} cut, but its bypass carries the traffic.` });
    }
    case 'nothingToUndo': return tr({ fr: 'Rien à annuler.', en: 'Nothing to undo.' });
    case 'undoBlocked': return tr({ fr: 'Impossible d\'annuler au-delà d\'un changement de câble.', en: 'Cannot undo past a change of cord.' });
    case 'undone': return tr({ fr: 'Annulé.', en: 'Undone.' });
    case 'noCordOfThatLength': return tr({ fr: 'Plus aucun câble de cette longueur en stock.', en: 'No cord of that length left in stock.' });
    case 'noBypassLeft': return tr({ fr: 'Plus de dérivation en stock.', en: 'No bypass left in stock.' });
    case 'notInProduction': return tr({ fr: 'Seules les liaisons en production (⚡) se dérivent.', en: 'Only links in production (⚡) can be bypassed.' });
    case 'portsTaken': return tr({ fr: 'Ses deux ports sont occupés.', en: 'Both its ports are taken.' });
    case 'noLooseEnd': return tr({ fr: 'Aucun câble de ce type n\'a de bout libre : débranchez celui qui est sur un mauvais port.', en: 'No cord of that type has a loose end: unplug the one in a wrong port.' });
    case 'itemLocked': return tr({ fr: 'Cet élément est fixé à la baie.', en: 'This item is fixed to the cabinet.' });
    case 'noSupportLeft': return tr({ fr: `Plus de ${supplyName(t.item)} en stock.`, en: `No ${supplyName(t.item)} left in stock.` });
    case 'cannotPlace': return t.item === 'fingerManager'
      ? tr({ fr: 'Un guide-câbles se pose dans une unité vide.', en: 'A cable manager goes in an empty unit.' })
      : tr({ fr: 'Emplacement occupé.', en: 'That slot is taken.' });
    case 'routeRefused': return routeErrorText(t.error);
    case 'routeSlack': return tr({
      fr: `Ce câble a ${Math.round(t.extra * 100)} cm de trop pour ce chemin : le mou est rangé dans les guides, ou pend (un câble plus court se prend au Stock).`,
      en: `This cord is ${Math.round(t.extra * 100)} cm too long for this route: the slack is stowed in the guides, or hangs (a shorter cord comes from the Stock).`,
    });
    case 'connectorHeldBack': return tr({ fr: 'Le connecteur n\'a pas pu atteindre le port : quelque chose le retient.', en: 'The connector could not reach the port: something holds it back.' });
    case 'velcroClick': return tr({ fr: 'Velcro : tracez un trait en travers des câbles à serrer (un clic sur un velcro l\'enlève).', en: 'Velcro: draw a line across the cords to strap (a click on a velcro takes it off).' });
    case 'noVelcroLeft': return tr({ fr: 'Plus de velcro.', en: 'No velcro left.' });
    case 'velcroNeedsTwo': return tr({ fr: 'Le trait doit croiser au moins deux câbles qui passent côte à côte.', en: 'The line must cross at least two cords running side by side.' });
    case 'incident': return incidentText(t.incident);
    case 'cordTested': return t.faulty
      ? tr({ fr: 'Testeur : rien ne passe. Ce câble est coupé à l\'intérieur, remplacez-le.', en: 'Tester: nothing gets through. This cord is broken inside, swap it.' })
      : tr({ fr: 'Testeur : le signal passe, ce câble est bon.', en: 'Tester: the signal gets through, this cord is sound.' });
    default: return assertNever(t);
  }
}

function incidentText(ev: IncidentEvent): string {
  const n = ev.link + 1;
  switch (ev.kind) {
    case 'colleague': return tr({ fr: `Un collègue a débranché la liaison ${n} par erreur !`, en: `A colleague unplugged link ${n} by mistake!` });
    case 'call': return tr({ fr: `📞 Un utilisateur appelle : la liaison ${n} doit revenir d'ici ${ev.within} s.`, en: `📞 A user calls: link ${n} must be back within ${ev.within} s.` });
    case 'callMet': return tr({ fr: `📞 Liaison ${n} rétablie à temps : l'utilisateur vous remercie.`, en: `📞 Link ${n} back in time: the user thanks you.` });
    case 'callMissed': return tr({ fr: `📞 Trop tard pour la liaison ${n} : ${ev.penalty} pts sur le budget d'interruption.`, en: `📞 Too late for link ${n}: ${ev.penalty} pts off the downtime budget.` });
    default: return assertNever(ev);
  }
}

function routeErrorText(e: RouteError): string {
  switch (e.kind) {
    case 'noGuide': return tr({ fr: 'Tracez le chemin par-dessus les guides (ou jusqu\'à un port).', en: 'Draw the route over the guides (or up to a port).' });
    case 'portTaken': return tr({ fr: `Le port ${e.port} est déjà occupé.`, en: `Port ${e.port} is taken already.` });
    case 'tooShort': return tr({
      fr: `Ce câble est trop court pour ce chemin : il manque ${Math.ceil(e.missing * 100)} cm (un câble plus long se prend au Stock).`,
      en: `This cord is too short for this route: ${Math.ceil(e.missing * 100)} cm are missing (a longer cord comes from the Stock).`,
    });
    default: return assertNever(e);
  }
}

/** a hint, as HTML */
export function hintHtml(h: Hint): string {
  switch (h.kind) {
    case 'carry': return tr({
      fr: 'Maintenez <b>Maj</b> pour pousser le câble vers le fond (souris vers le haut) ou le ramener vers vous (vers le bas). Maintenez <b>Espace</b> (ou le clic droit) pour pincer : le câble garde le coude qu\'il fait sous la main, d\'autant plus fermement que vous pincez longtemps. <b>E</b> : l\'autre main tient le câble ici, et la vôtre est libre. <span class="ok">Vert</span> : tenu, <span class="warn">orange</span> : pend trop.',
      en: 'Hold <b>Shift</b> to push the cord to the back (mouse up) or bring it towards you (down). Hold <b>Space</b> (or the right button) to pinch: the cord keeps the bend it makes under the hand, the firmer the longer you pinch. <b>E</b>: the other hand holds the cord here, and yours is free. <span class="ok">Green</span>: held, <span class="warn">orange</span>: hangs too much.',
    });
    case 'pullToUnplug': return tr({ fr: '<b>Tirez</b> le connecteur de quelques centimètres pour le débrancher ; sinon vous rangez simplement le câble.', en: '<b>Pull</b> the connector a few centimetres to unplug it; otherwise you simply move the cord.' });
    case 'plugConnector': return tr({
      fr: 'Relâchez le connecteur devant un port libre (surligné en jaune) pour le brancher. Lâché en l\'air, il pend ; avec <b>Alt</b>, il y reste accroché.',
      en: 'Let go of the connector in front of a free port (lit in yellow) to plug it. Let go in the air, it hangs; with <b>Alt</b>, it stays hooked there.',
    });
    case 'depth': return h.on
      ? tr({ fr: '<b>Profondeur</b> : souris vers le haut = vers le fond, vers le bas = vers vous. Relâchez Maj pour revenir.', en: '<b>Depth</b>: mouse up = to the back, down = towards you. Let go of Shift to come back.' })
      : tr({ fr: 'Maintenez <b>Maj</b> pour pousser le câble vers le fond ou le ramener vers vous.', en: 'Hold <b>Shift</b> to push the cord to the back or bring it towards you.' });
    case 'drawRoute': return tr({
      fr: 'Tracez le chemin du câble <b>par-dessus les guides</b>, dans l\'ordre où il doit les traverser (guide-câbles, goulottes), et finissez sur un <b>port libre</b> pour l\'y brancher. Relâchez : le câble est posé le long du chemin.',
      en: 'Draw the cord\'s route <b>over the guides</b>, in the order it must go through them (cable managers, ducts), and end on a <b>free port</b> to plug it there. Let go: the cord is laid along the route.',
    });
    case 'velcroLine': return h.cords >= 2
      ? tr({ fr: `<b>${h.cords} câbles</b> : relâchez, le velcro les serre là où le trait les croise.`, en: `<b>${h.cords} cords</b>: let go, the velcro straps them where the line crosses them.` })
      : tr({ fr: 'Tracez le trait <b>en travers</b> des câbles à serrer, là où ils passent côte à côte : ceux qu\'il prend s\'allument.', en: 'Draw the line <b>across</b> the cords to strap, where they run side by side: those it takes light up.' });
    default: return assertNever(h);
  }
}

/** the tooltip of a cord, as HTML: what it is, then a line per note */
export function cordTooltipHtml(cord: CordInfo, notes: HoverNote[]): string {
  const where = cord.ends ? cord.ends.map((p) => p ?? '—').join(' ↔ ') : tr({ fr: 'sans marque — <b>T</b> pour le tracer', en: 'unmarked — <b>T</b> to trace it' });
  const ends = `${where} · ${formatDecimal(cord.length, 2)} m`;
  let html = `<b>${cordTypeName(cord.type)}</b> · ${ends}`;
  if (cord.line >= 0) html += ` · <span class="ok">${tr({ fr: 'liaison', en: 'link' })} ${cord.line + 1} ✓</span>`;
  if (cord.strain) html += ` · <span class="warn">${strainLabel(cord.strain)}</span>`;
  return html + notes.map((n) => `<br><i>${hoverNoteText(n)}</i>`).join('');
}

function hoverNoteText(n: HoverNote): string {
  switch (n.kind) {
    case 'connectorPlugged': return tr({ fr: 'connecteur : saisir et tirer pour débrancher', en: 'connector: grab and pull to unplug' });
    case 'connectorLoose': return tr({ fr: 'connecteur : relâchez-le devant un port pour le brancher', en: 'connector: let go of it in front of a port to plug it' });
    case 'traceOrCrate': return tr({ fr: `T : tracer · ${DELETE_KEY.fr} : au bac`, en: `T: trace · ${DELETE_KEY.en}: to the crate` });
    case 'pinched': return tr({ fr: 'Coude pincé — Espace : le relâcher', en: 'Pinched bend — Space: release it' });
    case 'heldByOtherHand': return tr({ fr: 'Tenu par l\'autre main — E : la lâcher', en: 'Held by the other hand — E: let go' });
    case 'stacked': return tr({ fr: `${n.count} câbles sous le curseur — Tab : suivant`, en: `${n.count} cords under the pointer — Tab: next` });
    case 'cycling': return tr({ fr: `${n.index + 1}/${n.count} sous le curseur — Tab : suivant`, en: `${n.index + 1}/${n.count} under the pointer — Tab: next` });
    case 'testIt': return tr({ fr: 'clic : tester ce câble', en: 'click: test this cord' });
    case 'tested': return n.faulty
      ? `<span class="warn">${tr({ fr: 'testé : coupé à l\'intérieur', en: 'tested: broken inside' })}</span>`
      : `<span class="ok">${tr({ fr: 'testé : bon', en: 'tested: sound' })}</span>`;
    default: return assertNever(n);
  }
}

export function statsText(s: PhysicsStats): string {
  return tr({
    fr: `${s.nodes} nœuds · ${s.contacts} contacts · ${s.awake}/${s.cords} câbles actifs · physique ${s.physicsMs.toFixed(1)} ms${s.inWorker ? ' (worker)' : ''}${s.lostSteps ? ` · ${s.lostSteps} pas perdus` : ''}`,
    en: `${s.nodes} nodes · ${s.contacts} contacts · ${s.awake}/${s.cords} cords awake · physics ${s.physicsMs.toFixed(1)} ms${s.inWorker ? ' (worker)' : ''}${s.lostSteps ? ` · ${s.lostSteps} steps lost` : ''}`,
  });
}

/** a goal of the stars as the side panel lists it: what it asks, how far along it is, and what is still wrong (empty: nothing) */
export function starGoalText(g: StarGoal): { label: string; progress: string; detail: string } {
  const plural = (n: number, one: string, many: string) => n > 1 ? many : one;
  const met = isGoalMet(g);
  switch (g.kind) {
    case 'connect': return {
      label: g.total > 1 ? tr({ fr: `Brancher les ${g.total} liaisons du plan`, en: `Plug the ${g.total} links of the schedule` }) : tr({ fr: 'Brancher la liaison du plan', en: 'Plug the link of the schedule' }),
      progress: `${g.done}/${g.total}`,
      detail: '',
    };
    case 'tidy': {
      const why = met ? [] : [
        g.hanging ? tr({ fr: `${g.hanging} ${plural(g.hanging, 'pend', 'pendent')} hors des supports`, en: `${g.hanging} ${plural(g.hanging, 'hangs', 'hang')} out of the supports` }) : '',
        g.front ? tr({ fr: `${g.front} ${plural(g.front, 'passe', 'passent')} devant un port`, en: `${g.front} ${plural(g.front, 'crosses', 'cross')} a port` }) : '',
        g.strained ? tr({ fr: `${g.strained} ${plural(g.strained, 'est tendu ou plié', 'sont tendus ou pliés')}`, en: `${g.strained} ${plural(g.strained, 'is', 'are')} taut or kinked` })
          + (g.short > 0 ? tr({ fr: ` (il manque jusqu'à ${Math.ceil(g.short * 100)} cm : prenez un câble plus long au Stock)`, en: ` (up to ${Math.ceil(g.short * 100)} cm short: take a longer cord from the Stock)` }) : '') : '',
      ].filter(Boolean);
      return {
        label: g.total > 1 ? tr({ fr: `Ranger les ${g.total} câbles`, en: `Tidy the ${g.total} cords` }) : tr({ fr: 'Ranger le câble', en: 'Tidy the cord' }),
        progress: `${g.done}/${g.total}`,
        detail: why.join(', '),
      };
    }
    case 'budget': return {
      label: tr({ fr: 'Rester dans le budget d\'interruption', en: 'Stay within the downtime budget' }),
      progress: `${Math.round(g.spent)}/${g.budget}`,
      detail: met ? '' : tr({ fr: 'Budget dépassé : ★★★ n\'est plus possible dans cette partie.', en: 'Budget overrun: ★★★ is out of reach in this game.' }),
    };
    case 'separate': return {
      label: tr({ fr: 'Fibre, cuivre et courant dans des goulottes séparées', en: 'Fibre, copper and power in separate ducts' }),
      progress: '',
      detail: met ? '' : tr({ fr: `${g.mixed} ${plural(g.mixed, 'goulotte mélange', 'goulottes mélangent')} des familles`, en: `${g.mixed} ${plural(g.mixed, 'duct mixes', 'ducts mix')} families` }),
    };
    default: return assertNever(g);
  }
}

/** why a free cabinet cannot be played, or a code read */
export function freeErrorText(e: FreeError): string {
  switch (e.kind) {
    case 'noPanel': return tr({ fr: 'Il faut au moins un panneau de brassage.', en: 'It takes a patch panel at least.' });
    case 'noSwitch': return tr({ fr: 'Il faut au moins un switch.', en: 'It takes a switch at least.' });
    case 'tooManyUnits': return tr({ fr: `${e.most} unités au plus.`, en: `${e.most} units at most.` });
    case 'tooManyCords': return tr({ fr: `Entre 1 et ${e.most} câbles : autant que de ports de panneaux et de switchs.`, en: `Between 1 and ${e.most} cords: as many as the panel and switch ports.` });
    case 'twice': return tr({ fr: 'Un seul exemplaire de chacun : pare-feu, routeur, bandeau électrique.', en: 'One of each only: firewall, router, power strip.' });
    case 'badCode': return tr({ fr: 'Ce code ne décrit pas une baie.', en: 'This code describes no cabinet.' });
    default: return assertNever(e);
  }
}
