// How the stage is put together: the renderer, the camera controls, the
// lights, and the post-processing passes with the fixes they needed. Stage
// (stage.ts) calls these once, then drives them frame by frame.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

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
export function addLights(scene: THREE.Scene): THREE.DirectionalLight {
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
  const fill = new THREE.DirectionalLight('#a9c4e8', 0.4);
  fill.position.set(-1.5, 0.5, 1.5);
  scene.add(fill);
  return key;
}

/**
 * The scene itself, multisampled, with soft screen-space reflections on the
 * meshes in `mirrors` (the floor); `reflecting()` false: the scene alone.
 */
export function createReflectionPass(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, mirrors: THREE.Mesh[], reflecting: () => boolean): SSRPass {
  // the scene itself (multisampled here, the antialiasing of the whole image), plus soft
  // screen-space reflections on the floor only
  const ssr = new SSRPass({ renderer, scene, camera, width: 1, height: 1, selects: mirrors, groundReflector: null });
  ssr.beautyRenderTarget.samples = 4;
  // the pass ships a 16-bit depth buffer: the port openings and the unit faces, a few mm apart,
  // fought in it and flickered from frame to frame
  ssr.beautyRenderTarget.depthTexture!.type = THREE.UnsignedIntType;
  // half resolution and a short reach (m): a polished-vinyl sheen, not a mirror, at a fraction of the cost
  ssr.resolutionScale = 0.5;
  ssr.opacity = 0.2;
  ssr.maxDistance = 0.5;
  // (m) how far behind a surface a ray still counts as hitting it: about a cord's radius; at 2 cm
  // every ray passing under a cord took its colour, and its reflection spread into a flat ribbon
  ssr.thickness = 0.003;
  ssr.blur = true;
  // the reflections are computed at half resolution and blurred: they bled over the edges of
  // the cords and units, so the overlay is cut by the full-resolution mask of the floor
  const copy = ssr.copyMaterial;
  copy.uniforms.tMask = { value: ssr.metalnessRenderTarget.texture };
  copy.uniforms.masked = { get value() { return copy.uniforms.tDiffuse.value === ssr.blurRenderTarget2.texture ? 1 : 0; } };
  copy.fragmentShader = copy.fragmentShader
    .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\nuniform sampler2D tMask;\nuniform float masked;')
    .replace(/}\s*$/, '\tif ( masked > 0.5 ) gl_FragColor.a *= texture2D( tMask, vUv ).r;\n}');
  // the reflections cut (see QUALITY): the pass still draws the scene, multisampled, and only copies it on;
  // its own output modes all compute the normals, the reflections and their blur first
  const reflected = ssr.render.bind(ssr);
  const renderPass = (ssr as unknown as { _renderPass(r: THREE.WebGLRenderer, m: THREE.Material, t: THREE.WebGLRenderTarget | null): void })._renderPass.bind(ssr);
  ssr.render = (r, writeBuffer, ...rest) => {
    if (reflecting()) return reflected(r, writeBuffer, ...rest);
    r.setRenderTarget(ssr.beautyRenderTarget);
    r.clear();
    r.render(scene, camera);
    copy.uniforms.tDiffuse.value = ssr.beautyRenderTarget.texture;
    copy.blending = THREE.NoBlending;
    renderPass(r, copy, ssr.renderToScreen ? null : writeBuffer);
  };
  return ssr;
}

/** ambient occlusion: the corners, the ports and under the cords darkened */
export function createAmbientOcclusionPass(scene: THREE.Scene, camera: THREE.PerspectiveCamera): GTAOPass {
  const ao = new GTAOPass(scene, camera, 1, 1);
  // metres: a short reach darkens the corners, the ports and under the cords;
  // longer, a tangle of cords goes muddy and loses its colours
  // 8 samples look the same as 16 once denoised, and save about 0.8 ms at 1800² px (what the bloom costs)
  ao.updateGtaoMaterial({ radius: 0.03, distanceExponent: 1.5, thickness: 0.3, scale: 1, samples: 8 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
  ao.blendIntensity = 0.6;
  return ao;
}

/** the glow of what is brighter than white: the LEDs, the light strips, the screens */
export function createBloomPass(strength: number, radius: number): UnrealBloomPass {
  // the scene is still linear HDR here (half float): the threshold sits above any lit surface (lower,
  // the white patch panels under the lamp washed out) and below the lights (LED_LUMA in leds.ts),
  // so that only the LEDs, the light strips and the screens glow
  // (its bright pass runs at half resolution, where one bilinear read averages each 2×2 block: at a
  // quarter, it read 4 pixels of 16, and a light of a few pixels flashed in and out as the camera moved)
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), strength, radius, 3);
  // a pixel of the scene that is not a number (or infinite, past the half float) on some GPUs:
  // the blur spread it over its whole mip chain, and the screen flashed black. Its bright pass
  // reads it as nothing, and caps the rest (far above any light)
  const high = bloom.materialHighPassFilter;
  high.fragmentShader = high.fragmentShader.replace(
    'vec4 texel = texture2D( tDiffuse, vUv );',
    'vec4 texel = texture2D( tDiffuse, vUv );\n\t\t\tif ( any( isnan( texel ) ) || any( isinf( texel ) ) ) texel = vec4( 0.0 );\n\t\t\ttexel = min( texel, vec4( 1000.0 ) );',
  );
  return bloom;
}
