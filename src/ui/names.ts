// What the player calls the things of the game: the services of the schedule,
// the supplies, the cord types, the equipment of the rack. game/ describes
// them by their ids; their names live here, with the rest of the words.

import type { FibreType } from '../game/cordTypes';
import type { Supply } from '../game/supplies';
import type { UnitSpec } from '../game/rack';
import { assertNever } from '../lib/assertNever';

/** a service's name, and what it carries (who notices when it is cut) */
interface ServiceText {
  name: string;
  what: string;
}

/** by service index (game/services.ts) */
const SERVICE_TEXTS: ServiceText[] = [
  { name: 'Données', what: 'les postes de travail : un fichier qui ne s\'enregistre plus' },
  { name: 'Voix', what: 'les téléphones IP : un appel coupé, tout le monde l\'entend' },
  { name: 'Vidéo', what: 'les caméras : un trou dans l\'enregistrement' },
  { name: 'Admin', what: 'pare-feu, routeur, supervision : sans elle, on travaille à l\'aveugle' },
  { name: 'Stockage', what: 'serveurs et disques : les machines virtuelles s\'arrêtent' },
  { name: 'Invités', what: 'le Wi-Fi des visiteurs : personne ne s\'en plaindra' },
];

export function serviceName(service: number): string {
  return SERVICE_TEXTS[service].name;
}

/** what a service carries, and who notices when it is cut */
export function serviceWhat(service: number): string {
  return SERVICE_TEXTS[service].what;
}

const SUPPLY_NAMES: Record<Supply, { singular: string; plural: string }> = {
  fingerManager: { singular: 'guide-câbles', plural: 'guide-câbles' },
  duct: { singular: 'goulotte', plural: 'goulottes' },
  ring: { singular: 'anneau', plural: 'anneaux' },
  velcro: { singular: 'velcro', plural: 'velcros' },
};

export function supplyName(supply: Supply): string {
  return SUPPLY_NAMES[supply].singular;
}

/** `count` of a supply, as the player reads it: "2 goulottes", "1 anneau" */
export function countOf(supply: Supply, count: number): string {
  return `${count} ${count > 1 ? SUPPLY_NAMES[supply].plural : SUPPLY_NAMES[supply].singular}`;
}

export const FIBRE_NAMES: Record<FibreType, string> = { OS2: 'Monomode OS2', OM4: 'Multimode OM4', CU: 'Cuivre RJ45' };

/** what the face plate of a unit says it is: "Switch S", "Pare-feu" */
export function unitLabel(u: UnitSpec): string {
  const name = u.name ?? '';
  switch (u.kind) {
    case 'panel': return u.style === 'copper' ? `Panneau de brassage ${name}` : `Tiroir optique ${name}`;
    case 'switch': {
      switch (u.style) {
        case 'firewall': return 'Pare-feu';
        case 'router': return 'Routeur';
        case 'switch': return `Switch ${name}`;
        default: return `Commutateur ${name}`;
      }
    }
    case 'server': return u.style === 'ups' ? 'Onduleur' : `Serveur ${name}`.trim();
    case 'fingerManager':
    case 'blank': return '';
    default: return assertNever(u.kind);
  }
}
