// What each level says to the player: its title, its brief, its own tips.
// The levels themselves (game/levels/) are data without a sentence: the
// campaign's words are here, by level id, and the generated levels get
// theirs from what they are.

import type { LevelDef } from '../game/levels/levelDef';
import { assertNever } from '../lib/assertNever';

interface LevelText {
  title: string;
  brief: string;
  tips?: string[];
}

const LENGTH_TIP = 'Un cordon trop long se remplace par un cordon neuf du Stock (0), qui arrive dans le bac : il faut couper la liaison le temps de changer. Le stock est compté : choisissez bien qui reçoit quel cordon.';

/** the campaign's levels, by id */
const CAMPAIGN: Record<string, LevelText> = {
  l1: {
    title: 'Premier brassage',
    brief: 'Quatre cordons pendent devant le switch, et l\'un d\'eux n\'est même plus branché. Rebranchez-le, puis couchez-les dans le guide-câbles pour dégager la façade.',
    tips: [
      'Glissez un câble avec le clic gauche pour le déplacer. Maj en tirant : le pousser vers le fond ou le ramener vers vous.',
      'Le bout qui pend : saisissez son connecteur et relâchez-le devant le port entouré du plan (survolez sa ligne).',
      'Outil Chemin (C) : partez d\'un câble et tracez son chemin par-dessus le guide-câbles, jusqu\'à un port libre si besoin : il y est posé, et branché.',
      'Clic droit + glisser pour tourner la vue, glisser dans le vide pour la déplacer, molette pour zoomer.',
    ],
  },
  l2: {
    title: 'Le mou',
    brief: 'Les cordons sont beaucoup trop longs, et l\'un d\'eux est sur le mauvais port. Corrigez-le, puis remplacez les cordons par d\'autres à la bonne longueur, ou rangez le surplus dans une goulotte.',
    tips: [
      LENGTH_TIP,
      'Le guide-câbles se pose dans une unité vide ; la goulotte dans un couloir latéral.',
    ],
  },
  l3: {
    title: 'Erreurs de brassage',
    brief: 'Quelqu\'un a brassé à l\'aveugle et a relié le pare-feu au hasard. Suivez le plan : rebranchez chaque cordon sur le bon port, puis rangez.',
    tips: [
      'Saisissez un connecteur et tirez pour le débrancher, relâchez-le devant un port libre pour le brancher. Ctrl+Z annule le dernier geste.',
      'Traceur : survolez un câble et appuyez sur T, il clignote et ses deux ports s\'entourent.',
      'Survolez une ligne du plan pour voir ses deux ports.',
    ],
  },
  l4: {
    title: 'Étiquetage',
    brief: 'Pare-feu, routeur, switch : chaque liaison doit porter l\'étiquette de son service aux deux bouts.',
    tips: ['Chaque liaison appartient à un service (sa couleur dans le plan). Un cordon branché comme prévu reçoit son étiquette tout seul. Couper la Voix ou l\'Admin coûte bien plus cher que les Données.', LENGTH_TIP],
  },
  l5: {
    title: 'Fibre et cuivre',
    brief: 'Un tiroir optique, un panneau cuivre et deux serveurs. Ne mélangez pas les fibres et le cuivre : chaque cordon a son type.',
  },
  l6: {
    title: 'Salle serveurs',
    brief: 'Deux panneaux, deux switchs, le cœur de réseau et les serveurs : 25 liaisons. Déposez ce qui gêne dans le bac, rebrassez proprement, et serrez les câbles en faisceaux.',
    tips: [
      'Suppr sur un câble : il est débranché et jeté dans le bac. Le Stock (0) fournit des cordons neufs, en nombre limité.',
      '<b>Faisceaux</b> : pour ★★★, au moins 3 velcros qui serrent chacun 3 câbles ou plus, dans un guide-câbles ou une goulotte.',
      'Seulement 4 goulottes : choisissez les couloirs où elles servent le plus.',
    ],
  },
  l7: {
    title: 'Migration',
    brief: 'Trois panneaux et trois switchs, une fibre vers l\'opérateur, beaucoup de ports à corriger. La migration se fait en production, avec un budget d\'interruption serré.',
    tips: ['Budget serré : rangez d\'abord les liaisons en production sans les débrancher. Avant de couper une liaison chère (Admin, Voix), posez-lui une dérivation (cliquez son ⚡ dans le plan).'],
  },
  l8: {
    title: 'Le plat de spaghettis',
    brief: 'Le local technique que personne n\'ose ouvrir : quatre panneaux, quatre switchs, le pare-feu, le routeur, les serveurs. Les vieux cordons ne portent aucune marque : tracez-les pour savoir où ils vont. Bonne chance.',
    tips: ['Cordons sans marque : survolés, ils ne disent pas où ils vont. Le Traceur (T sur un câble) le révèle, et un cordon branché comme prévu se reconnaît tout seul.'],
  },
};

/** the campaign levels that have their words (a test checks every level does) */
export function hasCampaignText(id: string): boolean {
  return id in CAMPAIGN;
}

function textOf(level: LevelDef): LevelText {
  switch (level.kind) {
    case 'campaign': return CAMPAIGN[level.id];
    case 'tutorial': return { title: 'Tutoriel', brief: '' };
    case 'free': return { title: `Partie libre — ${level.cables} câbles`, brief: 'Une baie générée au hasard.' };
    case 'showcase': return { title: 'Avant / Après', brief: '' };
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
  return textOf(level).tips ?? [];
}
