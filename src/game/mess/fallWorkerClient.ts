// The page's side of fall.worker.ts.

import type { CableStart } from '../cables';
import type { FallReply, FallRequest } from './fall.worker';

/**
 * Lets the mess of bay `seed` fall in a worker of its own; `onChunk` is called
 * as it goes. `signal`: given up, the worker stops and the promise fails.
 */
export function fallInWorker(seed: number, pairs: number | undefined, chunks: number, onChunk: () => void, signal?: AbortSignal): Promise<{ starts: CableStart[]; x: Float64Array }> {
  return new Promise((done, fail) => {
    if (signal?.aborted) { fail(signal.reason); return; }
    const worker = new Worker(new URL('./fall.worker.ts', import.meta.url), { type: 'module' });
    signal?.addEventListener('abort', () => { worker.terminate(); fail(signal.reason); }, { once: true });
    worker.onmessage = (e: MessageEvent<FallReply>) => {
      if (e.data.type === 'chunk') { onChunk(); return; }
      worker.terminate();
      done(e.data);
    };
    worker.onerror = (e) => { worker.terminate(); fail(e); };
    worker.postMessage({ seed, pairs, chunks } satisfies FallRequest);
  });
}
