// What each level says to the player: its title, its brief, its own tips.
// The levels themselves (game/levels/) are data without a sentence: the
// words of the training and the big cabinets are here, by level id, and the
// generated levels get theirs from what they are.

import type { LevelDef } from '../game/levels/levelDef';
import { assertNever } from '../lib/assertNever';
import { tr, type Words } from '../lib/language';
import { DELETE_KEY } from './keyHints';

interface LevelText {
  title: string;
  brief: string;
  tips?: string[];
}

const STOCK_TIP: Words = {
  fr: `<b>Stock</b> (0) : un câble neuf, de la longueur choisie, arrive dans le bac. ${DELETE_KEY.fr} sur l'ancien le jette au bac. Changer un câble coupe sa liaison le temps du remplacement.`,
  en: `<b>Stock</b> (0): a new cord, of the length chosen, arrives in the crate. ${DELETE_KEY.en} over the old one throws it in the crate. Swapping a cord cuts its link while it is replaced.`,
};

/** the levels written by hand (game/levels/handmade.ts), by id */
const HANDMADE: Record<string, Words<LevelText>> = {
  l1: {
    fr: { title: 'Premier brassage', brief: 'Un des quatre câbles pend, débranché, devant le switch. Rebranchez-le, puis rangez les quatre câbles dans le guide-câbles.' },
    en: { title: 'First patch', brief: 'One of the four cords hangs unplugged in front of the switch. Plug it back, then lay the four cords in the cable manager.' },
  },
  l2: {
    fr: {
      title: 'Le mou',
      brief: 'Les câbles sont trop longs et l\'un d\'eux est sur le mauvais port. Rebranchez-le, puis rangez la longueur en trop dans les goulottes, ou remplacez les câbles par des câbles plus courts.',
      tips: [STOCK_TIP.fr],
    },
    en: {
      title: 'Slack',
      brief: 'The cords are too long and one of them is in the wrong port. Plug it back, then stow the extra length in the ducts, or replace the cords with shorter ones.',
      tips: [STOCK_TIP.en],
    },
  },
  l3: {
    fr: {
      title: 'Erreurs de brassage',
      brief: 'Plusieurs câbles, dont celui du pare-feu, sont sur de mauvais ports. Rebranchez chacun selon le plan, puis rangez.',
      tips: ['T sur un câble : il clignote et ses deux ports s\'entourent.'],
    },
    en: {
      title: 'Patching errors',
      brief: 'Several cords, the firewall\'s among them, are in the wrong ports. Plug each one as the schedule says, then tidy up.',
      tips: ['T over a cord: it blinks and its two ports are circled.'],
    },
  },
  l4: {
    fr: {
      title: 'Les services',
      brief: 'Trois services passent par cette baie, et une seconde de coupure ne coûte pas la même chose pour chacun. Débranchez d\'abord les liaisons qui coûtent le moins.',
      tips: ['Le service d\'une liaison est sa couleur dans le plan. Survolez-le pour voir ce que coûte une seconde de coupure.'],
    },
    en: {
      title: 'Services',
      brief: 'Three services run through this cabinet, and a second of downtime does not cost the same for each. Unplug the cheapest links first.',
      tips: ['A link\'s service is its colour on the schedule. Hover it to see what a second of downtime costs.'],
    },
  },
  l5: {
    fr: { title: 'Fibre et cuivre', brief: 'Cette baie mêle fibre et cuivre. Branchez chaque liaison avec un câble du bon type, et faites descendre la fibre et le cuivre par des goulottes différentes.' },
    en: { title: 'Fibre and copper', brief: 'This cabinet mixes fibre and copper. Plug each link with a cord of the right type, and run fibre and copper down different ducts.' },
  },
  l6: {
    fr: {
      title: 'Salle serveurs',
      brief: 'Deux panneaux, deux switchs, le cœur de réseau et les serveurs. Jetez au bac les câbles qui gênent, puis rebrassez avec des câbles neufs.',
      tips: [STOCK_TIP.fr, 'Quatre goulottes seulement : placez-les là où passent le plus de câbles.'],
    },
    en: {
      title: 'Server room',
      brief: 'Two panels, two switches, the network core and the servers. Throw the cords in the way into the crate, then repatch with new cords.',
      tips: [STOCK_TIP.en, 'Only four ducts: place them where most cords run.'],
    },
  },
  l7: {
    fr: {
      title: 'Migration',
      brief: 'Trois panneaux, trois switchs et une fibre vers l\'opérateur. Beaucoup de ports sont à corriger, en production, sur un budget d\'interruption serré.',
      tips: ['Rangez d\'abord les liaisons en production sans les débrancher. Avant de couper une liaison Admin ou Voix, posez-lui une dérivation.'],
    },
    en: {
      title: 'Migration',
      brief: 'Three panels, three switches and a fibre to the carrier. Many ports need fixing, in production, on a tight downtime budget.',
      tips: ['Tidy the production links first, without unplugging them. Before cutting an Admin or Voice link, give it a bypass.'],
    },
  },
  l8: {
    fr: { title: 'Le plat de spaghettis', brief: 'Quatre panneaux, quatre switchs, le pare-feu, le routeur et les serveurs. Les vieux câbles ne portent aucune marque : tracez-les pour savoir où ils vont.' },
    en: { title: 'The spaghetti bowl', brief: 'Four panels, four switches, the firewall, the router and the servers. The old cords carry no mark: trace them to find where they go.' },
  },
};

/**
 * The career's tickets, in order: a title and what the client asks. The
 * client is Radio Pinède, a small local radio station of the south: a link
 * cut is dead air, and everybody hears it.
 */
const TICKETS: Words<LevelText>[] = [
  {
    fr: { title: 'Premier jour à Radio Pinède', brief: 'Radio Pinède, 98.4 FM, émet depuis 1986. Le technicien précédent est parti à la retraite en laissant la baie en désordre. La matinale est à l\'antenne pendant que vous travaillez : chaque liaison coupée s\'entend. Ce que vous rangez aujourd\'hui, vous le retrouverez aux prochaines visites.' },
    en: { title: 'First day at Radio Pinède', brief: 'Radio Pinède, 98.4 FM, has been on air since 1986. The previous technician retired and left the cabinet in a mess. The morning show is on air while you work: every link cut is heard. What you tidy today, you will find again on the next visits.' },
  },
  {
    fr: { title: 'La rédaction s\'installe', brief: 'Six journalistes arrivent pour le journal de midi : six liaisons à créer du panneau A au switch S. Le stagiaire a déjà tiré des câbles, sans les ranger.' },
    en: { title: 'The newsroom moves in', brief: 'Six journalists join for the midday news: six links to make from panel A to switch S. The intern has already run some cords, without tidying them.' },
  },
  {
    fr: { title: 'Quarante ans de cassettes', brief: 'Les archives de la radio sont numérisées sur un serveur, installé en bas de la baie sous son bandeau électrique. Ses deux alimentations vont au bandeau, ses deux cartes réseau au switch S. Il porte le service Stockage.' },
    en: { title: 'Forty years of tapes', brief: 'The station\'s archives are digitised on a server, installed at the bottom of the cabinet under its power strip. Its two supplies go to the strip, its two network cards to switch S. It carries the Storage service.' },
  },
  {
    fr: { title: 'Le collègue du son', brief: 'Deux postes de plus pour la régie son. Gérard, l\'ingénieur du son, passe dans la baie pendant votre intervention et peut débrancher une liaison par erreur. Si le standard appelle, rétablissez-la avant la fin du compte à rebours.' },
    en: { title: 'The sound engineer', brief: 'Two more desks for the sound control room. Gérard, the sound engineer, comes by the cabinet while you work and may unplug a link by mistake. If the switchboard calls, restore it before the countdown ends.' },
  },
  {
    fr: { title: 'L\'émission de nuit déménage', brief: `L'émission de nuit change de studio : quatre liaisons ne servent plus, quatre nouvelles les remplacent. Jetez au bac les câbles des liaisons retirées (${DELETE_KEY.fr} sur chacun), sans couper celles qui servent encore.` },
    en: { title: 'The night show moves', brief: `The night show changes studios: four links are no longer used, four new ones replace them. Throw the cords of the links taken out into the crate (${DELETE_KEY.en} over each), without cutting those still in use.` },
  },
  {
    fr: { title: 'Un câble fatigué', brief: 'Deux postes de plus à la rédaction. Une liaison reste rouge alors qu\'elle est branchée comme prévu : son câble est coupé à l\'intérieur. Le Testeur (4) le confirme ; remplacez-le par un câble neuf du Stock.' },
    en: { title: 'A tired cord', brief: 'Two more desks in the newsroom. A link stays red although it is plugged as planned: its cord is broken inside. The Tester (4) confirms it; replace it with a new cord from the Stock.' },
  },
  {
    fr: { title: 'Le festival de la pinède', brief: 'Pour le festival, un deuxième panneau et son switch sont installés sous le premier. Huit liaisons sont à créer, et le switch T est à relier au pare-feu.' },
    en: { title: 'The pine forest festival', brief: 'For the festival, a second panel and its switch are installed under the first. Eight links are to be made, and switch T is to be joined to the firewall.' },
  },
  {
    fr: { title: 'Le studio de la matinale', brief: 'La matinale refait son studio : trois liaisons de plus. L\'équipe du festival vous laisse des velcros, pour serrer des câbles en faisceaux si vous le souhaitez.' },
    en: { title: 'The morning studio', brief: 'The morning show redoes its studio: three links more. The festival crew leaves you some velcros, to strap cords into bundles if you wish.' },
  },
  {
    fr: { title: 'La nuit de l\'orage', brief: 'La foudre est tombée sur l\'antenne cette nuit. Plusieurs vieux câbles sont coupés et le standard reçoit des appels. Testez, remplacez et rétablissez avant la matinale.' },
    en: { title: 'The night of the storm', brief: 'Lightning struck the mast last night. Several old cords are broken and the switchboard is taking calls. Test, replace and restore before the morning show.' },
  },
  {
    fr: { title: 'Radio Pinède sur internet', brief: 'La radio diffuse désormais sur internet. Le serveur de diffusion est installé et se branche sur le switch T.' },
    en: { title: 'Radio Pinède goes online', brief: 'The station now streams on the internet. The streaming server is installed and plugs into switch T.' },
  },
  {
    fr: { title: 'La soirée électorale', brief: 'Soirée des municipales en direct. Deux liaisons ne servent plus, trois nouvelles relient les correspondants. Le budget d\'interruption est très serré : rangez les liaisons en production sans les débrancher.' },
    en: { title: 'Election night', brief: 'Local election night, live. Two links are no longer used, three new ones join the correspondents. The downtime budget is very tight: tidy the production links without unplugging them.' },
  },
  {
    fr: { title: 'Le direct des 40 ans', brief: 'Radio Pinède fête ses 40 ans en direct, avec ses anciens animateurs. Deux liaisons sont à créer pour le plateau des invités. Pendant le direct, une liaison peut être débranchée par erreur et le standard peut appeler.' },
    en: { title: 'The 40th anniversary, live', brief: 'Radio Pinède celebrates its 40 years live, with its former hosts. Two links are to be made for the guests\' set. During the show, a link may be unplugged by mistake and the switchboard may call.' },
  },
];

/** the career's tickets that have their words (a test checks every one does) */
export function hasTicketText(index: number): boolean {
  return index < TICKETS.length;
}

/** the handmade levels that have their words (a test checks every one does) */
export function hasLevelText(id: string): boolean {
  return id in HANDMADE;
}

function textOf(level: LevelDef): LevelText {
  switch (level.kind) {
    case 'training':
    case 'bigBay': return tr(HANDMADE[level.id]);
    case 'ticket': {
      const text = tr(TICKETS[level.ticket]);
      return { ...text, title: tr({ fr: `Ticket ${level.ticket + 1} · ${text.title}`, en: `Ticket ${level.ticket + 1} · ${text.title}` }) };
    }
    case 'tutorial': return { title: tr({ fr: 'Tutoriel', en: 'Tutorial' }), brief: '' };
    case 'free': return level.spec.production
      ? tr({
        fr: { title: `Baie libre · ${level.cables} câbles`, brief: 'Une baie que vous avez réglée, en production.' },
        en: { title: `Free cabinet · ${level.cables} cords`, brief: 'A cabinet you set up, in production.' },
      })
      : tr({
        fr: { title: `Baie libre · ${level.cables} câbles`, brief: 'Une baie que vous avez réglée, hors production : pas de budget ni d\'incident, et du matériel en abondance.' },
        en: { title: `Free cabinet · ${level.cables} cords`, brief: 'A cabinet you set up, out of production: no budget nor incident, and plenty of material.' },
      });
    case 'showcase': return { title: tr({ fr: 'Avant / Après', en: 'Before / After' }), brief: '' };
    case 'bench': return { title: level.id, brief: '' };
    default: return assertNever(level);
  }
}

export function levelTitle(level: LevelDef): string {
  return textOf(level).title;
}

export function levelBrief(level: LevelDef): string {
  return textOf(level).brief;
}

/** the level's own tips (those of its rules are added by the brief: ui/ruleTexts.ts) */
export function levelTips(level: LevelDef): string[] {
  return [...(textOf(level).tips ?? [])];
}
