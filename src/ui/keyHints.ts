// The few keys that matter now, as key caps under the cabinet: those of the
// tool in hand, and of the cord under the pointer. The full help of a tool
// stays on its button; here, only what the player can do this very moment.

import type { Tool } from '../play/controller';
import type { HoverNote } from '../play/messages';
import { assertNever } from '../lib/assertNever';
import { tr, type Words } from './language';

/** what the player is doing: the tool chosen, and the notes of the cord under the pointer (null: none) */
export interface KeyContext {
  tool: Tool;
  hover: readonly HoverNote[] | null;
}

/** a key (or a gesture) and what it does now */
export interface KeyCap {
  keys: Words;
  action: Words;
}

const CLICK: Words = { fr: 'Clic', en: 'Click' };
/** the key that throws a cord into the crate: ⌫ on a Mac, whose keyboard has no Suppr (Backspace works too elsewhere) */
export const DELETE_KEY: Words = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
  ? { fr: '⌫', en: '⌫' }
  : { fr: 'Suppr', en: 'Delete' };
const ESCAPE: KeyCap = { keys: { fr: 'Échap', en: 'Esc' }, action: { fr: 'revenir à la main', en: 'back to the hand' } };

/** the keys that matter in this context, the most useful first */
export function keysFor(ctx: KeyContext): KeyCap[] {
  switch (ctx.tool) {
    case 'hand': return ctx.hover ? [...cordKeys(ctx.hover)] : [
      { keys: CLICK, action: { fr: 'saisir un câble', en: 'grab a cord' } },
      { keys: { fr: 'Clic droit + glisser', en: 'Right-drag' }, action: { fr: 'tourner la vue', en: 'turn the view' } },
      { keys: { fr: 'C', en: 'C' }, action: { fr: 'tracer un chemin', en: 'draw a route' } },
      { keys: { fr: `${DELETE_KEY.fr} sur un câble`, en: `${DELETE_KEY.en} over a cord` }, action: { fr: 'le jeter au bac', en: 'throw it in the crate' } },
      { keys: { fr: 'Ctrl+Z', en: 'Ctrl+Z' }, action: { fr: 'annuler', en: 'undo' } },
    ];
    case 'route': return [
      { keys: { fr: 'Glisser depuis un câble', en: 'Drag from a cord' }, action: { fr: 'tracer son chemin par les guides', en: 'draw its way through the guides' } },
      ESCAPE,
    ];
    case 'supports': return [
      { keys: CLICK, action: { fr: 'poser ou retirer un support', en: 'place or take off a support' } },
      ESCAPE,
    ];
    case 'velcro': return [
      { keys: { fr: 'Glisser en travers', en: 'Drag across' }, action: { fr: 'serrer les câbles', en: 'strap the cords' } },
      { keys: { fr: 'Clic sur un velcro', en: 'Click a velcro' }, action: { fr: 'l\'enlever', en: 'take it off' } },
      ESCAPE,
    ];
    case 'tester': return [
      { keys: { fr: 'Clic sur un câble', en: 'Click a cord' }, action: { fr: 'le tester', en: 'test it' } },
      ESCAPE,
    ];
    default: return assertNever(ctx.tool);
  }
}

/** over a cord, with the hand: grab it, and what its notes allow */
function cordKeys(notes: readonly HoverNote[]): KeyCap[] {
  const caps: KeyCap[] = [{ keys: CLICK, action: { fr: 'saisir', en: 'grab' } }];
  for (const n of notes) {
    switch (n.kind) {
      case 'connectorPlugged': caps[0] = { keys: { fr: 'Clic + tirer', en: 'Click + pull' }, action: { fr: 'débrancher', en: 'unplug' } }; break;
      case 'connectorLoose': caps[0] = { keys: { fr: 'Glisser vers un port', en: 'Drag to a port' }, action: { fr: 'brancher', en: 'plug' } }; break;
      case 'traceOrCrate':
        caps.push({ keys: { fr: 'T', en: 'T' }, action: { fr: 'tracer', en: 'trace' } });
        caps.push({ keys: DELETE_KEY, action: { fr: 'au bac', en: 'to the crate' } });
        break;
      case 'pinched': caps.push({ keys: { fr: 'Espace', en: 'Space' }, action: { fr: 'défaire le coude', en: 'undo the bend' } }); break;
      case 'heldByOtherHand': caps.push({ keys: { fr: 'E', en: 'E' }, action: { fr: 'lâcher l\'autre main', en: 'let go of the other hand' } }); break;
      case 'testIt':
      case 'tested': break;
      case 'stacked':
      case 'cycling': caps.push({ keys: { fr: 'Tab', en: 'Tab' }, action: { fr: 'câble suivant', en: 'next cord' } }); break;
      default: assertNever(n);
    }
  }
  return caps;
}

/** key caps as HTML: <kbd>T</kbd> tracer · … */
export function keysHtml(caps: readonly KeyCap[]): string {
  return caps.map((c) => `<span class="cap"><kbd>${tr(c.keys)}</kbd>${tr(c.action)}</span>`).join('');
}
