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

import * as THREE from 'three/webgpu';
import { shared } from './dispose';
import { ledOn } from './leds';
import { addGlow } from './glowTerms';
import { tsl, type ShaderNode } from './tsl';

const {
  abs, attribute, diffuseColor, dot, exp, exp2, length, log2, max, min, normalWorldGeometry, normalize, positionGeometry,
  positionWorld, select, texture, uniform, varying, vec2, vec3, vec4,
} = tsl;

/** the weights of red, green and blue in the luminance */
const LUMA = [0.2126, 0.7152, 0.0722] as const;

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

/** how far a spot is drawn, in spreads */
const SPOT_REACH = 3;

/** the soft spot of a light, drawn into the map */
function spotMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
  const r = varying(positionGeometry.xy.div(SPREAD));
  const tint = varying(attribute('emissiveTint', 'vec3').mul(ledOn(attribute('blink', 'vec3'))));
  m.colorNode = vec4(tint.mul(exp(dot(r, r).mul(-0.5)).mul(PEAK)), 1);
  return m;
}

export class LedGlow {
  readonly map: THREE.RenderTarget;
  /** world → front of the cabinet (where the map lies, z towards the viewer) */
  readonly frame = new THREE.Matrix4();
  /** the face the map covers: x0, y0, x1, y1 (m, in the cabinet's frame) */
  readonly box: THREE.Vector4;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  /** the lit copy of each material of the cabinet (see light()) */
  private copies = new Map<THREE.Material, THREE.MeshStandardNodeMaterial>();

  /**
   * `sources`: the instanced lights of the cabinet, laid already (their tints
   * and blinks are shared, not copied; they never move).
   */
  constructor(readonly root: THREE.Object3D, sources: THREE.InstancedMesh[], box: [number, number, number, number]) {
    const [x0, y0, x1, y1] = box;
    this.box = new THREE.Vector4(x0, y0, x1, y1);
    this.map = new THREE.RenderTarget(Math.ceil((x1 - x0) * DENSITY), Math.ceil((y1 - y0) * DENSITY), {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      // the blur of the light with the distance (the renderer makes them after each draw)
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.camera = new THREE.OrthographicCamera(x0, x1, y1, y0, -1, 1);
    // a spot is centred on its light, whatever the size of its lens
    const quad = new THREE.PlaneGeometry(2 * SPOT_REACH * SPREAD, 2 * SPOT_REACH * SPREAD);
    const lens = new THREE.Matrix4(), centre = new THREE.Vector3();
    for (const src of sources) {
      const g = new THREE.BufferGeometry();
      g.index = quad.index;
      g.setAttribute('position', quad.getAttribute('position'));
      g.setAttribute('emissiveTint', src.geometry.getAttribute('emissiveTint'));
      g.setAttribute('blink', src.geometry.getAttribute('blink'));
      const spots = new THREE.InstancedMesh(g, spotMaterial(), src.count);
      for (let i = 0; i < src.count; i++) {
        src.getMatrixAt(i, lens);
        spots.setMatrixAt(i, lens.makeTranslation(centre.setFromMatrixPosition(lens)));
      }
      spots.frustumCulled = false;
      this.scene.add(spots);
    }
  }

  /** draws the lights into the map (nothing when the cabinet is off screen) */
  render(renderer: THREE.WebGPURenderer): void {
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
   * screens and node materials (made for an effect of their own) are left as
   * they are.
   */
  light(root: THREE.Object3D): void {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const src = m.material as THREE.MeshStandardMaterial;
      if (!src.isMeshStandardMaterial || (src as THREE.Material as THREE.NodeMaterial).isNodeMaterial || src.transparent || src.emissive.getHex() !== 0) return;
      let copy = this.copies.get(src);
      if (!copy) {
        copy = nodeCopy(src);
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
      if (!m.isInstancedMesh) return;
      // its quad (its tint and blink are the cabinet's lights', freed with them)
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    for (const m of this.copies.values()) {
      // their textures were the cabinet's own (the rails', the labels'), unless made once for all
      for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap]) if (t && !t.userData.shared) t.dispose();
      m.dispose();
    }
    this.copies.clear();
  }
}

/** every cabinet's glow: the stage draws those in its scene before each frame; RackView.dispose takes its own out */
export const ledGlows = new Set<LedGlow>();

/** how much of the light a cord takes (shared by every cord): a little, as LEDs light little */
export const ledLight = uniform(4);

/** how much of it the cabinet and its equipment take */
export const ledLightRack = uniform(6.5);

/** a node material copying a plain standard one: its colour, maps, finish (none of its nodes, which it has not) */
function nodeCopy(src: THREE.MeshStandardMaterial): THREE.MeshStandardNodeMaterial {
  const copy = new THREE.MeshStandardNodeMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(copy, src);
  return copy;
}

/**
 * The light a cabinet's glow gives a surface: the map of its façade, read
 * where the surface stands, blurred by the distance to the lenses, and taken
 * by the side turned to the light.
 */
function glowLight(map: THREE.Texture, frame: ShaderNode, box: ShaderNode, gain: ShaderNode): ShaderNode {
  const p = frame.mul(vec4(positionWorld, 1)).xyz;
  const n = normalize(frame.mul(vec4(normalWorldGeometry, 0)).xyz);
  const size = box.zw.sub(box.xy);
  const uv = p.xy.sub(box.xy).div(size);
  const inside = uv.x.greaterThan(0).and(uv.x.lessThan(1)).and(uv.y.greaterThan(0)).and(uv.y.lessThan(1));
  // height above the lenses; the light has spread by about as much (m)
  const h = p.z.sub(LENS_Z);
  const blur = min(abs(h).mul(WIDEN), MAX_BLUR);
  // the level of the map whose texels are that blurred (one of level n: 2^n texels averaged)
  const lod = max(0, log2(blur.mul(DENSITY * 2.5)));
  const texel = exp2(lod).div(DENSITY);
  const du = vec2(texel.div(size.x), 0), dv = vec2(0, texel.div(size.y));
  const Y = vec3(...LUMA);
  // (the rows of a render target run from its top, as WebGPU stores textures; the face's y, from its bottom)
  const read = (at: ShaderNode) => texture(map, vec2(at.x, at.y.oneMinus()), lod).rgb;
  const c = read(uv);
  const slope = vec2(dot(read(uv.add(du)).sub(read(uv.sub(du))), Y), dot(read(uv.add(dv)).sub(read(uv.sub(dv))), Y)).div(texel.mul(2));
  // where the light comes from: across the face, towards the brighter side, as far as a spot of that
  // spread puts it (its slope over its value, times the square of its spread); and from the face itself,
  // behind a cord, in front of a part sunk into it
  const L = vec3(slope.mul(blur.mul(blur).add(SPREAD * SPREAD)), h.negate().mul(dot(c, Y)));
  const lit = max(0, dot(n, L)).div(max(length(L), 1e-8));
  // squared, so that only the side turned to the light takes it; and fading beyond the widest spread
  const far = h.div(0.04);
  const light = c.mul(gain.mul(lit).mul(lit).div(far.mul(far).add(1)));
  // saturating at a luminance of 1: a white part right against a light, on top of what the lamp gives
  // it, stays below the threshold of the bloom (imagePipeline.ts), or it shone as a light does
  return select(inside, diffuseColor.rgb.mul(light.div(dot(light, Y).add(1))), vec3(0));
}

/**
 * Lights a material with a cabinet's glow, added to its own glow; `gain`: how
 * much of it, a uniform shared by the materials of a kind.
 */
export function ledLit<T extends THREE.MeshStandardNodeMaterial>(m: T, glow: LedGlow, gain: ShaderNode = ledLight): T {
  return addGlow(m, glowLight(glow.map.texture, uniform(glow.frame), uniform(glow.box), gain));
}
