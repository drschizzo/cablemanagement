// The nodes of three.js the image is built from (examples/jsm/tsl/display), and
// the settings the game gives them by name, checked against the version
// installed: a setting renamed or gone fails here rather than going silently
// unread (docs/mise-a-jour-three.md).
import { describe, expect, it } from 'vitest';
import SSRNode from 'three/examples/jsm/tsl/display/SSRNode.js';
import GTAONode from 'three/examples/jsm/tsl/display/GTAONode.js';
import DenoiseNode from 'three/examples/jsm/tsl/display/DenoiseNode.js';
import GaussianBlurNode from 'three/examples/jsm/tsl/display/GaussianBlurNode.js';
import Renderer from 'three/src/renderers/common/Renderer.js';
import { AO_DENOISE, AO_SETTINGS, REFLECTIONS } from '../../src/render/imagePipeline';

const source = (node: { toString(): string }) => node.toString();

describe('the nodes of the image (render/imagePipeline.ts, render/bloom.ts)', () => {
  it('SSRNode: reads each setting of the reflections (the roughness is given when it is made)', () => {
    const { roughness: _, ...settings } = REFLECTIONS;
    for (const key of Object.keys(settings)) expect(source(SSRNode), key).toContain(`this.${key} =`);
  });

  it('GTAONode and DenoiseNode: read each setting of the occlusion', () => {
    for (const key of Object.keys(AO_SETTINGS)) expect(source(GTAONode), key).toContain(`this.${key} = uniform(`);
    expect(source(GTAONode)).toContain('this.resolutionScale =');
    for (const key of Object.keys(AO_DENOISE)) expect(source(DenoiseNode), key).toContain(`this.${key} = uniform(`);
  });

  it('GaussianBlurNode: blurs at a share of the resolution of its input', () => {
    expect(source(GaussianBlurNode)).toContain('this.resolutionScale = options.resolutionScale');
  });
});

describe('the depth of the renderer\'s calls (render/imagePipeline.ts, compile)', () => {
  it('keys the context a scene is drawn in by _callDepth, which render() counts', () => {
    expect(source(Renderer)).toContain('this._callDepth ++;');
    expect(source(Renderer)).toContain('this._renderContexts.get( renderTarget, this._mrt, this._callDepth )');
  });
});
