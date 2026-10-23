import { Stage } from './render/stage';
import { Controller } from './game/controller';
import { Hud } from './ui/hud';
import { Showcase } from './ui/showcase';
import { Tutorial } from './ui/tutorial';
import { LEVELS, TUTORIAL, freeLevel, type LevelDef } from './game/levels';

const stage = new Stage(document.getElementById('view')!);
let ctl: Controller | null = null;
let mode: { dispose(): void } | null = null;
/** bumps on every scene change: a slow load that has been overtaken throws its result away */
let sceneToken = 0;
/** loads in progress: the veil stays up while any is running */
let loads = 0;
function loadStarted(): void {
  loads++;
  document.getElementById('loading')!.classList.add('on');
}
function loadEnded(): void {
  loads = Math.max(0, loads - 1);
  if (loads === 0) {
    const l = document.getElementById('loading')!;
    l.classList.remove('on');
    l.querySelector('p')!.textContent = 'Emmêlage des câbles…';
  }
}
// ?sync keeps the physics on the main thread (deterministic, for automated checks)
const syncPhysics = new URLSearchParams(location.search).has('sync');

const hud = new Hud((level) => start(level));

function start(level: LevelDef, brief = true): void {
  sceneToken++;
  loadStarted();
  // let the overlay paint before the (blocking) settle of the mess
  setTimeout(() => {
    mode?.dispose();
    mode = null;
    showcase = null;
    ctl?.dispose();
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
    loadEnded();
    if (level.tutorial) mode = new Tutorial(ctl, hud, { showcase: startShowcase, play: playNext });
    else if (brief) hud.showBrief(level);
    measureInsets();
  }, 30);
}

/** the before/after closet: no level, no controller */
function startShowcase(): void {
  const token = ++sceneToken;
  const text = document.getElementById('loading')!.querySelector('p')!;
  loadStarted();
  setTimeout(async () => {
    mode?.dispose();
    mode = null;
    showcase = null;
    ctl?.dispose();
    ctl = null;
    hud.ctl = null;
    document.getElementById('menu')!.classList.remove('on');
    const sc = await Showcase.create(stage, !syncPhysics, { play: playNext, tutorial: () => start(TUTORIAL), another: startShowcase }, (f) => {
      text.textContent = `Le technicien précédent est passé par là… ${Math.round(f * 100)} %`;
    });
    if (token !== sceneToken) { sc.dispose(); loadEnded(); return; }
    mode = sc;
    showcase = sc;
    loadEnded();
    measureInsets();
  }, 30);
}
let showcase: Showcase | null = null;

/** the first level without stars, or the menu once they all have some */
function playNext(): void {
  const next = LEVELS.find((l) => !hud.progress.stars[l.id]);
  if (next) start(next);
  else hud.showMenu();
}

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

// frame the cabinet in the space the panels leave free (hidden panels leave it all)
function measureInsets(): void {
  const vis = (id: string) => {
    const el = document.getElementById(id)!;
    return getComputedStyle(el).display !== 'none' ? el.getBoundingClientRect() : null;
  };
  const tb = vis('toolbar'), side = vis('side'), top = vis('topbar');
  const tuto = document.getElementById('tuto')!.classList.contains('on');
  const demo = document.body.classList.contains('demo');
  stage.setInsets({
    left: tb ? tb.right : 0,
    right: side ? Math.max(0, window.innerWidth - side.left) : 0,
    top: top ? top.bottom : 0,
    bottom: tuto ? 230 : demo ? document.getElementById('showcase')!.getBoundingClientRect().height + 24 : 50,
  });
}
window.addEventListener('resize', measureInsets);
new ResizeObserver(measureInsets).observe(document.getElementById('side')!);

// first visit: the before/after, which leads to the tutorial; afterwards, the menu
let seen = false;
try { seen = localStorage.getItem('cable.tutorial') === 'done' || Object.keys(hud.progress.stars).length > 0; } catch { /* private mode */ }
if (!seen) startShowcase();
else {
  start(LEVELS[0], false);
  hud.showMenu();
}

// dev handle
(window as any).game = { get ctl() { return ctl; }, get showcase() { return showcase; }, hud, start, startShowcase, TUTORIAL };
if (import.meta.env.DEV) void import('./dev/testkit').then((m) => m.installTestkit(() => ctl));
