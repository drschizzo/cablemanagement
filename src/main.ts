// Entry point: reads the page's options, creates the stage and the game
// (app/), then opens the title screen. Every visit opens on it.

import { Stage } from './render/stage';
import { App } from './app/app';
import { aisleSettings, readUrlOptions } from './app/urlOptions';
import { followInsets } from './app/viewInsets';
import { SHOWCASE_DEFAULT } from './game/levels/showcaseRack';
import { TUTORIAL } from './game/levels/campaign';
import type { LevelDef } from './game/levels/levelDef';
import { loadBaked } from './game/mess/baked';
import bakedUrl from './game/mess/showcase.bin?url';
import { $ } from './page';

const options = readUrlOptions(location.search);
const aisles = aisleSettings(options);
const stage = new Stage($('#view'));
// the fallen mess of the default aisle, fetched while the rest starts
const baked = aisles.isDefault && aisles.firstSeed === SHOWCASE_DEFAULT.seed ? loadBaked(bakedUrl) : Promise.resolve(null);
const app = new App(stage, aisles, !options.syncPhysics, baked);
followInsets(stage);
app.startShowcase();

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
