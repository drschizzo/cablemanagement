// What each step of the tutorial says (play/tutorialSteps.ts): its title,
// its text, and the task it asks when it has one.

import type { StepId } from '../play/tutorialSteps';
import type { Words } from '../lib/language';
import { STOCK_KEY, toolKey } from './toolbar';
import { DELETE_KEY } from './keyHints';

export interface StepText {
  title: Words;
  text: Words;
  /** what to do, when the step ticks itself off */
  task?: Words;
}

export const STEP_TEXTS: Record<StepId, StepText> = {
  welcome: {
    title: { fr: 'Bienvenue dans la baie', en: 'Welcome to the cabinet' },
    text: {
      fr: 'Voici une baie de brassage 19 pouces. En haut, le <b>panneau de brassage</b> (« A ») reçoit les câbles des bureaux ; en bas, le <b>switch</b> (« S ») est l\'équipement actif du réseau. Le <b>plan de brassage</b>, à droite, dit quel port relier à quel port. Le voyant d\'un port : <span class="ok">vert</span> = liaison conforme au plan, <span class="warn">orange</span> = mauvais port. Votre métier : brancher chaque liaison, puis ranger les câbles.',
      en: 'This is a 19-inch patching cabinet. At the top, the <b>patch panel</b> (“A”) takes the cables from the offices; below, the <b>switch</b> (“S”) is the active equipment of the network. The <b>patching schedule</b>, on the right, says which port goes to which. The LED of a port: <span class="ok">green</span> = link as planned, <span class="warn">orange</span> = wrong port. Your job: plug each link, then tidy the cords.',
    },
  },
  cords: {
    title: { fr: 'Les câbles', en: 'The patch cords' },
    text: {
      fr: 'Ce sont des câbles cuivre terminés par des prises RJ45. Chaque liaison appartient à un <b>service</b> (sa couleur dans le plan), et son câble en porte la couleur. Survolez un câble : sa bulle dit où il est branché.',
      en: 'These are copper cords ending in RJ45 plugs. Each link belongs to a <b>service</b> (its colour on the schedule), and its cord wears that colour. Hover a cord: its tooltip says where it is plugged.',
    },
    task: { fr: 'Survolez deux câbles différents', en: 'Hover two different cords' },
  },
  grab: {
    title: { fr: 'Saisir et tirer', en: 'Grab and pull' },
    text: {
      fr: '<b>Clic gauche</b> sur un câble, puis glissez : il suit la main, glisse et frotte contre les autres comme un vrai câble. Pour le passer devant ou derrière un autre câble, <b>maintenez Maj</b> en tirant : la souris vers le haut le pousse vers le fond, vers le bas le ramène vers vous (un fil à plomb montre où il est).',
      en: '<b>Left click</b> on a cord, then drag: it follows the hand, slides and rubs against the others like a real cord. To pass it in front of or behind another cord, <b>hold Shift</b> while pulling: mouse up pushes it to the back, down brings it towards you (a plumb line shows where it is).',
    },
    task: { fr: 'Déplacez un câble d\'une trentaine de centimètres', en: 'Move a cord some thirty centimetres' },
  },
  look: {
    title: { fr: 'Regarder autour', en: 'Look around' },
    text: {
      fr: '<b>Clic droit</b> + glisser pour tourner autour de la baie, <b>glisser dans le vide</b> (ou les flèches) pour déplacer la vue, <b>molette</b> pour zoomer, <b>R</b> pour revenir de face. Quand plusieurs câbles sont empilés sous le curseur, <b>Tab</b> passe au suivant.',
      en: '<b>Right button</b> + drag to turn around the cabinet, <b>drag in empty space</b> (or the arrows) to move the view, <b>wheel</b> to zoom, <b>R</b> to come back to the front. When several cords are stacked under the pointer, <b>Tab</b> goes to the next one.',
    },
    task: { fr: 'Tournez la vue', en: 'Turn the view' },
  },
  unplug: {
    title: { fr: 'Débrancher', en: 'Unplug' },
    text: {
      fr: 'Un câble est sur le mauvais port : son voyant est <span class="warn">orange</span>. Saisissez son <b>connecteur</b> et <b>tirez-le de quelques centimètres</b> : il se débranche.',
      en: 'A cord is in the wrong port: its LED is <span class="warn">orange</span>. Grab its <b>connector</b> and <b>pull it a few centimetres</b>: it comes out.',
    },
    task: { fr: 'Débranchez le câble du mauvais port', en: 'Unplug the cord from the wrong port' },
  },
  plugBack: {
    title: { fr: 'Rebrancher', en: 'Plug back' },
    text: {
      fr: 'Ses deux bons ports sont entourés. Amenez le connecteur devant l\'un d\'eux : le port s\'allume en jaune. Relâchez, il s\'y branche. Une erreur ? <b>Ctrl+Z</b>.',
      en: 'Its two right ports are circled. Bring the connector in front of one: the port lights yellow. Let go, it goes in. A mistake? <b>Ctrl+Z</b>.',
    },
    task: { fr: 'Branchez toutes les liaisons du plan', en: 'Plug every link of the schedule' },
  },
  route: {
    title: { fr: 'Ranger : l\'outil Chemin', en: 'Tidying: the Route tool' },
    text: {
      fr: `Pour ranger un câble, on décide par où il passe. Le <b>guide-câbles</b>, ce panneau 1U à doigts sous le panneau de brassage, mène les câbles à l'horizontale jusqu'aux côtés de la baie au lieu de les laisser pendre devant les ports. Outil <b>Chemin</b> (touche ${toolKey('route').toUpperCase()}) : appuyez sur un câble, puis <b>tracez un trait par-dessus le guide-câbles</b> ; chaque guide retenu s'encadre de vert. Si le trait finit sur un port libre, le bout libre s'y branche. Au relâcher, le câble est posé le long du chemin, puis se colore un moment : <span class="ok">vert</span> là où un support le tient, <span class="warn">orange</span> là où il pend.`,
      en: `To tidy a cord, you decide where it runs. The <b>cable manager</b>, this 1U finger panel under the patch panel, takes the cords horizontally to the sides of the cabinet instead of letting them hang in front of the ports. <b>Route</b> tool (key ${toolKey('route').toUpperCase()}): press on a cord, then <b>draw a line over the cable manager</b>; each guide taken is framed in green. If the line ends on a free port, the loose end is plugged there. When you let go, the cord is laid along the route, then coloured for a moment: <span class="ok">green</span> where a support holds it, <span class="warn">orange</span> where it hangs.`,
    },
    task: { fr: 'Rangez un câble dans le guide-câbles', en: 'Route a cord into the cable manager' },
  },
  stars: {
    title: { fr: 'Les étoiles', en: 'The stars' },
    text: {
      fr: '★ : toutes les liaisons sont branchées. ★★ : tous les câbles sont rangés, et le niveau suivant s\'ouvre. ★★★ : les consignes du niveau sont respectées en plus. Un câble est <b>rangé</b> quand il ne pend pas hors des supports, ne passe devant aucun port et n\'est pas tendu. Sous le plan, <b>la liste des étoiles</b> indique ce que chacune demande et où vous en êtes.',
      en: '★: every link is plugged. ★★: every cord is tidy, and the next level opens. ★★★: the level\'s instructions are met as well. A cord is <b>tidy</b> when it does not hang out of the supports, crosses no port and is not taut. Under the schedule, <b>the list of stars</b> shows what each one asks and where you stand.',
    },
  },
  pinch: {
    title: { fr: 'Pincer un coude', en: 'Pinch a bend' },
    text: {
      fr: 'À la main, on peut aussi donner sa forme à un câble. Sans pli, un câble sort de son port droit vers vous ; <b>plié juste après le connecteur</b>, il descend droit vers le guide-câbles. Saisissez le câble à quelques centimètres de son connecteur et amenez-le dans le guide-câbles. Puis, sans lâcher le câble, <b>maintenez Espace</b> (ou le clic droit) : la portion sous votre main garde la forme qu\'elle a. Plus vous maintenez, plus le coude est ferme (environ une seconde et demie pour un coude bien ferme). Relâchez Espace, puis le câble : le coude garde sa forme.',
      en: 'By hand, a cord can also be shaped. Without a bend, a cord comes straight out of its port towards you; <b>bent just after the connector</b>, it goes straight down to the cable manager. Grab the cord a few centimetres from its connector and bring it into the cable manager. Then, without letting go of the cord, <b>hold Space</b> (or the right button): the stretch under your hand keeps the shape it has. The longer you hold, the firmer the bend (about a second and a half for a firm one). Let go of Space, then of the cord: the bend keeps its shape.',
    },
    task: { fr: 'Pincez un coude ferme à la sortie d\'un port', en: 'Pinch a firm bend where a cord leaves a port' },
  },
  seeBends: {
    title: { fr: 'Voir et défaire un coude', en: 'See and undo a bend' },
    text: {
      fr: 'Survolez un câble : ses coudes pincés apparaissent en <b>anneaux</b>, plus vifs quand le coude est ferme. Le coude sous le curseur devient <span class="warn">orange</span> : <b>Espace</b> le défait. Pour changer la forme d\'un coude, pincez de nouveau au même endroit : le nouveau coude remplace l\'ancien.',
      en: 'Hover a cord: its pinched bends show as <b>rings</b>, brighter when the bend is firm. The bend under the pointer turns <span class="warn">orange</span>: <b>Space</b> undoes it. To change the shape of a bend, pinch again at the same place: the new bend replaces the old one.',
    },
    task: { fr: 'Survolez un coude pincé', en: 'Hover a pinched bend' },
  },
  throwAway: {
    title: { fr: 'Jeter un câble', en: 'Throw a cord away' },
    text: {
      fr: `Un câble qui ne sert plus, trop long ou abîmé va au <b>bac</b>, au sol devant la baie. Survolez-le (ou tenez-le en main) et appuyez sur <b>${DELETE_KEY.fr}</b> : il se débranche, s'enroule et tombe dans le bac. Le <b>Stock</b> (${STOCK_KEY}) fournit des câbles neufs, qui arrivent eux aussi dans le bac. Essayez, puis <b>Ctrl+Z</b> le remet en place.`,
      en: `A cord no longer used, too long or damaged goes to the <b>crate</b>, on the floor in front of the cabinet. Hover it (or hold it in hand) and press <b>${DELETE_KEY.en}</b>: it is unplugged, coiled and dropped in the crate. The <b>Stock</b> (${STOCK_KEY}) provides new cords, which also arrive in the crate. Try it, then <b>Ctrl+Z</b> puts it back.`,
    },
    task: { fr: 'Jetez un câble au bac', en: 'Throw a cord into the crate' },
  },
  duct: {
    title: { fr: 'La goulotte', en: 'The duct' },
    text: {
      fr: `La <b>goulotte</b> se fixe dans un couloir latéral. Elle descend les câbles le long des montants et cache le <b>mou</b> (la longueur en trop). Prenez l'outil <b>Supports</b> (touche ${toolKey('supports')}) et cliquez dans le couloir entouré : dans un couloir, il pose une goulotte ; dans une unité vide, un guide-câbles.`,
      en: `The <b>duct</b> fits in a side channel. It takes the cords down along the posts and hides the <b>slack</b> (the extra length). Take the <b>Supports</b> tool (key ${toolKey('supports')}) and click in the circled channel: in a channel, it places a duct; in an empty unit, a cable manager.`,
    },
    task: { fr: 'Posez une goulotte', en: 'Place a duct' },
  },
  ductRoute: {
    title: { fr: 'Ranger dans la goulotte', en: 'Route through the duct' },
    text: {
      fr: 'Avec l\'outil <b>Chemin</b>, tracez le chemin d\'un câble par le guide-câbles, puis le long de la goulotte, jusqu\'à son port. Le câble entre dans la goulotte par la <b>fente</b> de sa face avant, et sa longueur en trop y pend en boucle.',
      en: 'With the <b>Route</b> tool, draw a cord\'s way through the cable manager, then along the duct, up to its port. The cord goes into the duct through the <b>slit</b> of its front face, and its extra length hangs in a loop inside.',
    },
    task: { fr: 'Mettez un câble dans la goulotte', en: 'Put a cord in the duct' },
  },
  otherHand: {
    title: { fr: 'La seconde main', en: 'The second hand' },
    text: {
      fr: 'À la main, il faut parfois tenir un câble à deux endroits : avec une seule main, tirer le bout défait ce qu\'on vient de poser. Tenez le câble là où il doit rester et appuyez sur <b>E</b> : <b>l\'autre main</b> le tient sur place (une lueur ambrée la signale) et la vôtre est libre. Saisissez le câble plus loin, amenez-le dans la goulotte et pincez le virage avec <b>Espace</b>. Enfin, sans rien tenir, appuyez sur <b>E</b> : l\'autre main lâche le câble.',
      en: 'By hand, a cord sometimes has to be held in two places: with one hand, pulling the end undoes what was just laid. Hold the cord where it must stay and press <b>E</b>: <b>the other hand</b> holds it in place (an amber glow shows it) and yours is free. Grab the cord further along, bring it into the duct and pinch the turn with <b>Space</b>. Last, holding nothing, press <b>E</b>: the other hand lets go of the cord.',
    },
    task: { fr: 'Passez un câble à l\'autre main (E)', en: 'Hand a cord over to the other hand (E)' },
  },
  velcro: {
    title: { fr: 'Le velcro', en: 'The velcro' },
    text: {
      fr: `Le <b>velcro</b> (touche ${toolKey('velcro')}) serre en faisceau des câbles côte à côte. <b>Tracez un trait en travers</b> des câbles à serrer : ceux qu'il croise s'allument, et au relâcher le velcro les serre là où le trait les croise. Il se place là où le plus de câbles passent côte à côte, et laisse de côté un câble croisé plus loin. Cliquez sur un velcro pour l'enlever. Le velcro est facultatif : il ne compte pas pour les étoiles.`,
      en: `The <b>velcro</b> (key ${toolKey('velcro')}) straps cords running side by side into a bundle. <b>Draw a line across</b> the cords to strap: those it crosses light up, and when you let go the velcro straps them where the line crosses them. It goes where most cords run side by side, and leaves out a cord crossed further on. Click a velcro to take it off. The velcro is optional: it does not count for the stars.`,
    },
    task: { fr: 'Posez un velcro', en: 'Place a velcro' },
  },
};
