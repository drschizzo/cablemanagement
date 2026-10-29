// The page's side of fall.worker.ts.

import type { CableStart } from '../cables';
import type { FallReply, FallRequest } from './fall.worker';

/** lets the mess of bay `seed` fall in a worker of its own; `onChunk` is called as it goes */
export function fallInWorker(seed: number, pairs: number | undefined, chunks: number, onChunk: () => void): Promise<{ starts: CableStart[]; x: Float64Array }> {
  return new Promise((done, fail) => {
    const worker = new Worker(new URL('./fall.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<FallReply>) => {
      if (e.data.type === 'chunk') { onChunk(); return; }
      worker.terminate();
      done(e.data);
    };
    worker.onerror = (e) => { worker.terminate(); fail(e); };
    worker.postMessage({ seed, pairs, chunks } satisfies FallRequest);
  });
}
