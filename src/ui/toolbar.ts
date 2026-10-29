// The toolbar on the left: one button per tool, with its key and, for the
// supports and the velcro, what is left in stock; and the Stock button.

import type { Tool } from '../play/controller';
import { ITEM_KINDS, type Stock } from '../game/supplies';
import type { LevelDef } from '../game/levels/levelDef';
import { $ } from '../lib/page';
import { countOf } from './names';
import { iconComb, iconFingerManager, iconHand, iconRoute, iconStock, iconTester, iconVelcro } from './icons';
import { tr, type Words } from './language';

interface ToolButton {
  /** its keyboard shortcut */
  key: string;
  name: Words;
  icon: string;
  /** what it does, shown under the cabinet while it is chosen */
  help: Words;
  /** it shows what is left of its supplies */
  showsStock: boolean;
}

/** every tool's button, in the order of the toolbar (a Record: a new tool must have one) */
export const TOOL_BUTTONS: Record<Tool, ToolButton> = {
  hand: {
    key: '1', name: { fr: 'Main', en: 'Hand' }, icon: iconHand(), showsStock: false,
    help: {
      fr: 'Saisir, tirer, débrancher et brancher ; un connecteur lâché en l\'air y reste accroché (Alt en lâchant : il pend). Survol d\'un câble : <b>T</b> le trace, <b>Suppr</b> le jette au bac. Maj : profondeur ; Espace : pincer un coude ; E : l\'autre main. Glisser dans le vide : déplacer la vue.',
      en: 'Grab, pull, unplug and plug; a connector let go in the air stays hooked there (Alt while letting go: it hangs). Over a cord: <b>T</b> traces it, <b>Delete</b> throws it into the crate. Shift: depth; Space: pinch a bend; E: the other hand. Drag in empty space: move the view.',
    },
  },
  route: {
    key: 'c', name: { fr: 'Chemin', en: 'Route' }, icon: iconRoute(), showsStock: false,
    help: {
      fr: 'Partez d\'un câble et tracez son chemin par-dessus les guides, dans l\'ordre où il doit les traverser ; finissez sur un port libre pour l\'y brancher. Relâchez : le câble est posé le long du chemin, par l\'ouverture de chaque guide.',
      en: 'Start from a cord and draw its way over the guides, in the order it must go through them; end on a free port to plug it there. Let go: the cord is laid along the way, through the opening of each guide.',
    },
  },
  supports: {
    key: '2', name: { fr: 'Supports', en: 'Supports' }, icon: iconFingerManager(), showsStock: true,
    help: {
      fr: 'Cliquez une unité vide : un guide-câbles. Un couloir latéral : une goulotte (Maj : un anneau). Cliquez un support posé pour le retirer.',
      en: 'Click an empty unit: a cable manager. A side channel: a duct (Shift: a ring). Click a support in place to take it off.',
    },
  },
  velcro: {
    key: '3', name: { fr: 'Velcro', en: 'Velcro' }, icon: iconVelcro(), showsStock: true,
    help: {
      fr: 'Tracez un trait <b>en travers</b> des câbles à serrer : ceux qu\'il croise s\'allument, et le velcro les serre là où le trait les croise. Il se place là où le plus de câbles passent côte à côte ; un seul service par faisceau, c\'est plus lisible. Cliquez sur un velcro pour l\'enlever.',
      en: 'Draw a line <b>across</b> the cords to strap: those it crosses light up, and the velcro straps them where the line crosses them. It goes where most cords run side by side; one service per bundle reads better. Click a velcro to take it off.',
    },
  },
  comb: {
    key: '5', name: { fr: 'Peigne', en: 'Comb' }, icon: iconComb(), showsStock: false,
    help: {
      fr: 'Appuyez sur un faisceau et glissez le long des câbles : ceux que le peigne traverse se rangent côte à côte, chacun à sa place, et les croisements se défont. Relâchez : ils gardent leur rang.',
      en: 'Press on a bundle and slide along the cords: those the comb goes through line up side by side, each in its place, and the crossings come undone. Let go: they keep their rank.',
    },
  },
  tester: {
    key: '4', name: { fr: 'Testeur', en: 'Tester' }, icon: iconTester(), showsStock: false,
    help: {
      fr: 'Cliquez un câble : le testeur envoie un signal d\'un bout à l\'autre et dit s\'il arrive. Un cordon coupé à l\'intérieur ne portera rien, même branché comme prévu : remplacez-le par un cordon neuf.',
      en: 'Click a cord: the tester sends a signal from one end to the other and says whether it gets through. A cord broken inside carries nothing, even plugged as planned: swap it for a new one.',
    },
  },
};

/** the key that chooses a tool (the texts that name it say it too) */
export function toolKey(tool: Tool): string {
  return TOOL_BUTTONS[tool].key;
}

/** the tool a key chooses, if any */
export function toolForKey(key: string): Tool | undefined {
  return (Object.keys(TOOL_BUTTONS) as Tool[]).find((t) => TOOL_BUTTONS[t].key === key.toLowerCase());
}

/** the key that opens the stock */
export const STOCK_KEY = '0';

export function toolHelp(tool: Tool | undefined): string {
  return tool ? tr(TOOL_BUTTONS[tool].help) : '';
}

export class Toolbar {
  constructor(onSelect: (tool: Tool) => void, onStock: () => void) {
    const bar = $('#toolbar');
    for (const [tool, t] of Object.entries(TOOL_BUTTONS) as [Tool, ToolButton][]) {
      const button = document.createElement('button');
      button.className = 'tool';
      button.dataset.tool = tool;
      button.onclick = () => onSelect(tool);
      bar.appendChild(button);
      button.innerHTML = `${t.icon}<span class="name"></span><span class="key">${t.key}</span>${t.showsStock ? '<span class="count"></span>' : ''}`;
    }
    const stock = document.createElement('button');
    stock.className = 'tool stock';
    stock.innerHTML = `${iconStock()}<span class="name"></span><span class="key">${STOCK_KEY}</span>`;
    stock.onclick = onStock;
    bar.appendChild(stock);
    this.rewrite();
  }

  /** the names and tips of the buttons, in the language spoken */
  rewrite(): void {
    for (const [tool, t] of Object.entries(TOOL_BUTTONS) as [Tool, ToolButton][]) {
      const button = $(`.tool[data-tool="${tool}"]`);
      button.title = `${tr(t.name)} (${t.key}) — ${tr(t.help)}`;
      button.querySelector('.name')!.textContent = tr(t.name);
    }
    const stock = $('.tool.stock');
    stock.title = tr({ fr: `Stock (${STOCK_KEY}) — prendre un cordon neuf, il arrive dans le bac au sol`, en: `Stock (${STOCK_KEY}) — take a new cord, it arrives in the crate on the floor` });
    stock.querySelector('.name')!.textContent = tr({ fr: 'Stock', en: 'Stock' });
  }

  /** the button of the chosen tool lights up */
  showChosen(tool: Tool): void {
    document.querySelectorAll<HTMLElement>('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
  }

  /**
   * What is left of the supports and the velcros; a tool the level gives
   * nothing for is hidden (the supports stay while some can be taken off;
   * the tester shows where cords may be broken).
   */
  showStock(stock: Stock, level: LevelDef, removableItems: boolean): void {
    const supports = $('.tool[data-tool="supports"]'), velcro = $('.tool[data-tool="velcro"]');
    const given = ITEM_KINDS.filter((k) => (level.inventory[k] ?? 0) > 0);
    supports.querySelector('.count')!.textContent = given.map((k) => stock[k]).join('·');
    const left = given.map((k) => countOf(k, stock[k])).join(', ') || tr({ fr: 'aucun', en: 'none' });
    supports.title = `${tr(TOOL_BUTTONS.supports.name)} (2) — ${tr({ fr: 'en stock :', en: 'in stock:' })} ${left}. ${toolHelp('supports')}`;
    supports.classList.toggle('empty', given.every((k) => stock[k] <= 0) && !removableItems);
    supports.style.display = given.length || removableItems ? '' : 'none';
    velcro.querySelector('.count')!.textContent = String(stock.velcro);
    velcro.classList.toggle('empty', stock.velcro <= 0);
    velcro.style.display = (level.inventory.velcro ?? 0) > 0 ? '' : 'none';
    // the tester only where some cords are broken inside
    $('.tool[data-tool="tester"]').style.display = level.faults ? '' : 'none';
  }

}
