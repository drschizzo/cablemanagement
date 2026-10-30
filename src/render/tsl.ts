// three.js's shading language (TSL), as the game's node materials and passes
// write it. Its types reject the mixes of int and float, vec3 and float, a
// shader is made of (three-cable-tubes says the same): the nodes are typed
// loosely here, once, and checked when the shader compiles.

import * as TSL from 'three/tsl';

/** a node of TSL (a value of the shader, in any stage) */
export type ShaderNode = any;

/** the functions of TSL, loosely typed (see above) */
export const tsl = TSL as Record<keyof typeof TSL, any>;
