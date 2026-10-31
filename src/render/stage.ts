// The 3D stage every scene draws on: the renderer, the camera (its moves:
// cameraRig.ts), the lights, and the image (imagePipeline.ts), at the quality
// chosen or stepped down when the GPU cannot keep up (quality.ts).

import * as THREE from 'three/webgpu';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ImagePipeline, type CompileOptions } from './imagePipeline';
import { isHdrShown, onScreenRangeChange, screenIsHdr, type HdrChoice, type HdrSupport } from './hdrScreen';
import { HDR_HEADROOM } from './toneCurve';
import { LED_CLOCK_WRAP, ledClock, ledViewHeight } from './leds';
import { ledGlows } from './ledGlow';
import { gpuAdvice, gpuInfo, type GpuAdvice, type GpuInfo } from './gpu';
import { addLights, createRenderer, keyLight } from './stageSetup';
import { AUTO_QUALITY, QUALITY, drawAlike, settingsOf, type QualityChoice, type QualitySettings } from './quality';
import type { TourPose } from './cameraTour';
import { CameraRig, type ScreenMargins } from './cameraRig';

export type { ScreenMargins } from './cameraRig';

/** how far round the subject everything stays sharp (see focusOnSubject), × the subject's size */
const SHARP_REACH = 0.8;

/** colour of the backdrop where the floor fades out (also the fog) */
const HORIZON = '#1a1e21';

/** Renderer, camera, lights and the image. */
export class Stage {
  /** the image, from the scene to the screen */
  private image: ImagePipeline;
  private lastRender = performance.now();
  scene = new THREE.Scene();
  /** the camera and its moves round the subject */
  readonly rig: CameraRig;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  key: THREE.DirectionalLight;
  /** the fill light: its tint is the look's accent */
  private fill: THREE.DirectionalLight;
  /** the screen covered by the panels of the interface (px from each edge): the cabinet is framed in the rest */
  panelMargins: ScreenMargins = { left: 0, right: 0, top: 0, bottom: 0 };
  /** a scripted motion on screen (the aisle going from one state to the other): its frames keep their full rate */
  moving = false;

  /** when the last frame was drawn and the player last touched anything (ms), for the pacing (see due()) */
  private lastFrame = -Infinity;
  private lastInput = performance.now();

  /** the GPU the browser draws with (see gpu.ts) */
  readonly gpu: GpuInfo;
  /** the quality of the image (see quality.ts): auto, its level steps down while the frames come too late (see adapt()) */
  private qualityChoice: QualityChoice = AUTO_QUALITY;
  /** the image stepped down by itself: the choice it is now */
  onQualityLowered: (choice: QualityChoice) => void = () => {};
  /** the intervals between the frames of the sample under way (ms), and how many samples in a row were too slow */
  private sample: number[] = [];
  private slowSamples = 0;
  /**
   * Work under way on the main thread (a load, an aisle built in the
   * background): the frames come late then, and no lower image would make them
   * come sooner, so they are not measured. A long task (50 ms and more: a
   * collection of the garbage, a cabinet rebuilt) throws the sample away too.
   */
  busy = 0;
  private longTask = false;

  /**
   * The stage, once its renderer is ready. `onGpuAdvice`: the GPU draws too
   * slowly, and the player could do something about it; `forceWebGL`: drawn
   * with WebGL 2 even where WebGPU is there.
   */
  static async create(host: HTMLElement, onGpuAdvice: (advice: GpuAdvice) => void = () => {}, forceWebGL = false): Promise<Stage> {
    // a canvas of extended range only where it shows: WebGPU, on an HDR screen
    const hdrCanvas = !forceWebGL && 'gpu' in navigator && screenIsHdr();
    const renderer = await createRenderer(forceWebGL, hdrCanvas);
    // (WebGPU may still fail to start: the renderer then falls back on WebGL 2)
    const webgpu = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
    return new Stage(renderer, host, onGpuAdvice, !webgpu ? 'noWebGPU' : hdrCanvas ? 'available' : 'sdrScreen');
  }

  /** `hdrSupport`: whether the canvas can show the image past white */
  private constructor(readonly renderer: THREE.WebGPURenderer, host: HTMLElement, private onGpuAdvice: (advice: GpuAdvice) => void, readonly hdrSupport: HdrSupport) {
    this.gpu = gpuInfo(this.renderer);
    // (the GPU's own clock, EXT_disjoint_timer_query, would measure the GPU alone; but through ANGLE on
    // Metal it read 33 ms a frame for frames that came at 60 a second)
    try {
      new PerformanceObserver(() => { this.longTask = true; }).observe({ type: 'longtask' });
    } catch { /* no long tasks reported (Safari, Firefox): the busy flag alone */ }
    host.appendChild(this.renderer.domElement);

    // an abstract dark, neutral backdrop (the tone of the panels): the rack is the only subject
    this.scene.background = backdropTexture();
    this.scene.fog = new THREE.Fog(HORIZON, 3, 7);
    // made once: the generator (its working target, its blur) and the room it was made from go
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    pmrem.dispose();
    room.dispose();
    this.scene.environmentIntensity = 0.5;

    this.rig = new CameraRig(this.renderer.domElement);
    ({ camera: this.camera, controls: this.controls } = this.rig);

    ({ key: this.key, fill: this.fill } = addLights(this.scene));

    this.image = new ImagePipeline(this.renderer, this.scene, this.camera);
    this.applyHdr();
    onScreenRangeChange(() => this.applyHdr());

    window.addEventListener('resize', () => this.resize());
    for (const e of ['pointermove', 'pointerdown', 'wheel', 'keydown']) {
      window.addEventListener(e, () => { this.lastInput = performance.now(); }, { capture: true, passive: true });
    }
    this.applyQuality();
    const advice = gpuAdvice(this.gpu, false);
    if (advice) this.onGpuAdvice(advice);
  }

  /**
   * Whether the loop should draw a frame at `now` (ms). The browser calls the
   * loops at the screen's rate, 120 Hz on a ProMotion display, while the
   * physics steps at 60 Hz: every other image was the same cords, for twice
   * the work of the GPU. 60 frames a second, then; 30 when nobody is looking
   * (the page out of focus) or nothing has been touched for a few seconds:
   * in a level the physics takes two steps a frame, on the title screen the
   * camera sways as slowly. Not during a flight round the cabinet, nor while
   * the aisle moves.
   */
  due(now: number): boolean {
    const idle = !document.hasFocus() || (!this.rig.isTouring && !this.moving && now - this.lastInput > 4000);
    // a few ms of slack: the calls of a 60 Hz screen come a little early or late
    if (now - this.lastFrame < (idle ? 1000 / 30 : 1000 / 60) - 4) return false;
    // only the frames in play: not the 30 a second of an idle page, nor the pauses of a hidden page,
    // nor the frames that the main thread made late (see busy)
    if (idle || this.busy > 0 || this.longTask || now - this.lastFrame > 250) {
      this.sample.length = 0;
      this.longTask = false;
    } else {
      this.adapt(now - this.lastFrame);
    }
    this.lastFrame = now;
    return true;
  }

  /**
   * Steps the image down a level when the frames keep coming late: over two
   * samples of 90 frames in a row, fewer than 45 a second where 60 were asked.
   * It never steps back up: a GPU that could not keep up will not later, and
   * the image going back and forth would show. On a built-in GPU, the player
   * is told how to give the browser the other one.
   */
  private adapt(interval: number): void {
    const choice = this.qualityChoice;
    if (choice.kind !== 'auto' || choice.level === QUALITY.length - 1) return;
    this.sample.push(interval);
    if (this.sample.length < 90) return;
    const mean = this.sample.reduce((a, b) => a + b, 0) / this.sample.length;
    this.sample.length = 0;
    this.slowSamples = mean > 1000 / 45 ? this.slowSamples + 1 : 0;
    if (this.slowSamples < 2) return;
    this.slowSamples = 0;
    // down to the next level that changes something on this screen (at 1 px a pixel, the first ones are alike)
    const from = QUALITY[choice.level];
    let level = choice.level + 1;
    while (level < QUALITY.length - 1 && drawAlike(QUALITY[level], from, window.devicePixelRatio)) level++;
    this.qualityChoice = { kind: 'auto', level };
    this.applyQuality();
    console.info(`Image abaissée au niveau ${level} de qualité (${mean.toFixed(1)} ms par image, ${this.gpu.name})`);
    this.onQualityLowered(this.qualityChoice);
    const advice = gpuAdvice(this.gpu, true);
    if (advice) this.onGpuAdvice(advice);
  }

  /** builds the shaders `object` needs to be drawn in the scene; see ImagePipeline.compile */
  compile(object: THREE.Object3D, o?: CompileOptions): void {
    this.image.compile(object, this.scene, o);
  }

  /**
   * Once the GPU has done all it was given: three hands it its programs as it
   * draws with them, and the GPU compiles them before it can draw (seconds,
   * the first time a browser sees them; it keeps them after). (WebGL: at once.)
   */
  gpuDone(): Promise<void> {
    const device = (this.renderer.backend as { device?: GPUDevice }).device;
    return device ? device.queue.onSubmittedWorkDone() : Promise.resolve();
  }

  /** what the player chose for HDR */
  get hdrChoice(): HdrChoice {
    return this.hdrChosen;
  }

  /** the image goes past white, on this screen, as the player chose */
  get hdrShown(): boolean {
    return isHdrShown(this.hdrChosen, this.hdrSupport, screenIsHdr());
  }

  setHdr(choice: HdrChoice): void {
    this.hdrChosen = choice;
    this.applyHdr();
  }

  /** how far past white the image goes when it does (× white, within HDR_HEADROOM) */
  get hdrHeadroom(): number {
    return this.headroom;
  }

  setHdrHeadroom(headroom: number): void {
    this.headroom = THREE.MathUtils.clamp(headroom, HDR_HEADROOM.min, HDR_HEADROOM.max);
    this.applyHdr();
  }

  private hdrChosen: HdrChoice = 'auto';
  private headroom = HDR_HEADROOM.default;

  private applyHdr(): void {
    this.image.setHeadroom(this.hdrShown ? this.headroom : 1);
  }

  /** what the player chose (or what auto has stepped down to) */
  get quality(): QualityChoice {
    return this.qualityChoice;
  }

  /** the image as it is drawn now */
  get qualitySettings(): QualitySettings {
    return settingsOf(this.qualityChoice);
  }

  /** the image from now on: adapted from a level, or held as set */
  setQuality(choice: QualityChoice): void {
    this.qualityChoice = choice;
    // frames drawn at the former quality say nothing of this one
    this.sample.length = 0;
    this.slowSamples = 0;
    this.applyQuality();
  }

  private applyQuality(): void {
    const q = this.qualitySettings;
    this.renderer.setPixelRatio(Math.min(q.ratio, window.devicePixelRatio));
    this.image.setQuality(q);
    if (this.key.shadow.mapSize.x !== q.shadow) this.replaceKeyLight(q.shadow);
    this.resize();
  }

  /**
   * frames the cabinet: its centre and height (and how far around it the shadows
   * reach, and how far towards the camera its sides come)
   */
  frame(cy: number, height: number, halfWidth = 0.41, cx = 0.03, shadowWidth = halfWidth, near = 0): void {
    const dist = this.rig.frame({ cy, height, halfWidth, cx, shadowWidth, near }, this.panelMargins);
    // the fog starts behind the subject, wherever the camera stands
    const fog = this.scene.fog as THREE.Fog;
    fog.near = dist + 1.5;
    fog.far = dist * 2 + 4;
    const s = this.key.shadow.camera;
    const half = Math.max(height * 0.75, shadowWidth) + 0.3;
    s.left = -half; s.right = half; s.top = half; s.bottom = -half;
    s.near = 0.5; s.far = 6;
    s.updateProjectionMatrix();
    this.key.target.position.set(0, cy, 0);
    // straight above the cabinets, in front: their shadows fall under them, as from the lamp under their roof
    this.key.position.set(0, cy + 2.0, 2.0);
  }

  /** where the camera rests, relative to the framing: see CameraRig.view */
  get view(): CameraRig['view'] {
    return this.rig.view;
  }

  set view(v: CameraRig['view']) {
    this.rig.view = v;
  }

  /** the height of the room's floor: the camera, and what it looks at, stay above it */
  get floorY(): number {
    return this.rig.floorY;
  }

  set floorY(y: number) {
    this.rig.floorY = y;
  }

  /**
   * A new key light, its shadow map `mapSize` px on a side, where the old one
   * stood. (A map resized in place is made again by three, but the shaders
   * reading it kept the one destroyed: every frame was refused by the GPU, and
   * the screen froze on the last one drawn.)
   */
  private replaceKeyLight(mapSize: number): void {
    const old = this.key, key = keyLight(mapSize);
    key.position.copy(old.position);
    key.target.position.copy(old.target.position);
    key.shadow.camera.copy(old.shadow.camera);
    key.shadow.camera.updateProjectionMatrix();
    this.scene.remove(old, old.target);
    old.dispose();
    this.scene.add(key, key.target);
    this.key = key;
  }

  resetView(): void {
    this.rig.resetView();
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    ledViewHeight.value = h * this.renderer.getPixelRatio();
    this.rig.resize(w, h, this.panelMargins);
  }

  /** panels changed size: refit */
  setPanelMargins(margins: ScreenMargins): void {
    this.panelMargins = margins;
    this.resize();
    const f = this.rig.framed;
    this.frame(f.cy, f.height, f.halfWidth, f.cx, f.shadowWidth, f.near);
  }

  /** the tint of the light round the cabinet (the look's accent) */
  setAccent(color: string): void {
    this.fill.color.set(color);
  }

  /**
   * The lens focused on the subject framed, the room round it blurred the
   * more the further it stands (a level: the cabinet is the subject); or
   * everything sharp (the aisle of the title screen).
   */
  focusOnSubject(on: boolean): void {
    this.focused = on;
  }

  private focused = false;

  /**
   * The next image is drawn first with the subject in focus, then as it is:
   * the chain that blurs the room round it is built (see
   * ImagePipeline.compose), and a level's first image does not stall on it.
   * (The first drawn in its frame: the scene's pass is drawn once a frame.)
   */
  warmFocus(): void {
    this.focusWarm = !this.focused;
  }

  private focusWarm = false;

  /** a left drag in the scene pans the view (the demo, where it grabs nothing) */
  dragPans(on: boolean): void {
    this.rig.dragPans(on);
  }

  /** see CameraRig.tour */
  tour(seconds: number): Promise<void> {
    return this.rig.tour(seconds);
  }

  sway(on: boolean): void {
    this.rig.sway(on);
  }

  /** the camera at `pose`, relative to its resting place (the replay of the work moves it so) */
  place(pose: TourPose): void {
    this.rig.place(pose);
  }

  render(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastRender) / 1000);
    this.rig.update(dt);
    // (wrapped, so that the GPU's hash of it keeps its precision)
    ledClock.value = (ledClock.value + dt) % LED_CLOCK_WRAP;
    // the light of the LEDs on the cords; not for a cabinet taken off the scene (an aisle set aside)
    for (const g of ledGlows) {
      let top: THREE.Object3D = g.root;
      while (top.parent) top = top.parent;
      if (top === this.scene) g.render(this.renderer);
    }
    this.lastRender = now;
    // on the subject itself, wherever the view was panned
    const subject = this.rig.subject;
    const focus = { at: subject.at, reach: subject.size * SHARP_REACH };
    const frame = { dt, viewDistance: this.rig.viewDistance, focus: this.focused ? focus : null, margins: this.panelMargins };
    if (this.focusWarm) {
      this.focusWarm = false;
      if (!this.focused) this.image.render({ ...frame, focus });
    }
    this.image.render(frame);
  }
}

/** vertical gradient, lighter at the horizon behind the rack, with a soft vignette */
function backdropTexture(): THREE.CanvasTexture {
  const W = 512, H = 512, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const v = g.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, '#0a0b0c');
  v.addColorStop(0.62, HORIZON);
  v.addColorStop(1, '#101214');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, W * 0.55);
  glow.addColorStop(0, 'rgba(190,210,225,0.07)');
  glow.addColorStop(1, 'rgba(190,210,225,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
