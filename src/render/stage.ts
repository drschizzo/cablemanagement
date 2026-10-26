import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CinemaPass } from './cinema';
import { ledClock, ledViewHeight } from './leds';
import { ledGlows } from './ledGlow';

/** colour of the backdrop where the floor fades out (also the fog) */
const HORIZON = '#1a1e21';

/** Renderer, camera, lights and camera controls. */
export class Stage {
  renderer: THREE.WebGLRenderer;
  /** scene → ambient occlusion → tone mapping */
  private composer: EffectComposer;
  private ssr: SSRPass;
  /** meshes flagged `userData.reflective`, gathered each frame for the reflections */
  private mirrors: THREE.Mesh[] = [];
  private ao: GTAOPass;
  /** glow of what is brighter than white (LEDs, light strips, screens), before tone mapping */
  private bloom: UnrealBloomPass;
  /** vignette, grain, toning, after tone mapping */
  private cinema: CinemaPass;
  private lastRender = performance.now();
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  key: THREE.DirectionalLight;
  private home = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private framed = { cy: 0, height: 1, halfWidth: 0.41, cx: 0.03, shadowWidth: 0.41, near: 0 };
  /** screen space taken by the panels (px): the cabinet is framed in the rest */
  insets = { left: 0, right: 0, top: 0, bottom: 0 };
  /** slow sway of the camera around the cabinet (demo), stopped by the player */
  private swaying = false;
  private swayT = 0;

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    // PCF in three r183 samples a rotated Vogel disk of `shadow.radius` (PCFSoft is deprecated into it)
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    host.appendChild(this.renderer.domElement);

    // an abstract dark, neutral backdrop (the tone of the panels): the rack is the only subject
    this.scene.background = backdropTexture();
    this.scene.fog = new THREE.Fog(HORIZON, 3, 7);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 20);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minAzimuthAngle = -0.75;
    this.controls.maxAzimuthAngle = 0.75;
    this.controls.minPolarAngle = 0.9;
    this.controls.maxPolarAngle = 2.1;
    this.controls.minDistance = 0.35;
    this.controls.maxDistance = 9;
    this.controls.zoomSpeed = 0.8;
    // arrow keys pan the view too
    this.controls.listenToKeyEvents(window);
    this.controls.keyPanSpeed = 14;
    this.controls.addEventListener('start', () => { this.swaying = false; });

    // neutral key, cool fill: the cords carry the only strong colours
    this.scene.add(new THREE.HemisphereLight('#dde4ea', '#16191b', 0.75));
    this.key = new THREE.DirectionalLight('#f3f4f5', 2.6);
    this.key.position.set(0, 2.2, 2.0);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.01;
    this.key.shadow.radius = 3;
    this.scene.add(this.key, this.key.target);
    const fill = new THREE.DirectionalLight('#a9c4e8', 0.4);
    fill.position.set(-1.5, 0.5, 1.5);
    this.scene.add(fill);

    // multisampled target: the composer would otherwise lose the antialiasing
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    // the scene itself, plus soft screen-space reflections on the floor only
    this.ssr = new SSRPass({ renderer: this.renderer, scene: this.scene, camera: this.camera, width: 1, height: 1, selects: this.mirrors, groundReflector: null });
    this.ssr.beautyRenderTarget.samples = 4;
    // the pass ships a 16-bit depth buffer: the port openings and the unit faces, a few mm apart,
    // fought in it and flickered from frame to frame
    this.ssr.beautyRenderTarget.depthTexture!.type = THREE.UnsignedIntType;
    // half resolution and a short reach (m): a polished-vinyl sheen, not a mirror, at a fraction of the cost
    this.ssr.resolutionScale = 0.5;
    this.ssr.opacity = 0.2;
    this.ssr.maxDistance = 0.5;
    this.ssr.thickness = 0.02;
    this.ssr.blur = true;
    // the reflections are computed at half resolution and blurred: they bled over the edges of
    // the cords and units, so the overlay is cut by the full-resolution mask of the floor
    const copy = this.ssr.copyMaterial, ssr = this.ssr;
    copy.uniforms.tMask = { value: ssr.metalnessRenderTarget.texture };
    copy.uniforms.masked = { get value() { return copy.uniforms.tDiffuse.value === ssr.blurRenderTarget2.texture ? 1 : 0; } };
    copy.fragmentShader = copy.fragmentShader
      .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\nuniform sampler2D tMask;\nuniform float masked;')
      .replace(/}\s*$/, '\tif ( masked > 0.5 ) gl_FragColor.a *= texture2D( tMask, vUv ).r;\n}');
    this.composer.addPass(this.ssr);
    this.ao = new GTAOPass(this.scene, this.camera, 1, 1);
    // metres: a short reach darkens the corners, the ports and under the cords;
    // longer, a tangle of cords goes muddy and loses its colours
    // 8 samples look the same as 16 once denoised, and save about 0.8 ms at 1800² px (what the bloom costs)
    this.ao.updateGtaoMaterial({ radius: 0.03, distanceExponent: 1.5, thickness: 0.3, scale: 1, samples: 8 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
    this.ao.blendIntensity = 0.6;
    this.composer.addPass(this.ao);
    // the scene is still linear HDR here (half float): the threshold sits above any lit surface (lower,
    // the white patch panels under the lamp washed out) and below the lights (LED_LUMA in leds.ts),
    // so that only the LEDs, the light strips and the screens glow
    // (its bright pass runs at half resolution, where one bilinear read averages each 2×2 block: at a
    // quarter, it read 4 pixels of 16, and a light of a few pixels flashed in and out as the camera moved)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM.near.strength, BLOOM.near.radius, 3);
    // a pixel of the scene that is not a number (or infinite, past the half float) on some GPUs:
    // the blur spread it over its whole mip chain, and the screen flashed black. Its bright pass
    // reads it as nothing, and caps the rest (far above any light)
    const high = this.bloom.materialHighPassFilter;
    high.fragmentShader = high.fragmentShader.replace(
      'vec4 texel = texture2D( tDiffuse, vUv );',
      'vec4 texel = texture2D( tDiffuse, vUv );\n\t\t\tif ( any( isnan( texel ) ) || any( isinf( texel ) ) ) texel = vec4( 0.0 );\n\t\t\ttexel = min( texel, vec4( 1000.0 ) );',
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.cinema = new CinemaPass();
    this.composer.addPass(this.cinema);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /**
   * frames the cabinet: its centre and height (and how far around it the shadows
   * reach, and how far towards the camera its sides come)
   */
  frame(cy: number, height: number, halfWidth = 0.41, cx = 0.03, shadowWidth = halfWidth, near = 0): void {
    this.framed = { cy, height, halfWidth, cx, shadowWidth, near };
    const W = window.innerWidth, H = window.innerHeight;
    const freeW = Math.max(200, W - this.insets.left - this.insets.right);
    const freeH = Math.max(200, H - this.insets.top - this.insets.bottom);
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // fit the height in the free height, and the cabinet width (0.82 m) in the free width
    const dH = (height * 0.55) / (tanV * (freeH / H));
    const dW = halfWidth / (tanV * (W / H) * (freeW / W)) + near;
    const d = Math.max(dH, dW);
    this.home.target.set(cx, cy, 0.02);
    // slightly from above, so that the floor of the cabinet is in view
    const dist = Math.max(1.0, d);
    // a wide subject (the aisle of the demo) is framed from further than the player may zoom out
    this.controls.maxDistance = Math.max(9, dist * 1.2);
    this.camera.far = Math.max(20, dist * 3);
    this.camera.updateProjectionMatrix();
    // the fog starts behind the subject, wherever the camera stands
    const fog = this.scene.fog as THREE.Fog;
    fog.near = dist + 1.5;
    fog.far = dist * 2 + 4;
    this.home.pos.set(cx, cy + dist * 0.16, dist);
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
    const ox = (this.insets.right - this.insets.left) / 2;
    const oy = (this.insets.bottom - this.insets.top) / 2;
    this.camera.setViewOffset(w, h, ox, oy, w, h);
    this.camera.updateProjectionMatrix();
  }

  /** panels changed size: refit */
  setInsets(i: { left: number; right: number; top: number; bottom: number }): void {
    this.insets = i;
    this.resize();
    const f = this.framed;
    this.frame(f.cy, f.height, f.halfWidth, f.cx, f.shadowWidth, f.near);
  }

  /** a left drag in the scene pans the view (the demo, where it grabs nothing) */
  dragPans(on: boolean): void {
    this.controls.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : (null as unknown as THREE.MOUSE);
    this.renderer.domElement.style.cursor = on ? 'grab' : 'default';
  }

  sway(on: boolean): void {
    this.swaying = on;
    this.swayT = 0;
    if (!on) this.resetView();
  }

  private fitBloom(): void {
    const d = this.camera.position.distanceTo(this.controls.target);
    const { near, far } = BLOOM;
    const t = THREE.MathUtils.clamp(Math.log(d / near.at) / Math.log(far.at / near.at), 0, 1);
    this.bloom.strength = THREE.MathUtils.lerp(near.strength, far.strength, t);
    this.bloom.radius = THREE.MathUtils.lerp(near.radius, far.radius, t);
    const mips = this.bloom.compositeMaterial.uniforms.bloomFactors.value as number[];
    for (let i = 0; i < mips.length; i++) mips[i] = THREE.MathUtils.lerp(near.mips[i], far.mips[i], t);
  }

  render(): void {
    if (this.swaying) {
      this.swayT += 1 / 60;
      const a = 0.3 * Math.sin(this.swayT * 0.4);
      const rel = this.home.pos.clone().sub(this.home.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      this.camera.position.copy(this.home.target).add(rel);
      this.controls.target.copy(this.home.target);
    }
    this.controls.update();
    // same array, refilled: the pass keeps a reference to it
    this.mirrors.length = 0;
    this.scene.traverseVisible((o) => { if (o.userData.reflective) this.mirrors.push(o as THREE.Mesh); });
    // the pass only reads the projection on resize, before the view offset is applied
    const u = this.ssr.ssrMaterial.uniforms;
    u.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
    u.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
    this.fitBloom();
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastRender) / 1000);
    this.cinema.frame(dt, window.innerWidth, window.innerHeight, this.insets);
    // (wrapped, so that the GPU's hash of it keeps its precision)
    ledClock.value = (ledClock.value + dt) % 600;
    // the light of the LEDs on the cords; a cabinet taken off the scene lets go of its map
    for (const g of ledGlows) {
      let top: THREE.Object3D = g.root;
      while (top.parent) top = top.parent;
      if (top !== this.scene) { g.dispose(); ledGlows.delete(g); continue; }
      g.render(this.renderer);
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
