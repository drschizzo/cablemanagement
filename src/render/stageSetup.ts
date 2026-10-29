// How the stage is put together: the renderer, the camera controls, the
// lights. The post-processing passes, which reach into three.js's internals,
// are built in threeCompat/passes.ts. Stage (stage.ts) calls these once.

import * as THREE from 'three';
import { DEFAULT_LOOK } from './look';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** the WebGL renderer: shadows, filmic tone mapping, no multisampling on the canvas itself */
export function createRenderer(): THREE.WebGLRenderer {
  // no multisampling on the canvas: it only takes the full-screen quad of the last pass
  // (the scene is multisampled in the reflection pass, see below)
  // only a hint: on Windows the GPU is chosen for the whole browser (see gpu.ts)
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  // PCF in three r183 samples a rotated Vogel disk of `shadow.radius` (PCFSoft is deprecated into it)
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  return renderer;
}

/** the camera turns with the right button, pans with the middle one or the arrows, never quite behind the cabinet */
export function createControls(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement): OrbitControls {
  const controls = new OrbitControls(camera, canvas);
  controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minAzimuthAngle = -0.75;
  controls.maxAzimuthAngle = 0.75;
  controls.minPolarAngle = 0.9;
  controls.maxPolarAngle = 2.1;
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
