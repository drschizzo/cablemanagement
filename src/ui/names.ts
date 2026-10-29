// What the player calls the things of the game: the services of the schedule,
// the supplies, the cord types, the equipment of the rack, the finds. game/ describes
// them by their ids; their names live here, with the rest of the words.

import type { FibreType } from '../game/cordTypes';
import type { Supply } from '../game/supplies';
import type { UnitSpec } from '../game/rack';
import type { FindId } from '../game/finds';
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
  PWR: { fr: 'Alimentation C13', en: 'Power C13' },
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
        case 'pdu': return tr({ fr: 'Bandeau électrique', en: 'Power strip' });
        default: return `Switch ${name}`;
      }
    }
    case 'server': return u.style === 'ups' ? tr({ fr: 'Onduleur', en: 'UPS' }) : tr({ fr: `Serveur ${name}`, en: `Server ${name}` }).trim();
    case 'fingerManager':
    case 'blank': return '';
    default: return assertNever(u.kind);
  }
}

/** each find: what it is, and the story the technician before left with it */
const FIND_TEXTS: Record<FindId, Words<{ name: string; story: string }>> = {
  postit: { fr: { name: 'Un post-it', story: '« Ne surtout pas débrancher le port 7. » Lequel des panneaux ? Mystère.' }, en: { name: 'A post-it', story: '“Never unplug port 7.” Which panel? Nobody knows.' } },
  usb: { fr: { name: 'Une clé USB', story: 'Étiquetée « sauvegarde finale v3 (la bonne) ».' }, en: { name: 'A USB key', story: 'Labelled “final backup v3 (the real one)”.' } },
  mug: { fr: { name: 'Une tasse de café', story: 'Froid depuis 2019. Il a laissé une auréole sur le switch.' }, en: { name: 'A coffee mug', story: 'Cold since 2019. It left a ring on the switch.' } },
  duck: { fr: { name: 'Un canard en plastique', story: 'Le meilleur outil de débogage jamais inventé : on lui explique le problème, et on trouve.' }, en: { name: 'A rubber duck', story: 'The best debugging tool ever made: explain the problem to it, and you find it.' } },
  floppy: { fr: { name: 'Une disquette', story: '« Config routeur 1998 ». Le routeur est toujours là.' }, en: { name: 'A floppy disk', story: '“Router config 1998”. The router is still here.' } },
  screwdriver: { fr: { name: 'Un tournevis', story: 'Celui que tout le monde cherchait depuis des mois.' }, en: { name: 'A screwdriver', story: 'The one everybody had been looking for for months.' } },
  badge: { fr: { name: 'Un badge', story: 'Celui d\'un stagiaire parti il y a trois ans. Il ouvre encore la salle.' }, en: { name: 'A badge', story: 'An intern\'s, gone three years ago. It still opens the room.' } },
  sandwich: { fr: { name: 'Un sandwich', story: 'Mieux vaut ne pas savoir depuis quand.' }, en: { name: 'A sandwich', story: 'Better not to know since when.' } },
  keys: { fr: { name: 'Un trousseau de clés', story: 'Les clés de la baie, enfermées dans la baie.' }, en: { name: 'A bunch of keys', story: 'The keys to the cabinet, locked in the cabinet.' } },
  manual: { fr: { name: 'Le manuel du switch', story: 'Encore sous blister. Personne ne l\'a jamais ouvert.' }, en: { name: 'The switch manual', story: 'Still shrink-wrapped. Nobody ever opened it.' } },
};

export function findName(find: FindId): string {
  return tr(FIND_TEXTS[find]).name;
}

/** the story a find tells */
export function findStory(find: FindId): string {
  return tr(FIND_TEXTS[find]).story;
}
