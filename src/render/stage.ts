// The 3D stage every scene draws on: the renderer, the camera and its
// controls, the lights, and the post-processing passes (reflections, ambient
// occlusion, bloom, the cinema pass), at the quality chosen or stepped down
// when the GPU cannot keep up (quality.ts).

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { BloomPass, ReflectionPass, createAmbientOcclusionPass, type AmbientOcclusionPass } from './threeCompat/passes';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CinemaPass } from './cinema';
import { DepthOfFieldPass } from './depthOfField';
import { LED_CLOCK_WRAP, ledClock, ledViewHeight } from './leds';
import { ledGlows } from './ledGlow';
import { gpuAdvice, gpuInfo, type GpuAdvice, type GpuInfo } from './gpu';
import { addLights, createControls, createRenderer, MAX_POLAR } from './stageSetup';
import { AUTO_QUALITY, QUALITY, drawAlike, settingsOf, type QualityChoice, type QualitySettings } from './quality';
import { CameraTour, type TourPose } from './cameraTour';

/** px from each edge of the screen */
export interface ScreenMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** how far the camera may back away, × the distance it frames the subject from */
const MAX_ZOOM_OUT = 1.6;
/** how far round the subject everything stays sharp (see focusOnSubject), × the subject's size */
const SHARP_REACH = 0.8;
/** how far what the camera looks at may be panned from the middle of the subject, × the subject's size */
const PAN_REACH = 0.6;
/** how high above the floor the camera stays (m): its near plane must not cut into it */
const ABOVE_FLOOR = 0.1;
/** how high above the floor what the camera looks at stays (m) */
const TARGET_ABOVE_FLOOR = 0.05;

/** colour of the backdrop where the floor fades out (also the fog) */
const HORIZON = '#1a1e21';

/** Renderer, camera, lights and camera controls. */
export class Stage {
  renderer: THREE.WebGLRenderer;
  /** scene → ambient occlusion → tone mapping */
  private composer: EffectComposer;
  private ssr: ReflectionPass;
  /** meshes flagged `userData.reflective`, gathered each frame for the reflections */
  private mirrors: THREE.Mesh[] = [];
  private ao: AmbientOcclusionPass;
  /** glow of what is brighter than white (LEDs, light strips, screens), before tone mapping */
  private bloom: BloomPass;
  /** what stands well behind the subject, blurred (see focusOnSubject) */
  private dof: DepthOfFieldPass;
  /** vignette, grain, toning, after tone mapping */
  private cinema: CinemaPass;
  private lastRender = performance.now();
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  key: THREE.DirectionalLight;
  /** the fill light: its tint is the look's accent */
  private fill: THREE.DirectionalLight;
  private home = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private framed = { cy: 0, height: 1, halfWidth: 0.41, cx: 0.03, shadowWidth: 0.41, near: 0 };
  /** the screen covered by the panels of the interface (px from each edge): the cabinet is framed in the rest */
  panelMargins: ScreenMargins = { left: 0, right: 0, top: 0, bottom: 0 };
  /**
   * Where the camera rests, relative to the framing (see frame()): its distance
   * (× the one that fits), its angle above the horizontal (rad), how far below
   * the middle of the subject it looks (m). null: the framing as it is.
   */
  view: { zoom: number; elevation: number; lower: number } | null = null;
  /** the height of the room's floor: the camera, and what it looks at, stay above it */
  floorY = -Infinity;
  /** slow sway of the camera around the cabinet (demo), stopped by the player */
  private swaying = false;
  private swayT = 0;
  /** a flight round the cabinet under way (see tour()) */
  private touring: CameraTour | null = null;
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

  /** `onGpuAdvice`: the GPU draws too slowly, and the player could do something about it */
  constructor(host: HTMLElement, private onGpuAdvice: (advice: GpuAdvice) => void = () => {}) {
    this.renderer = createRenderer();
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

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 20);
    this.controls = createControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener('start', () => { this.swaying = false; this.touring?.end(); });

    ({ key: this.key, fill: this.fill } = addLights(this.scene));

    // half float, for the bloom; not multisampled: every pass after the first draws a full-screen
    // quad, and resolving 4 samples a pixel after each of them took a third of the frame for nothing
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, target);
    this.ssr = new ReflectionPass(this.renderer, this.scene, this.camera, this.mirrors);
    this.composer.addPass(this.ssr);
    this.ao = createAmbientOcclusionPass(this.scene, this.camera);
    this.composer.addPass(this.ao);
    this.dof = new DepthOfFieldPass(this.ssr.sceneDepth);
    this.composer.addPass(this.dof);
    this.bloom = new BloomPass(BLOOM.near.strength, BLOOM.near.radius);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.cinema = new CinemaPass();
    this.composer.addPass(this.cinema);

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
    const idle = !document.hasFocus() || (!this.touring && !this.moving && now - this.lastInput > 4000);
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
    this.ao.enabled = q.ao;
    this.ssr.reflecting = q.ssr;
    if (this.key.shadow.mapSize.x !== q.shadow) {
      this.key.shadow.mapSize.set(q.shadow, q.shadow);
      // rebuilt at the new size on the next frame
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
    this.resize();
  }

  /**
   * frames the cabinet: its centre and height (and how far around it the shadows
   * reach, and how far towards the camera its sides come)
   */
  frame(cy: number, height: number, halfWidth = 0.41, cx = 0.03, shadowWidth = halfWidth, near = 0): void {
    this.framed = { cy, height, halfWidth, cx, shadowWidth, near };
    const W = window.innerWidth, H = window.innerHeight;
    const freeW = Math.max(200, W - this.panelMargins.left - this.panelMargins.right);
    const freeH = Math.max(200, H - this.panelMargins.top - this.panelMargins.bottom);
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // fit the height in the free height, and the cabinet width (0.82 m) in the free width
    const dH = (height * 0.55) / (tanV * (freeH / H));
    const dW = halfWidth / (tanV * (W / H) * (freeW / W)) + near;
    const d = Math.max(dH, dW);
    this.home.target.set(cx, cy, 0.02);
    // slightly from above, so that the floor of the cabinet is in view
    const dist = Math.max(1.0, d);
    // a little further than it is framed, no more: past that, the room round the cabinet shows where it ends
    this.controls.maxDistance = dist * MAX_ZOOM_OUT;
    this.camera.far = Math.max(20, dist * 3);
    this.camera.updateProjectionMatrix();
    // the fog starts behind the subject, wherever the camera stands
    const fog = this.scene.fog as THREE.Fog;
    fog.near = dist + 1.5;
    fog.far = dist * 2 + 4;
    this.home.pos.set(cx, cy + dist * 0.16, dist);
    const v = this.view;
    if (v) {
      this.home.target.y -= v.lower;
      const len = Math.hypot(dist * 0.16, dist) * v.zoom;
      this.home.pos.set(cx, this.home.target.y + Math.sin(v.elevation) * len, this.home.target.z + Math.cos(v.elevation) * len);
    }
    this.resetView();
    const s = this.key.shadow.camera;
    const half = Math.max(height * 0.75, shadowWidth) + 0.3;
    s.left = -half; s.right = half; s.top = half; s.bottom = -half;
    s.near = 0.5; s.far = 6;
    s.updateProjectionMatrix();
    this.key.target.position.set(0, cy, 0);
    // straight above the cabinets, in front: their shadows fall under them, as from the lamp under their roof
    this.key.position.set(0, cy + 2.0, 2.0);
  }

  resetView(): void {
    this.camera.position.copy(this.home.pos);
    this.controls.target.copy(this.home.target);
    this.controls.update();
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    ledViewHeight.value = h * this.renderer.getPixelRatio();
    this.camera.aspect = w / h;
    // shift the image so that its centre is the centre of the free area
    const ox = (this.panelMargins.right - this.panelMargins.left) / 2;
    const oy = (this.panelMargins.bottom - this.panelMargins.top) / 2;
    this.camera.setViewOffset(w, h, ox, oy, w, h);
    this.camera.updateProjectionMatrix();
  }

  /** panels changed size: refit */
  setPanelMargins(margins: ScreenMargins): void {
    this.panelMargins = margins;
    this.resize();
    const f = this.framed;
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
    this.dof.enabled = on;
  }

  /** a left drag in the scene pans the view (the demo, where it grabs nothing) */
  dragPans(on: boolean): void {
    this.controls.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : (null as unknown as THREE.MOUSE);
    this.renderer.domElement.style.cursor = on ? 'grab' : 'default';
  }

  /**
   * A short flight round the cabinet, back to the front view; it resolves when
   * it is over, or as soon as the player takes the camera.
   */
  tour(seconds: number): Promise<void> {
    this.touring?.end();
    this.resetView();
    return new Promise((resolve) => {
      const tour = new CameraTour(seconds, () => {
        if (this.touring === tour) this.touring = null;
        resolve();
      });
      this.touring = tour;
    });
  }

  sway(on: boolean): void {
    this.swaying = on;
    this.swayT = 0;
    if (!on) this.resetView();
  }

  /** the camera at `pose`, relative to its resting place (the replay of the work moves it so) */
  place(pose: TourPose): void {
    this.fly(pose);
  }

  /** the camera where the tour puts it, relative to its resting place; home once it is over */
  private fly(pose: TourPose | null): void {
    if (!pose) { this.resetView(); return; }
    const rel = this.home.pos.clone().sub(this.home.target);
    const side = new THREE.Vector3(0, 1, 0).cross(rel).normalize();
    rel.applyAxisAngle(side, -pose.pitch).applyAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw).multiplyScalar(pose.zoom);
    this.camera.position.copy(this.home.target).add(rel);
    this.controls.target.copy(this.home.target);
  }

  /**
   * Brings what the camera looks at back within reach of the subject, the
   * camera with it: the zoom is held to a distance from that point, but a pan
   * moves the point itself, and took the view off into the room.
   */
  private keepNearSubject(): void {
    const f = this.framed, reach = Math.max(f.height, 2 * f.halfWidth) * PAN_REACH;
    const off = this.controls.target.clone().sub(this.home.target);
    if (off.length() <= reach) return;
    const back = off.clone().setLength(reach).sub(off);
    this.controls.target.add(back);
    this.camera.position.add(back);
  }

  /**
   * Stops the orbit where the camera would go under the floor: the lowest it
   * may look from, at the distance it stands, is where it meets the floor.
   */
  private holdOrbitAboveFloor(): void {
    const t = this.controls.target, r = this.camera.position.distanceTo(t);
    const below = (this.floorY + ABOVE_FLOOR - t.y) / Math.max(r, 1e-6);
    this.controls.maxPolarAngle = Math.min(MAX_POLAR, Math.acos(THREE.MathUtils.clamp(below, -1, 1)));
  }

  /**
   * The point looked at, panned down, and the camera, zoomed out under the
   * orbit's limit, lifted back above the floor.
   */
  private keepAboveFloor(): void {
    const t = this.controls.target, p = this.camera.position;
    const lift = this.floorY + TARGET_ABOVE_FLOOR - t.y;
    if (lift > 0) { t.y += lift; p.y += lift; }
    p.y = Math.max(p.y, this.floorY + ABOVE_FLOOR);
  }

  private fitBloom(): void {
    const d = this.camera.position.distanceTo(this.controls.target);
    const { near, far } = BLOOM;
    const t = THREE.MathUtils.clamp(Math.log(d / near.at) / Math.log(far.at / near.at), 0, 1);
    this.bloom.strength = THREE.MathUtils.lerp(near.strength, far.strength, t);
    this.bloom.radius = THREE.MathUtils.lerp(near.radius, far.radius, t);
    // the blur of each mip spans a set number of its pixels: at fewer pixels than the 2 a point it was
    // tuned at (see QUALITY in quality.ts), mip i covers the screen that mip i + shift did, and takes its weight
    const shift = Math.log2(2 / this.renderer.getPixelRatio());
    const count = this.bloom.levelCount;
    const at = (i: number) => (i < count ? THREE.MathUtils.lerp(near.mips[i], far.mips[i], t) : 0);
    this.bloom.setLevelWeights((i) => {
      const j = i + shift, k = Math.floor(j);
      return THREE.MathUtils.lerp(at(k), at(k + 1), j - k);
    });
  }

  render(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastRender) / 1000);
    if (this.swaying) {
      this.swayT += dt;
      const a = 0.3 * Math.sin(this.swayT * 0.4);
      const rel = this.home.pos.clone().sub(this.home.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      this.camera.position.copy(this.home.target).add(rel);
      this.controls.target.copy(this.home.target);
    }
    if (this.touring) this.fly(this.touring.advance(dt));
    this.holdOrbitAboveFloor();
    this.controls.update();
    this.keepNearSubject();
    this.keepAboveFloor();
    // same array, refilled: the pass keeps a reference to it
    this.mirrors.length = 0;
    this.scene.traverseVisible((o) => { if (o.userData.reflective) this.mirrors.push(o as THREE.Mesh); });
    this.ssr.followProjection(this.camera);
    this.fitBloom();
    if (this.dof.enabled) {
      const ratio = this.renderer.getPixelRatio();
      const f = this.framed;
      // on the subject itself, wherever the view was panned
      this.dof.frame(this.camera, this.home.target, Math.max(f.height, 2 * f.halfWidth) * SHARP_REACH, window.innerWidth * ratio, window.innerHeight * ratio, ratio);
    }
    this.cinema.frame(dt, window.innerWidth, window.innerHeight, this.panelMargins);
    // (wrapped, so that the GPU's hash of it keeps its precision)
    ledClock.value = (ledClock.value + dt) % LED_CLOCK_WRAP;
    // the light of the LEDs on the cords; not for a cabinet taken off the scene (an aisle set aside)
    for (const g of ledGlows) {
      let top: THREE.Object3D = g.root;
      while (top.parent) top = top.parent;
      if (top === this.scene) g.render(this.renderer);
    }
    this.lastRender = now;
    this.composer.render();
  }
}

/**
 * The glow of the lights, close to the cabinet and from afar. The bloom spreads
 * over a set number of pixels, while the lights shrink with the distance: the
 * same halo that suits a light a few pixels wide drowned one seen from across
 * the room. It tightens and dims as the camera backs away (distance to what it
 * looks at, m, on a log scale between the two).
 */
const BLOOM = {
  near: { at: 1.2, strength: 0.6, radius: 0.5, mips: [1, 0.8, 0.6, 0.4, 0.2] },
  // even at radius 0 the wide levels of the blur kept most of their weight: their share falls too
  far: { at: 5, strength: 0.3, radius: 0, mips: [1, 0.25, 0.05, 0, 0] },
};

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
