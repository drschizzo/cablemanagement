// What the game takes from three.js beyond its stable API, checked against the
// version installed, under Node (no GPU): the internals of the post-processing
// passes. After `npm install three@<next>`, this file says what moved, and
// where (docs/mise-a-jour-three.md).
import { describe, expect, it } from 'vitest';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { LuminosityHighPassShader } from 'three/examples/jsm/shaders/LuminosityHighPassShader.js';
import { SSRShader } from 'three/examples/jsm/shaders/SSRShader.js';
import { AO_DENOISE, AO_SETTINGS, guardedHighPass, maskedCopy } from '../../../src/render/threeCompat/passes';

describe('the post-processing passes (render/threeCompat/passes.ts)', () => {
  it('SSRPass: the fields and the private method ReflectionPass uses', () => {
    expect(typeof (SSRPass.prototype as unknown as Record<string, unknown>)._renderPass).toBe('function');
    const source = SSRPass.toString();
    for (const field of ['beautyRenderTarget', 'metalnessRenderTarget', 'blurRenderTarget2', 'copyMaterial', 'ssrMaterial', 'resolutionScale', 'thickness']) {
      expect(source, field).toContain(`this.${field}`);
    }
    expect(Object.keys(SSRShader.uniforms)).toEqual(expect.arrayContaining(['cameraProjectionMatrix', 'cameraInverseProjectionMatrix']));
  });

  it('SSRPass: its copy shader still takes the mask of the floor', () => {
    expect(() => maskedCopy(CopyShader.fragmentShader)).not.toThrow();
  });

  it('UnrealBloomPass: its bright pass takes the guard, and its mip weights are where BloomPass sets them', () => {
    expect(() => guardedHighPass(LuminosityHighPassShader.fragmentShader)).not.toThrow();
    const source = UnrealBloomPass.toString();
    for (const field of ['nMips', 'compositeMaterial', 'materialHighPassFilter', 'bloomFactors']) expect(source, field).toContain(field);
  });

  it('GTAOPass: it still reads every setting it is given', () => {
    const gtao = GTAOPass.prototype.updateGtaoMaterial.toString(), denoise = GTAOPass.prototype.updatePdMaterial.toString();
    for (const key of Object.keys(AO_SETTINGS)) expect(gtao, key).toContain(key);
    for (const key of Object.keys(AO_DENOISE)) expect(denoise, key).toContain(key);
    expect(GTAOPass.toString()).toContain('blendIntensity');
  });

  it('SSRPass and GTAOPass: the scene drawn in their own materials goes through the methods the passes override', () => {
    const own = (pass: { prototype: object }, name: string) => (pass.prototype as Record<string, unknown>)[name];
    expect(typeof own(SSRPass, '_renderOverride')).toBe('function');
    expect(typeof own(SSRPass, '_renderMetalness')).toBe('function');
    expect(typeof own(GTAOPass, '_renderOverride')).toBe('function');
    expect(SSRPass.prototype.render.toString()).toContain('this._renderOverride( renderer, this.normalMaterial');
    expect(SSRPass.prototype.render.toString()).toContain('this._renderMetalness(');
    expect(GTAOPass.prototype.render.toString()).toContain('this._renderOverride( renderer, this.normalMaterial');
  });
});
