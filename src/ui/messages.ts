// Every sentence a level says to the player: the toasts, the hints under the
// cabinet, the tooltip of a cord, the readability criteria. The game sends
// data (play/messages.ts, game/evaluation.ts); the words live here.

import type { CordInfo, Hint, HoverNote, PhysicsStats, Toast } from '../play/messages';
import type { RouteError } from '../game/routeLaying';
import type { ReadabilityPart, Strain } from '../game/evaluation';
import { assertNever } from '../lib/assertNever';
import { formatCost } from './format';
import { FIBRE_NAMES, serviceName, supplyName } from './names';

export const STRAIN_LABELS: Record<Strain, string> = { taut: 'tendu', kinked: 'plié' };

export function toastText(t: Toast): string {
  switch (t.kind) {
    case 'bypassBack': return `Liaison ${t.link + 1} rétablie : sa dérivation revient au stock.`;
    case 'linksCut': {
      const names = t.links.map((l) => `${l.link + 1} (${serviceName(l.service)})`).join(', ');
      return t.costPerSecond > 0
        ? `Liaison ${names} coupée : ${formatCost(t.costPerSecond)} par seconde sur le budget d'interruption. Rebranchez vite.`
        : `Liaison ${names} coupée, mais sa dérivation porte le trafic.`;
    }
    case 'nothingToUndo': return 'Rien à annuler.';
    case 'undoBlocked': return 'Impossible d\'annuler au-delà d\'un changement de cordon.';
    case 'undone': return 'Annulé.';
    case 'noCordOfThatLength': return 'Plus aucun cordon de cette longueur en stock.';
    case 'noBypassLeft': return 'Plus de dérivation en stock.';
    case 'notInProduction': return 'Seules les liaisons en production (⚡) se dérivent.';
    case 'portsTaken': return 'Ses deux ports sont occupés.';
    case 'noLooseEnd': return 'Aucun cordon de ce type n\'a de bout libre : débranchez celui qui est sur un mauvais port.';
    case 'itemLocked': return 'Cet élément est fixé à la baie.';
    case 'noSupportLeft': return `Plus de ${supplyName(t.item)} en stock.`;
    case 'cannotPlace': return t.item === 'fingerManager' ? 'Un guide-câbles se pose dans une unité vide.' : 'Emplacement occupé.';
    case 'routeRefused': return routeErrorText(t.error);
    case 'routeSlack': return `Ce cordon a ${Math.round(t.extra * 100)} cm de trop pour ce chemin : le mou est rangé dans les guides, ou pend (un cordon plus court se prend au Stock).`;
    case 'connectorHeldBack': return 'Le connecteur n\'a pas pu atteindre le port : quelque chose le retient.';
    case 'velcroClick': return 'Velcro : tracez un trait en travers des câbles à serrer (un clic sur un velcro l\'enlève).';
    case 'noVelcroLeft': return 'Plus de velcro.';
    case 'velcroNeedsTwo': return 'Le trait doit croiser au moins deux câbles qui passent côte à côte.';
    default: return assertNever(t);
  }
}

function routeErrorText(e: RouteError): string {
  switch (e.kind) {
    case 'noGuide': return 'Tracez le chemin par-dessus les guides (ou jusqu\'à un port).';
    case 'portTaken': return `Le port ${e.port} est déjà occupé.`;
    case 'tooShort': return `Ce cordon est trop court pour ce chemin : il manque ${Math.ceil(e.missing * 100)} cm (un cordon plus long se prend au Stock).`;
    default: return assertNever(e);
  }
}

/** a hint, as HTML */
export function hintHtml(h: Hint): string {
  switch (h.kind) {
    case 'carry': return 'Maintenez <b>Maj</b> pour pousser le câble vers le fond (souris vers le haut) ou le ramener vers vous (vers le bas). Maintenez <b>Espace</b> (ou le clic droit) pour pincer : le câble garde le coude qu\'il fait sous la main, d\'autant plus fermement que vous pincez longtemps. <b>E</b> : l\'autre main tient le câble ici, et la vôtre est libre. <span class="ok">Vert</span> : tenu, <span class="warn">orange</span> : pend trop.';
    case 'pullToUnplug': return '<b>Tirez</b> le connecteur de quelques centimètres pour le débrancher ; sinon vous rangez simplement le câble.';
    case 'plugConnector': return 'Relâchez le connecteur devant un port libre (surligné en jaune) pour le brancher. Lâché en l\'air, il y reste accroché ; avec <b>Alt</b>, il pend.';
    case 'depth': return h.on
      ? '<b>Profondeur</b> : souris vers le haut = vers le fond, vers le bas = vers vous. Relâchez Maj pour revenir.'
      : 'Maintenez <b>Maj</b> pour pousser le câble vers le fond ou le ramener vers vous.';
    case 'drawRoute': return 'Tracez le chemin du câble <b>par-dessus les guides</b>, dans l\'ordre où il doit les traverser (guide-câbles, anneaux, goulottes), et finissez sur un <b>port libre</b> pour l\'y brancher. Relâchez : le câble est posé le long du chemin.';
    case 'velcroLine': return h.cords >= 2
      ? `<b>${h.cords} câbles</b> : relâchez, le velcro les serre là où le trait les croise.`
      : 'Tracez le trait <b>en travers</b> des câbles à serrer, là où ils passent côte à côte : ceux qu\'il prend s\'allument.';
    default: return assertNever(h);
  }
}

/** the tooltip of a cord, as HTML: what it is, then a line per note */
export function cordTooltipHtml(cord: CordInfo, notes: HoverNote[]): string {
  const ends = (cord.ends ? cord.ends.map((p) => p ?? '—').join(' ↔ ') : 'sans marque — <b>T</b> pour le tracer') + ` · ${cord.length.toFixed(2).replace('.', ',')} m`;
  let html = `<b>${FIBRE_NAMES[cord.type]}</b> · ${ends}`;
  if (cord.line >= 0) html += ` · <span class="ok">liaison ${cord.line + 1} ✓</span>`;
  if (cord.strain) html += ` · <span class="warn">${STRAIN_LABELS[cord.strain]}</span>`;
  return html + notes.map((n) => `<br><i>${hoverNoteText(n)}</i>`).join('');
}

function hoverNoteText(n: HoverNote): string {
  switch (n.kind) {
    case 'connectorPlugged': return 'connecteur : saisir et tirer pour débrancher';
    case 'connectorLoose': return 'connecteur : relâchez-le devant un port pour le brancher';
    case 'traceOrCrate': return 'T : tracer · Suppr : au bac';
    case 'pinched': return 'Coude pincé — Espace : le relâcher';
    case 'heldByOtherHand': return 'Tenu par l\'autre main — E : la lâcher';
    case 'stacked': return `${n.count} câbles sous le curseur — Tab : suivant`;
    case 'cycling': return `${n.index + 1}/${n.count} sous le curseur — Tab : suivant`;
    default: return assertNever(n);
  }
}

export function statsText(s: PhysicsStats): string {
  return `${s.nodes} nœuds · ${s.contacts} contacts · ${s.awake}/${s.cords} câbles actifs · physique ${s.physicsMs.toFixed(1)} ms${s.inWorker ? ' (worker)' : ''}${s.lostSteps ? ` · ${s.lostSteps} pas perdus` : ''}`;
}

/** a readability criterion: its name, and what it asks for */
export function readabilityText(part: ReadabilityPart): { name: string; tip: string } {
  switch (part.criterion) {
    case 'slack': return { name: 'Le mou juste', tip: 'ni tendu ni plié, et pas plus de 50 cm de trop' };
    case 'colours': return { name: 'Couleurs', tip: 'chaque cordon cuivre de la couleur de son service' };
    case 'bundles': return { name: 'Faisceaux', tip: 'un seul service par velcro' };
    case 'separation': return { name: 'Fibre et cuivre', tip: 'la fibre et le cuivre dans des supports séparés' };
    case 'crossings': return { name: 'Croisements', tip: `${part.crossings} croisement${part.crossings > 1 ? 's' : ''} hors des supports` };
    default: return assertNever(part);
  }
}
