// The light of the LEDs on the cords, as a trick rather than lighting: every
// frame, the lights of a cabinet are drawn as soft coloured spots into a small
// map of its front (seen face on, a centimetre a texel), blinking as they do.
// A cord reads that map once where it passes, dimmed by how far in front of the
// face it is and by which way its surface turns: a white cord running past a
// row of green LEDs takes their colour, flickering with them. One draw call of
// a few hundred spots into a 64-texel-wide target per cabinet, and one texture
// read per pixel of cord.

import * as THREE from 'three';
import { LED_ON_GLSL, ledClock } from './leds';

/** how far a light reaches across the face (m) */
const REACH = 0.045;
/** texels per metre of the map */
const DENSITY = 100;

const spotMaterial = (): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    uniforms: { ledTime: ledClock },
    vertexShader: /* glsl */ `
      attribute vec3 emissiveTint;
      attribute vec3 blink;
      varying vec2 vR;
      varying vec3 vC;
      ${LED_ON_GLSL}
      void main() {
        vR = position.xy * 2.0;
        vC = emissiveTint * ledOn(blink);
        // the spot is centred on the light, whatever the size of its lens
        vec3 c = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(c + vec3(position.xy * ${(2 * REACH).toFixed(3)}, 0.0), 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vR;
      varying vec3 vC;
      void main() {
        float f = max(0.0, 1.0 - dot(vR, vR));
        gl_FragColor = vec4(vC * f * f, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });

export class LedGlow {
  readonly map: THREE.WebGLRenderTarget;
  /** world → front of the cabinet (where the map lies, z towards the viewer) */
  readonly frame = new THREE.Matrix4();
  /** the face the map covers: x0, y0, x1, y1 (m, in the cabinet's frame) */
  readonly box: THREE.Vector4;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;

  /** `sources`: the instanced lights of the cabinet (their attributes are shared, not copied) */
  constructor(readonly root: THREE.Object3D, sources: THREE.InstancedMesh[], box: [number, number, number, number]) {
    const [x0, y0, x1, y1] = box;
    this.box = new THREE.Vector4(x0, y0, x1, y1);
    this.map = new THREE.WebGLRenderTarget(Math.ceil((x1 - x0) * DENSITY), Math.ceil((y1 - y0) * DENSITY), { type: THREE.HalfFloatType, depthBuffer: false });
    this.camera = new THREE.OrthographicCamera(x0, x1, y1, y0, -1, 1);
    const quad = new THREE.PlaneGeometry(1, 1);
    for (const src of sources) {
      const g = new THREE.BufferGeometry();
      g.index = quad.index;
      g.setAttribute('position', quad.getAttribute('position'));
      g.setAttribute('emissiveTint', src.geometry.getAttribute('emissiveTint'));
      g.setAttribute('blink', src.geometry.getAttribute('blink'));
      const spots = new THREE.InstancedMesh(g, spotMaterial(), src.count);
      spots.instanceMatrix = src.instanceMatrix;
      spots.frustumCulled = false;
      this.scene.add(spots);
    }
  }

  /** draws the lights into the map (nothing when the cabinet is off screen) */
  render(renderer: THREE.WebGLRenderer): void {
    for (let o: THREE.Object3D | null = this.root; o; o = o.parent) if (!o.visible) return;
    this.root.updateWorldMatrix(true, false);
    this.frame.copy(this.root.matrixWorld).invert();
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.map);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, false, false);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
  }

  dispose(): void {
    this.map.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (m.isInstancedMesh) (m.material as THREE.Material).dispose();
    });
  }
}

/** every cabinet's glow: the stage draws them before each frame, and drops those taken off the scene */
export const ledGlows = new Set<LedGlow>();

/** how much of the light a cord takes (shared by every cord): a little, as LEDs light little */
export const ledLight = { value: 0.2 };

/**
 * Lights the cords of a material with a cabinet's glow (it must already have
 * `emissiveTint`, see batch.ts: the light is added to its glow).
 */
export function ledLit<T extends THREE.MeshStandardMaterial>(m: T, glow: LedGlow): T {
  const prev = m.onBeforeCompile.bind(m);
  m.onBeforeCompile = (s, r) => {
    prev(s, r);
    s.uniforms.ledGlowMap = { value: glow.map.texture };
    s.uniforms.ledGlowFrame = { value: glow.frame };
    s.uniforms.ledGlowBox = { value: glow.box };
    s.uniforms.ledGlowGain = ledLight;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 ledGlowFrame;\nvarying vec3 vLedP;\nvarying vec3 vLedN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
mat4 ledM = ledGlowFrame * modelMatrix;
vLedP = (ledM * vec4(transformed, 1.0)).xyz;
vLedN = mat3(ledM) * objectNormal;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D ledGlowMap;\nuniform vec4 ledGlowBox;\nuniform float ledGlowGain;\nvarying vec3 vLedP;\nvarying vec3 vLedN;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec2 uv = (vLedP.xy - ledGlowBox.xy) / (ledGlowBox.zw - ledGlowBox.xy);
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
    // fades over a few centimetres in front of the face, and only the side turned to it is lit
    // (the side facing the viewer stays as it was)
    float dz = vLedP.z / 0.05;
    float facing = clamp(-normalize(vLedN).z, 0.0, 1.0);
    facing *= facing;
    totalEmissiveRadiance += diffuseColor.rgb * texture2D(ledGlowMap, uv).rgb * (ledGlowGain * facing / (1.0 + dz * dz));
  }
}`);
  };
  m.customProgramCacheKey = () => 'tint-ledlit';
  m.needsUpdate = true;
  return m;
}
