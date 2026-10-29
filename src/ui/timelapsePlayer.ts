// The timelapse of the work, once the cabinet is signed off: the recorded
// state of the cabinet played again by the game's own views (see
// play/replay.ts), at the screen's rate, the camera drifting slowly; each
// image copied onto the canvas of the panel, in a loop. Saved as a video to
// share: the canvas recorded over one loop, with the browser's own encoder.

import { hide, show } from './dom';
import { downloadBlob } from './share';
import { $ } from '../lib/page';
import { tr } from './language';
import { formatTime } from './format';
import { grabFrame } from '../render/frameGrab';
import { replayPose } from '../render/cameraTour';
import type { Controller } from '../play/controller';
import type { ReplayView } from '../play/replayView';

/** s: the cabinet as found, held; the work; the cabinet signed off, held */
const HOLD_START_S = 0.8;
const WORK_S = 5;
const HOLD_END_S = 1.7;
const LOOP_S = HOLD_START_S + WORK_S + HOLD_END_S;
/** px high at most, the images of the timelapse (and of the video) */
const MAX_HEIGHT = 1080;
/** frames a second, and bits a second, of the video */
const VIDEO_FPS = 60;
const VIDEO_BITRATE = 5e6;
/** the formats tried for the video, the best first (Safari only records MP4) */
const VIDEO_TYPES = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm', 'video/mp4'];

/** smooth in and out, 0..1 */
function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

export class TimelapsePlayer {
  private canvas = $<HTMLCanvasElement>('#tl-canvas');
  private ctl: Controller | null = null;
  private view: ReplayView | null = null;
  /** s into the loop */
  private t = 0;
  private name = 'brassage';
  /** the video being recorded: it stops at the end of the loop */
  private recording: { recorder: MediaRecorder; done: Promise<void> } | null = null;
  private back = () => {};

  constructor() {
    $('#tl-close').onclick = () => this.close();
    $('#tl-video').onclick = () => void this.saveVideo();
  }

  /** plays the work of `ctl` in a loop; `name`: the file name of the video, without extension; `back`: on Close */
  show(ctl: Controller, name: string, back: () => void): void {
    this.ctl = ctl;
    this.name = name;
    this.back = back;
    this.t = 0;
    const time = formatTime(ctl.elapsed);
    $('#tl-status').textContent = tr({ fr: `${time} de travail en ${WORK_S} secondes`, en: `${time} of work in ${WORK_S} seconds` });
    this.setButton(false);
    show('#timelapse');
    this.view = ctl.startReplay({ advance: (dt) => this.advance(dt), drawn: () => grabFrame(ctl.stage, this.canvas, MAX_HEIGHT) });
  }

  private close(): void {
    this.recording?.recorder.stop();
    this.recording = null;
    this.ctl?.stopReplay();
    this.ctl = this.view = null;
    hide('#timelapse');
    this.back();
  }

  /** the moment shown and the camera, `dt` s on */
  private advance(dt: number): void {
    const view = this.view, ctl = this.ctl;
    if (!view || !ctl) return;
    this.t += dt;
    if (this.t >= LOOP_S) {
      // a video ends with the loop
      if (this.recording) { this.recording.recorder.stop(); this.recording = null; }
      this.t %= LOOP_S;
    }
    view.show(ease(Math.max(0, Math.min(1, (this.t - HOLD_START_S) / WORK_S))));
    ctl.stage.place(replayPose(this.t / LOOP_S));
  }

  /** one loop from the start, recorded off the canvas into a video file */
  private async saveVideo(): Promise<void> {
    const type = videoType();
    if (!type || !this.ctl || this.recording) return;
    this.setButton(true);
    const recorder = new MediaRecorder(this.canvas.captureStream(VIDEO_FPS), { mimeType: type, videoBitsPerSecond: VIDEO_BITRATE });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    this.t = 0;
    recorder.start();
    this.recording = { recorder, done };
    await done;
    // closed meanwhile: no file
    if (this.ctl) downloadBlob(new Blob(chunks, { type }), `${this.name}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`);
    this.setButton(false);
  }

  private setButton(recording: boolean): void {
    const button = $<HTMLButtonElement>('#tl-video');
    button.disabled = recording || !videoType();
    button.textContent = recording ? tr({ fr: 'Enregistrement…', en: 'Recording…' }) : tr({ fr: '⤓ Télécharger la vidéo', en: '⤓ Download the video' });
  }
}

/** the video format this browser records, or null when it records none */
function videoType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}
