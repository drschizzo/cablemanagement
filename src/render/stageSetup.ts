// How the stage is put together: the renderer, the camera controls, the
// lights. The passes of the image are in imagePipeline.ts. Stage (stage.ts)
// calls these once.

import * as THREE from 'three/webgpu';
import { DEFAULT_LOOK } from './look';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * The renderer, ready to draw, with shadows: WebGPU, or WebGL 2 where the
 * browser has no WebGPU (or `forceWebGL`). `hdr`: a canvas of extended range
 * (half floats past 1, WebGPU only), for an HDR screen. The canvas itself is
 * not multisampled: it only takes the last pass (the scene is, see
 * imagePipeline.ts), and the tone curve is the image's own (toneCurve.ts).
 */
export async function createRenderer(forceWebGL: boolean, hdr: boolean): Promise<THREE.WebGPURenderer> {
  // only a hint: on Windows the GPU is chosen for the whole browser (see gpu.ts)
  const renderer = new THREE.WebGPURenderer({
    antialias: false, powerPreference: 'high-performance', forceWebGL, outputType: hdr ? THREE.HalfFloatType : undefined,
  });
  await renderer.init();
  renderer.shadowMap.enabled = true;
  // PCF in three r183 samples a rotated Vogel disk of `shadow.radius` (PCFSoft is deprecated into it)
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

/** the camera turns with the right button, pans with the middle one or the arrows, never quite behind the cabinet */
/** the lowest the camera may orbit to (rad from straight above); lower still where the floor stops it */
export const MAX_POLAR = 2.1;

export function createControls(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement): OrbitControls {
  const controls = new OrbitControls(camera, canvas);
  controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minAzimuthAngle = -0.75;
  controls.maxAzimuthAngle = 0.75;
  controls.minPolarAngle = 0.9;
  controls.maxPolarAngle = MAX_POLAR;
  controls.minDistance = 0.35;
  controls.maxDistance = 9;
  controls.zoomSpeed = 0.8;
  // arrow keys pan the view too
  controls.listenToKeyEvents(window);
  controls.keyPanSpeed = 14;
  return controls;
}

/** a neutral key light casting the shadows, a cool fill, and the sky; returns the key light */
/** the lights of the stage: the key (it casts the shadows) and the fill, whose tint the look may change */
export function addLights(scene: THREE.Scene): { key: THREE.DirectionalLight; fill: THREE.DirectionalLight } {
  // neutral key, cool fill: the cords carry the only strong colours
  scene.add(new THREE.HemisphereLight('#dde4ea', '#16191b', 0.75));
  const key = new THREE.DirectionalLight('#f3f4f5', 2.6);
  key.position.set(0, 2.2, 2.0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  key.shadow.radius = 3;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(DEFAULT_LOOK.accent, 0.4);
  fill.position.set(-1.5, 0.5, 1.5);
  scene.add(fill);
  return { key, fill };
}
