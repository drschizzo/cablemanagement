// The words written in index.html itself: each element names its text by a
// key (data-i18n for its content, data-i18n-title, -aria, -alt for its
// attributes), written here in every language. A test checks the page and
// this table name the same keys.

import { language, tr, type Words } from './language';

export const PAGE_TEXTS: Record<string, Words> = {
  'common.back': { fr: '← Retour', en: '← Back' },
  'common.home': { fr: 'Accueil', en: 'Home' },
  'common.levels': { fr: 'Niveaux', en: 'Levels' },
  'common.settings': { fr: 'Paramètres', en: 'Settings' },
  'common.tutorial': { fr: 'Tutoriel', en: 'Tutorial' },
  'common.cancel': { fr: 'Annuler', en: 'Cancel' },
  'common.before': { fr: 'Avant', en: 'Before' },
  'common.after': { fr: 'Après', en: 'After' },
  'top.menu': { fr: '☰ Menu', en: '☰ Menu' },
  'top.menuTip': { fr: 'Menu (Échap)', en: 'Menu (Esc)' },
  'top.view': { fr: '⟲ Vue', en: '⟲ View' },
  'top.viewTip': { fr: 'Vue de face (R)', en: 'Front view (R)' },
  'top.soundTip': { fr: 'Son (M)', en: 'Sound (M)' },
  'top.helpTip': { fr: 'Consignes', en: 'Instructions' },
  'side.schedule': { fr: 'Plan de brassage', en: 'Patching schedule' },
  'side.link': { fr: 'Liaison', en: 'Link' },
  'side.cord': { fr: 'Fibre', en: 'Cord' },
  'side.service': { fr: 'Service', en: 'Service' },
  'side.state': { fr: 'État', en: 'State' },
  'side.clean': { fr: 'Propreté', en: 'Tidiness' },
  'side.cleanTip': { fr: 'Propreté de la baie : branchements, rangement, façade, mou', en: 'How tidy the cabinet is: plugging, routing, front, slack' },
  'side.legend': {
    fr: '<i class="s-conn ok"></i>branchée <i class="s-route ok"></i>rangée <i class="s-clear ok"></i>façade <i class="s-relax ok"></i>sans tension',
    en: '<i class="s-conn ok"></i>plugged <i class="s-route ok"></i>routed <i class="s-clear ok"></i>front <i class="s-relax ok"></i>relaxed',
  },
  'side.connections': { fr: 'Connexions', en: 'Connections' },
  'side.routing': { fr: 'Rangement', en: 'Routing' },
  'side.front': { fr: 'Façade', en: 'Front' },
  'side.relaxed': { fr: 'Sans tension', en: 'Relaxed' },
  'side.relaxedTip': { fr: 'Un cordon bien plus court que son chemin rangé est tendu ; une fibre en angle vif est pliée', en: 'A cord much shorter than its tidy route is taut; a fibre bent at a sharp angle is kinked' },
  'side.bundles': { fr: 'Faisceaux', en: 'Bundles' },
  'side.bundlesTip': { fr: 'Velcros serrant au moins 3 câbles, dans un guide-câbles ou une goulotte', en: 'Velcros round 3 cords or more, in a cable manager or a duct' },
  'prep.text': {
    fr: '<b>Préparation</b> — la baie est figée et le chrono arrêté : lisez le plan, posez vos supports (guide-câbles, goulottes, anneaux) là où les câbles passeront.',
    en: '<b>Preparation</b> — the cabinet stands still and the clock waits: read the schedule, place your supports (cable managers, ducts, rings) where the cords will run.',
  },
  'prep.go': { fr: 'Lancer le chantier ▶', en: 'Start the job ▶' },
  'menu.title': { fr: 'Niveaux', en: 'Levels' },
  'menu.sub': { fr: 'Deux étoiles à un niveau ouvrent le suivant.', en: 'Two stars on a level open the next one.' },
  'menu.free': { fr: 'Partie libre :', en: 'Free play:' },
  'menu.puzzles': { fr: 'Puzzles express', en: 'Express puzzles' },
  'menu.puzzlesSub': { fr: 'Une idée par baie, à résoudre en peu de gestes. Tous ouverts.', en: 'One idea per cabinet, to solve in few gestures. All open.' },
  'menu.freeGo': { fr: 'Générer une baie', en: 'Generate a cabinet' },
  'menu.zen': { fr: 'Mode zen', en: 'Zen mode' },
  'menu.zenTip': { fr: 'Une grande baie, sans chrono ni budget, en musique', en: 'A big cabinet, no clock, no budget, with music' },
  'brief.go': { fr: 'Commencer', en: 'Start' },
  'result.title': { fr: 'Baie validée', en: 'Cabinet signed off' },
  'result.beforeAlt': { fr: 'La baie au départ', en: 'The cabinet at the start' },
  'result.afterAlt': { fr: 'La baie validée', en: 'The cabinet signed off' },
  'result.again': { fr: 'Continuer à ranger', en: 'Keep tidying' },
  'title.kicker': { fr: 'Un jeu de câblage réseau', en: 'A network cabling game' },
  'title.tagline': { fr: 'Démêlez, rebranchez, rangez.', en: 'Untangle, replug, tidy up.' },
  'showcase.switch': { fr: 'Avant / après', en: 'Before / after' },
  'showcase.another': { fr: 'Tirer d\'autres baies au hasard', en: 'Draw other cabinets at random' },
  'tuto.skip': { fr: 'Passer le tutoriel', en: 'Skip the tutorial' },
  'tuto.prev': { fr: '← Précédent', en: '← Previous' },
  'tuto.play': { fr: 'Jouer le niveau 1 →', en: 'Play level 1 →' },
  'pause.title': { fr: 'Pause', en: 'Paused' },
  'pause.resume': { fr: 'Reprendre', en: 'Resume' },
  'pause.help': { fr: 'Consignes du niveau', en: 'Level instructions' },
  'pause.restart': { fr: 'Recommencer le niveau', en: 'Restart the level' },
  'pause.levels': { fr: 'Choisir un niveau', en: 'Choose a level' },
  'pause.home': { fr: 'Retour à l\'accueil', en: 'Back to the title screen' },
  'confirm.lost': { fr: 'La baie en cours sera perdue.', en: 'The cabinet under way will be lost.' },
  'settings.language': { fr: 'Langue', en: 'Language' },
  'settings.quality': { fr: 'Qualité de l\'image', en: 'Image quality' },
  'settings.reset': { fr: 'Revenir à la meilleure image, puis ajuster', en: 'Back to the best image, then adjust' },
  'settings.details': { fr: 'Réglages détaillés', en: 'Detailed settings' },
  'settings.ratio': { fr: 'Définition', en: 'Resolution' },
  'settings.shadows': { fr: 'Ombres', en: 'Shadows' },
  'settings.ao': { fr: 'Occlusion ambiante', en: 'Ambient occlusion' },
  'settings.ssr': { fr: 'Reflets au sol', en: 'Floor reflections' },
  'settings.sound': { fr: 'Son', en: 'Sound' },
  'settings.effects': { fr: 'Effets sonores', en: 'Sound effects' },
  'settings.music': { fr: 'Musique d\'ambiance (mode zen)', en: 'Ambient music (zen mode)' },
  loading: { fr: 'Emmêlage des câbles…', en: 'Tangling the cords…' },
};

/** the attributes a key may write, besides the content */
const ATTRIBUTES = { title: 'title', aria: 'aria-label', alt: 'alt' } as const;

/** writes every text of the page in the language being spoken */
export function writePageTexts(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) el.innerHTML = pageText(el.dataset.i18n!);
  for (const [data, attribute] of Object.entries(ATTRIBUTES)) {
    for (const el of root.querySelectorAll<HTMLElement>(`[data-i18n-${data}]`)) el.setAttribute(attribute, pageText(el.getAttribute(`data-i18n-${data}`)!));
  }
  document.documentElement.lang = language();
}

/** a text of the page; a key it does not know fails loudly */
export function pageText(key: string): string {
  const words = PAGE_TEXTS[key];
  if (!words) throw new Error(`no text for the page key "${key}" (ui/pageTexts.ts)`);
  return tr(words);
}
