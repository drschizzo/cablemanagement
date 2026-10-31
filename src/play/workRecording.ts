// The work as it went: the cabinet as the player found it (an image), the
// timelapse keyed a few times a second of play, and that timelapse played
// again in place of the cabinet, by the game's own views (replayView.ts).

import type * as THREE from 'three/webgpu';
import type { Stage } from '../render/stage';
import type { RackView } from '../render/rackView';
import type { World } from '../game/world';
import { Timelapse } from './timelapse';
import { ReplayRecorder, type ReplayKey } from './replay';
import { ReplayView } from './replayView';

/** the work played again (see start): before each image, `advance` sets what it shows; `drawn` once it is drawn */
export interface Playback {
  advance(dt: number): void;
  drawn(): void;
}

export class WorkRecording {
  /** the state of the cabinet a few times a second of play */
  readonly timelapse = new Timelapse<ReplayKey>();
  /** the cabinet as the player found it (image), taken on the first image drawn */
  before: string | null = null;
  private recorder: ReplayRecorder;
  /** a key wanted at the next image, whatever the pace (the cabinet signed off) */
  private keyWanted = false;
  /** the work played again in place of the cabinet, and what drives it */
  private replay: { view: ReplayView; playback: Playback } | null = null;

  /** `velcro`: the colour the player gave the velcros */
  constructor(private stage: Stage, private world: World, private rackView: RackView, private velcro: string) {
    this.recorder = new ReplayRecorder(world, rackView);
  }

  /** the work is being played again: the cabinet's own state is not shown */
  get replaying(): boolean {
    return this.replay !== null;
  }

  /** the next image keys the timelapse, whatever the pace */
  wantKey(): void {
    this.keyWanted = true;
  }

  /** after `dt` s (`playing`: the clock ran), a key when one is due; the first is the cabinet as found */
  keep(elapsed: number, dt: number, playing: boolean): void {
    if (this.keyWanted || !this.timelapse.frames.length || (playing && this.timelapse.due(dt))) {
      this.keyWanted = false;
      this.timelapse.add(this.recorder.key(elapsed));
    }
  }

  /** plays the recorded work again in place of the cabinet, until stop: `playback` sets the moment shown before each image */
  start(playback: Playback): ReplayView {
    this.stop();
    const view = new ReplayView(this.timelapse.frames, this.stage.scene, this.rackView, this.world, this.velcro);
    this.replay = { view, playback };
    // every frame at full rate: the replay moves all along
    this.stage.moving = true;
    return view;
  }

  /** back to the cabinet as it is; false when nothing was played */
  stop(): boolean {
    if (!this.replay) return false;
    this.replay.view.dispose();
    this.replay = null;
    this.stage.moving = false;
    return true;
  }

  /** an image of the replay after `dt` s: `hidden` (the cabinet's own cords, the overlays) is hidden meanwhile */
  draw(dt: number, hidden: THREE.Object3D[]): void {
    const playback = this.replay!.playback;
    playback.advance(dt);
    const wasVisible = hidden.map((o) => o.visible);
    for (const o of hidden) o.visible = false;
    this.stage.render();
    hidden.forEach((o, i) => { o.visible = wasVisible[i]; });
    playback.drawn();
  }
}
