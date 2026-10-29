import { describe, expect, it } from 'vitest';
import { patchShader } from '../../../src/render/threeCompat/shaderPatch';

describe('a shader patch', () => {
  it('applies its edits in order', () => {
    const out = patchShader('#include <common>\nvoid main() {}').replace('#include <common>', '#include <common>\nvarying vec3 vTint;').source;
    expect(out).toBe('#include <common>\nvarying vec3 vTint;\nvoid main() {}');
  });

  it('fails loudly when three.js no longer has the piece it edits', () => {
    expect(() => patchShader('void main() {}').replace('#include <common>', 'x')).toThrow(/#include <common> not found/);
  });
});
