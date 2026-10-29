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
      tips: [LENGTH_TIP.fr, 'Le guide-câbles se pose dans une unité vide ; la goulotte dans un couloir latéral.'],
    },
    en: {
      title: 'Slack',
      brief: 'The cords are far too long, and one of them is in the wrong port. Fix it, then swap the cords for others of the right length, or stow the extra in a duct.',
      tips: [LENGTH_TIP.en, 'A cable manager goes in an empty unit; a duct in a side channel.'],
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
      title: 'Étiquetage',
      brief: 'Pare-feu, routeur, switch : chaque liaison doit porter l\'étiquette de son service aux deux bouts.',
      tips: ['Chaque liaison appartient à un service (sa couleur dans le plan). Un cordon branché comme prévu reçoit son étiquette tout seul. Couper la Voix ou l\'Admin coûte bien plus cher que les Données.', LENGTH_TIP.fr],
    },
    en: {
      title: 'Labelling',
      brief: 'Firewall, router, switch: each link must carry its service\'s label at both ends.',
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
        '<b>Faisceaux</b> : pour ★★★, au moins 3 velcros qui serrent chacun 3 câbles ou plus, dans un guide-câbles ou une goulotte.',
        'Seulement 4 goulottes : choisissez les couloirs où elles servent le plus.',
      ],
    },
    en: {
      title: 'Server room',
      brief: 'Two panels, two switches, the network core and the servers: 25 links. Drop what is in the way into the crate, repatch cleanly, and strap the cords in bundles.',
      tips: [
        'Delete over a cord: it is unplugged and thrown into the crate. The Stock (0) provides new cords, in limited numbers.',
        '<b>Bundles</b>: for ★★★, at least 3 velcros strapping 3 cords or more each, in a cable manager or a duct.',
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
      tips: ['Cordons sans marque : survolés, ils ne disent pas où ils vont. Le Traceur (T sur un câble) le révèle, et un cordon branché comme prévu se reconnaît tout seul.'],
    },
    en: {
      title: 'The spaghetti bowl',
      brief: 'The wiring closet nobody dares open: four panels, four switches, the firewall, the router, the servers. The old cords carry no mark: trace them to find where they go. Good luck.',
      tips: ['Unmarked cords: hovered, they do not say where they go. The Tracer (T over a cord) reveals it, and a cord plugged as planned is recognised by itself.'],
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
};

/** the career's tickets, in order: a title and what the client asks */
const TICKETS: Words<LevelText>[] = [
  {
    fr: { title: 'Premier jour chez Lumen', brief: 'L\'Imprimerie Lumen vous confie sa baie. Le technicien d\'avant est parti sans laisser d\'adresse, ni de baie rangée. Remettez de l\'ordre : ce que vous rangez aujourd\'hui, vous le retrouverez à chaque visite.' },
    en: { title: 'First day at Lumen', brief: 'Lumen Printing hands you its cabinet. The technician before left no address, and no tidy cabinet. Put it in order: what you tidy today, you will find again on every visit.' },
  },
  {
    fr: { title: 'Les nouveaux bureaux', brief: 'L\'atelier s\'agrandit : six postes de plus à brasser du panneau A au switch S. Le stagiaire a déjà tiré les cordons… à sa façon.' },
    en: { title: 'The new offices', brief: 'The workshop grows: six more desks to patch from panel A to switch S. The intern has already run the cords… his own way.' },
  },
  {
    fr: { title: 'Le serveur de fichiers', brief: 'Un serveur arrive en bas de la baie : ses deux cartes réseau vont sur le switch S. Il porte le stockage.' },
    en: { title: 'The file server', brief: 'A server arrives at the bottom of the cabinet: its two network cards go to switch S. It carries the storage.' },
  },
  {
    fr: { title: 'La compta déménage', brief: 'La comptabilité change d\'étage : quatre liaisons ne servent plus (leurs cordons sont encore branchés : au bac), quatre nouvelles les remplacent. Et le téléphone va sonner.' },
    en: { title: 'Accounting moves', brief: 'Accounting changes floors: four links are out of service (their cords are still plugged: into the crate), four new ones replace them. And the phone will ring.' },
  },
  {
    fr: { title: 'Deuxième panneau', brief: 'Un deuxième panneau et son switch sont installés sous le premier. Huit liaisons à créer, et le switch T à relier au pare-feu.' },
    en: { title: 'Second panel', brief: 'A second panel and its switch are installed under the first. Eight links to make, and switch T to link to the firewall.' },
  },
  {
    fr: { title: 'Lundi noir', brief: 'Rien ne va : de vieux cordons ont lâché, et les utilisateurs appellent. Testez, remplacez, rétablissez.' },
    en: { title: 'Black Monday', brief: 'Nothing works: old cords have given up, and users are calling. Test, replace, restore.' },
  },
  {
    fr: { title: 'Le second serveur', brief: 'Un second serveur, branché sur le switch T. Pour ★★★, deux faisceaux de velcro.' },
    en: { title: 'The second server', brief: 'A second server, plugged into switch T. For ★★★, two velcro bundles.' },
  },
  {
    fr: { title: 'L\'audit', brief: 'Un auditeur passe demain. Rien de nouveau : tout doit être impeccable, serré en quatre faisceaux au moins.' },
    en: { title: 'The audit', brief: 'An auditor comes tomorrow. Nothing new: everything must be spotless, strapped in four bundles at least.' },
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
      fr: { title: 'Mode zen', brief: `Une grande baie de ${level.cables} câbles, rien en production, pas de chrono : prenez votre temps. Le matériel ne manque pas.` },
      en: { title: 'Zen mode', brief: `A big cabinet of ${level.cables} cords, nothing in production, no clock: take your time. There is material to spare.` },
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

/** the level's own tips (those of its rules are added by the brief) */
export function levelTips(level: LevelDef): string[] {
  return [...(textOf(level).tips ?? [])];
}
