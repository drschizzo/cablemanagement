// The image, from the scene to the screen: the scene drawn once into its
// buffers (multisampled, linear HDR), then the passes that work on them.

import * as THREE from 'three/webgpu';
import { tsl } from './tsl';
import type { ScreenMargins } from './stage';

const { pass } = tsl;

/** samples a pixel when the scene is drawn: the antialiasing of the whole image */
const SAMPLES = 4;

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

/** The passes of the image, and what they follow from frame to frame. */
export class ImagePipeline {
  private pipeline: THREE.RenderPipeline;

  constructor(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.pipeline = new THREE.RenderPipeline(renderer);
    this.pipeline.outputNode = pass(scene, camera, { samples: SAMPLES });
  }

  render(_frame: ImageFrame): void {
    this.pipeline.render();
  }

  dispose(): void {
    this.pipeline.dispose();
  }
}
