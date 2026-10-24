// Entry point: puts together the stage (render/), the scenes (a level run by
// game/controller, the tutorial over a level, the title screen over the
// before/after showcase) and the interface (ui/), then opens the title screen.
//
// One scene at a time: every load bumps `sceneToken`, and a load that has been
// overtaken by another throws its result away.

import { Stage } from './render/stage';
import { Controller } from './game/controller';
import { Hud } from './ui/hud';
import { Showcase } from './ui/showcase';
import { Tutorial } from './ui/tutorial';
import { LEVELS, TUTORIAL, UNLOCK_STARS, freeLevel, type LevelDef } from './game/levels';
import { load } from './storage';

const stage = new Stage(document.getElementById('view')!);
let ctl: Controller | null = null;
let showcase: Showcase | null = null;
/** what runs over the scene (tutorial) or is the scene (showcase) */
let mode: { dispose(): void } | null = null;
/** bumps on every scene change: a slow load that has been overtaken throws its result away */
let sceneToken = 0;
// ?sync keeps the physics on the main thread (deterministic, for automated checks)
const syncPhysics = new URLSearchParams(location.search).has('sync');
// ?seed=N draws the same before/after closet every time (the first one only)
let showcaseSeed: number | undefined = Number(new URLSearchParams(location.search).get('seed')) || undefined;
// ?bays=N: how many closets stand side by side in the before/after aisle
const showcaseBays = Math.max(1, Math.min(16, Number(new URLSearchParams(location.search).get('bays')) || 5));

const hud = new Hud((level) => start(level));

// ------------------------------------------------------------- loading veil

const veil = document.getElementById('loading')!;
/** loads in progress: the veil stays up while any is running */
let loads = 0;

function loadStarted(): void {
  loads++;
  veil.classList.add('on');
}

function loadEnded(): void {
  loads = Math.max(0, loads - 1);
  if (loads > 0) return;
  veil.classList.remove('on');
}

/** runs a scene load once the veil has painted; `build` only runs if no other load overtook it */
function loadScene(build: (token: number) => void | Promise<void>): void {
  const token = ++sceneToken;
  loadStarted();
  // let the veil paint before the (blocking) settle of the mess
  setTimeout(async () => {
    try {
      if (token === sceneToken) await build(token);
    } finally {
      loadEnded();
    }
  }, 30);
}

/** leaves the current scene, whatever it is */
function leaveScene(): void {
  // a title screen still loading is left too
  document.body.classList.remove('demo', 'booting');
  mode?.dispose();
  mode = null;
  showcase = null;
  ctl?.dispose();
  ctl = null;
  hud.ctl = null;
}

// ------------------------------------------------------------------ scenes

function start(level: LevelDef, brief = true): void {
  loadScene(() => {
    leaveScene();
    ctl = new Controller(stage, level, {
      onEval: (ev) => hud.onEval(ev),
      onInventory: () => hud.refreshInventory(),
      onHover: (t, x, y) => hud.onHover(t, x, y),
      onToast: (t) => hud.toast(t),
      onStats: (t) => hud.stats(t),
      onLengthMenu: (c, x, y) => hud.showLengthMenu(c, x, y),
      onHint: (t) => hud.hint(t),
    }, !syncPhysics);
    hud.attach(ctl, level);
    if (level.tutorial) mode = new Tutorial(ctl, hud, { showcase: startShowcase, play: playNext });
    else if (brief) hud.showBrief(level);
    measureInsets();
  });
}

/** the title screen: the before/after aisle, with the game's name and its menu over it */
function startShowcase(): void {
  loadScene(async (token) => {
    leaveScene();
    document.getElementById('menu')!.classList.remove('on');
    // the game's panels stay hidden, the title shows its own progress while the aisle falls
    document.body.classList.add('demo', 'booting');
    refreshTitle();
    titleProgress(0);
    const sc = await Showcase.create(stage, !syncPhysics, { another: startShowcase }, titleProgress, showcaseSeed, showcaseBays);
    showcaseSeed = undefined;
    // overtaken while it was falling: thrown away before it ever showed
    if (token !== sceneToken) { sc.dispose(); return; }
    mode = showcase = sc;
    document.body.classList.remove('booting');
    sc.start();
    measureInsets();
  });
}

/** the first level not yet tidy enough to open the next one, or the menu once they all are */
function playNext(): void {
  const next = LEVELS.find((l) => (hud.progress.stars[l.id] ?? 0) < UNLOCK_STARS);
  if (next) start(next);
  else hud.showMenu();
}

// ------------------------------------------------------------ title screen

const titleFill = document.querySelector<HTMLElement>('#title-load .fill')!;
const titleLoadText = document.querySelector<HTMLElement>('#title-load span')!;

function titleProgress(f: number): void {
  titleFill.style.width = `${Math.round(f * 100)}%`;
  titleLoadText.textContent = f < 1 ? `Le technicien précédent est passé par là… ${Math.round(f * 100)} %` : 'Prêt.';
}

/** a first visit starts with the tutorial; afterwards, where the player left off */
const firstVisit = () => !load('tutorialDone') && Object.keys(hud.progress.stars).length === 0;

function refreshTitle(): void {
  const next = LEVELS.find((l) => (hud.progress.stars[l.id] ?? 0) < UNLOCK_STARS);
  const play = document.getElementById('title-play')!;
  play.textContent = firstVisit() ? 'Commencer →' : next && next !== LEVELS[0] ? `Continuer · ${next.title} →` : 'Jouer →';
  play.title = firstVisit() ? 'Le tutoriel, puis le niveau 1' : '';
}

document.getElementById('title-play')!.onclick = () => { if (firstVisit()) start(TUTORIAL); else playNext(); };
document.getElementById('title-tuto')!.onclick = () => start(TUTORIAL);
document.getElementById('title-levels')!.onclick = () => hud.showMenu();

// -------------------------------------------------------------------- menu

document.getElementById('menu-close')!.onclick = () => document.getElementById('menu')!.classList.remove('on');
document.getElementById('menu-tuto')!.onclick = () => { document.getElementById('menu')!.classList.remove('on'); start(TUTORIAL); };
document.getElementById('menu-show')!.onclick = startShowcase;

const n = document.getElementById('free-n') as HTMLInputElement;
const nv = document.getElementById('free-n-val')!;
n.oninput = () => { nv.textContent = `${n.value} câbles`; };
document.getElementById('free-go')!.onclick = () => {
  document.getElementById('menu')!.classList.remove('on');
  start(freeLevel(Number(n.value), Math.floor(Math.random() * 1e9)));
};

setInterval(() => hud.tick(), 250);

// ------------------------------------------------------------------ layout

// frame the cabinet in the space the panels leave free (hidden panels leave it all)
function measureInsets(): void {
  const vis = (id: string) => {
    const el = document.getElementById(id)!;
    return getComputedStyle(el).display !== 'none' ? el.getBoundingClientRect() : null;
  };
  const tb = vis('toolbar'), side = vis('side'), top = vis('topbar');
  const tuto = document.getElementById('tuto')!.classList.contains('on');
  const demo = document.body.classList.contains('demo');
  // the title slides into place: its resting top, not where it is in its slide
  const title = document.getElementById('title')!;
  stage.setInsets({
    left: tb ? tb.right : 0,
    right: side ? Math.max(0, window.innerWidth - side.left) : 0,
    top: demo ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--title-top')) + title.offsetHeight : top ? top.bottom : 0,
    bottom: tuto ? 230 : demo ? document.getElementById('showcase')!.getBoundingClientRect().height + 24 : 50,
  });
}
window.addEventListener('resize', measureInsets);
new ResizeObserver(measureInsets).observe(document.getElementById('side')!);

// ------------------------------------------------------------------- start

// every visit opens on the title screen
startShowcase();

// dev handle
(window as any).game = { get ctl() { return ctl; }, get showcase() { return showcase; }, hud, start, startShowcase, TUTORIAL };
if (import.meta.env.DEV) void import('./dev/testkit').then((m) => m.installTestkit(() => ctl, stage));
