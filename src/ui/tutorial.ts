// The guided tutorial: what the cabinet is, and the gestures the first level
// needs; then, if the player wants them, the finer gestures. A card walks
// through the steps; the 3D scene frames the piece being described, and steps
// with a task tick themselves off when the player has done it (any step can
// be skipped).

import type { Controller, Tool } from '../play/controller';
import { COLUMN_X, SIDE_BACK, SIDE_IN, SIDE_OUT, U, WALL_X, insideBox } from '../game/rack';
import { sfx } from '../audio/sfx';
import { load, save } from './storage';
import { TUTORIAL } from '../game/levels/campaign';
import { levelRules } from '../game/levels/levelRules';
import { withMet } from './progress';
import { $ } from '../lib/page';
import { onLanguageChange, tr, type Words } from './language';
import { STOCK_KEY, toolKey } from './toolbar';
import { DELETE_KEY } from './keyHints';

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

/** the basics: enough to play the first level */
const BASICS: Step[] = [
  {
    title: { fr: 'Bienvenue dans la baie', en: 'Welcome to the cabinet' },
    text: {
      fr: 'Voici une baie de brassage 19 pouces. En haut, le <b>panneau de brassage</b> (« A ») reçoit les câbles des bureaux ; en bas, le <b>switch</b> (« S ») est l\'équipement actif du réseau. Le <b>plan de brassage</b>, à droite, dit quel port relier à quel port. Le voyant d\'un port : <span class="ok">vert</span> = liaison conforme au plan, <span class="warn">orange</span> = mauvais port. Votre métier : brancher chaque liaison, puis ranger les câbles.',
      en: 'This is a 19-inch patching cabinet. At the top, the <b>patch panel</b> (“A”) takes the cables from the offices; below, the <b>switch</b> (“S”) is the active equipment of the network. The <b>patching schedule</b>, on the right, says which port goes to which. The LED of a port: <span class="ok">green</span> = link as planned, <span class="warn">orange</span> = wrong port. Your job: plug each link, then tidy the cords.',
    },
    spot: (ctl) => ({ min: [-WALL_X, ctl.world.rack.floorY, -0.06], max: [WALL_X, ctl.world.rack.topY, 0.09] }),
  },
  {
    title: { fr: 'Les câbles', en: 'The patch cords' },
    text: {
      fr: 'Ce sont des câbles cuivre terminés par des prises RJ45. Chaque liaison appartient à un <b>service</b> (sa couleur dans le plan), et son câble en porte la couleur. Survolez un câble : sa bulle dit où il est branché.',
      en: 'These are copper cords ending in RJ45 plugs. Each link belongs to a <b>service</b> (its colour on the schedule), and its cord wears that colour. Hover a cord: its tooltip says where it is plugged.',
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
    title: { fr: 'Débrancher', en: 'Unplug' },
    text: {
      fr: 'Un câble est sur le mauvais port : son voyant est <span class="warn">orange</span>. Saisissez son <b>connecteur</b> et <b>tirez-le de quelques centimètres</b> : il se débranche.',
      en: 'A cord is in the wrong port: its LED is <span class="warn">orange</span>. Grab its <b>connector</b> and <b>pull it a few centimetres</b>: it comes out.',
    },
    task: { fr: 'Débranchez le câble du mauvais port', en: 'Unplug the cord from the wrong port' },
    tool: 'hand',
    enter: (ctl) => {
      const ev = ctl.world.evaluate();
      ctl.focus(ev.circuits.findIndex((s) => !s.connected));
    },
    done: (ctl) => ctl.counters.unplugged >= 1 || ctl.world.evaluate().circuits.every((s) => s.connected),
  },
  {
    title: { fr: 'Rebrancher', en: 'Plug back' },
    text: {
      fr: 'Ses deux bons ports sont entourés. Amenez le connecteur devant l\'un d\'eux : le port s\'allume en jaune. Relâchez, il s\'y branche. Une erreur ? <b>Ctrl+Z</b>.',
      en: 'Its two right ports are circled. Bring the connector in front of one: the port lights yellow. Let go, it goes in. A mistake? <b>Ctrl+Z</b>.',
    },
    task: { fr: 'Branchez toutes les liaisons du plan', en: 'Plug every link of the schedule' },
    tool: 'hand',
    done: (ctl) => ctl.world.evaluate().circuits.every((s) => s.connected),
  },
  {
    title: { fr: 'Ranger : l\'outil Chemin', en: 'Tidying: the Route tool' },
    text: {
      fr: `Pour ranger un câble, on décide par où il passe. Le <b>guide-câbles</b>, ce panneau 1U à doigts sous le panneau de brassage, mène les câbles à l'horizontale jusqu'aux côtés de la baie au lieu de les laisser pendre devant les ports. Outil <b>Chemin</b> (touche ${toolKey('route').toUpperCase()}) : appuyez sur un câble, puis <b>tracez un trait par-dessus le guide-câbles</b> ; chaque guide retenu s'encadre de vert. Si le trait finit sur un port libre, le bout libre s'y branche. Au relâcher, le câble est posé le long du chemin, puis se colore un moment : <span class="ok">vert</span> là où un support le tient, <span class="warn">orange</span> là où il pend.`,
      en: `To tidy a cord, you decide where it runs. The <b>cable manager</b>, this 1U finger panel under the patch panel, takes the cords horizontally to the sides of the cabinet instead of letting them hang in front of the ports. <b>Route</b> tool (key ${toolKey('route').toUpperCase()}): press on a cord, then <b>draw a line over the cable manager</b>; each guide taken is framed in green. If the line ends on a free port, the loose end is plugged there. When you let go, the cord is laid along the route, then coloured for a moment: <span class="ok">green</span> where a support holds it, <span class="warn">orange</span> where it hangs.`,
    },
    task: { fr: 'Rangez un câble dans le guide-câbles', en: 'Route a cord into the cable manager' },
    spot: mgrBox,
    tool: 'route',
    done: (ctl) => held(ctl, 'fingerManager') >= 6,
  },
  {
    title: { fr: 'Les étoiles', en: 'The stars' },
    text: {
      fr: '★ : toutes les liaisons sont branchées. ★★ : tous les câbles sont rangés, et le niveau suivant s\'ouvre. ★★★ : les consignes du niveau sont respectées en plus. Un câble est <b>rangé</b> quand il ne pend pas hors des supports, ne passe devant aucun port et n\'est pas tendu. Sous le plan, <b>la liste des étoiles</b> indique ce que chacune demande et où vous en êtes.',
      en: '★: every link is plugged. ★★: every cord is tidy, and the next level opens. ★★★: the level\'s instructions are met as well. A cord is <b>tidy</b> when it does not hang out of the supports, crosses no port and is not taut. Under the schedule, <b>the list of stars</b> shows what each one asks and where you stand.',
    },
  },
];

/**
 * The finer gestures, after the basics if the player wants them (each level's
 * brief also explains the supports it gives, the first time).
 */
const ADVANCED: Step[] = [
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
    title: { fr: 'Jeter un câble', en: 'Throw a cord away' },
    text: {
      fr: `Un câble qui ne sert plus, trop long ou abîmé va au <b>bac</b>, au sol devant la baie. Survolez-le (ou tenez-le en main) et appuyez sur <b>${DELETE_KEY.fr}</b> : il se débranche, s'enroule et tombe dans le bac. Le <b>Stock</b> (${STOCK_KEY}) fournit des câbles neufs, qui arrivent eux aussi dans le bac. Essayez, puis <b>Ctrl+Z</b> le remet en place.`,
      en: `A cord no longer used, too long or damaged goes to the <b>crate</b>, on the floor in front of the cabinet. Hover it (or hold it in hand) and press <b>${DELETE_KEY.en}</b>: it is unplugged, coiled and dropped in the crate. The <b>Stock</b> (${STOCK_KEY}) provides new cords, which also arrive in the crate. Try it, then <b>Ctrl+Z</b> puts it back.`,
    },
    task: { fr: 'Jetez un câble au bac', en: 'Throw a cord into the crate' },
    tool: 'hand',
    done: (ctl) => ctl.counters.deposited >= 1,
  },
  {
    title: { fr: 'La goulotte', en: 'The duct' },
    text: {
      fr: `La <b>goulotte</b> se fixe dans un couloir latéral. Elle descend les câbles le long des montants et cache le <b>mou</b> (la longueur en trop). Prenez l'outil <b>Supports</b> (touche ${toolKey('supports')}) et cliquez dans le couloir entouré : dans un couloir, il pose une goulotte ; dans une unité vide, un guide-câbles.`,
      en: `The <b>duct</b> fits in a side channel. It takes the cords down along the posts and hides the <b>slack</b> (the extra length). Take the <b>Supports</b> tool (key ${toolKey('supports')}) and click in the circled channel: in a channel, it places a duct; in an empty unit, a cable manager.`,
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
    title: { fr: 'Le velcro', en: 'The velcro' },
    text: {
      fr: `Le <b>velcro</b> (touche ${toolKey('velcro')}) serre en faisceau des câbles côte à côte. <b>Tracez un trait en travers</b> des câbles à serrer : ceux qu'il croise s'allument, et au relâcher le velcro les serre là où le trait les croise. Il se place là où le plus de câbles passent côte à côte, et laisse de côté un câble croisé plus loin. Cliquez sur un velcro pour l'enlever. Le velcro est facultatif : il ne compte pas pour les étoiles.`,
      en: `The <b>velcro</b> (key ${toolKey('velcro')}) straps cords running side by side into a bundle. <b>Draw a line across</b> the cords to strap: those it crosses light up, and when you let go the velcro straps them where the line crosses them. It goes where most cords run side by side, and leaves out a cord crossed further on. Click a velcro to take it off. The velcro is optional: it does not count for the stars.`,
    },
    task: { fr: 'Posez un velcro', en: 'Place a velcro' },
    tool: 'velcro',
    done: (ctl) => ctl.world.straps.length > 0,
  },
];

export class Tutorial {
  /** the chapter under way: the basics, then the finer gestures */
  private steps = BASICS;
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
    (this.el.querySelector('#tuto-more') as HTMLElement).onclick = () => { this.steps = ADVANCED; this.go(0); };
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

  /** the next step (go stays on the last one) */
  private next(): void {
    this.go(this.i + 1);
  }

  private go(i: number): void {
    this.i = Math.max(0, Math.min(this.steps.length - 1, i));
    const s = this.steps[this.i];
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
    const last = this.i === this.steps.length - 1;
    (this.el.querySelector('#tuto-end') as HTMLElement).style.display = last ? '' : 'none';
    // the end of the basics: the tutorial is done, and the finer gestures are offered
    (this.el.querySelector('#tuto-more') as HTMLElement).style.display = last && this.steps === BASICS ? '' : 'none';
    if (last) this.markDone();
    this.write();
  }

  /** the step's words, in the language spoken */
  private write(): void {
    const s = this.steps[this.i];
    const chapter = this.steps === ADVANCED ? tr({ fr: 'Gestes avancés · ', en: 'Finer gestures · ' }) : '';
    (this.el.querySelector('#tuto-n') as HTMLElement).textContent = `${chapter}${this.i + 1} / ${this.steps.length}`;
    (this.el.querySelector('#tuto-title') as HTMLElement).textContent = tr(s.title);
    (this.el.querySelector('#tuto-text') as HTMLElement).innerHTML = tr(s.text);
    const task = this.el.querySelector('#tuto-task') as HTMLElement;
    task.style.display = s.task ? '' : 'none';
    task.textContent = s.task ? tr(s.task) : '';
    this.setNext();
  }

  private setNext(): void {
    const s = this.steps[this.i];
    const b = this.el.querySelector('#tuto-next') as HTMLButtonElement;
    const pending = !!s.done && this.doneAt < 0;
    b.style.display = this.i === this.steps.length - 1 ? 'none' : '';
    b.textContent = pending ? tr({ fr: 'Passer →', en: 'Skip →' }) : tr({ fr: 'Suivant →', en: 'Next →' });
    b.classList.toggle('primary', !pending);
    b.classList.toggle('ghost', pending);
  }

  private check(): void {
    const s = this.steps[this.i];
    if (!s.done || this.doneAt >= 0) return;
    if (!s.done(this.ctl)) return;
    this.doneAt = performance.now();
    (this.el.querySelector('#tuto-task') as HTMLElement).classList.add('done');
    sfx.label();
    this.setNext();
    // move on by itself after a moment (go() and dispose() call it off)
    this.advance = window.setTimeout(() => this.next(), 1600);
  }

  /** the tutorial is done once, and the rules it shows are met (the first level does not tell them again) */
  private markDone(): void {
    save('tutorialDone', true);
    save('rules', withMet(load('rules'), levelRules(TUTORIAL)));
  }
}
