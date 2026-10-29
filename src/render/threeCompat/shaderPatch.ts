// Edits of three.js's own shaders (an attribute here, a term of the emissive
// there). They match pieces of three.js's source: if an update renames one,
// String.replace would silently do nothing, and a light would just stop
// glowing. A ShaderPatch throws instead, naming the piece it no longer finds.

export function patchShader(source: string): ShaderPatch {
  return new ShaderPatch(source);
}

export class ShaderPatch {
  constructor(readonly source: string) {}

  /** replaces the first `find`; throws if the shader no longer has it */
  replace(find: string | RegExp, replacement: string): ShaderPatch {
    // (a function: the replacement is taken as it is, its $ signs are not patterns)
    const next = this.source.replace(find, () => replacement);
    if (next === this.source) throw new Error(`shader patch: ${String(find)} not found (has three.js changed?)`);
    return new ShaderPatch(next);
  }
}
