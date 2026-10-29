// The toolbar on the left: one button per tool, with its key and, for the
// supports and the velcro, what is left in stock; and the Stock button.

import type { Tool } from '../play/controller';
import type { Inventory } from '../game/world';
import type { LevelDef } from '../game/levels/levelDef';
import { $ } from './dom';
import { iconFingerManager, iconHand, iconRoute, iconStock, iconVelcro } from './icons';

interface ToolButton {
  tool: Tool;
  /** its keyboard shortcut */
  key: string;
  name: string;
  icon: string;
  /** what it does, shown under the cabinet while it is chosen */
  help: string;
}

export const TOOLS: ToolButton[] = [
  { tool: 'hand', key: '1', name: 'Main', icon: iconHand(), help: 'Saisir, tirer, débrancher et brancher ; un connecteur lâché en l\'air y reste accroché (Alt en lâchant : il pend). Survol d\'un câble : <b>T</b> le trace, <b>Suppr</b> le jette au bac. Maj : profondeur ; Espace : pincer un coude ; E : l\'autre main. Glisser dans le vide : déplacer la vue.' },
  { tool: 'route', key: 'c', name: 'Chemin', icon: iconRoute(), help: 'Partez d\'un câble et tracez son chemin par-dessus les guides, dans l\'ordre où il doit les traverser ; finissez sur un port libre pour l\'y brancher. Relâchez : le câble est posé le long du chemin, par l\'ouverture de chaque guide.' },
  { tool: 'supports', key: '2', name: 'Supports', icon: iconFingerManager(), help: 'Cliquez une unité vide : un guide-câbles. Un couloir latéral : une goulotte (Maj : un anneau). Cliquez un support posé pour le retirer.' },
  { tool: 'velcro', key: '3', name: 'Velcro', icon: iconVelcro(), help: 'Tracez un trait <b>en travers</b> des câbles à serrer : ceux qu\'il croise s\'allument, et le velcro les serre là où le trait les croise. Il se place là où le plus de câbles passent côte à côte ; un seul service par faisceau, c\'est plus lisible. Cliquez sur un velcro pour l\'enlever.' },
];

/** the key that opens the stock */
export const STOCK_KEY = '0';

const SUPPORT_NAMES = [['hmgr', 'guide-câbles'], ['duct', 'goulottes'], ['vring', 'anneaux']] as const;

export function toolHelp(tool: Tool | undefined): string {
  return TOOLS.find((t) => t.tool === tool)?.help ?? '';
}

export class Toolbar {
  constructor(onSelect: (tool: Tool) => void, onStock: () => void) {
    const bar = $('#toolbar');
    for (const t of TOOLS) {
      const button = document.createElement('button');
      button.className = 'tool';
      button.dataset.tool = t.tool;
      button.title = `${t.name} (${t.key}) — ${t.help}`;
      button.innerHTML = `${t.icon}<span class="name">${t.name}</span><span class="key">${t.key}</span>${t.tool === 'supports' || t.tool === 'velcro' ? '<span class="count"></span>' : ''}`;
      button.onclick = () => onSelect(t.tool);
      bar.appendChild(button);
    }
    const stock = document.createElement('button');
    stock.className = 'tool stock';
    stock.title = `Stock (${STOCK_KEY}) — prendre un cordon neuf, il arrive dans le bac au sol`;
    stock.innerHTML = `${iconStock()}<span class="name">Stock</span><span class="key">${STOCK_KEY}</span>`;
    stock.onclick = onStock;
    bar.appendChild(stock);
  }

  /** the button of the chosen tool lights up */
  showChosen(tool: Tool): void {
    document.querySelectorAll<HTMLElement>('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
  }

  /**
   * What is left of the supports and the velcros; a tool the level gives
   * nothing for is hidden (the supports stay while some can be taken off).
   */
  showStock(inventory: Inventory, level: LevelDef, removableItems: boolean): void {
    const supports = $('.tool[data-tool="supports"]'), velcro = $('.tool[data-tool="velcro"]');
    const given = SUPPORT_NAMES.filter(([k]) => (level.inventory[k] ?? 0) > 0);
    supports.querySelector('.count')!.textContent = given.map(([k]) => inventory[k]).join('·');
    supports.title = `Supports (2) — en stock : ${given.map(([k, name]) => `${inventory[k]} ${name}`).join(', ') || 'aucun'}. ${toolHelp('supports')}`;
    supports.classList.toggle('empty', given.every(([k]) => inventory[k] <= 0) && !removableItems);
    supports.style.display = given.length || removableItems ? '' : 'none';
    velcro.querySelector('.count')!.textContent = String(inventory.velcro);
    velcro.classList.toggle('empty', inventory.velcro <= 0);
    velcro.style.display = (level.inventory.velcro ?? 0) > 0 ? '' : 'none';
  }
}
