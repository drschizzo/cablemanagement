// The words written in index.html itself: each element names its text by a
// key (data-i18n for its content, data-i18n-title, -aria, -alt for its
// attributes), written here in every language. A test checks the page and
// this table name the same keys.

import { language, tr, type Words } from '../lib/language';

export const PAGE_TEXTS: Record<string, Words> = {
  'common.back': { fr: '← Retour', en: '← Back' },
  'common.home': { fr: 'Accueil', en: 'Home' },
  'common.modes': { fr: 'Modes de jeu', en: 'Game modes' },
  'common.settings': { fr: 'Paramètres', en: 'Settings' },
  'common.tutorial': { fr: 'Tutoriel', en: 'Tutorial' },
  'common.cancel': { fr: 'Annuler', en: 'Cancel' },
  'common.notebook': { fr: 'Carnet du technicien', en: 'Technician\'s notebook' },
  'career.title': { fr: 'Carrière · Radio Pinède, 98.4 FM', en: 'Career · Radio Pinède, 98.4 FM' },
  'career.sub': { fr: 'Une petite radio locale, une seule baie, douze tickets. Vous la retrouvez à chaque visite telle que vous l\'avez laissée ; et une liaison coupée, c\'est un blanc à l\'antenne.', en: 'A small local radio station, one cabinet, twelve tickets. On every visit you find it as you left it; and a link cut is dead air.' },
  'career.over': { fr: 'Carrière terminée : les 40 ans sont passés en direct sans un blanc. La directrice vous offre un mug Radio Pinède. Bravo !', en: 'Career over: the 40th anniversary went out live without a second of dead air. The director gives you a Radio Pinède mug. Well done!' },
  'career.reset': { fr: 'Recommencer la carrière', en: 'Start the career over' },
  'notebook.sub': { fr: 'Ce que les techniciens d\'avant ont laissé dans les baies, et où chercher le reste.', en: 'What the technicians before you left in the cabinets, and where to look for the rest.' },
  'notebook.finds': { fr: 'Trouvailles', en: 'Finds' },
  'notebook.looks': { fr: 'En prime : les teintes', en: 'A bonus: the colours' },
  'notebook.stars': { fr: 'Chaque couleur s\'ouvre avec les étoiles gagnées. Vous en avez', en: 'Each colour opens with the stars won. You have' },
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
  'side.cord': { fr: 'Type', en: 'Type' },
  'side.service': { fr: 'Service', en: 'Service' },
  'side.state': { fr: 'État', en: 'State' },
  'side.stars': { fr: 'Les étoiles', en: 'The stars' },
  'side.legend': {
    fr: '<i class="s-conn ok"></i>branchée <i class="s-tidy ok"></i>câble rangé : dans les supports, devant aucun port, ni tendu ni plié',
    en: '<i class="s-conn ok"></i>plugged <i class="s-tidy ok"></i>tidy: in the supports, off the front, neither taut nor kinked',
  },
  'prep.text': {
    fr: '<b>Préparation</b> — la baie est figée et le chrono arrêté : lisez le plan, posez vos supports (guide-câbles, goulottes) là où les câbles passeront.',
    en: '<b>Preparation</b> — the cabinet stands still and the clock waits: read the schedule, place your supports (cable managers, ducts) where the cords will run.',
  },
  'prep.go': { fr: 'Lancer le chantier ▶', en: 'Start the job ▶' },
  'free.title': { fr: 'Baie libre', en: 'Free cabinet' },
  'free.sub': { fr: 'Jouez une des grandes baies, ou réglez la vôtre. Chaque partie tire un nouveau désordre.', en: 'Play one of the big cabinets, or set up your own. Each game draws a new mess.' },
  'free.ready': { fr: 'Grandes baies', en: 'Big cabinets' },
  'free.units': { fr: 'Équipement', en: 'Equipment' },
  'free.rules': { fr: 'Votre baie', en: 'Your cabinet' },
  'free.services': { fr: 'Services', en: 'Services' },
  'free.cords': { fr: 'Câbles', en: 'Cords' },
  'free.add': { fr: 'Ajouter en bas', en: 'Add at the bottom' },
  'free.difficulty': { fr: 'Désordre au départ', en: 'Mess at the start' },
  'free.production': { fr: 'En production', en: 'In production' },
  'free.play': { fr: 'Jouer →', en: 'Play →' },
  'free.code': { fr: 'Collez un lien ou un code de baie', en: 'Paste a link or a cabinet code' },
  'free.open': { fr: 'Ouvrir', en: 'Open' },
  'brief.go': { fr: 'Commencer', en: 'Start' },
  'brief.tips': { fr: 'À savoir', en: 'Good to know' },
  'brief.supplies': { fr: 'Matériel', en: 'Supplies' },
  'result.title': { fr: 'Baie validée', en: 'Cabinet signed off' },
  'result.beforeAlt': { fr: 'La baie au départ', en: 'The cabinet at the start' },
  'result.afterAlt': { fr: 'La baie validée', en: 'The cabinet signed off' },
  'result.again': { fr: 'Continuer à ranger', en: 'Keep tidying' },
  'result.replay': { fr: '▶ Revoir le chantier', en: '▶ Replay the job' },
  'result.image': { fr: '⤓ Image avant / après', en: '⤓ Before / after image' },
  'timelapse.title': { fr: 'Le chantier en accéléré', en: 'The job, sped up' },
  'title.kicker': { fr: 'Un jeu de câblage réseau', en: 'A network cabling game' },
  'title.tagline': { fr: 'Démêlez, rebranchez, rangez.', en: 'Untangle, replug, tidy up.' },
  'showcase.switch': { fr: 'Avant / après', en: 'Before / after' },
  'showcase.another': { fr: 'Tirer d\'autres baies au hasard', en: 'Draw other cabinets at random' },
  'tuto.skip': { fr: 'Passer le tutoriel', en: 'Skip the tutorial' },
  'tuto.prev': { fr: '← Précédent', en: '← Previous' },
  'tuto.play': { fr: 'Jouer le niveau 1 →', en: 'Play level 1 →' },
  'tuto.more': { fr: 'Gestes avancés', en: 'Finer gestures' },
  'pause.title': { fr: 'Pause', en: 'Paused' },
  'pause.resume': { fr: 'Reprendre', en: 'Resume' },
  'pause.help': { fr: 'Consignes du niveau', en: 'Level instructions' },
  'pause.restart': { fr: 'Recommencer le niveau', en: 'Restart the level' },
  'pause.levels': { fr: 'Autre niveau, autre mode', en: 'Another level or mode' },
  'pause.home': { fr: 'Retour à l\'accueil', en: 'Back to the title screen' },
  'settings.language': { fr: 'Langue', en: 'Language' },
  'settings.quality': { fr: 'Qualité de l\'image', en: 'Image quality' },
  'settings.reset': { fr: 'Revenir à la meilleure image, puis ajuster', en: 'Back to the best image, then adjust' },
  'settings.details': { fr: 'Réglages détaillés', en: 'Detailed settings' },
  'settings.ratio': { fr: 'Définition', en: 'Resolution' },
  'settings.shadows': { fr: 'Ombres', en: 'Shadows' },
  'settings.ao': { fr: 'Occlusion ambiante', en: 'Ambient occlusion' },
  'settings.ssr': { fr: 'Reflets au sol', en: 'Floor reflections' },
  'settings.hdr': { fr: 'Image HDR : les lumières plus vives que le blanc', en: 'HDR image: lights brighter than white' },
  'settings.hdrLevel': { fr: 'Intensité des lumières', en: 'Brightness of the lights' },
  'settings.hdrAuto': { fr: 'Revenir à l\'automatique', en: 'Back to automatic' },
  'settings.sound': { fr: 'Son', en: 'Sound' },
  'settings.effects': { fr: 'Effets sonores', en: 'Sound effects' },
  'settings.music': { fr: 'Musique d\'ambiance (baie libre hors production)', en: 'Ambient music (free cabinet out of production)' },
  loading: { fr: 'Emmêlage des câbles…', en: 'Tangling the cords…' },
};

/** the attributes a key may write, besides the content */
const ATTRIBUTES = { title: 'title', aria: 'aria-label', alt: 'alt', placeholder: 'placeholder' } as const;

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
