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
 * must blend additively and write no depth.)
 */
export function keepOutOfDepth<T extends THREE.NodeMaterial>(m: T): T {
  m.mrtNode = mrt({ normal: vec4(0), reflect: float(0) });
  return m;
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
  /** the nodes of the chain that hold targets of their own, freed when it is built again */
  private owned: { dispose(): void }[] = [];
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
    this.scenePass.setMRT(mrt({ output, normal: normalView, reflect: float(0) }));
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

  /** (re)builds the chain, as the quality and the focus ask: a pass left out costs nothing */
  private compose(): void {
    for (const n of this.owned) n.dispose();
    const own = <T extends { dispose(): void }>(n: T): T => { this.owned.push(n); return n; };
    this.owned = [];
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
    this.dof = null;
    if (this.focused) {
      this.dof = new DepthOfField(image, this.scenePass.getTextureNode('depth'), this.camera);
      image = own(frameTexture(this.dof.node));
    }
    this.bloom = own(new Bloom(image));
    const shown = toneCurve(image.rgb.add(this.bloom.node), this.headroom);
    const display = own(frameTexture(renderOutput(vec4(shown, 1), THREE.NoToneMapping, this.renderer.outputColorSpace)));
    // the antialiasing, on the image as shown: SMAA smooths the edges of the cords as multisampling the
    // scene did, which cost a third of the frame (every pass then read its images multisampled)
    this.cinema = new Cinema(own(frameTexture(smaa(display))));
    this.pipeline.outputNode = this.cinema.node;
    this.pipeline.needsUpdate = true;
  }

  /**
   * Compiles, in the background, what `object` needs to be drawn into the
   * scene's images, and resolves once it is ready. Drawn for the first time
   * instead, it stalls the frames while the GPU compiles: three gives each
   * instanced mesh a shader of its own, and a cabinet has dozens.
   */
  compile(object: THREE.Object3D, scene: THREE.Scene): Promise<void> {
    const r = this.renderer, target = r.getRenderTarget(), mrt = r.getMRT();
    r.setRenderTarget(this.scenePass.renderTarget);
    r.setMRT(this.scenePass.getMRT());
    // (the work is set out at once, only its end is awaited: the renderer goes back to its state now)
    const ready = r.compileAsync(object, this.camera, scene);
    r.setRenderTarget(target);
    r.setMRT(mrt);
    return ready;
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
    for (const n of this.owned) n.dispose();
    this.pipeline.dispose();
  }
}
