import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TubeMesh, TubeNodes, TubeSync, swept } from 'three-cable-tubes';
import * as GPU from 'three-cable-tubes/webgpu';
import { MeshStandardNodeMaterial } from 'three/webgpu';

// The tubes without a GPU: what they send it (the node map) and the shader they make.

/** texel t of the node map (4 floats) */
function texel(nodes: TubeNodes, t: number): number[] {
  const d = nodes.texture.image.data as Float32Array;
  return [...d.slice(4 * t, 4 * t + 4)];
}

/** the vertex shader a material is compiled with, from a bare one */
function vertexOf(m: THREE.Material): string {
  const s = { uniforms: {}, vertexShader: 'void main() {\n}', fragmentShader: '' } as unknown as THREE.WebGLProgramParametersWithUniforms;
  m.onBeforeCompile(s, {} as THREE.WebGLRenderer);
  return s.vertexShader;
}

describe('tubes', () => {
  it('a node takes the radius of its tube, one for all or one per node', () => {
    const x = [0, 0, 0, 1, 0, 0, 2, 0, 0];
    const nodes = new TubeNodes(3);
    nodes.write(x, 0, 3, 0.01);
    expect(texel(nodes, 3)).toEqual([1, 0, 0, 0.01].map((v) => expect.closeTo(v, 6)));
    nodes.write(x, 0, 3, [0.01, 0.02, 0.03]);
    expect(texel(nodes, 3 * 2)[3]).toBeCloseTo(0.03);
    expect(nodes.radius).toBeCloseTo(0.03);
    // the frame's normal is square to the cord
    const nrm = texel(nodes, 3 * 1 + 1);
    expect(nrm[0]).toBeCloseTo(0);
    expect(Math.hypot(nrm[0], nrm[1], nrm[2])).toBeCloseTo(1);
  });

  it('only the cables that moved are written again', () => {
    const nodes = new TubeNodes(4);
    const src = { x: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]), cables: [{ start: 0, count: 2, asleep: false }, { start: 2, count: 2, asleep: true }] };
    const sync = new TubeSync(nodes, 0.01);
    expect(sync.cable(src, 0)).toBe(true);
    expect(sync.cable(src, 1)).toBe(true);
    // asleep and still: skipped; awake: written; asleep but moved, or forced: written
    expect(sync.cable(src, 1)).toBe(false);
    expect(sync.cable(src, 0)).toBe(true);
    src.x[3 * 3 + 2] = 0.5;
    expect(sync.cable(src, 1)).toBe(true);
    expect(sync.cable(src, 1)).toBe(false);
    expect(sync.cable(src, 1, true)).toBe(true);
  });

  it('the shader follows the options, and names its values as asked', () => {
    const nodes = new TubeNodes(2);
    const def = vertexOf(swept(new THREE.MeshBasicMaterial(), nodes));
    expect(def).toContain('vec4 tubeCoord');
    expect(def).toContain('vec3 tubeTint');
    expect(def).toContain('float(tK) / 8.0');
    const own = vertexOf(swept(new THREE.MeshBasicMaterial(), nodes, { radial: 8, sub: 4, aliases: { glow: 'tubeTint' } }));
    expect(own).toContain('float(tK) / 4.0');
    expect(own).toContain(`float(tR) * ${(Math.PI / 4).toFixed(8)}`);
    expect(own).toContain('#define glow tubeTint');
    // a program of its own
    const a = swept(new THREE.MeshBasicMaterial(), nodes), b = swept(new THREE.MeshBasicMaterial(), nodes, { sub: 4 });
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
  });

  it('a mesh lays one instance per segment, with the rings its options ask for', () => {
    const nodes = new TubeNodes(5);
    const mesh = new TubeMesh(4, new THREE.MeshBasicMaterial(), nodes, { radial: 8, sub: 4 });
    expect(mesh.geometry.getAttribute('normal').count).toBe((4 + 1) * 8);
    mesh.lay(0, 0, 5, new THREE.Color(1, 0, 0), 0.5, 0.025, 2);
    const arc = mesh.geometry.getAttribute('tubeArc');
    expect([arc.getX(3), arc.getY(3), arc.getZ(3)]).toEqual([0.575, 0.025, 2].map((v) => expect.closeTo(v, 6)));
    mesh.dispose();
  });

  it('the WebGPU mesh sweeps its node material, with the same rings and segments', () => {
    const nodes = new GPU.TubeNodes(5);
    const material = new MeshStandardNodeMaterial();
    const mesh = new GPU.TubeMesh(4, material, nodes, { radial: 8, sub: 4 });
    expect(material.positionNode).not.toBeNull();
    expect(mesh.geometry.getAttribute('normal').count).toBe((4 + 1) * 8);
    expect(mesh.geometry.instanceCount).toBe(4);
    mesh.lay(0, 0, 5, new THREE.Color(1, 0, 0), 0, 0.025, 1);
    expect(mesh.geometry.getAttribute('tubeSeg').getZ(2)).toBe(4);
    // the coarser lists: a quarter, a sixteenth of the triangles
    const counts = [0, 1, 2].map((l) => { (mesh as unknown as { lod(l: number): void }).lod(l); return mesh.geometry.index!.count; });
    expect(counts).toEqual([counts[0], counts[0] / 4, counts[0] / 16]);
    mesh.dispose();
  });
});
