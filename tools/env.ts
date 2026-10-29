// The settings of a bench, read from the environment:
//   NC=48 SEEDS=1,2,3 PARAMS='{"kCapCable":2}' npm run free

declare const process: { env: Record<string, string | undefined> };

/** every variable, for the switches a single bench reads (ROWS, WHERE, TRACE…) */
export const env = process.env;

/** a number, or `fallback` when the variable is not set */
export function envNumber(name: string, fallback: number): number {
  return Number(env[name] ?? fallback);
}

/** SEEDS, a comma-separated list (`fallback` in the same form) */
export function envSeeds(fallback: string): number[] {
  return (env.SEEDS ?? fallback).split(',').map(Number);
}

/** PARAMS, solver settings as JSON, laid over the defaults */
export function envParams(): Record<string, number> {
  return JSON.parse(env.PARAMS ?? '{}');
}
