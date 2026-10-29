// Code added to three.js's own material shaders (MeshStandardMaterial and the
// like): a glow per instance, a blinking LED, the light of the LEDs, the print
// on a cord's jacket. Rather than rewrite the physically based shader, the code
// goes in right after a line of three.js's source (an `#include <…>` chunk)
// and uses what three.js has computed there.
//
// That ties it to three.js's source, which no version promises to keep. So a
// patch is data: where each piece goes, and what of three.js it reads. The
// tests (tests/render/threeCompat/) apply every patch to three.js's real
// chunks under Node, and check that each anchor is there and each name it
// reads is declared before it: an update of three.js that breaks a patch fails
// a test, not the game.

import type * as THREE from 'three';
import { patchShader } from './shaderPatch';

export interface ShaderInsert {
  /** the line of three.js's shader the code goes right after, e.g. '#include <emissivemap_fragment>' */
  after: string;
  code: string;
  /**
   * The names of three.js the code reads or writes (a local of main, a
   * varying, a uniform of the program): each must be declared by then.
   */
  uses?: string[];
}

export interface MaterialPatch {
  /** added to the key of the compiled program: two materials share a program only with the same patches */
  key: string;
  vertex: ShaderInsert[];
  fragment: ShaderInsert[];
}

export interface ShaderSources {
  vertexShader: string;
  fragmentShader: string;
}

/** the sources with the patch applied (pure: the tests run it under Node) */
export function applyPatch(sources: ShaderSources, patch: MaterialPatch): ShaderSources {
  const apply = (source: string, inserts: ShaderInsert[]) =>
    inserts.reduce((s, i) => s.replace(i.after, `${i.after}\n${i.code}`), patchShader(source)).source;
  return { vertexShader: apply(sources.vertexShader, patch.vertex), fragmentShader: apply(sources.fragmentShader, patch.fragment) };
}

/**
 * Makes `m` compile with `patch`, on top of what it already had (its own
 * onBeforeCompile runs first, and its program key is kept): patches pile up.
 * `uniforms`: the patch's uniforms, asked for when the program is built.
 */
export function patchMaterial<T extends THREE.Material>(m: T, patch: MaterialPatch, uniforms: () => Record<string, THREE.IUniform> = () => ({})): T {
  const previous = m.onBeforeCompile.bind(m);
  const previousKey = m.customProgramCacheKey();
  m.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    Object.assign(shader.uniforms, uniforms());
    const patched = applyPatch(shader, patch);
    shader.vertexShader = patched.vertexShader;
    shader.fragmentShader = patched.fragmentShader;
  };
  m.customProgramCacheKey = () => `${previousKey}-${patch.key}`;
  m.needsUpdate = true;
  return m;
}
