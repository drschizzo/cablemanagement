import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** colour of the backdrop where the floor fades out (also the fog) */
const HORIZON = '#2a2023';

/** Renderer, camera, lights and camera controls. */
export class Stage {
  renderer: THREE.WebGLRenderer;
  /** scene → ambient occlusion → tone mapping */
  private composer: EffectComposer;
  private ao: GTAOPass;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  key: THREE.DirectionalLight;
  private home = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private framed = { cy: 0, height: 1, halfWidth: 0.41, cx: 0.03 };
  /** screen space taken by the panels (px): the cabinet is framed in the rest */
  insets = { left: 0, right: 0, top: 0, bottom: 0 };
  /** slow sway of the camera around the cabinet (demo), stopped by the player */
  private swaying = false;
  private swayT = 0;

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    host.appendChild(this.renderer.domElement);

    // an abstract warm backdrop: the rack is the only subject
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

    // warm key, cool fill: the contrast between the two gives the volumes
    this.scene.add(new THREE.HemisphereLight('#f4e4d0', '#2a221b', 0.75));
    this.key = new THREE.DirectionalLight('#ffe0bd', 2.6);
    this.key.position.set(0.6, 2.2, 2.0);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.01;
    this.key.shadow.radius = 3;
    this.scene.add(this.key, this.key.target);
    const fill = new THREE.DirectionalLight('#9dbdff', 0.45);
    fill.position.set(-1.5, 0.5, 1.5);
    this.scene.add(fill);

    // multisampled target: the composer would otherwise lose the antialiasing
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new GTAOPass(this.scene, this.camera, 1, 1);
    // metres: a short reach darkens the corners, the ports and under the cords;
    // longer, a tangle of cords goes muddy and loses its colours
    this.ao.updateGtaoMaterial({ radius: 0.03, distanceExponent: 1.5, thickness: 0.3, scale: 1, samples: 16 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.ao.blendIntensity = 0.6;
    this.composer.addPass(this.ao);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** frames the cabinet: its centre and height */
  frame(cy: number, height: number, halfWidth = 0.41, cx = 0.03): void {
    this.framed = { cy, height, halfWidth, cx };
    const W = window.innerWidth, H = window.innerHeight;
    const freeW = Math.max(200, W - this.insets.left - this.insets.right);
    const freeH = Math.max(200, H - this.insets.top - this.insets.bottom);
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // fit the height in the free height, and the cabinet width (0.82 m) in the free width
    const dH = (height * 0.55) / (tanV * (freeH / H));
    const dW = halfWidth / (tanV * (W / H) * (freeW / W));
    const d = Math.max(dH, dW);
    this.home.target.set(cx, cy, 0.02);
    // slightly from above, so that the floor of the cabinet is in view
    const dist = Math.max(1.0, d);
    // the fog starts behind the subject, wherever the camera stands
    const fog = this.scene.fog as THREE.Fog;
    fog.near = dist + 1.5;
    fog.far = dist * 2 + 4;
    this.home.pos.set(cx, cy + dist * 0.16, dist);
    this.resetView();
    const s = this.key.shadow.camera;
    const half = Math.max(height * 0.75, halfWidth) + 0.3;
    s.left = -half; s.right = half; s.top = half; s.bottom = -half;
    s.near = 0.5; s.far = 6;
    s.updateProjectionMatrix();
    this.key.target.position.set(0, cy, 0);
    this.key.position.set(0.6, cy + 2.0, 2.0);
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
    this.frame(this.framed.cy, this.framed.height, this.framed.halfWidth, this.framed.cx);
  }

  sway(on: boolean): void {
    this.swaying = on;
    this.swayT = 0;
    if (!on) this.resetView();
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
    this.composer.render();
  }
}

/** vertical gradient, lighter at the horizon behind the rack, with a soft vignette */
function backdropTexture(): THREE.CanvasTexture {
  const W = 512, H = 512, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const v = g.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, '#120e12');
  v.addColorStop(0.62, HORIZON);
  v.addColorStop(1, '#1a1416');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, W * 0.55);
  glow.addColorStop(0, 'rgba(255,170,120,0.10)');
  glow.addColorStop(1, 'rgba(255,170,120,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
