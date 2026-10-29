// What each level says to the player: its title, its brief, its own tips.
// The levels themselves (game/levels/) are data without a sentence: the
// campaign's words are here, by level id, and the generated levels get
// theirs from what they are.

import type { LevelDef } from '../game/levels/levelDef';
import { assertNever } from '../lib/assertNever';
import { tr, type Words } from './language';

interface LevelText {
  title: string;
  brief: string;
  tips?: string[];
}

const LENGTH_TIP: Words = {
  fr: 'Un cordon trop long se remplace par un cordon neuf du Stock (0), qui arrive dans le bac : il faut couper la liaison le temps de changer. Le stock est compté : choisissez bien qui reçoit quel cordon.',
  en: 'A cord too long is swapped for a new one from the Stock (0), which arrives in the crate: the link is cut while it is changed. The stock is counted: choose well which link gets which cord.',
};

/** the campaign's levels, by id */
const CAMPAIGN: Record<string, Words<LevelText>> = {
  l1: {
    fr: {
      title: 'Premier brassage',
      brief: 'Quatre cordons pendent devant le switch, et l\'un d\'eux n\'est même plus branché. Rebranchez-le, puis couchez-les dans le guide-câbles pour dégager la façade.',
      tips: [
        'Glissez un câble avec le clic gauche pour le déplacer. Maj en tirant : le pousser vers le fond ou le ramener vers vous.',
        'Le bout qui pend : saisissez son connecteur et relâchez-le devant le port entouré du plan (survolez sa ligne).',
        'Outil Chemin (C) : partez d\'un câble et tracez son chemin par-dessus le guide-câbles, jusqu\'à un port libre si besoin : il y est posé, et branché.',
        'Clic droit + glisser pour tourner la vue, glisser dans le vide pour la déplacer, molette pour zoomer.',
      ],
    },
    en: {
      title: 'First patch',
      brief: 'Four cords hang in front of the switch, and one of them is not even plugged in any more. Plug it back, then lay them in the cable manager to clear the front.',
      tips: [
        'Drag a cord with the left button to move it. Shift while pulling: push it to the back or bring it towards you.',
        'The loose end: grab its connector and let go of it in front of the port circled on the schedule (hover its line).',
        'Route tool (C): start from a cord and draw its way over the cable manager, up to a free port if needed: it is laid there, and plugged.',
        'Right button + drag to turn the view, drag in empty space to move it, wheel to zoom.',
      ],
    },
  },
  l2: {
    fr: {
      title: 'Le mou',
      brief: 'Les cordons sont beaucoup trop longs, et l\'un d\'eux est sur le mauvais port. Corrigez-le, puis remplacez les cordons par d\'autres à la bonne longueur, ou rangez le surplus dans une goulotte.',
      tips: [LENGTH_TIP.fr, 'Un guide-câbles de plus se pose avec l\'outil Supports, dans une unité vide.'],
    },
    en: {
      title: 'Slack',
      brief: 'The cords are far too long, and one of them is in the wrong port. Fix it, then swap the cords for others of the right length, or stow the extra in a duct.',
      tips: [LENGTH_TIP.en, 'One more cable manager is placed with the Supports tool, in an empty unit.'],
    },
  },
  l3: {
    fr: {
      title: 'Erreurs de brassage',
      brief: 'Quelqu\'un a brassé à l\'aveugle et a relié le pare-feu au hasard. Suivez le plan : rebranchez chaque cordon sur le bon port, puis rangez.',
      tips: [
        'Saisissez un connecteur et tirez pour le débrancher, relâchez-le devant un port libre pour le brancher. Ctrl+Z annule le dernier geste.',
        'Traceur : survolez un câble et appuyez sur T, il clignote et ses deux ports s\'entourent.',
        'Survolez une ligne du plan pour voir ses deux ports.',
      ],
    },
    en: {
      title: 'Patching errors',
      brief: 'Someone patched blindfolded and wired the firewall at random. Follow the schedule: plug each cord into the right port, then tidy up.',
      tips: [
        'Grab a connector and pull to unplug it, let go of it in front of a free port to plug it. Ctrl+Z undoes the last gesture.',
        'Tracer: hover a cord and press T, it blinks and its two ports are circled.',
        'Hover a line of the schedule to see its two ports.',
      ],
    },
  },
  l4: {
    fr: {
      title: 'Les services',
      brief: 'Pare-feu, routeur, switch : trois services passent par cette baie, et ils ne coûtent pas tous pareil quand on les coupe. Commencez par ce qui coûte le moins.',
      tips: ['Chaque liaison appartient à un service (sa couleur dans le plan). Un cordon branché comme prévu reçoit son étiquette tout seul. Couper la Voix ou l\'Admin coûte bien plus cher que les Données.', LENGTH_TIP.fr],
    },
    en: {
      title: 'Services',
      brief: 'Firewall, router, switch: three services run through this cabinet, and they do not all cost the same when cut. Start with what costs least.',
      tips: ['Each link belongs to a service (its colour on the schedule). A cord plugged as planned gets its label by itself. Cutting Voice or Admin costs far more than Data.', LENGTH_TIP.en],
    },
  },
  l5: {
    fr: {
      title: 'Fibre et cuivre',
      brief: 'Un tiroir optique, un panneau cuivre et deux serveurs. Ne mélangez pas les fibres et le cuivre : chaque cordon a son type.',
    },
    en: {
      title: 'Fibre and copper',
      brief: 'A fibre panel, a copper panel and two servers. Do not mix fibre and copper: each cord has its type.',
    },
  },
  l6: {
    fr: {
      title: 'Salle serveurs',
      brief: 'Deux panneaux, deux switchs, le cœur de réseau et les serveurs : 25 liaisons. Déposez ce qui gêne dans le bac, rebrassez proprement, et serrez les câbles en faisceaux.',
      tips: [
        'Suppr sur un câble : il est débranché et jeté dans le bac. Le Stock (0) fournit des cordons neufs, en nombre limité.',
        'Seulement 4 goulottes : choisissez les couloirs où elles servent le plus.',
      ],
    },
    en: {
      title: 'Server room',
      brief: 'Two panels, two switches, the network core and the servers: 25 links. Drop what is in the way into the crate, repatch cleanly, and strap the cords in bundles.',
      tips: [
        'Delete over a cord: it is unplugged and thrown into the crate. The Stock (0) provides new cords, in limited numbers.',
        'Only 4 ducts: choose the channels where they help most.',
      ],
    },
  },
  l7: {
    fr: {
      title: 'Migration',
      brief: 'Trois panneaux et trois switchs, une fibre vers l\'opérateur, beaucoup de ports à corriger. La migration se fait en production, avec un budget d\'interruption serré.',
      tips: ['Budget serré : rangez d\'abord les liaisons en production sans les débrancher. Avant de couper une liaison chère (Admin, Voix), posez-lui une dérivation (cliquez son ⚡ dans le plan).'],
    },
    en: {
      title: 'Migration',
      brief: 'Three panels and three switches, a fibre to the carrier, many ports to fix. The migration happens in production, on a tight downtime budget.',
      tips: ['Tight budget: tidy the links in production first, without unplugging them. Before cutting an expensive link (Admin, Voice), give it a bypass (click its ⚡ on the schedule).'],
    },
  },
  l8: {
    fr: {
      title: 'Le plat de spaghettis',
      brief: 'Le local technique que personne n\'ose ouvrir : quatre panneaux, quatre switchs, le pare-feu, le routeur, les serveurs. Les vieux cordons ne portent aucune marque : tracez-les pour savoir où ils vont. Bonne chance.',
    },
    en: {
      title: 'The spaghetti bowl',
      brief: 'The wiring closet nobody dares open: four panels, four switches, the firewall, the router, the servers. The old cords carry no mark: trace them to find where they go. Good luck.',
    },
  },
};

/** the puzzles, by id: a title and the idea, in a sentence */
const PUZZLES: Record<string, Words<LevelText>> = {
  p1: {
    fr: { title: 'Un geste', brief: 'Un cordon, un bout qui pend. Un seul trait de l\'outil Chemin suffit à le ranger et à le brancher.' },
    en: { title: 'One gesture', brief: 'One cord, one loose end. A single stroke of the Route tool is enough to lay it and plug it.' },
  },
  p2: {
    fr: { title: 'Deux bouts', brief: 'Deux bouts libres, deux gestes.' },
    en: { title: 'Two ends', brief: 'Two loose ends, two gestures.' },
  },
  p3: {
    fr: { title: 'L\'échange', brief: 'Deux cordons branchés chacun sur le port de l\'autre.' },
    en: { title: 'The swap', brief: 'Two cords, each plugged into the other\'s port.' },
  },
  p4: {
    fr: { title: 'Le support manquant', brief: 'Pas de guide-câbles : posez-le d\'abord, puis faites-y passer les cordons.' },
    en: { title: 'The missing support', brief: 'No cable manager: place it first, then run the cords through it.' },
  },
  p5: {
    fr: { title: 'Le faisceau', brief: 'Trois cordons, un seul velcro : un faisceau dans le guide-câbles.' },
    en: { title: 'The bundle', brief: 'Three cords, a single velcro: one bundle in the cable manager.' },
  },
  p6: {
    fr: { title: 'Le long chemin', brief: 'Le switch est loin sous le panneau : les goulottes descendent les cordons le long des montants.' },
    en: { title: 'The long way', brief: 'The switch is far below the panel: the ducts take the cords down along the posts.' },
  },
  p7: {
    fr: { title: 'Sous tension', brief: 'Une liaison est sur le mauvais port, en production, sur un budget minuscule : pas le temps d\'hésiter.' },
    en: { title: 'Live wire', brief: 'A link is in the wrong port, in production, on a tiny budget: no time to hesitate.' },
  },
  p8: {
    fr: { title: 'Dans le noir', brief: 'Des cordons sans marque, deux sur de mauvais ports. Tracez-les (T) avant de les toucher.' },
    en: { title: 'In the dark', brief: 'Unmarked cords, two in wrong ports. Trace them (T) before touching them.' },
  },
  p9: {
    fr: { title: 'Le câble muet', brief: 'Tout est branché comme prévu, et pourtant une liaison reste rouge. Testez (4), jetez, remplacez.' },
    en: { title: 'The silent cord', brief: 'Everything is plugged as planned, and yet a link stays red. Test (4), bin, replace.' },
  },
  p10: {
    fr: { title: 'Le courant', brief: 'Un serveur, ses deux alimentations, le bandeau électrique en bas : courant et données, chacun dans ses supports.' },
    en: { title: 'Power', brief: 'A server, its two power supplies, the power strip below: power and data, each in its own supports.' },
  },
};

/**
 * The career's tickets, in order: a title and what the client asks. The
 * client is Radio Pinède, a small local radio station of the south: a link
 * cut is dead air, and everybody hears it.
 */
const TICKETS: Words<LevelText>[] = [
  {
    fr: { title: 'Premier jour à Radio Pinède', brief: 'Radio Pinède, 98.4 FM, la radio de la côte depuis 1986. Le technicien d\'avant est parti à la retraite en laissant la baie comme un plat de nouilles et un post-it : « Bon courage ». La matinale est en direct pendant que vous travaillez : chaque coupure, ce sont des auditeurs qui entendent un blanc. Ce que vous rangez aujourd\'hui, vous le retrouverez à chaque visite.' },
    en: { title: 'First day at Radio Pinède', brief: 'Radio Pinède, 98.4 FM, the voice of the coast since 1986. The technician before you retired, leaving the cabinet like a bowl of noodles and a post-it: “Good luck”. The morning show is on air while you work: every cut is dead air for the listeners. What you tidy today, you will find again on every visit.' },
  },
  {
    fr: { title: 'La rédaction s\'installe', brief: 'Six journalistes rejoignent la radio pour le journal de midi. Six postes à brasser du panneau A au switch S. Le stagiaire a déjà tiré les cordons « pour aider ». Merci, le stagiaire.' },
    en: { title: 'The newsroom moves in', brief: 'Six journalists join the station for the midday news. Six desks to patch from panel A to switch S. The intern has already run the cords “to help”. Thank you, intern.' },
  },
  {
    fr: { title: 'Quarante ans de cassettes', brief: 'La directrice a fait numériser toutes les archives : quarante ans d\'émissions, de jingles et d\'interviews de maires. Le serveur qui les garde arrive en bas de la baie, sous son propre bandeau électrique : ses deux alimentations vont au bandeau, ses deux cartes réseau au switch S. Il porte le stockage : le couper, c\'est faire taire 1986 à 2026.' },
    en: { title: 'Forty years of tapes', brief: 'The director had all the archives digitised: forty years of shows, jingles and interviews with mayors. The server that keeps them arrives at the bottom of the cabinet, under its own power strip: its two supplies go to the strip, its two network cards to switch S. It carries the storage: cutting it silences 1986 to 2026.' },
  },
  {
    fr: { title: 'Le collègue du son', brief: 'Deux nouveaux postes pour la régie son, et Gérard, l\'ingénieur du son, qui vient « juste chercher un câble » dans la baie pendant que vous y êtes. Il débranche ce qu\'il ne faut pas, et le standard appelle : rebranchez avant la fin du compte à rebours.' },
    en: { title: 'The sound engineer', brief: 'Two new desks for the sound control room, and Gérard, the sound engineer, who comes to “just grab a cable” from the cabinet while you are at it. He unplugs what he should not, and the switchboard calls: plug it back before the countdown ends.' },
  },
  {
    fr: { title: 'L\'émission de nuit déménage', brief: 'L\'émission de nuit change de studio : quatre liaisons ne servent plus (leurs cordons sont encore branchés : au bac), quatre nouvelles les remplacent. L\'animateur, lui, est déjà à l\'antenne : ne coupez pas ce qui sert encore.' },
    en: { title: 'The night show moves', brief: 'The night show changes studios: four links are out of service (their cords are still plugged: into the crate), four new ones replace them. The host, for his part, is already on air: do not cut what is still in use.' },
  },
  {
    fr: { title: 'Un cordon fatigué', brief: 'Deux postes de plus à la rédaction, et une liaison qui reste rouge alors qu\'elle est branchée comme prévu : un vieux cordon, coupé à l\'intérieur. Le Testeur (4) dit lequel ; jetez-le au bac et remplacez-le par un neuf du Stock.' },
    en: { title: 'A tired cord', brief: 'Two more desks in the newsroom, and a link that stays red though it is plugged as planned: an old cord, broken inside. The Tester (4) tells which one; throw it in the crate and replace it with a new one from the Stock.' },
  },
  {
    fr: { title: 'Le festival de la pinède', brief: 'Trois jours de concerts sous les pins, retransmis en direct. Un deuxième panneau et son switch sont installés sous le premier pour la régie mobile : huit liaisons à créer, et le switch T à relier au pare-feu. Les techniciens son passeront derrière vous ; laissez-leur une baie lisible.' },
    en: { title: 'The pine forest festival', brief: 'Three days of concerts under the pines, broadcast live. A second panel and its switch are installed under the first for the mobile control room: eight links to make, and switch T to link to the firewall. The sound crew will come after you; leave them a cabinet they can read.' },
  },
  {
    fr: { title: 'Le studio de la matinale', brief: 'La matinale refait son studio : trois liaisons de plus. Les techniciens du festival ont apprécié votre travail et vous laissent des velcros. Pour ★★★, un faisceau : au moins trois cordons d\'un même service, serrés dans un guide-câbles ou une goulotte.' },
    en: { title: 'The morning studio', brief: 'The morning show redoes its studio: three links more. The festival crew liked your work and leave you some velcro. For ★★★, a bundle: at least three cords of one service, strapped in a cable manager or a duct.' },
  },
  {
    fr: { title: 'La nuit de l\'orage', brief: 'La foudre est tombée sur l\'antenne cette nuit. De vieux cordons n\'ont pas survécu, et le standard sonne sans arrêt. Testez, remplacez, rétablissez : la matinale commence dans une heure.' },
    en: { title: 'The night of the storm', brief: 'Lightning struck the mast last night. Some old cords did not survive, and the switchboard will not stop ringing. Test, replace, restore: the morning show starts in an hour.' },
  },
  {
    fr: { title: 'Radio Pinède sur internet', brief: 'La radio s\'écoute désormais partout, même à Montréal où vit le cousin du présentateur météo. Le serveur de diffusion se branche sur le switch T. Pour ★★★, deux faisceaux de velcro : le streaming ne pardonne pas le désordre.' },
    en: { title: 'Radio Pinède goes online', brief: 'The station can now be heard anywhere, even in Montreal where the weatherman\'s cousin lives. The streaming server plugs into switch T. For ★★★, two velcro bundles: streaming does not forgive a mess.' },
  },
  {
    fr: { title: 'La soirée électorale', brief: 'Dimanche soir, résultats des municipales en direct, avec un plateau dans chaque mairie du canton. Deux liaisons ne servent plus, trois nouvelles pour les correspondants. Le budget d\'interruption n\'a jamais été aussi serré : rangez autour de ce qui marche, sans le couper.' },
    en: { title: 'Election night', brief: 'Sunday night, the local election results live, with a set in every town hall of the district. Two links are out of service, three new ones for the correspondents. The downtime budget has never been this tight: tidy around what works, without cutting it.' },
  },
  {
    fr: { title: 'Le direct des 40 ans', brief: 'Ce soir, Radio Pinède fête ses 40 ans en direct, avec le maire, la fanfare et tous les anciens animateurs. Rien de nouveau dans la baie : tout doit être impeccable, serré en quatre faisceaux au moins. Pas un blanc à l\'antenne.' },
    en: { title: 'The 40th anniversary, live', brief: 'Tonight Radio Pinède celebrates its 40 years live, with the mayor, the brass band and every former host. Nothing new in the cabinet: everything must be spotless, strapped in four bundles at least. Not a second of dead air.' },
  },
];

/** the career's tickets that have their words (a test checks every one does) */
export function hasTicketText(index: number): boolean {
  return index < TICKETS.length;
}

/** the campaign levels and the puzzles that have their words (a test checks every one does) */
export function hasLevelText(id: string): boolean {
  return id in CAMPAIGN || id in PUZZLES;
}

function textOf(level: LevelDef): LevelText {
  switch (level.kind) {
    case 'campaign': return tr(CAMPAIGN[level.id]);
    case 'puzzle': return tr(PUZZLES[level.id]);
    case 'ticket': {
      const text = tr(TICKETS[level.ticket]);
      return { ...text, title: tr({ fr: `Ticket ${level.ticket + 1} · ${text.title}`, en: `Ticket ${level.ticket + 1} · ${text.title}` }) };
    }
    case 'tutorial': return { title: tr({ fr: 'Tutoriel', en: 'Tutorial' }), brief: '' };
    case 'free': return tr({
      fr: { title: `Partie libre — ${level.cables} câbles`, brief: 'Une baie générée au hasard.' },
      en: { title: `Free play — ${level.cables} cords`, brief: 'A cabinet generated at random.' },
    });
    case 'zen': return tr({
      fr: { title: `Partie libre zen — ${level.cables} câbles`, brief: `Une baie de ${level.cables} câbles, rien en production, pas de budget : prenez votre temps, en musique. Le matériel ne manque pas.` },
      en: { title: `Zen free play — ${level.cables} cords`, brief: `A cabinet of ${level.cables} cords, nothing in production, no budget: take your time, with music. There is material to spare.` },
    });
    case 'custom': return tr({
      fr: { title: `Baie sur mesure — ${level.cables} câbles`, brief: 'Une baie composée dans l\'éditeur. Son lien la partage telle quelle.' },
      en: { title: `Custom cabinet — ${level.cables} cords`, brief: 'A cabinet composed in the editor. Its link shares it as it is.' },
    });
    case 'daily': return tr({
      fr: { title: `Baie du jour n° ${level.number}`, brief: `La même baie pour tout le monde aujourd'hui : ${level.cables} câbles. Branchez, rangez, et comparez votre résultat.` },
      en: { title: `Cabinet of the day #${level.number}`, brief: `The same cabinet for everyone today: ${level.cables} cords. Plug, tidy, and compare your result.` },
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
