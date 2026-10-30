// The image, from the scene to the screen: the scene drawn once into its
// buffers (linear HDR: its colour, the normals, the depth, what reflects),
// then the passes that work on them: reflections on the floor, ambient
// occlusion, the depth of field, the glow of the lights, the tone curve (past
// white on an HDR screen), the antialiasing, the cinema pass.

import * as THREE from 'three/webgpu';
import { ssr } from 'three/examples/jsm/tsl/display/SSRNode.js';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { denoise } from 'three/examples/jsm/tsl/display/DenoiseNode.js';
import { Bloom } from './bloom';
import { Cinema } from './cinema';
import { DepthOfField } from './depthOfField';
import { smaa } from 'three/examples/jsm/tsl/display/SMAANode.js';
import { toneCurve } from './toneCurve';
import { frameTexture, tsl, type ShaderNode } from './tsl';
import type { ScreenMargins } from './stage';
import type { QualitySettings } from './quality';

const { float, mix, mrt, normalView, output, pass, renderOutput, uniform, vec4 } = tsl;

/**
 * The reflections of the floor: a polished vinyl, faint and a little blurred.
 * `thickness` (m): at 2 cm, every ray passing under a cord took its colour and
 * the reflection smeared into a ribbon. `quality`: the steps of a ray, a
 * quarter of the most; faint and blurred, the reflections look no different
 * with more, which cost twice as much of the frame.
 */
export const REFLECTIONS = { resolutionScale: 0.5, quality: 0.25, opacity: 0.2, maxDistance: 0.5, thickness: 0.003, roughness: 0.3 };

/**
 * Ambient occlusion. `radius` (m): a short reach darkens the corners, the
 * ports and under the cords; longer, a tangle of cords goes muddy and loses its
 * colours. 8 samples look the same as 16 once denoised, for less of the frame.
 * (tests/render/threeNodes.test.ts checks that three.js still reads each.)
 */
export const AO_SETTINGS = { radius: 0.03, distanceExponent: 1.5, thickness: 0.3, scale: 1, samples: 8 };
/**
 * The occlusion worked out at half the resolution (a quarter of the pixels),
 * then denoised at full resolution: the same shading, for a third of its cost.
 */
export const AO_RESOLUTION = 0.5;
export const AO_DENOISE = { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6 };
/** how much of the occlusion darkens the image */
const AO_BLEND = 0.6;

/** what the passes follow from one image to the next */
export interface ImageFrame {
  /** s since the last image */
  dt: number;
  /** from the camera to what it looks at (m) */
  viewDistance: number;
  /** the point in focus, and how far round it everything stays sharp (m); null: everything sharp */
  focus: { at: THREE.Vector3; reach: number } | null;
  /** the screen the panels cover: the image centres on the rest */
  margins: ScreenMargins;
}

/** a material whose surface the floor reflections take (the floor itself) */
export function reflective<T extends THREE.NodeMaterial>(m: T): T {
  m.mrtNode = mrt({ reflect: float(1) });
  return m;
}

/**
 * A material added to the image without standing in the scene (a shaft of
 * light): it adds nothing to the normals and what reflects, which it would
 * have stood in as a solid, shading and reflecting what lies behind it. (It
 * must blend additively and write no depth: its zeros are added to those
 * buffers, see the scene's pass.)
 */
export function keepOutOfDepth<T extends THREE.NodeMaterial>(m: T): T {
  m.mrtNode = mrt({ normal: vec4(0), reflect: float(0) });
  return m;
}

/**
 * An output of the scene blended as each material blends its colour. three
 * blends only the colour unless told to, and only by the pass (what a
 * material's own outputs ask is dropped): a light added to the image wrote its
 * zeros over the normals of what lay behind it, which the occlusion then
 * darkened (the box of the room's haze on the cabinet's roof).
 */
const ASBLENDED = new THREE.BlendMode(THREE.MaterialBlending);

/** the passes after the scene's, as one quality and focus draw them */
interface Chain {
  /** the nodes that hold targets of their own */
  owned: Owned[];
  bloom: Bloom;
  dof: DepthOfField | null;
  cinema: Cinema;
  /** how deep in the renderer's calls it draws the scene's pass (see compile); null: not drawn yet */
  sceneDepth: number | null;
}

/** how ImagePipeline.compile sets the scene out */
export interface CompileOptions {
  /** without what the scene shows besides (the stage's lights stay) */
  alone?: boolean;
  /** what lights it besides, on screen: their lights alone count */
  litBy?: THREE.Object3D[];
  /** for the chain that blurs the room round the subject, or the other (default: the one drawn) */
  focused?: boolean;
}

/** a pass that holds targets of its own: an image drawn once a frame (frameTexture), or the glow */
type Owned = { dispose(): void; renderTarget?: THREE.RenderTarget };

/**
 * Frees the targets of a pass put aside, and only them: a node disposed of
 * is no longer drawn by three, and a chain taken up again showed the last
 * image it drew. (The glow frees only its targets.)
 */
function freeTargets(n: Owned): void {
  if (n.renderTarget) n.renderTarget.dispose();
  else n.dispose();
}

type Calls = { _callDepth: number };

/**
 * How deep the renderer is in its calls: three keys a shader by it (one
 * render calls the next, each pass of the chain the one it reads).
 */
function callDepth(renderer: THREE.WebGPURenderer): number {
  // eslint-disable-next-line no-restricted-syntax -- no public way to it; checked by tests/render/threeNodes.test.ts
  return (renderer as unknown as Calls)._callDepth;
}

function setCallDepth(renderer: THREE.WebGPURenderer, depth: number): void {
  // eslint-disable-next-line no-restricted-syntax -- (see callDepth)
  (renderer as unknown as Calls)._callDepth = depth;
}

/** hides (into `hidden`) what is visible under `root`, but its lights, `keep`, and what holds them */
function hideAllButLights(root: THREE.Object3D, hidden: THREE.Object3D[], keep: THREE.Object3D): void {
  for (const c of root.children) {
    if (!c.visible || (c as THREE.Light).isLight || c === keep) continue;
    let held = false;
    c.traverse((x) => { held ||= (x as THREE.Light).isLight === true || x === keep; });
    if (held) hideAllButLights(c, hidden, keep);
    else hidden.push(c);
  }
}

/** The passes of the image, and what they follow from frame to frame. */
export class ImagePipeline {
  private pipeline: THREE.RenderPipeline;
  private scenePass: ShaderNode;
  private reflections: ShaderNode;
  private occlusion: ShaderNode;
  private bloom: Bloom | null = null;
  /** the room round the subject blurred; null: everything sharp */
  private dof: DepthOfField | null = null;
  private cinema: Cinema | null = null;
  /**
   * The chains built, by what they draw (see chainKey): one left and taken
   * up again finds its shaders built (three keys them by the identity of
   * their nodes: a chain built anew built them all again, a level's first
   * image every time). Left, its targets are freed.
   */
  private chains = new Map<string, Chain>();
  private chain: Chain | null = null;
  private quality: Pick<QualitySettings, 'ao' | 'ssr'> = { ao: true, ssr: true };
  private focused = false;
  /** how far past white the image goes (× white): 1 on a screen of standard range */
  private headroom = uniform(1);
  private size = new THREE.Vector2();

  constructor(private renderer: THREE.WebGPURenderer, scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    this.pipeline = new THREE.RenderPipeline(renderer);
    // tone mapping and the colour space are applied by the chain itself (see compose)
    this.pipeline.outputColorTransform = false;
    this.scenePass = pass(scene, camera);
    this.scenePass.setMRT(mrt({ output, normal: normalView, reflect: float(0) }).setBlendMode('normal', ASBLENDED).setBlendMode('reflect', ASBLENDED));
    // how deep in the renderer's calls the chain drawn draws the scene (see compile)
    const update = this.scenePass.updateBefore.bind(this.scenePass);
    this.scenePass.updateBefore = (frame: unknown) => {
      if (this.chain) this.chain.sceneDepth = callDepth(renderer);
      return update(frame);
    };
    const color = this.scenePass.getTextureNode('output');
    const normal = this.scenePass.getTextureNode('normal');
    const depth = this.scenePass.getTextureNode('depth');
    const reflect = this.scenePass.getTextureNode('reflect');
    const r = REFLECTIONS;
    this.reflections = ssr(color, depth, normal, reflect.r, float(r.roughness), camera);
    this.reflections.resolutionScale = r.resolutionScale;
    this.reflections.quality.value = r.quality;
    this.reflections.opacity.value = r.opacity;
    this.reflections.maxDistance.value = r.maxDistance;
    this.reflections.thickness.value = r.thickness;
    const gtao: ShaderNode = ao(depth, normal, camera);
    for (const [k, v] of Object.entries(AO_SETTINGS)) gtao[k].value = v;
    gtao.resolutionScale = AO_RESOLUTION;
    const smooth: ShaderNode = denoise(gtao.getTextureNode(), depth, normal, camera);
    for (const [k, v] of Object.entries(AO_DENOISE)) smooth[k].value = v;
    this.occlusion = smooth;
  }

  /** what the image draws: reflections and occlusion, or not */
  setQuality(q: Pick<QualitySettings, 'ao' | 'ssr'>): void {
    if (this.bloom && this.quality.ao === q.ao && this.quality.ssr === q.ssr) return;
    this.quality = { ao: q.ao, ssr: q.ssr };
    this.compose();
  }

  /** puts on the chain the quality and the focus ask, built once: a pass left out costs nothing */
  private compose(): void {
    const key = this.chainKey(this.focused);
    // (its targets come back as it draws again)
    if (this.chain) for (const n of this.chain.owned) freeTargets(n);
    let chain = this.chains.get(key);
    if (!chain) this.chains.set(key, chain = this.build());
    this.chain = chain;
    ({ bloom: this.bloom, dof: this.dof, cinema: this.cinema } = chain);
    this.pipeline.outputNode = chain.cinema.node;
    this.pipeline.needsUpdate = true;
  }

  /** the chain drawn with this quality, in focus or not */
  private chainKey(focused: boolean): string {
    return `${+this.quality.ao}${+this.quality.ssr}${+focused}`;
  }

  /** a chain for the quality and the focus asked */
  private build(): Chain {
    const owned: Owned[] = [];
    const own = <T extends Owned>(n: T): T => { owned.push(n); return n; };
    let image: ShaderNode = this.scenePass.getTextureNode('output');
    if (this.quality.ssr) {
      // added (the reflections come already weighed by their opacity), masked by what reflects at full
      // resolution: drawn at half of it and blurred, they bled over the edges of the cords and of the
      // equipment standing on the floor
      const reflect = this.scenePass.getTextureNode('reflect').r;
      image = vec4(image.rgb.add(this.reflections.rgb.mul(reflect)), 1);
    }
    if (this.quality.ao) image = vec4(image.rgb.mul(mix(1, this.occlusion.r, AO_BLEND)), 1);
    // drawn once, read by the depth of field or by the glow and the image (the denoising of the
    // occlusion is worked out wherever the composite is read)
    if (this.quality.ao || this.quality.ssr) image = own(frameTexture(image));
    let dof: DepthOfField | null = null;
    if (this.focused) {
      dof = new DepthOfField(image, this.scenePass.getTextureNode('depth'), this.camera);
      image = own(frameTexture(dof.node));
    }
    const bloom = own(new Bloom(image));
    const shown = toneCurve(image.rgb.add(bloom.node), this.headroom);
    const display = own(frameTexture(renderOutput(vec4(shown, 1), THREE.NoToneMapping, this.renderer.outputColorSpace)));
    // the antialiasing, on the image as shown: SMAA smooths the edges of the cords as multisampling the
    // scene did, which cost a third of the frame (every pass then read its images multisampled)
    const cinema = new Cinema(own(frameTexture(smaa(display))));
    return { owned, bloom, dof, cinema, sceneDepth: null };
  }

  /**
   * Builds the shaders `object` needs to be drawn into the scene's images.
   * Left to its first image on screen, it stalls the frames while three
   * builds them. three keys a shader by the scene's environment, its fog and
   * its lights (by identity), and by the context it is drawn in: `object` is
   * drawn into the scene's pass, as deep in the renderer's calls as the chain
   * draws it (compileAsync prepares it at the top, for another context, and
   * the image found nothing of it), and, wherever the camera looks, not
   * culled; what
   * it drew is drawn over by the next image. `o.alone`: without what else
   * the scene shows (its own lights stay); `o.litBy`: lit by these too, as
   * it will be on screen (their lights alone are drawn; it may be one of
   * their pieces); `o.focused`: for the chain in focus or not (default: the
   * one drawn), which must have drawn once. The GPU compiles its programs
   * meanwhile, apart.
   */
  compile(object: THREE.Object3D, scene: THREE.Scene, o: CompileOptions = {}): void {
    const r = this.renderer, target = r.getRenderTarget(), mrt = r.getMRT();
    // (a chain never drawn: drawn once, the image as it is)
    const chain = this.chains.get(this.chainKey(o.focused ?? this.focused));
    if (chain === this.chain && chain.sceneDepth === null) this.pipeline.render();
    const sceneDepth = chain?.sceneDepth;
    if (sceneDepth == null) return;
    // (`object` may be one piece of what lights it)
    const added = [object, ...(o.litBy ?? [])].filter((x) => !x.parent);
    if (added.length) scene.add(...added);
    const hidden = o.alone ? scene.children.filter((x) => x !== object && x.visible && !(x as THREE.Light).isLight && !o.litBy?.includes(x)) : [];
    // (one put aside, hidden, lights all the same)
    const shown = (o.litBy ?? []).filter((x) => !x.visible);
    for (const x of shown) x.visible = true;
    for (const x of o.litBy ?? []) hideAllButLights(x, hidden, object);
    for (const x of hidden) x.visible = false;
    const culled: THREE.Object3D[] = [];
    object.traverse((x) => { if (x.frustumCulled) { x.frustumCulled = false; culled.push(x); } });
    r.setRenderTarget(this.scenePass.renderTarget);
    r.setMRT(this.scenePass.getMRT());
    const depth = callDepth(r);
    setCallDepth(r, sceneDepth);
    r.render(scene, this.camera);
    setCallDepth(r, depth);
    r.setRenderTarget(target);
    r.setMRT(mrt);
    for (const x of culled) x.frustumCulled = true;
    for (const x of hidden) x.visible = true;
    for (const x of shown) x.visible = false;
    for (const x of added) scene.remove(x);
  }

  /** how far past white the image goes (× white; 1: up to white) */
  setHeadroom(headroom: number): void {
    this.headroom.value = headroom;
  }

  render(frame: ImageFrame): void {
    if (!!frame.focus !== this.focused) {
      this.focused = !!frame.focus;
      this.compose();
    }
    const ratio = this.renderer.getPixelRatio();
    this.renderer.getDrawingBufferSize(this.size);
    this.bloom!.fit(frame.viewDistance, ratio);
    if (frame.focus) this.dof!.frame(frame.focus.at, frame.focus.reach, this.size.x, this.size.y, ratio);
    this.cinema!.frame(frame.dt, window.innerWidth, window.innerHeight, frame.margins);
    this.pipeline.render();
  }

  dispose(): void {
    for (const c of this.chains.values()) for (const n of c.owned) n.dispose();
    this.pipeline.dispose();
  }
}
