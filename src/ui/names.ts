// What the player calls the things of the game: the services of the schedule,
// the supplies, the cord types, the equipment of the rack. game/ describes
// them by their ids; their names live here, with the rest of the words.

import type { FibreType } from '../game/cordTypes';
import type { Supply } from '../game/supplies';
import type { UnitSpec } from '../game/rack';
import { assertNever } from '../lib/assertNever';
import { tr, type Words } from './language';

/** a service's name, and what it carries (who notices when it is cut) */
interface ServiceText {
  name: string;
  what: string;
}

/** by service index (game/services.ts) */
const SERVICE_TEXTS: Words<ServiceText>[] = [
  {
    fr: { name: 'Données', what: 'les postes de travail : un fichier qui ne s\'enregistre plus' },
    en: { name: 'Data', what: 'the workstations: a file that will not save' },
  },
  {
    fr: { name: 'Voix', what: 'les téléphones IP : un appel coupé, tout le monde l\'entend' },
    en: { name: 'Voice', what: 'the IP phones: a call cut off, everybody hears it' },
  },
  {
    fr: { name: 'Vidéo', what: 'les caméras : un trou dans l\'enregistrement' },
    en: { name: 'Video', what: 'the cameras: a gap in the recording' },
  },
  {
    fr: { name: 'Admin', what: 'pare-feu, routeur, supervision : sans elle, on travaille à l\'aveugle' },
    en: { name: 'Admin', what: 'firewall, router, monitoring: without it, everyone works blind' },
  },
  {
    fr: { name: 'Stockage', what: 'serveurs et disques : les machines virtuelles s\'arrêtent' },
    en: { name: 'Storage', what: 'servers and disks: the virtual machines stop' },
  },
  {
    fr: { name: 'Invités', what: 'le Wi-Fi des visiteurs : personne ne s\'en plaindra' },
    en: { name: 'Guests', what: 'the visitors\' Wi-Fi: nobody will complain' },
  },
];

export function serviceName(service: number): string {
  return tr(SERVICE_TEXTS[service]).name;
}

/** what a service carries, and who notices when it is cut */
export function serviceWhat(service: number): string {
  return tr(SERVICE_TEXTS[service]).what;
}

const SUPPLY_NAMES: Record<Supply, Words<{ singular: string; plural: string }>> = {
  fingerManager: { fr: { singular: 'guide-câbles', plural: 'guide-câbles' }, en: { singular: 'cable manager', plural: 'cable managers' } },
  duct: { fr: { singular: 'goulotte', plural: 'goulottes' }, en: { singular: 'duct', plural: 'ducts' } },
  ring: { fr: { singular: 'anneau', plural: 'anneaux' }, en: { singular: 'ring', plural: 'rings' } },
  velcro: { fr: { singular: 'velcro', plural: 'velcros' }, en: { singular: 'velcro', plural: 'velcros' } },
};

export function supplyName(supply: Supply): string {
  return tr(SUPPLY_NAMES[supply]).singular;
}

/** `count` of a supply, as the player reads it: "2 goulottes", "1 anneau" */
export function countOf(supply: Supply, count: number): string {
  const names = tr(SUPPLY_NAMES[supply]);
  return `${count} ${count > 1 ? names.plural : names.singular}`;
}

const FIBRE_NAMES: Record<FibreType, Words> = {
  OS2: { fr: 'Monomode OS2', en: 'Single-mode OS2' },
  OM4: { fr: 'Multimode OM4', en: 'Multimode OM4' },
  CU: { fr: 'Cuivre RJ45', en: 'Copper RJ45' },
};

export function fibreName(type: FibreType): string {
  return tr(FIBRE_NAMES[type]);
}

/** what the face plate of a unit says it is: "Switch S", "Pare-feu" */
export function unitLabel(u: UnitSpec): string {
  const name = u.name ?? '';
  switch (u.kind) {
    case 'panel': return u.style === 'copper' ? tr({ fr: `Panneau de brassage ${name}`, en: `Patch panel ${name}` }) : tr({ fr: `Tiroir optique ${name}`, en: `Fibre panel ${name}` });
    case 'switch': {
      switch (u.style) {
        case 'firewall': return tr({ fr: 'Pare-feu', en: 'Firewall' });
        case 'router': return tr({ fr: 'Routeur', en: 'Router' });
        case 'switch': return `Switch ${name}`;
        default: return tr({ fr: `Commutateur ${name}`, en: `Switch ${name}` });
      }
    }
    case 'server': return u.style === 'ups' ? tr({ fr: 'Onduleur', en: 'UPS' }) : tr({ fr: `Serveur ${name}`, en: `Server ${name}` }).trim();
    case 'fingerManager':
    case 'blank': return '';
    default: return assertNever(u.kind);
  }
}
