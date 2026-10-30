// The image, from the scene to the screen: the scene drawn once into its
// buffers (multisampled, linear HDR: its colour, the normals, the depth, what
// reflects), then the passes that work on them: reflections on the floor,
// ambient occlusion, the glow of the lights, tone mapping.

import * as THREE from 'three/webgpu';
import { ssr } from 'three/examples/jsm/tsl/display/SSRNode.js';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { denoise } from 'three/examples/jsm/tsl/display/DenoiseNode.js';
import { Bloom } from './bloom';
import { tsl, type ShaderNode } from './tsl';
import type { ScreenMargins } from './stage';
import type { QualitySettings } from './quality';

const { float, mix, mrt, normalView, output, pass, renderOutput, vec4 } = tsl;

/** samples a pixel when the scene is drawn: the antialiasing of the whole image */
const SAMPLES = 4;

/**
 * The reflections of the floor: a polished vinyl, faint and a little blurred.
 * `thickness` (m): at 2 cm, every ray passing under a cord took its colour and
 * the reflection smeared into a ribbon.
 */
const REFLECTIONS = { resolutionScale: 0.5, opacity: 0.2, maxDistance: 0.5, thickness: 0.003, roughness: 0.3 };

/**
 * Ambient occlusion. `radius` (m): a short reach darkens the corners, the
 * ports and under the cords; longer, a tangle of cords goes muddy and loses its
 * colours. 8 samples look the same as 16 once denoised, for less of the frame.
 */
const AO_SETTINGS = { radius: 0.03, distanceExponent: 1.5, thickness: 0.3, scale: 1, samples: 8 };
const AO_DENOISE = { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6 };
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
  private quality: Pick<QualitySettings, 'ao' | 'ssr'> | null = null;

  constructor(private renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.pipeline = new THREE.RenderPipeline(renderer);
    // tone mapping and the colour space are applied by the chain itself (see compose)
    this.pipeline.outputColorTransform = false;
    this.scenePass = pass(scene, camera, { samples: SAMPLES });
    this.scenePass.setMRT(mrt({ output, normal: normalView, reflect: float(0) }));
    const color = this.scenePass.getTextureNode('output');
    const normal = this.scenePass.getTextureNode('normal');
    const depth = this.scenePass.getTextureNode('depth');
    const reflect = this.scenePass.getTextureNode('reflect');
    const r = REFLECTIONS;
    this.reflections = ssr(color, depth, normal, reflect.r, float(r.roughness), camera);
    this.reflections.resolutionScale = r.resolutionScale;
    this.reflections.opacity.value = r.opacity;
    this.reflections.maxDistance.value = r.maxDistance;
    this.reflections.thickness.value = r.thickness;
    const gtao: ShaderNode = ao(depth, normal, camera);
    for (const [k, v] of Object.entries(AO_SETTINGS)) gtao[k].value = v;
    const smooth: ShaderNode = denoise(gtao.getTextureNode(), depth, normal, camera);
    for (const [k, v] of Object.entries(AO_DENOISE)) smooth[k].value = v;
    this.occlusion = smooth;
  }

  /** what the image draws: reflections and occlusion, or not */
  setQuality(q: Pick<QualitySettings, 'ao' | 'ssr'>): void {
    if (this.quality && this.quality.ao === q.ao && this.quality.ssr === q.ssr) return;
    this.quality = { ao: q.ao, ssr: q.ssr };
    this.pipeline.outputNode = this.compose();
    this.pipeline.needsUpdate = true;
  }

  /** the chain, as the quality asks: a pass left out costs nothing */
  private compose(): ShaderNode {
    let image: ShaderNode = this.scenePass.getTextureNode('output');
    if (this.quality!.ssr) {
      // added (the reflections come already weighed by their opacity), masked by what reflects at full
      // resolution: drawn at half of it and blurred, they bled over the edges of the cords and of the
      // equipment standing on the floor
      const reflect = this.scenePass.getTextureNode('reflect').r;
      image = vec4(image.rgb.add(this.reflections.rgb.mul(reflect)), 1);
    }
    if (this.quality!.ao) image = vec4(image.rgb.mul(mix(1, this.occlusion.r, AO_BLEND)), 1);
    this.bloom?.dispose();
    this.bloom = new Bloom(image);
    return renderOutput(vec4(image.rgb.add(this.bloom.node), 1));
  }

  render(frame: ImageFrame): void {
    this.bloom!.fit(frame.viewDistance, this.renderer.getPixelRatio());
    this.pipeline.render();
  }

  dispose(): void {
    this.bloom?.dispose();
    this.pipeline.dispose();
  }
}
