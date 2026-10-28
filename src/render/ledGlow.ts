// The light of the LEDs on the cords and on the cabinet, as a trick rather than
// lighting: every frame, the lights of a cabinet are drawn as small soft spots
// into a map of its front (seen face on, 2.5 mm a texel), blinking as they do.
// A surface reads that map where it lies, more blurred the further it stands
// from the face (the mipmaps of the map: a light spreads with the distance, as
// a lamp's does), and finds from the slope of the map which way the light comes
// from: the side of a connector turned to a green LED takes its colour, the
// other does not, and a white cord running past a row of them flickers with
// them. One draw call of a few hundred spots per cabinet, and five texture
// reads per pixel lit.

import * as THREE from 'three';
import { shared } from './dispose';
import { LED_ON_GLSL, ledClock } from './leds';

/** texels per metre of the map: finer than the gap between two port LEDs */
const DENSITY = 400;
/** spread of a light on the face itself (m): a few millimetres around its lens */
const SPREAD = 0.004;
/** how much wider a light spreads for each metre in front of (or behind) the face */
const WIDEN = 0.7;
/**
 * The widest it spreads (m); further, it only fades. Wider, a cord a hand in
 * front of the face took the light of dozens of LEDs at once, and flickered
 * with all of them along much of its length.
 */
const MAX_BLUR = 0.015;
/** where the lenses stand in front of the face (m) */
const LENS_Z = 0.002;
/**
 * The peak of a spot: a cord a centimetre in front of a light, where the spot
 * has spread to about twice its width, takes it at about 1.
 */
const PEAK = 4;

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
        // in spreads, out to three of them
        vR = position.xy * 6.0;
        vC = emissiveTint * ledOn(blink);
        // the spot is centred on the light, whatever the size of its lens
        vec3 c = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(c + vec3(position.xy * ${(6 * SPREAD).toFixed(4)}, 0.0), 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vR;
      varying vec3 vC;
      void main() {
        gl_FragColor = vec4(vC * (${PEAK.toFixed(2)} * exp(-0.5 * dot(vR, vR))), 1.0);
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
  /** the lit copy of each material of the cabinet (see light()) */
  private copies = new Map<THREE.Material, THREE.MeshStandardMaterial>();

  /** `sources`: the instanced lights of the cabinet (their attributes are shared, not copied) */
  constructor(readonly root: THREE.Object3D, sources: THREE.InstancedMesh[], box: [number, number, number, number]) {
    const [x0, y0, x1, y1] = box;
    this.box = new THREE.Vector4(x0, y0, x1, y1);
    this.map = new THREE.WebGLRenderTarget(Math.ceil((x1 - x0) * DENSITY), Math.ceil((y1 - y0) * DENSITY), {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      // the blur of the light with the distance (the renderer makes them after each draw)
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
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

  /**
   * Lights the parts under `root` (the cabinet, its equipment): their opaque
   * standard materials are swapped for copies that take the glow, one per
   * material and cabinet, which live as long as the glow does. Lights,
   * screens and materials of their own making are left as they are.
   */
  light(root: THREE.Object3D): void {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const src = m.material as THREE.MeshStandardMaterial;
      if (!src.isMeshStandardMaterial || src.transparent || src.emissive.getHex() !== 0 || Object.hasOwn(src, 'onBeforeCompile')) return;
      let copy = this.copies.get(src);
      if (!copy) {
        copy = src.clone();
        // freed with the glow, not with the parts (the managers are rebuilt with every change)
        copy.userData = {};
        shared(copy);
        this.copies.set(src, ledLit(copy, this, ledLightRack));
      }
      m.material = copy;
    });
  }

  dispose(): void {
    this.map.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (m.isInstancedMesh) (m.material as THREE.Material).dispose();
    });
    for (const m of this.copies.values()) {
      // their textures were the cabinet's own (the rails', the labels'), unless made once for all
      for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap]) if (t && !t.userData.shared) t.dispose();
      m.dispose();
    }
    this.copies.clear();
  }
}

/** every cabinet's glow: the stage draws them before each frame, and drops those taken off the scene */
export const ledGlows = new Set<LedGlow>();

/** how much of the light a cord takes (shared by every cord): a little, as LEDs light little */
export const ledLight = { value: 4 };

/** how much of it the cabinet and its equipment take */
export const ledLightRack = { value: 6.5 };

/**
 * Lights a material with a cabinet's glow (added to its own glow); `gain`:
 * how much of it, a uniform shared by the materials of a kind.
 */
export function ledLit<T extends THREE.MeshStandardMaterial>(m: T, glow: LedGlow, gain: { value: number } = ledLight): T {
  const prev = m.onBeforeCompile.bind(m);
  const prevKey = m.customProgramCacheKey();
  m.onBeforeCompile = (s, r) => {
    prev(s, r);
    s.uniforms.ledGlowMap = { value: glow.map.texture };
    s.uniforms.ledGlowFrame = { value: glow.frame };
    s.uniforms.ledGlowBox = { value: glow.box };
    s.uniforms.ledGlowGain = gain;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 ledGlowFrame;\nvarying vec3 vLedP;\nvarying vec3 vLedN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
mat4 ledM = ledGlowFrame * modelMatrix;
#ifdef USE_INSTANCING
ledM = ledM * instanceMatrix;
#endif
vLedP = (ledM * vec4(transformed, 1.0)).xyz;
vLedN = mat3(ledM) * objectNormal;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D ledGlowMap;\nuniform vec4 ledGlowBox;\nuniform float ledGlowGain;\nvarying vec3 vLedP;\nvarying vec3 vLedN;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec2 size = ledGlowBox.zw - ledGlowBox.xy;
  vec2 uv = (vLedP.xy - ledGlowBox.xy) / size;
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
    // height above the lenses; the light has spread by about as much (m)
    float h = vLedP.z - ${LENS_Z.toFixed(4)};
    float blur = min(${WIDEN.toFixed(2)} * abs(h), ${MAX_BLUR.toFixed(3)});
    // the level of the map whose texels are that blurred (one of level n: 2^n texels averaged)
    float lod = max(0.0, log2(blur * ${(DENSITY * 2.5).toFixed(1)}));
    float texel = exp2(lod) / ${DENSITY.toFixed(1)};
    vec2 du = vec2(texel / size.x, 0.0), dv = vec2(0.0, texel / size.y);
    const vec3 Y = vec3(0.2126, 0.7152, 0.0722);
    vec3 c = textureLod(ledGlowMap, uv, lod).rgb;
    vec2 slope = vec2(
      dot(textureLod(ledGlowMap, uv + du, lod).rgb - textureLod(ledGlowMap, uv - du, lod).rgb, Y),
      dot(textureLod(ledGlowMap, uv + dv, lod).rgb - textureLod(ledGlowMap, uv - dv, lod).rgb, Y)) / (2.0 * texel);
    // where the light comes from: across the face, towards the brighter side, as far as a spot
    // of that spread puts it (its slope over its value, times the square of its spread); and from
    // the face itself, behind a cord, in front of a part sunk into it
    vec3 L = vec3((${(SPREAD * SPREAD).toExponential(3)} + blur * blur) * slope, -h * dot(c, Y));
    float lit = max(0.0, dot(normalize(vLedN), L)) / max(length(L), 1e-8);
    // squared, so that only the side turned to the light takes it; and fading beyond the widest spread
    float far = h / 0.04;
    vec3 light = c * (ledGlowGain * lit * lit / (1.0 + far * far));
    // saturating at a luminance of 1: a white part right against a light, on top of what the lamp
    // gives it, stays below the threshold of the bloom (stage.ts), or it shone as a light does
    light /= 1.0 + dot(light, Y);
    totalEmissiveRadiance += diffuseColor.rgb * light;
  }
}`);
  };
  m.customProgramCacheKey = () => `${prevKey}-ledlit`;
  m.needsUpdate = true;
  return m;
}
