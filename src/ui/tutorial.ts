// The guided tutorial: what each piece of the cabinet is for, and how to
// handle the cords. A card walks through the steps; the 3D scene frames the
// piece being described, and steps with a task tick themselves off when the
// player has done it (any step can be skipped).

import type { Controller, Tool } from '../play/controller';
import { COLUMN_X, SIDE_BACK, SIDE_IN, SIDE_OUT, U, WALL_X, insideBox } from '../game/rack';
import { sfx } from '../audio/sfx';
import { save } from './storage';
import { $ } from '../lib/page';
import { onLanguageChange, tr, type Words } from './language';

type Box = { min: [number, number, number]; max: [number, number, number] };

interface Step {
  title: Words;
  text: Words;
  task?: Words;
  spot?: (ctl: Controller) => Box | null;
  tool?: Tool;
  enter?: (ctl: Controller) => void;
  done?: (ctl: Controller) => boolean;
}

const unitBox = (ctl: Controller, kind: string): Box | null => {
  const rack = ctl.world.rack;
  const k = rack.units.findIndex((u) => u.kind === kind);
  if (k < 0) return null;
  return { min: [-COLUMN_X + 0.005, rack.unitBottom(k) - 0.002, -0.004], max: [COLUMN_X - 0.005, rack.unitBottom(k) + U + 0.002, 0.075] };
};

const mgrBox = (ctl: Controller): Box | null => {
  const rack = ctl.world.rack;
  const it = rack.items.find((i) => i.kind === 'fingerManager');
  if (!it) return null;
  return { min: [-COLUMN_X + 0.005, rack.unitBottom(it.unit), -0.004], max: [COLUMN_X - 0.005, rack.unitBottom(it.unit) + U, 0.08] };
};

/** the panel and the manager under it: where a cord leaves its port and turns down into the fingers */
const portToMgrBox = (ctl: Controller): Box | null => {
  const p = unitBox(ctl, 'panel'), m = mgrBox(ctl);
  if (!p || !m) return p ?? m;
  return { min: [p.min[0], Math.min(p.min[1], m.min[1]), p.min[2]], max: [p.max[0], Math.max(p.max[1], m.max[1]), 0.09] };
};

const sideBox = (ctl: Controller): Box => {
  const rack = ctl.world.rack;
  return { min: [SIDE_IN, rack.unitBottom(rack.units.length - 2), SIDE_BACK], max: [SIDE_OUT, rack.topY - U, 0.075] };
};

/** nodes of any cord inside the holding volume of an item kind */
function held(ctl: Controller, kind: 'fingerManager' | 'duct'): number {
  const w = ctl.world;
  const ids = new Set(w.rack.items.filter((i) => i.kind === kind).map((i) => i.id));
  const boxes = w.rack.supports().filter((s) => ids.has(s.item));
  let best = 0;
  for (const cb of w.cables) {
    let n = 0;
    for (let k = 6; k < cb.count - 6; k++) {
      const i = cb.start + k;
      if (boxes.some((s) => insideBox(s, ...w.nodePosition(i)))) n++;
    }
    best = Math.max(best, n);
  }
  return best;
}

const STEPS: Step[] = [
  {
    title: { fr: 'Bienvenue dans la baie', en: 'Welcome to the cabinet' },
    text: {
      fr: 'Voici une baie de brassage 19 pouces. Les équipements s\'y empilent en <b>unités</b> (1U = 4,45 cm). Votre métier : brancher chaque liaison sur les bons ports, puis ranger les câbles pour que la baie reste lisible et accessible.',
      en: 'This is a 19-inch patching cabinet. The equipment is stacked in <b>units</b> (1U = 4.45 cm). Your job: plug each link into the right ports, then tidy the cords so the cabinet stays readable and accessible.',
    },
    spot: (ctl) => ({ min: [-WALL_X, ctl.world.rack.floorY, -0.06], max: [WALL_X, ctl.world.rack.topY, 0.09] }),
  },
  {
    title: { fr: 'Le tiroir optique', en: 'The fibre panel' },
    text: {
      fr: 'Le <b>tiroir optique</b> (ici « A ») reçoit les fibres qui arrivent du bâtiment ou d\'une autre salle. Chaque port est l\'extrémité d\'une fibre, sur laquelle on branche une jarretière.',
      en: 'The <b>fibre panel</b> (here “A”) takes the fibres coming from the building or another room. Each port is the end of a fibre, into which a patch cord is plugged.',
    },
    spot: (ctl) => unitBox(ctl, 'panel'),
  },
  {
    title: { fr: 'Le commutateur', en: 'The switch' },
    text: {
      fr: 'Le <b>commutateur</b> (« S ») est l\'équipement actif du réseau. Le <b>plan de brassage</b>, à droite, dit quel port du tiroir relier à quel port du commutateur. Le voyant au-dessus d\'un port : <span class="ok">vert</span> = liaison conforme au plan, <span class="warn">orange</span> = mauvais port.',
      en: 'The <b>switch</b> (“S”) is the active equipment of the network. The <b>patching schedule</b>, on the right, says which port of the panel goes to which port of the switch. The LED above a port: <span class="ok">green</span> = link as planned, <span class="warn">orange</span> = wrong port.',
    },
    spot: (ctl) => unitBox(ctl, 'switch'),
  },
  {
    title: { fr: 'Les jarretières', en: 'The patch cords' },
    text: {
      fr: 'Ce sont des câbles optiques terminés par des connecteurs LC. <span class="os2">Jaune</span> : fibre monomode (OS2), <span class="om4">turquoise</span> : multimode (OM4) — on ne les mélange pas. Survolez un câble : sa bulle dit où il est branché.',
      en: 'These are fibre cords ending in LC connectors. <span class="os2">Yellow</span>: single-mode fibre (OS2), <span class="om4">aqua</span>: multimode (OM4) — they are never mixed. Hover a cord: its tooltip says where it is plugged.',
    },
    task: { fr: 'Survolez deux câbles différents', en: 'Hover two different cords' },
    done: (ctl) => ctl.counters.hovered >= 2,
  },
  {
    title: { fr: 'Saisir et tirer', en: 'Grab and pull' },
    text: {
      fr: '<b>Clic gauche</b> sur un câble, puis glissez : il suit la main, glisse et frotte contre les autres comme un vrai câble. Pour le passer devant ou derrière un autre câble, <b>maintenez Maj</b> en tirant : la souris vers le haut le pousse vers le fond, vers le bas le ramène vers vous (un fil à plomb montre où il est).',
      en: '<b>Left click</b> on a cord, then drag: it follows the hand, slides and rubs against the others like a real cord. To pass it in front of or behind another cord, <b>hold Shift</b> while pulling: mouse up pushes it to the back, down brings it towards you (a plumb line shows where it is).',
    },
    task: { fr: 'Déplacez un câble d\'une trentaine de centimètres', en: 'Move a cord some thirty centimetres' },
    tool: 'hand',
    done: (ctl) => ctl.counters.dragged >= 0.3,
  },
  {
    title: { fr: 'Regarder autour', en: 'Look around' },
    text: {
      fr: '<b>Clic droit</b> + glisser pour tourner autour de la baie, <b>glisser dans le vide</b> (ou les flèches) pour déplacer la vue, <b>molette</b> pour zoomer, <b>R</b> pour revenir de face. Quand plusieurs câbles sont empilés sous le curseur, <b>Tab</b> passe au suivant.',
      en: '<b>Right button</b> + drag to turn around the cabinet, <b>drag in empty space</b> (or the arrows) to move the view, <b>wheel</b> to zoom, <b>R</b> to come back to the front. When several cords are stacked under the pointer, <b>Tab</b> goes to the next one.',
    },
    task: { fr: 'Tournez la vue', en: 'Turn the view' },
    done: (ctl) => ctl.counters.orbited >= 1,
  },
  {
    title: { fr: 'Débrancher, rebrancher', en: 'Unplug, plug back' },
    text: {
      fr: 'Une liaison est sur le mauvais port : son voyant est orange et ses deux bons ports sont entourés. Saisissez le <b>connecteur</b> et <b>tirez-le de quelques centimètres</b> : il se débranche. Amenez-le devant le port entouré : le port se surligne en jaune quand il est à portée, et le connecteur s\'y enfiche quand vous le relâchez. Lâché ailleurs, en l\'air, il reste <b>accroché</b> là (une lueur ambrée), sauf si vous tenez <b>Alt</b> en le lâchant : il pend alors librement ; un bout tombé dans le tas brille en bleu. Un clic sur une ligne du plan sort son bout libre du tas et l\'accroche sous son port. Une erreur ? <b>Ctrl+Z</b>.',
      en: 'A link is in the wrong port: its LED is orange and its two right ports are circled. Grab the <b>connector</b> and <b>pull it a few centimetres</b>: it comes out. Bring it in front of the circled port: the port lights yellow when it is within reach, and the connector goes in when you let go. Let go elsewhere, in the air, it stays <b>hooked</b> there (an amber glow), unless you hold <b>Alt</b> while letting go: it then hangs freely; an end fallen in the heap glows blue. A click on a line of the schedule brings its loose end out of the heap and hooks it under its port. A mistake? <b>Ctrl+Z</b>.',
    },
    task: { fr: 'Branchez toutes les liaisons du plan', en: 'Plug every link of the schedule' },
    tool: 'hand',
    enter: (ctl) => {
      const ev = ctl.world.evaluate();
      ctl.focus(ev.circuits.findIndex((s) => !s.connected));
    },
    done: (ctl) => ctl.world.evaluate().circuits.every((s) => s.connected),
  },

  {
    title: { fr: 'Tracer un chemin', en: 'Draw a route' },
    text: {
      fr: 'Pour ranger un câble, on décide par où il passe. Outil <b>Chemin</b> (touche C) : appuyez sur un câble, puis <b>tracez un trait par-dessus les guides</b> qu\'il doit traverser, dans l\'ordre. Chaque guide retenu s\'encadre de vert. Si le trait se termine sur un port libre, le bout libre du câble s\'y branche. Au relâcher, le câble est posé le long du chemin, en entrant dans chaque guide par son ouverture, sans traverser la baie. À la Main, tout se fait aussi câble par câble, à votre façon.',
      en: 'To tidy a cord, you decide where it runs. <b>Route</b> tool (key C): press on a cord, then <b>draw a line over the guides</b> it must go through, in order. Each guide taken is framed in green. If the line ends on a free port, the cord\'s loose end is plugged there. When you let go, the cord is laid along the route, entering each guide by its opening, without going through the cabinet. With the Hand, everything can also be done cord by cord, your own way.',
    },
  },


  {
    title: { fr: 'Le guide-câbles', en: 'The cable manager' },
    text: {
      fr: 'Ce panneau <b>1U à doigts</b> se pose sous le tiroir. Les câbles passent entre les doigts et courent à l\'horizontale jusqu\'aux côtés de la baie, au lieu de pendre devant les ports. Un câble y entre par l\'avant, au-dessus des pointes des doigts. Tracez le chemin d\'un câble par-dessus le guide-câbles. Une fois posé, le câble se colore un moment par portion : <span class="ok">vert</span> là où un support le tient, <span class="warn">orange</span> là où il pend de plus de 20 cm, rouge là où il traîne au sol.',
      en: 'This <b>1U finger panel</b> goes under the fibre panel. The cords pass between the fingers and run horizontally to the sides of the cabinet, instead of hanging in front of the ports. A cord goes in from the front, over the tips of the fingers. Draw a cord\'s route over the cable manager. Once laid, the cord is coloured stretch by stretch for a moment: <span class="ok">green</span> where a support holds it, <span class="warn">orange</span> where it hangs more than 20 cm, red where it lies on the floor.',
    },
    task: { fr: 'Rangez un câble dans le guide-câbles', en: 'Route a cord into the cable manager' },
    spot: mgrBox,
    tool: 'route',
    done: (ctl) => held(ctl, 'fingerManager') >= 6,
  },


  {
    title: { fr: 'Pincer un coude', en: 'Pinch a bend' },
    text: {
      fr: 'À la main, on peut aussi donner sa forme à un câble. Sans pli, un câble sort de son port droit vers vous ; <b>plié juste après le connecteur</b>, il descend droit vers le guide-câbles. Saisissez le câble à quelques centimètres de son connecteur et amenez-le dans le guide-câbles. Puis, sans lâcher le câble, <b>maintenez Espace</b> (ou le clic droit) : la portion sous votre main garde la forme qu\'elle a. Plus vous maintenez, plus le coude est ferme (environ une seconde et demie pour un coude bien ferme). Relâchez Espace, puis le câble : le coude garde sa forme.',
      en: 'By hand, a cord can also be shaped. Without a bend, a cord comes straight out of its port towards you; <b>bent just after the connector</b>, it goes straight down to the cable manager. Grab the cord a few centimetres from its connector and bring it into the cable manager. Then, without letting go of the cord, <b>hold Space</b> (or the right button): the stretch under your hand keeps the shape it has. The longer you hold, the firmer the bend (about a second and a half for a firm one). Let go of Space, then of the cord: the bend keeps its shape.',
    },
    task: { fr: 'Pincez un coude ferme à la sortie d\'un port', en: 'Pinch a firm bend where a cord leaves a port' },
    spot: portToMgrBox,
    tool: 'hand',
    done: (ctl) => ctl.world.sim.pinches.some((p) => p.s >= 0.7 && p !== ctl.world.sim.pinchHeld),
  },
  {
    title: { fr: 'Voir et défaire un coude', en: 'See and undo a bend' },
    text: {
      fr: 'Survolez un câble : ses coudes pincés apparaissent en <b>anneaux</b>, plus vifs quand le coude est ferme. Le coude sous le curseur devient <span class="warn">orange</span> : <b>Espace</b> le défait. Pour changer la forme d\'un coude, pincez de nouveau au même endroit : le nouveau coude remplace l\'ancien.',
      en: 'Hover a cord: its pinched bends show as <b>rings</b>, brighter when the bend is firm. The bend under the pointer turns <span class="warn">orange</span>: <b>Space</b> undoes it. To change the shape of a bend, pinch again at the same place: the new bend replaces the old one.',
    },
    task: { fr: 'Survolez un coude pincé', en: 'Hover a pinched bend' },
    tool: 'hand',
    done: (ctl) => ctl.cableView.pinchHover >= 0,
  },
  {
    title: { fr: 'La goulotte', en: 'The duct' },
    text: {
      fr: 'La <b>goulotte</b> se fixe dans un couloir latéral. Elle descend les câbles le long des montants et cache le <b>mou</b> (la longueur en trop). Prenez l\'outil <b>Supports</b> (touche 2) et cliquez dans le couloir entouré : dans un couloir, il pose une goulotte ; dans une unité vide, un guide-câbles.',
      en: 'The <b>duct</b> fits in a side channel. It takes the cords down along the posts and hides the <b>slack</b> (the extra length). Take the <b>Supports</b> tool (key 2) and click in the circled channel: in a channel, it places a duct; in an empty unit, a cable manager.',
    },
    task: { fr: 'Posez une goulotte', en: 'Place a duct' },
    spot: sideBox,
    tool: 'supports',
    done: (ctl) => ctl.world.rack.items.some((i) => i.kind === 'duct'),
  },

  {
    title: { fr: 'Ranger dans la goulotte', en: 'Route through the duct' },
    text: {
      fr: 'Avec l\'outil <b>Chemin</b>, tracez le chemin d\'un câble par le guide-câbles, puis le long de la goulotte, jusqu\'à son port. Le câble entre dans la goulotte par la <b>fente</b> de sa face avant, et sa longueur en trop y pend en boucle.',
      en: 'With the <b>Route</b> tool, draw a cord\'s way through the cable manager, then along the duct, up to its port. The cord goes into the duct through the <b>slit</b> of its front face, and its extra length hangs in a loop inside.',
    },
    task: { fr: 'Mettez un câble dans la goulotte', en: 'Put a cord in the duct' },
    tool: 'route',
    done: (ctl) => held(ctl, 'duct') >= 4,
  },


  {
    title: { fr: 'La seconde main', en: 'The second hand' },
    text: {
      fr: 'À la main, il faut parfois tenir un câble à deux endroits : avec une seule main, tirer le bout défait ce qu\'on vient de poser. Tenez le câble là où il doit rester et appuyez sur <b>E</b> : <b>l\'autre main</b> le tient sur place (une lueur ambrée la signale) et la vôtre est libre. Saisissez le câble plus loin, amenez-le dans la goulotte et pincez le virage avec <b>Espace</b>. Enfin, sans rien tenir, appuyez sur <b>E</b> : l\'autre main lâche le câble.',
      en: 'By hand, a cord sometimes has to be held in two places: with one hand, pulling the end undoes what was just laid. Hold the cord where it must stay and press <b>E</b>: <b>the other hand</b> holds it in place (an amber glow shows it) and yours is free. Grab the cord further along, bring it into the duct and pinch the turn with <b>Space</b>. Last, holding nothing, press <b>E</b>: the other hand lets go of the cord.',
    },
    task: { fr: 'Passez un câble à l\'autre main (E)', en: 'Hand a cord over to the other hand (E)' },
    spot: (ctl) => {
      const m = mgrBox(ctl), s = sideBox(ctl);
      return m ? { min: [Math.min(m.min[0], s.min[0]), Math.min(m.min[1], s.min[1]), Math.min(m.min[2], s.min[2])], max: [Math.max(m.max[0], s.max[0]), Math.max(m.max[1], s.max[1]), Math.max(m.max[2], s.max[2])] } : s;
    },
    tool: 'hand',
    done: (ctl) => ctl.counters.handedOver >= 1,
  },
  {
    title: { fr: 'L\'anneau', en: 'The ring' },
    text: {
      fr: 'Plus léger qu\'une goulotte, l\'<b>anneau</b> guide un câble vertical dans un couloir latéral : outil Supports, <b>Maj</b> + clic dans un couloir (ou un simple clic quand il n\'y a plus de goulotte). C\'est un crochet ouvert à l\'avant, côté extérieur. Pratique pour quelques câbles ; au-delà, la goulotte tient mieux le mou.',
      en: 'Lighter than a duct, the <b>ring</b> guides a vertical cord in a side channel: Supports tool, <b>Shift</b> + click in a channel (or a plain click when there is no duct left). It is a hook open at the front, on the outer side. Handy for a few cords; beyond that, the duct holds the slack better.',
    },
  },

  {
    title: { fr: 'Le velcro', en: 'The velcro' },
    text: {
      fr: 'Le <b>velcro</b> (touche 3) serre en faisceau des câbles côte à côte. <b>Tracez un trait en travers</b> des câbles à serrer : ceux qu\'il croise s\'allument, et au relâcher le velcro les serre là où le trait les croise. Il se place là où le plus de câbles passent côte à côte, et laisse de côté un câble croisé plus loin. Cliquez sur un velcro pour l\'enlever. Un faisceau d\'un seul service se lit mieux. Jamais de collier serré sur une fibre : il l\'écrase !',
      en: 'The <b>velcro</b> (key 3) straps cords running side by side into a bundle. <b>Draw a line across</b> the cords to strap: those it crosses light up, and when you let go the velcro straps them where the line crosses them. It goes where most cords run side by side, and leaves out a cord crossed further on. Click a velcro to take it off. A bundle of one service reads better. Never a tight cable tie on a fibre: it crushes it!',
    },
    task: { fr: 'Posez un velcro', en: 'Place a velcro' },
    tool: 'velcro',
    done: (ctl) => ctl.world.straps.length > 0,
  },

  {
    title: { fr: 'Le bon cordon', en: 'The right cord' },
    text: {
      fr: 'Un rangement parfait passe par des cordons <b>à la bonne longueur</b> : trop longs, ils font du mou partout ; trop courts, ils sont <b>tendus</b> et ne valent pas ★★★. Le <b>Stock</b> (touche 0) fournit des cordons neufs, en nombre limité par longueur : ils arrivent dans le bac. Pour remplacer un cordon branché, il faut le débrancher, et donc couper sa liaison le temps de changer.',
      en: 'A perfect job takes cords <b>of the right length</b>: too long, they leave slack everywhere; too short, they are <b>taut</b> and not worth ★★★. The <b>Stock</b> (key 0) provides new cords, in limited numbers per length: they arrive in the crate. To swap a plugged cord, it must be unplugged, so its link is cut while it is changed.',
    },
    task: { fr: 'Prenez un cordon neuf au Stock', en: 'Take a new cord from the Stock' },
    done: (ctl) => ctl.world.cablesVersion > 0,
  },
  {
    title: { fr: 'Le bac et le traceur', en: 'The crate and the tracer' },
    text: {
      fr: 'Comme un vrai technicien, on peut tout <b>débrancher et déposer</b> dans le bac au sol : survolez un câble et appuyez sur <b>Suppr</b>. Reprenez-le à la main quand vous voulez. Pour savoir où va un câble dans le tas, survolez-le et appuyez sur <b>T</b> : il clignote et ses deux ports s\'entourent.',
      en: 'Like a real technician, you can <b>unplug and drop</b> anything into the crate on the floor: hover a cord and press <b>Delete</b>. Take it back by hand whenever you want. To find where a cord in the heap goes, hover it and press <b>T</b>: it blinks and its two ports are circled.',
    },
    spot: (ctl) => { const k = ctl.world.rack.crate(); return { min: k.min, max: k.max }; },
    task: { fr: 'Déposez un câble dans le bac (Suppr)', en: 'Drop a cord into the crate (Delete)' },
    tool: 'hand',
    done: (ctl) => ctl.counters.deposited > 0,
  },

  {
    title: { fr: 'Les services', en: 'The services' },
    text: {
      fr: 'Chaque liaison appartient à un <b>service</b> (sa couleur dans le plan ; survolez-le pour savoir ce qu\'il porte). Un cordon branché comme prévu reçoit tout seul son <b>étiquette</b>. Dans une baie en production (⚡), chaque seconde où une liaison est coupée coûte le poids de son service sur un <b>budget d\'interruption</b> : l\'Admin ×4, la Voix et le Stockage ×3, la Vidéo ×2, les Données ×1, les Invités presque rien. Une <b>dérivation</b> (clic sur le ⚡ d\'une ligne du plan) porte le trafic d\'une liaison pendant qu\'on la recâble.',
      en: 'Each link belongs to a <b>service</b> (its colour on the schedule; hover it to see what it carries). A cord plugged as planned gets its <b>label</b> by itself. In a cabinet in production (⚡), every second a link is cut costs its service\'s weight off a <b>downtime budget</b>: Admin ×4, Voice and Storage ×3, Video ×2, Data ×1, Guests almost nothing. A <b>bypass</b> (click the ⚡ of a line of the schedule) carries a link\'s traffic while it is recabled.',
    },
  },

  {
    title: { fr: 'Le score', en: 'The score' },
    text: {
      fr: 'Quatre critères, dans le panneau de droite : les <b>connexions</b> conformes au plan (obligatoires pour valider), le <b>rangement</b> (aucune portion de plus de 20 cm ne pend hors d\'un support), la <b>façade dégagée</b> (aucun câble devant le port d\'un autre) et l\'absence de <b>tension</b> (aucun cordon tendu, aucune fibre pliée). De une à trois étoiles ; il en faut <b>deux</b> pour ouvrir le niveau suivant. La <b>lisibilité</b>, sur 100, départage les baies parfaites : le mou juste, les couleurs, les faisceaux, les croisements. À vous !',
      en: 'Four criteria, in the panel on the right: the <b>connections</b> as planned (needed to sign off), the <b>routing</b> (no stretch longer than 20 cm hangs out of a support), the <b>clear front</b> (no cord in front of another\'s port) and no <b>tension</b> (no cord taut, no fibre kinked). One to three stars; it takes <b>two</b> to open the next level. The <b>readability</b>, out of 100, sets perfect cabinets apart: just the slack, the colours, the bundles, the crossings. Over to you!',
    },
  },

];

export class Tutorial {
  private i = 0;
  private el: HTMLElement;
  private poll: number;
  /** the move to the next step, a moment after a task is done */
  private advance = 0;
  private doneAt = -1;
  private stopRewriting: () => void;

  constructor(private ctl: Controller, private hud: { selectTool(t: Tool): void }, private actions: { home(): void; play(): void }) {
    this.el = $('#tuto');
    this.el.classList.add('on');
    document.body.classList.add('tutorial');
    (this.el.querySelector('#tuto-prev') as HTMLElement).onclick = () => this.go(this.i - 1);
    (this.el.querySelector('#tuto-next') as HTMLElement).onclick = () => this.next();
    (this.el.querySelector('#tuto-skip') as HTMLElement).onclick = () => { this.markDone(); this.actions.play(); };
    (this.el.querySelector('#tuto-home') as HTMLElement).onclick = () => this.actions.home();
    (this.el.querySelector('#tuto-play') as HTMLElement).onclick = () => this.actions.play();
    this.poll = window.setInterval(() => this.check(), 200);
    this.stopRewriting = onLanguageChange(() => this.write());
    this.go(0);
  }

  dispose(): void {
    clearInterval(this.poll);
    this.stopRewriting();
    // a step done just before leaving must not move on in the next level
    clearTimeout(this.advance);
    this.el.classList.remove('on');
    document.body.classList.remove('tutorial');
    document.querySelectorAll('.tool.pulse').forEach((b) => b.classList.remove('pulse'));
    this.ctl.spotlight(null);
    this.ctl.focus(-1);
  }

  private next(): void {
    if (this.i === STEPS.length - 1) this.finish();
    else this.go(this.i + 1);
  }

  private go(i: number): void {
    this.i = Math.max(0, Math.min(STEPS.length - 1, i));
    const s = STEPS[this.i];
    clearTimeout(this.advance);
    this.doneAt = -1;
    this.ctl.focus(-1);
    this.ctl.spotlight(s.spot ? s.spot(this.ctl) : null);
    document.querySelectorAll('.tool.pulse').forEach((b) => b.classList.remove('pulse'));
    if (s.tool) {
      this.hud.selectTool(s.tool);
      if (s.tool !== 'hand') document.querySelector(`.tool[data-tool="${s.tool}"]`)?.classList.add('pulse');
    }
    s.enter?.(this.ctl);
    (this.el.querySelector('#tuto-task') as HTMLElement).classList.remove('done');
    (this.el.querySelector('#tuto-prev') as HTMLButtonElement).disabled = this.i === 0;
    const last = this.i === STEPS.length - 1;
    (this.el.querySelector('#tuto-end') as HTMLElement).style.display = last ? '' : 'none';
    this.write();
  }

  /** the step's words, in the language spoken */
  private write(): void {
    const s = STEPS[this.i];
    (this.el.querySelector('#tuto-n') as HTMLElement).textContent = `${this.i + 1} / ${STEPS.length}`;
    (this.el.querySelector('#tuto-title') as HTMLElement).textContent = tr(s.title);
    (this.el.querySelector('#tuto-text') as HTMLElement).innerHTML = tr(s.text);
    const task = this.el.querySelector('#tuto-task') as HTMLElement;
    task.style.display = s.task ? '' : 'none';
    task.textContent = s.task ? tr(s.task) : '';
    this.setNext();
  }

  private setNext(): void {
    const s = STEPS[this.i];
    const b = this.el.querySelector('#tuto-next') as HTMLButtonElement;
    const pending = !!s.done && this.doneAt < 0;
    b.style.display = this.i === STEPS.length - 1 ? 'none' : '';
    b.textContent = pending ? tr({ fr: 'Passer →', en: 'Skip →' }) : tr({ fr: 'Suivant →', en: 'Next →' });
    b.classList.toggle('primary', !pending);
    b.classList.toggle('ghost', pending);
  }

  private check(): void {
    const s = STEPS[this.i];
    if (!s.done || this.doneAt >= 0) return;
    if (!s.done(this.ctl)) return;
    this.doneAt = performance.now();
    (this.el.querySelector('#tuto-task') as HTMLElement).classList.add('done');
    sfx.label();
    this.setNext();
    // move on by itself after a moment (go() and dispose() call it off)
    this.advance = window.setTimeout(() => this.next(), 1600);
  }

  private finish(): void {
    this.markDone();
    this.go(STEPS.length - 1);
  }

  private markDone(): void {
    save('tutorialDone', true);
  }
}
