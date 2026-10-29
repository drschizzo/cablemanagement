// The post-processing passes of the stage, from three.js's addons
// (examples/jsm), with the changes the game needed. Two of them reach into
// the passes' internals (fields and a private method of SSRPass, the shaders
// and mip weights of UnrealBloomPass): they are subclasses here, the one place
// that knows those internals, and tests/render/threeCompat/ checks that every
// one of them still exists in the version of three.js installed.

import * as THREE from 'three';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { patchShader } from './shaderPatch';

/** SSRPass's own method that draws a full-screen material (private: not in its typings) */
interface SSRPassInternals {
  _renderPass(renderer: THREE.WebGLRenderer, material: THREE.Material, target: THREE.WebGLRenderTarget | null): void;
}

/**
 * The scene itself, multisampled (the antialiasing of the whole image), with
 * soft screen-space reflections on the meshes in `mirrors` (the floor).
 */
export class ReflectionPass extends SSRPass {
  /** false: the reflections are skipped (a lower quality, see QUALITY in quality.ts): the scene alone */
  reflecting = true;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, mirrors: THREE.Mesh[]) {
    super({ renderer, scene, camera, width: 1, height: 1, selects: mirrors, groundReflector: null });
    this.beautyRenderTarget.samples = 4;
    // the pass ships a 16-bit depth buffer: the port openings and the unit faces, a few mm apart,
    // fought in it and flickered from frame to frame
    this.beautyRenderTarget.depthTexture!.type = THREE.UnsignedIntType;
    // half resolution and a short reach (m): a polished-vinyl sheen, not a mirror, at a fraction of the cost
    this.resolutionScale = 0.5;
    this.opacity = 0.2;
    this.maxDistance = 0.5;
    // (m) how far behind a surface a ray still counts as hitting it: about a cord's radius; at 2 cm
    // every ray passing under a cord took its colour, and its reflection spread into a flat ribbon
    this.thickness = 0.003;
    this.blur = true;
    // the reflections are computed at half resolution and blurred: they bled over the edges of
    // the cords and units, so the overlay is cut by the full-resolution mask of the floor
    const copy = this.copyMaterial, blurred = this.blurRenderTarget2;
    copy.uniforms.tMask = { value: this.metalnessRenderTarget.texture };
    copy.uniforms.masked = { get value() { return copy.uniforms.tDiffuse.value === blurred.texture ? 1 : 0; } };
    copy.fragmentShader = maskedCopy(copy.fragmentShader);
  }

  override render(...args: Parameters<SSRPass['render']>): void {
    if (this.reflecting) return super.render(...args);
    // the reflections cut: the pass still draws the scene, multisampled, and only copies it on
    // (its own output modes all compute the normals, the reflections and their blur first)
    const [renderer, writeBuffer] = args;
    renderer.setRenderTarget(this.beautyRenderTarget);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.copyMaterial.uniforms.tDiffuse.value = this.beautyRenderTarget.texture;
    this.copyMaterial.blending = THREE.NoBlending;
    (this as unknown as SSRPassInternals)._renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
  }

  /** the pass reads the camera's projection only on resize, before the view offset is applied: copied every frame */
  followProjection(camera: THREE.PerspectiveCamera): void {
    const u = this.ssrMaterial.uniforms;
    u.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
    u.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
  }
}

/** the ambient occlusion pass, as Stage holds it */
export type AmbientOcclusionPass = GTAOPass;

/** ambient occlusion: the corners, the ports and under the cords darkened (public methods only) */
export function createAmbientOcclusionPass(scene: THREE.Scene, camera: THREE.PerspectiveCamera): GTAOPass {
  const ao = new GTAOPass(scene, camera, 1, 1);
  // metres: a short reach darkens the corners, the ports and under the cords;
  // longer, a tangle of cords goes muddy and loses its colours
  // 8 samples look the same as 16 once denoised, and save about 0.8 ms at 1800² px (what the bloom costs)
  ao.updateGtaoMaterial(AO_SETTINGS);
  ao.updatePdMaterial(AO_DENOISE);
  ao.blendIntensity = 0.6;
  return ao;
}

/** the settings given to GTAOPass (the test checks it still reads each of them) */
export const AO_SETTINGS = { radius: 0.03, distanceExponent: 1.5, thickness: 0.3, scale: 1, samples: 8 };
export const AO_DENOISE = { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 };

/** the glow of what is brighter than white: the LEDs, the light strips, the screens */
export class BloomPass extends UnrealBloomPass {
  constructor(strength: number, radius: number) {
    // the scene is still linear HDR here (half float): the threshold sits above any lit surface (lower,
    // the white patch panels under the lamp washed out) and below the lights (LED_LUMA in leds.ts),
    // so that only the LEDs, the light strips and the screens glow
    // (its bright pass runs at half resolution, where one bilinear read averages each 2×2 block: at a
    // quarter, it read 4 pixels of 16, and a light of a few pixels flashed in and out as the camera moved)
    super(new THREE.Vector2(1, 1), strength, radius, 3);
    // a pixel of the scene that is not a number (or infinite, past the half float) on some GPUs:
    // the blur spread it over its whole mip chain, and the screen flashed black. Its bright pass
    // reads it as nothing, and caps the rest (far above any light)
    this.materialHighPassFilter.fragmentShader = guardedHighPass(this.materialHighPassFilter.fragmentShader);
  }

  /** how many blurred levels the glow adds up, finest first */
  get levelCount(): number {
    return this.nMips;
  }

  /** the weight of each level in the glow */
  setLevelWeights(weight: (level: number) => number): void {
    const weights = this.compositeMaterial.uniforms.bloomFactors.value as number[];
    for (let i = 0; i < weights.length; i++) weights[i] = weight(i);
  }
}

/** SSRPass's copy shader (three.js's CopyShader), its alpha cut by the mask `tMask` while `masked` */
export function maskedCopy(fragmentShader: string): string {
  return patchShader(fragmentShader)
    .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\nuniform sampler2D tMask;\nuniform float masked;')
    .replace(/}\s*$/, '\tif ( masked > 0.5 ) gl_FragColor.a *= texture2D( tMask, vUv ).r;\n}').source;
}

/** the bloom's bright pass (three.js's LuminosityHighPassShader), reading a NaN or an infinity as nothing */
export function guardedHighPass(fragmentShader: string): string {
  return patchShader(fragmentShader).replace(
    'vec4 texel = texture2D( tDiffuse, vUv );',
    'vec4 texel = texture2D( tDiffuse, vUv );\n\t\t\tif ( any( isnan( texel ) ) || any( isinf( texel ) ) ) texel = vec4( 0.0 );\n\t\t\ttexel = min( texel, vec4( 1000.0 ) );',
  ).source;
}
