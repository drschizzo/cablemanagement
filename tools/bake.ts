// Bakes the mess of the aisle the title screen opens on (SHOWCASE_DEFAULT): lets
// each bay fall as the demo does, and writes where its nodes came to rest, with
// the print of where they started (see src/game/baked.ts).
//   npm run bake
// To run again whenever the layout of the mess, the physics or SHOWCASE_DEFAULT
// change: until then, the bays whose print no longer matches fall on load.
declare const process: { argv: string[] };
import { World } from '../src/game/world';
import { SHOWCASE_DEFAULT, SHOWCASE_SETTLE, showcaseRack } from '../src/game/levels';
import { encode, printOf, type BakedBay } from '../src/game/baked';

const BAKED_FILE = 'src/game/showcase.bin';

// (Node's own modules, untyped here: the project has no Node types)
const node = (m: string) => import(m);
const { writeFileSync } = await node('node:fs');
const { gzipSync } = await node('node:zlib');

const { bays, pairs, seed } = SHOWCASE_DEFAULT;
const out: BakedBay[] = [];
const t0 = performance.now();
for (let k = 0; k < bays; k++) {
  const w = new World(showcaseRack('mess', seed + k, pairs));
  const print = printOf(w.sim.x);
  Object.assign(w.sim.P, SHOWCASE_SETTLE.solver);
  // as Closet.settle() does it: in chunks of frames, each run at once
  const chunks = 5;
  for (let c = 0; c < chunks; c++) await w.sim.settle(Math.ceil(SHOWCASE_SETTLE.frames / chunks));
  out.push({ print, x: Float64Array.from(w.sim.x) });
  w.dispose();
}
const bytes = gzipSync(encode(out), { level: 9 });
writeFileSync(process.argv[2] ?? BAKED_FILE, bytes);
console.log(`${bays} bays, ${out.reduce((a, b) => a + b.x.length / 3, 0)} nodes, ${(bytes.length / 1024).toFixed(0)} KB, in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
