// Entry point: speaks the language chosen, reads the page's options, creates
// the stage at the quality chosen and the game (app/), then opens the title
// screen. Every visit opens on it.

import { Stage } from './render/stage';
import { App } from './app/app';
import { aisleSettings, readUrlOptions } from './app/urlOptions';
import { SHOWCASE_DEFAULT } from './game/levels/showcaseRack';
import { TUTORIAL } from './game/levels/campaign';
import type { LevelDef } from './game/levels/levelDef';
import { loadBaked } from './game/mess/baked';
import bakedUrl from './game/mess/showcase.bin?url';
import { $ } from './lib/page';
import { showGpuNotice } from './ui/notice';
import { load } from './ui/storage';
import { QUALITY } from './render/quality';
import { onLanguageChange, setLanguage } from './ui/language';
import { writePageTexts } from './ui/pageTexts';

// the language first: everything written from now on is in it
setLanguage(load('language'));
writePageTexts();
onLanguageChange(() => writePageTexts());

const options = readUrlOptions(location.search);
const aisles = aisleSettings(options);
const stage = await Stage.create($('#view'), showGpuNotice, options.forceWebGL);
// ?quality=N holds a level for this visit only; otherwise, the one chosen (or reached by auto) last time
stage.setQuality(options.quality !== null ? { kind: 'fixed', settings: QUALITY[options.quality] } : load('quality'));
// the fallen mess of the default aisle, fetched while the rest starts
const baked = aisles.isDefault && aisles.firstSeed === SHOWCASE_DEFAULT.seed ? loadBaked(bakedUrl) : Promise.resolve(null);
const app = new App(stage, aisles, !options.syncPhysics, baked);
app.startShowcase();
// a cabinet shared by its link opens at once
if (options.rack) app.openRack(options.rack);

// dev handle
(window as any).game = {
  get ctl() { return app.ctl; },
  get showcase() { return app.showcase; },
  hud: app.hud,
  start: (level: LevelDef, brief?: boolean) => app.startLevel(level, brief),
  startShowcase: () => app.startShowcase(),
  TUTORIAL,
};
if (import.meta.env.DEV) void import('./dev/testkit').then((m) => m.installTestkit(() => app.ctl, stage));
