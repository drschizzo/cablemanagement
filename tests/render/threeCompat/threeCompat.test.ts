// What the game takes from three.js beyond its stable API, checked against the
// version installed, under Node (no GPU): every shader patch on three.js's real
// chunks, the internals of the post-processing passes, the renderer's
// behaviours three-cable-tubes relies on. After `npm install three@<next>`,
// this file says what moved, and where (docs/mise-a-jour-three.md).
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { LuminosityHighPassShader } from 'three/examples/jsm/shaders/LuminosityHighPassShader.js';
import { SSRShader } from 'three/examples/jsm/shaders/SSRShader.js';
import { applyPatch, type MaterialPatch, type ShaderInsert } from '../../../src/render/threeCompat/materialPatch';
import { AO_DENOISE, AO_SETTINGS, guardedHighPass, maskedCopy } from '../../../src/render/threeCompat/passes';
import { TINT_PATCH } from '../../../src/render/batch';
import { BLINK_PATCH } from '../../../src/render/leds';
import { LED_LIT_PATCH } from '../../../src/render/ledGlow';
import { JACKET_PATCH } from '../../../src/render/jacket';

// (Node's own module, untyped here: the project has no Node types)
const node = (m: string) => import(m);
async function threeSource(path: string): Promise<string> {
  const { readFileSync }: { readFileSync(p: string, e: 'utf8'): string } = await node('node:fs');
  return readFileSync(`node_modules/three/${path}`, 'utf8');
}

/** a shader with its `#include <…>` replaced by three.js's chunks, as the renderer does */
function expand(source: string): string {
  return source.replace(/#include <(\w+)>/g, (_, name: string) => {
    const chunk = (THREE.ShaderChunk as Record<string, string>)[name];
    if (chunk === undefined) throw new Error(`three.js has no chunk ${name}`);
    return expand(chunk);
  });
}

const declares = (text: string, name: string) => new RegExp(`\\b${name}\\b`).test(text);

/**
 * Each name an insert uses must be declared by three.js before it runs: in
 * the shader up to (and with) the line it goes after, or among the uniforms
 * and attributes the renderer puts before every program (WebGLProgram).
 */
function undeclared(source: string, insert: ShaderInsert, programPrefix: string): string[] {
  const at = source.indexOf(insert.after);
  const before = expand(source.slice(0, at + insert.after.length));
  const builtin = (name: string) => new RegExp(`(uniform|attribute)\\s+\\w+\\s+${name}\\s*;`).test(programPrefix);
  return (insert.uses ?? []).filter((name) => !declares(before, name) && !builtin(name));
}

const MATERIAL_PATCHES: [string, MaterialPatch][] = [
  ['TINT_PATCH (batch.ts)', TINT_PATCH],
  ['BLINK_PATCH (leds.ts)', BLINK_PATCH],
  ['LED_LIT_PATCH (ledGlow.ts)', LED_LIT_PATCH],
  ['JACKET_PATCH (jacket.ts)', JACKET_PATCH],
];

describe('the patches of MeshStandardMaterial', () => {
  const standard = THREE.ShaderLib.standard;

  for (const [name, patch] of MATERIAL_PATCHES) {
    it(`${name}: every anchor is in three.js's shader`, () => {
      expect(() => applyPatch(standard, patch)).not.toThrow();
    });

    it(`${name}: every name it uses is declared before it`, async () => {
      const prefix = await threeSource('src/renderers/webgl/WebGLProgram.js');
      const missing = [
        ...patch.vertex.flatMap((i) => undeclared(standard.vertexShader, i, prefix).map((n) => `vertex, after ${i.after}: ${n}`)),
        ...patch.fragment.flatMap((i) => undeclared(standard.fragmentShader, i, prefix).map((n) => `fragment, after ${i.after}: ${n}`)),
      ];
      expect(missing).toEqual([]);
    });
  }
});

describe('what three-cable-tubes relies on (vendor/cable-kit)', () => {
  it('builds its tube at the start of main(), in every shader a tube is drawn with', () => {
    const lib = THREE.ShaderLib as Record<string, { vertexShader: string }>;
    // the image, the shadows (depth, distance) and the normals the reflections and the occlusion draw
    for (const shader of ['standard', 'depth', 'distance' in lib ? 'distance' : 'distanceRGBA', 'normal']) {
      expect(lib[shader]?.vertexShader, shader).toContain('void main() {');
    }
  });

  it('takes over `position` and `normal` by #define: three.js must read them by these names', () => {
    expect(THREE.ShaderChunk.begin_vertex).toContain('vec3 transformed = vec3( position );');
    expect(THREE.ShaderChunk.beginnormal_vertex).toContain('vec3 objectNormal = vec3( normal );');
  });

  it('follows the passes\' override material through Material.allowOverride and Object3D.onBeforeShadow', async () => {
    expect(new THREE.MeshBasicMaterial().allowOverride).toBe(true);
    expect(typeof new THREE.Mesh().onBeforeShadow).toBe('function');
    expect(await threeSource('src/renderers/WebGLRenderer.js')).toMatch(/allowOverride === true && overrideMaterial !== null/);
  });
});

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
});
