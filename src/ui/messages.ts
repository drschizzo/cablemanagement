// Every sentence a level says to the player: the toasts, the hints under the
// cabinet, the tooltip of a cord, what the next star needs, the readability
// criteria, and why a cabinet of the editor cannot be played. The game sends data (play/messages.ts,
// game/evaluation.ts, game/levels/customLevel.ts); the words live here.

import type { CordInfo, Hint, HoverNote, PhysicsStats, Toast } from '../play/messages';
import type { RouteError } from '../game/routeLaying';
import type { ReadabilityPart, StarNeed, Strain } from '../game/evaluation';
import type { IncidentEvent } from '../game/incidents';
import type { CustomError } from '../game/levels/customLevel';
import { assertNever } from '../lib/assertNever';
import { formatCost, formatDecimal } from './format';
import { cordTypeName, serviceName, supplyName } from './names';
import { tr } from './language';

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
    case 'undoBlocked': return tr({ fr: 'Impossible d\'annuler au-delà d\'un changement de cordon.', en: 'Cannot undo past a change of cord.' });
    case 'undone': return tr({ fr: 'Annulé.', en: 'Undone.' });
    case 'noCordOfThatLength': return tr({ fr: 'Plus aucun cordon de cette longueur en stock.', en: 'No cord of that length left in stock.' });
    case 'noBypassLeft': return tr({ fr: 'Plus de dérivation en stock.', en: 'No bypass left in stock.' });
    case 'notInProduction': return tr({ fr: 'Seules les liaisons en production (⚡) se dérivent.', en: 'Only links in production (⚡) can be bypassed.' });
    case 'portsTaken': return tr({ fr: 'Ses deux ports sont occupés.', en: 'Both its ports are taken.' });
    case 'noLooseEnd': return tr({ fr: 'Aucun cordon de ce type n\'a de bout libre : débranchez celui qui est sur un mauvais port.', en: 'No cord of that type has a loose end: unplug the one in a wrong port.' });
    case 'itemLocked': return tr({ fr: 'Cet élément est fixé à la baie.', en: 'This item is fixed to the cabinet.' });
    case 'noSupportLeft': return tr({ fr: `Plus de ${supplyName(t.item)} en stock.`, en: `No ${supplyName(t.item)} left in stock.` });
    case 'cannotPlace': return t.item === 'fingerManager'
      ? tr({ fr: 'Un guide-câbles se pose dans une unité vide.', en: 'A cable manager goes in an empty unit.' })
      : tr({ fr: 'Emplacement occupé.', en: 'That slot is taken.' });
    case 'routeRefused': return routeErrorText(t.error);
    case 'routeSlack': return tr({
      fr: `Ce cordon a ${Math.round(t.extra * 100)} cm de trop pour ce chemin : le mou est rangé dans les guides, ou pend (un cordon plus court se prend au Stock).`,
      en: `This cord is ${Math.round(t.extra * 100)} cm too long for this route: the slack is stowed in the guides, or hangs (a shorter cord comes from the Stock).`,
    });
    case 'connectorHeldBack': return tr({ fr: 'Le connecteur n\'a pas pu atteindre le port : quelque chose le retient.', en: 'The connector could not reach the port: something holds it back.' });
    case 'velcroClick': return tr({ fr: 'Velcro : tracez un trait en travers des câbles à serrer (un clic sur un velcro l\'enlève).', en: 'Velcro: draw a line across the cords to strap (a click on a velcro takes it off).' });
    case 'noVelcroLeft': return tr({ fr: 'Plus de velcro.', en: 'No velcro left.' });
    case 'velcroNeedsTwo': return tr({ fr: 'Le trait doit croiser au moins deux câbles qui passent côte à côte.', en: 'The line must cross at least two cords running side by side.' });
    case 'incident': return incidentText(t.incident);
    case 'cordTested': return t.faulty
      ? tr({ fr: 'Testeur : rien ne passe. Ce cordon est coupé à l\'intérieur, remplacez-le.', en: 'Tester: nothing gets through. This cord is broken inside, swap it.' })
      : tr({ fr: 'Testeur : le signal passe, ce cordon est bon.', en: 'Tester: the signal gets through, this cord is sound.' });
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
      fr: `Ce cordon est trop court pour ce chemin : il manque ${Math.ceil(e.missing * 100)} cm (un cordon plus long se prend au Stock).`,
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
      fr: 'Relâchez le connecteur devant un port libre (surligné en jaune) pour le brancher. Lâché en l\'air, il y reste accroché ; avec <b>Alt</b>, il pend.',
      en: 'Let go of the connector in front of a free port (lit in yellow) to plug it. Let go in the air, it stays hooked there; with <b>Alt</b>, it hangs.',
    });
    case 'depth': return h.on
      ? tr({ fr: '<b>Profondeur</b> : souris vers le haut = vers le fond, vers le bas = vers vous. Relâchez Maj pour revenir.', en: '<b>Depth</b>: mouse up = to the back, down = towards you. Let go of Shift to come back.' })
      : tr({ fr: 'Maintenez <b>Maj</b> pour pousser le câble vers le fond ou le ramener vers vous.', en: 'Hold <b>Shift</b> to push the cord to the back or bring it towards you.' });
    case 'drawRoute': return tr({
      fr: 'Tracez le chemin du câble <b>par-dessus les guides</b>, dans l\'ordre où il doit les traverser (guide-câbles, anneaux, goulottes), et finissez sur un <b>port libre</b> pour l\'y brancher. Relâchez : le câble est posé le long du chemin.',
      en: 'Draw the cord\'s route <b>over the guides</b>, in the order it must go through them (cable managers, rings, ducts), and end on a <b>free port</b> to plug it there. Let go: the cord is laid along the route.',
    });
    case 'velcroLine': return h.cords >= 2
      ? tr({ fr: `<b>${h.cords} câbles</b> : relâchez, le velcro les serre là où le trait les croise.`, en: `<b>${h.cords} cords</b>: let go, the velcro straps them where the line crosses them.` })
      : tr({ fr: 'Tracez le trait <b>en travers</b> des câbles à serrer, là où ils passent côte à côte : ceux qu\'il prend s\'allument.', en: 'Draw the line <b>across</b> the cords to strap, where they run side by side: those it takes light up.' });
    case 'comb': return h.cords >= 2
      ? tr({ fr: `<b>${h.cords} câbles</b> dans le peigne : glissez le long du faisceau, ils se rangent côte à côte.`, en: `<b>${h.cords} cords</b> in the comb: slide along the bundle, they line up side by side.` })
      : tr({ fr: 'Glissez le peigne <b>le long</b> des câbles, là où ils passent ensemble.', en: 'Slide the comb <b>along</b> the cords, where they run together.' });
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
    case 'traceOrCrate': return tr({ fr: 'T : tracer · Suppr : au bac', en: 'T: trace · Delete: to the crate' });
    case 'pinched': return tr({ fr: 'Coude pincé — Espace : le relâcher', en: 'Pinched bend — Space: release it' });
    case 'heldByOtherHand': return tr({ fr: 'Tenu par l\'autre main — E : la lâcher', en: 'Held by the other hand — E: let go' });
    case 'stacked': return tr({ fr: `${n.count} câbles sous le curseur — Tab : suivant`, en: `${n.count} cords under the pointer — Tab: next` });
    case 'cycling': return tr({ fr: `${n.index + 1}/${n.count} sous le curseur — Tab : suivant`, en: `${n.index + 1}/${n.count} under the pointer — Tab: next` });
    case 'testIt': return tr({ fr: 'clic : tester ce cordon', en: 'click: test this cord' });
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

/** one thing the next star needs, as a line of its list */
export function starNeedText(need: StarNeed): string {
  const plural = (n: number, one: string, many: string) => n > 1 ? many : one;
  switch (need.kind) {
    case 'connect': { const n = need.count; return tr({ fr: `Branchez ${plural(n, 'la dernière liaison', `encore ${n} liaisons`)} du plan`, en: `Plug ${plural(n, 'the last link', `${n} more links`)} of the schedule` }); }
    case 'route': { const n = need.count; return tr({ fr: `Rangez encore ${n} ${plural(n, 'câble', 'câbles')} dans les supports`, en: `Route ${n} more ${plural(n, 'cord', 'cords')} through the supports` }); }
    case 'clear': { const n = need.count; return tr({ fr: `Dégagez la façade : encore ${n} ${plural(n, 'câble passe', 'câbles passent')} devant un port`, en: `Clear the front: ${n} more ${plural(n, 'cord crosses', 'cords cross')} a port` }); }
    case 'label': { const n = need.count; return tr({ fr: `${n} ${plural(n, 'cordon sans', 'cordons sans')} l'étiquette de son service`, en: `${n} ${plural(n, 'cord without', 'cords without')} their service's label` }); }
    case 'relax': { const n = need.count; return tr({ fr: `${n} ${plural(n, 'cordon tendu ou plié', 'cordons tendus ou pliés')}`, en: `${n} ${plural(n, 'cord taut or kinked', 'cords taut or kinked')}` }); }
    case 'bundle': { const n = need.count; return tr({ fr: `Serrez encore ${n} ${plural(n, 'faisceau', 'faisceaux')} (un velcro sur 3 câbles ou plus)`, en: `Strap ${n} more ${plural(n, 'bundle', 'bundles')} (a velcro round 3 cords or more)` }); }
    case 'incident': return tr({ fr: 'Budget d\'interruption dépassé : ★★★ n\'est plus possible', en: 'Downtime budget overrun: ★★★ is out of reach' });
    default: return assertNever(need);
  }
}

/** a readability criterion: its name, and what it asks for */
export function readabilityText(part: ReadabilityPart): { name: string; tip: string } {
  switch (part.criterion) {
    case 'slack': return tr({ fr: { name: 'Le mou juste', tip: 'ni tendu ni plié, et pas plus de 50 cm de trop' }, en: { name: 'Right slack', tip: 'neither taut nor kinked, and no more than 50 cm too long' } });
    case 'colours': return tr({ fr: { name: 'Couleurs', tip: 'chaque cordon cuivre de la couleur de son service' }, en: { name: 'Colours', tip: 'each copper cord in its service\'s colour' } });
    case 'bundles': return tr({ fr: { name: 'Faisceaux', tip: 'un seul service par velcro' }, en: { name: 'Bundles', tip: 'one service per velcro' } });
    case 'separation': return tr({ fr: { name: 'Séparation', tip: 'la fibre, le cuivre et le courant dans des supports séparés' }, en: { name: 'Separation', tip: 'fibre, copper and power in separate supports' } });
    case 'crossings': return tr({
      fr: { name: 'Croisements', tip: `${part.crossings} croisement${part.crossings > 1 ? 's' : ''} hors des supports` },
      en: { name: 'Crossings', tip: `${part.crossings} crossing${part.crossings > 1 ? 's' : ''} outside the supports` },
    });
    default: return assertNever(part);
  }
}

/** why a cabinet of the editor cannot be played, or a code read */
export function customErrorText(e: CustomError): string {
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
