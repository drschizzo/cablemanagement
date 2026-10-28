// The guided tutorial: what each piece of the cabinet is for, and how to
// handle the cords. A card walks through the steps; the 3D scene frames the
// piece being described, and steps with a task tick themselves off when the
// player has done it (any step can be skipped).

import type { Controller, Tool } from '../game/controller';
import { COLUMN_X, SIDE_BACK, SIDE_IN, SIDE_OUT, U, WALL_X, insideBox } from '../game/rack';
import { sfx } from '../audio/sfx';
import { save } from '../storage';

type Box = { min: [number, number, number]; max: [number, number, number] };

interface Step {
  title: string;
  text: string;
  task?: string;
  spot?: (c: Controller) => Box | null;
  tool?: Tool;
  enter?: (c: Controller) => void;
  done?: (c: Controller) => boolean;
}

const unitBox = (c: Controller, kind: string): Box | null => {
  const r = c.world.rack;
  const k = r.units.findIndex((u) => u.kind === kind);
  if (k < 0) return null;
  return { min: [-COLUMN_X + 0.005, r.unitBottom(k) - 0.002, -0.004], max: [COLUMN_X - 0.005, r.unitBottom(k) + U + 0.002, 0.075] };
};

const mgrBox = (c: Controller): Box | null => {
  const r = c.world.rack;
  const it = r.items.find((i) => i.kind === 'hmgr');
  if (!it) return null;
  return { min: [-COLUMN_X + 0.005, r.unitBottom(it.unit), -0.004], max: [COLUMN_X - 0.005, r.unitBottom(it.unit) + U, 0.08] };
};

/** the panel and the manager under it: where a cord leaves its port and turns down into the fingers */
const portToMgrBox = (c: Controller): Box | null => {
  const p = unitBox(c, 'panel'), m = mgrBox(c);
  if (!p || !m) return p ?? m;
  return { min: [p.min[0], Math.min(p.min[1], m.min[1]), p.min[2]], max: [p.max[0], Math.max(p.max[1], m.max[1]), 0.09] };
};

const sideBox = (c: Controller): Box => {
  const r = c.world.rack;
  return { min: [SIDE_IN, r.unitBottom(r.units.length - 2), SIDE_BACK], max: [SIDE_OUT, r.topY - U, 0.075] };
};

/** nodes of any cord inside the holding volume of an item kind */
function held(c: Controller, kind: 'hmgr' | 'duct'): number {
  const w = c.world;
  const ids = new Set(w.rack.items.filter((i) => i.kind === kind).map((i) => i.id));
  const boxes = w.rack.supports().filter((s) => ids.has(s.item));
  const x = w.sim.x;
  let best = 0;
  for (const cb of w.cables) {
    let n = 0;
    for (let k = 6; k < cb.count - 6; k++) {
      const i = cb.start + k;
      if (boxes.some((s) => insideBox(s, x[3 * i], x[3 * i + 1], x[3 * i + 2]))) n++;
    }
    best = Math.max(best, n);
  }
  return best;
}

const STEPS: Step[] = [
  {
    title: 'Bienvenue dans la baie',
    text: 'Voici une baie de brassage 19 pouces. Les équipements s\'y empilent en <b>unités</b> (1U = 4,45 cm). Votre métier : brancher chaque liaison sur les bons ports, puis ranger les câbles pour que la baie reste lisible et accessible.',
    spot: (c) => ({ min: [-WALL_X, c.world.rack.floorY, -0.06], max: [WALL_X, c.world.rack.topY, 0.09] }),
  },
  {
    title: 'Le tiroir optique',
    text: 'Le <b>tiroir optique</b> (ici « A ») reçoit les fibres qui arrivent du bâtiment ou d\'une autre salle. Chaque port est l\'extrémité d\'une fibre, sur laquelle on branche une jarretière.',
    spot: (c) => unitBox(c, 'panel'),
  },
  {
    title: 'Le commutateur',
    text: 'Le <b>commutateur</b> (« S ») est l\'équipement actif du réseau. Le <b>plan de brassage</b>, à droite, dit quel port du tiroir relier à quel port du commutateur. Le voyant au-dessus d\'un port : <span class="ok">vert</span> = liaison conforme au plan, <span class="warn">orange</span> = mauvais port.',
    spot: (c) => unitBox(c, 'switch'),
  },
  {
    title: 'Les jarretières',
    text: 'Ce sont des câbles optiques terminés par des connecteurs LC. <span class="os2">Jaune</span> : fibre monomode (OS2), <span class="om4">turquoise</span> : multimode (OM4) — on ne les mélange pas. Survolez un câble : sa bulle dit où il est branché.',
    task: 'Survolez deux câbles différents',
    done: (c) => c.counters.hovered >= 2,
  },
  {
    title: 'Saisir et tirer',
    text: '<b>Clic gauche</b> sur un câble, puis glissez : il suit la main, glisse et frotte contre les autres comme un vrai câble. Pour le passer devant ou derrière un autre câble, <b>maintenez Maj</b> en tirant : la souris vers le haut le pousse vers le fond, vers le bas le ramène vers vous (un fil à plomb montre où il est).',
    task: 'Déplacez un câble d\'une trentaine de centimètres',
    tool: 'hand',
    done: (c) => c.counters.dragged >= 0.3,
  },
  {
    title: 'Regarder autour',
    text: '<b>Clic droit</b> + glisser pour tourner autour de la baie, <b>glisser dans le vide</b> (ou les flèches) pour déplacer la vue, <b>molette</b> pour zoomer, <b>R</b> pour revenir de face. Quand plusieurs câbles sont empilés sous le curseur, <b>Tab</b> passe au suivant.',
    task: 'Tournez la vue',
    done: (c) => c.counters.orbited >= 1,
  },
  {
    title: 'Débrancher, rebrancher',
    text: 'Une liaison est sur le mauvais port : son voyant est orange et ses deux bons ports sont entourés. Saisissez le <b>connecteur</b> et <b>tirez-le de quelques centimètres</b> : il se débranche. Amenez-le devant le port entouré : le port se surligne en jaune quand il est à portée, et le connecteur s\'y enfiche quand vous le relâchez. Lâché ailleurs, en l\'air, il reste <b>accroché</b> là (une lueur ambrée), sauf si vous tenez <b>Alt</b> en le lâchant : il pend alors librement ; un bout tombé dans le tas brille en bleu. Un clic sur une ligne du plan sort son bout libre du tas et l\'accroche sous son port. Une erreur ? <b>Ctrl+Z</b>.',
    task: 'Branchez toutes les liaisons du plan',
    tool: 'hand',
    enter: (c) => {
      const ev = c.world.evaluate();
      c.focus(ev.circuits.findIndex((s) => !s.connected));
    },
    done: (c) => c.world.evaluate().circuits.every((s) => s.connected),
  },

  {
    title: 'Tracer un chemin',
    text: 'Pour ranger un câble, on décide par où il passe. Outil <b>Chemin</b> (touche C) : appuyez sur un câble, puis <b>tracez un trait par-dessus les guides</b> qu\'il doit traverser, dans l\'ordre. Chaque guide retenu s\'encadre de vert. Si le trait se termine sur un port libre, le bout libre du câble s\'y branche. Au relâcher, le câble est posé le long du chemin, en entrant dans chaque guide par son ouverture, sans traverser la baie. À la Main, tout se fait aussi câble par câble, à votre façon.',
  },


  {
    title: 'Le guide-câbles',
    text: 'Ce panneau <b>1U à doigts</b> se pose sous le tiroir. Les câbles passent entre les doigts et courent à l\'horizontale jusqu\'aux côtés de la baie, au lieu de pendre devant les ports. Un câble y entre par l\'avant, au-dessus des pointes des doigts. Tracez le chemin d\'un câble par-dessus le guide-câbles. Une fois posé, le câble se colore un moment par portion : <span class="ok">vert</span> là où un support le tient, <span class="warn">orange</span> là où il pend de plus de 20 cm, rouge là où il traîne au sol.',
    task: 'Rangez un câble dans le guide-câbles',
    spot: mgrBox,
    tool: 'route',
    done: (c) => held(c, 'hmgr') >= 6,
  },


  {
    title: 'Pincer un coude',
    text: 'À la main, on peut aussi donner sa forme à un câble. Sans pli, un câble sort de son port droit vers vous ; <b>plié juste après le connecteur</b>, il descend droit vers le guide-câbles. Saisissez le câble à quelques centimètres de son connecteur et amenez-le dans le guide-câbles. Puis, sans lâcher le câble, <b>maintenez Espace</b> (ou le clic droit) : la portion sous votre main garde la forme qu\'elle a. Plus vous maintenez, plus le coude est ferme (environ une seconde et demie pour un coude bien ferme). Relâchez Espace, puis le câble : le coude garde sa forme.',
    task: 'Pincez un coude ferme à la sortie d\'un port',
    spot: portToMgrBox,
    tool: 'hand',
    done: (c) => c.world.sim.pinches.some((p) => p.s >= 0.7 && p !== c.world.sim.pinchHeld),
  },
  {
    title: 'Voir et défaire un coude',
    text: 'Survolez un câble : ses coudes pincés apparaissent en <b>anneaux</b>, plus vifs quand le coude est ferme. Le coude sous le curseur devient <span class="warn">orange</span> : <b>Espace</b> le défait. Pour changer la forme d\'un coude, pincez de nouveau au même endroit : le nouveau coude remplace l\'ancien.',
    task: 'Survolez un coude pincé',
    tool: 'hand',
    done: (c) => c.cableView.pinchHover >= 0,
  },
  {
    title: 'La goulotte',
    text: 'La <b>goulotte</b> se fixe dans un couloir latéral. Elle descend les câbles le long des montants et cache le <b>mou</b> (la longueur en trop). Prenez l\'outil <b>Supports</b> (touche 2) et cliquez dans le couloir entouré : dans un couloir, il pose une goulotte ; dans une unité vide, un guide-câbles.',
    task: 'Posez une goulotte',
    spot: sideBox,
    tool: 'supports',
    done: (c) => c.world.rack.items.some((i) => i.kind === 'duct'),
  },

  {
    title: 'Ranger dans la goulotte',
    text: 'Avec l\'outil <b>Chemin</b>, tracez le chemin d\'un câble par le guide-câbles, puis le long de la goulotte, jusqu\'à son port. Le câble entre dans la goulotte par la <b>fente</b> de sa face avant, et sa longueur en trop y pend en boucle.',
    task: 'Mettez un câble dans la goulotte',
    tool: 'route',
    done: (c) => held(c, 'duct') >= 4,
  },


  {
    title: 'La seconde main',
    text: 'À la main, il faut parfois tenir un câble à deux endroits : avec une seule main, tirer le bout défait ce qu\'on vient de poser. Tenez le câble là où il doit rester et appuyez sur <b>E</b> : <b>l\'autre main</b> le tient sur place (une lueur ambrée la signale) et la vôtre est libre. Saisissez le câble plus loin, amenez-le dans la goulotte et pincez le virage avec <b>Espace</b>. Enfin, sans rien tenir, appuyez sur <b>E</b> : l\'autre main lâche le câble.',
    task: 'Passez un câble à l\'autre main (E)',
    spot: (c) => {
      const m = mgrBox(c), s = sideBox(c);
      return m ? { min: [Math.min(m.min[0], s.min[0]), Math.min(m.min[1], s.min[1]), Math.min(m.min[2], s.min[2])], max: [Math.max(m.max[0], s.max[0]), Math.max(m.max[1], s.max[1]), Math.max(m.max[2], s.max[2])] } : s;
    },
    tool: 'hand',
    done: (c) => c.counters.handedOver >= 1,
  },
  {
    title: 'L\'anneau',
    text: 'Plus léger qu\'une goulotte, l\'<b>anneau</b> guide un câble vertical dans un couloir latéral : outil Supports, <b>Maj</b> + clic dans un couloir (ou un simple clic quand il n\'y a plus de goulotte). C\'est un crochet ouvert à l\'avant, côté extérieur. Pratique pour quelques câbles ; au-delà, la goulotte tient mieux le mou.',
  },

  {
    title: 'Le velcro',
    text: 'Le <b>velcro</b> (touche 3) serre en faisceau des câbles côte à côte. <b>Tracez un trait en travers</b> des câbles à serrer : ceux qu\'il croise s\'allument, et au relâcher le velcro les serre là où le trait les croise. Il se place là où le plus de câbles passent côte à côte, et laisse de côté un câble croisé plus loin. Cliquez sur un velcro pour l\'enlever. Un faisceau d\'un seul service se lit mieux. Jamais de collier serré sur une fibre : il l\'écrase !',
    task: 'Posez un velcro',
    tool: 'velcro',
    done: (c) => c.world.straps.length > 0,
  },

  {
    title: 'Le bon cordon',
    text: 'Un rangement parfait passe par des cordons <b>à la bonne longueur</b> : trop longs, ils font du mou partout ; trop courts, ils sont <b>tendus</b> et ne valent pas ★★★. Le <b>Stock</b> (touche 0) fournit des cordons neufs, en nombre limité par longueur : ils arrivent dans le bac. Pour remplacer un cordon branché, il faut le débrancher, et donc couper sa liaison le temps de changer.',
    task: 'Prenez un cordon neuf au Stock',
    done: (c) => c.world.cablesVersion > 0,
  },
  {
    title: 'Le bac et le traceur',
    text: 'Comme un vrai technicien, on peut tout <b>débrancher et déposer</b> dans le bac au sol : survolez un câble et appuyez sur <b>Suppr</b>. Reprenez-le à la main quand vous voulez. Pour savoir où va un câble dans le tas, survolez-le et appuyez sur <b>T</b> : il clignote et ses deux ports s\'entourent.',
    spot: (c) => { const k = c.world.rack.crate(); return { min: k.min, max: k.max }; },
    task: 'Déposez un câble dans le bac (Suppr)',
    tool: 'hand',
    done: (c) => c.counters.deposited > 0,
  },

  {
    title: 'Les services',
    text: 'Chaque liaison appartient à un <b>service</b> (sa couleur dans le plan ; survolez-le pour savoir ce qu\'il porte). Un cordon branché comme prévu reçoit tout seul son <b>étiquette</b>. Dans une baie en production (⚡), chaque seconde où une liaison est coupée coûte le poids de son service sur un <b>budget d\'interruption</b> : l\'Admin ×4, la Voix et le Stockage ×3, la Vidéo ×2, les Données ×1, les Invités presque rien. Une <b>dérivation</b> (clic sur le ⚡ d\'une ligne du plan) porte le trafic d\'une liaison pendant qu\'on la recâble.',
  },

  {
    title: 'Le score',
    text: 'Quatre critères, dans le panneau de droite : les <b>connexions</b> conformes au plan (obligatoires pour valider), le <b>rangement</b> (aucune portion de plus de 20 cm ne pend hors d\'un support), la <b>façade dégagée</b> (aucun câble devant le port d\'un autre) et l\'absence de <b>tension</b> (aucun cordon tendu, aucune fibre pliée). De une à trois étoiles ; il en faut <b>deux</b> pour ouvrir le niveau suivant. La <b>lisibilité</b>, sur 100, départage les baies parfaites : le mou juste, les couleurs, les faisceaux, les croisements. À vous !',
  },

];

export class Tutorial {
  private i = 0;
  private el: HTMLElement;
  private poll: number;
  /** the move to the next step, a moment after a task is done */
  private advance = 0;
  private doneAt = -1;

  constructor(private ctl: Controller, private hud: { selectTool(t: Tool): void }, private actions: { showcase(): void; play(): void }) {
    this.el = document.getElementById('tuto')!;
    this.el.classList.add('on');
    document.body.classList.add('tutorial');
    (this.el.querySelector('#tuto-prev') as HTMLElement).onclick = () => this.go(this.i - 1);
    (this.el.querySelector('#tuto-next') as HTMLElement).onclick = () => this.next();
    (this.el.querySelector('#tuto-skip') as HTMLElement).onclick = () => { this.markDone(); this.actions.play(); };
    (this.el.querySelector('#tuto-show') as HTMLElement).onclick = () => this.actions.showcase();
    (this.el.querySelector('#tuto-play') as HTMLElement).onclick = () => this.actions.play();
    this.poll = window.setInterval(() => this.check(), 200);
    this.go(0);
  }

  dispose(): void {
    clearInterval(this.poll);
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
    (this.el.querySelector('#tuto-n') as HTMLElement).textContent = `${this.i + 1} / ${STEPS.length}`;
    (this.el.querySelector('#tuto-title') as HTMLElement).textContent = s.title;
    (this.el.querySelector('#tuto-text') as HTMLElement).innerHTML = s.text;
    const task = this.el.querySelector('#tuto-task') as HTMLElement;
    task.style.display = s.task ? '' : 'none';
    task.classList.remove('done');
    task.textContent = s.task ?? '';
    (this.el.querySelector('#tuto-prev') as HTMLButtonElement).disabled = this.i === 0;
    const last = this.i === STEPS.length - 1;
    (this.el.querySelector('#tuto-end') as HTMLElement).style.display = last ? '' : 'none';
    this.setNext();
  }

  private setNext(): void {
    const s = STEPS[this.i];
    const b = this.el.querySelector('#tuto-next') as HTMLButtonElement;
    const pending = !!s.done && this.doneAt < 0;
    b.style.display = this.i === STEPS.length - 1 ? 'none' : '';
    b.textContent = pending ? 'Passer →' : 'Suivant →';
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
