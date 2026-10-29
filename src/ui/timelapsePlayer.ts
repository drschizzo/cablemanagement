// The timelapse of the work, once the cabinet is signed off: its frames
// played in a loop, and saved as a video to share (made in the page, frame by
// frame, with the browser's own encoder).

import { hide, show } from './dom';
import { downloadBlob } from './share';
import { $ } from '../lib/page';
import { tr } from './language';

/** frames a second, played and saved */
const FPS = 12;
/** s the last frame (the cabinet signed off) is held at the end */
const HOLD_END_S = 1.5;
/** the formats tried for the video, the best first (Safari only records MP4) */
const VIDEO_TYPES = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'];

export class TimelapsePlayer {
  private canvas = $<HTMLCanvasElement>('#tl-canvas');
  private frames: readonly Blob[] = [];
  private timer = 0;
  private playing = 0;
  private name = 'brassage';

  constructor() {
    $('#tl-close').onclick = () => this.close();
    $('#tl-video').onclick = () => void this.saveVideo();
  }

  /** plays `frames` in a loop; `name`: the file name of the video, without extension; `back`: on Close */
  show(frames: readonly Blob[], name: string, back: () => void): void {
    this.frames = frames;
    this.name = name;
    this.back = back;
    $('#tl-status').textContent = tr({ fr: `${frames.length} images`, en: `${frames.length} frames` });
    $<HTMLButtonElement>('#tl-video').disabled = !frames.length || !videoType();
    $<HTMLButtonElement>('#tl-video').textContent = tr({ fr: '⤓ Télécharger la vidéo', en: '⤓ Download the video' });
    show('#timelapse');
    this.play();
  }

  private back = () => {};

  private close(): void {
    clearTimeout(this.timer);
    hide('#timelapse');
    this.back();
  }

  /** frame after frame, in a loop, until closed */
  private play(): void {
    const run = ++this.playing;
    let k = 0;
    const next = async () => {
      if (run !== this.playing || !$('#timelapse').classList.contains('on') || !this.frames.length) return;
      await this.draw(this.frames[k]);
      const last = k === this.frames.length - 1;
      k = (k + 1) % this.frames.length;
      this.timer = window.setTimeout(() => void next(), last ? HOLD_END_S * 1000 : 1000 / FPS);
    };
    void next();
  }

  /** a frame on the canvas, sized to it */
  private async draw(frame: Blob): Promise<void> {
    const image = await createImageBitmap(frame);
    if (this.canvas.width !== image.width || this.canvas.height !== image.height) {
      this.canvas.width = image.width;
      this.canvas.height = image.height;
    }
    this.canvas.getContext('2d')!.drawImage(image, 0, 0);
    image.close();
  }

  /** the frames, once more from the start, recorded off the canvas into a video file */
  private async saveVideo(): Promise<void> {
    const type = videoType();
    if (!type || !this.frames.length) return;
    this.playing++;
    clearTimeout(this.timer);
    const button = $<HTMLButtonElement>('#tl-video');
    button.disabled = true;
    button.textContent = tr({ fr: 'Enregistrement…', en: 'Recording…' });
    await this.draw(this.frames[0]);
    const recorder = new MediaRecorder(this.canvas.captureStream(FPS), { mimeType: type });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    recorder.start();
    for (const frame of this.frames) {
      await this.draw(frame);
      await wait(1000 / FPS);
    }
    await wait(HOLD_END_S * 1000);
    recorder.stop();
    await done;
    downloadBlob(new Blob(chunks, { type }), `${this.name}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`);
    button.disabled = false;
    button.textContent = tr({ fr: '⤓ Télécharger la vidéo', en: '⤓ Download the video' });
    this.play();
  }
}

/** the video format this browser records, or null when it records none */
function videoType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
